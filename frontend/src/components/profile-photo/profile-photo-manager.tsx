"use client";

import Cropper, { Area } from "react-easy-crop";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SwitchCamera } from "lucide-react";

import { ActionNotices } from "@/components/ui/list-page-chrome";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { API_URL } from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  attachCameraPreview,
  canOfferCameraSwitch,
  isCameraDenied,
  listVideoInputs,
  openCamera,
  stopMediaStream,
  switchCamera,
  type CameraFacing,
} from "@/lib/camera-capture";
import "react-easy-crop/react-easy-crop.css";

import { checkFaceOnCrop } from "@/lib/face-landmarker";
import {
  FACE_CHECK_DEBOUNCE_MS,
  progressBarPercent as faceProgressBarPercent,
  type FaceCheckOutcome,
  type FaceCheckProgress,
  type FaceHint,
} from "@/lib/face-check";
import { getLicensePhotoBackgroundColor } from "@/lib/license-photo-background";
import { MEMBER_PHOTO_ASPECT, MEMBER_PHOTO_HEIGHT, MEMBER_PHOTO_WIDTH, memberPhotoAspectRatio } from "@/lib/member-photo-frame";
import {
  LICENSE_PHOTO_BACKGROUND_DEFAULT,
  matchCropAspect,
  normalizePhotoFile,
  progressBarPercent,
  rasterForPrintFrame,
  rasterFromBlob,
  removeProfileBackground,
  type PhotoBackgroundProgress,
  type PhotoRaster,
} from "@/lib/photo-background";

const OUTPUT_WIDTH = MEMBER_PHOTO_WIDTH;
const OUTPUT_HEIGHT = MEMBER_PHOTO_HEIGHT;

export type ProfilePhotoUploadPayload = {
  processedImage: File;
  originalImage?: File;
  photoEditMetadata?: Record<string, unknown>;
  photoConsentConfirmed: boolean;
};

type ProfilePhotoManagerLabels = {
  sectionTitle: string;
  sectionSubtitle: string;
  changeButton: string;
  removeButton: string;
  downloadButton: string;
  modalTitle: string;
  modalDescription: string;
  dragDropLabel: string;
  selectFileButton: string;
  cameraButton: string;
  cameraCaptureButton?: string;
  cameraCancelButton?: string;
  cameraStarting?: string;
  cameraUnavailable?: string;
  cameraPermissionDenied?: string;
  cameraStartError?: string;
  cameraSwitchButton?: string;
  cameraSwitchError?: string;
  zoomLabel: string;
  backgroundColorLabel: string;
  removeBackgroundButton: string;
  removeBackgroundBusy: string;
  removeBackgroundDownload: string;
  removeBackgroundPrepare: string;
  removeBackgroundPerson: string;
  removeBackgroundEdges: string;
  removeBackgroundColour: string;
  removeBackgroundFailed: string;
  faceCheckDownload: string;
  faceCheckPrepare: string;
  faceCheckFind: string;
  faceCheckLight: string;
  faceCheckPass: string;
  faceCheckNone: string;
  faceCheckMany: string;
  faceCheckPose: string;
  faceCheckSize: string;
  faceCheckDark: string;
  faceCheckBright: string;
  faceCheckBlur: string;
  faceCheckSkipped: string;
  consentLabel: string;
  saveButton: string;
  saveBusy: string;
  cancelButton: string;
  previewTitle: string;
  currentPhotoAlt: string;
  emptyPhotoLabel: string;
  removeBackgroundUnsupported: string;
};

type ProfilePhotoManagerProps = {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  labels: ProfilePhotoManagerLabels;
  onSave?: (input: ProfilePhotoUploadPayload) => Promise<void>;
  onDelete?: () => Promise<void>;
  onDownload?: () => Promise<void>;
  onEdit?: () => void;
  readOnly?: boolean;
  isPageEditor?: boolean;
  onCancelEditor?: () => void;
  /** Increment to scroll the editor into view and open the file picker. */
  openPickerRequest?: number;
  /** Rear camera when photographing someone else. Front camera for a self photo. */
  cameraFacing?: CameraFacing;
};

function resolveImageRequestUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl, API_URL).toString();
  } catch {
    return rawUrl;
  }
}

async function fetchAuthenticatedImageBlob(url: string, signal?: AbortSignal): Promise<Blob | null> {
  const token = getToken();
  const response = await fetch(resolveImageRequestUrl(url), {
    method: "GET",
    signal,
    headers: token ? { Authorization: `Token ${token}` } : undefined,
  });
  if (!response.ok) {
    return null;
  }
  return response.blob();
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for processing."));
    image.src = source;
  });
}

function fileFromRaster(raster: PhotoRaster, backgroundColor: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize image canvas.");
  }
  const pixels = document.createElement("canvas");
  pixels.width = raster.width;
  pixels.height = raster.height;
  const pixelContext = pixels.getContext("2d");
  if (!pixelContext) {
    throw new Error("Unable to initialize image canvas.");
  }
  const image = pixelContext.createImageData(raster.width, raster.height);
  image.data.set(raster.data);
  pixelContext.putImageData(image, 0, 0);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, raster.width, raster.height);
  context.drawImage(pixels, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to create cropped image output."));
          return;
        }
        resolve(new File([blob], `profile-picture-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  });
}

async function renderPrintReadyImage(
  imageSource: string,
  cropArea: Area,
  backgroundColor: string
): Promise<File> {
  try {
    const response = await fetch(imageSource);
    if (response.ok) {
      const oriented = await rasterFromBlob(await response.blob());
      const printed = rasterForPrintFrame(oriented, cropArea, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      return fileFromRaster(printed, backgroundColor);
    }
  } catch {
    // The canvas path below still refuses to stretch a crop into the print frame.
  }

  const image = await loadImage(imageSource);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize image canvas.");
  }

  const matched = matchCropAspect(cropArea, OUTPUT_WIDTH / OUTPUT_HEIGHT);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  context.drawImage(
    image,
    matched.x,
    matched.y,
    matched.width,
    matched.height,
    0,
    0,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT
  );

  const outputBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to create cropped image output."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.92
    );
  });

  return new File([outputBlob], `profile-picture-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}

export function ProfilePhotoManager({
  imageUrl,
  thumbnailUrl,
  labels,
  onSave,
  onDelete,
  onDownload,
  onEdit,
  readOnly = false,
  isPageEditor = false,
  onCancelEditor,
  cameraFacing = "environment",
  openPickerRequest = 0,
}: ProfilePhotoManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [removalProgress, setRemovalProgress] = useState<PhotoBackgroundProgress | null>(null);
  const [faceOutcome, setFaceOutcome] = useState<FaceCheckOutcome | null>(null);
  const [faceProgress, setFaceProgress] = useState<FaceCheckProgress | null>(null);
  const faceRequestRef = useRef(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [workingImageUrl, setWorkingImageUrl] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [storedPhotoPreviewUrl, setStoredPhotoPreviewUrl] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState(LICENSE_PHOTO_BACKGROUND_DEFAULT);
  const backgroundColorRef = useRef(LICENSE_PHOTO_BACKGROUND_DEFAULT);
  const [backgroundRemoved, setBackgroundRemoved] = useState(false);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [cameraGeneration, setCameraGeneration] = useState(0);

  const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const stopCamera = useCallback(() => {
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
    setIsStartingCamera(false);
    setCanSwitchCamera(false);
  }, []);

  const rootRef = useRef<HTMLElement | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<CameraFacing>(cameraFacing);
  const workingObjectUrlRef = useRef<string | null>(null);
  const hydrateGenerationRef = useRef(0);
  const previewObjectUrlRef = useRef<string | null>(null);
  const storedPhotoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
      if (workingObjectUrlRef.current) {
        URL.revokeObjectURL(workingObjectUrlRef.current);
      }
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
      if (storedPhotoObjectUrlRef.current) {
        URL.revokeObjectURL(storedPhotoObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen && !isPageEditor) {
      return;
    }
    let cancelled = false;
    getLicensePhotoBackgroundColor()
      .then((color) => {
        if (cancelled) {
          return;
        }
        backgroundColorRef.current = color;
        setBackgroundColor(color);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        backgroundColorRef.current = LICENSE_PHOTO_BACKGROUND_DEFAULT;
        setBackgroundColor(LICENSE_PHOTO_BACKGROUND_DEFAULT);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isPageEditor]);

  useEffect(() => {
    if (!openPickerRequest) {
      return;
    }
    if (typeof rootRef.current?.scrollIntoView === "function") {
      rootRef.current.scrollIntoView({ block: "start" });
    }
    sourceInputRef.current?.click();
  }, [openPickerRequest]);

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !cameraStreamRef.current) {
      return;
    }
    videoRef.current.srcObject = cameraStreamRef.current;
    void attachCameraPreview(videoRef.current, cameraStreamRef.current).catch(() => {
      setErrorMessage(labels.cameraStartError ?? "Unable to start the camera.");
    });
  }, [cameraGeneration, isCameraOpen, labels.cameraStartError]);

  useEffect(() => {
    const sources = [thumbnailUrl, imageUrl]
      .map((value) => (value ?? "").trim())
      .filter((value) => value.length > 0);

    if (sources.length === 0) {
      if (storedPhotoObjectUrlRef.current) {
        URL.revokeObjectURL(storedPhotoObjectUrlRef.current);
        storedPhotoObjectUrlRef.current = null;
      }
      setStoredPhotoPreviewUrl(null);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    if (storedPhotoObjectUrlRef.current) {
      URL.revokeObjectURL(storedPhotoObjectUrlRef.current);
      storedPhotoObjectUrlRef.current = null;
    }
    setStoredPhotoPreviewUrl(null);

    const loadStoredPhoto = async () => {
      for (const source of sources) {
        try {
          const blob = await fetchAuthenticatedImageBlob(source, controller.signal);
          if (!blob) {
            continue;
          }
          const objectUrl = URL.createObjectURL(blob);
          if (isCancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          if (storedPhotoObjectUrlRef.current) {
            URL.revokeObjectURL(storedPhotoObjectUrlRef.current);
          }
          storedPhotoObjectUrlRef.current = objectUrl;
          setStoredPhotoPreviewUrl(objectUrl);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }

      if (isCancelled) {
        return;
      }
      if (storedPhotoObjectUrlRef.current) {
        URL.revokeObjectURL(storedPhotoObjectUrlRef.current);
        storedPhotoObjectUrlRef.current = null;
      }
      setStoredPhotoPreviewUrl(null);
    };

    void loadStoredPhoto();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [imageUrl, thumbnailUrl]);

  const hasStoredPhoto = useMemo(() => Boolean(imageUrl || thumbnailUrl), [imageUrl, thumbnailUrl]);

  const setWorkingPreview = (file: File) => {
    if (workingObjectUrlRef.current) {
      URL.revokeObjectURL(workingObjectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    workingObjectUrlRef.current = objectUrl;
    setWorkingImageUrl(objectUrl);
  };

  const setPreviewFromFile = (file: File) => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrlRef.current = objectUrl;
    setPreviewImageUrl(objectUrl);
    setPreviewFile(file);
  };

  const resetEditorState = () => {
    setIsDragging(false);
    setIsSaving(false);
    setIsRemovingBackground(false);
    setRemovalProgress(null);
    setFaceOutcome(null);
    setFaceProgress(null);
    setConsentConfirmed(false);
    setErrorMessage(null);
    setOriginalFile(null);
    setWorkingFile(null);
    setWorkingImageUrl(null);
    setPreviewImageUrl(null);
    setPreviewFile(null);
    setBackgroundColor(backgroundColorRef.current);
    setBackgroundRemoved(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    stopCamera();
    if (workingObjectUrlRef.current) {
      URL.revokeObjectURL(workingObjectUrlRef.current);
      workingObjectUrlRef.current = null;
    }
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };

  const openEditor = () => {
    resetEditorState();
    setIsOpen(true);
  };

  const closeEditor = () => {
    setIsOpen(false);
    resetEditorState();
  };

  const hydrateFile = (file: File) => {
    const generation = hydrateGenerationRef.current + 1;
    hydrateGenerationRef.current = generation;
    void normalizePhotoFile(file).then((working) => {
      if (hydrateGenerationRef.current !== generation) {
        return;
      }
      setErrorMessage(null);
      setOriginalFile(file);
      setWorkingFile(working);
      setWorkingPreview(working);
      setBackgroundRemoved(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    });
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }
    hydrateFile(nextFile);
  };

  const showCamera = async (stream: MediaStream) => {
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = stream;
    const inputs = await listVideoInputs();
    setCanSwitchCamera(canOfferCameraSwitch(inputs));
    setIsCameraOpen(true);
    setCameraGeneration((generation) => generation + 1);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    setIsStartingCamera(true);
    setErrorMessage(null);
    facingRef.current = cameraFacing;
    try {
      const stream = await openCamera({ facing: cameraFacing });
      await showCamera(stream);
    } catch (error) {
      setErrorMessage(
        isCameraDenied(error)
          ? (labels.cameraPermissionDenied ??
            "Camera access was blocked. Allow camera permission in the browser and try again.")
          : (labels.cameraStartError ?? "Unable to start the camera.")
      );
    } finally {
      setIsStartingCamera(false);
    }
  };

  const flipCamera = async () => {
    const current = cameraStreamRef.current;
    if (!current || isStartingCamera) {
      return;
    }
    setIsStartingCamera(true);
    setErrorMessage(null);
    const previousFacing = facingRef.current;
    try {
      const next = await switchCamera(current, previousFacing);
      facingRef.current = next.facing;
      await showCamera(next.stream);
    } catch (error) {
      try {
        const restored = await openCamera({ facing: previousFacing });
        facingRef.current = previousFacing;
        await showCamera(restored);
      } catch {
        stopCamera();
      }
      setErrorMessage(
        isCameraDenied(error)
          ? (labels.cameraPermissionDenied ??
            "Camera access was blocked. Allow camera permission in the browser and try again.")
          : (labels.cameraSwitchError ??
            "Couldn't switch the camera. Try again, or this phone may only have one camera.")
      );
    } finally {
      setIsStartingCamera(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage(labels.cameraStartError ?? "Unable to start the camera.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setErrorMessage(labels.cameraStartError ?? "Unable to start the camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMessage(labels.cameraStartError ?? "Unable to start the camera.");
          return;
        }
        const file = new File([blob], `camera-${Date.now()}.png`, { type: "image/png" });
        hydrateFile(file);
        stopCamera();
      },
      "image/png"
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (!droppedFile) {
      return;
    }
    hydrateFile(droppedFile);
  };

  useEffect(() => {
    let isCancelled = false;

    async function regeneratePreview() {
      if (!workingImageUrl || !croppedAreaPixels) {
        return;
      }
      try {
        const generated = await renderPrintReadyImage(
          workingImageUrl,
          croppedAreaPixels,
          backgroundColor
        );
        if (!isCancelled) {
          setPreviewFromFile(generated);
        }
      } catch {
        if (!isCancelled) {
          setErrorMessage(labels.removeBackgroundUnsupported);
        }
      }
    }

    regeneratePreview();
    return () => {
      isCancelled = true;
    };
  }, [backgroundColor, croppedAreaPixels, labels.removeBackgroundUnsupported, workingImageUrl]);

  useEffect(() => {
    if ((!isOpen && !isPageEditor) || !workingImageUrl || !croppedAreaPixels) {
      return;
    }
    const requestId = faceRequestRef.current + 1;
    faceRequestRef.current = requestId;
    const crop = croppedAreaPixels;
    const imageUrl = workingImageUrl;
    setFaceOutcome(null);
    setFaceProgress({ phase: "prepare" });
    const timer = window.setTimeout(() => {
      void checkFaceOnCrop({
        imageUrl,
        crop,
        onProgress: (progress) => {
          if (faceRequestRef.current === requestId) {
            setFaceProgress(progress);
          }
        },
      }).then((outcome) => {
        if (faceRequestRef.current !== requestId) {
          return;
        }
        setFaceProgress(null);
        setFaceOutcome(outcome);
      });
    }, FACE_CHECK_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      faceRequestRef.current += 1;
    };
  }, [croppedAreaPixels, isOpen, isPageEditor, workingImageUrl]);

  const removalProgressLabel = (progress: PhotoBackgroundProgress): string => {
    if (progress.phase === "download") {
      return labels.removeBackgroundDownload.replaceAll("{percent}", String(progress.percent));
    }
    if (progress.phase === "prepare") {
      return labels.removeBackgroundPrepare;
    }
    if (progress.phase === "person") {
      return labels.removeBackgroundPerson;
    }
    if (progress.phase === "edges") {
      return labels.removeBackgroundEdges;
    }
    return labels.removeBackgroundColour;
  };

  const faceHint = (hint: FaceHint): string => {
    if (hint === "none") return labels.faceCheckNone;
    if (hint === "many") return labels.faceCheckMany;
    if (hint === "pose") return labels.faceCheckPose;
    if (hint === "size") return labels.faceCheckSize;
    if (hint === "dark") return labels.faceCheckDark;
    if (hint === "bright") return labels.faceCheckBright;
    return labels.faceCheckBlur;
  };

  const faceProgressLabel = (progress: FaceCheckProgress): string => {
    if (progress.phase === "download") {
      return labels.faceCheckDownload.replaceAll("{percent}", String(progress.percent));
    }
    if (progress.phase === "prepare") return labels.faceCheckPrepare;
    if (progress.phase === "find") return labels.faceCheckFind;
    return labels.faceCheckLight;
  };

  const faceMessage = (): string | null => {
    if (faceProgress) return faceProgressLabel(faceProgress);
    if (!faceOutcome) return null;
    if (faceOutcome.status === "pass") return labels.faceCheckPass;
    if (faceOutcome.status === "skipped") return labels.faceCheckSkipped;
    return faceHint(faceOutcome.hint);
  };

  const faceAllowsSave =
    !faceProgress && (faceOutcome?.status === "pass" || faceOutcome?.status === "skipped");

  const handleRemoveBackground = async () => {
    if (!workingFile || !workingImageUrl || !croppedAreaPixels) {
      return;
    }
    setIsRemovingBackground(true);
    setRemovalProgress({ phase: "prepare" });
    setErrorMessage(null);
    try {
      const removedBlob = await removeProfileBackground({
        imageUrl: workingImageUrl,
        crop: croppedAreaPixels,
        color: backgroundColor,
        onProgress: setRemovalProgress,
      });
      const removedFile = new File([removedBlob], `bg-removed-${Date.now()}.png`, {
        type: "image/png",
      });
      setCroppedAreaPixels(null);
      setWorkingFile(removedFile);
      setWorkingPreview(removedFile);
      setBackgroundRemoved(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      setErrorMessage(labels.removeBackgroundFailed);
    } finally {
      setIsRemovingBackground(false);
      setRemovalProgress(null);
    }
  };

  const handleSave = async () => {
    if (!workingImageUrl || !croppedAreaPixels || !originalFile) {
      setErrorMessage(labels.removeBackgroundUnsupported);
      return;
    }
    if (!onSave) {
      setErrorMessage(labels.removeBackgroundUnsupported);
      return;
    }
    if (!consentConfirmed) {
      setErrorMessage(labels.consentLabel);
      return;
    }
    if (faceOutcome?.status !== "pass" && faceOutcome?.status !== "skipped") {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const processedOutput =
        previewFile ||
        (await renderPrintReadyImage(workingImageUrl, croppedAreaPixels, backgroundColor));
      await onSave({
        processedImage: processedOutput,
        originalImage: originalFile,
        photoEditMetadata: {
          crop: croppedAreaPixels,
          zoom,
          output_width: OUTPUT_WIDTH,
          output_height: OUTPUT_HEIGHT,
          background_color: backgroundColor,
          background_removed: backgroundRemoved,
          aspect_ratio: memberPhotoAspectRatio,
          face_check: faceOutcome?.status === "pass" ? "pass" : "skipped",
          ...(faceOutcome?.status === "skipped"
            ? { face_check_reason: faceOutcome.reason }
            : {}),
        },
        photoConsentConfirmed: consentConfirmed,
      });
      if (isPageEditor) {
        resetEditorState();
        onCancelEditor?.();
      } else {
        closeEditor();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : labels.removeBackgroundUnsupported
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onDelete();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : labels.removeBackgroundUnsupported
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    if (isPageEditor) {
      resetEditorState();
      onCancelEditor?.();
      return;
    }
    closeEditor();
  };

  const editorContent = (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-[var(--radius-card)] border-2 border-dashed p-3 text-sm transition ${
          isDragging
            ? "border-foreground bg-secondary text-foreground"
            : "border-border text-muted"
        }`}
      >
        <p>{labels.dragDropLabel}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => sourceInputRef.current?.click()}
          >
            {labels.selectFileButton}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isStartingCamera}
            onClick={() => {
              void startCamera();
            }}
          >
            {isStartingCamera
              ? (labels.cameraStarting ?? "Starting camera...")
              : labels.cameraButton}
          </Button>
        </div>
        {isCameraOpen ? (
          <div className="mt-4 space-y-3">
            <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--scrim)]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="mx-auto max-h-72 w-full bg-black object-contain"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={capturePhoto}>
                {labels.cameraCaptureButton ?? "Take photo"}
              </Button>
              {canSwitchCamera ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isStartingCamera}
                  onClick={() => {
                    void flipCamera();
                  }}
                >
                  <SwitchCamera aria-hidden />
                  {labels.cameraSwitchButton ?? "Switch camera"}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
                {labels.cameraCancelButton ?? "Cancel camera"}
              </Button>
            </div>
          </div>
        ) : null}
        <input
          ref={sourceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture={cameraFacing === "user" ? "user" : "environment"}
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {workingImageUrl ? (
        <>
          {/* The backdrop is the license-card paper colour, not a theme token. */}
          <div
            className="relative h-72 overflow-hidden rounded-[var(--radius-card)]"
            style={{ backgroundColor }}
          >
            <Cropper
              key={workingImageUrl}
              image={workingImageUrl}
              crop={crop}
              zoom={zoom}
              aspect={MEMBER_PHOTO_ASPECT}
              cropShape="rect"
              showGrid
              style={{ containerStyle: { backgroundColor } }}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-muted">{labels.zoomLabel}</label>
            <Input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted">{labels.backgroundColorLabel}</span>
            <span
              className="inline-block h-6 w-10 rounded-[var(--radius-card)] border border-border"
              style={{ backgroundColor }}
              data-testid="license-photo-background"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRemovingBackground || !croppedAreaPixels}
              onClick={handleRemoveBackground}
            >
              {isRemovingBackground ? labels.removeBackgroundBusy : labels.removeBackgroundButton}
            </Button>
          </div>
          {removalProgress || faceProgress ? (
            <div className="space-y-1">
              <p className="text-xs text-muted">
                {removalProgress
                  ? removalProgressLabel(removalProgress)
                  : faceProgressLabel(faceProgress as FaceCheckProgress)}
              </p>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                  removalProgress?.phase === "download"
                    ? removalProgress.percent
                    : faceProgress?.phase === "download"
                      ? faceProgress.percent
                      : undefined
                }
                aria-valuetext={
                  removalProgress
                    ? removalProgressLabel(removalProgress)
                    : faceProgressLabel(faceProgress as FaceCheckProgress)
                }
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${
                      removalProgress
                        ? progressBarPercent(removalProgress)
                        : faceProgressBarPercent(faceProgress as FaceCheckProgress)
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : null}
          {!faceProgress && faceOutcome ? (
            <p className="text-xs text-muted">{faceMessage()}</p>
          ) : null}

          {previewImageUrl ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">{labels.previewTitle}</p>
              <div className="h-48 w-40 overflow-hidden rounded-[var(--radius-card)] border border-border bg-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element -- crop preview uses blob URL */}
                <img
                  src={previewImageUrl}
                  alt={labels.currentPhotoAlt}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-foreground">
        <Checkbox
          checked={consentConfirmed}
          onCheckedChange={(checked) => setConsentConfirmed(Boolean(checked))}
        />
        <span>{labels.consentLabel}</span>
      </label>

      <ActionNotices error={errorMessage} onDismiss={() => setErrorMessage(null)} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleCancel}>
          {labels.cancelButton}
        </Button>
        <Button
          type="button"
          disabled={!workingImageUrl || !consentConfirmed || isSaving || !faceAllowsSave}
          onClick={handleSave}
        >
          {isSaving ? labels.saveBusy : labels.saveButton}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {isPageEditor ? (
        <section ref={rootRef} className="rounded-[var(--radius-card)] bg-card p-3 border border-border">{editorContent}</section>
      ) : (
        <>
          <section className="rounded-[var(--radius-card)] bg-card p-3 border border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-28 overflow-hidden rounded-[var(--radius-card)] border border-border bg-secondary" style={{ aspectRatio: memberPhotoAspectRatio }}>
                  {storedPhotoPreviewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- stored photo can be blob or API URL */
                    <img
                      src={storedPhotoPreviewUrl}
                      alt={labels.currentPhotoAlt}
                      className="h-full w-full object-cover object-[50%_20%]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted">
                      {labels.emptyPhotoLabel}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">{labels.sectionTitle}</h3>
                  <p className="text-sm text-muted">{labels.sectionSubtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => (onEdit ? onEdit() : openEditor())}
                  >
                    {labels.changeButton}
                  </Button>
                ) : null}
                {hasStoredPhoto && onDownload ? (
                  <Button type="button" variant="outline" size="sm" onClick={onDownload}>
                    {labels.downloadButton}
                  </Button>
                ) : null}
                {hasStoredPhoto && onDelete && !readOnly ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {labels.removeButton}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <Modal
            title={labels.modalTitle}
            description={labels.modalDescription}
            isOpen={isOpen}
            onClose={closeEditor}
          >
            {editorContent}
          </Modal>
        </>
      )}
    </>
  );
}

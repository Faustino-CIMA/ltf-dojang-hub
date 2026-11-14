/**
 * MediaPipe Face Landmarker, loaded from this origin. The photo is not uploaded.
 * Geometry, brightness, and blur live in face-check.ts.
 */

import { noteFetchProgress } from "@/lib/photo-background";

import {
  FACE_CHECK_ASSET_DIR,
  FACE_COUNT_CAP,
  FACE_LANDMARKER_FILE,
  FACE_WASM_BINARY,
  FACE_VISION_BUNDLE,
  FACE_WASM_JS,
  evaluateFaceCheck,
  faceBoxFromPoints,
  faceCheckAssetUrl,
  laplacianVariance,
  luminancePlane,
  meanLuma,
  poseDegreesFromMatrix,
  type FaceCheckOutcome,
  type FaceCheckProgress,
  type FaceObservation,
} from "@/lib/face-check";

type Landmark = { x: number; y: number };
type MatrixData = { data?: ArrayLike<number> };
type LandmarkerResult = {
  faceLandmarks?: Landmark[][];
  facialTransformationMatrixes?: MatrixData[];
};
type Landmarker = {
  detect: (image: HTMLCanvasElement) => LandmarkerResult;
};

let session: Promise<Landmarker> | null = null;

function assetOrigin(): string {
  return faceCheckAssetUrl(window.location.origin, "").replace(/\/$/, "");
}

async function readWithProgress(
  url: string,
  onChunk: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download ${url}`);
  }
  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) {
      break;
    }
    parts.push(step.value);
    loaded += step.value.length;
    onChunk(loaded, total > 0 ? total : loaded);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

async function loadLandmarker(
  onProgress: (progress: FaceCheckProgress) => void,
): Promise<Landmarker> {
  if (session) {
    return session;
  }
  session = (async () => {
    const downloads = new Map<string, { current: number; total: number }>();
    const report = (key: string, loaded: number, total: number) => {
      onProgress({
        phase: "download",
        percent: noteFetchProgress(downloads, key, loaded, total),
      });
    };
    const origin = assetOrigin();
    const wasmUrl = `${origin}/${FACE_WASM_BINARY}`;
    const loaderUrl = `${origin}/${FACE_WASM_JS}`;
    const modelUrl = `${origin}/${FACE_LANDMARKER_FILE}`;
    await readWithProgress(wasmUrl, (loaded, total) => report("wasm", loaded, total));
    await readWithProgress(loaderUrl, (loaded, total) => report("loader", loaded, total));
    const model = await readWithProgress(modelUrl, (loaded, total) => report("model", loaded, total));
    onProgress({ phase: "prepare" });
    // The package bundle calls import() on a runtime path. Turbopack cannot
    // resolve that, so the page loads the same file from our origin instead.
    const bundleUrl = faceCheckAssetUrl(window.location.origin, FACE_VISION_BUNDLE);
    const vision = (await import(/* turbopackIgnore: true */ bundleUrl)) as {
      FilesetResolver: { forVisionTasks: (basePath: string) => Promise<unknown> };
      FaceLandmarker: {
        createFromOptions: (files: unknown, options: Record<string, unknown>) => Promise<Landmarker>;
      };
    };
    const files = await vision.FilesetResolver.forVisionTasks(origin);
    const created = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: model, delegate: "CPU" },
      runningMode: "IMAGE",
      numFaces: FACE_COUNT_CAP,
      minFaceDetectionConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
    return created as Landmarker;
  })();
  try {
    return await session;
  } catch (error) {
    session = null;
    throw error;
  }
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for the face check."));
    image.src = source;
  });
}

function drawCrop(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  return { canvas, context };
}

function observationsFrom(result: LandmarkerResult): FaceObservation[] {
  const landmarks = result.faceLandmarks ?? [];
  const matrices = result.facialTransformationMatrixes ?? [];
  const faces: FaceObservation[] = [];
  for (let index = 0; index < landmarks.length; index += 1) {
    const box = faceBoxFromPoints(landmarks[index] ?? []);
    const pose = poseDegreesFromMatrix(matrices[index]?.data ?? []);
    if (!box || !pose) {
      continue;
    }
    faces.push({ box, ...pose });
  }
  return faces;
}

function facePixels(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  box: FaceObservation["box"],
): { luma: number; blurVariance: number } | null {
  const x = Math.max(0, Math.floor(box.x * width));
  const y = Math.max(0, Math.floor(box.y * height));
  const boxWidth = Math.max(1, Math.min(width - x, Math.round(box.width * width)));
  const boxHeight = Math.max(1, Math.min(height - y, Math.round(box.height * height)));
  const pixels = context.getImageData(x, y, boxWidth, boxHeight).data;
  return {
    luma: meanLuma(pixels),
    blurVariance: laplacianVariance(luminancePlane(pixels, boxWidth, boxHeight), boxWidth, boxHeight),
  };
}

export async function checkFaceOnCrop(options: {
  imageUrl: string;
  crop: { x: number; y: number; width: number; height: number };
  /** Blur measured on the original capture. Used after our own removal so processing cannot fail the check. */
  recordedBlur?: number;
  onProgress?: (progress: FaceCheckProgress) => void;
}): Promise<FaceCheckOutcome> {
  const report = options.onProgress ?? (() => undefined);
  try {
    report({ phase: "prepare" });
    const landmarker = await loadLandmarker(report);
    const image = await loadImage(options.imageUrl);
    const drawn = drawCrop(image, options.crop);
    if (!drawn) {
      return { status: "skipped", reason: "model_unavailable" };
    }
    report({ phase: "find" });
    const detected = landmarker.detect(drawn.canvas);
    const faces = observationsFrom(detected);
    const face = faces.length === 1 ? faces[0] : null;
    const measured = face
      ? facePixels(drawn.context, drawn.canvas.width, drawn.canvas.height, face.box)
      : null;
    report({ phase: "light" });
    const blurVariance = options.recordedBlur ?? measured?.blurVariance ?? 0;
    const verdict = evaluateFaceCheck({
      faces,
      luma: measured?.luma ?? 0,
      blurVariance,
    });
    if (verdict === "pass") {
      return { status: "pass", blurVariance };
    }
    return { status: "fail", hint: verdict, blurVariance };
  } catch {
    return { status: "skipped", reason: "model_unavailable" };
  }
}

export const FACE_CHECK_PUBLIC_DIR = FACE_CHECK_ASSET_DIR;

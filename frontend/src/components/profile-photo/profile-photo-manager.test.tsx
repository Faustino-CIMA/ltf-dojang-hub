import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { faceCheckEditorLabels } from "@/lib/face-check";
import { checkFaceOnCrop } from "@/lib/face-landmarker";
import { removeProfileBackground } from "@/lib/photo-background";
import { BackgroundFetchError } from "@/lib/background-model-cache";
import { canvasReadbackIsStable } from "@/lib/removal-shields";

import { ProfilePhotoManager } from "./profile-photo-manager";

jest.mock("@/lib/license-photo-background", () => ({
  getLicensePhotoBackgroundColor: jest.fn(async () => "#112233"),
}));

jest.mock("@/lib/face-landmarker", () => ({
  checkFaceOnCrop: jest.fn(async () => ({ status: "pass" })),
}));

jest.mock("@/lib/background-model-cache", () => {
  const actual = jest.requireActual("@/lib/background-model-cache");
  return {
    ...actual,
    prefetchBackgroundModel: jest.fn(async () => undefined),
  };
});

jest.mock("@/lib/removal-shields", () => ({
  canvasReadbackIsStable: jest.fn(() => true),
}));

jest.mock("@/lib/photo-background", () => {
  const actual = jest.requireActual("@/lib/photo-background");
  return {
    ...actual,
    removeProfileBackground: jest.fn(),
  };
});

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("react-easy-crop", () => {
  return {
    __esModule: true,
    default: function CropperMock({
      image,
      onCropComplete,
      onCropSizeChange,
    }: {
      image?: string;
      onCropComplete: (area: unknown, pixels: unknown) => void;
      onCropSizeChange?: (size: { width: number; height: number }) => void;
    }) {
      React.useEffect(() => {
        onCropSizeChange?.({ width: 200, height: 250 });
        onCropComplete(null, { x: 0, y: 0, width: 500, height: 700 });
      }, [image, onCropComplete, onCropSizeChange]);
      return <div data-testid="cropper">cropper</div>;
    },
  };
});

class MockImage {
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;

  set src(_value: string) {
    if (this.onload) {
      this.onload();
    }
  }
}

const labels = {
  sectionTitle: "Profile picture",
  sectionSubtitle: "Upload photo",
  changeButton: "Change photo",
  removeButton: "Remove photo",
  downloadButton: "Download",
  modalTitle: "Update profile picture",
  modalDescription: "Crop and save",
  dragDropLabel: "Drop image",
  selectFileButton: "Choose file",
  cameraButton: "Use camera",
  zoomLabel: "Zoom",
  backgroundColorLabel: "Background color",
  removeBackgroundButton: "Remove background",
  removeBackgroundBusy: "Removing background...",
  removeBackgroundDownload: "Downloading the removal tool… {percent}%",
  removeBackgroundPrepare: "Preparing the photo…",
  removeBackgroundPerson: "Finding the person…",
  removeBackgroundEdges: "Cleaning the edges…",
  removeBackgroundColour: "Applying the background colour…",
  removeBackgroundFailed: "Background removal failed. You can still save the photo as it is.",
  removeBackgroundRetry: "Retry",
  removeBackgroundWeak: "Weak connection. You can still save the photo as it is.",
  removeBackgroundRetrying: "Weak connection, retrying…",
  removeBackgroundOffline: "You are offline. Removal will try again when the connection returns. You can still save the photo as it is.",
  removeBackgroundShields: "Brave is hiding this page from the removal tool. Turn off Shields for app.ltkdf.org, then try again. You can still save the photo as it is.",
  ...faceCheckEditorLabels((key) => {
    const text: Record<string, string> = {
      faceCheckDownload: "Downloading the face check… {percent}%",
      faceCheckPrepare: "Preparing the photo…",
      faceCheckFind: "Looking for one face…",
      faceCheckLight: "Checking the light and the sharpness…",
      faceCheckPass: "This photo can be saved.",
      faceCheckNone: "We can't see a face. Use a photo of one person, looking at the camera.",
      faceCheckMany: "Only one person should be in the photo.",
      faceCheckPose: "Look straight at the camera, with your head level.",
      faceCheckSize: "Move closer so the face fills the frame, and keep it in the centre.",
      faceCheckDark: "The face is too dark. Use more light.",
      faceCheckBright: "The face is too bright. Avoid strong light behind the camera.",
      faceCheckBlur: "The photo is blurry. Hold still and try again.",
      faceCheckSkipped: "The automatic check could not run. You can still save the photo. The club will review it.",
      faceGuideReady: "This framing can be saved.",
      faceGuideNone: "We can't see a face yet.",
      faceGuideMany: "Only one person in the frame.",
      faceGuideTurn: "Look straight at the camera.",
      faceGuideTilt: "Hold your head level.",
      faceGuideChin: "Lift or lower your chin a little.",
      faceGuideCloser: "Move a little closer.",
      faceGuideFurther: "Move a little further away.",
      faceGuideCentre: "Move into the middle of the frame.",
      faceGuideDark: "The face is too dark.",
      faceGuideBright: "The face is too bright.",
      faceGuideOff: "The guide is not available. You can still take the photo.",
    };
    return text[key] ?? key;
  }),
  consentLabel: "Consent",
  saveButton: "Save photo",
  saveBusy: "Saving photo...",
  cancelButton: "Cancel",
  previewTitle: "Preview",
  currentPhotoAlt: "Preview",
  emptyPhotoLabel: "No photo",
  removeBackgroundUnsupported: "Unsupported",
};

function buildFetchResponse(
  ok: boolean,
  options?: { status?: number; blob?: Blob }
): Response {
  return {
    ok,
    status: options?.status ?? (ok ? 200 : 401),
    blob: async () => options?.blob ?? new Blob(["image"], { type: "image/jpeg" }),
  } as Response;
}

describe("ProfilePhotoManager", () => {
  beforeAll(() => {
    Object.defineProperty(global, "Image", {
      writable: true,
      value: MockImage,
    });
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: jest.fn(() => "blob:mock"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: jest.fn(),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      writable: true,
      value: () => ({
        fillStyle: "",
        fillRect: jest.fn(),
        drawImage: jest.fn(),
      }),
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      writable: true,
      value: (callback: (blob: Blob) => void) => {
        callback(new Blob(["image"], { type: "image/jpeg" }));
      },
    });
    Object.defineProperty(globalThis, "fetch", {
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (globalThis.fetch as jest.Mock).mockReset();
    window.localStorage.clear();
  });

  it("loads stored thumbnail using authenticated request", async () => {
    window.localStorage.setItem("ltf_token", "test-token");
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue(buildFetchResponse(true, { blob: new Blob(["thumb"]) }));

    render(
      <ProfilePhotoManager
        labels={labels}
        readOnly
        thumbnailUrl="/api/members/1/profile-picture/thumbnail/"
        imageUrl="/api/members/1/profile-picture/processed/"
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).toContain("/api/members/1/profile-picture/thumbnail/");
    expect((requestInit as RequestInit)?.headers).toEqual({ Authorization: "Token test-token" });
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Preview" })).toBeInTheDocument();
    });
    expect(screen.queryByText("No photo")).not.toBeInTheDocument();
  });

  it("falls back to processed image when thumbnail fetch fails", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(buildFetchResponse(false, { status: 401 }))
      .mockResolvedValueOnce(buildFetchResponse(true, { blob: new Blob(["processed"]) }));

    render(
      <ProfilePhotoManager
        labels={labels}
        readOnly
        thumbnailUrl="/api/members/2/profile-picture/thumbnail/"
        imageUrl="/api/members/2/profile-picture/processed/"
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/members/2/profile-picture/thumbnail/");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/members/2/profile-picture/processed/");
    expect(screen.getByRole("img", { name: "Preview" })).toBeInTheDocument();
  });

  it("shows placeholder when thumbnail and processed image both fail", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce(buildFetchResponse(false, { status: 401 }))
      .mockResolvedValueOnce(buildFetchResponse(false, { status: 404 }));

    render(
      <ProfilePhotoManager
        labels={labels}
        readOnly
        thumbnailUrl="/api/members/3/profile-picture/thumbnail/"
        imageUrl="/api/members/3/profile-picture/processed/"
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByRole("img", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });

  it("opens modal and submits processed payload", async () => {
    const onSave = jest.fn(async () => {});
    const { container } = render(
      <ProfilePhotoManager labels={labels} onSave={onSave} imageUrl={null} thumbnailUrl={null} />
    );

    fireEvent.click(screen.getByText("Change photo"));
    const fileInputs = container.querySelectorAll("input[type='file']");
    const file = new File(["hello"], "sample.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInputs[0], {
      target: { files: [file] },
    });
    await screen.findByTestId("license-photo-background");
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByText("Save photo")).toBeEnabled());
    fireEvent.click(screen.getByText("Save photo"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ photoConsentConfirmed: true }));
  });

  it("draws an amber or green outline from the save rule", async () => {
    const check = checkFaceOnCrop as jest.MockedFunction<typeof checkFaceOnCrop>;
    check.mockResolvedValueOnce({ status: "fail", hint: "size", guide: "closer" });
    const { container } = render(
      <ProfilePhotoManager labels={labels} imageUrl={null} thumbnailUrl={null} />
    );
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    const guide = await screen.findByTestId("framing-guide");
    expect(guide).toHaveAttribute("data-state", "adjust");
    expect(screen.getByText("Move a little closer.")).toBeInTheDocument();
    expect(guide.innerHTML).not.toContain("--danger");
    expect(guide.innerHTML).not.toContain("--accent");
    expect(guide.innerHTML).toContain("--warning");
  });

  it("shows the federation colour and download progress", async () => {
    const remove = removeProfileBackground as jest.MockedFunction<typeof removeProfileBackground>;
    let release: ((blob: Blob) => void) | undefined;
    remove.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ phase: "download", percent: 40 });
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const { container } = render(
      <ProfilePhotoManager labels={labels} imageUrl={null} thumbnailUrl={null} />
    );

    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    expect(container.querySelector("input[type='color']")).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId("license-photo-background")).toHaveStyle({ backgroundColor: "#112233" });
    });
    await waitFor(() => expect(screen.getByText("Remove background")).toBeEnabled());

    fireEvent.click(screen.getByText("Remove background"));
    await screen.findByText("Downloading the removal tool… 40%");
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuetext", "Downloading the removal tool… 40%");
    release?.(new Blob(["png"], { type: "image/png" }));
    await waitFor(() => {
      expect(screen.queryByText("Downloading the removal tool… 40%")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("cropper")).toBeInTheDocument();
  });

  it("leaves the photo in place when removal fails and still allows save", async () => {
    const remove = removeProfileBackground as jest.MockedFunction<typeof removeProfileBackground>;
    remove.mockRejectedValueOnce(new Error("weights missing"));
    const onSave = jest.fn(async () => {});
    const { container } = render(
      <ProfilePhotoManager labels={labels} onSave={onSave} imageUrl={null} thumbnailUrl={null} />
    );

    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByTestId("license-photo-background");
    await waitFor(() => expect(screen.getByText("Remove background")).toBeEnabled());
    remove.mockClear();
    fireEvent.click(screen.getByText("Remove background"));
    expect(
      await screen.findByText("Background removal failed. You can still save the photo as it is.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Removing background..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove background" })).toBeEnabled();
    expect(screen.getByTestId("cropper")).toBeInTheDocument();
    const firstUrl = remove.mock.calls[0][0].imageUrl;
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByText("Save photo")).toBeEnabled());
    remove.mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove.mock.calls[1][0].imageUrl).toBe(firstUrl);
    expect(remove.mock.calls[1][0].attempt).toBe(2);
    expect(remove.mock.calls[0][0].attempt).toBe(1);
  });

  it("starts a new download when Retry is pressed while the first one is still running", async () => {
    const remove = removeProfileBackground as jest.MockedFunction<typeof removeProfileBackground>;
    remove.mockImplementation(() => new Promise(() => undefined));
    const { container } = render(
      <ProfilePhotoManager labels={labels} imageUrl={null} thumbnailUrl={null} />
    );
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByText("Remove background")).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByText("Save photo")).toBeEnabled());
    remove.mockClear();
    fireEvent.click(screen.getByText("Remove background"));
    await screen.findByText("Removing background...");
    expect(screen.getByText("Save photo")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Removing background..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove.mock.calls[1][0].imageUrl).toBe(remove.mock.calls[0][0].imageUrl);
    expect(remove.mock.calls[0][0].attempt).toBe(1);
    expect(remove.mock.calls[1][0].attempt).toBe(2);
    expect(screen.getByText("Save photo")).toBeEnabled();
  });

  it("warns when the browser scrambles canvas reads and still allows save", async () => {
    (canvasReadbackIsStable as jest.Mock).mockReturnValue(false);
    const { container } = render(
      <ProfilePhotoManager labels={labels} onSave={jest.fn(async () => {})} imageUrl={null} thumbnailUrl={null} />
    );
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    expect(
      await screen.findByText(
        "Brave is hiding this page from the removal tool. Turn off Shields for app.ltkdf.org, then try again. You can still save the photo as it is.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByText("Save photo")).toBeEnabled());
    (canvasReadbackIsStable as jest.Mock).mockReturnValue(true);
  });

  it("keeps the weak-connection notice when the model fetch fails and the canvas is clean", async () => {
    (canvasReadbackIsStable as jest.Mock).mockReturnValue(true);
    const remove = removeProfileBackground as jest.MockedFunction<typeof removeProfileBackground>;
    remove.mockRejectedValueOnce(new BackgroundFetchError("network", "stalled"));
    const { container } = render(
      <ProfilePhotoManager labels={labels} imageUrl={null} thumbnailUrl={null} />
    );
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(screen.getByText("Remove background")).toBeEnabled());
    fireEvent.click(screen.getByText("Remove background"));
    expect(await screen.findByText("Weak connection. You can still save the photo as it is.")).toBeInTheDocument();
    expect(screen.queryByText(/Turn off Shields/)).not.toBeInTheDocument();
  });

  it("keeps save off until one face passes, and records a skip when the model cannot load", async () => {
    const check = checkFaceOnCrop as jest.MockedFunction<typeof checkFaceOnCrop>;
    check.mockResolvedValue({ status: "fail", hint: "many" });
    const onSave = jest.fn(async () => {});
    const { container } = render(
      <ProfilePhotoManager labels={labels} onSave={onSave} imageUrl={null} thumbnailUrl={null} />
    );
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["hello"], "sample.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText("Only one person should be in the photo.")).toBeInTheDocument();
    expect(screen.getByText("Save photo")).toBeDisabled();

    check.mockResolvedValue({ status: "skipped", reason: "model_unavailable" });
    (URL.createObjectURL as jest.Mock).mockReturnValueOnce("blob:again");
    fireEvent.change(container.querySelectorAll("input[type='file']")[0], {
      target: { files: [new File(["again"], "again.jpg", { type: "image/jpeg" })] },
    });
    expect(
      await screen.findByText(
        "The automatic check could not run. You can still save the photo. The club will review it.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByText("Save photo")).toBeEnabled());
    fireEvent.click(screen.getByText("Save photo"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = (onSave as jest.Mock).mock.calls[0][0] as {
      photoEditMetadata: Record<string, unknown>;
    };
    expect(saved.photoEditMetadata).toEqual(
      expect.objectContaining({
        face_check: "skipped",
        face_check_reason: "model_unavailable",
      }),
    );
    check.mockResolvedValue({ status: "pass" });
  });

  it("opens the file picker when another photo is requested", async () => {
    const { container, rerender } = render(
      <ProfilePhotoManager labels={labels} isPageEditor imageUrl={null} thumbnailUrl={null} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const input = container.querySelector("input[type='file']") as HTMLInputElement;
    const click = jest.spyOn(input, "click").mockImplementation(() => undefined);
    rerender(
      <ProfilePhotoManager
        labels={labels}
        isPageEditor
        imageUrl={null}
        thumbnailUrl={null}
        openPickerRequest={1}
      />,
    );
    expect(click).toHaveBeenCalledTimes(1);
  });
});

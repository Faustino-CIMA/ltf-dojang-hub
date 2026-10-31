import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProfilePhotoManager } from "./profile-photo-manager";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("react-easy-crop", () => ({
  __esModule: true,
  default: function CropperMock() {
    return <div data-testid="cropper">cropper</div>;
  },
}));

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
  cameraSwitchButton: "Switch camera",
  cameraCaptureButton: "Take photo",
  cameraCancelButton: "Cancel camera",
  zoomLabel: "Zoom",
  backgroundColorLabel: "Background color",
  removeBackgroundButton: "Remove background",
  removeBackgroundBusy: "Removing background...",
  consentLabel: "Consent",
  saveButton: "Save photo",
  saveBusy: "Saving photo...",
  cancelButton: "Cancel",
  previewTitle: "Preview",
  currentPhotoAlt: "Preview",
  emptyPhotoLabel: "No photo",
  removeBackgroundUnsupported: "Unsupported",
};

function stream(deviceId: string) {
  const stop = jest.fn();
  const video = { stop, getSettings: () => ({ deviceId }) };
  return {
    getTracks: () => [video],
    getVideoTracks: () => [video],
    video,
  };
}

describe("profile photo camera", () => {
  const getUserMedia = jest.fn();
  const enumerateDevices = jest.fn();

  beforeEach(() => {
    getUserMedia.mockReset();
    enumerateDevices.mockReset();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });
    Object.defineProperty(HTMLVideoElement.prototype, "play", {
      configurable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });
  });

  it("starts on the rear camera for a member and switches when two cameras exist", async () => {
    const rear = stream("back");
    const front = stream("front");
    getUserMedia.mockResolvedValueOnce(rear).mockResolvedValueOnce(front);
    enumerateDevices.mockResolvedValue([
      { kind: "videoinput", deviceId: "back" },
      { kind: "videoinput", deviceId: "front" },
    ]);

    const view = render(<ProfilePhotoManager labels={labels} imageUrl={null} thumbnailUrl={null} />);
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.click(screen.getByText("Use camera"));

    await screen.findByRole("button", { name: "Switch camera" });
    expect(getUserMedia.mock.calls[0][0].video).toMatchObject({ facingMode: { ideal: "environment" } });

    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(rear.video.stop).toHaveBeenCalled();
    expect(getUserMedia.mock.calls[1][0].video).toMatchObject({ deviceId: { exact: "front" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Switch camera" })).toBeEnabled());

    view.unmount();
    expect(front.video.stop).toHaveBeenCalled();
  });

  it("hides the switch when the phone has one camera", async () => {
    getUserMedia.mockResolvedValueOnce(stream("only"));
    enumerateDevices.mockResolvedValue([{ kind: "videoinput", deviceId: "only" }]);

    render(<ProfilePhotoManager labels={labels} imageUrl={null} thumbnailUrl={null} />);
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.click(screen.getByText("Use camera"));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Switch camera" })).not.toBeInTheDocument();
  });

  it("starts on the front camera for a self photo", async () => {
    getUserMedia.mockResolvedValueOnce(stream("front"));
    enumerateDevices.mockResolvedValue([{ kind: "videoinput", deviceId: "front" }]);

    render(
      <ProfilePhotoManager labels={labels} cameraFacing="user" imageUrl={null} thumbnailUrl={null} />,
    );
    fireEvent.click(screen.getByText("Change photo"));
    fireEvent.click(screen.getByText("Use camera"));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia.mock.calls[0][0].video).toMatchObject({ facingMode: { ideal: "user" } });
  });
});

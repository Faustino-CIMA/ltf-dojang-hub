import { listVideoInputs, openCamera, otherFacing, stopMediaStream, switchCamera } from "./camera-capture";

function track(deviceId: string) {
  return {
    stop: jest.fn(),
    getSettings: () => ({ deviceId }),
  };
}

function stream(deviceId: string) {
  const video = track(deviceId);
  return {
    getTracks: () => [video],
    getVideoTracks: () => [video],
    video,
  } as unknown as MediaStream & { video: ReturnType<typeof track> };
}

describe("camera capture", () => {
  const getUserMedia = jest.fn();
  const enumerateDevices = jest.fn();

  beforeEach(() => {
    getUserMedia.mockReset();
    enumerateDevices.mockReset();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });
  });

  it("asks for the rear camera first and falls back when it is missing", async () => {
    getUserMedia
      .mockRejectedValueOnce(new DOMException("missing", "OverconstrainedError"))
      .mockRejectedValueOnce(new DOMException("missing", "OverconstrainedError"))
      .mockRejectedValueOnce(new DOMException("missing", "NotFoundError"))
      .mockResolvedValueOnce(stream("front"));

    const opened = await openCamera({ facing: "environment" });
    expect(opened).toBeTruthy();
    const calls = getUserMedia.mock.calls.map((call) => call[0].video);
    expect(calls[0]).toMatchObject({ facingMode: { ideal: "environment" } });
    expect(calls.at(-1)).toBe(true);
  });

  it("does not keep asking after the camera permission is refused", async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    await expect(openCamera({ facing: "environment" })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("counts video inputs only", async () => {
    enumerateDevices.mockResolvedValue([
      { kind: "audioinput", deviceId: "mic" },
      { kind: "videoinput", deviceId: "front" },
      { kind: "videoinput", deviceId: "back" },
    ]);
    const videos = await listVideoInputs();
    expect(videos.map((device) => device.deviceId)).toEqual(["front", "back"]);
  });

  it("stops the open camera and restarts on the other device", async () => {
    const current = stream("back");
    const next = stream("front");
    enumerateDevices.mockResolvedValue([
      { kind: "videoinput", deviceId: "back" },
      { kind: "videoinput", deviceId: "front" },
    ]);
    getUserMedia.mockResolvedValueOnce(next);

    const switched = await switchCamera(current, "environment");
    expect(current.video.stop).toHaveBeenCalled();
    expect(getUserMedia.mock.calls[0][0].video).toMatchObject({ deviceId: { exact: "front" } });
    expect(switched.facing).toBe("user");
    expect(otherFacing("user")).toBe("environment");
  });

  it("releases every track", () => {
    const current = stream("back");
    stopMediaStream(current);
    expect(current.video.stop).toHaveBeenCalledTimes(1);
    stopMediaStream(null);
  });
});

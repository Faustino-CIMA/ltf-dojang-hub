import {
  attachCameraPreview,
  isIosWebKit,
  listVideoInputs,
  openCamera,
  otherFacing,
  stopMediaStream,
  switchCamera,
} from "./camera-capture";

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

  it("recognises an iPhone browser, including Brave, as WebKit", () => {
    const brave =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1 Brave/1.32";
    expect(isIosWebKit(brave, "iPhone", 5)).toBe(true);
    expect(isIosWebKit("Mozilla/5.0 (Windows NT 10.0)", "Win32", 0)).toBe(false);
  });

  it("on iOS stops every track, then switches by facing mode instead of deviceId", async () => {
    const brave =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1 Brave/1.32";
    const previousAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: brave });
    const video = track("back");
    const audio = { stop: jest.fn(), getSettings: () => ({}) };
    const current = {
      getTracks: () => [video, audio],
      getVideoTracks: () => [video],
    } as unknown as MediaStream;
    const next = stream("front");
    enumerateDevices.mockResolvedValue([{ kind: "videoinput", deviceId: "" }]);
    getUserMedia.mockResolvedValueOnce(next);

    try {
      const switched = await switchCamera(current, "environment");
      expect(video.stop).toHaveBeenCalled();
      expect(audio.stop).toHaveBeenCalled();
      expect(video.stop.mock.invocationCallOrder[0]).toBeLessThan(getUserMedia.mock.invocationCallOrder[0]);
      expect(getUserMedia.mock.calls[0][0].video).toEqual({ facingMode: { ideal: "user" } });
      expect(getUserMedia.mock.calls[0][0].video.deviceId).toBeUndefined();
      expect(enumerateDevices).not.toHaveBeenCalled();
      expect(switched.facing).toBe("user");
    } finally {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: previousAgent });
    }
  });

  it("on iOS tries an exact facing mode when the ideal one is refused", async () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1";
    const previousAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: iphone });
    const current = stream("back");
    getUserMedia
      .mockRejectedValueOnce(new DOMException("ideal", "OverconstrainedError"))
      .mockResolvedValueOnce(stream("front"));

    try {
      await switchCamera(current, "user");
      expect(getUserMedia.mock.calls[1][0].video).toEqual({ facingMode: { exact: "environment" } });
    } finally {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: previousAgent });
    }
  });

  it("re-attaches the new stream and plays it inline", async () => {
    const video = document.createElement("video");
    const play = jest.fn().mockResolvedValue(undefined);
    video.play = play;
    const next = stream("front");
    video.srcObject = stream("back");

    await attachCameraPreview(video, next);

    expect(video.srcObject).toBe(next);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.getAttribute("playsinline")).toBe("true");
    expect(play).toHaveBeenCalled();
  });
});

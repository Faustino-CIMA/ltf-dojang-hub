export type CameraFacing = "user" | "environment";

const TEXT_DELAY_MS = 80;

export function otherFacing(facing: CameraFacing): CameraFacing {
  return facing === "environment" ? "user" : "environment";
}

/** iPhone and iPad browsers, including Brave, are WebKit. Their camera list is often too small to switch by deviceId. */
export function isIosWebKit(
  agent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
) {
  if (/iPad|iPhone|iPod/i.test(agent)) {
    return true;
  }
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function canOfferCameraSwitch(videoInputs: MediaDeviceInfo[]) {
  if (isIosWebKit()) {
    return true;
  }
  const ids = new Set(videoInputs.map((device) => device.deviceId).filter((id) => id));
  return Math.max(ids.size, videoInputs.length) > 1;
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function isCameraDenied(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || error.name === "SecurityError")
  );
}

function isCameraUnavailable(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "OverconstrainedError" ||
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "AbortError")
  );
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

export async function attachCameraPreview(video: HTMLVideoElement, stream: MediaStream) {
  video.srcObject = null;
  video.srcObject = stream;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  await video.play();
}

function constraintAttempts(
  facing: CameraFacing,
  deviceId?: string,
  facingOnly = false,
): MediaTrackConstraints[] {
  if (facingOnly) {
    return [{ facingMode: { ideal: facing } }, { facingMode: { exact: facing } }];
  }
  const attempts: MediaTrackConstraints[] = [];
  if (deviceId) {
    attempts.push({ deviceId: { exact: deviceId } });
  }
  attempts.push({
    facingMode: { ideal: facing },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  });
  attempts.push({ facingMode: { ideal: facing } });
  attempts.push({ facingMode: facing });
  return attempts;
}

export async function openCamera({
  facing,
  deviceId,
  facingOnly = false,
}: {
  facing: CameraFacing;
  deviceId?: string;
  facingOnly?: boolean;
}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Camera is not available.", "NotFoundError");
  }
  let lastError: unknown;
  for (const video of constraintAttempts(facing, deviceId, facingOnly)) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      if (isCameraDenied(error)) {
        throw error;
      }
      lastError = error;
      if (!isCameraUnavailable(error) && deviceId && !facingOnly) {
        break;
      }
    }
  }
  if (facingOnly) {
    throw lastError ?? new DOMException("Camera is not available.", "NotFoundError");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (error) {
    throw lastError ?? error;
  }
}

async function pauseForCameraHandoff() {
  await new Promise((resolve) => {
    window.setTimeout(resolve, TEXT_DELAY_MS);
  });
}

export async function switchCamera(
  current: MediaStream,
  facing: CameraFacing,
): Promise<{ stream: MediaStream; facing: CameraFacing }> {
  const videos = isIosWebKit() ? [] : await listVideoInputs();
  const currentId = current.getVideoTracks()[0]?.getSettings().deviceId;
  const nextFacing = otherFacing(facing);
  stopMediaStream(current);
  await pauseForCameraHandoff();
  if (isIosWebKit()) {
    const stream = await openCamera({ facing: nextFacing, facingOnly: true });
    return { stream, facing: nextFacing };
  }
  if (videos.length > 1) {
    const index = Math.max(0, videos.findIndex((device) => device.deviceId === currentId));
    const next = videos[(index + 1) % videos.length];
    if (next?.deviceId && next.deviceId !== currentId) {
      try {
        const stream = await openCamera({ facing: nextFacing, deviceId: next.deviceId });
        return { stream, facing: nextFacing };
      } catch (error) {
        if (isCameraDenied(error)) {
          throw error;
        }
      }
    }
  }
  const stream = await openCamera({ facing: nextFacing });
  return { stream, facing: nextFacing };
}

/**
 * Print size of the member photo that is placed on the license card.
 * The cropper, the print check, and the review panel all use this frame.
 */
export const MEMBER_PHOTO_WIDTH = 945;
export const MEMBER_PHOTO_HEIGHT = 1181;

export const MEMBER_PHOTO_ASPECT = MEMBER_PHOTO_WIDTH / MEMBER_PHOTO_HEIGHT;

export const memberPhotoAspectRatio = `${MEMBER_PHOTO_WIDTH} / ${MEMBER_PHOTO_HEIGHT}`;

/** Largest print-shaped window inside a camera frame, centred. The live guide and the cropper both use this. */
export function printCropInFrame(
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const frameAspect = frameWidth / frameHeight;
  if (frameAspect > MEMBER_PHOTO_ASPECT) {
    const height = frameHeight;
    const width = height * MEMBER_PHOTO_ASPECT;
    return { x: (frameWidth - width) / 2, y: 0, width, height };
  }
  const width = frameWidth;
  const height = width / MEMBER_PHOTO_ASPECT;
  return { x: 0, y: (frameHeight - height) / 2, width, height };
}

/**
 * The live preview fits the camera picture with object-contain. This is that
 * same print window, once in camera pixels and once in the preview's CSS pixels.
 * The cropper must open on `crop`, not on a tighter cover fit.
 */
export function cameraFraming(
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
): {
  crop: { x: number; y: number; width: number; height: number };
  guide: { x: number; y: number; width: number; height: number };
} {
  const crop = printCropInFrame(frameWidth, frameHeight);
  const picture = containedMediaRect(boxWidth, boxHeight, frameWidth, frameHeight);
  const scaleX = frameWidth > 0 ? picture.width / frameWidth : 0;
  const scaleY = frameHeight > 0 ? picture.height / frameHeight : 0;
  return {
    crop,
    guide: {
      x: picture.x + crop.x * scaleX,
      y: picture.y + crop.y * scaleY,
      width: crop.width * scaleX,
      height: crop.height * scaleY,
    },
  };
}

/** Picture rectangle inside an object-contain box. */
export function containedMediaRect(
  boxWidth: number,
  boxHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (boxWidth <= 0 || boxHeight <= 0 || mediaWidth <= 0 || mediaHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(boxWidth / mediaWidth, boxHeight / mediaHeight);
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
}

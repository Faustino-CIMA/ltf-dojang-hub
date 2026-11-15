/**
 * Print size of the member photo that is placed on the license card.
 * The cropper, the print check, and the review panel all use this frame.
 */
export const MEMBER_PHOTO_WIDTH = 945;
export const MEMBER_PHOTO_HEIGHT = 1181;

export const MEMBER_PHOTO_ASPECT = MEMBER_PHOTO_WIDTH / MEMBER_PHOTO_HEIGHT;

export const memberPhotoAspectRatio = `${MEMBER_PHOTO_WIDTH} / ${MEMBER_PHOTO_HEIGHT}`;

/** Largest print-shaped window inside a camera frame, centred. */
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

const DARK_EDGE_LUMA = 16;

function edgeIsDark(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  axis: "row" | "column",
  index: number,
): boolean {
  const samples = 32;
  let dark = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    const across = Math.min(
      (axis === "row" ? width : height) - 1,
      Math.floor(((sample + 0.5) * (axis === "row" ? width : height)) / samples),
    );
    const x = axis === "row" ? across : index;
    const y = axis === "row" ? index : across;
    const offset = (y * width + x) * 4;
    const luma = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
    if (luma <= DARK_EDGE_LUMA) {
      dark += 1;
    }
  }
  return dark >= samples * 0.9;
}

/**
 * Drop a near-black band along the edge of a camera frame. A 16:9 request
 * on a 4:3 sensor can pad the picture. The print crop then stays on the picture.
 */
export function contentBoxAvoidingDarkEdges(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  if (width < 4 || height < 4 || pixels.length < width * height * 4) {
    return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) };
  }
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < bottom && edgeIsDark(pixels, width, height, "row", top)) {
    top += 1;
  }
  while (bottom > top && edgeIsDark(pixels, width, height, "row", bottom)) {
    bottom -= 1;
  }
  while (left < right && edgeIsDark(pixels, width, height, "column", left)) {
    left += 1;
  }
  while (right > left && edgeIsDark(pixels, width, height, "column", right)) {
    right -= 1;
  }
  const boxWidth = right - left + 1;
  const boxHeight = bottom - top + 1;
  if (boxWidth < width * 0.5 || boxHeight < height * 0.5) {
    return { x: 0, y: 0, width, height };
  }
  return { x: left, y: top, width: boxWidth, height: boxHeight };
}

/** Largest print-shaped window inside a content box, in the same pixel space. */
export function printCropInsideContent(
  content: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const crop = printCropInFrame(content.width, content.height);
  return {
    x: content.x + crop.x,
    y: content.y + crop.y,
    width: crop.width,
    height: crop.height,
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

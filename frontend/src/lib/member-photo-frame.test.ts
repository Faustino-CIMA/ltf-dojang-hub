import { evaluateFacePlacement, FACE_HEIGHT_MAX, normalizeBoxToFrame } from "@/lib/face-check";

import {
  MEMBER_PHOTO_ASPECT,
  MEMBER_PHOTO_HEIGHT,
  MEMBER_PHOTO_WIDTH,
  cameraFraming,
  containedMediaRect,
  memberPhotoAspectRatio,
  printCropInFrame,
} from "@/lib/member-photo-frame";

describe("member photo frame", () => {
  it("uses the license-card print size, width over height", () => {
    expect(MEMBER_PHOTO_WIDTH).toBe(945);
    expect(MEMBER_PHOTO_HEIGHT).toBe(1181);
    expect(MEMBER_PHOTO_ASPECT).toBe(MEMBER_PHOTO_WIDTH / MEMBER_PHOTO_HEIGHT);
    expect(memberPhotoAspectRatio).toBe("945 / 1181");
    expect(MEMBER_PHOTO_ASPECT).toBeLessThan(1);
  });

  it("centres the print crop in a landscape camera frame", () => {
    const crop = printCropInFrame(1920, 1080);
    expect(crop.y).toBe(0);
    expect(crop.height).toBe(1080);
    expect(crop.width / crop.height).toBeCloseTo(MEMBER_PHOTO_ASPECT, 5);
    expect(crop.x).toBeCloseTo((1920 - crop.width) / 2, 5);
    const picture = containedMediaRect(400, 288, 1920, 1080);
    expect(picture.width).toBe(400);
    expect(picture.height).toBeLessThan(288);
    expect(picture.y).toBeCloseTo((288 - picture.height) / 2, 5);
    expect(picture.x).toBe(0);
  });

  it("keeps a passing live face passing in the cropper on a tall phone frame", () => {
    const devicePixelRatio = 3;
    const frameWidth = 1440;
    const frameHeight = 1920;
    expect(Math.max(frameWidth, frameHeight)).toBeGreaterThanOrEqual(1920);
    expect(frameWidth / frameHeight).toBeCloseTo(3 / 4, 5);
    const cssWidth = 390;
    const cssHeight = 288;
    const level = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
    const meshInPrint = { x: 0.28, y: 0.22, width: 0.44, height: 0.5 };

    const preview = cameraFraming(frameWidth, frameHeight, cssWidth, cssHeight);
    const screen = cameraFraming(frameWidth, frameHeight, cssWidth * devicePixelRatio, cssHeight * devicePixelRatio);
    expect(screen.crop).toEqual(preview.crop);
    expect(screen.guide.width).toBeCloseTo(preview.guide.width * devicePixelRatio, 4);

    const faceInFrame = {
      x: preview.crop.x + meshInPrint.x * preview.crop.width,
      y: preview.crop.y + meshInPrint.y * preview.crop.height,
      width: meshInPrint.width * preview.crop.width,
      height: meshInPrint.height * preview.crop.height,
    };
    const onTheGuide = normalizeBoxToFrame(faceInFrame, preview.crop);
    const inTheCropper = normalizeBoxToFrame(faceInFrame, preview.crop);
    expect(evaluateFacePlacement([{ box: onTheGuide, ...level }])).toBe("pass");
    expect(evaluateFacePlacement([{ box: inTheCropper, ...level }])).toBe("pass");
    expect(inTheCropper.height).toBeCloseTo(onTheGuide.height, 5);

    const cover = coverFitWindow(frameWidth, frameHeight, cssWidth, cssHeight);
    const onTheCover = normalizeBoxToFrame(faceInFrame, cover);
    expect(onTheCover.height).toBeGreaterThan(FACE_HEIGHT_MAX);
    expect(evaluateFacePlacement([{ box: onTheCover, ...level }])).not.toBe("pass");
  });
});

/** The cropper's old cover fit: stretch a tall picture to the editor width and keep the centre. */
function coverFitWindow(frameWidth: number, frameHeight: number, boxWidth: number, boxHeight: number) {
  const mediaAspect = frameWidth / frameHeight;
  const boxAspect = boxWidth / boxHeight;
  const displayWidth = mediaAspect < boxAspect ? boxWidth : boxHeight * mediaAspect;
  const displayHeight = mediaAspect < boxAspect ? boxWidth / mediaAspect : boxHeight;
  const fittingWidth = Math.min(displayWidth, boxWidth);
  const fittingHeight = Math.min(displayHeight, boxHeight);
  const visible =
    fittingWidth > fittingHeight * MEMBER_PHOTO_ASPECT
      ? { width: fittingHeight * MEMBER_PHOTO_ASPECT, height: fittingHeight }
      : { width: fittingWidth, height: fittingWidth / MEMBER_PHOTO_ASPECT };
  const scaleX = frameWidth / displayWidth;
  const scaleY = frameHeight / displayHeight;
  return {
    x: ((boxWidth - visible.width) / 2 - (boxWidth - displayWidth) / 2) * scaleX,
    y: ((boxHeight - visible.height) / 2 - (boxHeight - displayHeight) / 2) * scaleY,
    width: visible.width * scaleX,
    height: visible.height * scaleY,
  };
}
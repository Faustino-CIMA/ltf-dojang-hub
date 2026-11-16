import { MEMBER_PHOTO_HEIGHT, MEMBER_PHOTO_WIDTH } from "./member-photo-frame";
import { expandCrop, printWindowAfterRemoval } from "./photo-background";

import {
  FACE_BLUR_MIN,
  FACE_CENTER_X_MAX,
  FACE_CENTER_X_MIN,
  FACE_CENTER_Y_MAX,
  FACE_CENTER_Y_MIN,
  FACE_HAIR_ABOVE_MESH,
  FACE_HEAD_WIDTH_OVER_HEIGHT,
  FACE_HEIGHT_MAX,
  FACE_HEIGHT_MIN,
  framingGuideShape,
  GUIDE_OVAL_SCALE,
  GUIDE_OVAL_TRIM,
  GUIDE_SHIFT_DOWN,
  LIVE_FACE_INTERVAL_MS,
  LIVE_FACE_LONG_SIDE,
  boxBlurPlane,
  blurVarianceAtSampleSize,
  evaluateFaceCheck,
  evaluateFacePlacement,
  faceGuideReason,
  framingGuideState,
  evaluateLuma,
  faceBoxFromPoints,
  laplacianVariance,
  meanLuma,
  normalizeBoxToFrame,
  poseDegreesFromMatrix,
  reviewShowsSkippedFaceCheck,
  type FaceBox,
  type FaceObservation,
} from "./face-check";

function face(overrides: Partial<FaceObservation> = {}): FaceObservation {
  return {
    box: { x: 0.2, y: 0.1, width: 0.55, height: 0.7 },
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    ...overrides,
  };
}

function identityMatrix(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function rotationMatrix(axis: "yaw" | "pitch" | "roll", degrees: number): number[] {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (axis === "yaw") {
    return [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1];
  }
  if (axis === "pitch") {
    return [1, 0, 0, 0, 0, cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1];
  }
  return [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function solid(red: number, green: number, blue: number, count = 4): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index += 1) {
    pixels[index * 4] = red;
    pixels[index * 4 + 1] = green;
    pixels[index * 4 + 2] = blue;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

function edgePlane(width: number, height: number): Float32Array {
  const plane = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      plane[y * width + x] = x < width / 2 ? 0 : 255;
    }
  }
  return plane;
}

function bilinearUpscale(
  source: Float32Array,
  width: number,
  height: number,
  factor: number,
): { plane: Float32Array; width: number; height: number } {
  const nextWidth = width * factor;
  const nextHeight = height * factor;
  const plane = new Float32Array(nextWidth * nextHeight);
  for (let y = 0; y < nextHeight; y += 1) {
    const gy = nextHeight === 1 ? 0 : (y * (height - 1)) / (nextHeight - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < nextWidth; x += 1) {
      const gx = nextWidth === 1 ? 0 : (x * (width - 1)) / (nextWidth - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = gx - x0;
      plane[y * nextWidth + x] =
        source[y0 * width + x0] * (1 - fx) * (1 - fy) +
        source[y0 * width + x1] * fx * (1 - fy) +
        source[y1 * width + x0] * (1 - fx) * fy +
        source[y1 * width + x1] * fx * fy;
    }
  }
  return { plane, width: nextWidth, height: nextHeight };
}

function drawnFace(width: number, height: number): Float32Array {
  const plane = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x / width - 0.5) * 2;
      const ny = (y / height - 0.45) * 2;
      const inHead = (nx * nx) / 0.7 + ny * ny < 1;
      let value = inHead ? 158 - ny * 10 : 210;
      const eye = (center: number) =>
        Math.abs(x - center) < width * 0.06 && Math.abs(y - height * 0.38) < Math.max(2, height * 0.015);
      if (inHead && (eye(width * 0.35) || eye(width * 0.65))) {
        value = 28;
      }
      if (inHead && Math.abs(y - height * 0.7) < Math.max(1, height * 0.01) && Math.abs(x - width * 0.5) < width * 0.16) {
        value = 55;
      }
      if (inHead && y < height * 0.18) {
        value = 30;
      }
      plane[y * width + x] = value;
    }
  }
  return plane;
}

describe("face check rules", () => {
  it("accepts one centred frontal face and rejects the other shapes", () => {
    expect(evaluateFaceCheck({ faces: [face()], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("pass");
    expect(evaluateFaceCheck({ faces: [], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("none");
    expect(
      evaluateFaceCheck({ faces: [face(), face({ box: { x: 0.1, y: 0.1, width: 0.3, height: 0.6 } })], luma: 128, blurVariance: FACE_BLUR_MIN }),
    ).toBe("many");
    expect(evaluateFaceCheck({ faces: [face({ yawDeg: 20 })], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("pose");
    expect(evaluateFaceCheck({ faces: [face({ pitchDeg: 13 })], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("pose");
    expect(evaluateFaceCheck({ faces: [face({ rollDeg: 11 })], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("pose");
    expect(
      evaluateFaceCheck({
        faces: [face({ box: { x: 0.3, y: 0.34, width: 0.4, height: 0.22 } })],
        luma: 128,
        blurVariance: FACE_BLUR_MIN,
      }),
    ).toBe("size");
    expect(
      evaluateFaceCheck({
        faces: [face({ box: { x: 0.02, y: 0.1, width: 0.5, height: 0.7 } })],
        luma: 128,
        blurVariance: FACE_BLUR_MIN,
      }),
    ).toBe("size");
  });

  it("reads yaw, pitch, and roll from a column-major matrix", () => {
    const level = poseDegreesFromMatrix(identityMatrix());
    expect(level?.yawDeg).toBeCloseTo(0, 5);
    expect(level?.pitchDeg).toBeCloseTo(0, 5);
    expect(level?.rollDeg).toBeCloseTo(0, 5);
    const yaw = poseDegreesFromMatrix(rotationMatrix("yaw", 20));
    const pitch = poseDegreesFromMatrix(rotationMatrix("pitch", 20));
    const roll = poseDegreesFromMatrix(rotationMatrix("roll", -15));
    expect(yaw?.yawDeg).toBeCloseTo(20, 5);
    expect(yaw?.pitchDeg).toBeCloseTo(0, 5);
    expect(pitch?.pitchDeg).toBeCloseTo(20, 5);
    expect(roll?.rollDeg).toBeCloseTo(-15, 5);
  });

  it("builds a box from drawn points", () => {
    const box = faceBoxFromPoints([
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.9 },
    ]);
    expect(box?.x).toBeCloseTo(0.2, 5);
    expect(box?.y).toBeCloseTo(0.3, 5);
    expect(box?.width).toBeCloseTo(0.6, 5);
    expect(box?.height).toBeCloseTo(0.6, 5);
  });

  it("rejects a dark fill and a near-white fill, and keeps a mid grey", () => {
    expect(evaluateLuma(meanLuma(solid(20, 20, 20)))).toBe("dark");
    expect(evaluateLuma(meanLuma(solid(128, 128, 128)))).toBe("pass");
    expect(evaluateLuma(meanLuma(solid(250, 250, 250)))).toBe("bright");
  });

  it("accepts a drawn edge and rejects the same edge after a box blur", () => {
    const sharp = edgePlane(32, 32);
    const blurred = boxBlurPlane(sharp, 32, 32, 4);
    const sharpScore = laplacianVariance(sharp, 32, 32);
    const blurredScore = laplacianVariance(blurred, 32, 32);
    expect(sharpScore).toBeGreaterThanOrEqual(FACE_BLUR_MIN);
    expect(blurredScore).toBeLessThan(FACE_BLUR_MIN);
  });

  it("keeps a sharp drawn face above the blur limit and a smeared one below it", () => {
    const width = 240;
    const height = 300;
    const face = drawnFace(width, height);
    const sharpScore = laplacianVariance(face, width, height);
    const smearedScore = laplacianVariance(boxBlurPlane(face, width, height, 2), width, height);
    expect(sharpScore).toBeGreaterThan(FACE_BLUR_MIN);
    expect(smearedScore).toBeLessThan(FACE_BLUR_MIN);
  });

  it("keeps a sharp face that was spread across a phone-sized frame, and rejects a smeared one", () => {
    const width = 240;
    const height = 300;
    const sharp = drawnFace(width, height);
    const large = bilinearUpscale(sharp, width, height, 4);
    const rawLarge = laplacianVariance(large.plane, large.width, large.height);
    const sampledSharp = blurVarianceAtSampleSize(large.plane, large.width, large.height);
    const smeared = bilinearUpscale(boxBlurPlane(sharp, width, height, 3), width, height, 4);
    const sampledSmear = blurVarianceAtSampleSize(smeared.plane, smeared.width, smeared.height);
    expect(rawLarge).toBeLessThan(FACE_BLUR_MIN);
    expect(sampledSharp).toBeGreaterThanOrEqual(FACE_BLUR_MIN);
    expect(sampledSmear).toBeLessThan(FACE_BLUR_MIN);
    expect(evaluateFaceCheck({ faces: [face()], luma: 128, blurVariance: sampledSharp })).toBe("pass");
    expect(evaluateFaceCheck({ faces: [face()], luma: 128, blurVariance: sampledSmear })).toBe("blur");
  });

  it("accepts an identity-card framing before removal and on the print crop after it", () => {
    const print = { x: 100, y: 50, width: 200, height: 250 };
    const faceHeight = print.height * 0.34;
    const faceWidth = print.width * 0.36;
    const mesh: FaceBox = {
      x: print.x + (print.width - faceWidth) / 2,
      y: print.y + print.height * 0.3,
      width: faceWidth,
      height: faceHeight,
    };
    const before = normalizeBoxToFrame(mesh, print);
    const level = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
    expect(before.height).toBeCloseTo(0.34, 5);
    expect(evaluateFacePlacement([{ box: before, ...level }])).toBe("pass");

    const imageWidth = 800;
    const imageHeight = 1000;
    const window = printWindowAfterRemoval(imageWidth, imageHeight, print);
    const expanded = expandCrop(print, imageWidth, imageHeight);
    const meshAfter = {
      x: mesh.x - expanded.x,
      y: mesh.y - expanded.y,
      width: mesh.width,
      height: mesh.height,
    };
    const onPrintCrop = normalizeBoxToFrame(meshAfter, window);
    const onWholeRemoval = normalizeBoxToFrame(meshAfter, {
      x: 0,
      y: 0,
      width: expanded.width,
      height: expanded.height,
    });
    expect(onPrintCrop.height).toBeCloseTo(0.34, 2);
    expect(evaluateFacePlacement([{ box: onPrintCrop, ...level }])).toBe("pass");
    expect(onWholeRemoval.height).toBeLessThan(0.3);
    expect(evaluateFacePlacement([{ box: onWholeRemoval, ...level }])).toBe("size");
  });

  it("names the same adjustment the save rule would refuse", () => {
    const level = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
    const card = face({ box: { x: 0.32, y: 0.28, width: 0.36, height: 0.42 } });
    expect(faceGuideReason({ faces: [card], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("ready");
    expect(framingGuideState("ready")).toBe("ready");
    expect(
      evaluateFaceCheck({ faces: [card], luma: 128, blurVariance: FACE_BLUR_MIN }),
    ).toBe("pass");
    expect(
      faceGuideReason({
        faces: [face({ ...level, box: { x: 0.35, y: 0.4, width: 0.3, height: 0.22 } })],
        luma: 128,
        blurVariance: FACE_BLUR_MIN,
      }),
    ).toBe("closer");
    expect(
      faceGuideReason({
        faces: [face({ ...level, box: { x: 0.2, y: 0.1, width: 0.5, height: 0.75 } })],
        luma: 128,
        blurVariance: FACE_BLUR_MIN,
      }),
    ).toBe("further");
    expect(
      faceGuideReason({
        faces: [face({ ...level, box: { x: 0.02, y: 0.2, width: 0.4, height: 0.45 } })],
        luma: 128,
        blurVariance: FACE_BLUR_MIN,
      }),
    ).toBe("centre");
    expect(faceGuideReason({ faces: [face({ yawDeg: 20 })], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("turn");
    expect(faceGuideReason({ faces: [face({ rollDeg: 12 })], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("tilt");
    expect(faceGuideReason({ faces: [face({ pitchDeg: 14 })], luma: 128, blurVariance: FACE_BLUR_MIN })).toBe("chin");
    expect(faceGuideReason({ faces: [card], luma: 20, blurVariance: FACE_BLUR_MIN })).toBe("dark");
    expect(faceGuideReason({ faces: [card], luma: 128, blurVariance: 1, includeBlur: false })).toBe("ready");
    expect(framingGuideState("closer")).toBe("adjust");
    expect(framingGuideState("off")).toBe("off");
    expect(LIVE_FACE_INTERVAL_MS).toBe(250);
    expect(LIVE_FACE_LONG_SIDE).toBe(320);
  });

  it("draws a whole head around the face box the save rule accepts", () => {
    const shape = framingGuideShape(MEMBER_PHOTO_WIDTH, MEMBER_PHOTO_HEIGHT);
    const meshHeight = ((FACE_HEIGHT_MIN + FACE_HEIGHT_MAX) / 2) * MEMBER_PHOTO_HEIGHT;
    const meshCenterY = ((FACE_CENTER_Y_MIN + FACE_CENTER_Y_MAX) / 2) * MEMBER_PHOTO_HEIGHT;
    const meshTop = meshCenterY - meshHeight / 2;
    const chin = meshCenterY + meshHeight / 2;
    const fullHeight = meshHeight + meshHeight * FACE_HAIR_ABOVE_MESH;
    const shift = MEMBER_PHOTO_HEIGHT * GUIDE_SHIFT_DOWN;
    const round = (value: number) => Math.round(value * 10) / 10;
    const previousScale = 0.94;
    const previousCenterY = ((0.32 + 0.62) / 2) * MEMBER_PHOTO_HEIGHT;
    const previousShift = MEMBER_PHOTO_HEIGHT * 0.07;
    const previousRy = round((fullHeight * previousScale) / 2);
    const previousCy = round(previousCenterY - (meshHeight * FACE_HAIR_ABOVE_MESH) / 2 + previousShift);
    const untrimmedRy = round((fullHeight * GUIDE_OVAL_SCALE) / 2);
    const untrimmedCy = round(meshCenterY - (meshHeight * FACE_HAIR_ABOVE_MESH) / 2 + shift);
    const pinnedTop = untrimmedCy - untrimmedRy;
    expect(GUIDE_OVAL_SCALE).toBeGreaterThan(1);
    expect(GUIDE_OVAL_TRIM).toBeGreaterThan(0.9);
    expect(GUIDE_OVAL_TRIM).toBeLessThan(1);
    expect(GUIDE_SHIFT_DOWN).toBeGreaterThan(0.1);
    expect(shape.head.ry).toBe(round(untrimmedRy * GUIDE_OVAL_TRIM));
    expect(shape.head.ry).toBeLessThan(untrimmedRy);
    expect(shape.head.ry).toBeGreaterThan(previousRy * GUIDE_OVAL_TRIM);
    expect(shape.head.cy - shape.head.ry).toBeCloseTo(pinnedTop, 5);
    expect(pinnedTop).toBeLessThan(previousCy - previousRy);
    expect(shape.head.cy + shape.head.ry).toBeGreaterThan(previousCy + previousRy);
    expect(shape.head.rx).toBe(round(((fullHeight * GUIDE_OVAL_SCALE * FACE_HEAD_WIDTH_OVER_HEIGHT) / 2) * GUIDE_OVAL_TRIM));
    expect(shape.head.rx).toBeGreaterThan(round((previousRy * 2 * FACE_HEAD_WIDTH_OVER_HEIGHT) / 2) * GUIDE_OVAL_TRIM);
    expect(Math.abs(meshCenterY - shape.head.cy)).toBeLessThan(shape.head.ry);
    expect(shape.head.cy - shape.head.ry).toBeLessThan(meshTop);
    expect(shape.head.rx * 2).toBeCloseTo(shape.head.ry * 2 * FACE_HEAD_WIDTH_OVER_HEIGHT, 0);
    expect(shape.head.cx).toBeCloseTo(((FACE_CENTER_X_MIN + FACE_CENTER_X_MAX) / 2) * MEMBER_PHOTO_WIDTH, 0);
    const shoulders = shape.shoulders.match(/M ([\d.]+) ([\d.]+) Q ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/);
    expect(shoulders).not.toBeNull();
    const left = Number(shoulders?.[1]);
    const shoulderY = Number(shoulders?.[2]);
    const right = Number(shoulders?.[5]);
    expect(right - left).toBeGreaterThan(shape.head.rx * 2);
    expect(shoulderY).toBeLessThanOrEqual(MEMBER_PHOTO_HEIGHT * 0.96);
    expect(shoulderY).toBeGreaterThan(MEMBER_PHOTO_HEIGHT * 0.9);
    expect(shoulderY).toBeGreaterThan(chin);
  });

  it("treats a missing face check the same as a skipped one", () => {
    expect(reviewShowsSkippedFaceCheck(undefined)).toBe(true);
    expect(reviewShowsSkippedFaceCheck("skipped")).toBe(true);
    expect(reviewShowsSkippedFaceCheck("pass")).toBe(false);
  });
});

import { expandCrop, printWindowAfterRemoval } from "./photo-background";

import {
  FACE_BLUR_MIN,
  boxBlurPlane,
  evaluateFaceCheck,
  evaluateFacePlacement,
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

  it("treats a missing face check the same as a skipped one", () => {
    expect(reviewShowsSkippedFaceCheck(undefined)).toBe(true);
    expect(reviewShowsSkippedFaceCheck("skipped")).toBe(true);
    expect(reviewShowsSkippedFaceCheck("pass")).toBe(false);
  });
});

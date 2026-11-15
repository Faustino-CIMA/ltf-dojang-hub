import {
  MEMBER_PHOTO_ASPECT,
  MEMBER_PHOTO_HEIGHT,
  MEMBER_PHOTO_WIDTH,
  containedMediaRect,
  contentBoxAvoidingDarkEdges,
  memberPhotoAspectRatio,
  printCropInFrame,
  printCropInsideContent,
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

  it("keeps the print crop off a dark band at the bottom of the frame", () => {
    const width = 80;
    const height = 60;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const dark = y >= 54;
        pixels[index] = dark ? 0 : 180;
        pixels[index + 1] = dark ? 0 : 180;
        pixels[index + 2] = dark ? 0 : 180;
        pixels[index + 3] = 255;
      }
    }
    const content = contentBoxAvoidingDarkEdges(pixels, width, height);
    expect(content.y).toBe(0);
    expect(content.height).toBe(54);
    const crop = printCropInsideContent(content);
    expect(crop.y + crop.height).toBeLessThanOrEqual(54);
    expect(crop.width / crop.height).toBeCloseTo(MEMBER_PHOTO_ASPECT, 2);
  });
});
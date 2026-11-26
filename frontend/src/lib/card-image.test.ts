import { binarizeSharpen, contrastStretch, invertContrast, rotateQuarter } from "./card-image";

function solid(width: number, height: number, value: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

describe("card picture passes", () => {
  it("stretches a flat grey range out to black and white", () => {
    const image = solid(2, 1, 0);
    image.data[0] = 40;
    image.data[1] = 40;
    image.data[2] = 40;
    image.data[4] = 80;
    image.data[5] = 80;
    image.data[6] = 80;
    const stretched = contrastStretch(image);
    expect(stretched.data[0]).toBe(0);
    expect(stretched.data[4]).toBe(255);
  });

  it("turns a dark mark on a light field into black", () => {
    const image = solid(5, 5, 220);
    const center = (2 * 5 + 2) * 4;
    image.data[center] = 20;
    image.data[center + 1] = 20;
    image.data[center + 2] = 20;
    const binary = binarizeSharpen(image);
    expect(binary.data[center]).toBe(0);
    expect(binary.data[0]).toBe(255);
  });

  it("inverts a stretched picture", () => {
    const image = solid(1, 1, 0);
    const inverted = invertContrast(image);
    expect(inverted.data[0]).toBe(255);
  });

  it("rotates a pixel a quarter turn", () => {
    const image = solid(2, 1, 0);
    image.data[0] = 10;
    const turned = rotateQuarter(image, 1);
    expect(turned.width).toBe(1);
    expect(turned.height).toBe(2);
    expect(turned.data[0]).toBe(10);
  });
});

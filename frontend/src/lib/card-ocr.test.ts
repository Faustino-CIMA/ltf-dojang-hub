import { readCardImage } from "./card-ocr";

const recognize = jest.fn(async () => ({ data: { text: "ADA EXAMPLE\n" } }));
const terminate = jest.fn(async () => undefined);
const createWorker = jest.fn(
  async (_langs: string, _oem: number, _options: Record<string, unknown>) => ({ recognize, terminate }),
);

jest.mock("tesseract.js", () => ({
  createWorker: (langs: string, oem: number, options: Record<string, unknown>) =>
    createWorker(langs, oem, options),
}));

describe("readCardImage", () => {
  it("reads English on this device and then clears the picture", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;

    const text = await readCardImage(canvas);

    expect(text).toBe("ADA EXAMPLE\n");
    expect(createWorker).toHaveBeenCalledWith("eng", 1, {
      workerPath: `${window.location.origin}/ocr/worker.min.js`,
      corePath: `${window.location.origin}/ocr`,
      langPath: `${window.location.origin}/ocr`,
      workerBlobURL: false,
      gzip: true,
    });
    const options = JSON.stringify(createWorker.mock.calls[0][2]);
    expect(options).not.toMatch(/jsdelivr|cdn\.jsdelivr|projectnaptha/i);
    expect(recognize).toHaveBeenCalledWith(canvas);
    expect(terminate).toHaveBeenCalled();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

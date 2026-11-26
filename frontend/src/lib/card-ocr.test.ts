import { readCardOnDevice, releaseCardReader } from "./card-ocr";

const recognize = jest.fn(async () => ({
  data: { text: "NOM Silva\nPRENOMS Ana\n1893120105732\n" },
}));
const setParameters = jest.fn(async () => undefined);
const terminate = jest.fn(async () => undefined);
const createWorker = jest.fn(async (_langs: string, _oem: number, _options: Record<string, unknown>) => ({
  recognize,
  setParameters,
  terminate,
}));

jest.mock("tesseract.js", () => ({
  createWorker: (langs: string, oem: number, options: Record<string, unknown>) =>
    createWorker(langs, oem, options),
}));

describe("readCardOnDevice", () => {
  beforeEach(async () => {
    recognize.mockClear();
    setParameters.mockClear();
    terminate.mockClear();
    createWorker.mockClear();
    await releaseCardReader();
  });

  it("reuses one on-device reader and then clears the picture", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 20;
    const read = await readCardOnDevice(canvas, "LU");
    const again = document.createElement("canvas");
    again.width = 20;
    again.height = 10;
    await readCardOnDevice(again, "LU");

    expect(read).toMatchObject({ ok: true, number: "1893120105732" });
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker).toHaveBeenCalledWith("eng", 1, expect.objectContaining({
      workerPath: `${window.location.origin}/ocr/worker.min.js`,
      corePath: `${window.location.origin}/ocr`,
      langPath: `${window.location.origin}/ocr`,
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "none",
      cachePath: "tesseract-5.1.1",
    }));
    const options = JSON.stringify(createWorker.mock.calls[0][2]);
    expect(options).not.toMatch(/jsdelivr|cdn\.jsdelivr|projectnaptha/i);
    expect(canvas.width).toBe(0);
    expect(again.width).toBe(0);
    expect(terminate).not.toHaveBeenCalled();
    await releaseCardReader();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("says the reader did not start when the engine fails", async () => {
    createWorker.mockRejectedValueOnce(new Error("wasm"));
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    await expect(readCardOnDevice(canvas, "LU")).rejects.toMatchObject({ kind: "start" });
    expect(canvas.width).toBe(0);
  });
});

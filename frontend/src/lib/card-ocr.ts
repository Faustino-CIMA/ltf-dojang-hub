/**
 * Read a card on this phone. The canvas is cleared before this function returns.
 * Nothing here uploads the picture.
 */

export async function readCardImage(canvas: HTMLCanvasElement): Promise<string> {
  const origin = window.location.origin;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr`,
    langPath: `${origin}/ocr`,
    workerBlobURL: false,
    gzip: true,
  });
  try {
    const result = await worker.recognize(canvas);
    return result.data.text || "";
  } finally {
    await worker.terminate();
    canvas.width = 0;
    canvas.height = 0;
  }
}

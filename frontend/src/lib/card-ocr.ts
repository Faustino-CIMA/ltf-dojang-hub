/**
 * Read a card on this phone. Canvases are cleared before this returns.
 * Nothing here uploads the picture.
 */
import { readCardText, type CardCountry, type CardRead } from "@/lib/card-read";
import {
  binarizeSharpen,
  contrastStretch,
  downscaleCanvas,
  invertContrast,
  rotateQuarter,
  type Rgba,
} from "@/lib/card-image";

type Reader = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text?: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

export class CardReaderStartError extends Error {
  readonly kind = "start" as const;
}

let readerPromise: Promise<Reader> | null = null;

function wipe(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function readerOptions() {
  const origin = window.location.origin;
  return {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr`,
    langPath: `${origin}/ocr`,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: "none" as const,
    cachePath: "tesseract-5.1.1",
  };
}

async function createReader(): Promise<Reader> {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", 1, readerOptions()) as Promise<Reader>;
}

async function sharedReader() {
  if (!readerPromise) {
    readerPromise = createReader().catch((error: unknown) => {
      readerPromise = null;
      throw error;
    });
  }
  return readerPromise;
}

export async function releaseCardReader() {
  const pending = readerPromise;
  readerPromise = null;
  if (!pending) {
    return;
  }
  try {
    const reader = await pending;
    await reader.terminate();
  } catch {
    /* The reader never started. */
  }
}

function canvasFrom(image: Rgba) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    wipe(canvas);
    return null;
  }
  const pixels = new Uint8ClampedArray(image.data);
  context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  return canvas;
}

async function recognize(reader: Reader, image: Rgba, mode: "3" | "6") {
  await reader.setParameters({ tessedit_pageseg_mode: mode });
  const canvas = canvasFrom(image);
  if (!canvas) {
    return "";
  }
  try {
    const result = await reader.recognize(canvas);
    return result.data.text || "";
  } finally {
    wipe(canvas);
  }
}

async function firstRead(reader: Reader, image: Rgba, country: CardCountry, mode: "3" | "6") {
  const text = await recognize(reader, image, mode);
  return readCardText(country, text);
}

export async function readCardOnDevice(canvas: HTMLCanvasElement, country: CardCountry): Promise<CardRead> {
  try {
    downscaleCanvas(canvas);
    const context = canvas.getContext("2d");
    let reader: Reader;
    try {
      reader = await sharedReader();
    } catch {
      throw new CardReaderStartError("The card reader did not start.");
    }
    let original: ImageData | null = null;
    try {
      if (context && canvas.width > 0 && canvas.height > 0) {
        original = context.getImageData(0, 0, canvas.width, canvas.height);
      }
    } catch {
      original = null;
    }
    if (!original) {
      const result = await reader.recognize(canvas);
      return readCardText(country, result.data.text || "");
    }
    const source: Rgba = { width: original.width, height: original.height, data: original.data };
    const contrast = contrastStretch(source);
    const passes = [contrast, binarizeSharpen(source), invertContrast(source)];
    for (const image of passes) {
      const read = await firstRead(reader, image, country, "3");
      if (read.ok) {
        return read;
      }
    }
    const tight = await firstRead(reader, contrast, country, "6");
    if (tight.ok) {
      return tight;
    }
    for (const turns of [1, 2, 3] as const) {
      const turned = rotateQuarter(contrast, turns);
      const read = await firstRead(reader, turned, country, "6");
      if (read.ok) {
        return read;
      }
    }
    return { ok: false, reason: "unreadable" };
  } catch (error) {
    if (error instanceof CardReaderStartError) {
      throw error;
    }
    await releaseCardReader();
    throw new CardReaderStartError("The card reader did not start.");
  } finally {
    wipe(canvas);
  }
}

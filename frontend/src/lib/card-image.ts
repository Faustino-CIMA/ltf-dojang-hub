/** In-memory card picture helpers. Callers wipe the canvas after each pass. */

export const CARD_CAPTURE_MAX = 1600;

export type Rgba = { width: number; height: number; data: Uint8ClampedArray };

function grayOf(data: Uint8ClampedArray) {
  const gray = new Uint8Array(data.length / 4);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    gray[pixel] = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }
  return gray;
}

function paintGray(width: number, height: number, gray: Uint8Array): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0, index = 0; pixel < gray.length; pixel += 1, index += 4) {
    const value = gray[pixel];
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { width, height, data };
}

export function downscaleCanvas(canvas: HTMLCanvasElement, maxSide = CARD_CAPTURE_MAX) {
  const longSide = Math.max(canvas.width, canvas.height);
  if (longSide <= maxSide || canvas.width === 0 || canvas.height === 0) {
    return;
  }
  const scale = maxSide / longSide;
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const copied = copy.getContext("2d");
  if (!copied) {
    copy.width = 0;
    copy.height = 0;
    return;
  }
  copied.drawImage(canvas, 0, 0);
  canvas.width = width;
  canvas.height = height;
  context.drawImage(copy, 0, 0, width, height);
  copy.width = 0;
  copy.height = 0;
}

export function contrastStretch(image: Rgba): Rgba {
  const gray = grayOf(image.data);
  let min = 255;
  let max = 0;
  for (const value of gray) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = Math.max(1, max - min);
  const stretched = new Uint8Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    stretched[index] = Math.round(((gray[index] - min) * 255) / span);
  }
  return paintGray(image.width, image.height, stretched);
}

function integral(gray: Uint8Array, width: number, height: number) {
  const sums = new Float64Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += gray[(y - 1) * width + (x - 1)];
      sums[y * stride + x] = sums[(y - 1) * stride + x] + row;
    }
  }
  return sums;
}

function areaSum(sums: Float64Array, width: number, x0: number, y0: number, x1: number, y1: number) {
  const stride = width + 1;
  return sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
}

function sharpenGray(gray: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = y * width + x;
      const up = (y > 0 ? y - 1 : y) * width + x;
      const down = (y + 1 < height ? y + 1 : y) * width + x;
      const left = y * width + (x > 0 ? x - 1 : x);
      const right = y * width + (x + 1 < width ? x + 1 : x);
      const value = gray[here] * 5 - gray[up] - gray[down] - gray[left] - gray[right];
      out[here] = Math.max(0, Math.min(255, value));
    }
  }
  return out;
}

/** Local contrast, a light sharpen, then a black/white threshold. */
export function binarizeSharpen(image: Rgba): Rgba {
  const gray = grayOf(image.data);
  const width = image.width;
  const height = image.height;
  const sums = integral(gray, width, height);
  const radius = 8;
  const local = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const mean = areaSum(sums, width, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      const boosted = 128 + (gray[y * width + x] - mean) * 1.6;
      local[y * width + x] = Math.max(0, Math.min(255, Math.round(boosted)));
    }
  }
  const sharp = sharpenGray(local, width, height);
  for (let index = 0; index < sharp.length; index += 1) {
    sharp[index] = sharp[index] < 140 ? 0 : 255;
  }
  return paintGray(width, height, sharp);
}

export function invertContrast(image: Rgba): Rgba {
  const stretched = contrastStretch(image);
  for (let index = 0; index < stretched.data.length; index += 4) {
    const value = 255 - stretched.data[index];
    stretched.data[index] = value;
    stretched.data[index + 1] = value;
    stretched.data[index + 2] = value;
  }
  return stretched;
}

export function rotateQuarter(image: Rgba, turns: 1 | 2 | 3): Rgba {
  let current = image;
  for (let step = 0; step < turns; step += 1) {
    const width = current.height;
    const height = current.width;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        const from = (y * current.width + x) * 4;
        const nextX = current.height - 1 - y;
        const nextY = x;
        const to = (nextY * width + nextX) * 4;
        data[to] = current.data[from];
        data[to + 1] = current.data[from + 1];
        data[to + 2] = current.data[from + 2];
        data[to + 3] = current.data[from + 3];
      }
    }
    current = { width, height, data };
  }
  return current;
}

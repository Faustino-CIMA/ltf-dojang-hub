/**
 * Brave Shields can scramble canvas reads or block the removal files.
 * The probe is a private canvas, never the member's photo.
 */

const PROBE_RED = 0x12;
const PROBE_GREEN = 0x34;
const PROBE_BLUE = 0x56;

export function canvasReadbackIsStable(): boolean {
  if (typeof document === "undefined") {
    return true;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return true;
  }
  context.fillStyle = "#123456";
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== PROBE_RED || pixels[index + 1] !== PROBE_GREEN || pixels[index + 2] !== PROBE_BLUE) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

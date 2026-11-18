import QRCode from "qrcode";

/** One CSS pixel per quarter of a module keeps the blocks crisp and the code small. */
export const HANDOFF_PX_PER_MODULE = 4;
/** ISO quiet zone: four modules of light margin on every side. */
export const HANDOFF_QUIET_ZONE = 4;
/** Never let the picture grow past this, even if a longer address needs more modules. */
export const HANDOFF_QR_MAX_PX = 200;

export function handoffQrPixelSize(moduleCount: number) {
  return (moduleCount + HANDOFF_QUIET_ZONE * 2) * HANDOFF_PX_PER_MODULE;
}

/**
 * Filled squares, not hairline strokes, with an explicit pixel size.
 * A production hand-off address is a version-5 code: 37 modules, 45 with the
 * quiet zone, so this is 180 CSS px. That is about four pixels per module.
 */
export function handoffQrMarkup(url: string): string {
  const symbol = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = symbol.modules.size;
  const span = count + HANDOFF_QUIET_ZONE * 2;
  const px = Math.min(handoffQrPixelSize(count), HANDOFF_QR_MAX_PX);
  let blocks = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!symbol.modules.get(row, col)) {
        continue;
      }
      const x = col + HANDOFF_QUIET_ZONE;
      const y = row + HANDOFF_QUIET_ZONE;
      blocks += `M${x} ${y}h1v1h-1z`;
    }
  }
  if (!blocks) {
    throw new Error("empty");
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" ` +
    `width="${px}" height="${px}" shape-rendering="crispEdges" ` +
    `style="image-rendering:pixelated;max-width:min(${HANDOFF_QR_MAX_PX}px,100%);height:auto" role="img">` +
    `<rect width="${span}" height="${span}" fill="var(--brand-on-ink)"/>` +
    `<path fill="var(--brand-ink)" d="${blocks}"/>` +
    `</svg>`
  );
}

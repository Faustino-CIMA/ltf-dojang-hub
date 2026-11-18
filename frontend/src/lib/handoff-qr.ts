import QRCode from "qrcode";

/** CSS pixels. Large enough for a phone camera held at a normal distance from a monitor. */
export const HANDOFF_QR_PX = 320;

const QUIET_ZONE = 4;

/**
 * A square code drawn as filled blocks, with a four-module quiet zone.
 * The browser build of the qrcode package otherwise emits an SVG with no
 * width or height, and the page then shrinks it to the padding around it.
 */
export function handoffQrMarkup(url: string): string {
  const symbol = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = symbol.modules.size;
  const span = count + QUIET_ZONE * 2;
  let blocks = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!symbol.modules.get(row, col)) {
        continue;
      }
      const x = col + QUIET_ZONE;
      const y = row + QUIET_ZONE;
      blocks += `M${x} ${y}h1v1h-1z`;
    }
  }
  if (!blocks) {
    throw new Error("empty");
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" ` +
    `width="${HANDOFF_QR_PX}" height="${HANDOFF_QR_PX}" shape-rendering="crispEdges" role="img">` +
    `<rect width="${span}" height="${span}" fill="var(--brand-on-ink)"/>` +
    `<path fill="var(--brand-ink)" d="${blocks}"/>` +
    `</svg>`
  );
}

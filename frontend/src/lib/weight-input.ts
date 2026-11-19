/** Round a typed kilogram value to two decimals. A comma is a decimal mark. */

export function parseWeightKg(
  raw: string,
  bounds: { min: number; max: number } = { min: 10, max: 150 },
): string | null {
  let text = raw.trim().replace(/[\s\u00a0]/g, "");
  if (!text) {
    return null;
  }
  if (text.includes(",") && text.includes(".")) {
    return null;
  }
  text = text.replace(",", ".");
  if (text.endsWith(".")) {
    text = text.slice(0, -1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return null;
  }
  const [whole, fraction = ""] = text.split(".");
  const digits = `${fraction}000`;
  let hundredths =
    Number(whole) * 100 + Number(digits[0]) * 10 + Number(digits[1]) + (Number(digits[2]) >= 5 ? 1 : 0);
  if (hundredths < 0) {
    return null;
  }
  const minHundredths = Math.round(bounds.min * 100);
  const maxHundredths = Math.round(bounds.max * 100);
  if (hundredths < minHundredths || hundredths > maxHundredths) {
    return null;
  }
  const wholeOut = Math.floor(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, "0");
  return `${wholeOut}.${frac}`;
}

/** Round a typed kilogram value to one decimal. A comma is a decimal mark. */

export function parseWeightKg(
  raw: string,
  bounds: { min: number; max: number } = { min: 10, max: 250 },
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
  const digits = `${fraction}00`;
  const tenths = Number(whole) * 10 + Number(digits[0]) + (Number(digits[1]) >= 5 ? 1 : 0);
  const minTenths = Math.round(bounds.min * 10);
  const maxTenths = Math.round(bounds.max * 10);
  if (tenths < minTenths || tenths > maxTenths) {
    return null;
  }
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

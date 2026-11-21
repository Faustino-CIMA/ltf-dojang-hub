/** Bullets for every character except the last four. A short or empty value stays empty. */
export function maskSecretNumber(value: string): string {
  const text = value ?? "";
  if (text.length < 4) {
    return "";
  }
  return `${"•".repeat(text.length - 4)}${text.slice(-4)}`;
}

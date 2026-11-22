/** One fixed mask. The length does not follow the stored number, and no character of it is shown. */
export const MASKED_SECRET_NUMBER = "•••••••••••••";

export function isMaskedSecretNumber(value: string): boolean {
  const text = value ?? "";
  return text.length > 0 && [...text].every((character) => character === "•");
}

export function maskSecretNumber(value: string): string {
  const text = value ?? "";
  if (!text) {
    return "";
  }
  return MASKED_SECRET_NUMBER;
}

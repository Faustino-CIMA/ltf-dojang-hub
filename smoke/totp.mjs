import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function decodeBase32(secret) {
  const cleaned = secret.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const char of cleaned) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error("The smoke authenticator secret is not base32.");
    }
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totp(secret, at = new Date()) {
  const counter = Math.floor(at.getTime() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(binary).padStart(6, "0");
}

let lastCounter = -1;

export function invalidateTotpWindow() {
  lastCounter = Math.floor(Date.now() / 1000 / 30);
}

export async function freshTotp(secret) {
  let counter = Math.floor(Date.now() / 1000 / 30);
  if (counter === lastCounter) {
    const waitMs = (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastCounter = Math.floor(Date.now() / 1000 / 30);
  return totp(secret);
}

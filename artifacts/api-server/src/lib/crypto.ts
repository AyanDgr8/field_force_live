/**
 * AES-256-GCM encryption for vendor credentials stored at rest.
 * Key: CREDENTIALS_ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
 *
 * SECURITY RULES:
 *  - Never log plaintext, never return credentials in API responses.
 *  - Only call decrypt() server-side, immediately before an outbound vendor call.
 *  - If CREDENTIALS_ENCRYPTION_KEY is unset, a dev-only fallback is used with a warning.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;

const DEV_FALLBACK_KEY = "0".repeat(64); // 32 zero-bytes — only for local dev

function getKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY ?? DEV_FALLBACK_KEY;
  if (hex === DEV_FALLBACK_KEY) {
    // Warn once at startup (see devicePoller.ts)
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY must be ${KEY_LEN * 2} hex chars (got ${hex.length})`
    );
  }
  return key;
}

/** Encrypt plaintext → iv:tag:ciphertext (all hex, colon-separated). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypt ciphertext produced by encrypt(). Throws on tampered data. */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}

export function isUsingDevFallbackKey(): boolean {
  return !process.env.CREDENTIALS_ENCRYPTION_KEY;
}

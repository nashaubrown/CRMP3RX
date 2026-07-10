import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Symmetric encryption for secrets stored at rest (e.g. the AI provider API
// key). The key is derived from AUTH_SECRET, so no new env var is needed; the
// derived key is memoized (scrypt is deliberately slow).

let cachedKey: Buffer | null = null;
function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET || "insecure-dev-secret";
  cachedKey = scryptSync(secret, "perx-secret-encryption-v1", 32);
  return cachedKey;
}

// Returns "iv:tag:ciphertext" (all hex).
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

// Returns null if the payload is malformed or was encrypted under a different
// secret (e.g. AUTH_SECRET rotated).
export function decryptSecret(payload: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = payload.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

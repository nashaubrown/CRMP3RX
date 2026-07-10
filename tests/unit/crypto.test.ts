import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("secret encryption", () => {
  it("round-trips a value", () => {
    const secret = "gsk_live_abcDEF1234567890";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret); // ciphertext, not plaintext
    expect(enc.split(":")).toHaveLength(3); // iv:tag:cipher
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("returns null for tampered or malformed payloads", () => {
    const enc = encryptSecret("hello");
    const [iv, tag, data] = enc.split(":");
    // Flip a byte in the ciphertext -> GCM auth fails
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}00`;
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("not-valid")).toBeNull();
    expect(decryptSecret("")).toBeNull();
  });
});

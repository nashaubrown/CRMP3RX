import { randomInt } from "node:crypto";

// A referral code gets read down the phone, written on paper and typed back
// in, so the alphabet drops every character that gets confused along the way:
// 0/O, 1/I/L and U/V. That leaves 30 symbols -> 30^6 = 729,000,000 codes.
export const AFFILIATE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const AFFILIATE_CODE_LENGTH = 6;

export function generateAffiliateCode(): string {
  let out = "";
  for (let i = 0; i < AFFILIATE_CODE_LENGTH; i++) {
    // randomInt (CSPRNG, rejection-sampled) rather than Math.random, so codes
    // aren't guessable from one another.
    out += AFFILIATE_CODE_ALPHABET[randomInt(AFFILIATE_CODE_ALPHABET.length)];
  }
  return out;
}

// Tidies what a human typed before a lookup. Only case and separators are
// safe to fix: the excluded characters have no counterpart in the alphabet,
// so silently rewriting an "O" would invent a different code.
export function normalizeAffiliateCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isValidAffiliateCode(code: string): boolean {
  return (
    code.length === AFFILIATE_CODE_LENGTH &&
    [...code].every((c) => AFFILIATE_CODE_ALPHABET.includes(c))
  );
}

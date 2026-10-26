// Generates the same 6-digit codes as an authenticator app (RFC 6238 "TOTP"),
// so the tests can complete the MFA step. It mirrors what pyotp does in the API.
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Authenticator secrets are written in base32 (A–Z, 2–7); turn one back into bytes. */
function base32ToBytes(secret: string): Buffer {
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error(`Not a base32 character: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, now: number = Date.now()): string {
  // 1. Which 30-second window are we in?
  const counter = Math.floor(now / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  // 2. Sign the window number with the shared secret.
  const hash = createHmac("sha1", base32ToBytes(secret)).update(message).digest();
  // 3. "Dynamic truncation": pick 4 bytes from the hash and keep 6 digits.
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

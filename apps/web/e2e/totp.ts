// Generates the same 6-digit codes as an authenticator app (RFC 6238 "TOTP"),
// so the tests can complete the MFA step. It mirrors what pyotp does in the API.
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// ---- One code per 30-second window ----
// The API accepts each code only once (no replays), and accepts the previous
// and next window too. Tests sign in many times, so `freshCode` hands out a
// code from a window that hasn't been used yet: the current one, else the next,
// else it waits. The last window used is kept in a temp file, so separate test
// runs against the same server don't collide either.

const PERIOD_MS = 30_000;

function stateFile(secret: string): string {
  const id = createHash("sha256").update(secret).digest("hex").slice(0, 12);
  return join(tmpdir(), `gin-cabinet-e2e-totp-${id}`);
}

export async function freshCode(secret: string): Promise<string> {
  let last = -1;
  try {
    last = Number(readFileSync(stateFile(secret), "utf8")) || -1;
  } catch {
    // first sign-in of this run
  }
  const current = () => Math.floor(Date.now() / PERIOD_MS);
  const step = Math.max(current(), last + 1);
  while (step > current() + 1) {
    await new Promise((resolve) => setTimeout(resolve, 500)); // rare: wait for the next window
  }
  writeFileSync(stateFile(secret), String(step));
  return totp(secret, step * PERIOD_MS);
}

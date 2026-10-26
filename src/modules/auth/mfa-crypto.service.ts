import crypto from "node:crypto";
import type { AppConfig } from "../../config/env.js";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export class MfaCryptoService {
  private readonly encryptionKey: Buffer;

  constructor(config: AppConfig) {
    this.encryptionKey = Buffer.from(config.MFA_ENCRYPTION_KEY, "base64");
  }

  createSecret(): string {
    return encodeBase32(crypto.randomBytes(20));
  }

  encrypt(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
  }

  decrypt(encrypted: string): string {
    const [ivValue, tagValue, ciphertextValue] = encrypted.split(".");
    if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted MFA secret");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  verifyTotp(secret: string, suppliedCode: string, now = Date.now()): number | undefined {
    const currentStep = Math.floor(now / 30_000);
    for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
      const expected = generateTotp(secret, step);
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(suppliedCode))) return step;
    }
    return undefined;
  }

  createRecoveryCodes(count = 10): { raw: string[]; hashes: string[] } {
    const raw = Array.from({ length: count }, () => {
      const value = crypto.randomBytes(8).toString("hex").toUpperCase();
      return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
    });
    return { raw, hashes: raw.map((code) => this.hashRecoveryCode(code)) };
  }

  hashRecoveryCode(code: string): string {
    return crypto.createHmac("sha256", this.encryptionKey)
      .update(code.replaceAll("-", "").toUpperCase())
      .digest("hex");
  }
}

function generateTotp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let output = "";
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(accumulator << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

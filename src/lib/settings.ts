import { createCipheriv, createDecipheriv, createPublicKey, randomBytes, scryptSync } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Encrypted app settings (API keys & secrets) stored in the DB.
 * Values are AES-256-GCM encrypted with a key derived from AUTH_SECRET,
 * so a DB leak alone doesn't expose them. Env vars always win when set.
 */

const ALGO = "aes-256-gcm";

function encKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — cannot encrypt settings.");
  return scryptSync(secret, "the-tool-settings", 32);
}

export function encryptValue(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptValue(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Setting keys the Settings page manages. */
export const SETTING_DEFS = [
  {
    key: "NVIDIA_API_KEY",
    label: "NVIDIA API Key",
    hint: "Powers all AI: analysis, Refine chat, doc generation. Get one at build.nvidia.com.",
    secret: true,
    env: "NVIDIA_API_KEY",
  },
  {
    key: "NVIDIA_MODEL",
    label: "NVIDIA Model (optional)",
    hint: "Defaults to meta/llama-3.2-11b-vision-instruct when empty.",
    secret: false,
    env: "NVIDIA_MODEL",
  },
  {
    key: "CRON_SECRET",
    label: "Cron Secret",
    hint: "Bearer token the daily watchlist job uses to trigger scans. (Older method, no longer used.)",
    secret: true,
    env: "CRON_SECRET",
  },
  {
    key: "CRON_PUBLIC_KEY",
    label: "Cron Public Key",
    hint: "Ed25519 public key (PEM). The daily watchlist job signs its requests with the matching private key — paste the public key here and the job authenticates without any shared secret.",
    secret: false,
    env: "CRON_PUBLIC_KEY",
    multiline: true,
  },
] as const;

export type SettingKey = (typeof SETTING_DEFS)[number]["key"];

/** Read a setting: env var first, then the encrypted DB value. */
export async function getSetting(key: string): Promise<string | null> {
  const def = SETTING_DEFS.find((d) => d.key === key);
  if (def?.env && process.env[def.env]) return process.env[def.env]!;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    if (!row?.value) return null;
    return decryptValue(row.value);
  } catch {
    return null;
  }
}

/** Write an encrypted setting (empty string deletes it). */
export async function setSetting(key: string, plain: string): Promise<void> {
  if (!plain) {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
    return;
  }
  const value = key === "CRON_PUBLIC_KEY" ? normalizePublicKeyPem(plain) : plain;
  if (key === "CRON_PUBLIC_KEY") {
    try {
      createPublicKey(value);
    } catch {
      throw new Error("Invalid public key: CRON_PUBLIC_KEY must be a valid PEM public key.");
    }
  }
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: encryptValue(value) },
    update: { value: encryptValue(value) },
  });
}

/**
 * Rebuild a valid PEM block from a pasted Ed25519 public key, tolerating the
 * ways a paste can get mangled (notably: single-line <input> fields strip
 * newlines, so a 3-line PEM arrives as one long line and OpenSSL rejects it).
 * Non-PEM input is returned unchanged.
 */
export function normalizePublicKeyPem(pem: string): string {
  const m = pem.match(
    /-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PUBLIC KEY-----/
  );
  if (!m) return pem;
  const b64 = m[1].replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length === 0) return pem;
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

/** For the Settings UI: which keys are configured (never returns values). */
export async function settingsStatus(): Promise<
  { key: string; label: string; hint: string; secret: boolean; multiline: boolean; configured: boolean; fromEnv: boolean; updatedAt: string | null }[]
> {
  return Promise.all(
    SETTING_DEFS.map(async (d) => {
      const fromEnv = !!process.env[d.env];
      let configured = fromEnv;
      let updatedAt: string | null = null;
      if (!fromEnv) {
        const row = await prisma.appSetting.findUnique({ where: { key: d.key } }).catch(() => null);
        configured = !!row?.value;
        updatedAt = row?.updatedAt?.toISOString() ?? null;
      }
      return { key: d.key, label: d.label, hint: d.hint, secret: d.secret, multiline: "multiline" in d && !!(d as { multiline?: boolean }).multiline, configured, fromEnv, updatedAt };
    })
  );
}

import { createHash, createPublicKey, verify } from "crypto";
import { getSetting, normalizePublicKeyPem } from "@/lib/settings";

function bearerEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify the daily cron job's authentication on an incoming request.
 * Accepts either the legacy CRON_SECRET bearer token or the Ed25519
 * body-bound signature (X-Cron-Timestamp + X-Cron-Signature headers).
 */
export async function verifyCronAuth(
  req: Request,
  rawBody: string
): Promise<boolean> {
  const secret = await getSetting("CRON_SECRET");
  const auth = req.headers.get("authorization") ?? "";
  if (secret && bearerEquals(auth, `Bearer ${secret}`)) return true;

  try {
    const raw = await getSetting("CRON_PUBLIC_KEY");
    if (!raw) return false;
    const pem = normalizePublicKeyPem(raw);
    const ts = req.headers.get("x-cron-timestamp");
    const sigB64 = req.headers.get("x-cron-signature");
    if (!ts || !sigB64) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) return false; // 5 min freshness
    const pub = createPublicKey(pem.trim());
    const sig = Buffer.from(sigB64, "base64");
    const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    const message = [
      ts,
      req.method.toUpperCase(),
      new URL(req.url).pathname,
      bodyHash,
    ].join("\n");
    if (verify(null, Buffer.from(message, "utf8"), pub, sig)) return true;
    // LEGACY fallback: timestamp-only message.
    if (verify(null, Buffer.from(ts, "utf8"), pub, sig)) {
      console.warn(
        "[cron-auth] accepted legacy timestamp-only cron signature — fallback scheduled for removal"
      );
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

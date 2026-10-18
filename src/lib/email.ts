import { getSetting } from "@/lib/settings";

/**
 * Send a transactional email via Resend (https://resend.com).
 * API key comes from RESEND_API_KEY (Settings UI or env var).
 * From address defaults to onboarding@resend.dev (works without a
 * verified domain, but only sends to the account owner's email).
 * Set RESEND_FROM in Settings to use a verified domain address.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = await getSetting("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it in Settings → Resend API Key."
    );
  }
  const from = (await getSetting("RESEND_FROM")) || "onboarding@resend.dev";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
  }
}

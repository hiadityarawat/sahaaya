import { env } from "cloudflare:workers";

type EmailRuntime = typeof env & {
  RESEND_API_KEY?: string;
  SAHAAYA_EMAIL_FROM?: string;
  SAHAAYA_PUBLIC_URL?: string;
};

const runtime = () => env as EmailRuntime;

export function emailDeliveryConfigured() {
  const current = runtime();
  return Boolean(current.RESEND_API_KEY && current.SAHAAYA_EMAIL_FROM);
}

export function publicOrigin(request: Request) {
  const configured = runtime().SAHAAYA_PUBLIC_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.origin;
    } catch { /* Invalid configured origin falls back to the trusted request origin. */ }
  }
  return new URL(request.url).origin;
}

export async function sendAccountEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const current = runtime();
  if (!current.RESEND_API_KEY || !current.SAHAAYA_EMAIL_FROM) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${current.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: current.SAHAAYA_EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
    return true;
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error("Sahaaya email delivery failure", errorId, error);
    return false;
  }
}

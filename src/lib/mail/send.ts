import { getSetting } from "@/lib/settings";

/**
 * Sending mail, over HTTP rather than SMTP.
 *
 * Google Cloud blocks outbound port 25 from every VM, and mail sent straight
 * from a machine like this one lands in spam even when it does leave — so the
 * question was never "SMTP or an API", it was which relay. This talks to
 * Resend, which is a JSON POST and therefore no dependency at all.
 *
 * Swapping relays means changing `deliver` below and nothing else. Everything
 * that sends mail describes what it wants said, not how to say it.
 */

export const MAIL_API_KEY = "mail.apiKey";
export const MAIL_FROM = "mail.from";

export type Mail = {
  to: string;
  subject: string;
  /** Plain text, deliberately. See `deliver`. */
  text: string;
};

export type Sent = { ok: true } | { ok: false; error: string };

export async function isMailConfigured(): Promise<boolean> {
  const [key, from] = await Promise.all([getSetting(MAIL_API_KEY), getSetting(MAIL_FROM)]);
  return Boolean(key && from);
}

/**
 * Send it, or say why not.
 *
 * Plain text and no HTML. A church's mail is four sentences and a link; an HTML
 * version is a second copy of the same words to keep in step, renders
 * differently in every client, and is the half that gets filtered. Nothing here
 * needs a layout.
 *
 * Never throws. Everything that sends mail is doing something else as its real
 * job — inviting somebody, resetting a password — and a relay having a bad
 * afternoon must not take that down with it.
 */
export async function sendMail(mail: Mail): Promise<Sent> {
  const [key, from] = await Promise.all([getSetting(MAIL_API_KEY), getSetting(MAIL_FROM)]);
  if (!key || !from) return { ok: false, error: "Mail isn't set up yet." };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      // The relay's own words: they say which domain isn't verified, or which
      // address was rejected, and a flattened "couldn't send" says none of it.
      return { ok: false, error: body?.message ?? `The mail server said no (${response.status}).` };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the mail server." };
  }
}

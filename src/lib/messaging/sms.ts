import type { SendResult, Transport } from "./types";

/**
 * SMS, through whichever company the studio signs up with.
 *
 *   SMS_PROVIDER=log        nothing leaves the building (the default)
 *   SMS_PROVIDER=twilio     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *   SMS_PROVIDER=brevo      BREVO_API_KEY, SMS_SENDER
 *
 * Unlike email and push, every one of these costs money per message — a few
 * cents each in Cyprus, so a notice to four hundred members is a real invoice.
 * That is the reason SMS is off by default for members and unticked by default
 * at the desk: it should be a deliberate choice for the messages that warrant
 * it, not the channel everything goes out on.
 *
 * Numbers are normalised to E.164 with Cyprus as the assumed country, because
 * that is how members type their number and no gateway accepts "99 123 456".
 */

const DEFAULT_CC = process.env.SMS_DEFAULT_COUNTRY ?? "357";

/** "+35799123456", or null when it cannot be made into a real number. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return digits.length >= 8 ? digits : null;
  }
  const bare = digits.replace(/^0+/, "");
  if (bare.length < 6) return null;
  /* Already carries the country code. */
  if (bare.startsWith(DEFAULT_CC)) return `+${bare}`;
  return `+${DEFAULT_CC}${bare}`;
}

const logTransport: Transport = {
  name: "log (nothing is sent)",
  ready: true,
  async send(to, msg) {
    console.log(`[sms:log] → ${to} :: ${msg.body.slice(0, 60)}`);
    return { ok: true, id: "log" };
  },
};

function twilio(sid: string, token: string, from: string): Transport {
  return {
    name: "Twilio",
    ready: true,
    async send(to, msg) {
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization:
                "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: to, From: from, Body: msg.body }),
          },
        );
        if (!res.ok) return { ok: false, error: `twilio ${res.status}: ${await res.text()}` };
        const data = (await res.json()) as { sid?: string };
        return { ok: true, id: data.sid };
      } catch (e) {
        return { ok: false, error: `twilio: ${(e as Error).message}` };
      }
    },
  };
}

function brevoSms(key: string, sender: string): Transport {
  return {
    name: "Brevo SMS",
    ready: true,
    async send(to, msg) {
      try {
        const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
          method: "POST",
          headers: { "api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            /* Brevo wants the recipient without the leading plus. */
            recipient: to.replace(/^\+/, ""),
            sender,
            content: msg.body,
            type: "transactional",
          }),
        });
        if (!res.ok) return { ok: false, error: `brevo-sms ${res.status}: ${await res.text()}` };
        const data = (await res.json()) as { messageId?: string | number };
        return { ok: true, id: String(data.messageId ?? "") };
      } catch (e) {
        return { ok: false, error: `brevo-sms: ${(e as Error).message}` };
      }
    },
  };
}

export function smsTransport(): Transport {
  const which = (process.env.SMS_PROVIDER ?? "log").toLowerCase();

  if (which === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    return sid && token && from
      ? twilio(sid, token, from)
      : { name: "Twilio (credentials missing)", ready: false, send: notReady };
  }
  if (which === "brevo") {
    const key = process.env.BREVO_API_KEY;
    const sender = process.env.SMS_SENDER;
    return key && sender
      ? brevoSms(key, sender)
      : { name: "Brevo SMS (credentials missing)", ready: false, send: notReady };
  }
  return logTransport;
}

async function notReady(): Promise<SendResult> {
  return { ok: false, error: "NOT_CONFIGURED" };
}

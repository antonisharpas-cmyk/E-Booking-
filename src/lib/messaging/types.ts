/**
 * Getting a message out of the building.
 *
 * Three channels, one shape. The studio has not chosen an email or SMS company
 * yet and may change its mind later, so nothing above this file knows which one
 * is in use — the same way payments work. Adding a provider means adding an
 * adapter here, not editing the notice screen.
 *
 * Every provider also has a `log` mode that records what *would* have been sent
 * without sending it. That is not a stub to be replaced later: it is how the
 * whole pipeline is tested, and how the studio can rehearse a message before
 * real money and real phones are involved.
 */

export type Channel = "push" | "email" | "sms";

/** One message, already in the recipient's language. */
export type Outgoing = {
  subject: string;
  body: string;
  /** Where a push notification should open. Ignored by email and SMS. */
  url?: string;
};

export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; /** The endpoint is gone: stop using it. */ gone?: boolean };

export type Transport = {
  /** For the desk: which company is doing the sending, or "not configured". */
  name: string;
  /** False when the environment has no credentials, so the UI can say so. */
  ready: boolean;
  send(to: string, msg: Outgoing): Promise<SendResult>;
};

/** What one channel did with one notice. */
export type ChannelReport = {
  channel: Channel;
  sent: number;
  failed: number;
  /** Recipients this channel did not apply to: no consent, no phone, no device. */
  skipped: number;
  errors: string[];
};

export const CHANNELS: Channel[] = ["push", "email", "sms"];

/** Trims a body to something an SMS will not be silently cut in half by. */
export function smsLength(body: string) {
  /* Anything outside GSM-7 pushes the whole message into UCS-2, where a single
     SMS holds 70 characters instead of 160. Greek text does exactly that, which
     is why the desk is shown the count rather than left to guess. */
  const unicode = /[^\r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]/.test(
    body,
  );
  const per = unicode ? 70 : 160;
  return { unicode, per, parts: Math.max(1, Math.ceil(body.length / per)) };
}

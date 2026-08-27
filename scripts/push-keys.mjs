/**
 * The one pair of keys web push needs.
 *
 *   npm run push:keys
 *
 * There is no company to sign up with for push. The message goes straight from
 * this server to Google's, Apple's or Mozilla's push service, signed with a key
 * pair that belongs to the studio and nobody else. This makes it.
 *
 * Generate it once and keep it. Changing the keys later silently invalidates
 * every device that has already subscribed — they will not error, they will just
 * stop arriving — so this refuses to overwrite an existing pair unless asked.
 */
import webpush from "web-push";
import { existsSync, readFileSync } from "node:fs";

const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const already = /^VAPID_PUBLIC_KEY=.+$/m.test(env);

if (already && !process.argv.includes("--force")) {
  console.log(`
  .env already has a VAPID key pair.

  Replacing it would cut off every device that has already allowed
  notifications — quietly, with no error anywhere. If that is really what you
  want:

      npm run push:keys -- --force
`);
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();

console.log(`
  Web push keys. Paste these three lines into .env:

VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:hello@apexpilates.cy

  The public key is sent to browsers and is not a secret.
  The private key is. Do not commit it, and do not paste it into a chat window.

  Then restart the server. Members will see "Enable on this device" in
  My account → Notifications.
`);

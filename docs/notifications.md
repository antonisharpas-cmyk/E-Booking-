# Notifications — push, email and SMS

Everything below already works. What is missing is accounts with two companies,
and one command you run once. Until then the site behaves exactly as it will
afterwards, except the emails and texts go to a log instead of to people.

---

## What a new member gets

Signing up requires agreeing to **studio and timetable notices** — a class
cancelled, the studio shut, the timetable changed. That is a condition of holding
an account, because a member who is not told their class is off has been let down
by the studio, not spared an interruption.

Straight after registering, their Notifications screen reads:

| Channel  | State                | Can they change it?                          |
| -------- | -------------------- | -------------------------------------------- |
| **Push** | **Always on**        | Not in the app — see the honest bit below     |
| Email    | On                   | Yes, they can turn it off                     |
| SMS      | Off                  | Yes, they can turn it on                      |

And **offers, news and new class types** is unticked. Nothing marketing-shaped
reaches them until they tick it.

**Accepting offers switches SMS on.** Somebody who has just said they want to
hear about offers and new classes should not have to hunt for a second switch,
and a text is the channel that reliably arrives. It happens on the transition
only: a member who accepts offers and then turns SMS off stays off, because from
that point the choice is theirs and the studio should not keep overruling it.
Note the cost implication — more members with SMS on means more members reachable
by a paid channel, so keep an eye on the SMS reach figure at the desk.

## The honest bit about "push can't be turned off"

The studio's side of push is genuinely always on: there is no switch in the app,
and the server refuses a request that tries to turn it off, so an edited payload
cannot do what the screen does not offer.

What no website can do is make the *browser* deliver it. Push requires the member
to grant permission on each device, and they — or their phone's settings — can
withdraw it at any time without telling us. So:

- A member who has never granted permission has no device registered. Push skips
  them silently; they still see the notice in the app with the count on their
  photograph.
- **On iPhone, web push only works once the site has been added to the Home
  Screen.** Safari will not even offer the prompt before that. This matters in
  Cyprus, where a large share of members are on iPhones. On such a browser the
  push box simply does not appear — there is no button that could work, so there
  is nothing shown to press.
- Chrome on Android, and desktop Chrome/Edge/Firefox, work straight away.

Push is therefore best understood as: *we always try, and it costs nothing when
it works.* The in-app notice is the channel that never fails.

---

## What you need to set up

### 1. Push — no account, no bill, one command

```bash
npm run push:keys
```

Paste the three lines it prints into `.env` and restart. That is the whole setup.
There is no company in the middle: the message goes from your server straight to
Google's, Apple's or Mozilla's push service, signed with a key pair that belongs
to the studio.

Two rules:

- **Keep the keys.** Regenerating them silently cuts off every device that has
  already subscribed — no error, the notifications just stop. The command refuses
  to overwrite an existing pair unless you pass `--force`.
- **`VAPID_PRIVATE_KEY` is a secret.** Not in git, not in a chat window.

Push also requires the site to be served over **HTTPS** (localhost is exempt for
development). Any normal hosting gives you that.

### 2. Email — an account and some DNS

Two providers are built in. Pick one:

**Resend** (simplest, generous free tier)

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="APEX pilates <hello@apexpilates.cy>"
```

**Brevo** (does SMS too, so one account covers both)

```
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxxxxxxx
EMAIL_FROM="APEX pilates <hello@apexpilates.cy>"
```

Either way, the important part is not the API key — it is **verifying the sending
domain**. The provider will give you two or three DNS records (SPF, DKIM, and
usually a DMARC suggestion) to add wherever `apexpilates.cy` is managed. Without
them, mail either bounces or lands in spam, which is worse than not sending it:
the studio would believe forty people had been told about a cancelled class.

Do not send from a Gmail or Hotmail address as the `From`. Google and Microsoft
publish rules that make other providers reject it.

### 3. SMS — an account, a sender name, and a real cost

```
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM=+357xxxxxxx        # or an approved alphanumeric sender
```

or, on the same Brevo account as the email:

```
SMS_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxxxxxxx
SMS_SENDER=APEXpilates         # 11 characters maximum
```

Three things to know before you turn this on:

- **It costs money per message.** Roughly a few cents each in Cyprus. A text to
  400 members is a real invoice, every time. That is why SMS is off by default
  for members and unticked by default at the desk.
- **Greek text halves the length.** A message in Latin characters fits 160
  characters per SMS; anything with Greek letters drops to 70, so the same words
  can cost twice as much. The desk screen shows how many people it will reach so
  the number is never a surprise.
- **An alphanumeric sender ("APEXpilates") must be registered** with the provider
  for Cyprus, and cannot receive replies. A real number can receive replies but
  looks less like the studio.

Numbers are normalised automatically: a member typing `99 123 456` becomes
`+35799123456`. Set `SMS_DEFAULT_COUNTRY` if the studio ever has members outside
Cyprus as the majority.

### 4. Nothing configured?

The default is `EMAIL_PROVIDER=log` and `SMS_PROVIDER=log`: the pipeline runs
end to end and writes what it would have sent to the server log. The desk screen
says **"not connected yet"** next to those channels, so nobody at the counter
believes a text went out when it did not.

---

## The three automatic messages

Nobody writes these. They fire on their own.

| When | Says |
| --- | --- |
| A class is booked | "Booking confirmed — Reformer Flow, Saturday 29 August at 18:00" |
| A booking is cancelled | the class and time, and whether the session came back to their balance |
| Before the class | "Your class starts in 2 hours" — at **each member's own lead time**, the one they set on the reminder slider |

Three things worth knowing about how they behave:

- **Push only, by default.** These fire per *booking*, not per announcement. Put
  SMS on them and every single booking the studio takes costs a few cents,
  hundreds of times a month, without anyone deciding to spend it. To widen it:
  `REMINDER_CHANNELS=push,email` — email costs nothing per message. `push,email,sms`
  works too, but do that with the invoice in mind.
- **The lead time is the one the member was promised.** It is copied onto the
  reminder when they book. Somebody who changes from 2 hours to 15 minutes keeps
  the two-hour reminder for classes already booked; only new bookings use the new
  setting.
- **None of them writes a notice into the account.** A confirmation of one
  person's one booking is not studio news, and a hundred of them would bury the
  messages that are.
- **A new member starts with an empty list.** Notices sent before they signed up
  are not theirs — they had not joined, and thirty unread messages with thirty on
  their photograph is a poor welcome. Anything sent from the moment they register
  onwards reaches them normally.

A failed push never affects the booking. The confirmation is sent without being
waited for, so a slow push service cannot make somebody sit looking at a spinner
after their class is already booked.

### Nothing arriving? Check these three, in order

1. **Are the keys there?** `npm run doctor` says `push: no VAPID keys` when they
   are not, and the desk's Notices tab says *"not set up — run npm run
   push:keys"* beside the push channel. Without keys nothing can be delivered,
   including booking confirmations. This is the usual answer.
2. **Has any device allowed it?** A member has to press **Enable on this device**
   once, per device, in My account → Notifications. `npm run doctor` prints how
   many devices have. Zero devices means every push is skipped — correctly, and
   silently.
3. **Is it an iPhone that has not been added to the Home Screen?** Then Safari
   will not offer the prompt at all, and the push box does not appear.

Localhost counts as a secure context, so all of this works in development
without HTTPS.

### The reminder needs something to wake it

A reminder has to go out two hours before the class whether or not anybody is
looking at the website. Two mechanisms, and you want the first:

**1. A scheduled call (do this).** Every five minutes:

```
POST https://apexpilates.cy/api/cron/reminders
authorization: Bearer <CRON_SECRET>
```

Set `CRON_SECRET` in `.env` to any long random string. Most hosting has a
scheduler built in; on a Windows machine, Task Scheduler running:

```
curl -X POST -H "authorization: Bearer YOUR_SECRET" https://apexpilates.cy/api/cron/reminders
```

The sweep sends everything that has come due, so a missed run catches up on the
next one — nobody's reminder is lost by the scheduler hiccuping.

**2. A nudge from ordinary traffic (already on).** Any visit to the timetable
pushes the queue along, at most once a minute. That is the belt to the braces
above, not a replacement: a studio with no visitors at 6am would send its 8am
reminders late.

The owner can also run it by hand from the desk — it is the same endpoint, and a
signed-in member of staff is the second way in.

---

## Sending, from the desk

Notices tab → write the message → then two decisions.

**Who it goes to**

| | Reaches | Use it for |
| --- | --- | --- |
| **Everyone** | every member with an account | a cancelled class, a closure, a timetable change |
| **Offers only** | members who ticked offers, news and new class types | a promotion, a new class type, studio news |

"Offers only" can never reach somebody who did not tick that box, whatever is
selected on screen — the audience is enforced on the server, and also on the way
*out*: a member who withdraws that consent stops seeing offers already sent, so
turning it off means something retrospectively.

**How it goes out** — three sections, each showing how many people it will
actually reach before you press anything:

- **Push notification** — pre-selected. Free, instant, on devices that allowed it.
- **Email** — to members who left email on.
- **SMS** — costs money per message; only members who turned SMS on.

The notice lands in every member's account whichever of these you choose. That
copy always exists, so a provider outage never means the message was lost.

Afterwards the history shows what each channel actually did — `push 38 · email 41
(2 failed) · sms 0` — rather than the word "sent". If forty emails were refused,
the desk finds out immediately instead of a week later.

---

## Testing it without spending anything

```bash
npm run build && npx next start -p 3100
npm run test:notify -- http://localhost:3100     # 70 checks
```

That suite covers the consent rules specifically: what a new member starts with,
that push cannot be switched off even by an edited request, that email and SMS
can be, that an offer reaches exactly the members who accepted offers and no one
else, and that a member who declined never sees it — in the app or out of it.

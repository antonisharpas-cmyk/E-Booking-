# Going live — in the order it has to happen

Written because the Stripe dashboard asks its questions in the wrong order for
this studio. Work down this file instead. Nothing here needs a code change.

## Where things actually stand

| | State |
| --- | --- |
| Stripe keys | `sk_test_…` / `pk_test_…` — sandbox |
| `STRIPE_WEBHOOK_SECRET` | still the placeholder `whsec_x` |
| Apple Pay / Google Pay | enabled in the dashboard ✓ |
| Site address | `http://localhost:3000` — **not hosted anywhere** |
| Email provider | none, so every email goes to the server log |
| `REMINDER_CHANNELS` | now `push,email` |

The last two rows are why no confirmation email has ever arrived, and the
`localhost` row is the one that decides everything about webhooks below.

---

## Part 1 — Webhooks, today, while the site is on your laptop

**Do not press "Add destination."** That is the source of the confusion, and the
screen gives no hint about it. A destination is a public URL that Stripe's
servers call. Your site is at `http://localhost:3000`, which means "this
machine" — from Stripe's data centre it points at Stripe's own data centre.
There is no address you could type in that box that would reach your laptop.

Press the other thing on that page: **"Test with a local listener."**

That is the tunnel. The Stripe CLI opens an outbound connection from your
machine to Stripe, and Stripe pushes events down it. No public URL, no router
settings, nothing exposed.

### 1. Install the Stripe CLI (once)

Download `stripe_X.X.X_windows_x86_64.zip` from
<https://github.com/stripe/stripe-cli/releases/latest>, unzip it, and you have a
single `stripe.exe`. Put it somewhere permanent — `C:\stripe\` is fine — and
either add that folder to PATH or run it with the full path.

### 2. Link it to this sandbox

```
stripe login
```

A browser opens; approve it. If you have more than one Stripe account or
sandbox, the "Test with a local listener" panel on the Webhooks page shows the
exact command already scoped to **ErgonSite sandbox** — use that command rather
than typing your own, and you cannot end up listening to the wrong account.

### 3. Start listening, and leave it running

```
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

It prints:

```
> Ready! Your webhook signing secret is whsec_abc123... (^C to quit)
```

### 4. Put that secret in `.env`

Replace the placeholder line:

```
STRIPE_WEBHOOK_SECRET="whsec_abc123..."
```

Restart `npm run dev`. Run `npm run doctor` — the webhook complaint disappears.

### 5. Prove it works

Buy a pack with `4242 4242 4242 4242`. The `stripe listen` window prints
`payment_intent.succeeded → 200`. A 400 means the secret is wrong; a 503 means
the server did not pick up the new `.env`.

Then the real test, which is the whole reason webhooks exist: start a payment and
**close the tab** the moment the card is accepted, before the page comes back.
The sessions should still land in the account. That is the member on a train
whose signal drops, and without the webhook they pay and get nothing.

Two things to know about that terminal window:

- The `whsec_` from `stripe listen` belongs to your machine and stays the same
  every time you run it, so this is a once-only edit to `.env`.
- **It only forwards while the window is open.** If you test tomorrow and
  webhooks appear dead, this is why. Nothing is broken.

You will do the "Add destination" version later, in Part 4, when there is a real
domain for it to point at. The secret it gives you will be a **different** one —
sandbox and live are separate worlds and their signatures do not cross over.

---

## Part 2 — The Setup guide, click by click

### Set up recurring payments — skip the whole branch

Do not answer "How do you want to bill your customers?" at all. Flat rate and
seat-based are both wrong: the studio sells session packs that are bought once
and expire. Do not create a recurring product. Leave "Choose how to accept
recurring payments" untouched.

Stripe will keep this section looking unfinished forever. Let it. A monthly
membership is real work in the app — renewals, a card that fails, a cancellation
policy — and this checkbox would be its last step, not its first.

### Set up payments

1. "How do you want to accept payments?" → **Custom payment flow**. That is what
   already exists: the card fields render inside your own checkout page. The
   other two options put Stripe's page in front of the member, with prices stored
   in Stripe, so every price change would have to be made twice and one copy
   would eventually be wrong.
2. "Create a non-recurring product" is already ticked. Leave it alone — a Stripe
   Product is only read by Checkout, Payment Links and Invoices, none of which
   this integration uses, so it sits there harmlessly. Do not add more.

Selecting Custom payment flow changes nothing in the code. It stops the nagging.

### Set up invoices — skip three of four

"Add your branding" is done and worth keeping: it is what appears on the card
receipt Stripe emails. **Create a customer**, **Create an invoice** and **Set up
reminders** are Stripe's invoicing product, which exists to bill somebody who has
not paid yet. Members here pay before they get sessions. There is nothing to
invoice and nobody to chase.

### Verify your account — this is the one that matters

Everything else on the checklist is cosmetic. Without this the account can never
move a real euro.

**Before you click: whose account is this?**

The sandbox is called *ErgonSite sandbox*. ErgonSite built the site; the studio
takes the money. Whoever is named on this Stripe account is who receives the
payouts, whose bank account they land in, and whose tax return they appear on.

For a €5 test with your own card and your own IBAN, that is fine and simple. But
the account that goes live for real should be **the studio's** legal entity — the
company that operates APEX pilates, or APEX Fitness Centre if the studio trades
under it. If you activate this one as ErgonSite, members' money becomes
ErgonSite's revenue, and unpicking that later means a second account and a
migration. Decide now, not after the first month of takings.

**What "Verify your business" asks for:** the legal name and registration number
(or "individual / sole trader"), the trading address, what the business does
(pick fitness / health clubs), the responsible person's name, date of birth and
an ID document, an IBAN for payouts, and rough expected monthly volume. Have the
ID photograph ready — that is the step people stall on.

**"Create your Stripe profile"** is the public-facing part, and members do see
it: it becomes the name on the card statement and on Stripe's receipt. Set the
public business name to **APEX pilates**, the support email to
`info@ergonsite.com` for now, and the support site to the studio's address once
it exists.

---

## Part 3 — Confirmation emails

There are **two** different emails and they come from two different places.
Worth knowing which is which before you go looking for one that never existed.

### 1. Stripe's card receipt — Stripe sends it, you switch it on

Every payment intent already carries `receipt_email`, so nothing needs building.

- **Settings → Business → Customer emails** → tick **Successful payments**.
- It says "test mode emails are not sent" and it means it. **In sandbox, Stripe
  emails nobody.** You can see what it *would* look like from the payment's own
  page ("Send receipt" / preview), but no message leaves Stripe until live keys.

This one is a bank-style receipt: amount, last four digits, date. It is not the
studio talking.

### 2. The studio's own email — ours, and it needs a provider

This is "10 sessions added to your balance — €200. They expire on 25 November
2026." Two things were stopping it:

- `REMINDER_CHANNELS` was `push`, so the email branch was never even attempted.
  **Now `push,email`.** Without this, no provider in the world produces an email.
- No provider is configured, so it writes to the server log instead of sending.

To make it actually send, from `ergonsite.com` for now:

1. Sign up at <https://resend.com> (free tier is far more than a studio needs).
2. Add the domain `ergonsite.com`. Resend gives you two or three DNS records —
   SPF, DKIM, usually a DMARC suggestion. Add them wherever `ergonsite.com`'s DNS
   lives. This is the part that takes an hour, not the API key.
3. Wait for it to show **Verified**, then in `.env`:

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="APEX pilates <info@ergonsite.com>"
```

4. Restart, buy a test pack, and the email arrives — **this one works in
   sandbox**, because it is our server sending it, not Stripe's.

Skipping the DNS records and sending anyway is worse than not sending: Gmail and
Outlook drop it silently, so the studio believes forty people were told their
class was cancelled. Do not send with a Gmail address as the `From` either;
Google and Microsoft publish rules that make other providers reject it.

Swap `EMAIL_FROM` to `hello@apexpilates.cy` when that domain exists — one line,
plus its own DNS records. A member reading mail from `ergonsite.com` about their
pilates class will wonder who that is, so treat this as the testing address it
is.

---

## Part 4 — Actually going live

### The blocker nobody has mentioned yet

**The site is not hosted anywhere.** There is no deployment configuration in this
repo, and `NEXT_PUBLIC_SITE_URL` is `http://localhost:3000`. That means, today:

- Nobody but you can reach the site.
- Stripe cannot deliver a live webhook, because there is no address.
- Apple Pay domain registration has no domain to register.
- Live keys on your laptop would let you take real money on a site only you can
  open — which is a real charge on a real card with no way for a member to reach
  it.

So "going live" is a **hosting** job first and a Stripe job second. That is a
separate piece of work: a host, a domain, and a decision about the database —
SQLite in a file does not survive most hosting platforms redeploying, so the live
site needs either a host with a real disk or a move to Postgres. Say the word and
we will do it properly; it is not a checkbox.

### Then, in this order

1. **Activate the account** — Part 2's "Verify your account". Usually minutes,
   occasionally a day if a document is queried.
2. **Deploy the site** to a real HTTPS domain.
3. **Live keys on the server**, never on your laptop and never in this chat:
   `STRIPE_SECRET_KEY=sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`,
   and `NEXT_PUBLIC_SITE_URL=https://…`.
4. **Live webhook** — *now* you press "Add destination", with live mode selected
   in the dashboard, pointing at `https://<domain>/api/stripe/webhook`, listening
   for `payment_intent.succeeded`, `payment_intent.payment_failed` and
   `charge.refunded`. It gives you a new `whsec_…`. That goes in the server's
   environment, not your laptop's `.env`.
5. **Apple Pay domain** — Settings → Payments → Apple Pay → add the live domain.
   Until then that button does not appear for anybody.
6. **Payouts** — Settings → Payouts: check the IBAN and the schedule. The first
   payout takes several days; later ones follow the schedule.
7. **Start on an empty database.** Not "delete the rows" — a new file. See
   *Part 6* below, which is the whole of it.
8. **Replace the dev desk passwords** — `npm run staff -- password <email>`.
   `ownerdev123` on a public site is not a password.
9. **SMS, when the studio has the account.** The code is finished and sitting on
   `SMS_PROVIDER=log`, which sends nothing and charges nothing. To switch it on:
   set `SMS_PROVIDER=smsto` and `SMSTO_API_KEY=…` in the *server's* environment,
   and get `APEXPILATES` whitelisted with SMS.to first — ask them how long that
   takes before you need it. `npm run doctor` will then report the sender and the
   remaining credit. See `docs/notifications.md`.

---

## Part 5 — The real €5 test

Once steps 1–6 are done, one live payment with your own card is worth more than
any amount of test-mode clicking, and it costs less than you think.

**What it really costs.** €5 on an EEA card carries a €0.33 fee. If you refund
yourself afterwards the member gets €5 back but **Stripe keeps the fee** — so the
whole exercise costs about 33 cents, not €5. Budget three or four such payments
and you have spent about a euro.

**What to check, in order:**

1. The card form shows card, and Google Pay or Apple Pay on a device that has it.
2. The payment succeeds and the page returns.
3. The session count on your photograph goes up **without a refresh**.
4. Notifications shows "Payment received", with the right expiry date.
5. Stripe's receipt email arrives (the one you switched on in Part 3).
6. The studio's own email arrives, from `info@ergonsite.com`.
7. Stripe → Payments shows it: Amount €5.00, Fee, Net.
8. The desk's Analytics revenue figure moves by €5.
9. Book a class, then cancel it, and check both notices and the balance.
10. Then close the tab mid-payment on a second purchase, as in Part 1 — the
    webhook is the only thing that saves that one.

**After refunding yourself**, remember the app deliberately does *not* take the
sessions back — a member may have used half a pack by the time a refund happens,
so that is a decision for a person. Adjust your own balance from the admin
screen, or reset the database, which you are doing at step 7 anyway.

Do not test with a card you have not got, and do not test the decline path with a
real card — a genuine decline on your own card can attract your bank's attention.
Declines are what `4000 0000 0000 9995` is for, in sandbox.

---

## Part 6 — The database, on opening day

### Why not just delete the test data

Because a database that has been developed against for two months holds more
than the rows you can see. Dead push subscriptions. Half-finished bookings.
Notice delivery counters. Two desk accounts on passwords that are in a git
repository. Any mistake in the order you delete things leaves orphans, and two of
the columns that point between these tables have no foreign key to catch it.

A new file has none of that, and nothing to remember.

### What is thrown away, and what is kept

Thrown away: every account, every booking, every purchase, every credit batch and
ledger line, every notice, every registered device. All of it is test data —
those €110 payments are Stripe test mode and represent nothing.

Kept, because it is the studio's actual setup rather than test data: the class
types, the session packs, the instructors, the weekly timetable templates.

### The order

On the server, once, before the first real customer:

1. `DATABASE_URL` points at a path that does not exist yet.
2. `npm run db:push` — builds the schema from `src/db/schema.ts`.
3. `npm run db:seed` — writes in the catalogue and the timetable. It also creates
   the two development desk accounts, which is why step 4 is not optional.
4. `npm run staff -- password owner@apexpilates.cy` and the same for reception,
   with real passwords typed on the studio's own machine. Nobody sends a password
   through a chat window.
5. `npm run doctor`. It should report no problems. If it reports
   *"email: log mode — nothing is sent, so NOBODY CAN COMPLETE REGISTRATION"*,
   stop: registration now emails a six-digit code, and without a working email
   provider no member can finish signing up. That check exists because this is
   the one misconfiguration that looks fine and lets nobody in.

### And then stop testing on it

The moment there is one real payment, this can never be done again. So after the
wipe, test on a development copy. If you must poke at the live site, use an
account marked **Test account** in the desk — those are left out of every figure
in Analytics and out of everything the studio sends.

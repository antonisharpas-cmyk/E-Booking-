# Taking card payments

The site can take card payments today. What it cannot do yet is take _your_
money into _your_ account, because that needs credentials from a provider. This
page is what to ask for, where each answer goes, and how to check it works
before a member ever sees it.

> **First, once:** `npm install`. The card fields need `@stripe/stripe-js` and
> `@stripe/react-stripe-js`, which are in `package.json` but are not in anyone's
> `node_modules` until they install them. Skipping this shows up as
> `Module not found: Can't resolve '@stripe/react-stripe-js'` from
> `src/components/checkout/StripeFields.tsx`.

---

## How it is put together

One rule runs through all of it: **a payment becomes sessions in exactly one
place**, `src/lib/payments/fulfil.ts`. Everything else reports; that function
decides, and it is safe to call twice.

```
  /pricing            "Buy pack" is a link, not a payment
      |
      v
  /checkout?pack=…    order on the left, card on the right
      |
      |  POST /api/checkout        writes a PENDING purchase, opens the payment
      v
  the provider        card fields in our page, or the provider's own page
      |
      +--> POST /api/payments/settle   the browser says it worked; we ask the
      |                                provider whether that is true
      +--> POST /api/stripe/webhook    the provider tells us unprompted
      +--> GET/POST /api/payments/return   a bank gateway sends the member back
      |
      v
  fulfilPurchase()    marks the purchase PAID and grants the sessions, once
      |
      v
  /checkout/success   shows the new balance, refreshes the header count
```

Three different things can report the same payment. That is deliberate: the
browser is fast but unreliable, the webhook is reliable but not instant, and the
return URL is neither but arrives when a bank gateway is involved. Whichever
gets there first grants the sessions; the others find the purchase already PAID
and do nothing.

Files worth knowing:

| Path                                  | What it is                             |
| ------------------------------------- | -------------------------------------- |
| `src/lib/payments/types.ts`           | the contract every provider is held to |
| `src/lib/payments/fulfil.ts`          | the only place sessions are granted    |
| `src/lib/payments/stripe-provider.ts` | Stripe, card fields in our page        |
| `src/lib/payments/hosted-provider.ts` | a bank gateway, described in `.env`    |
| `src/lib/payments/test-provider.ts`   | the form that charges nothing          |
| `src/components/checkout/`            | the checkout page and its card panels  |

Swapping providers touches one file in that list and some lines in `.env`. The
pages, the credit logic, the booking rules and the tests do not move.

---

## If you choose Stripe

Nothing to build. Twenty minutes, most of it waiting for their onboarding.

1. Create an account at stripe.com. It works in test mode immediately, before
   any business details are approved.
2. Dashboard → Developers → API keys. Copy both into `.env`:

   ```
   PAYMENT_PROVIDER="stripe"
   STRIPE_SECRET_KEY="sk_test_…"
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_…"
   ```

3. Webhook. Locally:

   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   It prints a `whsec_…`; put it in `STRIPE_WEBHOOK_SECRET`. On the live site,
   add an endpoint at `https://your-domain/api/stripe/webhook` and subscribe to
   `payment_intent.succeeded`, `payment_intent.payment_failed` and
   `charge.refunded`. The dashboard shows the signing secret.

4. Pay with `4242 4242 4242 4242`, any future expiry, any CVC. For the 3-D
   Secure path use `4000 0027 6000 3184`; for a decline, `4000 0000 0000 0002`.
5. When the business is verified, swap the test keys for the live ones. Nothing
   else changes.

Apple Pay and Google Pay are a switch in the Stripe dashboard, not a code
change — they appear in the same card panel once enabled.

---

## If you choose JCC, Viva or another bank gateway

They all work the same way and only the vocabulary differs, so the adapter is
described in `.env` rather than written in code. Send them this list.

**Ask the provider for:**

1. The **endpoint** the customer is sent to, for test and for live.
2. Whether it is a **GET redirect or a form POST**.
3. Your **merchant id** and the **shared secret**.
4. The **exact parameter names** for: merchant id, order reference, amount,
   currency, return URL, cancel URL, description, customer email.
5. Whether the **amount** is decimal (`12.34`) or minor units (`1234`).
6. Whether the **currency** is `EUR` or the ISO number `978`.
7. The **signature**: which fields go into it, in which order, joined how, and
   with which algorithm. Ask for a worked example with real values, and the
   digest they expect from it. This is where these integrations go wrong.
8. What is **sent back** to the return URL: the field names for the order
   reference, the result code, the transaction reference and the signature, and
   which result codes mean paid.
9. Whether there is a **server-to-server status query** — a URL we can ask
   "is order X paid?". Say yes if it is optional. Confirming a payment by
   asking the bank is worth more than any signature check on a return URL.
10. Whether they can **embed the card fields** in our page (an iframe or a
    fields SDK), or whether the customer must go to their page. If they can,
    ask what PCI paperwork it puts on the studio — usually SAQ A-EP instead of
    SAQ A, which means a yearly questionnaire.

Every answer maps to one line in `.env`. The full list with examples is in
`.env.example` under "A bank gateway instead".

**Before going live**, check these three things:

- A return URL with a wrong or missing signature grants nothing. Try it: open
  `/api/payments/return?...` by hand with a made-up signature and confirm the
  log says it was refused and no sessions appeared.
- A test payment that is declined leaves the purchase FAILED and the balance
  untouched.
- Paying and then closing the browser before the redirect still ends with the
  sessions granted — this is what the webhook or the status query is for. If the
  provider offers neither, say so and we will add a "check this payment" button
  to the admin screen so the studio is never stuck.

---

## Until then

With no provider configured, `/checkout` shows a card form that takes nothing,
grants the sessions and walks the whole journey. It is clearly labelled as test
mode on screen, it refuses to run in a production build unless somebody sets
`ALLOW_TEST_PAYMENTS="true"`, and what is typed into it is never sent anywhere:
the fields are checked in the browser and only the purchase id is posted.

There is no code path in this application that receives a card number. Keep it
that way — every provider worth using offers either an iframe or a redirect, and
both keep the studio out of PCI scope.

---

## Prices and VAT

Pack prices in `src/lib/packs.ts` are treated as the final amount the member
pays, and the checkout page says "VAT included" beneath the total. If the studio
needs VAT shown as a separate line, or prices held excluding VAT, that is a
change to the summary panel and the pack data, not to the payment layer.

---

## Refunds

A refund from the provider's dashboard reaches us as a webhook and marks the
purchase REFUNDED, which the member's payment history and the admin screen both
show. It deliberately does **not** claw the sessions back: by then the member
may have used some of them, and taking a half-spent batch away automatically
would be wrong. The studio adjusts the balance from the admin screen, which
writes its own line in the session ledger, so the trail stays honest.

## Which payment methods appear

**Card, Apple Pay and Google Pay. Nothing else.**

Apple Pay and Google Pay are not separate payment methods as far as Stripe is
concerned — they are a card presented by a wallet. So the intent asks for
`payment_method_types: ["card"]`, and that one word gets all three.

This is deliberately *not* `automatic_payment_methods: { enabled: true }`, which
shows whatever happens to be switched on in the Stripe dashboard. That would mean
the studio could start offering Klarna, Link, iDEAL or Revolut Pay because
somebody ticked a box in a web console — including buy-now-pay-later, which is
credit. The list lives in `src/lib/payments/stripe-provider.ts` where a change to
it is visible in a diff.

Two things the wallets need that code cannot provide:

- **Apple Pay needs the domain registered with Stripe.** Dashboard → Settings →
  Payments → Apple Pay → add `apexpilates.cy`. Until then the Apple Pay button
  does not appear, on any device.
- **Both need HTTPS.** They will not show on plain `http://`, and Apple Pay needs
  Safari or an Apple device. On a Windows desktop in Chrome you will correctly see
  only the card fields — the wallets are set to `auto`, so each appears only where
  it can actually be used rather than as a button that fails when pressed.

## Test mode: no money moves, at all

While `.env` holds `sk_test_…` and `pk_test_…` keys, **nothing real happens**:

- No money leaves anybody's account, and none arrives in Stripe or the studio's
  bank. There is no payout and no fee.
- A **real** card number is rejected in test mode. Stripe only accepts its own
  test numbers, so putting a personal card in is not a small risk — it simply
  will not work.
- Use `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Others
  worth knowing: `4000 0025 0000 3155` forces the 3-D Secure screen, and
  `4000 0000 0000 9995` forces a decline, which is how you check the failure path.
- Everything else behaves exactly as it will in production: the purchase row, the
  sessions granted, the notification, the desk's revenue figure. The takings shown
  in Analytics during testing are test takings, so clear the database — or expect
  the number — before opening.

Payments only become real when the Stripe account is activated (business details
and a bank account) and the keys in `.env` are swapped for `sk_live_…` /
`pk_live_…`. At that point money reaches Stripe first and is paid out to the bank
on the account's payout schedule — the first one takes several days, later ones
follow the schedule set in the dashboard. Stripe keeps a percentage plus a fixed
fee per transaction; the current rate for Cyprus is on Stripe's pricing page and
in the dashboard, and it differs for European and non-European cards.

**Never paste a live secret key into a chat window, ours included.** A `sk_live_…`
key can move real money. Put it straight into `.env` on the machine.

---

## Why a €5 payment shows €4.59

Because €4.59 is what is left after Stripe's cut. Nothing in this app reduced the
amount: the intent is created with `amount: req.amountCents`, so a €5 pack asks
Stripe for exactly 500 cents, and Stripe charged 500 cents. The two figures are
different things wearing similar labels.

For a Cyprus account, Stripe's card pricing is:

| Card | Rate | On €5.00 | Left |
| --- | --- | --- | --- |
| European (EEA) | 1.5% + €0.25 | €0.33 | €4.67 |
| International | 3.25% + €0.25 | €0.41 | **€4.59** |

€5.00 − 3.25% − €0.25 = **€4.5875**, which the dashboard rounds to €4.59. So the
card used was treated as international — a UK card, a Revolut or Wise card issued
outside the EEA, or an American one. That is the whole explanation, and it is the
figure to plan around: on the studio's real prices it is roughly 2–3% of takings,
so a €200 ten-pack nets about €193.50 on an EEA card.

Where to confirm it: **Payments → click the payment**. That page lists `Amount`,
`Fee` and `Net` separately. `Amount` is €5.00. If the number you saw was under
`Net`, or in the balance/payouts figure, this is the answer.

One other candidate, if the fee line does not say €0.41: **Stripe Tax** pulling
9% out of a tax-inclusive amount gives €5 ÷ 1.09 = €4.587, which also rounds to
€4.59. It is an unlikely coincidence but an exact one, so check the fee before
concluding. This app does not use Stripe Tax — prices are the final amount the
member pays and VAT is inside them (see *Prices and VAT* above) — so if Tax is
switched on in the dashboard, switch it off rather than letting two systems both
believe they own the tax.

And in test mode both numbers are simulated. No fee was really taken, because no
money really moved.

---

## The Stripe dashboard "Setup guide": what to do and what to skip

Stripe's checklist is written for the shops it sees most, which are subscription
businesses selling from Stripe-hosted pages. This studio is neither. Prices live
in the app's own `credit_packages` and `pricing_rules` tables, and payment
intents are created server-side with a raw amount and collected by the Payment
Element on our own checkout page. That makes most of the guide inapplicable —
not "later", but never.

**Do this one. It is the only one that matters.**

- **Verify your account** — verify your business, create your Stripe profile.
  Until the account is activated it can only ever take test payments. Business
  details, the person responsible, and the studio's IBAN for payouts. Nothing
  else on the checklist can move a euro without this.

**Skip: Set up recurring payments** (the whole branch)

The studio sells session packs that are bought once and expire. There is no
subscription, so *Flat rate* and *Seat-based* are both wrong answers to a
question that should not be asked. Do not create a recurring product, and leave
*Choose how to accept recurring payments* alone. If the studio ever wants a
monthly membership, that is a real piece of work in this app — a plan, a renewal,
a cancellation policy, dunning when a card fails — and the dashboard toggle is
the last step of it, not the first.

**Skip: Shareable payment links and the pre-built checkout form**

Under *Set up payments* → "How do you want to accept payments?", the honest
answer is **Custom payment flow** — which is what already exists. A payment link
or Stripe Checkout would take the member out of the site to a Stripe page whose
prices are held in Stripe, so every price change would have to be made twice and
one of the two copies would eventually be wrong. Selecting it changes nothing in
the app; it just stops Stripe nagging.

*Create a non-recurring product* is ticked already, and harmlessly: a Product in
Stripe is only used by Checkout, Payment Links and Invoices. Our intents carry
their own amount and description, so the product sits there unused. No need to
delete it, no need to add more.

**Skip: Set up invoices**

*Add your branding* is already done and is worth keeping — it is what appears on
the card receipt Stripe emails. But *Create a customer*, *Create an invoice* and
*Set up reminders* are Stripe's invoicing product, which bills someone who has
not paid yet. Members here pay before they get sessions, so there is nothing to
invoice and nothing to chase. Receipts come from `receipt_email` on the intent.
If the studio ever needs a proper Cyprus VAT invoice, it should come out of this
app where the pack, the discount and the VAT treatment are known.

**Worth doing while you are in there, though it is not on the checklist**

- **Settings → Payments → Apple Pay**: add the live domain, or the Apple Pay
  button never appears.
- **Settings → Payouts**: set the schedule and check the IBAN.
- **Developers → Webhooks**: add an endpoint for
  `https://<domain>/api/stripe/webhook` and put its signing secret in
  `STRIPE_WEBHOOK_SECRET`. This is the one still outstanding — `npm run doctor`
  reports it as a problem, and without it a member who closes the tab mid-payment
  can pay and not be given their sessions.
- **Rotate the test secret key** that was pasted into a chat window. Developers →
  API keys → roll. Test keys cannot move money, so this is hygiene rather than an
  emergency, but the habit is the point.

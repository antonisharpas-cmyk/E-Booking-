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

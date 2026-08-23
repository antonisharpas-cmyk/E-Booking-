# APEX pilates

Website and booking system for **APEX pilates**, the Reformer Pilates studio of
APEX Fitness Centre — Technogym partner studio, Cyprus.

Marketing site, live timetable, credit packs bought by card, and a studio admin
panel. English and Greek. Built with Next.js 15 (App Router), TypeScript,
Tailwind CSS, Drizzle ORM and Stripe.

---

## Quick start

```bash
npm install
npm run setup    # writes .env with a fresh AUTH_SECRET, creates and seeds the database
npm run dev      # http://localhost:3000
```

That is the whole install. `npm run setup` is safe to re-run — it never
overwrites an existing `.env`.

`npm run setup` prints two sign-in accounts:

| Role   | Email                    | Password        |
| ------ | ------------------------ | --------------- |
| Admin  | `admin@apexpilates.cy`   | `apexadmin123`  |
| Member | `member@example.com`     | `member123`     |

The demo member starts with 10 credits so you can book straight away.
**Change or delete both accounts before going live.**

---

## How the credit system works

One credit = one class. This is the core of the product, so it is worth
understanding before changing anything.

- **Packs** (`credit_packages`) define credits, price and validity, e.g.
  `€200 / 10 classes / 90 days`. Edit them in the database or in
  `src/db/seed.ts`.
- **Buying** creates a `purchases` row. Credits are only granted when the money
  is confirmed — by the Stripe webhook in production.
- Credits live in **dated batches** (`credit_batches`), one per purchase, each
  with its own expiry. A member's balance is the sum of unexpired batches.
- **Booking** spends one credit from the batch that **expires soonest**, so
  nothing expires while a later-dated credit sits unused.
- **Cancelling** 12+ hours before the class returns the credit to the batch it
  came from. Later than that, the credit is spent — the reformer was held.
- Every movement is written to `credit_ledger` (`+10 purchase`, `-1 booking`,
  `+1 refund`, admin adjustments), which is what the member sees under "Credit
  activity" and what you can audit later.

The rules live in two files and nowhere else:

- `src/lib/credits.ts` — balance, spend, refund, grant
- `src/lib/booking.ts` — booking, capacity, cancellation

Both are covered by tests (below).

### Rules you may want to change

| Rule                        | Where                                            | Default |
| --------------------------- | ------------------------------------------------ | ------- |
| Free-cancellation window    | `FREE_CANCELLATION_HOURS` in `src/lib/utils.ts`   | 12h     |
| Booking cut-off before start| `BOOKING_CUTOFF_MINUTES` in `src/lib/utils.ts`    | 30 min  |
| Class capacity              | `class_templates.capacity` (per slot)             | 8       |
| Class length                | `class_templates.durationMin`                     | 50 min  |
| Credit price / validity     | `credit_packages`                                 | see seed |

---

## Payments (Stripe)

The site runs **without** Stripe: with no key configured, "Buy pack" grants the
credits immediately so the whole flow is clickable. That fallback is on in
development, and in production only if you explicitly set
`ALLOW_TEST_PAYMENTS="true"`.

To switch real payments on:

1. Create a Stripe account and copy the **test** keys from
   <https://dashboard.stripe.com/test/apikeys> into `.env`:

   ```
   STRIPE_SECRET_KEY="sk_test_…"
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_…"
   ```

2. Forward webhooks to your machine (install the Stripe CLI first):

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

3. Buy a pack using Stripe's test card `4242 4242 4242 4242`, any future expiry,
   any CVC. Credits appear the moment the webhook lands.

4. Going live: swap in the live keys, and add a webhook endpoint in the Stripe
   dashboard pointing at `https://yourdomain/api/stripe/webhook` for the events
   `checkout.session.completed`, `checkout.session.expired` and
   `charge.refunded`.

**Credits are only ever granted by the webhook**, never by the browser
returning from Stripe — so a member closing the tab still gets what they paid
for, and a faked redirect grants nothing. The webhook is idempotent: Stripe's
retries cannot double-credit an account.

For Cyprus you may also want a local acquirer (JCC) or Apple/Google Pay —
both are configured in the Stripe dashboard, no code change needed.

---

## Timezone

All class times are **wall-clock times in the studio's timezone**
(`Asia/Nicosia`, set in `src/lib/studio.ts`). A 06:00 template produces a 06:00
Nicosia class whether the server runs in Cyprus or on Vercel in UTC, and a
visitor browsing from London still sees 06:00. If the studio ever moves
timezone, that one constant is the only change.

---

## Content you should edit before launch

| What | Where |
| ---- | ----- |
| Address, phone, email, Maps link | `src/lib/studio.ts` |
| All page copy, EN + EL | `src/i18n/dictionaries.ts` |
| Class types and descriptions | `src/db/seed.ts` → `CLASS_TYPES` |
| Prices and validity | `src/db/seed.ts` → `PACKAGES` |
| Instructor names and bios (**currently placeholders**) | `src/db/seed.ts` → `INSTRUCTORS`, or the `instructors` table |
| Weekly timetable | `src/db/seed.ts` → `WEEKDAY_SLOTS` / `SATURDAY_SLOTS` / `typeForSlot` |
| Privacy policy and terms (**templates, not legal advice**) | `src/components/marketing/LegalBody.tsx` |

### Brand assets

`public/brand/` holds the wordmark extracted from the files you supplied —
cream for dark backgrounds, brown for light ones — plus the square logo used as
the favicon and social image. The small looped mark is drawn in
`src/components/ui/Monogram.tsx` as an approximation; if you have the original
vector, drop it in `public/brand/` and swap that component for an `<Image>`.

The reformer illustration (`src/components/ui/ReformerArt.tsx`) is line art
standing in for photography. When studio photos arrive, replace it in the hero
and on the studio page — those are the two places it appears.

### Fonts

Loaded from Google Fonts in `src/app/layout.tsx`: **Jost** (close to the
wordmark's geometry) and **Cormorant Garamond** for display. To self-host them
instead, switch to `next/font/google` in the layout and delete the
`<link>` tags — everything else keeps working through the two CSS variables.

---

## Adding classes to the timetable

The weekly pattern lives in `class_templates`. Real bookable classes
(`class_sessions`) are generated from it.

- **Admin panel → Generate schedule** creates the next N weeks. It is safe to
  run repeatedly; existing classes are never duplicated.
- Run it on a schedule in production so the timetable never runs dry, e.g. a
  weekly Vercel Cron hitting an authenticated route, or
  `npx tsx -e "import('./src/lib/schedule').then(m => m.generateSessions(8))"`.
- A one-off class (workshop, cover instructor) can be inserted straight into
  `class_sessions` with no template.

---

## Database

SQLite via Drizzle in development — no server to install, the whole database is
`dev.db`.

```bash
npm run db:push      # apply schema changes
npm run db:seed      # (re)seed catalogue + timetable
npm run db:studio    # browse the data in a UI
npm run db:reset     # wipe and rebuild from scratch
```

### Moving to Postgres for production

SQLite is a single file on one machine — fine for a single server, not for
serverless hosting like Vercel, where you want managed Postgres (Neon, Supabase,
RDS).

1. `npm install pg` and change `src/db/index.ts` to Drizzle's `node-postgres`
   driver.
2. In `src/db/schema.ts`, swap the `drizzle-orm/sqlite-core` imports for
   `drizzle-orm/pg-core` (`sqliteTable` → `pgTable`, `integer(… {mode:"timestamp"})`
   → `timestamp`, `integer(… {mode:"boolean"})` → `boolean`).
3. Point `DATABASE_URL` at the new database, `npm run db:push`, `npm run db:seed`.

No queries or business logic change — the tables and columns stay identical.

---

## Tests

```bash
# business rules against a real database
npx tsx scripts/test-flows.ts

# the whole app over HTTP (build and start it first)
npm run build && npx next start -p 3100
node scripts/test-http.mjs http://localhost:3100
```

`test-flows.ts` covers credit expiry, spending the soonest-expiring credit,
double-booking, capacity limits, free vs late cancellation, the booking cut-off,
and that the ledger always reconciles with the credit batches.

`test-http.mjs` covers every page, registration and sign-in, the guards on
`/account` and `/admin`, buying a pack, booking, cancelling, one member being
unable to touch another's booking, and the webhook rejecting unsigned calls.

Both suites should report `ALL PASS`. Also useful: `npm run typecheck`.

---

## Deploying

Easiest path is **Vercel**:

1. Push this folder to a Git repository and import it in Vercel.
2. Set the environment variables from `.env.example` in the Vercel project
   (`AUTH_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, the Stripe keys).
3. Move the database to Postgres first (see above) — SQLite will not survive on
   serverless hosting.
4. Add the Stripe webhook endpoint for the deployed URL.

Any Node host works too (`npm run build && npm start` behind a reverse proxy);
there SQLite is a valid choice if the app runs on one machine with a persistent
disk, and you should back up `dev.db` (rename it something more permanent).

---

## Project layout

```
src/
  app/                    routes (App Router)
    api/                  auth, bookings, checkout, stripe webhook, admin
    timetable/            live booking page
    account/              member dashboard: credits, bookings, history
    admin/                studio panel: attendance, members, schedule
  components/
    site/                 header, footer, language toggle
    home/ marketing/      page sections
    booking/ account/ admin/
    ui/                   button, section, reveal, logo, monogram, reformer art
  db/                     schema, connection, seed
  i18n/                   dictionaries (EN + EL) and the language provider
  lib/                    auth, credits, booking, schedule, stripe, time, studio
scripts/                  test suites
public/brand/             logo and wordmark files
```

## Security notes

- Passwords are hashed with bcrypt; sessions are signed JWTs in an httpOnly,
  SameSite=Lax cookie. Set a long random `AUTH_SECRET` and keep it out of Git.
- Every booking and cancellation is re-checked on the server against the signed
  session — the browser cannot book for someone else or grant itself credits.
- Admin routes check the user's role server-side, not just in the UI.
- `.env` is gitignored. Never commit real Stripe keys.

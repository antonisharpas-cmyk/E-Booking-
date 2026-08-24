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

The demo member starts with 10 sessions so you can book straight away.
**Change or delete both accounts before going live.**

---

## How the session system works

**Members see "sessions". The database calls them "credits".** The member-facing
word is set in `src/i18n/dictionaries.ts`; the tables, columns and functions kept
the original `credit` naming so no migration was needed. If you ever want the
data layer renamed too, it is a mechanical find-and-replace across
`src/db/schema.ts`, `src/lib/credits.ts` and `src/lib/booking.ts` plus a
migration — worth doing only if it bothers you.

One session = one class. This is the core of the product, so it is worth
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
| Class capacity              | `class_templates.capacity` (per slot)             | 5       |
| Class length                | `class_templates.durationMin`                     | 60 min  |
| Session price / validity    | `credit_packages`                                 | see seed |
| Reformers, class length, city, open days | `src/lib/studio.ts`                  | 5 · 60min · Larnaca · 6 |

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
(`Asia/Nicosia`, set in `src/lib/studio.ts` — that is the IANA zone for the whole
of Cyprus, Larnaca included). A 06:00 template produces a 06:00 Larnaca class
whether the server runs in Cyprus or on Vercel in UTC, and a visitor browsing
from London still sees 06:00. If the studio ever moves
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

`public/brand/`

- `wordmark-cream.png` / `wordmark-brown.png` — the lockup, rebuilt from the
  studio's 1024px artwork. Cream for dark grounds, brown for light.
- `monogram.svg` — the looped mark, traced to vector from the studio's own
  artwork. Rendered through `Monogram.tsx` as a CSS mask over `currentColor`, so
  it takes the colour of whatever text surrounds it and the path data stays out
  of the JavaScript bundle.
- `logo-square.png`, `logo-512.png` — favicon and social image.

`public/media/`

- `class.jpg` — the home page cover. Cropped from the studio's class photograph
  below the faces, so nobody in it is identifiable.
- `reformer.jpg` — the product render, used on the studio page.
- `detail-wood.jpg`, `detail-footbar.jpg` — used on the studio page.
- `reformer-side.jpg` — the "Meet your new standard" side view, spare.
- `schedule-card.jpg` — the opening-hours card, spare.
- `logo-reveal.mp4` / `.webm` / `-poster.jpg` — the logo animation, re-encoded
  for the web (421kB down to 48kB) with the audio stripped, since autoplay
  requires muted video anyway.

### The opening animation

`IntroReveal.tsx` plays the logo animation once per browser session, then fades
into the hero. It is skippable by click, key or scroll, it is skipped outright
for anyone whose system asks for reduced motion, and the page underneath is
fully rendered the whole time — so it costs nothing in loading terms and search
engines never see it. To change how long it holds, edit `HOLD_MS`. To retire it,
delete the `<IntroReveal />` line from `src/app/page.tsx`.

### The cover

`Hero.tsx` is a full-viewport photograph with the type centred over it, and the
header switches into a matching mode over it — centred wordmark, MENU control,
navigation moved into the full-screen sheet (see `cover` in `Header.tsx`). Past
the cover the header returns to the normal light navigation bar.

If you get footage of a class, the cover is already built to sit over a dark
image: swap the `<Image>` for a muted, looping `<video>` with `class.jpg` as its
poster and nothing else needs to change.

**Faces:** the cover photograph is cropped below every face on purpose. If you
replace it with a photo of real members, get their written consent first, or crop
the same way.

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

## Performance

Two diagnostics ship with the project. Run them against a **production** build —
`npm run dev` compiles each page on first request and is several times slower by
design, which is misleading.

```bash
npm run build
npm start                 # in one terminal
npm run diagnose          # in another — per-route TTFB, payload, JS weight
npm run diagnose:db       # query timings and SQLite query plans
```

`diagnose` reports time-to-first-byte (server work), total document time, HTML
size and the compressed JavaScript a modern browser actually downloads, then
flags anything over budget: TTFB <200ms, total <400ms, HTML <120kB, JS <180kB.

`diagnose:db` times every query the app runs on a page load and prints SQLite's
own query plan, so you can see whether an index is being used (`SEARCH … USING
INDEX`) or a table is being scanned (`SCAN`).

### Where it stands

Measured on a production build with 354 classes seeded:

| | Before | After |
| --- | --- | --- |
| JavaScript per route (transferred) | 175kB | **138kB** |
| Uncompressed JS (excl. legacy polyfill) | 590kB | **435kB** |
| Server time (TTFB), slowest route | 26ms | **20ms** |
| Timetable query, 14 days with occupancy | — | **0.18ms** |
| Logo images | 112kB | **9kB** |

The database was never the problem — every query is sub-millisecond and
index-backed. The weight was client-side JavaScript, and the fix was removing an
animation library that the shared layout pulled into every route (including
static pages like the privacy policy) just to fade elements in on scroll. That
is now a shared `IntersectionObserver` and a few CSS classes in
`globals.css`/`Reveal.tsx`.

### If you want to go further

Neither of these is needed today; both are real wins if the studio's traffic
grows or you care about first-visit speed on mobile data.

1. **Self-host the fonts.** They currently load from Google Fonts via a
   `<link>` in `src/app/layout.tsx`, which costs two extra connections before
   text can render. Replace it with `next/font/google`:

   ```tsx
   import { Cormorant_Garamond, Jost } from "next/font/google";

   const jost = Jost({ subsets: ["latin", "greek"], weight: ["200","300","400","500"], variable: "--font-jost", display: "swap" });
   const cormorant = Cormorant_Garamond({ subsets: ["latin", "greek"], weight: ["300","400","500"], variable: "--font-cormorant", display: "swap" });
   // then: <html className={`${jost.variable} ${cormorant.variable}`}>
   ```

   Delete the `<link>` tags and the inline `<style>` block. Next then serves the
   font files from your own domain and preloads them. Note the `greek` subset —
   the site is bilingual.

2. **Ship one language at a time.** Both the English and Greek dictionaries are
   sent to the browser so the toggle switches instantly with no reload. That is
   roughly 12kB compressed. If you would rather send only the active language,
   have the toggle set the cookie and call `router.refresh()`, and import the
   dictionary per-locale — you trade an instant toggle for a smaller payload.

### If class numbers grow a lot

The timetable query counts bookings with a correlated subquery per class. At a
few hundred classes that is 0.18ms. Past a few thousand, switch it to a single
grouped join — `diagnose:db` will tell you when it starts to matter.

---

## Troubleshooting

**`Cannot find module '../server/require-hook'`**
`npm install` had not finished when the command was run. Wait for
`added N packages` before running anything else, then try again.

**`Could not locate the bindings file` / no `.node` file in
`node_modules/better-sqlite3`**
The SQLite driver is a native module. It normally installs a prebuilt binary,
but there is no prebuild for a Node version newer than the driver, in which case
npm falls back to compiling — which needs Visual Studio build tools on Windows.
Fixes, in order of preference:

1. Make sure `better-sqlite3` is `^12.2.0` or newer in `package.json` (v12 has
   prebuilds for Node 20, 22 and 24), then `npm install` again.
2. Or install Node 22 LTS, delete `node_modules`, and `npm install`.
3. Or `npm install --global windows-build-tools` (as administrator) so the
   fallback compile can succeed.

Check your Node version with `node -v`. Node 20 LTS or 22 LTS are the safest.

**`AUTH_SECRET is missing or too short`**
`.env` was not created. Run `npm run setup`, or copy `.env.example` to `.env`
and paste any long random string into `AUTH_SECRET`.

**"Buy pack" says payments are not switched on**
Expected in a production build with no Stripe keys. Either add the Stripe test
keys, or set `ALLOW_TEST_PAYMENTS="true"` in `.env` to grant credits without
paying (fine for a staging demo, never on the live site). In `npm run dev` it
already works with no keys.

---

## Security notes

- Passwords are hashed with bcrypt; sessions are signed JWTs in an httpOnly,
  SameSite=Lax cookie. Set a long random `AUTH_SECRET` and keep it out of Git.
- Every booking and cancellation is re-checked on the server against the signed
  session — the browser cannot book for someone else or grant itself credits.
- Admin routes check the user's role server-side, not just in the UI.
- `.env` is gitignored. Never commit real Stripe keys.

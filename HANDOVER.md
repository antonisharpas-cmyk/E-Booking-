# Handover notes

What is finished, what is placeholder, and what to decide next.

## Done and working

- **Marketing site** — home, studio, classes, timetable, pricing, contact,
  privacy, terms, 404, sitemap, robots. Bilingual EN/EL with a header toggle
  that persists in a cookie and renders server-side (no flash of the wrong
  language).
- **Accounts** — register, sign in, sign out. Passwords hashed, sessions in a
  signed httpOnly cookie.
- **Credit packs** — five packs seeded, including the €200 / 10-class pack.
  Card payment through Stripe Checkout; credits granted by webhook only.
- **Booking** — live timetable, 14 days ahead, real-time capacity, book for one
  credit, cancel with automatic refund inside 12 hours of the class.
- **Member dashboard** — credit balance with exact expiry dates, upcoming
  classes, past classes, credit activity ledger, purchase history.
- **Studio admin** — today's classes with the roster, attendance marking,
  member list with credits/classes/spend, manual credit grants and deductions,
  and schedule generation from the weekly templates.
- **Tests** — 21 business-rule checks and 44 HTTP checks, all passing;
  TypeScript clean; production build clean.

## Placeholder — replace before launch

1. **Studio details** — address, phone, email and Google Maps link in
   `src/lib/studio.ts` are placeholders (`+357 22 000 000`,
   `hello@apexpilates.cy`).
2. **Instructor names and bios** — invented for the demo, in `src/db/seed.ts`.
3. **Prices** — the packs are a sensible market-rate proposal built around your
   €200 / 10-class example. Confirm all five with the studio.
4. **Timetable** — built from the published hours (Mon–Fri 06:00–12:00 and
   15:00–20:00, Sat 07:00–11:00) as 50-minute classes on the hour, with a class
   type rota. The real week almost certainly differs — adjust the templates.
5. **Photography** — the reformer is line art. Real studio photos would lift the
   site more than any other single change.
6. **Legal pages** — starting templates, not reviewed by a lawyer.
7. **Demo accounts** — delete `member@example.com` and change the admin password.
8. **Email** — nothing is emailed yet. Booking confirmations, cancellations and
   the contact form all just write to the database. See below.

## Decisions still to make

**Email notifications.** The natural next step: booking confirmation, class
reminder the evening before, cancellation confirmation, and forwarding contact
enquiries to the studio inbox. Roughly a day's work with Resend or SendGrid;
the hooks belong in `src/lib/booking.ts` and `src/app/api/contact/route.ts`.

**Waitlists.** When a class is full the button says "Full". A waitlist that
auto-promotes on a cancellation is a common ask from members and a bigger piece
of work — the data model has room for it (`bookings.status`).

**Memberships vs credits.** Everything is credits today, matching your brief.
If the studio later wants unlimited monthly memberships, that means Stripe
subscriptions and a rule saying "member with an active subscription books
without spending a credit".

**Gym member pricing.** The pricing page mentions preferential rates for APEX
Fitness Centre members, but there is no mechanism yet. Simplest version: a flag
on the user and a second price on each pack.

**Password reset.** Not built. Members who forget their password currently need
staff to help. Add it before the studio has real members — it needs email first.

**Privates and duets.** Currently a "contact the studio" route. If they should
be bookable online, they need their own class type with capacity 1–2, and a
credit cost of more than one credit per booking (the booking code assumes
exactly one credit — that is the one place to change).

## Connecting the gym site later

You mentioned the gym site may come separately. Both options stay open:

- **Separate sites, linked** — nothing to do; this site already presents itself
  as "APEX pilates by APEX Fitness Centre" and links out.
- **Pilates inside the gym site** — this app can live under a path
  (`apexfitness.cy/pilates`) via a `basePath` in `next.config.ts`, or on a
  subdomain (`pilates.apexfitness.cy`) with shared branding. The booking system
  does not care either way.

If members should share one login across gym and pilates, decide that before
the gym site is built — retrofitting shared accounts is much more work than
planning for it.

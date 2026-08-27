# The desk — what each control actually does

For the person at the counter. Written because a few of these do more than their
label suggests, and one of them looks alarming and is not.

---

## Closures → Generate schedule

**What it is.** The weekly rota is a set of *templates*: "Reformer Flow, Mondays
at 06:00", "Reformer Flow, Mondays at 07:00", and so on. A member cannot book a
template — they book a class on a date. This button walks forward the number of
weeks in the box beside it and writes a real, bookable class for every day each
template falls on. That is what puts the timetable on the website.

**Where to see what it did.** Straight after pressing it, in the box that appears
underneath: *"42 classes added, 301 were already there."* The class count above
it — "344 classes on the books" — is the running total.

Everything it creates shows up on **Timetable** on the public site, and in the
**Bookings** tab at the desk. There is no separate list of "things this button
made", because what it makes is ordinary classes.

**Pressed it by mistake?** Almost certainly nothing happened.

Rolling forward is *idempotent*: each class is unique by template and time, so a
second run over weeks that already exist creates nothing at all and reports
everything as "already there". That is by design, and it is why the button is
safe to press when you are not sure whether somebody already did.

The one case worth undoing is a run that went **further ahead than you meant** —
26 weeks instead of 6 — because that puts four months of classes on the timetable
for members to book into. So after a run that added anything, there is an **Undo
this** button beside the result. It removes only the classes that run added, and
only the ones **nobody has booked**; a class with a member on it is kept and
reported as kept. A booked class is a commitment, not a mistake to tidy away.

The undo stays available until you leave the page. After that, a class you no
longer want is removed the same way as any other — by closing the day, which
cancels it properly and gives the members their sessions back.

**What it never does.** It does not touch classes that already exist, does not
change times, does not remove anything, and skips any day that is closed.

---

## Members

**Search** by name, email or phone. Partial is fine, and the phone match ignores
spaces, so `99123` finds `+357 99 123 456`.

**Browse** when you do not know who you are looking for — the member who came in
last week, the one whose name you half remember. Ten at a time, newest account
first, with *newer* and *older* underneath. This used to be capped at twelve with
no way past them, which made the list useless for anything but a name you already
knew.

**The three pills** — All / Members / Test — appear only once at least one test
account exists.

### Test accounts

A **Test account** switch on each member's page. It marks a dummy account the
studio keeps for trying things out, and it does two things:

- The account is left out of everything the Notices tab sends, unless *Include
  test accounts* is ticked before sending.
- It stops being counted as a member — in the reach figures, and in the "3 of 40
  read" on each sent notice.

"Left out" means left out of all four channels, the in-app copy included, so a
test account does not see an announcement it was excluded from. Its own booking
confirmations are unaffected — those belong to it.

It is **not** a role. A test account still books classes, buys packs and holds a
balance, because that is what it is for.

### Saving a member's profile

The page reloads and lands back on **Members** after a save. That is deliberate rather than lazy: what the desk
edits here — an email, a phone, a consent, the test marker — changes nothing
visible on the screen, so "Saved" was the only evidence and it looked identical
whether the save had worked or not. Reloading means everything on the screen
afterwards was read back out of the database.

The tab now lives in the address bar (`/admin?tab=members`), so a refresh comes
back where you were instead of resetting to Bookings — which is what a plain
reload after a save used to do.

**One phone number, one account.** Correcting a phone to one another member
already has is refused, the same way registration refuses it. Numbers are
compared in normalised form, so `+357 99 123456`, `99123456` and `0035799123456`
all count as the same number rather than three different ones.

---

## Notices

Covered in full in [notifications.md](./notifications.md). The short version:

- Write it, pick who it goes to, pick which channels.
- **Type the Greek version too.** Members reading the site in Greek see the Greek
  in their account, and the email carries both languages with a rule between
  them. Leave it blank and everyone gets English.
- The history on the right filters by channel and pages five at a time.

### Narrowing a campaign

Under **Who it goes to** there is a second block, **Narrow it down**. It picks
out who a message is *relevant* to, and it is a different question from who has
agreed to hear from you:

| | Finds |
| --- | --- |
| **Never bought a pack** | No payment yet, by card or at the desk. Free sessions given as an adjustment do not count as buying — a comped session is not a deposit. |
| **No sessions left** | Nothing in the balance, or everything they had has expired. |
| **Not been for N days / weeks / months** | Last class that long ago or longer — **and members who have never come at all**, because for a "we have not seen you" message they are the same audience, and the most winnable part of it. |

They combine, so *never bought* plus *not been for 3 months* is the cold-lead
list. The count under them — "19 members match" — updates as you change them, and
**Send is disabled when nothing matches**, so a campaign never goes out to an
empty list without you noticing.

**Consent still wins, always.** A filter can only ever narrow. Picking
*never bought* with the **Offers only** audience reaches members who never bought
*and* accepted offers — a member who declined offers is never in it, whatever is
selected on screen. That is enforced on the server, and there is a test that
sends a filtered promotion and checks a member who declined never receives it.

Months count as 30 days. You are choosing a rough cohort, not a billing period.

**Each sent notice records who it went to** — "offers audience · never bought ·
away 30d+" — under its date in the history. That cannot be worked out afterwards:
the audience for "not been for three months" is different today, because people
came back. Without it recorded at the time, a notice that reached 38 people would
give no way of ever knowing which 38, or why.

---

## What is behind the lock

The console asks for a password again even though you are already signed in,
because it can change balances, cancel classes and reset passwords. That unlock
lasts 45 minutes and then asks again.

**Reception cannot see Analytics** — members, revenue and takings are the owner's
business — and cannot open another desk account's profile. Both are enforced on
the server, not by hiding a tab.

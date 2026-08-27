/**
 * The reception desk: the lock on the door, and every action behind it.
 *
 *   npm run build && npx next start -p 3100
 *   node scripts/test-desk.mjs http://localhost:3100
 *
 * The lock is tested first and hardest. Everything else in this suite is a
 * convenience for the studio; the lock is the thing standing between a public
 * room and four hundred people's phone numbers.
 */
const B = process.argv[2] ?? "http://localhost:3000";

/* One number, one account — so every registration in this suite needs its own.
   Registering two members with the same phone is now correctly refused. */
let __phoneSeq = 0;
function uniquePhone() {
  return `+35799${String(100000 + ((Date.now() % 800000) + __phoneSeq++ * 13)).slice(0, 6)}`;
}
/* Two accounts open this console and they are not owed the same view. */
const OWNER = { email: "owner@apexpilates.cy", password: "ownerdev123" };
const RECEPTION = {
  email: "reception@apexpilates.cy",
  password: "receptiondev123",
};

const jar = () => new Map();
const ch = (j) => [...j].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(j, path, { method = "GET", body } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(j.size ? { cookie: ch(j) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const [k, ...rest] = pair.split("=");
    const value = rest.join("=");
    if (value === "" ) j.delete(k.trim());
    else j.set(k.trim(), value);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

let pass = 0,
  fail = 0;
const check = (l, c, x) => {
  if (c) {
    pass++;
    console.log("  ✓ " + l);
  } else {
    fail++;
    console.log("  ✗ " + l, x ?? "");
  }
};

async function member(tag) {
  const j = jar();
  const email = `desk-${tag}-${Date.now()}@apex.test`;
  await req(j, "/api/auth/register", {
    method: "POST",
    body: {
      name: `Desk ${tag}`,
      email,
      phone: uniquePhone(),
      password: "test12345",
      serviceOptIn: true,
    },
  });
  const me = await req(j, "/account");
  const id = me.text.match(/data-member-id="([^"]+)"/)?.[1] ?? null;
  return { j, email, id };
}

/* ------------------------------------------------------------------ 1 */
console.log("\n1. The front door: /admin asks for credentials itself");
const staff = jar();
{
  const anon = jar();
  const page = await req(anon, "/admin");
  check("a stranger gets the page, not a redirect", page.status === 200, page.status);
  check(
    "and is asked for an email and a password",
    page.text.includes("desk-email") && page.text.includes("desk-password"),
    "no sign-in form",
  );
  check(
    "nothing of the studio is on it",
    !page.text.includes("member@example.com") && !page.text.includes("Revenue"),
    "data leaked to the sign-in screen",
  );

  const punter = await member("punter");
  const asMember = await req(punter.j, "/admin");
  check(
    "a signed-in member sees the same form, learning nothing",
    asMember.status === 200 && asMember.text.includes("desk-email"),
    asMember.status,
  );
  const memberApi = await req(punter.j, "/api/admin/members?q=a");
  check("and is refused by the API", memberApi.status === 403, memberApi.status);

  /* A member's own password must not open the desk. */
  const asMemberTry = await req(punter.j, "/api/admin/unlock", {
    method: "POST",
    body: { email: punter.email, password: "test12345" },
  });
  check(
    "a member's correct password does not open it",
    asMemberTry.status === 401,
    asMemberTry.status,
  );

  const wrong = await req(staff, "/api/admin/unlock", {
    method: "POST",
    body: { email: OWNER.email, password: "not-the-password" },
  });
  check("a wrong password is refused", wrong.status === 401, wrong.status);

  const nobody = await req(staff, "/api/admin/unlock", {
    method: "POST",
    body: { email: "nobody@nowhere.test", password: "whatever" },
  });
  check(
    "an unknown email gets the same answer as a wrong password",
    nobody.status === 401 && nobody.json?.error === "WRONG_PASSWORD",
    nobody.json,
  );

  /* The real thing: one form, signed in and unlocked. */
  const inOne = await req(staff, "/api/admin/unlock", {
    method: "POST",
    body: { email: OWNER.email, password: OWNER.password },
  });
  check("staff credentials open it in one step", inOne.json?.ok === true, inOne.json);
  check("which also signs them in", staff.has("apex_session"), [...staff.keys()]);

  const console_ = await req(staff, "/admin");
  check("the console loads", console_.status === 200, console_.status);
  check(
    "with the six tabs",
    ["today", "members", "timetable", "notices", "pricing", "analytics"].every(
      (x) => console_.text.includes(`data-desk-tab="${x}"`),
    ),
    "a tab is missing",
  );
  /* The takings are behind their own tab rather than printed above every
     screen: the desk stands in a public room, and a permanent row of revenue
     is both a distraction from the job in hand and a figure on display. */
  check(
    "and the takings are not on the opening screen",
    !/REVENUE|Revenue \(paid\)/.test(console_.text),
    "revenue rendered before the analytics tab was opened",
  );
  /* The desk's bar carries its own tabs and nothing else. The public
     navigation is not merely hidden here, it is not rendered: a receptionist
     with a queue in front of them has no use for it, and every one of those
     links is a way to lose the screen they were working on. */
  check(
    "and none of the website's own navigation",
    !/href="\/(studio|classes|timetable|pricing|contact)"/.test(console_.text),
    "a public nav link reached the desk",
  );

  const open = await req(staff, "/api/admin/members?q=member");
  check("and the API answers", open.status === 200, open.status);
}

/* ------------------------------------------------------------------ 1b */
console.log("\n1b. The numbers, and any day's bookings");
{
  const all = await req(staff, "/api/admin/stats");
  const s = all.json?.stats;
  check("the stats answer", Boolean(s), all.json);
  check(
    "every card the desk asked for is there",
    [
      "members",
      "membersWithSessions",
      "bookings",
      "sessionsOutstanding",
      "sessionsBooked",
      "revenueCents",
    ].every((k) => typeof s?.[k] === "number"),
    Object.keys(s ?? {}),
  );
  check(
    "members with sessions is never more than members",
    s.membersWithSessions <= s.members,
    s,
  );
  /* Cancellations are reported beside the bookings, not subtracted from them:
     a quiet week and a week people pulled out of must not read the same. */
  check(
    "cancellations are counted apart from the bookings",
    typeof s.cancellations === "number",
    s.cancellations,
  );

  /* One day, given as a range with both ends on it. Inclusive at both ends, so
     this is that whole day rather than a zero-length instant. */
  const t0 = new Date().toISOString().slice(0, 10);
  const oneDay = await req(staff, `/api/admin/stats?from=${t0}&to=${t0}`);
  check(
    "a one-day range cannot show more bookings than all time",
    oneDay.json?.stats?.bookings <= s.bookings,
    { day: oneDay.json?.stats?.bookings, all: s.bookings },
  );
  check(
    "and the stocks do not move with the period",
    oneDay.json?.stats?.sessionsOutstanding === s.sessionsOutstanding,
    { day: oneDay.json?.stats?.sessionsOutstanding, all: s.sessionsOutstanding },
  );
  check(
    "the range it applied comes back with the answer",
    oneDay.json?.from === t0 && oneDay.json?.to === t0,
    oneDay.json,
  );

  /* A range whose end is before its start is a slip of the hand, not a request
     for nothing: it is read the way it was obviously meant. */
  const swapped = await req(
    staff,
    `/api/admin/stats?from=2026-12-31&to=2026-01-01`,
  );
  check(
    "a backwards range is read the right way round",
    swapped.json?.from === "2026-01-01" && swapped.json?.to === "2026-12-31",
    swapped.json,
  );

  /* A month of takings can never exceed the takings of all time. */
  const month = await req(staff, "/api/admin/stats?from=2026-01-01&to=2026-12-31");
  check(
    "a bounded period never reports more revenue than all time",
    month.json?.stats?.revenueCents <= s.revenueCents,
    { period: month.json?.stats?.revenueCents, all: s.revenueCents },
  );

  const junk = await req(staff, "/api/admin/stats?from=nonsense&to=whenever");
  check(
    "a nonsense period falls back to all time",
    junk.json?.from === null &&
      junk.json?.to === null &&
      junk.json?.stats?.bookings === s.bookings,
    junk.json,
  );

  const soon = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10);
  const day = await req(staff, `/api/admin/day?date=${soon}`);
  check("any day's classes can be read", Array.isArray(day.json?.sessions), day.json);
  const badDay = await req(staff, "/api/admin/day?date=15-08-2026");
  check("a malformed date is refused", badDay.json?.error === "BAD_DAY", badDay.json);
  const locked = await req(jar(), `/api/admin/day?date=${soon}`);
  check("and it is not open to the public", locked.status === 401, locked.status);
}

/* ------------------------------------------------------------------ 1c */
console.log("\n1c. Reception runs the desk; the numbers are the owner's");
const desk = jar();
{
  const inOne = await req(desk, "/api/admin/unlock", {
    method: "POST",
    body: { email: RECEPTION.email, password: RECEPTION.password },
  });
  check("reception opens the desk with their own password", inOne.json?.ok === true, inOne.json);

  const page = await req(desk, "/admin");
  check("the console loads for them", page.status === 200, page.status);
  check(
    "with the five tabs they need",
    ["today", "members", "timetable", "notices", "pricing"].every((x) =>
      page.text.includes(`data-desk-tab="${x}"`),
    ),
    "a tab is missing",
  );
  /* The one they do not get. Not a styling choice: the tab is absent, the
     figures were never queried for this page, and the route says no. */
  check(
    "and no analytics tab",
    !page.text.includes('data-desk-tab="analytics"'),
    "reception was shown the analytics tab",
  );
  check(
    "nothing of the takings is on the page",
    !/REVENUE|Revenue \(paid\)|revenueCents/.test(page.text),
    "a revenue figure reached reception's screen",
  );

  const stats = await req(desk, "/api/admin/stats");
  check("the numbers are refused, not merely hidden", stats.status === 403, stats.status);
  const statsRange = await req(desk, "/api/admin/stats?from=2026-01-01");
  check("and refused however they are asked for", statsRange.status === 403, statsRange.status);

  /* Reception can still do the job. */
  const work = await req(desk, "/api/admin/members?q=member");
  check("but the membership is still theirs to search", work.status === 200, work.status);
  const rota = await req(desk, `/api/admin/day?date=${new Date().toISOString().slice(0, 10)}`);
  check("and so are the day's bookings", rota.status === 200, rota.status);

  /* One receptionist must not be able to take the console off the owner. */
  const ownerRow = await req(staff, `/api/admin/members?q=${OWNER.email}`);
  const ownerId = ownerRow.json?.members?.[0]?.id ?? null;
  check("the owner can see the studio's own accounts", Boolean(ownerId), ownerRow.json);

  const hidden = await req(desk, `/api/admin/members?q=${OWNER.email}`);
  check(
    "reception's search does not return desk accounts",
    (hidden.json?.members ?? []).length === 0,
    hidden.json,
  );
  const peek = await req(desk, `/api/admin/members?id=${ownerId}`);
  check("nor can they open one by id", peek.status === 404, peek.status);
  const steal = await req(desk, "/api/admin/member/password", {
    method: "POST",
    body: { userId: ownerId, password: "taken-over-12345" },
  });
  check(
    "and cannot reset the owner's password",
    steal.status === 404,
    steal.status,
  );
  const topUp = await req(desk, "/api/admin/sessions", {
    method: "POST",
    body: { userId: ownerId, credits: 5, method: "adjustment" },
  });
  check("nor move sessions onto a desk account", topUp.status === 404, topUp.status);

  /* The owner still can — somebody has to, when reception forgets theirs. */
  const receptionRow = await req(staff, `/api/admin/members?q=${RECEPTION.email}`);
  const receptionId = receptionRow.json?.members?.[0]?.id ?? null;
  check("the owner can find reception's account", Boolean(receptionId), receptionRow.json);
  const reset = await req(staff, "/api/admin/member/password", {
    method: "POST",
    body: { userId: receptionId, password: RECEPTION.password },
  });
  check("and set them a new password", reset.json?.ok === true, reset.json);
}

/* ------------------------------------------------------------------ 2 */
console.log("\n2. Sessions sold at the desk");
const buyer = await member("cash");
let buyerId = null;
{
  const found = await req(staff, `/api/admin/members?q=${buyer.email}`);
  buyerId = found.json?.members?.[0]?.id ?? null;
  check("the desk can find them", Boolean(buyerId), found.json);

  const sold = await req(staff, "/api/admin/sessions", {
    method: "POST",
    body: {
      userId: buyerId,
      credits: 10,
      amountCents: 20000,
      method: "cash",
      note: "Paid cash",
    },
  });
  check("ten sessions for cash", sold.json?.balance === 10, sold.json);

  const detail = await req(staff, `/api/admin/members?id=${buyerId}`);
  const payment = detail.json?.member?.payments?.[0];
  check(
    "recorded as a payment, not only a balance",
    payment?.provider === "cash" && payment?.amountCents === 20000,
    payment,
  );
  check(
    "and written to the ledger with who did it",
    (detail.json?.member?.ledger ?? []).some((l) =>
      (l.note ?? "").includes("Paid cash"),
    ),
    detail.json?.member?.ledger,
  );

  const taken = await req(staff, "/api/admin/sessions", {
    method: "POST",
    body: { userId: buyerId, credits: -3, method: "adjustment" },
  });
  check("three taken back", taken.json?.balance === 7, taken.json);

  const tooMany = await req(staff, "/api/admin/sessions", {
    method: "POST",
    body: { userId: buyerId, credits: -99, method: "adjustment" },
  });
  check(
    "taking more than they have empties, never goes negative",
    tooMany.json?.balance === 0,
    tooMany.json,
  );

  const zero = await req(staff, "/api/admin/sessions", {
    method: "POST",
    body: { userId: buyerId, credits: 0 },
  });
  check("zero is refused", zero.json?.error === "BAD_AMOUNT", zero.json);
}

/* ------------------------------------------------------------------ 3 */
console.log("\n3. Cancelling for a member, refund or not");
{
  await req(staff, "/api/admin/sessions", {
    method: "POST",
    body: { userId: buyerId, credits: 4, method: "adjustment" },
  });

  const sessions = await req(buyer.j, "/api/sessions?days=14");
  const slot = (sessions.json?.sessions ?? []).find(
    (s) => s.spotsLeft > 0 && new Date(s.startsAt) > new Date(Date.now() + 72 * 3600e3),
  );
  const booked = await req(buyer.j, "/api/bookings", {
    method: "POST",
    body: { sessionId: slot.id },
  });
  check("the member books a class", booked.json?.ok === true, booked.json);
  check("their balance drops to 3", booked.json?.credits === 3, booked.json);

  const detail = await req(staff, `/api/admin/members?id=${buyerId}`);
  const bookingId = detail.json?.member?.upcoming?.[0]?.id;
  check("the desk sees the booking", Boolean(bookingId), detail.json?.member?.upcoming);

  const cancelled = await req(staff, "/api/admin/bookings", {
    method: "POST",
    body: { bookingId, refund: true },
  });
  check("cancelled with a refund", cancelled.json?.refunded === true, cancelled.json);
  check("and the session came back", cancelled.json?.balance === 4, cancelled.json);

  const again = await req(staff, "/api/admin/bookings", {
    method: "POST",
    body: { bookingId, refund: true },
  });
  check(
    "cancelling twice cannot refund twice",
    again.json?.error === "ALREADY_CANCELLED",
    again.json,
  );
}

/* ------------------------------------------------------------------ 4 */
console.log("\n4. Their details, and their password");
{
  const newEmail = `moved-${Date.now()}@apex.test`;
  const patched = await req(staff, "/api/admin/member", {
    method: "PATCH",
    body: {
      userId: buyerId,
      email: newEmail,
      phone: uniquePhone(),
      notifySms: true,
    },
  });
  check("email and phone corrected", patched.json?.ok === true, patched.json);

  const clash = await req(staff, "/api/admin/member", {
    method: "PATCH",
    body: { userId: buyerId, email: OWNER.email },
  });
  check(
    "an email already in use is refused",
    clash.json?.error === "EMAIL_TAKEN",
    clash.json,
  );

  const junk = await req(staff, "/api/admin/member", {
    method: "PATCH",
    body: { userId: buyerId, email: "not-an-email" },
  });
  check("nonsense is refused", junk.json?.error === "EMAIL_INVALID", junk.json);

  const short = await req(staff, "/api/admin/member/password", {
    method: "POST",
    body: { userId: buyerId, password: "abc" },
  });
  check(
    "a short password is refused",
    short.json?.error === "PASSWORD_SHORT",
    short.json,
  );

  const set = await req(staff, "/api/admin/member/password", {
    method: "POST",
    body: { userId: buyerId, password: "brand-new-pass" },
  });
  check("a new password is set", set.json?.ok === true, set.json);

  const fresh = jar();
  const login = await req(fresh, "/api/auth/login", {
    method: "POST",
    body: { email: newEmail, password: "brand-new-pass" },
  });
  check("the member can sign in with it", login.json?.ok === true, login.json);
}

/* ------------------------------------------------------------------ 5 */
console.log("\n5. Closing a day");
{
  /* Far enough ahead that the rota has classes on it, and a weekday. */
  const target = new Date(Date.now() + 9 * 86400e3);
  while (target.getUTCDay() === 0) target.setUTCDate(target.getUTCDate() + 1);
  const day = target.toISOString().slice(0, 10);

  await req(staff, "/api/admin/sessions", {
    method: "POST",
    body: { userId: buyerId, credits: 2, method: "adjustment" },
  });
  const before = await req(staff, `/api/admin/members?id=${buyerId}`);
  const balanceBefore = before.json?.member?.credits ?? 0;

  const sessions = await req(buyer.j, "/api/sessions?days=20");
  const onThatDay = (sessions.json?.sessions ?? []).find(
    (s) => s.startsAt.slice(0, 10) === day && s.spotsLeft > 0,
  );
  check("there is a class to lose", Boolean(onThatDay), day);

  if (onThatDay) {
    await req(buyer.j, "/api/bookings", {
      method: "POST",
      body: { sessionId: onThatDay.id },
    });

    const closed = await req(staff, "/api/admin/closures", {
      method: "POST",
      body: { day, reasonEn: "Public holiday" },
    });
    check("the day closes", closed.json?.ok === true, closed.json);
    check(
      "its classes are cancelled",
      (closed.json?.classesCancelled ?? 0) > 0,
      closed.json?.classesCancelled,
    );
    check(
      "the desk is told who was in them",
      (closed.json?.affected ?? []).some((a) => a.refunded),
      closed.json?.affected,
    );

    const after = await req(staff, `/api/admin/members?id=${buyerId}`);
    check(
      "the member has their session back",
      after.json?.member?.credits === balanceBefore,
      { before: balanceBefore, after: after.json?.member?.credits },
    );

    const timetable = await req(jar(), "/timetable");
    check(
      "the day is gone from the timetable",
      !timetable.text.includes(`"${day}"`),
      "closed day still offered",
    );

    const bad = await req(staff, "/api/admin/closures", {
      method: "POST",
      body: { day: "not-a-day" },
    });
    check("a nonsense date is refused", bad.json?.error === "BAD_DAY", bad.json);

    const reopened = await req(staff, `/api/admin/closures?day=${day}`, {
      method: "DELETE",
    });
    check("and it can be opened again", reopened.json?.reopened === true, reopened.json);
  }
}

/* ------------------------------------------------------------------ 6 */
console.log("\n6. A notice to every member");
{
  const reader = await member("reader");

  const sent = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Closed on Monday",
      bodyEn: "The studio is shut for the public holiday. Classes resume Tuesday.",
      important: true,
    },
  });
  check("the notice is sent", sent.json?.ok === true, sent.json);

  const tooShort = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: { titleEn: "a", bodyEn: "b" },
  });
  check("an empty one is refused", tooShort.json?.error === "TOO_SHORT", tooShort.json);

  const account = await req(reader.j, "/account?tab=notifications");
  check(
    "it is in the member's account",
    account.text.includes("Closed on Monday"),
    "notice missing",
  );
  check(
    "with an unread count on their face",
    /unread/i.test(account.text),
    "no unread marker",
  );

  const read = await req(reader.j, "/api/notices/read", {
    method: "POST",
    body: {},
  });
  check("marking all read works", read.json?.unread === 0, read.json);

  const anon = await req(jar(), "/api/notices/read", { method: "POST", body: {} });
  check(
    "a stranger cannot mark anything read",
    anon.status === 401,
    anon.status,
  );

  const history = await req(staff, "/api/admin/notices");
  const first = history.json?.notices?.[0];
  check("the desk sees who has read it", (first?.reads ?? 0) >= 1, first);
}

/* ------------------------------------------------------------------ 7 */
console.log("\n7. An offer on the price list");
{
  const twenty = await req(staff, "/api/admin/pricing", {
    method: "POST",
    body: { kind: "PERCENT", value: 20, labelEn: "Summer offer" },
  });
  check("20% off the list", twenty.json?.ok === true, twenty.json);

  const pricing = await req(jar(), "/pricing");
  check(
    "the pricing page shows the offer",
    pricing.text.includes("Summer offer"),
    "label missing",
  );
  check(
    "and the old price beside it",
    pricing.text.includes("line-through"),
    "no struck-through price",
  );
  check(
    "the 10-pack is 160 rather than 200",
    pricing.text.includes("160") && pricing.text.includes("200"),
    "prices look wrong",
  );

  /* The charge has to match the shown price, not the list price. */
  const shopper = await member("shopper");
  const opened = await req(shopper.j, "/api/checkout", {
    method: "POST",
    body: { packSlug: "pack-10" },
  });
  await req(shopper.j, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId: opened.json?.purchaseId },
  });
  const found = await req(staff, `/api/admin/members?q=${shopper.email}`);
  const detail = await req(
    staff,
    `/api/admin/members?id=${found.json?.members?.[0]?.id}`,
  );
  check(
    "and the member is charged the offer price",
    detail.json?.member?.payments?.[0]?.amountCents === 16000,
    detail.json?.member?.payments?.[0],
  );

  const silly = await req(staff, "/api/admin/pricing", {
    method: "POST",
    body: { kind: "PERCENT", value: 99 },
  });
  check("99% off is refused", silly.json?.error === "BAD_VALUE", silly.json);

  const perPack = await req(staff, "/api/admin/pricing", {
    method: "POST",
    body: { packageId: null, kind: "FLAT", value: 1000, labelEn: "€10 off" },
  });
  check("a flat rule replaces the percent one", perPack.json?.ok === true, perPack.json);
  const rules = perPack.json?.rules ?? [];
  check(
    "and does not stack on top of it",
    rules.filter((r) => r.packageId === null).length === 1,
    rules,
  );

  const cleared = await req(staff, "/api/admin/pricing?all=1", {
    method: "DELETE",
  });
  check("everything clears in one press", cleared.json?.ok === true, cleared.json);

  const normal = await req(jar(), "/pricing");
  check(
    "prices are back to normal",
    !normal.text.includes("line-through"),
    "an offer is still showing",
  );
}

/* ------------------------------------------------------------------ 8 */
console.log("\n8. Leaving the desk");
{
  /* The 45 minutes lapsing on its own: the session survives, so the door asks
     for the password alone — and offers a way out to the email form, because
     the person sitting down is not always the person who stood up. */
  await req(staff, "/api/admin/lock", { method: "POST" });
  const after = await req(staff, "/api/admin/members?q=member");
  check("a lapsed unlock closes the console", after.status === 423, after.status);
  const page = await req(staff, "/admin");
  check(
    "and asks for the password next time",
    page.text.includes("desk-password"),
    "no password box",
  );
  check(
    "with a way to sign in as somebody else",
    page.text.includes("Sign in as somebody else"),
    "no way off the password screen",
  );

  /* Log out is the button on the console, and it ends the session too. Coming
     back has to ask who you are, not merely ask you to prove you are the last
     person to use this machine. */
  await req(staff, "/api/auth/logout", { method: "POST" });
  const door = await req(staff, "/admin");
  check(
    "logging out puts the email box back",
    door.text.includes("desk-email") && door.text.includes("desk-password"),
    "no email box after signing out",
  );
  check(
    "and the name of whoever was signed in is gone",
    !door.text.includes("Studio Owner"),
    "the previous person's name survived the sign-out",
  );
  const shut = await req(staff, "/api/admin/members?q=member");
  check("the API is closed to them again", shut.status === 401, shut.status);

  /* The other account can now sign in on the same machine. */
  const swap = await req(staff, "/api/admin/unlock", {
    method: "POST",
    body: { email: RECEPTION.email, password: RECEPTION.password },
  });
  check("and the other account signs in on the same browser", swap.json?.ok === true, swap.json);
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`,
);
process.exit(fail === 0 ? 0 : 1);

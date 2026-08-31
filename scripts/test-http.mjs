/**
 * End-to-end HTTP test against a running server.
 *   npm run build && npx next start -p 3100
 *   node scripts/test-http.mjs http://localhost:3100
 */
import { markVerified } from "./fixture-verify.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";


/* One number, one account — so every registration in this suite needs its own.
   Registering two members with the same phone is now correctly refused. */
let __phoneSeq = 0;
function uniquePhone() {
  return `+35799${String(100000 + ((Date.now() % 800000) + __phoneSeq++ * 13)).slice(0, 6)}`;
}
let pass = 0,
  fail = 0;
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(jar.size ? { cookie: cookieHeader() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const [k, ...rest] = pair.split("=");
    jar.set(k.trim(), rest.join("="));
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  /* Where a redirect points, not only that it redirected. Two guards now send
     somebody to two different places — /login when they are not signed in,
     /verify when they are but the address is unconfirmed — and a suite that only
     counted the 307 would pass either way. */
  return {
    status: res.status,
    json,
    text,
    headers: { location: res.headers.get("location") ?? "" },
  };
}

function check(label, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, extra ?? "");
  }
}

const email = `http-${Date.now()}@apex.test`;

console.log("\n1. Public pages");
for (const p of [
  "/",
  "/studio",
  "/classes",
  "/timetable",
  "/pricing",
  "/contact",
  "/login",
  "/register",
  "/privacy",
  "/terms",
  "/sitemap.xml",
  "/robots.txt",
]) {
  const r = await req(p);
  check(`GET ${p} → 200`, r.status === 200, r.status);
}

/* The cover carries its own way in, because the header hides its account chip
   over that section — so without this a visitor on the home page has no visible
   sign-in at all. */
const coverOut = await req("/");
check(
  "the cover offers a sign in when nobody is signed in",
  coverOut.text.includes("Already a member") && coverOut.text.includes('href="/login"'),
  "no sign-in on the cover",
);

console.log("\n2. Guarded pages are closed when signed out");
const guardedAccount = await req("/account");
check(
  "GET /account redirects",
  guardedAccount.status === 307 || guardedAccount.status === 302,
  guardedAccount.status,
);
/* /admin is deliberately not a redirect: typing the address is the whole
   journey, so the door itself asks for staff credentials. What matters is that
   the page is the sign-in form and none of the console leaked into it. */
const guardedAdmin = await req("/admin");
check(
  "GET /admin serves its own sign-in form",
  guardedAdmin.status === 200 && guardedAdmin.text.includes("desk-email"),
  guardedAdmin.status,
);
check(
  "GET /admin leaks none of the console",
  !/desk-tab|data-desk-console/.test(guardedAdmin.text),
);
const noAuth = await req("/api/bookings");
check("GET /api/bookings needs auth", noAuth.status === 401, noAuth.status);

console.log("\n3. Register");
const bad = await req("/api/auth/register", {
  method: "POST",
  body: { name: "X", email: "not-an-email", password: "short" },
});
check("invalid registration rejected", bad.status === 400, bad.status);

const reg = await req("/api/auth/register", {
  method: "POST",
  body: {
    name: "HTTP Tester",
    email,
    password: "test12345",
    phone: uniquePhone(),
    serviceOptIn: true,
  },
});
check("registration succeeds", reg.status === 200 && reg.json?.ok === true, reg.json);
check("session cookie set", jar.has("apex_session"));
check(
  "registration asks for the emailed code",
  reg.json?.verify === true,
  reg.json,
);

console.log("\n3b. An unverified account can do nothing at all");
/* Not "cannot book" — cannot go anywhere. Until the code is typed the middleware
   sends every address on the site back to the code box, which is what the studio
   asked for. */
for (const path of ["/account", "/", "/pricing", "/timetable", "/faq"]) {
  const r = await req(path);
  check(
    `GET ${path} sends them to the code box`,
    (r.status === 307 || r.status === 302) &&
      (r.headers?.location ?? "").includes("/verify"),
    { status: r.status, to: r.headers?.location },
  );
}
const verifyPage = await req("/verify");
check("GET /verify is the one page that loads", verifyPage.status === 200, verifyPage.status);
check(
  "and shows the address the code went to",
  verifyPage.text.includes(email),
  "the address is not on the page",
);
check(
  "with a way out for a mistyped address",
  /Sign out|sign out/.test(verifyPage.text),
  "no sign-out on the verify page",
);

/* APIs get an answer rather than a redirect: `fetch` follows a 307 by default,
   so a redirect here would hand the caller HTML where it expected JSON. */
for (const [path, body] of [
  ["/api/bookings", { sessionId: "does-not-matter" }],
  ["/api/checkout", { packSlug: "single" }],
  ["/api/profile", { name: "Nope" }],
]) {
  const r = await req(path, { method: "POST", body });
  check(
    `POST ${path} is refused with EMAIL_UNVERIFIED`,
    r.status === 403 && r.json?.error === "EMAIL_UNVERIFIED",
    { status: r.status, json: r.json },
  );
}

const wrongCode = await req("/api/auth/verify", {
  method: "POST",
  body: { code: "000000" },
});
check(
  "a wrong code is refused with tries left",
  wrongCode.status === 400 &&
    wrongCode.json?.error === "WRONG" &&
    typeof wrongCode.json?.attemptsLeft === "number",
  wrongCode.json,
);
const resend = await req("/api/auth/verify/resend", { method: "POST" });
check(
  "asking again straight away is refused, with a wait",
  resend.status === 429 &&
    resend.json?.error === "TOO_SOON" &&
    resend.json.secondsLeft > 0,
  resend.json,
);

/* Signing out has to work from in here, or the only mistake anybody actually
   makes — a typo in their own address — has no remedy. */
const escaped = await req("/api/auth/logout", { method: "POST" });
check("signing out works from the code box", escaped.status === 200, escaped.status);
const anonHome = await req("/");
check("and the site is browsable again", anonHome.status === 200, anonHome.status);

/* Back in, verified the way a member would be: the row is stamped and the
   cookie is re-issued by signing in again. */
check("the fixture verifies", markVerified(email) === 1);
const backIn = await req("/api/auth/login", {
  method: "POST",
  body: { email, password: "test12345" },
});
check("and signs back in", backIn.json?.ok === true, backIn.json);
check(
  "the cookie no longer says unconfirmed",
  backIn.json?.verify === false,
  backIn.json,
);
check(
  "so /verify sends them on rather than asking again",
  [307, 302].includes((await req("/verify")).status),
);

console.log("\n3c. Closing the browser does not lose the account");
/* The studio asked what happens to somebody who registers, never types the
   code, and comes back later. The answer this locks in: the account is kept, the
   same password still works, they land back on the code box, and the code they
   were already sent is still the one to type — no new one needed unless it has
   expired. */
{
  const keep = new Map(jar);
  jar.clear();

  const lapsedEmail = `lapsed-${Date.now()}@apex.test`;
  const made = await req("/api/auth/register", {
    method: "POST",
    body: {
      name: "Came Back Later",
      email: lapsedEmail,
      password: "test12345",
      phone: uniquePhone(),
      serviceOptIn: true,
    },
  });
  check("registers", made.json?.ok === true, made.json);

  /* Closing the browser: the cookie is gone, the row is not. */
  jar.clear();

  const again = await req("/api/auth/login", {
    method: "POST",
    body: { email: lapsedEmail, password: "test12345" },
  });
  check("the same credentials still sign in", again.json?.ok === true, again.json);
  check("and are sent to the code box", again.json?.verify === true, again.json);

  const state = await req("/api/auth/verify");
  check("the code they were already sent is still live", state.json?.challenge, state.json);
  check(
    "not expired, so there is nothing to re-request",
    state.json?.challenge?.expired === false,
    state.json?.challenge,
  );
  check(
    "and it has all its attempts",
    state.json?.challenge?.attemptsLeft === 5,
    state.json?.challenge,
  );

  await req("/api/auth/logout", { method: "POST" });
  jar.clear();
  for (const [k, v] of keep) jar.set(k, v);
}

console.log("\n4. Account page now loads");
const acct = await req("/account");
check("GET /account → 200", acct.status === 200, acct.status);
check("session balance shows on page", acct.text.includes("Session balance"));

/* And once signed in, the same spot shows who you are instead. */
const coverIn = await req("/");
check(
  "the cover shows the member instead once signed in",
  coverIn.text.includes("HTTP Tester") || coverIn.text.includes("HTTP"),
  "no member on the cover",
);
check(
  "and stops offering a sign in",
  !coverIn.text.includes("Already a member"),
  "the cover still asks them to sign in",
);

console.log("\n4b. Every account section is reachable by its own address");
/* The header menu links to these. Each has to render its own section: clicking
   Profile once landed on Notifications, because "no tab in the address" was
   being treated as "an address I do not recognise" and the old section stayed. */
for (const [tab, needle] of [
  ["", "Session balance"],
  ["profile", "Session balance"],
  ["notifications", "Always on"],
  ["activity", "Session activity"],
  ["classes", "Past classes"],
  ["payments", "Payments"],
  ["password", "Password"],
  ["nonsense", "Session balance"],
]) {
  const r = await req(tab ? `/account?tab=${tab}` : "/account");
  check(
    `GET /account${tab ? `?tab=${tab}` : ""} renders its section`,
    r.status === 200 && r.text.includes(needle),
    r.status,
  );
}

console.log("\n5. Booking without credits");
const sess = await req("/api/sessions?days=10");
const list = sess.json?.sessions ?? [];
check("timetable API returns classes", list.length > 0, list.length);
/* Comfortably outside the 24-hour cancellation window, so the cancel step
   below exercises the refund path rather than the lock-out. */
const target = list.find(
  (s) => s.spotsLeft > 0 && new Date(s.startsAt) > new Date(Date.now() + 48 * 3600_000),
);
check("found a bookable class", Boolean(target));

const noCredits = await req("/api/bookings", {
  method: "POST",
  body: { sessionId: target.id },
});
check("booking refused with no credits", noCredits.json?.error === "NO_CREDITS", noCredits.json);

console.log("\n6. Buy a pack");
const pricing = await req("/pricing");
check("pricing page renders €200 pack", pricing.text.includes("200"));
check("the 3-class pack is no longer offered", !/Intro\s*·\s*3/.test(pricing.text));
check("no 3-session pack anywhere on the page", !/"credits":3/.test(pricing.text));

/* Buying is two steps now, the same two a card goes through: open the payment,
   then settle it. Nothing is granted by opening it — see scripts/test-payments.mjs
   for the full set of promises around that. */
const opened = await req("/api/checkout", { method: "POST", body: { packSlug: "month-2" } });
check("a payment opens for the 10-class pack", Boolean(opened.json?.purchaseId), opened.json);
check(
  "the provider says how to pay",
  ["fields", "redirect", "test"].includes(opened.json?.mode),
  opened.json,
);

const settled = await req("/api/payments/settle", {
  method: "POST",
  body: { purchaseId: opened.json?.purchaseId },
});
check("settling it grants the sessions", settled.json?.status === "PAID", settled.json);
check("balance is 8", settled.json?.credits === 8, settled.json);

console.log("\n7. Book with credits");
const booked = await req("/api/bookings", { method: "POST", body: { sessionId: target.id } });
check("booking succeeds", booked.json?.ok === true, booked.json);
check("balance is now 7", booked.json?.credits === 7, booked.json);

const again = await req("/api/bookings", { method: "POST", body: { sessionId: target.id } });
check("double booking refused", again.json?.error === "ALREADY_BOOKED", again.json);

const mine = await req("/api/bookings");
check("upcoming list has 1 booking", mine.json?.upcoming?.length === 1, mine.json?.upcoming?.length);

console.log("\n8. Cancel and get the credit back");
const bookingId = booked.json?.bookingId;
const cancelled = await req("/api/bookings/cancel", { method: "POST", body: { bookingId } });
check("cancel succeeds and refunds", cancelled.json?.ok && cancelled.json?.refunded, cancelled.json);
check("balance back to 8", cancelled.json?.credits === 8, cancelled.json);

/* Every class the studio runs is 60 minutes with five places. */
const cap = list.every((s) => s.capacity === 5);
check("every class has five places", cap, list.find((s) => s.capacity !== 5)?.capacity);
const oneHour = list.every(
  (s) => !s.endsAt || new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime() === 3600_000,
);
check("class length is 60 minutes", oneHour);

/* The page must render the hour it ends, not 50 minutes past the hour. */
const tt = await req("/timetable");
check("timetable shows whole-hour end times", !/0\d:50|1\d:50|2\d:50/.test(tt.text));
check("timetable never offers a Sunday", !/>\s*SUN\s*</i.test(tt.text));

const cancelAgain = await req("/api/bookings/cancel", { method: "POST", body: { bookingId } });
check("double cancel refused", cancelAgain.status === 409, cancelAgain.status);

console.log("\n9. Cannot touch another member's booking");
const otherJarBackup = new Map(jar);
jar.clear();
const otherEmail = `other-${Date.now()}@apex.test`;
await req("/api/auth/register", {
  method: "POST",
  body: {
    name: "Second User",
    email: otherEmail,
    password: "test12345",
    phone: uniquePhone(),
    serviceOptIn: true,
  },
});
/* Refused twice over until the address is confirmed, which would hide the rule
   being tested here: verify first, so the 409 that comes back is "that booking
   is not yours" rather than "confirm your email". */
const stealUnverified = await req("/api/bookings/cancel", {
  method: "POST",
  body: { bookingId },
});
check(
  "an unverified account cannot cancel anything at all",
  stealUnverified.status === 403 &&
    stealUnverified.json?.error === "EMAIL_UNVERIFIED",
  stealUnverified.json,
);
check("the second fixture verifies", markVerified(otherEmail) === 1);
/* And signs in again, so the cookie carries the confirmed stamp — otherwise the
   middleware answers first and this tests the wrong rule. */
await req("/api/auth/login", {
  method: "POST",
  body: { email: otherEmail, password: "test12345" },
});
const steal = await req("/api/bookings/cancel", { method: "POST", body: { bookingId } });
check("other member cannot cancel it", steal.status === 409, steal.status);
jar.clear();
for (const [k, v] of otherJarBackup) jar.set(k, v);

console.log("\n10. Admin is staff-only");
const adminBlocked = await req("/api/admin/generate", { method: "POST", body: { weeks: 1 } });
check("member cannot generate schedule", adminBlocked.status === 403, adminBlocked.status);
/* A signed-in member sees the very same door a stranger sees — no redirect to
   their account, no hint that they are on the wrong side of it. */
const adminPage = await req("/admin");
check(
  "member sees the desk door, not the console",
  adminPage.status === 200 &&
    adminPage.text.includes("desk-email") &&
    !adminPage.text.includes("data-desk-console"),
  adminPage.status,
);

console.log("\n11. Admin login, and the desk's own lock");
jar.clear();
const adminLogin = await req("/api/auth/login", {
  method: "POST",
  body: { email: "owner@apexpilates.cy", password: "ownerdev123" },
});
check("admin signs in", adminLogin.json?.ok === true, adminLogin.json);

/* The console is behind a second door: staff, and the password typed again.
   scripts/test-desk.mjs is where that lock is tested properly. */
const locked = await req("/admin");
check("the console loads", locked.status === 200, locked.status);
check("locked, asking for the password", locked.text.includes("desk-password"));
const blocked = await req("/api/admin/generate", { method: "POST", body: { weeks: 2 } });
check("and its actions are refused until then", blocked.status === 423, blocked.status);

await req("/api/admin/unlock", {
  method: "POST",
  body: { password: "ownerdev123" },
});
const adminOk = await req("/admin");
check("unlocked, the dashboard loads", adminOk.status === 200, adminOk.status);
/* The console proper, not the door: its marker and its own tab bar. The
   analytics live behind a tab of their own now, so the opening screen is the
   day's bookings rather than a row of takings. */
check(
  "the console itself is on screen",
  adminOk.text.includes("data-desk-console") &&
    adminOk.text.includes('data-desk-tab="analytics"'),
  "no desk console",
);
const gen = await req("/api/admin/generate", { method: "POST", body: { weeks: 2 } });
check("admin can generate schedule", gen.json?.ok === true, gen.json);

console.log("\n12. Contact form");
const contact = await req("/api/contact", {
  method: "POST",
  body: { name: "Enquiry Test", email: "hi@example.com", message: "Do you run duets on Saturdays?" },
});
check("contact message accepted", contact.json?.ok === true, contact.json);
const badContact = await req("/api/contact", { method: "POST", body: { name: "x", email: "bad" } });
check("bad contact message rejected", badContact.status === 400, badContact.status);

/* Name, email and message are all required, and the message has a floor. */
const missingName = await req("/api/contact", {
  method: "POST",
  body: { email: "hi@example.com", message: "A properly long enquiry about levels." },
});
check("contact needs a name", missingName.json?.error === "NAME_REQUIRED", missingName.json);

const missingEmail = await req("/api/contact", {
  method: "POST",
  body: { name: "Test Person", message: "A properly long enquiry about levels." },
});
check("contact needs an email", missingEmail.json?.error === "EMAIL_INVALID", missingEmail.json);

const shortMessage = await req("/api/contact", {
  method: "POST",
  body: { name: "Test Person", email: "hi@example.com", message: "hi" },
});
check(
  "contact refuses a too-short message",
  shortMessage.json?.error === "MESSAGE_TOO_SHORT",
  shortMessage.json,
);

const noMessage = await req("/api/contact", {
  method: "POST",
  body: { name: "Test Person", email: "hi@example.com" },
});
check("contact needs a message", noMessage.status === 400, noMessage.status);

console.log("\n12b. Studio details and social accounts");
const contactPage = await req("/contact");
for (const needle of [
  "Grigori Afxentiou 9",
  "Livadia, Larnaca 7060",
  "facebook.com/profile.php?id=61593707540014",
  "instagram.com/pilatesbyapex",
]) {
  check(`contact page shows ${needle}`, contactPage.text.includes(needle));
}
const home = await req("/");
check("footer links Facebook", home.text.includes("facebook.com/profile.php?id=61593707540014"));
/* The build credit, on every page because it lives in the footer. */
check("footer credits the maker", home.text.includes("Developed &amp; Designed by") || home.text.includes("Developed & Designed by"));
check("and links to them", home.text.includes("https://www.ergonsite.com"));
check("with the wordmark, not the name in text", home.text.includes("ergonsite.png"));
check("footer links Instagram", home.text.includes("instagram.com/pilatesbyapex"));
/* The accounts are shown as the platforms' own marks, not as words. */
for (const page of [home, contactPage]) {
  check("social marks render", page.text.includes("social-icon-instagram") && page.text.includes("social-icon-facebook"));
  check("each mark carries the handle", page.text.includes("Instagram: @pilatesbyapex") && page.text.includes("Facebook: @pilatesbyapex"));
}
check(
  "timetable line drops the real-time claim",
  !(await req("/timetable")).text.includes("Availability updates in real time"),
);
check("contact promises a reply back soon", contactPage.text.includes("reply back soon"));

console.log("\n12c. Instructor portraits");
const classesPage = await req("/classes");
for (const slug of ["maria-k", "elena-s", "andreas-p", "chris-m"]) {
  check(`team card shows ${slug}`, classesPage.text.includes(`${slug}.jpg`));
}

console.log("\n13. Stripe webhook is protected");
const hook = await req("/api/stripe/webhook", { method: "POST", body: { type: "checkout.session.completed" } });
check("webhook refuses unsigned calls", hook.status === 503 || hook.status === 400, hook.status);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

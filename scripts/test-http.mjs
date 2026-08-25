/**
 * End-to-end HTTP test against a running server.
 *   npm run build && npx next start -p 3100
 *   node scripts/test-http.mjs http://localhost:3100
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
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
  return { status: res.status, json, text };
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

console.log("\n2. Guarded pages redirect when signed out");
for (const p of ["/account", "/admin"]) {
  const r = await req(p);
  check(`GET ${p} redirects`, r.status === 307 || r.status === 302, r.status);
}
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
    phone: "+357 99 111 222",
    serviceOptIn: true,
  },
});
check("registration succeeds", reg.status === 200 && reg.json?.ok === true, reg.json);
check("session cookie set", jar.has("apex_session"));

const dupe = await req("/api/auth/register", {
  method: "POST",
  body: {
    name: "HTTP Tester",
    email,
    password: "test12345",
    phone: "+357 99 111 222",
    serviceOptIn: true,
  },
});
check("duplicate email refused", dupe.json?.error === "EMAIL_TAKEN", dupe.json);

console.log("\n4. Account page now loads");
const acct = await req("/account");
check("GET /account → 200", acct.status === 200, acct.status);
check("session balance shows on page", acct.text.includes("Session balance"));

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

console.log("\n6. Buy a pack (dev grant path)");
const pricing = await req("/pricing");
check("pricing page renders €200 pack", pricing.text.includes("200"));
check("the 3-class pack is no longer offered", !/Intro\s*·\s*3/.test(pricing.text));
check("no 3-session pack anywhere on the page", !/"credits":3/.test(pricing.text));
/* find the 10-class package id via the sessions-free admin-less route: parse from HTML is brittle,
   so use the seeded slug through a tiny lookup endpoint substitute: the checkout route needs an id.
   We read it from the page payload instead. */
const idMatch = [...pricing.text.matchAll(/"id":"([0-9a-f-]{36})","slug":"pack-10"/g)];
let packageId = idMatch[0]?.[1] ?? null;
if (!packageId) {
  const anyMatch = pricing.text.match(/\\"id\\":\\"([0-9a-f-]{36})\\",\\"slug\\":\\"pack-10\\"/);
  packageId = anyMatch?.[1] ?? null;
}
check("found the 10-class package id in page data", Boolean(packageId), packageId);

if (packageId) {
  const checkout = await req("/api/checkout", { method: "POST", body: { packageId } });
  check(
    "checkout grants credits when Stripe is unset",
    checkout.json?.devGranted === true && checkout.json?.credits === 10,
    checkout.json,
  );
}

console.log("\n7. Book with credits");
const booked = await req("/api/bookings", { method: "POST", body: { sessionId: target.id } });
check("booking succeeds", booked.json?.ok === true, booked.json);
check("balance is now 9", booked.json?.credits === 9, booked.json);

const again = await req("/api/bookings", { method: "POST", body: { sessionId: target.id } });
check("double booking refused", again.json?.error === "ALREADY_BOOKED", again.json);

const mine = await req("/api/bookings");
check("upcoming list has 1 booking", mine.json?.upcoming?.length === 1, mine.json?.upcoming?.length);

console.log("\n8. Cancel and get the credit back");
const bookingId = booked.json?.bookingId;
const cancelled = await req("/api/bookings/cancel", { method: "POST", body: { bookingId } });
check("cancel succeeds and refunds", cancelled.json?.ok && cancelled.json?.refunded, cancelled.json);
check("balance back to 10", cancelled.json?.credits === 10, cancelled.json);

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
await req("/api/auth/register", {
  method: "POST",
  body: {
    name: "Second User",
    email: `other-${Date.now()}@apex.test`,
    password: "test12345",
    phone: "+357 99 222 333",
    serviceOptIn: true,
  },
});
const steal = await req("/api/bookings/cancel", { method: "POST", body: { bookingId } });
check("other member cannot cancel it", steal.status === 409, steal.status);
jar.clear();
for (const [k, v] of otherJarBackup) jar.set(k, v);

console.log("\n10. Admin is staff-only");
const adminBlocked = await req("/api/admin/generate", { method: "POST", body: { weeks: 1 } });
check("member cannot generate schedule", adminBlocked.status === 403, adminBlocked.status);
const adminPage = await req("/admin");
check("member redirected away from /admin", adminPage.status === 307 || adminPage.status === 302, adminPage.status);

console.log("\n11. Admin login works");
jar.clear();
const adminLogin = await req("/api/auth/login", {
  method: "POST",
  body: { email: "admin@apexpilates.cy", password: "apexadmin123" },
});
check("admin signs in", adminLogin.json?.ok === true, adminLogin.json);
const adminOk = await req("/admin");
check("admin dashboard loads", adminOk.status === 200, adminOk.status);
check("dashboard shows KPIs", adminOk.text.includes("Members"));
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

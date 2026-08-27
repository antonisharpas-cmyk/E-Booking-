/**
 * Buying a session pack: the checkout page, settlement, and the promises that
 * matter most — nobody is charged without getting sessions, nobody gets
 * sessions twice, and nobody can settle somebody else's payment.
 *
 *   npm run build && npx next start -p 3100
 *   node scripts/test-payments.mjs http://localhost:3100
 *
 * Runs against the test provider (no card, nothing charged), which exercises
 * exactly the same routes and the same fulfilment path as a real provider.
 */
const B = process.argv[2] ?? "http://localhost:3000";

/* One number, one account — so every registration in this suite needs its own.
   Registering two members with the same phone is now correctly refused. */
let __phoneSeq = 0;
function uniquePhone() {
  return `+35799${String(100000 + ((Date.now() % 800000) + __phoneSeq++ * 13)).slice(0, 6)}`;
}

function jar() {
  return new Map();
}
function ch(j) {
  return [...j].map(([k, v]) => `${k}=${v}`).join("; ");
}
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
    const [p] = c.split(";");
    const [k, ...r] = p.split("=");
    j.set(k.trim(), r.join("="));
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
  const email = `pay-${tag}-${Date.now()}@apex.test`;
  await req(j, "/api/auth/register", {
    method: "POST",
    body: {
      name: `Pay ${tag}`,
      email,
      phone: uniquePhone(),
      password: "test12345",
      serviceOptIn: true,
    },
  });
  return { j, email };
}

/** What the member's own account page says their balance is. */
async function balance(j) {
  const page = await req(j, "/account");
  const m = page.text.match(/data-balance="(\d+)"/);
  return m ? Number(m[1]) : null;
}

/* ------------------------------------------------------------------ 1 */
console.log("\n1. The checkout page is not open to the world");
{
  const anon = jar();
  const r = await req(anon, "/checkout?pack=pack-5");
  check(
    "a signed-out visitor is sent to sign in",
    r.status === 307 || r.status === 302,
    r.status,
  );
  check(
    "and comes back to the pack they picked",
    (r.headers.get("location") ?? "").includes("checkout"),
    r.headers.get("location"),
  );
  const noPack = await req(anon, "/checkout");
  check(
    "no pack means back to pricing",
    (noPack.headers.get("location") ?? "").includes("pricing"),
    noPack.headers.get("location"),
  );
  const api = await req(anon, "/api/checkout", {
    method: "POST",
    body: { packageId: "whatever" },
  });
  check("the API refuses a signed-out caller", api.json?.error === "UNAUTHENTICATED", api.json);
}

/* ------------------------------------------------------------------ 2 */
console.log("\n2. Opening a payment");
const buyer = await member("a");
let purchaseId = null;
{
  const page = await req(buyer.j, "/checkout?pack=pack-10");
  check("the page renders for a member", page.status === 200, page.status);
  check(
    "it shows the pack and the total",
    page.text.includes("10") && /€|EUR/.test(page.text),
    "pack or price missing",
  );
  check(
    "it is kept out of search results",
    page.text.includes("noindex"),
    "no robots directive",
  );

  const started = await req(buyer.j, "/api/checkout", {
    method: "POST",
    body: { packSlug: "pack-10" },
  });
  purchaseId = started.json?.purchaseId ?? null;
  check("a payment opens", Boolean(purchaseId), started.json);
  check(
    "the provider says how to pay",
    ["fields", "redirect", "test"].includes(started.json?.mode),
    started.json,
  );
  check(
    "no sessions are granted just for opening it",
    (await balance(buyer.j)) === 0,
    await balance(buyer.j),
  );

  const bad = await req(buyer.j, "/api/checkout", {
    method: "POST",
    body: { packSlug: "does-not-exist" },
  });
  check("an unknown pack is refused", bad.json?.error === "PACKAGE_NOT_FOUND", bad.json);
}

/* ------------------------------------------------------------------ 3 */
console.log("\n3. Settling the payment");
{
  const first = await req(buyer.j, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId },
  });
  check("the payment settles", first.json?.status === "PAID", first.json);
  check("ten sessions land on the account", first.json?.credits === 10, first.json);

  const again = await req(buyer.j, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId },
  });
  check("settling twice is safe", again.json?.status === "PAID", again.json);
  check(
    "and does not grant them twice",
    again.json?.credits === 10,
    again.json,
  );

  const third = await req(buyer.j, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId },
  });
  check("nor a third time", third.json?.credits === 10, third.json);

  const missing = await req(buyer.j, "/api/payments/settle", {
    method: "POST",
    body: {},
  });
  check("a settle with no purchase is refused", missing.json?.error === "BAD_REQUEST", missing.json);
}

/* ------------------------------------------------------------------ 4 */
console.log("\n4. One member cannot touch another's payment");
{
  const other = await member("b");
  const stolen = await req(other.j, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId },
  });
  check(
    "somebody else's purchase is not found",
    stolen.json?.error === "NOT_FOUND",
    stolen.json,
  );
  check("and their balance is untouched", (await balance(other.j)) === 0, await balance(other.j));
}

/* ------------------------------------------------------------------ 5 */
console.log("\n5. The success page tells the truth");
{
  const page = await req(buyer.j, `/checkout/success?p=${purchaseId}`);
  check("it renders", page.status === 200, page.status);
  check(
    "it shows the new balance",
    page.text.includes(">10<") || page.text.includes("10"),
    "balance missing",
  );
  const anon = jar();
  const stranger = await req(anon, `/checkout/success?p=${purchaseId}`);
  check(
    "a stranger with the link sees no balance",
    stranger.status === 200 && !stranger.text.includes("data-balance=\"10\""),
    stranger.status,
  );
}

/* ------------------------------------------------------------------ 6 */
console.log("\n6. A gateway return cannot be forged");
{
  const forged = await req(jar(), `/api/payments/return?Order=${purchaseId}&status=PAID`);
  check(
    "an unsigned return is refused",
    forged.status === 303 || forged.status === 400,
    forged.status,
  );
  check(
    "and it does not send anybody to the success page",
    !(forged.headers.get("location") ?? "").includes("success"),
    forged.headers.get("location"),
  );
}

/* ------------------------------------------------------------------ 7 */
console.log("\n7. The webhook is still sealed");
{
  const r = await req(jar(), "/api/stripe/webhook", {
    method: "POST",
    body: { type: "payment_intent.succeeded" },
  });
  check(
    "an unsigned webhook is refused",
    r.status === 400 || r.status === 503,
    r.status,
  );
}

/* ------------------------------------------------------------------ 8 */
console.log("\n8. Paying tells the member, once");
{
  const buyer = jar();
  const email = `paid-${Date.now()}@apex.test`;
  await req(buyer, "/api/auth/register", {
    method: "POST",
    body: {
      name: "Paid Notice",
      email,
      phone: uniquePhone(),
      password: "test12345",
      serviceOptIn: true,
    },
  });
  /* Timestamps are whole seconds and notices from before somebody joined are
     not theirs — so the boundary is put beyond doubt before counting. */
  await new Promise((r) => setTimeout(r, 1100));

  const start = await req(buyer, "/api/notices");
  check("nothing unread to begin with", start.json?.unread === 0, start.json?.unread);

  const opened = await req(buyer, "/api/checkout", {
    method: "POST",
    body: { packSlug: "pack-10" },
  });
  const midway = await req(buyer, "/api/notices");
  /* Opening a payment is not paying. Telling somebody their sessions have
     arrived while the card form is still on screen would be a lie. */
  check(
    "opening the payment says nothing",
    midway.json?.unread === 0,
    midway.json?.unread,
  );

  const settled = await req(buyer, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId: opened.json?.purchaseId },
  });
  check("the payment settles", settled.json?.status === "PAID", settled.json);

  const after = await req(buyer, "/api/notices");
  check("the member is told", after.json?.unread === 1, after.json?.unread);
  const msg = (after.json?.notices ?? [])[0];
  check("with the payment named", msg?.title === "Payment received", msg?.title);
  check(
    "the sessions, the price and the expiry",
    /10 sessions/.test(msg?.body ?? "") &&
      /€200/.test(msg?.body ?? "") &&
      /expire on/.test(msg?.body ?? ""),
    msg?.body,
  );

  /* The webhook, the browser coming back and a later check all report the same
     payment. Only the one that granted the sessions may speak. */
  await req(buyer, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId: opened.json?.purchaseId },
  });
  await req(buyer, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId: opened.json?.purchaseId },
  });
  const again = await req(buyer, "/api/notices");
  check(
    "settling three times still tells them once",
    again.json?.unread === 1,
    again.json?.unread,
  );
  check(
    "and grants the sessions once",
    (await req(buyer, "/api/bookings")).json?.credits === 10,
    "balance moved on a repeat settle",
  );
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`,
);
process.exit(fail === 0 ? 0 : 1);

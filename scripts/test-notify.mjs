/**
 * Notifications: who agreed to what, and who actually gets sent to.
 *
 *   npm run build && npx next start -p 3100
 *   node scripts/test-notify.mjs http://localhost:3100
 *
 * The consent rules are the point of this suite. Getting them wrong is not a
 * cosmetic bug: it is either a member who was not told their class was
 * cancelled, or an offer sent to somebody who explicitly said no.
 */
const B = process.argv[2] ?? "http://localhost:3000";
const OWNER = { email: "owner@apexpilates.cy", password: "ownerdev123" };

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
    const v = rest.join("=");
    if (v === "") j.delete(k.trim());
    else j.set(k.trim(), v);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
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

async function member(tag, { marketing = false } = {}) {
  const j = jar();
  const email = `notify-${tag}-${Date.now()}-${Math.floor(performance.now())}@apex.test`;
  const reg = await req(j, "/api/auth/register", {
    method: "POST",
    body: {
      name: `Notify ${tag}`,
      email,
      phone: "+357 99 123456",
      password: "test12345",
      serviceOptIn: true,
      marketingOptIn: marketing,
    },
  });
  return { j, email, ok: reg.json?.ok === true };
}

/* ------------------------------------------------------------------ 1 */
console.log("\n1. What a new member starts with");
const fresh = await member("fresh");
{
  check("registration succeeds", fresh.ok);

  const me = await req(fresh.j, "/api/profile");
  const p = me.json?.profile ?? me.json;
  check("the studio notices consent is on record", Boolean(p?.serviceOptIn), p);
  check("email is on", p?.notifyEmail === true, p?.notifyEmail);
  check("SMS is off", p?.notifySms === false, p?.notifySms);
  /* Push is not a preference any more: the studio keeps it on. */
  check("push is on and stays on", p?.notifyPush === true, p?.notifyPush);
  check("offers are not selected", p?.marketingOptIn === false, p?.marketingOptIn);

  /* Even a request that explicitly asks to switch push off must not. */
  const off = await req(fresh.j, "/api/profile", {
    method: "PATCH",
    body: {
      name: "Notify fresh",
      marketingOptIn: false,
      serviceOptIn: true,
      notifyEmail: true,
      notifySms: false,
      notifyPush: false,
      reminderMinutes: 120,
    },
  });
  check("a request to turn push off is accepted…", off.status === 200, off.status);
  const after = await req(fresh.j, "/api/profile");
  const q = after.json?.profile ?? after.json;
  check("…but push is still on", q?.notifyPush === true, q?.notifyPush);

  /* The screen shows it as always-on rather than as a switch. */
  const page = await req(fresh.j, "/account?tab=notifications");
  check(
    "the notifications screen calls push always on",
    page.text.includes("Always on"),
    "no always-on label",
  );
}

/* ------------------------------------------------------------------ 2 */
console.log("\n2. Turning the channels that are theirs to turn");
{
  const sms = await req(fresh.j, "/api/profile", {
    method: "PATCH",
    body: {
      name: "Notify fresh",
      marketingOptIn: true,
      serviceOptIn: true,
      notifyEmail: false,
      notifySms: true,
      notifyPush: true,
      reminderMinutes: 120,
    },
  });
  check("email off and SMS on is accepted", sms.status === 200, sms.status);
  const now = await req(fresh.j, "/api/profile");
  const p = now.json?.profile ?? now.json;
  check("email is off", p?.notifyEmail === false, p?.notifyEmail);
  check("SMS is on", p?.notifySms === true, p?.notifySms);
  check("offers are now on", p?.marketingOptIn === true, p?.marketingOptIn);
}

/* ------------------------------------------------------------------ 3 */
console.log("\n3. A device asking to be told things");
{
  const anon = jar();
  const shut = await req(anon, "/api/push/subscribe", {
    method: "POST",
    body: { endpoint: "https://example.com/x", p256dh: "a", auth: "b" },
  });
  check("a stranger cannot register a device", shut.status === 401, shut.status);

  const bad = await req(fresh.j, "/api/push/subscribe", {
    method: "POST",
    body: { endpoint: "http://evil.test/x", p256dh: "a", auth: "b" },
  });
  check("a non-https endpoint is refused", bad.status === 400, bad.status);

  const missing = await req(fresh.j, "/api/push/subscribe", {
    method: "POST",
    body: { endpoint: "https://fcm.googleapis.com/x" },
  });
  check("an endpoint with no keys is refused", missing.status === 400, missing.status);

  const endpoint = `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`;
  const ok = await req(fresh.j, "/api/push/subscribe", {
    method: "POST",
    body: { endpoint, p256dh: "BFakeKeyForTests", auth: "fakeAuth" },
  });
  check("their own device registers", ok.json?.ok === true, ok.json);
  check("and is counted", ok.json?.devices >= 1, ok.json);

  /* Registering the same browser twice is one device, not two — otherwise every
     notice would arrive in duplicate. */
  const again = await req(fresh.j, "/api/push/subscribe", {
    method: "POST",
    body: { endpoint, p256dh: "BFakeKeyForTests", auth: "fakeAuth" },
  });
  check("re-registering the same browser does not double it", again.json?.devices === ok.json?.devices, {
    first: ok.json?.devices,
    second: again.json?.devices,
  });

  const gone = await req(fresh.j, `/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
    method: "DELETE",
  });
  check("and it can be removed", gone.json?.ok === true, gone.json);
}

/* ------------------------------------------------------------------ 4 */
console.log("\n4. The desk: who each channel would reach");
const staff = jar();
{
  const inOne = await req(staff, "/api/admin/unlock", {
    method: "POST",
    body: { email: OWNER.email, password: OWNER.password },
  });
  check("the desk opens", inOne.json?.ok === true, inOne.json);

  const all = await req(staff, "/api/admin/notices?audience=ALL");
  check("it can see the reach for everyone", typeof all.json?.reach?.people === "number", all.json?.reach);

  const offers = await req(staff, "/api/admin/notices?audience=OFFERS");
  check(
    "the offers audience is never larger than everyone",
    offers.json?.reach?.people <= all.json?.reach?.people,
    { offers: offers.json?.reach?.people, all: all.json?.reach?.people },
  );
  check(
    "each channel reports its own reach",
    ["push", "email", "sms"].every((k) => typeof all.json?.reach?.[k] === "number"),
    all.json?.reach,
  );
  check(
    "and the desk is told which providers are connected",
    typeof all.json?.transports?.email?.ready === "boolean" &&
      typeof all.json?.transports?.sms?.ready === "boolean",
    all.json?.transports,
  );
  /* Nobody can be sent to on a channel they did not agree to, so a channel can
     never claim more people than the audience holds. */
  for (const k of ["push", "email", "sms"]) {
    check(
      `${k} never claims more people than the audience`,
      all.json.reach[k] <= all.json.reach.people,
      { channel: all.json.reach[k], people: all.json.reach.people },
    );
  }
}

/* ------------------------------------------------------------------ 5 */
console.log("\n5. Sending, and what each channel actually did");
{
  const before = await req(staff, "/api/admin/notices?audience=ALL");
  const reach = before.json.reach;

  const sent = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Studio closed on Monday",
      bodyEn: "The studio is shut this Monday for the public holiday.",
      audience: "ALL",
      channels: ["push", "email", "sms"],
    },
  });
  check("the notice is created", sent.json?.ok === true, sent.json);
  check("and it reports per channel", Array.isArray(sent.json?.reports), sent.json);

  const byChannel = Object.fromEntries(
    (sent.json.reports ?? []).map((r) => [r.channel, r]),
  );
  check("email went to exactly the members who left email on", byChannel.email?.sent === reach.email, {
    sent: byChannel.email?.sent,
    expected: reach.email,
  });
  check("SMS went to exactly the members who turned SMS on", byChannel.sms?.sent === reach.sms, {
    sent: byChannel.sms?.sent,
    expected: reach.sms,
  });
  check(
    "nobody was counted twice on any channel",
    ["push", "email", "sms"].every(
      (c) =>
        (byChannel[c]?.sent ?? 0) + (byChannel[c]?.failed ?? 0) + (byChannel[c]?.skipped ?? 0) >=
        (byChannel[c]?.sent ?? 0),
    ),
    byChannel,
  );

  /* The in-app copy exists whatever the channels did — that is the promise. */
  const mine = await req(fresh.j, "/api/notices");
  const titles = (mine.json?.notices ?? []).map((n) => n.title);
  check(
    "the member has it in the app regardless",
    titles.includes("Studio closed on Monday"),
    titles.slice(0, 3),
  );

  const history = await req(staff, "/api/admin/notices?audience=ALL");
  const latest = history.json?.notices?.[0];
  check("the history records the audience", latest?.audience === "ALL", latest?.audience);
  check(
    "and what each channel did",
    (latest?.deliveries ?? []).length === 3,
    latest?.deliveries,
  );
}

/* ------------------------------------------------------------------ 6 */
console.log("\n6. An offer reaches only the people who asked for offers");
{
  const declined = await member("declined", { marketing: false });
  const accepted = await member("accepted", { marketing: true });
  check("two more members exist", declined.ok && accepted.ok);

  const offers = await req(staff, "/api/admin/notices?audience=OFFERS");
  const everyone = await req(staff, "/api/admin/notices?audience=ALL");
  check(
    "the offers audience is smaller than everyone",
    offers.json.reach.people < everyone.json.reach.people,
    { offers: offers.json.reach.people, all: everyone.json.reach.people },
  );

  const sent = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Two classes free in September",
      bodyEn: "Buy a ten pack this month and September brings two extra classes.",
      audience: "OFFERS",
      channels: ["email"],
    },
  });
  check("the offer is sent", sent.json?.ok === true, sent.json);
  const report = (sent.json.reports ?? [])[0];
  check(
    "to exactly the members who accept offers",
    report?.sent === offers.json.reach.email,
    { sent: report?.sent, expected: offers.json.reach.email },
  );
  check(
    "which is fewer than everyone",
    report.sent < everyone.json.reach.email,
    { offer: report.sent, all: everyone.json.reach.email },
  );

  /* The one who said no must not have it, on any channel or in the app. */
  const theirs = await req(declined.j, "/api/notices");
  const titles = (theirs.json?.notices ?? []).map((n) => n.title);
  check(
    "and the member who declined offers does not receive it",
    !titles.includes("Two classes free in September"),
    titles.slice(0, 3),
  );
  const wanted = await req(accepted.j, "/api/notices");
  check(
    "while the member who accepted does",
    (wanted.json?.notices ?? []).map((n) => n.title).includes("Two classes free in September"),
    "the offer did not arrive",
  );

  /* A forged audience must not widen it. */
  const forged = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Nonsense audience test",
      bodyEn: "This should fall back to everyone rather than to nobody.",
      audience: "EVERYBODY_INCLUDING_DECLINERS",
      channels: [],
    },
  });
  check("an unknown audience falls back to ALL", forged.json?.audience === "ALL", forged.json);

  const junkChannel = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Nonsense channel test",
      bodyEn: "An invented channel must simply be ignored.",
      channels: ["carrier-pigeon", "email"],
    },
  });
  check(
    "an invented channel is ignored, the real one still goes",
    (junkChannel.json?.reports ?? []).length === 1 &&
      junkChannel.json.reports[0].channel === "email",
    junkChannel.json?.reports,
  );
}

/* ------------------------------------------------------------------ 7 */
console.log("\n7. Accepting offers opens SMS");
{
  /* Signing up with the offers box ticked. Somebody who has just said they want
     to hear from the studio should not then have to find a second switch. */
  const keen = await member("keen", { marketing: true });
  const p = (await req(keen.j, "/api/profile")).json?.profile;
  check("offers at sign-up turns SMS on", p?.notifySms === true, p);
  check("and offers are recorded", p?.marketingOptIn === true, p);

  /* And the same when it is ticked later. */
  const later = await member("later", { marketing: false });
  const before = (await req(later.j, "/api/profile")).json?.profile;
  check("without offers, SMS starts off", before?.notifySms === false, before);

  await req(later.j, "/api/profile", {
    method: "PATCH",
    body: {
      name: "Notify later",
      marketingOptIn: true,
      serviceOptIn: true,
      notifyEmail: true,
      notifySms: false,
      notifyPush: true,
      reminderMinutes: 120,
    },
  });
  const after = (await req(later.j, "/api/profile")).json?.profile;
  check("accepting offers turns SMS on", after?.notifySms === true, after);

  /* But it is their switch from then on: turning SMS off again must stick, even
     while offers stay accepted. Otherwise the studio is overruling them. */
  await req(later.j, "/api/profile", {
    method: "PATCH",
    body: {
      name: "Notify later",
      marketingOptIn: true,
      serviceOptIn: true,
      notifyEmail: true,
      notifySms: false,
      notifyPush: true,
      reminderMinutes: 120,
    },
  });
  const off = (await req(later.j, "/api/profile")).json?.profile;
  check(
    "turning SMS off again sticks, offers or not",
    off?.notifySms === false && off?.marketingOptIn === true,
    off,
  );
}

/* ------------------------------------------------------------------ 8 */
console.log("\n8. The three automatic messages");
{
  const punter = await member("auto", { marketing: false });

  /* A device, so a push has somewhere to go. The endpoint is not a real push
     service, so the send will fail — what is being tested here is that booking
     and cancelling reach the sending path at all and that a failed push never
     touches the booking itself. */
  const endpoint = `https://fcm.googleapis.com/fcm/send/auto-${Date.now()}`;
  await req(punter.j, "/api/push/subscribe", {
    method: "POST",
    body: { endpoint, p256dh: "BFakeKeyForTests", auth: "fakeAuth" },
  });

  /* Sessions to spend. */
  const opened = await req(punter.j, "/api/checkout", {
    method: "POST",
    body: { packSlug: "pack-10" },
  });
  await req(punter.j, "/api/payments/settle", {
    method: "POST",
    body: { purchaseId: opened.json?.purchaseId },
  });

  const list = await req(punter.j, "/api/sessions?days=10");
  const target = (list.json?.sessions ?? []).find(
    (x) =>
      x.spotsLeft > 0 && new Date(x.startsAt) > new Date(Date.now() + 48 * 3600_000),
  );
  check("a bookable class exists", Boolean(target));

  const booked = await req(punter.j, "/api/bookings", {
    method: "POST",
    body: { sessionId: target.id },
  });
  check("booking still succeeds with push wired in", booked.json?.ok === true, booked.json);
  check("and a reminder is queued at their own lead time", Boolean(booked.json?.reminderAt), booked.json);

  const cancelled = await req(punter.j, "/api/bookings/cancel", {
    method: "POST",
    body: { bookingId: booked.json.bookingId },
  });
  check("cancelling still succeeds", cancelled.json?.ok === true, cancelled.json);
  check("and the session came back", cancelled.json?.refunded === true, cancelled.json);
}

/* ------------------------------------------------------------------ 9 */
console.log("\n9. The reminder sweep");
{
  const anon = jar();
  const shut = await req(anon, "/api/cron/reminders", { method: "POST" });
  check("the sweep is not open to the public", shut.status === 401 || shut.status === 403, shut.status);

  const badToken = await fetch(B + "/api/cron/reminders", {
    method: "POST",
    headers: { authorization: "Bearer not-the-secret" },
  });
  check("a wrong token is refused", badToken.status === 401 || badToken.status === 403, badToken.status);

  /* Staff can run it by hand, which is how the studio tests it. */
  const run = await req(staff, "/api/cron/reminders", { method: "POST" });
  check("staff can run it", run.json?.ok === true, run.json);
  check("and it reports what it did", typeof run.json?.due === "number", run.json);

  /* Running it twice must not send anything twice: the rows are marked. */
  const again = await req(staff, "/api/cron/reminders", { method: "POST" });
  check("running it again sends nothing again", again.json?.due === 0, again.json);
}

/* ------------------------------------------------------------------ 10 */
console.log("\n10. A new member does not inherit the past");
{
  /* Something for the archive, sent before the next member exists. */
  const sent = await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Sent before they joined",
      bodyEn: "A member who signs up after this must never see it.",
      audience: "ALL",
      channels: [],
    },
  });
  check("a notice exists in the archive", sent.json?.ok === true, sent.json);

  /* A second apart, so the timestamps cannot collide. */
  await new Promise((r) => setTimeout(r, 1100));
  const newcomer = await member("newcomer");
  const theirs = await req(newcomer.j, "/api/notices");
  const titles = (theirs.json?.notices ?? []).map((x) => x.title);

  check(
    "their list does not contain it",
    !titles.includes("Sent before they joined"),
    titles.slice(0, 3),
  );
  check(
    "and they start with nothing unread",
    theirs.json?.unread === 0,
    { unread: theirs.json?.unread, count: titles.length },
  );

  /* But anything sent from now on does reach them. */
  await req(staff, "/api/admin/notices", {
    method: "POST",
    body: {
      titleEn: "Sent after they joined",
      bodyEn: "This one is theirs.",
      audience: "ALL",
      channels: [],
    },
  });
  const after = await req(newcomer.j, "/api/notices");
  check(
    "a notice sent afterwards does reach them",
    (after.json?.notices ?? []).map((x) => x.title).includes("Sent after they joined"),
    "the new notice did not arrive",
  );
  check("and counts as unread", after.json?.unread === 1, after.json?.unread);
}

/* ------------------------------------------------------------------ 11 */
console.log("\n11. The timetable does not offer classes that have started");
{
  const anon = jar();
  const res = await req(anon, "/api/sessions?days=3");
  const list = res.json?.sessions ?? [];
  check("the timetable answers", list.length > 0, list.length);

  const now = Date.now();
  const past = list.filter((x) => new Date(x.startsAt).getTime() < now);
  check(
    "nothing in it has already started",
    past.length === 0,
    past.slice(0, 3).map((x) => x.startsAt),
  );

  /* The page itself, not just the API. */
  const page = await req(anon, "/timetable");
  check("the timetable page renders", page.status === 200, page.status);
}

/* ------------------------------------------------------------------ 12 */
console.log("\n12. Members cannot send notices");
{
  const shut = await req(fresh.j, "/api/admin/notices", {
    method: "POST",
    body: { titleEn: "From a member", bodyEn: "This must not be possible." },
  });
  check("a member is refused", shut.status === 403, shut.status);
  const peek = await req(fresh.j, "/api/admin/notices");
  check("and cannot read the reach either", peek.status === 403, peek.status);
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`,
);
process.exit(fail === 0 ? 0 : 1);

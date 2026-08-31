/**
 * The studio's Instagram and Facebook cards, built from the app's own data.
 *
 *   npm run social
 *
 * Ten images into `docs/social/`, at 1080 x 1350: the size Instagram gives the
 * most room to in a feed, and one Facebook is happy with as well.
 *
 * ---
 *
 * **Why a script and not a design file.**
 *
 * Because the prices on the poster and the prices at the checkout have to be the
 * same number, and the only way to guarantee that is to read them from the same
 * place. `PACKS` is the price list for the website, the desk and now the artwork;
 * the timetable comes out of `class_templates`, which is what actually generates
 * the classes. Change a price, run this, post the new card. Nobody has to
 * remember to edit a second copy, which is the mistake that puts last month's
 * price in front of four thousand people.
 *
 * The same reasoning applies to what is deliberately *not* on these cards. The
 * studio's phone number, email and domain are still placeholders in
 * `lib/studio.ts`, and a placeholder on a public poster is worse than no
 * placeholder. So the footer carries the Instagram handle and the street address,
 * both of which are real. When the studio confirms the rest, add them here.
 *
 * ---
 *
 * **What it needs installed.** Playwright to render, and two font families from
 * npm, because the brand's own faces have no Greek:
 *
 *   npm i -D playwright-core @fontsource/eb-garamond @fontsource/open-sans
 *
 * Cormorant Garamond and Jost, which the website uses, ship no Greek subset at
 * all. EB Garamond is the same Garamond revival with a proper Greek, so the two
 * language versions of a card are identical apart from the words. That is worth
 * more on a bilingual island than an exact match with the website's Latin.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sqlite } from "../src/db";
import { PACKS } from "../src/lib/packs";
import { PROMO } from "../src/lib/promo";
import { STUDIO } from "../src/lib/studio";

const OUT = "docs/social";
const W = 1080;
const H = 1350;

type Lang = "en" | "el";

/* ------------------------------------------------------------------- assets */

function dataUrl(path: string, mime: string) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/** A woff2 from @fontsource, or nothing if the package is not installed. */
function face(pkg: string, file: string) {
  const p = join("node_modules", "@fontsource", pkg, "files", file);
  return existsSync(p) ? dataUrl(p, "font/woff2") : null;
}

function fontCss() {
  const rules: string[] = [];
  const add = (
    family: string,
    pkg: string,
    weight: number,
    subsets: string[],
  ) => {
    for (const subset of subsets) {
      const url = face(pkg, `${pkg}-${subset}-${weight}-normal.woff2`);
      if (!url) continue;
      /* No unicode-range: the browser is given one family per subset file and
         picks whichever has the glyph. Simpler than reproducing Google's ranges,
         and there are only two scripts in play. */
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;` +
          `font-weight:${weight};src:url(${url}) format('woff2')}`,
      );
    }
  };
  for (const w of [400, 500, 600]) {
    add("Garamond", "eb-garamond", w, ["latin", "greek"]);
  }
  for (const w of [300, 400, 600]) {
    add("Grotesk", "open-sans", w, ["latin", "greek"]);
  }
  if (rules.length === 0) {
    console.warn(
      "  ! no @fontsource files found, falling back to system fonts.\n" +
        "    npm i -D @fontsource/eb-garamond @fontsource/open-sans",
    );
  }
  return rules.join("");
}

/* --------------------------------------------------------------------- data */

const money = (cents: number) => `€${Math.round(cents / 100)}`;

/** Per class, to two decimals, which is the number people actually compare. */
type Pack = (typeof PACKS)[number];
const perClass = (p: Pack) =>
  `€${(p.priceCents / p.credits / 100).toFixed(2).replace(/\.00$/, "")}`;

const bySlug = (prefix: string) =>
  PACKS.filter((p) => p.slug.startsWith(prefix)).sort(
    (a, b) => a.credits - b.credits,
  );

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_EL = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
const SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_EL = ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"];

type Slot = { day: number; minutes: number; en: string; el: string };

function timetable(): Slot[] {
  return (
    sqlite
      .prepare(
        `select ct.name_en as en, ct.name_el as el, t.day_of_week as day,
                t.start_minutes as minutes
           from class_templates t
           join class_types ct on ct.id = t.class_type_id
          where t.active = 1
          order by t.day_of_week, t.start_minutes`,
      )
      .all() as Slot[]
  ).map((s) => ({ ...s, el: s.el || s.en }));
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The week, said the way a person would say it.
 *
 * Monday to Friday are the same eleven classes except for one slot, so printing
 * five identical columns would waste the whole card and make the one difference
 * invisible. This finds the shared weekday pattern and reports the exceptions
 * separately, rather than assuming a pattern that a change to the rota would
 * silently break.
 */
function weekdayPattern(slots: Slot[], lang: Lang) {
  const weekdays = [1, 2, 3, 4, 5];
  const times = [
    ...new Set(slots.filter((s) => weekdays.includes(s.day)).map((s) => s.minutes)),
  ].sort((a, b) => a - b);

  const rows: { time: string; name: string; note: string | null }[] = [];
  for (const minutes of times) {
    /* Only the days that actually have a class at this time get a vote. A day
       with nothing here used to contribute a dash, which would have printed a
       stray em dash onto a public poster the first time the rota lost a slot. */
    const counts = new Map<string, number[]>();
    for (const d of weekdays) {
      const slot = slots.find((s) => s.day === d && s.minutes === minutes);
      if (!slot) continue;
      const name = slot[lang];
      const list = counts.get(name) ?? [];
      list.push(d);
      counts.set(name, list);
    }
    if (counts.size === 0) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
    const [main, mainDays] = ranked[0];
    const short = lang === "el" ? SHORT_EL : SHORT_EN;
    const note =
      ranked.length > 1
        ? ranked
            .slice(1)
            .map(([n, ds]) => `${ds.map((d) => short[d]).join(" & ")} ${n}`)
            .join(" · ")
        : null;
    void mainDays;
    rows.push({ time: hhmm(minutes), name: main, note });
  }
  return rows;
}

function saturday(slots: Slot[], lang: Lang) {
  return slots
    .filter((s) => s.day === 6)
    .map((s) => ({ time: hhmm(s.minutes), name: s[lang] }));
}

const dayName = (d: number, lang: Lang) =>
  (lang === "el" ? DAYS_EL : DAYS_EN)[d];

function promoDates(lang: Lang) {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat(lang === "el" ? "el-GR" : "en-GB", {
      timeZone: STUDIO.timezone,
      day: "numeric",
      month: "long",
    }).format(d);
  return { from: fmt(PROMO.spendFrom), to: fmt(PROMO.spendUntil) };
}

/* ---------------------------------------------------------------- the words */

const T = {
  en: {
    eyebrow: "Reformer Pilates · Larnaca",
    monthly: "Monthly",
    monthlySub: "Sessions valid for 30 days",
    quarter: "Three months",
    quarterSub: "Sessions valid for 90 days",
    week: "a week",
    sessions: "sessions",
    session: "session",
    perClass: "per class",
    popular: "Most popular",
    bestValue: "Best value",
    single: "Just trying it?",
    singleLine: (p: string) => `A single class is ${p}.`,
    timetable: "The week",
    timetableSub: "Every class 60 minutes · five reformers · book online",
    monFri: "Monday to Friday",
    sat: "Saturday",
    sun: "Sunday: closed",
    infoTitle: "Five reformers.\nOne hour.\nRoom to be seen.",
    infoLead:
      "Reformer Pilates on Technogym machines, in a room that takes five people. Your instructor sets your springs, watches how you move, and changes it as you go.",
    factsHead: "What to expect",
    facts: [
      ["Five places", "Never a class you disappear into"],
      ["60 minutes", "Every class, six days a week"],
      ["All levels", "Foundations for a first time, Athletic when you are ready"],
      ["Bring", "A towel, water, and gripped socks"],
    ],
    classesHead: "The classes",
    promoKicker: "Opening week",
    promoTitle: "Your first\nsession is\non us.",
    promoBody: (from: string, to: string) =>
      `One free session for every new member, for any class from ${from} to ${to}. Make an account and it is already in your balance.`,
    promoFoot: (to: string) => `Opening week only. Expires ${to}.`,
    bookLine: "Book online, any class, up to a minute before it starts.",
  },
  el: {
    eyebrow: "Reformer Pilates · Λάρνακα",
    monthly: "Μηνιαία",
    monthlySub: "Οι συνεδρίες ισχύουν 30 ημέρες",
    quarter: "Τρεις μήνες",
    quarterSub: "Οι συνεδρίες ισχύουν 90 ημέρες",
    week: "την εβδομάδα",
    sessions: "συνεδρίες",
    session: "συνεδρία",
    perClass: "το μάθημα",
    popular: "Πιο δημοφιλές",
    bestValue: "Καλύτερη τιμή",
    single: "Θέλεις να το δοκιμάσεις;",
    singleLine: (p: string) => `Ένα μεμονωμένο μάθημα είναι ${p}.`,
    timetable: "Η εβδομάδα",
    timetableSub: "Κάθε μάθημα 60 λεπτά · πέντε reformer · κρατήσεις online",
    monFri: "Δευτέρα έως Παρασκευή",
    sat: "Σάββατο",
    sun: "Κυριακή: κλειστά",
    infoTitle: "Πέντε reformer.\nΜία ώρα.\nΧώρος για σένα.",
    infoLead:
      "Reformer Pilates σε μηχανήματα Technogym, σε αίθουσα που παίρνει πέντε άτομα. Ο εκπαιδευτής ρυθμίζει τα ελατήριά σου, βλέπει πώς κινείσαι και το αλλάζει στην πορεία.",
    factsHead: "Τι να περιμένεις",
    facts: [
      ["Πέντε θέσεις", "Ποτέ μάθημα μέσα στο οποίο χάνεσαι"],
      ["60 λεπτά", "Κάθε μάθημα, έξι ημέρες την εβδομάδα"],
      ["Όλα τα επίπεδα", "Foundations για την πρώτη φορά, Athletic όταν είσαι έτοιμος"],
      ["Φέρε", "Πετσέτα, νερό και αντιολισθητικές κάλτσες"],
    ],
    classesHead: "Τα μαθήματα",
    promoKicker: "Εβδομάδα εγκαινίων",
    promoTitle: "Η πρώτη σου\nσυνεδρία\nκερασμένη.",
    promoBody: (from: string, to: string) =>
      `Μία δωρεάν συνεδρία για κάθε νέο μέλος, για οποιοδήποτε μάθημα από ${from} έως ${to}. Άνοιξε λογαριασμό και βρίσκεται ήδη στο υπόλοιπό σου.`,
    promoFoot: (to: string) => `Μόνο για την εβδομάδα εγκαινίων. Λήγει ${to}.`,
    bookLine: "Κρατήσεις online, για κάθε μάθημα, μέχρι ένα λεπτό πριν αρχίσει.",
  },
} as const;

/* ----------------------------------------------------------------- the look */

const wordmarkBrown = dataUrl("public/brand/wordmark-brown.png", "image/png");
const wordmarkCream = dataUrl("public/brand/wordmark-cream.png", "image/png");
/* The reformer itself rather than a class in progress.
   The class photograph crops, at this band height, to a tight shot of two
   people's thighs, which is not what a studio wants at the top of its brand
   card. The product shot is the machine, on the studio's own near-white ground,
   and it fades into the card's cream without a seam. */
const photoStudio = dataUrl("public/media/reformer.jpg", "image/jpeg");

function shell(
  body: string,
  opts: { dark?: boolean; lang?: Lang } = {},
) {
  /* `lang` is not decoration. Chromium uppercases Greek correctly only when it
     knows the text is Greek: with it, `text-transform: uppercase` drops the tonos
     as Greek typography requires, and without it a card reads "ΛΆΡΝΑΚΑ", which is
     wrong in the way a Greek reader notices before they read anything else. */
  return `<!doctype html><html lang="${opts.lang ?? "en"}"><head><meta charset="utf-8"><style>
${fontCss()}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden;
  font-family:'Grotesk','DejaVu Sans',sans-serif;
  background:${opts.dark ? "#3A2D2C" : "#FAF6F3"};
  color:${opts.dark ? "#F3ECE6" : "#4B3A39"};
  -webkit-font-smoothing:antialiased}
.card{width:${W}px;height:${H}px;position:relative;display:flex;flex-direction:column}
.pad{padding:0 92px}
.wordmark{width:212px;display:block;margin:0 auto}
.eyebrow{font-size:17px;letter-spacing:.30em;text-transform:uppercase;
  color:${opts.dark ? "#C2B9AA" : "#A08D85"};font-weight:600;text-align:center}
.rule{width:64px;height:2px;background:#C9A227;margin:0 auto}
h1{font-family:'Garamond','DejaVu Serif',serif;font-weight:400;
  font-size:96px;line-height:1.02;letter-spacing:-.01em;
  color:${opts.dark ? "#FAF6F3" : "#3A2D2C"}}
h2{font-family:'Garamond','DejaVu Serif',serif;font-weight:400;font-size:44px;
  line-height:1.1;color:${opts.dark ? "#FAF6F3" : "#3A2D2C"}}
.sub{font-size:23px;line-height:1.5;font-weight:300;
  color:${opts.dark ? "#C2B9AA" : "#7C6360"}}
.lead{font-size:26px;line-height:1.55;font-weight:300;color:#5B4645}
.foot{display:flex;justify-content:space-between;align-items:flex-end;
  font-size:19px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;
  color:${opts.dark ? "#C2B9AA" : "#A08D85"}}
.foot .right{text-align:right;font-weight:300;letter-spacing:.05em;
  text-transform:none;font-size:18px;line-height:1.45}
/* ------------------------------------------------------------ a price row */
.rows{display:flex;flex-direction:column;gap:0}
.row{display:flex;align-items:center;gap:22px;padding:34px 30px;
  border-bottom:1px solid #E9DED6}
.row:first-child{border-top:1px solid #E9DED6}
.row .n{font-family:'Garamond',serif;font-size:40px;width:74px;flex:none;
  color:#3A2D2C;line-height:1}
.row .what{flex:1;min-width:0}
.row .what b{display:block;font-size:26px;font-weight:400;color:#3A2D2C;
  letter-spacing:.005em}
.row .what span{display:block;font-size:18px;font-weight:300;color:#A08D85;
  margin-top:3px}
.row .price{font-family:'Garamond',serif;font-size:52px;line-height:1;
  color:#3A2D2C;text-align:right;flex:none;min-width:118px}
.row .per{font-size:17px;font-weight:300;color:#A08D85;text-align:right;
  flex:none;width:112px;line-height:1.3}
.row.mark{background:#F3ECE6;border-radius:16px;border-bottom-color:transparent;
  padding-left:30px}
.tag{position:absolute;right:30px;top:-14px;background:#C9A227;color:#3A2D2C;
  font-size:14px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;
  padding:6px 14px;border-radius:20px}
.rowwrap{position:relative}
/* -------------------------------------------------------------- timetable */
.tt{display:flex;gap:56px}
.tt .col{flex:1}
.tt h3{font-size:19px;letter-spacing:.22em;text-transform:uppercase;
  font-weight:600;color:#A08D85;margin-bottom:18px}
.slot{display:flex;gap:18px;align-items:baseline;padding:12px 0;
  border-bottom:1px solid #EDE6E3}
.slot .t{font-family:'Garamond',serif;font-size:30px;color:#3A2D2C;
  width:88px;flex:none;line-height:1}
.slot .c{font-size:21px;font-weight:300;color:#5B4645;line-height:1.25}
.slot .c i{display:block;font-style:normal;font-size:16px;color:#A08D85;
  margin-top:2px}
/* ------------------------------------------------------------------ facts */
.facts{display:flex;flex-direction:column;gap:0}
.fact{display:flex;gap:26px;padding:22px 0;border-bottom:1px solid #E9DED6}
.fact b{font-size:22px;font-weight:600;color:#3A2D2C;width:220px;flex:none;
  letter-spacing:.01em}
.fact span{font-size:21px;font-weight:300;color:#5B4645;line-height:1.35;flex:1}
.chips{display:flex;flex-wrap:wrap;gap:12px}
.chip{border:1px solid #DACECA;border-radius:26px;padding:11px 22px;
  font-size:19px;font-weight:300;color:#5B4645}
</style></head><body>${body}</body></html>`;
}

/* ---------------------------------------------------------------- the cards */

function header(lang: Lang, dark = false) {
  return `<div class="pad" style="padding-top:74px">
    <img class="wordmark" src="${dark ? wordmarkCream : wordmarkBrown}">
    <p class="eyebrow" style="margin-top:26px">${T[lang].eyebrow}</p>
  </div>`;
}

/**
 * The street, in the reader's own language.
 *
 * `STUDIO.addressLines` is English only, which is right for a schema.org address
 * and wrong on a Greek poster: a Larnaca reader should not have to read their own
 * street transliterated. Kept here rather than pushed into `lib/studio.ts`
 * because the website's address block has the same gap and fixing it there is a
 * change to the site, not to the artwork.
 */
const ADDRESS = {
  en: [STUDIO.addressLines[1], STUDIO.addressLines[2]],
  el: ["Γρηγόρη Αυξεντίου 9", "Λιβάδια, Λάρνακα 7060"],
};

function footer(lang: Lang) {
  const [street, town] = ADDRESS[lang];
  return `<div class="pad" style="padding-bottom:70px">
    <div class="rule" style="margin-bottom:34px"></div>
    <div class="foot">
      <span>${STUDIO.instagramHandle}</span>
      <span class="right">${street}<br>${town}</span>
    </div>
  </div>`;
}

function priceCard(lang: Lang, group: "month" | "quarter") {
  const t = T[lang];
  const packs = bySlug(group === "month" ? "month-" : "quarter-");
  const single = PACKS.find((p) => p.slug === "single")!;

  const rows = packs
    .map((p) => {
      const perWeek = p.credits / (group === "month" ? 4 : 12);
      const badge =
        p.badge === "POPULAR"
          ? t.popular
          : p.badge === "BEST_VALUE"
            ? t.bestValue
            : null;
      return `<div class="rowwrap">
        ${badge ? `<span class="tag">${badge}</span>` : ""}
        <div class="row${badge ? " mark" : ""}">
          <span class="n">${perWeek}×</span>
          <span class="what">
            <b>${perWeek} ${perWeek === 1 ? (lang === "el" ? "μάθημα" : "class") : lang === "el" ? "μαθήματα" : "classes"} ${t.week}</b>
            <span>${p.credits} ${p.credits === 1 ? t.session : t.sessions}</span>
          </span>
          <span class="price">${money(p.priceCents)}</span>
          <span class="per">${perClass(p)}<br>${t.perClass}</span>
        </div>
      </div>`;
    })
    .join("");

  return shell(`<div class="card">
    ${header(lang)}
    <div class="pad" style="margin-top:60px">
      <h1>${group === "month" ? t.monthly : t.quarter}</h1>
      <p class="sub" style="margin-top:14px">${group === "month" ? t.monthlySub : t.quarterSub}</p>
    </div>
    <div class="pad rows" style="margin-top:52px">${rows}</div>
    <div class="pad" style="margin-top:52px">
      <p class="sub" style="font-size:22px">
        <b style="font-weight:600;color:#5B4645">${t.single}</b>
        ${t.singleLine(money(single.priceCents))}
      </p>
      <p class="sub" style="margin-top:14px;font-size:22px">${t.bookLine}</p>
    </div>
    <div style="margin-top:auto"></div>
    ${footer(lang)}
  </div>`, { lang });
}

function timetableCard(lang: Lang) {
  const t = T[lang];
  const slots = timetable();
  const week = weekdayPattern(slots, lang);
  const sat = saturday(slots, lang);

  const slotHtml = (s: { time: string; name: string; note?: string | null }) =>
    `<div class="slot"><span class="t">${s.time}</span>
      <span class="c">${s.name}${s.note ? `<i>${s.note}</i>` : ""}</span></div>`;

  return shell(`<div class="card">
    ${header(lang)}
    <div class="pad" style="margin-top:40px">
      <h1 style="font-size:84px">${t.timetable}</h1>
      <p class="sub" style="margin-top:12px">${t.timetableSub}</p>
    </div>
    <div class="pad tt" style="margin-top:40px">
      <div class="col">
        <h3>${t.monFri}</h3>
        ${week.map(slotHtml).join("")}
      </div>
      <div class="col">
        <h3>${t.sat}</h3>
        ${sat.map(slotHtml).join("")}
        <p class="sub" style="margin-top:26px;font-size:20px">${t.sun}</p>
      </div>
    </div>
    <div class="pad" style="margin-top:auto;padding-bottom:14px">
      <p class="sub" style="font-size:21px">${t.bookLine}</p>
    </div>
    ${footer(lang)}
  </div>`, { lang });
}

function infoCard(lang: Lang) {
  const t = T[lang];
  const types = sqlite
    .prepare(
      `select name_en as en, name_el as el from class_types
        where active = 1 order by sort_order`,
    )
    .all() as { en: string; el: string }[];

  /* The one card with a photograph, so the one card whose height has to be
     watched: the frame is a fixed 1350 with overflow hidden, and anything that
     runs past it is simply gone, footer included. Everything below is sized to
     leave the handle and the address on the page. */
  return shell(`<div class="card">
    <div style="height:430px;overflow:hidden;position:relative;flex:none;
      background:#FBFAF9">
      <img src="${photoStudio}" style="width:112%;position:absolute;
        top:-372px;left:-6%">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,
        rgba(250,246,243,.42) 0%,rgba(250,246,243,0) 26%,
        rgba(250,246,243,0) 58%,#FAF6F3 100%)"></div>
      <img class="wordmark" src="${wordmarkBrown}"
        style="position:absolute;left:0;right:0;top:54px;width:206px">
    </div>
    <div class="pad" style="margin-top:-6px">
      <h2 style="font-size:52px;white-space:pre-line">${t.infoTitle}</h2>
      <p class="lead" style="margin-top:18px;font-size:24px">${t.infoLead}</p>
    </div>
    <div class="pad" style="margin-top:26px">
      <h3 style="font-size:18px;letter-spacing:.22em;text-transform:uppercase;
        font-weight:600;color:#A08D85;margin-bottom:4px">${t.factsHead}</h3>
      <div class="facts">
        ${t.facts.map(([k, v]) => `<div class="fact" style="padding:16px 0"><b style="font-size:21px;width:206px">${k}</b><span style="font-size:20px">${v}</span></div>`).join("")}
      </div>
    </div>
    <div class="pad" style="margin-top:24px">
      <h3 style="font-size:18px;letter-spacing:.22em;text-transform:uppercase;
        font-weight:600;color:#A08D85;margin-bottom:14px">${t.classesHead}</h3>
      <div class="chips">
        ${types.map((c) => `<span class="chip" style="font-size:18px;padding:9px 19px">${lang === "el" ? c.el || c.en : c.en}</span>`).join("")}
      </div>
    </div>
    <div style="margin-top:auto"></div>
    ${footer(lang)}
  </div>`, { lang });
}

function promoCard(lang: Lang) {
  const t = T[lang];
  const { from, to } = promoDates(lang);
  return shell(
    `<div class="card">
      ${header(lang, true)}
      <div class="pad" style="margin-top:auto;margin-bottom:auto">
        <p class="eyebrow" style="text-align:left;color:#C9A227">${t.promoKicker}</p>
        <h1 style="margin-top:26px;white-space:pre-line;font-size:104px">${t.promoTitle}</h1>
        <div class="rule" style="margin:40px 0 0 0"></div>
        <p class="sub" style="margin-top:34px;font-size:26px;max-width:760px">
          ${t.promoBody(from, to)}
        </p>
        <p class="sub" style="margin-top:22px;font-size:20px;color:#9C8681">
          ${t.promoFoot(to)}
        </p>
      </div>
      ${footer(lang)}
    </div>`,
    { dark: true, lang },
  );
}

/* ---------------------------------------------------------------------- run */

/**
 * The set, and the one that is not in it by default.
 *
 * The price cards carry the **list price and nothing else**: no offer, no
 * discount, no struck-through number, even when the desk has a pricing rule
 * running. That is deliberate rather than an oversight. A post lives on a feed
 * for years, and an offer price on it outlives the offer by exactly that long,
 * which leaves the studio arguing with somebody holding a screenshot. Offers
 * belong on the website, where they can be switched off.
 *
 * The opening-week card is written and ready and stays out of the default run for
 * the same reason. Ask for it when the studio actually wants to post it:
 *
 *   npm run social -- --with-offer
 */
const CARDS: { name: string; html: (l: Lang) => string }[] = [
  { name: "pricing-monthly", html: (l) => priceCard(l, "month") },
  { name: "pricing-3-months", html: (l) => priceCard(l, "quarter") },
  { name: "timetable", html: timetableCard },
  { name: "studio", html: infoCard },
  ...(process.argv.includes("--with-offer")
    ? [{ name: "opening-week", html: promoCard }]
    : []),
];

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core").then((m) => m.default ?? m));
  } catch {
    console.error(
      "\n  This needs Playwright:  npm i -D playwright-core\n",
    );
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  for (const card of CARDS) {
    for (const lang of ["en", "el"] as Lang[]) {
      const file = join(OUT, `${card.name}-${lang}.png`);
      const tmp = join(OUT, `.${card.name}-${lang}.html`);
      writeFileSync(tmp, card.html(lang), "utf8");
      await page.goto(`file://${process.cwd()}/${tmp}`, {
        waitUntil: "networkidle",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: file });
      console.log(`  ${file}`);
    }
  }

  await browser.close();
  console.log(`\n  ${CARDS.length * 2} images, ${W}x${H}, in ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

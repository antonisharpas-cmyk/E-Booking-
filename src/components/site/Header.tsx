"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/components/site/LanguageToggle";
import { ButtonLink } from "@/components/ui/Button";
import { WordmarkLink } from "@/components/ui/Wordmark";
import { useI18n } from "@/i18n/LanguageProvider";
import { UserAvatar } from "@/components/account/UserAvatar";
import { ACCOUNT_TABS } from "@/components/account/AccountTabs";
import { cn } from "@/lib/utils";
import { signOutAndGoHome } from "@/lib/sign-out";

export type HeaderUser = {
  name: string;
  role: string;
  credits: number;
  hasPhoto: boolean;
  /** Unread notices from the studio. Shown as a count on their face. */
  unread: number;
} | null;

export function Header({ user }: { user: HeaderUser }) {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* The home page opens with a full-bleed cover. Over it the bar becomes a
     centred wordmark with a MENU control — once you scroll past the cover it
     turns into the normal light navigation bar. */
  const onDark = pathname === "/" && !scrolled;
  const cover = onDark;

  const links = [
    { href: "/", label: t.nav.home },
    { href: "/studio", label: t.nav.studio },
    { href: "/classes", label: t.nav.classes },
    { href: "/timetable", label: t.nav.timetable },
    { href: "/pricing", label: t.nav.pricing },
    { href: "/contact", label: t.nav.contact },
  ];

  /* A document load, not a client navigation — see lib/sign-out.ts. */
  const signOut = signOutAndGoHome;

  /* Tapping a nav item for the page you are already on used to do nothing at
     all: Link treats it as a no-op, and the sheet only closes when the path
     changes, so it just sat there open. Take the tap at face value — close the
     sheet, go back to the top of that page and refresh it. */
  function follow(href: string) {
    setOpen(false);
    if (href !== pathname) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    router.refresh();
  }

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-700 ease-silk",
          scrolled
            ? "border-b border-mocha-200/60 bg-cream/85 py-3 backdrop-blur-xl"
            : "border-b border-transparent py-6",
        )}
      >
        <div
          className={cn(
            "container-x flex items-center gap-6",
            cover
              ? "justify-between md:grid md:grid-cols-3"
              : "justify-between",
          )}
        >
          {cover && (
            <div className={cn("hidden md:block", open && "invisible")}>
              <LanguageToggle tone="dark" />
            </div>
          )}

          <div
            className={cn(
              cover && "md:flex md:justify-center",
              /* the full-screen sheet carries its own identity, so the bar's
                 wordmark steps aside while it is open */
              open && "invisible",
            )}
          >
            <WordmarkLink
              priority
              tone={onDark ? "cream" : "brown"}
              className={cn(
                "transition-all duration-700 ease-silk",
                cover ? "w-[168px]" : scrolled ? "w-[132px]" : "w-[156px]",
              )}
            />
          </div>

          <nav
            className={cn(
              /* Six items now that Home is among them, so the gap tightens at
                 lg and opens back up once there is room for it. */
              "items-center gap-6 xl:gap-8",
              cover ? "hidden" : "hidden lg:flex",
            )}
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => follow(l.href)}
                className={cn(
                  "link-underline text-[11px] uppercase tracking-widest transition-colors",
                  onDark
                    ? pathname === l.href
                      ? "text-cream"
                      : "text-cream/70 hover:text-cream"
                    : pathname === l.href
                      ? "text-mocha-600"
                      : "text-mocha-500 hover:text-mocha-600",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div
            className={cn("flex items-center gap-3", cover && "md:justify-end")}
          >
            {cover && (
              <button
                onClick={() => setOpen(true)}
                className={cn(
                  "group hidden items-center gap-3 text-[11px] uppercase tracking-brand text-cream md:flex",
                  open && "invisible",
                )}
              >
                {t.nav.menu}
                <span className="block h-px w-7 bg-cream/70 transition-all duration-500 ease-silk group-hover:w-10" />
              </button>
            )}

            {!cover && (
              <LanguageToggle
                tone={onDark ? "dark" : "light"}
                className="hidden sm:inline-flex"
              />
            )}

            {user && !cover ? (
              /* The chip is on every screen size now, not just the laptop: on a
                 phone it drops the first name and keeps the face and the
                 session count, which is the part anyone actually checks. */
              <div
                className={cn(
                  "flex items-center gap-2 sm:gap-3",
                  /* the sheet carries its own account row, so the chip steps
                     aside while it is open, as the wordmark does */
                  open && "invisible",
                )}
              >
                <AccountMenu user={user} onDark={onDark} onSignOut={signOut} />
                {/* Between lg and xl the bar is carrying six nav items, the
                    language toggle and the chip, and this was the piece that
                    buckled into three lines. A signed-in member has Timetable
                    in the nav and Book another class on their account, so it
                    waits for the room instead. */}
                <ButtonLink
                  href="/timetable"
                  size="sm"
                  variant={onDark ? "cream" : "solid"}
                  className="hidden whitespace-nowrap xl:inline-flex"
                >
                  {t.nav.book}
                </ButtonLink>
              </div>
            ) : cover ? null : (
              <div className="hidden items-center gap-3 lg:flex">
                <Link
                  href="/login"
                  className={cn(
                    "link-underline whitespace-nowrap text-[11px] uppercase tracking-widest transition-colors",
                    onDark
                      ? "text-cream/75 hover:text-cream"
                      : "text-mocha-500 hover:text-mocha-600",
                  )}
                >
                  {t.nav.login}
                </Link>
                <ButtonLink
                  href="/timetable"
                  size="sm"
                  variant={onDark ? "cream" : "solid"}
                  className="whitespace-nowrap"
                >
                  {t.nav.book}
                </ButtonLink>
              </div>
            )}

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t.nav.close : t.nav.menu}
              aria-expanded={open}
              className={cn(
                "relative z-50 flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                cover ? "md:hidden" : "lg:hidden",
                onDark && !open ? "border-cream/30" : "border-mocha-200",
              )}
            >
              <span className="relative block h-3 w-4">
                <span
                  className={cn(
                    "absolute left-0 h-px w-4 transition-all duration-500 ease-silk",
                    onDark && !open ? "bg-cream" : "bg-mocha-600",
                    open ? "top-1.5 rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 h-px w-4 transition-all duration-500 ease-silk",
                    onDark && !open ? "bg-cream" : "bg-mocha-600",
                    open ? "top-1.5 -rotate-45" : "top-3",
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile sheet: always mounted, toggled with CSS so no animation
          library is pulled into the shared layout (and every route). */}
      <div
        className={cn("sheet fixed inset-0 z-40 bg-cream", open && "is-open")}
        aria-hidden={!open}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label={t.nav.close}
          className="absolute right-6 top-7 z-10 hidden h-10 w-10 items-center justify-center rounded-full border border-mocha-200 text-mocha-600 transition-colors hover:border-mocha-500 md:flex"
        >
          <span className="relative block h-4 w-4">
            <span className="absolute left-0 top-1/2 h-px w-4 rotate-45 bg-mocha-600" />
            <span className="absolute left-0 top-1/2 h-px w-4 -rotate-45 bg-mocha-600" />
          </span>
        </button>

        {/* Six items rather than five, so the list is a shade tighter and the
            sheet can scroll on a short phone instead of running off the end. */}
        <div className="container-x flex h-full flex-col justify-center gap-1.5 overflow-y-auto py-20">
          {links.map((l) => (
            <div key={l.href} className="sheet-item">
              <Link
                href={l.href}
                tabIndex={open ? 0 : -1}
                onClick={() => follow(l.href)}
                className="block py-2.5 font-display text-[2rem] font-light text-mocha-600 sm:text-4xl"
              >
                {l.label}
              </Link>
            </div>
          ))}

          <div className="sheet-item mt-10 flex flex-col gap-3 border-t border-mocha-200 pt-8">
            {user ? (
              <>
                {/* Their name, not "My account".
                    A row carrying somebody's face and then a label describing
                    the page it leads to reads like a stranger's account: the
                    face is theirs, so the words beside it should be too. The
                    destination is obvious from the face and the balance.

                    `follow` matters here more than anywhere. Tapping this while
                    already on /account is not a new address, so Link did
                    nothing at all and the sheet stayed open over the page the
                    member was asking to see. */}
                <Link
                  href="/account?tab=profile"
                  tabIndex={open ? 0 : -1}
                  onClick={() => follow("/account")}
                  className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest text-mocha-600"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <UserAvatar
                      hasPhoto={user.hasPhoto}
                      name={user.name}
                      className="h-7 w-7 shrink-0"
                    />
                    <span className="truncate normal-case tracking-normal text-[13px]">
                      {user.name}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-mocha-600 px-2.5 py-1 text-cream">
                    {user.credits} {t.common.credits}
                  </span>
                </Link>
                <button
                  onClick={signOut}
                  tabIndex={open ? 0 : -1}
                  className="self-start text-[11px] uppercase tracking-widest text-clay"
                >
                  {t.nav.logout}
                </button>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink
                  href="/login"
                  variant="outline"
                  size="sm"
                  tabIndex={open ? 0 : -1}
                >
                  {t.nav.login}
                </ButtonLink>
                <ButtonLink href="/register" size="sm" tabIndex={open ? 0 : -1}>
                  {t.nav.register}
                </ButtonLink>
              </div>
            )}
            <LanguageToggle className="mt-4 self-start" />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The member's chip, and the menu behind it.
 *
 * It used to be a plain link to /account, which meant reaching Payments took a
 * page load and then a hunt for the right pill. Pressing the face now opens the
 * six sections and each one links straight to its own tab, so the header is the
 * shortest path to any of them. Sign out lives here too — on a phone it was
 * otherwise buried in the menu sheet.
 */
function AccountMenu({
  user,
  onDark,
  onSignOut,
}: {
  user: NonNullable<HeaderUser>;
  onDark: boolean;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.nav.account}
        className={cn(
          "flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition-colors sm:px-3.5 sm:py-2",
          onDark
            ? "border-cream/30 hover:border-cream/60"
            : "border-mocha-200 hover:border-mocha-400",
          open && (onDark ? "border-cream/70" : "border-mocha-500"),
        )}
      >
        {/* Their own face in the corner of every page: the quickest way to know
            which account you are looking at. Falls back to the plain user mark
            until a photo is uploaded. */}
        <span className="relative">
          <UserAvatar
            hasPhoto={user.hasPhoto}
            name={user.name}
            className={cn(
              "h-6 w-6 border-0",
              onDark ? "bg-cream/15" : "bg-mocha-100",
            )}
          />
          {/* Unread notices, counted on their own face. Sits on the avatar
              rather than beside the name so it survives the phone layout,
              where the name is not shown. */}
          {user.unread > 0 && (
            <span
              aria-label={`${user.unread} unread`}
              className="absolute -right-1.5 -top-1.5 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-gold px-1 text-[9px] font-medium leading-none text-mocha-900 lining-nums tabular-nums ring-2 ring-cream"
            >
              {user.unread > 9 ? "9+" : user.unread}
            </span>
          )}
        </span>
        <span
          className={cn(
            "hidden text-[11px] uppercase tracking-widest sm:inline",
            onDark ? "text-cream" : "text-mocha-600",
          )}
        >
          {user.name.split(" ")[0]}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] lining-nums tabular-nums",
            onDark ? "bg-cream text-mocha-700" : "bg-mocha-600 text-cream",
          )}
        >
          {user.credits}
        </span>
      </button>

      {/* Kept mounted and toggled with CSS, like the menu sheet: no animation
          library on a component that ships with every page. */}
      <div
        role="menu"
        aria-hidden={!open}
        className={cn(
          "absolute right-0 top-[calc(100%+0.65rem)] z-50 w-60 rounded-3xl border border-mocha-200 bg-cream p-2 shadow-lift transition-all duration-300 ease-silk",
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-1 opacity-0",
        )}
      >
        {ACCOUNT_TABS.map((id) => (
          <Link
            key={id}
            role="menuitem"
            tabIndex={open ? 0 : -1}
            /* Profile carries its name like the rest.
             *
             * It used to link to plain `/account`, which made it indistinguishable
             * from clicking the photograph — and the photograph is meant to land
             * at the top of the page, on the balance, while a menu item is meant
             * to land on the section it names. One address cannot mean both, so
             * the member clicked Profile and arrived at the top with the right
             * pill selected somewhere below the fold.
             *
             * Profile alone carries `jump=1`. It is also the default section, so
             * `?tab=profile` is where the member's own face points too — and that
             * is meant to land at the top, on the balance. The marker is what
             * separates the two, and no other section needs one. */
            href={
              id === "profile"
                ? "/account?tab=profile&jump=1"
                : `/account?tab=${id}`
            }
            /* Next resets the scroll position to the top on navigation, which
             * used to land on top of the jump-to-section and cancel it. Turning
             * that off removes the race rather than racing it with a timeout. */
            scroll={false}
            onClick={() => {
              setOpen(false);
              /* Already on the account page: the section is right here, so scroll
               * to it now. The effect in AccountBody handles arriving from
               * another page; this handles the case that effect cannot see —
               * clicking the same menu item twice, which is not a new address and
               * so is not a new navigation. */
              if (pathname === "/account") {
                requestAnimationFrame(() =>
                  document
                    .getElementById("account-sections")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }
            }}
            className="block rounded-2xl px-4 py-2.5 text-[11px] uppercase tracking-widest text-mocha-500 transition-colors hover:bg-cream-200 hover:text-mocha-700"
          >
            <span className="flex items-center justify-between gap-3">
              {t.accountTabs[id]}
              {id === "notifications" && user.unread > 0 && (
                <span className="grid h-[17px] min-w-[17px] place-items-center rounded-full bg-gold px-1 text-[9px] leading-none text-mocha-900 lining-nums tabular-nums">
                  {user.unread}
                </span>
              )}
            </span>
          </Link>
        ))}
        <div className="my-1.5 h-px bg-mocha-200/70" />
        <button
          type="button"
          role="menuitem"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            setOpen(false);
            void onSignOut();
          }}
          className="block w-full rounded-2xl px-4 py-2.5 text-left text-[11px] uppercase tracking-widest text-clay transition-colors hover:bg-cream-200 hover:text-mocha-700"
        >
          {t.nav.logout}
        </button>
      </div>
    </div>
  );
}

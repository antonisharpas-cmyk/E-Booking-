"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LanguageToggle } from "@/components/site/LanguageToggle";
import { ButtonLink } from "@/components/ui/Button";
import { WordmarkLink } from "@/components/ui/Wordmark";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type HeaderUser = {
  name: string;
  role: string;
  credits: number;
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
    { href: "/studio", label: t.nav.studio },
    { href: "/classes", label: t.nav.classes },
    { href: "/timetable", label: t.nav.timetable },
    { href: "/pricing", label: t.nav.pricing },
    { href: "/contact", label: t.nav.contact },
  ];

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
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
            cover ? "justify-between md:grid md:grid-cols-3" : "justify-between",
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
              "items-center gap-8",
              cover ? "hidden" : "hidden lg:flex",
            )}
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
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
            className={cn(
              "flex items-center gap-3",
              cover && "md:justify-end",
            )}
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
              <div className="hidden items-center gap-3 lg:flex">
                <Link
                  href="/account"
                  className={cn(
                    "group flex items-center gap-2 rounded-full border px-3.5 py-2 transition-colors",
                    onDark
                      ? "border-cream/30 hover:border-cream/60"
                      : "border-mocha-200 hover:border-mocha-400",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] uppercase tracking-widest",
                      onDark ? "text-cream" : "text-mocha-600",
                    )}
                  >
                    {user.name.split(" ")[0]}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] lining-nums tabular-nums",
                      onDark
                        ? "bg-cream text-mocha-700"
                        : "bg-mocha-600 text-cream",
                    )}
                  >
                    {user.credits}
                  </span>
                </Link>
                <ButtonLink
                  href="/timetable"
                  size="sm"
                  variant={onDark ? "cream" : "solid"}
                >
                  {t.nav.book}
                </ButtonLink>
              </div>
            ) : cover ? null : (
              <div className="hidden items-center gap-3 lg:flex">
                <Link
                  href="/login"
                  className={cn(
                    "link-underline text-[11px] uppercase tracking-widest transition-colors",
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
        className={cn(
          "sheet fixed inset-0 z-40 bg-cream",
          open && "is-open",
        )}
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

        <div className="container-x flex h-full flex-col justify-center gap-2 pt-20">
          {links.map((l) => (
            <div key={l.href} className="sheet-item">
              <Link
                href={l.href}
                tabIndex={open ? 0 : -1}
                className="block py-3 font-display text-4xl font-light text-mocha-600"
              >
                {l.label}
              </Link>
            </div>
          ))}

          <div className="sheet-item mt-10 flex flex-col gap-3 border-t border-mocha-200 pt-8">
            {user ? (
              <>
                <Link
                  href="/account"
                  tabIndex={open ? 0 : -1}
                  className="flex items-center justify-between text-[11px] uppercase tracking-widest text-mocha-600"
                >
                  {t.nav.account}
                  <span className="rounded-full bg-mocha-600 px-2.5 py-1 text-cream">
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

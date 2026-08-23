"use client";

import { AnimatePresence, motion } from "framer-motion";
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
        <div className="container-x flex items-center justify-between gap-6">
          <WordmarkLink
            priority
            className={cn(
              "transition-all duration-700 ease-silk",
              scrolled ? "w-[132px]" : "w-[156px]",
            )}
          />

          <nav className="hidden items-center gap-8 lg:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "link-underline text-[11px] uppercase tracking-widest transition-colors",
                  pathname === l.href
                    ? "text-mocha-600"
                    : "text-mocha-500 hover:text-mocha-600",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LanguageToggle className="hidden sm:inline-flex" />

            {user ? (
              <div className="hidden items-center gap-3 lg:flex">
                <Link
                  href="/account"
                  className="group flex items-center gap-2 rounded-full border border-mocha-200 px-3.5 py-2 transition-colors hover:border-mocha-400"
                >
                  <span className="text-[11px] uppercase tracking-widest text-mocha-600">
                    {user.name.split(" ")[0]}
                  </span>
                  <span className="rounded-full bg-mocha-600 px-2 py-0.5 text-[10px] tabular-nums text-cream">
                    {user.credits}
                  </span>
                </Link>
                <ButtonLink href="/timetable" size="sm">
                  {t.nav.book}
                </ButtonLink>
              </div>
            ) : (
              <div className="hidden items-center gap-3 lg:flex">
                <Link
                  href="/login"
                  className="link-underline text-[11px] uppercase tracking-widest text-mocha-500 hover:text-mocha-600"
                >
                  {t.nav.login}
                </Link>
                <ButtonLink href="/timetable" size="sm">
                  {t.nav.book}
                </ButtonLink>
              </div>
            )}

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? t.nav.close : t.nav.menu}
              aria-expanded={open}
              className="relative z-50 flex h-10 w-10 items-center justify-center rounded-full border border-mocha-200 lg:hidden"
            >
              <span className="relative block h-3 w-4">
                <span
                  className={cn(
                    "absolute left-0 h-px w-4 bg-mocha-600 transition-all duration-500 ease-silk",
                    open ? "top-1.5 rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 h-px w-4 bg-mocha-600 transition-all duration-500 ease-silk",
                    open ? "top-1.5 -rotate-45" : "top-3",
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-40 bg-cream lg:hidden"
          >
            <div className="container-x flex h-full flex-col justify-center gap-2 pt-20">
              {links.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 * i + 0.08, duration: 0.6 }}
                >
                  <Link
                    href={l.href}
                    className="block py-3 font-display text-4xl font-light text-mocha-600"
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.6 }}
                className="mt-10 flex flex-col gap-3 border-t border-mocha-200 pt-8"
              >
                {user ? (
                  <>
                    <Link
                      href="/account"
                      className="flex items-center justify-between text-[11px] uppercase tracking-widest text-mocha-600"
                    >
                      {t.nav.account}
                      <span className="rounded-full bg-mocha-600 px-2.5 py-1 text-cream">
                        {user.credits} {t.common.credits}
                      </span>
                    </Link>
                    <button
                      onClick={signOut}
                      className="self-start text-[11px] uppercase tracking-widest text-clay"
                    >
                      {t.nav.logout}
                    </button>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <ButtonLink href="/login" variant="outline" size="sm">
                      {t.nav.login}
                    </ButtonLink>
                    <ButtonLink href="/register" size="sm">
                      {t.nav.register}
                    </ButtonLink>
                  </div>
                )}
                <LanguageToggle className="mt-4 self-start" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

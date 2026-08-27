"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  important: boolean;
  read: boolean;
};

/**
 * Notices from the studio, in the member's own account.
 *
 * Unread ones are marked and carry the count that appears on the member's face
 * in the corner of every page. Opening one marks it read; there is also a
 * "mark all read" for somebody coming back after a fortnight away.
 *
 * Read state is per member and stored server side, so it follows them from
 * their phone to their laptop — which is the whole point of a notice in an
 * account rather than a browser notification.
 *
 * The list is bounded and scrolls inside itself rather than growing the page.
 * A member who has been with the studio a year will have a hundred of these,
 * and a hundred stacked cards would push their own settings so far down the page
 * that they would never find them. Bounded, the screen looks the same on day one
 * and in year three. The filter is there for the same reason: "unread" is the
 * question somebody actually arrives with.
 */
export function NoticeList({ notices }: { notices: NoticeRow[] }) {
  const { t, fmtFullDate } = useI18n();
  const n = t.notices;
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(
    /* The newest unread one starts open: it is why they came. */
    notices.find((x) => !x.read)?.id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState<Set<string>>(
    new Set(notices.filter((x) => x.read).map((x) => x.id)),
  );
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");

  async function mark(noticeId?: string) {
    setBusy(true);
    try {
      await fetch("/api/notices/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noticeId ? { noticeId } : {}),
      });
      setRead((prev) => {
        const next = new Set(prev);
        if (noticeId) next.add(noticeId);
        else notices.forEach((x) => next.add(x.id));
        return next;
      });
      /* Refreshes the layout, which is what takes the number off their face. */
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function toggle(row: NoticeRow) {
    const next = open === row.id ? null : row.id;
    setOpen(next);
    if (next && !read.has(row.id)) void mark(row.id);
  }

  const unread = notices.filter((x) => !read.has(x.id)).length;
  const readCount = notices.length - unread;

  if (!notices.length) {
    return (
      <div className="rounded-3xl border border-dashed border-mocha-200 px-6 py-10 text-center">
        <p className="text-sm text-clay">{n.empty}</p>
      </div>
    );
  }

  const shown =
    filter === "unread"
      ? notices.filter((x) => !read.has(x.id))
      : filter === "read"
        ? notices.filter((x) => read.has(x.id))
        : notices;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h3 className="text-[13px] uppercase tracking-widest">
          {n.title}
          {unread > 0 && (
            <span className="ml-3 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] text-[#8a6f1a] lining-nums tabular-nums">
              {unread} {n.unread}
            </span>
          )}
        </h3>
        {unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void mark()}
          >
            {n.markAll}
          </Button>
        )}
      </div>

      {/* Unread first, because that is the question people arrive with. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["unread", n.filterUnread, unread],
            ["all", n.filterAll, notices.length],
            ["read", n.filterRead, readCount],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            data-notice-filter={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-4 py-2 text-[10px] uppercase tracking-widest transition-colors duration-300",
              filter === key
                ? "border-mocha-600 bg-mocha-600 text-cream"
                : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
            )}
          >
            {label}
            <span className="ml-2 lining-nums tabular-nums opacity-70">
              {count}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-mocha-200 px-6 py-8 text-center text-sm text-clay">
          {filter === "unread" ? n.noneUnread : n.noneRead}
        </p>
      )}

      {/* Its own scroll, so a hundred messages do not bury the settings below.
          `overscroll-contain` stops a flick inside the list from carrying on
          into the page once it reaches the end. */}
      <ul
        className={cn(
          "mt-5 space-y-3 overflow-y-auto overscroll-contain pr-1",
          shown.length > 3 ? "max-h-[26rem]" : "",
        )}
      >
        {shown.map((row) => {
          const isRead = read.has(row.id);
          const isOpen = open === row.id;
          return (
            <li
              key={row.id}
              className={cn(
                "overflow-hidden rounded-3xl border transition-colors",
                isRead
                  ? "border-mocha-200/70 bg-white/50"
                  : "border-gold/40 bg-gold/[0.05]",
              )}
            >
              <button
                onClick={() => toggle(row)}
                aria-expanded={isOpen}
                className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
              >
                {/* min-w-0 lets this side shrink inside the flex row; without it
                    an unbroken 60-character word makes the whole card wider than
                    the phone and the page scrolls sideways. */}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2.5">
                    {!isRead && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                      />
                    )}
                    <span
                      className={cn(
                        "text-[15px] [overflow-wrap:anywhere]",
                        isRead ? "text-mocha-500" : "text-mocha-700",
                      )}
                    >
                      {row.title}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[11px] uppercase tracking-widest text-clay">
                    {fmtFullDate(row.createdAt)}
                    {row.important ? ` · ${n.important}` : ""}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 shrink-0 text-clay transition-transform duration-300",
                    isOpen && "rotate-180",
                  )}
                >
                  <svg viewBox="0 0 12 8" className="h-2.5 w-2.5" fill="none">
                    <path
                      d="M1 1l5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <p className="whitespace-pre-line px-6 pb-6 text-[14px] leading-relaxed text-mocha-500 [overflow-wrap:anywhere]">
                  {row.body}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

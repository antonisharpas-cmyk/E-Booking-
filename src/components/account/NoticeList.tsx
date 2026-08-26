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

  if (!notices.length) {
    return (
      <div className="rounded-3xl border border-dashed border-mocha-200 px-6 py-10 text-center">
        <p className="text-sm text-clay">{n.empty}</p>
      </div>
    );
  }

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

      <ul className="mt-6 space-y-3">
        {notices.map((row) => {
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
                <span>
                  <span className="flex items-center gap-2.5">
                    {!isRead && (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                      />
                    )}
                    <span
                      className={cn(
                        "text-[15px]",
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
                <p className="whitespace-pre-line px-6 pb-6 text-[14px] leading-relaxed text-mocha-500">
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/**
 * Writing to every member at once.
 *
 * The message lands in each member's account with a count on their photograph
 * until they open it, and the desk can see how many have. It says plainly on
 * screen that no email or SMS goes out, because a receptionist who believes a
 * text message was sent will not pick up the phone — and right now nothing is
 * sent but this.
 */

type Sent = {
  id: string;
  titleEn: string;
  bodyEn: string;
  important: boolean;
  createdAt: string;
  author: string | null;
  reads: number;
  members: number;
};

export function NoticePanel({ onNotice }: { onNotice: (s: string) => void }) {
  const { t, fmtFullDate } = useI18n();
  const d = t.desk;

  const [history, setHistory] = useState<Sent[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [titleEl, setTitleEl] = useState("");
  const [textEl, setTextEl] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notices");
    if (!res.ok) return;
    const data = (await res.json()) as { notices: Sent[] };
    setHistory(data.notices ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setBusy("send");
    try {
      const res = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleEn: title,
          bodyEn: text,
          titleEl,
          bodyEl: textEl,
          important,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) {
        onNotice(data.error);
        return;
      }
      onNotice(d.noticeSent);
      setTitle("");
      setText("");
      setTitleEl("");
      setTextEl("");
      setImportant(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
        <p className="text-[10px] uppercase tracking-brand text-clay">
          {d.noticeTitle}
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-clay">
          {d.noticeHelp}
        </p>

        <label className="label mt-6" htmlFor="notice-subject">
          {d.noticeSubject}
        </label>
        <input
          id="notice-subject"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="input"
        />

        <label className="label mt-5" htmlFor="notice-body">
          {d.noticeBody}
        </label>
        <textarea
          id="notice-body"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          className="input resize-y"
        />

        <details className="mt-5">
          <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-clay">
            {d.noticeGreek}
          </summary>
          <input
            value={titleEl}
            onChange={(e) => setTitleEl(e.target.value)}
            placeholder={d.noticeSubject}
            className="input mt-3"
          />
          <textarea
            rows={4}
            value={textEl}
            onChange={(e) => setTextEl(e.target.value)}
            placeholder={d.noticeBody}
            className="input mt-3 resize-y"
          />
        </details>

        <button
          onClick={() => setImportant((v) => !v)}
          className={cn(
            "mt-6 rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest transition-colors",
            important
              ? "border-gold bg-gold/15 text-[#8a6f1a]"
              : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
          )}
        >
          {d.noticeImportant}
        </button>

        <Button
          className="mt-6 block"
          size="sm"
          disabled={busy === "send" || title.trim().length < 3 || text.trim().length < 3}
          onClick={send}
        >
          {busy === "send" ? t.common.loading : d.noticeSend}
        </Button>
      </div>

      <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
        <p className="text-[10px] uppercase tracking-brand text-clay">
          {d.noticeHistory}
        </p>

        {history.length === 0 ? (
          <p className="mt-5 text-sm text-clay">{d.noticeNone}</p>
        ) : (
          <ul className="mt-5 divide-y divide-mocha-200/70">
            {history.map((h) => (
              <li key={h.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-[14px] text-mocha-600">
                    {h.important && (
                      <span
                        aria-hidden
                        className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle"
                      />
                    )}
                    {h.titleEn}
                  </span>
                  <span className="text-[11px] text-clay lining-nums tabular-nums">
                    {h.reads}/{h.members} {d.noticeReads}
                  </span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-widest text-clay">
                  {fmtFullDate(h.createdAt)}
                  {h.author ? ` · ${h.author}` : ""}
                </p>
                <p className="mt-2 line-clamp-2 text-[13px] text-mocha-500">
                  {h.bodyEn}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

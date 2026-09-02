"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { useI18n } from "@/i18n/LanguageProvider";
import {
  CONDITION_MAX_CHARS,
  PILATES_EXPERIENCE,
  PILATES_LEVELS,
  type PilatesExperience,
  type PilatesLevel,
} from "@/lib/intake";
import { cn } from "@/lib/utils";

/**
 * The last screen of signing up: three questions, then the timetable.
 *
 * Why it is a screen of its own rather than four more fields on the
 * registration form. Somebody filling in a registration form is doing
 * paperwork and wants it over with; they will pick whatever gets them past it.
 * Asked afterwards, once the account exists and the code has been confirmed,
 * the same three questions read as the studio getting ready for them, and the
 * answers are worth something. It also keeps the sign-up form to the fields
 * that are genuinely required to *have* an account.
 *
 * The condition question is two controls and not one. A single free-text box
 * gets "no", "none", "-", "nothing thanks" and an empty string, all meaning the
 * same thing and none of them searchable; and a member with nothing to declare
 * should not have to type in order to say so.
 */
export function IntakeForm({
  next,
  initial,
  /** Rendered inside the account rather than as the sign-up step. */
  embedded = false,
  onSaved,
}: {
  next?: string;
  initial?: {
    level: PilatesLevel | null;
    experience: PilatesExperience | null;
    condition: string | null;
    answered: boolean;
  };
  embedded?: boolean;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const w = t.intake;

  const [level, setLevel] = useState<PilatesLevel | null>(
    initial?.level ?? null,
  );
  const [experience, setExperience] = useState<PilatesExperience | null>(
    initial?.experience ?? null,
  );
  /**
   * Whether they are declaring something, held apart from the text itself.
   *
   * So that switching to "nothing" and back does not lose what they had already
   * typed, and so that the text box only exists when it has a reason to.
   */
  const [hasCondition, setHasCondition] = useState<boolean | null>(
    initial?.answered ? Boolean(initial.condition) : null,
  );
  const [condition, setCondition] = useState(initial?.condition ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const complete =
    level !== null &&
    experience !== null &&
    hasCondition !== null &&
    (!hasCondition || condition.trim().length > 0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!complete) {
      setError(w.errIncomplete);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          experience,
          condition: hasCondition ? condition.trim() : "",
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(
          data.error === "CONDITION_TOO_LONG" ? w.errTooLong : w.errSaving,
        );
        setBusy(false);
        return;
      }
      if (embedded) {
        setSaved(true);
        setBusy(false);
        onSaved?.();
        return;
      }
      /* A document load rather than a client navigation, for the same reason as
         the code screen: the header and the balance are rendered on the server
         and would otherwise spend a moment showing the old state. */
      window.location.assign(next && /^\/[^/\\]/.test(next) ? next : "/timetable");
    } catch {
      setError(w.errSaving);
      setBusy(false);
    }
  }

  /* One shape for both, so a control cannot look like a button here and a radio
     there. These are choices, so they read as choices. */
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-2 text-[13px] transition-colors",
      active
        ? "border-mocha-600 bg-mocha-600 text-cream"
        : "border-mocha-300 bg-transparent text-mocha-600 hover:border-mocha-500",
    );

  const body = (
    <form onSubmit={submit} className={embedded ? "" : "mt-9"}>
      <fieldset className="border-0 p-0">
        <legend className="label mb-3">{w.levelLabel}</legend>
        <p className="mb-3 text-[12px] text-clay">{w.levelWhy}</p>
        <div className="flex flex-wrap gap-2">
          {PILATES_LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={level === option}
              onClick={() => setLevel(option)}
              className={chip(level === option)}
            >
              {w.levels[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8 border-0 p-0">
        <legend className="label mb-3">{w.experienceLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {PILATES_EXPERIENCE.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={experience === option}
              onClick={() => setExperience(option)}
              className={chip(experience === option)}
            >
              {w.experience[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8 border-0 p-0">
        <legend className="label mb-3">{w.conditionLabel}</legend>
        <p className="mb-3 text-[12px] text-clay">{w.conditionWhy}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={hasCondition === false}
            onClick={() => setHasCondition(false)}
            className={chip(hasCondition === false)}
          >
            {w.conditionNone}
          </button>
          <button
            type="button"
            aria-pressed={hasCondition === true}
            onClick={() => setHasCondition(true)}
            className={chip(hasCondition === true)}
          >
            {w.conditionOther}
          </button>
        </div>

        {hasCondition && (
          <div className="mt-4">
            <textarea
              autoFocus
              rows={4}
              maxLength={CONDITION_MAX_CHARS}
              value={condition}
              onChange={(e) => setCondition(e.currentTarget.value)}
              placeholder={w.conditionPlaceholder}
              className="input resize-y"
              aria-label={w.conditionOther}
            />
            <p className="mt-1.5 text-right text-[11px] text-clay">
              {condition.length} / {CONDITION_MAX_CHARS}
            </p>
          </div>
        )}
      </fieldset>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-6 rounded-xl border border-mocha-200 bg-mocha-50 px-4 py-3 text-sm text-mocha-700">
          {w.saved}
        </p>
      )}

      <Button
        type="submit"
        className={embedded ? "mt-7" : "mt-8 w-full"}
        disabled={busy || !complete}
      >
        {busy ? t.common.loading : embedded ? t.common.save : w.cta}
      </Button>

      {!embedded && (
        <p className="mt-5 text-center text-[12px] text-clay">
          {w.changeLater}
        </p>
      )}
    </form>
  );

  if (embedded) return body;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-14">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex justify-center">
          <Monogram className="h-10 w-auto" />
        </div>
        <p className="eyebrow mb-3 text-center">{w.eyebrow}</p>
        <h1 className="h-display text-center text-[2rem] leading-tight sm:text-[2.4rem]">
          {w.title}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-center text-[14px] leading-relaxed text-mocha-500">
          {w.body}
        </p>
        {body}
      </div>
    </div>
  );
}

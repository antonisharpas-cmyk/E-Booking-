"use client";

import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/** `tone="dark"` for use on the brown sections and in the footer. */
export function LanguageToggle({
  className,
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border p-0.5 text-[10px] uppercase tracking-widest",
        tone === "dark" ? "border-cream/25" : "border-mocha-200",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {(["en", "el"] as const).map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            onClick={() => setLocale(l)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-1 transition-all duration-500 ease-silk",
              active && tone === "dark" && "bg-cream text-mocha-700",
              active && tone === "light" && "bg-mocha-600 text-cream",
              !active && tone === "dark" && "text-cream/60 hover:text-cream",
              !active && tone === "light" && "text-clay hover:text-mocha-600",
            )}
          >
            {l === "en" ? "EN" : "ΕΛ"}
          </button>
        );
      })}
    </div>
  );
}

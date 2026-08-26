"use client";

import { LanguageToggle } from "@/components/site/LanguageToggle";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export const DESK_TABS = [
  "today",
  "members",
  "timetable",
  "notices",
  "pricing",
  "analytics",
] as const;

export type DeskTab = (typeof DESK_TABS)[number];

/**
 * The desk's own top bar, in place of the website's.
 *
 * The tabs are the whole of the navigation here, and they sit where a browser's
 * tabs would: at the top, always in the same place, always visible. Which tabs
 * appear depends on who is signed in — reception has five, the owner six.
 * The bar sticks to the top of the window so that scrolling down a long roster
 * never means scrolling back up to change tab.
 *
 * The wordmark is deliberately not a link. There is nothing on the public site
 * the desk needs while it is working, and a logo that navigates away is a logo
 * that eventually loses somebody's half-finished notice.
 */
export function DeskBar({
  tabs,
  tab,
  onTab,
  onLock,
  staffName,
}: {
  /** Which tabs this person has. Reception's bar has no Analytics. */
  tabs: readonly DeskTab[];
  tab: DeskTab;
  onTab: (t: DeskTab) => void;
  onLock: () => void;
  staffName: string;
}) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-30 border-b border-mocha-200/70 bg-cream/95 backdrop-blur-md">
      <div className="container-x flex h-20 items-center gap-6">
        <span className="shrink-0" aria-label="APEX pilates">
          <Wordmark className="w-[132px]" priority />
        </span>

        {/* On a narrow screen the tabs scroll rather than wrap: the bar stays one
            line high, so the numbers underneath never jump about. */}
        <nav
          aria-label={t.admin.title}
          className="-mx-2 flex flex-1 items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((key) => (
            <button
              key={key}
              data-desk-tab={key}
              onClick={() => onTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-4 py-2.5 text-[10px] uppercase tracking-widest transition-colors duration-300",
                tab === key
                  ? "bg-mocha-600 text-cream"
                  : "text-mocha-500 hover:bg-cream-200 hover:text-mocha-600",
              )}
            >
              {t.desk.tabs[key]}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[11px] text-clay lg:inline">
            {staffName}
          </span>
          <LanguageToggle />
          {/* One press to leave the desk properly: the console locks and the
              session ends, so the next person at this shared machine is asked
              who they are rather than just asked to prove they are the last
              one. */}
          <Button size="sm" variant="outline" onClick={onLock}>
            {t.desk.lock}
          </Button>
        </div>
      </div>
    </header>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-mocha-200/70 border-y border-mocha-200/70">
      {t.home.faq.items.map((item, i) => {
        const isOpen = open === i;
        return (
          <Reveal key={item.q} delay={i * 0.04}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-start justify-between gap-8 py-7 text-left"
            >
              <span
                className={cn(
                  "max-w-2xl text-[15px] transition-colors duration-500",
                  isOpen ? "text-mocha-600" : "text-mocha-500",
                )}
              >
                {item.q}
              </span>
              <span className="relative mt-2 block h-3 w-3 shrink-0">
                <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-mocha-500" />
                <span
                  className={cn(
                    "absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-mocha-500 transition-transform duration-500 ease-silk",
                    isOpen ? "scale-y-0" : "scale-y-100",
                  )}
                />
              </span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl pb-8 text-sm leading-[1.9] text-mocha-500">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </Reveal>
        );
      })}
    </div>
  );
}

import { cn } from "@/lib/utils";

/**
 * The APEX pilates mark — two crossed loops.
 *
 * Vector so it scales and recolours cleanly. If the studio supplies the
 * original artwork, drop it in /public/brand/monogram.svg and swap this
 * component for an <Image> — every usage keeps working.
 */
export function Monogram({
  className,
  strokeWidth = 2.4,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={cn("h-10 w-10", className)}
    >
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
        <ellipse cx="50" cy="50" rx="38" ry="23" transform="rotate(-42 50 50)" />
        <ellipse cx="50" cy="50" rx="38" ry="23" transform="rotate(42 50 50)" opacity="0.85" />
      </g>
    </svg>
  );
}

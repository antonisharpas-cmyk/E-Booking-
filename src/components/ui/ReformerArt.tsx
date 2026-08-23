import { cn } from "@/lib/utils";

/**
 * Line-art Reformer, drawn in the brand colour.
 * Placeholder for studio photography — when real photos arrive, swap this for
 * <Image> in the hero and the studio page.
 */
export function ReformerArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 260"
      fill="none"
      aria-hidden="true"
      className={cn("w-full", className)}
    >
      <defs>
        <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.85" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* long frame rails */}
      <rect x="40" y="150" width="640" height="10" rx="5" fill="url(#rail)" />
      <rect
        x="40"
        y="168"
        width="640"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.18"
      />

      {/* legs */}
      {[72, 300, 420, 648].map((x) => (
        <rect
          key={x}
          x={x}
          y="172"
          width="9"
          height="48"
          rx="4"
          fill="currentColor"
          opacity="0.5"
        />
      ))}
      <rect
        x="40"
        y="220"
        width="640"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.12"
      />

      {/* carriage */}
      <rect
        x="235"
        y="118"
        width="270"
        height="34"
        rx="14"
        fill="currentColor"
        opacity="0.32"
      />
      <rect
        x="248"
        y="112"
        width="244"
        height="14"
        rx="7"
        fill="currentColor"
        opacity="0.5"
      />

      {/* shoulder rests */}
      <rect
        x="452"
        y="92"
        width="16"
        height="26"
        rx="8"
        fill="currentColor"
        opacity="0.55"
      />
      <rect
        x="486"
        y="92"
        width="16"
        height="26"
        rx="8"
        fill="currentColor"
        opacity="0.55"
      />

      {/* footbar */}
      <path
        d="M170 150 L170 96 Q170 82 186 82 L216 82"
        stroke="currentColor"
        strokeOpacity="0.6"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* headrest ramp */}
      <path
        d="M96 150 L96 112 Q96 100 110 100 L146 100"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* pulley risers + straps */}
      <rect
        x="612"
        y="66"
        width="8"
        height="86"
        rx="4"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M616 74 C 560 84 520 112 498 128"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M616 88 C 566 100 528 122 505 134"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="616" cy="66" r="5" fill="currentColor" opacity="0.7" />

      {/* springs */}
      <path
        d="M212 138 q6 -7 12 0 q6 7 12 0 q6 -7 12 0"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2.2"
        fill="none"
      />
      <path
        d="M212 146 q6 -7 12 0 q6 7 12 0 q6 -7 12 0"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2.2"
        fill="none"
      />

      {/* accent marker, echoing the yellow detail on the real machine */}
      <rect x="205" y="152" width="14" height="7" rx="3" fill="#C9A227" opacity="0.9" />
    </svg>
  );
}

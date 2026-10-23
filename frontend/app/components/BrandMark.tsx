import { useId } from "react";

import { cn } from "~/lib/cn";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  const clipId = `brand-clip-${useId().replace(/:/g, "")}`;
  const bubblePath =
    "M10 8h28a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H24l-9 7v-7h-5a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6Z";

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-[30%] bg-logo shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="size-[72%]" fill="none">
        <defs>
          <clipPath id={clipId}>
            <path d={bubblePath} />
          </clipPath>
        </defs>
        <path d={bubblePath} fill="#fffefa" />
        <g clipPath={`url(#${clipId})`}>
          <rect x="4" y="8" width="13.34" height="34" fill="var(--color-mali-green)" />
          <rect x="17.34" y="8" width="13.33" height="34" fill="var(--color-mali-yellow)" />
          <rect x="30.67" y="8" width="13.33" height="34" fill="var(--color-mali-red)" />
          <path d="M0 48 48 0v10L10 48Z" fill="#ffffff" opacity="0.16" />
        </g>
        <path d={bubblePath} stroke="rgba(14,44,29,0.2)" strokeWidth="1" />
      </svg>
    </span>
  );
}

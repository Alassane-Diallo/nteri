import type { AvatarTone } from "~/features/messaging/types";
import { avatarToneClass, initials, toneFor } from "~/lib/identity";
import { cn } from "~/lib/cn";
import { UsersIcon } from "./icons";

type AvatarSize = "sm" | "md" | "lg" | "xl" | "2xl";

interface AvatarProps {
  name: string;
  tone?: AvatarTone;
  size?: AvatarSize;
  online?: boolean;
  group?: boolean;
  className?: string;
}

const sizeClass: Record<AvatarSize, string> = {
  sm: "size-8 text-[10px]",
  md: "size-10 text-xs",
  lg: "size-12 text-sm",
  xl: "size-16 text-lg",
  "2xl": "size-24 text-2xl",
};

export function Avatar({
  name,
  tone,
  size = "md",
  online = false,
  group = false,
  className,
}: AvatarProps) {
  const resolvedTone = tone ?? toneFor(name);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[0.04em]",
        avatarToneClass[resolvedTone],
        sizeClass[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
      {group && (
        <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border-2 border-surface bg-ink text-surface">
          <UsersIcon className="size-2.5" strokeWidth={2.2} />
        </span>
      )}
      {online && !group && (
        <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-mali-green" />
      )}
    </span>
  );
}

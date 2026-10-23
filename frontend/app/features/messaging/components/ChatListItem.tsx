import { Avatar } from "~/components/Avatar";
import { formatListTime, formatUnreadCount } from "../format";
import type { ChatSummary } from "../types";
import { cn } from "~/lib/cn";

interface ChatListItemProps {
  summary: ChatSummary;
  active: boolean;
  onSelect: () => void;
}

export function ChatListItem({
  summary,
  active,
  onSelect,
}: ChatListItemProps) {
  const { title, preview, unread, lastAt, chat, tone, isOnline } = summary;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors duration-200",
        active ? "bg-selection" : "hover:bg-surface-muted",
      )}
    >
      {active && (
        <span
          className="mali-gradient absolute inset-y-3 left-0 w-1 rounded-full"
          aria-hidden="true"
        />
      )}

      <Avatar
        name={title}
        tone={tone}
        size="lg"
        online={isOnline}
        group={chat.kind === "group"}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14.5px] font-semibold text-ink">
            {title}
          </span>
          <span
            suppressHydrationWarning
            className="shrink-0 text-[10.5px] font-medium text-muted"
          >
            {formatListTime(lastAt)}
          </span>
        </span>

        <span className="mt-1 flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-[12.5px]",
              unread > 0 ? "font-medium text-ink-soft" : "text-muted",
            )}
          >
            {preview}
          </span>
          {unread > 0 && (
            <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-4 text-surface">
              {formatUnreadCount(unread)}
              <span className="sr-only"> messages non lus</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

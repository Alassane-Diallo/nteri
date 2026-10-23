import { Avatar } from "~/components/Avatar";
import { CheckCheckIcon } from "~/components/icons";
import { authorToneClass } from "~/lib/identity";
import { cn } from "~/lib/cn";
import { formatTime } from "../format";
import type { Contact, Message } from "../types";

interface MessageBubbleProps {
  message: Message;
  author?: Contact;
  isOwn: boolean;
  isGroup: boolean;
  showAuthor: boolean;
  showAvatar: boolean;
}

export function MessageBubble({
  message,
  author,
  isOwn,
  isGroup,
  showAuthor,
  showAvatar,
}: MessageBubbleProps) {
  if (message.kind === "system") {
    return (
      <div className="flex justify-center py-2">
        <p className="rounded-full border border-line bg-surface/90 px-3 py-1 text-center text-[10px] font-medium text-muted shadow-sm backdrop-blur">
          {message.body}
        </p>
      </div>
    );
  }

  const tone = author?.tone ?? "green";

  return (
    <div
      className={cn(
        "message-in flex w-full items-end gap-2",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {isGroup &&
        !isOwn &&
        (showAvatar ? (
          <Avatar
            name={author?.name ?? "Membre"}
            tone={tone}
            size="sm"
            className="mb-1"
          />
        ) : (
          <span className="size-8 shrink-0" aria-hidden="true" />
        ))}

      <div
        className={cn(
          "flex min-w-0 max-w-[84%] flex-col md:max-w-[72%]",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {isGroup && !isOwn && showAuthor && (
          <p
            className={cn(
              "mb-1 ml-1 truncate text-[10.5px] font-bold",
              authorToneClass[tone],
            )}
          >
            {author?.name ?? "Membre"}
          </p>
        )}

        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 shadow-bubble",
            isOwn
              ? "bubble-own rounded-br-md"
              : "rounded-bl-md border border-line bg-surface text-ink",
          )}
        >
          <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">
            {message.body}
          </p>

          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[9.5px] font-medium",
              isOwn ? "text-bubble-own-ink/80" : "text-muted",
            )}
          >
            <time dateTime={message.sentAt} suppressHydrationWarning>
              {formatTime(message.sentAt)}
            </time>
            {isOwn && (
              <CheckCheckIcon className="size-3.5" strokeWidth={2.1} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

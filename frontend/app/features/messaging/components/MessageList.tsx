import { useEffect, useMemo, useRef } from "react";

import { Avatar } from "~/components/Avatar";
import { MessageIcon } from "~/components/icons";
import { dayKey, formatDayLabel } from "../format";
import type { Chat, Contact, Message } from "../types";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  chat: Chat;
  messages: Message[];
  contacts: Contact[];
  currentUserId: string;
}

type ConversationItem =
  | { type: "day"; key: string; label: string }
  | {
      type: "message";
      key: string;
      message: Message;
      isOwn: boolean;
      showAuthor: boolean;
      showAvatar: boolean;
    };

export function MessageList({
  chat,
  messages,
  contacts,
  currentUserId,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contactsById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );

  const items = useMemo(() => {
    const result: ConversationItem[] = [];
    let previousDay = "";
    let previousAuthor = "";

    for (const message of messages) {
      const currentDay = dayKey(message.sentAt);

      if (currentDay !== previousDay) {
        result.push({
          type: "day",
          key: `day-${currentDay}`,
          label: formatDayLabel(message.sentAt),
        });
        previousDay = currentDay;
        previousAuthor = "";
      }

      const isSystem = message.kind === "system";
      const isOwn = message.authorId === currentUserId;
      const startsAuthorGroup =
        chat.kind === "group" &&
        !isOwn &&
        !isSystem &&
        previousAuthor !== message.authorId;

      result.push({
        type: "message",
        key: message.id,
        message,
        isOwn,
        showAuthor: startsAuthorGroup,
        showAvatar: startsAuthorGroup,
      });

      previousAuthor = isSystem ? "" : message.authorId;
    }

    return result;
  }, [chat.kind, messages, currentUserId]);

  useEffect(() => {
    const container = scrollRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chat.id, messages.length]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={`Messages de ${chat.name}`}
      className="chat-pattern scrollbar-slim min-h-0 flex-1 overflow-y-auto"
    >
      {items.length > 0 ? (
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-2 px-4 py-5 md:px-8 md:py-7">
          {items.map((item) => {
            if (item.type === "day") {
              return (
                <div
                  key={item.key}
                  className="my-2 flex items-center justify-center"
                >
                  <span
                    suppressHydrationWarning
                    className="rounded-full border border-line bg-surface/90 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted shadow-sm backdrop-blur"
                  >
                    {item.label}
                  </span>
                </div>
              );
            }

            return (
              <MessageBubble
                key={item.key}
                message={item.message}
                author={contactsById.get(item.message.authorId)}
                isOwn={item.isOwn}
                isGroup={chat.kind === "group"}
                showAuthor={item.showAuthor}
                showAvatar={item.showAvatar}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface text-muted shadow-sm">
            <MessageIcon className="size-6" />
          </span>
          <p className="mt-4 font-display text-base font-semibold text-ink">
            Aucun message
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            Envoyez le premier message pour lancer la conversation.
          </p>
        </div>
      )}
    </div>
  );
}

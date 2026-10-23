import { Avatar } from "~/components/Avatar";
import { ArrowLeftIcon, UsersIcon } from "~/components/icons";
import { formatMemberCount } from "../format";
import type { Chat, Contact } from "../types";

interface ChatHeaderProps {
  chat: Chat;
  contact?: Contact;
  contacts: Contact[];
  currentUserId: string;
  onBack: () => void;
}

function groupSubtitle(
  chat: Chat,
  contacts: Contact[],
  currentUserId: string,
): string {
  const names = chat.memberIds
    .filter((memberId) => memberId !== currentUserId)
    .map(
      (memberId) =>
        contacts.find((contact) => contact.id === memberId)?.name.split(" ")[0],
    )
    .filter((name): name is string => Boolean(name));

  const summary = names.slice(0, 3).join(", ");
  const suffix = names.length > 3 ? "…" : "";

  return summary
    ? `${formatMemberCount(chat.memberIds.length)} · ${summary}${suffix}`
    : formatMemberCount(chat.memberIds.length);
}

export function ChatHeader({
  chat,
  contact,
  contacts,
  currentUserId,
  onBack,
}: ChatHeaderProps) {
  const title = chat.kind === "direct" ? (contact?.name ?? chat.name) : chat.name;
  const isOnline =
    chat.kind === "direct" && contact?.presence === "En ligne";
  const subtitle =
    chat.kind === "group"
      ? groupSubtitle(chat, contacts, currentUserId)
      : (contact?.presence ?? "Contact");

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-3 py-2.5 backdrop-blur md:px-5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Retour aux discussions"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink md:hidden"
      >
        <ArrowLeftIcon className="size-5" />
      </button>

      <Avatar
        name={title}
        tone={contact?.tone}
        size="md"
        group={chat.kind === "group"}
        online={isOnline}
      />

      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-[15px] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] font-medium text-muted">
          {isOnline && (
            <span className="size-1.5 shrink-0 rounded-full bg-mali-green" />
          )}
          {subtitle}
        </p>
      </div>

      {chat.kind === "group" && (
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface-muted px-2.5 py-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-soft sm:inline-flex">
          <UsersIcon className="size-3.5" />
          Groupe
        </span>
      )}
    </header>
  );
}

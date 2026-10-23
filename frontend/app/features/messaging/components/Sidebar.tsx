import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "~/components/Avatar";
import { BrandMark } from "~/components/BrandMark";
import { IconButton } from "~/components/IconButton";
import {
  LogOutIcon,
  MessageIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "~/components/icons";
import { normalizeText } from "~/lib/identity";
import { cn } from "~/lib/cn";
import { ChatListItem } from "./ChatListItem";
import type { ChatSummary, Contact } from "../types";

type ChatFilter = "all" | "unread" | "groups";
type SocketState = "connecting" | "online" | "offline";

interface SidebarProps {
  summaries: ChatSummary[];
  currentUser: Contact;
  activeChatId: string | null;
  socketStatus: SocketState;
  busy: boolean;
  onSelectChat: (chatId: string) => void;
  onCreateDiscussion: () => void;
  onCreateGroup: () => void;
  onLogout: () => void;
  className?: string;
}

const FILTERS: Array<{ id: ChatFilter; label: string }> = [
  { id: "all", label: "Toutes" },
  { id: "unread", label: "Non lues" },
  { id: "groups", label: "Groupes" },
];

function matchesFilter(summary: ChatSummary, filter: ChatFilter): boolean {
  if (filter === "unread") return summary.unread > 0;
  if (filter === "groups") return summary.chat.kind === "group";

  return true;
}

function filterCount(summaries: ChatSummary[], filter: ChatFilter): number {
  return summaries.filter((summary) => matchesFilter(summary, filter)).length;
}

export function Sidebar({
  summaries,
  currentUser,
  activeChatId,
  socketStatus,
  busy,
  onSelectChat,
  onCreateDiscussion,
  onCreateGroup,
  onLogout,
  className,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeText(query);

  useEffect(() => {
    if (!newMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!newMenuRef.current?.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [newMenuOpen]);

  const visibleChats = useMemo(
    () =>
      summaries.filter((summary) => {
        const matchesSearch =
          normalizedQuery.length === 0 ||
          normalizeText(summary.title).includes(normalizedQuery) ||
          normalizeText(summary.preview).includes(normalizedQuery);

        return matchesSearch && matchesFilter(summary, filter);
      }),
    [summaries, filter, normalizedQuery],
  );

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
  };

  return (
    <aside
      aria-label="Liste des discussions"
      className={cn(
        "h-full min-h-0 w-full shrink-0 flex-col border-line bg-surface md:w-[380px] md:border-r xl:w-[420px]",
        className,
      )}
    >
      <header className="shrink-0 px-4 pb-4 pt-5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-11" />
            <div className="min-w-0">
              <p className="font-display text-[20px] font-semibold leading-none tracking-[-0.04em] text-ink">
                N’Teri
              </p>
              <p className="mt-1.5 hidden truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-muted min-[360px]:block">
                Messagerie malienne
              </p>
            </div>
          </div>

          <div ref={newMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setNewMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={newMenuOpen}
              className="button-brand inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-[12px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.97]"
            >
              <PlusIcon className="size-4" />
              Nouveau
            </button>

            {newMenuOpen && (
              <div
                role="menu"
                aria-label="Créer une conversation"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-64 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    onCreateDiscussion();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-tone-green text-tone-green-ink"
                    aria-hidden="true"
                  >
                    <MessageIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-ink">
                      Nouvelle discussion
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted">
                      Avec une personne
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    onCreateGroup();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-tone-yellow text-tone-yellow-ink"
                    aria-hidden="true"
                  >
                    <UsersIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-ink">
                      Nouveau groupe
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted">
                      Avec plusieurs personnes
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface-muted px-3 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <SearchIcon className="size-4 shrink-0 text-muted" />
          <label htmlFor="chat-search" className="sr-only">
            Rechercher une discussion
          </label>
          <input
            id="chat-search"
            type="text"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une discussion"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-line/70 hover:text-ink"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>

        <div
          role="group"
          aria-label="Filtrer les discussions"
          className="mt-3 flex items-center gap-1 rounded-2xl bg-surface-muted p-1"
        >
          {FILTERS.map((item) => {
            const active = filter === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={active}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[11.5px] font-semibold transition-all duration-200",
                  active
                    ? "bg-surface text-ink shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "text-[9.5px] font-bold",
                    active ? "text-brand" : "text-muted",
                  )}
                >
                  {filterCount(summaries, item.id)}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visibleChats.length > 0 ? (
          <ul aria-label="Conversations" className="space-y-1">
            {visibleChats.map((summary) => (
              <li key={summary.chat.id}>
                <ChatListItem
                  summary={summary}
                  active={summary.chat.id === activeChatId}
                  onSelect={() => onSelectChat(summary.chat.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-8 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-surface-muted text-muted">
              <SearchIcon className="size-5" />
            </span>
            <p className="mt-4 text-sm font-semibold text-ink">
              Aucune discussion
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Essayez un autre nom ou affichez toutes les conversations.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 text-xs font-semibold text-brand transition hover:text-brand-deep hover:underline"
            >
              Tout afficher
            </button>
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-line px-4 py-3">
        <div className="flex items-center gap-3 rounded-2xl bg-surface-muted px-3 py-2.5">
          <Avatar
            name={currentUser.name}
            tone={currentUser.tone}
            size="md"
            online={socketStatus === "online"}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-ink">
              {currentUser.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-muted">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  socketStatus === "online"
                    ? "bg-mali-green"
                    : socketStatus === "connecting"
                      ? "bg-mali-yellow"
                      : "bg-muted",
                )}
                aria-hidden="true"
              />
              {socketStatus === "online"
                ? "Temps réel activé"
                : socketStatus === "connecting"
                  ? "Connexion en cours…"
                  : "Hors ligne"}
            </p>
          </div>
          <IconButton
            label="Se déconnecter"
            onClick={onLogout}
            disabled={busy}
            className="-mr-1"
          >
            <LogOutIcon className="size-4" />
          </IconButton>
        </div>
      </footer>
    </aside>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";

import { Avatar } from "~/components/Avatar";
import { IconButton } from "~/components/IconButton";
import { CheckIcon, MessageIcon, SearchIcon, XIcon } from "~/components/icons";
import { cn } from "~/lib/cn";
import { normalizeText } from "~/lib/identity";
import type { Contact } from "../types";

interface CreateDiscussionDialogProps {
  open: boolean;
  contacts: Contact[];
  currentUserId: string;
  onClose: () => void;
  onCreate: (contactId: string) => Promise<boolean> | boolean;
}

export function CreateDiscussionDialog({
  open,
  contacts,
  currentUserId,
  onClose,
  onCreate,
}: CreateDiscussionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchInputId = useId();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const availableContacts = useMemo(
    () => contacts.filter((contact) => contact.id !== currentUserId),
    [contacts, currentUserId],
  );

  const visibleContacts = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    if (!normalizedQuery) {
      return availableContacts;
    }

    return availableContacts.filter(
      (contact) =>
        normalizeText(contact.name).includes(normalizedQuery) ||
        normalizeText(contact.phone).includes(normalizedQuery),
    );
  }, [availableContacts, query]);

  const selectedContact =
    availableContacts.find((contact) => contact.id === selectedId) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      setQuery("");
      setSelectedId(null);
      setSubmitting(false);
      dialog.showModal();
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedId || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await onCreate(selectedId);
      if (created) {
        dialogRef.current?.close();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      dialogRef.current?.close();
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-labelledby={titleId}
      className="nteri-dialog dialog-in m-auto max-h-[90dvh] w-[94vw] max-w-[560px] overflow-hidden rounded-[28px] border border-line bg-surface p-0 text-ink shadow-pop"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[90dvh] flex-col">
        <header className="shrink-0 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
                N’Teri · Discussions
              </p>
              <h2
                id={titleId}
                className="mt-1 font-display text-[22px] font-semibold tracking-[-0.035em] text-ink"
              >
                Nouvelle discussion
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Choisissez une personne avec qui échanger en privé.
              </p>
            </div>

            <IconButton
              label="Fermer"
              onClick={() => dialogRef.current?.close()}
              className="-mr-1 -mt-1"
            >
              <XIcon className="size-5" />
            </IconButton>
          </div>

          <div className="mt-4 flex h-11 items-center gap-2 rounded-2xl border border-line bg-surface-muted px-3 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
            <SearchIcon className="size-4 shrink-0 text-muted" />
            <label htmlFor={searchInputId} className="sr-only">
              Rechercher un contact
            </label>
            <input
              ref={searchInputRef}
              id={searchInputId}
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Rechercher une personne"
              className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
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
        </header>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-2 sm:px-3">
          <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
            Contacts · {availableContacts.length}
          </p>

          {visibleContacts.length > 0 ? (
            <ul
              role="radiogroup"
              aria-label="Choisir un contact"
              className="space-y-0.5"
            >
              {visibleContacts.map((contact) => {
                const selected = contact.id === selectedId;

                return (
                  <li key={contact.id} role="presentation">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedId(contact.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        selected ? "bg-surface-muted" : "hover:bg-surface-muted",
                      )}
                    >
                      <Avatar
                        name={contact.name}
                        tone={contact.tone}
                        size="md"
                        online={contact.presence === "En ligne"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-ink">
                          {contact.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                          {contact.phone || "Compte N’Teri"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150",
                          selected
                            ? "border-brand bg-brand text-surface"
                            : "border-line-strong text-transparent",
                        )}
                        aria-hidden="true"
                      >
                        <CheckIcon className="size-3" strokeWidth={2.4} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <MessageIcon className="size-5 text-muted" />
              <p className="mt-3 text-[12.5px] font-semibold text-ink">
                {availableContacts.length === 0
                  ? "Aucun contact disponible"
                  : "Aucun contact trouvé"}
              </p>
              <p className="mt-1 text-[10.5px] text-muted">
                {availableContacts.length === 0
                  ? "Créez un autre compte pour pouvoir démarrer une discussion."
                  : "Essayez un autre nom ou un autre numéro."}
              </p>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="truncate text-[10px] leading-relaxed text-muted">
              {selectedContact
                ? `Discussion avec ${selectedContact.name}`
                : "Sélectionnez une personne."}
            </p>

            <div className="flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="inline-flex h-11 items-center justify-center rounded-full px-4 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!selectedId || submitting}
                className="button-brand inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[12px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
              >
                <MessageIcon className="size-4" />
                {submitting ? "Ouverture…" : "Discuter"}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

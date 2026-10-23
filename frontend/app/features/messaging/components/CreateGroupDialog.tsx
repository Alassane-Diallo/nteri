import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";

import { Avatar } from "~/components/Avatar";
import { IconButton } from "~/components/IconButton";
import { CheckIcon, SearchIcon, UsersIcon, XIcon } from "~/components/icons";
import { normalizeText } from "~/lib/identity";
import { cn } from "~/lib/cn";
import type { Contact } from "../types";

interface CreateGroupDialogProps {
  open: boolean;
  contacts: Contact[];
  currentUserId: string;
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => Promise<boolean> | boolean;
}

export function CreateGroupDialog({
  open,
  contacts,
  currentUserId,
  onClose,
  onCreate,
}: CreateGroupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const nameInputId = useId();
  const searchInputId = useId();

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const canCreate = name.trim().length >= 2 && selectedIds.size >= 2;
  const nameTooShort = name.length > 0 && name.trim().length < 2;
  const totalMembers = selectedIds.size + 1;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      setName("");
      setQuery("");
      setSelectedIds(new Set());
      setSubmitting(false);
      dialog.showModal();
      requestAnimationFrame(() => nameInputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const toggleMember = (contactId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }

      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canCreate || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await onCreate(name.trim(), Array.from(selectedIds));
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
                N’Teri · Groupes
              </p>
              <h2
                id={titleId}
                className="mt-1 font-display text-[22px] font-semibold tracking-[-0.035em] text-ink"
              >
                Créer un groupe
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Réunissez vos proches en un seul endroit.
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

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-muted p-3">
            {name.trim() ? (
              <Avatar name={name} size="lg" group />
            ) : (
              <span
                className="grid size-12 shrink-0 place-items-center rounded-full bg-tone-green text-tone-green-ink"
                aria-hidden="true"
              >
                <UsersIcon className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">
                {name.trim() || "Nom du groupe"}
              </p>
              <p className="mt-0.5 text-[10.5px] text-muted">
                {selectedIds.size === 0
                  ? "Choisissez au moins 2 personnes"
                  : `${totalMembers} membres avec vous`}
              </p>
            </div>
          </div>

          <label
            htmlFor={nameInputId}
            className="mt-4 block text-[11px] font-semibold text-ink-soft"
          >
            Nom du groupe
          </label>
          <input
            ref={nameInputRef}
            id={nameInputId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Ex. Les amis du quartier"
            aria-invalid={nameTooShort}
            className={cn(
              "mt-1.5 h-11 w-full rounded-2xl border bg-surface-muted px-3.5 text-[13px] text-ink transition placeholder:text-muted focus:outline-none focus:ring-2",
              nameTooShort
                ? "border-danger focus:border-danger focus:ring-danger/15"
                : "border-line focus:border-brand focus:ring-brand/15",
            )}
          />
          <p className="mt-1 flex items-center justify-between gap-3 text-[10px]">
            <span className={nameTooShort ? "text-danger" : "text-muted"}>
              {nameTooShort
                ? "Le nom doit contenir au moins 2 caractères."
                : "Un nom clair aide tout le monde."}
            </span>
            <span className="shrink-0 text-muted">{name.length}/40</span>
          </p>

          <div className="mt-3 flex h-11 items-center gap-2 rounded-2xl border border-line bg-surface-muted px-3 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
            <SearchIcon className="size-4 shrink-0 text-muted" />
            <label htmlFor={searchInputId} className="sr-only">
              Rechercher un membre
            </label>
            <input
              id={searchInputId}
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Rechercher un membre"
              className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
            />
          </div>
        </header>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-2 sm:px-3">
          <p className="px-2 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
            Membres · {selectedIds.size} sélectionné
            {selectedIds.size > 1 ? "s" : ""}
          </p>

          {visibleContacts.length > 0 ? (
            <ul className="space-y-0.5">
              {visibleContacts.map((contact) => {
                const selected = selectedIds.has(contact.id);

                return (
                  <li key={contact.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors duration-150",
                        selected ? "bg-surface-muted" : "hover:bg-surface-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMember(contact.id)}
                        className="sr-only"
                      />
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
                          {contact.phone}
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
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <SearchIcon className="size-5 text-muted" />
              <p className="mt-3 text-[12.5px] font-semibold text-ink">
                Aucun membre trouvé
              </p>
              <p className="mt-1 text-[10.5px] text-muted">
                Essayez un autre nom.
              </p>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] leading-relaxed text-muted">
              {selectedIds.size < 2
                ? "Sélectionnez au moins 2 personnes."
                : `${selectedIds.size} personne${selectedIds.size > 1 ? "s" : ""} sélectionnée${selectedIds.size > 1 ? "s" : ""}`}
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="inline-flex h-11 items-center justify-center rounded-full px-4 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!canCreate || submitting}
                className="button-brand inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[12px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.98] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
              >
                <UsersIcon className="size-4" />
                {submitting ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

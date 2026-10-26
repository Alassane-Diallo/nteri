import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

import { Avatar } from "~/components/Avatar";
import { IconButton } from "~/components/IconButton";
import {
  LoaderIcon,
  MessageIcon,
  SearchIcon,
  TrashIcon,
  UserPlusIcon,
  XIcon,
} from "~/components/icons";
import { normalizeText } from "~/lib/identity";
import { cn } from "~/lib/cn";
import type { Contact } from "../types";

interface ContactsDialogProps {
  open: boolean;
  contacts: Contact[];
  onClose: () => void;
  onAdd: (phone: string, name: string) => Promise<Contact | null>;
  onRemove: (contactId: string) => Promise<boolean>;
  onStartChat: (contactId: string) => Promise<boolean>;
}

export function ContactsDialog({
  open,
  contacts,
  onClose,
  onAdd,
  onRemove,
  onStartChat,
}: ContactsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchId = useId();
  const phoneId = useId();
  const nameId = useId();

  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const visibleContacts = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) {
      return contacts;
    }

    return contacts.filter(
      (contact) =>
        normalizeText(contact.name).includes(normalizedQuery) ||
        normalizeText(contact.phone).includes(normalizedQuery),
    );
  }, [contacts, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      setQuery("");
      setShowForm(false);
      setPhone("");
      setName("");
      setSubmitting(false);
      setStartingId(null);
      setRemovingId(null);
      setLocalError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (showForm) {
      requestAnimationFrame(() => phoneInputRef.current?.focus());
    }
  }, [showForm]);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      dialogRef.current?.close();
    }
  };

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      setLocalError("Indiquez un numéro de téléphone valide.");
      return;
    }

    setSubmitting(true);
    try {
      const contact = await onAdd(phone.trim(), name.trim());
      if (contact) {
        setShowForm(false);
        setPhone("");
        setName("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartChat = async (contactId: string) => {
    setLocalError(null);
    setStartingId(contactId);
    try {
      const opened = await onStartChat(contactId);
      if (opened) {
        dialogRef.current?.close();
      }
    } finally {
      setStartingId(null);
    }
  };

  const handleRemove = async (contact: Contact) => {
    const confirmed = window.confirm(
      `Retirer ${contact.name} de votre carnet ? Les conversations existantes restent accessibles.`,
    );
    if (!confirmed) {
      return;
    }

    setLocalError(null);
    setRemovingId(contact.id);
    try {
      await onRemove(contact.id);
    } finally {
      setRemovingId(null);
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
      <div className="flex max-h-[90dvh] flex-col">
        <header className="shrink-0 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
                N’Teri · Contacts
              </p>
              <h2
                id={titleId}
                className="mt-1 font-display text-[22px] font-semibold tracking-[-0.035em] text-ink"
              >
                Mon carnet
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Vos contacts sont privés. Ajoutez un numéro, puis discutez.
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
            <label htmlFor={searchId} className="sr-only">
              Rechercher un contact
            </label>
            <input
              id={searchId}
              type="text"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un contact"
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

          {showForm ? (
            <form
              onSubmit={handleAdd}
              className="mt-3 rounded-2xl border border-line bg-surface-muted p-3"
            >
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label htmlFor={phoneId} className="block text-[10.5px] font-semibold text-ink-soft">
                    Numéro de téléphone
                  </label>
                  <input
                    ref={phoneInputRef}
                    id={phoneId}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+223 76 12 34 56"
                    className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[12px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                </div>
                <div>
                  <label htmlFor={nameId} className="block text-[10.5px] font-semibold text-ink-soft">
                    Nom (facultatif)
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ex. Awa Traoré"
                    className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[12px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                </div>
              </div>

              {localError && (
                <p className="mt-2 text-[10.5px] font-medium text-danger" role="alert">
                  {localError}
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setLocalError(null);
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-full px-3 text-[11.5px] font-semibold text-ink-soft transition hover:bg-surface hover:text-ink"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="button-brand inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[11.5px] font-semibold shadow-sm transition hover:brightness-110 disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
                >
                  {submitting && <LoaderIcon className="size-3.5 animate-spin" />}
                  {submitting ? "Ajout…" : "Ajouter"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-[11.5px] font-semibold text-ink-soft transition hover:bg-surface-muted hover:text-ink"
            >
              <UserPlusIcon className="size-4" />
              Ajouter un contact
            </button>
          )}
        </header>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-2 sm:px-3">
          {visibleContacts.length > 0 ? (
            <ul aria-label="Mes contacts" className="space-y-0.5">
              {visibleContacts.map((contact) => {
                const starting = startingId === contact.id;

                return (
                  <li key={contact.id}>
                    <div className="flex items-center gap-1 rounded-2xl transition-colors duration-150 hover:bg-surface-muted">
                      <button
                        type="button"
                        onClick={() => void handleStartChat(contact.id)}
                        disabled={startingId !== null || removingId !== null}
                        aria-label={`Discuter avec ${contact.name}`}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left disabled:opacity-60"
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
                            {contact.phone}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-full",
                            starting
                              ? "bg-brand-soft text-brand"
                              : "bg-surface-muted text-muted",
                          )}
                          aria-hidden="true"
                        >
                          {starting ? (
                            <LoaderIcon className="size-4 animate-spin" />
                          ) : (
                            <MessageIcon className="size-4" />
                          )}
                        </span>
                      </button>
                      <IconButton
                        label={`Retirer ${contact.name} de mes contacts`}
                        disabled={startingId !== null || removingId !== null}
                        onClick={() => void handleRemove(contact)}
                        className="mr-1 text-muted hover:bg-danger/10 hover:text-danger"
                      >
                        {removingId === contact.id ? (
                          <LoaderIcon className="size-4 animate-spin" />
                        ) : (
                          <TrashIcon className="size-4" />
                        )}
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <UserPlusIcon className="size-6 text-muted" />
              <p className="mt-3 text-[12.5px] font-semibold text-ink">
                {query ? "Aucun contact trouvé" : "Votre carnet est vide"}
              </p>
              <p className="mt-1 max-w-xs text-[10.5px] leading-relaxed text-muted">
                {query
                  ? "Essayez un autre nom ou numéro."
                  : "Ajoutez le numéro d’une personne qui utilise déjà N’Teri pour commencer."}
              </p>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-5 py-3.5 sm:px-6">
          <p className="text-[10px] leading-relaxed text-muted">
            Un contact enregistré ici n’apparaît que dans votre carnet. Il ne
            voit pas les autres personnes que vous avez ajoutées.
          </p>
        </footer>
      </div>
    </dialog>
  );
}

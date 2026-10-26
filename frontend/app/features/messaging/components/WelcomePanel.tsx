import { BrandMark } from "~/components/BrandMark";
import { LockIcon, PlusIcon, UserPlusIcon } from "~/components/icons";

interface WelcomePanelProps {
  onCreateGroup: () => void;
  onOpenContacts: () => void;
}

export function WelcomePanel({
  onCreateGroup,
  onOpenContacts,
}: WelcomePanelProps) {
  return (
    <section
      aria-label="Bienvenue sur N’Teri"
      className="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface"
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 top-8 size-80 rounded-full bg-mali-green/10 blur-3xl" />
        <div className="absolute right-[-5rem] top-1/3 size-72 rounded-full bg-mali-yellow/15 blur-3xl" />
        <div className="absolute bottom-[-7rem] left-1/3 size-80 rounded-full bg-mali-red/10 blur-3xl" />
        <div className="chat-pattern absolute inset-0 opacity-30" />
      </div>

      <div className="fade-up relative z-10 mx-auto flex max-w-xl flex-col items-center px-6 py-10 text-center">
        <div className="mali-gradient rounded-[36px] p-[3px] shadow-pop">
          <div className="rounded-[33px] bg-surface p-5">
            <BrandMark className="size-20" />
          </div>
        </div>

        <p className="mt-8 text-[9.5px] font-bold uppercase tracking-[0.26em] text-brand">
          Messagerie malienne
        </p>

        <h1 className="mt-3 font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.045em] text-ink sm:text-[38px]">
          Vos contacts,
          <br />
          vos conversations.
        </h1>

        <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
          Ouvrez votre carnet privé pour retrouver vos proches, ou créez un
          groupe avec les personnes que vous avez déjà enregistrées.
        </p>

        <div className="mt-7 flex flex-col items-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onOpenContacts}
            className="button-brand inline-flex h-12 items-center gap-2 rounded-full px-5 text-[13px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.98]"
          >
            <UserPlusIcon className="size-4" />
            Ouvrir mes contacts
          </button>
          <button
            type="button"
            onClick={onCreateGroup}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-5 text-[13px] font-semibold text-ink-soft shadow-sm transition duration-200 hover:bg-surface-muted hover:text-ink active:scale-[0.98]"
          >
            <PlusIcon className="size-4" />
            Créer un groupe
          </button>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-[10px] font-medium text-muted">
          <LockIcon className="size-3.5" />
          Carnet de contacts privé et session sécurisée
        </div>

        <div className="mt-10 flex items-center gap-2">
          <span className="mali-gradient h-1.5 w-10 rounded-full" aria-hidden="true" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted">
            Aux couleurs du Mali
          </span>
        </div>
      </div>
    </section>
  );
}

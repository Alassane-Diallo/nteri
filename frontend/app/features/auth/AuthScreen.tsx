import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "~/components/BrandMark";
import {
  CheckIcon,
  KeyIcon,
  LoaderIcon,
  LockIcon,
  PhoneIcon,
  UsersIcon,
} from "~/components/icons";
import { cn } from "~/lib/cn";
import type {
  OtpRequestResponse,
  OtpVerifyPayload,
} from "../messaging/api";

type Step = "phone" | "code";
type VerifyResult = "authenticated" | "requires-name" | "error";

interface AuthScreenProps {
  busy: boolean;
  error: string | null;
  needsName: boolean;
  onRequestOtp: (phone: string) => Promise<OtpRequestResponse | null>;
  onVerifyOtp: (payload: OtpVerifyPayload) => Promise<VerifyResult>;
}

const fieldClass =
  "mt-1.5 h-11 w-full rounded-2xl border border-line bg-surface-muted px-3.5 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15";

const labelClass = "block text-[11px] font-semibold text-ink-soft";

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  return digits.length >= 8 && digits.length <= 15;
}

export function AuthScreen({
  busy,
  error,
  needsName,
  onRequestOtp,
  onVerifyOtp,
}: AuthScreenProps) {
  const [step, setStep] = useState<Step>("phone");
  const [localError, setLocalError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (step !== "code" || secondsLeft <= 0) {
      return;
    }

    const timer = window.setTimeout(
      () => setSecondsLeft((current) => Math.max(0, current - 1)),
      1000,
    );

    return () => window.clearTimeout(timer);
  }, [secondsLeft, step]);

  const requestCode = async (): Promise<void> => {
    setLocalError(null);
    if (!validPhone(phone)) {
      setLocalError("Indiquez un numéro de téléphone valide.");
      return;
    }

    const response = await onRequestOtp(phone.trim());
    if (!response) {
      return;
    }

    setStep("code");
    setCode("");
    setName("");
    setDevCode(response.devCode ?? null);
    setSecondsLeft(response.expiresIn);
  };

  const handlePhoneSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await requestCode();
  };

  const handleCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!/^\d{6}$/.test(code)) {
      setLocalError("Saisissez les 6 chiffres du code reçu.");
      return;
    }
    if (needsName && name.trim().length < 2) {
      setLocalError("Indiquez votre nom complet pour créer votre compte.");
      return;
    }

    await onVerifyOtp({
      phone: phone.trim(),
      code,
      ...(name.trim() ? { name: name.trim() } : {}),
    });
  };

  const displayedError = localError ?? error;
  const expired = step === "code" && secondsLeft === 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <main className="page-pattern grid min-h-dvh place-items-center px-4 py-8 text-ink sm:px-6">
      <div className="w-full max-w-[980px] overflow-hidden rounded-[30px] border border-line bg-surface shadow-frame md:grid md:grid-cols-[1.02fr_0.98fr]">
        <aside className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-ink p-10 text-canvas md:flex">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -left-16 -top-16 size-72 rounded-full bg-mali-green/20 blur-3xl" />
            <div className="absolute -right-16 top-1/3 size-72 rounded-full bg-mali-yellow/15 blur-3xl" />
            <div className="absolute -bottom-20 left-1/3 size-72 rounded-full bg-mali-red/15 blur-3xl" />
          </div>

          <div className="fade-up relative z-10">
            <div className="flex items-center gap-3">
              <BrandMark className="size-12" />
              <div>
                <p className="font-display text-[21px] font-semibold leading-none tracking-[-0.04em]">
                  N’Teri
                </p>
                <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-canvas/60">
                  Messagerie malienne
                </p>
              </div>
            </div>

            <h1 className="mt-14 font-display text-[38px] font-semibold leading-[1.05] tracking-[-0.05em]">
              Vos contacts.
              <br />
              Votre conversation.
            </h1>
            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-canvas/70">
              Connectez-vous avec votre numéro de téléphone. Votre carnet de
              contacts reste privé, même lorsque vous discutez avec plusieurs
              personnes.
            </p>

            <ul className="mt-9 space-y-3.5 text-[12.5px] text-canvas/80">
              <li className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-canvas/10">
                  <PhoneIcon className="size-4" />
                </span>
                Connexion par téléphone et code SMS
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-canvas/10">
                  <UsersIcon className="size-4" />
                </span>
                Un carnet de contacts personnel
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-canvas/10">
                  <CheckIcon className="size-4" />
                </span>
                Messages et groupes synchronisés
              </li>
            </ul>
          </div>

          <div className="relative z-10 flex items-center gap-2">
            <span
              className="mali-gradient h-1.5 w-12 rounded-full"
              aria-hidden="true"
            />
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-canvas/55">
              Aux couleurs du Mali
            </span>
          </div>
        </aside>

        <section className="flex flex-col justify-center p-6 sm:p-10">
          <div className="mb-8 flex items-center gap-3 md:hidden">
            <BrandMark className="size-11" />
            <div>
              <p className="font-display text-[20px] font-semibold leading-none tracking-[-0.04em]">
                N’Teri
              </p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">
                Messagerie malienne
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[11px] font-bold",
                step === "phone"
                  ? "bg-brand text-surface"
                  : "bg-brand-soft text-brand",
              )}
            >
              {step === "phone" ? "1" : <CheckIcon className="size-3.5" />}
            </span>
            <span
              className={cn(
                "h-px flex-1",
                step === "code" ? "bg-brand/40" : "bg-line",
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[11px] font-bold",
                step === "code"
                  ? "bg-brand text-surface"
                  : "bg-surface-muted text-muted",
              )}
            >
              2
            </span>
          </div>

          <div className="mt-7">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
              N’Teri · Accès
            </p>
            <h2 className="mt-1 font-display text-[25px] font-semibold tracking-[-0.04em] text-ink">
              {step === "phone"
                ? "Connexion par téléphone"
                : "Vérifiez votre numéro"}
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              {step === "phone"
                ? "Entrez votre numéro. Nous vous envoyons un code à usage unique par SMS."
                : `Saisissez le code envoyé au ${phone.trim()}.`}
            </p>
          </div>

          {displayedError && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-danger/25 bg-danger-soft px-3.5 py-3 text-[11.5px] font-medium leading-relaxed text-danger"
            >
              {displayedError}
            </div>
          )}

          {step === "phone" ? (
            <form className="mt-5 space-y-4" onSubmit={handlePhoneSubmit} noValidate>
              <div>
                <label htmlFor="login-phone" className={labelClass}>
                  Numéro de téléphone
                </label>
                <input
                  id="login-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+223 76 12 34 56"
                  className={fieldClass}
                  autoFocus
                />
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                  Utilisez le numéro associé à votre compte N’Teri.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="button-brand mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.99] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
              >
                {busy ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <PhoneIcon className="size-4" />
                )}
                {busy ? "Envoi…" : "Recevoir mon code"}
              </button>
            </form>
          ) : (
            <form className="mt-5 space-y-4" onSubmit={handleCodeSubmit} noValidate>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="login-code" className={labelClass}>
                    Code à 6 chiffres
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setCode("");
                      setName("");
                      setLocalError(null);
                    }}
                    className="text-[10.5px] font-semibold text-brand transition hover:text-brand-deep hover:underline"
                  >
                    Modifier le numéro
                  </button>
                </div>
                <input
                  id="login-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  className={cn(fieldClass, "tracking-[0.35em]")}
                  autoFocus
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted">
                  <KeyIcon className="size-3.5" />
                  {expired
                    ? "Le code a expiré. Demandez-en un nouveau."
                    : `Code valable encore ${minutes}:${seconds}.`}
                </p>
              </div>

              {needsName && (
                <div>
                  <label htmlFor="login-name" className={labelClass}>
                    Votre nom complet
                  </label>
                  <input
                    id="login-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ex. Awa Traoré"
                    className={fieldClass}
                    autoFocus
                  />
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                    Ce numéro n’a pas encore de compte. Votre nom servira à
                    créer votre profil N’Teri.
                  </p>
                </div>
              )}

              {devCode && (
                <p className="rounded-2xl border border-brand/20 bg-brand-soft px-3.5 py-2.5 text-[10.5px] leading-relaxed text-brand-ink">
                  Mode développement : votre code est{" "}
                  <span className="font-bold tracking-[0.18em]">{devCode}</span>
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void requestCode()}
                  disabled={busy}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-line bg-surface px-4 text-[12px] font-semibold text-ink-soft transition hover:bg-surface-muted hover:text-ink disabled:text-muted"
                >
                  Renvoyer le code
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="button-brand inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.99] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
                >
                  {busy && <LoaderIcon className="size-4 animate-spin" />}
                  {busy ? "Vérification…" : "Vérifier et continuer"}
                </button>
              </div>
            </form>
          )}

          <p className="mt-5 flex items-start gap-2 text-[10px] leading-relaxed text-muted">
            <LockIcon className="mt-0.5 size-3.5 shrink-0" />
            Votre carnet de contacts est privé. Personne d’autre ne peut voir
            les personnes que vous avez enregistrées.
          </p>

          {import.meta.env.DEV && (
            <p className="mt-4 rounded-2xl bg-surface-muted px-3.5 py-2.5 text-[10.5px] leading-relaxed text-muted">
              Démo :{" "}
              <span className="font-semibold text-ink">+223 76 12 34 56</span>.
              Le code s’affiche après la demande en mode développement.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "~/components/BrandMark";
import {
  CheckIcon,
  KeyIcon,
  LoaderIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  UsersIcon,
} from "~/components/icons";
import { cn } from "~/lib/cn";
import type {
  OtpRequestResponse,
  OtpVerifyPayload,
} from "../messaging/api";

type Step = "phone" | "email" | "code";
type VerifyResult = "authenticated" | "requires-name" | "error";

interface AuthScreenProps {
  busy: boolean;
  error: string | null;
  onRequestOtp: (
    phone: string,
    email: string,
  ) => Promise<OtpRequestResponse | null>;
  onVerifyOtp: (payload: OtpVerifyPayload) => Promise<VerifyResult>;
}

const fieldClass =
  "mt-1.5 h-11 w-full rounded-2xl border border-line bg-surface-muted px-3.5 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15";

const labelClass = "block text-[11px] font-semibold text-ink-soft";

function validPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");

  return digits.length >= 8 && digits.length <= 15;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AuthScreen({
  busy,
  error,
  onRequestOtp,
  onVerifyOtp,
}: AuthScreenProps) {
  const [step, setStep] = useState<Step>("phone");
  const [localError, setLocalError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [needsName, setNeedsName] = useState(false);
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

  const sendCode = async (): Promise<boolean> => {
    setLocalError(null);
    if (!validPhone(phone)) {
      setStep("phone");
      setLocalError("Indiquez un numéro de téléphone valide.");
      return false;
    }
    if (!validEmail(email)) {
      setStep("email");
      setLocalError("Indiquez une adresse email valide.");
      return false;
    }

    const response = await onRequestOtp(
      phone.trim(),
      email.trim().toLowerCase(),
    );
    if (!response) {
      return false;
    }

    setStep("code");
    setCode("");
    setDevCode(response.devCode ?? null);
    setSecondsLeft(response.expiresIn);

    return true;
  };

  const handlePhoneSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!validPhone(phone)) {
      setLocalError("Indiquez un numéro de téléphone valide.");
      return;
    }

    setCode("");
    setDevCode(null);
    setNeedsName(false);
    setName("");
    setStep("email");
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendCode();
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

    const result = await onVerifyOtp({
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      code,
      ...(name.trim() ? { name: name.trim() } : {}),
    });

    if (result === "requires-name") {
      setNeedsName(true);
    }
  };

  const displayedError = localError ?? error;
  const expired = step === "code" && secondsLeft === 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const stepIndex = step === "phone" ? 0 : step === "email" ? 1 : 2;

  const stepCircleClass = (index: number): string =>
    cn(
      "grid size-7 place-items-center rounded-full text-[11px] font-bold",
      stepIndex === index
        ? "bg-brand text-surface"
        : stepIndex > index
          ? "bg-brand-soft text-brand"
          : "bg-surface-muted text-muted",
    );

  const stepLineClass = (index: number): string =>
    cn("h-px flex-1", stepIndex > index ? "bg-brand/40" : "bg-line");

  const heading =
    step === "phone"
      ? "Connexion par téléphone"
      : step === "email"
        ? "Vérification par email"
        : "Vérifiez votre email";

  const description =
    step === "phone"
      ? "Entrez votre numéro. Nous vous demanderons ensuite votre adresse email pour envoyer le code."
      : step === "email"
        ? "Indiquez l’adresse email qui recevra votre code de connexion à usage unique."
        : `Saisissez le code envoyé à ${email.trim()}.`;

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
                Connexion par téléphone et code email
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
            {[0, 1, 2].map((index) => (
              <div key={index} className="contents">
                <span className={stepCircleClass(index)}>
                  {stepIndex > index ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                {index < 2 && (
                  <span
                    className={stepLineClass(index)}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-7">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
              N’Teri · Accès
            </p>
            <h2 className="mt-1 font-display text-[25px] font-semibold tracking-[-0.04em] text-ink">
              {heading}
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              {description}
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

          {step === "phone" && (
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
                  Votre numéro reste votre identifiant N’Teri. Le code de
                  connexion sera envoyé par email.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="button-brand mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.99] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
              >
                <PhoneIcon className="size-4" />
                Continuer
              </button>
            </form>
          )}

          {step === "email" && (
            <form className="mt-5 space-y-4" onSubmit={handleEmailSubmit} noValidate>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="login-email" className={labelClass}>
                    Adresse email
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setEmail("");
                      setName("");
                      setNeedsName(false);
                      setCode("");
                      setDevCode(null);
                      setLocalError(null);
                    }}
                    className="text-[10.5px] font-semibold text-brand transition hover:text-brand-deep hover:underline"
                  >
                    Modifier le numéro
                  </button>
                </div>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="awa@exemple.com"
                  className={fieldClass}
                  autoFocus
                />
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                  Utilisez l’adresse email associée à votre compte. Le code à 6
                  chiffres y sera envoyé.
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
                  <MailIcon className="size-4" />
                )}
                {busy ? "Envoi…" : "Recevoir mon code"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form className="mt-5 space-y-4" onSubmit={handleCodeSubmit} noValidate>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="login-code" className={labelClass}>
                    Code à 6 chiffres
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setDevCode(null);
                      setLocalError(null);
                    }}
                    className="text-[10.5px] font-semibold text-brand transition hover:text-brand-deep hover:underline"
                  >
                    Modifier l’email
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
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  Aucun email ? Vérifiez que l’adresse saisie est bien celle
                  associée à votre compte.
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
                  onClick={() => void sendCode()}
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
              En développement, utilisez l’adresse email de votre choix ; le
              code s’affiche après la demande.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

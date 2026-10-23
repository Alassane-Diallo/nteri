import { useState } from "react";
import type { FormEvent } from "react";

import { BrandMark } from "~/components/BrandMark";
import { CheckIcon, LoaderIcon, LockIcon, UsersIcon } from "~/components/icons";
import { cn } from "~/lib/cn";
import type { LoginPayload, RegisterPayload } from "../messaging/api";

type Mode = "login" | "register";

interface AuthScreenProps {
  busy: boolean;
  error: string | null;
  onLogin: (payload: LoginPayload) => Promise<boolean>;
  onRegister: (payload: RegisterPayload) => Promise<boolean>;
}

const fieldClass =
  "mt-1.5 h-11 w-full rounded-2xl border border-line bg-surface-muted px-3.5 text-[13px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15";

const labelClass = "block text-[11px] font-semibold text-ink-soft";

export function AuthScreen({
  busy,
  error,
  onLogin,
  onRegister,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [localError, setLocalError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setLocalError(null);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!username.trim() || !password) {
      setLocalError("Renseignez votre nom d’utilisateur et votre mot de passe.");
      return;
    }

    await onLogin({ username: username.trim(), password });
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (name.trim().length < 2) {
      setLocalError("Indiquez votre nom complet.");
      return;
    }
    if (username.trim().length < 3) {
      setLocalError("Choisissez un nom d’utilisateur d’au moins 3 caractères.");
      return;
    }
    if (phone.trim().replace(/\D/g, "").length < 8) {
      setLocalError("Indiquez un numéro de téléphone valide.");
      return;
    }
    if (password.length < 10) {
      setLocalError("Le mot de passe doit contenir au moins 10 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    await onRegister({
      username: username.trim(),
      name: name.trim(),
      phone: phone.trim(),
      password,
    });
  };

  const displayedError = localError ?? error;

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
              La conversation,
              <br />
              simplement.
            </h1>
            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-canvas/70">
              Retrouvez vos proches, échangez en temps réel et organisez vos
              groupes dans un espace privé.
            </p>

            <ul className="mt-9 space-y-3.5 text-[12.5px] text-canvas/80">
              <li className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-canvas/10">
                  <LockIcon className="size-4" />
                </span>
                Session protégée par cookie sécurisé
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-canvas/10">
                  <UsersIcon className="size-4" />
                </span>
                Conversations privées et groupes
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-canvas/10">
                  <CheckIcon className="size-4" />
                </span>
                Messages synchronisés en temps réel
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

          <div
            role="tablist"
            aria-label="Connexion ou création de compte"
            className="flex items-center gap-1 rounded-2xl bg-surface-muted p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
              className={cn(
                "h-9 flex-1 rounded-xl text-[11.5px] font-semibold transition-all duration-200",
                mode === "login"
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              Se connecter
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => switchMode("register")}
              className={cn(
                "h-9 flex-1 rounded-xl text-[11.5px] font-semibold transition-all duration-200",
                mode === "register"
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              Créer un compte
            </button>
          </div>

          <div className="mt-7">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
              N’Teri · Accès
            </p>
            <h2 className="mt-1 font-display text-[25px] font-semibold tracking-[-0.04em] text-ink">
              {mode === "login" ? "Bon retour parmi nous" : "Bienvenue sur N’Teri"}
            </h2>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              {mode === "login"
                ? "Connectez-vous pour retrouver vos conversations."
                : "Quelques informations suffisent pour ouvrir votre espace."}
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

          {mode === "login" ? (
            <form className="mt-5 space-y-4" onSubmit={handleLogin} noValidate>
              <div>
                <label htmlFor="login-username" className={labelClass}>
                  Nom d’utilisateur
                </label>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Ex. awa"
                  className={fieldClass}
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="login-password" className={labelClass}>
                  Mot de passe
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Votre mot de passe"
                  className={fieldClass}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="button-brand mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.99] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
              >
                {busy && <LoaderIcon className="size-4 animate-spin" />}
                {busy ? "Connexion…" : "Se connecter"}
              </button>
            </form>
          ) : (
            <form className="mt-5 space-y-3.5" onSubmit={handleRegister} noValidate>
              <div>
                <label htmlFor="register-name" className={labelClass}>
                  Nom complet
                </label>
                <input
                  id="register-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex. Awa Traoré"
                  className={fieldClass}
                  autoFocus
                />
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="register-username" className={labelClass}>
                    Nom d’utilisateur
                  </label>
                  <input
                    id="register-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Ex. awa"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="register-phone" className={labelClass}>
                    Téléphone
                  </label>
                  <input
                    id="register-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+223 76 12 34 56"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="register-password" className={labelClass}>
                    Mot de passe
                  </label>
                  <input
                    id="register-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="10 caractères minimum"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="register-confirm" className={labelClass}>
                    Confirmation
                  </label>
                  <input
                    id="register-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Répétez le mot de passe"
                    className={fieldClass}
                  />
                </div>
              </div>

              <p className="text-[10px] leading-relaxed text-muted">
                Le nom d’utilisateur accepte les lettres minuscules, chiffres,
                points, tirets et soulignés (3 à 30 caractères).
              </p>

              <button
                type="submit"
                disabled={busy}
                className="button-brand mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-[12.5px] font-semibold shadow-sm transition duration-200 hover:brightness-110 active:scale-[0.99] disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
              >
                {busy && <LoaderIcon className="size-4 animate-spin" />}
                {busy ? "Création…" : "Créer mon compte"}
              </button>
            </form>
          )}

          {import.meta.env.DEV && (
            <p className="mt-5 rounded-2xl bg-surface-muted px-3.5 py-2.5 text-[10.5px] leading-relaxed text-muted">
              Démo : <span className="font-semibold text-ink">awa</span> /{" "}
              <span className="font-semibold text-ink">NteriDemo2026!</span>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

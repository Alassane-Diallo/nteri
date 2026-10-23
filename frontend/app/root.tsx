import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { BrandMark } from "~/components/BrandMark";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Sora:wght@400;500;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b7a45" />
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oups";
  let details = "Une erreur inattendue est survenue.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page introuvable" : "Une erreur";
    details =
      error.status === 404
        ? "La page que vous cherchez n’existe pas."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="page-pattern grid min-h-dvh place-items-center px-6 py-12 text-ink">
      <div className="w-full max-w-lg text-center">
        <div className="flex justify-center">
          <BrandMark className="size-16" />
        </div>
        <p className="mt-6 text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
          N’Teri
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {message}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
          {details}
        </p>

        {stack && (
          <pre className="scrollbar-slim mt-6 max-h-72 overflow-auto rounded-2xl border border-line bg-surface p-4 text-left text-xs leading-relaxed text-ink-soft">
            <code>{stack}</code>
          </pre>
        )}

        <a
          href="/"
          className="button-brand mt-7 inline-flex h-11 items-center justify-center rounded-full px-5 text-[12px] font-semibold shadow-sm transition hover:brightness-110"
        >
          Retour à l’accueil
        </a>
      </div>
    </main>
  );
}

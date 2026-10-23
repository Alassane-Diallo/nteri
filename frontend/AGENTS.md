# AGENTS.md

N’Teri is a French-language, text-only messaging app: React Router 8 Framework
Mode with SSR, React 19, Vite 8, Tailwind CSS 4, strict TypeScript, backed by
Django 6.1 + Django REST Framework + Channels in `../py/nteri-api`. All
user-facing copy is French; keep it that way.

## Commands

Frontend (this directory):

- `npm run dev` — dev server, usually `http://localhost:5173`; the Vite proxy
  forwards `/api` and `/ws` to `http://127.0.0.1:8000`.
- `npm run typecheck` — `react-router typegen && tsc`; run after route or
  module changes.
- `npm run build` — builds `build/client` and `build/server`.
- `npm start` — serves the production build on port `3000` (`PORT` overrides).
  It does not proxy to Django; production needs a same-origin reverse proxy.

Backend (`../py/nteri-api`):

- `python manage.py runserver 127.0.0.1:8000` — start the API/WebSocket server.
- `python manage.py test chat -v 2` — auth, permissions, messaging, pagination,
  throttling and WebSocket tests.
- `python manage.py check` and
  `python manage.py makemigrations --check --dry-run` — configuration and
  migration checks.
- `python manage.py seed_demo --reset --reset-passwords` — reset demo data.
  Demo accounts use `NteriDemo2026!` unless `NTERI_DEMO_PASSWORD` is set.

Verify changes with frontend `npm run typecheck && npm run build` and backend
`python manage.py check && python manage.py test chat`. There is no lint script.

## Architecture

- `app/routes.ts` declares routes explicitly. A file under `app/routes/` is
  ignored until registered there.
- `app/routes/home.tsx` protects the workspace: it shows `AuthScreen` while the
  session is anonymous and composes the messaging UI when authenticated.
- `app/features/messaging/api.ts` is the only network boundary. It handles the
  CSRF token, session cookies, REST calls, API error shapes and the
  authenticated inbox WebSocket with reconnect and heartbeat.
- `app/features/messaging/useChatStore.ts` owns session bootstrap, login,
  registration, logout, conversations, messages, server-computed unread counts
  and realtime events. Do not duplicate that state elsewhere.
- `app/features/messaging/selectors.ts` builds display summaries. Unread counts
  come from the server; never derive them from local message timestamps.
- `app/features/messaging/components/` contains feature UI. Shared primitives
  are in `app/components/`.
- There is no client-side persistence: no `localStorage`, session storage or
  seed data. Reloading rebuilds state from `/api/`.
- Scope is text messages and group creation only. Groups require a name of at
  least 2 characters and at least 2 selected contacts. Do not add media, calls,
  attachments or message editing without an explicit request.
- `app/app.css` is the design system: Mali palette tokens, dark-mode token
  overrides, typography, patterns and motion. Tailwind v4 is configured in CSS;
  there is no `tailwind.config.*`.
- Route modules use `./+types/<route>`; generated types live in gitignored
  `.react-router/` and must not be edited.
- `~/*` maps to `app/*` (tsconfig + Vite `resolve.tsconfigPaths`).
- Read the project-local `react-router` skill in `.agents/skills/react-router/`
  before changing routing/data APIs; version-matched docs are in
  `node_modules/react-router/docs/`.

## Security invariants

- Never trust a user ID from the client. The backend identifies users from the
  Django session; WebSocket subscriptions are per authenticated user.
- Keep the Vite dev proxy same-origin (`changeOrigin` intentionally omitted) so
  CSRF origin checks and session cookies continue to work.
- Unsafe HTTP methods must send the CSRF token. Obtain it from
  `/api/auth/csrf/` and update it from login/register responses.
- Do not reintroduce hardcoded credentials, secrets, API keys or production
  hostnames. Demo credentials belong only to the seed command and DEV UI.
- Keep `danger` messages user-safe: no stack traces, internal URLs or raw
  server payloads.
- The backend enforces conversation membership, message validation and rate
  limits. Frontend checks are only for UX, never for authorization.

## Conventions

- Keep components small and colocate feature-specific UI under its feature
  folder.
- Use the existing semantic tokens (`bg-surface`, `text-ink`, `text-muted`,
  `border-line`, `bg-brand`, `mali-gradient`) instead of raw hex values.
- Respect accessibility patterns already in place: native dialog, labelled
  controls, visible focus, 44px actions, `prefers-reduced-motion`.
- Keep user-facing text in French, including validation and network errors.
- The demo seed intentionally includes unread chats. Reset it from the backend
  with `seed_demo`, not by writing browser storage.

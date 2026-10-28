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
  Demo accounts sign in with their seeded phone number, then an email that
  receives the OTP; the seeded Django password (`NteriDemo2026!` unless
  `NTERI_DEMO_PASSWORD` is set) is for the admin only.
- `python manage.py set_user_email <phone> <email>` — associate an email with
  an existing account when email OTP enrollment is disabled in production.

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
- `app/features/messaging/useChatStore.ts` owns session bootstrap, OTP login,
  logout, private contacts, conversations, messages, server-computed unread
  counts, notifications and realtime events. Do not duplicate that state
  elsewhere.
- `app/features/messaging/selectors.ts` builds display summaries. Unread counts
  come from the server; never derive them from local message timestamps.
- `app/features/messaging/components/` contains feature UI. Shared primitives
  are in `app/components/`.
- `app/features/notifications/` owns browser notification permission, local
  notifications and the Web Push subscription. `public/sw.js` handles incoming
  Push events and notification clicks.
- There is no client-side persistence: no `localStorage`, session storage or
  seed data. Reloading rebuilds state from `/api/`.
- Contacts are private and owner-scoped on the backend. Never add a global
  user directory or expose another user's contact book. Direct conversation
  creation requires the target to be in the creator's contacts; incoming
  messages from outside that book remain allowed.
- Scope is text messages and group creation only. Groups require a name of at
  least 2 characters and at least 2 selected contacts. Do not add media, calls,
  attachments or message editing without an explicit request.
- Authentication is phone + OTP. The phone remains the unique identifier; the
  current OTP channel is email (Resend in production) while no production SMS
  gateway is available. Password login/registration endpoints were removed
  from the app API; Django admin passwords are only for staff. OTP codes must
  stay hashed, short-lived and rate-limited.
- Email OTP is configuration-dependent: `console` is development only and
  `resend` needs `RESEND_API_KEY` plus a verified `RESEND_FROM_EMAIL`. Existing
  accounts must already have the matching email; only DEBUG may enroll one.
  SMS remains optional via `NTERI_OTP_CHANNEL=sms` with `twilio` or `http`.
  Web Push needs VAPID keys and HTTPS; local notifications remain the fallback
  when it is disabled.
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
  `/api/auth/csrf/` and update it from OTP verification responses.
- Never expose a global list of users or another account's contacts. The
  backend must keep contact queries scoped to `request.user` and only expose
  profiles through the caller's contact book or shared conversations.
- OTP codes must never be returned or logged outside DEBUG, and must remain
  hashed with attempt and request throttling. Production email must use Resend
  with a verified domain; never allow `console` email when `DEBUG=False`.
  Production SMS, if enabled, must use a real provider.
- An existing account may only receive an email OTP at the address already
  stored on that account. Never let an anonymous request attach or change the
  email of an existing account outside DEBUG. Enforce email uniqueness.
- Email OTP does not prove phone ownership; treat it as a temporary channel and
  do not present it as equivalent to SMS verification.
- VAPID private keys, Resend keys and SMS credentials stay server-side. Only
  the VAPID public key may be returned to the browser.
- Do not reintroduce hardcoded credentials, secrets, API keys or production
  hostnames. Demo credentials belong only to the seed command and DEV UI.
- Keep `danger` messages user-safe: no stack traces, internal URLs or raw
  server payloads.
- The backend enforces conversation membership, private contacts, message
  validation and rate limits. Frontend checks are only for UX, never for
  authorization.

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

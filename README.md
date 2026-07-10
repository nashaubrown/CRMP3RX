# Perx CRM

Internal CRM and sales platform for **Perx Technologies** — manage the full merchant
lifecycle (leads → deals → close), customer communication (email + SMS), meeting
scheduling, and an AI assistant over your CRM data.

## Stack

- **Next.js** (App Router) + **TypeScript** (strict)
- **PostgreSQL** + **Prisma 7** (driver adapter: `@prisma/adapter-pg`)
- **Tailwind CSS v4** + **shadcn/ui** (components vendored in `src/components/ui`)
- **Auth.js v5** — email/password + Google OAuth, JWT sessions, RBAC (`ADMIN` / `SALES_REP`)
- **Resend** (email), **Twilio** (SMS, behind a swappable provider interface)
- **Google Calendar** (two-way sync + public booking page)
- **Anthropic Claude** (read-only AI assistant, server-side)

## Local setup

Prerequisites: Node 20+, pnpm, Docker.

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres
docker compose up -d

# 3. Configure environment
cp .env.example .env
# set AUTH_SECRET (openssl rand -base64 32); the defaults work for everything else

# 4. Migrate + seed
npx prisma migrate dev
npx prisma db seed

# 5. Run
pnpm dev
```

Open http://localhost:3000 and sign in with a seeded account:

| Email | Role | Password |
|---|---|---|
| `admin@perx.mv` | Admin | `perx1234` |
| `hassan@perx.mv` | Sales rep | `perx1234` |
| `mariyam@perx.mv` | Sales rep | `perx1234` |

Admins see all records; sales reps only see records they own — the fastest way to
see RBAC in action is to compare the dashboard counts between `admin@perx.mv` and
`hassan@perx.mv`.

## Environment variables

Every key is documented in [`.env.example`](.env.example). Only `DATABASE_URL` and
`AUTH_SECRET` are required: each integration falls back to a dev-safe console
provider when its keys are missing (emails/SMS are logged instead of sent), so the
whole app runs locally with zero external accounts.

- **Google OAuth login** activates when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are
  set. There is no self-serve signup: Google sign-in only works for users an admin
  has already created (matched by email).
- **SMS** provider is selected via `SMS_PROVIDER`: `TWILIO`, `LOCAL_GATEWAY`
  (Dhiraagu/Ooredoo-ready stub), or `CONSOLE`.

## Project structure

```
prisma/               # schema, migrations, seed
prisma.config.ts      # Prisma 7 config (datasource URL, seed command)
src/
  app/                # routes: (auth)/login, (app)/* authed shell, api/*
  components/         # ui/ (shadcn) + layout/ + feature components
  lib/                # db, auth, rbac, datetime, utils
  services/           # business logic (all RBAC scoping lives here)
  integrations/       # email / sms / calendar / ai — behind interfaces
```

Conventions:

- All timestamps are stored in **UTC** and rendered in **Asia/Maldives (UTC+5)**
  via `src/lib/datetime.ts`.
- Phone numbers are **E.164**, default region **+960**.
- Every service function takes a session-user context and applies ownership
  scoping in the query itself (`src/lib/rbac.ts`).

## Scripts

```bash
pnpm dev              # dev server
pnpm build && pnpm start
pnpm lint
npx tsc --noEmit      # typecheck
npx prisma studio     # browse the database
npx prisma db seed    # re-seed (wipes app data first)
```

## Build phases

- [x] **Phase 0** — foundation: scaffold, Postgres + Prisma schema/seed, Auth.js + RBAC, app shell (sidebar/topbar, mobile nav, dark mode)
- [ ] **Phase 1** — core CRM: merchants & contacts CRUD, ownership, activity timeline
- [ ] **Phase 2** — sales pipeline: leads + scoring, deals kanban, pipeline metrics
- [ ] **Phase 3** — communications: email (Resend), SMS (adapter), templates, webhooks, opt-out
- [ ] **Phase 4** — scheduling: Google Calendar sync + public booking page
- [ ] **Phase 5** — dashboard & tasks
- [ ] **Phase 6** — AI assistant ("Ask Perx")
- [ ] **Phase 7** — hardening: tests, validation, docs

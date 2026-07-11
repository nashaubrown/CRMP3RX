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
- **AI assistant** — Anthropic Claude by default, or any free/OpenAI-compatible
  provider (Groq, Gemini, OpenRouter, Mistral, Ollama) via `AI_PROVIDER`

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
pnpm db:migrate
pnpm db:seed

# 5. Run
pnpm dev
```

> After every `git pull` that touches `prisma/`, run `pnpm db:migrate` (applies new
> migrations and regenerates the client). `pnpm install` also regenerates the
> client automatically via the `postinstall` hook.

Open http://localhost:3000 and sign in with a seeded account:

| Email | Role | Password |
|---|---|---|
| `admin@perx.mv` | Admin | `perx1234` |
| `hassan@perx.mv` | Sales rep | `perx1234` |
| `mariyam@perx.mv` | Sales rep | `perx1234` |

## Access model (hybrid sharing)

- **Merchants, contacts and deals are org-visible**: every signed-in user can view
  every record — transparency prevents duplicates and turf confusion.
- **Editing is gated**: a merchant (and its contacts/activity log) can be edited by
  its owner, admins, and teammates holding an **Edit** share.
- **Sharing** (owner or admin, via the Share button on a merchant): a **View** share
  adds the merchant to the teammate's "Shared with me" working set and dashboard
  counts; an **Edit** share additionally grants collaboration rights.
- **Deleting and share management** stay owner/admin-only. Every change, including
  shares, lands in the audit log.

The seed shares two of Hassan's merchants with Mariyam (one Edit, one View) — sign
in as `mariyam@perx.mv` and use the "Shared with me" filter on Merchants to see it.

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
pnpm typecheck
pnpm db:migrate       # apply migrations + regenerate client
pnpm db:seed          # re-seed (wipes app data first)
npx prisma studio     # browse the database
```

## Feature map

| Area | Where | Notes |
|---|---|---|
| Merchants & contacts | `/merchants`, `/contacts` | Search/filter/sort/pagination, Perx fields, activity timelines, owner-visible change history |
| Sharing | Share button on a merchant | Hybrid model: org-wide view; per-teammate View/Edit shares |
| Leads | `/leads` + public `/capture` | Rule-based scoring, claim, convert-to-merchant |
| Deals | `/deals` | Drag-drop kanban, won/lost reasons, MVR/USD metrics |
| Email & SMS | Buttons on merchant/contact pages | Templates with merge vars (`/templates`), STOP opt-out, delivery webhooks, hourly send limits |
| Scheduling | `/settings`, public `/book/[slug]`, Schedule button on merchant/contact pages | Google Calendar connect, availability editor, Meet links, email+SMS confirmations; user-scheduled meetings mirror onto the record's timeline |
| Tasks | `/tasks` + dashboard | Overdue highlighting, complete/reopen |
| Ask Perx (AI) | `/assistant` + topbar sparkle | Read-only, RBAC-scoped tools, streaming, audit-logged; provider-pluggable (Anthropic default; Groq/Gemini/OpenRouter/Mistral/Ollama via `AI_PROVIDER` — free hosted tiers may train on your prompts, see `.env.example`) |
| Generative UI | `/canvas` + topbar toggle | Prompt-driven canvas: the AI composes a live view (stat tiles, charts, tables, record cards, action buttons) from CRM data via a validated view spec. Per-user Classic/Generative toggle; inline write actions (log activity, complete task) re-check RBAC server-side |
| AI provider config | Settings → AI provider (admin) | Paste your Anthropic/Groq/Gemini/… key in the UI — encrypted at rest, overrides `.env`, with a live "Test connection" and a per-provider model dropdown. Rate-limited requests auto-retry. No key is ever sent back to the browser |
| REST API | `/api/v1/*` | API-key auth (created in Settings), same RBAC as the web app |
| MCP for Claude | `/api/mcp` | Connect claude.ai / Claude Code / Claude Desktop to the CRM |
| CSV export/import | Buttons on list pages | Export honors active filters; import validates per row, skips duplicates, needs the same edit rights as the forms |

## Testing

```bash
pnpm test          # unit + integration (integration needs the docker Postgres running)
```

Unit tests cover lead scoring, slot generation (timezone math), merge vars, phone
normalization, audit diffs and rate limiting. Integration tests run the real
services against Postgres: the sharing/permission matrix and the public booking
flow (double-booking rejection included).

## REST API & connecting Claude (MCP)

Create an API key in **Settings → API keys & Claude integration** (shown once —
only a SHA-256 hash is stored). A key authenticates as its owner, so every
request is scoped by the same RBAC and sharing rules as the web app, and all
write calls are audit-logged.

### REST API (`/api/v1`)

Send the key as `Authorization: Bearer perx_…` (or `x-api-key`):

```bash
curl -H "Authorization: Bearer perx_…" "$APP_URL/api/v1/me"
```

| Endpoint | Methods | Notes |
|---|---|---|
| `/api/v1/me` | GET | Who the key belongs to (connectivity check) |
| `/api/v1/merchants` | GET, POST | `?q= &status= &scope=all\|mine\|shared &sort= &dir= &page=` |
| `/api/v1/merchants/:id` | GET | Full record: contacts, deals, your access flags |
| `/api/v1/contacts` | GET | `?q= &merchantId= &scope= &page=` |
| `/api/v1/contacts/:id` | GET | |
| `/api/v1/deals` | GET | `?scope=all\|mine &stage=` — board + per-stage summaries |
| `/api/v1/leads` | GET | `?q= &status= &scope=all\|mine\|unassigned &page=` |
| `/api/v1/activities` | POST | Log a note/call/task/meeting (needs merchant edit rights) |
| `/api/v1/meetings` | POST | Schedule a meeting (host = key owner, Google-synced) |

Errors are `{ "error": "…" }` with 400/401/404 status codes. Dates in request
bodies (`dueAt`, `startAtLocal`) use `YYYY-MM-DDTHH:mm` in Maldives time;
response timestamps are UTC ISO.

### MCP server (`/api/mcp`)

A remote [MCP](https://modelcontextprotocol.io) server (Streamable HTTP,
stateless) that gives Claude tools over the CRM: `search_records`,
`get_merchant`, `get_contact`, `list_deals`, `pipeline_summary`,
`list_activities_due`, `recent_communications`, `stale_merchants`, plus two
writes — `log_activity` and `schedule_meeting` (both require edit rights on
the record, like the web app).

- **Claude Code**:
  `claude mcp add --transport http perx-crm $APP_URL/api/mcp --header "Authorization: Bearer perx_…"`
- **claude.ai / Claude Desktop** (Settings → Connectors → Add custom
  connector): use `$APP_URL/api/mcp?key=perx_…` if the client can't set
  headers. Anything with the key in the URL can act as you — treat that URL
  as a secret, and note the deployment must be reachable from the internet
  for claude.ai to connect.

The internal "Ask Perx" assistant is unchanged (and stays read-only); the MCP
surface shares its read tools.

## Webhooks in production

`/api/webhooks/resend` (svix-signed when `RESEND_WEBHOOK_SECRET` is set) and
`/api/webhooks/twilio` (signature-checked, handles inbound STOP/START) need a
public URL — use ngrok in development if you want live delivery events.

## Vercel readiness

The app deploys to Vercel unchanged: `postinstall` regenerates the Prisma
client, all secrets come from env vars, and the datasource URL lives in
`prisma.config.ts`. Point `DATABASE_URL` at a hosted Postgres (Supabase works —
use the pooled connection string), set `NEXT_PUBLIC_APP_URL` to the deployment
URL, and add the Google OAuth redirect URI. One caveat: the in-memory rate
limiter is per-instance — swap `src/lib/rate-limit.ts` for a Redis/Upstash
implementation if you scale beyond one region/instance.

## Build phases

- [x] **Phase 0** — foundation: scaffold, Postgres + Prisma schema/seed, Auth.js + RBAC, app shell (sidebar/topbar, mobile nav, dark mode)
- [x] **Phase 1** — core CRM: merchants & contacts CRUD (search/filter/sort/pagination), ownership + RBAC scoping, activity timelines, audit logging
- [x] **Phase 2** — sales pipeline: rule-scored leads + public capture form (`/capture`), claim/convert flow, deals kanban with drag-drop + won/lost reasons, per-stage metrics split by MVR/USD
- [x] **Phase 3** — communications: email (Resend), SMS (Twilio behind `SmsProvider` + local-gateway stub), templates with merge vars, delivery webhooks, STOP opt-out, rate limits
- [x] **Phase 4** — scheduling: Google Calendar connect + free/busy, availability editor, public booking page with confirmations
- [x] **Phase 5** — dashboard (pipeline, due today, recent comms, team feed) & tasks
- [x] **Phase 6** — AI assistant ("Ask Perx"): read-only RBAC-scoped tools, streaming chat, conversation history
- [x] **Phase 7** — hardening: vitest unit + integration tests, error boundaries, docs, Vercel-readiness

Post-launch additions: user-scheduled meetings on records, REST API + MCP
server for Claude, CSV export/import, provider-pluggable AI (Groq/Gemini/…),
security hardening, and a **Generative UI** canvas (AI-composed views, per-user
Classic/Generative toggle).

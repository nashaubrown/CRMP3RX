# Deploying Perx CRM (Vercel + free Postgres)

Two things to know up front:

1. **Vercel's free "Hobby" plan is for non-commercial use only.** An internal
   company CRM is commercial, so to stay within Vercel's terms you'd use the
   **Pro** plan (~$20/mo). It will *run* on Hobby, but that's a licensing call
   for you to make. Cheaper commercial-friendly alternatives: Railway, Render,
   Fly.io, or self-hosting.
2. **Vercel doesn't include a database.** Use a free Postgres — **Neon**
   (recommended) or **Supabase**. Their free tiers *do* allow commercial use
   and are plenty for a small team.

## One-time setup (~10 minutes)

### 1. Create a free Postgres (Neon)
- Sign up at neon.tech → create a project.
- Copy the **pooled** connection string (has `-pooler` in the host). It looks
  like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

### 2. Import the repo into Vercel
- vercel.com → **Add New → Project** → import `nashaubrown/crmp3rx`.
- Framework: **Next.js** (auto-detected). Don't deploy yet — set env vars first.

### 3. Set environment variables (Project → Settings → Environment Variables)

| Key | Value | Required |
|---|---|---|
| `DATABASE_URL` | the Neon **pooled** string | ✅ |
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste the output | ✅ |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL, e.g. `https://perx-crm.vercel.app` | ✅ |
| `ANTHROPIC_API_KEY` *(or `AI_PROVIDER` + a key)* | for Ask Perx / Canvas | optional |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google login + calendar | optional |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | merchant map + location picker | optional |
| `RESEND_API_KEY`, `EMAIL_FROM` | real email sending | optional |
| `SMS_PROVIDER`, `TWILIO_*` | real SMS | optional |

> Email/SMS/AI all fall back to safe no-op/console providers when unset, so the
> core CRM runs with just the three required vars.

### 4. Deploy
- Hit **Deploy**. The build runs `prisma migrate deploy` automatically
  (`vercel-build` script), so your database schema is created on first deploy.

### 5. Create your admin login (no demo data)
From your machine, pointing at the **same** Neon database:
```bash
DATABASE_URL="postgresql://…neon…pooler…" \
ADMIN_EMAIL="you@perx.mv" \
ADMIN_PASSWORD="a-strong-password" \
ADMIN_NAME="Your Name" \
pnpm create:admin
```
(Or run `pnpm db:seed` instead if you want the demo merchants/deals to explore —
but that also creates demo logins with a known password, so prefer `create:admin`
for real use.)

### 6. Sign in and add your team
- Open your Vercel URL and sign in with the admin credentials above.
- Go to **Team** in the nav (admins only) to add teammates: enter their name,
  email, role (Admin or Sales rep) and a temporary password, then share those
  credentials with them. They can sign in immediately — no email setup needed.
- From there, start adding merchants, contacts, and deals.

> The `create:admin` script is only needed once, to bootstrap the very first
> admin. After that, everyone is added from the in-app **Team** page.

## Updating later
Push to the branch Vercel is watching → it redeploys and applies any new
migrations automatically. That's it.

## Notes
- The in-memory rate limiter is per-instance; on a single Vercel region that's
  fine. Swap `src/lib/rate-limit.ts` for Redis/Upstash if you scale wider.
- If Google login/calendar is enabled, add
  `${NEXT_PUBLIC_APP_URL}/api/google/callback` as an authorized redirect URI in
  the Google Cloud console.

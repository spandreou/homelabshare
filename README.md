# homeLabShare

`homeLabShare` is a private, invite-only homelab file sharing platform built for secure access, operational visibility, and controlled onboarding.

It combines a modern web UI with a PostgreSQL-backed data model, SMTP notifications, and Cloudflare Tunnel exposure for safe external access.

## Tech Stack

- Next.js (App Router) + React + TypeScript
- Prisma ORM
- PostgreSQL
- Docker / Docker Compose
- Cloudflare Tunnel (`cloudflared`)

## Features

- Invite-only access workflow
- File Explorer for shared content
- System Monitoring dashboards and health checks
- SMTP email notifications for key actions

## Project Structure

```text
.
├── src/
│   ├── app/              # App routes, pages, API endpoints
│   └── lib/              # Auth, DB, mailer, storage utilities
├── prisma/               # Schema, migrations, seed logic
├── docker-compose.yml    # App + Postgres + Cloudflare tunnel stack
├── Dockerfile            # Production image build
└── .env.example          # Environment template (no secrets)
```

## Setup Instructions

### 1. Clone repository

```bash
git clone https://github.com/spandreou/homelabshare.git
cd homelabshare
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create local environment file

```bash
cp .env.example .env
```

Then fill in all required values in `.env`.

### 4. Run locally

```bash
npm run dev
```

App runs at `http://localhost:3000`.

### 5. Optional: Prisma seed

```bash
npm run db:seed
```

## Environment Variables

The repository includes `.env.example` with all required keys and empty values.

Minimum required configuration includes:

- Database connection (`DATABASE_URL`)
- SMTP host/port/user/pass and sender (`SMTP_*`, `MAIL_FROM` or `SMTP_FROM`)
- App URL and session secret (`APP_URL`, `SESSION_SECRET`)
- Optional admin bootstrap email (`ADMIN_EMAIL`)
- Cloudflare tunnel token (`CLOUDFLARE_TUNNEL_TOKEN`)

## Production Session Secret Runbook

`SESSION_SECRET` is mandatory in production and must be at least 32 characters.

1. Generate a secret (do not commit it):

```bash
openssl rand -base64 48 | tr -d '\n'
```

2. Add it to your deployment env file:

```env
SESSION_SECRET=<your-generated-secret>
```

3. Deploy with a safe reload:

- Docker Compose:

```bash
docker compose up -d --no-deps --force-recreate app
```

- PM2:

```bash
pm2 reload homeLabShare --update-env
```

4. Verify runtime env without exposing value:

```bash
node -e 'const s=process.env.SESSION_SECRET||\"\"; console.log(s ? `SESSION_SECRET set (len=${s.length})` : \"SESSION_SECRET missing\")'
```

## Security Notes

- Secrets are never committed. Use `.env` locally and keep real credentials out of git.
- Certificate files (`*.pem`) and Cloudflare credential JSON files are ignored by `.gitignore`.
- Build and runtime artifacts (`node_modules`, `.next`, `dist`, `uploads`) are ignored.

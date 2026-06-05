# Project Brain

## Purpose

homeLabShare is a private, invite-only homelab file sharing platform.

Primary goals:
- Secure invite-only access.
- Reliable file storage and download workflows.
- Clear admin visibility for users, storage, system health, invites, and activity.
- Low-maintenance homelab deployment through Docker Compose and Cloudflare Tunnel.

## Instruction Sources

Agents working in this repository must follow:
- `AGENTS.md` first.
- This file for project-specific operating context.
- `docs/SECURITY_GUIDELINES.md` for security baseline.
- `node_modules/next/dist/docs/` before writing Next.js code, because this project uses a Next.js version with breaking changes.

If these documents conflict, prefer the stricter security rule and the local Next.js documentation.

## Stack

- Next.js App Router, React, TypeScript.
- Prisma ORM with PostgreSQL.
- Docker Compose deployment.
- Cloudflare Tunnel for public access.
- `systeminformation` for host/system metrics.
- `ogl` for the Lightfall WebGL background.

## Current Product Decisions

- The app is permanently dark themed.
- Theme switching is intentionally removed.
- Lightfall animated background is enabled only on desktop/fine-pointer devices.
- Mobile and reduced-motion users get a static dark/blue gradient to avoid performance issues.
- Admin routes stay protected server-side with admin authorization checks.
- The dashboard shows an admin-only navigation panel for admin users.
- Admin pages remain separate routes; the dashboard panel is only an entry point.

## Security Baseline

Follow `docs/SECURITY_GUIDELINES.md`.

Practical rules for this codebase:
- Backend authorization is required for every protected operation.
- Never rely on frontend-only restrictions for admin behavior.
- Validate user input with structured validation where possible.
- Do not concatenate user input into SQL.
- Keep secrets out of git; use `.env` locally and deployment env files on the server.
- Do not log passwords, session secrets, tokens, SMTP credentials, or database credentials.
- Upload paths must be normalized and checked against `UPLOAD_ROOT` before filesystem operations.
- Destructive file operations must stay inside `UPLOAD_ROOT`.
- Session cookies and admin redirects must remain deny-by-default.

## Storage Accounting Rules

Storage has two separate views:
- User/file quota accounting from the database.
- Real disk usage from the host filesystem.

Important behavior:
- `User.storageUsed` must match the sum of that user's `File.size` rows.
- Physical files under `UPLOAD_ROOT` must match `File.path` rows.
- Admin cleanup must reconcile both drift types:
  - orphan physical files with no DB row
  - DB file rows whose physical file is missing
- Disk cards in system monitoring show the whole target filesystem, not just uploads. Small user-file deletions may not visibly change the total free disk number.

## RAM Metrics Rule

On Linux, do not use raw `memory.used` as user-facing RAM usage when also showing `memory.available`.

Use:
- `used = total - available`
- `usedPercent = used / total`

Label the free side as `Available`, not `Free`.

## Admin UX Rules

- Admin navigation should be available from dashboard and admin pages.
- Admin action buttons should use consistent styling across sections.
- Avoid hover transforms inside horizontally scrollable tables; they can trigger unwanted scrollbars.
- Keep admin tables dense, readable, and operational rather than marketing-style.

## Deployment Flow

Default production target:
- SSH host: `homelab`
- Server checkout: `/home/spandreou/projects/HomeShareInvite`
- App container: `homelabshare-app`

Normal deploy:
```bash
git push origin main
ssh homelab "cd /home/spandreou/projects/HomeShareInvite && git fetch origin main && git merge --ff-only origin/main && docker compose build app && docker compose up -d --no-deps --force-recreate app"
```

Post-deploy checks:
```bash
ssh homelab "docker inspect homelabshare-app --format 'RestartCount={{.RestartCount}} Status={{.State.Status}}'"
ssh homelab "docker exec homelabshare-app wget -qO- http://127.0.0.1:3000/api/health"
```

Notes:
- The app container exposes port `3000/tcp` to the compose network, not necessarily to host `127.0.0.1:3000`.
- Public health can also be checked through `https://homelabshare.gr/api/health`.
- Do not delete or clean unrelated untracked files on the server checkout unless explicitly asked.

## Verification Checklist

For code changes:
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

For frontend changes:
- Verify desktop and mobile layouts.
- Check that mobile does not overlap key controls.
- Check that animated/WebGL elements do not run on mobile if performance is a concern.

For storage/admin changes:
- Compare DB file rows with physical files under `UPLOAD_ROOT`.
- Confirm `User.storageUsed` equals the sum of owned file sizes.
- Confirm cleanup does not touch files outside `UPLOAD_ROOT`.

## Known Operational Context

- `UPLOAD_ROOT` is `/home/spandreou/docker-data/uploads`.
- Production Postgres service is `homelabshare-db`.
- Production app service is `homelabshare-app`.
- Cloudflare tunnel service is `homelabshare-cloudflared`.
- Admin system monitoring disk metric targets `/home/spandreou`.

## Working Agreement

Keep changes scoped and production-safe:
- Read existing code patterns before editing.
- Preserve user changes and unrelated local changes.
- Prefer small commits with direct messages.
- Deploy only after passing verification unless explicitly told not to.
- Report any verification gap directly.

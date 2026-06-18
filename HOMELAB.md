# Homelab Notes

## Purpose

This file explains how `homelabshare-main` maps to the live homelab server and where to look for credentials during development or deployment tasks.

Do not store real secrets in this repository. Record only paths, variable names, service names, and safe commands.

## SSH Access

Preferred SSH target:

```bash
ssh homelab
```

Direct server identity:

```txt
spandreou@192.168.1.50:22
```

Local SSH config uses the private key at `C:\Users\Spyros\.ssh\id_ed25519`. Never copy the key contents into docs, logs, tickets, or chat.

## Credential Lookup Rules

Use these locations only as lookup references:

```txt
/home/spandreou/Desktop/Credentials
/home/spandreou/projects/homelab/.env
/home/spandreou/projects/homelab/.env.example
```

Local template for this project:

```txt
.env.example
```

Useful local env key names:

```txt
DATABASE_URL
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
MAIL_FROM
SMTP_FROM
APP_URL
SESSION_SECRET
ADMIN_EMAIL
CLOUDFLARE_TUNNEL_TOKEN
```

## Project Server Mapping

Verified server deployment:

```txt
canonical path: /home/spandreou/projects/homelab
compatibility symlink: /home/spandreou/projects/HomeShareInvite -> /home/spandreou/projects/homelab
compose project: homeshareinvite
compose file: /home/spandreou/projects/HomeShareInvite/docker-compose.yml
```

Known running containers:

```txt
homelabshare-app
homelabshare-db
homelabshare-cloudflared
```

Runtime notes:

```txt
app container internal port: 3000
database image: postgres:15-alpine
cloudflared tunnel container is part of the same compose project
```

Do not rename the compose project or remove the `HomeShareInvite` symlink during routine work. Existing Docker Compose metadata still references the compatibility path.

## Useful Server Commands

```bash
ssh homelab
cd /home/spandreou/projects/homelab
git status --short
docker compose -f /home/spandreou/projects/HomeShareInvite/docker-compose.yml ps
docker logs --tail=100 homelabshare-app
docker logs --tail=100 homelabshare-db
docker logs --tail=100 homelabshare-cloudflared
```

## Do Not Store Secrets

- Do not paste passwords, tokens, API keys, private keys, recovery codes, or full database URLs into this file.
- Do not commit `.env` files.
- If a secret-bearing file must be inspected, read the minimum needed and summarize only variable names or paths.

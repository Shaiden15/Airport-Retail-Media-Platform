# Deploying the playground (free)

The playground is the single Docker image built from the root `Dockerfile` (default target `playground`): the API serves the built web app, the simulation and the claim pages on one port. It needs no database server, no paid service and no API key. On every boot it generates the demo day and seeds SQLite if needed, so a restart on a free host always comes back demo-ready.

| Host | Role | Cost | Notes |
|---|---|---|---|
| Hugging Face Spaces (Docker) | Primary playground | Free | 2 vCPU, 16 GB RAM, HTTPS, supports SSE. Sleeps after about 48 h without visits. |
| Render web service | Backup URL | Free | 512 MB RAM (the app uses about 150 MB). Sleeps after 15 min idle. |
| UptimeRobot | Keep-alive | Free | Pings both every 5 minutes so neither sleeps during review. |

## 1. Hugging Face Spaces (primary)

1. Create a free account at huggingface.co, then **New Space**: SDK **Docker**, template **Blank**, hardware **CPU basic (free)**, visibility **Public**.
2. In the Space **Settings > Variables and secrets** add:
   - `PUBLIC_BASE_URL` = the Space's direct URL, for example `https://<user>-dwellcast.hf.space` (this is what promo QR codes encode).
   - `CLAIM_SECRET` (secret) = any random string of 32+ characters.
3. Push this repository to the Space's git remote (the Space URL plus `.git`). The `README.md` front matter already tells Spaces to use Docker on port 7860.
4. Wait for the build (about 3 to 5 minutes), then open the Space. `GET /api/health` should return `"status":"ok"`.

## 2. Render (backup)

1. Create a free account at render.com and connect your GitHub account.
2. **New > Blueprint**, pick this repository; Render reads `render.yaml` (free Docker web service, health check `/api/health`).
3. After the first deploy, set `PUBLIC_BASE_URL` to the service URL (for example `https://dwellcast.onrender.com`) in the service's **Environment** tab and redeploy.

## 3. UptimeRobot (keep-alive)

1. Create a free account at uptimerobot.com.
2. Add two **HTTP(s)** monitors, interval **5 minutes**:
   - `https://<user>-dwellcast.hf.space/api/health`
   - `https://dwellcast.onrender.com/api/health`

## Checks after deploying

- Open `/demo` and press **Worked example (Gate 42, 14:10)**: the Gate 42 screen shows the perfume offer.
- Scan the QR on the screen with a phone: the claim page opens on the deployed URL and the redemption appears on the right-hand retailer panel.
- `GET /api/sim` shows the AODB, AIDX and ACRIS feeds as `ok`.

## Local options

- `npm install` then `npm run dev`: web on http://localhost:5173, API on http://localhost:4000. QR codes use the laptop's Wi-Fi address automatically, so a phone on the same Wi-Fi can scan them (allow Node through the Windows firewall if asked).
- `docker compose up`: web on http://localhost:8080 with the API as a separate container, bound to localhost for safety. For phone scanning use `npm run dev` (it serves on the Wi-Fi address) or the deployed playground.

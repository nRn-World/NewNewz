# NewzLocal Cloudflare Worker — Quick Setup Guide

All edge backend logic for **NewzLocal** lives in this zero-dependency Cloudflare Worker (`worker/`):

- **CORS Proxy Routes:** Bing News (`/bn`), Google News (`/gn`), Official Police Feeds (`/police-feed`, strict HTTPS allowlist), Reddit (`/rd`), Flashback (`/fb`), Ekşi Sözlük (`/eksi`), Menéame (`/meneame`), and inline Reader metadata (`/meta`)
- **Background Mobile Web Push (`/push/*`):**
  - `GET /push/vapid` — Automatically generates and persists an ECDSA P-256 VAPID keypair inside Cloudflare KV (`SUBS_KV`) when custom VAPID secrets are not configured
  - `POST /push/subscribe` — Stores/updates encrypted push subscriptions, watched places (with `alertNews` / `alertForum` flags), topic filters, and quiet hours
  - `POST /push/test` — Sends an immediate encrypted RFC 8291 `aes128gcm` test notification to verify mobile delivery
  - `scheduled()` (`*/5 * * * *`) — Checks watched addresses, neighbourhoods, cities, and countries every 5 minutes for **both** new news articles and new forum discussions

## Automated Deployment via GitHub Actions (Recommended)

1. Open **[Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)**.
2. Click **Create Token** → select the **Edit Cloudflare Workers** template (ensuring **Workers Scripts: Edit** and **Workers KV Storage: Edit** permissions are included) → copy your token.
3. In your GitHub repository, open **Settings → Secrets and variables → Actions**:
   - Under **Secrets**, add `CLOUDFLARE_API_TOKEN` with your token.
4. Pushing to `main` (or running the **Deploy Cloudflare Worker** workflow) automatically:
   - Finds or creates the `newzlocal-subs` KV namespace and binds it as `SUBS_KV`
   - Deploys `newzlocal-proxy` with its 5-minute cron trigger
   - Passes the deployed Worker URL into the frontend build (`VITE_PROXY_URL`)

> Licensed under the [NewzLocal Non-Commercial Educational License (NNEL) v1.1](../LICENSE). For any commercial or service-licensing inquiries, contact **[bynrnworld@gmail.com](mailto:bynrnworld@gmail.com)**.

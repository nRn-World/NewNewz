# Cloudflare Worker — Snabbguide (2 minuter)

All backend-logik för NewzLocal (Google News `/gn`, Bing `/bn`, Reddit `/rd`, Flashback `/fb`, Ekşi Sözlük `/eksi`, Menéame `/meneame`, Reader-kort `/meta` samt Web Push-notiser `/push/*`) ligger samlad i denna enda Cloudflare Worker (`worker/`).

## Alternativ A: Automatisk deploy via GitHub Actions (rekommenderas)

1. Logga in på **[Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)**.
2. Klicka **Create Token** → välj mallen **Edit Cloudflare Workers** → kopiera din token.
3. Öppna ditt GitHub-repo: **[Settings → Secrets and variables → Actions](https://github.com/nRn-World/NewzLocal/settings/secrets/actions)**:
   - Under fliken **Secrets**: skapa `CLOUDFLARE_API_TOKEN` med din token.
   - Kör sedan workflown **Deploy Cloudflare Worker** under fliken **Actions** — den publicerar `newzlocal-proxy.<ditt-subdomän>.workers.dev`.
4. Under fliken **Variables** (bredvid Secrets):
   - Skapa `VITE_PROXY_URL` = `https://newzlocal-proxy.<ditt-subdomän>.workers.dev`
   - Skapa `VITE_GN_URL` = `https://newzlocal-proxy.<ditt-subdomän>.workers.dev/gn/rss/search`

*(Du kan även klistra in din Worker-URL direkt inne i NewzLocal under kugghjulet/källinställningarna för att testa den direkt i webbläsaren utan ombyggnad!)*

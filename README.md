<div align="center">

# 🌍 NewNewz

### Spin the globe. Enter any street or city. Read what is happening there, right now.

[![License: Educational Only](https://img.shields.io/badge/license-Educational%20Only%20(NNEL%20v1.1)-red)](LICENSE)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre-3D%20Globe-396cb2)
![Web Push](https://img.shields.io/badge/Web%20Push-RFC%208291%20%2B%20VAPID-d9381e)
![PWA](https://img.shields.io/badge/PWA-Installable-5a0fc8)
![Languages](https://img.shields.io/badge/Languages-7-brightgreen)

<img src="docs/globe.png" alt="NewNewz — interactive 3D globe with a classic broadsheet side panel" width="900">

</div>

---

## ✨ Overview

**NewNewz** is an installable **Progressive Web App (PWA)** built around a real-time **3D interactive globe** and a classic **broadsheet newspaper** reading experience.

Zoom seamlessly from the entire planet down to **country → province/state → city → district/neighbourhood → exact home street address**, and read the latest local press coverage and community forum discussions about *that exact place*. Save your home address or favourite neighbourhoods to receive **mobile push notifications** whenever breaking news or important forum threads appear.

> **Privacy-first by design:** No accounts, no tracking pixels, and no third-party analytics. Your saved places, categories, and bookmarks stay in your own browser (with optional encrypted RFC 8291 Web Push subscriptions for background alerts).

---

## 📸 Screenshots

<div align="center">

| Interactive 3D Globe | Local Broadsheet Feed |
|:---:|:---:|
| <img src="docs/globe.png" width="450" alt="3D Globe view"> | <img src="docs/news.png" width="450" alt="Local news feed"> |

</div>

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| 🏠 **Exact Home-Address & Venue Watch** | Search and monitor full street addresses (including house numbers and postal codes), venues, neighbourhoods, islands, cities, or entire countries. |
| 📰 **Strict Place Matching (Up to 100 Latest)** | Fetches up to **100 news headlines and 100 forum discussions** strictly mentioning the exact selected place—never diluted with unrelated parent-city stories. Toggle instantly between **Newest** (`#01` strictly chronological) and **Most Covered** (multi-outlet press clusters, reply counts & shared topic buzz). |
| 🛡️ **Official Local & National Police Feeds** | Integrates official government & local police APIs, RSS streams, and verified police portals across **60+ countries**—including **Polisen** (`polisen.se/api/events` + all 21 Swedish county RSS feeds), **Phuket Tourist Police / Phuket Provincial Police / local Phuket stations / Royal Thai Police** (`*.police.go.th`), **Politiet** (NO), **Politi Update** (DK), **Poliisi** (FI), **Politie** (NL), **Polizei / Blaulicht** (DE/AT/CH), **Met Police & police.uk** (GB), **NZ Police**, **QLD/AU Police**, **Europol**, and municipal police portals worldwide—strictly filtered to the selected place with a dedicated **Police** topic filter. |
| 💬 **Automatic Forum Spotlight** | Even when zero press articles exist for an exact street address, NewNewz automatically surfaces the **most important local forum threads & posts** right at the top of the feed—ranked by exact address match, urgent topics, community activity, and recency. |
| 📱 **Native Android APK + Mobile Push Alerts** | Automatically prompts visitors on `nrnworld.one/NewNewz` to install the signed **native Android app (`NewNewz.apk`, `nrnworld.newnewz`)** or Chrome WebAPK/PWA. Inside the Android APK, a persistent background `JobScheduler` service (`FavoriteNewsJobService`) checks up to **40 saved favourites directly on-device** (0 Worker cost, scaling to unlimited Android users) with automatic edge fallback, alongside RFC 8291 `aes128gcm` Web Push (up to **30 saved favourites**) for browser/PWA installs. |
| 🌐 **Interactive 3D Globe & Map Styles** | Powered by MapLibre GL with 3D terrain/buildings, admin boundary polygons (OpenStreetMap & geoBoundaries), street geometry highlighting, and instant switching between **Satellite**, **Broadsheet Paper**, and **Night** map modes. |
| 🗣️ **Global & Regional Discussion Sources** | Aggregates discussions from **Reddit**, **Lemmy**, **Flashback** (Sweden, including post-level `sp=1` search and relative timestamp parsing), **Ekşi Sözlük** (Türkiye), **Menéame** (Spain), **Hacker News**, and **Stack Exchange**. |
| 🗞️ **Broadsheet Print Edition & "My Paper"** | Render any place's feed—or a combined front page of all your watched favourites—into a multi-page vintage newspaper layout, complete with shareable **newspaper clipping cards**. |
| 📖 **Inline Reader Cards & Bookmarks** | Expand stories inline for article previews and thumbnails, cluster duplicate multi-source coverage of the same incident, and bookmark stories for offline reference. |
| 🌦️ **Live Local Weather & Heat Overlay** | Displays current local weather (with severe-weather indicators), neighbourhood news-intensity heatmaps, topic breakdown bars, and historical archive time-travel (`1m`, `3m`, `6m`, `1y`). |
| 🌍 **7 Languages with Auto-Translation** | Full UI and automatic headline/snippet translation across **English**, **Svenska**, **Türkçe**, **العربية (RTL)**, **Español**, **Français**, and **Deutsch**. |

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** React 19, TypeScript 6, Vite 8, custom broadsheet CSS typography (`Fraunces`, `Playfair Display`, `Old Standard TT`, `Courier Prime`, `Alfa Slab One`)
- **Mapping & Geospatial:** MapLibre GL JS (3D globe projection), Photon, Nominatim, Overpass API, geoBoundaries, Open-Meteo
- **News & Community Feeds:** Bing News RSS, Google News RSS, GDELT DOC 2.0 Global API, Reddit, Lemmy, Flashback, Ekşi Sözlük, Menéame, Hacker News (Algolia), Stack Exchange
- **Edge Proxy & Self-Scaling Background Web Push (`worker/`):** Zero-dependency Cloudflare Worker with 180s Cloudflare CDN edge caching, automatic P-256 VAPID key generation/persistence in Cloudflare KV (`SUBS_KV`), auto-provisioned Cloudflare D1 SQL (`SUBS_DB`) + KV subscription storage, cross-subscriber place deduplication, automatic cron sharding within free-tier subrequest budgets, and zero-idle-write diffing (writing only when fresh stories arrive)
- **Quality & CI/CD:** `oxlint`, `vitest`, TypeScript strict builds, and automated GitHub Actions deployment for both GitHub Pages and Cloudflare Workers

---

## ▶️ Getting Started (Educational & Local Development)

**Prerequisites:** Node.js **20+** and npm

```bash
git clone https://github.com/nRn-World/NewNewz.git
cd NewNewz
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Scripts

```bash
npm run dev       # Start local Vite dev server
npm run lint      # Run oxlint static analysis
npm test          # Run Vitest unit & Web Push crypto test suite
npm run build     # Type-check and build production bundle into dist/
npm run preview   # Preview production build locally
```

For details on deploying the optional Cloudflare Worker (CORS proxy + background Web Push notifications), see [`worker/README.md`](worker/README.md).

---

## 📜 License & Commercial / Service Inquiries

This project is licensed under the **[NewNewz Non-Commercial Educational License (NNEL) v1.1](LICENSE)**.

### Summary of Terms

- ✅ **Educational Use Permitted:** Students, educators, and researchers may inspect, study, and run this project **strictly for non-commercial educational and learning purposes**, provided clear visible credit to **"NewNewz by nRnWorld"** is retained.
- ❌ **No Copying of the Service & No Monetization:** You may **not** copy, clone, rebrand, deploy as a public/competing service, sell, sublicense, display ads on, or earn money (directly or indirectly) from this project or any derivative work without prior written permission.
- 🤝 **Companies, Individuals & Commercial / Service Licensing:**  
  If a **company, organization, or private individual** wishes to use, copy, integrate, host, or monetize any part of NewNewz, you **must contact the author first and reach a mutual written agreement** before doing so:

  📧 **Contact:** **[bynrnworld@gmail.com](mailto:bynrnworld@gmail.com)**

  In your email, please describe:
  1. **Who you are** (individual, startup, organization, or company),
  2. **Your goals and intended purpose** for using or building upon the project, and
  3. **What you can offer** in exchange for a license to use, adapt, or operate the service.

See the full legal text in **[LICENSE](LICENSE)**. Third-party data providers and APIs remain subject to their respective terms of service.

---

<div align="center">

**Created by [nRnWorld](https://nrnworld.one)** · [Website](https://nrnworld.one) · [GitHub](https://github.com/nRn-World) · [bynrnworld@gmail.com](mailto:bynrnworld@gmail.com)

*If you find this project inspiring for learning, consider giving the repository a ⭐*

</div>

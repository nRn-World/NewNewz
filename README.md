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
![Languages](https://img.shields.io/badge/Languages-8-brightgreen)

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
| 📰 **Multi-Engine Global News (Up to 100 Latest)** | Aggregates up to **100 strictly place-matched headlines** in parallel from **Google News**, **Bing News**, **Yahoo News**, **GDELT DOC 2.0**, and **35+ countries' direct broadcaster & newspaper RSS feeds** (SVT, DN, Aftonbladet, BBC, Guardian, NPR, Tagesschau, France 24, Euronews, Al Jazeera, Rudaw, NHK, etc.)—with 1-click manual refresh (`↻`), **Newest** vs. **Most Covered** sorting, and chronological **Story Timelines** uniting police, press, and forum updates. |
| 🛡️ **Official Local & National Police Feeds** | Integrates official government & local police APIs, RSS streams, and verified police portals across **60+ countries**—including **Polisen** (`polisen.se/api/events` + all 21 Swedish county RSS feeds), **Phuket Tourist Police / Royal Thai Police** (`*.police.go.th`), **Politiet** (NO), **Politi Update** (DK), **Poliisi** (FI), **Politie** (NL), **Polizei / Blaulicht** (DE/AT/CH), **Met Police & police.uk** (GB), **NZ Police**, **QLD/AU Police**, and **Europol / Interpol**. |
| 🎯 **Radius Watch & Custom RSS Feeds** | Draw a **1 km / 5 km / 15 km** watch circle directly on the 3D globe to pull nearby GPS-tagged police & local alerts, and paste any custom `https://` RSS/Atom feed (or add 1-click presets like SVT, Yahoo News, BBC, Euronews, Samsung Newsroom, Rudaw). |
| 🗣️ **Global & National Current-Events Forums** | Searches **45+ countries' biggest local discussion sites** (Flashback, Ekşi Sözlük, İnci Sözlük, Kvinneguiden, Vauva.fi, Ylilauta, NiniSite, PersianTools, Insomnia.gr, Mumsnet, Digital Spy, Boards.ie, Jeuxvideo, ForoCoches, Menéame, Wykop, Forum.hr, Klix, Pantip, 5ch, DC Inside, Zhihu, PTT, LIHKG, Nairaland, MyBroadband, Whirlpool, etc.) plus **95+ country & 110+ city subreddits**, Lemmy/Fediverse, Hacker News, and Stack Exchange—with automatic global fallback for every country on Earth. |
| 💾 **Zero-Account Backup & Device Sync** | Export and import all favourites, categories, quiet hours, custom RSS feeds, and saved bookmarks as a validated JSON backup file to move seamlessly between desktop and mobile without creating an account. |
| 🗞️ **Broadsheet Print Edition & "My Paper"** | Render any place's feed—or a combined front page of all your watched favourites—into a multi-page vintage newspaper layout, complete with shareable **newspaper clipping cards**. |
| 📖 **Inline Reader Cards & Bookmarks** | Expand stories inline for article previews and thumbnails, cluster duplicate multi-source coverage of the same incident, and bookmark stories for offline reference. |
| 🌦️ **Live Local Weather & Heat Overlay** | Displays current local weather (with severe-weather indicators), neighbourhood news-intensity heatmaps, topic breakdown bars, and historical archive time-travel (`1m`, `3m`, `6m`, `1y`). |
| 🌍 **8 Languages with Auto-Translation** | Full UI and automatic headline/snippet translation across **English**, **Svenska**, **Türkçe**, **العربية (RTL)**, **Español**, **Français**, **Deutsch**, and **Kurdî**. |

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** React 19, TypeScript 6, Vite 8, custom broadsheet CSS typography (`Fraunces`, `Playfair Display`, `Old Standard TT`, `Courier Prime`, `Alfa Slab One`)
- **Mapping & Geospatial:** MapLibre GL JS (3D globe projection), Photon, Nominatim, Overpass API, geoBoundaries, Open-Meteo
- **News & Community Feeds:** Google News RSS, Bing News RSS, Yahoo News RSS, GDELT DOC 2.0 Global API, 35+ countries' direct broadcaster RSS feeds, user-defined custom RSS/Atom feeds, Reddit (95+ countries & 110+ cities + automatic global fallback), 45+ national current-events forums (Flashback, Ekşi Sözlük, NiniSite, Insomnia.gr, Pantip, 5ch, DC Inside, PTT, Nairaland, Mumsnet, Wykop, etc.), Lemmy/Fediverse, Hacker News (Algolia), and Stack Exchange
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

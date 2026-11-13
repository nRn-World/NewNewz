import { norm } from './areas'
import type { Article } from './lib'

const COUNTRY_SUBS: Record<string, string[]> = {
  SE: ['sweden', 'svenskpolitik'],
  NO: ['norge'],
  DK: ['Denmark'],
  FI: ['Suomi'],
  TR: ['Turkey'],
  DE: ['de', 'FragReddit'],
  AT: ['Austria'],
  CH: ['Switzerland'],
  FR: ['france', 'AskFrance'],
  ES: ['es', 'spain'],
  IT: ['italy'],
  NL: ['thenetherlands'],
  BE: ['belgium'],
  PL: ['Polska'],
  PT: ['portugal'],
  GR: ['greece'],
  GB: ['unitedkingdom', 'CasualUK'],
  IE: ['ireland'],
  US: ['news'],
  CA: ['canada'],
  AU: ['australia'],
  NZ: ['newzealand'],
  BR: ['brasil'],
  MX: ['mexico'],
  AR: ['argentina'],
  AE: ['dubai', 'UAE'],
  SA: ['saudiarabia'],
  EG: ['Egypt'],
  MA: ['Morocco'],
  LB: ['lebanon'],
  IQ: ['Iraq'],
  IN: ['india'],
  JP: ['japan', 'japanlife'],
  KR: ['korea'],
  TH: ['Thailand', 'ThailandTourism'],
  ID: ['indonesia', 'bali'],
  VN: ['VietNam'],
  PH: ['Philippines'],
  SG: ['singapore'],
  MY: ['malaysia'],
  HK: ['HongKong'],
  TW: ['taiwan'],
  ZA: ['southafrica'],
  UA: ['ukraine'],
}

const CITY_SUBS: Record<string, string> = {
  stockholm: 'stockholm',
  goteborg: 'gothenburg',
  gothenburg: 'gothenburg',
  malmo: 'malmo',
  uppsala: 'uppsala',
  lund: 'lund',
  umea: 'umea',
  orebro: 'orebro',
  linkoping: 'linkoping',
  helsingborg: 'helsingborg',
  oslo: 'oslo',
  kobenhavn: 'copenhagen',
  copenhagen: 'copenhagen',
  istanbul: 'istanbul',
  ankara: 'ankara',
  izmir: 'Izmir',
  antalya: 'Antalya',
  berlin: 'berlin',
  munchen: 'Munich',
  munich: 'Munich',
  hamburg: 'hamburg',
  frankfurt: 'frankfurt',
  koln: 'cologne',
  paris: 'paris',
  lyon: 'Lyon',
  marseille: 'marseille',
  madrid: 'Madrid',
  barcelona: 'Barcelona',
  valencia: 'valencia',
  london: 'london',
  manchester: 'manchester',
  edinburgh: 'Edinburgh',
  dublin: 'Dublin',
  amsterdam: 'Amsterdam',
  wien: 'wien',
  vienna: 'wien',
  zurich: 'zurich',
  roma: 'rome',
  milano: 'milano',
  tokyo: 'Tokyo',
  dubai: 'dubai',
  cairo: 'Cairo',
  phuket: 'phuket',
  bangkok: 'Bangkok',
  chiangmai: 'chiangmai',
  'chiang mai': 'chiangmai',
  bali: 'bali',
}

/** Country and city subreddits relevant to a selected place (city subreddit first so local hits take priority). */
export function localSubreddits(cc: string, placeNames: string[]): string[] {
  const out = new Set<string>()
  for (const name of placeNames) {
    const citySub = CITY_SUBS[norm(name)]
    if (citySub) out.add(citySub)
  }
  for (const cSub of COUNTRY_SUBS[cc.toUpperCase()] ?? []) {
    out.add(cSub)
  }
  return [...out].slice(0, 4)
}

function timeoutSig(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

/** Open CORS Fediverse / Lemmy discussion search (including German feddit.org & French jlai.lu instances). */
export async function lemmyDiscussions(query: string, cc: string, signal?: AbortSignal): Promise<Article[]> {
  const upper = cc.toUpperCase()
  const host = upper === 'DE' || upper === 'AT' || upper === 'CH' ? 'https://feddit.org' : upper === 'FR' ? 'https://jlai.lu' : 'https://lemmy.world'
  const label = host === 'https://feddit.org' ? 'feddit' : host === 'https://jlai.lu' ? 'jlai.lu' : 'lemmy'
  try {
    const r = await fetch(`${host}/api/v3/search?type_=Posts&sort=New&limit=50&q=${encodeURIComponent(query)}`, {
      signal: timeoutSig(signal, 6000),
    })
    if (!r.ok) return []
    const j = (await r.json()) as {
      posts?: {
        post?: { ap_id?: string; name?: string; body?: string; published?: string; thumbnail_url?: string }
        community?: { name?: string }
        counts?: { comments?: number; score?: number }
      }[]
    }
    return (j.posts ?? [])
      .map((item) => {
        const p = item.post
        const comm = item.community?.name
        const comments = item.counts?.comments ?? 0
        const ups = item.counts?.score ?? 0
        const baseSrc = comm ? `${label} !${comm}` : label
        return {
          url: p?.ap_id ?? '',
          title: (p?.name ?? '').trim(),
          summary: p?.body ? p.body.replace(/[#>*_`[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260) : undefined,
          image: p?.thumbnail_url || undefined,
          source: comments > 0 ? `${baseSrc} (${comments})` : baseSrc,
          date: new Date(p?.published ?? ''),
          comments,
          score: comments * 3 + Math.max(0, ups),
          forum: true,
        }
      })
      .filter((a) => a.url && a.title && !isNaN(+a.date))
  } catch {
    return []
  }
}

/** Country-specific regional forums (Menéame in Spain, Ekşi Sözlük in Turkey via Worker/bridge). */
export async function regionalDiscussions(
  query: string,
  cc: string,
  apiBase: string,
  proxyBlocked: boolean,
  signal?: AbortSignal,
): Promise<Article[]> {
  const upper = cc.toUpperCase()

  // Spain: Menéame RSS
  if (upper === 'ES') {
    const rssTarget = `https://www.meneame.net/rss?q=${encodeURIComponent(query)}`
    const url = apiBase ? `${apiBase}/meneame?q=${encodeURIComponent(query)}` : `https://api.allorigins.win/raw?url=${encodeURIComponent(rssTarget)}`
    try {
      const r = await fetch(url, { signal: timeoutSig(signal, 6000) })
      if (!r.ok) return []
      const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
      return [...doc.querySelectorAll('item')]
        .map((i) => ({
          url: i.querySelector('link')?.textContent ?? '',
          title: (i.querySelector('title')?.textContent ?? '').trim(),
          summary: (i.querySelector('description')?.textContent ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) || undefined,
          source: 'menéame',
          date: new Date(i.querySelector('pubDate')?.textContent ?? ''),
          forum: true,
          lang: 'es',
        }))
        .filter((a) => a.url && a.title && !isNaN(+a.date))
    } catch {
      return []
    }
  }

  // Turkey: Ekşi Sözlük when Worker is connected
  if (upper === 'TR' && (apiBase || !proxyBlocked)) {
    try {
      if (apiBase) {
        const r = await fetch(`${apiBase}/eksi?q=${encodeURIComponent(query)}`, { signal: timeoutSig(signal, 6000) })
        if (r.ok) {
          const j = (await r.json()) as { items?: { url: string; title: string; date?: string }[] }
          return (j.items ?? []).map((x) => ({
            url: x.url,
            title: x.title,
            source: 'ekşi sözlük',
            date: x.date ? new Date(x.date) : new Date(),
            approx: !x.date,
            forum: true,
            lang: 'tr',
          }))
        }
      }
    } catch {
      /* ignore */
    }
  }

  return []
}

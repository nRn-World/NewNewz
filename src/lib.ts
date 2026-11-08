import { norm } from './areas'
import { clusterArticles, type RelatedItem } from './cluster'
import { editionFor, wordsFor } from './editions'
import { lemmyDiscussions, localSubreddits, regionalDiscussions } from './forums'

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_PROXY_URL || import.meta.env.VITE_API_URL) as string | undefined
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  try {
    const custom = localStorage.getItem('newzlocal.workerUrl')?.trim()
    if (custom && /^https:\/\/[a-z0-9.-]+/i.test(custom)) return custom.replace(/\/+$/, '')
  } catch { /* ignore */ }
  return ''
}

/** Origin of the news/forum proxy (a Cloudflare Worker in production; empty = Vite's dev proxy). */
const API = resolveApiBase()

export type Level = 'street' | 'district' | 'city' | 'state' | 'country'
export type Part = { level: Level; name: string }
export type Place = { lat: number; lon: number; cc?: string; parts: Part[]; cat?: string; alert?: string[] } // parts: most specific first
export type Article = {
  url: string
  title: string
  source: string
  date: Date
  summary?: string
  image?: string
  forum?: boolean
  orig?: string
  approx?: boolean
  lang?: string
  also?: RelatedItem[]
}

const PHOTON = 'https://photon.komoot.io'

type Feat = { geometry: { coordinates: [number, number] }; properties: Record<string, string> }

export function toPlace(f: Feat): Place {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  const parts: Part[] = []
  const add = (level: Level, name?: string) => {
    if (name && !parts.some((x) => norm(x.name) === norm(name))) parts.push({ level, name })
  }

  // Metropolitan / provincial capitals (e.g. Diyarbakır, İstanbul, Stockholm, Madrid) often sit inside a central
  // sub-municipality (`p.city = "Sur"` while `p.name = "Diyarbakır"` and `p.state = "Diyarbakır"`). Never invert them.
  const isMetroCapital =
    p.type !== 'street' &&
    !p.street &&
    !!p.name &&
    !!p.state &&
    norm(p.name) === norm(p.state)

  if (isMetroCapital) {
    add(p.type === 'state' ? 'state' : 'city', p.name)
    add('country', p.country)
    return { lat, lon, parts, cc: p.countrycode }
  }

  const isSettlement = p.type === 'city' || p.type === 'town' || p.type === 'village' || p.osm_value === 'city' || p.osm_value === 'town'
  add('street', p.street || (p.type === 'street' ? p.name : undefined))
  if (!isSettlement) {
    add('district', p.district || p.locality || (p.type === 'district' || p.type === 'locality' ? p.name : undefined))
  }
  add('city', (isSettlement ? p.name : undefined) || p.city || p.county)
  add('state', p.state || (p.type === 'state' ? p.name : undefined))
  add('country', p.country)
  return { lat, lon, parts, cc: p.countrycode }
}

const pl = (_lang: string) => 'default'

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

async function photon(q: string, lang: string, signal?: AbortSignal): Promise<Place[]> {
  const r = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=6&lang=${pl(lang)}`, { signal: withTimeout(signal, 8000) })
  if (!r.ok) throw new Error('err.search')
  return ((await r.json()).features as Feat[]).map(toPlace).filter((p) => p.parts.length)
}

type NomHit = { lat: string; lon: string; name: string; namedetails?: { name?: string }; address: Record<string, string> }

let nomNext = 0
/** Nominatim finds towns, suburbs and villages that Photon ranks below streets (e.g. the suburb Kista). Polite 1 req/s spacing. */
async function nominatim(q: string, signal?: AbortSignal): Promise<Place[]> {
  const wait = nomNext - Date.now()
  nomNext = Math.max(Date.now(), nomNext) + 1050
  if (wait > 0) await abortableSleep(wait, signal)
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&namedetails=1&limit=5&featureType=settlement&accept-language=zz`,
    { signal: withTimeout(signal, 8000) },
  )
  if (!r.ok) return []
  return ((await r.json()) as NomHit[]).map((x) => {
    const a = x.address
    const name = x.namedetails?.name ?? x.name
    const parts: Part[] = [{ level: 'city', name }]
    const up = [a.city, a.state, a.municipality].find((v) => v && norm(v) !== norm(name))
    if (up) parts.push({ level: 'state', name: up })
    if (a.country) parts.push({ level: 'country', name: a.country })
    return { lat: +x.lat, lon: +x.lon, cc: a.country_code, parts }
  })
}

const searchCache = new Map<string, Place[]>()

/** Photon matches strictly, so "Ribegatan Kista" finds nothing; retry with fewer words until something matches. */
export async function search(q: string, lang = 'en', signal?: AbortSignal): Promise<Place[]> {
  const clean = q.trim()
  if (!clean) return []
  const cached = searchCache.get(clean.toLowerCase())
  if (cached) return cached
  const words = clean.split(/[\s,]+/).filter(Boolean)
  for (let n = words.length; n >= 1; n--) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const text = words.slice(0, n).join(' ')
    const [ph, nom] = await Promise.allSettled([photon(text, lang, signal), nominatim(text, signal)])
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const photonHits = ph.status === 'fulfilled' ? ph.value : []
    const own = new Map(photonHits.map((h) => [label(h), h]))
    const noms = (nom.status === 'fulfilled' ? nom.value : []).map((h) => own.get(label(h)) ?? h)
    const exact = [...photonHits, ...noms].filter((h) => norm(h.parts[0].name) === norm(text))
    const hits = [...exact, ...photonHits, ...noms]
    if (hits.length) {
      const deduped = [...new Map(hits.map((h) => [label(h), h])).values()]
      searchCache.set(clean.toLowerCase(), deduped)
      return deduped
    }
    if (ph.status === 'rejected' && nom.status === 'rejected') throw new Error('err.search')
  }
  return []
}

const revCache = new Map<string, Place | null>()

export async function reverse(lat: number, lon: number, lang = 'en', signal?: AbortSignal): Promise<Place | null> {
  const ck = `r:${lat.toFixed(4)},${lon.toFixed(4)}`
  if (revCache.has(ck)) return revCache.get(ck)!
  const r = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=${pl(lang)}`, { signal: withTimeout(signal, 8000) })
  if (!r.ok) throw new Error('err.place')
  const f = ((await r.json()).features as Feat[])[0]
  const res = f ? { ...toPlace(f), lat, lon } : null
  revCache.set(ck, res)
  return res
}

/** Country under a point; Nominatim copes with remote land where Photon's radius search finds nothing. */
export async function reverseCountry(lat: number, lon: number, _lang = 'en', signal?: AbortSignal): Promise<Place | null> {
  const ck = `c:${lat.toFixed(2)},${lon.toFixed(2)}`
  if (revCache.has(ck)) return revCache.get(ck)!
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&namedetails=1&lat=${lat}&lon=${lon}`, {
    signal: withTimeout(signal, 8000),
  })
  if (!r.ok) throw new Error('err.place')
  const j = (await r.json()) as { address?: { country?: string; country_code?: string }; namedetails?: { name?: string } }
  const a = j.address
  const name = j.namedetails?.name ?? a?.country
  const res: Place | null = a && name ? { lat, lon, cc: a.country_code, parts: [{ level: 'country', name }] } : null
  revCache.set(ck, res)
  return res
}

// Circuit-breaker for local dev proxy (e.g. static GitHub Pages without Worker, or sandboxed preview without outbound Node TLS)
const isStaticHostWithoutProxy =
  !API && typeof location !== 'undefined' && /\.(github\.io|pages\.dev|netlify\.app)$/i.test(location.hostname)
let localProxyDownUntil = isStaticHostWithoutProxy ? Number.MAX_SAFE_INTEGER : 0
const isLocalProxyBlocked = () => !API && Date.now() < localProxyDownUntil
const markLocalProxyDown = () => {
  if (!API) localProxyDownUntil = Date.now() + 180_000
}

function cleanSnippet(rawHtml: string, title: string, source: string): string | undefined {
  if (!rawHtml) return undefined
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html')
  // Google News multi-perspective <ol><li><a>Headline</a> <font>Publisher</font></li></ol>
  const liItems = [...parsed.querySelectorAll('li')]
    .map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((txt) => txt && norm(txt) !== norm(title) && norm(txt) !== norm(`${title} ${source}`))
  if (liItems.length > 1) {
    return liItems.slice(0, 3).map((s) => `• ${s}`).join(' ')
  }
  const plain = (parsed.body?.textContent ?? rawHtml)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain || plain.length < 28) return undefined
  const nt = norm(title)
  const np = norm(plain)
  if (np === nt || np === norm(`${title} ${source}`) || (nt.length > 15 && np.startsWith(nt) && plain.length < title.length + source.length + 16)) {
    return undefined
  }
  return plain.slice(0, 320)
}

function extractItemImage(item: Element): string | undefined {
  const media =
    item.getElementsByTagNameNS('*', 'content')[0]?.getAttribute('url') ??
    item.getElementsByTagNameNS('*', 'thumbnail')[0]?.getAttribute('url') ??
    item.getElementsByTagNameNS('*', 'Image')[0]?.textContent ??
    item.querySelector('enclosure[type^="image"]')?.getAttribute('url')
  if (media && /^https:\/\//i.test(media.trim())) return media.trim()
  return undefined
}

const interval = (when: string) => {
  const m = /^(\d+)([hdy])$/.exec(when)
  if (!m) return ''
  const h = +m[1] * { h: 1, d: 24, y: 8760 }[m[2] as 'h' | 'd' | 'y']
  return h <= 1 ? 4 : h <= 24 ? 7 : h <= 168 ? 8 : h <= 720 ? 9 : ''
}

function parseGoogleRssXml(xmlText: string, lang: string): Article[] {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('err.source')
  const seen = new Set<string>()
  return [...doc.querySelectorAll('item')]
    .map((i) => {
      const source = i.querySelector('source')?.textContent ?? ''
      const raw = i.querySelector('title')?.textContent ?? ''
      const title = source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw
      const desc = i.querySelector('description')?.textContent ?? ''
      return {
        url: i.querySelector('link')?.textContent ?? '',
        title,
        summary: cleanSnippet(desc, title, source),
        image: extractItemImage(i),
        source,
        date: new Date(i.querySelector('pubDate')?.textContent ?? ''),
        lang,
      }
    })
    .filter((a) => a.url && !seen.has(a.title) && seen.add(a.title))
}

async function bingHeadlines(query: string, country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  if (isLocalProxyBlocked()) throw new Error('err.source')
  const ed = editionFor(country)
  const iv = interval(when)
  let r: Response
  try {
    r = await fetch(
      `${API}/bn/news/search?q=${encodeURIComponent(query)}&format=rss&cc=${ed.cc}&setlang=${ed.hl}&sortbydate=1${iv ? `&qft=${encodeURIComponent(`interval="${iv}"`)}` : ''}`,
      { cache: 'no-store', signal: withTimeout(signal, 4500) },
    )
  } catch (e) {
    if (!signal?.aborted) markLocalProxyDown()
    throw e
  }
  if (!r.ok) {
    if (r.status === 404 || r.status >= 500) markLocalProxyDown()
    throw new Error('err.source')
  }
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
  const seen = new Set<string>()
  return [...doc.querySelectorAll('item')]
    .map((i) => {
      const link = i.querySelector('link')?.textContent ?? ''
      let url = link
      try { url = new URL(link).searchParams.get('url') ?? link } catch { /* keep Bing's redirect link */ }
      const title = i.querySelector('title')?.textContent ?? ''
      const source = i.getElementsByTagNameNS('*', 'Source')[0]?.textContent ?? ''
      const desc = i.querySelector('description')?.textContent ?? ''
      return {
        url,
        title,
        summary: cleanSnippet(desc, title, source),
        image: extractItemImage(i),
        source,
        date: new Date(i.querySelector('pubDate')?.textContent ?? ''),
        lang: ed.lang,
      }
    })
    .filter((a) => a.url && !seen.has(a.title) && seen.add(a.title))
}

// Google News RSS via VITE_GN_URL or /gn proxy, with automatic browser-direct CORS failover when no backend proxy is reachable.
const GN_ENV = import.meta.env.VITE_GN_URL as string | undefined

async function googleHeadlinesBrowserCors(targetRssUrl: string, lang: string, signal?: AbortSignal): Promise<Article[]> {
  const bridges = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetRssUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetRssUrl)}`,
  ]
  let lastErr: unknown
  for (const bridgeUrl of bridges) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const r = await fetch(bridgeUrl, { signal: withTimeout(signal, 6500) })
      if (!r.ok) continue
      const items = parseGoogleRssXml(await r.text(), lang)
      return items
    } catch (e) {
      if (signal?.aborted) throw e
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('err.source')
}

async function googleHeadlines(query: string, country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  const ed = editionFor(country)
  const q = when ? (when.includes(':') ? `${query} ${when}` : `${query} when:${when}`) : query
  const qs = `q=${encodeURIComponent(q)}&hl=${encodeURIComponent(ed.hl)}&gl=${ed.cc}&ceid=${encodeURIComponent(ed.ceid)}`
  const canonicalRss = `https://news.google.com/rss/search?${qs}`

  if (GN_ENV || !isLocalProxyBlocked()) {
    try {
      const base = GN_ENV ?? `${API}/gn/rss/search`
      const r = await fetch(`${base}?${qs}`, { cache: 'no-store', signal: withTimeout(signal, GN_ENV || API ? 5000 : 2200) })
      if (r.ok) return parseGoogleRssXml(await r.text(), ed.lang)
      if (!GN_ENV && (r.status === 404 || r.status >= 500)) markLocalProxyDown()
    } catch (e) {
      if (signal?.aborted) throw e
      if (!GN_ENV) markLocalProxyDown()
    }
  }

  return googleHeadlinesBrowserCors(canonicalRss, ed.lang, signal)
}

/** Parses GDELT DOC 2.0 `YYYYMMDDTHHmmssZ` timestamps into JS Dates. */
export function parseGdeltDate(s: string): Date {
  const iso = s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')
  return new Date(iso)
}

/**
 * GDELT DOC 2.0 Global News API — 100 % open, keyless, native browser CORS (`Access-Control-Allow-Origin: *`),
 * covering local press in 100+ languages worldwide without needing any proxy server.
 */
async function gdeltHeadlines(query: string, _country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  // Expand non-ASCII place phrases with their ASCII equivalent ("Diyarbakır" -> ("Diyarbakır" OR "Diyarbakir"))
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  const clauses = phrases.length
    ? phrases.map((p) => {
        const ascii = p.replace(/İ/g, 'I').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        return ascii !== p && /^[A-Za-z0-9\s-]+$/.test(ascii) ? `("${p}" OR "${ascii}")` : `"${p}"`
      })
    : [query]
  const gq = clauses.join(' ')

  let timeParam = '&timespan=3m'
  const arch = /after:(\d{4})-(\d{2})-(\d{2})\s+before:(\d{4})-(\d{2})-(\d{2})/.exec(when)
  if (arch) {
    timeParam = `&STARTDATETIME=${arch[1]}${arch[2]}${arch[3]}000000&ENDDATETIME=${arch[4]}${arch[5]}${arch[6]}235959`
  } else if (/^\d+[hdwmy]$/.test(when)) {
    timeParam = `&timespan=${when === '1y' ? '1y' : when}`
  }

  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(gq)}&mode=ArtList&maxrecords=75&format=json&sort=DateDesc${timeParam}`
  const r = await fetch(url, { signal: withTimeout(signal, 8000) })
  if (!r.ok) throw new Error('err.source')
  const txt = await r.text()
  if (!txt.trim().startsWith('{')) return []
  const j = JSON.parse(txt) as { articles?: { url: string; title: string; domain?: string; seendate?: string; socialimage?: string }[] }
  const seen = new Set<string>()
  return (j.articles ?? [])
    .map((a) => ({
      url: a.url,
      title: (a.title ?? '').trim(),
      image: a.socialimage && /^https:\/\//i.test(a.socialimage) ? a.socialimage : undefined,
      source: (a.domain ?? '').replace(/^www\./, ''),
      date: parseGdeltDate(a.seendate ?? ''),
    }))
    .filter((a) => a.url && a.title && !isNaN(+a.date) && !seen.has(a.title) && seen.add(a.title))
}

async function headlines(query: string, country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  if (isLocalProxyBlocked() && !GN_ENV) {
    // When running without a backend proxy, race browser CORS RSS and GDELT in parallel for fast <2s response
    const settled = await Promise.allSettled([
      googleHeadlines(query, country, when, signal),
      gdeltHeadlines(query, country, when, signal),
    ])
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const combined = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
    if (combined.length || settled.some((s) => s.status === 'fulfilled')) return combined
    throw new Error('err.source')
  }
  try {
    return await googleHeadlines(query, country, when, signal)
  } catch (e) {
    if (signal?.aborted) throw e
  }
  try {
    return await bingHeadlines(query, country, when, signal)
  } catch (e) {
    if (signal?.aborted) throw e
  }
  return gdeltHeadlines(query, country, when, signal)
}

/** GNews and NewsData.io (free-plan keys live in the Worker; reserved for sparse places where RSS finds very little). */
async function keyed(query: string, cc: string, signal?: AbortSignal): Promise<Article[]> {
  if (!API) return []
  const { lang } = editionFor(cc)
  const q = query.replace(/"/g, '')
  const [g, n] = await Promise.allSettled([
    fetch(`${API}/gnews/search?q=${encodeURIComponent(query)}&lang=${lang}&max=10&sortby=publishedAt`, { signal: withTimeout(signal, 6000) }).then((r) =>
      r.ok ? r.json() : Promise.reject(),
    ),
    fetch(`${API}/nd/latest?q=${encodeURIComponent(q)}&language=${lang}`, { signal: withTimeout(signal, 6000) }).then((r) => (r.ok ? r.json() : Promise.reject())),
  ])
  const a: Article[] = []
  if (g.status === 'fulfilled') for (const x of g.value.articles ?? []) a.push({ url: x.url, title: x.title, source: x.source?.name ?? '', date: new Date(x.publishedAt), lang })
  if (n.status === 'fulfilled') for (const x of n.value.results ?? []) a.push({ url: x.link, title: x.title, source: x.source_name ?? '', date: new Date(`${x.pubDate}Z`.replace(' ', 'T')), lang })
  return a
}

/** Reddit posts mentioning the place (via /rd proxy when available, with direct browser JSON CORS fallback). */
const redditCache = new Map<string, { at: number; rows: Article[] }>()

async function reddit(query: string, max: number, sub = '', after = '', signal?: AbortSignal): Promise<Article[]> {
  const ck = `${sub}|${query}|${after}`
  const hit = redditCache.get(ck)
  if (hit && Date.now() - hit.at < 300_000) return hit.rows
  const rows = await redditFetch(query, max, sub, after, signal)
  redditCache.set(ck, { at: Date.now(), rows })
  return rows
}

async function redditFetch(query: string, max: number, sub: string, after: string, signal?: AbortSignal): Promise<Article[]> {
  const qs = `q=${encodeURIComponent(query)}&sort=new&limit=${Math.min(max, 100)}${after ? `&after=${after}` : ''}`
  if (!isLocalProxyBlocked()) {
    try {
      const base = sub ? `${API}/rd/r/${sub}/search.rss?restrict_sr=1&` : `${API}/rd/search.rss?`
      const r = await fetch(`${base}${qs}`, { cache: 'no-store', signal: withTimeout(signal, 4500) })
      if (r.ok) {
        const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
        return [...doc.querySelectorAll('entry')]
          .map((e) => ({
            url: e.querySelector('link')?.getAttribute('href') ?? '',
            title: e.querySelector('title')?.textContent ?? '',
            source: `reddit ${e.querySelector('category')?.getAttribute('label') ?? ''}`.trim(),
            date: new Date(e.querySelector('updated')?.textContent ?? ''),
            forum: true,
          }))
          .filter((a) => a.url.includes('/comments/') && a.title)
      }
      if (r.status >= 500) markLocalProxyDown()
    } catch (e) {
      if (signal?.aborted) throw e
      markLocalProxyDown()
    }
  }

  // Direct browser CORS fallback using Reddit's JSON endpoint
  const jsonUrl = sub
    ? `https://www.reddit.com/r/${sub}/search.json?restrict_sr=1&raw_json=1&${qs}`
    : `https://www.reddit.com/search.json?raw_json=1&${qs}`
  const r = await fetch(jsonUrl, { signal: withTimeout(signal, 6500) })
  if (!r.ok) throw new Error('err.source')
  const j = (await r.json()) as {
    data?: {
      children?: {
        data: {
          permalink: string
          title: string
          selftext?: string
          thumbnail?: string
          subreddit_name_prefixed?: string
          created_utc: number
        }
      }[]
    }
  }
  return (j.data?.children ?? [])
    .map(({ data: d }) => ({
      url: `https://www.reddit.com${d.permalink}`,
      title: d.title,
      summary: d.selftext ? d.selftext.replace(/\s+/g, ' ').trim().slice(0, 280) || undefined : undefined,
      image: d.thumbnail && /^https:\/\//i.test(d.thumbnail) ? d.thumbnail : undefined,
      source: `reddit ${d.subreddit_name_prefixed ?? ''}`.trim(),
      date: new Date(d.created_utc * 1000),
      forum: true,
    }))
    .filter((a) => a.url.includes('/comments/') && a.title)
}

/** What to search for: the chosen place plus its parent for context, and a word every real hit must contain. */
export function target(place: Place, from: number) {
  const [own, ...up] = place.parts.slice(from)
  const ctx = up.find((x) => x.level === 'city') ?? up[0]
  const small = ['street', 'district'].includes(own.level)
  const queries = small ? [...new Set([up[0], ctx].filter(Boolean).map((c) => `"${own.name}" "${c!.name}"`))] : [`"${own.name}"`]
  const query = queries[0]
  const minKeyLen = /[\u0600-\u06ff\u3040-\u9fff\uac00-\ud7af]/.test(own.name) ? 2 : 4
  const key = small ? norm(own.name).split(' ').filter((w) => w.length >= minKeyLen).sort((x, y) => y.length - x.length)[0] : undefined
  const fq = [own, small ? ctx : undefined].filter(Boolean).map((x) => x!.name).join(' ')
  return { own, query, queries, key, fq }
}

export function mergeAll(lists: Article[][], key: string | undefined, want: number, scope = '') {
  const unique = lists
    .flat()
    .filter((a) => !isNaN(+a.date))
    .filter((a, i, all) => all.findIndex((b) => b.url === a.url || norm(b.title) === norm(a.title)) === i)
    .filter((a) => !key || norm(a.title).includes(key))
    .sort((a, b) => +b.date - +a.date)
  return clusterArticles(unique, scope).slice(0, want)
}

const LADDER = ['1h', '3h', '6h', '12h', '1d', '2d', '4d', '7d', '14d', '30d', '90d', '180d', '1y']
const FULL = 95

const SRC = 'newzlocal.sources'
export const loadSources = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SRC) ?? '[]') } catch { return [] }
}
export const saveSources = (l: string[]) => {
  try { localStorage.setItem(SRC, JSON.stringify(l)) } catch { /* private mode */ }
}

const day = (d: Date) => d.toISOString().slice(0, 10)

const newsCache = new Map<string, { at: number; r: { articles: Article[]; scope: string; query: string } }>()

/** `onPartial` gets the list as soon as the first answer is in and again after every deeper window, so the screen fills at once. */
export async function news(
  place: Place,
  from: number,
  want: number,
  deep = true,
  onPartial?: (r: { articles: Article[]; scope: string; query: string }) => void,
  monthsBack = 0,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
) {
  const { own, queries, key } = target(place, from)
  const cc = place.cc?.toUpperCase() ?? 'US'
  const small = ['street', 'district'].includes(own.level)
  // When local proxy is down, avoid doubling CORS bridge calls with 'US' unless the country itself is US
  const editions = [...new Set(deep && !small && cc !== 'US' && !isLocalProxyBlocked() ? [cc, 'US'] : [cc])]
  const ck = `${queries.join('|')}|${cc}|${monthsBack}`
  const hit = deep ? newsCache.get(ck) : undefined
  if (hit) {
    onProgress?.(100)
    onPartial?.(hit.r)
    if (Date.now() - hit.at < 60_000) return hit.r
  }
  onProgress?.(18)
  let ok = 0
  const lists: Article[][] = []
  const currentMerged = () => mergeAll(lists, key, want, own.name)
  const emit = () => onPartial?.({ articles: currentMerged(), scope: own.name, query: queries[0] })

  const win = async (q: string, w: string) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const got = await Promise.allSettled(editions.map((e) => headlines(q, e, w, signal)))
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    got.forEach((x) => { if (x.status === 'fulfilled') { ok++; lists.push(x.value) } })
    emit()
    return Math.max(0, ...got.map((x) => (x.status === 'fulfilled' ? x.value.length : 0)))
  }

  if (monthsBack > 0) {
    const mid = Date.now() - monthsBack * 30.4 * 864e5
    const w = `after:${day(new Date(mid - 15 * 864e5))} before:${day(new Date(mid + 15 * 864e5))}`
    for (const q of queries) await win(q, w)
    onProgress?.(90)
    if (!ok) throw new Error('err.source')
    const r = { articles: currentMerged(), scope: own.name, query: queries[0] }
    newsCache.set(ck, { at: Date.now(), r })
    return r
  }

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi]
    onProgress?.(30 + Math.round((qi / queries.length) * 25))
    if (!deep) { await win(q, '1d'); continue }
    if ((await win(q, '')) < FULL || isLocalProxyBlocked()) continue
    const seen = new Set<string>()
    for (let li = 0; li < LADDER.length; li++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      onProgress?.(Math.min(82, 55 + Math.round(((li + 1) / LADDER.length) * 27)))
      const before = lists.length
      const size = await win(q, LADDER[li])
      lists.slice(before).flat().forEach((x) => seen.add(norm(x.title)))
      if (seen.size >= want && size < FULL) break
    }
  }

  // Supplement with GDELT local coverage when primary feeds returned few hits (or if small-place parent query was too strict)
  if (deep && currentMerged().length < Math.min(want, 20)) {
    onProgress?.(85)
    const fallbackQ = small && own.name.length >= 6 ? `"${own.name}"` : queries[0]
    await gdeltHeadlines(fallbackQ, cc, '', signal)
      .then((g) => { if (g.length) { ok++; lists.push(g); emit() } })
      .catch(() => {})
  }

  // Bing topic-word expansion only when local proxy/Worker is reachable and stories are still sparse
  if (deep && !isLocalProxyBlocked() && currentMerged().length < Math.min(want, 20)) {
    onProgress?.(88)
    const q = queries[0]
    const w = wordsFor(cc)
    const got = await Promise.allSettled(w.map((x) => bingHeadlines(`${q} ${x}`, cc, '', signal)))
    got.forEach((x) => { if (x.status === 'fulfilled') { ok++; lists.push(x.value) } })
    emit()
  }

  if (deep && API && currentMerged().length < Math.min(want, 12)) {
    await keyed(queries[0], cc, signal).then((l) => { if (l.length) { ok++; lists.push(l); emit() } }).catch(() => {})
  }

  if (deep) {
    const custom = loadSources()
    if (custom.length) await Promise.allSettled(custom.map((d) => win(`${queries[0]} site:${d}`, '')))
  }

  onProgress?.(95)
  if (!ok) throw new Error('err.source')
  const r = { articles: currentMerged(), scope: own.name, query: queries[0] }
  if (deep) newsCache.set(ck, { at: Date.now(), r })
  return r
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((r) => setTimeout(r, ms))
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')) }
    const id = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function hackerNews(query: string, max: number, signal?: AbortSignal): Promise<Article[]> {
  const r = await fetch(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${Math.min(max, 50)}`, {
    signal: withTimeout(signal, 7000),
  })
  if (!r.ok) throw new Error('err.source')
  const j = (await r.json()) as { hits: { objectID: string; title: string; created_at_i: number }[] }
  return j.hits.map((h) => ({ url: `https://news.ycombinator.com/item?id=${h.objectID}`, title: h.title, source: 'hacker news', date: new Date(h.created_at_i * 1000), forum: true, lang: 'en' }))
}

async function stackExchange(query: string, site: string, max: number, signal?: AbortSignal): Promise<Article[]> {
  const r = await fetch(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(query)}&site=${site}&pagesize=${Math.min(max, 50)}`,
    { signal: withTimeout(signal, 7000) },
  )
  if (!r.ok) throw new Error('err.source')
  const j = (await r.json()) as { items: { link: string; title: string; creation_date: number }[] }
  const dec = (t: string) => new DOMParser().parseFromString(t, 'text/html').documentElement.textContent ?? t
  return j.items.map((q) => ({ url: q.link, title: dec(q.title), source: `stack exchange ${site}`, date: new Date(q.creation_date * 1000), forum: true, lang: 'en' }))
}

const FB_ANCHORS: [number, string][] = [[2720053, '2016-05-13T11:34:00'], [3507628, '2023-02-08T06:09:00'], [3748124, '2026-10-04T04:15:00']]
export function flashbackCreated(id: number): Date {
  const pts = FB_ANCHORS.map(([i, d]) => [i, +new Date(d)] as const)
  const [a, b] = id <= pts[1][0] ? [pts[0], pts[1]] : [pts[1], pts[2]]
  return new Date(a[1] + ((id - a[0]) / (b[0] - a[0])) * (b[1] - a[1]))
}

let fbNext = 0
const fbCache = new Map<string, { at: number; rows: Article[] }>()

async function flashbackPage(query: string, order: string, signal?: AbortSignal): Promise<Article[]> {
  if (isLocalProxyBlocked()) throw new Error('err.source')
  const url = `${API}/fb/sok/?query=${encodeURIComponent(query)}&so=${order}`
  const hit = fbCache.get(url)
  if (hit && Date.now() - hit.at < 300_000) return hit.rows
  const wait = fbNext - Date.now()
  fbNext = Math.max(Date.now(), fbNext) + 5200
  if (wait > 0) await abortableSleep(wait, signal)
  const r = await fetch(url, { signal: withTimeout(signal, 5000) })
  if (!r.ok) throw new Error('err.source')
  const doc = new DOMParser().parseFromString(new TextDecoder('iso-8859-1').decode(await r.arrayBuffer()), 'text/html')
  const rows = [...doc.querySelectorAll('td.td_title')].flatMap((td) => {
    const a = td.querySelector('a[id^="thread_title_"]')
    const m = td.closest('tr')?.querySelector('td.td_last_post')?.textContent?.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/)
    if (!a || !m) return []
    const section = td.querySelector('.thread-forum-title')?.textContent?.trim()
    const id = Number(a.getAttribute('href')!.match(/\/t(\d+)/)?.[1])
    if (!id) return []
    return [{
      url: new URL(a.getAttribute('href')!, 'https://www.flashback.org').href,
      title: a.textContent!.trim(),
      source: `flashback${section ? ` · ${section}` : ''}`,
      date: flashbackCreated(id),
      approx: true,
      forum: true,
      lang: 'sv',
    }]
  })
  fbCache.set(url, { at: Date.now(), rows })
  return rows
}

export async function forum(
  place: Place,
  from: number,
  want = 100,
  onPartial?: (r: { articles: Article[]; scope: string; query: string }) => void,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
) {
  const { own, fq } = target(place, from)
  const cc = place.cc?.toUpperCase() ?? ''
  const minKeyLen = /[\u0600-\u06ff\u3040-\u9fff\uac00-\ud7af]/.test(own.name) ? 2 : 4
  const fkey = norm(own.name).split(' ').filter((w) => w.length >= minKeyLen).sort((x, y) => y.length - x.length)[0]
  const named = (l: Article[]) => (fkey ? l.filter((x) => norm(x.title).includes(fkey)) : l)
  const rq = fq.replace(/ı/g, 'i').replace(/İ/g, 'I')
  const acc = new Map<string, Article>()
  let doneTasks = 0
  const placeNames = place.parts.slice(from).map((p) => p.name)
  const subList = localSubreddits(cc, placeNames)
  const totalTasks = 5 + (cc === 'SE' && !isLocalProxyBlocked() ? 1 : 0)
  onProgress?.(20)

  const snapshot = () => ({
    articles: [...acc.values()].filter((a) => !isNaN(+a.date)).sort((a, b) => +b.date - +a.date).slice(0, want),
    scope: own.name,
    query: fq,
  })
  const add = (list: Article[]) => {
    doneTasks++
    onProgress?.(Math.min(92, 20 + Math.round((doneTasks / totalTasks) * 72)))
    if (!list.length || signal?.aborted) return
    list.forEach((a) => acc.set(a.url, a))
    onPartial?.(snapshot())
  }

  const flashback = async () => {
    for (const order of ['pd', 'td', 'rd']) {
      if (signal?.aborted) break
      add(await flashbackPage(fq, order, signal))
    }
  }

  const redditFlow = async () => {
    const rows = await reddit(rq, want, '', '', signal)
    add(named(rows))
    for (const sub of subList.slice(0, 2)) {
      if (acc.size >= Math.min(want, 45) || signal?.aborted) break
      await abortableSleep(1200, signal)
      // Subreddit is already localized to country/city; search by place name directly
      add(named(await reddit(own.name, want, sub, '', signal)))
    }
  }

  const got = await Promise.allSettled([
    redditFlow(),
    lemmyDiscussions(fq, cc, signal).then((l) => add(named(l))),
    regionalDiscussions(fq, cc, API, isLocalProxyBlocked(), signal).then((l) => add(named(l))),
    hackerNews(rq, want, signal).then((l) => add(named(l))),
    stackExchange(rq, 'travel', want, signal).then((l) => add(named(l))),
    stackExchange(rq, 'expatriates', want, signal).then((l) => add(named(l))),
    ...(cc === 'SE' && !isLocalProxyBlocked() ? [flashback()] : []),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (got.every((x) => x.status === 'rejected')) throw (got[0] as PromiseRejectedResult).reason
  onProgress?.(95)
  return snapshot()
}

// Persistent LRU translation cache (in-memory + localStorage up to 600 headlines)
const TCACHE_KEY = 'newzlocal.tcache'
const TCACHE_MAX = 600
const tcache = new Map<string, string>()
let tcacheLoaded = false

function ensureTCache() {
  if (tcacheLoaded) return
  tcacheLoaded = true
  try {
    const raw = JSON.parse(localStorage.getItem(TCACHE_KEY) ?? '[]') as [string, string][]
    for (const [k, v] of raw) tcache.set(k, v)
  } catch { /* ignore corrupt cache */ }
}

function persistTCache() {
  try {
    const entries = [...tcache.entries()].slice(-TCACHE_MAX)
    localStorage.setItem(TCACHE_KEY, JSON.stringify(entries))
  } catch { /* quota or private mode */ }
}

export async function translate(list: Article[], lang: string, signal?: AbortSignal): Promise<Article[]> {
  ensureTCache()
  const needsTranslation = (t: string, itemLang?: string) => itemLang !== lang && !tcache.has(`${lang}|${t}`)
  const todoSet = new Set<string>()
  for (const a of list) {
    const raw = a.orig ?? a.title
    if (needsTranslation(raw, a.lang)) todoSet.add(raw)
    for (const sub of a.also ?? []) {
      const subRaw = sub.orig ?? sub.title
      if (needsTranslation(subRaw, a.lang)) todoSet.add(subRaw)
    }
  }
  const todo = [...todoSet]
  if (todo.length > 0) {
    const chunks: string[][] = []
    for (let i = 0; i < todo.length; i += 25) chunks.push(todo.slice(i, i + 25))
    let wrote = false
    await Promise.all(
      chunks.map(async (chunk) => {
        if (signal?.aborted) return
        try {
          const r = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=${lang}&dt=t`, {
            method: 'POST',
            body: chunk.map((t) => `q=${encodeURIComponent(t)}`).join('&'),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: withTimeout(signal, 6000),
          })
          if (!r.ok) return
          const out = (await r.json()) as ([string, string] | string)[]
          chunk.forEach((t, i) => {
            const o = out[i]
            const text = Array.isArray(o) ? o[0] : o
            if (typeof text === 'string' && text) {
              tcache.set(`${lang}|${t}`, text)
              wrote = true
            }
          })
        } catch { /* keep the original titles */ }
      }),
    )
    if (wrote) persistTCache()
  }
  return list.map((a) => {
    const raw = a.orig ?? a.title
    const trMain = a.lang === lang ? raw : (tcache.get(`${lang}|${raw}`) ?? raw)
    const also = a.also?.map((sub) => {
      const subRaw = sub.orig ?? sub.title
      return { ...sub, orig: subRaw, title: a.lang === lang ? subRaw : (tcache.get(`${lang}|${subRaw}`) ?? subRaw) }
    })
    return { ...a, orig: raw, title: trMain, ...(also ? { also } : {}) }
  })
}

const readerCache = new Map<string, { summary?: string; image?: string }>()

async function translateSingle(text: string, lang: string): Promise<string> {
  if (!text) return text
  ensureTCache()
  const ck = `${lang}|${text}`
  if (tcache.has(ck)) return tcache.get(ck)!
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=${lang}&dt=t`, {
      method: 'POST',
      body: `q=${encodeURIComponent(text)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return text
    const out = (await r.json()) as ([string, string] | string)[]
    const o = out[0]
    const translated = (Array.isArray(o) ? o[0] : o) || text
    tcache.set(ck, translated)
    persistTCache()
    return translated
  } catch {
    return text
  }
}

/** Fetches (and translates) an article's summary & lead image on demand for the inline Reader card. */
export async function fetchReaderPreview(a: Article, lang: string): Promise<{ summary?: string; image?: string }> {
  const ck = `${lang}|${a.url}`
  if (readerCache.has(ck)) return readerCache.get(ck)!

  let summary = a.summary
  let image = a.image

  if (!summary && !a.url.includes('news.google.com/')) {
    try {
      if (API) {
        const r = await fetch(`${API}/meta?url=${encodeURIComponent(a.url)}`, { signal: AbortSignal.timeout(4500) })
        if (r.ok) {
          const j = (await r.json()) as { description?: string; image?: string }
          summary = cleanSnippet(j.description ?? '', a.orig ?? a.title, a.source)
          if (!image && j.image && /^https:\/\//i.test(j.image)) image = j.image
        }
      } else {
        const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(a.url)}`, {
          signal: AbortSignal.timeout(4500),
        })
        if (r.ok) {
          const html = (await r.text()).slice(0, 60_000)
          const doc = new DOMParser().parseFromString(html, 'text/html')
          const desc =
            doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
            doc.querySelector('meta[name="description"]')?.getAttribute('content') ??
            ''
          const ogImg = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? ''
          summary = cleanSnippet(desc, a.orig ?? a.title, a.source)
          if (!image && ogImg && /^https:\/\//i.test(ogImg)) image = ogImg
        }
      }
    } catch {
      /* graceful fallback if site blocks scraping */
    }
  }

  if (summary && a.lang !== lang) {
    summary = await translateSingle(summary, lang)
  }

  const out = { summary, image }
  readerCache.set(ck, out)
  return out
}

export function getWorkerUrl(): string {
  try {
    return localStorage.getItem('newzlocal.workerUrl') ?? ''
  } catch {
    return ''
  }
}

export function setWorkerUrl(url: string) {
  try {
    const clean = url.trim().replace(/\/+$/, '')
    if (clean) localStorage.setItem('newzlocal.workerUrl', clean)
    else localStorage.removeItem('newzlocal.workerUrl')
  } catch { /* ignore */ }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0))
}

export async function syncPushSubscription(favs: Place[], lang: string, quietMap: Record<string, Quiet>): Promise<boolean> {
  if (!API || !('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return false
  try {
    let pubKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
    if (!pubKey) {
      const kr = await fetch(`${API}/push/vapid`, { signal: AbortSignal.timeout(4000) })
      if (!kr.ok) return false
      pubKey = ((await kr.json()) as { publicKey?: string }).publicKey
    }
    if (!pubKey) return false
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pubKey) as BufferSource }))
    if (!favs.length) {
      await fetch(`${API}/push/subscribe`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
      return true
    }
    const r = await fetch(`${API}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        lang,
        quiet: quietMap,
        places: favs.slice(0, 10).map((f) => ({ label: label(f), cc: f.cc, parts: f.parts, cat: f.cat, alert: f.alert })),
      }),
    })
    return r.ok
  } catch {
    return false
  }
}

const FAV = 'newzlocal.favs'
export const loadFavs = (): Place[] => {
  try { return JSON.parse(localStorage.getItem(FAV) ?? '[]') } catch { return [] }
}
export const saveFavs = (f: Place[]) => {
  try { localStorage.setItem(FAV, JSON.stringify(f)) } catch { /* private mode */ }
}
export type Quiet = { on: boolean; from: string; to: string }
export const QUIET0: Quiet = { on: false, from: '22:00', to: '07:00' }
export const loadQuiet = (): Record<string, Quiet> => {
  try { return JSON.parse(localStorage.getItem('newzlocal.quietCats') ?? '{}') } catch { return {} }
}
export const saveQuiet = (q: Record<string, Quiet>) => {
  try { localStorage.setItem('newzlocal.quietCats', JSON.stringify(q)) } catch { /* private mode */ }
}
export const inQuiet = (q: Quiet | undefined, now = new Date()) => {
  if (!q?.on) return false
  const m = now.getHours() * 60 + now.getMinutes()
  const [fh, fm] = q.from.split(':').map(Number)
  const [th, tm] = q.to.split(':').map(Number)
  const f = fh * 60 + fm, e = th * 60 + tm
  return f <= e ? m >= f && m < e : m >= f || m < e
}

export const saveLast = (key: string, list: Article[]) => {
  try { localStorage.setItem(`newzlocal.last.${key}`, JSON.stringify(list.slice(0, 60))) } catch { /* full or private mode */ }
}
export const loadLast = (key: string): Article[] | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(`newzlocal.last.${key}`) ?? 'null') as (Omit<Article, 'date'> & { date: string; also?: (Omit<RelatedItem, 'date'> & { date: string })[] })[] | null
    return raw
      ? raw.map((a) => ({
          ...a,
          date: new Date(a.date),
          ...(a.also ? { also: a.also.map((s) => ({ ...s, date: new Date(s.date) })) } : {}),
        }))
      : null
  } catch { return null }
}

const CATS = 'newzlocal.cats'
export const loadCats = (): string[] => {
  try { return JSON.parse(localStorage.getItem(CATS) ?? '[]') } catch { return [] }
}
export const saveCats = (c: string[]) => {
  try { localStorage.setItem(CATS, JSON.stringify(c)) } catch { /* private mode */ }
}
export const label = (p: Place) => p.parts.slice(0, 3).map((x) => x.name).join(', ')

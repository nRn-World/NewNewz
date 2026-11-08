import { norm } from './areas'
import { clusterArticles, type RelatedItem } from './cluster'
import { editionFor, wordsFor } from './editions'
import { lemmyDiscussions, localSubreddits, regionalDiscussions } from './forums'
import { fetchDirectPoliceFeeds, isOfficialPoliceUrl, policeSearchQueries } from './police'
import { STOP, topicsOf } from './topics'
import { encodePlace } from './urlState'

const DEFAULT_WORKER_URL = 'https://newzlocal-proxy.bynrnworld.workers.dev'

function resolveApiBase(): string {
  const fromEnv = (import.meta.env.VITE_PROXY_URL || import.meta.env.VITE_API_URL) as string | undefined
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  try {
    const custom = localStorage.getItem('newzlocal.workerUrl')?.trim()
    if (custom && /^https:\/\/[a-z0-9.-]+/i.test(custom)) return custom.replace(/\/+$/, '')
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') return DEFAULT_WORKER_URL
  return ''
}

/** Origin of the news/forum proxy (a Cloudflare Worker in production; empty = Vite's dev proxy). */
const API = resolveApiBase()

export type Level = 'street' | 'district' | 'city' | 'state' | 'country'
export type Part = { level: Level; name: string }
export type Place = {
  lat: number
  lon: number
  cc?: string
  parts: Part[]
  cat?: string
  alert?: string[]
  alertNews?: boolean
  alertForum?: boolean
} // parts: most specific first
export type Article = {
  url: string
  title: string
  source: string
  date: Date
  summary?: string
  image?: string
  forum?: boolean
  police?: boolean
  orig?: string
  approx?: boolean
  lang?: string
  scopeTag?: string
  exactMatch?: boolean
  score?: number
  comments?: number
  also?: RelatedItem[]
}

/** Strips house numbers / apartment suffixes from a street address ("Ribegatan 31B" -> "Ribegatan") for news/forum queries. */
export function streetBaseName(raw: string): string {
  const s = raw
    .trim()
    .replace(/\b(?:no|nr|lgh|apt|unit)[:.\s-]*\d+[a-z]?\b/gi, '')
    .replace(/\s+\d+[a-z]?(?:[-/]\d+[a-z]?)?$/i, '')
    .replace(/^\d+[a-z]?\s+(?=[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF])/u, '')
    .trim()
  return s.length >= 2 ? s : raw.trim()
}

/** Clamps erroneous future RSS timestamps so broken publisher clocks never block genuinely newest news at #01. */
export function clampDate(d: Date, nowMs = Date.now()): Date {
  const t = d.getTime()
  if (isNaN(t)) return d
  return t > nowMs + 60_000 ? new Date(nowMs) : d
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

  if (p.type === 'country' || p.osm_value === 'country') {
    add('country', p.name || p.country)
    return { lat, lon, parts, cc: p.countrycode }
  }

  // Metropolitan / provincial capitals (e.g. Diyarbakır, İstanbul, Stockholm, Madrid, Phuket) often sit inside a central
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

  const isIslandOrRegion = p.osm_value === 'island' || p.osm_value === 'archipelago' || p.type === 'county'
  const isSettlement =
    p.type === 'city' || p.type === 'town' || p.type === 'village' || p.osm_value === 'city' || p.osm_value === 'town' || isIslandOrRegion
  const isNamedVenue =
    !!p.name &&
    !/^\d+[a-z]?$/i.test(p.name.trim()) &&
    !isSettlement &&
    p.type !== 'street' &&
    p.type !== 'district' &&
    p.type !== 'locality' &&
    p.type !== 'state'

  if (isNamedVenue) {
    add('street', p.name)
  }

  const rawStreet = p.street || (p.type === 'street' ? p.name : undefined)
  const fullStreet = rawStreet && p.housenumber && !rawStreet.includes(p.housenumber) ? `${rawStreet} ${p.housenumber}` : rawStreet
  add('street', fullStreet)
  if (!isSettlement) {
    add(
      'district',
      p.district || p.suburb || p.quarter || p.neighbourhood || p.locality || (p.type === 'district' || p.type === 'locality' ? p.name : undefined),
    )
  }
  add('city', (isSettlement ? p.name : undefined) || p.city || p.town || p.municipality || p.county)
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

type NomHit = { lat: string; lon: string; name: string; type?: string; class?: string; namedetails?: { name?: string }; address: Record<string, string> }

let nomNext = 0
/** Nominatim finds exact home addresses, venues, islands, streets, suburbs, cities and countries. Polite 1 req/s spacing. */
async function nominatim(q: string, signal?: AbortSignal): Promise<Place[]> {
  const wait = nomNext - Date.now()
  nomNext = Math.max(Date.now(), nomNext) + 1050
  if (wait > 0) await abortableSleep(wait, signal)
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&namedetails=1&limit=6&accept-language=zz`,
    { signal: withTimeout(signal, 8000) },
  )
  if (!r.ok) return []
  return ((await r.json()) as NomHit[])
    .map((x) => {
      const a = x.address ?? {}
      const parts: Part[] = []
      const add = (lv: Level, nm?: string) => {
        if (nm && !parts.some((p) => norm(p.name) === norm(nm))) parts.push({ level: lv, name: nm })
      }
      const hitName = (x.namedetails?.name ?? x.name ?? '').trim()
      const road = a.road || a.pedestrian || a.residential || (x.class === 'highway' ? hitName : undefined)
      const suburb = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.borough
      const city = a.city || a.town || a.village || a.municipality || (x.type === 'island' ? hitName : undefined) || (!road && x.class === 'place' ? hitName : undefined)
      if (
        hitName &&
        !/^\d+[a-z]?$/i.test(hitName) &&
        x.class !== 'highway' &&
        x.class !== 'boundary' &&
        x.class !== 'place' &&
        norm(hitName) !== norm(road ?? '') &&
        norm(hitName) !== norm(suburb ?? '') &&
        norm(hitName) !== norm(city ?? '')
      ) {
        add('street', hitName)
      }
      if (road) {
        add('street', a.house_number ? `${road} ${a.house_number}` : road)
      }
      if (suburb) add('district', suburb)
      if (city) add('city', city)
      if (a.state) add('state', a.state)
      if (a.country) add('country', a.country)
      if (!parts.length && hitName) add('city', hitName)
      return { lat: +x.lat, lon: +x.lon, cc: a.country_code, parts }
    })
    .filter((p) => p.parts.length > 0)
}

const searchCache = new Map<string, Place[]>()

/** Searches full home addresses ("Ribegatan 31, 164 45 Kista"), streets, districts, cities and countries. */
export async function search(q: string, lang = 'en', signal?: AbortSignal): Promise<Place[]> {
  const clean = q.trim()
  if (!clean) return []
  const cached = searchCache.get(clean.toLowerCase())
  if (cached) return cached

  // Build smart address-aware query candidates so stripping postal/house numbers never drops the city name
  const noPostal = clean.replace(/\b\d{3}\s?\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim()
  const noHouse = noPostal.replace(/\b\d+[a-z]?\b/gi, ' ').replace(/\s+/g, ' ').trim()
  const words = clean.split(/[\s,]+/).filter(Boolean)
  const candidates = [...new Set([
    clean,
    noPostal,
    noHouse,
    ...Array.from({ length: words.length }, (_, idx) => words.slice(0, words.length - idx).join(' ')),
  ].filter((s) => s.length >= 2))]

  for (const text of candidates) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const [ph, nom] = await Promise.allSettled([photon(text, lang, signal), nominatim(text, signal)])
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const photonHits = ph.status === 'fulfilled' ? ph.value : []
    const own = new Map(photonHits.map((h) => [label(h), h]))
    const noms = (nom.status === 'fulfilled' ? nom.value : []).map((h) => own.get(label(h)) ?? h)
    const normClean = norm(clean)
    const exact = [...photonHits, ...noms].filter(
      (h) => norm(h.parts[0].name) === norm(text) || normClean.includes(norm(streetBaseName(h.parts[0].name))),
    )
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
  let plainText = rawHtml
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(rawHtml, 'text/html')
    // Google News multi-perspective <ol><li><a>Headline</a> <font>Publisher</font></li></ol>
    const liItems = [...parsed.querySelectorAll('li')]
      .map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((txt) => txt && norm(txt) !== norm(title) && norm(txt) !== norm(`${title} ${source}`))
    if (liItems.length > 1) {
      return liItems.slice(0, 3).map((s) => `• ${s}`).join(' ')
    }
    plainText = parsed.body?.textContent ?? rawHtml
  } else {
    plainText = decodeXmlEntities(rawHtml.replace(/<[^>]+>/g, ' '))
  }
  const plain = plainText
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

function decodeXmlEntities(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim()
}

function xmlTag(block: string, tagPattern: string): string {
  const m = new RegExp(`<(${tagPattern})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, 'i').exec(block)
  return m ? decodeXmlEntities(m[2].trim()) : ''
}

export function parseGoogleRssXml(xmlText: string, lang: string): Article[] {
  if (!/<rss\b|<channel\b|<feed\b/i.test(xmlText)) throw new Error('err.source')
  const seen = new Set<string>()
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
    if (!doc.querySelector('parsererror')) {
      return [...doc.querySelectorAll('item')]
        .map((i) => {
          const srcEl = i.querySelector('source')
          const source = srcEl?.textContent ?? ''
          const srcUrl = srcEl?.getAttribute('url') ?? ''
          const raw = i.querySelector('title')?.textContent ?? ''
          const title = source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw
          const desc = i.querySelector('description')?.textContent ?? ''
          const url = i.querySelector('link')?.textContent ?? ''
          return {
            url,
            title,
            summary: cleanSnippet(desc, title, source),
            image: extractItemImage(i),
            source,
            date: new Date(i.querySelector('pubDate')?.textContent ?? ''),
            lang,
            ...(isOfficialPoliceUrl(url) || isOfficialPoliceUrl(srcUrl) ? { police: true } : {}),
          }
        })
        .filter((a) => a.url && !seen.has(a.title) && seen.add(a.title))
    }
  }
  const items: Article[] = []
  for (const m of xmlText.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1]
    const source = xmlTag(b, 'source')
    const srcUrl = /<source\b[^>]*\burl=["']([^"']+)["']/i.exec(b)?.[1] ?? ''
    const raw = xmlTag(b, 'title')
    const title = source && raw.endsWith(` - ${source}`) ? raw.slice(0, -source.length - 3) : raw
    const desc = xmlTag(b, 'description')
    const url = xmlTag(b, 'link')
    if (!url || !title || seen.has(title)) continue
    seen.add(title)
    items.push({
      url,
      title,
      summary: cleanSnippet(desc, title, source),
      source,
      date: new Date(xmlTag(b, 'pubDate')),
      lang,
      ...(isOfficialPoliceUrl(url) || isOfficialPoliceUrl(srcUrl) ? { police: true } : {}),
    })
  }
  return items
}

export function parseBingRssXml(xmlText: string, lang: string): Article[] {
  if (!/<rss\b|<channel\b|<feed\b/i.test(xmlText)) throw new Error('err.source')
  const seen = new Set<string>()
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
    if (!doc.querySelector('parsererror')) {
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
            lang,
            ...(isOfficialPoliceUrl(url) ? { police: true } : {}),
          }
        })
        .filter((a) => a.url && !seen.has(a.title) && seen.add(a.title))
    }
  }
  const items: Article[] = []
  for (const m of xmlText.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1]
    const link = xmlTag(b, 'link')
    let url = link
    try { url = new URL(link).searchParams.get('url') ?? link } catch { /* keep Bing's redirect link */ }
    const title = xmlTag(b, 'title')
    const source = xmlTag(b, '(?:[A-Za-z0-9_]+:)?Source')
    const desc = xmlTag(b, 'description')
    if (!url || !title || seen.has(title)) continue
    seen.add(title)
    items.push({
      url,
      title,
      summary: cleanSnippet(desc, title, source),
      source,
      date: new Date(xmlTag(b, 'pubDate')),
      lang,
      ...(isOfficialPoliceUrl(url) ? { police: true } : {}),
    })
  }
  return items
}

export function parseRss2JsonPayload(rawJson: string, lang: string): Article[] {
  const j = JSON.parse(rawJson) as {
    status?: string
    items?: { title?: string; pubDate?: string; link?: string; description?: string; thumbnail?: string; author?: string }[]
  }
  if (j.status !== 'ok' || !Array.isArray(j.items)) throw new Error('err.source')
  const seen = new Set<string>()
  return j.items
    .map((it) => {
      const rawTitle = (it.title ?? '').trim()
      const dashIdx = rawTitle.lastIndexOf(' - ')
      const source = dashIdx > 8 ? rawTitle.slice(dashIdx + 3).trim() : (it.author ?? '').trim()
      const title = dashIdx > 8 ? rawTitle.slice(0, dashIdx).trim() : rawTitle
      const rawDate = (it.pubDate ?? '').trim()
      const isoDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawDate) ? `${rawDate.replace(' ', 'T')}Z` : rawDate
      const url = (it.link ?? '').trim()
      return {
        url,
        title,
        summary: cleanSnippet(it.description ?? '', title, source),
        image: it.thumbnail && /^https:\/\//i.test(it.thumbnail) ? it.thumbnail : undefined,
        source,
        date: new Date(isoDate),
        lang,
        ...(isOfficialPoliceUrl(url) ? { police: true } : {}),
      }
    })
    .filter((a) => a.url && a.title && !isNaN(+a.date) && !seen.has(a.title) && seen.add(a.title))
}

async function fetchRssViaCorsBridges(
  canonicalRssUrl: string,
  xmlParser: (xml: string, lang: string) => Article[],
  lang: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const raceCtrl = new AbortController()
  const combinedSig = signal ? AbortSignal.any([signal, raceCtrl.signal]) : raceCtrl.signal

  const tryXmlBridge = async (bridgeUrl: string): Promise<Article[]> => {
    const r = await fetch(bridgeUrl, { signal: withTimeout(combinedSig, 6500) })
    if (!r.ok) throw new Error('bridge_http')
    return xmlParser(await r.text(), lang)
  }

  const tryRss2Json = async (): Promise<Article[]> => {
    const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(canonicalRssUrl)}`, {
      signal: withTimeout(combinedSig, 6500),
    })
    if (!r.ok) throw new Error('rss2json_http')
    return parseRss2JsonPayload(await r.text(), lang)
  }

  try {
    const winner = await Promise.any([
      tryXmlBridge(`https://api.allorigins.win/raw?url=${encodeURIComponent(canonicalRssUrl)}`),
      tryXmlBridge(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(canonicalRssUrl)}`),
      tryXmlBridge(`https://corsproxy.io/?url=${encodeURIComponent(canonicalRssUrl)}`),
      tryRss2Json(),
    ])
    raceCtrl.abort()
    return winner
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error('err.source')
  }
}

async function bingHeadlines(query: string, country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  const ed = editionFor(country)
  const iv = interval(when)
  const qs = `q=${encodeURIComponent(query)}&format=rss&cc=${ed.cc}&setlang=${ed.hl}&sortbydate=1${iv ? `&qft=${encodeURIComponent(`interval="${iv}"`)}` : ''}`
  const canonicalBing = `https://www.bing.com/news/search?${qs}`

  if (!isLocalProxyBlocked()) {
    try {
      const r = await fetch(`${API}/bn/news/search?${qs}`, { cache: 'no-store', signal: withTimeout(signal, 4800) })
      if (r.ok) return parseBingRssXml(await r.text(), ed.lang)
      if (!API && (r.status === 404 || r.status >= 500)) markLocalProxyDown()
    } catch (e) {
      if (signal?.aborted) throw e
      if (!API) markLocalProxyDown()
    }
  }
  return fetchRssViaCorsBridges(canonicalBing, parseBingRssXml, ed.lang, signal)
}

// Google News RSS via VITE_GN_URL, Worker /gn (with EU SOCS consent cookie), and concurrent browser CORS bridge racing.
const GN_ENV = import.meta.env.VITE_GN_URL as string | undefined
let gnProxyDown = false

async function googleHeadlines(query: string, country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  const ed = editionFor(country)
  const q = when ? (when.includes(':') ? `${query} ${when}` : `${query} when:${when}`) : query
  const qs = `q=${encodeURIComponent(q)}&hl=${encodeURIComponent(ed.hl)}&gl=${ed.cc}&ceid=${encodeURIComponent(ed.ceid)}`
  const canonicalRss = `https://news.google.com/rss/search?${qs}`

  if (GN_ENV || (!gnProxyDown && !isLocalProxyBlocked())) {
    try {
      const base = GN_ENV ?? `${API}/gn/rss/search`
      const r = await fetch(`${base}?${qs}`, { cache: 'no-store', signal: withTimeout(signal, GN_ENV || API ? 4200 : 2200) })
      if (r.ok) return parseGoogleRssXml(await r.text(), ed.lang)
      if (!GN_ENV) gnProxyDown = true
    } catch (e) {
      if (signal?.aborted) throw e
      if (!GN_ENV) gnProxyDown = true
    }
  }

  return fetchRssViaCorsBridges(canonicalRss, parseGoogleRssXml, ed.lang, signal)
}

/** Parses GDELT DOC 2.0 `YYYYMMDDTHHmmssZ` timestamps into JS Dates. */
export function parseGdeltDate(s: string): Date {
  const iso = s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')
  return new Date(iso)
}

let gdeltNext = 0
const gdeltCache = new Map<string, { at: number; rows: Article[] }>()

/**
 * GDELT DOC 2.0 Global News API — 100 % open, keyless, native browser CORS (`Access-Control-Allow-Origin: *`),
 * covering local press in 100+ languages worldwide. Politely paced & cached so GDELT's 5s rate-limit never 429s.
 */
async function gdeltHeadlines(query: string, _country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  const ck = `${query}|${when}`
  const cached = gdeltCache.get(ck)
  if (cached && Date.now() - cached.at < 300_000) return cached.rows

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

  const wait = gdeltNext - Date.now()
  gdeltNext = Math.max(Date.now(), gdeltNext) + 3200
  if (wait > 0) await abortableSleep(wait, signal)

  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(gq)}&mode=ArtList&maxrecords=120&format=json&sort=DateDesc${timeParam}`
  const r = await fetch(url, { signal: withTimeout(signal, 8000) })
  if (!r.ok) throw new Error('err.source')
  const txt = await r.text()
  if (!txt.trim().startsWith('{')) return []
  const j = JSON.parse(txt) as { articles?: { url: string; title: string; domain?: string; seendate?: string; socialimage?: string }[] }
  const seen = new Set<string>()
  const rows = (j.articles ?? [])
    .map((a) => ({
      url: a.url,
      title: (a.title ?? '').trim(),
      image: a.socialimage && /^https:\/\//i.test(a.socialimage) ? a.socialimage : undefined,
      source: (a.domain ?? '').replace(/^www\./, ''),
      date: parseGdeltDate(a.seendate ?? ''),
    }))
    .filter((a) => a.url && a.title && !isNaN(+a.date) && !seen.has(a.title) && seen.add(a.title))
  gdeltCache.set(ck, { at: Date.now(), rows })
  return rows
}

async function headlines(query: string, country: string, when: string, signal?: AbortSignal): Promise<Article[]> {
  const settled = await Promise.allSettled([
    bingHeadlines(query, country, when, signal),
    googleHeadlines(query, country, when, signal),
  ])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const anySucceeded = settled.some((s) => s.status === 'fulfilled')
  const combined = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
  if (combined.length || anySucceeded) return combined
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

/** Reddit posts mentioning the place (JSON endpoint first for 100-item pages, selftext & comment counts; Worker fallback). */
const redditCache = new Map<string, { at: number; rows: Article[] }>()

async function reddit(
  query: string,
  max: number,
  sub = '',
  after = '',
  sort: 'new' | 'comments' | 'top' = 'new',
  signal?: AbortSignal,
): Promise<Article[]> {
  const ck = `${sub}|${sort}|${query}|${after}`
  const hit = redditCache.get(ck)
  if (hit && Date.now() - hit.at < 300_000) return hit.rows
  const rows = await redditFetch(query, max, sub, after, sort, signal)
  redditCache.set(ck, { at: Date.now(), rows })
  return rows
}

type RedditJsonListing = {
  data?: {
    children?: {
      data: {
        permalink: string
        title: string
        selftext?: string
        thumbnail?: string
        subreddit_name_prefixed?: string
        created_utc: number
        num_comments?: number
        ups?: number
      }
    }[]
  }
}

function parseRedditJson(j: RedditJsonListing): Article[] {
  return (j.data?.children ?? [])
    .map(({ data: d }) => {
      const comments = d.num_comments ?? 0
      const ups = Math.max(0, d.ups ?? 0)
      const baseSrc = `reddit ${d.subreddit_name_prefixed ?? ''}`.trim()
      return {
        url: `https://www.reddit.com${d.permalink}`,
        title: d.title,
        summary: d.selftext ? d.selftext.replace(/\s+/g, ' ').trim().slice(0, 320) || undefined : undefined,
        image: d.thumbnail && /^https:\/\//i.test(d.thumbnail) ? d.thumbnail : undefined,
        source: comments > 0 ? `${baseSrc} (${comments})` : baseSrc,
        date: clampDate(new Date(d.created_utc * 1000)),
        comments,
        score: comments * 3 + ups,
        forum: true,
      }
    })
    .filter((a) => a.url.includes('/comments/') && a.title)
}

async function redditFetch(
  query: string,
  max: number,
  sub: string,
  after: string,
  sort: 'new' | 'comments' | 'top',
  signal?: AbortSignal,
): Promise<Article[]> {
  const qs = `q=${encodeURIComponent(query)}&sort=${sort}&limit=${Math.min(max, 100)}${after ? `&after=${after}` : ''}`
  const jsonPath = sub ? `/r/${sub}/search.json?restrict_sr=1&raw_json=1&${qs}` : `/search.json?raw_json=1&${qs}`

  // 1. Direct browser CORS JSON (returns up to 100 posts + selftext + num_comments + ups)
  try {
    const r = await fetch(`https://www.reddit.com${jsonPath}`, { signal: withTimeout(signal, 6000) })
    if (r.ok) return parseRedditJson((await r.json()) as RedditJsonListing)
  } catch (e) {
    if (signal?.aborted) throw e
  }

  // 2. Worker /rd JSON + RSS fallback
  if (!isLocalProxyBlocked()) {
    try {
      const rj = await fetch(`${API}/rd${jsonPath}`, { cache: 'no-store', signal: withTimeout(signal, 5000) })
      if (rj.ok) return parseRedditJson((await rj.json()) as RedditJsonListing)
      const rssPath = sub ? `${API}/rd/r/${sub}/search.rss?restrict_sr=1&${qs}` : `${API}/rd/search.rss?${qs}`
      const r = await fetch(rssPath, { cache: 'no-store', signal: withTimeout(signal, 4500) })
      if (r.ok) {
        const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
        return [...doc.querySelectorAll('entry')]
          .map((e) => {
            const rawBody = e.querySelector('content')?.textContent ?? ''
            return {
              url: e.querySelector('link')?.getAttribute('href') ?? '',
              title: e.querySelector('title')?.textContent ?? '',
              summary: rawBody ? rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || undefined : undefined,
              source: `reddit ${e.querySelector('category')?.getAttribute('label') ?? ''}`.trim(),
              date: clampDate(new Date(e.querySelector('updated')?.textContent ?? '')),
              forum: true,
            }
          })
          .filter((a) => a.url.includes('/comments/') && a.title)
      }
      if (r.status >= 500) markLocalProxyDown()
    } catch (e) {
      if (signal?.aborted) throw e
      markLocalProxyDown()
    }
  }
  throw new Error('err.source')
}

const EXONYM_GROUPS: string[][] = [
  ['goteborg', 'gothenburg'],
  ['kopenhamn', 'copenhagen'],
  ['helsingfors', 'helsinki'],
  ['wien', 'vienna'],
  ['munchen', 'munich'],
  ['koln', 'cologne'],
  ['rom', 'roma', 'rome'],
  ['milano', 'milan'],
  ['venedig', 'venezia', 'venice'],
  ['florens', 'firenze', 'florence'],
  ['neapel', 'napoli', 'naples'],
  ['aten', 'athens', 'αθηνα'],
  ['lissabon', 'lisboa', 'lisbon'],
  ['bryssel', 'brussels', 'bruxelles'],
  ['geneve', 'geneva'],
  ['prag', 'prague', 'praha'],
  ['warszawa', 'warsaw'],
  ['moskva', 'moscow', 'москва'],
  ['kiev', 'kyiv', 'київ'],
  ['kairo', 'cairo', 'القاهرة'],
  ['peking', 'beijing', '北京'],
  ['tokyo', '東京'],
  ['osaka', '大阪'],
  ['kyoto', '京都'],
  ['seoul', '서울'],
  ['busan', '부산'],
  ['dubai', 'دبي'],
  ['abu dhabi', 'أبوظبي', 'ابوظبي'],
  ['riyadh', 'الرياض'],
  ['doha', 'الدوحة'],
  // Thailand & Phuket local districts/stations (Thai <-> English)
  ['phuket', 'ภูเก็ต'],
  ['patong', 'ป่าตอง'],
  ['karon', 'กะรน'],
  ['kamala', 'กมลา'],
  ['chalong', 'ฉลอง'],
  ['thalang', 'ถลาง'],
  ['rawai', 'ราไวย์'],
  ['cherngtalay', 'choeng thale', 'เชิงทะเล'],
  ['kata', 'กะตะ'],
  ['bangkok', 'krung thep', 'กรุงเทพ', 'กรุงเทพมหานคร'],
  ['pattaya', 'พัทยา'],
  ['chiang mai', 'เชียงใหม่'],
  ['krabi', 'กระบี่'],
  ['koh samui', 'ko samui', 'เกาะสมุย', 'สมุย'],
  ['hua hin', 'หัวหิน'],
  ['thailand', 'ประเทศไทย'],
  ['japan', '日本'],
  ['sverige', 'sweden'],
  ['norge', 'norway'],
  ['danmark', 'denmark'],
  ['suomi', 'finland'],
  ['tyskland', 'deutschland', 'germany'],
  ['frankrike', 'france'],
  ['spanien', 'espana', 'spain'],
  ['italien', 'italia', 'italy'],
  ['grekland', 'greece'],
  ['turkiet', 'turkiye', 'turkey'],
  ['storbritannien', 'united kingdom', 'britain'],
]

const GENERIC_STREETS = new Set([
  'storgatan', 'kyrkogatan', 'skolgatan', 'stationsgatan', 'parkgatan', 'nygatan', 'industrigatan', 'fabriksgatan',
  'hamngatan', 'tradgardsgatan', 'vastergatan', 'ostergatan', 'sodergatan', 'norrgatan', 'järnvägsgatan', 'jarnvagsgatan',
  'main street', 'high street', 'church street', 'station road', 'park street', 'market street',
  'hauptstrasse', 'bahnhofstrasse', 'schulstrasse', 'kirchstrasse', 'gartenstrasse',
  'grande rue', 'rue de la gare', 'calle mayor', 'cumhuriyet caddesi', 'ataturk caddesi',
])

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Builds clean place-name aliases (including compound sub-parts and country/city exonyms) for strict matching. */
export function placeAliases(own: Part, cc?: string): string[] {
  const clean = own.level === 'street' ? streetBaseName(own.name) : own.name
  const set = new Set<string>([clean])
  if (norm(own.name) !== norm(clean)) set.add(own.name)

  // Compound administrative names like "Kista – Ärvinge" or "Spånga / Tensta"
  for (const seg of clean.split(/\s*[–—/,]\s*/)) {
    if (seg.trim().length >= 4) set.add(seg.trim())
  }

  const cNorm = norm(clean)
  for (const grp of EXONYM_GROUPS) {
    if (grp.some((g) => norm(g) === cNorm)) {
      for (const alt of grp) set.add(alt)
    }
  }

  if (own.level === 'country' && cc && /^[A-Za-z]{2}$/.test(cc)) {
    const upper = cc.toUpperCase()
    for (const loc of ['en', 'sv', 'de', 'fr', 'es', 'tr']) {
      try {
        const dn = new Intl.DisplayNames([loc], { type: 'region' }).of(upper)
        if (dn && dn.length >= 2) set.add(dn)
      } catch { /* ignore unsupported locale */ }
    }
  }
  return [...set]
}

/**
 * Verifies that `text` genuinely mentions the selected place (street, venue, neighbourhood, city, or country)
 * using Unicode word-boundary + inflectional suffix matching so unrelated parent-city posts never leak in.
 */
export function mentionsPlace(text: string, aliases: string[]): boolean {
  if (!text || !aliases.length) return false
  const hNorm = norm(text)
  if (!hNorm) return false
  const padded = ` ${hNorm} `
  const rawLower = ` ${text.toLowerCase()} `

  for (const rawAlias of aliases) {
    const aNorm = norm(rawAlias)
    if (!aNorm) continue
    // Compact scripts (Arabic, Thai, CJK, Korean)
    if (/[\u0600-\u06ff\u0e00-\u0e7f\u3040-\u9fff\uac00-\ud7af]/.test(aNorm)) {
      if (hNorm.includes(aNorm)) return true
      continue
    }
    // Multi-word place names ("new york", "koh samui", "gamla stan", "kista galleria")
    if (aNorm.includes(' ')) {
      if (new RegExp(` ${escapeRe(aNorm)}\\p{L}{0,4}(?= )`, 'u').test(padded)) return true
      continue
    }
    // Short 2-3 char names ("Åre", "Hjo", "Kos", "Goa", "UK"): require exact word & preserve accents so "Åre" != "are"
    if (aNorm.length <= 3) {
      const rawClean = rawAlias.trim().toLowerCase()
      if (rawClean !== aNorm) {
        if (new RegExp(`[^\\p{L}\\p{N}]${escapeRe(rawClean)}s?(?![\\p{L}\\p{N}])`, 'u').test(rawLower)) return true
      } else if (padded.includes(` ${aNorm} `) || padded.includes(` ${aNorm}s `)) {
        return true
      }
      continue
    }
    // 4-char names ("lund", "umea", "oslo"): allow max 2 inflection chars (-s, -en) so "lund" never matches "lundqvist"
    const maxSuffix = aNorm.length === 4 ? 2 : 5
    if (new RegExp(` ${escapeRe(aNorm)}\\p{L}{0,${maxSuffix}}(?= )`, 'u').test(padded)) return true
  }
  return false
}

/** What to search for: the exact chosen place, disambiguation context when needed, and strict place aliases. */
export function target(place: Place, from: number) {
  const [own, ...up] = place.parts.slice(from)
  const cleanName = own.level === 'street' ? streetBaseName(own.name) : own.name
  const hasHouseNo = own.level === 'street' && norm(own.name) !== norm(cleanName)
  const ctx = up.find((x) => x.level === 'city') ?? up[0]
  const small = ['street', 'district'].includes(own.level)
  const mustMatchParent = own.level === 'street' && GENERIC_STREETS.has(norm(cleanName)) && up.length > 0
  const aliases = placeAliases(own, place.cc)
  const parentAliases = up.flatMap((p) => placeAliases(p, place.cc))
  const parents = [up[0], ctx].filter(Boolean) as Part[]

  const queries = small
    ? [
        ...new Set([
          ...(hasHouseNo ? parents.map((c) => `"${own.name}" "${c.name}"`) : []),
          ...parents.map((c) => `"${cleanName}" "${c.name}"`),
          ...parents.map((c) => `"${cleanName}" ${c.name}`),
          ...(!mustMatchParent && cleanName.length >= 4 ? [`"${cleanName}"`] : []),
        ]),
      ]
    : [
        ...new Set([
          `"${cleanName}"`,
          ...aliases.filter((a) => norm(a) !== norm(cleanName) && /^[A-Za-z\s-]+$/.test(a)).slice(0, 1).map((a) => `"${a}"`),
        ]),
      ]
  const query = queries[0] ?? `"${cleanName}"`
  const minKeyLen = /[\u0600-\u06ff\u0e00-\u0e7f\u3040-\u9fff\uac00-\ud7af]/.test(cleanName) ? 2 : 3
  const key = norm(cleanName).split(' ').filter((w) => w.length >= minKeyLen).sort((x, y) => y.length - x.length)[0]
  const fq = [cleanName, small && ctx ? ctx.name : undefined].filter(Boolean).join(' ')
  return { own, cleanName, query, queries, key, aliases, parentAliases, mustMatchParent, fq }
}

export function matchesTarget(a: Article, t: ReturnType<typeof target>): boolean {
  const hay = `${a.title} ${a.orig ?? ''} ${a.summary ?? ''}`
  if (!mentionsPlace(hay, t.aliases)) return false
  if (t.mustMatchParent && t.parentAliases.length > 0) {
    return mentionsPlace(hay, t.parentAliases)
  }
  return true
}

export function mergeAll(
  lists: Article[][],
  keyOrAliases: string | string[] | undefined,
  want: number,
  scope = '',
  parentAliases?: string[],
) {
  const nowMs = Date.now()
  const aliasList = Array.isArray(keyOrAliases) ? keyOrAliases : keyOrAliases ? [keyOrAliases] : []
  const unique = lists
    .flat()
    .filter((a) => !isNaN(+a.date))
    .map((a) => (+a.date > nowMs + 60_000 ? { ...a, date: clampDate(a.date, nowMs) } : a))
    .filter((a, i, all) => all.findIndex((b) => b.url === a.url || norm(b.title) === norm(a.title)) === i)
    .filter((a) => {
      if (!aliasList.length) return true
      const hay = `${a.title} ${a.orig ?? ''} ${a.summary ?? ''}`
      if (!mentionsPlace(hay, aliasList)) return false
      if (parentAliases?.length && !mentionsPlace(hay, parentAliases)) return false
      return true
    })
    .sort((a, b) => +b.date - +a.date)
  return clusterArticles(unique, scope)
    .sort((a, b) => +b.date - +a.date)
    .slice(0, want)
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

const newsCache = new Map<string, { at: number; r: { articles: Article[]; scope: string; query: string; exactCount: number } }>()

const NON_LATIN_LANGS = new Set(['th', 'ja', 'ko', 'zh', 'ar', 'he', 'el', 'ru', 'uk', 'bn', 'fa'])

/**
 * Fetches up to `want` (default 100) news articles strictly about the chosen place (`place.parts[from]`),
 * sorted newest-first (`+b.date - +a.date`). Never dilutes with unrelated parent-city headlines.
 */
export async function news(
  place: Place,
  from: number,
  want: number,
  deep = true,
  onPartial?: (r: { articles: Article[]; scope: string; query: string; exactCount: number }) => void,
  monthsBack = 0,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
) {
  const primary = target(place, from)
  const cc = place.cc?.toUpperCase() ?? 'US'
  const ck = `${primary.queries.join('|')}|${from}|${cc}|${monthsBack}|${want}`
  const hit = deep ? newsCache.get(ck) : undefined
  if (hit) {
    onProgress?.(100)
    onPartial?.(hit.r)
    if (Date.now() - hit.at < 60_000) return hit.r
  }
  onProgress?.(15)
  let ok = 0
  const lists: Article[][] = []

  const reqParent = primary.mustMatchParent ? primary.parentAliases : undefined
  const currentMerged = () => mergeAll(lists, primary.aliases, want, primary.cleanName, reqParent)
  const emit = () => {
    const merged = currentMerged()
    onPartial?.({ articles: merged, scope: primary.own.name, query: primary.queries[0], exactCount: merged.length })
  }

  const small = ['street', 'district'].includes(primary.own.level)
  const needsEnglishBridge = NON_LATIN_LANGS.has(editionFor(cc).lang) && /[A-Za-z]/.test(primary.cleanName)
  const editions = [
    ...new Set(
      deep && cc !== 'US' && (!small || needsEnglishBridge)
        ? [cc, 'US']
        : [cc],
    ),
  ]

  const tagItems = (items: Article[]): Article[] =>
    items.filter((a) => matchesTarget(a, primary)).map((a) => ({ ...a, scopeTag: primary.cleanName, exactMatch: true }))

  const win = async (q: string, w: string) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const got = await Promise.allSettled(editions.map((e) => headlines(q, e, w, signal)))
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    got.forEach((x) => {
      if (x.status === 'fulfilled') {
        ok++
        lists.push(tagItems(x.value))
      }
    })
    emit()
    return Math.max(0, ...got.map((x) => (x.status === 'fulfilled' ? x.value.length : 0)))
  }

  onProgress?.(28)

  // Parallel official local & national police intelligence pipeline (direct government APIs/RSS + global police domain discovery)
  const archiveMid = monthsBack > 0 ? Date.now() - monthsBack * 30.4 * 864e5 : 0
  const archiveWin =
    monthsBack > 0
      ? `after:${day(new Date(archiveMid - 15 * 864e5))} before:${day(new Date(archiveMid + 15 * 864e5))}`
      : ''

  const policePromise = (async () => {
    const tasks: Promise<void>[] = [
      fetchDirectPoliceFeeds(place, from, API, signal)
        .then((directItems) => {
          const windowed =
            monthsBack > 0
              ? directItems.filter((a) => Math.abs(+a.date - archiveMid) <= 15 * 864e5)
              : directItems
          if (windowed.length) {
            ok++
            const matched = tagItems(windowed)
            if (matched.length) {
              lists.push(matched)
              emit()
            }
          }
        })
        .catch(() => {}),
    ]

    if (deep) {
      const pQueries = policeSearchQueries(primary.cleanName, primary.aliases, cc)
      for (const pq of pQueries) {
        tasks.push(
          headlines(pq.query, pq.editionCc, archiveWin, signal)
            .then((items) => {
              ok++
              const taggedPolice = pq.forcePoliceTag
                ? items.map((a) => ({ ...a, police: true }))
                : items
              const matched = tagItems(taggedPolice)
              if (matched.length) {
                lists.push(matched)
                emit()
              }
            })
            .catch(() => {}),
        )
      }
    }
    await Promise.allSettled(tasks)
  })()

  if (monthsBack > 0) {
    for (const q of primary.queries) await win(q, archiveWin)
  } else if (!deep) {
    await win(primary.queries[0], '1d')
  } else {
    let maxInitialRaw = 0
    for (let i = 0; i < primary.queries.length; i += 2) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (currentMerged().length >= want) break
      const batch = primary.queries.slice(i, i + 2)
      const sizes = await Promise.all(batch.map((q) => win(q, '')))
      maxInitialRaw = Math.max(maxInitialRaw, ...sizes)
    }

    if (currentMerged().length < want) {
      if (maxInitialRaw >= FULL) {
        // High-volume place (e.g. major city/country): walk fine-grained recent windows
        for (let li = 0; li < LADDER.length; li++) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          onProgress?.(Math.min(80, 35 + Math.round(((li + 1) / LADDER.length) * 45)))
          const size = await win(primary.queries[0], LADDER[li])
          if (currentMerged().length >= want && size < FULL) break
        }
      } else {
        // District, suburb, street, or town (e.g. Husby, Kista, Ribegatan, Phuket):
        // explicitly sweep 7-day, 30-day, and 1-year windows so stories from 3–7 days & recent weeks surface up to 100
        const sweepQueries = [
          ...new Set([
            ...(!primary.mustMatchParent && primary.cleanName.length >= 4 ? [`"${primary.cleanName}"`] : []),
            primary.queries.find((q) => !q.endsWith('"')) ?? primary.queries[0],
          ]),
        ]
        const sweepWindows = ['7d', '30d', '1y']
        for (let wi = 0; wi < sweepWindows.length; wi++) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          if (currentMerged().length >= want) break
          onProgress?.(Math.min(82, 42 + (wi + 1) * 13))
          await Promise.all(sweepQueries.map((sq) => win(sq, sweepWindows[wi])))
        }
      }
    }

    if (currentMerged().length < want) {
      const gq = !primary.mustMatchParent && primary.cleanName.length >= 4 ? `"${primary.cleanName}"` : primary.queries[0]
      await gdeltHeadlines(gq, cc, '', signal)
        .then((g) => {
          ok++
          if (g.length) {
            lists.push(tagItems(g))
            emit()
          }
        })
        .catch(() => {})
    }

    if (!isLocalProxyBlocked() && currentMerged().length < Math.min(want, 70)) {
      const q = !primary.mustMatchParent && primary.cleanName.length >= 4 ? `"${primary.cleanName}"` : primary.queries[0]
      const w = wordsFor(cc)
      const got = await Promise.allSettled(w.map((x) => bingHeadlines(`${q} ${x}`, cc, '', signal)))
      got.forEach((x) => {
        if (x.status === 'fulfilled') {
          ok++
          lists.push(tagItems(x.value))
        }
      })
      emit()
    }
  }

  if (deep && API && currentMerged().length < Math.min(want, 15)) {
    await keyed(primary.queries[0], cc, signal)
      .then((l) => {
        if (l.length) {
          ok++
          lists.push(tagItems(l))
          emit()
        }
      })
      .catch(() => {})
  }

  if (deep) {
    const custom = loadSources()
    if (custom.length) {
      await Promise.allSettled(
        custom.map((d) =>
          headlines(`${primary.queries[0]} site:${d}`, cc, '', signal).then((items) => {
            if (items.length) {
              ok++
              lists.push(tagItems(items))
              emit()
            }
          }),
        ),
      )
    }
  }

  await policePromise
  onProgress?.(95)
  if (!ok) throw new Error('err.source')
  const finalArticles = currentMerged()
  const r = { articles: finalArticles, scope: primary.own.name, query: primary.queries[0], exactCount: finalArticles.length }
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
  const j = (await r.json()) as {
    hits: { objectID: string; title: string; story_text?: string; created_at_i: number; points?: number; num_comments?: number }[]
  }
  return j.hits.map((h) => {
    const comments = h.num_comments ?? 0
    const pts = Math.max(0, h.points ?? 0)
    return {
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: h.title,
      summary: h.story_text ? h.story_text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260) || undefined : undefined,
      source: comments > 0 ? `hacker news (${comments})` : 'hacker news',
      date: clampDate(new Date(h.created_at_i * 1000)),
      comments,
      score: comments * 3 + pts,
      forum: true,
      lang: 'en',
    }
  })
}

async function stackExchange(query: string, site: string, max: number, signal?: AbortSignal): Promise<Article[]> {
  const r = await fetch(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(query)}&site=${site}&pagesize=${Math.min(max, 50)}`,
    { signal: withTimeout(signal, 7000) },
  )
  if (!r.ok) throw new Error('err.source')
  const j = (await r.json()) as { items: { link: string; title: string; creation_date: number; answer_count?: number; score?: number }[] }
  const dec = (t: string) => new DOMParser().parseFromString(t, 'text/html').documentElement.textContent ?? t
  return j.items.map((q) => {
    const comments = q.answer_count ?? 0
    const sc = Math.max(0, q.score ?? 0)
    return {
      url: q.link,
      title: dec(q.title),
      source: comments > 0 ? `stack exchange ${site} (${comments})` : `stack exchange ${site}`,
      date: clampDate(new Date(q.creation_date * 1000)),
      comments,
      score: comments * 4 + sc,
      forum: true,
      lang: 'en',
    }
  })
}

const FB_ANCHORS: [number, string][] = [[2720053, '2016-05-13T11:34:00'], [3507628, '2023-02-08T06:09:00'], [3748124, '2026-10-04T04:15:00']]
export function flashbackCreated(id: number): Date {
  const pts = FB_ANCHORS.map(([i, d]) => [i, +new Date(d)] as const)
  const [a, b] = id <= pts[1][0] ? [pts[0], pts[1]] : [pts[1], pts[2]]
  return clampDate(new Date(a[1] + ((id - a[0]) / (b[0] - a[0])) * (b[1] - a[1])))
}

/** Parses Flashback timestamps including `"Idag 20:15"`, `"Igår 18:40"`, `"2026-11-08, 14:22"`, and `"2026-11-08 14:22"`. */
export function parseFlashbackDate(raw: string, now = new Date()): Date | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  const iso = text.match(/(\d{4}-\d{2}-\d{2})[,\s]+(\d{2}):(\d{2})/)
  if (iso) return clampDate(new Date(`${iso[1]}T${iso[2]}:${iso[3]}:00`), +now)

  const rel = text.match(/\b(idag|ig[åa]r)[,\s]+(\d{2}):(\d{2})/i)
  if (rel) {
    const d = new Date(now)
    if (/^ig/i.test(rel[1])) d.setDate(d.getDate() - 1)
    d.setHours(Number(rel[2]), Number(rel[3]), 0, 0)
    return clampDate(d, +now)
  }
  return null
}

let fbNext = 0
const fbCache = new Map<string, { at: number; rows: Article[] }>()

async function flashbackPage(query: string, order: string, searchPosts = false, page = 1, signal?: AbortSignal): Promise<Article[]> {
  if (isLocalProxyBlocked()) throw new Error('err.source')
  const fbPath = `/sok/?query=${encodeURIComponent(query)}&so=${order}${searchPosts ? '&sp=1' : ''}${page > 1 ? `&p=${page}` : ''}`
  const url = `${API}/fb${fbPath}`
  const canonicalFb = `https://www.flashback.org${fbPath}`
  const hit = fbCache.get(url)
  if (hit && Date.now() - hit.at < 300_000) return hit.rows
  const wait = fbNext - Date.now()
  fbNext = Math.max(Date.now(), fbNext) + 2200
  if (wait > 0) await abortableSleep(wait, signal)
  let buf: ArrayBuffer | null = null
  try {
    const r = await fetch(url, { signal: withTimeout(signal, 6000) })
    if (r.ok) buf = await r.arrayBuffer()
  } catch (e) {
    if (signal?.aborted) throw e
  }
  if (!buf) {
    buf = await Promise.any([
      fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(canonicalFb)}`, { signal: withTimeout(signal, 6500) }).then((r) =>
        r.ok ? r.arrayBuffer() : Promise.reject(new Error('err.source')),
      ),
      fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(canonicalFb)}`, { signal: withTimeout(signal, 6500) }).then((r) =>
        r.ok ? r.arrayBuffer() : Promise.reject(new Error('err.source')),
      ),
    ]).catch(() => {
      throw new Error('err.source')
    })
  }
  const decoded = new TextDecoder('iso-8859-1').decode(buf)
  const htmlText = /Ã¥|Ã¤|Ã¶|Ã…|Ã„|Ã–/.test(decoded) ? new TextDecoder('utf-8').decode(buf) : decoded
  const doc = new DOMParser().parseFromString(htmlText, 'text/html')

  if (searchPosts) {
    // Post-search mode (`sp=1`) finds street/address/place mentions inside individual Flashback posts
    const containers = [...doc.querySelectorAll('.post, tr')]
    const seenUrls = new Set<string>()
    const postRows = containers.flatMap((el) => {
      const link = el.querySelector('a[href^="/sp"], a[href^="/p"], a[href^="/t"]')
      if (!link) return []
      const href = link.getAttribute('href')!
      const fullUrl = new URL(href, 'https://www.flashback.org').href
      if (seenUrls.has(fullUrl)) return []
      const titleEl = el.querySelector('a[href^="/t"] strong, .post-heading a, a[id^="thread_title_"], a[href^="/t"]') ?? link
      const bodyTxt = (el.querySelector('.post_message, .post-body, td.td_title')?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const tId = Number(el.innerHTML.match(/\/t(\d+)/)?.[1] ?? 0)
      const dt = parseFlashbackDate(el.textContent ?? '') ?? (tId ? flashbackCreated(tId) : null)
      if (!dt) return []
      seenUrls.add(fullUrl)
      return [{
        url: fullUrl,
        title: (titleEl.textContent ?? '').replace(/\s+/g, ' ').trim() || query,
        summary: bodyTxt ? bodyTxt.slice(0, 320) : undefined,
        source: 'flashback · inlägg',
        date: dt,
        approx: !parseFlashbackDate(el.textContent ?? ''),
        comments: 1,
        score: 25,
        forum: true,
        lang: 'sv',
      }]
    })
    fbCache.set(url, { at: Date.now(), rows: postRows })
    return postRows
  }

  const rows = [...doc.querySelectorAll('td.td_title')].flatMap((td) => {
    const a = td.querySelector('a[id^="thread_title_"]')
    if (!a) return []
    const trEl = td.closest('tr')
    const lastPostTxt = trEl?.querySelector('td.td_last_post')?.textContent ?? ''
    const lastDate = parseFlashbackDate(lastPostTxt)
    const id = Number(a.getAttribute('href')!.match(/\/t(\d+)/)?.[1])
    if (!id && !lastDate) return []
    const createdDate = id ? flashbackCreated(id) : lastDate!
    const activeRecently = lastDate && Date.now() - +lastDate < 30 * 864e5
    const effectiveDate = activeRecently ? lastDate : createdDate
    const repliesTxt = trEl?.querySelector('td.td_replies')?.textContent ?? ''
    const replies = Number((repliesTxt.replace(/[^\d]/g, '') || '0').slice(0, 7)) || 0
    const section = td.querySelector('.thread-forum-title')?.textContent?.trim()
    const baseSrc = `flashback${section ? ` · ${section}` : ''}`
    return [{
      url: new URL(a.getAttribute('href')!, 'https://www.flashback.org').href,
      title: a.textContent!.trim(),
      source: replies > 0 ? `${baseSrc} (${replies})` : baseSrc,
      date: effectiveDate,
      approx: !activeRecently,
      comments: replies,
      score: replies * 3 + (activeRecently ? 25 : 0),
      forum: true,
      lang: 'sv',
    }]
  })
  fbCache.set(url, { at: Date.now(), rows })
  return rows
}

/**
 * Fetches up to `want` (default 100) forum threads/posts strictly discussing the chosen place (`place.parts[from]`).
 * Never mixes in unrelated parent-city or country-wide forum posts.
 */
export async function forum(
  place: Place,
  from: number,
  want = 100,
  onPartial?: (r: { articles: Article[]; scope: string; query: string }) => void,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void,
) {
  const primary = target(place, from)
  const cc = place.cc?.toUpperCase() ?? ''
  const acc = new Map<string, Article>()
  let doneTasks = 0
  const placeNames = place.parts.slice(from).map((p) => (p.level === 'street' ? streetBaseName(p.name) : p.name))
  const subList = localSubreddits(cc, placeNames)
  const totalTasks = 7 + (cc === 'SE' && !isLocalProxyBlocked() ? 1 : 0)
  onProgress?.(20)

  const snapshot = () => ({
    articles: [...acc.values()]
      .filter((a) => !isNaN(+a.date))
      .map((a) => (+a.date > Date.now() + 60_000 ? { ...a, date: clampDate(a.date) } : a))
      .sort((a, b) => +b.date - +a.date)
      .slice(0, want),
    scope: primary.own.name,
    query: primary.cleanName,
  })

  const add = (list: Article[]) => {
    doneTasks++
    onProgress?.(Math.min(92, 20 + Math.round((doneTasks / totalTasks) * 72)))
    if (signal?.aborted) return
    let changed = false
    for (const a of list) {
      if (!matchesTarget(a, primary)) continue
      const prev = acc.get(a.url)
      if (!prev || (a.score ?? 0) > (prev.score ?? 0)) {
        acc.set(a.url, { ...a, scopeTag: primary.cleanName, exactMatch: true })
        changed = true
      }
    }
    if (changed) onPartial?.(snapshot())
  }

  const exactPhrase = `"${primary.cleanName.replace(/ı/g, 'i').replace(/İ/g, 'I')}"`
  const rqContext = primary.fq.replace(/ı/g, 'i').replace(/İ/g, 'I')
  const redditQueries = [
    ...new Set([
      ...(!primary.mustMatchParent && primary.cleanName.length >= 4 ? [exactPhrase] : []),
      rqContext,
    ]),
  ]

  const flashback = async () => {
    const fbQueries = [...new Set([...(!primary.mustMatchParent ? [primary.cleanName] : []), primary.fq])]
    for (const fq of fbQueries) {
      for (const order of ['pd', 'rd']) {
        if (signal?.aborted || acc.size >= want) break
        add(await flashbackPage(fq, order, false, 1, signal).catch(() => []))
      }
    }
    // Search inside individual Flashback posts (`sp=1`) across up to 3 pages so up to ~75 street/place post mentions surface
    const postQ = primary.mustMatchParent ? primary.fq : primary.cleanName
    for (const pg of [1, 2, 3]) {
      if (signal?.aborted || acc.size >= want) break
      const rows = await flashbackPage(postQ, 'pd', true, pg, signal).catch(() => [])
      add(rows)
      if (rows.length < 15) break
    }
  }

  const redditFlow = async () => {
    for (const q of redditQueries) {
      if (signal?.aborted || acc.size >= want) break
      const [newest, discussed] = await Promise.allSettled([
        reddit(q, 100, '', '', 'new', signal),
        want >= 40 ? reddit(q, 100, '', '', 'comments', signal) : Promise.resolve([] as Article[]),
      ])
      if (newest.status === 'fulfilled') add(newest.value)
      if (discussed.status === 'fulfilled') add(discussed.value)
    }
    const subQuery = primary.mustMatchParent ? rqContext : primary.cleanName
    for (const sub of subList.slice(0, 3)) {
      if (acc.size >= want || signal?.aborted) break
      await abortableSleep(500, signal)
      add(await reddit(subQuery, 100, sub, '', 'new', signal).catch(() => []))
    }
  }

  const lemmyQ = primary.mustMatchParent ? rqContext : exactPhrase
  const hnQ = primary.mustMatchParent ? rqContext : exactPhrase

  const got = await Promise.allSettled([
    redditFlow(),
    lemmyDiscussions(lemmyQ, cc, signal).then(add),
    regionalDiscussions(primary.mustMatchParent ? primary.fq : primary.cleanName, cc, API, isLocalProxyBlocked(), signal).then(add),
    hackerNews(hnQ, want, signal).then(add),
    stackExchange(hnQ, 'travel', want, signal).then(add),
    stackExchange(hnQ, 'expatriates', want, signal).then(add),
    ...(cc === 'SE' && !isLocalProxyBlocked() ? [flashback()] : []),
  ])

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (acc.size === 0 && got.every((x) => x.status === 'rejected')) throw (got[0] as PromiseRejectedResult).reason
  onProgress?.(95)
  return snapshot()
}

/**
 * Ranks items for the "Most covered / Mest omskrivet" (`sortBy === 'hot'`) mode:
 * - News: multi-source cluster coverage (`also.length`) + shared event/topic stem buzz across headlines
 * - Forum: reply/comment count + community score/upvotes + shared topic buzz across threads
 */
export function rankMostCovered(articles: Article[], scope = ''): Article[] {
  if (articles.length <= 1) return [...articles]
  const scopeWords = new Set(norm(scope).split(' ').filter((w) => w.length >= 3))
  const stem = (w: string) => (w.length >= 6 ? w.slice(0, 6) : w)
  const tokensOf = (a: Article) => {
    const s = new Set<string>()
    for (const w of norm(a.orig ?? a.title).split(' ')) {
      if (!w || w.length < 4 || STOP.has(w) || scopeWords.has(w)) continue
      s.add(stem(w))
    }
    return [...s]
  }

  const freq = new Map<string, number>()
  const itemTokens = new Map<string, string[]>()
  for (const a of articles) {
    const toks = tokensOf(a)
    itemTokens.set(a.url, toks)
    for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1)
  }

  const hotScore = (a: Article): number => {
    const toks = itemTokens.get(a.url) ?? []
    const sharedCounts = toks
      .map((t) => (freq.get(t) ?? 1) - 1)
      .filter((n) => n > 0)
      .sort((x, y) => y - x)
      .slice(0, 3)
    const buzz = sharedCounts.reduce((sum, n) => sum + n, 0)

    if (a.forum) {
      const parsedReplies = Number(a.source.match(/\((\d+)\)/)?.[1] ?? 0)
      const replies = a.comments ?? parsedReplies
      return replies * 5 + (a.score ?? 0) + buzz * 12
    }
    const multiOutlets = a.also?.length ?? 0
    return multiOutlets * 500 + buzz * 30 + (a.score ?? 0)
  }

  return [...articles].sort((a, b) => hotScore(b) - hotScore(a) || +b.date - +a.date)
}

/** Ranks forum threads by importance (urgent topics + reply/upvote score + recency) for spotlighting when press coverage is sparse. */
export function rankImportantForum(threads: Article[], limit = 8): Article[] {
  const now = Date.now()
  const scoreOf = (a: Article) => {
    const parsedReplies = Number(a.source.match(/\((\d+)\)/)?.[1] ?? 0)
    const replies = a.comments ?? parsedReplies
    const engagement = Math.min(120, a.score ?? (replies > 0 ? replies * 3 : 10))
    const cats = topicsOf(`${a.orig ?? a.title} ${a.summary ?? ''}`)
    const topicBonus = cats.some((c) => c === 'Crime' || c === 'Accident') ? 45 : cats.length > 0 ? 20 : 0
    const ageDays = Math.max(0, (now - +a.date) / 864e5)
    const recency = ageDays <= 1 ? 80 : ageDays <= 7 ? 50 : ageDays <= 30 ? 25 : 5
    return topicBonus + engagement + recency
  }
  return [...threads].sort((a, b) => scoreOf(b) - scoreOf(a) || +b.date - +a.date).slice(0, limit)
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

/** Shows a native notification safely on Android, iOS Home-Screen PWA, and Desktop browsers via the Service Worker. */
export async function showAppNotification(title: string, body: string, url = './', tag = 'newzlocal'): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag,
        renotify: true,
        data: { url },
      } as NotificationOptions)
      return
    }
  } catch { /* fallback to window Notification on non-SW desktop */ }
  try {
    const n = new Notification(title, { body, tag })
    n.onclick = () => {
      window.focus()
      if (url.startsWith('./#') || url.startsWith('#')) location.hash = url.replace(/^\.\//, '')
    }
  } catch { /* mobile browsers disallow new Notification() */ }
}

export async function syncPushSubscription(favs: Place[], lang: string, quietMap: Record<string, Quiet>): Promise<boolean> {
  if (!API || !('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return false
  try {
    let pubKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
    if (!pubKey) {
      const kr = await fetch(`${API}/push/vapid`, { signal: AbortSignal.timeout(5000) })
      if (!kr.ok) return false
      pubKey = ((await kr.json()) as { publicKey?: string }).publicKey
    }
    if (!pubKey) return false
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey) as BufferSource,
      })
    }
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
        places: favs.slice(0, 15).map((f) => ({
          label: label(f),
          hash: encodePlace(f, 0),
          cc: f.cc,
          parts: f.parts,
          cat: f.cat,
          alert: f.alert,
          alertNews: f.alertNews !== false,
          alertForum: f.alertForum !== false,
        })),
      }),
    })
    return r.ok
  } catch {
    return false
  }
}

/** Triggers a real end-to-end encrypted Web Push test from the Cloudflare Worker (with local SW fallback). */
export async function sendTestPush(title: string, body: string): Promise<'push' | 'local' | 'failed'> {
  if (!('Notification' in window)) return 'failed'
  if (Notification.permission !== 'granted') {
    const p = await Notification.requestPermission()
    if (p !== 'granted') return 'failed'
  }
  if (API && 'serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const kr = await fetch(`${API}/push/vapid`, { signal: AbortSignal.timeout(5000) })
        if (kr.ok) {
          const pubKey = ((await kr.json()) as { publicKey?: string }).publicKey
          if (pubKey) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(pubKey) as BufferSource,
            })
          }
        }
      }
      if (sub) {
        const r = await fetch(`${API}/push/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), title, body }),
          signal: AbortSignal.timeout(8000),
        })
        if (r.ok) return 'push'
      }
    } catch { /* fall back to local SW notification */ }
  }
  await showAppNotification(title, body, './', 'newzlocal-test')
  return 'local'
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

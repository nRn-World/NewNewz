import { topicsOf } from '../src/topicRules.ts'

// Cloudflare Worker: hardened CORS proxy (/gn, /bn, /rd, /fb, /meneame, /eksi, /meta, /gnews, /nd)
// + zero-config RFC 8291 / VAPID Web Push background alerts for both News AND Forum posts on saved addresses/places.
const ORIGINS = {
  '/gn': 'https://news.google.com',
  '/bn': 'https://www.bing.com',
  '/rd': 'https://www.reddit.com',
  '/fb': 'https://www.flashback.org',
}
const KEYED = {
  '/gnews': ['https://gnews.io/api/v4', 'GNEWS_KEY', 'apikey'],
  '/nd': ['https://newsdata.io/api/1', 'NEWSDATA_KEY', 'apikey'],
}
const DEFAULT_ALLOWED = ['https://nrnworld.one', 'https://www.nrnworld.one', 'https://nrn-world.github.io', 'http://localhost:5173', 'http://localhost:4173']

/** The app's own sites (plus ALLOWED_ORIGINS and local development): the only pages that may spend the keyed API quota. */
function isTrustedOrigin(origin, env) {
  const extra = (env?.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if ([...DEFAULT_ALLOWED, ...extra].includes(origin)) return true
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true
  return /^https:\/\/([a-z0-9-]+\.)*nrnworld\.one$/i.test(origin)
}

/**
 * Pages that may call the Worker at all. A request without an Origin header is not a browser page (the Android app's
 * background job, a server); browsers always send one cross-site, so other websites cannot use this as their proxy.
 */
function isAllowedOrigin(origin, env) {
  if (!origin) return true
  if (isTrustedOrigin(origin, env)) return true
  // preview sandboxes used while developing the app
  return /^https:\/\/([a-z0-9-]+\.)*(e2b\.app|e2b\.dev|arena\.ai|arena\.site|lmarena\.ai)$/i.test(origin)
}

/** Web Push is only ever delivered to the browser vendors' push services, never to an arbitrary URL a client names. */
function isPushServiceUrl(endpoint) {
  try {
    const u = new URL(String(endpoint))
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.port &&
      /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/i.test(u.hostname)
    )
  } catch {
    return false
  }
}

const enc = new TextEncoder()
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (str) => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
}
const concat = (...arrs) => {
  const total = arrs.reduce((n, a) => n + a.byteLength, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrs) {
    out.set(new Uint8Array(a.buffer ?? a, a.byteOffset ?? 0, a.byteLength), off)
    off += a.byteLength
  }
  return out
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes))
}

async function hkdf(salt, ikm, info, length) {
  const prk = await hmacSha256(salt.byteLength ? salt : new Uint8Array(32), ikm)
  const okm = await hmacSha256(prk, concat(info, new Uint8Array([1])))
  return okm.slice(0, length)
}

/** Encrypts a UTF-8 Push payload per RFC 8291 (`aes128gcm` content encoding) using native Web Crypto. */
export async function encryptWebPush(payloadText, p256dhB64, authB64) {
  const uaPubBytes = unb64u(p256dhB64)
  const authSecret = unb64u(authB64)
  const uaPubKey = await crypto.subtle.importKey('raw', uaPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPubBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey))
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asKeyPair.privateKey, 256))

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPubBytes, asPubBytes)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const paddedPlain = concat(enc.encode(payloadText), new Uint8Array([2]))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlain))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)
  const header = concat(salt, rs, new Uint8Array([asPubBytes.byteLength]), asPubBytes)
  return concat(header, ciphertext)
}

/** Signs a VAPID JWT (`ES256`) for the push service origin. */
export async function signVapidJwt(endpoint, privateJwkStr, subject = 'mailto:contact@nrnworld.one') {
  const aud = new URL(endpoint).origin
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64u(enc.encode(JSON.stringify({ aud, exp, sub: subject })))
  const unsigned = `${head}.${body}`
  const jwk = typeof privateJwkStr === 'string' ? JSON.parse(privateJwkStr) : privateJwkStr
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned))
  return `${unsigned}.${b64u(sig)}`
}

/** Retrieves VAPID keys from env secrets or auto-generates and persists a P-256 keypair inside SUBS_KV on first use. */
export async function getOrCreateVapid(env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: env.VAPID_PRIVATE_JWK }
  }
  if (!env.SUBS_KV) return null
  const rawStored = await env.SUBS_KV.get('sys:vapid')
  if (rawStored) {
    try {
      const stored = typeof rawStored === 'string' ? JSON.parse(rawStored) : rawStored
      if (stored?.publicKey && stored?.privateJwk) return stored
    } catch { /* regenerate */ }
  }

  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  const generated = { publicKey: b64u(rawPub), privateJwk }
  await env.SUBS_KV.put('sys:vapid', JSON.stringify(generated))
  return generated
}

async function deliverPush(subscription, payloadObj, vapid, subject) {
  const encrypted = await encryptWebPush(JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth)
  const jwt = await signVapidJwt(subscription.endpoint, vapid.privateJwk, subject)
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body: encrypted,
  })
}

async function subKey(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(endpoint))
  return `sub:${b64u(digest)}`
}

/** Minutes past midnight on the subscriber's own clock (UTC for subscriptions stored before the zone was sent). */
function localMinutes(tz, now) {
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
      const num = (type) => Number(parts.find((x) => x.type === type)?.value)
      const m = num('hour') * 60 + num('minute')
      if (Number.isFinite(m)) return m
    } catch { /* unknown zone name */ }
  }
  return now.getUTCHours() * 60 + now.getUTCMinutes()
}

export function inQuietHours(q, tz, now = new Date()) {
  if (!q?.on) return false
  const m = localMinutes(tz, now)
  const [fh, fm] = String(q.from || '22:00').split(':').map(Number)
  const [th, tm] = String(q.to || '07:00').split(':').map(Number)
  const f = fh * 60 + fm, e = th * 60 + tm
  return f <= e ? m >= f && m < e : m >= f || m < e
}

function streetBase(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/\b(?:no|nr|lgh|apt|unit)[:.\s-]*\d+[a-z]?\b/gi, '')
    .replace(/\s+\d+[a-z]?(?:[-/]\d+[a-z]?)?$/i, '')
    .replace(/^\d+[a-z]?\s+/, '')
    .trim()
  return s.length >= 2 ? s : String(raw || '').trim()
}

function normStr(s) {
  return String(s || '')
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function decodeEntities(s) {
  const cp = (n) => {
    try { return String.fromCodePoint(n) } catch { return '' }
  }
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => cp(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => cp(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Bing wraps every article in a tracking redirect that changes between requests; the article's own address does not. */
function articleUrl(rawLink) {
  const link = decodeEntities(rawLink).trim()
  try {
    const inner = new URL(link).searchParams.get('url')
    if (inner && /^https?:\/\//i.test(inner)) return inner
  } catch { /* not a URL: keep as is */ }
  return link
}

const LEVELS = new Set(['street', 'district', 'city', 'state', 'country'])
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Keeps only the fields the alert check uses, with bounded sizes, so a client cannot store arbitrary data here. */
function cleanPlace(p) {
  const parts = (Array.isArray(p?.parts) ? p.parts : [])
    .slice(0, 6)
    .map((x) => ({ level: LEVELS.has(x?.level) ? x.level : 'city', name: str(x?.name, 120).trim() }))
    .filter((x) => x.name)
  const label = str(p?.label, 200).trim()
  if (!label || !parts.length) return null
  const cc = str(p?.cc, 2).toUpperCase()
  const alert = (Array.isArray(p?.alert) ? p.alert : []).filter((x) => typeof x === 'string').slice(0, 20).map((x) => x.slice(0, 24))
  return {
    label,
    hash: str(p?.hash, 1500),
    ...(/^[A-Z]{2}$/.test(cc) ? { cc } : {}),
    parts,
    ...(str(p?.cat, 40) ? { cat: str(p.cat, 40) } : {}),
    ...(alert.length ? { alert } : {}),
    ...(typeof p?.lat === 'number' && typeof p?.lon === 'number' ? { lat: p.lat, lon: p.lon } : {}),
    alertNews: p?.alertNews !== false,
    alertForum: p?.alertForum !== false,
  }
}

function cleanQuiet(quiet) {
  const out = {}
  if (!quiet || typeof quiet !== 'object') return out
  for (const [cat, q] of Object.entries(quiet).slice(0, 40)) {
    const hhmm = (v, dflt) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : dflt)
    out[cat.slice(0, 40)] = { on: q?.on === true, from: hhmm(q?.from, '22:00'), to: hhmm(q?.to, '07:00') }
  }
  return out
}

function cleanTimeZone(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: str(tz, 64) }).resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

/** A favourite limited to certain topics (e.g. only crime and accidents) is alerted about those alone. */
function wantedByTopic(place, items) {
  if (!Array.isArray(place?.alert) || !place.alert.length) return items
  return items.filter((it) => topicsOf(it.title, it.police === true).some((id) => place.alert.includes(id)))
}

function hasPlaceWord(text, mustKey) {
  if (!mustKey) return true
  const hay = ` ${normStr(text)} `
  return hay.includes(` ${mustKey}`)
}

function buildPlaceQueries(place) {
  const parts = Array.isArray(place.parts) ? place.parts : []
  if (!parts.length) return { newsQueries: [], forumQueries: [], mustKey: '', cleanOwn: '' }
  const own = parts[0]
  const cleanOwn = own.level === 'street' ? streetBase(own.name) : own.name
  const hasHouseNo = own.level === 'street' && normStr(own.name) !== normStr(cleanOwn)
  const up = parts.slice(1)
  const ctx = up.find((x) => x.level === 'city') ?? up[0]
  const small = own.level === 'street' || own.level === 'district'
  const newsQueries = small && ctx
    ? [
        ...new Set([
          ...(hasHouseNo ? [`"${own.name}" "${ctx.name}"`] : []),
          `"${cleanOwn}" "${ctx.name}"`,
          `"${cleanOwn}" ${ctx.name}`,
          ...(cleanOwn.length >= 4 ? [`"${cleanOwn}"`] : []),
        ]),
      ]
    : [`"${cleanOwn}"`]
  const forumQueries = [
    ...(cleanOwn.length >= 4 ? [`"${cleanOwn}"`] : []),
    ...(small && ctx ? [`${cleanOwn} ${ctx.name}`] : [cleanOwn]),
  ]
  const mustKey = normStr(cleanOwn).split(' ').filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)[0] || ''
  return { newsQueries, forumQueries, mustKey, cleanOwn }
}

let d1ReadyPromise = null

async function ensureD1Table(db) {
  if (!d1ReadyPromise) {
    d1ReadyPromise = db
      .prepare(
        'CREATE TABLE IF NOT EXISTS push_subs (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)',
      )
      .run()
      .catch((e) => {
        d1ReadyPromise = null
        throw e
      })
  }
  await d1ReadyPromise
}

function hasSubStore(env) {
  return Boolean(env?.SUBS_DB || env?.SUBS_KV)
}

async function getSubRecord(env, k) {
  if (env?.SUBS_DB) {
    await ensureD1Table(env.SUBS_DB)
    const row = await env.SUBS_DB.prepare('SELECT data FROM push_subs WHERE id = ?').bind(k).first()
    if (row?.data) {
      try { return JSON.parse(row.data) } catch { return null }
    }
    if (!env.SUBS_KV) return null
  }
  if (env?.SUBS_KV) {
    return await env.SUBS_KV.get(k, 'json')
  }
  return null
}

async function putSubRecord(env, k, obj) {
  const json = JSON.stringify(obj)
  if (env?.SUBS_DB) {
    await ensureD1Table(env.SUBS_DB)
    await env.SUBS_DB.prepare(
      'INSERT OR REPLACE INTO push_subs (id, data, updated_at) VALUES (?, ?, ?)',
    )
      .bind(k, json, Date.now())
      .run()
    return
  }
  if (env?.SUBS_KV) {
    await env.SUBS_KV.put(k, json, { expirationTtl: 90 * 86400 })
  }
}

async function deleteSubRecord(env, k) {
  if (env?.SUBS_DB) {
    await ensureD1Table(env.SUBS_DB)
    await env.SUBS_DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(k).run()
  }
  if (env?.SUBS_KV) {
    await env.SUBS_KV.delete(k)
  }
}

async function listSubRecords(env) {
  if (env?.SUBS_DB) {
    await ensureD1Table(env.SUBS_DB)
    const minUpdated = Date.now() - 90 * 86400 * 1000
    const res = await env.SUBS_DB.prepare('SELECT id, data FROM push_subs WHERE updated_at > ? LIMIT 2000')
      .bind(minUpdated)
      .all()
    const rows = res?.results ?? []
    if (rows.length > 0 || !env.SUBS_KV) {
      return rows
        .map((r) => {
          try { return { key: r.id, rec: JSON.parse(r.data) } } catch { return null }
        })
        .filter(Boolean)
    }
  }
  if (env?.SUBS_KV) {
    const list = await env.SUBS_KV.list({ prefix: 'sub:', limit: 1000 })
    const out = []
    for (const item of list.keys) {
      const rec = await env.SUBS_KV.get(item.name, 'json')
      if (rec) out.push({ key: item.name, rec })
    }
    return out
  }
  return []
}

async function checkNewsForPlace(place, queries, mustKey, sharedPolisenPromise) {
  const cc = (place.cc || 'US').toUpperCase()
  const out = []

  // Direct Swedish Police Open Data API check for Sweden (`polisen.se/api/events`), shared across batch
  if (cc === 'SE') {
    try {
      const events = sharedPolisenPromise
        ? await sharedPolisenPromise()
        : await fetch('https://polisen.se/api/events', {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalPush/1.0)' },
            cf: { cacheTtl: 180, cacheEverything: true },
            signal: AbortSignal.timeout(5500),
          }).then((pr) => (pr.ok ? pr.json() : []))
      if (Array.isArray(events)) {
        for (const ev of events.slice(0, 150)) {
          const hay = `${ev?.name ?? ''} ${ev?.summary ?? ''} ${ev?.location?.name ?? ''}`
          if (ev?.url && ev?.name && hasPlaceWord(hay, mustKey)) {
            out.push({
              title: `🛡 Polisen · ${ev.type ? `${ev.type}: ${ev.summary || ev.name}` : ev.name}`,
              url: ev.url.startsWith('http') ? ev.url : `https://polisen.se${ev.url}`,
              kind: 'news',
              police: true,
            })
            if (out.length >= 4) break
          }
        }
      }
    } catch { /* fallback to RSS */ }
  }

  // Direct Phuket Tourist Police RSS check when watching Phuket
  if (cc === 'TH' && (mustKey === 'phuket' || (place.lat >= 7.7 && place.lat <= 8.22 && place.lon >= 98.2 && place.lon <= 98.48))) {
    try {
      const tr = await fetch('https://phuket.tourist.police.go.th/feed/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalPush/1.0)' },
        cf: { cacheTtl: 240, cacheEverything: true },
        signal: AbortSignal.timeout(5500),
      })
      if (tr.ok) {
        const xml = await tr.text()
        for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          const b = m[1]
          const t = (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)?.[1] ?? b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim()
          const l = (b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim()
          if (t && l) {
            out.push({ title: `🛡 Phuket Police · ${decodeEntities(t)}`, url: decodeEntities(l), kind: 'news', police: true })
            if (out.length >= 3) break
          }
        }
      }
    } catch { /* fallback to RSS */ }
  }

  // Only run top 2 disambiguated queries with 4-minute Cloudflare edge cache to minimize subrequests
  for (const q of queries.slice(0, 2)) {
    try {
      const r = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&cc=${cc}&sortbydate=1`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalPush/1.0)' },
        cf: { cacheTtl: 240, cacheEverything: true },
        signal: AbortSignal.timeout(6000),
      })
      if (r.ok) {
        const xml = await r.text()
        for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
          const block = m[1]
          const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)
          const desc = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/)
          const link = block.match(/<link>([\s\S]*?)<\/link>/)
          const t = (title?.[1] ?? title?.[2] ?? '').trim()
          const d = (desc?.[1] ?? desc?.[2] ?? '').replace(/<[^>]+>/g, ' ').trim()
          const l = (link?.[1] ?? '').trim()
          // `raw` is the address as alerts stored it before articleUrl(): it keeps already-seen stories seen
          if (t && l && hasPlaceWord(`${t} ${d}`, mustKey)) out.push({ title: decodeEntities(t), url: articleUrl(l), raw: l, kind: 'news' })
        }
      }
    } catch { /* next */ }
    if (out.length >= 8) break
  }
  return out.slice(0, 12)
}

async function checkForumsForPlace(place, forumQueries, mustKey, cleanOwn) {
  const cc = (place.cc || '').toUpperCase()
  const out = []
  const q = forumQueries[0]
  if (!q) return out

  // 1. Reddit newest threads (edge-cached 240s)
  try {
    const r = await fetch(`https://www.reddit.com/search.json?raw_json=1&sort=new&limit=15&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'NewzLocalAlert/1.0' },
      cf: { cacheTtl: 240, cacheEverything: true },
      signal: AbortSignal.timeout(5500),
    })
    if (r.ok) {
      const j = await r.json()
      for (const c of j?.data?.children ?? []) {
        const d = c?.data
        if (d?.permalink && d?.title && hasPlaceWord(`${d.title} ${d.selftext || ''}`, mustKey)) {
          out.push({ title: d.title, url: `https://www.reddit.com${d.permalink}`, kind: 'forum' })
        }
      }
    }
  } catch { /* ignore */ }

  // 2. Flashback active threads & post mentions in Sweden (edge-cached 240s)
  if (cc === 'SE' && cleanOwn) {
    try {
      const r = await fetch(`https://www.flashback.org/sok/?query=${encodeURIComponent(cleanOwn)}&so=pd`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cf: { cacheTtl: 240, cacheEverything: true },
        signal: AbortSignal.timeout(5500),
      })
      if (r.ok) {
        const html = new TextDecoder('iso-8859-1').decode(await r.arrayBuffer())
        for (const m of html.matchAll(/<a[^>]+id=["']thread_title_(\d+)["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
          const href = m[2]
          const title = decodeEntities(m[3].replace(/<[^>]+>/g, '')).trim()
          if (title && href && hasPlaceWord(title, mustKey)) {
            out.push({ title, url: new URL(href, 'https://www.flashback.org').href, kind: 'forum' })
          }
          if (out.length >= 16) break
        }
      }
    } catch { /* ignore */ }
  }

  // 3. Lemmy Fediverse (edge-cached 240s)
  try {
    const r = await fetch(`https://lemmy.world/api/v3/search?type_=Posts&sort=New&limit=10&q=${encodeURIComponent(q)}`, {
      cf: { cacheTtl: 240, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    })
    if (r.ok) {
      const j = await r.json()
      for (const item of j?.posts ?? []) {
        const p = item?.post
        if (p?.ap_id && p?.name && hasPlaceWord(`${p.name} ${p.body || ''}`, mustKey)) {
          out.push({ title: p.name, url: p.ap_id, kind: 'forum' })
        }
      }
    }
  } catch { /* ignore */ }

  return out.slice(0, 15)
}

function createSharedPolisenLoader() {
  let memo = null
  return () => {
    if (!memo) {
      memo = fetch('https://polisen.se/api/events', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalPush/1.0)' },
        cf: { cacheTtl: 180, cacheEverything: true },
        signal: AbortSignal.timeout(5500),
      })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    }
    return memo
  }
}

function placeSignature(p) {
  const cc = (p.cc || 'US').toUpperCase()
  const { mustKey, cleanOwn } = buildPlaceQueries(p)
  const wn = p.alertNews !== false ? '1' : '0'
  const wf = p.alertForum !== false ? '1' : '0'
  return `${cc}|${mustKey}|${normStr(cleanOwn)}|${wn}|${wf}`
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin') ?? ''
    const originOk = isAllowedOrigin(origin, env)
    const isHttpOrigin = /^https?:\/\/[a-z0-9.:-]+$/i.test(origin)
    const cors = {
      'Access-Control-Allow-Origin': isHttpOrigin ? origin : '*',
      Vary: 'Origin',
    }
    if (!originOk) return new Response('Forbidden origin', { status: 403, headers: { Vary: 'Origin' } })

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      })
    }

    // --- Web Push endpoints ---
    if (url.pathname === '/push/vapid' && req.method === 'GET') {
      const vapid = await getOrCreateVapid(env)
      if (!vapid) return new Response(JSON.stringify({ enabled: false }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ publicKey: vapid.publicKey }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // Native Android APK fallback favourite news & forum polling endpoint (deduplicated & edge-cached)
    if (url.pathname === '/push/poll' && req.method === 'POST') {
      try {
        const body = await req.json()
        const places = (Array.isArray(body?.places) ? body.places.slice(0, 25) : []).map(cleanPlace).filter(Boolean)
        const sharedPolisen = createSharedPolisenLoader()
        const memo = new Map()
        const results = []
        for (const p of places) {
          const sig = placeSignature(p)
          if (!memo.has(sig)) {
            const { newsQueries, forumQueries, mustKey, cleanOwn } = buildPlaceQueries(p)
            const wantNews = p.alertNews !== false
            const wantForum = p.alertForum !== false
            memo.set(
              sig,
              Promise.all([
                wantNews ? checkNewsForPlace(p, newsQueries, mustKey, sharedPolisen) : Promise.resolve([]),
                wantForum ? checkForumsForPlace(p, forumQueries, mustKey, cleanOwn) : Promise.resolve([]),
              ]).then(([n, f]) => [...n, ...f]),
            )
          }
          // Places sharing one check may still differ in the topics they want
          const combined = wantedByTopic(p, await memo.get(sig))
          if (!combined.length) continue
          results.push({
            label: String(p.label),
            hash: String(p.hash || ''),
            cat: p.cat ? String(p.cat) : '',
            items: combined.slice(0, 15).map((it) => ({
              title: String(it.title),
              url: String(it.url),
              kind: it.kind === 'forum' ? 'forum' : 'news',
            })),
          })
        }
        return new Response(JSON.stringify({ places: results }), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      } catch {
        return new Response(JSON.stringify({ places: [] }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }
    }

    if (url.pathname === '/push/test' && req.method === 'POST') {
      const vapid = await getOrCreateVapid(env)
      if (!vapid) return new Response('Push not available', { status: 503, headers: cors })
      try {
        const body = await req.json()
        const sub = body?.subscription
        if (!isPushServiceUrl(sub?.endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth) {
          return new Response('Invalid subscription', { status: 400, headers: cors })
        }
        const pushRes = await deliverPush(
          sub,
          {
            title: String(body.title || 'NewzLocal').slice(0, 120),
            body: String(body.body || 'Push notifications are active!').slice(0, 300),
            tag: 'newzlocal-test',
            url: './',
          },
          vapid,
          env.VAPID_SUBJECT,
        )
        return new Response(JSON.stringify({ ok: pushRes.ok, status: pushRes.status }), {
          status: pushRes.ok ? 200 : 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        })
      } catch {
        return new Response('Push error', { status: 500, headers: cors })
      }
    }

    if (url.pathname === '/push/subscribe' && hasSubStore(env)) {
      if (req.method === 'POST') {
        try {
          const body = await req.json()
          const ep = body?.subscription?.endpoint
          const keys = body?.subscription?.keys
          if (!isPushServiceUrl(ep) || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
            return new Response('Invalid subscription', { status: 400, headers: cors })
          }
          const k = await subKey(ep)
          const existing = (await getSubRecord(env, k)) ?? {}
          const places = (Array.isArray(body.places) ? body.places.slice(0, 30) : []).map(cleanPlace).filter(Boolean)
          const labels = new Set(places.map((p) => p.label))
          const tz = cleanTimeZone(body.tz)
          await putSubRecord(env, k, {
            subscription: { endpoint: ep, keys: { p256dh: keys.p256dh, auth: keys.auth } },
            lang: String(body.lang || 'en').slice(0, 5),
            quiet: cleanQuiet(body.quiet),
            ...(tz ? { tz } : {}),
            places,
            // forget what was seen for places that are no longer watched, so the record cannot grow without bound
            seen: Object.fromEntries(Object.entries(existing.seen ?? {}).filter(([label]) => labels.has(label))),
            updatedAt: Date.now(),
          })
          return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
        } catch {
          return new Response('Bad JSON', { status: 400, headers: cors })
        }
      }
      if (req.method === 'DELETE') {
        try {
          const body = await req.json()
          if (body?.endpoint) await deleteSubRecord(env, await subKey(body.endpoint))
          return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
        } catch {
          return new Response('Bad JSON', { status: 400, headers: cors })
        }
      }
    }

    // --- Keyed news APIs ---
    const kp = Object.keys(KEYED).find((p) => url.pathname.startsWith(p + '/'))
    if (kp && req.method === 'GET') {
      if (!origin || !isTrustedOrigin(origin, env)) return new Response('Forbidden', { status: 403, headers: cors })
      const [base, secret, param] = KEYED[kp]
      if (!env[secret]) return new Response('API key not configured', { status: 503, headers: cors })
      const target = new URL(base + url.pathname.slice(kp.length))
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v))
      target.searchParams.set(param, env[secret])
      try {
        const r = await fetch(target, { cf: { cacheTtl: 600, cacheEverything: true }, signal: AbortSignal.timeout(10_000) })
        return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600' } })
      } catch {
        return new Response('Upstream timeout', { status: 502, headers: cors })
      }
    }

    // --- Reader card metadata (/meta?url=...) with strict SSRF protection ---
    if (url.pathname === '/meta' && req.method === 'GET') {
      const targetStr = url.searchParams.get('url') ?? ''
      let parsed
      try {
        parsed = new URL(targetStr)
      } catch {
        return new Response('Invalid URL', { status: 400, headers: cors })
      }
      const host = parsed.hostname.toLowerCase()
      const blockedHost =
        parsed.protocol !== 'https:' ||
        host === 'localhost' ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
        host.includes(':')
      if (blockedHost) return new Response('Forbidden host', { status: 403, headers: cors })
      try {
        const r = await fetch(parsed, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalReader/1.0)' },
          cf: { cacheTtl: 1800, cacheEverything: true },
          signal: AbortSignal.timeout(5000),
        })
        if (!r.ok) return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } })
        const html = (await r.text()).slice(0, 65_000)
        const pickMeta = (re) => {
          const m = html.match(re)
          return m ? m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim() : ''
        }
        const description =
          pickMeta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
          pickMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
          pickMeta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        const image =
          pickMeta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          pickMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        return new Response(JSON.stringify({ description, image }), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800' },
        })
      } catch {
        return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    // --- Official Government & Local Police JSON/RSS Feed Proxy (strict hostname allowlist) ---
    if (url.pathname === '/police-feed' && req.method === 'GET') {
      const targetStr = url.searchParams.get('url') ?? ''
      let parsed
      try {
        parsed = new URL(targetStr)
      } catch {
        return new Response('Invalid URL', { status: 400, headers: cors })
      }
      const host = parsed.hostname.toLowerCase()
      const allowedPoliceHost =
        parsed.protocol === 'https:' &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port &&
        [
          /(^|\.)polisen\.se$/i,
          /(^|\.)politiet\.no$/i,
          /^via\.ritzau\.dk$/i,
          /(^|\.)politi\.dk$/i,
          /(^|\.)poliisi\.fi$/i,
          /(^|\.)politie\.nl$/i,
          /(^|\.)police\.go\.th$/i,
          /(^|\.)royalthaipolice\.go\.th$/i,
          /(^|\.)touristpolice\.go\.th$/i,
          /(^|\.)cib\.go\.th$/i,
          /(^|\.)police\.uk$/i,
          /(^|\.)police\.govt\.nz$/i,
          /(^|\.)mypolice\.qld\.gov\.au$/i,
          /(^|\.)police\.(nsw|vic|wa|sa|tas)\.gov\.au$/i,
          /(^|\.)afp\.gov\.au$/i,
          /(^|\.)rcmp-grc\.gc\.ca$/i,
          /(^|\.)europol\.europa\.eu$/i,
          /(^|\.)interpol\.int$/i,
        ].some((re) => re.test(host))

      if (!allowedPoliceHost) {
        return new Response('Forbidden police host', { status: 403, headers: cors })
      }
      try {
        const r = await fetch(parsed, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalPoliceReader/1.0; +https://nrnworld.one/NewzLocal/)',
            Accept: 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          },
          cf: { cacheTtl: 120, cacheEverything: true },
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) {
          return new Response('Upstream police feed error', { status: 502, headers: { ...cors, 'Cache-Control': 'no-store' } })
        }
        return new Response(r.body, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': r.headers.get('Content-Type') ?? 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=120',
          },
        })
      } catch {
        return new Response('Upstream police feed timeout', { status: 502, headers: { ...cors, 'Cache-Control': 'no-store' } })
      }
    }

    // --- Regional Forums: Menéame (ES) & Ekşi Sözlük (TR) ---
    if (url.pathname === '/meneame' && req.method === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      try {
        const r = await fetch(`https://www.meneame.net/rss?q=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          cf: { cacheTtl: 180, cacheEverything: true },
          signal: AbortSignal.timeout(6000),
        })
        return new Response(r.body, {
          status: r.status,
          headers: { ...cors, 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=180' },
        })
      } catch {
        return new Response('Upstream error', { status: 502, headers: cors })
      }
    }

    if (url.pathname === '/eksi' && req.method === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      try {
        const r = await fetch(
          `https://www.bing.com/search?q=${encodeURIComponent(`site:eksisozluk.com "${q}"`)}&format=rss`,
          {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            cf: { cacheTtl: 300, cacheEverything: true },
            signal: AbortSignal.timeout(6000),
          },
        )
        const xml = await r.text()
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 20).map((m) => {
          const block = m[1]
          const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s*-\s*ekşi sözlük.*$/i, '').trim()
          const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim()
          const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? '').trim()
          return { title, url: link, date: pubDate || undefined }
        }).filter((x) => x.title && x.url.includes('eksisozluk.com'))
        return new Response(JSON.stringify({ items }), {
          headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        })
      } catch {
        return new Response(JSON.stringify({ items: [] }), { headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    // --- Public RSS / Forum CORS proxy (edge-cached 180s across visitors) ---
    const prefix = Object.keys(ORIGINS).find((p) => url.pathname.startsWith(p + '/'))
    if (req.method !== 'GET' || !prefix) return new Response('Not found', { status: 404, headers: cors })
    try {
      const isRss = prefix === '/gn' || prefix === '/bn'
      const edgeCache = typeof caches !== 'undefined' ? caches.default : null
      const cacheKey = edgeCache ? new Request(`${url.origin}${url.pathname}${url.search}`, { method: 'GET' }) : null
      if (edgeCache && cacheKey) {
        const hit = await edgeCache.match(cacheKey)
        if (hit) {
          return new Response(hit.body, {
            status: 200,
            headers: {
              ...cors,
              'Content-Type': hit.headers.get('Content-Type') ?? (isRss ? 'application/xml; charset=utf-8' : 'text/plain'),
              'Cache-Control': 'public, max-age=180',
            },
          })
        }
      }

      const upstreamHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: isRss ? 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' : '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(prefix === '/gn'
          ? { Cookie: 'SOCS=CAESHAgBEhJnd3NfMjAyNDAxMDEtMF9SQzIaAmVuIAEaBgiAo_CmBg; CONSENT=YES+cb.20240101-01-p0.en+FX+999' }
          : {}),
      }
      const r = await fetch(ORIGINS[prefix] + url.pathname.slice(prefix.length) + url.search, {
        headers: upstreamHeaders,
        cf: { cacheTtl: 180, cacheEverything: true },
        signal: AbortSignal.timeout(10_000),
      })
      if (isRss) {
        const txt = await r.text()
        if (!r.ok || !/<rss\b|<channel\b|<feed\b/i.test(txt)) {
          return new Response('Upstream non-RSS response', { status: 502, headers: { ...cors, 'Cache-Control': 'no-store' } })
        }
        if (edgeCache && cacheKey) {
          await edgeCache
            .put(
              cacheKey,
              new Response(txt, {
                status: 200,
                headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=180' },
              }),
            )
            .catch(() => {})
        }
        return new Response(txt, {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=180' },
        })
      }
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') ?? 'text/plain', 'Cache-Control': 'public, max-age=180' },
      })
    } catch {
      return new Response('Upstream error', { status: 502, headers: cors })
    }
  },

  // Every 5 minutes: deduplicates watched places across all subscribers, shards automatically within Cloudflare's
  // free subrequest budget, and writes to D1/KV ONLY when genuinely new stories appear.
  async scheduled(_event, env) {
    const vapid = await getOrCreateVapid(env)
    if (!hasSubStore(env) || !vapid) return
    const subs = await listSubRecords(env)
    if (!subs.length) return

    // 1. Collect all unique active places across all subscribers so popular cities are checked ONCE, not N times
    const uniqueMap = new Map()
    for (const { rec } of subs) {
      if (!rec?.subscription?.endpoint || !Array.isArray(rec.places)) continue
      for (const p of rec.places) {
        if (!p?.label || !Array.isArray(p?.parts) || !p.parts.length) continue
        if (p.cat && inQuietHours(rec.quiet?.[p.cat], rec.tz)) continue
        const sig = placeSignature(p)
        if (!uniqueMap.has(sig)) uniqueMap.set(sig, p)
      }
    }

    const allSigs = [...uniqueMap.keys()]
    if (!allSigs.length) return

    // 2. Automatic sharding: max 14 unique places per 5-minute tick keeps subrequests comfortably under Free Tier's 50-subrequest limit
    const MAX_PLACES_PER_TICK = 14
    const numShards = Math.max(1, Math.ceil(allSigs.length / MAX_PLACES_PER_TICK))
    const activeShard = Math.floor(Date.now() / 300_000) % numShards
    const tickSigs = new Set(allSigs.filter((_, idx) => idx % numShards === activeShard))

    const sharedPolisen = createSharedPolisenLoader()
    const placeResults = new Map()
    for (const sig of tickSigs) {
      const p = uniqueMap.get(sig)
      const { newsQueries, forumQueries, mustKey, cleanOwn } = buildPlaceQueries(p)
      const wantNews = p.alertNews !== false
      const wantForum = p.alertForum !== false
      const [newsHits, forumHits] = await Promise.all([
        wantNews ? checkNewsForPlace(p, newsQueries, mustKey, sharedPolisen) : Promise.resolve([]),
        wantForum ? checkForumsForPlace(p, forumQueries, mustKey, cleanOwn) : Promise.resolve([]),
      ])
      placeResults.set(sig, [...newsHits, ...forumHits])
    }

    // 3. Fan out results to subscribers; write back ONLY when first-seeding or when fresh items actually arrived
    for (const { key, rec } of subs) {
      if (!rec?.subscription?.endpoint || !Array.isArray(rec.places) || !rec.places.length) continue
      let dirty = false
      let deadSub = false

      for (const p of rec.places) {
        if (!p?.label || (p.cat && inQuietHours(rec.quiet?.[p.cat], rec.tz))) continue
        const sig = placeSignature(p)
        if (!placeResults.has(sig)) continue
        const combined = placeResults.get(sig) ?? []
        if (!combined.length) continue

        const prev = rec.seen?.[p.label]
        const isFirstSeed = !Array.isArray(prev)
        const isNew = (s) => !prev.includes(s.url) && !(s.raw && prev.includes(s.raw))
        // Everything found is remembered as seen; only stories in the favourite's chosen topics raise an alert
        const fresh = isFirstSeed ? [] : wantedByTopic(p, combined.filter(isNew))
        const anyNew = isFirstSeed || combined.some(isNew)

        if (anyNew) {
          rec.seen = {
            ...rec.seen,
            [p.label]: [...new Set([...combined.map((s) => s.url), ...(isFirstSeed ? [] : prev)])].slice(0, 250),
          }
          dirty = true
        }
        if (!fresh.length) continue

        const first = fresh[0]
        const isForum = first.kind === 'forum'
        const deepUrl = p.hash ? `./#p=${p.hash}${isForum ? '&tab=forum' : ''}` : './'
        const titlePrefix = isForum ? `💬 ${p.label}` : `📰 ${p.label}`
        try {
          const pushRes = await deliverPush(
            rec.subscription,
            {
              title: titlePrefix,
              body: fresh.length > 1 ? `${first.title} (+${fresh.length - 1})` : first.title,
              tag: `${p.label}-${first.kind}`,
              url: deepUrl,
            },
            vapid,
            env.VAPID_SUBJECT,
          )
          if (pushRes.status === 404 || pushRes.status === 410) {
            await deleteSubRecord(env, key)
            dirty = false
            deadSub = true
            break
          }
        } catch { /* transient push error */ }
      }

      if (dirty && !deadSub) {
        await putSubRecord(env, key, rec)
      }
    }
  },
}

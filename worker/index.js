// Cloudflare Worker: hardened CORS proxy (/gn, /bn, /rd, /fb, /meneame, /eksi, /meta, /gnews, /nd) + RFC 8291 / VAPID Web Push background alerts.
const ORIGINS = {
  '/gn': 'https://news.google.com',
  '/bn': 'https://www.bing.com',
  '/rd': 'https://www.reddit.com',
  '/fb': 'https://www.flashback.org',
}
// Keyed APIs: secrets stay inside the Worker; only allowed origins may spend quota.
const KEYED = {
  '/gnews': ['https://gnews.io/api/v4', 'GNEWS_KEY', 'apikey'],
  '/nd': ['https://newsdata.io/api/1', 'NEWSDATA_KEY', 'apikey'],
}
const DEFAULT_ALLOWED = ['https://nrnworld.one', 'https://nrn-world.github.io', 'http://localhost:5173', 'http://localhost:4173']

function getAllowed(env) {
  const extra = (env?.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return [...DEFAULT_ALLOWED, ...extra]
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
  const paddedPlain = concat(enc.encode(payloadText), new Uint8Array([2])) // 0x02 final-record delimiter
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlain))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)
  const header = concat(salt, rs, new Uint8Array([asPubBytes.byteLength]), asPubBytes)
  return concat(header, ciphertext)
}

/** Signs a VAPID JWT (`ES256`) for the push service origin. `privateJwk` is a JSON JWK string stored as a Worker secret. */
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

async function subKey(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(endpoint))
  return `sub:${b64u(digest)}`
}

function inQuietHours(q, now = new Date()) {
  if (!q?.on) return false
  const m = now.getUTCHours() * 60 + now.getUTCMinutes()
  const [fh, fm] = String(q.from || '22:00').split(':').map(Number)
  const [th, tm] = String(q.to || '07:00').split(':').map(Number)
  const f = fh * 60 + fm, e = th * 60 + tm
  return f <= e ? m >= f && m < e : m >= f || m < e
}

async function fetchLatestBingRss(place) {
  const own = place.parts?.[0]?.name
  if (!own) return []
  const cc = (place.cc || 'US').toUpperCase()
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(`"${own}"`)}&format=rss&cc=${cc}&sortbydate=1`
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewzLocalPush/1.0)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) return []
  const xml = await r.text()
  const items = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]
    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)
    const link = block.match(/<link>([\s\S]*?)<\/link>/)
    const t = (title?.[1] ?? title?.[2] ?? '').trim()
    const l = (link?.[1] ?? '').trim()
    if (t && l) items.push({ title: t, url: l })
  }
  return items.slice(0, 10)
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const allowed = getAllowed(env)
    const origin = req.headers.get('Origin') ?? ''
    const originOk = !origin || allowed.includes(origin)
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      Vary: 'Origin',
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      })
    }

    if (!originOk) return new Response('Forbidden origin', { status: 403, headers: cors })

    // --- Web Push endpoints ---
    if (url.pathname === '/push/vapid' && req.method === 'GET') {
      if (!env.VAPID_PUBLIC_KEY || !env.SUBS_KV) return new Response(JSON.stringify({ enabled: false }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    if (url.pathname === '/push/subscribe' && env.SUBS_KV) {
      if (req.method === 'POST') {
        try {
          const body = await req.json()
          const ep = body?.subscription?.endpoint
          const keys = body?.subscription?.keys
          if (!ep || !keys?.p256dh || !keys?.auth) return new Response('Invalid subscription', { status: 400, headers: cors })
          const k = await subKey(ep)
          const existing = (await env.SUBS_KV.get(k, 'json')) ?? {}
          await env.SUBS_KV.put(
            k,
            JSON.stringify({
              subscription: { endpoint: ep, keys: { p256dh: keys.p256dh, auth: keys.auth } },
              lang: String(body.lang || 'en').slice(0, 5),
              quiet: body.quiet ?? {},
              places: Array.isArray(body.places) ? body.places.slice(0, 10) : [],
              seen: existing.seen ?? {},
              updatedAt: Date.now(),
            }),
            { expirationTtl: 60 * 86400 },
          )
          return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
        } catch {
          return new Response('Bad JSON', { status: 400, headers: cors })
        }
      }
      if (req.method === 'DELETE') {
        try {
          const body = await req.json()
          if (body?.endpoint) await env.SUBS_KV.delete(await subKey(body.endpoint))
          return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
        } catch {
          return new Response('Bad JSON', { status: 400, headers: cors })
        }
      }
    }

    // --- Keyed news APIs ---
    const kp = Object.keys(KEYED).find((p) => url.pathname.startsWith(p + '/'))
    if (kp && req.method === 'GET') {
      if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors })
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

    // --- Public RSS / Forum CORS proxy ---
    const prefix = Object.keys(ORIGINS).find((p) => url.pathname.startsWith(p + '/'))
    if (req.method !== 'GET' || !prefix) return new Response('Not found', { status: 404, headers: cors })
    try {
      const r = await fetch(ORIGINS[prefix] + url.pathname.slice(prefix.length) + url.search, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cf: { cacheTtl: 60, cacheEverything: true },
        signal: AbortSignal.timeout(12_000),
      })
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') ?? 'text/plain', 'Cache-Control': 'public, max-age=60' },
      })
    } catch {
      return new Response('Upstream error', { status: 502, headers: cors })
    }
  },

  // Cron trigger: checks subscribed favourites and dispatches encrypted Web Push alerts even when tabs are closed.
  async scheduled(_event, env) {
    if (!env.SUBS_KV || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return
    const list = await env.SUBS_KV.list({ prefix: 'sub:', limit: 200 })
    for (const item of list.keys) {
      const rec = await env.SUBS_KV.get(item.name, 'json')
      if (!rec?.subscription?.endpoint || !rec.places?.length) continue
      let dirty = false
      for (const p of rec.places) {
        if (p.cat && inQuietHours(rec.quiet?.[p.cat])) continue
        const stories = await fetchLatestBingRss(p).catch(() => [])
        if (!stories.length) continue
        const prev = rec.seen?.[p.label]
        const fresh = prev ? stories.filter((s) => !prev.includes(s.url)) : []
        rec.seen = { ...rec.seen, [p.label]: [...new Set([...stories.map((s) => s.url), ...(prev ?? [])])].slice(0, 150) }
        dirty = true
        if (!fresh.length) continue
        try {
          const payload = JSON.stringify({
            title: p.label,
            body: fresh.length > 1 ? `${fresh[0].title} (+${fresh.length - 1})` : fresh[0].title,
            tag: p.label,
            url: './',
          })
          const encrypted = await encryptWebPush(payload, rec.subscription.keys.p256dh, rec.subscription.keys.auth)
          const jwt = await signVapidJwt(rec.subscription.endpoint, env.VAPID_PRIVATE_JWK, env.VAPID_SUBJECT)
          const pushRes = await fetch(rec.subscription.endpoint, {
            method: 'POST',
            headers: {
              Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: '3600',
            },
            body: encrypted,
          })
          if (pushRes.status === 404 || pushRes.status === 410) {
            await env.SUBS_KV.delete(item.name)
            dirty = false
            break
          }
        } catch { /* transient push failure */ }
      }
      if (dirty) await env.SUBS_KV.put(item.name, JSON.stringify(rec), { expirationTtl: 60 * 86400 })
    }
  },
}

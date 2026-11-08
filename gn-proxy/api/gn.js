// Vercel function: hardened CORS proxy for Google News RSS (Google blocks Cloudflare's IPs, so this runs on Vercelarn1). Cached 60 s.
const DEFAULT_ALLOWED = ['https://nrnworld.one', 'https://nrn-world.github.io', 'http://localhost:5173', 'http://localhost:4173']
const SAFE_PARAMS = ['q', 'hl', 'gl', 'ceid']

function allowedOrigins() {
  const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return [...DEFAULT_ALLOWED, ...extra]
}

export default async function handler(req, res) {
  const allowed = allowedOrigins()
  const origin = req.headers.origin ?? ''
  const isAllowed = !origin || allowed.includes(origin)

  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0])
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).send('Method not allowed')
  if (!isAllowed) return res.status(403).send('Forbidden origin')

  const incoming = new URL(req.url, 'http://localhost')
  const target = new URL('https://news.google.com/rss/search')
  for (const key of SAFE_PARAMS) {
    const val = incoming.searchParams.get(key)
    if (val) target.searchParams.set(key, val.slice(0, 300))
  }
  if (!target.searchParams.get('q')) return res.status(400).send('Missing query parameter q')

  try {
    const r = await fetch(target.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(10_000),
    })
    const body = await r.text()
    res.setHeader('Cache-Control', r.ok ? 'public, s-maxage=60, stale-while-revalidate=120' : 'no-store')
    res.status(r.status).setHeader('Content-Type', 'application/xml; charset=utf-8').send(body)
  } catch {
    res.status(502).setHeader('Content-Type', 'application/xml; charset=utf-8').send('<rss version="2.0"><channel /></rss>')
  }
}

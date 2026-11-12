// Levels below the country datasets (neighbourhoods, streets) come straight from OpenStreetMap via Overpass,
// with automatic mirror failover and persistent IndexedDB caching so revisited areas open instantaneously.
import { type Area, at, bounds, inRing, labelPoint, polys } from './areas'

type Pos = [number, number]

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

let preferredMirror = 0
const memCache = new Map<string, { elements: unknown[] }>()
const DB_NAME = 'newnewz-geo'
const STORE = 'overpass'
const TTL_MS = 7 * 24 * 3600 * 1000 // 7 days

function openGeoDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbGet(key: string): Promise<{ elements: unknown[] } | null> {
  const db = await openGeoDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const val = req.result as { at: number; data: { elements: unknown[] } } | undefined
        resolve(val && Date.now() - val.at < TTL_MS ? val.data : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbSet(key: string, data: { elements: unknown[] }): Promise<void> {
  const db = await openGeoDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ at: Date.now(), data }, key)
  } catch { /* quota full or private mode */ }
}

/** Queries Overpass with memory + IndexedDB caching and automatic failover across public mirrors. */
async function run(ql: string, signal?: AbortSignal, perMirrorMs = 14_000): Promise<{ elements: unknown[] }> {
  const mem = memCache.get(ql)
  if (mem) return mem
  const disk = await idbGet(ql)
  if (disk) {
    memCache.set(ql, disk)
    return disk
  }

  let lastErr: unknown
  const maxAttempts = Math.min(2, ENDPOINTS.length)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const idx = (preferredMirror + attempt) % ENDPOINTS.length
    const ep = ENDPOINTS[idx]
    const timeoutSig = AbortSignal.timeout(perMirrorMs)
    const combined = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(ql)}`,
        signal: combined,
      })
      if (!r.ok) {
        lastErr = new Error('err.areas')
        continue
      }
      const j = (await r.json()) as { elements: unknown[] }
      preferredMirror = idx
      memCache.set(ql, j)
      void idbSet(ql, j)
      return j
    } catch (e) {
      if (signal?.aborted) throw e
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('err.areas')
}

const eq = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1]

/** Joins the ways of a boundary relation end to end into closed rings. */
export function rings(ways: Pos[][]): Pos[][] {
  const pool = ways.filter((w) => w.length > 1)
  const out: Pos[][] = []
  while (pool.length) {
    let ring = pool.pop()!
    for (let grew = true; grew && !eq(ring[0], ring[ring.length - 1]); ) {
      grew = false
      const end = ring[ring.length - 1]
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i]
        if (eq(w[0], end)) ring = ring.concat(w.slice(1))
        else if (eq(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse())
        else continue
        pool.splice(i, 1)
        grew = true
        break
      }
    }
    if (ring.length > 3 && eq(ring[0], ring[ring.length - 1])) out.push(ring)
  }
  return out
}

/** Monotone-chain convex hull (lon, lat), used to build tight Overpass `poly:` filters that never clip concave edges. */
function convexHull(pts: Pos[]): Pos[] {
  if (pts.length <= 3) return pts
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Pos, a: Pos, b: Pos) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pos[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pos[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function polyArea(ring: Pos[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return Math.abs(a) / 2
}

/** Builds an Overpass spatial filter: uses `poly:"..."` when the convex hull is significantly tighter than the bbox. */
function spatialFilter(area: Area): string {
  const [[w, s], [e, n]] = bounds(area.geometry)
  const bboxArea = (e - w) * (n - s)
  if (bboxArea > 0 && e - w < 20) {
    const allPts = polys(area.geometry).flatMap((p) => p[0])
    const hull = convexHull(allPts)
    if (hull.length >= 3 && hull.length <= 36 && polyArea(hull) < bboxArea * 0.72) {
      const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length
      const cy = hull.reduce((sum, p) => sum + p[1], 0) / hull.length
      // Slight 2% outward pad around centroid so boundary-straddling ways are never missed
      const polyStr = hull.map(([lon, lat]) => `${(cy + (lat - cy) * 1.02).toFixed(5)} ${(cx + (lon - cx) * 1.02).toFixed(5)}`).join(' ')
      return `(poly:"${polyStr}")`
    }
  }
  return `(${s},${w},${n},${e})`
}

type Rel = { tags?: Record<string, string>; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] }

/** Smaller administrative areas (neighbourhoods, villages) inside `parent`, or [] when OSM has none. */
export async function subAreas(parent: Area, signal?: AbortSignal): Promise<Area[]> {
  const sf = spatialFilter(parent)
  const j = await run(`[out:json][timeout:25];rel["boundary"="administrative"]["admin_level"~"^(7|8|9|10|11)$"]${sf};out geom;`, signal)
  const byLevel = new Map<number, Area[]>()
  for (const rel of j.elements as Rel[]) {
    const name = rel.tags?.name
    if (!name || name === parent.properties.name) continue
    const members = (rel.members ?? []).filter((m) => m.type === 'way' && m.geometry)
    const outers = rings(members.filter((m) => m.role !== 'inner').map((m) => m.geometry!.map((p) => [p.lon, p.lat] as Pos)))
    if (!outers.length) continue
    const inners = rings(members.filter((m) => m.role === 'inner').map((m) => m.geometry!.map((p) => [p.lon, p.lat] as Pos)))
    const coords = outers.map((outer) => [outer, ...inners.filter((hole) => inRing(hole[0], outer))])
    const a: Area = { type: 'Feature', properties: { name, parent: parent.properties.name }, geometry: { type: 'MultiPolygon', coordinates: coords } }
    if (!at([parent], labelPoint(a.geometry))) continue // neighbours outside this district
    const lv = Number(rel.tags!.admin_level)
    byLevel.set(lv, [...(byLevel.get(lv) ?? []), a])
  }
  // the coarsest level that actually splits the district into several pieces
  const level = [...byLevel.keys()].sort((a, b) => a - b).find((k) => byLevel.get(k)!.length >= 2)
  return level === undefined ? [] : byLevel.get(level)!
}

/** A circle as a polygon, so a named place without an OSM boundary can be drawn, clicked and searched like an area. */
export function circle(c: Pos, metres: number, n = 32): Area['geometry'] {
  const dLat = metres / 111320
  const dLon = dLat / Math.max(0.05, Math.cos((c[1] * Math.PI) / 180))
  const ring = Array.from({ length: n + 1 }, (_, i) => {
    const a = ((i % n) / n) * 2 * Math.PI
    return [c[0] + dLon * Math.cos(a), c[1] + dLat * Math.sin(a)] as Pos
  })
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * Named places (suburbs, neighbourhoods, villages) inside `parent`. Most countries have no boundary polygons for
 * these, so each is a small circle around its point; picking one lists the streets within 1.5 km of it.
 */
export async function places(parent: Area, signal?: AbortSignal): Promise<Area[]> {
  const sf = spatialFilter(parent)
  const j = await run(`[out:json][timeout:25];nwr["place"~"^(suburb|neighbourhood|quarter|borough|village|hamlet|town|locality)$"]["name"]${sf};out center;`, signal)
  const seen = new Map<string, Area>()
  for (const el of j.elements as { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: { name: string; place: string } }[]) {
    const c: Pos | undefined = el.lat !== undefined ? [el.lon!, el.lat] : el.center && [el.center.lon, el.center.lat]
    if (!c || seen.has(el.tags.name) || el.tags.name === parent.properties.name || !at([parent], c)) continue
    seen.set(el.tags.name, {
      type: 'Feature',
      properties: { name: el.tags.name, parent: parent.properties.name, center: c },
      geometry: circle(c, el.tags.place === 'hamlet' ? 400 : 600),
    })
  }
  return seen.size >= 2 ? [...seen.values()] : []
}

/**
 * Single-roundtrip neighbourhood loader: fetches both OSM administrative sub-boundaries AND named place nodes
 * in one Overpass call (~2-6 s instead of two sequential 25 s calls). Prefers polygon boundaries when >= 2 exist,
 * otherwise falls back immediately to circular place areas.
 */
export async function subPieces(parent: Area, signal?: AbortSignal): Promise<Area[]> {
  const sf = spatialFilter(parent)
  const j = await run(
    `[out:json][timeout:12];(rel["boundary"="administrative"]["admin_level"~"^(7|8|9|10|11)$"]${sf};node["place"~"^(suburb|neighbourhood|quarter|borough|village|hamlet|town|locality)$"]["name"]${sf};);out geom;`,
    signal,
    13_000,
  )
  const byLevel = new Map<number, Area[]>()
  const placeCircles = new Map<string, Area>()

  for (const el of j.elements as (Rel & { type?: string; lat?: number; lon?: number })[]) {
    const name = el.tags?.name
    if (!name || name === parent.properties.name) continue
    if (el.members) {
      const members = el.members.filter((m) => m.type === 'way' && m.geometry)
      const outers = rings(members.filter((m) => m.role !== 'inner').map((m) => m.geometry!.map((p) => [p.lon, p.lat] as Pos)))
      if (!outers.length) continue
      const inners = rings(members.filter((m) => m.role === 'inner').map((m) => m.geometry!.map((p) => [p.lon, p.lat] as Pos)))
      const coords = outers.map((outer) => [outer, ...inners.filter((hole) => inRing(hole[0], outer))])
      const a: Area = { type: 'Feature', properties: { name, parent: parent.properties.name }, geometry: { type: 'MultiPolygon', coordinates: coords } }
      if (!at([parent], labelPoint(a.geometry))) continue
      const lv = Number(el.tags!.admin_level)
      byLevel.set(lv, [...(byLevel.get(lv) ?? []), a])
    } else if (el.lat !== undefined && el.lon !== undefined && !placeCircles.has(name)) {
      const c: Pos = [el.lon, el.lat]
      if (!at([parent], c)) continue
      placeCircles.set(name, {
        type: 'Feature',
        properties: { name, parent: parent.properties.name, center: c },
        geometry: circle(c, el.tags?.place === 'hamlet' ? 400 : 600),
      })
    }
  }

  const level = [...byLevel.keys()].sort((a, b) => a - b).find((k) => byLevel.get(k)!.length >= 2)
  if (level !== undefined) return byLevel.get(level)!
  return placeCircles.size >= 2 ? [...placeCircles.values()] : []
}

export type Street = { name: string; lat: number; lon: number }

/** Named streets whose centre lies inside `area`, alphabetical, one entry per name. */
export async function streets(area: Area, signal?: AbortSignal): Promise<Street[]> {
  const sf = spatialFilter(area)
  const j = await run(
    `[out:json][timeout:30];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)$"]["name"]${sf};out tags center;`,
    signal,
  )
  const seen = new Map<string, Street>()
  for (const el of j.elements as { tags: { name: string }; center?: { lat: number; lon: number } }[]) {
    if (!el.center || seen.has(el.tags.name) || !at([area], [el.center.lon, el.center.lat])) continue
    seen.set(el.tags.name, { name: el.tags.name, lat: el.center.lat, lon: el.center.lon })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

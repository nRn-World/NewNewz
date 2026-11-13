// Administrative pieces of a country (provinces → districts) from geoBoundaries (OpenStreetMap-based, open data).
type Pos = [number, number]
export type Area = {
  type: 'Feature'
  properties: { name: string; parent?: string; sel?: number; center?: Pos }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Pos[][] | Pos[][][] }
}
export type Areas = { type: 'FeatureCollection'; features: Area[] }

const ISO3 = Object.fromEntries(
  `ADAND AEARE AFAFG AGATG AIAIA ALALB AMARM AOAGO ARARG ASASM ATAUT AUAUS AWABW AXALA AZAZE BABIH BBBRB BDBGD BEBEL BFBFA BGBGR BHBHR BIBDI BJBEN BMBMU BNBRN BOBOL BRBRA BSBHS BTBTN BWBWA BYBLR BZBLZ CACAN CDCOD CFCAF CGCOG CHCHE CICIV CKCOK CLCHL CMCMR CNCHN COCOL CRCRI CUCUB CVCPV CWCUW CYCYP CZCZE DEDEU DJDJI DKDNK DMDMA DODOM DZDZA ECECU EEEST EGEGY EHESH ERERI ESESP ETETH FIFIN FJFJI FKFLK FMFSM FOFRO FRFRA GAGAB GBGBR GDGRD GEGEO GFGUF GGGGY GHGHA GIGIB GLGRL GMGMB GNGIN GPGLP GQGNQ GRGRC GTGTM GUGUM GWGNB GYGUY HKHKG HNHND HRHRV HTHTI HUHUN IDIDN IEIRL ILISR IMIMN ININD IQIRQ IRIRN ISISL ITITA JEJEY JMJAM JOJOR JPJPN KEKEN KGKGZ KHKHM KIKIR KMCOM KNKNA KPPRK KRKOR KWKWT KYCYM KZKAZ LALAO LBLBN LCLCA LILIE LKLKA LRLBR LSLSO LTLTU LULUX LVLVA LYLBY MAMAR MCMCO MDMDA MEMNE MFMAF MGMDG MHMHL MKMKD MLMLI MMMMR MNMNG MOMAC MPMNP MQMTQ MRMRT MSMSR MTMLT MUMUS MVMDV MWMWI MXMEX MYMYS MZMOZ NANAM NCNCL NENER NFNFK NGNGA NINIC NLNLD NONOR NPNPL NRNRU NUNIU NZNZL OMOMN PAPAN PEPER PFPYF PGPNG PHPHL PKPAK PLPOL PMSPM PRPRI PSPSE PTPRT PWPLW PYPRY QAQAT REREU ROROU RSSRB RURUS RWRWA SASAU SBSLB SCSYC SDSDN SESWE SGSGP SHSHN SISVN SKSVK SLSLE SMSMR SNSEN SOSOM SRSUR SSSSD STSTP SVSLV SXSXM SYSYR SZSWZ TCTCA TDTCD TGTGO THTHA TJTJK TLTLS TMTKM TNTUN TOTON TRTUR TTTTO TVTUV TWTWN TZTZA UAUKR UGUGA USUSA UYURY UZUZB VAVAT VCVCT VEVEN VGVGB VIVIR VNVNM VUVUT WFWLF WSWSM XKXKX YEYEM YTMYT ZAZAF ZMZMB ZWZWE`
    .split(' ').map((s) => [s.slice(0, 2), s.slice(2)]),
)

const cache = new Map<string, Promise<Areas | null>>()

/** adm 1 = provinces/states, 2 = districts. Resolves null when the country has no such level. */
export function boundaries(cc: string, adm: 1 | 2): Promise<Areas | null> {
  const iso = ISO3[cc.toUpperCase()]
  if (!iso) return Promise.resolve(null)
  const key = `${iso}${adm}`
  if (!cache.has(key)) {
    const p = (async () => {
      // Without a timeout a stalled geoBoundaries request leaves the "loading map areas" bar up for good.
      const meta = await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${iso}/ADM${adm}/`, { signal: AbortSignal.timeout(12_000) })
      if (!meta.ok) return null
      const fc = (await (await fetch(
        // github.com/raw redirects without CORS headers; the LFS media host serves the same file with them
        (await meta.json()).simplifiedGeometryGeoJSON.replace('https://github.com/wmgeolab/geoBoundaries/raw/', 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/'),
        { signal: AbortSignal.timeout(30_000) },
      )).json()) as {
        features: { properties: { shapeName: string }; geometry: Area['geometry'] }[]
      }
      return {
        type: 'FeatureCollection',
        features: fc.features.map((f) => ({ type: 'Feature', properties: { name: f.properties.shapeName }, geometry: f.geometry })),
      } as Areas
    })()
    cache.set(key, p)
    p.catch(() => cache.delete(key)) // allow retry after a network failure
  }
  return cache.get(key)!
}

const ADMIN_RE = /(?<![\p{L}\p{N}])(?:province|il|ili|county|municipality|governorate|region|state|district|city|kommun|lan|محافظه|منطقه|ولايه|of)(?![\p{L}\p{N}])/gu

/**
 * Unicode-aware normalisation: folds Latin accents & special letters (ı, ø, æ, ß, ł),
 * unifies Arabic letter forms, strips administrative boilerplate words, and keeps all scripts
 * (Arabic, Cyrillic, Greek, CJK, Latin) intact for accurate matching and hot-word analysis.
 */
const normRaw = (s: string) =>
  s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ł/g, 'l')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .normalize('NFC')
    .replace(ADMIN_RE, ' ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()

// norm() runs ~15 Unicode regexes and is called thousands of times on the same strings (place aliases, headlines), so memoise it.
const normCache = new Map<string, string>()
export const norm = (s: string): string => {
  let v = normCache.get(s)
  if (v === undefined) {
    v = normRaw(s)
    if (normCache.size > 20000) normCache.clear() // shortcut: crude cap, fine for a session of headlines
    normCache.set(s, v)
  }
  return v
}

export const polys = (g: Area['geometry']) => (g.type === 'Polygon' ? [g.coordinates as Pos[][]] : (g.coordinates as Pos[][][]))

export function inRing(p: Pos, ring: Pos[]) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Point-in-polygon check respecting inner-ring holes (enclaves, lakes). */
export const inside = (p: Pos, g: Area['geometry']) =>
  polys(g).some((poly) => poly[0]?.length > 2 && inRing(p, poly[0]) && !poly.slice(1).some((hole) => hole.length > 2 && inRing(p, hole)))

function ringBox(ring: Pos[]): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90
  for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [w, s, e, n]
}

/** Bounding box of `g`. Handles antimeridian-crossing MultiPolygons (e.g. Russia, USA, Fiji) by framing the main landmass. */
export function bounds(g: Area['geometry']): [[number, number], [number, number]] {
  const ps = polys(g)
  let w = 180, s = 90, e = -180, n = -90
  for (const poly of ps) {
    const [pw, ps0, pe, pn] = ringBox(poly[0])
    w = Math.min(w, pw); e = Math.max(e, pe); s = Math.min(s, ps0); n = Math.max(n, pn)
  }
  if (e - w > 220 && ps.length > 1) {
    // Antimeridian split: pick the hemisphere containing the largest polygon area so fitBounds doesn't zoom out globally
    let bestRing = ps[0][0], bestArea = -1
    for (const poly of ps) {
      const [pw, ps0, pe, pn] = ringBox(poly[0])
      if (pe - pw > 220) continue
      const area = (pe - pw) * (pn - ps0)
      if (area > bestArea) { bestArea = area; bestRing = poly[0] }
    }
    const [bw] = ringBox(bestRing)
    const eastHemi = bw >= 0
    let hw = 180, hs = 90, he = -180, hn = -90
    for (const poly of ps) {
      const [pw, ps0, pe, pn] = ringBox(poly[0])
      if (pe - pw > 220 || (eastHemi ? pe < -30 : pw > 30)) continue
      hw = Math.min(hw, pw); he = Math.max(he, pe); hs = Math.min(hs, ps0); hn = Math.max(hn, pn)
    }
    if (hw <= he) return [[hw, hs], [he, hn]]
  }
  return [[w, s], [e, n]]
}

/** Fast single-province filter: returns only ADM2 districts belonging to `parent` without linking every province in the country. */
export function kidsOf(parent: Area, adm2: Areas): Area[] {
  const [[pw, ps], [pe, pn]] = bounds(parent.geometry)
  const out: Area[] = []
  for (const d of adm2.features) {
    if (d.properties.parent) {
      if (d.properties.parent === parent.properties.name) out.push(d)
      continue
    }
    const [[dw, ds], [de, dn]] = bounds(d.geometry)
    if (de < pw || dw > pe || dn < ps || ds > pn) continue
    const ring = polys(d.geometry).reduce((a, b) => (b[0].length > a[0].length ? b : a))[0]
    const step = Math.max(1, Math.floor(ring.length / 9))
    let inCount = 0, total = 0
    for (let i = 0; i < ring.length; i += step) {
      total++
      if (inside(ring[i], parent.geometry)) inCount++
    }
    if (inCount > total / 2) {
      d.properties.parent = parent.properties.name
      out.push(d)
    }
  }
  return out
}

/** Sets properties.parent on each district by majority vote of sample points on its outline. */
export function link(adm1: Areas, adm2: Areas) {
  const boxes = adm1.features.map((f) => bounds(f.geometry))
  for (const d of adm2.features) {
    if (d.properties.parent) continue
    const ring = polys(d.geometry).reduce((a, b) => (b[0].length > a[0].length ? b : a))[0]
    const step = Math.max(1, Math.floor(ring.length / 15))
    const votes = new Map<string, number>()
    for (let i = 0; i < ring.length; i += step) {
      const pt = ring[i]
      adm1.features.forEach((p, k) => {
        const [[w, s], [e, n]] = boxes[k]
        if (pt[0] >= w && pt[0] <= e && pt[1] >= s && pt[1] <= n && inside(pt, p.geometry))
          votes.set(p.properties.name, (votes.get(p.properties.name) ?? 0) + 1)
      })
    }
    d.properties.parent = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
}

/** One label position per area (centroid of its largest polygon), guaranteed to lie inside the polygon even with holes. */
export function labelPoint(g: Area['geometry']): Pos {
  let best: Pos[] = polys(g)[0][0], bestA = -1, cx = 0, cy = 0
  for (const poly of polys(g)) {
    const r = poly[0]
    let a = 0, x = 0, y = 0
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]
      a += f; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = r; cx = x / (3 * a || 1); cy = y / (3 * a || 1) }
  }
  if (bestA > 0 && inside([cx, cy], g)) return [cx, cy]
  // Fallback for concave shapes or polygons with central holes: probe interior points between centroid and outer ring
  const step = Math.max(1, Math.floor(best.length / 16))
  for (let i = 0; i < best.length; i += step) {
    const [vx, vy] = best[i]
    for (const t of [0.5, 0.25, 0.75, 0.15, 0.85]) {
      const cand: Pos = [vx + (cx - vx) * t, vy + (cy - vy) * t]
      if (inside(cand, g)) return cand
    }
  }
  return best[0]
}

/** The area containing a point, so a street or address can be matched to its province and district without comparing names. */
export const at = (feats: Area[], p: Pos) => feats.find((f) => inside(p, f.geometry))

// Rebuilds src/geo/kurdistan-outline.json and src/geo/kurdistan-provinces.json from geoBoundaries (open data,
// the same source the app uses for every other country). Edit the province lists below to move the border.
//
//   npm i --no-save @turf/turf && node scripts/build-kurdistan-geo.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as turf from '@turf/turf'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'geo')
const RAW = 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen'

/** [ISO3, ADM level, ISO2, province names as geoBoundaries spells them, display-name overrides] */
const SOURCES = [
  ['TUR', 1, 'TR', ['Diyarbakır', 'Batman', 'Mardin', 'Siirt', 'Şırnak', 'Hakkâri', 'Van', 'Bitlis', 'Muş', 'Bingöl', 'Tunceli', 'Ağrı', 'Şanlıurfa', 'Adıyaman', 'Iğdır', 'Elazığ', 'Kars'], { 'Hakkâri': 'Hakkari' }],
  ['IRQ', 1, 'IQ', ['Erbil', 'Dohuk', 'Al-Sulaimaniyah', 'Kirkuk'], { Dohuk: 'Duhok', 'Al-Sulaimaniyah': 'Sulaymaniyah' }],
  // Iran's province is literally called "Kurdistan"; it is shown as "Kordestan" so it never collides with the country.
  ['IRN', 1, 'IR', ['Kurdistan', 'Kermanshah', 'Ilam', 'West Azerbaijan'], { Kurdistan: 'Kordestan' }],
  ['SYR', 1, 'SY', ['Al-Hasakeh'], { 'Al-Hasakeh': 'Al-Hasakah' }],
  ['SYR', 2, 'SY', ['Ain Al Arab', 'Afrin'], { 'Ain Al Arab': 'Kobani' }],
]

async function load(iso3, adm) {
  const r = await fetch(`${RAW}/${iso3}/ADM${adm}/geoBoundaries-${iso3}-ADM${adm}_simplified.geojson`)
  if (!r.ok) throw new Error(`geoBoundaries ${iso3} ADM${adm}: HTTP ${r.status}`)
  return (await r.json()).features
}

const provinces = []
for (const [iso3, adm, cc, names, rename] of SOURCES) {
  const feats = await load(iso3, adm)
  for (const n of names) {
    const f = feats.find((x) => x.properties.shapeName === n)
    if (!f) throw new Error(`${iso3} ADM${adm} has no "${n}"`)
    provinces.push({ type: 'Feature', properties: { name: rename[n] ?? n, cc }, geometry: f.geometry })
  }
}

const round = (g, d) => {
  const r = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(d), +c[1].toFixed(d)] : c.map(r))
  return { ...g, coordinates: r(g.coordinates) }
}
const dedupeRing = (ring) => ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1])
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
const toGeom = (ps) => (ps.length === 1 ? { type: 'Polygon', coordinates: ps[0] } : { type: 'MultiPolygon', coordinates: ps })
const clean = (g) => toGeom(polysOf(g).map((p) => p.map(dedupeRing).filter((r) => r.length >= 4)).filter((p) => p.length))
const ringArea = (r) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return Math.abs(a) / 2
}

/** Merges provinces into outer shells only. The 1.5 km buffer closes the slivers between the four national datasets. */
function dissolve(feats, tolerance, minArea) {
  let u = turf.buffer(feats[0], 1.5, { units: 'kilometers', steps: 4 })
  for (const f of feats.slice(1)) u = turf.union(turf.featureCollection([u, turf.buffer(f, 1.5, { units: 'kilometers', steps: 4 })]))
  const shells = polysOf(u.geometry).map((p) => [p[0]]).filter((p) => ringArea(p[0]) >= minArea)
  return clean(round(turf.simplify(turf.feature(toGeom(shells)), { tolerance, highQuality: true }).geometry, 3))
}

const outline = dissolve(provinces, 0.012, 0.01)
const parts = Object.fromEntries(['TR', 'IQ', 'IR', 'SY'].map((cc) => [cc, dissolve(provinces.filter((p) => p.properties.cc === cc), 0.02, 0.005)]))
const features = provinces.map((f) => {
  const g = clean(round(turf.simplify(turf.feature(f.geometry), { tolerance: 0.006, highQuality: true }).geometry, 3))
  return { type: 'Feature', properties: f.properties, geometry: toGeom(polysOf(g).filter((p) => ringArea(p[0]) >= 0.0002)) }
})

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'kurdistan-outline.json'), `${JSON.stringify({ outline, parts })}\n`)
fs.writeFileSync(path.join(OUT, 'kurdistan-provinces.json'), `${JSON.stringify({ type: 'FeatureCollection', features })}\n`)
console.log(`Kurdistan: ${features.length} provinces, ${Math.round(turf.area(turf.feature(outline)) / 1e6)} km²`)

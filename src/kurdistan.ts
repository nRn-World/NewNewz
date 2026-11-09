// Kurdistan as a country of its own: one outline across the four states it lies in, built from the same
// geoBoundaries provinces every other country uses (see scripts/build-kurdistan-geo.mjs to move the border).
import { type Area, KURDISTAN_CC, inside, norm } from './areas'
import geo from './geo/kurdistan-outline.json'
import type { Place } from './lib'

export { KURDISTAN_CC }
export const KURDISTAN_NAME = 'Kurdistan'
/** Where the country label sits on the globe, and where a search for "Kurdistan" lands. */
export const KURDISTAN_CENTER: [number, number] = [43.0, 37.2]

// JSON coordinates are typed number[][], not [lon, lat] tuples
export const KURDISTAN_OUTLINE = geo.outline as unknown as Area['geometry']
const PARTS = geo.parts as unknown as Record<string, Area['geometry']>
const [WEST, SOUTH, EAST, NORTH] = [36.5, 32.0, 48.3, 41.2]

/** Every spelling the country goes by in the app's languages and in the local press (Kurmancî, Soranî, Arabic, Persian, Turkish). */
export const KURDISTAN_NAMES = ['Kurdistan', 'Kurdistanê', 'Kürdistan', 'کوردستان', 'كوردستان', 'كردستان', 'کردستان']
const NAME_KEYS = new Set(KURDISTAN_NAMES.map(norm))

export const isKurdistanName = (name: string) => NAME_KEYS.has(norm(name))

export function inKurdistan(lat: number, lon: number): boolean {
  if (lon < WEST || lon > EAST || lat < SOUTH || lat > NORTH) return false
  return inside([lon, lat], KURDISTAN_OUTLINE)
}

/** The state a point in Kurdistan lies in (TR, IQ, IR or SY), which decides the language of its local press and police. */
export function kurdistanHomeCc(lat: number, lon: number): string | undefined {
  return Object.keys(PARTS).find((cc) => inside([lon, lat], PARTS[cc]))
}

export function kurdistanPlace(lat = KURDISTAN_CENTER[1], lon = KURDISTAN_CENTER[0]): Place {
  return { lat, lon, cc: KURDISTAN_CC, parts: [{ level: 'country', name: KURDISTAN_NAME }] }
}

/** Places a geocoder files under Turkey, Iraq, Iran or Syria belong to Kurdistan when they lie inside its border. */
export function kurdify(p: Place): Place {
  if (!p.parts.length || p.parts[0].level === 'country' || p.cc?.toUpperCase() === KURDISTAN_CC || !inKurdistan(p.lat, p.lon)) return p
  // Iraq's "Kurdistan Region" is the country itself here, not a province of it; Iran's Kurdistan province keeps its
  // own name ("Kordestan") so the two never read as the same place.
  const fromIran = p.cc?.toUpperCase() === 'IR'
  const parts = p.parts.flatMap((x) => {
    if (x.level === 'country') return []
    if (x.level === 'state' && isKurdistanName(x.name)) return fromIran ? [{ ...x, name: 'Kordestan' }] : []
    return [x]
  })
  if (!parts.length) return p
  return { ...p, cc: KURDISTAN_CC, parts: [...parts, { level: 'country', name: KURDISTAN_NAME }] }
}

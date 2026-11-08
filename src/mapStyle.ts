export type MapMode = 'sat' | 'paper' | 'dark'

const MAP_MODE_KEY = 'newzlocal.mapMode'

export function loadMapMode(): MapMode {
  try {
    const v = localStorage.getItem(MAP_MODE_KEY)
    if (v === 'sat' || v === 'paper' || v === 'dark') return v
  } catch { /* ignore */ }
  return 'sat'
}

export function saveMapMode(mode: MapMode) {
  try {
    localStorage.setItem(MAP_MODE_KEY, mode)
  } catch { /* ignore */ }
}

const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

type Layer = {
  id: string
  type: string
  source?: string
  'source-layer'?: string
  minzoom?: number
  maxzoom?: number
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

const FALLBACK_SAT_STYLE = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: [SAT],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#05070d' } },
    { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 300 } },
  ],
}

let basePositronCache: Record<string, unknown> | null = null

async function getBasePositron(): Promise<Record<string, unknown> | null> {
  if (basePositronCache) return JSON.parse(JSON.stringify(basePositronCache))
  try {
    const r = await fetch('https://tiles.openfreemap.org/styles/positron', { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    basePositronCache = (await r.json()) as Record<string, unknown>
    return JSON.parse(JSON.stringify(basePositronCache))
  } catch {
    return null
  }
}

export async function earthStyle(mode: MapMode = 'sat') {
  const base = await getBasePositron()
  if (!base) return FALLBACK_SAT_STYLE

  const layers = base.layers as Layer[]
  const buildingSrc = layers.find((l) => l.id === 'building')

  if (mode === 'sat') {
    ;(base.sources as Record<string, unknown>).sat = FALLBACK_SAT_STYLE.sources.sat
    const keep = layers.filter((l) =>
      l.type === 'symbol'
        ? /^(label_|water_name|highway-name)/.test(l.id) && l.id !== 'label_state'
        : l.type === 'line' && /^(boundary_[23]|highway_(motorway|major)_inner|highway_minor)$/.test(l.id),
    )
    for (const l of keep) {
      const p = (l.paint ??= {})
      if (/^label_city/.test(l.id)) l.maxzoom = 11
      if (l.type === 'symbol') {
        p['text-color'] = '#ffffff'
        p['text-halo-color'] = 'rgba(8,10,16,.85)'
        p['text-halo-width'] = 1.6
      } else if (/boundary/.test(l.id)) {
        p['line-color'] = '#ff6a4a'
        p['line-opacity'] = 0.9
      } else {
        p['line-color'] = '#ffffff'
        p['line-opacity'] = 0.45
        l.minzoom = Math.max(l.minzoom ?? 0, 11)
      }
    }
    base.layers = [
      { id: 'background', type: 'background', paint: { 'background-color': '#05070d' } },
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 300 } },
      ...(buildingSrc
        ? [
            {
              id: 'building-3d',
              type: 'fill-extrusion',
              source: buildingSrc.source,
              'source-layer': buildingSrc['source-layer'],
              minzoom: 14,
              paint: {
                'fill-extrusion-color': '#d9cfb8',
                'fill-extrusion-height': ['get', 'render_height'],
                'fill-extrusion-base': ['get', 'render_min_height'],
                'fill-extrusion-opacity': 0.8,
              },
            },
          ]
        : []),
      ...keep,
    ]
    return base
  }

  // Vector map modes ('paper' broadsheet style & 'dark' night press style — 100% open licence via OpenFreeMap/OSM)
  const isPaper = mode === 'paper'
  for (const l of layers) {
    const p = (l.paint ??= {})
    if (l.id === 'label_state') {
      l.layout = { ...(l.layout ?? {}), visibility: 'none' }
      continue
    }
    if (l.type === 'background') {
      p['background-color'] = isPaper ? '#efe4c6' : '#131924'
    } else if (l.type === 'fill') {
      if (/water/.test(l.id)) p['fill-color'] = isPaper ? '#b7cdd6' : '#0a101a'
      else if (/park|wood|landcover|grass/.test(l.id)) p['fill-color'] = isPaper ? '#dfd4b2' : '#18222d'
      else if (/building/.test(l.id)) p['fill-color'] = isPaper ? '#e3d5b5' : '#1d2636'
      else p['fill-color'] = isPaper ? '#ebe0c2' : '#161e2b'
    } else if (l.type === 'line') {
      if (/boundary/.test(l.id)) {
        p['line-color'] = isPaper ? '#c8321e' : '#ff6a4a'
        p['line-opacity'] = 0.85
      } else if (/water/.test(l.id)) {
        p['line-color'] = isPaper ? '#9fbac5' : '#0d1726'
      } else {
        p['line-color'] = isPaper ? '#cbbba0' : '#283448'
      }
    } else if (l.type === 'symbol') {
      if (/^label_city/.test(l.id)) l.maxzoom = 11
      p['text-color'] = isPaper ? '#14100b' : '#eef3fb'
      p['text-halo-color'] = isPaper ? 'rgba(245,236,215,0.92)' : 'rgba(10,14,22,0.9)'
      p['text-halo-width'] = 1.5
    }
  }
  return base
}

export function skyFor(mode: MapMode) {
  if (mode === 'paper') {
    return {
      'sky-color': '#8aaec0',
      'sky-horizon-blend': 0.65,
      'horizon-color': '#efe4c6',
      'horizon-fog-blend': 0.8,
      'fog-color': '#e4d6b5',
      'fog-ground-blend': 0.5,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
    }
  }
  return {
    'sky-color': '#2f6fd6',
    'sky-horizon-blend': 0.6,
    'horizon-color': '#b6dcff',
    'horizon-fog-blend': 0.8,
    'fog-color': '#8fb8ff',
    'fog-ground-blend': 0.5,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  }
}

// Real-earth look: Esri World Imagery (sharp to street level) as the base, OpenFreeMap vector data on top
// (labels, borders, roads, 3D buildings). Region names come from the area layer instead, so label_state is dropped.
// LICENCE: free for development / non-commercial; Esri's terms need a licence for commercial apps.
const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

type Layer = { id: string; type: string; source?: string; 'source-layer'?: string; minzoom?: number; paint?: Record<string, unknown> }

const FALLBACK_STYLE = {
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

export async function earthStyle() {
  try {
    const r = await fetch('https://tiles.openfreemap.org/styles/positron', { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return FALLBACK_STYLE
    const style = await r.json()
    const src = (style.layers as Layer[]).find((l) => l.id === 'building')
    style.sources.sat = FALLBACK_STYLE.sources.sat
    const keep = (style.layers as Layer[]).filter((l) =>
      l.type === 'symbol'
        ? /^(label_|water_name|highway-name)/.test(l.id) && l.id !== 'label_state'
        : l.type === 'line' && /^(boundary_[23]|highway_(motorway|major)_inner|highway_minor)$/.test(l.id),
    )
    for (const l of keep) {
      const p = (l.paint ??= {})
      if (/^label_city/.test(l.id)) (l as { maxzoom?: number }).maxzoom = 11
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
    style.layers = [
      { id: 'background', type: 'background', paint: { 'background-color': '#05070d' } },
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 300 } },
      ...(src
        ? [
            {
              id: 'building-3d',
              type: 'fill-extrusion',
              source: src.source,
              'source-layer': src['source-layer'],
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
    return style
  } catch {
    return FALLBACK_STYLE
  }
}

export const SKY = {
  'sky-color': '#2f6fd6',
  'sky-horizon-blend': 0.6,
  'horizon-color': '#b6dcff',
  'horizon-fog-blend': 0.8,
  'fog-color': '#8fb8ff',
  'fog-ground-blend': 0.5,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
}

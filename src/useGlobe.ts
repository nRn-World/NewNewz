import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { type Area, at, boundaries, bounds, kidsOf, labelPoint, norm } from './areas'
import type { Lang } from './i18n'
import { KURDISTAN_CENTER, KURDISTAN_NAME, KURDISTAN_OUTLINE } from './kurdistan'
import { type Article, type Place, reverse, reverseCountry } from './lib'
import { type MapMode, earthStyle, skyFor } from './mapStyle'
import { type Street, circle, subPieces } from './overpass'
import { readHashPlace } from './urlState'

maplibregl.setWorkerUrl(workerUrl)

export type SheetSnap = 'peek' | 'half' | 'full'
export type AreaProg = { id: number; step: 1 | 2 | 3; pct: number; estSec: number }
export type StoryPin = { name: string; count: number; lon: number; lat: number }

type Ctx = { cc: string; country: string }
type Cur = Ctx & { mode: 1 | 2 | 3; feats: Area[]; sel?: string; state?: string; district?: string }

const SNAP_RATIO: Record<SheetSnap, number> = { peek: 0.16, half: 0.5, full: 0.88 }

function computeStartZoom() {
  const w = window.innerWidth
  const free = w > 700 ? Math.min(w - 440, window.innerHeight) : Math.min(w, window.innerHeight * 0.5)
  return Math.max(0.5, Math.log2((0.9 * free) / 163))
}

export function useGlobe({
  lang,
  mapMode,
  sheetSnap,
  activePinName,
  onSelectPlace,
  onPinClick,
  onError,
}: {
  lang: Lang
  mapMode: MapMode
  sheetSnap: SheetSnap
  activePinName: string
  onSelectPlace: (p: Place, level?: number) => void
  onPinClick: (name: string) => void
  onError: (msg: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const pinRef = useRef<maplibregl.Marker | null>(null)
  const spinRef = useRef(true)
  const curRef = useRef<Cur | null>(null)
  const pinsRef = useRef<StoryPin[]>([])
  const activePinRef = useRef(activePinName)
  const hovRef = useRef<number | string | undefined>(undefined)
  const seqRef = useRef(0)
  const areaAbortRef = useRef<AbortController | null>(null)
  const heatRef = useRef<Record<string, number>>({})
  const langRef = useRef(lang)
  const modeRef = useRef(mapMode)
  const snapRef = useRef(sheetSnap)
  const selectCbRef = useRef(onSelectPlace)
  const pinCbRef = useRef(onPinClick)
  const errCbRef = useRef(onError)

  const [areaProgress, setAreaProgress] = useState<AreaProg | null>(null)
  const [area, setArea] = useState<Area | null>(null)
  const [heatEntries, setHeatEntries] = useState<{ name: string; n: number }[]>([])

  useEffect(() => {
    langRef.current = lang
    snapRef.current = sheetSnap
    selectCbRef.current = onSelectPlace
    pinCbRef.current = onPinClick
    errCbRef.current = onError
  }, [lang, sheetSnap, onSelectPlace, onPinClick, onError])

  const cancelAreas = useCallback(() => {
    seqRef.current++
    areaAbortRef.current?.abort()
    areaAbortRef.current = null
    setAreaProgress(null)
  }, [])

  const applyPadding = useCallback((m: maplibregl.Map) => {
    const w = window.innerWidth
    if (w > 700) {
      m.setPadding({ top: 0, bottom: 0, left: langRef.current === 'ar' ? 0 : 440, right: langRef.current === 'ar' ? 440 : 0 })
    } else {
      m.setPadding({ top: 0, left: 0, right: 0, bottom: Math.round(window.innerHeight * SNAP_RATIO[snapRef.current]) })
    }
  }, [])

  useEffect(() => {
    if (mapRef.current) applyPadding(mapRef.current)
  }, [lang, sheetSnap, applyPadding])

  const drawPins = useCallback((pins: StoryPin[], activeName = activePinRef.current) => {
    pinsRef.current = pins
    const m = mapRef.current
    const src = m?.getSource('story-pins') as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: pins.map((p) => ({
        type: 'Feature',
        properties: {
          name: p.name,
          count: String(p.count),
          active: norm(p.name) === norm(activeName) ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    } as never)
  }, [])

  useEffect(() => {
    activePinRef.current = activePinName
    drawPins(pinsRef.current, activePinName)
  }, [activePinName, drawPins])

  const drawPieces = useCallback((c: Cur) => {
    const m = mapRef.current
    const src = m?.getSource('areas') as maplibregl.GeoJSONSource | undefined
    const names = m?.getSource('area-names') as maplibregl.GeoJSONSource | undefined
    if (!src || !names) return
    curRef.current = c
    hovRef.current = undefined
    src.setData({
      type: 'FeatureCollection',
      features: c.feats.map((f) => ({
        ...f,
        properties: { ...f.properties, sel: f.properties.name === c.sel ? 1 : 0, n: heatRef.current[f.properties.name] ?? 0 },
      })),
    } as never)
    names.setData({
      type: 'FeatureCollection',
      features: [...new Map(c.feats.map((f) => [f.properties.name, f])).values()].map((f) => ({
        type: 'Feature',
        properties: {
          name: f.properties.name,
          label: heatRef.current[f.properties.name] ? `${f.properties.name} · ${heatRef.current[f.properties.name]}` : f.properties.name,
        },
        geometry: { type: 'Point', coordinates: labelPoint(f.geometry) },
      })),
    } as never)
  }, [])

  const installCustomLayers = useCallback(
    (m: maplibregl.Map, mode: MapMode) => {
      m.setProjection({ type: 'globe' })
      m.setSky(skyFor(mode) as never)
      const isPaper = mode === 'paper'
      const font = (m.getStyle().layers.find((l) => l.type === 'symbol')?.layout as { 'text-font'?: string[] } | undefined)?.['text-font']

      // Kurdistan, drawn the way the basemap draws every other country: the same border line and the same name label.
      if (!m.getSource('kurdistan')) {
        type StyleLayer = { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }
        const styleLayers = m.getStyle().layers as StyleLayer[]
        const border = styleLayers.find((l) => l.id === 'boundary_2')
        m.addSource('kurdistan', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: KURDISTAN_OUTLINE } as never })
        m.addLayer({
          id: 'kurdistan-border',
          type: 'line',
          source: 'kurdistan',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': border?.paint?.['line-color'] ?? (isPaper ? '#c8321e' : '#ff6a4a'),
            'line-opacity': border?.paint?.['line-opacity'] ?? 0.9,
            'line-width': border?.paint?.['line-width'] ?? ['interpolate', ['linear'], ['zoom'], 3, 1, 5, 1.2, 12, 3],
          },
        } as never)
        // Text needs the basemap's glyphs; the bare satellite fallback style has none.
        if (m.getStyle().glyphs) {
          const country = styleLayers.find((l) => l.id === 'label_country_3') ?? styleLayers.find((l) => /^label_country/.test(l.id))
          const { 'text-field': _field, ...countryLayout } = country?.layout ?? {}
          m.addSource('kurdistan-name', {
            type: 'geojson',
            data: { type: 'Feature', properties: { name: KURDISTAN_NAME }, geometry: { type: 'Point', coordinates: KURDISTAN_CENTER } },
          })
          m.addLayer({
            id: 'kurdistan-label',
            type: 'symbol',
            source: 'kurdistan-name',
            minzoom: 2,
            maxzoom: 9,
            layout: {
              'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 7, 17],
              'text-max-width': 6.25,
              ...(font ? { 'text-font': font } : {}),
              ...countryLayout,
              'text-field': ['get', 'name'],
            },
            paint: country?.paint ?? {
              'text-color': isPaper ? '#14100b' : '#ffffff',
              'text-halo-color': isPaper ? '#f5ecd7' : 'rgba(8,10,16,.85)',
              'text-halo-width': 1.6,
            },
          } as never)
        }
      }

      if (!m.getSource('areas')) {
        m.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, generateId: true })
        m.addLayer({
          id: 'areas-fill',
          type: 'fill',
          source: 'areas',
          paint: {
            'fill-color': isPaper ? '#c8321e' : '#ff5a3c',
            // near-invisible: only there to catch clicks; outlines carry the look
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.15, 0.01],
          },
        })
        m.addLayer({
          id: 'areas-line',
          type: 'line',
          source: 'areas',
          paint: {
            'line-color': ['case', ['==', ['get', 'sel'], 1], '#ff2d1a', isPaper ? '#c8321e' : '#ff5a3c'],
            'line-width': ['case', ['==', ['get', 'sel'], 1], 3.5, ['+', 1, ['min', ['get', 'n'], 4]]],
            'line-opacity': 0.95,
          },
        })
      }

      if (!m.getSource('area-names')) {
        m.addSource('area-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        m.addLayer({
          id: 'areas-label',
          type: 'symbol',
          source: 'area-names',
          minzoom: 3,
          layout: { 'text-field': ['get', 'label'], 'text-size': 13, ...(font ? { 'text-font': font } : {}) },
          paint: {
            'text-color': isPaper ? '#14100b' : '#ffffff',
            'text-halo-color': isPaper ? '#f5ecd7' : '#05070d',
            'text-halo-width': 1.6,
          },
        })
      }

      if (!m.getSource('story-pins')) {
        m.addSource('story-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        m.addLayer({
          id: 'story-pins-circle',
          type: 'circle',
          source: 'story-pins',
          minzoom: 4,
          paint: {
            'circle-radius': ['case', ['==', ['get', 'active'], 1], 14, 11],
            'circle-color': ['case', ['==', ['get', 'active'], 1], '#ffd166', '#c8321e'],
            'circle-stroke-color': ['case', ['==', ['get', 'active'], 1], '#14100b', '#ffffff'],
            'circle-stroke-width': 2,
          },
        })
        m.addLayer({
          id: 'story-pins-count',
          type: 'symbol',
          source: 'story-pins',
          minzoom: 4,
          layout: {
            'text-field': ['get', 'count'],
            'text-size': 11,
            'text-allow-overlap': true,
            ...(font ? { 'text-font': font } : {}),
          },
          paint: {
            'text-color': ['case', ['==', ['get', 'active'], 1], '#14100b', '#ffffff'],
          },
        })
      }

      if (curRef.current) drawPieces(curRef.current)
      if (pinsRef.current.length) drawPins(pinsRef.current)
    },
    [drawPieces, drawPins],
  )

  // Switch map style on demand while preserving current camera, areas, and geo-tagged pins
  useEffect(() => {
    const m = mapRef.current
    if (!m || modeRef.current === mapMode) return
    modeRef.current = mapMode
    let cancelled = false
    earthStyle(mapMode).then((style) => {
      if (cancelled || !mapRef.current) return
      m.once('style.load', () => installCustomLayers(m, mapMode))
      m.setStyle(style as maplibregl.StyleSpecification)
    })
    return () => {
      cancelled = true
    }
  }, [mapMode, installCustomLayers])

  const loadSub = useCallback(
    async (f: Area, c: Cur, me: number, ctrl: AbortController) => {
      setAreaProgress({ id: me, step: 3, pct: 72, estSec: 6 })
      try {
        const subs = await subPieces(f, ctrl.signal)
        if (me === seqRef.current && !ctrl.signal.aborted && subs.length) {
          drawPieces({ ...c, mode: 3, feats: subs, sel: undefined, district: f.properties.name })
        }
      } catch {
        // Optional neighbourhood drilldown — provinces/districts are already rendered
      } finally {
        if (me === seqRef.current) setAreaProgress(null)
      }
    },
    [drawPieces],
  )

  const showAreas = useCallback(
    async (c: Ctx, adm1?: string, selected?: string, pt?: [number, number], withSub = false): Promise<[[number, number], [number, number]] | undefined> => {
      const m = mapRef.current
      if (!m?.getSource('areas')) return
      areaAbortRef.current?.abort()
      const ctrl = new AbortController()
      areaAbortRef.current = ctrl
      const me = ++seqRef.current
      setAreaProgress({ id: me, step: 1, pct: 22, estSec: withSub ? 7 : 3 })
      let step3Launched = false
      try {
        const a1 = await boundaries(c.cc, 1)
        if (me !== seqRef.current || ctrl.signal.aborted) return
        let feats = a1?.features ?? []
        let mode: 1 | 2 = 1
        const hit = (pt && at(feats, pt)) || (adm1 && feats.find((f) => norm(f.properties.name) === norm(adm1)))
        if (a1 && hit) {
          setAreaProgress({ id: me, step: 2, pct: 50, estSec: withSub ? 5 : 2 })
          // a province of Kurdistan gets its districts from the state it lies in
          const a2 = await boundaries(hit.properties.cc ?? c.cc, 2).catch(() => null)
          if (me !== seqRef.current || ctrl.signal.aborted) return
          if (a2) {
            const kids = kidsOf(hit, a2)
            if (kids.length) {
              feats = kids
              mode = 2
              selected ??= pt && at(kids, pt)?.properties.name
            }
          }
        }
        drawPieces({ ...c, mode, feats, sel: selected, state: hit ? hit.properties.name : undefined })
        const selArea = mode === 2 && selected ? (feats.find((f) => f.properties.name === selected) ?? null) : null
        setArea(selArea)
        if (withSub && selArea) {
          step3Launched = true
          void loadSub(selArea, curRef.current!, me, ctrl)
        }
        if (hit) return bounds(hit.geometry)
        return feats.reduce<[[number, number], [number, number]] | undefined>((u, f) => {
          const [[w, s], [e, n]] = bounds(f.geometry)
          return u ? [[Math.min(u[0][0], w), Math.min(u[0][1], s)], [Math.max(u[1][0], e), Math.max(u[1][1], n)]] : [[w, s], [e, n]]
        }, undefined)
      } catch {
        if (me === seqRef.current && !ctrl.signal.aborted) errCbRef.current('err.areas')
      } finally {
        if (me === seqRef.current && !step3Launched) setAreaProgress(null)
      }
    },
    [drawPieces, loadSub],
  )

  const placePin = useCallback((p: Place) => {
    spinRef.current = false
    pinRef.current?.remove()
    const m = mapRef.current
    if (m) pinRef.current = new maplibregl.Marker({ color: '#c8321e' }).setLngLat([p.lon, p.lat]).addTo(m)
  }, [])

  const pickOnGlobe = useCallback(
    (p: Place, fly = true, initialLevel = 0) => {
      placePin(p)
      drawPins([])
      selectCbRef.current(p, initialLevel)
      const m = mapRef.current
      const targetPart = p.parts[initialLevel] ?? p.parts[0]
      const zoom = { street: 15, district: 13, city: 11, state: 6, country: 4 }[targetPart.level]
      if (fly && m) m.flyTo({ center: [p.lon, p.lat], zoom, pitch: zoom > 9 ? 55 : 0, duration: 2200 })
      const country = p.parts[p.parts.length - 1]
      if (p.cc && country?.level === 'country') {
        const stateHint = p.parts.find((x) => x.level === 'state')?.name ?? (targetPart.level === 'city' ? targetPart.name : undefined)
        const cc = p.cc
        const run = () =>
          showAreas(
            { cc, country: country.name },
            stateHint,
            undefined,
            ['street', 'district', 'city'].includes(targetPart.level) ? [p.lon, p.lat] : undefined,
            targetPart.level === 'district',
          ).then((box) => {
            const lv = targetPart.level
            if (fly && m && box && (lv === 'state' || lv === 'country')) {
              m.fitBounds(box, { padding: 40, pitch: lv === 'state' ? 40 : 0, duration: 2000, maxZoom: 11 })
            }
          })
        if (fly && m) {
          // let the map tiles finish after the fly-in before the big boundary files compete for bandwidth and the main thread
          let started = false
          const go = () => { if (!started) { started = true; void run() } }
          m.once('idle', go)
          setTimeout(go, 6000)
        } else void run()
      }
    },
    [drawPins, placePin, showAreas],
  )

  const focusCrumb = useCallback(
    (place: Place, idx: number) => {
      const part = place.parts[idx]
      const country = place.parts[place.parts.length - 1]
      if (!place.cc || !part || !country) return
      if (part.level === 'country') void showAreas({ cc: place.cc, country: country.name })
      else if (part.level === 'state') void showAreas({ cc: place.cc, country: country.name }, part.name)
    },
    [showAreas],
  )

  const focusStreet = useCallback(
    (place: Place, st: Street) => {
      const next: Place = {
        lat: st.lat,
        lon: st.lon,
        cc: place.cc,
        parts: [{ level: 'street', name: st.name }, ...place.parts.filter((p) => p.level !== 'street')],
      }
      placePin(next)
      selectCbRef.current(next, 0)
      mapRef.current?.flyTo({ center: [st.lon, st.lat], zoom: 16, pitch: 55, duration: 1800 })
    },
    [placePin],
  )

  /** Updates polygon heat shading AND places clickable Geo-tagged story pins on the 3D map. */
  const updateHeat = useCallback(
    (articles: Article[] | undefined, active: boolean, streets?: Street[] | null) => {
      const c = curRef.current
      if (!active || !articles) {
        if (!active) drawPins([])
        return
      }
      const texts = articles.map((a) => norm(`${a.orig ?? a.title} ${a.summary ?? ''}`))
      const nextHeat: Record<string, number> = {}
      const nextPins: StoryPin[] = []
      const seenPinNames = new Set<string>()

      if (c) {
        for (const f of c.feats) {
          const nm = norm(f.properties.name)
          if (nm.length >= 3) {
            const n = texts.filter((h) => h.includes(nm)).length
            if (n > 0) {
              nextHeat[f.properties.name] = n
              if (!seenPinNames.has(nm)) {
                seenPinNames.add(nm)
                const [lon, lat] = labelPoint(f.geometry)
                nextPins.push({ name: f.properties.name, count: n, lon, lat })
              }
            }
          }
        }
      }

      if (streets) {
        for (const st of streets) {
          const nm = norm(st.name)
          if (nm.length >= 5 && !seenPinNames.has(nm)) {
            const n = texts.filter((h) => h.includes(nm)).length
            if (n > 0) {
              seenPinNames.add(nm)
              nextPins.push({ name: st.name, count: n, lon: st.lon, lat: st.lat })
            }
          }
        }
      }

      drawPins(nextPins)

      if (c && JSON.stringify(nextHeat) !== JSON.stringify(heatRef.current)) {
        heatRef.current = nextHeat
        setHeatEntries(Object.entries(nextHeat).map(([name, n]) => ({ name, n })))
        drawPieces(c)
      }
    },
    [drawPieces, drawPins],
  )

  /** Resets the 3D globe, markers, polygons, and camera back to the initial first-open start screen. */
  const resetGlobe = useCallback(() => {
    cancelAreas()
    pinRef.current?.remove()
    pinRef.current = null
    curRef.current = null
    hovRef.current = undefined
    heatRef.current = {}
    setArea(null)
    setHeatEntries([])
    drawPins([], '')

    const m = mapRef.current
    if (!m) return
    const emptyFc = { type: 'FeatureCollection', features: [] } as never
    ;(m.getSource('areas') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFc)
    ;(m.getSource('area-names') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFc)
    m.getCanvas().style.cursor = ''

    spinRef.current = false
    const z = computeStartZoom()
    if (m.getZoom() < 3 && Math.abs(m.getPitch()) < 1) {
      m.easeTo({ center: [25, 35], zoom: z, pitch: 0, bearing: 0, duration: 700 })
      spinRef.current = true
    } else {
      m.flyTo({ center: [25, 35], zoom: z, pitch: 0, bearing: 0, duration: 1300 })
      m.once('moveend', () => {
        if (!pinRef.current && !curRef.current) spinRef.current = true
      })
    }
  }, [cancelAreas, drawPins])

  useEffect(() => {
    let m: maplibregl.Map | undefined
    let timer: ReturnType<typeof setInterval>
    let dead = false

    const onResize = () => {
      if (m) applyPadding(m)
    }
    window.addEventListener('resize', onResize)

    const onArea = (f: Area) => {
      const c = curRef.current
      if (!c || !m) return
      const [[w, s], [e, n]] = bounds(f.geometry)
      const name = f.properties.name
      const country = { level: 'country' as const, name: c.country }
      const state = { level: 'state' as const, name: c.state ?? f.properties.parent ?? '' }
      const parts =
        c.mode === 1
          ? [{ level: 'state' as const, name }, country]
          : c.mode === 2
            ? [{ level: 'city' as const, name }, state, country]
            : [{ level: 'district' as const, name }, { level: 'city' as const, name: c.district ?? f.properties.parent ?? '' }, state, country]
      const next: Place = { lat: (s + n) / 2, lon: (w + e) / 2, cc: c.cc, parts }
      placePin(next)
      selectCbRef.current(next, 0)
      m.fitBounds([[w, s], [e, n]], { padding: 80, duration: 2000, pitch: c.mode === 1 ? 0 : 50, maxZoom: f.properties.center ? 14 : 13 })
      if (c.mode === 1) {
        setArea(null)
        void showAreas(c, name)
        return
      }
      setArea(f.properties.center ? { ...f, geometry: circle(f.properties.center, 1500) } : f)
      drawPieces({ ...c, sel: name })
      if (c.mode === 3) return
      areaAbortRef.current?.abort()
      const ctrl = new AbortController()
      areaAbortRef.current = ctrl
      const me = ++seqRef.current
      void loadSub(f, { ...c, sel: name }, me, ctrl)
    }

    earthStyle(modeRef.current)
      .then((style) => {
        if (dead || !boxRef.current) return
        m = new maplibregl.Map({
          container: boxRef.current,
          style: style as maplibregl.StyleSpecification,
          center: [25, 35],
          zoom: computeStartZoom(),
          maxPitch: 75,
          attributionControl: { compact: true },
        })
        mapRef.current = m
        applyPadding(m)
        m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')

        const closeAttrib = () => {
          const el = m!.getContainer().querySelector('.maplibregl-ctrl-attrib')
          el?.classList.remove('maplibregl-compact-show')
          el?.removeAttribute('open')
        }
        m.once('load', closeAttrib)
        m.once('idle', closeAttrib)

        m.once('style.load', () => installCustomLayers(m!, modeRef.current))

        const unhover = () => {
          if (hovRef.current !== undefined && m!.getSource('areas')) {
            m!.setFeatureState({ source: 'areas', id: hovRef.current }, { hover: false })
          }
          hovRef.current = undefined
          m!.getCanvas().style.cursor = ''
        }

        m.on('mouseenter', 'story-pins-circle', () => {
          m!.getCanvas().style.cursor = 'pointer'
        })
        m.on('mouseleave', 'story-pins-circle', () => {
          m!.getCanvas().style.cursor = ''
        })

        m.on('mousemove', 'areas-fill', (e) => {
          const id = e.features?.[0]?.id
          if (id === hovRef.current) return
          unhover()
          if (id !== undefined) {
            hovRef.current = id
            m!.setFeatureState({ source: 'areas', id }, { hover: true })
            m!.getCanvas().style.cursor = 'pointer'
          }
        })
        m.on('mouseleave', 'areas-fill', unhover)

        m.on('click', async (e) => {
          // 1. Check if user clicked a Geo-tagged news pin badge first
          if (m!.getLayer('story-pins-circle')) {
            const pinHit = m!.queryRenderedFeatures(e.point, { layers: ['story-pins-circle'] })[0]
            if (pinHit?.properties?.name) {
              const nm = String(pinHit.properties.name)
              const coords = (pinHit.geometry as { coordinates?: [number, number] }).coordinates
              if (coords) m!.easeTo({ center: coords, zoom: Math.max(m!.getZoom(), 11.5), duration: 900 })
              pinCbRef.current(nm)
              return
            }
          }

          // 2. Check if user clicked a sub-area polygon
          const c = curRef.current
          const hit = c && m!.getLayer('areas-fill') ? m!.queryRenderedFeatures(e.point, { layers: ['areas-fill'] })[0] : undefined
          if (hit) {
            const f = c!.feats.find((x) => x.properties.name === hit.properties.name && (c!.mode === 1 || x.properties.parent === hit.properties.parent))
            if (f && f.properties.name !== c!.sel) return onArea(f)
          }

          // 3. Otherwise reverse-geocode the globe point
          try {
            errCbRef.current('')
            if (m!.getZoom() < 5) {
              const countryHit = await reverseCountry(e.lngLat.lat, e.lngLat.lng, langRef.current)
              if (countryHit) pickOnGlobe(countryHit, true)
              return
            }
            const p = await reverse(e.lngLat.lat, e.lngLat.lng, langRef.current)
            if (p) pickOnGlobe(p, false)
          } catch (x) {
            errCbRef.current((x as Error).message)
          }
        })

        m.on('mousedown', () => (spinRef.current = false))
        m.on('touchstart', () => (spinRef.current = false))

        m.once('load', () => {
          const route = readHashPlace(location.hash)
          if (route) pickOnGlobe(route.place, true, route.level ?? 0)
        })

        timer = setInterval(
          () => spinRef.current && m!.getZoom() < 3 && m!.easeTo({ center: [m!.getCenter().lng + 12, m!.getCenter().lat], duration: 1000, easing: (n) => n }),
          1000,
        )
      })
      .catch(() => errCbRef.current('err.source'))

    return () => {
      dead = true
      areaAbortRef.current?.abort()
      clearInterval(timer)
      window.removeEventListener('resize', onResize)
      m?.remove()
    }
  }, [applyPadding, drawPieces, installCustomLayers, loadSub, pickOnGlobe, placePin, showAreas])

  return {
    boxRef,
    area,
    areaProgress,
    cancelAreas,
    heatEntries,
    pickOnGlobe,
    focusCrumb,
    focusStreet,
    updateHeat,
    resetGlobe,
  }
}

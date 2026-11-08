import type { Place } from './lib'

export type RouteState = { place: Place; level?: number; tab?: 'news' | 'forum' }

/** Encodes a Place (and optional breadcrumb level) into a compact UTF-8 URL-safe Base64 token. */
export function encodePlace(place: Place, level = 0): string {
  const payload = JSON.stringify({
    lat: +place.lat.toFixed(5),
    lon: +place.lon.toFixed(5),
    cc: place.cc,
    parts: place.parts,
    ...(level > 0 ? { lv: level } : {}),
  })
  const bytes = new TextEncoder().encode(payload)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decodes a `#p=...` token, supporting both new URL-safe Base64 and legacy URI-encoded Base64 links. */
export function decodePlace(raw: string): RouteState | null {
  try {
    const clean = decodeURIComponent(raw).replace(/-/g, '+').replace(/_/g, '/')
    const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4)
    const bin = atob(padded)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Place> & { lv?: number }
    if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number' || !Array.isArray(parsed.parts) || !parsed.parts.length) return null
    return {
      place: { lat: parsed.lat, lon: parsed.lon, cc: parsed.cc, parts: parsed.parts },
      level: typeof parsed.lv === 'number' ? parsed.lv : 0,
    }
  } catch {
    return null
  }
}

export function readHashPlace(hash = location.hash): RouteState | null {
  const m = /#p=([^&]+)/.exec(hash)?.[1]
  if (!m) return null
  const state = decodePlace(m)
  if (!state) return null
  const tabMatch = /[&#]tab=(news|forum)/.exec(hash)?.[1] as 'news' | 'forum' | undefined
  return tabMatch ? { ...state, tab: tabMatch } : state
}

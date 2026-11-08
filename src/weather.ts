export type LocalWeather = {
  tempC: number
  windMs: number
  code: number
  icon: string
  severe: boolean
}

const cache = new Map<string, { at: number; data: LocalWeather }>()

/** Maps WMO weather interpretation codes (0–99) to crisp typographic/Unicode newspaper weather symbols. */
export function weatherSymbol(code: number): { icon: string; severe: boolean } {
  if (code === 0) return { icon: '☀', severe: false }
  if (code <= 3) return { icon: '⛅', severe: false }
  if (code === 45 || code === 48) return { icon: '🌫', severe: false }
  if (code >= 51 && code <= 67) return { icon: '🌧', severe: code === 65 || code === 67 }
  if (code >= 71 && code <= 77) return { icon: '❄', severe: code === 75 }
  if (code >= 80 && code <= 82) return { icon: '🌦', severe: code === 82 }
  if (code === 85 || code === 86) return { icon: '❄', severe: code === 86 }
  if (code >= 95) return { icon: '⛈', severe: true }
  return { icon: '☁', severe: false }
}

export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal): Promise<LocalWeather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5000)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m&wind_speed_unit=ms`
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    const j = (await r.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number }
    }
    const cur = j.current
    if (!cur || typeof cur.temperature_2m !== 'number') return null
    const code = cur.weather_code ?? 0
    const windMs = Math.round(cur.wind_speed_10m ?? 0)
    const { icon, severe } = weatherSymbol(code)
    const data: LocalWeather = {
      tempC: Math.round(cur.temperature_2m),
      windMs,
      code,
      icon,
      severe: severe || windMs >= 20,
    }
    cache.set(key, { at: Date.now(), data })
    return data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

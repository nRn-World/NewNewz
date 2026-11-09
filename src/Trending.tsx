import type { Lang } from './i18n'
import { kurdify, kurdistanPlace } from './kurdistan'
import type { Place } from './lib'

const WORLD_POOL: Place[] = [
  kurdistanPlace(),
  { lat: 36.1912, lon: 44.0092, cc: 'iq', parts: [{ level: 'city', name: 'Erbil' }, { level: 'country', name: 'Iraq' }] },
  { lat: 35.5613, lon: 45.4375, cc: 'iq', parts: [{ level: 'city', name: 'Sulaymaniyah' }, { level: 'country', name: 'Iraq' }] },
  { lat: 36.8679, lon: 42.9489, cc: 'iq', parts: [{ level: 'city', name: 'Duhok' }, { level: 'country', name: 'Iraq' }] },
  { lat: 37.0522, lon: 41.2317, cc: 'sy', parts: [{ level: 'city', name: 'Qamishli' }, { level: 'country', name: 'Syria' }] },
  { lat: 59.3293, lon: 18.0686, cc: 'se', parts: [{ level: 'city', name: 'Stockholm' }, { level: 'country', name: 'Sverige' }] },
  { lat: 57.7089, lon: 11.9746, cc: 'se', parts: [{ level: 'city', name: 'Göteborg' }, { level: 'country', name: 'Sverige' }] },
  { lat: 55.605, lon: 13.0038, cc: 'se', parts: [{ level: 'city', name: 'Malmö' }, { level: 'country', name: 'Sverige' }] },
  { lat: 41.0082, lon: 28.9784, cc: 'tr', parts: [{ level: 'city', name: 'İstanbul' }, { level: 'country', name: 'Türkiye' }] },
  { lat: 37.9144, lon: 40.2306, cc: 'tr', parts: [{ level: 'city', name: 'Diyarbakır' }, { level: 'country', name: 'Türkiye' }] },
  { lat: 39.9334, lon: 32.8597, cc: 'tr', parts: [{ level: 'city', name: 'Ankara' }, { level: 'country', name: 'Türkiye' }] },
  { lat: 38.4237, lon: 27.1428, cc: 'tr', parts: [{ level: 'city', name: 'İzmir' }, { level: 'country', name: 'Türkiye' }] },
  { lat: 51.5072, lon: -0.1276, cc: 'gb', parts: [{ level: 'city', name: 'London' }, { level: 'country', name: 'United Kingdom' }] },
  { lat: 40.7128, lon: -74.006, cc: 'us', parts: [{ level: 'city', name: 'New York' }, { level: 'country', name: 'United States' }] },
  { lat: 52.52, lon: 13.405, cc: 'de', parts: [{ level: 'city', name: 'Berlin' }, { level: 'country', name: 'Deutschland' }] },
  { lat: 48.1351, lon: 11.582, cc: 'de', parts: [{ level: 'city', name: 'München' }, { level: 'country', name: 'Deutschland' }] },
  { lat: 48.8566, lon: 2.3522, cc: 'fr', parts: [{ level: 'city', name: 'Paris' }, { level: 'country', name: 'France' }] },
  { lat: 43.2965, lon: 5.3698, cc: 'fr', parts: [{ level: 'city', name: 'Marseille' }, { level: 'country', name: 'France' }] },
  { lat: 40.4168, lon: -3.7038, cc: 'es', parts: [{ level: 'city', name: 'Madrid' }, { level: 'country', name: 'España' }] },
  { lat: 41.3874, lon: 2.1686, cc: 'es', parts: [{ level: 'city', name: 'Barcelona' }, { level: 'country', name: 'España' }] },
  { lat: 25.2048, lon: 55.2708, cc: 'ae', parts: [{ level: 'city', name: 'Dubai' }, { level: 'country', name: 'UAE' }] },
  { lat: 30.0444, lon: 31.2357, cc: 'eg', parts: [{ level: 'city', name: 'Cairo' }, { level: 'country', name: 'Egypt' }] },
  { lat: 35.6762, lon: 139.6503, cc: 'jp', parts: [{ level: 'city', name: 'Tokyo' }, { level: 'country', name: 'Japan' }] },
  { lat: -23.5558, lon: -46.6396, cc: 'br', parts: [{ level: 'city', name: 'São Paulo' }, { level: 'country', name: 'Brasil' }] },
  { lat: -33.8688, lon: 151.2093, cc: 'au', parts: [{ level: 'city', name: 'Sydney' }, { level: 'country', name: 'Australia' }] },
]

// Cities inside Kurdistan are listed under it, exactly as a search or a map click files them.
const GLOBAL_POOL = WORLD_POOL.map(kurdify)

const BY_LANG: Record<Lang, string[]> = {
  sv: ['Stockholm', 'Göteborg', 'Malmö', 'İstanbul', 'London', 'New York'],
  tr: ['İstanbul', 'Diyarbakır', 'Ankara', 'İzmir', 'Berlin', 'London'],
  en: ['London', 'New York', 'Tokyo', 'Berlin', 'İstanbul', 'Sydney'],
  ar: ['Cairo', 'Dubai', 'İstanbul', 'London', 'Paris', 'New York'],
  es: ['Madrid', 'Barcelona', 'São Paulo', 'New York', 'Paris', 'London'],
  fr: ['Paris', 'Marseille', 'London', 'Berlin', 'New York', 'Tokyo'],
  de: ['Berlin', 'München', 'London', 'Paris', 'İstanbul', 'New York'],
  ku: ['Kurdistan', 'Erbil', 'Diyarbakır', 'Sulaymaniyah', 'Duhok', 'Qamishli'],
}

export default function Trending({
  lang,
  onPick,
  t,
}: {
  lang: Lang
  onPick: (p: Place) => void
  t: (k: string) => string
}) {
  const names = BY_LANG[lang] ?? BY_LANG.en
  const picks = names.map((nm) => GLOBAL_POOL.find((p) => p.parts[0].name === nm)!).filter(Boolean)

  const pickRandom = () => {
    const idx = Math.floor(Math.random() * GLOBAL_POOL.length)
    onPick(GLOBAL_POOL[idx])
  }

  return (
    <section className="trending">
      <div className="trend-head">
        <b>{t('hotPlaces')}</b>
        <button type="button" className="chip" onClick={pickRandom}>
          ✦ {t('surpriseMe')}
        </button>
      </div>
      <div className="trend-grid">
        {picks.map((p) => (
          <button key={p.parts[0].name} type="button" className="trend-card" onClick={() => onPick(p)}>
            <strong>{p.parts[0].name}</strong>
            {p.parts.length > 1 && <small>{p.parts[p.parts.length - 1].name}</small>}
          </button>
        ))}
      </div>
    </section>
  )
}

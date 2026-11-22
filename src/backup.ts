import type { SavedArticle } from './bookmarks'
import { type Place, type Quiet, label } from './lib'

export type BackupData = {
  app: 'NewNewz'
  version: 1
  exportedAt: string
  favs: Place[]
  cats: string[]
  quiet: Record<string, Quiet>
  srcs: string[]
  rssFeeds: string[]
  saved: SavedArticle[]
}

const VALID_LEVELS = new Set(['street', 'district', 'city', 'state', 'country'])

function isValidPlace(x: unknown): x is Place {
  if (!x || typeof x !== 'object') return false
  const p = x as Partial<Place>
  return (
    typeof p.lat === 'number' &&
    Number.isFinite(p.lat) &&
    typeof p.lon === 'number' &&
    Number.isFinite(p.lon) &&
    Array.isArray(p.parts) &&
    p.parts.length > 0 &&
    p.parts.every((part) => part && typeof part.name === 'string' && part.name.trim().length > 0 && VALID_LEVELS.has(part.level))
  )
}

function isValidSaved(x: unknown): x is SavedArticle {
  if (!x || typeof x !== 'object') return false
  const s = x as Partial<SavedArticle>
  return typeof s.url === 'string' && /^https?:\/\//i.test(s.url) && typeof s.title === 'string' && s.title.length > 0
}

export function buildBackupJson(data: Omit<BackupData, 'app' | 'version' | 'exportedAt'>): string {
  const payload: BackupData = {
    app: 'NewNewz',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  }
  return JSON.stringify(payload, null, 2)
}

export function downloadBackupFile(json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `newnewz-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Validates and sanitizes an imported NewNewz backup JSON string. Returns `null` if invalid. */
export function parseBackupJson(rawText: string): Omit<BackupData, 'app' | 'version' | 'exportedAt'> | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<BackupData> | null
    if (!parsed || typeof parsed !== 'object' || parsed.app !== 'NewNewz') return null

    const favs = Array.isArray(parsed.favs) ? parsed.favs.filter(isValidPlace).slice(0, 100) : []
    const cats = Array.isArray(parsed.cats)
      ? [...new Set(parsed.cats.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map((c) => c.trim().slice(0, 30)))]
      : []
    const srcs = Array.isArray(parsed.srcs)
      ? [...new Set(parsed.srcs.filter((s): s is string => typeof s === 'string' && s.includes('.')).map((s) => s.trim().toLowerCase()))]
      : []
    const rssFeeds = Array.isArray(parsed.rssFeeds)
      ? [...new Set(parsed.rssFeeds.filter((u): u is string => typeof u === 'string' && /^https:\/\/[^/\s]+\.[^/\s]+/i.test(u.trim())).map((u) => u.trim()))].slice(0, 20)
      : []
    const saved = Array.isArray(parsed.saved) ? parsed.saved.filter(isValidSaved).slice(0, 250) : []

    const quiet: Record<string, Quiet> = {}
    if (parsed.quiet && typeof parsed.quiet === 'object' && !Array.isArray(parsed.quiet)) {
      for (const [k, v] of Object.entries(parsed.quiet).slice(0, 40)) {
        if (!v || typeof v !== 'object') continue
        const q = v as Partial<Quiet>
        const hhmm = (val: unknown, dflt: string) => (/^\d{2}:\d{2}$/.test(String(val)) ? String(val) : dflt)
        quiet[k.slice(0, 30)] = { on: q.on === true, from: hhmm(q.from, '22:00'), to: hhmm(q.to, '07:00') }
      }
    }

    return { favs, cats, quiet, srcs, rssFeeds, saved }
  } catch {
    return null
  }
}

/** Merges imported backup items into existing state without duplicating places, feeds, or bookmarks. */
export function mergeBackupState(
  current: Omit<BackupData, 'app' | 'version' | 'exportedAt'>,
  incoming: Omit<BackupData, 'app' | 'version' | 'exportedAt'>,
): Omit<BackupData, 'app' | 'version' | 'exportedAt'> {
  const favMap = new Map<string, Place>()
  for (const f of [...current.favs, ...incoming.favs]) {
    const k = label(f)
    if (!favMap.has(k)) favMap.set(k, f)
  }
  const savedMap = new Map<string, SavedArticle>()
  for (const s of [...current.saved, ...incoming.saved]) {
    if (!savedMap.has(s.url)) savedMap.set(s.url, s)
  }
  return {
    favs: [...favMap.values()].slice(0, 100),
    cats: [...new Set([...current.cats, ...incoming.cats])],
    quiet: { ...current.quiet, ...incoming.quiet },
    srcs: [...new Set([...current.srcs, ...incoming.srcs])],
    rssFeeds: [...new Set([...current.rssFeeds, ...incoming.rssFeeds])].slice(0, 20),
    saved: [...savedMap.values()].slice(0, 250),
  }
}

export type SavedArticle = {
  url: string
  title: string
  orig?: string
  source: string
  dateIso: string
  placeName: string
  summary?: string
  image?: string
  savedAt: number
}

const KEY = 'newzlocal.saved'

export function loadSaved(): SavedArticle[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function persistSaved(list: SavedArticle[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 250)))
  } catch {
    /* private mode or quota */
  }
}

export function toggleSavedItem(list: SavedArticle[], item: Omit<SavedArticle, 'savedAt'>): SavedArticle[] {
  const exists = list.some((x) => x.url === item.url)
  const next = exists ? list.filter((x) => x.url !== item.url) : [{ ...item, savedAt: Date.now() }, ...list]
  persistSaved(next)
  return next
}

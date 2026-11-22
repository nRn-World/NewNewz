import type { Article } from './lib'
import { norm } from './areas'
import { STOP, topicsOf } from './topics'

export type RelatedItem = {
  url: string
  title: string
  source: string
  date: Date
  orig?: string
  police?: boolean
  forum?: boolean
}

const WINDOW_MS = 72 * 3600 * 1000 // 72 hours for related event coverage
const LONG_WINDOW_MS = 7 * 24 * 3600 * 1000 // 7 days for high-overlap reposts
const SUFFIX_RE = /(?:arna|erna|orna|ningen|ningar|en|et|na|ar|er|or|es|ed|ing|lar|ler|da|de|ta|te)$/u

function stemToken(w: string): string {
  const stripped = w.length >= 5 ? w.replace(SUFFIX_RE, (m) => (w.length - m.length >= 4 ? '' : m)) : w
  return stripped.length >= 6 ? stripped.slice(0, 6) : stripped
}

/** Extracts stemmed content tokens from a headline, excluding stop words and the searched place's own name. */
function storyTokens(title: string, scopeTokens: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const w of norm(title).split(' ')) {
    if (!w || w.length < 3 || STOP.has(w) || scopeTokens.has(w)) continue
    out.add(stemToken(w))
  }
  return out
}

function sameEvent(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 2 || b.size < 2) return false
  let shared = 0
  let hasSpecific = false
  for (const t of a) {
    if (b.has(t)) {
      shared++
      if (t.length >= 5) hasSpecific = true
    }
  }
  if (shared < 2) return false
  const overlap = shared / Math.min(a.size, b.size)
  const jaccard = shared / (a.size + b.size - shared)
  return (hasSpecific && overlap >= 0.5) || overlap >= 0.65 || jaccard >= 0.45 || (shared >= 3 && jaccard >= 0.32)
}

function strongSameEvent(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 2 || b.size < 2) return false
  let shared = 0
  for (const t of a) {
    if (b.has(t)) shared++
  }
  if (shared < 2) return false
  const overlap = shared / Math.min(a.size, b.size)
  const jaccard = shared / (a.size + b.size - shared)
  return overlap >= 0.72 || jaccard >= 0.55
}

/** Catches exact headline duplicates, title-contained reposts, and repeated short entity titles (e.g. "Hotell Kåkbrinken"). */
function isDuplicateHeadline(normA: string, normB: string, dtMs: number): boolean {
  if (!normA || !normB) return false
  if (normA === normB) return true
  const [shorter, longer] = normA.length <= normB.length ? [normA, normB] : [normB, normA]
  if (shorter.length >= 10 && longer.includes(shorter)) {
    if (dtMs <= LONG_WINDOW_MS) return true
    if (shorter.length >= 12 && shorter.length / longer.length >= 0.45 && topicsOf(shorter).length === 0) {
      return true
    }
  }
  // Repeated short title/entity with minor prefix/suffix ("Where to Watch X", "X (1946)", "Xに関するトリビア")
  if (longer.length <= 48) {
    for (const [src, dst] of [
      [shorter, longer],
      [longer, shorter],
    ] as const) {
      const words = src.split(' ').filter(Boolean)
      for (let i = 0; i < words.length - 1; i++) {
        const w1 = words[i]
        const w2 = words[i + 1]
        if (w1.length < 4 || w2.length < 4 || STOP.has(w1) || STOP.has(w2)) continue
        const phrase = `${w1} ${w2}`
        if (
          phrase.length >= 12 &&
          phrase.length / longer.length >= 0.45 &&
          dst.includes(phrase) &&
          topicsOf(phrase).length === 0
        ) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * Deduplicates and groups coverage of the same story across outlets, always keeping the FIRST publisher
 * (earliest timestamp) as the visible lead headline and collapsing later copycats into `article.also`.
 */
export function clusterArticles(articles: Article[], scope = ''): Article[] {
  const scopeTokens = new Set(norm(scope).split(' ').filter((w) => w.length >= 3).map(stemToken))
  const ordered = [...articles].sort((a, b) => +a.date - +b.date)
  const clusters: {
    lead: Article
    normOrig: string
    normTr: string
    tokens: Set<string>
    trTokens: Set<string>
    also: RelatedItem[]
    urls: Set<string>
  }[] = []

  for (const art of ordered) {
    if (art.forum) {
      clusters.push({
        lead: art,
        normOrig: '',
        normTr: '',
        tokens: new Set(),
        trTokens: new Set(),
        also: [],
        urls: new Set([art.url]),
      })
      continue
    }
    const rawOrig = art.orig ?? art.title
    const normOrig = norm(rawOrig)
    const normTr = norm(art.title)
    const toks = storyTokens(rawOrig, scopeTokens)
    const trToks = normTr !== normOrig ? storyTokens(art.title, scopeTokens) : toks

    const match = clusters.find((c) => {
      if (c.lead.forum) return false
      const dtMs = Math.abs(+art.date - +c.lead.date)
      if (
        isDuplicateHeadline(c.normOrig, normOrig, dtMs) ||
        (normTr !== normOrig && isDuplicateHeadline(c.normTr, normTr, dtMs))
      ) {
        return true
      }
      if (dtMs <= WINDOW_MS && (sameEvent(c.tokens, toks) || (trToks !== toks && sameEvent(c.trTokens, trToks)))) {
        return true
      }
      if (
        dtMs <= LONG_WINDOW_MS &&
        (strongSameEvent(c.tokens, toks) || (trToks !== toks && strongSameEvent(c.trTokens, trToks)))
      ) {
        return true
      }
      return false
    })

    if (match) {
      if (art.police) match.lead.police = true
      const extras: RelatedItem[] = [
        {
          url: art.url,
          title: art.title,
          source: art.source,
          date: art.date,
          orig: art.orig,
          ...(art.police ? { police: true } : {}),
          ...(art.forum ? { forum: true } : {}),
        },
        ...(art.also ?? []),
      ]
      for (const item of extras) {
        if (!match.urls.has(item.url)) {
          match.urls.add(item.url)
          match.also.push(item)
        }
      }
      if (match.tokens.size < 12) for (const t of toks) match.tokens.add(t)
      if (match.trTokens.size < 12) for (const t of trToks) match.trTokens.add(t)
    } else {
      const existing = art.also ?? []
      clusters.push({
        lead: { ...art, also: undefined },
        normOrig,
        normTr,
        tokens: toks,
        trTokens: trToks,
        also: [...existing],
        urls: new Set([art.url, ...existing.map((x) => x.url)]),
      })
    }
  }

  return clusters
    .map((c) => (c.also.length ? { ...c.lead, also: c.also } : c.lead))
    .sort((a, b) => +b.date - +a.date)
}

/**
 * Attaches matching local forum discussions (within 48h) onto clustered news stories so users can inspect
 * police, press, and community forum coverage on one unified chronological timeline.
 */
export function attachForumToClusters(articles: Article[], forumThreads: Article[], scope = ''): Article[] {
  if (!articles.length || !forumThreads.length) return articles
  const scopeTokens = new Set(norm(scope).split(' ').filter((w) => w.length >= 3).map(stemToken))
  const threadTokens = forumThreads.map((t) => ({
    item: t,
    tokens: storyTokens(t.orig ?? t.title, scopeTokens),
  }))

  return articles.map((art) => {
    if (art.forum) return art
    const leadTokens = storyTokens(art.orig ?? art.title, scopeTokens)
    const seen = new Set([art.url, ...(art.also ?? []).map((x) => x.url)])
    const matchedForums: RelatedItem[] = []
    for (const ft of threadTokens) {
      if (seen.has(ft.item.url)) continue
      if (Math.abs(+art.date - +ft.item.date) > WINDOW_MS) continue
      if (sameEvent(leadTokens, ft.tokens)) {
        seen.add(ft.item.url)
        matchedForums.push({
          url: ft.item.url,
          title: ft.item.title,
          source: ft.item.source,
          date: ft.item.date,
          orig: ft.item.orig,
          forum: true,
        })
      }
    }
    if (!matchedForums.length) return art
    return { ...art, also: [...(art.also ?? []), ...matchedForums] }
  })
}

/**
 * Builds an oldest-to-newest chronological event timeline combining the lead article and all companion sources
 * (official police alerts, press updates, and matching forum threads).
 */
export function buildStoryTimeline(lead: Article): RelatedItem[] {
  const seen = new Set<string>()
  const all: RelatedItem[] = [
    {
      url: lead.url,
      title: lead.title,
      source: lead.source,
      date: lead.date,
      orig: lead.orig,
      ...(lead.police ? { police: true } : {}),
      ...(lead.forum ? { forum: true } : {}),
    },
    ...(lead.also ?? []),
  ]
  const unique: RelatedItem[] = []
  for (const item of all) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    unique.push(item)
  }
  return unique.sort((a, b) => +a.date - +b.date)
}

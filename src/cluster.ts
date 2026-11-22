import type { Article } from './lib'
import { norm } from './areas'
import { STOP } from './topics'

export type RelatedItem = {
  url: string
  title: string
  source: string
  date: Date
  orig?: string
  police?: boolean
  forum?: boolean
}

const WINDOW_MS = 48 * 3600 * 1000 // 48 hours
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

/**
 * Groups duplicate coverage of the same local incident across multiple news outlets under the newest lead headline,
 * attaching companion coverage in `article.also` so users can still inspect every source.
 */
export function clusterArticles(articles: Article[], scope = ''): Article[] {
  const scopeTokens = new Set(norm(scope).split(' ').filter((w) => w.length >= 3).map(stemToken))
  const clusters: { lead: Article; tokens: Set<string>; also: RelatedItem[]; urls: Set<string> }[] = []

  for (const art of articles) {
    if (art.forum) {
      clusters.push({ lead: art, tokens: new Set(), also: [], urls: new Set([art.url]) })
      continue
    }
    const baseTitle = art.orig ?? art.title
    const toks = storyTokens(baseTitle, scopeTokens)
    const match = clusters.find(
      (c) =>
        !c.lead.forum &&
        Math.abs(+c.lead.date - +art.date) <= WINDOW_MS &&
        sameEvent(c.tokens, toks),
    )
    if (match) {
      if (art.police) match.lead.police = true
      if (!match.urls.has(art.url)) {
        match.urls.add(art.url)
        match.also.push({
          url: art.url,
          title: art.title,
          source: art.source,
          date: art.date,
          orig: art.orig,
          ...(art.police ? { police: true } : {}),
          ...(art.forum ? { forum: true } : {}),
        })
        if (match.tokens.size < 10) for (const t of toks) match.tokens.add(t)
      }
    } else {
      const existing = art.also ?? []
      clusters.push({
        lead: { ...art, also: undefined },
        tokens: toks,
        also: [...existing],
        urls: new Set([art.url, ...existing.map((x) => x.url)]),
      })
    }
  }

  return clusters.map((c) => (c.also.length ? { ...c.lead, also: c.also } : c.lead))
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

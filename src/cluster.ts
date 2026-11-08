import type { Article } from './lib'
import { norm } from './areas'
import { STOP } from './topics'

export type RelatedItem = { url: string; title: string; source: string; date: Date; orig?: string }

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
        match.also.push({ url: art.url, title: art.title, source: art.source, date: art.date, orig: art.orig })
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

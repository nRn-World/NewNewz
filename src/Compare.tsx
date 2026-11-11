import { useEffect, useRef, useState } from 'react'
import { type Article, type Place, label, news } from './lib'
import { hotWords, topicCounts } from './topics'

type T = (k: string, v?: Record<string, string>) => string
type Stat = { name: string; total: number; d1: number; d7: number; topics: [string, number][]; words: [string, number][]; sources: number }

/** Two favourites side by side, computed from their latest 100 headlines. */
export default function Compare({ places, t, onClose }: { places: Place[]; t: T; onClose: () => void }) {
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all(
      places.map(async (p): Promise<Stat> => {
        const { articles } = await news(p, 0, 100, true, undefined, 0, ctrl.signal)
        const raw: Article[] = articles.map((a) => ({ ...a, title: a.orig ?? a.title }))
        const now = Date.now()
        const allSources = new Set<string>()
        for (const a of articles) {
          if (a.source) allSources.add(a.source)
          for (const sub of a.also ?? []) if (sub.source) allSources.add(sub.source)
        }
        const totalStories = articles.reduce((sum, a) => sum + 1 + (a.also?.length ?? 0), 0)
        return {
          name: label(p),
          total: totalStories,
          d1: articles.filter((a) => now - +a.date < 864e5).length,
          d7: articles.filter((a) => now - +a.date < 7 * 864e5).length,
          topics: topicCounts(raw).slice(0, 3),
          words: hotWords(raw, p.parts[0].name, 5),
          sources: allSources.size,
        }
      }),
    )
      .then((s) => !ctrl.signal.aborted && setStats(s))
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true)
      })
    return () => ctrl.abort()
  }, [places])

  const rows: [string, (s: Stat) => string][] = [
    [t('cmpTotal'), (s) => String(s.total)],
    [t('cmp24'), (s) => String(s.d1)],
    [t('cmp7'), (s) => String(s.d7)],
    [t('cmpSources'), (s) => String(s.sources)],
    [t('cmpTopics'), (s) => s.topics.map(([id, n]) => `${t('t' + id)} ${n}`).join(', ') || '–'],
    [t('cmpWords'), (s) => s.words.map(([w]) => w).join(', ') || '–'],
  ]
  const max = (f: (s: Stat) => number) => Math.max(1, ...(stats ?? []).map(f))

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cmp-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card">
        <button ref={closeRef} className="paper-x" onClick={onClose} aria-label={t('close')}>×</button>
        <h2 id="cmp-title">{t('compareTitle')}</h2>
        {failed ? (
          <p className="err">{t('err.source')}</p>
        ) : !stats ? (
          <p className="muted">{t('cmpLoading')}</p>
        ) : (
          <table>
            <thead><tr><th />{stats.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
            <tbody>
              {rows.map(([name, f], i) => (
                <tr key={name}>
                  <th>{name}</th>
                  {stats.map((s) => (
                    <td key={s.name}>
                      {f(s)}
                      {i >= 1 && i <= 2 && <div className="bar"><i style={{ width: `${(100 * Number(f(s))) / max((x) => (i === 1 ? x.d1 : x.d7))}%` }} /></div>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

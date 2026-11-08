import { useCallback, useEffect, useRef, useState } from 'react'
import type { Article } from './lib'

type Props = {
  articles: Article[]
  place: string
  date: string
  pageWord: string
  tabName: string
  clipLabel?: string
  ago: (d: Date) => string
  onClip?: (a: Article) => void
  onClose: () => void
}

const FRONT = 9
const PER = 15

/** An engraved-looking globe for the front page. */
const Globe = () => (
  <svg viewBox="0 0 200 130" className="engrave" aria-hidden="true">
    <defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v4" stroke="#1b140d" strokeWidth=".8" /></pattern></defs>
    <rect width="200" height="130" fill="url(#hatch)" opacity=".28" />
    <g fill="none" stroke="#1b140d" strokeWidth="1.4">
      <circle cx="100" cy="65" r="52" fill="#e2d2ac" />
      {[18, 34, 46].map((rx) => <ellipse key={rx} cx="100" cy="65" rx={rx} ry="52" />)}
      <path d="M48 65h104M54 45h92M54 85h92M64 28h72M64 102h72" />
      <path d="M66 50c10-12 26-6 30 4s-8 14-16 12-18-4-14-16zM108 40c12-6 30 2 32 14s-14 8-22 6-18-12-10-20zM98 84c8-4 22 0 22 10s-14 12-22 6-8-12 0-16z" fill="#1b140d" opacity=".75" />
    </g>
  </svg>
)

/** Zeppelin and clouds above an arched masthead. */
const Masthead = () => (
  <svg viewBox="0 0 620 120" className="masthead-art" aria-label="NewzLocal">
    <defs><path id="arc" d="M24 104 Q310 -6 596 104" /></defs>
    <g stroke="#1b140d" fill="none" strokeWidth="1.2">
      <ellipse cx="310" cy="18" rx="86" ry="11" fill="#e2d2ac" />
      <path d="M232 18h156M258 11v14M284 8v20M310 7v22M336 8v20M362 11v14" />
      <path d="M296 29h28l-4 6h-20z" fill="#1b140d" />
      <path d="M226 17l-14-7v14zM394 17l14-7v14z" fill="#e2d2ac" />
      <path d="M118 52q20-22 46-14q16-14 36 0q22-8 32 14M420 52q20-22 46-14q16-14 36 0q22-8 32 14" strokeWidth="1" />
    </g>
    <text className="arc-text"><textPath href="#arc" startOffset="50%" textAnchor="middle">NEWZLOCAL</textPath></text>
  </svg>
)

/** The news list as an old newspaper: newest on the front page, oldest on the last one. Flip with buttons, arrow keys, mouse drag or a swipe. */
export default function Paper({ articles, place, date, pageWord, tabName, clipLabel = 'Clip', ago, onClip, onClose }: Props) {
  const pages = [articles.slice(0, FRONT)]
  for (let i = FRONT; i < articles.length; i += PER) pages.push(articles.slice(i, i + PER))
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'

  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(pages.length - 1, n))
      if (next === page) return
      setDir(next > page ? 1 : -1)
      setPage(next)
    },
    [page, pages.length],
  )

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(page + (isRtl ? -1 : 1))
      else if (e.key === 'ArrowLeft') go(page + (isRtl ? 1 : -1))
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [go, page, isRtl, onClose])

  const rows = pages[page]
  const item = (a: Article | undefined, cls = '') =>
    a && (
      <section key={a.url} className={`story ${cls}`}>
        <h3><a href={a.url} target="_blank" rel="noopener noreferrer" draggable={false}>{a.title}</a></h3>
        {cls === 'banner' && a.summary && <p className="story-sum">{a.summary}</p>}
        <small>
          {a.source}{a.also?.length ? ` (+${a.also.length})` : ''} · {a.approx ? '≈ ' : ''}{ago(a.date)}
          {onClip && (
            <>
              {' · '}
              <button
                type="button"
                className="paper-clip"
                title={clipLabel}
                aria-label={clipLabel}
                onClick={(e) => {
                  e.stopPropagation()
                  onClip(a)
                }}
              >
                ✂
              </button>
            </>
          )}
        </small>
      </section>
    )

  return (
    <div className="paper" role="dialog" aria-modal="true" aria-label={`NewzLocal – ${place}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button ref={closeRef} className="paper-x" onClick={onClose} aria-label="×">×</button>
      <button className="paper-nav prev" onClick={() => go(page + (isRtl ? 1 : -1))} disabled={isRtl ? page === pages.length - 1 : page === 0} aria-label="‹">‹</button>
      <button className="paper-nav next" onClick={() => go(page + (isRtl ? -1 : 1))} disabled={isRtl ? page === 0 : page === pages.length - 1} aria-label="›">›</button>
      <div className="stack s1" aria-hidden />
      <div className="stack s2" aria-hidden />
      <article
        key={page}
        className={`sheet ${dir > 0 ? 'in-next' : 'in-prev'}`}
        onPointerDown={(e) => { drag.current = { x: e.clientX, moved: false }; e.currentTarget.setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (drag.current && Math.abs(e.clientX - drag.current.x) > 12) drag.current.moved = true }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d?.moved) {
            const dx = (e.clientX - d.x) * (isRtl ? -1 : 1)
            if (dx < -50) go(page + 1)
            else if (dx > 50) go(page - 1)
          }
        }}
        onClickCapture={(e) => { if (drag.current?.moved) e.preventDefault() }}
      >
        {page === 0 ? (
          <>
            <header className="front-head">
              <div className="corner left"><b>{tabName}</b><i>★</i><span>LIVE</span></div>
              <div className="center"><Masthead /><div className="ribbon"><span>{place}</span></div></div>
              <div className="corner right"><span>{pageWord} 1</span><b>{articles.length}</b></div>
            </header>
            <div className="edition"><span>EST. 2026</span><span>{place}</span><span>{date}</span></div>
            {item(rows[0], 'banner')}
            <div className="grid3">
              <div className="col l">{item(rows[2])}{item(rows[3])}</div>
              <div className="col c"><Globe />{item(rows[1], 'big')}</div>
              <div className="col r">{item(rows[4], 'caps')}{item(rows[5], 'boxed')}</div>
            </div>
            <div className="bottom">{rows.slice(6, 9).map((a) => item(a, 'boxed'))}</div>
          </>
        ) : (
          <>
            <header className="slim"><span>NEWZLOCAL</span><span>{place}</span><span>{pageWord} {page + 1}</span></header>
            <div className="cols">
              {rows.map((a, i) => item(a, i % 5 === 0 ? 'big' : i % 5 === 3 ? 'boxed' : i % 5 === 1 ? 'caps' : ''))}
            </div>
          </>
        )}
        <footer>{pageWord} {page + 1} / {pages.length}</footer>
      </article>
    </div>
  )
}

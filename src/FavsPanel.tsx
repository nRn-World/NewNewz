import { useRef, useState } from 'react'
import Compare from './Compare'
import { type Place, type Quiet, QUIET0, label } from './lib'
import { TOPICS } from './topics'

type T = (k: string, v?: Record<string, string>) => string

type Props = {
  favs: Place[]
  commitFavs: (next: Place[]) => void
  cats: string[]
  setCatsAndSave: (next: string[]) => void
  quiet: Record<string, Quiet>
  setQuietAndSave: (next: Record<string, Quiet>) => void
  srcs: string[]
  setSrcsAndSave: (next: string[]) => void
  unread: Record<string, number>
  perm: string
  onEnableNotify: () => void
  pushActive: boolean
  mineBusy: boolean
  onOpenMyPaper: () => void
  onOpenFav: (f: Place) => void
  t: T
}

export default function FavsPanel({
  favs,
  commitFavs,
  cats,
  setCatsAndSave,
  quiet,
  setQuietAndSave,
  srcs,
  setSrcsAndSave,
  unread,
  perm,
  onEnableNotify,
  pushActive,
  mineBusy,
  onOpenMyPaper,
  onOpenFav,
  t,
}: Props) {
  const [favCat, setFavCat] = useState('')
  const [newCat, setNewCat] = useState<string | null>(null)
  const [confirmCat, setConfirmCat] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ name: string; x: number; y: number } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const justDragged = useRef(false)
  const [alertOpen, setAlertOpen] = useState<string | null>(null)
  const [cmpSel, setCmpSel] = useState<string[]>([])
  const [cmpOpen, setCmpOpen] = useState(false)
  const [srcDraft, setSrcDraft] = useState('')

  const catNames = [...new Set([...cats, ...favs.map((f) => f.cat).filter((c): c is string => !!c)])]

  const addCat = (raw: string) => {
    const name = raw.trim().slice(0, 30)
    if (!name) return undefined
    if (!catNames.includes(name)) setCatsAndSave([...cats, name])
    return name
  }

  const setCatOf = (f: Place, cat: string) =>
    commitFavs(favs.map((x) => (label(x) === label(f) ? { ...x, cat: cat || undefined } : x)))

  const removeCat = (name: string) => {
    setCatsAndSave(cats.filter((c) => c !== name))
    commitFavs(favs.map((x) => (x.cat === name ? { ...x, cat: undefined } : x)))
    if (favCat === name) setFavCat('')
    setConfirmCat(null)
  }

  const removeFav = (f: Place) => {
    const k = label(f)
    commitFavs(favs.filter((x) => label(x) !== k))
    setCmpSel((prev) => prev.filter((x) => x !== k))
    if (alertOpen === k) setAlertOpen(null)
  }

  const toggleCmp = (f: Place) => {
    const k = label(f)
    setCmpSel((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k)
      const next = [...prev.slice(-1), k]
      if (next.length === 2) setCmpOpen(true)
      return next
    })
  }

  const toggleTopicAlert = (f: Place, topicId: string) => {
    const k = label(f)
    const cur = f.alert ?? []
    const next = cur.includes(topicId) ? cur.filter((x) => x !== topicId) : [...cur, topicId]
    commitFavs(favs.map((x) => (label(x) === k ? { ...x, alert: next.length ? next : undefined } : x)))
  }

  const clearTopicAlert = (f: Place) => {
    const k = label(f)
    commitFavs(favs.map((x) => (label(x) === k ? { ...x, alert: undefined } : x)))
  }

  const addSource = () => {
    const d = srcDraft.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    if (!d.includes('.') || srcs.includes(d)) return setSrcDraft('')
    setSrcsAndSave([...srcs, d])
    setSrcDraft('')
  }

  const delSource = (d: string) => setSrcsAndSave(srcs.filter((x) => x !== d))

  /** Pointer-based drag (works with mouse and touch): touch starts from `.grip` so the list still scrolls smoothly. */
  const startDrag = (e: React.PointerEvent, f: Place) => {
    if ((e.target as HTMLElement).closest('.cmp,.bell,.del,.alertbox')) return
    if (e.pointerType === 'mouse' ? e.button !== 0 : !(e.target as HTMLElement).closest('.grip')) return
    const x0 = e.clientX, y0 = e.clientY
    let active = false
    const target = (ev: PointerEvent) => (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return
      active = true
      ev.preventDefault()
      setDrag({ name: label(f), x: ev.clientX, y: ev.clientY })
      setOver(target(ev) ?? null)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (active) {
        const cat = target(ev)
        if (cat !== undefined && cat !== (f.cat ?? '')) setCatOf(f, cat)
        justDragged.current = true
        setTimeout(() => { justDragged.current = false }, 0)
      }
      setDrag(null)
      setOver(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const favRow = (f: Place) => {
    const k = label(f)
    const isCmp = cmpSel.includes(k)
    const hasTopicAlerts = !!f.alert?.length
    const isAlertExpanded = alertOpen === k
    return (
      <li key={k} className="favrow" style={{ flexWrap: 'wrap' }} onPointerDown={(e) => startDrag(e, f)}>
        <span className="grip" aria-hidden="true" title={t('category')}>⠿</span>
        <button className="favname" onClick={() => !justDragged.current && onOpenFav(f)}>
          {k}
          {unread[k] ? <b className="badge">+{unread[k]}</b> : null}
        </button>
        {favs.length >= 2 && (
          <button
            type="button"
            className={isCmp ? 'cmp on' : 'cmp'}
            onClick={() => toggleCmp(f)}
            title={t('compare')}
            aria-label={`${t('compare')} ${k}`}
            aria-pressed={isCmp}
          >
            ⇄
          </button>
        )}
        <button
          type="button"
          className={hasTopicAlerts || isAlertExpanded ? 'bell on' : 'bell'}
          onClick={() => setAlertOpen(isAlertExpanded ? null : k)}
          title={t('alerts')}
          aria-label={`${t('alerts')} ${k}`}
          aria-expanded={isAlertExpanded}
        >
          🔔{hasTopicAlerts ? ` ${f.alert!.length}` : ''}
        </button>
        <button
          type="button"
          className="del"
          onClick={() => removeFav(f)}
          title={t('delFav')}
          aria-label={`${t('delFav')} ${k}`}
        >
          ×
        </button>
        {isAlertExpanded && (
          <div className="alertbox">
            <small>{t('alertTopics')}:</small>
            <div className="chips">
              <button type="button" className={!hasTopicAlerts ? 'chip on' : 'chip'} style={{ padding: '3px 7px' }} onClick={() => clearTopicAlert(f)}>
                {t('alertAll')}
              </button>
              {TOPICS.map((tp) => {
                const active = !!f.alert?.includes(tp.id)
                return (
                  <button
                    key={tp.id}
                    type="button"
                    className={active ? 'chip on' : 'chip'}
                    style={{ padding: '3px 7px' }}
                    onClick={() => toggleTopicAlert(f, tp.id)}
                  >
                    {t('t' + tp.id)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </li>
    )
  }

  const cmpPlaces = cmpSel.map((k) => favs.find((f) => label(f) === k)).filter((x): x is Place => !!x)

  return (
    <>
      {perm !== 'granted' && 'Notification' in window && (
        <div className="note">
          {perm === 'denied' ? t('notifyDenied') : t('notifyOff')}{' '}
          {perm !== 'denied' && (
            <button className="linkbtn" onClick={onEnableNotify}>
              {t('notifyEnable')}
            </button>
          )}
        </div>
      )}
      <div className="chips">
        <button className="chip on" style={{ padding: '4px 10px' }} disabled={!favs.length || mineBusy} onClick={onOpenMyPaper}>
          ▤ {mineBusy ? '…' : t('myPaper')}
        </button>
        {favs.length >= 2 && (
          <button
            className={cmpPlaces.length === 2 ? 'chip on' : 'chip'}
            style={{ padding: '4px 10px' }}
            disabled={cmpPlaces.length < 2}
            onClick={() => setCmpOpen(true)}
            title={t('compareHint')}
          >
            ⇄ {t('compare')}{cmpPlaces.length > 0 ? ` (${cmpPlaces.length}/2)` : ''}
          </button>
        )}
      </div>
      {favs.length >= 2 && cmpPlaces.length === 1 && <p className="muted small">{t('compareHint')}</p>}

      <div className="chips">
        <button className={!favCat ? 'chip on' : 'chip'} style={{ padding: '4px 8px' }} onClick={() => setFavCat('')}>
          {t('allCats')} ({favs.length})
        </button>
        {catNames.map((c) => (
          <span key={c} data-drop={c} className={`${favCat === c ? 'chip on' : 'chip'}${over === c ? ' over' : ''}`}>
            <button onClick={() => setFavCat(c)}>
              {c} ({favs.filter((f) => f.cat === c).length})
            </button>
            {confirmCat === c ? (
              <button className="x confirm" onClick={() => removeCat(c)} aria-label={`${t('delCat')} ${c}`}>
                ✓
              </button>
            ) : (
              <button className="x" onClick={() => setConfirmCat(c)} onBlur={() => setConfirmCat(null)} aria-label={`${t('delCat')} ${c}`}>
                ×
              </button>
            )}
          </span>
        ))}
        {drag && catNames.length > 0 && (
          <span data-drop="" className={`chip add${over === '' ? ' over' : ''}`}>
            {t('noCat')}
          </span>
        )}
        {newCat === null ? (
          <button className="chip add" onClick={() => setNewCat('')}>
            ＋ {t('newCat')}
          </button>
        ) : (
          <form
            className="chip"
            onSubmit={(e) => {
              e.preventDefault()
              const n = addCat(newCat)
              setNewCat(null)
              if (n) setFavCat(n)
            }}
          >
            <input
              autoFocus
              value={newCat}
              maxLength={30}
              placeholder={t('newCat')}
              aria-label={t('newCat')}
              onChange={(e) => setNewCat(e.target.value)}
              onBlur={() => !newCat && setNewCat(null)}
            />
          </form>
        )}
      </div>

      {favCat &&
        (() => {
          const q = quiet[favCat] ?? QUIET0
          const set = (p: Partial<Quiet>) => setQuietAndSave({ ...quiet, [favCat]: { ...q, ...p } })
          return (
            <div className="settings">
              <label className="row">
                <input type="checkbox" checked={q.on} onChange={(e) => set({ on: e.target.checked })} /> {t('quiet')}
              </label>
              {q.on && (
                <div className="row">
                  {t('quietFrom')} <input type="time" value={q.from} onChange={(e) => set({ from: e.target.value })} /> {t('quietTo')}{' '}
                  <input type="time" value={q.to} onChange={(e) => set({ to: e.target.value })} />
                </div>
              )}
            </div>
          )
        })()}

      {favs.length === 0 && <p className="muted">{t('noFavs')}</p>}
      {favCat ? (
        <ul className="hits">{favs.filter((f) => f.cat === favCat).map(favRow)}</ul>
      ) : (
        <>
          {catNames.map(
            (c) =>
              favs.some((f) => f.cat === c) && (
                <div key={c} data-drop={c} className={over === c ? 'over' : ''}>
                  <h4 className="cathead">{c}</h4>
                  <ul className="hits">{favs.filter((f) => f.cat === c).map(favRow)}</ul>
                </div>
              ),
          )}
          {favs.some((f) => !f.cat) && (
            <div {...(catNames.length > 0 ? { 'data-drop': '' } : {})} className={catNames.length > 0 && over === '' ? 'over' : ''}>
              {catNames.length > 0 && <h4 className="cathead">{t('uncat')}</h4>}
              <ul className="hits">{favs.filter((f) => !f.cat).map(favRow)}</ul>
            </div>
          )}
        </>
      )}

      <p className="muted small">{pushActive ? t('pushOn') : t('notifyHint')}</p>

      <div className="settings">
        <h4>{t('mySources')}</h4>
        {srcs.length > 0 && (
          <div className="row">
            {srcs.map((d) => (
              <span key={d} className="srcchip">
                <span style={{ padding: '2px 6px' }}>{d}</span>
                <button onClick={() => delSource(d)} aria-label={`${t('removeSource')} ${d}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            addSource()
          }}
        >
          <input value={srcDraft} onChange={(e) => setSrcDraft(e.target.value)} placeholder={t('addSource')} aria-label={t('addSource')} />
        </form>
      </div>

      {drag && (
        <div className="ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {drag.name}
        </div>
      )}

      {cmpOpen && cmpPlaces.length === 2 && <Compare key={cmpSel.join('|')} places={cmpPlaces} t={t} onClose={() => setCmpOpen(false)} />}
    </>
  )
}

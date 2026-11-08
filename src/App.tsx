import { useCallback, useEffect, useRef, useState } from 'react'
import { norm } from './areas'
import { type SavedArticle, loadSaved, toggleSavedItem } from './bookmarks'
import { exportClipCard } from './clipCard'
import FavsPanel from './FavsPanel'
import { Flag } from './Flags'
import { LANGS, type Lang, loadLang, saveLang, tr } from './i18n'
import { ProgressBox, Report, TimeTravel, TopicBar } from './Insights'
import {
  type Article,
  type Place,
  fetchReaderPreview,
  forum,
  inQuiet,
  label,
  loadCats,
  loadFavs,
  loadLast,
  loadQuiet,
  loadSources,
  news,
  reverse,
  saveCats,
  saveFavs,
  saveLast,
  saveQuiet,
  saveSources,
  search,
  syncPushSubscription,
  translate,
} from './lib'
import { type MapMode, loadMapMode, saveMapMode } from './mapStyle'
import { type Street, streets } from './overpass'
import Paper from './Paper'
import { topicsOf } from './topics'
import Trending from './Trending'
import { encodePlace, readHashPlace } from './urlState'
import { type SheetSnap, useGlobe } from './useGlobe'
import { type LocalWeather, fetchWeather } from './weather'
import './index.css'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const same = (a: Place, b: Place) => label(a) === label(b)
const ago = (d: Date, lang: Lang) => {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000))
  const f = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  return m < 60 ? f.format(-m, 'minute') : m < 1440 ? f.format(-Math.round(m / 60), 'hour') : f.format(-Math.round(m / 1440), 'day')
}

export default function App() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Place[]>([])
  const [searched, setSearched] = useState(false)
  const [locating, setLocating] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const [level, setLevel] = useState(0)
  const [res, setRes] = useState<{ articles: Article[]; scope: string; query: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedPct, setFeedPct] = useState(20)
  const [err, setErr] = useState('')
  const [favs, setFavs] = useState<Place[]>(loadFavs)
  const [saved, setSaved] = useState<SavedArticle[]>(loadSaved)
  const [lang, setLang] = useState<Lang>(loadLang)
  const langRef = useRef(lang)
  const [mapMode, setMapMode] = useState<MapMode>(loadMapMode)
  const [tick, setTick] = useState(0)
  const [stamp, setStamp] = useState<Date | null>(null)
  const shown = useRef('')
  const [tab, setTab] = useState<'news' | 'forum' | 'saved' | 'favs'>('news')
  const [paperOpen, setPaperOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [newsFilter, setNewsFilter] = useState('')
  const [sortBy, setSortBy] = useState<'new' | 'hot'>('new')
  const [months, setMonths] = useState(0)
  const [mine, setMine] = useState<Article[] | null>(null)
  const [mineBusy, setMineBusy] = useState(false)
  const [quiet, setQuiet] = useState(loadQuiet)
  const [srcs, setSrcs] = useState<string[]>(loadSources)
  const [copied, setCopied] = useState(false)
  const [offline, setOffline] = useState(false)
  const [cats, setCats] = useState<string[]>(loadCats)
  const [freshArts, setFreshArts] = useState<Record<string, Article[]>>({})
  const [only, setOnly] = useState<{ key: string; items: Article[] } | null>(null)
  const [expandedAlso, setExpandedAlso] = useState<Record<string, boolean>>({})
  const [readerOpen, setReaderOpen] = useState<Record<string, boolean>>({})
  const [readerData, setReaderData] = useState<Record<string, { loading?: boolean; summary?: string; image?: string }>>({})
  const [wxState, setWxState] = useState<{ key: string; data: LocalWeather } | null>(null)
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const [pushActive, setPushActive] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half')
  const sheetDrag = useRef<{ y0: number; moved: boolean } | null>(null)

  const [bootDate] = useState(() => new Date())
  const [streetState, setStreetState] = useState<{ areaName: string; list: Street[] } | null>(null)
  const [loadingStreets, setLoadingStreets] = useState(false)
  const [sf, setSf] = useState('')
  const [streetsOpen, setStreetsOpen] = useState(false)
  const searchAbort = useRef<AbortController | null>(null)
  const popNavRef = useRef(false)

  const t = useCallback((k: Parameters<typeof tr>[1], v?: Record<string, string>) => tr(lang, k, v), [lang])
  const te = (m: string) => tr(lang, m.startsWith('err.') ? (m as Parameters<typeof tr>[1]) : 'err.source')
  const unread = Object.fromEntries(Object.entries(freshArts).map(([k, v]) => [k, v.length]))
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0)
  const refDate = stamp ?? bootDate
  const formattedDate = new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(refDate)

  const handleSelectFromMap = useCallback((p: Place, initialLevel = 0) => {
    setOnly(null)
    setTopic('')
    setNewsFilter('')
    setMonths(0)
    setExpandedAlso({})
    setReaderOpen({})
    setSf('')
    setErr('')
    setRes(null)
    setFeedPct(15)
    setBusy(true)
    setFreshArts((u) => {
      const k = label(p)
      if (!u[k]) return u
      const { [k]: _, ...rest } = u
      return rest
    })
    setPlace(p)
    setLevel(initialLevel)
    setHits([])
    setSearched(false)
    setTab((x) => (x === 'favs' || x === 'saved' ? 'news' : x))
  }, [])

  const handlePinClick = useCallback((pinName: string) => {
    setTab('news')
    setNewsFilter((cur) => (norm(cur) === norm(pinName) ? '' : pinName))
  }, [])

  const { boxRef, area, areaProgress, cancelAreas, heatEntries, pickOnGlobe, focusCrumb, focusStreet, updateHeat } = useGlobe({
    lang,
    mapMode,
    sheetSnap,
    activePinName: newsFilter,
    onSelectPlace: handleSelectFromMap,
    onPinClick: handlePinClick,
    onError: setErr,
  })

  const changeMapMode = (m: MapMode) => {
    setMapMode(m)
    saveMapMode(m)
  }

  // Fetch Open-Meteo local weather for selected place
  const placeWxKey = place ? `${place.lat.toFixed(2)},${place.lon.toFixed(2)}` : ''
  const currentWeather = wxState?.key === placeWxKey ? wxState.data : null

  useEffect(() => {
    if (!place) return
    const ctrl = new AbortController()
    const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`
    fetchWeather(place.lat, place.lon, ctrl.signal).then((w) => {
      if (!ctrl.signal.aborted && w) setWxState({ key, data: w })
    })
    return () => ctrl.abort()
  }, [place])

  // Sync URL `#p=...` & browser Back/Forward navigation
  useEffect(() => {
    if (!place) return
    if (popNavRef.current) {
      popNavRef.current = false
      return
    }
    const nextHash = `#p=${encodePlace(place, level)}`
    if (location.hash !== nextHash) {
      window.history.pushState(null, '', `${location.pathname}${location.search}${nextHash}`)
    }
  }, [place, level])

  useEffect(() => {
    const onPopState = () => {
      const route = readHashPlace(location.hash)
      if (!route) return
      popNavRef.current = true
      pickOnGlobe(route.place, true, route.level ?? 0)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [pickOnGlobe])

  // PWA install prompt listener
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const streetList = area && streetState?.areaName === area.properties.name ? streetState.list : null

  useEffect(() => {
    if (!area || !streetsOpen || streetList) return
    const ctrl = new AbortController()
    const targetName = area.properties.name
    Promise.resolve()
      .then(() => {
        if (!ctrl.signal.aborted) setLoadingStreets(true)
        return streets(area, ctrl.signal)
      })
      .then((r) => !ctrl.signal.aborted && setStreetState({ areaName: targetName, list: r }))
      .catch(() => !ctrl.signal.aborted && setErr('err.areas'))
      .finally(() => !ctrl.signal.aborted && setLoadingStreets(false))
    return () => ctrl.abort()
  }, [area, streetsOpen, streetList])

  useEffect(() => {
    langRef.current = lang
    saveLang(lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) NewzLocal` : 'NewzLocal'
  }, [totalUnread])

  // Load news / forum feed with full AbortController cancellation
  useEffect(() => {
    if (!place || tab === 'favs' || tab === 'saved') return
    const ctrl = new AbortController()
    const key = `${place.lat},${place.lon},${level},${lang},${tab},${months}`
    const fresh = shown.current !== key
    shown.current = key
    let ver = 0
    let renderedVer = 0
    const show = async (r: { articles: Article[]; scope: string; query: string }) => {
      const mineVer = ++ver
      const articles = await translate(r.articles, lang, ctrl.signal)
      if (!ctrl.signal.aborted && mineVer >= renderedVer) {
        renderedVer = mineVer
        setRes((prev) => ({
          ...r,
          articles:
            fresh || !prev || tab === 'forum'
              ? articles
              : [...new Map([...prev.articles, ...articles].map((x) => [x.url, x])).values()].sort((x, y) => +y.date - +x.date).slice(0, 100),
        }))
        setStamp(new Date())
        setBusy(false)
        setOffline(false)
        if (tab === 'news' && months === 0) saveLast(`${label(place)}|${level}|${lang}`, articles)
      }
    }
    const run = async () => {
      if (fresh) {
        setFeedPct(15)
        setBusy(true)
        setRes(null)
      }
      setErr('')
      const out =
        tab === 'forum'
          ? await forum(place, level, 100, (r) => r.articles.length && void show(r), ctrl.signal, setFeedPct)
          : await news(place, level, 100, fresh, (r) => r.articles.length && void show(r), months, ctrl.signal, setFeedPct)
      await show(out)
    }

    run()
      .catch((x: Error) => {
        if (ctrl.signal.aborted || x.name === 'AbortError') return
        const saved = tab === 'news' && months === 0 ? loadLast(`${label(place)}|${level}|${lang}`) : null
        if (saved?.length) {
          setRes({ articles: saved, scope: place.parts[level]?.name ?? place.parts[0].name, query: '' })
          setOffline(true)
        } else {
          setErr(x.message)
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setBusy(false)
      })
    return () => ctrl.abort()
  }, [place, level, lang, tick, tab, months])

  // Update news heat overlay & geo-tagged story pins on map
  useEffect(() => {
    updateHeat(res?.articles, tab === 'news', streetList)
  }, [res, tab, streetList, updateHeat])

  // Poll every minute while visible
  useEffect(() => {
    const bump = () => document.visibilityState === 'visible' && setTick((n) => n + 1)
    const id = setInterval(bump, 60_000)
    document.addEventListener('visibilitychange', bump)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [])

  // Sync background Web Push subscription when configured & granted
  useEffect(() => {
    if (perm !== 'granted') return
    void syncPushSubscription(favs, lang, quiet).then(setPushActive)
  }, [favs, lang, quiet, perm])

  // In-tab favourite alerts
  useEffect(() => {
    if (!favs.length) return
    const ctrl = new AbortController()
    const check = async () => {
      let seen: Record<string, string[]> = {}
      try { seen = JSON.parse(localStorage.getItem('newzlocal.seen') ?? '{}') } catch { /* start over */ }
      for (const f of favs.slice(0, 10)) {
        if (ctrl.signal.aborted) return
        try {
          const key = label(f)
          const { articles } = await news(f, 0, 10, false, undefined, 0, ctrl.signal)
          const old = seen[key]
          const newOnes = old ? articles.filter((a) => !old.includes(a.url)) : []
          const fresh = f.alert?.length ? newOnes.filter((a) => topicsOf(a.orig ?? a.title).some((id) => f.alert!.includes(id))) : newOnes
          seen[key] = [...new Set([...articles.map((a) => a.url), ...(old ?? [])])].slice(0, 200)
          if (fresh.length) setFreshArts((u) => ({ ...u, [key]: [...fresh, ...(u[key] ?? [])].slice(0, 50) }))
          if (fresh.length && !pushActive && 'Notification' in window && Notification.permission === 'granted' && !inQuiet(f.cat ? loadQuiet()[f.cat] : undefined)) {
            const [first] = await translate([fresh[0]], langRef.current, ctrl.signal)
            const n = new Notification(key, {
              body: fresh.length > 1 ? `${first.title} (+${fresh.length - 1})` : first.title,
              tag: key,
              renotify: true,
            } as NotificationOptions)
            n.onclick = () => {
              window.focus()
              pickOnGlobe(f, true)
            }
          }
        } catch { /* retry next round */ }
        await new Promise((x) => setTimeout(x, 2000))
      }
      try { localStorage.setItem('newzlocal.seen', JSON.stringify(seen)) } catch { /* private mode */ }
    }
    void check()
    const id = setInterval(check, 60_000)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [favs, pickOnGlobe, pushActive])

  const openFav = (f: Place) => {
    const key = label(f)
    const items = freshArts[key]
    pickOnGlobe(f, true)
    if (!items?.length) return
    setOnly({ key, items })
    translate(items, langRef.current).then((a) => setOnly((o) => (o && o.key === key ? { key, items: a } : o)))
  }

  const sharePlace = async () => {
    if (!place) return
    const url = `${location.origin}${location.pathname}#p=${encodePlace(place, level)}`
    try {
      if (navigator.share) await navigator.share({ title: `NewzLocal · ${label(place)}`, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* user dismissed share sheet */ }
  }

  const locateMe = () => {
    if (!('geolocation' in navigator) || locating) return
    setLocating(true)
    setErr('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const p = await reverse(pos.coords.latitude, pos.coords.longitude, lang)
          if (p) pickOnGlobe(p, true)
          else setErr('err.place')
        } catch (x) {
          setErr((x as Error).message)
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        setErr('err.geo')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const openMyPaper = async () => {
    if (!favs.length || mineBusy) return
    setMineBusy(true)
    try {
      const lists = await Promise.all(
        favs.slice(0, 8).map(async (f) =>
          (await news(f, 0, 15, false).catch(() => ({ articles: [] as Article[] }))).articles.map((a) => ({
            ...a,
            source: `${label(f)} · ${a.source}`,
          })),
        ),
      )
      const all = [...new Map(lists.flat().map((a) => [a.url, a])).values()].sort((a, b) => +b.date - +a.date).slice(0, 100)
      setMine(await translate(all, lang))
    } finally {
      setMineBusy(false)
    }
  }

  const onCrumb = (idx: number) => {
    if (!place) return
    setLevel(idx)
    setNewsFilter('')
    focusCrumb(place, idx)
  }

  const doSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!q.trim()) return
    searchAbort.current?.abort()
    const ctrl = new AbortController()
    searchAbort.current = ctrl
    try {
      setErr('')
      const h = await search(q, lang, ctrl.signal)
      if (!ctrl.signal.aborted) {
        setHits(h)
        setSearched(h.length === 0)
      }
    } catch (x) {
      if ((x as Error).name !== 'AbortError') setErr((x as Error).message)
    }
  }

  const toggleReader = (a: Article) => {
    const nextOpen = !readerOpen[a.url]
    setReaderOpen((prev) => ({ ...prev, [a.url]: nextOpen }))
    if (!nextOpen) return
    const key = `${lang}|${a.url}`
    if (readerData[key]) return
    setReaderData((prev) => ({ ...prev, [key]: { loading: true, summary: a.summary, image: a.image } }))
    fetchReaderPreview(a, lang).then((info) => {
      setReaderData((prev) => ({ ...prev, [key]: { loading: false, ...info } }))
    })
  }

  const toggleBookmark = (a: Article) => {
    const pName = place ? (place.parts[level]?.name ?? place.parts[0].name) : ''
    setSaved((prev) =>
      toggleSavedItem(prev, {
        url: a.url,
        title: a.title,
        orig: a.orig,
        source: a.source,
        dateIso: a.date.toISOString(),
        placeName: pName,
        summary: readerData[`${lang}|${a.url}`]?.summary ?? a.summary,
        image: readerData[`${lang}|${a.url}`]?.image ?? a.image,
      }),
    )
  }

  const handleClipStory = (a: Article, customPlace?: string) => {
    const pName = customPlace ?? (place ? (place.parts[level]?.name ?? place.parts[0].name) : 'NewzLocal')
    const sum = readerData[`${lang}|${a.url}`]?.summary ?? a.summary
    void exportClipCard({
      title: a.title,
      summary: sum,
      source: a.source,
      place: pName,
      dateStr: new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(a.date),
      url: a.url,
    })
  }

  const isFav = !!place && favs.some((f) => same(f, place))
  const commitFavs = (n: Place[]) => {
    setFavs(n)
    saveFavs(n)
  }
  const toggleFav = () => {
    if (!place) return
    if (!isFav && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
        .then(setPerm)
        .catch(() => {})
    }
    commitFavs(isFav ? favs.filter((f) => !same(f, place)) : [...favs, place])
  }

  const cycleSheet = () => setSheetSnap((s) => (s === 'half' ? 'full' : s === 'full' ? 'peek' : 'half'))

  const onlyNew = !!only && !!place && only.key === label(place) && level === 0 && tab === 'news'
  const savedUrlSet = new Set(saved.map((s) => s.url))

  const visibleArticles = (() => {
    const base = (onlyNew ? only!.items : res?.articles) ?? []
    const qNorm = norm(newsFilter)
    const filtered = base.filter((a) => {
      if (topic && tab === 'news' && !topicsOf(a.orig ?? a.title).includes(topic)) return false
      if (qNorm) {
        const hay = norm(`${a.title} ${a.orig ?? ''} ${a.source} ${a.summary ?? ''}`)
        if (!hay.includes(qNorm)) return false
      }
      return true
    })
    if (sortBy === 'hot') {
      return [...filtered].sort((a, b) => (b.also?.length ?? 0) - (a.also?.length ?? 0) || +b.date - +a.date)
    }
    return filtered
  })()

  return (
    <div className="app">
      <div ref={boxRef} className="map" />

      {/* Floating Map Mode Switcher (Satellite / Broadsheet Paper Map / Night Map) */}
      <div className="mapmodes" role="group" aria-label="Map style">
        {(['sat', 'paper', 'dark'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={mapMode === m ? 'on' : ''}
            onClick={() => changeMapMode(m)}
            aria-pressed={mapMode === m}
          >
            {t(m === 'sat' ? 'mapSat' : m === 'paper' ? 'mapPaper' : 'mapDark')}
          </button>
        ))}
      </div>

      <aside className={`panel snap-${sheetSnap}`}>
        <button
          type="button"
          className="sheet-handle"
          aria-label={t('sheetToggle')}
          onClick={() => !sheetDrag.current?.moved && cycleSheet()}
          onPointerDown={(e) => {
            sheetDrag.current = { y0: e.clientY, moved: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (sheetDrag.current && Math.abs(e.clientY - sheetDrag.current.y0) > 10) sheetDrag.current.moved = true
          }}
          onPointerUp={(e) => {
            const d = sheetDrag.current
            if (d?.moved) {
              const dy = e.clientY - d.y0
              if (dy < -35) setSheetSnap((s) => (s === 'peek' ? 'half' : 'full'))
              else if (dy > 35) setSheetSnap((s) => (s === 'full' ? 'half' : 'peek'))
            }
            setTimeout(() => { sheetDrag.current = null }, 0)
          }}
        >
          <span />
        </button>

        <header>
          <div className="dateline">
            <span>{formattedDate}</span>
            <div className="head-actions">
              {installPrompt && (
                <button
                  type="button"
                  className="paperbtn installbtn"
                  onClick={() => {
                    void installPrompt.prompt()
                    void installPrompt.userChoice.then(() => setInstallPrompt(null))
                  }}
                  title={t('install')}
                  aria-label={t('install')}
                >
                  ↓
                </button>
              )}
              <button
                type="button"
                className="paperbtn"
                onClick={() => setPaperOpen(true)}
                disabled={!res?.articles.length || tab === 'favs' || tab === 'saved'}
                title={t('paper')}
                aria-label={t('paper')}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5zM17 8h3v9a2 2 0 0 1-2 2M7 8h7M7 11h7M7 14h4" />
                </svg>
              </button>
            </div>
          </div>
          <h1>NewzLocal</h1>
          <div className="langs" role="group" aria-label={t('language')}>
            {LANGS.map((l) => (
              <button key={l.code} className={l.code === lang ? 'on' : ''} title={l.name} aria-label={l.name} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>
                <Flag code={l.flag} />
              </button>
            ))}
          </div>
        </header>

        <form className="searchbar" onSubmit={doSearch}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('searchLabel')} />
          {'geolocation' in navigator && (
            <button
              type="button"
              className="locbtn"
              onClick={locateMe}
              disabled={locating}
              title={locating ? t('locating') : t('nearMe')}
              aria-label={t('nearMe')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </button>
          )}
        </form>
        {locating && <p className="muted small">{t('locating')}</p>}
        {searched && <p className="muted">{t('noResults')}</p>}
        {hits.length > 0 && (
          <ul className="hits">
            {hits.map((h) => (
              <li key={label(h)}>
                <button onClick={() => pickOnGlobe(h, true)}>{label(h)}</button>
              </li>
            ))}
          </ul>
        )}

        <nav className="tabs tabs4">
          <button className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}>{t('news')}</button>
          <button className={tab === 'forum' ? 'on' : ''} onClick={() => setTab('forum')}>{t('forum')}</button>
          <button className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}>
            {t('savedTab')} ({saved.length})
          </button>
          <button className={tab === 'favs' ? 'on' : ''} onClick={() => setTab('favs')}>
            {t('favs')} ({favs.length})
            {totalUnread > 0 && <b className="badge">+{totalUnread}</b>}
          </button>
        </nav>

        {err && <p className="err">{te(err)}</p>}
        {areaProgress && (
          <ProgressBox
            key={`area-${areaProgress.id}-${areaProgress.step}`}
            label={t('areas')}
            detail={t(areaProgress.step === 1 ? 'areaStep1' : areaProgress.step === 2 ? 'areaStep2' : areaProgress.step === 3 ? 'areaStep3' : 'areaStep3')}
            pct={areaProgress.pct}
            estTotalSec={areaProgress.estSec}
            onCancel={cancelAreas}
            t={t}
          />
        )}

        {tab === 'favs' ? (
          <FavsPanel
            favs={favs}
            commitFavs={commitFavs}
            cats={cats}
            setCatsAndSave={(n) => { setCats(n); saveCats(n) }}
            quiet={quiet}
            setQuietAndSave={(n) => { setQuiet(n); saveQuiet(n) }}
            srcs={srcs}
            setSrcsAndSave={(n) => { setSrcs(n); saveSources(n) }}
            unread={unread}
            perm={perm}
            onEnableNotify={() => {
              Notification.requestPermission().then((p) => {
                setPerm(p)
                if (p === 'granted') new Notification('NewzLocal', { body: t('notifyOn') })
              })
            }}
            pushActive={pushActive}
            mineBusy={mineBusy}
            onOpenMyPaper={openMyPaper}
            onOpenFav={openFav}
            t={t}
          />
        ) : tab === 'saved' ? (
          saved.length === 0 ? (
            <p className="muted">{t('noSaved')}</p>
          ) : (
            <ol className="news">
              {saved.map((s, i) => {
                const asArt: Article = {
                  url: s.url,
                  title: s.title,
                  orig: s.orig,
                  source: s.source,
                  date: new Date(s.dateIso),
                  summary: s.summary,
                  image: s.image,
                }
                return (
                  <li key={s.url} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                    <b className="no">{String(i + 1).padStart(2, '0')}</b>
                    <div className="storybody">
                      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                      {s.summary && <p className="reader-sum">{s.summary}</p>}
                      <small className="storymeta">
                        <span>
                          {s.placeName ? `${s.placeName} · ` : ''}{s.source} · {ago(new Date(s.dateIso), lang)}
                        </span>
                        <span className="storytools">
                          <button type="button" className="toolbtn" title={t('clipStory')} aria-label={t('clipStory')} onClick={() => handleClipStory(asArt, s.placeName)}>
                            ✂
                          </button>
                          <button
                            type="button"
                            className="toolbtn on"
                            title={t('delFav')}
                            aria-label={t('delFav')}
                            onClick={() => setSaved((prev) => toggleSavedItem(prev, s))}
                          >
                            ★
                          </button>
                        </span>
                      </small>
                    </div>
                  </li>
                )
              })}
            </ol>
          )
        ) : !place ? (
          <>
            <p className="muted">{t('hint')}</p>
            <Trending lang={lang} onPick={(p) => pickOnGlobe(p, true)} t={t} />
          </>
        ) : (
          <>
            <div className="crumbs">
              {[...place.parts].reverse().map((p, i, a) => {
                const idx = a.length - 1 - i
                return (
                  <button key={`${p.level}-${p.name}`} className={idx === level ? 'c on' : 'c'} onClick={() => onCrumb(idx)}>
                    {p.name}
                  </button>
                )
              })}
              {currentWeather && (
                <span className={currentWeather.severe ? 'wx severe' : 'wx'} title={`${currentWeather.windMs} m/s`}>
                  {currentWeather.icon} {currentWeather.tempC}°C
                  {currentWeather.severe ? ` · ⚠ ${t('severeWx')}` : ''}
                </span>
              )}
              <button className="fav share" onClick={sharePlace} aria-label={t('share')} title={copied ? t('copied') : t('share')}>
                {copied ? (
                  '✓'
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" />
                    <path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" />
                  </svg>
                )}
              </button>
              <button className="fav" onClick={toggleFav} aria-label={t('favorite')} aria-pressed={isFav}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />
                </svg>
              </button>
            </div>

            {area && (
              <details className="streets" open={streetsOpen} onToggle={(e) => setStreetsOpen(e.currentTarget.open)}>
                <summary>{t('streets')}{streetList ? ` (${streetList.length})` : ''}</summary>
                {loadingStreets && <p className="muted">{t('loadingStreets')}</p>}
                {streetList && (
                  <>
                    <input value={sf} onChange={(e) => setSf(e.target.value)} placeholder={t('streetFilter')} aria-label={t('streetFilter')} />
                    <ul className="hits">
                      {streetList
                        .filter((x) => norm(x.name).includes(norm(sf)))
                        .slice(0, 100)
                        .map((x) => (
                          <li key={x.name}>
                            <button onClick={() => place && focusStreet(place, x)}>{x.name}</button>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </details>
            )}

            {tab === 'news' && <TimeTravel months={months} setMonths={setMonths} t={t} />}
            {months > 0 && <p className="note">{t('archiveNote', { when: t(months === 1 ? 't1m' : months === 3 ? 't3m' : months === 6 ? 't6m' : 't1y').toLowerCase() })}</p>}
            {offline && <p className="offline">{t('offline')}</p>}
            {busy && <ProgressBox key={`feed-${place.lat}-${place.lon}-${level}-${tab}-${months}`} label={t('loading')} pct={feedPct} estTotalSec={5} t={t} />}
            {stamp && !busy && (
              <p className="live">
                {t('updated', { time: stamp.toLocaleTimeString(lang, { timeStyle: 'short' }) })} · {visibleArticles.length}/{res?.articles.length ?? 0}
              </p>
            )}
            {onlyNew && (
              <p className="note">
                {t('newOnly', { n: String(only!.items.length) })}{' '}
                <button className="linkbtn" onClick={() => setOnly(null)}>{t('showAll')}</button>
              </p>
            )}
            {!onlyNew && res && res.articles.length === 0 && <p className="muted">{t(tab === 'forum' ? 'noForum' : 'none')}</p>}
            {tab === 'news' && res && !onlyNew && (
              <TopicBar articles={res.articles.map((a) => ({ ...a, title: a.orig ?? a.title }))} topic={topic} setTopic={setTopic} t={t} />
            )}
            {tab === 'news' && res && !onlyNew && months === 0 && <Report articles={res.articles} scope={res.scope} areas={heatEntries} nowMs={+refDate} t={t} />}

            {/* In-list search filter + Newest / Most-covered sort bar */}
            {res && res.articles.length > 0 && (
              <div className="filterbar">
                <div className="filterinput">
                  <input
                    value={newsFilter}
                    onChange={(e) => setNewsFilter(e.target.value)}
                    placeholder={t('filterNews')}
                    aria-label={t('filterNews')}
                  />
                  {newsFilter && (
                    <button type="button" onClick={() => setNewsFilter('')} aria-label="×">
                      ×
                    </button>
                  )}
                </div>
                <div className="sortbtns" role="group">
                  <button type="button" className={sortBy === 'new' ? 'chip on' : 'chip'} onClick={() => setSortBy('new')}>
                    {t('sortNew')}
                  </button>
                  <button type="button" className={sortBy === 'hot' ? 'chip on' : 'chip'} onClick={() => setSortBy('hot')}>
                    {t('sortHot')}
                  </button>
                </div>
              </div>
            )}

            <ol className="news">
              {visibleArticles.map((a, i) => {
                const isExp = !!expandedAlso[a.url]
                const isReader = !!readerOpen[a.url]
                const rInfo = readerData[`${lang}|${a.url}`]
                const isSaved = savedUrlSet.has(a.url)
                const previewSum = rInfo?.summary ?? a.summary
                const previewImg = rInfo?.image ?? a.image
                return (
                  <li key={a.url} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                    <b className="no">{String(i + 1).padStart(2, '0')}</b>
                    <div className="storybody">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.orig && a.orig !== a.title ? a.orig : undefined}>
                        {a.title}
                      </a>
                      <small className="storymeta">
                        <span>
                          {a.forum ? '◆ ' : ''}
                          {a.source} · {a.approx ? '≈ ' : ''}
                          {ago(a.date, lang)}
                          {!!a.also?.length && (
                            <>
                              {' · '}
                              <button
                                type="button"
                                className="also-btn"
                                onClick={() => setExpandedAlso((prev) => ({ ...prev, [a.url]: !prev[a.url] }))}
                                aria-expanded={isExp}
                              >
                                {t('moreSources', { n: String(a.also.length) })}
                              </button>
                            </>
                          )}
                        </span>
                        <span className="storytools">
                          <button
                            type="button"
                            className={isReader ? 'toolbtn on' : 'toolbtn'}
                            onClick={() => toggleReader(a)}
                            aria-expanded={isReader}
                            title="Reader"
                          >
                            {isReader ? '▴' : '▾'}
                          </button>
                          <button
                            type="button"
                            className="toolbtn"
                            onClick={() => handleClipStory(a)}
                            title={t('clipStory')}
                            aria-label={t('clipStory')}
                          >
                            ✂
                          </button>
                          <button
                            type="button"
                            className={isSaved ? 'toolbtn on' : 'toolbtn'}
                            onClick={() => toggleBookmark(a)}
                            title={t('saveStory')}
                            aria-label={t('saveStory')}
                            aria-pressed={isSaved}
                          >
                            {isSaved ? '★' : '☆'}
                          </button>
                        </span>
                      </small>

                      {isReader && (
                        <div className="reader-card">
                          {previewImg && (
                            <img
                              src={previewImg}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                          )}
                          {rInfo?.loading ? (
                            <p className="muted small">{t('loading')}</p>
                          ) : previewSum ? (
                            <p className="reader-sum">{previewSum}</p>
                          ) : (
                            <p className="muted small">{t('noPreview')}</p>
                          )}
                          <a className="reader-link" href={a.url} target="_blank" rel="noopener noreferrer">
                            {t('readFull', { s: a.source || 'source' })}
                          </a>
                        </div>
                      )}

                      {isExp && a.also && (
                        <ul className="also-list">
                          {a.also.map((sub) => (
                            <li key={sub.url}>
                              <a href={sub.url} target="_blank" rel="noopener noreferrer" title={sub.orig && sub.orig !== sub.title ? sub.orig : undefined}>
                                {sub.title}
                              </a>
                              <span>{sub.source} · {ago(sub.date, lang)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </>
        )}
        <footer>{t('footer')}</footer>
      </aside>

      {mine && (
        <Paper
          articles={mine}
          place={t('myPaperPlace')}
          date={formattedDate}
          pageWord={t('page')}
          tabName={t('myPaper')}
          clipLabel={t('clipStory')}
          ago={(d) => ago(d, lang)}
          onClip={(a) => handleClipStory(a, t('myPaperPlace'))}
          onClose={() => setMine(null)}
        />
      )}
      {paperOpen && res && (
        <Paper
          articles={visibleArticles.length ? visibleArticles : res.articles}
          place={place ? label(place) : ''}
          date={formattedDate}
          pageWord={t('page')}
          tabName={t(tab === 'forum' ? 'forum' : 'news')}
          clipLabel={t('clipStory')}
          ago={(d) => ago(d, lang)}
          onClip={(a) => handleClipStory(a)}
          onClose={() => setPaperOpen(false)}
        />
      )}
    </div>
  )
}

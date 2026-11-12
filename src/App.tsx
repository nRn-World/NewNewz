import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BeforeInstallPromptEvent,
  canUseNotifications,
  getNotificationPerm,
  isNativeAndroidApp,
  isStandaloneApp,
  markInstallPromptDismissed,
  requestAppNotificationPermission,
  shouldAutoPromptInstall,
} from './androidBridge'
import { norm } from './areas'
import { type SavedArticle, loadSaved, toggleSavedItem } from './bookmarks'
import { exportClipCard } from './clipCard'
import { fullDate, mediumDate, timeAgo } from './dates'
import FavsPanel from './FavsPanel'
import { Flag } from './Flags'
import { LANGS, type Lang, loadLang, saveLang, tr } from './i18n'
import { ProgressBox, Report, TimeTravel, TopicBar } from './Insights'
import InstallPrompt from './InstallPrompt'
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
  rankImportantForum,
  rankMostCovered,
  reverse,
  saveCats,
  saveFavs,
  saveLast,
  saveQuiet,
  saveSources,
  search,
  showAppNotification,
  suggest,
  syncPushSubscription,
  translate,
} from './lib'
import type { MapMode } from './mapStyle'
import { type Street, streets } from './overpass'
import Paper from './Paper'
import { matchesTopic, topicsOf } from './topics'
import Trending from './Trending'
import { encodePlace, readHashPlace } from './urlState'
import { type SheetSnap, useGlobe } from './useGlobe'
import { type LocalWeather, fetchWeather } from './weather'
import './index.css'

type FeedState = { articles: Article[]; scope: string; query: string; exactCount?: number }

const same = (a: Place, b: Place) => label(a) === label(b)
const ago = (d: Date, lang: Lang) => timeAgo(d, lang)

export default function App() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Place[]>([])
  const [searched, setSearched] = useState(false)
  const [locating, setLocating] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const [level, setLevel] = useState(0)
  const [res, setRes] = useState<FeedState | null>(null)
  const [spotForum, setSpotForum] = useState<{ key: string; items: Article[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedPct, setFeedPct] = useState(20)
  const [err, setErr] = useState('')
  const [favs, setFavs] = useState<Place[]>(loadFavs)
  const [saved, setSaved] = useState<SavedArticle[]>(loadSaved)
  const [lang, setLang] = useState<Lang>(loadLang)
  const langRef = useRef(lang)
  const mapMode: MapMode = 'sat' // satellite only
  const [tick, setTick] = useState(0)
  const [stamp, setStamp] = useState<Date | null>(null)
  const shown = useRef('')
  const [tab, setTab] = useState<'news' | 'forum' | 'saved' | 'favs'>(() => {
    const initRoute = readHashPlace(location.hash)
    return initRoute?.tab ?? 'news'
  })
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
  const [perm, setPerm] = useState<string>(getNotificationPerm)
  const [pushActive, setPushActive] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__deferredInstallPrompt ?? null : null,
  )
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half')
  const sheetDrag = useRef<{ y0: number; moved: boolean } | null>(null)

  const [bootDate] = useState(() => new Date())
  const [streetState, setStreetState] = useState<{ areaName: string; list: Street[] } | null>(null)
  const [loadingStreets, setLoadingStreets] = useState(false)
  const [sf, setSf] = useState('')
  const [streetsOpen, setStreetsOpen] = useState(false)
  const searchAbort = useRef<AbortController | null>(null)
  const popNavRef = useRef(false)
  const submittedQ = useRef('')
  const lastHashNav = useRef({ hash: '', at: 0 })
  const panelRef = useRef<HTMLElement>(null)

  const t = useCallback((k: Parameters<typeof tr>[1], v?: Record<string, string>) => tr(lang, k, v), [lang])
  const te = (m: string) => tr(lang, m.startsWith('err.') ? (m as Parameters<typeof tr>[1]) : 'err.source')
  const unread = Object.fromEntries(Object.entries(freshArts).map(([k, v]) => [k, v.length]))
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0)
  const refDate = stamp ?? bootDate
  const formattedDate = fullDate(refDate, lang)

  const handleSelectFromMap = useCallback((p: Place, initialLevel = 0) => {
    setOnly(null)
    setTopic('')
    setNewsFilter('')
    setSortBy('new')
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

  const { boxRef, area, areaProgress, cancelAreas, heatEntries, pickOnGlobe, focusCrumb, focusStreet, updateHeat, resetGlobe } = useGlobe({
    lang,
    mapMode,
    sheetSnap,
    activePinName: newsFilter,
    onSelectPlace: handleSelectFromMap,
    onPinClick: handlePinClick,
    onError: setErr,
  })

  /** Resets the entire view, URL, search input, overlays, and 3D globe back to the initial first-open start page. */
  const goHome = useCallback(
    (pushHistory = true) => {
      searchAbort.current?.abort()
      resetGlobe()
      shown.current = ''
      setQ('')
      setHits([])
      setSearched(false)
      setPlace(null)
      setLevel(0)
      setRes(null)
      setSpotForum(null)
      setBusy(false)
      setFeedPct(20)
      setErr('')
      setStamp(null)
      setOffline(false)
      setTab('news')
      setPaperOpen(false)
      setMine(null)
      setTopic('')
      setNewsFilter('')
      setSortBy('new')
      setMonths(0)
      setOnly(null)
      setExpandedAlso({})
      setReaderOpen({})
      setWxState(null)
      setStreetState(null)
      setLoadingStreets(false)
      setSf('')
      setStreetsOpen(false)
      setSheetSnap('half')
      panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      if (pushHistory && location.hash) {
        window.history.pushState(null, '', `${location.pathname}${location.search}`)
      }
    },
    [resetGlobe],
  )

  // Suggestions while typing (debounced); pressing Enter runs the fuller search instead
  useEffect(() => {
    const text = q.trim()
    if (text.length < 3 || submittedQ.current === text) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      suggest(text, lang, ctrl.signal)
        .then((h) => {
          if (ctrl.signal.aborted) return
          setHits(h)
          setSearched(false)
        })
        .catch(() => { /* typing-time lookups fail silently; Enter reports errors */ })
    }, 350)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, lang])

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

  // Sync URL `#p=...` & browser Back/Forward + Service Worker notification tap navigation
  useEffect(() => {
    if (!place) return
    if (popNavRef.current) {
      popNavRef.current = false
      return
    }
    const nextHash = `#p=${encodePlace(place, level)}`
    if (!location.hash.startsWith(nextHash)) {
      window.history.pushState(null, '', `${location.pathname}${location.search}${nextHash}`)
    }
  }, [place, level])

  useEffect(() => {
    const navigateToHash = (hashStr: string) => {
      if (!hashStr || hashStr === '#') {
        goHome(false)
        return
      }
      const route = readHashPlace(hashStr)
      if (!route) return
      // A notification tap reaches us twice (the service worker's message and the navigation it triggers);
      // opening the place once avoids fetching its whole feed twice.
      if (hashStr === lastHashNav.current.hash && Date.now() - lastHashNav.current.at < 1500) return
      lastHashNav.current = { hash: hashStr, at: Date.now() }
      popNavRef.current = true
      pickOnGlobe(route.place, true, route.level ?? 0)
      if (route.tab) setTab(route.tab)
    }
    const onPopState = () => navigateToHash(location.hash)
    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'OPEN_ALERT_PLACE' && typeof ev.data.url === 'string') {
        try {
          const u = new URL(ev.data.url, location.origin)
          if (u.hash) navigateToHash(u.hash)
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('popstate', onPopState)
    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    return () => {
      window.removeEventListener('popstate', onPopState)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [pickOnGlobe, goHome])

  // PWA / Android APK install prompt listener + automatic visit prompt
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      const bip = e as BeforeInstallPromptEvent
      window.__deferredInstallPrompt = bip
      setInstallPrompt(bip)
    }
    const onInstalled = () => {
      window.__deferredInstallPrompt = null
      setInstallPrompt(null)
      setInstallModalOpen(false)
    }
    window.__onAndroidNotifPerm = (state: string) => setPerm(state)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    const timer = shouldAutoPromptInstall()
      ? window.setTimeout(() => setInstallModalOpen(true), 650)
      : undefined

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
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
    document.title = totalUnread ? `(${totalUnread}) NewNewz` : 'NewNewz'
  }, [totalUnread])

  // Load news / forum feed with full AbortController cancellation & strict date sorting
  useEffect(() => {
    if (!place || tab === 'favs' || tab === 'saved') return
    const ctrl = new AbortController()
    const key = `${place.lat},${place.lon},${level},${lang},${tab},${months}`
    const fresh = shown.current !== key
    shown.current = key
    let ver = 0
    let renderedVer = 0
    const show = async (r: FeedState) => {
      const mineVer = ++ver
      const articles = await translate(r.articles, lang, ctrl.signal)
      if (!ctrl.signal.aborted && mineVer >= renderedVer) {
        renderedVer = mineVer
        setRes((prev) => {
          const combined =
            fresh || !prev || tab === 'forum'
              ? [...articles].sort((x, y) => +y.date - +x.date).slice(0, 100)
              : [...new Map([...prev.articles, ...articles].map((x) => [x.url, x])).values()].sort((x, y) => +y.date - +x.date).slice(0, 100)
          return {
            ...r,
            articles: combined,
            exactCount: r.exactCount ?? combined.filter((a) => a.exactMatch !== false).length,
          }
        })
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
        const cached = tab === 'news' && months === 0 ? loadLast(`${label(place)}|${level}|${lang}`) : null
        if (cached?.length) {
          setRes({ articles: cached, scope: place.parts[level]?.name ?? place.parts[0].name, query: '' })
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

  // Automatically fetch important Forum threads when a home address / street has 0 or few direct news articles
  const spotKey = place ? `${place.lat.toFixed(4)},${place.lon.toFixed(4)},${level},${lang}` : ''
  const needsForumSpotlight =
    !!place &&
    tab === 'news' &&
    months === 0 &&
    !!res &&
    (res.exactCount ?? res.articles.length) < 5
  const activeSpotItems = needsForumSpotlight && spotForum?.key === spotKey ? spotForum.items : null

  useEffect(() => {
    if (!needsForumSpotlight || !place || spotForum?.key === spotKey) return
    const ctrl = new AbortController()
    forum(place, level, 35, undefined, ctrl.signal)
      .then((r) => translate(rankImportantForum(r.articles, 6), lang, ctrl.signal))
      .then((items) => {
        if (!ctrl.signal.aborted) setSpotForum({ key: spotKey, items })
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSpotForum({ key: spotKey, items: [] })
      })
    return () => ctrl.abort()
  }, [needsForumSpotlight, place, level, lang, spotForum?.key, spotKey])

  // Update news heat overlay & geo-tagged story pins on map
  useEffect(() => {
    updateHeat(res?.articles, tab === 'news', streetList)
  }, [res, tab, streetList, updateHeat])

  // Poll twice a minute while visible
  useEffect(() => {
    const bump = () => document.visibilityState === 'visible' && setTick((n) => n + 1)
    const id = setInterval(bump, 30_000)
    document.addEventListener('visibilitychange', bump)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [])

  // Sync background Web Push / Native Android APK JobScheduler subscription when configured
  useEffect(() => {
    if (perm !== 'granted' && !isNativeAndroidApp()) return
    void syncPushSubscription(favs, lang, quiet).then(setPushActive)
  }, [favs, lang, quiet, perm])

  // In-tab favourite alerts (checks BOTH new News AND new Forum posts for saved addresses, districts, cities & countries)
  useEffect(() => {
    if (!favs.length) return
    const ctrl = new AbortController()
    let running = false
    const check = async () => {
      // With many favourites one round outlasts the minute between rounds; two overlapping rounds would each
      // write their own copy of the seen-list and alert about the same story twice.
      if (running) return
      running = true
      try {
        await checkOnce()
      } finally {
        running = false
      }
    }
    const checkOnce = async () => {
      let seen: Record<string, string[]> = {}
      try { seen = JSON.parse(localStorage.getItem('newnewz.seen') ?? '{}') } catch { /* start over */ }
      for (const f of favs.slice(0, 25)) {
        if (ctrl.signal.aborted) return
        try {
          const key = label(f)
          const wantNews = f.alertNews !== false
          const wantForum = f.alertForum !== false
          const [nOut, fOut] = await Promise.all([
            wantNews ? news(f, 0, 12, false, undefined, 0, ctrl.signal).catch(() => ({ articles: [] as Article[] })) : Promise.resolve({ articles: [] as Article[] }),
            wantForum ? forum(f, 0, 12, undefined, ctrl.signal).catch(() => ({ articles: [] as Article[] })) : Promise.resolve({ articles: [] as Article[] }),
          ])
          const combined = [...nOut.articles, ...fOut.articles].sort((a, b) => +b.date - +a.date)
          if (!combined.length) continue
          const old = seen[key]
          const newOnes = old ? combined.filter((a) => !old.includes(a.url)) : []
          const fresh = f.alert?.length
            ? newOnes.filter((a) => topicsOf(a.orig ?? a.title, a.police).some((id) => f.alert!.includes(id)))
            : newOnes
          seen[key] = [...new Set([...combined.map((a) => a.url), ...(old ?? [])])].slice(0, 250)
          if (fresh.length) setFreshArts((u) => ({ ...u, [key]: [...fresh, ...(u[key] ?? [])].slice(0, 50) }))
          if (
            fresh.length &&
            !pushActive &&
            canUseNotifications() &&
            getNotificationPerm() === 'granted' &&
            !inQuiet(f.cat ? loadQuiet()[f.cat] : undefined)
          ) {
            const [first] = await translate([fresh[0]], langRef.current, ctrl.signal)
            const deepUrl = `./#p=${encodePlace(f, 0)}${first.forum ? '&tab=forum' : ''}`
            const prefix = first.forum ? `💬 ${key}` : `📰 ${key}`
            await showAppNotification(
              prefix,
              fresh.length > 1 ? `${first.title} (+${fresh.length - 1})` : first.title,
              deepUrl,
              key,
            )
          }
        } catch { /* retry next round */ }
        await new Promise((x) => setTimeout(x, 1800))
      }
      try { localStorage.setItem('newnewz.seen', JSON.stringify(seen)) } catch { /* private mode */ }
    }
    void check()
    const id = setInterval(check, 60_000)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [favs, pushActive])

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
      if (navigator.share) await navigator.share({ title: `NewNewz · ${label(place)}`, url })
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
        favs.slice(0, 15).map(async (f) =>
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
    submittedQ.current = q.trim()
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
    const pName = customPlace ?? (place ? (place.parts[level]?.name ?? place.parts[0].name) : 'NewNewz')
    const sum = readerData[`${lang}|${a.url}`]?.summary ?? a.summary
    void exportClipCard({
      title: a.title,
      summary: sum,
      source: a.source,
      place: pName,
      dateStr: mediumDate(a.date, lang),
      url: a.url,
    })
  }

  const enableNotifications = () => {
    if (!canUseNotifications()) return
    requestAppNotificationPermission()
      .then((p) => {
        setPerm(p)
        if (p === 'granted') void showAppNotification('NewNewz', t('notifyOn'))
      })
      .catch(() => {})
  }

  const isFav = !!place && favs.some((f) => same(f, place))
  const commitFavs = (n: Place[]) => {
    setFavs(n)
    saveFavs(n)
  }
  const toggleFav = () => {
    if (!place) return
    if (!isFav && canUseNotifications() && getNotificationPerm() === 'default') {
      enableNotifications()
    }
    commitFavs(
      isFav
        ? favs.filter((f) => !same(f, place))
        : [...favs, { ...place, alertNews: true, alertForum: true }],
    )
  }

  const cycleSheet = () => setSheetSnap((s) => (s === 'half' ? 'full' : s === 'full' ? 'peek' : 'half'))

  const onlyNew = !!only && !!place && only.key === label(place) && level === 0 && tab === 'news'
  const savedUrlSet = new Set(saved.map((s) => s.url))

  const visibleArticles = (() => {
    const base = (onlyNew ? only!.items : res?.articles) ?? []
    const qNorm = norm(newsFilter)
    const filtered = base.filter((a) => {
      if (topic && tab === 'news' && !matchesTopic(topicsOf(`${a.title} ${a.orig ?? ''}`, a.police), topic)) return false
      if (qNorm) {
        const hay = norm(`${a.title} ${a.orig ?? ''} ${a.source} ${a.summary ?? ''} ${a.scopeTag ?? ''}`)
        if (!hay.includes(qNorm)) return false
      }
      return true
    })
    if (sortBy === 'hot') {
      return rankMostCovered(filtered, res?.scope ?? '')
    }
    // Strict chronological newest-first order (#01 is always the latest item)
    return [...filtered].sort((a, b) => +b.date - +a.date)
  })()

  const nearbyScope = res?.articles.find((a) => a.exactMatch === false)?.scopeTag

  return (
    <div className="app">
      <div ref={boxRef} className="map" />

      <aside ref={panelRef} className={`panel snap-${sheetSnap}`}>
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
              {!isStandaloneApp() && (
                <button
                  type="button"
                  className="paperbtn installbtn"
                  onClick={() => setInstallModalOpen(true)}
                  title={t('install')}
                  aria-label={t('install')}
                >
                  APK
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
          <h1>
            <a
              href={import.meta.env.BASE_URL}
              className="logo-link"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                goHome()
              }}
            >
              NewNewz
            </a>
          </h1>
          <div className="langs" role="group" aria-label={t('language')}>
            {LANGS.map((l) => (
              <button key={l.code} className={l.code === lang ? 'on' : ''} title={l.name} aria-label={l.name} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>
                <Flag code={l.flag} />
              </button>
            ))}
          </div>
        </header>

        <form className="searchbar" onSubmit={doSearch}>
          <input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setHits([]) }} placeholder={t('search')} aria-label={t('searchLabel')} />
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
            detail={t(areaProgress.step === 1 ? 'areaStep1' : areaProgress.step === 2 ? 'areaStep2' : 'areaStep3')}
            pct={areaProgress.pct}
            estTotalSec={areaProgress.estSec}
            onCancel={cancelAreas}
            t={t}
          />
        )}

        {tab === 'favs' ? (
          <FavsPanel
            lang={lang}
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
            onEnableNotify={enableNotifications}
            pushActive={pushActive}
            mineBusy={mineBusy}
            onOpenMyPaper={openMyPaper}
            onOpenFav={openFav}
            onOpenInstall={() => setInstallModalOpen(true)}
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
                            title={t('removeSource')}
                            aria-label={t('removeSource')}
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
            {tab === 'news' && nearbyScope && <p className="note">{t('nearbyNote', { p: res?.scope ?? '', scope: nearbyScope })}</p>}
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

            {/* Top Forum Spotlight when an address/place has 0 or sparse direct press articles */}
            {tab === 'news' && !onlyNew && activeSpotItems && activeSpotItems.length > 0 && (
              <section className="spotbox">
                <div className="spothead">
                  <b>💬 {t('forumSpotlight', { p: res?.scope ?? place.parts[level]?.name ?? '' })}</b>
                  <button type="button" className="linkbtn" onClick={() => setTab('forum')}>
                    {t('seeAllForum')}
                  </button>
                </div>
                <ul className="spotlist">
                  {activeSpotItems.map((fa) => (
                    <li key={fa.url}>
                      <a href={fa.url} target="_blank" rel="noopener noreferrer">
                        {fa.title}
                      </a>
                      <small>
                        {fa.source} · {ago(fa.date, lang)}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!onlyNew && res && res.articles.length === 0 && (!activeSpotItems || activeSpotItems.length === 0) && (
              <p className="muted">{t(tab === 'forum' ? 'noForum' : 'none')}</p>
            )}
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
                    <button type="button" onClick={() => setNewsFilter('')} aria-label={t('close')}>
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
                          {a.exactMatch === false && a.scopeTag && <span className="scopepill">{a.scopeTag}</span>}
                          {a.forum ? '◆ ' : a.police ? <span className="police-tag" title={t('tPolice')}>🛡 </span> : ''}
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
                            title={t('preview')}
                            aria-label={t('preview')}
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

      <InstallPrompt
        open={installModalOpen}
        installPrompt={installPrompt}
        onInstalledViaBrowser={() => {
          setInstallPrompt(null)
          setInstallModalOpen(false)
          if (canUseNotifications() && getNotificationPerm() === 'default') {
            enableNotifications()
          }
        }}
        onDismiss={() => {
          markInstallPromptDismissed()
          setInstallModalOpen(false)
        }}
        t={t}
      />

      {mine && (
        <Paper
          articles={mine}
          place={t('myPaperPlace')}
          date={formattedDate}
          pageWord={t('page')}
          tabName={t('myPaper')}
          clipLabel={t('clipStory')}
          closeLabel={t('close')}
          ago={(d) => ago(d, lang)}
          onClip={(a) => handleClipStory(a, t('myPaperPlace'))}
          onHome={() => goHome()}
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
          closeLabel={t('close')}
          ago={(d) => ago(d, lang)}
          onClip={(a) => handleClipStory(a)}
          onHome={() => goHome()}
          onClose={() => setPaperOpen(false)}
        />
      )}
    </div>
  )
}

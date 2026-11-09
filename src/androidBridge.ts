import type { Place, Quiet } from './lib'
import { alertCc, label } from './lib'
import { TOPICS } from './topicRules'
import { encodePlace } from './urlState'

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface NativeAndroidBridge {
  isAndroidApk?: () => boolean
  getNotificationPermission?: () => string
  requestNotificationPermission?: () => void
  syncFavorites?: (payloadJson: string) => void
  notifyNow?: (title: string, body: string, deepUrl: string, tag: string) => boolean
  checkNow?: () => void
  fetchAsync?: (reqId: string, targetUrl: string, cookie: string, encoding: string) => void
}

declare global {
  interface Window {
    NewzLocalAndroid?: NativeAndroidBridge
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null
    __onAndroidNotifPerm?: (perm: string) => void
    __onAndroidFetch?: (reqId: string, ok: boolean, body: string) => void
  }
}

const DISMISS_KEY = 'newzlocal.installDismissedAt'
const DISMISS_TTL_MS = 24 * 3600 * 1000

export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.NewzLocalAndroid?.isAndroidApk?.()) return true
  } catch { /* ignore */ }
  return typeof navigator !== 'undefined' && /NewzLocalAndroidAPK/i.test(navigator.userAgent)
}

export function isStandaloneApp(): boolean {
  if (isNativeAndroidApp()) return true
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true
  return (navigator as { standalone?: boolean }).standalone === true
}

export function isAndroidDevice(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

export function isIosDevice(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function canUseNotifications(): boolean {
  if (isNativeAndroidApp()) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPerm(): string {
  if (typeof window === 'undefined') return 'unsupported'
  if (window.NewzLocalAndroid?.getNotificationPermission) {
    try {
      return window.NewzLocalAndroid.getNotificationPermission()
    } catch { /* fallback */ }
  }
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

export async function requestAppNotificationPermission(): Promise<string> {
  if (typeof window === 'undefined') return 'unsupported'
  if (window.NewzLocalAndroid?.requestNotificationPermission) {
    return new Promise((resolve) => {
      const prev = window.__onAndroidNotifPerm
      let settled = false
      const finish = (state: string) => {
        if (settled) return
        settled = true
        window.__onAndroidNotifPerm = prev
        resolve(state)
      }
      window.__onAndroidNotifPerm = (state: string) => {
        prev?.(state)
        finish(state)
      }
      try {
        window.NewzLocalAndroid?.requestNotificationPermission?.()
      } catch {
        finish(getNotificationPerm())
      }
      setTimeout(() => finish(getNotificationPerm()), 4000)
    })
  }
  if ('Notification' in window) {
    try {
      return await Notification.requestPermission()
    } catch {
      return Notification.permission
    }
  }
  return 'unsupported'
}

export function notifyViaNativeAndroid(title: string, body: string, deepUrl = './', tag = 'newzlocal'): boolean {
  if (typeof window === 'undefined' || !window.NewzLocalAndroid?.notifyNow) return false
  try {
    const resolvedUrl = deepUrl.startsWith('http')
      ? deepUrl
      : new URL(deepUrl, 'https://nrnworld.one/NewzLocal/').href
    return window.NewzLocalAndroid.notifyNow(title, body, resolvedUrl, tag)
  } catch {
    return false
  }
}

export function syncNativeAndroidFavorites(
  favs: Place[],
  lang: string,
  quiet: Record<string, Quiet>,
  workerUrl: string,
): boolean {
  if (typeof window === 'undefined' || !window.NewzLocalAndroid?.syncFavorites) return false
  try {
    const payload = JSON.stringify({
      lang,
      quiet,
      workerUrl,
      // the app's own topic patterns, so the phone's background check filters alerts exactly as the open app does
      topics: Object.fromEntries(TOPICS.map((t) => [t.id, t.re.source])),
      places: favs.slice(0, 40).map((f) => ({
        label: label(f),
        hash: encodePlace(f, 0),
        cc: alertCc(f),
        parts: f.parts,
        cat: f.cat,
        alert: f.alert,
        alertNews: f.alertNews !== false,
        alertForum: f.alertForum !== false,
      })),
    })
    window.NewzLocalAndroid.syncFavorites(payload)
    return true
  } catch {
    return false
  }
}

let fetchSeq = 0
const pendingFetches = new Map<string, { resolve: (text: string | null) => void; timer: ReturnType<typeof setTimeout> }>()

function ensureAndroidFetchCallback(): void {
  if (typeof window === 'undefined' || window.__onAndroidFetch) return
  window.__onAndroidFetch = (reqId: string, ok: boolean, body: string) => {
    const entry = pendingFetches.get(reqId)
    if (!entry) return
    pendingFetches.delete(reqId)
    clearTimeout(entry.timer)
    entry.resolve(ok && body ? body : null)
  }
}

/**
 * Performs a direct CORS-free HTTPS GET from the user's Android device when running inside `NewzLocal.apk`,
 * consuming 0 Cloudflare Worker requests. Returns `null` when not running in the Android APK or on failure.
 */
export function nativeAndroidFetchText(
  targetUrl: string,
  opts?: { cookie?: string; encoding?: 'utf-8' | 'iso-8859-1'; signal?: AbortSignal },
): Promise<string | null> {
  if (typeof window === 'undefined' || !window.NewzLocalAndroid?.fetchAsync || !targetUrl.startsWith('https://')) {
    return Promise.resolve(null)
  }
  ensureAndroidFetchCallback()
  if (opts?.signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const reqId = `af_${++fetchSeq}_${Date.now()}`
    const onAbort = () => {
      const entry = pendingFetches.get(reqId)
      if (entry) {
        pendingFetches.delete(reqId)
        clearTimeout(entry.timer)
      }
      reject(new DOMException('Aborted', 'AbortError'))
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })

    const timer = setTimeout(() => {
      pendingFetches.delete(reqId)
      opts?.signal?.removeEventListener('abort', onAbort)
      resolve(null)
    }, 7800)

    pendingFetches.set(reqId, {
      timer,
      resolve: (txt) => {
        opts?.signal?.removeEventListener('abort', onAbort)
        resolve(txt)
      },
    })

    try {
      window.NewzLocalAndroid?.fetchAsync?.(reqId, targetUrl, opts?.cookie ?? '', opts?.encoding ?? 'utf-8')
    } catch {
      pendingFetches.delete(reqId)
      clearTimeout(timer)
      opts?.signal?.removeEventListener('abort', onAbort)
      resolve(null)
    }
  })
}

export function shouldAutoPromptInstall(): boolean {
  if (typeof window === 'undefined' || isStandaloneApp()) return false
  try {
    const last = Number(localStorage.getItem(DISMISS_KEY) ?? '0')
    if (last > 0 && Date.now() - last < DISMISS_TTL_MS) return false
  } catch { /* ignore */ }
  return true
}

export function markInstallPromptDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch { /* ignore */ }
}

export function apkDownloadUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}NewzLocal.apk`
}

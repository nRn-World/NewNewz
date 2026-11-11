import { useState } from 'react'
import { type BeforeInstallPromptEvent, apkDownloadUrl, isIosDevice } from './androidBridge'

type T = (k: string, v?: Record<string, string>) => string

type Props = {
  open: boolean
  installPrompt: BeforeInstallPromptEvent | null
  onInstalledViaBrowser: () => void
  onDismiss: () => void
  t: T
}

export default function InstallPrompt({
  open,
  installPrompt,
  onInstalledViaBrowser,
  onDismiss,
  t,
}: Props) {
  const [downloading, setDownloading] = useState(false)
  if (!open) return null

  const iconUrl = `${import.meta.env.BASE_URL}icons/icon-192.png`
  const apkUrl = apkDownloadUrl()
  const isIos = isIosDevice()

  const handleBrowserInstall = async () => {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') {
        onInstalledViaBrowser()
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="apk-backdrop" role="dialog" aria-modal="true" aria-labelledby="apk-dialog-title">
      <div className="apk-modal">
        <button type="button" className="apk-close" onClick={onDismiss} aria-label={t('close')}>
          ×
        </button>

        <div className="apk-head">
          <img src={iconUrl} alt="NewzLocal" width={52} height={52} className="apk-icon" />
          <div>
            <span className="apk-kicker">ANDROID APK · NEWZLOCAL</span>
            <h2 id="apk-dialog-title">{t('apkPromptTitle')}</h2>
          </div>
        </div>

        <p className="apk-body">{t('apkPromptBody')}</p>

        {isIos && <p className="pushhint">{t('iosPushHint')}</p>}

        {downloading && <p className="apk-hint">{t('apkAfterHint')}</p>}

        <div className="apk-actions">
          <a
            href={apkUrl}
            download="NewzLocal.apk"
            className="apk-btn primary"
            onClick={() => setDownloading(true)}
          >
            {t('apkDownloadBtn')}
          </a>

          {installPrompt && (
            <button type="button" className="apk-btn secondary" onClick={() => void handleBrowserInstall()}>
              {t('apkWebInstallBtn')}
            </button>
          )}

          <button type="button" className="apk-later" onClick={onDismiss}>
            {t('apkLater')}
          </button>
        </div>
      </div>
    </div>
  )
}

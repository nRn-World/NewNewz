// The app used to be called NewzLocal; keep what people saved (favourites, language, bookmarks...) under the new key names.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (!k?.startsWith('newzlocal.')) continue
    const next = `newnewz.${k.slice('newzlocal.'.length)}`
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k) ?? '')
    localStorage.removeItem(k)
  }
} catch { /* private mode: nothing was saved anyway */ }

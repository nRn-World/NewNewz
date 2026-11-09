// Dates and "5 minutes ago" in the UI language. Browsers ship no Kurdish locale data (Intl would silently
// answer in the device language instead), so Kurmancî is spelled out here.
const KU_DAYS = ['yekşem', 'duşem', 'sêşem', 'çarşem', 'pêncşem', 'în', 'şemî']
const KU_MONTHS = ['çileya', 'sibata', 'adara', 'nîsana', 'gulana', 'hezîrana', 'tîrmeha', 'tebaxa', 'îlona', 'cotmeha', 'mijdara', 'kanûna']

const supported = new Map<string, boolean>()
function intlSpeaks(lang: string): boolean {
  if (!supported.has(lang)) {
    let ok = false
    try {
      ok = Intl.DateTimeFormat.supportedLocalesOf([lang]).length > 0 && Intl.RelativeTimeFormat.supportedLocalesOf([lang]).length > 0
    } catch { /* very old engine: fall through to the spelled-out forms */ }
    supported.set(lang, ok)
  }
  return supported.get(lang)!
}

const kuDate = (d: Date) => `${d.getDate()}ê ${KU_MONTHS[d.getMonth()]} ${d.getFullYear()}an`

export function fullDate(d: Date, lang: string): string {
  if (lang === 'ku' && !intlSpeaks(lang)) return `${KU_DAYS[d.getDay()]}, ${kuDate(d)}`
  return new Intl.DateTimeFormat(lang, { dateStyle: 'full' }).format(d)
}

export function mediumDate(d: Date, lang: string): string {
  if (lang === 'ku' && !intlSpeaks(lang)) return kuDate(d)
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(d)
}

export function timeAgo(d: Date, lang: string, nowMs = Date.now()): string {
  const m = Math.max(1, Math.round((nowMs - d.getTime()) / 60000))
  const [n, unit] = m < 60 ? [m, 'minute'] as const : m < 1440 ? [Math.round(m / 60), 'hour'] as const : [Math.round(m / 1440), 'day'] as const
  if (lang === 'ku' && !intlSpeaks(lang)) {
    if (unit === 'day' && n === 1) return 'duh'
    const word = { minute: 'deqîqe', hour: 'saet', day: 'roj' }[unit]
    // oblique case after "berî": singular -ê / -yê, plural -an / -yan
    const vowelEnd = word.endsWith('e')
    return `berî ${n} ${word}${n === 1 ? (vowelEnd ? 'yê' : 'ê') : vowelEnd ? 'yan' : 'an'}`
  }
  return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-n, unit)
}

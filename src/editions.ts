// Global country → news edition, local topic keywords, and local Reddit communities.

export type EditionInfo = {
  cc: string
  hl: string
  ceid: string
  lang: string // 2-letter primary language code (matches App Lang where applicable)
}

// Compact table: CC -> [hl, ceidLang, 2-letter lang, region to query when the code is not a real ISO one]
const RAW_EDITIONS: Record<string, [string, string, string, string?]> = {
  // Nordics & Baltics
  SE: ['sv', 'sv', 'sv'],
  NO: ['no', 'no', 'no'],
  DK: ['da', 'da', 'da'],
  FI: ['fi', 'fi', 'fi'],
  IS: ['en-GB', 'en', 'is'],
  EE: ['et', 'et', 'et'],
  LV: ['lv', 'lv', 'lv'],
  LT: ['lt', 'lt', 'lt'],
  // Western & Central Europe
  DE: ['de', 'de', 'de'],
  AT: ['de', 'de', 'de'],
  CH: ['de', 'de', 'de'],
  FR: ['fr', 'fr', 'fr'],
  BE: ['nl', 'nl', 'nl'],
  NL: ['nl', 'nl', 'nl'],
  LU: ['fr', 'fr', 'fr'],
  GB: ['en-GB', 'en', 'en'],
  IE: ['en-IE', 'en', 'en'],
  // Southern Europe
  ES: ['es', 'es', 'es'],
  PT: ['pt-PT', 'pt-150', 'pt'],
  IT: ['it', 'it', 'it'],
  GR: ['el', 'el', 'el'],
  CY: ['el', 'el', 'el'],
  MT: ['en-GB', 'en', 'en'],
  // Eastern & Southeastern Europe
  PL: ['pl', 'pl', 'pl'],
  CZ: ['cs', 'cs', 'cs'],
  SK: ['sk', 'sk', 'sk'],
  HU: ['hu', 'hu', 'hu'],
  RO: ['ro', 'ro', 'ro'],
  BG: ['bg', 'bg', 'bg'],
  SI: ['sl', 'sl', 'sl'],
  HR: ['hr', 'hr', 'hr'],
  RS: ['sr', 'sr', 'sr'],
  BA: ['hr', 'hr', 'hr'],
  UA: ['uk', 'uk', 'uk'],
  RU: ['ru', 'ru', 'ru'],
  // Middle East & North Africa
  TR: ['tr', 'tr', 'tr'],
  IL: ['he', 'he', 'he'],
  AE: ['ar', 'ar', 'ar'],
  SA: ['ar', 'ar', 'ar'],
  EG: ['ar', 'ar', 'ar'],
  QA: ['ar', 'ar', 'ar'],
  KW: ['ar', 'ar', 'ar'],
  LB: ['ar', 'ar', 'ar'],
  JO: ['ar', 'ar', 'ar'],
  IQ: ['ar', 'ar', 'ar'],
  OM: ['ar', 'ar', 'ar'],
  BH: ['ar', 'ar', 'ar'],
  PS: ['ar', 'ar', 'ar'],
  SY: ['ar', 'ar', 'ar'],
  YE: ['ar', 'ar', 'ar'],
  MA: ['fr', 'fr', 'fr'],
  DZ: ['fr', 'fr', 'fr'],
  TN: ['fr', 'fr', 'fr'],
  IR: ['fa', 'fa', 'fa'],
  // Americas
  US: ['en-US', 'en', 'en'],
  CA: ['en-CA', 'en', 'en'],
  MX: ['es-419', 'es-419', 'es'],
  BR: ['pt-BR', 'pt-419', 'pt'],
  AR: ['es-419', 'es-419', 'es'],
  CO: ['es-419', 'es-419', 'es'],
  CL: ['es-419', 'es-419', 'es'],
  PE: ['es-419', 'es-419', 'es'],
  VE: ['es-419', 'es-419', 'es'],
  EC: ['es-419', 'es-419', 'es'],
  UY: ['es-419', 'es-419', 'es'],
  CR: ['es-419', 'es-419', 'es'],
  PA: ['es-419', 'es-419', 'es'],
  DO: ['es-419', 'es-419', 'es'],
  CU: ['es-419', 'es-419', 'es'],
  // Asia-Pacific
  JP: ['ja', 'ja', 'ja'],
  KR: ['ko', 'ko', 'ko'],
  CN: ['zh-CN', 'zh-Hans', 'zh'],
  TW: ['zh-TW', 'zh-Hant', 'zh'],
  HK: ['zh-HK', 'zh-Hant', 'zh'],
  SG: ['en-SG', 'en', 'en'],
  MY: ['en-MY', 'en', 'ms'],
  ID: ['id', 'id', 'id'],
  PH: ['en-PH', 'en', 'en'],
  TH: ['th', 'th', 'th'],
  VN: ['vi', 'vi', 'vi'],
  IN: ['en-IN', 'en', 'en'],
  PK: ['en-PK', 'en', 'en'],
  BD: ['bn', 'bn', 'bn'],
  AU: ['en-AU', 'en', 'en'],
  NZ: ['en-NZ', 'en', 'en'],
  // Sub-Saharan Africa
  ZA: ['en-ZA', 'en', 'en'],
  NG: ['en-NG', 'en', 'en'],
  KE: ['en-KE', 'en', 'en'],
  GH: ['en-GH', 'en', 'en'],
  ET: ['en-ET', 'en', 'en'],
  TZ: ['sw', 'sw', 'sw'],
  SN: ['fr', 'fr', 'fr'],
  CI: ['fr', 'fr', 'fr'],
}

export function editionFor(countryCode?: string): EditionInfo {
  const cc = (countryCode || 'US').toUpperCase()
  const hit = RAW_EDITIONS[cc]
  if (hit) return { cc: hit[3] ?? cc, hl: hit[0], ceid: `${hit[3] ?? cc}:${hit[1]}`, lang: hit[2] }
  // Unknown country: still pass its real ISO country code to `gl` so local outlets rank first
  return { cc: /^[A-Z]{2}$/.test(cc) ? cc : 'US', hl: 'en', ceid: `${/^[A-Z]{2}$/.test(cc) ? cc : 'US'}:en`, lang: 'en' }
}

// Topic expansion words keyed by 2-letter language code (used only when RSS feeds need extra depth)
export const WORDS_BY_LANG: Record<string, string> = {
  sv: 'polis brand trafik skola bostad kommun idrott olycka',
  no: 'politi brann trafikk skole bolig kommune sport ulykke',
  da: 'politi brand trafik skole bolig kommune sport ulykke',
  fi: 'poliisi tulipalo liikenne koulu kunta urheilu onnettomuus',
  de: 'Polizei Feuer Verkehr Schule Gemeinde Sport Unfall',
  fr: 'police incendie circulation école mairie sport accident',
  es: 'policía incendio tráfico colegio ayuntamiento deporte accidente',
  pt: 'polícia incêndio trânsito escola câmara esporte acidente',
  it: 'polizia incendio traffico scuola comune sport incidente',
  nl: 'politie brand verkeer school gemeente sport ongeval',
  pl: 'policja pożar ruch szkoła gmina sport wypadek',
  tr: 'polis yangın trafik okul belediye spor kaza',
  ar: 'شرطة حريق مرور مدرسة بلدية رياضة حادث',
  el: 'αστυνομία φωτιά κίνηση σχολείο δήμος ατύχημα',
  ru: 'полиция пожар транспорт школа город спорт авария',
  uk: 'поліція пожежа транспорт школа громада спорт ДТП',
  ja: '警察 火災 交通 学校 市役所 スポーツ 事故',
  ko: '경찰 화재 교통 학교 시청 스포츠 사고',
  id: 'polisi kebakaran lalu lintas sekolah kota olahraga kecelakaan',
  en: 'police fire traffic school council sport crash',
}

export function wordsFor(countryCode?: string): string[] {
  const { lang } = editionFor(countryCode)
  return (WORDS_BY_LANG[lang] ?? WORDS_BY_LANG.en).split(' ')
}

/** Country communities on Reddit where posts are in the local language. */
export const SUBS: Record<string, string[]> = {
  SE: ['sweden', 'sverige', 'stockholm', 'gothenburg', 'malmo'],
  NO: ['norge', 'Norway', 'oslo'],
  DK: ['Denmark', 'danmark', 'copenhagen'],
  FI: ['Suomi', 'Finland', 'helsinki'],
  IS: ['Iceland'],
  TR: ['Turkey', 'CasualTR', 'Turkiye', 'istanbul', 'ankara'],
  DE: ['de', 'germany', 'berlin', 'munich', 'hamburg'],
  AT: ['Austria', 'wien'],
  CH: ['Switzerland', 'zurich'],
  FR: ['france', 'French', 'paris', 'lyon'],
  BE: ['belgium', 'brussels'],
  NL: ['thenetherlands', 'Netherlands', 'Amsterdam'],
  ES: ['spain', 'es', 'madrid', 'barcelona'],
  PT: ['portugal', 'lisboa'],
  IT: ['italy', 'italia', 'rome', 'milano'],
  GB: ['unitedkingdom', 'CasualUK', 'london', 'uknews'],
  IE: ['ireland', 'dublin'],
  PL: ['Polska', 'poland', 'warszawa'],
  CZ: ['czech', 'Prague'],
  HU: ['hungary', 'budapest'],
  RO: ['Romania', 'bucuresti'],
  GR: ['greece', 'athina'],
  UA: ['ukraine', 'ukraina', 'kyiv'],
  RU: ['russia'],
  AE: ['dubai', 'UAE', 'abudhabi'],
  SA: ['saudiarabia', 'riyadh'],
  EG: ['Egypt', 'Cairo'],
  IL: ['Israel', 'telaviv'],
  IR: ['Iran'],
  IN: ['india', 'mumbai', 'delhi', 'bangalore'],
  JP: ['japan', 'japanlife', 'tokyo'],
  KR: ['korea', 'seoul'],
  TW: ['taiwan', 'Taipei'],
  HK: ['HongKong'],
  SG: ['singapore'],
  ID: ['indonesia', 'jakarta'],
  PH: ['Philippines', 'Manila'],
  TH: ['Thailand', 'Bangkok'],
  VN: ['VietNam'],
  AU: ['australia', 'sydney', 'melbourne'],
  NZ: ['newzealand', 'auckland'],
  CA: ['canada', 'toronto', 'vancouver', 'montreal'],
  BR: ['brasil', 'saopaulo', 'riodejaneiro'],
  MX: ['mexico', 'MexicoCity'],
  AR: ['argentina', 'BuenosAires'],
  CO: ['Colombia', 'Bogota'],
  CL: ['chile', 'Santiago'],
  ZA: ['southafrica', 'capetown'],
  NG: ['Nigeria'],
  KE: ['Kenya'],
  US: ['news', 'AskNYC', 'nyc', 'LosAngeles', 'chicago', 'houston'],
}

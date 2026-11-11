import { nativeAndroidFetchText } from './androidBridge'
import { norm } from './areas'
import { editionFor } from './editions'
import type { Article, Part, Place } from './lib'

export type DirectPoliceFeed = {
  url: string
  source: string
  lang: string
  /** Official geographic jurisdiction of this feed (e.g. "Phuket ภูเก็ต" for Phuket Tourist Police, "Sverige" for national polisen.se). */
  jurisdiction?: string
  kind?: 'rss' | 'polisen-json'
}

export type CountryPoliceInfo = {
  /** Official national, regional, tourist, and municipal police domains (used for `site:` queries and official badge tagging). */
  domains: string[]
  /** Native-language + English official police terms used for local police-beat discovery on the selected place. */
  terms: string[]
}

/**
 * Comprehensive global directory of official national & local police websites and native police terminology.
 */
export const POLICE_DIRECTORY: Record<string, CountryPoliceInfo> = {
  // Nordics & Baltics
  SE: {
    domains: ['polisen.se'],
    terms: ['polisen', 'polisinsats', 'polisregion', 'händelsenotis'],
  },
  NO: {
    domains: ['politiet.no', 'kripos.no'],
    terms: ['politiet', 'politiloggen', 'politidistrikt', 'utrykning'],
  },
  DK: {
    domains: ['politi.dk', 'via.ritzau.dk'],
    terms: ['politi', 'politiet', 'døgnrapport', 'politikreds'],
  },
  FI: {
    domains: ['poliisi.fi'],
    terms: ['poliisi', 'poliisilaitos', 'keskusrikospoliisi', 'polisen'],
  },
  IS: {
    domains: ['logreglan.is'],
    terms: ['lögreglan', 'lögreglu', 'police'],
  },
  EE: {
    domains: ['politsei.ee'],
    terms: ['politsei', 'ppa'],
  },
  LV: {
    domains: ['vp.gov.lv'],
    terms: ['valsts policija', 'policija'],
  },
  LT: {
    domains: ['policija.lrv.lt'],
    terms: ['policija', 'policijos'],
  },

  // Western & Central Europe
  GB: {
    domains: ['police.uk', 'met.police.uk', 'scotland.police.uk', 'psni.police.uk', 'nationalcrimeagency.gov.uk'],
    terms: ['police', 'constabulary', 'met police', 'detectives'],
  },
  IE: {
    domains: ['garda.ie'],
    terms: ['garda', 'gardaí', 'an garda síochána'],
  },
  DE: {
    domains: [
      'presseportal.de/blaulicht',
      'polizei.de',
      'bundespolizei.de',
      'bka.de',
      'polizei.nrw',
      'polizei.bayern.de',
      'polizei-bw.de',
      'berlin.de/polizei',
      'polizei.hamburg',
      'polizei.hessen.de',
      'polizei.sachsen.de',
      'polizei.brandenburg.de',
    ],
    terms: ['polizei', 'polizeimeldung', 'polizeipräsidium', 'bundespolizei', 'kripo'],
  },
  AT: {
    domains: ['polizei.gv.at', 'bmi.gv.at'],
    terms: ['polizei', 'landespolizeidirektion', 'lpd', 'bundeskriminalamt'],
  },
  CH: {
    domains: ['polizei.ch', 'fedpol.admin.ch', 'presseportal.ch'],
    terms: ['kantonspolizei', 'stadtpolizei', 'polizei', 'police cantonale', 'polizia cantonale'],
  },
  NL: {
    domains: ['politie.nl'],
    terms: ['politie', 'politiebericht', 'opsporing', 'marechaussee'],
  },
  BE: {
    domains: ['politie.be', 'police.be'],
    terms: ['politie', 'police locale', 'lokale politie', 'federale politie'],
  },
  LU: {
    domains: ['police.public.lu'],
    terms: ['police grand-ducale', 'police'],
  },
  FR: {
    domains: [
      'police-nationale.interieur.gouv.fr',
      'gendarmerie.interieur.gouv.fr',
      'prefecturedepolice.interieur.gouv.fr',
      'interieur.gouv.fr',
    ],
    terms: ['police nationale', 'gendarmerie', 'préfecture de police', 'commissariat'],
  },

  // Southern Europe
  ES: {
    domains: ['policia.es', 'guardiacivil.es', 'interior.gob.es', 'mossos.gencat.cat', 'ertzaintza.eus'],
    terms: ['policía nacional', 'guardia civil', 'policía local', 'mossos', 'ertzaintza'],
  },
  PT: {
    domains: ['psp.pt', 'gnr.pt', 'policiajudiciaria.pt'],
    terms: ['psp', 'gnr', 'polícia judiciária', 'polícia'],
  },
  IT: {
    domains: ['poliziadistato.it', 'carabinieri.it', 'gdf.gov.it', 'interno.gov.it'],
    terms: ['polizia di stato', 'carabinieri', 'questura', 'guardia di finanza', 'polizia locale'],
  },
  GR: {
    domains: ['astynomia.gr'],
    terms: ['αστυνομία', 'ελληνική αστυνομία', 'hellenic police'],
  },
  CY: {
    domains: ['police.gov.cy'],
    terms: ['αστυνομία κύπρου', 'cyprus police', 'police'],
  },
  MT: {
    domains: ['pulizija.gov.mt'],
    terms: ['malta police', 'pulizija', 'police'],
  },

  // Eastern & Southeastern Europe
  PL: {
    domains: ['policja.pl', 'policja.gov.pl'],
    terms: ['policja', 'komenda policji', 'policjanci'],
  },
  CZ: {
    domains: ['policie.cz'],
    terms: ['policie čr', 'policie', 'policisté'],
  },
  SK: {
    domains: ['minv.sk'],
    terms: ['polícia', 'policajný zbor'],
  },
  HU: {
    domains: ['police.hu'],
    terms: ['rendőrség', 'rendőr-főkapitányság'],
  },
  RO: {
    domains: ['politiaromana.ro', 'politiadefrontiera.ro', 'jandarmeriaromana.ro'],
    terms: ['poliția română', 'jandarmeria', 'inspectoratul de poliție'],
  },
  BG: {
    domains: ['mvr.bg'],
    terms: ['полиция', 'мвр', 'одмвр'],
  },
  SI: {
    domains: ['policija.si'],
    terms: ['policija', 'policijska uprava'],
  },
  HR: {
    domains: ['policija.gov.hr', 'mup.gov.hr'],
    terms: ['policija', 'policijska uprava', 'mup'],
  },
  RS: {
    domains: ['mup.gov.rs'],
    terms: ['policija', 'mup', 'полиција'],
  },
  BA: {
    domains: ['fup.gov.ba', 'mup.ks.gov.ba', 'mup.vladars.rs'],
    terms: ['policija', 'mup'],
  },
  UA: {
    domains: ['npu.gov.ua', 'patrolpolice.gov.ua', 'mvs.gov.ua'],
    terms: ['поліція', 'національна поліція', 'патрульна поліція'],
  },

  // Türkiye, Middle East & North Africa
  TR: {
    domains: ['egm.gov.tr', 'pol.tr', 'jandarma.gov.tr', 'sahilguvenlik.gov.tr'],
    terms: ['emniyet müdürlüğü', 'polis', 'jandarma', 'asayiş'],
  },
  IL: {
    domains: ['gov.il'],
    terms: ['משטרת ישראל', 'israel police', 'משטרה'],
  },
  AE: {
    domains: ['dubaipolice.gov.ae', 'adpolice.gov.ae', 'moi.gov.ae', 'shjpolice.gov.ae'],
    terms: ['شرطة دبي', 'شرطة أبوظبي', 'dubai police', 'abu dhabi police', 'police'],
  },
  SA: {
    domains: ['moi.gov.sa', 'spa.gov.sa'],
    terms: ['الأمن العام', 'شرطة منطقة', 'الشرطة السعودية', 'saudi police'],
  },
  QA: {
    domains: ['portal.moi.gov.qa'],
    terms: ['وزارة الداخلية', 'شرطة قطر', 'qatar police'],
  },
  KW: {
    domains: ['moi.gov.kw'],
    terms: ['وزارة الداخلية الكويتية', 'شرطة الكويت', 'kuwait police'],
  },
  OM: {
    domains: ['rop.gov.om'],
    terms: ['شرطة عمان السلطانية', 'royal oman police'],
  },
  BH: {
    domains: ['policemc.gov.bh', 'interior.gov.bh'],
    terms: ['شرطة البحرين', 'bahrain police'],
  },
  JO: {
    domains: ['psd.gov.jo'],
    terms: ['مديرية الأمن العام', 'الأمن العام', 'public security directorate'],
  },
  LB: {
    domains: ['isf.gov.lb'],
    terms: ['قوى الأمن الداخلي', 'internal security forces'],
  },
  EG: {
    domains: ['moi.gov.eg'],
    terms: ['وزارة الداخلية المصرية', 'الأمن العام', 'شرطة'],
  },
  MA: {
    domains: ['dgsn.gov.ma', 'mapnews.ma'],
    terms: ['dgsn', 'sûreté nationale', 'الأمن الوطني', 'police'],
  },
  DZ: {
    domains: ['algeriepolice.dz', 'interieur.gov.dz'],
    terms: ['sûreté nationale', 'المديرية العامة للأمن الوطني', 'gendarmerie'],
  },
  TN: {
    domains: ['interieur.gov.tn'],
    terms: ['وزارة الداخلية', 'الأمن الوطني', 'حرس وطني'],
  },

  // Asia-Pacific (including Thailand & Phuket local stations)
  TH: {
    domains: [
      'police.go.th',
      'royalthaipolice.go.th',
      'touristpolice.go.th',
      'cib.go.th',
      'immigration.go.th',
      'dsi.go.th',
    ],
    terms: [
      'Provincial Police',
      'Tourist Police',
      'Royal Thai Police',
      'Immigration Police',
      'police',
      'ตำรวจภูธร',
      'ตำรวจท่องเที่ยว',
      'ตำรวจสอบสวนกลาง',
      'สภ.',
      'ตำรวจ',
    ],
  },
  JP: {
    domains: [
      'npa.go.jp',
      'keishicho.metro.tokyo.lg.jp',
      'police.pref.osaka.lg.jp',
      'police.pref.kanagawa.jp',
      'police.pref.fukuoka.jp',
      'police.pref.hokkaido.lg.jp',
    ],
    terms: ['警察', '警視庁', '県警', '府警', 'police'],
  },
  KR: {
    domains: ['police.go.kr', 'smpa.go.kr', 'bspolice.go.kr'],
    terms: ['경찰', '경찰청', '경찰서', 'police'],
  },
  CN: {
    domains: ['mps.gov.cn'],
    terms: ['公安局', '警方', '警察', 'police'],
  },
  TW: {
    domains: ['npa.gov.tw', 'cib.npa.gov.tw', 'police.gov.taipei'],
    terms: ['警察局', '警政署', '警方', '派出所'],
  },
  HK: {
    domains: ['police.gov.hk', 'info.gov.hk'],
    terms: ['hong kong police', '香港警務處', '警方'],
  },
  SG: {
    domains: ['police.gov.sg', 'cnb.gov.sg', 'mha.gov.sg'],
    terms: ['singapore police force', 'police advisory', 'spf', 'police'],
  },
  MY: {
    domains: ['rmp.gov.my'],
    terms: ['polis diraja malaysia', 'pdrm', 'ibu pejabat polis', 'police'],
  },
  ID: {
    domains: ['polri.go.id', 'humas.polri.go.id'],
    terms: ['polri', 'polda', 'polres', 'polresta', 'kepolisian'],
  },
  PH: {
    domains: ['pnp.gov.ph', 'nbi.gov.ph'],
    terms: ['philippine national police', 'pnp', 'police station', 'police'],
  },
  VN: {
    domains: ['mps.gov.vn', 'bocongan.gov.vn', 'cand.com.vn'],
    terms: ['công an', 'cảnh sát', 'police'],
  },
  IN: {
    domains: [
      'delhipolice.gov.in',
      'mumbaipolice.gov.in',
      'uppolice.gov.in',
      'ksp.karnataka.gov.in',
      'kolkatapolice.gov.in',
      'pib.gov.in',
    ],
    terms: ['police', 'commissionerate', 'crime branch', 'fir'],
  },
  PK: {
    domains: ['punjabpolice.gov.pk', 'sindhpolice.gov.pk', 'islamabadpolice.gov.pk', 'kppolice.gov.pk'],
    terms: ['police', 'capital territory police', 'fir'],
  },
  BD: {
    domains: ['police.gov.bd', 'dmp.gov.bd'],
    terms: ['bangladesh police', 'metropolitan police', 'পুলিশ'],
  },
  AU: {
    domains: [
      'police.nsw.gov.au',
      'police.vic.gov.au',
      'mypolice.qld.gov.au',
      'police.wa.gov.au',
      'police.sa.gov.au',
      'police.tas.gov.au',
      'pfes.nt.gov.au',
      'afp.gov.au',
    ],
    terms: ['police', 'nsw police', 'victoria police', 'queensland police', 'wa police', 'afp'],
  },
  NZ: {
    domains: ['police.govt.nz'],
    terms: ['nz police', 'new zealand police', 'police'],
  },

  // Americas
  US: {
    domains: [
      'fbi.gov',
      'justice.gov',
      'nyc.gov/site/nypd',
      'lapdonline.org',
      'chicagopolice.org',
      'houstonpolice.org',
      'phillypolice.com',
      'sanfranciscopolice.org',
      'seattle.gov/police',
      'mpdc.dc.gov',
      'chp.ca.gov',
      'dps.texas.gov',
    ],
    terms: ['police department', "sheriff's office", 'state police', 'police'],
  },
  CA: {
    domains: [
      'rcmp-grc.gc.ca',
      'tps.ca',
      'vpd.ca',
      'spvm.qc.ca',
      'opp.ca',
      'sq.gouv.qc.ca',
      'calgarypolice.ca',
      'edmontonpolice.ca',
      'ottawapolice.ca',
      'peelpolice.ca',
    ],
    terms: ['police service', 'rcmp', 'opp', 'sûreté', 'police'],
  },
  MX: {
    domains: ['gob.mx/sspc', 'gob.mx/guardianacional', 'ssc.cdmx.gob.mx', 'fgjcdmx.gob.mx'],
    terms: ['policía', 'secretaría de seguridad ciudadana', 'guardia nacional', 'fiscalía'],
  },
  BR: {
    domains: ['gov.br/pf', 'gov.br/prf', 'policiamilitar.sp.gov.br', 'policiacivil.sp.gov.br', 'pmerj.rj.gov.br'],
    terms: ['polícia militar', 'polícia civil', 'polícia federal', 'prf'],
  },
  AR: {
    domains: ['argentina.gob.ar/seguridad', 'argentina.gob.ar/policia-federal', 'policiadelaciudad.gob.ar'],
    terms: ['policía federal', 'policía de la ciudad', 'policía bonaerense', 'gendarmería'],
  },
  CO: {
    domains: ['policia.gov.co', 'fiscalia.gov.co'],
    terms: ['policía nacional', 'policía metropolitana', 'fiscalía'],
  },
  CL: {
    domains: ['carabineros.cl', 'pdichile.cl'],
    terms: ['carabineros', 'pdi', 'policía de investigaciones'],
  },
  PE: {
    domains: ['gob.pe/pnp', 'gob.pe/mininter'],
    terms: ['policía nacional del perú', 'pnp', 'comisaría'],
  },
  UY: {
    domains: ['gub.uy/ministerio-interior'],
    terms: ['jefatura de policía', 'policía nacional', 'ministerio del interior'],
  },
  CR: {
    domains: ['seguridadpublica.go.cr', 'poder-judicial.go.cr'],
    terms: ['fuerza pública', 'oij', 'organismo de investigación judicial'],
  },

  // Sub-Saharan Africa
  ZA: {
    domains: ['saps.gov.za'],
    terms: ['saps', 'south african police service', 'metro police', 'police'],
  },
  NG: {
    domains: ['npf.gov.ng'],
    terms: ['nigeria police force', 'police command', 'police'],
  },
  KE: {
    domains: ['nationalpolice.go.ke', 'dci.go.ke'],
    terms: ['national police service', 'dci', 'kenya police'],
  },
  GH: {
    domains: ['police.gov.gh'],
    terms: ['ghana police service', 'police'],
  },
  TZ: {
    domains: ['polisi.go.tz'],
    terms: ['jeshi la polisi', 'tanzania police', 'polisi'],
  },
  ET: {
    domains: ['federalpolice.gov.et'],
    terms: ['federal police', 'addis ababa police', 'ፖሊስ'],
  },
}

const EU_ISO = new Set([
  'SE', 'NO', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT', 'DE', 'AT', 'CH', 'FR', 'BE', 'NL', 'LU', 'GB', 'IE',
  'ES', 'PT', 'IT', 'GR', 'CY', 'MT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'SI', 'HR', 'RS', 'BA', 'UA',
])

const ALL_POLICE_HOST_PATTERNS = [
  /(^|\.)polisen\.se$/i,
  /(^|\.)politiet\.no$/i,
  /(^|\.)politi\.dk$/i,
  /(^|\.)poliisi\.fi$/i,
  /(^|\.)logreglan\.is$/i,
  /(^|\.)politsei\.ee$/i,
  /(^|\.)police\.uk$/i,
  /(^|\.)garda\.ie$/i,
  /^www\.presseportal\.de$/i,
  /(^|\.)polizei\.(de|nrw|hamburg|ch|gv\.at)$/i,
  /(^|\.)polizei\.(bayern|hessen|sachsen|brandenburg)\.de$/i,
  /(^|\.)bundespolizei\.de$/i,
  /(^|\.)bka\.de$/i,
  /(^|\.)politie\.(nl|be)$/i,
  /(^|\.)police\.(be|public\.lu|hu|govt\.nz|gov\.sg|gov\.hk|gov\.cy|gov\.gh|gov\.bd|go\.kr)$/i,
  /(^|\.)interieur\.gouv\.fr$/i,
  /(^|\.)policia\.(es|gov\.co|lrv\.lt)$/i,
  /(^|\.)guardiacivil\.es$/i,
  /(^|\.)mossos\.gencat\.cat$/i,
  /(^|\.)ertzaintza\.eus$/i,
  /(^|\.)psp\.pt$/i,
  /(^|\.)gnr\.pt$/i,
  /(^|\.)policiajudiciaria\.pt$/i,
  /(^|\.)poliziadistato\.it$/i,
  /(^|\.)carabinieri\.it$/i,
  /(^|\.)astynomia\.gr$/i,
  /(^|\.)policja\.(pl|gov\.pl)$/i,
  /(^|\.)policie\.cz$/i,
  /(^|\.)politiaromana\.ro$/i,
  /(^|\.)policija\.(si|gov\.hr)$/i,
  /(^|\.)egm\.gov\.tr$/i,
  /(^|\.)pol\.tr$/i,
  /(^|\.)jandarma\.gov\.tr$/i,
  /(^|\.)police\.go\.th$/i,
  /(^|\.)royalthaipolice\.go\.th$/i,
  /(^|\.)touristpolice\.go\.th$/i,
  /(^|\.)cib\.go\.th$/i,
  /(^|\.)immigration\.go\.th$/i,
  /(^|\.)polri\.go\.id$/i,
  /(^|\.)rmp\.gov\.my$/i,
  /(^|\.)pnp\.gov\.ph$/i,
  /(^|\.)npa\.(go\.jp|gov\.tw)$/i,
  /(^|\.)keishicho\.metro\.tokyo\.lg\.jp$/i,
  /(^|\.)mypolice\.qld\.gov\.au$/i,
  /(^|\.)police\.(nsw|vic|wa|sa|tas)\.gov\.au$/i,
  /(^|\.)afp\.gov\.au$/i,
  /(^|\.)rcmp-grc\.gc\.ca$/i,
  /(^|\.)fbi\.gov$/i,
  /(^|\.)lapdonline\.org$/i,
  /(^|\.)chicagopolice\.org$/i,
  /(^|\.)dubaipolice\.gov\.ae$/i,
  /(^|\.)adpolice\.gov\.ae$/i,
  /(^|\.)rop\.gov\.om$/i,
  /(^|\.)saps\.gov\.za$/i,
  /(^|\.)npf\.gov\.ng$/i,
  /(^|\.)nationalpolice\.go\.ke$/i,
  /(^|\.)carabineros\.cl$/i,
  /(^|\.)pdichile\.cl$/i,
  /(^|\.)europol\.europa\.eu$/i,
  /(^|\.)interpol\.int$/i,
]

/** Returns true when an article URL belongs to a verified official police agency website. */
export function isOfficialPoliceUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.toLowerCase()
    if (host === 'www.presseportal.de' || host === 'presseportal.de') {
      return u.pathname.startsWith('/blaulicht')
    }
    return ALL_POLICE_HOST_PATTERNS.some((re) => re.test(host))
  } catch {
    return false
  }
}

/**
 * Parses `polisen.se/api/events` timestamps (`"2026-11-04 6:52:17 +01:00"` or `"2026-11-08 14:25:56 +01:00"`),
 * padding single-digit hours so Safari, Firefox, and V8 all parse them reliably.
 */
export function parsePolisenDate(raw: string): Date {
  const m = /^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}):(\d{2}):(\d{2})\s*([+-]\d{2}:?\d{2}|Z)?$/.exec(raw.trim())
  if (m) {
    const hh = m[2].padStart(2, '0')
    const tzRaw = m[5] ?? '+01:00'
    const tz = tzRaw === 'Z' || tzRaw.includes(':') ? tzRaw : `${tzRaw.slice(0, 3)}:${tzRaw.slice(3)}`
    return new Date(`${m[1]}T${hh}:${m[3]}:${m[4]}${tz}`)
  }
  return new Date(raw)
}

type PolisenApiEvent = {
  id?: number
  datetime?: string
  name?: string
  summary?: string
  url?: string
  type?: string
  location?: { name?: string; gps?: string }
}

/** Converts Swedish Police Open Data `/api/events` JSON into NewzLocal `Article` items. */
export function parsePolisenEventsJson(rawJson: string, lang = 'sv'): Article[] {
  const parsed = JSON.parse(rawJson) as unknown
  if (!Array.isArray(parsed)) throw new Error('err.source')
  const seen = new Set<string>()
  const out: Article[] = []

  for (const item of parsed as PolisenApiEvent[]) {
    if (!item?.url || !item.name) continue
    // Skip press-desk off-duty housekeeping notices ("ingen presstalesperson i tjänst")
    if (/ingen presstalesperson i tj[äa]nst/i.test(item.summary ?? '')) continue
    const fullUrl = item.url.startsWith('http') ? item.url : `https://polisen.se${item.url}`
    if (seen.has(fullUrl)) continue
    seen.add(fullUrl)

    const sum = (item.summary ?? '').replace(/\s+/g, ' ').trim()
    const cleanSum = sum.replace(/\.$/, '')
    const locName = item.location?.name?.trim() ?? ''
    const evType = item.type?.trim() ?? ''
    const title =
      evType && cleanSum && cleanSum.length <= 120
        ? `${evType}: ${cleanSum}`
        : item.name.trim()
    const date = parsePolisenDate(item.datetime ?? '')
    if (isNaN(+date)) continue

    out.push({
      url: fullUrl,
      title,
      summary: sum && sum !== cleanSum + '.' ? sum : `${item.name}${sum ? ` — ${sum}` : ''}`,
      where: `${item.name} ${sum} ${locName} Sverige`,
      source: 'polisen.se',
      date,
      lang,
      police: true,
    })
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .trim()
}

function xmlTagValue(block: string, tagPattern: string): string {
  const m = new RegExp(`<(${tagPattern})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, 'i').exec(block)
  return m ? decodeEntities(m[2].trim()) : ''
}

function pickValidPoliceImage(htmlOrXml: string): string | undefined {
  const mediaAttr = /<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["']/i.exec(htmlOrXml)?.[1]
  if (mediaAttr && /^https:\/\//i.test(mediaAttr) && !/emoji\.php|16x16|32x32/i.test(mediaAttr)) {
    return decodeEntities(mediaAttr)
  }
  for (const m of htmlOrXml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const src = decodeEntities(m[1])
    if (/^https:\/\//i.test(src) && !/emoji\.php|static\.xx\.fbcdn\.net\/images\/emoji|16x16|32x32|s\.w\.org\/images/i.test(src)) {
      return src
    }
  }
  return undefined
}

// Filters out administrative non-incident noise (job ads, construction tenders, vehicle auctions, anti-bribery boilerplate)
const ADMIN_NOISE_RE =
  /lediga-jobb|ประกวดราคา|จัดซื้อจัดจ้าง|ขายทอดตลาด|no\s*gift\s*policy|เจตนารมณ์ที่จะไม่รับของขวัญ|รายงานการประชุมบริหาร|ประมวลจริยธรรมตำรวจ/i

/**
 * Parses official police RSS 2.0 (`<item>`) and Atom (`<entry>`) XML feeds, including WordPress `/feed/` streams
 * (such as `phuket.tourist.police.go.th/feed/`, `saranitet.police.go.th/feed/`, `polisen.se`, `politiet.no`, `politie.nl`).
 */
export function parsePoliceFeedXml(xmlText: string, sourceLabel: string, lang: string, jurisdiction = ''): Article[] {
  if (!/<rss\b|<channel\b|<feed\b/i.test(xmlText)) throw new Error('err.source')
  const seen = new Set<string>()
  const out: Article[] = []

  const blocks = [
    ...xmlText.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xmlText.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ]

  for (const m of blocks) {
    const b = m[1]
    const rawTitle = xmlTagValue(b, 'title').replace(/\s+/g, ' ').trim()
    let link = xmlTagValue(b, 'link')
    if (!link) {
      link = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(b)?.[1] ?? ''
    }
    const contentEncoded = xmlTagValue(b, 'content:encoded')
    const rawDesc = xmlTagValue(b, 'description') || xmlTagValue(b, 'summary') || contentEncoded
    const plainDesc = decodeEntities(rawDesc.replace(/<[^>]+>/g, ' '))
      .replace(/The post\s+[\s\S]*?\s+appeared first on[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!link || !rawTitle || seen.has(link)) continue
    if (ADMIN_NOISE_RE.test(`${link} ${rawTitle} ${plainDesc}`)) continue
    seen.add(link)

    const pubStr = xmlTagValue(b, 'pubDate') || xmlTagValue(b, 'published') || xmlTagValue(b, 'updated') || xmlTagValue(b, 'dc:date')
    const date = pubStr ? new Date(pubStr) : new Date()
    if (isNaN(+date)) continue

    const image = pickValidPoliceImage(`${b} ${contentEncoded}`)
    const summary = plainDesc && norm(plainDesc) !== norm(rawTitle) ? plainDesc.slice(0, 320) : undefined

    out.push({
      url: link,
      title: rawTitle,
      summary,
      image,
      where: [plainDesc.slice(0, 500), jurisdiction].filter(Boolean).join(' '),
      source: sourceLabel,
      date,
      lang,
      police: true,
    })
  }
  return out
}

// Swedish county slugs on `polisen.se/aktuellt/rss/<county>/...`
const SE_COUNTY_FEEDS: { match: string[]; slug: string; handelserSlug?: string; label: string }[] = [
  {
    match: [
      'stockholm', 'stockholms lan', 'solna', 'sundbyberg', 'huddinge', 'nacka', 'jarfalla', 'sodertalje',
      'taby', 'botkyrka', 'haninge', 'lidingo', 'sollentuna', 'upplands vasby', 'vallentuna', 'norrtalje',
      'sigtuna', 'tyreso', 'varmdo', 'danderyd', 'ekero', 'nynashamn', 'osteraker', 'husby', 'kista', 'rinkeby', 'tensta',
    ],
    slug: 'stockholms-lan',
    label: 'Stockholms län',
  },
  {
    match: ['skane', 'skane lan', 'malmo', 'lund', 'helsingborg', 'kristianstad', 'landskrona', 'trelleborg', 'ystad', 'angelholm', 'hassleholm', 'eslov'],
    slug: 'skane',
    label: 'Skåne',
  },
  {
    match: ['vastra gotaland', 'vastra gotalands lan', 'goteborg', 'gothenburg', 'boras', 'trollhattan', 'skovde', 'uddevalla', 'molndal', 'partille', 'kungalv', 'alingsas', 'lidkoping'],
    slug: 'vastra-gotaland',
    label: 'Västra Götaland',
  },
  { match: ['uppsala', 'uppsala lan', 'enkoping', 'tierp', 'osthammar', 'knivsta', 'habo'], slug: 'uppsala-lan', label: 'Uppsala län' },
  { match: ['ostergotland', 'ostergotlands lan', 'linkoping', 'norrkoping', 'motala', 'mjolby', 'finspang'], slug: 'ostergotland', label: 'Östergötland' },
  { match: ['jonkoping', 'jonkopings lan', 'varnamo', 'nassjo', 'vetlanda', 'eksjo', 'tranås', 'tranas'], slug: 'jonkopings-lan', handelserSlug: 'jonkoping', label: 'Jönköpings län' },
  { match: ['kronoberg', 'kronobergs lan', 'vaxjo', 'ljungby', 'almhult'], slug: 'kronoberg', label: 'Kronoberg' },
  { match: ['kalmar', 'kalmar lan', 'vastervik', 'oskarshamn', 'nybro', 'borgholm', 'vimmerby'], slug: 'kalmar-lan', label: 'Kalmar län' },
  { match: ['gotland', 'gotlands lan', 'visby'], slug: 'gotland', label: 'Gotland' },
  { match: ['blekinge', 'blekinge lan', 'karlskrona', 'karlshamn', 'ronneby', 'solvesborg'], slug: 'blekinge', label: 'Blekinge' },
  { match: ['halland', 'hallands lan', 'halmstad', 'varberg', 'kungsbacka', 'falkenberg', 'laholm'], slug: 'halland', label: 'Halland' },
  { match: ['varmland', 'varmlands lan', 'karlstad', 'kristinehamn', 'arvika', 'saffle'], slug: 'varmland', label: 'Värmland' },
  { match: ['orebro', 'orebro lan', 'karlskoga', 'kumla', 'lindesberg'], slug: 'orebro-lan', label: 'Örebro län' },
  { match: ['vastmanland', 'vastmanlands lan', 'vasteras', 'koping', 'sala', 'fagersta', 'arboga'], slug: 'vastmanland', label: 'Västmanland' },
  { match: ['dalarna', 'dalarnas lan', 'falun', 'borlange', 'mora', 'ludvika', 'avesta', 'leksand'], slug: 'dalarna', label: 'Dalarna' },
  { match: ['gavleborg', 'gavleborgs lan', 'gavle', 'sandviken', 'hudiksvall', 'bollnas', 'soderhamn'], slug: 'gavleborg', label: 'Gävleborg' },
  { match: ['vasternorrland', 'vasternorrlands lan', 'sundsvall', 'ornskoldsvik', 'harnosand', 'solleftea', 'timra'], slug: 'vasternorrland', label: 'Västernorrland' },
  { match: ['jamtland', 'jamtlands lan', 'ostersund', 'are', 'harjedalen'], slug: 'jamtland', label: 'Jämtland' },
  { match: ['vasterbotten', 'vasterbottens lan', 'umea', 'skelleftea', 'lycksele'], slug: 'vasterbotten', label: 'Västerbotten' },
  { match: ['norrbotten', 'norrbottens lan', 'lulea', 'pitea', 'boden', 'kiruna', 'gallivare', 'kalix', 'haparanda'], slug: 'norrbotten', label: 'Norrbotten' },
  { match: ['sodermanland', 'sodermanlands lan', 'eskilstuna', 'nykoping', 'katrineholm', 'strangnas', 'oxelosund'], slug: 'sodermanland', label: 'Södermanland' },
]

// Norwegian police district slugs on `politiet.no/api/rss/nyheter?distrikt=<slug>`
const NO_DISTRICT_FEEDS: { match: string[]; slug: string; label: string }[] = [
  { match: ['oslo', 'asker', 'baerum'], slug: 'oslo', label: 'Oslo' },
  { match: ['ost', 'ostfold', 'akershus', 'drammen', 'fredrikstad', 'sarpsborg', 'moss', 'lillestrom'], slug: 'ost', label: 'Øst' },
  { match: ['vest', 'bergen', 'vestland', 'hordaland', 'sogn'], slug: 'vest', label: 'Vest' },
  { match: ['sor-vest', 'stavanger', 'rogaland', 'sandnes', 'haugesund'], slug: 'sor-vest', label: 'Sør-Vest' },
  { match: ['sor-ost', 'vestfold', 'telemark', 'buskerud', 'tonsberg', 'skien', 'porsgrunn'], slug: 'sor-ost', label: 'Sør-Øst' },
  { match: ['agder', 'kristiansand', 'arendal', 'grimstad'], slug: 'agder', label: 'Agder' },
  { match: ['innlandet', 'hamar', 'lillehammer', 'gjovik', 'hedmark', 'oppland'], slug: 'innlandet', label: 'Innlandet' },
  { match: ['trondelag', 'trondheim', 'steinkjer', 'stjordal'], slug: 'trondelag', label: 'Trøndelag' },
  { match: ['more og romsdal', 'alesund', 'molde', 'kristiansund'], slug: 'more-og-romsdal', label: 'Møre og Romsdal' },
  { match: ['nordland', 'bodo', 'narvik', 'mo i rana', 'lofoten'], slug: 'nordland', label: 'Nordland' },
  { match: ['troms', 'tromso', 'harstad'], slug: 'troms', label: 'Troms' },
  { match: ['finnmark', 'alta', 'hammerfest', 'kirkenes', 'vadso'], slug: 'finnmark', label: 'Finnmark' },
]

function isPhuketPlace(place: Place, parts: Part[]): boolean {
  const inBox = place.lat >= 7.7 && place.lat <= 8.22 && place.lon >= 98.2 && place.lon <= 98.48
  if (inBox) return true
  return parts.some((p) =>
    /^(phuket|ภูเก็ต|patong|ป่าตอง|karon|กะรน|kamala|กมลา|chalong|ฉลอง|thalang|ถลาง|rawai|ราไวย์|cherngtalay|choeng thale|เชิงทะเล|kata|กะตะ)$/.test(
      norm(p.name),
    ),
  )
}

/**
 * Returns direct official government police JSON/RSS endpoints for the selected place's country & region.
 */
export function directPoliceFeedsFor(place: Place, from: number): DirectPoliceFeed[] {
  const cc = (place.cc ?? '').toUpperCase()
  const sliced = place.parts.slice(from)
  const allNorms = place.parts.map((p) => norm(p.name))
  const own = sliced[0] ?? place.parts[0]
  if (!own) return []

  if (cc === 'SE') {
    const feeds: DirectPoliceFeed[] = [
      { url: 'https://polisen.se/api/events', source: 'polisen.se', lang: 'sv', kind: 'polisen-json' },
    ]
    const cityOrState = sliced.find((p) => p.level === 'city') ?? place.parts.find((p) => p.level === 'city' || p.level === 'state')
    if (cityOrState && own.level !== 'country') {
      feeds.push({
        url: `https://polisen.se/api/events?locationname=${encodeURIComponent(cityOrState.name)}`,
        source: 'polisen.se',
        lang: 'sv',
        kind: 'polisen-json',
      })
    }
    const county = SE_COUNTY_FEEDS.find((c) => allNorms.some((n) => c.match.includes(n)))
    if (county) {
      const hSlug = county.handelserSlug ?? county.slug
      feeds.push(
        {
          url: `https://polisen.se/aktuellt/rss/${county.slug}/nyheter-rss---${county.slug}/`,
          source: 'polisen.se · Nyheter',
          lang: 'sv',
          jurisdiction: `${county.label} Sverige`,
        },
        {
          url: `https://polisen.se/aktuellt/rss/${county.slug}/press-rss---${county.slug}/`,
          source: 'polisen.se · Press',
          lang: 'sv',
          jurisdiction: `${county.label} Sverige`,
        },
        {
          url: `https://polisen.se/aktuellt/rss/${county.slug}/handelser-rss---${hSlug}/`,
          source: 'polisen.se · Händelser',
          lang: 'sv',
          jurisdiction: `${county.label} Sverige`,
        },
      )
    }
    feeds.push(
      {
        url: 'https://polisen.se/aktuellt/rss/hela-landet/nyheter-hela-landet/',
        source: 'polisen.se · Nyheter',
        lang: 'sv',
        jurisdiction: 'Sverige Sweden',
      },
      {
        url: 'https://polisen.se/aktuellt/rss/hela-landet/pressmeddelanden-hela-landet/',
        source: 'polisen.se · Press',
        lang: 'sv',
        jurisdiction: 'Sverige Sweden',
      },
    )
    if (own.level === 'country') {
      feeds.push({
        url: 'https://polisen.se/aktuellt/rss/hela-landet/handelser-i-hela-landet/',
        source: 'polisen.se · Händelser',
        lang: 'sv',
        jurisdiction: 'Sverige Sweden',
      })
    }
    return feeds
  }

  if (cc === 'TH') {
    const feeds: DirectPoliceFeed[] = [
      {
        url: 'https://saranitet.police.go.th/feed/',
        source: 'Royal Thai Police (สำนักงานตำรวจแห่งชาติ)',
        lang: 'th',
        jurisdiction: 'Thailand ประเทศไทย',
      },
    ]
    if (isPhuketPlace(place, place.parts)) {
      feeds.unshift(
        {
          url: 'https://phuket.tourist.police.go.th/feed/',
          source: 'Phuket Tourist Police (ตำรวจท่องเที่ยวภูเก็ต)',
          lang: 'th',
          jurisdiction: 'Phuket ภูเก็ต',
        },
        {
          url: 'https://phuket.police.go.th/feed/',
          source: 'Phuket Provincial Police (ตำรวจภูธรจังหวัดภูเก็ต)',
          lang: 'th',
          jurisdiction: 'Phuket ภูเก็ต',
        },
        {
          url: 'https://mueangphuket.phuket.police.go.th/feed/',
          source: 'Mueang Phuket Police (สภ.เมืองภูเก็ต)',
          lang: 'th',
          jurisdiction: 'Mueang Phuket Phuket เมืองภูเก็ต ภูเก็ต',
        },
        {
          url: 'https://kamala.phuket.police.go.th/feed/',
          source: 'Kamala Police Phuket (สภ.กมลา)',
          lang: 'th',
          jurisdiction: 'Kamala Phuket กมลา ภูเก็ต',
        },
        {
          url: 'https://karon.phuket.police.go.th/feed/',
          source: 'Karon Police Phuket (สภ.กะรน)',
          lang: 'th',
          jurisdiction: 'Karon Phuket กะรน ภูเก็ต',
        },
        {
          url: 'https://patong.phuket.police.go.th/feed/',
          source: 'Patong Police Phuket (สภ.ป่าตอง)',
          lang: 'th',
          jurisdiction: 'Patong Phuket ป่าตอง ภูเก็ต',
        },
        {
          url: 'https://chalong.phuket.police.go.th/feed/',
          source: 'Chalong Police Phuket (สภ.ฉลอง)',
          lang: 'th',
          jurisdiction: 'Chalong Phuket ฉลอง ภูเก็ต',
        },
        {
          url: 'https://thalang.phuket.police.go.th/feed/',
          source: 'Thalang Police Phuket (สภ.ถลาง)',
          lang: 'th',
          jurisdiction: 'Thalang Phuket ถลาง ภูเก็ต',
        },
      )
    }
    return feeds
  }

  if (cc === 'NO') {
    const feeds: DirectPoliceFeed[] = [
      { url: 'https://api.politiet.no/politiloggen/v1/rss', source: 'politiet.no · Politiloggen', lang: 'no', jurisdiction: 'Norge Norway' },
      { url: 'https://www.politiet.no/api/rss/nyheter', source: 'politiet.no · Nyheter', lang: 'no', jurisdiction: 'Norge Norway' },
    ]
    const dist = NO_DISTRICT_FEEDS.find((d) => allNorms.some((n) => d.match.includes(n)))
    if (dist) {
      feeds.unshift({
        url: `https://www.politiet.no/api/rss/nyheter?distrikt=${dist.slug}`,
        source: `politiet.no · ${dist.label}`,
        lang: 'no',
        jurisdiction: `${dist.label} Norge Norway`,
      })
    }
    return feeds
  }

  if (cc === 'DK') {
    return [
      { url: 'https://via.ritzau.dk/rss/short-messages/latest', source: 'politi.dk · Politi Update', lang: 'da', jurisdiction: 'Danmark Denmark' },
    ]
  }

  if (cc === 'NL') {
    return [
      { url: 'https://rss.politie.nl/rss/algemeen/nb/alle-nieuwsberichten.xml', source: 'politie.nl', lang: 'nl', jurisdiction: 'Nederland Netherlands' },
      { url: 'https://rss.politie.nl/rss/algemeen/ab/algemeen.xml', source: 'politie.nl', lang: 'nl', jurisdiction: 'Nederland Netherlands' },
      { url: 'https://rss.politie.nl/urgentpolitiebericht.xml', source: 'politie.nl · Urgent', lang: 'nl', jurisdiction: 'Nederland Netherlands' },
    ]
  }

  if (cc === 'GB') {
    const feeds: DirectPoliceFeed[] = []
    if (allNorms.includes('london') || own.level === 'country') {
      feeds.push({
        url: 'https://news.met.police.uk/rss/source/60923/news',
        source: 'met.police.uk',
        lang: 'en',
        jurisdiction: 'London United Kingdom',
      })
    }
    return feeds
  }

  if (cc === 'NZ') {
    return [
      { url: 'https://www.police.govt.nz/rss/news', source: 'police.govt.nz', lang: 'en', jurisdiction: 'New Zealand' },
      { url: 'https://www.police.govt.nz/rss/alerts', source: 'police.govt.nz · Alerts', lang: 'en', jurisdiction: 'New Zealand' },
    ]
  }

  if (cc === 'AU') {
    const feeds: DirectPoliceFeed[] = []
    if (allNorms.some((n) => ['queensland', 'brisbane', 'gold coast', 'cairns', 'sunshine coast', 'townsville'].includes(n)) || own.level === 'country') {
      feeds.push({ url: 'https://mypolice.qld.gov.au/feed/', source: 'mypolice.qld.gov.au', lang: 'en', jurisdiction: 'Queensland Australia' })
    }
    return feeds
  }

  if (EU_ISO.has(cc)) {
    return [
      { url: 'https://www.europol.europa.eu/cms/api/rss/news', source: 'europol.europa.eu', lang: 'en' },
    ]
  }

  return []
}

/**
 * Builds targeted Google News / Bing News police search queries for the chosen place:
 * 1. Official police websites (`site:` query across the country's verified police domains).
 * 2. Local police-beat press coverage strictly scoped to `"${cleanName}"` (and native-script alias when applicable, e.g. `"ภูเก็ต"`).
 */
export function policeSearchQueries(
  cleanName: string,
  aliases: string[],
  ccRaw?: string,
): { query: string; editionCc: string; forcePoliceTag: boolean }[] {
  const cc = (ccRaw || 'US').toUpperCase()
  const info = POLICE_DIRECTORY[cc]
  const out: { query: string; editionCc: string; forcePoliceTag: boolean }[] = []

  if (info?.domains.length) {
    const topDomains = info.domains.slice(0, 5)
    const siteExpr = topDomains.map((d) => `site:${d}`).join(' OR ')
    out.push({
      query: topDomains.length === 1 ? `"${cleanName}" ${siteExpr}` : `"${cleanName}" (${siteExpr})`,
      editionCc: cc,
      forcePoliceTag: true,
    })
    if (cc === 'US') {
      out.push({
        query: `"${cleanName}" ("police department" OR "sheriff's office" OR "state police") site:.gov`,
        editionCc: 'US',
        forcePoliceTag: true,
      })
    }
  } else {
    out.push({
      query: `"${cleanName}" (site:interpol.int OR site:europol.europa.eu OR "police")`,
      editionCc: cc,
      forcePoliceTag: true,
    })
  }

  // Local police-beat press query in local edition (catches local police press briefings reported by regional/national media)
  const localTerms = (info?.terms ?? ['police']).slice(0, 4)
  const termExpr = localTerms.map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' OR ')
  out.push({
    query: `"${cleanName}" (${termExpr})`,
    editionCc: cc,
    forcePoliceTag: true,
  })

  // If the place has a non-Latin local-script alias (e.g. Phuket -> ภูเก็ต, Bangkok -> กรุงเทพ, Tokyo -> 東京),
  // run BOTH the native-script police query in the local edition AND the English police query!
  const nonLatinAlias = aliases.find((a) => /[\u0600-\u06ff\u0e00-\u0e7f\u3040-\u9fff\uac00-\ud7af]/.test(a))
  if (nonLatinAlias && nonLatinAlias !== cleanName) {
    const nativeTerms = (info?.terms ?? []).filter((t) => /[\u0600-\u06ff\u0e00-\u0e7f\u3040-\u9fff\uac00-\ud7af]/.test(t)).slice(0, 4)
    if (nativeTerms.length) {
      out.push({
        query: `"${nonLatinAlias}" (${nativeTerms.join(' OR ')})`,
        editionCc: cc,
        forcePoliceTag: true,
      })
    }
    if (info?.domains.length) {
      const topDomains = info.domains.slice(0, 4)
      out.push({
        query: `"${nonLatinAlias}" (${topDomains.map((d) => `site:${d}`).join(' OR ')})`,
        editionCc: cc,
        forcePoliceTag: true,
      })
    }
  }

  // English police-beat bridge for international destinations with non-English local editions (e.g. Phuket in Thailand!)
  if (editionFor(cc).lang !== 'en' && /[A-Za-z]/.test(cleanName)) {
    out.push({
      query: `"${cleanName}" ("${cleanName} Police" OR "Tourist Police" OR "Provincial Police" OR "police arrested" OR "police warn")`,
      editionCc: 'US',
      forcePoliceTag: true,
    })
  }

  return out
}

const directFeedCache = new Map<string, { at: number; items: Article[] }>()

async function fetchPoliceRawText(targetUrl: string, apiBase: string, signal?: AbortSignal): Promise<string> {
  // 1. Direct device fetch inside native Android APK (0 Cloudflare Worker requests!)
  const directAndroid = await nativeAndroidFetchText(targetUrl, { signal })
  if (directAndroid && directAndroid.trim().length > 20) return directAndroid

  const timeoutSig = signal ? AbortSignal.any([signal, AbortSignal.timeout(5500)]) : AbortSignal.timeout(5500)
  if (apiBase) {
    try {
      const r = await fetch(`${apiBase}/police-feed?url=${encodeURIComponent(targetUrl)}`, { signal: timeoutSig })
      if (r.ok) {
        const txt = await r.text()
        if (txt.trim().length > 20) return txt
      }
    } catch (e) {
      if (signal?.aborted) throw e
    }
  }

  // Browser CORS bridge fallback so direct police feeds work even if Worker is unreachable
  const bridgeSig = signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000)
  return Promise.any([
    fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, { signal: bridgeSig }).then(async (r) => {
      if (!r.ok) throw new Error('err.source')
      const t = await r.text()
      if (t.trim().length < 20) throw new Error('err.source')
      return t
    }),
    fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, { signal: bridgeSig }).then(async (r) => {
      if (!r.ok) throw new Error('err.source')
      const t = await r.text()
      if (t.trim().length < 20) throw new Error('err.source')
      return t
    }),
  ])
}

/**
 * Fetches and parses all direct official government police JSON/RSS feeds applicable to `place`.
 * Results are cached for 2 minutes so rapid navigation across nearby neighbourhoods stays instant.
 */
export async function fetchDirectPoliceFeeds(
  place: Place,
  from: number,
  apiBase: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  const feeds = directPoliceFeedsFor(place, from)
  if (!feeds.length) return []

  const settled = await Promise.allSettled(
    feeds.map(async (f) => {
      const cached = directFeedCache.get(f.url)
      if (cached && Date.now() - cached.at < 120_000) return cached.items
      const raw = await fetchPoliceRawText(f.url, apiBase, signal)
      const items =
        f.kind === 'polisen-json'
          ? parsePolisenEventsJson(raw, f.lang)
          : parsePoliceFeedXml(raw, f.source, f.lang, f.jurisdiction)
      directFeedCache.set(f.url, { at: Date.now(), items })
      return items
    }),
  )

  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
}

import { nativeAndroidFetchText } from './androidBridge'
import { norm } from './areas'
import type { Article } from './lib'

/** Largest country subreddits worldwide (95+ countries) for local Reddit discussions. */
const COUNTRY_SUBS: Record<string, string[]> = {
  // Nordics & Baltics
  SE: ['sweden', 'svenskpolitik'],
  NO: ['norge', 'Norway'],
  DK: ['Denmark'],
  FI: ['Suomi', 'Finland'],
  IS: ['Iceland'],
  EE: ['Eesti'],
  LV: ['latvia'],
  LT: ['lithuania'],
  // Western & Central Europe
  GB: ['unitedkingdom', 'CasualUK', 'AskUK'],
  IE: ['ireland'],
  DE: ['de', 'FragReddit'],
  AT: ['Austria'],
  CH: ['Switzerland'],
  FR: ['france', 'AskFrance'],
  NL: ['thenetherlands'],
  BE: ['belgium'],
  LU: ['Luxembourg'],
  // Southern & Eastern Europe
  ES: ['es', 'spain'],
  PT: ['portugal'],
  IT: ['italy'],
  GR: ['greece'],
  CY: ['cyprus'],
  MT: ['malta'],
  PL: ['Polska'],
  CZ: ['czech'],
  SK: ['Slovakia'],
  HU: ['hungary'],
  RO: ['Romania'],
  BG: ['bulgaria'],
  HR: ['croatia'],
  RS: ['serbia'],
  BA: ['bih'],
  SI: ['Slovenia'],
  AL: ['albania'],
  MK: ['mkd'],
  UA: ['ukraine'],
  RU: ['AskARussian'],
  // Middle East & North Africa
  TR: ['Turkey', 'TurkeyMeta'],
  IR: ['iran', 'NewIran', 'iranian'],
  IQ: ['Iraq', 'kurdistan'],
  SY: ['Syria', 'kurdistan'],
  IL: ['Israel'],
  PS: ['Palestine'],
  JO: ['jordan'],
  LB: ['lebanon'],
  AE: ['dubai', 'UAE'],
  SA: ['saudiarabia'],
  QA: ['qatar'],
  KW: ['Kuwait'],
  OM: ['Oman'],
  BH: ['Bahrain'],
  YE: ['Yemen'],
  EG: ['Egypt'],
  MA: ['Morocco'],
  DZ: ['algeria'],
  TN: ['Tunisia'],
  LY: ['Libya'],
  // Americas & Caribbean
  US: ['news', 'AskAnAmerican'],
  CA: ['canada'],
  MX: ['mexico'],
  JM: ['Jamaica'],
  CU: ['cuba'],
  DO: ['Dominican'],
  PR: ['PuertoRico'],
  TT: ['TrinidadandTobago'],
  BB: ['Barbados'],
  BS: ['bahamas'],
  CR: ['Ticos'],
  PA: ['Panama'],
  GT: ['guatemala'],
  BR: ['brasil'],
  AR: ['argentina'],
  CO: ['Colombia'],
  CL: ['chile'],
  PE: ['PERU'],
  EC: ['ecuador'],
  VE: ['vzla'],
  UY: ['uruguay'],
  PY: ['Paraguay'],
  BO: ['BOLIVIA'],
  // Asia-Pacific
  JP: ['japan', 'japanlife'],
  KR: ['korea'],
  CN: ['China'],
  TW: ['taiwan'],
  HK: ['HongKong'],
  TH: ['Thailand', 'ThailandTourism'],
  ID: ['indonesia', 'bali'],
  VN: ['VietNam'],
  PH: ['Philippines'],
  SG: ['singapore'],
  MY: ['malaysia'],
  KH: ['cambodia'],
  IN: ['india', 'IndiaSpeaks'],
  PK: ['pakistan'],
  BD: ['bangladesh'],
  LK: ['srilanka'],
  NP: ['Nepal'],
  AF: ['afghanistan'],
  KZ: ['Kazakhstan'],
  UZ: ['Uzbekistan'],
  AZ: ['azerbaijan'],
  GE: ['Sakartvelo'],
  AM: ['armenia'],
  AU: ['australia'],
  NZ: ['newzealand'],
  // Sub-Saharan Africa
  ZA: ['southafrica'],
  NG: ['Nigeria'],
  KE: ['Kenya'],
  GH: ['ghana'],
  ET: ['Ethiopia'],
  TZ: ['tanzania'],
  UG: ['Uganda'],
  SN: ['Senegal'],
}

/** Major city subreddits worldwide (110+ cities) so local city & street searches hit city communities first. */
const CITY_SUBS: Record<string, string> = {
  // Nordics
  stockholm: 'stockholm', goteborg: 'gothenburg', gothenburg: 'gothenburg', malmo: 'malmo',
  uppsala: 'uppsala', lund: 'lund', umea: 'umea', orebro: 'orebro', linkoping: 'linkoping', helsingborg: 'helsingborg',
  oslo: 'oslo', bergen: 'Bergen', trondheim: 'trondheim',
  kobenhavn: 'copenhagen', copenhagen: 'copenhagen', aarhus: 'Aarhus',
  helsinki: 'helsinki', helsingfors: 'helsinki', tampere: 'Tampere', reykjavik: 'reykjavik',
  // Europe
  london: 'london', manchester: 'manchester', birmingham: 'brum', liverpool: 'Liverpool',
  edinburgh: 'Edinburgh', glasgow: 'glasgow', bristol: 'bristol', dublin: 'Dublin', cork: 'cork',
  berlin: 'berlin', munchen: 'Munich', munich: 'Munich', hamburg: 'hamburg', frankfurt: 'frankfurt', koln: 'cologne', cologne: 'cologne',
  wien: 'wien', vienna: 'wien', zurich: 'zurich', geneve: 'geneva', geneva: 'geneva', basel: 'basel',
  paris: 'paris', lyon: 'Lyon', marseille: 'marseille', toulouse: 'toulouse', nice: 'nice',
  amsterdam: 'Amsterdam', rotterdam: 'Rotterdam', utrecht: 'Utrecht', brussels: 'brussels', bruxelles: 'brussels', antwerp: 'Antwerpen',
  madrid: 'Madrid', barcelona: 'Barcelona', valencia: 'valencia', seville: 'Seville', malaga: 'Malaga',
  lisbon: 'lisboa', lisboa: 'lisboa', porto: 'porto',
  roma: 'rome', rome: 'rome', milano: 'milano', milan: 'milano', napoli: 'napoli', torino: 'torino',
  athens: 'athens', αθηνα: 'athens', thessaloniki: 'thessaloniki',
  warszawa: 'warsaw', warsaw: 'warsaw', krakow: 'krakow', prague: 'Prague', praha: 'Prague',
  budapest: 'budapest', bucharest: 'bucuresti', sofia: 'sofia', zagreb: 'zagreb', belgrade: 'belgrade', kyiv: 'kyiv',
  // Türkiye, Iran & MENA
  istanbul: 'istanbul', ankara: 'ankara', izmir: 'Izmir', antalya: 'Antalya', diyarbakir: 'diyarbakir',
  tehran: 'tehran', isfahan: 'isfahan', mashhad: 'mashhad', shiraz: 'shiraz',
  erbil: 'erbil', baghdad: 'baghdad', dubai: 'dubai', 'abu dhabi': 'abudhabi',
  riyadh: 'riyadh', jeddah: 'jeddah', doha: 'qatar', amman: 'jordan', beirut: 'lebanon',
  cairo: 'Cairo', casablanca: 'casablanca', marrakech: 'marrakech', algiers: 'algeria', tunis: 'Tunisia',
  // Americas & Caribbean
  'new york': 'nyc', 'los angeles': 'LosAngeles', chicago: 'chicago', miami: 'Miami',
  houston: 'houston', seattle: 'Seattle', boston: 'boston', 'san francisco': 'sanfrancisco', austin: 'Austin',
  toronto: 'toronto', vancouver: 'vancouver', montreal: 'montreal', calgary: 'Calgary', ottawa: 'ottawa',
  'mexico city': 'MexicoCity', guadalajara: 'Guadalajara', monterrey: 'Monterrey',
  kingston: 'Jamaica', 'montego bay': 'Jamaica',
  'sao paulo': 'saopaulo', 'rio de janeiro': 'riodejaneiro', 'buenos aires': 'BuenosAires',
  bogota: 'Bogota', medellin: 'medellin', santiago: 'chile', lima: 'PERU',
  // Asia-Pacific & Africa
  tokyo: 'Tokyo', osaka: 'osaka', kyoto: 'Kyoto', seoul: 'seoul', busan: 'busan',
  taipei: 'taipei', 'hong kong': 'HongKong', singapore: 'singapore', 'kuala lumpur': 'kualalumpur',
  bangkok: 'Bangkok', phuket: 'phuket', chiangmai: 'chiangmai', 'chiang mai': 'chiangmai', pattaya: 'Pattaya',
  bali: 'bali', jakarta: 'jakarta', manila: 'Manila', hanoi: 'hanoi', 'ho chi minh': 'saigon',
  mumbai: 'mumbai', delhi: 'delhi', 'new delhi': 'delhi', bengaluru: 'bangalore', bangalore: 'bangalore',
  karachi: 'karachi', lahore: 'Lahore', islamabad: 'islamabad', dhaka: 'dhaka',
  sydney: 'sydney', melbourne: 'melbourne', brisbane: 'brisbane', perth: 'perth', auckland: 'auckland',
  johannesburg: 'johannesburg', 'cape town': 'capetown', lagos: 'Nigeria', nairobi: 'Kenya',
}

export type RegionalForum = { site: string; label: string; lang?: string }

/** Most famous national & local current-events discussion forums per country (Flashback / Ekşi Sözlük equivalents). */
const REGIONAL_FORUMS: Record<string, RegionalForum[]> = {
  SE: [
    { site: 'familjeliv.se', label: 'Familjeliv', lang: 'sv' },
    { site: 'byggahus.se', label: 'Byggahus', lang: 'sv' },
  ],
  NO: [
    { site: 'forum.kvinneguiden.no', label: 'Kvinneguiden', lang: 'no' },
    { site: 'diskusjon.no', label: 'Diskusjon.no', lang: 'no' },
    { site: 'freak.no', label: 'Freak.no', lang: 'no' },
  ],
  DK: [{ site: 'hardwareonline.dk', label: 'HardwareOnline', lang: 'da' }],
  FI: [
    { site: 'vauva.fi', label: 'Vauva.fi', lang: 'fi' },
    { site: 'ylilauta.org', label: 'Ylilauta', lang: 'fi' },
    { site: 'keskustelu.suomi24.fi', label: 'Suomi24', lang: 'fi' },
  ],
  IR: [
    { site: 'ninisite.com', label: 'NiniSite', lang: 'fa' },
    { site: 'forum.persiantools.com', label: 'PersianTools', lang: 'fa' },
    { site: 'forum.p30world.com', label: 'P30World', lang: 'fa' },
  ],
  GR: [
    { site: 'insomnia.gr', label: 'Insomnia.gr', lang: 'el' },
    { site: 'travelstories.gr', label: 'TravelStories', lang: 'el' },
  ],
  JM: [{ site: 'tripadvisor.com', label: 'TripAdvisor Jamaica', lang: 'en' }],
  TR: [
    { site: 'eksisozluk.com', label: 'Ekşi Sözlük', lang: 'tr' },
    { site: 'incisozluk.com.tr', label: 'İnci Sözlük', lang: 'tr' },
    { site: 'forum.donanimhaber.com', label: 'DonanımHaber', lang: 'tr' },
  ],
  IL: [{ site: 'fxp.co.il', label: 'FXP', lang: 'he' }],
  DE: [
    { site: 'gutefrage.net', label: 'Gutefrage', lang: 'de' },
    { site: 'computerbase.de/forum', label: 'ComputerBase', lang: 'de' },
  ],
  AT: [{ site: 'gutefrage.net', label: 'Gutefrage', lang: 'de' }],
  CH: [{ site: 'gutefrage.net', label: 'Gutefrage', lang: 'de' }],
  GB: [
    { site: 'mumsnet.com/talk', label: 'Mumsnet Talk', lang: 'en' },
    { site: 'forums.digitalspy.com', label: 'Digital Spy', lang: 'en' },
    { site: 'forums.moneysavingexpert.com', label: 'MSE Forum', lang: 'en' },
  ],
  IE: [{ site: 'boards.ie', label: 'Boards.ie', lang: 'en' }],
  FR: [
    { site: 'jeuxvideo.com/forums', label: 'Jeuxvideo 18-25', lang: 'fr' },
    { site: 'forum.hardware.fr', label: 'Hardware.fr', lang: 'fr' },
  ],
  ES: [
    { site: 'forocoches.com', label: 'ForoCoches', lang: 'es' },
    { site: 'mediavida.com', label: 'Mediavida', lang: 'es' },
  ],
  IT: [
    { site: 'forumfree.it', label: 'ForumFree', lang: 'it' },
    { site: 'forum.tomshw.it', label: 'Tom’s HW IT', lang: 'it' },
  ],
  NL: [
    { site: 'forum.fok.nl', label: 'FOK! Forum', lang: 'nl' },
    { site: 'gathering.tweakers.net', label: 'Tweakers', lang: 'nl' },
  ],
  PL: [
    { site: 'wykop.pl', label: 'Wykop', lang: 'pl' },
    { site: 'forum.gazeta.pl', label: 'Gazeta Forum', lang: 'pl' },
  ],
  CZ: [{ site: 'emimino.cz', label: 'eMimino', lang: 'cs' }],
  HU: [{ site: 'gyakorikerdesek.hu', label: 'Gyakori Kérdések', lang: 'hu' }],
  RO: [{ site: 'forum.softpedia.com', label: 'Softpedia Forum', lang: 'ro' }],
  HR: [{ site: 'forum.hr', label: 'Forum.hr', lang: 'hr' }],
  BA: [
    { site: 'forum.klix.ba', label: 'Klix Forum', lang: 'bs' },
    { site: 'forum.hr', label: 'Forum.hr', lang: 'hr' },
  ],
  RS: [{ site: 'forum.krstarica.com', label: 'Krstarica Forum', lang: 'sr' }],
  UA: [{ site: 'forum.pravda.com.ua', label: 'Pravda Forum', lang: 'uk' }],
  RU: [
    { site: 'pikabu.ru', label: 'Pikabu', lang: 'ru' },
    { site: 'yaplakal.com', label: 'Yaplakal', lang: 'ru' },
  ],
  PT: [{ site: 'forum.zwame.pt', label: 'ZWAME Forum', lang: 'pt' }],
  TH: [
    { site: 'pantip.com', label: 'Pantip', lang: 'th' },
    { site: 'aseannow.com', label: 'ASEAN NOW', lang: 'en' },
  ],
  JP: [
    { site: '5ch.net', label: '5ch', lang: 'ja' },
    { site: 'girlschannel.net', label: 'GirlsChannel', lang: 'ja' },
  ],
  KR: [
    { site: 'gall.dcinside.com', label: 'DC Inside', lang: 'ko' },
    { site: 'fmkorea.com', label: 'FMKorea', lang: 'ko' },
    { site: 'theqoo.net', label: 'TheQoo', lang: 'ko' },
  ],
  CN: [
    { site: 'zhihu.com', label: 'Zhihu', lang: 'zh' },
    { site: 'tieba.baidu.com', label: 'Baidu Tieba', lang: 'zh' },
    { site: 'bbs.hupu.com', label: 'Hupu', lang: 'zh' },
  ],
  TW: [
    { site: 'ptt.cc', label: 'PTT', lang: 'zh' },
    { site: 'dcard.tw', label: 'Dcard', lang: 'zh' },
  ],
  HK: [
    { site: 'lihkg.com', label: 'LIHKG', lang: 'zh' },
    { site: 'discuss.com.hk', label: 'Discuss.com.hk', lang: 'zh' },
  ],
  SG: [{ site: 'forums.hardwarezone.com.sg', label: 'HardwareZone', lang: 'en' }],
  MY: [{ site: 'forum.lowyat.net', label: 'Lowyat Forum', lang: 'en' }],
  ID: [{ site: 'kaskus.co.id', label: 'Kaskus', lang: 'id' }],
  VN: [{ site: 'voz.vn', label: 'VOZ', lang: 'vi' }],
  IN: [
    { site: 'quora.com', label: 'Quora India', lang: 'en' },
    { site: 'team-bhp.com/forum', label: 'Team-BHP', lang: 'en' },
  ],
  AU: [{ site: 'forums.whirlpool.net.au', label: 'Whirlpool', lang: 'en' }],
  NZ: [{ site: 'geekzone.co.nz', label: 'Geekzone', lang: 'en' }],
  CA: [{ site: 'forums.redflagdeals.com', label: 'RedFlagDeals', lang: 'en' }],
  US: [{ site: 'city-data.com/forum', label: 'City-Data Forum', lang: 'en' }],
  BR: [{ site: 'clubedohardware.com.br/forums', label: 'Clube do Hardware', lang: 'pt' }],
  AR: [{ site: 'foros.3dgames.com.ar', label: '3DGames', lang: 'es' }],
  CL: [{ site: 'capa9.net', label: 'Capa9', lang: 'es' }],
  PE: [{ site: 'forosperu.net', label: 'ForosPerú', lang: 'es' }],
  MX: [{ site: 'meneame.net', label: 'Menéame', lang: 'es' }],
  CO: [{ site: 'meneame.net', label: 'Menéame', lang: 'es' }],
  NG: [{ site: 'nairaland.com', label: 'Nairaland', lang: 'en' }],
  KE: [{ site: 'kenyatalk.com', label: 'KenyaTalk', lang: 'en' }],
  ZA: [{ site: 'mybroadband.co.za/forum', label: 'MyBroadband', lang: 'en' }],
  SA: [
    { site: 'adslgate.com', label: 'ADSLGATE', lang: 'ar' },
    { site: 'io.hsoub.com', label: 'Hsoub I/O', lang: 'ar' },
  ],
  AE: [{ site: 'io.hsoub.com', label: 'Hsoub I/O', lang: 'ar' }],
  EG: [{ site: 'io.hsoub.com', label: 'Hsoub I/O', lang: 'ar' }],
  IQ: [{ site: 'io.hsoub.com', label: 'Hsoub I/O', lang: 'ar' }],
  MA: [{ site: 'io.hsoub.com', label: 'Hsoub I/O', lang: 'ar' }],
}

const GLOBAL_FALLBACK_FORUM: RegionalForum = { site: 'tripadvisor.com', label: 'TripAdvisor Forum', lang: 'en' }

/** Returns the most famous national/local forums for any country on Earth (45+ curated + global TripAdvisor fallback). */
export function regionalForumsFor(cc: string): RegionalForum[] {
  const upper = cc.toUpperCase()
  if (REGIONAL_FORUMS[upper]) return REGIONAL_FORUMS[upper]
  return upper ? [GLOBAL_FALLBACK_FORUM] : []
}

/** Country and city subreddits relevant to any place on Earth (curated 95+ countries & 110+ cities + automatic `r/<CountryName>` fallback). */
export function localSubreddits(cc: string, placeNames: string[]): string[] {
  const out = new Set<string>()
  for (const name of placeNames) {
    const citySub = CITY_SUBS[norm(name)]
    if (citySub) out.add(citySub)
  }
  const upper = cc.toUpperCase()
  const curated = COUNTRY_SUBS[upper]
  if (curated) {
    for (const cSub of curated) out.add(cSub)
  } else if (/^[A-Z]{2}$/.test(upper)) {
    try {
      const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(upper)
      if (regionName && regionName !== upper) {
        const slug = regionName.replace(/[^A-Za-z0-9]/g, '')
        if (slug.length >= 3) out.add(slug)
      }
    } catch { /* ignore unsupported locale */ }
  }
  return [...out].slice(0, 4)
}

function timeoutSig(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

/** Open CORS Fediverse / Lemmy discussion search (including German feddit.org & French jlai.lu instances). */
export async function lemmyDiscussions(query: string, cc: string, signal?: AbortSignal): Promise<Article[]> {
  const upper = cc.toUpperCase()
  const host = upper === 'DE' || upper === 'AT' || upper === 'CH' ? 'https://feddit.org' : upper === 'FR' ? 'https://jlai.lu' : 'https://lemmy.world'
  const label = host === 'https://feddit.org' ? 'feddit' : host === 'https://jlai.lu' ? 'jlai.lu' : 'lemmy'
  try {
    const r = await fetch(`${host}/api/v3/search?type_=Posts&sort=New&limit=50&q=${encodeURIComponent(query)}`, {
      signal: timeoutSig(signal, 6000),
    })
    if (!r.ok) return []
    const j = (await r.json()) as {
      posts?: {
        post?: { ap_id?: string; name?: string; body?: string; published?: string; thumbnail_url?: string }
        community?: { name?: string }
        counts?: { comments?: number; score?: number }
      }[]
    }
    return (j.posts ?? [])
      .map((item) => {
        const p = item.post
        const comm = item.community?.name
        const comments = item.counts?.comments ?? 0
        const ups = item.counts?.score ?? 0
        const baseSrc = comm ? `${label} !${comm}` : label
        return {
          url: p?.ap_id ?? '',
          title: (p?.name ?? '').trim(),
          summary: p?.body ? p.body.replace(/[#>*_`[\]()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260) : undefined,
          image: p?.thumbnail_url || undefined,
          source: comments > 0 ? `${baseSrc} (${comments})` : baseSrc,
          date: new Date(p?.published ?? ''),
          comments,
          score: comments * 3 + Math.max(0, ups),
          forum: true,
        }
      })
      .filter((a) => a.url && a.title && !isNaN(+a.date))
  } catch {
    return []
  }
}

async function searchSingleRegionalForum(
  forumDef: RegionalForum,
  query: string,
  apiBase: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  const hostMatch = forumDef.site.split('/')[0]

  // 1. Direct device Bing RSS search inside Android APK (0 Worker requests)
  const bingRss = `https://www.bing.com/search?q=${encodeURIComponent(`site:${forumDef.site} "${query}"`)}&format=rss`
  const directTxt = await nativeAndroidFetchText(bingRss, { signal })
  if (directTxt && /<item\b/i.test(directTxt)) {
    const doc = new DOMParser().parseFromString(directTxt, 'text/xml')
    return [...doc.querySelectorAll('item')]
      .slice(0, 15)
      .map((i) => {
        const url = (i.querySelector('link')?.textContent ?? '').trim()
        const title = (i.querySelector('title')?.textContent ?? '').trim()
        const desc = (i.querySelector('description')?.textContent ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        const pub = i.querySelector('pubDate')?.textContent ?? ''
        return {
          url,
          title,
          summary: desc ? desc.slice(0, 240) : undefined,
          source: forumDef.label,
          date: pub ? new Date(pub) : new Date(),
          approx: !pub,
          forum: true,
          lang: forumDef.lang,
        }
      })
      .filter((a) => a.title && a.url.toLowerCase().includes(hostMatch) && !isNaN(+a.date))
  }

  // 2. Hardened Cloudflare Worker `/forum-search` (edge-cached 300s)
  if (apiBase) {
    try {
      const r = await fetch(
        `${apiBase}/forum-search?site=${encodeURIComponent(forumDef.site)}&q=${encodeURIComponent(query)}`,
        { signal: timeoutSig(signal, 6000) },
      )
      if (r.ok) {
        const j = (await r.json()) as { items?: { url: string; title: string; summary?: string; date?: string }[] }
        return (j.items ?? []).map((x) => ({
          url: x.url,
          title: x.title,
          summary: x.summary,
          source: forumDef.label,
          date: x.date ? new Date(x.date) : new Date(),
          approx: !x.date,
          forum: true,
          lang: forumDef.lang,
        }))
      }
    } catch { /* fall through to CORS bridge */ }
  }

  // 3. Browser CORS bridge fallback (works even before Worker is redeployed!)
  try {
    const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(bingRss)}`, {
      signal: timeoutSig(signal, 5500),
    })
    if (r.ok) {
      const xml = await r.text()
      if (/<item\b/i.test(xml)) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml')
        return [...doc.querySelectorAll('item')]
          .slice(0, 15)
          .map((i) => {
            const url = (i.querySelector('link')?.textContent ?? '').trim()
            const title = (i.querySelector('title')?.textContent ?? '').trim()
            const desc = (i.querySelector('description')?.textContent ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            const pub = i.querySelector('pubDate')?.textContent ?? ''
            return {
              url,
              title,
              summary: desc ? desc.slice(0, 240) : undefined,
              source: forumDef.label,
              date: pub ? new Date(pub) : new Date(),
              approx: !pub,
              forum: true,
              lang: forumDef.lang,
            }
          })
          .filter((a) => a.title && a.url.toLowerCase().includes(hostMatch) && !isNaN(+a.date))
      }
    }
  } catch { /* ignore */ }

  return []
}

/** Country-specific famous national & local forums worldwide (Menéame, Ekşi Sözlük, NiniSite, Insomnia.gr, Pantip, 5ch, Nairaland, Mumsnet, Boards.ie, Wykop, etc.). */
export async function regionalDiscussions(
  query: string,
  cc: string,
  apiBase: string,
  proxyBlocked: boolean,
  signal?: AbortSignal,
): Promise<Article[]> {
  const upper = cc.toUpperCase()
  const tasks: Promise<Article[]>[] = []

  // Spain: direct Menéame RSS
  if (upper === 'ES') {
    const rssTarget = `https://www.meneame.net/rss?q=${encodeURIComponent(query)}`
    const url = apiBase ? `${apiBase}/meneame?q=${encodeURIComponent(query)}` : `https://api.allorigins.win/raw?url=${encodeURIComponent(rssTarget)}`
    tasks.push(
      fetch(url, { signal: timeoutSig(signal, 6000) })
        .then(async (r) => {
          if (!r.ok) return []
          const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
          return [...doc.querySelectorAll('item')]
            .map((i) => ({
              url: i.querySelector('link')?.textContent ?? '',
              title: (i.querySelector('title')?.textContent ?? '').trim(),
              summary: (i.querySelector('description')?.textContent ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) || undefined,
              source: 'menéame',
              date: new Date(i.querySelector('pubDate')?.textContent ?? ''),
              forum: true,
              lang: 'es',
            }))
            .filter((a) => a.url && a.title && !isNaN(+a.date))
        })
        .catch(() => []),
    )
  }

  // Country's top famous national forums (up to 3 per country in parallel)
  if (apiBase || !proxyBlocked) {
    for (const f of regionalForumsFor(upper).slice(0, 3)) {
      tasks.push(searchSingleRegionalForum(f, query, apiBase, signal).catch(() => []))
    }
  }

  if (!tasks.length) return []
  const settled = await Promise.allSettled(tasks)
  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
}

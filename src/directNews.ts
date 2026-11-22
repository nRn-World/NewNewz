import { nativeAndroidFetchText } from './androidBridge'
import { norm } from './areas'
import type { Article, Place } from './lib'
import { LruCache } from './lru'
import { parsePoliceFeedXml } from './police'

export type DirectNewsFeed = {
  url: string
  source: string
  lang: string
  /** Optional geographic scope appended to `where` so country-level front-page feeds match when viewing the country. */
  jurisdiction?: string
}

/** 1-click free RSS presets users can add under Favourites → Custom RSS feeds. */
export const RSS_PRESETS: { label: string; url: string }[] = [
  { label: 'SVT Nyheter', url: 'https://www.svt.se/nyheter/rss.xml' },
  { label: 'Yahoo News', url: 'https://news.yahoo.com/rss/' },
  { label: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { label: 'Euronews', url: 'https://www.euronews.com/rss' },
  { label: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { label: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  { label: 'Samsung Newsroom', url: 'https://news.samsung.com/global/feed' },
  { label: 'Rudaw', url: 'https://www.rudaw.net/english/rss' },
]

const COUNTRY_NEWS_FEEDS: Record<string, DirectNewsFeed[]> = {
  SE: [
    { url: 'https://www.svt.se/nyheter/rss.xml', source: 'SVT Nyheter', lang: 'sv', jurisdiction: 'Sverige Sweden' },
    { url: 'https://www.aftonbladet.se/rss.xml', source: 'Aftonbladet', lang: 'sv', jurisdiction: 'Sverige Sweden' },
    { url: 'https://feeds.expressen.se/nyheter/', source: 'Expressen', lang: 'sv', jurisdiction: 'Sverige Sweden' },
    { url: 'https://www.dn.se/rss/', source: 'Dagens Nyheter', lang: 'sv', jurisdiction: 'Sverige Sweden' },
    { url: 'https://www.svd.se/feed/articles.rss', source: 'SvD', lang: 'sv', jurisdiction: 'Sverige Sweden' },
    { url: 'https://api.sr.se/api/rss/program/83', source: 'Sveriges Radio Ekot', lang: 'sv', jurisdiction: 'Sverige Sweden' },
  ],
  NO: [
    { url: 'https://www.nrk.no/toppsaker.rss', source: 'NRK', lang: 'no', jurisdiction: 'Norge Norway' },
    { url: 'https://www.vg.no/rss/feed/', source: 'VG', lang: 'no', jurisdiction: 'Norge Norway' },
    { url: 'https://www.aftenposten.no/rss', source: 'Aftenposten', lang: 'no', jurisdiction: 'Norge Norway' },
  ],
  DK: [
    { url: 'https://www.dr.dk/nyheder/service/feeds/allenyheder', source: 'DR Nyheder', lang: 'da', jurisdiction: 'Danmark Denmark' },
  ],
  FI: [
    { url: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET', source: 'Yle Uutiset', lang: 'fi', jurisdiction: 'Suomi Finland' },
  ],
  GB: [
    { url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', source: 'BBC News', lang: 'en', jurisdiction: 'United Kingdom Britain' },
    { url: 'https://uk.news.yahoo.com/rss/', source: 'Yahoo News UK', lang: 'en', jurisdiction: 'United Kingdom Britain' },
    { url: 'https://www.theguardian.com/uk/rss', source: 'The Guardian', lang: 'en', jurisdiction: 'United Kingdom Britain' },
    { url: 'https://feeds.skynews.com/feeds/rss/uk.xml', source: 'Sky News', lang: 'en', jurisdiction: 'United Kingdom Britain' },
  ],
  IE: [
    { url: 'https://www.rte.ie/feeds/rss/?index=/news/', source: 'RTÉ News', lang: 'en', jurisdiction: 'Ireland Dublin' },
    { url: 'https://www.irishtimes.com/cmlink/news-1.1319192', source: 'Irish Times', lang: 'en', jurisdiction: 'Ireland Dublin' },
  ],
  US: [
    { url: 'https://news.yahoo.com/rss/', source: 'Yahoo News', lang: 'en', jurisdiction: 'United States' },
    { url: 'https://feeds.npr.org/1001/rss.xml', source: 'NPR', lang: 'en', jurisdiction: 'United States' },
    { url: 'https://abcnews.go.com/abcnews/topstories', source: 'ABC News', lang: 'en', jurisdiction: 'United States' },
    { url: 'https://www.cbsnews.com/latest/rss/main', source: 'CBS News', lang: 'en', jurisdiction: 'United States' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', source: 'NY Times', lang: 'en', jurisdiction: 'United States' },
  ],
  DE: [
    { url: 'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml', source: 'Tagesschau', lang: 'de', jurisdiction: 'Deutschland Germany' },
    { url: 'https://de.nachrichten.yahoo.com/rss/', source: 'Yahoo Nachrichten', lang: 'de', jurisdiction: 'Deutschland Germany' },
    { url: 'https://www.spiegel.de/schlagzeilen/index.rss', source: 'Der Spiegel', lang: 'de', jurisdiction: 'Deutschland Germany' },
    { url: 'https://rss.dw.com/rdf/rss-de-all', source: 'DW Deutsch', lang: 'de', jurisdiction: 'Deutschland Germany' },
  ],
  AT: [
    { url: 'https://rss.orf.at/news.xml', source: 'ORF News', lang: 'de', jurisdiction: 'Österreich Austria' },
    { url: 'https://www.derstandard.at/rss', source: 'Der Standard', lang: 'de', jurisdiction: 'Österreich Austria' },
  ],
  CH: [
    { url: 'https://www.swissinfo.ch/eng/rss/top-news', source: 'SWI swissinfo', lang: 'en', jurisdiction: 'Switzerland Schweiz' },
    { url: 'https://www.srf.ch/news/bnf/rss/1646', source: 'SRF News', lang: 'de', jurisdiction: 'Switzerland Schweiz' },
  ],
  FR: [
    { url: 'https://www.france24.com/fr/rss', source: 'France 24', lang: 'fr', jurisdiction: 'France' },
    { url: 'https://fr.news.yahoo.com/rss/', source: 'Yahoo Actualités', lang: 'fr', jurisdiction: 'France' },
    { url: 'https://www.lemonde.fr/rss/une.xml', source: 'Le Monde', lang: 'fr', jurisdiction: 'France' },
    { url: 'https://www.francetvinfo.fr/titres.rss', source: 'Franceinfo', lang: 'fr', jurisdiction: 'France' },
  ],
  ES: [
    { url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', source: 'El País', lang: 'es', jurisdiction: 'España Spain' },
    { url: 'https://es.noticias.yahoo.com/rss/', source: 'Yahoo Noticias', lang: 'es', jurisdiction: 'España Spain' },
    { url: 'https://api2.rtve.es/rss/temas_noticias.xml', source: 'RTVE', lang: 'es', jurisdiction: 'España Spain' },
  ],
  PT: [
    { url: 'https://www.rtp.pt/noticias/rss', source: 'RTP Notícias', lang: 'pt', jurisdiction: 'Portugal' },
  ],
  IT: [
    { url: 'https://www.ansa.it/sito/ansait_rss.xml', source: 'ANSA', lang: 'it', jurisdiction: 'Italia Italy' },
    { url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', source: 'La Repubblica', lang: 'it', jurisdiction: 'Italia Italy' },
  ],
  NL: [
    { url: 'https://feeds.nos.nl/nosnieuwsalgemeen', source: 'NOS Nieuws', lang: 'nl', jurisdiction: 'Nederland Netherlands' },
    { url: 'https://www.nu.nl/rss/Algemeen', source: 'NU.nl', lang: 'nl', jurisdiction: 'Nederland Netherlands' },
  ],
  BE: [
    { url: 'https://www.vrt.be/vrtnws/nl.rss.articles.xml', source: 'VRT NWS', lang: 'nl', jurisdiction: 'Belgium België' },
  ],
  PL: [
    { url: 'https://tvn24.pl/najnowsze.xml', source: 'TVN24', lang: 'pl', jurisdiction: 'Polska Poland' },
  ],
  GR: [
    { url: 'https://www.ekathimerini.com/feed/', source: 'Ekathimerini', lang: 'en', jurisdiction: 'Greece Athens' },
  ],
  UA: [
    { url: 'https://www.pravda.com.ua/eng/rss/', source: 'Ukrainska Pravda', lang: 'en', jurisdiction: 'Ukraine Kyiv' },
    { url: 'https://kyivindependent.com/feed/', source: 'Kyiv Independent', lang: 'en', jurisdiction: 'Ukraine Kyiv' },
  ],
  TR: [
    { url: 'https://feeds.bbci.co.uk/turkce/rss.xml', source: 'BBC Türkçe', lang: 'tr', jurisdiction: 'Türkiye Turkey' },
    { url: 'https://www.trthaber.com/sondakika.rss', source: 'TRT Haber', lang: 'tr', jurisdiction: 'Türkiye Turkey' },
    { url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel', source: 'Anadolu Ajansı', lang: 'tr', jurisdiction: 'Türkiye Turkey' },
  ],
  IQ: [
    { url: 'https://www.rudaw.net/english/rss', source: 'Rudaw', lang: 'en', jurisdiction: 'Iraq Kurdistan Erbil' },
    { url: 'https://www.rudaw.net/kurmanci/rss', source: 'Rudaw Kurmancî', lang: 'ku', jurisdiction: 'Iraq Kurdistan Erbil Hewler' },
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', source: 'BBC Arabic', lang: 'ar', jurisdiction: 'Iraq العراق' },
  ],
  SY: [
    { url: 'https://www.rudaw.net/english/rss', source: 'Rudaw', lang: 'en', jurisdiction: 'Syria Qamishli' },
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', source: 'BBC Arabic', lang: 'ar', jurisdiction: 'Syria سوريا' },
  ],
  AE: [
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', source: 'BBC Arabic', lang: 'ar', jurisdiction: 'UAE Dubai' },
    { url: 'https://www.france24.com/ar/rss', source: 'France 24 Arabic', lang: 'ar', jurisdiction: 'UAE Dubai' },
  ],
  SA: [
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', source: 'BBC Arabic', lang: 'ar', jurisdiction: 'Saudi Arabia' },
    { url: 'https://www.france24.com/ar/rss', source: 'France 24 Arabic', lang: 'ar', jurisdiction: 'Saudi Arabia' },
  ],
  EG: [
    { url: 'https://feeds.bbci.co.uk/arabic/rss.xml', source: 'BBC Arabic', lang: 'ar', jurisdiction: 'Egypt Cairo' },
    { url: 'https://www.france24.com/ar/rss', source: 'France 24 Arabic', lang: 'ar', jurisdiction: 'Egypt Cairo' },
  ],
  TH: [
    { url: 'https://www.bangkokpost.com/rss/data/topstories.xml', source: 'Bangkok Post', lang: 'en', jurisdiction: 'Thailand Bangkok' },
    { url: 'https://thethaiger.com/feed', source: 'The Thaiger', lang: 'en', jurisdiction: 'Thailand Phuket Bangkok' },
    { url: 'https://www.thephuketnews.com/rss-xml/news.xml', source: 'The Phuket News', lang: 'en', jurisdiction: 'Phuket Thailand' },
  ],
  JP: [
    { url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', source: 'NHK News', lang: 'ja', jurisdiction: 'Japan 日本' },
    { url: 'https://news.yahoo.co.jp/rss/topics/top-picks.xml', source: 'Yahoo! Japan', lang: 'ja', jurisdiction: 'Japan 日本' },
  ],
  KR: [
    { url: 'https://www.koreaherald.com/common/rss_xml.php?ct=102', source: 'Korea Herald', lang: 'en', jurisdiction: 'South Korea Seoul' },
  ],
  IN: [
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', source: 'Times of India', lang: 'en', jurisdiction: 'India' },
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', source: 'The Hindu', lang: 'en', jurisdiction: 'India' },
  ],
  SG: [
    { url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml', source: 'CNA Singapore', lang: 'en', jurisdiction: 'Singapore' },
  ],
  HK: [
    { url: 'https://www.scmp.com/rss/91/feed', source: 'SCMP', lang: 'en', jurisdiction: 'Hong Kong China' },
  ],
  AU: [
    { url: 'https://www.abc.net.au/news/feed/2942460/rss.xml', source: 'ABC Australia', lang: 'en', jurisdiction: 'Australia' },
    { url: 'https://www.sbs.com.au/news/feed', source: 'SBS News', lang: 'en', jurisdiction: 'Australia' },
  ],
  NZ: [
    { url: 'https://www.rnz.co.nz/rss/national.xml', source: 'RNZ', lang: 'en', jurisdiction: 'New Zealand' },
  ],
  CA: [
    { url: 'https://www.cbc.ca/webfeed/rss/rss-topstories', source: 'CBC News', lang: 'en', jurisdiction: 'Canada' },
    { url: 'https://ca.news.yahoo.com/rss/', source: 'Yahoo News Canada', lang: 'en', jurisdiction: 'Canada' },
  ],
  BR: [
    { url: 'https://g1.globo.com/rss/g1/', source: 'G1 Globo', lang: 'pt', jurisdiction: 'Brasil Brazil' },
  ],
  MX: [
    { url: 'https://www.eluniversal.com.mx/arc/outboundfeeds/rss/', source: 'El Universal', lang: 'es', jurisdiction: 'México Mexico' },
  ],
  AR: [
    { url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/', source: 'La Nación', lang: 'es', jurisdiction: 'Argentina' },
  ],
  ZA: [
    { url: 'https://feeds.24.com/articles/news24/TopStories/rss', source: 'News24', lang: 'en', jurisdiction: 'South Africa' },
  ],
}

const SE_LOCAL_SVT: { match: string[]; slug: string; label: string }[] = [
  { match: ['stockholm', 'stockholms lan', 'solna', 'sundbyberg', 'kista', 'husby', 'rinkeby', 'tensta', 'huddinge', 'nacka', 'sodertalje', 'taby', 'botkyrka', 'haninge'], slug: 'stockholm', label: 'SVT Stockholm' },
  { match: ['goteborg', 'gothenburg', 'vastra gotaland', 'molndal', 'partille', 'kungalv', 'boras'], slug: 'vast', label: 'SVT Väst' },
  { match: ['malmo', 'skane', 'lund', 'helsingborg', 'kristianstad', 'landskrona', 'trelleborg'], slug: 'skane', label: 'SVT Skåne' },
  { match: ['uppsala', 'uppsala lan', 'enkoping'], slug: 'uppsala', label: 'SVT Uppsala' },
  { match: ['linkoping', 'norrkoping', 'ostergotland'], slug: 'ost', label: 'SVT Öst' },
  { match: ['orebro', 'orebro lan'], slug: 'orebro', label: 'SVT Örebro' },
  { match: ['umea', 'skelleftea', 'vasterbotten'], slug: 'vasterbotten', label: 'SVT Västerbotten' },
  { match: ['lulea', 'kiruna', 'norrbotten'], slug: 'norrbotten', label: 'SVT Norrbotten' },
]

const GLOBAL_NEWS_FEEDS: DirectNewsFeed[] = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', lang: 'en' },
  { url: 'https://news.yahoo.com/rss/world', source: 'Yahoo World', lang: 'en' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', lang: 'en' },
  { url: 'https://www.theguardian.com/world/rss', source: 'The Guardian', lang: 'en' },
  { url: 'https://www.euronews.com/rss', source: 'Euronews', lang: 'en' },
  { url: 'https://rss.dw.com/rdf/rss-en-all', source: 'DW', lang: 'en' },
  { url: 'https://www.france24.com/en/rss', source: 'France 24', lang: 'en' },
]

/** Returns direct, free official broadcaster & newspaper RSS feeds relevant to the selected place. */
export function directNewsFeedsFor(place: Place, from: number): DirectNewsFeed[] {
  const cc = (place.cc ?? '').toUpperCase()
  const own = place.parts[from] ?? place.parts[0]
  const allNorms = place.parts.map((p) => norm(p.name))
  const out: DirectNewsFeed[] = []

  if (cc === 'SE') {
    const regional = SE_LOCAL_SVT.find((r) => allNorms.some((n) => r.match.includes(n)))
    if (regional) {
      out.push({
        url: `https://www.svt.se/nyheter/lokalt/${regional.slug}/rss.xml`,
        source: regional.label,
        lang: 'sv',
      })
    }
  }

  const countryFeeds = COUNTRY_NEWS_FEEDS[cc]
  if (countryFeeds) {
    out.push(...countryFeeds.map((f) => (own?.level === 'country' ? f : { ...f, jurisdiction: undefined })))
  }

  // Always include top global wires when viewing a country or when no country-specific direct feed is registered
  if (!countryFeeds || own?.level === 'country') {
    out.push(...GLOBAL_NEWS_FEEDS.slice(0, countryFeeds ? 3 : 5))
  }

  return out.slice(0, 8)
}

const directNewsCache = new LruCache<string, Article[]>(100, 120_000)

async function fetchNewsFeedText(targetUrl: string, apiBase: string, signal?: AbortSignal): Promise<string> {
  const directAndroid = await nativeAndroidFetchText(targetUrl, { signal })
  if (directAndroid && directAndroid.trim().length > 40) return directAndroid

  const timeoutSig = signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)
  if (apiBase) {
    try {
      const r = await fetch(`${apiBase}/rss?url=${encodeURIComponent(targetUrl)}`, { signal: timeoutSig })
      if (r.ok) {
        const txt = await r.text()
        if (txt.trim().length > 40) return txt
      }
    } catch (e) {
      if (signal?.aborted) throw e
    }
  }

  const bridgeSig = signal ? AbortSignal.any([signal, AbortSignal.timeout(5500)]) : AbortSignal.timeout(5500)
  return Promise.any([
    fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`, { signal: bridgeSig }).then(async (r) => {
      if (!r.ok) throw new Error('err.source')
      const t = await r.text()
      if (t.trim().length < 40) throw new Error('err.source')
      return t
    }),
    fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, { signal: bridgeSig }).then(async (r) => {
      if (!r.ok) throw new Error('err.source')
      const t = await r.text()
      if (t.trim().length < 40) throw new Error('err.source')
      return t
    }),
  ])
}

/**
 * Fetches latest headlines directly from free major newsrooms worldwide (SVT, DN, Aftonbladet, Yahoo News, BBC,
 * Guardian, NPR, Tagesschau, France 24, Euronews, Al Jazeera, Rudaw, NHK, G1, Times of India, News24, etc.)
 * in parallel with Google News, Bing News, and Yahoo News Search for faster breaking updates.
 */
export async function fetchDirectNewsFeeds(
  place: Place,
  from: number,
  apiBase: string,
  signal?: AbortSignal,
): Promise<Article[]> {
  const feeds = directNewsFeedsFor(place, from)
  if (!feeds.length) return []

  const settled = await Promise.allSettled(
    feeds.map(async (f) => {
      const cached = directNewsCache.get(f.url)
      if (cached) return cached
      const raw = await fetchNewsFeedText(f.url, apiBase, signal)
      // Reuse the battle-tested RSS/Atom XML parser and strip the `police` flag
      const items = parsePoliceFeedXml(raw, f.source, f.lang, f.jurisdiction).map(({ police: _p, ...rest }) => rest)
      directNewsCache.set(f.url, items)
      return items
    }),
  )
  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
}

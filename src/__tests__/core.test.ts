import { describe, expect, it } from 'vitest'
import { type Area, type Areas, bounds, inside, kidsOf, labelPoint, link, norm } from '../areas'
import { toggleSavedItem } from '../bookmarks'
import { clusterArticles } from '../cluster'
import { editionFor, wordsFor } from '../editions'
import { localSubreddits } from '../forums'
import {
  type Article,
  type Place,
  clampDate,
  flashbackCreated,
  inQuiet,
  mentionsPlace,
  parseBingRssXml,
  parseFlashbackDate,
  parseGdeltDate,
  parseRss2JsonPayload,
  placeAliases,
  rankImportantForum,
  rankMostCovered,
  streetBaseName,
  target,
  toPlace,
} from '../lib'
import { weatherSymbol } from '../weather'
import { circle, rings } from '../overpass'
import { STOP, hotWords, topicCounts, topicsOf } from '../topics'
import { decodePlace, encodePlace, readHashPlace } from '../urlState'
// @ts-expect-error Worker module is plain ESM JS
import worker, { encryptWebPush, getOrCreateVapid, signVapidJwt } from '../../worker/index.js'

const art = (title: string, source = 'SVT', hoursAgo = 1, extra: Partial<Article> = {}): Article => ({
  url: `https://example.com/${encodeURIComponent(title)}-${source}`,
  title,
  source,
  date: new Date(Date.now() - hoursAgo * 3600_000),
  ...extra,
})

describe('norm() Unicode & administrative normalisation', () => {
  it('folds Swedish, Turkish, Nordic, German and Polish characters', () => {
    expect(norm('Rådhusgatan, Örebro kommun')).toBe('radhusgatan orebro')
    expect(norm('Diyarbakır İli')).toBe('diyarbakir')
    expect(norm('København & Łódź Straße')).toBe('kobenhavn lodz strasse')
  })

  it('preserves Arabic, Cyrillic, Greek and Japanese scripts instead of stripping them', () => {
    expect(norm('محافظة القاهرة')).toBe('القاهره')
    expect(norm('إمارة أبوظبي')).toContain('ابوظبي')
    expect(norm('Київ')).toBe('киів')
    expect(norm('東京都')).toBe('東京都')
  })
})

describe('topics.ts STOP list, topicsOf & hotWords', () => {
  it('populates STOP with full normalized words rather than single characters', () => {
    expect(STOP.has('januari')).toBe(true)
    expect(STOP.has('november')).toBe(true)
    expect(STOP.has('lordag')).toBe(true)
    expect(STOP.has('mellan')).toBe(true)
    expect(STOP.has('about')).toBe(true)
    expect(STOP.has('fevrier')).toBe(true)
    expect(STOP.has('agustos')).toBe(true)
    expect(STOP.has('الذين')).toBe(true)
    expect(STOP.has(',')).toBe(false)
  })

  it('filters out months, weekdays, stop words and place name in hotWords()', () => {
    const articles = [
      art('Stor utredning kring tunnelbanan i Kista under november måndag'),
      art('Ny utredning om tunnelbanan i Kista efter fredag november'),
      art('Kista får utredning om tunnelbanan mellan stationer'),
    ]
    const words = hotWords(articles, 'Kista').map(([w]) => w)
    expect(words).toContain('utredning')
    expect(words).toContain('tunnelbanan')
    expect(words).not.toContain('november')
    expect(words).not.toContain('mandag')
    expect(words).not.toContain('fredag')
    expect(words).not.toContain('kista')
    expect(words).not.toContain('mellan')
    expect(words).not.toContain('under')
  })

  it('extracts Arabic hot words with compact script threshold', () => {
    const articles = [
      art('افتتاح محطة مترو جديدة في دبي هذا الصباح'),
      art('توسعة محطة مترو دبي خلال العام الجديد'),
    ]
    const words = hotWords(articles, 'دبي').map(([w]) => w)
    expect(words).toContain('محطه')
    expect(words).toContain('مترو')
    expect(words).not.toContain('دبي')
  })

  it('classifies topics across Swedish, English, Turkish and Arabic', () => {
    expect(topicsOf('Polisen utreder skjutning i centrum')).toContain('Crime')
    expect(topicsOf('Kraftig brand i lägenhetshus')).toEqual(expect.arrayContaining(['Accident', 'Housing']))
    expect(topicsOf('İstanbul metro hattında arıza: trafik durdu')).toContain('Traffic')
    expect(topicsOf('حريق كبير في مستشفى مركزي')).toEqual(expect.arrayContaining(['Accident', 'Health']))
    const counts = topicCounts([art('Polis grep misstänkt'), art('Polis på plats vid rån'), art('Ny skola byggs')])
    expect(counts[0]).toEqual(['Crime', 2])
  })
})

describe('clusterArticles() multi-source event deduplication', () => {
  it('clusters duplicate coverage of the same incident while keeping distinct local news separate', () => {
    const list = [
      art('Kraftig brand i flerfamiljshus i Kista i natt', 'SVT Nyheter', 1),
      art('Stor brand i flerfamiljshus i Kista under natten', 'Dagens Nyheter', 2),
      art('Brand i flerfamiljshus i Kista – räddningstjänsten larmades under natten', 'Mitt i', 3),
      art('Ny förskola öppnar i Kista nästa vecka', 'Mitt i', 4),
      art('Trafikolycka på E4 vid Kista skapar köer', 'Aftonbladet', 5),
    ]
    const clustered = clusterArticles(list, 'Kista')
    expect(clustered).toHaveLength(3)
    expect(clustered[0].title).toBe('Kraftig brand i flerfamiljshus i Kista i natt')
    expect(clustered[0].also).toHaveLength(2)
    expect(clustered[0].also?.map((x) => x.source)).toEqual(['Dagens Nyheter', 'Mitt i'])
  })

  it('never merges forum threads even when titles overlap', () => {
    const list = [
      art('Diskussion om ny tunnelbana i Kista', 'flashback', 1, { forum: true }),
      art('Tråd om ny tunnelbana i Kista', 'reddit r/stockholm', 2, { forum: true }),
    ]
    expect(clusterArticles(list, 'Kista')).toHaveLength(2)
  })
})

describe('editions.ts global news editions', () => {
  it('maps global countries to their local language editions instead of defaulting everything to US', () => {
    expect(editionFor('SE')).toMatchObject({ cc: 'SE', hl: 'sv', lang: 'sv' })
    expect(editionFor('NO')).toMatchObject({ cc: 'NO', hl: 'no', lang: 'no' })
    expect(editionFor('FI')).toMatchObject({ cc: 'FI', hl: 'fi', lang: 'fi' })
    expect(editionFor('JP')).toMatchObject({ cc: 'JP', hl: 'ja', lang: 'ja' })
    expect(editionFor('BR')).toMatchObject({ cc: 'BR', hl: 'pt-BR', lang: 'pt' })
    expect(editionFor('EG')).toMatchObject({ cc: 'EG', hl: 'ar', lang: 'ar' })
    expect(wordsFor('NO')).toContain('politi')
  })
})

describe('areas.ts & overpass.ts geometry helpers', () => {
  const outer: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
  const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
  const donut: Area['geometry'] = { type: 'Polygon', coordinates: [outer, hole] }

  it('respects inner-ring holes (enclaves/lakes) in inside() and labelPoint()', () => {
    expect(inside([2, 2], donut)).toBe(true)
    expect(inside([5, 5], donut)).toBe(false) // inside enclave hole
    expect(inside([15, 5], donut)).toBe(false)
    const lp = labelPoint(donut)
    expect(inside(lp, donut)).toBe(true)
  })

  it('handles antimeridian-spanning MultiPolygons without spanning [-180, 180]', () => {
    const anti: Area['geometry'] = {
      type: 'MultiPolygon',
      coordinates: [
        [[[170, 50], [179.9, 50], [179.9, 65], [170, 65], [170, 50]]],
        [[[-179.9, 52], [-175, 52], [-175, 55], [-179.9, 55], [-179.9, 52]]],
      ],
    }
    const [[w, s], [e, n]] = bounds(anti)
    expect(e - w).toBeLessThan(30)
    expect(s).toBe(50)
    expect(n).toBe(65)
  })

  it('links districts to parent provinces and stitches boundary ways into closed rings', () => {
    const adm1: Areas = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Stockholm' }, geometry: { type: 'Polygon', coordinates: [outer] } }] }
    const adm2: Areas = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Kista' }, geometry: circle([2, 2], 500) }] }
    expect(kidsOf(adm1.features[0], adm2).map((f) => f.properties.name)).toEqual(['Kista'])
    link(adm1, adm2)
    expect(adm2.features[0].properties.parent).toBe('Stockholm')

    const joined = rings([
      [[0, 0], [5, 0]],
      [[5, 5], [5, 0]], // reversed segment
      [[5, 5], [0, 5], [0, 0]],
    ])
    expect(joined).toHaveLength(1)
    expect(joined[0][0]).toEqual(joined[0][joined[0].length - 1])
  })
})

describe('urlState.ts UTF-8 encoding & legacy compatibility', () => {
  it('round-trips Places with Nordic, Turkish and Arabic characters plus breadcrumb level', () => {
    const p: Place = {
      lat: 59.40316,
      lon: 17.94479,
      cc: 'se',
      parts: [
        { level: 'street', name: 'Ribegatan' },
        { level: 'district', name: 'Kista – Ärvinge' },
        { level: 'city', name: 'Stockholm' },
        { level: 'country', name: 'Sverige' },
      ],
    }
    const token = encodePlace(p, 1)
    const decoded = readHashPlace(`#p=${token}`)
    expect(decoded?.level).toBe(1)
    expect(decoded?.place.parts.map((x) => x.name)).toEqual(p.parts.map((x) => x.name))
  })

  it('decodes legacy URI-escaped base64 #p= links', () => {
    const legacyObj = { lat: 41.0082, lon: 28.9784, cc: 'tr', parts: [{ level: 'city', name: 'İstanbul' }] }
    const bytes = new TextEncoder().encode(JSON.stringify(legacyObj))
    const legacyB64 = encodeURIComponent(btoa(String.fromCharCode(...bytes)))
    const decoded = decodePlace(legacyB64)
    expect(decoded?.place.parts[0].name).toBe('İstanbul')
  })
})

describe('lib.ts helpers & Worker RFC 8291 Web Push encryption', () => {
  it('evaluates quiet hours across midnight and daytime windows', () => {
    const night = { on: true, from: '22:00', to: '07:00' }
    expect(inQuiet(night, new Date('2026-11-08T23:15:00'))).toBe(true)
    expect(inQuiet(night, new Date('2026-11-08T06:30:00'))).toBe(true)
    expect(inQuiet(night, new Date('2026-11-08T12:00:00'))).toBe(false)
    expect(inQuiet({ ...night, on: false }, new Date('2026-11-08T23:15:00'))).toBe(false)
  })

  it('estimates Flashback thread creation dates monotonically and builds precise targets', () => {
    expect(+flashbackCreated(3750000)).toBeGreaterThan(+flashbackCreated(3507628))
    const p: Place = {
      lat: 59.4,
      lon: 17.94,
      cc: 'SE',
      parts: [
        { level: 'street', name: 'Borgarfjordsgatan' },
        { level: 'district', name: 'Kista' },
        { level: 'city', name: 'Stockholm' },
      ],
    }
    const t = target(p, 0)
    expect(t.queries).toEqual([
      '"Borgarfjordsgatan" "Kista"',
      '"Borgarfjordsgatan" "Stockholm"',
      '"Borgarfjordsgatan" Kista',
      '"Borgarfjordsgatan" Stockholm',
      '"Borgarfjordsgatan"',
    ])
    expect(t.key).toBe('borgarfjordsgatan')
  })

  it('includes unquoted city context and standalone exact queries for 4–5 letter districts like Husby and Kista', () => {
    const husby: Place = {
      lat: 59.409,
      lon: 17.927,
      cc: 'SE',
      parts: [
        { level: 'district', name: 'Husby' },
        { level: 'city', name: 'Stockholm' },
        { level: 'country', name: 'Sverige' },
      ],
    }
    const t = target(husby, 0)
    expect(t.queries).toContain('"Husby" "Stockholm"')
    expect(t.queries).toContain('"Husby" Stockholm')
    expect(t.queries).toContain('"Husby"')
    expect(mentionsPlace('Husby FF tog hem guldet i cupen', t.aliases)).toBe(true)
    expect(mentionsPlace('Lastbil fastnade under bro i Husby', t.aliases)).toBe(true)
    expect(mentionsPlace('Tre torg i Husby rustas upp', t.aliases)).toBe(true)
    expect(mentionsPlace('Allmän trafikolycka i centrala Stockholm', t.aliases)).toBe(false)
  })

  it('prevents metropolitan capitals like Diyarbakır from being inverted under inner sub-municipalities like Sur', () => {
    const diyarbakir = toPlace({
      geometry: { coordinates: [40.23, 37.91] },
      properties: { name: 'Diyarbakır', type: 'district', city: 'Sur', state: 'Diyarbakır', country: 'Türkiye', countrycode: 'TR' },
    })
    expect(diyarbakir.parts).toEqual([
      { level: 'city', name: 'Diyarbakır' },
      { level: 'country', name: 'Türkiye' },
    ])
    expect(target(diyarbakir, 0).queries).toEqual(['"Diyarbakır"'])

    const gdeltDate = parseGdeltDate('20261108T113000Z')
    expect(gdeltDate.toISOString()).toBe('2026-11-08T11:30:00.000Z')
  })

  it('supports bookmarks, WMO weather symbols, and localized subreddit mapping', () => {
    const item = {
      url: 'https://example.com/a',
      title: 'Lokal nyhet i Kista',
      source: 'Lokaltidningen',
      dateIso: '2026-11-08T10:00:00.000Z',
      placeName: 'Kista',
    }
    const added = toggleSavedItem([], item)
    expect(added).toHaveLength(1)
    expect(added[0].title).toBe('Lokal nyhet i Kista')
    const removed = toggleSavedItem(added, item)
    expect(removed).toHaveLength(0)

    expect(weatherSymbol(0)).toEqual({ icon: '☀', severe: false })
    expect(weatherSymbol(95)).toEqual({ icon: '⛈', severe: true })

    expect(localSubreddits('TR', ['İstanbul', 'Türkiye'])).toContain('Turkey')
    expect(localSubreddits('TR', ['İstanbul', 'Türkiye'])).toContain('istanbul')
    expect(localSubreddits('SE', ['Kista', 'Stockholm', 'Sverige'])).toContain('stockholm')
    expect(localSubreddits('DE', ['Berlin', 'Deutschland'])).toContain('berlin')
  })

  it('encrypts RFC 8291 aes128gcm Web Push payloads and signs ES256 VAPID JWTs', async () => {
    const uaKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const uaPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey))
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const toB64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const body = await encryptWebPush(JSON.stringify({ title: 'Kista', body: 'Ny händelse' }), toB64u(uaPubRaw), toB64u(auth))
    expect(body.byteLength).toBeGreaterThan(86)
    expect(body[20]).toBe(65) // uncompressed P-256 server public key length in aes128gcm header

    const vapidPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const privJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey)
    const jwt = await signVapidJwt('https://fcm.googleapis.com/fcm/send/abc', JSON.stringify(privJwk))
    expect(jwt.split('.')).toHaveLength(3)
  })

  it('auto-generates and persists VAPID keys in SUBS_KV when env secrets are omitted', async () => {
    const store = new Map<string, string>()
    const mockEnv = {
      SUBS_KV: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => { store.set(k, v) },
      },
    }
    const v1 = await getOrCreateVapid(mockEnv)
    expect(v1?.publicKey.length).toBeGreaterThan(80)
    const v2 = await getOrCreateVapid(mockEnv)
    expect(v2?.publicKey).toBe(v1?.publicKey)
  })

  it('handles exact home addresses (house numbers), Flashback Idag/Igår dates, forum importance ranking & #tab=forum deep links', () => {
    expect(streetBaseName('Sveavägen 44B')).toBe('Sveavägen')
    expect(streetBaseName('12 Rue de Rivoli')).toBe('Rue de Rivoli')
    expect(streetBaseName('İstiklal Caddesi No: 18')).toBe('İstiklal Caddesi')

    const home = toPlace({
      geometry: { coordinates: [18.06, 59.34] },
      properties: {
        type: 'house',
        street: 'Sveavägen',
        housenumber: '44',
        district: 'Norrmalm',
        city: 'Stockholm',
        country: 'Sverige',
        countrycode: 'SE',
      },
    })
    expect(home.parts[0]).toEqual({ level: 'street', name: 'Sveavägen 44' })
    const homeTarget = target(home, 0)
    expect(homeTarget.key).toBe('sveavagen')
    expect(homeTarget.queries[0]).toBe('"Sveavägen 44" "Norrmalm"')
    expect(homeTarget.queries).toContain('"Sveavägen" "Norrmalm"')

    const refNow = new Date('2026-11-08T15:00:00Z')
    expect(parseFlashbackDate('Idag 14:25', refNow)?.getHours()).toBe(14)
    expect(parseFlashbackDate('Igår 23:10', refNow)?.getDate()).toBe(7)
    expect(parseFlashbackDate('2026-11-05 09:30', refNow)?.getFullYear()).toBe(2026)
    expect(parseFlashbackDate('2024-05-12, 14:22', refNow)?.getFullYear()).toBe(2024)

    // Future-dated RSS timestamps are clamped so real newest items stay #01
    const future = clampDate(new Date(Date.now() + 86_400_000))
    expect(+future).toBeLessThanOrEqual(Date.now() + 1000)

    // Forum spotlight ranking prioritizes urgent incidents + active comment counts
    const threads: Article[] = [
      art('Allmän fråga om vädret på Sveavägen', 'reddit r/stockholm (2)', 1, { forum: true, comments: 2, score: 6 }),
      art('Polisinsats och brand på Sveavägen 44 just nu', 'flashback · Brott (95)', 2, { forum: true, comments: 95, score: 285 }),
      art('Diskussion om trafiken på Sveavägen', 'reddit r/stockholm (45)', 3, { forum: true, comments: 45, score: 135 }),
    ]
    const ranked = rankImportantForum(threads, 3)
    expect(ranked[0].title).toContain('Sveavägen 44')
    expect(ranked[1].title).toContain('trafiken')

    // Push notification deep links with &tab=forum open directly into Forum tab
    const forumHash = `#p=${encodePlace(home, 0)}&tab=forum`
    const route = readHashPlace(forumHash)
    expect(route?.tab).toBe('forum')
    expect(route?.place.parts[0].name).toBe('Sveavägen 44')
  })

  it('strictly matches exact places (Ribegatan, Phuket, venues, Åre, Lund) without leaking parent-city junk', () => {
    const ribeAliases = placeAliases({ level: 'street', name: 'Ribegatan 144' }, 'SE')
    expect(mentionsPlace('Polisinsats på Ribegatan i Husby i natt', ribeAliases)).toBe(true)
    expect(mentionsPlace('Boende längs Ribegatans norra del hörde smäll', ribeAliases)).toBe(true)
    // Unrelated Stockholm / general Lemmy posts must NEVER match Ribegatan
    expect(mentionsPlace('Att få 7 till 8 timmars sömn i Stockholm', ribeAliases)).toBe(false)
    expect(mentionsPlace('[Nyheter] Alfa Laval satsar 700 miljoner USD på NAVTOR', ribeAliases)).toBe(false)

    // Phuket (island / city)
    const phuketIsland = toPlace({
      geometry: { coordinates: [98.39, 7.88] },
      properties: { osm_value: 'island', type: 'other', name: 'Phuket', country: 'Thailand', countrycode: 'TH' },
    })
    expect(phuketIsland.parts[0]).toEqual({ level: 'city', name: 'Phuket' })
    const phuketAliases = placeAliases(phuketIsland.parts[0], 'TH')
    expect(mentionsPlace('Heavy rain causes flooding in Phuket Old Town', phuketAliases)).toBe(true)
    expect(mentionsPlace('Reseguide till Phukets bästa stränder', phuketAliases)).toBe(true)
    expect(mentionsPlace('Bangkok stock exchange closes higher in Thailand', phuketAliases)).toBe(false)

    // Named venue / lokal ("Kista Galleria")
    const venue = toPlace({
      geometry: { coordinates: [17.94, 59.4] },
      properties: { type: 'other', name: 'Kista Galleria', street: 'Kistagången', district: 'Kista', city: 'Stockholm', country: 'Sverige', countrycode: 'SE' },
    })
    expect(venue.parts[0]).toEqual({ level: 'street', name: 'Kista Galleria' })

    // Short / accented names ("Åre", "Lund") avoid false positives ("are", "Lundqvist")
    expect(mentionsPlace('Rekordmånga bokar skidresa till Åre', ['Åre'])).toBe(true)
    expect(mentionsPlace('Why are people sleeping less than 7 hours', ['Åre'])).toBe(false)
    expect(mentionsPlace('Lunds universitet klättrar i ny rankning', ['Lund'])).toBe(true)
    expect(mentionsPlace('Henrik Lundqvist hyllas i New York', ['Lund'])).toBe(false)

    // Country exonyms ("Sverige" <-> "Sweden")
    const seAliases = placeAliases({ level: 'country', name: 'Sverige' }, 'SE')
    expect(mentionsPlace('Sweden announces new rail investment', seAliases)).toBe(true)
  })

  it('sorts Most Covered (Mest omskrivet) accurately for both Forum replies and News coverage/buzz', () => {
    const forumItems: Article[] = [
      art('Ny tråd om Ribegatan nyss', 'reddit r/stockholm', 0.2, { forum: true, comments: 0, score: 1 }),
      art('Stora tråden om händelsen på Ribegatan', 'flashback · Brott (312)', 48, { forum: true, comments: 312, score: 936 }),
      art('Diskussion om renoveringen på Ribegatan', 'reddit r/stockholm (44)', 12, { forum: true, comments: 44, score: 140 }),
    ]
    const hotForum = rankMostCovered(forumItems, 'Ribegatan')
    expect(hotForum.map((x) => x.comments)).toEqual([312, 44, 0])

    const newsItems: Article[] = [
      art('Liten notis om parkering i Phuket', 'Local Paper', 1),
      art('Kraftig översvämning vid flygplatsen i Phuket stoppar flyg', 'Bangkok Post', 6),
      art('Översvämning vid flygplatsen i Phuket drabbar turister', 'Phuket News', 10),
      art('Stor brand i hamnen i Phuket under natten', 'SVT', 8, {
        also: [
          { url: 'https://a.test/1', title: 'Brand i hamnen', source: 'DN', date: new Date() },
          { url: 'https://a.test/2', title: 'Brand i Phuket', source: 'Aftonbladet', date: new Date() },
        ],
      }),
    ]
    const hotNews = rankMostCovered(newsItems, 'Phuket')
    // Multi-source cluster (+2 also) ranks #1, followed by shared buzz ("översvämning" + "flygplatsen"), then isolated story
    expect(hotNews[0].title).toContain('Stor brand i hamnen')
    expect(hotNews[1].title).toContain('översvämning')
    expect(hotNews[2].title).toContain('Översvämning')
    expect(hotNews[3].title).toContain('parkering')
  })

  it('parses Bing RSS XML, rss2json fallback payloads, and allows Worker CORS on preview and production origins', async () => {
    const bingXml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:News="http://www.bing.com/schema/news"><channel><item><title>Husby FF tog hem guldet</title><link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fwww.mitti.se%2Fhusby-ff</link><description>Stor fest i Husby i helgen.</description><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><News:Source>Mitt i</News:Source></item></channel></rss>`
    const parsedBing = parseBingRssXml(bingXml, 'sv')
    expect(parsedBing).toHaveLength(1)
    expect(parsedBing[0].url).toBe('https://www.mitti.se/husby-ff')
    expect(parsedBing[0].source).toBe('Mitt i')

    expect(() => parseBingRssXml('<html><body>Consent</body></html>', 'sv')).toThrow('err.source')

    const rss2json = JSON.stringify({
      status: 'ok',
      items: [
        {
          title: 'Lastbil fastnade under bro i Husby - Nyhetsbyrån Järva',
          pubDate: '2026-11-05 14:20:00',
          link: 'https://www.nyhetsbyranjarva.se/lastbil-i-husby/',
          description: 'Trafiken påverkades under eftermiddagen i Husby.',
        },
      ],
    })
    const parsedJson = parseRss2JsonPayload(rss2json, 'sv')
    expect(parsedJson).toHaveLength(1)
    expect(parsedJson[0].title).toBe('Lastbil fastnade under bro i Husby')
    expect(parsedJson[0].source).toBe('Nyhetsbyrån Järva')

    const preflight = await worker.fetch(
      new Request('https://newzlocal-proxy.bynrnworld.workers.dev/bn?q=Husby', {
        method: 'OPTIONS',
        headers: { Origin: 'https://5173-sandbox.e2b.app' },
      }),
      {},
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://5173-sandbox.e2b.app')

    const keyedBlocked = await worker.fetch(
      new Request('https://newzlocal-proxy.bynrnworld.workers.dev/gnews/search?q=Husby', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      { GNEWS_KEY: 'secret' },
    )
    expect(keyedBlocked.status).toBe(403)
  })
})

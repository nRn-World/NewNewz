import type { Article } from './lib'
import { norm } from './areas'
import { TOPICS, topicsOf } from './topicRules'

export { TOPICS, topicsOf }

/** Number of articles per topic, biggest first. */
export function topicCounts(list: Article[]) {
  const n = new Map<string, number>()
  for (const a of list) {
    for (const id of topicsOf(`${a.title} ${a.orig ?? ''}`, a.police)) {
      n.set(id, (n.get(id) ?? 0) + 1)
    }
  }
  return [...n].sort((a, b) => b[1] - a[1])
}

const RAW_STOP = [
  // Months & weekdays across app languages
  'januari februari mars april maj juni juli augusti september oktober november december',
  'january february march april may june july august september october november december',
  'ocak şubat mart nisan mayıs haziran temmuz ağustos eylül ekim kasım aralık',
  'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre',
  'janvier février mars avril mai juin juillet août septembre octobre novembre décembre',
  'januar februar märz april mai juni juli august september oktober november dezember',
  'måndag tisdag onsdag torsdag fredag lördag söndag',
  'monday tuesday wednesday thursday friday saturday sunday',
  'pazartesi salı çarşamba perşembe cuma cumartesi pazar',
  'lunes martes miércoles jueves viernes sábado domingo',
  'lundi mardi mercredi jeudi vendredi samedi dimanche',
  'montag dienstag mittwoch donnerstag freitag samstag sonntag',
  'يناير فبراير مارس أبريل مايو يونيو يوليو أغسطس سبتمبر أكتوبر نوفمبر ديسمبر',
  'الاثنين الثلاثاء الأربعاء الخميس الجمعة السبت الأحد',
  // Common function & filler words across sv, en, tr, es, fr, de, ar
  'och att det som på är av för med den till har inte ett men om kan från vid efter över under mellan genom sedan under kring enligt',
  'andra detta dessa eller finns hade hans hennes deras sade säger kommer ska skulle varit vara blev blir många flera',
  'the and for with that this from have not are was were will has his her their about after over into than what when where who why how',
  'you your our they them been being more most just says said new could would should there these those while during before between under',
  'nur und der die das ein eine einer einem einen ist von mit für auf den dem des sich nicht auch werden wurde nach über unter gegen zwischen',
  'les des une est dans pour que qui sur pas par plus avec sont cette comme mais tout tous après entre depuis selon contre',
  'los las del por una con para como más pero sus que sobre entre desde hasta contra durante según tras tienen puede',
  'bir ve bu için ile daha çok gibi olarak kadar sonra oldu olan var ama veya göre karşı arasında içinde üzerinden',
  'في من على إلى عن مع هذا هذه ذلك التي الذي الذين كانت كان يكون بعد قبل بين خلال حول ضد منذ',
].join(' ')

export const STOP = new Set(
  RAW_STOP.split(/\s+/)
    .flatMap((w) => norm(w).split(' '))
    .filter(Boolean),
)

const COMPACT_SCRIPT = /[\u0600-\u06ff\u3040-\u9fff\uac00-\ud7af]/

/** The words that occur most often in the headlines (no stop words), optionally without the place's own name. */
export function hotWords(list: Article[], skip = '', n = 6) {
  const count = new Map<string, number>()
  const skipN = norm(skip)
  const skipParts = new Set(skipN.split(' ').filter(Boolean))
  for (const a of list) {
    for (const w of new Set(norm(a.title).split(' '))) {
      const minLen = COMPACT_SCRIPT.test(w) ? 3 : 5
      if (
        w.length >= minLen &&
        !STOP.has(w) &&
        !skipParts.has(w) &&
        !(skipN && (skipN.includes(w) || w.includes(skipN))) &&
        !/^\d+$/.test(w)
      ) {
        count.set(w, (count.get(w) ?? 0) + 1)
      }
    }
  }
  return [...count].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n)
}

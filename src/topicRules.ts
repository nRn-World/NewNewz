// Kept free of imports: the Cloudflare Worker bundles this file too, to apply a favourite's topic filter to background alerts.

/** Topic classification by keyword prefixes in the app languages (Kurdish in both Kurmancî and Soranî spelling). No AI involved, so it is fast, free and works offline. */
const W = (s: string) => new RegExp(`(?<![\\p{L}])(?:${s})`, 'iu')

export const TOPICS: { id: string; re: RegExp }[] = [
  { id: 'Police', re: W('polisen|polisinsats|polisregion|händelsenotis|police|politiet|politiloggen|politi |politikreds|poliisi|polizei|landespolizei|bundespolizei|politie|gendarmerie|carabinieri|polizia|guardia civil|policía|emniyet|jandarma|constabulary|sheriff|polri|rcmp|saps|ตำรวจ|شرطة|경찰|警察|警視庁|поліція|полиция|αστυνομία|polîs|asayîş|پۆلیس|ئاسایش') },
  { id: 'Crime', re: W('brott|polis|skjut|mord|rån|misshandel|gripen|häktad|åtal|knivhugg|våldtäkt|narkotika|gängvåld|police|crime|shoot|murder|robber|arrest|stabb|assault|suspect|cinayet|hırsız|tutuklan|saldırı|silahlı|gözaltı|soygun|policía|crimen|asesin|robo|detenid|disparo|apuñal|délit|meurtre|vol à|agress|interpell|polizei|verbrechen|raub|festnahm|schüsse|messer|tatverdächt|شرط|جريم|قتل|سرق|اعتقال|إطلاق نار|kuşt|dizî|sûc|hat girtin|تاوان|کوشت|دزی|دەستگیر') },
  { id: 'Accident', re: W('brand|brinner|explosion|räddningstjänst|olycka|fire|blaze|explo|rescue|yangın|kaza|incendio|accidente|incendie|feuer|brennt|unfall|حريق|انفجار|حادث|şewat|teqîn|ئاگرکەوتنەوە|تەقینەوە') },
  { id: 'Traffic', re: W('trafik|väg|tåg|tunnelbana|buss|kollision|flyg|trafikverket|försening|traffic|road|train|metro|subway|bus|flight|delay|airport|yol|otobüs|uçuş|tren|havalimanı|tráfico|carretera|autobús|vuelo|retraso|circulation|route|métro|vol |verkehr|straße|zug|u-bahn|flug|stau|مرور|طريق|قطار|مترو|حافلة|مطار|trafîk|balafirgeh|هاتوچۆ|فڕۆکەخانە') },
  { id: 'Housing', re: W('bostad|lägenhet|hyra|byggs|bygga|fastighet|bostadsrätt|detaljplan|housing|apartment|rent|construction|property|real estate|konut|daire|kira|inşaat|emlak|vivienda|piso|alquiler|construcción|inmueble|logement|appartement|loyer|immobilier|wohnung|miete|immobilie|neubau|سكن|شقة|إيجار|عقار') },
  { id: 'Schools', re: W('skola|elev|lärare|utbildning|förskola|universitet|betyg|school|student|teacher|education|university|college|okul|öğrenci|öğretmen|eğitim|üniversite|escuela|colegio|alumno|profesor|universidad|école|élève|enseignant|université|schule|schüler|lehrer|bildung|universität|مدرس|طالب|معلم|تعليم|جامعة|dibistan|xwendekar|mamoste|zanîngeh|قوتابخانە|مامۆستا|زانکۆ') },
  { id: 'Sport', re: W('match|fotboll|hockey|allsvenskan|spelare|tränare|sport|vm-|em-|football|soccer|player|coach|league|nba|nfl|maç|futbol|spor|oyuncu|lig|takım|partido|fútbol|liga|jugador|entrenador|joueur|entraîneur|ligue|spiel|fußball|spieler|trainer|مباراة|كرة|الدوري|لاعب|مدرب|werzîş|lîstikvan|وەرزش|یاریزان') },
  { id: 'Politics', re: W('regering|riksdag|minister|parti|politik|politic|polític|politique|borgarråd|fullmäktige|statsminister|valet|government|election|parliament|senate|president|mayor|council|hükümet|seçim|bakan|meclis|belediye|cumhurbaşkanı|gobierno|elecciones|ministro|parlamento|alcalde|presidente|gouvernement|élection|parlement|maire|président|regierung|wahl|bundestag|partei|bürgermeister|präsident|حكوم|انتخاب|وزير|برلمان|حزب|رئيس|hikûmet|hilbijartin|wezîr|serokwezîr|حکومەت|هەڵبژاردن|پەرلەمان|وەزیر') },
  { id: 'Business', re: W('aktie|börs|bolag|företag|ekonomi|bank|ränta|inflation|vinst|stock|shares|market|company|business|economy|profit|ceo|earnings|hisse|borsa|şirket|ekonomi|enflasyon|kâr|acción|bolsa|empresa|economía|banco|inflación|beneficio|bourse|entreprise|économie|banque|bénéfice|börse|unternehmen|wirtschaft|gewinn|سهم|بورصة|شركة|اقتصاد|بنك|تضخم|aborî|ئابووری|بازاڕ') },
  { id: 'Weather', re: W('väder|snö|storm|regn|smhi|oväder|kyla|värmebölja|weather|snow|rain|forecast|heatwave|hurricane|flood|hava durumu|kar |fırtına|yağmur|sel |tiempo|nieve|tormenta|lluvia|inundación|météo|neige|tempête|pluie|wetter|schnee|sturm|regen|hitze|طقس|ثلج|عاصفة|مطر|فيضان|berf|bahoz|lehî|بەفر|لافاو|باران') },
  { id: 'Culture', re: W('kultur|festival|konsert|film|utställning|teater|musik|culture|concert|exhibition|theatre|theater|music|kültür|konser|sergi|tiyatro|müzik|cultura|concierto|película|exposición|teatro|música|exposition|théâtre|musique|konzert|ausstellung|ثقافة|مهرجان|حفل|فيلم|معرض|مسرح|موسيقى|festîval|muzîk|فێستیڤاڵ|مۆسیقا') },
  { id: 'Health', re: W('sjukhus|vård|läkare|virus|covid|sjukdom|hospital|doctor|health|disease|vaccine|hastane|doktor|sağlık|hastalık|aşı|médico|salud|enfermedad|vacuna|hôpital|médecin|santé|maladie|vaccin|krankenhaus|arzt|gesundheit|krankheit|impf|مستشفى|طبيب|صحة|مرض|لقاح|nexweşxane|tenduristî|bijîşk|نەخۆشخانە|تەندروستی|پزیشک') },
]

export const topicsOf = (title: string, isPolice?: boolean) => {
  const ids = TOPICS.filter((t) => t.re.test(title)).map((t) => t.id)
  if (isPolice && !ids.includes('Police')) ids.unshift('Police')
  return ids
}

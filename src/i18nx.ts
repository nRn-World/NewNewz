import type { Lang } from './i18n'

/** Strings for the newer features. Missing translations fall back to English. */
type D = Record<string, string>

const en: D = {
  tAll: 'All topics', tCrime: 'Crime', tTraffic: 'Traffic', tHousing: 'Housing', tSchools: 'Schools', tSport: 'Sport', tPolitics: 'Politics',
  tBusiness: 'Business', tWeather: 'Weather', tAccident: 'Accidents & fire', tCulture: 'Culture', tHealth: 'Health',
  sumNow: 'Right now:', report: 'Neighbourhood report', repWeek: '{n} items in the last 7 days', repUsual: 'usual {n} per week',
  repAbove: 'More active than usual', repBelow: 'Quieter than usual', repNormal: 'About as usual', repTop: 'Most talked about', repHot: 'Busiest areas',
  timeTravel: 'Time', tNow: 'Now', t1m: '1 month ago', t3m: '3 months ago', t6m: '6 months ago', t1y: '1 year ago', archiveNote: 'News from around {when}.',
  myPaper: 'My newspaper', myPaperEmpty: 'Add favourites first.', myPaperPlace: 'My favourites',
  compare: 'Compare', compareTitle: 'Compare places', compareHint: 'Tick two favourites with ⇄ to compare them.', cmpTotal: 'News found', cmp24: 'Last 24 h', cmp7: 'Last 7 days',
  cmpTopics: 'Main topics', cmpWords: 'Hot words', cmpSources: 'Sources', cmpLoading: 'Comparing…',
  alerts: 'Alerts', alertTopics: 'Alert me about', alertAll: 'Everything', quiet: 'Quiet hours for this category (no pop-ups)', quietFrom: 'from', quietTo: 'to',
  share: 'Share', copied: 'Link copied', mySources: 'My news sources', addSource: 'Add a news site, e.g. mitti.se', removeSource: 'Remove',
  offline: 'Offline: showing saved news', install: 'Install app',
  nearMe: 'Near me', locating: 'Locating…', 'err.geo': 'Location access was denied',
  moreSources: '+{n} sources', delFav: 'Remove favourite', pushOn: 'Background push notifications are active.', sheetToggle: 'Resize panel',
  areaStep1: '1/3 Regions', areaStep2: '2/3 Districts', areaStep3: '3/3 Neighbourhoods', estLeft: '~{n}s left',
}

const sv: D = {
  tAll: 'Alla ämnen', tCrime: 'Brott', tTraffic: 'Trafik', tHousing: 'Bostäder', tSchools: 'Skolor', tSport: 'Sport', tPolitics: 'Politik',
  tBusiness: 'Ekonomi', tWeather: 'Väder', tAccident: 'Olyckor & brand', tCulture: 'Kultur', tHealth: 'Hälsa',
  sumNow: 'Just nu:', report: 'Grannskapsrapport', repWeek: '{n} nyheter senaste 7 dagarna', repUsual: 'vanligt {n} per vecka',
  repAbove: 'Mer aktivt än vanligt', repBelow: 'Lugnare än vanligt', repNormal: 'Ungefär som vanligt', repTop: 'Mest omskrivet', repHot: 'Mest händelser',
  timeTravel: 'Tid', tNow: 'Nu', t1m: '1 månad sedan', t3m: '3 månader sedan', t6m: '6 månader sedan', t1y: '1 år sedan', archiveNote: 'Nyheter från omkring {when}.',
  myPaper: 'Min tidning', myPaperEmpty: 'Lägg till favoriter först.', myPaperPlace: 'Mina favoriter',
  compare: 'Jämför', compareTitle: 'Jämför platser', compareHint: 'Bocka i två favoriter med ⇄ för att jämföra dem.', cmpTotal: 'Nyheter hittade', cmp24: 'Senaste 24 h', cmp7: 'Senaste 7 dagarna',
  cmpTopics: 'Största ämnen', cmpWords: 'Heta ord', cmpSources: 'Källor', cmpLoading: 'Jämför…',
  alerts: 'Larm', alertTopics: 'Larma mig om', alertAll: 'Allt', quiet: 'Tysta timmar för kategorin (inga popup)', quietFrom: 'från', quietTo: 'till',
  share: 'Dela', copied: 'Länk kopierad', mySources: 'Mina nyhetskällor', addSource: 'Lägg till en nyhetssajt, t.ex. mitti.se', removeSource: 'Ta bort',
  offline: 'Offline: visar sparade nyheter', install: 'Installera appen',
  nearMe: 'Nära mig', locating: 'Hittar plats…', 'err.geo': 'Platsåtkomst nekades',
  moreSources: '+{n} källor', delFav: 'Ta bort favorit', pushOn: 'Bakgrundsnotiser (Web Push) är aktiva.', sheetToggle: 'Ändra panelstorlek',
  areaStep1: '1/3 Regiongränser', areaStep2: '2/3 Distrikt', areaStep3: '3/3 Stadsdelar', estLeft: '~{n} s kvar',
}

const tr_: D = {
  tAll: 'Tüm konular', tCrime: 'Suç', tTraffic: 'Trafik', tHousing: 'Konut', tSchools: 'Okullar', tSport: 'Spor', tPolitics: 'Siyaset',
  tBusiness: 'Ekonomi', tWeather: 'Hava', tAccident: 'Kazalar ve yangın', tCulture: 'Kultur', tHealth: 'Sağlık',
  sumNow: 'Şu an:', report: 'Mahalle raporu', repWeek: 'Son 7 günde {n} haber', repUsual: 'normalde haftada {n}',
  repAbove: 'Normalden hareketli', repBelow: 'Normalden sakin', repNormal: 'Her zamanki gibi', repTop: 'En çok konuşulan', repHot: 'En hareketli bölgeler',
  timeTravel: 'Zaman', tNow: 'Şimdi', t1m: '1 ay önce', t3m: '3 ay önce', t6m: '6 ay önce', t1y: '1 yıl önce', archiveNote: '{when} civarından haberler.',
  myPaper: 'Gazetem', myPaperEmpty: 'Önce favori ekleyin.', myPaperPlace: 'Favorilerim',
  compare: 'Karşılaştır', compareTitle: 'Yerleri karşılaştır', compareHint: 'Karşılaştırmak için iki favoriyi ⇄ ile işaretleyin.', cmpTotal: 'Bulunan haber', cmp24: 'Son 24 saat', cmp7: 'Son 7 gün',
  cmpTopics: 'Ana konular', cmpWords: 'Sıcak kelimeler', cmpSources: 'Kaynaklar', cmpLoading: 'Karşılaştırılıyor…',
  alerts: 'Uyarılar', alertTopics: 'Şunlar için uyar', alertAll: 'Hepsi', quiet: 'Sessiz saatler (bildirim yok)', quietFrom: 'başlangıç', quietTo: 'bitiş',
  share: 'Paylaş', copied: 'Bağlantı kopyalandı', mySources: 'Haber kaynaklarım', addSource: 'Bir haber sitesi ekleyin, örn. hurriyet.com.tr', removeSource: 'Kaldır',
  offline: 'Çevrimdışı: kayıtlı haberler gösteriliyor', install: 'Uygulamayı yükle',
  nearMe: 'Yakınımda', locating: 'Konum bulunuyor…', 'err.geo': 'Konum izni reddedildi',
  moreSources: '+{n} kaynak', delFav: 'Favoriyi kaldır', pushOn: 'Arka plan bildirimleri etkin.', sheetToggle: 'Paneli boyutlandır',
  areaStep1: '1/3 İl sınırları', areaStep2: '2/3 İlçeler', areaStep3: '3/3 Mahalleler', estLeft: '~{n} sn kaldı',
}

const ar: D = {
  tAll: 'كل المواضيع', tCrime: 'جريمة', tTraffic: 'مرور', tHousing: 'سكن', tSchools: 'مدارس', tSport: 'رياضة', tPolitics: 'سياسة',
  tBusiness: 'اقتصاد', tWeather: 'طقس', tAccident: 'حوادث وحرائق', tCulture: 'ثقافة', tHealth: 'صحة',
  sumNow: 'الآن:', report: 'تقرير الحي', repWeek: '{n} خبر في آخر 7 أيام', repUsual: 'المعتاد {n} أسبوعيًا',
  repAbove: 'أكثر نشاطًا من المعتاد', repBelow: 'أهدأ من المعتاد', repNormal: 'كالمعتاد', repTop: 'الأكثر تداولًا', repHot: 'أنشط المناطق',
  timeTravel: 'الزمن', tNow: 'الآن', t1m: 'قبل شهر', t3m: 'قبل 3 أشهر', t6m: 'قبل 6 أشهر', t1y: 'قبل سنة', archiveNote: 'أخبار حوالي {when}.',
  myPaper: 'جريدتي', myPaperEmpty: 'أضف مفضلات أولًا.', myPaperPlace: 'مفضلاتي',
  compare: 'مقارنة', compareTitle: 'مقارنة الأماكن', compareHint: 'حدد مفضلتين بـ ⇄ للمقارنة.', cmpTotal: 'الأخبار', cmp24: 'آخر 24 ساعة', cmp7: 'آخر 7 أيام',
  cmpTopics: 'أهم المواضيع', cmpWords: 'كلمات ساخنة', cmpSources: 'المصادر', cmpLoading: 'جارٍ المقارنة…',
  alerts: 'تنبيهات', alertTopics: 'نبهني عن', alertAll: 'كل شيء', quiet: 'ساعات الهدوء (بلا إشعارات)', quietFrom: 'من', quietTo: 'إلى',
  share: 'مشاركة', copied: 'تم نسخ الرابط', mySources: 'مصادري الإخبارية', addSource: 'أضف موقعًا إخباريًا مثل aljazeera.net', removeSource: 'إزالة',
  offline: 'دون اتصال: عرض الأخبار المحفوظة', install: 'ثبّت التطبيق',
  nearMe: 'بالقرب مني', locating: 'جارٍ تحديد الموقع…', 'err.geo': 'تم رفض الوصول إلى الموقع',
  moreSources: '+{n} مصادر', delFav: 'إزالة المفضلة', pushOn: 'إشعارات الخلفية مفعلة.', sheetToggle: 'تغيير حجم اللوحة',
  areaStep1: '1/3 المناطق', areaStep2: '2/3 المقاطعات', areaStep3: '3/3 الأحياء', estLeft: 'متبقي ~{n} ث',
}

const es: D = {
  tAll: 'Todos los temas', tCrime: 'Sucesos', tTraffic: 'Tráfico', tHousing: 'Vivienda', tSchools: 'Colegios', tSport: 'Deportes', tPolitics: 'Política',
  tBusiness: 'Economía', tWeather: 'Tiempo', tAccident: 'Accidentes e incendios', tCulture: 'Cultura', tHealth: 'Salud',
  sumNow: 'Ahora:', report: 'Informe del barrio', repWeek: '{n} noticias en 7 días', repUsual: 'normal {n} por semana',
  repAbove: 'Más activo de lo normal', repBelow: 'Más tranquilo de lo normal', repNormal: 'Como siempre', repTop: 'Lo más comentado', repHot: 'Zonas más activas',
  timeTravel: 'Tiempo', tNow: 'Ahora', t1m: 'hace 1 mes', t3m: 'hace 3 meses', t6m: 'hace 6 meses', t1y: 'hace 1 año', archiveNote: 'Noticias de hace {when}.',
  myPaper: 'Mi periódico', myPaperEmpty: 'Añade favoritos primero.', myPaperPlace: 'Mis favoritos',
  compare: 'Comparar', compareTitle: 'Comparar lugares', compareHint: 'Marca dos favoritos con ⇄ para compararlos.', cmpTotal: 'Noticias', cmp24: 'Últimas 24 h', cmp7: 'Últimos 7 días',
  cmpTopics: 'Temas principales', cmpWords: 'Palabras calientes', cmpSources: 'Fuentes', cmpLoading: 'Comparando…',
  alerts: 'Alertas', alertTopics: 'Avisarme de', alertAll: 'Todo', quiet: 'Horas de silencio (sin avisos)', quietFrom: 'de', quietTo: 'a',
  share: 'Compartir', copied: 'Enlace copiado', mySources: 'Mis fuentes', addSource: 'Añade un sitio de noticias, p. ej. elpais.com', removeSource: 'Quitar',
  offline: 'Sin conexión: noticias guardadas', install: 'Instalar la app',
  nearMe: 'Cerca de mí', locating: 'Ubicando…', 'err.geo': 'Se denegó el acceso a la ubicación',
  moreSources: '+{n} fuentes', delFav: 'Quitar favorito', pushOn: 'Notificaciones en segundo plano activas.', sheetToggle: 'Cambiar tamaño del panel',
  areaStep1: '1/3 Regiones', areaStep2: '2/3 Distritos', areaStep3: '3/3 Barrios', estLeft: '~{n}s restantes',
}

const fr: D = {
  tAll: 'Tous les sujets', tCrime: 'Faits divers', tTraffic: 'Circulation', tHousing: 'Logement', tSchools: 'Écoles', tSport: 'Sport', tPolitics: 'Politique',
  tBusiness: 'Économie', tWeather: 'Météo', tAccident: 'Accidents et incendies', tCulture: 'Culture', tHealth: 'Santé',
  sumNow: 'En ce moment :', report: 'Rapport de quartier', repWeek: '{n} articles en 7 jours', repUsual: 'habituellement {n} par semaine',
  repAbove: 'Plus actif que d’habitude', repBelow: 'Plus calme que d’habitude', repNormal: 'Comme d’habitude', repTop: 'Les plus discutés', repHot: 'Zones les plus actives',
  timeTravel: 'Temps', tNow: 'Maintenant', t1m: 'il y a 1 mois', t3m: 'il y a 3 mois', t6m: 'il y a 6 mois', t1y: 'il y a 1 an', archiveNote: 'Actualités d’il y a {when}.',
  myPaper: 'Mon journal', myPaperEmpty: 'Ajoutez d’abord des favoris.', myPaperPlace: 'Mes favoris',
  compare: 'Comparer', compareTitle: 'Comparer des lieux', compareHint: 'Cochez deux favoris avec ⇄ pour les comparer.', cmpTotal: 'Articles', cmp24: '24 dernières heures', cmp7: '7 derniers jours',
  cmpTopics: 'Sujets principaux', cmpWords: 'Mots chauds', cmpSources: 'Sources', cmpLoading: 'Comparaison…',
  alerts: 'Alertes', alertTopics: 'M’alerter pour', alertAll: 'Tout', quiet: 'Heures calmes (sans notification)', quietFrom: 'de', quietTo: 'à',
  share: 'Partager', copied: 'Lien copié', mySources: 'Mes sources', addSource: 'Ajoutez un site d’actualités, ex. lemonde.fr', removeSource: 'Retirer',
  offline: 'Hors ligne : actualités enregistrées', install: 'Installer l’appli',
  nearMe: 'Autour de moi', locating: 'Localisation…', 'err.geo': 'Accès à la position refusé',
  moreSources: '+{n} sources', delFav: 'Retirer le favori', pushOn: 'Notifications en arrière-plan actives.', sheetToggle: 'Redimensionner le panneau',
  areaStep1: '1/3 Régions', areaStep2: '2/3 Districts', areaStep3: '3/3 Quartiers', estLeft: '~{n}s restantes',
}

const de: D = {
  tAll: 'Alle Themen', tCrime: 'Kriminalität', tTraffic: 'Verkehr', tHousing: 'Wohnen', tSchools: 'Schulen', tSport: 'Sport', tPolitics: 'Politik',
  tBusiness: 'Wirtschaft', tWeather: 'Wetter', tAccident: 'Unfälle & Brände', tCulture: 'Kultur', tHealth: 'Gesundheit',
  sumNow: 'Gerade:', report: 'Kiez-Bericht', repWeek: '{n} Meldungen in 7 Tagen', repUsual: 'üblich {n} pro Woche',
  repAbove: 'Aktiver als üblich', repBelow: 'Ruhiger als üblich', repNormal: 'Wie üblich', repTop: 'Meistbesprochen', repHot: 'Aktivste Gegenden',
  timeTravel: 'Zeit', tNow: 'Jetzt', t1m: 'vor 1 Monat', t3m: 'vor 3 Monaten', t6m: 'vor 6 Monaten', t1y: 'vor 1 Jahr', archiveNote: 'Nachrichten von {when}.',
  myPaper: 'Meine Zeitung', myPaperEmpty: 'Füge zuerst Favoriten hinzu.', myPaperPlace: 'Meine Favoriten',
  compare: 'Vergleichen', compareTitle: 'Orte vergleichen', compareHint: 'Markiere zwei Favoriten mit ⇄ zum Vergleichen.', cmpTotal: 'Meldungen', cmp24: 'Letzte 24 h', cmp7: 'Letzte 7 Tage',
  cmpTopics: 'Hauptthemen', cmpWords: 'Heiße Wörter', cmpSources: 'Quellen', cmpLoading: 'Vergleiche…',
  alerts: 'Warnungen', alertTopics: 'Benachrichtige mich zu', alertAll: 'Alles', quiet: 'Ruhezeiten (keine Pop-ups)', quietFrom: 'von', quietTo: 'bis',
  share: 'Teilen', copied: 'Link kopiert', mySources: 'Meine Nachrichtenquellen', addSource: 'Nachrichtenseite hinzufügen, z. B. spiegel.de', removeSource: 'Entfernen',
  offline: 'Offline: gespeicherte Nachrichten', install: 'App installieren',
  nearMe: 'In meiner Nähe', locating: 'Standort wird ermittelt…', 'err.geo': 'Standortzugriff wurde verweigert',
  moreSources: '+{n} Quellen', delFav: 'Favorit entfernen', pushOn: 'Hintergrund-Push ist aktiv.', sheetToggle: 'Panelgröße ändern',
  areaStep1: '1/3 Regionen', areaStep2: '2/3 Bezirke', areaStep3: '3/3 Stadtteile', estLeft: 'noch ~{n}s',
}

export const EXTRA: Record<Lang, D> = { en, sv, tr: tr_, ar, es, fr, de }

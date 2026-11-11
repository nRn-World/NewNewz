import { EXTRA } from './i18nx'

export const LANGS = [
  { code: 'en', name: 'English', flag: 'gb' },
  { code: 'sv', name: 'Svenska', flag: 'se' },
  { code: 'tr', name: 'Türkçe', flag: 'tr' },
  { code: 'ar', name: 'العربية', flag: 'ae' },
  { code: 'es', name: 'Español', flag: 'es' },
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'ku', name: 'Kurdî', flag: 'ku' },
] as const
export type Lang = (typeof LANGS)[number]['code']

const en = {
  search: 'Search address, city, country…',
  searchLabel: 'Search place',
  news: 'News',
  favs: 'Favourites',
  noFavs: 'No favourites yet.',
  hint: 'Spin the globe and click a place, or search an address.',
  loading: 'Loading news…',
  widened: 'No news for the exact place, showing {scope}.',
  none: 'No news found.',
  footer: 'Headlines via Google News. Click to read at the source.',
  favorite: 'Favourite',
  language: 'Language',
  allCats: 'All',
  newCat: 'New category',
  noCat: 'No category',
  uncat: 'Uncategorised',
  category: 'Category',
  delCat: 'Delete category',
  newOnly: '{n} new since your last visit.',
  showAll: 'Show all',
  notifyOff: 'Notifications are off.',
  notifyDenied: 'Notifications are blocked: allow them for this site in the browser address bar.',
  notifyEnable: 'Turn on',
  notifyOn: 'Notifications are on',
  notifyHint: 'You are alerted about new headlines while NewzLocal is open in a tab.',
  paper: 'Newspaper',
  page: 'Page',
  forum: 'Forum',
  noForum: 'No forum posts found.',
  forums: 'Search the forums:',
  streets: 'Streets',
  streetFilter: 'Filter streets…',
  loadingStreets: 'Loading streets…',
  noResults: 'No places found.',
  areas: 'Loading map areas…',
  'err.areas': 'Map areas could not be loaded',
  updated: 'Live · updated {time}',
  'err.search': 'Search failed',
  'err.place': 'Place could not be found',
  'err.source': 'The news source did not respond',
  'err.busy': 'The news source is busy, try again shortly',
}
type Dict = typeof en

const dicts: Record<Lang, Dict> = {
  en,
  sv: {
    search: 'Sök adress, stad, land…', searchLabel: 'Sök plats', news: 'Nyheter', favs: 'Favoriter', noFavs: 'Inga favoriter än.',
    hint: 'Snurra jorden och klicka på en plats, eller sök en adress.', loading: 'Hämtar nyheter…',
    widened: 'Inga nyheter för exakt plats, visar för {scope}.', none: 'Inga nyheter hittades.',
    footer: 'Rubriker via Google News. Klicka för att läsa hos källan.', favorite: 'Favorit', language: 'Språk', allCats: 'Alla', newCat: 'Ny kategori', noCat: 'Ingen kategori', uncat: 'Utan kategori', category: 'Kategori', delCat: 'Ta bort kategori', newOnly: '{n} nya sedan senast.', showAll: 'Visa alla', 'notifyOff': 'Notiser är av.', 'notifyDenied': 'Notiser är blockerade: tillåt dem för sidan i webbläsarens adressfält.', 'notifyEnable': 'Slå på', 'notifyOn': 'Notiser är på', 'notifyHint': 'Du får notis om nya nyheter så länge NewzLocal är öppet i en flik.', paper: 'Tidning', page: 'Sida', forum: 'Forum', noForum: 'Inga foruminlägg hittades.', forums: 'Sök i forumen:', streets: 'Gator', streetFilter: 'Filtrera gator…', loadingStreets: 'Hämtar gator…', noResults: 'Inga platser hittades.', updated: 'Live · uppdaterad {time}', areas: 'Hämtar kartområden…', 'err.areas': 'Kartområden kunde inte hämtas',
    'err.search': 'Sökningen misslyckades', 'err.place': 'Platsen kunde inte hittas',
    'err.source': 'Nyhetskällan svarade inte', 'err.busy': 'Nyhetskällan är upptagen, försök igen om en stund',
  },
  tr: {
    search: 'Adres, şehir, ülke ara…', searchLabel: 'Yer ara', news: 'Haberler', favs: 'Favoriler', noFavs: 'Henüz favori yok.',
    hint: 'Dünyayı döndürüp bir yere tıklayın veya adres arayın.', loading: 'Haberler yükleniyor…',
    widened: 'Tam konum için haber yok, {scope} gösteriliyor.', none: 'Haber bulunamadı.',
    footer: 'Başlıklar Google News üzerinden. Kaynağında okumak için tıklayın.', favorite: 'Favori', language: 'Dil', allCats: 'Tümü', newCat: 'Yeni kategori', noCat: 'Kategori yok', uncat: 'Kategorisiz', category: 'Kategori', delCat: 'Kategoriyi sil', newOnly: 'Son ziyaretinizden beri {n} yeni.', showAll: 'Tümünü göster', 'notifyOff': 'Bildirimler kapalı.', 'notifyDenied': 'Bildirimler engellendi: adres çubuğundan bu site için izin verin.', 'notifyEnable': 'Aç', 'notifyOn': 'Bildirimler açık', 'notifyHint': 'NewzLocal bir sekmede açıkken yeni haberler için bildirim alırsınız.', paper: 'Gazete', page: 'Sayfa', forum: 'Forum', noForum: 'Forum gönderisi bulunamadı.', forums: 'Forumlarda ara:', streets: 'Sokaklar', streetFilter: 'Sokakları filtrele…', loadingStreets: 'Sokaklar yükleniyor…', noResults: 'Yer bulunamadı.', updated: 'Canlı · güncellendi {time}', areas: 'Harita bölgeleri yükleniyor…', 'err.areas': 'Harita bölgeleri yüklenemedi',
    'err.search': 'Arama başarısız', 'err.place': 'Yer bulunamadı',
    'err.source': 'Haber kaynağı yanıt vermedi', 'err.busy': 'Haber kaynağı meşgul, birazdan tekrar deneyin',
  },
  ar: {
    search: 'ابحث عن عنوان أو مدينة أو دولة…', searchLabel: 'ابحث عن مكان', news: 'الأخبار', favs: 'المفضلة', noFavs: 'لا توجد مفضلات بعد.',
    hint: 'أدر الكرة الأرضية وانقر على مكان، أو ابحث عن عنوان.', loading: 'جارٍ تحميل الأخبار…',
    widened: 'لا توجد أخبار للموقع بالضبط، يتم عرض {scope}.', none: 'لم يتم العثور على أخبار.',
    footer: 'العناوين عبر Google News. انقر للقراءة في المصدر.', favorite: 'مفضلة', language: 'اللغة', allCats: 'الكل', newCat: 'فئة جديدة', noCat: 'بدون فئة', uncat: 'بدون تصنيف', category: 'الفئة', delCat: 'حذف الفئة', newOnly: '{n} جديد منذ زيارتك الأخيرة.', showAll: 'عرض الكل', 'notifyOff': 'الإشعارات متوقفة.', 'notifyDenied': 'الإشعارات محظورة: اسمح بها لهذا الموقع من شريط العنوان.', 'notifyEnable': 'تشغيل', 'notifyOn': 'الإشعارات مفعلة', 'notifyHint': 'تصلك إشعارات بالأخبار الجديدة طالما NewzLocal مفتوح في علامة تبويب.', paper: 'جريدة', page: 'صفحة', forum: 'المنتديات', noForum: 'لم يتم العثور على منشورات.', forums: 'ابحث في المنتديات:', streets: 'الشوارع', streetFilter: 'تصفية الشوارع…', loadingStreets: 'جارٍ تحميل الشوارع…', noResults: 'لم يتم العثور على أماكن.', updated: 'مباشر · تم التحديث {time}', areas: 'جارٍ تحميل مناطق الخريطة…', 'err.areas': 'تعذر تحميل مناطق الخريطة',
    'err.search': 'فشل البحث', 'err.place': 'تعذر العثور على المكان',
    'err.source': 'لم يستجب مصدر الأخبار', 'err.busy': 'مصدر الأخبار مشغول، حاول مرة أخرى بعد قليل',
  },
  es: {
    search: 'Buscar dirección, ciudad, país…', searchLabel: 'Buscar lugar', news: 'Noticias', favs: 'Favoritos', noFavs: 'Aún no hay favoritos.',
    hint: 'Gira el globo y haz clic en un lugar, o busca una dirección.', loading: 'Cargando noticias…',
    widened: 'Sin noticias del lugar exacto, mostrando {scope}.', none: 'No se encontraron noticias.',
    footer: 'Titulares vía Google News. Haz clic para leer en la fuente.', favorite: 'Favorito', language: 'Idioma', allCats: 'Todas', newCat: 'Nueva categoría', noCat: 'Sin categoría', uncat: 'Sin categorizar', category: 'Categoría', delCat: 'Eliminar categoría', newOnly: '{n} nuevas desde tu última visita.', showAll: 'Ver todas', 'notifyOff': 'Las notificaciones están desactivadas.', 'notifyDenied': 'Notificaciones bloqueadas: permítelas para este sitio en la barra de direcciones.', 'notifyEnable': 'Activar', 'notifyOn': 'Notificaciones activadas', 'notifyHint': 'Recibes avisos de titulares nuevos mientras NewzLocal esté abierto en una pestaña.', paper: 'Periódico', page: 'Página', forum: 'Foros', noForum: 'No se encontraron publicaciones.', forums: 'Buscar en foros:', streets: 'Calles', streetFilter: 'Filtrar calles…', loadingStreets: 'Cargando calles…', noResults: 'No se encontraron lugares.', updated: 'En vivo · actualizado {time}', areas: 'Cargando áreas del mapa…', 'err.areas': 'No se pudieron cargar las áreas del mapa',
    'err.search': 'La búsqueda falló', 'err.place': 'No se pudo encontrar el lugar',
    'err.source': 'La fuente de noticias no respondió', 'err.busy': 'La fuente de noticias está ocupada, inténtalo de nuevo en un momento',
  },
  fr: {
    search: 'Rechercher une adresse, ville, pays…', searchLabel: 'Rechercher un lieu', news: 'Actualités', favs: 'Favoris', noFavs: 'Aucun favori pour le moment.',
    hint: 'Faites tourner le globe et cliquez sur un lieu, ou cherchez une adresse.', loading: 'Chargement des actualités…',
    widened: 'Aucune actualité pour le lieu exact, affichage pour {scope}.', none: 'Aucune actualité trouvée.',
    footer: 'Titres via Google News. Cliquez pour lire chez la source.', favorite: 'Favori', language: 'Langue', allCats: 'Toutes', newCat: 'Nouvelle catégorie', noCat: 'Sans catégorie', uncat: 'Non classées', category: 'Catégorie', delCat: 'Supprimer la catégorie', newOnly: '{n} nouvelles depuis votre dernière visite.', showAll: 'Tout afficher', 'notifyOff': 'Les notifications sont désactivées.', 'notifyDenied': 'Notifications bloquées : autorisez-les pour ce site dans la barre d\'adresse.', 'notifyEnable': 'Activer', 'notifyOn': 'Notifications activées', 'notifyHint': 'Vous êtes alerté des nouveaux titres tant que NewzLocal est ouvert dans un onglet.', paper: 'Journal', page: 'Page', forum: 'Forums', noForum: 'Aucune publication trouvée.', forums: 'Chercher dans les forums :', streets: 'Rues', streetFilter: 'Filtrer les rues…', loadingStreets: 'Chargement des rues…', noResults: 'Aucun lieu trouvé.', updated: 'En direct · mis à jour {time}', areas: 'Chargement des zones de la carte…', 'err.areas': 'Impossible de charger les zones de la carte',
    'err.search': 'La recherche a échoué', 'err.place': 'Lieu introuvable',
    'err.source': "La source d'actualités n'a pas répondu", 'err.busy': "La source d'actualités est occupée, réessayez dans un instant",
  },
  de: {
    search: 'Adresse, Stadt, Land suchen…', searchLabel: 'Ort suchen', news: 'Nachrichten', favs: 'Favoriten', noFavs: 'Noch keine Favoriten.',
    hint: 'Drehe den Globus und klicke auf einen Ort oder suche eine Adresse.', loading: 'Nachrichten werden geladen…',
    widened: 'Keine Nachrichten für den genauen Ort, zeige {scope}.', none: 'Keine Nachrichten gefunden.',
    footer: 'Schlagzeilen über Google News. Klicken, um bei der Quelle zu lesen.', favorite: 'Favorit', language: 'Sprache', allCats: 'Alle', newCat: 'Neue Kategorie', noCat: 'Keine Kategorie', uncat: 'Ohne Kategorie', category: 'Kategorie', delCat: 'Kategorie löschen', newOnly: '{n} neu seit deinem letzten Besuch.', showAll: 'Alle anzeigen', 'notifyOff': 'Benachrichtigungen sind aus.', 'notifyDenied': 'Benachrichtigungen blockiert: erlaube sie für diese Seite in der Adressleiste.', 'notifyEnable': 'Einschalten', 'notifyOn': 'Benachrichtigungen an', 'notifyHint': 'Du wirst über neue Schlagzeilen informiert, solange NewzLocal in einem Tab geöffnet ist.', paper: 'Zeitung', page: 'Seite', forum: 'Foren', noForum: 'Keine Forenbeiträge gefunden.', forums: 'In Foren suchen:', streets: 'Straßen', streetFilter: 'Straßen filtern…', loadingStreets: 'Straßen werden geladen…', noResults: 'Keine Orte gefunden.', updated: 'Live · aktualisiert {time}', areas: 'Kartenbereiche werden geladen…', 'err.areas': 'Kartenbereiche konnten nicht geladen werden',
    'err.search': 'Suche fehlgeschlagen', 'err.place': 'Ort konnte nicht gefunden werden',
    'err.source': 'Die Nachrichtenquelle hat nicht geantwortet', 'err.busy': 'Die Nachrichtenquelle ist ausgelastet, bitte gleich erneut versuchen',
  },
  // Kurmancî (Latin script)
  ku: {
    search: 'Li navnîşan, bajar, welat bigere…', searchLabel: 'Li cihekî bigere', news: 'Nûçe', favs: 'Bijarte', noFavs: 'Hê bijarte tune ne.',
    hint: 'Cîhanê bizivirîne û li cihekî bitikîne, an jî li navnîşanekê bigere.', loading: 'Nûçe tên barkirin…',
    widened: 'Ji bo cihê rast nûçe tune ne, {scope} tê nîşandan.', none: 'Nûçe nehatin dîtin.',
    footer: 'Sernivîs bi rêya Google News. Ji bo xwendina li çavkaniyê bitikîne.', favorite: 'Bijarte', language: 'Ziman', allCats: 'Hemû', newCat: 'Kategoriya nû', noCat: 'Bê kategorî', uncat: 'Bêkategorî', category: 'Kategorî', delCat: 'Kategoriyê jê bibe', newOnly: '{n} nûçeyên nû ji serdana te ya dawî ve.', showAll: 'Hemûyan nîşan bide', notifyOff: 'Agahdarî girtî ne.', notifyDenied: 'Agahdarî hatine astengkirin: di rêzika navnîşanê ya gerokê de ji bo vê malperê destûr bide.', notifyEnable: 'Veke', notifyOn: 'Agahdarî vekirî ne', notifyHint: 'Heta ku NewzLocal di tabekê de vekirî be, tu ji sernivîsên nû agahdar dibî.', paper: 'Rojname', page: 'Rûpel', forum: 'Forum', noForum: 'Şandiyên forumê nehatin dîtin.', forums: 'Li foruman bigere:', streets: 'Kolan', streetFilter: 'Kolanan parzûn bike…', loadingStreets: 'Kolan tên barkirin…', noResults: 'Cih nehat dîtin.', updated: 'Zindî · {time} hat nûkirin', areas: 'Herêmên nexşeyê tên barkirin…', 'err.areas': 'Herêmên nexşeyê nehatin barkirin',
    'err.search': 'Lêgerîn bi ser neket', 'err.place': 'Cih nehat dîtin',
    'err.source': 'Çavkaniya nûçeyan bersiv neda', 'err.busy': 'Çavkaniya nûçeyan mijûl e, piştî demeke kurt dîsa biceribîne',
  },
}

export const tr = (lang: Lang, key: string, vars?: Record<string, string>) =>
  ((dicts[lang] as Record<string, string>)[key] ?? EXTRA[lang][key] ?? (en as Record<string, string>)[key] ?? EXTRA.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '')

export const loadLang = (): Lang => {
  try {
    const s = localStorage.getItem('newzlocal.lang')
    return LANGS.some((l) => l.code === s) ? (s as Lang) : 'en'
  } catch { return 'en' }
}
export const saveLang = (l: Lang) => {
  try { localStorage.setItem('newzlocal.lang', l) } catch { /* private mode */ }
}

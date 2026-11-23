/**
 * Canonical 64-Outlet Global Newsroom Registry & 9-Region Taxonomy
 * Single source of truth consumed by:
 *   - scripts/sync.js (RSS ingestion, multi-section composites, native-lang translation, burst detection)
 *   - scripts/export-feeds.js (outlets.json metadata, regionRosterCounts, clusters.json regionsCovered)
 *   - scripts/rebake.js & server.js
 */

const REGION_LABELS = {
  NA: 'North America',
  LATAM: 'Latin America',
  UK: 'United Kingdom',
  EU: 'Europe',
  ME: 'Middle East & N. Africa',
  AF: 'Sub-Saharan Africa',
  SA: 'South Asia',
  APAC: 'Asia-Pacific',
  GLOBAL: 'Global'
};

const NEWS_SOURCES = [
  // ================= NORTH AMERICA (9) =================
  {
    id: 'nyt',
    name: 'The New York Times',
    initials: 'NYT',
    color: '#1e293b',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml'
  },
  {
    id: 'cnn',
    name: 'CNN',
    initials: 'CNN',
    color: '#cc0000',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://news.google.com/rss/search?q=site:cnn.com+when:1d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'fox',
    name: 'Fox News',
    initials: 'FOX',
    color: '#003366',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://feeds.foxnews.com/foxnews/politics',
    feedUrls: [
      'https://feeds.foxnews.com/foxnews/politics',
      'https://feeds.foxnews.com/foxnews/national',
      'https://feeds.foxnews.com/foxnews/world'
    ],
    excludeFluff: true
  },
  {
    id: 'npr',
    name: 'NPR News',
    initials: 'NPR',
    color: '#3c78d8',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://feeds.npr.org/1001/rss.xml'
  },
  {
    id: 'pbs',
    name: 'PBS NewsHour',
    initials: 'PBS',
    color: '#1d4ed8',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://www.pbs.org/newshour/feeds/rss/headlines'
  },
  {
    id: 'cnbc',
    name: 'CNBC News',
    initials: 'CNB',
    color: '#0077b6',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html'
  },
  {
    id: 'wsj',
    name: 'Wall Street Journal',
    initials: 'WSJ',
    color: '#0274b6',
    region: 'NA',
    countryCode: 'us',
    flag: '🇺🇸',
    feedUrl: 'https://news.google.com/rss/search?q=site:wsj.com+when:1d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'cbc',
    name: 'CBC News',
    initials: 'CBC',
    color: '#dc2626',
    region: 'NA',
    countryCode: 'ca',
    flag: '🇨🇦',
    feedUrl: 'https://www.cbc.ca/webfeed/rss/rss-topstories',
    excludeFluff: true
  },
  {
    id: 'globalnews',
    name: 'Global News',
    initials: 'GLB',
    color: '#b91c1c',
    region: 'NA',
    countryCode: 'ca',
    flag: '🇨🇦',
    feedUrl: 'https://globalnews.ca/feed/',
    excludeFluff: true
  },

  // ================= LATIN AMERICA (9) =================
  {
    id: 'oglobo',
    name: 'O Globo',
    initials: 'OGB',
    color: '#1d4ed8',
    region: 'LATAM',
    countryCode: 'br',
    flag: '🇧🇷',
    lang: 'pt',
    feedUrl: 'https://oglobo.globo.com/rss/oglobo/politica/',
    feedUrls: [
      'https://oglobo.globo.com/rss/oglobo/politica/',
      'https://oglobo.globo.com/rss/oglobo/economia/',
      'https://oglobo.globo.com/rss/oglobo/brasil/',
      'https://oglobo.globo.com/rss/oglobo/mundo/'
    ],
    excludeFluff: true
  },
  {
    id: 'agenciabrasil',
    name: 'Agência Brasil',
    initials: 'AGB',
    color: '#16a34a',
    region: 'LATAM',
    countryCode: 'br',
    flag: '🇧🇷',
    lang: 'pt',
    feedUrl: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
    excludeFluff: true
  },
  {
    id: 'latercera',
    name: 'La Tercera',
    initials: 'LTC',
    color: '#b91c1c',
    region: 'LATAM',
    countryCode: 'cl',
    flag: '🇨🇱',
    lang: 'es',
    feedUrl: 'https://www.latercera.com/arc/outboundfeeds/rss/category/nacional/?outputType=xml',
    feedUrls: [
      'https://www.latercera.com/arc/outboundfeeds/rss/category/nacional/?outputType=xml',
      'https://www.latercera.com/arc/outboundfeeds/rss/category/politica/?outputType=xml',
      'https://www.latercera.com/arc/outboundfeeds/rss/category/mundo/?outputType=xml'
    ],
    excludeFluff: true
  },
  {
    id: 'mercopress',
    name: 'MercoPress',
    initials: 'MCP',
    color: '#0369a1',
    region: 'LATAM',
    countryCode: 'uy',
    flag: '🇺🇾',
    feedUrl: 'https://en.mercopress.com/rss/'
  },
  {
    id: 'elpaisamerica',
    name: 'El País América',
    initials: 'EPA',
    color: '#0369a1',
    region: 'LATAM',
    countryCode: 'es',
    flag: '🌎',
    lang: 'es',
    feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/america/portada',
    excludeFluff: true
  },
  {
    id: 'clarin',
    name: 'Clarín',
    initials: 'CLA',
    color: '#dc2626',
    region: 'LATAM',
    countryCode: 'ar',
    flag: '🇦🇷',
    lang: 'es',
    feedUrl: 'https://www.clarin.com/rss/politica/',
    feedUrls: [
      'https://www.clarin.com/rss/politica/',
      'https://www.clarin.com/rss/economia/',
      'https://www.clarin.com/rss/mundo/'
    ],
    excludeFluff: true
  },
  {
    id: 'eleconomista',
    name: 'El Economista',
    initials: 'ECO',
    color: '#0f766e',
    region: 'LATAM',
    countryCode: 'mx',
    flag: '🇲🇽',
    lang: 'es',
    feedUrl: 'https://www.eleconomista.com.mx/rss/ultimas-noticias',
    excludeFluff: true
  },
  {
    id: 'lasillavacia',
    name: 'La Silla Vacía',
    initials: 'LSV',
    color: '#ca8a04',
    region: 'LATAM',
    countryCode: 'co',
    flag: '🇨🇴',
    lang: 'es',
    feedUrl: 'https://www.lasillavacia.com/feed/'
  },
  {
    id: 'elcomercio',
    name: 'El Comercio',
    initials: 'ECM',
    color: '#b45309',
    region: 'LATAM',
    countryCode: 'pe',
    flag: '🇵🇪',
    lang: 'es',
    feedUrl: 'https://elcomercio.pe/arc/outboundfeeds/rss/category/politica/?outputType=xml'
  },

  // ================= UNITED KINGDOM (4) =================
  {
    id: 'bbc',
    name: 'BBC News',
    initials: 'BBC',
    color: '#ff3f3f',
    region: 'UK',
    countryCode: 'gb',
    flag: '🇬🇧',
    feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml',
    excludeFluff: true
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    initials: 'GD',
    color: '#005689',
    region: 'UK',
    countryCode: 'gb',
    flag: '🇬🇧',
    feedUrl: 'https://www.theguardian.com/uk/rss',
    excludeFluff: true
  },
  {
    id: 'skynews',
    name: 'Sky News',
    initials: 'SKY',
    color: '#f22613',
    region: 'UK',
    countryCode: 'gb',
    flag: '🇬🇧',
    feedUrl: 'https://feeds.skynews.com/feeds/rss/home.xml'
  },
  {
    id: 'ft',
    name: 'Financial Times',
    initials: 'FT',
    color: '#d97706',
    region: 'UK',
    countryCode: 'gb',
    flag: '🇬🇧',
    feedUrl: 'https://www.ft.com/world?format=rss'
  },

  // ================= EUROPE (13) =================
  {
    id: 'dw',
    name: 'DW News',
    initials: 'DW',
    color: '#002b49',
    region: 'EU',
    countryCode: 'de',
    flag: '🇩🇪',
    feedUrl: 'https://rss.dw.com/rdf/rss-en-all',
    excludeFluff: true
  },
  {
    id: 'nzz',
    name: 'Neue Zürcher Zeitung',
    initials: 'NZZ',
    color: '#1e3a8a',
    region: 'EU',
    countryCode: 'ch',
    flag: '🇨🇭',
    lang: 'de',
    feedUrl: 'https://www.nzz.ch/international.rss'
  },
  {
    id: 'france24',
    name: 'France 24',
    initials: 'F24',
    color: '#009fe3',
    region: 'EU',
    countryCode: 'fr',
    flag: '🇫🇷',
    feedUrl: 'https://www.france24.com/en/rss',
    excludeFluff: true
  },
  {
    id: 'euronews',
    name: 'Euronews',
    initials: 'EUR',
    color: '#2563eb',
    region: 'EU',
    countryCode: 'eu',
    flag: '🇪🇺',
    feedUrl: 'https://www.euronews.com/rss?format=mrss&level=theme&name=news'
  },
  {
    id: 'lemonde',
    name: 'Le Monde',
    initials: 'LM',
    color: '#0f172a',
    region: 'EU',
    countryCode: 'fr',
    flag: '🇫🇷',
    feedUrl: 'https://www.lemonde.fr/en/rss/une.xml'
  },
  {
    id: 'elpais',
    name: 'El País',
    initials: 'ELP',
    color: '#0c4a6e',
    region: 'EU',
    countryCode: 'es',
    flag: '🇪🇸',
    feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada'
  },
  {
    id: 'repubblica',
    name: 'La Repubblica',
    initials: 'REP',
    color: '#b91c1c',
    region: 'EU',
    countryCode: 'it',
    flag: '🇮🇹',
    lang: 'it',
    feedUrl: 'https://www.repubblica.it/rss/politica/rss2.0.xml',
    feedUrls: [
      'https://www.repubblica.it/rss/politica/rss2.0.xml',
      'https://www.repubblica.it/rss/esteri/rss2.0.xml'
    ]
  },
  {
    id: 'rte',
    name: 'RTÉ News',
    initials: 'RTE',
    color: '#059669',
    region: 'EU',
    countryCode: 'ie',
    flag: '🇮🇪',
    feedUrl: 'https://www.rte.ie/feeds/rss/?index=/news/&limit=30',
    excludeFluff: true
  },
  {
    id: 'pravdaua',
    name: 'Ukrainska Pravda',
    initials: 'UPR',
    color: '#b91c1c',
    region: 'EU',
    countryCode: 'ua',
    flag: '🇺🇦',
    feedUrl: 'https://www.pravda.com.ua/eng/rss/view_news/'
  },
  {
    id: 'notesfrompoland',
    name: 'Notes From Poland',
    initials: 'NFP',
    color: '#dc2626',
    region: 'EU',
    countryCode: 'pl',
    flag: '🇵🇱',
    feedUrl: 'https://notesfrompoland.com/feed/'
  },
  {
    id: 'balkaninsight',
    name: 'Balkan Insight',
    initials: 'BIR',
    color: '#334155',
    region: 'EU',
    countryCode: 'eu',
    flag: '🇪🇺',
    feedUrl: 'https://balkaninsight.com/feed/'
  },
  {
    id: 'errnews',
    name: 'ERR News',
    initials: 'ERR',
    color: '#0284c7',
    region: 'EU',
    countryCode: 'ee',
    flag: '🇪🇪',
    feedUrl: 'https://feeds.feedburner.com/errnews',
    fallbackFeedUrl: 'https://news.err.ee/rss',
    excludeFluff: true
  },
  {
    id: 'radiosweden',
    name: 'Radio Sweden',
    initials: 'RSW',
    color: '#0284c7',
    region: 'EU',
    countryCode: 'se',
    flag: '🇸🇪',
    feedUrl: 'https://api.sr.se/api/rss/program/2054'
  },

  // ================= MIDDLE EAST & NORTH AFRICA (6) =================
  {
    id: 'aljazeera',
    name: 'Al Jazeera',
    initials: 'AJ',
    color: '#ff9900',
    region: 'ME',
    countryCode: 'qa',
    flag: '🇶🇦',
    feedUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    excludeFluff: true
  },
  {
    id: 'thenational',
    name: 'The National',
    initials: 'NAT',
    color: '#0284c7',
    region: 'ME',
    countryCode: 'ae',
    flag: '🇦🇪',
    feedUrl: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml',
    excludeFluff: true
  },
  {
    id: 'timesofisrael',
    name: 'The Times of Israel',
    initials: 'TOI',
    color: '#0369a1',
    region: 'ME',
    countryCode: 'il',
    flag: '🇮🇱',
    feedUrl: 'https://feeds.feedburner.com/thetimesofisrael',
    fallbackFeedUrl: 'https://www.timesofisrael.com/feed/'
  },
  {
    id: 'dailynewsegypt',
    name: 'Daily News Egypt',
    initials: 'DNE',
    color: '#b91c1c',
    region: 'ME',
    countryCode: 'eg',
    flag: '🇪🇬',
    feedUrl: 'https://www.dailynewsegypt.com/feed/',
    excludeFluff: true
  },
  {
    id: 'almonitor',
    name: 'Al-Monitor',
    initials: 'ALM',
    color: '#0f766e',
    region: 'ME',
    countryCode: 'ae',
    flag: '🌍',
    feedUrl: 'https://www.al-monitor.com/rss'
  },
  {
    id: 'turkishminute',
    name: 'Turkish Minute',
    initials: 'TRM',
    color: '#dc2626',
    region: 'ME',
    countryCode: 'tr',
    flag: '🇹🇷',
    feedUrl: 'https://www.turkishminute.com/feed/'
  },

  // ================= SUB-SAHARAN AFRICA (4) =================
  {
    id: 'africanews',
    name: 'Africanews',
    initials: 'AFR',
    color: '#d97706',
    region: 'AF',
    countryCode: 'cg',
    flag: '🌍',
    feedUrl: 'https://www.africanews.com/feed/rss',
    excludeFluff: true
  },
  {
    id: 'premiumtimes',
    name: 'Premium Times',
    initials: 'PTN',
    color: '#15803d',
    region: 'AF',
    countryCode: 'ng',
    flag: '🇳🇬',
    feedUrl: 'https://www.premiumtimesng.com/feed',
    excludeFluff: true
  },
  {
    id: 'dailymaverick',
    name: 'Daily Maverick',
    initials: 'DMV',
    color: '#1d4ed8',
    region: 'AF',
    countryCode: 'za',
    flag: '🇿🇦',
    feedUrl: 'https://www.dailymaverick.co.za/dmrss/',
    excludeFluff: true
  },
  {
    id: 'capitalfmke',
    name: 'Capital FM Kenya',
    initials: 'CFM',
    color: '#0284c7',
    region: 'AF',
    countryCode: 'ke',
    flag: '🇰🇪',
    feedUrl: 'https://www.capitalfm.co.ke/news/feed/',
    excludeFluff: true
  },

  // ================= SOUTH ASIA (3) =================
  {
    id: 'ndtv',
    name: 'NDTV',
    initials: 'NDT',
    color: '#e11d48',
    region: 'SA',
    countryCode: 'in',
    flag: '🇮🇳',
    feedUrl: 'https://feeds.feedburner.com/ndtvnews-top-stories',
    feedUrls: [
      'https://feeds.feedburner.com/ndtvnews-top-stories',
      'https://feeds.feedburner.com/ndtvnews-india-news'
    ],
    excludeFluff: true
  },
  {
    id: 'scrollin',
    name: 'Scroll.in',
    initials: 'SCR',
    color: '#c2410c',
    region: 'SA',
    countryCode: 'in',
    flag: '🇮🇳',
    feedUrl: 'https://feeds.feedburner.com/ScrollinArticles.rss'
  },
  {
    id: 'dawn',
    name: 'Dawn',
    initials: 'DWN',
    color: '#1e293b',
    region: 'SA',
    countryCode: 'pk',
    flag: '🇵🇰',
    feedUrl: 'https://feeds.feedburner.com/dawn-news',
    fallbackFeedUrl: 'https://www.dawn.com/feeds/home',
    excludeFluff: true
  },

  // ================= ASIA-PACIFIC (10) =================
  {
    id: 'abcau',
    name: 'ABC News Australia',
    initials: 'ABC',
    color: '#0d9488',
    region: 'APAC',
    countryCode: 'au',
    flag: '🇦🇺',
    feedUrl: 'https://www.abc.net.au/news/feed/51120/rss.xml',
    excludeFluff: true
  },
  {
    id: 'smh',
    name: 'Sydney Morning Herald',
    initials: 'SMH',
    color: '#0891b2',
    region: 'APAC',
    countryCode: 'au',
    flag: '🇦🇺',
    feedUrl: 'https://www.smh.com.au/rss/national.xml',
    feedUrls: [
      'https://www.smh.com.au/rss/politics/federal.xml',
      'https://www.smh.com.au/rss/national.xml',
      'https://www.smh.com.au/rss/world.xml',
      'https://www.smh.com.au/rss/business.xml'
    ],
    excludeFluff: true
  },
  {
    id: 'scmp',
    name: 'South China Morning Post',
    initials: 'SCM',
    color: '#4f46e5',
    region: 'APAC',
    countryCode: 'hk',
    flag: '🇭🇰',
    feedUrl: 'https://www.scmp.com/rss/91/feed'
  },
  {
    id: 'japantimes',
    name: 'The Japan Times',
    initials: 'JPT',
    color: '#be123c',
    region: 'APAC',
    countryCode: 'jp',
    flag: '🇯🇵',
    feedUrl: 'https://www.japantimes.co.jp/feed/',
    excludeFluff: true
  },
  {
    id: 'cna',
    name: 'CNA',
    initials: 'CNA',
    color: '#e11d48',
    region: 'APAC',
    countryCode: 'sg',
    flag: '🇸🇬',
    feedUrl: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511',
    feedUrls: [
      'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511',
      'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311',
      'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416'
    ],
    excludeFluff: true
  },
  {
    id: 'koreaherald',
    name: 'The Korea Herald',
    initials: 'KRH',
    color: '#1e40af',
    region: 'APAC',
    countryCode: 'kr',
    flag: '🇰🇷',
    feedUrl: 'https://www.koreaherald.com/rss/newsAll',
    excludeFluff: true
  },
  {
    id: 'inquirer',
    name: 'Philippine Daily Inquirer',
    initials: 'PDI',
    color: '#1d4ed8',
    region: 'APAC',
    countryCode: 'ph',
    flag: '🇵🇭',
    feedUrl: 'https://www.inquirer.net/fullfeed',
    excludeFluff: true
  },
  {
    id: 'vnexpress',
    name: 'VnExpress International',
    initials: 'VNE',
    color: '#9f1239',
    region: 'APAC',
    countryCode: 'vn',
    flag: '🇻🇳',
    feedUrl: 'https://e.vnexpress.net/rss/news.rss',
    excludeFluff: true
  },
  {
    id: 'focustaiwan',
    name: 'Focus Taiwan',
    initials: 'FTW',
    color: '#2563eb',
    region: 'APAC',
    countryCode: 'tw',
    flag: '🇹🇼',
    feedUrl: 'https://feeds.feedburner.com/rsscna/engnews',
    fallbackFeedUrl: 'https://news.google.com/rss/search?q=site:focustaiwan.tw+when:1d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'cnnindonesia',
    name: 'CNN Indonesia',
    initials: 'CNI',
    color: '#cc0000',
    region: 'APAC',
    countryCode: 'id',
    flag: '🇮🇩',
    lang: 'id',
    feedUrl: 'https://www.cnnindonesia.com/nasional/rss',
    feedUrls: [
      'https://www.cnnindonesia.com/nasional/rss',
      'https://www.cnnindonesia.com/ekonomi/rss'
    ],
    excludeFluff: true
  },

  // ================= GLOBAL WIRES & SCIENCE/TECH (6) =================
  {
    id: 'reuters',
    name: 'Reuters',
    initials: 'RTR',
    color: '#ff8000',
    region: 'GLOBAL',
    syncRegion: 'WIRE',
    countryCode: 'un',
    flag: '🌐',
    feedUrl: 'https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'ap',
    name: 'Associated Press',
    initials: 'AP',
    color: '#ff0055',
    region: 'GLOBAL',
    syncRegion: 'WIRE',
    countryCode: 'un',
    flag: '🌐',
    feedUrl: 'https://news.google.com/rss/search?q=site:apnews.com+when:1d&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg',
    initials: 'BBG',
    color: '#4338ca',
    region: 'GLOBAL',
    syncRegion: 'WIRE',
    countryCode: 'un',
    flag: '🌐',
    feedUrl: 'https://feeds.bloomberg.com/markets/news.rss'
  },
  {
    id: 'newscientist',
    name: 'New Scientist',
    initials: 'NSC',
    color: '#10b981',
    region: 'GLOBAL',
    syncRegion: 'SCI',
    countryCode: 'un',
    flag: '🔬',
    feedUrl: 'https://www.newscientist.com/feed/home/'
  },
  {
    id: 'arstechnica',
    name: 'Ars Technica',
    initials: 'ARS',
    color: '#f97316',
    region: 'GLOBAL',
    syncRegion: 'SCI',
    countryCode: 'un',
    flag: '⚡',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/index'
  },
  {
    id: 'unnews',
    name: 'UN News',
    initials: 'UN',
    color: '#0284c7',
    region: 'GLOBAL',
    syncRegion: 'WIRE',
    countryCode: 'un',
    flag: '🌐',
    feedUrl: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml'
  }
];

// Legacy / retired sources retained strictly for historical archive metadata lookups
const LEGACY_SOURCES = {
  batimes: { id: 'batimes', name: 'Buenos Aires Times', initials: 'BAT', color: '#0284c7', region: 'LATAM', countryCode: 'ar', flag: '🇦🇷' },
  mexiconews: { id: 'mexiconews', name: 'Mexico News Daily', initials: 'MND', color: '#15803d', region: 'LATAM', countryCode: 'mx', flag: '🇲🇽' },
  newtimesrw: { id: 'newtimesrw', name: 'The New Times', initials: 'NTR', color: '#0284c7', region: 'AF', countryCode: 'rw', flag: '🇷🇼' },
  independent: { id: 'independent', name: 'The Independent', initials: 'IND', color: '#dc2626', region: 'UK', countryCode: 'gb', flag: '🇬🇧' },
  telegraph: { id: 'telegraph', name: 'The Telegraph', initials: 'TEL', color: '#0f172a', region: 'UK', countryCode: 'gb', flag: '🇬🇧' },
  latimes: { id: 'latimes', name: 'Los Angeles Times', initials: 'LAT', color: '#1e293b', region: 'NA', countryCode: 'us', flag: '🇺🇸' },
  wapo: { id: 'wapo', name: 'Washington Post', initials: 'WPO', color: '#1e293b', region: 'NA', countryCode: 'us', flag: '🇺🇸' },
  nbc: { id: 'nbc', name: 'NBC News', initials: 'NBC', color: '#2563eb', region: 'NA', countryCode: 'us', flag: '🇺🇸' },
  ars: { id: 'ars', name: 'Ars Technica', initials: 'ARS', color: '#f97316', region: 'GLOBAL', countryCode: 'un', flag: '⚡' },
  globeandmail: { id: 'globeandmail', name: 'The Globe and Mail', initials: 'GAM', color: '#dc2626', region: 'NA', countryCode: 'ca', flag: '🇨🇦' },
  politicoeu: { id: 'politicoeu', name: 'Politico Europe', initials: 'PEU', color: '#dc2626', region: 'EU', countryCode: 'eu', flag: '🇪🇺' },
  irishtimes: { id: 'irishtimes', name: 'The Irish Times', initials: 'IRT', color: '#059669', region: 'EU', countryCode: 'ie', flag: '🇮🇪' },
  swissinfo: { id: 'swissinfo', name: 'SWI swissinfo.ch', initials: 'SWI', color: '#dc2626', region: 'EU', countryCode: 'ch', flag: '🇨🇭' },
  CNA: { id: 'cna', name: 'CNA', initials: 'CNA', color: '#e11d48', region: 'APAC', countryCode: 'sg', flag: '🇸🇬' },
  nature: { id: 'nature', name: 'Nature', initials: 'NAT', color: '#10b981', region: 'GLOBAL', countryCode: 'un', flag: '🔬' },
  UN: { id: 'unnews', name: 'UN News', initials: 'UN', color: '#0284c7', region: 'GLOBAL', countryCode: 'un', flag: '🌐' }
};

const OUTLET_META_MAP = {};
const OUTLET_REGION_MAP = {};
const SOURCE_REGION_MAP = {};
const REGION_ROSTER_COUNTS = { NA: 0, LATAM: 0, UK: 0, EU: 0, ME: 0, AF: 0, SA: 0, APAC: 0, GLOBAL: 0 };

for (const [id, leg] of Object.entries(LEGACY_SOURCES)) {
  OUTLET_META_MAP[id] = { ...leg, regionName: REGION_LABELS[leg.region] || 'Global' };
  OUTLET_REGION_MAP[id] = leg.region;
  SOURCE_REGION_MAP[id] = leg.region;
}

for (const s of NEWS_SOURCES) {
  OUTLET_META_MAP[s.id] = {
    id: s.id,
    name: s.name,
    initials: s.initials,
    color: s.color,
    region: s.region,
    regionName: REGION_LABELS[s.region] || 'Global',
    countryCode: s.countryCode,
    flag: s.flag,
    ...(s.lang ? { lang: s.lang } : {})
  };
  OUTLET_REGION_MAP[s.id] = s.region;
  SOURCE_REGION_MAP[s.id] = s.syncRegion || s.region;
  REGION_ROSTER_COUNTS[s.region] = (REGION_ROSTER_COUNTS[s.region] || 0) + 1;
}

const ACTIVE_SOURCE_IDS = new Set(NEWS_SOURCES.map(s => s.id));

const OUTLET_SUFFIX_PATTERN = NEWS_SOURCES
  .concat(Object.values(LEGACY_SOURCES))
  .flatMap(s => [s.name, s.id === 'nyt' ? 'nyt' : null, s.id === 'ft' ? 'ft' : null, s.id === 'wsj' ? 'wsj' : null, s.id === 'scmp' ? 'scmp' : null, s.id === 'smh' ? 'smh' : null, s.id === 'ap' ? 'ap news' : null, s.id === 'cna' ? 'channel newsasia' : null, s.id === 'focustaiwan' ? 'cna english news' : null, s.id === 'timesofisrael' ? 'times of israel' : null])
  .filter(Boolean)
  .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|');

const OUTLET_SUFFIX_REGEX = new RegExp(`\\s*[-–—|]\\s*(?:${OUTLET_SUFFIX_PATTERN}).*$`, 'i');

module.exports = {
  REGION_LABELS,
  NEWS_SOURCES,
  LEGACY_SOURCES,
  ACTIVE_SOURCE_IDS,
  OUTLET_META_MAP,
  OUTLET_REGION_MAP,
  SOURCE_REGION_MAP,
  REGION_ROSTER_COUNTS,
  OUTLET_SUFFIX_REGEX
};

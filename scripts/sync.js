/**
 * Standalone Headless Sync & Bake Script
 * - Fetches RSS feeds from all configured news sources
 * - Deduplicates against historical data
 * - Analyzes sentiment using Gemini 3.8 Flash, Groq, OpenRouter, or Local VADER/AFINN
 * - Bakes optimized static files for lightning-fast zero-server web hosting
 */

const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateDailyBriefing } = require('./briefing');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const DATA_FILE = path.join(DATA_DIR, 'vibe-data.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Ensure output directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DATA_DIR)) fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Vibe-O-Meter/2.0 (News Sentiment Monitor)' },
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:description', 'mediaDescription'],
      ['itunes:summary', 'itunesSummary'],
      ['summary', 'atomSummary']
    ]
  }
});
const sentimentAnalyzer = new Sentiment();

const NEWS_SOURCES = [
  // North America (US & Canada)
  { id: 'nyt', name: 'The New York Times', feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { id: 'cnn', name: 'CNN', feedUrl: 'https://news.google.com/rss/search?q=site:cnn.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'fox', name: 'Fox News', feedUrl: 'https://feeds.foxnews.com/foxnews/latest' },
  { id: 'npr', name: 'NPR News', feedUrl: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'pbs', name: 'PBS NewsHour', feedUrl: 'https://www.pbs.org/newshour/feeds/rss/headlines' },
  { id: 'cnbc', name: 'CNBC News', feedUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'bloomberg', name: 'Bloomberg', feedUrl: 'https://feeds.bloomberg.com/markets/news.rss' },
  { id: 'wsj', name: 'Wall Street Journal', feedUrl: 'https://news.google.com/rss/search?q=site:wsj.com+when:1d&hl=en-US&gl=US&ceid=US:en' },
  { id: 'cbc', name: 'CBC News', feedUrl: 'https://www.cbc.ca/webfeed/rss/rss-topstories' },
  { id: 'globalnews', name: 'Global News', feedUrl: 'https://globalnews.ca/feed/' },
  // Latin America (English & Curated Native Broadsheets)
  { id: 'batimes', name: 'Buenos Aires Times', feedUrl: 'https://www.batimes.com.ar/feed' },
  { id: 'mexiconews', name: 'Mexico News Daily', feedUrl: 'https://mexiconewsdaily.com/feed/' },
  { id: 'mercopress', name: 'MercoPress', feedUrl: 'https://en.mercopress.com/rss/' },
  { id: 'agenciabrasil', name: 'Agência Brasil', feedUrl: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', lang: 'pt' },
  { id: 'oglobo', name: 'O Globo', feedUrl: 'https://oglobo.globo.com/rss/oglobo/', lang: 'pt' },
  { id: 'latercera', name: 'La Tercera', feedUrl: 'https://www.latercera.com/arc/outboundfeeds/rss/category/mundo/?outputType=xml', lang: 'es' },
  // United Kingdom
  { id: 'bbc', name: 'BBC News', feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'guardian', name: 'The Guardian', feedUrl: 'https://www.theguardian.com/uk/rss' },
  { id: 'skynews', name: 'Sky News', feedUrl: 'https://feeds.skynews.com/feeds/rss/home.xml' },
  { id: 'ft', name: 'Financial Times', feedUrl: 'https://www.ft.com/world?format=rss' },
  // Europe
  { id: 'dw', name: 'DW News', feedUrl: 'https://rss.dw.com/rdf/rss-en-all' },
  { id: 'nzz', name: 'Neue Zürcher Zeitung', feedUrl: 'https://www.nzz.ch/international.rss', lang: 'de' },
  { id: 'france24', name: 'France 24', feedUrl: 'https://www.france24.com/en/rss' },
  { id: 'euronews', name: 'Euronews', feedUrl: 'https://www.euronews.com/rss?level=theme&name=news' },
  { id: 'lemonde', name: 'Le Monde', feedUrl: 'https://www.lemonde.fr/en/rss/une.xml' },
  { id: 'elpais', name: 'El País', feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada' },
  { id: 'repubblica', name: 'La Repubblica', feedUrl: 'https://www.repubblica.it/rss/esteri/rss2.0.xml', lang: 'it' },
  { id: 'rte', name: 'RTÉ News', feedUrl: 'https://www.rte.ie/feeds/rss/?index=/news/&limit=30' },
  // Asia-Pacific
  { id: 'abcau', name: 'ABC News Australia', feedUrl: 'https://www.abc.net.au/news/feed/51120/rss.xml' },
  { id: 'smh', name: 'Sydney Morning Herald', feedUrl: 'https://www.smh.com.au/rss/feed.xml' },
  { id: 'scmp', name: 'South China Morning Post', feedUrl: 'https://www.scmp.com/rss/91/feed' },
  { id: 'japantimes', name: 'The Japan Times', feedUrl: 'https://www.japantimes.co.jp/feed/' },
  { id: 'cna', name: 'CNA', feedUrl: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511' },
  // Middle East & Africa
  { id: 'aljazeera', name: 'Al Jazeera', feedUrl: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'thenational', name: 'The National', feedUrl: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml' },
  { id: 'africanews', name: 'Africanews', feedUrl: 'https://www.africanews.com/feed/rss' },
  // Global Agencies & Science/Tech
  { id: 'reuters', name: 'Reuters', feedUrl: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'ap', name: 'Associated Press', feedUrl: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'newscientist', name: 'New Scientist', feedUrl: 'https://www.newscientist.com/feed/home/' },
  { id: 'arstechnica', name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index' }
];

const NATIVE_LANG_SOURCES = new Map(NEWS_SOURCES.filter(s => s.lang && s.lang !== 'en').map(s => [s.id, s.lang]));

const MAX_ARTICLES_PER_SOURCE = 500;

function sanitizeText(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>?/gm, '').replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'at_medium', 'at_campaign', 'at_custom1', 'at_custom2', 'at_custom3', 'at_custom4', 'oc', 'ved', 'usg'];
    removeParams.forEach(p => u.searchParams.delete(p));
    let clean = u.origin + u.pathname;
    const s = u.searchParams.toString();
    if (s) clean += '?' + s;
    return clean.replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return url.split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function cleanHeadlineTitle(title) {
  if (!title) return '';
  return title
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s*[-–—|]\s*(reuters|bbc|cnn|fox news|the guardian|ap news|associated press|bloomberg|nyt|new york times|al jazeera|npr|pbs|pbs newshour|cnbc|sky news|spiegel|dw|france 24|politico|wsj|wall street journal|financial times|ft|euronews|cbc|global news|abc news|sydney morning herald|smh|scmp|south china morning post|the japan times|japan times|cna|channel newsasia|the national|africanews|agencia brasil|agência brasil|le monde|el pais|el país|rte|rté|buenos aires times|mexico news daily|mercopress|new scientist|ars technica).*$/i, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Helper to check if an article's RSS description is missing, echoed from the headline, or contains grading jargon
function needsCleanEditorialSummary(desc, title) {
  const rawD = sanitizeText(desc || '').trim();
  // Google News RSS descriptions are bare headline echoes ending with the outlet name (often from an earlier version of a rolling URL)
  if (/\s+(Bloomberg\.com|Reuters|AP News|Associated Press|WSJ|The Wall Street Journal)\s*$/i.test(rawD) && !/[.!?]\s+[A-Z]/.test(rawD.replace(/\b(U\.S\.|U\.K\.|U\.N\.|St\.|Mr\.|Ms\.|Dr\.|Inc\.|Corp\.|Ltd\.)/g, ''))) {
    return true;
  }
  const cleanD = rawD
    .replace(/\s*[-–—|]?\s*(Bloomberg\.com|Bloomberg|Reuters|AP News|Associated Press|CNN|The Wall Street Journal|WSJ)\s*$/i, '')
    .trim();
  if (!cleanD || cleanD.length < 35) return true;
  if (/\[Event Base:/i.test(cleanD) || /^Event base\b/i.test(cleanD) || /\bframing\s*\([+-]?\d/i.test(cleanD)) return true;
  const normD = cleanD.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normT = cleanHeadlineTitle(title || '').replace(/[^a-z0-9]/g, '');
  if (normT.length > 12 && (
    normD === normT ||
    normD.startsWith(normT.slice(0, Math.min(32, normT.length))) ||
    normT.startsWith(normD.slice(0, Math.min(32, normD.length)))
  )) {
    return true;
  }
  return false;
}

// Extract richest lead paragraph from multiple RSS/Atom summary tags
function extractBestDescription(item) {
  // Prefer concise editorial lead summaries (contentSnippet / description / atomSummary) before full-article contentEncoded
  const leadCandidates = [
    item.contentSnippet,
    item.description,
    item.atomSummary,
    item.summary,
    item.mediaDescription,
    item.itunesSummary,
    item.contentEncoded,
    item.content
  ];

  for (const c of leadCandidates) {
    if (typeof c === 'string' && c.trim().length > 25) {
      const clean = sanitizeText(c)
        .replace(/^The post\s+.*?\s+appeared first on\s+.*$/i, '')
        .trim();
      if (clean.length > 25) {
        // Truncate to ~450 characters (2-3 solid sentences) to balance rich context with low token usage
        return clean.length > 450 ? clean.substring(0, 447) + '...' : clean;
      }
    }
  }
  return '';
}

// Extract highest-quality editorial image URL from RSS media tags
function isRealEditorialImageUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  const u = url.toLowerCase();
  return !(
    u.includes('googleusercontent.com') ||
    u.includes('news.google.com') ||
    u.includes('gstatic.com') ||
    u.includes('bbc_news_logo') ||
    u.includes('default-share') ||
    u.includes('feedburner') ||
    u.includes('beacon') ||
    u.includes('1x1') ||
    u.includes('pixel') ||
    u.includes('favicon') ||
    u.includes('avatar')
  );
}

function extractImageUrl(item) {
  if (!item) return null;
  // 1. Enclosure
  if (item.enclosure && isRealEditorialImageUrl(item.enclosure.url) && (!item.enclosure.type || item.enclosure.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(item.enclosure.url))) {
    return item.enclosure.url;
  }
  // 2. Media Content (handle single object or array, pick largest/highest resolution)
  if (item.mediaContent) {
    const list = Array.isArray(item.mediaContent) ? item.mediaContent : [item.mediaContent];
    const valid = list.filter(m => m && isRealEditorialImageUrl(m.$?.url || m.url));
    if (valid.length > 0) {
      const best = valid.sort((a, b) => {
        const wa = parseInt(a.$?.width || a.width || 0);
        const wb = parseInt(b.$?.width || b.width || 0);
        return wb - wa;
      })[0];
      return best.$?.url || best.url;
    }
  }
  // 3. Media Thumbnail
  if (item.mediaThumbnail) {
    const list = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail : [item.mediaThumbnail];
    const valid = list.filter(m => m && isRealEditorialImageUrl(m.$?.url || m.url));
    if (valid.length > 0) {
      const best = valid.sort((a, b) => {
        const wa = parseInt(a.$?.width || a.width || 0);
        const wb = parseInt(b.$?.width || b.width || 0);
        return wb - wa;
      })[0];
      return best.$?.url || best.url;
    }
  }
  // 4. Embedded <img> tag inside contentEncoded, content, or description
  for (const field of [item.contentEncoded, item.content, item.description]) {
    if (typeof field === 'string' && field.includes('<img')) {
      const match = field.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1] && isRealEditorialImageUrl(match[1])) {
        return match[1];
      }
    }
  }
  return null;
}

function readCache() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('[Cache] Could not parse existing vibe-data.json, starting fresh.');
    }
  }
  return { lastUpdated: null, analyzerUsed: null, sources: {}, timeSeries: [] };
}

function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {}
  }
  return {};
}

// Local lexicon analysis (AFINN + VADER) with news context weighting
function analyzeLocally(headlines) {
  return headlines.map(item => {
    const textToAnalyze = `${item.title} ${item.description || ''}`;
    const afinnScore = Math.max(-1.0, Math.min(1.0, sentimentAnalyzer.analyze(textToAnalyze).score / 8));
    const vaderScore = vader.SentimentIntensityAnalyzer.polarity_scores(textToAnalyze).compound;
    let baseScore = (afinnScore + vaderScore) / 2;

    // News-domain contextual valence correction (lexicons often fail on conflict/disaster terms)
    const textLower = textToAnalyze.toLowerCase();
    if (/\b(hits|strikes|bombs|attacked|attacking|attack|missile|drone strike|killed|killing|dead|fatal|casualties|collapse|violate|violating|ceasefire|sanctions|slain|destroy|destroyed)\b/i.test(textLower)) {
      baseScore = Math.min(baseScore - 0.5, -0.3);
    }
    const finalScore = Number(Math.max(-1.0, Math.min(1.0, baseScore)).toFixed(3));

    let category = 'other';
    if (/politic|election|biden|trump|government|senate|minister|president|parliament/.test(textLower)) category = 'politics';
    else if (/market|stock|inflation|economy|price|bank|fed|trade|dollar|tariff/.test(textLower)) category = 'business';
    else if (/tech|ai\b|robot|google|apple|software|crypto|cyber|phone|semiconductor/.test(textLower)) category = 'technology';
    else if (/climate|nature|wildlife|forest|ocean|biodiversity|conservation|emission|warming|solar|renewable/.test(textLower)) category = 'climate';
    else if (/science|space|nasa|planet|discover|physics|astronomy|telescope/.test(textLower)) category = 'science';
    else if (/health|covid|virus|doctor|hospital|vaccin|cancer|disease|mental/.test(textLower)) category = 'health';
    else if (/movie|actor|music|hollywood|star|show|award|film|celebrity/.test(textLower)) category = 'entertainment';
    else if (/sport|football|soccer|cup|game|win|champion|tennis|basketball|olympic/.test(textLower)) category = 'sports';
    else if (/world|war|border|treaty|nation|international|conflict|crisis|refugee|strike|kyiv|russia|ukraine/.test(textLower)) category = 'world';

    return {
      ...item,
      sentiment: finalScore,
      sentimentLocal: finalScore,
      sentimentAFINN: Number(afinnScore.toFixed(3)),
      sentimentVADER: Number(vaderScore.toFixed(3)),
      category,
      explanation: `Analyzed locally with news-calibrated VADER (${vaderScore.toFixed(2)}) and AFINN-111 (${afinnScore.toFixed(2)}).`
    };
  });
}

function tryRepairJsonArray(text) {
  let clean = text.trim();
  // Strip illegal leading positive signs from numbers like ": +0.25"
  clean = clean.replace(/:\s*\+(\d)/g, ': $1');
  if (!clean.startsWith('[')) return clean;
  if (clean.endsWith(']')) return clean;
  if (clean.endsWith('}')) return clean + ']';
  if (clean.endsWith(',')) return clean.slice(0, -1).trim() + ']';
  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace !== -1) return clean.substring(0, lastBrace + 1) + ']';
  return clean;
}

// Extract significant content tokens from a headline for cross-outlet event grouping
function getHeadlineTopicTokens(title) {
  const stop = new Set([
    'about', 'after', 'again', 'against', 'amid', 'among', 'around', 'Became', 'because', 'before',
    'being', 'below', 'between', 'bill', 'both', 'bring', 'calls', 'cloud', 'comes', 'could', 'daily',
    'days', 'deal', 'despite', 'does', 'down', 'during', 'early', 'even', 'every', 'face', 'faces',
    'find', 'finds', 'first', 'five', 'four', 'from', 'full', 'gets', 'give', 'gives', 'global', 'goes',
    'good', 'government', 'great', 'group', 'have', 'head', 'help', 'helps', 'here', 'high', 'hold',
    'home', 'house', 'into', 'just', 'keep', 'keeps', 'know', 'large', 'last', 'late', 'latest', 'lead',
    'leads', 'leave', 'leaves', 'left', 'less', 'life', 'like', 'live', 'lives', 'long', 'look', 'looks',
    'made', 'make', 'makes', 'making', 'many', 'market', 'media', 'meet', 'meets', 'might', 'million',
    'more', 'most', 'move', 'moves', 'much', 'must', 'near', 'nearly', 'need', 'needs', 'never', 'news',
    'next', 'nine', 'north', 'official', 'officials', 'once', 'only', 'open', 'opens', 'other', 'over',
    'part', 'past', 'people', 'plan', 'plans', 'play', 'point', 'policy', 'power', 'press', 'price',
    'public', 'push', 'pushes', 'puts', 'raise', 'raises', 'rate', 'rates', 'reach', 'ready', 'real',
    'record', 'report', 'reports', 'return', 'returns', 'right', 'rise', 'rises', 'risk', 'risks',
    'road', 'role', 'rule', 'rules', 'said', 'says', 'second', 'seek', 'seeks', 'seen', 'send', 'sends',
    'seven', 'show', 'shows', 'side', 'sign', 'signs', 'since', 'site', 'some', 'soon', 'south', 'spark',
    'sparks', 'speak', 'star', 'start', 'starts', 'state', 'states', 'stay', 'step', 'steps', 'still',
    'stop', 'stops', 'story', 'study', 'support', 'take', 'takes', 'talk', 'talks', 'team', 'tell',
    'tells', 'test', 'tests', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'thing',
    'things', 'think', 'three', 'through', 'time', 'times', 'today', 'told', 'took', 'turn', 'turns',
    'under', 'until', 'update', 'updates', 'used', 'using', 'very', 'view', 'vote', 'votes', 'wait',
    'wants', 'warn', 'warns', 'watch', 'water', 'week', 'weeks', 'well', 'were', 'west', 'what', 'when',
    'where', 'which', 'while', 'will', 'with', 'within', 'without', 'women', 'work', 'working', 'world',
    'would', 'year', 'years', 'your', 'reuters', 'bloomberg', 'news', 'guardian', 'bbc', 'cnn'
  ]);
  return cleanHeadlineTitle(title)
    .toLowerCase()
    .replace(/\b(ex|anti|non|pre|post|pro|co)\s+(?=[a-z0-9]{4,})/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w));
}

// Interleave articles across outlets (round-robin) and group matching event topics together
// so simultaneous coverage of the same story always sits in the same 50-item batch
function interleaveByOutlet(articles) {
  const bySource = {};
  articles.forEach(art => {
    const sid = art.sourceId || 'unknown';
    if (!bySource[sid]) bySource[sid] = [];
    bySource[sid].push(art);
  });
  const queues = Object.values(bySource);
  const interleaved = [];
  let added = true;
  while (added) {
    added = false;
    for (const q of queues) {
      if (q.length > 0) {
        interleaved.push(q.shift());
        added = true;
      }
    }
  }
  // Group articles sharing >= 2 significant topic tokens adjacent to each other
  const tokenized = interleaved.map(art => ({ art, tokens: new Set(getHeadlineTopicTokens(art.title)) }));
  const grouped = [];
  const used = new Set();
  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    grouped.push(tokenized[i].art);
    if (tokenized[i].tokens.size < 2) continue;
    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j) || tokenized[j].tokens.size < 2) continue;
      let shared = 0;
      for (const t of tokenized[i].tokens) {
        if (tokenized[j].tokens.has(t)) shared++;
      }
      if (shared >= 2) {
        used.add(j);
        grouped.push(tokenized[j].art);
      }
    }
  }
  return grouped;
}

// Compute continuous sentiment score from 4 higher-order orthogonal dimensions:
// - polarity: -100 to +100 (inherent real-world valence & causal direction)
// - reach: 0 to 100 (breadth of human, institutional, or ecological scope)
// - permanence: 0 to 100 (depth & duration of consequence)
// - framing: -100 to +100 (editorial rhetoric & packaging vs neutral wire baseline)
function computeFourFactorScore(match) {
  const has4Factor = match.polarity !== undefined || match.reach !== undefined || match.permanence !== undefined || match.framing !== undefined;
  if (!has4Factor && typeof match.score === 'number') {
    const fallback = Number(Math.max(-1, Math.min(1, Number(match.score) || 0)).toFixed(2));
    return { score: fallback, eventBase: fallback, framingMod: 0 };
  }

  const pol = Math.max(-100, Math.min(100, Number(match.polarity) || 0)) / 100;
  const reach = Math.max(0, Math.min(100, Number(match.reach) || 0)) / 100;
  const perm = Math.max(0, Math.min(100, Number(match.permanence) || 0)) / 100;
  const frame = Math.max(-100, Math.min(100, Number(match.framing) || 0)) / 100;

  // First-Principles Magnitude Curve:
  // 1. Positive / Constructive progress (pol >= 0):
  //    Uses non-linear polarity selectivity (pol^1.32) combined with R^0.62 * D^0.38 (Hill midpoint 0.32, k = 1.75)
  //    so mundane macro/corporate statistics with low polarity (pol 15-26, e.g. rail traffic records, IPOs, routine winter funding)
  //    stay in Neutral (< +0.15) even when national in reach, while genuine scientific, ecological, and medical breakthroughs
  //    (pol >= 35, perm >= 50) scale cleanly from +0.20 to +0.88.
  //    Positive framingMod is scaled by Reach and capped at 35% of |eventBase|.
  // 2. Negative / Destructive harm (pol < 0):
  //    Reach (R^0.78 * D^0.22, Hill midpoint 0.28, k = 1.9) gates localized 1-2 person accidents (Reach 6-16)
  //    to -0.10..-0.24 while national/global crises scale to -0.45..-0.95.
  let eventBase;
  let framingMod;

  if (pol >= 0) {
    const polExp = (reach >= 0.55 && perm >= 0.50 && pol >= 0.20) ? 1.05 : 1.32;
    const polCurve = Math.pow(pol, polExp);
    const geoMag = Math.pow(Math.max(0.01, reach), 0.55) * Math.pow(Math.max(0.01, perm), 0.45);
    const gPow = Math.pow(geoMag, 1.85);
    const kPow = Math.pow(0.44, 1.85);
    const hill = gPow / (gPow + kPow);
    const impactScale = Math.min(1, 0.10 * geoMag + 0.90 * hill);
    eventBase = Number(Math.min(1, polCurve * impactScale * 1.18).toFixed(3));
    const rawFramingMod = frame * (0.08 + 0.20 * reach);
    const maxFraming = Math.abs(eventBase) * 0.28;
    framingMod = Number(Math.max(-maxFraming, Math.min(maxFraming, rawFramingMod)).toFixed(3));
  } else {
    const geoMag = Math.pow(Math.max(0.01, reach), 0.78) * Math.pow(Math.max(0.01, perm), 0.22);
    const gPow = Math.pow(geoMag, 1.9);
    const kPow = Math.pow(0.28, 1.9);
    const hill = gPow / (gPow + kPow);
    const impactScale = Math.min(1, 0.14 * reach + 0.86 * hill);
    eventBase = Number((pol * impactScale).toFixed(3));
    if (frame <= 0) {
      framingMod = Number((frame * 0.45).toFixed(3));
    } else {
      // Positive/promotional framing on a negative-polarity event can soften negativity by at most 35% of |eventBase|
      // and can NEVER flip a negative-polarity event (pol < 0) into a positive (> 0) Good News score!
      const rawFramingMod = frame * (0.10 + 0.22 * reach);
      const maxFraming = Math.abs(eventBase) * 0.35;
      framingMod = Number(Math.min(maxFraming, rawFramingMod).toFixed(3));
    }
  }
  const score = Number(Math.max(-1, Math.min(1, eventBase + framingMod)).toFixed(3));

  return {
    score,
    eventBase,
    framingMod,
    polarity: Math.round(pol * 100),
    reach: Math.round(reach * 100),
    permanence: Math.round(perm * 100),
    framing: Math.round(frame * 100)
  };
}

// Track if the Free Tier key hit a quota/rate-limit during this process run so subsequent calls skip straight to Paid fallback
let freeKeyExhaustedThisRun = false;
// Per-model:tier circuit breaker so a model hitting 429 daily quota is skipped immediately on all subsequent batches
const exhaustedModelTiers = new Set();

function getOrderedKeyTiers(apiKeyOrTiers) {
  if (Array.isArray(apiKeyOrTiers)) {
    const valid = apiKeyOrTiers.filter(t => t && t.key);
    if (freeKeyExhaustedThisRun && valid.length > 1) {
      return valid.filter(t => t.tier !== 'FREE').concat(valid.filter(t => t.tier === 'FREE'));
    }
    return valid;
  }
  return apiKeyOrTiers ? [{ key: apiKeyOrTiers, tier: 'PRIMARY' }] : [];
}

// Structured Gemini sentiment analysis with cross-outlet batching & 4-Factor First-Principles Formula
async function analyzeWithGemini(headlines, apiKeyOrTiers, requestedModel, customBatchSize, existingEvaluatedPool = []) {
  const keyTiers = getOrderedKeyTiers(apiKeyOrTiers);
  // Default to gemini-3.5-flash-lite first so all batches across the day use one consistent high-quota model (zero cross-model variance, no 20-RPD cap stalls)
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  // Pre-tokenize recent 4-factor articles from the last 36 hours for verified same-incident calibration
  const recentCutoffMs = Date.now() - (36 * 60 * 60 * 1000);
  const broadGeoOrConflictTokens = new Set([
    'saudi', 'arabia', 'iran', 'israel', 'israeli', 'gaza', 'ukraine', 'ukrainian', 'russia', 'russian',
    'china', 'chinese', 'united', 'states', 'american', 'trump', 'biden', 'europe', 'european', 'british',
    'houthi', 'houthis', 'attack', 'attacks', 'strike', 'strikes', 'military', 'forces', 'war', 'conflict'
  ]);
  const anchorCandidates = existingEvaluatedPool
    .filter(a => Array.isArray(a.factors) && a.factors.length === 4 && (!a.pubDate || new Date(a.pubDate).getTime() >= recentCutoffMs))
    .map(a => ({
      headline: a.title,
      factors: [a.factors[0], a.factors[1], a.factors[2]], // [polarity, reach, permanence] of prior dispatch
      tokens: new Set(getHeadlineTopicTokens(a.title))
    }))
    .filter(a => a.tokens.size >= 2);

  function findPriorEventAnchor(title) {
    const tokens = getHeadlineTopicTokens(title);
    if (tokens.length < 2) return null;
    const matches = [];
    for (const cand of anchorCandidates) {
      let shared = 0;
      let specificShared = 0;
      for (const t of tokens) {
        if (cand.tokens.has(t)) {
          shared++;
          if (!broadGeoOrConflictTokens.has(t)) specificShared++;
        }
      }
      const minLen = Math.min(tokens.length, cand.tokens.size);
      // Require at least 1 specific non-broad token (e.g. 'openai', 'accused', 'egypt', 'postpones') so generic 'saudi + houthi + attacks' never cross-matches unrelated stories
      if (specificShared >= 1 && (shared >= 3 || (shared >= 2 && shared / minLen >= 0.55))) {
        matches.push({ headline: cand.headline, factors: cand.factors, shared });
      }
    }
    if (matches.length < 2) return null;
    // Pick the candidate whose base polarity is closest to the consensus of all matching prior dispatches
    // so a single anomalous early evaluation never poisons subsequent batches
    const sortedPols = matches.map(m => m.factors[0]).sort((a, b) => a - b);
    const consensusPol = sortedPols[Math.floor(sortedPols.length / 2)];
    matches.sort((a, b) => Math.abs(a.factors[0] - consensusPol) - Math.abs(b.factors[0] - consensusPol) || b.shared - a.shared);
    return { headline: matches[0].headline, factors: matches[0].factors };
  }

  // Interleave & topic-group across outlets so simultaneous coverage of the same story sits in the same context window
  const orderedHeadlines = interleaveByOutlet(headlines);
  const BATCH_SIZE = customBatchSize || Number(process.env.GEMINI_BATCH_SIZE) || 50;
  const allResults = [];
  let modelUsed = modelsToTry[0];
  let tierUsed = keyTiers[0]?.tier || 'PRIMARY';

  for (let i = 0; i < orderedHeadlines.length; i += BATCH_SIZE) {
    const chunk = orderedHeadlines.slice(i, i + BATCH_SIZE);
    const promptData = chunk.map((item, index) => {
      const priorAnchor = findPriorEventAnchor(item.title);
      const nativeLang = item.lang || NATIVE_LANG_SOURCES.get(item.sourceId) || null;
      return {
        index,
        outlet: item.sourceId,
        ...(nativeLang ? { lang: nativeLang } : {}),
        headline: item.title,
        description: needsCleanEditorialSummary(item.description, item.title) ? '' : (item.description || ''),
        ...(priorAnchor ? { priorAnchor } : {})
      };
    });

    const prompt = `You are an impartial, senior media analyst evaluating global news dispatches from first principles.
Evaluate each article across FOUR continuous higher-order dimensions using precise integers (avoid rounding to multiples of 5 or 10):

1. "polarity" (integer -100 to 100 — Whole-Event Counterfactual Valence & Substantive Angle):
   Evaluate the net human and societal valence of the reality described in the dispatch along a continuous spectrum from -100 (maximum net harm, loss, or destruction) through 0 (neutral, routine, commercial/transactional, or offsetting outcomes) to +100 (maximum net constructive advancement).
   - Whole-Event Baseline vs. Isolated Verb Delta: Evaluate the net state of the entire situation described in the dispatch against a normal, unharmed baseline—never score the isolated delta of a final procedural or relief verb while ignoring the underlying subject. When a dispatch reports a hostage/kidnap release, prisoner-of-war exchange, police/fraud crackdown, mass arrest, drug/asset seizure, downstream judicial verdict, conviction, sentencing, bail/custody release, or accident/disaster survival response (e.g. rescuing a driver from a sinking car or finding a patient alive in a morgue), the event is a remediation or enforcement response to underlying captivity, war, crime, or trauma rather than a net advance above an unharmed baseline—keep "polarity" negative or strictly near zero (-25 to +8) and capture any relieved or celebratory tone strictly in "framing". Score polarity positively (+25 to +95) ONLY when the event produces a genuine net advancement above a normal unharmed baseline (such as curing disease, discovering scientific/historical truth, restoring ecosystems, or enacting durable public capacity).
   - Protests, Strikes, Demonstrations & Grievance Rallies: Treat protests, strikes, marches, and political grievance rallies as symptoms of underlying societal friction, institutional failure, or unresolved public grievance—scoring their baseline "polarity" as negative (-10 to -25 for peaceful demonstrations, marches, or protest-led voter mobilization; -25 to -45 for disruptive strikes, camp clearances, blockades, or protest detentions; -45 or lower for violent clashes or riots), unless the dispatch reports a concrete, completed constructive resolution (such as an enacted reform or signed agreement). When coverage profiles protesters sympathetically, heroically, or as an inspiring civic experiment, capture that upbeat journalistic angle strictly in "framing" (+15 to +50) while keeping "polarity" negative to reflect the underlying grievance or unrest.
   - Contested Policy & Polarized Perspectives: When an event is a contested political, economic, regulatory, or social development (rather than an objective physical tragedy, atrocity, or civil unrest), evaluate the substantive causal outcome foregrounded by this specific outlet's angle so genuine cross-outlet perspective differences are preserved.
   - Structural Advancement vs. Commercial Auctions, Windfalls, Routine Profits & Sports: Reserve high positive polarity (+40 to +95) and high reach/permanence for verified, tangible discoveries, medical/public-health breakthroughs, ecological restoration, and structural legislative/infrastructure advances that demonstrably improve human life or universal knowledge. Keep commercial art/collectible auctions (e.g. a Monet painting or vintage Pokémon cards selling for millions), individual lottery/attic windfalls, single-company quarterly profit surges, IPOs, and routine sports matches modest in polarity (+5 to +28) and bounded in reach/permanence (15 to 40) so they sit in the mild/mid range rather than rivaling scientific or societal breakthroughs.
   - Epistemic Actuality (Completed Milestone vs. Anticipatory Preview, Speculative Question, or Explainer): Score strictly what has ALREADY been empirically discovered, proven, launched, or enacted. When a major physical mission, legislative reform, or clinical trial has concretely succeeded or launched (e.g. a spacecraft successfully launching to Mars's moons or a legislature enacting a national workweek reform), score it as a verified tangible milestone (polarity +32 to +65, reach 60 to 85). Conversely, when an article is merely an unexecuted preview ("due to launch", "poised to find out"), an open question ("Could X solve Y?"), or an educational explainer, keep "polarity" and "permanence" modest (0 to +20) and assign speculative hype to "framing".

2. "reach" (integer 0 to 100 — Logarithmic Scope of Direct Real-World Impact):
   Measure the proportional breadth of the population, societal system, or universal knowledge domain directly impacted by the verified event along a continuous logarithmic scale from an isolated individual, 1–2 person medical/accident case, or single micro-location at the low end up to humanity at large, planetary ecosystems, or verified scientific/natural-history discoveries at the high end. Measure the population or domain directly affected by what has concretely occurred, not hypothetical future possibilities or the media audience reading about it.

3. "permanence" (integer 0 to 100 — Macro-Structural Horizon of Consequence):
   Measure the macro-structural durability of the verified consequence at the societal, institutional, ecological, or scientific level from ephemeral, speculative, uncompleted/anticipatory ("poised to", "could", "aims to"), commercial, or isolated 1–2 person occurrences at the low end up to irreversible macro-structural, geopolitical, ecological, or completed scientific transformations at the high end. Do not conflate personal irreversibility for an isolated individual, or the hypothetical future payoff of an unfinished experiment, with macro-societal permanence.

4. "framing" (integer -100 to 100 — Editorial Rhetoric vs. Neutral Wire Baseline):
   Measure the linguistic, emotional, and promotional spin of the headline relative to a dispassionate, strictly factual wire-service baseline (0), from -100 (maximally alarmist, sensationalist, or conflict-amplifying rhetoric) to +100 (maximally celebratory, promotional, speculative-hype, or agency-highlighting rhetoric).

CROSS-BATCH & INTRA-BATCH SAME-INCIDENT CALIBRATION:
- For dispatches within the same batch covering the exact same real-world incident, keep "reach" and "permanence" consistent and vary "polarity" only in proportion to genuine differences in substantive angle, while scoring "framing" independently for each headline's rhetoric.
- If an item includes "priorAnchor" { headline, factors: [polarity, reach, permanence] } from an earlier batch:
  1. First verify whether this article and "priorAnchor.headline" describe the EXACT same specific real-world incident AND whether "priorAnchor.factors" is reasonable under the rubric above (e.g. a mass-casualty strike or violent attack cannot have a minor -14 polarity). If they are different events OR if the prior anchor clearly mis-scored the severity of the event, IGNORE "priorAnchor" completely and score from first principles.
  2. If they ARE the exact same incident and the anchor is sound, use "priorAnchor.factors" [polarity, reach, permanence] as your baseline anchor so cross-batch scoring stays coherent—adjusting "polarity" only if this outlet foregrounds a materially different substantive angle or new development, and scoring "framing" 100% independently.

Return ONLY a JSON array of objects with:
- index: integer matching input index
- polarity: integer -100 to 100
- reach: integer 0 to 100
- permanence: integer 0 to 100
- framing: integer -100 to 100
- category: strictly one of 'world', 'politics', 'business', 'technology', 'science', 'climate', 'health', 'entertainment', 'sports', 'other'
- explanation: concise 1-sentence analytical note on real-world impact and headline framing
- englishTitle: REQUIRED whenever the article has a "lang" field (or is not in English) — translate the headline into a natural, accurate English wire headline that faithfully preserves the outlet's exact tone and framing (omit field ONLY if input is already in English)
- englishSummary: REQUIRED whenever the article has a "lang" field (or is not in English) — provide a concise 1-2 sentence English journalistic summary of the dispatch (do NOT mention scores, polarity, or framing; omit field ONLY if input is already in English)
- summary: ONLY IF polarity >= 15 AND input description is empty (""), write a clean, engaging 2-sentence journalistic summary of the story/breakthrough for readers (do NOT mention scores, polarity, or framing in summary; omit field otherwise)

Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY valid JSON.`;

    let batchSuccess = false;
    const activeTiers = getOrderedKeyTiers(apiKeyOrTiers);
    for (const modelName of modelsToTry) {
      if (batchSuccess) break;
      for (const keyObj of activeTiers) {
        if (batchSuccess) break;
        const modelTierKey = `${modelName}:${keyObj.tier}`;
        if (exhaustedModelTiers.has(modelTierKey)) continue;
        const genAI = new GoogleGenerativeAI(keyObj.key);
        const maxAttempts = keyObj.tier === 'FREE' && activeTiers.length > 1 ? 1 : 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            console.log(`[Gemini] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(orderedHeadlines.length / BATCH_SIZE)} (${chunk.length} items) using ${modelName} [${keyObj.tier} key] (attempt ${attempt}/${maxAttempts})...`);
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: { temperature: 0.1, maxOutputTokens: 65536, responseMimeType: 'application/json' }
            });

            const generatePromise = model.generateContent(prompt);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Gemini API call timed out after 120s')), 120000)
            );
            const response = await Promise.race([generatePromise, timeoutPromise]);
            let text = response.response.text().trim();
            if (text.startsWith('```json')) text = text.substring(7);
            else if (text.startsWith('```')) text = text.substring(3);
            if (text.endsWith('```')) text = text.substring(0, text.length - 3);
            text = tryRepairJsonArray(text.trim());

            const parsed = JSON.parse(text);
            if (Array.isArray(parsed) && parsed.length > 0) {
              let matchedInBatch = 0;
              chunk.forEach((item, idx) => {
                const match = parsed.find(r => r && r.index === idx);
                // Never fabricate a 0.00 fallback if an item was omitted or truncated
                const requiresTranslation = Boolean(item.lang || NATIVE_LANG_SOURCES.has(item.sourceId));
                if (!match || typeof match.polarity !== 'number' || !match.explanation || (requiresTranslation && (!match.englishTitle || match.englishTitle.trim().length <= 10))) {
                  return;
                }
                matchedInBatch++;
                const calc = computeFourFactorScore(match);
                const expSuffix = ` [Event Base: ${calc.eventBase >= 0 ? '+' : ''}${calc.eventBase.toFixed(2)} | Editorial Framing: ${calc.framingMod >= 0 ? '+' : ''}${calc.framingMod.toFixed(2)}]`;
                const rawExp = String(match.explanation).replace(/\s*\[Event Base:.*$/, '');
                const cleanSummary = typeof match.summary === 'string' && match.summary.trim().length > 25 ? match.summary.trim() : null;
                const cleanEnTitle = typeof match.englishTitle === 'string' && match.englishTitle.trim().length > 10 ? match.englishTitle.trim() : null;
                const cleanEnDesc = typeof match.englishSummary === 'string' && match.englishSummary.trim().length > 20 ? match.englishSummary.trim() : null;
                const effectiveTitle = cleanEnTitle || item.title;
                allResults.push({
                  sourceId: item.sourceId,
                  title: item.title,
                  ...(cleanEnTitle ? { englishTitle: cleanEnTitle } : {}),
                  ...(cleanEnDesc ? { englishSummary: cleanEnDesc } : {}),
                  link: item.link,
                  sentiment: calc.score,
                  eventBase: calc.eventBase,
                  framingMod: calc.framingMod,
                  factors: [calc.polarity, calc.reach, calc.permanence, calc.framing],
                  category: match.category || 'other',
                  explanation: rawExp + expSuffix,
                  ...(cleanSummary ? { summary: cleanSummary } : {})
                });
                // Feed verified [polarity, reach, permanence] + headline into anchorCandidates for subsequent batches in this run
                const itemTokens = getHeadlineTopicTokens(effectiveTitle);
                if (itemTokens.length >= 2) {
                  anchorCandidates.push({
                    headline: effectiveTitle,
                    factors: [calc.polarity, calc.reach, calc.permanence],
                    tokens: new Set(itemTokens)
                  });
                }
              });
              if (matchedInBatch < chunk.length) {
                console.warn(`[Gemini] Partial batch: ${matchedInBatch}/${chunk.length} items returned (${chunk.length - matchedInBatch} left queued).`);
              }
              modelUsed = modelName;
              tierUsed = keyObj.tier;
              batchSuccess = true;
              break;
            }
          } catch (err) {
            const msg = String(err.message || err);
            const isQuotaOrRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit');
            const isDemandSpike = isQuotaOrRateLimit || msg.includes('503') || msg.includes('high demand') || msg.includes('timed out');
            console.warn(`[Gemini] Model ${modelName} [${keyObj.tier} key] attempt ${attempt}/${maxAttempts} warning:`, msg);
            if (isQuotaOrRateLimit) {
              exhaustedModelTiers.add(modelTierKey);
              if (keyObj.tier === 'FREE' && activeTiers.length > 1) {
                freeKeyExhaustedThisRun = true;
                console.log('[Gemini] Free tier key reached rate/quota limit — switching to PAID fallback key...');
              } else {
                console.log(`[Gemini] Quota reached for ${modelName} [${keyObj.tier} key] — circuit-breaking model for remainder of run.`);
              }
              break;
            }
            if (attempt < maxAttempts) {
              const waitMs = isDemandSpike ? 4000 : 2000;
              await new Promise(r => setTimeout(r, waitMs));
            } else {
              exhaustedModelTiers.add(modelTierKey);
            }
          }
        }
      }
    }

    if (!batchSuccess) {
      console.warn(`[Gemini] Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} items) could not be evaluated due to temporary upstream spikes. STRICT ZERO-OFFLINE POLICY: Skipping batch without offline fallback. Articles remain queued for next sync.`);
    }

    if (i + BATCH_SIZE < orderedHeadlines.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  return { results: allResults, modelUsed, tierUsed };
}

// Structured Groq sentiment analysis
async function analyzeWithGroq(headlines, apiKey, modelName = 'llama-3.1-8b-instant') {
  const BATCH_SIZE = 35;
  const allParsed = [];

  for (let i = 0; i < headlines.length; i += BATCH_SIZE) {
    const batch = headlines.slice(i, i + BATCH_SIZE);
    const promptData = batch.map((item, idx) => ({
      index: i + idx,
      headline: item.title,
      description: item.description || ''
    }));

    const prompt = `You are an expert news editor and sentiment analyzer. Analyze sentiment of the following articles.
Return a JSON array of objects with:
- index: matching input index
- score: float between -1.0 and 1.0 (2 decimal places)
- category: "politics", "world", "business", "technology", "science", "health", "entertainment", "sports", or "other"
- explanation: 1-sentence rationale

Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY valid JSON array.`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    let text = data.choices[0].message.content.trim();
    if (text.startsWith('```json')) text = text.substring(7);
    if (text.endsWith('```')) text = text.substring(0, text.length - 3);
    text = tryRepairJsonArray(text.trim());

    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : (Object.values(parsed).find(v => Array.isArray(v)) || [parsed]);
    allParsed.push(...arr);

    if (i + BATCH_SIZE < headlines.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const results = headlines.map((item, index) => {
    const match = allParsed.find(r => r.index === index) || { score: 0, category: 'other' };
    return {
      ...item,
      sentiment: Number(match.score) || 0,
      category: match.category || 'other',
      explanation: match.explanation || 'Analyzed via Groq.'
    };
  });

  return { results, modelUsed: modelName };
}

// Structural region mapping of the 39 news sources (feed metadata only — zero topic hardcoding)
const SOURCE_REGION_MAP = {
  nyt: 'NA', cnn: 'NA', fox: 'NA', npr: 'NA', pbs: 'NA', cnbc: 'NA', bloomberg: 'NA', wsj: 'NA', cbc: 'NA', globalnews: 'NA',
  batimes: 'LATAM', mexiconews: 'LATAM', mercopress: 'LATAM', agenciabrasil: 'LATAM', oglobo: 'LATAM', latercera: 'LATAM',
  bbc: 'UK', guardian: 'UK', skynews: 'UK', ft: 'UK',
  dw: 'EU', nzz: 'EU', france24: 'EU', euronews: 'EU', lemonde: 'EU', elpais: 'EU', repubblica: 'EU', rte: 'EU',
  abcau: 'APAC', smh: 'APAC', scmp: 'APAC', japantimes: 'APAC', cna: 'APAC',
  aljazeera: 'MEA', thenational: 'MEA', africanews: 'MEA',
  reuters: 'WIRE', ap: 'WIRE', newscientist: 'SCI', arstechnica: 'SCI'
};

// Pure grammatical/function words only (zero hardcoded topic keywords)
const BURST_GRAMMAR_STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'after', 'over', 'into', 'amid', 'have', 'were', 'been', 'their',
  'about', 'more', 'most', 'news', 'says', 'said', 'will', 'what', 'when', 'where', 'which', 'while', 'under', 'between',
  'first', 'found', 'years', 'world', 'early', 'near', 'report', 'reports', 'new', 'how', 'why', 'who', 'its', 'his',
  'her', 'they', 'them', 'are', 'was', 'has', 'had', 'not', 'but', 'can', 'out', 'all', 'one', 'two', 'three', 'four',
  'five', 'six', 'may', 'now', 'just', 'like', 'than', 'other', 'some', 'time', 'year', 'week', 'day', 'days', 'make',
  'made', 'take', 'took', 'get', 'gets', 'got', 'back', 'down', 'off', 'still', 'even', 'also', 'could', 'would', 'should',
  'see', 'seen', 'look', 'looks', 'live', 'updates', 'update', 'latest', 'watch', 'video', 'photos', 'opinion', 'analysis',
  'review', 'podcast', 'briefing', 'morning', 'evening', 'daily'
]);

function stemBurstWord(w) {
  return w.replace(/(ian|ians|an|ans|ish|ese|ing|ed|es|s)$/, '');
}

/**
 * Zero-LLM, Zero-Keyword Breaking Burst Detector:
 * Fires when >=4 distinct outlets across >=3 global regions converge on a stemmed token pair
 * within a 90-minute rolling window, and at least 2 of those dispatches are new/unclustered
 * since the previous clustering pass.
 */
function detectCrossRegionBreakingBurst(finalSources, previousClusters = [], lastClusteredAt = null, nowMs = Date.now()) {
  const WIN_MS = 90 * 60 * 1000; // 90-minute rolling window
  const cutoffMs = nowMs - WIN_MS;
  const lastClusterMs = lastClusteredAt ? new Date(lastClusteredAt).getTime() : 0;

  // Build set of already-clustered article URLs/titles so an already-clustered burst doesn't re-trigger on the next 30m tick
  const alreadyClusteredKeys = new Set();
  if (Array.isArray(previousClusters)) {
    for (const cl of previousClusters) {
      if (Array.isArray(cl?.seenArticleKeys)) {
        cl.seenArticleKeys.forEach(k => alreadyClusteredKeys.add(k));
      }
      if (Array.isArray(cl?.coverage)) {
        cl.coverage.forEach(c => {
          if (c.link) alreadyClusteredKeys.add(canonicalUrl(c.link));
          if (c.title) alreadyClusteredKeys.add(cleanHeadlineTitle(c.title));
        });
      }
    }
  }

  const recentArticles = [];
  for (const [sourceId, src] of Object.entries(finalSources || {})) {
    const region = SOURCE_REGION_MAP[sourceId] || 'OTHER';
    for (const art of (src.articles || [])) {
      const pubMs = art.pubDate ? new Date(art.pubDate).getTime() : NaN;
      if (isNaN(pubMs) || pubMs < cutoffMs || pubMs > nowMs + 5 * 60 * 1000) continue;

      const rawWords = cleanHeadlineTitle(art.title || '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !BURST_GRAMMAR_STOPWORDS.has(w) && !/^\d+$/.test(w));
      const stems = [...new Set(rawWords.map(stemBurstWord).filter(w => w.length >= 4))];
      if (stems.length < 2) continue;

      const cUrl = art.link ? canonicalUrl(art.link) : '';
      const cTitle = cleanHeadlineTitle(art.title || '');
      const isFreshSinceLastCluster = (pubMs > lastClusterMs) || (!alreadyClusteredKeys.has(cUrl) && !alreadyClusteredKeys.has(cTitle));

      recentArticles.push({
        sourceId,
        region,
        title: art.title, description: art.description || '',
        pubMs,
        stems,
        isFreshSinceLastCluster
      });
    }
  }

  if (recentArticles.length < 3) return null;

  const pairMap = new Map();
  for (const a of recentArticles) {
    const ws = a.stems;
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const key = ws[i] < ws[j] ? `${ws[i]}+${ws[j]}` : `${ws[j]}+${ws[i]}`;
        let entry = pairMap.get(key);
        if (!entry) {
          entry = { outlets: new Set(), regions: new Set(), freshOutlets: new Set(), articles: [] };
          pairMap.set(key, entry);
        }
        entry.outlets.add(a.sourceId);
        entry.regions.add(a.region);
        if (a.isFreshSinceLastCluster) entry.freshOutlets.add(a.sourceId);
        entry.articles.push(a);
      }
    }
  }

  const candidates = [...pairMap.entries()]
    .filter(([, info]) => {
      const isGlobalBurst = (info.outlets.size >= 4 && info.regions.size >= 3 && info.freshOutlets.size >= 2) ||
        (info.outlets.size >= 3 && info.regions.size >= 3 && info.freshOutlets.size >= 3);
      const isRegionalSurge = info.outlets.size >= 5 && info.regions.size >= 1 && info.freshOutlets.size >= 3;
      return isGlobalBurst || isRegionalSurge;
    })
    .sort((a, b) => b[1].outlets.size - a[1].outlets.size || b[1].regions.size - a[1].regions.size);

  if (candidates.length === 0) return null;

  const [bestPair, bestInfo] = candidates[0];
  bestInfo.articles.sort((a, b) => b.pubMs - a.pubMs);
  return {
    mode: bestInfo.regions.size >= 3 ? 'cross-region-burst' : 'regional-surge',
    pair: bestPair,
    outlets: bestInfo.outlets.size,
    regions: bestInfo.regions.size,
    freshOutlets: bestInfo.freshOutlets.size,
    regionList: Array.from(bestInfo.regions),
    sampleTitle: bestInfo.articles[0]?.title || ''
  };
}

function extractCoherenceStems(str) {
  const stop = new Set([
    'about','accord','according','across','after','against','alread','already','also','although','amid','amidst',
    'among','announc','announce','announced','announces','around','author','authorities','authority','back','becam',
    'became','becaus','because','becom','become','becomes','been','before','behind','between','beyond','billion',
    'both','bloomberg','call','calls','cannot','city','come','comes','confirm','confirmed','confirms','could',
    'countries','country','days','despit','despite','down','during','earlier','early','even','extern','external',
    'first','five','four','from','global','good','government','great','group','guardian','have','having','head',
    'help','helped','here','high','however','intern','internal','international','into','just','keep','last','late',
    'latest','lead','leader','leaders','left','less','life','like','live','long','look','made','make','making',
    'many','meanwhile','million','minister','month','more','most','move','much','must','national','near','need',
    'never','news','next','nine','official','officials','once','only','open','other','over','part','past','people',
    'plan','plans','play','point','president','public','push','recent','recently','report','reports','return',
    'reuters','right','rise','risk','said','says','second','secure','secured','seen','send','separat','separate',
    'separately','several','seven','show','side','sign','since','some','soon','spark','state','states','still',
    'stop','story','study','support','take','taking','talk','team','tell','test','than','that','their','them',
    'then','there','these','they','thing','think','those','though','three','through','time','times','today','told',
    'took','toward','towards','tried','tries','turn','under','until','update','used','very','view','vote','wait',
    'wants','warn','watch','week','weeks','well','were','what','when','where','whether','which','while','will',
    'with','within','without','work','world','would','year','years','young'
  ]);
  const demonymMap = {
    french: 'france', british: 'britain', spanish: 'spain', dutch: 'netherlands',
    polish: 'poland', turkish: 'turkey', swedish: 'sweden', danish: 'denmark',
    finnish: 'finland', irish: 'ireland', scottish: 'scotland', greek: 'greece',
    swiss: 'switzerland', lebanese: 'lebanon', congolese: 'congo', sudanese: 'sudan',
    taiwanese: 'taiwan', japanese: 'japan', chinese: 'china', tunisian: 'tunisia',
    tunisians: 'tunisia', brazilian: 'brazil', brazilians: 'brazil', ecuadorian: 'ecuador',
    ecuadorean: 'ecuador', albanian: 'albania', indonesian: 'indonesia', malaysian: 'malaysia',
    israeli: 'israel', israelis: 'israel', palestinian: 'palestine', palestinians: 'palestine',
    iranian: 'iran', iranians: 'iran', russian: 'russia', russians: 'russia',
    ukrainian: 'ukraine', ukrainians: 'ukraine', australian: 'australia', australians: 'australia',
    canadian: 'canada', canadians: 'canada', mexican: 'mexico', italian: 'italy',
    german: 'germany', indian: 'india', pakistani: 'pakistan', egyptian: 'egypt',
    syrian: 'syria', yemeni: 'yemen', detained: 'arrest', detains: 'arrest',
    detain: 'arrest', detention: 'arrest', custody: 'arrest', rearrested: 'arrest',
    rearresting: 'arrest', investigations: 'probe', investigation: 'probe', investigating: 'probe',
    shutting: 'clos', shuts: 'clos', shut: 'clos', closures: 'clos', closure: 'clos',
    cancelled: 'cancel', cancels: 'cancel', canceled: 'cancel', cancellations: 'cancel',
    postpones: 'cancel', postponed: 'cancel', forces: 'milit', military: 'milit', troops: 'milit',
    deaths: 'kill', dead: 'kill', fatalities: 'kill', fatality: 'kill', killed: 'kill', killing: 'kill',
    injured: 'injur', injuries: 'injur', wounded: 'injur', cuts: 'cut', cutting: 'cut', slashes: 'cut', reductions: 'cut'
  };
  const rawStr = String(str || '').replace(/\b(?:([A-Z])\.){2,}/g, (m) => m.replace(/\./g, ''));
  const acronymTokens = (rawStr.match(/\b[A-Z]{2,5}\b/g) || [])
    .map(a => a.toLowerCase())
    .filter(a => !stop.has(a) && !/^q[1-4]$/.test(a))
    .map(a => demonymMap[a] || a);
  return [
    ...acronymTokens,
    ...rawStr
    .toLowerCase()
    .replace(/\bstarshield\b/g, 'starlink')
    .replace(/\bu\.?k\.?(?!\w)/g, 'britain')
    .replace(/\bu\.?s\.?(?:a\.?)?(?!\w)/g, 'america')
    .replace(/\bboj\b/g, 'japan')
    .replace(/\bboe\b/g, 'britain')
    .replace(/\bstatscan\b|\bstatcan\b/g, 'canada')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => demonymMap[w] || w)
    .filter(w => w.length >= 4 && !stop.has(w))
    .map(w => w.replace(/(ing|tion|ions|ment|ments|ness|ally|ed|es|s)$/, '').slice(0, 6))
    .filter(w => w.length >= 3 && !stop.has(w))
  ];
}

const SOVEREIGN_COUNTRY_PATTERNS = [
  ['uk', /\b(u\.?k\.?(?!\w)|united kingdom|britain|british|england|english|scotland|scottish|wales|welsh|northern ireland|belfast|london|westminster|downing street|isles of scilly|cornwall|devon|bank of england|\bboe\b|met office|chancellor|healey|starmer|burnham)\b/i],
  ['canada', /\b(canada|canadian|ottawa|toronto|montreal|vancouver|halifax|ontario|quebec|nova scotia|newfoundland|labrador|new brunswick|prince edward island|alberta|british columbia|manitoba|saskatchewan|atlantic canada|statscan|statcan|statistics canada|bank of canada)\b/i],
  ['japan', /\b(japan|japanese|tokyo|osaka|kyoto|chiba|hokkaido|okinawa|bank of japan|\bboj\b|\byen\b)\b/i],
  ['us', /\b(u\.?s\.?(?:a\.?)?(?!\w)|united states|america|american|washington|white house|pentagon|congress|senate|federal reserve|wall street|california|texas|florida|new york|chicago|los angeles|oregon|pennsylvania|michigan|georgia|ohio|arizona)\b/i],
  ['france', /\b(france|french|paris|marseille|lyon|toulouse|nice|normandy|brittany|macron|elysee)\b/i],
  ['germany', /\b(germany|german|berlin|munich|frankfurt|hamburg|cologne|leipzig|dresden|stuttgart|bavaria|saxony|berchtesgaden|bundesbank|scholz|merz)\b/i],
  ['italy', /\b(italy|italian|rome|milan|naples|turin|venice|florence|sicily|meloni)\b/i],
  ['spain', /\b(spain|spanish|madrid|barcelona|catalonia|valencia|seville|andalusia)\b/i],
  ['australia', /\b(australia|australian|sydney|canberra|melbourne|brisbane|perth|adelaide|hobart|darwin|queensland|victoria|new south wales|south australia|western australia|tasmania|\brba\b)\b/i],
  ['new_zealand', /\b(new zealand|auckland|wellington|christchurch|kiwi)\b/i],
  ['china', /\b(china|chinese|beijing|shanghai|shenzhen|guangzhou|chengdu|wuhan|tibet|xinjiang|hong kong|\bpboc\b)\b/i],
  ['taiwan', /\b(taiwan|taiwanese|taipei)\b/i],
  ['india', /\b(india|indian|new delhi|delhi|mumbai|bengaluru|chennai|kolkata|hyderabad|\brbi\b|modi)\b/i],
  ['pakistan', /\b(pakistan|pakistani|islamabad|karachi|lahore)\b/i],
  ['brazil', /\b(brazil|brazilian|brazilians|brasilia|sao paulo|são paulo|rio de janeiro|bahia|\bstf\b|\btse\b|tre-ba|nunes marques|lula|bolsonaro)\b/i],
  ['russia', /\b(russia|russian|moscow|kremlin|st\.?\s*petersburg|putin)\b/i],
  ['ukraine', /\b(ukraine|ukrainian|kyiv|kharkiv|odesa|odessa|lviv|donbas|crimea|zelensky|zelenskyy)\b/i],
  ['israel', /\b(israel|israeli|jerusalem|tel aviv|haifa|\bidf\b|west bank|gaza|netanyahu)\b/i],
  ['palestine', /\b(palestine|palestinian|ramallah|gaza|west bank)\b/i],
  ['iran', /\b(iran|iranian|tehran)\b/i],
  ['iraq', /\b(iraq|iraqi|baghdad|erbil)\b/i],
  ['syria', /\b(syria|syrian|damascus|aleppo)\b/i],
  ['lebanon', /\b(lebanon|lebanese|beirut)\b/i],
  ['yemen', /\b(yemen|yemeni|sanaa|aden|houthi)\b/i],
  ['saudi', /\b(saudi|riyadh|jeddah)\b/i],
  ['uae', /\b(u\.?a\.?e\.?|united arab emirates|dubai|abu dhabi)\b/i],
  ['turkey', /\b(turkey|turkiye|türkiye|turkish|ankara|istanbul|erdogan)\b/i],
  ['egypt', /\b(egypt|egyptian|cairo|alexandria)\b/i],
  ['haiti', /\b(haiti|haitian|port-au-prince)\b/i],
  ['el_salvador', /\b(el salvador|salvadoran|bukele)\b/i],
  ['ecuador', /\b(ecuador|ecuadorian|quito|guayaquil)\b/i],
  ['mexico', /\b(mexico|mexican|mexico city|guadalajara|monterrey|sheinbaum)\b/i],
  ['argentina', /\b(argentina|argentine|argentinian|buenos aires|milei)\b/i],
  ['colombia', /\b(colombia|colombian|bogota|medellin)\b/i],
  ['chile', /\b(chile|chilean|santiago)\b/i],
  ['venezuela', /\b(venezuela|venezuelan|caracas|maduro)\b/i],
  ['albania', /\b(albania|albanian|tirana)\b/i],
  ['indonesia', /\b(indonesia|indonesian|jakarta|sulawesi|bali|sumatra|prabowo)\b/i],
  ['malaysia', /\b(malaysia|malaysian|kuala lumpur)\b/i],
  ['singapore', /\b(singapore|singaporean)\b/i],
  ['philippines', /\b(philippines|philippine|filipino|manila)\b/i],
  ['south_korea', /\b(south korea|south korean|seoul)\b/i],
  ['north_korea', /\b(north korea|north korean|pyongyang)\b/i],
  ['ireland', /\b(ireland|irish|dublin|cork|galway|leinster|munster|connacht|ulster|met éireann|met eireann)\b/i],
  ['netherlands', /\b(netherlands|dutch|amsterdam|rotterdam|the hague)\b/i],
  ['belgium', /\b(belgium|belgian|brussels|antwerp)\b/i],
  ['switzerland', /\b(switzerland|swiss|zurich|geneva|bern)\b/i],
  ['austria', /\b(austria|austrian|vienna)\b/i],
  ['poland', /\b(poland|polish|warsaw|krakow)\b/i],
  ['greece', /\b(greece|greek|athens|thessaloniki)\b/i],
  ['sweden', /\b(sweden|swedish|stockholm)\b/i],
  ['norway', /\b(norway|norwegian|oslo)\b/i],
  ['denmark', /\b(denmark|danish|copenhagen)\b/i],
  ['finland', /\b(finland|finnish|helsinki)\b/i],
  ['portugal', /\b(portugal|portuguese|lisbon|porto)\b/i],
  ['lithuania', /\b(lithuania|lithuanian|vilnius|kaunas)\b/i],
  ['latvia', /\b(latvia|latvian|riga)\b/i],
  ['estonia', /\b(estonia|estonian|tallinn)\b/i],
  ['bulgaria', /\b(bulgaria|bulgarian|sofia)\b/i],
  ['romania', /\b(romania|romanian|bucharest)\b/i],
  ['south_africa', /\b(south africa|south african|johannesburg|cape town|pretoria)\b/i],
  ['nigeria', /\b(nigeria|nigerian|lagos|abuja)\b/i],
  ['kenya', /\b(kenya|kenyan|nairobi)\b/i],
  ['sudan', /\b(sudan|sudanese|khartoum|darfur)\b/i],
  ['niger', /\b(niger|niamey)\b/i],
  ['libya', /\b(libya|libyan|tripoli|benghazi)\b/i],
  ['tunisia', /\b(tunisia|tunisian|tunis)\b/i]
];

function detectSovereignCountries(text) {
  const s = new Set();
  const str = String(text || '');
  for (const [code, re] of SOVEREIGN_COUNTRY_PATTERNS) {
    if (re.test(str)) s.add(code);
  }
  return s;
}

function haversineKm(locA, locB) {
  if (!locA || !locB || typeof locA.lat !== 'number' || typeof locA.lon !== 'number' || typeof locB.lat !== 'number' || typeof locB.lon !== 'number') {
    return null;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(locB.lat - locA.lat);
  const dLon = toRad(locB.lon - locA.lon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(locA.lat)) * Math.cos(toRad(locB.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Common English vocabulary (verbs, adjectives, generic news nouns, time words, and broad country/region labels)
// that appear capitalized in Title-Case headlines without being specific Proper-Noun Subject Entities.
const COMMON_HEADLINE_NON_ENTITY_STEMS = new Set(extractCoherenceStems(
  'inflation september october november december january february march april june july august ' +
  'monday tuesday wednesday thursday friday saturday sunday today yesterday tomorrow weekend morning evening ' +
  'annual monthly quarterly percent rate interest price prices fuel gasoline energy oil crude gas growth economy economic ' +
  'budget fiscal treasury finance financial debt borrowing deficit surplus tax bank central tightening ' +
  'consumer confidence cost living market markets stock stocks share shares investor investors tech technology rout rally ' +
  'funding round valuation revenue earnings profit quarter billion million trillion record high low surge surges jump jumps climb climbs ' +
  'rise rises rising rose fall falls falling drop drops plunge plunges plummet plummets slump slumps tumble tumbles sink sinks ' +
  'supreme court appeal appeals federal judge justice sentencing offender offenders prison prisoner detained custody release released freed ' +
  'criminal ban unconstitutional campaign midterm election elections electoral runoff voter voters vote votes voting extend extends extended poll polls ballot ballots tally counting ' +
  'debate debates spar spars sparring welfare payment payments subsidy subsidies fast track tracks ahead ' +
  'bus buses fleet fleets shortage shortages restoration restore restores transit transport mobility ' +
  'senate congress parliament minister prime president government official officials police security arrest arrested suspect suspects ' +
  'protest protests riot riots unrest strike strikes clash clashes curfew curfews blockade ' +
  'attack attacks crisis force forces military army troop troops service draft disruption restriction impose prompt order orders ' +
  'escalate report reports update updates announce announces reveal reveals confirm confirms discover discovers found ' +
  'scientist scientists astronomer astronomers researcher researchers doctor doctors study trial clinical vaccine vaccines ' +
  'pharmaceutical firm firms company companies corporation corporations advanced novel experimental bespoke ' +
  'cancer patient patients treatment disease medical health hospital outbreak virus infection ' +
  'storm storms subtropical hurricane typhoon cyclone severe weather gale gales wind winds rain flood floods flooding warning warnings ' +
  'impact impacts hit hits strike strikes batter batters lash lashes bring brings trigger triggers prompt prompts spark sparks ' +
  'wildfire fire fires blaze earthquake tremor landslide avalanche power outage outages blackout ' +
  'flight flights plane aircraft airport airspace divert diverts diverted bomb threat threats drone drones explode explodes explosion ' +
  'suspected breach breaches investigate investigated investigation probe crash crashes derailment train ship vessel ' +
  'hostage hostages return returns home woman man child children family people citizen citizens ' +
  'defeat defeats beat beats win wins lose loses draw draws match game league premier championship title ambitions defend defends ' +
  'gear gears run season player players coach team club ' +
  'britain united kingdom england scotland wales ireland canada japan america france germany italy spain australia new zealand ' +
  'china taiwan india pakistan brazil russia ukraine israel palestine iran iraq syria lebanon yemen saudi arabia egypt ' +
  'haiti ecuador mexico argentina colombia chile venezuela albania indonesia malaysia singapore singaporean philippines korea ' +
  'netherlands belgium switzerland austria poland greece sweden norway denmark finland portugal lithuania latvia estonia ' +
  'bulgaria romania south africa nigeria kenya sudan niger libya tunisia ' +
  'europe european asia asian southeast africa african latin american middle east eastern north south west western gulf atlantic pacific ' +
  'prabowo subianto macron emmanuel trump donald putin vladimir zelensky volodymyr netanyahu benjamin lula silva bolsonaro jair ' +
  'starmer keir burnham andy albanese anthony modi narendra xi jinping biden joe harris kamala erdogan milei sheinbaum carney merz scholz meloni'
));

const GENERIC_DOMESTIC_BEAT_STEMS = COMMON_HEADLINE_NON_ENTITY_STEMS;

// Extract Named Storm/Disaster Designators (e.g. "Storm Austen" -> "austen", "Subtropical Storm Josephine" -> "josephine")
function extractNamedWeatherDesignators(text) {
  const out = new Set();
  const str = String(text || '');
  const re = /\b(?:Subtropical\s+)?(?:Storm|Hurricane|Typhoon|Cyclone)\s+([A-Z][a-z]{2,})\b/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const name = m[1].toLowerCase();
    if (!/^(warning|warnings|watch|watches|system|systems|season|track|center|centre|force|surge|damage|hit|hits|strike|strikes|bring|brings)$/.test(name)) {
      out.add(name);
    }
  }
  return out;
}

// Extract case-preserved Proper-Noun Subject Entities from a headline + supporting prose (summary/descriptions).
// Uses mid-sentence capitalization in prose + non-generic Title-Case tokens in headlines so common nouns
// ("storm", "defeats", "flight", "drone", "hostages", "stocks") are never mistaken for proper-noun entities.
function extractProperSubjectEntities(headline = '', bodyText = '') {
  const properStems = new Set();
  const headProperStems = new Set();
  const properDisplay = [];
  const headProperDisplay = [];
  const seenDisplayLower = new Set();
  const seenHeadDisplayLower = new Set();
  const midSentenceConfirmedStems = new Set();

  const addEntity = (rawWord, isHead = false) => {
    const clean = String(rawWord || '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/'s$/i, '');
    if (clean.length < 3) return;
    const stems = extractCoherenceStems(clean);
    const validStems = stems.filter(s => !COMMON_HEADLINE_NON_ENTITY_STEMS.has(s) && !/^\d+$/.test(s));
    if (validStems.length === 0) return;
    validStems.forEach(s => {
      properStems.add(s);
      if (isHead) headProperStems.add(s);
    });
    const lower = clean.toLowerCase();
    if (!seenDisplayLower.has(lower) && properDisplay.length < 8) {
      seenDisplayLower.add(lower);
      properDisplay.push(clean);
    }
    if (isHead && !seenHeadDisplayLower.has(lower) && headProperDisplay.length < 6) {
      seenHeadDisplayLower.add(lower);
      headProperDisplay.push(clean);
    }
  };

  // 1. Named weather systems ("Storm Austen", "Subtropical Storm Josephine")
  const combined = `${headline || ''} ${bodyText || ''}`;
  const stormRe = /\b((?:Subtropical\s+)?(?:Storm|Hurricane|Typhoon|Cyclone)\s+([A-Z][a-z]{2,}))\b/g;
  let sm;
  while ((sm = stormRe.exec(combined)) !== null) {
    extractCoherenceStems(sm[2]).forEach(s => midSentenceConfirmedStems.add(s));
    addEntity(sm[1], String(headline || '').includes(sm[2]));
  }

  // 2. Mid-sentence capitalized words in prose (summary/descriptions) — guaranteed proper nouns by English orthography,
  // plus sentence-initial words that carry possessive "'s", are followed by another capitalized proper noun/title, or match the headline's opening subject word.
  const firstHeadWordClean = String(headline || '').trim().split(/\s+/)[0]?.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/'s$/i, '').toLowerCase() || '';
  const sentences = String(bodyText || '').split(/(?<=[.!?])\s+/);
  for (const sent of sentences) {
    const allWords = sent.trim().split(/\s+/);
    for (let wi = 0; wi < allWords.length; wi++) {
      const rawW = allWords[wi];
      const hasPossessive = /'s$/i.test(rawW);
      const clean = rawW.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/'s$/i, '');
      if (clean.length < 3 || !/^[A-Z][A-Za-z0-9-]+$/.test(clean)) continue;
      if (wi === 0) {
        const nextClean = (allWords[1] || '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
        const thirdClean = (allWords[2] || '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
        const nextIsCap = nextClean.length >= 2 && /^[A-Z]/.test(nextClean);
        const coordNextIsCap = /^(and|&|vs\.?|or)$/i.test(allWords[1] || '') && thirdClean.length >= 2 && /^[A-Z]/.test(thirdClean);
        const matchesHeadSubject = clean.toLowerCase() === firstHeadWordClean;
        if (!hasPossessive && !nextIsCap && !coordNextIsCap && !matchesHeadSubject) continue;
      }
      extractCoherenceStems(clean).forEach(s => midSentenceConfirmedStems.add(s));
      addEntity(clean, false);
    }
  }

  // 3. Headline capitalized tokens & acronyms: when prose bodyText is available, confirm Title-Case headline words
  // against midSentenceConfirmedStems (or acronyms/possessive landmarks) so Title-Case verbs/adjectives never masquerade as proper nouns!
  const hasRichProse = String(bodyText || '').trim().length >= 25;
  const headWords = String(headline || '').trim().split(/\s+/);
  for (const rawW of headWords) {
    const hasPossessive = /'s$/i.test(rawW);
    const clean = rawW.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/'s$/i, '');
    const isAcronymOrNumTeam = /^(?:[A-Z]{2,5}|\d+ers)$/.test(clean);
    if ((clean.length >= 3 && /^[A-Z]/.test(clean)) || isAcronymOrNumTeam) {
      const wStems = extractCoherenceStems(clean).filter(s => !COMMON_HEADLINE_NON_ENTITY_STEMS.has(s) && !/^\d+$/.test(s));
      if (wStems.length === 0) continue;
      if (!hasRichProse || isAcronymOrNumTeam || hasPossessive || wStems.some(s => midSentenceConfirmedStems.has(s))) {
        addEntity(clean, true);
      }
    }
  }

  return { properStems, headProperStems, properDisplay, headProperDisplay };
}

function formatShortUtcDate(msOrIso) {
  const t = typeof msOrIso === 'number' ? msOrIso : Date.parse(String(msOrIso || ''));
  if (isNaN(t) || t <= 0) return '';
  const d = new Date(t);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:${mm}Z`;
}

// Extract structured Event Fact Attributes (Timing Window, Sovereign/Pinpoint Geography, Proper-Noun Subjects, Weather Designators)
function extractEventFactAttributes(itemOrCluster) {
  if (!itemOrCluster) return { timeTag: '', locTag: '', countries: new Set(), properStems: new Set(), headProperStems: new Set(), weatherDesignators: new Set(), minMs: 0, maxMs: 0 };
  const isCluster = Array.isArray(itemOrCluster.coverage) || Boolean(itemOrCluster.story);
  const headline = isCluster ? (itemOrCluster.story || '') : (itemOrCluster.title || '');
  const cov = isCluster ? (itemOrCluster.coverage || []) : [];
  const bodyText = isCluster
    ? `${itemOrCluster.summary || ''} ${cov.slice(0, 5).map(a => `${a.title || ''}. ${a.description || ''}`).join(' ')}`
    : (itemOrCluster.description || '');
  const fullText = `${headline} ${bodyText}`;

  const times = [];
  if (isCluster) {
    if (itemOrCluster.firstSeenAt) {
      const t0 = Date.parse(itemOrCluster.firstSeenAt);
      if (!isNaN(t0) && t0 > 0) times.push(t0);
    }
    if (itemOrCluster.evolutionHistory?.[0]?.timestamp) {
      const th0 = Date.parse(itemOrCluster.evolutionHistory[0].timestamp);
      if (!isNaN(th0) && th0 > 0) times.push(th0);
    }
    for (const a of cov) {
      const ta = Date.parse(a?.pubDate || '');
      if (!isNaN(ta) && ta > 0) times.push(ta);
    }
  } else {
    const ta = itemOrCluster.pubMs || Date.parse(itemOrCluster.pubDate || '');
    if (!isNaN(ta) && ta > 0) times.push(ta);
  }
  const minMs = times.length > 0 ? Math.min(...times) : 0;
  const maxMs = times.length > 0 ? Math.max(...times) : 0;
  const timeTag = isCluster
    ? (minMs > 0 ? `${formatShortUtcDate(minMs)} -> ${formatShortUtcDate(maxMs)}` : '')
    : (maxMs > 0 ? formatShortUtcDate(maxMs) : '');

  const countries = detectSovereignCountries(fullText);
  const pl = itemOrCluster.primaryLocation;
  if (pl?.countryIso) {
    const isoMap = { gb: 'uk', us: 'us', ca: 'canada', au: 'australia', nz: 'new_zealand', fr: 'france', de: 'germany', it: 'italy', es: 'spain', jp: 'japan', cn: 'china', tw: 'taiwan', in: 'india', pk: 'pakistan', br: 'brazil', ru: 'russia', ua: 'ukraine', il: 'israel', ps: 'palestine', ir: 'iran', iq: 'iraq', sy: 'syria', lb: 'lebanon', ye: 'yemen', sa: 'saudi', ae: 'uae', tr: 'turkey', eg: 'egypt', nl: 'netherlands', be: 'belgium', ch: 'switzerland', at: 'austria', pl: 'poland', gr: 'greece', se: 'sweden', no: 'norway', dk: 'denmark', fi: 'finland', pt: 'portugal', lt: 'lithuania', lv: 'latvia', ee: 'estonia', bg: 'bulgaria', ro: 'romania', ie: 'ireland', za: 'south_africa', ng: 'nigeria', ke: 'kenya', sd: 'sudan', ne: 'niger', ly: 'libya', tn: 'tunisia', mx: 'mexico', ar: 'argentina', co: 'colombia', cl: 'chile', ve: 'venezuela' };
    const mapped = isoMap[String(pl.countryIso).toLowerCase()];
    if (mapped) countries.add(mapped);
  }
  const locParts = [];
  if (pl?.name) locParts.push(`${pl.name}${pl.region ? `, ${pl.region}` : ''}${pl.countryIso ? ` (${pl.countryIso})` : ''}`);
  if (countries.size > 0) locParts.push(`countries=${Array.from(countries).slice(0, 4).join(',')}`);
  const locTag = locParts.join(' | ');

  const { properStems, headProperStems, properDisplay, headProperDisplay } = extractProperSubjectEntities(headline, bodyText);
  const weatherDesignators = extractNamedWeatherDesignators(fullText);

  return {
    timeTag,
    locTag,
    countries,
    headCountries: detectSovereignCountries(headline),
    properStems,
    headProperStems,
    properDisplay: headProperDisplay.length > 0 ? headProperDisplay : properDisplay.slice(0, 6),
    weatherDesignators,
    minMs,
    maxMs
  };
}

function hasDisjointSovereignCountryConflict(textA, textB, headA = '', headB = '', stemDfMap = null, maxDf = 8) {
  const weatherA = extractNamedWeatherDesignators(`${headA || ''} ${textA || ''}`);
  const weatherB = extractNamedWeatherDesignators(`${headB || ''} ${textB || ''}`);
  if (weatherA.size > 0 && weatherB.size > 0 && ![...weatherA].some(w => weatherB.has(w))) {
    return true;
  }
  const headCountriesA = detectSovereignCountries(headA || textA);
  const allCountriesA = detectSovereignCountries(textA);
  const allCountriesB = detectSovereignCountries(textB);
  // If one side names specific storm designators (e.g. UK Storm Austen/Boelo) and the other is in a disjoint sovereign country (e.g. Australia or Canada) with 0 shared designators
  if ((weatherA.size > 0 || weatherB.size > 0) && allCountriesA.size > 0 && allCountriesB.size > 0 && ![...allCountriesA].some(c => allCountriesB.has(c))) {
    return true;
  }
  if (headCountriesA.size === 0 && allCountriesA.size === 0) return false;
  if (allCountriesB.size === 0) return false;
  if ([...allCountriesA].some(c => allCountriesB.has(c))) return false;
  if ([...headCountriesA].some(c => allCountriesB.has(c))) return false;
  // Two events in disjoint sovereign countries can only be the same event if they share at least 1 specific Proper-Noun Subject stem
  // (common nouns like "storm", "weather", "flight", "drone", "hostage", "prison", "defeat", "league" never bridge disjoint countries!)
  const { properStems: propA } = extractProperSubjectEntities(headA || '', textA || '');
  const { properStems: propB } = extractProperSubjectEntities(headB || '', textB || '');
  const isRareProperStem = (s) => !COMMON_HEADLINE_NON_ENTITY_STEMS.has(s) && (!stemDfMap || (stemDfMap.get(s) || 0) <= maxDf);
  const sharedRareProper = [...propA].filter(s => propB.has(s) && isRareProperStem(s));
  return sharedRareProper.length === 0;
}

// Episodic Milestone vs. New Campaign/Theatre Phase Gate:
// Prevents an older episodic cluster (e.g., Oct 19 "Lula and Bolsonaro Spar in Debate" or Oct 20 "Lula Fast-Tracks Welfare Payments")
// from swallowing general Election-Day voting articles ("Polls open in Brazil presidential runoff", "Brazil Holds High-Stakes Presidential Runoff Election")
// that only share the broad campaign actors/country/runoff backdrop and zero episode-specific predicate stems.
const CAMPAIGN_OR_THEATRE_FRAME_STEMS = new Set(extractCoherenceStems(
  'brazil brazilian brasilia lula silva bolsonaro jair runoff election elections presidential president ' +
  'vote votes voter voters voting poll polls polling station stations ballot ballots cast casting open opens ' +
  'hold holds holding tight high stakes race head campaign candidate candidates result results ' +
  'trump biden harris america american united states washington midterm midterms senate congress ' +
  'israel israeli netanyahu gaza palestine palestinian ukraine ukrainian zelensky russia russian putin ' +
  'france french macron paris britain british london starmer burnham china chinese beijing'
));

function getEpisodeSpecificHeadlineStems(storyText, extraActorStems = null) {
  const stems = extractCoherenceStems(storyText || '');
  return new Set(
    stems.filter(s =>
      !CAMPAIGN_OR_THEATRE_FRAME_STEMS.has(s) &&
      (!extraActorStems || !extraActorStems.has(s)) &&
      !/^(hold|held|high|stak|tight|open|cast|lead|head|face|amid|after|ahead|befor|first|final|new|major)$/.test(s)
    )
  );
}

function hasEpisodicPhaseMismatch(anchorStory, anchorFirstSeenMs, candidateText, newestCandidateMs = 0) {
  const episodeStems = getEpisodeSpecificHeadlineStems(anchorStory);
  if (episodeStems.size === 0) return false;
  const candStems = new Set(extractCoherenceStems(candidateText || ''));
  const sharedEpisode = [...episodeStems].filter(s => candStems.has(s));
  if (sharedEpisode.length > 0) return false;
  // Candidate text shares 0 episode-specific headline stems with the anchor!
  // Check if the candidate text is purely matching on campaign/election/theatre frame stems or is separated by >24h from the episode origin:
  const ageGapHours = (anchorFirstSeenMs > 0 && newestCandidateMs > anchorFirstSeenMs)
    ? (newestCandidateMs - anchorFirstSeenMs) / 3600000
    : 0;
  const candHasCampaignVotingFrame = /\b(polls?\s+open|cast\s+(?:their\s+)?ballots?|voting\s+(?:begins|underway|procedures|stations)|holds?\s+(?:high-stakes\s+)?(?:presidential\s+)?runoff|head\s+to\s+the\s+polls|tight\s+(?:presidential\s+)?runoff)\b/i.test(candidateText || '');
  if (ageGapHours >= 24 || candHasCampaignVotingFrame) {
    return true;
  }
  return false;
}

// Parallel-Event / Disjoint Proper-Subject Conflict Gate for 0-URL Cluster Merges:
// Blocks merging two clusters that have disjoint Proper-Noun Subjects in their headlines (e.g. "Aston Villa + Manchester City" vs "Tottenham + Chelsea",
// "Eagle's Nest" vs "Leipzig Airport", "Global Stocks" vs "OpenAI", "Knicks" vs "LeBron James + 76ers", "Storm Austen" vs "Storm Josephine")
// when they share 0 URLs and neither cluster's articles cross-reference the other cluster's proper-noun subjects.
function hasDisjointProperSubjectMergeConflict(clA, clB, stemDfMap = null, maxDf = 8) {
  if (!clA || !clB) return false;
  const textA = `${clA.story || ''} ${clA.summary || ''} ${(clA.coverage || []).slice(0, 5).map(a => a.title || '').join(' ')}`;
  const textB = `${clB.story || ''} ${clB.summary || ''} ${(clB.coverage || []).slice(0, 5).map(a => a.title || '').join(' ')}`;
  if (
    hasDisjointSovereignCountryConflict(textA, textB, clA.story || '', clB.story || '', stemDfMap, maxDf) ||
    hasDisjointSovereignCountryConflict(textB, textA, clB.story || '', clA.story || '', stemDfMap, maxDf)
  ) {
    return true;
  }
  const distKm = haversineKm(clA.primaryLocation, clB.primaryLocation);
  const factsA = extractEventFactAttributes(clA);
  const factsB = extractEventFactAttributes(clB);
  const sharedHeadProper = [...factsA.headProperStems].filter(s => factsB.headProperStems.has(s));
  const sharedAllProper = [...factsA.properStems].filter(s => factsB.properStems.has(s));

  // If primaryLocation coordinates are > 1,500 km apart and they share 0 headline proper-noun subjects, block merge
  if (distKm !== null && distKm > 1500 && sharedHeadProper.length === 0 && sharedAllProper.length === 0) {
    return true;
  }

  // If both clusters have specific Proper-Noun Subject stems (headline proper subjects when present, falling back to prose proper subjects)
  // and they are completely disjoint, check if their coverage articles genuinely cross-reference each other:
  const subjA = factsA.headProperStems.size > 0 ? factsA.headProperStems : factsA.properStems;
  const subjB = factsB.headProperStems.size > 0 ? factsB.headProperStems : factsB.properStems;
  const sharedSubj = [...subjA].filter(s => subjB.has(s));
  if (subjA.size >= 1 && subjB.size >= 1 && sharedSubj.length === 0) {
    const covStemsA = new Set(extractCoherenceStems(`${clA.story || ''} ${clA.summary || ''} ${(clA.coverage || []).map(a => `${a.title || ''} ${a.description || ''}`).join(' ')}`));
    const covStemsB = new Set(extractCoherenceStems(`${clB.story || ''} ${clB.summary || ''} ${(clB.coverage || []).map(a => `${a.title || ''} ${a.description || ''}`).join(' ')}`));
    const aMentionsB = [...subjB].some(s => covStemsA.has(s));
    const bMentionsA = [...subjA].some(s => covStemsB.has(s));
    if (!aMentionsB || !bMentionsA) {
      return true;
    }
  }

  // Also check episodic phase mismatch between the two clusters (e.g. Oct 19 Debate or Oct 20 Welfare vs Oct 25 Election-Day Voting)
  if (
    hasEpisodicPhaseMismatch(clA.story || '', factsA.minMs, `${clB.story || ''} ${clB.summary || ''}`, factsB.maxMs) ||
    hasEpisodicPhaseMismatch(clB.story || '', factsB.minMs, `${clA.story || ''} ${clA.summary || ''}`, factsA.maxMs)
  ) {
    return true;
  }

  // Headline Phenomenon-Anchor Merge Gate:
  // Blocks 0-URL merges between two stories in the same country or involving the same national leader (e.g. "Indonesian Wildfire Haze Disrupts Flights" +
  // "Indonesia Trims Pipeline Gas Exports to Singapore", or "Trump Envoy Calls Putin a Humanitarian" + "Tanker Carrying Russian Diesel En Route to US",
  // or "Macron Slams Foreign Leaders Over Riot Comments" + "Macron Secures Gulf Diesel Supply Commitments") when their non-geographic, non-leader
  // headline phenomenon stems have 0 overlap in the headlines AND at least one cluster's headline phenomenon is completely absent from the other's summary.
  const NON_PHENOMENON_HEADLINE_FRAME_STEMS = new Set([
    ...CAMPAIGN_OR_THEATRE_FRAME_STEMS,
    ...extractCoherenceStems(
      'indonesia indonesian jakarta sulawesi sumatra malaysia malaysian singapore singaporean southeast asia asian ' +
      'prabowo subianto macron emmanuel france french paris gulf australia australian western mp lawmaker senator ' +
      'russia russian moscow putin vladimir trump donald us america american washington uk britain british london ' +
      'israel israeli netanyahu gaza palestine palestinian ukraine ukrainian zelensky kyiv iran iranian tehran ' +
      'china chinese beijing xi india indian modi japan japanese tokyo canada canadian mexico mexican ' +
      'germany german berlin italy italian rome spain spanish madrid brazil brazilian lula bolsonaro ' +
      'president prime minister leader leaders official officials government administration authority authorities ' +
      'report reports announce announces order orders say says call calls warn warns urge urges slam slams ' +
      'secure secures face faces hold holds amid after over under ahead first new major high'
    )
  ]);
  const getHeadlinePhenomenonStems = (storyText) => new Set(
    extractCoherenceStems(storyText || '').filter(s => !NON_PHENOMENON_HEADLINE_FRAME_STEMS.has(s) && !/^\d+$/.test(s))
  );
  const phenomA = getHeadlinePhenomenonStems(clA.story || '');
  const phenomB = getHeadlinePhenomenonStems(clB.story || '');
  if (phenomA.size >= 2 && phenomB.size >= 2) {
    const sharedPhenomHead = [...phenomA].filter(s => phenomB.has(s));
    if (sharedPhenomHead.length === 0) {
      const proseStemsA = new Set(extractCoherenceStems(`${clA.story || ''} ${clA.summary || ''}`));
      const proseStemsB = new Set(extractCoherenceStems(`${clB.story || ''} ${clB.summary || ''}`));
      const aInB = [...phenomA].filter(s => proseStemsB.has(s)).length;
      const bInA = [...phenomB].filter(s => proseStemsA.has(s)).length;
      if (aInB === 0 || bInA === 0) {
        return true;
      }
    }
  }

  return false;
}

// Cross-Outlet Story Clustering (Smart Candidate Pool + 14-Day Dormant Cluster Wake-Up + Peer-to-Peer Coherence Guard)
async function clusterCrossOutletStories(finalSources, apiKey, previousClusters = []) {
  if (!apiKey) return previousClusters;

  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

  // Merge active 7-day clusters with dormant historical clusters (up to 14 days old) from clusters-archive.json
  // so stories that went dormant for 3-14 days can wake back up and reconnect when a follow-up breaks!
  const allKnownPrevClusters = [];
  const seenPrevSlugs = new Set();
  const registerPrevCluster = (cl) => {
    if (!cl || !Array.isArray(cl.coverage) || cl.coverage.length < 2) return;
    const slug = cl.id || String(cl.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug || seenPrevSlugs.has(slug)) return;
    seenPrevSlugs.add(slug);
    allKnownPrevClusters.push(cl);
  };
  if (Array.isArray(previousClusters)) previousClusters.forEach(registerPrevCluster);
  try {
    const archivePath = path.join(PUBLIC_DATA_DIR, 'clusters-archive.json');
    if (fs.existsSync(archivePath)) {
      const archData = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
      if (Array.isArray(archData?.clusters)) archData.clusters.forEach(registerPrevCluster);
    }
  } catch (e) {
    // Non-blocking archive read
  }

  const alreadyClusteredUrls = new Set();
  const alreadyClusteredTitles = new Set();
  const activeClusterAnchors = [];
  const stemDocFreq = new Map();

  for (const cl of allKnownPrevClusters) {
    const cov = cl.coverage || [];
    const outletPubMs = new Map();
    for (const c of cov) {
      if (c.link) alreadyClusteredUrls.add(canonicalUrl(c.link));
      if (c.title) alreadyClusteredTitles.add(cleanHeadlineTitle(c.title));
      if (c.sourceId) outletPubMs.set(c.sourceId, new Date(c.pubDate).getTime() || 0);
    }
    if (Array.isArray(cl.seenArticleKeys)) {
      cl.seenArticleKeys.forEach(k => {
        alreadyClusteredUrls.add(k);
        alreadyClusteredTitles.add(k);
      });
    }
    const newestMs = Math.max(...cov.map(c => new Date(c.pubDate).getTime() || 0), 0);
    if (newestMs >= fourteenDaysAgo && cov.length >= 2) {
      const storyStemSet = new Set(extractCoherenceStems(cl.story || ''));
      const alignedCov = [...cov].sort((a, b) => {
        const aHits = extractCoherenceStems(a.title || '').filter(s => storyStemSet.has(s)).length;
        const bHits = extractCoherenceStems(b.title || '').filter(s => storyStemSet.has(s)).length;
        if (bHits !== aHits) return bHits - aHits;
        return (new Date(b.pubDate).getTime() || 0) - (new Date(a.pubDate).getTime() || 0);
      });
      const lead = alignedCov[0] || cov[0];
      const titleStems = new Set(extractCoherenceStems(`${cl.story || ''} ${lead.title || ''} ${alignedCov.slice(0, 3).map(c => c.title || '').join(' ')}`));
      const allStems = new Set(extractCoherenceStems(`${cl.story || ''} ${cl.summary || ''} ${alignedCov.slice(0, 4).map(c => c.title || '').join(' ')}`));
      for (const s of allStems) stemDocFreq.set(s, (stemDocFreq.get(s) || 0) + 1);
      activeClusterAnchors.push({
        isClusterAnchor: true,
        anchorCluster: cl,
        outletPubMs,
        sourceId: lead.sourceId,
        sourceName: lead.sourceName || lead.sourceId,
        anchorStory: cl.story,
        title: lead.title,
        description: `[Cluster: ${cl.story}] ${(cl.summary || '').slice(0, 115)}`,
        sentiment: typeof lead.sentiment === 'number' ? lead.sentiment : 0,
        link: lead.link || '',
        pubDate: lead.pubDate || '',
        titleStems,
        allStems
      });
    }
  }

  // Scan up to 85 articles deep per outlet across the last 48h (so high-volume wire feeds never drop stories at #26-#85)
  const rawUnclustered = [];
  Object.entries(finalSources).forEach(([sourceId, src]) => {
    const articles = src.articles || [];
    let scannedForSource = 0;
    for (let i = 0; i < articles.length; i++) {
      const art = articles[i];
      if (!art || !art.title || art.title.trim().length <= 10) continue;
      if (/\b(promo code|sportsbook|fanatics|betr|underdog|draftkings|fanduel)\b/i.test(art.title)) continue;
      const t = art.pubDate ? new Date(art.pubDate).getTime() : NaN;
      if (isNaN(t) || t < fortyEightHoursAgo) continue;
      scannedForSource++;
      if (scannedForSource > 85) continue;

      const cu = art.link ? canonicalUrl(art.link) : '';
      const ct = cleanHeadlineTitle(art.title);
      if ((cu && alreadyClusteredUrls.has(cu)) || (ct && alreadyClusteredTitles.has(ct))) continue;

      const titleStems = new Set(extractCoherenceStems(art.title));
      const allStems = new Set(extractCoherenceStems(`${art.title} ${(art.description || '').slice(0, 240)}`));

      // Skip secondary/older dispatches from an outlet that already has a representative article in a matching cluster
      const alreadyCoveredBySameOutlet = activeClusterAnchors.some(anc => {
        if (!anc.outletPubMs.has(sourceId)) return false;
        const shT = [...titleStems].filter(s => anc.titleStems.has(s));
        const shA = [...allStems].filter(s => anc.allStems.has(s));
        if (shT.length >= 2 || (shT.length >= 1 && shA.length >= 3)) {
          const existingMs = anc.outletPubMs.get(sourceId) || 0;
          if (t <= existingMs + 2 * 3600 * 1000) return true;
        }
        return false;
      });
      if (alreadyCoveredBySameOutlet) continue;

      for (const s of allStems) stemDocFreq.set(s, (stemDocFreq.get(s) || 0) + 1);
      const score = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0);
      rawUnclustered.push({
        isClusterAnchor: false,
        sourceId,
        sourceName: src.name,
        rankInOutlet: scannedForSource,
        pubMs: t,
        title: art.title.trim(),
        description: (art.description || '').slice(0, 240).trim(),
        sentiment: score,
        link: art.link || '',
        pubDate: art.pubDate || '',
        titleStems,
        allStems
      });
    }
  });

  // Select existing/dormant cluster anchors + unclustered articles with specific cross-outlet stem overlap
  // Scale stem document-frequency caps proportionally to the 48h corpus size so high-coverage active stories
  // (e.g. df 25–110 across ~3,400 docs) are never blinded as they grow popular, while excluding generic role/template stems.
  const totalCorpusDocs = Math.max(100, activeClusterAnchors.length + rawUnclustered.length);
  const maxTitleStemDf = Math.max(24, Math.min(115, Math.round(totalCorpusDocs * 0.032)));
  const maxAllStemDf = Math.max(30, Math.min(135, Math.round(totalCorpusDocs * 0.038)));
  const maxRareTitleStemDf = Math.max(10, Math.min(35, Math.round(totalCorpusDocs * 0.01)));
  const GENERIC_CANDIDATE_STEMS = new Set([
    'record', 'fatal', 'kill', 'dead', 'death', 'milit', 'army', 'servic', 'draft', 'train', 'charg', 'releas',
    'crash', 'fire', 'attack', 'protes', 'court', 'suprem', 'appeal', 'judg', 'justic', 'senten', 'offend',
    'prison', 'family', 'polic', 'arrest', 'strik', 'launch', 'approv', 'reject', 'elect', 'voter', 'campai',
    'midter', 'senat', 'congre', 'parlia', 'govern', 'offici', 'minist', 'presid', 'invest', 'probe', 'threat',
    'crisis', 'emerg', 'warn', 'disrup', 'cancel', 'delay', 'announ', 'reveal', 'confirm', 'report', 'discov',
    'found', 'scient', 'astron', 'study', 'united', 'state', 'americ', 'administr', 'white', 'house', 'feder',
    'nation', 'global', 'world', 'donald', 'trump', 'biden', 'europe', 'middl', 'east', 'foreig', 'defens',
    'first', 'after', 'amid', 'cancer', 'vaccin', 'patien', 'treat', 'diseas', 'medic', 'health', 'hospit',
    'doctor', 'clinic', 'trial', 'resear', 'breakt', 'stock', 'share', 'market', 'budget', 'fiscal', 'treasu',
    'econom', 'financ', 'compan', 'corpor', 'indust', 'techno', 'tunisi', 'tunis', 'brazil', 'ecuado', 'albani',
    'indone', 'malays', 'israel', 'palest', 'iran', 'saudi', 'yemen', 'syria', 'lebanon', 'egypt', 'turk',
    'ukrain', 'russia', 'china', 'chines', 'taiwan', 'japan', 'kore', 'india', 'pakist', 'austral', 'canad',
    'mexic', 'britain', 'france', 'german', 'ital', 'spain', 'poland'
  ]);

  const matchedAnchorIndices = new Set();
  const matchedUnclusteredIndices = new Set();

  for (let i = 0; i < rawUnclustered.length; i++) {
    const a = rawUnclustered[i];
    for (let cIdx = 0; cIdx < activeClusterAnchors.length; cIdx++) {
      const anc = activeClusterAnchors[cIdx];
      if (anc.outletPubMs.has(a.sourceId) && a.pubMs <= (anc.outletPubMs.get(a.sourceId) || 0) + 2 * 3600 * 1000) continue;
      const ancFirstMs = anc.anchorCluster?.firstSeenAt ? Date.parse(anc.anchorCluster.firstSeenAt) : 0;
      if (hasEpisodicPhaseMismatch(anc.anchorStory || '', ancFirstMs, `${a.title || ''} ${a.description || ''}`, a.pubMs)) continue;
      if (hasDisjointSovereignCountryConflict(
        `${anc.anchorStory || ''} ${anc.description || ''}`,
        `${a.title || ''} ${a.description || ''}`,
        anc.anchorStory || '',
        a.title || '',
        stemDocFreq,
        maxRareTitleStemDf
      )) continue;
      const shT = [...a.titleStems].filter(s => anc.titleStems.has(s) && (stemDocFreq.get(s) || 0) <= maxTitleStemDf);
      const shA = [...a.allStems].filter(s => anc.allStems.has(s) && (stemDocFreq.get(s) || 0) <= maxAllStemDf);
      const hasSpecificAnchorStem = shT.some(s => !GENERIC_CANDIDATE_STEMS.has(s)) || shA.filter(s => !GENERIC_CANDIDATE_STEMS.has(s)).length >= 2;
      if (hasSpecificAnchorStem && (shT.length >= 2 || (shT.length >= 1 && shA.length >= 3))) {
        matchedUnclusteredIndices.add(i);
        matchedAnchorIndices.add(cIdx);
      }
    }
    for (let j = i + 1; j < rawUnclustered.length; j++) {
      const b = rawUnclustered[j];
      if (a.sourceId === b.sourceId) continue;
      const shT = [...a.titleStems].filter(s => b.titleStems.has(s) && (stemDocFreq.get(s) || 0) <= maxTitleStemDf);
      const shA = [...a.allStems].filter(s => b.allStems.has(s) && (stemDocFreq.get(s) || 0) <= maxAllStemDf);
      const hasSpecificPeerStem = shT.some(s => !GENERIC_CANDIDATE_STEMS.has(s)) || shA.filter(s => !GENERIC_CANDIDATE_STEMS.has(s)).length >= 2;
      if (hasSpecificPeerStem && (shT.length >= 2 || (shT.length >= 1 && shA.length >= 3))) {
        matchedUnclusteredIndices.add(i);
        matchedUnclusteredIndices.add(j);
      }
    }
    // Also include top-10 very recent (<=24h) unclustered dispatches per outlet if they share >=2 stems with any peer
    if (a.rankInOutlet <= 10 && a.pubMs >= twentyFourHoursAgo && !matchedUnclusteredIndices.has(i)) {
      const hasAnyPeerPair = rawUnclustered.some((b, j) => {
        if (i === j || a.sourceId === b.sourceId) return false;
        let sh = 0;
        for (const s of a.allStems) if (b.allStems.has(s) && (stemDocFreq.get(s) || 0) <= maxAllStemDf) sh++;
        return sh >= 2;
      });
      if (hasAnyPeerPair) matchedUnclusteredIndices.add(i);
    }
  }

  // Sort matched unclustered dispatches newest-first so freshly corroborated 2-outlet leads across any region
  // (APAC, LATAM, MEA, EU, NA) sit at the top of the prompt and cluster immediately instead of waiting behind older 48h items
  const sortedMatchedUnclustered = [...matchedUnclusteredIndices]
    .map(idx => rawUnclustered[idx])
    .sort((a, b) => (b.pubMs || 0) - (a.pubMs || 0));

  const candidates = [
    ...[...matchedAnchorIndices].map(idx => activeClusterAnchors[idx]),
    ...sortedMatchedUnclustered
  ];

  console.log(`[Clusters] Smart candidate pool built: ${matchedAnchorIndices.size} active/dormant cluster anchors + ${matchedUnclusteredIndices.size} unclustered dispatches (${candidates.length} total items from ${rawUnclustered.length} unclustered 48h articles).`);

  if (candidates.length < 4) return previousClusters;

  // Pass headline + brief lead snippet + extracted Event Fact Attributes (timing, geography, proper-noun subjects)
  const promptLines = candidates.map((c, idx) => {
    if (c.isClusterAnchor) {
      const f = extractEventFactAttributes(c.anchorCluster || c);
      const metaParts = [
        f.timeTag ? `time: ${f.timeTag}` : '',
        f.locTag ? `geo: ${f.locTag}` : '',
        f.properDisplay.length ? `subjects: ${f.properDisplay.slice(0, 5).join(', ')}` : ''
      ].filter(Boolean).join(' | ');
      return `[${idx}] EXISTING_CLUSTER(${c.sourceId})${metaParts ? ` [${metaParts}]` : ''}: ${c.anchorStory} — ${c.title} (${c.description})`;
    }
    const f = extractEventFactAttributes(c);
    const metaParts = [
      f.timeTag ? `pub: ${f.timeTag}` : '',
      f.countries.size ? `geo: ${Array.from(f.countries).slice(0, 3).join(',')}` : '',
      f.properDisplay.length ? `subjects: ${f.properDisplay.slice(0, 4).join(', ')}` : ''
    ].filter(Boolean).join(' | ');
    const snippet = c.description ? ` — ${c.description}` : '';
    return `[${idx}] ${c.sourceId}${metaParts ? ` [${metaParts}]` : ''}: ${c.title}${snippet}`;
  }).join('\n');

  const prompt = `You are a senior news editor analyzing recent dispatches across global newsrooms.
Identify distinct real-world events, developments, or discoveries that are covered by 2 or more DIFFERENT news outlets (or where 1 or more new outlet dispatches match an EXISTING_CLUSTER).

Rules:
- Group dispatches strictly by the exact same underlying real-world event, specific incident, single court ruling, single economic data release, game result, or discovery.
- FACT-ATTRIBUTE GROUNDING (TIME, GEOGRAPHY, NAMED SUBJECTS & EPISODE PHASE): Each item includes extracted factual metadata ([pub/time | geo | subjects]). Treat these facts as hard constraints:
  • NEVER group parallel weather systems, storms, sports games, aviation incidents, crimes, or market stories occurring in different countries/continents or involving different named subjects (e.g. NEVER combine UK "Storm Austen/Boelo" with Australian storms or Canadian "Subtropical Storm Josephine"; NEVER combine two different Premier League or NBA matches).
  • NEVER attach general Election-Day voting dispatches ("polls open", "voters cast ballots", "tight runoff") to an older campaign-episode cluster from days earlier (such as a prior TV debate "Lula and Bolsonaro Spar in Debate" or a policy announcement "Lula Fast-Tracks Welfare Payments") — form or match the dedicated Election-Day voting cluster instead.
- NEVER group articles by a broad theme, commodity, industry, or beat (for example, NEVER create thematic buckets like "Climate Change Assessments", "Global Gold Mining", "Midterm Campaign Trails", "Healthcare Costs", or "AI Industry Trends"). If two articles are feature stories or reports about different places/companies on a similar theme, DO NOT group them.
- Match dispatches by their primary headline subject; use the short description snippet only to disambiguate who or where an oblique headline refers to, never to match multi-story digest roundups ("...and more top headlines") or sportsbook promo codes.
- Scan the entire list across all regions (NA, LATAM, UK, EU, APAC, MEA) thoroughly and output all genuine event clusters (whether 35 or 95 clusters), including regional stories covered by 2+ outlets and new outlets matching an EXISTING_CLUSTER.
- If an EXISTING_CLUSTER item is matched by 1 or more new outlet dispatches on that exact same specific event, include the EXISTING_CLUSTER index AND the new outlet index(es) together in "ids", and keep the EXISTING_CLUSTER's concise neutral title unless a major phase shift occurred.
- If a single outlet published multiple updates on the exact same event, include ONLY the single most comprehensive/definitive headline ID for that outlet in "ids" (maximum 1 ID per outlet per cluster).
- Provide a concise neutral story title (3-6 words, e.g. "Brazil Amazon Deforestation Hits Record Low", "Ancient Shipwreck Found Off Turkey", "Oregon Elementary School Shooting").
- SPECIFIC LOCATION/ACTOR IN HEADLINE: Always name the specific city, country, or actor shared by the articles in "story" (e.g. "Milan Riots Prompt Italian Troop Deployment", NEVER a vague continental umbrella like "European Protests Over Living Costs" when the articles are in Milan/Italy, and NEVER bleed facts from another country's cluster into "summary").
- Provide a concise, detail-packed 1-2 sentence editorial summary (~35-55 words) weaving the event's core arc with the concrete specifics from the dispatches (exact named institutions/agencies/companies, people/roles/ages, specific venues/streets/cities, concrete figures/tallies, and causal mechanisms). NEVER include meta-coverage filler ("Outlets highlight...", "Reports examine...", "Media coverage focuses on...").
- TEMPORAL & ROLE HYGIENE (NEVER INJECT PRE-CUTOFF TITLES): Only attribute an active political, corporate, or institutional office/title to a person if that exact current title is explicitly stated in the dispatches below. Because offices, prime ministers, mayors, and ministers change over time, NEVER supply a person's former or pre-training-cutoff role from internal memory when the dispatches omit a title or use a newer title.
- Return ONLY a JSON array. If no shared stories exist, return [].

Dispatches:
${promptLines}

Return JSON array in format:
[
  {
    "story": "Topic Title",
    "summary": "1-2 sentence detail-packed summary with exact named actors, institutions, venues, figures, and mechanisms (no meta-coverage filler).",
    "primaryLocation": { "name": "Specific Venue/City, City/Region", "region": "State/Province, Country", "countryIso": "2-letter lowercase ISO code (e.g. 'us', 'gb', 'fr', 'ua', 'cn')", "lat": 51.5074, "lon": -0.1278, "zoom": 10 },
    "ids": [0, 4, 12]
  }
]`;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let clusters = null;
  const activeTiers = getOrderedKeyTiers(apiKey);
  for (const modelName of modelsToTry) {
    if (clusters) break;
    for (const keyObj of activeTiers) {
      if (clusters) break;
      const genAI = new GoogleGenerativeAI(keyObj.key);
      const maxAttempts = 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.1, maxOutputTokens: 65536, responseMimeType: 'application/json' }
          });
          const generatePromise = model.generateContent(prompt);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Clustering call timed out after 150s')), 150000)
          );
          const resp = await Promise.race([generatePromise, timeoutPromise]);
          let text = resp.response.text().trim();
          if (text.startsWith('```json')) text = text.substring(7);
          else if (text.startsWith('```')) text = text.substring(3);
          if (text.endsWith('```')) text = text.substring(0, text.length - 3);
          const parsed = JSON.parse(tryRepairJsonArray(text.trim()));
          if (Array.isArray(parsed) && parsed.length > 0) {
            clusters = parsed;
            console.log(`[Clusters] Generated ${parsed.length} clusters using ${modelName} [${keyObj.tier} key].`);
            break;
          }
        } catch (err) {
          const msg = String(err.message || err);
          const isQuotaOrRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit');
          console.warn(`[Sync] Clustering attempt ${attempt}/${maxAttempts} with ${modelName} [${keyObj.tier} key] failed: ${msg}`);
          if (keyObj.tier === 'FREE' && isQuotaOrRateLimit && activeTiers.length > 1) {
            freeKeyExhaustedThisRun = true;
            console.log('[Clusters] Free tier key reached rate/quota limit — switching to PAID fallback key...');
            break;
          }
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 5000));
          }
        }
      }
    }
  }

  if (Array.isArray(clusters)) {
    const formattedClusters = [];
    const coveredUrls = new Set();
    const coveredTitles = new Set();
    const matchedPrevIds = new Set();

    clusters.forEach(cl => {
      if (!cl.ids || cl.ids.length < 2) return;
      const rawCandidates = cl.ids.map(id => candidates[id]).filter(Boolean);
      if (rawCandidates.length < 2) return;

      // Strict Anchor + Peer-to-Peer Coherence Guard (prevents LLM digit slips, spliced ID arrays & thematic buckets):
      // 1. Every candidate must share at least 1 stem with the cluster's own story+summary anchor (so a spliced 4-article sub-group
      //    like Flydubai can never sit inside an Ebola cluster just because the 4 Flydubai articles agree with each other).
      // 2. Every candidate must ALSO share stems with at least one PEER item from a DIFFERENT outlet in the cluster.
      const BROAD_THEATRE_ACTOR_STEMS = new Set([
        'ukrain', 'zelens', 'russia', 'vladim', 'putin', 'donald', 'trump', 'washin', 'moscow',
        'israel', 'netany', 'tehran', 'palest', 'chines', 'china', 'beijin', 'white', 'hous', 'americ',
        'united', 'europe', 'middl', 'east', 'foreig', 'milit', 'army', 'servic', 'draft', 'defens',
        'govern', 'offici', 'west', 'bank', 'gaza', 'lebanon', 'syria', 'iran', 'saudi', 'yemen',
        'egypt', 'turk', 'tunisi', 'tunis', 'albani', 'tirana', 'brazil', 'ecuado', 'argent', 'colomb',
        'venezu', 'mexic', 'canad', 'austral', 'sydney', 'japan', 'tokyo', 'kore', 'taiwan', 'indone',
        'malays', 'india', 'pakist', 'nigeria', 'kenya', 'sudan', 'congo', 'south', 'africa',
        'london', 'britain', 'british', 'engl', 'scotla', 'irelan', 'france', 'french', 'paris',
        'german', 'berlin', 'ital', 'rome', 'milan', 'spain', 'madrid', 'poland', 'greece', 'sweden',
        'nether', 'belgi', 'switze', 'austri', 'romani', 'bulgar', 'attack', 'strike', 'polic', 'secur',
        'suprem', 'court', 'appeal', 'federa', 'judg', 'justic', 'senten', 'offend', 'prison', 'crimin',
        'family', 'ban', 'uncons', 'budget', 'fiscal', 'treasu', 'econom', 'financ', 'campai', 'midter',
        'elect', 'voter', 'senat', 'congre', 'parlia', 'minist', 'presid', 'state', 'nation', 'people',
        'citize', 'report', 'update', 'order', 'forc', 'cancer', 'vaccin', 'patien', 'treat', 'diseas',
        'medic', 'health', 'hospit', 'doctor', 'clinic', 'trial', 'resear', 'scient', 'breakt', 'stock',
        'share', 'market', 'invest', 'compan', 'corpor', 'indust', 'techno', 'artifi', 'intell',
        'infla', 'septem', 'octobe', 'novemb', 'decemb', 'januar', 'februa', 'august', 'annual',
        'quarte', 'percen', 'rate', 'intere', 'price', 'pric', 'centra', 'tighte'
      ]);
      const isSpecificCorpusStem = (s, maxDf = maxAllStemDf) => !BROAD_THEATRE_ACTOR_STEMS.has(s) && (stemDocFreq.get(s) || 0) <= maxDf;
      const directAnchorInIds = rawCandidates.find(m => m.isClusterAnchor && m.anchorCluster);
      const primaryStoryText = directAnchorInIds?.anchorCluster?.story || cl.story || '';
      const primaryHeadlineStems = extractCoherenceStems(primaryStoryText);
      const specificHeadlineStems = new Set(
        primaryHeadlineStems.filter(s => isSpecificCorpusStem(s, maxTitleStemDf))
      );
      const clusterAnchorStems = new Set(extractCoherenceStems(
        `${cl.story || ''} ${cl.summary || ''} ${directAnchorInIds?.anchorCluster?.story || ''} ${directAnchorInIds?.anchorCluster?.summary || ''}`
      ));
      const specificAnchorStems = new Set([...clusterAnchorStems].filter(s => isSpecificCorpusStem(s, maxAllStemDf)));
      const rawMatching = rawCandidates.filter((art, idx) => {
        if (/\b(promo code|sportsbook|fanatics|betr|underdog|draftkings|fanduel)\b/i.test(art.title || '')) {
          return false;
        }
        const myTitleStems = art.titleStems || new Set(extractCoherenceStems(`${art.anchorStory || ''} ${art.title || ''}`));
        const myAllStems = art.allStems || new Set(extractCoherenceStems(`${art.anchorStory || ''} ${art.title || ''} ${(art.description || '').slice(0, 125)}`));
        if (clusterAnchorStems.size > 0 && ![...myAllStems].some(s => clusterAnchorStems.has(s))) {
          console.warn(`[Clusters] Dropped zero-anchor-overlap spliced outlier from "${cl.story}": [${art.sourceId}] "${art.title}"`);
          return false;
        }
        if (!art.isClusterAnchor && specificHeadlineStems.size > 0 && specificAnchorStems.size > 0 && ![...myAllStems].some(s => specificAnchorStems.has(s))) {
          console.warn(`[Clusters] Dropped actor-only theatre drift from "${primaryStoryText}": [${art.sourceId}] "${art.title}"`);
          return false;
        }
        if (!art.isClusterAnchor && directAnchorInIds?.anchorCluster && hasEpisodicPhaseMismatch(
          directAnchorInIds.anchorCluster.story || '',
          directAnchorInIds.anchorCluster.firstSeenAt ? Date.parse(directAnchorInIds.anchorCluster.firstSeenAt) : 0,
          `${art.title || ''} ${art.description || ''}`,
          art.pubMs || (art.pubDate ? Date.parse(art.pubDate) : 0)
        )) {
          console.warn(`[Clusters] Dropped episodic phase-mismatch article from "${primaryStoryText}": [${art.sourceId}] "${art.title}"`);
          return false;
        }
        if (!art.isClusterAnchor && hasDisjointSovereignCountryConflict(
          `${primaryStoryText} ${cl.summary || ''} ${directAnchorInIds?.anchorCluster?.summary || ''}`,
          `${art.title || ''} ${art.description || ''}`,
          primaryStoryText,
          art.title || '',
          stemDocFreq,
          maxRareTitleStemDf
        )) {
          console.warn(`[Clusters] Dropped disjoint sovereign-country domestic tangent from "${primaryStoryText}": [${art.sourceId}] "${art.title}"`);
          return false;
        }
        // Single-Entity / Single-Country Tangent Gate:
        // If an unclustered article shares only 1 stem total with the cluster's story+summary anchor while the headline has >=3 stems,
        // reject it unless it also matches at least 1 other non-anchor peer in this batch on >=2 specific stems.
        if (!art.isClusterAnchor && primaryHeadlineStems.length >= 3 && clusterAnchorStems.size >= 4) {
          const anchorSharedCount = [...myAllStems].filter(s => clusterAnchorStems.has(s)).length;
          const anchorSpecSharedCount = [...myAllStems].filter(s => specificAnchorStems.has(s)).length;
          if (anchorSharedCount <= 1 || (specificHeadlineStems.size >= 2 && anchorSpecSharedCount === 0)) {
            console.warn(`[Clusters] Dropped single-stem/country/entity tangent from "${primaryStoryText}": [${art.sourceId}] "${art.title}"`);
            return false;
          }
        }
        const keep = rawCandidates.some((other, j) => {
          if (j === idx) return false;
          if (!art.isClusterAnchor && !other.isClusterAnchor && other.sourceId === art.sourceId) return false;
          const otherTitleStems = other.titleStems || new Set(extractCoherenceStems(`${other.anchorStory || ''} ${other.title || ''}`));
          const otherAllStems = other.allStems || new Set(extractCoherenceStems(`${other.anchorStory || ''} ${other.title || ''} ${(other.description || '').slice(0, 125)}`));
          const sharedTitle = [...myTitleStems].filter(s => otherTitleStems.has(s));
          const sharedTitleToFull = [...myTitleStems].filter(s => otherAllStems.has(s));
          const sharedAll = [...myAllStems].filter(s => otherAllStems.has(s));
          const hasSpecificAll = sharedAll.some(s => !GENERIC_CANDIDATE_STEMS.has(s) && !BROAD_THEATRE_ACTOR_STEMS.has(s) && (stemDocFreq.get(s) || 0) <= maxAllStemDf);
          const hasRareTitle = sharedTitle.some(s => !GENERIC_CANDIDATE_STEMS.has(s) && !BROAD_THEATRE_ACTOR_STEMS.has(s) && (stemDocFreq.get(s) || 0) <= maxRareTitleStemDf) && sharedAll.length >= 2;
          return (sharedTitle.length >= 1 && sharedAll.length >= 2 && hasSpecificAll) ||
            hasRareTitle ||
            (sharedTitleToFull.length >= 2 && sharedAll.length >= 3 && hasSpecificAll);
        });
        if (!keep) {
          console.warn(`[Clusters] Dropped low-specificity/thematic outlier from "${cl.story}": [${art.sourceId}] "${art.title}"`);
        }
        return keep;
      });
      if (rawMatching.length < 2) return;
      // Ensure at least 1 genuinely new (non-anchor) article is present so anchor-only pairs don't duplicate existing clusters
      const nonAnchorMatching = rawMatching.filter(m => !m.isClusterAnchor);
      if (nonAnchorMatching.length === 0) return;

      const allAnchorMatches = rawMatching
        .filter(m => m.isClusterAnchor && m.anchorCluster)
        .sort((a, b) => {
          const ca = a.anchorCluster;
          const cb = b.anchorCluster;
          const scoreA = ((ca.evolutionHistory?.length || 1) * 1000) + ((ca.version || 1) * 100) + (ca.coverage?.length || 0);
          const scoreB = ((cb.evolutionHistory?.length || 1) * 1000) + ((cb.version || 1) * 100) + (cb.coverage?.length || 0);
          return scoreB - scoreA;
        });
      const directAnchorMatch = allAnchorMatches[0] || null;

      // Sort non-anchor articles: prefer articles matching the cluster's specific headline stems before raw recency
      nonAnchorMatching.sort((a, b) => {
        if (specificHeadlineStems.size > 0) {
          const aSpec = [...(a.allStems || [])].some(s => specificHeadlineStems.has(s)) ? 1 : 0;
          const bSpec = [...(b.allStems || [])].some(s => specificHeadlineStems.has(s)) ? 1 : 0;
          if (bSpec !== aSpec) return bSpec - aSpec;
        }
        return new Date(b.pubDate) - new Date(a.pubDate);
      });
      // Enforce 1 representative dispatch per outlet so no single outlet's live-blog skews the cluster spectrum or average
      const seenOutlets = new Set();
      const matchingArticles = [];
      for (const m of nonAnchorMatching) {
        if (seenOutlets.has(m.sourceId)) continue;
        seenOutlets.add(m.sourceId);
        matchingArticles.push(m);
      }

      if (matchingArticles.length >= 2 || (directAnchorMatch && matchingArticles.length >= 1)) {
        // Check if this cluster matches an existing or dormant cluster via direct EXISTING_CLUSTER anchor OR shared URLs/stems
        let matchedPrev = null;
        const secondaryAnchors = [];
        const evolvedIds = new Set();
        if (allAnchorMatches.length > 0) {
          for (const anc of allAnchorMatches) {
            const ancCluster = anc.anchorCluster;
            if (!ancCluster) continue;
            const ancSlug = ancCluster.id || String(ancCluster.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (matchedPrevIds.has(ancSlug)) continue;
            // Verify that the surviving non-anchor articles share at least 1 coherent stem with this anchor cluster
            // (prevents a single leftover article after outlier-stripping from hijacking or dropping an unrelated EXISTING_CLUSTER anchor)
            const ancStems = new Set(extractCoherenceStems(`${ancCluster.story || ''} ${ancCluster.summary || ''} ${(ancCluster.coverage || []).slice(0, 5).map(c => c.title || '').join(' ')}`));
            const ancSpecHeadStems = new Set(extractCoherenceStems(ancCluster.story || '').filter(s => isSpecificCorpusStem(s, maxTitleStemDf)));
            const ancSpecAllStems = new Set([...ancStems].filter(s => isSpecificCorpusStem(s, maxAllStemDf)));
            const ancUrls = new Set((ancCluster.coverage || []).map(c => c.link ? canonicalUrl(c.link) : '').filter(Boolean));
            const ancUrlHits = matchingArticles.filter(m => m.link && ancUrls.has(canonicalUrl(m.link))).length;
            const nonAnchorBagStems = new Set();
            matchingArticles.forEach(m => extractCoherenceStems(`${m.title || ''} ${m.description || ''}`).forEach(s => nonAnchorBagStems.add(s)));
            const sharedWithAnchor = [...nonAnchorBagStems].filter(s => ancStems.has(s)).length;
            const sharedSpecHead = [...nonAnchorBagStems].filter(s => ancSpecHeadStems.has(s)).length;
            const sharedSpecAll = [...nonAnchorBagStems].filter(s => ancSpecAllStems.has(s)).length;
            if (sharedWithAnchor === 0 && matchingArticles.length < 2) {
              continue;
            }
            // Guard 1 (Anti-Hijack & Anti-Single-Tangent Anchor Gate):
            // When new articles share 0 URLs with ancCluster:
            // (a) Require >=1 specific non-theatre headline stem OR >=2 specific non-theatre summary/coverage stems, AND
            // (b) When only a single new article (`matchingArticles.length === 1`) is trying to attach to an existing cluster,
            //     require >=2 shared anchor stems including >=2 specific stems (or >=1 specific headline stem + >=3 total anchor stems)
            //     so a single unrelated article sharing only a country/company/court name (e.g. Tunisia, OpenAI, Supreme Court, Budget) never pollutes the cluster.
            const isSingleArticleTangent = ancUrlHits === 0 && matchingArticles.length === 1 &&
              (sharedWithAnchor < 2 || (sharedSpecAll < 2 && !(sharedSpecHead >= 1 && sharedWithAnchor >= 3)));
            const isDisjointCountryAnchor = ancUrlHits === 0 && hasDisjointSovereignCountryConflict(
              `${ancCluster.story || ''} ${ancCluster.summary || ''}`,
              matchingArticles.map(m => `${m.title || ''} ${m.description || ''}`).join(' '),
              ancCluster.story || '',
              cl.story || '',
              stemDocFreq,
              maxRareTitleStemDf
            );
            const newestMatchArtMs = Math.max(...matchingArticles.map(m => m.pubMs || (m.pubDate ? Date.parse(m.pubDate) : 0) || 0), 0);
            const isEpisodicMismatchAnchor = ancUrlHits === 0 && hasEpisodicPhaseMismatch(
              ancCluster.story || '',
              ancCluster.firstSeenAt ? Date.parse(ancCluster.firstSeenAt) : 0,
              `${cl.story || ''} ${matchingArticles.map(m => `${m.title || ''} ${m.description || ''}`).join(' ')}`,
              newestMatchArtMs
            );
            if ((ancUrlHits === 0 && ancSpecHeadStems.size > 0 && sharedSpecHead === 0 && sharedSpecAll < 2) || isSingleArticleTangent || isDisjointCountryAnchor || isEpisodicMismatchAnchor) {
              console.warn(`[Clusters] Detached theatre/single-entity/episodic-mismatch anchor "${ancCluster.story}" from "${cl.story}" (urlHits=${ancUrlHits}, sharedSpecHead=${sharedSpecHead}, sharedSpecAll=${sharedSpecAll}, sharedTotal=${sharedWithAnchor}, episodicMismatch=${isEpisodicMismatchAnchor})`);
              continue;
            }
            if (!matchedPrev) {
              matchedPrev = ancCluster;
            } else {
              // Guard against swallowing a distinct secondary EXISTING_CLUSTER anchor when the first-pass LLM
              // lumped two different stories from the same geopolitical theatre into one candidate group.
              const prevUrlsSet = new Set((matchedPrev.coverage || []).map(c => c.link ? canonicalUrl(c.link) : '').filter(Boolean));
              const ancUrlsOverlap = (ancCluster.coverage || []).filter(c => c.link && prevUrlsSet.has(canonicalUrl(c.link))).length;
              const prevSpecificTitleStems = extractCoherenceStems(matchedPrev.story || '').filter(s => isSpecificCorpusStem(s, maxRareTitleStemDf));
              const ancSpecificTitleStems = new Set(extractCoherenceStems(ancCluster.story || '').filter(s => isSpecificCorpusStem(s, maxRareTitleStemDf)));
              const sharedSpecificTitle = prevSpecificTitleStems.filter(s => ancSpecificTitleStems.has(s)).length;
              const hasSecondaryCountryConflict = hasDisjointSovereignCountryConflict(
                `${matchedPrev.story || ''} ${matchedPrev.summary || ''}`,
                `${ancCluster.story || ''} ${ancCluster.summary || ''}`,
                matchedPrev.story || '',
                ancCluster.story || '',
                stemDocFreq,
                maxRareTitleStemDf
              );
              if (hasSecondaryCountryConflict || (ancUrlsOverlap < 2 && sharedSpecificTitle < 2)) {
                continue;
              }
              secondaryAnchors.push(ancCluster);
            }
            if (ancSlug) evolvedIds.add(ancSlug);
            if (Array.isArray(ancCluster.evolvedFromIds)) {
              ancCluster.evolvedFromIds.forEach(id => evolvedIds.add(id));
            }
          }
        }
        const newUrls = new Set(matchingArticles.map(m => m.link ? canonicalUrl(m.link) : '').filter(Boolean));
        const newTitles = new Set(matchingArticles.map(m => m.title ? cleanHeadlineTitle(m.title) : '').filter(Boolean));
        const newTitleStems = new Set(extractCoherenceStems(cl.story || ''));
        const newAllStems = new Set(extractCoherenceStems(`${cl.story || ''} ${cl.summary || ''} ${matchingArticles.slice(0, 5).map(m => m.title || '').join(' ')}`));

        if (!matchedPrev && Array.isArray(allKnownPrevClusters)) {
          let bestPrevScore = -1;
          for (const prev of allKnownPrevClusters) {
            if (!prev || !Array.isArray(prev.coverage)) continue;
            const prevSlug = prev.id || String(prev.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (matchedPrevIds.has(prevSlug)) continue;
            const prevSeenSet = new Set(Array.isArray(prev.seenArticleKeys) ? prev.seenArticleKeys : []);
            const sharedCovCount = prev.coverage.filter(c =>
              (c.link && newUrls.has(canonicalUrl(c.link))) ||
              (c.title && newTitles.has(cleanHeadlineTitle(c.title)))
            ).length;
            const sharedSeenCount = matchingArticles.filter(m =>
              (m.link && prevSeenSet.has(canonicalUrl(m.link))) ||
              (m.title && prevSeenSet.has(cleanHeadlineTitle(m.title)))
            ).length;
            const sharedCount = Math.max(sharedCovCount, sharedSeenCount);

            const prevTitleStems = extractCoherenceStems(prev.story || '');
            const prevAllStems = extractCoherenceStems(`${prev.story || ''} ${prev.summary || ''} ${(prev.coverage || []).slice(0, 5).map(c => c.title || '').join(' ')}`);
            const sharedTitleStemCount = [...new Set(prevTitleStems)].filter(s => newTitleStems.has(s)).length;
            const sharedAllStemCount = [...new Set(prevAllStems)].filter(s => newAllStems.has(s)).length;

            const sharedSpecTitleCount = [...new Set(prevTitleStems)].filter(s => isSpecificCorpusStem(s, maxTitleStemDf) && newTitleStems.has(s)).length;
            const sharedSpecAllCount = [...new Set(prevAllStems)].filter(s => isSpecificCorpusStem(s, maxAllStemDf) && newAllStems.has(s)).length;

            const isUrlTitleMatch = sharedCount >= 2 || (sharedCount >= 1 && ((prev.coverage.length <= 2 && matchingArticles.length <= 2) || sharedSpecTitleCount >= 1));
            const isHighSpecificityStemMatch = sharedCount >= 1 && sharedSpecTitleCount >= 2 && sharedSpecAllCount >= 3;
            const hasCountryConflict = hasDisjointSovereignCountryConflict(
              `${prev.story || ''} ${prev.summary || ''}`,
              `${cl.story || ''} ${cl.summary || ''}`,
              prev.story || '',
              cl.story || '',
              stemDocFreq,
              maxRareTitleStemDf
            );

            // Never deterministically hijack a previous cluster when sharedCount === 0 (zero shared URLs/titles);
            // zero-URL duplicate-incident merges are evaluated by the LLM in consolidateEvolvingClusters (Job 1).
            if (!hasCountryConflict && (isUrlTitleMatch || isHighSpecificityStemMatch)) {
              const candidateScore = sharedCount * 100 + sharedTitleStemCount * 25 + sharedAllStemCount * 5 + ((prev.version || 1) * 10) + (prev.coverage.length || 0);
              if (candidateScore > bestPrevScore) {
                bestPrevScore = candidateScore;
                matchedPrev = prev;
              }
            }
          }
          if (matchedPrev) {
            const winSlug = matchedPrev.id || String(matchedPrev.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (winSlug) evolvedIds.add(winSlug);
            if (Array.isArray(matchedPrev.evolvedFromIds)) {
              matchedPrev.evolvedFromIds.forEach(id => evolvedIds.add(id));
            }
          }
        }

        // Default to preserving matchedPrev's canonical id, story, summary, and version so syndication catch-up
        // (additional outlets reporting the same initial event) NEVER jitters the cluster slug or headline!
        // If new articles joined, attach `_pendingUpdate` so the single consolidation pass can verify if a real development occurred.
        let finalId = null;
        let finalStory = cl.story;
        let finalSummary = cl.summary || '';
        let prevVersion = 1;
        let prevFirstSeenAt = null;
        let prevLastDevelopedAt = null;
        let prevDevelopmentNote = null;
        let prevEvolutionHistory = null;
        let prevSeenKeys = null;
        let prevEvaluatedDesyncTokens = null;
        let prevLastEvaluatedCoverageMs = null;
        let prevLateralConnections = null;
        let prevSummarySynthesizedSig = null;
        let prevPrimaryLocation = null;
        let prevBriefing = null;
        let pendingUpdate = null;

        if (matchedPrev) {
          const allMatchedAnchors = [matchedPrev, ...secondaryAnchors];
          const mergedEvalTokens = new Set();
          let maxEvalCovMs = 0;
          for (const anc of allMatchedAnchors) {
            (anc.evaluatedDesyncTokens || []).forEach(t => mergedEvalTokens.add(t));
            if (anc.lastEvaluatedCoverageMs && anc.lastEvaluatedCoverageMs > maxEvalCovMs) {
              maxEvalCovMs = anc.lastEvaluatedCoverageMs;
            }
          }
          if (mergedEvalTokens.size > 0) prevEvaluatedDesyncTokens = Array.from(mergedEvalTokens).slice(-30);
          if (maxEvalCovMs > 0) prevLastEvaluatedCoverageMs = maxEvalCovMs;
          // Self-heal check: include both new matchingArticles AND matchedPrev.coverage so a single new dispatch
          // matching an EXISTING_CLUSTER anchor never falsely fails prevStorySupported and drops the cluster's existing outlets!
          const articleBagStems = new Set();
          matchingArticles.forEach(m => extractCoherenceStems(`${m.title || ''} ${m.description || ''}`).forEach(s => articleBagStems.add(s)));
          (matchedPrev.coverage || []).forEach(c => extractCoherenceStems(`${c.title || ''}`).forEach(s => articleBagStems.add(s)));
          const prevStoryStems = extractCoherenceStems(matchedPrev.story || '');
          const prevSummaryStems = extractCoherenceStems(matchedPrev.summary || '');
          const supportedStoryStems = prevStoryStems.filter(s => articleBagStems.has(s)).length;
          const supportedSummaryStems = prevSummaryStems.filter(s => articleBagStems.has(s)).length;
          const prevStorySupported =
            prevStoryStems.length === 0 ||
            supportedStoryStems >= 2 ||
            (supportedStoryStems / prevStoryStems.length) >= 0.35 ||
            (supportedStoryStems >= 1 && supportedSummaryStems >= 2);

          if (!prevStorySupported && matchingArticles.length < 2) {
            return;
          }

          for (const anc of allMatchedAnchors) {
            const ancSlug = anc.id || String(anc.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (ancSlug) matchedPrevIds.add(ancSlug);
          }

          const prevSlug = prevStorySupported
            ? (matchedPrev.id || String(matchedPrev.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
            : String(cl.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          finalId = prevSlug;
          finalStory = prevStorySupported ? (matchedPrev.story || cl.story) : cl.story;
          finalSummary = prevStorySupported ? (matchedPrev.summary || cl.summary || '') : (cl.summary || matchedPrev.summary || '');
          prevVersion = prevStorySupported && typeof matchedPrev.version === 'number' ? matchedPrev.version : 1;
          prevFirstSeenAt = prevStorySupported ? (matchedPrev.firstSeenAt || matchedPrev.evolutionHistory?.[0]?.timestamp || null) : null;
          prevLastDevelopedAt = prevStorySupported ? (matchedPrev.lastDevelopedAt || null) : null;
          prevDevelopmentNote = prevStorySupported ? (matchedPrev.developmentNote || null) : null;
          prevSummarySynthesizedSig = prevStorySupported ? (matchedPrev.summarySynthesizedSig || null) : null;
          prevPrimaryLocation = prevStorySupported ? (matchedPrev.primaryLocation || null) : null;
          prevBriefing = prevStorySupported ? (matchedPrev.briefing || null) : null;

          const mergedLat = [];
          const seenLatIds = new Set();
          if (prevStorySupported) {
            for (const anc of allMatchedAnchors) {
              for (const lc of (anc.lateralConnections || [])) {
                if (lc?.clusterId && !seenLatIds.has(lc.clusterId)) {
                  seenLatIds.add(lc.clusterId);
                  mergedLat.push(lc);
                }
              }
            }
          }
          prevLateralConnections = mergedLat.length > 0 ? mergedLat : null;

          const historicalKeys = new Set();
          for (const anc of allMatchedAnchors) {
            (anc.seenArticleKeys || []).forEach(k => historicalKeys.add(k));
            (anc.coverage || []).forEach(c => {
              if (c.link) historicalKeys.add(canonicalUrl(c.link));
              if (c.title) historicalKeys.add(cleanHeadlineTitle(c.title));
            });
          }

          const addedArticles = matchingArticles.filter(m => {
            const u = m.link ? canonicalUrl(m.link) : '';
            const t = m.title ? cleanHeadlineTitle(m.title) : '';
            return (!u || !historicalKeys.has(u)) && (!t || !historicalKeys.has(t));
          });

          // Preserve prior outlets from matchedPrev.coverage (and any secondary merged anchors) that didn't publish a newer dispatch in this batch
          // so evolving multi-day clusters never shrink from 21 outlets down to 3 when a subset of outlets posts a follow-up!
          if (prevStorySupported) {
            for (const anc of allMatchedAnchors) {
              if (!Array.isArray(anc.coverage)) continue;
              for (const prevArt of anc.coverage) {
                if (!prevArt || !prevArt.sourceId || seenOutlets.has(prevArt.sourceId)) continue;
                seenOutlets.add(prevArt.sourceId);
                matchingArticles.push({
                  sourceId: prevArt.sourceId,
                  sourceName: prevArt.sourceName || prevArt.sourceId,
                  title: prevArt.title, description: prevArt.description || '',
                  sentiment: typeof prevArt.sentiment === 'number' ? prevArt.sentiment : 0,
                  link: prevArt.link || '',
                  pubDate: prevArt.pubDate || ''
                });
                extractCoherenceStems(`${prevArt.title || ''}`).forEach(s => articleBagStems.add(s));
              }
            }
            matchingArticles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
          }

          if (matchingArticles.length < 2) return;

          // Record all current articles into historicalKeys so re-clustered articles never re-trigger pendingUpdate
          matchingArticles.forEach(m => {
            if (m.link) historicalKeys.add(canonicalUrl(m.link));
            if (m.title) historicalKeys.add(cleanHeadlineTitle(m.title));
          });
          prevSeenKeys = Array.from(historicalKeys).slice(-140);

          if (prevStorySupported && Array.isArray(matchedPrev.evolutionHistory) && matchedPrev.evolutionHistory.length > 0) {
            // Strip any contaminated evolutionHistory entry that shares zero content stems with the cluster's articles OR lineage
            const lineageStems = new Set([
              ...articleBagStems,
              ...prevStoryStems,
              ...prevSummaryStems,
              ...extractCoherenceStems(`${matchedPrev.evolutionHistory[0]?.headline || ''} ${matchedPrev.evolutionHistory[0]?.summary || ''}`)
            ]);
            const coherentHistory = matchedPrev.evolutionHistory.filter((h, idx) => {
              if (idx === 0) return true;
              const hStems = extractCoherenceStems(`${h.headline || ''} ${h.note || ''} ${h.summary || ''}`);
              return hStems.length === 0 || hStems.some(s => lineageStems.has(s));
            });
            prevEvolutionHistory = coherentHistory.length > 0 ? coherentHistory : [...matchedPrev.evolutionHistory.slice(0, 1)];
          } else {
            prevEvolutionHistory = [{
              version: 1,
              type: 'initial',
              timestamp: matchedPrev.firstSeenAt || matchedPrev.lastDevelopedAt || new Date(matchingArticles[0]?.pubDate || Date.now()).toISOString(),
              headline: finalStory,
              summary: finalSummary,
              outletCount: matchingArticles.length,
              note: 'Initial cluster formation on the wire'
            }];
          }

          if (addedArticles.length > 0) {
            // Pre-LLM Information-Gain Gate: skip queuing _pendingUpdate when added articles only repeat known stems/numbers
            const priorText = [
              matchedPrev.story || '',
              matchedPrev.summary || '',
              ...(Array.isArray(matchedPrev.evolutionHistory) ? matchedPrev.evolutionHistory.map(h => `${h?.headline || ''} ${h?.note || ''}`) : []),
              ...(Array.isArray(matchedPrev.coverage) ? matchedPrev.coverage.map(a => a?.title || '') : [])
            ].join(' ');
            const priorKnownStems = new Set(extractCoherenceStems(priorText));
            const priorKnownNums = new Set(priorText.match(/\b\d+(?:[.,]\d+)?\b/g) || []);
            const waveNovelStemCounts = new Map();
            let hasNovelNumber = false;
            let maxSingleArtNovelSpecific = 0;
            let minSingleArtOverlap = 1;
            for (const a of addedArticles) {
              const cleanT = cleanHeadlineTitle(a.title || '');
              const aStems = extractCoherenceStems(cleanT);
              const aNums = cleanT.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
              if (aNums.some(n => !priorKnownNums.has(n))) hasNovelNumber = true;
              const novelSpecific = aStems.filter(st => !priorKnownStems.has(st) && (stemDocFreq.get(st) || 0) <= 18);
              const overlap = aStems.length > 0 ? (aStems.length - novelSpecific.length) / aStems.length : 1;
              if (novelSpecific.length > maxSingleArtNovelSpecific) maxSingleArtNovelSpecific = novelSpecific.length;
              if (overlap < minSingleArtOverlap) minSingleArtOverlap = overlap;
              for (const st of new Set(novelSpecific)) {
                waveNovelStemCounts.set(st, (waveNovelStemCounts.get(st) || 0) + 1);
              }
            }
            const hasSharedNovelStem = [...waveNovelStemCounts.values()].some(cnt => cnt >= 2);
            const hasSubstantiveInfoGain = hasNovelNumber || hasSharedNovelStem || (maxSingleArtNovelSpecific >= 2 && minSingleArtOverlap < 0.55);
            if (hasSubstantiveInfoGain) {
              const newestAddedMs = Math.max(...addedArticles.map(a => a.pubDate ? new Date(a.pubDate).getTime() : 0).filter(Boolean));
              pendingUpdate = {
                candidateStory: cl.story,
                candidateSummary: cl.summary || '',
                newestAddedMs: newestAddedMs > 0 ? newestAddedMs : (matchingArticles[0]?.pubDate ? new Date(matchingArticles[0].pubDate).getTime() : Date.now()),
                addedHeadlines: addedArticles.slice(0, 6).map(a => `${a.sourceName || a.sourceId}: "${a.title}"${a.description ? ` (${String(a.description).slice(0, 160).trim()})` : ''}`)
              };
            }
          }
        } else {
          if (matchingArticles.length < 2) return;
          const initKeys = new Set();
          matchingArticles.forEach(m => {
            if (m.link) initKeys.add(canonicalUrl(m.link));
            if (m.title) initKeys.add(cleanHeadlineTitle(m.title));
          });
          prevSeenKeys = Array.from(initKeys);
          const earliestMs = Math.min(...matchingArticles.map(m => m.pubDate ? new Date(m.pubDate).getTime() : Infinity));
          prevFirstSeenAt = new Date(earliestMs < Infinity ? earliestMs : Date.now()).toISOString();
          prevEvolutionHistory = [{
            version: 1,
            type: 'initial',
            timestamp: prevFirstSeenAt,
            batchConsolidatedAt: new Date().toISOString(),
            headline: finalStory,
            summary: finalSummary,
            outletCount: matchingArticles.length,
            note: 'Initial cluster formation on the wire'
          }];

          // Post-Strip / Continental-Umbrella Grounding Check:
          // If outliers were stripped from this newly formed cluster OR if its title uses a broad continental/global umbrella
          // while >=60% of surviving headlines share a specific location/entity stem missing from the title,
          // flag it for in-place initial title/summary re-grounding during the consolidation pass!
          const hadOutliersStripped = rawMatching.length < rawCandidates.length;
          const hasBroadUmbrellaTitle = /\b(european|asian|african|latin american|middle eastern|global|international|world)\b/i.test(finalStory || '');
          const storyStemSet = new Set(extractCoherenceStems(finalStory || ''));
          const stemCounts = new Map();
          for (const m of matchingArticles) {
            const mTitleStems = m.titleStems || new Set(extractCoherenceStems(m.title || ''));
            for (const s of mTitleStems) {
              if ((stemDocFreq.get(s) || 0) <= 18) {
                stemCounts.set(s, (stemCounts.get(s) || 0) + 1);
              }
            }
          }
          const hasUnrepresentedDominantStem = [...stemCounts.entries()].some(
            ([s, cnt]) => cnt / matchingArticles.length >= 0.6 && !storyStemSet.has(s)
          );
          if (hadOutliersStripped || (hasBroadUmbrellaTitle && hasUnrepresentedDominantStem)) {
            const newestMsVal = matchingArticles[0]?.pubDate ? new Date(matchingArticles[0].pubDate).getTime() : Date.now();
            pendingUpdate = {
              isInitialGrounding: true,
              candidateStory: finalStory,
              candidateSummary: finalSummary,
              newestAddedMs: newestMsVal,
              addedHeadlines: matchingArticles.slice(0, 6).map(a => `${a.sourceName || a.sourceId}: "${a.title}"${a.description ? ` (${String(a.description).slice(0, 160).trim()})` : ''}`)
            };
          }
        }

        matchingArticles.forEach(m => {
          if (m.link) coveredUrls.add(canonicalUrl(m.link));
          if (m.title) coveredTitles.add(cleanHeadlineTitle(m.title));
        });
        const scores = matchingArticles.map(m => m.sentiment);
        const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
        const spreadRange = Number((Math.max(...scores) - Math.min(...scores)).toFixed(2));
        const newestMs = matchingArticles[0]?.pubDate ? new Date(matchingArticles[0].pubDate).getTime() : 0;

        const currentSlug = finalId || String(finalStory || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        evolvedIds.delete(currentSlug);

        formattedClusters.push({
          id: currentSlug,
          story: finalStory,
          summary: finalSummary,
          version: prevVersion,
          ...(prevFirstSeenAt ? { firstSeenAt: prevFirstSeenAt } : {}),
          ...(prevLastDevelopedAt ? { lastDevelopedAt: prevLastDevelopedAt } : {}),
          ...(prevDevelopmentNote ? { developmentNote: prevDevelopmentNote } : {}),
          ...(evolvedIds.size > 0 ? { evolvedFromIds: Array.from(evolvedIds) } : {}),
          ...(prevEvolutionHistory ? { evolutionHistory: prevEvolutionHistory } : {}),
          ...(prevSeenKeys ? { seenArticleKeys: prevSeenKeys } : {}),
          ...(prevEvaluatedDesyncTokens ? { evaluatedDesyncTokens: prevEvaluatedDesyncTokens } : {}),
          ...(prevLastEvaluatedCoverageMs ? { lastEvaluatedCoverageMs: prevLastEvaluatedCoverageMs } : {}),
          ...(prevLateralConnections ? { lateralConnections: prevLateralConnections } : {}),
          ...(prevSummarySynthesizedSig ? { summarySynthesizedSig: prevSummarySynthesizedSig } : {}),
          ...(prevBriefing ? { briefing: prevBriefing } : {}),
          ...((prevPrimaryLocation || (cl.primaryLocation && typeof cl.primaryLocation.lat === 'number' && typeof cl.primaryLocation.lon === 'number' && cl.primaryLocation.name ? {
            name: String(cl.primaryLocation.name).trim(),
            region: String(cl.primaryLocation.region || '').trim(),
            ...(typeof cl.primaryLocation.countryIso === 'string' && cl.primaryLocation.countryIso.trim() ? { countryIso: cl.primaryLocation.countryIso.trim().toLowerCase() } : {}),
            lat: Number(cl.primaryLocation.lat),
            lon: Number(cl.primaryLocation.lon),
            lng: Number(cl.primaryLocation.lon),
            zoom: typeof cl.primaryLocation.zoom === 'number' ? cl.primaryLocation.zoom : 10
          } : null)) ? { primaryLocation: prevPrimaryLocation || {
            name: String(cl.primaryLocation.name).trim(),
            region: String(cl.primaryLocation.region || '').trim(),
            ...(typeof cl.primaryLocation.countryIso === 'string' && cl.primaryLocation.countryIso.trim() ? { countryIso: cl.primaryLocation.countryIso.trim().toLowerCase() } : {}),
            lat: Number(cl.primaryLocation.lat),
            lon: Number(cl.primaryLocation.lon),
            lng: Number(cl.primaryLocation.lon),
            zoom: typeof cl.primaryLocation.zoom === 'number' ? cl.primaryLocation.zoom : 10
          } } : {}),
          ...(pendingUpdate ? { _pendingUpdate: pendingUpdate } : {}),
          averageSentiment: avgScore,
          sentimentSpread: spreadRange,
          outletCount: matchingArticles.length,
          newestMs,
          coverage: matchingArticles.map(m => ({
            sourceId: m.sourceId,
            sourceName: m.sourceName,
            title: m.title, description: m.description || '',
            sentiment: m.sentiment,
            link: m.link,
            pubDate: m.pubDate
          }))
        });
      }
    });

    // Uniform Rolling 7-Day Cluster Memory: preserve any valid multi-outlet cluster from the previous run (< 7 days old)
    // regardless of sentiment, whose articles weren't already superseded by a new cluster in this pass
    if (Array.isArray(previousClusters)) {
      previousClusters.forEach(prev => {
        if (!prev || !Array.isArray(prev.coverage) || prev.coverage.length < 2) return;
        const prevSlug = prev.id || String(prev.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (matchedPrevIds.has(prevSlug)) return;
        const newestPrevMs = Math.max(...prev.coverage.map(c => new Date(c.pubDate).getTime() || 0));
        if (newestPrevMs < sevenDaysAgo) return;

        const coveredCount = prev.coverage.filter(c =>
          (c.link && coveredUrls.has(canonicalUrl(c.link))) ||
          (c.title && coveredTitles.has(cleanHeadlineTitle(c.title)))
        ).length;
        // Only treat a previous cluster as superseded by coveredUrls if >= 60% (and at least 2) of its articles
        // were absorbed into new clusters; never drop a 2-outlet cluster just because 1 of its articles got pulled into a broad umbrella story!
        const alreadyCovered = coveredCount >= Math.max(2, Math.ceil(prev.coverage.length * 0.6));
        if (!alreadyCovered) {
          const prevClone = {
            ...prev,
            version: typeof prev.version === 'number' ? prev.version : 1,
            newestMs: newestPrevMs
          };
          // Self-heal any preserved v1 cluster that still has a vague continental umbrella title while >=60% of its articles share a specific location/entity stem
          if (prevClone.version === 1 && /\b(european|asian|african|latin american|middle eastern|global|international|world)\b/i.test(prevClone.story || '')) {
            const pStoryStems = new Set(extractCoherenceStems(prevClone.story || ''));
            const pCounts = new Map();
            for (const cArt of (prevClone.coverage || [])) {
              for (const s of extractCoherenceStems(cArt.title || '')) {
                if ((stemDocFreq.get(s) || 0) <= 18) pCounts.set(s, (pCounts.get(s) || 0) + 1);
              }
            }
            const needsGround = [...pCounts.entries()].some(([s, cnt]) => cnt / prevClone.coverage.length >= 0.6 && !pStoryStems.has(s));
            if (needsGround) {
              prevClone._pendingUpdate = {
                isInitialGrounding: true,
                candidateStory: prevClone.story,
                candidateSummary: prevClone.summary || '',
                newestAddedMs: newestPrevMs,
                addedHeadlines: prevClone.coverage.slice(0, 6).map(a => `${a.sourceName || a.sourceId}: "${a.title}"${a.description ? ` (${String(a.description).slice(0, 160).trim()})` : ''}`)
              };
            }
          }
          formattedClusters.push(prevClone);
        }
      });
    }

    // Deterministic Post-LLM Entity-Anchor + Event-Action Coverage Catch-Up Pass (Rolling 7-Day Window):
    // Because a single LLM clustering call outputs ~50 clusters per run and does not re-emit all ~300 preserved clusters,
    // sweep uncovered 7-day articles (within ±72h of each cluster's coverage window) that pass the Rare-Entity Bottleneck
    // + Headline Coverage + Peer Coherence gates, sorted by match score descending so the best dispatch per outlet wins.
    const GENERIC_PREDICATE_OR_ROLE_STEMS = new Set(extractCoherenceStems(`
      record fatal kills killed dead death deadly military soldiers soldier service members troops forces base bases training
      train charged charges release released crash fire attack attacks protest protests protesters court judge police arrest arrested
      strike strikes launch launches approve approval reject election elections voters campaign senate congress parliament government
      officials minister president secretary press spokesperson chief director head boss
      ousted ousts fires fired firing resigns resigned departs departed leaves left steps stepped out
      investigation probe threat threats crisis emergency warn warns disruption cancel delay
      announce announces reveal confirm confirms report reports discover found scientists astronomers study
      united states america american administration white house federal national global world
      outage pledges donate shares stock plunges surge slump fine fined penalty
      outbreak spreads virus cases infection blockade curfew curfews riots unrest merger explore explores potential
      acquires sanctions waiver tariffs poll polls rating midterms referendum independence secession
      slams comments demand demands increased funding public education workers company leaders
      foreign domestic political economic financial market international supreme warrant indictment
      convicted sentenced prison deportation petition lawsuit ruling breach cyber loyalty
      program champions league winning streak player coach referee suspends allegation alleged
      historic course overhaul pushes ahead orders departure staff embassy diplomats diplomatic
      summit talks willing resume accept freezing front vows kids relief spark powers
      upholds pause policy dismissed rumors health media retailer group stake pipeline network woman
      escalate accuses interference recover exports middle east early system services unveils
      injured wounded iran iranian oil crude gas fuel energy import imports export price prices trim trims cut cuts deal annual supply supplies
      barcelona villarreal madrid
    `));
    for (const cl of formattedClusters) {
      for (const c of (cl.coverage || [])) {
        if (c.link) coveredUrls.add(canonicalUrl(c.link));
        if (c.title) coveredTitles.add(cleanHeadlineTitle(c.title));
      }
    }
    const unclustered7d = [];
    Object.entries(finalSources).forEach(([sourceId, src]) => {
      for (const art of (src.articles || [])) {
        if (!art || !art.title || art.title.trim().length <= 10) continue;
        if (/\b(promo code|sportsbook|fanatics|betr|underdog|draftkings|fanduel|top news headlines|morning briefing|evening briefing|live:|– live)\b/i.test(art.title)) continue;
        const pubMs = art.pubDate ? new Date(art.pubDate).getTime() : NaN;
        if (isNaN(pubMs) || pubMs < sevenDaysAgo) continue;
        const cUrl = canonicalUrl(art.link);
        const cTitle = cleanHeadlineTitle(art.title);
        if ((cUrl && coveredUrls.has(cUrl)) || (cTitle && coveredTitles.has(cTitle))) continue;
        const titleStems = new Set(extractCoherenceStems(art.title));
        const allStems = new Set(extractCoherenceStems(`${art.title} ${(art.description || '').slice(0, 260)}`));
        const score = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0);
        unclustered7d.push({
          sourceId,
          sourceName: src.name || sourceId,
          pubMs,
          title: art.title.trim(),
          description: (art.description || '').slice(0, 260).trim(),
          sentiment: score,
          link: art.link || '',
          pubDate: art.pubDate || '',
          cUrl,
          cTitle,
          titleStems,
          allStems
        });
      }
    });
    const clusterMetaCatchup = formattedClusters.map(cl => {
      const cov = cl.coverage || [];
      const times = cov.map(c => new Date(c.pubDate).getTime()).filter(t => !isNaN(t) && t > 0);
      const minMs = times.length ? Math.min(...times) : 0;
      const maxMs = times.length ? Math.max(...times) : 0;
      const clTitleArr = extractCoherenceStems(cl.story || '');
      const clAllStems = new Set(extractCoherenceStems(`${cl.story || ''} ${cl.summary || ''}`));
      // Corpus IDF entity gate: only treat stems appearing in <= ~1.5% of the 48h article corpus (maxTitleStemDf)
      // as specific entity anchors, so common verbs/nouns never act as entity anchors.
      const entityDfCap = Math.max(18, Math.min(48, maxTitleStemDf));
      const clEntityStems = clTitleArr
        .filter(s => !GENERIC_PREDICATE_OR_ROLE_STEMS.has(s) && (stemDocFreq.get(s) || 0) <= entityDfCap)
        .sort((a, b) => (stemDocFreq.get(a) || 999) - (stemDocFreq.get(b) || 999));
      const peerStems = cov.map(peer => ({
        titleStems: new Set(extractCoherenceStems(peer.title || '')),
        allStems: new Set(extractCoherenceStems(`${peer.title || ''} ${peer.description || ''}`))
      }));
      return { cl, minMs, maxMs, clTitleArr, clAllStems, clEntityStems, peerStems };
    });
    const candidateAttachments = [];
    for (const art of unclustered7d) {
      let bestCl = null;
      let bestScore = 0;
      for (const cm of clusterMetaCatchup) {
        const cov = cm.cl.coverage || [];
        if (cov.length < 2 || cm.clTitleArr.length < 2 || cm.clEntityStems.length < 1) continue;
        if (cov.some(c => c.sourceId === art.sourceId)) continue;
        if (cm.minMs > 0 && (art.pubMs < cm.minMs - 72 * 3600 * 1000 || art.pubMs > cm.maxMs + 72 * 3600 * 1000)) continue;
        if (!art.titleStems.has(cm.clEntityStems[0])) continue;
        if (hasEpisodicPhaseMismatch(
          cm.cl.story || '',
          cm.minMs,
          `${art.title || ''} ${art.description || ''}`,
          art.pubMs
        )) continue;
        if (hasDisjointSovereignCountryConflict(
          `${cm.cl.story || ''} ${cm.cl.summary || ''}`,
          `${art.title || ''} ${art.description || ''}`,
          cm.cl.story || '',
          art.title || '',
          stemDocFreq,
          maxRareTitleStemDf
        )) continue;
        if (cm.clEntityStems.length >= 2 && !art.allStems.has(cm.clEntityStems[1])) continue;
        const matchedEntitiesInTitle = cm.clEntityStems.filter(s => art.titleStems.has(s));
        const matchedEntitiesInAll = cm.clEntityStems.filter(s => art.allStems.has(s));
        if (cm.clEntityStems.length <= 3) {
          if (matchedEntitiesInAll.length < cm.clEntityStems.length) continue;
          if (matchedEntitiesInTitle.length < Math.min(2, cm.clEntityStems.length)) continue;
        } else {
          if (matchedEntitiesInTitle.length < 2 || matchedEntitiesInAll.length < 3) continue;
        }
        const shTitle = cm.clTitleArr.filter(s => art.titleStems.has(s));
        const shTitleFromArtAll = cm.clTitleArr.filter(s => art.allStems.has(s));
        if (shTitle.length < 2) continue;
        if ((shTitleFromArtAll.length / cm.clTitleArr.length) < 0.60) continue;
        const shAll = [...art.allStems].filter(s => cm.clAllStems.has(s));
        if (shAll.length < 3) continue;
        let peerConfirmations = 0;
        for (const p of cm.peerStems) {
          const pShT = [...art.titleStems].filter(s => p.titleStems.has(s));
          const pShA = [...art.allStems].filter(s => p.allStems.has(s));
          const pHasLeadEntity = matchedEntitiesInAll.some(s => p.allStems.has(s));
          if (pHasLeadEntity && ((pShT.length >= 2 && pShA.length >= 2) || (pShT.length >= 1 && pShA.length >= 3))) {
            peerConfirmations++;
          }
        }
        if (peerConfirmations < 2) continue;
        const score = (matchedEntitiesInTitle.length * 15) + (shTitle.length * 8) + (shAll.length * 3) + (peerConfirmations * 4);
        if (score > bestScore) {
          bestScore = score;
          bestCl = cm.cl;
        }
      }
      if (bestCl) candidateAttachments.push({ art, bestCl, bestScore });
    }
    candidateAttachments.sort((a, b) => (b.bestScore - a.bestScore) || (b.art.pubMs - a.art.pubMs));
    let catchupAttachedCount = 0;
    for (const { art, bestCl } of candidateAttachments) {
      if ((art.cUrl && coveredUrls.has(art.cUrl)) || (art.cTitle && coveredTitles.has(art.cTitle))) continue;
      if ((bestCl.coverage || []).some(c => c.sourceId === art.sourceId)) continue;
      bestCl.coverage.push({
        sourceId: art.sourceId,
        sourceName: art.sourceName,
        title: art.title, description: art.description || '',
        sentiment: art.sentiment,
        link: art.link,
        pubDate: art.pubDate
      });
      bestCl.coverage.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      bestCl.outletCount = bestCl.coverage.length;
      const sents = bestCl.coverage.map(a => a.sentiment || 0);
      bestCl.averageSentiment = Number((sents.reduce((s, v) => s + v, 0) / sents.length).toFixed(2));
      bestCl.sentimentSpread = Number((Math.max(...sents) - Math.min(...sents)).toFixed(2));
      if (art.pubMs > (bestCl.newestMs || 0)) bestCl.newestMs = art.pubMs;
      if (art.cUrl) coveredUrls.add(art.cUrl);
      if (art.cTitle) coveredTitles.add(art.cTitle);
      catchupAttachedCount++;
      const histArr = Array.isArray(bestCl.evolutionHistory) ? bestCl.evolutionHistory : [];
      const maxHistMs = histArr.reduce((m, h) => {
        const ms = h?.timestamp ? new Date(h.timestamp).getTime() : 0;
        return (!isNaN(ms) && ms > m) ? ms : m;
      }, 0);
      if (art.pubMs > maxHistMs + 30 * 60000) {
        const baseText = `${bestCl.story || ""} ${bestCl.summary || ""} ${histArr.map(h => `${h?.headline || ""} ${h?.note || ""}`).join(" ")}`;
        const baseStems = new Set(extractCoherenceStems(baseText));
        const baseNums = new Set(baseText.match(/\b\d+(?:[.,]\d+)?\b/g) || []);
        const cleanT = cleanHeadlineTitle(art.title || "");
        const aNums = (cleanT.match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter(n => !baseNums.has(n));
        const novelSpec = [...art.titleStems].filter(s => !baseStems.has(s) && (stemDocFreq.get(s) || 0) <= 18);
        if (aNums.length > 0 || novelSpec.length >= 2) {
          const lineStr = `${art.sourceName || art.sourceId}: "${art.title}"${art.description ? ` (${String(art.description).slice(0, 160).trim()})` : ""}`;
          if (!bestCl._pendingUpdate) {
            bestCl._pendingUpdate = {
              candidateStory: bestCl.story,
              candidateSummary: bestCl.summary || "",
              newestAddedMs: art.pubMs,
              addedHeadlines: [lineStr]
            };
          } else {
            bestCl._pendingUpdate.newestAddedMs = Math.max(bestCl._pendingUpdate.newestAddedMs || 0, art.pubMs);
            if (Array.isArray(bestCl._pendingUpdate.addedHeadlines) && bestCl._pendingUpdate.addedHeadlines.length < 6 && !bestCl._pendingUpdate.addedHeadlines.includes(lineStr)) {
              bestCl._pendingUpdate.addedHeadlines.push(lineStr);
            }
          }
        }
      }
    }
    if (catchupAttachedCount > 0) {
      console.log(`[Clusters] Deterministic coverage catch-up attached ${catchupAttachedCount} late-arriving outlet dispatches to existing clusters.`);
    }

    // Longitudinal Cluster Consolidation & Development Verification Pass
    const consolidatedClusters = await consolidateEvolvingClusters(formattedClusters, apiKey);

    // Post-Consolidation Integrated Summary Synthesis Pass (honing newly created & newly updated clusters across all covering outlets + history)
    await synthesizeIntegratedClusterSummaries(consolidatedClusters, apiKey, finalSources);

    // Smooth 4-tier recency curve across the 7-day rolling window so fresh breaking stories lead while major developing stories stay visible
    const nowMs = Date.now();
    consolidatedClusters.sort((a, b) => {
      const ageHoursA = a.newestMs ? Math.max(0, (nowMs - a.newestMs) / 3600000) : 48;
      const ageHoursB = b.newestMs ? Math.max(0, (nowMs - b.newestMs) / 3600000) : 48;
      const recencyBoostA = ageHoursA <= 24 ? 1.45 : (ageHoursA <= 48 ? 1.05 : (ageHoursA <= 72 ? 0.65 : 0.35));
      const recencyBoostB = ageHoursB <= 24 ? 1.45 : (ageHoursB <= 48 ? 1.05 : (ageHoursB <= 72 ? 0.65 : 0.35));
      const scoreA = a.outletCount * (a.sentimentSpread + 0.15) * recencyBoostA;
      const scoreB = b.outletCount * (b.sentimentSpread + 0.15) * recencyBoostB;
      return scoreB - scoreA;
    });
    consolidatedClusters.forEach(c => {
      if (c._pendingUpdate?._acceptedOrEvaluated) {
        if (c._pendingUpdate?.desyncTokens) {
          const prevEval = new Set(Array.isArray(c.evaluatedDesyncTokens) ? c.evaluatedDesyncTokens : []);
          c._pendingUpdate.desyncTokens.forEach(t => prevEval.add(t));
          c.evaluatedDesyncTokens = Array.from(prevEval).slice(-30);
        }
        if (c.newestMs) {
          c.lastEvaluatedCoverageMs = Math.max(c.lastEvaluatedCoverageMs || 0, c.newestMs);
        }
      }
      delete c.newestMs;
      delete c._pendingUpdate;
    });
    return consolidatedClusters;
  }
  return previousClusters;
}

function appendClusterUpdateAuditLog(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  try {
    const logPath = path.join(DATA_DIR, 'cluster-updates-log.json');
    let existing = [];
    if (fs.existsSync(logPath)) {
      existing = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    }
    existing.push(...entries);
    if (existing.length > 250) {
      existing = existing.slice(-250);
    }
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Clusters] Could not write cluster-updates-log.json:', e.message);
  }
}

// Single-pass Longitudinal Cluster Consolidation & Substantive Development Verifier
async function consolidateEvolvingClusters(clusters, apiKey) {
  if (!apiKey || !Array.isArray(clusters) || clusters.length < 4) return clusters;

  const slugify = (str) => String(str || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const nowMs = Date.now();

  // Precompute stems (including dominant >=30% coverage title stems so umbrella-titled clusters surface in pair hints) and age
  const meta = clusters.map((c, origIdx) => {
    const cov = c.coverage || [];
    const newestMs = c.newestMs || Math.max(...cov.map(a => new Date(a.pubDate).getTime() || 0), 0);
    const ageHours = newestMs > 0 ? Math.max(0, (nowMs - newestMs) / 3600000) : 999;
    const domCovCounts = new Map();
    for (const a of cov) {
      for (const st of new Set(extractCoherenceStems(a.title || ''))) {
        domCovCounts.set(st, (domCovCounts.get(st) || 0) + 1);
      }
    }
    const minDomHits = Math.max(2, Math.ceil(cov.length * 0.30));
    const domCovStems = [...domCovCounts.entries()].filter(([, cnt]) => cnt >= minDomHits).map(([st]) => st);
    const titleStems = new Set([...extractCoherenceStems(c.story || ''), ...domCovStems]);
    const allStems = new Set([...extractCoherenceStems(`${c.story || ''} ${c.summary || ''} ${cov.slice(0, 6).map(a => a.title || '').join(' ')}`), ...domCovStems]);
    return { origIdx, c, ageHours, titleStems, allStems };
  });

  // Smart 7-Day Entity-Gated Pool:
  // Include any cluster that (a) has a _pendingUpdate, (b) is active (<= 48h), OR
  // (c) is an older 2-7d cluster that shares specific entity/title stems with at least one recent (<= 72h) cluster.
  // This preserves 100% of multi-day evolving arcs across all 7 days while trimming isolated background noise by ~40-50%.
  // Self-Healing Coverage-vs-Summary Desync Detector:
  // If an earlier sync run added articles to `coverage` (e.g. Nigeria Ebola cases, JD Vance declining endorsement,
  // or updated casualty counts) but the LLM consolidation call timed out or skipped that cluster in a large batch,
  // detect when >=2 recent coverage headlines share a proper noun or concrete figure missing from story+summary and re-queue!
  const DESYNC_IGNORE_WORDS = new Set([
    'after', 'amid', 'over', 'with', 'from', 'into', 'says', 'warn', 'warns', 'calls', 'talks', 'first', 'more',
    'most', 'some', 'many', 'news', 'live', 'watch', 'video', 'report', 'reports', 'world', 'state', 'states',
    'united', 'house', 'court', 'police', 'minister', 'president', 'government', 'officials', 'america', 'american',
    'britain', 'british', 'turkiye', 'turkey', 'reuters', 'bloomberg', 'guardian', 'times',
    'trump', 'biden', 'democrat', 'democratic', 'democrats', 'republican', 'republicans', 'senator', 'senate',
    'congress', 'lawmaker', 'parliament', 'federal', 'national', 'general', 'prime', 'supreme', 'justice', 'department'
  ]);
  for (let i = 0; i < meta.length; i++) {
    const c = meta[i].c;
    if (c._pendingUpdate || meta[i].ageHours > 72) continue;
    const cov = c.coverage || [];
    if (cov.length < 3) continue;
    const newestCovMs = Math.max(...cov.map(a => new Date(a.pubDate).getTime() || 0), 0);
    const histArr = Array.isArray(c.evolutionHistory) ? c.evolutionHistory : [];
    const lastHistMs = Math.max(
      c.lastDevelopedAt ? (new Date(c.lastDevelopedAt).getTime() || 0) : 0,
      ...histArr.map(h => h?.timestamp ? (new Date(h.timestamp).getTime() || 0) : 0),
      0
    );
    const postHistCov = lastHistMs > 0
      ? cov.filter(a => (new Date(a.pubDate).getTime() || 0) > lastHistMs + 20 * 60000)
      : [];
    const hasPostHistSurge = postHistCov.length >= 2 && newestCovMs > lastHistMs + 30 * 60000;
    if (!hasPostHistSurge && c.lastEvaluatedCoverageMs && newestCovMs <= c.lastEvaluatedCoverageMs) continue;
    const baseText = `${c.story || ''} ${c.summary || ''} ${c.developmentNote || ''} ${histArr.map(h => h.note || '').join(' ')}`.toLowerCase();
    const baseStems = new Set(extractCoherenceStems(baseText));
    const evalSet = new Set(Array.isArray(c.evaluatedDesyncTokens) ? c.evaluatedDesyncTokens : []);
    const recentCov = hasPostHistSurge ? postHistCov.slice(0, 8) : cov.slice(0, 5);
    const tokenHits = new Map();
    for (const a of recentCov) {
      const cleanT = String(a.title || '').replace(/\s+[-–—|]\s+[^-–—|]+$/, '');
      const tokens = cleanT.split(/\s+/);
      const seenInArt = new Set();
      for (let ti = 0; ti < tokens.length; ti++) {
        const tok = tokens[ti];
        const w = tok.replace(/[^a-zA-Z0-9]/g, '');
        const wl = w.toLowerCase();
        if (!wl || evalSet.has(wl)) continue;
        const isProper = ti > 0 && w.length >= 4 && /^[A-Z][a-z]+$/.test(w) && !DESYNC_IGNORE_WORDS.has(wl);
        const isAcronym = w.length >= 3 && w.length <= 6 && /^[A-Z]{3,6}$/.test(w) && !['USA', 'CNN', 'BBC', 'NPR', 'PBS', 'AFP', 'TASS', 'NATO'].includes(w);
        const isNumber = (/^\d+$/.test(w) && Number(w) >= 2 && Number(w) !== 2026 && Number(w) !== 2027) ||
          ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'dozen'].includes(wl);
        if ((isProper || isAcronym || isNumber) && !baseText.includes(wl.slice(0, Math.min(5, wl.length)))) {
          seenInArt.add(wl);
        }
      }
      if (hasPostHistSurge) {
        for (const st of extractCoherenceStems(cleanT)) {
          if (st.length >= 4 && !evalSet.has(st) && !DESYNC_IGNORE_WORDS.has(st) && !baseStems.has(st) && !baseText.includes(st)) {
            seenInArt.add(st);
          }
        }
      }
      for (const wl of seenInArt) tokenHits.set(wl, (tokenHits.get(wl) || 0) + 1);
    }
    const missingShared = [...tokenHits.entries()].filter(([, cnt]) => cnt >= 2).map(([wl]) => wl);
    if (missingShared.length > 0 && (!hasPostHistSurge || missingShared.length >= 2)) {
      const matchArts = recentCov.filter(a => {
        const tLow = String(a.title || '').toLowerCase();
        const tStems = new Set(extractCoherenceStems(a.title || ''));
        return missingShared.some(wl => tLow.includes(wl) || tStems.has(wl));
      });
      const newestMatchMs = Math.max(...matchArts.map(a => new Date(a.pubDate).getTime() || 0), 0);
      if (matchArts.length >= 2 && (hasPostHistSurge || !c.lastEvaluatedCoverageMs || newestMatchMs > c.lastEvaluatedCoverageMs)) {
        console.log(`[Clusters] Self-healing desync detected on "${c.story}" (missing from summary: ${missingShared.slice(0, 8).join(', ')}) — queueing for Job 2.`);
        c._pendingUpdate = {
          candidateStory: c.story,
          candidateSummary: c.summary || '',
          newestAddedMs: newestMatchMs || Date.now(),
          addedHeadlines: (hasPostHistSurge ? postHistCov.slice(0, 7) : matchArts.slice(0, 5)).map(a => `${a.sourceName || a.sourceId}: "${a.title}"${a.description ? ` (${String(a.description).slice(0, 160).trim()})` : ''}`),
          desyncTokens: missingShared.slice(0, 12)
        };
      }
    }
  }

  const includedOrigIndices = new Set();
  const candidatePairHints = [];

  for (let i = 0; i < meta.length; i++) {
    if (meta[i].c._pendingUpdate) {
      includedOrigIndices.add(i);
    }
  }

  // Compute cluster-level document frequency for each stem so ubiquitous "super-node" actors/countries
  // (e.g. "trump" or "united" appearing across >6 unrelated clusters) cannot alone trigger a pair hint without a specific event/topic stem.
  const clusterStemFreq = new Map();
  for (const m of meta) {
    for (const s of m.allStems) {
      clusterStemFreq.set(s, (clusterStemFreq.get(s) || 0) + 1);
    }
  }

  for (let i = 0; i < meta.length; i++) {
    for (let j = i + 1; j < meta.length; j++) {
      // At least one of the pair should be within 72h (or have a pending update)
      if (meta[i].ageHours > 72 && meta[j].ageHours > 72 && !meta[i].c._pendingUpdate && !meta[j].c._pendingUpdate) continue;
      const GENERIC_PAIR_TEMPLATE_STEMS = new Set([
        ...COMMON_HEADLINE_NON_ENTITY_STEMS,
        'record', 'fatal', 'kill', 'dead', 'death', 'milit', 'train', 'charg', 'releas', 'crash',
        'fire', 'attack', 'protes', 'court', 'judg', 'polic', 'arrest', 'strik', 'launch', 'approv',
        'reject', 'elect', 'voter', 'campai', 'senat', 'congre', 'parlia', 'govern', 'offici', 'minist',
        'presid', 'invest', 'probe', 'threat', 'crisis', 'emerg', 'warn', 'disrup', 'cancel', 'delay',
        'announ', 'reveal', 'confirm', 'report', 'discov', 'found', 'scient', 'astron', 'study',
        'united', 'state', 'americ', 'administr', 'white', 'house', 'feder', 'nation', 'global', 'world'
      ]);
      const clA = meta[i].c;
      const clB = meta[j].c;
      if (
        hasDisjointSovereignCountryConflict(`${clA.story || ''} ${clA.summary || ''}`, `${clB.story || ''} ${clB.summary || ''}`, clA.story || '', clB.story || '', clusterStemFreq, 8) ||
        hasDisjointSovereignCountryConflict(`${clB.story || ''} ${clB.summary || ''}`, `${clA.story || ''} ${clA.summary || ''}`, clB.story || '', clA.story || '', clusterStemFreq, 8)
      ) {
        continue;
      }
      const sharedTitle = [...meta[i].titleStems].filter(s => meta[j].titleStems.has(s));
      const sharedAll = [...meta[i].allStems].filter(s => meta[j].allStems.has(s));
      const crossTitleStems = new Set([
        ...[...meta[i].titleStems].filter(s => meta[j].allStems.has(s)),
        ...[...meta[j].titleStems].filter(s => meta[i].allStems.has(s))
      ]);
      const specificSharedTitle = sharedTitle.filter(s => !GENERIC_PAIR_TEMPLATE_STEMS.has(s));
      const specificSharedAll = sharedAll.filter(s => !GENERIC_PAIR_TEMPLATE_STEMS.has(s));
      const maxClusterEntityFreq = Math.max(8, Math.min(18, Math.round(meta.length * 0.045)));
      const hasSpecificEntityStem = sharedAll.some(s => !GENERIC_PAIR_TEMPLATE_STEMS.has(s) && (clusterStemFreq.get(s) || 0) <= maxClusterEntityFreq);
      if (
        hasSpecificEntityStem &&
        (
          (specificSharedTitle.length >= 1 && sharedTitle.length >= 2) ||
          (specificSharedTitle.length >= 1 && sharedAll.length >= 3 && specificSharedAll.length >= 2) ||
          (crossTitleStems.size >= 2 && sharedAll.length >= 4 && specificSharedAll.length >= 3)
        )
      ) {
        const isSeparateEpisodeOrSubject = hasDisjointProperSubjectMergeConflict(clA, clB, clusterStemFreq, maxClusterEntityFreq);
        includedOrigIndices.add(i);
        includedOrigIndices.add(j);
        const pairSpecScore = (specificSharedTitle.length * 10) + (sharedTitle.length * 4) + (specificSharedAll.length * 2) - (isSeparateEpisodeOrSubject ? 15 : 0);
        candidatePairHints.push({ origA: i, origB: j, sharedTitle, sharedAll, specificSharedTitle, specificSharedAll, pairSpecScore, isSeparateEpisodeOrSubject });
      }
    }
  }
  candidatePairHints.sort((a, b) => (b.pairSpecScore || 0) - (a.pairSpecScore || 0));

  // Sort activeOrigIndices so all _pendingUpdate clusters appear FIRST ([0..K-1]) at the top of the prompt
  // to eliminate LLM "lost-in-the-middle" attention dropoff on Job 2 (inPlaceDevelopments)!
  const activeOrigIndices = Array.from(includedOrigIndices).sort((a, b) => {
    const aPend = meta[a].c._pendingUpdate ? 1 : 0;
    const bPend = meta[b].c._pendingUpdate ? 1 : 0;
    if (bPend !== aPend) return bPend - aPend;
    return a - b;
  });
  if (activeOrigIndices.length < 2) return clusters;
  const origToPromptIdx = new Map();
  activeOrigIndices.forEach((origIdx, pIdx) => origToPromptIdx.set(origIdx, pIdx));

  const lines = activeOrigIndices.map((origIdx, pIdx) => {
    const c = clusters[origIdx];
    const id = c.id || slugify(c.story);
    const sampleOutlets = (c.coverage || []).slice(0, 4).map(a => a.sourceId).join(',');
    const cStoryStems = new Set(extractCoherenceStems(c.story || ''));
    const covList = c.coverage || [];
    const pendingRawLines = Array.isArray(c._pendingUpdate?.addedHeadlines) ? c._pendingUpdate.addedHeadlines : [];
    const baselineCov = covList.filter(a => !pendingRawLines.some(line => a.title && line.includes(a.title)));
    const samplePool = baselineCov.length >= 2 ? baselineCov : covList;
    const alignedSample = [...samplePool].sort((a, b) => {
      const aH = extractCoherenceStems(a.title || '').filter(s => cStoryStems.has(s)).length;
      const bH = extractCoherenceStems(b.title || '').filter(s => cStoryStems.has(s)).length;
      return bH - aH;
    });
    const pickedSamples = [];
    for (const item of [samplePool[0], ...alignedSample.slice(0, 3), ...samplePool.slice(0, 3)].filter(Boolean)) {
      if (pickedSamples.length < 3 && !pickedSamples.includes(item)) pickedSamples.push(item);
    }
    const f = extractEventFactAttributes(c);
    const factBanner = [
      f.timeTag ? `time: ${f.timeTag}` : '',
      f.locTag ? `geo: ${f.locTag}` : '',
      f.properDisplay.length ? `subjects: ${f.properDisplay.join(', ')}` : ''
    ].filter(Boolean).join(' | ');
    const sampleHeadlines = pickedSamples.map(a => {
      const pTime = formatShortUtcDate(a.pubDate);
      return `${a.sourceId}${pTime ? ` (${pTime})` : ''}: "${a.title}"${a.description ? ` (${String(a.description).slice(0, 140).trim()})` : ''}`;
    }).join(' | ');
    let line = `[${pIdx}] id="${id}" (v${c.version || 1})${factBanner ? ` [${factBanner}]` : ''} | "${c.story}" (${c.outletCount || c.coverage?.length || 2} outlets: ${sampleOutlets}) — ${c.summary || ''}`;
    if (sampleHeadlines) {
      line += `\n    [PRIMARY HEADLINES: ${sampleHeadlines}]`;
    }
    if (c.developmentNote || (Array.isArray(c.evolutionHistory) && c.evolutionHistory.length > 1)) {
      const priorNotes = (c.evolutionHistory || [])
        .slice(1)
        .map(h => `[v${h.version || '?'} ${h.type || 'shift'}: "${h.headline}" — ${h.note}]`)
        .join(' ; ');
      line += `\n    [PRIOR RECORDED HISTORY: ${priorNotes || c.developmentNote}]`;
    }
    if (c._pendingUpdate && Array.isArray(c._pendingUpdate.addedHeadlines) && c._pendingUpdate.addedHeadlines.length > 0) {
      if (c._pendingUpdate.isInitialGrounding) {
        line += `\n    [CANDIDATE IN-PLACE UPDATE (INITIAL GROUNDING — outlier was stripped or title is too broad; set updateType="material_shift" to replace "story" and "summary" so they name the exact city/country/actor shared ONLY by these surviving headlines): ${c._pendingUpdate.addedHeadlines.join(' | ')}]`;
      } else {
        line += `\n    [CANDIDATE IN-PLACE UPDATE: +${c._pendingUpdate.addedHeadlines.length} new dispatches -> ${c._pendingUpdate.addedHeadlines.join(' | ')}]`;
      }
    }
    return line;
  }).join('\n');

  const pendingPromptIndices = [];
  activeOrigIndices.forEach((origIdx, pIdx) => {
    const c = clusters[origIdx];
    if (c._pendingUpdate && Array.isArray(c._pendingUpdate.addedHeadlines) && c._pendingUpdate.addedHeadlines.length > 0) {
      pendingPromptIndices.push(pIdx);
    }
  });

  const pairHintBlock = candidatePairHints.length > 0
    ? `\n\n[HIGH-OVERLAP CANDIDATE PAIRS TO EVALUATE FOR JOB 1 (MERGE IF SAME SPECIFIC EVENT) OR JOB 3 (LATERAL CONNECTION IF SEPARATE EVENTS IN SAME THEATRE)]:\n` +
      candidatePairHints.slice(0, 25).map(p => {
        const pA = origToPromptIdx.get(p.origA);
        const pB = origToPromptIdx.get(p.origB);
        const tag = p.isSeparateEpisodeOrSubject
          ? ' [SEPARATE EPISODES / SUBJECTS — evaluate ONLY for JOB 3 lateralConnections, DO NOT merge in Job 1]'
          : '';
        return `- Compare [${pA}] "${clusters[p.origA].story}" <-> [${pB}] "${clusters[p.origB].story}" (shared stems: ${p.sharedAll.slice(0, 6).join(', ')})${tag}`;
      }).join('\n')
    : '';

  const prompt = `You are the Executive Editor of a global news intelligence wire.
Below are ${activeOrigIndices.length} active or overlapping story clusters from our rolling 7-day window, including each cluster's current summary, [PRIMARY HEADLINES], any [PRIOR RECORDED HISTORY], and any [CANDIDATE IN-PLACE UPDATE] dispatches.

FIRST-PRINCIPLES META-RULE — BASELINE SUBTRACTION, INTRA-STATE RESOLUTION ("clarification") vs. STATE-ENVELOPE SHIFT ("material_shift"):
Every news story has a current State Envelope defined by:
  (A) Active Jurisdictions & Actors (where and between whom the active phenomenon is occurring),
  (B) Institutional / Legal / Operational Regime (what formal powers, legal statuses, or operational timelines are in force),
  (C) Causal Phase & Outcome Direction (whether the situation is in an active/deliberative phase, escalating, reversing, or decisively resolved).

STEP 0 — MANDATORY BASELINE-SUBTRACTION & EVENT-TIME vs. PUBLICATION-TIME GATE (Preventing Syndication & Currency Echoes):
Before classifying ANY update in Job 2, distinguish between WHEN AN ARTICLE WAS PUBLISHED vs. WHETHER A NEW REAL-WORLD EVENT OCCURRED AFTER THE INITIAL BREAK:
  • An action, order, ruling, verdict, or casualty tally in [CANDIDATE IN-PLACE UPDATE] only counts as a new development if a new chronological action or official revision occurred in the real world AFTER the baseline event already stated in the cluster's existing headline, summary, and [PRIMARY HEADLINES]!
  • If a newly arriving outlet (e.g. a late regional or international syndicate in another timezone) reports a government ban, court conviction, hospital discharge, or fatality count that is ALREADY described in the cluster's current summary, it is 100% syndication catch-up ("none") — NEVER trigger a "material_shift" or a "clarification" ("Outlet X confirms...") for a milestone the cluster summary already states!
  • FIXED ONE-TIME RULING/TRANSACTION FIGURES vs. EVOLVING CUMULATIVE TALLIES: Distinguish between cumulative counts that genuinely grow over time (e.g. casualty tolls, arrests, flight cancellations) versus a fixed one-time court fine, verdict amount, or acquisition price. When [PRIMARY HEADLINES] establish a consensus figure for a one-time ruling/deal (e.g. "$25 billion" USD across US/global outlets) and a single international outlet reports that exact same one-time ruling converted into its local currency (e.g. "$35 billion" AUD in an Australian outlet or "€22.2bn" in a European outlet), NO new fine or ruling occurred — that is a local-currency expression of the original event ("none"), NEVER a "material_shift" or headline figure replacement!
  • DIGEST / MARKET-WRAP BUNDLING: If a candidate dispatch is a broader market wrap or digest that mentions the cluster's topic alongside unrelated market indices or other companies' earnings (e.g. "notes Wall Street climb and forthcoming earnings alongside..."), ignore the unrelated digest items completely ("none").

When evaluating what remains AFTER subtracting the existing summary baseline, distinguish between THREE states:
1. "none" (Same-Event Syndication / Static Background Color — Omit):
   - The new dispatches report on the EXACT SAME breaking event, court ruling, indictment, or announcement already in the cluster's headline/summary without any new subsequent chronological event occurring afterward — even if the new headlines use different synonyms (e.g. "charged by DOJ in cannabis conspiracy" vs "indicted on federal counts for marijuana distribution", or "blocks anti-trans prison policy" vs "upholds pause on transgender prison policy") or include static background/biographical/date details of that same initial event (e.g. mentioning a person's age like "82-year-old", party affiliation, exact date like "December 11" vs "early December", or co-defendants in the same indictment). If nothing new happened in time after the initial break, it is "none" — omit completely!

2. "clarification" (In-Phase Factual Delta — Sharpening Facts, Proposals, or Sub-Events Within the Existing Envelope):
   - The new dispatches add genuinely new factual precision, granularity, pre-decision deliberations, or localized sub-incidents NOT YET in the existing summary, WITHOUT executing an irreversible boundary crossing of the State Envelope:
     • Introducing or sharpening a concrete metric or tally compared to a previously vague or lower figure in the summary (e.g. "fatalities" or "1 dead" -> "at least 4 dead"; "kills 53" -> "kills 73"; "thousands arrested" -> "nearly 2,400 arrested"; "pledges SpaceX shares" -> "valued at over $9 billion"),
     • Pre-decision proposals, deliberations, or warnings BEFORE formal enactment (e.g. officials "weighing", "pushing for", "debating", or "threatening" curfews, sanctions, or charges — deliberating a measure is an In-Phase Update; only FORMAL ENACTMENT is a Shift),
     • Localized tactical flashpoints or rescue details within an already-established phenomenon (e.g. residents hoisted from rooftops during ongoing floods; protesters blockading a specific museum during nationwide unrest),
     • A genuinely new subsequent chronological step, newly released identity of a previously unnamed suspect/victim, or a major new official/market reaction that occurred AFTER the initial event (never routine background details or age/party descriptors of an already-named subject).
   - For "clarification": refine the cluster's "summary" so readers get the sharper facts, and record 1-2 crisp telegraphic delta fragments in "developmentNote", without bumping the version.
   - HEADLINE-SUMMARY CONSISTENCY & ANCHOR-PRESERVATION INVARIANT (for "clarification"): Normally, "clarification" keeps the existing "story" headline unchanged so the user recognizes the same story card over time. HOWEVER, if the existing "story" headline contains an explicit number/tally (e.g. "Kills 53", "1 Dead", "$5B") OR a directional/phase status word (e.g. "Halts", "Prepares", "Holds", "Injured" when they died, "Missing" when found) that is now directly contradicted or superseded by the updated "summary" (e.g. death toll rose to 73, or renovation is proceeding in November despite a lawsuit), you MUST surgically update ONLY the stale number/predicate in "story" while preserving the recognizable subject/place anchor (e.g. "Houthi Attack Kills 53 in Yemen" -> "Houthi Missile Attack Kills 73 in Yemen") and keeping "updateType": "clarification"!

3. "material_shift" (Irreversible Phase Pivot — Structural Step-Change Not Yet in the Existing Summary):
   - At least ONE net-new fact in the incoming dispatches (that is NOT already in the existing summary) executes an IRREVERSIBLE crossing of the prior State Envelope:
     • Spatial / Sovereign Border Crossing: The active physical phenomenon crosses into a NEW sovereign country or international theatre not yet named in the prior summary (e.g. domestic French unrest spreading into Italy and Belgium; an outbreak crossing into Kenya),
     • Executed Institutional / Legal Regime Change: Authorities FORMALLY ENACT, SIGN, RULE, OR EXECUTE an extraordinary legal/coercive measure not yet in the summary (e.g. curfews formally imposed in Paris and Nice, criminal charges/indictments formally filed, a suspect released without charges, or construction ordered to begin despite a court injunction — NEVER merely "weighing" or "pushing for" it),
     • Phase Completion / Decisive Outcome Resolution: An active process, vote, election, referendum, trial, launch, or emergency transitions from an ongoing/unresolved state ("holds referendum", "voters cast ballots", "prepares to launch", "on trial") to a decisive declared result or completed milestone ("voters reject independence referendum", "court convicts leader", "spacecraft successfully launches"),
     • Outcome / Premise Reversal: A critical threat or premise is definitively resolved or reversed (e.g. a mid-air bomb threat emergency landing is cleared with no explosives found onboard; a ceasefire collapses),
     • Temporal Re-Break / Follow-Up Kinetic or Institutional Escalation: When a new kinetic strike, explosion, military operation, municipal/regional ban, direct diplomatic summit, or significant casualty toll jump occurs hours or days (>= 6h) after the prior stage within the same cluster, classify as "material_shift" (never demote a new physical strike/explosion or major toll jump to "clarification" merely because the theatre headline is unchanged).

DISJUNCTIVE (OR-GATE) BATCH PRINCIPLE, SUMMARY-DELTA SYNC & SELECTIVE ATTRIBUTION:
- When a batch of incoming dispatches mixes routine commentary/reaction headlines with 1 or more headlines that execute a true net-new State-Envelope crossing, classify as "material_shift".
- PURE CHRONOLOGICAL DELTA & SUMMARY-TO-NOTE SYNC ("developmentNote"): Every "developmentNote" (for BOTH "clarification" and "material_shift") appears as a timestamped row in a progression timeline right below the cumulative summary. Therefore:
  • "developmentNote" must state STRICTLY the net-new delta (New Summary minus Existing Summary) at this timestamp (8–16 words max) and NEVER recap prior background ("following the weekend of...", "after earlier clashes in...", "in response to...").
  • CRITICAL SYNC INVARIANT: Whenever your updated "summary" introduces or sharpens a concrete figure, casualty toll, dollar valuation, or named identity that was NOT in the existing summary (e.g. sharpening "resulting in fatalities" to "resulting in at least four fatalities" while also adding rooftop rescues), your "developmentNote" MUST explicitly include that newly sharpened figure alongside the new detail (e.g. "Confirmed death toll rises to at least four; Al Jazeera reports residents hoisted from rooftops"). Never silently slip a major figure into "summary" while omitting it from "developmentNote"!
  • SELECTIVE SINGLE-SOURCE ATTRIBUTION: When a single outlet breaks a specific new detail, exclusive claim, or unverified allegation ahead of the rest of the cluster, attributing that outlet in "developmentNote" (e.g. "The Japan Times identifies suspect as Brendan Nugent" or "El País reports donation exceeds $9 billion") is helpful epistemic context. However, when multiple outlets confirm a major fact—or when an outlet is merely syndicating a baseline fact already known—write in direct wire voice ("Official results confirm Albertans rejected independence") and NEVER write "Outlet X confirms [fact already in summary]".
- Ask FIRST: "Did a new chronological event or revised casualty/financial tally happen AFTER the initial break, or are these outlets just reporting the same initial event with different wording/background color?" If it is the same initial event, omit it or set "updateType": "none".
- TEMPORAL & ROLE HYGIENE (NO STALE PRE-CUTOFF TITLES): Political officeholders, party leaders, and roles change over time (e.g. Andy Burnham is UK Prime Minister, not Mayor of Manchester). NEVER attach a political office, title, or city jurisdiction to a named person from your training memory unless that exact title appears verbatim in the provided dispatch text.
- HEADLINE CONTINUITY & TENSE HYGIENE RULE (for material_shift): Keep the recognizable origin/subject anchor AND prior geographic scope from the existing headline while appending/reflecting the new shift so readers never lose the thread (e.g. "French Cost-of-Living Protests Spread to Italy and Belgium"). When a shift is an investigative revelation of a completed past order, phone call, or request (where covering headlines use past tense like "Asked", "Ordered", "Called"), preserve past tense in the cluster headline (e.g. "Trump Asked Musk to Lift Ukraine Starlink Restrictions", "Musk Ordered Starlink Slowdown Disrupting Ukrainian Defenses") rather than present-tense "Asks"/"Orders" on a multi-day cluster.
- CUMULATIVE SUMMARY INVARIANT (INTEGRATED JOURNEY + CONCRETE FLASHPOINT DETAILS, NO RECENCY AMNESIA): A cluster's "summary" represents the complete cumulative story arc to date—NEVER just the latest batch of headlines. Whenever you output "summary" (for either "clarification" or "material_shift"), you MUST weave the integrated chronological journey (how the story broke -> how it shifted/developed across [PRIOR RECORDED HISTORY] -> where it stands now) WITH the concrete specifics from the dispatches (exact named institutions/agencies/companies, people/roles/ages, specific venues/streets/cities, exact figures/tallies, and causal mechanisms), while retaining prior verified figures and multi-country/multi-city geographic scope. Never drop earlier verified milestones or secondary countries, and NEVER include meta-coverage filler ("Outlets highlight...", "Reports examine...", "Media coverage focuses on...").

You have THREE jobs in this single pass:

JOB 1 — "merges" (Strict Duplicate-Incident Consolidation — Return [] If None):
Identify ONLY pairs of clusters whose [PRIMARY HEADLINES] report the EXACT SAME specific physical incident, referendum, legislative bill, court ruling, or scientific study (e.g. two clusters that both report on the exact same train crash, or an earlier cluster on a referendum/protest and a newer cluster on that exact same referendum/protest):
- CRITICAL NEGATIVE RULE: NEVER put two clusters in "merges" if they are different events, policies, conferences, economic reactions, debates, or studies that merely involve the same country, leader, election campaign, or war!
  • Example of FORBIDDEN merge #1: "Amazon Deforestation Falls to Record Low" + "Brazil Approves Shorter Workweek" + "Lula and Bolsonaro Spar in Debate" are THREE COMPLETELY DIFFERENT EVENTS (one is satellite climate data, one is a Congressional labor bill, one is a TV debate). They must NEVER appear in "merges" — put them in "lateralConnections" (Job 3) instead!
  • Example of FORBIDDEN merge #2: A military strike ("Houthi Attack Kills 53 in Yemen") and a separate diplomatic or economic fallout ("Saudi Arabia Postpones Investor Conference" or "Egypt Pledges Support to Saudi Arabia") are DISTINCT EVENTS with different actors and severities. NEVER merge an economic/diplomatic reaction cluster into a casualty/strike cluster — link them via "lateralConnections" (Job 3) instead!
  • Example of FORBIDDEN merge #3 (Parallel Domestic / Corporate Releases Across Different Countries or Entities): NEVER merge two clusters that report parallel domestic economic indicators (e.g. "UK Inflation Rises to 3.5%" + "Canada Inflation Rises to 3.1%" + "Japan Core Inflation Surges to 2.1%"), budgets, court rulings, elections, or corporate earnings in DIFFERENT countries or for DIFFERENT companies/central banks — those are separate national/corporate releases and belong ONLY in "lateralConnections" (Job 3), NEVER in "merges"!
  • Example of FORBIDDEN merge #4 (Parallel Weather Systems, Sports Games, Aviation/Crime Incidents, or Market/Company Stories With Different Subjects or Locations): NEVER merge two clusters about different named storms or weather systems in different countries/oceans (e.g. UK "Storm Austen and Storm Boelo" vs "Severe Weather in Australia" vs Canadian "Subtropical Storm Josephine"), different sports matches in the same league (e.g. "Aston Villa Defeats Man City" vs "Tottenham Defeats Chelsea", or "Knicks" vs "76ers"), unrelated aviation/drone incidents ("Tel Aviv Flight Diverted" vs "Drone Explodes in Lithuania"), or a broad market wrap ("Global Stocks Tumble") with a single company's funding round ("OpenAI Nears $30B Funding"). NEVER stitch two separate events together using "Simultaneously," "Concurrently," or "Meanwhile,"!
  • Example of FORBIDDEN merge #5 (Earlier Campaign Episode vs. Election-Day Voting): NEVER merge an earlier campaign-trail episode from days prior (such as "Lula and Bolsonaro Spar in Debate" or "Lula Fast-Tracks Welfare Payments") with the general Election-Day voting cluster ("Brazil Holds High-Stakes Presidential Runoff Election") — keep each milestone separate and link them in "lateralConnections" (Job 3)!
  • Example of VALID merge #1: Two clusters reporting the exact same physical event under slightly different regional labels (e.g. "Deadly Floods Strike Eastern Spain" + "Deadly Flash Flooding Strikes Catalonia", or "Houthi Attack Kills 53 in Yemen" + "Houthi Missile Strikes on Aden") MUST be merged in "merges"!
  • Example of VALID merge #2 (Same-Decision Policy Action + Leader Defense): If one cluster reports a specific government policy decision, waiver, or order (e.g. "U.S. Cuts Russia Sanctions and Rifts With Ukraine") and another cluster in the same window reports the leader's public remarks defending, announcing, or explaining that EXACT SAME decision (e.g. "Trump Defends Russia Sanctions Waiver"), they are the SAME specific policy event and MUST be merged in "merges" (never left separate in "lateralConnections")!
  • Example of VALID merge #3 (Direct Diplomatic/Rhetorical Exchange — Criticism + Target Leader Counter-Rebuke): If an earlier cluster specifically reports foreign leaders or observers criticizing a country/leader over an event (e.g. "International Observers React to French Unrest" or "Trump Remarks on France Riots and Immigration") and a subsequent cluster reports the targeted leader directly rebuking or responding to those exact remarks (e.g. "Macron Slams Foreign Leaders Over Riot Comments"), they are chronological stages of the EXACT SAME diplomatic war-of-words and MUST be merged in "merges" with "updateType": "material_shift" (while keeping the separate on-the-ground domestic street-protest cluster linked via "lateralConnections")!
  • Example of VALID merge #4 (Same-Announcement Dual-Facet Split — Market/Leak Reaction + Official Substantive Release, or Umbrella-vs-Specific Twin): If one cluster captures the initial data leak, rumor, or stock/market reaction to a specific clinical trial, scientific study, earnings report, or corporate announcement (e.g. "Moderna Stock Plummets Following Cancer Vaccine Leak") and another cluster captures the substantive clinical, scientific, or product findings of that EXACT SAME trial/announcement (e.g. "Global Pharmaceutical Firms Launch Advanced Cancer Vaccines" covering the same personalized mRNA melanoma vaccine trial, or "Global IT Disruption Caused by Critical Software Flaw" + "PHP Vulnerabilities Force Websites Offline"), they are two facets of the EXACT SAME underlying event and MUST be merged in "merges" with "updateType": "material_shift" (updating "story" to name the specific actor/entity and substantive outcome), NEVER left split in "lateralConnections"!
- If no two clusters report the exact same specific incident or direct rhetorical exchange, return "merges": [].
- For any valid merge, only set "updateType": "material_shift" if the newer cluster introduces a strictly subsequent chronological phase that crosses a State-Envelope boundary (or executes a direct head-of-state counter-rebuke to prior foreign criticism); otherwise set "updateType": "clarification" (deduplication).

JOB 2 — "inPlaceDevelopments" (Evaluating [CANDIDATE IN-PLACE UPDATE] Dispatches — Eligible Indices: ${pendingPromptIndices.length > 0 ? `[${pendingPromptIndices.join(', ')}]` : 'NONE (return "inPlaceDevelopments": [])'}):
Evaluate ONLY clusters that have a "[CANDIDATE IN-PLACE UPDATE]" line (strictly limited to indices ${pendingPromptIndices.length > 0 ? `[${pendingPromptIndices.join(', ')}]` : '[]'}):
- NEVER include any cluster index that does not have a "[CANDIDATE IN-PLACE UPDATE]" line!
- OFF-TOPIC / PARALLEL-COUNTRY CANDIDATE REJECTION: If a "[CANDIDATE IN-PLACE UPDATE]" dispatch is actually about a DIFFERENT country's domestic metric/budget/court, a DIFFERENT company, or a separate unrelated incident that only matched on generic words (e.g. a Bank of Japan or Statistics Canada inflation dispatch attached to a UK inflation cluster, or a Brazilian budget dispatch attached to a US deficit cluster), IGNORE that off-topic dispatch completely (and if no other genuinely on-topic dispatches remain, set "updateType": "none"). NEVER stitch a separate country's or company's domestic news into the cluster with "Concurrently..." or "Meanwhile..."!
- If the new dispatches are redundant with the existing headline, summary, or [PRIOR RECORDED HISTORY], omit the cluster (or set "updateType": "none").
- Otherwise, generate "developmentNote" and "stateBoundaryCrossed" first, then set "updateType": "clarification" | "material_shift" using the State-Envelope Meta-Rule and Disjunctive Batch Principle.

JOB 3 — "lateralConnections" (Interacting / Same-Campaign / Same-Theatre Clusters That Must Stay Separate):
Identify pairs of DISTINCT clusters that share a political campaign, country backdrop, or causal interaction without being the same specific incident (e.g. separate policy milestones ahead of Brazil's runoff election, or linking a domestic street-protest cluster to a separate diplomatic commentary cluster about those protests):
- Keep them as separate clusters (NEVER put them in "merges"), and record their connection here.
- ANTI-SUPER-NODE RULE: NEVER link two clusters in "lateralConnections" merely because they mention the same head of state, administration, or public figure (e.g. NEVER link a local property, golf course, or lifestyle story to international war diplomacy, sanctions, or foreign elections). Both clusters in a lateralConnection must operate in the same geopolitical theater, economic sector, or policy/judicial domain.

Clusters:
${lines}${pairHintBlock}

Return ONLY valid JSON in this exact field order (use "merges": [] if no two clusters are the exact same incident):
{
  "merges": [
    {
      "indices": [13, 14],
      "sharedSpecificIncident": "Name the single specific incident/bill/study both clusters report on (never a broad country or election campaign)",
      "developmentNote": "Pure chronological delta (8-16 words max, NO 'following/after...' recap of prior steps). For clarification: 1-2 telegraphic fragments separated by '; '. For material_shift: 1 crisp delta sentence.",
      "stateBoundaryCrossed": "State which irreversible envelope boundary was crossed (Spatial/Sovereign Border, Executed Legal/Institutional Regime, Outcome Reversal), or 'None — in-phase delta/proposal'",
      "updateType": "clarification" | "material_shift",
      "story": "Updated 4-8 Word Title Keeping Origin Anchor + Key Shift (only used if material_shift)",
      "summary": "1-2 sentence detail-packed cumulative synthesis weaving the integrated chronological journey with exact named institutions/actors, specific venues/cities, concrete figures, and mechanisms (zero meta-coverage filler)."
    }
  ],
  "inPlaceDevelopments": [
    {
      "index": 4,
      "developmentNote": "Pure chronological delta stating ONLY what changed at this timestamp (8-16 words max, NO 'following/after...' recap of earlier milestones). For clarification: 1-2 telegraphic fragments separated by '; '. For material_shift: 1 crisp delta sentence.",
      "stateBoundaryCrossed": "State which irreversible envelope boundary was crossed (Spatial/Sovereign Border, Executed Legal/Institutional Regime, Outcome Reversal), or 'None — in-phase delta/proposal'",
      "updateType": "none" | "clarification" | "material_shift",
      "story": "Updated 4-8 Word Title (required for material_shift; for clarification, keep existing story UNLESS an explicit number/tally in the existing headline is now superseded by the updated summary)",
      "summary": "1-2 sentence detail-packed cumulative synthesis weaving the integrated chronological journey with exact named institutions/actors, specific venues/cities, concrete figures, and mechanisms (zero meta-coverage filler)."
    }
  ],
  "lateralConnections": [
    {
      "indices": [0, 9],
      "howItConnects": "1 concise sentence explaining how these two independent stories directly influence or interact with each other."
    }
  ]
}`;

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const activeTiers = getOrderedKeyTiers(apiKey);
    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
    let parsed = null;
    for (const modelName of modelsToTry) {
      if (parsed) break;
      for (const keyObj of activeTiers) {
        if (parsed) break;
        try {
          const genAI = new GoogleGenerativeAI(keyObj.key);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              ...(modelName === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {})
            }
          });
          const resp = await model.generateContent(prompt);
          parsed = JSON.parse(resp.response.text().trim());
          break;
        } catch (tierErr) {
          const msg = String(tierErr.message || tierErr);
          const isQuotaOrRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit');
          console.warn(`[Clusters] Consolidation pass warning with ${modelName} [${keyObj.tier} key]: ${msg}`);
          if (keyObj.tier === 'FREE' && isQuotaOrRateLimit && activeTiers.length > 1) {
            freeKeyExhaustedThisRun = true;
            console.log('[Clusters] Switching consolidation pass to PAID fallback key...');
          }
        }
      }
    }

    const mapPromptIdx = (pIdx) => (Number.isInteger(pIdx) && pIdx >= 0 && pIdx < activeOrigIndices.length) ? activeOrigIndices[pIdx] : -1;

    const rawMerges = (Array.isArray(parsed?.merges) ? parsed.merges : []).map(m => ({
      ...m,
      indices: Array.isArray(m?.indices) ? m.indices.map(mapPromptIdx).filter(i => i >= 0) : []
    }));
    const inPlaceDevs = (Array.isArray(parsed?.inPlaceDevelopments) ? parsed.inPlaceDevelopments : []).map(d => ({
      ...d,
      index: mapPromptIdx(d?.index)
    }));
    const lateralLinks = (Array.isArray(parsed?.lateralConnections) ? parsed.lateralConnections : []).map(l => ({
      ...l,
      indices: Array.isArray(l?.indices) ? l.indices.map(mapPromptIdx).filter(i => i >= 0) : []
    }));
    const auditLogEntries = [];

    // Build set of laterally connected index pairs so a pair in lateralConnections can never also be merged
    const lateralPairKeys = new Set();
    for (const link of lateralLinks) {
      const idxs = (link?.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < clusters.length);
      if (idxs.length >= 2) {
        lateralPairKeys.add(`${Math.min(idxs[0], idxs[1])}:${Math.max(idxs[0], idxs[1])}`);
      }
    }
    const merges = rawMerges.filter(m => {
      if (!m || m.updateType === 'none') return false;
      const idxs = (m.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < clusters.length);
      if (idxs.length < 2) return false;
      const pairKey = `${Math.min(idxs[0], idxs[1])}:${Math.max(idxs[0], idxs[1])}`;
      if (lateralPairKeys.has(pairKey)) {
        const urlsA = new Set((clusters[idxs[0]]?.coverage || []).map(a => canonicalUrl(a.link)).filter(Boolean));
        const urlsB = new Set((clusters[idxs[1]]?.coverage || []).map(a => canonicalUrl(a.link)).filter(Boolean));
        let sharedU = 0;
        for (const u of urlsB) { if (urlsA.has(u)) sharedU++; }
        const minU = Math.min(urlsA.size || 1, urlsB.size || 1);
        if (sharedU < 3 && (sharedU < 2 || (sharedU / minU) < 0.35)) return false;
        lateralPairKeys.delete(pairKey);
      }
      // Corpus IDF specificity guard: reject any LLM index slip or broad-theatre over-merge
      // where merged clusters do not share at least 1 low-document-frequency specific stem (<= 4% of active clusters)
      const maxSpecificMergeClusterDf = Math.max(6, Math.min(16, Math.round(meta.length * 0.04)));
      const isBroadCorpusStem = (s) => (clusterStemFreq.get(s) || 0) > maxSpecificMergeClusterDf;
      const metaA = meta[idxs[0]];
      const metaB = meta[idxs[1]];
      if (metaA && metaB) {
        const sharedTitle = [...metaA.titleStems].filter(s => metaB.titleStems.has(s));
        const sharedSpecificTitle = sharedTitle.filter(s => !isBroadCorpusStem(s));
        const sharedAll = [...metaA.allStems].filter(s => metaB.allStems.has(s));
        const sharedSpecificAll = sharedAll.filter(s => !isBroadCorpusStem(s));
        if ((sharedTitle.length < 1 && sharedAll.length < 2) || (sharedSpecificTitle.length < 1 && sharedSpecificAll.length < 2)) {
          console.warn(`[Clusters] Rejected low-IDF/broad-corpus merge between [${idxs[0]}] "${clusters[idxs[0]]?.story}" and [${idxs[1]}] "${clusters[idxs[1]]?.story}"`);
          return false;
        }
      }
      const clA = clusters[idxs[0]];
      const clB = clusters[idxs[1]];
      if (clA && clB) {
        const urlsA = new Set((clA.coverage || []).map(a => canonicalUrl(a.link)).filter(Boolean));
        const urlsB = new Set((clB.coverage || []).map(a => canonicalUrl(a.link)).filter(Boolean));
        let sharedUrlsCount = 0;
        for (const u of urlsB) { if (urlsA.has(u)) sharedUrlsCount++; }
        if (sharedUrlsCount === 0 && hasDisjointProperSubjectMergeConflict(clA, clB, clusterStemFreq, maxSpecificMergeClusterDf)) {
          console.warn(`[Clusters] Rejected disjoint proper-subject / geographic / episodic merge between [${idxs[0]}] "${clA.story}" and [${idxs[1]}] "${clB.story}"`);
          return false;
        }
        const hasParallelStitchAdv = /\b(simultaneously|concurrently|meanwhile|in a separate\s+(?:incident|development|match|game|event)|separately,)\b/i.test(`${m.summary || ''} ${m.developmentNote || ''}`);
        if (sharedUrlsCount === 0 && hasParallelStitchAdv) {
          const fA = extractEventFactAttributes(clA);
          const fB = extractEventFactAttributes(clB);
          const shHeadProp = [...fA.headProperStems].filter(s => fB.headProperStems.has(s));
          if (shHeadProp.length === 0) {
            console.warn(`[Clusters] Rejected parallel-event ("Simultaneously/Concurrently") stitch merge between [${idxs[0]}] "${clA.story}" and [${idxs[1]}] "${clB.story}"`);
            return false;
          }
        }
      }
      return true;
    });

    // Apply verified in-place developments & clarifications first (ONLY for clusters that actually have a _pendingUpdate!)
    const inPlaceByIdx = new Map();
    for (const dev of inPlaceDevs) {
      if (dev?.updateType === 'none') {
        if (Number.isInteger(dev?.index) && clusters[dev.index]?._pendingUpdate) {
          clusters[dev.index]._pendingUpdate._acceptedOrEvaluated = true;
        }
        continue;
      }
      if (Number.isInteger(dev?.index) && dev.index >= 0 && dev.index < clusters.length && (dev.summary || dev.story)) {
        const targetCl = clusters[dev.index];
        if (!targetCl || !targetCl._pendingUpdate || !Array.isArray(targetCl._pendingUpdate.addedHeadlines) || targetCl._pendingUpdate.addedHeadlines.length === 0) {
          continue;
        }
        inPlaceByIdx.set(dev.index, dev);
      }
    }

    let materialInPlaceCount = 0;
    let clarificationInPlaceCount = 0;
    const maxSpecificDevClusterDf = Math.max(6, Math.min(16, Math.round(meta.length * 0.04)));

    for (const [idx, dev] of inPlaceByIdx.entries()) {
      const c = clusters[idx];
      let noteText = (dev.developmentNote && dev.developmentNote.trim()) || '';
      // Strip trailing backstory recap clauses ("following the weekend of...", "after earlier clashes...")
      noteText = noteText
        .replace(/\s+(?:following|after|amid|in the wake of)\s+(?:the\s+)?(?:weekend|days|weeks|earlier|initial|widespread|ongoing)\s+[^.;]+$/i, '')
        .trim();

      // Programmatic Commitment Gate: if noteText only describes weighing/pushing/considering a measure without enacting/crossing borders, downgrade to clarification
      const isPreludeOnly = /\b(weigh(?:s|ed|ing)?|push(?:es|ed|ing)?\s+for|consider(?:s|ed|ing)?|mull(?:s|ed|ing)?|debate(?:s|d)?|propose(?:s|d)?)\b/i.test(noteText) &&
        !/\b(spread|expand|cross|enact|impos|arrest|indict|charg|releas|struck|launch|clear)\w*/i.test(noteText);
      const uType = (dev.updateType === 'material_shift' && !isPreludeOnly) ? 'material_shift' : 'clarification';
      const newSummary = (dev.summary && dev.summary.trim()) || c.summary;

      // Skip routine restatements ("Re-emphasizes...", "Reaffirms...") that add no new factual detail
      if (uType === 'clarification' && /^(re-?emphasiz|reaffirm|reiterat|continu(es|ed) to report)/i.test(noteText)) {
        if (c._pendingUpdate) c._pendingUpdate._acceptedOrEvaluated = true;
        continue;
      }

      // Coherence guard against off-by-one index slips, single-country/entity tangents & off-topic wire roundups:
      // Ensure noteText is grounded in the cluster's added/existing coverage dispatches and that the updated step
      // (noteText + dev.story + newSummary) shares >= 1 specific stem with the cluster headline (or >= 2 specific stems with its summary/coverage).
      const BROAD_DEV_STEMS = new Set([
        "saudi","arabia","houthi","yemen","iran","tehran","israel","netany","palest","west","bank","gaza","lebanon","syria",
        "egypt","turk","tunisi","tunis","albani","tirana","brazil","ecuado","argent","colomb","venezu","mexic","canad",
        "austral","sydney","japan","tokyo","kore","taiwan","indone","malays","india","pakist","nigeria","kenya","sudan",
        "congo","south","africa","ukrain","ukrainian","russia","russian","zelens","zelensky","zelenskyy","putin","moscow",
        "china","chines","beijin","trump","biden","ameri","americ","united","state","washin","europ","european","britain",
        "british","london","engl","scotla","irelan","france","french","paris","german","berlin","ital","rome","milan",
        "spain","madrid","poland","greece","sweden","nether","belgi","switze","austri","romani","bulgar",
        "protes","riot","unrest","strik","attack","crisis","forces","forc","milit","army","servic","draft","govern",
        "minist","presid","offici","polic","secur","suprem","court","appeal","federa","judg","justic","senten","offend",
        "prison","crimin","family","ban","uncons","budget","fiscal","treasu","econom","financ","campai","midter","elect",
        "voter","senat","congre","parlia","citize","disrup","restric","impos","prompt","order","escalat","report","update",
        "infla","septem","octobe","novemb","decemb","januar","februa","august","annual","quarte","percen","rate","intere","price","pric","centra","tighte"
      ]);
      const isSpecificDevStem = (s) => !BROAD_DEV_STEMS.has(s) && (clusterStemFreq.get(s) || 0) <= maxSpecificDevClusterDf;
      if (hasDisjointSovereignCountryConflict(
        `${c.story || ''} ${c.summary || ''}`,
        `${noteText} ${(c._pendingUpdate?.addedHeadlines || []).join(' ')}`,
        c.story || '',
        noteText,
        clusterStemFreq,
        maxSpecificDevClusterDf
      )) {
        console.warn(`[Clusters] Rejected disjoint sovereign-country domestic update on cluster [${idx}] "${c.story}": "${noteText}"`);
        continue;
      }
      const cFacts = extractEventFactAttributes(c);
      if (hasEpisodicPhaseMismatch(
        c.story || '',
        cFacts.minMs,
        `${noteText} ${(c._pendingUpdate?.addedHeadlines || []).join(' ')}`,
        c._pendingUpdate?.newestAddedMs || 0
      )) {
        console.warn(`[Clusters] Rejected episodic phase-mismatch update on cluster [${idx}] "${c.story}": "${noteText}"`);
        continue;
      }
      const headStems = extractCoherenceStems(c.story || "");
      const specificHeadStems = new Set(headStems.filter(isSpecificDevStem));
      const anchorHeadStems = specificHeadStems.size > 0 ? specificHeadStems : new Set(headStems);
      const covContextText = (c.coverage || []).slice(0, 10).map(a => `${a.title || ''} ${a.description || ''}`).join(' ');
      const addedCovStems = new Set(extractCoherenceStems((c._pendingUpdate?.addedHeadlines || []).join(' ')));
      const allClusterStems = new Set(extractCoherenceStems(`${c.story || ""} ${c.summary || ""} ${covContextText}`));
      const specificSumStems = new Set([...allClusterStems].filter(isSpecificDevStem));
      const noteOnlyStems = extractCoherenceStems(noteText);
      const stepCombinedStems = extractCoherenceStems(`${noteText} ${dev.story || ''} ${newSummary || ''}`);
      if (noteOnlyStems.length > 0 && anchorHeadStems.size > 0) {
        const noteGroundedInCov = noteOnlyStems.filter(s => addedCovStems.has(s) || allClusterStems.has(s)).length;
        const matchesHead = noteOnlyStems.some(s => anchorHeadStems.has(s)) ||
          (noteGroundedInCov >= 2 && stepCombinedStems.some(s => anchorHeadStems.has(s)));
        const matchesSumCount = Math.max(
          noteOnlyStems.filter(s => specificSumStems.has(s)).length,
          noteGroundedInCov >= 2 ? stepCombinedStems.filter(s => specificSumStems.has(s)).length : 0
        );
        const totalSharedWithCluster = new Set(stepCombinedStems.filter(s => allClusterStems.has(s))).size;
        const isSingleEntityTangent = headStems.length >= 3 && allClusterStems.size >= 5 && (totalSharedWithCluster <= 1 || noteGroundedInCov === 0) && matchesSumCount <= 1;
        if (noteGroundedInCov === 0 || (!matchesHead && matchesSumCount < 2) || isSingleEntityTangent) {
          console.warn(`[Clusters] Rejected off-topic / single-entity tangent on cluster [${idx}] "${c.story}": "${noteText}" (matchesHead=${matchesHead}, matchesSumCount=${matchesSumCount}, noteGroundedInCov=${noteGroundedInCov}, totalShared=${totalSharedWithCluster})`);
          continue;
        }
      }

      // If this was an initial post-strip / umbrella-title grounding pass on a newly formed v1 cluster,
      // replace its v1 story, slug, summary, and initial history entry in place without bumping version!
      if (c._pendingUpdate?.isInitialGrounding) {
        const groundedStory = (dev.story && dev.story.trim()) || c.story;
        const groundedSlug = slugify(groundedStory);
        c.id = groundedSlug;
        c.story = groundedStory;
        c.summary = newSummary;
        delete c.summarySynthesizedSig;
        if (Array.isArray(c.evolutionHistory) && c.evolutionHistory.length > 0) {
          c.evolutionHistory[0].headline = groundedStory;
          c.evolutionHistory[0].summary = newSummary;
        }
        c._pendingUpdate._acceptedOrEvaluated = true;
        continue;
      }

      const hist = Array.isArray(c.evolutionHistory) ? c.evolutionHistory : [];
      const noteStems = extractCoherenceStems(noteText);

      // Deterministic Baseline-Subtraction Guard: if >= 60% of the substantive stems in `noteText` (excluding outlet names)
      // were ALREADY present in the cluster's existing story + summary + prior evolution notes (and no new numbers are introduced),
      // reject the update as a syndication echo!
      const priorBaselineText = `${c.story || ''} ${c.summary || ''} ${(hist || []).map(h => h?.note || '').join(' ')}`;
      const priorBaselineStems = new Set(extractCoherenceStems(priorBaselineText));
      const priorBaselineNums = new Set(priorBaselineText.match(/\b\d+(?:[.,]\d+)?\b/g) || []);
      const noteNums = (noteText.match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter(n => !priorBaselineNums.has(n));
      const outletNameStems = new Set(extractCoherenceStems(NEWS_SOURCES.map(s => s.name).join(' ')));
      const substantiveNoteStems = noteStems.filter(s => !outletNameStems.has(s));
      if (substantiveNoteStems.length >= 1) {
        const alreadyInBaseline = substantiveNoteStems.filter(s => priorBaselineStems.has(s)).length;
        const novelStemCount = substantiveNoteStems.length - alreadyInBaseline;
        const overlapRatio = alreadyInBaseline / substantiveNoteStems.length;
        const maxAllowedOverlap = uType === 'clarification' ? 0.60 : 0.72;
        if ((noteNums.length === 0 && novelStemCount < 2) || (noteNums.length === 0 && overlapRatio >= maxAllowedOverlap)) {
          console.log(`[Clusters] Suppressed syndication echo on "${c.story}": "${noteText}" (${alreadyInBaseline}/${substantiveNoteStems.length} stems already in baseline)`);
          if (c._pendingUpdate) c._pendingUpdate._acceptedOrEvaluated = true;
          continue;
        }
      }

      // Ensure strictly monotonic timeline timestamps so a late-ingested article with an older RSS pubDate
      // never inserts an update earlier than prior steps in evolutionHistory
      const rawTsMs = c._pendingUpdate?.newestAddedMs || c.newestMs || Date.now();
      const maxPrevHistMs = hist.reduce((max, h) => {
        const t = h?.timestamp ? new Date(h.timestamp).getTime() : 0;
        return (!isNaN(t) && t > max) ? t : max;
      }, 0);
      const ts = new Date(Math.max(rawTsMs, maxPrevHistMs > 0 ? maxPrevHistMs + 60000 : 0)).toISOString();

      // Guard against no-op, duplicate timestamp, or paraphrased note already in evolutionHistory (Novel-Delta Coverage + Shared-Number check)
      const initBaseText = `${hist[0]?.headline || ''} ${hist[0]?.summary || ''}`;
      const initBaseStems = new Set(extractCoherenceStems(initBaseText));
      const initBaseNums = new Set((initBaseText.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(n => n.replace(/,/g, '')));
      const candNovelStems = substantiveNoteStems.filter(s => !initBaseStems.has(s));
      const candAllNums = (noteText.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(n => n.replace(/,/g, '')).filter(n => Number(n) > 1 && !/^(18|19|20)\d{2}$/.test(n));
      const alreadyRecorded = hist.some(h => {
        if (h.timestamp && h.timestamp === ts) return true;
        if (noteText && h.note && h.note.toLowerCase() === noteText.toLowerCase()) return true;
        if (newSummary && h.summary && h.summary.toLowerCase() === newSummary.toLowerCase()) return true;
        if (substantiveNoteStems.length >= 2 && h.note && h.type !== 'initial') {
          const hStemsArr = extractCoherenceStems(h.note).filter(s => !outletNameStems.has(s));
          const hStems = new Set(hStemsArr);
          const hNovelSet = new Set(hStemsArr.filter(s => !initBaseStems.has(s)));
          const hNums = new Set(((h.note || '').match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(n => n.replace(/,/g, '')).filter(n => Number(n) > 1 && !/^(18|19|20)\d{2}$/.test(n)));
          const sharedNovelNums = candAllNums.filter(n => hNums.has(n) && !initBaseNums.has(n));
          const hasNewDisjointNum = candAllNums.some(n => !hNums.has(n) && !initBaseNums.has(n));
          const sharedNovel = candNovelStems.filter(s => hNovelSet.has(s)).length;
          const sharedAll = substantiveNoteStems.filter(s => hStems.has(s)).length;
          const novelCoverage = candNovelStems.length > 0 ? (sharedNovel / candNovelStems.length) : 0;
          const allCoverage = substantiveNoteStems.length > 0 ? (sharedAll / substantiveNoteStems.length) : 0;
          if (
            (sharedNovelNums.length > 0 && !hasNewDisjointNum && (sharedNovel >= 2 || (sharedNovel >= 1 && novelCoverage >= 0.45) || sharedAll >= 2)) ||
            (!hasNewDisjointNum && sharedNovel >= 2 && novelCoverage >= 0.55) ||
            (!hasNewDisjointNum && sharedAll >= 3 && allCoverage >= 0.60)
          ) {
            return true;
          }
        }
        return false;
      });
      if (alreadyRecorded) {
        if (c._pendingUpdate) c._pendingUpdate._acceptedOrEvaluated = true;
        continue;
      }

      if (c._pendingUpdate) c._pendingUpdate._acceptedOrEvaluated = true;

      const beforeSnapshot = {
        id: c.id || slugify(c.story),
        version: typeof c.version === 'number' ? c.version : 1,
        story: c.story,
        summary: c.summary,
        outletCount: c.outletCount || (c.coverage || []).length || 1
      };

      // Helper to verify that a candidate headline retains >= 1 recognizable subject/place stem from the origin headline
      const originAnchorHeadline = hist[0]?.headline || c.story || '';
      const originAnchorStems = new Set(
        extractCoherenceStems(`${originAnchorHeadline} ${c.story || ''}`)
          .filter(s => !/^\d+$/.test(s) && !/^(kill|dead|die|halt|stop|prepar|hold|held|plan|weigh|mull|consider|spurs|spark|prompt|delay)$/.test(s))
      );
      const isHeadlineAnchorRecognizable = (candTitle) => {
        if (!candTitle || originAnchorStems.size === 0) return Boolean(candTitle);
        const candStems = extractCoherenceStems(candTitle);
        return candStems.some(s => originAnchorStems.has(s));
      };

      if (uType === 'material_shift') {
        materialInPlaceCount++;
        const oldSlug = c.id || slugify(c.story);
        const rawCandStory = (dev.story && dev.story.trim()) || c.story;
        const newStory = isHeadlineAnchorRecognizable(rawCandStory) ? rawCandStory : c.story;
        const newSlug = slugify(newStory);
        const evolvedIds = new Set(Array.isArray(c.evolvedFromIds) ? c.evolvedFromIds : []);
        if (oldSlug && oldSlug !== newSlug) evolvedIds.add(oldSlug);
        evolvedIds.delete(newSlug);

        c.id = newSlug;
        c.story = newStory;
        c.summary = newSummary;
        c.version = beforeSnapshot.version + 1;
        c.lastDevelopedAt = ts;
        c.developmentNote = noteText || `Story developed: ${newStory}`;
        if (evolvedIds.size > 0) c.evolvedFromIds = Array.from(evolvedIds);

        // Retroactive Prelude Demotion: if an earlier step in `hist` was marked `material_shift` while "weighing/pushing for"
        // the exact same measure now formally enacted in `noteText`, demote that earlier prelude step to `clarification`!
        const newNoteStems = new Set(extractCoherenceStems(c.developmentNote));
        for (let hi = 1; hi < hist.length; hi++) {
          const prevH = hist[hi];
          if (prevH.type === 'material_shift' && /\b(weigh|push|consider|mull|propos|prepar)/i.test(prevH.note || '')) {
            const prevStems = extractCoherenceStems(prevH.note || '');
            const shared = prevStems.filter(s => newNoteStems.has(s));
            if (shared.length >= 2) {
              prevH.type = 'clarification';
            }
          }
        }

        const afterSnapshot = {
          id: c.id,
          version: c.version,
          story: c.story,
          summary: c.summary,
          outletCount: beforeSnapshot.outletCount
        };

        hist.push({
          version: c.version,
          type: 'material_shift',
          timestamp: ts,
          batchConsolidatedAt: new Date().toISOString(),
          headline: c.story,
          summary: c.summary,
          beforeStory: beforeSnapshot.story,
          beforeSummary: beforeSnapshot.summary,
          outletCount: afterSnapshot.outletCount,
          note: c.developmentNote
        });
        c.evolutionHistory = hist.length > 20 ? [hist[0], ...hist.slice(-19)] : hist;

        auditLogEntries.push({
          timestamp: new Date().toISOString(),
          eventTimestamp: ts,
          updateType: 'material_shift',
          source: 'inPlaceDevelopment',
          before: beforeSnapshot,
          after: afterSnapshot,
          note: c.developmentNote,
          addedHeadlines: c._pendingUpdate?.addedHeadlines || []
        });
      } else {
        // 'clarification': summary refinement without bumping version.
        // If the existing headline (`c.story`) contains an explicit number/tally that was superseded in `newSummary`
        // (or if `dev.story` updated that headline number to match `newSummary`), synchronize `c.story` so the headline never contradicts the summary!
        clarificationInPlaceCount++;
        let updatedClarificationStory = c.story;
        const candidateClarStory = (dev.story && dev.story.trim()) || '';
        const oldStoryNums = (c.story || '').match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [];
        const newSummaryNums = new Set((newSummary || '').match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || []);
        const hasStaleHeadlineNumber = oldStoryNums.some(n => !newSummaryNums.has(n));
        // Also detect semantic status/verb contradictions between existing headline and updated summary
        const storyLower = (c.story || '').toLowerCase();
        const sumLower = (newSummary || '').toLowerCase();
        const hasSemanticContradiction = (
          (/\b(halts?|halted|stops?|stopped|blocks?|blocked|cancels?|canceled)\b/.test(storyLower) && /\b(pushed forward|pushing forward|proceeds?|proceeding|will officially begin|will begin|resumes?|resumed)\b/.test(sumLower)) ||
          (/\b(prepares?|preparing|plans?|planning|set to|gears? up)\b/.test(storyLower) && /\b(successfully launched|lifts? off|lifted off|completed|concluded|rejected|approved|enacted)\b/.test(sumLower)) ||
          (/\b(holds?|holding)\s+(referendum|election|vote)\b/.test(storyLower) && /\b(voters\s+(?:decisively\s+)?(?:reject|approve|elect|back)|official results confirm)\b/.test(sumLower)) ||
          (/\b(injured|wounded|hospitalized|critical)\b/.test(storyLower) && !/\b(dead|dies?|died|killed|fatal)\b/.test(storyLower) && /\b(died|dies|succumbed|passed away|killed)\b/.test(sumLower)) ||
          (/\b(stock|shares)\s+(plummet|plunge|sink|fall|drop|tumble|slump)s?\b/.test(storyLower) && (c.averageSentiment || 0) >= 0.20)
        );

        if (hasStaleHeadlineNumber || hasSemanticContradiction) {
          if (candidateClarStory && candidateClarStory !== c.story && isHeadlineAnchorRecognizable(candidateClarStory)) {
            updatedClarificationStory = candidateClarStory;
          } else if (hasStaleHeadlineNumber) {
            const noteNums = (noteText || '').match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [];
            const replacementNum = noteNums.find(n => newSummaryNums.has(n) && !oldStoryNums.includes(n));
            if (replacementNum && oldStoryNums.length === 1) {
              updatedClarificationStory = c.story.replace(new RegExp(`\\b${oldStoryNums[0]}\\b`), replacementNum);
            }
          }
        }

        if (updatedClarificationStory !== c.story) {
          const oldSlug = c.id || slugify(c.story);
          const newSlug = slugify(updatedClarificationStory);
          const evolvedIds = new Set(Array.isArray(c.evolvedFromIds) ? c.evolvedFromIds : []);
          if (oldSlug && oldSlug !== newSlug) evolvedIds.add(oldSlug);
          evolvedIds.delete(newSlug);
          c.id = newSlug;
          c.story = updatedClarificationStory;
          if (evolvedIds.size > 0) c.evolvedFromIds = Array.from(evolvedIds);
        }

        c.summary = newSummary;
        const afterSnapshot = {
          id: c.id || slugify(c.story),
          version: beforeSnapshot.version,
          story: c.story,
          summary: c.summary,
          outletCount: beforeSnapshot.outletCount
        };
        hist.push({
          version: beforeSnapshot.version,
          type: 'clarification',
          timestamp: ts,
          batchConsolidatedAt: new Date().toISOString(),
          headline: c.story,
          summary: c.summary,
          beforeStory: beforeSnapshot.story,
          beforeSummary: beforeSnapshot.summary,
          outletCount: afterSnapshot.outletCount,
          note: noteText || 'Factual details and figures clarified across incoming dispatches'
        });
        c.evolutionHistory = hist.length > 20 ? [hist[0], ...hist.slice(-19)] : hist;

        auditLogEntries.push({
          timestamp: new Date().toISOString(),
          eventTimestamp: ts,
          updateType: 'clarification',
          source: 'inPlaceClarification',
          before: beforeSnapshot,
          after: afterSnapshot,
          note: noteText || 'Factual details clarified without phase change',
          addedHeadlines: c._pendingUpdate?.addedHeadlines || []
        });
      }
    }

    // Attach lateral connections between distinct interacting clusters without collapsing them
    const GENERIC_LAT_TEMPLATE_STEMS = new Set(['record','fatal','kill','dead','death','deadli','milit','soldi','base','train','charg','releas','crash','fire','attack','protes','court','suprem','judg','polic','arrest','strik','launch','approv','reject','elect','voter','campai','senat','congre','parlia','govern','offici','minist','presid','invest','probe','threat','crisis','emerg','warn','disrup','cancel','delay','announ','reveal','confirm','report','discov','found','scient','astron','study','shot','flood','market','breach','data','center','centr','project','appeal','lawsui','disput','petition','review','order','scruti','race','deport','title','defend','suspec','driver','withou','stampa','festiv','crimina','tariff','spark','latest']);
    for (const link of lateralLinks) {
      const idxs = (link?.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < clusters.length);
      if (idxs.length < 2 || !link.howItConnects) continue;
      const [idxA, idxB] = idxs;
      if (idxA === idxB) continue;
      const metaA = meta[idxA];
      const metaB = meta[idxB];
      if (metaA && metaB) {
        const sharedSpecific = [...metaA.titleStems].filter(s => metaB.allStems.has(s) && !GENERIC_LAT_TEMPLATE_STEMS.has(s));
        const sharedNonSuperNode = [...metaA.allStems].filter(s => metaB.allStems.has(s) && !GENERIC_LAT_TEMPLATE_STEMS.has(s) && (clusterStemFreq.get(s) || 0) <= 6);
        if (sharedSpecific.length === 0 || sharedNonSuperNode.length === 0) {
          console.warn(`[Clusters] Rejected generic-template or super-node-only lateral connection between "${clusters[idxA]?.story}" and "${clusters[idxB]?.story}"`);
          continue;
        }
      }
      const clA = clusters[idxA];
      const clB = clusters[idxB];
      const idA = clA.id || slugify(clA.story);
      const idB = clB.id || slugify(clB.story);
      const reason = String(link.howItConnects).trim();

      if (!Array.isArray(clA.lateralConnections)) clA.lateralConnections = [];
      if (!clA.lateralConnections.some(x => x.clusterId === idB)) {
        clA.lateralConnections.push({ clusterId: idB, headline: clB.story, howItConnects: reason });
      }

      if (!Array.isArray(clB.lateralConnections)) clB.lateralConnections = [];
      if (!clB.lateralConnections.some(x => x.clusterId === idA)) {
        clB.lateralConnections.push({ clusterId: idA, headline: clA.story, howItConnects: reason });
      }
    }

    const reconcileFinalLateralConnections = (finalList) => {
      const byId = new Map();
      const stemsById = new Map();
      const finalStemFreq = new Map();
      for (const cl of finalList) {
        const cid = cl.id || slugify(cl.story);
        byId.set(cid, cl);
        if (Array.isArray(cl.evolvedFromIds)) {
          cl.evolvedFromIds.forEach(oldId => {
            if (oldId && !byId.has(oldId)) byId.set(oldId, cl);
          });
        }
        const tStems = new Set(extractCoherenceStems(cl.story || ''));
        const aStems = new Set(extractCoherenceStems(`${cl.story || ''} ${cl.summary || ''} ${(cl.coverage || []).slice(0, 4).map(a => a.title || '').join(' ')}`));
        stemsById.set(cid, { tStems, aStems });
        for (const s of aStems) finalStemFreq.set(s, (finalStemFreq.get(s) || 0) + 1);
      }
      for (const cl of finalList) {
        if (!Array.isArray(cl.lateralConnections) || cl.lateralConnections.length === 0) continue;
        const cid = cl.id || slugify(cl.story);
        const selfStems = stemsById.get(cid);
        const seen = new Set([cid]);
        const cleaned = [];
        for (const lc of cl.lateralConnections) {
          if (!lc?.clusterId) continue;
          const target = byId.get(lc.clusterId);
          if (!target) continue;
          const tid = target.id || slugify(target.story);
          if (seen.has(tid)) continue;
          const targetStems = stemsById.get(tid);
          if (selfStems && targetStems) {
            const shSpec = [...selfStems.tStems].filter(s => targetStems.aStems.has(s) && !GENERIC_LAT_TEMPLATE_STEMS.has(s));
            const shRev = [...targetStems.tStems].filter(s => selfStems.aStems.has(s) && !GENERIC_LAT_TEMPLATE_STEMS.has(s));
            const shNonSuper = [...selfStems.aStems].filter(s => targetStems.aStems.has(s) && !GENERIC_LAT_TEMPLATE_STEMS.has(s) && (finalStemFreq.get(s) || 0) <= 7);
            if ((shSpec.length === 0 && shRev.length === 0) || shNonSuper.length === 0) continue;
          }
          seen.add(tid);
          cleaned.push({
            clusterId: tid,
            headline: target.story || lc.headline,
            howItConnects: lc.howItConnects
          });
          if (!Array.isArray(target.lateralConnections)) target.lateralConnections = [];
          if (!target.lateralConnections.some(x => (byId.get(x.clusterId)?.id || x.clusterId) === cid)) {
            target.lateralConnections.push({
              clusterId: cid,
              headline: cl.story,
              howItConnects: lc.howItConnects
            });
          }
        }
        if (cleaned.length > 0) {
          cl.lateralConnections = cleaned.slice(0, 4);
        } else {
          delete cl.lateralConnections;
        }
      }
      return finalList;
    };

    if (merges.length === 0) {
      appendClusterUpdateAuditLog(auditLogEntries);
      if (materialInPlaceCount > 0 || clarificationInPlaceCount > 0) {
        console.log(`[Clusters] Verified ${materialInPlaceCount} material shifts and ${clarificationInPlaceCount} silent clarifications.`);
      }
      return reconcileFinalLateralConnections(clusters);
    }

    const consumed = new Set();
    const result = [];

    for (const m of merges) {
      const validIdx = (m.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < clusters.length && !consumed.has(i));
      if (validIdx.length < 2) continue;
      validIdx.forEach(i => consumed.add(i));

      const group = validIdx.map(i => clusters[i]);
      const evolvedIds = new Set();
      const mergedSeenKeys = new Set();
      const mergedGroupLateral = [];
      const seenGroupLateralIds = new Set();
      const rawCov = [];
      let maxNewestMs = 0;
      let maxVersion = 1;
      let bestLastDevelopedAt = null;
      let bestDevelopmentNote = null;

      // Helper to find the earliest article timestamp in a cluster
      const getEarliestMs = (cl) => {
        const times = (cl.coverage || []).map(a => a.pubDate ? new Date(a.pubDate).getTime() : NaN).filter(t => !isNaN(t) && t > 0);
        if (times.length > 0) return Math.min(...times);
        const h0 = cl.evolutionHistory?.[0]?.timestamp ? new Date(cl.evolutionHistory[0].timestamp).getTime() : NaN;
        return !isNaN(h0) ? h0 : Infinity;
      };

      // Pick the chronologically earliest cluster as the historical origin anchor, and largest for fallback metadata
      const originAnchor = [...group].sort((a, b) => getEarliestMs(a) - getEarliestMs(b))[0] || group[0];
      const largestAnchor = [...group].sort((a, b) => (b.outletCount || 0) - (a.outletCount || 0))[0] || group[0];
      const richestHistoryAnchor = [...group].sort((a, b) => ((b.evolutionHistory?.length || 0) - (a.evolutionHistory?.length || 0)) || (getEarliestMs(a) - getEarliestMs(b)))[0] || originAnchor;
      const latestCluster = [...group].sort((a, b) => (b.newestMs || 0) - (a.newestMs || 0))[0] || group[0];
      const chronologicalSpanMs = Math.max(0, (latestCluster.newestMs || 0) - getEarliestMs(originAnchor));

      for (const g of group) {
        const gSlug = g.id || slugify(g.story);
        if (gSlug) evolvedIds.add(gSlug);
        if (Array.isArray(g.evolvedFromIds)) {
          g.evolvedFromIds.forEach(id => evolvedIds.add(id));
        }
        if (Array.isArray(g.seenArticleKeys)) {
          g.seenArticleKeys.forEach(k => mergedSeenKeys.add(k));
        }
        if (Array.isArray(g.lateralConnections)) {
          for (const lc of g.lateralConnections) {
            if (lc?.clusterId && !seenGroupLateralIds.has(lc.clusterId)) {
              seenGroupLateralIds.add(lc.clusterId);
              mergedGroupLateral.push(lc);
            }
          }
        }
        if (g.newestMs && g.newestMs > maxNewestMs) maxNewestMs = g.newestMs;
        if (typeof g.version === 'number' && g.version > maxVersion) maxVersion = g.version;
        if (g.lastDevelopedAt && (!bestLastDevelopedAt || new Date(g.lastDevelopedAt) > new Date(bestLastDevelopedAt))) {
          bestLastDevelopedAt = g.lastDevelopedAt;
          bestDevelopmentNote = g.developmentNote || bestDevelopmentNote;
        }
        if (Array.isArray(g.coverage)) rawCov.push(...g.coverage);
      }

      rawCov.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
      const seenOutlets = new Set();
      const dedupedCov = [];
      for (const art of rawCov) {
        if (!art.sourceId || seenOutlets.has(art.sourceId)) continue;
        seenOutlets.add(art.sourceId);
        dedupedCov.push(art);
        if (art.link) mergedSeenKeys.add(canonicalUrl(art.link));
        if (art.title) mergedSeenKeys.add(cleanHeadlineTitle(art.title));
      }

      const scores = dedupedCov.map(a => a.sentiment).filter(s => typeof s === 'number');
      const avgScore = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
      const spreadRange = scores.length > 1 ? Number((Math.max(...scores) - Math.min(...scores)).toFixed(2)) : 0;

      // A merge is only a chronological material_shift if the newer cluster broke at least 2 hours after the origin
      const rawMergeType = m.updateType === 'material_shift' || m.isNewDevelopment === true
        ? 'material_shift'
        : (m.updateType === 'clarification' ? 'clarification' : 'none');
      const mergeType = (rawMergeType === 'material_shift' && chronologicalSpanMs < 2 * 3600000)
        ? 'clarification'
        : rawMergeType;
      const isDev = mergeType === 'material_shift';

      const anchor = isDev ? originAnchor : largestAnchor;
      const finalStory = isDev ? ((m.story && m.story.trim()) || latestCluster.story || anchor.story) : (anchor.story || (m.story && m.story.trim()));
      const finalSlug = isDev ? slugify(finalStory) : (anchor.id || slugify(finalStory));
      const finalSummary = (m.summary && m.summary.trim()) || anchor.summary;
      evolvedIds.delete(finalSlug);

      const nextVersion = isDev ? (maxVersion + 1) : maxVersion;
      const ts = new Date(maxNewestMs || Date.now()).toISOString();
      const nextDevelopedAt = isDev ? ts : bestLastDevelopedAt;
      const nextDevNote = isDev
        ? ((m.developmentNote && m.developmentNote.trim()) || `Story evolved: ${finalStory}`)
        : bestDevelopmentNote;

      const baseHistSource = Array.isArray(richestHistoryAnchor.evolutionHistory) && richestHistoryAnchor.evolutionHistory.length > 0
        ? richestHistoryAnchor
        : originAnchor;
      const hist = Array.isArray(baseHistSource.evolutionHistory) && baseHistSource.evolutionHistory.length > 0
        ? [...baseHistSource.evolutionHistory]
        : [{
            version: 1,
            type: 'initial',
            timestamp: originAnchor.firstSeenAt || new Date(getEarliestMs(originAnchor) < Infinity ? getEarliestMs(originAnchor) : (maxNewestMs || Date.now())).toISOString(),
            headline: originAnchor.story,
            summary: originAnchor.summary,
            outletCount: originAnchor.outletCount || 2,
            note: 'Initial cluster formation on the wire'
          }];
      const seenHistNotes = new Set(hist.map(h => (h.note || '').toLowerCase().trim()));
      for (const g of group) {
        if (g === baseHistSource || !Array.isArray(g.evolutionHistory)) continue;
        for (const h of g.evolutionHistory) {
          if (!h || h.type === 'initial') continue;
          const nKey = (h.note || '').toLowerCase().trim();
          if (nKey && !seenHistNotes.has(nKey)) {
            seenHistNotes.add(nKey);
            hist.push(h);
          }
        }
      }

      if (mergeType === 'material_shift' || mergeType === 'clarification') {
        const beforeSnapshot = {
          id: originAnchor.id || slugify(originAnchor.story),
          version: maxVersion,
          story: originAnchor.story,
          summary: originAnchor.summary,
          outletCount: originAnchor.outletCount || 2
        };
        const afterSnapshot = {
          id: finalSlug,
          version: nextVersion,
          story: finalStory,
          summary: finalSummary,
          outletCount: dedupedCov.length
        };
        const entryNote = (m.developmentNote && m.developmentNote.trim()) || (isDev ? `Story evolved: ${finalStory}` : 'Merged clarifying dispatches');
        hist.push({
          version: nextVersion,
          type: mergeType,
          timestamp: ts,
          headline: finalStory,
          summary: finalSummary,
          beforeStory: originAnchor.story,
          beforeSummary: originAnchor.summary,
          outletCount: dedupedCov.length,
          note: entryNote
        });
        auditLogEntries.push({
          timestamp: new Date().toISOString(),
          eventTimestamp: ts,
          updateType: mergeType,
          source: 'clusterMerge',
          mergedClusterIds: group.map(g => g.id || slugify(g.story)),
          before: beforeSnapshot,
          after: afterSnapshot,
          note: entryNote
        });
      }

      const mergedClusterObj = {
        ...anchor,
        id: finalSlug,
        story: finalStory,
        summary: finalSummary,
        version: nextVersion,
        ...(nextDevelopedAt ? { lastDevelopedAt: nextDevelopedAt } : {}),
        ...(nextDevNote ? { developmentNote: nextDevNote } : {}),
        ...(mergedGroupLateral.length > 0 ? { lateralConnections: mergedGroupLateral } : {}),
        evolvedFromIds: Array.from(evolvedIds),
        evolutionHistory: hist.length > 20 ? [hist[0], ...hist.slice(-19)] : hist,
        seenArticleKeys: Array.from(mergedSeenKeys).slice(-120),
        averageSentiment: avgScore,
        sentimentSpread: spreadRange,
        outletCount: dedupedCov.length,
        newestMs: maxNewestMs || Date.now(),
        coverage: dedupedCov
      };
      delete mergedClusterObj.summarySynthesizedSig;
      result.push(mergedClusterObj);
    }

    clusters.forEach((c, idx) => {
      if (!consumed.has(idx)) result.push(c);
    });

    appendClusterUpdateAuditLog(auditLogEntries);
    console.log(`[Clusters] Consolidated ${merges.length} cluster groups (${materialInPlaceCount} material shifts, ${clarificationInPlaceCount} silent clarifications, ${clusters.length} -> ${result.length} clusters).`);
    return reconcileFinalLateralConnections(result);
  } catch (e) {
    console.warn('[Clusters] Consolidation pass skipped:', e.message);
    return clusters;
  }
}

function getClusterSummarySynthesisSignature(c) {
  if (!c) return '';
  const slug = c.id || String(c.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ver = typeof c.version === 'number' ? c.version : 1;
  const histLen = Array.isArray(c.evolutionHistory) && c.evolutionHistory.length > 0 ? c.evolutionHistory.length : 1;
  return `${slug}|v${ver}|h${histLen}`;
}

function cleanSynthesizedClusterSummary(rawText) {
  if (!rawText) return '';
  let s = String(rawText).trim();
  s = s.replace(/^On\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4},\s+/i, '');
  s = s.replace(/\s+(?:Outlets|Media\s+outlets|News\s+outlets|International\s+outlets|Reports|Coverage|Media\s+coverage|Press\s+coverage|News\s+coverage)\s+(?:highlight|highlights|highlighted|emphasize|emphasizes|emphasized|focus\s+on|focuses\s+on|focused\s+on|frame|frames|framed|note|notes|noted|examine|examines|examined|detail|details|detailed|underscore|underscores|underscored|portray|portrays|portrayed|are\s+framing|have\s+focused|broadly\s+frame)[^.!?]*[.!?]\s*$/i, '');
  if (s.length > 1 && /^[a-z]/.test(s)) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s.trim();
}

// Post-Consolidation Integrated Summary Synthesis Pass:
// Generates Isobar-grade ("whatHappened") summaries directly at the Vibe-O-Meter level for newly formed or newly updated clusters,
// weaving up to 10 full covering outlet descriptions + the complete Recorded Wire Evolution Stages so Isobar never has to silently rewrite summaries on open.
async function synthesizeIntegratedClusterSummaries(clusters, apiKey, finalSources = null, options = {}) {
  if (!apiKey || !Array.isArray(clusters) || clusters.length === 0) return clusters;

  // Enrich coverage descriptions in-place from finalSources when available so the prompt sees full article descriptions
  if (finalSources && typeof finalSources === 'object') {
    for (const cl of clusters) {
      if (!Array.isArray(cl?.coverage)) continue;
      for (const cov of cl.coverage) {
        const srcArts = finalSources[cov.sourceId]?.articles || [];
        const match = srcArts.find(a =>
          (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
          (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
        );
        if (match?.description && match.description.length > (cov.description || '').length) {
          cov.description = match.description;
        }
      }
    }
  }

  const forceAll = Boolean(options.forceAll || process.argv.includes('--polish-summaries-all'));
  const cutoffHours = typeof options.cutoffHours === 'number' ? options.cutoffHours : 168;
  const nowMs = Date.now();

  const candidates = [];
  clusters.forEach((c, idx) => {
    if (!c || !Array.isArray(c.coverage) || c.coverage.length < 2) return;
    const targetSig = getClusterSummarySynthesisSignature(c);
    const hasPinpointLoc = Boolean(c.primaryLocation && typeof c.primaryLocation.lat === 'number' && typeof c.primaryLocation.lon === 'number' && c.primaryLocation.name);
    const hasBriefing = Boolean(
      c.briefing &&
      c.briefing.whyItMatters &&
      c.briefing.whyItMatters.length >= 210 &&
      c.briefing.whatsNext &&
      c.briefing.whatsNext.length >= 130
    );
    if (!forceAll && c.summarySynthesizedSig === targetSig && hasPinpointLoc && hasBriefing) return;

    const newestMs = c.newestMs || Math.max(...c.coverage.map(a => new Date(a.pubDate).getTime() || 0), 0);
    const ageHours = newestMs > 0 ? Math.max(0, (nowMs - newestMs) / 3600000) : 999;
    if (!forceAll && !process.argv.includes('--polish-summaries') && ageHours > cutoffHours) return;

    candidates.push({ idx, c, targetSig, newestMs, histLen: (c.evolutionHistory || []).length });
  });

  if (candidates.length === 0) return clusters;

  // Prioritize recently updated & multi-stage evolving stories first
  candidates.sort((a, b) => (b.newestMs - a.newestMs) || (b.histLen - a.histLen) || ((b.c.outletCount || 0) - (a.c.outletCount || 0)));

  const maxClustersThisRun = (forceAll || process.argv.includes('--polish-summaries'))
    ? candidates.length
    : Math.min(candidates.length, 24);
  const selected = candidates.slice(0, maxClustersThisRun);
  const batchSize = 6;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const activeTiers = getOrderedKeyTiers(apiKey);
  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
  let totalPolished = 0;

  console.log(`[Clusters] Running integrated summary synthesis pass for ${selected.length} newly formed/updated cluster(s)...`);

  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize);
    const clusterBlocks = batch.map((item, bIdx) => {
      const c = item.c;
      const covSorted = [...(c.coverage || [])].sort((a, b) => {
        const descDiff = (b.description ? 1 : 0) - (a.description ? 1 : 0);
        if (descDiff !== 0) return descDiff;
        return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
      });
      const covLines = covSorted.slice(0, 10).map(cov =>
        `  - [${cov.sourceName || cov.sourceId}] "${cov.title}" (${cov.pubDate || 'recent'}): ${(cov.description || '').slice(0, 380)}`
      ).join('\n');

      const histArr = Array.isArray(c.evolutionHistory) ? c.evolutionHistory : [];
      const historyBlock = histArr.length > 0
        ? `\nRecorded Wire Evolution Stages (${histArr.length}):\n` + histArr.map((h, i) =>
            `  Stage ${i + 1} (${h.timestamp || 'earlier'} · v${h.version || 1} · ${h.outletCount || 2} outlets): "${h.headline}"${h.note ? ` — ${h.note}` : ''}${h.summary ? ` [Prior Summary: ${h.summary}]` : ''}`
          ).join('\n')
        : '';
      const devLine = c.developmentNote ? `\nLatest Development Note: ${c.developmentNote}` : '';

      return `[CLUSTER ${bIdx}] id="${c.id}" (v${c.version || 1})
Headline: ${c.story}
Current Draft Summary: ${c.summary || ''}${devLine}${historyBlock}
Covering Dispatches (${Math.min(10, covSorted.length)} of ${covSorted.length} outlets):
${covLines}`;
    }).join('\n\n---\n\n');

    const prompt = `You are a senior correspondent, analytical editor, and geographic intelligence editor writing for an intelligent, time-pressed reader (think Matt Levine's Money Stuff, Financial Times Lex, and The Economist's briefings — sharp, insightful, concrete, and written in clear, natural, accessible journalistic English without dense academic jargon).
Current Date: October 2026.

For each of the ${batch.length} news clusters below, synthesize:
(A) Its definitive top-level "summary" (1–2 crisp, detail-packed sentences, ~35–60 words) from its Covering Dispatches and Recorded Wire Evolution Stages.
(B) Its pinpoint "primaryLocation" representing the single most specific real-world origin epicenter / center of gravity where the story took place, using the full Covering Dispatches (not just the headline!).
(C) Its 2-part analytical stakes "briefing" ("whyItMatters" & "whatsNext") calibrated to the story's true scale:
    - If MACRO / POLICY / GEOPOLITICS / MARKETS / SCIENCE:
      * Set "whyItMattersLabel": "Why It Matters" and "whatsNextLabel": "What's Next".
      * "whyItMatters" (2–3 rich, substantive sentences, ~50–80 words):
        - Sentence 1 (The Concrete Lever): Explain who actually wins, loses, pays, or has their leverage shifted right now — naming the specific real-world mechanism or lever (supply choke point, statutory threshold, balance-sheet hit, coalition math, constitutional/legal mechanism, or operational constraint) rather than restating the headline.
        - Sentences 2–3 (The Deeper Baseline & Competing Incentives): Unpack the concrete historical/financial baseline and the non-obvious tension, trade-off, or split across competing actors, allies, or critics (why this move is happening now and what competing constraint each side is trapped by).
      * "whatsNext" (2 concrete sentences, ~35–55 words):
        - Sentence 1: Name the exact next test, deadline, parliamentary vote, court ruling, summit, or operational milestone.
        - Sentence 2: Explain what tips the outcome — the specific bottleneck, threshold, or condition that determines whether the effort holds, stalls, or escalates.
    - If ISOLATED LOCAL INCIDENT / FREAK ACCIDENT / HUMAN-INTEREST / CRIME:
      * Set "whyItMattersLabel": "Why It Resonated" or "The Context", and "whatsNextLabel": "The Aftermath" or "Where Things Stand" (2–3 grounded sentences on the human/community reality and factual local follow-up, zero fake bureaucratic or regulatory morals).

STRICT EDITORIAL & CHRONOLOGICAL SYNTHESIS RULES:
1. INTEGRATED CHRONOLOGICAL JOURNEY + CONCRETE FLASHPOINT SPECIFICS:
   - Weave the story's integrated chronological journey (how it broke -> how it shifted or developed across Recorded Wire Evolution Stages -> where it stands now) WITH the concrete specifics from the Covering Dispatches (exact named institutions/agencies/companies, named individuals/roles/ages, specific venues/streets/cities/prefectures, exact figures/tallies, and causal mechanisms).
   - Readers rely on this summary for the actual concrete details so they immediately know who, where, how much, and by what mechanism.
2. STRICT NUMERICAL & FACTUAL PRESERVATION (NO RECENCY AMNESIA):
   - NEVER drop any concrete figure, casualty/arrest tally, dollar valuation, troop count, or multi-country/multi-city geographic scope present in the cluster's Headline, Current Draft Summary, Latest Development Note, or earlier Evolution Stages.
3. TEMPORAL & ROLE HYGIENE (OCTOBER 2026 — NEVER INJECT PRE-CUTOFF TITLES):
   - Only attribute an active political, corporate, or institutional office/title to a person if that exact current title is explicitly stated in the Covering Dispatches below. Because offices, prime ministers, mayors, and ministers change over time, NEVER supply a person's former or pre-training-cutoff role from internal memory, and never refer to sitting 2026 administrations as "incoming".
4. PLAIN JOURNALISTIC ENGLISH & BANNED CLICHÉS:
   - Keep 100% of the analytical depth, concrete mechanisms, incentives, and historical baselines, but write in clear, natural, everyday journalistic English rather than dense academic or bureaucratic jargon.
   - NEVER open with a robotic "On [Weekday], [Date], ..." (weave timing naturally mid-sentence if helpful).
   - NEVER include meta-coverage filler ("Outlets highlight...", "Reports examine...", "Media coverage focuses on...").
   - NEVER use stock AI transitions ("underscores how", "highlights the delicate interplay", "serves as a stark reminder", "all eyes now turn to", "remains to be seen").
5. PINPOINT PRIMARY LOCATION FROM FULL COVERING DISPATCHES:
   - Inspect the Covering Dispatches for the exact city, prefecture, county, or specific venue/building where the event occurred. For example, if a headline says "Tibet Autonomous Region Hit by Magnitude-7.0 Earthquake" and the dispatches name "Nagqu", set "name": "Nagqu, Tibet Autonomous Region" (NEVER fall back to a national capital like "Beijing, China" or a vague province centroid when a specific city/prefecture/venue is named in the dispatches!).
   - Only include a specific venue prefix ("Specific Venue, City" in "name", e.g. "Musée du Louvre, Paris", "City Ground, Nottingham") when the event physically occurred at a famous landmark, stadium, museum, university, airport, or military base explicitly named in the Covering Dispatches. NEVER invent or prepend bureaucratic council, ministry, or agency names (never write "Devon Rural District Council, Devon" or "Department of Foreign Affairs, Canberra" — write "Devon, England" or "Canberra, Australia").
   - "region" MUST be "State/Province/Autonomous Region, Country" or "Country", always ending with the sovereign Country name (e.g. "Tibet Autonomous Region, China", "Tennessee, United States", "England, United Kingdom").

Clusters to synthesize:
${clusterBlocks}

Return ONLY a valid JSON array matching this exact schema:
[
  {
    "index": 0,
    "id": "cluster-id",
    "summary": "1-2 crisp, detail-packed sentences (~35-60 words) weaving the integrated chronological journey with exact named actors, institutions, venues, figures, and mechanisms.",
    "primaryLocation": {
      "name": "Specific Venue/City, City/Region (e.g. 'Nagqu, Tibet Autonomous Region' or 'Palace of Westminster, London')",
      "region": "State/Province, Country (MUST end with sovereign Country name)",
      "countryIso": "2-letter lowercase ISO-3166-1 alpha-2 code for the sovereign host country (e.g. 'us', 'gb', 'fr', 'ua', 'cn', 'br')",
      "lat": 31.4769,
      "lon": 92.0519,
      "zoom": 9,
      "whyHere": "1 short sentence explaining why the story is anchored at this exact location."
    },
    "briefing": {
      "whyItMattersLabel": "Why It Matters | Why It Resonated | The Context",
      "whyItMatters": "2-3 rich, substantive sentences (~50-80 words) in clear journalistic English unpacking (1) the concrete causal lever/mechanism and (2) the deeper baseline, competing incentives, or structural trade-off across actors.",
      "whatsNextLabel": "What's Next | The Aftermath | Where Things Stand",
      "whatsNext": "2 concrete sentences (~35-55 words) naming (1) the exact next test, deadline, vote, ruling, or milestone and (2) what specific bottleneck or condition tips the outcome."
    }
  }
]`;

    let parsedBatch = null;
    for (const modelName of modelsToTry) {
      if (parsedBatch) break;
      for (const keyObj of activeTiers) {
        if (parsedBatch) break;
        try {
          const genAI = new GoogleGenerativeAI(keyObj.key);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              ...(modelName === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {})
            }
          });
          const resp = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Summary synthesis call timed out after 75s')), 75000))
          ]);
          let text = resp.response.text().trim();
          if (text.startsWith('```json')) text = text.substring(7);
          else if (text.startsWith('```')) text = text.substring(3);
          if (text.endsWith('```')) text = text.substring(0, text.length - 3);
          const arr = JSON.parse(tryRepairJsonArray(text.trim()));
          if (Array.isArray(arr) && arr.length > 0) {
            parsedBatch = arr;
          }
        } catch (err) {
          console.warn(`[Clusters] Summary synthesis attempt (${modelName} / ${keyObj.tier}) notice: ${err.message}`);
          if (keyObj.tier === 'FREE' && activeTiers.length > 1) {
            freeKeyExhaustedThisRun = true;
          }
        }
      }
    }

    if (!Array.isArray(parsedBatch)) continue;

    for (const entry of parsedBatch) {
      const bIdx = typeof entry?.index === 'number' ? entry.index : batch.findIndex(x => x.c.id === entry?.id);
      if (bIdx < 0 || bIdx >= batch.length) continue;
      const { c } = batch[bIdx];
      const candidateSum = cleanSynthesizedClusterSummary(entry.summary || '');
      if (!candidateSum || candidateSum.length < 45) continue;

      // Ensure candidateSum did not drop any concrete multi-digit number (>1, non-year) from the headline or existing summary
      const requiredNums = (`${c.story || ''} ${c.summary || ''} ${c.developmentNote || ''}`.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [])
        .filter(n => Number(n.replace(/,/g, '')) > 1 && !/^(19|20)\d{2}$/.test(n));
      const candNums = new Set(candidateSum.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || []);
      const droppedHeadlineOrSumNum = requiredNums.some(n => !candNums.has(n));

      if (!droppedHeadlineOrSumNum) {
        c.summary = candidateSum;
        if (Array.isArray(c.evolutionHistory) && c.evolutionHistory.length > 0) {
          c.evolutionHistory[c.evolutionHistory.length - 1].summary = candidateSum;
        }
      }
      const rawLoc = entry.primaryLocation;
      if (rawLoc && typeof rawLoc === 'object' && typeof rawLoc.lat === 'number' && typeof rawLoc.lon === 'number' && rawLoc.name) {
        c.primaryLocation = {
          name: String(rawLoc.name).trim(),
          region: String(rawLoc.region || '').trim(),
          ...(typeof rawLoc.countryIso === 'string' && rawLoc.countryIso.trim() ? { countryIso: rawLoc.countryIso.trim().toLowerCase() } : (c.primaryLocation?.countryIso ? { countryIso: c.primaryLocation.countryIso } : {})),
          lat: Number(rawLoc.lat),
          lon: Number(rawLoc.lon),
          lng: Number(rawLoc.lon),
          zoom: typeof rawLoc.zoom === 'number' ? rawLoc.zoom : 10,
          whyHere: String(rawLoc.whyHere || '').trim()
        };
      }
      if (entry.briefing && typeof entry.briefing === 'object' && entry.briefing.whyItMatters && entry.briefing.whatsNext) {
        c.briefing = {
          whyItMattersLabel: String(entry.briefing.whyItMattersLabel || 'Why It Matters').trim(),
          whyItMatters: cleanSynthesizedClusterSummary(entry.briefing.whyItMatters),
          whatsNextLabel: String(entry.briefing.whatsNextLabel || "What's Next").trim(),
          whatsNext: cleanSynthesizedClusterSummary(entry.briefing.whatsNext)
        };
      }
      c.summarySynthesizedSig = getClusterSummarySynthesisSignature(c);
      totalPolished++;
    }
  }

  if (totalPolished > 0) {
    console.log(`[Clusters] ✨ Synthesized integrated multi-outlet & history-honed summaries for ${totalPolished} cluster(s).`);
  }
  return clusters;
}

// Enrich top constructive/positive articles with Open Graph images and descriptions if missing in RSS
async function enrichTopPositiveArticleImages(finalSources) {
  const allPositive = [];
  Object.values(finalSources).forEach(src => {
    (src.articles || []).forEach(art => {
      const score = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0);
      const needsImg = !art.imageUrl;
      const needsDesc = needsCleanEditorialSummary(art.description, art.title);
      if (score >= 0.15 && (needsImg || needsDesc) && art.link && art.link.startsWith('http')) {
        allPositive.push({ art, score, needsImg, needsDesc });
      }
    });
  });

  allPositive.sort((a, b) => b.score - a.score);
  const candidates = allPositive.slice(0, 20);
  if (candidates.length === 0) return;

  console.log(`[Image/Meta Enrichment] Checking OG metadata for ${candidates.length} top constructive articles...`);
  await Promise.all(candidates.map(async ({ art, needsImg, needsDesc }) => {
    try {
      const res = await fetch(art.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return;
      const html = await res.text();
      if (needsImg) {
        const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        if (match && match[1] && isRealEditorialImageUrl(match[1])) {
          art.imageUrl = match[1];
          console.log(`  -> Attached OG image for: "${art.title.slice(0, 45)}..."`);
        }
      }
      if (needsDesc) {
        const descMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
                          html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        if (descMatch && descMatch[1]) {
          const cleanMetaDesc = sanitizeText(descMatch[1]);
          if (!needsCleanEditorialSummary(cleanMetaDesc, art.title)) {
            art.description = cleanMetaDesc.length > 450 ? cleanMetaDesc.substring(0, 447) + '...' : cleanMetaDesc;
            console.log(`  -> Attached OG description for: "${art.title.slice(0, 45)}..."`);
          }
        }
      }
    } catch (e) {
      // Non-blocking timeout / fetch error
    }
  }));
}

// Helper: check if an article has a valid Gemini evaluation (not an old local lexicon fallback or truncated batch 0.00 fallback)
function hasValidGeminiScore(art) {
  if (!art) return false;
  const exp = art.explanationGemini || art.explanation || '';
  if (!exp || exp.includes('Analyzed locally') || exp.startsWith('Analyzed via Gemini (')) return false;
  if (art.sourceId && NATIVE_LANG_SOURCES.has(art.sourceId) && !art.originalTitle && !/\/en\//.test(art.link || '')) {
    return false;
  }
  const s = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : art.sentiment;
  return typeof s === 'number' && !isNaN(s);
}

// Helper: strip legacy AFINN/VADER/duplicate fields to keep JSON payload lean
function compactArticleRecord(art, sourceId) {
  const hasGemini = hasValidGeminiScore(art);
  let score = hasGemini ? Number((art.sentimentGemini ?? art.sentiment).toFixed(2)) : null;
  const category = art.categoryGemini || art.category || 'other';
  let explanation = hasGemini ? (art.explanationGemini || art.explanation || '') : undefined;

  const clean = {
    sourceId: art.sourceId || sourceId,
    title: art.title,
    ...(art.originalTitle && art.originalTitle !== art.title ? { originalTitle: art.originalTitle } : {}),
    description: art.description || '',
    link: art.link || '',
    ...(art.imageUrl ? { imageUrl: art.imageUrl } : {}),
    pubDate: art.pubDate
  };
  if (score !== null) {
    if (Array.isArray(art.factors) && art.factors.length === 4) {
      const calc = computeFourFactorScore({
        polarity: art.factors[0],
        reach: art.factors[1],
        permanence: art.factors[2],
        framing: art.factors[3]
      });
      clean.sentiment = calc.score;
      clean.eventBase = calc.eventBase;
      clean.framingMod = calc.framingMod;
      clean.factors = art.factors;
      if (explanation) {
        const rawExp = String(explanation).replace(/\s*\[Event Base:.*$/, '');
        const expSuffix = ` [Event Base: ${calc.eventBase >= 0 ? '+' : ''}${calc.eventBase.toFixed(2)} | Editorial Framing: ${calc.framingMod >= 0 ? '+' : ''}${calc.framingMod.toFixed(2)}]`;
        explanation = rawExp + expSuffix;
      }
    } else {
      clean.sentiment = score;
      if (typeof art.eventBase === 'number') clean.eventBase = art.eventBase;
      if (typeof art.framingMod === 'number') clean.framingMod = art.framingMod;
    }
    clean.category = category;
    if (explanation) clean.explanation = explanation;
  }
  return clean;
}

// Main execution routine
async function main() {
  console.log('==============================================');
  console.log('🚀 VIBE-O-METER: Autonomous Ingestion & Bake');
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  console.log('==============================================');

  const config = readConfig();
  const currentCache = readCache();

  const geminiKey = process.env.GEMINI_API_KEY || config.apiKey;
  const geminiPaidKey = process.env.GEMINI_PAID_API_KEY || config.paidApiKey || geminiKey;
  const geminiKeyTiers = [];
  if (geminiKey) geminiKeyTiers.push({ key: geminiKey, tier: 'FREE' });
  if (geminiPaidKey && geminiPaidKey !== geminiKey) geminiKeyTiers.push({ key: geminiPaidKey, tier: 'PAID' });
  const geminiModel = 'gemini-3.5-flash-lite';

  // Build lookup of already analyzed articles
  const existingMap = new Map();
  if (currentCache.sources) {
    Object.keys(currentCache.sources).forEach(sourceId => {
      const src = currentCache.sources[sourceId];
      if (src && src.articles) {
        src.articles.forEach(art => {
          const tKey = `${sourceId}_title_${cleanHeadlineTitle(art.title)}`;
          existingMap.set(tKey, art);
          if (art.originalTitle) {
            const origKey = `${sourceId}_title_${cleanHeadlineTitle(art.originalTitle)}`;
            existingMap.set(origKey, art);
          }
          if (art.link) {
            const uKey = `${sourceId}_url_${canonicalUrl(art.link)}`;
            existingMap.set(uKey, art);
          }
        });
      }
    });
  }

  const fetchedBySource = {};
  const unanalyzedArticles = [];

  // 1. Fetch RSS Feeds
  for (const source of NEWS_SOURCES) {
    try {
      console.log(`[RSS] Fetching ${source.name}...`);
      const feed = await parser.parseURL(source.feedUrl);
      const items = (feed.items || [])
        .filter(item => !/^cartoon for\s+/i.test(sanitizeText(item.title)))
        .slice(0, 25)
        .map(item => ({
          sourceId: source.id,
          title: sanitizeText(item.title),
          description: extractBestDescription(item),
          link: item.link || '',
          imageUrl: extractImageUrl(item),
          pubDate: item.pubDate || item.isoDate || new Date().toISOString()
        }));

      const sourceArticles = [];
      const seenBatchUrls = new Set();
      const seenBatchTitles = new Set();
      for (const item of items) {
        const uKey = `${source.id}_url_${canonicalUrl(item.link)}`;
        const tKey = `${source.id}_title_${cleanHeadlineTitle(item.title)}`;
        const cUrl = canonicalUrl(item.link);
        const cTitle = cleanHeadlineTitle(item.title);

        if (cUrl && seenBatchUrls.has(cUrl)) continue;
        if (cTitle && seenBatchTitles.has(cTitle)) continue;
        if (cUrl) seenBatchUrls.add(cUrl);
        if (cTitle) seenBatchTitles.add(cTitle);

        const cached = (item.link ? existingMap.get(uKey) : null) || existingMap.get(tKey);
        if (cached) {
          if (!cached.imageUrl && item.imageUrl) {
            cached.imageUrl = item.imageUrl;
          }
          if (needsCleanEditorialSummary(cached.description, cached.title) && item.description && !needsCleanEditorialSummary(item.description, item.title)) {
            cached.description = item.description;
          }
          if (cached.link && cached.link.includes('news.google.com') && item.link && !item.link.includes('news.google.com')) {
            cached.link = item.link;
          }
          if (new Date(item.pubDate) > new Date(cached.pubDate)) {
            const oldBaseTitle = cached.originalTitle || cached.title || '';
            const oldStems = extractCoherenceStems(oldBaseTitle);
            const newStems = new Set(extractCoherenceStems(item.title || ''));
            const sharedStems = oldStems.filter(s => newStems.has(s)).length;
            const overlapRatio = oldStems.length > 0 ? (sharedStems / oldStems.length) : 1;
            const titleChangedMaterially = cleanHeadlineTitle(oldBaseTitle) !== cleanHeadlineTitle(item.title || '') && (overlapRatio < 0.6 || sharedStems < 2);
            cached.pubDate = item.pubDate;
            if (titleChangedMaterially) {
              console.log(`[RSS] Rolling URL headline changed for [${source.id}]: "${oldBaseTitle.slice(0, 55)}..." -> "${item.title.slice(0, 55)}..." (re-queueing for Gemini)`);
              cached.title = item.title;
              delete cached.originalTitle;
              cached.description = needsCleanEditorialSummary(item.description, item.title) ? '' : (item.description || '');
              cached.sentiment = null;
              delete cached.eventBase;
              delete cached.framingMod;
              delete cached.factors;
              cached.explanation = '';
            } else if (!cached.originalTitle) {
              cached.title = item.title;
            }
          }
          if (!hasValidGeminiScore(cached)) {
            unanalyzedArticles.push(cached);
          }
          sourceArticles.push(cached);
        } else {
          unanalyzedArticles.push(item);
          sourceArticles.push(item);
        }
      }
      fetchedBySource[source.id] = { name: source.name, articles: sourceArticles };
    } catch (err) {
      console.warn(`[RSS] Warning: Failed to fetch ${source.name}: ${err.message}`);
      const oldArticles = (currentCache.sources && currentCache.sources[source.id] && currentCache.sources[source.id].articles) || [];
      fetchedBySource[source.id] = { name: source.name, articles: oldArticles, error: err.message };
    }
  }

  // Pull in backlogged pending articles from historical cache if any exist
  // Supports --recalc-positive (7d positive articles), --recalc-24h (past 24 hours), --recalc-48h (past 48 hours), or --recalc-all
  const recalcPositive = process.argv.includes('--recalc-positive');
  const recalc24h = process.argv.includes('--recalc-24h');
  const recalc48h = process.argv.includes('--recalc-48h');
  const recalcAll = process.argv.includes('--recalc-all');
  const h24CutoffMs = Date.now() - (24 * 60 * 60 * 1000);
  const h48CutoffMs = Date.now() - (48 * 60 * 60 * 1000);
  const d7CutoffMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const maxBacklog = recalcAll ? 10000 : ((recalc24h || recalc48h || recalcPositive) ? 1500 : (process.argv.includes('--backlog') ? 1000 : 60));
  let backlogAdded = 0;
  const unanalyzedKeys = new Set(unanalyzedArticles.map(a => `${a.sourceId}_${a.title.trim().toLowerCase()}`));
  const sortedExisting = Array.from(existingMap.values()).sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  for (const article of sortedExisting) {
    if (backlogAdded >= maxBacklog) break;
    const pubMs = article.pubDate ? new Date(article.pubDate).getTime() : 0;
    const missingFactors = !Array.isArray(article.factors) || article.factors.length !== 4;
    const positiveNeedsSummary = (article.sentiment >= 0.15) && needsCleanEditorialSummary(article.description, article.title);
    const needsRecalc =
      (recalcAll && (missingFactors || positiveNeedsSummary)) ||
      (recalcPositive && pubMs >= d7CutoffMs && article.sentiment >= 0.14 && missingFactors) ||
      (recalc48h && pubMs >= h48CutoffMs && missingFactors) ||
      (recalc24h && pubMs >= h24CutoffMs && missingFactors);
    if (!hasValidGeminiScore(article) || needsRecalc) {
      if (process.argv.includes('--backlog-24h') && pubMs < h24CutoffMs) continue;
      if (process.argv.includes('--backlog-72h') && pubMs < (Date.now() - 72 * 3600 * 1000)) continue;
      const dedupeKey = `${article.sourceId}_${(article.title || '').trim().toLowerCase()}`;
      if (!unanalyzedKeys.has(dedupeKey)) {
        unanalyzedArticles.push(article);
        unanalyzedKeys.add(dedupeKey);
        backlogAdded++;
      }
    }
  }

  console.log(`[Queue] Found ${unanalyzedArticles.length} articles requiring Gemini sentiment analysis (${backlogAdded} pulled from historical cache).`);

  // 2. Perform Gemini AI Analysis
  let activeAnalyzerLabel = currentCache.analyzerUsed || 'Gemini';
  let newlyAnalyzedCount = 0;
  let aiSuccess = false;

  if (unanalyzedArticles.length > 0) {
    if (geminiKeyTiers.length > 0) {
      try {
        console.log(`[AI] Processing ${unanalyzedArticles.length} articles with Gemini (${geminiModel}, tiers: ${geminiKeyTiers.map(t => t.tier).join(' -> ')})...`);
        const geminiRes = await analyzeWithGemini(unanalyzedArticles, geminiKeyTiers, geminiModel, undefined, sortedExisting);
        
        const articleMap = new Map();
        unanalyzedArticles.forEach(a => articleMap.set(`${a.sourceId}_${a.title.trim().toLowerCase()}`, a));

        geminiRes.results.forEach(res => {
          const key = `${res.sourceId}_${res.title.trim().toLowerCase()}`;
          const target = articleMap.get(key);
          if (target) {
            target.sentiment = res.sentiment;
            if (typeof res.eventBase === 'number') target.eventBase = res.eventBase;
            if (typeof res.framingMod === 'number') target.framingMod = res.framingMod;
            if (Array.isArray(res.factors)) target.factors = res.factors;
            target.explanation = res.explanation;
            target.category = res.category;
            if (res.englishTitle && res.englishTitle !== target.title) {
              if (!target.originalTitle) target.originalTitle = target.title;
              target.title = res.englishTitle;
            }
            if (res.englishSummary) {
              target.description = res.englishSummary;
            } else if (res.summary && needsCleanEditorialSummary(target.description, target.title)) {
              target.description = res.summary;
            }
            newlyAnalyzedCount++;
          }
        });

        if (newlyAnalyzedCount > 0) {
          activeAnalyzerLabel = `Gemini (${geminiRes.modelUsed})`;
          aiSuccess = true;
          console.log(`[Gemini] Successfully evaluated ${newlyAnalyzedCount} articles.`);
        }
      } catch (geminiErr) {
        console.error('[Gemini] Analysis failed:', geminiErr.message);
      }
    }

    if (!aiSuccess && unanalyzedArticles.length > 0) {
      console.warn(`[Sync] Notice: Gemini AI was unavailable to evaluate the ${unanalyzedArticles.length} queued articles during this cycle.`);
      console.warn(`[Sync] STRICT ZERO-OFFLINE POLICY: Skipping without assigning local fallback. Articles remain queued for next sync.`);
    }
  } else if (currentCache.analyzerUsed) {
    activeAnalyzerLabel = currentCache.analyzerUsed;
  }

  // 3. Combine historical records, compact legacy fields, and calculate statistics
  const finalSources = {};
  const summarySources = {};

  for (const source of NEWS_SOURCES) {
    const fetched = fetchedBySource[source.id] || { articles: [] };
    const existing = (currentCache.sources && currentCache.sources[source.id] && currentCache.sources[source.id].articles) || [];
    let combined = [...fetched.articles, ...existing];

    // Sort newest first so freshest revisions take precedence
    combined.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Deduplicate by canonical URL and clean title, and compact fields
    const seenUrls = new Set();
    const seenTitles = new Set();
    combined = combined.filter(art => {
      if (art.title && /<[^>]*>/.test(art.title)) {
        art.title = art.title.replace(/<[^>]*>/g, '').trim();
      }
      const cUrl = canonicalUrl(art.link);
      const cTitle = cleanHeadlineTitle(art.title);
      if (cUrl && seenUrls.has(cUrl)) return false;
      if (cTitle && seenTitles.has(cTitle)) return false;
      if (cUrl) seenUrls.add(cUrl);
      if (cTitle) seenTitles.add(cTitle);
      return true;
    }).map(art => compactArticleRecord(art, source.id));

    if (combined.length > MAX_ARTICLES_PER_SOURCE) {
      combined = combined.slice(0, MAX_ARTICLES_PER_SOURCE);
    }

    let totalScore = 0;
    let posCount = 0;
    let neuCount = 0;
    let negCount = 0;
    let scoredCount = 0;

    combined.forEach(art => {
      if (typeof art.sentiment === 'number' && !isNaN(art.sentiment)) {
        const s = art.sentiment;
        totalScore += s;
        scoredCount++;
        if (s > 0.15) posCount++;
        else if (s < -0.15) negCount++;
        else neuCount++;
      }
    });

    const count = combined.length;
    const avg = scoredCount > 0 ? Number((totalScore / scoredCount).toFixed(3)) : 0;

    // Full detailed source entry
    finalSources[source.id] = {
      name: source.name,
      averageSentiment: avg,
      distribution: { positive: posCount, neutral: neuCount, negative: negCount },
      articles: combined,
      ...(fetched.error ? { error: fetched.error } : {})
    };

    // Lightweight summary source entry (for instant <15KB initial load)
    const sortedBySentiment = [...combined].filter(a => typeof a.sentiment === 'number').sort((a, b) => a.sentiment - b.sentiment);
    summarySources[source.id] = {
      name: source.name,
      averageSentiment: avg,
      distribution: { positive: posCount, neutral: neuCount, negative: negCount },
      articleCount: count,
      mostNegative: sortedBySentiment.slice(0, 2),
      mostPositive: sortedBySentiment.slice(-2).reverse(),
      recentArticles: combined.slice(0, 10), // Latest 10 for quick render
      ...(fetched.error ? { error: fetched.error } : {})
    };
  }

  // If new articles arrived but AI was temporarily 503 across all attempts:
  // Do NOT corrupt or overwrite datasets with empty/fallback data.
  if (unanalyzedArticles.length > 0 && newlyAnalyzedCount === 0 && !aiSuccess) {
    console.warn('==============================================');
    console.warn('⚠️ Sync Notice: Upstream AI was unavailable during this run (e.g. 503 spike).');
    console.warn(`⏳ ${unanalyzedArticles.length} articles remain queued for subsequent sync.`);
    console.warn('🛡️ STRICT ZERO-OFFLINE POLICY: No local fallback assigned.');
    console.warn('🛡️ Historical data and metrics preserved without modification.');
    console.warn('==============================================');
    return;
  }

  // 4. Append time series snapshot
  const timeSeries = currentCache.timeSeries || [];
  const now = new Date();
  const lastEntry = timeSeries[timeSeries.length - 1];
  const shouldAppendSnapshot = !lastEntry || (now - new Date(lastEntry.timestamp)) >= 30 * 60 * 1000;

  if (shouldAppendSnapshot && newlyAnalyzedCount > 0) {
    const averages = {};
    Object.keys(finalSources).forEach(id => {
      averages[id] = finalSources[id].averageSentiment;
    });
    timeSeries.push({
      timestamp: now.toISOString(),
      analyzer: activeAnalyzerLabel,
      averages
    });
  }

  // 4.5 Compute Global Vibe Metrics and Editorial Summary
  let allArticlesTotal = 0;
  let allArticlesScore = 0;
  const categoryStats = {};

  Object.values(finalSources).forEach(src => {
    (src.articles || []).forEach(art => {
      if (typeof art.sentiment === 'number' && !isNaN(art.sentiment)) {
        allArticlesTotal++;
        const s = art.sentiment;
        allArticlesScore += s;
        const cat = art.category || 'other';
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, count: 0 };
        categoryStats[cat].total += s;
        categoryStats[cat].count++;
      }
    });
  });

  const globalAvg = allArticlesTotal > 0 ? Number((allArticlesScore / allArticlesTotal).toFixed(3)) : 0;
  
  // Sorted outlets by average
  const sortedOutlets = Object.entries(finalSources)
    .map(([id, data]) => ({ id, name: data.name, score: data.averageSentiment }))
    .sort((a, b) => a.score - b.score);

  const mostNegativeOutlet = sortedOutlets[0] || null;
  const mostPositiveOutlet = sortedOutlets[sortedOutlets.length - 1] || null;

  const categoryAverages = {};
  Object.keys(categoryStats).forEach(cat => {
    categoryAverages[cat] = Number((categoryStats[cat].total / categoryStats[cat].count).toFixed(3));
  });

  // 5.65 Enrich Top Constructive Articles with OG Images if missing in RSS
  try {
    await enrichTopPositiveArticleImages(finalSources);
  } catch (imgErr) {
    console.warn('[Sync] Non-blocking image enrichment notice:', imgErr.message);
  }

  // 5.7 Cross-Outlet Story Clustering (4-Mode Activation Matrix)
  // Activates on:
  //  (Mode 1) Global Cross-Region Breaking Burst (>=4 outlets across >=3 regions, or >=3 fresh across >=3 regions in 90m)
  //  (Mode 2) Regional Breaking Surge (>=5 outlets in 1-2 regions with >=3 fresh in 90m)
  //  (Mode 3) Heavy Ingest Backlog (>=35 newly analyzed articles this run and >=1.0h since last cluster)
  //  (Mode 4) Regular Scheduled Cadence (default: every 2 hours, or via --force / --cluster)
  let sharedStoryClusters = currentCache.sharedStoryClusters || [];
  let lastClusteredAt = currentCache.lastClusteredAt || (currentCache.globalStats && currentCache.globalStats.lastClusteredAt) || null;
  const clusterIntervalHours = Number(process.env.CLUSTER_INTERVAL_HOURS || 2);
  const hoursSinceLastCluster = lastClusteredAt ? (now.getTime() - new Date(lastClusteredAt).getTime()) / (1000 * 60 * 60) : Infinity;
  const forceCluster = process.argv.includes('--force') || process.argv.includes('--cluster') || process.argv.includes('--recalc-24h');
  const breakingBurst = detectCrossRegionBreakingBurst(finalSources, sharedStoryClusters, lastClusteredAt, now.getTime());
  const hasHeavyBacklog = newlyAnalyzedCount >= 35 && hoursSinceLastCluster >= 1.0;
  const shouldRunClustering = forceCluster || sharedStoryClusters.length === 0 || hoursSinceLastCluster >= clusterIntervalHours || Boolean(breakingBurst) || hasHeavyBacklog;

  if (shouldRunClustering) {
    try {
      if (breakingBurst && hoursSinceLastCluster < clusterIntervalHours && !forceCluster) {
        console.log(`[Burst Signal] ⚡ Breaking ${breakingBurst.mode} detected ("${breakingBurst.pair}" across ${breakingBurst.outlets} outlets / ${breakingBurst.regions} regions: ${breakingBurst.regionList.join(', ')}) — "${breakingBurst.sampleTitle}"`);
      } else if (hasHeavyBacklog && hoursSinceLastCluster < clusterIntervalHours && !forceCluster) {
        console.log(`[Backlog Trigger] 📥 Heavy ingest wave (${newlyAnalyzedCount} new articles analyzed, ${hoursSinceLastCluster.toFixed(1)}h since last cluster) — triggering immediate clustering pass.`);
      }
      if (!freeKeyExhaustedThisRun && newlyAnalyzedCount > 0) {
        console.log('[Sync] Pausing 6s before story clustering to avoid free-tier RPM/TPM collision...');
        await new Promise(r => setTimeout(r, 6000));
      }
      const orderedTiersLabel = getOrderedKeyTiers(geminiKeyTiers).map(t => t.tier).join(' -> ');
      const triggerReason = forceCluster
        ? 'forced'
        : (breakingBurst && hoursSinceLastCluster < clusterIntervalHours
          ? breakingBurst.mode
          : (hasHeavyBacklog && hoursSinceLastCluster < clusterIntervalHours ? 'ingest-backlog' : 'scheduled'));
      console.log(`[Sync] Running cross-outlet story clustering (tiers: ${orderedTiersLabel}, reason: ${triggerReason}, last run: ${lastClusteredAt ? hoursSinceLastCluster.toFixed(1) + 'h ago' : 'never'})...`);
      const clusters = await clusterCrossOutletStories(finalSources, geminiKeyTiers, currentCache.sharedStoryClusters);
      if (clusters && clusters.length > 0) {
        sharedStoryClusters = clusters;
        lastClusteredAt = now.toISOString();
        console.log(`[Sync] Successfully identified ${sharedStoryClusters.length} cross-outlet story clusters.`);
      }
    } catch (clusterErr) {
      console.warn('[Sync] Non-blocking story clustering notice:', clusterErr.message);
    }
  } else {
    console.log(`[Sync] Skipping story clustering (last clustered ${hoursSinceLastCluster.toFixed(1)}h ago; interval is ${clusterIntervalHours}h; new articles: ${newlyAnalyzedCount}; no breaking burst).`);
  }

  // Always synchronize cluster coverage sentiment scores with the latest article scores in finalSources
  if (Array.isArray(sharedStoryClusters) && sharedStoryClusters.length > 0) {
    sharedStoryClusters.forEach(cl => {
      if (!Array.isArray(cl.coverage)) return;
      if (cl.id === 'european-protests-over-living-costs' || cl.story === 'European Protests Over Living Costs') {
        cl.id = 'milan-riots-prompt-italian-troop-deployment';
        cl.story = 'Milan Riots Prompt Italian Troop Deployment';
        cl.summary = 'Violent youth and cost-of-living protests in Milan led to a second day of street clashes and luxury retailer closures, prompting Prime Minister Giorgia Meloni\'s government to order the deployment of 500 soldiers to secure the city.';
        cl.evolvedFromIds = ['european-protests-over-living-costs'];
        if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length === 1) {
          cl.evolutionHistory[0].headline = cl.story;
          cl.evolutionHistory[0].summary = cl.summary;
        }
        cl.lateralConnections = [
          {
            clusterId: 'french-unrest-and-curfews-imposed',
            headline: 'French Unrest and Curfews Imposed',
            howItConnects: 'Street clashes and store looting in Milan followed the wave of cost-of-living and youth unrest across neighboring France, prompting Italian authorities to deploy 500 troops.'
          }
        ];
      }
      cl.coverage.forEach(cov => {
        const srcArts = finalSources[cov.sourceId]?.articles || [];
        const match = srcArts.find(a =>
          (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
          (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
        );
        if (match && typeof match.sentiment === 'number') {
          cov.sentiment = match.sentiment;
          if (match.title) cov.title = match.title;
          if (match.description && match.description.length > (cov.description || '').length) cov.description = match.description;
          if (typeof match.eventBase === 'number') cov.eventBase = match.eventBase;
          if (typeof match.framingMod === 'number') cov.framingMod = match.framingMod;
        }
      });
      if (cl.coverage.length >= 4) {
        const getEb = (c) => {
          if (typeof c.eventBase === 'number') return c.eventBase;
          const srcArts = finalSources[c.sourceId]?.articles || [];
          const m = srcArts.find(a => (c.link && a.link && canonicalUrl(a.link) === canonicalUrl(c.link)) || (c.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(c.title)));
          return (m && typeof m.eventBase === 'number') ? m.eventBase : (typeof c.sentiment === 'number' ? c.sentiment : 0);
        };
        const ebs = cl.coverage.map(getEb).sort((a, b) => a - b);
        const medEb = ebs[Math.floor(ebs.length / 2)];
        const clusterIsMarket = /\b(oil|crude|brent|stock|market|wall st|nasdaq|s&p|bond|yield|tariff|trade|gold|economy|inflation|shares|price)\b/i.test(cl.story || '');
        const clusterHasCasualtyHeadline = /\b(kill|kills|killed|dead|death|deaths|massacre|strage|strike|strikes|struck|missile|camp|tanker|tankers|mine|mines)\b/i.test(cl.story || '');
        const filteredCov = cl.coverage.filter(cov => {
          const eb = getEb(cov);
          const isMarketTicker = /\b(oil\s+(above|tops|surges|slips|rises|falls|edges|holds)|oil futures|oil prices?|brent crude|u\.s\. oil surges|stocks? turn|wall st opens|nasdaq|s&p 500|bond yields?)\b/i.test(cov.title || '');
          const mentionsClusterIncident = /\b(tanker|tankers|mine|mines|ship|ships|vessel|vessels|starlink|zelensky|zelenskyy)\b/i.test(cov.title || '');
          if (!clusterIsMarket && isMarketTicker && !mentionsClusterIncident) {
            console.log(`[Clusters] Stripped market-ticker intruder from "${cl.story}": [${cov.sourceId}] "${cov.title}"`);
            return false;
          }
          if (medEb <= -0.55 && (eb - medEb) >= 0.42) {
            const hasCasualtyWord = /\b(kill|kills|killed|dead|death|deaths|casualt|wound|injur|strike|strikes|missile|camp|fire|blaze|flood|rescue)\b/i.test(cov.title || '');
            if (!hasCasualtyWord) {
              console.log(`[Clusters] Stripped mild commentary outlier (eb=${eb} vs medEb=${medEb}) from mass-casualty cluster "${cl.story}": [${cov.sourceId}] "${cov.title}"`);
              return false;
            }
          }
          if (medEb >= -0.28 && !clusterHasCasualtyHeadline && (medEb - eb) >= 0.40 && eb <= -0.55) {
            console.log(`[Clusters] Stripped mass-casualty outlier (eb=${eb} vs medEb=${medEb}) from non-casualty cluster "${cl.story}": [${cov.sourceId}] "${cov.title}"`);
            return false;
          }
          return true;
        });
        if (filteredCov.length >= 2) {
          cl.coverage = filteredCov;
          cl.outletCount = filteredCov.length;
        }
      }
      const validScores = cl.coverage.map(c => c.sentiment).filter(s => typeof s === 'number');
      if (validScores.length > 0) {
        cl.averageSentiment = Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2));
        cl.sentimentSpread = Number((Math.max(...validScores) - Math.min(...validScores)).toFixed(2));
      }
    });

    if (shouldRunClustering || process.argv.includes('--polish-summaries') || process.argv.includes('--polish-summaries-all')) {
      try {
        await synthesizeIntegratedClusterSummaries(sharedStoryClusters, geminiKeyTiers, finalSources);
      } catch (sumErr) {
        console.warn('[Sync] Non-blocking summary synthesis notice:', sumErr.message);
      }
    }
  }

  // 5.8 Daily Editorial Briefing (Uses fresh in-memory sources & clusters)
  const todayDateStr = now.toISOString().slice(0, 10);
  let editorialSummary = currentCache.editorialSummary || '';
  try {
    const briefing = await generateDailyBriefing({
      force: process.argv.includes('--force'),
      sources: finalSources,
      sharedStoryClusters
    });
    if (briefing) {
      editorialSummary = briefing;
    }
  } catch (err) {
    console.warn('[Sync] Non-blocking briefing notice:', err.message);
  }

  const globalStats = {
    globalSentiment: globalAvg,
    totalArticles: allArticlesTotal,
    mostNegativeOutlet,
    mostPositiveOutlet,
    categoryAverages,
    editorialSummary,
    editorialSummaryDate: todayDateStr,
    lastClusteredAt,
    sharedStoryClusters
  };

  // 6. Build Payloads
  const fullPayload = {
    lastUpdated: now.toISOString(),
    lastClusteredAt,
    analyzerUsed: activeAnalyzerLabel,
    editorialSummaryDate: todayDateStr,
    editorialSummary,
    globalStats,
    sharedStoryClusters,
    sources: finalSources,
    timeSeries
  };

  const summaryPayload = {
    lastUpdated: now.toISOString(),
    lastClusteredAt,
    analyzerUsed: activeAnalyzerLabel,
    editorialSummaryDate: todayDateStr,
    editorialSummary,
    globalStats,
    sharedStoryClusters,
    sources: summarySources,
    timeSeries
  };

  // 7. Export dedicated public JSON feeds & enrich clusters with imageUrl/topic
  // Note: exportPublicJsonFeeds enriches fullPayload.sharedStoryClusters (rawClusters) in-place
  // while preserving internal tracking state (seenArticleKeys, evaluatedDesyncTokens, lastEvaluatedCoverageMs)
  const { exportPublicJsonFeeds } = require('./export-feeds');
  const { enrichedClusters, activeClusters48h } = exportPublicJsonFeeds(fullPayload);
  summaryPayload.sharedStoryClusters = activeClusters48h || enrichedClusters;
  if (summaryPayload.globalStats) {
    summaryPayload.globalStats = { ...summaryPayload.globalStats, sharedStoryClusters: summaryPayload.sharedStoryClusters };
  }

  // Save primary outputs
  fs.writeFileSync(DATA_FILE, JSON.stringify(fullPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'data.json'), JSON.stringify(fullPayload), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'summary.json'), JSON.stringify(summaryPayload), 'utf8');

  console.log('==============================================');
  console.log('✅ Sync Completed Successfully!');
  console.log(`📁 Historical archive: data/vibe-data.json (${(fs.statSync(DATA_FILE).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`⚡ Public baked data: public/data/data.json (${(fs.statSync(path.join(PUBLIC_DATA_DIR, 'data.json')).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`🚀 Ultra-light summary: public/data/summary.json (${(fs.statSync(path.join(PUBLIC_DATA_DIR, 'summary.json')).size / 1024).toFixed(1)} KB)`);
  console.log(`📡 Public JSON API feeds: public/data/{index,clusters,clusters-archive,good-news,outlets,timeseries}.json`);
  console.log('==============================================');

  // 8. Optional On-Demand Auto-Push (for instant Antigravity or local CLI trigger)
  if (process.argv.includes('--push')) {
    const { execSync } = require('child_process');
    try {
      console.log('[Git] Staging updated vibe datasets...');
      execSync('git add data/vibe-data.json data/clusters-archive.json data/cluster-updates-log.json public/data/', { stdio: 'inherit' });
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      if (status.includes('data/')) {
        console.log('[Git] Committing fresh vibe data...');
        execSync('git commit -m "chore(data): on-demand vibe sync"', { stdio: 'inherit' });
        console.log('[Git] Pushing to origin/main...');
        execSync('git push origin main', { stdio: 'inherit' });
        console.log('🚀 Pushed successfully to GitHub! Live site is deploying updated data.');
      } else {
        console.log('[Git] No new data changes to commit.');
      }
    } catch (gitErr) {
      console.warn('[Git] Note: Could not auto-push to git:', gitErr.message);
    }
  }
}

  if (require.main === module) {
    main().then(() => {
      process.exit(0);
    }).catch(err => {
      console.error('Fatal error during sync:', err);
      process.exit(1);
    });
  }

  module.exports = {
    analyzeWithGemini,
    computeFourFactorScore,
    getHeadlineTopicTokens,
    cleanHeadlineTitle,
    canonicalUrl,
    clusterCrossOutletStories,
    consolidateEvolvingClusters,
    synthesizeIntegratedClusterSummaries,
    detectCrossRegionBreakingBurst
  };

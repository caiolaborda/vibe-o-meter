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
  { id: 'politico', name: 'Politico', feedUrl: 'https://rss.politico.com/politics-news.xml' },
  { id: 'cbc', name: 'CBC News', feedUrl: 'https://www.cbc.ca/webfeed/rss/rss-topstories' },
  { id: 'globalnews', name: 'Global News', feedUrl: 'https://globalnews.ca/feed/' },
  // Latin America
  { id: 'batimes', name: 'Buenos Aires Times', feedUrl: 'https://www.batimes.com.ar/feed' },
  { id: 'mexiconews', name: 'Mexico News Daily', feedUrl: 'https://mexiconewsdaily.com/feed/' },
  { id: 'mercopress', name: 'MercoPress', feedUrl: 'https://en.mercopress.com/rss/' },
  { id: 'agenciabrasil', name: 'Agência Brasil', feedUrl: 'https://agenciabrasil.ebc.com.br/en/rss/ultimasnoticias/feed.xml' },
  // United Kingdom
  { id: 'bbc', name: 'BBC News', feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'guardian', name: 'The Guardian', feedUrl: 'https://www.theguardian.com/uk/rss' },
  { id: 'skynews', name: 'Sky News', feedUrl: 'https://feeds.skynews.com/feeds/rss/home.xml' },
  { id: 'ft', name: 'Financial Times', feedUrl: 'https://www.ft.com/world?format=rss' },
  // Europe
  { id: 'spiegel', name: 'Spiegel International', feedUrl: 'https://www.spiegel.de/international/index.rss' },
  { id: 'dw', name: 'DW News', feedUrl: 'https://rss.dw.com/rdf/rss-en-all' },
  { id: 'france24', name: 'France 24', feedUrl: 'https://www.france24.com/en/rss' },
  { id: 'euronews', name: 'Euronews', feedUrl: 'https://www.euronews.com/rss?level=theme&name=news' },
  { id: 'lemonde', name: 'Le Monde', feedUrl: 'https://www.lemonde.fr/en/rss/une.xml' },
  { id: 'elpais', name: 'El País', feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada' },
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
  { id: 'physorg', name: 'Phys.org', feedUrl: 'https://phys.org/rss-feed/breaking/' },
  { id: 'arstechnica', name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index' }
];

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
    .replace(/\s*[-–—|]\s*(reuters|bbc|cnn|fox news|the guardian|ap news|associated press|bloomberg|nyt|new york times|al jazeera|npr|pbs|pbs newshour|cnbc|sky news|spiegel|dw|france 24|politico|wsj|wall street journal|financial times|ft|euronews|cbc|global news|abc news|sydney morning herald|smh|scmp|south china morning post|the japan times|japan times|cna|channel newsasia|the national|africanews|agencia brasil|agência brasil|phys\.org|le monde|el pais|el país|rte|rté|buenos aires times|mexico news daily|mercopress|new scientist|ars technica).*$/i, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Helper to check if an article's RSS description is missing, echoed from the headline, or contains grading jargon
function needsCleanEditorialSummary(desc, title) {
  const cleanD = sanitizeText(desc || '')
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
    const polCurve = Math.pow(pol, 1.32);
    const geoMag = Math.pow(Math.max(0.01, reach), 0.62) * Math.pow(Math.max(0.01, perm), 0.38);
    const gPow = Math.pow(geoMag, 1.75);
    const kPow = Math.pow(0.32, 1.75);
    const hill = gPow / (gPow + kPow);
    const impactScale = Math.min(1, 0.12 * geoMag + 0.88 * hill);
    eventBase = Number(Math.min(1, polCurve * impactScale * 1.12).toFixed(3));
    const rawFramingMod = frame * (0.10 + 0.22 * reach);
    const maxFraming = Math.abs(eventBase) * 0.35;
    framingMod = Number(Math.max(-maxFraming, Math.min(maxFraming, rawFramingMod)).toFixed(3));
  } else {
    const geoMag = Math.pow(Math.max(0.01, reach), 0.78) * Math.pow(Math.max(0.01, perm), 0.22);
    const gPow = Math.pow(geoMag, 1.9);
    const kPow = Math.pow(0.28, 1.9);
    const hill = gPow / (gPow + kPow);
    const impactScale = Math.min(1, 0.14 * reach + 0.86 * hill);
    eventBase = Number((pol * impactScale).toFixed(3));
    framingMod = Number((frame * 0.45).toFixed(3));
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
  const modelsToTry = [
    requestedModel,
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  // Pre-tokenize recent 4-factor articles from the last 36 hours for soft Macro-Scale [reach, permanence] calibration
  const recentCutoffMs = Date.now() - (36 * 60 * 60 * 1000);
  const anchorCandidates = existingEvaluatedPool
    .filter(a => Array.isArray(a.factors) && a.factors.length === 4 && (!a.pubDate || new Date(a.pubDate).getTime() >= recentCutoffMs))
    .map(a => ({
      scale: [a.factors[1], a.factors[2]], // ONLY [reach, permanence] — never lock polarity or framing!
      tokens: new Set(getHeadlineTopicTokens(a.title))
    }))
    .filter(a => a.tokens.size >= 2);

  function findPriorScaleHint(title) {
    const tokens = getHeadlineTopicTokens(title);
    if (tokens.length < 2) return null;
    let best = null;
    let bestShared = 0;
    for (const cand of anchorCandidates) {
      let shared = 0;
      for (const t of tokens) {
        if (cand.tokens.has(t)) shared++;
      }
      const minLen = Math.min(tokens.length, cand.tokens.size);
      if ((shared >= 3 || (shared >= 2 && shared / minLen >= 0.6)) && shared > bestShared) {
        bestShared = shared;
        best = cand.scale;
      }
    }
    return best;
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
      const priorScale = findPriorScaleHint(item.title);
      return {
        index,
        outlet: item.sourceId,
        headline: item.title,
        description: needsCleanEditorialSummary(item.description, item.title) ? '' : (item.description || ''),
        ...(priorScale ? { priorScaleHint: priorScale } : {})
      };
    });

    const prompt = `You are an impartial, senior media analyst evaluating global news dispatches from first principles.
Evaluate each article across FOUR continuous higher-order dimensions using precise integers (avoid rounding to multiples of 5 or 10):

1. "polarity" (integer -100 to 100 — Net Real-World Valence & Substantive Editorial Angle):
   Evaluate the inherent net valence of the primary real-world change and substantive angle foregrounded by the dispatch along a continuous spectrum from -100 (maximum net harm, loss, or destruction) through 0 (neutral, routine, or offsetting mixed outcomes) to +100 (maximum net constructive advancement).
   - Constructive Remediation vs. Tragic Premise: Distinguish between active problem-solving and mere silver linings. When the primary news event is a substantive constructive intervention, clinical or scientific advance, discovery, or systemic aid that builds durable capacity or resolves a major deficit, score polarity positively in proportion to the solution's constructive value. Conversely, when a dispatch centers on an irreversible personal tragedy, terminal plight, or acute economic/harm shock and merely highlights a procedural concession, secondary byproduct, or risk catalog, evaluate the net state of the whole situation (negative or near-zero <= 0) rather than isolating the silver lining.
   - Frontier Advancement vs. Routine Maintenance or Minor Comfort Tips: Distinguish genuine breakthroughs from ordinary civic/corporate administration and minor symptom-comfort studies. Routine municipal/provincial facility openings, ceremonial inaugurations, local charity award profiles, and routine corporate capital expenditures belong near neutral (0 to +15). Similarly, minor symptom-comfort, ergonomic, or lifestyle studies (e.g., wearing headphones to reduce post-op nausea, minor dietary tips) warrant only modest positive polarity (+15 to +28), whereas life-saving medical cures, disease eradication, major conservation milestones, and fundamental scientific discoveries warrant high positive polarity (+55 to +95).
   - Concrete Action vs. Speculative Claims (Symmetrical): Concrete actions, empirical findings, active clinical trials, physical discoveries, enacted policies, and verified acute events carry full positive or negative valence. Conversely, when a dispatch consists of unsubstantiated future predictions, a politician or executive claiming a stalled project is "finally happening", preliminary proposals, political spending pledges, or opinion commentary without a verified completed milestone, discount event polarity toward zero (0 to +18) and permanence (10–25), attributing directional spin primarily to "framing".

2. "reach" (integer 0 to 100 — Proportional Scope of Affected Population, Society, or Knowledge Domain):
   Measure the breadth of the affected population, societal shockwave, or knowledge domain along a continuous logarithmic scale from 0 (an isolated individual, 1–2 person medical recovery, celebrity/personal dispute, or single micro-location) to 100 (humanity at large, planetary ecosystems, or universal scientific and medical breakthroughs replicable worldwide). Human-interest profiles of 1–2 individuals (e.g., a single child's surgery or rehabilitation), isolated local accidents, local community/zoo features, and single-company operational updates have narrow localized reach (5–22); minor clinical comfort tips have moderate reach (25–42); national policies, mass-casualty tragedies/violent shocks, and transformative scientific or life-saving clinical discoveries carry broad national to global reach (45–100).

3. "permanence" (integer 0 to 100 — Macro-Structural Depth & Societal Horizon of Consequence):
   Measure the macro-structural durability of the consequence at the societal, institutional, ecological, or scientific level from 0 (ephemeral, speculative, routine administrative occurrences, or isolated 1–2 person events with no lasting systemic change) to 100 (irreversible macro-structural, geopolitical, ecological, clinical, or scientific transformation). Do not assign high permanence (65–100) to an isolated 1–2 person accident, local crime, or individual patient surgery merely because it is personally irreversible for those individuals; evaluate permanence strictly at the societal and macro-structural level (15–30 for isolated individual cases).

4. "framing" (integer -100 to 100 — Editorial Rhetoric vs. Neutral Wire Baseline):
   Measure the linguistic and rhetorical spin of the headline relative to a dispassionate, strictly factual wire-service baseline (0), along a continuous scale from -100 (maximally alarmist, sensationalist, or conflict-amplifying rhetoric) to +100 (maximally constructive, promotional, or agency-highlighting rhetoric).

SCALE CALIBRATION & FREE POLARITY PRINCIPLE:
If a dispatch includes a "priorScaleHint" [reach, permanence] from an earlier article on the exact same specific incident, use it only as a rough reference for macro societal scale ("reach" and "permanence") IF AND ONLY IF this dispatch is about the exact same incident.
NEVER lock "polarity" or "framing": always evaluate "polarity" (the substantive valence/angle of the facts foregrounded by this outlet) and "framing" (its rhetorical spin) independently for every single headline so subtle editorial variations are fully preserved.

Return ONLY a JSON array of objects with:
- index: integer matching input index
- polarity: integer -100 to 100
- reach: integer 0 to 100
- permanence: integer 0 to 100
- framing: integer -100 to 100
- category: strictly one of 'world', 'politics', 'business', 'technology', 'science', 'climate', 'health', 'entertainment', 'sports', 'other'
- explanation: concise 1-sentence analytical note on real-world impact and headline framing
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
        const genAI = new GoogleGenerativeAI(keyObj.key);
        const maxAttempts = keyObj.tier === 'FREE' && activeTiers.length > 1 ? 1 : (modelName.includes('lite') ? 2 : 3);
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
                if (!match || typeof match.polarity !== 'number' || !match.explanation) {
                  return;
                }
                matchedInBatch++;
                const calc = computeFourFactorScore(match);
                const expSuffix = ` [Event Base: ${calc.eventBase >= 0 ? '+' : ''}${calc.eventBase.toFixed(2)} | Editorial Framing: ${calc.framingMod >= 0 ? '+' : ''}${calc.framingMod.toFixed(2)}]`;
                const rawExp = String(match.explanation).replace(/\s*\[Event Base:.*$/, '');
                const cleanSummary = typeof match.summary === 'string' && match.summary.trim().length > 25 ? match.summary.trim() : null;
                allResults.push({
                  sourceId: item.sourceId,
                  title: item.title,
                  link: item.link,
                  sentiment: calc.score,
                  eventBase: calc.eventBase,
                  framingMod: calc.framingMod,
                  factors: [calc.polarity, calc.reach, calc.permanence, calc.framing],
                  category: match.category || 'other',
                  explanation: rawExp + expSuffix,
                  ...(cleanSummary ? { summary: cleanSummary } : {})
                });
                // Feed only soft Macro-Scale [reach, permanence] hint into anchorCandidates for subsequent batches in this run
                const itemTokens = getHeadlineTopicTokens(item.title);
                if (itemTokens.length >= 2) {
                  anchorCandidates.push({
                    scale: [calc.reach, calc.permanence],
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
            if (keyObj.tier === 'FREE' && isQuotaOrRateLimit && activeTiers.length > 1) {
              freeKeyExhaustedThisRun = true;
              console.log('[Gemini] Free tier key reached rate/quota limit — switching to PAID fallback key...');
              break;
            }
            if (attempt < maxAttempts) {
              const waitMs = isDemandSpike ? (attempt === 1 ? 5000 : 12000) : 2500;
              await new Promise(r => setTimeout(r, waitMs));
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
  nyt: 'NA', cnn: 'NA', fox: 'NA', npr: 'NA', pbs: 'NA', cnbc: 'NA', bloomberg: 'NA', wsj: 'NA', politico: 'NA', cbc: 'NA', globalnews: 'NA',
  batimes: 'LATAM', mexiconews: 'LATAM', mercopress: 'LATAM', agenciabrasil: 'LATAM',
  bbc: 'UK', guardian: 'UK', skynews: 'UK', ft: 'UK',
  spiegel: 'EU', dw: 'EU', france24: 'EU', euronews: 'EU', lemonde: 'EU', elpais: 'EU', rte: 'EU',
  abcau: 'APAC', smh: 'APAC', scmp: 'APAC', japantimes: 'APAC', cna: 'APAC',
  aljazeera: 'MEA', thenational: 'MEA', africanews: 'MEA',
  reuters: 'WIRE', ap: 'WIRE', newscientist: 'SCI', physorg: 'SCI', arstechnica: 'SCI'
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
        title: art.title,
        pubMs,
        stems,
        isFreshSinceLastCluster
      });
    }
  }

  if (recentArticles.length < 4) return null;

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
    .filter(([, info]) => info.outlets.size >= 4 && info.regions.size >= 3 && info.freshOutlets.size >= 2)
    .sort((a, b) => b[1].outlets.size - a[1].outlets.size || b[1].regions.size - a[1].regions.size);

  if (candidates.length === 0) return null;

  const [bestPair, bestInfo] = candidates[0];
  bestInfo.articles.sort((a, b) => b.pubMs - a.pubMs);
  return {
    pair: bestPair,
    outlets: bestInfo.outlets.size,
    regions: bestInfo.regions.size,
    freshOutlets: bestInfo.freshOutlets.size,
    regionList: Array.from(bestInfo.regions),
    sampleTitle: bestInfo.articles[0]?.title || ''
  };
}

// Cross-Outlet Story Clustering (100% Pure AI Semantic Clustering with 7-Day Constructive Window & Rolling Cluster Memory)
async function clusterCrossOutletStories(finalSources, apiKey, previousClusters = []) {
  if (!apiKey) return previousClusters;
  
  // Gather fresh breaking headlines from the past 36h (up to 25 per outlet)
  // PLUS all constructive stories (sentiment >= 0.15) from the past 7 DAYS so slow-burn discoveries reported days apart cluster together
  const candidates = [];
  const thirtySixHoursAgo = Date.now() - (36 * 60 * 60 * 1000);
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  Object.entries(finalSources).forEach(([sourceId, src]) => {
    const articles = src.articles || [];
    let addedBreakingForSource = 0;
    let addedConstructiveForSource = 0;
    for (let i = 0; i < articles.length; i++) {
      const art = articles[i];
      if (!art || !art.title || art.title.trim().length <= 10) continue;
      const t = art.pubDate ? new Date(art.pubDate).getTime() : NaN;
      if (isNaN(t) || t < sevenDaysAgo) continue;

      const score = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0);
      const isRecent36h = t >= thirtySixHoursAgo;
      const isRecent72h = t >= threeDaysAgo;
      const isConstructive7d = score >= 0.15;

      if (isConstructive7d) {
        if (addedConstructiveForSource >= 15) continue;
        addedConstructiveForSource++;
      } else {
        if (!isRecent72h) continue;
        if (addedBreakingForSource >= 24) continue;
        if (!isRecent36h && addedBreakingForSource >= 8) continue;
        addedBreakingForSource++;
      }

      candidates.push({
        sourceId,
        sourceName: src.name,
        title: art.title.trim(),
        description: (art.description || '').slice(0, 125).trim(),
        sentiment: score,
        link: art.link || '',
        pubDate: art.pubDate || ''
      });
    }
  });

  if (candidates.length < 6) return previousClusters;

  // Pass headline + brief lead snippet so Gemini resolves oblique headlines semantically without any hardcoded token matching
  const promptLines = candidates.map((c, idx) => {
    const snippet = c.description ? ` — ${c.description}` : '';
    return `[${idx}] ${c.sourceId}: ${c.title}${snippet}`;
  }).join('\n');

  const prompt = `You are a senior news editor analyzing recent dispatches across global newsrooms.
Identify distinct real-world events, developments, or discoveries that are covered by 2 or more DIFFERENT news outlets.

Rules:
- Group dispatches strictly by the exact same underlying real-world event or discovery (never merge two separate tragedies, awards, or debates that occurred in different places just because they share a theme).
- Match dispatches by their primary headline subject; use the short description snippet only to disambiguate who or where an oblique headline refers to, never to match multi-story digest roundups ("...and more top headlines").
- Scan the full list carefully so every outlet covering that specific event or discovery (even if published a few days apart) is included in "ids".
- If a single outlet published multiple updates on the exact same event, include ONLY the single most comprehensive/definitive headline ID for that outlet in "ids" (maximum 1 ID per outlet per cluster).
- Provide a concise neutral story title (3-6 words, e.g. "Brazil Amazon Deforestation Hits Record Low", "Ancient Shipwreck Found Off Turkey", "Oregon Elementary School Shooting").
- Provide a concise 1-2 sentence editorial summary explaining the core real-world event and how outlets are framing it.
- Return ONLY a JSON array. If no shared stories exist, return [].

Dispatches:
${promptLines}

Return JSON array in format:
[
  { "story": "Topic Title", "summary": "1-2 sentence editorial summary of the event.", "ids": [0, 4, 12] }
]`;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-3.5-flash'
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

    const extractCoherenceStems = (str) => {
      const stop = new Set([
        'after','amid','also','back','been','before','between','both','call','calls','city','come','comes','could',
        'days','down','during','early','earlier','even','first','five','four','from','good','government','great',
        'group','have','head','help','helped','here','high','into','just','keep','last','late','latest','lead',
        'left','less','life','like','live','long','look','made','make','many','month','more','most','move','much',
        'must','near','need','never','news','next','nine','official','officials','once','only','open','other',
        'over','part','past','people','plan','plans','play','point','public','push','report','reports','return',
        'right','rise','risk','said','says','second','secure','secured','seen','send','seven','show','side','sign',
        'since','some','soon','spark','state','states','still','stop','story','study','support','take','talk',
        'team','tell','test','than','that','their','them','then','there','these','they','thing','think','three',
        'through','time','times','today','told','took','turn','under','until','update','used','very','view','vote',
        'wait','wants','warn','watch','week','weeks','well','were','what','when','where','which','while','will',
        'with','within','without','work','world','would','year','years','reuters','bloomberg','guardian'
      ]);
      return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !stop.has(w))
        .map(w => w.replace(/(ing|tion|ions|ment|ments|ness|ally|ed|es|s)$/, '').slice(0, 6))
        .filter(w => w.length >= 3);
    };

    clusters.forEach(cl => {
      if (!cl.ids || cl.ids.length < 2) return;
      const rawCandidates = cl.ids.map(id => candidates[id]).filter(Boolean);
      if (rawCandidates.length < 2) return;

      // Reject LLM integer-index digit slips (e.g. [847] instead of [645]): every member must share at least 1 stem
      // with either the cluster's story+summary OR at least 1 peer headline in the cluster
      const anchorStems = new Set(extractCoherenceStems(`${cl.story || ''} ${cl.summary || ''}`));
      const rawMatching = rawCandidates.filter((art, idx) => {
        const myStems = extractCoherenceStems(`${art.title || ''} ${(art.description || '').slice(0, 125)}`);
        if (myStems.some(s => anchorStems.has(s))) return true;
        const peerTitleStems = new Set();
        rawCandidates.forEach((other, j) => {
          if (j !== idx) extractCoherenceStems(other.title).forEach(s => peerTitleStems.add(s));
        });
        const keep = myStems.some(s => peerTitleStems.has(s));
        if (!keep) {
          console.warn(`[Clusters] Dropped zero-overlap index outlier from "${cl.story}": [${art.sourceId}] "${art.title}"`);
        }
        return keep;
      });
      if (rawMatching.length < 2) return;

      rawMatching.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      // Enforce 1 representative dispatch per outlet so no single outlet's live-blog skews the cluster spectrum or average
      const seenOutlets = new Set();
      const matchingArticles = [];
      for (const m of rawMatching) {
        if (seenOutlets.has(m.sourceId)) continue;
        seenOutlets.add(m.sourceId);
        matchingArticles.push(m);
      }

      if (matchingArticles.length >= 2) {
        matchingArticles.forEach(m => {
          if (m.link) coveredUrls.add(canonicalUrl(m.link));
          if (m.title) coveredTitles.add(cleanHeadlineTitle(m.title));
        });
        const scores = matchingArticles.map(m => m.sentiment);
        const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
        const spreadRange = Number((Math.max(...scores) - Math.min(...scores)).toFixed(2));
        const newestMs = matchingArticles[0]?.pubDate ? new Date(matchingArticles[0].pubDate).getTime() : 0;

        // Check if this cluster matches a previous cluster by shared article URLs/titles
        let matchedPrev = null;
        const evolvedIds = new Set();
        const newUrls = new Set(matchingArticles.map(m => m.link ? canonicalUrl(m.link) : '').filter(Boolean));
        const newTitles = new Set(matchingArticles.map(m => m.title ? cleanHeadlineTitle(m.title) : '').filter(Boolean));

        if (Array.isArray(previousClusters)) {
          for (const prev of previousClusters) {
            if (!prev || !Array.isArray(prev.coverage)) continue;
            const prevSlug = prev.id || String(prev.story || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const sharedCount = prev.coverage.filter(c =>
              (c.link && newUrls.has(canonicalUrl(c.link))) ||
              (c.title && newTitles.has(cleanHeadlineTitle(c.title)))
            ).length;
            if (sharedCount >= 2 || (sharedCount >= 1 && prev.coverage.length <= 2 && matchingArticles.length <= 2)) {
              if (!matchedPrev) matchedPrev = prev;
              if (prevSlug) evolvedIds.add(prevSlug);
              if (Array.isArray(prev.evolvedFromIds)) {
                prev.evolvedFromIds.forEach(id => evolvedIds.add(id));
              }
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
        let prevLastDevelopedAt = null;
        let prevDevelopmentNote = null;
        let prevEvolutionHistory = null;
        let prevSeenKeys = null;
        let pendingUpdate = null;

        if (matchedPrev) {
          // Self-heal check: if matchedPrev previously merged two separate clusters that the primary clusterer has now split apart,
          // use the clean primary cluster title/summary rather than carrying over a polluted multi-story summary.
          const articleBagStems = new Set();
          matchingArticles.forEach(m => extractCoherenceStems(`${m.title || ''} ${m.description || ''}`).forEach(s => articleBagStems.add(s)));
          const prevStoryStems = extractCoherenceStems(matchedPrev.story || '');
          const prevStorySupported = prevStoryStems.length === 0 || prevStoryStems.every(s => articleBagStems.has(s));

          const prevSlug = prevStorySupported
            ? (matchedPrev.id || String(matchedPrev.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
            : String(cl.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          finalId = prevSlug;
          finalStory = prevStorySupported ? (matchedPrev.story || cl.story) : cl.story;
          finalSummary = prevStorySupported ? (matchedPrev.summary || cl.summary || '') : (cl.summary || matchedPrev.summary || '');
          prevVersion = prevStorySupported && typeof matchedPrev.version === 'number' ? matchedPrev.version : 1;
          prevLastDevelopedAt = prevStorySupported ? (matchedPrev.lastDevelopedAt || null) : null;
          prevDevelopmentNote = prevStorySupported ? (matchedPrev.developmentNote || null) : null;

          const currentCovUrls = (matchedPrev.coverage || []).map(c => c.link ? canonicalUrl(c.link) : '').filter(Boolean);
          const currentCovTitles = (matchedPrev.coverage || []).map(c => c.title ? cleanHeadlineTitle(c.title) : '').filter(Boolean);
          const historicalKeys = new Set([
            ...(Array.isArray(matchedPrev.seenArticleKeys) ? matchedPrev.seenArticleKeys : []),
            ...currentCovUrls,
            ...currentCovTitles
          ]);

          const addedArticles = matchingArticles.filter(m => {
            const u = m.link ? canonicalUrl(m.link) : '';
            const t = m.title ? cleanHeadlineTitle(m.title) : '';
            return (!u || !historicalKeys.has(u)) && (!t || !historicalKeys.has(t));
          });

          // Record all current articles into historicalKeys so re-clustered articles never re-trigger pendingUpdate
          matchingArticles.forEach(m => {
            if (m.link) historicalKeys.add(canonicalUrl(m.link));
            if (m.title) historicalKeys.add(cleanHeadlineTitle(m.title));
          });
          prevSeenKeys = Array.from(historicalKeys).slice(-120);

          if (prevStorySupported && Array.isArray(matchedPrev.evolutionHistory) && matchedPrev.evolutionHistory.length > 0) {
            prevEvolutionHistory = [...matchedPrev.evolutionHistory];
          } else {
            prevEvolutionHistory = [{
              version: 1,
              type: 'initial',
              timestamp: matchedPrev.firstSeenAt || matchedPrev.lastDevelopedAt || new Date(newestMs || Date.now()).toISOString(),
              headline: finalStory,
              summary: finalSummary,
              outletCount: (matchedPrev.coverage || []).length || matchingArticles.length,
              note: 'Initial cluster formation on the wire'
            }];
          }

          if (addedArticles.length > 0) {
            const newestAddedMs = Math.max(...addedArticles.map(a => a.pubDate ? new Date(a.pubDate).getTime() : 0).filter(Boolean));
            pendingUpdate = {
              candidateStory: cl.story,
              candidateSummary: cl.summary || '',
              newestAddedMs: newestAddedMs > 0 ? newestAddedMs : newestMs,
              addedHeadlines: addedArticles.slice(0, 6).map(a => `${a.sourceName || a.sourceId}: "${a.title}"`)
            };
          }
        } else {
          const initKeys = new Set();
          matchingArticles.forEach(m => {
            if (m.link) initKeys.add(canonicalUrl(m.link));
            if (m.title) initKeys.add(cleanHeadlineTitle(m.title));
          });
          prevSeenKeys = Array.from(initKeys);
          prevEvolutionHistory = [{
            version: 1,
            type: 'initial',
            timestamp: new Date(newestMs || Date.now()).toISOString(),
            headline: finalStory,
            summary: finalSummary,
            outletCount: matchingArticles.length,
            note: 'Initial cluster formation on the wire'
          }];
        }

        const currentSlug = finalId || String(finalStory || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        evolvedIds.delete(currentSlug);

        formattedClusters.push({
          id: currentSlug,
          story: finalStory,
          summary: finalSummary,
          version: prevVersion,
          ...(prevLastDevelopedAt ? { lastDevelopedAt: prevLastDevelopedAt } : {}),
          ...(prevDevelopmentNote ? { developmentNote: prevDevelopmentNote } : {}),
          ...(evolvedIds.size > 0 ? { evolvedFromIds: Array.from(evolvedIds) } : {}),
          ...(prevEvolutionHistory ? { evolutionHistory: prevEvolutionHistory } : {}),
          ...(prevSeenKeys ? { seenArticleKeys: prevSeenKeys } : {}),
          ...(pendingUpdate ? { _pendingUpdate: pendingUpdate } : {}),
          averageSentiment: avgScore,
          sentimentSpread: spreadRange,
          outletCount: matchingArticles.length,
          newestMs,
          coverage: matchingArticles.map(m => ({
            sourceId: m.sourceId,
            sourceName: m.sourceName,
            title: m.title,
            sentiment: m.sentiment,
            link: m.link,
            pubDate: m.pubDate
          }))
        });
      }
    });

    // Rolling 7-Day Cluster Memory: preserve any valid multi-outlet cluster from the previous run (< 7 days old)
    // whose articles weren't already superseded by a new cluster in this pass
    if (Array.isArray(previousClusters)) {
      previousClusters.forEach(prev => {
        if (!prev || !Array.isArray(prev.coverage) || prev.coverage.length < 2) return;
        const newestPrevMs = Math.max(...prev.coverage.map(c => new Date(c.pubDate).getTime() || 0));
        if (newestPrevMs < sevenDaysAgo) return;
        const isBreakingNeg = (prev.averageSentiment || 0) < 0.10;
        if (isBreakingNeg && newestPrevMs < threeDaysAgo) return;

        const alreadyCovered = prev.coverage.some(c =>
          (c.link && coveredUrls.has(canonicalUrl(c.link))) ||
          (c.title && coveredTitles.has(cleanHeadlineTitle(c.title)))
        );
        if (!alreadyCovered) {
          formattedClusters.push({
            ...prev,
            version: typeof prev.version === 'number' ? prev.version : 1,
            newestMs: newestPrevMs
          });
        }
      });
    }

    // Longitudinal Cluster Consolidation & Development Verification Pass
    const consolidatedClusters = await consolidateEvolvingClusters(formattedClusters, apiKey);

    // Weight recent 24h stories higher so fresh breaking stories rank above multi-day stories
    const nowMs = Date.now();
    consolidatedClusters.sort((a, b) => {
      const ageHoursA = a.newestMs ? Math.max(0, (nowMs - a.newestMs) / 3600000) : 48;
      const ageHoursB = b.newestMs ? Math.max(0, (nowMs - b.newestMs) / 3600000) : 48;
      const recencyBoostA = ageHoursA <= 24 ? 1.35 : 0.75;
      const recencyBoostB = ageHoursB <= 24 ? 1.35 : 0.75;
      const scoreA = a.outletCount * (a.sentimentSpread + 0.15) * recencyBoostA;
      const scoreB = b.outletCount * (b.sentimentSpread + 0.15) * recencyBoostB;
      return scoreB - scoreA;
    });
    consolidatedClusters.forEach(c => {
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
  const lines = clusters.map((c, idx) => {
    const id = c.id || slugify(c.story);
    const sampleOutlets = (c.coverage || []).slice(0, 4).map(a => a.sourceId).join(',');
    const sampleHeadlines = (c.coverage || []).slice(0, 3).map(a => `${a.sourceId}: "${a.title}"`).join(' | ');
    let line = `[${idx}] id="${id}" (v${c.version || 1}) | "${c.story}" (${c.outletCount || c.coverage?.length || 2} outlets: ${sampleOutlets}) — ${c.summary || ''}`;
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
      line += `\n    [CANDIDATE IN-PLACE UPDATE: +${c._pendingUpdate.addedHeadlines.length} new dispatches -> ${c._pendingUpdate.addedHeadlines.join(' | ')}]`;
    }
    return line;
  }).join('\n');

  const prompt = `You are the Executive Editor of a global news intelligence wire.
Below are ${clusters.length} story clusters currently active across our rolling 7-day window, including each cluster's current summary, [PRIMARY HEADLINES], any [PRIOR RECORDED HISTORY], and any [CANDIDATE IN-PLACE UPDATE] dispatches.

FIRST-PRINCIPLES META-RULE — INTRA-STATE RESOLUTION ("clarification") vs. STATE-ENVELOPE SHIFT ("material_shift"):
Every news story has a current State Envelope defined by:
  (A) Active Jurisdictions & Actors (where and between whom the active phenomenon is occurring),
  (B) Institutional / Legal / Operational Regime (what formal powers, legal statuses, or operational timelines are in force),
  (C) Causal Phase & Outcome Direction (whether the situation is escalating, reversing, or resolved).

When new dispatches arrive on a story, or when two clusters relate to the same story, distinguish between THREE states:
1. "none" (Redundant / Syndication Catch-Up — Omit):
   - The new dispatches merely restate milestones already present in the cluster's existing headline, summary, or [PRIOR RECORDED HISTORY] (e.g. reporting a hospital discharge when the summary already states the patient left the hospital and resumed public duties, or repeating a casualty tally of 53 when the headline already says "Kills 53"). Omit these completely!

2. "clarification" (Intra-State Resolution — Sharpening Facts Within the Existing Envelope):
   - The new dispatches increase factual precision, granularity, or post-event texture WITHOUT crossing a boundary of the existing State Envelope:
     • Refining a metric or tally of an already-reported action (e.g. "thousands arrested" -> "nearly 2,400 arrested"; "large drone barrage" -> "over 1,000 drones and 1 fatality"),
     • Identifying or profiling already-counted victims/participants (e.g. releasing the names of the 4 deceased soldiers; noting a US photojournalist was among the diplomats attacked),
     • Forensic or technical mechanics of how the original incident unfolded (e.g. how fast a grass fire moved; aftermath property damage assessments),
     • Routine rhetorical reactions, blame-trading, or an official publicly defending their own already-announced decision ("Trump defends his sanctions waiver").
   - For "clarification": we refine the cluster's "summary" so readers get the sharper facts, but we DO NOT bump the version or rename the headline as a new breaking phase.

3. "material_shift" (State-Envelope Crossing — Structural Step-Change):
   - At least ONE fact in the new dispatches crosses the boundary of the prior State Envelope:
     • Spatial / Jurisdictional Boundary: The active phenomenon physically enters ANY new sovereign country, state, or distinct theatre not yet named in the prior summary (even if the prior summary already used plural phrasing like "neighboring countries" or had previously crossed one border, every newly entered country/jurisdiction is a State-Envelope Shift),
     • Institutional / Legal / Timeline Regime Change: Authorities invoke or formally weigh extraordinary legal/coercive regimes (curfews, state of emergency, criminal indictments), a suspect is released without charges, or an actor overrides/accelerates an established operational timeline (e.g. moving a November start date to begin immediately despite a court order),
     • Outcome / Premise Reversal: A critical threat or premise is resolved or reversed (e.g. a mid-air bomb threat emergency landing is cleared with no explosives found onboard; a ceasefire collapses).

DISJUNCTIVE (OR-GATE) BATCH PRINCIPLE & AUTOREGRESSIVE ORDERING:
- When a batch of incoming dispatches mixes routine commentary/reaction headlines with 1 or more headlines that cross a State Envelope boundary, you must NEVER average the batch into "clarification". The presence of ANY single State-Envelope crossing makes the update a "material_shift".
- If a batch crosses MULTIPLE boundaries at once (e.g. unrest spreads to a new country AND officials weigh emergency powers/curfews), synthesize ALL boundary-crossing shifts in "developmentNote" and "summary".
- Always generate "developmentNote" and "stateBoundaryCrossed" FIRST before deciding "updateType".
- HEADLINE CONTINUITY RULE (for material_shift): Keep the recognizable origin/subject anchor AND prior geographic scope from the existing headline while appending/reflecting the new shift so readers never lose the thread (e.g. "French Cost-of-Living Protests Spread to Italy and Belgium").

You have THREE jobs in this single pass:

JOB 1 — "merges" (Strict Duplicate-Incident Consolidation — Return [] If None):
Identify ONLY pairs of clusters whose [PRIMARY HEADLINES] report the EXACT SAME specific physical incident, legislative bill, court ruling, or scientific study (e.g. two clusters that both report on the exact same train crash, or an earlier cluster on a protest and a newer cluster on that exact same protest spreading):
- CRITICAL NEGATIVE RULE: NEVER put two clusters in "merges" if they are different events, policies, debates, or studies that merely involve the same country, leader, election campaign, or war!
  • Example of FORBIDDEN merge: "Amazon Deforestation Falls to Record Low" + "Brazil Approves Shorter Workweek" + "Lula and Bolsonaro Spar in Debate" are THREE COMPLETELY DIFFERENT EVENTS (one is satellite climate data, one is a Congressional labor bill, one is a TV debate). They must NEVER appear in "merges" — put them in "lateralConnections" (Job 3) instead!
- If no two clusters report the exact same specific incident, return "merges": [].
- For any valid merge, only set "updateType": "material_shift" if the newer cluster introduces a strictly subsequent chronological phase that crosses a State-Envelope boundary; otherwise set "updateType": "clarification" (deduplication).

JOB 2 — "inPlaceDevelopments" (Evaluating [CANDIDATE IN-PLACE UPDATE] Dispatches):
Evaluate ONLY clusters that have a "[CANDIDATE IN-PLACE UPDATE]" line:
- If the new dispatches are redundant with the existing headline, summary, or [PRIOR RECORDED HISTORY], omit the cluster (or set "updateType": "none").
- Otherwise, generate "developmentNote" and "stateBoundaryCrossed" first, then set "updateType": "clarification" | "material_shift" using the State-Envelope Meta-Rule and Disjunctive Batch Principle.

JOB 3 — "lateralConnections" (Interacting / Same-Campaign / Same-Theatre Clusters That Must Stay Separate):
Identify pairs of DISTINCT clusters that share a political campaign, country backdrop, or causal interaction without being the same specific incident (e.g. separate policy milestones ahead of Brazil's runoff election, or international leaders commenting on another country's unrest):
- Keep them as separate clusters (NEVER put them in "merges"), and record their connection here.

Clusters:
${lines}

Return ONLY valid JSON in this exact field order (use "merges": [] if no two clusters are the exact same incident):
{
  "merges": [
    {
      "indices": [13, 14],
      "sharedSpecificIncident": "Name the single specific incident/bill/study both clusters report on (never a broad country or election campaign)",
      "developmentNote": "For clarification: 1-2 ultra-succinct telegraphic bullet fragments separated by '; ' (5-10 words each). For material_shift: 1 crisp sentence synthesizing all boundary-crossing shifts.",
      "stateBoundaryCrossed": "State which envelope boundary(ies) were crossed (Spatial/Jurisdictional, Institutional/Timeline Regime, Outcome Reversal), or 'None — duplicate/clarification'",
      "updateType": "clarification" | "material_shift",
      "story": "Updated 4-8 Word Title Keeping Origin Anchor + Key Shift (only used if material_shift)",
      "summary": "1-2 sentence synthesis with organic temporal grounding."
    }
  ],
  "inPlaceDevelopments": [
    {
      "index": 4,
      "developmentNote": "For clarification: 1-2 ultra-succinct telegraphic bullet fragments separated by '; ' stating strictly what fact changed (5-10 words each, e.g. 'First official Vatican photos released; greeted St. Peter\\'s Square crowd' — no filler like 'New dispatches reported'). For material_shift: 1 crisp sentence synthesizing all boundary-crossing shifts in this batch.",
      "stateBoundaryCrossed": "State which envelope boundary(ies) were crossed (Spatial/Jurisdictional, Institutional/Timeline Regime, Outcome Reversal), or 'None — intra-state detail/rhetoric'",
      "updateType": "clarification" | "material_shift",
      "story": "Updated 4-8 Word Title Keeping Origin Anchor + Key Shift (only used if material_shift)",
      "summary": "1-2 sentence synthesis reflecting the clarified facts or new development."
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
    let parsed = null;
    for (const keyObj of activeTiers) {
      try {
        const genAI = new GoogleGenerativeAI(keyObj.key);
        const model = genAI.getGenerativeModel({
          model: 'gemini-3.5-flash-lite',
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
        });
        const resp = await model.generateContent(prompt);
        parsed = JSON.parse(resp.response.text().trim());
        break;
      } catch (tierErr) {
        const msg = String(tierErr.message || tierErr);
        console.warn(`[Clusters] Consolidation pass warning [${keyObj.tier} key]: ${msg}`);
        if (keyObj.tier === 'FREE' && activeTiers.length > 1) {
          freeKeyExhaustedThisRun = true;
          console.log('[Clusters] Switching consolidation pass to PAID fallback key...');
        } else {
          throw tierErr;
        }
      }
    }
    const rawMerges = Array.isArray(parsed?.merges) ? parsed.merges : [];
    const inPlaceDevs = Array.isArray(parsed?.inPlaceDevelopments) ? parsed.inPlaceDevelopments : [];
    const lateralLinks = Array.isArray(parsed?.lateralConnections) ? parsed.lateralConnections : [];
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
      if (lateralPairKeys.has(pairKey)) return false;
      return true;
    });

    // Apply verified in-place developments & clarifications first
    const inPlaceByIdx = new Map();
    for (const dev of inPlaceDevs) {
      if (dev?.updateType === 'none') continue;
      if (Number.isInteger(dev?.index) && dev.index >= 0 && dev.index < clusters.length && (dev.summary || dev.story)) {
        inPlaceByIdx.set(dev.index, dev);
      }
    }

    let materialInPlaceCount = 0;
    let clarificationInPlaceCount = 0;

    for (const [idx, dev] of inPlaceByIdx.entries()) {
      const c = clusters[idx];
      const uType = dev.updateType === 'material_shift' ? 'material_shift' : 'clarification';
      const newSummary = (dev.summary && dev.summary.trim()) || c.summary;
      const noteText = (dev.developmentNote && dev.developmentNote.trim()) || '';

      // Guard against no-op or duplicate note already in evolutionHistory
      const hist = Array.isArray(c.evolutionHistory) ? c.evolutionHistory : [];
      const alreadyRecorded = hist.some(h =>
        (noteText && h.note && h.note.toLowerCase() === noteText.toLowerCase()) ||
        (newSummary && h.summary && h.summary.toLowerCase() === newSummary.toLowerCase())
      );
      if (alreadyRecorded) continue;

      const beforeSnapshot = {
        id: c.id || slugify(c.story),
        version: typeof c.version === 'number' ? c.version : 1,
        story: c.story,
        summary: c.summary,
        outletCount: c.outletCount || (c.coverage || []).length || 1
      };

      const ts = new Date(c._pendingUpdate?.newestAddedMs || c.newestMs || Date.now()).toISOString();

      if (uType === 'material_shift') {
        materialInPlaceCount++;
        const oldSlug = c.id || slugify(c.story);
        const newStory = (dev.story && dev.story.trim()) || c.story;
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
          headline: c.story,
          summary: c.summary,
          beforeStory: beforeSnapshot.story,
          beforeSummary: beforeSnapshot.summary,
          outletCount: afterSnapshot.outletCount,
          note: c.developmentNote
        });
        c.evolutionHistory = hist.slice(-8);

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
        // 'clarification': silent summary refinement without bumping version or triggering unread alert
        clarificationInPlaceCount++;
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
          headline: c.story,
          summary: c.summary,
          beforeStory: beforeSnapshot.story,
          beforeSummary: beforeSnapshot.summary,
          outletCount: afterSnapshot.outletCount,
          note: noteText || 'Factual details and figures clarified across incoming dispatches'
        });
        c.evolutionHistory = hist.slice(-8);

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
    for (const link of lateralLinks) {
      const idxs = (link?.indices || []).filter(i => Number.isInteger(i) && i >= 0 && i < clusters.length);
      if (idxs.length < 2 || !link.howItConnects) continue;
      const [idxA, idxB] = idxs;
      if (idxA === idxB) continue;
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

    if (merges.length === 0) {
      appendClusterUpdateAuditLog(auditLogEntries);
      if (materialInPlaceCount > 0 || clarificationInPlaceCount > 0) {
        console.log(`[Clusters] Verified ${materialInPlaceCount} material shifts and ${clarificationInPlaceCount} silent clarifications.`);
      }
      return clusters;
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
      const finalStory = isDev ? ((m.story && m.story.trim()) || anchor.story) : (anchor.story || (m.story && m.story.trim()));
      const finalSlug = isDev ? slugify(finalStory) : (anchor.id || slugify(finalStory));
      const finalSummary = (m.summary && m.summary.trim()) || anchor.summary;
      evolvedIds.delete(finalSlug);

      const nextVersion = isDev ? (maxVersion + 1) : maxVersion;
      const ts = new Date(maxNewestMs || Date.now()).toISOString();
      const nextDevelopedAt = isDev ? ts : bestLastDevelopedAt;
      const nextDevNote = isDev
        ? ((m.developmentNote && m.developmentNote.trim()) || `Story evolved: ${finalStory}`)
        : bestDevelopmentNote;

      const hist = Array.isArray(originAnchor.evolutionHistory) ? [...originAnchor.evolutionHistory] : [{
        version: 1,
        type: 'initial',
        timestamp: originAnchor.firstSeenAt || new Date(getEarliestMs(originAnchor) < Infinity ? getEarliestMs(originAnchor) : (maxNewestMs || Date.now())).toISOString(),
        headline: originAnchor.story,
        summary: originAnchor.summary,
        outletCount: originAnchor.outletCount || 2,
        note: 'Initial cluster formation on the wire'
      }];

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

      result.push({
        ...anchor,
        id: finalSlug,
        story: finalStory,
        summary: finalSummary,
        version: nextVersion,
        ...(nextDevelopedAt ? { lastDevelopedAt: nextDevelopedAt } : {}),
        ...(nextDevNote ? { developmentNote: nextDevNote } : {}),
        evolvedFromIds: Array.from(evolvedIds),
        evolutionHistory: hist.slice(-8),
        seenArticleKeys: Array.from(mergedSeenKeys).slice(-120),
        averageSentiment: avgScore,
        sentimentSpread: spreadRange,
        outletCount: dedupedCov.length,
        newestMs: maxNewestMs || Date.now(),
        coverage: dedupedCov
      });
    }

    clusters.forEach((c, idx) => {
      if (!consumed.has(idx)) result.push(c);
    });

    appendClusterUpdateAuditLog(auditLogEntries);
    console.log(`[Clusters] Consolidated ${merges.length} cluster groups (${materialInPlaceCount} material shifts, ${clarificationInPlaceCount} silent clarifications, ${clusters.length} -> ${result.length} clusters).`);
    return result;
  } catch (e) {
    console.warn('[Clusters] Consolidation pass skipped:', e.message);
    return clusters;
  }
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
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  // Build lookup of already analyzed articles
  const existingMap = new Map();
  if (currentCache.sources) {
    Object.keys(currentCache.sources).forEach(sourceId => {
      const src = currentCache.sources[sourceId];
      if (src && src.articles) {
        src.articles.forEach(art => {
          const tKey = `${sourceId}_title_${cleanHeadlineTitle(art.title)}`;
          existingMap.set(tKey, art);
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
            cached.pubDate = item.pubDate;
            cached.title = item.title;
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
            if (res.summary && needsCleanEditorialSummary(target.description, target.title)) {
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

  // 5.7 Cross-Outlet Story Clustering (Method A: Single Aggregation Pass)
  // Runs on a regular interval (default: every 3 hours, or via --force / --cluster)
  // OR immediately when the zero-LLM Cross-Region Burst Detector spots >=4 outlets across >=3 global regions
  // converging on a stemmed token pair within a 90-minute rolling window.
  let sharedStoryClusters = currentCache.sharedStoryClusters || [];
  let lastClusteredAt = currentCache.lastClusteredAt || (currentCache.globalStats && currentCache.globalStats.lastClusteredAt) || null;
  const clusterIntervalHours = Number(process.env.CLUSTER_INTERVAL_HOURS || 3);
  const hoursSinceLastCluster = lastClusteredAt ? (now.getTime() - new Date(lastClusteredAt).getTime()) / (1000 * 60 * 60) : Infinity;
  const forceCluster = process.argv.includes('--force') || process.argv.includes('--cluster') || process.argv.includes('--recalc-24h');
  const breakingBurst = detectCrossRegionBreakingBurst(finalSources, sharedStoryClusters, lastClusteredAt, now.getTime());
  const shouldRunClustering = forceCluster || sharedStoryClusters.length === 0 || hoursSinceLastCluster >= clusterIntervalHours || Boolean(breakingBurst);

  if (shouldRunClustering) {
    try {
      if (breakingBurst && hoursSinceLastCluster < clusterIntervalHours && !forceCluster) {
        console.log(`[Burst Signal] ⚡ Breaking cross-region convergence detected ("${breakingBurst.pair}" across ${breakingBurst.outlets} outlets / ${breakingBurst.regions} regions: ${breakingBurst.regionList.join(', ')}) — "${breakingBurst.sampleTitle}"`);
      }
      if (!freeKeyExhaustedThisRun && newlyAnalyzedCount > 0) {
        console.log('[Sync] Pausing 6s before story clustering to avoid free-tier RPM/TPM collision...');
        await new Promise(r => setTimeout(r, 6000));
      }
      const orderedTiersLabel = getOrderedKeyTiers(geminiKeyTiers).map(t => t.tier).join(' -> ');
      console.log(`[Sync] Running cross-outlet story clustering (tiers: ${orderedTiersLabel}, reason: ${forceCluster ? 'forced' : (breakingBurst && hoursSinceLastCluster < clusterIntervalHours ? 'breaking-burst' : 'scheduled')}, last run: ${lastClusteredAt ? hoursSinceLastCluster.toFixed(1) + 'h ago' : 'never'})...`);
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
    console.log(`[Sync] Skipping story clustering (last clustered ${hoursSinceLastCluster.toFixed(1)}h ago; interval is ${clusterIntervalHours}h; no cross-region burst).`);
  }

  // Always synchronize cluster coverage sentiment scores with the latest article scores in finalSources
  if (Array.isArray(sharedStoryClusters) && sharedStoryClusters.length > 0) {
    sharedStoryClusters.forEach(cl => {
      if (!Array.isArray(cl.coverage)) return;
      cl.coverage.forEach(cov => {
        const srcArts = finalSources[cov.sourceId]?.articles || [];
        const match = srcArts.find(a =>
          (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
          (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
        );
        if (match && typeof match.sentiment === 'number') {
          cov.sentiment = match.sentiment;
        }
      });
      const validScores = cl.coverage.map(c => c.sentiment).filter(s => typeof s === 'number');
      if (validScores.length > 0) {
        cl.averageSentiment = Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2));
        cl.sentimentSpread = Number((Math.max(...validScores) - Math.min(...validScores)).toFixed(2));
      }
    });
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
  const { exportPublicJsonFeeds } = require('./export-feeds');
  const { enrichedClusters } = exportPublicJsonFeeds(fullPayload);
  fullPayload.sharedStoryClusters = enrichedClusters;
  summaryPayload.sharedStoryClusters = enrichedClusters;

  // Save primary outputs
  fs.writeFileSync(DATA_FILE, JSON.stringify(fullPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'data.json'), JSON.stringify(fullPayload), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'summary.json'), JSON.stringify(summaryPayload), 'utf8');

  console.log('==============================================');
  console.log('✅ Sync Completed Successfully!');
  console.log(`📁 Historical archive: data/vibe-data.json (${(fs.statSync(DATA_FILE).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`⚡ Public baked data: public/data/data.json (${(fs.statSync(path.join(PUBLIC_DATA_DIR, 'data.json')).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`🚀 Ultra-light summary: public/data/summary.json (${(fs.statSync(path.join(PUBLIC_DATA_DIR, 'summary.json')).size / 1024).toFixed(1)} KB)`);
  console.log(`📡 Public JSON API feeds: public/data/{index,clusters,good-news,outlets,timeseries}.json`);
  console.log('==============================================');

  // 8. Optional On-Demand Auto-Push (for instant Antigravity or local CLI trigger)
  if (process.argv.includes('--push')) {
    const { execSync } = require('child_process');
    try {
      console.log('[Git] Staging updated vibe datasets...');
      execSync('git add data/vibe-data.json data/cluster-updates-log.json public/data/', { stdio: 'inherit' });
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

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});

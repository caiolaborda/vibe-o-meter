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
  { id: 'bbc', name: 'BBC News', feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'nyt', name: 'The New York Times', feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { id: 'cnn', name: 'CNN', feedUrl: 'https://news.google.com/rss/search?q=site:cnn.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'guardian', name: 'The Guardian', feedUrl: 'https://www.theguardian.com/uk/rss' },
  { id: 'fox', name: 'Fox News', feedUrl: 'https://feeds.foxnews.com/foxnews/latest' },
  { id: 'aljazeera', name: 'Al Jazeera', feedUrl: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'npr', name: 'NPR News', feedUrl: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'cnbc', name: 'CNBC News', feedUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'skynews', name: 'Sky News', feedUrl: 'https://feeds.skynews.com/feeds/rss/home.xml' },
  { id: 'spiegel', name: 'Spiegel International', feedUrl: 'https://www.spiegel.de/international/index.rss' },
  { id: 'reuters', name: 'Reuters', feedUrl: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'ap', name: 'Associated Press', feedUrl: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'bloomberg', name: 'Bloomberg', feedUrl: 'https://news.google.com/rss/search?q=site:bloomberg.com&hl=en-US&gl=US&ceid=US:en' },
  { id: 'dw', name: 'DW News', feedUrl: 'https://rss.dw.com/rdf/rss-en-all' },
  { id: 'wsj', name: 'Wall Street Journal', feedUrl: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
  { id: 'france24', name: 'France 24', feedUrl: 'https://www.france24.com/en/rss' },
  { id: 'politico', name: 'Politico', feedUrl: 'https://rss.politico.com/politics-news.xml' }
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
    .replace(/\s*[-–—|]\s*(reuters|bbc|cnn|fox news|the guardian|ap news|associated press|bloomberg|nyt|new york times|al jazeera|npr|cnbc|sky news|spiegel|dw|france 24|politico|wsj).*$/i, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Extract richest lead paragraph from multiple RSS/Atom summary tags
function extractBestDescription(item) {
  const candidates = [
    item.contentEncoded,
    item.atomSummary,
    item.contentSnippet,
    item.summary,
    item.description,
    item.content,
    item.mediaDescription,
    item.itunesSummary
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 15) {
      const clean = sanitizeText(c);
      if (clean.length > 15) {
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
    u.includes('favicon')
  );
}

function extractImageUrl(item) {
  if (!item) return null;
  // 1. Enclosure
  if (item.enclosure && isRealEditorialImageUrl(item.enclosure.url) && (!item.enclosure.type || item.enclosure.type.startsWith('image/'))) {
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

// Interleave articles across outlets (round-robin) so every batch contains a cross-outlet mix of the current news cycle
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
  return interleaved;
}

// Structured Gemini sentiment analysis with cross-outlet batching & 2-step Event Base + Editorial Framing rubric
async function analyzeWithGemini(headlines, apiKey, requestedModel) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    requestedModel,
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  // Interleave across outlets so simultaneous coverage of the same story sits in the same context window
  const orderedHeadlines = interleaveByOutlet(headlines);
  const BATCH_SIZE = 45;
  const allResults = [];
  let modelUsed = modelsToTry[0];

  for (let i = 0; i < orderedHeadlines.length; i += BATCH_SIZE) {
    const chunk = orderedHeadlines.slice(i, i + BATCH_SIZE);
    const promptData = chunk.map((item, index) => ({
      index,
      outlet: item.sourceId,
      headline: item.title,
      description: item.description || ''
    }));

    const prompt = `You are a world-class news sentiment analyst and senior media editor.
Evaluate each article on a continuous -1.00 to +1.00 scale by computing TWO components and summing them:
  FINAL SCORE = EVENT BASE (-0.85 to +0.85) + EDITORIAL FRAMING (-0.15 to +0.15)

STEP 1: EVENT BASE (-0.85 to +0.85) — Strictly by Scope & Permanence of Human Impact:
Determine the inherent real-world valence of the underlying event based on how many lives it affects and how lasting the consequence is (NEVER anchor to topic/category labels):
- Civilizational / Mass-Scale & Lasting (-0.85 to -0.65 OR +0.65 to +0.85):
  * Negative (-0.85 to -0.65): Active warfare, deadly bombings/strikes, mass casualties, famine, systemic catastrophe.
  * Positive (+0.65 to +0.85): Historic peace accords ending war, curing/eradicating a major disease, paradigm-shifting scientific or clean-energy breakthroughs, systemic human rights or poverty victories.
- Societal / National / Multi-Year (-0.60 to -0.35 OR +0.35 to +0.60):
  * Negative (-0.60 to -0.35): Armed standoff, severe disaster damage, mass layoffs, major corruption/abuse indictments, democratic or institutional breakdown, solemn obituaries.
  * Positive (+0.35 to +0.60): Binding diplomatic treaties, tangible household cost-of-living/debt relief, verified ecological/species recovery, major archaeological or scientific discoveries, wrongful-conviction exonerations.
- Organizational / Localized / Transitory (-0.30 to -0.10 OR +0.10 to +0.30):
  * Negative (-0.30 to -0.10): Partisan political friction, single-company stock dip or fine, localized dispute, minor price uptick.
  * Positive (+0.10 to +0.30): Single-company quarterly earnings/revenue beat, corporate IPO/investment, routine sports championship, celebrity/cultural milestone, localized civic win. (Routine corporate profit reports belong here in +0.10 to +0.25, NEVER above +0.30).
- Procedural / Status Quo (-0.08 to +0.08):
  * Scheduled hearings, routine governance/appointments without crisis, standard weather or cultural reviews.

STEP 2: EDITORIAL FRAMING MODIFIER (-0.15 to +0.15) — How This Outlet Phrased the Headline:
Compare the headline's language against a plain, neutral wire-service statement of the same fact:
- [-0.15 to -0.05] Alarmist / Polarising / Conflict-Amplifying: Uses loaded conflict verbs ("slams", "betrayed", "crushed", "chaos", "crisis"), fear-inducing speculation, or highlights worst-case confrontation.
- [0.00] Matter-of-Fact / Neutral Reporting: Reports the event plainly without emotional spin.
- [+0.05 to +0.15] Constructive / Composed / Solution-Oriented: Highlights verified resilience, cooperation, de-escalation, or forward progress.

CRITICAL CONSISTENCY RULES:
1. Cross-Outlet Parity within Batch: If multiple articles in this batch cover the SAME underlying event, they MUST share the exact same EVENT BASE, differing ONLY by their Editorial Framing Modifier (-0.15 to +0.15). If two headlines state the same fact in plain language, give them virtually identical scores.
2. Counterfactual Harm & Criminal Trials: Criminal convictions, guilty pleas, prison sentences, regulatory fines, or lawsuits for violent crimes, fraud, or disasters are reactions to underlying harm. Grade them in the negative range (-0.20 to -0.55) reflecting the crime/harm—NEVER score a criminal conviction or sentencing as positive "good news" (+). Only overturning a wrongful conviction or freeing a hostage/prisoner of conscience is positive.
3. Explainers, Multi-Part Series & Mixed-Outlook Profiles:
   - Grade explainers ("What is X?", "Why Y matters") on the Event Base of the real-world situation they are explaining.
   - Multi-part background series ("In the final part of our series...", "Part 1 of..."), retrospective historical profiles, and mixed-caveat economic essays (where growth or wage gains are paired with rising cost-of-living, inflation, or military spending anxieties) are NOT breaking positive breakthroughs: cap them between +0.05 and +0.25 (NEVER above +0.28). Reserve +0.35 to +1.00 strictly for concrete, timely news events, scientific/medical breakthroughs, treaties, and verified outcomes.
4. Continuous Precision & Valid JSON: Use precise 2-decimal floats across the full spectrum (do not cluster on .15, .35, .42, or .45). Never prepend '+' to positive numbers in JSON.

Return a JSON array of objects with:
- index: integer matching input index
- score: float between -1.00 and 1.00 (Event Base + Framing Modifier, rounded to 2 decimal places)
- category: strictly one of 'world', 'politics', 'business', 'technology', 'science', 'climate', 'health', 'entertainment', 'sports', 'other'
- explanation: concise 1-sentence rationale noting both event impact and headline framing

Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY valid JSON.`;

    let batchSuccess = false;
    for (const modelName of modelsToTry) {
      if (batchSuccess) break;
      const maxAttempts = modelName.includes('lite') ? 2 : 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`[Gemini] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(orderedHeadlines.length / BATCH_SIZE)} (${chunk.length} items) using ${modelName} (attempt ${attempt}/${maxAttempts})...`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
          });

          const generatePromise = model.generateContent(prompt);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Gemini API call timed out after 90s')), 90000)
          );
          const response = await Promise.race([generatePromise, timeoutPromise]);
          let text = response.response.text().trim();
          if (text.startsWith('```json')) text = text.substring(7);
          else if (text.startsWith('```')) text = text.substring(3);
          if (text.endsWith('```')) text = text.substring(0, text.length - 3);
          text = tryRepairJsonArray(text.trim());

          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            chunk.forEach((item, idx) => {
              const match = parsed.find(r => r.index === idx) || { score: 0, category: 'other' };
              const cleanScore = Number(Math.max(-1, Math.min(1, Number(match.score) || 0)).toFixed(2));
              allResults.push({
                sourceId: item.sourceId,
                title: item.title,
                link: item.link,
                sentiment: cleanScore,
                category: match.category || 'other',
                explanation: match.explanation || `Analyzed via Gemini (${modelName}).`
              });
            });
            modelUsed = modelName;
            batchSuccess = true;
            break;
          }
        } catch (err) {
          const isDemandSpike = err.message && (err.message.includes('503') || err.message.includes('429') || err.message.includes('high demand') || err.message.includes('timed out'));
          console.warn(`[Gemini] Model ${modelName} attempt ${attempt}/${maxAttempts} warning:`, err.message || err);
          if (attempt < maxAttempts) {
            const waitMs = isDemandSpike ? (attempt === 1 ? 5000 : 12000) : 2500;
            await new Promise(r => setTimeout(r, waitMs));
          }
        }
      }
    }

    if (!batchSuccess) {
      console.warn(`[Gemini] Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} items) could not be evaluated due to temporary upstream spikes. STRICT ZERO-OFFLINE POLICY: Skipping batch without offline fallback. Articles remain queued for next sync.`);
    }

    if (i + BATCH_SIZE < orderedHeadlines.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return { results: allResults, modelUsed };
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

// Normalize common geopolitical/spelling variants for cross-outlet entity matching
function normalizeClusterTokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/türkiye|turkiye|turkish/g, 'turkey')
    .replace(/britain|british|\buk\b/g, 'uk')
    .replace(/united states|\bu\.s\.\b|\busa\b|american/g, 'usa')
    .replace(/zelenskyy/g, 'zelensky')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !CLUSTER_STOP_WORDS.has(w));
}

const CLUSTER_STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'amid', 'among', 'around', 'back', 'before', 'behind',
  'between', 'beyond', 'both', 'calls', 'claim', 'claims', 'could', 'dead', 'despite', 'down',
  'First', 'first', 'five', 'four', 'from', 'good', 'have', 'high', 'home', 'into', 'just',
  'know', 'last', 'late', 'latest', 'lead', 'left', 'life', 'like', 'live', 'lives', 'long',
  'look', 'made', 'make', 'makes', 'many', 'more', 'most', 'much', 'must', 'near', 'need',
  'news', 'next', 'nine', 'only', 'open', 'other', 'over', 'part', 'past', 'plan', 'plans',
  'play', 'post', 'push', 'report', 'reports', 'right', 'rise', 'rule', 'rules', 'said',
  'says', 'second', 'seen', 'seek', 'seeks', 'seven', 'show', 'shows', 'side', 'since',
  'some', 'soon', 'state', 'states', 'still', 'stop', 'take', 'takes', 'talk', 'talks',
  'team', 'tell', 'tells', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'three', 'time', 'times', 'today', 'amid', 'told', 'took', 'turn', 'turns',
  'under', 'until', 'upon', 'used', 'very', 'vote', 'want', 'wants', 'warn', 'warns', 'week',
  'weeks', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'within',
  'without', 'work', 'works', 'world', 'would', 'year', 'years', 'found', 'thought'
]);

// Cross-Outlet Story Clustering (Method A: Fast, Fresh Single-Pass Aggregation)
async function clusterCrossOutletStories(finalSources, apiKey) {
  if (!apiKey) return [];
  
  // Focus on fresh headlines from the past 30h (up to 32 per outlet, ~420 total) so Gemini responds in <12s without truncation
  const candidates = [];
  const thirtyHoursAgo = Date.now() - (30 * 60 * 60 * 1000);
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);

  Object.entries(finalSources).forEach(([sourceId, src]) => {
    const articles = src.articles || [];
    let addedForSource = 0;
    for (let i = 0; i < articles.length; i++) {
      const art = articles[i];
      if (!art || !art.title || art.title.trim().length <= 10) continue;
      const t = art.pubDate ? new Date(art.pubDate).getTime() : NaN;
      if (!isNaN(t) && t < threeDaysAgo) continue;

      const isRecent30h = !isNaN(t) && t >= thirtyHoursAgo;
      if (addedForSource >= 32) break;
      if (!isRecent30h && addedForSource >= 10) continue;

      candidates.push({
        sourceId,
        sourceName: src.name,
        title: art.title.trim(),
        sentiment: typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0),
        link: art.link || '',
        pubDate: art.pubDate || ''
      });
      addedForSource++;
    }
  });

  if (candidates.length < 6) return [];

  // Pass compact indexed single-line headline list so Gemini scans fresh headlines with high recall
  const promptLines = candidates.map((c, idx) => `[${idx}] ${c.sourceId}: ${c.title}`).join('\n');
  const prompt = `You are a senior news editor analyzing recent headlines across global newsrooms.
Identify real-world events, developments, and discoveries that are being covered by 2 or more DIFFERENT news outlets.
Group them into story clusters.

Rules:
- A cluster MUST include headlines from at least 2 distinct outlets reporting on the SAME underlying event, development, or discovery.
- Group ALL matching headlines for the event across all outlets (scan the entire list carefully so every outlet covering that story is included in "ids", including spelling variations like Turkey/Turkiye).
- Provide a concise neutral story title (3-6 words, e.g. "Ancient Shipwreck Found Off Turkey", "Brazil Approves Shorter Workweek", "Boeing Machinist Strike", "Federal Reserve Rate Cut").
- Provide a concise 1-2 sentence editorial summary explaining the core real-world event and how the outlets are reporting it.
- Provide the list of matching headline IDs.
- Return ONLY a JSON array. If no shared stories exist, return [].

Headlines:
${promptLines}

Return JSON array in format:
[
  { "story": "Topic Title", "summary": "1-2 sentence editorial summary of the event.", "ids": [0, 4, 12] }
]`;

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let clusters = null;
  for (const modelName of modelsToTry) {
    if (clusters) break;
    const maxAttempts = modelName.includes('lite') ? 1 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: 'application/json' }
        });
        const generatePromise = model.generateContent(prompt);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Clustering call timed out after 90s')), 90000)
        );
        const resp = await Promise.race([generatePromise, timeoutPromise]);
        let text = resp.response.text().trim();
        if (text.startsWith('```json')) text = text.substring(7);
        else if (text.startsWith('```')) text = text.substring(3);
        if (text.endsWith('```')) text = text.substring(0, text.length - 3);
        const parsed = JSON.parse(tryRepairJsonArray(text.trim()));
        if (Array.isArray(parsed) && parsed.length > 0) {
          clusters = parsed;
          console.log(`[Clusters] Generated ${parsed.length} clusters using ${modelName}.`);
          break;
        }
      } catch (err) {
        console.warn(`[Sync] Clustering attempt ${attempt}/${maxAttempts} with ${modelName} failed: ${err.message}`);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
  }

  if (Array.isArray(clusters)) {
    const formattedClusters = [];
    const candidateTokens = candidates.map(c => new Set(normalizeClusterTokens(c.title)));

    clusters.forEach(cl => {
      if (!cl.ids || cl.ids.length < 2) return;
      const idSet = new Set(cl.ids);
      const initialMatching = cl.ids.map(id => candidates[id]).filter(Boolean);
      if (initialMatching.length < 2) return;

      // Build core token frequency across the cluster's matched headlines + story title
      const tokenCounts = {};
      initialMatching.forEach(m => {
        normalizeClusterTokens(m.title).forEach(tok => {
          tokenCounts[tok] = (tokenCounts[tok] || 0) + 1;
        });
      });
      const storyTokens = new Set(normalizeClusterTokens(cl.story));
      // Core tokens: appear in >=2 cluster headlines (or >=1 if also in story title)
      const coreTokens = new Set(
        Object.keys(tokenCounts).filter(tok => tokenCounts[tok] >= 2 || (tokenCounts[tok] >= 1 && storyTokens.has(tok)))
      );

      // Sibling completion sweep: attach any missed candidate from another outlet that shares >= 3 core tokens
      if (coreTokens.size >= 3) {
        candidates.forEach((cand, idx) => {
          if (idSet.has(idx)) return;
          const toks = candidateTokens[idx];
          let sharedCore = 0;
          coreTokens.forEach(ct => { if (toks.has(ct)) sharedCore++; });
          if (sharedCore >= 3) {
            idSet.add(idx);
          }
        });
      }

      const rawMatching = Array.from(idSet).map(id => candidates[id]).filter(Boolean);
      rawMatching.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      const seenCovUrls = new Set();
      const seenCovTitles = new Set();
      const matchingArticles = [];
      for (const m of rawMatching) {
        const cUrl = `${m.sourceId}_${canonicalUrl(m.link)}`;
        const cTitle = `${m.sourceId}_${cleanHeadlineTitle(m.title)}`;
        if (seenCovUrls.has(cUrl) || seenCovTitles.has(cTitle)) continue;
        seenCovUrls.add(cUrl);
        seenCovTitles.add(cTitle);
        matchingArticles.push(m);
      }

      const uniqueSources = new Set(matchingArticles.map(m => m.sourceId));
      if (uniqueSources.size >= 2) {
        const scores = matchingArticles.map(m => m.sentiment);
        const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
        const spreadRange = Number((Math.max(...scores) - Math.min(...scores)).toFixed(2));
        const newestMs = matchingArticles[0]?.pubDate ? new Date(matchingArticles[0].pubDate).getTime() : 0;
        
        formattedClusters.push({
          story: cl.story,
          summary: cl.summary || '',
          averageSentiment: avgScore,
          sentimentSpread: spreadRange,
          outletCount: uniqueSources.size,
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
    // Weight recent 24h stories higher so fresh breaking stories rank above multi-day stale stories
    const nowMs = Date.now();
    formattedClusters.sort((a, b) => {
      const ageHoursA = a.newestMs ? Math.max(0, (nowMs - a.newestMs) / 3600000) : 48;
      const ageHoursB = b.newestMs ? Math.max(0, (nowMs - b.newestMs) / 3600000) : 48;
      const recencyBoostA = ageHoursA <= 24 ? 1.35 : 0.75;
      const recencyBoostB = ageHoursB <= 24 ? 1.35 : 0.75;
      const scoreA = a.outletCount * (a.sentimentSpread + 0.15) * recencyBoostA;
      const scoreB = b.outletCount * (b.sentimentSpread + 0.15) * recencyBoostB;
      return scoreB - scoreA;
    });
    formattedClusters.forEach(c => delete c.newestMs);
    return formattedClusters;
  }
  return [];
}

// Enrich top constructive/positive articles with Open Graph images if missing in RSS
async function enrichTopPositiveArticleImages(finalSources) {
  const allPositive = [];
  Object.values(finalSources).forEach(src => {
    (src.articles || []).forEach(art => {
      const score = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0);
      if (score >= 0.15 && !art.imageUrl && art.link && art.link.startsWith('http')) {
        allPositive.push({ art, score });
      }
    });
  });

  allPositive.sort((a, b) => b.score - a.score);
  const candidates = allPositive.slice(0, 15);
  if (candidates.length === 0) return;

  console.log(`[Image Enrichment] Checking OG images for ${candidates.length} top constructive articles...`);
  await Promise.all(candidates.map(async ({ art }) => {
    try {
      const res = await fetch(art.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return;
      const html = await res.text();
      const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (match && match[1] && match[1].startsWith('http')) {
        art.imageUrl = match[1];
        console.log(`  -> Attached OG image for: "${art.title.slice(0, 45)}..."`);
      }
    } catch (e) {
      // Non-blocking timeout / fetch error
    }
  }));
}

// Helper: check if an article has a valid Gemini evaluation (not an old local lexicon fallback)
function hasValidGeminiScore(art) {
  if (!art) return false;
  const exp = art.explanationGemini || art.explanation || '';
  if (exp.includes('Analyzed locally')) return false;
  const s = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : art.sentiment;
  return typeof s === 'number' && !isNaN(s);
}

// Helper: strip legacy AFINN/VADER/duplicate fields to keep JSON payload lean
function compactArticleRecord(art, sourceId) {
  const hasGemini = hasValidGeminiScore(art);
  const score = hasGemini ? Number((art.sentimentGemini ?? art.sentiment).toFixed(2)) : null;
  const category = art.categoryGemini || art.category || 'other';
  const explanation = hasGemini ? (art.explanationGemini || art.explanation || '') : undefined;

  const clean = {
    sourceId: art.sourceId || sourceId,
    title: art.title,
    description: art.description || '',
    link: art.link || '',
    ...(art.imageUrl ? { imageUrl: art.imageUrl } : {}),
    pubDate: art.pubDate
  };
  if (score !== null) {
    clean.sentiment = score;
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
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

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
      const items = (feed.items || []).slice(0, 25).map(item => ({
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
  const maxBacklog = process.argv.includes('--backlog') ? 120 : 40;
  let backlogAdded = 0;
  const unanalyzedKeys = new Set(unanalyzedArticles.map(a => `${a.sourceId}_${a.title.trim().toLowerCase()}`));
  for (const [key, article] of existingMap.entries()) {
    if (backlogAdded >= maxBacklog) break;
    if (!hasValidGeminiScore(article)) {
      const dedupeKey = `${article.sourceId}_${(article.title || '').trim().toLowerCase()}`;
      if (!unanalyzedKeys.has(dedupeKey)) {
        unanalyzedArticles.push(article);
        unanalyzedKeys.add(dedupeKey);
        backlogAdded++;
      }
    }
  }

  console.log(`[Queue] Found ${unanalyzedArticles.length} articles requiring Gemini sentiment analysis (${backlogAdded} pulled from historical backlog).`);

  // 2. Perform Gemini AI Analysis
  let activeAnalyzerLabel = currentCache.analyzerUsed || 'Gemini';
  let newlyAnalyzedCount = 0;
  let aiSuccess = false;

  if (unanalyzedArticles.length > 0) {
    if (geminiKey) {
      try {
        console.log(`[AI] Processing ${unanalyzedArticles.length} articles with Gemini (${geminiModel})...`);
        const geminiRes = await analyzeWithGemini(unanalyzedArticles, geminiKey, geminiModel);
        
        const articleMap = new Map();
        unanalyzedArticles.forEach(a => articleMap.set(`${a.sourceId}_${a.title.trim().toLowerCase()}`, a));

        geminiRes.results.forEach(res => {
          const key = `${res.sourceId}_${res.title.trim().toLowerCase()}`;
          const target = articleMap.get(key);
          if (target) {
            target.sentiment = res.sentiment;
            target.explanation = res.explanation;
            target.category = res.category;
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

  // 5.6 Daily Editorial Briefing (Decoupled call)
  const todayDateStr = now.toISOString().slice(0, 10);
  let editorialSummary = currentCache.editorialSummary || '';
  try {
    const briefing = await generateDailyBriefing({ force: process.argv.includes('--force') });
    if (briefing) {
      editorialSummary = briefing;
    }
  } catch (err) {
    console.warn('[Sync] Non-blocking briefing notice:', err.message);
  }

  // 5.65 Enrich Top Constructive Articles with OG Images if missing in RSS
  try {
    await enrichTopPositiveArticleImages(finalSources);
  } catch (imgErr) {
    console.warn('[Sync] Non-blocking image enrichment notice:', imgErr.message);
  }

  // 5.7 Cross-Outlet Story Clustering (Method A: Single Aggregation Pass)
  // Runs on a regular interval (default: every 6 hours, or via --force / --cluster)
  // using GEMINI_PAID_API_KEY if configured (falling back to GEMINI_API_KEY with a brief rate-limit cooldown).
  let sharedStoryClusters = currentCache.sharedStoryClusters || [];
  let lastClusteredAt = currentCache.lastClusteredAt || (currentCache.globalStats && currentCache.globalStats.lastClusteredAt) || null;
  const clusterIntervalHours = Number(process.env.CLUSTER_INTERVAL_HOURS || 6);
  const hoursSinceLastCluster = lastClusteredAt ? (now.getTime() - new Date(lastClusteredAt).getTime()) / (1000 * 60 * 60) : Infinity;
  const forceCluster = process.argv.includes('--force') || process.argv.includes('--cluster');
  const shouldRunClustering = forceCluster || sharedStoryClusters.length === 0 || hoursSinceLastCluster >= clusterIntervalHours;

  if (shouldRunClustering) {
    try {
      const usingSeparatePaidKey = Boolean(process.env.GEMINI_PAID_API_KEY || config.paidApiKey);
      if (!usingSeparatePaidKey && newlyAnalyzedCount > 0) {
        console.log('[Sync] Pausing 6s before story clustering to avoid free-tier RPM/TPM collision...');
        await new Promise(r => setTimeout(r, 6000));
      }
      console.log(`[Sync] Running cross-outlet story clustering (key: ${usingSeparatePaidKey ? 'PAID' : 'PRIMARY'}, last run: ${lastClusteredAt ? hoursSinceLastCluster.toFixed(1) + 'h ago' : 'never'})...`);
      const clusters = await clusterCrossOutletStories(finalSources, geminiPaidKey);
      if (clusters && clusters.length > 0) {
        sharedStoryClusters = clusters;
        lastClusteredAt = now.toISOString();
        console.log(`[Sync] Successfully identified ${sharedStoryClusters.length} cross-outlet story clusters.`);
      }
    } catch (clusterErr) {
      console.warn('[Sync] Non-blocking story clustering notice:', clusterErr.message);
    }
  } else {
    console.log(`[Sync] Skipping story clustering (last clustered ${hoursSinceLastCluster.toFixed(1)}h ago; interval is ${clusterIntervalHours}h).`);
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

  // 7. Save outputs
  fs.writeFileSync(DATA_FILE, JSON.stringify(fullPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'data.json'), JSON.stringify(fullPayload), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'summary.json'), JSON.stringify(summaryPayload), 'utf8');

  console.log('==============================================');
  console.log('✅ Sync Completed Successfully!');
  console.log(`📁 Historical archive: data/vibe-data.json (${(fs.statSync(DATA_FILE).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`⚡ Public baked data: public/data/data.json (${(fs.statSync(path.join(PUBLIC_DATA_DIR, 'data.json')).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`🚀 Ultra-light summary: public/data/summary.json (${(fs.statSync(path.join(PUBLIC_DATA_DIR, 'summary.json')).size / 1024).toFixed(1)} KB)`);
  console.log('==============================================');

  // 8. Optional On-Demand Auto-Push (for instant Antigravity or local CLI trigger)
  if (process.argv.includes('--push')) {
    const { execSync } = require('child_process');
    try {
      console.log('[Git] Staging updated vibe datasets...');
      execSync('git add data/vibe-data.json public/data/', { stdio: 'inherit' });
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

main().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});

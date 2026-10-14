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
function extractImageUrl(item) {
  if (!item) return null;
  // 1. Enclosure
  if (item.enclosure && item.enclosure.url && (!item.enclosure.type || item.enclosure.type.startsWith('image/'))) {
    return item.enclosure.url;
  }
  // 2. Media Content (handle single object or array, pick largest/highest resolution)
  if (item.mediaContent) {
    const list = Array.isArray(item.mediaContent) ? item.mediaContent : [item.mediaContent];
    const valid = list.filter(m => m && (m.$?.url || m.url));
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
    const valid = list.filter(m => m && (m.$?.url || m.url));
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
      if (match && match[1]) {
        const url = match[1];
        if (!url.includes('feedburner') && !url.includes('beacon') && !url.includes('1x1') && !url.includes('pixel')) {
          return url;
        }
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

// Structured Gemini sentiment analysis with batching & calibrated prompt
async function analyzeWithGemini(headlines, apiKey, requestedModel) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    requestedModel,
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  const BATCH_SIZE = 20;
  const allResults = [];
  let modelUsed = modelsToTry[0];

  for (let i = 0; i < headlines.length; i += BATCH_SIZE) {
    const chunk = headlines.slice(i, i + BATCH_SIZE);
    const promptData = chunk.map((item, index) => ({
      index,
      headline: item.title,
      description: item.description || ''
    }));

    const prompt = `You are a world-class news sentiment analyst and senior media editor.
Analyze the inherent emotional valence of the real-world events described in each article headline and short description.

VALENCE CALIBRATION (-1.00 to +1.00 continuous scale):
- [-1.00 to -0.65]: Catastrophe, active warfare, deadly strikes/bombings, mass casualties, severe humanitarian trauma.
- [-0.64 to -0.30]: Conflict, mass layoffs, corruption scandals, natural disaster damage, solemn obituaries, major regulatory penalties, broken truces.
- [-0.29 to -0.10]: Mild tension, stock market dip, diplomatic friction, political disputes, minor price hikes.
- [-0.09 to +0.09]: Strictly neutral procedural news, routine election results without violence, scheduled hearings, administrative statements.
- [+0.10 to +0.34]: Incremental or modest constructive developments across any domain—mild economic improvements, routine sports or cultural honors, localized civic initiatives, or minor research insights.
- [+0.35 to +0.64]: Substantial real-world progress across any domain—meaningful citizen debt or cost-of-living relief, tangible diplomatic agreements, significant wildlife or ecological rebounds, major infrastructure completions.
- [+0.65 to +1.00]: Epochal, transformative human milestones across ANY domain—historic peace accords ending warfare, disease eradication, systemic poverty reductions, breakthrough clean energy abundance, paradigm scientific discoveries, or extraordinary human triumphs.

FIRST PRINCIPLES & EVALUATION RULES:
1. Event Substance Over Journalistic Tone: Calm, formal reporting of tragic events (e.g. bombings, strikes, civilian deaths) is DEEPLY NEGATIVE (-0.65 to -1.00). Mentioning "peace talks" or "aid delivery" in a story about active strikes does NOT make it positive.
2. The Counterfactual World State Principle (Harm vs. Mitigation): Ask: "If this whole situation never occurred, would the world be better or worse?" Regulatory fines, legal payouts, compensation settlements, prison overflow decanting, and corporate bailouts are reactions to underlying harm, negligence, or misconduct. Do NOT score administrative remedies as positive victories; score them as sober or mildly negative (-0.15 to -0.35) reflecting the damage that necessitated them.
3. Scale & Impact Over Topic Label: NEVER anchor scores, ceilings, or floors to topic/beat labels. All topics can span the full continuous range from -1.00 to +1.00 based strictly on the REAL-WORLD MAGNITUDE AND HUMAN CONSEQUENCE of the event:
   - High Transformative Impact (+0.65 to +1.00): Monumental, paradigm-shifting events in ANY beat—a historic peace accord, curing a major disease, eliminating extreme poverty, clean energy abundance, or paradigm science breakthrough.
   - Substantial Constructive Progress (+0.35 to +0.64): Tangible, meaningful relief or progress in ANY beat—substantial purchasing power gains, diplomatic treaties, ecosystem protection milestones, major institutional progress.
   - Incremental / Everyday Good (+0.10 to +0.34): Routine or localized positive news in ANY beat—modest rate or market stabilization, local community wins, sports championships, incremental research notes.
   Golden Rule: An epochal peace treaty, global poverty eradication milestone, or planet-scale climate recovery reaches +0.90 to +1.00, while a trivial or niche science observation scores only +0.10 to +0.20. No category has an artificial ceiling or floor.
4. Democratic Governance: Routine electoral victories, party transitions, or cabinet appointments in functioning democracies are neutral (-0.08 to +0.08) unless accompanied by violence or constitutional crisis.
5. Obituaries: Passing of prominent or beloved figures is solemn/negative (-0.30 to -0.50).
6. Granularity & JSON Format: Avoid round numbers like 0.0 or 0.5. Use realistic continuous floats to 2 decimal places (e.g. -0.42, 0.38, -0.85). Strictly never prepend a '+' sign to positive numbers (use 0.38, not +0.38) as '+' is invalid in JSON.

Return a JSON array of objects with:
- index: integer matching input index
- score: float between -1.00 and 1.00 (2 decimal places)
- category: one of 'politics', 'world', 'business', 'technology', 'science', 'health', 'climate', 'entertainment', 'sports', 'other'
- explanation: concise 1-sentence analytical rationale

Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY valid JSON.`;

    let batchSuccess = false;
    for (const modelName of modelsToTry) {
      if (batchSuccess) break;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[Gemini] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(headlines.length / BATCH_SIZE)} using ${modelName} (attempt ${attempt}/2)...`);
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
          });

          const generatePromise = model.generateContent(prompt);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Gemini API call timed out after 30s')), 30000)
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
              allResults.push({
                sourceId: item.sourceId,
                title: item.title,
                link: item.link,
                sentiment: Number(match.score) || 0,
                sentimentGemini: Number(match.score) || 0,
                category: match.category || 'other',
                categoryGemini: match.category || 'other',
                explanation: match.explanation || `Analyzed via Gemini (${modelName}).`,
                explanationGemini: match.explanation || `Analyzed via Gemini (${modelName}).`
              });
            });
            modelUsed = modelName;
            batchSuccess = true;
            break;
          }
        } catch (err) {
          const isDemandSpike = err.message && (err.message.includes('503') || err.message.includes('429') || err.message.includes('high demand') || err.message.includes('timed out'));
          console.warn(`[Gemini] Model ${modelName} attempt ${attempt} warning:`, err.message || err);
          if (attempt < 2) {
            const waitMs = isDemandSpike ? 3500 : 1500;
            await new Promise(r => setTimeout(r, waitMs));
          }
        }
      }
    }

    if (!batchSuccess) {
      console.warn(`[Gemini] Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} items) could not be evaluated due to temporary upstream spikes. STRICT ZERO-OFFLINE POLICY: Skipping batch without offline fallback. Articles remain queued for next sync.`);
    }

    if (i + BATCH_SIZE < headlines.length) {
      await new Promise(r => setTimeout(r, 1200));
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

// Cross-Outlet Story Clustering (Method A: Single End-of-Sync Aggregation Pass)
async function clusterCrossOutletStories(finalSources, apiKey) {
  if (!apiKey) return [];
  
  // Flatten recent headlines from all sources (up to top 10 from each outlet)
  // Flatten recent headlines from all sources (within past 5 days to prevent stale RSS items from leaking into active news cycles)
  const candidates = [];
  const fiveDaysAgo = Date.now() - (5 * 24 * 60 * 60 * 1000);
  Object.entries(finalSources).forEach(([sourceId, src]) => {
    (src.articles || []).slice(0, 15).forEach(art => {
      if (art && art.title && art.title.trim().length > 10) {
        if (art.pubDate) {
          const t = new Date(art.pubDate).getTime();
          if (!isNaN(t) && t < fiveDaysAgo) return;
        }
        candidates.push({
          sourceId,
          sourceName: src.name,
          title: art.title.trim(),
          sentiment: typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0),
          link: art.link || ''
        });
      }
    });
  });

  if (candidates.length < 6) return [];

  // Pass compact indexed headline list
  const promptData = candidates.map((c, idx) => ({ id: idx, source: c.sourceId, title: c.title }));
  const prompt = `You are a wire news editor. Analyze these headlines from multiple newsrooms.
Identify real-world events that are being covered by 2 or more DIFFERENT news outlets.
Group them into story clusters.

Rules:
- A cluster MUST include headlines from at least 2 distinct outlets reporting on the SAME underlying event or topic.
- Provide a concise neutral story title (3-6 words, e.g. "Wayfair Misleading Sales Fines", "UK Early Prisoner Release", "Boeing Machinist Strike", "Federal Reserve Rate Cut").
- Provide a concise 1-2 sentence editorial summary explaining the core real-world event and how the desks are reporting it.
- Provide the list of matching headline IDs.
- Return ONLY a JSON array. If no shared stories exist, return [].

Headlines:
${JSON.stringify(promptData, null, 2)}

Return JSON array in format:
[
  { "story": "Topic Title", "summary": "1-2 sentence editorial summary of the event.", "ids": [0, 4, 12] }
]`;

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    });
    const resp = await model.generateContent(prompt);
    let text = resp.response.text().trim();
    if (text.startsWith('```json')) text = text.substring(7);
    else if (text.startsWith('```')) text = text.substring(3);
    if (text.endsWith('```')) text = text.substring(0, text.length - 3);
    const clusters = JSON.parse(text.trim());

    if (Array.isArray(clusters)) {
      const formattedClusters = [];
      clusters.forEach(cl => {
        if (!cl.ids || cl.ids.length < 2) return;
        const matchingArticles = cl.ids.map(id => candidates[id]).filter(Boolean);
        const uniqueSources = new Set(matchingArticles.map(m => m.sourceId));
        if (uniqueSources.size >= 2) {
          const scores = matchingArticles.map(m => m.sentiment);
          const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
          const variance = Number((scores.reduce((acc, val) => acc + Math.pow(val - avgScore, 2), 0) / scores.length).toFixed(3));
          
          formattedClusters.push({
            story: cl.story,
            summary: cl.summary || '',
            averageSentiment: avgScore,
            sentimentSpread: variance,
            outletCount: uniqueSources.size,
            coverage: matchingArticles.map(m => ({
              sourceId: m.sourceId,
              sourceName: m.sourceName,
              title: m.title,
              sentiment: m.sentiment,
              link: m.link
            }))
          });
        }
      });
      formattedClusters.sort((a, b) => (b.outletCount * (b.sentimentSpread + 0.1)) - (a.outletCount * (a.sentimentSpread + 0.1)));
      return formattedClusters;
    }
  } catch (err) {
    console.warn('[Sync] Non-blocking story clustering notice:', err.message);
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

// Main execution routine
async function main() {
  console.log('==============================================');
  console.log('🚀 VIBE-O-METER: Autonomous Ingestion & Bake');
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  console.log('==============================================');

  const config = readConfig();
  const currentCache = readCache();

  const geminiKey = process.env.GEMINI_API_KEY || config.apiKey;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const groqKey = process.env.GROQ_API_KEY || config.groqApiKey;
  const groqModel = process.env.GROQ_MODEL || config.groqModel || 'llama-3.1-8b-instant';
  const preferredAnalyzer = process.env.DEFAULT_ANALYZER || config.analyzer || (geminiKey ? 'gemini' : (groqKey ? 'groq' : 'local'));

  console.log(`Configured Strategy: Preferred Analyzer = "${preferredAnalyzer}"`);

  // Build lookup of already analyzed articles
  const existingMap = new Map();
  if (currentCache.sources) {
    Object.keys(currentCache.sources).forEach(sourceId => {
      const src = currentCache.sources[sourceId];
      if (src && src.articles) {
        src.articles.forEach(art => {
          const key = `${sourceId}_${art.title.trim().toLowerCase()}`;
          existingMap.set(key, art);
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
      for (const item of items) {
        const cacheKey = `${source.id}_${item.title.trim().toLowerCase()}`;
        const cached = existingMap.get(cacheKey);
        if (cached) {
          if (!cached.imageUrl && item.imageUrl) {
            cached.imageUrl = item.imageUrl;
          }
          if (preferredAnalyzer === 'gemini' && (cached.sentimentGemini === undefined || cached.sentimentGemini === null)) {
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

  // Also pull in backlogged pending articles from historical cache if any exist (up to 40 per run, or up to 120 if --backlog specified)
  const maxBacklog = process.argv.includes('--backlog') ? 120 : 40;
  let backlogAdded = 0;
  if (preferredAnalyzer === 'gemini') {
    const unanalyzedKeys = new Set(unanalyzedArticles.map(a => `${a.sourceId}_${a.title.trim().toLowerCase()}`));
    for (const [key, article] of existingMap.entries()) {
      if (backlogAdded >= maxBacklog) break;
      if (article.sentimentGemini === undefined || article.sentimentGemini === null) {
        if (!unanalyzedKeys.has(key)) {
          unanalyzedArticles.push(article);
          unanalyzedKeys.add(key);
          backlogAdded++;
        }
      }
    }
  }

  console.log(`[Queue] Found ${unanalyzedArticles.length} articles requiring sentiment analysis (${backlogAdded} pulled from historical backlog).`);

  // 2. Perform Local Lexicon Analysis purely as secondary comparative reference fields (AFINN / VADER)
  // NEVER as primary sentiment (strictly zero offline fallback policy).
  if (unanalyzedArticles.length > 0) {
    const localScores = analyzeLocally(unanalyzedArticles);
    localScores.forEach((res, idx) => {
      const target = unanalyzedArticles[idx];
      target.sentimentAFINN = res.sentimentAFINN;
      target.sentimentVADER = res.sentimentVADER;
      target.explanationLocal = res.explanation;
      target.categoryLocal = res.category;
      // Do NOT set target.sentiment = res.sentimentLocal
      // Primary sentiment remains unassigned until evaluated by Gemini
    });
  }

  // 3. Perform AI Analysis if keys are available
  let activeAnalyzerLabel = currentCache.analyzerUsed || 'Gemini';
  let newlyAnalyzedCount = 0;
  let aiSuccess = false;

  if (unanalyzedArticles.length > 0) {
    // Try Gemini
    if (preferredAnalyzer === 'gemini' && geminiKey) {
      try {
        console.log(`[AI] Processing ${unanalyzedArticles.length} articles with Gemini (${geminiModel})...`);
        const geminiRes = await analyzeWithGemini(unanalyzedArticles, geminiKey, geminiModel);
        
        const articleMap = new Map();
        unanalyzedArticles.forEach(a => articleMap.set(`${a.sourceId}_${a.title.trim().toLowerCase()}`, a));

        geminiRes.results.forEach(res => {
          const key = `${res.sourceId}_${res.title.trim().toLowerCase()}`;
          const target = articleMap.get(key);
          if (target) {
            target.sentimentGemini = res.sentiment;
            target.explanationGemini = res.explanation;
            target.categoryGemini = res.category;
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

    // Try Groq if Gemini wasn't used or failed
    if (!aiSuccess && (preferredAnalyzer === 'groq' || groqKey) && groqKey) {
      try {
        console.log(`[AI] Processing ${unanalyzedArticles.length} articles with Groq (${groqModel})...`);
        const groqRes = await analyzeWithGroq(unanalyzedArticles, groqKey, groqModel);
        groqRes.results.forEach((res, idx) => {
          const target = unanalyzedArticles[idx];
          if (target) {
            target.sentimentGroq = res.sentiment;
            target.explanationGroq = res.explanation;
            target.categoryGroq = res.category;
            target.sentiment = res.sentiment;
            target.explanation = res.explanation;
            target.category = res.category;
            newlyAnalyzedCount++;
          }
        });
        if (newlyAnalyzedCount > 0) {
          activeAnalyzerLabel = `Groq (${groqRes.modelUsed})`;
          aiSuccess = true;
        }
      } catch (groqErr) {
        console.error('[Groq] Analysis failed:', groqErr.message);
      }
    }

    if (!aiSuccess && unanalyzedArticles.length > 0) {
      console.warn(`[Sync] Notice: AI was unavailable to evaluate the ${unanalyzedArticles.length} queued articles during this cycle.`);
      console.warn(`[Sync] STRICT ZERO-OFFLINE POLICY: Skipping without assigning local fallback. Articles remain queued for next sync.`);
    }
  } else if (currentCache.analyzerUsed) {
    activeAnalyzerLabel = currentCache.analyzerUsed;
  }

  // 4. Combine historical records and calculate statistics
  const finalSources = {};
  const summarySources = {};

  for (const source of NEWS_SOURCES) {
    const fetched = fetchedBySource[source.id] || { articles: [] };
    const existing = (currentCache.sources && currentCache.sources[source.id] && currentCache.sources[source.id].articles) || [];
    let combined = [...fetched.articles, ...existing];

    // Deduplicate by title
    const seen = new Set();
    combined = combined.filter(art => {
      const key = art.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort newest first
    combined.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    if (combined.length > MAX_ARTICLES_PER_SOURCE) {
      combined = combined.slice(0, MAX_ARTICLES_PER_SOURCE);
    }

    let totalScore = 0;
    let posCount = 0;
    let neuCount = 0;
    let negCount = 0;
    let scoredCount = 0;

    combined.forEach(art => {
      // ONLY pure Gemini evaluations count towards scores
      if (typeof art.sentimentGemini === 'number' && (!art.explanationGemini || !art.explanationGemini.includes('locally'))) {
        const s = art.sentimentGemini;
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
    const sortedBySentiment = [...combined].sort((a, b) => (a.sentiment ?? 0) - (b.sentiment ?? 0));
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

  // 5. Append time series snapshot
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

  // 5.5 Compute Global Vibe Metrics and Editorial Summary
  let allArticlesTotal = 0;
  let allArticlesScore = 0;
  const categoryStats = {};

  Object.values(finalSources).forEach(src => {
    (src.articles || []).forEach(art => {
      if (typeof art.sentimentGemini === 'number' && (!art.explanationGemini || !art.explanationGemini.includes('locally'))) {
        allArticlesTotal++;
        const s = art.sentimentGemini;
        allArticlesScore += s;
        const cat = art.categoryGemini || art.category || 'other';
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
  let sharedStoryClusters = currentCache.sharedStoryClusters || [];
  try {
    const clusters = await clusterCrossOutletStories(finalSources, geminiKey);
    if (clusters && clusters.length > 0) {
      sharedStoryClusters = clusters;
      console.log(`[Sync] Successfully identified ${sharedStoryClusters.length} cross-outlet story clusters.`);
    }
  } catch (clusterErr) {
    console.warn('[Sync] Non-blocking story clustering notice:', clusterErr.message);
  }

  const globalStats = {
    globalSentiment: globalAvg,
    totalArticles: allArticlesTotal,
    mostNegativeOutlet,
    mostPositiveOutlet,
    categoryAverages,
    editorialSummary,
    editorialSummaryDate: todayDateStr,
    sharedStoryClusters
  };

  // 6. Build Payloads
  const fullPayload = {
    lastUpdated: now.toISOString(),
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
        execSync('git commit -m "chore(data): on-demand vibe sync [skip ci]"', { stdio: 'inherit' });
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

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
  { id: 'bloomberg', name: 'Bloomberg', feedUrl: 'https://news.google.com/rss/search?q=site:bloomberg.com&hl=en-US&gl=US&ceid=US:en' }
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
    else if (/science|space|nasa|planet|discover|climate|nature|earth|energy/.test(textLower)) category = 'science';
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
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
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
- [+0.10 to +0.34]: Constructive policy, interest rate cuts, sports wins, mild economic stabilization, cultural awards.
- [+0.35 to +0.64]: Justice delivered (conviction of perpetrators, hostage rescue, prisoner release), successful treaties, significant environmental or economic recovery.
- [+0.65 to +1.00]: Historic scientific discoveries, life-saving medical breakthroughs, end of armed conflicts, inspiring human triumphs.

EDGE CASE RULES:
1. Event Substance Over Journalistic Tone: Calm, formal reporting of tragic events (e.g. bombings, strikes, civilian deaths) is DEEPLY NEGATIVE (-0.65 to -1.00). Mentioning "peace talks" or "ceasefire" in a story about active strikes does NOT make it positive.
2. Justice & Rescue: When a tragic situation resolves with a perpetrator convicted, hostages freed, or victims rescued, evaluate the constructive relief of justice/rescue (+0.35 to +0.60).
3. Democratic Politics: Routine electoral victories, party transitions, or cabinet appointments in functioning democracies are neutral (-0.08 to +0.08) unless accompanied by violent protests or institutional breakdown.
4. Obituaries: Passing of prominent or beloved figures is solemn/negative (-0.30 to -0.50).
5. Granularity & JSON Format: Avoid round numbers like 0.0 or 0.5. Use realistic continuous floats to 2 decimal places (e.g. -0.42, 0.38, -0.85). Strictly never prepend a '+' sign to positive numbers (use 0.38, not +0.38) as '+' is invalid in JSON.

Return a JSON array of objects with:
- index: integer matching input index
- score: float between -1.00 and 1.00 (2 decimal places)
- category: one of 'politics', 'world', 'business', 'technology', 'science', 'health', 'entertainment', 'sports', 'other'
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
        pubDate: item.pubDate || item.isoDate || new Date().toISOString()
      }));

      const sourceArticles = [];
      for (const item of items) {
        const cacheKey = `${source.id}_${item.title.trim().toLowerCase()}`;
        const cached = existingMap.get(cacheKey);
        if (cached) {
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

  console.log(`[Queue] Found ${unanalyzedArticles.length} new articles requiring sentiment analysis.`);

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
    const briefing = await generateDailyBriefing({ force: false });
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
    editorialSummaryDate: todayDateStr
  };

  // 6. Build Payloads
  const fullPayload = {
    lastUpdated: now.toISOString(),
    analyzerUsed: activeAnalyzerLabel,
    editorialSummaryDate: todayDateStr,
    editorialSummary,
    globalStats,
    sources: finalSources,
    timeSeries
  };

  const summaryPayload = {
    lastUpdated: now.toISOString(),
    analyzerUsed: activeAnalyzerLabel,
    editorialSummaryDate: todayDateStr,
    editorialSummary,
    globalStats,
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
}

main().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});

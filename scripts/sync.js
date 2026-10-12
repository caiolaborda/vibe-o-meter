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
  headers: { 'User-Agent': 'Vibe-O-Meter/2.0 (News Sentiment Monitor)' }
});
const sentimentAnalyzer = new Sentiment();

const NEWS_SOURCES = [
  { id: 'bbc', name: 'BBC News', feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'nyt', name: 'The New York Times', feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  { id: 'cnn', name: 'CNN', feedUrl: 'http://rss.cnn.com/rss/edition.rss' },
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

// Local lexicon analysis (AFINN + VADER)
function analyzeLocally(headlines) {
  return headlines.map(item => {
    const textToAnalyze = `${item.title} ${item.description || ''}`;
    const afinnScore = Math.max(-1.0, Math.min(1.0, sentimentAnalyzer.analyze(textToAnalyze).score / 8));
    const vaderScore = vader.SentimentIntensityAnalyzer.polarity_scores(textToAnalyze).compound;
    const averageScore = Number(((afinnScore + vaderScore) / 2).toFixed(3));

    let category = 'other';
    const text = textToAnalyze.toLowerCase();
    if (/politic|election|biden|trump|government|senate|minister|president|parliament/.test(text)) category = 'politics';
    else if (/market|stock|inflation|economy|price|bank|fed|trade|dollar|tariff/.test(text)) category = 'business';
    else if (/tech|ai\b|robot|google|apple|software|crypto|cyber|phone|semiconductor/.test(text)) category = 'technology';
    else if (/science|space|nasa|planet|discover|climate|nature|earth|energy/.test(text)) category = 'science';
    else if (/health|covid|virus|doctor|hospital|vaccin|cancer|disease|mental/.test(text)) category = 'health';
    else if (/movie|actor|music|hollywood|star|show|award|film|celebrity/.test(text)) category = 'entertainment';
    else if (/sport|football|soccer|cup|game|win|champion|tennis|basketball|olympic/.test(text)) category = 'sports';
    else if (/world|war|border|treaty|nation|international|conflict|crisis|refugee|strike/.test(text)) category = 'world';

    return {
      ...item,
      sentiment: averageScore,
      sentimentLocal: averageScore,
      sentimentAFINN: Number(afinnScore.toFixed(3)),
      sentimentVADER: Number(vaderScore.toFixed(3)),
      category,
      explanation: `Analyzed locally with VADER (${vaderScore.toFixed(2)}) and AFINN-111 (${afinnScore.toFixed(2)}).`
    };
  });
}

function tryRepairJsonArray(text) {
  let clean = text.trim();
  if (!clean.startsWith('[')) return clean;
  if (clean.endsWith(']')) return clean;
  if (clean.endsWith('}')) return clean + ']';
  if (clean.endsWith(',')) return clean.slice(0, -1).trim() + ']';
  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace !== -1) return clean.substring(0, lastBrace + 1) + ']';
  return clean;
}

// Structured Gemini sentiment analysis with model fallback
async function analyzeWithGemini(headlines, apiKey, requestedModel) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    requestedModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ].filter(Boolean);

  const promptData = headlines.map((item, index) => ({
    index,
    headline: item.title,
    description: item.description || ''
  }));

  const prompt = `You are an expert news editor and sentiment analyzer. Analyze the sentiment of the following news articles based on their headlines and short descriptions.
Return a JSON array containing an analysis object for each article. Each object must have:
- index: the index number matching the input article
- score: a continuous floating-point number between -1.0 (tragic/doom-laden) and 1.0 (uplifting/optimistic), to 2 decimal places. Avoid rounding to 0.0 unless completely neutral.
- category: one of "politics", "world", "business", "technology", "science", "health", "entertainment", "sports", "other".
- explanation: a concise 1-sentence reason for the score.

Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY the JSON array matching this description. Do not wrap in markdown code fences.`;

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`[Gemini] Attempting analysis using model: ${modelName}...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      }, { apiVersion: 'v1beta' });

      const response = await model.generateContent(prompt);
      let text = response.response.text().trim();
      if (text.startsWith('```json')) text = text.substring(7);
      else if (text.startsWith('```')) text = text.substring(3);
      if (text.endsWith('```')) text = text.substring(0, text.length - 3);
      text = tryRepairJsonArray(text.trim());

      const parsed = JSON.parse(text);
      const results = headlines.map((item, index) => {
        const match = (Array.isArray(parsed) ? parsed : []).find(r => r.index === index) || { score: 0, category: 'other' };
        return {
          ...item,
          sentiment: Number(match.score) || 0,
          category: match.category || 'other',
          explanation: match.explanation || 'Analyzed via Gemini.'
        };
      });

      return { results, modelUsed: modelName };
    } catch (err) {
      console.warn(`[Gemini] Model ${modelName} failed:`, err.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error('All Gemini model attempts failed');
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
        description: sanitizeText(item.contentSnippet || item.content || ''),
        link: item.link || '',
        pubDate: item.pubDate || item.isoDate || new Date().toISOString()
      }));

      const sourceArticles = [];
      for (const item of items) {
        const cacheKey = `${source.id}_${item.title.trim().toLowerCase()}`;
        const cached = existingMap.get(cacheKey);
        if (cached) {
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

  // 2. Perform Local Lexicon Analysis for all new articles
  if (unanalyzedArticles.length > 0) {
    const localScores = analyzeLocally(unanalyzedArticles);
    localScores.forEach((res, idx) => {
      const target = unanalyzedArticles[idx];
      target.sentimentLocal = res.sentimentLocal;
      target.sentimentAFINN = res.sentimentAFINN;
      target.sentimentVADER = res.sentimentVADER;
      target.explanationLocal = res.explanation;
      target.categoryLocal = res.category;
      target.sentiment = res.sentimentLocal;
      target.explanation = res.explanation;
      target.category = res.category;
    });
  }

  // 3. Perform AI Analysis if keys are available
  let activeAnalyzerLabel = 'Local Ensemble (VADER + AFINN)';
  if (unanalyzedArticles.length > 0) {
    let aiSuccess = false;

    // Try Gemini
    if (preferredAnalyzer === 'gemini' && geminiKey) {
      try {
        console.log(`[AI] Processing ${unanalyzedArticles.length} articles with Gemini (${geminiModel})...`);
        const geminiRes = await analyzeWithGemini(unanalyzedArticles, geminiKey, geminiModel);
        geminiRes.results.forEach((res, idx) => {
          const target = unanalyzedArticles[idx];
          target.sentimentGemini = res.sentiment;
          target.explanationGemini = res.explanation;
          target.categoryGemini = res.category;
          target.sentiment = res.sentiment;
          target.explanation = res.explanation;
          target.category = res.category;
        });
        activeAnalyzerLabel = `Gemini (${geminiRes.modelUsed})`;
        aiSuccess = true;
      } catch (geminiErr) {
        console.error('[Gemini] Analysis failed, falling back:', geminiErr.message);
      }
    }

    // Try Groq if Gemini wasn't used or failed
    if (!aiSuccess && (preferredAnalyzer === 'groq' || groqKey) && groqKey) {
      try {
        console.log(`[AI] Processing ${unanalyzedArticles.length} articles with Groq (${groqModel})...`);
        const groqRes = await analyzeWithGroq(unanalyzedArticles, groqKey, groqModel);
        groqRes.results.forEach((res, idx) => {
          const target = unanalyzedArticles[idx];
          target.sentimentGroq = res.sentiment;
          target.explanationGroq = res.explanation;
          target.categoryGroq = res.category;
          target.sentiment = res.sentiment;
          target.explanation = res.explanation;
          target.category = res.category;
        });
        activeAnalyzerLabel = `Groq (${groqRes.modelUsed})`;
        aiSuccess = true;
      } catch (groqErr) {
        console.error('[Groq] Analysis failed:', groqErr.message);
      }
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

    combined.forEach(art => {
      const s = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentLocal || 0);
      totalScore += s;
      if (s > 0.15) posCount++;
      else if (s < -0.15) negCount++;
      else neuCount++;
    });

    const count = combined.length;
    const avg = count > 0 ? Number((totalScore / count).toFixed(3)) : 0;

    // Full detailed source entry
    finalSources[source.id] = {
      name: source.name,
      averageSentiment: avg,
      distribution: { positive: posCount, neutral: neuCount, negative: negCount },
      articles: combined,
      ...(fetched.error ? { error: fetched.error } : {})
    };

    // Lightweight summary source entry (for instant <15KB initial load)
    const sortedBySentiment = [...combined].sort((a, b) => a.sentiment - b.sentiment);
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

  // 5. Append time series snapshot
  const timeSeries = currentCache.timeSeries || [];
  const now = new Date();
  const lastEntry = timeSeries[timeSeries.length - 1];
  const shouldAppendSnapshot = !lastEntry || (now - new Date(lastEntry.timestamp)) >= 30 * 60 * 1000;

  if (shouldAppendSnapshot) {
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

  // 6. Build Payloads
  const fullPayload = {
    lastUpdated: now.toISOString(),
    analyzerUsed: activeAnalyzerLabel,
    sources: finalSources,
    timeSeries
  };

  const summaryPayload = {
    lastUpdated: now.toISOString(),
    analyzerUsed: activeAnalyzerLabel,
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

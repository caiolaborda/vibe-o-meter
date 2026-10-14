const express = require('express');
const path = require('path');
const fs = require('fs');
const Parser = require('rss-parser');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
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

// Ensure data folder exists
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'vibe-data.json');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// News sources definition
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

const MAX_ARTICLES_PER_SOURCE = 500; // Store up to 500 articles in history per news source

// Helper to sanitize text
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
        return clean.length > 450 ? clean.substring(0, 447) + '...' : clean;
      }
    }
  }
  return '';
}

// Local sentiment analyzer fallback
function analyzeLocally(headlines) {
  return headlines.map(item => {
    const textToAnalyze = item.title + " " + (item.description || "");
    
    // Method 1: AFINN-111
    const afinnAnalysis = sentimentAnalyzer.analyze(textToAnalyze);
    const afinnScore = Math.max(-1.0, Math.min(1.0, afinnAnalysis.score / 8));

    // Method 2: VADER
    const vaderAnalysis = vader.SentimentIntensityAnalyzer.polarity_scores(textToAnalyze);
    const vaderScore = vaderAnalysis.compound; // Already normalized -1.0 to 1.0

    // Average of both methods
    let baseScore = (afinnScore + vaderScore) / 2;

    // News-domain contextual valence correction (lexicons often fail on conflict/disaster terms)
    const textLower = textToAnalyze.toLowerCase();
    if (/\b(hits|strikes|bombs|attacked|attacking|attack|missile|drone strike|killed|killing|dead|fatal|casualties|collapse|violate|violating|ceasefire|sanctions|slain|destroy|destroyed)\b/i.test(textLower)) {
      baseScore = Math.min(baseScore - 0.5, -0.3);
    }
    const averageScore = Number(Math.max(-1.0, Math.min(1.0, baseScore)).toFixed(3));

    // Guess a category based on keywords
    let category = 'other';
    const text = textToAnalyze.toLowerCase();
    if (text.includes('politic') || text.includes('election') || text.includes('biden') || text.includes('trump') || text.includes('government') || text.includes('senate') || text.includes('minister') || text.includes('president') || text.includes('parliament')) {
      category = 'politics';
    } else if (text.includes('market') || text.includes('stock') || text.includes('inflation') || text.includes('economy') || text.includes('price') || text.includes('bank') || text.includes('fed') || text.includes('trade') || text.includes('dollar') || text.includes('tariff')) {
      category = 'business';
    } else if (text.includes('tech') || text.includes('ai') || text.includes('robot') || text.includes('google') || text.includes('apple') || text.includes('software') || text.includes('crypto') || text.includes('cyber') || text.includes('phone') || text.includes('semiconductor')) {
      category = 'technology';
    } else if (text.includes('science') || text.includes('space') || text.includes('nasa') || text.includes('planet') || text.includes('discover') || text.includes('climate') || text.includes('nature') || text.includes('earth') || text.includes('energy')) {
      category = 'science';
    } else if (text.includes('health') || text.includes('covid') || text.includes('virus') || text.includes('doctor') || text.includes('hospital') || text.includes('vaccin') || text.includes('cancer') || text.includes('disease') || text.includes('mental')) {
      category = 'health';
    } else if (text.includes('movie') || text.includes('actor') || text.includes('music') || text.includes('hollywood') || text.includes('star') || text.includes('show') || text.includes('award') || text.includes('film') || text.includes('celebrity')) {
      category = 'entertainment';
    } else if (text.includes('sport') || text.includes('football') || text.includes('soccer') || text.includes('cup') || text.includes('game') || text.includes('win') || text.includes('champion') || text.includes('tennis') || text.includes('basketball') || text.includes('olympic')) {
      category = 'sports';
    } else if (text.includes('world') || text.includes('war') || text.includes('border') || text.includes('treaty') || text.includes('nation') || text.includes('international') || text.includes('conflict') || text.includes('crisis') || text.includes('refugee') || text.includes('strike') || text.includes('kyiv') || text.includes('russia') || text.includes('ukraine')) {
      category = 'world';
    }

    return {
      ...item,
      sentiment: averageScore,
      sentimentLocal: averageScore,
      sentimentAFINN: afinnScore,
      sentimentVADER: vaderScore,
      category,
      explanation: `Analyzed locally using news-calibrated VADER (score: ${vaderScore.toFixed(2)}) and AFINN-111 (score: ${afinnScore.toFixed(2)}) models.`
    };
  });
}

// Helper to try generation using Gemini models (gemini-3.8-flash with fallbacks)
async function generateWithFallback(genAI, prompt) {
  const modelsToTry = [
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ].filter(Boolean);

  let lastError = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting Gemini model ${modelName} with API version v1beta...`);
      
      const config = {
        temperature: 0.1,
        responseMimeType: 'application/json'
      };
      
      const model = genAI.getGenerativeModel(
        {
          model: modelName,
          generationConfig: config
        },
        { apiVersion: 'v1beta' }
      );
      const response = await model.generateContent(prompt);
      return {
        text: response.response.text(),
        modelUsed: modelName
      };
    } catch (err) {
      console.warn(`Gemini model ${modelName} (v1beta) failed:`, err.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error('All Gemini model attempts failed');
}

// Helper to repair truncated JSON arrays returned by Gemini APIs
function tryRepairJsonArray(text) {
  let clean = text.trim();
  if (!clean.startsWith('[')) return clean;
  if (clean.endsWith(']')) return clean;
  
  if (clean.endsWith('}')) {
    return clean + ']';
  }
  
  if (clean.endsWith(',')) {
    return clean.slice(0, -1).trim() + ']';
  }
  
  const lastBraceIdx = clean.lastIndexOf('}');
  if (lastBraceIdx !== -1) {
    return clean.substring(0, lastBraceIdx + 1) + ']';
  }
  
  return clean;
}

// Gemini API Single-Prompt Structured Analyzer (no batching needed due to 1M+ context / 8K output tokens)
async function analyzeWithGemini(headlines, apiKey) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const results = [];

    const promptData = headlines.map((item, index) => ({
      index: index,
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

Input Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY valid JSON.`;

    console.log(`[Gemini Sync] Sending ALL ${headlines.length} articles to Gemini in a single well-structured request...`);
    const { text, modelUsed } = await generateWithFallback(genAI, prompt);
    
    console.log(`[Gemini Sync] Received response from model "${modelUsed}":`);
    console.log(`========================================`);
    console.log(text);
    console.log(`========================================`);
    
    let parsedResponse;
    try {
      let cleanText = text.trim();
      // Remove markdown formatting block fences if present
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();
      
      // Attempt to repair if array is truncated
      cleanText = tryRepairJsonArray(cleanText);
      
      parsedResponse = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('[Gemini Sync] Failed to parse Gemini response as JSON. Response text was:', text);
      throw parseError;
    }

    headlines.forEach((item, index) => {
      const analysis = parsedResponse.find(r => r.index === index) || {
        score: 0,
        category: 'other'
      };

      results.push({
        ...item,
        sentiment: Number(analysis.score) || 0,
        category: analysis.category || 'other'
      });
    });

    return { results, modelUsed };
  } catch (error) {
    console.error('Error in Gemini analysis:', error);
    throw error;
  }
}

// OpenRouter API structured analyzer (sends all articles in a single OpenAI-compatible request)
async function analyzeWithOpenRouter(headlines, apiKey, modelName) {
  try {
    const promptData = headlines.map((item, index) => ({
      index: index,
      headline: item.title,
      description: item.description || ''
    }));

    const prompt = `You are an expert news editor and sentiment analyzer. Analyze the sentiment of the following news articles based on their headlines and short descriptions.
Return a JSON array containing an analysis object for each article. Each object must have:
- index: the index number matching the input article
- score: a highly granular floating-point number between -1.0 (extremely negative, doom-laden, tragic) and 1.0 (extremely positive, uplifting, optimistic), resolving precisely to 2 decimal places (e.g. -0.58, -0.23, 0.05, 0.47, 0.81). DO NOT round to simple single-decimal increments like 0.1, -0.2, 0.5, or 0.0 unless the article is perfectly neutral. Focus on the subtle emotional intensity and tone to compute a continuous score.
- category: classify into one of these exact strings: "politics", "world", "business", "technology", "science", "health", "entertainment", "sports", "other".

Few-Shot Examples for Score Granularity:
- Headline: "Tragic structural building collapse kills 18 in downtown district" -> score: -0.87
- Headline: "Local high school hosts annual community bake sale fundraiser" -> score: 0.16
- Headline: "Global stocks drop 0.4% as inflation metrics creep upwards" -> score: -0.28
- Headline: "Cancer research breakthrough shows promising results in early trials" -> score: 0.74
- Headline: "Federal election schedule officially announced by Commission" -> score: 0.02

Input Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY the JSON array matching the description. Do not wrap in markdown tags.`;

    console.log(`[OpenRouter Sync] Sending ALL ${headlines.length} articles to OpenRouter (${modelName}) in a single request...`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Vibe-O-Meter"
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error("Invalid response schema from OpenRouter API.");
    }

    const text = data.choices[0].message.content;

    console.log(`[OpenRouter Sync] Received response from model "${modelName}":`);
    console.log(`========================================`);
    console.log(text);
    console.log(`========================================`);

    let parsedResponse;
    try {
      let cleanText = text.trim();
      // Remove markdown formatting block fences if present
      if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
      else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
      if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
      cleanText = cleanText.trim();
      
      // Attempt to repair if array is truncated
      cleanText = tryRepairJsonArray(cleanText);
      
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) {
        parsedResponse = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.index !== undefined || parsed.score !== undefined) {
          parsedResponse = [parsed];
        } else {
          const arrayKey = Object.keys(parsed).find(key => Array.isArray(parsed[key]));
          if (arrayKey) {
            parsedResponse = parsed[arrayKey];
          } else {
            throw new Error("Parsed JSON from OpenRouter is not an array and has no array properties.");
          }
        }
      } else {
        throw new Error("Parsed JSON from OpenRouter is not an object or array.");
      }
    } catch (parseError) {
      console.error('[OpenRouter Sync] Failed to parse response as JSON. Response text was:', text);
      throw parseError;
    }

    const results = [];
    headlines.forEach((item, index) => {
      const analysis = parsedResponse.find(r => r.index === index) || {
        score: 0,
        category: 'other'
      };

      results.push({
        ...item,
        sentiment: Number(analysis.score) || 0,
        category: analysis.category || 'other'
      });
    });

    return { results, modelUsed: data.model || modelName };
  } catch (error) {
    console.error('Error in OpenRouter analysis:', error);
    throw error;
  }
}

// Groq API structured analyzer (sends all articles in a single OpenAI-compatible request)
async function analyzeWithGroq(headlines, apiKey, modelName) {
  try {
    const BATCH_SIZE = 35;
    const allParsedItems = [];

    for (let i = 0; i < headlines.length; i += BATCH_SIZE) {
      const batch = headlines.slice(i, i + BATCH_SIZE);
      const promptData = batch.map((item, idx) => ({
        index: i + idx,
        headline: item.title,
        description: item.description || ''
      }));

      const prompt = `You are an expert news editor and sentiment analyzer. Analyze the sentiment of the following news articles based on their headlines and short descriptions.
Return a JSON array containing an analysis object for each article. Each object must have:
- index: the index number matching the input article
- score: a highly granular floating-point number between -1.0 (extremely negative, doom-laden, tragic) and 1.0 (extremely positive, uplifting, optimistic), resolving precisely to 2 decimal places (e.g. -0.58, -0.23, 0.05, 0.47, 0.81). DO NOT round to simple single-decimal increments like 0.1, -0.2, 0.5, or 0.0 unless the article is perfectly neutral. Focus on the subtle emotional intensity and tone to compute a continuous score.
- category: classify into one of these exact strings: "politics", "world", "business", "technology", "science", "health", "entertainment", "sports", "other".

Few-Shot Examples for Score Granularity:
- Headline: "Tragic structural building collapse kills 18 in downtown district" -> score: -0.87
- Headline: "Local high school hosts annual community bake sale fundraiser" -> score: 0.16
- Headline: "Global stocks drop 0.4% as inflation metrics creep upwards" -> score: -0.28
- Headline: "Cancer research breakthrough shows promising results in early trials" -> score: 0.74
- Headline: "Federal election schedule officially announced by Commission" -> score: 0.02

Input Articles:
${JSON.stringify(promptData, null, 2)}

Return ONLY the JSON array matching the description. Do not wrap in markdown tags.`;

      console.log(`[Groq Sync] Sending batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(headlines.length / BATCH_SIZE)} (${batch.length} articles) to Groq (${modelName})...`);

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API returned status ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content.trim();

      let parsedBatch = [];
      try {
        let cleanText = text;
        if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
        else if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
        if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
        cleanText = cleanText.trim();
        
        cleanText = tryRepairJsonArray(cleanText);
        
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed)) {
          parsedBatch = parsed;
        } else if (typeof parsed === 'object' && parsed !== null) {
          if (parsed.index !== undefined || parsed.score !== undefined) {
            parsedBatch = [parsed];
          } else {
            const arrayKey = Object.keys(parsed).find(key => Array.isArray(parsed[key]));
            if (arrayKey) {
              parsedBatch = parsed[arrayKey];
            } else {
              throw new Error("Parsed JSON from Groq is not an array and has no array properties.");
            }
          }
        }
      } catch (parseError) {
        console.error('[Groq Sync] Failed to parse batch response as JSON. Response text was:', text);
        throw parseError;
      }

      allParsedItems.push(...parsedBatch);

      // Introduce a 1-second delay between batches to respect TPM limits on free accounts
      if (i + BATCH_SIZE < headlines.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const results = [];
    headlines.forEach((item, index) => {
      const analysis = allParsedItems.find(r => r.index === index) || {
        score: 0,
        category: 'other'
      };

      results.push({
        ...item,
        sentiment: Number(analysis.score) || 0,
        category: analysis.category || 'other'
      });
    });

    return { results, modelUsed: modelName };
  } catch (error) {
    console.error('Error in Groq analysis:', error);
    throw error;
  }
}

// Read cache file
function readCache() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error('Error reading data file:', err);
    }
  }
  return { lastUpdated: null, analyzerUsed: null, sources: {} };
}

// Global sync status tracking
let syncStatus = {
  inProgress: false,
  stage: 'idle', // 'fetching_feeds', 'local_analysis', 'gemini_analysis', 'openrouter_analysis', 'saving'
  message: 'Idle',
  progressPercent: 0
};

// GET sync status
app.get('/api/sync-status', (req, res) => {
  return res.json(syncStatus);
});

// GET current cache data
app.get('/api/data', (req, res) => {
  const cache = readCache();
  return res.json(cache);
});

// POST clear cache data
app.post('/api/clear-cache', (req, res) => {
  try {
    const payload = {
      lastUpdated: new Date().toISOString(),
      analyzerUsed: 'None',
      sources: {}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log('[Cache Clear] Wiped all cached historical articles.');
    return res.json(payload);
  } catch (err) {
    console.error('Failed to clear cache:', err);
    return res.status(500).json({ error: 'Failed to clear cache: ' + err.message });
  }
});

// GET trigger-sync (on-demand trigger from browser, curl, or Antigravity)
app.get('/api/trigger-sync', (req, res) => {
  const { fork } = require('child_process');
  const push = req.query.push === 'true' || req.query.push === '1';
  const args = [];
  if (push) args.push('--push');
  
  const child = fork(path.join(__dirname, 'scripts', 'sync.js'), args, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  return res.json({
    status: 'triggered',
    message: 'On-demand sync started in background' + (push ? ' with auto-push to GitHub' : ''),
    timestamp: new Date().toISOString()
  });
});

// POST sync news (accumulates and keeps historical records!)
app.post('/api/sync', async (req, res) => {
  const userApiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
  const openRouterApiKey = req.body.openRouterApiKey;
  const openRouterModel = req.body.openRouterModel || 'meta-llama/llama-3-8b-instruct:free';
  const groqApiKey = req.body.groqApiKey;
  const groqModel = req.body.groqModel || 'llama-3.1-8b-instant';
  const force = !!req.body.force;
  const requestedAnalyzer = req.body.analyzer; // 'gemini', 'openrouter', or 'groq'
  const vibeCalcMethod = req.body.vibeCalcMethod || 'active';

  console.log('[API Sync] req.body analyzer:', requestedAnalyzer, 'vibeCalcMethod:', vibeCalcMethod, 'keys present:', Object.keys(req.body).filter(k => !!req.body[k]));

  const useGemini = !!userApiKey && requestedAnalyzer === 'gemini';
  const useOpenRouter = !!openRouterApiKey && requestedAnalyzer === 'openrouter';
  const useGroq = !!groqApiKey && requestedAnalyzer === 'groq';

  const syncErrors = [];
  try {
    syncStatus.inProgress = true;
    syncStatus.stage = 'fetching_feeds';
    syncStatus.message = 'Fetching latest RSS feeds...';
    syncStatus.progressPercent = 10;

    console.log(`Sync started. Mode: Gemini=${useGemini}, OpenRouter=${useOpenRouter} (${openRouterModel}). Force re-analyze: ${force}`);
    
    // Read current cache to check what articles are already analyzed
    const currentCache = readCache();
    const existingCacheMap = new Map(); // Key: sourceId + '_' + title, Value: analyzed article

    // Populate existingCacheMap
    if (currentCache && currentCache.sources) {
      Object.keys(currentCache.sources).forEach(sourceId => {
        const srcData = currentCache.sources[sourceId];
        if (srcData && srcData.articles) {
          srcData.articles.forEach(art => {
            const key = `${sourceId}_${art.title.trim().toLowerCase()}`;
            existingCacheMap.set(key, art);
          });
        }
      });
    }

    const fetchedArticlesBySource = {};
    const articlesToAnalyzeLocally = [];
    const articlesToAnalyzeWithGemini = [];
    const articlesToAnalyzeWithOpenRouter = [];
    const articlesToAnalyzeWithGroq = [];
    const reusedArticlesCount = {};
    const newArticlesCount = {};
    NEWS_SOURCES.forEach(s => {
      reusedArticlesCount[s.id] = 0;
      newArticlesCount[s.id] = 0;
    });

    // 1. Fetch RSS feeds and split into "needs analysis" vs "cached"
    for (const source of NEWS_SOURCES) {
      try {
        console.log(`Fetching feed for ${source.name}...`);
        const feed = await parser.parseURL(source.feedUrl);
        
        // Take latest 25 items from current RSS feed
        const rawItems = feed.items.slice(0, 25).map(item => ({
          title: sanitizeText(item.title),
          description: extractBestDescription(item),
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || new Date().toISOString()
        }));

        const sourceArticles = [];

        rawItems.forEach(item => {
          const cacheKey = `${source.id}_${item.title.trim().toLowerCase()}`;
          const cached = existingCacheMap.get(cacheKey);

          if (cached && !force) {
            // Check what data needs fetching
            let needsGemini = useGemini && (cached.sentimentGemini === undefined || cached.sentimentGemini === null);
            let needsOpenRouter = useOpenRouter && (cached.sentimentOpenRouter === undefined || cached.sentimentOpenRouter === null || cached.openRouterModelUsed !== openRouterModel);
            let needsGroq = useGroq && (cached.sentimentGroq === undefined || cached.sentimentGroq === null || cached.groqModelUsed !== groqModel);
            let needsLocal = cached.sentimentLocal === undefined || cached.sentimentLocal === null;
            
            if (needsLocal || needsGemini || needsOpenRouter || needsGroq) {
              const art = { sourceId: source.id, ...cached };
              if (needsLocal) articlesToAnalyzeLocally.push(art);
              if (needsGemini) articlesToAnalyzeWithGemini.push(art);
              if (needsOpenRouter) articlesToAnalyzeWithOpenRouter.push(art);
              if (needsGroq) articlesToAnalyzeWithGroq.push(art);
              sourceArticles.push(art); 
            } else {
              // Fully analyzed already
              sourceArticles.push(cached);
              reusedArticlesCount[source.id]++;
            }
          } else {
            // Brand new article (or force re-analyze)
            const newArticle = {
              sourceId: source.id,
              ...item
            };
            articlesToAnalyzeLocally.push(newArticle);
            if (useGemini) {
              articlesToAnalyzeWithGemini.push(newArticle);
            }
            if (useOpenRouter) {
              articlesToAnalyzeWithOpenRouter.push(newArticle);
            }
            if (useGroq) {
              articlesToAnalyzeWithGroq.push(newArticle);
            }
            sourceArticles.push(newArticle);
            newArticlesCount[source.id]++;
          }
        });

        fetchedArticlesBySource[source.id] = {
          name: source.name,
          articles: sourceArticles
        };
      } catch (feedError) {
        console.error(`Error parsing feed for ${source.name}:`, feedError);
        // If feed fails, reuse existing articles so we don't lose data
        const currentSourceData = currentCache.sources && currentCache.sources[source.id];
        fetchedArticlesBySource[source.id] = {
          name: source.name,
          articles: (currentSourceData && currentSourceData.articles) ? currentSourceData.articles : [],
          error: `Failed to fetch feed: ${feedError.message}`
        };
      }
    }

    console.log(`Sync status: Local queue: ${articlesToAnalyzeLocally.length}, Gemini queue: ${articlesToAnalyzeWithGemini.length}, OpenRouter queue: ${articlesToAnalyzeWithOpenRouter.length}, Groq queue: ${articlesToAnalyzeWithGroq.length}.`);

    syncStatus.stage = 'local_analysis';
    syncStatus.message = `Analyzing ${articlesToAnalyzeLocally.length} articles locally...`;
    syncStatus.progressPercent = 35;

    // 2. Perform Sentiment Analysis (always run if missing)
    if (articlesToAnalyzeLocally.length > 0) {
      console.log(`Analyzing ${articlesToAnalyzeLocally.length} articles locally (VADER + AFINN)...`);
      const localResults = analyzeLocally(articlesToAnalyzeLocally);
      localResults.forEach((res, idx) => {
        const original = articlesToAnalyzeLocally[idx];
        original.sentimentLocal = res.sentimentLocal;
        original.sentimentAFINN = res.sentimentAFINN;
        original.sentimentVADER = res.sentimentVADER;
        original.explanationLocal = res.explanation;
        original.categoryLocal = res.category;
        
        // Defaults for backwards compatibility/fallback
        original.sentiment = res.sentimentLocal;
        original.explanation = res.explanation;
        original.category = res.category;
      });
    }

    // 3. Perform Gemini Sentiment Analysis
    let geminiModelUsed = null;
    let analyzerUsed = currentCache.analyzerUsed || 'Local Ensemble Only';

    if (useGemini && articlesToAnalyzeWithGemini.length > 0) {
      syncStatus.stage = 'gemini_analysis';
      syncStatus.message = `Analyzing ${articlesToAnalyzeWithGemini.length} articles with Gemini...`;
      syncStatus.progressPercent = 55;
      try {
        console.log(`Analyzing ${articlesToAnalyzeWithGemini.length} articles with Gemini...`);
        const geminiResponse = await analyzeWithGemini(articlesToAnalyzeWithGemini, userApiKey);
        geminiModelUsed = geminiResponse.modelUsed;
        
        geminiResponse.results.forEach((res, idx) => {
          const original = articlesToAnalyzeWithGemini[idx];
          original.sentimentGemini = res.sentiment;
          original.explanationGemini = res.explanation;
          original.categoryGemini = res.category;
          
          // Default active values to Gemini's richer insights
          original.sentiment = res.sentiment;
          original.explanation = res.explanation;
          original.category = res.category;
        });
      } catch (geminiError) {
        console.error('Gemini analysis failed:', geminiError);
        syncErrors.push(`Gemini API Error: ${geminiError.message || geminiError}`);
      }
    }

    // 3.5 Perform OpenRouter Sentiment Analysis
    let openRouterModelUsed = null;
    if (useOpenRouter && articlesToAnalyzeWithOpenRouter.length > 0) {
      syncStatus.stage = 'openrouter_analysis';
      syncStatus.message = `Analyzing ${articlesToAnalyzeWithOpenRouter.length} articles with OpenRouter...`;
      syncStatus.progressPercent = 75;
      try {
        console.log(`Analyzing ${articlesToAnalyzeWithOpenRouter.length} articles with OpenRouter (${openRouterModel})...`);
        const openRouterResponse = await analyzeWithOpenRouter(articlesToAnalyzeWithOpenRouter, openRouterApiKey, openRouterModel);
        openRouterModelUsed = openRouterResponse.modelUsed;
        
        openRouterResponse.results.forEach((res, idx) => {
          const original = articlesToAnalyzeWithOpenRouter[idx];
          original.sentimentOpenRouter = res.sentiment;
          original.explanationOpenRouter = res.explanation;
          original.categoryOpenRouter = res.category;
          original.openRouterModelUsed = openRouterModel;
          
          // Default active values to OpenRouter's insights
          original.sentiment = res.sentiment;
          original.explanation = res.explanation;
          original.category = res.category;
        });
      } catch (openRouterError) {
        console.error('OpenRouter analysis failed:', openRouterError);
        syncErrors.push(`OpenRouter API Error: ${openRouterError.message || openRouterError}`);
      }
    }

    // 3.7 Perform Groq Sentiment Analysis
    let groqModelUsed = null;
    if (useGroq && articlesToAnalyzeWithGroq.length > 0) {
      syncStatus.stage = 'groq_analysis';
      syncStatus.message = `Analyzing ${articlesToAnalyzeWithGroq.length} articles with Groq...`;
      syncStatus.progressPercent = 85;
      try {
        console.log(`Analyzing ${articlesToAnalyzeWithGroq.length} articles with Groq (${groqModel})...`);
        const groqResponse = await analyzeWithGroq(articlesToAnalyzeWithGroq, groqApiKey, groqModel);
        groqModelUsed = groqResponse.modelUsed;
        
        groqResponse.results.forEach((res, idx) => {
          const original = articlesToAnalyzeWithGroq[idx];
          original.sentimentGroq = res.sentiment;
          original.explanationGroq = res.explanation;
          original.categoryGroq = res.category;
          original.groqModelUsed = groqModel;
          
          // Default active values to Groq's insights
          original.sentiment = res.sentiment;
          original.explanation = res.explanation;
          original.category = res.category;
        });
      } catch (groqError) {
        console.error('Groq analysis failed:', groqError);
        syncErrors.push(`Groq API Error: ${groqError.message || groqError}`);
      }
    }

    // Determine final active analyzer string
    if (geminiModelUsed) {
      analyzerUsed = `Dual Mode (Local + Gemini ${geminiModelUsed})`;
    } else if (openRouterModelUsed) {
      analyzerUsed = `Dual Mode (Local + OpenRouter ${openRouterModelUsed})`;
    } else if (groqModelUsed) {
      analyzerUsed = `Dual Mode (Local + Groq ${groqModelUsed})`;
    } else if (useGemini) {
      analyzerUsed = currentCache.analyzerUsed || 'Dual Mode (Local + Gemini)';
    } else if (useOpenRouter) {
      analyzerUsed = currentCache.analyzerUsed || `Dual Mode (Local + OpenRouter ${openRouterModel})`;
    } else if (useGroq) {
      analyzerUsed = currentCache.analyzerUsed || `Dual Mode (Local + Groq ${groqModel})`;
    }

    // 4. Assemble combined history and compute final stats using the active default
    const finalSourcesData = {};

    for (const source of NEWS_SOURCES) {
      const srcFetchData = fetchedArticlesBySource[source.id];
      const existingArticles = (currentCache.sources && currentCache.sources[source.id] && currentCache.sources[source.id].articles)
        ? currentCache.sources[source.id].articles
        : [];
      let combined = [...srcFetchData.articles, ...existingArticles];

      // Remove any duplicate articles by title
      const seenTitles = new Set();
      combined = combined.filter(art => {
        const titleKey = art.title.trim().toLowerCase();
        if (seenTitles.has(titleKey)) {
          return false;
        }
        seenTitles.add(titleKey);
        return true;
      });

      // Sort by publication date (newest first)
      combined.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

      // Limit size of history database
      if (combined.length > MAX_ARTICLES_PER_SOURCE) {
        combined = combined.slice(0, MAX_ARTICLES_PER_SOURCE);
      }

      // Compute statistics based on the active default (Gemini if available, else Local)
      let totalSentiment = 0;
      let positiveCount = 0;
      let neutralCount = 0;
      let negativeCount = 0;

      combined.forEach(art => {
        const vaderVal = (art.sentimentVADER !== undefined && art.sentimentVADER !== null) ? art.sentimentVADER : (art.sentimentLocal || 0);

        // Resolve active value (default to requested analyzer if it was analyzed, otherwise Local)
        if (requestedAnalyzer === 'gemini' && art.sentimentGemini !== undefined && art.sentimentGemini !== null) {
          art.sentiment = vibeCalcMethod === 'hybrid' ? Number(((vaderVal + art.sentimentGemini) / 2).toFixed(3)) : art.sentimentGemini;
          art.explanation = art.explanationGemini;
          art.category = art.categoryGemini;
        } else if (requestedAnalyzer === 'openrouter' && art.sentimentOpenRouter !== undefined && art.sentimentOpenRouter !== null) {
          art.sentiment = vibeCalcMethod === 'hybrid' ? Number(((vaderVal + art.sentimentOpenRouter) / 2).toFixed(3)) : art.sentimentOpenRouter;
          art.explanation = art.explanationOpenRouter;
          art.category = art.categoryOpenRouter;
        } else if (requestedAnalyzer === 'groq' && art.sentimentGroq !== undefined && art.sentimentGroq !== null) {
          art.sentiment = vibeCalcMethod === 'hybrid' ? Number(((vaderVal + art.sentimentGroq) / 2).toFixed(3)) : art.sentimentGroq;
          art.explanation = art.explanationGroq;
          art.category = art.categoryGroq;
        } else {
          art.sentiment = art.sentimentLocal || art.sentiment || 0;
          art.explanation = art.explanationLocal || art.explanation || 'No reasoning available.';
          art.category = art.categoryLocal || art.category || 'other';
        }

        totalSentiment += art.sentiment;
        if (art.sentiment > 0.15) {
          positiveCount++;
        } else if (art.sentiment < -0.15) {
          negativeCount++;
        } else {
          neutralCount++;
        }
      });

      const count = combined.length;
      const averageSentiment = count > 0 ? (totalSentiment / count) : 0;

      finalSourcesData[source.id] = {
        name: source.name,
        averageSentiment: Number(averageSentiment.toFixed(3)),
        distribution: {
          positive: positiveCount,
          neutral: neutralCount,
          negative: negativeCount
        },
        articles: combined,
        ...(srcFetchData.error ? { error: srcFetchData.error } : {})
      };
    }

    const payload = {
      lastUpdated: new Date().toISOString(),
      analyzerUsed,
      sources: finalSourcesData,
      timeSeries: currentCache.timeSeries || [],
      errors: syncErrors.length > 0 ? syncErrors : undefined
    };

    appendTimeSeriesEntry(payload);

    syncStatus.stage = 'saving';
    syncStatus.message = 'Saving analysis data cache...';
    syncStatus.progressPercent = 95;

    // Save to cache file
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log('Sync complete! Dual accumulative history saved to JSON.');

    return res.json(payload);
  } catch (error) {
    console.error('Overall sync operation failed:', error);
    return res.status(500).json({ error: 'Sync failed: ' + error.message });
  } finally {
    syncStatus.inProgress = false;
    syncStatus.stage = 'idle';
    syncStatus.message = 'Idle';
    syncStatus.progressPercent = 100;
  }
});

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function readConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.error('Failed to read config.json:', e);
    }
  }
  return {
    apiKey: '',
    openRouterApiKey: '',
    openRouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
    groqApiKey: '',
    groqModel: 'llama-3.1-8b-instant',
    analyzer: 'local',
    syncInterval: 0,
    vibeCalcMethod: 'active'
  };
}

function writeConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write config.json:', e);
  }
}

// GET settings configuration
app.get('/api/settings', (req, res) => {
  try {
    const cfg = readConfig();
    return res.json(cfg);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST save settings configuration
app.post('/api/settings', (req, res) => {
  try {
    const cfg = readConfig();
    const updated = {
      apiKey: req.body.apiKey !== undefined ? req.body.apiKey : cfg.apiKey,
      openRouterApiKey: req.body.openRouterApiKey !== undefined ? req.body.openRouterApiKey : cfg.openRouterApiKey,
      openRouterModel: req.body.openRouterModel !== undefined ? req.body.openRouterModel : cfg.openRouterModel,
      groqApiKey: req.body.groqApiKey !== undefined ? req.body.groqApiKey : cfg.groqApiKey,
      groqModel: req.body.groqModel !== undefined ? req.body.groqModel : cfg.groqModel,
      analyzer: req.body.analyzer !== undefined ? req.body.analyzer : cfg.analyzer,
      syncInterval: req.body.syncInterval !== undefined ? Number(req.body.syncInterval) : cfg.syncInterval,
      vibeCalcMethod: req.body.vibeCalcMethod !== undefined ? req.body.vibeCalcMethod : cfg.vibeCalcMethod
    };
    writeConfig(updated);
    
    // Re-initialize scheduler with new interval
    initScheduler();

    return res.json({ success: true, config: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Append entry to historical dataset
function appendTimeSeriesEntry(payload) {
  if (!payload.timeSeries) payload.timeSeries = [];
  
  const now = new Date();
  
  // Throttle snapshot entries to once every 30 minutes
  if (payload.timeSeries.length > 0) {
    const lastEntry = payload.timeSeries[payload.timeSeries.length - 1];
    const lastTime = new Date(lastEntry.timestamp);
    if ((now - lastTime) < 30 * 60 * 1000) {
      console.log('[Time Series] Throttled. Last snapshot was less than 30 minutes ago.');
      return;
    }
  }

  const averages = {};
  Object.keys(payload.sources).forEach(sourceId => {
    const avg = payload.sources[sourceId].averageSentiment;
    if (avg !== null && avg !== undefined) {
      averages[sourceId] = avg;
    }
  });

  payload.timeSeries.push({
    timestamp: now.toISOString(),
    analyzer: payload.analyzerUsed,
    averages
  });
  console.log('[Time Series] Recorded historical snapshot entry.');
}

// Background sync cron scheduler
let bgSyncIntervalId = null;

async function runBackgroundSync() {
  const config = readConfig();
  if (config.analyzer === 'local' || !config.syncInterval || config.syncInterval <= 0) {
    return;
  }

  const userApiKey = config.apiKey || process.env.GEMINI_API_KEY;
  const openRouterApiKey = config.openRouterApiKey;
  const openRouterModel = config.openRouterModel;
  const groqApiKey = config.groqApiKey;
  const groqModel = config.groqModel;
  const requestedAnalyzer = config.analyzer;
  const vibeCalcMethod = config.vibeCalcMethod || 'active';

  const useGemini = !!userApiKey && requestedAnalyzer === 'gemini';
  const useOpenRouter = !!openRouterApiKey && requestedAnalyzer === 'openrouter';
  const useGroq = !!groqApiKey && requestedAnalyzer === 'groq';

  if (!useGemini && !useOpenRouter && !useGroq) {
    console.log('[Bg Sync] No valid API keys configured. Skipping sync.');
    return;
  }

  console.log(`[Bg Sync] Starting automated sync. Analyzer: ${requestedAnalyzer}, Method: ${vibeCalcMethod}`);

  try {
    const currentCache = readCache();
    const existingCacheMap = new Map();
    if (currentCache && currentCache.sources) {
      Object.keys(currentCache.sources).forEach(sourceId => {
        const srcData = currentCache.sources[sourceId];
        if (srcData && srcData.articles) {
          srcData.articles.forEach(art => {
            const key = `${sourceId}_${art.title.trim().toLowerCase()}`;
            existingCacheMap.set(key, art);
          });
        }
      });
    }

    const fetchedArticlesBySource = {};
    const articlesToAnalyzeLocally = [];
    const articlesToAnalyzeWithGemini = [];
    const articlesToAnalyzeWithOpenRouter = [];
    const articlesToAnalyzeWithGroq = [];

    for (const source of NEWS_SOURCES) {
      try {
        const feed = await parser.parseURL(source.feedUrl);
        const latestItems = feed.items.slice(0, 25);
        const sourceArticles = [];

        latestItems.forEach(item => {
          const cacheKey = `${source.id}_${item.title.trim().toLowerCase()}`;
          const cached = existingCacheMap.get(cacheKey);

          if (cached) {
            let needsGemini = useGemini && (cached.sentimentGemini === undefined || cached.sentimentGemini === null);
            let needsOpenRouter = useOpenRouter && (cached.sentimentOpenRouter === undefined || cached.sentimentOpenRouter === null || cached.openRouterModelUsed !== openRouterModel);
            let needsGroq = useGroq && (cached.sentimentGroq === undefined || cached.sentimentGroq === null || cached.groqModelUsed !== groqModel);
            let needsLocal = cached.sentimentLocal === undefined || cached.sentimentLocal === null;
            
            if (needsLocal || needsGemini || needsOpenRouter || needsGroq) {
              const art = { sourceId: source.id, ...cached };
              if (needsLocal) articlesToAnalyzeLocally.push(art);
              if (needsGemini) articlesToAnalyzeWithGemini.push(art);
              if (needsOpenRouter) articlesToAnalyzeWithOpenRouter.push(art);
              if (needsGroq) articlesToAnalyzeWithGroq.push(art);
              sourceArticles.push(art); 
            } else {
              sourceArticles.push(cached);
            }
          } else {
            const newArticle = {
              sourceId: source.id,
              title: sanitizeText(item.title),
              description: extractBestDescription(item),
              link: item.link || '',
              pubDate: item.pubDate || item.isoDate || new Date().toISOString()
            };
            articlesToAnalyzeLocally.push(newArticle);
            if (useGemini) articlesToAnalyzeWithGemini.push(newArticle);
            if (useOpenRouter) articlesToAnalyzeWithOpenRouter.push(newArticle);
            if (useGroq) articlesToAnalyzeWithGroq.push(newArticle);
            sourceArticles.push(newArticle);
          }
        });

        fetchedArticlesBySource[source.id] = { name: source.name, articles: sourceArticles };
      } catch (feedError) {
        console.error(`[Bg Sync] Error parsing feed for ${source.name}:`, feedError);
        const currentSourceData = currentCache.sources && currentCache.sources[source.id];
        fetchedArticlesBySource[source.id] = {
          name: source.name,
          articles: (currentSourceData && currentSourceData.articles) ? currentSourceData.articles : []
        };
      }
    }

    if (articlesToAnalyzeLocally.length > 0) {
      const localResults = analyzeLocally(articlesToAnalyzeLocally);
      localResults.forEach((res, idx) => {
        const original = articlesToAnalyzeLocally[idx];
        original.sentimentLocal = res.sentimentLocal;
        original.sentimentAFINN = res.sentimentAFINN;
        original.sentimentVADER = res.sentimentVADER;
        original.explanationLocal = res.explanation;
        original.categoryLocal = res.category;
        original.sentiment = res.sentimentLocal;
        original.explanation = res.explanation;
        original.category = res.category;
      });
    }

    if (useGemini && articlesToAnalyzeWithGemini.length > 0) {
      const geminiResponse = await analyzeWithGemini(articlesToAnalyzeWithGemini, userApiKey);
      geminiResponse.results.forEach((res, idx) => {
        const original = articlesToAnalyzeWithGemini[idx];
        original.sentimentGemini = res.sentiment;
        original.explanationGemini = res.explanation;
        original.categoryGemini = res.category;
        original.sentiment = res.sentiment;
        original.explanation = res.explanation;
        original.category = res.category;
      });
    }

    if (useOpenRouter && articlesToAnalyzeWithOpenRouter.length > 0) {
      const openRouterResponse = await analyzeWithOpenRouter(articlesToAnalyzeWithOpenRouter, openRouterApiKey, openRouterModel);
      openRouterResponse.results.forEach((res, idx) => {
        const original = articlesToAnalyzeWithOpenRouter[idx];
        original.sentimentOpenRouter = res.sentiment;
        original.explanationOpenRouter = res.explanation;
        original.categoryOpenRouter = res.category;
        original.openRouterModelUsed = openRouterModel;
        original.sentiment = res.sentiment;
        original.explanation = res.explanation;
        original.category = res.category;
      });
    }

    if (useGroq && articlesToAnalyzeWithGroq.length > 0) {
      const groqResponse = await analyzeWithGroq(articlesToAnalyzeWithGroq, groqApiKey, groqModel);
      groqResponse.results.forEach((res, idx) => {
        const original = articlesToAnalyzeWithGroq[idx];
        original.sentimentGroq = res.sentiment;
        original.explanationGroq = res.explanation;
        original.categoryGroq = res.category;
        original.groqModelUsed = groqModel;
        original.sentiment = res.sentiment;
        original.explanation = res.explanation;
        original.category = res.category;
      });
    }

    const finalSourcesData = {};
    for (const source of NEWS_SOURCES) {
      const srcFetchData = fetchedArticlesBySource[source.id];
      const existingArticles = (currentCache.sources && currentCache.sources[source.id] && currentCache.sources[source.id].articles)
        ? currentCache.sources[source.id].articles
        : [];
      let combined = [...srcFetchData.articles, ...existingArticles];
      const seenTitles = new Set();
      combined = combined.filter(art => {
        const titleKey = art.title.trim().toLowerCase();
        if (seenTitles.has(titleKey)) return false;
        seenTitles.add(titleKey);
        return true;
      });

      combined.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      if (combined.length > MAX_ARTICLES_PER_SOURCE) {
        combined = combined.slice(0, MAX_ARTICLES_PER_SOURCE);
      }

      let totalSentiment = 0;
      let positiveCount = 0;
      let neutralCount = 0;
      let negativeCount = 0;

      combined.forEach(art => {
        const vaderVal = (art.sentimentVADER !== undefined && art.sentimentVADER !== null) ? art.sentimentVADER : (art.sentimentLocal || 0);

        if (requestedAnalyzer === 'gemini' && art.sentimentGemini !== undefined && art.sentimentGemini !== null) {
          art.sentiment = vibeCalcMethod === 'hybrid' ? Number(((vaderVal + art.sentimentGemini) / 2).toFixed(3)) : art.sentimentGemini;
          art.explanation = art.explanationGemini;
          art.category = art.categoryGemini;
        } else if (requestedAnalyzer === 'openrouter' && art.sentimentOpenRouter !== undefined && art.sentimentOpenRouter !== null) {
          art.sentiment = vibeCalcMethod === 'hybrid' ? Number(((vaderVal + art.sentimentOpenRouter) / 2).toFixed(3)) : art.sentimentOpenRouter;
          art.explanation = art.explanationOpenRouter;
          art.category = art.categoryOpenRouter;
        } else if (requestedAnalyzer === 'groq' && art.sentimentGroq !== undefined && art.sentimentGroq !== null) {
          art.sentiment = vibeCalcMethod === 'hybrid' ? Number(((vaderVal + art.sentimentGroq) / 2).toFixed(3)) : art.sentimentGroq;
          art.explanation = art.explanationGroq;
          art.category = art.categoryGroq;
        } else {
          art.sentiment = art.sentimentLocal || art.sentiment || 0;
          art.explanation = art.explanationLocal || art.explanation || 'No reasoning available.';
          art.category = art.categoryLocal || art.category || 'other';
        }

        totalSentiment += art.sentiment;
        if (art.sentiment > 0.15) positiveCount++;
        else if (art.sentiment < -0.15) negativeCount++;
        else neutralCount++;
      });

      const count = combined.length;
      const averageSentiment = count > 0 ? (totalSentiment / count) : 0;

      finalSourcesData[source.id] = {
        name: source.name,
        averageSentiment: Number(averageSentiment.toFixed(3)),
        distribution: { positive: positiveCount, neutral: neutralCount, negative: negativeCount },
        articles: combined
      };
    }

    const payload = {
      lastUpdated: new Date().toISOString(),
      analyzerUsed: `Dual Mode (Local + ${requestedAnalyzer.toUpperCase()}) [Auto Sync]`,
      sources: finalSourcesData,
      timeSeries: currentCache.timeSeries || []
    };

    appendTimeSeriesEntry(payload);

    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log('[Bg Sync] Automated sync completed and cache written.');
  } catch (error) {
    console.error('[Bg Sync] Automated sync failed:', error);
  }
}

function initScheduler() {
  const config = readConfig();
  const hours = Number(config.syncInterval) || 0;

  if (bgSyncIntervalId) {
    clearInterval(bgSyncIntervalId);
    bgSyncIntervalId = null;
  }

  if (hours > 0) {
    console.log(`[Scheduler] Initializing background sync every ${hours} hours.`);
    setTimeout(() => { runBackgroundSync(); }, 5000);

    const ms = hours * 60 * 60 * 1000;
    bgSyncIntervalId = setInterval(runBackgroundSync, ms);
  } else {
    console.log('[Scheduler] Background sync disabled.');
  }
}

// Start Server
app.listen(PORT, () => {
  console.log(`Vibe-O-Meter server running on http://localhost:${PORT}`);
  initScheduler(); // Start background sync scheduler if configured
});

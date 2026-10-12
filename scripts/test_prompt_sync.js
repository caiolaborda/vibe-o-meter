require('dotenv').config();
const Parser = require('rss-parser');
const Sentiment = require('sentiment');
const vader = require('vader-sentiment');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Vibe-O-Meter/2.0 (Test Sync)' },
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

function sanitizeText(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>?/gm, '').replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}

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

function analyzeLocally(item) {
  const text = item.title + ' ' + (item.description || '');
  const afinn = sentimentAnalyzer.analyze(text);
  const afinnScore = Math.max(-1.0, Math.min(1.0, afinn.score / 8));
  const v = vader.SentimentIntensityAnalyzer.polarity_scores(text);
  const vaderScore = v.compound;
  const avg = Number(((afinnScore + vaderScore) / 2).toFixed(2));
  return { afinnScore, vaderScore, avg };
}

async function runTest() {
  console.log('📡 Fetching diverse live articles from RSS feeds...');
  
  const feeds = [
    { source: 'Reuters', url: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en' },
    { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { source: 'The Guardian', url: 'https://www.theguardian.com/uk/rss' },
    { source: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
    { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' }
  ];

  const sampleArticles = [];

  for (const f of feeds) {
    try {
      const parsed = await parser.parseURL(f.url);
      if (parsed.items && parsed.items.length > 0) {
        const item = parsed.items[0];
        sampleArticles.push({
          source: f.source,
          title: sanitizeText(item.title),
          description: extractBestDescription(item),
          link: item.link
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch ${f.source}: ${e.message}`);
    }
  }

  // Also include the real Reuters Trump ceasefire headline from earlier user prompt to test edge case!
  sampleArticles.push({
    source: 'Reuters (Historical Benchmark)',
    title: 'Kyiv says Russia hits energy targets despite Trump ceasefire',
    description: 'Ukrainian officials reported that Russian missile strikes knocked out power grids across regional hubs on Sunday, despite newly brokered ceasefire arrangements.',
    link: 'https://reuters.com'
  });

  console.log(`\n📋 Testing ${sampleArticles.length} live & benchmark articles with Gemini...\n`);

  const promptData = sampleArticles.map((item, index) => ({
    index,
    source: item.source,
    headline: item.title,
    description: item.description
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

  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ];

  let rawJson = null;
  let modelUsed = null;

  for (const m of modelsToTry) {
    try {
      console.log(`🤖 Invoking Gemini API (${m})...`);
      const model = genAI.getGenerativeModel({
        model: m,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      });
      const res = await model.generateContent(prompt);
      rawJson = res.response.text();
      modelUsed = m;
      break;
    } catch (err) {
      console.warn(`Model ${m} failed: ${err.message}. Trying next...`);
    }
  }

  if (!rawJson) {
    console.error('Failed to get response from Gemini.');
    return;
  }

  const results = JSON.parse(rawJson);
  console.log(`✅ Received analysis from ${modelUsed}:\n`);

  results.forEach(res => {
    const orig = sampleArticles[res.index];
    const local = analyzeLocally(orig);

    console.log('------------------------------------------------------------');
    console.log(`📰 [${orig.source}] ${orig.title}`);
    console.log(`📄 Snippet (Phase 2): "${orig.description}"`);
    console.log(`\n🤖 GEMINI EVALUATION:`);
    console.log(`   Score:      ${res.score > 0 ? '+' : ''}${res.score.toFixed(2)} [${res.score < -0.15 ? 'Alarmist / Gloomy' : (res.score > 0.15 ? 'Uplifting' : 'Neutral')}]`);
    console.log(`   Topic:      ${res.category.toUpperCase()}`);
    console.log(`   Rationale:  ${res.explanation}`);
    console.log(`\n📊 NAIVE DICTIONARY (VADER/AFINN):`);
    console.log(`   Score:      ${local.avg > 0 ? '+' : ''}${local.avg.toFixed(2)} (AFINN: ${local.afinnScore.toFixed(2)}, VADER: ${local.vaderScore.toFixed(2)})`);
    console.log('------------------------------------------------------------\n');
  });
}

runTest().catch(console.error);

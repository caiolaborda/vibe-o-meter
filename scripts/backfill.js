/**
 * Gemini Backfill & Data Integrity Script
 * - Scans active articles across all outlets in data/vibe-data.json
 * - Batches unanalyzed articles through Gemini 3.5 Flash-Lite (1,500 RPD quota)
 * - Calibrates sentiment (-1.0 to +1.0) and assigns nuanced news categories
 * - Recalculates outlet averages and rebakes static web payloads
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const DATA_FILE = path.join(DATA_DIR, 'vibe-data.json');

const BATCH_SIZE = 20;
const RECENT_LIMIT = 40; // Backfill the top 40 most recent articles per outlet

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

async function analyzeBatchWithGemini(chunk, genAI, modelsToTry) {
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

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        });

        const res = await model.generateContent(prompt);
        let text = res.response.text().trim();
        if (text.startsWith('```json')) text = text.substring(7);
        else if (text.startsWith('```')) text = text.substring(3);
        if (text.endsWith('```')) text = text.substring(0, text.length - 3);
        text = tryRepairJsonArray(text.trim());

        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return { parsed, modelName };
        }
      } catch (err) {
        console.warn(`[Backfill] Model ${modelName} attempt ${attempt} warning:`, err.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw new Error('All models failed for batch');
}

async function runBackfill() {
  console.log('==============================================');
  console.log('🛡️ GEMINI DATA INTEGRITY & BACKFILL ENGINE');
  console.log('==============================================');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is not defined in environment.');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    process.env.GEMINI_MODEL
  ].filter(Boolean);

  if (!fs.existsSync(DATA_FILE)) {
    console.error('Error: data/vibe-data.json does not exist.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const sources = data.sources || {};
  const backfillAll = process.argv.includes('--all') || !process.argv.includes('--recent-only');

  // Gather articles that lack Gemini evaluation
  const queue = [];
  for (const [sourceId, source] of Object.entries(sources)) {
    const articles = source.articles || [];
    const targetSlice = backfillAll ? articles : articles.slice(0, RECENT_LIMIT);
    for (const art of targetSlice) {
      if (art.sentimentGemini === undefined || art.sentimentGemini === null) {
        queue.push({ sourceId, article: art });
      }
    }
  }

  console.log(`[Backfill] Identified ${queue.length} articles needing Gemini sentiment evaluation (${backfillAll ? 'full database' : 'recent window'}).`);

  if (queue.length === 0) {
    console.log('✨ All active articles already have Gemini sentiment evaluations! Database is healthy.');
    return;
  }

  const totalBatches = Math.ceil(queue.length / BATCH_SIZE);
  console.log(`[Backfill] Processing in ${totalBatches} batches of up to ${BATCH_SIZE} articles using ${modelsToTry[0]}...`);

  let processedCount = 0;
  let successCount = 0;

  for (let b = 0; b < queue.length; b += BATCH_SIZE) {
    const chunkItems = queue.slice(b, b + BATCH_SIZE);
    const articlesChunk = chunkItems.map(item => item.article);
    const batchNum = Math.floor(b / BATCH_SIZE) + 1;

    console.log(`[Backfill] Running batch ${batchNum}/${totalBatches} (${articlesChunk.length} articles)...`);
    try {
      const { parsed, modelName } = await analyzeBatchWithGemini(articlesChunk, genAI, modelsToTry);
      
      parsed.forEach(p => {
        const target = articlesChunk[p.index];
        if (target) {
          const score = typeof p.score === 'number' ? p.score : parseFloat(p.score) || 0;
          target.sentimentGemini = score;
          target.explanationGemini = p.explanation || `Analyzed with Gemini (${modelName}).`;
          target.categoryGemini = p.category || 'other';

          // Set primary values
          target.sentiment = score;
          target.explanation = target.explanationGemini;
          target.category = target.categoryGemini;
          successCount++;
        }
      });
      processedCount += articlesChunk.length;
      console.log(`  ✓ Batch ${batchNum} completed successfully.`);
    } catch (err) {
      console.error(`  ✕ Batch ${batchNum} failed:`, err.message);
    }

    if (b + BATCH_SIZE < queue.length) {
      await new Promise(r => setTimeout(r, 1200)); // Respect RPM limit
    }
  }

  console.log(`[Backfill] Finished processing. Successfully evaluated: ${successCount}/${queue.length} articles.`);

  // Recalculate outlet statistics
  const categoryStats = {};
  let totalScoreAll = 0;
  let totalArticlesAll = 0;

  for (const [sourceId, source] of Object.entries(sources)) {
    const articles = source.articles || [];
    let sourceScore = 0;
    let pos = 0;
    let neu = 0;
    let neg = 0;

    articles.forEach(art => {
      const s = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentLocal || 0);
      sourceScore += s;
      if (s > 0.15) pos++;
      else if (s < -0.15) neg++;
      else neu++;

      const cat = art.category || 'other';
      if (!categoryStats[cat]) categoryStats[cat] = { total: 0, count: 0 };
      categoryStats[cat].total += s;
      categoryStats[cat].count++;
    });

    const cnt = articles.length;
    source.averageSentiment = cnt > 0 ? Number((sourceScore / cnt).toFixed(3)) : 0;
    source.distribution = { positive: pos, neutral: neu, negative: neg };

    totalScoreAll += sourceScore;
    totalArticlesAll += cnt;
  }

  const globalAvg = totalArticlesAll > 0 ? Number((totalScoreAll / totalArticlesAll).toFixed(3)) : 0;
  const categoryAverages = {};
  Object.keys(categoryStats).forEach(c => {
    categoryAverages[c] = Number((categoryStats[c].total / categoryStats[c].count).toFixed(3));
  });

  const sortedOutlets = Object.entries(sources)
    .filter(([_, s]) => s.articles && s.articles.length > 0)
    .map(([id, s]) => ({ id, name: s.name, score: s.averageSentiment }))
    .sort((a, b) => a.score - b.score);

  if (!data.globalStats) data.globalStats = {};
  data.globalStats.globalSentiment = globalAvg;
  data.globalStats.totalArticles = totalArticlesAll;
  data.globalStats.mostNegativeOutlet = sortedOutlets[0] || null;
  data.globalStats.mostPositiveOutlet = sortedOutlets[sortedOutlets.length - 1] || null;
  data.globalStats.categoryAverages = categoryAverages;
  data.analyzerUsed = 'Google Gemini (AI)';

  // Save backfilled vibe-data.json
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');

  // Save lightweight summary and data.json
  const summarySources = {};
  for (const [id, s] of Object.entries(sources)) {
    const sorted = [...(s.articles || [])].sort((a, b) => a.sentiment - b.sentiment);
    summarySources[id] = {
      name: s.name,
      averageSentiment: s.averageSentiment,
      distribution: s.distribution,
      articleCount: (s.articles || []).length,
      sampleArticles: (s.articles || []).slice(0, 10),
      mostNegative: sorted[0] || null,
      mostPositive: sorted[sorted.length - 1] || null
    };
  }

  const summaryPayload = {
    ...data,
    sources: summarySources
  };

  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'data.json'), JSON.stringify(data), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'summary.json'), JSON.stringify(summaryPayload), 'utf8');

  console.log('==============================================');
  console.log('✅ Backfill Complete & Web Stores Synchronized!');
  console.log('==============================================');
}

if (require.main === module) {
  runBackfill().catch(console.error);
}

module.exports = { runBackfill };

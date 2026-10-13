/**
 * Standalone Daily Executive Briefing Generator
 * - Can be executed independently: `node scripts/briefing.js [--force]`
 * - Summarizes today's global vibe into a witty, tongue-in-cheek editorial pulse
 * - Completely decoupled from the heavy RSS news ingestion pipeline
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const DATA_FILE = path.join(DATA_DIR, 'vibe-data.json');

async function generateDailyBriefing(options = {}) {
  const force = options.force || process.argv.includes('--force');
  
  if (!fs.existsSync(DATA_FILE)) {
    console.warn('[Briefing] No vibe-data.json found. Run sync first.');
    return null;
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const now = new Date();
  const todayDateStr = now.toISOString().slice(0, 10);

  if (!force && data.editorialSummary && data.editorialSummaryDate === todayDateStr) {
    console.log(`[Briefing] Today's briefing (${todayDateStr}) already exists. Use --force to regenerate.`);
    return data.editorialSummary;
  }

  console.log(`[Briefing] Generating executive vibe briefing for ${todayDateStr}...`);

  // Extract strictly last-24-hours statistics and representative stories
  const sources = data.sources || {};
  const cutoff24 = now - 24 * 60 * 60 * 1000;
  const outlets24 = {};
  const articles24 = [];

  Object.entries(sources).forEach(([id, s]) => {
    (s.articles || []).forEach(art => {
      const pubTime = new Date(art.pubDate);
      if (pubTime >= cutoff24 && !isNaN(pubTime)) {
        if (!outlets24[id]) outlets24[id] = { name: s.name, scores: [] };
        const score = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentGemini || 0);
        outlets24[id].scores.push(score);
        articles24.push({
          outlet: s.name,
          title: art.title,
          score,
          category: art.category || 'other'
        });
      }
    });
  });

  const rankedOutlets24 = Object.values(outlets24)
    .filter(o => o.scores.length > 0)
    .map(o => ({
      name: o.name,
      count: o.scores.length,
      avg: o.scores.reduce((a, b) => a + b, 0) / o.scores.length
    }))
    .sort((a, b) => a.avg - b.avg);

  const mostAlarmistToday = rankedOutlets24[0] || { name: 'Breaking News Wires', avg: -0.4 };
  const mostCalmToday = rankedOutlets24[rankedOutlets24.length - 1] || { name: 'Public Broadcasters', avg: 0 };

  const sortedArticles = [...articles24].sort((a, b) => a.score - b.score);
  const darkestStories = sortedArticles.slice(0, 3).map(a => `${a.outlet}: "${a.title}"`).join('\n- ');
  const brightestStories = sortedArticles.slice(-3).reverse().map(a => `${a.outlet}: "${a.title}"`).join('\n- ');

  let briefingText = '';
  const apiKey = process.env.GEMINI_API_KEY;
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    process.env.GEMINI_MODEL
  ].filter(Boolean);

  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.7 }
        });

        const prompt = `You are a witty, razor-sharp news satirist writing the daily executive briefing for a global news mood monitor titled "There's No Such Thing As Good News".

Context from the past 24 hours across ${articles24.length} news headlines:
- Outlets leading the doom & panic today: ${mostAlarmistToday.name}
- Outlets maintaining the most composure/calm today: ${mostCalmToday.name}
- Sample darkest headlines from today:
- ${darkestStories || 'Murders, political raids, and international conflicts'}
- Sample brightest headlines from today:
- ${brightestStories || 'Nobel Prize awards, Mars rover discoveries, and astronomy breakthroughs'}

Task & Editorial Rules:
1. Write a short, sweet, hilarious, and cynical 2-to-3 sentence executive summary of the last 24 hours of global news.
2. ABSOLUTELY NO NUMBERS, DECIMALS, PERCENTAGES, OR STATS (no "-0.40", "0.15", or "70%"). Express the entire vibe through sharp narrative interpretation, clever metaphors, and biting wit.
3. Compare today's earthly geopolitical panic with the science/tech nerds celebrating space rovers, exoplanets, or prize-winning theories.
4. Output ONLY the 2-3 sentences.`;

        const res = await model.generateContent(prompt);
        const text = res.response.text().trim().replace(/^["']|["']$/g, '');
        if (text && text.length > 20) {
          briefingText = text;
          console.log(`[Briefing] Generated via Gemini (${modelName}):`, briefingText);
          break;
        }
      } catch (err) {
        console.warn(`[Briefing] Model ${modelName} failed:`, err.message);
      }
    }
  }

  // Witty deterministic fallback if AI call fails or key is missing
  if (!briefingText) {
    const alarmistText = mostAlarmistToday ? `${mostAlarmistToday.name} is leading today's existential panic` : 'Geopolitical dread is in full swing';
    briefingText = `Global headlines over the last 24 hours lean decidedly gloomy, with ${alarmistText} while public broadcasters quietly try to maintain composure. Fortunately, our overachieving science editors are desperately pointing to distant exoplanets as a backup plan.`;
    console.log('[Briefing] Generated via deterministic synthesis:', briefingText);
  }

  // Update in-memory data
  data.editorialSummary = briefingText;
  data.editorialSummaryDate = todayDateStr;
  if (!data.globalStats) data.globalStats = {};
  data.globalStats.editorialSummary = briefingText;
  data.globalStats.editorialSummaryDate = todayDateStr;

  // Save to disk
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');

  // Update public files if they exist
  const publicDataFile = path.join(PUBLIC_DATA_DIR, 'data.json');
  const publicSummaryFile = path.join(PUBLIC_DATA_DIR, 'summary.json');
  if (fs.existsSync(publicDataFile)) {
    try {
      const pubData = JSON.parse(fs.readFileSync(publicDataFile, 'utf8'));
      pubData.editorialSummary = briefingText;
      pubData.editorialSummaryDate = todayDateStr;
      if (pubData.globalStats) {
        pubData.globalStats.editorialSummary = briefingText;
        pubData.globalStats.editorialSummaryDate = todayDateStr;
      }
      fs.writeFileSync(publicDataFile, JSON.stringify(pubData), 'utf8');
    } catch (e) {}
  }
  if (fs.existsSync(publicSummaryFile)) {
    try {
      const pubSum = JSON.parse(fs.readFileSync(publicSummaryFile, 'utf8'));
      pubSum.editorialSummary = briefingText;
      pubSum.editorialSummaryDate = todayDateStr;
      if (pubSum.globalStats) {
        pubSum.globalStats.editorialSummary = briefingText;
        pubSum.globalStats.editorialSummaryDate = todayDateStr;
      }
      fs.writeFileSync(publicSummaryFile, JSON.stringify(pubSum), 'utf8');
    } catch (e) {}
  }

  console.log('✅ [Briefing] Executive briefing successfully updated across all stores.');
  return briefingText;
}

if (require.main === module) {
  generateDailyBriefing().catch(console.error);
}

module.exports = { generateDailyBriefing };

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

  // Extract key aggregate statistics
  const sources = data.sources || {};
  const sortedOutlets = Object.entries(sources)
    .filter(([_, s]) => s.articles && s.articles.length > 0)
    .map(([id, s]) => ({ id, name: s.name, score: s.averageSentiment }))
    .sort((a, b) => a.score - b.score);

  const mostNegativeOutlet = sortedOutlets[0] || null;
  const mostPositiveOutlet = sortedOutlets[sortedOutlets.length - 1] || null;
  const globalSentiment = data.globalStats?.globalSentiment ?? 0;
  const categoryAverages = data.globalStats?.categoryAverages ?? {};
  const totalArticles = data.globalStats?.totalArticles ?? 0;

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

      const prompt = `You are a witty, razor-sharp, tongue-in-cheek news editor writing the daily "Executive Vibe Pulse" for a global news sentiment monitor.
Key metrics today:
- Global Media Sentiment: ${globalSentiment > 0 ? '+' : ''}${globalSentiment} (scale: -1.0 pure doom to +1.0 pure optimism)
- Most Gloomy Outlet: ${mostNegativeOutlet ? `${mostNegativeOutlet.name} (${mostNegativeOutlet.score})` : 'N/A'}
- Most Cheerful Outlet: ${mostPositiveOutlet ? `${mostPositiveOutlet.name} (${mostPositiveOutlet.score})` : 'N/A'}
- Category Breakdown: ${JSON.stringify(categoryAverages)}
- Headlines Analyzed: ${totalArticles}

Task:
Write a clever, slightly cynical 2-to-3 sentence executive briefing on the mood of the world's news media today. Touch on the friction between geopolitical doom-mongering and optimistic science/tech beats. Keep it punchy, memorable, and intelligent. Return ONLY the 2-3 sentences.`;

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
    const moodAdj = globalSentiment < -0.2 ? 'decidedly apocalyptic' : (globalSentiment < -0.05 ? 'cautiously grumpy' : (globalSentiment > 0.1 ? 'suspiciously upbeat' : 'ambivalently neutral'));
    const alarmistText = mostNegativeOutlet ? `${mostNegativeOutlet.name} is leading today's existential dread charge` : 'Geopolitical dread is in full swing';
    const brightSpot = categoryAverages.science > 0 || categoryAverages.technology > 0 
      ? 'while tech and science sections desperately try to pump dopamine into our feeds' 
      : 'with barely a cheerful headline in sight';
    briefingText = `Earth's media vibe lands at a ${moodAdj} ${globalSentiment > 0 ? '+' : ''}${globalSentiment} today. ${alarmistText}, ${brightSpot}. Brace yourselves accordingly.`;
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

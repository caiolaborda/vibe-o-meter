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
  const sampleHeadlines = [
    ...sortedArticles.slice(0, 4),
    ...sortedArticles.slice(Math.max(0, Math.floor(sortedArticles.length / 2) - 2), Math.floor(sortedArticles.length / 2) + 2),
    ...sortedArticles.slice(-4).reverse()
  ].filter((a, i, arr) => a && arr.findIndex(x => x.title === a.title) === i)
   .map(a => `- [${a.outlet}] "${a.title}"`).join('\n');

  // Extract dominant cross-outlet wire clusters (events reported by 2+ independent desks)
  const sharedClusters = data.sharedStoryClusters || [];
  const topClustersContext = sharedClusters.slice(0, 4).map(c => {
    return `- "${c.story}" (${c.coverage?.length || 0} desks): ${c.summary || ''}`;
  }).join('\n');

  let briefingText = '';
  const apiKey = process.env.GEMINI_API_KEY;
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.8 }
        });

        const prompt = `You are a razor-sharp, deadpan news satirist writing the daily front-page mood kicker for "There's No Such Thing As Good News" (an autonomous daily audit of media pessimism).

IMPORTANT MEDIA SCOPE:
These are the world's premier international news wires, global broadsheets, and major broadcast networks (BBC, Reuters, Associated Press, Bloomberg, The New York Times, CNN, etc.). NEVER refer to this reporting as "local news" — treat this as the collective output of the global media apparatus.

YOUR GOAL:
Scan today's headlines and write a crisp, cynical, 1-to-3 sentence observation capturing the day's collective news vibe.

THE VIBE WE WANT:
- Lean, punchy, and fast-paced (aim for ~25 to 50 words max).
- Deadpan, wry, and observational—like a sharp newsroom veteran summing up the global wires with an effortless shrug and a smirk.
- NO RIGID FORMULA OR FIXED SENTENCE BLUEPRINT. Do not follow a robotic "Sentence 1 is this, Sentence 2 is that" structure. React organically to whatever absurdities, panics, or contrasts actually stand out across today's stories.
- Avoid purple prose, convoluted run-ons, or forced metaphors. Keep it natural, rhythmic, and memorable.

TONE INSPIRATION (aim for this cadence and economy of language, but do NOT copy its words):
"Another banner day for global dread. Politicians traded fresh hostility, markets flinched on cue, and deep-space science once again stepped up as humanity's designated driver."

STRICT RULES:
- NO NUMBERS, DECIMALS, PERCENTAGES, OR STATS (no "-0.21", "24 hours", "197 articles", etc.).
- NEVER refer to this as "local news" or "regional news".
- KEEP IT TIGHT (strictly under 50 words total).
- Output ONLY the raw paragraph text. No quotation marks, no markdown headers, no bullet points.

TODAY'S GLOBAL HEADLINES CONTEXT:
- Outlets leading the panic: ${mostAlarmistToday.name}
- Outlets holding composure: ${mostCalmToday.name}
- Major cross-wire story clusters (what multiple desks are covering right now):
${topClustersContext || '- Major diplomatic friction, volatile market shifts, and ongoing conflicts'}
- Representative stories across the global wire:
${sampleHeadlines || '- War strikes, political clashes, economic jitters, and scientific breakthroughs'}`;

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

  // Witty deterministic fallback (Option 3 Micro-Dispatch) if AI call fails or key is missing
  if (!briefingText) {
    briefingText = "Another banner day for global dread. Politicians traded fresh hostility, markets flinched on cue, and deep-space science once again stepped up as humanity's designated driver.";
    console.log('[Briefing] Generated via deterministic Micro-Dispatch fallback:', briefingText);
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

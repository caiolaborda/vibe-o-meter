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
          url: art.link || art.url || '',
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

  const mostAlarmistToday = rankedOutlets24[0] || { name: 'Breaking News Outlets', avg: -0.4 };
  const mostCalmToday = rankedOutlets24[rankedOutlets24.length - 1] || { name: 'Public Broadcasters', avg: 0 };

  // Build diverse topic buckets so the model sees the full zoomed-out panorama of human civilization today
  // (1. Major Geopolitical/Political clusters, 2. Corporate/Economic shenanigans, 3. Culture/Tech/Media, 4. Pure Science/Nature breakthroughs)
  const rawTragedyRegex = /\b(mass shooting|elementary school|killed|dead|deaths|murdered|massacre|rape|sexual assault|child abuse|suicide|funeral|grief|mourning|casualties)\b/i;

  const topClusterLines = (data.sharedStoryClusters || [])
    .filter(c => !rawTragedyRegex.test(c.story + ' ' + (c.summary || '')))
    .slice(0, 6)
    .map(c => {
      const mainArt = c.coverage?.[0] || {};
      const link = mainArt.link || '';
      return `- [MAJOR CLUSTER - ${c.coverage?.length || 2} desks] "${c.story}": ${c.summary || ''} | URL: ${link}`;
    }).join('\n');

  const pickBucket = (cats, filterFn, limit = 3) =>
    articles24
      .filter(a => cats.includes(a.category) && !rawTragedyRegex.test(a.title) && filterFn(a))
      .sort((a, b) => Math.abs(b.framingMod || b.score) - Math.abs(a.framingMod || a.score))
      .slice(0, limit);

  const corpBusiness = pickBucket(['business'], a => a.score < 0, 3);
  const cultureTech = pickBucket(['entertainment', 'technology', 'sports', 'other'], a => a.score < 0.15, 3);
  const scienceNature = articles24
    .filter(a => ['science', 'climate', 'health'].includes(a.category) && a.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const sampleHeadlines = [
    ...corpBusiness.map(a => `- [CORPORATE / ECONOMY - ${a.outlet}] "${a.title}" | URL: ${a.url}`),
    ...cultureTech.map(a => `- [CULTURE / TECH - ${a.outlet}] "${a.title}" | URL: ${a.url}`),
    ...scienceNature.map(a => `- [SCIENCE / BREAKTHROUGH - ${a.outlet}] "${a.title}" | URL: ${a.url}`)
  ].join('\n');

  let briefingText = '';
  const apiKey = process.env.GEMINI_PAID_API_KEY || process.env.GEMINI_API_KEY;
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.85, responseMimeType: 'application/json' }
        });

        const prompt = `You are a dry, effortlessly witty editorial columnist (think Charlie Brooker, Douglas Adams, Weekend Update) writing the daily 2-sentence front-page mood kicker for "There's No Such Thing As Good News".

WHY MOST AI SATIRE FAILS (AND HOW TO AVOID IT):
- Bad AI satire tries too hard: it writes clunky, disconnected one-liners about individual politicians ("As the Pope proved Catholic guilt knows no sick leave, Trump bravely defended fossil fuels..."). That reads like forced, try-hard dad jokes.
- Great satire zooms out to look at the entire human species from 30,000 feet: it weaves 3 or 4 wildly different spheres of today's news (high-stakes statecraft, corporate/economic mischief, trivial cultural drama, and a genuine scientific/astronomical breakthrough) into a SINGLE, seamless observation that lands on an understated, devastating final button.

GOLD-STANDARD BENCHMARK (Study why this rhythm and perspective works so well, without copying its exact opener every day):
"Nothing says civilization is peaking quite like the Justice Department having to officially cancel the [execution livestream](url) while Brussels busies itself [raiding European automakers](url) and British broadcasters agonize over [the end of Saturday Night Takeaway](url). At this rate, the astronomers marveling at a [newly discovered green star](url) are mostly just looking for somewhere to relocate."

Notice why that works:
1. Sentence 1 sweeps effortlessly across 3 different scales of human absurdity (dystopian statecraft + corporate scandal + trivial cultural angst) in one smooth breath.
2. Sentence 2 pivots to a real scientific/medical/astronomical story from today and uses it as a dry, deadpan punchline about the state of humanity.
3. No forced adjectives ("furiously", "bravely", "generously"), no hacky stand-up puns, just bone-dry observational elevation.

YOUR TASK:
Generate 3 distinct candidate drafts in JSON format, each using a different natural opening hook and angle, then select the single sharpest, most effortless winner ("best_index": 0, 1, or 2):
- Draft 0: A zoomed-out "state of human civilization" sweep contrasting political/corporate/cultural absurdity with a scientific or medical breakthrough button.
- Draft 1: A dry "priorities of the global press" observation contrasting what newsrooms are panicking over today vs. the quiet researchers/explorers actually advancing the species.
- Draft 2: An ironic juxtaposition of elite/institutional chaos vs. a surprising bright spot from today's stories.

STRICT RULES FOR EVERY DRAFT:
- Strictly 2 sentences, 38 to 56 words total.
- Weave 3 to 4 interactive markdown links [concise 2-4 word phrase](url) naturally into the text using ONLY the exact URLs provided below.
- NEVER use the words "wire", "wires", "beat", or "local news", and never include numeric scores.

TODAY'S PANORAMA OF STORIES & URLS:
${topClusterLines}
${sampleHeadlines}

Return ONLY valid JSON in this exact format:
{
  "drafts": ["draft 0 markdown string", "draft 1 markdown string", "draft 2 markdown string"],
  "best_index": 0
}`;

        const res = await model.generateContent(prompt);
        let raw = res.response.text().trim();
        if (raw.startsWith('```json')) raw = raw.substring(7);
        else if (raw.startsWith('```')) raw = raw.substring(3);
        if (raw.endsWith('```')) raw = raw.substring(0, raw.length - 3);
        const parsed = JSON.parse(raw.trim());
        const chosen = (parsed.drafts && parsed.drafts[parsed.best_index ?? 0]) || (parsed.drafts && parsed.drafts[0]) || '';
        const text = chosen.trim().replace(/^["']|["']$/g, '');
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
    briefingText = "Nothing says civilization is peaking quite like politicians treating daily governance as performance art while financial desks hyperventilate over every basis point. At this rate, the deep-space astronomers discovering new stars are mostly just scouting real estate for the rest of us.";
    console.log('[Briefing] Generated via deterministic fallback:', briefingText);
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

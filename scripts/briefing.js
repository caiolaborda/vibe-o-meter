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

  // Extract last-24-hours statistics and representative stories (with 72h fallback for constructive breakthroughs)
  const sources = options.sources || data.sources || {};
  const clustersList = options.sharedStoryClusters || data.sharedStoryClusters || [];
  const cutoff24 = now - 24 * 60 * 60 * 1000;
  const cutoff72 = now - 72 * 60 * 60 * 1000;
  const outlets24 = {};
  const articles24 = [];
  const articles72Constructive = [];

  Object.entries(sources).forEach(([id, s]) => {
    (s.articles || []).forEach(art => {
      const pubTime = new Date(art.pubDate);
      if (isNaN(pubTime)) return;
      const score = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentGemini || 0);
      const cleanDesc = (art.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      const cleanExp = (art.explanation || '').replace(/\s*\[Event Base:.*$/, '').trim();
      const contextSnippet = cleanDesc || cleanExp || '';

      if (pubTime >= cutoff24) {
        if (!outlets24[id]) outlets24[id] = { name: s.name, scores: [] };
        outlets24[id].scores.push(score);
        articles24.push({
          outlet: s.name,
          title: art.title,
          context: contextSnippet,
          url: art.link || art.url || '',
          score,
          framingMod: art.framingMod || 0,
          category: art.category || 'other'
        });
      } else if (pubTime >= cutoff72 && score >= 0.15) {
        articles72Constructive.push({
          outlet: s.name,
          title: art.title,
          context: contextSnippet,
          url: art.link || art.url || '',
          score,
          framingMod: art.framingMod || 0,
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

  // Filter out mass-casualty / acute tragedy stories so the witty mood kicker never punches down on victims
  const rawTragedyRegex = /\b(mass shooting|elementary school|killed|dead|deaths|murdered|massacre|rape|sexual assault|child abuse|suicide|funeral|grief|mourning|casualties)\b/i;

  // 1. Major Multi-Outlet Story Clusters (up to 12, active within 48h) with full summary + sample headlines for rich context
  const cutoff48h = now - (48 * 60 * 60 * 1000);
  const activeClusters48h = clustersList.filter(c => {
    const newestMs = Math.max(...(c.coverage || []).map(a => new Date(a.pubDate).getTime() || 0), 0);
    return newestMs >= cutoff48h;
  });
  const briefingClusterPool = activeClusters48h.length >= 6 ? activeClusters48h : clustersList;
  const topClusterLines = briefingClusterPool
    .filter(c => !rawTragedyRegex.test(c.story + ' ' + (c.summary || '')))
    .slice(0, 12)
    .map(c => {
      const mainArt = c.coverage?.[0] || {};
      const link = mainArt.link || '';
      const sampleAngles = (c.coverage || []).slice(0, 2).map(cov => `${cov.sourceName}: "${cov.title}"`).join(' / ');
      return `- [CLUSTER (${c.coverage?.length || 2} outlets) | "${c.story}"] Summary: ${c.summary || sampleAngles} (Angles: ${sampleAngles}) | URL: ${link}`;
    }).join('\n');

  const formatArtLine = (tag, a) => {
    const ctx = a.context ? ` — Context: ${a.context}` : '';
    return `- [${tag} - ${a.outlet}] "${a.title}"${ctx} | URL: ${a.url}`;
  };

  const seenUrls = new Set();
  const pickBucket = (cats, filterFn, limit = 6) => {
    const picked = [];
    const pool = articles24
      .filter(a => cats.includes(a.category) && a.url && !rawTragedyRegex.test(a.title + ' ' + a.context) && filterFn(a))
      .sort((a, b) => (Math.abs(b.framingMod) * 1.5 + Math.abs(b.score) + (b.context ? 0.2 : 0)) - (Math.abs(a.framingMod) * 1.5 + Math.abs(a.score) + (a.context ? 0.2 : 0)));
    for (const a of pool) {
      if (picked.length >= limit) break;
      if (seenUrls.has(a.url)) continue;
      seenUrls.add(a.url);
      picked.push(a);
    }
    return picked;
  };

  const politicsWorld = pickBucket(['politics', 'world'], a => a.score < 0.10 && a.score > -0.65, 6);
  const corpBusiness = pickBucket(['business'], a => a.score < 0.15, 6);
  const cultureTech = pickBucket(['entertainment', 'technology', 'sports', 'other'], a => a.score < 0.18, 6);

  // Constructive / Breakthrough pool: combine 24h positive dispatches (and 72h fallback if needed) across science, nature, health, world, tech
  const constructivePool = [
    ...articles24.filter(a => a.score >= 0.15 && a.url),
    ...articles72Constructive.filter(a => a.url)
  ].sort((a, b) => b.score - a.score);

  const scienceNature = [];
  for (const a of constructivePool) {
    if (scienceNature.length >= 8) break;
    if (seenUrls.has(a.url)) continue;
    seenUrls.add(a.url);
    scienceNature.push(a);
  }

  const sampleHeadlines = [
    ...politicsWorld.map(a => formatArtLine('POLITICS / STATECRAFT', a)),
    ...corpBusiness.map(a => formatArtLine('CORPORATE / ECONOMY', a)),
    ...cultureTech.map(a => formatArtLine('TECH / CULTURE / QUIRKY', a)),
    ...scienceNature.map(a => formatArtLine('VERIFIED GOOD NEWS / BREAKTHROUGH', a))
  ].join('\n');

  let briefingText = '';
  const apiKey = process.env.GEMINI_PAID_API_KEY || process.env.GEMINI_API_KEY;
  const envModel = process.env.GEMINI_MODEL === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : process.env.GEMINI_MODEL;
  const modelsToTry = [
    envModel,
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  if (apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.85, responseMimeType: 'application/json' }
        });

        const prompt = `You are a dry, effortlessly witty editorial columnist (think Charlie Brooker, Douglas Adams, Marina Hyde, Weekend Update) writing the daily 2-sentence front-page executive briefing for "There's No Such Thing As Good News".

HOW TO USE THE FULL MENU OF STORIES & CONTEXT BELOW:
- Below is a rich buffet of today's major multi-outlet story clusters and individual dispatches across 5 spheres (Clusters, Politics/Statecraft, Corporate/Economy, Tech/Culture, and Verified Breakthroughs), complete with their lead summaries and context.
- You have complete editorial freedom to curate and pick whichever 3 or 4 stories from the list have the funniest, sharpest observational chemistry together.
- Use the lead summaries/context to pull specific, concrete details (what actually happened, the ironic stakes, the specific institution or discovery) rather than just parroting headline titles.

WHY MOST AI SATIRE FAILS (AND HOW TO AVOID IT):
- Bad AI satire tries too hard: it writes clunky, disconnected one-liners about individual politicians ("As the Pope proved Catholic guilt knows no sick leave, Trump bravely defended fossil fuels..."). That reads like forced, try-hard dad jokes.
- Great satire zooms out to look at the entire human species from 30,000 feet: it weaves 3 or 4 wildly different spheres of today's news (high-stakes statecraft, corporate/economic mischief, trivial cultural/tech drama, and a genuine scientific/ecological/archaeological breakthrough) into a SINGLE, seamless observation that lands on an understated, devastating final button.

GOLD-STANDARD BENCHMARK (Study why this rhythm and perspective works so well, without copying its exact opener every day):
"Nothing says civilization is peaking quite like the Justice Department having to officially cancel the [execution livestream](url) while Brussels busies itself [raiding European automakers](url) and British broadcasters agonize over [the end of Saturday Night Takeaway](url). At this rate, the astronomers marveling at a [newly discovered green star](url) are mostly just looking for somewhere to relocate."

Notice why that works:
1. Sentence 1 sweeps effortlessly across 3 different scales of human absurdity (dystopian statecraft + corporate scandal + trivial cultural angst) in one smooth breath, using specific details from the story context.
2. Sentence 2 pivots to a real scientific/ecological/medical/archaeological breakthrough from today and uses it as a dry, deadpan punchline about the state of humanity.
3. No forced adverbs ("furiously", "bravely", "generously"), no hacky stand-up puns, just bone-dry observational elevation.

YOUR TASK:
Generate 3 distinct candidate drafts in JSON format, each picking a strong combination of stories and using a different natural opening hook and angle, then select the single sharpest, most effortless winner ("best_index": 0, 1, or 2):
- Draft 0: A zoomed-out "state of human civilization" sweep contrasting political/corporate/cultural absurdity with a scientific, ecological, or archaeological breakthrough button.
- Draft 1: A dry "priorities of the global press" observation contrasting what newsrooms and institutions are fixated on today vs. the quiet researchers/conservationists actually advancing the species.
- Draft 2: An ironic juxtaposition of elite/corporate/technological hubris vs. a surprising bright spot from today's stories.

STRICT RULES FOR EVERY DRAFT:
- Strictly 2 sentences, 38 to 58 words total.
- Weave 3 to 4 interactive markdown links [concise 2-4 word phrase](url) naturally into the text using ONLY the exact URLs provided below.
- NEVER use the words "wire", "wires", "beat", or "local news", and never include numeric scores.

TODAY'S FULL MENU OF CLUSTERS, STORIES, CONTEXT & URLS:
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

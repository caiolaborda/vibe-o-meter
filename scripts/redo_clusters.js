require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY');
    process.exit(1);
  }

  const targetDataFile = fs.existsSync('data/vibe-data.json') ? 'data/vibe-data.json' : 'public/data/data.json';
  console.log('Reading from:', targetDataFile);
  const data = JSON.parse(fs.readFileSync(targetDataFile, 'utf8'));
  const finalSources = data.sources || {};

  // Flatten recent headlines from all sources: include all articles from the past 36h (up to 35 per outlet),
  // falling back to up to 18 articles within the past 5 days for lower-frequency feeds.
  const candidates = [];
  const thirtySixHoursAgo = Date.now() - (36 * 60 * 60 * 1000);
  const fiveDaysAgo = Date.now() - (5 * 24 * 60 * 60 * 1000);
  Object.entries(finalSources).forEach(([sourceId, src]) => {
    const articles = src.articles || [];
    let addedForSource = 0;
    for (let i = 0; i < articles.length; i++) {
      const art = articles[i];
      if (!art || !art.title || art.title.trim().length <= 10) continue;
      const t = art.pubDate ? new Date(art.pubDate).getTime() : NaN;
      if (!isNaN(t) && t < fiveDaysAgo) continue;

      const isRecent36h = !isNaN(t) && t >= thirtySixHoursAgo;
      if (addedForSource >= 35) break;
      if (!isRecent36h && addedForSource >= 18) continue;

      candidates.push({
        sourceId,
        sourceName: src.name,
        title: art.title.trim(),
        sentiment: typeof art.sentimentGemini === 'number' ? art.sentimentGemini : (art.sentiment || 0),
        link: art.link || '',
        pubDate: art.pubDate || ''
      });
      addedForSource++;
    }
  });

  console.log(`Gathered ${candidates.length} candidate headlines across ${Object.keys(finalSources).length} sources.`);
  if (candidates.length < 6) {
    console.error('Not enough candidate headlines');
    process.exit(1);
  }

  const promptData = candidates.map((c, idx) => ({ id: idx, source: c.sourceId, title: c.title }));
  const prompt = `You are a senior news editor analyzing recent headlines across global newsrooms.
Identify genuine, major real-world news events, developments, and discoveries being covered by 2 or more DIFFERENT news outlets.
Group them into story clusters.

Rules:
- A cluster MUST include headlines from at least 2 distinct outlets reporting on the SAME underlying event, development, or discovery.
- Group ALL matching headlines for the event across all outlets (do not limit to 2 if 4 or 6 outlets cover it).
- Provide a concise neutral story title (3-6 words, e.g. "Ancient Shipwreck Found Off Turkey", "UK Early Prisoner Release", "Boeing Machinist Strike", "Federal Reserve Rate Cut").
- Provide a concise 2-sentence editorial summary explaining the core real-world event and how the outlets are reporting it.
- Provide the list of matching headline IDs.
- Return ONLY a JSON array. If no shared stories exist, return [].

Headlines:
${JSON.stringify(promptData, null, 2)}

Return JSON array in format:
[
  { "story": "Topic Title", "summary": "Two-sentence editorial summary of the event.", "ids": [0, 4, 12] }
]`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-2.5-flash'
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let rawClusters = null;
  for (const modelName of modelsToTry) {
    try {
      console.log(`Calling ${modelName} for clustering...`);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      });
      const resp = await model.generateContent(prompt);
      let text = resp.response.text().trim();
      if (text.startsWith('```json')) text = text.substring(7);
      else if (text.startsWith('```')) text = text.substring(3);
      if (text.endsWith('```')) text = text.substring(0, text.length - 3);
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawClusters = parsed;
        console.log(`${modelName} returned ${rawClusters.length} raw clusters.`);
        break;
      }
    } catch (err) {
      console.warn(`Clustering attempt with ${modelName} failed: ${err.message}`);
    }
  }
  if (!rawClusters) {
    console.error('All models failed clustering');
    process.exit(1);
  }

  const formattedClusters = [];
  rawClusters.forEach(cl => {
    if (!cl.ids || cl.ids.length < 2) return;
    const matchingArticles = cl.ids.map(id => candidates[id]).filter(Boolean);
    const uniqueSources = new Set(matchingArticles.map(m => m.sourceId));
    if (uniqueSources.size >= 2) {
      const scores = matchingArticles.map(m => m.sentiment);
      const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
      const variance = Number((scores.reduce((acc, val) => acc + Math.pow(val - avgScore, 2), 0) / scores.length).toFixed(3));
      
      formattedClusters.push({
        story: cl.story,
        summary: cl.summary || '',
        averageSentiment: avgScore,
        sentimentSpread: variance,
        outletCount: uniqueSources.size,
        coverage: matchingArticles.map(m => ({
          sourceId: m.sourceId,
          sourceName: m.sourceName,
          title: m.title,
          sentiment: m.sentiment,
          link: m.link,
          pubDate: m.pubDate
        }))
      });
    }
  });

  formattedClusters.sort((a, b) => (b.outletCount * (b.sentimentSpread + 0.1)) - (a.outletCount * (a.sentimentSpread + 0.1)));
  console.log(`Formatted ${formattedClusters.length} valid multi-source clusters:`);
  formattedClusters.forEach(c => {
    console.log(` - [${c.outletCount} outlets, spread ${c.sentimentSpread}] ${c.story}: ${c.summary}`);
  });

  // Save back to data files
  data.sharedStoryClusters = formattedClusters;
  fs.writeFileSync('data/vibe-data.json', JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync('public/data/data.json')) {
    const pubData = JSON.parse(fs.readFileSync('public/data/data.json', 'utf8'));
    pubData.sharedStoryClusters = formattedClusters;
    fs.writeFileSync('public/data/data.json', JSON.stringify(pubData), 'utf8');
  }
  if (fs.existsSync('public/data/summary.json')) {
    const pubSummary = JSON.parse(fs.readFileSync('public/data/summary.json', 'utf8'));
    pubSummary.sharedStoryClusters = formattedClusters;
    fs.writeFileSync('public/data/summary.json', JSON.stringify(pubSummary), 'utf8');
  }

  console.log('✅ Updated data/vibe-data.json, public/data/data.json, and public/data/summary.json with fresh clusters!');
}

main().catch(err => {
  console.error('Error in clustering redo:', err);
  process.exit(1);
});

/**
 * Daily Cross-Archive Longitudinal Realignment & Graph Healer (realign-archive.js)
 *
 * Sweeps the rolling 14-to-30-day cluster archive (clusters-archive.json + vibe-data.json)
 * across 8 overlapping Geopolitical / Thematic Silos to catch:
 *   1. Multi-day / cross-week evolution continuations that drifted past the 48h-72h live sync window
 *   2. Missing causal lateralConnections across the archive (connecting curLat:0 precursors to later fallout)
 *   3. Summary coverage gaps where multi-day headlines outgrew the cluster summary
 *
 * Usage:
 *   node scripts/realign-archive.js
 *   node scripts/realign-archive.js --from-json <path-to-audit-json>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data');
const VIBE_DATA_FILE = path.join(DATA_DIR, 'vibe-data.json');
const ARCHIVE_FILE = path.join(DATA_DIR, 'clusters-archive.json');

const SILO_DEFS = [
  {
    id: 'europe-unrest-governance',
    name: 'European Civil Unrest, Security, Energy & EU Governance',
    re: /\b(france|french|paris|nice|louvre|macron|italy|italian|milan|rome|meloni|albania|tirana|spain|spanish|catalonia|madrid|uk|britain|british|london|burnham|fairford|north sea|jackdaw|germany|german|berlin|belgium|brussels|eu|european|vatican|pope|ireland|dublin|poland|greek|greece|sweden|dutch|netherlands)\b/i
  },
  {
    id: 'mena-maritime-energy',
    name: 'Middle East, Red Sea / Hormuz Chokepoints & Sovereign Security',
    re: /\b(israel|israeli|netanyahu|gaza|palestin|west bank|hamas|hezbollah|lebanon|beirut|iran|iranian|tehran|hormuz|yemen|houthi|aden|red sea|saudi|riyadh|egypt|cairo|syria|damascus|iraq|jordan|qatar|uae|dubai|gulf|tanker|oil|opec|petrol)\b/i
  },
  {
    id: 'ukraine-russia-nato',
    name: 'Russia-Ukraine War, NATO & Defense Tech Infrastructure',
    re: /\b(ukraine|ukrainian|kyiv|zelensky|zelenskyy|russia|russian|moscow|putin|st petersburg|kremlin|starlink|nato|drone|black sea|crimea|sanction|belarus|moldova|baltic|estonia|latvia|lithuania|romania)\b/i
  },
  {
    id: 'us-domestic-institutions',
    name: 'U.S. Executive, Judicial, Federal Enforcement & Electoral Politics',
    re: /\b(trump|biden|vance|white house|senate|congress|house of representatives|supreme court|doj|justice department|fbi|federal|republican|democrat|midterm|voter|voting|election|ballot|omar|minnesota|michigan|ohio|oregon|texas|florida|california|virginia|pentagon|ice|deportation|immigration|prison|indict|subpoena|governor)\b/i
  },
  {
    id: 'americas-globalsouth',
    name: 'Americas, Canada & Global South Political/Economic Shifts',
    re: /\b(brazil|brazilian|lula|bolsonaro|amazon|workweek|canada|canadian|alberta|ottawa|trudeau|mexico|mexican|argentina|milei|colombia|venezuela|chile|peru|el salvador|haiti|haitian|africa|african|nigeria|kenya|sudan|congo|ebola|south africa|caribbean)\b/i
  },
  {
    id: 'apac-china-trade',
    name: 'Asia-Pacific Security, China Macro & Global Trade/Tariffs',
    re: /\b(china|chinese|beijing|xi jinping|taiwan|taipei|japan|japanese|tokyo|mmx|jaxa|south korea|seoul|north korea|pyongyang|australia|australian|sydney|haines|india|indian|modi|philippines|asean|indonesia|vietnam|pakistan|tariff|trade|export|import|supply chain|gdp|q3)\b/i
  },
  {
    id: 'ai-tech-space-corporate',
    name: 'AI, Frontier Tech, Space, Cyber & Corporate Consolidation',
    re: /\b(ai|artificial intelligence|openai|anthropic|claude|chatgpt|deepseek|google|alphabet|apple|microsoft|meta|amazon|tesla|spacex|musk|roadster|starlink|nvidia|tsmc|globalfoundries|chip|semiconductor|cyber|hack|breach|ransomware|crypto|bitcoin|merger|antitrust|sec|wall street|stock|shares|billion|nasa|space|launch|satellite|martian|moon|asteroid)\b/i
  },
  {
    id: 'climate-energy-health-science',
    name: 'Global Energy, Climate Disasters, Public Health & Science',
    re: /\b(climate|emissions|deforestation|flood|floods|flooding|storm|hurricane|typhoon|wildfire|earthquake|drought|heatwave|nuclear|gas field|renewable|solar|wind|grid|outbreak|virus|vaccine|pandemic|hospital|cancer|surgery|fda|who|medical|health|scientist|study|discovery|species|ocean)\b/i
  }
];

async function callGeminiJson(prompt, apiKey, modelPreference = ['gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
  let lastErr = null;
  for (const model of modelPreference) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.15,
              responseMimeType: 'application/json'
            }
          })
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
        }
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const clean = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        return { parsed: JSON.parse(clean), model };
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 1200 * attempt));
      }
    }
  }
  throw lastErr || new Error('Gemini call failed');
}

function addBidirectionalLateralLink(clA, clB, howItConnects) {
  if (!clA || !clB || clA.id === clB.id || !howItConnects) return false;
  let added = false;
  if (!Array.isArray(clA.lateralConnections)) clA.lateralConnections = [];
  if (!Array.isArray(clB.lateralConnections)) clB.lateralConnections = [];

  if (!clA.lateralConnections.some(l => l.clusterId === clB.id)) {
    clA.lateralConnections.push({
      clusterId: clB.id,
      headline: clB.story,
      howItConnects
    });
    added = true;
  }
  if (!clB.lateralConnections.some(l => l.clusterId === clA.id)) {
    clB.lateralConnections.push({
      clusterId: clA.id,
      headline: clA.story,
      howItConnects
    });
    added = true;
  }
  return added;
}

// Distinguish between true same-incident duplicate/continuation merges vs separate causal stations
function shouldMergeEvolutionChain(ev, anc, suc) {
  if (!anc || !suc || anc.id === suc.id) return false;
  if ((ev.confidence || 0) < 0.96) return false;
  const bothNamedStorms = /\bstorm\s+[a-z]+\b/i.test(anc.story) && /\bstorm\s+[a-z]+\b/i.test(suc.story);
  if (bothNamedStorms) return false;
  const isGlobalPriceIndex = /\b(oil prices surge|stocks enter bear market)\b/i.test(suc.story) && !/\b(oil prices|stocks)\b/i.test(anc.story);
  if (isGlobalPriceIndex) return false;
  // Exclude broad country/demonym words when checking specific shared subject stems so separate incidents in the same country link via lateralConnections instead of merging
  const BROAD_ACTOR_WORDS = new Set([
    'france', 'french', 'saudi', 'arabia', 'australian', 'australia', 'ukraine', 'ukrainian',
    'russia', 'russian', 'trump', 'biden', 'israel', 'israeli', 'china', 'chinese', 'britain', 'british',
    'attack', 'protest', 'protests', 'threat', 'threats', 'arrested', 'charged'
  ]);
  const ancWords = new Set(String(anc.story || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !BROAD_ACTOR_WORDS.has(w)));
  const sucWords = new Set(String(suc.story || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !BROAD_ACTOR_WORDS.has(w)));
  let sharedSpecific = 0;
  ancWords.forEach(w => { if (sucWords.has(w)) sharedSpecific++; });
  return sharedSpecific >= 2;
}

function mergeSuccessorIntoAncestor(anc, suc, ev) {
  // Keep the higher-outlet cluster's canonical ID as the primary anchor so URLs and caches stay stable,
  // while absorbing the follow-up's coverage, evolution chapter, and evolvedFromIds!
  const primary = (anc.outletCount || 2) >= (suc.outletCount || 2) ? anc : suc;
  const secondary = primary === anc ? suc : anc;

  const evolvedSet = new Set([
    ...(Array.isArray(primary.evolvedFromIds) ? primary.evolvedFromIds : []),
    ...(Array.isArray(secondary.evolvedFromIds) ? secondary.evolvedFromIds : []),
    secondary.id
  ]);
  evolvedSet.delete(primary.id);
  primary.evolvedFromIds = Array.from(evolvedSet);

  // Merge coverage (1 best/newest dispatch per outlet)
  const covMap = new Map();
  for (const art of [...(suc.coverage || []), ...(anc.coverage || [])]) {
    if (!art || !art.sourceId) continue;
    const ex = covMap.get(art.sourceId);
    if (!ex || new Date(art.pubDate || 0) > new Date(ex.pubDate || 0)) {
      covMap.set(art.sourceId, art);
    }
  }
  primary.coverage = Array.from(covMap.values()).sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  primary.outletCount = primary.coverage.length;

  // Append evolution chapter if not already recorded
  if (!Array.isArray(primary.evolutionHistory) || primary.evolutionHistory.length === 0) {
    primary.evolutionHistory = [{
      version: 1,
      type: 'initial',
      timestamp: anc.firstSeenAt || anc.latestUpdateAt || new Date().toISOString(),
      headline: anc.story,
      summary: anc.summary || '',
      outletCount: anc.outletCount || 2,
      note: 'Initial cluster formation on the wire'
    }];
  }
  const alreadyHasSucChapter = primary.evolutionHistory.some(h => h.headline === suc.story);
  if (!alreadyHasSucChapter) {
    const nextVer = (primary.version || primary.evolutionHistory.length || 1) + 1;
    const sucTs = suc.firstSeenAt || suc.latestUpdateAt || new Date().toISOString();
    primary.version = nextVer;
    primary.lastDevelopedAt = sucTs;
    primary.latestUpdateAt = suc.latestUpdateAt || sucTs;
    primary.developmentNote = suc.summary || ev.rationale;
    primary.evolutionHistory.push({
      version: nextVer,
      type: 'material_shift',
      timestamp: sucTs,
      headline: suc.story,
      summary: suc.summary || '',
      outletCount: primary.outletCount,
      note: suc.summary || ev.rationale
    });
  }

  // Merge lateral connections
  const seenLat = new Set((primary.lateralConnections || []).map(l => l.clusterId));
  if (!Array.isArray(primary.lateralConnections)) primary.lateralConnections = [];
  for (const lc of (secondary.lateralConnections || [])) {
    if (lc?.clusterId && lc.clusterId !== primary.id && !seenLat.has(lc.clusterId)) {
      seenLat.add(lc.clusterId);
      primary.lateralConnections.push(lc);
    }
  }

  return { keptId: primary.id, absorbedId: secondary.id };
}

async function main() {
  const fromJsonIdx = process.argv.indexOf('--from-json');
  const fromJsonPath = fromJsonIdx !== -1 ? process.argv[fromJsonIdx + 1] : null;

  const rawArch = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
  const archClusters = Array.isArray(rawArch) ? rawArch : (rawArch.clusters || []);
  const vibeData = JSON.parse(fs.readFileSync(VIBE_DATA_FILE, 'utf8'));
  const liveClusters = Array.isArray(vibeData.sharedStoryClusters) ? vibeData.sharedStoryClusters : [];

  let auditData = null;

  if (fromJsonPath && fs.existsSync(fromJsonPath)) {
    console.log(`[Realign] Loading pre-computed cross-archive audit from ${fromJsonPath}...`);
    auditData = JSON.parse(fs.readFileSync(fromJsonPath, 'utf8'));
  } else {
    const apiKey = process.env.GEMINI_PAID_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Missing GEMINI_API_KEY');
      process.exit(1);
    }

    const TRIVIA_RE = /\b(champions league|premier league|nfl|nba|mlb|nhl|touchdown|quarterback|goalscorer|box office|red carpet|celebrity|horoscope|wordle)\b/i;
    const substantiveClusters = archClusters.filter(c => {
      if (/^(sports|entertainment)$/i.test(c.topic || '') && (c.outletCount || 0) < 8) return false;
      if (TRIVIA_RE.test(c.story || '') && (c.outletCount || 0) < 10) return false;
      return true;
    });

    const siloBuckets = new Map(SILO_DEFS.map(s => [s.id, []]));
    for (const c of substantiveClusters) {
      const text = `${c.story || ''} ${c.summary || ''} ${(c.coverage || []).slice(0, 3).map(a => a.title || '').join(' ')}`;
      const matched = [];
      for (const s of SILO_DEFS) {
        if (s.re.test(text)) matched.push(s.id);
      }
      if (matched.length === 0) {
        if (c.topic === 'business' || c.topic === 'technology') matched.push('ai-tech-space-corporate');
        else if (c.topic === 'climate' || c.topic === 'science' || c.topic === 'health') matched.push('climate-energy-health-science');
        else if (c.topic === 'politics') matched.push('us-domestic-institutions');
        else matched.push('europe-unrest-governance');
      }
      for (const sId of matched.slice(0, 3)) {
        siloBuckets.get(sId).push(c);
      }
    }

    for (const s of SILO_DEFS) {
      const list = siloBuckets.get(s.id);
      list.sort((a, b) => ((b.outletCount || 2) + (b.version || 1) * 2) - ((a.outletCount || 2) + (a.version || 1) * 2));
      const capped = list.slice(0, 75).sort((a, b) => new Date(a.firstSeenAt || a.latestUpdateAt || 0) - new Date(b.firstSeenAt || b.latestUpdateAt || 0));
      siloBuckets.set(s.id, capped);
    }

    const siloResults = [];
    for (let i = 0; i < SILO_DEFS.length; i += 4) {
      const batch = SILO_DEFS.slice(i, i + 4);
      const res = await Promise.all(batch.map(async (siloDef) => {
        const list = siloBuckets.get(siloDef.id);
        const codeToCluster = new Map();
        const lines = list.map((c, idx) => {
          const code = `S${idx + 1}`;
          codeToCluster.set(code, c);
          const firstDate = (c.firstSeenAt || c.latestUpdateAt || '').slice(0, 10);
          const lastDate = (c.latestUpdateAt || c.firstSeenAt || '').slice(0, 10);
          const dateStr = firstDate === lastDate ? firstDate : `${firstDate}->${lastDate}`;
          const existingLat = (c.lateralConnections || []).length;
          const sampleCov = (c.coverage || []).slice(0, 2).map(a => `"${a.title}"`).join(' ; ');
          return `[${code}] (${dateStr} · ${c.outletCount || 2} outlets · v${c.version || 1} · curLat:${existingLat}) id="${c.id}" | "${c.story}" — ${c.summary || ''} [Sample Headlines: ${sampleCov}]`;
        }).join('\n');

        const prompt = `You are the Senior Archival Intelligence Editor for ISOBAR & Vibe-O-Meter.
We are conducting a Cross-Archive Re-Indexing inside the macro silo: "${siloDef.name}".
Below are ${list.length} news clusters ordered chronologically.

Identify:
1. "missedEvolutionChains": Pairs where [S_old] and [S_new] represent the exact same ongoing crisis, policy battle, investigation, or military/civil flashpoint entering a new chronological chapter days later (or a duplicate split). Do NOT merge separate events in the same country; put separate interacting events in "newLateralLinks".
2. "newLateralLinks": Up to 18 high-value causal or thematic connections between DISTINCT clusters [S_a] and [S_b] in this silo—especially connecting unlinked clusters (curLat:0) to downstream developments.

CLUSTERS IN SILO (${siloDef.name}):
${lines}

Return ONLY valid JSON:
{
  "missedEvolutionChains": [
    {
      "ancestorCode": "S3",
      "successorCode": "S19",
      "relationshipType": "direct_continuation" | "duplicate_split",
      "confidence": 0.95,
      "rationale": "1 crisp sentence explaining why S19 is the direct chronological continuation of S3."
    }
  ],
  "newLateralLinks": [
    {
      "fromCode": "S2",
      "toCode": "S24",
      "connectionType": "Causal Trigger | Cross-Border Contagion | Policy Fallout | Retaliation | Shared Theater",
      "causalMechanism": "1 crisp sentence (12-22 words) explaining the exact causal or structural link between these two clusters."
    }
  ]
}`;
        const { parsed } = await callGeminiJson(prompt, apiKey);
        const evolutions = (parsed.missedEvolutionChains || []).map(e => {
          const anc = codeToCluster.get(String(e.ancestorCode || '').replace(/[\[\]\s]/g, ''));
          const suc = codeToCluster.get(String(e.successorCode || '').replace(/[\[\]\s]/g, ''));
          if (!anc || !suc || anc.id === suc.id) return null;
          return {
            ancestorId: anc.id,
            ancestorStory: anc.story,
            successorId: suc.id,
            successorStory: suc.story,
            relationshipType: e.relationshipType,
            confidence: e.confidence,
            rationale: e.rationale
          };
        }).filter(Boolean);

        const links = (parsed.newLateralLinks || []).map(l => {
          const fromCl = codeToCluster.get(String(l.fromCode || '').replace(/[\[\]\s]/g, ''));
          const toCl = codeToCluster.get(String(l.toCode || '').replace(/[\[\]\s]/g, ''));
          if (!fromCl || !toCl || fromCl.id === toCl.id) return null;
          return {
            fromId: fromCl.id,
            toId: toCl.id,
            connectionType: l.connectionType,
            causalMechanism: l.causalMechanism
          };
        }).filter(Boolean);

        return { evolutions, links };
      }));
      siloResults.push(...res);
    }

    auditData = {
      missedEvolutionChains: siloResults.flatMap(s => s.evolutions),
      netNewLateralLinks: siloResults.flatMap(s => s.links)
    };
  }

  const archById = new Map(archClusters.map(c => [c.id, c]));
  const liveById = new Map(liveClusters.map(c => [c.id, c]));

  let lateralAddedCount = 0;
  let mergedChainsCount = 0;
  const absorbedIds = new Set();

  // 1. Apply net-new lateral connections across both archive and live clusters
  for (const lk of (auditData.netNewLateralLinks || [])) {
    const aArch = archById.get(lk.fromId);
    const bArch = archById.get(lk.toId);
    if (aArch && bArch) {
      if (addBidirectionalLateralLink(aArch, bArch, lk.causalMechanism)) {
        lateralAddedCount++;
      }
    }
    const aLive = liveById.get(lk.fromId);
    const bLive = liveById.get(lk.toId);
    if (aLive && bLive) {
      addBidirectionalLateralLink(aLive, bLive, lk.causalMechanism);
    }
  }

  // 2. Apply missed evolution chains (either merge or convert to strong lateral link)
  for (const ev of (auditData.missedEvolutionChains || [])) {
    const ancArch = archById.get(ev.ancestorId);
    const sucArch = archById.get(ev.successorId);
    if (!ancArch || !sucArch || absorbedIds.has(ancArch.id) || absorbedIds.has(sucArch.id)) continue;

    if (shouldMergeEvolutionChain(ev, ancArch, sucArch)) {
      const { absorbedId } = mergeSuccessorIntoAncestor(ancArch, sucArch, ev);
      absorbedIds.add(absorbedId);
      mergedChainsCount++;

      const ancLive = liveById.get(ev.ancestorId);
      const sucLive = liveById.get(ev.successorId);
      if (ancLive && sucLive) {
        mergeSuccessorIntoAncestor(ancLive, sucLive, ev);
      }
    } else {
      // Keep both stations distinct on the Constellation spine and link them causally
      if (addBidirectionalLateralLink(ancArch, sucArch, ev.rationale)) {
        lateralAddedCount++;
      }
      const ancLive = liveById.get(ev.ancestorId);
      const sucLive = liveById.get(ev.successorId);
      if (ancLive && sucLive) {
        addBidirectionalLateralLink(ancLive, sucLive, ev.rationale);
      }
    }
  }

  // Filter out absorbed clusters
  const finalArch = archClusters.filter(c => !absorbedIds.has(c.id));
  const finalLive = liveClusters.filter(c => !absorbedIds.has(c.id));

  vibeData.sharedStoryClusters = finalLive;
  fs.writeFileSync(VIBE_DATA_FILE, JSON.stringify(vibeData, null, 2), 'utf8');

  const updatedArchPayload = {
    dataset: 'vibe-o-meter/clusters-archive',
    lastUpdated: new Date().toISOString(),
    count: finalArch.length,
    clusters: finalArch
  };
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(updatedArchPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'clusters-archive.json'), JSON.stringify(updatedArchPayload), 'utf8');

  // Re-export static feeds so clusters.json and clusters-archive.json are fully synchronized
  const { exportPublicJsonFeeds } = require('./export-feeds');
  exportPublicJsonFeeds(vibeData);
  fs.writeFileSync(VIBE_DATA_FILE, JSON.stringify(vibeData, null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'data.json'), JSON.stringify(vibeData), 'utf8');

  console.log(`[Realign] Complete: merged ${mergedChainsCount} multi-day evolution chains, added ${lateralAddedCount} bidirectional cross-archive lateral connections.`);
}

main().catch(err => {
  console.error('[Realign] Fatal error:', err);
  process.exit(1);
});

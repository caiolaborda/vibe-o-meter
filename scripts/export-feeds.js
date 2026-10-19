const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'vibe-data.json');
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');

const OUTLET_REGION_MAP = {
  bbc: 'UK', guardian: 'UK', skynews: 'UK', ft: 'UK', independent: 'UK', telegraph: 'UK',
  nyt: 'NA', cnn: 'NA', fox: 'NA', npr: 'NA', cnbc: 'NA', wsj: 'NA', politico: 'NA', cbc: 'NA', globalnews: 'NA', latimes: 'NA', wapo: 'NA', nbc: 'NA', pbs: 'NA', ars: 'NA', globeandmail: 'NA',
  folha: 'LATAM', batimes: 'LATAM', mexiconews: 'LATAM', mercopress: 'LATAM', agenciabrasil: 'LATAM',
  spiegel: 'EU', dw: 'EU', france24: 'EU', euronews: 'EU', politicoeu: 'EU', lemonde: 'EU', elpais: 'EU', rte: 'EU', irishtimes: 'EU', swissinfo: 'EU',
  aljazeera: 'ME', thenational: 'ME', africanews: 'ME',
  scmp: 'APAC', abcau: 'APAC', smh: 'APAC', japantimes: 'APAC', CNA: 'APAC', cna: 'APAC', koreaherald: 'APAC',
  reuters: 'GLOBAL', ap: 'GLOBAL', bloomberg: 'GLOBAL', newscientist: 'GLOBAL', arstechnica: 'GLOBAL', nature: 'GLOBAL', UN: 'GLOBAL'
};

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'oc', 'ved', 'usg'].forEach(p => u.searchParams.delete(p));
    let clean = u.origin + u.pathname;
    const s = u.searchParams.toString();
    if (s) clean += '?' + s;
    return clean.replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return String(url).split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function cleanHeadlineTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/<[^>]*>/g, '')
    .replace(/\s*[-–—|]\s*(reuters|bbc|cnn|fox news|the guardian|ap news|associated press|bloomberg|nyt|new york times|al jazeera|npr|cnbc|sky news|spiegel|dw|france 24|politico|wsj).*$/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isValidImage(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  const u = url.toLowerCase();
  return !(
    u.includes('googleusercontent.com') ||
    u.includes('news.google.com') ||
    u.includes('gstatic.com') ||
    u.includes('bbc_news_logo') ||
    u.includes('default-share') ||
    u.includes('feedburner') ||
    u.includes('beacon') ||
    u.includes('1x1') ||
    u.includes('pixel') ||
    u.includes('favicon')
  );
}

function inferClusterTopic(cluster, sources) {
  const categoryCounts = {};
  for (const cov of (cluster.coverage || [])) {
    let cat = cov.category;
    const src = sources && sources[cov.sourceId];
    if (src && Array.isArray(src.articles)) {
      const m = src.articles.find(a =>
        (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
        (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
      );
      if (m && m.category) cat = m.category;
    }
    if (cat && cat !== 'other') {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }
  const sortedCats = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  if (sortedCats.length > 0) {
    return sortedCats[0][0];
  }
  if (cluster.topic && cluster.topic !== 'other') return cluster.topic;
  const s = `${cluster.story || ''} ${cluster.summary || ''}`.toLowerCase();
  if (/\b(election|parliament|senate|congress|trump|biden|minister|policy|vote|court)\b/.test(s)) return 'politics';
  if (/\b(war|drones?|missile|strikes?|bombing|military|troops|ceasefire|ukraine|russia|gaza|israel|lebanon|iran|houthi)\b/.test(s)) return 'world';
  if (/\b(market|bank|economy|inflation|stock|earnings|trade|tariff|oil|qatar|energy)\b/.test(s)) return 'business';
  if (/\b(ai|cyber|software|tech|starlink|satellite|chip|apple|google|microsoft)\b/.test(s)) return 'technology';
  if (/\b(space|mars|nasa|neanderthal|archaeolog|shipwreck|physics|scientist|fossil|species)\b/.test(s)) return 'science';
  if (/\b(climate|deforestation|amazon|emissions|warming|wildfire|conservation|coral|renewable)\b/.test(s)) return 'climate';
  if (/\b(cancer|vaccine|hospital|health|medical|disease|patient|drug|clinical)\b/.test(s)) return 'health';
  if (/\b(film|movie|music|festival|actor|art|museum|book|theatre)\b/.test(s)) return 'entertainment';
  if (/\b(olympic|football|soccer|tennis|championship|tournament|league|cup|coach)\b/.test(s)) return 'sports';
  return 'world';
}

function deduplicateAndSanitizeClusters(rawClusters) {
  if (!Array.isArray(rawClusters) || rawClusters.length === 0) return [];
  const slugify = (s) => String(s || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // 1. Deduplicate clusters sharing the exact same ID (e.g. if a git merge spliced two arrays)
  const byId = new Map();
  for (const cl of rawClusters) {
    if (!cl || !Array.isArray(cl.coverage) || cl.coverage.length < 2) continue;
    const id = cl.id || slugify(cl.story);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...cl, id });
    } else {
      const vCurr = typeof cl.version === 'number' ? cl.version : 1;
      const vExist = typeof existing.version === 'number' ? existing.version : 1;
      const ocCurr = cl.coverage.length || cl.outletCount || 0;
      const ocExist = existing.coverage.length || existing.outletCount || 0;
      const primary = (vCurr > vExist || (vCurr === vExist && ocCurr > ocExist)) ? cl : existing;
      const secondary = primary === cl ? existing : cl;

      const seenOutlets = new Set();
      const mergedCov = [];
      for (const art of [...(primary.coverage || []), ...(secondary.coverage || [])]) {
        if (!art?.sourceId || seenOutlets.has(art.sourceId)) continue;
        seenOutlets.add(art.sourceId);
        mergedCov.push(art);
      }
      mergedCov.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

      const evolvedSet = new Set([
        ...(Array.isArray(primary.evolvedFromIds) ? primary.evolvedFromIds : []),
        ...(Array.isArray(secondary.evolvedFromIds) ? secondary.evolvedFromIds : [])
      ]);
      evolvedSet.delete(id);

      byId.set(id, {
        ...primary,
        id,
        coverage: mergedCov,
        outletCount: mergedCov.length,
        ...(evolvedSet.size > 0 ? { evolvedFromIds: Array.from(evolvedSet) } : {})
      });
    }
  }

  // 2. Suppress any ancestor cluster whose ID is listed in another active cluster's evolvedFromIds
  const supersededToSuccessor = new Map();
  for (const [id, cl] of byId.entries()) {
    if (Array.isArray(cl.evolvedFromIds)) {
      for (const oldId of cl.evolvedFromIds) {
        if (oldId && oldId !== id && byId.has(oldId)) {
          supersededToSuccessor.set(oldId, id);
        }
      }
    }
  }
  for (const [oldId, succId] of supersededToSuccessor.entries()) {
    const oldCl = byId.get(oldId);
    const succCl = byId.get(succId);
    if (oldCl && succCl) {
      const seenOutlets = new Set((succCl.coverage || []).map(a => a.sourceId));
      for (const art of (oldCl.coverage || [])) {
        if (art?.sourceId && !seenOutlets.has(art.sourceId)) {
          seenOutlets.add(art.sourceId);
          succCl.coverage.push(art);
        }
      }
      succCl.coverage.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
      succCl.outletCount = succCl.coverage.length;
      byId.delete(oldId);
    }
  }

  // 3. Deduplicate same-timestamp or paraphrased evolutionHistory entries
  const result = [];
  for (const cl of byId.values()) {
    if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 1) {
      const cleanHist = [];
      for (const h of cl.evolutionHistory) {
        if (!h) continue;
        const dupIdx = cleanHist.findIndex((prev, idx) => {
          if (idx === 0 && h.type !== 'initial') return false;
          if (prev.timestamp && h.timestamp && prev.timestamp === h.timestamp) return true;
          if (prev.note && h.note && prev.note.toLowerCase() === h.note.toLowerCase()) return true;
          return false;
        });
        if (dupIdx === -1) {
          cleanHist.push(h);
        } else if (h.type === 'material_shift' && cleanHist[dupIdx].type === 'clarification') {
          cleanHist[dupIdx] = h;
        }
      }
      cl.evolutionHistory = cleanHist;
    }
    result.push(cl);
  }
  return result;
}

function exportPublicJsonFeeds(fullPayload) {
  if (!fs.existsSync(PUBLIC_DATA_DIR)) {
    fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  }

  const nowIso = fullPayload.lastUpdated || new Date().toISOString();
  const nowMs = Date.now();
  const cutoff24h = nowMs - 24 * 3600 * 1000;
  const cutoff7d = nowMs - 7 * 24 * 3600 * 1000;
  const sources = fullPayload.sources || {};

  // 1. Enrich & Export Story Clusters -> public/data/clusters.json
  const rawClusters = deduplicateAndSanitizeClusters(
    fullPayload.sharedStoryClusters || fullPayload.globalStats?.sharedStoryClusters || []
  );
  const enrichedClusters = rawClusters.map(cl => {
    const topic = inferClusterTopic(cl, sources);
    const timestamps = [];
    const enrichedCov = (cl.coverage || []).map(cov => {
      const src = sources[cov.sourceId];
      let match = null;
      if (src && Array.isArray(src.articles)) {
        match = src.articles.find(a =>
          (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
          (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
        );
      }
      const pubDate = (match && match.pubDate) || cov.pubDate || null;
      if (pubDate) {
        const t = new Date(pubDate).getTime();
        if (!isNaN(t)) timestamps.push(t);
      }
      const sentiment = (match && typeof match.sentiment === 'number') ? match.sentiment : cov.sentiment;
      const eventBase = (match && typeof match.eventBase === 'number') ? match.eventBase : null;
      const framingMod = (match && typeof match.framingMod === 'number') ? match.framingMod : null;
      const factors = (match && Array.isArray(match.factors)) ? match.factors : null;
      const explanation = (match && (match.explanation || match.explanationGemini)) || cov.explanation || '';
      const imageUrl = (match && isValidImage(match.imageUrl)) ? match.imageUrl : (isValidImage(cov.imageUrl) ? cov.imageUrl : null);
      const description = (match && match.description) || cov.description || '';
      const category = (match && match.category) || topic;

      return {
        sourceId: cov.sourceId,
        sourceName: cov.sourceName || src?.name || cov.sourceId,
        region: OUTLET_REGION_MAP[cov.sourceId] || 'GLOBAL',
        title: cov.title,
        description,
        sentiment: typeof sentiment === 'number' ? Number(sentiment.toFixed(3)) : 0,
        ...(eventBase !== null ? { eventBase } : {}),
        ...(framingMod !== null ? { framingMod } : {}),
        ...(factors ? { factors } : {}),
        ...(explanation ? { explanation } : {}),
        category,
        imageUrl,
        link: cov.link,
        pubDate
      };
    });

    timestamps.sort((a, b) => a - b);
    const scores = enrichedCov.map(c => c.sentiment).filter(s => typeof s === 'number');
    const avgSent = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : (cl.averageSentiment || 0);
    const spread = scores.length > 1 ? Number((Math.max(...scores) - Math.min(...scores)).toFixed(2)) : (typeof cl.sentimentSpread === 'number' ? cl.sentimentSpread : 0);
    const eventBases = enrichedCov.map(c => c.eventBase).filter(eb => typeof eb === 'number');
    const avgEventBase = eventBases.length > 0 ? Number((eventBases.reduce((a, b) => a + b, 0) / eventBases.length).toFixed(3)) : avgSent;
    const validFactors = enrichedCov.map(c => c.factors).filter(f => Array.isArray(f) && f.length === 4);
    const clusterFactors = validFactors.length > 0
      ? [0, 1, 2, 3].map(i => Math.round(validFactors.reduce((sum, f) => sum + Number(f[i] || 0), 0) / validFactors.length))
      : null;
    const bestImg = enrichedCov.find(c => isValidImage(c.imageUrl))?.imageUrl || null;
    const slug = cl.id || String(cl.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const outletCount = enrichedCov.length;
    const sign = avgSent >= 0 ? 1 : -1;
    const consensusBoost = outletCount > 1 ? sign * Math.min(0.25, 0.075 * Math.log2(outletCount)) : 0;
    const significanceScore = Number(Math.max(-1, Math.min(1, avgSent + consensusBoost)).toFixed(3));
    const evolvedFromIds = Array.isArray(cl.evolvedFromIds) && cl.evolvedFromIds.length > 0
      ? cl.evolvedFromIds
      : undefined;
    const version = typeof cl.version === 'number' ? cl.version : 1;
    const lastDevelopedAt = cl.lastDevelopedAt || undefined;
    const developmentNote = cl.developmentNote || undefined;
    const evolutionHistory = Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 0
      ? cl.evolutionHistory
      : undefined;
    const lateralConnections = Array.isArray(cl.lateralConnections) && cl.lateralConnections.length > 0
      ? cl.lateralConnections
      : undefined;

    // Persist enriched fields back onto raw cluster in memory so data.json / summary.json also benefit
    cl.id = slug;
    cl.topic = topic;
    cl.version = version;
    cl.averageSentiment = avgSent;
    cl.significanceScore = significanceScore;
    cl.sentimentSpread = spread;
    if (bestImg) cl.imageUrl = bestImg;
    cl.coverage = enrichedCov;

    return {
      id: slug,
      story: cl.story,
      summary: cl.summary || '',
      version,
      ...(lastDevelopedAt ? { lastDevelopedAt } : {}),
      ...(developmentNote ? { developmentNote } : {}),
      ...(evolvedFromIds ? { evolvedFromIds } : {}),
      ...(evolutionHistory ? { evolutionHistory } : {}),
      ...(lateralConnections ? { lateralConnections } : {}),
      topic,
      imageUrl: bestImg,
      averageSentiment: avgSent,
      eventBase: avgEventBase,
      significanceScore,
      ...(clusterFactors ? { factors: clusterFactors } : {}),
      sentimentSpread: spread,
      outletCount,
      firstSeenAt: timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null,
      latestUpdateAt: timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
      coverage: enrichedCov
    };
  });

  const clustersPayload = {
    dataset: 'vibe-o-meter/clusters',
    lastUpdated: nowIso,
    lastClusteredAt: fullPayload.lastClusteredAt || nowIso,
    count: enrichedClusters.length,
    clusters: enrichedClusters
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'clusters.json'), JSON.stringify(clustersPayload, null, 2), 'utf8');

  // 1b. Maintain Permanent Historical Cluster Archive -> data/clusters-archive.json & public/data/clusters-archive.json
  const dataArchivePath = path.join(__dirname, '..', 'data', 'clusters-archive.json');
  const publicArchivePath = path.join(PUBLIC_DATA_DIR, 'clusters-archive.json');
  const archiveMap = new Map();
  try {
    const existingSource = fs.existsSync(dataArchivePath)
      ? dataArchivePath
      : (fs.existsSync(publicArchivePath) ? publicArchivePath : null);
    if (existingSource) {
      const rawArch = JSON.parse(fs.readFileSync(existingSource, 'utf8'));
      const list = Array.isArray(rawArch) ? rawArch : (Array.isArray(rawArch?.clusters) ? rawArch.clusters : []);
      for (const item of list) {
        if (item && item.id && Array.isArray(item.coverage) && item.coverage.length >= 2) {
          archiveMap.set(item.id, item);
        }
      }
    }
  } catch (archReadErr) {
    console.warn('[Export] Could not read existing clusters-archive.json:', archReadErr.message);
  }

  // Upsert current enrichedClusters into archiveMap and remove any superseded evolvedFromIds slugs
  for (const cl of enrichedClusters) {
    if (!cl || !cl.id || !Array.isArray(cl.coverage) || cl.coverage.length < 2) continue;
    if (Array.isArray(cl.evolvedFromIds)) {
      cl.evolvedFromIds.forEach(oldId => {
        if (oldId && oldId !== cl.id) archiveMap.delete(oldId);
      });
    }
    // Keep lightweight coverage entries in the long-term archive so 30d/All timelines & Isobar longitudinal lookups stay fast
    archiveMap.set(cl.id, {
      id: cl.id,
      story: cl.story,
      summary: cl.summary || '',
      version: cl.version || 1,
      ...(cl.lastDevelopedAt ? { lastDevelopedAt: cl.lastDevelopedAt } : {}),
      ...(cl.developmentNote ? { developmentNote: cl.developmentNote } : {}),
      ...(cl.evolvedFromIds ? { evolvedFromIds: cl.evolvedFromIds } : {}),
      ...(cl.evolutionHistory ? { evolutionHistory: cl.evolutionHistory } : {}),
      ...(cl.lateralConnections ? { lateralConnections: cl.lateralConnections } : {}),
      topic: cl.topic || 'world',
      imageUrl: cl.imageUrl || null,
      averageSentiment: cl.averageSentiment,
      eventBase: cl.eventBase,
      significanceScore: cl.significanceScore,
      sentimentSpread: cl.sentimentSpread,
      outletCount: cl.outletCount,
      firstSeenAt: cl.firstSeenAt,
      latestUpdateAt: cl.latestUpdateAt,
      coverage: (cl.coverage || []).map(c => ({
        sourceId: c.sourceId,
        sourceName: c.sourceName,
        region: c.region,
        title: c.title,
        sentiment: c.sentiment,
        category: c.category,
        link: c.link,
        pubDate: c.pubDate
      }))
    });
  }

  const archivedClustersList = Array.from(archiveMap.values())
    .sort((a, b) => new Date(b.latestUpdateAt || b.firstSeenAt || 0) - new Date(a.latestUpdateAt || a.firstSeenAt || 0))
    .slice(0, 2500);

  const archivePayload = {
    dataset: 'vibe-o-meter/clusters-archive',
    lastUpdated: nowIso,
    count: archivedClustersList.length,
    clusters: archivedClustersList
  };
  try {
    fs.writeFileSync(dataArchivePath, JSON.stringify(archivePayload, null, 2), 'utf8');
    fs.writeFileSync(publicArchivePath, JSON.stringify(archivePayload), 'utf8');
  } catch (archWriteErr) {
    console.warn('[Export] Could not write clusters-archive.json:', archWriteErr.message);
  }

  // 2. Build & Export Rescued Constructive News -> public/data/good-news.json
  const cutoff48h = nowMs - 48 * 3600 * 1000;
  const seenGoodUrls = new Set();
  const seenGoodTitles = new Set();
  const goodStories7d = [];

  // Map article links/titles/tokens to their parent cluster for multi-outlet consensus boost & deduplication
  function tokenizeHeadline(str) {
    const stop = new Set(['the','and','for','with','from','that','this','into','over','after','under','amid','says','said','new','how','why','what','who','its','his','her','are','was','were','has','have','had','will','can','may','out','off','set','gets','wins','hits','back','more','first','days','year','years']);
    return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !stop.has(w));
  }
  const articleClusterMap = new Map();
  const clusterTokenEntries = [];
  enrichedClusters.forEach(cl => {
    if (cl.averageSentiment < 0.10) return;
    const titleTokens = new Set(tokenizeHeadline(cl.story));
    const allTokens = new Set(tokenizeHeadline(`${cl.story || ''} ${(cl.coverage || []).map(c => c.title || '').join(' ')}`));
    clusterTokenEntries.push({ cl, titleTokens, allTokens });
    (cl.coverage || []).forEach(cov => {
      const u = canonicalUrl(cov.link);
      const t = cleanHeadlineTitle(cov.title);
      if (u) articleClusterMap.set(u, cl);
      if (t) articleClusterMap.set(t, cl);
    });
  });

  function findClusterForArticle(art, cUrl, cTitle) {
    const exact = (cUrl && articleClusterMap.get(cUrl)) || (cTitle && articleClusterMap.get(cTitle));
    if (exact) return exact;
    const aTokens = tokenizeHeadline(art.title);
    if (aTokens.length < 2) return null;
    for (const entry of clusterTokenEntries) {
      const sharedTitle = aTokens.filter(t => entry.titleTokens.has(t)).length;
      const sharedAll = aTokens.filter(t => entry.allTokens.has(t)).length;
      if ((sharedTitle >= 2 && sharedAll >= 3) || (sharedAll >= 4 && sharedAll / aTokens.length >= 0.55)) {
        return entry.cl;
      }
    }
    return null;
  }

  Object.entries(sources).forEach(([sourceId, src]) => {
    (src.articles || []).forEach(art => {
      const score = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentGemini ?? null);
      if (typeof score !== 'number' || score < 0.15) return;
      const pubMs = art.pubDate ? new Date(art.pubDate).getTime() : 0;
      if (!pubMs || pubMs < cutoff7d) return;

      const cUrl = canonicalUrl(art.link);
      const cTitle = cleanHeadlineTitle(art.title);
      if ((cUrl && seenGoodUrls.has(cUrl)) || (cTitle && seenGoodTitles.has(cTitle))) return;
      if (cUrl) seenGoodUrls.add(cUrl);
      if (cTitle) seenGoodTitles.add(cTitle);

      const matchedCl = findClusterForArticle(art, cUrl, cTitle);
      const outletCount = matchedCl ? matchedCl.outletCount : 1;
      const clusterBoost = outletCount > 1 ? Math.min(0.25, 0.075 * Math.log2(outletCount)) : 0;
      const significanceScore = Number(Math.min(1, score + clusterBoost).toFixed(3));

      goodStories7d.push({
        title: art.title,
        description: art.description || '',
        sentiment: Number(score.toFixed(3)),
        significanceScore,
        ...(Array.isArray(art.factors) ? { factors: art.factors } : {}),
        ...(matchedCl ? { clusterId: matchedCl.id, clusterStory: matchedCl.story, outletCount } : { outletCount: 1 }),
        explanation: art.explanation || art.explanationGemini || '',
        category: (art.category && art.category !== 'other') ? art.category : 'world',
        imageUrl: isValidImage(art.imageUrl) ? art.imageUrl : (matchedCl?.imageUrl || null),
        sourceId,
        sourceName: src.name || sourceId,
        region: OUTLET_REGION_MAP[sourceId] || 'GLOBAL',
        link: art.link,
        pubDate: art.pubDate,
        isPast24h: pubMs >= cutoff24h,
        isPast48h: pubMs >= cutoff48h
      });
    });
  });

  goodStories7d.sort((a, b) => (b.significanceScore - a.significanceScore) || (b.sentiment - a.sentiment));
  // Deduplicate by clusterId so a 21-outlet cluster appears once (represented by its highest-scoring dispatch)
  const seenClusters7d = new Set();
  const dedupedGood7d = goodStories7d.filter(s => {
    if (!s.clusterId) return true;
    if (seenClusters7d.has(s.clusterId)) return false;
    seenClusters7d.add(s.clusterId);
    return true;
  });
  const seenClusters24h = new Set();
  const goodStories24h = goodStories7d.filter(s => {
    if (!s.isPast24h) return false;
    if (!s.clusterId) return true;
    if (seenClusters24h.has(s.clusterId)) return false;
    seenClusters24h.add(s.clusterId);
    return true;
  });
  const constructiveClusters = enrichedClusters
    .filter(c => c.averageSentiment >= 0.10)
    .sort((a, b) => (b.significanceScore - a.significanceScore) || (b.averageSentiment - a.averageSentiment));

  // Build Top 5 Daily Antidote from 48h rolling window with gentle recency decay and cluster dedupe (no outlet cap)
  const seenClusters48h = new Set();
  const antidoteCandidates = goodStories7d
    .filter(s => s.isPast48h)
    .map(s => {
      const hoursAgo = Math.max(0, (nowMs - new Date(s.pubDate).getTime()) / 3600000);
      const decayRate = (s.outletCount || 1) > 1 ? 0.035 : 0.07;
      const recencyDecay = hoursAgo > 24 ? ((hoursAgo - 24) / 24) * decayRate : 0;
      return { ...s, antidoteRank: Number((s.significanceScore - recencyDecay).toFixed(3)) };
    })
    .sort((a, b) => b.antidoteRank - a.antidoteRank)
    .filter(s => {
      if (!s.clusterId) return true;
      if (seenClusters48h.has(s.clusterId)) return false;
      seenClusters48h.add(s.clusterId);
      return true;
    });

  const top5DailyAntidote = antidoteCandidates.slice(0, 5);

  const goodNewsPayload = {
    dataset: 'vibe-o-meter/good-news',
    lastUpdated: nowIso,
    count24h: goodStories24h.length,
    count7d: dedupedGood7d.length,
    constructiveClusterCount: constructiveClusters.length,
    top5DailyAntidote,
    constructiveClusters,
    stories24h: goodStories24h,
    stories7d: dedupedGood7d
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'good-news.json'), JSON.stringify(goodNewsPayload, null, 2), 'utf8');

  // 3. Build & Export Outlets Leaderboard & Topic Matrix -> public/data/outlets.json
  const outletsList = Object.entries(sources).map(([id, src]) => {
    const allArts = (src.articles || []).filter(a => typeof a.sentiment === 'number');
    const arts24h = allArts.filter(a => {
      const t = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      return t >= cutoff24h;
    });

    const avgAllTime = allArts.length > 0
      ? Number((allArts.reduce((s, a) => s + a.sentiment, 0) / allArts.length).toFixed(3))
      : null;
    const avg24h = arts24h.length > 0
      ? Number((arts24h.reduce((s, a) => s + a.sentiment, 0) / arts24h.length).toFixed(3))
      : null;

    let pos24 = 0, neu24 = 0, neg24 = 0;
    const topicSums = {};
    const topicCounts = {};

    arts24h.forEach(a => {
      if (a.sentiment >= 0.15) pos24++;
      else if (a.sentiment <= -0.15) neg24++;
      else neu24++;
      const cat = a.category || 'world';
      topicSums[cat] = (topicSums[cat] || 0) + a.sentiment;
      topicCounts[cat] = (topicCounts[cat] || 0) + 1;
    });

    const topicAverages24h = {};
    Object.keys(topicSums).forEach(cat => {
      topicAverages24h[cat] = {
        averageSentiment: Number((topicSums[cat] / topicCounts[cat]).toFixed(3)),
        articleCount: topicCounts[cat]
      };
    });

    return {
      id,
      name: src.name || id,
      region: OUTLET_REGION_MAP[id] || 'GLOBAL',
      averageSentiment24h: avg24h,
      averageSentimentAllTime: avgAllTime,
      deltaVsBaseline: (avg24h !== null && avgAllTime !== null) ? Number((avg24h - avgAllTime).toFixed(3)) : null,
      articleCount24h: arts24h.length,
      articleCountArchive: allArts.length,
      distribution24h: { positive: pos24, neutral: neu24, negative: neg24 },
      topicAverages24h
    };
  });

  outletsList.sort((a, b) => (a.averageSentiment24h ?? 999) - (b.averageSentiment24h ?? 999));

  const outletsPayload = {
    dataset: 'vibe-o-meter/outlets',
    lastUpdated: nowIso,
    globalSentiment: fullPayload.globalStats?.globalSentiment ?? null,
    editorialSummaryDate: fullPayload.editorialSummaryDate || null,
    editorialSummary: fullPayload.editorialSummary || '',
    categoryAverages: fullPayload.globalStats?.categoryAverages || {},
    outletCount: outletsList.length,
    outlets: outletsList
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'outlets.json'), JSON.stringify(outletsPayload, null, 2), 'utf8');

  // 4. Build & Export Historical Time-Series -> public/data/timeseries.json
  const timeSeriesPayload = {
    dataset: 'vibe-o-meter/timeseries',
    lastUpdated: nowIso,
    pointCount: (fullPayload.timeSeries || []).length,
    timeSeries: fullPayload.timeSeries || []
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'timeseries.json'), JSON.stringify(timeSeriesPayload, null, 2), 'utf8');

  // 5. Build & Export Self-Documenting API Index Manifest -> public/data/index.json
  const indexManifest = {
    project: 'No Good News / Some Good News — Global Media Sentiment & Story Cluster API',
    lastUpdated: nowIso,
    endpoints: {
      clusters: {
        path: 'data/clusters.json',
        description: 'Cross-outlet story clusters (rolling 7-day window across all sentiments) with neutral headlines, editorial summaries, single-word topic tags, lead images, valence spread, and per-outlet coverage links.',
        count: enrichedClusters.length
      },
      clustersArchive: {
        path: 'data/clusters-archive.json',
        description: 'Permanent long-term historical archive of deduplicated cross-outlet story clusters for 30d/All timeline overlays and longitudinal precedent lookups.',
        count: archivedClustersList.length
      },
      goodNews: {
        path: 'data/good-news.json',
        description: 'Rescued constructive breakthroughs (sentiment >= +0.15) including the Daily 5 Antidote, constructive multi-outlet clusters, and 24h/7d positive dispatches.',
        count24h: goodStories24h.length,
        count7d: goodStories7d.length
      },
      outlets: {
        path: 'data/outlets.json',
        description: '40-outlet global newsroom sentiment leaderboard, regional groupings, historical baselines, and topic × outlet sentiment matrix.',
        outletCount: outletsList.length
      },
      timeseries: {
        path: 'data/timeseries.json',
        description: 'Rolling historical sentiment trajectory snapshots across global and individual newsroom averages.',
        pointCount: (fullPayload.timeSeries || []).length
      },
      summary: {
        path: 'data/summary.json',
        description: 'Lightweight 24h/48h dashboard payload combining global stats, active story clusters, and recent outlet dispatches.'
      },
      fullArchive: {
        path: 'data/data.json',
        description: 'Complete multi-day archive of all analyzed articles across all 40 global newsrooms.'
      }
    }
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'index.json'), JSON.stringify(indexManifest, null, 2), 'utf8');

  const active48h = rawClusters.filter(cl => {
    const newestMs = Math.max(...(cl.coverage || []).map(c => new Date(c.pubDate).getTime() || 0), 0);
    return newestMs >= cutoff48h;
  });
  const activeClusters48h = active48h.length >= 12 ? active48h : rawClusters.slice(0, 24);

  return {
    enrichedClusters: rawClusters,
    activeClusters48h,
    clustersCount: enrichedClusters.length,
    archivedClustersCount: archivedClustersList.length,
    goodNews24hCount: goodStories24h.length,
    goodNews7dCount: goodStories7d.length,
    outletsCount: outletsList.length
  };
}

module.exports = { exportPublicJsonFeeds };

if (require.main === module) {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('data/vibe-data.json not found.');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const stats = exportPublicJsonFeeds(payload);
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'data.json'), JSON.stringify(payload), 'utf8');
  const summaryPath = path.join(PUBLIC_DATA_DIR, 'summary.json');
  if (fs.existsSync(summaryPath)) {
    const sumPayload = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    sumPayload.sharedStoryClusters = stats.activeClusters48h;
    if (sumPayload.globalStats) sumPayload.globalStats.sharedStoryClusters = stats.activeClusters48h;
    fs.writeFileSync(summaryPath, JSON.stringify(sumPayload), 'utf8');
  }
  console.log('✅ Exported public JSON feeds to public/data/:', {
    clustersCount: stats.clustersCount,
    archivedClustersCount: stats.archivedClustersCount,
    goodNews24hCount: stats.goodNews24hCount,
    goodNews7dCount: stats.goodNews7dCount,
    outletsCount: stats.outletsCount
  });
}

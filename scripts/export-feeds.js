const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'vibe-data.json');
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');

const OUTLET_REGION_MAP = {
  bbc: 'UK', guardian: 'UK', skynews: 'UK', ft: 'UK', independent: 'UK', telegraph: 'UK',
  nyt: 'NA', cnn: 'NA', fox: 'NA', npr: 'NA', cnbc: 'NA', wsj: 'NA', politico: 'NA', cbc: 'NA', latimes: 'NA', wapo: 'NA', nbc: 'NA', pbs: 'NA', ars: 'NA', globeandmail: 'NA',
  folha: 'LATAM', batimes: 'LATAM', mercopress: 'LATAM',
  spiegel: 'EU', dw: 'EU', france24: 'EU', euronews: 'EU', politicoeu: 'EU', lemonde: 'EU', elpais: 'EU', irishtimes: 'EU', swissinfo: 'EU',
  aljazeera: 'ME',
  scmp: 'APAC', abcau: 'APAC', smh: 'APAC', japantimes: 'APAC', CNA: 'APAC', cna: 'APAC', koreaherald: 'APAC',
  reuters: 'GLOBAL', ap: 'GLOBAL', bloomberg: 'GLOBAL', newscientist: 'GLOBAL', nature: 'GLOBAL', UN: 'GLOBAL'
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
  if (cluster.topic && cluster.topic !== 'other') return cluster.topic;
  for (const cov of (cluster.coverage || [])) {
    const src = sources && sources[cov.sourceId];
    if (src && Array.isArray(src.articles)) {
      const m = src.articles.find(a =>
        (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
        (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
      );
      if (m && m.category && m.category !== 'other') return m.category;
    }
  }
  const s = `${cluster.story || ''} ${cluster.summary || ''}`.toLowerCase();
  if (/\b(election|parliament|senate|congress|trump|biden|minister|policy|vote|court)\b/.test(s)) return 'politics';
  if (/\b(market|bank|economy|inflation|stock|earnings|trade|tariff|oil|qatar|energy)\b/.test(s)) return 'business';
  if (/\b(ai|cyber|software|tech|starlink|satellite|chip|apple|google|microsoft)\b/.test(s)) return 'technology';
  if (/\b(space|mars|nasa|neanderthal|archaeolog|shipwreck|physics|scientist|fossil|species)\b/.test(s)) return 'science';
  if (/\b(climate|deforestation|amazon|emissions|warming|wildfire|conservation|coral|renewable)\b/.test(s)) return 'climate';
  if (/\b(cancer|vaccine|hospital|health|medical|disease|patient|drug|clinical)\b/.test(s)) return 'health';
  if (/\b(film|movie|music|festival|actor|art|museum|book|theatre)\b/.test(s)) return 'entertainment';
  if (/\b(olympic|football|soccer|tennis|championship|tournament|league|cup|coach)\b/.test(s)) return 'sports';
  return 'world';
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
  const rawClusters = fullPayload.sharedStoryClusters || fullPayload.globalStats?.sharedStoryClusters || [];
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
    const slug = String(cl.story || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Persist enriched fields back onto raw cluster in memory so data.json / summary.json also benefit
    cl.topic = topic;
    cl.averageSentiment = avgSent;
    cl.sentimentSpread = spread;
    if (bestImg) cl.imageUrl = bestImg;
    cl.coverage = enrichedCov;

    return {
      id: slug,
      story: cl.story,
      summary: cl.summary || '',
      topic,
      imageUrl: bestImg,
      averageSentiment: avgSent,
      eventBase: avgEventBase,
      ...(clusterFactors ? { factors: clusterFactors } : {}),
      sentimentSpread: spread,
      outletCount: enrichedCov.length,
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

  // 2. Build & Export Rescued Constructive News -> public/data/good-news.json
  const seenGoodUrls = new Set();
  const seenGoodTitles = new Set();
  const goodStories7d = [];

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

      goodStories7d.push({
        title: art.title,
        description: art.description || '',
        sentiment: Number(score.toFixed(3)),
        explanation: art.explanation || art.explanationGemini || '',
        category: (art.category && art.category !== 'other') ? art.category : 'world',
        imageUrl: isValidImage(art.imageUrl) ? art.imageUrl : null,
        sourceId,
        sourceName: src.name || sourceId,
        region: OUTLET_REGION_MAP[sourceId] || 'GLOBAL',
        link: art.link,
        pubDate: art.pubDate,
        isPast24h: pubMs >= cutoff24h
      });
    });
  });

  goodStories7d.sort((a, b) => b.sentiment - a.sentiment);
  const goodStories24h = goodStories7d.filter(s => s.isPast24h);
  const constructiveClusters = enrichedClusters.filter(c => c.averageSentiment >= 0.10);

  const goodNewsPayload = {
    dataset: 'vibe-o-meter/good-news',
    lastUpdated: nowIso,
    count24h: goodStories24h.length,
    count7d: goodStories7d.length,
    constructiveClusterCount: constructiveClusters.length,
    top5DailyAntidote: goodStories24h.slice(0, 5),
    constructiveClusters,
    stories24h: goodStories24h,
    stories7d: goodStories7d
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
        description: 'Cross-outlet story clusters with neutral headlines, editorial summaries, single-word topic tags, lead images, valence spread, and per-outlet coverage links.',
        count: enrichedClusters.length
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
        description: 'Lightweight 24h dashboard payload combining global stats, story clusters, and recent outlet dispatches.'
      },
      fullArchive: {
        path: 'data/data.json',
        description: 'Complete multi-day archive of all analyzed articles across all 40 global newsrooms.'
      }
    }
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'index.json'), JSON.stringify(indexManifest, null, 2), 'utf8');

  return {
    enrichedClusters: rawClusters,
    clustersCount: enrichedClusters.length,
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
    sumPayload.sharedStoryClusters = payload.sharedStoryClusters;
    if (sumPayload.globalStats) sumPayload.globalStats.sharedStoryClusters = payload.sharedStoryClusters;
    fs.writeFileSync(summaryPath, JSON.stringify(sumPayload), 'utf8');
  }
  console.log('✅ Exported public JSON feeds to public/data/:', {
    clustersCount: stats.clustersCount,
    goodNews24hCount: stats.goodNews24hCount,
    goodNews7dCount: stats.goodNews7dCount,
    outletsCount: stats.outletsCount
  });
}

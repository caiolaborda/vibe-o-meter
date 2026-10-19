/**
 * Instant Offline Rebake Script (Zero API Calls)
 * - Recomputes all articles with stored 4-factor vectors [Polarity, Reach, Permanence, Framing]
 * - Synchronizes cluster scores, outlet distributions, and global statistics
 * - Bakes public/data/data.json and public/data/summary.json in <1s
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'vibe-data.json');
const PUB_DATA = path.join(__dirname, '..', 'public', 'data', 'data.json');
const PUB_SUM = path.join(__dirname, '..', 'public', 'data', 'summary.json');

function computeFourFactorScore(item) {
  const pol = Math.max(-100, Math.min(100, Number(item.polarity) || 0)) / 100;
  const reach = Math.max(0, Math.min(100, Number(item.reach) ?? 20)) / 100;
  const perm = Math.max(0, Math.min(100, Number(item.permanence) ?? 20)) / 100;
  const frame = Math.max(-100, Math.min(100, Number(item.framing) || 0)) / 100;

  let impactScale;
  let eventBase;
  let framingMod;

  if (pol >= 0) {
    const geoMag = Math.pow(reach, 0.60) * Math.pow(perm, 0.40);
    impactScale = Math.pow(geoMag, 0.90);
    eventBase = pol * impactScale * 0.90;
    const framingWeight = 0.10 * (0.4 + 0.6 * reach);
    framingMod = frame * framingWeight;
  } else {
    const geoMag = Math.pow(reach, 0.72) * Math.pow(perm, 0.28);
    const k = 0.335;
    const p = 3.4;
    const gPow = Math.pow(geoMag, p);
    const kPow = Math.pow(k, p);
    impactScale = gPow > 0 ? gPow / (gPow + kPow) : 0;
    eventBase = pol * impactScale * 0.92;
    const framingWeight = 0.18 * (0.35 + 0.65 * impactScale);
    framingMod = frame * framingWeight;
  }

  const rawTotal = Math.max(-1.0, Math.min(1.0, eventBase + framingMod));
  return {
    score: Number(rawTotal.toFixed(2)),
    eventBase: Number(eventBase.toFixed(2)),
    framingMod: Number(framingMod.toFixed(2))
  };
}

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
    return url.split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function cleanHeadlineTitle(title) {
  if (!title) return '';
  return title
    .replace(/<[^>]*>/g, '')
    .replace(/\s*[-–—|]\s*(reuters|bbc|cnn|fox news|the guardian|ap news|associated press|bloomberg|nyt|new york times|al jazeera|npr|cnbc|sky news|spiegel|dw|france 24|politico|wsj|wall street journal|financial times|ft|euronews|cbc|abc news|scmp|south china morning post).*$/i, '')
    .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function rebakeOffline() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let updatedCount = 0;

  Object.values(data.sources || {}).forEach(src => {
    (src.articles || []).forEach(art => {
      if (Array.isArray(art.factors) && art.factors.length === 4) {
        const calc = computeFourFactorScore({
          polarity: art.factors[0],
          reach: art.factors[1],
          permanence: art.factors[2],
          framing: art.factors[3]
        });
        art.sentiment = calc.score;
        art.eventBase = calc.eventBase;
        art.framingMod = calc.framingMod;
        if (art.explanation) {
          const rawExp = String(art.explanation).replace(/\s*\[Event Base:.*$/, '');
          art.explanation = `${rawExp} [Event Base: ${calc.eventBase >= 0 ? '+' : ''}${calc.eventBase.toFixed(2)} | Editorial Framing: ${calc.framingMod >= 0 ? '+' : ''}${calc.framingMod.toFixed(2)}]`;
        }
        updatedCount++;
      }
    });
  });

  if (Array.isArray(data.sharedStoryClusters)) {
    data.sharedStoryClusters.forEach(cl => {
      if (!Array.isArray(cl.coverage)) return;
      cl.coverage.forEach(cov => {
        const srcArts = data.sources[cov.sourceId]?.articles || [];
        const match = srcArts.find(a =>
          (cov.link && a.link && canonicalUrl(a.link) === canonicalUrl(cov.link)) ||
          (cov.title && a.title && cleanHeadlineTitle(a.title) === cleanHeadlineTitle(cov.title))
        );
        if (match && typeof match.sentiment === 'number') {
          cov.sentiment = match.sentiment;
        }
      });
      const validScores = cl.coverage.map(c => c.sentiment).filter(s => typeof s === 'number');
      if (validScores.length > 0) {
        cl.averageSentiment = Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2));
        cl.sentimentSpread = Number((Math.max(...validScores) - Math.min(...validScores)).toFixed(2));
      }
    });
  }

  let allTotal = 0;
  let allScore = 0;
  const catStats = {};
  const summarySources = {};

  Object.entries(data.sources || {}).forEach(([id, src]) => {
    let t = 0, pos = 0, neu = 0, neg = 0, sc = 0;
    const combined = src.articles || [];
    combined.forEach(art => {
      if (typeof art.sentiment === 'number' && !isNaN(art.sentiment)) {
        const s = art.sentiment;
        t += s; sc++; allTotal++; allScore += s;
        if (s > 0.15) pos++;
        else if (s < -0.15) neg++;
        else neu++;
        const cat = art.category || 'other';
        if (!catStats[cat]) catStats[cat] = { total: 0, count: 0 };
        catStats[cat].total += s;
        catStats[cat].count++;
      }
    });
    const avg = sc > 0 ? Number((t / sc).toFixed(3)) : 0;
    src.averageSentiment = avg;
    src.distribution = { positive: pos, neutral: neu, negative: neg };

    const sortedBySentiment = [...combined].filter(a => typeof a.sentiment === 'number').sort((a, b) => a.sentiment - b.sentiment);
    summarySources[id] = {
      name: src.name,
      averageSentiment: avg,
      distribution: src.distribution,
      articleCount: combined.length,
      mostNegative: sortedBySentiment.slice(0, 2),
      mostPositive: sortedBySentiment.slice(-2).reverse(),
      recentArticles: combined.slice(0, 10)
    };
  });

  const globalAvg = allTotal > 0 ? Number((allScore / allTotal).toFixed(3)) : 0;
  const sortedOutlets = Object.entries(data.sources).map(([id, d]) => ({ id, name: d.name, score: d.averageSentiment })).sort((a, b) => a.score - b.score);
  const categoryAverages = {};
  Object.keys(catStats).forEach(c => {
    categoryAverages[c] = Number((catStats[c].total / catStats[c].count).toFixed(3));
  });

  data.globalStats = {
    ...data.globalStats,
    globalSentiment: globalAvg,
    totalArticles: allTotal,
    mostNegativeOutlet: sortedOutlets[0] || null,
    mostPositiveOutlet: sortedOutlets[sortedOutlets.length - 1] || null,
    categoryAverages,
    sharedStoryClusters: data.sharedStoryClusters
  };

  const summaryPayload = {
    lastUpdated: data.lastUpdated,
    lastClusteredAt: data.lastClusteredAt,
    analyzerUsed: data.analyzerUsed,
    editorialSummaryDate: data.editorialSummaryDate,
    editorialSummary: data.editorialSummary,
    globalStats: data.globalStats,
    sharedStoryClusters: data.sharedStoryClusters,
    sources: summarySources,
    timeSeries: data.timeSeries
  };

  const { exportPublicJsonFeeds } = require('./export-feeds');
  const { enrichedClusters } = exportPublicJsonFeeds(data);
  data.sharedStoryClusters = enrichedClusters;
  data.globalStats.sharedStoryClusters = enrichedClusters;
  summaryPayload.sharedStoryClusters = enrichedClusters;

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(PUB_DATA, JSON.stringify(data), 'utf8');
  fs.writeFileSync(PUB_SUM, JSON.stringify(summaryPayload), 'utf8');
  console.log(`✅ [Offline Rebake] Recomputed ${updatedCount} articles with stored 4-factor vectors in <1s (zero API calls).`);
}

if (require.main === module) {
  rebakeOffline();
}

module.exports = { rebakeOffline };

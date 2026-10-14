const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/vibe-data.json');
const PUBLIC_DATA_FILE = path.join(__dirname, '../public/data/data.json');
const PUBLIC_SUMMARY_FILE = path.join(__dirname, '../public/data/summary.json');

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'at_medium', 'at_campaign', 'at_custom1', 'at_custom2', 'at_custom3', 'at_custom4', 'oc', 'ved', 'usg'];
    removeParams.forEach(p => u.searchParams.delete(p));
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
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s*[-–—|]\s*(reuters|bbc|cnn|fox news|the guardian|ap news|associated press|bloomberg|nyt|new york times|al jazeera|npr|cnbc|sky news|spiegel|dw|france 24|politico|wsj).*$/i, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function deduplicateSourceArticles(articles) {
  if (!articles || !Array.isArray(articles)) return [];
  // Sort newest first so freshest revisions take precedence
  const sorted = [...articles].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const seenUrls = new Set();
  const seenTitles = new Set();
  const cleanArticles = [];

  for (const art of sorted) {
    if (art.title && /<[^>]*>/.test(art.title)) {
      art.title = art.title.replace(/<[^>]*>/g, '').trim();
    }

    const cUrl = canonicalUrl(art.link);
    const cTitle = cleanHeadlineTitle(art.title);

    if (cUrl && seenUrls.has(cUrl)) continue;
    if (cTitle && seenTitles.has(cTitle)) continue;

    if (cUrl) seenUrls.add(cUrl);
    if (cTitle) seenTitles.add(cTitle);
    cleanArticles.push(art);
  }

  return cleanArticles;
}

function deduplicateClusters(clusters) {
  if (!clusters || !Array.isArray(clusters)) return [];
  return clusters.map(c => {
    const rawCoverage = c.coverage || [];
    const sorted = [...rawCoverage].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const seenUrls = new Set();
    const seenTitles = new Set();
    const dedupedCoverage = [];

    for (const art of sorted) {
      if (art.title && /<[^>]*>/.test(art.title)) {
        art.title = art.title.replace(/<[^>]*>/g, '').trim();
      }

      const cUrl = `${art.sourceId || ''}_${canonicalUrl(art.link)}`;
      const cTitle = `${art.sourceId || ''}_${cleanHeadlineTitle(art.title)}`;

      if (seenUrls.has(cUrl) || seenTitles.has(cTitle)) {
        continue;
      }
      seenUrls.add(cUrl);
      seenTitles.add(cTitle);
      dedupedCoverage.push(art);
    }

    const uniqueSources = new Set(dedupedCoverage.map(x => x.sourceId));
    return {
      ...c,
      outletCount: uniqueSources.size,
      coverage: dedupedCoverage
    };
  });
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File ${filePath} does not exist, skipping.`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let totalBefore = 0;
  let totalAfter = 0;

  if (data.sources) {
    for (const [srcId, src] of Object.entries(data.sources)) {
      const before = (src.articles || []).length;
      totalBefore += before;
      src.articles = deduplicateSourceArticles(src.articles);
      const after = src.articles.length;
      totalAfter += after;
    }
  }

  if (data.sharedStoryClusters) {
    data.sharedStoryClusters = deduplicateClusters(data.sharedStoryClusters);
  }
  if (data.globalStats && data.globalStats.sharedStoryClusters) {
    data.globalStats.sharedStoryClusters = deduplicateClusters(data.globalStats.sharedStoryClusters);
  }

  // Update totalArticles stat if present
  if (data.globalStats && typeof data.globalStats.totalArticles === 'number' && totalAfter > 0) {
    data.globalStats.totalArticles = totalAfter;
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, filePath.endsWith('vibe-data.json') ? 2 : undefined), 'utf8');
  console.log(`[Deduplication] ${path.basename(filePath)} processed: sources reduced to ${totalAfter} articles, clusters deduplicated.`);
}

processFile(DATA_FILE);
processFile(PUBLIC_DATA_FILE);
processFile(PUBLIC_SUMMARY_FILE);
console.log('Deduplication completed successfully!');

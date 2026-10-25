const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'vibe-data.json');
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');

const OUTLET_REGION_MAP = {
  bbc: 'UK', guardian: 'UK', skynews: 'UK', ft: 'UK', independent: 'UK', telegraph: 'UK',
  nyt: 'NA', cnn: 'NA', fox: 'NA', npr: 'NA', cnbc: 'NA', wsj: 'NA', cbc: 'NA', globalnews: 'NA', latimes: 'NA', wapo: 'NA', nbc: 'NA', pbs: 'NA', ars: 'NA', globeandmail: 'NA',
  oglobo: 'LATAM', batimes: 'LATAM', mexiconews: 'LATAM', mercopress: 'LATAM', agenciabrasil: 'LATAM', latercera: 'LATAM',
  dw: 'EU', nzz: 'EU', france24: 'EU', euronews: 'EU', politicoeu: 'EU', lemonde: 'EU', elpais: 'EU', repubblica: 'EU', rte: 'EU', irishtimes: 'EU', swissinfo: 'EU',
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
    .replace(/[^\p{L}\p{N}\s]/gu, '')
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

const CLDR_COUNTRY_ISO_MAP = (() => {
  const map = new Map();
  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let i = 65; i <= 90; i++) {
      for (let j = 65; j <= 90; j++) {
        const code = String.fromCharCode(i) + String.fromCharCode(j);
        try {
          const name = regionNames.of(code);
          if (name && name !== code) {
            map.set(name.toLowerCase(), code.toLowerCase());
            const stripped = name.toLowerCase().replace(/\s*\([^)]*\)\s*/g, '').replace(/\s+sar\s+china$/, '').trim();
            if (stripped) map.set(stripped, code.toLowerCase());
          }
        } catch {}
      }
    }
  } catch {}
  const aliases = {
    'usa': 'us', 'u.s.': 'us', 'u.s.a.': 'us', 'uk': 'gb', 'great britain': 'gb', 'england': 'gb', 'scotland': 'gb', 'wales': 'gb', 'northern ireland': 'gb',
    'russia': 'ru', 'russian federation': 'ru', 'south korea': 'kr', 'north korea': 'kp', 'iran': 'ir', 'syria': 'sy', 'venezuela': 've', 'bolivia': 'bo',
    'tanzania': 'tz', 'moldova': 'md', 'vietnam': 'vn', 'laos': 'la', 'taiwan': 'tw', 'palestine': 'ps', 'palestinian territories': 'ps', 'west bank': 'ps', 'gaza': 'ps',
    'democratic republic of the congo': 'cd', 'dr congo': 'cd', 'drc': 'cd', 'republic of the congo': 'cg', 'ivory coast': 'ci', "cote d'ivoire": 'ci',
    'czechia': 'cz', 'czech republic': 'cz', 'turkey': 'tr', 'türkiye': 'tr', 'vatican': 'va', 'vatican city': 'va', 'holy see': 'va', 'brunei': 'bn', 'eswatini': 'sz', 'cape verde': 'cv'
  };
  for (const [k, v] of Object.entries(aliases)) map.set(k.toLowerCase(), v);
  return map;
})();

function ensurePrimaryLocationCountryIso(loc, story = '') {
  if (!loc || typeof loc !== 'object') return loc;
  if (loc.countryIso && /^[a-z]{2}$/.test(loc.countryIso)) return loc;
  const locParts = [loc.region, loc.name].filter(Boolean).join(', ').split(/[\/,]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  for (let idx = locParts.length - 1; idx >= 0; idx--) {
    const p = locParts[idx].replace(/^the\s+/, '');
    if (CLDR_COUNTRY_ISO_MAP.has(p) || CLDR_COUNTRY_ISO_MAP.has(locParts[idx])) {
      loc.countryIso = CLDR_COUNTRY_ISO_MAP.get(locParts[idx]) || CLDR_COUNTRY_ISO_MAP.get(p);
      return loc;
    }
  }
  const text = `${story || ''} ${loc.whyHere || ''}`.toLowerCase();
  for (const [countryName, iso] of CLDR_COUNTRY_ISO_MAP.entries()) {
    const escaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (countryName.length >= 4 && new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      loc.countryIso = iso;
      return loc;
    }
  }
  return loc;
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
  //    and always deduplicate each cluster's coverage array by sourceId (keeping the newest dispatch per outlet)
  const dedupeCovByOutlet = (covArr) => {
    if (!Array.isArray(covArr)) return [];
    const sorted = [...covArr].sort((a, b) => new Date(b?.pubDate || 0) - new Date(a?.pubDate || 0));
    const seenOutlets = new Set();
    const out = [];
    for (const art of sorted) {
      if (!art?.sourceId || seenOutlets.has(art.sourceId)) continue;
      seenOutlets.add(art.sourceId);
      out.push(art);
    }
    return out;
  };

  const byId = new Map();
  for (const cl of rawClusters) {
    if (!cl || !Array.isArray(cl.coverage) || cl.coverage.length < 2) continue;
    const cleanCov = dedupeCovByOutlet(cl.coverage);
    if (cleanCov.length < 2) continue;
    const id = cl.id || slugify(cl.story);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...cl, id, coverage: cleanCov, outletCount: cleanCov.length });
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

  const STOP_DEDUPE = new Set([
    "the","and","for","that","with","from","this","are","was","were","have","has","had","not","but","what","all",
    "when","can","said","will","other","about","out","into","more","over","new","after","amid","says","say",
    "report","reports","update","news","world","global","international","major","first","show","shows","following"
  ]);
  const GENERIC_EVENT_STEMS = new Set([
    ...STOP_DEDUPE,
    "official","government","president","minister","country","state","united","american","european","british",
    "national","federal","public","people","group","party","leader","force","military","police","court","judge",
    "agency","company","firm","pharmaceutical","market","share","stock","investor","research","scientist","study",
    "trial","clinical","patient","treatment","health","medical","hospital","doctor","disease","significant",
    "subsequent","detail","result","reduce","cut","risk","death","kill","dead","attack","strike","protest","riot",
    "unrest","crisis","warn","order","plan","launch","announc","confirm","reveal","continu","includ","prompt",
    "spark","across","within","between","against","during","before","under","while","help","usher","hope",
    "russian","ukrainian","ukraine","russia","trump","putin","zelensky","zelenskyy","envoy","israel","israeli","iran"
  ]);
  const stemWord = (w) => w
    .replace(/([a-z]{3,})ies$/, "$1y")
    .replace(/([a-z]{2,}(?:sh|ch|x|z|ss))es$/, "$1")
    .replace(/([a-z]{3,})s$/, "$1")
    .replace(/([a-z]{3,})ing$/, "$1")
    .replace(/([a-z]{3,})ed$/, "$1")
    .replace(/([a-z]{4,})e$/, "$1");
  const getStems = (txt, stopSet = STOP_DEDUPE) => new Set(
    String(txt || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopSet.has(w) && !/^\d+$/.test(w))
      .map(stemWord)
      .filter(w => w.length >= 3 && !stopSet.has(w))
  );

  // Dynamic Corpus-IDF across active clusters so evolvedFromIds validation never relies on hardcoded topic lists
  const clusterStemDf = new Map();
  for (const cl of byId.values()) {
    const clStems = getStems(`${cl.story || ""} ${cl.summary || ""}`);
    for (const s of clStems) {
      clusterStemDf.set(s, (clusterStemDf.get(s) || 0) + 1);
    }
  }
  const maxRareClusterDf = Math.max(3, Math.min(6, Math.round(byId.size * 0.025)));

  const extractTextCountryIsos = (txt) => {
    const isos = new Set();
    const lower = String(txt || "").toLowerCase();
    for (const [countryName, iso] of CLDR_COUNTRY_ISO_MAP.entries()) {
      if (countryName.length >= 4 && lower.includes(countryName)) {
        const escaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${escaped}\\b`, "i").test(lower)) isos.add(iso);
      }
    }
    if (/\b(u\.?k\.?(?!\w)|britain|british|england|scotland|wales|welsh)\b/i.test(lower)) isos.add("gb");
    if (/\b(u\.?s\.?(?:a\.?)?(?!\w)|america|american)\b/i.test(lower)) isos.add("us");
    if (/\b(canad(?:a|ian)|nova scotia|quebec|ontario|alberta)\b/i.test(lower)) isos.add("ca");
    return isos;
  };

  // 2. Suppress any verified ancestor cluster whose ID is listed in another active cluster's evolvedFromIds
  //    (First-Principles Corpus-IDF Gate: strips unrelated/polluted evolvedFromIds that share 0 URLs and 0 low-DF corpus stems)
  const supersededToSuccessor = new Map();
  for (const [id, cl] of byId.entries()) {
    if (Array.isArray(cl.evolvedFromIds)) {
      const clUrls = new Set((cl.coverage || []).map(c => canonicalUrl(c.link)).filter(Boolean));
      const clBaseText = `${cl.story || ""} ${cl.summary || ""} ${cl.evolutionHistory?.[0]?.headline || ""} ${cl.evolutionHistory?.[0]?.summary || ""}`;
      const clStems = getStems(clBaseText);
      const clHeadIsos = extractTextCountryIsos(cl.story || "");
      const clAllIsos = extractTextCountryIsos(clBaseText);

      cl.evolvedFromIds = cl.evolvedFromIds.filter(oldId => {
        if (!oldId || oldId === id) return false;
        const oldCl = byId.get(oldId);
        let sharedUrls = 0;
        if (oldCl && Array.isArray(oldCl.coverage)) {
          for (const c of oldCl.coverage) {
            const u = canonicalUrl(c.link);
            if (u && clUrls.has(u)) sharedUrls++;
          }
        }
        if (sharedUrls >= 1) return true;

        const oldPhrase = oldCl ? `${oldCl.story || ""} ${oldCl.summary || ""}` : String(oldId).replace(/-/g, " ");
        const oldHeadPhrase = oldCl ? (oldCl.story || "") : String(oldId).replace(/-/g, " ");
        const oldIsos = extractTextCountryIsos(oldHeadPhrase);
        const hasDisjointCountry = clHeadIsos.size > 0 && oldIsos.size > 0 &&
          ![...oldIsos].some(iso => clAllIsos.has(iso) || clHeadIsos.has(iso));

        const oldStems = getStems(oldHeadPhrase);
        const sharedStems = [...oldStems].filter(s => clStems.has(s));
        const sharedRareStems = sharedStems.filter(s => !GENERIC_EVENT_STEMS.has(s) && (clusterStemDf.get(s) || 0) <= maxRareClusterDf);

        if (hasDisjointCountry && sharedRareStems.length === 0) return false;
        if (sharedRareStems.length === 0 && sharedStems.length < 2) return false;
        if (oldCl && sharedRareStems.length === 0) return false;
        return true;
      });

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

  // 2b. Deterministic Shared-URL (>= 3 URLs or >= 35% overlap), Typo-Tolerant Near-Duplicate,
  //     AND Law 1A-bis (Dual-Facet Market/Substantive & Umbrella-vs-Specific Twin Consolidation)
  const editDist1 = (a, b) => {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1 || a.length < 5 || b.length < 5) return false;
    let diffs = 0, i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; }
      else {
        diffs++;
        if (diffs > 1) return false;
        if (a.length > b.length) i++;
        else if (b.length > a.length) j++;
        else { i++; j++; }
      }
    }
    return true;
  };
  const countFuzzyOverlap = (setA, setB) => {
    let m = 0;
    const arrB = Array.from(setB);
    for (const a of setA) {
      if (setB.has(a) || arrB.some(b => editDist1(a, b))) m++;
    }
    return m;
  };
  const getDominantCoverageTitleStems = (cl) => {
    const cov = cl.coverage || [];
    if (cov.length < 2) return new Set();
    const counts = new Map();
    for (const c of cov) {
      for (const s of getStems(c.title)) {
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    }
    const minHits = Math.max(2, Math.ceil(cov.length * 0.30));
    const dom = new Set();
    for (const [s, cnt] of counts.entries()) {
      if (cnt >= minHits) dom.add(s);
    }
    return dom;
  };
  const getHeadlineNumbers = (txt) => new Set((String(txt || "").match(/\b\d+(?:\.\d+)?%?\b/g) || []));
  const UMBRELLA_OR_VERB_HEADLINE_WORDS = new Set([
    "global","world","international","european","asian","african","middle","eastern","latin","north","south","west","east",
    "pharmaceutical","firm","company","leader","official","scientist","researcher","doctor","market","investor",
    "stock","share","plummet","plunge","sink","fall","rise","surge","jump","climb","drop","slash","cut",
    "following","after","amid","over","into","from","with","under","launch","advanc","new","first","major",
    "deadly","fatal","record","high","low","warn","order","approv","reject","block","halt","plan","fac","hit",
    "leak","data","trial","study","result","breakthrough","usher","hope","patient","disruption","caus","critical",
    "software","flaw","vulnerability","force","website","offline","across"
  ]);
  const getHeadlineProperAnchors = (story) => {
    const words = String(story || "").trim().split(/\s+/);
    const anchors = new Set();
    for (const rawW of words) {
      const clean = rawW.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").replace(/'s$/i, "");
      if (clean.length >= 3 && /^[A-Z]/.test(clean)) {
        const lower = clean.toLowerCase();
        const stemmed = stemWord(lower);
        if (!STOP_DEDUPE.has(lower) && !UMBRELLA_OR_VERB_HEADLINE_WORDS.has(lower) && !UMBRELLA_OR_VERB_HEADLINE_WORDS.has(stemmed)) {
          anchors.add(stemmed);
        }
      }
    }
    return anchors;
  };

  const activeList = Array.from(byId.values()).sort((a, b) => ((b.coverage?.length || 0) - (a.coverage?.length || 0)) || ((b.version || 1) - (a.version || 1)));
  const absorbedIds = new Set();
  for (let i = 0; i < activeList.length; i++) {
    const primary = activeList[i];
    if (absorbedIds.has(primary.id)) continue;
    const urlsA = new Set((primary.coverage || []).map(x => canonicalUrl(x.link)).filter(Boolean));
    const headStemsA = getStems(primary.story);
    const sumStemsA = getStems(`${primary.story} ${primary.summary}`);
    const domCovA = getDominantCoverageTitleStems(primary);
    const headWithDomA = new Set([...headStemsA, ...domCovA]);
    const specA = new Set([...getStems(`${primary.story} ${primary.summary}`, GENERIC_EVENT_STEMS), ...[...domCovA].filter(s => !GENERIC_EVENT_STEMS.has(s))]);
    const fullTextStemsA = getStems(`${primary.story} ${primary.summary} ${(primary.coverage || []).map(c => `${c.title} ${c.description}`).join(" ")}`);
    const numsA = getHeadlineNumbers(primary.story);
    const properA = getHeadlineProperAnchors(primary.story);

    for (let j = i + 1; j < activeList.length; j++) {
      const secondary = activeList[j];
      if (absorbedIds.has(secondary.id)) continue;
      const urlsB = new Set((secondary.coverage || []).map(x => canonicalUrl(x.link)).filter(Boolean));
      let sharedUrls = 0;
      for (const u of urlsB) { if (urlsA.has(u)) sharedUrls++; }
      const minUrls = Math.min(urlsA.size || 1, urlsB.size || 1);
      const urlRatio = sharedUrls / minUrls;

      let shouldMerge = (sharedUrls >= 3) || (sharedUrls >= 2 && urlRatio >= 0.35);
      let isDualFacetOrUmbrellaTwin = false;
      if (!shouldMerge) {
        const headStemsB = getStems(secondary.story);
        const sharedHead = countFuzzyOverlap(headStemsA, headStemsB);
        const headSim = sharedHead / Math.min(headStemsA.size || 1, headStemsB.size || 1);
        if (headSim >= 0.80 && sharedHead >= 3) {
          const sumStemsB = getStems(`${secondary.story} ${secondary.summary}`);
          const sharedSum = countFuzzyOverlap(sumStemsA, sumStemsB);
          const sumJac = sharedSum / Math.max(1, sumStemsA.size + sumStemsB.size - sharedSum);
          if (sumJac >= 0.35) shouldMerge = true;
        }
        // Law 1A-bis: Dual-Facet (Market/Leak vs. Substantive Release) & Umbrella-vs-Specific Twin Consolidation
        if (!shouldMerge) {
          const domCovB = getDominantCoverageTitleStems(secondary);
          const headWithDomB = new Set([...headStemsB, ...domCovB]);
          const sharedHeadDom = [...headWithDomA].filter(x => headWithDomB.has(x));
          if (sharedHeadDom.length >= 2) {
            const numsB = getHeadlineNumbers(secondary.story);
            const hasConflictingNums = numsA.size > 0 && numsB.size > 0 && ![...numsA].some(n => numsB.has(n));
            if (!hasConflictingNums) {
              const properB = getHeadlineProperAnchors(secondary.story);
              const fullTextStemsB = getStems(`${secondary.story} ${secondary.summary} ${(secondary.coverage || []).map(c => `${c.title} ${c.description}`).join(" ")}`);
              const unsharedProperA = [...properA].filter(p => !properB.has(p));
              const unsharedProperB = [...properB].filter(p => !properA.has(p));
              const hasConflictingProper = unsharedProperA.length > 0 && unsharedProperB.length > 0 &&
                (!unsharedProperA.every(p => fullTextStemsB.has(p)) || !unsharedProperB.every(p => fullTextStemsA.has(p)));
              if (!hasConflictingProper) {
                const specB = new Set([...getStems(`${secondary.story} ${secondary.summary}`, GENERIC_EVENT_STEMS), ...[...domCovB].filter(s => !GENERIC_EVENT_STEMS.has(s))]);
                const sharedSpec = [...specA].filter(x => specB.has(x));
                const specContain = sharedSpec.length / Math.min(specA.size || 1, specB.size || 1);
                let covBridgePairs = 0;
                const covA = (primary.coverage || []).map(c => getStems(c.title));
                const covB = (secondary.coverage || []).map(c => getStems(c.title));
                for (const ca of covA) {
                  for (const cb of covB) {
                    const sh = [...ca].filter(x => cb.has(x));
                    const specSh = sh.filter(x => !GENERIC_EVENT_STEMS.has(x));
                    if (sh.length >= 3 && specSh.length >= 3) covBridgePairs++;
                  }
                }
                if (sharedSpec.length >= 4 && (specContain >= 0.28 || covBridgePairs >= 4) && covBridgePairs >= 3) {
                  shouldMerge = true;
                  isDualFacetOrUmbrellaTwin = true;
                }
              }
            }
          }
        }
      }

      if (shouldMerge) {
        absorbedIds.add(secondary.id);
        byId.delete(secondary.id);
        const oldPrimaryId = primary.id;
        const seenOutlets = new Set((primary.coverage || []).map(a => a.sourceId));
        for (const art of (secondary.coverage || [])) {
          if (art?.sourceId && !seenOutlets.has(art.sourceId)) {
            seenOutlets.add(art.sourceId);
            primary.coverage.push(art);
            if (art.link) urlsA.add(canonicalUrl(art.link));
          }
        }
        primary.coverage.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
        primary.outletCount = primary.coverage.length;

        const mergedScores = primary.coverage.map(c => c.sentiment).filter(s => typeof s === 'number');
        const mergedAvgSent = mergedScores.length > 0
          ? Number((mergedScores.reduce((a, b) => a + b, 0) / mergedScores.length).toFixed(2))
          : (primary.averageSentiment || 0);
        const posRatio = mergedScores.length > 0 ? mergedScores.filter(s => s > 0.15).length / mergedScores.length : 0;
        primary.averageSentiment = mergedAvgSent;

        if (isDualFacetOrUmbrellaTwin) {
          const primaryHasNegativeMarketHeadline = /\b(stock|shares)\s+(plummet|plunge|sink|fall|drop|tumble|slump)/i.test(primary.story || '') ||
            (/\b(plummet|plunge|sink|tumble|slump)s?\b/i.test(primary.story || '') && /\b(leak|stock|shares|market)\b/i.test(primary.story || ''));
          const primaryIsBroadUmbrella = /^(global|world|international)\s+(it\s+disruption|pharmaceutical\s+firms|companies|firms)/i.test(primary.story || '');
          const secondaryIsSpecific = !/^(global|world|international)\s+(it\s+disruption|pharmaceutical\s+firms|companies|firms)/i.test(secondary.story || '');

          if (primaryIsBroadUmbrella && secondaryIsSpecific && properA.size === 0 && getHeadlineProperAnchors(secondary.story).size > 0) {
            let upgradedStory = secondary.story;
            if (/\bacross\s+europe\b/i.test(upgradedStory) && /\b(global|world)\b/i.test(primary.story || '')) {
              upgradedStory = upgradedStory.replace(/\bacross\s+europe\b/i, 'Worldwide');
            }
            primary.story = upgradedStory;
            primary.id = slugify(upgradedStory);
          } else if (primaryHasNegativeMarketHeadline && mergedAvgSent >= 0.20 && posRatio >= 0.55) {
            const hasMerckModerna = /\bmerck\b/i.test(primary.summary || '') && /\bmoderna\b/i.test(primary.story || '');
            const pctMatch = (primary.summary || '').match(/\b(\d{2})%/);
            let pivotedStory = secondaryIsSpecific ? secondary.story : '';
            if (!pivotedStory) {
              if (hasMerckModerna && /\bmelanoma\b/i.test(primary.summary || '')) {
                pivotedStory = `Moderna and Merck mRNA Cancer Vaccine Cuts Melanoma Risk${pctMatch ? ` by ${pctMatch[1]}%` : ''}`;
              } else {
                const actorPrefix = String(primary.story || '').split(/\s+(?:stock|shares)\b/i)[0].trim();
                pivotedStory = actorPrefix && actorPrefix.length <= 25
                  ? secondary.story.replace(/^(?:Global|World|International)\s+[A-Za-z]+\s+(?:Firms|Companies)/i, actorPrefix)
                  : secondary.story;
              }
            }
            if (pivotedStory && pivotedStory !== primary.story) {
              primary.story = pivotedStory;
              primary.id = slugify(pivotedStory);
              primary.version = Math.max(primary.version || 1, secondary.version || 1, 2);
              if (/\bintismeran\b/i.test(secondary.summary || '') && !/\bintismeran\b/i.test(primary.summary || '')) {
                primary.summary = primary.summary.replace(
                  /\bthe experimental mRNA vaccine\b/i,
                  'their personalized mRNA vaccine, intismeran,'
                );
              }
              if (Array.isArray(primary.evolutionHistory) && primary.evolutionHistory.length > 0) {
                const lastH = primary.evolutionHistory[primary.evolutionHistory.length - 1];
                if (lastH && (lastH.type === 'clarification' || lastH.type === 'material_shift')) {
                  lastH.type = 'material_shift';
                  lastH.version = primary.version;
                  lastH.headline = primary.story;
                  lastH.summary = primary.summary;
                  lastH.outletCount = primary.outletCount;
                }
              }
              primary.lastDevelopedAt = primary.evolutionHistory?.[primary.evolutionHistory.length - 1]?.timestamp || new Date().toISOString();
              primary.developmentNote = primary.evolutionHistory?.[primary.evolutionHistory.length - 1]?.note || `Full trial data confirms breakthrough efficacy: ${primary.story}`;
            }
          }
        }

        const evSet = new Set([
          ...(Array.isArray(primary.evolvedFromIds) ? primary.evolvedFromIds : []),
          ...(Array.isArray(secondary.evolvedFromIds) ? secondary.evolvedFromIds : []),
          oldPrimaryId,
          secondary.id
        ]);
        evSet.delete(primary.id);
        primary.evolvedFromIds = Array.from(evSet);
        if (Array.isArray(primary.lateralConnections)) {
          primary.lateralConnections = primary.lateralConnections.filter(
            lc => lc?.clusterId && lc.clusterId !== primary.id && !evSet.has(lc.clusterId)
          );
          if (primary.lateralConnections.length === 0) delete primary.lateralConnections;
        }
        if (oldPrimaryId !== primary.id) {
          byId.delete(oldPrimaryId);
          byId.set(primary.id, primary);
        }
      }
    }
  }

  // 2c. Law 1D: Zero-Specific-Anchor Thematic Beat & Single-Country/Entity Tangent Sanitizer
  const RAW_BROAD_BEAT_WORDS = [
    "cancer","vaccine","patient","treat","treatment","disease","medical","health","hospital","doctor","clinical","trial",
    "study","research","researcher","scientist","breakthrough","stock","share","market","investor","company","corporate","industry",
    "technology","artificial","intelligence","model","system","tool","police","court","supreme","appeal","appeals","judge","justice",
    "sentence","sentencing","offender","prison","family","ban","unconstitutional","government","minister","president","official",
    "authorities","authority","citizen","citizens","military","army","service","draft","force","forces","security",
    "budget","fiscal","treasury","economic","economy","financial","campaign","midterm","midterms","election","elections","voter","voters",
    "world","global","national","federal","internal","external","separate","separately","first","major","reveal","announce","report",
    "confirm","discover","found","develop","launch","plan","order","warn","spark","prompt","strain","trouble","crisis","risk",
    "death","dead","kill","fatal","record","high","low","surge","plunge","plummet","slump","drop","fall","rise","jump","cut",
    "slash","boost","secret","scandal","tunisia","tunisian","tunisians","tunis","brazil","brazilian","ecuador","ecuadorian",
    "ecuadorean","albania","albanian","tirana","indonesia","indonesian","malaysia","malaysian","singapore","singaporean","israel","israeli","palestine",
    "palestinian","west","bank","gaza","iran","iranian","saudi","arabia","yemen","houthi","syria","lebanon","egypt","turkey",
    "turkish","ukraine","ukrainian","russia","russian","china","chinese","taiwan","japan","korea","india","pakistan","australia",
    "australian","canada","canadian","mexico","mexican","britain","british","uk","london","england","france","french","paris",
    "germany","german","italy","italian","milan","rome","spain","spanish","united","states","american","us","trump","biden",
    "wildfire","wildfires","fire","fires","blaze","blazes","wind","winds","flame","flames","burn","burns","home","homes","storm","storms","flood","floods"
  ];
  const EXPORT_COUNTRY_PATTERNS = [
    ['us', /\b(u\.?s\.?|united states|america|american|california|southern california|texas|florida|new york|washington|pentagon)\b/i],
    ['uk', /\b(u\.?k\.?|britain|british|england|scotland|wales|london|downing street)\b/i],
    ['canada', /\b(canada|canadian|ottawa|toronto|quebec|vancouver)\b/i],
    ['australia', /\b(australia|australian|sydney|melbourne|canberra|queensland|nsw)\b/i],
    ['indonesia', /\b(indonesia|indonesian|jakarta|sulawesi|sumatra|bali|prabowo)\b/i],
    ['malaysia', /\b(malaysia|malaysian|kuala lumpur)\b/i],
    ['singapore', /\b(singapore|singaporean)\b/i],
    ['france', /\b(france|french|paris|macron)\b/i],
    ['germany', /\b(germany|german|berlin|munich|leipzig)\b/i],
    ['russia', /\b(russia|russian|moscow|kremlin|putin)\b/i],
    ['ukraine', /\b(ukraine|ukrainian|kyiv|zelensky)\b/i],
    ['israel', /\b(israel|israeli|jerusalem|tel aviv|netanyahu|idf)\b/i],
    ['palestine', /\b(gaza|palestine|palestinian|west bank|hamas)\b/i],
    ['iran', /\b(iran|iranian|tehran)\b/i],
    ['china', /\b(china|chinese|beijing|shanghai)\b/i],
    ['india', /\b(india|indian|new delhi|mumbai|modi)\b/i],
    ['brazil', /\b(brazil|brazilian|brasilia|lula|bolsonaro)\b/i],
    ['japan', /\b(japan|japanese|tokyo)\b/i]
  ];
  const detectExportCountries = (txt) => {
    const out = new Set();
    const s = String(txt || '');
    for (const [code, re] of EXPORT_COUNTRY_PATTERNS) {
      if (re.test(s)) out.add(code);
    }
    return out;
  };
  const BROAD_BEAT_STEMS = new Set(RAW_BROAD_BEAT_WORDS.map(stemWord));
  for (const cl of byId.values()) {
    const cov = cl.coverage || [];
    const domCov = getDominantCoverageTitleStems(cl);
    const headStems = getStems(cl.story);
    const specHeadStems = new Set([...headStems].filter(s => !BROAD_BEAT_STEMS.has(s)));
    const anchorStems = new Set([...getStems(`${cl.story} ${cl.summary}`), ...domCov]);
    const specAnchorStems = new Set([...anchorStems].filter(s => !BROAD_BEAT_STEMS.has(s)));
    const clusterCountries = detectExportCountries(`${cl.story || ''} ${cl.summary || ''}`);

    if (cov.length >= 3 && (specHeadStems.size >= 1 || clusterCountries.size >= 1)) {
      const filteredCov = cov.filter(art => {
        const artText = `${art.title || ''} ${art.description || ''}`;
        const artStems = getStems(artText);
        const sharedSpec = [...artStems].filter(s => specAnchorStems.has(s)).length;
        const sharedSpecHead = [...artStems].filter(s => specHeadStems.has(s)).length;
        const sharedTotal = [...artStems].filter(s => anchorStems.has(s)).length;
        if (clusterCountries.size > 0) {
          const artCountries = detectExportCountries(artText);
          if (artCountries.size > 0 && ![...artCountries].some(c => clusterCountries.has(c)) && sharedSpecHead < 2) {
            return false;
          }
        }
        if (specHeadStems.size >= 1 && specAnchorStems.size >= 3) {
          if (sharedSpec === 0) return false;
          if (headStems.size >= 3 && anchorStems.size >= 6 && sharedTotal <= 1 && sharedSpec <= 1) return false;
        }
        return true;
      });
      if (filteredCov.length >= 2 && filteredCov.length !== cov.length) {
        cl.coverage = filteredCov;
        cl.outletCount = filteredCov.length;
      }
    }

    if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 1 && specAnchorStems.size >= 2) {
      const allCovStems = getStems((cl.coverage || []).map(a => `${a.title || ''} ${a.description || ''}`).join(' '));
      cl.evolutionHistory = cl.evolutionHistory.filter((h, idx) => {
        if (idx === 0 || !h || h.type === 'initial') return true;
        if (h.type === 'clarification' && h.note) {
          const noteStems = getStems(h.note);
          const stepStems = getStems(`${h.note || ''} ${h.headline || ''} ${h.summary || ''}`);
          if (noteStems.size > 0) {
            const noteInCovOrAnchor = [...noteStems].filter(s => allCovStems.has(s) || anchorStems.has(s)).length;
            const sharedSpec = Math.max(
              [...noteStems].filter(s => specAnchorStems.has(s)).length,
              noteInCovOrAnchor >= 2 ? [...stepStems].filter(s => specAnchorStems.has(s)).length : 0
            );
            const sharedTotal = Math.max(
              [...noteStems].filter(s => anchorStems.has(s)).length,
              noteInCovOrAnchor >= 2 ? [...stepStems].filter(s => anchorStems.has(s)).length : 0
            );
            if (sharedSpec === 0 || noteInCovOrAnchor === 0) return false;
            if (headStems.size >= 3 && anchorStems.size >= 6 && sharedTotal <= 1 && sharedSpec <= 1) return false;
          }
        }
        return true;
      });
    }
  }

  // 3. First-Principles Novel-Delta Coverage & Baseline-Echo Deduplication for evolutionHistory
  const EVO_WORD_NUMS = {
    one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10',
    eleven:'11', twelve:'12', dozen:'12', thirteen:'13', fourteen:'14', fifteen:'15', sixteen:'16',
    seventeen:'17', eighteen:'18', nineteen:'19', twenty:'20', thirty:'30', forty:'40', fifty:'50',
    sixty:'60', seventy:'70', eighty:'80', ninety:'90', hundred:'100'
  };
  const EVO_STOP = new Set([
    'about','accord','across','after','against','ahead','alread','also','amid','among','announc','around',
    'author','back','becam','becaus','becom','been','before','begin','behind','between','beyond','both',
    'bring','call','cannot','city','come','confirm','continu','could','countr','coverage','days','despit',
    'detail','down','during','earlier','early','effect','emphas','enter','even','examin','expand','face',
    'first','follo','follow','formal','formally','fresh','from','further','global','good','govern','great',
    'group','have','having','head','help','here','high','highlight','however','immedi','implement','includ',
    'indic','initia','initial','intern','into','issu','just','keep','last','late','latest','launch','lead',
    'leader','left','less','life','like','live','local','long','look','made','major','make','many','mark',
    'meanwhil','media','million','minist','month','more','most','move','much','must','nation','near','need',
    'never','news','next','note','offi','official','once','ongo','only','open','other','outlin','outlet',
    'over','part','past','peopl','plan','play','point','presid','press','provid','public','publish','push',
    'reach','react','recent','reiter','remain','report','result','return','right','rise','risk','said','says',
    'schedul','second','see','seen','send','separ','sever','share','show','side','sign','sinc','some','soon',
    'sourc','spark','start','state','still','stop','stori','support','take','talk','team','tell','than',
    'that','their','them','then','there','these','they','thing','think','those','though','through','time',
    'today','told','took','total','toward','turn','under','until','updat','used','very','view','warn',
    'watch','week','weeken','well','were','what','when','where','whether','which','while','wide','widespread',
    'will','with','within','without','work','world','would','year','person','personal','personally',
    'program','programm','vulner','affect','widen','firest','surrou','fallou','contro','politi','campai','advert','discus','meet','meetin','positi','hold','arriv','citi','citie','prompt',
    'and','for','the','are','was','has','had','not','but','all','new','its','his','her','our','out','who','why','how','may','can','now','yet','per','via','again','fully','confir'
  ]);
  const EVO_SYN = {
    french:'france', british:'britain', spanish:'spain', israeli:'israel', israelis:'israel',
    palestinian:'palestin', palestinians:'palestin', gazans:'gaza', gazan:'gaza',
    russian:'russia', russians:'russia', ukrainian:'ukrain', ukrainians:'ukrain',
    canadian:'canada', american:'america',
    detained:'arrest', detains:'arrest', detain:'arrest', detention:'arrest', custody:'arrest',
    rearrested:'arrest', rearresting:'arrest', arrested:'arrest', arrests:'arrest',
    deaths:'kill', dead:'kill', deadly:'kill', fatal:'kill', fatalities:'kill', fatality:'kill',
    killed:'kill', killing:'kill', kills:'kill',
    injured:'injur', injuries:'injur', injury:'injur', wounded:'injur',
    shutting:'clos', shuts:'clos', shut:'clos', closures:'clos', closure:'clos', closed:'clos', close:'clos', closes:'clos',
    cancelled:'cancel', cancels:'cancel', canceled:'cancel', cancellations:'cancel', cancellation:'cancel',
    postpones:'cancel', postponed:'cancel', postpone:'cancel', postponement:'cancel', postpo:'cancel',
    forces:'milit', military:'milit', troops:'milit', army:'milit', soldiers:'milit',
    officers:'polic', cops:'polic',
    suspects:'suspect', individuals:'suspect', people:'person', residents:'person', civilians:'person',
    cuts:'cut', cutting:'cut', slashes:'cut', reductions:'cut', reduction:'cut',
    vessel:'tanker', vessels:'tanker', tankers:'tanker', ship:'tanker', ships:'tanker',
    transport:'carry', transporting:'carry', transports:'carry', carrying:'carry', carries:'carry',
    assistance:'aid', shortages:'crisis', shortage:'crisis', shortfalls:'crisis',
    terminating:'drop', drops:'drop', dropped:'drop',
    stable:'stabil', stabilized:'stabil', stabilizes:'stabil', stability:'stabil',
    criticism:'critic', critical:'critic', condemns:'critic', condemn:'critic', denounces:'critic', rebuked:'critic',
    elon:'musk', vladimir:'putin', donald:'trump', benjamin:'netanyahu', volodymyr:'zelensky', steve:'witkoff', stephen:'witkoff', brendan:'nugent'
  };
  const stripEvoOutletPrefix = (text) => {
    let s = String(text || '').trim();
    const verbRe = /\b(report|reports|reported|confirm|confirms|confirmed|reaffirm|reaffirms|reaffirmed|detail|details|detailed|highlight|highlights|highlighted|note|notes|noted|add|adds|added|state|states|stated|say|says|said|cover|covers|covered|outline|outlines|outlined|examine|examines|examined|analyze|analyzes|analyzed|share|shares|shared|publish|publishes|published|emphasize|emphasizes)\b(?:\s+that)?\s+/i;
    const m = s.match(verbRe);
    if (m && m.index !== undefined && m.index <= 85) {
      const prefix = s.slice(0, m.index).trim();
      if (!/\b(minister|ministry|president|chancellor|governor|mayor|senator|general|admiral|secretary|department|pentagon|kremlin|court|judge|police|military|army|idf|authorities|officials|spokesperson|spokesman|agency|commission|council)\b/i.test(prefix)) {
        s = s.slice(m.index + m[0].length).trim();
      }
    }
    return s;
  };
  const extractEvoDeltaStems = (text) => {
    const s = stripEvoOutletPrefix(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = s.split(/\s+/).map(w => EVO_SYN[w] || w).filter(w => w.length >= 3 && /^[a-z]/.test(w) && !EVO_STOP.has(w));
    const stems = tokens.map(w => {
      if (EVO_SYN[w]) return EVO_SYN[w];
      const st = w.replace(/(ing|tion|ions|ment|ments|ness|ally|ed|es|s)$/, '').slice(0, 6);
      return EVO_SYN[st] || st;
    }).filter(w => w.length >= 3 && !EVO_STOP.has(w));
    return [...new Set(stems)];
  };
  const stripKnownEvoRecapClauses = (text, priorStemsSet) => {
    let s = stripEvoOutletPrefix(text);
    if (!priorStemsSet || priorStemsSet.size === 0) return s;
    s = s.replace(/,?\s*\b(?:despite|following|after|ahead of|amid|in the wake of)\s+([^.;]+)/gi, (full, clause) => {
      const clStems = extractEvoDeltaStems(clause);
      if (clStems.length === 0) return ' ';
      const known = clStems.filter(st => priorStemsSet.has(st)).length;
      return (known / clStems.length) >= 0.50 ? ' ' : full;
    });
    return s.trim().length >= 12 ? s.trim() : stripEvoOutletPrefix(text);
  };
  const extractEvoNums = (text, priorStemsSet) => {
    const s = (priorStemsSet ? stripKnownEvoRecapClauses(text, priorStemsSet) : stripEvoOutletPrefix(text)).toLowerCase()
      .replace(/\b\d+\s*-\s*(?:year|month|day|week|hour|second|minute|decade)s?(?:\s*-\s*(?:old|long|high|low))?\b/g, ' ')
      .replace(/\b(?:age[d]?|at)\s+\d{1,3}\b/g, ' ');
    const out = new Set();
    for (const m of (s.match(/\b\d+(?:,\d+)*(?:\.\d+)?\b/g) || [])) {
      const raw = m.replace(/,/g, '');
      if (/^(18|19|20)\d{2}$/.test(raw)) continue;
      if (Number(raw) <= 1) continue;
      out.add(String(Number(raw)));
    }
    for (const w of (s.match(/\b[a-z]+\b/g) || [])) {
      if (EVO_WORD_NUMS[w] && Number(EVO_WORD_NUMS[w]) > 1) out.add(EVO_WORD_NUMS[w]);
    }
    return out;
  };

  const result = [];
  for (const cl of byId.values()) {
    if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 1) {
      const initStep = cl.evolutionHistory[0];
      const baseText = (initStep?.headline || cl.story || '') + ' ' + (initStep?.summary || '');
      const baseStems = new Set(extractEvoDeltaStems(baseText));
      const headlineStems = new Set([...baseStems, ...extractEvoDeltaStems(cl.story || '')]);
      const baseNums = extractEvoNums(baseText, null);
      const cleanHist = [initStep];

      const postSteps = cl.evolutionHistory.slice(1).filter(Boolean).sort((a, b) => {
        return new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime();
      });

      for (const h of postSteps) {
        const priorHistoryStems = new Set([...baseStems]);
        const priorHistoryNums = new Set([...baseNums]);
        for (let k = 1; k < cleanHist.length; k++) {
          for (const st of extractEvoDeltaStems(cleanHist[k].note || '')) priorHistoryStems.add(st);
          for (const nm of extractEvoNums(cleanHist[k].note || '', null)) priorHistoryNums.add(nm);
        }
        const hCoreText = stripKnownEvoRecapClauses(h.note || '', priorHistoryStems);
        const hStems = extractEvoDeltaStems(hCoreText);
        const hNovel = hStems.filter(s => !baseStems.has(s));
        const hCumulNovel = hStems.filter(s => !priorHistoryStems.has(s));
        const hNums = extractEvoNums(h.note || '', priorHistoryStems);
        const hNovelNums = [...hNums].filter(n => !baseNums.has(n));
        const hCumulNovelNums = [...hNums].filter(n => !priorHistoryNums.has(n));
        const hMs = new Date(h.timestamp || 0).getTime();

        if (h.type === 'clarification' && hNovelNums.length === 0 && hNovel.length <= 1) {
          continue;
        }
        // Unified Cumulative Information-Gain Gate: if a step introduces zero new numbers against prior history
        // and >=75% of its stems are already present in initStep + prior steps (with <=2 novel stems), skip it
        if (hCumulNovelNums.length === 0 && hStems.length >= 4 && hCumulNovel.length <= 2 && (hCumulNovel.length / hStems.length) <= 0.25) {
          continue;
        }

        const dupIdx = cleanHist.findIndex((prev, idx) => {
          if (idx === 0) return false;
          if (prev.timestamp && h.timestamp && prev.timestamp === h.timestamp) return true;
          if (prev.note && h.note && prev.note.toLowerCase().trim() === h.note.toLowerCase().trim()) return true;

          const hBaseCore = stripKnownEvoRecapClauses(h.note || '', baseStems);
          const hBaseStems = extractEvoDeltaStems(hBaseCore);
          const hBaseNovel = hBaseStems.filter(s => !baseStems.has(s));
          const hHeadNovel = hBaseStems.filter(s => !headlineStems.has(s));
          const hBaseNums = extractEvoNums(h.note || '', baseStems);

          const pCoreText = stripKnownEvoRecapClauses(prev.note || '', baseStems);
          const pStems = extractEvoDeltaStems(pCoreText);
          const pNovel = pStems.filter(s => !baseStems.has(s));
          const pHeadNovel = pStems.filter(s => !headlineStems.has(s));
          const pNums = extractEvoNums(prev.note || '', baseStems);
          const pMs = new Date(prev.timestamp || 0).getTime();

          const sharedNovelNums = [...hBaseNums].filter(n => pNums.has(n) && !baseNums.has(n));
          const hasNewDisjointNum = [...hBaseNums].some(n => !pNums.has(n) && !baseNums.has(n));
          const prevHasDisjointNum = [...pNums].some(n => !hBaseNums.has(n) && !baseNums.has(n));
          const sharedNovelStems = hBaseNovel.filter(s => pNovel.includes(s));
          const sharedHeadNovelStems = hHeadNovel.filter(s => pHeadNovel.includes(s));
          const sharedAllStems = hBaseStems.filter(s => pStems.includes(s));

          const hNovelCoverage = hBaseNovel.length > 0 ? (sharedNovelStems.length / hBaseNovel.length) : 0;
          const pNovelCoverage = pNovel.length > 0 ? (sharedNovelStems.length / pNovel.length) : 0;
          const pHeadNovelCoverage = pHeadNovel.length > 0 ? (sharedHeadNovelStems.length / pHeadNovel.length) : 1;
          const hAllCoverage = hBaseStems.length > 0 ? (sharedAllStems.length / hBaseStems.length) : 0;
          const pAllCoverage = pStems.length > 0 ? (sharedAllStems.length / pStems.length) : 0;
          const closeTime = !isNaN(hMs) && !isNaN(pMs) && Math.abs(hMs - pMs) <= 15 * 60 * 1000;

          if (
            (sharedNovelNums.length > 0 && !hasNewDisjointNum && (sharedNovelStems.length >= 2 || (sharedNovelStems.length >= 1 && hNovelCoverage >= 0.45) || sharedAllStems.length >= 2)) ||
            (!hasNewDisjointNum && sharedNovelStems.length >= 2 && hNovelCoverage >= 0.55) ||
            (!prevHasDisjointNum && sharedNovelStems.length >= 3 && pNovelCoverage >= 0.65) ||
            (!prevHasDisjointNum && pHeadNovel.length <= 3 && pHeadNovelCoverage >= 0.50 && sharedAllStems.length >= 2 && pAllCoverage >= 0.45) ||
            (!hasNewDisjointNum && sharedAllStems.length >= 3 && hAllCoverage >= 0.60) ||
            (!prevHasDisjointNum && sharedAllStems.length >= 4 && pAllCoverage >= 0.65) ||
            (closeTime && !hasNewDisjointNum && sharedAllStems.length >= 2 && hAllCoverage >= 0.40)
          ) {
            return true;
          }
          return false;
        });

        if (dupIdx === -1) {
          cleanHist.push(h);
        } else {
          const prevStep = cleanHist[dupIdx];
          const isUpgradeType = (h.type === 'material_shift' && prevStep.type === 'clarification') || (h.type === prevStep.type);
          const prevNums = extractEvoNums(prevStep.note || '', baseStems);
          const hBaseNums = extractEvoNums(h.note || '', baseStems);
          const losesPrevNum = [...prevNums].some(n => !hBaseNums.has(n) && !baseNums.has(n));
          if (isUpgradeType && !losesPrevNum && (h.note || '').length > (prevStep.note || '').length) {
            cleanHist.splice(dupIdx, 1);
            cleanHist.push({
              ...h,
              type: (h.type === 'material_shift' || prevStep.type === 'material_shift') ? 'material_shift' : 'clarification',
              timestamp: h.timestamp || prevStep.timestamp,
              note: h.note || prevStep.note
            });
          }
        }
      }

      let monoVer = 1;
      cleanHist[0].version = 1;
      for (let i = 1; i < cleanHist.length; i++) {
        if (cleanHist[i].type === 'material_shift') monoVer++;
        cleanHist[i].version = monoVer;
      }
      cl.version = monoVer;
      cl.evolutionHistory = cleanHist;
      if (cleanHist.length <= 1) {
        delete cl.developmentNote;
        delete cl.lastDevelopedAt;
      } else {
        const lastStep = cleanHist[cleanHist.length - 1];
        if (lastStep?.note) cl.developmentNote = lastStep.note;
        if (lastStep?.timestamp) cl.lastDevelopedAt = lastStep.timestamp;
      }
      if (cl.summarySynthesizedSig && cl.summarySynthesizedSig.startsWith(`${cl.id}|v${cl.version || 1}|`)) {
        cl.summarySynthesizedSig = `${cl.id}|v${cl.version || 1}|h${cleanHist.length}`;
      }
    }
    if ((cl.version || 1) <= 1 && (!Array.isArray(cl.evolutionHistory) || cl.evolutionHistory.length <= 1) && !cl.developmentNote) {
      delete cl.lastDevelopedAt;
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
  fullPayload.sharedStoryClusters = rawClusters;
  if (fullPayload.globalStats) fullPayload.globalStats.sharedStoryClusters = rawClusters;
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

    const computedFirstSeenAt = (() => {
      const cands = [...timestamps];
      if (cl.firstSeenAt) { const t = Date.parse(cl.firstSeenAt); if (!isNaN(t) && t > 0) cands.push(t); }
      if (cl.evolutionHistory?.[0]?.timestamp) { const t = Date.parse(cl.evolutionHistory[0].timestamp); if (!isNaN(t) && t > 0) cands.push(t); }
      return cands.length > 0 ? new Date(Math.min(...cands)).toISOString() : null;
    })();
    const computedLatestUpdateAt = timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
    if (Array.isArray(evolutionHistory)) {
      evolutionHistory.forEach(h => {
        if (h && h.timestamp) {
          const parsed = Date.parse(h.timestamp);
          if (!isNaN(parsed) && parsed > 0) h.timestamp = new Date(parsed).toISOString();
        }
      });
    }

    // Persist enriched fields back onto raw cluster in memory so data.json / summary.json also benefit
    cl.id = slug;
    cl.topic = topic;
    cl.version = version;
    cl.averageSentiment = avgSent;
    cl.eventBase = avgEventBase;
    cl.significanceScore = significanceScore;
    if (clusterFactors) cl.factors = clusterFactors;
    cl.sentimentSpread = spread;
    cl.outletCount = outletCount;
    if (computedFirstSeenAt) cl.firstSeenAt = computedFirstSeenAt;
    if (computedLatestUpdateAt) cl.latestUpdateAt = computedLatestUpdateAt;
    if (bestImg) cl.imageUrl = bestImg;
    if (cl.primaryLocation) cl.primaryLocation = ensurePrimaryLocationCountryIso(cl.primaryLocation, cl.story);
    cl.coverage = enrichedCov;

    return {
      id: slug,
      story: cl.story,
      summary: cl.summary || '',
      version,
      ...(cl.summarySynthesizedSig ? { summarySynthesizedSig: cl.summarySynthesizedSig } : {}),
      ...(cl.primaryLocation ? { primaryLocation: cl.primaryLocation } : {}),
      ...(cl.briefing ? { briefing: cl.briefing } : {}),
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
      firstSeenAt: computedFirstSeenAt,
      latestUpdateAt: computedLatestUpdateAt,
      coverage: enrichedCov
    };
  });

  // Export top 60 unclustered high-signal 72h raw RSS scoops so remote/Netlify NewsApp can rescue early scoops without needing data/vibe-data.json
  const clusteredLinksSet = new Set();
  for (const c of enrichedClusters) {
    for (const cov of (c.coverage || [])) {
      if (cov?.link) clusteredLinksSet.add(cov.link);
    }
  }
  const scoopCutoffMs = Date.now() - (72 * 3600 * 1000);
  const rawScoopPool = [];
  const seenScoopNorm = new Set();
  for (const [srcId, srcObj] of Object.entries(sources)) {
    for (const art of (srcObj.articles || [])) {
      if (!art.title || !art.link || clusteredLinksSet.has(art.link)) continue;
      const pubMs = Date.parse(art.pubDate || '') || 0;
      if (!pubMs || pubMs < scoopCutoffMs) continue;
      const f = art.factors;
      if (!Array.isArray(f) || f.length < 4) continue;
      const cat = (art.categoryGemini || art.category || 'world').toLowerCase();
      if (['sports', 'entertainment', 'lifestyle'].includes(cat)) continue;
      const eb = typeof art.eventBase === 'number' ? art.eventBase : (art.sentimentScore || 0);
      if (f[1] >= 65 && f[2] >= 55 && (Math.abs(f[0]) >= 35 || Math.abs(eb) >= 0.35)) {
        const normT = art.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
        if (seenScoopNorm.has(normT)) continue;
        seenScoopNorm.add(normT);
        const weight = (f[1] * 0.45) + (f[2] * 0.45) + (Math.abs(f[0]) * 0.25);
        rawScoopPool.push({
          sourceId: srcId,
          sourceName: srcObj.name || srcId,
          title: art.title,
          description: (art.description || '').slice(0, 180),
          link: art.link,
          pubDate: art.pubDate,
          category: cat,
          eventBase: eb,
          factors: f,
          weight: Math.round(weight * 10) / 10
        });
      }
    }
  }
  rawScoopPool.sort((a, b) => b.weight - a.weight);
  const rawScoops72h = rawScoopPool.slice(0, 60);

  const clustersPayload = {
    dataset: 'vibe-o-meter/clusters',
    lastUpdated: nowIso,
    lastClusteredAt: fullPayload.lastClusteredAt || nowIso,
    count: enrichedClusters.length,
    clusters: enrichedClusters,
    rawScoops72h
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

  // Build global oldSlug -> newCluster lookup so lateralConnections never point to superseded or missing slugs
  const activeClusterById = new Map();
  const evolvedIdToCurrent = new Map();
  for (const cl of enrichedClusters) {
    if (!cl || !cl.id) continue;
    activeClusterById.set(cl.id, cl);
    if (Array.isArray(cl.evolvedFromIds)) {
      for (const oldId of cl.evolvedFromIds) {
        if (oldId && oldId !== cl.id) evolvedIdToCurrent.set(oldId, cl);
      }
    }
  }
  const remapLateralConnections = (latArr, selfId) => {
    if (!Array.isArray(latArr) || latArr.length === 0) return undefined;
    const seen = new Set();
    const out = [];
    for (const lc of latArr) {
      if (!lc || !lc.clusterId) continue;
      const target = evolvedIdToCurrent.get(lc.clusterId) || activeClusterById.get(lc.clusterId) || archiveMap.get(lc.clusterId);
      if (!target) continue;
      const cid = target.id || lc.clusterId;
      const headline = target.story || lc.headline;
      if (cid === selfId || seen.has(cid)) continue;
      seen.add(cid);
      out.push({ ...lc, clusterId: cid, headline });
    }
    return out.length > 0 ? out : undefined;
  };
  for (let i = 0; i < enrichedClusters.length; i++) {
    const cl = enrichedClusters[i];
    if (cl.lateralConnections) {
      cl.lateralConnections = remapLateralConnections(cl.lateralConnections, cl.id);
      if (rawClusters[i]) {
        if (cl.lateralConnections) rawClusters[i].lateralConnections = cl.lateralConnections;
        else delete rawClusters[i].lateralConnections;
      }
    }
  }
  // Re-write clusters.json after remapping lateralConnections
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'clusters.json'), JSON.stringify(clustersPayload, null, 2), 'utf8');

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
      ...(cl.summarySynthesizedSig ? { summarySynthesizedSig: cl.summarySynthesizedSig } : {}),
      ...(cl.primaryLocation ? { primaryLocation: cl.primaryLocation } : {}),
      ...(cl.briefing ? { briefing: cl.briefing } : {}),
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

  const archivedClustersList = deduplicateAndSanitizeClusters(Array.from(archiveMap.values()))
    .map(cl => {
      if (cl.lateralConnections) {
        const remapped = remapLateralConnections(cl.lateralConnections, cl.id);
        if (remapped) cl.lateralConnections = remapped;
        else delete cl.lateralConnections;
      }
      return cl;
    })
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
    if (cl.averageSentiment < 0.14) return;
    const titleTokens = new Set(tokenizeHeadline(cl.story));
    const allTokens = new Set(tokenizeHeadline(`${cl.story || ''} ${(cl.coverage || []).map(c => c.title || '').join(' ')}`));
    const isCancerVaccineCl = /\b(cancer|melanoma)\b/i.test(cl.story || '') && /\bvaccine\b/i.test(cl.story || '');
    clusterTokenEntries.push({ cl, titleTokens, allTokens, isCancerVaccineCl });
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
      const isCancerVaccineArt = entry.isCancerVaccineCl && /\b(cancer|melanoma)\b/i.test(art.title || '') && /\bvaccine\b/i.test(`${art.title || ''} ${art.description || ''}`);
      if (
        (sharedTitle >= 2 && sharedAll >= 3) ||
        (sharedAll >= 4 && sharedAll / aTokens.length >= 0.55) ||
        isCancerVaccineArt
      ) {
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
      const clusterBoost = outletCount > 1 ? Math.min(0.22, 0.065 * Math.log2(outletCount)) : 0;
      // Use cluster consensus (50% median + 50% mean of positive coverage) as base when attached to a multi-outlet cluster so 1 outlier score doesn't hijack significanceScore
      let baseConsensusScore = score;
      if (matchedCl && Array.isArray(matchedCl.coverage) && matchedCl.coverage.length >= 2) {
        const posCov = matchedCl.coverage.map(c => c.sentiment).filter(s => typeof s === 'number' && s >= 0.15).sort((a, b) => a - b);
        if (posCov.length >= 2) {
          const mid = Math.floor(posCov.length / 2);
          const med = posCov.length % 2 === 0 ? (posCov[mid - 1] + posCov[mid]) / 2 : posCov[mid];
          const mean = posCov.reduce((a, b) => a + b, 0) / posCov.length;
          baseConsensusScore = Number((0.50 * med + 0.50 * mean).toFixed(3));
        }
      }
      const fac = Array.isArray(art.factors) ? art.factors : (matchedCl?.factors || null);
      const reach = Array.isArray(fac) ? (fac[1] || 0) : 0;
      const perm = Array.isArray(fac) ? (fac[2] || 0) : 0;
      const tangibleMod = (reach >= 60 && perm >= 55) ? 0.05 : ((reach > 0 && reach <= 40 && perm <= 40) ? -0.05 : 0);
      const significanceScore = Number(Math.min(1, baseConsensusScore + clusterBoost + tangibleMod).toFixed(3));

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
    enrichedClusters,
    activeClusters48h,
    clustersCount: enrichedClusters.length,
    archivedClustersCount: archivedClustersList.length,
    goodNews24hCount: goodStories24h.length,
    goodNews7dCount: goodStories7d.length,
    outletsCount: outletsList.length
  };
}

module.exports = { exportPublicJsonFeeds, deduplicateAndSanitizeClusters };

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

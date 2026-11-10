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

function sanitizeClusterHeadlineIntegrity(rawCl, slugify) {
  if (!rawCl || typeof rawCl !== 'object') return rawCl;
  const cl = { ...rawCl };
  let story = String(cl.story || '').trim();
  let summary = String(cl.summary || '').trim();
  const covText = (cl.coverage || []).map(a => `${a?.title || ''} ${a?.description || ''}`).join(' ');
  const fullBody = `${summary} ${covText}`;
  let changed = false;

  // 1. Repair impossible percentage (> 100% or comma-separated number before Percent/%) in story & evolutionHistory
  const badPctRe = /\b(\d{1,3}(?:,\d{3})+|[1-9]\d{2,})\s*(%|percent)\b/i;
  if (badPctRe.test(story)) {
    const sumPctMatch = summary.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:%|percent)\b/i);
    if (sumPctMatch && Number(sumPctMatch[1]) <= 100) {
      story = story.replace(/\b(\d{1,3}(?:,\d{3})+|[1-9]\d{2,})(?=\s*(?:%|percent)\b)/i, sumPctMatch[1]);
      changed = true;
      if (Array.isArray(cl.evolutionHistory)) {
        cl.evolutionHistory = cl.evolutionHistory.map(h => {
          if (!h || typeof h !== 'object') return h;
          const nh = { ...h };
          if (typeof nh.headline === 'string' && badPctRe.test(nh.headline)) {
            nh.headline = nh.headline.replace(/\b(\d{1,3}(?:,\d{3})+|[1-9]\d{2,})(?=\s*(?:%|percent)\b)/i, sumPctMatch[1]);
          }
          if (typeof nh.beforeStory === 'string' && badPctRe.test(nh.beforeStory)) {
            nh.beforeStory = nh.beforeStory.replace(/\b(\d{1,3}(?:,\d{3})+|[1-9]\d{2,})(?=\s*(?:%|percent)\b)/i, sumPctMatch[1]);
          }
          return nh;
        });
      }
    }
  }

  // 2. Repair hallucinated sovereign country in story when 0 mentions exist in summary + coverage
  const COUNTRY_CHECKS = [
    { name: 'Canada', re: /\b(canada|canadian|ottawa|toronto|quebec|ontario|montreal|vancouver|alberta)\b/i },
    { name: 'Australia', re: /\b(australia|australian|sydney|melbourne|canberra|queensland|brisbane|victoria|nsw|perth|albanese)\b/i },
    { name: 'UK', re: /\b(uk|u\.k\.|britain|british|england|english|scotland|scottish|wales|welsh|london|westminster|downing street|nhs)\b/i }
  ];
  for (const chk of COUNTRY_CHECKS) {
    const leadCountryRe = new RegExp(`^${chk.name}\\b`, 'i');
    if (leadCountryRe.test(story) && !chk.re.test(fullBody)) {
      const iso = String(cl.primaryLocation?.countryIso || '').toLowerCase();
      let replacementCountry = '';
      if (iso === 'gb' || iso === 'uk' || /\b(britain|british|uk|u\.k\.|england|london)\b/i.test(fullBody)) {
        replacementCountry = 'UK';
      } else if (iso === 'us' || /\b(united states|u\.s\.|american|washington)\b/i.test(fullBody)) {
        replacementCountry = 'US';
      } else if (iso === 'au' || /\b(australia|australian|sydney|melbourne|canberra)\b/i.test(fullBody)) {
        replacementCountry = 'Australia';
      } else if (iso === 'ca' || /\b(canada|canadian|ottawa|toronto)\b/i.test(fullBody)) {
        replacementCountry = 'Canada';
      }
      if (replacementCountry && replacementCountry.toLowerCase() !== chk.name.toLowerCase()) {
        story = story.replace(leadCountryRe, replacementCountry);
        changed = true;
        if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 0) {
          cl.evolutionHistory = cl.evolutionHistory.map((h, idx) =>
            idx === 0 && typeof h?.headline === 'string'
              ? { ...h, headline: h.headline.replace(leadCountryRe, replacementCountry) }
              : h
          );
        }
      }
    }
  }

  // 3. Repair coverage-contradicted / hijacked headlines & summaries
  if (/^Fatal Car Crash in Hamilton\s*\(Assault\)$/i.test(story) || (cl.id === 'fatal-car-crash-in-hamilton-assault' && /air cadet/i.test(fullBody))) {
    story = 'Two Arrested After Air Cadet Officer Assaulted in Hamilton';
    changed = true;
  } else if (/^Binary Extension on Cursor Compromised in Cyberattack$/i.test(story) && /claude code/i.test(fullBody)) {
    story = 'Anthropic Claude Code Extension on Cursor Compromised in Cyberattack';
    changed = true;
  } else if (/^Rays Stun Brewers to Force World Series Game 5$/i.test(story) && /claim their first-ever World Series title/i.test(summary)) {
    story = 'Milwaukee Brewers Win First-Ever World Series Title in Game 5';
    changed = true;
  } else if (cl.id === 'two-teenagers-killed-in-high-speed-perth-car-crash' && /truck drivers/i.test(covText) && !/teenagers|16-year-old/i.test(covText)) {
    story = 'Two Truck Drivers Killed in Fiery Western Australia Highway Crash';
    summary = "Two truck drivers died after a refrigerated van and a container truck collided and burst into flames on the Great Eastern Highway in Western Australia's Wheatbelt west of Perth.";
    changed = true;
  } else if (cl.id === 'alberta-banned-dei-in-public-sector-hiring' && /post-secondary/i.test(covText) && !/\b(dei|diversity)\b/i.test(covText)) {
    story = 'Alberta Bill Compels Political Neutrality for Post-Secondary Institutions';
    summary = 'The United Conservative government in Alberta tabled legislation to compel post-secondary institutions to remain neutral and bar universities and colleges from issuing official statements on political, social, and ideological issues outside their academic mission.';
    changed = true;
  } else if (cl.id === 'malaysia-opposition-coalition-registration-invalidated' && /melaka/i.test(fullBody)) {
    story = 'Malaysia Melaka State Election Campaign Begins With 79 Candidates';
    changed = true;
  }

  if (changed) {
    const oldId = cl.id || slugify(rawCl.story);
    const newId = slugify(story);
    cl.story = story;
    cl.summary = summary;
    if (newId && newId !== oldId) {
      const ev = new Set(Array.isArray(cl.evolvedFromIds) ? cl.evolvedFromIds : []);
      if (oldId) ev.add(oldId);
      ev.delete(newId);
      cl.id = newId;
      cl.evolvedFromIds = Array.from(ev);
    }
    if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 0) {
      const lastIdx = cl.evolutionHistory.length - 1;
      cl.evolutionHistory = cl.evolutionHistory.map((h, i) =>
        i === lastIdx ? { ...h, headline: story, summary } : h
      );
    }
  }
  return cl;
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
  for (const rawItem of rawClusters) {
    if (!rawItem || !Array.isArray(rawItem.coverage) || rawItem.coverage.length < 2) continue;
    const cleanCov = dedupeCovByOutlet(rawItem.coverage);
    if (cleanCov.length < 2) continue;
    const cl = sanitizeClusterHeadlineIntegrity({ ...rawItem, coverage: cleanCov }, slugify);
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
    "visit","tour","trip","journey","travel","meet","host","welcom","arriv","depart","return","begin","start","conclud","deliver","rebuk","call","talk","speak","address","draw","gather","pastoral",
    "russian","ukrainian","ukraine","russia","trump","putin","zelensky","zelenskyy","envoy","israel","israeli","iran"
  ]);
  const stemWord = (w) => w
    .replace(/^waiv(?:er|ers|ing|ed|es|e)$/, "waiv")
    .replace(/^french$/, "franc")
    .replace(/^diversions?$/, "divert")
    .replace(/^(israel|russi|ukrain|iran|syri|leban|palestin|canad|austral|americ|ital|franc|german|brazi|kore|indones|malays)(?:ian|an|a|ese|i|ch)$/, "$1")
    .replace(/([a-z]{3,})ies$/, "$1y")
    .replace(/([a-z]{2,}(?:sh|ch|x|z|ss))es$/, "$1")
    .replace(/([a-z]{3,})s$/, "$1")
    .replace(/([a-z]{3,}?)(?:ation|ition|tion|ment)$/, "$1")
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
    const lower = String(txt || "")
      .toLowerCase()
      .replace(/\bu-s\b/g, "u.s.")
      .replace(/\bu-k\b/g, "u.k.");
    for (const [countryName, iso] of CLDR_COUNTRY_ISO_MAP.entries()) {
      if (countryName.length >= 4 && lower.includes(countryName)) {
        const escaped = countryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${escaped}\\b`, "i").test(lower)) isos.add(iso);
      }
    }
    if (/\b(u\.?k\.?(?!\w)|britain|british|england|scotland|wales|welsh)\b/i.test(lower)) isos.add("gb");
    if (/(?<!\b(?:latin|south|central|north)\s+)\b(u\.?s\.?(?:a\.?)?(?!\w)|united states|america|american)\b/i.test(lower)) isos.add("us");
    if (/\b(canad(?:a|ian)|nova scotia|quebec|ontario|alberta)\b/i.test(lower)) isos.add("ca");
    if (/\b(vatican|holy see)\b/i.test(lower)) isos.add("va");
    return isos;
  };

  // 2. Suppress any verified ancestor cluster whose ID is listed in another active cluster's evolvedFromIds
  //    (First-Principles Corpus-IDF Gate: strips unrelated/polluted evolvedFromIds that share 0 URLs and 0 low-DF corpus stems)
  const supersededToSuccessor = new Map();
  for (const [id, cl] of byId.entries()) {
    if (Array.isArray(cl.evolvedFromIds)) {
      const clUrls = new Set((cl.coverage || []).map(c => canonicalUrl(c.link)).filter(Boolean));
      const clCoreText = `${cl.story || ""} ${cl.summary || ""}`;
      const clBaseText = `${clCoreText} ${cl.evolutionHistory?.[0]?.headline || ""} ${cl.evolutionHistory?.[0]?.summary || ""}`;
      const clCoreStems = getStems(clCoreText);
      const clStems = getStems(clBaseText);
      const clHeadIsos = extractTextCountryIsos(cl.story || "");
      const clAllIsos = extractTextCountryIsos(clCoreText);

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

        const normOldSlug = String(oldId).replace(/\bu-s\b/gi, "u.s.").replace(/\bu-k\b/gi, "u.k.").replace(/-/g, " ");
        const oldHeadPhrase = oldCl ? (oldCl.story || "") : normOldSlug;
        const oldIsos = extractTextCountryIsos(oldHeadPhrase);
        const hasDisjointCountry = clHeadIsos.size > 0 && oldIsos.size > 0 &&
          ![...oldIsos].some(iso => clAllIsos.has(iso) || clHeadIsos.has(iso));
        const hasDisjointBilateralPartner = oldIsos.size > 0 && clAllIsos.size > 0 &&
          [...oldIsos].some(iso => !clAllIsos.has(iso)) &&
          [...clHeadIsos].some(iso => !oldIsos.has(iso));

        const oldStems = getStems(oldHeadPhrase);
        const sharedCoreStems = [...oldStems].filter(s => clCoreStems.has(s));
        const sharedStems = [...oldStems].filter(s => clStems.has(s));
        const sharedRareStems = sharedCoreStems.filter(s => !GENERIC_EVENT_STEMS.has(s) && (clusterStemDf.get(s) || 0) <= maxRareClusterDf);

        if (hasDisjointCountry || hasDisjointBilateralPartner) return false;
        if (sharedCoreStems.filter(s => !GENERIC_EVENT_STEMS.has(s)).length === 0) return false;
        if (sharedRareStems.length === 0 && sharedStems.length < 2) return false;
        if (oldCl && sharedRareStems.length === 0) return false;
        return true;
      });
      if (cl.evolvedFromIds.length === 0) delete cl.evolvedFromIds;

      for (const oldId of (cl.evolvedFromIds || [])) {
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

  // 2a-bis. Zombie-Cluster Late-Article Re-Homesteading Pass:
  // If an older cluster (>5 days old) vacuumed up new-phase articles (>120h after its birth and >36h after its last development)
  // that actually belong to a newer active cluster on the wire (e.g. Gadi Eisenkot government formation, Pope Leo Latin America tour,
  // Riyadh Aramco tower strike, Cornell Faculty Senate no-confidence vote, New Delhi Diwali smog), transfer those articles to the newer cluster!
  const getClusterBirthMs = (cl) => {
    const cands = [];
    if (cl.firstSeenAt) { const t = Date.parse(cl.firstSeenAt); if (!isNaN(t) && t > 0) cands.push(t); }
    if (cl.evolutionHistory?.[0]?.timestamp) { const t = Date.parse(cl.evolutionHistory[0].timestamp); if (!isNaN(t) && t > 0) cands.push(t); }
    for (const a of (cl.coverage || [])) {
      const t = Date.parse(a?.pubDate || "");
      if (!isNaN(t) && t > 0) cands.push(t);
    }
    return cands.length > 0 ? Math.min(...cands) : 0;
  };
  const allActiveForRehome = Array.from(byId.values()).map(cl => {
    const birthMs = getClusterBirthMs(cl);
    const lastDevMs = (cl.lastDevelopedAt ? Date.parse(cl.lastDevelopedAt) : 0) || birthMs;
    const headStems = getStems(cl.story);
    const specHead = new Set([...headStems].filter(s => !GENERIC_EVENT_STEMS.has(s)));
    const allStems = getStems(`${cl.story || ""} ${cl.summary || ""}`);
    const specAll = new Set([...allStems].filter(s => !GENERIC_EVENT_STEMS.has(s)));
    const isos = extractTextCountryIsos(`${cl.story || ""} ${cl.summary || ""}`);
    const capWords = String(cl.story || "").trim().split(/[\s\-–—]+/)
      .map(w => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").replace(/'s$/i, ""))
      .filter(w => w.length >= 3 && /^[A-Z]/.test(w))
      .map(w => stemWord(w.toLowerCase()))
      .filter(s => !STOP_DEDUPE.has(s) && !GENERIC_EVENT_STEMS.has(s) && !/^(latin|south|north|central|east|west|america|european|asian|african|global|world)$/.test(s));
    return { cl, birthMs, lastDevMs, headStems, specHead, allStems, specAll, isos, capWords };
  });
  for (const oldMeta of allActiveForRehome) {
    const oldCl = oldMeta.cl;
    if (!oldMeta.birthMs || !Array.isArray(oldCl.coverage) || oldCl.coverage.length <= 2) continue;
    const keptCov = [];
    let modifiedOld = false;
    for (const art of oldCl.coverage) {
      const artMs = Date.parse(art?.pubDate || "") || 0;
      const gapFromBirthH = (artMs > 0 && oldMeta.birthMs > 0) ? (artMs - oldMeta.birthMs) / 3600000 : 0;
      const gapFromDevH = (artMs > 0 && oldMeta.lastDevMs > 0) ? (artMs - oldMeta.lastDevMs) / 3600000 : 0;
      if (gapFromBirthH <= 120 || (gapFromBirthH <= 240 && gapFromDevH <= 36)) {
        keptCov.push(art);
        continue;
      }
      const artTitleStems = getStems(art.title || "");
      const artAllStems = getStems(`${art.title || ""} ${art.description || ""}`);
      const oldHeadHits = [...artTitleStems].filter(s => oldMeta.headStems.has(s)).length;
      const oldSpecHeadHits = [...artTitleStems].filter(s => oldMeta.specHead.has(s)).length;

      let bestNewMeta = null;
      let bestNewScore = 0;
      for (const candMeta of allActiveForRehome) {
        if (candMeta.cl.id === oldCl.id) continue;
        if (!candMeta.birthMs || candMeta.birthMs < oldMeta.birthMs + 72 * 3600 * 1000) continue;
        if (Math.abs(artMs - candMeta.birthMs) > 120 * 3600 * 1000) continue;
        const distinctCap = candMeta.capWords.filter(s => !oldMeta.headStems.has(s));
        if (distinctCap.length > 0 && !distinctCap.every(s => artAllStems.has(s))) continue;
        const distinctCandSpecAll = [...candMeta.specAll].filter(s => !oldMeta.headStems.has(s));
        const matchedDistinctAll = distinctCandSpecAll.filter(s => artAllStems.has(s)).length;
        if (distinctCandSpecAll.length > 0 && matchedDistinctAll < 1) continue;
        const shHead = [...artTitleStems].filter(s => candMeta.headStems.has(s)).length;
        const shSpecHead = [...artTitleStems].filter(s => candMeta.specHead.has(s)).length;
        const shSpecAll = [...artAllStems].filter(s => candMeta.specAll.has(s)).length;
        if (shSpecHead >= 1 && shSpecAll >= 2 && (shHead > oldHeadHits || shSpecHead > oldSpecHeadHits || oldSpecHeadHits <= 1 || matchedDistinctAll >= 2)) {
          const score = (shSpecHead * 12) + (shHead * 6) + (shSpecAll * 3) + (matchedDistinctAll * 8);
          if (score > bestNewScore) {
            bestNewScore = score;
            bestNewMeta = candMeta;
          }
        }
      }
      if (bestNewMeta && (keptCov.length + (oldCl.coverage.length - keptCov.length - 1)) >= 2) {
        const targetCl = bestNewMeta.cl;
        if (!targetCl.coverage.some(a => a.sourceId === art.sourceId)) {
          targetCl.coverage.push(art);
          targetCl.coverage.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
          targetCl.outletCount = targetCl.coverage.length;
        }
        modifiedOld = true;
        continue;
      }
      keptCov.push(art);
    }
    if (modifiedOld && keptCov.length >= 2) {
      oldCl.coverage = keptCov;
      oldCl.outletCount = keptCov.length;
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
    "visit","tour","trip","journey","travel","meet","host","welcom","arriv","depart","return","begin","start","conclud","deliver","rebuk","call","talk","speak","address","draw","gather","pastoral",
    "software","flaw","vulnerability","force","website","offline","across"
  ]);
  const NON_PROPER_HEADLINE_WORDS = new Set([
    ...UMBRELLA_OR_VERB_HEADLINE_WORDS,
    "win","lose","secur","full","control","majority","majoritie","deadlock","confirm","alleg","fraud","parliamentary",
    "election","elec","consult","govern","government","form","formation","urg","post","compromis","security","aid","opposition",
    "target","end","military","test","attack","drone","dron","ballistic","missile","missil","salvo","unidentifi",
    "projectile","projectil","outbreak","spread","internationally","clinical","two","three","four","five","vaccine","vaccin",
    "provincial","municipal","local","federal","national","regional","held","hold","vote","voter"
  ]);
  const getHeadlineProperAnchors = (story) => {
    const words = String(story || "").trim().split(/[\s\-–—]+/);
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
  const getConfirmedProperAnchors = (cl) => {
    const story = String(cl?.story || "");
    const summary = String(cl?.summary || "");
    const midCapStems = new Set();
    for (const sent of summary.split(/(?<=[.!?])\s+/)) {
      const words = sent.trim().split(/[\s\-–—]+/);
      for (let idx = 1; idx < words.length; idx++) {
        const clean = words[idx].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").replace(/'s$/i, "");
        if (clean.length >= 3 && /^[A-Z]/.test(clean)) {
          const lower = clean.toLowerCase().replace(/^uk$/, "britain").replace(/^us$/, "america");
          midCapStems.add(stemWord(lower));
        }
      }
    }
    const anchors = new Set();
    for (const rawW of story.trim().split(/[\s\-–—]+/)) {
      const clean = rawW.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "").replace(/'s$/i, "");
      const isAcronym = /^(?:[A-Z]{2,5})$/.test(clean);
      if ((clean.length >= 3 || isAcronym) && /^[A-Z]/.test(clean)) {
        const lower = clean.toLowerCase().replace(/^uk$/, "britain").replace(/^us$/, "america");
        const stemmed = stemWord(lower);
        if (
          !STOP_DEDUPE.has(lower) &&
          !GENERIC_EVENT_STEMS.has(lower) &&
          !GENERIC_EVENT_STEMS.has(stemmed) &&
          !NON_PROPER_HEADLINE_WORDS.has(lower) &&
          !NON_PROPER_HEADLINE_WORDS.has(stemmed)
        ) {
          if (!summary || isAcronym || midCapStems.has(stemmed)) {
            anchors.add(stemmed);
          }
        }
      }
    }
    return anchors;
  };
  const computeClusterDedupeMeta = (cl) => {
    const urls = new Set((cl.coverage || []).map(x => canonicalUrl(x.link)).filter(Boolean));
    const headStems = getStems(cl.story);
    const sumStems = getStems(`${cl.story} ${cl.summary}`);
    const domCov = getDominantCoverageTitleStems(cl);
    const headWithDom = new Set([...headStems, ...domCov]);
    const spec = new Set([...getStems(`${cl.story} ${cl.summary}`, GENERIC_EVENT_STEMS), ...[...domCov].filter(s => !GENERIC_EVENT_STEMS.has(s))]);
    const fullTextStems = getStems(`${cl.story} ${cl.summary} ${(cl.coverage || []).map(c => `${c.title} ${c.description}`).join(" ")}`);
    const nums = getHeadlineNumbers(cl.story);
    const proper = getHeadlineProperAnchors(cl.story);
    const confProper = getConfirmedProperAnchors(cl);
    const covItems = (cl.coverage || []).map(c => ({
      titleStems: getStems(c.title),
      ms: new Date(c.pubDate || 0).getTime()
    }));
    return { urls, headStems, sumStems, domCov, headWithDom, spec, fullTextStems, nums, proper, confProper, covItems };
  };

  const activeList = Array.from(byId.values()).sort((a, b) => ((b.coverage?.length || 0) - (a.coverage?.length || 0)) || ((b.version || 1) - (a.version || 1)));
  const metaMap = new Map();
  for (const cl of activeList) {
    metaMap.set(cl.id, computeClusterDedupeMeta(cl));
  }
  const absorbedIds = new Set();
  for (let i = 0; i < activeList.length; i++) {
    const primary = activeList[i];
    if (absorbedIds.has(primary.id)) continue;
    let mA = metaMap.get(primary.id);
    const urlsA = mA.urls;
    const properA = mA.proper;

    for (let j = i + 1; j < activeList.length; j++) {
      const secondary = activeList[j];
      if (absorbedIds.has(secondary.id)) continue;
      const mB = metaMap.get(secondary.id);
      let sharedUrls = 0;
      for (const u of mB.urls) { if (mA.urls.has(u)) sharedUrls++; }
      const minUrls = Math.min(mA.urls.size || 1, mB.urls.size || 1);
      const urlRatio = sharedUrls / minUrls;

      let shouldMerge = (sharedUrls >= 3) || (sharedUrls >= 2 && urlRatio >= 0.35);
      let isDualFacetOrUmbrellaTwin = false;
      if (!shouldMerge) {
        const sharedHead = countFuzzyOverlap(mA.headStems, mB.headStems);
        const sharedHeadDom = [...mA.headWithDom].filter(x => mB.headWithDom.has(x));
        const sharedSpec = [...mA.spec].filter(x => mB.spec.has(x));
        const unsharedConfA = [...mA.confProper].filter(p => !mB.confProper.has(p));
        const unsharedConfB = [...mB.confProper].filter(p => !mA.confProper.has(p));
        const hasConflictingConfProper =
          (unsharedConfA.length > 0 && !unsharedConfA.every(p => mB.fullTextStems.has(p))) ||
          (unsharedConfB.length > 0 && !unsharedConfB.every(p => mA.fullTextStems.has(p)));
        if (sharedUrls >= 1 && !hasConflictingConfProper && (sharedHead >= 1 || sharedHeadDom.length >= 2) && sharedSpec.length >= 2) {
          const sharedSum = countFuzzyOverlap(mA.sumStems, mB.sumStems);
          const sumContain = sharedSum / Math.min(mA.sumStems.size || 1, mB.sumStems.size || 1);
          if (sumContain >= 0.22) shouldMerge = true;
        }
        if (!shouldMerge && (sharedHead > 0 || sharedHeadDom.length >= 2)) {
          const headSim = sharedHead / Math.min(mA.headStems.size || 1, mB.headStems.size || 1);
          const sharedSum = countFuzzyOverlap(mA.sumStems, mB.sumStems);
          const sumJac = sharedSum / Math.max(1, mA.sumStems.size + mB.sumStems.size - sharedSum);
          const sumContain = sharedSum / Math.min(mA.sumStems.size || 1, mB.sumStems.size || 1);

          if ((headSim >= 0.80 && sharedHead >= 3 && sumJac >= 0.35) || (headSim >= 0.75 && sharedHead >= 3 && sumJac >= 0.25)) {
            shouldMerge = true;
          }
          // Law 1A-bis: Dual-Facet (Market/Leak vs. Substantive Release) & Umbrella-vs-Specific Twin Consolidation
          if (!shouldMerge && sharedHeadDom.length >= 2) {
            const hasConflictingNums = mA.nums.size > 0 && mB.nums.size > 0 && ![...mA.nums].some(n => mB.nums.has(n));
            if (!hasConflictingNums) {
              const unsharedProperA = [...mA.proper].filter(p => !mB.proper.has(p));
              const unsharedProperB = [...mB.proper].filter(p => !mA.proper.has(p));
              const hasConflictingProper =
                (unsharedProperA.length > 0 && !unsharedProperA.every(p => mB.fullTextStems.has(p))) ||
                (unsharedProperB.length > 0 && !unsharedProperB.every(p => mA.fullTextStems.has(p)));
              if (!hasConflictingProper) {
                const specContain = sharedSpec.length / Math.min(mA.spec.size || 1, mB.spec.size || 1);
                let covBridgePairs = 0;
                for (const ca of mA.covItems) {
                  for (const cb of mB.covItems) {
                    const sh = [...ca.titleStems].filter(x => cb.titleStems.has(x));
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
          // Law 1A-quater: Confirmed-Entity & Bidirectional Full-Text / Embedded-Article Twin Consolidation
          if (!shouldMerge && sharedHead >= 1 && mA.headStems.size >= 3 && mB.headStems.size >= 3) {
            const hasConflictingNums = mA.nums.size > 0 && mB.nums.size > 0 && ![...mA.nums].some(n => mB.nums.has(n));
            const hasElectionScopeMismatch =
              ((mA.headStems.has("provincial") || mA.headStems.has("federal") || mA.headStems.has("national")) && mB.headStems.has("municipal")) ||
              ((mB.headStems.has("provincial") || mB.headStems.has("federal") || mB.headStems.has("national")) && mA.headStems.has("municipal"));

            if (!hasConflictingNums && !hasElectionScopeMismatch) {
              const unsharedConfA = [...mA.confProper].filter(p => !mB.confProper.has(p));
              const unsharedConfB = [...mB.confProper].filter(p => !mA.confProper.has(p));
              const aConfInFullB = unsharedConfA.length === 0 || unsharedConfA.every(p => mB.fullTextStems.has(p));
              const bConfInFullA = unsharedConfB.length === 0 || unsharedConfB.every(p => mA.fullTextStems.has(p));
              const hasConflictingConfProper = !aConfInFullB || !bConfInFullA;
              const hasMutualUnsharedConfProper = !aConfInFullB && !bConfInFullA;

              const headBInSumA = [...mB.headStems].filter(s => mA.sumStems.has(s)).length / mB.headStems.size;
              const headAInFullB = [...mA.headStems].filter(s => mB.fullTextStems.has(s)).length / mA.headStems.size;
              const headBInFullA = [...mB.headStems].filter(s => mA.fullTextStems.has(s)).length / mB.headStems.size;

              let anyBridgePairs3 = 0;
              let sameDayBridgePairs = 0;
              for (const ca of mA.covItems) {
                for (let idxB = 0; idxB < mB.covItems.length; idxB++) {
                  const cb = mB.covItems[idxB];
                  const sh = [...ca.titleStems].filter(x => cb.titleStems.has(x));
                  if (sh.length >= 3) {
                    anyBridgePairs3++;
                    const specSh = sh.filter(x => !GENERIC_EVENT_STEMS.has(x));
                    if (ca.ms > 0 && cb.ms > 0 && Math.abs(ca.ms - cb.ms) <= 24 * 3600 * 1000) {
                      if ((sh.length >= 4 && specSh.length >= 1) || (sh.length >= 3 && specSh.length >= 2)) {
                        sameDayBridgePairs++;
                      }
                    }
                  }
                }
              }

              const embeddedMatchesInA = mA.covItems.filter(ca => {
                const sh = [...mB.headStems].filter(s => ca.titleStems.has(s)).length;
                return sh >= 3 && (sh / mB.headStems.size) >= 0.75;
              }).length;

              const isosA = extractTextCountryIsos(`${primary.story || ""} ${primary.summary || ""}`);
              const isosB = extractTextCountryIsos(`${secondary.story || ""} ${secondary.summary || ""}`);
              const hasCountryMismatch = isosA.size > 0 && isosB.size > 0 &&
                (![...isosA].some(c => isosB.has(c)) || ![...isosB].some(c => isosA.has(c)));

              if (!hasConflictingConfProper) {
                if (
                  sharedHead >= 3 &&
                  anyBridgePairs3 >= 1 &&
                  ((headAInFullB >= 0.65 && headBInFullA >= 0.65) || (Math.max(headAInFullB, headBInFullA) >= 0.85 && Math.min(headAInFullB, headBInFullA) >= 0.55) || (Math.max(headAInFullB, headBInFullA) >= 0.55 && sumContain >= 0.28)) &&
                  (sumJac >= 0.12 || sumContain >= 0.24)
                ) {
                  shouldMerge = true;
                } else if (
                  sharedHead >= 3 &&
                  sameDayBridgePairs >= 4 &&
                  anyBridgePairs3 >= 8 &&
                  Math.max(headAInFullB, headBInFullA) >= 0.70 &&
                  Math.min(headAInFullB, headBInFullA) >= 0.55 &&
                  !hasCountryMismatch
                ) {
                  shouldMerge = true;
                } else if (
                  sharedHead >= 2 &&
                  anyBridgePairs3 >= 1 &&
                  headAInFullB >= 0.70 &&
                  headBInFullA >= 0.80 &&
                  (sumJac >= 0.18 || sumContain >= 0.34)
                ) {
                  shouldMerge = true;
                } else if (embeddedMatchesInA >= 1 && headBInSumA >= 0.75 && mB.covItems.length <= 6 && sumContain >= 0.40) {
                  shouldMerge = true;
                } else if (sharedHead >= 2 && sameDayBridgePairs >= 2 && mB.covItems.length <= 6 && sumContain >= 0.28) {
                  shouldMerge = true;
                }
              } else if (!hasCountryMismatch && (!hasMutualUnsharedConfProper || (isosA.size > 0 && isosB.size > 0 && [...isosA].every(c => isosB.has(c)) && [...isosB].every(c => isosA.has(c))))) {
                // Sub-region / secondary-role twin recovery (e.g. Najib Razak + AG review, BC North Island Storms,
                // US-Iran Geneva talks, Paraguay Peña impeachment + Itaipu, Flávio Bolsonaro, Democrats Jeffries/Schumer)
                const birthA = getClusterBirthMs(primary);
                const birthB = getClusterBirthMs(secondary);
                const closeBirth = birthA > 0 && birthB > 0 && Math.abs(birthA - birthB) <= 144 * 3600 * 1000;
                const sharedRareSpec = [...mA.spec].filter(x => mB.spec.has(x) && !mA.headStems.has(x) && (clusterStemDf.get(x) || 0) <= 5).length;
                if (closeBirth && sameDayBridgePairs >= 3 && sharedHead >= 2 && sumContain >= 0.25) {
                  shouldMerge = true;
                } else if (closeBirth && sharedHead >= 3 && sumContain >= 0.28 && (anyBridgePairs3 >= 1 || Math.min(mA.covItems.length, mB.covItems.length) <= 4)) {
                  shouldMerge = true;
                } else if (closeBirth && sharedHead >= 2 && anyBridgePairs3 >= 1 && sumContain >= 0.28 && sharedRareSpec >= 1) {
                  shouldMerge = true;
                } else if (closeBirth && sharedHead >= 1 && sameDayBridgePairs >= 1 && mB.covItems.length <= 4 && sumContain >= 0.32 && sharedSpec.length >= 4 && Math.max(headAInFullB, headBInFullA) >= 0.60) {
                  shouldMerge = true;
                }
              }
            }
          }
        }
      }

      if (shouldMerge) {
        const priBirthMs = getClusterBirthMs(primary);
        const secBirthMs = getClusterBirthMs(secondary);
        const getMedianPubMs = (cl, fallbackMs) => {
          const times = (cl.coverage || []).map(a => Date.parse(a?.pubDate || "") || 0).filter(t => t > 0).sort((a, b) => a - b);
          if (times.length === 0) return fallbackMs || 0;
          return times[Math.floor(times.length / 2)];
        };
        const priMedMs = getMedianPubMs(primary, priBirthMs);
        const secMedMs = getMedianPubMs(secondary, secBirthMs);
        const priLatestMs = Math.max(...(primary.coverage || []).map(a => Date.parse(a?.pubDate || "") || 0), priBirthMs);
        const secLatestMs = Math.max(...(secondary.coverage || []).map(a => Date.parse(a?.pubDate || "") || 0), secBirthMs);

        absorbedIds.add(secondary.id);
        byId.delete(secondary.id);
        const oldPrimaryId = primary.id;
        const oldPrimaryStory = primary.story;
        const oldPrimarySummary = primary.summary;
        const seenKeysSet = new Set([...(primary.seenArticleKeys || []), ...(secondary.seenArticleKeys || [])]); for (const a of [...(primary.coverage || []), ...(secondary.coverage || [])]) { if (a?.link) seenKeysSet.add(canonicalUrl(a.link)); if (a?.title) seenKeysSet.add(cleanHeadlineTitle(a.title)); } primary.seenArticleKeys = Array.from(seenKeysSet).slice(-500);
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

        // Preserve chronological evolution history across merged twin clusters when separated by >= 2 hours with distinct headlines
        const priIsOnsetHeadline = /\b(begins?|starts?|sets?\s+off|embarks?|kicks?\s+off|arrives?\s+in)\b/i.test(primary.story || "") &&
          !/\b(begins?|starts?|sets?\s+off|embarks?|kicks?\s+off)\b/i.test(secondary.story || "");
        const secIsNewerPhase = (priIsOnsetHeadline && secMedMs >= priMedMs) ||
          (secMedMs > 0 && priMedMs > 0 && (secMedMs - priMedMs) >= 12 * 3600 * 1000) ||
          (secBirthMs > priBirthMs && (secMedMs >= priMedMs - 6 * 3600 * 1000));
        const spanHours = (priBirthMs > 0 && secBirthMs > 0)
          ? Math.max(Math.abs(priBirthMs - secBirthMs), Math.abs(priMedMs - secMedMs)) / 3600000
          : 0;
        const olderCl = secIsNewerPhase ? primary : ((secBirthMs > 0 && priBirthMs > 0 && secBirthMs < priBirthMs) ? secondary : primary);
        const newerCl = olderCl === secondary ? primary : secondary;
        const oldHStems = getStems(olderCl.story);
        const newHStems = getStems(newerCl.story);
        const mergeHSim = countFuzzyOverlap(oldHStems, newHStems) / Math.max(1, Math.min(oldHStems.size || 1, newHStems.size || 1));

        if (!Array.isArray(primary.evolutionHistory) || primary.evolutionHistory.length === 0) {
          primary.evolutionHistory = [{
            version: 1,
            type: 'initial',
            timestamp: new Date(Math.min(priBirthMs || Date.now(), secBirthMs || Date.now())).toISOString(),
            headline: spanHours >= 2 ? olderCl.story : primary.story,
            summary: spanHours >= 2 ? (olderCl.summary || primary.summary) : primary.summary,
            outletCount: olderCl.outletCount || 2,
            note: 'Initial cluster formation on the wire'
          }];
        } else if (spanHours >= 2 && olderCl === secondary && mergeHSim < 0.78) {
          primary.evolutionHistory[0] = {
            version: 1,
            type: 'initial',
            timestamp: new Date(secBirthMs).toISOString(),
            headline: secondary.story,
            summary: secondary.summary || primary.evolutionHistory[0].summary,
            outletCount: secondary.outletCount || 2,
            note: 'Initial cluster formation on the wire'
          };
        }
        if (Array.isArray(secondary.evolutionHistory)) {
          const existingNotes = new Set(primary.evolutionHistory.map(h => String(h?.note || "").toLowerCase().trim()));
          for (const sh of secondary.evolutionHistory) {
            if (!sh || sh.type === 'initial') continue;
            const nk = String(sh.note || "").toLowerCase().trim();
            if (nk && !existingNotes.has(nk)) {
              existingNotes.add(nk);
              primary.evolutionHistory.push({ ...sh });
            }
          }
        }
        if (!Array.isArray(primary.evolvedFromIds)) primary.evolvedFromIds = [];
        if (secondary.id && secondary.id !== primary.id && !primary.evolvedFromIds.includes(secondary.id)) {
          primary.evolvedFromIds.push(secondary.id);
        }
        if (Array.isArray(secondary.evolvedFromIds)) {
          for (const eid of secondary.evolvedFromIds) {
            if (eid && eid !== primary.id && !primary.evolvedFromIds.includes(eid)) primary.evolvedFromIds.push(eid);
          }
        }
        if (spanHours >= 2 && mergeHSim < 0.78) {
          // If secondary was the newer phase and had substantial multi-outlet coverage (>= 5 outlets and >= 45% of primary size, or >= 3 outlets when primary was an onset headline), advance primary's headline
          const secIsConclusionPhase = /\b(concludes?|wraps?\s+up|completes?|ends?\s+visit)\b/i.test(secondary.story || "");
          const secCovCount = (secondary.coverage || []).length;
          const priOrigCount = Math.max(2, primary.outletCount - secCovCount);
          if (newerCl === secondary && ((secCovCount >= 5 && secCovCount >= priOrigCount * 0.45) || (priIsOnsetHeadline && secCovCount >= 3))) {
            primary.story = secondary.story;
            const newSlug = slugify(secondary.story);
            if (newSlug && newSlug !== primary.id) {
              if (!primary.evolvedFromIds.includes(primary.id)) primary.evolvedFromIds.push(primary.id);
              byId.delete(primary.id);
              primary.id = newSlug;
              byId.set(primary.id, primary);
            }
            const firstSent = String(secondary.summary || "").split(/(?<=[.!?])\s+/)[0].trim();
            if (firstSent && !String(primary.summary || "").toLowerCase().includes(firstSent.slice(0, 28).toLowerCase())) {
              primary.summary = `${firstSent} ${String(primary.summary || "").trim()}`.trim();
            }
          } else if (newerCl === secondary && (secondary.coverage || []).length >= 3 && (secIsConclusionPhase || secMedMs > priMedMs + 4 * 3600 * 1000)) {
            const firstSent = String(secondary.summary || "").split(/(?<=[.!?])\s+/)[0].trim();
            if (firstSent && !String(primary.summary || "").toLowerCase().includes(firstSent.slice(0, 28).toLowerCase())) {
              primary.summary = `${String(primary.summary || "").trim()} ${firstSent}`.trim();
              const shiftTs = new Date(Math.max(priLatestMs, secLatestMs)).toISOString();
              const shiftNote = `${secondary.story} — ${firstSent}`;
              const alreadyHasNote = primary.evolutionHistory.some(h => String(h?.note || "").toLowerCase().includes(firstSent.slice(0, 24).toLowerCase()));
              if (!alreadyHasNote) {
                primary.evolutionHistory.push({
                  version: primary.version || 1,
                  type: 'clarification',
                  timestamp: shiftTs,
                  headline: primary.story,
                  summary: primary.summary,
                  beforeStory: primary.story,
                  beforeSummary: oldPrimarySummary,
                  outletCount: primary.outletCount,
                  note: shiftNote
                });
                primary.lastDevelopedAt = shiftTs;
                primary.developmentNote = shiftNote;
              }
            }
          }
          const targetStory = primary.story;
          const alreadyHasTargetStep = primary.evolutionHistory.slice(1).some(
            h => String(h?.headline || "").toLowerCase() === String(targetStory || "").toLowerCase()
          );
          if (!alreadyHasTargetStep && String(primary.evolutionHistory[0]?.headline || "").toLowerCase() !== String(targetStory || "").toLowerCase()) {
            const shiftTs = new Date(Math.max(priBirthMs, secBirthMs, newerCl === secondary ? secLatestMs : priLatestMs)).toISOString();
            const firstNewSent = String(newerCl.summary || primary.summary || "").split(/(?<=[.!?])\s+/)[0].trim();
            const shiftNote = newerCl.developmentNote || firstNewSent || `Coverage expanded and shifted to: ${targetStory}`;
            const nextV = (primary.evolutionHistory.length || 1) + 1;
            primary.evolutionHistory.push({
              version: nextV,
              type: 'material_shift',
              timestamp: shiftTs,
              headline: targetStory,
              summary: primary.summary,
              beforeStory: olderCl.story || oldPrimaryStory,
              beforeSummary: olderCl.summary || oldPrimarySummary,
              outletCount: primary.outletCount,
              note: shiftNote
            });
            primary.version = nextV;
            primary.lastDevelopedAt = shiftTs;
            primary.developmentNote = shiftNote;
          }
        }
        // Recompute mA so subsequent twin/phase candidates in the same loop see primary's newly merged coverage and updated headline
        mA = computeClusterDedupeMeta(primary);
        metaMap.set(primary.id, mA);

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
        mA = computeClusterDedupeMeta(primary);
        metaMap.set(primary.id, mA);
      }
    }
  }

  // 2b-bis. Strict Cross-Cluster Single-Owner URL & Headline Pass:
  // Ensure no article URL or cleaned article title ever appears inside two active clusters simultaneously.
  const urlOwners = new Map();
  const titleOwners = new Map();
  for (const cl of byId.values()) {
    const clStems = getStems(`${cl.story || ""} ${cl.summary || ""} ${(cl.evolvedFromIds || []).join(" ").replace(/-/g, " ")}`);
    const clHeadStems = getStems(cl.story || "");
    const clIsos = extractTextCountryIsos(`${cl.story || ""} ${cl.summary || ""}`);
    for (const art of (cl.coverage || [])) {
      const u = canonicalUrl(art?.link);
      const t = cleanHeadlineTitle(art?.title);
      const artStems = getStems(`${art?.title || ""} ${art?.description || ""}`);
      const artIsos = extractTextCountryIsos(`${art?.title || ""} ${art?.description || ""}`);
      const countryBonus = (artIsos.size > 0 && clIsos.size > 0)
        ? ([...artIsos].some(c => clIsos.has(c)) ? 20 : -25)
        : 0;
      const fitScore = ([...artStems].filter(s => clHeadStems.has(s)).length * 5) +
        ([...artStems].filter(s => clStems.has(s)).length * 2) +
        countryBonus +
        Math.min(cl.coverage.length, 10) * 0.1;
      if (u) {
        const prev = urlOwners.get(u);
        if (!prev || fitScore > prev.fitScore) urlOwners.set(u, { clId: cl.id, fitScore });
      }
      if (t && t.length >= 18) {
        const prev = titleOwners.get(t);
        if (!prev || fitScore > prev.fitScore) titleOwners.set(t, { clId: cl.id, fitScore });
      }
    }
  }
  for (const cl of byId.values()) {
    if (!Array.isArray(cl.coverage) || cl.coverage.length <= 2) continue;
    const dedupCov = [];
    for (const art of cl.coverage) {
      const u = canonicalUrl(art?.link);
      const t = cleanHeadlineTitle(art?.title);
      const uOwner = u ? urlOwners.get(u)?.clId : cl.id;
      const tOwner = (t && t.length >= 18) ? titleOwners.get(t)?.clId : cl.id;
      if ((uOwner && uOwner !== cl.id) || (tOwner && tOwner !== cl.id)) {
        if (dedupCov.length + (cl.coverage.length - cl.coverage.indexOf(art) - 1) >= 2) {
          continue;
        }
      }
      dedupCov.push(art);
    }
    if (dedupCov.length >= 2 && dedupCov.length !== cl.coverage.length) {
      cl.coverage = dedupCov;
      cl.outletCount = dedupCov.length;
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
    "wildfire","wildfires","fire","fires","blaze","blazes","wind","winds","flame","flames","burn","burns","home","homes","storm","storms","flood","floods",
    "manhattan","midtown","brooklyn","queens","chicago","houston","miami","seattle","boston","edmonton","calgary","montreal","toronto","vancouver",
    "sydney","melbourne","perth","brisbane","adelaide","auckland","osaka","shanghai","shenzhen","mumbai","bengaluru","lahore","karachi","istanbul"
  ];
  const EXPORT_SUBNATIONAL_TO_ISO = [
    ['us', /\b(california|southern california|texas|florida|new york|nyc|manhattan|brooklyn|chicago|washington|pentagon)\b/i],
    ['gb', /\b(england|scotland|wales|london|downing street|westminster|conservatives|tories|labour party|scotland yard)\b/i],
    ['ca', /\b(ottawa|toronto|quebec|vancouver|edmonton|alberta|ontario|british columbia)\b/i],
    ['au', /\b(sydney|melbourne|canberra|queensland|nsw|perth|victoria)\b/i],
    ['id', /\b(jakarta|sulawesi|sumatra|bali|prabowo)\b/i],
    ['my', /\b(kuala lumpur)\b/i],
    ['fr', /\b(paris|macron)\b/i],
    ['de', /\b(berlin|munich|leipzig|frankfurt)\b/i],
    ['ru', /\b(moscow|kremlin|putin)\b/i],
    ['ua', /\b(kyiv|zelensky)\b/i],
    ['il', /\b(jerusalem|tel aviv|netanyahu|idf)\b/i],
    ['ps', /\b(gaza|west bank|hamas)\b/i],
    ['ir', /\b(tehran)\b/i],
    ['cn', /\b(beijing|shanghai)\b/i],
    ['in', /\b(new delhi|mumbai|modi|rahul gandhi)\b/i],
    ['tz', /\b(dar es salaam|dodoma|tundu lissu)\b/i],
    ['ke', /\b(nairobi|mombasa|shakahola)\b/i],
    ['br', /\b(brasilia|sao paulo|rio de janeiro|lula|bolsonaro)\b/i],
    ['jp', /\b(tokyo|osaka)\b/i]
  ];
  const detectExportCountries = (txt) => {
    const out = extractTextCountryIsos(txt);
    const s = String(txt || '');
    for (const [iso, re] of EXPORT_SUBNATIONAL_TO_ISO) {
      if (re.test(s)) out.add(iso);
    }
    return out;
  };
  const INCIDENT_MECHANISM_CLASSES = [
    ['firearm', /\b(shoot\w*|shot\b|gunman|gunmen|gunfire|firearm\w*|sniper\w*)\b/i],
    ['bladed', /\b(stabb\w+|knif\w+|machete\w*|slash\w+)\b/i],
    ['vehicular_crash', /\b(car\s+crash\w*|truck\s+crash\w*|highway\s+crash\w*|train\s+crash\w*|train\s+collis\w*|derail\w*|plane\s+crash\w*|helicopt\w*\s+crash\w*|bus\s+crash\w*)\b/i],
    ['maritime_sinking', /\b(boat\s+sink\w*|boat\s+capsiz\w*|ferry\s+sink\w*|shipwreck\w*|drown\w*)\b/i],
    ['neglect_starvation', /\b(malnutrit\w*|starvat\w*|dehydrat\w*)\b/i],
    ['fire_explosion', /\b(wildfire\w*|house\s+fire\w*|building\s+fire\w*|base\s+fire\w*|inferno|arson)\b/i],
    ['seismic_volcanic', /\b(earthquak\w*|temblor|tsunami\w*|volcan\w*)\b/i]
  ];
  const hasDisjointIncidentMechanism = (headA = '', headB = '', textA = '', textB = '') => {
    if (!headA || !headB) return false;
    const mechHeadA = INCIDENT_MECHANISM_CLASSES.filter(([, re]) => re.test(headA)).map(([k]) => k);
    const mechHeadB = INCIDENT_MECHANISM_CLASSES.filter(([, re]) => re.test(headB)).map(([k]) => k);
    if (mechHeadA.length === 0 || mechHeadB.length === 0) return false;
    if (mechHeadA.some(k => mechHeadB.includes(k))) return false;
    const fullA = `${headA} ${textA || ''}`;
    const fullB = `${headB} ${textB || ''}`;
    const mechFullA = new Set(INCIDENT_MECHANISM_CLASSES.filter(([, re]) => re.test(fullA)).map(([k]) => k));
    const mechFullB = new Set(INCIDENT_MECHANISM_CLASSES.filter(([, re]) => re.test(fullB)).map(([k]) => k));
    return !mechHeadA.some(k => mechFullB.has(k)) && !mechHeadB.some(k => mechFullA.has(k));
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
        const sharedHead = [...artStems].filter(s => headStems.has(s)).length;
        const sharedDomCov = [...artStems].filter(s => domCov.has(s)).length;
        const sharedTotal = [...artStems].filter(s => anchorStems.has(s)).length;
        if (clusterCountries.size > 0) {
          const artCountries = detectExportCountries(artText);
          if (artCountries.size > 0 && ![...artCountries].some(c => clusterCountries.has(c)) && sharedSpecHead < 2) {
            return false;
          }
        }
        // Universal Disjoint Incident-Mechanism Guard: strip articles reporting a mutually exclusive physical incident mechanism (e.g. stabbing vs shooting, starvation vs murder, crash vs fire)
        if (hasDisjointIncidentMechanism(cl.story || '', art.title || '', cl.summary || '', art.description || '') && sharedSpecHead <= 1) {
          return false;
        }
        // Universal Zero-Headline-Anchor Outlier Gate for multi-outlet clusters
        if (cov.length >= 4 && headStems.size >= 3 && sharedHead === 0 && sharedDomCov === 0 && sharedSpec <= 1) {
          return false;
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

    // Normalize all evolutionHistory entries (legacy `.story` -> `.headline`, missing `.summary`/`.version`/`.timestamp`)
    // and strip contaminated steps (including step[0] if merged from an unrelated story like Leipzig Airport inside Eagle's Nest, or Iran Peace Talks inside Ukraine Oleshky Truce)
    if (Array.isArray(cl.evolutionHistory) && cl.evolutionHistory.length > 0) {
      const birthIso = cl.firstSeenAt || (cl.coverage?.[cl.coverage.length - 1]?.pubDate ? new Date(cl.coverage[cl.coverage.length - 1].pubDate).toISOString() : new Date().toISOString());
      cl.evolutionHistory = cl.evolutionHistory.filter(Boolean).map((h, idx) => {
        const normHeadline = String(h.headline || h.story || (idx === 0 ? (h.beforeStory || cl.story) : cl.story) || cl.story).trim();
        const normSummary = String(h.summary || (idx === 0 ? (h.beforeSummary || h.note || cl.summary) : (h.note || cl.summary)) || cl.summary || '').trim();
        const normTs = h.timestamp || h.at || (idx === 0 ? birthIso : (cl.lastDevelopedAt || birthIso));
        const normVer = typeof h.version === 'number' && !isNaN(h.version) ? h.version : (idx === 0 ? 1 : (cl.version || 1));
        return {
          ...h,
          version: normVer,
          type: idx === 0 ? 'initial' : (h.type === 'material_shift' ? 'material_shift' : 'clarification'),
          timestamp: normTs,
          headline: normHeadline,
          summary: normSummary,
          outletCount: typeof h.outletCount === 'number' ? h.outletCount : (cl.outletCount || 2),
          note: h.note || (idx === 0 ? 'Initial cluster formation on the wire' : `Updated: ${normHeadline}`)
        };
      });

      if (cl.evolutionHistory.length > 1 && specAnchorStems.size >= 2) {
        const allCovStems = getStems((cl.coverage || []).map(a => `${a.title || ''} ${a.description || ''}`).join(' '));
        const filteredHist = [];
        for (let idx = 0; idx < cl.evolutionHistory.length; idx++) {
          const h = cl.evolutionHistory[idx];
          const stepText = `${h.headline || ''} ${h.summary || ''} ${h.note || ''}`;
          const stepStems = getStems(stepText);
          const stepHeadStems = getStems(h.headline || '');
          const stepSpecHits = [...stepStems].filter(s => specAnchorStems.has(s)).length;
          const stepCountries = detectExportCountries(`${h.headline || ''} ${h.summary || ''}`);
          const stepHeadCountries = detectExportCountries(h.headline || '');
          const headCountries = detectExportCountries(cl.story || '');
          const hasStepCountryConflict = (clusterCountries.size > 0 && stepCountries.size > 0 &&
            ![...stepCountries].some(c => clusterCountries.has(c)) &&
            [...stepStems].filter(s => specHeadStems.has(s)).length === 0) ||
            (stepHeadCountries.size > 0 && ![...stepHeadCountries].some(c => headCountries.has(c)) &&
             [...stepHeadStems].filter(s => headStems.has(s)).length === 0);

          if (hasStepCountryConflict) continue;
          if (idx === 0) {
            if (stepSpecHits === 0 && cl.evolutionHistory.length > 1) {
              // Step[0] was contaminated from an unrelated cluster (e.g. Leipzig Airport inside Eagle's Nest);
              // reconstruct true initial step from step[1].beforeStory / beforeSummary if available
              const nextH = cl.evolutionHistory[1];
              if (nextH && (nextH.beforeStory || nextH.beforeSummary)) {
                filteredHist.push({
                  version: 1,
                  type: 'initial',
                  timestamp: h.timestamp || birthIso,
                  headline: nextH.beforeStory || cl.story,
                  summary: nextH.beforeSummary || cl.summary,
                  outletCount: h.outletCount || 2,
                  note: 'Initial cluster formation on the wire'
                });
              }
              continue;
            }
            filteredHist.push(h);
            continue;
          }
          if (h.type === 'clarification' && h.note) {
            const noteStems = getStems(h.note);
            if (noteStems.size > 0) {
              const noteInCovOrAnchor = [...noteStems].filter(s => allCovStems.has(s) || anchorStems.has(s)).length;
              const sharedSpec = Math.max(
                [...noteStems].filter(s => specAnchorStems.has(s)).length,
                noteInCovOrAnchor >= 2 ? stepSpecHits : 0
              );
              const sharedTotal = Math.max(
                [...noteStems].filter(s => anchorStems.has(s)).length,
                noteInCovOrAnchor >= 2 ? [...stepStems].filter(s => anchorStems.has(s)).length : 0
              );
              if (sharedSpec === 0 || noteInCovOrAnchor === 0) continue;
              if (headStems.size >= 3 && anchorStems.size >= 6 && sharedTotal <= 1 && sharedSpec <= 1) continue;
            }
          }
          filteredHist.push(h);
        }
        if (filteredHist.length > 0) {
          filteredHist[0].type = 'initial';
          filteredHist[0].version = 1;
          cl.evolutionHistory = filteredHist;
        }
      }
    }

    // Sanitize evolvedFromIds to strip false/contaminated ancestor slugs from unrelated stories
    if (Array.isArray(cl.evolvedFromIds) && cl.evolvedFromIds.length > 0) {
      const allClTextStems = getStems(`${cl.story || ''} ${cl.summary || ''} ${(cl.coverage || []).map(a => a.title || '').join(' ')}`);
      const clSpecPool = new Set([...allClTextStems].filter(s => !BROAD_BEAT_STEMS.has(s)));
      cl.evolvedFromIds = cl.evolvedFromIds.filter(oldId => {
        if (!oldId || oldId === cl.id) return false;
        const oldText = String(oldId).replace(/-/g, ' ');
        const oldCountries = detectExportCountries(oldText);
        if (clusterCountries.size > 0 && oldCountries.size > 0 && ![...oldCountries].some(c => clusterCountries.has(c))) {
          return false;
        }
        const oldStems = getStems(oldText);
        const oldSpec = [...oldStems].filter(s => !BROAD_BEAT_STEMS.has(s));
        const sharedSpec = oldSpec.filter(s => clSpecPool.has(s)).length;
        const sharedInStoryOrSum = [...oldStems].filter(s => anchorStems.has(s)).length;
        return sharedSpec >= 1 && sharedInStoryOrSum >= 1;
      });
      if (cl.evolvedFromIds.length === 0) delete cl.evolvedFromIds;
    }
  }

  // 3. First-Principles Novel-Delta Coverage, Baseline-Echo Deduplication & Stripped-Shift Recovery for evolutionHistory
  let updatesLogEntries = [];
  let archiveLookup = new Map();
  try {
    const uLogPath = path.join(__dirname, '..', 'data', 'cluster-updates-log.json');
    if (fs.existsSync(uLogPath)) {
      const rawLog = JSON.parse(fs.readFileSync(uLogPath, 'utf8'));
      if (Array.isArray(rawLog)) updatesLogEntries = rawLog;
    }
    const archPath = path.join(__dirname, '..', 'data', 'clusters-archive.json');
    if (fs.existsSync(archPath)) {
      const rawArch = JSON.parse(fs.readFileSync(archPath, 'utf8'));
      const list = Array.isArray(rawArch) ? rawArch : (Array.isArray(rawArch?.clusters) ? rawArch.clusters : Object.values(rawArch?.clusters || {}));
      for (const item of list) {
        if (item && item.id) archiveLookup.set(item.id, item);
      }
    }
  } catch (_) {}

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
      const baseText = (initStep?.headline || '') + ' ' + (initStep?.summary || '');
      const baseStems = new Set(extractEvoDeltaStems(baseText));
      const headlineStems = new Set([...baseStems, ...extractEvoDeltaStems(initStep?.headline || '')]);
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

        const prevKept = cleanHist[cleanHist.length - 1];
        const prevHeadStems = getStems(prevKept?.headline || initStep?.headline || '');
        const currHeadStems = getStems(h.headline || '');
        const headOverlapWithPrev = prevHeadStems.size > 0
          ? [...currHeadStems].filter(s => prevHeadStems.has(s)).length / Math.max(prevHeadStems.size, currHeadStems.size)
          : 1;
        const introducesHeadlineShift = Boolean(
          h.headline &&
          prevKept?.headline &&
          h.headline.toLowerCase().trim() !== prevKept.headline.toLowerCase().trim() &&
          headOverlapWithPrev < 0.85
        );

        if (!introducesHeadlineShift && h.type === 'clarification' && hNovelNums.length === 0 && hNovel.length <= 1) {
          continue;
        }
        // Unified Cumulative Information-Gain Gate: if a step introduces zero new numbers against prior history
        // and >=75% of its stems are already present in initStep + prior steps (with <=2 novel stems), skip it
        // (NEVER strip a step that introduces a genuine headline shift!)
        if (!introducesHeadlineShift && hCumulNovelNums.length === 0 && hStems.length >= 4 && hCumulNovel.length <= 2 && (hCumulNovel.length / hStems.length) <= 0.25) {
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

      cl.evolutionHistory = cleanHist;
    }

    // 3b. Recover stripped shift steps & enforce strict Headline-History Co-Change Invariant:
    // - If a cluster's `evolutionHistory` has only 1 step (`cleanHist.length === 1`), check if either:
    //   (a) `cleanHist[0].headline !== cl.story`, OR
    //   (b) `cl.evolvedFromIds` / `cluster-updates-log.json` / `clusters-archive.json` shows `cl.story` evolved from an earlier headline >= 2h after birth.
    // - Always guarantee `cl.evolutionHistory[last].headline === cl.story`.
    const covTimes = (cl.coverage || []).map(a => Date.parse(a?.pubDate || '')).filter(t => !isNaN(t) && t > 0);
    const earliestCovMs = covTimes.length > 0 ? Math.min(...covTimes) : Date.now();
    const latestCovMs = covTimes.length > 0 ? Math.max(...covTimes) : earliestCovMs;
    if (!Array.isArray(cl.evolutionHistory) || cl.evolutionHistory.length === 0) {
      cl.evolutionHistory = [{
        version: 1,
        type: 'initial',
        timestamp: cl.firstSeenAt || new Date(earliestCovMs).toISOString(),
        headline: cl.story,
        summary: cl.summary || '',
        outletCount: cl.outletCount || 2,
        note: 'Initial cluster formation on the wire'
      }];
    }
    const humanizeSlug = (slug) => {
      const ACRONYMS = { us: 'US', uk: 'UK', eu: 'EU', un: 'UN', uae: 'UAE', fbi: 'FBI', doj: 'DOJ', idf: 'IDF', g7: 'G7', f1: 'F1', ai: 'AI', ceo: 'CEO', pm: 'PM', gop: 'GOP', cop31: 'COP31', cbd: 'CBD', uefa: 'UEFA', fifa: 'FIFA' };
      const LOWER = new Set(['a','an','the','in','on','at','to','for','of','and','or','by','with','from','over','amid','after','into']);
      return String(slug || '').split('-').filter(Boolean).map((w, idx) => {
        if (ACRONYMS[w]) return ACRONYMS[w];
        if (idx > 0 && LOWER.has(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join(' ');
    };
    const sortedCovAsc = [...(cl.coverage || [])].sort((a, b) => (Date.parse(a?.pubDate || '') || 0) - (Date.parse(b?.pubDate || '') || 0));
    const earliestArt = sortedCovAsc[0];
    const buildDistinctInitialSummary = (initHead) => {
      if (earliestArt && earliestArt.description && earliestArt.description.trim().length >= 40 && earliestArt.description.trim() !== String(cl.summary || '').trim()) {
        return earliestArt.description.trim();
      }
      const firstSent = String(cl.summary || '').split(/(?<=[.!?])\s+/)[0].trim();
      if (firstSent && firstSent.length < String(cl.summary || '').trim().length) {
        return firstSent;
      }
      return `Initial wire dispatches reported on ${initHead}.`;
    };

    if (cl.evolutionHistory.length === 1) {
      const h0 = cl.evolutionHistory[0];
      const h0Ms = Date.parse(h0.timestamp || cl.firstSeenAt || '') || earliestCovMs;
      const logMatch = [...updatesLogEntries].reverse().find(e =>
        e && (e.after?.id === cl.id || e.after?.story === cl.story) &&
        e.before?.story && e.before.story.toLowerCase() !== String(cl.story || '').toLowerCase()
      );
      let priorTitle = (h0.headline && h0.headline.toLowerCase() !== String(cl.story || '').toLowerCase())
        ? h0.headline
        : (logMatch?.before?.story || null);
      let priorSummary = (h0.headline && h0.headline.toLowerCase() !== String(cl.story || '').toLowerCase())
        ? (h0.summary || logMatch?.before?.summary || '')
        : (logMatch?.before?.summary || '');
      let priorBirthMs = h0Ms;
      let shiftNote = logMatch?.note || cl.developmentNote || '';
      let shiftTs = logMatch?.eventTimestamp || cl.lastDevelopedAt || new Date(latestCovMs).toISOString();

      if (!priorTitle && Array.isArray(cl.evolvedFromIds) && cl.evolvedFromIds.length > 0) {
        for (const oldId of cl.evolvedFromIds) {
          const arch = archiveLookup.get(oldId);
          const logByOld = [...updatesLogEntries].reverse().find(e => e?.before?.id === oldId || (Array.isArray(e?.mergedClusterIds) && e.mergedClusterIds.includes(oldId)));
          const candTitle = arch?.story || logByOld?.before?.story || humanizeSlug(oldId);
          if (candTitle && candTitle.toLowerCase() !== String(cl.story || '').toLowerCase()) {
            const archBirthMs = arch?.firstSeenAt ? Date.parse(arch.firstSeenAt) : h0Ms;
            const stA = getStems(candTitle);
            const stB = getStems(cl.story || '');
            const ov = countFuzzyOverlap(stA, stB) / Math.max(1, Math.min(stA.size || 1, stB.size || 1));
            if (ov < 0.85) {
              priorTitle = candTitle;
              priorSummary = arch?.summary || logByOld?.before?.summary || '';
              if (archBirthMs > 0 && archBirthMs < priorBirthMs) priorBirthMs = archBirthMs;
              shiftNote = logByOld?.note || shiftNote;
              if (logByOld?.eventTimestamp) shiftTs = logByOld.eventTimestamp;
              break;
            }
          }
        }
      }

      const spanHours = (latestCovMs - priorBirthMs) / 3600000;
      if (priorTitle && (spanHours >= 1.5 || Boolean(logMatch) || (Array.isArray(cl.evolvedFromIds) && cl.evolvedFromIds.length > 0))) {
        const sents = String(cl.summary || '').split(/(?<=[.!?])\s+/).filter(Boolean);
        const finalNote = shiftNote || sents[sents.length - 1] || sents[0] || `Story updated: ${cl.story}`;
        const finalShiftTs = new Date(Math.max(Date.parse(shiftTs) || latestCovMs, priorBirthMs + 60000)).toISOString();
        const distinctInitSum = (priorSummary && priorSummary.trim() !== String(cl.summary || '').trim())
          ? priorSummary
          : buildDistinctInitialSummary(priorTitle);
        cl.evolutionHistory = [
          {
            version: 1,
            type: 'initial',
            timestamp: new Date(priorBirthMs).toISOString(),
            headline: priorTitle,
            summary: distinctInitSum,
            outletCount: logMatch?.before?.outletCount || h0.outletCount || 2,
            note: 'Initial cluster formation on the wire'
          },
          {
            version: 2,
            type: 'material_shift',
            timestamp: finalShiftTs,
            headline: cl.story,
            summary: cl.summary,
            beforeStory: priorTitle,
            beforeSummary: distinctInitSum,
            outletCount: cl.outletCount || (cl.coverage || []).length || 2,
            note: finalNote
          }
        ];
      } else {
        cl.evolutionHistory[0].headline = cl.story;
        cl.evolutionHistory[0].summary = cl.summary || cl.evolutionHistory[0].summary;
      }
    }

    // Enforce Headline-Shift Co-Change Law across all steps of evolutionHistory:
    // A step that changes the headline from the preceding step is either promoted to `material_shift` (if substantive shift or final story)
    // or aligned with the active phase headline (if an intra-phase number/wording clarification).
    let monoVer = 1;
    cl.evolutionHistory[0].version = 1;
    cl.evolutionHistory[0].type = 'initial';
    for (let i = 1; i < cl.evolutionHistory.length; i++) {
      const prevH = cl.evolutionHistory[i - 1];
      const currH = cl.evolutionHistory[i];
      if (currH.type !== 'material_shift' && currH.headline && prevH.headline && currH.headline !== prevH.headline) {
        const stPrev = getStems(prevH.headline);
        const stCurr = getStems(currH.headline);
        const ov = countFuzzyOverlap(stPrev, stCurr) / Math.max(1, Math.min(stPrev.size || 1, stCurr.size || 1));
        const shiftsToFinalStory = currH.headline === cl.story && prevH.headline !== cl.story;
        if (ov < 0.72 || shiftsToFinalStory) {
          currH.type = 'material_shift';
        } else {
          currH.headline = prevH.headline;
        }
      }
      if (currH.type !== 'material_shift' && prevH.headline) {
        currH.beforeStory = prevH.headline;
      } else if (currH.type === 'material_shift' && prevH.headline) {
        currH.beforeStory = prevH.headline;
      }
      if (currH.type === 'material_shift') monoVer++;
      currH.version = monoVer;
    }
    const lastHistStep = cl.evolutionHistory[cl.evolutionHistory.length - 1];
    if (lastHistStep && cl.story && lastHistStep.headline !== cl.story) {
      if (cl.evolutionHistory.length > 1 && lastHistStep.type !== 'material_shift') {
        lastHistStep.type = 'material_shift';
        monoVer++;
        lastHistStep.version = monoVer;
      }
      lastHistStep.headline = cl.story;
    }
    if (lastHistStep && cl.summary && lastHistStep.summary !== cl.summary) {
      lastHistStep.summary = cl.summary;
    }
    if (monoVer >= 2 && cl.evolutionHistory[0].summary === cl.summary) {
      cl.evolutionHistory[0].summary = (cl.evolutionHistory[1]?.beforeSummary && cl.evolutionHistory[1].beforeSummary !== cl.summary)
        ? cl.evolutionHistory[1].beforeSummary
        : buildDistinctInitialSummary(cl.evolutionHistory[0].headline || cl.story);
    }
    cl.version = monoVer;
    if (cl.evolutionHistory.length <= 1) {
      delete cl.developmentNote;
      delete cl.lastDevelopedAt;
    } else {
      if (lastHistStep?.note) cl.developmentNote = lastHistStep.note;
      if (lastHistStep?.timestamp) cl.lastDevelopedAt = lastHistStep.timestamp;
    }
    if (cl.summarySynthesizedSig && cl.summarySynthesizedSig.startsWith(`${cl.id}|v`)) {
      cl.summarySynthesizedSig = `${cl.id}|v${cl.version || 1}|h${cl.evolutionHistory.length}`;
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
      const eventBase = (match && typeof match.eventBase === 'number') ? match.eventBase : (typeof cov.eventBase === 'number' ? cov.eventBase : null);
      const framingMod = (match && typeof match.framingMod === 'number') ? match.framingMod : (typeof cov.framingMod === 'number' ? cov.framingMod : null);
      const rawFactors = (match && Array.isArray(match.factors) && match.factors.length === 4)
        ? match.factors
        : (Array.isArray(cov.factors) && cov.factors.length === 4 ? cov.factors : null);
      const factors = rawFactors
        ? [
            Math.round(Number(rawFactors[0]) || 0),
            Math.round(Number(rawFactors[1]) || 0),
            (Number(rawFactors[1]) || 0) < 35
              ? Math.min(Math.round(Number(rawFactors[2]) || 0), Math.round((Number(rawFactors[1]) || 0) * 1.15 + 18))
              : Math.round(Number(rawFactors[2]) || 0),
            Math.round(Number(rawFactors[3]) || 0)
          ]
        : null;
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
    const covWithFactorsSorted = enrichedCov
      .filter(c => Array.isArray(c.factors) && c.factors.length === 4)
      .slice()
      .sort((a, b) => (Date.parse(a.pubDate || 0) || 0) - (Date.parse(b.pubDate || 0) || 0));
    const lastDevMs = cl.lastDevelopedAt ? Date.parse(cl.lastDevelopedAt) : NaN;
    const clusterFactors = (() => {
      if (covWithFactorsSorted.length === 0) {
        if (Array.isArray(cl.factors) && cl.factors.length === 4) return cl.factors.map(n => Math.round(Number(n) || 0));
        return [Math.round(avgEventBase * 100), 50, 42, 12];
      }
      const n = covWithFactorsSorted.length;
      const recentStartIdx = Math.max(0, Math.floor(n * 0.6));
      let wSum = 0, polSum = 0, reachSum = 0, permSum = 0, framAbsSum = 0, framSignedSum = 0;
      covWithFactorsSorted.forEach((c, idx) => {
        const pMs = c.pubDate ? Date.parse(c.pubDate) : NaN;
        const isPostDev = !isNaN(lastDevMs) && !isNaN(pMs) && pMs >= (lastDevMs - 2 * 3600000);
        const w = isPostDev ? 2.5 : (idx >= recentStartIdx ? 2.0 : 1.0);
        wSum += w;
        polSum += (Number(c.factors[0]) || 0) * w;
        reachSum += (Number(c.factors[1]) || 0) * w;
        permSum += (Number(c.factors[2]) || 0) * w;
        framAbsSum += Math.abs(Number(c.factors[3]) || 0) * w;
        framSignedSum += (Number(c.factors[3]) || 0) * w;
      });
      const cPol = Math.round(polSum / wSum);
      const cReach = Math.round(reachSum / wSum);
      const rawCPerm = Math.round(permSum / wSum);
      const cPerm = cReach < 35 ? Math.min(rawCPerm, Math.round(cReach * 1.15 + 18)) : rawCPerm;
      const cFramAbs = Math.round(framAbsSum / wSum);
      const cFramSign = (framSignedSum / wSum) < -3 ? -1 : 1;
      return [cPol, cReach, cPerm, cFramAbs * cFramSign];
    })();
    enrichedCov.forEach(c => {
      if (!Array.isArray(c.factors) || c.factors.length < 4) {
        const eb = typeof c.eventBase === 'number' ? c.eventBase : c.sentiment;
        const fm = typeof c.framingMod === 'number' ? c.framingMod : 0;
        c.factors = [Math.round((eb || 0) * 100), clusterFactors[1], clusterFactors[2], Math.round(fm * 100) || clusterFactors[3]];
      }
    });
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
      ...(typeof cl.lastEvaluatedCoverageMs === 'number' ? { lastEvaluatedCoverageMs: cl.lastEvaluatedCoverageMs } : {}),
      ...(Array.isArray(cl.evaluatedDesyncTokens) && cl.evaluatedDesyncTokens.length > 0 ? { evaluatedDesyncTokens: cl.evaluatedDesyncTokens } : {}),
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

  // 1c. Retire dormant / expired clusters from active clusters.json (now safely preserved in clusters-archive.json)
  const isActiveClusterWindow = (cl) => {
    const times = (cl.coverage || []).map(a => Date.parse(a?.pubDate || '') || 0).filter(t => t > 0).sort((a, b) => a - b);
    if (times.length === 0) return false;
    const newestMs = times[times.length - 1];
    const birthMs = Math.min(times[0], Date.parse(cl.firstSeenAt || '') || Infinity);
    const medMs = times[Math.floor(times.length / 2)];
    const newestAgeH = (nowMs - newestMs) / 3600000;
    const birthAgeH = (nowMs - birthMs) / 3600000;
    const medAgeH = (nowMs - medMs) / 3600000;
    const oc = cl.outletCount || times.length;
    if (newestAgeH > 168) return false;
    if (oc <= 3 && newestAgeH > 108) return false;
    if (birthAgeH > 180 && newestAgeH > 120) return false;
    if (birthAgeH > 336 && medAgeH > 240) return false;
    return true;
  };
  const activeEnrichedClusters = enrichedClusters.filter(isActiveClusterWindow);
  const activeRawClusters = rawClusters.filter(isActiveClusterWindow);
  fullPayload.sharedStoryClusters = activeRawClusters;
  if (fullPayload.globalStats) fullPayload.globalStats.sharedStoryClusters = activeRawClusters;
  clustersPayload.count = activeEnrichedClusters.length;
  clustersPayload.clusters = activeEnrichedClusters;
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'clusters.json'), JSON.stringify(clustersPayload, null, 2), 'utf8');

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
  const constructiveClusters = activeEnrichedClusters
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
        count: activeEnrichedClusters.length
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

  const active48h = activeRawClusters.filter(cl => {
    const newestMs = Math.max(...(cl.coverage || []).map(c => new Date(c.pubDate).getTime() || 0), 0);
    return newestMs >= cutoff48h;
  });
  const activeClusters48h = active48h.length >= 12 ? active48h : activeRawClusters.slice(0, 24);

  return {
    enrichedClusters: activeEnrichedClusters,
    activeClusters48h,
    clustersCount: activeEnrichedClusters.length,
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

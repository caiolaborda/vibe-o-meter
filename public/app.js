// --- NO GOOD NEWS CLIENT APP ---

// App State
let state = {
  sources: {},
  lastUpdated: null,
  analyzerUsed: 'Google Gemini (AI)',
  sentimentMode: 'gemini',
  spectrumViewMode: 'averages', // 'averages' or 'distribution'
  showAllOutlets: false,
  activeRegion: 'all', // 'all', 'US', 'UK', 'EU', 'ME', 'GLOBAL'
  activeTab: 'pulse', // 'pulse', 'trends', 'deepdives', 'methodology'
  timelineRange: 'all', // 'all' or 'recent'
  timeSeries: [],
  isSyncing: false,
  syncMessage: '',
  filters: {
    source: 'all',
    category: 'all',
    vibe: 'all',
    time: '24h', // Default to Past 24 Hours
    search: ''
  },
    sort: {
    field: 'date', // 'date' or 'vibe'
    order: 'desc' // 'desc' or 'asc'
  },
  edition: 'doom', // 'doom' (No Good News) or 'silver' (Some Good News)
  silverTopic: 'all',
  headlinesLimit: 20,
  sharedStoryClusters: [],
  clusterSearch: '',
  clusterTopic: 'all',
  clusterSort: 'spread',
  h2hTopic: 'all'
};

let resolvedSources = {};

// News Source Metadata with Origin Region, Country Codes and Visual Colors
const SOURCE_META = {
  bbc: { name: 'BBC News', initials: 'BBC', color: '#ff3f3f', region: 'UK', regionName: 'United Kingdom', countryCode: 'gb', flag: '🇬🇧' },
  nyt: { name: 'The New York Times', initials: 'NYT', color: '#1e293b', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  cnn: { name: 'CNN', initials: 'CNN', color: '#cc0000', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  guardian: { name: 'The Guardian', initials: 'GD', color: '#005689', region: 'UK', regionName: 'United Kingdom', countryCode: 'gb', flag: '🇬🇧' },
  fox: { name: 'Fox News', initials: 'FOX', color: '#003366', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  aljazeera: { name: 'Al Jazeera', initials: 'AJ', color: '#ff9900', region: 'ME', regionName: 'Middle East', countryCode: 'qa', flag: '🇶🇦' },
  npr: { name: 'NPR', initials: 'NPR', color: '#3c78d8', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  cnbc: { name: 'CNBC', initials: 'CNB', color: '#0077b6', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  skynews: { name: 'Sky News', initials: 'SKY', color: '#f22613', region: 'UK', regionName: 'United Kingdom', countryCode: 'gb', flag: '🇬🇧' },
  spiegel: { name: 'Der Spiegel', initials: 'SPG', color: '#e62a15', region: 'EU', regionName: 'Europe', countryCode: 'de', flag: '🇩🇪' },
  reuters: { name: 'Reuters', initials: 'RTR', color: '#ff8000', region: 'GLOBAL', regionName: 'Global News', countryCode: 'un', flag: '🌐' },
  ap: { name: 'Associated Press', initials: 'AP', color: '#ff0055', region: 'GLOBAL', regionName: 'Global News', countryCode: 'un', flag: '🌐' },
  bloomberg: { name: 'Bloomberg', initials: 'BBG', color: '#1d4ed8', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  dw: { name: 'DW News', initials: 'DW', color: '#002b49', region: 'EU', regionName: 'Europe', countryCode: 'de', flag: '🇩🇪' },
  wsj: { name: 'The Wall Street Journal', initials: 'WSJ', color: '#0274b6', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' },
  france24: { name: 'France 24', initials: 'F24', color: '#009fe3', region: 'EU', regionName: 'Europe', countryCode: 'fr', flag: '🇫🇷' },
  politico: { name: 'Politico', initials: 'POL', color: '#e83e8c', region: 'US', regionName: 'United States', countryCode: 'us', flag: '🇺🇸' }
};

// Cross-platform flag renderer (renders crisp FlagCDN images on Windows & mobile)
function getSourceFlagHTML(sourceId, extraClass = '') {
  const meta = SOURCE_META[sourceId];
  if (!meta) return `<span class="flag-icon-globe ${extraClass}">🌐</span>`;
  if (meta.countryCode && meta.countryCode !== 'un' && meta.region !== 'GLOBAL') {
    return `<img src="https://flagcdn.com/20x15/${meta.countryCode}.png" alt="${meta.regionName}" class="flag-icon-img ${extraClass}" width="16" height="12" loading="lazy">`;
  }
  return `<span class="flag-icon-globe ${extraClass}" title="${meta.regionName}">🌐</span>`;
}
window.getSourceFlagHTML = getSourceFlagHTML;

// High-Res Editorial Photography Fallbacks for constructive news cards
const EDITORIAL_TOPIC_PHOTOS = {
  science: [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507668077129-56e32842fceb?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=1200&auto=format&fit=crop&q=80'
  ],
  climate: [
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1511497584788-87676104235f?w=1200&auto=format&fit=crop&q=80'
  ],
  health: [
    'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=1200&auto=format&fit=crop&q=80'
  ],
  technology: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&auto=format&fit=crop&q=80'
  ],
  business: [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80'
  ],
  world: [
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1200&auto=format&fit=crop&q=80'
  ],
  politics: [
    'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1200&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1200&auto=format&fit=crop&q=80'
  ],
  sports: [
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&auto=format&fit=crop&q=80'
  ],
  entertainment: [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&auto=format&fit=crop&q=80'
  ],
  other: [
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&auto=format&fit=crop&q=80'
  ]
};

function getStoryImage(art) {
  if (art.imageUrl && typeof art.imageUrl === 'string' && art.imageUrl.startsWith('http')) {
    return art.imageUrl;
  }
  const cat = (art.category || 'other').toLowerCase();
  const pool = EDITORIAL_TOPIC_PHOTOS[cat] || EDITORIAL_TOPIC_PHOTOS.other;
  let hash = 0;
  const str = art.title || '';
  for (let i = 0; i < str.length; i++) {
    hash = (hash + str.charCodeAt(i)) % pool.length;
  }
  return pool[hash];
}

function findRelatedCoverage(art, allArticles) {
  const related = [];
  const currentTitle = (art.title || '').toLowerCase().trim();
  const currentClean = cleanHeadlineTitle(art.title);
  const currentUrl = canonicalUrl(art.link || art.url);

  // 1. From AI-generated sharedStoryClusters
  const clusters = state.sharedStoryClusters || (state.vibeData && state.vibeData.sharedStoryClusters) || [];
  for (const c of clusters) {
    const isMatch = (c.coverage || []).some(m => {
      if (currentUrl && m.link && canonicalUrl(m.link) === currentUrl) return true;
      if (currentClean && m.title && cleanHeadlineTitle(m.title) === currentClean) return true;
      const mTitle = (m.title || '').toLowerCase().trim();
      return (mTitle.length >= 15 && currentTitle.includes(mTitle.slice(0, 30))) ||
             (currentTitle.length >= 15 && mTitle.includes(currentTitle.slice(0, 30)));
    });
    if (isMatch) {
      (c.coverage || []).forEach(m => {
        if (m.sourceId !== art.sourceId && !related.some(r => r.sourceId === m.sourceId)) {
          related.push({
            sourceId: m.sourceId,
            sourceName: m.sourceName,
            title: m.title,
            sentiment: m.sentiment,
            link: m.link
          });
        }
      });
      break;
    }
  }

  // 2. Supplement with Keyword/Topic Cross-Outlet Matching across full candidate pool
  if (allArticles && allArticles.length > 0 && related.length < 4) {
    const stopWords = new Set(['about', 'their', 'there', 'which', 'would', 'could', 'after', 'before', 'first', 'second', 'today', 'years', 'state', 'major', 'report', 'world', 'news', 'more', 'over', 'under', 'while', 'where', 'these', 'those', 'found', 'says', 'amid', 'thought']);
    const normalizeWords = (str) => (str || '')
      .toLowerCase()
      .replace(/türkiye|turkiye|turkish/g, 'turkey')
      .replace(/britain|british|\buk\b/g, 'uk')
      .replace(/united states|\bu\.s\.\b|\busa\b|american/g, 'usa')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !stopWords.has(w));

    const words = normalizeWords(currentTitle);
      
    if (words.length > 0) {
      for (const other of allArticles) {
        if (other.sourceId !== art.sourceId && !related.some(r => r.sourceId === other.sourceId)) {
          const otherTitle = (other.title || '').toLowerCase();
          const otherWords = new Set(normalizeWords(otherTitle));
          const matchCount = words.filter(w => otherWords.has(w) || (w.length >= 5 && otherTitle.includes(w))).length;
          if (matchCount >= 2 || (words.length === 1 && matchCount === 1 && other.category === art.category)) {
            related.push({
              sourceId: other.sourceId,
              sourceName: other.sourceName,
              title: other.title,
              sentiment: other.sentiment,
              link: other.url || other.link
            });
            if (related.length >= 4) break;
          }
        }
      }
    }
  }

  return related.slice(0, 4);
}

function attachSwipeListeners(el) {
  if (!el) return;
  let startX = 0;
  let startY = 0;
  let startTime = 0;

  el.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches[0]) {
      const diffX = e.changedTouches[0].clientX - startX;
      const diffY = e.changedTouches[0].clientY - startY;
      const duration = Date.now() - startTime;
      
      if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.5 && duration < 600) {
        if (diffX < 0) {
          navigateSilverDeck(1);
        } else {
          navigateSilverDeck(-1);
        }
      }
    }
  }, { passive: true });
}

function createSilverCardHTML(art, idx, related, isSpotlight) {
  let rankBadgeHTML = '';
  if (idx === 0) {
    rankBadgeHTML = `<span class="silver-rank-pill rank-gold"><i data-lucide="crown" style="width:12px;height:12px;"></i> #1 TOP BREAKTHROUGH</span>`;
  } else if (idx === 1) {
    rankBadgeHTML = `<span class="silver-rank-pill rank-silver"><i data-lucide="award" style="width:12px;height:12px;"></i> #2 RUNNER UP</span>`;
  } else if (idx === 2) {
    rankBadgeHTML = `<span class="silver-rank-pill rank-bronze"><i data-lucide="medal" style="width:12px;height:12px;"></i> #3 SPOTLIGHT</span>`;
  } else {
    rankBadgeHTML = `<span class="silver-rank-pill rank-standard">#${idx + 1}</span>`;
  }

  const brandMeta = SOURCE_META[art.sourceId] || { initials: art.sourceId, color: '#3b82f6', flag: '🌐' };
  const dateObj = new Date(art.pubDate);
  const dateFormatted = dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const moodLabel = getMoodLabel(art.sentiment);
  let cleanDesc = (art.description || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanDesc || cleanDesc.length < 15) {
    cleanDesc = `Full reporting and editorial coverage from ${art.sourceName}. Follow the link below for the complete dispatch.`;
  }

  const heroImgUrl = getStoryImage(art);
  const storyUrl = art.url || art.link || '#';

  let relatedHTML = '';
  if (related && related.length > 0) {
    relatedHTML = `
      <div class="silver-related-box">
        <div class="silver-related-label">
          <i data-lucide="layers" style="width:12px;height:12px;"></i>
          <span>Related Outlet Coverage:</span>
        </div>
        <div class="silver-related-chips">
          ${related.map(r => `
            <a href="${r.link}" target="_blank" rel="noopener noreferrer" class="silver-related-chip" title="${r.title.replace(/"/g, '&quot;')}">
              <span class="related-chip-outlet">${r.sourceName}</span>
              <span class="related-chip-score ${r.sentiment > 0.15 ? 'pos' : ''}">${r.sentiment > 0 ? '+' : ''}${r.sentiment.toFixed(2)}</span>
              <i data-lucide="external-link" style="width:10px;height:10px;"></i>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="silver-media-hero">
      <img src="${heroImgUrl}" alt="${art.title.replace(/"/g, '&quot;')}" class="silver-hero-image" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&auto=format&fit=crop&q=80'" />
      <div class="silver-media-overlay"></div>
      <div class="silver-media-badges">
        ${rankBadgeHTML}
        <span class="silver-score-badge">
          <i data-lucide="smile" style="width:12px;height:12px;"></i> +${art.sentiment.toFixed(2)}
        </span>
      </div>
    </div>

    <div class="silver-card-body">
      <div class="silver-story-meta-bar">
        <div class="silver-story-meta-left">
          <span class="source-badge" style="background-color: ${brandMeta.color}">${getSourceFlagHTML(art.sourceId)} ${art.sourceName}</span>
          <span class="cat-badge ${art.category || 'other'}">${art.category === 'climate' ? '🌱 Nature & Climate' : (art.category || 'other')}</span>
        </div>
        <div class="silver-story-meta-right">
          <i data-lucide="clock" style="width:12px;height:12px;"></i>
          <span>${dateFormatted}</span>
        </div>
      </div>

      <h2 class="silver-story-title">
        <a href="${storyUrl}" target="_blank" rel="noopener noreferrer">${art.title}</a>
      </h2>

      <p class="silver-story-desc">${cleanDesc}</p>

      ${relatedHTML}

      <div class="silver-story-footer">
        <div class="silver-footer-left">
          <span class="silver-origin-label">Published by ${art.sourceName}</span>
        </div>
        <div class="silver-footer-actions">
          <button type="button" class="btn btn-secondary btn-sm silver-copy-btn" onclick="copyStoryLink('${storyUrl}', this)" title="Copy link to clipboard">
            <i data-lucide="link" style="width:13px;height:13px;"></i>
            <span>Share</span>
          </button>
          <a href="${storyUrl}" target="_blank" rel="noopener noreferrer" class="silver-read-btn">
            <span>Read Story</span>
            <i data-lucide="external-link" style="width:12px;height:12px;"></i>
          </a>
        </div>
      </div>
    </div>
  `;
}

// RSS Feed URLs for copying
const SOURCE_FEEDS = {
  bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
  nyt: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  cnn: 'https://news.google.com/rss/search?q=site:cnn.com&hl=en-US&gl=US&ceid=US:en',
  guardian: 'https://www.theguardian.com/international/rss',
  fox: 'https://moxie.foxnews.com/feed-uploader/v/web/home/latest.xml',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  npr: 'https://feeds.npr.org/1001/rss.xml',
  cnbc: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  skynews: 'https://feeds.skynews.com/feeds/rss/home.xml',
  spiegel: 'https://www.spiegel.de/international/index.rss',
  reuters: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
  ap: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en',
  bloomberg: 'https://news.google.com/rss/search?q=site:bloomberg.com&hl=en-US&gl=US&ceid=US:en',
  dw: 'https://rss.dw.com/rdf/rss-en-all',
  wsj: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  france24: 'https://www.france24.com/en/rss',
  politico: 'https://rss.politico.com/politics-news.xml'
};

// DOM Elements
const elements = {
  lastUpdatedText: document.getElementById('last-updated-text'),
  analyzerBadge: document.getElementById('analyzer-used-badge'),
  spectrumLanes: document.getElementById('spectrum-lanes-container'),
  spectrumMarkers: document.getElementById('spectrum-markers-container'),
  viewToggleAverages: document.getElementById('view-toggle-averages'),
  viewToggleDistribution: document.getElementById('view-toggle-distribution'),
  sourcesGrid: document.getElementById('sources-grid'),
  regionFilterTabs: document.getElementById('region-filter-tabs'),
  h2hSourceA: document.getElementById('h2h-source-a'),
  h2hSourceB: document.getElementById('h2h-source-b'),
  headlinesContainer: document.getElementById('headlines-container'),
  deepdiveHeadlinesContainer: document.getElementById('deepdive-headlines-container'),
  headlinesCountBadge: document.getElementById('headlines-count-badge'),
  headlinesPaginationWrap: document.getElementById('headlines-pagination-wrap'),
  headlinesShowMoreBtn: document.getElementById('headlines-show-more-btn'),
  headlinesShowMoreText: document.getElementById('headlines-show-more-text'),
  
  // Model View Toggle (optional)
  modeGeminiBtn: document.getElementById('mode-gemini-btn'),
  modeVaderBtn: document.getElementById('mode-vader-btn'),
  pulseSpotlightBanner: document.getElementById('pulse-spotlight-banner'),
  spotlightBanner: document.getElementById('pulse-spotlight-banner') || document.getElementById('spotlight-banner'),
  deepdiveSpotlightBanner: document.getElementById('deepdive-spotlight-banner'),
  quickNavBar: document.getElementById('quick-nav-bar'),
  deepdiveFilterIndicator: document.getElementById('deepdive-filter-indicator'),
  deepdiveFilterName: document.getElementById('deepdive-filter-name'),
  deepdiveClearFilterBtn: document.getElementById('deepdive-clear-filter-btn'),
  deepdiveFilterCategory: document.getElementById('deepdive-filter-category'),
  deepdiveFilterSource: document.getElementById('deepdive-filter-source'),
  deepdiveFilterTime: document.getElementById('deepdive-filter-time'),
  deepdiveTopicPillsRow: document.getElementById('deepdive-topic-pills-row'),
  deepdiveFilterVibe: document.getElementById('deepdive-filter-vibe'),
  deepdiveSearchInput: document.getElementById('deepdive-search-input'),
  deepdiveClearSearchBtn: document.getElementById('deepdive-clear-search-btn'),
  deepdiveSortDateBtn: document.getElementById('deepdive-sort-date'),
  deepdiveSortVibeBtn: document.getElementById('deepdive-sort-vibe'),
  deepdiveHeadlinesCountBadge: document.getElementById('deepdive-headlines-count-badge'),
  deepdiveHeadlinesPaginationWrap: document.getElementById('deepdive-headlines-pagination-wrap'),
  deepdiveHeadlinesShowMoreBtn: document.getElementById('deepdive-headlines-show-more-btn'),
  deepdiveHeadlinesShowMoreText: document.getElementById('deepdive-headlines-show-more-text'),

  // Pulse Top Developing Stories Elements
  pulseTopStoriesContainer: document.getElementById('pulse-top-stories-container'),
  topStoriesCountBadge: document.getElementById('top-stories-count-badge'),
  pulseClusterTopicIndicator: document.getElementById('pulse-cluster-topic-indicator'),
  pulseClusterTopicName: document.getElementById('pulse-cluster-topic-name'),
  
  // Filters
  filterSource: document.getElementById('filter-source'),
  filterCategory: document.getElementById('filter-category'),
  filterVibe: document.getElementById('filter-vibe'),
  filterTime: document.getElementById('filter-time'),
  searchInput: document.getElementById('search-input'),
  clearSearchBtn: document.getElementById('clear-search-btn'),
  activeFilterIndicator: document.getElementById('active-filter-indicator'),
  filterName: document.getElementById('filter-name'),
  clearFilterBtn: document.getElementById('clear-filter-btn'),
  
  // Quick Nav Sticky Controls
  quickTimeframeSelect: document.getElementById('quick-timeframe-select'),
  quickSourceIndicator: document.getElementById('quick-source-indicator'),
  quickSourceName: document.getElementById('quick-source-name'),
  quickSourceClearBtn: document.getElementById('quick-source-clear-btn'),
  quickCategoryIndicator: document.getElementById('quick-category-indicator'),
  quickCategoryName: document.getElementById('quick-category-name'),
  quickCategoryClearBtn: document.getElementById('quick-category-clear-btn'),

  // Sort Buttons
  sortDateBtn: document.getElementById('sort-date'),
  sortVibeBtn: document.getElementById('sort-vibe'),

  // Story Compare Tab Elements
  clustersContainer: document.getElementById('clusters-container'),
  clustersSearchInput: document.getElementById('clusters-search-input'),
  clustersTopicSelect: document.getElementById('clusters-topic-select'),
  clustersSortSelect: document.getElementById('clusters-sort-select'),
  clustersCountBadge: document.getElementById('clusters-count-badge'),
  h2hTopicSelect: document.getElementById('h2h-topic-select'),
  h2hTimeframeSelect: document.getElementById('h2h-timeframe-select'),
  h2hSpreadValue: document.getElementById('h2h-spread-value'),

  // Some Good News Elements
  silverTopicSelect: document.getElementById('silver-topic-select'),
  silverTimeframeSelect: document.getElementById('silver-timeframe-select'),
  silverStatCountPill: document.getElementById('silver-stat-count-pill'),
  silverStatScorePill: document.getElementById('silver-stat-score-pill')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Load Icons
  lucide.createIcons();
  
  // Event Listeners
  setupEventListeners();
  
  // Initialize sentiment mode styling and visibility
  switchSentimentMode(state.sentimentMode);
  setupSpectrumMagnification();
  
  // Initialize edition attribute on body
  document.body.setAttribute('data-edition', state.edition);
  
  // Fetch initial data
  fetchData();
});

// Setup Event Listeners
function setupEventListeners() {
  // Dashboard Tab Switching
  document.querySelectorAll('.nav-pill-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  // Handle initial tab from URL hash if provided
  const initialHash = window.location.hash.replace('#', '');
  if (['pulse', 'trends', 'compare', 'deepdives', 'feed', 'methodology'].includes(initialHash)) {
    switchTab(initialHash === 'feed' ? 'pulse' : initialHash);
  }

  // Handle browser back / forward navigation
  window.addEventListener('hashchange', () => {
    const currentHash = window.location.hash.replace('#', '');
    if (['pulse', 'trends', 'compare', 'deepdives', 'feed', 'methodology'].includes(currentHash) && state.activeTab !== currentHash) {
      switchTab(currentHash === 'feed' ? 'pulse' : currentHash);
    }
  });

  // Timeline Range Buttons
  const timelineAllBtn = document.getElementById('timeline-range-all');
  const timelineRecentBtn = document.getElementById('timeline-range-recent');
  if (timelineAllBtn && timelineRecentBtn) {
    timelineAllBtn.addEventListener('click', () => {
      state.timelineRange = 'all';
      state.filters.time = 'all';
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = 'all';
      if (elements.filterTime) elements.filterTime.value = 'all';
      updateTimelineButtonsUI();
      updateAppUI();
    });

    timelineRecentBtn.addEventListener('click', () => {
      state.timelineRange = 'recent';
      state.filters.time = '7d';
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = '7d';
      if (elements.filterTime) elements.filterTime.value = '7d';
      updateTimelineButtonsUI();
      updateAppUI();
    });
  }

  // Setup quick topic pills
  setupTopicPills();
  
  // Model View Toggle Click
  if (elements.modeGeminiBtn) {
    elements.modeGeminiBtn.addEventListener('click', () => switchSentimentMode('gemini'));
  }
  if (elements.modeVaderBtn) {
    elements.modeVaderBtn.addEventListener('click', () => switchSentimentMode('vader'));
  }
  if (elements.modeGlobalBtn) {
    elements.modeGlobalBtn.addEventListener('click', () => switchSentimentMode('global'));
  }
  
  // Filter changes
  if (elements.filterSource) {
    elements.filterSource.addEventListener('change', (e) => {
      state.filters.source = e.target.value;
      state.headlinesLimit = 20;
      updateFilterIndicator();
      renderHeadlines();
    });
  }
  if (elements.filterCategory) {
    elements.filterCategory.addEventListener('change', (e) => {
      state.filters.category = e.target.value;
      state.headlinesLimit = 20;
      if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = e.target.value;
      updateTopicPillsActive(e.target.value);
      updateFilterIndicator();
      updateAppUI();
    });
  }
  if (elements.deepdiveFilterCategory) {
    elements.deepdiveFilterCategory.addEventListener('change', (e) => {
      state.filters.category = e.target.value;
      state.headlinesLimit = 20;
      if (elements.filterCategory) elements.filterCategory.value = e.target.value;
      updateTopicPillsActive(e.target.value);
      updateFilterIndicator();
      updateAppUI();
    });
  }

  // Deep Dive Dedicated Source Filter
  if (elements.deepdiveFilterSource) {
    elements.deepdiveFilterSource.addEventListener('change', (e) => {
      state.filters.source = e.target.value;
      state.headlinesLimit = 20;
      if (elements.filterSource) elements.filterSource.value = e.target.value;
      document.querySelectorAll('.source-card').forEach(c => {
        c.classList.toggle('active', c.dataset.source === e.target.value);
      });
      document.querySelectorAll('.outlet-marker').forEach(m => {
        m.classList.toggle('active', m.dataset.source === e.target.value);
      });
      updateFilterIndicator();
      renderHeadlines();
      updateAppUI();
    });
  }

  // Deep Dive Dedicated Timeframe Filter
  if (elements.deepdiveFilterTime) {
    elements.deepdiveFilterTime.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      state.headlinesLimit = 20;
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = e.target.value;
      if (elements.filterTime) elements.filterTime.value = e.target.value;
      const silverTime = document.getElementById('silver-timeframe-select');
      if (silverTime) silverTime.value = e.target.value;
      state.timelineRange = e.target.value === 'all' ? 'all' : (e.target.value === '7d' ? 'recent' : 'custom');
      updateTimelineButtonsUI();
      updateAppUI();
    });
  }

  // Deep Dive Topic Pills Selector
  if (elements.deepdiveTopicPillsRow) {
    elements.deepdiveTopicPillsRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.topic-pill-btn');
      if (!btn) return;
      const topic = btn.dataset.topic || 'all';
      state.filters.category = topic;
      state.headlinesLimit = 20;
      if (elements.filterCategory) elements.filterCategory.value = topic;
      if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = topic;
      updateTopicPillsActive(topic);
      updateFilterIndicator();
      updateAppUI();
    });
  }

  if (elements.filterVibe) {
    elements.filterVibe.addEventListener('change', (e) => {
      state.filters.vibe = e.target.value;
      state.headlinesLimit = 20;
      if (elements.deepdiveFilterVibe) elements.deepdiveFilterVibe.value = e.target.value;
      renderHeadlines();
    });
  }
  if (elements.deepdiveFilterVibe) {
    elements.deepdiveFilterVibe.addEventListener('change', (e) => {
      state.filters.vibe = e.target.value;
      state.headlinesLimit = 20;
      if (elements.filterVibe) elements.filterVibe.value = e.target.value;
      renderHeadlines();
    });
  }
  
  if (elements.filterTime) {
    elements.filterTime.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      state.headlinesLimit = 20;
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = e.target.value;
      if (elements.deepdiveFilterTime) elements.deepdiveFilterTime.value = e.target.value;
      state.timelineRange = e.target.value === 'all' ? 'all' : (e.target.value === '7d' ? 'recent' : 'custom');
      updateTimelineButtonsUI();
      updateAppUI();
    });
  }

  if (elements.quickTimeframeSelect) {
    elements.quickTimeframeSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      state.headlinesLimit = 20;
      if (elements.filterTime) elements.filterTime.value = e.target.value;
      if (elements.deepdiveFilterTime) elements.deepdiveFilterTime.value = e.target.value;
      const silverTime = document.getElementById('silver-timeframe-select');
      if (silverTime) silverTime.value = e.target.value;
      state.timelineRange = e.target.value === 'all' ? 'all' : (e.target.value === '7d' ? 'recent' : 'custom');
      updateTimelineButtonsUI();
      updateAppUI();
    });
  }

  if (elements.quickSourceClearBtn) {
    elements.quickSourceClearBtn.addEventListener('click', () => {
      state.filters.source = 'all';
      state.headlinesLimit = 20;
      if (elements.filterSource) elements.filterSource.value = 'all';
      if (elements.deepdiveFilterSource) elements.deepdiveFilterSource.value = 'all';
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.outlet-marker').forEach(m => m.classList.remove('active'));
      updateFilterIndicator();
      renderHeadlines();
      updateAppUI();
    });
  }

  if (elements.quickCategoryClearBtn) {
    elements.quickCategoryClearBtn.addEventListener('click', () => {
      state.filters.category = 'all';
      state.headlinesLimit = 20;
      if (elements.filterCategory) elements.filterCategory.value = 'all';
      if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = 'all';
      updateTopicPillsActive('all');
      updateFilterIndicator();
      updateAppUI();
    });
  }

  if (elements.deepdiveClearFilterBtn) {
    elements.deepdiveClearFilterBtn.addEventListener('click', () => {
      state.filters.source = 'all';
      state.filters.category = 'all';
      state.filters.vibe = 'all';
      state.filters.search = '';
      state.headlinesLimit = 20;
      if (elements.filterSource) elements.filterSource.value = 'all';
      if (elements.deepdiveFilterSource) elements.deepdiveFilterSource.value = 'all';
      if (elements.filterCategory) elements.filterCategory.value = 'all';
      if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = 'all';
      if (elements.filterVibe) elements.filterVibe.value = 'all';
      if (elements.deepdiveFilterVibe) elements.deepdiveFilterVibe.value = 'all';
      if (elements.searchInput) elements.searchInput.value = '';
      if (elements.deepdiveSearchInput) elements.deepdiveSearchInput.value = '';
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.outlet-marker').forEach(m => m.classList.remove('active'));
      updateTopicPillsActive('all');
      updateFilterIndicator();
      renderHeadlines();
      updateAppUI();
    });
  }

  // Two-Sided App Edition Switcher (No Good News vs Some Good News)
  const editionDoom = document.getElementById('edition-btn-doom');
  const editionSilver = document.getElementById('edition-btn-silver');
  if (editionDoom && editionSilver) {
    editionDoom.addEventListener('click', () => {
      switchEdition('doom');
    });

    editionSilver.addEventListener('click', () => {
      switchEdition('silver');
    });
  }

  // Silver Edition Topic Selector
  const silverTopicSelect = document.getElementById('silver-topic-select');
  if (silverTopicSelect) {
    silverTopicSelect.addEventListener('change', (e) => {
      state.silverTopic = e.target.value;
      state.silverLimit = 24;
      renderSilverEdition();
    });
  }

  // Silver Edition Timeframe Selector
  const silverTimeSelect = document.getElementById('silver-timeframe-select');
  if (silverTimeSelect) {
    silverTimeSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      state.headlinesLimit = 20;
      state.silverLimit = 24;
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = e.target.value;
      if (elements.filterTime) elements.filterTime.value = e.target.value;
      updateAppUI();
    });
  }

  if (elements.regionFilterTabs) {
    elements.regionFilterTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.region-pill');
      if (!btn) return;
      elements.regionFilterTabs.querySelectorAll('.region-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeRegion = btn.dataset.region || 'all';
      if (elements.sourcesGrid) elements.sourcesGrid.scrollLeft = 0;
      renderComparisonMatrix();
    });
  }
  
  // Search input (debounced by 150ms to eliminate typing lag)
  let searchDebounceTimer = null;
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.filters.search = e.target.value.trim();
        state.headlinesLimit = 20;
        if (elements.deepdiveSearchInput) elements.deepdiveSearchInput.value = e.target.value;
        if (elements.clearSearchBtn) {
          elements.clearSearchBtn.style.display = state.filters.search ? 'block' : 'none';
        }
        if (elements.deepdiveClearSearchBtn) {
          elements.deepdiveClearSearchBtn.style.display = state.filters.search ? 'block' : 'none';
        }
        renderHeadlines();
      }, 150);
    });
  }

  let deepdiveSearchDebounceTimer = null;
  if (elements.deepdiveSearchInput) {
    elements.deepdiveSearchInput.addEventListener('input', (e) => {
      clearTimeout(deepdiveSearchDebounceTimer);
      deepdiveSearchDebounceTimer = setTimeout(() => {
        state.filters.search = e.target.value.trim();
        state.headlinesLimit = 20;
        if (elements.searchInput) elements.searchInput.value = e.target.value;
        if (elements.deepdiveClearSearchBtn) {
          elements.deepdiveClearSearchBtn.style.display = state.filters.search ? 'block' : 'none';
        }
        if (elements.clearSearchBtn) {
          elements.clearSearchBtn.style.display = state.filters.search ? 'block' : 'none';
        }
        renderHeadlines();
      }, 150);
    });
  }
  
  if (elements.clearSearchBtn) {
    elements.clearSearchBtn.addEventListener('click', () => {
      if (elements.searchInput) elements.searchInput.value = '';
      if (elements.deepdiveSearchInput) elements.deepdiveSearchInput.value = '';
      state.filters.search = '';
      state.headlinesLimit = 20;
      elements.clearSearchBtn.style.display = 'none';
      if (elements.deepdiveClearSearchBtn) elements.deepdiveClearSearchBtn.style.display = 'none';
      renderHeadlines();
    });
  }

  if (elements.deepdiveClearSearchBtn) {
    elements.deepdiveClearSearchBtn.addEventListener('click', () => {
      if (elements.searchInput) elements.searchInput.value = '';
      if (elements.deepdiveSearchInput) elements.deepdiveSearchInput.value = '';
      state.filters.search = '';
      state.headlinesLimit = 20;
      elements.deepdiveClearSearchBtn.style.display = 'none';
      if (elements.clearSearchBtn) elements.clearSearchBtn.style.display = 'none';
      renderHeadlines();
    });
  }

  if (elements.clearFilterBtn) {
    elements.clearFilterBtn.addEventListener('click', () => {
      state.filters.source = 'all';
      state.filters.category = 'all';
      state.filters.vibe = 'all';
      state.filters.time = '24h';
      state.activeRegion = 'all';
      state.headlinesLimit = 20;
      
      if (elements.filterSource) elements.filterSource.value = 'all';
      if (elements.filterCategory) elements.filterCategory.value = 'all';
      if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = 'all';
      if (elements.filterVibe) elements.filterVibe.value = 'all';
      if (elements.deepdiveFilterVibe) elements.deepdiveFilterVibe.value = 'all';
      if (elements.searchInput) elements.searchInput.value = '';
      if (elements.deepdiveSearchInput) elements.deepdiveSearchInput.value = '';
      if (elements.filterTime) elements.filterTime.value = '24h';
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = '24h';
      if (elements.regionFilterTabs) {
        elements.regionFilterTabs.querySelectorAll('.region-pill').forEach(b => b.classList.toggle('active', b.dataset.region === 'all'));
      }
      
      // Clear active card states in grid
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.outlet-marker').forEach(m => m.classList.remove('active'));
      
      updateTopicPillsActive('all');
      updateFilterIndicator();
      updateAppUI();
    });
  }

  // Headlines Feed Pagination: Show More Buttons (Pulse & Deep Dive)
  if (elements.headlinesShowMoreBtn) {
    elements.headlinesShowMoreBtn.addEventListener('click', () => {
      state.headlinesLimit += 20;
      renderHeadlines();
    });
  }

  if (elements.deepdiveHeadlinesShowMoreBtn) {
    elements.deepdiveHeadlinesShowMoreBtn.addEventListener('click', () => {
      state.headlinesLimit += 20;
      renderHeadlines();
    });
  }
  
  // Sort Buttons (Pulse)
  if (elements.sortDateBtn) {
    elements.sortDateBtn.addEventListener('click', () => {
      toggleSort('date');
    });
  }
  
  if (elements.sortVibeBtn) {
    elements.sortVibeBtn.addEventListener('click', () => {
      toggleSort('vibe');
    });
  }

  // Sort Buttons (Deep Dive)
  if (elements.deepdiveSortDateBtn) {
    elements.deepdiveSortDateBtn.addEventListener('click', () => {
      toggleSort('date');
    });
  }

  if (elements.deepdiveSortVibeBtn) {
    elements.deepdiveSortVibeBtn.addEventListener('click', () => {
      toggleSort('vibe');
    });
  }
  
  // Head-to-Head selection change
  if (elements.h2hSourceA) elements.h2hSourceA.addEventListener('change', renderHeadToHead);
  if (elements.h2hSourceB) elements.h2hSourceB.addEventListener('change', renderHeadToHead);

  // Story Compare tab: Topic & Timeframe controls for Head-to-Head
  if (elements.h2hTopicSelect) {
    elements.h2hTopicSelect.addEventListener('change', (e) => {
      state.h2hTopic = e.target.value;
      renderHeadToHead();
    });
  }

  if (elements.h2hTimeframeSelect) {
    elements.h2hTimeframeSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = e.target.value;
      if (elements.filterTime) elements.filterTime.value = e.target.value;
      updateAppUI();
    });
  }

  // Story Compare tab: Story Clusters Search, Filter & Sort
  if (elements.clustersSearchInput) {
    let clusterSearchTimer = null;
    elements.clustersSearchInput.addEventListener('input', (e) => {
      clearTimeout(clusterSearchTimer);
      clusterSearchTimer = setTimeout(() => {
        state.clusterSearch = e.target.value.toLowerCase().trim();
        renderStoryClusters();
      }, 150);
    });
  }

  if (elements.clustersTopicSelect) {
    elements.clustersTopicSelect.addEventListener('change', (e) => {
      state.clusterTopic = e.target.value;
      renderStoryClusters();
    });
  }

  if (elements.clustersSortSelect) {
    elements.clustersSortSelect.addEventListener('change', (e) => {
      state.clusterSort = e.target.value;
      renderStoryClusters();
    });
  }

  // Spectrum view toggle
  elements.viewToggleAverages.addEventListener('click', () => {
    switchSpectrumViewMode('averages');
  });

  elements.viewToggleDistribution.addEventListener('click', () => {
    switchSpectrumViewMode('distribution');
  });

  // Collapsible section toggles
  document.querySelectorAll('.section-collapse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const target = document.getElementById(targetId);
      if (!target) return;
      const isCollapsed = target.classList.toggle('is-collapsed');
      btn.classList.toggle('is-collapsed', isCollapsed);
      const span = btn.querySelector('span');
      if (span) span.textContent = isCollapsed ? 'Expand' : 'Collapse';
    });
  });

  // Toggle all 13 outlets button
  const toggleOutletsBtn = document.getElementById('toggle-all-outlets-btn');
  if (toggleOutletsBtn) {
    toggleOutletsBtn.addEventListener('click', () => {
      state.showAllOutlets = !state.showAllOutlets;
      renderComparisonMatrix();
      const textSpan = document.getElementById('toggle-outlets-text');
      const icon = document.getElementById('toggle-outlets-icon');
      if (textSpan) textSpan.textContent = state.showAllOutlets ? 'Show Top 6 Outlets' : 'Show All 13 Outlets';
      if (icon) icon.setAttribute('data-lucide', state.showAllOutlets ? 'chevrons-up' : 'chevrons-down');
      lucide.createIcons();
    });
  }

  // Quick jump sub-nav smooth active state
  const navPills = document.querySelectorAll('.nav-pill');
  navPills.forEach(pill => {
    pill.addEventListener('click', () => {
      navPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });
}

// Fetch cached data from server or baked static dataset
async function fetchData() {
  try {
    let data = null;

    // 1. Try local Express API first if available
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        data = await res.json();
      }
    } catch (_) {}

    // 2. If running statically (GitHub Pages / Cloudflare / Netlify), load baked data.json
    if (!data || !data.sources || Object.keys(data.sources).length === 0) {
      try {
        const cacheBuster = `?v=${Date.now()}`;
        const staticRes = await fetch(`data/data.json${cacheBuster}`);
        if (staticRes.ok) {
          data = await staticRes.json();
        }
      } catch (_) {}
    }

    // 3. Fallback to summary.json
    if (!data || !data.sources || Object.keys(data.sources).length === 0) {
      try {
        const cacheBuster = `?v=${Date.now()}`;
        const summaryRes = await fetch(`data/summary.json${cacheBuster}`);
        if (summaryRes.ok) {
          data = await summaryRes.json();
        }
      } catch (_) {}
    }

    if (data && data.sources && Object.keys(data.sources).length > 0) {
      state.sources = data.sources;
      state.lastUpdated = data.lastUpdated;
      state.analyzerUsed = data.analyzerUsed;
      state.editorialSummary = data.editorialSummary || (data.globalStats && data.globalStats.editorialSummary) || '';
      state.editorialSummaryDate = data.editorialSummaryDate || (data.globalStats && data.globalStats.editorialSummaryDate) || '';
      state.globalStats = data.globalStats || {};
      state.timeSeries = data.timeSeries || [];
      state.sharedStoryClusters = data.sharedStoryClusters || [];

      restoreStateFromUrl();
      updateAppUI();
    } else {
      // Prompt user to sync if cache is empty
      showEmptyState();
    }
  } catch (err) {
    console.error('Error fetching data:', err);
    showErrorState('Failed to load news source data.');
  }
}

// Sync feeds and analyze sentiment
async function syncData() {
  setSyncingState(true, 'Initiating sync request...');
  
  // Start polling loop!
  pollSyncStatus();
  
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  const openRouterApiKey = localStorage.getItem('openrouter_api_key') || '';
  const openRouterModel = localStorage.getItem('openrouter_model') || 'meta-llama/llama-3-8b-instruct:free';
  const groqApiKey = localStorage.getItem('groq_api_key') || '';
  const groqModel = localStorage.getItem('groq_model') || 'llama-3.1-8b-instant';
  const vibeCalcMethod = localStorage.getItem('vibe_calc_method') || 'active';
  
  try {
    const force = !!(elements.forceReanalyzeCheckbox && elements.forceReanalyzeCheckbox.checked);
    const analyzer = state.sentimentMode;
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ apiKey, openRouterApiKey, openRouterModel, groqApiKey, groqModel, force, analyzer, vibeCalcMethod })
    });
    
    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }
    
    const data = await res.json();
    
    console.log("Vibe-O-Meter sync complete. Sentiment analyzer used:", data.analyzerUsed);
    
    state.sources = data.sources;
    state.lastUpdated = data.lastUpdated;
    state.analyzerUsed = data.analyzerUsed;
    state.sharedStoryClusters = data.sharedStoryClusters || [];
    
    setSyncingState(false);
    updateAppUI();
    
    if (data.errors && data.errors.length > 0) {
      alert("Sync completed with warnings:\n\n" + data.errors.join("\n"));
    }
  } catch (err) {
    console.error('Sync failed:', err);
    alert('Synchronization failed. Please check backend logs. Details: ' + err.message);
    setSyncingState(false);
  }
}

// Set loading UI states during sync
function setSyncingState(isSyncing, message) {
  state.isSyncing = isSyncing;
  if (isSyncing) {
    const msg = message || 'Syncing & Analyzing (takes ~10s)...';
    state.syncMessage = msg;
    if (elements.syncBtn) {
      elements.syncBtn.disabled = true;
      const span = elements.syncBtn.querySelector('span');
      if (span) span.innerText = msg;
    }
    if (elements.syncIcon) elements.syncIcon.classList.add('spin');
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot loading';
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = msg;
  } else {
    state.syncMessage = '';
    if (elements.syncBtn) {
      elements.syncBtn.disabled = false;
      const label = state.sentimentMode === 'gemini' ? 'Run Gemini Analysis' : 'Run OpenRouter Analysis';
      const span = elements.syncBtn.querySelector('span');
      if (span) span.innerText = label;
    }
    if (elements.syncIcon) elements.syncIcon.classList.remove('spin');
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot green';
    const dateStr = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : 'Never';
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = `Last Updated: ${dateStr}`;
  }
}

let pollTimerId = null;

async function pollSyncStatus() {
  if (pollTimerId) clearTimeout(pollTimerId);
  
  try {
    const res = await fetch('/api/sync-status');
    const status = await res.json();
    
    if (status && status.inProgress) {
      // Backend is still processing! Update state and UI
      state.isSyncing = true;
      state.syncMessage = status.message || 'Sync in progress...';
      setSyncingState(true, state.syncMessage);
      
      // Schedule next poll
      pollTimerId = setTimeout(pollSyncStatus, 1500);
    } else {
      // Backend is idle! That means it has finished.
      if (state.isSyncing) {
        state.isSyncing = false;
        state.syncMessage = '';
        setSyncingState(false);
        // Refresh client data to show new analysis!
        fetchData();
      }
    }
  } catch (err) {
    console.error('Error polling sync status:', err);
    // Retry polling anyway in case of temporary network glitch
    if (state.isSyncing) {
      pollTimerId = setTimeout(pollSyncStatus, 2000);
    }
  }
}

// Switch active sentiment mode and update toggle tabs styling
function switchSentimentMode(mode) {
  state.sentimentMode = mode;
  
  const buttons = [
    { id: 'modeGeminiBtn', mode: 'gemini' },
    { id: 'modeVaderBtn', mode: 'vader' },
    { id: 'modeGlobalBtn', mode: 'global' }
  ];
  
  buttons.forEach(btnInfo => {
    const btn = elements[btnInfo.id];
    if (!btn) return;
    if (btnInfo.mode === mode) {
      btn.classList.add('active');
      btn.style.background = 'var(--accent-color)';
      btn.style.color = '#fff';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-secondary)';
    }
  });

  if (state.sources && Object.keys(state.sources).length > 0) {
    updateAppUI();
  }
}

// Switch Dashboard Tab (Pulse, Trends, Deep Dives, Methodology)
function switchTab(tabId) {
  if (tabId === 'feed') tabId = 'pulse';
  if (tabId === 'sources') tabId = 'deepdives';
  if (!['pulse', 'trends', 'compare', 'deepdives', 'methodology'].includes(tabId)) {
    tabId = 'pulse';
  }
  state.activeTab = tabId;

  // If in silver edition, restore doom dashboard UI
  if (state.edition === 'silver') {
    state.edition = 'doom';
    document.body.setAttribute('data-edition', 'doom');
    const editionDoom = document.getElementById('edition-btn-doom');
    const editionSilver = document.getElementById('edition-btn-silver');
    const editionSubtitle = document.getElementById('edition-subtitle');
    const silverSection = document.getElementById('silver-edition-section');
    const quickNavBar = document.getElementById('quick-nav-bar');
    if (editionDoom) editionDoom.classList.add('active');
    if (editionSilver) editionSilver.classList.remove('active');
    if (editionSubtitle) {
      editionSubtitle.innerText = "There's no such thing as good news — An autonomous daily audit of global media pessimism";
    }
    if (silverSection) {
      silverSection.classList.add('hidden');
      silverSection.style.display = 'none';
    }
    if (quickNavBar) {
      quickNavBar.classList.remove('hidden');
      quickNavBar.style.display = 'flex';
    }
  }

  // Update tab buttons
  document.querySelectorAll('.nav-pill-btn[data-tab]').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
  });

  // Update tab panels
  const panels = {
    pulse: document.getElementById('tab-panel-pulse'),
    trends: document.getElementById('tab-panel-trends'),
    compare: document.getElementById('tab-panel-compare'),
    deepdives: document.getElementById('tab-panel-deepdives'),
    methodology: document.getElementById('tab-panel-methodology')
  };

  Object.entries(panels).forEach(([id, panel]) => {
    if (panel) {
      if (id === tabId) {
        panel.classList.remove('hidden');
        panel.style.display = '';
      } else {
        panel.classList.add('hidden');
        panel.style.display = 'none';
      }
    }
  });

  // Toggle hero landing section visibility (only displayed on Daily Pulse, hidden on other tabs)
  const heroSection = document.getElementById('pulse-section');
  if (heroSection) {
    if (tabId === 'pulse') {
      heroSection.classList.remove('hidden');
      heroSection.style.display = '';
    } else {
      heroSection.classList.add('hidden');
      heroSection.style.display = 'none';
    }
  }

  // Recreate icons in newly shown panel
  if (window.lucide && lucide.createIcons) {
    lucide.createIcons();
  }

  // Trigger specialized view renders if needed
  if (tabId === 'trends') {
    renderHeatmapMatrix();
    renderSentimentTimeline();
  } else if (tabId === 'compare') {
    renderComparePage();
  } else if (tabId === 'deepdives') {
    renderComparisonMatrix();
    renderHeadlines();
  } else if (tabId === 'pulse') {
    renderDailyPulse();
    renderSpectrum();
    renderPulseTopStories();
  }

  // Sync URL state without jumping page scroll
  syncUrlState();
}
window.switchTab = switchTab;

// Smooth jump from Pulse to Outlets Deep Dive Feed
window.goToDeepDiveFeed = function(topic) {
  switchTab('deepdives');
  if (topic && topic !== 'all') {
    state.filters.category = topic;
    updateTopicPillsActive(topic);
    updateFilterIndicator();
  }
  renderHeadlines();
  setTimeout(() => {
    const el = document.getElementById('deepdive-feed-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
};

// Reset Pulse Top Stories topic filter
window.clearPulseClusterTopic = function() {
  state.filters.category = 'all';
  updateTopicPillsActive('all');
  updateFilterIndicator();
  updateAppUI();
};

// Switch active spectrum view mode (Averages vs Beeswarm Lanes)
function switchSpectrumViewMode(mode) {
  state.spectrumViewMode = mode;
  
  if (mode === 'averages') {
    elements.viewToggleAverages.classList.add('active');
    elements.viewToggleAverages.style.background = 'var(--accent-color)';
    elements.viewToggleAverages.style.color = '#fff';
    elements.viewToggleAverages.style.boxShadow = '0 2px 6px rgba(99,102,241,0.25)';
    
    elements.viewToggleDistribution.classList.remove('active');
    elements.viewToggleDistribution.style.background = 'transparent';
    elements.viewToggleDistribution.style.color = 'var(--text-secondary)';
    elements.viewToggleDistribution.style.boxShadow = 'none';
    
    document.getElementById('averages-view-container').style.display = 'block';
    document.getElementById('distribution-view-container').style.display = 'none';
    document.getElementById('spectrum-legend-text').innerText = '* Click on any source marker to filter headlines below.';
  } else {
    elements.viewToggleAverages.classList.remove('active');
    elements.viewToggleAverages.style.background = 'transparent';
    elements.viewToggleAverages.style.color = 'var(--text-secondary)';
    elements.viewToggleAverages.style.boxShadow = 'none';
    
    elements.viewToggleDistribution.classList.add('active');
    elements.viewToggleDistribution.style.background = 'var(--accent-color)';
    elements.viewToggleDistribution.style.color = '#fff';
    elements.viewToggleDistribution.style.boxShadow = '0 2px 6px rgba(99,102,241,0.25)';
    
    document.getElementById('averages-view-container').style.display = 'none';
    document.getElementById('distribution-view-container').style.display = 'flex';
    document.getElementById('spectrum-legend-text').innerText = '* Click on any source name to filter the stream. Click a dot to view and scroll to the article.';
  }
  
  renderSpectrum();
}

// Compute dynamic statistics based on selected mode (local ensemble vs Gemini)
function getResolvedSources() {
  const resolved = {};
  
  Object.keys(state.sources).forEach(id => {
    const source = state.sources[id];
    let totalSentiment = 0;
    let scoredCount = 0;
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    
    const resolvedArticles = [];
    const articles = source.articles || [];
    
    articles.forEach(art => {
      // Apply Time Range filter
      if (state.filters.time !== 'all') {
        const artDate = new Date(art.pubDate);
        const timeDiff = new Date() - artDate;
        let limitMs = 0;
        
        if (state.filters.time === '3h') limitMs = 3 * 60 * 60 * 1000;
        else if (state.filters.time === '6h') limitMs = 6 * 60 * 60 * 1000;
        else if (state.filters.time === '12h') limitMs = 12 * 60 * 60 * 1000;
        else if (state.filters.time === '24h') limitMs = 24 * 60 * 60 * 1000;
        else if (state.filters.time === '3d') limitMs = 3 * 24 * 60 * 60 * 1000;
        else if (state.filters.time === '7d') limitMs = 7 * 24 * 60 * 60 * 1000;
        else if (state.filters.time === '30d') limitMs = 30 * 24 * 60 * 60 * 1000;
        
        if (timeDiff > limitMs) {
          return; // Skip article if outside time range
        }
      }

      // Resolve active values (Gemini AI exclusively)
      let score = null;
      let explanation = 'Pending evaluation by Gemini AI (queued for subsequent sync cycle).';
      let category = art.categoryGemini || art.category || 'other';

      const rawScore = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : art.sentiment;
      const rawExp = art.explanationGemini || art.explanation || '';
      const hasGemini = typeof rawScore === 'number' && !isNaN(rawScore) && !rawExp.includes('Analyzed locally');
      if (hasGemini) {
        score = rawScore;
        explanation = rawExp || `Analyzed using Google Gemini. Score: ${score.toFixed(2)}.`;
      }
      
      if (score !== null && score !== undefined) {
        totalSentiment += score;
        scoredCount++;
        if (score > 0.15) {
          positive++;
        } else if (score < -0.15) {
          negative++;
        } else {
          neutral++;
        }
      }
      
      resolvedArticles.push({
        ...art,
        sentiment: score,
        explanation,
        category
      });
    });
    
    const averageSentiment = scoredCount > 0 ? (totalSentiment / scoredCount) : null;
    
    resolved[id] = {
      name: source.name,
      averageSentiment: averageSentiment !== null ? Number(averageSentiment.toFixed(3)) : null,
      distribution: scoredCount > 0 ? { positive, neutral, negative } : { positive: 0, neutral: 0, negative: 0 },
      articles: resolvedArticles,
      scoredCount: scoredCount,
      error: source.error
    };
  });
  
  return resolved;
}

// Update UI components when new data is available
function updateAppUI() {
  if (!state.sources || Object.keys(state.sources).length === 0) {
    showEmptyState();
    return;
  }
  
  // Resolve active sources metrics based on selected sentiment view mode
  resolvedSources = getResolvedSources();
  syncUrlState();

  // Update control bar texts
  if (state.isSyncing) {
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = state.syncMessage || 'Sync in progress...';
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot loading';
  } else {
    const dateStr = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : 'Never';
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = `Last Updated: ${dateStr}`;
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot green';
  }
  
  if (elements.analyzerBadge) {
    elements.analyzerBadge.innerText = state.analyzerUsed || 'None';
    if (state.analyzerUsed && state.analyzerUsed.includes('Gemini')) {
      elements.analyzerBadge.style.color = '#818cf8';
      elements.analyzerBadge.style.borderColor = 'rgba(129, 140, 248, 0.4)';
    } else {
      elements.analyzerBadge.style.color = 'var(--text-secondary)';
      elements.analyzerBadge.style.borderColor = 'var(--border-color)';
    }
  }
  
  // If in silver edition, render the dedicated Some Good News view and exit
  if (state.edition === 'silver') {
    renderSilverEdition();
    return;
  }

  // Setup selectors
  populateFilterOptions();
  
  // Render views for currently active tab only to eliminate latency
  if (state.activeTab === 'pulse') {
    renderDailyPulse();
    renderSpectrum();
    renderPulseTopStories();
    renderHeadlines();
  } else if (state.activeTab === 'trends') {
    renderHeatmapMatrix();
    renderSentimentTimeline();
  } else if (state.activeTab === 'compare') {
    renderComparePage();
  } else if (state.activeTab === 'deepdives') {
    renderComparisonMatrix();
    renderHeadlines();
  }
}

// Two-Sided App Edition Switcher (No Good News vs Some Good News)
function switchEdition(edition) {
  state.edition = edition;
  document.body.setAttribute('data-edition', edition);

  const editionDoom = document.getElementById('edition-btn-doom');
  const editionSilver = document.getElementById('edition-btn-silver');
  const editionSubtitle = document.getElementById('edition-subtitle');
  const silverSection = document.getElementById('silver-edition-section');
  const pulseSection = document.getElementById('pulse-section');
  const quickNavBar = document.getElementById('quick-nav-bar');

  if (edition === 'silver') {
    if (editionSilver) editionSilver.classList.add('active');
    if (editionDoom) editionDoom.classList.remove('active');
    if (editionSubtitle) {
      editionSubtitle.innerText = "Turns out not everything is on fire — Sifting rare specks of hope from the 24/7 doom machine";
    }
    if (silverSection) {
      silverSection.classList.remove('hidden');
      silverSection.style.display = 'flex';
    }
    if (pulseSection) {
      pulseSection.classList.add('hidden');
      pulseSection.style.display = 'none';
    }
    if (quickNavBar) {
      quickNavBar.classList.add('hidden');
      quickNavBar.style.display = 'none';
    }

    // Hide all standard tab panels
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.add('hidden');
      p.style.display = 'none';
    });

    renderSilverEdition();
  } else {
    if (editionDoom) editionDoom.classList.add('active');
    if (editionSilver) editionSilver.classList.remove('active');
    if (editionSubtitle) {
      editionSubtitle.innerText = "There's no such thing as good news — An autonomous daily audit of global media pessimism";
    }
    if (silverSection) {
      silverSection.classList.add('hidden');
      silverSection.style.display = 'none';
    }
    if (quickNavBar) {
      quickNavBar.classList.remove('hidden');
      quickNavBar.style.display = 'flex';
    }

    // Reset inline display style on all tab panels so switchTab works cleanly
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.style.display = '';
    });

    resolvedSources = getResolvedSources();
    switchTab(state.activeTab || 'pulse');
  }

  syncUrlState();
  if (window.lucide && lucide.createIcons) {
    lucide.createIcons();
  }
}

// Global navigation helpers for Silver Edition
window.setSilverTimeframe = function(val) {
  state.filters.time = val;
  state.silverLimit = 24;
  const silverSelect = document.getElementById('silver-timeframe-select');
  if (silverSelect) silverSelect.value = val;
  if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = val;
  if (elements.filterTime) elements.filterTime.value = val;
  updateAppUI();
};

window.setSilverTopic = function(val) {
  state.silverTopic = val;
  state.silverLimit = 24;
  const topicSelect = document.getElementById('silver-topic-select');
  if (topicSelect) topicSelect.value = val;
  renderSilverEdition();
};

window.copyStoryLink = function(url, btn) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;color:#16a34a;"></i> <span>Copied!</span>`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = orig;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    }).catch(() => {});
  }
};

// Render Dedicated "Some Good News" View (Broadsheet Magazine Grid with Topic & Timeframe Filters)
function renderSilverEdition() {
  const silverSection = document.getElementById('silver-edition-section');
  if (!silverSection) return;

  const silverTimeSelect = document.getElementById('silver-timeframe-select');
  if (silverTimeSelect && state.filters.time) {
    silverTimeSelect.value = state.filters.time;
  }

  const silverTopicSelect = document.getElementById('silver-topic-select');
  if (silverTopicSelect) {
    silverTopicSelect.value = state.silverTopic || 'all';
  }

  const container = document.getElementById('silver-stories-container');
  const statCount = document.getElementById('silver-stat-count-pill');
  const statTopScore = document.getElementById('silver-stat-score-pill');

  if (!container) return;
  container.innerHTML = '';

  // 1. Gather all positive articles from resolvedSources (already time-filtered)
  const positiveArticles = [];
  const activeTopic = (state.silverTopic || 'all').toLowerCase();

  Object.keys(resolvedSources).forEach(sourceId => {
    const src = resolvedSources[sourceId];
    if (src && src.articles) {
      src.articles.forEach(art => {
        if (typeof art.sentiment === 'number' && art.sentiment > 0.05) {
          const cat = (art.category || 'other').toLowerCase();
          let matchesTopic = (activeTopic === 'all');
          if (!matchesTopic) {
            if (activeTopic === 'climate') matchesTopic = (cat === 'climate' || cat === 'environment' || cat === 'nature');
            else if (activeTopic === 'science') matchesTopic = (cat === 'science' || cat === 'technology' || cat === 'tech' || cat === 'space');
            else if (activeTopic === 'world') matchesTopic = (cat === 'world' || cat === 'society' || cat === 'global');
            else if (activeTopic === 'health') matchesTopic = (cat === 'health' || cat === 'medicine');
            else if (activeTopic === 'business') matchesTopic = (cat === 'business' || cat === 'markets' || cat === 'economy');
            else if (activeTopic === 'politics') matchesTopic = (cat === 'politics' || cat === 'policy');
            else if (activeTopic === 'culture') matchesTopic = (cat === 'culture' || cat === 'arts' || cat === 'entertainment');
            else if (activeTopic === 'sports') matchesTopic = (cat === 'sports');
            else matchesTopic = (cat === activeTopic);
          }

          if (matchesTopic) {
            positiveArticles.push({
              sourceId,
              sourceName: src.name,
              ...art
            });
          }
        }
      });
    }
  });

  // 2. Deduplicate articles by canonical URL and clean title
  positiveArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  const seenSilverUrls = new Set();
  const seenSilverTitles = new Set();
  const uniqueArticles = [];
  for (const art of positiveArticles) {
    const cUrl = canonicalUrl(art.link);
    const cTitle = cleanHeadlineTitle(art.title);
    if (cUrl && seenSilverUrls.has(cUrl)) continue;
    if (cTitle && seenSilverTitles.has(cTitle)) continue;
    if (cUrl) seenSilverUrls.add(cUrl);
    if (cTitle) seenSilverTitles.add(cTitle);
    uniqueArticles.push(art);
  }

  // 3. Sort descending by highest positive sentiment score
  uniqueArticles.sort((a, b) => b.sentiment - a.sentiment);

  // 4. Update Summary Stats Pills
  const topScore = uniqueArticles.length > 0 ? uniqueArticles[0].sentiment : 0;
  if (statCount) statCount.innerText = `${uniqueArticles.length} Stor${uniqueArticles.length === 1 ? 'y' : 'ies'}`;
  if (statTopScore) statTopScore.innerText = topScore > 0 ? `+${topScore.toFixed(2)} Max` : '+0.00 Max';

  // Timeframe label for contextual messaging
  let timeframeLabel = 'Past 24 Hours';
  if (state.filters.time === '3h') timeframeLabel = 'Past 3 Hours';
  else if (state.filters.time === '6h') timeframeLabel = 'Past 6 Hours';
  else if (state.filters.time === '12h') timeframeLabel = 'Past 12 Hours';
  else if (state.filters.time === '3d') timeframeLabel = 'Past 3 Days';
  else if (state.filters.time === '7d') timeframeLabel = 'Past 7 Days';
  else if (state.filters.time === '30d') timeframeLabel = 'Past 30 Days';
  else if (state.filters.time === 'all') timeframeLabel = 'All Time';

  if (uniqueArticles.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3.5rem 1.5rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 18px; width: 100%;">
        <div style="font-size: 2.8rem; margin-bottom: 0.75rem;">⛅</div>
        <h3 style="font-size: 1.45rem; font-family: var(--font-serif); margin-bottom: 0.5rem; color: var(--text-primary);">A Drought of Optimism Across Global News</h3>
        <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 540px; margin: 0 auto 1.5rem; line-height: 1.6;">
          During ${timeframeLabel}${activeTopic !== 'all' ? ` for "${activeTopic}"` : ''}, major global newsrooms published near-zero qualifying positive stories. Commercial news desks operate overwhelmingly on threats and alarm. Expand the window below to uncover constructive breakthroughs.
        </p>
        <div style="display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;">
          ${activeTopic !== 'all' ? '<button class="btn btn-secondary btn-sm" onclick="setSilverTopic(\'all\')">Clear Topic Filter</button>' : ''}
          <button class="btn btn-secondary btn-sm" onclick="setSilverTimeframe('3d')">Expand to Past 3 Days</button>
          <button class="btn btn-secondary btn-sm" onclick="setSilverTimeframe('7d')">Expand to Past 7 Days</button>
          <button class="btn btn-secondary btn-sm" onclick="setSilverTimeframe('all')">View All-Time Top Stories</button>
        </div>
      </div>
    `;
    return;
  }

  // 5. Render directly in BroadSheet Grid (sliced to initial batch for instant 60fps switching)
  state.silverLimit = state.silverLimit || 24;
  const displayedArticles = uniqueArticles.slice(0, state.silverLimit);

  const gridEl = document.createElement('div');
  gridEl.className = 'silver-grid-container';

  displayedArticles.forEach((art, idx) => {
    const card = document.createElement('div');
    card.className = 'silver-story-card silver-card-grid-item';
    const related = findRelatedCoverage(art, uniqueArticles);
    card.innerHTML = createSilverCardHTML(art, idx, related, false);
    gridEl.appendChild(card);
  });

  container.appendChild(gridEl);

  // Load More Constructive Stories
  if (uniqueArticles.length > displayedArticles.length) {
    const moreWrap = document.createElement('div');
    moreWrap.className = 'silver-load-more-wrap';
    moreWrap.style.cssText = 'text-align: center; margin: 2rem 0 3.5rem 0; width: 100%;';
    moreWrap.innerHTML = `
      <button class="btn btn-secondary" style="padding: 0.75rem 2.2rem; border-radius: 28px; font-weight: 600; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 0.5rem; background: var(--bg-card); border: 1.5px solid var(--border-color); color: var(--text-primary); cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.06);" id="silver-load-more-btn">
        <i data-lucide="chevron-down"></i> Load More Constructive Stories (${displayedArticles.length} of ${uniqueArticles.length})
      </button>
    `;
    container.appendChild(moreWrap);
    const loadBtn = moreWrap.querySelector('#silver-load-more-btn');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        state.silverLimit += 24;
        renderSilverEdition();
      });
    }
  }

  if (window.lucide && lucide.createIcons) {
    lucide.createIcons();
  }
}

// Populate source options dynamically in drop-down filters
function populateFilterOptions() {
  const sources = Object.keys(state.sources).map(id => ({
    id,
    name: state.sources[id].name
  }));
  
  // Populate filter source dropdown
  if (elements.filterSource) {
    elements.filterSource.innerHTML = '<option value="all">All Sources</option>';
    sources.forEach(src => {
      elements.filterSource.innerHTML += `<option value="${src.id}">${src.name}</option>`;
    });
    elements.filterSource.value = state.filters.source;
  }

  // Populate Deep Dive dedicated source filter dropdown
  if (elements.deepdiveFilterSource) {
    elements.deepdiveFilterSource.innerHTML = `<option value="all">All ${sources.length} Outlets</option>`;
    sources.forEach(src => {
      elements.deepdiveFilterSource.innerHTML += `<option value="${src.id}">${src.name}</option>`;
    });
    elements.deepdiveFilterSource.value = state.filters.source;
  }

  // Sync Deep Dive timeframe filter dropdown
  if (elements.deepdiveFilterTime && elements.deepdiveFilterTime.value !== state.filters.time) {
    elements.deepdiveFilterTime.value = state.filters.time;
  }
  
  // Populate H2H source dropdowns
  const prevA = elements.h2hSourceA.value;
  const prevB = elements.h2hSourceB.value;
  
  elements.h2hSourceA.innerHTML = '';
  elements.h2hSourceB.innerHTML = '';
  
  sources.forEach((src, idx) => {
    elements.h2hSourceA.innerHTML += `<option value="${src.id}" ${idx === 0 ? 'selected' : ''}>${src.name}</option>`;
    elements.h2hSourceB.innerHTML += `<option value="${src.id}" ${idx === 1 ? 'selected' : ''}>${src.name}</option>`;
  });
  
  // Keep previous values if they still exist
  if (sources.some(s => s.id === prevA)) elements.h2hSourceA.value = prevA;
  if (sources.some(s => s.id === prevB)) elements.h2hSourceB.value = prevB;
}

// Map continuous sentiment score to calibrated color matching source bubble rings
function getValenceColor(score) {
  if (score === null || score === undefined || isNaN(score)) return '#64748b';
  if (score < -0.25) return '#dc2626'; // dark crimson (severe crisis)
  if (score < -0.12) return '#ef4444'; // negative coral / alarmist
  if (score < -0.02) return '#f97316'; // amber-orange / leaning gloomy
  if (score > 0.25) return '#15803d'; // deep positive emerald
  if (score > 0.12) return '#22c55e'; // positive emerald
  if (score > 0.02) return '#10b981'; // gentle positive
  return '#64748b'; // objective neutral slate
}

// Draw the Vibe Spectrum Axis (Hero Averages vs Beeswarm Lanes)
function renderSpectrum() {
  const sources = resolvedSources || getResolvedSources();
  const isCategoryFiltered = state.filters.category !== 'all';
  
  // Calculate average for each source (considering active category filter if set)
  const sourceScores = {};
  Object.keys(sources).forEach(id => {
    const src = sources[id];
    let arts = src.articles || [];
    if (isCategoryFiltered) {
      arts = arts.filter(a => (a.category || 'other') === state.filters.category);
    }
    const scored = arts.filter(a => typeof a.sentiment === 'number');
    const avg = scored.length > 0 ? (scored.reduce((sum, a) => sum + a.sentiment, 0) / scored.length) : null;
    sourceScores[id] = { avg, scoredCount: scored.length, articles: arts };
  });

  const validScores = Object.values(sourceScores)
    .map(s => s.avg)
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (state.spectrumViewMode === 'averages') {
    elements.spectrumMarkers.innerHTML = '';
    const markerPositions = [];

    const minAvg = validScores.length > 0 ? Math.min(...validScores) : -0.5;
    const maxAvg = validScores.length > 0 ? Math.max(...validScores) : 0.05;

    // Normed spacing: dynamically scale the track domain
    const pad = Math.max(0.06, (maxAvg - minAvg) * 0.12);
    const domainMin = Math.floor((minAvg - pad) * 10) / 10;
    const domainMax = Math.ceil((maxAvg + pad) * 10) / 10;
    const domainSpan = Math.max(0.15, domainMax - domainMin);

    // Calibrate the track's color gradient dynamically across the normed domain
    // so the track background precisely reflects the colors of the source circles!
    const trackElem = document.querySelector('.spectrum-track');
    if (trackElem) {
      const stops = [];
      const numSteps = 12;
      for (let s = 0; s <= numSteps; s++) {
        const pct = (s / numSteps) * 100;
        // In the marker positioning, percentage maps from 6% to 94% across [domainMin, domainMax]
        const scoreAtPct = domainMin + (domainSpan * ((pct - 6) / 88));
        const color = getValenceColor(scoreAtPct);
        stops.push(`${color} ${pct.toFixed(1)}%`);
      }
      trackElem.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
    }

    // Also calibrate the subtle backdrop glow of the container to match
    const containerElem = document.getElementById('averages-view-container');
    if (containerElem) {
      const bgStops = [];
      for (let s = 0; s <= 6; s++) {
        const pct = (s / 6) * 100;
        const scoreAtPct = domainMin + (domainSpan * ((pct - 6) / 88));
        const color = getValenceColor(scoreAtPct);
        bgStops.push(`${color}0a ${pct.toFixed(1)}%`);
      }
      containerElem.style.background = `linear-gradient(to right, ${bgStops.join(', ')})`;
    }

    // Update dynamic tick labels
    const ticksContainer = document.querySelector('.spectrum-ticks');
    if (ticksContainer) {
      ticksContainer.innerHTML = '';
      for (let t = 0; t <= 4; t++) {
        const tickScore = domainMin + (domainSpan * (t / 4));
        const span = document.createElement('span');
        span.style.cssText = 'position: relative; width: 2px; height: 14px; background-color: var(--border-color);';
        span.innerHTML = `<span style="position: absolute; top: 16px; left: 50%; transform: translateX(-50%); font-size: 0.68rem; font-weight: 600; color: var(--text-muted); white-space: nowrap;">${tickScore > 0 ? '+' : ''}${tickScore.toFixed(2)}</span>`;
        ticksContainer.appendChild(span);
      }
    }

    const isMobileTrack = window.innerWidth <= 640;
    const minGapPct = isMobileTrack ? 9.5 : 5.2;
    const rowStepPx = isMobileTrack ? 36 : 42;
    const bubbleSize = isMobileTrack ? 28 : 34;

    Object.keys(sources).forEach(id => {
      const source = sources[id];
      const data = sourceScores[id];
      if (data.avg === null || data.scoredCount === 0) return;
      
      const avg = data.avg;
      // Stretched normed percentage: 6% to 94%
      const percentage = Math.max(6, Math.min(94, 6 + (((avg - domainMin) / domainSpan) * 88)));
      
      // Dynamic collision avoidance: stack into additional tiers when markers are close horizontally
      let yLevel = 0;
      let collision = true;
      while (collision) {
        collision = false;
        for (const pos of markerPositions) {
          if (Math.abs(pos.x - percentage) < minGapPct && pos.y === yLevel) {
            yLevel++;
            collision = true;
            break;
          }
        }
      }

      markerPositions.push({ x: percentage, y: yLevel });
      
      // Absolute valence color calibrated identically to the track gradient
      const markerColor = getValenceColor(avg);

      const meta = SOURCE_META[id] || { initials: id.toUpperCase().slice(0, 3), color: '#333' };
      const yOffset = yLevel * rowStepPx;
      const labelPosStyle = percentage < 22
        ? 'left: 0; transform: none;'
        : (percentage > 78 ? 'right: 0; left: auto; transform: none;' : 'left: 50%; transform: translateX(-50%);');
      
      const marker = document.createElement('div');
      marker.className = `outlet-marker ${state.filters.source === id ? 'active' : ''}`;
      marker.style.left = `${percentage}%`;
      marker.style.bottom = `${yOffset}px`;
      marker.setAttribute('data-id', id);
      
      marker.innerHTML = `
        <div class="marker-bubble" style="background-color: ${meta.color}; color: #fff; width: ${bubbleSize}px; height: ${bubbleSize}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: ${isMobileTrack ? '0.66rem' : '0.75rem'}; border: 2.5px solid ${markerColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.18); transition: transform 0.2s;">
          <span>${meta.initials}</span>
        </div>
        <div class="marker-label" style="position: absolute; top: -28px; ${labelPosStyle} opacity: 0; pointer-events: none; background: var(--bg-card); border: 1px solid var(--border-color); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; box-shadow: 0 4px 14px rgba(0,0,0,0.18); white-space: nowrap; color: var(--text-primary); transition: all 0.2s; z-index: 40;">
          ${source.name}: <strong style="color:${markerColor};">${avg > 0 ? '+' : ''}${avg.toFixed(2)}</strong> ${isCategoryFiltered ? `(${state.filters.category})` : ''}
        </div>
      `;
      
      marker.addEventListener('click', () => {
        toggleSourceFilter(id);
      });
      
      elements.spectrumMarkers.appendChild(marker);
    });
    
    // Dynamically adjust track container height so rows never collide or overflow the container
    const maxY = markerPositions.length > 0 ? Math.max(...markerPositions.map(p => p.y), 0) : 0;
    const trackContainerElem = document.querySelector('.spectrum-track-container');
    if (trackContainerElem) {
      const calculatedHeight = Math.max(isMobileTrack ? 175 : 195, 70 + ((maxY + 1) * (rowStepPx + 2)));
      trackContainerElem.style.height = `${calculatedHeight}px`;
    }

    setupSpectrumMagnification();
  } else {
    // DISTRIBUTION VIEW: Beeswarm Plot Lanes
    elements.spectrumLanes.innerHTML = '';
    
    // Sort sources by average sentiment (highest to lowest)
    const sortedIds = Object.keys(sources).sort((a, b) => {
      const valA = typeof sourceScores[a]?.avg === 'number' ? sourceScores[a].avg : -999;
      const valB = typeof sourceScores[b]?.avg === 'number' ? sourceScores[b].avg : -999;
      return valB - valA;
    });
    
    sortedIds.forEach(id => {
      const source = sources[id];
      const data = sourceScores[id];
      if (data.articles.length === 0 && isCategoryFiltered) return;
      
      const avg = data.avg ?? 0;
      const avgPct = Math.max(0, Math.min(100, ((avg + 1) / 2) * 100));
      const meta = SOURCE_META[id] || { initials: id.slice(0, 3).toUpperCase(), color: '#10b981' };
      
      const lane = document.createElement('div');
      lane.className = `spectrum-lane ${state.filters.source === id ? 'active' : ''}`;
      lane.style.cssText = 'display: flex; align-items: center; gap: 1.25rem; width: 100%; height: 48px; position: relative; margin-bottom: 0.35rem;';
      
      const avgLabel = data.scoredCount > 0 ? `Avg: ${avg > 0 ? '+' : ''}${avg.toFixed(2)}` : 'N/A';
      const avgColor = avg > 0.15 ? 'var(--pos-color)' : (avg < -0.15 ? 'var(--neg-color)' : 'var(--text-secondary)');
      
      const sourceHTML = `
        <div class="lane-source-info" onclick="toggleSourceFilter('${id}')" 
             style="display: flex; align-items: center; gap: 0.6rem; width: 160px; cursor: pointer; user-select: none; padding: 0.35rem 0.5rem; border-radius: 8px; transition: all 0.2s; background: ${state.filters.source === id ? 'var(--bg-secondary)' : 'transparent'}; border: 1px solid ${state.filters.source === id ? 'var(--border-color)' : 'transparent'}; flex-shrink: 0;">
          <div style="background-color: ${meta.color}; color: #fff; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            ${meta.initials}
          </div>
          <div style="display: flex; flex-direction: column; overflow: hidden; text-align: left;">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">${source.name}</span>
            <span style="font-size: 0.7rem; font-weight: 600; color: ${avgColor}; line-height: 1.2;">
              ${avgLabel} (${data.scoredCount})
            </span>
          </div>
        </div>
      `;
      
      // Strict lane-confined honeycomb packing for article dots
      // 3 vertical slots inside the 34px track container: 0px (center), -7px (upper), +7px (lower)
      const verticalSlots = [0, -7, 7];
      const dotPositions = [];
      const scoredArticles = (data.articles || []).filter(art => typeof art.sentiment === 'number');
      
      const dotsHTML = scoredArticles.map((art, idx) => {
        const score = art.sentiment;
        const rawX = ((score + 1) / 2) * 100;
        
        let chosenX = rawX;
        let chosenY = 0;
        let placed = false;
        
        for (let step = 0; step <= 16; step++) {
          const xOffset = step === 0 ? 0 : (step % 2 === 1 ? 1 : -1) * Math.ceil(step / 2) * 1.2;
          const xCandidate = rawX + xOffset;
          for (const ySlot of verticalSlots) {
            const collides = dotPositions.some(p => Math.abs(p.x - xCandidate) < 1.05 && p.y === ySlot);
            if (!collides) {
              chosenX = Math.max(1, Math.min(99, xCandidate));
              chosenY = ySlot;
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
        if (!placed) {
          chosenX = Math.max(1, Math.min(99, rawX + ((idx % 5) - 2) * 1.5));
          chosenY = verticalSlots[idx % verticalSlots.length];
        }
        dotPositions.push({ x: chosenX, y: chosenY });
        
        let dotColor = 'var(--neu-color)';
        if (score > 0.15) dotColor = 'var(--pos-color)';
        else if (score < -0.15) dotColor = 'var(--neg-color)';
        
        const cardId = `art-card-${id}-${idx}`;
        const cleanTitle = art.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        return `
          <div class="spectrum-dot" 
               onclick="scrollToArticle('${cardId}')"
               onmouseenter="showGlobalTooltip(event, '${cleanTitle}', ${score}, '${source.name}', '${meta.color}')"
               onmouseleave="hideGlobalTooltip()"
               style="position: absolute; left: calc(${chosenX}% - 4px); top: calc(50% + ${chosenY}px - 4px); width: 8px; height: 8px; border-radius: 50%; background-color: ${dotColor}; border: 1px solid var(--bg-primary); cursor: pointer; transition: transform 0.15s ease; z-index: 5;">
          </div>
        `;
      }).join('');
      
      const averageMarkerHTML = data.scoredCount > 0 ? `
        <div style="position: absolute; left: calc(${avgPct}% - 1px); top: 15%; bottom: 15%; width: 2px; background-color: ${meta.color}; z-index: 2; opacity: 0.6;" title="Average: ${avg.toFixed(2)}"></div>
        <div style="position: absolute; left: calc(${avgPct}% - 4px); top: 4%; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid ${meta.color}; z-index: 3;" title="Average: ${avg.toFixed(2)}"></div>
      ` : '';
      
      const trackHTML = `
        <div class="lane-track-container" style="position: relative; flex-grow: 1; height: 34px; background: var(--bg-secondary); border-radius: 17px; border: 1px solid var(--border-color); display: flex; align-items: center; overflow: hidden;">
          <div style="position: absolute; left: 12px; right: 12px; height: 1.5px; background: var(--border-color); opacity: 0.4; z-index: 1; top: 50%;"></div>
          ${averageMarkerHTML}
          <div style="position: absolute; left: 12px; right: 12px; top: 0; bottom: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;">
            ${dotsHTML || '<span style="font-size: 0.7rem; color: var(--text-muted); font-style: italic; z-index: 2;">No articles in selected timeframe</span>'}
          </div>
        </div>
      `;
      
      lane.innerHTML = sourceHTML + trackHTML;
      elements.spectrumLanes.appendChild(lane);
    });
  }
}

window.showGlobalTooltip = function(e, title, score, sourceName, brandColor) {
  const tooltip = document.getElementById('global-spectrum-tooltip');
  if (!tooltip) return;
  
  let mood = 'Neutral';
  let moodClass = 'neutral';
  if (score > 0.15) { mood = 'Positive'; moodClass = 'positive'; }
  else if (score < -0.15) { mood = 'Negative'; moodClass = 'negative'; }
  
  tooltip.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.25rem;">
      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${brandColor};"></span>
      <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">${sourceName}</span>
    </div>
    <div style="font-weight: 600; margin-bottom: 0.25rem; line-height: 1.3; color: var(--text-primary);">${title}</div>
    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.35rem;">
      <span>Score: <strong style="color: var(--text-primary);">${score > 0 ? '+' : ''}${score.toFixed(2)}</strong></span>
      <span style="font-weight:700;" class="${moodClass}">${mood}</span>
    </div>
  `;
  
  tooltip.style.display = 'block';
  
  const container = document.getElementById('spectrum-card-wrapper');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const dotRect = e.target.getBoundingClientRect();
  
  const left = dotRect.left - rect.left + (dotRect.width / 2);
  const top = dotRect.top - rect.top - tooltip.offsetHeight - 8; // 8px spacing
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.transform = 'translateX(-50%)';
};

window.hideGlobalTooltip = function() {
  const tooltip = document.getElementById('global-spectrum-tooltip');
  if (tooltip) tooltip.style.display = 'none';
};

window.scrollToArticle = function(cardId) {
  const card = document.getElementById(cardId);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-flash');
    setTimeout(() => {
      card.classList.remove('highlight-flash');
    }, 2000);
  }
};

// Create custom SVG Gauge Dial
function createSvgGauge(score) {
  // Score is between -1.0 and 1.0.
  // Rotational angle for dial: -90 degrees (negative) to 90 degrees (positive)
  if (score === null || score === undefined) {
    return `
      <svg viewBox="0 0 100 55" class="gauge-svg" style="width: 100px; height: 55px;">
        <path d="M 15 45 A 35 35 0 0 1 85 45" fill="none" stroke="var(--border-color)" stroke-width="8" stroke-linecap="round" opacity="0.4" />
        <circle cx="50" cy="45" r="5" fill="var(--text-muted)" />
      </svg>
    `;
  }
  const angle = Math.max(-90, Math.min(90, score * 90));
  
  // Color of dial depending on sentiment
  let themeColor = 'var(--neu-color)';
  if (score > 0.15) themeColor = 'var(--pos-color)';
  if (score < -0.15) themeColor = 'var(--neg-color)';
  
  return `
    <svg viewBox="0 0 100 55" class="gauge-svg" style="width: 100px; height: 55px;">
      <!-- Track Arc -->
      <path d="M 15 45 A 35 35 0 0 1 85 45" fill="none" stroke="var(--border-color)" stroke-width="8" stroke-linecap="round" opacity="0.4" />
      <!-- Red (negative) sector visual helper -->
      <path d="M 15 45 A 35 35 0 0 1 40 18" fill="none" stroke="var(--neg-color)" stroke-width="8" stroke-opacity="0.25" />
      <!-- Green (positive) sector visual helper -->
      <path d="M 60 18 A 35 35 0 0 1 85 45" fill="none" stroke="var(--pos-color)" stroke-width="8" stroke-opacity="0.25" />
      
      <!-- Needle pointer -->
      <line x1="50" y1="45" x2="50" y2="18" stroke="${themeColor}" stroke-width="3" stroke-linecap="round" transform="rotate(${angle}, 50, 45)" style="transition: transform 0.5s ease;" />
      <circle cx="50" cy="45" r="4.5" fill="${themeColor}" />
      <circle cx="50" cy="45" r="2.2" fill="var(--bg-card)" />
    </svg>
  `;
}

// Generate inline SVG Sparkline showing historic sentiment trends
function createSvgSparkline(articles, sourceId = '') {
  if (!articles || articles.length < 2) {
    return `<svg class="sparkline-svg" viewBox="0 0 300 56" preserveAspectRatio="none"><line x1="0" y1="28" x2="300" y2="28" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/></svg>`;
  }
  
  // Scored articles with valid sentiments
  const scored = articles.filter(a => typeof (a.sentiment ?? a.sentimentGemini ?? a.sentimentLocal) === 'number');
  if (scored.length < 2) {
    return `<svg class="sparkline-svg" viewBox="0 0 300 56" preserveAspectRatio="none"><line x1="0" y1="28" x2="300" y2="28" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/></svg>`;
  }

  // Filter by active timeframe if applicable
  const timeframe = state.filters.time || 'all';
  let filtered = scored;
  if (timeframe !== 'all') {
    const now = Date.now();
    let cutoff = 0;
    if (timeframe === '3h') cutoff = now - 3 * 3600 * 1000;
    else if (timeframe === '6h') cutoff = now - 6 * 3600 * 1000;
    else if (timeframe === '12h') cutoff = now - 12 * 3600 * 1000;
    else if (timeframe === '24h') cutoff = now - 24 * 3600 * 1000;
    else if (timeframe === '3d') cutoff = now - 3 * 86400 * 1000;
    else if (timeframe === '7d') cutoff = now - 7 * 86400 * 1000;
    else if (timeframe === '30d') cutoff = now - 30 * 86400 * 1000;
    
    if (cutoff > 0) {
      const windowArts = scored.filter(a => new Date(a.pubDate).getTime() >= cutoff);
      if (windowArts.length >= 6) {
        filtered = windowArts;
      }
    }
  }

  // Sample up to 35 points to show rich trajectory without overcrowding
  const maxPts = 35;
  let sample = [];
  if (filtered.length <= maxPts) {
    sample = [...filtered].reverse(); // Oldest to newest
  } else {
    const step = (filtered.length - 1) / (maxPts - 1);
    for (let i = maxPts - 1; i >= 0; i--) {
      const idx = Math.round(i * step);
      sample.push(filtered[idx]);
    }
  }

  const count = sample.length;
  const width = 300;
  const height = 56;
  const zeroY = 28;
  
  // Map index and score to svg coordinates (-1.0 to +1.0)
  const points = sample.map((art, idx) => {
    const sc = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentGemini ?? art.sentimentLocal ?? 0);
    const x = Number((idx * (width / Math.max(1, count - 1))).toFixed(1));
    const clampedScore = Math.max(-1, Math.min(1, sc));
    const y = Number((zeroY - (clampedScore * 22)).toFixed(1));
    return { x, y, score: clampedScore };
  });
  
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const mx = (p0.x + p1.x) / 2;
    linePath += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  
  const areaPath = linePath + ` L ${width} ${height} L 0 ${height} Z`;
  
  // Select color gradient
  const avgSentiment = sample.reduce((sum, a) => sum + (a.sentiment ?? 0), 0) / count;
  let strokeColor = 'var(--neu-color)';
  let gradId = `spark-grad-neu-${sourceId || Math.random().toString(36).substr(2, 5)}`;
  if (avgSentiment > 0.1) {
    strokeColor = 'var(--pos-color)';
    gradId = `spark-grad-pos-${sourceId || Math.random().toString(36).substr(2, 5)}`;
  } else if (avgSentiment < -0.1) {
    strokeColor = 'var(--neg-color)';
    gradId = `spark-grad-neg-${sourceId || Math.random().toString(36).substr(2, 5)}`;
  }

  const lastPt = points[points.length - 1];
  
  return `
    <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <!-- Base middle line -->
      <line x1="0" y1="${zeroY}" x2="${width}" y2="${zeroY}" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
      <text x="${width - 6}" y="${zeroY - 4}" text-anchor="end" font-family="var(--font-mono)" font-size="8" fill="var(--text-muted)" opacity="0.6">0.00</text>
      
      <!-- Area fill -->
      <path d="${areaPath}" fill="url(#${gradId})" />
      <!-- Line stroke -->
      <path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Latest point dot -->
      <circle cx="${lastPt.x}" cy="${lastPt.y}" r="3.5" fill="${strokeColor}" stroke="var(--bg-card)" stroke-width="1.5" />
    </svg>
  `;
}

// Render News Source Comparison Cards (Sidescroller)
function renderComparisonMatrix() {
  if (!elements.sourcesGrid) return;
  elements.sourcesGrid.innerHTML = '';
  
  // Sort sources by average sentiment (highest to lowest)
  let sortedIds = Object.keys(resolvedSources).sort((a, b) => {
    const valA = typeof resolvedSources[a].averageSentiment === 'number' ? resolvedSources[a].averageSentiment : -999;
    const valB = typeof resolvedSources[b].averageSentiment === 'number' ? resolvedSources[b].averageSentiment : -999;
    return valB - valA;
  });

  // Filter by active region if set
  if (state.activeRegion && state.activeRegion !== 'all') {
    sortedIds = sortedIds.filter(id => {
      const meta = SOURCE_META[id];
      return meta && meta.region && meta.region.toUpperCase() === state.activeRegion.toUpperCase();
    });
  }

  // Update carousel count badge if present
  const carouselCount = document.getElementById('sources-carousel-count');
  if (carouselCount) {
    carouselCount.innerText = `${sortedIds.length} Outlets`;
  }

  const showMoreRow = document.getElementById('sources-show-more-row');
  if (showMoreRow) {
    showMoreRow.style.display = 'none'; // Carousel sidescrolls all outlets
  }

  if (sortedIds.length === 0) {
    elements.sourcesGrid.innerHTML = `
      <div class="empty-state" style="padding: 2.5rem; text-align: center; width: 100%;">
        <i data-lucide="globe-2"></i>
        <span>No news outlets match the selected region filter.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // In sidescroller, display all filtered outlets so user can swipe/scroll through all of them
  sortedIds.forEach(id => {
    const source = resolvedSources[id];
    const avg = typeof source.averageSentiment === 'number' ? source.averageSentiment : 0;
    const meta = SOURCE_META[id] || { initials: id.slice(0, 3).toUpperCase(), color: '#333', region: 'GLOBAL', regionName: 'Global Agency', flag: '🌐' };
    
    // Mood Class Label
    let moodClass = 'neutral';
    let moodLabel = 'Objective & Neutral';
    const badgeText = (avg > 0 ? '+' : '') + avg.toFixed(2);
    if (avg > 0.15) {
      moodClass = 'positive';
      moodLabel = 'Uplifting & Optimistic';
    } else if (avg < -0.15) {
      moodClass = 'negative';
      moodLabel = 'Alarmist & Gloomy';
    }

    // Historical average across all available articles for this outlet (all-time)
    const rawArticles = (state.sources[id] && state.sources[id].articles) || [];
    const histScored = rawArticles.filter(a => typeof (a.sentimentGemini ?? a.sentiment ?? a.sentimentLocal) === 'number');
    const histAvg = histScored.length > 0 
      ? (histScored.reduce((sum, a) => sum + (a.sentimentGemini ?? a.sentiment ?? a.sentimentLocal), 0) / histScored.length) 
      : avg;
    const delta = avg - histAvg;
    let trendBadgeHTML = '';
    if (Math.abs(delta) >= 0.04) {
      if (delta > 0) {
        trendBadgeHTML = `<span class="source-trend-badge up" title="Trending +${delta.toFixed(2)} vs all-time average (${histAvg.toFixed(2)})">▲ +${delta.toFixed(2)} vs Hist</span>`;
      } else {
        trendBadgeHTML = `<span class="source-trend-badge down" title="Trending ${delta.toFixed(2)} vs all-time average (${histAvg.toFixed(2)})">▼ ${delta.toFixed(2)} vs Hist</span>`;
      }
    } else {
      trendBadgeHTML = `<span class="source-trend-badge stable" title="Within ±0.03 of all-time average (${histAvg.toFixed(2)})">● Stable</span>`;
    }
    
    // Calculate distributions
    const total = (source.distribution.positive || 0) + (source.distribution.neutral || 0) + (source.distribution.negative || 0);
    const posPct = total > 0 ? ((source.distribution.positive || 0) / total * 100).toFixed(0) : 0;
    const neuPct = total > 0 ? ((source.distribution.neutral || 0) / total * 100).toFixed(0) : 0;
    const negPct = total > 0 ? ((source.distribution.negative || 0) / total * 100).toFixed(0) : 0;
    
    const isSelected = state.filters.source === id;

    // Create card element
    const card = document.createElement('div');
    card.className = `source-card card ${isSelected ? 'active' : ''}`;
    card.setAttribute('data-id', id);

    card.innerHTML = `
      <div class="source-card-header">
        <div class="source-meta">
          <div class="source-icon ${id}" style="background-color: ${meta.color}; color: #fff;">
            ${meta.initials}
            ${isSelected ? '<span class="source-icon-check">✓</span>' : ''}
          </div>
          <div style="display:flex; flex-direction:column; overflow:hidden; min-width:0;">
            <div style="display:flex; align-items:center; gap:0.45rem;">
              <h3 class="source-name" title="${source.name}">${source.name}</h3>
              ${isSelected ? '<span class="source-active-indicator">FOCUS</span>' : ''}
            </div>
            <span class="source-region-tag">${getSourceFlagHTML(id)} ${meta.regionName}</span>
          </div>
        </div>
        <div class="source-score-container" style="display:flex; flex-direction:column; align-items:flex-end; gap:0.35rem;">
          <span class="score-badge ${moodClass}">${badgeText}</span>
          ${trendBadgeHTML}
        </div>
      </div>
      
      <!-- Custom Dial Gauge -->
      <div class="gauge-wrapper">
        ${createSvgGauge(avg)}
        <div class="dial-vibe-profile ${moodClass}">${moodLabel}</div>
      </div>
      
      <!-- Stacked Distribution Bar -->
      <div class="distribution-container">
        <div class="dist-bar-label">
          <span style="font-weight:600; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Sentiment Mix</span>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${negPct}% neg / ${neuPct}% neu / ${posPct}% pos</span>
        </div>
        <div class="dist-bar-track">
          <div class="dist-slice neg" style="width: ${negPct}%" title="Negative: ${negPct}%"></div>
          <div class="dist-slice neu" style="width: ${neuPct}%" title="Neutral: ${neuPct}%"></div>
          <div class="dist-slice pos" style="width: ${posPct}%" title="Positive: ${posPct}%"></div>
        </div>
      </div>

      <!-- Sparkline Graph -->
      <div class="sparkline-container">
        <div class="sparkline-label" style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:600; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Vibe Trajectory</span>
          <span style="font-size:0.72rem; font-family:var(--font-mono); color:var(--text-muted);">${source.articles?.length || 0} stories</span>
        </div>
        ${createSvgSparkline(source.articles, id)}
      </div>
      
      <div class="card-footer">
        <span class="text-muted small-text" style="font-size:0.72rem; font-family:var(--font-mono);">Sample: ${source.scoredCount || 0} articles</span>
        <button class="inspect-btn ${isSelected ? 'active-inspect-btn' : ''}">
          <span>${isSelected ? 'Selected (Deselect)' : 'Filter Headlines'}</span>
          <i data-lucide="${isSelected ? 'check' : 'arrow-right'}" style="width:12px;height:12px;"></i>
        </button>
      </div>
    `;
    
    // Card click sets search/filter source
    card.addEventListener('click', () => {
      toggleSourceFilter(id);
    });
    
    elements.sourcesGrid.appendChild(card);
  });
  
  // Re-create icons for dynamic templates
  lucide.createIcons();

  // If an outlet is active, auto-scroll carousel to bring card into view
  if (state.filters.source !== 'all') {
    setTimeout(() => {
      const activeCard = elements.sourcesGrid?.querySelector(`.source-card[data-id="${state.filters.source}"]`);
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 80);
  }
}

// Sidescrolling navigation handler for outlets carousel
window.scrollSourcesCarousel = function(direction) {
  const grid = document.getElementById('sources-grid');
  if (!grid) return;
  const scrollAmount = (grid.clientWidth * 0.75) * direction;
  grid.scrollBy({ left: scrollAmount, behavior: 'smooth' });
};

// --- STORY COMPARE TAB (STORY CLUSTERS & HEAD-TO-HEAD) ---

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Infer news topic for a cluster
function getClusterTopic(cluster) {
  if (cluster.topic) return cluster.topic;
  for (const item of (cluster.coverage || [])) {
    const src = state.sources && state.sources[item.sourceId];
    if (src && src.articles) {
      const match = src.articles.find(a => (a.link && a.link === item.link) || (a.title && a.title === item.title));
      if (match && match.category) return match.category;
    }
  }
  const s = (cluster.story || '').toLowerCase();
  if (s.includes('election') || s.includes('gop') || s.includes('trump') || s.includes('senate') || s.includes('house')) return 'politics';
  if (s.includes('ukraine') || s.includes('houthi') || s.includes('saudi') || s.includes('greece') || s.includes('russia') || s.includes('war')) return 'world';
  if (s.includes('earnings') || s.includes('bank') || s.includes('regulatory') || s.includes('deal') || s.includes('market') || s.includes('sales')) return 'business';
  if (s.includes('starlink') || s.includes('tech') || s.includes('cyber') || s.includes('ai')) return 'technology';
  if (s.includes('cancer') || s.includes('health') || s.includes('hospital') || s.includes('disease')) return 'health';
  if (s.includes('climate') || s.includes('nature') || s.includes('planet') || s.includes('oil')) return 'climate';
  return 'world';
}

const CLUSTER_TOPIC_LABELS = {
  world: '🌐 World Affairs',
  politics: '🏛️ Politics',
  business: '📈 Business & Markets',
  technology: '⚡ Technology',
  science: '🔬 Science & Space',
  health: '🩺 Health & Medicine',
  climate: '🌱 Nature & Climate',
  entertainment: '🎭 Entertainment',
  sports: '⚽ Sports',
  other: '📰 General News'
};

// Annotate a raw cluster with calculated metrics, date range, and editorial summaries
function annotateStoryCluster(c) {
  const topic = getClusterTopic(c);
  const coverage = c.coverage || [];
  const sentiments = coverage.map(cov => cov.sentiment).filter(s => typeof s === 'number');
  const maxS = sentiments.length > 0 ? Math.max(...sentiments) : 0;
  const minS = sentiments.length > 0 ? Math.min(...sentiments) : 0;
  const computedSpread = sentiments.length > 1 ? Number((maxS - minS).toFixed(2)) : (c.sentimentSpread || 0);
  const avgSentiment = sentiments.length > 0 ? Number((sentiments.reduce((a, b) => a + b, 0) / sentiments.length).toFixed(2)) : (c.averageSentiment || 0);

  // Compute cluster date range from coverage article pubDates (with news cycle windowing)
  const validTimestamps = [];
  coverage.forEach(cov => {
    const src = state.sources && state.sources[cov.sourceId];
    if (src && src.articles) {
      const match = src.articles.find(a => (a.link && a.link === cov.link) || (a.title && a.title === cov.title));
      if (match && match.pubDate) {
        const t = new Date(match.pubDate).getTime();
        if (!isNaN(t)) validTimestamps.push(t);
      }
    }
  });

  let dateRangeStr = 'Current News Cycle';
  let minTime = Infinity;
  let maxTime = -Infinity;
  if (validTimestamps.length > 0) {
    validTimestamps.sort((a, b) => a - b);
    maxTime = validTimestamps[validTimestamps.length - 1];
    // Max window for an active news cycle: 5 days from newest article
    const cycleCutoff = maxTime - (5 * 24 * 60 * 60 * 1000);
    const activeTimestamps = validTimestamps.filter(t => t >= cycleCutoff);
    minTime = activeTimestamps.length > 0 ? activeTimestamps[0] : maxTime;

    const dMin = new Date(minTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dMax = new Date(maxTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dateRangeStr = dMin === dMax ? dMin : `${dMin} – ${dMax}`;
  }

  // High quality editorial summary
  let summaryText = '';
  if (c.summary && c.summary.trim().length > 15) {
    summaryText = c.summary.trim();
  } else {
    const outlets = [...new Set(coverage.map(cov => cov.sourceName || cov.sourceId))];
    const outletsList = outlets.slice(0, 3).join(', ') + (outlets.length > 3 ? ` +${outlets.length - 3} others` : '');
    if (computedSpread >= 0.35) {
      summaryText = `Editorial divergence across ${coverage.length} desks (${outletsList}): framing swings by ${computedSpread.toFixed(2)} pts between urgent alarm and measured policy context.`;
    } else if (avgSentiment < -0.3) {
      summaryText = `High-gravity reporting across ${coverage.length} newsrooms (${outletsList}) focusing on disruption, systemic risks, and ongoing investigations.`;
    } else if (avgSentiment > 0.1) {
      summaryText = `Constructive cross-outlet reporting across ${coverage.length} newsrooms (${outletsList}) spotlighting positive momentum, resolution, and progress.`;
    } else {
      summaryText = `Synchronized reporting across ${coverage.length} newsrooms (${outletsList}) providing balanced, factual developments on the evolving story.`;
    }
  }

  return {
    ...c,
    topic,
    coverage,
    computedSpread,
    averageSentiment: avgSentiment,
    dateRangeStr,
    summaryText,
    minTime,
    maxTime
  };
}

// Generate HTML for a single interactive cluster card
function buildClusterCardHTML(cluster, prefix = 'cluster') {
  const clusterId = `${prefix}-${encodeURIComponent(cluster.story.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase())}`;
  const topicLabel = CLUSTER_TOPIC_LABELS[cluster.topic] || cluster.topic;
  const moodClass = getMoodClass(cluster.averageSentiment);
  const avgScoreFormatted = `${cluster.averageSentiment > 0 ? '+' : ''}${cluster.averageSentiment.toFixed(2)}`;
  const isHighSpread = cluster.computedSpread >= 0.35;

  // Deduplicate coverage articles (keep freshest per outlet canonical link / clean title)
  const seenCovUrls = new Set();
  const seenCovTitles = new Set();
  const dedupedCoverage = [];
  const sortedRawCoverage = [...(cluster.coverage || [])].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  for (const cov of sortedRawCoverage) {
    const cUrl = `${cov.sourceId || ''}_${canonicalUrl(cov.link)}`;
    const cTitle = `${cov.sourceId || ''}_${cleanHeadlineTitle(cov.title)}`;
    if (seenCovUrls.has(cUrl) || seenCovTitles.has(cTitle)) continue;
    seenCovUrls.add(cUrl);
    seenCovTitles.add(cTitle);
    dedupedCoverage.push(cov);
  }

  const uniqueSources = new Set(dedupedCoverage.map(x => x.sourceId));

  // Build mini-spectrum bubbles (deduplicate by sourceId for plot clarity)
  const uniqueCoverage = [];
  const seenSources = new Set();
  dedupedCoverage.forEach(cov => {
    if (!seenSources.has(cov.sourceId)) {
      seenSources.add(cov.sourceId);
      uniqueCoverage.push(cov);
    }
  });

  const bubblesHTML = uniqueCoverage.map(cov => {
    const meta = SOURCE_META[cov.sourceId] || { initials: cov.sourceId.toUpperCase().slice(0, 3), color: '#3b82f6', flag: '🌐' };
    const score = typeof cov.sentiment === 'number' ? cov.sentiment : 0;
    const leftPct = clamp(((score + 1) / 2) * 100, 4, 96);
    const scoreStr = `${score > 0 ? '+' : ''}${score.toFixed(2)}`;
    const cleanTitle = (cov.title || '').replace(/"/g, '&quot;');

    return `
      <div class="cluster-outlet-bubble" 
           style="left: ${leftPct}%; background-color: ${meta.color};"
           title="${meta.regionName || ''} (${cov.sourceName}): ${scoreStr} - ${cleanTitle}"
           onclick="window.open('${cov.link}', '_blank', 'noopener,noreferrer')">
        ${meta.initials}
      </div>
    `;
  }).join('');

  // Sort reporting inside each story topic strictly by valence (from most negative to most positive)
  const sortedCoverage = [...dedupedCoverage].sort((a, b) => {
    const sa = typeof a.sentiment === 'number' ? a.sentiment : 0;
    const sb = typeof b.sentiment === 'number' ? b.sentiment : 0;
    return sa - sb;
  });

  // Build article cards in coverage grid
  const coverageCardsHTML = sortedCoverage.map(art => {
    const meta = SOURCE_META[art.sourceId] || { initials: art.sourceId.toUpperCase().slice(0, 3), color: '#3b82f6', flag: '🌐' };
    const score = typeof art.sentiment === 'number' ? art.sentiment : 0;
    const scoreClass = getMoodClass(score);
    const scoreStr = `${score > 0 ? '+' : ''}${score.toFixed(2)}`;

    return `
      <div class="cluster-article-card">
        <div class="cluster-article-top">
          <span class="cluster-article-outlet">
            <span class="source-badge" style="background-color: ${meta.color};">${getSourceFlagHTML(art.sourceId)} ${art.sourceName}</span>
          </span>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span class="score-badge ${scoreClass}" style="font-size:0.75rem; padding:0.15rem 0.45rem;">${scoreStr}</span>
          </div>
        </div>
        <h4 class="cluster-article-title">
          <a href="${art.link}" target="_blank" rel="noopener noreferrer">${art.title}</a>
        </h4>
        <div class="cluster-article-footer">
          <button type="button" class="btn btn-secondary btn-sm" onclick="copyStoryLink('${art.link}', this)" title="Share headline link" style="padding:0.25rem 0.55rem; font-size:0.72rem; gap:0.3rem;">
            <i data-lucide="link" style="width:11px;height:11px;"></i>
            <span>Share</span>
          </button>
          <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="cluster-read-link">
            <span>Read Dispatch</span>
            <i data-lucide="external-link" style="width:11px;height:11px;"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');

  return `
    <article class="cluster-card card" id="${clusterId}" onclick="handleClusterCardClick(event, '${clusterId}')">
      <div class="cluster-header">
        <div class="cluster-header-left">
          <div class="cluster-badges-strip">
            <span class="cluster-badge cluster-topic-badge">${topicLabel}</span>
            <span class="cluster-badge cluster-date-badge">
              <i data-lucide="calendar" style="width:11px;height:11px;"></i>
              ${cluster.dateRangeStr}
            </span>
          </div>
          <h3 class="cluster-title">${cluster.story}</h3>
        </div>
      </div>

      <!-- Editorial Summary -->
      <p class="cluster-summary-text">${cluster.summaryText}</p>

      <!-- Mini-Spectrum Distribution Track across all covering desks -->
      <div class="cluster-spectrum-wrap">
        <div class="cluster-spectrum-scale-labels">
          <span>Crisis / Gloomy (-1.0)</span>
          <span>Neutral (0.0)</span>
          <span>Constructive / Optimistic (+1.0)</span>
        </div>
        <div class="cluster-spectrum-track">
          ${bubblesHTML}
        </div>
      </div>

      <!-- Interactive Coverage Toggle Bar -->
      <div class="cluster-coverage-meta-bar">
        <div class="cluster-coverage-info" style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
          <span class="cluster-badge cluster-outlets-badge" style="font-size:0.75rem; padding:0.25rem 0.65rem;">
            <i data-lucide="radio" style="width:12px;height:12px;"></i>
            ${uniqueSources.size} Outlets
          </span>
          <span class="cluster-badge cluster-score-badge ${moodClass}" style="font-size:0.75rem; padding:0.25rem 0.65rem;">
            ${avgScoreFormatted} Avg Tone
          </span>
          <span class="cluster-badge cluster-spread-badge ${isHighSpread ? 'high-spread' : ''}" style="font-size:0.75rem; padding:0.25rem 0.65rem;">
            <i data-lucide="split" style="width:11px;height:11px;"></i>
            ${cluster.computedSpread.toFixed(2)} Spread
          </span>
        </div>
        <button type="button" class="cluster-toggle-btn" onclick="toggleClusterCard('${clusterId}')" title="Inspect full multi-outlet coverage">
          <span>Inspect Full Coverage (${sortedCoverage.length})</span>
          <i data-lucide="chevron-down" style="width:12px;height:12px;"></i>
        </button>
      </div>

      <!-- Coverage Grid of Desks (Smooth CSS Accordion) -->
      <div class="cluster-coverage-grid">
        ${coverageCardsHTML}
      </div>
    </article>
  `;
}

// Render whole Story Compare tab
function renderComparePage() {
  renderStoryClusters();
  renderHeadToHead();
  if (window.lucide && lucide.createIcons) {
    lucide.createIcons();
  }
}
window.renderComparePage = renderComparePage;

// Render Cross-Outlet Story Clusters (Clashing Newsrooms)
function renderStoryClusters() {
  const container = elements.clustersContainer || document.getElementById('clusters-container');
  if (!container) return;

  const rawClusters = state.sharedStoryClusters || [];
  if (!rawClusters || rawClusters.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 2.5rem 1.5rem; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px;">
        <i data-lucide="layers" style="width: 38px; height: 38px; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.5rem;">No Story Clusters Detected</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 500px; margin: 0 auto 1.25rem;">
          Cross-outlet story clusters are computed during news ingestion when two or more major newsrooms report on identical breaking events. Trigger a sync to rebuild clusters.
        </p>
        <button class="btn btn-primary" onclick="syncData()" style="gap: 0.5rem; display: inline-flex; align-items: center; margin: 0 auto;">
          <i data-lucide="refresh-cw"></i> Sync Feeds Now
        </button>
      </div>
    `;
    if (elements.clustersCountBadge) elements.clustersCountBadge.innerText = '0 Clusters Identified';
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Topic filter & Search filter
  const activeTopic = state.clusterTopic || 'all';
  const searchTerm = (state.clusterSearch || '').toLowerCase().trim();

  // Annotate and filter clusters
  const processed = rawClusters.map(annotateStoryCluster).filter(c => {
    // Topic filter
    if (activeTopic !== 'all' && c.topic !== activeTopic) {
      return false;
    }
    // Search filter
    if (searchTerm) {
      const matchTitle = (c.story || '').toLowerCase().includes(searchTerm);
      const matchCoverage = c.coverage.some(cov => 
        (cov.title || '').toLowerCase().includes(searchTerm) || 
        (cov.sourceName || '').toLowerCase().includes(searchTerm)
      );
      if (!matchTitle && !matchCoverage) return false;
    }
    return true;
  });

  // Sort clusters
  const sortMode = state.clusterSort || 'spread';
  processed.sort((a, b) => {
    if (sortMode === 'spread') return b.computedSpread - a.computedSpread;
    if (sortMode === 'outlets') return (b.coverage?.length || 0) - (a.coverage?.length || 0);
    if (sortMode === 'pessimistic') return a.averageSentiment - b.averageSentiment;
    if (sortMode === 'optimistic') return b.averageSentiment - a.averageSentiment;
    return 0;
  });

  // Update badge counter
  if (elements.clustersCountBadge) {
    elements.clustersCountBadge.innerText = `${processed.length} Cluster${processed.length === 1 ? '' : 's'} Identified`;
  }

  // Empty state if filtered out
  if (processed.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 2.5rem 1.5rem; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 14px; grid-column: 1 / -1;">
        <i data-lucide="search-x" style="width: 36px; height: 36px; color: var(--text-muted); margin-bottom: 0.75rem;"></i>
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.4rem;">No Matching Story Clusters</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 440px; margin: 0 auto;">
          No clusters found for topic "${activeTopic}"${searchTerm ? ` matching "${searchTerm}"` : ''}. Try selecting "All Topics" or clearing the search box.
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Render cluster cards in grid (collapsed by default, expandable to full width)
  container.innerHTML = processed.map(cluster => buildClusterCardHTML(cluster, 'compare')).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}
window.renderStoryClusters = renderStoryClusters;

// Click handler for cluster card (allows expanding anywhere on card without intercepting link/button clicks)
window.handleClusterCardClick = function(event, clusterId) {
  if (event.target.closest('a, button, .cluster-outlet-bubble, input, select, textarea')) {
    return;
  }
  toggleClusterCard(clusterId);
};

// Toggle cluster coverage accordion & expand card to full width
window.toggleClusterCard = function(clusterId) {
  const card = document.getElementById(clusterId);
  if (!card) return;
  const isExpanded = card.classList.toggle('is-expanded');
  const btn = card.querySelector('.cluster-toggle-btn');
  if (btn) {
    const span = btn.querySelector('span');
    const icon = btn.querySelector('i');
    const count = card.querySelectorAll('.cluster-article-card').length;
    if (span) span.innerText = isExpanded ? 'Collapse Coverage' : `Inspect Full Coverage (${count})`;
    if (icon) icon.setAttribute('data-lucide', isExpanded ? 'chevron-up' : 'chevron-down');
    if (window.lucide) lucide.createIcons();
  }
};
window.toggleClusterCoverage = window.toggleClusterCard;

// Render Top 6 Developing Stories on Daily Pulse Homepage
function renderPulseTopStories() {
  const container = elements.pulseTopStoriesContainer || document.getElementById('pulse-top-stories-container');
  if (!container) return;

  const rawClusters = state.sharedStoryClusters || [];
  if (!rawClusters || rawClusters.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 2.2rem 1.5rem; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; grid-column: 1 / -1;">
        <i data-lucide="layers" style="width: 34px; height: 34px; color: var(--text-muted); margin-bottom: 0.6rem;"></i>
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.4rem;">No Developing Stories Detected</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 480px; margin: 0 auto 1.25rem;">
          Cross-outlet story clusters are computed during daily news ingestion when 2 or more newsrooms report on identical breaking events.
        </p>
        <button class="btn btn-primary btn-sm" onclick="syncData()" style="gap: 0.5rem; display: inline-flex; align-items: center; margin: 0 auto;">
          <i data-lucide="refresh-cw"></i> Sync Feeds Now
        </button>
      </div>
    `;
    if (elements.topStoriesCountBadge) elements.topStoriesCountBadge.innerText = '0 Stories';
    if (elements.pulseClusterTopicIndicator) elements.pulseClusterTopicIndicator.style.display = 'none';
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Annotate all clusters
  const annotated = rawClusters.map(annotateStoryCluster);

  // Filter by topic if active
  const activeTopic = state.filters.category || 'all';
  const filtered = activeTopic === 'all' 
    ? annotated 
    : annotated.filter(c => c.topic === activeTopic);

  // Update Topic Indicator
  if (elements.pulseClusterTopicIndicator && elements.pulseClusterTopicName) {
    if (activeTopic !== 'all') {
      const topicCap = activeTopic.charAt(0).toUpperCase() + activeTopic.slice(1);
      elements.pulseClusterTopicName.innerText = topicCap;
      elements.pulseClusterTopicIndicator.style.display = 'flex';
    } else {
      elements.pulseClusterTopicIndicator.style.display = 'none';
    }
  }

  // Sort by coverage breadth (most covering outlets first), then by divergence spread
  filtered.sort((a, b) => {
    const covA = a.coverage?.length || 0;
    const covB = b.coverage?.length || 0;
    if (covB !== covA) return covB - covA;
    return b.computedSpread - a.computedSpread;
  });

  // Top 6 most covered stories
  const top6 = filtered.slice(0, 6);

  if (top6.length === 0) {
    const topicCap = activeTopic.charAt(0).toUpperCase() + activeTopic.slice(1);
    container.innerHTML = `
      <div class="card" style="padding: 2.2rem 1.5rem; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; grid-column: 1 / -1;">
        <i data-lucide="layers" style="width: 32px; height: 32px; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
        <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.35rem;">No Top Stories in ${topicCap}</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; max-width: 440px; margin: 0 auto 1.25rem;">
          No multi-outlet clusters found for this topic right now. Explore other topics or clear the filter.
        </p>
        <button class="btn btn-secondary btn-sm" onclick="clearPulseClusterTopic()" style="margin: 0 auto;">
          Show All Topics
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = top6.map(cluster => buildClusterCardHTML(cluster, 'pulse-top')).join('');

  if (window.lucide && lucide.createIcons) {
    lucide.createIcons();
  }
}
window.renderPulseTopStories = renderPulseTopStories;


// Render Head-to-Head Comparison column
function renderHeadToHead() {
  if (!elements.h2hSourceA || !elements.h2hSourceB) return;
  const idA = elements.h2hSourceA.value;
  const idB = elements.h2hSourceB.value;
  
  if (!idA || !idB || !resolvedSources[idA] || !resolvedSources[idB]) return;
  
  const sourceA = resolvedSources[idA];
  const sourceB = resolvedSources[idB];

  // Sync timeframe selector with active global filter
  if (elements.h2hTimeframeSelect && elements.h2hTimeframeSelect.value !== state.filters.time) {
    elements.h2hTimeframeSelect.value = state.filters.time;
  }

  // Read topic filter
  const topic = (elements.h2hTopicSelect && elements.h2hTopicSelect.value) || state.h2hTopic || 'all';
  state.h2hTopic = topic;

  // Filter articles by beat
  const artsA = topic === 'all' 
    ? (sourceA.articles || []) 
    : (sourceA.articles || []).filter(a => a.category === topic);
  const artsB = topic === 'all' 
    ? (sourceB.articles || []) 
    : (sourceB.articles || []).filter(a => a.category === topic);

  // Compute beat-specific sentiment averages
  const scoredA = artsA.filter(a => a.sentiment !== null && a.sentiment !== undefined);
  const scoredB = artsB.filter(a => a.sentiment !== null && a.sentiment !== undefined);

  const avgA = scoredA.length > 0 ? (scoredA.reduce((s, a) => s + a.sentiment, 0) / scoredA.length) : null;
  const avgB = scoredB.length > 0 ? (scoredB.reduce((s, a) => s + a.sentiment, 0) / scoredB.length) : null;
  
  // Set summaries A
  const titleA = document.querySelector('.source-title-a');
  if (titleA) titleA.innerText = `${sourceA.name} (${scoredA.length})`;
  const badgeA = document.querySelector('.score-a');
  if (badgeA) {
    if (avgA !== null) {
      badgeA.innerText = `${avgA > 0 ? '+' : ''}${avgA.toFixed(2)}`;
      badgeA.className = `h2h-score-badge score-a score-badge ${getMoodClass(avgA)}`;
    } else {
      badgeA.innerText = 'N/A';
      badgeA.className = 'h2h-score-badge score-a score-badge neu';
    }
  }
  
  // Set summaries B
  const titleB = document.querySelector('.source-title-b');
  if (titleB) titleB.innerText = `${sourceB.name} (${scoredB.length})`;
  const badgeB = document.querySelector('.score-b');
  if (badgeB) {
    if (avgB !== null) {
      badgeB.innerText = `${avgB > 0 ? '+' : ''}${avgB.toFixed(2)}`;
      badgeB.className = `h2h-score-badge score-b score-badge ${getMoodClass(avgB)}`;
    } else {
      badgeB.innerText = 'N/A';
      badgeB.className = 'h2h-score-badge score-b score-badge neu';
    }
  }

  // Calculate Tone Divergence Spread
  if (elements.h2hSpreadValue) {
    if (avgA !== null && avgB !== null) {
      const spread = Math.abs(avgA - avgB);
      elements.h2hSpreadValue.innerText = `${spread.toFixed(2)} Spread`;
      if (spread >= 0.4) {
        elements.h2hSpreadValue.style.color = 'var(--neg-color)';
      } else if (spread >= 0.2) {
        elements.h2hSpreadValue.style.color = '#d97706';
      } else {
        elements.h2hSpreadValue.style.color = 'var(--accent-color)';
      }
    } else {
      elements.h2hSpreadValue.innerText = 'N/A';
      elements.h2hSpreadValue.style.color = 'var(--text-muted)';
    }
  }
  
  // Find extremes for A
  setExtremesForColumn(artsA, 'a', topic);
  // Find extremes for B
  setExtremesForColumn(artsB, 'b', topic);

  if (window.lucide) {
    lucide.createIcons();
  }
}
window.renderHeadToHead = renderHeadToHead;

// Find and inject most positive/negative articles for a source column
function setExtremesForColumn(articles, colSuffix, topic = 'all') {
  const negElem = document.getElementById(`h2h-neg-${colSuffix}`);
  const negMetaElem = document.getElementById(`h2h-neg-meta-${colSuffix}`);
  const posElem = document.getElementById(`h2h-pos-${colSuffix}`);
  const posMetaElem = document.getElementById(`h2h-pos-meta-${colSuffix}`);

  if (!negElem || !posElem) return;
  
  const scored = (articles || []).filter(a => a.sentiment !== null && a.sentiment !== undefined);
  
  if (scored.length === 0) {
    const topicLabel = topic !== 'all' ? ` for "${topic}"` : '';
    negElem.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No articles analyzed${topicLabel} in this timeframe</span>`;
    if (negMetaElem) negMetaElem.innerText = '-';
    posElem.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No articles analyzed${topicLabel} in this timeframe</span>`;
    if (posMetaElem) posMetaElem.innerText = '-';
    return;
  }
  
  // Sort copies to find extremes
  const sortedNeg = [...scored].sort((a, b) => a.sentiment - b.sentiment);
  const sortedPos = [...scored].sort((a, b) => b.sentiment - a.sentiment);
  
  const worst = sortedNeg[0];
  const best = sortedPos[0];
  
  // Render worst negative
  negElem.innerHTML = `<a href="${worst.link}" target="_blank" rel="noopener noreferrer">${worst.title}</a>`;
  if (negMetaElem) negMetaElem.innerText = `Sentiment: ${worst.sentiment.toFixed(2)} | Date: ${new Date(worst.pubDate).toLocaleDateString()}`;
  
  // Render best positive
  posElem.innerHTML = `<a href="${best.link}" target="_blank" rel="noopener noreferrer">${best.title}</a>`;
  if (posMetaElem) posMetaElem.innerText = `Sentiment: ${best.sentiment > 0 ? '+' : ''}${best.sentiment.toFixed(2)} | Date: ${new Date(best.pubDate).toLocaleDateString()}`;
}

// Update Timeline range buttons styling in sync with global filters
function updateTimelineButtonsUI() {
  const timelineAllBtn = document.getElementById('timeline-range-all');
  const timelineRecentBtn = document.getElementById('timeline-range-recent');
  if (!timelineAllBtn || !timelineRecentBtn) return;
  const isAll = state.filters.time === 'all';
  timelineAllBtn.classList.toggle('active', isAll);
  timelineAllBtn.style.background = isAll ? 'var(--accent-color)' : 'transparent';
  timelineAllBtn.style.color = isAll ? '#fff' : 'var(--text-secondary)';

  const isRecent = state.filters.time === '7d' || state.timelineRange === 'recent';
  timelineRecentBtn.classList.toggle('active', isRecent);
  timelineRecentBtn.style.background = isRecent ? 'var(--accent-color)' : 'transparent';
  timelineRecentBtn.style.color = isRecent ? '#fff' : 'var(--text-secondary)';
}

// Select topic/category filter and jump to feed
function selectCategoryFilter(category) {
  state.filters.category = category;
  if (elements.filterCategory) elements.filterCategory.value = category;
  updateTopicPillsActive(category);
  updateAppUI();
  switchTab('pulse');
  const target = document.getElementById('feed-section');
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}
window.selectCategoryFilter = selectCategoryFilter;

// Render Historical Sentiment Timeline & Topic Dynamics
function renderSentimentTimeline() {
  const chartSvg = document.getElementById('timeline-chart-svg');
  const countEl = document.getElementById('timeline-snapshot-count');
  const timeRangeEl = document.getElementById('timeline-time-range');
  const tooltip = document.getElementById('timeline-tooltip-box');
  const topicsGrid = document.getElementById('topic-trajectories-grid');
  if (!chartSvg) return;

  const rawSeries = state.timeSeries || [];

  // Determine active timeframe window (strictly from header date switcher or local buttons)
  const timeframe = state.filters.time || 'all';
  const now = Date.now();
  let cutoff = 0;
  let timeframeLabel = 'All Historical Snapshots';

  if (timeframe === '3h') {
    cutoff = now - 3 * 3600 * 1000;
    timeframeLabel = 'Past 3 Hours';
  } else if (timeframe === '6h') {
    cutoff = now - 6 * 3600 * 1000;
    timeframeLabel = 'Past 6 Hours';
  } else if (timeframe === '12h') {
    cutoff = now - 12 * 3600 * 1000;
    timeframeLabel = 'Past 12 Hours';
  } else if (timeframe === '24h') {
    cutoff = now - 24 * 3600 * 1000;
    timeframeLabel = 'Past 24 Hours';
  } else if (timeframe === '3d') {
    cutoff = now - 3 * 86400 * 1000;
    timeframeLabel = 'Past 3 Days';
  } else if (timeframe === '7d' || state.timelineRange === 'recent') {
    cutoff = now - 7 * 86400 * 1000;
    timeframeLabel = 'Past 7 Days';
  } else if (timeframe === '30d') {
    cutoff = now - 30 * 86400 * 1000;
    timeframeLabel = 'Past 30 Days';
  }

  // Active source & topic filtering
  const selectedSource = state.filters.source && state.filters.source !== 'all' ? state.filters.source : null;
  const sourceName = selectedSource ? (SOURCE_META[selectedSource]?.name || (state.sources[selectedSource] ? state.sources[selectedSource].name : selectedSource)) : 'Global';

  const categoryNames = {
    science: { name: 'Science & Space', icon: '🚀' },
    climate: { name: 'Nature & Climate', icon: '🌱' },
    technology: { name: 'Tech & AI', icon: '⚡' },
    business: { name: 'Business & Economy', icon: '📈' },
    health: { name: 'Health & Medicine', icon: '🏥' },
    politics: { name: 'Politics & Governance', icon: '🗳️' },
    world: { name: 'World & Global Affairs', icon: '🌍' }
  };

  const selectedTopic = state.macroTrendsTopic && state.macroTrendsTopic !== 'all' ? state.macroTrendsTopic : null;
  const topicMeta = selectedTopic ? categoryNames[selectedTopic] : null;

  // Calculate Historical Baseline (All-time average)
  let histAvg = 0;
  if (selectedSource) {
    const rawArts = (state.sources[selectedSource] && state.sources[selectedSource].articles) || [];
    const scored = rawArts.filter(a => typeof (a.sentimentGemini ?? a.sentiment ?? a.sentimentLocal) === 'number');
    if (scored.length > 0) {
      histAvg = scored.reduce((sum, a) => sum + (a.sentimentGemini ?? a.sentiment ?? a.sentimentLocal), 0) / scored.length;
    } else if (typeof resolvedSources[selectedSource]?.averageSentiment === 'number') {
      histAvg = resolvedSources[selectedSource].averageSentiment;
    }
  } else {
    if (rawSeries.length > 0) {
      let allAvgs = [];
      rawSeries.forEach(s => {
        Object.values(s.averages || {}).forEach(v => {
          if (typeof v === 'number') allAvgs.push(v);
        });
      });
      histAvg = allAvgs.length > 0 ? (allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : -0.12;
    } else {
      histAvg = -0.12;
    }
  }

  // --- TIME-RANGE DEPENDENT DENSE DATA GENERATION ---
  let points = [];
  const sourceIds = Object.keys(resolvedSources);

  if (cutoff > 0 && timeframe !== 'all') {
    // Generate 16 to 22 time buckets based on window
    const numBuckets = (timeframe === '3h' || timeframe === '6h') ? 14 : ((timeframe === '12h' || timeframe === '24h') ? 18 : 22);
    const bucketDuration = (now - cutoff) / numBuckets;

    // Collect all scored articles across all sources
    const allWindowArticles = [];
    Object.entries(state.sources || {}).forEach(([sId, src]) => {
      (src.articles || []).forEach(a => {
        const t = new Date(a.pubDate).getTime();
        const sc = typeof a.sentiment === 'number' ? a.sentiment : (a.sentimentGemini ?? a.sentimentLocal);
        if (t >= cutoff && t <= now && typeof sc === 'number') {
          if (!selectedTopic || a.category === selectedTopic) {
            allWindowArticles.push({ sId, score: sc, time: t, category: a.category });
          }
        }
      });
    });

    // Check if snapshots exist in cutoff window
    const matchingSnapshots = rawSeries.filter(s => new Date(s.timestamp).getTime() >= cutoff);

    let lastKnownAverages = {};
    sourceIds.forEach(id => {
      lastKnownAverages[id] = resolvedSources[id]?.averageSentiment ?? 0;
    });

    for (let i = 0; i < numBuckets; i++) {
      const bStart = cutoff + i * bucketDuration;
      const bEnd = bStart + bucketDuration;
      const timestamp = new Date(bEnd).toISOString();

      // Check if a snapshot lands in this bucket
      const snapInBucket = matchingSnapshots.find(s => {
        const st = new Date(s.timestamp).getTime();
        return st >= bStart && st < bEnd;
      });

      const bucketAverages = {};
      const bucketArticles = allWindowArticles.filter(a => a.time >= bStart && a.time < bEnd);

      sourceIds.forEach(sId => {
        if (snapInBucket && typeof snapInBucket.averages?.[sId] === 'number') {
          bucketAverages[sId] = snapInBucket.averages[sId];
          lastKnownAverages[sId] = snapInBucket.averages[sId];
        } else {
          const sArts = bucketArticles.filter(a => a.sId === sId);
          if (sArts.length > 0) {
            const avg = sArts.reduce((acc, a) => acc + a.score, 0) / sArts.length;
            bucketAverages[sId] = Number(avg.toFixed(3));
            lastKnownAverages[sId] = bucketAverages[sId];
          } else {
            bucketAverages[sId] = lastKnownAverages[sId];
          }
        }
      });

      // Compute score for this bucket
      let score = 0;
      if (selectedTopic) {
        if (bucketArticles.length > 0) {
          score = bucketArticles.reduce((acc, a) => acc + a.score, 0) / bucketArticles.length;
        } else {
          score = points.length > 0 ? points[points.length - 1].score : histAvg;
        }
      } else if (selectedSource) {
        score = bucketAverages[selectedSource] ?? lastKnownAverages[selectedSource];
      } else {
        const vals = Object.values(bucketAverages);
        score = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : histAvg;
      }

      points.push({
        index: i,
        timestamp,
        averages: bucketAverages,
        score: Number(score.toFixed(3))
      });
    }
  } else {
    // All time: use raw series snapshots
    let series = [...rawSeries];
    if (series.length < 2) {
      series = rawSeries.slice(-10);
    }
    points = series.map((s, idx) => {
      let score = null;
      if (selectedSource) {
        if (typeof s.averages?.[selectedSource] === 'number') score = s.averages[selectedSource];
      } else {
        const avgs = Object.values(s.averages || {});
        score = avgs.length > 0 ? (avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
      }
      return {
        index: idx,
        timestamp: s.timestamp,
        averages: s.averages || {},
        score: score !== null ? Number(score.toFixed(3)) : null
      };
    }).filter(p => p.score !== null);
  }

  // Calculate current window average and vs Historical delta
  const currentAvg = points.length > 0 ? (points.reduce((sum, p) => sum + p.score, 0) / points.length) : histAvg;
  const delta = currentAvg - histAvg;

  // Render Active Filter Chips & Historical Baseline Badge in Timeline Header
  const activeFiltersWrap = document.getElementById('timeline-active-filters-wrap');
  if (activeFiltersWrap) {
    let chipsHtml = '';
    
    // 1. Outlet Filter Pill
    if (selectedSource) {
      chipsHtml += `
        <span class="timeline-filter-chip outlet-chip" title="Timeline focused on ${sourceName}">
          <i data-lucide="globe" style="width:13px;height:13px;"></i>
          <span>Outlet: <strong>${sourceName}</strong></span>
          <button type="button" class="timeline-chip-clear" onclick="clearTimelineSourceFilter()" title="Clear outlet filter" aria-label="Clear outlet filter">&times;</button>
        </span>
      `;
    }

    // 2. Topic Filter Pill
    if (selectedTopic && topicMeta) {
      chipsHtml += `
        <span class="timeline-filter-chip topic-chip" title="Timeline focused on ${topicMeta.name}">
          <span>${topicMeta.icon}</span>
          <span>Topic: <strong>${topicMeta.name}</strong></span>
          <button type="button" class="timeline-chip-clear" onclick="toggleTimelineTopicFilter('${selectedTopic}')" title="Clear topic filter" aria-label="Clear topic filter">&times;</button>
        </span>
      `;
    }

    // 3. Time Window Pill
    const curTime = state.filters.time || '24h';
    chipsHtml += `
      <label class="timeline-filter-chip time-chip interactive-time-chip" title="Click to edit overall timeframe window">
        <i data-lucide="clock" style="width:13px;height:13px;"></i>
        <span>Window:</span>
        <select class="timeline-timeframe-inline-select" onchange="changeTimelineWindow(this.value)" aria-label="Edit overall timeframe">
          <option value="3h" ${curTime === '3h' ? 'selected' : ''}>Past 3 Hours</option>
          <option value="6h" ${curTime === '6h' ? 'selected' : ''}>Past 6 Hours</option>
          <option value="12h" ${curTime === '12h' ? 'selected' : ''}>Past 12 Hours</option>
          <option value="24h" ${curTime === '24h' ? 'selected' : ''}>Past 24 Hours</option>
          <option value="3d" ${curTime === '3d' ? 'selected' : ''}>Past 3 Days</option>
          <option value="7d" ${curTime === '7d' ? 'selected' : ''}>Past 7 Days</option>
          <option value="30d" ${curTime === '30d' ? 'selected' : ''}>Past 30 Days</option>
          <option value="all" ${curTime === 'all' ? 'selected' : ''}>All Time</option>
        </select>
        <i data-lucide="chevron-down" style="width:12px;height:12px;opacity:0.7;margin-left:1px;"></i>
      </label>
    `;

    // 4. Historical Baseline Comparison Badge
    const histDeltaSign = delta >= 0 ? '+' : '';
    const histDeltaClass = delta >= 0.04 ? 'up' : (delta <= -0.04 ? 'down' : 'stable');
    const histDeltaIcon = delta >= 0.04 ? '▲' : (delta <= -0.04 ? '▼' : '●');
    chipsHtml += `
      <div class="timeline-historical-badge ${histDeltaClass}" title="${selectedSource ? sourceName : 'Global'} current window (${currentAvg.toFixed(2)}) vs historical baseline (${histAvg.toFixed(2)})">
        <span class="timeline-hist-label">${selectedSource ? sourceName : 'Macro'} vs Hist:</span>
        <strong class="timeline-hist-val">${histDeltaIcon} ${histDeltaSign}${delta.toFixed(2)}</strong>
        <span class="timeline-hist-base">(Base: ${histAvg >= 0 ? '+' : ''}${histAvg.toFixed(2)})</span>
      </div>
    `;

    // 5. Reset Filters Action
    if (selectedSource || selectedTopic) {
      chipsHtml += `
        <button type="button" class="timeline-reset-all-btn" onclick="resetTimelineScope()" title="Reset to all outlets and all topics">
          <i data-lucide="rotate-ccw" style="width:12px;height:12px;"></i>
          <span>Reset Filters</span>
        </button>
      `;
    }

    activeFiltersWrap.innerHTML = chipsHtml;
    if (window.lucide && lucide.createIcons) {
      lucide.createIcons({ root: activeFiltersWrap });
    }
  }

  if (timeRangeEl) {
    const filterPrefix = selectedSource ? `${sourceName}: ` : '';
    const topicPrefix = topicMeta ? `${topicMeta.icon} ${topicMeta.name} — ` : '';
    timeRangeEl.innerText = `${filterPrefix}${topicPrefix}${timeframeLabel} (${points.length} Data Points)`;
  }

  // Sizing: 1060 x 360 to fill the card space cleanly
  const width = 1060;
  const height = 360;
  const padding = { top: 35, right: 35, bottom: 50, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (points.length < 2) {
    chartSvg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-sans)" font-size="14">Collecting snapshots over time...</text>`;
    return;
  }

  // Dynamic Y-Domain: scale to data but always include 0.00 neutrality baseline and historical baseline
  let allScores = [0, histAvg, ...points.map(p => p.score)];
  points.forEach(p => {
    Object.values(p.averages || {}).forEach(v => {
      if (typeof v === 'number') allScores.push(v);
    });
  });

  const dataMin = Math.min(...allScores);
  const dataMax = Math.max(...allScores);
  const minY = Math.min(-0.4, Math.floor((dataMin - 0.08) * 10) / 10);
  const maxY = Math.max(0.2, Math.ceil((dataMax + 0.08) * 10) / 10);
  const getY = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;
  const getX = (idx) => padding.left + (idx / Math.max(1, points.length - 1)) * chartW;
  const zeroY = Math.max(padding.top, Math.min(padding.top + chartH, getY(0)));
  const histY = Math.max(padding.top, Math.min(padding.top + chartH, getY(histAvg)));

  // Grid lines and labels (clean 0.1 intervals)
  let gridHTML = '';
  for (let v = minY; v <= maxY + 0.01; v += 0.1) {
    const rounded = Math.round(v * 10) / 10;
    const y = getY(rounded);
    const isZero = Math.abs(rounded) < 0.001;
    const label = rounded > 0 ? `+${rounded.toFixed(2)}` : (isZero ? '0.00' : rounded.toFixed(2));
    gridHTML += `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" 
            stroke="${isZero ? 'var(--text-muted)' : 'var(--border-color)'}" 
            stroke-width="${isZero ? '1.5' : '1'}" 
            stroke-dasharray="${isZero ? '4,4' : '2,2'}" opacity="${isZero ? '0.65' : '0.35'}"/>
      <text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" font-family="var(--font-mono)" font-size="11" font-weight="600" fill="${isZero ? 'var(--text-primary)' : 'var(--text-muted)'}">${label}</text>
    `;
  }

  // Zero line & Historical baseline line annotations
  gridHTML += `
    <text x="${width - padding.right}" y="${zeroY - 6}" text-anchor="end" font-family="var(--font-mono)" font-size="10" font-weight="600" fill="var(--text-muted)" opacity="0.6">Neutrality (0.00)</text>
    <line x1="${padding.left}" y1="${histY}" x2="${width - padding.right}" y2="${histY}" stroke="var(--accent-color)" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.65"/>
    <text x="${width - padding.right}" y="${histY - 6}" text-anchor="end" font-family="var(--font-mono)" font-size="10" font-weight="600" fill="var(--accent-color)" opacity="0.85">${selectedSource ? sourceName : 'Historical'} Baseline (${histAvg > 0 ? '+' : ''}${histAvg.toFixed(2)})</text>
  `;

  // Time labels on X axis
  let xLabelsHTML = '';
  const numLabels = Math.min(7, points.length);
  const step = Math.max(1, Math.floor(points.length / numLabels));

  for (let i = 0; i < points.length; i += step) {
    const x = getX(i);
    const d = new Date(points[i].timestamp);
    let dateLabel = '';
    const spanMs = points.length > 1 ? (new Date(points[points.length - 1].timestamp) - new Date(points[0].timestamp)) : 0;
    if (spanMs <= 24 * 3600 * 1000) {
      dateLabel = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else {
      dateLabel = `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    xLabelsHTML += `
      <text x="${x}" y="${height - 14}" text-anchor="middle" font-family="var(--font-mono)" font-size="11" font-weight="500" fill="var(--text-muted)">${dateLabel}</text>
    `;
  }

  // --- MULTI-OUTLET TRAJECTORY LINES & HIT AREAS ---
  let outletLinesHTML = '';
  let outletHitAreasHTML = '';
  sourceIds.forEach(srcId => {
    const meta = SOURCE_META[srcId] || { color: '#94a3b8', name: srcId };
    const srcPts = [];
    points.forEach((pt, pIdx) => {
      const val = pt.averages?.[srcId];
      if (typeof val === 'number') {
        srcPts.push({ x: getX(pIdx), y: getY(val), val });
      }
    });

    if (srcPts.length < 2) return;

    let pathD = `M ${srcPts[0].x} ${srcPts[0].y}`;
    for (let i = 1; i < srcPts.length; i++) {
      const p0 = srcPts[i - 1];
      const p1 = srcPts[i];
      const mx = (p0.x + p1.x) / 2;
      pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    let strokeWidth = '1.6';
    let opacity = '0.35';
    let extraFilter = '';

    if (selectedSource) {
      if (srcId === selectedSource) {
        strokeWidth = '3.5';
        opacity = '1';
        extraFilter = `filter="drop-shadow(0 2px 8px ${meta.color}99)"`;
      } else {
        strokeWidth = '1.2';
        opacity = '0.12'; // GHOSTED
      }
    }

    outletLinesHTML += `
      <path class="timeline-outlet-line" data-source="${srcId}" d="${pathD}" fill="none" 
            stroke="${meta.color}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}" 
            stroke-linecap="round" stroke-linejoin="round" ${extraFilter} style="transition: stroke-width 0.15s ease, stroke-opacity 0.15s ease;"/>
    `;

    outletHitAreasHTML += `
      <path class="timeline-hit-area" data-source="${srcId}" d="${pathD}" fill="none" 
            stroke="transparent" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"
            pointer-events="stroke" style="cursor: pointer;"/>
    `;
  });

  // --- GLOBAL AVERAGE TRAJECTORY PATH ---
  let globalPathD = `M ${getX(0)} ${getY(points[0].score)}`;
  for (let i = 1; i < points.length; i++) {
    const x0 = getX(i - 1);
    const y0 = getY(points[i - 1].score);
    const x1 = getX(i);
    const y1 = getY(points[i].score);
    const mx = (x0 + x1) / 2;
    globalPathD += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }

  const globalAreaD = `${globalPathD} L ${getX(points.length - 1)} ${zeroY} L ${getX(0)} ${zeroY} Z`;

  let mainLineHTML = '';
  if (!selectedSource) {
    // If no outlet is selected, Global Average stands out with vibrant gradient & area fill
    mainLineHTML = `
      <path d="${globalAreaD}" fill="url(#timelineAreaGrad)"/>
      <path d="${globalPathD}" fill="none" stroke="url(#timelineLineGrad)" stroke-width="3.8" stroke-linecap="round"/>
    `;
  } else {
    // If an outlet is selected, Global Average is a clean benchmark line
    mainLineHTML = `
      <path d="${globalPathD}" fill="none" stroke="var(--text-primary)" stroke-width="2.6" stroke-dasharray="4,4" stroke-opacity="0.8" stroke-linecap="round"/>
    `;
  }

  // Dots for each point on the focused line
  let dotsHTML = '';
  points.forEach((pt, idx) => {
    const x = getX(idx);
    const y = getY(pt.score);
    const color = pt.score > 0.1 ? 'var(--pos-color)' : (pt.score < -0.1 ? 'var(--neg-color)' : 'var(--accent-color)');
    dotsHTML += `
      <circle cx="${x}" cy="${y}" r="4.5" fill="${color}" stroke="var(--bg-secondary)" stroke-width="2" style="cursor:pointer; transition:transform 0.15s ease;"
              data-idx="${idx}" class="timeline-dot"/>
    `;
  });

  chartSvg.innerHTML = `
    <defs>
      <linearGradient id="timelineAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ef4444" stop-opacity="0.18"/>
        <stop offset="50%" stop-color="#6366f1" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="#64748b" stop-opacity="0.02"/>
      </linearGradient>
      <linearGradient id="timelineLineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#ef4444"/>
        <stop offset="50%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#10b981"/>
      </linearGradient>
    </defs>
    ${gridHTML}
    ${xLabelsHTML}
    ${outletLinesHTML}
    ${mainLineHTML}
    ${outletHitAreasHTML}
    ${dotsHTML}
  `;

  // Attach hover events to dots
  chartSvg.querySelectorAll('.timeline-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      const idx = parseInt(dot.getAttribute('data-idx'));
      const pt = points[idx];
      if (!pt || !tooltip) return;

      const dateStr = new Date(pt.timestamp).toLocaleString();
      const moodText = pt.score < -0.3 ? 'Alarmist / Doom' : (pt.score < -0.05 ? 'Leaning Gloomy' : (pt.score > 0.1 ? 'Optimistic' : 'Neutral'));
      const scoreColor = pt.score > 0 ? 'var(--pos-color)' : 'var(--neg-color)';
      const ptDelta = pt.score - histAvg;
      const ptDeltaStr = (ptDelta >= 0 ? '+' : '') + ptDelta.toFixed(2);
      
      let tooltipContent = '';
      if (selectedTopic && topicMeta) {
        tooltipContent = `
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">${dateStr}</div>
          <div style="display:flex; justify-content:space-between; gap:0.75rem; margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">${topicMeta.icon} ${topicMeta.name}:</span>
            <strong style="color:${scoreColor};">${pt.score > 0 ? '+' : ''}${pt.score.toFixed(3)} (${moodText})</strong>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-color); font-family:var(--font-mono);">vs Hist: ${ptDeltaStr}</div>
        `;
      } else if (selectedSource) {
        tooltipContent = `
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">${dateStr}</div>
          <div style="font-size:0.78rem; color:${scoreColor}; font-weight:700; margin-bottom:0.2rem;">${sourceName}: ${pt.score > 0 ? '+' : ''}${pt.score.toFixed(3)} (${moodText})</div>
          <div style="display:flex; justify-content:space-between; gap:0.6rem; font-size:0.7rem; color:var(--text-muted); font-family:var(--font-mono); border-top:1px solid var(--border-color); padding-top:0.25rem;">
            <span>vs Historical: <strong style="color:var(--accent-color);">${ptDeltaStr}</strong></span>
            <span>Global Avg: ${pt.averages ? ((Object.values(pt.averages).reduce((a,b)=>a+b,0)/Object.values(pt.averages).length).toFixed(2)) : '-'}</span>
          </div>
        `;
      } else {
        const outletEntries = Object.entries(pt.averages).filter(e => typeof e[1] === 'number').sort((a,b) => a[1] - b[1]);
        const lowest = outletEntries[0];
        const highest = outletEntries[outletEntries.length - 1];
        const lowestName = lowest ? (resolvedSources[lowest[0]]?.name || SOURCE_META[lowest[0]]?.name || lowest[0]) : '';
        const highestName = highest ? (resolvedSources[highest[0]]?.name || SOURCE_META[highest[0]]?.name || highest[0]) : '';
        tooltipContent = `
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">${dateStr}</div>
          <div style="display:flex; justify-content:space-between; gap:0.75rem; margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">Global Vibe:</span>
            <strong style="color:${scoreColor};">${pt.score > 0 ? '+' : ''}${pt.score.toFixed(3)} (${moodText})</strong>
          </div>
          <div style="font-size:0.7rem; color:var(--accent-color); font-family:var(--font-mono); margin-bottom:0.25rem;">vs Historical: ${ptDeltaStr}</div>
          ${lowest ? `<div style="font-size:0.7rem; color:var(--neg-color);">📉 Darkest: ${lowestName} (${lowest[1].toFixed(2)})</div>` : ''}
          ${highest ? `<div style="font-size:0.7rem; color:var(--pos-color);">📈 Brightest: ${highestName} (${highest[1].toFixed(2)})</div>` : ''}
        `;
      }

      tooltip.innerHTML = tooltipContent;
      tooltip.style.display = 'block';

      const wrapRect = document.getElementById('timeline-chart-wrap').getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      tooltip.style.left = `${dotRect.left - wrapRect.left + 4}px`;
      tooltip.style.top = `${dotRect.top - wrapRect.top - 8}px`;
      dot.setAttribute('r', '7');
    });

    dot.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.display = 'none';
      dot.setAttribute('r', '4.5');
    });
  });

  // Helper functions for outlet hover interaction
  const activateOutletHover = (sId, e) => {
    const meta = SOURCE_META[sId] || { color: '#94a3b8', name: sId };
    const outletName = resolvedSources[sId]?.name || state.sources[sId]?.name || meta.name || sId;

    if (!selectedSource) {
      chartSvg.querySelectorAll('.timeline-outlet-line').forEach(l => {
        if (l.getAttribute('data-source') === sId) {
          l.style.strokeOpacity = '1';
          l.style.strokeWidth = '3.5';
          l.style.filter = `drop-shadow(0 0 8px ${meta.color}99)`;
        } else {
          l.style.strokeOpacity = '0.08';
        }
      });
    }

    if (tooltip) {
      const histScored = (state.sources[sId]?.articles || []).filter(a => typeof a.sentiment === 'number');
      const sHistAvg = histScored.length > 0 ? (histScored.reduce((sum,a)=>sum+a.sentiment,0)/histScored.length) : (resolvedSources[sId]?.averageSentiment || 0);
      
      let currentValHTML = '';
      for (let i = points.length - 1; i >= 0; i--) {
        const val = points[i].averages?.[sId];
        if (typeof val === 'number') {
          const delta = val - sHistAvg;
          const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(2);
          const scoreColor = val > 0.1 ? 'var(--pos-color)' : (val < -0.1 ? 'var(--neg-color)' : 'var(--accent-color)');
          currentValHTML = `
            <div style="display:flex; justify-content:space-between; gap:0.6rem; margin-top:0.25rem; font-size:0.75rem;">
              <span style="color:var(--text-secondary);">Timeline Vibe:</span>
              <strong style="color:${scoreColor};">${val > 0 ? '+' : ''}${val.toFixed(2)}</strong>
            </div>
            <div style="font-size:0.7rem; color:var(--accent-color); font-family:var(--font-mono); margin-top:0.15rem;">vs Historical: ${deltaStr}</div>
          `;
          break;
        }
      }

      tooltip.innerHTML = `
        <div style="font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:0.4rem;">
          <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:${meta.color};"></span>
          ${outletName}
        </div>
        ${currentValHTML}
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:0.2rem;">All-Time Baseline: <strong>${sHistAvg > 0 ? '+' : ''}${sHistAvg.toFixed(2)}</strong></div>
        <div style="font-size:0.68rem; color:var(--accent-color); margin-top:0.3rem; border-top:1px solid var(--border-color); padding-top:0.25rem; font-weight:600;">
          ${selectedSource === sId ? '✓ Click to clear outlet focus' : 'Click line to focus this outlet'}
        </div>
      `;
      tooltip.style.display = 'block';
      const wrapRect = document.getElementById('timeline-chart-wrap').getBoundingClientRect();
      const leftPos = Math.min(wrapRect.width - 190, Math.max(10, e.clientX - wrapRect.left + 12));
      const topPos = Math.max(10, e.clientY - wrapRect.top - 24);
      tooltip.style.left = `${leftPos}px`;
      tooltip.style.top = `${topPos}px`;
    }
  };

  const deactivateOutletHover = () => {
    if (!selectedSource) {
      chartSvg.querySelectorAll('.timeline-outlet-line').forEach(l => {
        l.style.strokeOpacity = '0.35';
        l.style.strokeWidth = '1.6';
        l.style.filter = 'none';
      });
    }
    if (tooltip) tooltip.style.display = 'none';
  };

  // Attach hover & click listeners to both hit areas and visible lines
  chartSvg.querySelectorAll('.timeline-hit-area, .timeline-outlet-line').forEach(el => {
    const sId = el.getAttribute('data-source');
    if (!sId) return;

    el.addEventListener('mouseenter', (e) => activateOutletHover(sId, e));
    el.addEventListener('mousemove', (e) => {
      if (tooltip && tooltip.style.display === 'block') {
        const wrapRect = document.getElementById('timeline-chart-wrap').getBoundingClientRect();
        const leftPos = Math.min(wrapRect.width - 190, Math.max(10, e.clientX - wrapRect.left + 12));
        const topPos = Math.max(10, e.clientY - wrapRect.top - 24);
        tooltip.style.left = `${leftPos}px`;
        tooltip.style.top = `${topPos}px`;
      }
    });
    el.addEventListener('mouseleave', deactivateOutletHover);
    el.addEventListener('click', () => {
      toggleSourceFilter(sId);
    });
  });

  // Render Topic Dynamics Breakdown
  if (topicsGrid) {
    const topicAvgs = {};
    const topicCounts = {};
    const activeSources = selectedSource ? { [selectedSource]: state.sources[selectedSource] } : state.sources;

    Object.values(activeSources || {}).forEach(s => {
      (s.articles || []).forEach(a => {
        if (cutoff > 0) {
          const pub = new Date(a.pubDate).getTime();
          if (!isNaN(pub) && pub < cutoff) return;
        }
        const cat = a.category || 'other';
        if (!topicAvgs[cat]) { topicAvgs[cat] = 0; topicCounts[cat] = 0; }
        const sc = typeof a.sentiment === 'number' ? a.sentiment : (a.sentimentGemini || 0);
        topicAvgs[cat] += sc;
        topicCounts[cat]++;
      });
    });

    topicsGrid.innerHTML = Object.keys(categoryNames).map(catKey => {
      const count = topicCounts[catKey] || 0;
      const avg = count > 0 ? (topicAvgs[catKey] / count) : 0;
      const meta = categoryNames[catKey];
      const pct = Math.max(0, Math.min(100, ((avg + 1) / 2) * 100));
      const scoreClass = avg > 0.1 ? 'pos' : (avg < -0.1 ? 'neg' : 'neu');
      const fillColor = avg > 0.1 ? 'var(--pos-color)' : (avg < -0.1 ? 'var(--neg-color)' : 'var(--accent-color)');
      const isSelected = (state.macroTrendsTopic === catKey);

      return `
        <div class="topic-trajectory-card ${isSelected ? 'topic-traj-card-active' : ''}" 
             onclick="toggleTimelineTopicFilter('${catKey}')" 
             style="cursor:pointer; ${isSelected ? 'border: 2px solid var(--accent-color);' : ''}" 
             title="${isSelected ? 'Click to clear filter' : `Click to filter timeline to ${meta.name}`}">
          <div class="topic-traj-header">
            <span>${meta.icon} ${meta.name}</span>
            <span class="topic-traj-score ${scoreClass}">${avg > 0 ? '+' : ''}${avg.toFixed(2)}</span>
          </div>
          <div class="topic-traj-bar-wrap">
            <div class="topic-traj-bar-fill" style="width: ${pct}%; background-color: ${fillColor};"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--text-muted); font-weight:600;">
            <span>${count} Articles</span>
            <span>${isSelected ? 'Active Filter ✕' : (avg > 0.15 ? 'Optimistic' : (avg < -0.15 ? 'Alarmist' : 'Balanced'))}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Toggle Macro Trends Timeline Topic Filter (filters timeline on current page without redirecting)
window.toggleTimelineTopicFilter = function(catKey) {
  if (state.macroTrendsTopic === catKey) {
    state.macroTrendsTopic = 'all';
  } else {
    state.macroTrendsTopic = catKey;
  }
  renderSentimentTimeline();
  if (window.lucide && lucide.createIcons) {
    lucide.createIcons();
  }
};

window.clearTimelineSourceFilter = function() {
  state.filters.source = 'all';
  if (elements.filterSource) elements.filterSource.value = 'all';
  updateFilterIndicator();
  updateAppUI();
};

window.changeTimelineWindow = function(val) {
  state.filters.time = val;
  state.headlinesLimit = 20;
  if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = val;
  if (elements.filterTime) elements.filterTime.value = val;
  const silverTime = document.getElementById('silver-timeframe-select');
  if (silverTime) silverTime.value = val;
  updateAppUI();
};

window.resetTimelineScope = function() {
  state.filters.source = 'all';
  state.macroTrendsTopic = 'all';
  state.filters.category = 'all';
  if (elements.filterSource) elements.filterSource.value = 'all';
  if (elements.filterCategory) elements.filterCategory.value = 'all';
  if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = 'all';
  updateFilterIndicator();
  updateTopicPillsActive('all');
  updateAppUI();
};

// Helpers
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

function getMoodClass(score) {
  if (score === null || score === undefined) return 'none';
  if (score > 0.15) return 'positive';
  if (score < -0.15) return 'negative';
  return 'neutral';
}

function getMoodLabel(score) {
  if (score >= 0.65) return 'Inspiring / Breakthrough';
  if (score >= 0.35) return 'Constructive Relief';
  if (score >= 0.15) return 'Leaning Positive';
  if (score > 0) return 'Mildly Optimistic';
  if (score === 0) return 'Neutral';
  if (score > -0.15) return 'Mildly Cautious';
  if (score > -0.45) return 'Leaning Gloomy';
  return 'Alarmist / Severe Crisis';
}

// Toggle filters from UI selections
function toggleSourceFilter(sourceId) {
  if (state.filters.source === sourceId) {
    // Clear filter
    state.filters.source = 'all';
    if (elements.filterSource) elements.filterSource.value = 'all';
    if (elements.deepdiveFilterSource) elements.deepdiveFilterSource.value = 'all';
  } else {
    // Set filter
    state.filters.source = sourceId;
    if (elements.filterSource) elements.filterSource.value = sourceId;
    if (elements.deepdiveFilterSource) elements.deepdiveFilterSource.value = sourceId;
    
    // If clicked on Pulse, smoothly ensure the pulse spotlight banner is visible
    if (state.activeTab === 'pulse') {
      setTimeout(() => {
        const target = document.getElementById('pulse-spotlight-banner');
        if (target && target.style.display !== 'none') {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 60);
    } else {
      const target = document.getElementById('deepdive-spotlight-banner') || document.getElementById('deepdive-feed-section');
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  
  updateFilterIndicator();
  renderHeadlines();
  
  // Update styling indicators on active cards
  document.querySelectorAll('.source-card').forEach(card => {
    if (card.getAttribute('data-id') === state.filters.source) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
  
  // Update active marker highlights smoothly in averages mode, or rebuild lanes
  if (state.spectrumViewMode === 'averages') {
    updateSpectrumActiveStates();
  } else {
    renderSpectrum();
  }
}

function updateSpectrumActiveStates() {
  const activeId = state.filters.source;
  const markers = elements.spectrumMarkers.querySelectorAll('.outlet-marker');
  markers.forEach(marker => {
    const id = marker.getAttribute('data-id');
    if (activeId === 'all') {
      marker.classList.remove('active');
      marker.classList.remove('inactive');
      marker.style.opacity = '1';
    } else if (id === activeId) {
      marker.classList.add('active');
      marker.classList.remove('inactive');
      marker.style.opacity = '1';
    } else {
      marker.classList.remove('active');
      marker.classList.add('inactive');
      marker.style.opacity = '0.35';
    }
  });
}

function updateFilterIndicator() {
  const isSourceActive = state.filters.source !== 'all' && state.sources[state.filters.source];
  if (isSourceActive) {
    const srcName = state.sources[state.filters.source].name;
    if (elements.filterName) elements.filterName.innerText = srcName;
    if (elements.activeFilterIndicator) elements.activeFilterIndicator.style.display = 'flex';

    if (elements.deepdiveFilterName && elements.deepdiveFilterIndicator) {
      elements.deepdiveFilterName.innerText = srcName;
      elements.deepdiveFilterIndicator.style.display = 'flex';
    }

    if (elements.quickSourceIndicator && elements.quickSourceName) {
      elements.quickSourceName.innerText = srcName;
      elements.quickSourceIndicator.style.display = 'inline-flex';
    }

    const deepdiveFeedTitle = document.getElementById('deepdive-feed-title-text');
    if (deepdiveFeedTitle) {
      deepdiveFeedTitle.innerText = `${srcName}'s Headline Feed`;
    }
  } else {
    if (elements.activeFilterIndicator) elements.activeFilterIndicator.style.display = 'none';
    if (elements.deepdiveFilterIndicator) elements.deepdiveFilterIndicator.style.display = 'none';
    if (elements.quickSourceIndicator) elements.quickSourceIndicator.style.display = 'none';

    const deepdiveFeedTitle = document.getElementById('deepdive-feed-title-text');
    if (deepdiveFeedTitle) {
      deepdiveFeedTitle.innerText = 'Headlines Feed';
    }
  }

  // Active Topic Filter Indicator in Sticky Header Bar
  if (elements.quickCategoryIndicator && elements.quickCategoryName) {
    if (state.filters.category !== 'all') {
      const catCap = state.filters.category.charAt(0).toUpperCase() + state.filters.category.slice(1);
      elements.quickCategoryName.innerText = catCap;
      elements.quickCategoryIndicator.style.display = 'inline-flex';
    } else {
      elements.quickCategoryIndicator.style.display = 'none';
    }
  }

  // Highlight sticky navbar when any filter or search query is actively applied
  const hasActiveFilters = Boolean(
    (state.filters.source && state.filters.source !== 'all') ||
    (state.filters.category && state.filters.category !== 'all') ||
    (state.filters.vibe && state.filters.vibe !== 'all') ||
    (state.filters.search && state.filters.search.trim().length > 0)
  );
  if (elements.quickNavBar) {
    elements.quickNavBar.classList.toggle('has-active-filters', hasActiveFilters);
  }
}

// Sort order toggling
function toggleSort(field) {
  if (state.sort.field === field) {
    // Toggle order
    state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
  } else {
    // Set new field, default order to desc
    state.sort.field = field;
    state.sort.order = 'desc';
  }
  
  // Update button visual state for both Pulse and Deep Dive
  const isDate = state.sort.field === 'date';
  const orderIcon = state.sort.order === 'desc' ? 'arrow-down-narrow-wide' : 'arrow-up-narrow-wide';

  if (elements.sortDateBtn && elements.sortVibeBtn) {
    elements.sortDateBtn.classList.toggle('active', isDate);
    elements.sortVibeBtn.classList.toggle('active', !isDate);
    elements.sortDateBtn.innerHTML = isDate ? `Date <i data-lucide="${orderIcon}"></i>` : 'Date';
    elements.sortVibeBtn.innerHTML = !isDate ? `Sentiment Vibe <i data-lucide="${orderIcon}"></i>` : 'Sentiment Vibe';
  }

  if (elements.deepdiveSortDateBtn && elements.deepdiveSortVibeBtn) {
    elements.deepdiveSortDateBtn.classList.toggle('active', isDate);
    elements.deepdiveSortVibeBtn.classList.toggle('active', !isDate);
    elements.deepdiveSortDateBtn.innerHTML = isDate ? `Date <i data-lucide="${orderIcon}"></i>` : 'Date';
    elements.deepdiveSortVibeBtn.innerHTML = !isDate ? `Sentiment Vibe <i data-lucide="${orderIcon}"></i>` : 'Sentiment Vibe';
  }
  
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
  renderHeadlines();
}

// Render filterable and sortable list of articles
function renderHeadlines() {
  if (elements.headlinesContainer) {
    elements.headlinesContainer.innerHTML = '';
  }
  if (elements.deepdiveHeadlinesContainer) {
    elements.deepdiveHeadlinesContainer.innerHTML = '';
  }
  
  // 1. Gather all articles into flat array
  const rawArticles = [];
  Object.keys(resolvedSources).forEach(sourceId => {
    // Skip if we filtered to a specific source and this is not it
    if (state.filters.source !== 'all' && state.filters.source !== sourceId) {
      return;
    }
    
    const source = resolvedSources[sourceId];
    if (source.articles) {
      source.articles.forEach(art => {
        rawArticles.push({
          sourceId,
          sourceName: source.name,
          ...art
        });
      });
    }
  });

  // Sort newest first before deduplication so we retain the freshest revision
  rawArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Deduplicate: filter out identical URLs and identical headlines
  const seenUrls = new Set();
  const seenTitles = new Set();
  let articles = [];

  for (const art of rawArticles) {
    const cUrl = canonicalUrl(art.link);
    const cTitle = cleanHeadlineTitle(art.title);

    // If already seen by canonical URL or clean title, skip this duplicate copy
    if (cUrl && seenUrls.has(cUrl)) continue;
    if (cTitle && seenTitles.has(cTitle)) continue;

    if (cUrl) seenUrls.add(cUrl);
    if (cTitle) seenTitles.add(cTitle);
    articles.push(art);
  }
  
  // 2. Apply Filters
  // Category Filter
  if (state.filters.category !== 'all') {
    articles = articles.filter(art => art.category === state.filters.category);
  }
  
  // Vibe Filter
  if (state.filters.vibe !== 'all') {
    if (state.filters.vibe === 'positive') {
      articles = articles.filter(art => art.sentiment > 0.15);
    } else if (state.filters.vibe === 'negative') {
      articles = articles.filter(art => art.sentiment < -0.15);
    } else if (state.filters.vibe === 'neutral') {
      articles = articles.filter(art => art.sentiment >= -0.15 && art.sentiment <= 0.15);
    }
  }
  
  // Search Query Filter
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    articles = articles.filter(art => art.title.toLowerCase().includes(q));
  }
  
  // 3. Apply Sorting
  articles.sort((a, b) => {
    let comparison = 0;
    
    if (state.sort.field === 'date') {
      comparison = new Date(b.pubDate) - new Date(a.pubDate);
    } else if (state.sort.field === 'vibe') {
      const valA = a.sentiment !== null ? a.sentiment : -999;
      const valB = b.sentiment !== null ? b.sentiment : -999;
      comparison = valB - valA;
    }
    
    return state.sort.order === 'desc' ? comparison : -comparison;
  });
  
function createArticleCard(art, index, prefix = 'pulse') {
  const hasValidScore = typeof art.sentiment === 'number';
  const validScore = hasValidScore ? art.sentiment : 0;
  const itemVibe = hasValidScore ? getMoodClass(validScore) : 'neutral';
  const dateObj = new Date(art.pubDate);
  const dateFormatted = dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const elementId = `article-explain-${prefix}-${index}`;
  const cardId = `art-card-${prefix}-${art.sourceId}-${index}`;
  const card = document.createElement('div');
  card.className = `article-card card ${itemVibe}`;
  card.id = cardId;
  
  const feedUrl = SOURCE_FEEDS[art.sourceId] || '';
  const brandMeta = SOURCE_META[art.sourceId] || { initials: art.sourceId, color: '#999' };
  
  const scoreBadgeHTML = hasValidScore
    ? `<span class="article-vibe-score ${itemVibe}">${validScore > 0 ? '+' : ''}${validScore.toFixed(2)}</span>`
    : `<span class="article-vibe-score neu" style="font-size:0.68rem; opacity:0.85; padding: 0.15rem 0.5rem;">Pending AI</span>`;

  card.innerHTML = `
    <div class="article-top-bar">
      <div class="article-badges">
        <span class="source-badge" style="background-color: ${brandMeta.color}">${getSourceFlagHTML(art.sourceId)} ${art.sourceName}</span>
        <span class="cat-badge ${art.category || 'other'}">${art.category || 'other'}</span>
        ${scoreBadgeHTML}
      </div>
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span class="article-date">${dateFormatted}</span>
        <div class="article-actions" style="display: flex; gap: 0.35rem;">
          <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="action-icon-btn" title="Open original article">
            <i data-lucide="external-link" style="width: 13px; height: 13px;"></i>
          </a>
          <button onclick="copyToClipboard('${feedUrl}', this)" class="action-icon-btn" title="Copy source RSS feed URL">
            <i data-lucide="copy" style="width: 13px; height: 13px;"></i>
          </button>
        </div>
      </div>
    </div>
    
    <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="article-headline-link">${art.title}</a>
    
    <p class="article-description">${art.description || ''}</p>
    
    <button class="article-reasoning-toggle" onclick="toggleReasoningPanel('${elementId}', this)">
      <i data-lucide="chevron-right" style="width: 14px; height: 14px; transition: transform 0.2s;"></i>
      <span>Show analysis details</span>
    </button>
    
    <div id="${elementId}" class="article-reasoning-panel">
      ${hasValidScore && art.explanation && !art.explanation.includes('locally') ? art.explanation : 'Pending evaluation by Gemini AI (queued for subsequent sync cycle).'}
    </div>
  `;
  return card;
}

  // 3.5. Render Spotlight Banner if filtered to a specific news source
  renderSpotlightBanner(articles);
  
  // 4. Pagination / Slicing to top N stories (default 20)
  const totalMatching = articles.length;
  const displayedArticles = articles.slice(0, state.headlinesLimit);

  // Update count badge in the unified feed box headers
  const countText = totalMatching === 0 ? '0 Stories' : `Showing ${displayedArticles.length} of ${totalMatching} Stories`;
  if (elements.headlinesCountBadge) {
    elements.headlinesCountBadge.innerText = countText;
  }
  if (elements.deepdiveHeadlinesCountBadge) {
    elements.deepdiveHeadlinesCountBadge.innerText = countText;
  }

  // Sync filter control values if necessary
  if (elements.deepdiveFilterSource && elements.deepdiveFilterSource.value !== state.filters.source) {
    elements.deepdiveFilterSource.value = state.filters.source;
  }
  if (elements.deepdiveFilterTime && elements.deepdiveFilterTime.value !== state.filters.time) {
    elements.deepdiveFilterTime.value = state.filters.time;
  }
  if (elements.deepdiveFilterCategory && elements.deepdiveFilterCategory.value !== state.filters.category) {
    elements.deepdiveFilterCategory.value = state.filters.category;
  }
  if (elements.deepdiveFilterVibe && elements.deepdiveFilterVibe.value !== state.filters.vibe) {
    elements.deepdiveFilterVibe.value = state.filters.vibe;
  }
  if (elements.deepdiveSearchInput && elements.deepdiveSearchInput.value !== (state.filters.search || '')) {
    elements.deepdiveSearchInput.value = state.filters.search || '';
  }

  // Update show more button & remaining count for both feeds
  [
    { wrap: elements.headlinesPaginationWrap, text: elements.headlinesShowMoreText },
    { wrap: elements.deepdiveHeadlinesPaginationWrap, text: elements.deepdiveHeadlinesShowMoreText }
  ].forEach(({ wrap, text }) => {
    if (!wrap) return;
    if (totalMatching <= displayedArticles.length) {
      wrap.style.display = 'none';
    } else {
      wrap.style.display = 'block';
      if (text) {
        const remaining = totalMatching - displayedArticles.length;
        text.innerText = `Show More Stories (${remaining} remaining)`;
      }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: wrap });
    }
  });

  // 5. Render articles across active headline containers
  const containers = [
    { el: elements.headlinesContainer, prefix: 'pulse' },
    { el: elements.deepdiveHeadlinesContainer, prefix: 'dd' }
  ];

  const emptyHTML = `
    <div class="empty-state">
      <i data-lucide="info"></i>
      <span>No articles match the current filter criteria.</span>
    </div>
  `;

  containers.forEach(({ el, prefix }) => {
    if (!el) return;
    el.innerHTML = '';
    if (displayedArticles.length === 0) {
      el.innerHTML = emptyHTML;
    } else {
      displayedArticles.forEach((art, index) => {
        el.appendChild(createArticleCard(art, index, prefix));
      });
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: el });
    }
  });
}

// Toggle analysis panel display
window.toggleReasoningPanel = function(id, btn) {
  const panel = document.getElementById(id);
  const icon = btn.querySelector('i');
  
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    icon.style.transform = 'rotate(0deg)';
  } else {
    panel.style.display = 'block';
    icon.style.transform = 'rotate(90deg)';
  }
};

// UI State Message Helpers
function showEmptyState() {
  if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = 'Cache is empty.';
  if (elements.analyzerBadge) elements.analyzerBadge.innerText = 'None';
  if (elements.headlinesContainer) {
    elements.headlinesContainer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="database-backup"></i>
        <h3>No local news data found</h3>
        <p>Waiting for data synchronization...</p>
      </div>
    `;
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function showErrorState(message) {
  if (elements.headlinesContainer) {
    elements.headlinesContainer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="alert-triangle" style="color:var(--neg-color)"></i>
        <h3>An error occurred</h3>
        <p>${message}</p>
      </div>
    `;
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// Setup macOS dock taskbar zoom style magnification on the spectrum markers
function setupSpectrumMagnification() {
  const container = elements.spectrumMarkers;
  if (!container) return;
  
  container.addEventListener('mousemove', (e) => {
    const markers = container.querySelectorAll('.outlet-marker');
    let closestMarker = null;
    let min2DDist = Infinity;

    markers.forEach(marker => {
      const mRect = marker.getBoundingClientRect();
      const markerCenterX = mRect.left + mRect.width / 2;
      const markerCenterY = mRect.top + mRect.height / 2;

      const dx = e.clientX - markerCenterX;
      const dy = e.clientY - markerCenterY;

      // 2D Euclidean distance accounting for BOTH horizontal and height distance
      const dist2D = Math.hypot(dx, dy);

      // Height distance is weighted strictly (1.35x) so markers on stacked vertical tiers don't bleed into each other
      const proximityDist = Math.hypot(dx * 0.85, dy * 1.35);
      const threshold = 75; // range of magnification effect in pixels

      let scale = 1.0;
      if (proximityDist < threshold) {
        const factor = 1 - (proximityDist / threshold);
        scale = 1.0 + 0.5 * factor;
      }

      const bubble = marker.querySelector('.marker-bubble');
      if (bubble) {
        bubble.style.transform = `scale(${scale})`;
        marker.style.zIndex = Math.round(scale * 100);
      }

      if (dist2D < min2DDist) {
        min2DDist = dist2D;
        closestMarker = marker;
      }
    });

    // Tooltip Labels: strictly display only for the single closest marker in 2D space,
    // and only when the cursor is genuine hover distance (< 30px) in both height and horizontal
    markers.forEach(marker => {
      const label = marker.querySelector('.marker-label');
      if (!label) return;
      if (marker === closestMarker && min2DDist < 30) {
        label.style.opacity = '1';
        label.style.top = '-32px';
        marker.style.zIndex = '250';
      } else {
        label.style.opacity = '0';
        label.style.top = '-24px';
      }
    });
  });
  
  container.addEventListener('mouseleave', () => {
    const markers = container.querySelectorAll('.outlet-marker');
    markers.forEach(marker => {
      const bubble = marker.querySelector('.marker-bubble');
      if (bubble) {
        bubble.style.transform = 'scale(1)';
      }
      marker.style.zIndex = '10';
      
      const label = marker.querySelector('.marker-label');
      if (label) {
        label.style.opacity = '0';
        label.style.top = '-24px';
      }
    });
  });
}

// Render Spotlight Banner for a filtered source showing interactive article sentiment plot
function renderSpotlightBanner(filteredArticles) {
  const pulseEl = document.getElementById('pulse-spotlight-banner') || elements.spotlightBanner;
  const ddEl = document.getElementById('deepdive-spotlight-banner') || elements.deepdiveSpotlightBanner;

  const banners = [
    { el: pulseEl, prefix: 'pulse' },
    { el: ddEl, prefix: 'dd' }
  ];
  
  if (state.filters.source === 'all' || filteredArticles.length === 0) {
    banners.forEach(({ el }) => {
      if (el) el.style.display = 'none';
    });
    return;
  }
  
  const sourceId = state.filters.source;
  const source = resolvedSources[sourceId];
  if (!source) return;
  
  // Calculate stats for this filtered view (excluding null/undefined sentiments)
  const scored = filteredArticles.filter(a => a.sentiment !== null && a.sentiment !== undefined);
  const avg = source.averageSentiment;
  
  let moodClass = 'neutral';
  let badgeText = 'Avg: N/A';
  if (avg !== null) {
    badgeText = `Average: ${avg > 0 ? '+' : ''}${avg.toFixed(2)}`;
    if (avg > 0.15) moodClass = 'positive';
    else if (avg < -0.15) moodClass = 'negative';
  }
  
  const total = scored.length;
  const posCount = scored.filter(a => a.sentiment > 0.15).length;
  const negCount = scored.filter(a => a.sentiment < -0.15).length;
  const neuCount = total - posCount - negCount;
  
  const posPct = total > 0 ? (posCount / total * 100).toFixed(0) : 0;
  const neuPct = total > 0 ? (neuCount / total * 100).toFixed(0) : 0;
  const negPct = total > 0 ? (negCount / total * 100).toFixed(0) : 0;
  
  // Get logo credentials
  const meta = SOURCE_META[sourceId] || { initials: sourceId.toUpperCase().slice(0, 3), color: 'var(--accent-color)' };
  
  // Smart Beeswarm Distribution Calculation:
  // Dynamically calculate collision columns to determine step and dot size so dots never overflow
  const horizontalThreshold = 2.2; // % width collision window
  const colStacks = [];
  
  // First pass: compute stack levels for each item
  const itemStacks = scored.map(art => {
    const score = art.sentiment;
    const xPct = 4 + (((score + 1) / 2) * 92);
    
    let stackLevel = 0;
    let collision = true;
    while (collision) {
      collision = false;
      for (const placed of colStacks) {
        if (Math.abs(placed.x - xPct) < horizontalThreshold && placed.stack === stackLevel) {
          stackLevel++;
          collision = true;
          break;
        }
      }
    }
    colStacks.push({ x: xPct, stack: stackLevel });
    return { art, score, xPct, stackLevel };
  });

  const maxStackLevel = colStacks.reduce((max, item) => Math.max(max, item.stack), 0);
  const containerHeight = Math.max(125, Math.min(160, 50 + maxStackLevel * 10));
  const availableH = containerHeight - 44; // keep inside box
  const stepY = maxStackLevel > 0 ? Math.min(13, Math.max(4.5, availableH / (maxStackLevel + 1))) : 12;
  const dotSize = maxStackLevel > 14 ? 8 : (maxStackLevel > 8 ? 10 : 12);
  const dotRadius = dotSize / 2;

  banners.forEach(({ el, prefix }) => {
    if (!el) return;

    const dotsHTML = itemStacks.map((item, idx) => {
      const { art, score, xPct, stackLevel } = item;
      const yOffset = Math.min(availableH, stackLevel * stepY);
      
      let color = 'var(--neu-color)';
      if (score > 0.15) color = 'var(--pos-color)';
      else if (score < -0.15) color = 'var(--neg-color)';
      
      const cardId = `art-card-${prefix}-${sourceId}-${idx}`;
      const cleanTitle = art.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      
      return `
        <div class="spotlight-dot" 
             onclick="scrollToArticle('${cardId}')"
             onmouseenter="showSpotlightTooltip(event, '${cleanTitle}', ${score})"
             onmouseleave="hideSpotlightTooltip()"
             style="position: absolute; left: calc(${xPct}% - ${dotRadius}px); bottom: calc(24px + ${yOffset}px); width: ${dotSize}px; height: ${dotSize}px; border-radius: 50%; background-color: ${color}; border: 1.5px solid var(--bg-card); cursor: pointer; transition: transform 0.15s ease, filter 0.15s ease; z-index: ${5 + Math.min(20, stackLevel)};">
        </div>
      `;
    }).join('');

    const extraActionBtn = prefix === 'pulse' 
      ? `<button type="button" class="action-btn" onclick="goToDeepDiveFeed()" style="font-size: 0.75rem; padding: 0.28rem 0.65rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); color: var(--text-primary); cursor: pointer; font-weight: 500;">
           <i data-lucide="newspaper" style="width: 13px; height: 13px; color: var(--accent-color);"></i>
           <span>View in Deep Dive &rarr;</span>
         </button>`
      : '';

    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '1rem';
    el.innerHTML = `
      <div class="spotlight-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="background-color: ${meta.color}; color: #fff; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; text-transform: uppercase;">${meta.initials}</div>
          <h3 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--text-primary); font-family: var(--font-serif);">${source.name} Spotlight</h3>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="score-badge ${moodClass}" style="font-size: 0.85rem; padding: 0.25rem 0.6rem; font-family: var(--font-mono);">${badgeText}</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">(${total} Articles)</span>
          ${extraActionBtn}
          <button type="button" class="close-spotlight-btn" onclick="toggleSourceFilter('${sourceId}')" title="Dismiss outlet spotlight" style="background: none; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; padding: 0.28rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s ease;">
            <i data-lucide="x" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      </div>
      
      <!-- Coverage Distribution Bar -->
      <div style="display: flex; flex-direction: column; gap: 0.35rem; width: 100%;">
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">
          <span>Coverage Tone</span>
          <span style="font-family: var(--font-mono);">${negPct}% Negative / ${neuPct}% Neutral / ${posPct}% Positive</span>
        </div>
        <div class="dist-bar-track" style="height: 6px; border-radius: 3px; display: flex; overflow: hidden; background-color: var(--bg-tertiary); width: 100%;">
          <div class="dist-slice neg" style="width: ${negPct}%; background-color: var(--neg-color);"></div>
          <div class="dist-slice neu" style="width: ${neuPct}%; background-color: var(--neu-color);"></div>
          <div class="dist-slice pos" style="width: ${posPct}%; background-color: var(--pos-color);"></div>
        </div>
      </div>
      
      <!-- Sentiment Beeswarm Plot -->
      <div class="spotlight-beeswarm-wrap">
        <div style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; display:flex; justify-content:space-between;">
          <span>Article Sentiment Distribution</span>
          <span style="font-family:var(--font-mono); font-size:0.68rem; opacity:0.8;">Max Stack: ${maxStackLevel + 1} articles</span>
        </div>
        <div style="position: relative; height: ${containerHeight}px; background: var(--bg-tertiary); border-radius: 12px; border: 1px solid var(--border-color); width: 100%; overflow: hidden; display: flex; align-items: center;">
          
          <!-- Editorial Valence Zones -->
          <div style="position: absolute; left: 0; width: 33%; top: 0; bottom: 0; background: rgba(197, 34, 31, 0.035); border-right: 1px dashed rgba(197, 34, 31, 0.18); pointer-events: none;"></div>
          <div style="position: absolute; left: 33%; width: 27%; top: 0; bottom: 0; background: transparent; pointer-events: none;"></div>
          <div style="position: absolute; left: 60%; right: 0; top: 0; bottom: 0; background: rgba(21, 128, 61, 0.035); border-left: 1px dashed rgba(21, 128, 61, 0.18); pointer-events: none;"></div>

          <!-- Track Baseline -->
          <div style="position: absolute; left: 16px; right: 16px; bottom: 20px; height: 1.5px; background: var(--border-color); z-index: 1;"></div>
          
          <!-- Zero Line Marker -->
          <div style="position: absolute; left: 50%; bottom: 16px; top: 10px; width: 1px; border-left: 1px dashed var(--text-muted); opacity: 0.35; z-index: 1; pointer-events: none;"></div>

          <!-- Track labels -->
          <span style="position: absolute; left: 16px; bottom: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--neg-color); font-weight: 700; pointer-events: none; z-index: 2;">Alarmist (-1.0)</span>
          <span style="position: absolute; left: 50%; transform: translateX(-50%); bottom: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted); font-weight: 700; pointer-events: none; z-index: 2;">Neutral (0.0)</span>
          <span style="position: absolute; right: 16px; bottom: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--pos-color); font-weight: 700; pointer-events: none; z-index: 2;">Positive (+1.0)</span>
          
          <!-- Plot Circles -->
          ${dotsHTML}
        </div>
        <div style="font-size: 0.68rem; color: var(--text-muted); text-align: center; font-style: italic; opacity: 0.9; margin-top: 0.15rem;">Hover over dots to inspect article score; click to jump directly to article card. Density scales dynamically to prevent overflow.</div>
        
        <!-- Custom Tooltip Element -->
        <div class="spotlight-tooltip"></div>
      </div>
    `;

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: el });
    }
  });
}

// Custom Tooltip Show/Hide handlers
window.showSpotlightTooltip = function(e, title, score) {
  const dot = e.target;
  const wrap = dot.closest('.spotlight-beeswarm-wrap');
  if (!wrap) return;
  const tooltip = wrap.querySelector('.spotlight-tooltip');
  if (!tooltip) return;
  
  let mood = 'Neutral';
  let moodColor = '#94a3b8';
  if (score > 0.15) { mood = 'Positive'; moodColor = '#22c55e'; }
  else if (score < -0.15) { mood = 'Negative'; moodColor = '#ef4444'; }
  
  tooltip.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 0.3rem; line-height: 1.35; color: #f8fafc; font-size: 0.78rem;">${title}</div>
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #94a3b8; border-top: 1px solid #334155; padding-top: 0.3rem; margin-top: 0.3rem;">
      <span>Tone: <strong style="color: #38bdf8; font-family: var(--font-mono); font-weight: 700;">${score > 0 ? '+' : ''}${score.toFixed(2)}</strong></span>
      <span style="font-weight: 700; color: ${moodColor};">${mood}</span>
    </div>
  `;
  
  tooltip.style.display = 'block';
  
  // Position relative to the wrap
  const wrapRect = wrap.getBoundingClientRect();
  const dotRect = dot.getBoundingClientRect();
  
  const rawLeft = dotRect.left - wrapRect.left + (dotRect.width / 2);
  const left = clamp(rawLeft, 130, Math.max(130, wrapRect.width - 130));
  const top = dotRect.top - wrapRect.top - 8;
  
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.transform = 'translate(-50%, -100%)';
};

window.hideSpotlightTooltip = function() {
  document.querySelectorAll('.spotlight-tooltip').forEach(tooltip => {
    tooltip.style.display = 'none';
  });
};

// Scroll to article card and flash highlight border
window.scrollToArticle = function(cardId) {
  let card = document.getElementById(cardId);
  if (!card) {
    const altId = cardId.includes('-pulse-') 
      ? cardId.replace('-pulse-', '-dd-') 
      : cardId.replace('-dd-', '-pulse-');
    card = document.getElementById(altId);
  }
  
  if (card && card.offsetParent !== null) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-flash');
    setTimeout(() => {
      card.classList.remove('highlight-flash');
    }, 2000);
  } else {
    // If not visible in current tab, jump to Deep Dive tab
    switchTab('deepdives');
    renderHeadlines();
    setTimeout(() => {
      const ddId = cardId.replace('-pulse-', '-dd-');
      const targetCard = document.getElementById(ddId) || document.getElementById(cardId);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.classList.add('highlight-flash');
        setTimeout(() => {
          targetCard.classList.remove('highlight-flash');
        }, 2000);
      }
    }, 150);
  }
};

window.copyToClipboard = function(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const icon = btn.querySelector('i');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width: 13px; height: 13px; color: var(--pos-color);"></i>`;
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: btn });
    }
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons({ root: btn });
      }
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy text:', err);
  });
};

// Embed and highlight interactive links to real-world news stories in executive summary
function linkifyEditorialSummary(rawSummary, articles = []) {
  if (!rawSummary) return '';

  const phraseMappings = [
    {
      phrase: 'planets actually worth visiting',
      keywords: ['planet', 'habitable', 'earth-like', 'inhabitable'],
      fallbackUrl: 'https://www.nytimes.com/2026/10/13/science/inhabitable-planets-solar-system.html',
      tooltip: 'Read NYT & BBC reports on newly discovered habitable worlds'
    },
    {
      phrase: 'alien worlds',
      keywords: ['planet', 'habitable', 'earth-like', 'distant star'],
      fallbackUrl: 'https://www.nytimes.com/2026/10/13/science/inhabitable-planets-solar-system.html',
      tooltip: 'Read NYT coverage of exoplanet discoveries'
    },
    {
      phrase: 'cracked cockpit glass',
      keywords: ['cracked window', 'flight forced to turn back', 'cockpit', 'gatwick'],
      fallbackUrl: 'https://www.bbc.co.uk/news/articles/cj1dwrxq1wndo',
      tooltip: 'Read BBC report on the BA flight forced back over cracked window'
    },
    {
      phrase: 'domestic tragedies',
      keywords: ['arson attack', 'tragedy at sea', 'killed in arson', 'blaze'],
      fallbackUrl: 'https://www.bbc.co.uk/news/articles/cq073814llkjo',
      tooltip: 'Read BBC reporting on tragic domestic investigations'
    },
    {
      phrase: 'sovereign real estate squabbles',
      keywords: ['real estate', 'silicon valley south', '3d printed homes', 'icon'],
      fallbackUrl: 'https://www.foxnews.com/politics/trumps-backyard-quietly-transforming-silicon-valley-south-wealthy-americans-flock',
      tooltip: 'Read reporting on high-stakes real estate expansions'
    },
    {
      phrase: 'deep-space science',
      keywords: ['mars rover', 'habitable', 'planet', 'perseverance', 'nasa'],
      fallbackUrl: 'https://www.nytimes.com/2026/10/12/science/mars-rover-sets-record.html',
      tooltip: 'Read NASA Perseverance rover Mars driving record dispatch'
    },
    {
      phrase: 'Martian gravel',
      keywords: ['mars', 'perseverance', 'rover'],
      fallbackUrl: 'https://www.nytimes.com/2026/10/12/science/mars-rover-sets-record.html',
      tooltip: 'Read NASA Perseverance rover Mars driving record'
    },
    {
      phrase: 'lonely rover',
      keywords: ['mars', 'perseverance', 'rover'],
      fallbackUrl: 'https://www.nytimes.com/2026/10/12/science/mars-rover-sets-record.html',
      tooltip: 'Read NASA Perseverance rover Mars record'
    },
    {
      phrase: 'early release',
      keywords: ['prisoners', 'early release', 'overcrowding'],
      fallbackUrl: 'https://news.sky.com/story/hundreds-more-prisoners-to-be-freed-as-stage-two-of-early-release-scheme-begins-13598700',
      tooltip: 'Read Sky News coverage on early prisoner release scheme'
    },
    {
      phrase: 'gas exposure',
      keywords: ['nhs staff', 'gas exposure', 'landmark payout'],
      fallbackUrl: 'https://www.bbc.co.uk/news/articles/c54g1071n0ygo',
      tooltip: 'Read BBC coverage on NHS staff landmark payout'
    }
  ];

  // Dynamically add mappings from active story clusters (what multiple desks are covering today)
  const clusters = state.sharedStoryClusters || [];
  clusters.forEach(c => {
    const mainArt = c.coverage?.[0] || {};
    const clusterUrl = mainArt.link || '';
    if (!clusterUrl) return;

    const tLower = (c.story || '').toLowerCase();
    const cTitle = (c.story || '').replace(/"/g, '&quot;');
    const tooltip = `Read report: ${cTitle} (${c.coverage.length} news desks)`;

    if (tLower.includes('pope') || tLower.includes('papal')) {
      phraseMappings.push({ phrase: 'papal health scares', fallbackUrl: clusterUrl, tooltip });
      phraseMappings.push({ phrase: 'papal health', fallbackUrl: clusterUrl, tooltip });
    }
    if (tLower.includes('oil') || tLower.includes('aramco') || tLower.includes('houthi')) {
      phraseMappings.push({ phrase: 'smoking oil infrastructure', fallbackUrl: clusterUrl, tooltip });
      phraseMappings.push({ phrase: 'oil infrastructure', fallbackUrl: clusterUrl, tooltip });
    }
    if (tLower.includes('satellite') || tLower.includes('starlink') || tLower.includes('musk')) {
      phraseMappings.push({ phrase: 'frontline satellites', fallbackUrl: clusterUrl, tooltip });
      phraseMappings.push({ phrase: 'rationing frontline satellites', fallbackUrl: clusterUrl, tooltip });
    }
    if (tLower.includes('ship') || tLower.includes('wreck') || tLower.includes('ancient')) {
      phraseMappings.push({ phrase: 'sunken ancient ship', fallbackUrl: clusterUrl, tooltip });
      phraseMappings.push({ phrase: 'ancient ship', fallbackUrl: clusterUrl, tooltip });
    }
    if (tLower.includes('greenland')) {
      phraseMappings.push({ phrase: 'greenland', fallbackUrl: clusterUrl, tooltip });
    }
    if (tLower.includes('bank of america') || tLower.includes('bofa')) {
      phraseMappings.push({ phrase: 'bank of america', fallbackUrl: clusterUrl, tooltip });
    }
    if (tLower.includes('six flags') || tLower.includes('roller coaster')) {
      phraseMappings.push({ phrase: 'roller coasters', fallbackUrl: clusterUrl, tooltip });
    }
  });

  // 1. Identify pre-existing markdown links: [label](url)
  const matches = [];
  const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdRegex.exec(rawSummary)) !== null) {
    matches.push({
      start: mdMatch.index,
      end: mdMatch.index + mdMatch[0].length,
      label: mdMatch[1],
      url: mdMatch[2],
      title: 'Read original news dispatch'
    });
  }

  // 2. Identify phrase matches in plain text, ensuring no collision with existing matches
  phraseMappings.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const item of phraseMappings) {
    const pRegex = new RegExp(item.phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    let m;
    while ((m = pRegex.exec(rawSummary)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const collides = matches.some(x => (start < x.end && end > x.start));
      if (!collides) {
        let targetUrl = item.fallbackUrl;
        let targetTitle = item.tooltip;
        if (articles && articles.length > 0) {
          const found = articles.find(art => {
            const t = ((art.title || '') + ' ' + (art.desc || '')).toLowerCase();
            return item.keywords.some(k => t.includes(k.toLowerCase()));
          });
          if (found && found.url) {
            targetUrl = found.url;
            targetTitle = (found.title || item.tooltip) + (found.sourceName ? ` (${found.sourceName})` : '');
          }
        }
        matches.push({
          start,
          end,
          label: m[0],
          url: targetUrl,
          title: targetTitle
        });
      }
    }
  }

  // 3. Assemble final HTML in a single slice pass to guarantee zero attribute contamination
  matches.sort((a, b) => a.start - b.start);
  let result = '';
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      result += rawSummary.slice(cursor, m.start);
    }
    const safeTitle = (m.title || '').replace(/"/g, '&quot;').replace(/<[^>]+>/g, '');
    result += `<a href="${m.url}" target="_blank" rel="noopener noreferrer" class="summary-story-link" title="${safeTitle}">${m.label} <i data-lucide="external-link"></i></a>`;
    cursor = m.end;
  }
  if (cursor < rawSummary.length) {
    result += rawSummary.slice(cursor);
  }

  return result;
}

// --- DAILY VIBE PULSE HERO RENDERER ---
function renderDailyPulse() {
  const sources = resolvedSources || getResolvedSources();
  if (!sources || Object.keys(sources).length === 0) return;

  let totalScore = 0;
  let totalArticles = 0;
  const outletList = [];
  const catStats = {};

  Object.entries(sources).forEach(([id, data]) => {
    let arts = data.articles || [];
    if (state.filters.category !== 'all') {
      arts = arts.filter(a => (a.category || 'other') === state.filters.category);
    }
    const scoredArts = arts.filter(a => typeof a.sentiment === 'number');
    const avgScore = scoredArts.length > 0 
      ? (scoredArts.reduce((acc, a) => acc + a.sentiment, 0) / scoredArts.length) 
      : null;
    outletList.push({ id, name: data.name, score: avgScore });

    (data.articles || []).forEach(art => {
      if (state.filters.category === 'all' || (art.category || 'other') === state.filters.category) {
        totalArticles++;
        const s = typeof art.sentiment === 'number' ? art.sentiment : 0;
        totalScore += s;
      }
      const cat = art.category || 'other';
      if (!catStats[cat]) catStats[cat] = { total: 0, count: 0 };
      catStats[cat].total += typeof art.sentiment === 'number' ? art.sentiment : 0;
      catStats[cat].count++;
    });
  });

  const globalAvg = totalArticles > 0 ? Number((totalScore / totalArticles).toFixed(2)) : 0;
  
  // Sort outlets by average sentiment (ignoring nulls)
  const validOutlets = outletList.filter(o => typeof o.score === 'number' && !isNaN(o.score));
  validOutlets.sort((a, b) => a.score - b.score);
  const mostAlarmist = validOutlets[0] || { name: 'N/A', score: 0, id: 'all' };
  const mostUplifting = validOutlets[validOutlets.length - 1] || { name: 'N/A', score: 0, id: 'all' };

  // Calculate Biggest Outlet Clash on the same topic
  const categoriesToCheck = ['world', 'politics', 'business', 'technology', 'science', 'health', 'climate'];
  let maxClash = {
    cat: null,
    catName: '',
    outletA: null,
    outletB: null,
    divergence: 0
  };

  categoriesToCheck.forEach(cat => {
    const outletAvgs = [];
    Object.entries(sources).forEach(([id, data]) => {
      const catArts = (data.articles || []).filter(a => (a.category || 'other') === cat && typeof a.sentiment === 'number');
      if (catArts.length >= 1) {
        const avg = catArts.reduce((sum, a) => sum + a.sentiment, 0) / catArts.length;
        outletAvgs.push({ id, name: data.name, avg });
      }
    });

    if (outletAvgs.length >= 2) {
      outletAvgs.sort((a, b) => a.avg - b.avg);
      const lowest = outletAvgs[0];
      const highest = outletAvgs[outletAvgs.length - 1];
      const divergence = highest.avg - lowest.avg;
      if (divergence > maxClash.divergence) {
        maxClash = {
          cat,
          catName: cat.charAt(0).toUpperCase() + cat.slice(1),
          outletA: lowest,
          outletB: highest,
          divergence: Number(divergence.toFixed(2))
        };
      }
    }
  });

  // Update Dynamic Timeframe & Category Headings
  const headingEl = document.getElementById('pulse-timeframe-heading');
  const badgeTimeEl = document.getElementById('pulse-timeframe-badge');
  const countEl = document.getElementById('pulse-article-count');

  let timeframeLabel = 'Past 24 Hours';
  if (state.filters.time === '3h') timeframeLabel = 'Past 3 Hours';
  else if (state.filters.time === '6h') timeframeLabel = 'Past 6 Hours';
  else if (state.filters.time === '12h') timeframeLabel = 'Past 12 Hours';
  else if (state.filters.time === '24h') timeframeLabel = 'Past 24 Hours';
  else if (state.filters.time === '3d') timeframeLabel = 'Past 3 Days';
  else if (state.filters.time === '7d') timeframeLabel = 'Past 7 Days';
  else if (state.filters.time === '30d') timeframeLabel = 'Past 30 Days';
  else if (state.filters.time === 'all') timeframeLabel = 'All-Time';

  if (headingEl) {
    if (state.edition === 'silver') {
      headingEl.innerText = "Today's Constructive News Signal:";
    } else if (state.filters.category !== 'all') {
      const catCap = state.filters.category.charAt(0).toUpperCase() + state.filters.category.slice(1);
      headingEl.innerText = `${catCap} News Vibe:`;
    } else if (state.filters.time === '24h') {
      headingEl.innerText = "Today's Global News Vibe:";
    } else {
      headingEl.innerText = `${timeframeLabel} News Vibe:`;
    }
  }

  if (badgeTimeEl) {
    badgeTimeEl.innerText = timeframeLabel;
  }

  if (countEl) {
    const scopeLabel = state.filters.category !== 'all' 
      ? (state.filters.category.charAt(0).toUpperCase() + state.filters.category.slice(1) + ' ') 
      : '';
    countEl.innerText = `${totalArticles.toLocaleString()} ${scopeLabel}Headlines Analyzed`;
  }

  // Update Global Score
  const scoreEl = document.getElementById('global-mood-score');
  const summaryEl = document.getElementById('daily-editorial-summary');

  if (scoreEl) {
    scoreEl.innerText = (globalAvg > 0 ? '+' : '') + globalAvg.toFixed(2);
    scoreEl.className = 'pulse-hero-score ' + (globalAvg < -0.1 ? 'neg' : (globalAvg > 0.1 ? 'pos' : 'neu'));
  }

  if (summaryEl) {
    const rawSummary = state.editorialSummary || (state.globalStats && state.globalStats.editorialSummary) || "Across the last 24 hours of global news, another banner day for collective dread. Politicians traded fresh hostility, markets flinched on cue, and deep-space science once again stepped up as humanity's designated driver.";

    // Gather active articles for interactive story linking
    const activeArticles = [];
    Object.keys(sources).forEach(id => {
      (sources[id].articles || []).forEach(art => {
        activeArticles.push({
          sourceId: id,
          sourceName: sources[id].name,
          title: art.title || '',
          url: art.link || art.url || '',
          desc: art.description || ''
        });
      });
    });

    summaryEl.innerHTML = linkifyEditorialSummary(rawSummary, activeArticles);
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ root: summaryEl });
    }
  }

  // Update Outlets in Focus & Biggest Clash
  const alarmistNameEl = document.getElementById('pulse-alarmist-name');
  const alarmistScoreEl = document.getElementById('pulse-alarmist-score');
  const upliftingNameEl = document.getElementById('pulse-uplifting-name');
  const upliftingScoreEl = document.getElementById('pulse-uplifting-score');
  const polNameEl = document.getElementById('pulse-polarization-name');
  const polSubEl = document.getElementById('pulse-polarization-sub');
  const polScoreEl = document.getElementById('pulse-polarization-score');

  if (alarmistNameEl && mostAlarmist) alarmistNameEl.innerText = mostAlarmist.name;
  if (alarmistScoreEl && mostAlarmist) alarmistScoreEl.innerText = (mostAlarmist.score > 0 ? '+' : '') + mostAlarmist.score.toFixed(2);
  const alarmistSubEl = document.getElementById('pulse-alarmist-sub');
  if (alarmistSubEl && mostAlarmist) {
    alarmistSubEl.innerText = `Most pessimistic tone today`;
  }

  if (upliftingNameEl && mostUplifting) upliftingNameEl.innerText = mostUplifting.name;
  if (upliftingScoreEl && mostUplifting) upliftingScoreEl.innerText = (mostUplifting.score > 0 ? '+' : '') + mostUplifting.score.toFixed(2);
  const upliftingSubEl = document.getElementById('pulse-uplifting-sub');
  if (upliftingSubEl && mostUplifting) {
    upliftingSubEl.innerText = `Holding relative editorial composure`;
  }
  
  if (polNameEl) {
    polNameEl.innerText = maxClash.outletA && maxClash.outletB 
      ? `${maxClash.outletA.name} vs ${maxClash.outletB.name}` 
      : 'Cross-Outlet Consensus';
  }
  if (polSubEl) {
    polSubEl.innerText = maxClash.catName ? `Topic: ${maxClash.catName}` : 'Across all topics';
  }
  if (polScoreEl) {
    polScoreEl.innerText = maxClash.divergence > 0 ? `${maxClash.divergence.toFixed(2)} Spread` : '0.15 Spread';
  }

  // Interactivity for the 3 Signal Cards
  const alarmistCard = document.getElementById('signal-alarmist-card');
  const upliftingCard = document.getElementById('signal-uplifting-card');
  const polCard = document.getElementById('signal-polarization-card');

  if (alarmistCard && mostAlarmist && mostAlarmist.id !== 'all') {
    alarmistCard.onclick = () => {
      toggleSourceFilter(mostAlarmist.id);
    };
  }
  if (upliftingCard && mostUplifting && mostUplifting.id !== 'all') {
    upliftingCard.onclick = () => {
      toggleSourceFilter(mostUplifting.id);
    };
  }
  if (polCard) {
    polCard.onclick = () => {
      if (maxClash.outletA && maxClash.outletB) {
        if (elements.h2hSourceA) elements.h2hSourceA.value = maxClash.outletA.id;
        if (elements.h2hSourceB) elements.h2hSourceB.value = maxClash.outletB.id;
        if (maxClash.topic) {
          state.h2hTopic = maxClash.topic;
          if (elements.h2hTopicSelect) elements.h2hTopicSelect.value = maxClash.topic;
        }
        switchTab('compare');
        renderHeadToHead();
        const h2h = document.getElementById('h2h-section');
        if (h2h) h2h.scrollIntoView({ behavior: 'smooth' });
      } else {
        switchTab('compare');
      }
    };
  }

  // Topic Vibes Tiles (unboxed 7-column grid with vs prev 24h delta)
  const chipsContainer = document.getElementById('pulse-category-chips');
  if (chipsContainer) {
    const mainCategories = ['world', 'politics', 'business', 'technology', 'science', 'climate', 'health'];
    const catIcons = {
      world: '🌍',
      politics: '🗳️',
      business: '📈',
      technology: '⚡',
      science: '🚀',
      climate: '🌱',
      health: '🏥'
    };

    // Compute previous 24h (24h-48h ago) and older baseline per category for delta comparison
    const nowMs = Date.now();
    const h24Ms = 24 * 60 * 60 * 1000;
    const h48Ms = 48 * 60 * 60 * 1000;
    const prev24Stats = {};
    const olderStats = {};

    Object.values(state.sources || {}).forEach(src => {
      (src.articles || []).forEach(art => {
        const s = typeof art.sentimentGemini === 'number' ? art.sentimentGemini : art.sentiment;
        const exp = art.explanationGemini || art.explanation || '';
        if (typeof s !== 'number' || isNaN(s) || exp.includes('Analyzed locally')) return;
        const cat = art.categoryGemini || art.category || 'other';

        const ageMs = nowMs - new Date(art.pubDate).getTime();
        if (ageMs > h24Ms && ageMs <= h48Ms) {
          if (!prev24Stats[cat]) prev24Stats[cat] = { total: 0, count: 0 };
          prev24Stats[cat].total += s;
          prev24Stats[cat].count++;
        }
        if (ageMs > h24Ms) {
          if (!olderStats[cat]) olderStats[cat] = { total: 0, count: 0 };
          olderStats[cat].total += s;
          olderStats[cat].count++;
        }
      });
    });

    chipsContainer.innerHTML = '';
    mainCategories.forEach(cat => {
      const data = catStats[cat];
      if (data && data.count > 0) {
        const avg = Number((data.total / data.count).toFixed(2));
        const valClass = avg < -0.15 ? 'neg' : (avg > 0.15 ? 'pos' : 'neu');
        const isActive = state.filters.category === cat;

        // Calculate delta vs previous 24h (fallback to older baseline if <2 articles in 24h-48h window)
        const p24 = prev24Stats[cat];
        const old = olderStats[cat];
        const refBucket = (p24 && p24.count >= 2) ? p24 : ((old && old.count >= 1) ? old : p24);
        let deltaHtml = `<span class="beat-chip-delta neu" title="No prior 24h baseline">— vs 24h</span>`;
        if (refBucket && refBucket.count > 0) {
          const prevAvg = refBucket.total / refBucket.count;
          const delta = Number((avg - prevAvg).toFixed(2));
          const deltaSign = delta > 0 ? '+' : '';
          const arrow = delta >= 0.02 ? '▲' : (delta <= -0.02 ? '▼' : '●');
          const deltaClass = delta >= 0.02 ? 'pos' : (delta <= -0.02 ? 'neg' : 'neu');
          deltaHtml = `<span class="beat-chip-delta ${deltaClass}" title="Previous 24h avg: ${prevAvg >= 0 ? '+' : ''}${prevAvg.toFixed(2)}">${arrow} ${deltaSign}${delta.toFixed(2)} <span class="delta-sub">vs 24h</span></span>`;
        }

        const chip = document.createElement('button');
        chip.className = `beat-chip ${isActive ? 'active' : ''}`;
        chip.setAttribute('data-cat', cat);
        chip.setAttribute('title', isActive ? 'Click to clear topic filter' : `Filter entire dashboard to ${cat} news`);
        const labelText = cat === 'climate' ? 'Climate' : (cat.charAt(0).toUpperCase() + cat.slice(1));
        chip.innerHTML = `
          <div class="beat-chip-top">
            <span class="beat-chip-icon">${catIcons[cat] || '📰'}</span>
            <span class="beat-chip-name">${labelText}</span>
          </div>
          <div class="beat-chip-bottom">
            <span class="beat-chip-val ${valClass}">${avg > 0 ? '+' : ''}${avg.toFixed(2)}</span>
            ${deltaHtml}
          </div>
        `;
        chip.onclick = () => {
          if (state.filters.category === cat) {
            state.filters.category = 'all';
          } else {
            state.filters.category = cat;
          }
          if (elements.filterCategory) elements.filterCategory.value = state.filters.category;
          updateTopicPillsActive(state.filters.category);
          updateFilterIndicator();
          updateAppUI();
        };
        chipsContainer.appendChild(chip);
      }
    });
  }

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// --- INTERACTIVE TOPIC HEATMAP RENDERER ---
function renderHeatmapMatrix() {
  const container = document.getElementById('heatmap-grid');
  if (!container) return;

  const sources = resolvedSources || getResolvedSources();
  const sourceIds = Object.keys(sources);
  if (sourceIds.length === 0) return;

  const categories = ['world', 'politics', 'business', 'technology', 'science', 'climate', 'health'];
  const catLabels = {
    world: '🌍 World',
    politics: '🗳️ Politics',
    business: '📈 Business',
    technology: '⚡ Tech',
    science: '🚀 Science',
    climate: '🌱 Climate',
    health: '🏥 Health'
  };

  container.style.gridTemplateColumns = `120px repeat(${sourceIds.length}, minmax(52px, 1fr))`;
  container.innerHTML = '';

  // Top header row: Corner label + Source initials
  const corner = document.createElement('div');
  corner.className = 'heatmap-header-cell';
  corner.innerText = 'TOPIC / OUTLET';
  container.appendChild(corner);

  sourceIds.forEach(id => {
    const meta = SOURCE_META[id] || { initials: id.toUpperCase().slice(0, 3) };
    const h = document.createElement('div');
    h.className = 'heatmap-header-cell';
    h.title = sources[id].name;
    h.innerHTML = `<span style="border-bottom: 2px solid ${meta.color || '#2563eb'}; padding-bottom: 2px;">${meta.initials}</span>`;
    container.appendChild(h);
  });

  // Category rows
  categories.forEach(cat => {
    const label = document.createElement('div');
    label.className = `heatmap-row-label ${state.filters.category === cat ? 'active' : ''}`;
    label.innerText = catLabels[cat] || cat;
    label.style.cursor = 'pointer';
    label.title = `Click to filter entire dashboard to ${cat}`;
    label.onclick = () => {
      state.filters.category = state.filters.category === cat ? 'all' : cat;
      if (elements.filterCategory) elements.filterCategory.value = state.filters.category;
      updateTopicPillsActive(state.filters.category);
      updateFilterIndicator();
      updateAppUI();
    };
    container.appendChild(label);

    sourceIds.forEach(id => {
      const src = sources[id];
      const matchingArticles = (src.articles || []).filter(a => a.category === cat);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

      if (matchingArticles.length === 0) {
        cell.innerText = '—';
        cell.style.background = 'rgba(148, 163, 184, 0.08)';
        cell.style.color = 'var(--text-muted)';
        cell.title = `${src.name}: No articles in ${cat}`;
      } else {
        const sum = matchingArticles.reduce((acc, a) => acc + (typeof a.sentiment === 'number' ? a.sentiment : 0), 0);
        const avg = Number((sum / matchingArticles.length).toFixed(2));
        cell.innerText = (avg > 0 ? '+' : '') + avg.toFixed(2);

        if (avg < -0.15) {
          const intensity = Math.min(1, Math.abs(avg));
          cell.style.background = `rgba(239, 68, 68, ${0.15 + intensity * 0.45})`;
          cell.style.color = '#dc2626';
        } else if (avg > 0.15) {
          const intensity = Math.min(1, avg);
          cell.style.background = `rgba(34, 197, 94, ${0.15 + intensity * 0.45})`;
          cell.style.color = '#16a34a';
        } else {
          cell.style.background = 'rgba(148, 163, 184, 0.18)';
          cell.style.color = 'var(--text-secondary)';
        }

        cell.title = `${src.name} on ${cat.toUpperCase()}: ${avg > 0 ? '+' : ''}${avg} (${matchingArticles.length} stories). Click to filter!`;
        cell.onclick = () => {
          state.filters.source = id;
          state.filters.category = cat;
          if (elements.filterSource) elements.filterSource.value = id;
          if (elements.filterCategory) elements.filterCategory.value = cat;
          updateFilterIndicator();
          updateTopicPillsActive(cat);
          renderHeadlines();
          switchTab('deepdives');
          const target = document.getElementById('deepdive-spotlight-banner') || document.getElementById('deepdive-feed-section');
          target?.scrollIntoView({ behavior: 'smooth' });
        };
      }
      container.appendChild(cell);
    });
  });

  // --- BOTTOM ROW: OVERALL AVERAGE VIBE PER OUTLET ---
  const avgLabel = document.createElement('div');
  avgLabel.className = 'heatmap-row-label avg-row-label';
  avgLabel.innerHTML = '<strong>📊 OVERALL AVG</strong>';
  avgLabel.title = 'Average sentiment across all covered topics';
  container.appendChild(avgLabel);

  sourceIds.forEach(id => {
    const src = sources[id];
    const scored = (src.articles || []).filter(a => typeof a.sentiment === 'number');
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell avg-cell';

    if (scored.length === 0) {
      cell.innerText = '—';
      cell.style.background = 'rgba(148, 163, 184, 0.08)';
      cell.style.color = 'var(--text-muted)';
      cell.title = `${src.name}: No articles analyzed`;
    } else {
      const sum = scored.reduce((acc, a) => acc + a.sentiment, 0);
      const avg = Number((sum / scored.length).toFixed(2));
      cell.innerText = (avg > 0 ? '+' : '') + avg.toFixed(2);
      cell.style.fontWeight = '700';

      if (avg < -0.15) {
        const intensity = Math.min(1, Math.abs(avg));
        cell.style.background = `rgba(239, 68, 68, ${0.2 + intensity * 0.45})`;
        cell.style.color = '#b91c1c';
      } else if (avg > 0.15) {
        const intensity = Math.min(1, avg);
        cell.style.background = `rgba(34, 197, 94, ${0.2 + intensity * 0.45})`;
        cell.style.color = '#15803d';
      } else {
        cell.style.background = 'rgba(148, 163, 184, 0.22)';
        cell.style.color = 'var(--text-primary)';
      }

      cell.title = `${src.name} Overall Average: ${avg > 0 ? '+' : ''}${avg} (${scored.length} total articles). Click to filter stream!`;
      cell.onclick = () => {
        toggleSourceFilter(id);
      };
    }
    container.appendChild(cell);
  });
}

// --- QUICK TOPIC PILLS LOGIC ---
function setupTopicPills() {
  const pills = document.querySelectorAll('.topic-pill-btn');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const topic = pill.dataset.topic;
      state.filters.category = state.filters.category === topic ? 'all' : topic;
      state.headlinesLimit = 20;
      if (elements.filterCategory) elements.filterCategory.value = state.filters.category;
      updateTopicPillsActive(state.filters.category);
      updateFilterIndicator();
      updateAppUI();
    });
  });
}

function updateTopicPillsActive(topic) {
  const pills = document.querySelectorAll('.topic-pill-btn');
  pills.forEach(p => {
    p.classList.toggle('active', p.dataset.topic === topic);
  });

  const beatChips = document.querySelectorAll('.beat-chip');
  beatChips.forEach(chip => {
    const chipCat = chip.getAttribute('data-cat');
    chip.classList.toggle('active', chipCat === topic);
  });
}

// --- URL STATE SYNC (DEEP LINKING) ---
let isRestoringUrlState = false;

function restoreStateFromUrl() {
  try {
    isRestoringUrlState = true;
    const params = new URLSearchParams(window.location.search);
    const hashTab = window.location.hash.replace('#', '');

    const editionParam = params.get('edition');
    const tabParam = params.get('tab') || (['pulse', 'trends', 'compare', 'deepdives', 'methodology'].includes(hashTab) ? hashTab : null);
    const sourceParam = params.get('source') || params.get('outlet');
    const topicParam = params.get('topic') || params.get('category');
    const timeParam = params.get('time');

    if (timeParam && ['3h', '6h', '12h', '24h', '3d', '7d', '30d', 'all'].includes(timeParam)) {
      state.filters.time = timeParam;
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = timeParam;
      if (elements.filterTime) elements.filterTime.value = timeParam;
      if (elements.deepdiveFilterTime) elements.deepdiveFilterTime.value = timeParam;
      if (elements.silverTimeframeSelect) elements.silverTimeframeSelect.value = timeParam;
    }

    if (sourceParam && state.sources && state.sources[sourceParam]) {
      state.filters.source = sourceParam;
      if (elements.filterSource) elements.filterSource.value = sourceParam;
      if (elements.deepdiveFilterSource) elements.deepdiveFilterSource.value = sourceParam;
    }

    if (topicParam && ['world', 'politics', 'business', 'technology', 'science', 'climate', 'health', 'entertainment', 'sports'].includes(topicParam)) {
      state.filters.category = topicParam;
      state.silverTopic = topicParam;
      if (elements.filterCategory) elements.filterCategory.value = topicParam;
      if (elements.deepdiveFilterCategory) elements.deepdiveFilterCategory.value = topicParam;
      if (elements.silverTopicSelect) elements.silverTopicSelect.value = topicParam;
      updateTopicPillsActive(topicParam);
    }

    updateFilterIndicator();

    if (editionParam === 'good' || editionParam === 'silver') {
      switchEdition('silver');
    } else if (tabParam && ['pulse', 'trends', 'compare', 'deepdives', 'methodology'].includes(tabParam)) {
      switchTab(tabParam);
    }
  } catch (e) {
    console.warn('Could not restore URL state:', e);
  } finally {
    isRestoringUrlState = false;
  }
}

function syncUrlState() {
  if (isRestoringUrlState || !window.history || !window.history.replaceState) return;
  try {
    const params = new URLSearchParams();
    if (state.edition === 'silver') {
      params.set('edition', 'good');
      if (state.silverTopic && state.silverTopic !== 'all') params.set('topic', state.silverTopic);
    } else {
      if (state.activeTab && state.activeTab !== 'pulse') params.set('tab', state.activeTab);
      if (state.filters.source && state.filters.source !== 'all') params.set('outlet', state.filters.source);
      if (state.filters.category && state.filters.category !== 'all') params.set('topic', state.filters.category);
    }
    if (state.filters.time && state.filters.time !== '24h') {
      params.set('time', state.filters.time);
    }

    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '');
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', newUrl);
    }
  } catch (_) {}
}

// --- SHARE POPOVER & HIGH-DPI DAILY VIBE CARD SNAPSHOT ---
window.toggleSharePopover = function(event) {
  if (event) event.stopPropagation();
  const pop = document.getElementById('share-vibe-popover');
  if (!pop) return;

  const isHidden = pop.classList.contains('hidden');
  if (!isHidden) {
    pop.classList.add('hidden');
    return;
  }

  pop.classList.remove('hidden');
  if (event && event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect();
    const popWidth = 285;
    let left = rect.right - popWidth;
    if (left < 12) left = 12;
    if (left + popWidth > window.innerWidth - 12) left = window.innerWidth - popWidth - 12;
    let top = rect.bottom + 8;
    if (top + 180 > window.innerHeight) {
      top = Math.max(12, rect.top - 175);
    }
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }
  if (window.lucide && lucide.createIcons) lucide.createIcons({ root: pop });
};

window.closeSharePopover = function() {
  const pop = document.getElementById('share-vibe-popover');
  if (pop) pop.classList.add('hidden');
};

document.addEventListener('click', (e) => {
  const pop = document.getElementById('share-vibe-popover');
  if (!pop || pop.classList.contains('hidden')) return;
  if (!pop.contains(e.target) && !e.target.closest('.share-vibe-btn')) {
    pop.classList.add('hidden');
  }
});

function showShareToast(msg) {
  const toast = document.getElementById('share-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('visible');
  clearTimeout(window._shareToastTimer);
  window._shareToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.classList.add('hidden'), 250);
  }, 2600);
}

window.handleShareSummaryAndLink = async function() {
  closeSharePopover();
  syncUrlState();
  const shareUrl = window.location.href;
  const isSilver = state.edition === 'silver';

  const scoreText = document.getElementById('global-mood-score')?.innerText || '-0.25';
  const countText = document.getElementById('pulse-article-count')?.innerText || '';
  const rawLead = (document.getElementById('daily-editorial-summary')?.innerText || '').trim();
  const alarmistName = document.getElementById('pulse-alarmist-name')?.innerText || '';
  const alarmistScore = document.getElementById('pulse-alarmist-score')?.innerText || '';
  const upliftingName = document.getElementById('pulse-uplifting-name')?.innerText || '';
  const upliftingScore = document.getElementById('pulse-uplifting-score')?.innerText || '';

  let summaryText = '';
  if (isSilver) {
    summaryText = `☀️ Some Good News — Rescued Constructive Breakthroughs\nSifting verified human, scientific & ecological progress from global newsrooms.\n\n🔗 ${shareUrl}`;
  } else {
    summaryText = `🌍 No Good News — Daily Global Media Vibe: ${scoreText} (${countText})\n\n"${rawLead}"\n\n📉 Most Alarmist: ${alarmistName} (${alarmistScore}) | 📈 Most Composed: ${upliftingName} (${upliftingScore})\n🔗 ${shareUrl}`;
  }

  // Use native mobile Web Share API on touch devices if available
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && window.innerWidth <= 820;
  if (isMobileDevice && navigator.share) {
    try {
      await navigator.share({
        title: isSilver ? 'Some Good News | Global News Audit' : `No Good News | Global News Vibe: ${scoreText}`,
        text: summaryText,
        url: shareUrl
      });
      return;
    } catch (_) {}
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(summaryText);
    showShareToast('Copied briefing & deep link to clipboard!');
  }
};

// Helper to draw rounded rectangle on Canvas
function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Helper to word-wrap text on Canvas
function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const words = (text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const test = current ? `${current} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines - 1) {
        const rest = words.slice(i).join(' ');
        let lastLine = rest;
        while (ctx.measureText(lastLine + '…').width > maxWidth && lastLine.length > 0) {
          lastLine = lastLine.slice(0, -1).trim();
        }
        lines.push(lastLine + (lastLine.length < rest.length ? '…' : ''));
        return lines;
      }
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

window.handleDownloadVibeCard = function() {
  closeSharePopover();
  showShareToast('Generating high-DPI Daily Vibe Card...');

  const canvas = document.createElement('canvas');
  const W = 1200;
  const H = 630;
  canvas.width = W * 2; // 2x Retina DPI (2400x1260)
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const isSilver = state.edition === 'silver';
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  if (isSilver) {
    bgGrad.addColorStop(0, '#fffbeb');
    bgGrad.addColorStop(1, '#fef3c7');
  } else {
    bgGrad.addColorStop(0, '#0b0f17');
    bgGrad.addColorStop(1, '#131b2e');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle outer frame border
  drawRoundRect(ctx, 24, 24, W - 48, H - 48, 22);
  ctx.fillStyle = isSilver ? 'rgba(255, 255, 255, 0.88)' : 'rgba(20, 27, 45, 0.88)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isSilver ? 'rgba(245, 158, 11, 0.35)' : 'rgba(99, 102, 241, 0.32)';
  ctx.stroke();

  // Top Pill Badge & Date
  drawRoundRect(ctx, 56, 54, isSilver ? 260 : 290, 34, 17);
  ctx.fillStyle = isSilver ? 'rgba(245, 158, 11, 0.16)' : 'rgba(99, 102, 241, 0.18)';
  ctx.fill();
  ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = isSilver ? '#b45309' : '#818cf8';
  ctx.fillText(isSilver ? '☀️ SOME GOOD NEWS • DAILY AUDIT' : '🌍 NO GOOD NEWS • PESSIMISM AUDIT', 74, 76);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const countStr = document.getElementById('pulse-article-count')?.innerText || 'Global RSS Audit';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillStyle = isSilver ? '#64748b' : '#94a3b8';
  const metaRight = `${dateStr} • ${countStr}`;
  ctx.fillText(metaRight, W - 56 - ctx.measureText(metaRight).width, 76);

  // Main Title & Score Badge
  const scoreText = document.getElementById('global-mood-score')?.innerText || '-0.25';
  const headingText = isSilver ? "Today's Constructive News Signal" : (document.getElementById('pulse-timeframe-heading')?.innerText || "Today's Global News Vibe:");
  ctx.font = '800 36px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = isSilver ? '#0f172a' : '#f8fafc';
  ctx.fillText(headingText, 56, 138);

  const headWidth = ctx.measureText(headingText).width;
  const scoreVal = parseFloat(scoreText) || -0.25;
  const isNeg = !isSilver && scoreVal < -0.1;
  drawRoundRect(ctx, 56 + headWidth + 18, 102, 116, 46, 12);
  ctx.fillStyle = isNeg ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.18)';
  ctx.fill();
  ctx.strokeStyle = isNeg ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '700 26px "JetBrains Mono", monospace';
  ctx.fillStyle = isNeg ? '#f87171' : '#10b981';
  const sText = isSilver ? 'POSITIVE' : scoreText;
  if (isSilver) ctx.font = '700 17px "JetBrains Mono", monospace';
  const sw = ctx.measureText(sText).width;
  ctx.fillText(sText, 56 + headWidth + 18 + (116 - sw) / 2, isSilver ? 131 : 134);

  // Editorial Lead Summary
  const rawLead = (document.getElementById('daily-editorial-summary')?.innerText || '').replace(/\s+/g, ' ').trim();
  ctx.font = '500 22px Georgia, "Newsreader", serif';
  ctx.fillStyle = isSilver ? '#334155' : '#cbd5e1';
  const lines = wrapCanvasText(ctx, rawLead, W - 112, 4);
  lines.forEach((line, idx) => {
    ctx.fillText(line, 56, 195 + idx * 34);
  });

  // Topic Vibes Row (7 Square Tiles)
  const chipEls = Array.from(document.querySelectorAll('#pulse-category-chips .beat-chip'));
  if (chipEls.length > 0) {
    const gap = 12;
    const totalW = W - 112;
    const tileW = (totalW - gap * (chipEls.length - 1)) / chipEls.length;
    const tileY = 348;
    const tileH = 82;

    chipEls.forEach((el, idx) => {
      const tx = 56 + idx * (tileW + gap);
      drawRoundRect(ctx, tx, tileY, tileW, tileH, 10);
      ctx.fillStyle = isSilver ? '#ffffff' : 'rgba(30, 41, 59, 0.78)';
      ctx.fill();
      ctx.strokeStyle = isSilver ? 'rgba(203, 213, 225, 0.8)' : 'rgba(51, 65, 85, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const name = el.querySelector('.beat-chip-name')?.innerText || '';
      const icon = el.querySelector('.beat-chip-icon')?.innerText || '';
      const val = el.querySelector('.beat-chip-val')?.innerText || '';
      const delta = el.querySelector('.beat-chip-delta')?.innerText || '';

      ctx.font = '700 14px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillStyle = isSilver ? '#1e293b' : '#f1f5f9';
      ctx.fillText(`${icon} ${name}`, tx + 12, tileY + 28);

      const vNum = parseFloat(val) || 0;
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillStyle = vNum < -0.15 ? '#f87171' : (vNum > 0.15 ? '#34d399' : '#94a3b8');
      ctx.fillText(val, tx + 12, tileY + 58);

      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = isSilver ? '#64748b' : '#94a3b8';
      ctx.fillText(delta.replace(' vs 24h', ''), tx + 68, tileY + 57);
    });
  }

  // Bottom Signal Strip (Most Alarmist | Most Composed | Biggest Clash)
  const sigY = 456;
  const sigH = 88;
  const sigW = (W - 112 - 28) / 3;
  const signals = [
    {
      label: 'MOST ALARMIST OUTLET',
      name: document.getElementById('pulse-alarmist-name')?.innerText || 'N/A',
      score: document.getElementById('pulse-alarmist-score')?.innerText || '',
      color: '#f87171'
    },
    {
      label: 'MOST COMPOSED OUTLET',
      name: document.getElementById('pulse-uplifting-name')?.innerText || 'N/A',
      score: document.getElementById('pulse-uplifting-score')?.innerText || '',
      color: '#34d399'
    },
    {
      label: 'BIGGEST FRAMING CLASH',
      name: document.getElementById('pulse-polarization-name')?.innerText || 'Cross-Outlet',
      score: document.getElementById('pulse-polarization-score')?.innerText || '',
      color: '#fbbf24'
    }
  ];

  signals.forEach((sig, i) => {
    const sx = 56 + i * (sigW + 14);
    drawRoundRect(ctx, sx, sigY, sigW, sigH, 12);
    ctx.fillStyle = isSilver ? '#ffffff' : 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.strokeStyle = isSilver ? 'rgba(203, 213, 225, 0.9)' : 'rgba(51, 65, 85, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = isSilver ? '#64748b' : '#94a3b8';
    ctx.fillText(sig.label, sx + 16, sigY + 28);

    ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = isSilver ? '#0f172a' : '#f8fafc';
    let displayName = sig.name;
    while (ctx.measureText(displayName).width > sigW - 110 && displayName.length > 5) {
      displayName = displayName.slice(0, -1).trim() + '…';
    }
    ctx.fillText(displayName, sx + 16, sigY + 60);

    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillStyle = sig.color;
    const scW = ctx.measureText(sig.score).width;
    ctx.fillText(sig.score, sx + sigW - 16 - scW, sigY + 60);
  });

  // Footer Watermark
  ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = isSilver ? '#64748b' : '#64748b';
  ctx.fillText('Autonomous Global News Sentiment Audit • Powered by Gemini AI', 56, 582);

  const urlLabel = window.location.host ? `${window.location.host}${window.location.pathname}` : 'caiolaborda.github.io/vibe-o-meter';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillStyle = isSilver ? '#b45309' : '#818cf8';
  ctx.fillText(urlLabel, W - 56 - ctx.measureText(urlLabel).width, 582);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const daySlug = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `daily-vibe-audit-${daySlug}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showShareToast('Downloaded Daily Vibe Card PNG!');
  }, 'image/png');
};



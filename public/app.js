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
  edition: 'doom' // 'doom' (No Good News) or 'silver' (Some Good News)
};

let resolvedSources = {};

// News Source Metadata with Origin Region and Visual Colors
const SOURCE_META = {
  bbc: { initials: 'BBC', color: '#ff3f3f', region: 'UK', regionName: 'United Kingdom', flag: '🇬🇧' },
  nyt: { initials: 'NYT', color: '#1e293b', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  cnn: { initials: 'CNN', color: '#cc0000', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  guardian: { initials: 'GD', color: '#005689', region: 'UK', regionName: 'United Kingdom', flag: '🇬🇧' },
  fox: { initials: 'FOX', color: '#003366', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  aljazeera: { initials: 'AJ', color: '#ff9900', region: 'ME', regionName: 'Middle East', flag: '🇶🇦' },
  npr: { initials: 'NPR', color: '#3c78d8', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  cnbc: { initials: 'CNB', color: '#0077b6', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  skynews: { initials: 'SKY', color: '#f22613', region: 'UK', regionName: 'United Kingdom', flag: '🇬🇧' },
  spiegel: { initials: 'SPG', color: '#e62a15', region: 'EU', regionName: 'Europe', flag: '🇩🇪' },
  reuters: { initials: 'RTR', color: '#ff8000', region: 'GLOBAL', regionName: 'Global Wire', flag: '🌐' },
  ap: { initials: 'AP', color: '#ff0055', region: 'GLOBAL', regionName: 'Global Wire', flag: '🌐' },
  bloomberg: { initials: 'BBG', color: '#1d4ed8', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  dw: { initials: 'DW', color: '#002b49', region: 'EU', regionName: 'Europe', flag: '🇩🇪' },
  wsj: { initials: 'WSJ', color: '#0274b6', region: 'US', regionName: 'United States', flag: '🇺🇸' },
  france24: { initials: 'F24', color: '#009fe3', region: 'EU', regionName: 'Europe', flag: '🇫🇷' },
  politico: { initials: 'POL', color: '#e83e8c', region: 'US', regionName: 'United States', flag: '🇺🇸' }
};

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
  
  // Model View Toggle (optional)
  modeGeminiBtn: document.getElementById('mode-gemini-btn'),
  modeVaderBtn: document.getElementById('mode-vader-btn'),
  modeGlobalBtn: document.getElementById('mode-global-btn'),
  spotlightBanner: document.getElementById('spotlight-banner'),
  deepdiveSpotlightBanner: document.getElementById('deepdive-spotlight-banner'),
  deepdiveFilterIndicator: document.getElementById('deepdive-filter-indicator'),
  deepdiveFilterName: document.getElementById('deepdive-filter-name'),
  deepdiveClearFilterBtn: document.getElementById('deepdive-clear-filter-btn'),
  
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
  if (['pulse', 'trends', 'deepdives', 'feed', 'methodology'].includes(initialHash)) {
    switchTab(initialHash === 'feed' ? 'pulse' : initialHash);
  }

  // Handle browser back / forward navigation
  window.addEventListener('hashchange', () => {
    const currentHash = window.location.hash.replace('#', '');
    if (['pulse', 'trends', 'deepdives', 'feed', 'methodology'].includes(currentHash) && state.activeTab !== currentHash) {
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
      updateFilterIndicator();
      renderHeadlines();
    });
  }
  if (elements.filterCategory) {
    elements.filterCategory.addEventListener('change', (e) => {
      state.filters.category = e.target.value;
      updateTopicPillsActive(e.target.value);
      updateFilterIndicator();
      updateAppUI();
    });
  }
  if (elements.filterVibe) {
    elements.filterVibe.addEventListener('change', (e) => {
      state.filters.vibe = e.target.value;
      renderHeadlines();
    });
  }
  
  if (elements.filterTime) {
    elements.filterTime.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      if (elements.quickTimeframeSelect) elements.quickTimeframeSelect.value = e.target.value;
      state.timelineRange = e.target.value === 'all' ? 'all' : (e.target.value === '7d' ? 'recent' : 'custom');
      updateTimelineButtonsUI();
      updateAppUI();
    });
  }

  if (elements.quickTimeframeSelect) {
    elements.quickTimeframeSelect.addEventListener('change', (e) => {
      state.filters.time = e.target.value;
      if (elements.filterTime) elements.filterTime.value = e.target.value;
      state.timelineRange = e.target.value === 'all' ? 'all' : (e.target.value === '7d' ? 'recent' : 'custom');
      updateTimelineButtonsUI();
      updateAppUI();
    });
  }

  if (elements.quickSourceClearBtn) {
    elements.quickSourceClearBtn.addEventListener('click', () => {
      state.filters.source = 'all';
      if (elements.filterSource) elements.filterSource.value = 'all';
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
      if (elements.filterCategory) elements.filterCategory.value = 'all';
      updateTopicPillsActive('all');
      updateFilterIndicator();
      updateAppUI();
    });
  }

  if (elements.deepdiveClearFilterBtn) {
    elements.deepdiveClearFilterBtn.addEventListener('click', () => {
      state.filters.source = 'all';
      if (elements.filterSource) elements.filterSource.value = 'all';
      document.querySelectorAll('.source-card').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.outlet-marker').forEach(m => m.classList.remove('active'));
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
      state.edition = 'doom';
      editionDoom.classList.add('active');
      editionSilver.classList.remove('active');
      document.body.classList.remove('silver-lining-edition');
      state.filters.vibe = 'all';
      if (elements.filterVibe) elements.filterVibe.value = 'all';
      const brandP = document.querySelector('.brand-text p');
      if (brandP) brandP.innerText = "There's no such thing as good news — An autonomous daily audit of global media pessimism";
      updateFilterIndicator();
      updateAppUI();
    });

    editionSilver.addEventListener('click', () => {
      state.edition = 'silver';
      editionSilver.classList.add('active');
      editionDoom.classList.remove('active');
      document.body.classList.add('silver-lining-edition');
      state.filters.vibe = 'positive';
      if (elements.filterVibe) elements.filterVibe.value = 'positive';
      const brandP = document.querySelector('.brand-text p');
      if (brandP) brandP.innerText = "Some Good News Edition — Extracting constructive breakthroughs, optimism & solutions from the wire";
      updateFilterIndicator();
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
      renderComparisonMatrix();
    });
  }
  
  // Search input
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value.trim();
      elements.clearSearchBtn.style.display = state.filters.search ? 'block' : 'none';
      renderHeadlines();
    });
  }
  
  if (elements.clearSearchBtn) {
    elements.clearSearchBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.filters.search = '';
      elements.clearSearchBtn.style.display = 'none';
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
      
      if (elements.filterSource) elements.filterSource.value = 'all';
      if (elements.filterCategory) elements.filterCategory.value = 'all';
      if (elements.filterVibe) elements.filterVibe.value = 'all';
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
  
  // Sort Buttons
  elements.sortDateBtn.addEventListener('click', () => {
    toggleSort('date');
  });
  
  elements.sortVibeBtn.addEventListener('click', () => {
    toggleSort('vibe');
  });
  
  // Head-to-Head selection change
  elements.h2hSourceA.addEventListener('change', renderHeadToHead);
  elements.h2hSourceB.addEventListener('change', renderHeadToHead);

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
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = `Synced: ${dateStr}`;
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
  if (!['pulse', 'trends', 'deepdives', 'methodology'].includes(tabId)) {
    tabId = 'pulse';
  }
  state.activeTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.nav-pill-btn[data-tab]').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
  });

  // Update tab panels
  const panels = {
    pulse: document.getElementById('tab-panel-pulse'),
    trends: document.getElementById('tab-panel-trends'),
    deepdives: document.getElementById('tab-panel-deepdives'),
    methodology: document.getElementById('tab-panel-methodology')
  };

  Object.entries(panels).forEach(([id, panel]) => {
    if (panel) {
      if (id === tabId) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    }
  });

  // Toggle hero landing section visibility (only displayed on Daily Pulse, hidden on other tabs)
  const heroSection = document.getElementById('pulse-section');
  if (heroSection) {
    if (tabId === 'pulse') {
      heroSection.classList.remove('hidden');
      heroSection.style.display = 'block';
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
    renderSentimentTimeline();
    renderHeatmapMatrix();
  } else if (tabId === 'deepdives') {
    renderComparisonMatrix();
    renderHeadToHead();
    renderHeadlines();
  } else if (tabId === 'pulse') {
    renderDailyPulse();
    renderSpectrum();
    renderHeadlines();
  }

  // Update hash without jumping page scroll
  if (history.replaceState) {
    history.replaceState(null, null, '#' + tabId);
  }
}
window.switchTab = switchTab;

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

      // Resolve active values based on toggle mode
      let score = 0;
      let explanation = 'No reasoning available.';
      let category = art.categoryLocal || art.category || 'other';
      
      if (state.sentimentMode === 'afinn') {
        score = art.sentimentAFINN !== undefined && art.sentimentAFINN !== null 
          ? art.sentimentAFINN 
          : (art.sentiment || 0);
        explanation = `Analyzed locally using AFINN-111 vocabulary model. Normalized score: ${score.toFixed(2)}.`;
      } else if (state.sentimentMode === 'vader') {
        score = art.sentimentVADER !== undefined && art.sentimentVADER !== null 
          ? art.sentimentVADER 
          : (art.sentiment || 0);
        explanation = `Analyzed locally using VADER social intensity compound score. Raw compound score: ${score.toFixed(2)}.`;
      } else if (state.sentimentMode === 'local') {
        score = art.sentimentLocal !== undefined && art.sentimentLocal !== null 
          ? art.sentimentLocal 
          : (art.sentiment || 0);
        explanation = art.explanationLocal || art.explanation || 'Analyzed locally using averaged VADER and AFINN-111.';
      } else if (state.sentimentMode === 'gemini') {
        const hasGemini = typeof art.sentimentGemini === 'number' && (!art.explanationGemini || !art.explanationGemini.includes('locally'));
        if (hasGemini) {
          score = art.sentimentGemini;
          explanation = art.explanationGemini || `Analyzed using Google Gemini. Score: ${score.toFixed(2)}.`;
          category = art.categoryGemini || category;
        } else {
          score = null;
          explanation = 'Pending evaluation by Gemini AI (queued for subsequent sync cycle).';
          category = art.categoryGemini || category || 'other';
        }
      } else if (state.sentimentMode === 'openrouter') {
        if (art.sentimentOpenRouter !== undefined && art.sentimentOpenRouter !== null) {
          score = art.sentimentOpenRouter;
          explanation = art.explanationOpenRouter || `Analyzed using OpenRouter (${art.openRouterModelUsed || 'Llama'}). Score: ${score.toFixed(2)}.`;
          category = art.categoryOpenRouter || category;
        } else {
          score = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentLocal || 0);
          explanation = art.explanation || art.explanationLocal || 'Fallback local analysis.';
        }
      } else if (state.sentimentMode === 'groq') {
        if (art.sentimentGroq !== undefined && art.sentimentGroq !== null) {
          score = art.sentimentGroq;
          explanation = art.explanationGroq || `Analyzed using Groq (${art.groqModelUsed || 'Llama'}). Score: ${score.toFixed(2)}.`;
          category = art.categoryGroq || category;
        } else {
          score = typeof art.sentiment === 'number' ? art.sentiment : (art.sentimentLocal || 0);
          explanation = art.explanation || art.explanationLocal || 'Fallback local analysis.';
        }
      } else if (state.sentimentMode === 'global') {
        const afinn = art.sentimentAFINN !== undefined && art.sentimentAFINN !== null 
          ? art.sentimentAFINN 
          : (art.sentiment || 0);
        const vader = art.sentimentVADER !== undefined && art.sentimentVADER !== null 
          ? art.sentimentVADER 
          : (art.sentiment || 0);
        const gemini = art.sentimentGemini;
        const openRouter = art.sentimentOpenRouter;
        const groq = art.sentimentGroq;
        
        const scores = [afinn, vader];
        const names = ['VADER', 'AFINN'];
        if (gemini !== undefined && gemini !== null) {
          scores.push(gemini);
          names.push('Gemini');
        }
        if (openRouter !== undefined && openRouter !== null) {
          scores.push(openRouter);
          names.push(`OpenRouter (${art.openRouterModelUsed ? art.openRouterModelUsed.split('/').pop().replace(':free','') : 'Llama'})`);
        }
        if (groq !== undefined && groq !== null) {
          scores.push(groq);
          names.push(`Groq (${art.groqModelUsed ? art.groqModelUsed.replace('llama-','') : 'Llama'})`);
        }
        
        score = Number((scores.reduce((sum, s) => sum + s, 0) / scores.length).toFixed(3));
        explanation = `Global average of ${scores.length} models: ${names.join(', ')}. Calculated score: ${score.toFixed(2)}.`;
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

  // Update control bar texts
  if (state.isSyncing) {
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = state.syncMessage || 'Sync in progress...';
    const dot = document.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot loading';
  } else {
    const dateStr = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : 'Never';
    if (elements.lastUpdatedText) elements.lastUpdatedText.innerText = `Synced: ${dateStr}`;
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
  
  // Setup selectors
  populateFilterOptions();
  
  // Render views
  renderDailyPulse();
  renderHeatmapMatrix();
  renderSpectrum();
  renderComparisonMatrix();
  renderHeadToHead();
  renderHeadlines();
  renderSentimentTimeline();
}

// Populate source options dynamically in drop-down filters
function populateFilterOptions() {
  const sources = Object.keys(state.sources).map(id => ({
    id,
    name: state.sources[id].name
  }));
  
  // Populate filter source dropdown
  elements.filterSource.innerHTML = '<option value="all">All Sources</option>';
  sources.forEach(src => {
    elements.filterSource.innerHTML += `<option value="${src.id}">${src.name}</option>`;
  });
  elements.filterSource.value = state.filters.source;
  
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

    Object.keys(sources).forEach(id => {
      const source = sources[id];
      const data = sourceScores[id];
      if (data.avg === null || data.scoredCount === 0) return;
      
      const avg = data.avg;
      // Stretched normed percentage: 6% to 94%
      const percentage = Math.max(6, Math.min(94, 6 + (((avg - domainMin) / domainSpan) * 88)));
      
      // Collision avoidance across vertical tiers
      let yLevel = 0;
      let collision = true;
      while (collision && yLevel < 3) {
        collision = false;
        for (const pos of markerPositions) {
          if (Math.abs(pos.x - percentage) < 4.5 && pos.y === yLevel) {
            yLevel++;
            collision = true;
            break;
          }
        }
      }

      let finalX = percentage;
      if (yLevel >= 3) {
        yLevel = (markerPositions.length % 2 === 0 ? 0 : 1);
        finalX = percentage + (markerPositions.length % 2 === 0 ? 1.5 : -1.5);
      }
      markerPositions.push({ x: finalX, y: yLevel });
      
      // Absolute valence color calibrated identically to the track gradient
      const markerColor = getValenceColor(avg);

      const meta = SOURCE_META[id] || { initials: id.toUpperCase().slice(0, 3), color: '#333' };
      const yOffset = yLevel * 36;
      
      const marker = document.createElement('div');
      marker.className = `outlet-marker ${state.filters.source === id ? 'active' : ''}`;
      marker.style.left = `${finalX}%`;
      marker.style.bottom = `${yOffset}px`;
      marker.setAttribute('data-id', id);
      
      marker.innerHTML = `
        <div class="marker-bubble" style="background-color: ${meta.color}; color: #fff; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; border: 2.5px solid ${markerColor}; box-shadow: 0 3px 8px rgba(0,0,0,0.18); transition: transform 0.2s;">
          <span>${meta.initials}</span>
        </div>
        <div class="marker-label" style="position: absolute; top: -28px; left: 50%; transform: translateX(-50%); opacity: 0; pointer-events: none; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; box-shadow: var(--card-shadow); white-space: nowrap; color: var(--text-primary); transition: all 0.2s;">
          ${source.name}: <strong style="color:${markerColor};">${avg > 0 ? '+' : ''}${avg.toFixed(2)}</strong> ${isCategoryFiltered ? `(${state.filters.category})` : ''}
        </div>
      `;
      
      marker.addEventListener('click', () => {
        toggleSourceFilter(id);
      });
      
      elements.spectrumMarkers.appendChild(marker);
    });
    
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
        <path d="M 15 45 A 35 35 0 0 1 85 45" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" stroke-linecap="round" />
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
      <path d="M 15 45 A 35 35 0 0 1 85 45" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8" stroke-linecap="round" />
      <!-- Red (negative) sector visual helper -->
      <path d="M 15 45 A 35 35 0 0 1 40 18" fill="none" stroke="rgba(239, 68, 68, 0.15)" stroke-width="8" />
      <!-- Green (positive) sector visual helper -->
      <path d="M 60 18 A 35 35 0 0 1 85 45" fill="none" stroke="rgba(16, 185, 129, 0.15)" stroke-width="8" />
      
      <!-- Needle pointer -->
      <line x1="50" y1="45" x2="50" y2="18" stroke="${themeColor}" stroke-width="3" stroke-linecap="round" transform="rotate(${angle}, 50, 45)" style="transition: transform 0.5s ease;" />
      <circle cx="50" cy="45" r="5" fill="${themeColor}" />
    </svg>
  `;
}

// Generate inline SVG Sparkline showing historic sentiment trends
function createSvgSparkline(articles) {
  if (!articles || articles.length < 2) {
    return `<svg class="sparkline-svg" viewBox="0 0 100 40"><line x1="0" y1="20" x2="100" y2="20" stroke="var(--border-color)" stroke-width="1"/></svg>`;
  }
  
  // Take last 15 articles and reverse them to show chronological order (oldest to newest, left-to-right)
  const count = Math.min(15, articles.length);
  const sample = articles.slice(0, count).reverse();
  
  const width = 120;
  const height = 40;
  
  // Map index and score to svg coordinates
  const points = sample.map((art, idx) => {
    const x = (idx * (width / (count - 1))).toFixed(1);
    // score ranges -1.0 (Y=35) to +1.0 (Y=5). Neutral 0.0 is Y=20.
    const y = (20 - (art.sentiment * 15)).toFixed(1);
    return { x, y };
  });
  
  const linePath = 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
  const areaPath = linePath + ` L ${width} ${height} L 0 ${height} Z`;
  
  // Select color gradient
  const avgSentiment = sample.reduce((sum, a) => sum + a.sentiment, 0) / count;
  let strokeColor = 'var(--neu-color)';
  let gradientId = 'grad-neu';
  if (avgSentiment > 0.1) {
    strokeColor = 'var(--pos-color)';
    gradientId = 'grad-pos';
  } else if (avgSentiment < -0.1) {
    strokeColor = 'var(--neg-color)';
    gradientId = 'grad-neg';
  }
  
  return `
    <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" style="width: 100%; height: 40px;">
      <defs>
        <linearGradient id="grad-pos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--pos-color)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--pos-color)" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="grad-neg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--neg-color)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--neg-color)" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="grad-neu" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--neu-color)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--neu-color)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <!-- Base middle line -->
      <line x1="0" y1="20" x2="${width}" y2="20" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="2,2"/>
      
      <!-- Area fill -->
      <path d="${areaPath}" fill="url(#${gradientId})" />
      <!-- Line stroke -->
      <path d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

// Render News Source Comparison Matrix Cards
function renderComparisonMatrix() {
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

  const showMoreRow = document.getElementById('sources-show-more-row');
  if (showMoreRow) {
    showMoreRow.style.display = sortedIds.length > 6 ? 'block' : 'none';
  }

  if (sortedIds.length === 0) {
    elements.sourcesGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 2.5rem; text-align: center;">
        <i data-lucide="globe-2"></i>
        <span>No news outlets match the selected region filter.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Display top 6 if not expanded, or all if expanded
  const displayIds = state.showAllOutlets ? sortedIds : sortedIds.slice(0, 6);
  
  displayIds.forEach(id => {
    const source = resolvedSources[id];
    const avg = typeof source.averageSentiment === 'number' ? source.averageSentiment : 0;
    const meta = SOURCE_META[id] || { initials: id.slice(0, 3).toUpperCase(), color: '#333', region: 'GLOBAL', regionName: 'Global Wire', flag: '🌐' };
    
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
    
    // Create card element
    const card = document.createElement('div');
    card.className = `source-card card ${state.filters.source === id ? 'active' : ''}`;
    card.setAttribute('data-id', id);
    
    card.innerHTML = `
      <div class="source-card-header">
        <div class="source-meta">
          <div class="source-icon ${id}" style="background-color: ${meta.color}; color: #fff;">${meta.initials}</div>
          <div style="display:flex; flex-direction:column; overflow:hidden;">
            <h3 class="source-name">${source.name}</h3>
            <span class="source-region-tag">${meta.flag} ${meta.regionName}</span>
          </div>
        </div>
        <div class="source-score-container" style="display:flex; flex-direction:column; align-items:flex-end; gap:0.25rem;">
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
          <span>Headline Distribution</span>
          <span>${negPct}% / ${neuPct}% / ${posPct}%</span>
        </div>
        <div class="dist-bar-track">
          <div class="dist-slice neg" style="width: ${negPct}%" title="Negative: ${negPct}%"></div>
          <div class="dist-slice neu" style="width: ${neuPct}%" title="Neutral: ${neuPct}%"></div>
          <div class="dist-slice pos" style="width: ${posPct}%" title="Positive: ${posPct}%"></div>
        </div>
      </div>

      <!-- Sparkline Graph -->
      <div class="sparkline-container">
        <div class="sparkline-label">Vibe Trend (Recent Articles)</div>
        ${createSvgSparkline(source.articles)}
      </div>
      
      <div class="card-footer">
        <span class="text-muted small-text">Sample size: ${source.scoredCount || 0} articles</span>
        <button class="inspect-btn">
          <span>Filter stream</span>
          <i data-lucide="arrow-right" style="width:12px;height:12px;"></i>
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
}

// Render Head-to-Head Comparison column
function renderHeadToHead() {
  const idA = elements.h2hSourceA.value;
  const idB = elements.h2hSourceB.value;
  
  if (!idA || !idB || !resolvedSources[idA] || !resolvedSources[idB]) return;
  
  const sourceA = resolvedSources[idA];
  const sourceB = resolvedSources[idB];
  
  // Set summaries A
  document.querySelector('.source-title-a').innerText = sourceA.name;
  const badgeA = document.querySelector('.score-a');
  badgeA.innerText = `${sourceA.averageSentiment > 0 ? '+' : ''}${sourceA.averageSentiment.toFixed(2)}`;
  badgeA.className = `h2h-score-badge score-a score-badge ${getMoodClass(sourceA.averageSentiment)}`;
  
  // Set summaries B
  document.querySelector('.source-title-b').innerText = sourceB.name;
  const badgeB = document.querySelector('.score-b');
  badgeB.innerText = `${sourceB.averageSentiment > 0 ? '+' : ''}${sourceB.averageSentiment.toFixed(2)}`;
  badgeB.className = `h2h-score-badge score-b score-badge ${getMoodClass(sourceB.averageSentiment)}`;
  
  // Find extremes for A
  setExtremesForColumn(sourceA.articles, 'a');
  // Find extremes for B
  setExtremesForColumn(sourceB.articles, 'b');
}

// Find and inject most positive/negative articles for a source column
function setExtremesForColumn(articles, colSuffix) {
  const negElem = document.getElementById(`h2h-neg-${colSuffix}`);
  const negMetaElem = document.getElementById(`h2h-neg-meta-${colSuffix}`);
  const posElem = document.getElementById(`h2h-pos-${colSuffix}`);
  const posMetaElem = document.getElementById(`h2h-pos-meta-${colSuffix}`);
  
  const scored = (articles || []).filter(a => a.sentiment !== null && a.sentiment !== undefined);
  
  if (scored.length === 0) {
    negElem.innerText = 'No articles analyzed';
    negMetaElem.innerText = '-';
    posElem.innerText = 'No articles analyzed';
    posMetaElem.innerText = '-';
    return;
  }
  
  // Sort copies to find extremes
  const sortedNeg = [...scored].sort((a, b) => a.sentiment - b.sentiment);
  const sortedPos = [...scored].sort((a, b) => b.sentiment - a.sentiment);
  
  const worst = sortedNeg[0];
  const best = sortedPos[0];
  
  // Render worst negative
  negElem.innerHTML = `<a href="${worst.link}" target="_blank" rel="noopener noreferrer">${worst.title}</a>`;
  negMetaElem.innerText = `Sentiment: ${worst.sentiment.toFixed(2)} | Date: ${new Date(worst.pubDate).toLocaleDateString()}`;
  
  // Render best positive
  posElem.innerHTML = `<a href="${best.link}" target="_blank" rel="noopener noreferrer">${best.title}</a>`;
  posMetaElem.innerText = `Sentiment: ${best.sentiment.toFixed(2)} | Date: ${new Date(best.pubDate).toLocaleDateString()}`;
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

  // Filter snapshots by timeframe
  let series = cutoff > 0 ? rawSeries.filter(s => new Date(s.timestamp).getTime() >= cutoff) : [...rawSeries];

  // If fewer than 2 snapshots exist in a tight window, show recent snapshots with a helpful indicator
  let isWindowFallback = false;
  if (series.length < 2 && rawSeries.length >= 2) {
    series = rawSeries.slice(-8);
    isWindowFallback = true;
  }

  // Active source filtering
  const selectedSource = state.filters.source && state.filters.source !== 'all' ? state.filters.source : null;
  const sourceName = selectedSource ? (SOURCE_META[selectedSource]?.name || (state.sources[selectedSource] ? state.sources[selectedSource].name : selectedSource)) : 'Global';

  // Compute sentiment score per snapshot (outlet-specific if filtered, otherwise global cross-outlet average)
  const points = series.map((s, idx) => {
    let score = null;
    if (selectedSource) {
      if (typeof s.averages?.[selectedSource] === 'number') {
        score = s.averages[selectedSource];
      }
    } else {
      const avgs = Object.values(s.averages || {});
      score = avgs.length > 0 ? (avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
    }
    return {
      index: idx,
      timestamp: s.timestamp,
      analyzer: s.analyzer,
      averages: s.averages || {},
      score: score
    };
  }).filter(p => p.score !== null);

  if (countEl) countEl.innerText = `${points.length} Snapshots`;
  if (timeRangeEl) {
    const filterPrefix = selectedSource ? `${sourceName}: ` : '';
    timeRangeEl.innerText = isWindowFallback && cutoff > 0
      ? `${filterPrefix}${timeframeLabel} (Showing ${points.length} recent snapshots)`
      : `${filterPrefix}${timeframeLabel} Trajectory`;
  }

  // SVG dimensions: upgraded to 960 x 320 with generous label paddings
  const width = 960;
  const height = 320;
  const padding = { top: 35, right: 35, bottom: 55, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (points.length < 2) {
    chartSvg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="var(--text-muted)" font-family="var(--font-sans)" font-size="14">Collecting snapshots over time...</text>`;
    return;
  }

  // Dynamic Y-Domain: scale to data but always include 0.00 neutrality baseline
  const scores = points.map(p => p.score);
  const dataMin = Math.min(...scores);
  const dataMax = Math.max(...scores);
  const minY = Math.min(-0.35, Math.floor((dataMin - 0.08) * 10) / 10);
  const maxY = Math.max(0.15, Math.ceil((dataMax + 0.08) * 10) / 10);
  const getY = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;
  const getX = (idx) => padding.left + (idx / Math.max(1, points.length - 1)) * chartW;
  const zeroY = Math.max(padding.top, Math.min(padding.top + chartH, getY(0)));

  // Path data for the curve
  let pathD = `M ${getX(0)} ${getY(points[0].score)}`;
  for (let i = 1; i < points.length; i++) {
    const x0 = getX(i - 1);
    const y0 = getY(points[i - 1].score);
    const x1 = getX(i);
    const y1 = getY(points[i].score);
    const mx = (x0 + x1) / 2;
    pathD += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }

  // Area under path down to zero
  const areaD = `${pathD} L ${getX(points.length - 1)} ${zeroY} L ${getX(0)} ${zeroY} Z`;

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
            stroke-dasharray="${isZero ? '4,4' : '2,2'}" opacity="${isZero ? '0.65' : '0.45'}"/>
      <text x="${padding.left - 12}" y="${y + 4}" text-anchor="end" font-family="var(--font-mono)" font-size="11" font-weight="600" fill="${isZero ? 'var(--text-primary)' : 'var(--text-muted)'}">${label}</text>
    `;
  }

  // Zero line editorial tag
  gridHTML += `
    <text x="${width - padding.right}" y="${zeroY - 6}" text-anchor="end" font-family="var(--font-mono)" font-size="10" font-weight="600" fill="var(--text-muted)" opacity="0.75">Neutrality Baseline (0.00)</text>
  `;

  // Time labels on X axis: cleanly formatted, no squishing, evenly spaced
  let xLabelsHTML = '';
  const numLabels = Math.min(6, points.length);
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
      <text x="${x}" y="${height - 18}" text-anchor="middle" font-family="var(--font-mono)" font-size="11" font-weight="500" fill="var(--text-muted)">${dateLabel}</text>
    `;
  }

  // Dots for each snapshot
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
    <path d="${areaD}" fill="url(#timelineAreaGrad)"/>
    <path d="${pathD}" fill="none" stroke="url(#timelineLineGrad)" stroke-width="3" stroke-linecap="round"/>
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
      
      let tooltipContent = '';
      if (selectedSource) {
        tooltipContent = `
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">${dateStr}</div>
          <div style="font-size:0.75rem; color:${scoreColor}; font-weight:700;">${sourceName}: ${pt.score > 0 ? '+' : ''}${pt.score.toFixed(3)} (${moodText})</div>
        `;
      } else {
        const outletEntries = Object.entries(pt.averages).sort((a,b) => a[1] - b[1]);
        const lowest = outletEntries[0];
        const highest = outletEntries[outletEntries.length - 1];
        tooltipContent = `
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">${dateStr}</div>
          <div style="display:flex; justify-content:space-between; gap:0.75rem; margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">Global Vibe:</span>
            <strong style="color:${scoreColor};">${pt.score > 0 ? '+' : ''}${pt.score.toFixed(3)} (${moodText})</strong>
          </div>
          ${lowest ? `<div style="font-size:0.7rem; color:var(--neg-color);">📉 Darkest: ${(SOURCE_META[lowest[0]]?.name || lowest[0])} (${lowest[1].toFixed(2)})</div>` : ''}
          ${highest ? `<div style="font-size:0.7rem; color:var(--pos-color);">📈 Brightest: ${(SOURCE_META[highest[0]]?.name || highest[0])} (${highest[1].toFixed(2)})</div>` : ''}
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
      dot.setAttribute('r', '4');
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

    const categoryNames = {
      science: { name: 'Science & Space', icon: '🚀' },
      technology: { name: 'Tech & AI', icon: '⚡' },
      business: { name: 'Business & Economy', icon: '📈' },
      health: { name: 'Health & Medicine', icon: '🏥' },
      politics: { name: 'Politics & Governance', icon: '🗳️' },
      world: { name: 'World & Global Affairs', icon: '🌍' }
    };

    topicsGrid.innerHTML = Object.keys(categoryNames).map(catKey => {
      const count = topicCounts[catKey] || 0;
      const avg = count > 0 ? (topicAvgs[catKey] / count) : 0;
      const meta = categoryNames[catKey];
      const pct = Math.max(0, Math.min(100, ((avg + 1) / 2) * 100));
      const scoreClass = avg > 0.1 ? 'pos' : (avg < -0.1 ? 'neg' : 'neu');
      const fillColor = avg > 0.1 ? 'var(--pos-color)' : (avg < -0.1 ? 'var(--neg-color)' : 'var(--accent-color)');
      const isSelected = state.filters.category === catKey;

      return `
        <div class="topic-trajectory-card ${isSelected ? 'topic-traj-card-active' : ''}" onclick="selectCategoryFilter('${catKey}')" style="cursor:pointer; ${isSelected ? 'border: 2px solid var(--accent-color);' : ''}" title="Click to view ${meta.name} headlines">
          <div class="topic-traj-header">
            <span>${meta.icon} ${meta.name}</span>
            <span class="topic-traj-score ${scoreClass}">${avg > 0 ? '+' : ''}${avg.toFixed(2)}</span>
          </div>
          <div class="topic-traj-bar-wrap">
            <div class="topic-traj-bar-fill" style="width: ${pct}%; background-color: ${fillColor};"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:var(--text-muted); font-weight:600;">
            <span>${count} Articles</span>
            <span>${avg > 0.15 ? 'Optimistic' : (avg < -0.15 ? 'Alarmist' : 'Balanced')}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Helpers
function getMoodClass(score) {
  if (score === null || score === undefined) return 'none';
  if (score > 0.15) return 'positive';
  if (score < -0.15) return 'negative';
  return 'neutral';
}

// Toggle filters from UI selections
function toggleSourceFilter(sourceId) {
  if (state.filters.source === sourceId) {
    // Clear filter
    state.filters.source = 'all';
    if (elements.filterSource) elements.filterSource.value = 'all';
  } else {
    // Set filter
    state.filters.source = sourceId;
    if (elements.filterSource) elements.filterSource.value = sourceId;
    
    // Navigate to appropriate feed/spotlight based on active tab
    if (state.activeTab === 'deepdives') {
      const target = document.getElementById('deepdive-spotlight-banner') || document.getElementById('deepdive-feed-section');
      target?.scrollIntoView({ behavior: 'smooth' });
    } else if (state.activeTab === 'pulse') {
      const target = document.getElementById('spotlight-banner') || document.getElementById('feed-section');
      target?.scrollIntoView({ behavior: 'smooth' });
    } else {
      switchTab('deepdives');
      const target = document.getElementById('deepdive-spotlight-banner') || document.getElementById('deepdive-feed-section');
      target?.scrollIntoView({ behavior: 'smooth' });
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
  } else {
    if (elements.activeFilterIndicator) elements.activeFilterIndicator.style.display = 'none';
    if (elements.deepdiveFilterIndicator) elements.deepdiveFilterIndicator.style.display = 'none';
    if (elements.quickSourceIndicator) elements.quickSourceIndicator.style.display = 'none';
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
  
  // Update button visual state
  if (state.sort.field === 'date') {
    elements.sortDateBtn.classList.add('active');
    elements.sortVibeBtn.classList.remove('active');
    const orderIcon = state.sort.order === 'desc' ? 'arrow-down-narrow-wide' : 'arrow-up-narrow-wide';
    elements.sortDateBtn.innerHTML = `Date <i data-lucide="${orderIcon}"></i>`;
    elements.sortVibeBtn.innerHTML = 'Sentiment Vibe';
  } else {
    elements.sortVibeBtn.classList.add('active');
    elements.sortDateBtn.classList.remove('active');
    const orderIcon = state.sort.order === 'desc' ? 'arrow-down-narrow-wide' : 'arrow-up-narrow-wide';
    elements.sortVibeBtn.innerHTML = `Sentiment Vibe <i data-lucide="${orderIcon}"></i>`;
    elements.sortDateBtn.innerHTML = 'Date';
  }
  
  lucide.createIcons();
  renderHeadlines();
}

// Render filterable and sortable list of articles
function renderHeadlines() {
  elements.headlinesContainer.innerHTML = '';
  
  // 1. Gather all articles into flat array
  let articles = [];
  Object.keys(resolvedSources).forEach(sourceId => {
    // Skip if we filtered to a specific source and this is not it
    if (state.filters.source !== 'all' && state.filters.source !== sourceId) {
      return;
    }
    
    const source = resolvedSources[sourceId];
    if (source.articles) {
      source.articles.forEach(art => {
        articles.push({
          sourceId,
          sourceName: source.name,
          ...art
        });
      });
    }
  });
  
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
        <span class="source-badge" style="background-color: ${brandMeta.color}">${art.sourceName}</span>
        <span class="cat-badge ${art.category || 'other'}">${art.category || 'other'}</span>
        ${scoreBadgeHTML}
      </div>
      <div style="display: flex; align-items: center; gap: 0.6rem;">
        <span class="article-date">${dateFormatted}</span>
        <div class="article-actions" style="display: flex; gap: 0.25rem;">
          <a href="${art.link}" target="_blank" rel="noopener noreferrer" class="action-icon-btn" title="Open original article" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-secondary); cursor: pointer; transition: all 0.2s;">
            <i data-lucide="external-link" style="width: 13px; height: 13px;"></i>
          </a>
          <button onclick="copyToClipboard('${feedUrl}', this)" class="action-icon-btn" title="Copy source RSS feed URL" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-secondary); cursor: pointer; transition: all 0.2s; padding: 0;">
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
      <strong>Vibe Profile Details:</strong> ${hasValidScore && art.explanation && !art.explanation.includes('locally') ? art.explanation : 'Pending evaluation by Gemini AI (queued for subsequent sync cycle).'}
    </div>
  `;
  return card;
}

  // 3.5. Render Spotlight Banner if filtered to a specific news source
  renderSpotlightBanner(articles);
  
  // 4. Render articles across active headline containers
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
    if (articles.length === 0) {
      el.innerHTML = emptyHTML;
    } else {
      articles.forEach((art, index) => {
        el.appendChild(createArticleCard(art, index, prefix));
      });
    }
  });
  
  lucide.createIcons();
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
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; // Mouse X relative to container
    const containerWidth = rect.width;
    
    const markers = container.querySelectorAll('.outlet-marker');
    markers.forEach(marker => {
      // Get marker's left percentage
      const leftPct = parseFloat(marker.style.left);
      const markerX = (leftPct / 100) * containerWidth;
      
      const dist = Math.abs(mouseX - markerX);
      const threshold = 120; // range of magnification effect in pixels
      
      let scale = 1.0;
      
      if (dist < threshold) {
        const factor = 1 - (dist / threshold); // 0 to 1
        scale = 1.0 + 0.6 * factor; // max scale 1.6
      }
      
      const bubble = marker.querySelector('.marker-bubble');
      if (bubble) {
        bubble.style.transform = `scale(${scale})`;
        marker.style.zIndex = Math.round(scale * 100);
      }
      
      const label = marker.querySelector('.marker-label');
      if (label) {
        if (dist < 35) {
          label.style.opacity = '1';
          label.style.top = '-32px';
        } else {
          label.style.opacity = '0';
          label.style.top = '-24px';
        }
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
  const banners = [
    { el: elements.spotlightBanner, prefix: 'pulse' },
    { el: elements.deepdiveSpotlightBanner, prefix: 'dd' }
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

    el.style.display = 'flex';
    el.innerHTML = `
      <div class="spotlight-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="background-color: ${meta.color}; color: #fff; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; text-transform: uppercase;">${meta.initials}</div>
          <h3 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--text-primary); font-family: var(--font-serif);">${source.name} Spotlight</h3>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="score-badge ${moodClass}" style="font-size: 0.85rem; padding: 0.25rem 0.6rem; font-family: var(--font-mono);">${badgeText}</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">(${total} Articles)</span>
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
      <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%; margin-top: 0.5rem; position: relative;">
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
          <span style="position: absolute; left: 16px; bottom: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--neg-color); font-weight: 600; pointer-events: none; z-index: 2;">Alarmist (-1.0)</span>
          <span style="position: absolute; left: 50%; transform: translateX(-50%); bottom: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--text-muted); font-weight: 600; pointer-events: none; z-index: 2;">Neutral (0.0)</span>
          <span style="position: absolute; right: 16px; bottom: 4px; font-family: var(--font-mono); font-size: 0.68rem; color: var(--pos-color); font-weight: 600; pointer-events: none; z-index: 2;">Positive (+1.0)</span>
          
          <!-- Plot Circles -->
          ${dotsHTML}
        </div>
        <div style="font-size: 0.68rem; color: var(--text-secondary); text-align: center; font-style: italic; opacity: 0.85; margin-top: 0.15rem;">Hover over dots to inspect article score; click to jump directly to article card. Density scales dynamically to prevent overflow.</div>
        
        <!-- Custom Tooltip Element -->
        <div class="spotlight-tooltip card" style="position: absolute; display: none; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.75rem; box-shadow: var(--card-shadow); z-index: 100; max-width: 280px; pointer-events: none; white-space: normal; transition: left 0.08s ease-out, bottom 0.08s ease-out;"></div>
      </div>
    `;
  });
}

// Custom Tooltip Show/Hide handlers
window.showSpotlightTooltip = function(e, title, score) {
  const banner = e.target.closest('.card') || elements.spotlightBanner;
  if (!banner) return;
  const tooltip = banner.querySelector('.spotlight-tooltip');
  if (!tooltip) return;
  
  let mood = 'Neutral';
  let moodClass = 'neutral';
  if (score > 0.15) { mood = 'Positive'; moodClass = 'positive'; }
  else if (score < -0.15) { mood = 'Negative'; moodClass = 'negative'; }
  
  tooltip.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 0.25rem; line-height: 1.3; color: var(--text-primary);">${title}</div>
    <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.35rem;">
      <span>Score: <strong style="color: var(--text-primary);">${score > 0 ? '+' : ''}${score.toFixed(2)}</strong></span>
      <span class="dial-vibe-profile ${moodClass}" style="font-weight:700;">${mood}</span>
    </div>
  `;
  
  tooltip.style.display = 'block';
  
  // Position relative to banner card (the wrapper containing spotlight-tooltip)
  const bannerRect = banner.getBoundingClientRect();
  const dotRect = e.target.getBoundingClientRect();
  
  const left = dotRect.left - bannerRect.left + (dotRect.width / 2);
  const bottom = bannerRect.bottom - dotRect.top + 6; // offset 6px above dot
  
  tooltip.style.left = `${left}px`;
  tooltip.style.bottom = `${bottom}px`;
  tooltip.style.transform = 'translateX(-50%)';
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
    card = document.getElementById(`art-card-pulse-${cardId}`) || document.getElementById(`art-card-dd-${cardId}`);
  }
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight-flash');
    setTimeout(() => {
      card.classList.remove('highlight-flash');
    }, 2000);
  }
};

window.copyToClipboard = function(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const icon = btn.querySelector('i');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width: 13px; height: 13px; color: var(--pos-color);"></i>`;
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      lucide.createIcons();
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy text:', err);
  });
};

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
  const categoriesToCheck = ['world', 'politics', 'business', 'technology', 'science', 'health'];
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

  // Update Global Score & Badge
  const scoreEl = document.getElementById('global-mood-score');
  const badgeEl = document.getElementById('global-mood-badge');
  const summaryEl = document.getElementById('daily-editorial-summary');

  if (scoreEl) {
    scoreEl.innerText = (globalAvg > 0 ? '+' : '') + globalAvg.toFixed(2);
    scoreEl.className = 'pulse-hero-score ' + (globalAvg < -0.1 ? 'neg' : (globalAvg > 0.1 ? 'pos' : 'neu'));
  }

  if (badgeEl) {
    badgeEl.className = 'pulse-hero-mood-badge';
    if (state.edition === 'silver') {
      badgeEl.innerText = '☀️ Some Good News Focus';
      badgeEl.classList.add('pos');
    } else if (globalAvg < -0.3) {
      badgeEl.innerText = 'Elevated Alarmism / Doom';
      badgeEl.classList.add('neg');
    } else if (globalAvg < -0.05) {
      badgeEl.innerText = 'Leaning Gloomy';
      badgeEl.classList.add('neg');
    } else if (globalAvg > 0.15) {
      badgeEl.innerText = 'Uplifting & Optimistic';
      badgeEl.classList.add('pos');
    } else {
      badgeEl.innerText = 'Objective & Neutral';
      badgeEl.classList.add('neu');
    }
  }

  if (summaryEl) {
    const summaryText = state.editorialSummary || (state.globalStats && state.globalStats.editorialSummary);
    if (summaryText) {
      summaryEl.innerText = summaryText;
    } else {
      summaryEl.innerText = "Another banner day for global dread. Politicians traded fresh hostility, markets flinched on cue, and deep-space science once again stepped up as humanity's designated driver.";
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
  if (upliftingNameEl && mostUplifting) upliftingNameEl.innerText = mostUplifting.name;
  if (upliftingScoreEl && mostUplifting) upliftingScoreEl.innerText = (mostUplifting.score > 0 ? '+' : '') + mostUplifting.score.toFixed(2);
  
  if (polNameEl) {
    polNameEl.innerText = maxClash.outletA && maxClash.outletB 
      ? `${maxClash.outletA.name} vs ${maxClash.outletB.name}` 
      : 'Cross-Outlet Consensus';
  }
  if (polSubEl) {
    polSubEl.innerText = maxClash.catName ? `on ${maxClash.catName} news` : 'Across all topics';
  }
  if (polScoreEl) {
    polScoreEl.innerText = maxClash.divergence > 0 ? `${maxClash.divergence.toFixed(2)} Divergence` : '0.15 Spread';
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
        elements.h2hSourceA.value = maxClash.outletA.id;
        elements.h2hSourceB.value = maxClash.outletB.id;
        switchTab('deepdives');
        renderHeadToHead();
        const h2h = document.getElementById('h2h-section');
        if (h2h) h2h.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }

  // Topic Vibes Chips (renamed from Beat)
  const chipsContainer = document.getElementById('pulse-category-chips');
  if (chipsContainer) {
    const mainCategories = ['world', 'politics', 'business', 'technology', 'science', 'health'];
    const catIcons = {
      world: '🌍',
      politics: '🗳️',
      business: '📈',
      technology: '⚡',
      science: '🚀',
      health: '🏥'
    };

    chipsContainer.innerHTML = '';
    mainCategories.forEach(cat => {
      const data = catStats[cat];
      if (data && data.count > 0) {
        const avg = Number((data.total / data.count).toFixed(2));
        const valClass = avg < -0.15 ? 'neg' : (avg > 0.15 ? 'pos' : 'neu');
        const isActive = state.filters.category === cat;
        const chip = document.createElement('button');
        chip.className = `beat-chip ${isActive ? 'active' : ''}`;
        chip.setAttribute('data-cat', cat);
        chip.setAttribute('title', isActive ? 'Click to clear topic filter' : `Filter entire dashboard to ${cat} news`);
        chip.innerHTML = `<span>${catIcons[cat] || '📰'} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</span> <span class="beat-chip-val ${valClass}">${avg > 0 ? '+' : ''}${avg.toFixed(2)}</span>`;
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
}

// --- INTERACTIVE TOPIC HEATMAP RENDERER ---
function renderHeatmapMatrix() {
  const container = document.getElementById('heatmap-grid');
  if (!container) return;

  const sources = resolvedSources || getResolvedSources();
  const sourceIds = Object.keys(sources);
  if (sourceIds.length === 0) return;

  const categories = ['world', 'politics', 'business', 'technology', 'science', 'health'];
  const catLabels = {
    world: '🌍 World',
    politics: '🗳️ Politics',
    business: '📈 Business',
    technology: '⚡ Tech',
    science: '🚀 Science',
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


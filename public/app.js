// --- VIBE-O-METER CLIENT APP ---

// App State
let state = {
  sources: {},
  lastUpdated: null,
  analyzerUsed: null,
  sentimentMode: 'local', // 'local' or 'gemini'
  spectrumViewMode: 'averages', // 'averages' or 'distribution'
  isSyncing: false,
  syncMessage: '',
  filters: {
    source: 'all',
    category: 'all',
    vibe: 'all',
    time: 'all',
    search: ''
  },
  sort: {
    field: 'date', // 'date' or 'vibe'
    order: 'desc' // 'desc' or 'asc'
  }
};

let resolvedSources = {};

// News Source Initials for Spectrum Markers
const SOURCE_META = {
  bbc: { initials: 'BBC', color: '#ff3f3f' },
  nyt: { initials: 'NYT', color: '#1e293b' },
  cnn: { initials: 'CNN', color: '#cc0000' },
  guardian: { initials: 'GD', color: '#005689' },
  fox: { initials: 'FOX', color: '#003366' },
  aljazeera: { initials: 'AJ', color: '#ff9900' },
  npr: { initials: 'NPR', color: '#3c78d8' },
  cnbc: { initials: 'CNB', color: '#0077b6' },
  skynews: { initials: 'SKY', color: '#f22613' },
  spiegel: { initials: 'SPG', color: '#e62a15' },
  reuters: { initials: 'RTR', color: '#ff8000' },
  ap: { initials: 'AP', color: '#ff0055' },
  bloomberg: { initials: 'BBG', color: '#1d4ed8' }
};

// RSS Feed URLs for copying
const SOURCE_FEEDS = {
  bbc: 'https://feeds.bbci.co.uk/news/rss.xml',
  nyt: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  cnn: 'http://rss.cnn.com/rss/edition.rss',
  guardian: 'https://www.theguardian.com/international/rss',
  fox: 'https://moxie.foxnews.com/feed-uploader/v/web/home/latest.xml',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  npr: 'https://feeds.npr.org/1001/rss.xml',
  cnbc: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  skynews: 'https://feeds.skynews.com/feeds/rss/home.xml',
  spiegel: 'https://www.spiegel.de/international/index.rss',
  reuters: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
  ap: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en',
  bloomberg: 'https://news.google.com/rss/search?q=site:bloomberg.com&hl=en-US&gl=US&ceid=US:en'
};

// DOM Elements
const elements = {
  syncBtn: document.getElementById('sync-btn'),
  syncIcon: document.getElementById('sync-icon'),
  syncActions: document.querySelector('.sync-actions'),
  lastUpdatedText: document.getElementById('last-updated-text'),
  analyzerBadge: document.getElementById('analyzer-used-badge'),
  spectrumLanes: document.getElementById('spectrum-lanes-container'),
  spectrumMarkers: document.getElementById('spectrum-markers-container'),
  viewToggleAverages: document.getElementById('view-toggle-averages'),
  viewToggleDistribution: document.getElementById('view-toggle-distribution'),
  sourcesGrid: document.getElementById('sources-grid'),
  h2hSourceA: document.getElementById('h2h-source-a'),
  h2hSourceB: document.getElementById('h2h-source-b'),
  headlinesContainer: document.getElementById('headlines-container'),
  
  // Model View Toggle
  modeAfinnBtn: document.getElementById('mode-afinn-btn'),
  modeVaderBtn: document.getElementById('mode-vader-btn'),
  modeLocalBtn: document.getElementById('mode-local-btn'),
  modeGeminiBtn: document.getElementById('mode-gemini-btn'),
  modeGroqBtn: document.getElementById('mode-groq-btn'),
  modeGlobalBtn: document.getElementById('mode-global-btn'),
  spotlightBanner: document.getElementById('spotlight-banner'),
  
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
  
  // Sort Buttons
  sortDateBtn: document.getElementById('sort-date'),
  sortVibeBtn: document.getElementById('sort-vibe'),
  
  // Settings Modal
  openSettingsBtn: document.getElementById('open-settings-btn'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  geminiKeyInput: document.getElementById('gemini-key-input'),
  toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
  modeOpenRouterBtn: document.getElementById('mode-openrouter-btn'),
  openRouterKeyInput: document.getElementById('openrouter-key-input'),
  openRouterModelSelect: document.getElementById('openrouter-model-select'),
  toggleOrKeyVisibility: document.getElementById('toggle-or-key-visibility'),
  forceReanalyzeCheckbox: document.getElementById('force-reanalyze-checkbox'),
  clearCacheBtn: document.getElementById('clear-cache-btn'),
  groqKeyInput: document.getElementById('groq-key-input'),
  groqModelSelect: document.getElementById('groq-model-select'),
  toggleGroqKeyVisibility: document.getElementById('toggle-groq-key-visibility'),
  autoSyncInterval: document.getElementById('auto-sync-interval'),
  vibeCalcMethod: document.getElementById('vibe-calc-method')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Load saved API Keys and Settings in input
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    elements.geminiKeyInput.value = savedKey;
  }
  const savedOrKey = localStorage.getItem('openrouter_api_key');
  if (savedOrKey) {
    elements.openRouterKeyInput.value = savedOrKey;
  }
  const savedOrModel = localStorage.getItem('openrouter_model');
  if (savedOrModel) {
    elements.openRouterModelSelect.value = savedOrModel;
  }
  
  const savedGroqKey = localStorage.getItem('groq_api_key');
  if (savedGroqKey) {
    elements.groqKeyInput.value = savedGroqKey;
  }
  const savedGroqModel = localStorage.getItem('groq_model');
  if (savedGroqModel) {
    elements.groqModelSelect.value = savedGroqModel;
  }
  
  // Load Icons
  lucide.createIcons();
  
  // Event Listeners
  setupEventListeners();
  
  // Initialize sentiment mode styling and visibility
  switchSentimentMode(state.sentimentMode);
  setupSpectrumMagnification();
  
  // Fetch initial data & check active sync progress
  fetchData();
  pollSyncStatus();
});

// Setup Event Listeners
function setupEventListeners() {
  // Sync button click
  elements.syncBtn.addEventListener('click', syncData);
  
  // Model View Toggle Click
  elements.modeAfinnBtn.addEventListener('click', () => {
    switchSentimentMode('afinn');
  });
  elements.modeVaderBtn.addEventListener('click', () => {
    switchSentimentMode('vader');
  });
  elements.modeLocalBtn.addEventListener('click', () => {
    switchSentimentMode('local');
  });
  elements.modeGeminiBtn.addEventListener('click', () => {
    switchSentimentMode('gemini');
  });
  elements.modeOpenRouterBtn.addEventListener('click', () => {
    switchSentimentMode('openrouter');
  });
  elements.modeGroqBtn.addEventListener('click', () => {
    switchSentimentMode('groq');
  });
  elements.modeGlobalBtn.addEventListener('click', () => {
    switchSentimentMode('global');
  });
  
  // Filter changes
  elements.filterSource.addEventListener('change', (e) => {
    state.filters.source = e.target.value;
    updateFilterIndicator();
    renderHeadlines();
  });
  elements.filterCategory.addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderHeadlines();
  });
  elements.filterVibe.addEventListener('change', (e) => {
    state.filters.vibe = e.target.value;
    renderHeadlines();
  });
  
  elements.filterTime.addEventListener('change', (e) => {
    state.filters.time = e.target.value;
    updateAppUI();
  });
  
  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value.trim();
    elements.clearSearchBtn.style.display = state.filters.search ? 'block' : 'none';
    renderHeadlines();
  });
  
  elements.clearSearchBtn.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.filters.search = '';
    elements.clearSearchBtn.style.display = 'none';
    renderHeadlines();
  });

  elements.clearFilterBtn.addEventListener('click', () => {
    state.filters.source = 'all';
    state.filters.category = 'all';
    state.filters.vibe = 'all';
    state.filters.time = 'all';
    
    elements.filterSource.value = 'all';
    elements.filterCategory.value = 'all';
    elements.filterVibe.value = 'all';
    elements.filterTime.value = 'all';
    
    // Clear active card states in grid
    document.querySelectorAll('.source-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.outlet-marker').forEach(m => m.classList.remove('active'));
    
    updateFilterIndicator();
    updateAppUI();
  });
  
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
  
  // Settings Modal Controls
  elements.openSettingsBtn.addEventListener('click', () => {
    // Load background scheduler configs from server
    fetch('/api/settings')
      .then(res => res.json())
      .then(cfg => {
        if (cfg.syncInterval !== undefined) {
          elements.autoSyncInterval.value = cfg.syncInterval.toString();
        }
        if (cfg.vibeCalcMethod) {
          elements.vibeCalcMethod.value = cfg.vibeCalcMethod;
        }
      })
      .catch(err => console.error('Failed to load settings from server:', err));

    elements.settingsModal.classList.add('open');
  });
  
  elements.closeSettingsBtn.addEventListener('click', () => {
    elements.settingsModal.classList.remove('open');
  });
  
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      elements.settingsModal.classList.remove('open');
    }
  });
  
  elements.saveSettingsBtn.addEventListener('click', () => {
    const key = elements.geminiKeyInput.value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    const orKey = elements.openRouterKeyInput.value.trim();
    if (orKey) {
      localStorage.setItem('openrouter_api_key', orKey);
    } else {
      localStorage.removeItem('openrouter_api_key');
    }
    const orModel = elements.openRouterModelSelect.value;
    localStorage.setItem('openrouter_model', orModel);

    const groqKey = elements.groqKeyInput.value.trim();
    if (groqKey) {
      localStorage.setItem('groq_api_key', groqKey);
    } else {
      localStorage.removeItem('groq_api_key');
    }
    const groqModel = elements.groqModelSelect.value;
    localStorage.setItem('groq_model', groqModel);

    const syncInterval = Number(elements.autoSyncInterval.value) || 0;
    const vibeCalcMethod = elements.vibeCalcMethod.value || 'active';
    localStorage.setItem('auto_sync_interval', syncInterval);
    localStorage.setItem('vibe_calc_method', vibeCalcMethod);
    
    // Save settings to server so background automation works
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey: key,
        openRouterApiKey: orKey,
        openRouterModel: orModel,
        groqApiKey: groqKey,
        groqModel: groqModel,
        analyzer: state.sentimentMode,
        syncInterval,
        vibeCalcMethod
      })
    })
      .then(res => res.json())
      .then(() => {
        elements.settingsModal.classList.remove('open');
        alert('Settings successfully saved to browser and server database!');
        fetchData();
      })
      .catch(err => {
        console.error('Failed to save settings to server:', err);
        elements.settingsModal.classList.remove('open');
        alert('Settings saved locally, but failed to persist to server database.');
      });
  });
  
  elements.toggleKeyVisibility.addEventListener('click', () => {
    const type = elements.geminiKeyInput.type === 'password' ? 'text' : 'password';
    elements.geminiKeyInput.type = type;
    const iconName = type === 'password' ? 'eye' : 'eye-off';
    elements.toggleKeyVisibility.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
  });

  elements.toggleGroqKeyVisibility.addEventListener('click', () => {
    const type = elements.groqKeyInput.type === 'password' ? 'text' : 'password';
    elements.groqKeyInput.type = type;
    const iconName = type === 'password' ? 'eye' : 'eye-off';
    elements.toggleGroqKeyVisibility.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
  });

  elements.toggleOrKeyVisibility.addEventListener('click', () => {
    const type = elements.openRouterKeyInput.type === 'password' ? 'text' : 'password';
    elements.openRouterKeyInput.type = type;
    const iconName = type === 'password' ? 'eye' : 'eye-off';
    elements.toggleOrKeyVisibility.innerHTML = `<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
  });

  elements.viewToggleAverages.addEventListener('click', () => {
    switchSpectrumViewMode('averages');
  });

  elements.viewToggleDistribution.addEventListener('click', () => {
    switchSpectrumViewMode('distribution');
  });

  elements.clearCacheBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete all cached articles from the history database? This cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch('/api/clear-cache', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to clear cache');
      alert('Historical database cache cleared successfully!');
      elements.settingsModal.classList.remove('open');
      fetchData();
    } catch (err) {
      alert('Error clearing cache: ' + err.message);
    }
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
        const staticRes = await fetch('data/data.json');
        if (staticRes.ok) {
          data = await staticRes.json();
        }
      } catch (_) {}
    }

    // 3. Fallback to summary.json
    if (!data || !data.sources || Object.keys(data.sources).length === 0) {
      try {
        const summaryRes = await fetch('data/summary.json');
        if (summaryRes.ok) {
          data = await summaryRes.json();
        }
      } catch (_) {}
    }

    if (data && data.sources && Object.keys(data.sources).length > 0) {
      state.sources = data.sources;
      state.lastUpdated = data.lastUpdated;
      state.analyzerUsed = data.analyzerUsed;

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
    elements.syncBtn.disabled = true;
    elements.syncIcon.classList.add('spin');
    elements.syncBtn.querySelector('span').innerText = msg;
    document.querySelector('.status-dot').className = 'status-dot loading';
    elements.lastUpdatedText.innerText = msg;
  } else {
    state.syncMessage = '';
    elements.syncBtn.disabled = false;
    elements.syncIcon.classList.remove('spin');
    const label = state.sentimentMode === 'gemini' ? 'Run Gemini Analysis' : 'Run OpenRouter Analysis';
    elements.syncBtn.querySelector('span').innerText = label;
    document.querySelector('.status-dot').className = 'status-dot green';
    const dateStr = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : 'Never';
    elements.lastUpdatedText.innerText = `Last Updated: ${dateStr}`;
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
    { id: 'modeAfinnBtn', mode: 'afinn' },
    { id: 'modeVaderBtn', mode: 'vader' },
    { id: 'modeLocalBtn', mode: 'local' },
    { id: 'modeGeminiBtn', mode: 'gemini' },
    { id: 'modeOpenRouterBtn', mode: 'openrouter' },
    { id: 'modeGroqBtn', mode: 'groq' },
    { id: 'modeGlobalBtn', mode: 'global' }
  ];
  
  buttons.forEach(btnInfo => {
    const btn = elements[btnInfo.id];
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

  // Always show Run Analysis action button
  if (elements.syncActions) {
    elements.syncActions.style.setProperty('display', 'flex', 'important');
  }
  
  updateAppUI();
}

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
        if (art.sentimentGemini !== undefined && art.sentimentGemini !== null) {
          score = art.sentimentGemini;
          explanation = `Analyzed using Gemini LLM (gemini-3.5-flash). Sentiment Score: ${score.toFixed(2)}.`;
          category = art.categoryGemini || category;
        } else {
          score = null;
          explanation = 'This article has not been analyzed by the Gemini LLM yet. Run Sync & Analyze to generate.';
        }
      } else if (state.sentimentMode === 'openrouter') {
        if (art.sentimentOpenRouter !== undefined && art.sentimentOpenRouter !== null) {
          score = art.sentimentOpenRouter;
          explanation = `Analyzed using OpenRouter LLM (${art.openRouterModelUsed || 'Llama'}). Sentiment Score: ${score.toFixed(2)}.`;
          category = art.categoryOpenRouter || category;
        } else {
          score = null;
          explanation = 'This article has not been analyzed by the OpenRouter LLM yet. Run Sync & Analyze to generate.';
        }
      } else if (state.sentimentMode === 'groq') {
        if (art.sentimentGroq !== undefined && art.sentimentGroq !== null) {
          score = art.sentimentGroq;
          explanation = `Analyzed using Groq LLM (${art.groqModelUsed || 'Llama'}). Sentiment Score: ${score.toFixed(2)}.`;
          category = art.categoryGroq || category;
        } else {
          score = null;
          explanation = 'This article has not been analyzed by the Groq LLM yet. Run Sync & Analyze to generate.';
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
    elements.lastUpdatedText.innerText = state.syncMessage || 'Sync in progress...';
    document.querySelector('.status-dot').className = 'status-dot loading';
  } else {
    const dateStr = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : 'Never';
    elements.lastUpdatedText.innerText = `Last Updated: ${dateStr}`;
    document.querySelector('.status-dot').className = 'status-dot green';
  }
  elements.analyzerBadge.innerText = state.analyzerUsed || 'None';
  
  // Highlight analyzer color
  if (state.analyzerUsed && state.analyzerUsed.includes('Gemini')) {
    elements.analyzerBadge.style.color = '#818cf8';
    elements.analyzerBadge.style.borderColor = 'rgba(129, 140, 248, 0.4)';
  } else {
    elements.analyzerBadge.style.color = 'var(--text-secondary)';
    elements.analyzerBadge.style.borderColor = 'var(--border-color)';
  }
  
  // Setup selectors
  populateFilterOptions();
  
  // Render views
  renderSpectrum();
  renderComparisonMatrix();
  renderHeadToHead();
  renderHeadlines();
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

// Draw the Vibe Spectrum Axis (Hero Averages vs Beeswarm Lanes)
function renderSpectrum() {
  if (state.spectrumViewMode === 'averages') {
    elements.spectrumMarkers.innerHTML = '';
    const markerPositions = [];
    
    Object.keys(resolvedSources).forEach(id => {
      const source = resolvedSources[id];
      if (source.error && (!source.articles || source.articles.length === 0)) return;
      
      const avg = source.averageSentiment;
      if (avg === null || avg === undefined) return;
      // Map -1.0 to +1.0 sentiment into 0% to 100% position
      const percentage = ((avg + 1) / 2) * 100;
      
      // Vertical stacking collision check for averages markers
      let yLevel = 0;
      let collision = true;
      while (collision) {
        collision = false;
        for (const pos of markerPositions) {
          if (Math.abs(pos.x - percentage) < 4.5 && pos.y === yLevel) {
            yLevel++;
            collision = true;
            break;
          }
        }
      }
      markerPositions.push({ x: percentage, y: yLevel });
      
      // Create marker
      const marker = document.createElement('div');
      marker.className = `outlet-marker ${state.filters.source === id ? 'active' : ''}`;
      marker.style.left = `${percentage}%`;
      marker.style.bottom = `${6 + yLevel * 38}px`;
      marker.setAttribute('data-id', id);
      
      const meta = SOURCE_META[id] || { initials: id.toUpperCase().slice(0, 3), color: '#ccc' };
      
      // Set brand-specific styling
      marker.innerHTML = `
        <div class="marker-bubble" style="background-color: ${meta.color}; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; border: 2.5px solid #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.15); transition: transform 0.2s;">
          <span>${meta.initials}</span>
        </div>
        <div class="marker-label" style="position: absolute; top: -28px; left: 50%; transform: translateX(-50%); opacity: 0; pointer-events: none; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; box-shadow: var(--card-shadow); white-space: nowrap; color: var(--text-primary); transition: all 0.2s;">
          ${source.name}: ${avg > 0 ? '+' : ''}${avg.toFixed(2)}
        </div>
      `;
      
      // Spectrum marker click filter
      marker.addEventListener('click', () => {
        toggleSourceFilter(id);
      });
      
      elements.spectrumMarkers.appendChild(marker);
    });
    
    // Wire macOS Dock zoom styles
    setupSpectrumMagnification();
  } else {
    elements.spectrumLanes.innerHTML = '';
    
    // Sort the lanes by average sentiment so the most positive is at the top (pushing N/A to the bottom)
    const sortedIds = Object.keys(resolvedSources).sort((a, b) => {
      const valA = resolvedSources[a].averageSentiment !== null ? resolvedSources[a].averageSentiment : -999;
      const valB = resolvedSources[b].averageSentiment !== null ? resolvedSources[b].averageSentiment : -999;
      return valB - valA;
    });
    
    sortedIds.forEach(id => {
      const source = resolvedSources[id];
      if (source.error && (!source.articles || source.articles.length === 0)) return;
      
      const avg = source.averageSentiment;
      const avgPct = avg !== null ? ((avg + 1) / 2) * 100 : 50;
      const meta = SOURCE_META[id] || { initials: id.toUpperCase().slice(0, 3), color: '#ccc' };
      
      const lane = document.createElement('div');
      lane.className = `spectrum-lane ${state.filters.source === id ? 'active' : ''}`;
      lane.style.cssText = 'display: flex; align-items: center; gap: 1.25rem; width: 100%; height: 50px; position: relative; margin-bottom: 0.25rem;';
      
      // Avg label text
      const avgLabel = avg !== null 
        ? `Avg: ${avg > 0 ? '+' : ''}${avg.toFixed(2)}`
        : 'Avg: N/A';
      const avgColor = avg !== null
        ? (avg > 0.15 ? 'var(--pos-color)' : avg < -0.15 ? 'var(--neg-color)' : 'var(--text-secondary)')
        : 'var(--text-muted)';
      
      // Left side source header/button
      const sourceHTML = `
        <div class="lane-source-info" onclick="toggleSourceFilter('${id}')" 
             style="display: flex; align-items: center; gap: 0.6rem; width: 160px; cursor: pointer; user-select: none; padding: 0.4rem; border-radius: 8px; transition: all 0.2s; background: ${state.filters.source === id ? 'var(--bg-secondary)' : 'transparent'}; border: 1px solid ${state.filters.source === id ? 'var(--border-color)' : 'transparent'};">
          <div style="background-color: ${meta.color}; color: #fff; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            ${meta.initials}
          </div>
          <div style="display: flex; flex-direction: column; overflow: hidden; text-align: left;">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2;">${source.name}</span>
            <span style="font-size: 0.7rem; font-weight: 600; color: ${avgColor}; line-height: 1.2;">
              ${avgLabel}
            </span>
          </div>
        </div>
      `;
      
      // Create the articles dots (filtering out null/undefined scores)
      const dotPositions = [];
      const scoredArticles = (source.articles || []).filter(art => art.sentiment !== null && art.sentiment !== undefined);
      
      const dotsHTML = scoredArticles.map((art, idx) => {
        const score = art.sentiment;
        const posPct = ((score + 1) / 2) * 100;
        
        // Beeswarm vertical stacking collision check
        let yOffset = 0;
        let collision = true;
        while (collision) {
          collision = false;
          for (const pos of dotPositions) {
            // Collision threshold: 1.8% horizontally on the track and matching yOffset
            if (Math.abs(pos.x - posPct) < 1.8 && pos.y === yOffset) {
              yOffset += 9; // offset vertically by 9px
              collision = true;
              break;
            }
          }
        }
        dotPositions.push({ x: posPct, y: yOffset });
        
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
               style="position: absolute; left: calc(${posPct}% - 5px); bottom: calc(20% + ${yOffset}px); width: 10px; height: 10px; border-radius: 50%; background-color: ${dotColor}; border: 1.25px solid var(--bg-primary); cursor: pointer; transition: transform 0.15s ease, border-color 0.15s; z-index: 5;">
          </div>
        `;
      }).join('');
      
      // Average marker vertical indicator HTML (hidden if avg is null)
      const averageMarkerHTML = avg !== null ? `
        <!-- Average marker vertical line -->
        <div style="position: absolute; left: calc(${avgPct}% - 1px); top: 15%; bottom: 15%; width: 2px; background-color: ${meta.color}; z-index: 2; opacity: 0.6;" title="Average: ${avg.toFixed(2)}"></div>
        <div style="position: absolute; left: calc(${avgPct}% - 4px); top: 5%; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid ${meta.color}; z-index: 3;" title="Average: ${avg.toFixed(2)}"></div>
      ` : '';
      
      // Right side track layout
      const trackHTML = `
        <div class="lane-track-container" style="position: relative; flex-grow: 1; height: 32px; background: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); display: flex; align-items: center; overflow: visible;">
          <!-- baseline tick track -->
          <div style="position: absolute; left: 12px; right: 12px; height: 2px; background: var(--border-color); opacity: 0.5; z-index: 1; top: 75%;"></div>
          
          ${averageMarkerHTML}
          
          <!-- Individual Article Dots -->
          <div style="position: absolute; left: 12px; right: 12px; top: 0; bottom: 0; overflow: visible;">
            ${dotsHTML}
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
  
  // Sort sources by average sentiment (highest to lowest, pushing nulls to bottom)
  const sortedIds = Object.keys(resolvedSources).sort((a, b) => {
    const valA = resolvedSources[a].averageSentiment !== null ? resolvedSources[a].averageSentiment : -999;
    const valB = resolvedSources[b].averageSentiment !== null ? resolvedSources[b].averageSentiment : -999;
    return valB - valA;
  });
  
  sortedIds.forEach(id => {
    const source = resolvedSources[id];
    const avg = source.averageSentiment;
    
    // Mood Class Label
    let moodClass = 'neutral';
    let moodLabel = 'Objective & Neutral';
    let badgeText = 'N/A';
    if (avg !== null) {
      badgeText = (avg > 0 ? '+' : '') + avg.toFixed(2);
      if (avg > 0.15) {
        moodClass = 'positive';
        moodLabel = 'Uplifting & Optimistic';
      } else if (avg < -0.15) {
        moodClass = 'negative';
        moodLabel = 'Alarmist & Gloomy';
      }
    } else {
      moodClass = 'none';
      moodLabel = 'Not Analyzed Yet';
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
          <div class="source-icon ${id}">${id.slice(0,2).toUpperCase()}</div>
          <h3 class="source-name">${source.name}</h3>
        </div>
        <div class="source-score-container">
          <span class="score-badge ${moodClass}">${badgeText}</span>
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
    elements.filterSource.value = 'all';
  } else {
    // Set filter
    state.filters.source = sourceId;
    elements.filterSource.value = sourceId;
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
  if (state.filters.source !== 'all' && state.sources[state.filters.source]) {
    elements.filterName.innerText = state.sources[state.filters.source].name;
    elements.activeFilterIndicator.style.display = 'flex';
  } else {
    elements.activeFilterIndicator.style.display = 'none';
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
  
  // 3.5. Render Spotlight Banner if filtered to a specific news source
  renderSpotlightBanner(articles);
  
  // 4. Render articles
  if (articles.length === 0) {
    elements.headlinesContainer.innerHTML = `
      <div class="empty-state">
        <i data-lucide="info"></i>
        <span>No articles match the current filter criteria.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  articles.forEach((art, index) => {
    const isNone = art.sentiment === null || art.sentiment === undefined;
    const itemVibe = getMoodClass(art.sentiment);
    const dateObj = new Date(art.pubDate);
    const dateFormatted = dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const elementId = `article-explain-${index}`;
    const card = document.createElement('div');
    card.className = `article-card card ${itemVibe}`;
    card.id = `art-card-${art.sourceId}-${index}`;
    
    const feedUrl = SOURCE_FEEDS[art.sourceId] || '';
    const brandMeta = SOURCE_META[art.sourceId] || { initials: art.sourceId, color: '#999' };
    
    const scoreBadgeHTML = isNone
      ? `<span class="article-vibe-score none" style="background-color: var(--border-color); color: var(--text-muted); padding: 0.2rem 0.5rem; border-radius: 6px; font-weight: 700; font-size: 0.75rem;">N/A</span>`
      : `<span class="article-vibe-score ${itemVibe}">${art.sentiment > 0 ? '+' : ''}${art.sentiment.toFixed(2)}</span>`;

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
        <strong>Vibe Profile Details:</strong> ${art.explanation || 'No reasoning available.'}
      </div>
    `;
    
    elements.headlinesContainer.appendChild(card);
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
  elements.lastUpdatedText.innerText = 'Cache is empty.';
  elements.analyzerBadge.innerText = 'None';
  elements.headlinesContainer.innerHTML = `
    <div class="empty-state">
      <i data-lucide="database-backup"></i>
      <h3>No local news data found</h3>
      <p>Click "Sync & Analyze Feeds" to fetch headlines and calculate their sentiment.</p>
    </div>
  `;
  lucide.createIcons();
}

function showErrorState(message) {
  elements.headlinesContainer.innerHTML = `
    <div class="empty-state">
      <i data-lucide="alert-triangle" style="color:var(--neg-color)"></i>
      <h3>An error occurred</h3>
      <p>${message}</p>
    </div>
  `;
  lucide.createIcons();
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
  if (!elements.spotlightBanner) return;
  
  if (state.filters.source === 'all' || filteredArticles.length === 0) {
    elements.spotlightBanner.style.display = 'none';
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
  
  // beeswarm alignment helper: check for collisions on X and increment Y
  const dotPositions = [];
  const dotsHTML = scored.map((art, idx) => {
    const score = art.sentiment;
    const posPct = ((score + 1) / 2) * 100;
    
    let yOffset = 0;
    let collision = true;
    while (collision) {
      collision = false;
      for (const pos of dotPositions) {
        // If dots are within 2.2% of each other horizontally and have the same Y stack level, push it up
        if (Math.abs(pos.x - posPct) < 2.2 && pos.y === yOffset) {
          yOffset += 14; // stack vertically by 14px
          collision = true;
          break;
        }
      }
    }
    dotPositions.push({ x: posPct, y: yOffset });
    
    let color = 'var(--neu-color)';
    if (score > 0.15) color = 'var(--pos-color)';
    else if (score < -0.15) color = 'var(--neg-color)';
    
    const cardId = `art-card-${sourceId}-${idx}`;
    const cleanTitle = art.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    return `
      <div class="spotlight-dot" 
           onclick="scrollToArticle('${cardId}')"
           onmouseenter="showSpotlightTooltip(event, '${cleanTitle}', ${score})"
           onmouseleave="hideSpotlightTooltip()"
           style="position: absolute; left: calc(${posPct}% - 6px); bottom: calc(20px + ${yOffset}px); width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; border: 1.5px solid var(--bg-secondary); cursor: pointer; transition: all 0.2s; z-index: 5;">
      </div>
    `;
  }).join('');

  elements.spotlightBanner.style.display = 'flex';
  elements.spotlightBanner.innerHTML = `
    <div class="spotlight-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="background-color: ${meta.color}; color: #fff; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.75rem; text-transform: uppercase;">${meta.initials}</div>
        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--text-primary);">${source.name} Spotlight</h3>
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="score-badge ${moodClass}" style="font-size: 0.85rem; padding: 0.25rem 0.6rem;">${badgeText}</span>
        <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">(${total} Articles)</span>
      </div>
    </div>
    
    <!-- Coverage Distribution Bar -->
    <div style="display: flex; flex-direction: column; gap: 0.35rem; width: 100%;">
      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">
        <span>Coverage Tone</span>
        <span>${negPct}% Negative / ${neuPct}% Neutral / ${posPct}% Positive</span>
      </div>
      <div class="dist-bar-track" style="height: 6px; border-radius: 3px; display: flex; overflow: hidden; background-color: var(--bg-tertiary); width: 100%;">
        <div class="dist-slice neg" style="width: ${negPct}%; background-color: var(--neg-color);"></div>
        <div class="dist-slice neu" style="width: ${neuPct}%; background-color: var(--neu-color);"></div>
        <div class="dist-slice pos" style="width: ${posPct}%; background-color: var(--pos-color);"></div>
      </div>
    </div>
    
    <!-- Sentiment Beeswarm Plot -->
    <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%; margin-top: 0.5rem; position: relative;">
      <div style="font-size: 0.7rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Article Sentiment Distribution:</div>
      <div id="spotlight-axis-container" style="position: relative; height: 90px; background: var(--bg-tertiary); border-radius: 16px; border: 1px solid var(--border-color); width: 100%; overflow: visible; display: flex; align-items: center;">
        
        <!-- Track Baseline -->
        <div style="position: absolute; left: 12px; right: 12px; bottom: 18px; height: 2px; background: var(--border-color); z-index: 1;"></div>
        
        <!-- Track labels -->
        <span style="position: absolute; left: 12px; bottom: 4px; font-size: 0.65rem; color: var(--text-secondary); font-weight: 700; opacity: 0.6; pointer-events: none; z-index: 2;">Alarmist (-1.0)</span>
        <span style="position: absolute; left: 50%; transform: translateX(-50%); bottom: 4px; font-size: 0.65rem; color: var(--text-secondary); font-weight: 700; opacity: 0.6; pointer-events: none; z-index: 2;">Neutral (0.0)</span>
        <span style="position: absolute; right: 12px; bottom: 4px; font-size: 0.65rem; color: var(--text-secondary); font-weight: 700; opacity: 0.6; pointer-events: none; z-index: 2;">Positive (+1.0)</span>
        
        <!-- Plot Circles -->
        ${dotsHTML}
      </div>
      <div style="font-size: 0.65rem; color: var(--text-secondary); text-align: center; font-style: italic; opacity: 0.8; margin-top: 0.15rem;">Hover over dots to inspect scores; click a dot to scroll and flash that article card. Stacked dots represent density.</div>
      
      <!-- Custom Tooltip Element -->
      <div id="spotlight-tooltip" class="card" style="position: absolute; display: none; background: var(--bg-primary); border: 1px solid var(--border-color); padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.75rem; box-shadow: var(--card-shadow); z-index: 100; max-width: 250px; pointer-events: none; white-space: normal; transition: left 0.08s ease-out, bottom 0.08s ease-out;"></div>
    </div>
  `;
}

// Custom Tooltip Show/Hide handlers
window.showSpotlightTooltip = function(e, title, score) {
  const tooltip = document.getElementById('spotlight-tooltip');
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
  
  // Position relative to spotlightBanner card (the wrapper containing spotlight-tooltip)
  const banner = elements.spotlightBanner;
  const bannerRect = banner.getBoundingClientRect();
  const dotRect = e.target.getBoundingClientRect();
  
  const left = dotRect.left - bannerRect.left + (dotRect.width / 2);
  const bottom = bannerRect.bottom - dotRect.top + 6; // offset 6px above dot
  
  tooltip.style.left = `${left}px`;
  tooltip.style.bottom = `${bottom}px`;
  tooltip.style.transform = 'translateX(-50%)';
};

window.hideSpotlightTooltip = function() {
  const tooltip = document.getElementById('spotlight-tooltip');
  if (tooltip) tooltip.style.display = 'none';
};

// Scroll to article card and flash highlight border
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

// storage.js — localStorage abstraction for SRS state and user progress

const Storage = (() => {
  const SRS_KEY = 'hanzi_srs';
  const PROGRESS_KEY = 'hanzi_progress';

  // In-memory caches to avoid repeated localStorage reads
  let srsCache = null;
  let progressCache = null;

  const DEFAULT_PROGRESS = {
    streak: { current: 0, longest: 0, lastDate: null },
    daily: {},
    badges: {},
    settings: {
      newPerDay: 25,
      theme: 'system',
      placementDone: false,
      currentIndex: 0,
      audioEnabled: true,
      syncEnabled: false,
      lastSyncTime: null,
      settingsModified: null
    }
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Storage save failed:', e);
    }
  }

  // --- SRS State (with in-memory cache) ---
  function getSRS() {
    if (!srsCache) {
      srsCache = load(SRS_KEY, {});
    }
    return srsCache;
  }

  function saveSRS(srs) {
    srsCache = srs;
    save(SRS_KEY, srs);
  }

  function getCardState(char) {
    return getSRS()[char] || null;
  }

  function saveCardState(char, state) {
    const srs = getSRS();
    srs[char] = state;
    saveSRS(srs);
  }

  // --- Progress (with in-memory cache) ---
  function getProgress() {
    if (!progressCache) {
      progressCache = load(PROGRESS_KEY, { ...DEFAULT_PROGRESS });
    }
    return progressCache;
  }

  function saveProgress(progress) {
    progressCache = progress;
    save(PROGRESS_KEY, progress);
  }

  function getSettings() {
    const p = getProgress();
    return { ...DEFAULT_PROGRESS.settings, ...p.settings };
  }

  function updateSettings(updates) {
    const p = getProgress();
    p.settings = { ...DEFAULT_PROGRESS.settings, ...p.settings, ...updates };
    // Auto-stamp settingsModified for user preference changes (not sync-meta)
    const syncMetaKeys = ['syncEnabled', 'lastSyncTime', 'settingsModified'];
    const hasUserPrefChange = Object.keys(updates).some(k => !syncMetaKeys.includes(k));
    if (hasUserPrefChange) {
      p.settings.settingsModified = new Date().toISOString();
    }
    saveProgress(p);
    return p.settings;
  }

  // --- Streak (with validation) ---
  function updateStreak() {
    const p = getProgress();
    if (!p.streak || typeof p.streak !== 'object') {
      p.streak = { current: 0, longest: 0, lastDate: null };
    }
    // Validate numeric fields
    if (!Number.isInteger(p.streak.current)) p.streak.current = 0;
    if (!Number.isInteger(p.streak.longest)) p.streak.longest = 0;

    const today = new Date().toISOString().slice(0, 10);

    if (p.streak.lastDate === today) return p.streak;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (p.streak.lastDate === yesterday) {
      p.streak.current += 1;
    } else {
      p.streak.current = 1;
    }
    p.streak.lastDate = today;
    if (p.streak.current > p.streak.longest) {
      p.streak.longest = p.streak.current;
    }
    saveProgress(p);
    return p.streak;
  }

  // --- Daily Stats ---
  function ensureDailyEntry(p, date) {
    if (!p.daily[date] || typeof p.daily[date] !== 'object') {
      p.daily[date] = { reviews: 0, newCards: 0, correct: 0, timeMs: 0 };
    }
    const d = p.daily[date];
    if (!Number.isFinite(d.reviews)) d.reviews = 0;
    if (!Number.isFinite(d.newCards)) d.newCards = 0;
    if (!Number.isFinite(d.correct)) d.correct = 0;
    if (!Number.isFinite(d.timeMs)) d.timeMs = 0;
  }

  function recordDailyReview(correct) {
    const p = getProgress();
    const today = new Date().toISOString().slice(0, 10);
    ensureDailyEntry(p, today);
    p.daily[today].reviews += 1;
    if (correct) p.daily[today].correct += 1;
    saveProgress(p);
  }

  function recordNewCard() {
    const p = getProgress();
    const today = new Date().toISOString().slice(0, 10);
    ensureDailyEntry(p, today);
    p.daily[today].newCards += 1;
    saveProgress(p);
  }

  function getDailyStats(date) {
    const p = getProgress();
    const key = date || new Date().toISOString().slice(0, 10);
    return p.daily[key] || { reviews: 0, newCards: 0, correct: 0, timeMs: 0 };
  }

  // --- Export/Import (with validation) ---
  function exportData() {
    return JSON.stringify({
      srs: getSRS(),
      progress: getProgress(),
      exportDate: new Date().toISOString()
    }, null, 2);
  }

  function validateSRS(srs) {
    if (!srs || typeof srs !== 'object' || Array.isArray(srs)) return false;
    for (const [char, state] of Object.entries(srs)) {
      if (typeof char !== 'string' || char.length === 0) return false;
      if (!state || typeof state !== 'object') return false;
      if (typeof state.state !== 'number' || state.state < 0 || state.state > 3) return false;
      if (typeof state.reps !== 'number') return false;
    }
    return true;
  }

  function validateProgress(prog) {
    if (!prog || typeof prog !== 'object' || Array.isArray(prog)) return false;
    if (prog.streak && typeof prog.streak !== 'object') return false;
    if (prog.daily && typeof prog.daily !== 'object') return false;
    if (prog.settings && typeof prog.settings !== 'object') return false;
    if (prog.badges && (typeof prog.badges !== 'object' || Array.isArray(prog.badges))) return false;
    return true;
  }

  function importData(json) {
    const data = JSON.parse(json);
    if (data.srs) {
      if (!validateSRS(data.srs)) throw new Error('Invalid SRS data');
      saveSRS(data.srs);
    }
    if (data.progress) {
      if (!validateProgress(data.progress)) throw new Error('Invalid progress data');
      saveProgress(data.progress);
    }
    return true;
  }

  // --- Reading Practice ---
  function addReadingFlag(char) {
    const p = getProgress();
    if (!Array.isArray(p.readingFlags)) p.readingFlags = [];
    if (!p.readingFlags.includes(char)) {
      p.readingFlags.push(char);
      saveProgress(p);
    }
  }

  function consumeReadingFlags() {
    const p = getProgress();
    const flags = p.readingFlags || [];
    p.readingFlags = [];
    saveProgress(p);
    return flags;
  }

  function recordSnippetRead(snippetId) {
    const p = getProgress();
    const today = new Date().toISOString().slice(0, 10);
    ensureDailyEntry(p, today);
    if (!Number.isFinite(p.daily[today].snippetsRead)) p.daily[today].snippetsRead = 0;
    p.daily[today].snippetsRead += 1;
    if (!p.readHistory) p.readHistory = {};
    if (snippetId) p.readHistory[snippetId] = today;
    saveProgress(p);
  }

  function getReadHistory() {
    return getProgress().readHistory || {};
  }

  function clearAll() {
    srsCache = null;
    progressCache = null;
    localStorage.removeItem(SRS_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  }

  return {
    getSRS, saveSRS, getCardState, saveCardState,
    getProgress, saveProgress,
    getSettings, updateSettings,
    updateStreak, recordDailyReview, recordNewCard, getDailyStats,
    addReadingFlag, consumeReadingFlags, recordSnippetRead, getReadHistory,
    validateSRS, validateProgress,
    exportData, importData, clearAll
  };
})();

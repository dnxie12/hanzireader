// storage.js — localStorage abstraction for SRS state and user progress

const Storage = (() => {
  const SRS_KEY = 'hanzi_srs';
  const PROGRESS_KEY = 'hanzi_progress';

  const DEFAULT_PROGRESS = {
    streak: { current: 0, longest: 0, lastDate: null },
    daily: {},
    settings: {
      newPerDay: 25,
      theme: 'system',
      placementDone: false,
      currentIndex: 0
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

  // --- SRS State ---
  function getSRS() {
    return load(SRS_KEY, {});
  }

  function saveSRS(srs) {
    save(SRS_KEY, srs);
  }

  function getCardState(char) {
    const srs = getSRS();
    return srs[char] || null;
  }

  function saveCardState(char, state) {
    const srs = getSRS();
    srs[char] = state;
    saveSRS(srs);
  }

  // --- Progress ---
  function getProgress() {
    return load(PROGRESS_KEY, { ...DEFAULT_PROGRESS });
  }

  function saveProgress(progress) {
    save(PROGRESS_KEY, progress);
  }

  function getSettings() {
    const p = getProgress();
    return { ...DEFAULT_PROGRESS.settings, ...p.settings };
  }

  function updateSettings(updates) {
    const p = getProgress();
    p.settings = { ...DEFAULT_PROGRESS.settings, ...p.settings, ...updates };
    saveProgress(p);
    return p.settings;
  }

  // --- Streak ---
  function updateStreak() {
    const p = getProgress();
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
  function recordDailyReview(correct) {
    const p = getProgress();
    const today = new Date().toISOString().slice(0, 10);
    if (!p.daily[today]) {
      p.daily[today] = { reviews: 0, newCards: 0, correct: 0, timeMs: 0 };
    }
    p.daily[today].reviews += 1;
    if (correct) p.daily[today].correct += 1;
    saveProgress(p);
  }

  function recordNewCard() {
    const p = getProgress();
    const today = new Date().toISOString().slice(0, 10);
    if (!p.daily[today]) {
      p.daily[today] = { reviews: 0, newCards: 0, correct: 0, timeMs: 0 };
    }
    p.daily[today].newCards += 1;
    saveProgress(p);
  }

  function getDailyStats(date) {
    const p = getProgress();
    const key = date || new Date().toISOString().slice(0, 10);
    return p.daily[key] || { reviews: 0, newCards: 0, correct: 0, timeMs: 0 };
  }

  // --- Export/Import ---
  function exportData() {
    return JSON.stringify({
      srs: getSRS(),
      progress: getProgress(),
      exportDate: new Date().toISOString()
    }, null, 2);
  }

  function importData(json) {
    const data = JSON.parse(json);
    if (data.srs) saveSRS(data.srs);
    if (data.progress) saveProgress(data.progress);
    return true;
  }

  function clearAll() {
    localStorage.removeItem(SRS_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  }

  return {
    getSRS, saveSRS, getCardState, saveCardState,
    getProgress, saveProgress,
    getSettings, updateSettings,
    updateStreak, recordDailyReview, recordNewCard, getDailyStats,
    exportData, importData, clearAll
  };
})();

// audio.js — Audio playback for character pronunciation

const Audio_ = (() => {
  let audioEl = null;
  let ttsAvailable = null; // null = unchecked, true/false after check
  let currentResolve = null; // tracks in-flight playback promise

  function getAudioEl() {
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.preload = 'none';
    }
    return audioEl;
  }

  // Play audio file for a Chinese character
  function playFile(char) {
    if (!char) return Promise.resolve(false);

    const el = getAudioEl();

    // Cancel any in-flight playback and resolve its promise
    if (currentResolve) {
      el.pause();
      el.removeAttribute('src');
      currentResolve(false);
      currentResolve = null;
    }

    return new Promise(resolve => {
      currentResolve = resolve;
      let settled = false;
      const settle = (val) => {
        if (!settled) {
          settled = true;
          currentResolve = null;
          resolve(val);
        }
      };

      el.onended = () => settle(true);
      el.onerror = () => settle(false);
      el.src = `audio/${encodeURIComponent(char)}.mp3`;
      el.play().catch(() => settle(false));

      // Timeout: if neither onended nor onerror fires within 5s, give up
      setTimeout(() => settle(false), 5000);
    });
  }

  // Web Speech API fallback
  function playTTS(char) {
    if (!('speechSynthesis' in window)) return false;

    // Check for Chinese voice availability (re-check each time if uncached)
    if (ttsAvailable === null) {
      const voices = speechSynthesis.getVoices();
      if (voices.length === 0) return false; // voices not loaded yet, don't cache
      ttsAvailable = voices.some(v => v.lang.startsWith('zh'));
    }
    if (!ttsAvailable) return false;

    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(char);
    utter.lang = 'zh-CN';
    utter.rate = 0.8;
    speechSynthesis.speak(utter);
    return true;
  }

  // Play pronunciation for a character
  async function playChar(char) {
    if (!isEnabled()) return;
    if (!char || !window.CHAR_DATA || !window.CHAR_DATA[char]) return;

    const played = await playFile(char);
    if (!played) {
      const ttsFallback = playTTS(char);
      if (!ttsFallback) {
        UI.toast('Audio not available');
      }
    }
  }

  function isEnabled() {
    const settings = Storage.getSettings();
    return settings.audioEnabled !== false; // default to true
  }

  function setEnabled(enabled) {
    Storage.updateSettings({ audioEnabled: enabled });
  }

  // Pre-warm TTS voice list (called on init)
  function init() {
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices(); // triggers async voice loading
      speechSynthesis.addEventListener('voiceschanged', () => {
        ttsAvailable = null; // reset cache to re-check
      });
    }
  }

  // Generate audio button HTML (speaker icon via inline SVG)
  function buttonHTML(char, { className = 'audio-btn', size = 20 } = {}) {
    const safeSize = parseInt(size) || 20;
    return `<button class="${UI.esc(className)}" data-audio-char="${UI.esc(char)}" aria-label="Play pronunciation" title="Play pronunciation">
      <svg width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    </button>`;
  }

  // Attach click handlers to all audio buttons within a container
  function attachButtons(container) {
    if (!container) return;
    container.querySelectorAll('[data-audio-char]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const char = btn.dataset.audioChar;
        if (char) playChar(char);
      });
    });
  }

  return { playChar, isEnabled, setEnabled, init, buttonHTML, attachButtons };
})();

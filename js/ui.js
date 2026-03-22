// ui.js — Shared UI utilities: tone colors, pinyin rendering, modals

const UI = (() => {

  // HTML escape to prevent XSS from data injection
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Map tone marks to tone numbers
  const TONE_MAP = {
    'ā': 1, 'á': 1, 'ǎ': 1, 'à': 1,  // Using position-based detection instead
    'ē': 1, 'é': 2, 'ě': 3, 'è': 4,
    'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4,
    'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4,
    'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4,
    'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
  };

  // Correct tone detection from pinyin with tone marks
  function getTone(pinyin) {
    if (!pinyin) return 5;
    // Check each character for tone marks
    for (const ch of pinyin) {
      // Tone 1: macron (̄)
      if ('āēīōūǖ'.includes(ch)) return 1;
      // Tone 2: acute (́)
      if ('áéíóúǘ'.includes(ch)) return 2;
      // Tone 3: caron (̌)
      if ('ǎěǐǒǔǚ'.includes(ch)) return 3;
      // Tone 4: grave (̀)
      if ('àèìòùǜ'.includes(ch)) return 4;
    }
    return 5; // neutral tone
  }

  // Render pinyin with tone color
  function renderPinyin(pinyin, { tag = 'span', className = 'pinyin' } = {}) {
    if (!pinyin) return '';
    const tone = getTone(pinyin);
    return `<span class="${esc(className)} tone-${tone}">${esc(pinyin)}</span>`;
  }

  // Render compound pinyin (may have multiple syllables with different tones)
  function renderCompoundPinyin(pinyin) {
    if (!pinyin) return '';
    // Split by syllables (space-separated or camelCase-ish)
    // CC-CEDICT format is usually space-separated or run-together with tone marks
    const syllables = pinyin.split(/(?<=[\u0101-\u01DC\u00E0-\u00FC])/);
    // Simple approach: color the whole compound by its first tone
    const tone = getTone(pinyin);
    return `<span class="compound-pinyin tone-${tone}">${esc(pinyin)}</span>`;
  }

  // Render a list of compound words
  function renderCompounds(compounds) {
    if (!compounds || compounds.length === 0) return '';
    return compounds.map(([chars, pinyin, def]) => `
      <div class="modal-compound">
        <span class="cw-chars">${esc(chars)}</span>
        ${renderPinyin(pinyin, { className: 'cw-pinyin' })}
        <span class="cw-def">${esc(def)}</span>
      </div>
    `).join('');
  }

  // Show the detail modal for a character
  function showCharModal(char) {
    const info = Data.getChar(char);
    if (!info) return;

    const modal = document.getElementById('detail-modal');
    const content = modal.querySelector('.modal-content');

    const srsState = Storage.getCardState(char);
    let stateLabel = 'New';
    if (srsState) {
      const states = ['New', 'Learning', 'Review', 'Relearning'];
      stateLabel = states[srsState.state] || 'New';
    }

    content.innerHTML = `
      <div class="modal-header">
        <div class="modal-char-info">
          <div class="modal-char">${esc(char)}</div>
          <div class="modal-basics">
            <h2>${renderPinyin(info.p)}</h2>
            <p>${esc(info.d)}</p>
          </div>
        </div>
        <button class="modal-close" aria-label="Close">&times;</button>
      </div>

      <div class="modal-section">
        <h3>Details</h3>
        <div class="modal-meta">
          <span class="meta-tag">Radical: ${esc(info.r)}</span>
          <span class="meta-tag">Strokes: ${esc(info.s)}</span>
          <span class="meta-tag">Freq: #${esc(info.f)}</span>
          <span class="meta-tag">Status: ${stateLabel}</span>
          <span class="meta-tag">${(info.h || 0) > 0 ? 'HSK ' + esc(info.h) : 'Beyond HSK'}</span>
        </div>
      </div>

      ${info.eh ? `
      <div class="modal-section">
        <h3>Etymology</h3>
        <p class="etymology-text">${esc(info.eh)}</p>
      </div>
      ` : ''}

      ${info.dc ? `
      <div class="modal-section">
        <h3>Decomposition</h3>
        <p class="etymology-text" style="font-size: 24px; font-family: 'PingFang SC', sans-serif;">${esc(info.dc)}</p>
      </div>
      ` : ''}

      ${info.cw && info.cw.length > 0 ? `
      <div class="modal-section">
        <h3>Compound Words</h3>
        <div class="modal-compounds">
          ${renderCompounds(info.cw)}
        </div>
      </div>
      ` : ''}
    `;

    modal.classList.add('active');

    const close = content.querySelector('.modal-close');
    close.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  // Simple toast notification
  function toast(msg, duration = 2000) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = `
        position: fixed; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
        background: var(--text-primary); color: var(--bg-primary);
        padding: 10px 20px; border-radius: 8px; font-size: 14px;
        z-index: 300; opacity: 0; transition: opacity 0.2s;
        pointer-events: none;
      `;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, duration);
  }

  return {
    esc, getTone, renderPinyin, renderCompoundPinyin, renderCompounds,
    showCharModal, toast
  };
})();

// placement.js — First-launch proficiency test using snippets

const Placement = (() => {
  let testSnippets = [];
  let currentIdx = 0;
  let unknownChars = new Set();
  let knownCharsPerSnippet = [];
  let lastPassedDiff = 0;
  let touchStartY = 0;

  function shouldShow() {
    return Storage.getSettings().placementDone === false &&
           Object.keys(Storage.getSRS()).length === 0;
  }

  function start() {
    testSnippets = buildTestSequence();
    currentIdx = 0;
    unknownChars = new Set();
    knownCharsPerSnippet = [];
    lastPassedDiff = 0;

    if (testSnippets.length === 0) {
      skip();
      return;
    }

    const el = document.getElementById('screen-placement');
    el.classList.add('active');
    Analytics.track('placement-start');
    renderIntro();
  }

  function skip() {
    Storage.updateSettings({ placementDone: true });
    Analytics.track('placement-skip');
    hide();
    App.finishInit();
  }

  function hide() {
    const el = document.getElementById('screen-placement');
    el.classList.remove('active');
    el.innerHTML = '';
  }

  // --- Snippet selection: 2 per difficulty level ---
  function buildTestSequence() {
    const snippets = window.SNIPPET_DATA || [];
    const byDiff = { 1: [], 2: [], 3: [], 4: [] };
    for (const s of snippets) {
      if (byDiff[s.staticDiff]) byDiff[s.staticDiff].push(s);
    }

    const sequence = [];
    for (const diff of [1, 2, 3, 4]) {
      const pool = byDiff[diff].slice();
      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      // Pick 2 with topic diversity
      const picked = [];
      const usedTopics = new Set();
      for (const s of pool) {
        if (picked.length >= 2) break;
        if (picked.length === 0 || !usedTopics.has(s.topic)) {
          picked.push(s);
          usedTopics.add(s.topic);
        }
      }
      // Fill if needed
      for (const s of pool) {
        if (picked.length >= 2) break;
        if (!picked.includes(s)) picked.push(s);
      }
      sequence.push(...picked);
    }
    return sequence;
  }

  // --- Intro screen ---
  function renderIntro() {
    const el = document.getElementById('screen-placement');
    el.innerHTML = `
      <div class="placement-intro">
        <div class="placement-intro-icon">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="var(--accent)" stroke-width="1.5">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h1 class="placement-intro-title">Hanzi Reader</h1>
        <h2 class="placement-intro-subtitle">Find Your Level</h2>
        <p class="placement-intro-body">
          We'll show you short Chinese passages. Tap any characters you <strong>don't</strong> recognize.
        </p>
        <p class="placement-intro-body" style="color:var(--text-muted);font-size:14px;">
          Takes about 2 minutes. Characters you know will be added to your review deck automatically.
        </p>
        <button class="btn-primary" id="placement-start-btn" style="max-width:320px;">Start Placement Test</button>
        <button class="btn-secondary" id="placement-skip-btn" style="margin-top:8px;max-width:320px;">Skip — I'm starting fresh</button>
      </div>
    `;

    document.getElementById('placement-start-btn').addEventListener('click', () => {
      renderSnippet(testSnippets[currentIdx]);
    });
    document.getElementById('placement-skip-btn').addEventListener('click', skip);
  }

  // --- Snippet rendering (inverted: tap = unknown) ---
  function renderSnippet(snippet) {
    const el = document.getElementById('screen-placement');
    unknownChars = new Set();

    const total = testSnippets.length;

    // Render all CJK chars neutrally (no SRS color-coding)
    const passageHtml = [...snippet.text].map(ch => {
      if (window.CHAR_DATA && window.CHAR_DATA[ch]) {
        return `<span class="read-char" data-char="${UI.esc(ch)}">${UI.esc(ch)}</span>`;
      }
      return `<span class="read-punct">${UI.esc(ch)}</span>`;
    }).join('');

    el.innerHTML = `
      <p class="placement-instruction">
        <span>${currentIdx + 1} / ${total}</span>
        <span>Tap characters you <strong>don't</strong> recognize</span>
      </p>
      <div class="read-passage-container">
        <p class="read-passage">${passageHtml}</p>
      </div>
      <p class="placement-unknown-count" id="placement-count"></p>
      <div class="placement-actions">
        <button class="btn-primary" id="placement-continue-btn">Continue</button>
      </div>
    `;

    updateUnknownCount();

    // Touch handling (same scroll-vs-tap as read.js)
    const passage = el.querySelector('.read-passage');

    passage.addEventListener('touchstart', e => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    passage.addEventListener('touchend', e => {
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dy > 8) return;
      const span = e.target.closest('.read-char');
      if (span) {
        e.preventDefault();
        handleCharTap(span.dataset.char);
      }
    });

    passage.addEventListener('click', e => {
      const span = e.target.closest('.read-char');
      if (span) handleCharTap(span.dataset.char);
    });

    document.getElementById('placement-continue-btn').addEventListener('click', advance);
  }

  function handleCharTap(char) {
    if (unknownChars.has(char)) {
      unknownChars.delete(char);
    } else {
      unknownChars.add(char);
    }
    // Toggle all instances of this character
    document.querySelectorAll(`.read-char[data-char="${CSS.escape(char)}"]`)
      .forEach(s => s.classList.toggle('placement-unknown', unknownChars.has(char)));
    updateUnknownCount();
  }

  function updateUnknownCount() {
    const countEl = document.getElementById('placement-count');
    if (!countEl) return;
    const n = unknownChars.size;
    countEl.textContent = n === 0 ? 'No characters marked — you know them all!' : `${n} marked unknown`;
  }

  // --- Advance to next snippet or complete ---
  function advance() {
    const snippet = testSnippets[currentIdx];
    const cjkChars = snippet.chars;

    // Compute ratio for this snippet
    const unknownInSnippet = cjkChars.filter(c => unknownChars.has(c));
    const unknownRatio = cjkChars.length > 0 ? unknownInSnippet.length / cjkChars.length : 0;

    // Track known chars for this snippet
    const knownInSnippet = new Set(cjkChars.filter(c => !unknownChars.has(c)));
    knownCharsPerSnippet.push(knownInSnippet);

    if (unknownRatio > 0.30) {
      // Failed this snippet — show brief transition before results
      lastPassedDiff = currentIdx > 0 ? testSnippets[currentIdx - 1].staticDiff : 0;
      showTransition();
      return;
    }

    lastPassedDiff = snippet.staticDiff;
    currentIdx++;

    if (currentIdx >= testSnippets.length) {
      complete();
    } else {
      renderSnippet(testSnippets[currentIdx]);
    }
  }

  // --- Transition before results ---
  function showTransition() {
    const el = document.getElementById('screen-placement');
    el.innerHTML = `
      <div class="placement-intro fade-in">
        <h2 style="font-size:22px;color:var(--text-primary);">Finding your level...</h2>
        <p style="color:var(--text-muted);font-size:15px;">Based on your results</p>
      </div>
    `;
    setTimeout(() => complete(), 1200);
  }

  // --- Autolearn and finish ---
  function complete() {
    // Build set of all chars marked unknown across ANY snippet
    const allUnknown = new Set();
    for (let i = 0; i < knownCharsPerSnippet.length; i++) {
      const snippet = testSnippets[i];
      for (const c of snippet.chars) {
        if (!knownCharsPerSnippet[i].has(c)) allUnknown.add(c);
      }
    }

    // Final known = union of per-snippet known, minus anything ever marked unknown
    const finalKnown = new Set();
    for (const charSet of knownCharsPerSnippet) {
      for (const c of charSet) {
        if (!allUnknown.has(c)) finalKnown.add(c);
      }
    }

    // For diff 1-2, bulk-autolearn all LEARN_ORDER chars up to the tier boundary.
    // If someone reads beginner/intermediate passages fluently, they know the
    // foundational characters even if they didn't appear in the test snippets.
    const learnOrder = window.LEARN_ORDER || [];
    let cutoff = 0;
    if (lastPassedDiff >= 2) cutoff = 500;
    else if (lastPassedDiff >= 1) cutoff = 200;
    if (cutoff > 0) {
      for (let i = 0; i < Math.min(cutoff, learnOrder.length); i++) {
        const c = learnOrder[i];
        if (!allUnknown.has(c)) finalKnown.add(c);
      }
    }

    // Autolearn: batch all cards into SRS cache, then write once.
    // All placement-confirmed chars get a 180-day interval — these are
    // characters the user already knows well, no need for near-term review.
    const now = new Date();
    const srs = Storage.getSRS();
    const knownArray = [...finalKnown];
    let autoLearnCount = 0;

    for (const char of knownArray) {
      if (!srs[char]) {
        srs[char] = buildAutoLearnCard(now, 180);
        autoLearnCount++;
      }
    }

    Storage.saveSRS(srs);

    const levelLabels = { 0: 'Beginner', 1: 'Elementary', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };
    const level = levelLabels[lastPassedDiff] || 'Beginner';

    Storage.updateSettings({ placementDone: true });
    Analytics.track('placement-complete', { level, charsAdded: autoLearnCount });

    renderSummary(autoLearnCount, level);
  }

  function buildAutoLearnCard(now, daysOffset) {
    const dueDate = new Date(now.getTime() + daysOffset * 86400000);
    return {
      due: dueDate.toISOString(),
      stability: daysOffset,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: daysOffset,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: now.toISOString()
    };
  }

  // --- Summary screen ---
  function renderSummary(autoLearnCount, level) {
    const el = document.getElementById('screen-placement');
    el.innerHTML = `
      <div class="summary-container fade-in" style="padding-top:60px;">
        <h2>You're all set!</h2>
        <div class="summary-stats" style="margin-top:24px;">
          <div class="summary-stat">
            <div class="value">${autoLearnCount}</div>
            <div class="label">Characters Added</div>
          </div>
          <div class="summary-stat">
            <div class="value">${level}</div>
            <div class="label">Level</div>
          </div>
        </div>
        ${autoLearnCount > 0 ? `
        <p style="color:var(--text-secondary);font-size:14px;margin-top:20px;text-align:center;line-height:1.5;">
          ${autoLearnCount} characters have been added to your review deck.
          They'll appear for review over the coming months.
        </p>
        ` : `
        <p style="color:var(--text-secondary);font-size:14px;margin-top:20px;text-align:center;line-height:1.5;">
          No worries — you'll start learning from the most common characters.
        </p>
        `}
        <button class="btn-primary" id="placement-done-btn" style="margin-top:24px;">Start Studying</button>
      </div>
    `;

    document.getElementById('placement-done-btn').addEventListener('click', () => {
      hide();
      App.finishInit();
    });
  }

  return { shouldShow, start, skip };
})();

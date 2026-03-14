// read.js — Reading practice screen: snippet list, reading view, tap-to-lookup

const Read = (() => {
  let currentSnippet = null;
  let sessionSnippets = [];
  let sessionIndex = 0;
  let flaggedChars = new Set();
  let lookedUpChars = new Set();
  let sessionStats = { snippetsRead: 0, charsEncountered: 0, lookups: 0, startTime: 0 };
  let touchStartY = 0;

  // --- User Profile (computed once per session) ---
  function buildUserProfile() {
    const srs = Storage.getSRS();
    const now = new Date();
    const known = new Set();
    const fragile = new Set();
    const learning = new Set();
    const dueSet = new Set();
    const nearDue = new Set();

    for (const [char, card] of Object.entries(srs)) {
      const due = new Date(card.due);
      if (card.state === 2) {
        known.add(char);
        if (due <= now) {
          dueSet.add(char);
          fragile.add(char);
        } else if (due - now < 86400000) {
          nearDue.add(char);
        }
      } else if (card.state === 3) {
        fragile.add(char);
      } else if (card.state === 1) {
        learning.add(char);
      }
    }

    return { known, fragile, learning, dueSet, nearDue };
  }

  // --- Coverage Analysis ---
  function analyzeSnippetCoverage(snippet, profile) {
    let knownCount = 0;
    let dueCount = 0;
    let unknownInSet = 0;
    let foreignCount = 0;

    for (const ch of snippet.chars) {
      if (profile.known.has(ch) || profile.fragile.has(ch)) {
        knownCount++;
        if (profile.dueSet.has(ch)) dueCount++;
      } else if (profile.learning.has(ch)) {
        knownCount++;
      } else if (window.CHAR_DATA[ch]) {
        unknownInSet++;
      } else {
        foreignCount++;
      }
    }

    const effectiveTotal = snippet.chars.length - foreignCount;
    const coverageRatio = effectiveTotal > 0 ? knownCount / effectiveTotal : 0;

    return { knownCount, dueCount, unknownInSet, foreignCount, coverageRatio, effectiveTotal };
  }

  // --- Scoring Function ---
  function scoreSnippet(snippet, profile, recentlyRead) {
    const cov = analyzeSnippetCoverage(snippet, profile);

    // Hard gates
    if (cov.coverageRatio < 0.75) return -Infinity;
    const avgUnknownPerSentence = cov.unknownInSet / (snippet.sentenceCount || 1);
    if (avgUnknownPerSentence > 2.5) return -Infinity;

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    if (recentlyRead[snippet.id] && recentlyRead[snippet.id] >= sevenDaysAgo) return -Infinity;

    // Coverage score (peak at 0.90)
    let coverageScore;
    if (cov.coverageRatio < 0.85) {
      coverageScore = 0.5 + (cov.coverageRatio - 0.75) * 3.5;
    } else if (cov.coverageRatio <= 0.95) {
      coverageScore = 1.0 - Math.abs(cov.coverageRatio - 0.90) * 1.5;
    } else {
      coverageScore = Math.max(0.5, 1.0 - (cov.coverageRatio - 0.95) * 10.0);
    }

    // Reinforcement score
    const nearDueCount = snippet.chars.filter(c => profile.nearDue.has(c)).length;
    const reinforcementRaw = cov.dueCount * 2 + nearDueCount;
    const reinforcementScore = Math.min(1.0, reinforcementRaw / 5);

    // i+1 stretch score
    let stretchScore;
    if (cov.unknownInSet === 0) stretchScore = 0.5;
    else if (cov.unknownInSet <= 2) stretchScore = 1.0;
    else if (cov.unknownInSet <= 4) stretchScore = 0.75;
    else stretchScore = Math.max(0, 1.0 - (cov.unknownInSet - 4) * 0.15);

    // Diversity score (unique radicals)
    const uniqueRadicals = new Set(
      snippet.chars
        .filter(c => profile.known.has(c))
        .map(c => window.CHAR_DATA[c]?.r)
        .filter(Boolean)
    ).size;
    const diversityScore = Math.min(1.0, uniqueRadicals / 6);

    // Freshness score
    const lastRead = recentlyRead[snippet.id];
    let freshnessScore = 1.0;
    if (lastRead) {
      const daysSince = (Date.now() - new Date(lastRead).getTime()) / 86400000;
      freshnessScore = Math.min(1.0, Math.max(0, (daysSince - 7) / 23));
    }

    return 0.30 * coverageScore +
           0.35 * reinforcementScore +
           0.20 * stretchScore +
           0.10 * diversityScore +
           0.05 * freshnessScore;
  }

  // --- Session Selection ---
  function selectSessionSnippets(profile, count) {
    count = count || 5;
    const recentlyRead = Storage.getReadHistory();
    const snippets = (window.SNIPPET_DATA || []);

    const scored = snippets
      .map(s => ({ snippet: s, score: scoreSnippet(s, profile, recentlyRead) }))
      .filter(s => s.score > -Infinity)
      .sort((a, b) => b.score - a.score);

    // Topic diversity selection
    const selected = [];
    const usedTopics = new Set();

    for (const { snippet } of scored) {
      if (selected.length >= count) break;
      if (!usedTopics.has(snippet.topic) || usedTopics.size >= 4) {
        selected.push(snippet);
        usedTopics.add(snippet.topic);
      }
    }

    // Fill remainder greedily
    if (selected.length < count) {
      for (const { snippet } of scored) {
        if (selected.length >= count) break;
        if (!selected.includes(snippet)) selected.push(snippet);
      }
    }

    return selected;
  }

  // --- Classify character for rendering ---
  function classifyChar(char) {
    const state = Storage.getCardState(char);
    if (!state) return 'unseen';
    if (state.state === 2 || state.state === 3) return 'known';
    return 'learning';
  }

  // --- Render snippet list ---
  function render() {
    currentSnippet = null;
    sessionSnippets = [];
    sessionIndex = 0;
    flaggedChars = new Set();
    lookedUpChars = new Set();
    sessionStats = { snippetsRead: 0, charsEncountered: 0, lookups: 0, startTime: Date.now() };

    const el = document.getElementById('screen-read');
    const profile = buildUserProfile();
    const knownCount = profile.known.size + profile.fragile.size + profile.learning.size;

    if (knownCount < 20 || !window.SNIPPET_DATA || window.SNIPPET_DATA.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <h3>Keep studying to unlock reading practice</h3>
          <p>You need to learn at least 20 characters. Currently known: ${knownCount} characters.</p>
          <button class="btn-primary" onclick="App.navigate('study')" style="max-width:280px;">Go Study</button>
        </div>
      `;
      return;
    }

    const recentlyRead = Storage.getReadHistory();
    const allSnippets = (window.SNIPPET_DATA || []).map(s => {
      const cov = analyzeSnippetCoverage(s, profile);
      return { ...s, pctKnown: Math.round(cov.coverageRatio * 100) };
    });

    // Group by difficulty
    const groups = { 1: [], 2: [], 3: [], 4: [] };
    for (const s of allSnippets) {
      groups[s.staticDiff] = groups[s.staticDiff] || [];
      groups[s.staticDiff].push(s);
    }

    const groupLabels = { 1: 'BEGINNER', 2: 'INTERMEDIATE', 3: 'ADVANCED', 4: 'EXPERT' };
    let html = `<div class="read-header"><h2>Reading Practice</h2></div>`;

    // Start session button
    const sessionSnippetsPreview = selectSessionSnippets(profile);
    if (sessionSnippetsPreview.length > 0) {
      html += `<button class="btn-primary" id="read-start-btn">Start Session (${sessionSnippetsPreview.length} passages)</button>`;
    }

    for (const diff of [1, 2, 3, 4]) {
      const group = groups[diff];
      if (!group || group.length === 0) continue;

      // Sort: highest coverage first
      group.sort((a, b) => b.pctKnown - a.pctKnown);

      html += `<div class="read-group"><h3 class="read-group-label">${groupLabels[diff]}</h3>`;

      for (const s of group) {
        const isRead = !!recentlyRead[s.id];
        const isLocked = s.pctKnown < 60;
        const preview = s.text.slice(0, 30) + (s.text.length > 30 ? '…' : '');

        html += `
          <div class="snippet-card${isLocked ? ' locked' : ''}" data-id="${UI.esc(s.id)}">
            <div class="snippet-preview">${UI.esc(preview)}</div>
            <div class="snippet-meta">
              <div class="snippet-coverage-bar">
                <div class="snippet-coverage-fill" style="width:${s.pctKnown}%;${s.pctKnown >= 75 ? 'background:var(--state-review);' : s.pctKnown >= 60 ? 'background:var(--state-learning);' : 'background:var(--state-relearning);'}"></div>
              </div>
              <span>${s.pctKnown}%</span>
              <span>${UI.esc(s.topic)}</span>
              ${isRead ? '<span style="color:var(--state-review);">&#10003;</span>' : ''}
            </div>
          </div>
        `;
      }

      html += `</div>`;
    }

    el.innerHTML = html;

    // Start session button
    const startBtn = document.getElementById('read-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        sessionSnippets = selectSessionSnippets(profile);
        sessionIndex = 0;
        sessionStats = { snippetsRead: 0, charsEncountered: 0, lookups: 0, startTime: Date.now() };
        openSnippet(sessionSnippets[0]);
      });
    }

    // Individual snippet tap
    el.querySelectorAll('.snippet-card:not(.locked)').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const snippet = (window.SNIPPET_DATA || []).find(s => s.id === id);
        if (snippet) {
          sessionSnippets = [snippet];
          sessionIndex = 0;
          openSnippet(snippet);
        }
      });
    });
  }

  // --- Reading View ---
  function openSnippet(snippet) {
    currentSnippet = snippet;
    flaggedChars = new Set();
    lookedUpChars = new Set();
    renderPassage();
  }

  function renderPassage() {
    const el = document.getElementById('screen-read');
    const snippet = currentSnippet;
    const inSession = sessionSnippets.length > 1;
    const progress = inSession ? `${sessionIndex + 1} / ${sessionSnippets.length}` : '';

    // Render passage text with per-character spans
    const passageHtml = [...snippet.text].map(ch => {
      if (window.CHAR_DATA[ch]) {
        const cls = classifyChar(ch);
        return `<span class="read-char ${cls}" data-char="${UI.esc(ch)}">${UI.esc(ch)}</span>`;
      }
      return `<span class="read-punct">${UI.esc(ch)}</span>`;
    }).join('');

    el.innerHTML = `
      <div class="read-nav">
        <button class="btn-secondary read-back-btn" style="padding:6px 12px;">← Back</button>
        ${progress ? `<span class="read-progress-label">${progress}</span>` : ''}
        <span class="read-topic-label">${UI.esc(snippet.topic)}</span>
      </div>
      <div class="read-passage-container">
        <p class="read-passage">${passageHtml}</p>
      </div>
      <div id="read-tooltip"></div>
      <div class="read-actions">
        ${inSession && sessionIndex < sessionSnippets.length - 1
          ? '<button class="btn-primary read-next-btn">Next Passage</button>'
          : '<button class="btn-primary read-done-btn">Done</button>'
        }
      </div>
    `;

    // Event: back button
    el.querySelector('.read-back-btn').addEventListener('click', render);

    // Event: next/done button
    const nextBtn = el.querySelector('.read-next-btn');
    const doneBtn = el.querySelector('.read-done-btn');

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        recordSnippetComplete();
        sessionIndex++;
        if (sessionIndex < sessionSnippets.length) {
          openSnippet(sessionSnippets[sessionIndex]);
        } else {
          showSummary();
        }
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        recordSnippetComplete();
        if (sessionSnippets.length > 1) {
          showSummary();
        } else {
          render();
        }
      });
    }

    // Event: character tap (touch-aware)
    const passage = el.querySelector('.read-passage');

    passage.addEventListener('touchstart', e => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    passage.addEventListener('touchend', e => {
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dy > 8) return; // was a scroll
      const span = e.target.closest('.read-char');
      if (span) {
        e.preventDefault();
        showTooltip(span);
      }
    });

    // Also handle click for desktop
    passage.addEventListener('click', e => {
      const span = e.target.closest('.read-char');
      if (span) showTooltip(span);
    });

    // Dismiss tooltip on outside click
    document.addEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(e) {
    if (!e.target.closest('#read-tooltip') && !e.target.closest('.read-char')) {
      hideTooltip();
    }
  }

  // --- Tooltip ---
  function showTooltip(spanEl) {
    const char = spanEl.dataset.char;
    const info = Data.getChar(char);
    if (!info) return;

    lookedUpChars.add(char);

    const tip = document.getElementById('read-tooltip');
    if (!tip) return;

    const alreadyFlagged = flaggedChars.has(char);

    tip.innerHTML = `
      <div class="tooltip-char">${UI.esc(char)}</div>
      <div class="tooltip-pinyin tone-${UI.getTone(info.p)}">${UI.esc(info.p)}</div>
      <div class="tooltip-def">${UI.esc(info.d)}</div>
      <div class="tooltip-actions">
        <button class="btn-secondary tooltip-flag-btn" style="font-size:13px;padding:6px 12px;">
          ${alreadyFlagged ? '&#10003; Added' : '+ Review'}
        </button>
        <button class="btn-secondary tooltip-more-btn" style="font-size:13px;padding:6px 12px;">
          More
        </button>
      </div>
    `;

    // Position tooltip
    const rect = spanEl.getBoundingClientRect();
    const tipHeight = 140;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > tipHeight + 8 ? rect.bottom + 4 : rect.top - tipHeight - 4;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 280));
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
    tip.classList.add('active');

    // Flag button
    tip.querySelector('.tooltip-flag-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!alreadyFlagged) {
        flaggedChars.add(char);
        Storage.addReadingFlag(char);
        UI.toast(`${char} added to review queue`);
      }
      hideTooltip();
    });

    // More button
    tip.querySelector('.tooltip-more-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      hideTooltip();
      UI.showCharModal(char);
    });
  }

  function hideTooltip() {
    const tip = document.getElementById('read-tooltip');
    if (tip) tip.classList.remove('active');
  }

  // --- Record completion ---
  function recordSnippetComplete() {
    if (!currentSnippet) return;
    // Count CJK characters encountered
    const cjkCount = [...currentSnippet.text].filter(c => window.CHAR_DATA[c]).length;
    sessionStats.snippetsRead++;
    sessionStats.charsEncountered += cjkCount;
    sessionStats.lookups += lookedUpChars.size;
    Storage.recordSnippetRead(currentSnippet.id);
    lookedUpChars = new Set();
  }

  // --- Session Summary ---
  function showSummary() {
    // Clean up event listener
    document.removeEventListener('click', handleOutsideClick);

    const el = document.getElementById('screen-read');
    const duration = Math.round((Date.now() - sessionStats.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    el.innerHTML = `
      <div class="summary-container fade-in">
        <h2>Reading Complete</h2>
        <div class="summary-stats">
          <div class="summary-stat">
            <div class="value">${sessionStats.snippetsRead}</div>
            <div class="label">Passages</div>
          </div>
          <div class="summary-stat">
            <div class="value">${sessionStats.charsEncountered}</div>
            <div class="label">Characters</div>
          </div>
          <div class="summary-stat">
            <div class="value">${sessionStats.lookups}</div>
            <div class="label">Lookups</div>
          </div>
          <div class="summary-stat">
            <div class="value">${minutes}:${seconds.toString().padStart(2, '0')}</div>
            <div class="label">Duration</div>
          </div>
        </div>
        ${flaggedChars.size > 0 ? `<p style="color:var(--text-secondary);font-size:14px;margin-top:12px;">${flaggedChars.size} character${flaggedChars.size > 1 ? 's' : ''} flagged for review</p>` : ''}
        <button class="btn-primary" id="read-done-final" style="margin-top:24px;">Done</button>
      </div>
    `;

    document.getElementById('read-done-final').addEventListener('click', () => {
      App.navigate('home');
    });
  }

  return { render };
})();

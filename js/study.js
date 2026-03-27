// study.js — Study screen: review loop, new card intro, session summary

const Study = (() => {
  let queue = [];        // chars to review this session
  let newQueue = [];     // new chars to introduce
  let currentIndex = 0;
  let revealStage = 0;   // 0=char, 1=pinyin, 2=def, 3=compounds
  let sessionStats = { reviews: 0, correct: 0, newLearned: 0, startTime: 0 };
  let isNewCard = false;
  let newCardPhase = ''; // 'present', 'quiz', 'mini-review'
  let quizOptions = [];
  let miniReviewQueue = []; // new chars to mini-review after a few cards
  let rendered = false;
  let currentView = 'card'; // 'card' | 'empty' | 'summary'

  let swapPending = false;
  function swapContent(el, buildFn) {
    if (!el.querySelector('.study-card') && !el.querySelector('.summary-container')) {
      buildFn();
      return;
    }
    if (swapPending) {
      buildFn();
      el.classList.remove('card-exit');
      return;
    }
    swapPending = true;
    el.classList.add('card-exit');
    setTimeout(() => { // 60 — must match CSS transition duration on #screen-study
      try {
        buildFn();
      } finally {
        swapPending = false;
        requestAnimationFrame(() => {
          el.classList.remove('card-exit');
        });
      }
    }, 60);
  }

  function render() {
    // Preserve state on tab return — skip full rebuild
    if (rendered) {
      return;
    }

    const el = document.getElementById('screen-study');
    buildSession();
    Sync.lock();

    const hasMoreNew = Data.getNextNewChars(1).length > 0;
    if (queue.length === 0 && newQueue.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <h3>All caught up!</h3>
          <p>No cards due right now.${hasMoreNew ? '' : ' You\'ve seen all available characters!'}</p>
          ${hasMoreNew ? '<button class="btn-primary" id="btn-learn-more" style="max-width:280px;">Keep Learning (+10 cards)</button>' : ''}
          <button class="btn-secondary" id="btn-back-home" style="margin-top:8px;">Back Home</button>
        </div>
      `;
      Sync.unlock();
      rendered = true;
      currentView = 'empty';
      document.getElementById('btn-back-home').addEventListener('click', () => {
        rendered = false;
        App.navigate('home');
      });
      if (hasMoreNew) {
        document.getElementById('btn-learn-more').addEventListener('click', () => {
          newQueue = Data.getNextNewChars(10);
          currentIndex = 0;
          sessionStats = { reviews: 0, correct: 0, newLearned: 0, startTime: Date.now() };
          Sync.lock();
          rendered = true;
          currentView = 'card';
          showCard();
        });
      }
      return;
    }

    sessionStats = { reviews: 0, correct: 0, newLearned: 0, startTime: Date.now() };
    currentIndex = 0;
    rendered = true;
    currentView = 'card';
    showCard();
  }

  function buildSession() {
    queue = SRS.getDueCards();
    newQueue = SRS.getNewCards();
  }

  function totalCards() {
    return queue.length + newQueue.length;
  }

  function currentChar() {
    if (currentIndex < queue.length) {
      return queue[currentIndex];
    }
    // Check mini-review queue first
    if (miniReviewQueue.length > 0 && currentIndex % 3 === 0) {
      return miniReviewQueue[0];
    }
    const newIdx = currentIndex - queue.length;
    if (newIdx < newQueue.length) {
      return newQueue[newIdx];
    }
    return null;
  }

  function showCard() {
    const el = document.getElementById('screen-study');
    const char = currentChar();

    if (!char) {
      showSummary();
      return;
    }

    const info = Data.getChar(char);
    if (!info) {
      currentIndex++;
      showCard();
      return;
    }

    revealStage = 0;
    isNewCard = !Storage.getCardState(char);

    if (isNewCard && newCardPhase !== 'mini-review') {
      newCardPhase = 'present';
      showNewCardPresent(el, char, info);
    } else {
      newCardPhase = '';
      showReviewCard(el, char, info);
    }
  }

  // --- New Card Introduction ---
  function showNewCardPresent(el, char, info) {
    const progress = Math.round(((currentIndex) / totalCards()) * 100);

    swapContent(el, () => {
      el.innerHTML = `
        <div class="study-progress">
          <span>${currentIndex + 1} / ${totalCards()}</span>
          <div class="study-progress-bar"><div class="study-progress-fill" style="width:${progress}%"></div></div>
          <span class="meta-tag" style="font-size:11px;">NEW</span>
        </div>
        <div class="study-card" id="study-card">
          <div class="char-large">${UI.esc(char)}</div>
          <div class="study-pinyin-row">
            <span class="pinyin tone-${UI.getTone(info.p)}" style="font-size:28px;">${UI.esc(info.p)}</span>
            ${typeof Audio_ !== 'undefined' && Audio_.isEnabled() ? Audio_.buttonHTML(char) : ''}
          </div>
          <div class="definition" style="margin-top:4px;">${UI.esc(info.d)}</div>
          ${info.cw && info.cw.length > 0 ? `
          <div class="compound-list" style="margin-top:20px;">
            ${info.cw.slice(0, 4).map(([chars, py, def]) => `
              <div class="compound-item">
                <span class="compound-char">${UI.esc(chars)}</span>
                <span class="compound-pinyin tone-${UI.getTone(py)}">${UI.esc(py)}</span>
                <span class="compound-def">${UI.esc(UI.truncDef(def))}</span>
              </div>
            `).join('')}
          </div>
          <div class="compound-see-more">Details &#x203A;</div>
          ` : ''}
          <p class="hint" style="margin-top:16px;">Tap to continue</p>
        </div>
      `;

      if (typeof Audio_ !== 'undefined') Audio_.attachButtons(el);

      document.getElementById('study-card').addEventListener('click', () => {
        newCardPhase = 'quiz';
        showNewCardQuiz(el, char, info);
      });

      const seeMoreBtn = el.querySelector('.compound-see-more');
      if (seeMoreBtn) {
        seeMoreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          UI.showCharModal(char);
        });
      }
    });
  }

  function showNewCardQuiz(el, char, info) {
    // Generate 3 wrong options from chars with same radical or similar frequency
    const allChars = Data.getAllChars().filter(c => c !== char);
    const sameRadical = allChars.filter(c => Data.getChar(c)?.r === info.r);
    const pool = sameRadical.length >= 3 ? sameRadical : allChars;

    // Pick 3 random wrong answers
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const wrongChars = shuffled.slice(0, 3);
    const options = [char, ...wrongChars].sort(() => Math.random() - 0.5);

    const progress = Math.round(((currentIndex) / totalCards()) * 100);

    swapContent(el, () => {
      el.innerHTML = `
        <div class="study-progress">
          <span>${currentIndex + 1} / ${totalCards()}</span>
          <div class="study-progress-bar"><div class="study-progress-fill" style="width:${progress}%"></div></div>
          <span class="meta-tag" style="font-size:11px;">QUIZ</span>
        </div>
        <div class="study-card" style="cursor:default;">
          <p style="font-size:14px; color:var(--text-muted);">Which character is</p>
          <div class="study-pinyin-row">
            <span class="pinyin tone-${UI.getTone(info.p)}" style="font-size:32px; font-weight:700;">${UI.esc(info.p)}</span>
            ${typeof Audio_ !== 'undefined' && Audio_.isEnabled() ? Audio_.buttonHTML(char) : ''}
          </div>
          <div class="definition">${UI.esc(info.d)}</div>
        </div>
        <div class="rating-buttons" style="margin-top:12px;">
          ${options.map(opt => `
            <button class="rating-btn" data-char="${opt}"
              style="background:var(--bg-secondary); color:var(--text-primary); font-size:28px; padding:20px 8px; font-family:'PingFang SC',sans-serif;">
              ${opt}
            </button>
          `).join('')}
        </div>
      `;

      if (typeof Audio_ !== 'undefined') Audio_.attachButtons(el);

      el.querySelectorAll('.rating-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const chosen = btn.dataset.char;
          const correct = chosen === char;

          // Highlight correct/wrong
          el.querySelectorAll('.rating-btn').forEach(b => {
            if (b.dataset.char === char) {
              b.style.background = 'var(--rating-good)';
              b.style.color = '#fff';
            } else if (b === btn && !correct) {
              b.style.background = 'var(--rating-again)';
              b.style.color = '#fff';
            }
            b.disabled = true;
          });

          if (correct) {
            // Schedule for mini-review in a few cards
            miniReviewQueue.push(char);
            // Rate as Good for initial entry into SRS
            SRS.rateCard(char, SRS.Rating.Good);
            Storage.recordNewCard();
            sessionStats.newLearned++;
          } else {
            // Rate as Again
            SRS.rateCard(char, SRS.Rating.Again);
            Storage.recordNewCard();
          }

          setTimeout(() => {
            currentIndex++;
            showCard();
          }, correct ? 600 : 1200);
        });
      });
    });
  }

  // --- Review Card (Progressive Reveal) ---
  function showReviewCard(el, char, info) {
    const progress = Math.round(((currentIndex) / totalCards()) * 100);
    const isMiniReview = miniReviewQueue.includes(char);

    swapContent(el, () => {
      el.innerHTML = `
        <div class="study-progress">
          <span>${currentIndex + 1} / ${totalCards()}</span>
          <div class="study-progress-bar"><div class="study-progress-fill" style="width:${progress}%"></div></div>
          ${isMiniReview ? '<span class="meta-tag" style="font-size:11px;">REVIEW</span>' : ''}
        </div>
        <div class="study-card" id="study-card">
          <div class="char-large">${UI.esc(char)}</div>
          <div id="reveal-content"></div>
          <p class="hint" id="reveal-hint">Tap to reveal</p>
        </div>
        <div id="rating-area"></div>
      `;

      revealStage = 0;
      updateReveal(char, info);

      document.getElementById('study-card').addEventListener('click', () => {
        revealStage++;
        updateReveal(char, info);
      });
    });
  }

  function updateReveal(char, info) {
    const content = document.getElementById('reveal-content');
    const hint = document.getElementById('reveal-hint');
    const ratingArea = document.getElementById('rating-area');
    if (!content) return;

    let html = '';

    if (revealStage >= 1) {
      html += `<div class="study-pinyin-row">
        <span class="pinyin tone-${UI.getTone(info.p)}" style="font-size:28px;">${UI.esc(info.p)}</span>
        ${typeof Audio_ !== 'undefined' && Audio_.isEnabled() ? Audio_.buttonHTML(char) : ''}
      </div>`;
    }
    if (revealStage >= 2) {
      html += `<div class="definition" style="margin-top:4px;">${UI.esc(info.d)}</div>`;
    }
    if (revealStage >= 3 && info.cw && info.cw.length > 0) {
      html += `<div class="compound-list" style="margin-top:20px;">
        ${info.cw.slice(0, 4).map(([chars, py, def]) => `
          <div class="compound-item">
            <span class="compound-char">${UI.esc(chars)}</span>
            <span class="compound-pinyin tone-${UI.getTone(py)}">${UI.esc(py)}</span>
            <span class="compound-def">${UI.esc(UI.truncDef(def))}</span>
          </div>
        `).join('')}
      </div>
      <div class="compound-see-more">Details &#x203A;</div>`;
    }

    content.innerHTML = html;
    if (typeof Audio_ !== 'undefined') Audio_.attachButtons(content);

    const seeMoreBtn = content.querySelector('.compound-see-more');
    if (seeMoreBtn) {
      seeMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.showCharModal(char);
      });
    }

    if (revealStage >= 3) {
      hint.style.display = 'none';
      showRatingButtons(ratingArea, char);
    } else {
      const hints = ['Tap to reveal pinyin', 'Tap to reveal meaning', 'Tap to see words you know'];
      hint.textContent = hints[revealStage] || 'Tap to reveal';
    }
  }

  function showRatingButtons(container, char) {
    const intervals = SRS.getIntervalPreview(char);

    container.innerHTML = `
      <div class="rating-header">
        <span class="rating-prompt">How well did you remember?</span>
        <button class="rating-help-btn" id="rating-help-toggle" aria-label="Help" aria-expanded="false">?</button>
        <div class="rating-help" id="rating-help" style="display:none;">
          <p><strong>Again</strong> — Forgot completely. Card returns in minutes so you can relearn it.</p>
          <p><strong>Hard</strong> — Recalled with difficulty. Shorter interval to reinforce.</p>
          <p><strong>Good</strong> — Remembered correctly. Normal spacing before next review.</p>
          <p><strong>Easy</strong> — Knew it instantly. Pushes the card further out to save you time.</p>
        </div>
      </div>
      <div class="rating-buttons">
        <button class="rating-btn again" data-rating="1">
          Again<span class="rating-interval">${intervals[1]}</span>
        </button>
        <button class="rating-btn hard" data-rating="2">
          Hard<span class="rating-interval">${intervals[2]}</span>
        </button>
        <button class="rating-btn good" data-rating="3">
          Good<span class="rating-interval">${intervals[3]}</span>
        </button>
        <button class="rating-btn easy" data-rating="4">
          Easy<span class="rating-interval">${intervals[4]}</span>
        </button>
      </div>
    `;

    container.querySelector('#rating-help-toggle').addEventListener('click', (e) => {
      const help = container.querySelector('#rating-help');
      const open = help.style.display === 'none';
      help.style.display = open ? 'block' : 'none';
      e.currentTarget.setAttribute('aria-expanded', open);
    });

    container.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = parseInt(btn.dataset.rating);
        SRS.rateCard(char, rating);
        Storage.recordDailyReview(rating >= 3);
        sessionStats.reviews++;
        if (rating >= 3) sessionStats.correct++;

        // Remove from mini-review queue if applicable
        const mri = miniReviewQueue.indexOf(char);
        if (mri >= 0) miniReviewQueue.splice(mri, 1);

        currentIndex++;
        showCard();
      });
    });
  }

  // --- Session Summary ---
  function showSummary() {
    currentView = 'summary';
    const el = document.getElementById('screen-study');
    const duration = Math.round((Date.now() - sessionStats.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const accuracy = sessionStats.reviews > 0
      ? Math.round(sessionStats.correct / sessionStats.reviews * 100) : 0;

    Storage.updateStreak();
    Sync.unlock();

    swapContent(el, () => {
      el.innerHTML = `
        <div class="summary-container">
          <h2>Session Complete</h2>
          <div class="summary-stats">
            <div class="summary-stat">
              <div class="value">${sessionStats.reviews}</div>
              <div class="label">Reviews</div>
            </div>
            <div class="summary-stat">
              <div class="value">${accuracy}%</div>
              <div class="label">Accuracy</div>
            </div>
            <div class="summary-stat">
              <div class="value">${sessionStats.newLearned}</div>
              <div class="label">New Learned</div>
            </div>
            <div class="summary-stat">
              <div class="value">${minutes}:${seconds.toString().padStart(2, '0')}</div>
              <div class="label">Duration</div>
            </div>
          </div>
          <button class="btn-primary" id="study-done-btn" style="margin-top:24px;">Done</button>
        </div>
      `;
      document.getElementById('study-done-btn').addEventListener('click', () => {
        rendered = false;
        App.navigate('home');
      });
    });
  }

  return { render };
})();

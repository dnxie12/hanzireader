// browse.js — Character grid, filters, search, detail modal

const Browse = (() => {
  let currentFilter = 'all';
  let searchQuery = '';
  let searchMode = 'all';
  let filteredChars = [];
  let visibleCount = 0;
  let debounceTimer = null;
  let rendered = false;

  const BATCH_SIZE = 200;

  // Cache radical counts — CHAR_DATA never changes at runtime
  let cachedRadicals = null;
  function getTopRadicals() {
    if (cachedRadicals) return cachedRadicals;
    const counts = {};
    for (const info of Object.values(window.CHAR_DATA || {})) {
      counts[info.r] = (counts[info.r] || 0) + 1;
    }
    cachedRadicals = Object.entries(counts)
      .filter(([, c]) => c >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([r]) => r);
    return cachedRadicals;
  }

  function render() {
    // Skip full rebuild if already rendered — just refresh grid state colors
    if (rendered) {
      refreshGridStates();
      return;
    }

    const el = document.getElementById('screen-browse');
    el.innerHTML = `
      <div class="browse-search">
        <div class="search-row">
          <input type="text" class="search-input" id="browse-search-input"
                 placeholder="${searchPlaceholder()}"
                 autocomplete="off" autocapitalize="none" spellcheck="false">
          <button class="search-mode-btn" id="search-mode-btn">${searchModeLabel()}</button>
        </div>
        <div class="browse-filters" id="browse-filters"></div>
      </div>
      <div class="char-grid" id="char-grid"></div>
      <div id="browse-load-more"></div>
    `;

    renderFilters();
    updateFilteredChars();
    renderGrid();

    // Debounced search
    document.getElementById('browse-search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateFilteredChars();
        renderGrid();
        updateLoadMore();
      }, 150);
    });

    document.getElementById('search-mode-btn').addEventListener('click', () => {
      const modes = ['all', 'pinyin', 'meaning'];
      searchMode = modes[(modes.indexOf(searchMode) + 1) % modes.length];
      document.getElementById('search-mode-btn').textContent = searchModeLabel();
      document.getElementById('browse-search-input').placeholder = searchPlaceholder();
      if (searchQuery) {
        updateFilteredChars();
        renderGrid();
        updateLoadMore();
      }
    });

    // Event delegation for char grid + load more (single listener)
    el.addEventListener('click', (e) => {
      const item = e.target.closest('.char-grid-item');
      if (item) {
        UI.showCharModal(item.dataset.char);
        return;
      }
      const loadBtn = e.target.closest('#browse-load-more-btn');
      if (loadBtn) {
        appendBatch();
        updateLoadMore();
      }
    });

    // Event delegation for filters
    document.getElementById('browse-filters').addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      currentFilter = chip.dataset.filter;
      renderFilterChips();
      updateFilteredChars();
      renderGrid();
      updateLoadMore();
    });

    rendered = true;
  }

  function searchModeLabel() {
    return { all: 'All', pinyin: 'Pinyin', meaning: 'Meaning' }[searchMode];
  }

  function searchPlaceholder() {
    return {
      all: 'Search character, pinyin, or meaning...',
      pinyin: 'Search by pinyin (e.g. ma, shi)...',
      meaning: 'Search by meaning (e.g. water, big)...'
    }[searchMode];
  }

  function renderFilters() {
    renderFilterChips();
  }

  function renderFilterChips() {
    const container = document.getElementById('browse-filters');
    if (!container) return;
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'new', label: 'New' },
      { id: 'learning', label: 'Learning' },
      { id: 'review', label: 'Known' },
      { id: 'relearning', label: 'Relearning' },
    ];

    const topRadicals = getTopRadicals();

    container.innerHTML =
      filters.map(f =>
        `<button class="filter-chip ${currentFilter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`
      ).join('') +
      topRadicals.map(r =>
        `<button class="filter-chip ${currentFilter === 'r:' + r ? 'active' : ''}" data-filter="r:${r}">${r}</button>`
      ).join('');
  }

  function updateFilteredChars() {
    if (searchQuery) {
      filteredChars = Data.search(searchQuery, searchMode);
    } else if (currentFilter === 'all') {
      filteredChars = Data.getLearnOrder();
    } else if (currentFilter.startsWith('r:')) {
      filteredChars = Data.filterByRadical(currentFilter.slice(2));
    } else {
      filteredChars = Data.filterByState(currentFilter === 'new' ? 'new' :
                                  currentFilter === 'learning' ? 1 :
                                  currentFilter === 'review' ? 2 :
                                  currentFilter === 'relearning' ? 3 : 'new');
    }
    visibleCount = 0;
  }

  function getCharStateClass(char) {
    const card = Storage.getCardState(char);
    if (!card) return 'new';
    switch (card.state) {
      case 1: return 'learning';
      case 2: return 'review';
      case 3: return 'relearning';
      default: return 'new';
    }
  }

  function renderGrid() {
    const grid = document.getElementById('char-grid');
    if (!grid) return;
    grid.innerHTML = '';
    visibleCount = 0;
    appendBatch();
    updateLoadMore();
  }

  function appendBatch() {
    const grid = document.getElementById('char-grid');
    if (!grid || visibleCount >= filteredChars.length) return;

    const end = Math.min(visibleCount + BATCH_SIZE, filteredChars.length);
    const fragment = document.createDocumentFragment();

    for (let i = visibleCount; i < end; i++) {
      const char = filteredChars[i];
      const div = document.createElement('div');
      div.className = `char-grid-item ${getCharStateClass(char)}`;
      div.dataset.char = char;
      div.textContent = char;
      fragment.appendChild(div);
    }

    grid.appendChild(fragment);
    visibleCount = end;
  }

  function updateLoadMore() {
    const container = document.getElementById('browse-load-more');
    if (!container) return;
    const remaining = filteredChars.length - visibleCount;
    if (remaining > 0) {
      container.innerHTML = `<button class="btn-secondary" id="browse-load-more-btn" style="width:100%;margin:12px 0;">
        Load More (${remaining} remaining)
      </button>`;
    } else {
      container.innerHTML = '';
    }
  }

  // Refresh state colors without rebuilding the grid (for tab switches back)
  function refreshGridStates() {
    const items = document.querySelectorAll('#char-grid .char-grid-item');
    for (const item of items) {
      const char = item.dataset.char;
      const cls = getCharStateClass(char);
      item.className = `char-grid-item ${cls}`;
    }
  }

  return { render };
})();

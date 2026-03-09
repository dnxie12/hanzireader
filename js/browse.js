// browse.js — Character grid, filters, search, detail modal

const Browse = (() => {
  let currentFilter = 'all';
  let searchQuery = '';

  function render() {
    const el = document.getElementById('screen-browse');
    el.innerHTML = `
      <div class="browse-search">
        <input type="text" class="search-input" id="browse-search-input"
               placeholder="Search character, pinyin, or meaning..."
               autocomplete="off" autocapitalize="none" spellcheck="false">
        <div class="browse-filters" id="browse-filters"></div>
      </div>
      <div class="char-grid" id="char-grid"></div>
    `;

    renderFilters();
    renderGrid();

    document.getElementById('browse-search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderGrid();
    });
  }

  function renderFilters() {
    const container = document.getElementById('browse-filters');
    const filters = [
      { id: 'all', label: 'All' },
      { id: 'new', label: 'New' },
      { id: 'learning', label: 'Learning' },
      { id: 'review', label: 'Known' },
      { id: 'relearning', label: 'Relearning' },
    ];

    // Top radicals with enough characters to be useful (>= 5 chars)
    const radicalCounts = {};
    for (const info of Object.values(window.CHAR_DATA || {})) {
      radicalCounts[info.r] = (radicalCounts[info.r] || 0) + 1;
    }
    const topRadicals = Object.entries(radicalCounts)
      .filter(([, count]) => count >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([r]) => r);

    container.innerHTML =
      filters.map(f =>
        `<button class="filter-chip ${currentFilter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>`
      ).join('') +
      topRadicals.map(r =>
        `<button class="filter-chip ${currentFilter === 'r:' + r ? 'active' : ''}" data-filter="r:${r}">${r}</button>`
      ).join('');

    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      currentFilter = chip.dataset.filter;
      renderFilters();
      renderGrid();
    });
  }

  function getFilteredChars() {
    let chars;

    if (searchQuery) {
      chars = Data.search(searchQuery);
    } else if (currentFilter === 'all') {
      chars = Data.getLearnOrder();
    } else if (currentFilter.startsWith('r:')) {
      chars = Data.filterByRadical(currentFilter.slice(2));
    } else {
      chars = Data.filterByState(currentFilter === 'new' ? 'new' :
                                  currentFilter === 'learning' ? 1 :
                                  currentFilter === 'review' ? 2 :
                                  currentFilter === 'relearning' ? 3 : 'new');
    }

    return chars;
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
    const chars = getFilteredChars();

    grid.innerHTML = chars.map(char =>
      `<div class="char-grid-item ${getCharStateClass(char)}" data-char="${char}">${char}</div>`
    ).join('');

    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.char-grid-item');
      if (!item) return;
      UI.showCharModal(item.dataset.char);
    });
  }

  return { render };
})();

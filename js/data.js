// data.js — Query layer over CHAR_DATA

const Data = (() => {

  function getChar(char) {
    return window.CHAR_DATA?.[char] || null;
  }

  function getAllChars() {
    return Object.keys(window.CHAR_DATA || {});
  }

  function getLearnOrder() {
    return window.LEARN_ORDER || [];
  }

  function getRadicals() {
    return window.RADICAL_DATA || [];
  }

  function totalChars() {
    return getAllChars().length;
  }

  // Strip tone marks from pinyin for accent-free matching
  function stripTones(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ü/g, 'v');
  }

  // Search by character, pinyin (with or without accents), or definition
  // mode: 'all' (default), 'pinyin', 'meaning'
  function search(query, mode) {
    if (!query) return getLearnOrder();
    const q = query.toLowerCase().trim();
    const qPlain = stripTones(q);
    const m = mode || 'all';
    const results = [];
    for (const [char, info] of Object.entries(window.CHAR_DATA || {})) {
      const matchChar = char === q;
      const matchPinyin = info.p.toLowerCase().includes(q) ||
                          stripTones(info.p.toLowerCase()).includes(qPlain);
      const matchDef = info.d.toLowerCase().includes(q);

      if (m === 'pinyin' && (matchChar || matchPinyin)) {
        results.push(char);
      } else if (m === 'meaning' && (matchChar || matchDef)) {
        results.push(char);
      } else if (m === 'all' && (matchChar || matchPinyin || matchDef)) {
        results.push(char);
      }
    }
    return results;
  }

  // Filter by radical
  function filterByRadical(radical) {
    const results = [];
    for (const [char, info] of Object.entries(window.CHAR_DATA || {})) {
      if (info.r === radical) results.push(char);
    }
    return results;
  }

  // Filter by SRS state (requires Storage)
  function filterByState(state) {
    const srs = Storage.getSRS();
    const results = [];
    for (const char of getAllChars()) {
      const card = srs[char];
      if (state === 'new' && !card) {
        results.push(char);
      } else if (card && card.state === state) {
        results.push(char);
      }
    }
    return results;
  }

  // Calculate literacy percentage
  // Based on frequency-weighted coverage of known characters
  function getLiteracyPercent() {
    const srs = Storage.getSRS();
    let knownFreqSum = 0;
    let totalFreqSum = 0;

    for (const [char, info] of Object.entries(window.CHAR_DATA || {})) {
      // Weight by inverse frequency rank (higher rank = more common = more weight)
      const weight = 1 / Math.log2(info.f + 1);
      totalFreqSum += weight;
      const card = srs[char];
      // Count as "known" if in review state (state 2) or graduated
      if (card && (card.state === 2 || card.state === 3)) {
        knownFreqSum += weight;
      }
    }

    if (totalFreqSum === 0) return 0;
    return Math.round((knownFreqSum / totalFreqSum) * 100);
  }

  // Get count of characters by SRS state
  function getStateCounts() {
    const srs = Storage.getSRS();
    const counts = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const char of getAllChars()) {
      const card = srs[char];
      if (!card) {
        counts.new++;
      } else if (card.state === 0) {
        counts.new++;
      } else if (card.state === 1) {
        counts.learning++;
      } else if (card.state === 2) {
        counts.review++;
      } else if (card.state === 3) {
        counts.relearning++;
      }
    }
    return counts;
  }

  // Get next N characters to learn (not yet in SRS)
  function getNextNewChars(n) {
    const srs = Storage.getSRS();
    const order = getLearnOrder();
    const result = [];
    for (const char of order) {
      if (result.length >= n) break;
      if (!srs[char]) result.push(char);
    }
    return result;
  }

  // Filter characters by HSK level (0 = Beyond HSK)
  function filterByHSK(level) {
    const results = [];
    for (const [char, info] of Object.entries(window.CHAR_DATA || {})) {
      if ((info.h || 0) === level) results.push(char);
    }
    return results;
  }

  // Get per-HSK-level known/total counts
  function getHSKCounts() {
    const srs = Storage.getSRS();
    const levels = {};
    for (const [char, info] of Object.entries(window.CHAR_DATA || {})) {
      const h = info.h || 0;
      if (!levels[h]) levels[h] = { total: 0, known: 0 };
      levels[h].total++;
      const card = srs[char];
      if (card && (card.state === 2 || card.state === 3)) {
        levels[h].known++;
      }
    }
    return levels;
  }

  return {
    getChar, getAllChars, getLearnOrder, getRadicals, totalChars,
    search, filterByRadical, filterByState,
    getLiteracyPercent, getStateCounts, getNextNewChars,
    filterByHSK, getHSKCounts
  };
})();

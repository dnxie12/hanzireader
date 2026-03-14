// srs.js — FSRS v6 wrapper via ts-fsrs
// Handles scheduling, card state, and persistence

const SRS = (() => {
  let fsrs = null;

  function init() {
    if (typeof window.fsrsJs !== 'undefined') {
      // ts-fsrs loaded via CDN
      fsrs = new window.fsrsJs.FSRS({});
      console.log('FSRS initialized');
    } else {
      console.warn('ts-fsrs not loaded — using fallback scheduling');
    }
  }

  // Convert our stored state to a ts-fsrs Card object
  function toFSRSCard(stored) {
    if (!stored) {
      // New card
      if (fsrs) {
        return new window.fsrsJs.Card();
      }
      return {
        due: new Date(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 0, // New
        last_review: undefined
      };
    }
    const card = fsrs ? new window.fsrsJs.Card() : {};
    card.due = new Date(stored.due);
    card.stability = stored.stability;
    card.difficulty = stored.difficulty;
    card.elapsed_days = stored.elapsed_days || 0;
    card.scheduled_days = stored.scheduled_days || 0;
    card.reps = stored.reps;
    card.lapses = stored.lapses;
    card.state = stored.state;
    card.last_review = stored.last_review ? new Date(stored.last_review) : undefined;
    return card;
  }

  // Convert ts-fsrs card back to our storage format
  function fromFSRSCard(card) {
    return {
      due: card.due instanceof Date ? card.due.toISOString() : card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: card.last_review instanceof Date ? card.last_review.toISOString() : card.last_review
    };
  }

  // Rating enum: 1=Again, 2=Hard, 3=Good, 4=Easy
  const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

  // Rate a character and update its SRS state
  function rateCard(char, rating) {
    const stored = Storage.getCardState(char);
    const card = toFSRSCard(stored);
    const now = new Date();

    let updatedCard;
    if (fsrs) {
      const result = fsrs.repeat(card, now);
      updatedCard = result[rating].card;
    } else {
      // Fallback: simple interval scheduling
      updatedCard = fallbackSchedule(card, rating, now);
    }

    const newState = fromFSRSCard(updatedCard);
    Storage.saveCardState(char, newState);
    return newState;
  }

  // Fallback scheduling when ts-fsrs isn't available
  function fallbackSchedule(card, rating, now) {
    const intervals = {
      1: 1,       // Again: 1 minute
      2: 10,      // Hard: 10 minutes
      3: 1440,    // Good: 1 day
      4: 5760     // Easy: 4 days
    };

    let multiplier = 1;
    if (card.reps > 0) {
      multiplier = Math.max(1, card.stability || 1);
    }

    const intervalMin = intervals[rating] * multiplier;
    const due = new Date(now.getTime() + intervalMin * 60000);

    return {
      due: due,
      stability: rating >= 3 ? (card.stability || 1) * (rating === 4 ? 2.5 : 1.8) : 0.5,
      difficulty: Math.max(1, Math.min(10,
        (card.difficulty || 5) + (rating === 1 ? 1 : rating === 2 ? 0.5 : rating === 4 ? -0.5 : 0)
      )),
      elapsed_days: card.last_review ? (now - new Date(card.last_review)) / 86400000 : 0,
      scheduled_days: intervalMin / 1440,
      reps: card.reps + 1,
      lapses: card.lapses + (rating === 1 ? 1 : 0),
      state: rating === 1 ? 3 : (rating === 2 ? 1 : 2), // Again→Relearning, Hard→Learning, Good/Easy→Review
      last_review: now
    };
  }

  // Get all due cards (due date <= now), sorted by most overdue first
  // Also prepends any characters flagged from reading practice
  function getDueCards() {
    const srs = Storage.getSRS();
    const now = new Date();
    const due = [];

    for (const [char, state] of Object.entries(srs)) {
      if (state.due && new Date(state.due) <= now) {
        due.push({
          char,
          state,
          overdueMs: now - new Date(state.due)
        });
      }
    }

    // Most overdue first
    due.sort((a, b) => b.overdueMs - a.overdueMs);
    const dueChars = due.map(d => d.char);

    // Prepend reading-flagged characters (only those already in SRS)
    const flagged = Storage.consumeReadingFlags()
      .filter(c => srs[c] && !dueChars.includes(c));

    return [...flagged, ...dueChars];
  }

  // Get new cards up to limit
  function getNewCards(limit) {
    const settings = Storage.getSettings();
    const todayStats = Storage.getDailyStats();
    const remaining = (limit || settings.newPerDay) - todayStats.newCards;
    if (remaining <= 0) return [];
    return Data.getNextNewChars(remaining);
  }

  // Get interval preview text for each rating
  function getIntervalPreview(char) {
    const stored = Storage.getCardState(char);
    const card = toFSRSCard(stored);
    const now = new Date();

    if (fsrs) {
      const result = fsrs.repeat(card, now);
      return {
        1: formatInterval(result[1].card.due, now),
        2: formatInterval(result[2].card.due, now),
        3: formatInterval(result[3].card.due, now),
        4: formatInterval(result[4].card.due, now)
      };
    }

    // Fallback preview
    return { 1: '1m', 2: '10m', 3: '1d', 4: '4d' };
  }

  function formatInterval(due, now) {
    const ms = due - now;
    const min = ms / 60000;
    if (min < 60) return Math.round(min) + 'm';
    const hrs = min / 60;
    if (hrs < 24) return Math.round(hrs) + 'h';
    const days = hrs / 24;
    if (days < 30) return Math.round(days) + 'd';
    const months = days / 30;
    return Math.round(months) + 'mo';
  }

  return {
    init, Rating, rateCard, getDueCards, getNewCards, getIntervalPreview
  };
})();

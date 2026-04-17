// badges.js — Achievement system. Definitions, evaluator, gallery renderer.

const Badges = (() => {

  // SVGs: viewBox 0 0 24 24, currentColor stroke, 1.5 weight, rounded caps.
  // Earned/locked colorization handled in CSS on parent .badge-item.
  // WARNING: `svg` field is raw HTML injected verbatim (no escaping).
  // Only populate with hand-authored markup. NEVER wire user input here.
  const SVG = {
    sprout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11"/><path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5z"/><path d="M12 13c0-3-2-5-5-5 0 3 2 5 5 5z"/><path d="M8 21h8"/></svg>`,
    flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1 1 1.5 2 1.5-1-2-1-5 1-7.5z"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M9 15l2 2 4-4"/></svg>`,
    laurel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4c-1 4 0 10 6 15"/><path d="M18 4c1 4 0 10-6 15"/><path d="M6 8c1.5 0 2.5.5 3 1.5"/><path d="M5 12c1.5 0 2.5.5 3 1.5"/><path d="M6 16c1.5 0 2.5.5 3 1.5"/><path d="M18 8c-1.5 0-2.5.5-3 1.5"/><path d="M19 12c-1.5 0-2.5.5-3 1.5"/><path d="M18 16c-1.5 0-2.5.5-3 1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`,
    acorn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7c-3 0-5 2-5 4v2a5 5 0 0 0 10 0v-2c0-2-2-4-5-4z"/><path d="M7 11h10"/><path d="M12 7V4"/><path d="M10.5 4c.5-1 2.5-1 3 0"/></svg>`,
    newspaper: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h14v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M18 8h2v10a1 1 0 0 1-1 1"/><path d="M7 9h8"/><path d="M7 13h8"/><path d="M7 17h5"/></svg>`,
    halfCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>`,
    openBook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6c3-1 6-1 9 1v13c-3-2-6-2-9-1z"/><path d="M21 6c-3-1-6-1-9 1v13c3-2 6-2 9-1z"/></svg>`,
    gradCap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v5"/></svg>`,
  };

  // HSK shield: Roman numerals I–VI, fill intensity grows with level.
  function hskShield(numeral, level) {
    const fillOpacity = 0.1 + (level / 6) * 0.25;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" fill="currentColor" fill-opacity="${fillOpacity}"/><text x="12" y="15" text-anchor="middle" font-size="7" font-weight="700" font-family="ui-sans-serif,system-ui,sans-serif" fill="currentColor" stroke="none">${numeral}</text></svg>`;
  }

  const GROUPS = {
    consistency: 'Consistency',
    mastery: 'Mastery',
    hsk: 'HSK Completion',
  };

  const BADGE_DEFS = [
    // --- Consistency: streaks ---
    { id: 'streak-3', group: 'consistency', name: 'Getting Started', description: '3-day streak', svg: SVG.sprout,
      check: (c) => (c.streak?.current || 0) >= 3 },
    { id: 'streak-7', group: 'consistency', name: 'Week Warrior', description: '7-day streak', svg: SVG.flame,
      check: (c) => (c.streak?.current || 0) >= 7 },
    { id: 'streak-30', group: 'consistency', name: 'Monthly Scholar', description: '30-day streak', svg: SVG.calendar,
      check: (c) => (c.streak?.current || 0) >= 30 },
    { id: 'streak-100', group: 'consistency', name: 'Centennial', description: '100-day streak', svg: SVG.laurel,
      check: (c) => (c.streak?.current || 0) >= 100 },

    // --- Mastery: literacy % ---
    { id: 'literacy-10', group: 'mastery', name: 'Foothold', description: '10% literacy', svg: SVG.acorn,
      check: (c) => (c.literacyPct || 0) >= 10 },
    { id: 'literacy-25', group: 'mastery', name: 'Daily News', description: '25% literacy', svg: SVG.newspaper,
      check: (c) => (c.literacyPct || 0) >= 25 },
    { id: 'literacy-50', group: 'mastery', name: 'Half-Literate', description: '50% literacy', svg: SVG.halfCircle,
      check: (c) => (c.literacyPct || 0) >= 50 },
    { id: 'literacy-75', group: 'mastery', name: 'Fluent Reader', description: '75% literacy', svg: SVG.openBook,
      check: (c) => (c.literacyPct || 0) >= 75 },
    { id: 'literacy-90', group: 'mastery', name: 'Native-ish', description: '90% literacy', svg: SVG.gradCap,
      check: (c) => (c.literacyPct || 0) >= 90 },

    // --- HSK completion ---
    { id: 'hsk-1', group: 'hsk', name: 'HSK 1', description: 'Complete HSK 1', svg: hskShield('I', 1),
      check: (c) => hskDone(c, 1) },
    { id: 'hsk-2', group: 'hsk', name: 'HSK 2', description: 'Complete HSK 2', svg: hskShield('II', 2),
      check: (c) => hskDone(c, 2) },
    { id: 'hsk-3', group: 'hsk', name: 'HSK 3', description: 'Complete HSK 3', svg: hskShield('III', 3),
      check: (c) => hskDone(c, 3) },
    { id: 'hsk-4', group: 'hsk', name: 'HSK 4', description: 'Complete HSK 4', svg: hskShield('IV', 4),
      check: (c) => hskDone(c, 4) },
    { id: 'hsk-5', group: 'hsk', name: 'HSK 5', description: 'Complete HSK 5', svg: hskShield('V', 5),
      check: (c) => hskDone(c, 5) },
    { id: 'hsk-6', group: 'hsk', name: 'HSK 6', description: 'Complete HSK 6', svg: hskShield('VI', 6),
      check: (c) => hskDone(c, 6) },
  ];

  function hskDone(ctx, level) {
    const d = ctx.hskCounts?.[level];
    return d && d.total > 0 && d.known >= d.total;
  }

  function getUnlockedMap() {
    const p = Storage.getProgress();
    return (p.badges && typeof p.badges === 'object') ? p.badges : {};
  }

  // One-time silent backfill: on first load after upgrade, mark already-earned
  // badges as unlocked without surfacing them on the next session summary.
  // Prevents a flood of "NEW ACHIEVEMENT" cards for users with existing progress.
  function backfillOnce() {
    const p = Storage.getProgress();
    if (p.badgesBackfilled) return;
    if (!p.badges || typeof p.badges !== 'object') p.badges = {};
    const ctx = {
      streak: p.streak,
      literacyPct: Data.getLiteracyPercent(),
      hskCounts: Data.getHSKCounts(),
    };
    const nowIso = new Date().toISOString();
    for (const def of BADGE_DEFS) {
      if (p.badges[def.id]) continue;
      let passed = false;
      try { passed = !!def.check(ctx); } catch { passed = false; }
      if (passed) p.badges[def.id] = { unlockedAt: nowIso, backfilled: true };
    }
    p.badgesBackfilled = true;
    Storage.saveProgress(p);
  }
  backfillOnce();

  function evaluate(ctx) {
    const p = Storage.getProgress();
    if (!p.badges || typeof p.badges !== 'object') p.badges = {};
    const newlyUnlocked = [];
    const nowIso = new Date().toISOString();
    for (const def of BADGE_DEFS) {
      if (p.badges[def.id]) continue;
      let passed = false;
      try { passed = !!def.check(ctx); } catch { passed = false; }
      if (passed) {
        p.badges[def.id] = { unlockedAt: nowIso };
        newlyUnlocked.push(def);
      }
    }
    if (newlyUnlocked.length > 0) {
      Storage.saveProgress(p);
    }
    const allUnlocked = BADGE_DEFS.filter(d => p.badges[d.id]);
    return { newlyUnlocked, allUnlocked };
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  }

  function renderGallery() {
    const unlocked = getUnlockedMap();
    const groupIds = Object.keys(GROUPS);
    return groupIds.map(groupId => {
      const defs = BADGE_DEFS.filter(d => d.group === groupId);
      const groupLabel = UI.esc(GROUPS[groupId]);
      const earnedCount = defs.filter(d => unlocked[d.id]).length;
      const items = defs.map(d => {
        const earned = unlocked[d.id];
        const cls = earned ? 'badge-item earned' : 'badge-item locked';
        const sub = earned ? formatDate(earned.unlockedAt) : d.description;
        const ariaLabel = earned
          ? `${d.name}, earned ${sub}`
          : `${d.name}, locked — ${d.description}`;
        return `
          <div class="${cls}" data-group="${UI.esc(d.group)}" title="${UI.esc(d.name)} — ${UI.esc(d.description)}">
            <div class="badge-icon" role="img" aria-label="${UI.esc(ariaLabel)}">${d.svg}</div>
            <div class="badge-name">${UI.esc(d.name)}</div>
            <div class="badge-sub">${UI.esc(sub)}</div>
          </div>
        `;
      }).join('');
      return `
        <div class="badges-group">
          <div class="badges-group-header">
            <span class="badges-group-label">${groupLabel}</span>
            <span class="badges-group-count">${earnedCount}/${defs.length}</span>
          </div>
          <div class="badges-grid">${items}</div>
        </div>
      `;
    }).join('');
  }

  // Inline achievement card for session summaries.
  function renderEarnedCard(defs) {
    if (!defs || defs.length === 0) return '';
    const rows = defs.map(d => `
      <div class="badge-earned-row" data-group="${UI.esc(d.group)}">
        <div class="badge-earned-icon" role="img" aria-label="${UI.esc(d.name)}">${d.svg}</div>
        <div class="badge-earned-text">
          <div class="badge-earned-name">${UI.esc(d.name)}</div>
          <div class="badge-earned-desc">${UI.esc(d.description)}</div>
        </div>
      </div>
    `).join('');
    const heading = defs.length > 1 ? 'NEW ACHIEVEMENTS' : 'NEW ACHIEVEMENT';
    const sharedGroup = defs.every(d => d.group === defs[0].group) ? defs[0].group : null;
    const groupAttr = sharedGroup ? ` data-group="${UI.esc(sharedGroup)}"` : '';
    return `
      <div class="badge-earned-card fade-in"${groupAttr}>
        <div class="badge-earned-heading">${heading}</div>
        ${rows}
      </div>
    `;
  }

  return { BADGE_DEFS, GROUPS, evaluate, renderGallery, renderEarnedCard };
})();

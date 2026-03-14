# Hanzi Reader

Chinese character reading flashcard PWA for heritage Mandarin speakers. Teaches character recognition (not writing) using spaced repetition. No backend — fully static site deployed to GitHub Pages.

## Architecture

- **Vanilla JS**, no framework, no build step, no bundler
- Hash-based routing with 4 screens: Home (`#home`), Study (`#study`), Browse (`#browse`), Stats (`#stats`)
- Data: 2,400 characters merged from hanziDB + Make Me a Hanzi + CC-CEDICT
- SRS: FSRS v6 via ts-fsrs (CDN load with hardcoded fallback scheduling)
- Storage: localStorage with in-memory cache (keys: `hanzi_srs`, `hanzi_progress`)
- PWA: service worker (cache-first), manifest.json
- Offline-first: all data pre-bundled, no runtime API calls

## File Structure

```TXT
index.html              App shell + tab bar + script loading order
css/styles.css          Design system (CSS custom properties, light/dark themes, tone colors)
js/app.js               Router, theme management, screen init
js/storage.js           localStorage abstraction + in-memory cache + import/export validation
js/data.js              Query layer over CHAR_DATA (search, filter, literacy calc, state counts)
js/ui.js                Shared: tone colors, pinyin rendering, modals, HTML escaping (UI.esc)
js/srs.js               ts-fsrs wrapper with fallback scheduling + interval preview
js/home.js              Home screen (streak, literacy %, due count, session summary)
js/study.js             Study loop (new card intro+quiz, review with progressive reveal, mini-reviews)
js/browse.js            Character grid with search/filter/radical filter + detail modal
js/stats.js             Stats display + settings (new cards/day, theme) + export/import
data/char_data.js       Generated character database (~1.2MB, 2,400 chars)
build/build_data.py     Offline Python script to regenerate char_data.js from sources
build/sources/          Raw data files (gitignored, ~20MB)
sw.js                   Service worker (cache version: v3)
manifest.json           PWA manifest
```

## Script Loading Order (Critical)

Scripts must load in this order (see index.html):

1. `data/char_data.js` — defines `window.CHAR_DATA`, `window.LEARN_ORDER`, `window.RADICAL_DATA`
2. `js/storage.js` — no dependencies
3. `js/data.js` — depends on CHAR_DATA, Storage
4. `js/ui.js` — depends on Data, Storage
5. `js/srs.js` — depends on Storage
6. `js/home.js` through `js/stats.js` — screen modules
7. `js/app.js` — router, depends on all screens

## Data Schemas

### Character Data (`window.CHAR_DATA`)

Object keyed by character. Each entry:

```js
{ f: 1,           // frequency rank (1-2400)
  p: "mā",        // pinyin with tone marks
  d: "mother",    // English definition
  r: "女",         // radical
  s: 6,           // stroke count
  h: 1,           // HSK level
  dc: "⿰女马",    // decomposition
  et: "ps",       // etymology type: p=pictographic, ic=ideographic, ps=phono-semantic
  eh: "...",       // etymology hint
  cw: [["妈妈","māma","mother"], ...] } // compound words [chars, pinyin, def]
```

### SRS State (`localStorage: hanzi_srs`)

Object keyed by character. Each entry:

```js
{ due: "ISO date",  stability: N, difficulty: N,
  elapsed_days: N,  scheduled_days: N, reps: N, lapses: N,
  state: 0-3,       // 0=new, 1=learning, 2=review, 3=relearning
  last_review: "ISO date" }
```

### Progress (`localStorage: hanzi_progress`)

```js
{ streak: { current: 0, longest: 0, lastDate: null },
  daily: { "2026-03-14": { reviews: 10, newCards: 2, correct: 8, timeMs: 0 } },
  settings: { newPerDay: 25, theme: "system", placementDone: false, currentIndex: 0 } }
```

## Study Flow

1. **New Card Phase**: Show character + pinyin + definition + compounds → Quiz (pick correct char from 4 options) → If correct: rated "Good", added to mini-review queue
2. **Review Phase**: Progressive reveal (tap to show: pinyin → definition → compounds) → Rate: Again/Hard/Good/Easy
3. **Mini-reviews**: Newly learned cards re-appear after a few cards for reinforcement
4. **Session end**: Summary shown, streak updated

## Key Conventions

- All data rendered to innerHTML MUST be escaped via `UI.esc()` to prevent XSS
- CSP header restricts scripts to self-only
- Service worker cache version in `sw.js` must be bumped when deploying changes
- Default 25 new cards/day, slider range 5-50
- Tone colors: tone 1 (red), tone 2 (orange), tone 3 (green), tone 4 (blue), tone 5/neutral (gray)
- SRS state colors: new (purple), learning (amber), known (green), relearning (red)
- Literacy % is frequency-weighted (knowing common chars counts more)

## Build Process

To regenerate character data from sources:

```bash
cd build && python3 build_data.py
```

Requires source files in `build/sources/` (gitignored): hanziDB.csv, dictionary.txt, cedict.txt, word_freq.txt

## Deployment

- GitHub Pages from main branch: <https://dnxie12.github.io/hanzireader/>
- Push to main auto-deploys
- Remember to bump `CACHE_NAME` in `sw.js` after changes

## Plan

Full design doc: ~/.claude/plans/reactive-seeking-cook.md
Covers: learning methodology, data pipeline, implementation phases, visual design

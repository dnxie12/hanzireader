# Hanzi Reader

Chinese character reading flashcard PWA for heritage Mandarin speakers. No backend — static site deployed to GitHub Pages.

## Architecture
- **Vanilla JS**, no framework, no build step
- Hash-based routing with 4 screens: Home, Study, Browse, Stats
- Data: 2,400 characters merged from hanziDB + Make Me a Hanzi + CC-CEDICT
- SRS: FSRS v6 via ts-fsrs (CDN, with local fallback scheduling)
- Storage: localStorage with in-memory cache (keys: `hanzi_srs`, `hanzi_progress`)
- PWA: service worker (cache-first), manifest.json

## File Structure
```
index.html              App shell + tab bar + script loading
css/styles.css          Design system (themes, typography, layout)
js/app.js               Router, theme, init
js/storage.js           localStorage abstraction + in-memory cache + import validation
js/data.js              Query layer over CHAR_DATA (search, filter, literacy calc)
js/ui.js                Shared: tone colors, pinyin rendering, modals, HTML escaping (UI.esc)
js/srs.js               ts-fsrs wrapper with fallback scheduling
js/home.js              Home screen (streak, literacy %, forecast)
js/study.js             Study loop (progressive reveal, new card quiz, session summary)
js/browse.js            Character grid with search/filter + detail modal
js/stats.js             Stats + settings + export/import
data/char_data.js       Generated character database (~1.2MB, 2,400 chars)
build/build_data.py     Offline script to regenerate char_data.js from sources
build/sources/          Raw data files (gitignored)
sw.js                   Service worker
```

## Key Conventions
- All data rendered to innerHTML MUST be escaped via `UI.esc()`
- Script loading order matters (see index.html): data → storage → data → ui → srs → screens → app
- CSP header restricts scripts to self-only
- Service worker cache version must be bumped when deploying changes
- Default 25 new cards/day, slider max 50

## Deployment
- GitHub Pages from main branch: https://dnxie12.github.io/hanzireader/
- Push to main auto-deploys

## Plan
Full design doc: ~/.claude/plans/reactive-seeking-cook.md
Covers: learning methodology, data pipeline, implementation phases, visual design

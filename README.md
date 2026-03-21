# Hanzi Reader

**Chinese character reading flashcards for heritage Mandarin speakers.**

[hanzireader.xyz](https://hanzireader.xyz)

Hanzi Reader teaches character *recognition* — not writing, not grammar — through spaced repetition flashcards and contextual reading practice. It's designed for heritage speakers who understand spoken Mandarin but want to build reading literacy.

The app runs entirely in the browser. No account needed, no server, no tracking. Install it as a PWA on your phone and use it offline.

## How It Works

### Placement Test

On first launch, a quick placement test calibrates your starting point so you skip characters you already know and jump straight into useful material.

### Flashcard Study

The core study loop introduces new characters and reviews ones you've seen before, using the FSRS spaced repetition algorithm to schedule cards at optimal intervals.

- **New cards**: See the character with its pinyin, definition, and example words, then pick it out of four options in a quiz
- **Reviews**: Tap to progressively reveal pinyin, definition, and compounds, then rate your recall (Again / Hard / Good / Easy)
- **Mini-reviews**: Newly learned characters reappear a few cards later for reinforcement within the same session
- **Daily pacing**: Configurable new cards per day (5–50, default 25), plus whatever reviews are due

### Reading Practice

Once you know 20+ characters, short 3-sentence Chinese passages unlock for contextual practice. Passages are selected to sit in your sweet spot — mostly characters you know, with a few new ones to stretch.

While reading:

- Tap any character to see its pinyin and definition
- Flag unfamiliar characters for priority review in your next study session
- Visual underlines show what you know (solid), what you're learning (colored), and what's new (dotted)

Passages span everyday life, family, food, weather, travel, nature, work, and society, grouped into four difficulty tiers.

### Character Browser

Browse all 2,400 characters in a searchable, filterable grid. Search by character, pinyin (tone marks optional), or English meaning. Filter by SRS state or radical. Tap any character for its full detail card: pinyin, definition, radical, stroke count, frequency rank, etymology, decomposition, and compound words.

### Progress Tracking

- **Literacy percentage**: Frequency-weighted — knowing common characters counts more
- **Day streak**: Consecutive days with at least one review
- **Session stats**: Cards reviewed, new cards learned, accuracy
- **Data export/import**: Back up your progress as JSON, restore it on another device

## Features

- **Offline-first**: All data is bundled in the app — no internet needed after first load
- **Installable PWA**: Add to home screen on iOS or Android for a native app feel
- **Light and dark themes**: Follows system preference, or set manually
- **Tone-colored pinyin**: Tones 1–4 are color-coded (red, orange, green, blue) throughout the app
- **2,400 characters**: Covering HSK levels 1–6, ordered by frequency
- **120+ reading passages**: Generated across 8 topics and 4 difficulty tiers
- **No account required**: Everything stays in your browser's local storage

## Technical Overview

Hanzi Reader is a fully static single-page app — vanilla JavaScript, no framework, no build step, no bundler. It deploys to GitHub Pages directly from the `main` branch.

### Stack

| Layer | Implementation |
|---|---|
| UI | Vanilla JS, hash-based routing, CSS custom properties |
| SRS | [FSRS v6](https://github.com/open-spaced-repetition/ts-fsrs) (vendored UMD bundle) with fallback scheduler |
| Data | 2,400 characters merged from hanziDB + Make Me a Hanzi + CC-CEDICT |
| Storage | localStorage with in-memory cache |
| Offline | Service worker (cache-first strategy) |
| Hosting | GitHub Pages, custom domain via CNAME |

### Data Pipeline

Character data is built offline from three open-source datasets:

```
hanziDB.csv + dictionary.txt + cedict.txt + word_freq.txt
        ↓ build/build_data.py
    data/char_data.js (2,400 characters)
```

Reading passages are generated via the Claude API and cached:

```
build/build_snippets.py → data/snippets.js (120+ passages)
```

### Project Structure

```
index.html              App shell and script loading
css/styles.css          Design system (themes, tone colors, layout)
js/app.js               Router and screen initialization
js/storage.js           localStorage abstraction
js/data.js              Character queries, search, filtering
js/ui.js                Shared UI utilities (tone colors, modals, escaping)
js/srs.js               FSRS wrapper with fallback scheduling
js/home.js              Home screen
js/read.js              Reading practice
js/study.js             Flashcard study loop
js/browse.js            Character browser
js/stats.js             Stats and settings
data/char_data.js       Character database
data/snippets.js        Reading passages
build/                  Offline data generation scripts
```

#!/usr/bin/env python3
"""
build_data.py — Merge hanziDB + Make Me a Hanzi + CC-CEDICT into char_data.js

Produces data/char_data.js with:
  - window.CHAR_DATA: top 2,400 characters by frequency
  - window.LEARN_ORDER: teaching sequence (frequency + radical batching)
  - window.RADICAL_DATA: radical reference data

Sources (all in build/sources/):
  - hanziDB.csv: frequency rank, pinyin, definition, radical, strokes
  - dictionary.txt: Make Me a Hanzi (NDJSON) — decomposition, etymology
  - cedict.txt: CC-CEDICT — compound words
  - word_freq.txt: jieba dict.txt.big — word frequency data (MIT licensed)
    Download: https://github.com/fxsjy/jieba/raw/master/extra_dict/dict.txt.big

Usage:
  python3 build/build_data.py
"""

import csv
import json
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

# --- Paths ---
BASE = Path(__file__).parent
SOURCES = BASE / "sources"
OUTPUT = BASE.parent / "data" / "char_data.js"

HANZIDB_PATH = SOURCES / "hanziDB.csv"
MMAH_PATH = SOURCES / "dictionary.txt"  # Make Me a Hanzi
CEDICT_PATH = SOURCES / "cedict.txt"
WORD_FREQ_PATH = SOURCES / "word_freq.txt"

TOP_N = 2400
MAX_COMPOUNDS_PER_CHAR = 8

# Patterns in CC-CEDICT definitions that indicate proper nouns / low-value entries
PROPER_NOUN_RE = re.compile(
    r"\(Japanese |Japanese surname|Japanese company"
    r"|Korean surname"
    r"|county in |township in |district in |prefecture"
    r"|province in | city in "
    r"|stage name of ",
    re.IGNORECASE,
)

# --- Tone number to tone mark conversion ---
TONE_MARKS = {
    "a": ["ā", "á", "ǎ", "à", "a"],
    "e": ["ē", "é", "ě", "è", "e"],
    "i": ["ī", "í", "ǐ", "ì", "i"],
    "o": ["ō", "ó", "ǒ", "ò", "o"],
    "u": ["ū", "ú", "ǔ", "ù", "u"],
    "v": ["ǖ", "ǘ", "ǚ", "ǜ", "ü"],  # ü
}


def tone_number_to_mark(syllable):
    """Convert pinyin with tone number (e.g., 'ma1') to tone mark (e.g., 'mā')."""
    syllable = syllable.strip().lower()
    if not syllable:
        return syllable

    # Extract tone number
    if syllable[-1].isdigit():
        tone = int(syllable[-1])
        syllable = syllable[:-1]
    else:
        tone = 5  # neutral

    if tone == 5 or tone == 0:
        return syllable.replace("v", "ü").replace("u:", "ü")

    tone_idx = tone - 1  # 0-indexed

    # Replace u: or v with ü marker
    syllable = syllable.replace("u:", "v")

    # Tone mark placement rules:
    # 1. If there's an 'a' or 'e', it takes the mark
    # 2. If there's 'ou', 'o' takes the mark
    # 3. Otherwise, the second vowel takes the mark
    for vowel in ["a", "e"]:
        if vowel in syllable:
            return syllable.replace(vowel, TONE_MARKS[vowel][tone_idx], 1)

    if "ou" in syllable:
        return syllable.replace("o", TONE_MARKS["o"][tone_idx], 1)

    # Find the last vowel
    for i in range(len(syllable) - 1, -1, -1):
        if syllable[i] in TONE_MARKS:
            return syllable[:i] + TONE_MARKS[syllable[i]][tone_idx] + syllable[i + 1 :]

    return syllable.replace("v", "ü")


def convert_cedict_pinyin(pinyin_str):
    """Convert CC-CEDICT pinyin like 'shou3 ji1' to 'shǒujī'."""
    syllables = pinyin_str.strip().split()
    converted = [tone_number_to_mark(s) for s in syllables]
    return "".join(converted)


# --- Step 1: Parse hanziDB ---
def parse_hanzidb():
    """Parse hanziDB.csv, return dict keyed by character."""
    chars = {}
    with open(HANZIDB_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rank = row.get("frequency_rank", "").strip()
            if not rank or not rank.isdigit():
                continue
            rank = int(rank)
            if rank > TOP_N:
                continue

            char = row.get("character", "").strip()
            if not char or len(char) != 1:
                continue

            # Clean up pinyin — hanziDB uses tone numbers sometimes
            pinyin = row.get("pinyin", "").strip()
            # Some entries have multiple readings separated by comma
            primary_pinyin = pinyin.split(",")[0].strip()

            definition = row.get("definition", "").strip()
            # Clean up definition — remove extra quotes
            if definition.startswith('"') and definition.endswith('"'):
                definition = definition[1:-1]
            # Truncate long definitions
            if len(definition) > 80:
                definition = definition[:77] + "..."

            radical = row.get("radical", "").strip()
            strokes = row.get("stroke_count", "0").strip()
            hsk = row.get("hsk_level", "").strip()

            chars[char] = {
                "f": rank,
                "p": primary_pinyin,
                "d": definition,
                "r": radical,
                "s": int(strokes) if strokes.isdigit() else 0,
                "h": int(hsk) if hsk.isdigit() else 0,
            }

    print(f"  hanziDB: {len(chars)} characters (top {TOP_N})")
    return chars


# --- Step 2: Parse Make Me a Hanzi ---
def parse_makemeahanzi():
    """Parse dictionary.txt (NDJSON), return dict keyed by character."""
    data = {}
    with open(MMAH_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            char = entry.get("character", "")
            if not char or len(char) != 1:
                continue

            decomposition = entry.get("decomposition", "")
            etymology = entry.get("etymology", {})
            et_type = ""
            et_hint = ""
            if isinstance(etymology, dict):
                et_type = etymology.get("type", "")
                et_hint = etymology.get("hint", "")
                # Shorten type names
                type_map = {
                    "pictographic": "p",
                    "ideographic": "ic",
                    "pictophonetic": "s",  # phono-semantic
                }
                et_type = type_map.get(et_type, et_type)

            data[char] = {
                "dc": decomposition,
                "et": et_type,
                "eh": et_hint,
            }

    print(f"  Make Me a Hanzi: {len(data)} entries")
    return data


# --- Step 3: Load word frequencies ---
def load_word_frequencies():
    """Parse jieba dict.txt.big: 'word freq pos' per line, space-separated."""
    freq = {}
    with open(WORD_FREQ_PATH, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 2:
                try:
                    freq[parts[0]] = int(parts[1])
                except ValueError:
                    continue
    print(f"  Word frequencies: {len(freq)} entries")
    return freq


# --- Step 4: Parse CC-CEDICT (ranked by word frequency) ---
def parse_cedict(char_set, word_freq):
    """
    Parse CC-CEDICT, find compound words where ALL constituent chars are in char_set.
    Rank by actual word frequency (from jieba), penalizing proper nouns.
    Return dict: char -> list of [compound, pinyin, definition].
    """
    compounds = defaultdict(list)  # char -> [(compound, pinyin, def, freq_score)]

    with open(CEDICT_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            # Format: 繁體 简体 [pin1 yin1] /def1/def2/
            match = re.match(r"^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.+)/$", line)
            if not match:
                continue

            traditional, simplified, pinyin_raw, defs = match.groups()

            # Use simplified
            word = simplified

            # Only want 2-4 character compounds
            if len(word) < 2 or len(word) > 4:
                continue

            # All characters must be in our set
            if not all(c in char_set for c in word):
                continue

            # Convert pinyin
            pinyin = convert_cedict_pinyin(pinyin_raw)

            # Get first definition, clean up
            definition = defs.split("/")[0].strip()
            # Skip entries that are just pinyin or references
            if definition.startswith("variant of") or definition.startswith("see "):
                continue
            # Truncate
            if len(definition) > 40:
                definition = definition[:37] + "..."

            # Score by actual word frequency (higher freq = lower score = ranked first)
            wf = word_freq.get(word, 0)
            is_proper = bool(PROPER_NOUN_RE.search(defs))

            if wf > 0:
                effective_freq = wf // 100 if is_proper else wf
                freq_score = -effective_freq
            else:
                # Fallback for words not in frequency dict
                avg_rank = sum(char_set.get(c, {}).get("f", 9999) for c in word) / len(
                    word
                )
                length_penalty = {2: 0, 3: 500, 4: 1000}.get(len(word), 1500)
                proper_penalty = 5000 if is_proper else 0
                freq_score = avg_rank + length_penalty + proper_penalty + 10000

            # Add to each constituent character's compound list
            for c in word:
                if c in char_set:
                    compounds[c].append((word, pinyin, definition, freq_score))

    # Sort by frequency score (lower = more common) and take top N per character
    result = {}
    for char, cw_list in compounds.items():
        # Deduplicate by word, keeping best (lowest) score
        best = {}
        for item in cw_list:
            w = item[0]
            if w not in best or item[3] < best[w][3]:
                best[w] = item
        unique = list(best.values())

        unique.sort(key=lambda x: x[3])
        result[char] = [[w, p, d] for w, p, d, _ in unique[:MAX_COMPOUNDS_PER_CHAR]]

    print(f"  CC-CEDICT: {len(result)} characters with compound words")
    return result


# --- Step 4b: Load enriched etymology cache ---
def load_etymology_cache():
    """Load AI-generated etymology descriptions from cache."""
    cache_path = SOURCES / "etymology_cache.json"
    if not cache_path.exists():
        print("  Etymology cache: not found (using Make Me a Hanzi hints)")
        return {}
    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"  Etymology cache: {len(data)} entries")
    return data


# --- Step 5: Generate learning order ---
def generate_learn_order(chars):
    """
    Frequency-based with radical-family batching within tiers.
    Phase 1: Top radicals as standalone characters
    Phase 2-3: Frequency tiers of 50, grouped by radical within each tier
    Phase 4: Pure frequency
    """
    # Sort all characters by frequency
    sorted_chars = sorted(chars.keys(), key=lambda c: chars[c]["f"])

    # Phase 1: Common radicals that are also standalone characters (first ~25)
    common_radicals = [
        "一",
        "人",
        "大",
        "口",
        "女",
        "子",
        "小",
        "山",
        "木",
        "水",
        "火",
        "土",
        "日",
        "月",
        "金",
        "手",
        "心",
        "目",
        "刀",
        "力",
        "门",
        "马",
        "王",
        "石",
        "田",
    ]
    phase1 = [r for r in common_radicals if r in chars]

    remaining = [c for c in sorted_chars if c not in phase1]

    # Phase 2-3 (up to rank ~1500): batch by radical within tiers of 50
    phase23 = []
    tier_size = 50
    cutoff = min(1500, len(remaining))

    for start in range(0, cutoff, tier_size):
        tier = remaining[start : start + tier_size]
        # Group by radical
        radical_groups = defaultdict(list)
        for c in tier:
            radical_groups[chars[c]["r"]].append(c)
        # Output radical groups together, sorted by group size (largest first)
        for radical in sorted(radical_groups, key=lambda r: -len(radical_groups[r])):
            phase23.extend(radical_groups[radical])

    # Phase 4: remaining characters in pure frequency order
    used = set(phase1 + phase23)
    phase4 = [c for c in remaining if c not in used]

    order = phase1 + phase23 + phase4
    print(
        f"  Learn order: {len(order)} characters ({len(phase1)} phase 1, {len(phase23)} phase 2-3, {len(phase4)} phase 4)"
    )
    return order


# --- Step 6: Build radical reference data ---
def build_radical_data(chars):
    """Build radical reference with examples."""
    radical_chars = defaultdict(list)
    for char, info in chars.items():
        radical_chars[info["r"]].append((char, info["f"]))

    radicals = []
    for radical, char_list in sorted(radical_chars.items(), key=lambda x: -len(x[1])):
        if len(char_list) < 2:
            continue
        # Sort examples by frequency
        char_list.sort(key=lambda x: x[1])
        examples = [c for c, _ in char_list[:6]]

        # Try to get radical info from the chars or Make Me a Hanzi
        pinyin = ""
        desc = ""
        if radical in chars:
            pinyin = chars[radical]["p"]
            desc = chars[radical]["d"]

        radicals.append(
            {
                "r": radical,
                "p": pinyin,
                "d": desc,
                "ex": examples,
            }
        )

    print(f"  Radical data: {len(radicals)} radicals")
    return radicals


# --- Step 7: Merge and output ---
def main():
    print("Building char_data.js...\n")

    print("Step 1: Parsing hanziDB...")
    chars = parse_hanzidb()

    print("Step 2: Parsing Make Me a Hanzi...")
    mmah = parse_makemeahanzi()

    print("Step 3: Loading word frequencies...")
    word_freq = load_word_frequencies()

    print("Step 4: Parsing CC-CEDICT...")
    compounds = parse_cedict(chars, word_freq)

    print("Step 4b: Loading etymology cache...")
    etymology_cache = load_etymology_cache()

    # Merge Make Me a Hanzi data
    print("Step 5: Merging data...")
    for char in chars:
        if char in mmah:
            chars[char]["dc"] = mmah[char]["dc"]
            chars[char]["et"] = mmah[char]["et"]
            # Prefer enriched etymology from cache, fall back to Make Me a Hanzi
            chars[char]["eh"] = etymology_cache.get(char, mmah[char]["eh"])
        else:
            chars[char]["dc"] = ""
            chars[char]["et"] = ""
            chars[char]["eh"] = etymology_cache.get(char, "")

        if char in compounds:
            chars[char]["cw"] = compounds[char]
        else:
            chars[char]["cw"] = []

    chars_with_compounds = sum(1 for c in chars if chars[c]["cw"])
    print(f"  Merged: {len(chars)} chars, {chars_with_compounds} with compound words")

    print("Step 6: Generating learn order...")
    learn_order = generate_learn_order(chars)

    print("Step 7: Building radical data...")
    radical_data = build_radical_data(chars)

    # Output
    print("Step 8: Writing char_data.js...")

    # Build the JS output
    lines = [
        "// Auto-generated by build_data.py — DO NOT EDIT",
        f"// {len(chars)} characters from hanziDB + Make Me a Hanzi + CC-CEDICT",
        f'// Generated: {__import__("datetime").datetime.now().isoformat()[:19]}',
        "",
    ]

    # CHAR_DATA
    lines.append("window.CHAR_DATA = {")
    for char in learn_order:
        info = chars[char]
        # Build compact JSON for this entry
        entry = {
            "f": info["f"],
            "p": info["p"],
            "d": info["d"],
            "r": info["r"],
            "s": info["s"],
            "h": info["h"],
        }
        if info.get("dc"):
            entry["dc"] = info["dc"]
        if info.get("et"):
            entry["et"] = info["et"]
        if info.get("eh"):
            entry["eh"] = info["eh"]
        if info.get("cw"):
            entry["cw"] = info["cw"]

        json_str = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        lines.append(f'  "{char}":{json_str},')

    lines.append("};")
    lines.append("")

    # LEARN_ORDER
    order_json = json.dumps(learn_order, ensure_ascii=False)
    lines.append(f"window.LEARN_ORDER = {order_json};")
    lines.append("")

    # RADICAL_DATA
    radical_json = json.dumps(radical_data, ensure_ascii=False, separators=(",", ":"))
    lines.append(f"window.RADICAL_DATA = {radical_json};")
    lines.append("")

    output_text = "\n".join(lines)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(output_text)

    size_kb = os.path.getsize(OUTPUT) / 1024
    print(f"\nDone! Wrote {OUTPUT} ({size_kb:.0f} KB)")
    print(f"  Characters: {len(chars)}")
    print(f"  With compounds: {chars_with_compounds}")
    print(f"  Radicals: {len(radical_data)}")

    # Spot check
    print("\nSpot check:")
    for sample in ["的", "机", "河", "好", "学", "木", "水", "金", "田", "人"]:
        if sample in chars:
            info = chars[sample]
            cw = info.get("cw", [])
            cw_str = ", ".join(c[0] for c in cw[:3]) if cw else "(none)"
            print(
                f"  {sample} [{info['p']}] #{info['f']} — {info['d'][:40]} — compounds: {cw_str}"
            )


if __name__ == "__main__":
    main()

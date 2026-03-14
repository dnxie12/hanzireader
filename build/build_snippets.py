#!/usr/bin/env python3
"""
Generate reading practice snippets for Hanzi Reader using Claude API.

Usage:
    ANTHROPIC_API_KEY=sk-... python3 build_snippets.py

Output: ../data/snippets.js (window.SNIPPET_DATA)

The generated file is committed to the repo so collaborators
don't need an API key for normal builds.
"""

import json
import hashlib
import os
import re
import sys
import time

# --- Configuration ---
SNIPPETS_PER_BUCKET = 20
BUCKET_SIZE = 120  # chars per coverage bucket
SENTENCES_PER_SNIPPET = 3
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "snippets.js")

TOPICS = [
    "daily life",
    "family",
    "food and cooking",
    "weather and seasons",
    "school and learning",
    "work and career",
    "travel",
    "nature",
    "friendship",
    "health",
    "shopping",
    "hobbies",
    "city life",
    "history and culture",
    "technology",
]

TOPIC_MAP = {
    "daily life": "everyday",
    "family": "family",
    "food and cooking": "food",
    "weather and seasons": "weather",
    "school and learning": "everyday",
    "work and career": "work",
    "travel": "travel",
    "nature": "nature",
    "friendship": "everyday",
    "health": "everyday",
    "shopping": "everyday",
    "hobbies": "everyday",
    "city life": "society",
    "history and culture": "society",
    "technology": "society",
}

CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")


def load_learn_order():
    """Load LEARN_ORDER from char_data.js"""
    char_data_path = os.path.join(
        os.path.dirname(__file__), "..", "data", "char_data.js"
    )
    with open(char_data_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract LEARN_ORDER array
    match = re.search(r"window\.LEARN_ORDER\s*=\s*\[(.*?)\];", content, re.DOTALL)
    if not match:
        print("ERROR: Could not find LEARN_ORDER in char_data.js")
        sys.exit(1)

    # Parse the JSON array content
    chars_str = "[" + match.group(1) + "]"
    return json.loads(chars_str)


def load_char_data():
    """Load CHAR_DATA keys from char_data.js"""
    char_data_path = os.path.join(
        os.path.dirname(__file__), "..", "data", "char_data.js"
    )
    with open(char_data_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract all character keys (single CJK characters used as object keys)
    keys = re.findall(r'"(' + CJK_RE.pattern + r')":\{', content)
    return set(keys)


def make_buckets(learn_order):
    """Group LEARN_ORDER into coverage buckets."""
    buckets = []
    for i in range(0, len(learn_order), BUCKET_SIZE):
        bucket_chars = learn_order[i : i + BUCKET_SIZE]
        # Cumulative: all chars up to this bucket
        all_chars_so_far = learn_order[: i + BUCKET_SIZE]
        buckets.append(
            {
                "index": len(buckets),
                "new_chars": bucket_chars,
                "all_chars": all_chars_so_far,
                "char_set": "".join(all_chars_so_far),
            }
        )
    return buckets


def generate_snippet_prompt(allowed_chars, topic, bucket_size):
    """Build the prompt for Claude API."""
    # For small vocabularies, emphasize simplicity
    if bucket_size < 300:
        difficulty = "very simple, using basic everyday vocabulary"
    elif bucket_size < 800:
        difficulty = "simple and conversational"
    else:
        difficulty = "natural and conversational"

    return f"""Write a {difficulty} {SENTENCES_PER_SNIPPET}-sentence passage in modern simplified Chinese about: {topic}

The passage should sound like something a native Mandarin speaker would actually say or write — natural phrasing, not a vocabulary exercise. Prioritize idiomatic, conversational Chinese over using every available character.

CHARACTER CONSTRAINT: Strongly prefer characters from the list below. An occasional common character outside the list is acceptable if it makes the sentence sound natural, but avoid it when possible.

<preferred_characters>
{allowed_chars}
</preferred_characters>

Rules:
- Standard punctuation (。，！？) and numbers are allowed
- Each sentence should be 8-20 characters long
- No pinyin, no English, no explanations, no self-correction
- Output ONLY the Chinese passage, nothing else"""


def call_claude_api(prompt, api_key):
    """Call Claude API to generate a snippet."""
    import urllib.request
    import urllib.error

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    data = json.dumps(
        {
            "model": "claude-sonnet-4-6",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=data,
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["content"][0]["text"].strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  API error {e.code}: {body[:300]}")
        return None
    except Exception as e:
        print(f"  API error: {e}")
        return None


def validate_snippet(text, allowed_chars_set, char_data_set):
    """Validate that a snippet uses mostly allowed characters.

    Allows up to 10% of unique CJK characters to be outside the allowed set,
    as long as those violations are still in CHAR_DATA (the 2,400 char universe).
    """
    # Reject if response contains English reasoning (model self-correction leakage)
    if re.search(r"[a-zA-Z]{3,}", text):
        return False, "Contains English text"

    cjk_chars = CJK_RE.findall(text)
    if len(cjk_chars) < 10:
        return False, "Too short"

    unique_cjk = list(dict.fromkeys(cjk_chars))
    violations = [c for c in unique_cjk if c not in allowed_chars_set]
    violation_ratio = len(violations) / len(unique_cjk) if unique_cjk else 0

    # Reject if more than 25% of unique chars are outside the allowed set
    if violation_ratio > 0.25:
        return (
            False,
            f"Too many violations ({violation_ratio:.0%}): {''.join(violations)}",
        )

    # Reject if any violation is completely outside the 2,400 char universe
    unknown_violations = [c for c in violations if c not in char_data_set]
    if unknown_violations:
        return False, f"Unknown chars: {''.join(unknown_violations)}"

    # Check sentence structure (at least one sentence-ending punctuation)
    sentence_ends = len(re.findall(r"[。！？]", text))
    if sentence_ends < 2:
        return False, "Too few sentences"

    return True, "OK"


def compute_snippet_metadata(text, char_data_set, learn_order):
    """Compute metadata for a validated snippet."""
    cjk_chars = CJK_RE.findall(text)
    unique_chars = list(dict.fromkeys(cjk_chars))  # ordered dedup

    # Compute static difficulty from median frequency rank
    # (approximate using position in LEARN_ORDER)
    positions = []
    for c in unique_chars:
        if c in learn_order:
            positions.append(learn_order.index(c))
    median_pos = sorted(positions)[len(positions) // 2] if positions else 9999

    if median_pos < 200:
        static_diff = 1
    elif median_pos < 500:
        static_diff = 2
    elif median_pos < 1000:
        static_diff = 3
    else:
        static_diff = 4

    sentence_count = len(re.findall(r"[。！？]", text))

    # Stable ID from text hash
    text_hash = hashlib.md5(text.encode("utf-8")).hexdigest()[:6]

    return {
        "id": text_hash,
        "unique_chars": unique_chars,
        "sentence_count": max(1, sentence_count),
        "static_diff": static_diff,
    }


def format_output(snippets):
    """Format snippets as window.SNIPPET_DATA JavaScript."""
    lines = [
        "// Auto-generated reading snippets — regenerate with build/build_snippets.py"
    ]
    lines.append(
        f'// {len(snippets)} snippets generated: {time.strftime("%Y-%m-%dT%H:%M:%S")}'
    )
    lines.append("")
    lines.append("window.SNIPPET_DATA = [")

    for i, s in enumerate(snippets):
        chars_json = json.dumps(s["chars"], ensure_ascii=False)
        text_json = json.dumps(s["text"], ensure_ascii=False)
        topic_json = json.dumps(s["topic"], ensure_ascii=False)
        comma = "," if i < len(snippets) - 1 else ""

        lines.append(f"  {{")
        lines.append(f'    id: "{s["id"]}",')
        lines.append(f"    text: {text_json},")
        lines.append(f"    chars: {chars_json},")
        lines.append(f'    sentenceCount: {s["sentenceCount"]},')
        lines.append(f'    staticDiff: {s["staticDiff"]},')
        lines.append(f"    topic: {topic_json}")
        lines.append(f"  }}{comma}")

    lines.append("];")
    return "\n".join(lines)


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: Set ANTHROPIC_API_KEY environment variable")
        print("Usage: ANTHROPIC_API_KEY=sk-... python3 build_snippets.py")
        sys.exit(1)

    print("Loading character data...")
    learn_order = load_learn_order()
    char_data_set = load_char_data()
    print(f"  {len(learn_order)} chars in LEARN_ORDER")
    print(f"  {len(char_data_set)} chars in CHAR_DATA")

    buckets = make_buckets(learn_order)
    print(f"  {len(buckets)} coverage buckets of {BUCKET_SIZE} chars each")

    all_snippets = []
    topic_index = 0

    for bucket in buckets:
        bucket_num = bucket["index"]
        allowed_set = set(bucket["all_chars"])
        char_str = bucket["char_set"]

        # Skip very early buckets (too few chars for natural text)
        if len(bucket["all_chars"]) < 75:
            print(
                f"  Bucket {bucket_num}: skipping (only {len(bucket['all_chars'])} chars)"
            )
            continue

        print(f"\nBucket {bucket_num}: {len(bucket['all_chars'])} cumulative chars")

        generated = 0
        attempts = 0
        max_attempts = SNIPPETS_PER_BUCKET * 3

        while generated < SNIPPETS_PER_BUCKET and attempts < max_attempts:
            topic = TOPICS[topic_index % len(TOPICS)]
            topic_index += 1
            attempts += 1

            prompt = generate_snippet_prompt(char_str, topic, len(bucket["all_chars"]))
            text = call_claude_api(prompt, api_key)
            if not text:
                continue

            valid, reason = validate_snippet(text, allowed_set, char_data_set)
            if not valid:
                print(f"  Rejected ({reason}): {text[:30]}...")
                continue

            meta = compute_snippet_metadata(text, char_data_set, learn_order)

            snippet = {
                "id": meta["id"],
                "text": text,
                "chars": meta["unique_chars"],
                "sentenceCount": meta["sentence_count"],
                "staticDiff": meta["static_diff"],
                "topic": TOPIC_MAP.get(topic, "everyday"),
            }

            all_snippets.append(snippet)
            generated += 1
            print(f"  [{generated}/{SNIPPETS_PER_BUCKET}] {text[:40]}...")

            # Rate limiting
            time.sleep(0.2)

    print(f"\n--- Generated {len(all_snippets)} snippets total ---")

    # Write output
    output = format_output(all_snippets)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"Written to {OUTPUT_FILE}")
    print(f"File size: {len(output.encode('utf-8')) / 1024:.1f} KB")


if __name__ == "__main__":
    main()

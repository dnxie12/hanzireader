#!/usr/bin/env python3
"""
build_audio.py — Generate character pronunciation MP3s via Google Cloud TTS

Reads CHAR_DATA from data/char_data.js, extracts all 2,400 characters,
and generates one MP3 file per character using Google Cloud Chirp3-HD voices.
Uses the Chinese character itself as TTS input for accurate pronunciation.

Output: audio/{char}.mp3 (e.g. audio/妈.mp3, audio/是.mp3)

Prerequisites:
  pip install google-cloud-texttospeech
  export GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

Usage:
  python3 build/build_audio.py
  python3 build/build_audio.py --voice cmn-CN-Chirp3-HD-Aoede  # choose voice
  python3 build/build_audio.py --dry-run                        # list without generating
  python3 build/build_audio.py --force                           # regenerate all
"""

import argparse
import re
import shutil
import sys
import tempfile
from pathlib import Path

BASE = Path(__file__).parent
PROJECT = BASE.parent
AUDIO_DIR = PROJECT / "audio"
CHAR_DATA_FILE = PROJECT / "data" / "char_data.js"


def extract_characters() -> list[str]:
    """Extract all character keys from char_data.js."""
    text = CHAR_DATA_FILE.read_text(encoding="utf-8")
    # Match top-level keys like "妈":{...}
    chars = re.findall(r'"(.)"\s*:\s*\{', text)
    return chars


def generate_audio(chars: list[str], voice_name: str, dry_run: bool, out_dir: Path = None):
    """Generate MP3 files for each character via Google Cloud TTS."""
    out_dir = out_dir or AUDIO_DIR
    out_dir.mkdir(exist_ok=True)

    if dry_run:
        for ch in chars:
            print(f"  {ch}.mp3")
        print(f"\nTotal: {len(chars)} files (dry run, nothing generated)")
        return

    from google.cloud import texttospeech

    client = texttospeech.TextToSpeechClient()
    voice = texttospeech.VoiceSelectionParams(
        language_code="cmn-CN",
        name=voice_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=0.9,
    )

    generated = 0
    skipped = 0
    errors = 0

    for ch in chars:
        out_path = out_dir / f"{ch}.mp3"

        if out_path.exists():
            skipped += 1
            continue

        try:
            synthesis_input = texttospeech.SynthesisInput(text=ch)
            response = client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config,
            )
            out_path.write_bytes(response.audio_content)
            generated += 1

            if generated % 100 == 0:
                print(f"  Generated {generated} files...")

        except Exception as e:
            print(f"  ERROR generating {ch}: {e}", file=sys.stderr)
            errors += 1

    print(f"\nDone: {generated} generated, {skipped} already existed, {errors} errors")
    print(f"Total files: {len(list(out_dir.glob('*.mp3')))}")

    total_bytes = sum(f.stat().st_size for f in out_dir.glob("*.mp3"))
    print(f"Total size: {total_bytes / 1024 / 1024:.1f} MB")


def main():
    parser = argparse.ArgumentParser(description="Generate character audio via Google Cloud TTS")
    parser.add_argument("--voice", default="cmn-CN-Chirp3-HD-Leda",
                        help="Google TTS voice name (default: cmn-CN-Chirp3-HD-Leda)")
    parser.add_argument("--dry-run", action="store_true",
                        help="List files to generate without calling API")
    parser.add_argument("--force", action="store_true",
                        help="Regenerate even if file already exists")
    args = parser.parse_args()

    print("Extracting characters from char_data.js...")
    chars = extract_characters()
    print(f"Found {len(chars)} characters\n")

    if args.force:
        # Generate into temp directory, then swap — safe if script crashes
        tmp_dir = Path(tempfile.mkdtemp(prefix="hanzi-audio-"))
        print(f"Generating to temp directory: {tmp_dir}\n")
        generate_audio(chars, args.voice, args.dry_run, out_dir=tmp_dir)
        # Swap: remove old audio dir, move temp into place
        if AUDIO_DIR.exists():
            shutil.rmtree(AUDIO_DIR)
        shutil.move(str(tmp_dir), str(AUDIO_DIR))
        print(f"Swapped into {AUDIO_DIR}")
    else:
        generate_audio(chars, args.voice, args.dry_run)


if __name__ == "__main__":
    main()

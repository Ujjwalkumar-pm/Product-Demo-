#!/usr/bin/env python3
"""Phase 3 — Voiceover.

Renders one audio clip per timeline segment using the best available engine:
  ELEVENLABS_API_KEY  -> ElevenLabs  (most natural)
  OPENAI_API_KEY      -> OpenAI TTS
  (neither)           -> macOS `say` (free, offline fallback)

All outputs are normalized to 24 kHz mono WAV so durations and mixing are
predictable. Measured durations are written back into the timeline.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess

from lib import ffprobe_duration, run

ELEVEN_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs "Rachel"
OPENAI_DEFAULT_VOICE = "onyx"
SAY_DEFAULT_VOICE = "Samantha"


def pick_engine(forced: str | None) -> str:
    if forced and forced != "auto":
        return forced
    if os.environ.get("ELEVENLABS_API_KEY"):
        return "elevenlabs"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return "say"


def to_wav(src: str, dst: str):
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", src,
         "-ar", "24000", "-ac", "1", dst])


def synth_elevenlabs(text: str, voice: dict, raw: str):
    import requests
    vid = voice.get("elevenlabs_voice_id") or ELEVEN_DEFAULT_VOICE
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"],
                 "accept": "audio/mpeg", "content-type": "application/json"},
        json={"text": text, "model_id": "eleven_multilingual_v2",
              "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}},
        timeout=120,
    )
    r.raise_for_status()
    with open(raw, "wb") as f:
        f.write(r.content)


def synth_openai(text: str, voice: dict, raw: str):
    import requests
    r = requests.post(
        "https://api.openai.com/v1/audio/speech",
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                 "Content-Type": "application/json"},
        json={"model": "gpt-4o-mini-tts",
              "voice": voice.get("openai_voice") or OPENAI_DEFAULT_VOICE,
              "input": text, "response_format": "mp3"},
        timeout=120,
    )
    r.raise_for_status()
    with open(raw, "wb") as f:
        f.write(r.content)


def synth_say(text: str, voice: dict, raw: str):
    v = voice.get("say_voice") or SAY_DEFAULT_VOICE
    wpm = int(voice.get("words_per_minute") or 150)
    # say emits AIFF; to_wav() normalizes it afterwards.
    subprocess.run(["say", "-v", v, "-r", str(wpm), "-o", raw, text],
                   check=True, capture_output=True, text=True)


SYNTHS = {"elevenlabs": (synth_elevenlabs, ".mp3"),
          "openai": (synth_openai, ".mp3"),
          "say": (synth_say, ".aiff")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--engine", default="auto",
                    choices=["auto", "elevenlabs", "openai", "say"])
    args = ap.parse_args()

    with open(args.timeline) as f:
        tl = json.load(f)

    engine = pick_engine(args.engine)
    synth, raw_ext = SYNTHS[engine]
    voice = tl.get("voice", {})
    audio_dir = os.path.join(args.out, "audio")
    os.makedirs(audio_dir, exist_ok=True)
    print(f"TTS engine: {engine}")

    for seg in tl["segments"]:
        text = (seg.get("narration") or "").strip()
        if not text:
            seg["audio_path"] = None
            seg["audio_duration"] = 0.0
            continue
        raw = os.path.join(audio_dir, f"{seg['id']}{raw_ext}")
        wav = os.path.join(audio_dir, f"{seg['id']}.wav")
        synth(text, voice, raw)
        to_wav(raw, wav)
        dur = ffprobe_duration(wav)
        seg["audio_path"] = os.path.abspath(wav)
        seg["audio_duration"] = round(dur, 3)
        print(f"  {seg['id']}: {dur:5.2f}s  \"{text[:48]}\"")

    tl["tts_engine"] = engine
    with open(args.timeline, "w") as f:
        json.dump(tl, f, indent=2)
    print(f"Updated {args.timeline} with audio paths + durations.")


if __name__ == "__main__":
    main()

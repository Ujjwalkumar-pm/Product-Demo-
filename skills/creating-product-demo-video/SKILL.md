---
name: creating-product-demo-video
description: Use when the user has a product screen recording (or screencast / demo capture) plus a user-flow diagram and wants a polished narrated product demo video, an Apple-style product video, a voiceover walkthrough, or a marketing demo cut from raw footage.
---

# Creating a Product Demo Video

## Overview

Turn a raw product **screen recording** + a **user-flow diagram** into a finished, narrated,
Apple-style **demo.mp4**. Claude writes the narration script; scripts handle probing, voiceover
synthesis, smart re-pacing, and final render. All video work uses system `ffmpeg`/`ffprobe` — no
Python media libraries.

**Core principle:** the footage serves the story. Segment by UI step, write tight narration, then
re-pace each clip (trim / hold / slow) so the video tracks the voice — that is what separates a
produced demo from a raw capture.

## When to Use

- User provides a screen recording + a flow diagram and wants a demo/marketing video.
- User asks for an "Apple-style", "narrated", or "voiceover" product walkthrough.
- User has raw capture footage and wants it cut, paced, and narrated automatically.

**Not for:** editing an already-narrated video, pure transcription, or live screen recording.

## Inputs

1. **Product video** — screen recording (`.mov`/`.mp4`).
2. **User-flow diagram** — image or PDF describing the intended flow/steps.

If either is missing, ask the user for it before proceeding.

## Workflow

Run `scripts/bootstrap.sh` once per machine (creates `.venv`, installs `requirements.txt`).
Use a working dir (default `work/`) for intermediate artifacts.

### Phase 1 — Analyze
Run `scripts/analyze_video.py --video <v> --diagram <d> --out work/`.
It writes `work/meta.json` (duration, resolution, fps) and `work/frames/` (scene-change
keyframes + timestamped samples). **Read the keyframes and the flow diagram with vision.**

### Phase 2 — Script & timeline (you do this)
Build a storyboard: order the UI steps from the diagram, map each to a
`[source_in, source_out]` window using the keyframe timestamps. Then write
**narration** in the chosen style register and emit `work/timeline.json`
(schema: `data/timeline.schema.json`).

**Style presets** (`"style"`: `apple` default, `vox`, `clean`):
- **apple** — calm, confident, present tense, one idea per beat, generous
  pauses. Short sentences. Lead with the benefit. Add an `intro` segment
  (product name as `title`, value prop as `subtitle`) and an `outro`.
- **vox** — energetic, explanatory, tighter. Use `caption` on every content
  segment and set `focus` `{x,y,w,h}` (normalized 0-1) on the UI element the
  line is about for a spotlight punch-in.
- **clean** — minimal: captions only, no cards motion.

Per content segment set `caption` (kinetic lower-third) and optionally
`focus` and `kenburns`. Keep narration short enough that re-pacing stays
within `max_speedup`. Validate against the schema before continuing.

### Phase 3 — Voiceover
Run `scripts/tts_render.py --timeline work/timeline.json --out work/`.
Engine auto-selects: `ELEVENLABS_API_KEY` → ElevenLabs, else `OPENAI_API_KEY` → OpenAI TTS,
else macOS `say`. Writes one audio clip per segment + measured durations to
`work/audio/` and back into `work/timeline.json`.

### Phase 4 — Compose
Run `scripts/compose_video.py --timeline work/timeline.json --video <v> --out output/`.
Per segment: cut `[in,out]`, then fit video to narration duration per `pace` (trim / freeze-hold /
slow / speed-up capped at `max_speedup`); add transitions; burn captions; mix narration and
optional ducked music. Exports `output/demo.mp4` (H.264 + AAC).

### Phase 5 — Output & QA
Confirm `output/demo.mp4` exists with both streams. Report the QA block
`compose_video.py` prints (per-segment video-vs-narration delta, peak audio level, total
runtime). Also surface `output/timeline.json` and `output/narration.md` as editable artifacts.
If any segment delta is large, revise that segment's narration in Phase 2 and re-run 3–5.

## Quick Reference

| Need | Command |
|------|---------|
| One-time setup | `scripts/bootstrap.sh` |
| Probe + keyframes | `analyze_video.py --video V --diagram D --out work/` |
| Render voiceover | `tts_render.py --timeline work/timeline.json --out work/` |
| Render final video | `compose_video.py --timeline work/timeline.json --video V --out output/` |
| Force a voice engine | `--engine elevenlabs|openai|say` on `tts_render.py` |
| Pick a style | add `"style":"apple|vox|clean"` to timeline, or `--style` on compose |

## Common Mistakes

- **Narrating over raw footage** — defeats the purpose. Always set per-segment `pace` (default
  `auto`) so video matches voice.
- **Over-long narration** — forces excessive speed-up and clipped audio. Tighten the script;
  prefer more short segments over one dense block.
- **Skipping the flow diagram** — the diagram defines step *order and intent*; keyframes alone
  miss it. Read both.
- **Guessing timestamps** — use the keyframe timestamps in `work/frames/`, not estimates.
- **Editing the original video in place** — never; only write under `work/` and `output/`.
- **Installing moviepy / heavy SDKs** — unnecessary; ffmpeg + REST `requests` cover everything.
- **No intro/outro for apple/vox** — add `kind:"intro"` and `kind:"outro"`
  card segments; they define the produced feel.
- **Vox without `focus`** — spotlight callouts need a `focus` rect; without
  it Vox segments are just zoomed.

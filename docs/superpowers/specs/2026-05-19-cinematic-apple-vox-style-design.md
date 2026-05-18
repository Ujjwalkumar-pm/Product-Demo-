# Design: Cinematic Apple/Vox-Style Output for the Product Demo Skill

**Date:** 2026-05-19
**Status:** Approved (design); pending spec review
**Repo:** `Ujjwalkumar-pm/claude-product-demo-skill`

## Context & Problem

The skill currently produces a functional `demo.mp4`: re-paced segments, basic per-segment
fade, narration audio, optional ducked music. It is *not yet* the production quality of an
Apple product demo or a Vox explainer — it lacks title cards, cinematic motion, synced
captions, attention-direction, color polish, and a music bed.

The user explicitly wants output "similar to Apple Product Demo, Vox Videos." This spec
defines the upgrade.

### Hard environment constraint

This machine's `ffmpeg` 8.1 has **no `drawtext` filter** (no libfreetype). All typography
must therefore be rendered to transparent PNGs and composited with `overlay`. Verified
available filters: `overlay`, `zoompan`, `xfade`, `acrossfade`, `eq`, `curves`, `vignette`,
`gblur`, `crop`, `scale`, `tpad`, `sidechaincompress`, `colorbalance`, `geq`. Verified fonts
present: `SFNS.ttf` (San Francisco — Apple's actual typeface), `SFCompact.ttf`,
`HelveticaNeue.ttc`, `Futura.ttc`, `Arial Black/Bold`.

## Goals

1. Selectable **style presets**: `apple` (default), `vox`, `clean`.
2. Add four "produced" elements: **hero intro/outro cards**, **Ken Burns motion**,
   **kinetic captions**, **spotlight callouts**.
3. **Music bed**: user-supplied track wins; otherwise a procedural, royalty-free bed
   (`apple` = soft ambient pad, `vox` = rhythmic pulse, `clean` = none); always ducked.
4. Stay ffmpeg-only + one new pip dep (`pillow`). Python 3.9 compatible. Original video
   never modified in place.

### Non-goals (YAGNI)

- Device/browser-chrome frame mockup (not requested).
- HTML/headless-Chromium card rendering (overkill deps).
- Changes to `analyze_video.py` or `tts_render.py` (unchanged).

## Approach

**Chosen:** Render all text (cards, captions) as transparent PNGs with **Pillow** using
`SFNS.ttf`, then animate/composite via ffmpeg (`overlay`, `zoompan`, `xfade`). More
controllable than `drawtext`, and the only path that works given the libfreetype gap.

**Rejected:** ffmpeg `drawtext` (impossible here); HTML→Chromium screenshots (heavy deps).

## Architecture

### Component map

| Unit | Responsibility | Depends on |
|------|----------------|-----------|
| `style.py` (new) | Preset table; Pillow `render_card()` / `render_caption()` → PNGs; per-preset grade/motion/transition/music params | Pillow, `lib.py` |
| `compose_video.py` (rebuilt) | Orchestrate cinematic stages per segment; build cards; stitch with crossfades; mix bed; QA | `style.py`, `lib.py`, ffmpeg |
| `lib.py` (extended) | Add small helpers: `font_path()`, `tmp_png()`, reuse `ffprobe_*`, `can_caption()` no longer gates text (Pillow path) | ffmpeg |
| `timeline.schema.json` (extended) | New fields (below) | — |
| `tts_render.py`, `analyze_video.py` | Unchanged | — |
| `bootstrap.sh`, `requirements.txt` | Add `pillow` | — |
| `SKILL.md` | Apple/Vox narration register + card/focus authoring guidance | — |

### `style.py` preset table (initial values)

| Param | apple | vox | clean |
|-------|-------|-----|-------|
| narration pad (s) | 0.55 | 0.20 | 0.40 |
| min segment T (s) | 1.4 | 0.8 | 0.8 |
| ken burns | slow zoom-in 1.0→1.08 | punch-in to focus 1.0→1.25 | none |
| transition | xfade dissolve 0.7s | xfade 0.25s + cut | fade 0.3s |
| grade | `eq=contrast=1.06:saturation=1.05`, `vignette=PI/5` | `eq=saturation=1.18:contrast=1.1`, accent | `eq=contrast=1.02` |
| caption | thin lower bar, SF Pro, fade+rise 12px | bold block, SF Pro, slide-up + accent underline | small caption, fade |
| card bg | `#000000` text white | `#0b0b0b` + accent text | `#101012` |
| music mood | ambient pad, swell, −22 dB | rhythmic pulse, −18 dB | none |
| accent color | `#2997ff` | `#ff4d4d` | `#888888` |

`style_overrides` (top-level) shallow-merges over the chosen preset.

### Extended `timeline.schema.json`

- Top-level: `style` ∈ {`apple`,`vox`,`clean`} (default `apple`); `style_overrides` (object).
- `music`: add `mood` (`ambient`|`pulse`|`none`); existing `path`/`gain_db` still honored,
  `path` wins over procedural.
- Segment: `kind` ∈ {`intro`,`content`,`outro`} (default `content`); `title`, `subtitle`
  (used by intro/outro cards); `focus` `{x,y,w,h}` normalized 0–1 (spotlight target);
  `kenburns` ∈ {`auto`,`in`,`out`,`left`,`right`,`none`}. Existing `caption`, `narration`,
  `source_in/out`, `pace`, `max_speedup`, `audio_*` unchanged.
- `intro`/`outro` segments need no source footage; if `source_in/out` omitted the card is
  rendered over a solid background for `max(narration, preset card duration)`.

### Data flow (rebuilt `compose_video.py`)

```
load timeline -> resolve preset(+overrides)
for each segment in order:
  kind == intro|outro:
     render_card() PNG -> ffmpeg: bg color -> scale-in 1.0->1.03 + fade
                          -> attach VO (or silence) -> seg_NNN.mp4
  kind == content:
     cut [in,out]  (reuse compute_plan re-pacing; preset sets pad/min-T)
     -> grade (eq/curves/vignette)
     -> ken burns (zoompan; or punch-in toward focus for vox)
     -> spotlight (if focus): split -> blurred+dim base + sharp cropped-zoom focus overlay
     -> caption overlay (render_caption PNG, animated in/out via overlay enable+expr)
     -> attach VO audio re-paced to T  -> seg_NNN.mp4
stitch: pairwise xfade per preset (video) + acrossfade (audio); concat-copy fallback
music bed: user path | procedural (apple aevalsrc triad pad / vox pulse) | none
           -> volume(mood) -> sidechaincompress keyed by VO -> amix
final: faststart mp4 + output/timeline.json + output/narration.md
QA: style used, elements applied, per-seg video-vs-VO delta, peak dB, total duration
```

All intermediate segments normalized to identical W/H/fps/codec so xfade/concat are safe.
Re-encode-concat fallback retained from current implementation.

## Error Handling

- Pillow missing → `bootstrap.sh` installs it; `style.py` raises a clear actionable error
  if still absent ("run scripts/bootstrap.sh").
- No font found → fall back through SFNS → Helvetica → Arial → Pillow default; cards/captions
  still render (never crash).
- `xfade` failure on a pair → fall back to hard-cut concat for that boundary.
- Procedural music synthesis failure → continue with VO-only (warn, do not abort).
- `focus` out of 0–1 range → clamp; missing → no spotlight (plain Ken Burns).
- Invalid `style` → warn, use `apple`.

## Testing / Verification

1. Regenerate synthetic assets (`testsrc2` 12s clip, solid flow PNG) — `drawtext`-free.
2. Author an `apple` timeline: intro card → 3 content segments (one with `focus`) →
   outro card; no API keys (macOS `say`).
3. Run `analyze → tts → compose`. Assert via `ffprobe`: H.264+AAC streams present;
   total duration ≈ Σ segment T + cards − crossfade overlaps; > raw 12s (cards added).
4. Assert peak audio ≤ 0 dB (no clipping) via `volumedetect`.
5. Assert caption/card PNG stage executed (temp PNGs created; overlay in filter graph)
   and `output/{demo.mp4,timeline.json,narration.md}` exist.
6. Smoke-run the same timeline with `style: vox` to exercise preset switching (must
   produce a valid mp4 with different transition/grade params).
7. Confirm no API keys required and original `sample_product.mp4` is byte-unchanged.

## Files Changed

- `skills/creating-product-demo-video/scripts/style.py` (new)
- `skills/creating-product-demo-video/scripts/compose_video.py` (rebuilt)
- `skills/creating-product-demo-video/scripts/lib.py` (small helpers)
- `skills/creating-product-demo-video/data/timeline.schema.json` (extended)
- `skills/creating-product-demo-video/SKILL.md` (style/narration guidance)
- `skills/creating-product-demo-video/scripts/bootstrap.sh`, `requirements.txt` (add pillow)
- `README.md` (style presets section)

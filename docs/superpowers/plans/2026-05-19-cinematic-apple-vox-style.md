# Cinematic Apple/Vox-Style Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Product Demo Skill so its `demo.mp4` reaches Apple-keynote / Vox-explainer production quality via selectable style presets, hero cards, Ken Burns motion, kinetic captions, spotlight callouts, and a procedural music bed.

**Architecture:** A new pure-Python `style.py` owns preset parameters and Pillow PNG typography (ffmpeg here has no `drawtext`). `compose_video.py` is rebuilt into staged ffmpeg compositing that consumes `style.py`. Pure functions are unit-tested with pytest; the ffmpeg orchestration is verified by an end-to-end smoke test asserting `ffprobe` properties.

**Tech Stack:** Python 3.9, Pillow, system ffmpeg/ffprobe 8.1, pytest (dev only), macOS `say` (zero-key TTS for tests).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `skills/creating-product-demo-video/scripts/style.py` (new) | Preset table, `resolve_style()`, `clamp_focus()`, `kenburns_expr()`, Pillow `render_card()` / `render_caption()` |
| `skills/creating-product-demo-video/scripts/compose_video.py` (rebuilt) | Stage orchestration: content segments, cards, xfade stitch, music bed, QA. Reuses `compute_plan` re-pacing |
| `skills/creating-product-demo-video/scripts/lib.py` (extend) | `font_path()` helper |
| `skills/creating-product-demo-video/data/timeline.schema.json` (extend) | `style`, `style_overrides`, segment `kind/title/subtitle/focus/kenburns`, `music.mood` |
| `skills/creating-product-demo-video/SKILL.md` (edit) | Apple/Vox narration register + card/focus authoring |
| `requirements.txt` (edit) | add `pillow` |
| `requirements-dev.txt` (new) | `pytest` |
| `skills/creating-product-demo-video/scripts/bootstrap.sh` (edit) | install pillow (already via requirements) + note dev deps |
| `tests/test_style.py` (new) | Unit tests for `style.py` pure functions + renderers |
| `tests/test_schema.py` (new) | Timeline schema loads + accepts new fields |
| `tests/test_e2e.py` (new) | End-to-end apple + vox smoke test (marked slow) |
| `README.md` (edit) | Style presets section |

Working dir for all `git` / test commands: `/Users/ggn06-ujjwal/claude-product-demo-skill`.
Python interpreter: `skills/creating-product-demo-video/.venv/bin/python` (call as `$PY`).
Set once per shell: `PY=skills/creating-product-demo-video/.venv/bin/python`

---

## Task 1: Add Pillow + pytest, test scaffold

**Files:**
- Modify: `requirements.txt`
- Create: `requirements-dev.txt`
- Modify: `skills/creating-product-demo-video/scripts/bootstrap.sh`
- Create: `tests/conftest.py`

- [ ] **Step 1: Add pillow to requirements.txt**

Replace the file contents with:

```
# Minimal runtime deps. All media work uses system ffmpeg/ffprobe (no moviepy).
# TTS providers are called via plain REST so no heavy SDKs are required.
requests>=2.31.0
# Typography is rendered to PNG (this ffmpeg build has no drawtext filter).
pillow>=10.0.0
```

- [ ] **Step 2: Create requirements-dev.txt**

```
pytest>=7.4.0
```

- [ ] **Step 3: Add a dev-deps note to bootstrap.sh**

In `bootstrap.sh`, after the line
`python -m pip install --quiet -r "$REPO_ROOT/requirements.txt"`
add:

```bash
if [ "${1:-}" = "--dev" ] && [ -f "$REPO_ROOT/requirements-dev.txt" ]; then
  python -m pip install --quiet -r "$REPO_ROOT/requirements-dev.txt"
fi
```

- [ ] **Step 4: Create tests/conftest.py**

```python
import os
import sys

# Make scripts/ importable as top-level modules in tests.
SCRIPTS = os.path.join(
    os.path.dirname(__file__), "..",
    "skills", "creating-product-demo-video", "scripts",
)
sys.path.insert(0, os.path.abspath(SCRIPTS))
```

- [ ] **Step 5: Install deps**

Run: `skills/creating-product-demo-video/scripts/bootstrap.sh --dev`
Expected: ends with `OK: ffmpeg=8.1 python=3.9.6`

- [ ] **Step 6: Commit**

```bash
git add requirements.txt requirements-dev.txt tests/conftest.py skills/creating-product-demo-video/scripts/bootstrap.sh
git commit -m "build: add pillow runtime dep and pytest dev scaffold"
```

---

## Task 2: `style.py` — preset resolution

**Files:**
- Create: `skills/creating-product-demo-video/scripts/style.py`
- Create: `tests/test_style.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_style.py`:

```python
import style


def test_default_preset_is_apple():
    s = style.resolve_style({})
    assert s["name"] == "apple"
    assert s["pad"] == 0.55
    assert s["transition"] == "dissolve"


def test_vox_preset_selected():
    s = style.resolve_style({"style": "vox"})
    assert s["name"] == "vox"
    assert s["pad"] == 0.20
    assert s["accent"] == "#ff4d4d"


def test_invalid_style_falls_back_to_apple():
    s = style.resolve_style({"style": "nope"})
    assert s["name"] == "apple"


def test_style_overrides_shallow_merge():
    s = style.resolve_style({"style": "apple", "style_overrides": {"pad": 0.1}})
    assert s["pad"] == 0.1
    assert s["name"] == "apple"  # untouched keys preserved
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$PY -m pytest tests/test_style.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'style'`

- [ ] **Step 3: Write minimal implementation**

Create `skills/creating-product-demo-video/scripts/style.py`:

```python
"""Style presets + Pillow typography for the Product Demo Skill.

ffmpeg in this environment has no drawtext filter, so all text is rendered
to transparent PNGs here and composited by compose_video.py via overlay.
"""
from __future__ import annotations

import copy

PRESETS = {
    "apple": {
        "name": "apple", "pad": 0.55, "min_t": 1.4,
        "kenburns": "in", "kb_zoom": 1.08,
        "transition": "dissolve", "xfade_dur": 0.7,
        "grade": "eq=contrast=1.06:saturation=1.05,vignette=PI/5",
        "card_bg": "#000000", "card_fg": "#ffffff",
        "caption_style": "thin", "accent": "#2997ff",
        "music_mood": "ambient", "music_db": -22.0, "card_dur": 2.6,
    },
    "vox": {
        "name": "vox", "pad": 0.20, "min_t": 0.8,
        "kenburns": "punch", "kb_zoom": 1.25,
        "transition": "cut", "xfade_dur": 0.25,
        "grade": "eq=contrast=1.10:saturation=1.18",
        "card_bg": "#0b0b0b", "card_fg": "#ffffff",
        "caption_style": "bold", "accent": "#ff4d4d",
        "music_mood": "pulse", "music_db": -18.0, "card_dur": 1.8,
    },
    "clean": {
        "name": "clean", "pad": 0.40, "min_t": 0.8,
        "kenburns": "none", "kb_zoom": 1.0,
        "transition": "fade", "xfade_dur": 0.3,
        "grade": "eq=contrast=1.02",
        "card_bg": "#101012", "card_fg": "#ffffff",
        "caption_style": "small", "accent": "#888888",
        "music_mood": "none", "music_db": -24.0, "card_dur": 2.0,
    },
}


def resolve_style(timeline: dict) -> dict:
    name = timeline.get("style", "apple")
    if name not in PRESETS:
        name = "apple"
    s = copy.deepcopy(PRESETS[name])
    overrides = timeline.get("style_overrides") or {}
    if isinstance(overrides, dict):
        s.update(overrides)
    return s
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$PY -m pytest tests/test_style.py -q`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add skills/creating-product-demo-video/scripts/style.py tests/test_style.py
git commit -m "feat(style): preset table and resolve_style"
```

---

## Task 3: `style.py` — focus clamp + Ken Burns expression

**Files:**
- Modify: `skills/creating-product-demo-video/scripts/style.py`
- Modify: `tests/test_style.py`

- [ ] **Step 1: Write the failing test (append to tests/test_style.py)**

```python
def test_clamp_focus_in_range():
    assert style.clamp_focus({"x": 0.2, "y": 0.1, "w": 0.5, "h": 0.4}) == \
        (0.2, 0.1, 0.5, 0.4)


def test_clamp_focus_out_of_range():
    # negative and >1 values clamped; zero/oversize w,h fixed to sane bounds
    x, y, w, h = style.clamp_focus({"x": -0.3, "y": 1.5, "w": 2.0, "h": 0.0})
    assert 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0
    assert 0.05 <= w <= 1.0 and 0.05 <= h <= 1.0


def test_kenburns_expr_in_returns_zoompan():
    expr = style.kenburns_expr("in", 1.08, fps=30, duration=3.0, w=1280, h=720)
    assert expr.startswith("zoompan=")
    assert "1280" in expr and "720" in expr


def test_kenburns_expr_none_is_passthrough():
    assert style.kenburns_expr("none", 1.0, 30, 3.0, 1280, 720) == "null"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$PY -m pytest tests/test_style.py -q`
Expected: FAIL — `AttributeError: module 'style' has no attribute 'clamp_focus'`

- [ ] **Step 3: Add implementation to style.py**

Append to `style.py`:

```python
def clamp_focus(focus: dict) -> tuple:
    """Normalize a {x,y,w,h} focus rect into safe 0-1 bounds."""
    def c(v, lo, hi, default):
        try:
            v = float(v)
        except (TypeError, ValueError):
            return default
        return max(lo, min(hi, v))
    w = c(focus.get("w"), 0.05, 1.0, 0.5)
    h = c(focus.get("h"), 0.05, 1.0, 0.5)
    x = c(focus.get("x"), 0.0, 1.0, 0.25)
    y = c(focus.get("y"), 0.0, 1.0, 0.25)
    return (x, y, w, h)


def kenburns_expr(mode: str, zoom: float, fps: int, duration: float,
                  w: int, h: int) -> str:
    """Build a zoompan filter string for a slow push, or 'null' if none.

    'in'    : slow zoom in to `zoom`
    'out'   : slow zoom out from `zoom`
    'punch' : faster zoom in (Vox)
    'none'  : passthrough
    """
    if mode == "none" or zoom <= 1.0:
        return "null"
    frames = max(int(round(duration * fps)), 1)
    if mode == "out":
        z = f"if(eq(on,0),{zoom:.4f},max(zoom-{(zoom - 1) / frames:.6f},1.0))"
    else:  # in / punch
        z = f"min(zoom+{(zoom - 1) / frames:.6f},{zoom:.4f})"
    # keep the push centered
    return (f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d=1:s={w}x{h}:fps={fps}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$PY -m pytest tests/test_style.py -q`
Expected: PASS (8 passed)

- [ ] **Step 5: Commit**

```bash
git add skills/creating-product-demo-video/scripts/style.py tests/test_style.py
git commit -m "feat(style): clamp_focus and kenburns_expr"
```

---

## Task 4: `style.py` — Pillow card & caption renderers

**Files:**
- Modify: `skills/creating-product-demo-video/scripts/style.py`
- Modify: `tests/test_style.py`

- [ ] **Step 1: Write the failing test (append to tests/test_style.py)**

```python
import os
from PIL import Image


def test_render_card_writes_rgba_png(tmp_path):
    s = style.resolve_style({})
    out = os.path.join(tmp_path, "card.png")
    style.render_card("Meet the Product", "A faster way to work", s,
                      1280, 720, out)
    assert os.path.exists(out)
    im = Image.open(out)
    assert im.mode == "RGBA"
    assert im.size == (1280, 720)


def test_render_caption_transparent_strip(tmp_path):
    s = style.resolve_style({"style": "vox"})
    out = os.path.join(tmp_path, "cap.png")
    style.render_caption("Search finds it instantly", s, 1280, 720, out)
    im = Image.open(out)
    assert im.mode == "RGBA" and im.size == (1280, 720)
    # top-left pixel must be fully transparent (caption sits at the bottom)
    assert im.getpixel((5, 5))[3] == 0


def test_render_caption_empty_text_is_noop(tmp_path):
    s = style.resolve_style({})
    out = os.path.join(tmp_path, "empty.png")
    assert style.render_caption("", s, 1280, 720, out) is False
    assert not os.path.exists(out)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$PY -m pytest tests/test_style.py -q`
Expected: FAIL — `AttributeError: module 'style' has no attribute 'render_card'`

- [ ] **Step 3: Add implementation to style.py**

Add near the top of `style.py` (after `import copy`):

```python
import os
from PIL import Image, ImageDraw, ImageFont

_FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNS.ttf",                       # San Francisco
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for p in _FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _hex(c: str) -> tuple:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _center_text(draw, cx, y, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2, y), text, font=font, fill=fill)
    return bbox[3] - bbox[1]
```

Append the renderers to `style.py`:

```python
def render_card(title: str, subtitle: str, s: dict,
                w: int, h: int, out_path: str) -> bool:
    """Full-screen hero/outro card on the preset background."""
    img = Image.new("RGBA", (w, h), _hex(s["card_bg"]) + (255,))
    d = ImageDraw.Draw(img)
    title_font = _font(int(h * 0.11))
    sub_font = _font(int(h * 0.045))
    fg = _hex(s["card_fg"])
    accent = _hex(s["accent"])
    th = _center_text(d, w / 2, h * 0.40, title or "", title_font, fg + (255,))
    if subtitle:
        _center_text(d, w / 2, h * 0.40 + th + h * 0.06, subtitle,
                     sub_font, accent + (235,))
    img.save(out_path)
    return True


def render_caption(text: str, s: dict, w: int, h: int,
                   out_path: str) -> bool:
    """Transparent full-frame PNG with a lower-third caption bar."""
    text = (text or "").strip()
    if not text:
        return False
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bold = s["caption_style"] in ("bold",)
    fsize = int(h * (0.052 if bold else 0.040))
    font = _font(fsize)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, tht = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = int(w * 0.02), int(h * 0.022)
    bar_h = tht + pad_y * 2
    bar_y = int(h * 0.84)
    box_a = 170 if bold else 120
    d.rectangle([0, bar_y, w, bar_y + bar_h], fill=(0, 0, 0, box_a))
    if bold:  # Vox accent underline
        d.rectangle([0, bar_y + bar_h - 6, w, bar_y + bar_h],
                    fill=_hex(s["accent"]) + (255,))
    d.text(((w - tw) / 2, bar_y + pad_y), text, font=font,
           fill=(255, 255, 255, 245))
    img.save(out_path)
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$PY -m pytest tests/test_style.py -q`
Expected: PASS (11 passed)

- [ ] **Step 5: Commit**

```bash
git add skills/creating-product-demo-video/scripts/style.py tests/test_style.py
git commit -m "feat(style): Pillow render_card and render_caption"
```

---

## Task 5: Extend the timeline schema

**Files:**
- Modify: `skills/creating-product-demo-video/data/timeline.schema.json`
- Create: `tests/test_schema.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_schema.py`:

```python
import json
import os

SCHEMA = os.path.join(
    os.path.dirname(__file__), "..",
    "skills", "creating-product-demo-video", "data", "timeline.schema.json",
)


def test_schema_is_valid_json_with_new_fields():
    with open(SCHEMA) as f:
        sch = json.load(f)
    top = sch["properties"]
    assert "style" in top
    assert top["style"]["enum"] == ["apple", "vox", "clean"]
    assert "style_overrides" in top
    seg = top["segments"]["items"]["properties"]
    for k in ("kind", "title", "subtitle", "focus", "kenburns"):
        assert k in seg, f"missing segment field: {k}"
    assert seg["kind"]["enum"] == ["intro", "content", "outro"]
    assert top["music"]["properties"]["mood"]["enum"] == \
        ["ambient", "pulse", "none"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$PY -m pytest tests/test_schema.py -q`
Expected: FAIL — `KeyError: 'style'`

- [ ] **Step 3: Edit timeline.schema.json**

In `properties`, add alongside `source_video`:

```json
    "style": {
      "type": "string",
      "enum": ["apple", "vox", "clean"],
      "default": "apple",
      "description": "Production style preset."
    },
    "style_overrides": {
      "type": "object",
      "description": "Shallow-merged over the chosen preset (advanced)."
    },
```

In `music.properties`, add:

```json
        "mood": {
          "type": "string",
          "enum": ["ambient", "pulse", "none"],
          "description": "Procedural bed used when no music.path is given (preset picks a default)."
        },
```

In `segments.items.properties`, add (and make `source_in`/`source_out` optional for cards by removing them from the segment `required` array, keeping `id` required):

```json
          "kind": {
            "type": "string",
            "enum": ["intro", "content", "outro"],
            "default": "content",
            "description": "intro/outro render a title card; content uses footage."
          },
          "title": { "type": "string", "description": "Card headline (intro/outro)." },
          "subtitle": { "type": "string", "description": "Card sub-line (intro/outro)." },
          "focus": {
            "type": "object",
            "description": "Normalized 0-1 region to spotlight (punch-in + dim/blur around).",
            "properties": {
              "x": { "type": "number" }, "y": { "type": "number" },
              "w": { "type": "number" }, "h": { "type": "number" }
            }
          },
          "kenburns": {
            "type": "string",
            "enum": ["auto", "in", "out", "left", "right", "none"],
            "default": "auto",
            "description": "Per-segment motion override; auto = preset default."
          },
```

Change the segment `required` line from
`"required": ["id", "source_in", "source_out", "narration"],`
to
`"required": ["id"],`

- [ ] **Step 4: Run test to verify it passes**

Run: `$PY -m pytest tests/test_schema.py -q`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add skills/creating-product-demo-video/data/timeline.schema.json tests/test_schema.py
git commit -m "feat(schema): style presets, cards, focus, kenburns, music mood"
```

---

## Task 6: `lib.py` — font_path helper

**Files:**
- Modify: `skills/creating-product-demo-video/scripts/lib.py`
- Modify: `tests/test_style.py`

- [ ] **Step 1: Write the failing test (append to tests/test_style.py)**

```python
import lib


def test_font_path_returns_existing_file_or_none():
    p = lib.font_path()
    assert p is None or os.path.exists(p)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `$PY -m pytest tests/test_style.py -q -k font_path`
Expected: FAIL — `AttributeError: module 'lib' has no attribute 'font_path'`

- [ ] **Step 3: Add to lib.py**

Append to `lib.py`:

```python
def font_path() -> Optional[str]:
    """First available bold/system font for Pillow typography."""
    for f in ("/System/Library/Fonts/SFNS.ttf",
              "/System/Library/Fonts/HelveticaNeue.ttc",
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf") + tuple(
                  _FONT_CANDIDATES):
        if os.path.exists(f):
            return f
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `$PY -m pytest tests/test_style.py -q -k font_path`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add skills/creating-product-demo-video/scripts/lib.py tests/test_style.py
git commit -m "feat(lib): font_path helper"
```

---

## Task 7: Rebuild `compose_video.py` — content segment stage

**Files:**
- Modify: `skills/creating-product-demo-video/scripts/compose_video.py`

This task rebuilds compose into staged rendering. Keep the existing `compute_plan`
function exactly as-is (re-pacing logic is unchanged) and keep the `qa()` function,
extending it. Replace `build_segment`, `concat`, `add_music`, `main`.

- [ ] **Step 1: Replace the imports and module constants**

Replace the top of `compose_video.py` (the docstring + imports + `PAD`/`MIN_T` lines) with:

```python
#!/usr/bin/env python3
"""Phase 4 — Re-pace & cinematic compose.

Stages per content segment: cut -> color grade -> Ken Burns -> optional
spotlight -> caption overlay -> re-paced narration. Plus hero intro/outro
cards, preset crossfades, and a user or procedural music bed. ffmpeg only;
the original video is never modified in place.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile

import style
from lib import ffprobe_info, run

PAD = 0.4
MIN_T = 0.6
```

(`PAD`/`MIN_T` remain as defaults for `compute_plan`; the resolved preset overrides
per-run via the wrappers below.)

- [ ] **Step 2: Keep compute_plan, parameterized by preset**

Find `def compute_plan(seg: dict, clip_len: float) -> dict:` and change its signature
and the two constant references so the preset's pad/min_t are used:

Signature →
```python
def compute_plan(seg: dict, clip_len: float, pad: float = PAD,
                  min_t: float = MIN_T) -> dict:
```
Inside it, replace every `PAD` with `pad` and every `MIN_T` with `min_t`.
(All other logic in `compute_plan` is unchanged.)

- [ ] **Step 3: Replace build_segment with the staged content builder**

Replace the entire `build_segment(...)` function with:

```python
def _grade(vf: list, s: dict):
    if s.get("grade"):
        vf.append(s["grade"])


def _spotlight(vf: list, focus: dict, W: int, H: int):
    """Dim+blur the frame and overlay a sharp, zoomed crop of the focus rect."""
    x, y, w, h = style.clamp_focus(focus)
    cx, cy = int(W * x), int(H * y)
    cw, ch = max(int(W * w), 16), max(int(H * h), 16)
    vf.append(
        f"split=2[bg][fg];"
        f"[bg]gblur=sigma=18,eq=brightness=-0.10[bg2];"
        f"[fg]crop={cw}:{ch}:{cx}:{cy},scale={W}:{H}"
        f":force_original_aspect_ratio=increase,crop={W}:{H}[fg2];"
        f"[bg2][fg2]overlay=0:0"
    )


def build_segment(seg, src, info, plan, s, idx, tmpdir):
    W, H = info["width"] or 1280, info["height"] or 720
    FPS = int(round(info["fps"] or 30))
    in_t = float(seg.get("source_in", 0.0))
    clip_len = max(float(seg.get("source_out", in_t)) - in_t, 0.04)
    T = round(plan["T"], 3)
    out = os.path.join(tmpdir, f"seg_{idx:03d}.mp4")

    # ---- video filter graph ----
    base = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={FPS}")
    parts = [f"[0:v]{base}"]

    if plan["mode"] == "speed":
        parts.append(f"setpts=PTS/{plan['param']:.6f}")
    elif plan["mode"] == "slow":
        parts.append(f"setpts=PTS*{plan['param']:.6f}")
    elif plan["mode"] == "hold":
        parts.append(
            f"tpad=stop_mode=clone:stop_duration={plan['param']:.3f}")

    _grade(parts, s)

    focus = seg.get("focus")
    kb = seg.get("kenburns", "auto")
    if kb == "auto":
        kb = s["kenburns"]
    if focus:
        # spotlight is its own multi-pad chain; build it, then ken-burns the result
        sl = []
        _spotlight(sl, focus, W, H)
        chain = ",".join(parts) + "[v0];[v0]" + sl[0]
    else:
        kbx = style.kenburns_expr(
            "in" if kb in ("punch", "in", "auto") else kb,
            s["kb_zoom"] if kb != "none" else 1.0, FPS, T, W, H)
        if kbx != "null":
            parts.append(kbx)
        chain = ",".join(parts)
    chain += ",format=yuv420p[v]"

    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-ss", f"{in_t:.3f}", "-t", f"{clip_len:.3f}", "-i", src]

    # ---- caption overlay (Pillow PNG) ----
    cap = (seg.get("caption") or "").strip()
    cap_png = os.path.join(tmpdir, f"cap_{idx:03d}.png")
    have_cap = bool(cap) and style.render_caption(cap, s, W, H, cap_png)
    if have_cap:
        cmd += ["-loop", "1", "-t", f"{T:.3f}", "-i", cap_png]

    # ---- audio ----
    audio = seg.get("audio_path")
    a_idx = 2 if have_cap else 1
    if audio and os.path.exists(audio):
        cmd += ["-i", audio]
        af = (f"[{a_idx}:a]aresample=48000,apad,atrim=0:{T:.3f},"
              f"asetpts=N/SR/TB,afade=t=in:d=0.08,"
              f"afade=t=out:st={max(T - 0.2, 0):.3f}:d=0.2[a]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{T:.3f}", "-i",
                "anullsrc=r=48000:cl=stereo"]
        af = f"[{a_idx}:a]aresample=48000[a]"

    if have_cap:
        # fade the caption in/out for a kinetic feel
        fc = (f"{chain};[1:v]format=rgba,"
              f"fade=t=in:st=0:d=0.3:alpha=1,"
              f"fade=t=out:st={max(T - 0.4, 0):.3f}:d=0.4:alpha=1[cap];"
              f"[v][cap]overlay=0:0[vo];{af}")
        vmap = "[vo]"
    else:
        fc = f"{chain};{af}"
        vmap = "[v]"

    cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
            "-t", f"{T:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "48000", "-ac", "2", out]
    run(cmd)
    return out, T
```

- [ ] **Step 4: Add the card builder (new function, after build_segment)**

```python
def build_card(seg, info, s, idx, tmpdir):
    W, H = info["width"] or 1280, info["height"] or 720
    FPS = int(round(info["fps"] or 30))
    audio = seg.get("audio_path")
    narr = float(seg.get("audio_duration") or 0.0)
    T = round(max(narr + 0.5, s["card_dur"]), 3)
    png = os.path.join(tmpdir, f"card_{idx:03d}.png")
    style.render_card(seg.get("title", ""), seg.get("subtitle", ""),
                      s, W, H, png)
    out = os.path.join(tmpdir, f"seg_{idx:03d}.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-loop", "1", "-t", f"{T:.3f}", "-i", png]
    if audio and os.path.exists(audio):
        cmd += ["-i", audio]
        af = (f"[1:a]aresample=48000,apad,atrim=0:{T:.3f},"
              f"asetpts=N/SR/TB[a]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{T:.3f}", "-i",
                "anullsrc=r=48000:cl=stereo"]
        af = "[1:a]aresample=48000[a]"
    # gentle scale-in + fade for the hero card
    vf = (f"[0:v]scale={W}:{H},setsar=1,fps={FPS},"
          f"zoompan=z='min(zoom+0.0006,1.04)':d=1:s={W}x{H}:fps={FPS},"
          f"fade=t=in:st=0:d=0.5,"
          f"fade=t=out:st={max(T - 0.5, 0):.3f}:d=0.5,"
          f"format=yuv420p[v]")
    cmd += ["-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]",
            "-t", f"{T:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "48000", "-ac", "2", out]
    run(cmd)
    return out, T
```

- [ ] **Step 5: Replace concat() with a preset-aware stitcher**

```python
def stitch(seg_files, s, tmpdir, dst):
    """Crossfade segments per preset; fall back to concat on any failure."""
    if s["transition"] == "cut" or len(seg_files) == 1:
        return _concat_copy(seg_files, tmpdir, dst)
    xd = float(s["xfade_dur"])
    durs = [float(run(["ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of",
            "default=nw=1:nk=1", f]).strip()) for f in seg_files]
    inputs = []
    for f in seg_files:
        inputs += ["-i", f]
    vlab, alab, offset = "[0:v]", "[0:a]", 0.0
    fc = []
    for i in range(1, len(seg_files)):
        offset += durs[i - 1] - xd
        v_out = f"[v{i}]"
        a_out = f"[a{i}]"
        fc.append(f"{vlab}[{i}:v]xfade=transition=fade:duration={xd}"
                  f":offset={offset:.3f}{v_out}")
        fc.append(f"{alab}[{i}:a]acrossfade=d={xd}{a_out}")
        vlab, alab = v_out, a_out
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(fc),
         "-map", vlab, "-map", alab,
         "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-ar", "48000", dst],
        capture_output=True, text=True)
    if res.returncode != 0:
        return _concat_copy(seg_files, tmpdir, dst)
    return dst


def _concat_copy(seg_files, tmpdir, dst):
    listfile = os.path.join(tmpdir, "concat.txt")
    with open(listfile, "w") as f:
        for sfile in seg_files:
            f.write(f"file '{sfile}'\n")
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", listfile, "-c", "copy", dst],
        capture_output=True, text=True)
    if res.returncode != 0:
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat",
             "-safe", "0", "-i", listfile, "-c:v", "libx264",
             "-preset", "veryfast", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-ar", "48000", dst])
    return dst
```

- [ ] **Step 6: Replace add_music() with user-or-procedural bed**

```python
def _procedural_bed(mood: str, dur: float, tmpdir: str) -> str | None:
    bed = os.path.join(tmpdir, "bed.wav")
    if mood == "ambient":
        # soft low triad pad
        src = ("aevalsrc='0.18*sin(2*PI*110*t)+0.12*sin(2*PI*164.81*t)"
               "+0.09*sin(2*PI*220*t)':s=48000:d=%.3f" % dur)
    elif mood == "pulse":
        src = ("aevalsrc='0.2*sin(2*PI*70*t)*(mod(t\\,0.5)<0.12)':"
               "s=48000:d=%.3f" % dur)
    else:
        return None
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", src,
         "-ac", "2", bed], capture_output=True, text=True)
    return bed if res.returncode == 0 else None


def add_music(video, tl, s, tmpdir):
    info = ffprobe_info(video)
    dur = info["duration"]
    user = (tl.get("music") or {}).get("path")
    mood = (tl.get("music") or {}).get("mood") or s["music_mood"]
    gain = (tl.get("music") or {}).get("gain_db", s["music_db"])
    if user and os.path.exists(user):
        music, loop = user, ["-stream_loop", "-1"]
    else:
        bed = _procedural_bed(mood, dur + 1.0, tmpdir)
        if not bed:
            return video  # clean / synthesis failed -> VO only
        music, loop = bed, []
    mixed = os.path.join(tmpdir, "with_music.mp4")
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", video,
         *loop, "-i", music, "-filter_complex",
         f"[1:a]volume={gain}dB[m];"
         f"[m][0:a]sidechaincompress=threshold=0.03:ratio=8:release=400[d];"
         f"[0:a][d]amix=inputs=2:duration=first:normalize=0[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy",
         "-c:a", "aac", "-ar", "48000", "-shortest", mixed],
        capture_output=True, text=True)
    return mixed if res.returncode == 0 else video
```

- [ ] **Step 7: Extend qa() and replace main()**

Replace `qa(...)` and `main()` with:

```python
def qa(final, plans, s):
    info = ffprobe_info(final)
    print("\n=== QA ===")
    print(f"style: {s['name']}  transition: {s['transition']}")
    print(f"output: {final}")
    print(f"streams: video={info['width']}x{info['height']}@{info['fps']} "
          f"audio={'yes' if info['has_audio'] else 'NO'}  "
          f"duration={info['duration']:.2f}s")
    worst = 0.0
    for sid, T, narr, kind in plans:
        d = abs(T - narr) if narr > 0 and kind == "content" else 0.0
        worst = max(worst, d)
        flag = "  <-- review" if d > 0.6 else ""
        print(f"  {sid} [{kind}]: video={T:5.2f}s "
              f"narration={narr:5.2f}s delta={d:4.2f}s{flag}")
    vd = subprocess.run(
        ["ffmpeg", "-i", final, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    m = re.search(r"max_volume:\s*(-?[0-9.]+) dB", vd)
    if m:
        print(f"peak audio: {m.group(1)} dB "
              f"({'OK' if float(m.group(1)) <= 0 else 'CLIPPING'})")
    print(f"worst content delta: {worst:.2f}s")
    print("==========")
    if not info["has_audio"] or info["duration"] <= 0:
        raise SystemExit("QA FAILED: missing audio or zero duration")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--style", default=None,
                    choices=["apple", "vox", "clean"],
                    help="override timeline.style")
    args = ap.parse_args()

    with open(args.timeline) as f:
        tl = json.load(f)
    if args.style:
        tl["style"] = args.style
    s = style.resolve_style(tl)
    src = args.video
    if not os.path.exists(src):
        raise SystemExit(f"video not found: {src}")
    info = ffprobe_info(src)
    os.makedirs(args.out, exist_ok=True)
    print(f"style: {s['name']}")

    plans_qa = []
    with tempfile.TemporaryDirectory() as tmp:
        seg_files = []
        for i, seg in enumerate(tl["segments"]):
            kind = seg.get("kind", "content")
            if kind in ("intro", "outro"):
                path, T = build_card(seg, info, s, i, tmp)
            else:
                clip_len = float(seg.get("source_out", 0)) - \
                    float(seg.get("source_in", 0))
                plan = compute_plan(seg, clip_len, s["pad"], s["min_t"])
                path, T = build_segment(seg, src, info, plan, s, i, tmp)
            seg_files.append(path)
            plans_qa.append((seg["id"], T,
                             float(seg.get("audio_duration") or 0.0), kind))
            print(f"  {seg['id']} [{kind}] -> {T:.2f}s")

        stitched = os.path.join(tmp, "stitched.mp4")
        stitch(seg_files, s, tmp, stitched)
        stitched = add_music(stitched, tl, s, tmp)

        final = os.path.join(args.out, "demo.mp4")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", stitched,
             "-c", "copy", "-movflags", "+faststart", final])

    with open(os.path.join(args.out, "timeline.json"), "w") as f:
        json.dump(tl, f, indent=2)
    with open(os.path.join(args.out, "narration.md"), "w") as f:
        f.write("# Narration\n\n")
        for seg in tl["segments"]:
            if (seg.get("narration") or "").strip():
                f.write(f"**{seg['id']}** — {seg['narration'].strip()}\n\n")

    qa(final, plans_qa, s)
    print(f"\nDone: {os.path.join(args.out, 'demo.mp4')}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 8: Remove now-dead code**

Delete the old `find_font()`/`escape_drawtext` imports from compose's import line
if present (compose no longer imports them — Step 1 already replaced the import line
with `from lib import ffprobe_info, run`). Confirm no remaining references:

Run: `grep -n "escape_drawtext\|find_font\|ffprobe_duration" skills/creating-product-demo-video/scripts/compose_video.py`
Expected: no output.

- [ ] **Step 9: Byte-compile check**

Run: `$PY -m py_compile skills/creating-product-demo-video/scripts/compose_video.py skills/creating-product-demo-video/scripts/style.py`
Expected: no output (success).

- [ ] **Step 10: Commit**

```bash
git add skills/creating-product-demo-video/scripts/compose_video.py
git commit -m "feat(compose): cinematic staged pipeline with cards, motion, captions, beds"
```

---

## Task 8: End-to-end verification (apple + vox)

**Files:**
- Create: `tests/test_e2e.py`

- [ ] **Step 1: Write the end-to-end test**

Create `tests/test_e2e.py`:

```python
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SK = os.path.join(ROOT, "skills", "creating-product-demo-video")
PY = os.path.join(SK, ".venv", "bin", "python")


def _ffprobe(path, entries):
    return subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", entries,
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True).stdout.strip()


def _make_timeline(work, preset):
    tl = {
        "source_video": os.path.join(work, "sample.mp4"),
        "style": preset,
        "segments": [
            {"id": "intro", "kind": "intro", "title": "Meet the Product",
             "subtitle": "A faster way to work",
             "narration": "Meet the product."},
            {"id": "s01", "kind": "content", "source_in": 0.0,
             "source_out": 4.0, "caption": "Search anything",
             "narration": "Search finds what you need in an instant.",
             "focus": {"x": 0.3, "y": 0.3, "w": 0.4, "h": 0.4}},
            {"id": "s02", "kind": "content", "source_in": 4.0,
             "source_out": 8.0, "caption": "Confirm",
             "narration": "Confirm, and you are done."},
            {"id": "outro", "kind": "outro", "title": "Thank you",
             "subtitle": "", "narration": "That is the whole flow."},
        ],
    }
    p = os.path.join(work, f"timeline_{preset}.json")
    with open(p, "w") as f:
        json.dump(tl, f)
    return p


def _run_pipeline(work, preset):
    sample = os.path.join(work, "sample.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                    "-i", "testsrc2=size=1280x720:rate=30:duration=8",
                    "-pix_fmt", "yuv420p", sample], check=True)
    open(os.path.join(work, "flow.png"), "wb").close()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi",
                    "-i", "color=c=blue:s=400x300:d=1", "-frames:v", "1",
                    os.path.join(work, "flow.png")], check=True)
    tl = _make_timeline(work, preset)
    env = dict(os.environ)
    env.pop("ELEVENLABS_API_KEY", None)
    env.pop("OPENAI_API_KEY", None)
    subprocess.run([PY, os.path.join(SK, "scripts", "tts_render.py"),
                    "--timeline", tl, "--out", work], check=True, env=env)
    out = os.path.join(work, f"out_{preset}")
    r = subprocess.run([PY, os.path.join(SK, "scripts", "compose_video.py"),
                        "--timeline", tl, "--video", sample, "--out", out],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr + r.stdout
    return os.path.join(out, "demo.mp4"), r.stdout


def test_apple_pipeline_end_to_end(tmp_path):
    work = str(tmp_path)
    demo, log = _run_pipeline(work, "apple")
    assert os.path.exists(demo)
    assert "video" == _ffprobe(demo,
        "stream=codec_type").splitlines()[0]
    dur = float(_ffprobe(demo, "format=duration"))
    # intro+content(4+4 re-paced)+outro must exceed the raw 8s source
    assert dur > 9.0, f"duration {dur} too short — cards/pacing missing"
    assert "style: apple" in log
    for art in ("demo.mp4", "timeline.json", "narration.md"):
        assert os.path.exists(os.path.join(work, "out_apple", art))


def test_vox_pipeline_switches_preset(tmp_path):
    demo, log = _run_pipeline(str(tmp_path), "vox")
    assert os.path.exists(demo)
    assert "style: vox" in log
    assert float(_ffprobe(demo, "format=duration")) > 7.0
```

- [ ] **Step 2: Run the e2e test**

Run: `$PY -m pytest tests/test_e2e.py -q`
Expected: PASS (2 passed). If a stage fails, the captured `r.stderr` is asserted
into the failure message — debug from that ffmpeg error, fix the offending filter
graph in `compose_video.py`, re-run.

- [ ] **Step 3: Run the full test suite**

Run: `$PY -m pytest tests/ -q`
Expected: PASS (all tests). 

- [ ] **Step 4: Manual spot-check (human/agent visual review)**

Run:
```bash
rm -rf /tmp/cine && mkdir /tmp/cine && \
$PY -c "import tests.test_e2e as t; t._run_pipeline('/tmp/cine','apple')" 2>/dev/null; \
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 /tmp/cine/out_apple/demo.mp4
```
Open `/tmp/cine/out_apple/demo.mp4` and confirm: intro card with SF Pro title,
Ken Burns motion on content, lower-third caption fading in/out, spotlight punch-in
on segment s01, outro card, audible narration, subtle music bed.

- [ ] **Step 5: Commit**

```bash
git add tests/test_e2e.py
git commit -m "test: end-to-end apple + vox cinematic verification"
```

---

## Task 9: Docs — SKILL.md + README

**Files:**
- Modify: `skills/creating-product-demo-video/SKILL.md`
- Modify: `README.md`

- [ ] **Step 1: Update SKILL.md**

In `SKILL.md`, in the **Phase 2 — Script & timeline** section, replace its body with:

```markdown
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
```

In the **Quick Reference** table add a row:
```markdown
| Pick a style | add `"style":"apple|vox|clean"` to timeline, or `--style` on compose |
```

In **Common Mistakes** add:
```markdown
- **No intro/outro for apple/vox** — add `kind:"intro"` and `kind:"outro"`
  card segments; they define the produced feel.
- **Vox without `focus`** — spotlight callouts need a `focus` rect; without
  it Vox segments are just zoomed.
```

- [ ] **Step 2: Update README.md**

In `README.md`, replace the "## How it works" table's last row and add a new
section after the "## Voiceover quality tiers" section:

```markdown
## Style presets

| Preset | Feel | Motion | Typography | Music |
|--------|------|--------|------------|-------|
| `apple` (default) | calm, premium | subtle Ken Burns | SF Pro hero cards | soft ambient pad |
| `vox` | energetic, explanatory | punch-in spotlight | bold kinetic captions | rhythmic pulse |
| `clean` | minimal | none | small captions | none |

Set per project with `"style"` in `timeline.json`, or override at render time:

```bash
python .../compose_video.py --timeline work/timeline.json --video product.mov --out output/ --style vox
```

Music: a user-supplied `music.path` is used and ducked under narration;
otherwise a royalty-free bed is synthesized per preset.
```

- [ ] **Step 3: Commit**

```bash
git add skills/creating-product-demo-video/SKILL.md README.md
git commit -m "docs: style presets, card/focus authoring guidance"
```

---

## Task 10: Push

- [ ] **Step 1: Run the full suite once more**

Run: `$PY -m pytest tests/ -q`
Expected: all pass.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```
Expected: branch up to date / new commits pushed.

---

## Self-Review

**Spec coverage:**
- Style presets (apple/vox/clean) → Task 2 ✓
- Pillow PNG typography (no drawtext) → Task 4 ✓
- Hero intro/outro cards → Task 7 Step 4 ✓
- Ken Burns motion → Task 3 + Task 7 Step 3 ✓
- Kinetic captions → Task 4 + Task 7 Step 3 ✓
- Spotlight callouts (focus) → Task 3 (clamp) + Task 7 `_spotlight` ✓
- Procedural + user music bed, ducked → Task 7 Step 6 ✓
- Schema extensions → Task 5 ✓
- Re-pacing reuse (compute_plan) → Task 7 Step 2 ✓
- ffmpeg-only + pillow, py3.9 → Task 1 ✓
- Error handling (font fallback, xfade fallback, music fallback, focus clamp,
  invalid style) → Tasks 2/3/4/7 ✓
- Verification apple+vox, no keys, source unchanged → Task 8 ✓
- Docs → Task 9 ✓

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `resolve_style`→dict `s` keys (`name,pad,min_t,kenburns,
kb_zoom,transition,xfade_dur,grade,card_bg,card_fg,caption_style,accent,
music_mood,music_db,card_dur`) are produced in Task 2 and consumed consistently
in Tasks 3/4/7. `render_card(title,subtitle,s,w,h,out)` and
`render_caption(text,s,w,h,out)` signatures match call sites in Task 7.
`compute_plan(seg,clip_len,pad,min_t)` signature matches the Task 7 main() call.
`stitch`/`_concat_copy`/`add_music`/`build_card`/`build_segment`/`qa` names match
their call sites in `main()`.

No gaps found.

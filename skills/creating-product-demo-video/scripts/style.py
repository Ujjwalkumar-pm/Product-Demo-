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

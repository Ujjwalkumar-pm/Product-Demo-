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

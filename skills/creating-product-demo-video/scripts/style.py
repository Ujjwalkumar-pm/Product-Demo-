"""Style presets + Pillow typography for the Product Demo Skill.

ffmpeg in this environment has no drawtext filter, so all text is rendered
to transparent PNGs here and composited by compose_video.py via overlay.
"""
from __future__ import annotations

import copy
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
    """Parse a 6-digit '#rrggbb' (alpha byte tolerated and dropped)."""
    c = c.lstrip("#")
    if len(c) == 8:          # #rrggbbaa -> drop alpha
        c = c[:6]
    if len(c) != 6:
        raise ValueError(f"_hex expects a 6-digit hex color, got '{c}'")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _center_text(draw, cx: float, y: float, text: str, font,
                  fill) -> int:
    """Draw `text` horizontally centered at x=cx with its top at y.

    anchor='lt' makes the bounding box top-left land exactly at the
    passed coordinate so vertical spacing math is accurate.
    """
    bbox = draw.textbbox((0, 0), text, font=font, anchor="lt")
    w = bbox[2] - bbox[0]
    draw.text((cx - w / 2, y), text, font=font, fill=fill, anchor="lt")
    return bbox[3] - bbox[1]


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
    pad_y = int(h * 0.022)
    bar_h = tht + pad_y * 2
    bar_y = int(h * 0.84)
    box_a = 170 if bold else 120
    d.rectangle([0, bar_y, w, bar_y + bar_h], fill=(0, 0, 0, box_a))
    if bold:  # Vox accent underline
        ul = max(int(h * 0.008), 3)
        d.rectangle([0, bar_y + bar_h - ul, w, bar_y + bar_h],
                    fill=_hex(s["accent"]) + (255,))
    d.text(((w - tw) / 2, bar_y + pad_y), text, font=font,
           fill=(255, 255, 255, 245), anchor="lt")
    img.save(out_path)
    return True

import style
import os
from PIL import Image


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
    assert s["name"] == "apple"


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

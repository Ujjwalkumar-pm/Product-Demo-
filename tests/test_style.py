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
    assert s["name"] == "apple"

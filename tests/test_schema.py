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

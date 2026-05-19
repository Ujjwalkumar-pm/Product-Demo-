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

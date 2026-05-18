"""Shared ffprobe/ffmpeg helpers. Used by analyze_video.py and compose_video.py.

We shell out to system ffmpeg/ffprobe deliberately: it is already present, far more
capable than any pip media lib for re-pacing, and keeps the venv tiny.
"""
from __future__ import annotations

import json
import os
import subprocess
from typing import Optional

# macOS font candidates for drawtext captions. drawtext needs a real font file;
# if none of these exist we skip captions rather than crash.
_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/SFNS.ttf",
]


def run(cmd: list[str], quiet: bool = True) -> str:
    """Run a command, raise with stderr on failure, return stdout."""
    proc = subprocess.run(
        cmd, capture_output=True, text=True
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr.strip()}"
        )
    if not quiet and proc.stderr:
        print(proc.stderr.strip())
    return proc.stdout


def ffprobe_duration(path: str) -> float:
    """Duration of the first stream/container in seconds."""
    out = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", path,
    ])
    try:
        return float(out.strip())
    except ValueError:
        return 0.0


def ffprobe_info(path: str) -> dict:
    """Return {duration, width, height, fps, has_audio} for a video file."""
    out = run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", path,
    ])
    data = json.loads(out)
    info: dict = {"duration": 0.0, "width": 0, "height": 0, "fps": 30.0,
                  "has_audio": False}
    try:
        info["duration"] = float(data.get("format", {}).get("duration", 0.0))
    except (TypeError, ValueError):
        pass
    for s in data.get("streams", []):
        if s.get("codec_type") == "video" and not info["width"]:
            info["width"] = int(s.get("width", 0))
            info["height"] = int(s.get("height", 0))
            rate = s.get("avg_frame_rate") or s.get("r_frame_rate") or "30/1"
            try:
                num, den = rate.split("/")
                info["fps"] = round(float(num) / float(den), 3) if float(den) else 30.0
            except (ValueError, ZeroDivisionError):
                info["fps"] = 30.0
        if s.get("codec_type") == "audio":
            info["has_audio"] = True
    return info


def has_drawtext() -> bool:
    """Some ffmpeg builds ship without libfreetype (no drawtext filter)."""
    try:
        out = run(["ffmpeg", "-hide_banner", "-filters"])
    except RuntimeError:
        return False
    return any(line.split()[1] == "drawtext"
               for line in out.splitlines() if " drawtext " in f" {line} ")


def can_caption() -> Optional[str]:
    """Return a usable font path only if BOTH a font and drawtext exist."""
    if not has_drawtext():
        return None
    for f in _FONT_CANDIDATES:
        if os.path.exists(f):
            return f
    return None


def find_font() -> Optional[str]:
    return can_caption()


def escape_drawtext(text: str) -> str:
    """Make caption text safe for ffmpeg drawtext."""
    text = text.replace("\\", "")
    text = text.replace(":", " -").replace("'", "").replace('"', "")
    text = text.replace("%", " percent").replace("\n", " ")
    return text.strip()

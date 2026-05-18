#!/usr/bin/env python3
"""Phase 1 — Analyze.

Probes the product video and extracts keyframes so Claude can map the
user-flow diagram onto real timestamps in the footage.

Outputs into --out:
  meta.json          video info + frame index (timestamps)
  frames/sample_*    one frame every --interval seconds (fast, even coverage)
  frames/scene_*     frames at detected scene changes (UI transitions)

Claude then reads frames/ + the diagram with vision to build the timeline.
"""
from __future__ import annotations

import argparse
import json
import os
import re

from lib import ffprobe_info, run


def sample_frames(video: str, frames_dir: str, duration: float, interval: float):
    out = []
    t = 0.0
    idx = 0
    while t < max(duration, 0.001):
        name = f"sample_{idx:03d}_t{t:07.2f}.jpg"
        path = os.path.join(frames_dir, name)
        # -ss before -i = fast keyframe seek; accurate enough for thumbnails.
        run([
            "ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.3f}",
            "-i", video, "-frames:v", "1", "-q:v", "3", path,
        ])
        if os.path.exists(path):
            out.append({"t": round(t, 2), "path": path})
        idx += 1
        t += interval
    return out


def scene_frames(video: str, frames_dir: str, threshold: float):
    """Extract frames at scene changes and recover their timestamps via showinfo.

    showinfo logs each emitted frame's pts_time to stderr; we extract frames and
    parse those timestamps in a single pass.
    """
    import subprocess
    pattern = os.path.join(frames_dir, "scene_%03d.jpg")
    res = subprocess.run([
        "ffmpeg", "-y", "-loglevel", "info", "-i", video,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr", "-q:v", "3", pattern,
    ], capture_output=True, text=True)
    times = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", res.stderr)]
    out = []
    for i, t in enumerate(times):
        p = os.path.join(frames_dir, f"scene_{i+1:03d}.jpg")
        if os.path.exists(p):
            out.append({"t": round(t, 2), "path": p})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--diagram", required=True, help="user-flow diagram (image/pdf)")
    ap.add_argument("--out", required=True, help="working directory")
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--scene-threshold", type=float, default=0.3)
    args = ap.parse_args()

    for p in (args.video, args.diagram):
        if not os.path.exists(p):
            raise SystemExit(f"input not found: {p}")

    frames_dir = os.path.join(args.out, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    info = ffprobe_info(args.video)
    samples = sample_frames(args.video, frames_dir, info["duration"], args.interval)
    try:
        scenes = scene_frames(args.video, frames_dir, args.scene_threshold)
    except Exception as e:  # scene detection is best-effort
        print(f"scene detection skipped: {e}")
        scenes = []

    meta = {
        "video": os.path.abspath(args.video),
        "diagram": os.path.abspath(args.diagram),
        "info": info,
        "sampled_frames": samples,
        "scene_frames": scenes,
    }
    meta_path = os.path.join(args.out, "meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {meta_path}")
    print(f"  duration={info['duration']:.2f}s {info['width']}x{info['height']} "
          f"@{info['fps']}fps  audio={info['has_audio']}")
    print(f"  {len(samples)} sample frames, {len(scenes)} scene frames in {frames_dir}")
    print("Next: read frames/ + the diagram, then write timeline.json "
          "(see data/timeline.schema.json).")


if __name__ == "__main__":
    main()

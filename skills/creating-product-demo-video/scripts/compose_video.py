#!/usr/bin/env python3
"""Phase 4 — Re-pace & compose.

For each timeline segment: cut [source_in, source_out], fit the video duration to
its narration (the Apple-style re-pace), burn an optional caption, attach the
narration audio, then concatenate everything, mix optional ducked music, and
export output/demo.mp4. Phase 5 QA is printed at the end.

ffmpeg only. The original video is never modified in place.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile

from lib import ffprobe_duration, ffprobe_info, find_font, escape_drawtext, run

PAD = 0.4          # breathing room after narration (s)
MIN_T = 0.6        # minimum on-screen duration for any segment (s)


def compute_plan(seg: dict, clip_len: float) -> dict:
    """Decide final segment duration T and how to reach it from clip_len."""
    narr = float(seg.get("audio_duration") or 0.0)
    pace = seg.get("pace", "auto")
    max_speedup = float(seg.get("max_speedup") or 2.0)
    clip_len = max(clip_len, 0.04)

    if pace == "as_is" or (pace == "auto" and narr <= 0):
        return {"T": max(clip_len, MIN_T), "mode": "none"}

    if pace == "trim":
        T = max(narr if narr > 0 else clip_len, MIN_T)
        if clip_len >= T:
            return {"T": T, "mode": "none"}          # output -t T truncates
        return {"T": T, "mode": "hold", "param": T - clip_len}

    if pace == "slow":
        T = max(narr, clip_len, MIN_T)
        return {"T": T, "mode": "slow", "param": T / clip_len}

    if pace == "hold":
        T = max(narr, clip_len, MIN_T)
        return {"T": T, "mode": "hold", "param": max(T - clip_len, 0.0)}

    # pace == "auto" with narration present
    T0 = max(narr + PAD, MIN_T)
    ratio = clip_len / T0
    if ratio > 1.0:                                   # footage longer than voice
        s = min(ratio, max_speedup)
        T = clip_len / s                              # may exceed T0 if capped
        return {"T": T, "mode": "speed", "param": s}
    if clip_len < T0:                                 # footage shorter than voice
        return {"T": T0, "mode": "hold", "param": T0 - clip_len}
    return {"T": T0, "mode": "none"}


def build_segment(seg, src, info, plan, font, idx, tmpdir):
    W, H, FPS = info["width"] or 1280, info["height"] or 720, info["fps"] or 30
    in_t = float(seg["source_in"])
    clip_len = max(float(seg["source_out"]) - in_t, 0.04)
    T = round(plan["T"], 3)

    vf = [f"scale={W}:{H}:force_original_aspect_ratio=decrease",
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2", "setsar=1", f"fps={FPS}"]
    if plan["mode"] == "speed":
        vf.append(f"setpts=PTS/{plan['param']:.6f}")
    elif plan["mode"] == "slow":
        vf.append(f"setpts=PTS*{plan['param']:.6f}")
    elif plan["mode"] == "hold":
        vf.append(f"tpad=stop_mode=clone:stop_duration={plan['param']:.3f}")

    cap = (seg.get("caption") or "").strip()
    if cap and font:
        txt = escape_drawtext(cap)
        vf.append(
            f"drawtext=fontfile={font}:text='{txt}':fontcolor=white:"
            f"fontsize={max(H // 24, 18)}:box=1:boxcolor=black@0.45:boxborderw=16:"
            f"x=(w-text_w)/2:y=h-(text_h*3)")

    if seg.get("transition", "dissolve") in ("fade", "dissolve") and T > 0.7:
        vf.append("fade=t=in:st=0:d=0.25")
        vf.append(f"fade=t=out:st={max(T - 0.25, 0):.3f}:d=0.25")
    vf.append("format=yuv420p")

    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-ss", f"{in_t:.3f}", "-t", f"{clip_len:.3f}", "-i", src]
    audio = seg.get("audio_path")
    if audio and os.path.exists(audio):
        cmd += ["-i", audio]
        af = (f"aresample=48000,apad,atrim=0:{T:.3f},asetpts=N/SR/TB,"
              f"afade=t=in:d=0.08,afade=t=out:st={max(T - 0.2, 0):.3f}:d=0.2")
    else:
        cmd += ["-f", "lavfi", "-t", f"{T:.3f}", "-i",
                "anullsrc=r=48000:cl=stereo"]
        af = "aresample=48000"

    out = os.path.join(tmpdir, f"seg_{idx:03d}.mp4")
    cmd += ["-filter_complex",
            f"[0:v]{','.join(vf)}[v];[1:a]{af}[a]",
            "-map", "[v]", "-map", "[a]", "-t", f"{T:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "48000", "-ac", "2", out]
    run(cmd)
    return out, T


def concat(segments, tmpdir, dst):
    listfile = os.path.join(tmpdir, "concat.txt")
    with open(listfile, "w") as f:
        for s in segments:
            f.write(f"file '{s}'\n")
    # Params are identical across segments, so stream-copy concat is safe & fast.
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", listfile, "-c", "copy", dst],
        capture_output=True, text=True)
    if res.returncode != 0:                       # fallback: re-encode concat
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", listfile, "-c:v", "libx264", "-preset", "veryfast",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", dst])


def add_music(video, music, gain_db, tmpdir):
    mixed = os.path.join(tmpdir, "with_music.mp4")
    # Side-chain compression ducks the music whenever narration is present.
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", video,
         "-stream_loop", "-1", "-i", music,
         "-filter_complex",
         f"[1:a]volume={gain_db}dB[m];"
         f"[m][0:a]sidechaincompress=threshold=0.03:ratio=8:release=400[duck];"
         f"[0:a][duck]amix=inputs=2:duration=first:normalize=0[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy",
         "-c:a", "aac", "-ar", "48000", "-shortest", mixed])
    return mixed


def qa(final, plans):
    info = ffprobe_info(final)
    print("\n=== QA ===")
    print(f"output: {final}")
    print(f"streams: video={info['width']}x{info['height']}@{info['fps']} "
          f"audio={'yes' if info['has_audio'] else 'NO'}  "
          f"duration={info['duration']:.2f}s")
    worst = 0.0
    for sid, T, narr in plans:
        d = abs(T - narr) if narr > 0 else 0.0
        worst = max(worst, d)
        flag = "  <-- review" if d > 0.6 else ""
        print(f"  {sid}: video={T:5.2f}s narration={narr:5.2f}s "
              f"delta={d:4.2f}s{flag}")
    vd = subprocess.run(
        ["ffmpeg", "-i", final, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    m = re.search(r"max_volume:\s*(-?[0-9.]+) dB", vd)
    if m:
        print(f"peak audio: {m.group(1)} dB "
              f"({'OK' if float(m.group(1)) <= 0 else 'CLIPPING'})")
    print(f"worst segment delta: {worst:.2f}s")
    print("==========")
    if not info["has_audio"] or info["duration"] <= 0:
        raise SystemExit("QA FAILED: missing audio or zero duration")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True, help="output directory")
    args = ap.parse_args()

    with open(args.timeline) as f:
        tl = json.load(f)
    src = args.video
    if not os.path.exists(src):
        raise SystemExit(f"video not found: {src}")

    info = ffprobe_info(src)
    font = find_font()
    if not font:
        print("note: no usable font found; captions will be skipped.")
    os.makedirs(args.out, exist_ok=True)

    plans_qa = []
    with tempfile.TemporaryDirectory() as tmp:
        seg_files = []
        for i, seg in enumerate(tl["segments"]):
            clip_len = float(seg["source_out"]) - float(seg["source_in"])
            plan = compute_plan(seg, clip_len)
            path, T = build_segment(seg, src, info, plan, font, i, tmp)
            seg_files.append(path)
            plans_qa.append((seg["id"], T,
                             float(seg.get("audio_duration") or 0.0)))
            print(f"  {seg['id']}: mode={plan['mode']:5s} -> {T:.2f}s")

        stitched = os.path.join(tmp, "stitched.mp4")
        concat(seg_files, tmp, stitched)

        music = (tl.get("music") or {}).get("path")
        if music and os.path.exists(music):
            gain = (tl.get("music") or {}).get("gain_db", -22)
            stitched = add_music(stitched, music, gain, tmp)

        final = os.path.join(args.out, "demo.mp4")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", stitched,
             "-c", "copy", "-movflags", "+faststart", final])

    # Editable artifacts alongside the video.
    with open(os.path.join(args.out, "timeline.json"), "w") as f:
        json.dump(tl, f, indent=2)
    with open(os.path.join(args.out, "narration.md"), "w") as f:
        f.write("# Narration\n\n")
        for seg in tl["segments"]:
            if (seg.get("narration") or "").strip():
                f.write(f"**{seg['id']}** — {seg['narration'].strip()}\n\n")

    qa(final, plans_qa)
    print(f"\nDone: {os.path.join(args.out, 'demo.mp4')}")


if __name__ == "__main__":
    main()

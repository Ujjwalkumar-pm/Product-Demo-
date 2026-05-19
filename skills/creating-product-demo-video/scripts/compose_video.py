#!/usr/bin/env python3
"""Phase 4 — Re-pace & cinematic compose.

Stages per content segment: cut -> color grade -> Ken Burns -> optional
spotlight -> caption overlay -> re-paced narration. Plus hero intro/outro
cards, preset crossfades, and a user or procedural music bed. ffmpeg only;
the original video is never modified in place.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile

import style
from lib import ffprobe_info, run

PAD = 0.4
MIN_T = 0.6


def compute_plan(seg: dict, clip_len: float, pad: float = PAD,
                  min_t: float = MIN_T) -> dict:
    """Decide final segment duration T and how to reach it from clip_len."""
    narr = float(seg.get("audio_duration") or 0.0)
    pace = seg.get("pace", "auto")
    max_speedup = float(seg.get("max_speedup") or 2.0)
    clip_len = max(clip_len, 0.04)

    if pace == "as_is" or (pace == "auto" and narr <= 0):
        return {"T": max(clip_len, min_t), "mode": "none"}

    if pace == "trim":
        T = max(narr if narr > 0 else clip_len, min_t)
        if clip_len >= T:
            return {"T": T, "mode": "none"}          # output -t T truncates
        return {"T": T, "mode": "hold", "param": T - clip_len}

    if pace == "slow":
        T = max(narr, clip_len, min_t)
        return {"T": T, "mode": "slow", "param": T / clip_len}

    if pace == "hold":
        T = max(narr, clip_len, min_t)
        return {"T": T, "mode": "hold", "param": max(T - clip_len, 0.0)}

    # pace == "auto" with narration present
    T0 = max(narr + pad, min_t)
    ratio = clip_len / T0
    if ratio > 1.0:                                   # footage longer than voice
        s = min(ratio, max_speedup)
        T = clip_len / s                              # may exceed T0 if capped
        return {"T": T, "mode": "speed", "param": s}
    if clip_len < T0:                                 # footage shorter than voice
        return {"T": T0, "mode": "hold", "param": T0 - clip_len}
    return {"T": T0, "mode": "none"}


def _grade(vf: list, s: dict):
    if s.get("grade"):
        vf.append(s["grade"])


def _spotlight(vf: list, focus: dict, W: int, H: int):
    """Dim+blur the frame and overlay a sharp, zoomed crop of the focus rect."""
    x, y, w, h = style.clamp_focus(focus)
    cx, cy = int(W * x), int(H * y)
    cw, ch = max(int(W * w), 16), max(int(H * h), 16)
    vf.append(
        f"split=2[bg][fg];"
        f"[bg]gblur=sigma=18,eq=brightness=-0.10[bg2];"
        f"[fg]crop={cw}:{ch}:{cx}:{cy},scale={W}:{H}"
        f":force_original_aspect_ratio=increase,crop={W}:{H}[fg2];"
        f"[bg2][fg2]overlay=0:0"
    )


def build_segment(seg, src, info, plan, s, idx, tmpdir):
    W, H = info["width"] or 1280, info["height"] or 720
    FPS = int(round(info["fps"] or 30))
    in_t = float(seg.get("source_in", 0.0))
    clip_len = max(float(seg.get("source_out", in_t)) - in_t, 0.04)
    T = round(plan["T"], 3)
    out = os.path.join(tmpdir, f"seg_{idx:03d}.mp4")

    # ---- video filter graph ----
    base = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={FPS}")
    parts = [f"[0:v]{base}"]

    if plan["mode"] == "speed":
        parts.append(f"setpts=PTS/{plan['param']:.6f}")
    elif plan["mode"] == "slow":
        parts.append(f"setpts=PTS*{plan['param']:.6f}")
    elif plan["mode"] == "hold":
        parts.append(
            f"tpad=stop_mode=clone:stop_duration={plan['param']:.3f}")

    _grade(parts, s)

    focus = seg.get("focus")
    kb = seg.get("kenburns", "auto")
    if kb == "auto":
        kb = s["kenburns"]
    if focus:
        # spotlight is its own multi-pad chain; build it, then ken-burns the result
        sl = []
        _spotlight(sl, focus, W, H)
        chain = ",".join(parts) + "[v0];[v0]" + sl[0]
    else:
        kbx = style.kenburns_expr(
            "in" if kb in ("punch", "in", "auto") else kb,
            s["kb_zoom"] if kb != "none" else 1.0, FPS, T, W, H)
        if kbx != "null":
            parts.append(kbx)
        chain = ",".join(parts)
    chain += ",format=yuv420p[v]"

    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-ss", f"{in_t:.3f}", "-t", f"{clip_len:.3f}", "-i", src]

    # ---- caption overlay (Pillow PNG) ----
    cap = (seg.get("caption") or "").strip()
    cap_png = os.path.join(tmpdir, f"cap_{idx:03d}.png")
    have_cap = bool(cap) and style.render_caption(cap, s, W, H, cap_png)
    if have_cap:
        cmd += ["-loop", "1", "-t", f"{T:.3f}", "-i", cap_png]

    # ---- audio ----
    audio = seg.get("audio_path")
    a_idx = 2 if have_cap else 1
    if audio and os.path.exists(audio):
        cmd += ["-i", audio]
        af = (f"[{a_idx}:a]aresample=48000,apad,atrim=0:{T:.3f},"
              f"asetpts=N/SR/TB,afade=t=in:d=0.08,"
              f"afade=t=out:st={max(T - 0.2, 0):.3f}:d=0.2[a]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{T:.3f}", "-i",
                "anullsrc=r=48000:cl=stereo"]
        af = f"[{a_idx}:a]aresample=48000[a]"

    if have_cap:
        # fade the caption in/out for a kinetic feel
        fc = (f"{chain};[1:v]format=rgba,"
              f"fade=t=in:st=0:d=0.3:alpha=1,"
              f"fade=t=out:st={max(T - 0.4, 0):.3f}:d=0.4:alpha=1[cap];"
              f"[v][cap]overlay=0:0[vo];{af}")
        vmap = "[vo]"
    else:
        fc = f"{chain};{af}"
        vmap = "[v]"

    cmd += ["-filter_complex", fc, "-map", vmap, "-map", "[a]",
            "-t", f"{T:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "48000", "-ac", "2", out]
    run(cmd)
    return out, T


def build_card(seg, info, s, idx, tmpdir):
    W, H = info["width"] or 1280, info["height"] or 720
    FPS = int(round(info["fps"] or 30))
    audio = seg.get("audio_path")
    narr = float(seg.get("audio_duration") or 0.0)
    T = round(max(narr + 0.5, s["card_dur"]), 3)
    png = os.path.join(tmpdir, f"card_{idx:03d}.png")
    style.render_card(seg.get("title", ""), seg.get("subtitle", ""),
                      s, W, H, png)
    out = os.path.join(tmpdir, f"seg_{idx:03d}.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-loop", "1", "-t", f"{T:.3f}", "-i", png]
    if audio and os.path.exists(audio):
        cmd += ["-i", audio]
        af = (f"[1:a]aresample=48000,apad,atrim=0:{T:.3f},"
              f"asetpts=N/SR/TB[a]")
    else:
        cmd += ["-f", "lavfi", "-t", f"{T:.3f}", "-i",
                "anullsrc=r=48000:cl=stereo"]
        af = "[1:a]aresample=48000[a]"
    # gentle scale-in + fade for the hero card
    vf = (f"[0:v]scale={W}:{H},setsar=1,fps={FPS},"
          f"zoompan=z='min(zoom+0.0006,1.04)':d=1:s={W}x{H}:fps={FPS},"
          f"fade=t=in:st=0:d=0.5,"
          f"fade=t=out:st={max(T - 0.5, 0):.3f}:d=0.5,"
          f"format=yuv420p[v]")
    cmd += ["-filter_complex", f"{vf};{af}", "-map", "[v]", "-map", "[a]",
            "-t", f"{T:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "48000", "-ac", "2", out]
    run(cmd)
    return out, T


def stitch(seg_files, s, tmpdir, dst):
    """Crossfade segments per preset; fall back to concat on any failure."""
    if s["transition"] == "cut" or len(seg_files) == 1:
        return _concat_copy(seg_files, tmpdir, dst)
    xd = float(s["xfade_dur"])
    durs = [float(run(["ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of",
            "default=nw=1:nk=1", f]).strip()) for f in seg_files]
    inputs = []
    for f in seg_files:
        inputs += ["-i", f]
    vlab, alab, offset = "[0:v]", "[0:a]", 0.0
    fc = []
    for i in range(1, len(seg_files)):
        offset += durs[i - 1] - xd
        v_out = f"[v{i}]"
        a_out = f"[a{i}]"
        fc.append(f"{vlab}[{i}:v]xfade=transition=fade:duration={xd}"
                  f":offset={offset:.3f}{v_out}")
        fc.append(f"{alab}[{i}:a]acrossfade=d={xd}{a_out}")
        vlab, alab = v_out, a_out
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(fc),
         "-map", vlab, "-map", alab,
         "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-ar", "48000", dst],
        capture_output=True, text=True)
    if res.returncode != 0:
        return _concat_copy(seg_files, tmpdir, dst)
    return dst


def _concat_copy(seg_files, tmpdir, dst):
    listfile = os.path.join(tmpdir, "concat.txt")
    with open(listfile, "w") as f:
        for sfile in seg_files:
            f.write(f"file '{sfile}'\n")
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", listfile, "-c", "copy", dst],
        capture_output=True, text=True)
    if res.returncode != 0:
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat",
             "-safe", "0", "-i", listfile, "-c:v", "libx264",
             "-preset", "veryfast", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-ar", "48000", dst])
    return dst


def _procedural_bed(mood: str, dur: float, tmpdir: str) -> str | None:
    bed = os.path.join(tmpdir, "bed.wav")
    if mood == "ambient":
        # soft low triad pad
        src = ("aevalsrc='0.18*sin(2*PI*110*t)+0.12*sin(2*PI*164.81*t)"
               "+0.09*sin(2*PI*220*t)':s=48000:d=%.3f" % dur)
    elif mood == "pulse":
        src = ("aevalsrc='0.2*sin(2*PI*70*t)*(mod(t\\,0.5)<0.12)':"
               "s=48000:d=%.3f" % dur)
    else:
        return None
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", src,
         "-ac", "2", bed], capture_output=True, text=True)
    return bed if res.returncode == 0 else None


def add_music(video, tl, s, tmpdir):
    info = ffprobe_info(video)
    dur = info["duration"]
    user = (tl.get("music") or {}).get("path")
    mood = (tl.get("music") or {}).get("mood") or s["music_mood"]
    gain = (tl.get("music") or {}).get("gain_db", s["music_db"])
    if user and os.path.exists(user):
        music, loop = user, ["-stream_loop", "-1"]
    else:
        bed = _procedural_bed(mood, dur + 1.0, tmpdir)
        if not bed:
            return video  # clean / synthesis failed -> VO only
        music, loop = bed, []
    mixed = os.path.join(tmpdir, "with_music.mp4")
    res = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", video,
         *loop, "-i", music, "-filter_complex",
         f"[1:a]volume={gain}dB[m];"
         f"[m][0:a]sidechaincompress=threshold=0.03:ratio=8:release=400[d];"
         f"[0:a][d]amix=inputs=2:duration=first:normalize=0[a]",
         "-map", "0:v", "-map", "[a]", "-c:v", "copy",
         "-c:a", "aac", "-ar", "48000", "-shortest", mixed],
        capture_output=True, text=True)
    return mixed if res.returncode == 0 else video


def qa(final, plans, s):
    info = ffprobe_info(final)
    print("\n=== QA ===")
    print(f"style: {s['name']}  transition: {s['transition']}")
    print(f"output: {final}")
    print(f"streams: video={info['width']}x{info['height']}@{info['fps']} "
          f"audio={'yes' if info['has_audio'] else 'NO'}  "
          f"duration={info['duration']:.2f}s")
    worst = 0.0
    for sid, T, narr, kind in plans:
        d = abs(T - narr) if narr > 0 and kind == "content" else 0.0
        worst = max(worst, d)
        flag = "  <-- review" if d > 0.6 else ""
        print(f"  {sid} [{kind}]: video={T:5.2f}s "
              f"narration={narr:5.2f}s delta={d:4.2f}s{flag}")
    vd = subprocess.run(
        ["ffmpeg", "-i", final, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    m = re.search(r"max_volume:\s*(-?[0-9.]+) dB", vd)
    if m:
        print(f"peak audio: {m.group(1)} dB "
              f"({'OK' if float(m.group(1)) <= 0 else 'CLIPPING'})")
    print(f"worst content delta: {worst:.2f}s")
    print("==========")
    if not info["has_audio"] or info["duration"] <= 0:
        raise SystemExit("QA FAILED: missing audio or zero duration")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--style", default=None,
                    choices=["apple", "vox", "clean"],
                    help="override timeline.style")
    args = ap.parse_args()

    with open(args.timeline) as f:
        tl = json.load(f)
    if args.style:
        tl["style"] = args.style
    s = style.resolve_style(tl)
    src = args.video
    if not os.path.exists(src):
        raise SystemExit(f"video not found: {src}")
    info = ffprobe_info(src)
    os.makedirs(args.out, exist_ok=True)
    print(f"style: {s['name']}")

    plans_qa = []
    with tempfile.TemporaryDirectory() as tmp:
        seg_files = []
        for i, seg in enumerate(tl["segments"]):
            kind = seg.get("kind", "content")
            if kind in ("intro", "outro"):
                path, T = build_card(seg, info, s, i, tmp)
            else:
                clip_len = float(seg.get("source_out", 0)) - \
                    float(seg.get("source_in", 0))
                plan = compute_plan(seg, clip_len, s["pad"], s["min_t"])
                path, T = build_segment(seg, src, info, plan, s, i, tmp)
            seg_files.append(path)
            plans_qa.append((seg["id"], T,
                             float(seg.get("audio_duration") or 0.0), kind))
            print(f"  {seg['id']} [{kind}] -> {T:.2f}s")

        stitched = os.path.join(tmp, "stitched.mp4")
        stitch(seg_files, s, tmp, stitched)
        stitched = add_music(stitched, tl, s, tmp)

        final = os.path.join(args.out, "demo.mp4")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", stitched,
             "-c", "copy", "-movflags", "+faststart", final])

    with open(os.path.join(args.out, "timeline.json"), "w") as f:
        json.dump(tl, f, indent=2)
    with open(os.path.join(args.out, "narration.md"), "w") as f:
        f.write("# Narration\n\n")
        for seg in tl["segments"]:
            if (seg.get("narration") or "").strip():
                f.write(f"**{seg['id']}** — {seg['narration'].strip()}\n\n")

    qa(final, plans_qa, s)
    print(f"\nDone: {os.path.join(args.out, 'demo.mp4')}")


if __name__ == "__main__":
    main()

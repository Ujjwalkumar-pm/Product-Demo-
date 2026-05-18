# Examples

The pipeline needs two inputs you supply locally (kept out of git to stay lightweight):

1. **A product video** — a screen recording of your product (`.mov` / `.mp4`).
2. **A user-flow diagram** — an image or PDF of the flow (`.png` / `.jpg` / `.pdf`).

## Quick smoke test (no real footage needed)

You can generate a synthetic clip + diagram to exercise the full pipeline:

```bash
# 10s synthetic "screen recording" with on-screen step markers
ffmpeg -f lavfi -i color=c=0x1d1d1f:s=1280x720:d=10 \
  -vf "drawtext=text='Step %{eif\\:trunc(t/2)+1\\:d}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2" \
  -r 30 sample_product.mp4

# Simple flow diagram
ffmpeg -f lavfi -i color=c=white:s=1000x400:d=1 \
  -vf "drawtext=text='Open -> Search -> Select -> Confirm -> Done':fontcolor=black:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2" \
  -frames:v 1 sample_flow.png
```

Then run the pipeline as shown in the top-level `README.md`. With no API keys set, narration
falls back to the macOS `say` voice and you still get a finished `output/demo.mp4`.

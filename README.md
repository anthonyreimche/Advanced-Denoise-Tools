# Advanced Denoise for SafeLight

GPU, multi-scale noise reduction for SafeLight's Develop module — the
"wavelet-based noise reduction, fine-scale luminance and colour decomposition"
from the roadmap, plus two companion algorithms.

It registers a single **processing stage** in the `noise-reduction` phase (so it
runs in scene-linear space, before exposure, exactly where denoise belongs) whose
GPU pre-passes do the heavy lifting, and a **Develop ▸ Advanced Denoise** panel
for the controls.

## Algorithms

All three run as ping-pong GPU pre-passes and are gated (zero cost when their
amount is 0):

- **Wavelet à trous** — the core. Five dilations (1, 2, 4, 8, 16 px) of an
  edge-avoiding B3-spline decomposition, smoothing flat regions across scales
  while a luminance edge-stop preserves detail. The denoised result is blended
  back with **independent luminance and colour strength**, so you can crush
  chroma blotches without softening luma texture (or vice-versa).
- **Bilateral pre-pass** — a fast 5×5 edge-aware primer that runs before the
  wavelet; good for heavier colour noise.
- **Non-local means** — patch-similarity denoise for the finest grain. Heavy;
  intended as an opt-in / export-grade tier.

## Controls

| Section | Control | Effect |
| --- | --- | --- |
| Luminance | Amount | How strongly luminance noise is reduced |
| Luminance | Detail | Edge preservation (higher keeps more fine detail) |
| Color | Amount | How strongly colour (chroma) noise is reduced |
| Range | Shadows / Highlights | Bias denoise toward dark / bright tones |
| Bilateral pre-pass | Strength | Edge-aware primer applied before the wavelet |
| Non-local means | Strength | Patch-similarity denoise (heavy) |

Settings persist per photo, take part in undo/redo, and ride along in develop
presets, just like a built-in adjustment.

**Alt/Ctrl-drag preview** ("CTRL view") — like the built-in Detail sliders, hold
Alt or Ctrl while dragging a denoise knob to see the affected signal isolated on
the canvas: the **Color** knob reveals chroma speckle against neutral grey, and
every other knob shows the luminance result. Release to return to the normal
view. This mirrors the core sliders these controls replace.

## Requirements

Requires a SafeLight build with the generic processing-stage framework
(extension-owned GPU stages with their own uniforms + multi-pass pre-passes).
Float render targets (`EXT_color_buffer_float`) are used when available; without
them the pre-passes fall back to 8-bit.

## Build

```sh
npm install
npm run build      # → dist/index.js
```

Then install the folder through SafeLight's Extensions store (or your dev
plugins folder).

## License

MIT

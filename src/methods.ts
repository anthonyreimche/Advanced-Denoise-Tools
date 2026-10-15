// Denoise methods. Each method is a self-contained processing stage carrying
// ONLY its own GPU pre-passes + the controls it needs, so selecting a method in
// Preferences registers just that stage (only its passes compile + run).
//
// Shared model: the pre-passes produce a fully-denoised linear image exposed to
// the inline blend as `vec3 stageResult`; the inline blend (identical across
// methods) mixes it into the develop pipeline's scene-linear `lin` with
// independent luminance/colour strength and a shadow/highlight bias.
//
// NOTE on naming: uniform keys are string-replaced into the GLSL by the host's
// namespacer, so a key must never be a substring of a GLSL builtin — in
// particular not `luma` (that would clobber the luma() helper). Hence lumAmt/colAmt.

import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";

export const STAGE_ID = "advanced-denoise.nr";

export type Method = "off" | "wavelet" | "bilateral" | "nlm";

export interface Knob {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  // Alt/Ctrl-drag preview ("CTRL view") mode, matching the core Detail panel's
  // develop-store.sharpenViz uniform: 1 = masking, 2 = detail/edge signal,
  // 3 = luminance (grayscale), 4 = chroma (colour-noise reveal). Omitted = none.
  // Mirrors the built-in NR convention: colour knob reveals chroma, everything
  // else shows the luminance result of the denoise.
  viz?: number;
}

export const KNOBS: Record<string, Knob> = {
  lumAmt: { key: "lumAmt", label: "Luminance", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  colAmt: { key: "colAmt", label: "Color", min: 0, max: 100, step: 1, default: 0, viz: 4 },
  detail: { key: "detail", label: "Detail", min: 0, max: 100, step: 1, default: 50, viz: 3 },
  scales: { key: "scales", label: "Scales", min: 1, max: 5, step: 1, default: 5, viz: 3 },
  shadow: { key: "shadow", label: "Shadows", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  highlight: { key: "highlight", label: "Highlights", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  radius: { key: "radius", label: "Radius", min: 1, max: 3, step: 0.1, default: 2, viz: 3 },
  strength: { key: "strength", label: "Strength", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  quality: { key: "quality", label: "Quality", min: 0, max: 100, step: 1, default: 0, viz: 3 },
};

const uni = (knob: Knob): UniformDeclaration => ({
  key: knob.key,
  glslType: "float",
  default: knob.default,
  range: { min: knob.min, max: knob.max, step: knob.step },
  label: knob.label,
});

// Inline uniforms shared by every method (drive the blend). Methods that don't
// expose Shadows/Highlights still declare them (default 0 → no bias).
const INLINE_UNIFORMS = [KNOBS.lumAmt, KNOBS.colAmt, KNOBS.shadow, KNOBS.highlight].map(uni);

// Inline blend on scene-linear `lin`, luma-normalised so luminance and colour
// denoise are independent and flat areas keep saturation. Colours outside the
// sRGB primaries arrive with channels below black, and their luma can sit at or
// below zero while a channel doesn't; dividing by it would blow those channels
// up. So the ratios divide by the luma of the channels above black, which bounds
// them as for an in-gamut colour and is the plain luma when none is negative.
const INLINE_GLSL = `
float _la = lumAmt / 100.0;
float _ca = colAmt / 100.0;
if (_la > 0.001 || _ca > 0.001) {
  float _lc = max(luma(max(lin, 0.0)), 1e-4);
  float _zone = clamp(1.0
    + (shadow / 100.0) * (1.0 - smoothstep(0.0, 0.35, _lc))
    - (highlight / 100.0) * smoothstep(0.65, 1.0, _lc), 0.0, 2.0);
  vec3 _den = stageResult;
  float _ld = max(luma(max(_den, 0.0)), 1e-4);
  float _nl = mix(_lc, _ld, clamp(_la * _zone, 0.0, 1.0));
  vec3 _chC = lin / _lc;
  vec3 _chD = _den / _ld;
  vec3 _ch = mix(_chC, _chD, clamp(_ca * _zone, 0.0, 1.0));
  lin = _ch * _nl;
}
`;

// ── Wavelet à trous (5 dilations, edge-avoiding B3-spline) ─────────────────
const ATROUS_HELPERS = `
float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }
`;
const ATROUS_GLSL = `
{
  if (uPassIndex < int(scales)) {
    float _dpr = detail / 100.0;
    vec3 _ctr = c;
    float _lc = luma(_ctr);
    float _sig = mix(0.6, 0.04, _dpr);
    float _sc = exp2(float(uPassIndex));
    vec3 _acc = vec3(0.0);
    float _w = 0.0;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec2 _o = vec2(float(dx), float(dy)) * _sc * uTexel;
        vec3 _s = readPrev(vUv + _o);
        float _sp = b3w(dx) * b3w(dy);
        float _dl = luma(_s) - _lc;
        float _ew = exp(-(_dl * _dl) / (2.0 * _sig * _sig + 1e-6));
        float _ww = _sp * _ew;
        _acc += _s * _ww;
        _w += _ww;
      }
    }
    c = _w > 0.0 ? _acc / _w : _ctr;
  }
}
`;

// ── Bilateral (edge-aware 5×5, radius-scaled) ──────────────────────────────
const BILATERAL_GLSL = `
{
  float _edge = mix(0.25, 0.03, detail / 100.0);
  vec3 _ctr = c;
  float _lc = luma(_ctr);
  vec3 _acc = vec3(0.0);
  float _w = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 _o = vec2(float(dx), float(dy)) * radius * uTexel;
      vec3 _s = readPrev(vUv + _o);
      float _sp = exp(-float(dx * dx + dy * dy) / 8.0);
      float _dl = luma(_s) - _lc;
      float _rw = exp(-(_dl * _dl) / (2.0 * _edge * _edge + 1e-6));
      float _ww = _sp * _rw;
      _acc += _s * _ww;
      _w += _ww;
    }
  }
  c = _w > 0.0 ? _acc / _w : _ctr;
}
`;

// ── Non-local means (5×5 search, 3×3 patch) ────────────────────────────────
const NLM_GLSL = `
{
  float _h2 = mix(0.05, 0.004, strength / 100.0);
  float _q = mix(1.0, 2.0, quality / 100.0);
  vec3 _ctr = c;
  vec3 _acc = vec3(0.0);
  float _w = 0.0;
  for (int sy = -2; sy <= 2; sy++) {
    for (int sx = -2; sx <= 2; sx++) {
      float _pd = 0.0;
      for (int py = -1; py <= 1; py++) {
        for (int px = -1; px <= 1; px++) {
          vec3 _pa = readPrev(vUv + vec2(float(px), float(py)) * uTexel);
          vec3 _pb = readPrev(vUv + vec2(float(sx + px), float(sy + py)) * _q * uTexel);
          vec3 _dd = _pa - _pb;
          _pd += dot(_dd, _dd);
        }
      }
      _pd /= 9.0;
      float _ww = exp(-_pd / (_h2 + 1e-6));
      vec3 _s = readPrev(vUv + vec2(float(sx), float(sy)) * _q * uTexel);
      _acc += _s * _ww;
      _w += _ww;
    }
  }
  c = _w > 0.0 ? _acc / _w : _ctr;
}
`;

// Ordered controls shown in the Detail panel per method.
export const METHOD_CONTROLS: Record<Exclude<Method, "off">, Knob[]> = {
  wavelet: [KNOBS.lumAmt, KNOBS.detail, KNOBS.colAmt, KNOBS.scales, KNOBS.shadow, KNOBS.highlight],
  bilateral: [KNOBS.lumAmt, KNOBS.colAmt, KNOBS.radius, KNOBS.detail],
  nlm: [KNOBS.lumAmt, KNOBS.colAmt, KNOBS.strength, KNOBS.quality],
};

export function controlsFor(method: Method): Knob[] {
  return method === "off" ? [] : METHOD_CONTROLS[method];
}

/** The processing stage for a method, or null for "off". */
export function stageFor(method: Method): ProcessingStageContribution | null {
  if (method === "off") return null;
  const base = {
    id: STAGE_ID,
    name: "Advanced Denoise",
    phase: "noise-reduction" as const,
    priority: 40,
    glsl: INLINE_GLSL,
    uniforms: INLINE_UNIFORMS,
  };
  if (method === "wavelet") {
    return {
      ...base,
      passes: [
        { glsl: ATROUS_GLSL, helpers: ATROUS_HELPERS, iterations: 5, uniforms: [KNOBS.detail, KNOBS.scales].map(uni) },
      ],
    };
  }
  if (method === "bilateral") {
    return {
      ...base,
      passes: [{ glsl: BILATERAL_GLSL, iterations: 1, uniforms: [KNOBS.radius, KNOBS.detail].map(uni) }],
    };
  }
  // nlm
  return {
    ...base,
    passes: [{ glsl: NLM_GLSL, iterations: 1, uniforms: [KNOBS.strength, KNOBS.quality].map(uni) }],
  };
}

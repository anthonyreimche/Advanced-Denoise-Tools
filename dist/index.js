let m = null, p = null;
function E(e) {
  m = e.react, p = e;
}
function i() {
  if (!p) throw new Error("[advanced-denoise] api used before activate()");
  return p;
}
function O() {
  if (!m) throw new Error("[advanced-denoise] runtime used before activate()");
  return m;
}
function r(e, a, ...o) {
  return O().createElement(e, a, ...o);
}
const _ = "advanced-denoise.nr", t = {
  lumAmt: { key: "lumAmt", label: "Luminance", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  colAmt: { key: "colAmt", label: "Colour", min: 0, max: 100, step: 1, default: 0, viz: 4 },
  detail: { key: "detail", label: "Detail", min: 0, max: 100, step: 1, default: 50, viz: 3 },
  scales: { key: "scales", label: "Scales", min: 1, max: 5, step: 1, default: 5, viz: 3 },
  shadow: { key: "shadow", label: "Shadows", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  highlight: { key: "highlight", label: "Highlights", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  radius: { key: "radius", label: "Radius", min: 1, max: 3, step: 0.1, default: 2, viz: 3 },
  strength: { key: "strength", label: "Strength", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  quality: { key: "quality", label: "Quality", min: 0, max: 100, step: 1, default: 0, viz: 3 }
}, d = (e) => ({
  key: e.key,
  glslType: "float",
  default: e.default,
  range: { min: e.min, max: e.max, step: e.step },
  label: e.label
}), T = [t.lumAmt, t.colAmt, t.shadow, t.highlight].map(d), P = `
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
`, N = `
float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }
`, R = `
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
`, I = `
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
`, q = `
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
`, y = {
  wavelet: [t.lumAmt, t.detail, t.colAmt, t.scales, t.shadow, t.highlight],
  bilateral: [t.lumAmt, t.colAmt, t.radius, t.detail],
  nlm: [t.lumAmt, t.colAmt, t.strength, t.quality]
};
function s(e) {
  return typeof e == "string" && Object.prototype.hasOwnProperty.call(y, e) ? e : "off";
}
function C(e) {
  const a = s(e);
  return a === "off" ? [] : y[a];
}
function M(e) {
  const a = s(e);
  if (a === "off") return null;
  const o = {
    id: _,
    name: "Advanced Denoise",
    phase: "noise-reduction",
    priority: 40,
    glsl: P,
    uniforms: T
  };
  return a === "wavelet" ? {
    ...o,
    passes: [
      { glsl: R, helpers: N, iterations: 5, uniforms: [t.detail, t.scales].map(d) }
    ]
  } : a === "bilateral" ? {
    ...o,
    passes: [{ glsl: I, iterations: 1, uniforms: [t.radius, t.detail].map(d) }]
  } : {
    ...o,
    passes: [{ glsl: q, iterations: 1, uniforms: [t.strength, t.quality].map(d) }]
  };
}
const U = {
  off: "Off",
  wavelet: "Wavelet",
  bilateral: "Bilateral",
  nlm: "Non-local means"
};
function B(e) {
  return r(
    "div",
    {
      style: {
        padding: "8px 8px 2px",
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "var(--color-text-muted)"
      }
    },
    e
  );
}
function H() {
  const e = i().react, a = i().stores.useDevelopStore, o = i().components.Slider, [n, w] = e.useState(
    () => s(i().settings.get("method", "off"))
  );
  e.useEffect(() => i().settings.onChange((l, c) => {
    l === "method" && w(s(c));
  }), []);
  const S = a((l) => l.paramBag), A = a((l) => l.setDynParam), b = a((l) => l.commitEdit), D = a((l) => l.setSharpenViz), v = C(n);
  if (v.length === 0) return null;
  const L = (l) => {
    const c = `${_}.${l.key}`, h = S[c], z = typeof h == "number" ? h : l.default;
    return r(o, {
      key: l.key,
      label: l.label,
      value: z,
      min: l.min,
      max: l.max,
      step: l.step,
      defaultValue: l.default,
      onChange: (f) => A(c, f),
      onCommit: () => b(`Denoise ${l.label}`),
      onModifierPreview: l.viz ? (f) => D(f ? l.viz : 0) : void 0
    });
  };
  return r(
    "div",
    null,
    B(`Noise Reduction · ${U[n]}`),
    r("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, v.map(L))
  );
}
const u = "method", x = `${_}.controls`;
function g(e, a) {
  var n;
  const o = M(a);
  o ? (e.registerProcessingStage(o), e.registerSlot({ id: x, slot: "develop-detail", component: H })) : (e.unregisterProcessingStage(_), (n = e.unregisterSlot) == null || n.call(e, x));
}
function G(e) {
  E(e), e.registerSettings({
    title: "Advanced Denoise",
    fields: [
      {
        key: u,
        label: "Denoise method",
        hint: "Which noise-reduction algorithm runs in Develop. Only the selected method is active, and its controls appear under Detail ▸ Noise Reduction. 'Off' restores the built-in noise reduction.",
        type: "select",
        default: "off",
        options: [
          { value: "off", label: "Off (built-in)" },
          { value: "wavelet", label: "Wavelet (à trous)" },
          { value: "bilateral", label: "Bilateral" },
          { value: "nlm", label: "Non-local means" }
        ]
      }
    ]
  }), g(e, s(e.settings.get(u, "off"))), e.settings.onChange((a, o) => {
    a === u && g(e, s(o));
  });
}
function $() {
}
export {
  G as activate,
  $ as deactivate
};
//# sourceMappingURL=index.js.map

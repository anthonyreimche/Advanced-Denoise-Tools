let m = null, u = null;
function O(e) {
  m = e.react, u = e;
}
function s() {
  if (!u) throw new Error("[advanced-denoise] api used before activate()");
  return u;
}
function T() {
  if (!m) throw new Error("[advanced-denoise] runtime used before activate()");
  return m;
}
function _(e, a, ...o) {
  return T().createElement(e, a, ...o);
}
const r = "advanced-denoise.nr", t = {
  lumAmt: { key: "lumAmt", label: "Luminance", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  colAmt: { key: "colAmt", label: "Colour", min: 0, max: 100, step: 1, default: 0, viz: 4 },
  detail: { key: "detail", label: "Detail", min: 0, max: 100, step: 1, default: 50, viz: 3 },
  scales: { key: "scales", label: "Scales", min: 1, max: 5, step: 1, default: 5, viz: 3 },
  shadow: { key: "shadow", label: "Shadows", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  highlight: { key: "highlight", label: "Highlights", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  radius: { key: "radius", label: "Radius", min: 1, max: 3, step: 0.1, default: 2, viz: 3 },
  strength: { key: "strength", label: "Strength", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  quality: { key: "quality", label: "Quality", min: 0, max: 100, step: 1, default: 0, viz: 3 }
}, c = (e) => ({
  key: e.key,
  glslType: "float",
  default: e.default,
  range: { min: e.min, max: e.max, step: e.step },
  label: e.label
}), P = [t.lumAmt, t.colAmt, t.shadow, t.highlight].map(c), N = `
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
`, R = `
float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }
`, I = `
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
`, q = `
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
`, C = `
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
`, w = {
  wavelet: [t.lumAmt, t.detail, t.colAmt, t.scales, t.shadow, t.highlight],
  bilateral: [t.lumAmt, t.colAmt, t.radius, t.detail],
  nlm: [t.lumAmt, t.colAmt, t.strength, t.quality]
};
function i(e) {
  return typeof e == "string" && Object.prototype.hasOwnProperty.call(w, e) ? e : "off";
}
function M(e) {
  const a = i(e);
  return a === "off" ? [] : w[a];
}
function U(e) {
  const a = i(e);
  if (a === "off") return null;
  const o = {
    id: r,
    name: "Advanced Denoise",
    phase: "noise-reduction",
    priority: 40,
    glsl: N,
    uniforms: P
  };
  return a === "wavelet" ? {
    ...o,
    passes: [
      { glsl: I, helpers: R, iterations: 5, uniforms: [t.detail, t.scales].map(c) }
    ]
  } : a === "bilateral" ? {
    ...o,
    passes: [{ glsl: q, iterations: 1, uniforms: [t.radius, t.detail].map(c) }]
  } : {
    ...o,
    passes: [{ glsl: C, iterations: 1, uniforms: [t.strength, t.quality].map(c) }]
  };
}
const B = {
  off: "Off",
  wavelet: "Wavelet",
  bilateral: "Bilateral",
  nlm: "Non-local means"
};
function G() {
  const e = s().react, a = s().stores.useDevelopStore, { Slider: o } = s().components, { Section: y } = s().ui, [p, S] = e.useState(
    () => i(s().settings.get("method", "off"))
  );
  e.useEffect(() => s().settings.onChange((l, n) => {
    l === "method" && S(i(n));
  }), []);
  const A = a((l) => l.paramBag), b = a((l) => l.setDynParam), D = a((l) => l.commitEdit), L = a((l) => l.setSharpenViz), v = M(p);
  if (v.length === 0) return null;
  const z = (l) => {
    const n = `${r}.${l.key}`, h = A[n], E = typeof h == "number" ? h : l.default;
    return _(o, {
      key: l.key,
      label: l.label,
      value: E,
      min: l.min,
      max: l.max,
      step: l.step,
      defaultValue: l.default,
      onChange: (d) => b(n, d),
      onCommit: () => D(`Denoise ${l.label}`),
      onModifierPreview: l.viz ? (d) => L(d ? l.viz : 0) : void 0
    });
  };
  return _(
    y,
    { title: `Noise Reduction · ${B[p]}` },
    _("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, v.map(z))
  );
}
const f = "method", x = `${r}.controls`;
function g(e, a) {
  const o = U(a);
  o ? (e.registerProcessingStage(o), e.registerSlot({ id: x, slot: "develop-detail", component: G })) : (e.unregisterProcessingStage(r), e.unregisterSlot(x));
}
function H(e) {
  O(e), e.registerSettings({
    title: "Advanced Denoise",
    fields: [
      {
        key: f,
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
  }), g(e, i(e.settings.get(f, "off"))), e.settings.onChange((a, o) => {
    a === f && g(e, i(o));
  });
}
function $() {
}
export {
  H as activate,
  $ as deactivate
};
//# sourceMappingURL=index.js.map

let _ = null, f = null;
function A(e) {
  _ = e.react, f = e;
}
function s() {
  if (!f) throw new Error("[advanced-denoise] api used before activate()");
  return f;
}
function D() {
  if (!_) throw new Error("[advanced-denoise] runtime used before activate()");
  return _;
}
function i(e, a, ...o) {
  return D().createElement(e, a, ...o);
}
const r = "advanced-denoise.nr", t = {
  lumAmt: { key: "lumAmt", label: "Luminance", min: 0, max: 100, step: 1, default: 0 },
  colAmt: { key: "colAmt", label: "Color", min: 0, max: 100, step: 1, default: 0 },
  detail: { key: "detail", label: "Detail", min: 0, max: 100, step: 1, default: 50 },
  scales: { key: "scales", label: "Scales", min: 1, max: 5, step: 1, default: 5 },
  shadow: { key: "shadow", label: "Shadows", min: 0, max: 100, step: 1, default: 0 },
  highlight: { key: "highlight", label: "Highlights", min: 0, max: 100, step: 1, default: 0 },
  radius: { key: "radius", label: "Radius", min: 1, max: 3, step: 0.1, default: 2 },
  strength: { key: "strength", label: "Strength", min: 0, max: 100, step: 1, default: 0 },
  quality: { key: "quality", label: "Quality", min: 0, max: 100, step: 1, default: 0 }
}, c = (e) => ({
  key: e.key,
  glslType: "float",
  default: e.default,
  range: { min: e.min, max: e.max, step: e.step },
  label: e.label
}), L = [t.lumAmt, t.colAmt, t.shadow, t.highlight].map(c), E = `
float _la = lumAmt / 100.0;
float _ca = colAmt / 100.0;
if (_la > 0.001 || _ca > 0.001) {
  float _lc = max(luma(lin), 1e-4);
  float _zone = clamp(1.0
    + (shadow / 100.0) * (1.0 - smoothstep(0.0, 0.35, _lc))
    - (highlight / 100.0) * smoothstep(0.65, 1.0, _lc), 0.0, 2.0);
  vec3 _den = stageResult;
  float _ld = max(luma(_den), 1e-4);
  float _nl = mix(_lc, _ld, clamp(_la * _zone, 0.0, 1.0));
  vec3 _chC = lin / _lc;
  vec3 _chD = _den / _ld;
  vec3 _ch = mix(_chC, _chD, clamp(_ca * _zone, 0.0, 1.0));
  lin = _ch * _nl;
}
`, T = `
float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }
`, O = `
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
`, N = `
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
`, P = `
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
`, R = {
  wavelet: [t.lumAmt, t.detail, t.colAmt, t.scales, t.shadow, t.highlight],
  bilateral: [t.lumAmt, t.colAmt, t.radius, t.detail],
  nlm: [t.lumAmt, t.colAmt, t.strength, t.quality]
};
function q(e) {
  return e === "off" ? [] : R[e];
}
function C(e) {
  if (e === "off") return null;
  const a = {
    id: r,
    name: "Advanced Denoise",
    phase: "noise-reduction",
    priority: 40,
    glsl: E,
    uniforms: L
  };
  return e === "wavelet" ? {
    ...a,
    passes: [
      { glsl: O, helpers: T, iterations: 5, uniforms: [t.detail, t.scales].map(c) }
    ]
  } : e === "bilateral" ? {
    ...a,
    passes: [{ glsl: N, iterations: 1, uniforms: [t.radius, t.detail].map(c) }]
  } : {
    ...a,
    passes: [{ glsl: P, iterations: 1, uniforms: [t.strength, t.quality].map(c) }]
  };
}
const I = {
  off: "Off",
  wavelet: "Wavelet",
  bilateral: "Bilateral",
  nlm: "Non-local means"
};
function U(e) {
  return i(
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
function B() {
  const e = s().react, a = s().stores.useDevelopStore, o = s().components.Slider, [u, x] = e.useState(
    () => s().settings.get("method", "off")
  );
  e.useEffect(() => s().settings.onChange((l, n) => {
    l === "method" && x(n ?? "off");
  }), []);
  const h = a((l) => l.paramBag), g = a((l) => l.setDynParam), w = a((l) => l.commitEdit), m = q(u);
  if (m.length === 0) return null;
  const y = (l) => {
    const n = `${r}.${l.key}`, p = h[n], S = typeof p == "number" ? p : l.default;
    return i(o, {
      key: l.key,
      label: l.label,
      value: S,
      min: l.min,
      max: l.max,
      step: l.step,
      defaultValue: l.default,
      onChange: (b) => g(n, b),
      onCommit: () => w(`Denoise ${l.label}`)
    });
  };
  return i(
    "div",
    null,
    U(`Noise Reduction · ${I[u]}`),
    i("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, m.map(y))
  );
}
const d = "method";
function v(e, a) {
  const o = C(a);
  o ? e.registerProcessingStage(o) : e.unregisterProcessingStage(r);
}
function M(e) {
  A(e), e.registerSettings({
    title: "Advanced Denoise",
    fields: [
      {
        key: d,
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
  }), e.registerSlot({
    id: `${r}.controls`,
    slot: "develop-detail",
    component: B
  }), v(e, e.settings.get(d, "off")), e.settings.onChange((a, o) => {
    a === d && v(e, o ?? "off");
  });
}
function H() {
}
export {
  M as activate,
  H as deactivate
};
//# sourceMappingURL=index.js.map

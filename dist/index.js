//#region ../Safelight Project/Advanced Denoise Tools for Safelight/src/runtime.ts
let _react = null;
let _api = null;
function initRuntime(api) {
	_react = api.react;
	_api = api;
}
function api() {
	if (!_api) throw new Error("[advanced-denoise] api used before activate()");
	return _api;
}
function R() {
	if (!_react) throw new Error("[advanced-denoise] runtime used before activate()");
	return _react;
}
/** createElement shorthand. */
function h(type, props, ...children) {
	return R().createElement(type, props, ...children);
}
//#endregion
//#region ../Safelight Project/Advanced Denoise Tools for Safelight/src/methods.ts
const STAGE_ID = "advanced-denoise.nr";
const KNOBS = {
	lumAmt: {
		key: "lumAmt",
		label: "Luminance",
		min: 0,
		max: 100,
		step: 1,
		default: 0
	},
	colAmt: {
		key: "colAmt",
		label: "Color",
		min: 0,
		max: 100,
		step: 1,
		default: 0
	},
	detail: {
		key: "detail",
		label: "Detail",
		min: 0,
		max: 100,
		step: 1,
		default: 50
	},
	scales: {
		key: "scales",
		label: "Scales",
		min: 1,
		max: 5,
		step: 1,
		default: 5
	},
	shadow: {
		key: "shadow",
		label: "Shadows",
		min: 0,
		max: 100,
		step: 1,
		default: 0
	},
	highlight: {
		key: "highlight",
		label: "Highlights",
		min: 0,
		max: 100,
		step: 1,
		default: 0
	},
	radius: {
		key: "radius",
		label: "Radius",
		min: 1,
		max: 3,
		step: .1,
		default: 2
	},
	strength: {
		key: "strength",
		label: "Strength",
		min: 0,
		max: 100,
		step: 1,
		default: 0
	},
	quality: {
		key: "quality",
		label: "Quality",
		min: 0,
		max: 100,
		step: 1,
		default: 0
	}
};
const uni = (knob) => ({
	key: knob.key,
	glslType: "float",
	default: knob.default,
	range: {
		min: knob.min,
		max: knob.max,
		step: knob.step
	},
	label: knob.label
});
const INLINE_UNIFORMS = [
	KNOBS.lumAmt,
	KNOBS.colAmt,
	KNOBS.shadow,
	KNOBS.highlight
].map(uni);
const INLINE_GLSL = `
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
`;
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
const METHOD_CONTROLS = {
	wavelet: [
		KNOBS.lumAmt,
		KNOBS.detail,
		KNOBS.colAmt,
		KNOBS.scales,
		KNOBS.shadow,
		KNOBS.highlight
	],
	bilateral: [
		KNOBS.lumAmt,
		KNOBS.colAmt,
		KNOBS.radius,
		KNOBS.detail
	],
	nlm: [
		KNOBS.lumAmt,
		KNOBS.colAmt,
		KNOBS.strength,
		KNOBS.quality
	]
};
function controlsFor(method) {
	return method === "off" ? [] : METHOD_CONTROLS[method];
}
/** The processing stage for a method, or null for "off". */
function stageFor(method) {
	if (method === "off") return null;
	const base = {
		id: STAGE_ID,
		name: "Advanced Denoise",
		phase: "noise-reduction",
		priority: 40,
		glsl: INLINE_GLSL,
		uniforms: INLINE_UNIFORMS
	};
	if (method === "wavelet") return {
		...base,
		passes: [{
			glsl: ATROUS_GLSL,
			helpers: ATROUS_HELPERS,
			iterations: 5,
			uniforms: [KNOBS.detail, KNOBS.scales].map(uni)
		}]
	};
	if (method === "bilateral") return {
		...base,
		passes: [{
			glsl: BILATERAL_GLSL,
			iterations: 1,
			uniforms: [KNOBS.radius, KNOBS.detail].map(uni)
		}]
	};
	return {
		...base,
		passes: [{
			glsl: NLM_GLSL,
			iterations: 1,
			uniforms: [KNOBS.strength, KNOBS.quality].map(uni)
		}]
	};
}
//#endregion
//#region ../Safelight Project/Advanced Denoise Tools for Safelight/src/controls.ts
const METHOD_LABELS = {
	off: "Off",
	wavelet: "Wavelet",
	bilateral: "Bilateral",
	nlm: "Non-local means"
};
function Header(title) {
	return h("div", { style: {
		padding: "8px 8px 2px",
		fontSize: "10px",
		fontWeight: 600,
		textTransform: "uppercase",
		letterSpacing: "0.14em",
		color: "var(--color-text-muted)"
	} }, title);
}
function DenoiseControls() {
	const react = api().react;
	const useDevelopStore = api().stores.useDevelopStore;
	const Slider = api().components.Slider;
	const [method, setMethod] = react.useState(() => api().settings.get("method", "off"));
	react.useEffect(() => {
		return api().settings.onChange((key, value) => {
			if (key === "method") setMethod(value ?? "off");
		});
	}, []);
	const paramBag = useDevelopStore((s) => s.paramBag);
	const setDynParam = useDevelopStore((s) => s.setDynParam);
	const commitEdit = useDevelopStore((s) => s.commitEdit);
	const knobs = controlsFor(method);
	if (knobs.length === 0) return null;
	const row = (knob) => {
		const qk = `${STAGE_ID}.${knob.key}`;
		const raw = paramBag[qk];
		const value = typeof raw === "number" ? raw : knob.default;
		return h(Slider, {
			key: knob.key,
			label: knob.label,
			value,
			min: knob.min,
			max: knob.max,
			step: knob.step,
			defaultValue: knob.default,
			onChange: (v) => setDynParam(qk, v),
			onCommit: () => commitEdit(`Denoise ${knob.label}`)
		});
	};
	return h("div", null, Header(`Noise Reduction · ${METHOD_LABELS[method]}`), h("div", { style: {
		display: "flex",
		flexDirection: "column",
		gap: "1px"
	} }, knobs.map(row)));
}
//#endregion
//#region ../Safelight Project/Advanced Denoise Tools for Safelight/src/index.ts
const METHOD_KEY = "method";
function applyMethod(api, method) {
	const stage = stageFor(method);
	if (!stage) api.unregisterProcessingStage(STAGE_ID);
	else api.registerProcessingStage(stage);
}
function activate(api) {
	initRuntime(api);
	api.registerSettings({
		title: "Advanced Denoise",
		fields: [{
			key: METHOD_KEY,
			label: "Denoise method",
			hint: "Which noise-reduction algorithm runs in Develop. Only the selected method is active, and its controls appear under Detail ▸ Noise Reduction. 'Off' restores the built-in noise reduction.",
			type: "select",
			default: "off",
			options: [
				{
					value: "off",
					label: "Off (built-in)"
				},
				{
					value: "wavelet",
					label: "Wavelet (à trous)"
				},
				{
					value: "bilateral",
					label: "Bilateral"
				},
				{
					value: "nlm",
					label: "Non-local means"
				}
			]
		}]
	});
	api.registerSlot({
		id: `${STAGE_ID}.controls`,
		slot: "develop-detail",
		component: DenoiseControls
	});
	applyMethod(api, api.settings.get(METHOD_KEY, "off"));
	api.settings.onChange((key, value) => {
		if (key === METHOD_KEY) applyMethod(api, value ?? "off");
	});
}
function deactivate() {}
//#endregion
export { activate, deactivate };

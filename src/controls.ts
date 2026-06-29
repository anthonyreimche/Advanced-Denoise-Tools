// Denoise controls rendered INSIDE the core Detail panel (the "develop-detail"
// slot). Shows the active method's knobs; sliders write the develop param bag by
// qualified key, which feeds the method's GPU stage. The slot itself is only
// registered while a method is active (see index.ts applyMethod), so when "off"
// this component isn't mounted at all and the panel shows its built-in NR sliders.
//
// Inline styles + CSS variables (runtime-loaded extensions aren't Tailwind-scanned).

import { h, api } from "./runtime";
import { STAGE_ID, controlsFor, type Method, type Knob } from "./methods";

const METHOD_LABELS: Record<Method, string> = {
  off: "Off",
  wavelet: "Wavelet",
  bilateral: "Bilateral",
  nlm: "Non-local means",
};

function Header(title: string) {
  return h(
    "div",
    {
      style: {
        padding: "8px 8px 2px",
        fontSize: "10px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "var(--color-text-muted)",
      },
    },
    title,
  );
}

export function DenoiseControls() {
  const react = api().react;
  const useDevelopStore = api().stores.useDevelopStore;
  const Slider = api().components.Slider;

  // Track the active method; re-render when it changes in Preferences.
  const [method, setMethod] = react.useState(
    () => api().settings.get<Method>("method", "off"),
  ) as [Method, (m: Method) => void];
  react.useEffect(() => {
    return api().settings.onChange((key: string, value: unknown) => {
      if (key === "method") setMethod((value as Method) ?? "off");
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paramBag: Record<string, unknown> = useDevelopStore((s: any) => s.paramBag);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setDynParam: (k: string, v: unknown) => void = useDevelopStore((s: any) => s.setDynParam);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commitEdit: (label: string) => void = useDevelopStore((s: any) => s.commitEdit);
  // Drives the shader's CTRL-view preview uniform. Replacing the built-in NR
  // sliders dropped this — re-wire it so Alt/Ctrl-dragging a denoise knob shows
  // the same luminance/chroma visualization the core sliders do.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setSharpenViz: (mode: number) => void = useDevelopStore((s: any) => s.setSharpenViz);

  const knobs = controlsFor(method);
  // Defensive: the slot is unregistered when "off", so this normally won't render
  // with an empty knob set — but guard the transient frame during a method switch.
  if (knobs.length === 0) return null;

  const row = (knob: Knob) => {
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
      onChange: (v: number) => setDynParam(qk, v),
      onCommit: () => commitEdit(`Denoise ${knob.label}`),
      onModifierPreview: knob.viz
        ? (active: boolean) => setSharpenViz(active ? knob.viz! : 0)
        : undefined,
    });
  };

  return h(
    "div",
    null,
    Header(`Noise Reduction · ${METHOD_LABELS[method]}`),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "1px" } }, knobs.map(row)),
  );
}

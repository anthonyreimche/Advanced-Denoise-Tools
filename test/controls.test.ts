// The Detail-panel controls over a stand-in host: the header is the ui kit's
// Section, the slider rows write the param bag by qualified key, and nothing is
// styled with raw CSS variables.
// Run: npm test

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DenoiseControls } from "../src/controls.ts";
import { STAGE_ID } from "../src/methods.ts";
import { initRuntime } from "../src/runtime.ts";
import type { SafelightAPI } from "../src/safelight.d.ts";

interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
}

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && "type" in value && "children" in value;
const walk = (value: unknown): Node[] => (Array.isArray(value) ? value.flatMap(walk) : isNode(value) ? [value, ...value.children.flatMap(walk)] : []);

const Section = () => null;
const Slider = () => null;

function mount(method: string) {
  const calls: string[] = [];
  const state = {
    paramBag: { [`${STAGE_ID}.strength`]: 0.4 },
    setDynParam: (key: string, value: unknown) => void calls.push(`set ${key}=${String(value)}`),
    commitEdit: (label: string) => void calls.push(`commit ${label}`),
    setSharpenViz: (mode: number) => void calls.push(`viz ${mode}`),
  };
  const host = {
    react: {
      createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node => ({ type, props: props ?? {}, children }),
      useState: (init: () => unknown) => [init(), () => undefined],
      useEffect: () => undefined,
    },
    settings: { get: () => method, onChange: () => () => undefined },
    components: { Slider },
    ui: { Section },
    stores: { useDevelopStore: <T,>(select: (s: typeof state) => T) => select(state) },
  } as unknown as SafelightAPI;
  initRuntime(host);
  return { tree: walk(DenoiseControls()), calls };
}

describe("DenoiseControls", () => {
  it("heads the knobs with the ui kit's Section", () => {
    const { tree } = mount("wavelet");
    const section = tree.find((n) => n.type === Section);
    assert.equal(section?.props.title, "Noise Reduction · Wavelet");
    assert.ok(tree.some((n) => n.type === Slider));
  });

  it("styles nothing with raw CSS variables", () => {
    const { tree } = mount("wavelet");
    assert.ok(!tree.some((n) => JSON.stringify(n.props.style ?? {}).includes("var(--")));
  });

  it("writes a knob by its qualified key and commits it", () => {
    const { tree, calls } = mount("wavelet");
    const first = tree.find((n) => n.type === Slider);
    (first?.props.onChange as (v: number) => void)(0.7);
    (first?.props.onCommit as () => void)();
    assert.ok(calls[0].startsWith(`set ${STAGE_ID}.`) && calls[0].endsWith("=0.7"), calls[0]);
    assert.match(calls[1], /^commit Denoise /);
  });
});

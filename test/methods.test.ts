// The pure method helpers: a saved or incoming method the extension doesn't
// know falls back to the default, "off", instead of throwing in the panel or
// quietly running another method.
// Run: node --experimental-strip-types --test test/*.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { METHOD_CONTROLS, controlsFor, normalizeMethod, stageFor } from "../src/methods.ts";

describe("controlsFor", () => {
  it("lists each method's knobs", () => {
    assert.equal(controlsFor("wavelet"), METHOD_CONTROLS.wavelet);
    assert.equal(controlsFor("bilateral"), METHOD_CONTROLS.bilateral);
    assert.equal(controlsFor("nlm"), METHOD_CONTROLS.nlm);
  });

  it("has none for off", () => {
    assert.deepEqual(controlsFor("off"), []);
  });

  it("has none for a method it doesn't know", () => {
    assert.deepEqual(controlsFor("gaussian"), []);
    assert.deepEqual(controlsFor(undefined), []);
    assert.deepEqual(controlsFor(null), []);
  });
});

describe("stageFor", () => {
  it("builds one pass for each known method", () => {
    for (const method of ["wavelet", "bilateral", "nlm"]) {
      assert.equal(stageFor(method)?.passes?.length, 1, method);
    }
    assert.equal(stageFor("wavelet")?.passes?.[0].iterations, 5);
  });

  it("builds nothing for off", () => {
    assert.equal(stageFor("off"), null);
  });

  it("builds nothing for a method it doesn't know, rather than non-local means", () => {
    assert.equal(stageFor("gaussian"), null);
    assert.equal(stageFor(42), null);
    assert.equal(stageFor(undefined), null);
  });
});

describe("normalizeMethod", () => {
  it("keeps a known method and defaults the rest to off", () => {
    assert.equal(normalizeMethod("bilateral"), "bilateral");
    assert.equal(normalizeMethod("off"), "off");
    assert.equal(normalizeMethod("gaussian"), "off");
    assert.equal(normalizeMethod(undefined), "off");
    assert.equal(normalizeMethod("toString"), "off");
  });
});

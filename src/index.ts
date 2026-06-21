// Advanced Denoise — SafeLight extension entry point.
//
// One denoise method is chosen in Preferences ▸ Extensions ▸ Advanced Denoise.
// Selecting a method registers ONLY that method's GPU stage (so only its passes
// compile + run); its controls render inside the core Detail panel via the
// "develop-detail" slot and feed values through the develop param bag. Choosing
// "Off" unregisters the stage entirely. Persistence / undo / presets / export /
// loupe all work through the host's generic processing-stage framework.

import type { SafelightAPI } from "./safelight";
import { initRuntime } from "./runtime";
import { STAGE_ID, stageFor, type Method } from "./methods";
import { DenoiseControls } from "./controls";

const METHOD_KEY = "method";

function applyMethod(api: SafelightAPI, method: Method): void {
  const stage = stageFor(method);
  if (!stage) api.unregisterProcessingStage(STAGE_ID);
  else api.registerProcessingStage(stage);
}

export function activate(api: SafelightAPI): void {
  initRuntime(api);

  api.registerSettings({
    title: "Advanced Denoise",
    fields: [
      {
        key: METHOD_KEY,
        label: "Denoise method",
        hint: "Which noise-reduction algorithm runs in Develop. Only the selected method is active, and its controls appear under Detail ▸ Noise Reduction. 'Off' restores the built-in noise reduction.",
        type: "select",
        default: "off",
        options: [
          { value: "off", label: "Off (built-in)" },
          { value: "wavelet", label: "Wavelet (à trous)" },
          { value: "bilateral", label: "Bilateral" },
          { value: "nlm", label: "Non-local means" },
        ],
      },
    ],
  });

  api.registerSlot({
    id: `${STAGE_ID}.controls`,
    slot: "develop-detail",
    component: DenoiseControls,
  });

  // Apply the saved method now, and follow changes from the Preferences dropdown.
  applyMethod(api, api.settings.get<Method>(METHOD_KEY, "off"));
  api.settings.onChange((key, value) => {
    if (key === METHOD_KEY) applyMethod(api, (value as Method) ?? "off");
  });
}

export function deactivate(): void {
  // The host sweeps the registry (stage + slot + settings) on disable/uninstall
  // and recompiles the develop shader without this stage.
}

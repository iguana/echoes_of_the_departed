// Echoes of the Departed — entry point.
// First gates on Ollama setup (showing the onboarding screen if the host has
// no usable Gemma 4 model), then mounts the Phaser parlor + séance + tray.

import { mountGame } from "./game/GameShell";
import { ensureOllamaReady } from "./ui/OllamaSetup";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app root");

void (async () => {
  const ready = await ensureOllamaReady();
  mountGame(root, { initialModel: ready.model, availableModels: ready.available_models });
})();


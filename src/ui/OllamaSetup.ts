// OllamaSetup — full-screen onboarding shown when the host has no working
// Gemma 4 model. Three paths offered, in order of recommendation:
//
//   1. Ollama Cloud (`gemma4:31b-cloud`) — free with an Ollama account,
//      ~550ms TTFT, no disk cost. The recommended default.
//   2. Local 4B (`gemma4:4b`) — small, fast on consumer hardware (~3-5GB).
//   3. Local 31B (`gemma4:31b`) — best quality, slow without a GPU (~19GB).
//
// We poll ollamaHealth() every 2s while the screen is open; the moment a
// usable Gemma 4 model is detected, we auto-dismiss and continue boot.

import { ollamaHealth } from "../ollama/client";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";
const OLLAMA_CLOUD_URL = "https://ollama.com/cloud";

export interface OllamaSetupResult {
  /** The chosen-or-detected model name. */
  model: string;
  /** All models currently installed (for downstream cloud auto-routing). */
  available_models: string[];
}

function pickBestModel(models: string[]): string | null {
  // Preference order: cloud > 31b > any other gemma > any other model
  const cloud = models.find((m) => m === "gemma4:31b-cloud" || (m.startsWith("gemma4") && m.endsWith("-cloud")));
  if (cloud) return cloud;
  const local31 = models.find((m) => m === "gemma4:31b");
  if (local31) return local31;
  const localGemma4 = models.find((m) => m.startsWith("gemma4:"));
  if (localGemma4) return localGemma4;
  return null;
}

/** Returns immediately if a usable Gemma 4 is already available; otherwise
 *  shows the setup screen and resolves only when the user has installed one
 *  (the screen polls health automatically). */
export async function ensureOllamaReady(): Promise<OllamaSetupResult> {
  const initial = await ollamaHealth();
  if (initial.ok) {
    const best = pickBestModel(initial.models);
    if (best) return { model: best, available_models: initial.models };
  }
  return showSetupAndWait(initial);
}

function showSetupAndWait(initial: { ok: boolean; models: string[] }): Promise<OllamaSetupResult> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "ollama-setup";
    el.innerHTML = setupHtml(initial);
    document.body.appendChild(el);

    const status = el.querySelector(".ollama-status") as HTMLDivElement;
    const refreshBtn = el.querySelector(".ollama-refresh") as HTMLButtonElement;

    const recheck = async () => {
      status.textContent = "checking…";
      status.classList.remove("found", "missing");
      const h = await ollamaHealth();
      if (!h.ok) {
        status.textContent = `Ollama is not running. Start it with \`ollama serve\` and click Refresh.`;
        status.classList.add("missing");
        return;
      }
      const best = pickBestModel(h.models);
      if (best) {
        status.textContent = `✓ Found ${best}. Beginning the night…`;
        status.classList.add("found");
        clearInterval(poller);
        setTimeout(() => {
          el.remove();
          resolve({ model: best, available_models: h.models });
        }, 800);
        return;
      }
      status.textContent = `Ollama is running, but no Gemma 4 model is installed yet. Run one of the commands above, then click Refresh.`;
      status.classList.add("missing");
    };

    refreshBtn.addEventListener("click", () => { void recheck(); });
    // Auto-poll every 2.5s — most users will install in another window then
    // this auto-dismisses without them clicking anything.
    const poller = window.setInterval(() => { void recheck(); }, 2500);

    // Initial status (we already have `initial` in hand)
    if (!initial.ok) {
      status.textContent = "Ollama is not running. Start it (open the Ollama app, or run `ollama serve`) and this screen will dismiss automatically.";
      status.classList.add("missing");
    } else {
      const best = pickBestModel(initial.models);
      if (best) {
        // Should not happen — ensureOllamaReady would have returned — but be safe.
        clearInterval(poller);
        el.remove();
        resolve({ model: best, available_models: initial.models });
      } else {
        status.textContent = "Ollama is running. Pick one of the options above to install a Gemma 4 model.";
        status.classList.add("missing");
      }
    }

    // Wire up "open URL" buttons via the Tauri shell allowlist.
    el.querySelectorAll<HTMLAnchorElement>("a.external").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const { open } = await import("@tauri-apps/api/shell");
          await open(a.dataset.url ?? a.href);
        } catch {
          // Fallback to default anchor behavior
          window.open(a.href, "_blank");
        }
      });
    });
  });
}

function setupHtml(_initial: { ok: boolean; models: string[] }): string {
  return `
    <div class="ollama-setup-veil"></div>
    <div class="ollama-setup-card">
      <div class="ollama-setup-title">Echoes of the Departed</div>
      <div class="ollama-setup-sub">First we must wake the spirits</div>
      <div class="ollama-setup-body">
        <p>This game speaks to you through <strong>Gemma 4</strong>, Google's open language model, served on your machine by <a class="external" href="${OLLAMA_DOWNLOAD_URL}" data-url="${OLLAMA_DOWNLOAD_URL}">Ollama</a>. No API keys, no telemetry, no payments — just a model you control.</p>
        <p>Choose a path. The cloud option is free, fast, and recommended. The local options keep everything on your machine but are slower without a GPU.</p>
      </div>

      <div class="ollama-option recommended">
        <div class="ollama-option-head">
          <span class="ollama-option-badge">Recommended</span>
          <span class="ollama-option-name">Ollama Cloud · gemma4:31b-cloud</span>
        </div>
        <div class="ollama-option-desc">Free Ollama account, full quality, ~550 ms first-token. Zero local disk.</div>
        <div class="ollama-option-cmd">
          <ol>
            <li>Install Ollama: <a class="external" href="${OLLAMA_DOWNLOAD_URL}" data-url="${OLLAMA_DOWNLOAD_URL}">ollama.com/download</a></li>
            <li>Sign in to Ollama Cloud (free): <a class="external" href="${OLLAMA_CLOUD_URL}" data-url="${OLLAMA_CLOUD_URL}">ollama.com/cloud</a></li>
            <li>In a terminal: <code>ollama signin</code></li>
            <li>Pull the cloud model: <code>ollama pull gemma4:31b-cloud</code></li>
          </ol>
        </div>
      </div>

      <div class="ollama-option">
        <div class="ollama-option-head">
          <span class="ollama-option-name">Local · gemma4:4b</span>
        </div>
        <div class="ollama-option-desc">Compact (~3 GB). Runs on most laptops at ~3-8 sec first-token.</div>
        <div class="ollama-option-cmd">
          <code>ollama pull gemma4:4b</code>
        </div>
      </div>

      <div class="ollama-option">
        <div class="ollama-option-head">
          <span class="ollama-option-name">Local · gemma4:31b</span>
        </div>
        <div class="ollama-option-desc">Best local quality (~19 GB). Painfully slow without a GPU; ~10 sec first-token on Apple Silicon.</div>
        <div class="ollama-option-cmd">
          <code>ollama pull gemma4:31b</code>
        </div>
      </div>

      <div class="ollama-status missing">checking…</div>
      <button class="ollama-refresh">Refresh</button>
    </div>
  `;
}

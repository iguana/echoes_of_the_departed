// Top-level shell for Echoes of the Departed.
//
// Owns: the Phaser parlor, the séance panel, the memento tray, and the
// game-state machine. Handles the round-trip:
//
//   parlor walk → press E at mirror → séance opens → Gemma streams →
//   either resolve/banish OR Gemma calls a tool (e.g. pull_through_mirror)
//   that drops the medium into a Mirror world. Inside the world she walks,
//   inspects objects, finds clues, then steps back through the mirror.
//
// Also exposes `window.echo` — a debug API used by tests + the agent for
// keyboard-free game control.

import Phaser from "phaser";
import { ParlorScene, type ParlorEvents } from "../scene/ParlorScene";
import { MirrorScene, type MirrorEvents } from "../scene/MirrorScene";
import { mirrorWorldFor, tileStateLine, type MirrorWorld, type MirrorWorldObject } from "../scene/mirror_worlds";
import { SeancePanel, type SeanceOutcome } from "../ui/SeancePanel";
import { EpiloguePanel } from "../ui/EpiloguePanel";
import { IntroScreen } from "../ui/IntroScreen";
import { MusicWidget } from "../ui/MusicWidget";
import { STARTING_GHOSTS, FINALE_GHOST, ghostById } from "../ghosts/catalog";
import {
  loadOrInitState, recordResolution, recordBanishment,
  recordMirrorVisit, recordDiscovery, saveState, clearSavedState,
  type GameState,
} from "./state";
import type { GhostCard } from "../ghosts/types";

function pickDialogueModel(genModel: string, available: string[]): string {
  const cloud = genModel.endsWith("-cloud") ? genModel : `${genModel}-cloud`;
  if (available.includes(cloud)) return cloud;
  const anyCloud = available.find((m) => m.endsWith("-cloud") && m.toLowerCase().includes("gemma"));
  return anyCloud ?? genModel;
}

export interface MountOptions {
  /** Detected model from Ollama setup. */
  initialModel: string;
  /** All Ollama models present at startup. */
  availableModels: string[];
}

export interface DebugAPI {
  state(): GameState;
  summon(ghostId: string): Promise<void>;
  say(text: string): Promise<void>;
  hint(): Promise<void>;
  leaveSeance(): void;
  walkTo(tile: { x: number; y: number }): Promise<void>;
  inspect(): Promise<void>;
  whichScene(): "parlor" | "mirror" | "unknown";
  exitMirror(): void;
  /** Force the intro screen open (for screenshot / first-run testing). */
  showIntro(): void;
  /** Force the end-of-game epilogue with the current state (for validation). */
  showEpilogue(): void;
}

export function mountGame(root: HTMLElement, opts: MountOptions): void {
  root.innerHTML = `
    <div class="game-shell">
      <div id="stage" class="game-stage">
        <div id="music-mount" class="music-mount"></div>
      </div>
      <aside class="game-tray">
        <header class="tray-header">
          <h2>Mementos</h2>
          <span id="health" class="health-pill">checking ollama…</span>
        </header>
        <div id="tray-list" class="tray-list">
          <div class="tray-empty">No mementos yet.<br/>Help a spirit find peace and they will leave you something to remember.</div>
        </div>
        <footer class="tray-footer">
          <div class="tray-controls">WASD walk · E commune/inspect · H intuition · Esc step back</div>
        </footer>
      </aside>
    </div>
  `;

  let state: GameState = loadOrInitState();
  // Auto-save on every state mutation. Wrap the assignment via a setter so we
  // never forget. (Direct `state = ...` assignments below go through this.)
  const setState = (next: GameState) => { state = next; saveState(state); };
  const stageEl = root.querySelector<HTMLElement>("#stage")!;
  const trayList = root.querySelector<HTMLElement>("#tray-list")!;
  const healthEl = root.querySelector<HTMLSpanElement>("#health")!;
  const musicMount = root.querySelector<HTMLElement>("#music-mount")!;
  // Pre-select the best dialogue model from what Ollama setup found. The
  // health probe later on still updates this if available models change
  // (e.g., the user pulls a cloud variant after starting).
  let dialogueModel = pickDialogueModel(opts.initialModel, opts.availableModels);

  const music = new MusicWidget(musicMount);
  void music.init();

  const phaserHost = document.createElement("div");
  phaserHost.className = "phaser-host";
  stageEl.appendChild(phaserHost);

  // Pending portal — set by the SeancePanel's tool-call callback. After the
  // current commune() resolves with status="portal", we read this to know
  // which ghost to enter the world of.
  let pendingPortal: { ghost: GhostCard; reason: string } | null = null;

  const epilogue = new EpiloguePanel(document.body, { model: dialogueModel });
  const intro = new IntroScreen(document.body);
  intro.showIfFirstRun();

  const seance = new SeancePanel(stageEl, {
    model: dialogueModel,
    onToolCall: (ghost, call) => {
      if (call.function.name === "pull_through_mirror") {
        const args = call.function.arguments;
        const reason = typeof args === "string" ? args : (args?.reason as string ?? "");
        pendingPortal = { ghost, reason };
        return true; // tells SeancePanel to close as "portal" outcome
      }
      return false;
    },
  });

  const parlorEvents: ParlorEvents = {
    onSummon: (ghost) => { void runSeance(ghost); },
    onAltarTry: () => {
      if (state.finaleUnlocked) {
        void runSeance(FINALE_GHOST);
      } else {
        flashHint(`Eleanor's altar is silent. ${state.mementos.length}/3 mementos gathered.`);
      }
    },
    onInteractMiss: () => {
      flashHint("Walk closer to a mirror to commune with its spirit.");
    },
  };

  const mirrorEvents: MirrorEvents = {
    onInspect: (obj) => { void runInspect(obj); },
    onExit: () => exitMirror(),
  };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: phaserHost,
    backgroundColor: "#0a0608",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 576,
    },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
    scene: [ParlorScene, MirrorScene],
    pixelArt: true,
    render: { antialias: false },
  });

  let activeScene: "parlor" | "mirror" | "unknown" = "parlor";
  game.scene.start("ParlorScene", {
    ghosts: STARTING_GHOSTS, finale: FINALE_GHOST, state, events: parlorEvents,
  });
  // sleep MirrorScene until needed
  game.scene.sleep("MirrorScene");

  function getParlor(): ParlorScene | null {
    return game.scene.getScene("ParlorScene") as ParlorScene | null;
  }
  function getMirror(): MirrorScene | null {
    return game.scene.getScene("MirrorScene") as MirrorScene | null;
  }

  // ── Séance flow

  async function runSeance(ghost: GhostCard): Promise<void> {
    seance["deps"].model = dialogueModel;
    pendingPortal = null;
    const sceneRef = activeScene === "parlor" ? getParlor() : getMirror();
    sceneRef?.setInputEnabled(false);
    try {
      let outcome: SeanceOutcome;
      try {
        outcome = await seance.commune(ghost, {
          ctx: {
            session_salt: state.session_salt,
            mirror_visited: !!state.mirror_visited[ghost.id],
            discoveries: state.discoveries[ghost.id],
          },
        });
      } catch (e) {
        console.error("[seance] commune threw:", e);
        outcome = { ghost, status: "left" };
        flashHint(`The séance ended unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
      }
      applyOutcome(outcome);
      const portal = pendingPortal as { ghost: GhostCard; reason: string } | null;
      if (outcome.status === "portal" && portal) {
        await enterMirror(portal.ghost);
        pendingPortal = null;
      }
    } finally {
      const sceneRef2 = activeScene === "parlor" ? getParlor() : getMirror();
      sceneRef2?.setInputEnabled(true);
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  function applyOutcome(o: SeanceOutcome): void {
    if (o.status === "resolved") {
      setState(recordResolution(state, o.ghost.id, o.ghost.name, o.ghost.memento));
    } else if (o.status === "banished") {
      setState(recordBanishment(state, o.ghost.id));
    }
    getParlor()?.refreshGhostState(state);
    refreshTray();
    // Trigger end-of-game epilogue when the finale ghost (Eleanor) is
    // resolved OR banished. Either way, the medium's vigil is over.
    if (o.ghost.id === FINALE_GHOST.id && (o.status === "resolved" || o.status === "banished")) {
      const allGhosts = [...STARTING_GHOSTS, FINALE_GHOST];
      const spirits = allGhosts.map((g) => ({
        name: g.name,
        status: (state.status[g.id] ?? "active") as "resolved" | "banished" | "active",
        memento_name: state.mementos.find((m) => m.ghost_id === g.id)?.name,
      }));
      const totalDiscoveries = Object.values(state.discoveries).reduce((a, b) => a + b.length, 0);
      // Refresh the model in case the health probe finished after construction.
      epilogue["deps"].model = dialogueModel;
      setTimeout(() => {
        epilogue.show({
          spirits,
          discoveries_count: totalDiscoveries,
          session_salt: state.session_salt,
        });
      }, 1500); // give the séance fade animation time to finish
    }
  }

  // ── Mirror-world flow

  async function enterMirror(ghost: GhostCard): Promise<void> {
    const world = mirrorWorldFor(ghost.id);
    if (!world) return;
    setState(recordMirrorVisit(state, ghost.id));
    activeScene = "mirror";
    // Stop parlor cleanly; start mirror.
    game.scene.stop("ParlorScene");
    game.scene.start("MirrorScene", { world, events: mirrorEvents });
    // Give the player a brief moment of disorientation before they regain control.
    await new Promise((r) => setTimeout(r, 300));
  }

  function exitMirror(): void {
    activeScene = "parlor";
    game.scene.stop("MirrorScene");
    game.scene.start("ParlorScene", {
      ghosts: STARTING_GHOSTS, finale: FINALE_GHOST, state, events: parlorEvents,
    });
    flashHint("You return to the parlor, the mirror still humming.");
  }

  async function runInspect(obj: MirrorWorldObject): Promise<void> {
    if (activeScene !== "mirror") return;
    const world = mirrorWorldForCurrent();
    if (!world) return;
    const ghost = ghostById(world.ghost_id);
    if (!ghost) return;
    getMirror()?.setInputEnabled(false);
    // Resolve essence — substitute {{TILE_STATE}} for the chosen variant.
    let essence = obj.essence;
    if (essence.includes("{{VARIANT}}")) {
      const variantKey = state.tile_states[ghost.id];
      const world2 = mirrorWorldFor(ghost.id);
      const line = world2 && variantKey ? tileStateLine(world2, variantKey) : "";
      essence = essence.replace("{{VARIANT}}", line);
    }
    try {
      const description = await seance.inspectObject(ghost, {
        objectName: obj.name,
        essence,
      });
      if (obj.yields_discovery && description) {
        let nextState = recordDiscovery(state, ghost.id, description);
        const mem = {
          name: `An intuition about ${ghost.name}`,
          description,
          ghost_id: ghost.id,
          ghost_name: ghost.name,
        };
        nextState = { ...nextState, mementos: [...nextState.mementos, mem] };
        setState(nextState);
        flashHint(`A new intuition was added to your mementos.`);
        refreshTray();
      }
    } finally {
      // The séance panel handles its own close on Esc. Re-enable mirror input.
      getMirror()?.setInputEnabled(true);
    }
  }

  function mirrorWorldForCurrent(): MirrorWorld | null {
    return getMirror()?.world ?? null;
  }

  // ── Memento tray

  function refreshTray(): void {
    if (state.mementos.length === 0) {
      trayList.innerHTML = `<div class="tray-empty">No mementos yet.<br/>Help a spirit find peace and they will leave you something to remember.</div>`;
      return;
    }
    trayList.innerHTML = state.mementos
      .map((m) => `
        <div class="memento">
          <div class="memento-name">${escapeHtml(m.name)}</div>
          <div class="memento-from">from ${escapeHtml(m.ghost_name)}</div>
          <div class="memento-desc">${escapeHtml(m.description)}</div>
        </div>`)
      .join("");
  }

  function flashHint(msg: string): void {
    const t = document.createElement("div");
    t.className = "altar-flash";
    t.textContent = msg;
    stageEl.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 500); }, 2200);
  }

  // Health pill reflects the model picked at startup. (The setup screen
  // already gated on Ollama being reachable, so by here we know it is.)
  healthEl.textContent = dialogueModel.endsWith("-cloud")
    ? `cloud · ${dialogueModel}`
    : `local · ${dialogueModel}`;
  healthEl.classList.add("ok");

  // ── Reset / new game button in the tray footer
  const resetBtn = document.createElement("button");
  resetBtn.className = "tray-reset";
  resetBtn.textContent = "✦ start a new séance";
  resetBtn.title = "Discard saved progress and begin fresh";
  resetBtn.addEventListener("click", () => {
    if (!confirm("Discard saved progress and begin a fresh séance?")) return;
    clearSavedState();
    location.reload();
  });
  root.querySelector(".tray-footer")?.prepend(resetBtn);

  // ── Debug API for tests + agent self-control
  const debugApi: DebugAPI = {
    state: () => state,
    whichScene: () => activeScene,
    summon: async (ghostId) => {
      const g = ghostById(ghostId);
      if (!g) throw new Error(`unknown ghost: ${ghostId}`);
      await runSeance(g);
    },
    say: async (text) => {
      // Inject text + simulate Enter on the input
      const inputEl = document.querySelector(".seance-input") as HTMLInputElement | null;
      if (!inputEl) throw new Error("séance input not visible");
      inputEl.value = text;
      const sendBtn = document.querySelector(".seance-send") as HTMLButtonElement | null;
      sendBtn?.click();
    },
    hint: async () => {
      await seance.requestHint();
    },
    leaveSeance: () => {
      seance.forceClose();
    },
    walkTo: async (tile) => {
      const target = { x: tile.x * 32, y: tile.y * 32 };
      const sceneRef = activeScene === "parlor" ? getParlor() : getMirror();
      const player = sceneRef?.player;
      if (!player) return;
      player.setPosition(target.x, target.y);
      player.setVelocity(0, 0);
    },
    inspect: async () => {
      if (activeScene !== "mirror") return;
      const m = getMirror();
      if (!m) return;
      let bestDist = Infinity;
      let target: MirrorWorldObject | null = null;
      for (const o of m.objects) {
        const dx = o.sprite.x - m.player.x, dy = o.sprite.y - m.player.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; target = o.def; }
      }
      if (target) await runInspect(target);
    },
    exitMirror: () => exitMirror(),
    showIntro: () => intro.forceShow(),
    showEpilogue: () => {
      const allGhosts = [...STARTING_GHOSTS, FINALE_GHOST];
      const spirits = allGhosts.map((g) => ({
        name: g.name,
        status: (state.status[g.id] ?? "active") as "resolved" | "banished" | "active",
        memento_name: state.mementos.find((m) => m.ghost_id === g.id)?.name,
      }));
      const totalDiscoveries = Object.values(state.discoveries).reduce((a, b) => a + b.length, 0);
      epilogue["deps"].model = dialogueModel;
      epilogue.show({ spirits, discoveries_count: totalDiscoveries, session_salt: state.session_salt });
    },
  };
  (window as unknown as { echo?: DebugAPI }).echo = debugApi;

  // Debug bus: poll the Vite dev-only /debug-action endpoint every 500ms.
  // Agents post `{op: "summon"|"say"|"hint"|"leave"|"walkTo"|"inspect"|
  // "exitMirror", args?: unknown}` to it, and we dispatch to the debug API
  // here. Polling is harmless when the endpoint isn't queueing anything.
  void (async () => {
    const reportResult = async (action: string, result: unknown) => {
      try {
        await fetch("/debug-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, result }),
        });
      } catch { /* ignore */ }
    };
    const dispatch = async (raw: string) => {
      let actionName = "unknown";
      try {
        const action = JSON.parse(raw) as { op: keyof DebugAPI; args?: unknown };
        actionName = String(action.op);
        const a = debugApi as unknown as Record<string, (arg?: unknown) => unknown>;
        const fn = a[action.op];
        if (typeof fn === "function") {
          const result = await fn(action.args);
          // Sanitize result for JSON transport
          const safe = JSON.parse(JSON.stringify(result ?? null));
          console.log("[debug]", action.op, "→", safe);
          await reportResult(actionName, safe);
        } else {
          console.warn("[debug] unknown op:", action.op);
          await reportResult(actionName, { error: "unknown op" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[debug] failed:", err);
        await reportResult(actionName, { error: msg });
      }
    };
    setInterval(async () => {
      try {
        const r = await fetch("/debug-action", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { action: string | null };
        if (j.action) await dispatch(j.action);
      } catch { /* ignore — dev server might be down */ }
    }, 500);
    console.log("[debug] bus polling /debug-action every 500ms");
  })();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

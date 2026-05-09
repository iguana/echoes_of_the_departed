// Game state for Echoes of the Departed.
//
// Tracks per-ghost lifecycle (active / resolved / banished), accumulated
// mementos, whether the finale (Eleanor Hayes) is unlocked.
//
// Persistence is in-memory only for now — a full game is meant to be played in
// a single sitting, like a one-shot tarot reading.

import type { GhostStatus } from "../ghosts/types";
import type { Memento } from "../ghosts/types";
import { STARTING_GHOSTS, FINALE_GHOST } from "../ghosts/catalog";
import { allWorlds, type TileState } from "../scene/mirror_worlds";

export interface MementoEntry extends Memento {
  ghost_id: string;
  ghost_name: string;
}

export interface GameState {
  /** Random per-game salt; injected into ghost prompts so stories vary across
   *  sessions while keeping core identity. */
  session_salt: string;
  status: Record<string, GhostStatus>;
  mementos: MementoEntry[];
  finaleUnlocked: boolean;
  finaleStatus: GhostStatus | null;
  /** Per-ghost: has the medium walked their mirror world? */
  mirror_visited: Record<string, boolean>;
  /** Per-ghost mirror-world variation seeds chosen at game start. */
  tile_states: Record<string, TileState>;
  /** Per-ghost discoveries from the mirror world. Surfaced back into the
   *  ghost's system prompt the next time they're summoned. */
  discoveries: Record<string, string[]>;
}

export const FINALE_THRESHOLD = 3; // mementos needed before Eleanor's altar wakes

export function initialState(): GameState {
  const status: Record<string, GhostStatus> = {};
  for (const g of STARTING_GHOSTS) status[g.id] = "active";
  status[FINALE_GHOST.id] = "active";
  // Pre-roll mirror world variations for every world that declares variants.
  const tile_states: Record<string, TileState> = {};
  for (const w of allWorlds()) {
    if (!w.variants) continue;
    const keys = Object.keys(w.variants);
    if (keys.length === 0) continue;
    tile_states[w.ghost_id] = keys[Math.floor(Math.random() * keys.length)];
  }
  return {
    session_salt: Math.random().toString(36).slice(2, 10),
    status,
    mementos: [],
    finaleUnlocked: false,
    finaleStatus: null,
    mirror_visited: {},
    tile_states,
    discoveries: {},
  };
}

export function recordMirrorVisit(state: GameState, ghostId: string): GameState {
  return { ...state, mirror_visited: { ...state.mirror_visited, [ghostId]: true } };
}

export function recordDiscovery(state: GameState, ghostId: string, text: string): GameState {
  const prev = state.discoveries[ghostId] ?? [];
  if (prev.includes(text)) return state;
  return { ...state, discoveries: { ...state.discoveries, [ghostId]: [...prev, text] } };
}

// ── Persistence ──────────────────────────────────────────────────────────
//
// State is persisted in localStorage so a player can close the parlor and
// return to it later without re-summoning every spirit. The session_salt is
// also persisted, so story details remain stable across sessions for the same
// game (same Edmund will keep his rolled tile_state).

const STORAGE_KEY = "echoes:state:v2";

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore — non-fatal */ }
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    // Validate basic shape (defensive against corrupt save data)
    if (typeof parsed.session_salt !== "string") return null;
    if (typeof parsed.status !== "object" || !parsed.status) return null;
    return {
      session_salt: parsed.session_salt,
      status: parsed.status as Record<string, GhostStatus>,
      mementos: Array.isArray(parsed.mementos) ? parsed.mementos as MementoEntry[] : [],
      finaleUnlocked: !!parsed.finaleUnlocked,
      finaleStatus: (parsed.finaleStatus ?? null) as GhostStatus | null,
      mirror_visited: parsed.mirror_visited ?? {},
      tile_states: parsed.tile_states ?? {},
      discoveries: parsed.discoveries ?? {},
    };
  } catch {
    return null;
  }
}

export function clearSavedState(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** Bootstrap: reuse a saved game if present, else roll a fresh one. */
export function loadOrInitState(): GameState {
  return loadState() ?? initialState();
}

export function recordResolution(state: GameState, ghostId: string, ghostName: string, memento: Memento | undefined): GameState {
  const next: GameState = {
    ...state,
    status: { ...state.status, [ghostId]: "resolved" },
    mementos: memento
      ? [...state.mementos, { ...memento, ghost_id: ghostId, ghost_name: ghostName }]
      : state.mementos,
    finaleUnlocked: state.finaleUnlocked,
    finaleStatus: state.finaleStatus,
  };
  next.finaleUnlocked = next.finaleUnlocked || next.mementos.length >= FINALE_THRESHOLD;
  return next;
}

export function recordBanishment(state: GameState, ghostId: string): GameState {
  return {
    ...state,
    status: { ...state.status, [ghostId]: "banished" },
  };
}

export function ghostStatusOf(state: GameState, ghostId: string): GhostStatus {
  return state.status[ghostId] ?? "active";
}

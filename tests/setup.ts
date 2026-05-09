// Vitest setup. Stubs the Tauri runtime and browser globals that some
// imports touch but aren't testing.

import { vi } from "vitest";

// @tauri-apps/api/tauri stub
vi.mock("@tauri-apps/api/tauri", () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

// localStorage shim — Soundtrack persists state to it
class MemStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemStorage() as unknown as Storage;

// Soundtrack player.
//
// Discovers tracks from /soundtrack-manifest.json (served by a Vite plugin
// that reads the soundtrack/ directory). Plays in shuffled order, auto-
// advances on `ended`, loops the playlist. State (volume / muted / paused)
// is persisted in localStorage so the medium's preferences survive a
// session restart.

const STORAGE_KEY = "echoes:audio:v1";

export interface SoundtrackState {
  volume: number;        // 0..1
  muted: boolean;
  paused: boolean;
}

export interface SoundtrackEvents {
  onTrackChange?: (name: string) => void;
  onStateChange?: (s: SoundtrackState) => void;
  onError?: (msg: string) => void;
}

interface Manifest { tracks: string[]; }

const DEFAULT_STATE: SoundtrackState = { volume: 0.45, muted: false, paused: false };

export class Soundtrack {
  private el = new Audio();
  private tracks: string[] = [];
  private order: number[] = [];
  private idx = 0;
  private state: SoundtrackState;
  private events: SoundtrackEvents;
  private started = false;

  constructor(events: SoundtrackEvents = {}) {
    this.events = events;
    this.state = { ...DEFAULT_STATE, ...this.loadState() };
    this.el.preload = "auto";
    this.el.volume = this.effectiveVolume();
    this.el.addEventListener("ended", () => this.next());
    this.el.addEventListener("error", () => {
      this.events.onError?.(`failed to play ${this.currentName() ?? "track"}`);
      // Try the next track rather than getting stuck.
      this.next();
    });
  }

  /** Load the manifest and prep state. Idempotent. */
  async init(): Promise<void> {
    try {
      const r = await fetch("/soundtrack-manifest.json", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = (await r.json()) as Manifest;
      this.tracks = m.tracks ?? [];
    } catch (e) {
      this.events.onError?.(`could not load soundtrack manifest: ${(e as Error).message}`);
      this.tracks = [];
    }
    this.shuffleOrder();
    if (this.tracks.length > 0) {
      this.loadCurrent();
    }
    this.events.onStateChange?.(this.getState());
  }

  /** Begin playback. Must be called from a user-gesture handler the first
   *  time so the browser allows audio. Subsequent calls just resume. */
  async start(): Promise<void> {
    if (this.tracks.length === 0) return;
    this.started = true;
    if (this.state.paused) {
      this.state.paused = false;
      this.persistState();
    }
    try {
      await this.el.play();
      this.events.onStateChange?.(this.getState());
    } catch {
      // Autoplay blocked — flip state back so the UI shows paused.
      this.state.paused = true;
      this.persistState();
      this.events.onStateChange?.(this.getState());
    }
  }

  togglePause(): void {
    if (!this.started) { void this.start(); return; }
    if (this.el.paused) {
      void this.el.play();
      this.state.paused = false;
    } else {
      this.el.pause();
      this.state.paused = true;
    }
    this.persistState();
    this.events.onStateChange?.(this.getState());
  }

  next(): void {
    if (this.tracks.length === 0) return;
    this.idx = (this.idx + 1) % this.order.length;
    if (this.idx === 0) this.shuffleOrder(); // re-shuffle each loop
    this.loadCurrent();
    if (this.started && !this.state.paused) {
      void this.el.play();
    }
  }

  setVolume(v: number): void {
    this.state.volume = Math.max(0, Math.min(1, v));
    this.el.volume = this.effectiveVolume();
    this.persistState();
    this.events.onStateChange?.(this.getState());
  }

  toggleMute(): void {
    this.state.muted = !this.state.muted;
    this.el.volume = this.effectiveVolume();
    this.persistState();
    this.events.onStateChange?.(this.getState());
  }

  getState(): SoundtrackState {
    return { ...this.state };
  }

  trackCount(): number {
    return this.tracks.length;
  }

  currentName(): string | null {
    if (this.tracks.length === 0) return null;
    const t = this.tracks[this.order[this.idx]];
    return t ?? null;
  }

  // ── internals

  private effectiveVolume(): number {
    return this.state.muted ? 0 : this.state.volume;
  }

  private shuffleOrder(): void {
    this.order = this.tracks.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.idx = 0;
  }

  private loadCurrent(): void {
    const name = this.currentName();
    if (!name) return;
    this.el.src = `/soundtrack/${encodeURIComponent(name)}`;
    this.events.onTrackChange?.(prettyName(name));
  }

  private loadState(): Partial<SoundtrackState> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<SoundtrackState>) : {};
    } catch { return {}; }
  }

  private persistState(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
    catch { /* localStorage unavailable — fine, just don't persist */ }
  }
}

/** Strip extension + replace separators for display. */
function prettyName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-]+/g, " ")
    .trim();
}

// MusicWidget — small in-theme HUD widget for the séance soundtrack.
//
// Compact by default (a single sigil + track name). On hover/focus, expands
// to reveal a play/pause toggle, mute toggle, and volume slider. Designed to
// sit in the sidebar header alongside the model pill.

import { Soundtrack, type SoundtrackState } from "../audio/Soundtrack";

export class MusicWidget {
  private el: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private playBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private volumeEl: HTMLInputElement;
  private soundtrack: Soundtrack;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "music-widget collapsed";
    this.el.innerHTML = `
      <button type="button" class="music-toggle-collapse" title="Sound">
        <span class="music-sigil">♪</span>
      </button>
      <div class="music-body">
        <div class="music-name" title="">no soundtrack</div>
        <div class="music-controls">
          <button type="button" class="music-play"  title="Play / pause">▶</button>
          <button type="button" class="music-skip"  title="Next track">⤼</button>
          <button type="button" class="music-mute"  title="Mute">♨</button>
          <input  type="range" class="music-volume" min="0" max="100" value="45" />
        </div>
      </div>
    `;
    host.appendChild(this.el);

    this.nameEl = this.el.querySelector(".music-name") as HTMLDivElement;
    this.playBtn = this.el.querySelector(".music-play") as HTMLButtonElement;
    this.muteBtn = this.el.querySelector(".music-mute") as HTMLButtonElement;
    this.volumeEl = this.el.querySelector(".music-volume") as HTMLInputElement;
    const skipBtn = this.el.querySelector(".music-skip") as HTMLButtonElement;
    const collapseBtn = this.el.querySelector(".music-toggle-collapse") as HTMLButtonElement;

    this.soundtrack = new Soundtrack({
      onTrackChange: (name) => { this.nameEl.textContent = name; this.nameEl.title = name; },
      onStateChange: (s) => this.applyState(s),
      onError: () => { /* errors are non-fatal; UI stays usable */ },
    });

    this.playBtn.addEventListener("click", () => this.soundtrack.togglePause());
    this.muteBtn.addEventListener("click", () => this.soundtrack.toggleMute());
    skipBtn.addEventListener("click", () => this.soundtrack.next());
    this.volumeEl.addEventListener("input", () => {
      this.soundtrack.setVolume(Number(this.volumeEl.value) / 100);
    });

    collapseBtn.addEventListener("click", () => {
      this.el.classList.toggle("collapsed");
    });
    // Auto-expand on hover, snap shut when leaves
    this.el.addEventListener("mouseenter", () => this.el.classList.remove("collapsed"));
    this.el.addEventListener("mouseleave", (e) => {
      const related = e.relatedTarget as Node | null;
      if (related && this.el.contains(related)) return;
      // Don't collapse while volume slider is active
      if (document.activeElement === this.volumeEl) return;
      this.el.classList.add("collapsed");
    });

    // First user interaction anywhere kicks off playback (browsers block
    // autoplay until a gesture).
    const startOnGesture = () => {
      void this.soundtrack.start();
      window.removeEventListener("pointerdown", startOnGesture, true);
      window.removeEventListener("keydown", startOnGesture, true);
    };
    window.addEventListener("pointerdown", startOnGesture, true);
    window.addEventListener("keydown", startOnGesture, true);
  }

  async init(): Promise<void> {
    await this.soundtrack.init();
    this.applyState(this.soundtrack.getState());
    if (this.soundtrack.trackCount() === 0) {
      this.nameEl.textContent = "drop .mp3s in /soundtrack";
      this.playBtn.disabled = true;
      this.muteBtn.disabled = true;
      this.volumeEl.disabled = true;
    } else {
      this.nameEl.textContent = this.soundtrack.currentName() ?? "—";
    }
  }

  private applyState(s: SoundtrackState): void {
    this.playBtn.textContent = s.paused ? "▶" : "❚❚";
    this.playBtn.title = s.paused ? "Resume" : "Pause";
    this.muteBtn.textContent = s.muted ? "♪̸" : "♨";
    this.muteBtn.title = s.muted ? "Unmute" : "Mute";
    this.muteBtn.classList.toggle("muted", s.muted);
    this.volumeEl.value = String(Math.round(s.volume * 100));
  }
}

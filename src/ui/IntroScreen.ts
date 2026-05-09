// IntroScreen — one-shot modal shown on first launch. Dismisses to localStorage
// flag so it never shows again. Players who clear their save (via the "start a
// new séance" button) will see it again.

const SEEN_KEY = "echoes:intro_seen:v1";

export class IntroScreen {
  private el: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "intro hidden";
    this.el.innerHTML = `
      <div class="intro-veil"></div>
      <div class="intro-card">
        <div class="intro-title">Echoes of the Departed</div>
        <div class="intro-sub">A séance in five mirrors</div>
        <div class="intro-body">
          <p>You are the medium. The candlelit parlor of <em>Dr. Eleanor Hayes</em> holds five scrying mirrors. Each is tuned to a soul that cannot pass on alone.</p>
          <p>Walk between them, listen carefully, and find a way to release each spirit — or refuse, and watch the mirror shatter. The dead will tell you what they need; you must decide whether to give it.</p>
          <p>Some spirits will pull you into the world they remember. There you may walk, look, and find the truth they could not bear to speak.</p>
        </div>
        <div class="intro-controls">
          <div class="intro-row"><kbd>WASD</kbd> / arrows — walk the parlor</div>
          <div class="intro-row"><kbd>E</kbd> — commune with a mirror, or inspect an object</div>
          <div class="intro-row"><kbd>H</kbd> — listen for the medium's intuition</div>
          <div class="intro-row"><kbd>Esc</kbd> — leave a séance, or step back through a mirror</div>
        </div>
        <button class="intro-begin">Begin the night</button>
      </div>
    `;
    host.appendChild(this.el);
    const begin = this.el.querySelector(".intro-begin") as HTMLButtonElement;
    begin.addEventListener("click", () => this.dismiss());
    document.addEventListener("keydown", this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.el.classList.contains("hidden")) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      this.dismiss();
    }
  };

  showIfFirstRun(): void {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen) return;
    this.el.classList.remove("hidden");
  }

  /** Always show, even if previously dismissed. Used by a "show intro again" debug op. */
  forceShow(): void {
    this.el.classList.remove("hidden");
  }

  private dismiss(): void {
    if (this.el.classList.contains("hidden")) return;
    this.el.classList.add("hidden");
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}

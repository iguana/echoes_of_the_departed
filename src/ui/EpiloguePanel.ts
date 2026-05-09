// EpiloguePanel — fullscreen overlay shown when Eleanor (the finale ghost)
// resolves. Streams a Gemma-generated reflection that names the spirits the
// medium encountered and what became of each. The narrator is anonymous —
// the closing voice of the séance.

import { chatStream, type ChatStreamHandle } from "../ollama/client";
import { Typewriter } from "./Typewriter";
import { epilogueSystemPrompt, type EpilogueSpirit } from "../ghosts/prompt";

export interface EpilogueDeps {
  model: string;
}

export interface EpilogueOpts {
  spirits: EpilogueSpirit[];
  discoveries_count: number;
  session_salt?: string;
  /** Called when the player dismisses the epilogue. */
  onDismiss?: () => void;
}

export class EpiloguePanel {
  private el: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private writer: Typewriter;
  private deps: EpilogueDeps;
  private inFlight: ChatStreamHandle | null = null;

  constructor(host: HTMLElement, deps: EpilogueDeps) {
    this.deps = deps;
    this.el = document.createElement("div");
    this.el.className = "epilogue hidden";
    this.el.innerHTML = `
      <div class="epilogue-veil"></div>
      <div class="epilogue-stage">
        <div class="epilogue-title">— and so the night ends —</div>
        <div class="epilogue-body"></div>
        <div class="epilogue-hint">[Esc] or click to close</div>
      </div>
    `;
    host.appendChild(this.el);
    this.bodyEl = this.el.querySelector(".epilogue-body") as HTMLDivElement;
    this.hintEl = this.el.querySelector(".epilogue-hint") as HTMLDivElement;
    this.writer = new Typewriter({ target: this.bodyEl, cps: 38 });

    const dismiss = () => this.dismiss();
    this.el.addEventListener("click", dismiss);
    document.addEventListener("keydown", this.onKey);
  }

  private dismissCb: (() => void) | null = null;

  private onKey = (e: KeyboardEvent): void => {
    if (this.el.classList.contains("hidden")) return;
    if (e.key === "Escape" || e.key === "Enter") {
      e.preventDefault();
      this.dismiss();
    } else if (e.key === " ") {
      e.preventDefault();
      this.writer.skipToEnd();
    }
  };

  show(opts: EpilogueOpts): void {
    this.dismissCb = opts.onDismiss ?? null;
    this.el.classList.remove("hidden");
    this.bodyEl.textContent = "";
    this.hintEl.textContent = "the parlor is quiet…";
    const sys = epilogueSystemPrompt({
      spirits: opts.spirits,
      discoveries_count: opts.discoveries_count,
      session_salt: opts.session_salt,
    });
    const writerDone = this.writer.start();
    let started = false;
    this.inFlight = chatStream(
      {
        model: this.deps.model,
        system: sys,
        messages: [{ role: "user", content: "Compose her epilogue now." }],
        options: { temperature: 0.95, top_p: 0.95, num_predict: 280 },
      },
      {
        onToken: (delta) => {
          if (!started) { started = true; this.hintEl.textContent = "[Esc] or click to close   ·   [space] skip"; }
          this.writer.append(delta);
        },
        onError: () => { this.bodyEl.textContent += "\n\n(the words trail off…)"; },
        onDone: () => { this.writer.endOfStream(); },
      },
    );
    void writerDone;
  }

  dismiss(): void {
    if (this.el.classList.contains("hidden")) return;
    this.inFlight?.cancel();
    this.writer.cancel();
    this.el.classList.add("hidden");
    const cb = this.dismissCb; this.dismissCb = null;
    cb?.();
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}

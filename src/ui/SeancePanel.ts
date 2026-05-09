// SeancePanel — atmospheric upgrade of the dialogue overlay for ghost
// communing. Streams Gemma in character; listens for [RESOLVED]/[BANISHED]
// markers; fires fade or shatter animations.
//
// The panel is non-blocking input — the player keeps WASD focus on the parlor
// only when the panel is closed. While open, all keystrokes go to the input.

import { chatStream, type ChatStreamHandle, type ToolCall } from "../ollama/client";
import { InlineCallFilter } from "../ollama/inlineCallFilter";
import { ghostSystemPrompt, hintSystemPrompt, type PromptContext, inspectSystemPrompt } from "../ghosts/prompt";
import { Typewriter } from "./Typewriter";
import type { GhostCard } from "../ghosts/types";

export interface SeanceDeps {
  /** Model used for streaming dialogue (auto-prefer cloud variant). */
  model: string;
  /** Bubbled up when the model invokes a tool. The host can react (e.g.
   *  trigger a portal) and decide whether to close the panel. Returning true
   *  signals the panel should close immediately after the current message. */
  onToolCall?: (ghost: GhostCard, call: ToolCall) => boolean | void;
}

export interface SeanceOutcome {
  ghost: GhostCard;
  status: "resolved" | "banished" | "left" | "portal";
}

export interface CommuneOpts {
  /** Context to inject into the ghost's system prompt (session salt,
   *  mirror_visited flag, accumulated discoveries). */
  ctx?: PromptContext;
}

interface Turn { speaker: "ghost" | "medium"; text: string; }

export class SeancePanel {
  private el: HTMLDivElement;
  private portraitEl!: HTMLImageElement;
  private bubbleEl: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private contextEl: HTMLDivElement | null = null;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private hintEl: HTMLDivElement;
  private writer: Typewriter;
  private deps: SeanceDeps;

  private currentGhost: GhostCard | null = null;
  private currentCtx: PromptContext = {};
  private inFlight: ChatStreamHandle | null = null;
  private history: Turn[] = [];
  private resolvedSeen = false;
  private banishedSeen = false;
  private portalRequested = false;
  private resolveOutcome: ((o: SeanceOutcome) => void) | null = null;
  private hintInFlight: ChatStreamHandle | null = null;
  private hintEl2: HTMLDivElement | null = null;

  constructor(host: HTMLElement, deps: SeanceDeps) {
    this.deps = deps;
    this.el = document.createElement("div");
    this.el.className = "seance-panel hidden";
    this.el.innerHTML = `
      <div class="seance-card">
        <div class="seance-fog"></div>
        <div class="seance-portrait-frame">
          <img class="seance-portrait" alt="" />
        </div>
        <div class="seance-content">
          <div class="seance-name"></div>
          <div class="seance-context hidden"></div>
          <div class="seance-intuition hidden"></div>
          <div class="seance-bubble"></div>
          <div class="seance-hint"></div>
          <div class="seance-input-row">
            <input type="text" class="seance-input" maxlength="240" placeholder="Speak to the spirit… (Enter to send, Esc to leave, H for a hint)" />
            <button class="seance-send">Speak</button>
          </div>
        </div>
      </div>
    `;
    host.appendChild(this.el);

    this.portraitEl = this.el.querySelector(".seance-portrait") as HTMLImageElement;
    this.nameEl = this.el.querySelector(".seance-name") as HTMLDivElement;
    this.contextEl = this.el.querySelector(".seance-context") as HTMLDivElement;
    this.bubbleEl = this.el.querySelector(".seance-bubble") as HTMLDivElement;
    this.hintEl = this.el.querySelector(".seance-hint") as HTMLDivElement;
    this.hintEl2 = this.el.querySelector(".seance-intuition") as HTMLDivElement;
    this.inputEl = this.el.querySelector(".seance-input") as HTMLInputElement;
    this.sendBtn = this.el.querySelector(".seance-send") as HTMLButtonElement;

    this.writer = new Typewriter({ target: this.bubbleEl, cps: 50 });

    this.sendBtn.addEventListener("click", () => this.submitMediumInput());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.submitMediumInput(); }
      else if (e.key === "Escape") { e.preventDefault(); this.leave(); }
      // Cmd/Ctrl+H asks the medium for an intuition. Plain H types into the input.
      else if ((e.key === "h" || e.key === "H") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void this.requestHint();
      }
    });
    document.addEventListener("keydown", this.onGlobalKeyDown);
  }

  private onGlobalKeyDown = (e: KeyboardEvent): void => {
    if (this.el.classList.contains("hidden")) return;
    if (e.key === "Escape") { e.preventDefault(); this.leave(); }
    else if ((e.key === " " || e.key === "Enter") && document.activeElement !== this.inputEl) {
      e.preventDefault();
      this.writer.skipToEnd();
    } else if ((e.key === "h" || e.key === "H") && document.activeElement !== this.inputEl) {
      e.preventDefault();
      void this.requestHint();
    }
  };

  /** Open the panel for one séance with `ghost`. Resolves with the outcome
   *  when the ghost fades, shatters, the medium walks away, OR a tool call
   *  triggers a host-side decision (e.g. portal). */
  async commune(ghost: GhostCard, opts: CommuneOpts = {}): Promise<SeanceOutcome> {
    this.currentGhost = ghost;
    this.currentCtx = opts.ctx ?? {};
    this.history = [];
    this.resolvedSeen = false;
    this.banishedSeen = false;
    this.portalRequested = false;
    if (this.hintEl2) { this.hintEl2.classList.add("hidden"); this.hintEl2.textContent = ""; }
    const dates = `${ghost.born ?? "?"}–${ghost.died ?? "?"}`;
    this.nameEl.textContent = `${ghost.name}    ${dates}`;
    this.portraitEl.src = `/portraits/${ghost.id}.jpg`;
    this.portraitEl.alt = `Portrait of ${ghost.name}`;
    this.bubbleEl.textContent = "";
    this.hintEl.textContent = "";
    this.inputEl.value = "";
    this.inputEl.disabled = false;
    this.sendBtn.disabled = false;
    // Show "what they know" context badge if the medium carries discoveries
    // about this ghost or has walked their mirror world.
    if (this.contextEl) {
      const ctxParts: string[] = [];
      if (this.currentCtx.mirror_visited) ctxParts.push("you have walked their world");
      const dCount = this.currentCtx.discoveries?.length ?? 0;
      if (dCount > 0) ctxParts.push(`${dCount} ${dCount === 1 ? "intuition" : "intuitions"} carried`);
      if (ctxParts.length > 0) {
        this.contextEl.textContent = "✦ " + ctxParts.join(" · ");
        this.contextEl.classList.remove("hidden");
      } else {
        this.contextEl.classList.add("hidden");
      }
    }
    this.el.classList.remove("hidden", "fading", "shattering");
    this.el.classList.add("clouding");
    this.inputEl.focus();

    return new Promise<SeanceOutcome>((resolve) => {
      this.resolveOutcome = resolve;
      // Open with the ghost's first words.
      const opener = ghost.opening_line
        ? `(the medium listens, having just summoned you through the scrying mirror — speak your opening words exactly as written: "${ghost.opening_line}")`
        : "(the medium has just summoned you. Speak your opening words — a single, in-character first utterance.)";
      void this.streamGhostReply(opener);
    });
  }

  private leave(): void {
    if (!this.currentGhost) return;
    this.finishOutcome("left");
  }

  private async submitMediumInput(): Promise<void> {
    if (!this.currentGhost) return;
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = "";
    this.history.push({ speaker: "medium", text });
    await this.streamGhostReply(text);
  }

  private async streamGhostReply(mediumInput: string): Promise<void> {
    const ghost = this.currentGhost;
    if (!ghost) return;

    this.inFlight?.cancel();
    this.writer.cancel();

    this.bubbleEl.textContent = "";
    this.bubbleEl.classList.add("thinking");
    this.hintEl.textContent = "the mirror clouds…";
    this.sendBtn.disabled = true;
    // Leave the input ENABLED while the ghost speaks — let the medium type
    // their next line. We just block the Send button until the stream ends.

    const sys = ghostSystemPrompt(ghost, this.currentCtx);
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    for (const t of this.history) {
      messages.push({ role: t.speaker === "medium" ? "user" : "assistant", content: t.text });
    }
    messages.push({ role: "user", content: mediumInput });
    const writerDone = this.writer.start();

    let acc = "";
    let firstToken = true;
    let streamError: string | null = null;
    const tools = ghost.tools?.map((t) => t.definition);
    // Inline-call filter — Gemma sometimes emits <call:NAME args... /> in
    // text instead of using structured tool_calls. We detect it, suppress
    // the tag from the typewriter stream, and synthesize a ToolCall.
    const onSynthCall = (call: ToolCall) => {
      const close = this.deps.onToolCall?.(ghost, call) ?? false;
      if (close) this.portalRequested = true;
    };
    const inlineFilter = new InlineCallFilter({
      emitText: (s) => { this.writer.append(s); acc += s; },
      emitCall: onSynthCall,
    });
    const handle = chatStream(
      {
        model: this.deps.model,
        system: sys,
        messages,
        tools,
        options: { temperature: 0.85, top_p: 0.95, num_predict: 220 },
      },
      {
        onToken: (delta) => {
          if (firstToken) {
            firstToken = false;
            this.bubbleEl.classList.remove("thinking");
            this.el.classList.remove("clouding");
            this.hintEl.textContent = "";
          }
          inlineFilter.feed(delta);
        },
        onResolved: () => { this.resolvedSeen = true; },
        onBanished: () => { this.banishedSeen = true; },
        onToolCall: (call) => {
          // Structured tool call (preferred path).
          onSynthCall(call);
        },
        onError: (msg) => {
          streamError = msg;
          this.bubbleEl.classList.remove("thinking");
          this.bubbleEl.textContent = `(the connection falters: ${msg})`;
          this.writer.cancel();
        },
        onDone: () => {
          inlineFilter.flush();
          this.writer.endOfStream();
        },
      },
    );
    this.inFlight = handle;

    // Bullet-proof: NEVER let an exception escape this method without
    // settling the outer commune() promise. A stream error that goes
    // unhandled here will lock GameShell's runSeance forever, which leaves
    // the parlor's inputEnabled flag stuck at false (BUG 1 in the audit).
    try {
      try {
        await handle.done;
        await writerDone;
      } catch (e) {
        streamError = streamError ?? (e instanceof Error ? e.message : String(e));
      }
      const trimmed = acc.trim();
      if (trimmed) this.history.push({ speaker: "ghost", text: trimmed });
    } finally {
      this.inFlight = null;
      this.sendBtn.disabled = false;
      if (streamError) {
        this.hintEl.textContent = "the connection has broken… [esc] to leave";
      } else if (this.resolvedSeen) {
        this.hintEl.textContent = "the spirit is at peace…";
        await this.delay(900);
        this.finishOutcome("resolved");
      } else if (this.banishedSeen) {
        this.hintEl.textContent = "the mirror shatters…";
        await this.delay(700);
        this.finishOutcome("banished");
      } else if (this.portalRequested) {
        this.hintEl.textContent = "the veil parts…";
        await this.delay(800);
        this.finishOutcome("portal");
      } else {
        this.hintEl.textContent = "[space] skip   [enter] send   [esc] leave   [h] hint";
      }
    }
  }

  /** Stream a hint via Gemma. The hint appears in a dedicated intuition strip
   *  above the bubble. Cancellable; subsequent presses replace prior hints. */
  async requestHint(): Promise<void> {
    const ghost = this.currentGhost;
    if (!ghost || !this.hintEl2) return;
    this.hintInFlight?.cancel();
    this.hintEl2.textContent = "…";
    this.hintEl2.classList.remove("hidden");
    this.hintEl2.classList.add("thinking");
    const sys = hintSystemPrompt(ghost, { last_turns: this.history });
    let acc = "";
    const handle = chatStream({
      model: this.deps.model,
      system: sys,
      messages: [{ role: "user", content: "Give the medium her intuition now." }],
      options: { temperature: 0.95, top_p: 0.95, num_predict: 80 },
    }, {
      onToken: (delta) => {
        if (this.hintEl2!.classList.contains("thinking")) {
          this.hintEl2!.classList.remove("thinking");
          this.hintEl2!.textContent = "";
        }
        acc += delta;
        this.hintEl2!.textContent = "✦ " + acc.trim();
      },
      onError: () => { this.hintEl2!.textContent = "(the medium cannot quite hear her own thoughts…)"; },
    });
    this.hintInFlight = handle;
    try { await handle.done; } catch { /* ignore */ }
    this.hintInFlight = null;
  }

  /** Inspect-an-object flow used by MirrorScene. Reuses the streaming pipeline
   *  but with an inspect prompt instead of a normal dialogue prompt. Returns
   *  the assembled text for the host to record / surface. */
  async inspectObject(ghost: GhostCard, args: { objectName: string; essence: string }): Promise<string> {
    if (this.el.classList.contains("hidden")) {
      // Open the panel as a one-shot container
      this.currentGhost = ghost;
      const dates = `${ghost.born ?? "?"}–${ghost.died ?? "?"}`;
      this.nameEl.textContent = `${ghost.name}    ${dates}`;
      this.portraitEl.src = `/portraits/${ghost.id}.jpg`;
      this.bubbleEl.textContent = "";
      this.hintEl.textContent = "";
      this.inputEl.value = "";
      if (this.hintEl2) this.hintEl2.classList.add("hidden");
      this.el.classList.remove("hidden", "fading", "shattering");
    }
    this.bubbleEl.textContent = "";
    this.bubbleEl.classList.add("thinking");
    this.hintEl.textContent = `inspecting ${args.objectName}…`;
    this.sendBtn.disabled = true;
    this.inputEl.disabled = true;
    const sys = inspectSystemPrompt(ghost, {
      object_name: args.objectName,
      object_essence: args.essence,
      session_salt: this.currentCtx.session_salt,
    });
    const writerDone = this.writer.start();
    let acc = "";
    let firstToken = true;
    const handle = chatStream({
      model: this.deps.model,
      system: sys,
      messages: [{ role: "user", content: `Describe what the medium sees as she looks at ${args.objectName}.` }],
      options: { temperature: 0.85, top_p: 0.95, num_predict: 180 },
    }, {
      onToken: (delta) => {
        if (firstToken) {
          firstToken = false;
          this.bubbleEl.classList.remove("thinking");
        }
        acc += delta;
        this.writer.append(delta);
      },
      onDone: () => this.writer.endOfStream(),
      onError: (msg) => { this.bubbleEl.classList.remove("thinking"); this.bubbleEl.textContent = `(the vision falters: ${msg})`; this.writer.cancel(); },
    });
    this.inFlight = handle;
    try { await handle.done; await writerDone; }
    catch { /* swallow */ }
    finally {
      this.inFlight = null;
      this.sendBtn.disabled = false;
      this.inputEl.disabled = false;
      this.hintEl.textContent = "[esc] to step back";
    }
    return acc.trim();
  }

  /** Close immediately without going through outcome flow (used by host when
   *  taking control to portal the player). */
  forceClose(): void {
    this.inFlight?.cancel();
    this.hintInFlight?.cancel();
    this.writer.cancel();
    this.el.classList.add("hidden");
    this.el.classList.remove("fading", "shattering", "clouding");
    this.bubbleEl.classList.remove("thinking");
    this.currentGhost = null;
  }

  private finishOutcome(status: SeanceOutcome["status"]): void {
    if (!this.currentGhost) return;
    const ghost = this.currentGhost;
    const cb = this.resolveOutcome;
    this.resolveOutcome = null;
    this.currentGhost = null;
    this.inFlight?.cancel();
    this.inFlight = null;

    // Fade animation
    if (status === "resolved") this.el.classList.add("fading");
    else if (status === "banished") this.el.classList.add("shattering");

    setTimeout(() => {
      this.el.classList.add("hidden");
      this.el.classList.remove("fading", "shattering", "clouding");
      this.bubbleEl.classList.remove("thinking");
      this.bubbleEl.textContent = "";
      this.hintEl.textContent = "";
      this.writer.cancel();
      cb?.({ ghost, status });
    }, status === "left" ? 0 : 1100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onGlobalKeyDown);
    this.el.remove();
  }
}

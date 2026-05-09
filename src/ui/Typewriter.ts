// Streaming typewriter renderer.
//
// Use case: NPC dialogue. Tokens arrive from Gemma faster than we want to
// display them, so we maintain a small buffer and reveal characters at a fixed
// rate (configurable, default ~45 chars/sec — matches classic JRPG cadence).
//
// If the LLM ever stalls, the renderer waits for the next token. If the user
// presses any key during typing, we fast-forward to the latest received text.

export interface TypewriterOptions {
  /** Element to render into. Cleared on start(). */
  target: HTMLElement;
  /** Characters per second. Defaults to 45. */
  cps?: number;
  /** Optional sound hook called for each rendered character. */
  onChar?: (ch: string) => void;
}

export class Typewriter {
  private target: HTMLElement;
  private cps: number;
  private onChar?: (ch: string) => void;

  private buffer = "";
  private rendered = "";
  private timer: number | null = null;
  private resolveDone: (() => void) | null = null;
  private done = false;
  private finishedAppending = false;
  private fastForward = false;

  constructor(opts: TypewriterOptions) {
    this.target = opts.target;
    this.cps = opts.cps ?? 45;
    this.onChar = opts.onChar;
  }

  /** Reset state and begin typing. Returns a promise resolved when idle (buffer
   *  drained AND `endOfStream()` called). */
  start(): Promise<void> {
    this.buffer = "";
    this.rendered = "";
    this.done = false;
    this.finishedAppending = false;
    this.fastForward = false;
    this.target.textContent = "";
    return new Promise<void>((resolve) => {
      this.resolveDone = resolve;
      this.scheduleTick();
    });
  }

  /** Append more text to the buffer. Safe to call repeatedly while typing. */
  append(text: string): void {
    if (this.done) return;
    this.buffer += text;
    this.scheduleTick();
  }

  /** Mark the stream as complete. The typewriter will finish draining whatever
   *  is left in the buffer, then resolve start()'s promise. */
  endOfStream(): void {
    this.finishedAppending = true;
    this.scheduleTick();
  }

  /** Skip the per-char delay. Future appended text shows immediately. */
  skipToEnd(): void {
    this.fastForward = true;
    this.scheduleTick();
  }

  /** Cancel without resolving. Used when the player walks away mid-dialogue. */
  cancel(): void {
    this.done = true;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.resolveDone?.();
    this.resolveDone = null;
  }

  /** Currently rendered text. */
  text(): string {
    return this.rendered;
  }

  private scheduleTick(): void {
    if (this.timer != null || this.done) return;
    if (this.fastForward) {
      this.flushAll();
      return;
    }
    if (this.rendered.length >= this.buffer.length) {
      if (this.finishedAppending) this.complete();
      return;
    }
    const interval = Math.max(8, Math.floor(1000 / this.cps));
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.tick();
    }, interval);
  }

  private tick(): void {
    if (this.done) return;
    if (this.rendered.length < this.buffer.length) {
      const ch = this.buffer[this.rendered.length];
      this.rendered += ch;
      this.target.textContent = this.rendered;
      this.onChar?.(ch);
    }
    this.scheduleTick();
  }

  private flushAll(): void {
    this.rendered = this.buffer;
    this.target.textContent = this.rendered;
    if (this.finishedAppending) this.complete();
  }

  private complete(): void {
    if (this.done) return;
    this.done = true;
    this.resolveDone?.();
    this.resolveDone = null;
  }
}

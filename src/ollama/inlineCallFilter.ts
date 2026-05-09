// InlineCallFilter — parallel to the Rust MarkerFilter, but for inline
// function-call patterns the model occasionally emits as text instead of
// using structured tool_calls. Gemma 4 mostly uses structured tool_calls
// when prompted properly, but with rich character system prompts it
// sometimes regresses to inline `<call:NAME key="value" />` text. We
// detect that pattern, suppress it from the typewriter stream, and surface
// it as a synthetic ToolCall so the host can react identically.

import type { ToolCall } from "./types";

const CALL_RE = /<call:([a-zA-Z_][a-zA-Z0-9_]*)([^>]*?)\/>/;
/** Held-back tail length: never emit the trailing N chars in case they're a
 *  partial call that completes in the next chunk. Length of "<call:" is 6;
 *  reasonable upper bound for "<call:NAME [args]" before "/>". */
const MAX_TAIL = 256;

/** Parse an attribute list like `key1="val 1" key2='val 2' key3=val3` into an
 *  object. Quoted strings preferred; bare tokens accepted as fallback. */
function parseInlineArgs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

export interface InlineCallFilterOpts {
  emitText: (s: string) => void;
  emitCall: (call: ToolCall) => void;
}

export class InlineCallFilter {
  private pending = "";
  private opts: InlineCallFilterOpts;

  constructor(opts: InlineCallFilterOpts) {
    this.opts = opts;
  }

  feed(chunk: string): void {
    this.pending += chunk;
    // Drain any complete calls
    let m: RegExpMatchArray | null;
    while ((m = this.pending.match(CALL_RE))) {
      const idx = m.index ?? 0;
      if (idx > 0) this.opts.emitText(this.pending.slice(0, idx));
      const name = m[1];
      const args = parseInlineArgs(m[2]);
      this.opts.emitCall({
        function: { name, arguments: args as Record<string, unknown> },
      });
      this.pending = this.pending.slice(idx + m[0].length);
    }
    // Emit safe portion (everything except the last MAX_TAIL chars in case
    // the start of an unfinished call is in there).
    if (this.pending.length > MAX_TAIL) {
      const safe = this.pending.length - MAX_TAIL;
      this.opts.emitText(this.pending.slice(0, safe));
      this.pending = this.pending.slice(safe);
    }
  }

  flush(): void {
    if (this.pending) {
      this.opts.emitText(this.pending);
      this.pending = "";
    }
  }
}

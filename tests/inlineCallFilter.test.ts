// Tests for the InlineCallFilter — handles Gemma's occasional regression
// to inline `<call:NAME args... />` text format instead of structured
// tool_calls. We need to detect/strip + synthesize a ToolCall.

import { describe, expect, it } from "vitest";
import { InlineCallFilter } from "../src/ollama/inlineCallFilter";
import type { ToolCall } from "../src/ollama/types";

interface Capture { text: string; calls: ToolCall[]; }

function feedAll(chunks: string[]): Capture {
  const cap: Capture = { text: "", calls: [] };
  const f = new InlineCallFilter({
    emitText: (s) => { cap.text += s; },
    emitCall: (c) => { cap.calls.push(c); },
  });
  for (const c of chunks) f.feed(c);
  f.flush();
  return cap;
}

describe("InlineCallFilter", () => {
  it("passes plain text unchanged", () => {
    const r = feedAll(["Hello, gentle stranger. The mirror is cold tonight."]);
    expect(r.text).toBe("Hello, gentle stranger. The mirror is cold tonight.");
    expect(r.calls).toEqual([]);
  });

  it('parses <call:NAME key="value" />', () => {
    const r = feedAll([
      'Then come — the veil parts. <call:pull_through_mirror reason="so they may judge the codex with their own eyes" />',
    ]);
    expect(r.text).toBe("Then come — the veil parts. ");
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].function.name).toBe("pull_through_mirror");
    expect(r.calls[0].function.arguments).toEqual({
      reason: "so they may judge the codex with their own eyes",
    });
  });

  it("handles multiple inline args", () => {
    const r = feedAll(['<call:my_tool foo="bar" baz="qux" />']);
    expect(r.text).toBe("");
    expect(r.calls[0].function.arguments).toEqual({ foo: "bar", baz: "qux" });
  });

  it("survives the call straddling chunk boundaries", () => {
    const r = feedAll([
      "Speech first. ",
      "<call:pull_thr",
      'ough_mirror reason="te',
      'st" />',
      " trailing text.",
    ]);
    expect(r.text).toBe("Speech first.  trailing text.");
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].function.name).toBe("pull_through_mirror");
    expect(r.calls[0].function.arguments).toEqual({ reason: "test" });
  });

  it("supports single-quoted args", () => {
    const r = feedAll([`<call:t a='one' />`]);
    expect(r.calls[0].function.arguments).toEqual({ a: "one" });
  });

  it("supports bare token args", () => {
    const r = feedAll(["<call:t a=42 />"]);
    expect(r.calls[0].function.arguments).toEqual({ a: "42" });
  });

  it("handles two calls in one stream", () => {
    const r = feedAll([
      'Speak. <call:a foo="1" /> Then <call:b bar="2" />.',
    ]);
    expect(r.text).toBe("Speak.  Then .");
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0].function.name).toBe("a");
    expect(r.calls[1].function.name).toBe("b");
  });

  it("ignores text that looks like a call but isn't valid", () => {
    const r = feedAll(["<call: bare> not really a call"]);
    expect(r.calls).toEqual([]);
    expect(r.text).toBe("<call: bare> not really a call");
  });
});

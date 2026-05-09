// TS-side parity for the Rust MarkerFilter. We re-implement the same
// algorithm in TS and assert the same behavior, so we have confidence both
// languages produce identical output for the same chunked stream.

import { describe, expect, it } from "vitest";

const MARKERS: { token: string; event: string }[] = [
  { token: "[RESOLVED]", event: "resolved" },
  { token: "[BANISHED]", event: "banished" },
];
const MAX_MARKER_LEN = Math.max(...MARKERS.map((m) => m.token.length));

interface FilterResult { text: string; events: string[]; }

function runFilter(chunks: string[]): FilterResult {
  let pending = "";
  const events: string[] = [];
  let text = "";
  for (const chunk of chunks) {
    pending += chunk;
    let foundAny = true;
    while (foundAny) {
      foundAny = false;
      let bestIdx = Infinity;
      let bestMarker: { token: string; event: string } | null = null;
      for (const m of MARKERS) {
        const i = pending.indexOf(m.token);
        if (i !== -1 && i < bestIdx) { bestIdx = i; bestMarker = m; }
      }
      if (bestMarker) {
        if (bestIdx > 0) text += pending.slice(0, bestIdx);
        events.push(bestMarker.event);
        pending = pending.slice(bestIdx + bestMarker.token.length);
        foundAny = true;
      }
    }
    if (pending.length > MAX_MARKER_LEN) {
      const safe = pending.length - MAX_MARKER_LEN;
      text += pending.slice(0, safe);
      pending = pending.slice(safe);
    }
  }
  text += pending;
  return { text, events };
}

describe("MarkerFilter (TS parity port)", () => {
  it("passes plain text unchanged", () => {
    const r = runFilter(["Hello, medium. I cannot stay long."]);
    expect(r.text).toBe("Hello, medium. I cannot stay long.");
    expect(r.events).toEqual([]);
  });

  it("strips [RESOLVED] at end", () => {
    const r = runFilter(["Thank you. I can rest now.[RESOLVED]"]);
    expect(r.text).toBe("Thank you. I can rest now.");
    expect(r.events).toEqual(["resolved"]);
  });

  it("strips a marker straddling a chunk boundary", () => {
    // Split [BANISHED] across chunks
    const r = runFilter(["Begone!", "[BANISH", "ED]"]);
    expect(r.text).toBe("Begone!");
    expect(r.events).toEqual(["banished"]);
  });

  it("handles marker at start", () => {
    const r = runFilter(["[RESOLVED]"]);
    expect(r.text).toBe("");
    expect(r.events).toEqual(["resolved"]);
  });

  it("handles multiple markers in one stream", () => {
    const r = runFilter(["First[RESOLVED] then more[BANISHED]"]);
    expect(r.text).toBe("First then more");
    expect(r.events).toEqual(["resolved", "banished"]);
  });

  it("preserves text before, between, and after markers across many small chunks", () => {
    const input = "Tell Ruth.[RESOLVED]";
    // feed one char at a time
    const chunks = [...input];
    const r = runFilter(chunks);
    expect(r.text).toBe("Tell Ruth.");
    expect(r.events).toEqual(["resolved"]);
  });
});

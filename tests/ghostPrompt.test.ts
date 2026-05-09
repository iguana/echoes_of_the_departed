// Tests for the ghostSystemPrompt and hintSystemPrompt builders.

import { describe, expect, it } from "vitest";
import { ghostSystemPrompt, hintSystemPrompt, RESOLVED_TOKEN, BANISHED_TOKEN, inspectSystemPrompt } from "../src/ghosts/prompt";
import { EVE_MARSTON, BROTHER_EDMUND } from "../src/ghosts/catalog";

describe("ghostSystemPrompt", () => {
  it("includes the ghost's name, era, and bio", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON);
    expect(sys).toContain(EVE_MARSTON.name);
    expect(sys).toContain(EVE_MARSTON.era);
    expect(sys).toContain(EVE_MARSTON.short_bio);
  });

  it("lists every knowledge entry and every secret", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON);
    for (const k of EVE_MARSTON.knowledge) expect(sys).toContain(k);
    for (const s of EVE_MARSTON.secrets) expect(sys).toContain(s);
  });

  it("embeds the [RESOLVED] and [BANISHED] tokens verbatim", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON);
    expect(sys).toContain(RESOLVED_TOKEN);
    expect(sys).toContain(BANISHED_TOKEN);
  });

  it("describes the resolution and banish paths", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON);
    expect(sys).toContain(EVE_MARSTON.resolution_path);
    expect(sys).toContain(EVE_MARSTON.banish_path);
  });

  it("surfaces tools when present (Edmund has pull_through_mirror)", () => {
    const sys = ghostSystemPrompt(BROTHER_EDMUND);
    expect(sys).toContain("FUNCTIONS AVAILABLE TO YOU");
    expect(sys).toContain("pull_through_mirror");
    // Critical: must NOT echo the function signature in a way that teaches
    // Gemma to inline it into prose (caused real-game regression once).
    expect(sys).not.toMatch(/pull_through_mirror\s*\(/);
    // Must instruct structured calling to avoid inline mirroring.
    expect(sys).toMatch(/structured function-call/i);
    expect(sys).toMatch(/DO NOT write the function call as text/i);
  });

  it("omits FUNCTIONS section when no tools defined (Eve)", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON);
    expect(sys).not.toContain("FUNCTIONS AVAILABLE TO YOU");
  });

  it("includes session salt when supplied", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON, { session_salt: "abc123" });
    expect(sys).toContain("abc123");
    expect(sys).toContain("Session salt");
  });

  it("notes mirror_visited memory when set", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON, { mirror_visited: true });
    expect(sys.toLowerCase()).toContain("crossed through your mirror");
  });

  it("lists discoveries when present", () => {
    const sys = ghostSystemPrompt(EVE_MARSTON, { discoveries: ["found a tin box of receipts"] });
    expect(sys).toContain("WHAT THE MEDIUM HAS DISCOVERED");
    expect(sys).toContain("found a tin box of receipts");
  });
});

describe("hintSystemPrompt", () => {
  it("references the ghost identity and frames as inner-voice", () => {
    const p = hintSystemPrompt(EVE_MARSTON, { last_turns: [] });
    expect(p).toContain(EVE_MARSTON.name);
    expect(p).toContain(EVE_MARSTON.era);
    expect(p.toLowerCase()).toContain("inner voice");
  });

  it("includes recent dialogue turns", () => {
    const p = hintSystemPrompt(EVE_MARSTON, {
      last_turns: [
        { speaker: "ghost",  text: "Who's asking, kitten?" },
        { speaker: "medium", text: "Tell me about Tommy." },
      ],
    });
    expect(p).toContain("Who's asking, kitten?");
    expect(p).toContain("Tell me about Tommy.");
  });

  it("instructs ONE sentence and never quoting the resolution path verbatim", () => {
    const p = hintSystemPrompt(EVE_MARSTON, { last_turns: [] });
    expect(p).toMatch(/ONE short sentence/i);
    expect(p.toLowerCase()).toContain("never quote the resolution path");
  });

  it("trims to last 6 turns when there are many", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      speaker: i % 2 === 0 ? ("ghost" as const) : ("medium" as const),
      text: `turn ${i}`,
    }));
    const p = hintSystemPrompt(EVE_MARSTON, { last_turns: turns });
    expect(p).not.toContain("turn 0");
    expect(p).not.toContain("turn 3");
    expect(p).toContain("turn 9");
  });
});

describe("inspectSystemPrompt", () => {
  it("includes the object name and essence", () => {
    const p = inspectSystemPrompt(BROTHER_EDMUND, {
      object_name: "the loose tile",
      object_essence: "Beneath it, a leather bundle.",
    });
    expect(p).toContain("the loose tile");
    expect(p).toContain("Beneath it, a leather bundle.");
  });

  it("preserves the ghost voice notes for narration", () => {
    const p = inspectSystemPrompt(BROTHER_EDMUND, {
      object_name: "the desk",
      object_essence: "Inks and quills.",
    });
    expect(p).toContain(BROTHER_EDMUND.voice_notes);
  });
});

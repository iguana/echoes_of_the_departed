// Tests for the GameState transitions: resolution, banishment, mirror visits,
// discoveries, finale unlock threshold.

import { describe, expect, it } from "vitest";
import {
  initialState, recordResolution, recordBanishment,
  recordMirrorVisit, recordDiscovery, ghostStatusOf, FINALE_THRESHOLD,
} from "../src/game/state";

describe("initialState", () => {
  it("starts every starting ghost as active", () => {
    const s = initialState();
    expect(ghostStatusOf(s, "eve_marston")).toBe("active");
    expect(ghostStatusOf(s, "brother_edmund")).toBe("active");
  });

  it("rolls a session_salt", () => {
    const s = initialState();
    expect(s.session_salt).toMatch(/^[a-z0-9]+$/);
    expect(s.session_salt.length).toBeGreaterThan(2);
  });

  it("pre-rolls a tile_state for Edmund's mirror world", () => {
    const s = initialState();
    expect(["intact", "burned", "copied"]).toContain(s.tile_states.brother_edmund);
  });

  it("starts mirror_visited empty", () => {
    const s = initialState();
    expect(Object.keys(s.mirror_visited)).toHaveLength(0);
  });
});

describe("recordResolution", () => {
  it("flips ghost status and adds memento", () => {
    const s0 = initialState();
    const s1 = recordResolution(s0, "eve_marston", "Eve", { name: "Tin Box", description: "Receipts." });
    expect(ghostStatusOf(s1, "eve_marston")).toBe("resolved");
    expect(s1.mementos).toHaveLength(1);
    expect(s1.mementos[0].ghost_id).toBe("eve_marston");
  });

  it("unlocks finale once threshold mementos accumulated", () => {
    let s = initialState();
    expect(s.finaleUnlocked).toBe(false);
    for (let i = 0; i < FINALE_THRESHOLD; i++) {
      s = recordResolution(s, `g${i}`, `G${i}`, { name: `m${i}`, description: `d${i}` });
    }
    expect(s.finaleUnlocked).toBe(true);
  });
});

describe("recordBanishment", () => {
  it("marks status as banished", () => {
    const s0 = initialState();
    const s1 = recordBanishment(s0, "eve_marston");
    expect(ghostStatusOf(s1, "eve_marston")).toBe("banished");
  });
});

describe("mirror visits + discoveries", () => {
  it("records a mirror visit per ghost", () => {
    const s0 = initialState();
    const s1 = recordMirrorVisit(s0, "brother_edmund");
    expect(s1.mirror_visited.brother_edmund).toBe(true);
    expect(s1.mirror_visited.eve_marston).toBeUndefined();
  });

  it("records discoveries per ghost (no duplicates)", () => {
    let s = initialState();
    s = recordDiscovery(s, "brother_edmund", "the codex was burned");
    s = recordDiscovery(s, "brother_edmund", "the codex was burned"); // dup
    s = recordDiscovery(s, "brother_edmund", "the abbot suspected");
    expect(s.discoveries.brother_edmund).toHaveLength(2);
  });
});

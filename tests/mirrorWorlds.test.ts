// Tests for the mirror-world catalog + variant text resolution.

import { describe, expect, it } from "vitest";
import {
  SCRIPTORIUM, CEDAR_CREEK, MIRROR_WORLDS, mirrorWorldFor, tileStateLine, allWorlds,
} from "../src/scene/mirror_worlds";

describe("mirror world catalog", () => {
  it("has a scriptorium for Edmund", () => {
    expect(mirrorWorldFor("brother_edmund")).toBe(SCRIPTORIUM);
  });

  it("has a cedar creek for Tommy", () => {
    expect(mirrorWorldFor("tommy_whitford")).toBe(CEDAR_CREEK);
  });

  it("returns null for ghosts with no mirror world", () => {
    expect(mirrorWorldFor("eve_marston")).toBeNull();
  });

  it("scriptorium has the expected named objects", () => {
    const ids = SCRIPTORIUM.objects.map((o) => o.id).sort();
    expect(ids).toEqual(["bookshelf", "desk", "loose_tile", "window"]);
  });

  it("cedar creek has the expected named objects", () => {
    const ids = CEDAR_CREEK.objects.map((o) => o.id).sort();
    expect(ids).toEqual(["collar", "creek", "jacket", "lunchbox"]);
  });

  it("each world has exactly one yields_discovery object", () => {
    for (const w of allWorlds()) {
      const yielders = w.objects.filter((o) => o.yields_discovery);
      expect(yielders).toHaveLength(1);
    }
  });

  it("each registered world's ghost_id matches its key in MIRROR_WORLDS", () => {
    // The map is keyed by ghost id (so ghosts can find their world);
    // world.id is the SCENE id (used for asset paths).
    for (const [k, w] of Object.entries(MIRROR_WORLDS)) {
      expect(w.ghost_id).toBe(k);
    }
  });

  it("each world.id matches its asset directory name", () => {
    expect(SCRIPTORIUM.id).toBe("scriptorium");
    expect(CEDAR_CREEK.id).toBe("cedar_creek");
  });

  it("the yields_discovery object's essence references the {{VARIANT}} placeholder", () => {
    for (const w of allWorlds()) {
      const yielder = w.objects.find((o) => o.yields_discovery);
      expect(yielder?.essence).toContain("{{VARIANT}}");
    }
  });
});

describe("variants", () => {
  it("scriptorium has 3 distinct variants", () => {
    const variants = SCRIPTORIUM.variants ?? {};
    expect(Object.keys(variants).sort()).toEqual(["burned", "copied", "intact"]);
    const values = Object.values(variants);
    expect(new Set(values).size).toBe(values.length); // all distinct
  });

  it("cedar creek has 3 distinct variants", () => {
    const variants = CEDAR_CREEK.variants ?? {};
    expect(Object.keys(variants).length).toBe(3);
    const values = Object.values(variants);
    expect(new Set(values).size).toBe(values.length);
  });

  it("tileStateLine returns distinct text for scriptorium variants", () => {
    const a = tileStateLine(SCRIPTORIUM, "intact");
    const b = tileStateLine(SCRIPTORIUM, "burned");
    const c = tileStateLine(SCRIPTORIUM, "copied");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it("tileStateLine returns empty string for unknown variant", () => {
    expect(tileStateLine(SCRIPTORIUM, "nonsense")).toBe("");
  });

  it("scriptorium 'intact' mentions the bundle is intact", () => {
    expect(tileStateLine(SCRIPTORIUM, "intact").toLowerCase()).toContain("intact");
  });

  it("cedar creek variants all mention Rusty in some way", () => {
    for (const key of Object.keys(CEDAR_CREEK.variants ?? {})) {
      const text = tileStateLine(CEDAR_CREEK, key).toLowerCase();
      expect(text).toMatch(/rusty|collar|porch/);
    }
  });
});

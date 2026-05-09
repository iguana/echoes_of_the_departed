// GhostCard — the rich character schema for one summonable spirit.
//
// The schema is the guardrail: every ghost is a typed object with bounded
// fields. Gemma plays them at runtime via system-prompt injection. Ghosts
// themselves are HAND-WRITTEN (in src/ghosts/catalog.ts) — never generated.

import { z } from "zod";
import type { ToolDefinition } from "../ollama/types";

export const AmbientMood = z.enum([
  "melancholy",
  "hostile",
  "playful",
  "weary",
  "anxious",
  "regal",
  "wistful",
  "haunted",
]);
export type AmbientMood = z.infer<typeof AmbientMood>;

export const Memento = z.object({
  /** Short item name shown in the inventory. */
  name: z.string().min(1).max(60),
  /** A single-paragraph remembrance — the player keeps this, not the ghost. */
  description: z.string().min(1).max(280),
});
export type Memento = z.infer<typeof Memento>;

export const GhostCard = z.object({
  /** Stable id, e.g. "eve_marston". Used for state tracking + asset keys. */
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  /** Free-form era label, e.g. "1920s American Jazz Age". */
  era: z.string().min(1).max(80),
  born: z.number().int().nullable(),
  died: z.number().int().nullable(),
  /** "struck by a trolley", "drowned in the creek", etc. — shown on placard. */
  death_cause: z.string().min(1).max(120),
  /** ≤280 chars, shown on the brass placard beneath the mirror. */
  short_bio: z.string().min(1).max(280),
  /** Cadence + vocabulary + mood guidance for Gemma. */
  voice_notes: z.string().min(1).max(400),
  /** What this ghost *wants* from the medium — their unfinished business. */
  unfinished_business: z.string().min(1).max(400),
  /** Facts they know and may share freely if asked. */
  knowledge: z.array(z.string().min(1).max(220)).max(12),
  /** Things they guard. Gemma is told NOT to volunteer these — only reveal
   *  under the right line of questioning or earned trust. */
  secrets: z.array(z.string().min(1).max(220)).max(8),
  /** When the player ____, the ghost feels peace. Phrased as a clause that
   *  reads naturally after "If the medium ". */
  resolution_path: z.string().min(1).max(400),
  /** When the player ____, the ghost is driven away in pain. Same phrasing. */
  banish_path: z.string().min(1).max(400),
  ambient_mood: AmbientMood,
  /** Optional opening line. Otherwise Gemma is asked to greet the medium. */
  opening_line: z.string().max(280).optional(),
  /** What the player gains from a peaceful resolution. */
  memento: Memento.optional(),
  /** Color palette for the ghost's mirror + sprite. RGB hex ints. */
  appearance: z.object({
    body_color: z.number().int(),
    accent_color: z.number().int(),
  }),
  /** Where the mirror lives in the Parlor (Phaser tile coords). */
  mirror_position: z.object({ x: z.number(), y: z.number() }),
});
/** Base GhostCard typed by zod. We extend at the TS level with optional tools
 *  + tool guidance because Zod can't model OpenAPI-shaped function defs cleanly. */
export type GhostCard = z.infer<typeof GhostCard> & {
  /** Optional tools the ghost may invoke during conversation. Forwarded to
   *  Ollama; surfaced in the system prompt as natural-language guidance. */
  tools?: GhostTool[];
};

export interface GhostTool {
  /** OpenAI / Ollama-compatible function definition. */
  definition: ToolDefinition;
  /** Natural-language guidance baked into the system prompt: when the ghost
   *  should invoke this tool. Phrased so Gemma understands intent thresholds. */
  guidance: string;
}

/** Lifecycle state per ghost in the running game. */
export type GhostStatus = "active" | "resolved" | "banished";

# Forging Phaser games with Gemma 4: a structural-guardrail story

> Submitted to the [Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06) challenge.
> Repo: <REPO_URL>. Demo video: <YOUTUBE_URL>.

---

## TL;DR

I built **Gemma Game Forge**, a Tauri desktop app where you type a one-line
prompt — *"a jungle ruins level with a wise turtle NPC who hints at hidden
gems above the canopy"* — and Gemma 4, running locally via Ollama, produces a
playable Phaser 3 game level. NPCs in that level are *also* powered by Gemma 4:
walk up, press E, type a question, and Gemma streams a reply token-by-token,
rendered as classic JRPG typewriter dialogue.

The interesting part isn't the games. It's the **architecture**: a deliberate
division of labor between a heavy frontier model (used at *build time*) and a
light, fast Gemma 4 (used at *runtime*) — bound together by strict JSON
schemas that let the small model contribute meaningfully without ever being in
a position to break anything.

---

## The premise

When the average dev tries to use a small LLM as the brain of an app, the
result is one of two failure modes:

1. **The model is asked to write code, and the code is broken** — fields are
   missing, types are wrong, half the output is in markdown fences that the
   parser can't handle, and the app crashes on every other run.
2. **The model is given so little to do that the LLM is decorative** — a
   summary, a name, a label. The "AI-powered" tag is technically true but you
   could replace the model with `Math.random()` and few would notice.

The interesting design space sits between the two: give Gemma 4 a
**meaningful creative role**, but constrain its output so tightly that
*nothing it produces can break the system, and everything it produces is
immediately usable.*

This is the **structural guardrail** pattern. The schema is the contract.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│  CLAUDE / a frontier model (build time)      │
│  ─ Phaser engines for 4 game types (FIXED)   │
│  ─ Zod LevelConfig schemas (STRICT)          │
│  ─ JSON repair + validator + retry loop      │
│  ─ Sprite atlases pre-loaded                 │
│  ─ Few-shot examples baked into prompts      │
└────────────────┬─────────────────────────────┘
                 │ ships engines + schemas
                 ▼
┌──────────────────────────────────────────────┐
│  GEMMA 4 (runtime, via Ollama)               │
│  ─ Reads: schema + few-shot + user prompt    │
│  ─ Writes: ONLY JSON conforming to schema    │
│  ─ Streams NPC dialogue token-by-token at    │
│    runtime → typewriter UI                   │
└────────────────┬─────────────────────────────┘
                 │ JSON LevelConfig
                 ▼
       Validator → Repair → Phaser Engine → Game
```

Two big wins fall out of this split:

- **Gemma never ships code.** It cannot crash the engine. It cannot inject
  XSS. It cannot reference a sprite that doesn't exist. The schema enforces
  enums for themes, ranges for difficulty, character classes for tile chars,
  and cross-reference invariants between grid digits and the NPC card array.
- **The "engine" is the same regardless of what Gemma produces.** Adding new
  themes, new enemy AI, new physics — none of that requires re-prompting or
  re-training. We change one piece at a time.

---

## The schema *is* the guardrail

Here's a (trimmed) Zod schema for the platformer:

```ts
export const PlatformerLevelConfig = z
  .object({
    schema_version: z.literal("platformer.v1"),
    title: z.string().min(1).max(60),
    theme: z.enum(["forest", "desert", "snow", "cave", "ruins", "sky", "industrial"]),
    difficulty: z.enum(["easy", "medium", "hard"]),
    width: z.number().int().min(20).max(80),
    height: z.number().int().min(10).max(20),
    /** Each entry is one row of `width` chars from the tile/entity catalog. */
    grid: z.array(z.string()).min(10).max(20),
    npcs: z.array(NPCCard).max(9).default([]),
    par_time_seconds: z.number().int().min(15).max(600).default(120),
    hint: z.string().max(220).optional(),
  })
  .superRefine((cfg, ctx) => {
    // Every row is exactly `width` chars; every char is in the catalog;
    // exactly one '@' spawn; at least one '>' exit; every NPC digit in the
    // grid has a matching NPCCard.
    ...
  });
```

Notice what Gemma can do:

- Pick a `theme` from 7 enum values.
- Pick a `difficulty` from 3 enum values.
- Choose `width` × `height` within bounds.
- Author a level layout as `height` rows of `width` characters drawn from a
  fixed catalog (`=` ground, `#` brick, `^` spike, `|` ladder, `~` water, `@`
  player spawn, `>` exit, `c` coin, `g` gem, `*` powerup, `s` slime, `f` bat,
  `1`–`9` NPCs).
- Author up to 9 NPC cards with name, role, personality, voice (8 enums),
  knowledge topics, optional greeting line.

And what Gemma cannot do:

- Reference a sprite or sound by URL.
- Inject HTML.
- Define new enemy behaviors.
- Write executable code anywhere.
- Smuggle a markdown table into a string field (multi-line content gets
  rejected by `z.string()` length + the JSON parser; the few-shot example
  models the format perfectly).

Gemma's output is a strict tree of leaves, each constrained.

---

## What Gemma actually produces

I gave the prompt
> *"A jungle ruins level with a wise turtle NPC who hints at hidden gems above
> the canopy. Medium difficulty, one slime guard."*

to `gemma4:31b` running locally via Ollama. Trimmed output:

```json
{
  "schema_version": "platformer.v1",
  "title": "Canopy Secrets",
  "theme": "ruins",
  "difficulty": "medium",
  "width": 40,
  "height": 15,
  "grid": [
    "........................................",
    "....g.......g.......g...................",
    "....#####...###...###...................",
    "........................................",
    "........c...c...c.......................",
    "....=========...===...===...............",
    "........................................",
    "....f.......f...1...........s....>......",
    "....#...#...#...#...#...#...#...#...#...",
    "....#...#...#...#...#...#...#...#...#...",
    "....#...#...#...#...#...#...#...#...#...",
    "....#...#...#...#...#...#...#...#...#...",
    "....#...#...#...#...#...#...#...#...#...",
    "@...#...#...#...#...#...#...#...#...#...",
    "========================================"
  ],
  "npcs": [{
    "id": 1,
    "name": "Shelldon",
    "role": "forest sage",
    "personality": "An old turtle who has watched the canopy for centuries.",
    "voice": "wise",
    "knowledge_topics": ["the gems hidden above the canopy", "the slime that guards the passage"],
    "greeting_seed": "Greetings, traveler. Do not forget to look up; the true treasures dwell above the leaves."
  }],
  "par_time_seconds": 120,
  "hint": "Look up — the canopy hides the brightest treasures."
}
```

What I love about this:

- Gemma understood "above the canopy" *spatially*. It built vertical brick
  columns and placed the gems on top of them. The play loop (climb up,
  collect gems, descend, exit) emerges from the layout, not from any
  per-game logic I wrote.
- The NPC's `greeting_seed` is *thematic* and on-voice — Shelldon talks like
  a wise old turtle, and his knowledge topics align with what's in the level.
  When the player approaches him in-game, that personality is what Gemma
  streams into the typewriter.

The first-pass output had a width mismatch (rows were 39 chars but `width`
was declared 40 — a counting error). The validator caught it and the retry
loop fed Gemma back the exact error message; attempt 2 fixed it. **The
guardrail working as designed.**

---

## The fast / slow tradeoff: what I learned about Gemma 4

Gemma 4 has a `thinking` capability — an internal reasoning trace that runs
*before* any tokens are emitted. Useful for difficult reasoning, fatal for
streaming UX. Concrete numbers from my dev machine running `gemma4:31b`
(Q4_K_M):

| Mode | Time-to-first-token | Total (1.5 KB JSON) |
|------|--------------------:|--------------------:|
| Local 31B, `think: true`     | 6 minutes  | 6.4 minutes |
| Local 31B, `think: false`    | 10 s       | 42 s        |
| **Cloud 31B-BF16, `think: false`** | **549 ms** | **4.1 s** |

The Ollama `*-cloud` variants are tiny (the local stub is ~342 bytes; full
inference happens server-side). For my desktop app I baked in a simple
priority: **whatever model the user picks for level generation, *its
`-cloud` sibling* is auto-preferred for streaming dialogue.** The result is
that NPC dialogue streams *instantly* even on hardware that takes 42 seconds
to forge a level locally.

For the streaming-typewriter dialogue UX specifically, the cloud variant
*made the entire experience possible.* 549 ms TTFT is exactly the latency
budget where animations (speech-bubble inflate, ellipsis pulse) can mask the
delay. 10 seconds is not.

```ts
function pickDialogueModel(genModel: string, available: string[]): string {
  const cloud = genModel.endsWith("-cloud") ? genModel : `${genModel}-cloud`;
  if (available.includes(cloud)) return cloud;
  const anyCloud = available.find(
    (m) => m.endsWith("-cloud") && m.toLowerCase().includes("gemma"),
  );
  return anyCloud ?? genModel;
}
```

Three lines, big UX impact.

---

## Streaming dialogue: the LLM speed *is* the typing speed

The thing that surprised me most was how natural a token-stream looks when
rendered as classic JRPG dialogue.

```
Shelldon — forest sage
> Greetings, traveler ▌
```

Then:

```
Shelldon — forest sage
> Greetings, traveler. Do not forget ▌
```

Local Gemma 4 31B emits at roughly 30–60 chars/sec — *exactly* the cadence of
old-school RPG text speed. The cloud variant is faster, but the typewriter is
running at a fixed 50 cps anyway, so the buffer just fills slightly faster
than it drains. Result: dialogue feels *deliberate*, not laggy.

The Tauri command pumps NDJSON chunks from Ollama into per-request events:

```rust
let resp = client.post(format!("{}/api/chat", OLLAMA_BASE)).json(&body).send().await?;
let mut stream = resp.bytes_stream();
let mut buf = String::new();
loop {
    tokio::select! {
        biased;
        _ = &mut cancel_rx => { /* player walked away — abort */ ; return Ok(()); }
        next = stream.next() => {
            // parse JSONL, emit window.emit("ollama:token:<id>", delta)
        }
    }
}
```

Cancellation is by `request_id`: if the player walks away from an NPC mid-
sentence, the frontend fires `ollama_cancel(request_id)` and the streaming
loop aborts cleanly via a `tokio::sync::oneshot`. No leaked HTTP connections
when the player is impatient.

---

## How Gemma "writes" levels

A Gemma response for the dungeon crawler:

```json
{
  "schema_version": "dungeon.v1",
  "title": "The Frozen Vow",
  "theme": "ice",
  "difficulty": "medium",
  "rooms": [
    { "id": "entrance", "width": 10, "height": 8, "grid": [
        "##########",
        "#........#",
        "#...1....#",
        "#........#",
        "#...@....#",
        ...
        "#####++###" ],
      "exits": [{ "direction": "s", "to_room_id": "frozen_hall", "locked": false }],
      "flavor": "A shimmering hall of ice where the air bites at your skin." },
    ...
  ],
  "starting_room_id": "entrance",
  "npcs": [{ "id": 1, "name": "Brother Allowyn",
             "personality": "An apologetic monk who lost his nerve when the goblins came.",
             "voice": "anxious", ... }]
}
```

Gemma authored:

- A 3-room graph with directional exits.
- A locked door requiring a key it placed in the middle room.
- Atmospheric flavor text per room.
- An NPC card whose personality ("apologetic monk who lost his nerve") will
  later guide his streamed dialogue when the player engages him.

The dungeon engine never *parsed* any of that meaning. It walked the grid,
spawned sprites, wired colliders, and routed door collisions to room IDs.
The narrative coherence — Brother Allowyn fits this dungeon, not just any
dungeon — comes from Gemma reading the user prompt and producing a unified
artifact.

---

## What the small-model guardrail pattern unlocks

This pattern is not specific to games. The same approach works any time you
want a small model to contribute creative content to a structured system:

- **Form generators** — schemas describe valid form definitions; the LLM
  fills slots from natural-language requirements.
- **Dashboard composers** — schema is "valid widget tree"; LLM picks
  widgets, queries, and copy.
- **Scenario generators** for testing — schema is "valid test fixture";
  LLM imagines edge-case data within the bounds the schema permits.
- **Procedural narratives** — branching dialogue trees, room layouts,
  inventory placements.

The general recipe:

1. **Author the schema first.** Be brutally restrictive. Enums beat strings.
   Ranges beat unbounded numbers. References beat free-form fields.
2. **Embed a hand-crafted few-shot example in the system prompt.** Gemma 4
   models its output structure on it heavily.
3. **Run output through a tolerant pre-pass** (strip markdown fences, fix
   trailing commas, escape stray newlines in strings) *before* the strict
   parser.
4. **Validate strictly. Retry once with the error list.** Two attempts max.
5. **For streaming UX, prefer cloud-routed variants.** TTFT is the whole game.

---

## Run it yourself

```bash
git clone <repo>
cd gemma-game-forge
ollama serve &
ollama pull gemma4:4b      # or gemma4:31b — model agnostic
npm install
npm run tauri:dev
```

Pick a template (platformer / dungeon / runner / match-3), type a prompt,
hit *Forge level*. If you have Ollama Cloud access, your NPCs will stream at
~500 ms TTFT.

Code is MIT-licensed. Asset placeholders are procedural; CC0 sprite packs
(Kenney) drop in next.

---

## Closing thought

Frontier-model reasoning *plus* small-model contribution, mediated by a tight
schema, is a remarkably ergonomic way to ship LLM-augmented software. Gemma 4
does meaningful creative work here — it designs levels, voices NPCs, paces
runner chunks, picks goals — but it cannot break the app. That's the deal:
let the small model think, but don't let it touch the load-bearing parts.

Built for the Build with Gemma 4 challenge. Submitted under MIT license.
Thanks to Google for shipping Gemma 4 with the cloud-variant story baked in
— it changes what's actually possible in a desktop app.

— Eli

---

*Tags: #gemma4challenge #gemma #ai #typescript #rust #gamedev*

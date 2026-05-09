# AGENTS.md

Persistent notes for any AI agent (or human) picking up this project. Read this
before doing anything substantive.

## What this is

**Gemma Game Forge** — a Tauri desktop app that lets a user prompt **Gemma 4
(running locally via Ollama)** to generate playable Phaser 3 game levels,
with structural guardrails so the small model can't break the system.

Submission for the [dev.to Google Gemma 2026 challenge](https://dev.to/challenges/google-gemma-2026-05-06)
(Build track). Submission deadline **2026-05-24**, winners announced 2026-06-04.
Prize: 5×$500 in the build track.

## The architecture you must preserve

```
┌──────────────────────────────────────────────┐
│  CLAUDE / human author (pre-build)           │
│  ─ Phaser engines for 4 game types (FIXED)   │
│  ─ Zod LevelConfig schemas (STRICT)          │
│  ─ JSON repair + validator + retry loop      │
│  ─ Procedural sprite atlas (CC0 later)       │
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

**The schema IS the guardrail.** Every field Gemma can emit has a tight type,
range, or enum. Gemma never ships code, behaviors, or asset references.
Malformed output triggers ONE correction round-trip with embedded error
messages — bounded retry, bounded latency.

If you're tempted to let Gemma emit anything more flexible (functions,
conditional logic, arbitrary asset paths) — stop. The guardrail design is the
whole point of the submission.

## Stack and key decisions

- **Tauri 1.x** (CLI v1.6.6 already installed). Do **not** upgrade to Tauri 2 —
  the user is disk-constrained and v1 ships fine.
- **Phaser 3** in the renderer. Placeholder procedural graphics for now; CC0
  sprite packs later.
- **Vite + vanilla TS** (no React/Vue) — kept lean.
- **Zod** runtime schemas double as TS types via `z.infer`.
- **Ollama** for inference. The user has both `gemma4:31b` (19 GB local Q4) and
  `gemma4:31b-cloud` (zero-disk, runs server-side at full BF16).
- **Rust backend** uses `reqwest` (rustls) + `tokio` + `futures-util` to stream
  NDJSON from Ollama and fan out as Tauri events.

## Hard performance findings — DO NOT FORGET

Measured on user's machine with `gemma4:31b` Q4_K_M:

| Mode | TTFT | Total (~1.5 KB JSON) |
|---|---|---|
| Local 31B `think:true`  | **6 min**  | 6.4 min |
| Local 31B `think:false` | 10 s       | 42 s    |
| Cloud 31B-BF16 `think:false` | **549 ms** | **4.1 s** |

Gemma 4's `thinking` capability runs an internal reasoning trace before any
tokens emit. Useful for difficult reasoning, fatal for streaming UX.

**Defaults baked in:**
- `think: false` everywhere by default.
- Builder exposes a "Deep think" checkbox for level generation only.
- **NEVER** enable `think: true` for streaming dialogue.
- `Builder.pickDialogueModel()` auto-prefers `*-cloud` variants for dialogue.

## File layout

```
/
├── src-tauri/                 # Rust backend
│   ├── src/main.rs            # Tauri builder + AppState (cancellation map)
│   ├── src/ollama.rs          # streaming chat command + cancel + health
│   └── tauri.conf.json        # window 1280x820, csp null, identifier ai.replicant.gemma-game-forge
├── src/                       # Frontend (TS)
│   ├── main.ts                # mounts Builder
│   ├── builder/Builder.ts     # top-level UI: template + prompt + model + preview
│   ├── schemas/               # Zod schemas — THE GUARDRAILS
│   │   ├── common.ts          # NPCCard, Difficulty, NPCVoice
│   │   ├── platformer.ts      # tile + entity catalogs, refinements
│   │   ├── dungeon.ts         # rooms[], room_links, exits
│   │   ├── runner.ts          # pattern chunks
│   │   ├── match3.ts          # board + goals
│   │   ├── repair.ts          # tolerant pre-pass (fences, trailing commas, multiline strings)
│   │   └── index.ts           # parseLevelConfig() dispatch
│   ├── prompts/               # System prompts + hand-crafted few-shot
│   │   ├── common.ts          # STRICT_JSON_RULES, NPC_CARD_BRIEF
│   │   ├── platformer.ts      # full schema brief + 1 example
│   │   ├── dungeon.ts / runner.ts / match3.ts
│   │   ├── dialogue.ts        # NPC system prompt builder
│   │   └── index.ts           # buildLevelPrompt() dispatch
│   ├── ollama/                # Frontend wrapper around Tauri commands
│   │   ├── types.ts           # ChatRequest, ChatMessage, ChatOptions
│   │   └── client.ts          # chatStream, chatCollect, ollamaHealth
│   ├── generation/
│   │   └── levelGenerator.ts  # gen → validate → retry with errors → result
│   ├── engines/
│   │   ├── EngineHost.ts      # EngineEvents, EngineMount<C> contract
│   │   └── platformer/        # PlatformerScene + procedural textures
│   ├── ui/
│   │   ├── Typewriter.ts      # buffered char-by-char renderer
│   │   └── DialoguePanel.ts   # streaming overlay, auto-uses cloud model
│   └── styles.css
├── scripts/
│   └── test-platformer-gen.mjs  # smoke test against real Ollama
├── package.json               # phaser, zod, vite, @tauri-apps/api/cli (v1.x)
└── README.md
```

## Patterns to follow when extending

### Adding a new game template
1. Schema: write `src/schemas/<template>.ts` with tile + entity catalogs, a top
   `LevelConfig` object, and a `superRefine` for cross-field invariants.
2. Add to `SCHEMAS` in `src/schemas/index.ts`.
3. Prompt: write `src/prompts/<template>.ts` with a `SCHEMA_BRIEF`,
   hand-crafted `FEW_SHOT_EXAMPLE`, and `<TEMPLATE>_SYSTEM` template literal.
   Add to `buildLevelPrompt()` dispatch.
4. Engine: write `src/engines/<template>/index.ts` exporting an `EngineMount`
   plus a Phaser scene. Use procedural textures helpers; mirror
   `engines/platformer/textures.ts`.
5. Wire in `Builder.mountEngine()` switch case. Set `ready: true` in `TEMPLATES`.

### Editing prompts safely
- Never remove the `STRICT_JSON_RULES`, `format: "json"`, or the few-shot
  example. They're the difference between "Gemma fills the schema" and "Gemma
  rambles in markdown."
- The few-shot example must itself pass schema validation, or you teach Gemma
  to produce broken output. Whenever you tweak a schema, run the example
  through `parseLevelConfig` to verify.

### Streaming dialogue cancellation
The DialoguePanel.close() calls `inFlight?.cancel()` which calls
`ollama_cancel(request_id)` on the Rust side, which signals via a oneshot
channel into the streaming loop. The loop's `tokio::select!` picks up the
cancel and exits cleanly without leaking the HTTP connection.

## Build / run

```bash
ollama serve &
ollama list           # confirm gemma4:31b (or 31b-cloud)
npm install
npm run tauri:dev     # launches the desktop app
```

Smoke test (no Tauri needed):
```bash
node scripts/test-platformer-gen.mjs                              # local think:false
THINK=1 node scripts/test-platformer-gen.mjs                      # local think:true
MODEL=gemma4:31b-cloud node scripts/test-platformer-gen.mjs       # cloud (auth required)
```

## Status snapshot (2026-05-08)

| Component | State |
|---|---|
| Tauri scaffold | done |
| Streaming Ollama client (Rust + TS) | done, cancellation + think toggle |
| Schemas (4 templates) | done |
| Prompts + few-shot (4 templates) | done, all 4 smoke-tested vs cloud Gemma |
| Generation pipeline (gen → validate → retry) | done |
| Platformer engine | done (procedural graphics) |
| Dungeon engine | done (procedural graphics, room-graph traversal, locked doors, NPCs) |
| Runner engine | done (procedural graphics, ramping difficulty, jump+slide) |
| Match-3 engine | done (full match/cascade/refill, score/clear-color/clear-all goals) |
| Streaming typewriter dialogue | done, auto-uses cloud variant |
| Builder UI | done — all 4 templates wired |
| CC0 asset packs (Kenney) | TODO — placeholders ship; real sprite swap-in is mostly cosmetic |
| Demo video | TODO — user-recorded |
| Dev.to submission post | DRAFT in `SUBMISSION.md` |

Smoke-test results (all via `gemma4:31b-cloud`, `think: false`):

| Template | TTFT | Total | Quality |
|---|---|---|---|
| match3 | 509 ms | 1.0 s | clean, perfect schema |
| runner | 967 ms | 4.2 s | clean, varied chunks |
| dungeon | ~1 s | several s | multi-room, locked doors, atmospheric flavor |
| platformer | 549 ms | 4.1 s | minor width drift, retry loop fixes |

## Don'ts

- Don't `npm cache clean --force` or `cargo cache` cleanup without checking
  disk first — they were already cleaned to make room for this project.
- Don't pull additional Ollama models. The user is disk-constrained.
- Don't add Electron, React, Tailwind, etc. The lean stack is intentional.
- Don't enable `think: true` for streaming dialogue ever. See perf table above.
- Don't accept arbitrary fields in schemas. Tight types are the design.
- Don't commit anything without explicit ask — the user controls commits.

# AGENTS.md

Persistent notes for any AI agent (or human) picking up this project. Read this
before doing anything substantive.

## What this is (v2 — Echoes of the Departed)

**Echoes of the Departed** — a Tauri desktop game where the player is a Victorian-era
spiritualist in a candlelit observatory parlor. They walk between scrying mirrors,
each tuned to the spirit of a specific historical person, and *commune* with the
dead through Gemma 4 streamed dialogue. Each ghost has unfinished business; the
player resolves (or banishes) them through conversation. A meta-arc unlocks the
final encounter once enough spirits are at peace.

Submission for the [dev.to Google Gemma 2026 build challenge](https://dev.to/challenges/google-gemma-2026-05-06).
Deadline **2026-05-24**. Build track: 5 × $500.

## Why we pivoted from v1 (the Game Forge)

v1 — `archive_v1_forge/` — was a level-generator: prompt Gemma 4 with a strict
schema, get back JSON, render as a Phaser level. Demo built end-to-end across 4
templates (platformer, dungeon, runner, match-3). **It worked, but Gemma 4 31B
fought the structured-output task** — counting tile widths in a grid is exactly
what an LLM is bad at. Even the retry loop couldn't reliably correct row-length
drift, and waiting a minute to see "generation failed after 2 attempts" is a
miserable UX.

The pivot leans the other way: **stop asking Gemma to count, start asking it to
play characters.** Pre-built world, hand-written rich character cards, runtime
streaming dialogue. Gemma is doing what it's actually best at — being a
specific, contextual person — and slow streaming reads as *deliberate weight*
in a séance, not as broken latency.

## The architecture

```
┌──────────────────────────────────────────────┐
│  CLAUDE / human author (build time)          │
│  ─ The parlor scene (Phaser, fixed)          │
│  ─ Ghost catalog (6 hand-written characters) │
│  ─ GhostCard schema (typed, complete)        │
│  ─ Game state machine + memento system       │
│  ─ Resolution-token detection in stream      │
└────────────────┬─────────────────────────────┘
                 │ ships engine + characters
                 ▼
┌──────────────────────────────────────────────┐
│  GEMMA 4 (runtime, via Ollama)               │
│  ─ Plays one ghost at a time, in character   │
│  ─ 262K context = remembers full conversation│
│  ─ Streams dialogue token-by-token →         │
│    typewriter UI                             │
│  ─ Embeds [RESOLVED] / [BANISHED] tokens to  │
│    signal end-of-arc                         │
└────────────────┬─────────────────────────────┘
                 │ streams + control tokens
                 ▼
   Stream layer → Typewriter + animation triggers
```

**The schema is still the guardrail.** Ghosts are typed objects with bounded
fields. But Gemma's runtime job is now natural-language conversation in
character — exactly what a chat model is for.

## Stack

- **Tauri 1.x** (CLI v1.6.6 already installed) — same as v1.
- **Phaser 3** for the parlor (top-down, walking, mirror interaction).
- **Vite + vanilla TS** frontend.
- **Zod** for the GhostCard + state schemas.
- **Ollama** for inference. User has `gemma4:31b` (local Q4) and
  `gemma4:31b-cloud` (zero-disk Ollama Cloud BF16). Cloud is auto-preferred
  for dialogue (550 ms TTFT vs 10 s local — see perf table below).

## Hard performance findings — DO NOT FORGET

Measured on user's machine with `gemma4:31b` Q4_K_M:

| Mode | TTFT | Total (~1.5 KB) |
|---|---|---|
| Local 31B `think:true`  | **6 min**  | 6.4 min |
| Local 31B `think:false` | 10 s       | 42 s    |
| Cloud 31B-BF16 `think:false` | **549 ms** | **4.1 s** |

**Defaults baked in:**
- `think: false` everywhere.
- Dialogue auto-routes to `*-cloud` variants when available.
- **NEVER** enable `think: true` for streaming dialogue.

## File layout (v2)

```
/
├── src-tauri/                    # Rust backend (mostly unchanged from v1)
│   ├── src/main.rs               # Tauri builder + AppState
│   └── src/ollama.rs             # streaming chat + cancel + health + token strip
├── src/                          # Frontend
│   ├── main.ts                   # mounts game shell
│   ├── game/
│   │   ├── GameShell.ts          # top-level UI: parlor + seance panel + inventory
│   │   └── state.ts              # ghost states, mementos, altar lock
│   ├── ghosts/
│   │   ├── types.ts              # GhostCard schema
│   │   ├── catalog.ts            # the 6 hand-written ghosts
│   │   └── prompt.ts             # ghostSystemPrompt() builder
│   ├── scene/
│   │   ├── ParlorScene.ts        # the candlelit Phaser hub
│   │   └── textures.ts           # candles, mirrors, walls, player
│   ├── ui/
│   │   ├── Typewriter.ts         # KEPT FROM v1 — JRPG-cadence renderer
│   │   ├── SeancePanel.ts        # streaming dialogue + atmospheric FX
│   │   └── MementoTray.ts        # collected items
│   ├── ollama/                   # KEPT FROM v1
│   │   ├── client.ts             # chatStream / chatCollect
│   │   └── types.ts
│   └── styles.css
├── archive_v1_forge/             # the old level generator + draft writeup
│   ├── SUBMISSION_v1_forge.md
│   └── AGENTS_v1_forge.md
└── README.md
```

## Patterns

### Adding a new ghost
1. Add a card to `src/ghosts/catalog.ts`. Required fields: name, era, dates,
   short biography (≤ 240 chars), unfinished business, secrets (optional),
   resolution path (what the player must say/do for [RESOLVED]), banish path
   (what triggers [BANISHED]), voice notes (cadence, vocabulary, mood).
2. Add a mirror placement in `ParlorScene.ts`.
3. That's it — `ghostSystemPrompt()` and the dialogue flow are generic.

### Editing the resolution-token system safely
- The exact tokens are `[RESOLVED]` and `[BANISHED]` (literal, in brackets).
- Rust strips them from the streamed content *before* forwarding to the
  typewriter, then emits dedicated events `ollama:resolved:<id>` and
  `ollama:banished:<id>`.
- The system prompt instructs Gemma to use these tokens at end-of-message only,
  not mid-sentence. If Gemma still emits them mid-sentence, the strip works
  fine — it's idempotent and order-preserving.
- Don't change the token spelling in one place without changing it in both
  Rust and the system-prompt builder.

### Long-context discipline
We keep the *entire* dialogue history in messages for one ghost session. Gemma 4
has a 262K window — even a long conversation is well under 5% of that. We cap
each ghost system prompt at ~3-4 KB (the catalog entry + resolution rules) so
plenty of room remains.

When the player walks away from a mirror, the session ends. Re-summoning starts
a *new* conversation; the ghost has no memory of the previous one. (That's
in-fiction — each communing is a new pull through the veil.) Ghost STATE
(resolved / banished / active) IS persisted in `game/state.ts`.

## Build / run

```bash
ollama serve &
ollama list           # confirm gemma4:31b (or 31b-cloud)
npm install
npm run tauri:dev
```

## Status snapshot (2026-05-09, mirror-portal milestone)

| Component | State |
|---|---|
| Tauri scaffold | done |
| Streaming Ollama client (Rust + TS) | done — `[RESOLVED]`/`[BANISHED]` markers + tool_calls forwarding |
| Typewriter | done |
| GhostCard schema + tools field | done |
| Ghost catalog (6 characters; Edmund has portal tool) | done |
| ghostSystemPrompt builder + hint + inspect prompts | done |
| Per-session salt (`session_salt` injected into prompts) | done |
| ParlorScene + MirrorScene + scene swap | done |
| SeancePanel (dialogue + hint + inspect surfaces) | done |
| Inline-call filter (handles Gemma regression to inline `<call:.../>`) | done |
| Game state (status, mementos, mirror_visited, discoveries, tile_states) | done |
| Final encounter (Eleanor at altar) | done |
| Debug bridge (Vite middleware → frontend poll → window.echo) | done |
| Vitest tests | 49 passing |
| Dev.to writeup | TODO |

## Tool-calling — Gemma 4 quirks

Gemma 4 supports Ollama's native tool_calls structured format and uses it
correctly when the system prompt is short. With our **rich character system
prompt (~4.7 KB)**, it occasionally regresses to emitting calls as inline
text like `<call:pull_through_mirror reason="…" />`.

We handle both:
1. **Preferred path:** structured `tool_calls` in the streamed message →
   parsed in Rust (`ollama.rs`) → `ollama:toolcall:<id>` event.
2. **Fallback path:** `InlineCallFilter` in the frontend strips the
   `<call:.../>` pattern from the typewriter stream and synthesizes a
   `ToolCall` object identical to the structured one.

The host (`SeancePanel`) treats both identically. Tested with chunk-
straddling fixtures (8 tests).

## Mirror-world architecture

Each ghost MAY define a `MirrorWorld` (`src/scene/mirror_worlds.ts`) — a
top-down explorable scene tied to that ghost. When the ghost calls
`pull_through_mirror`, GameShell stops ParlorScene and starts MirrorScene
with the world definition. Inside, the player walks; pressing E on an
inspectable object opens SeancePanel.inspectObject() which streams a
Gemma-narrated description in the ghost's voice.

Per-ghost variation (e.g. SCRIPTORIUM.objects.loose_tile) uses a stable
`tile_states[ghost_id]` rolled at game start, plugged into the object's
essence template via `tileStateLine()`. The same session always sees the
same variant; new sessions roll fresh.

Any object marked `yields_discovery` records the rendered narration into
`state.discoveries[ghost_id]` and surfaces it as a memento. Subsequent
communings with that ghost include the discovery in their system prompt
(via `PromptContext.discoveries`).

## Adding a new ghost with a portal world

1. Add ghost card to `src/ghosts/catalog.ts`. To enable portals, add `tools:
   [PULL_THROUGH_MIRROR_TOOL]`.
2. Define `MirrorWorld` in `src/scene/mirror_worlds.ts` with:
   - `id` = scene/asset directory name (e.g. "scriptorium")
   - `ghost_id` = the ghost's id (e.g. "brother_edmund")
   - `backdrop` = path to floor image
   - `objects[]` with positions, sizes, sprite filenames, essences
3. Drop assets in `public/mirror_worlds/<id>/`.
4. Add to `MIRROR_WORLDS` map keyed by ghost_id.

## Debug bridge — drive the game from outside

Vite middleware on `/debug-action` queues actions; the frontend polls
every 500ms and dispatches via `window.echo`. Result endpoint at
`/debug-result` collects responses for retrieval.

```bash
# Open a séance, send a message, ask for a hint
curl -X POST localhost:1420/debug-action -d '{"op":"summon","args":"brother_edmund"}'
curl -X POST localhost:1420/debug-action -d '{"op":"say","args":"Show me where you hid the codex."}'
curl -X POST localhost:1420/debug-action -d '{"op":"hint"}'
# Inside a mirror world
curl -X POST localhost:1420/debug-action -d '{"op":"inspect"}'
curl -X POST localhost:1420/debug-action -d '{"op":"exitMirror"}'
# Read state
curl -X POST localhost:1420/debug-action -d '{"op":"state"}'
curl localhost:1420/debug-result
```

## Don'ts

- Don't pull additional Ollama models (user is disk-constrained).
- Don't bring level generation back. Gemma is a chat model in this game; it
  doesn't author scenes.
- Don't enable `think: true` for streaming dialogue.
- Don't rename the resolution tokens without updating both sides.
- Don't commit anything without explicit ask — the user controls commits.

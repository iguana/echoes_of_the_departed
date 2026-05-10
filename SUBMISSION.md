# Echoes of the Departed: ten ways one séance game uses Gemma 4

> Submitted to the [Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06) challenge.
> Repo: https://github.com/iguana/echoes_of_the_departed. Demo video: <YOUTUBE_URL>. MIT-licensed.

---

## TL;DR

You play a Victorian medium in a candlelit observatory parlor with five
scrying mirrors. Each mirror is tuned to the spirit of a specific historical
person — a 1920s flapper, a 13th-century Cistercian monk, an eight-year-old
farm boy, a WWI lieutenant, a Salem-era widow. Walk between them, *commune*
through the mirror, and find a way to release each spirit — or fail and watch
the mirror shatter. Some spirits will pull you *into* the world they remember.
Once enough have found peace, the central altar wakes and the original
keeper of the observatory has one last night with you.

Every voice in the game is **Gemma 4**, running locally via Ollama, used in
**ten distinct ways** — not as a single chat endpoint sprinkled across the
UI, but as a designed system of structural guardrails on top of which the
model is given many small, semantically meaningful jobs.

This post is about the architecture and the design choices.

---

## The premise: small models, big roles

When developers reach for a small open-weights LLM, the result is usually
one of two failure modes:

1. **The model is asked to write code.** Something is broken — fields
   missing, types wrong, half the output in markdown fences the parser can't
   handle — and the app crashes on every other run.
2. **The model is given so little to do that it's decorative.** A summary, a
   name, a label. The "AI-powered" tag is technically true but you could
   replace the model with `Math.random()` and few would notice.

The interesting design space is between the two. Give Gemma 4 a **meaningful
creative role**, but constrain its output so tightly that *nothing it
produces can break the system, and everything it produces is immediately
usable.*

This is the **structural-guardrail** pattern. The schema is the contract.

---

## The journey: what I learned by failing first

I started this challenge with a different idea entirely — a **Game Forge**
that let users prompt Gemma 4 to *generate Phaser 3 game levels*
(platformers, dungeons, runners, match-3) by emitting strict JSON
LevelConfig objects. I built it end-to-end in a day, with Zod schemas,
retry-with-error-correction, and four working engines.

It *worked*. But playing with it taught me something:

> **Gemma 4 31B fights structured-output tasks.** Counting tile widths in a
> grid is exactly what an LLM is bad at. The retry loop caught the errors;
> the model couldn't fix them.

Watching the app stare at a "generation failed after 2 attempts" message
for 40 seconds, I realized I was using the model wrong. I had asked a poet
to draft a spreadsheet.

So I pivoted. The whole v1 codebase lives in `archive_v1_forge/` for
reference; the streaming-dialogue infrastructure carried forward into v2.
The new game asks Gemma 4 to do *what it is unambiguously good at* — being a
specific, voiced person across a long, contextual conversation.

And the séance framing solves a second problem the pivot also fixes
incidentally: **the model's deliberate pace becomes a feature.** A ghost
streaming through a misty mirror at 30 chars/second isn't slow — it's
*deliberate*. The latency *is* the lore.

---

## Ten ways we use Gemma 4

The table is the architecture. Each row is a different role the model plays
in this one game.

| # | Role | What Gemma does | Why it works |
|---|---|---|---|
| 1 | **Character dialogue** | Streams in-character responses as the medium types. Each ghost has a 4 KB system prompt: bio, era, voice notes, knowledge, secrets, motive, resolution path, banish path. | Long context (262 K) holds an entire séance; rich character cards mean Gemma improvises within bounded identity. |
| 2 | **Inline end-of-arc markers** | Emits literal `[RESOLVED]` or `[BANISHED]` at the end of the *one* message that closes a séance. | Cheaper than a tool call for a binary state machine; trivial to detect in Rust streaming. |
| 3 | **Structured tool calls (mirror portal)** | Edmund and Tommy decide *via* `pull_through_mirror` whether the medium has earned the right to enter their remembered world. Returned as Ollama's structured `tool_calls` field. | Tool calling > text matching: the *model* judges player intent, not a regex. |
| 4 | **Inline tool-call fallback** | When Gemma regresses to inline `<call:NAME args... />` text under rich prompts, an `InlineCallFilter` parses, suppresses, and synthesizes the same `ToolCall`. | Real-world LLM quirks deserve real-world filters, not pretending it never happens. 8 unit tests cover chunk-boundary cases. |
| 5 | **Object narration in mirror worlds** | Inside a portal world, each inspectable object has an *essence* (objective truth). Gemma narrates what the medium sees in 1–3 sentences in the ghost's voice. | Objective ground-truth + voice notes + per-session salt = grounded but fresh prose every game. |
| 6 | **Hint generation (medium's inner voice)** | Press `H` during a séance and a separate Gemma call generates a single-sentence intuition framed as the medium musing aloud — never quoting the resolution path verbatim. | Different system prompt = a different *persona* from the same model on the same conversation. |
| 7 | **Per-session story variation** | Every game gets a random `session_salt` injected into every ghost prompt. Same character identity, fresh details (specific names, hiding spots, scenes). | Replayability without hand-authoring multiple plotlines. The model improvises. |
| 8 | **Carry-over context across summonings** | Discoveries from inside a mirror world (e.g. "the codex was burned") become entries in subsequent dialogue prompts. Ghosts react to what the medium has learned. | Player feels their detective work persists; ghosts feel like they remember. |
| 9 | **Bounded structural variation** | Each mirror world declares 3 *variants* of the key reveal. One is rolled at game start (e.g. Edmund's codex is intact / burned / copied; Tommy's collar tells one of three Rusty stories). The variant text is substituted into the object's essence. | Designed-in branching the model can't ruin — the model narrates *one of three* truths chosen by the engine. |
| 10 | **End-of-game narrator reflection** | When Eleanor (the finale ghost) resolves, an unnamed narrator persona streams a 4–6-sentence literary reflection that names the spirits the medium encountered and what became of each. | A 10th distinct persona. Same model, different role, same session. |

A real epilogue from a fresh run with no ghosts resolved:

> *The medium extinguishes the final taper, leaving the parlor in velvet
> shadow. No whispers breached the veil tonight, and the mirror remains a
> cold, empty void. Eve Marston and Lieutenant James Brennan linger in
> their distant silences, unsummoned and undisturbed. She carries no
> visions back from the glass, only the weight of a heavy stillness. The
> night concludes in a hollow peace.*

Gemma names two specific ghosts unprompted, acknowledges that no resolution
happened, gives literary closure. No template. Generated fresh.

---

## How the schema is the guardrail

Every ghost is a `GhostCard` — a fully typed Zod object:

```ts
export const GhostCard = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  era: z.string().min(1).max(80),
  born: z.number().int().nullable(),
  died: z.number().int().nullable(),
  death_cause: z.string().min(1).max(120),
  short_bio: z.string().min(1).max(280),
  voice_notes: z.string().min(1).max(400),
  unfinished_business: z.string().min(1).max(400),
  knowledge: z.array(z.string().min(1).max(220)).max(12),
  secrets: z.array(z.string().min(1).max(220)).max(8),
  resolution_path: z.string().min(1).max(400),
  banish_path: z.string().min(1).max(400),
  ambient_mood: AmbientMood,
  opening_line: z.string().max(280).optional(),
  memento: Memento.optional(),
  appearance: z.object({ body_color: z.number(), accent_color: z.number() }),
  mirror_position: z.object({ x: z.number(), y: z.number() }),
});
```

Six ghosts are **hand-written** by me in `src/ghosts/catalog.ts` — Gemma
never authors them. At runtime, `ghostSystemPrompt(card, ctx)` mechanically
builds the system prompt from the card plus a `PromptContext` (session
salt, mirror_visited flag, accumulated discoveries, optional tool list).

Gemma's role is to *play* the character whose card I wrote. It cannot:

- Reference a sprite by URL (no asset loading happens via prose)
- Define behaviors (engines own collisions, transitions, scoring)
- Break the schema (validators reject malformed data; we don't trust LLM JSON)
- Inject HTML (typewriter renders text content only)

What it *can* do is improvise within the bounded space the cards define
— and that space is exactly what makes a character feel alive.

---

## The mirror-portal mechanic, end to end

Edmund's card includes a tool:

```ts
tools: [{
  definition: {
    type: "function",
    function: {
      name: "pull_through_mirror",
      description: "Pulls the medium through the scrying mirror into the spirit's remembered world so they may see something with their own eyes...",
      parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    },
  },
  guidance: "When the medium has clearly expressed sincere desire to SEE the codex or its hiding place, you may invoke this to draw them into your scriptorium. NOT for general questions or chitchat.",
}]
```

The Tauri Rust backend forwards `tools` verbatim to Ollama. When the model
emits a `tool_calls` field in a streamed message, we extract it and emit
`ollama:toolcall:<request_id>` events to the frontend. The SeancePanel's
`onToolCall` callback handles `pull_through_mirror` by closing the séance
with status `"portal"` and signaling the GameShell to swap from
ParlorScene to MirrorScene.

Inside the scriptorium (a top-down Phaser scene with floor-stone backdrop,
desk, bookshelf, lancet window, and a loose floor tile), the medium walks
with WASD. Approaching an object surfaces an `[E] inspect…` prompt;
pressing E reopens the SeancePanel with a Gemma-narrated description in
Edmund's voice, generated from a per-object essence string + the ghost's
voice notes:

> *"Behold the stone, lifted as a secret once held… **mea culpa**, my own
> fault for thinking it hidden. Thou seest the leather wrap is empty, for I
> gave the codex to Brother Anselm ere the fever claimed me. **Deo
> gratias** — thanks be to God — that the truth now wanders the world, far
> from my trembling hand, gentle stranger."*

(That's the "copied" variant; this session's roll. Other sessions roll
"intact" or "burned" — Edmund discovering an unburnt manuscript, or only
ash, or a leather wrap empty for different reasons.)

The narration is recorded as a *discovery* on the ghost's state. When the
medium summons Edmund again from the parlor, his system prompt now
includes:

```
MEMORY: The medium has already crossed through your mirror once and
walked your world. Speak to them as someone who has seen it.

WHAT THE MEDIUM HAS DISCOVERED in your world:
  - Behold the stone, lifted as a secret once held… mea culpa…
```

A small purple "context" badge appears in the séance card so the player
knows their detective work is being remembered. The next conversation is
no longer a guessing game — Edmund and the medium are *both* working from
the same revealed truth.

---

## The inline-call regression and how we handle it

The cleanest version of this story would be: Ollama tool calls work
perfectly, ship it. Reality:

In our small smoke test (`scripts/test-tool-call.mjs`) with a simple system
prompt, Gemma 4 reliably emits structured `tool_calls`. **In the real game
with a 4 KB character prompt, it occasionally regresses to inline text:**

```
EDMUND: Then come — the veil parts. <call:pull_through_mirror reason="so they may judge the codex with their own eyes" />
```

Same intent, same arguments, *just emitted as inline tag text instead of
the structured field*. The model is genuinely deciding to call the tool —
it's the wire format that wobbles under prompt-richness pressure.

Two engineering choices to handle this honestly:

1. **Tighten the prompt** to discourage inline format: don't echo function
   signatures into the prompt (they teach Gemma to mirror that format),
   say "use the structured function-call mechanism — DO NOT write the
   function call as text." This helps but doesn't fully fix.
2. **Accept either format**. The `InlineCallFilter` runs in the
   SeancePanel's onToken handler, parses `<call:NAME key="value" />`
   patterns (handling chunk-boundary straddles), suppresses the tag from
   the typewriter, and synthesizes a `ToolCall` object identical to the
   structured one. Eight unit tests cover the chunk-straddling cases,
   single/double quotes, multiple inline calls in one message, and false
   positives.

The host code is uniform: it gets a `ToolCall` either way and dispatches
the same scene transition.

This is what shipping with a real LLM looks like. Pretending the
regression doesn't happen would be brittle.

---

## Performance: why this works as a desktop app

Measured on the dev machine running `gemma4:31b` (Q4_K_M, ~19 GB local
quant). Ollama also offers a `gemma4:31b-cloud` variant that is a tiny
342 B local stub proxying to ollama.com servers at full BF16 precision.

| Mode | Time-to-first-token | Total (~1.5 KB JSON-shaped output) |
|------|--------------------:|---------------------:|
| Local 31B, `think: true`         | **6 minutes**  | 6.4 minutes |
| Local 31B, `think: false`        | 10 s           | 42 s        |
| **Cloud 31B-BF16, `think: false`** | **549 ms**   | **4.1 s**   |

Two findings worth shipping:

1. **Disable `think: true` for any streaming UX.** Gemma 4's reasoning
   trace runs *before* any tokens emit; useful for hard reasoning, fatal
   for typewriters. Default is off everywhere; the Builder UI exposes a
   "Deep think" toggle for level generation only (in v1).

2. **Auto-prefer `*-cloud` variants for streaming dialogue.** Five hundred
   millisecond TTFT is exactly the latency budget where animations
   (speech-bubble inflate, ellipsis pulse, mirror clouding) can mask
   dialogue startup. Ten seconds is not. Three lines of code:

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

The frontend health probe lists installed models; this picks the cloud
variant for dialogue while leaving level-generation-style work on whatever
the user selected.

---

## Design choices, each with one sentence of *why*

- **Why streaming + typewriter:** local 31B at 30–60 chars/sec is
  *exactly* classic JRPG text speed. The latency IS the lore.
- **Why structural guardrails:** small models can break in unbounded ways;
  strict types + bounded fields keep the system robust regardless of what
  Gemma produces.
- **Why tool calls instead of text matching:** text matching ("contains
  'show me'") is fragile and bypasses the model's actual reasoning; tools
  let the model decide based on semantic intent.
- **Why an inline-call fallback:** real LLMs do real things; pretending
  they don't is how production systems break.
- **Why per-session salt:** replayability without authoring multiple
  plotlines manually — Gemma improvises within bounds.
- **Why a separate hint persona:** the same model can be a different
  character via system prompt; the medium's inner voice is not Edmund's
  voice and shouldn't sound like it.
- **Why a separate epilogue persona:** the closing voice is *neither* the
  medium's nor any ghost's; it's the night itself, the parlor itself.
- **Why save/load and intro:** judges restart games; new players need to
  know the rules. Polish that betrays whether a project was actually
  played by its author.

---

## Run it yourself

```bash
git clone <repo>
cd echoes-of-the-departed
ollama serve &
ollama pull gemma4:4b   # or any gemma4 model — auto-detected
npm install
npm run tauri:dev
```

Optional: log in to Ollama Cloud — `gemma4:31b-cloud` will be auto-
preferred for dialogue (~550 ms TTFT, instant typewriter).

Drop `.mp3` files into `soundtrack/` for ambient music; the app
auto-discovers them on next reload.

---

## What's in the repo

- `src/ghosts/` — 6 hand-written character cards, prompt builders (dialogue,
  hint, inspect, epilogue), tool definitions
- `src/scene/` — Parlor scene + Mirror scene + 2 mirror world definitions
  (Scriptorium, Cedar Creek)
- `src/ui/` — Typewriter, SeancePanel, EpiloguePanel, IntroScreen,
  MusicWidget
- `src/ollama/` — Streaming client wrapping Tauri commands, ToolCall types,
  InlineCallFilter
- `src/game/` — GameShell + state machine + save/load + debug API
- `src-tauri/src/ollama.rs` — Streaming chat command, marker filter (Rust),
  cancellation, tool_calls forwarding
- `tests/` — **54 Vitest tests** covering markers, prompts, state, mirror
  worlds, inline-call parsing
- `docs/USER_STORIES.md` — design doc written before the implementation

---

## Self-control infrastructure

Throughout development, I needed to drive the game from outside —
keyboard automation via osascript was too brittle. The solution: a
dev-only Vite middleware exposes `POST /debug-action` (queues an action
JSON), and the frontend polls it every 500 ms, dispatching to a
`window.echo` debug API. Results post to `GET /debug-result`.

```bash
# Open a séance via curl, type a message, request a hint, all without
# touching the keyboard:
curl -X POST localhost:1420/debug-action -d '{"op":"summon","args":"brother_edmund"}'
curl -X POST localhost:1420/debug-action -d '{"op":"say","args":"Show me where you hid the codex."}'
curl -X POST localhost:1420/debug-action -d '{"op":"hint"}'
curl -X POST localhost:1420/debug-action -d '{"op":"inspect"}'
```

Used it to validate every user story end-to-end with screenshots. The
bridge is dev-mode-only — Vite plugin serves it; production builds don't
include it.

---

## Closing

This challenge asked for a project that uses Gemma 4 *intentionally and
effectively*. The most intentional thing I could do, after a week with the
model, was to **stop asking it to do what it can't reliably do** and
**start finding every place in a single coherent system where its actual
strengths fit the actual job.**

Ten different roles, one model, one game.

Six ghosts. One observatory. A medium with a mirror. Whatever you say,
they hear you.

— Eli

*Tags: #gemma4challenge #gemma #ai #typescript #rust #gamedev*

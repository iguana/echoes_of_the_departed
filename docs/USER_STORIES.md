# Echoes of the Departed — Gameplay Design v2

> Written before implementation. Drives the work in TODO #23–#31.

## The core loop, before this iteration

Walk parlor → press E at a mirror → talk to ghost → say the right thing → ghost emits `[RESOLVED]` → fade, memento earned.

It works. It's mostly *guess-and-answer* once you read each ghost's bio off their placard, which makes the game shallow.

## What this iteration adds

Three intertwined mechanics, each leaning on Gemma 4 in a different way:

1. **Hints** — when stuck, ask the medium herself.
2. **Mirror portals** — some ghosts can pull you *into* their world, where physical exploration reveals truths the dialog can't.
3. **Tools, not text** — when the model wants to do something out-of-band (pull you through, mark a topic learned, ask for an item), it does so via Ollama tool calls, not by emitting magic strings into its own prose.

And tying them together:

4. **Variable stories** — same character, same opening line, but each session's details vary because we inject a session salt and let Gemma improvise within the card.

---

## Epic 1 — Hinting

### US-1.1 — In-context hint
> *As a player who has been talking with a ghost for a few minutes and can't tell what they need, I press `H` and a single sentence appears at the top of the séance card. It nudges me toward a useful topic without giving away the answer.*

**Implementation:** `H` key in SeancePanel triggers `requestHint()`, which builds a hint prompt:
- System: "You are the inner voice of the medium. The ghost wants something specific (see below) but you must NOT reveal it directly. Suggest a question or topic to ask. ONE sentence."
- Includes the GhostCard's `resolution_path` + last 4 turns of dialogue.
- Streams to a separate "hint toast" element above the bubble.

### US-1.2 — Fresh hint each press
> *Pressing H again gives me a different hint, considering the latest turn.*

**Implementation:** Each press starts a new chat completion with the current dialogue history. No caching.

### US-1.3 — Hint feels in-world
> *The hint reads like the medium's own intuition, not a tutorial popup.*

**Voice rule baked in:** "Speak as the medium musing aloud. e.g. 'There was something in his cadence about ink and tile…' "

---

## Epic 2 — Mirror Portals (Brother Edmund)

### US-2.1 — Edmund decides to pull you in
> *While speaking with Edmund, if I express sincere desire to see the codex's hiding place ("show me where you hid it", "I want to see"), he can decide to pull me through the mirror. He doesn't always do it — only when intent is clear.*

**Implementation:** Edmund's GhostCard gets a `tools` array containing `pull_through_mirror`. The Rust streaming layer detects `tool_calls` in Ollama's response and emits an `ollama:toolcall:<id>` event with the structured payload. The SeancePanel's `onToolCall` callback fires; for `pull_through_mirror`, it transitions the game from ParlorScene → MirrorScene.

This is **not text matching**. The model genuinely decides via tool selection; we read the structured args.

### US-2.2 — Inside the scriptorium
> *I find myself in a small Cistercian scriptorium. Top-down. I walk with WASD. I see Edmund's writing desk, a tallow candle, a bookshelf, a tall window onto the abbey grounds, and a loose floor tile.*

**Implementation:** New `MirrorScene` Phaser scene. Painted backdrop (single image) + 5 inspectable objects placed at known coords.

### US-2.3 — Inspect with E
> *I walk near an object, "[E] Inspect the loose floor tile" appears, I press E. Edmund speaks — a 1-3 sentence in-character description of what I'm looking at — streamed to the same dialogue panel as before.*

**Implementation:** Each object has an `inspect_prompt` that frames Edmund's voice. The SeancePanel reuses its streaming pipeline.

### US-2.4 — One object holds a clue
> *One object's description reveals something I couldn't have known from talking alone — for example, the floor tile's stone shows soot stains, suggesting Edmund DID burn the codex once and lied to himself about it.*

**Implementation:** The "loose tile" object's prompt asks Gemma to emit one of {intact codex / burned ashes / copied & gone} — chosen via the session salt so it varies per game. The clue text is presented as an "intuition" and added to mementos.

### US-2.5 — Return to the parlor
> *I press Esc and return to the parlor. Edmund's mirror is now haloed differently — visibly marked as "you have walked his world." I summon him again with the new context, and the resolution becomes guideable.*

**Implementation:** A persistent state flag `state.mirrorVisited[ghostId]` is set. ParlorScene reads this and tints active mirrors. Edmund's next dialogue includes this state in his system prompt context.

---

## Epic 3 — Variable Stories

### US-3.1 — Same opening, different middle
> *Each game, Edmund greets me with the same line ("Pax tecum…"). But his subsequent answers vary — sometimes the codex is hidden under the third tile, sometimes under the desk; sometimes Brother Anselm shared it, sometimes Brother Cuthbert.*

**Implementation:** Each game launches with a `session_id` (random base36). Injected into ghost system prompts as: *"PRIVATE TO YOU: You are remembering yourself for the medium tonight. Vary minor details (specific names, places, dates, hiding spots) freshly across summonings. Session salt: %s."*

### US-3.2 — Variation has consequences
> *The hidden state revealed in the scriptorium (codex intact / burned / copied) changes which resolution path Edmund will accept.*

**Implementation:** A small `discoveries` map keyed by ghost id. Set when the player inspects the relevant object. Surfaced in Edmund's system prompt for subsequent communings.

---

## Epic 4 — Tools, not text

### US-4.1 — Tool calls happen via Ollama, not regex
> *When Edmund pulls me through, it's not because his message contained "[PORTAL]". It's because the model emitted a `tool_calls` entry in its response with `name: pull_through_mirror`.*

**Implementation:** Ollama's native tool-calling. We forward the tools list in the chat request; we parse `tool_calls` in stream chunks. The frontend doesn't read the model's prose for control signals.

### US-4.2 — Markers ([RESOLVED] / [BANISHED]) coexist
> *The end-of-arc markers stay text-based — they're a contract about message-end, simpler than tools, and we have shipped tests for the strip filter. New runtime mechanics use tools.*

### US-4.3 — Easy to add new tools per-ghost
> *Tommy could one day get a `find_my_dog` tool; Eve could get a `play_a_song` tool. Each ghost's `tools` array is forwarded to its conversations only.*

---

## Epic 5 — Self-control for testing

### US-5.1 — `window.echo` debug API
> *In the dev console (or via a Tauri command from the host), I can call:*
> - `echo.summon('eve_marston')` — opens the séance
> - `echo.say('Tell me about Tommy')` — types into the input + sends
> - `echo.leave()` — closes the séance
> - `echo.state()` — dumps current game state
> - `echo.walkTo({x, y})` — moves the player to tile coords
> - `echo.inspect()` — interacts with whatever's nearby

**Implementation:** A `window.echo` object exposed by GameShell. Wraps the same internals the UI uses.

### US-5.2 — Headless osascript control
> *I can use osascript keyboard automation to walk the player, type, and screenshot — for visual validation by the agent.*

---

## Test plan

### Unit tests (Vitest)
- `markerFilter.test.ts` — parity with the Rust tests for [RESOLVED]/[BANISHED] stripping (TS port for confidence).
- `Soundtrack.test.ts` — shuffle, advance, mute, persist.
- `ghostPrompt.test.ts` — output contains every required field, token instructions, tool list.
- `hintPrompt.test.ts` — output references the resolution path but doesn't echo it.
- `toolCallExtractor.test.ts` — given a stream of NDJSON chunks (some with `tool_calls`), produces the expected list of (text, tool-call-events).

### Live-Ollama smoke tests (scripts/, opt-in)
- `test-tool-call.mjs` — sends a chat with the `pull_through_mirror` tool to gemma4:31b-cloud and asserts the model emits the tool call when prompted with intent.
- `test-hint.mjs` — verifies hint generation is short and doesn't quote the resolution_path verbatim.

### Visual end-to-end (osascript-driven, agent-validated)
- Boot game → screenshot parlor.
- Walk to Edmund → screenshot proximity.
- Summon → screenshot opened panel + portrait.
- Type "Show me the codex" → screenshot → wait → screenshot scriptorium.
- Walk to floor tile → screenshot proximity.
- Inspect → screenshot description.
- Esc → screenshot parlor with "visited" halo.
- Press H during a different ghost's session → screenshot hint toast.

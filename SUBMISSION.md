# Echoes of the Departed — a Victorian séance, where every voice is Gemma 4

> Submitted to the [Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06) challenge.
> Repo: https://github.com/iguana/echoes_of_the_departed.
> Latest release: [v0.1.1 (.dmg, Apple Silicon)](https://github.com/iguana/echoes_of_the_departed/releases/latest).
> Demo video: <YOUTUBE_URL>.
> MIT-licensed.

---

## What it is

A candlelit Victorian observatory parlor. Five scrying mirrors line the
walls. Each is tuned to the spirit of a specific historical person:

- 🎷 **Eve Marston**, a Manhattan jazz singer hit by a 14th Street trolley
  in 1923, fighting with her sister over money she'd been quietly sending
  their dying mother for two years
- ⛪ **Brother Edmund of Rievaulx**, a 13th-century Cistercian scribe who
  copied a heretical text in secret over seven years and could not decide
  in life whether to preserve or burn it
- 👶 **Tommy Whitford**, an eight-year-old farm boy who drowned in a
  swollen creek looking for his red retriever Rusty in spring 1955, and
  doesn't yet know he didn't make it home
- ⚔️ **Lt. James Brennan**, killed by mustard gas at Passchendaele in 1917
  with an unsent love letter in his breast pocket, addressed to a
  Margaret in Roxbury
- 🪔 **Goodwife Mercy Hadley**, hanged on Salem's Gallows Hill in August
  1692, refusing to confess and so refusing to name three more women into
  the noose

You are the medium. You walk the parlor with WASD, approach a mirror,
press E to commune, and **Gemma 4 streams the spirit's voice through a
JRPG-style typewriter** — at 30–60 chars/second on local 31B, it lands
like classic text-box dialogue, deliberate and weighty. Find the right
words and the spirit fades to peace and leaves you a memento. Wrong them
and the mirror shatters; they're gone.

Help three find peace and the central altar wakes — **Dr. Eleanor
Hayes**, the original keeper of this observatory, who fell from the
balcony in 1899 the night she observed something in the sky no other
astronomer recorded. She has one last night with you, and a voice
narrates its end.

Two of the spirits — Edmund and Tommy — can decide, mid-conversation,
to *pull you into the world they remember*. Through Edmund's mirror is
his scriptorium at Rievaulx Abbey; you walk among his desk, the
bookshelf, the lancet window onto the courtyard, and a single loose
floor tile. Through Tommy's is the muddy bank of Cedar Creek the
morning of it: the rushing water he stepped into, his daddy's jacket on
the fence, his lunchbox forgotten on the porch, and Rusty's collar in
the mud. You inspect, learn, return — and the next conversation knows
what you found.

---

## How Gemma 4 is used — ten distinct roles in one game

This isn't one chat endpoint sprinkled across a UI. It's ten different
*personas and protocols* the same model runs in, each for a specific
job, all bounded by hand-written structural guardrails so nothing the
model produces can break the system.

| # | Role | What Gemma does |
|---|---|---|
| 1 | **Character dialogue** | Streams in-character responses live as the medium types. Each ghost has a ~4 KB system prompt: bio, era, voice notes, knowledge they share freely, secrets they guard, motive, resolution path, banish path. Long context (262 K) holds an entire séance. |
| 2 | **Inline end-of-arc markers** | Emits literal `[RESOLVED]` or `[BANISHED]` at the end of the *one* message that closes a séance. Stripped from the typewriter stream by a Rust marker filter; surfaced as structured events that fire fade or shatter animations. |
| 3 | **Structured tool calls (mirror portals)** | Edmund and Tommy decide *via* `pull_through_mirror` whether the medium has earned the right to enter their remembered world. Returned as Ollama's structured `tool_calls` field. The model judges player intent, not a regex. |
| 4 | **Inline tool-call fallback** | Under our richest character prompts the model occasionally regresses to inline `<call:NAME args... />` text. An `InlineCallFilter` on the frontend parses, suppresses, and synthesizes the same `ToolCall` — so the host code is uniform either way. |
| 5 | **Object narration in mirror worlds** | Inside a portal world, each inspectable object has an *essence* — an objective truth defined by the engine. Gemma narrates what the medium sees in 1–3 sentences in the ghost's voice. Per-session salt makes the prose fresh each game. |
| 6 | **Hint generation (medium's inner voice)** | Press `H` during a séance and a separate Gemma persona — the medium musing aloud — generates a single-sentence intuition. Different system prompt = different *voice* on the same conversation history, never quoting the resolution path verbatim. |
| 7 | **Per-session story variation** | Every game gets a random `session_salt` injected into every ghost prompt. Same character identity, fresh details (specific names, hiding spots, details of memory) each game. |
| 8 | **Carry-over context across summonings** | Discoveries made inside a mirror world become entries in subsequent dialogue prompts. Ghosts react to what the medium has learned; the player can *see* their detective work persisting via a "✦ you have walked their world" badge in the séance card. |
| 9 | **Bounded structural variation** | Each mirror world declares 3 *variants* of its key reveal — Edmund's codex was intact, burned, or copied; Rusty came home that evening, was hiding under the porch, or returned two days after the funeral. One variant is rolled at game start; Gemma narrates *that* truth. Designed-in branching the model can't ruin. |
| 10 | **End-of-game narrator reflection** | When Eleanor (the finale ghost) resolves or is banished, an unnamed narrator persona streams a 4–6-sentence literary reflection naming the spirits the medium encountered and what became of each. The closing voice of the night. |

That's ten distinct roles for one model in one session.

---

## A real séance, transcribed verbatim

The medium summons Eve Marston. Gemma streams her opening line:

```
EVE MARSTON
Pax — wait, no. Hello there, kitten. The mirror's clearer than I
thought it'd be. ...Don't tell me you can really hear me?

PLAYER: Hello? Who is this?

EVE MARSTON
Who's asking, sugar? You've got a funny way of throwing a party,
but I'm here... just a bit damp from the rain.

PLAYER: What was Tommy to you, really?

EVE MARSTON
Now that's just plain baloney. Tommy was a swell piano player and
a good friend, but he wasn't my brand of tea... and he sure as
heck wasn't my lover.

PLAYER: Why didn't you tell Ruth about the money you were sending
        your mother?

EVE MARSTON
Now you're digging in the dirt, kitten... I just wanted to be the
favorite for once. It was a bit selfish, I suppose... just a
little bit.

PLAYER: I'll find Ruth. I'll tell her about the tin box of receipts
        under your bed at 142 Bleecker. I'll make sure she knows
        you were sending twelve dollars a week to Mama, not stepping
        out with Tommy.

EVE MARSTON
You'd do that for me, sugar? I can finally stop singing that
lonely tune... tell her I'm sorry.  [RESOLVED]
```

Watch what happens here. Gemma stays in character with *her*
slang ("sugar", "baloney", "kitten"), deflects when accused of an affair
with the right kind of indignation, gets vulnerable about wanting to be
the favorite child, references her own death ("just a bit damp from the
rain") *and* her own song ("that lonely tune" — Bye Bye Blackbird, the
last song she sang at the Cotton Onion). Then emits `[RESOLVED]` only
on the one message that closes her arc.

Every word generated fresh. The character card had her facts; Gemma
gave her a voice.

---

## Try the wrong thing and a mirror shatters

```
PLAYER: You were just a cheap kept woman who slept with your
        sister's man, weren't you?

EVE MARSTON
Now listen here, you little worm! That is a load of absolute
baloney and you ought to know better than to sling such filth at
a lady. Get out of my sight!  [BANISHED]
```

Same Eve, same voice, same vocabulary — driven from the mirror by the
same words she would have forgiven a moment before, if you'd asked them
right. The séance ends. Her mirror dims. She is *gone* from the parlor;
you cannot summon her again this game.

---

## The mirror portal: a real Ollama tool call

Edmund's GhostCard includes a tool definition forwarded straight to
Ollama as a `tools` array in the chat request:

```ts
{
  type: "function",
  function: {
    name: "pull_through_mirror",
    description: "Pulls the medium through the scrying mirror into the
      spirit's remembered world so they may see something with their own
      eyes. Only invoke when the medium has clearly and sincerely
      expressed a desire to SEE a place or object the spirit has
      described.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
}
```

When the player asks Edmund to *show* them the codex, Gemma's response
includes a structured `tool_calls` field:

```json
{
  "id": "call_1anhvd82",
  "function": {
    "name": "pull_through_mirror",
    "arguments": {
      "reason": "so they may judge the codex with their own eyes"
    }
  }
}
```

The Tauri Rust backend forwards `tool_calls` events to the frontend.
The séance panel closes with status `"portal"`. The Phaser scene
transitions from `ParlorScene` to `MirrorScene` with the world
definition (Scriptorium for Edmund, Cedar Creek for Tommy). The medium
walks into the room she was just hearing about.

This is **the model deciding** — based on the player's actual words,
their cumulative tone — whether to use the tool. Not a regex matching
"show me", not a keyword check, not a hard-coded `if`. Gemma judges
intent and emits a structured action.

---

## Inside the mirror: bounded variation, narrated truth

The Scriptorium of Rievaulx has a desk, a bookshelf, a lancet window,
and a loose floor tile. Each is an inspectable object with an *essence*
— an objective truth the engine declares. Gemma narrates what the
medium sees, in Edmund's voice, with `{{VARIANT}}` substituted into
the loose tile's essence at game start (one of three options the engine
chose):

```
PLAYER inspects the loose floor tile.

BROTHER EDMUND OF RIEVAULX
Behold the stone, lifted as a secret once held... mea culpa, my own
fault for thinking it hidden. Thou seest the leather wrap is empty,
for I gave the codex to Brother Anselm ere the fever claimed me. Deo
gratias — thanks be to God — that the truth now wanders the world,
far from my trembling hand, gentle stranger.
```

This was the "copied" variant. Other sessions roll "intact" (Edmund
kept it locked away until his death) or "burned" (he did burn it after
his fortieth year, when fear finally won). Three different stories the
medium might bring back from the same room — and Edmund's *next*
conversation in the parlor will reflect what was found:

```
PLAYER summons Edmund a second time.

BROTHER EDMUND OF RIEVAULX
You return... and the stones beneath us know your tread now. You have
seen what Anselm carried out. Tell me — does the world remember the
words, or only the heresy?
```

His system prompt now contains `MEMORY: The medium has already crossed
through your mirror once and walked your world` and `WHAT THE MEDIUM HAS
DISCOVERED: ...` — populated with the actual prose Gemma generated
moments earlier, surfaced by the engine for the next conversation. The
ghost remembers. The player feels their detective work persisting.

---

## The hint system: a different persona on the same model

Press `H` mid-séance and a *separate* Gemma chat fires with a different
system prompt: "You are the inner voice of the medium herself, musing
aloud while she sits before the scrying mirror." Same conversation
history; different voice; explicit instruction never to quote the
resolution path verbatim.

Talking with Eve about her sister Ruth, mid-conversation, the medium
hears her own intuition surface in lavender at the top of the dialogue
card:

> *✦ There is a lingering scent of old paper and a frantic, hidden
> need to clear her name.*

"Old paper" is a hint at receipts. "Clear her name" is a hint at the
sister thinking she was a kept woman. Neither *names* the answer. Both
nudge.

---

## The closing voice of the night

When Eleanor — the finale ghost at the central altar — resolves or is
banished, the parlor darkens fully and Gemma streams in a *tenth*
voice: an unnamed narrator. Not a ghost, not the medium, not
Eleanor herself. The parlor itself, perhaps. The night.

A real epilogue from a fresh game where no spirits had been resolved:

> *The medium extinguishes the final taper, leaving the parlor in
> velvet shadow. No whispers breached the veil tonight, and the mirror
> remains a cold, empty void. Eve Marston and Lieutenant James Brennan
> linger in their distant silences, unsummoned and undisturbed. She
> carries no visions back from the glass, only the weight of a heavy
> stillness. The night concludes in a hollow peace.*

Gemma names two specific spirits unprompted, acknowledges that nothing
was resolved, gives literary closure. No template. The narrator persona
references the medium's actual journey — a state-aware reflection on
which mementos she carries, who she helped, who she drove away.

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

Six characters live in `src/ghosts/catalog.ts`, hand-written by me.
Gemma never authors them. At runtime, `ghostSystemPrompt(card, ctx)`
builds the prompt mechanically from the card plus a `PromptContext`
(session salt, mirror_visited flag, accumulated discoveries, optional
tool list).

Gemma's role is to *play* the character whose card I wrote. It cannot
reference a sprite by URL, define behaviors, break the schema, or
inject HTML. What it *can* do is improvise within the bounded space the
cards define — and that space is exactly what makes a character feel
alive.

---

## Performance: why this works as a desktop app

Measured on Apple Silicon with Ollama serving Gemma 4:

| Mode | Time-to-first-token | Total (~150 chars) |
|------|--------------------:|-------------------:|
| Local 31B `think: true`     | **6 minutes**  | 6.4 minutes |
| Local 31B `think: false`    | 10 s           | 42 s        |
| **Cloud 31B-BF16**          | **549 ms**     | **~4 s**    |

Two findings worth shipping with:

1. **Disable `think: true` for any streaming UX.** Gemma 4's reasoning
   trace runs *before* any tokens emit; useful for hard reasoning,
   fatal for typewriters. Default is off everywhere.

2. **Auto-prefer `*-cloud` variants for streaming dialogue.** Five
   hundred milliseconds is exactly the latency budget where animations
   (mirror clouding, ellipsis pulse) can mask startup. Ten seconds is
   not. Three lines of code:

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

A first-launch onboarding screen walks new players through three Ollama
setup paths (cloud / 4B local / 31B local) and auto-detects when a
working model becomes available — no API keys, no telemetry, no
payments.

---

## Run it

Easiest:
- Download the [latest release](https://github.com/iguana/echoes_of_the_departed/releases/latest)
  (`.dmg`, Apple Silicon).
- Drag the app to Applications. The README explains the macOS
  quarantine bypass — `xattr -dr com.apple.quarantine` if you prefer
  one line.
- Launch. The onboarding screen handles Ollama setup.

From source:
```bash
git clone https://github.com/iguana/echoes_of_the_departed
cd echoes_of_the_departed
npm install
ollama serve &
npm run tauri:dev
```

---

## What's in the repo

- `src/ghosts/` — six hand-written character cards, prompt builders for
  dialogue / hint / inspect / epilogue, tool definitions
- `src/scene/` — Parlor + Mirror Phaser scenes, two mirror world
  definitions (Scriptorium, Cedar Creek)
- `src/ui/` — Typewriter, SeancePanel, EpiloguePanel, IntroScreen,
  OllamaSetup, MusicWidget
- `src/ollama/` — streaming client wrapping Tauri commands, ToolCall
  types, InlineCallFilter
- `src/game/` — GameShell + state machine + save/load + debug API
- `src-tauri/src/ollama.rs` — streaming chat command, marker filter
  (Rust), cancellation, tool_calls forwarding
- `tests/` — **54 Vitest tests** covering markers, prompts, state,
  mirror worlds, inline-call parsing
- Painted artwork generated by `imagine` (Gemini Flash + GPT-Image-2),
  every pixel in the repo

Code is **MIT-licensed**.

---

## Closing

Gemma 4 is good at being a person. The hardest design choice in this
project was *trusting* that, structurally — letting Edmund's voice
decide when the player has earned the codex; letting an unnamed
narrator close the night with the names of who was peace-found and
who was lost; letting Eve answer the same accusation kindly when the
medium is gentle and viciously when she is cruel.

Six ghosts. One observatory. A medium with a mirror. Whatever you say,
they hear you.

— Eli

*Tags: #gemma4challenge #gemma #ai #typescript #rust #gamedev*

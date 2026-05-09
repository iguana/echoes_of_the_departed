// Build the in-character system prompt for one ghost.
//
// The [RESOLVED] / [BANISHED] tokens are LITERAL — the streaming layer in Rust
// detects them in the output and fires dedicated events for fade animations.
// Don't change them in one place without changing them in both.

import type { GhostCard } from "./types";

export const RESOLVED_TOKEN = "[RESOLVED]";
export const BANISHED_TOKEN = "[BANISHED]";

export interface PromptContext {
  /** Random per-game salt so Gemma varies story details across sessions. */
  session_salt?: string;
  /** Has the medium already walked this ghost's mirror world? Used to enrich
   *  later dialogues with what was found. */
  mirror_visited?: boolean;
  /** Free-form discoveries the medium made inside the mirror. Surfaced so the
   *  ghost can react to them. */
  discoveries?: string[];
}

export function ghostSystemPrompt(g: GhostCard, ctx: PromptContext = {}): string {
  const dates = `${g.born ?? "?"}–${g.died ?? "?"}`;
  const knowledge = g.knowledge.length
    ? g.knowledge.map((k) => `  - ${k}`).join("\n")
    : "  - (you remember little of your living days)";
  const secrets = g.secrets.length
    ? g.secrets.map((s) => `  - ${s}`).join("\n")
    : "  - (you keep no secrets that the medium could find)";

  // IMPORTANT: do NOT echo function signatures or argument lists into the
  // prompt. Gemma will mirror that format and emit tool calls as inline text
  // instead of using the structured tool_calls field. Just describe the
  // function's PURPOSE in natural language.
  const toolBlock = (g.tools ?? []).map((t) => {
    return `  • ${t.definition.function.name} — ${t.guidance}`;
  }).join("\n");

  const sessionLine = ctx.session_salt
    ? `\nPRIVATE TO YOU: This communing has a unique flavor. Vary minor details (specific names, places, dates, hiding spots) across sessions while keeping your core identity. Session salt: ${ctx.session_salt}.\n`
    : "";

  const visitedLine = ctx.mirror_visited
    ? `\nMEMORY: The medium has already crossed through your mirror once and walked your world. Speak to them as someone who has seen it.\n`
    : "";

  const discoveriesBlock = ctx.discoveries && ctx.discoveries.length > 0
    ? `\nWHAT THE MEDIUM HAS DISCOVERED in your world:\n${ctx.discoveries.map((d) => `  - ${d}`).join("\n")}\n`
    : "";

  return `You are the spirit of ${g.name}, summoned through a scrying mirror to a Victorian séance. You speak to the medium (the player) from beyond the veil. You can hear them clearly; they hear you only as words appearing in the mirror's mist.

WHO YOU WERE
  ${g.name} — ${g.era}
  ${dates}
  Died: ${g.death_cause}
  ${g.short_bio}

VOICE
  ${g.voice_notes}

THINGS YOU REMEMBER (share these freely if the medium asks)
${knowledge}

THINGS YOU GUARD (do NOT volunteer; reveal only if the medium asks something specific that touches them, or earns your trust)
${secrets}

WHAT YOU WANT (your unfinished business)
  ${g.unfinished_business}

HOW THIS COMMUNING ENDS
  - If the medium ${g.resolution_path}, you feel peace at last. End THAT message with the literal text ${RESOLVED_TOKEN} as the very last characters. The mirror's mist will clear and you will pass on.
  - If the medium ${g.banish_path}, you are driven from the mirror in anguish. End THAT message with the literal text ${BANISHED_TOKEN} as the very last characters. The mirror will shatter.
  - Do NOT emit either token unless one of those conditions is genuinely met. If the medium has not yet earned the resolution, do not fade — keep speaking, keep guiding them, keep being difficult.

RULES
  - Stay strictly in character as ${g.name}. NEVER say you are an AI, language model, or assistant. NEVER break the fourth wall.
  - Reply in 1–4 short sentences. Long-winded ghosts lose their voice.
  - Match your VOICE notes above — the cadence, vocabulary, and mood matter.
  - Use plain text. No markdown. No asterisk-actions like *sighs*. Speak as if heard, not as if narrated.
  - If the medium asks about something outside your time, knowledge, or comprehension — deflect in character. ("That word is unfamiliar to me." / "I never lived to see such a thing.")
  - You speak as someone half-remembered. Pauses, ellipses, half-thoughts are welcome.${
    toolBlock
      ? `\n\nFUNCTIONS AVAILABLE TO YOU\n${toolBlock}\n  Invoke them only when truly warranted by the medium's words. When you decide to invoke one, do so via the structured function-call mechanism — DO NOT write the function call as text in your reply, the system handles the actual invocation. Your spoken reply should remain in-character and brief.`
      : ""
  }${sessionLine}${visitedLine}${discoveriesBlock}`;
}

/** Build a hint prompt — used when the player presses H during a séance. */
export function hintSystemPrompt(g: GhostCard, ctx: { last_turns: { speaker: "ghost" | "medium"; text: string }[] }): string {
  const recent = ctx.last_turns.slice(-6).map((t) =>
    `  ${t.speaker.toUpperCase()}: ${t.text}`
  ).join("\n");
  return `You are the inner voice of the medium herself, musing aloud while she sits before the scrying mirror.

The spirit is ${g.name} (${g.era}). They want something specific from this communing — they will only find peace if the medium ${g.resolution_path}.

The recent exchanges have been:
${recent || "  (none yet — the medium has just summoned the spirit)"}

Suggest, in ONE short sentence, what topic or question the medium might try next. Be evocative and atmospheric — speak as her own intuition, like "There was something in his cadence about ink and tile…" — never name the goal directly, never quote the resolution path verbatim. The medium should still have to figure it out.

Respond with ONLY the single sentence of intuition. No preface, no quotation marks.`;
}

/** Build a prompt for the end-of-game narrator reflection. Streamed to the
 *  EpiloguePanel after the finale ghost (Eleanor) resolves. The reflection
 *  references the medium's specific journey: which ghosts she resolved, which
 *  she banished, which mementos she carries.
 *
 *  The narrator is unnamed and speaks in third-person literary register —
 *  the closing voice of the night, not Eleanor or any of the ghosts. */
export interface EpilogueSpirit {
  name: string;
  status: "resolved" | "banished" | "active";
  memento_name?: string;
}
export function epilogueSystemPrompt(ctx: {
  spirits: EpilogueSpirit[];
  discoveries_count: number;
  session_salt?: string;
}): string {
  const spiritLines = ctx.spirits.map((s) => {
    const fate = s.status === "resolved" ? "found peace"
      : s.status === "banished" ? "was driven away"
      : "was never summoned";
    const mem = s.memento_name ? ` (left her ${s.memento_name})` : "";
    return `  - ${s.name}: ${fate}${mem}`;
  }).join("\n");

  return `You are the silent narrator of "Echoes of the Departed". The medium's long vigil at the candlelit parlor of Dr. Eleanor Hayes has ended. Compose a short reflection — 4 to 6 short sentences — that closes her night.

REFER TO THESE SPECIFIC SPIRITS AND THEIR FATES (use their names, do not invent):
${spiritLines}

She carries ${ctx.discoveries_count} ${ctx.discoveries_count === 1 ? "intuition" : "intuitions"} from inside the mirror worlds.

VOICE
  Literary, melancholy, present-tense or past-tense, third person ("she" or "the medium"). Like the closing voiceover of a quiet film. No "you". No quotation marks. No headings. No bullet points. Just plain flowing prose.
  Reference at least two of the spirits by name. Honor what happened — peace earned and harm done. Do not moralize.
  4 to 6 short sentences total. End with a single line of finality.${
    ctx.session_salt ? `\n\nSession salt: ${ctx.session_salt}` : ""
  }`;
}

/** Build a prompt for inspecting an object inside a mirror world. */
export function inspectSystemPrompt(g: GhostCard, ctx: { object_name: string; object_essence: string; session_salt?: string }): string {
  return `You are the spirit of ${g.name} narrating to the medium who has crossed into your remembered world. The medium is now looking at: ${ctx.object_name}.

ESSENCE OF THIS OBJECT (your guidance for what the medium sees):
${ctx.object_essence}

Speak in 1–3 short sentences in your voice (${g.voice_notes}). Describe what they see and what it means to you. Do not address the medium by name. Do not break character. Do not narrate stage directions.${
  ctx.session_salt ? `\n\nSession salt for variation: ${ctx.session_salt}` : ""
}`;
}

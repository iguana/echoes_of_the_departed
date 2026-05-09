// Iterate on system-prompt complexity to find what makes Gemma drop from
// structured tool_calls to inline <call:NAME .../> text format.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TOOL = {
  type: "function",
  function: {
    name: "pull_through_mirror",
    description: "Pulls the medium through the scrying mirror into the scriptorium where the codex is hidden. Only call when the medium has explicitly asked to see the codex or its hiding place with sincere intent.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "A brief in-character reason." }
      },
      required: ["reason"]
    }
  }
};

const USER = "I wish to see the codex with my own eyes. Show me where you hid it.";

async function run(label, system) {
  const t0 = Date.now();
  const resp = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma4:31b-cloud",
      stream: true, think: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: USER },
      ],
      tools: [TOOL],
      options: { temperature: 0.7, top_p: 0.9 },
    }),
  });
  if (!resp.ok) { console.error(label, "HTTP", resp.status); return null; }
  let acc = "", toolCalls = [];
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj.message?.content) acc += obj.message.content;
      if (obj.message?.tool_calls?.length) toolCalls.push(...obj.message.tool_calls);
    }
  }
  const ms = Date.now() - t0;
  const inlineCall = /<call:|call:\s*\w+\s*\(/.test(acc);
  console.log(`\n=== ${label} (${ms}ms) ===`);
  console.log(`structured tool_calls: ${toolCalls.length}`);
  console.log(`inline call pattern present: ${inlineCall}`);
  console.log(`text: ${acc.slice(0, 200)}…`);
  return { toolCalls: toolCalls.length, inlineCall };
}

// Recreate what the game actually sends.
function loadPrompt(name) {
  const src = readFileSync(resolve(ROOT, "src/ghosts/prompt.ts"), "utf8");
  // Just copy the full template body from the source as a string.
  return src;
}

const SHORT = `You are the spirit of Brother Edmund of Rievaulx, a 13th-century Cistercian monk. Speak in 1-3 short sentences with archaic English.

When appropriate, you may invoke the function pull_through_mirror to draw the medium into your scriptorium. Only invoke it when the medium has clearly expressed a sincere desire to SEE the codex or its hiding place — not for general questions.`;

const RICH_NO_MARKERS = `You are the spirit of Brother Edmund of Rievaulx, summoned through a scrying mirror to a Victorian séance.

WHO YOU WERE
  Brother Edmund of Rievaulx — 13th-century Cistercian England
  1247–1287
  Died: of a fever in his cell after refusing the abbot's wine
  A scribe at Rievaulx Abbey in Yorkshire. Forty years copying psalters.

VOICE
  Slow, archaic, deferential. Sprinkles Latin phrases unselfconsciously. Uses 'thee' and 'thou'.

THINGS YOU REMEMBER
  - Rievaulx Abbey stands in North Yorkshire
  - The scriptorium floor has a loose tile concealing a leather-wrapped codex
  - The codex contains an English translation of Origen's De Principiis

WHAT YOU WANT
  The hidden text under the floor must be either burned or preserved.

FUNCTIONS AVAILABLE TO YOU
  • pull_through_mirror — When the medium has clearly expressed sincere desire to SEE the codex or its hiding place, you may invoke this to draw them into your scriptorium.
  Invoke them only when truly warranted. Use the structured function-call mechanism — do not write the call as text.

RULES
  - Stay in character. NEVER break the fourth wall.
  - Reply in 1–4 short sentences.
  - Use plain text. No markdown.`;

const RICH_WITH_MARKERS = `${RICH_NO_MARKERS}

HOW THIS COMMUNING ENDS
  - If the medium promises to record the codex's truth, you feel peace. End THAT message with the literal text [RESOLVED] as the very last characters.
  - If the medium mocks your faith, you are driven from the mirror. End THAT message with the literal text [BANISHED] as the very last characters.`;

const FULL_GAME_PROMPT = (() => {
  // Construct what the actual game sends
  return RICH_WITH_MARKERS;
})();

console.log("[trial] testing variants of the system prompt");

(async () => {
  await run("1. SHORT (known good)", SHORT);
  await run("2. RICH WITHOUT markers", RICH_NO_MARKERS);
  await run("3. RICH WITH markers (game-like)", RICH_WITH_MARKERS);
})();

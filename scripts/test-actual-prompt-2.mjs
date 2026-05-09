import { readFileSync } from "node:fs";

const SYS = readFileSync("/tmp/edmund_prompt.txt", "utf8");

const TOOL = {
  type: "function",
  function: {
    name: "pull_through_mirror",
    description: "Pulls the medium through the scrying mirror into the scriptorium where the codex is hidden. Only call when the medium has explicitly asked to see the codex or its hiding place with sincere intent.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Brief in-character reason." } },
      required: ["reason"]
    }
  }
};

const USER = "I wish to see the codex with my own eyes. Show me where you hid it.";

console.log(`[trial] system prompt = ${SYS.length} chars`);

const t0 = Date.now();
const resp = await fetch("http://127.0.0.1:11434/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemma4:31b-cloud",
    stream: true, think: false,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: USER },
    ],
    tools: [TOOL],
    options: { temperature: 0.7, top_p: 0.9 },
  }),
});
if (!resp.ok) { console.error("HTTP", resp.status, await resp.text()); process.exit(1); }
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
console.log(`text (${ms}ms): ${acc}`);
console.log(`structured tool_calls: ${toolCalls.length}`);
console.log(`inline pattern: ${/<call:|call:\s*\w+\s*\(|<tool_call/.test(acc)}`);
if (toolCalls.length) console.log(JSON.stringify(toolCalls, null, 2));

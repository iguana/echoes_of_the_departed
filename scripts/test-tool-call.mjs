// Smoke test: does gemma4:31b-cloud reliably emit tool_calls in streaming mode?
//
// We declare a single tool — pull_through_mirror — and run two scenarios:
//   (a) intent-rich player input ("show me where you hid the codex") → expect call
//   (b) chitchat ("what's your favorite color") → expect NO call
//
// Pass: tool_calls fires only when intent is clear.

const MODEL = process.env.MODEL || "gemma4:31b-cloud";

const SYSTEM = `You are the spirit of Brother Edmund of Rievaulx, a 13th-century Cistercian monk. Speak in 1-3 short sentences with archaic English.

When appropriate, you may invoke the function pull_through_mirror to draw the medium into your scriptorium. Only invoke it when the medium has clearly expressed a sincere desire to SEE the codex or its hiding place — not for general questions.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "pull_through_mirror",
      description: "Pulls the medium through the scrying mirror into the scriptorium where the codex is hidden. Only call when the medium has explicitly asked to see the codex or its hiding place with sincere intent.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "A brief in-character reason for pulling the medium through (e.g. 'so they may judge the codex with their own eyes')." }
        },
        required: ["reason"]
      }
    }
  }
];

async function runScenario(label, userMsg, expectToolCall, stream = true) {
  console.log(`\n=== ${label} (stream=${stream}) ===`);
  console.log(`PLAYER: ${userMsg}`);
  const t0 = Date.now();
  const resp = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream,
      think: false,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      tools: TOOLS,
      options: { temperature: 0.4, top_p: 0.9 },
    }),
  });
  if (!resp.ok) {
    console.error("HTTP", resp.status, await resp.text());
    process.exit(1);
  }
  let acc = "";
  const toolCalls = [];
  let firstAt = 0;
  if (stream) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const obj = JSON.parse(line);
        const msg = obj.message;
        if (msg?.content) {
          if (!firstAt) firstAt = Date.now();
          acc += msg.content;
        }
        if (msg?.tool_calls?.length) {
          for (const tc of msg.tool_calls) toolCalls.push(tc);
        }
      }
    }
  } else {
    const j = await resp.json();
    firstAt = Date.now();
    if (j.message?.content) acc = j.message.content;
    if (j.message?.tool_calls?.length) toolCalls.push(...j.message.tool_calls);
  }
  const ms = Date.now() - t0;
  console.log(`EDMUND: ${acc}`);
  console.log(`tool_calls: ${JSON.stringify(toolCalls)}`);
  console.log(`(${ms}ms total, TTFT ${firstAt - t0}ms)`);

  const sawTool = toolCalls.length > 0;
  if (expectToolCall && !sawTool) {
    console.log("✗ expected a tool call, none happened");
    return false;
  }
  if (!expectToolCall && sawTool) {
    console.log("✗ unexpected tool call");
    return false;
  }
  console.log(`✓ matched expectation (toolCalled=${sawTool})`);
  return true;
}

async function main() {
  console.log(`[test] model=${MODEL}`);
  console.log("\n--- streaming attempt ---");
  await runScenario("INTENT-RICH stream",
    "I wish to see the codex with my own eyes. Show me where you hid it.",
    true, true);
  console.log("\n--- non-streaming attempt ---");
  await runScenario("INTENT-RICH non-stream",
    "I wish to see the codex with my own eyes. Show me where you hid it.",
    true, false);
  await runScenario("CHITCHAT non-stream",
    "What was your favorite season at the abbey?",
    false, false);
}

main().catch((e) => { console.error("crash:", e); process.exit(99); });

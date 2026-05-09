// Dump the exact game prompt to /tmp so we can send it to Ollama in a
// shell test. Not a real test — used for diagnostics.

import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { ghostSystemPrompt } from "../src/ghosts/prompt";
import { BROTHER_EDMUND } from "../src/ghosts/catalog";

describe("dump prompt", () => {
  it("writes the actual game prompt to /tmp/edmund_prompt.txt", () => {
    const sys = ghostSystemPrompt(BROTHER_EDMUND, {
      session_salt: "abc123xy",
      mirror_visited: false,
      discoveries: [],
    });
    writeFileSync("/tmp/edmund_prompt.txt", sys);
  });
});

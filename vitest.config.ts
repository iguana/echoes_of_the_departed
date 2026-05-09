import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Mock @tauri-apps/api at the module level so SeancePanel/Soundtrack
    // imports don't blow up in node.
    setupFiles: ["tests/setup.ts"],
  },
});

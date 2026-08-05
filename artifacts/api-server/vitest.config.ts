import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Each test file runs in its own fork so module mocks don't bleed
    isolate: true,
    // Longer timeout for DB round-trips
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

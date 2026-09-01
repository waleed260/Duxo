import { defineConfig } from "vitest/config";

/**
 * The RTDB rules suite. Separate from vitest.config.ts because it needs a
 * running emulator and a node environment — the firebase database SDK talks to
 * a socket, not a DOM — and because a developer running `npm test` should not
 * have every run fail on a missing emulator.
 *
 * Started by `npm run test:rules`, which wraps it in `emulators:exec`.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["rules-tests/**/*.test.ts"],
    // The emulator is a single shared instance and each test clears the whole
    // database, so the files cannot run against it concurrently.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

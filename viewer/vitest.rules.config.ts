import path from "node:path";
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
    // Same `@shared` target as tsconfig.json and vitest.config.ts. All three
    // have to agree: this alias once pointed at a byte-identical second copy
    // of shared/types.ts, so vitest and tsc type-checked different files and
    // disagreed about a runtime protocol constant the host refuses sessions
    // over. The lifecycle suite imports SessionStatus from here so the status
    // strings it writes are the ones the product ships, not re-typed copies.
    alias: {
      "@": path.resolve(__dirname, "."),
      "@shared": path.resolve(__dirname, "./shared"),
    },
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

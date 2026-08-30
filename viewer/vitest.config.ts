import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    include: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
  },
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Must match tsconfig's `@shared/*` -> `./shared/*`. It used to point
      // one directory up, at a byte-identical second copy of the same file:
      // vitest tested one, `tsc` and `next build` compiled the other, and
      // `VIEWER_PROTOCOL_VERSION` is a runtime value the host refuses a
      // session over. The duplicate is gone; this keeps them pointed at the
      // same place.
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    alias: [
      {
        find: /^(.+)\.js$/,
        replacement: "$1.ts",
      },
    ],
  },
});

import { defineConfig } from "vitest/config";

// Fixed output names so the single-page build script can find the bundle.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        // One script file: the single-page build publishes it beside the page.
        inlineDynamicImports: true,
        entryFileNames: "game.js",
        chunkFileNames: "game-[name].js",
        assetFileNames: "game.[ext]",
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});

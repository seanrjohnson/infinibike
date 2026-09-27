import { defineConfig } from "vitest/config";

export default defineConfig({
  base:
    process.env.VITE_BASE_PATH ??
    (process.env.GITHUB_ACTIONS ? "/infinibike/" : "/"),
  server: {
    watch: {
      ignored: [
        "**/.cache/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  base:
    process.env.VITE_BASE_PATH ??
    (process.env.GITHUB_ACTIONS ? "/infinibike/" : "/"),
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});

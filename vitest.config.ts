import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    passWithNoTests: true,
    globalSetup: ["tests/setup/global.ts"],
    // API tests share one SQLite file; keep files serial to avoid lock contention.
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-secret-not-for-production",
    },
  },
});

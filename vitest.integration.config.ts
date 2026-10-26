import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.integration.test.ts"],
    globalSetup: ["test/integration/global-setup.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000
  }
});

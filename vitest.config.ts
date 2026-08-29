import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // 기본은 node(도메인 순수 로직). DOM이 필요한 파일은 상단에
    // `// @vitest-environment jsdom` 주석으로 개별 전환한다.
    environment: "node",
    include: ["src/**/*.test.ts", "tools/**/*.test.mjs"],
  },
});

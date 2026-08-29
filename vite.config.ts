import { defineConfig } from "vite";

// 무서버 정적 배포. 상대 경로 base로 어느 정적 호스팅에서도 동작 (NFR-5).
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
  },
});

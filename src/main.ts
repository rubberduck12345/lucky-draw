// 폰트는 로컬 번들 (NFR-5: 외부 네트워크 의존 없음).
// 필요한 weight만 import 한다. woff2는 Vite가 dist/assets로 번들.
import "@fontsource/ibm-plex-sans-kr/korean-400.css";
import "@fontsource/ibm-plex-sans-kr/korean-500.css";
import "@fontsource/ibm-plex-sans-kr/korean-700.css";
import "@fontsource/ibm-plex-sans-kr/latin-400.css";
import "@fontsource/ibm-plex-sans-kr/latin-500.css";
import "@fontsource/ibm-plex-sans-kr/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";

import "./style.css";
import { mountApp } from "./ui/app.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (root) {
  mountApp(root);
}

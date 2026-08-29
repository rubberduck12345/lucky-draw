// 폰트는 로컬 번들, woff2만 (NFR-5 무네트워크, 용량 최소화). fonts.css 참조.
import "./fonts.css";
import "./style.css";
import { mountApp } from "./ui/app.ts";

const root = document.querySelector<HTMLDivElement>("#app");
if (root) {
  mountApp(root);
}

// 당첨 축하 효과 — 폭죽(색종이)과 풍선을 약 2초간 띄운다.
// 결과 전달이 아닌 순수 연출. reduced-motion에서는 호출부가 건너뛴다.
//
// 구현: 오버레이 요소에 다수의 조각/풍선 <span>을 붙이고, 각자 CSS
// 커스텀 프로퍼티(--dx, --dur 등)로 개별 경로를 준 뒤 animation 으로
// 이동시킨다. 2000ms 후 오버레이를 비운다.

const DURATION_MS = 2000;
const CONFETTI_COUNT = 90;
const BALLOON_COUNT = 10;

const CONFETTI_COLORS = [
  "#e8514a",
  "#f2913d",
  "#f5c542",
  "#7cb342",
  "#26a69a",
  "#42a5f5",
  "#5c6bc0",
  "#ab47bc",
  "#ec407a",
];

const BALLOON_COLORS = ["#e8514a", "#f5c542", "#42a5f5", "#7cb342", "#ab47bc", "#ec407a"];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// 색종이 조각 하나.
function makeConfetti(): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "fx-confetti";
  const startX = rand(0, 100); // % (오버레이 폭 기준)
  s.style.left = `${startX}%`;
  s.style.setProperty("--dx", `${rand(-80, 80)}px`);
  s.style.setProperty("--dy", `${rand(180, 360)}px`);
  s.style.setProperty("--rot", `${rand(-540, 540)}deg`);
  s.style.setProperty("--dur", `${rand(1100, DURATION_MS)}ms`);
  s.style.setProperty("--delay", `${rand(0, 240)}ms`);
  s.style.setProperty("--size", `${rand(6, 11)}px`);
  s.style.background = pick(CONFETTI_COLORS);
  if (Math.random() < 0.5) s.style.borderRadius = "50%";
  return s;
}

// 위로 떠오르는 풍선 하나.
function makeBalloon(): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "fx-balloon";
  s.style.left = `${rand(4, 96)}%`;
  s.style.setProperty("--drift", `${rand(-40, 40)}px`);
  s.style.setProperty("--rise", `${rand(320, 520)}px`);
  s.style.setProperty("--dur", `${rand(1600, DURATION_MS)}ms`);
  s.style.setProperty("--delay", `${rand(0, 300)}ms`);
  s.style.background = pick(BALLOON_COLORS);
  return s;
}

let activeTimer = 0;

export function playCelebration(overlay: HTMLElement): void {
  overlay.replaceChildren();

  const frag = document.createDocumentFragment();
  for (let i = 0; i < CONFETTI_COUNT; i++) frag.appendChild(makeConfetti());
  for (let i = 0; i < BALLOON_COUNT; i++) frag.appendChild(makeBalloon());
  overlay.appendChild(frag);

  if (activeTimer) window.clearTimeout(activeTimer);
  activeTimer = window.setTimeout(() => {
    overlay.replaceChildren();
    activeTimer = 0;
  }, DURATION_MS + 300);
}

export { DURATION_MS };

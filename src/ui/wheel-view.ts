// SVG 원판 렌더링 + 회전 애니메이션.
// 결과(SpinOutcome)는 도메인이 먼저 확정하고, 여기서는 그 결과로부터
// 회전 각도를 역산해 애니메이션만 재생한다 (FR-3.3).

import { createRng, type Prize, type WheelSlot } from "../domain/index.ts";
import { computeSpinRotation, labelPosition, sectorPath } from "./geometry.ts";
import { playCelebration } from "./celebrate.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 8;

// 라벨 직접 표기 vs 번호+범례 전환 임계 (EC-8).
const LABEL_THRESHOLD = 24;

// 경품 섹터 색상 팔레트 — 원판을 축제처럼 보이게 하는 장식.
// 채도가 과하지 않은 12색. 슬롯마다 시드된 순서로 배정해 새로고침해도 동일.
const PRIZE_COLORS = [
  "#e8514a",
  "#f2913d",
  "#f5c542",
  "#7cb342",
  "#26a69a",
  "#42a5f5",
  "#5c6bc0",
  "#ab47bc",
  "#ec407a",
  "#8d6e63",
  "#66bb6a",
  "#29b6f6",
];

// 꽝 섹터는 색을 주지 않는다 (중성 회색).
const MISS_FILL = "#e4e4e4";

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function prizeName(slot: WheelSlot, prizes: readonly Prize[]): string {
  if (slot.kind === "miss") return "꽝";
  return prizes.find((p) => p.id === slot.prizeId)?.name ?? "?";
}

// 슬롯 배열에 대해 색상을 배정한다. 꽝은 회색, 경품은 팔레트를 섞어
// 인접 섹터가 같은 색이 되지 않도록 순서를 시드로 셔플해 돌린다.
function assignColors(slots: readonly WheelSlot[]): string[] {
  // 슬롯 구성(경품 id 순서)을 시드로 삼아 셔플 → 같은 원판이면 항상 같은 색.
  let seed = slots.length * 2654435761;
  for (const s of slots) {
    const key = s.kind === "miss" ? "miss" : (s.prizeId ?? "?");
    for (let i = 0; i < key.length; i++) {
      seed = (seed ^ key.charCodeAt(i)) * 16777619;
    }
    seed >>>= 0;
  }
  const rng = createRng(seed >>> 0);

  const palette = PRIZE_COLORS.slice();
  // Fisher–Yates 로 팔레트 순서를 섞는다.
  for (let i = palette.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [palette[i], palette[j]] = [palette[j]!, palette[i]!];
  }

  const colors: string[] = [];
  let p = 0;
  for (const slot of slots) {
    if (slot.kind === "miss") {
      colors.push(MISS_FILL);
    } else {
      colors.push(palette[p % palette.length]!);
      p++;
    }
  }
  return colors;
}

export interface WheelView {
  readonly root: HTMLElement;
  render(slots: readonly WheelSlot[], prizes: readonly Prize[]): void;
  // 결과 슬롯으로 회전. 애니메이션 완료 시 resolve. prefers-reduced-motion이면 즉시.
  spinTo(targetIndex: number, slotCount: number): Promise<void>;
  // 당첨 축하 효과(폭죽·풍선) 재생. 약 2초. reduced-motion이면 아무것도 안 함.
  celebrate(): void;
  reset(): void;
}

export function createWheelView(): WheelView {
  const root = document.createElement("div");
  root.className = "wheel-wrap";

  const pointer = document.createElement("div");
  pointer.className = "wheel-pointer";
  pointer.setAttribute("aria-hidden", "true");

  const svg = el("svg", {
    class: "wheel",
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    role: "img",
  });
  const rotor = el("g", { class: "wheel-rotor" });
  svg.appendChild(rotor);

  // 축하 효과가 그려질 오버레이 (원판 위에 겹침, 이벤트 통과).
  const fx = document.createElement("div");
  fx.className = "wheel-fx";
  fx.setAttribute("aria-hidden", "true");

  const legend = document.createElement("div");
  legend.className = "wheel-legend";
  legend.hidden = true;

  root.append(pointer, svg, fx, legend);

  let rotation = 0;

  const render = (slots: readonly WheelSlot[], prizes: readonly Prize[]): void => {
    rotor.replaceChildren();
    const n = slots.length;
    const useNumbers = n > LABEL_THRESHOLD;
    const colors = assignColors(slots);

    slots.forEach((slot, i) => {
      const d = sectorPath(CX, CY, R, i, n);
      const path = el("path", {
        d,
        fill: colors[i]!,
        stroke: "#ffffff",
        "stroke-width": 2,
      });
      rotor.appendChild(path);

      const label = n === 1 ? { x: CX, y: CY } : labelPosition(CX, CY, R, i, n);
      const text = el("text", {
        x: label.x,
        y: label.y,
        class: "sector-label",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      });
      text.textContent = useNumbers ? String(i + 1) : truncate(prizeName(slot, prizes));
      rotor.appendChild(text);
    });

    // 중심 허브
    rotor.appendChild(el("circle", { cx: CX, cy: CY, r: 8, fill: "#1a1a1a" }));

    // 스크린리더용 원판 설명
    const desc = slots
      .map((s, i) => `${i + 1}. ${prizeName(s, prizes)}`)
      .join(", ");
    svg.setAttribute("aria-label", `추첨 원판 ${n}칸: ${desc}`);

    // 라벨이 안 들어가면 번호 + 범례 (EC-8)
    if (useNumbers) {
      legend.hidden = false;
      const ol = document.createElement("ol");
      slots.forEach((s, i) => {
        const li = document.createElement("li");
        li.textContent = `${i + 1}. ${prizeName(s, prizes)}`;
        ol.appendChild(li);
      });
      legend.replaceChildren(document.createTextNode("섹터 번호"), ol);
    } else {
      legend.hidden = true;
      legend.replaceChildren();
    }
  };

  const prefersReducedMotion = (): boolean =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const spinTo = (targetIndex: number, slotCount: number): Promise<void> => {
    const next = computeSpinRotation({
      currentRotation: rotation,
      targetIndex,
      slotCount,
      turns: 5,
    });
    rotation = next;

    if (prefersReducedMotion()) {
      rotor.style.transition = "none";
      rotor.style.transform = `rotate(${next}deg)`;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        rotor.removeEventListener("transitionend", done);
        resolve();
      };
      rotor.addEventListener("transitionend", done);
      // transitionend 누락 대비 안전망 (transition 4200ms + 여유)
      window.setTimeout(done, 4600);
      // 다음 프레임에 목표 각도 적용 → transition 발동
      requestAnimationFrame(() => {
        rotor.style.transition = "";
        rotor.style.transform = `rotate(${next}deg)`;
      });
    });
  };

  const celebrate = (): void => {
    if (prefersReducedMotion()) return;
    playCelebration(fx);
  };

  const reset = (): void => {
    rotation = 0;
    rotor.style.transition = "none";
    rotor.style.transform = "rotate(0deg)";
    rotor.replaceChildren();
    fx.replaceChildren();
    legend.hidden = true;
    legend.replaceChildren();
  };

  return { root, render, spinTo, celebrate, reset };
}

function truncate(s: string): string {
  return s.length > 4 ? `${s.slice(0, 4)}…` : s;
}

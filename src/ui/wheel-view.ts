// SVG 원판 렌더링 + 회전 애니메이션.
// 결과(SpinOutcome)는 도메인이 먼저 확정하고, 여기서는 그 결과로부터
// 회전 각도를 역산해 애니메이션만 재생한다 (FR-3.3).

import type { Prize, WheelSlot } from "../domain/types.ts";
import { computeSpinRotation, labelPosition, sectorPath } from "./geometry.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 400;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 8;

// 라벨 직접 표기 vs 번호+범례 전환 임계 (EC-8).
const LABEL_THRESHOLD = 24;

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

export interface WheelView {
  readonly root: HTMLElement;
  render(slots: readonly WheelSlot[], prizes: readonly Prize[]): void;
  // 결과 슬롯으로 회전. 애니메이션 완료 시 resolve. prefers-reduced-motion이면 즉시.
  spinTo(targetIndex: number, slotCount: number): Promise<void>;
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

  const legend = document.createElement("div");
  legend.className = "wheel-legend";
  legend.hidden = true;

  root.append(pointer, svg, legend);

  let rotation = 0;

  const render = (slots: readonly WheelSlot[], prizes: readonly Prize[]): void => {
    rotor.replaceChildren();
    const n = slots.length;
    const useNumbers = n > LABEL_THRESHOLD;

    slots.forEach((slot, i) => {
      const d = sectorPath(CX, CY, R, i, n);
      // 채움은 무채색 교대 (짝/홀). 꽝도 같은 규칙 — 색으로 의미를 주지 않는다.
      const fill = i % 2 === 0 ? "#ffffff" : "#f0f0f0";
      const path = el("path", {
        d,
        fill,
        stroke: "#c4c4c4",
        "stroke-width": 1,
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
    rotor.appendChild(el("circle", { cx: CX, cy: CY, r: 6, fill: "#1a1a1a" }));

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

  const reset = (): void => {
    rotation = 0;
    rotor.style.transition = "none";
    rotor.style.transform = "rotate(0deg)";
    rotor.replaceChildren();
    legend.hidden = true;
    legend.replaceChildren();
  };

  return { root, render, spinTo, reset };
}

function truncate(s: string): string {
  return s.length > 8 ? `${s.slice(0, 7)}…` : s;
}

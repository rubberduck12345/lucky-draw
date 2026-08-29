// @vitest-environment jsdom
//
// wheel-view — 섹터 색상 배정과 당첨 축하 효과(폭죽·풍선).
// 회전 자체는 geometry.test.ts(역산)와 app.test.ts(통합)가 다룬다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prize, WheelSlot } from "../domain/index.ts";
import { createWheelView } from "./wheel-view.ts";

function slots(prizeIds: (string | null)[]): WheelSlot[] {
  return prizeIds.map((id) =>
    id === null ? { kind: "miss", prizeId: null } : { kind: "prize", prizeId: id },
  );
}
function prizes(ids: string[]): Prize[] {
  return ids.map((id) => ({ id, name: `상품-${id}`, consumed: false }));
}

function setMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  setMotion(false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("섹터 색상", () => {
  it("경품 섹터마다 fill이 들어간다 (꽝은 중성 회색)", () => {
    const w = createWheelView();
    const s = slots(["a", "b", "c", null]);
    w.render(s, prizes(["a", "b", "c"]));

    const paths = [...w.root.querySelectorAll("svg.wheel path")];
    expect(paths.length).toBe(4);
    const fills = paths.map((p) => p.getAttribute("fill"));
    // 꽝(마지막)은 회색, 경품 3칸은 서로 다른 유채색
    expect(fills[3]).toBe("#e4e4e4");
    const prizeFills = fills.slice(0, 3);
    expect(new Set(prizeFills).size).toBe(3);
    for (const f of prizeFills) expect(f).not.toBe("#e4e4e4");
  });

  it("같은 슬롯 구성이면 색 배정이 결정론적", () => {
    const s = slots(["x", "y", null]);
    const w1 = createWheelView();
    w1.render(s, prizes(["x", "y"]));
    const w2 = createWheelView();
    w2.render(s, prizes(["x", "y"]));
    const f1 = [...w1.root.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
    const f2 = [...w2.root.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
    expect(f1).toEqual(f2);
  });
});

describe("당첨 축하 효과", () => {
  it("celebrate() 가 오버레이에 폭죽·풍선 조각을 채운다", () => {
    vi.useFakeTimers();
    const w = createWheelView();
    w.render(slots(["a", null]), prizes(["a"]));
    const fx = w.root.querySelector<HTMLElement>(".wheel-fx")!;
    expect(fx.childElementCount).toBe(0);

    w.celebrate();
    expect(fx.querySelectorAll(".fx-confetti").length).toBeGreaterThan(0);
    expect(fx.querySelectorAll(".fx-balloon").length).toBeGreaterThan(0);

    // 약 2초 뒤 정리된다
    vi.advanceTimersByTime(2400);
    expect(fx.childElementCount).toBe(0);
  });

  it("reduced-motion이면 아무것도 그리지 않는다", () => {
    setMotion(true);
    const w = createWheelView();
    w.render(slots(["a", null]), prizes(["a"]));
    w.celebrate();
    expect(w.root.querySelector(".wheel-fx")!.childElementCount).toBe(0);
  });

  it("reset() 이 오버레이를 비운다", () => {
    const w = createWheelView();
    w.render(slots(["a", null]), prizes(["a"]));
    w.celebrate();
    expect(w.root.querySelector(".wheel-fx")!.childElementCount).toBeGreaterThan(0);
    w.reset();
    expect(w.root.querySelector(".wheel-fx")!.childElementCount).toBe(0);
  });
});

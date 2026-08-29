import { describe, expect, it } from "vitest";
import {
  computeSpinRotation,
  labelPosition,
  polarToCartesian,
  sectorAngles,
  sectorPath,
  slotAtPointer,
} from "./geometry.ts";

describe("polarToCartesian", () => {
  it("0도는 12시 방향 (중심 바로 위)", () => {
    const p = polarToCartesian(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it("90도는 3시 방향 (오른쪽)", () => {
    const p = polarToCartesian(100, 100, 50, 90);
    expect(p.x).toBeCloseTo(150, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });

  it("180도는 6시 방향 (아래)", () => {
    const p = polarToCartesian(100, 100, 50, 180);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(150, 5);
  });
});

describe("sectorAngles", () => {
  it("4등분: 각 섹터 90도", () => {
    expect(sectorAngles(0, 4)).toEqual({ start: 0, center: 45, end: 90 });
    expect(sectorAngles(3, 4)).toEqual({ start: 270, center: 315, end: 360 });
  });

  it("범위 밖 index는 예외", () => {
    expect(() => sectorAngles(4, 4)).toThrow(RangeError);
    expect(() => sectorAngles(-1, 4)).toThrow(RangeError);
  });

  it("slotCount 0 이하는 예외", () => {
    expect(() => sectorAngles(0, 0)).toThrow(RangeError);
  });
});

describe("sectorPath", () => {
  it("일반 섹터는 중심에서 시작하는 파이 조각", () => {
    const d = sectorPath(100, 100, 90, 0, 4);
    expect(d).toMatch(/^M 100 100 L /);
    expect(d).toMatch(/A 90 90 0 0 1 /);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("slotCount=1이면 두 호로 완전한 원 (중심점 없음)", () => {
    const d = sectorPath(100, 100, 90, 0, 1);
    expect(d).not.toMatch(/L 100 100/);
    expect((d.match(/A /g) ?? []).length).toBe(2);
  });

  it("180도 초과 섹터는 large-arc-flag=1", () => {
    // 3등분이면 섹터 120도 → flag 0. 절반이면 180 → 0. 확인용으로 매우 적은 슬롯.
    const d2 = sectorPath(100, 100, 90, 0, 2); // 180도, flag 0
    expect(d2).toMatch(/A 90 90 0 0 1/);
  });
});

describe("labelPosition", () => {
  it("반지름의 66% 지점, 섹터 중심 각도", () => {
    // 4등분 index 0 → center 45도
    const p = labelPosition(100, 100, 90, 0, 4);
    const expected = polarToCartesian(100, 100, 90 * 0.66, 45);
    expect(p.x).toBeCloseTo(expected.x, 5);
    expect(p.y).toBeCloseTo(expected.y, 5);
  });
});

describe("computeSpinRotation ↔ slotAtPointer (역산 정확성, FR-3.3)", () => {
  it("어떤 targetIndex든 최종 회전각에서 포인터가 그 섹터를 가리킨다", () => {
    for (const slotCount of [2, 3, 4, 5, 8, 13, 20, 41]) {
      for (let targetIndex = 0; targetIndex < slotCount; targetIndex++) {
        for (const currentRotation of [0, 37, 123.4, -50, 719.9]) {
          const final = computeSpinRotation({
            currentRotation,
            targetIndex,
            slotCount,
            turns: 3,
          });
          expect(slotAtPointer(final, slotCount)).toBe(targetIndex);
        }
      }
    }
  });

  it("항상 앞으로(시계방향) 돈다 — 최소 turns 바퀴 이상", () => {
    for (let i = 0; i < 50; i++) {
      const final = computeSpinRotation({
        currentRotation: i * 13.7,
        targetIndex: i % 5,
        slotCount: 5,
        turns: 5,
      });
      expect(final - i * 13.7).toBeGreaterThanOrEqual(5 * 360);
    }
  });

  it("slotCount=1이면 항상 index 0", () => {
    const final = computeSpinRotation({ currentRotation: 42, targetIndex: 0, slotCount: 1 });
    expect(slotAtPointer(final, 1)).toBe(0);
  });

  it("turns 음수는 예외", () => {
    expect(() =>
      computeSpinRotation({ currentRotation: 0, targetIndex: 0, slotCount: 4, turns: -1 }),
    ).toThrow(RangeError);
  });

  it("jitter를 줘도 포인터는 같은 섹터 안에 머문다", () => {
    for (let i = 0; i < 200; i++) {
      const slotCount = 6;
      const targetIndex = i % slotCount;
      const final = computeSpinRotation({
        currentRotation: i * 7,
        targetIndex,
        slotCount,
        turns: 2,
        jitter: 30,
      });
      expect(slotAtPointer(final, slotCount)).toBe(targetIndex);
    }
  });
});

describe("slotAtPointer", () => {
  it("회전 0이면 index 0이 포인터 아래", () => {
    expect(slotAtPointer(0, 4)).toBe(0);
  });

  it("360의 배수 회전은 원위치", () => {
    expect(slotAtPointer(720, 8)).toBe(0);
  });
});

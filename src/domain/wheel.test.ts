import { describe, expect, it } from "vitest";
import { createRng } from "./rng.ts";
import type { Prize } from "./types.ts";
import {
  assertSlotInvariant,
  buildSlots,
  isWheelExhausted,
  pickSpinOutcome,
} from "./wheel.ts";

function prizes(spec: Array<[string, boolean]>): Prize[] {
  return spec.map(([name, consumed], i) => ({ id: `z${i}`, name, consumed }));
}

describe("buildSlots", () => {
  it("슬롯 수 = 남은 경품 수 + 꽝 1 (FR-3.1)", () => {
    const p = prizes([
      ["A", false],
      ["B", false],
      ["C", false],
    ]);
    expect(buildSlots(p, createRng(1))).toHaveLength(4);
  });

  it("소진된 경품은 슬롯에서 빠진다 (FR-5.1)", () => {
    const p = prizes([
      ["A", false],
      ["B", true],
      ["C", false],
    ]);
    const slots = buildSlots(p, createRng(1));
    expect(slots).toHaveLength(3); // A, C, 꽝
    const prizeIds = slots.filter((s) => s.kind === "prize").map((s) => s.prizeId);
    expect(prizeIds.sort()).toEqual(["z0", "z2"]);
  });

  it("꽝은 항상 정확히 1칸 (FR-5.3)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const p = prizes([
        ["A", false],
        ["B", false],
      ]);
      const slots = buildSlots(p, createRng(seed));
      expect(slots.filter((s) => s.kind === "miss")).toHaveLength(1);
    }
  });

  it("경품 1개 남으면 슬롯 2칸 → 꽝 확률 1/2 (EC-5)", () => {
    const p = prizes([["A", false]]);
    expect(buildSlots(p, createRng(1))).toHaveLength(2);
  });

  it("경품이 모두 소진되면 꽝 1칸만", () => {
    const p = prizes([
      ["A", true],
      ["B", true],
    ]);
    const slots = buildSlots(p, createRng(1));
    expect(slots).toEqual([{ kind: "miss", prizeId: null }]);
  });

  it("슬롯 순서를 셔플한다 — 위치 예측 불가 (FR-5.2)", () => {
    const p = prizes(Array.from({ length: 8 }, (_, i) => [`P${i}`, false] as [string, boolean]));
    const orderings = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const slots = buildSlots(p, createRng(seed));
      orderings.add(slots.map((s) => s.prizeId ?? "MISS").join(","));
    }
    expect(orderings.size).toBeGreaterThan(5);
  });

  it("꽝의 위치도 무작위 (항상 끝에 있지 않다)", () => {
    const p = prizes(Array.from({ length: 6 }, (_, i) => [`P${i}`, false] as [string, boolean]));
    const missPositions = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const slots = buildSlots(p, createRng(seed));
      missPositions.add(slots.findIndex((s) => s.kind === "miss"));
    }
    expect(missPositions.size).toBeGreaterThan(1);
  });
});

describe("assertSlotInvariant", () => {
  it("정상 슬롯은 통과", () => {
    const p = prizes([
      ["A", false],
      ["B", false],
    ]);
    const slots = buildSlots(p, createRng(1));
    expect(() => assertSlotInvariant(slots, p)).not.toThrow();
  });

  it("꽝이 0칸이면 예외", () => {
    const p = prizes([["A", false]]);
    expect(() =>
      assertSlotInvariant([{ kind: "prize", prizeId: "z0" }], p),
    ).toThrow(/꽝/);
  });

  it("꽝이 2칸이면 예외", () => {
    const p = prizes([["A", false]]);
    expect(() =>
      assertSlotInvariant(
        [
          { kind: "prize", prizeId: "z0" },
          { kind: "miss", prizeId: null },
          { kind: "miss", prizeId: null },
        ],
        p,
      ),
    ).toThrow(/꽝/);
  });

  it("슬롯 수가 안 맞으면 예외", () => {
    const p = prizes([
      ["A", false],
      ["B", false],
      ["C", false],
    ]);
    expect(() =>
      assertSlotInvariant(
        [
          { kind: "prize", prizeId: "z0" },
          { kind: "miss", prizeId: null },
        ],
        p,
      ),
    ).toThrow(/불변식/);
  });
});

describe("pickSpinOutcome", () => {
  it("결과를 먼저 정한다 — slotIndex는 유효 범위 (FR-3.3)", () => {
    const p = prizes([
      ["A", false],
      ["B", false],
      ["C", false],
    ]);
    const slots = buildSlots(p, createRng(1));
    for (let seed = 0; seed < 100; seed++) {
      const outcome = pickSpinOutcome(slots, createRng(seed));
      expect(outcome.slotIndex).toBeGreaterThanOrEqual(0);
      expect(outcome.slotIndex).toBeLessThan(slots.length);
      expect(outcome.slot).toBe(slots[outcome.slotIndex]);
    }
  });

  it("모든 섹터가 등확률 (1/슬롯수, NFR-2)", () => {
    const slots = buildSlots(
      prizes([
        ["A", false],
        ["B", false],
        ["C", false],
      ]),
      createRng(1),
    ); // 4 슬롯
    const counts = [0, 0, 0, 0];
    const N = 40000;
    for (let i = 0; i < N; i++) {
      counts[pickSpinOutcome(slots, createRng(i)).slotIndex]!++;
    }
    for (const c of counts) {
      expect(c / N).toBeGreaterThan(0.22);
      expect(c / N).toBeLessThan(0.28);
    }
  });

  it("같은 seed면 같은 결과 (재현성)", () => {
    const slots = buildSlots(prizes([["A", false]]), createRng(1));
    expect(pickSpinOutcome(slots, createRng(9)).slotIndex).toBe(
      pickSpinOutcome(slots, createRng(9)).slotIndex,
    );
  });

  it("빈 원판이면 예외", () => {
    expect(() => pickSpinOutcome([], createRng(1))).toThrow();
  });
});

describe("isWheelExhausted", () => {
  it("경품 슬롯이 있으면 false", () => {
    expect(
      isWheelExhausted([
        { kind: "prize", prizeId: "z0" },
        { kind: "miss", prizeId: null },
      ]),
    ).toBe(false);
  });

  it("꽝만 남으면 true (EC-3)", () => {
    expect(isWheelExhausted([{ kind: "miss", prizeId: null }])).toBe(true);
  });
});

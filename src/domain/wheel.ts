// 원판 슬롯 구성과 회전 결과 추첨 — Requirement.md 3.3, 3.5, FR-3, FR-5.

import { shuffle, type Rng } from "./rng.ts";
import type { Prize, WheelSlot } from "./types.ts";

// 슬롯 = 소진되지 않은 경품(셔플) + 꽝 1칸.
// FR-3.1, FR-5.1~5.3: 꽝은 셔플 후에도 항상 정확히 1칸.
// 꽝의 위치도 무작위여야 위치 예측이 불가능하다 (FR-5.2).
export function buildSlots(prizes: readonly Prize[], rng: Rng): WheelSlot[] {
  const remaining = prizes.filter((p) => !p.consumed);
  const prizeSlots: WheelSlot[] = remaining.map((p) => ({
    kind: "prize",
    prizeId: p.id,
  }));
  const missSlot: WheelSlot = { kind: "miss", prizeId: null };
  return shuffle([...prizeSlots, missSlot], rng);
}

// 슬롯 수 불변식 검증 (파생 규칙: slots.length === 남은 경품 수 + 1).
export function assertSlotInvariant(slots: readonly WheelSlot[], prizes: readonly Prize[]): void {
  const remaining = prizes.filter((p) => !p.consumed).length;
  const missCount = slots.filter((s) => s.kind === "miss").length;
  if (missCount !== 1) {
    throw new Error(`꽝 슬롯은 정확히 1칸이어야 합니다 (현재: ${missCount})`);
  }
  if (slots.length !== remaining + 1) {
    throw new Error(`슬롯 수 불변식 위반: ${slots.length} !== ${remaining} + 1`);
  }
}

export interface SpinOutcome {
  slotIndex: number; // 멈출 슬롯
  slot: WheelSlot;
}

// FR-3.3 / NFR-1: 결과를 먼저 정한다. 애니메이션은 이 결과로부터 역산된다.
// 모든 섹터 등확률 = 1 / slots.length (FR-3.2, NFR-2).
export function pickSpinOutcome(slots: readonly WheelSlot[], rng: Rng): SpinOutcome {
  if (slots.length === 0) {
    throw new Error("빈 원판은 돌릴 수 없습니다");
  }
  const slotIndex = rng.int(slots.length);
  return { slotIndex, slot: slots[slotIndex]! };
}

// 원판에 경품 슬롯이 하나도 없으면 (꽝만 남으면) 회전 불가 — EC-3.
export function isWheelExhausted(slots: readonly WheelSlot[]): boolean {
  return !slots.some((s) => s.kind === "prize");
}

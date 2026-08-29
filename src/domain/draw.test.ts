import { describe, expect, it } from "vitest";
import {
  assignNextParticipant,
  beginSpin,
  canSpin,
  checkFinished,
  eligibleParticipants,
  nextRound,
  recoverFromReload,
  remainingPrizeCount,
  reset,
  resolveSpin,
  selectParticipant,
  startDrawing,
} from "./draw.ts";
import { createRng } from "./rng.ts";
import type { AppState, Participant, Prize } from "./types.ts";
import type { SpinOutcome } from "./wheel.ts";

function mkParticipants(labels: string[]): Participant[] {
  return labels.map((label, i) => ({ id: `p${i}`, label, status: "eligible" }));
}
function mkPrizes(names: string[]): Prize[] {
  return names.map((name, i) => ({ id: `z${i}`, name, consumed: false }));
}

// 특정 종류의 슬롯에 정착하도록 outcome을 강제로 만든다 (테스트용).
function outcomeForKind(state: AppState, kind: "prize" | "miss"): SpinOutcome {
  const idx = state.slots.findIndex((s) => s.kind === kind);
  if (idx < 0) throw new Error(`슬롯에 ${kind}가 없습니다`);
  return { slotIndex: idx, slot: state.slots[idx]! };
}

// 회전을 1회 완주한다: begin → (강제 outcome) → resolve.
function spinOnce(
  state: AppState,
  kind: "prize" | "miss",
  seed = 1,
): AppState {
  const { state: spinning } = beginSpin(state, createRng(seed));
  const outcome = outcomeForKind(spinning, kind);
  return resolveSpin(spinning, outcome, createRng(seed));
}

describe("startDrawing", () => {
  it("setup → drawing 전이, 슬롯 생성, 첫 참가자 지정", () => {
    const s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    expect(s.phase).toBe("drawing");
    expect(s.slots).toHaveLength(3); // 2 경품 + 꽝
    expect(s.currentParticipantId).not.toBeNull();
    expect(s.round).toBe(0);
    expect(s.results).toEqual([]);
  });

  it("경품 0이면 예외 (FR-2.3)", () => {
    expect(() => startDrawing(mkParticipants(["A"]), [], createRng(1))).toThrow();
  });

  it("참가자 0이면 예외 (EC-6)", () => {
    expect(() => startDrawing([], mkPrizes(["상1"]), createRng(1))).toThrow();
  });

  it("입력 배열을 변경하지 않는다", () => {
    const participants = mkParticipants(["A"]);
    const prizes = mkPrizes(["상1"]);
    startDrawing(participants, prizes, createRng(1));
    expect(participants[0]!.status).toBe("eligible");
    expect(prizes[0]!.consumed).toBe(false);
  });

  it("missOnceMode 옵션을 반영", () => {
    const s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1"]), createRng(1), {
      missOnceMode: true,
    });
    expect(s.missOnceMode).toBe(true);
  });
});

describe("경품 정착 (FR-4.1)", () => {
  it("참가자 won, 경품 consumed, 원판 재배치, 결과 기록", () => {
    let s = startDrawing(mkParticipants(["A", "B", "C"]), mkPrizes(["상1", "상2"]), createRng(1));
    const winnerId = s.currentParticipantId!;
    s = spinOnce(s, "prize");

    const winner = s.participants.find((p) => p.id === winnerId)!;
    expect(winner.status).toBe("won");
    expect(remainingPrizeCount(s)).toBe(1);
    expect(s.slots).toHaveLength(2); // 1 경품 + 꽝 (재배치됨)
    expect(s.results).toHaveLength(1);
    expect(s.results[0]!.prizeName).not.toBeNull();
    expect(s.results[0]!.round).toBe(1);
    expect(s.isSpinning).toBe(false);
  });

  it("당첨자는 다시 당첨될 수 없다 (FR-4.3) — eligible 풀에서 빠짐", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    const firstWinnerId = s.currentParticipantId!;
    s = spinOnce(s, "prize");
    s = nextRound(s, createRng(2));
    expect(eligibleParticipants(s).map((p) => p.id)).not.toContain(firstWinnerId);
    expect(s.currentParticipantId).not.toBe(firstWinnerId);
  });

  it("재배치된 슬롯도 불변식을 지킨다 (꽝 1칸)", () => {
    let s = startDrawing(
      mkParticipants(["A", "B", "C", "D"]),
      mkPrizes(["상1", "상2", "상3"]),
      createRng(1),
    );
    s = spinOnce(s, "prize", 5);
    expect(s.slots.filter((x) => x.kind === "miss")).toHaveLength(1);
    expect(s.slots).toHaveLength(remainingPrizeCount(s) + 1);
  });
});

describe("꽝 정착 (FR-4.2)", () => {
  it("기본 정책: 참가자 잔류, 경품 그대로, 결과는 null", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    const pid = s.currentParticipantId!;
    s = spinOnce(s, "miss");

    expect(s.participants.find((p) => p.id === pid)!.status).toBe("eligible");
    expect(remainingPrizeCount(s)).toBe(2);
    expect(s.results[0]!.prizeId).toBeNull();
    expect(s.results[0]!.prizeName).toBeNull();
  });

  it("missOnceMode: 꽝이면 즉시 out", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1), {
      missOnceMode: true,
    });
    const pid = s.currentParticipantId!;
    s = spinOnce(s, "miss");
    expect(s.participants.find((p) => p.id === pid)!.status).toBe("out");
  });

  it("꽝은 원판을 재배치하지 않는다", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    const before = s.slots;
    s = spinOnce(s, "miss");
    expect(s.slots).toBe(before);
  });
});

describe("종료 조건 (4장)", () => {
  it("경품 소진 시 finished (EC-1)", () => {
    let s = startDrawing(
      mkParticipants(["A", "B", "C", "D", "E"]),
      mkPrizes(["상1", "상2"]),
      createRng(1),
    );
    s = spinOnce(s, "prize", 1);
    s = nextRound(s, createRng(2));
    s = spinOnce(s, "prize", 2);
    expect(s.phase).toBe("finished");
    expect(remainingPrizeCount(s)).toBe(0);
  });

  it("미당첨 참가자는 명단(participants)에 eligible로 남는다 (EC-1)", () => {
    let s = startDrawing(
      mkParticipants(["A", "B", "C"]),
      mkPrizes(["상1"]),
      createRng(1),
    );
    s = spinOnce(s, "prize");
    expect(s.phase).toBe("finished");
    const notWon = s.participants.filter((p) => p.status !== "won");
    expect(notWon).toHaveLength(2);
  });

  it("참가자 전원 당첨 시 finished, 잔여 경품 남음 (EC-2)", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2", "상3"]), createRng(1));
    s = spinOnce(s, "prize", 1);
    s = nextRound(s, createRng(2));
    s = spinOnce(s, "prize", 2);
    expect(s.phase).toBe("finished");
    expect(remainingPrizeCount(s)).toBe(1);
  });

  it("missOnceMode에서 참가자 전원 탈락 시 finished (EC-4)", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2", "상3"]), createRng(1), {
      missOnceMode: true,
    });
    s = spinOnce(s, "miss", 1);
    s = nextRound(s, createRng(2));
    s = spinOnce(s, "miss", 2);
    expect(eligibleParticipants(s)).toHaveLength(0);
    expect(s.phase).toBe("finished");
  });

  it("checkFinished는 조건 미충족이면 상태를 그대로 둔다", () => {
    const s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    expect(checkFinished(s).phase).toBe("drawing");
  });
});

describe("canSpin / beginSpin 잠금 (FR-3.4)", () => {
  it("회전 중에는 canSpin=false", () => {
    const s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1"]), createRng(1));
    const { state: spinning } = beginSpin(s, createRng(1));
    expect(canSpin(spinning)).toBe(false);
    expect(() => beginSpin(spinning, createRng(2))).toThrow();
  });

  it("finished 상태면 canSpin=false", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1"]), createRng(1));
    s = spinOnce(s, "prize");
    expect(s.phase).toBe("finished");
    expect(canSpin(s)).toBe(false);
  });

  it("현재 참가자가 없으면 canSpin=false", () => {
    const s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1"]), createRng(1));
    expect(canSpin({ ...s, currentParticipantId: null })).toBe(false);
  });
});

describe("resolveSpin 결과 결정성 (NFR-1)", () => {
  it("outcome이 결과를 전적으로 결정한다 — resolve에 넘긴 seed는 재배치에만 영향", () => {
    let s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    const prizeOutcome = outcomeForKind(
      beginSpin(s, createRng(1)).state,
      "prize",
    );
    const { state: spinning } = beginSpin(s, createRng(1));
    const r1 = resolveSpin(spinning, prizeOutcome, createRng(100));
    const r2 = resolveSpin(spinning, prizeOutcome, createRng(999));
    // 당첨 사실·경품은 동일 (재배치 순서만 seed에 따라 다를 수 있음)
    expect(r1.results[0]!.prizeId).toBe(r2.results[0]!.prizeId);
    expect(r1.participants.find((p) => p.status === "won")?.id).toBe(
      r2.participants.find((p) => p.status === "won")?.id,
    );
  });

  it("회전 중이 아니면 resolveSpin 예외", () => {
    const s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1"]), createRng(1));
    expect(() => resolveSpin(s, outcomeForKind(s, "miss"), createRng(1))).toThrow();
  });
});

describe("selectParticipant (FR-6.1 수동)", () => {
  it("eligible 참가자를 지정할 수 있다", () => {
    const s = startDrawing(mkParticipants(["A", "B", "C"]), mkPrizes(["상1"]), createRng(1));
    const target = s.participants[2]!;
    expect(selectParticipant(s, target.id).currentParticipantId).toBe(target.id);
  });

  it("이미 won인 참가자는 지정 불가", () => {
    let s = startDrawing(mkParticipants(["A", "B", "C"]), mkPrizes(["상1", "상2"]), createRng(1));
    const wonId = s.currentParticipantId!;
    s = spinOnce(s, "prize");
    expect(() => selectParticipant(s, wonId)).toThrow();
  });

  it("존재하지 않는 id는 예외", () => {
    const s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1"]), createRng(1));
    expect(() => selectParticipant(s, "nope")).toThrow();
  });
});

describe("assignNextParticipant (FR-6.1 기본)", () => {
  it("eligible 중에서만 뽑는다", () => {
    let s = startDrawing(mkParticipants(["A", "B", "C"]), mkPrizes(["상1", "상2"]), createRng(1));
    s = spinOnce(s, "prize");
    for (let seed = 0; seed < 50; seed++) {
      const next = assignNextParticipant(s, createRng(seed));
      const picked = s.participants.find((p) => p.id === next.currentParticipantId)!;
      expect(picked.status).toBe("eligible");
    }
  });

  it("eligible이 없으면 currentParticipantId=null", () => {
    let s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1", "상2"]), createRng(1));
    s = spinOnce(s, "prize");
    expect(assignNextParticipant(s, createRng(1)).currentParticipantId).toBeNull();
  });
});

describe("reset (FR-6.3)", () => {
  it("모든 상태를 setup으로 되돌린다", () => {
    const s = reset();
    expect(s).toEqual({
      phase: "setup",
      participants: [],
      prizes: [],
      slots: [],
      results: [],
      currentParticipantId: null,
      isSpinning: false,
      missOnceMode: false,
      round: 0,
    });
  });
});

describe("recoverFromReload (EC-7)", () => {
  it("회전 중이었으면 isSpinning 해제, 진행 중 라운드는 반영 안 됨", () => {
    const s = startDrawing(mkParticipants(["A", "B"]), mkPrizes(["상1", "상2"]), createRng(1));
    const { state: spinning } = beginSpin(s, createRng(1));
    const recovered = recoverFromReload(spinning);
    expect(recovered.isSpinning).toBe(false);
    expect(recovered.results).toEqual([]);
    expect(recovered.round).toBe(0);
  });

  it("회전 중이 아니었으면 그대로", () => {
    const s = startDrawing(mkParticipants(["A"]), mkPrizes(["상1"]), createRng(1));
    expect(recoverFromReload(s)).toBe(s);
  });
});

describe("EC-5: 경품 1개 + 참가자 다수", () => {
  it("정상 진행, 슬롯 2칸", () => {
    const s = startDrawing(
      mkParticipants(["A", "B", "C", "D"]),
      mkPrizes(["유일상품"]),
      createRng(1),
    );
    expect(s.slots).toHaveLength(2);
    expect(canSpin(s)).toBe(true);
  });
});

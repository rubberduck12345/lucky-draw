// 추첨 상태 머신 — Requirement.md 3.4, 3.6, 4장(EC), FR-4, FR-6.
//
// 모든 함수는 순수하다. AppState를 받아 새 AppState를 반환하며 입력을 변경하지 않는다.
// 회전 애니메이션과 무관하게 결과가 결정된다 (NFR-1).

import { createRng, type Rng } from "./rng.ts";
import type { AppState, DrawResult, Participant, Prize } from "./types.ts";
import {
  buildSlots,
  isWheelExhausted,
  pickSpinOutcome,
  type SpinOutcome,
} from "./wheel.ts";

export interface InitOptions {
  missOnceMode?: boolean;
}

// setup → drawing. 슬롯을 만들고 첫 참가자를 지정한다.
// FR-2.3: 경품 0이면 시작 불가. 참가자 0도 시작 불가 (EC-6).
export function startDrawing(
  participants: readonly Participant[],
  prizes: readonly Prize[],
  rng: Rng,
  options: InitOptions = {},
): AppState {
  if (prizes.length === 0) {
    throw new Error("경품이 없으면 추첨을 시작할 수 없습니다 (FR-2.3)");
  }
  if (participants.length === 0) {
    throw new Error("참가자가 없으면 추첨을 시작할 수 없습니다 (EC-6)");
  }

  const slots = buildSlots(prizes, rng);
  const state: AppState = {
    phase: "drawing",
    participants: participants.map((p) => ({ ...p })),
    prizes: prizes.map((z) => ({ ...z })),
    slots,
    results: [],
    currentParticipantId: null,
    isSpinning: false,
    missOnceMode: options.missOnceMode ?? false,
    round: 0,
  };
  return assignNextParticipant(state, rng);
}

export function eligibleParticipants(state: AppState): Participant[] {
  return state.participants.filter((p) => p.status === "eligible");
}

export function remainingPrizeCount(state: AppState): number {
  return state.prizes.filter((z) => !z.consumed).length;
}

// FR-6.1 기본: 남은 참가자 중 무작위 1명 자동 지정.
// 남은 참가자가 없으면 currentParticipantId=null. 종료 판정은 checkFinished가 한다.
export function assignNextParticipant(state: AppState, rng: Rng): AppState {
  const eligible = eligibleParticipants(state);
  if (eligible.length === 0) {
    return { ...state, currentParticipantId: null };
  }
  const pick = eligible[rng.int(eligible.length)]!;
  return { ...state, currentParticipantId: pick.id };
}

// FR-6.1 옵션: 수동 선택.
export function selectParticipant(state: AppState, participantId: string): AppState {
  const target = state.participants.find((p) => p.id === participantId);
  if (!target) {
    throw new Error(`참가자를 찾을 수 없습니다: ${participantId}`);
  }
  if (target.status !== "eligible") {
    throw new Error(`이미 제외된 참가자입니다: ${participantId} (${target.status})`);
  }
  return { ...state, currentParticipantId: participantId };
}

// 종료 조건 (4장): 경품 소진 또는 참가자 소진.
// EC-3: 꽝만 남으면 회전을 막고 종료. EC-4: 참가자 전원 제외 시 종료.
export function checkFinished(state: AppState): AppState {
  const prizesGone = remainingPrizeCount(state) === 0;
  const noEligible = eligibleParticipants(state).length === 0;
  const wheelDead = isWheelExhausted(state.slots);
  if (prizesGone || noEligible || wheelDead) {
    return { ...state, phase: "finished", currentParticipantId: null, isSpinning: false };
  }
  return state;
}

export function canSpin(state: AppState): boolean {
  return (
    state.phase === "drawing" &&
    !state.isSpinning &&
    state.currentParticipantId !== null &&
    !isWheelExhausted(state.slots)
  );
}

// 회전 시작 — 결과를 즉시 확정하고 잠금을 건다 (FR-3.3, FR-3.4).
// 반환된 outcome으로 UI가 애니메이션 각도를 역산한다.
export interface BeginSpinResult {
  state: AppState;
  outcome: SpinOutcome;
}

export function beginSpin(state: AppState, rng: Rng): BeginSpinResult {
  if (!canSpin(state)) {
    throw new Error("지금은 회전할 수 없습니다");
  }
  const outcome = pickSpinOutcome(state.slots, rng);
  return { state: { ...state, isSpinning: true }, outcome };
}

// 회전 종료 — 확정된 outcome을 상태에 반영한다 (FR-3.5, FR-4).
// 경품 정착: 경품 소진 + 참가자 won + 원판 재배치 (FR-4.1, FR-5).
// 꽝 정착: 결과 기록. 기본은 참가자 잔류, missOnceMode면 out (FR-4.2).
export function resolveSpin(state: AppState, outcome: SpinOutcome, rng: Rng): AppState {
  if (!state.isSpinning) {
    throw new Error("회전 중이 아닙니다");
  }
  const participantId = state.currentParticipantId;
  if (participantId === null) {
    throw new Error("현재 참가자가 없습니다");
  }
  const participant = state.participants.find((p) => p.id === participantId)!;
  const round = state.round + 1;
  const timestamp = Date.now();

  let participants = state.participants;
  let prizes = state.prizes;
  let slots = state.slots;
  let result: DrawResult;

  if (outcome.slot.kind === "prize") {
    const prizeId = outcome.slot.prizeId!;
    const prize = state.prizes.find((z) => z.id === prizeId)!;

    prizes = state.prizes.map((z) => (z.id === prizeId ? { ...z, consumed: true } : z));
    participants = state.participants.map((p) =>
      p.id === participantId ? { ...p, status: "won" as const } : p,
    );
    // FR-5: 남은 경품으로 원판 재배치 (셔플).
    slots = buildSlots(prizes, rng);

    result = {
      round,
      participantId,
      participantLabel: participant.label,
      prizeId,
      prizeName: prize.name,
      timestamp,
    };
  } else {
    // 꽝.
    if (state.missOnceMode) {
      participants = state.participants.map((p) =>
        p.id === participantId ? { ...p, status: "out" as const } : p,
      );
    }
    result = {
      round,
      participantId,
      participantLabel: participant.label,
      prizeId: null,
      prizeName: null,
      timestamp,
    };
  }

  const next: AppState = {
    ...state,
    participants,
    prizes,
    slots,
    results: [...state.results, result],
    isSpinning: false,
    round,
  };
  return checkFinished(next);
}

// FR-6.2: 다음 라운드 진행 (다음 참가자 자동 지정).
export function nextRound(state: AppState, rng: Rng): AppState {
  if (state.phase !== "drawing") {
    return state;
  }
  return assignNextParticipant(state, rng);
}

// FR-6.3: 전체 초기화 — 입력 단계로. (확인 모달은 UI 책임.)
export function reset(): AppState {
  return {
    phase: "setup",
    participants: [],
    prizes: [],
    slots: [],
    results: [],
    currentParticipantId: null,
    isSpinning: false,
    missOnceMode: false,
    round: 0,
  };
}

// EC-7: 회전 중 새로고침 — 진행 중 라운드 무효, 마지막 확정 상태로 복원.
export function recoverFromReload(state: AppState): AppState {
  if (!state.isSpinning) {
    return state;
  }
  const cleared: AppState = { ...state, isSpinning: false };
  return checkFinished(cleared);
}

// 편의: 프로덕션 진입점 (seed 없는 RNG).
export function startDrawingLive(
  participants: readonly Participant[],
  prizes: readonly Prize[],
  options?: InitOptions,
): AppState {
  return startDrawing(participants, prizes, createRng(), options);
}

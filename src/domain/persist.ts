// 진행 상태 저장/복원 — Requirement.md NFR-3, EC-7.
//
// 확정된 상태만 저장한다. 회전 중(isSpinning) 새로고침이 일어나면
// 진행 중 라운드는 무효이고 마지막 확정 상태로 복원한다 (recoverFromReload).
//
// 순수 로직: serialize / deserialize / migrate. 실제 저장소 접근은
// loadState / saveState / clearState 가 담당하며 예외를 삼킨다
// (사생활 모드·용량 초과·차단 환경에서도 앱이 동작해야 한다).

import { recoverFromReload } from "./draw.ts";
import type { AppState, Phase } from "./types.ts";

const KEY = "lucky-draw:state";
const VERSION = 1;

interface Envelope {
  v: number;
  state: AppState;
}

const PHASES: readonly Phase[] = ["setup", "drawing", "finished"];

// 신뢰할 수 없는 입력을 AppState로 검증. 형태가 어긋나면 null.
export function deserialize(raw: string): AppState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const env = parsed as Partial<Envelope>;
  if (env.v !== VERSION || typeof env.state !== "object" || env.state === null) {
    return null;
  }
  const s = env.state as Partial<AppState>;

  if (!PHASES.includes(s.phase as Phase)) return null;
  if (
    !Array.isArray(s.participants) ||
    !Array.isArray(s.prizes) ||
    !Array.isArray(s.slots) ||
    !Array.isArray(s.results)
  ) {
    return null;
  }
  if (typeof s.round !== "number" || typeof s.missOnceMode !== "boolean") return null;

  const state: AppState = {
    phase: s.phase as Phase,
    participants: s.participants,
    prizes: s.prizes,
    slots: s.slots,
    results: s.results,
    currentParticipantId:
      typeof s.currentParticipantId === "string" ? s.currentParticipantId : null,
    isSpinning: s.isSpinning === true,
    missOnceMode: s.missOnceMode,
    round: s.round,
  };

  // EC-7: 회전 중이었으면 마지막 확정 상태로 되돌린다.
  return recoverFromReload(state);
}

export function serialize(state: AppState): string {
  // 회전 중 상태는 저장하지 않는다 — isSpinning=false로 강제.
  const env: Envelope = { v: VERSION, state: { ...state, isSpinning: false } };
  return JSON.stringify(env);
}

// ── 저장소 접근 (부수효과, 예외 삼킴) ────────────────

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadState(): AppState | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state: AppState): void {
  const s = storage();
  if (!s) return;
  // setup 단계는 저장 가치가 없다 — 저장된 게 있으면 지운다.
  if (state.phase === "setup") {
    clearState();
    return;
  }
  try {
    s.setItem(KEY, serialize(state));
  } catch {
    // 용량 초과 등 — 무시 (NFR-3은 선택 구현)
  }
}

export function clearState(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}

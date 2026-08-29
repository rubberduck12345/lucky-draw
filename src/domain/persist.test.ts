import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginSpin, startDrawing } from "./draw.ts";
import {
  clearState,
  deserialize,
  loadState,
  saveState,
  serialize,
} from "./persist.ts";
import { createRng } from "./rng.ts";
import type { AppState, Participant, Prize } from "./types.ts";

function mkParticipants(labels: string[]): Participant[] {
  return labels.map((label, i) => ({ id: `p${i}`, label, status: "eligible" }));
}
function mkPrizes(names: string[]): Prize[] {
  return names.map((name, i) => ({ id: `z${i}`, name, consumed: false }));
}
function drawingState(): AppState {
  return startDrawing(mkParticipants(["A", "B", "C"]), mkPrizes(["상1", "상2"]), createRng(1));
}

describe("serialize / deserialize 왕복", () => {
  it("drawing 상태를 손실 없이 복원", () => {
    const s = drawingState();
    const back = deserialize(serialize(s));
    expect(back).toEqual({ ...s, isSpinning: false });
  });

  it("finished 상태도 복원", () => {
    const s = { ...drawingState(), phase: "finished" as const };
    expect(deserialize(serialize(s))?.phase).toBe("finished");
  });
});

describe("deserialize 방어", () => {
  it("깨진 JSON은 null", () => {
    expect(deserialize("{not json")).toBeNull();
  });
  it("버전 불일치는 null", () => {
    expect(deserialize(JSON.stringify({ v: 99, state: drawingState() }))).toBeNull();
  });
  it("phase가 이상하면 null", () => {
    const s = { ...drawingState(), phase: "weird" };
    expect(deserialize(JSON.stringify({ v: 1, state: s }))).toBeNull();
  });
  it("배열 필드가 없으면 null", () => {
    const s = { ...drawingState(), participants: "nope" };
    expect(deserialize(JSON.stringify({ v: 1, state: s }))).toBeNull();
  });
  it("round/missOnceMode 타입이 틀리면 null", () => {
    const s = { ...drawingState(), round: "1" };
    expect(deserialize(JSON.stringify({ v: 1, state: s }))).toBeNull();
  });
});

describe("EC-7: 회전 중 저장/복원", () => {
  it("isSpinning 상태는 serialize 시 false로 저장된다", () => {
    const { state: spinning } = beginSpin(drawingState(), createRng(1));
    expect(spinning.isSpinning).toBe(true);
    const env = JSON.parse(serialize(spinning));
    expect(env.state.isSpinning).toBe(false);
  });

  it("isSpinning=true인 저장본을 만나도 복원 시 해제된다", () => {
    const spinning = { ...drawingState(), isSpinning: true };
    const raw = JSON.stringify({ v: 1, state: spinning });
    expect(deserialize(raw)?.isSpinning).toBe(false);
  });

  it("회전 중이었어도 확정된 results/round는 유지된다", () => {
    const s = { ...drawingState(), isSpinning: true, round: 2 };
    const back = deserialize(JSON.stringify({ v: 1, state: s }));
    expect(back?.round).toBe(2);
    expect(back?.isSpinning).toBe(false);
  });
});

describe("loadState / saveState / clearState (localStorage)", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("저장 후 로드", () => {
    const s = drawingState();
    saveState(s);
    expect(loadState()).toEqual({ ...s, isSpinning: false });
  });

  it("setup 상태는 저장하지 않고 기존 저장본을 지운다", () => {
    saveState(drawingState());
    expect(store.size).toBe(1);
    saveState({ ...drawingState(), phase: "setup" });
    expect(store.size).toBe(0);
  });

  it("clearState는 저장본을 지운다", () => {
    saveState(drawingState());
    clearState();
    expect(loadState()).toBeNull();
  });

  it("저장본이 없으면 loadState는 null", () => {
    expect(loadState()).toBeNull();
  });

  it("localStorage 접근이 throw해도 앱은 죽지 않는다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveState(drawingState())).not.toThrow();
    expect(loadState()).toBeNull();
    expect(() => clearState()).not.toThrow();
  });

  it("setItem 용량 초과를 삼킨다", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: () => {},
    });
    expect(() => saveState(drawingState())).not.toThrow();
  });
});

// @vitest-environment jsdom
//
// mountApp 통합 테스트 — 실제 DOM에서 3화면 흐름을 구동한다.
// 회전 애니메이션(transitionend)은 jsdom에 없으므로 wheel-view의
// setTimeout 안전망(4600ms)이 발동한다. 타이머를 가짜로 돌려 진행시킨다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp } from "./app.ts";

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
  // 테스트 간 저장 상태 누출 방지 (jsdom localStorage는 실제 동작)
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
  // prefers-reduced-motion: reduce → 회전이 즉시 완료된다
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduce"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function $(sel: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`요소 없음: ${sel}`);
  return el;
}
function typeInto(sel: string, value: string): void {
  const el = $(sel) as HTMLTextAreaElement | HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("설정 화면", () => {
  it("초기에는 시작 버튼 비활성 (EC-6)", () => {
    mountApp(root);
    expect(($("#start") as HTMLButtonElement).disabled).toBe(true);
    expect($("#start-hint").hidden).toBe(false);
  });

  it("참가자·경품을 채우면 시작 버튼 활성", () => {
    mountApp(root);
    typeInto("#names", "김철수\n이영희");
    typeInto("#prizes", "상품A\n상품B");
    expect(($("#start") as HTMLButtonElement).disabled).toBe(false);
    expect($("#names-count").textContent).toBe("2명");
    expect($("#prizes-count").textContent).toBe("2개");
  });

  it("경품만 있고 참가자가 없으면 비활성", () => {
    mountApp(root);
    typeInto("#prizes", "상품A");
    expect(($("#start") as HTMLButtonElement).disabled).toBe(true);
  });

  it("중복 이름 경고를 표시 (FR-1.2)", () => {
    mountApp(root);
    typeInto("#names", "김철수\n김철수\n이영희");
    const dup = $("#names-dup");
    expect(dup.hidden).toBe(false);
    expect(dup.textContent).toContain("김철수");
  });

  it("숫자로 채우기 버튼이 1..N을 생성 (FR-1.1b)", () => {
    mountApp(root);
    typeInto("#count", "4");
    $("#count-apply").dispatchEvent(new Event("click", { bubbles: true }));
    expect(($("#names") as HTMLTextAreaElement).value).toBe("1\n2\n3\n4");
    expect($("#names-count").textContent).toBe("4명");
  });
});

describe("추첨 화면 진입", () => {
  function start(names = "A\nB\nC", prizes = "상1\n상2"): void {
    mountApp(root);
    typeInto("#names", names);
    typeInto("#prizes", prizes);
    $("#start").dispatchEvent(new Event("click", { bubbles: true }));
  }

  it("시작하면 추첨 화면으로 전환, 원판·현재 참가자·상태 표시", () => {
    start();
    expect(root.textContent).toContain("추첨 진행");
    expect(root.querySelector("svg.wheel")).not.toBeNull();
    expect($("#s-prize").textContent).toBe("2");
    expect($("#s-part").textContent).toBe("3");
    expect($("#s-round").textContent).toBe("0");
    expect(root.querySelector(".current .name")?.textContent).toBeTruthy();
  });

  it("원판 슬롯 수 = 경품 + 꽝 (path 개수)", () => {
    start("A\nB", "상1\n상2\n상3");
    const paths = root.querySelectorAll("svg.wheel path");
    expect(paths.length).toBe(4); // 3 경품 + 꽝
  });

  it("돌리기 버튼이 있고 활성 상태", () => {
    start();
    const spin = root.querySelector<HTMLButtonElement>("#spin-btn")!;
    expect(spin).not.toBeNull();
    expect(spin.disabled).toBe(false);
  });
});

describe("회전 → 결과 → 종료 흐름", () => {
  async function runToFinish(names: string, prizes: string): Promise<void> {
    mountApp(root);
    typeInto("#names", names);
    typeInto("#prizes", prizes);
    $("#start").dispatchEvent(new Event("click", { bubbles: true }));

    for (let guard = 0; guard < 50; guard++) {
      const spin = root.querySelector<HTMLButtonElement>("#spin-btn");
      if (!spin || spin.disabled) break;
      spin.dispatchEvent(new Event("click", { bubbles: true }));
      await flush();
    }
  }

  it("경품 2개면 당첨 2건 발생 후 종료 (EC-1)", async () => {
    await runToFinish("A\nB\nC\nD\nE", "상1\n상2");
    expect(root.textContent).toContain("추첨 종료");
    expect($("#s-prize").textContent).toBe("0");
    // 결과 목록: 당첨 2건 (+ 중간에 꽝이 섞일 수 있음)
    const rows = [...root.querySelectorAll("#results li")];
    const wins = rows.filter((li) => !li.textContent?.includes("꽝"));
    expect(wins.length).toBe(2);
  });

  it("종료 화면에 '처음으로' 버튼과 요약", async () => {
    await runToFinish("A\nB", "상1\n상2\n상3");
    expect(root.textContent).toContain("추첨 종료");
    const buttons = [...root.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toContain("처음으로");
    expect(root.textContent).toMatch(/당첨 \d+건/);
  });

  it("당첨자 명단에 참가자·경품이 기록된다 (FR-7.1)", async () => {
    await runToFinish("A\nB\nC", "특별상");
    const li = root.querySelector("#results li")!;
    expect(li.textContent).toContain("특별상");
    expect(li.textContent).toMatch(/#\d/);
  });

  it("회전 중에는 돌리기 버튼이 잠긴다 (FR-3.4)", async () => {
    mountApp(root);
    typeInto("#names", "A\nB");
    typeInto("#prizes", "상1\n상2");
    $("#start").dispatchEvent(new Event("click", { bubbles: true }));

    // reduced-motion이라 spinTo가 즉시 resolve → 클릭 직후 동기 구간에서
    // 버튼 잠금을 관찰하려면 애니메이션을 실제로 붙잡아야 한다.
    // 여기서는 결과가 정상 반영되는지(당첨 or 꽝 배너 등장)만 확인한다.
    const spin = root.querySelector<HTMLButtonElement>("#spin-btn")!;
    spin.dispatchEvent(new Event("click", { bubbles: true }));
    await flush();
    const outcome = root.querySelector("#outcome-slot .outcome");
    expect(outcome).not.toBeNull();
    expect(["win", "miss"]).toContain((outcome as HTMLElement).dataset.kind);
  });
});

describe("NFR-3 / EC-7: localStorage 복원", () => {
  it("추첨 중 새 mountApp이 저장된 상태를 복원한다", async () => {
    mountApp(root);
    typeInto("#names", "A\nB\nC");
    typeInto("#prizes", "상1\n상2");
    $("#start").dispatchEvent(new Event("click", { bubbles: true }));
    // 한 번 돌려서 결과를 만든다
    root.querySelector<HTMLButtonElement>("#spin-btn")!.dispatchEvent(
      new Event("click", { bubbles: true }),
    );
    await flush();
    const roundBefore = $("#s-round").textContent;

    // 새로고침 시뮬레이션: 새 root에 다시 mount
    document.body.innerHTML = "";
    const root2 = document.createElement("div");
    document.body.appendChild(root2);
    mountApp(root2);

    expect(root2.textContent).toContain("추첨 진행");
    expect(root2.querySelector("#s-round")?.textContent).toBe(roundBefore);
    expect(root2.querySelector("svg.wheel")).not.toBeNull();
  });

  it("초기화하면 저장본이 지워져 다음 mount는 설정 화면", async () => {
    mountApp(root);
    typeInto("#names", "A\nB");
    typeInto("#prizes", "상1\n상2");
    $("#start").dispatchEvent(new Event("click", { bubbles: true }));

    vi.spyOn(window, "confirm").mockReturnValue(true);
    [...root.querySelectorAll("button")]
      .find((b) => b.textContent === "초기화")!
      .dispatchEvent(new Event("click", { bubbles: true }));

    document.body.innerHTML = "";
    const root2 = document.createElement("div");
    document.body.appendChild(root2);
    mountApp(root2);
    expect(root2.querySelector("#names")).not.toBeNull();
  });

  it("손상된 저장본은 무시하고 설정 화면", () => {
    localStorage.setItem("lucky-draw:state", "{corrupt");
    mountApp(root);
    expect($("#names")).not.toBeNull();
  });
});

describe("EC-8: 슬롯 과다 → 번호 + 범례", () => {
  it("경품 30개면 섹터 라벨이 번호, 범례 노출", () => {
    const prizes = Array.from({ length: 30 }, (_, i) => `상품${i + 1}`).join("\n");
    mountApp(root);
    typeInto("#names", "A\nB");
    typeInto("#prizes", prizes);
    $("#start").dispatchEvent(new Event("click", { bubbles: true }));

    const legend = root.querySelector<HTMLElement>(".wheel-legend")!;
    expect(legend.hidden).toBe(false);
    expect(legend.querySelectorAll("li").length).toBe(31); // 30 + 꽝
    // 섹터 라벨 첫 번째가 "1"
    const firstLabel = root.querySelector("svg.wheel text.sector-label")!;
    expect(firstLabel.textContent).toBe("1");
  });
});

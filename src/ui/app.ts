// 앱 컨트롤러 — 3화면(설정 / 추첨 / 종료). Requirement.md 6장.
// DOM 직접 조작. 상태는 도메인 모듈이 소유하고 여기서는 렌더링만 한다.

import {
  beginSpin,
  canSpin,
  clearState,
  createRng,
  eligibleParticipants,
  loadState,
  nextRound,
  parseParticipantsFromCount,
  parseParticipantsFromNames,
  parsePrizes,
  remainingPrizeCount,
  reset as resetState,
  resolveSpin,
  saveState,
  selectParticipant,
  startDrawing,
  type AppState,
  type DrawResult,
  type Participant,
  type Prize,
} from "../domain/index.ts";
import { formatTime, resultsToCsv } from "./format.ts";
import { createWheelView } from "./wheel-view.ts";

// 당첨자 명단을 CSV 파일로 저장 (FR-7.3). BOM을 붙여 Excel 한글 호환.
function downloadResultsCsv(state: AppState): void {
  const csv = resultsToCsv(
    state.results.map((r) => ({
      round: r.round,
      participantLabel: r.participantLabel,
      prizeName: r.prizeName,
      timestamp: r.timestamp,
    })),
  );
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lucky-draw-results-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function mountApp(root: HTMLElement): void {
  // NFR-3 / EC-7: 저장된 확정 상태가 있으면 복원 (회전 중이었으면 자동 해제).
  let state: AppState = loadState() ?? resetState();
  const wheel = createWheelView();

  // 상태를 갱신하는 유일한 경로 — 저장을 한곳에서 처리한다.
  const commit = (next: AppState): void => {
    state = next;
    saveState(state);
  };

  const rerender = (): void => {
    root.replaceChildren();
    if (state.phase === "setup") {
      root.appendChild(renderSetup());
    } else {
      root.appendChild(renderDraw());
    }
  };

  // ── 설정 화면 ──────────────────────────────────────
  function renderSetup(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <h1>럭키드로우 추첨 원판</h1>
      <p class="hint">참가자와 경품을 입력한 뒤 추첨을 시작합니다. 원판 칸 = 남은 경품 수 + 꽝 1칸.</p>
      <div class="panel">
        <div class="field">
          <label for="names">참가자 — 이름 (줄바꿈 또는 쉼표로 구분)</label>
          <textarea id="names" placeholder="김철수&#10;이영희&#10;박민수"></textarea>
          <div class="hint" id="names-count">0명</div>
          <div class="warn" id="names-dup" hidden></div>
        </div>
        <div class="field">
          <label for="count">참가자 — 숫자로 생성 (1 ~ N번)</label>
          <div class="row">
            <input type="number" id="count" min="1" placeholder="예: 30" class="count-input" />
            <button type="button" id="count-apply">번호로 채우기</button>
          </div>
          <div class="hint">이름 입력을 덮어씁니다.</div>
        </div>
      </div>
      <div class="panel">
        <div class="field">
          <label for="prizes">경품 (한 줄 = 1개. 같은 경품 여러 개면 같은 이름 여러 줄)</label>
          <textarea id="prizes" placeholder="에어팟&#10;스타벅스 기프티콘&#10;스타벅스 기프티콘"></textarea>
          <div class="hint" id="prizes-count">0개</div>
        </div>
        <div class="field">
          <label><input type="checkbox" id="miss-once" /> 꽝도 1회만 (꽝이면 참가자 즉시 제외)</label>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="primary" id="start" disabled>추첨 시작</button>
      </div>
      <p class="warn" id="start-hint">참가자와 경품을 각각 1개 이상 입력하세요.</p>
    `;

    const names = wrap.querySelector<HTMLTextAreaElement>("#names")!;
    const count = wrap.querySelector<HTMLInputElement>("#count")!;
    const countApply = wrap.querySelector<HTMLButtonElement>("#count-apply")!;
    const prizes = wrap.querySelector<HTMLTextAreaElement>("#prizes")!;
    const missOnce = wrap.querySelector<HTMLInputElement>("#miss-once")!;
    const start = wrap.querySelector<HTMLButtonElement>("#start")!;
    const startHint = wrap.querySelector<HTMLParagraphElement>("#start-hint")!;
    const namesCount = wrap.querySelector<HTMLDivElement>("#names-count")!;
    const namesDup = wrap.querySelector<HTMLDivElement>("#names-dup")!;
    const prizesCount = wrap.querySelector<HTMLDivElement>("#prizes-count")!;

    let participants: Participant[] = [];
    let prizeList: Prize[] = [];

    const refresh = (): void => {
      namesCount.textContent = `${participants.length}명`;
      prizesCount.textContent = `${prizeList.length}개`;
      const ok = participants.length > 0 && prizeList.length > 0;
      start.disabled = !ok;
      startHint.hidden = ok;
    };

    const readNames = (): void => {
      const parsed = parseParticipantsFromNames(names.value);
      participants = parsed.participants;
      if (parsed.duplicateLabels.length > 0) {
        namesDup.hidden = false;
        namesDup.textContent = `중복 이름: ${parsed.duplicateLabels.join(", ")} (내부적으로는 구분됩니다)`;
      } else {
        namesDup.hidden = true;
      }
      refresh();
    };

    names.addEventListener("input", readNames);
    prizes.addEventListener("input", () => {
      prizeList = parsePrizes(prizes.value);
      refresh();
    });
    countApply.addEventListener("click", () => {
      const n = Number(count.value);
      if (!Number.isInteger(n) || n < 1) {
        namesDup.hidden = false;
        namesDup.textContent = "1 이상의 정수를 입력하세요.";
        return;
      }
      participants = parseParticipantsFromCount(n);
      names.value = participants.map((p) => p.label).join("\n");
      namesDup.hidden = true;
      refresh();
    });

    start.addEventListener("click", () => {
      commit(
        startDrawing(participants, prizeList, createRng(), {
          missOnceMode: missOnce.checked,
        }),
      );
      wheel.reset();
      wheel.render(state.slots, state.prizes);
      rerender();
    });

    return wrap;
  }

  // ── 추첨 / 종료 화면 ───────────────────────────────
  function renderDraw(): HTMLElement {
    const wrap = document.createElement("div");
    const finished = state.phase === "finished";

    wrap.innerHTML = `
      <h1>${finished ? "추첨 종료" : "추첨 진행"}</h1>
      <div class="statusbar" aria-live="polite">
        <div class="stat"><span class="k">진행 라운드</span><span class="v" id="s-round">0</span></div>
        <div class="stat"><span class="k">남은 참가자</span><span class="v" id="s-part">0</span></div>
        <div class="stat"><span class="k">남은 경품</span><span class="v" id="s-prize">0</span></div>
      </div>
      <div class="draw-layout">
        <div id="wheel-slot"></div>
        <div>
          <div id="current-slot"></div>
          <div id="outcome-slot" aria-live="assertive"></div>
          <div id="manual-slot"></div>
          <div class="actions" id="draw-actions"></div>
          <div class="row results-head">
            <h3>당첨자 명단</h3>
            <button type="button" id="export-csv">CSV 내보내기</button>
          </div>
          <ol class="results-list" id="results"></ol>
        </div>
      </div>
    `;

    wrap.querySelector<HTMLDivElement>("#wheel-slot")!.appendChild(wheel.root);
    wheel.render(state.slots, state.prizes);

    const sRound = wrap.querySelector<HTMLElement>("#s-round")!;
    const sPart = wrap.querySelector<HTMLElement>("#s-part")!;
    const sPrize = wrap.querySelector<HTMLElement>("#s-prize")!;
    const currentSlot = wrap.querySelector<HTMLDivElement>("#current-slot")!;
    const outcomeSlot = wrap.querySelector<HTMLDivElement>("#outcome-slot")!;
    const manualSlot = wrap.querySelector<HTMLDivElement>("#manual-slot")!;
    const actions = wrap.querySelector<HTMLDivElement>("#draw-actions")!;
    const results = wrap.querySelector<HTMLOListElement>("#results")!;
    const exportBtn = wrap.querySelector<HTMLButtonElement>("#export-csv")!;

    exportBtn.disabled = state.results.length === 0;
    exportBtn.addEventListener("click", () => downloadResultsCsv(state));

    const paintStatus = (): void => {
      sRound.textContent = String(state.round);
      sPart.textContent = String(eligibleParticipants(state).length);
      sPrize.textContent = String(remainingPrizeCount(state));
    };

    const paintCurrent = (): void => {
      currentSlot.replaceChildren();
      if (finished || state.currentParticipantId === null) return;
      const p = state.participants.find((x) => x.id === state.currentParticipantId);
      if (!p) return;
      const box = document.createElement("div");
      box.className = "current";
      box.innerHTML = `<div class="k">이번 순서</div><div class="name"></div>`;
      box.querySelector<HTMLDivElement>(".name")!.textContent = p.label;
      currentSlot.appendChild(box);
    };

    const paintResults = (): void => {
      results.replaceChildren();
      for (const r of [...state.results].reverse()) {
        results.appendChild(resultRow(r));
      }
    };

    // FR-6.1 옵션: 수동 참가자 선택. 회전 중·종료 시에는 숨긴다.
    const paintManual = (): void => {
      manualSlot.replaceChildren();
      if (finished || state.isSpinning) return;
      const eligible = eligibleParticipants(state);
      if (eligible.length === 0) return;

      const field = document.createElement("div");
      field.className = "field manual-field";
      const label = document.createElement("label");
      label.setAttribute("for", "manual-pick");
      label.textContent = "다음 참가자 직접 지정 (선택)";
      const select = document.createElement("select");
      select.id = "manual-pick";
      const auto = document.createElement("option");
      auto.value = "";
      auto.textContent = "자동 (무작위)";
      select.appendChild(auto);
      for (const p of eligible) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        if (p.id === state.currentParticipantId) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        if (select.value === "") {
          commit(nextRound(state, createRng()));
        } else {
          commit(selectParticipant(state, select.value));
        }
        paintCurrent();
        paintActions();
      });
      field.append(label, select);
      manualSlot.appendChild(field);
    };

    const paintOutcome = (r: DrawResult | null): void => {
      outcomeSlot.replaceChildren();
      if (!r) return;
      const isWin = r.prizeId !== null;
      const box = document.createElement("div");
      box.className = "outcome";
      box.dataset.kind = isWin ? "win" : "miss";
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = isWin ? "당첨" : "꽝";
      const detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = isWin
        ? `${r.participantLabel} → ${r.prizeName}`
        : `${r.participantLabel} — 경품 없음`;
      box.append(tag, detail);
      outcomeSlot.appendChild(box);
    };

    const paintActions = (): void => {
      actions.replaceChildren();
      if (finished) {
        const again = document.createElement("button");
        again.className = "primary";
        again.textContent = "처음으로";
        again.addEventListener("click", () => confirmReset());
        actions.appendChild(again);
        return;
      }

      const spin = document.createElement("button");
      spin.className = "primary";
      spin.id = "spin-btn";
      spin.textContent = "돌리기";
      spin.disabled = !canSpin(state);
      spin.addEventListener("click", () => void doSpin(spin));

      const resetBtn = document.createElement("button");
      resetBtn.textContent = "초기화";
      resetBtn.addEventListener("click", () => confirmReset());

      actions.append(spin, resetBtn);
    };

    const lockInputs = (locked: boolean): void => {
      actions.querySelectorAll("button").forEach((b) => {
        b.disabled = locked || (b.id === "spin-btn" && !canSpin(state));
      });
    };

    async function doSpin(spinBtn: HTMLButtonElement): Promise<void> {
      if (!canSpin(state)) return;
      paintOutcome(null);
      // 결과 선확정 (FR-3.3, NFR-1). 회전 중 상태는 저장하지 않는다 (EC-7).
      const { state: spinning, outcome } = beginSpin(state, createRng());
      state = spinning;
      lockInputs(true); // FR-3.4 회전 중 잠금
      spinBtn.disabled = true;

      manualSlot.replaceChildren(); // 회전 중 수동 선택 숨김
      await wheel.spinTo(outcome.slotIndex, state.slots.length);

      // 확정 — 여기서부터 저장한다.
      commit(resolveSpin(state, outcome, createRng()));
      const last = state.results[state.results.length - 1] ?? null;
      paintOutcome(last);
      wheel.render(state.slots, state.prizes); // 재배치 반영 (FR-5)
      paintStatus();
      paintCurrent();
      paintResults();
      exportBtn.disabled = state.results.length === 0;

      if (state.phase === "finished") {
        rerender();
        return;
      }
      // 다음 라운드 참가자 지정 (FR-6.1 기본)
      commit(nextRound(state, createRng()));
      paintCurrent();
      paintManual();
      paintActions();
    }

    function confirmReset(): void {
      if (!window.confirm("모든 진행 상황이 지워집니다. 처음 화면으로 돌아갈까요?")) return;
      state = resetState();
      clearState();
      wheel.reset();
      rerender();
    }

    paintStatus();
    paintCurrent();
    paintManual();
    paintResults();
    paintActions();

    if (finished) {
      const summary = document.createElement("p");
      summary.className = "hint";
      const won = state.participants.filter((p) => p.status === "won").length;
      const out = state.participants.filter((p) => p.status === "out").length;
      const eligible = state.participants.filter((p) => p.status === "eligible").length;
      const parts = [`당첨 ${won}명`];
      if (eligible > 0) parts.push(`미당첨 ${eligible}명`); // EC-1: 경품 소진 후 남은 참가자
      if (out > 0) parts.push(`꽝 탈락 ${out}명`); // missOnceMode
      parts.push(`잔여 경품 ${remainingPrizeCount(state)}개`); // EC-2
      summary.textContent = parts.join(" · ");
      outcomeSlot.appendChild(summary);
    }

    return wrap;
  }

  rerender();
}

function resultRow(r: DrawResult): HTMLLIElement {
  const li = document.createElement("li");
  const round = document.createElement("span");
  round.className = "r-round";
  round.textContent = `#${r.round}`;
  const who = document.createElement("span");
  who.textContent = r.participantLabel;
  const prize = document.createElement("span");
  prize.className = "r-prize";
  if (r.prizeId === null) {
    prize.dataset.miss = "true";
    prize.textContent = "꽝";
  } else {
    prize.textContent = r.prizeName ?? "";
  }
  const time = document.createElement("span");
  time.className = "r-time";
  time.textContent = formatTime(r.timestamp);
  li.append(round, who, prize, time);
  return li;
}

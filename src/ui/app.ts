// 앱 컨트롤러 — 3화면(설정 / 추첨 / 종료). Requirement.md 6장.
// DOM 직접 조작. 상태는 도메인 모듈이 소유하고 여기서는 렌더링만 한다.

import {
  beginSpin,
  canSpin,
  createRng,
  eligibleParticipants,
  nextRound,
  parseParticipantsFromCount,
  parseParticipantsFromNames,
  parsePrizes,
  remainingPrizeCount,
  reset as resetState,
  resolveSpin,
  startDrawing,
  type AppState,
  type DrawResult,
  type Participant,
  type Prize,
} from "../domain/index.ts";
import { formatTime } from "./format.ts";
import { createWheelView } from "./wheel-view.ts";

export function mountApp(root: HTMLElement): void {
  let state: AppState = resetState();
  const wheel = createWheelView();

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
            <input type="number" id="count" min="1" placeholder="예: 30" style="max-width:160px" />
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
      state = startDrawing(participants, prizeList, createRng(), {
        missOnceMode: missOnce.checked,
      });
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
          <div class="actions" id="draw-actions"></div>
          <h3 style="margin-top:24px">당첨자 명단</h3>
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
    const actions = wrap.querySelector<HTMLDivElement>("#draw-actions")!;
    const results = wrap.querySelector<HTMLOListElement>("#results")!;

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
      // 결과 선확정 (FR-3.3, NFR-1)
      const { state: spinning, outcome } = beginSpin(state, createRng());
      state = spinning;
      lockInputs(true); // FR-3.4 회전 중 잠금
      spinBtn.disabled = true;

      await wheel.spinTo(outcome.slotIndex, state.slots.length);

      state = resolveSpin(state, outcome, createRng());
      const last = state.results[state.results.length - 1] ?? null;
      paintOutcome(last);
      wheel.render(state.slots, state.prizes); // 재배치 반영 (FR-5)
      paintStatus();
      paintCurrent();
      paintResults();

      if (state.phase === "finished") {
        rerender();
        return;
      }
      // 다음 라운드 참가자 지정 (FR-6.1 기본)
      state = nextRound(state, createRng());
      paintCurrent();
      paintActions();
    }

    function confirmReset(): void {
      if (!window.confirm("모든 진행 상황이 지워집니다. 처음 화면으로 돌아갈까요?")) return;
      state = resetState();
      wheel.reset();
      rerender();
    }

    paintStatus();
    paintCurrent();
    paintResults();
    paintActions();

    if (finished) {
      const summary = document.createElement("p");
      summary.className = "hint";
      const notWon = state.participants.filter((p) => p.status !== "won").length;
      summary.textContent = `당첨 ${state.results.filter((r) => r.prizeId).length}건 · 미당첨 참가자 ${notWon}명 · 잔여 경품 ${remainingPrizeCount(state)}개`;
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

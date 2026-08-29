// 원판 기하 — SVG 섹터 path와 회전 각도 역산. 순수 함수 (테스트 대상).
//
// 좌표계: SVG 표준. 각도는 12시 방향 0도, 시계방향 증가(도 단위).
// 포인터는 12시 고정 (원판 위, 아래를 가리킴).

export interface Point {
  x: number;
  y: number;
}

// 각도(12시 0도, 시계방향)를 SVG 좌표의 점으로.
export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// slotCount개 섹터 중 index번째 섹터의 시작/중심/끝 각도.
export interface SectorAngles {
  start: number;
  center: number;
  end: number;
}

export function sectorAngles(index: number, slotCount: number): SectorAngles {
  if (slotCount <= 0) throw new RangeError("slotCount는 1 이상이어야 합니다");
  if (index < 0 || index >= slotCount) throw new RangeError(`index 범위 밖: ${index}`);
  const step = 360 / slotCount;
  const start = index * step;
  return { start, center: start + step / 2, end: start + step };
}

// 섹터 하나의 SVG path d 속성. slotCount=1이면 원 전체를 그린다.
export function sectorPath(
  cx: number,
  cy: number,
  r: number,
  index: number,
  slotCount: number,
): string {
  if (slotCount === 1) {
    // 단일 섹터: 두 개의 반원 호로 완전한 원.
    const top = polarToCartesian(cx, cy, r, 0);
    const bottom = polarToCartesian(cx, cy, r, 180);
    return [
      `M ${top.x} ${top.y}`,
      `A ${r} ${r} 0 0 1 ${bottom.x} ${bottom.y}`,
      `A ${r} ${r} 0 0 1 ${top.x} ${top.y}`,
      "Z",
    ].join(" ");
  }
  const { start, end } = sectorAngles(index, slotCount);
  const p1 = polarToCartesian(cx, cy, r, start);
  const p2 = polarToCartesian(cx, cy, r, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${p1.x} ${p1.y}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    "Z",
  ].join(" ");
}

// 라벨 위치 — 섹터 중심 각도, 반지름의 62% 지점.
export function labelPosition(
  cx: number,
  cy: number,
  r: number,
  index: number,
  slotCount: number,
): Point {
  const center = slotCount === 1 ? 0 : sectorAngles(index, slotCount).center;
  return polarToCartesian(cx, cy, r * 0.62, center);
}

// ── 회전 각도 역산 (FR-3.3의 핵심) ────────────────────────────────
//
// 결과(targetIndex)가 먼저 정해진 뒤, 원판이 그 섹터의 중심을 12시 포인터에
// 오도록 회전해야 한다. 원판을 시계방향으로 θ 회전하면 섹터 중심 각도도 θ
// 만큼 커진다. 12시(0도)에 오려면 최종 각도가 360의 배수여야 한다.
//
//   center + rotation ≡ 0 (mod 360)
//   rotation ≡ -center (mod 360)
//
// 여기에 최소 회전 바퀴 수(turns)를 더해 연출을 만든다. 반환값은 CSS
// transform: rotate()에 넣을 누적 각도(현재 각도에서 이만큼 "더" 돌린다).

export interface SpinRotationInput {
  currentRotation: number; // 현재 원판의 누적 회전각(도)
  targetIndex: number;
  slotCount: number;
  turns?: number; // 최소 추가 바퀴 수 (기본 5)
  jitter?: number; // 섹터 중심에서 벗어날 최대 각도(도). 0이면 정중앙. 기본 0
}

export function computeSpinRotation(input: SpinRotationInput): number {
  const { currentRotation, targetIndex, slotCount } = input;
  const turns = input.turns ?? 5;
  const jitter = input.jitter ?? 0;
  if (turns < 0) throw new RangeError("turns는 음수일 수 없습니다");

  const center = slotCount === 1 ? 0 : sectorAngles(targetIndex, slotCount).center;

  // 현재 각도를 [0,360) 정규화한 뒤, 목표 정렬각까지의 양의 차이를 구한다.
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const desiredMod = ((-center % 360) + 360) % 360;
  let delta = desiredMod - currentMod;
  if (delta < 0) delta += 360;

  // jitter: 섹터 폭 안에서만 흔든다 (경계를 넘지 않도록 절반 폭으로 클램프).
  let offset = 0;
  if (jitter > 0) {
    const halfSector = 360 / slotCount / 2;
    const clamped = Math.min(jitter, halfSector * 0.8);
    offset = (Math.random() * 2 - 1) * clamped;
  }

  return currentRotation + turns * 360 + delta + offset;
}

// 검증용: 주어진 최종 회전각에서 12시 포인터가 가리키는 섹터 index.
export function slotAtPointer(finalRotation: number, slotCount: number): number {
  if (slotCount === 1) return 0;
  const step = 360 / slotCount;
  // 포인터는 0도 고정. 원판이 finalRotation 회전했으므로, 포인터 아래
  // 원판 좌표계 각도는 (-finalRotation) mod 360.
  const angleUnderPointer = ((-finalRotation % 360) + 360) % 360;
  return Math.floor(angleUnderPointer / step) % slotCount;
}

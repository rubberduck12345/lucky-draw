// 참가자·경품 입력 파싱 — Requirement.md 3.1, 3.2.

import type { Participant, Prize } from "./types.ts";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}

// 테스트에서 id를 재현하려면 시퀀스를 리셋한다. 프로덕션에서는 호출하지 않는다.
export function _resetIdSeqForTest(): void {
  seq = 0;
}

export interface ParseParticipantsResult {
  participants: Participant[];
  duplicateLabels: string[]; // 중복 경고용 (FR-1.2). 내부 id는 항상 고유.
}

// 줄바꿈/쉼표로 구분된 이름 목록. 빈 값·공백만 있는 항목은 무시 (FR-1.3).
export function parseParticipantsFromNames(raw: string): ParseParticipantsResult {
  const labels = raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seenCount = new Map<string, number>();
  for (const label of labels) {
    seenCount.set(label, (seenCount.get(label) ?? 0) + 1);
  }
  const duplicateLabels = [...seenCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([label]) => label);

  const participants = labels.map((label) => ({
    id: nextId("p"),
    label,
    status: "eligible" as const,
  }));

  return { participants, duplicateLabels };
}

// 인원 수 N → 1..N 번호 자동 생성 (FR-1.1b).
export function parseParticipantsFromCount(count: number): Participant[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`참가자 수는 1 이상의 정수여야 합니다 (받은 값: ${count})`);
  }
  return Array.from({ length: count }, (_, i) => ({
    id: nextId("p"),
    label: String(i + 1),
    status: "eligible" as const,
  }));
}

// 줄바꿈으로 구분된 경품 목록. 각 줄 = 1개 (FR-2.1, FR-2.2). 빈 줄 무시.
export function parsePrizes(raw: string): Prize[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((name) => ({ id: nextId("z"), name, consumed: false }));
}

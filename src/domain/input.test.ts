import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdSeqForTest,
  parseParticipantsFromCount,
  parseParticipantsFromNames,
  parsePrizes,
} from "./input.ts";

beforeEach(() => {
  _resetIdSeqForTest();
});

describe("parseParticipantsFromNames", () => {
  it("줄바꿈과 쉼표를 모두 구분자로 쓴다", () => {
    const { participants } = parseParticipantsFromNames("김철수, 이영희\n박민수");
    expect(participants.map((p) => p.label)).toEqual(["김철수", "이영희", "박민수"]);
  });

  it("빈 값·공백만 있는 항목은 무시 (FR-1.3)", () => {
    const { participants } = parseParticipantsFromNames("김철수,,  ,\n\n이영희\n   ");
    expect(participants.map((p) => p.label)).toEqual(["김철수", "이영희"]);
  });

  it("모든 참가자는 고유 id를 가진다", () => {
    const { participants } = parseParticipantsFromNames("A\nA\nA");
    const ids = participants.map((p) => p.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("중복 이름을 경고 목록으로 돌려준다 (FR-1.2)", () => {
    const { duplicateLabels } = parseParticipantsFromNames("A\nB\nA\nC\nB\nB");
    expect(duplicateLabels.sort()).toEqual(["A", "B"]);
  });

  it("중복이 없으면 빈 경고 목록", () => {
    const { duplicateLabels } = parseParticipantsFromNames("A\nB\nC");
    expect(duplicateLabels).toEqual([]);
  });

  it("모든 참가자는 eligible 상태로 시작", () => {
    const { participants } = parseParticipantsFromNames("A\nB");
    expect(participants.every((p) => p.status === "eligible")).toBe(true);
  });

  it("빈 입력이면 참가자 0명", () => {
    expect(parseParticipantsFromNames("   \n\n , ").participants).toEqual([]);
  });
});

describe("parseParticipantsFromCount", () => {
  it("N을 받으면 1..N 번호를 만든다 (FR-1.1b)", () => {
    const participants = parseParticipantsFromCount(4);
    expect(participants.map((p) => p.label)).toEqual(["1", "2", "3", "4"]);
  });

  it("0 이하 또는 비정수면 예외", () => {
    expect(() => parseParticipantsFromCount(0)).toThrow(RangeError);
    expect(() => parseParticipantsFromCount(-1)).toThrow(RangeError);
    expect(() => parseParticipantsFromCount(3.5)).toThrow(RangeError);
  });
});

describe("parsePrizes", () => {
  it("각 줄이 경품 1개 (FR-2.2)", () => {
    const prizes = parsePrizes("에어팟\n에어팟\n기프티콘");
    expect(prizes.map((z) => z.name)).toEqual(["에어팟", "에어팟", "기프티콘"]);
  });

  it("같은 이름도 서로 다른 id", () => {
    const prizes = parsePrizes("커피\n커피");
    expect(prizes[0]!.id).not.toBe(prizes[1]!.id);
  });

  it("빈 줄·공백 줄은 무시", () => {
    const prizes = parsePrizes("A\n\n   \nB\n");
    expect(prizes.map((z) => z.name)).toEqual(["A", "B"]);
  });

  it("모든 경품은 consumed=false로 시작", () => {
    const prizes = parsePrizes("A\nB");
    expect(prizes.every((z) => !z.consumed)).toBe(true);
  });

  it("쉼표는 구분자가 아니다 (경품명에 쉼표 허용)", () => {
    const prizes = parsePrizes("커피, 디저트 세트");
    expect(prizes.map((z) => z.name)).toEqual(["커피, 디저트 세트"]);
  });
});

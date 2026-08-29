import { describe, expect, it } from "vitest";
import { formatTime, resultsToCsv } from "./format.ts";

describe("formatTime", () => {
  it("HH:MM:SS, 0 패딩", () => {
    const t = new Date(2026, 5, 13, 9, 5, 3).getTime();
    expect(formatTime(t)).toBe("09:05:03");
  });
});

describe("resultsToCsv", () => {
  it("헤더 + 행, 꽝은 '꽝'으로", () => {
    const t = new Date(2026, 0, 1, 12, 0, 0).getTime();
    const csv = resultsToCsv([
      { round: 1, participantLabel: "김철수", prizeName: "에어팟", timestamp: t },
      { round: 2, participantLabel: "이영희", prizeName: null, timestamp: t },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("라운드,참가자,경품,시각");
    expect(lines[1]).toBe("1,김철수,에어팟,12:00:00");
    expect(lines[2]).toBe("2,이영희,꽝,12:00:00");
  });

  it("쉼표·따옴표·줄바꿈 포함 값은 큰따옴표로 이스케이프", () => {
    const t = Date.now();
    const csv = resultsToCsv([
      { round: 1, participantLabel: '홍, "길동"', prizeName: "커피\n세트", timestamp: t },
    ]);
    expect(csv.split("\n")[1]).toContain('"홍, ""길동"""');
  });

  it("빈 목록이면 헤더만", () => {
    expect(resultsToCsv([])).toBe("라운드,참가자,경품,시각");
  });
});

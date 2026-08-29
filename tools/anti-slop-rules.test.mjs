import { describe, expect, it } from "vitest";
import { RULES } from "./anti-slop-rules.mjs";

function rule(id) {
  const r = RULES.find((x) => x.id === id);
  if (!r) throw new Error(`규칙 없음: ${id}`);
  return r;
}
const hits = (id, content) => rule(id).test(content).length > 0;

describe("AS-TXT-1 이모지", () => {
  it("이모지를 잡는다", () => {
    expect(hits("AS-TXT-1", 'btn.textContent = "완료 ✅"')).toBe(true);
    expect(hits("AS-TXT-1", "# 축하합니다 🎉")).toBe(true);
    expect(hits("AS-TXT-1", '"🔥 인기"')).toBe(true);
  });
  it("텍스트 기호는 통과 (↔ ™ © ® → …)", () => {
    expect(hits("AS-TXT-1", "// computeSpinRotation ↔ slotAtPointer")).toBe(false);
    expect(hits("AS-TXT-1", '"™ © ® § ¶ → ← …"')).toBe(false);
  });
});

describe("AS-TXT-2 마케팅 보일러플레이트", () => {
  it("금지어를 잡는다", () => {
    for (const w of ["Seamlessly", "elevate", "unlock", "empower", "supercharge", "leverage", "effortless", "world-class"]) {
      expect(hits("AS-TXT-2", `"${w} your workflow"`)).toBe(true);
    }
  });
  it("무관한 단어는 통과", () => {
    expect(hits("AS-TXT-2", '"the lever and the level"')).toBe(false);
    expect(hits("AS-TXT-2", '"참가자 명단"')).toBe(false);
  });
});

describe("AS-TXT-3 한국어 과장 카피", () => {
  it("과장 표현을 잡는다", () => {
    expect(hits("AS-TXT-3", '"손쉽게 추첨"')).toBe(true);
    expect(hits("AS-TXT-3", '"혁신적인 경험"')).toBe(true);
    expect(hits("AS-TXT-3", '"놀라운 결과"')).toBe(true);
  });
  it("담백한 표현은 통과", () => {
    expect(hits("AS-TXT-3", '"참가자와 경품을 입력한 뒤 추첨을 시작합니다"')).toBe(false);
  });
});

describe("CSS 디자인 규칙은 제거됐다 (v0.3)", () => {
  it("AS-CSS-* 규칙이 더 이상 없다", () => {
    expect(RULES.some((r) => r.id.startsWith("AS-CSS-"))).toBe(false);
  });
  it("targets에 css가 없다", () => {
    expect(RULES.some((r) => r.targets.includes("css"))).toBe(false);
  });
});

describe("규칙 커버리지", () => {
  it("모든 규칙에 id/targets/test가 있다", () => {
    for (const r of RULES) {
      expect(typeof r.id).toBe("string");
      expect(Array.isArray(r.targets)).toBe(true);
      expect(typeof r.test).toBe("function");
    }
  });
});

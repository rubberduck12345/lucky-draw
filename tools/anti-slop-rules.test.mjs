import { describe, expect, it } from "vitest";
import { RULES } from "./anti-slop-rules.mjs";

function rule(id) {
  const r = RULES.find((x) => x.id === id);
  if (!r) throw new Error(`규칙 없음: ${id}`);
  return r;
}
const hits = (id, content) => rule(id).test(content).length > 0;

describe("AS-CSS-1 그라데이션", () => {
  it("linear/radial/conic-gradient를 잡는다", () => {
    expect(hits("AS-CSS-1", ".x{background:linear-gradient(#fff,#000)}")).toBe(true);
    expect(hits("AS-CSS-1", ".x{background:radial-gradient(circle,#fff,#000)}")).toBe(true);
    expect(hits("AS-CSS-1", ".x{background-image:conic-gradient(#111,#222)}")).toBe(true);
  });
  it("일반 색은 통과", () => {
    expect(hits("AS-CSS-1", ".x{background:#f0f0f0;color:var(--accent)}")).toBe(false);
  });
  it("주석 안의 인용은 무시", () => {
    expect(hits("AS-CSS-1", "/* linear-gradient 금지 */ .x{color:#000}")).toBe(false);
  });
});

describe("AS-CSS-2 그라데이션 텍스트", () => {
  it("background-clip: text를 잡는다", () => {
    expect(hits("AS-CSS-2", ".x{-webkit-background-clip:text}")).toBe(true);
  });
});

describe("AS-CSS-6 backdrop-filter", () => {
  it("backdrop-filter를 잡는다", () => {
    expect(hits("AS-CSS-6", ".x{backdrop-filter:blur(10px)}")).toBe(true);
    expect(hits("AS-CSS-6", ".x{-webkit-backdrop-filter:saturate(1.2)}")).toBe(true);
  });
});

describe("AS-CSS-7 filter blur/drop-shadow", () => {
  it("blur, drop-shadow를 잡는다", () => {
    expect(hits("AS-CSS-7", ".x{filter:blur(4px)}")).toBe(true);
    expect(hits("AS-CSS-7", ".x{filter:drop-shadow(0 0 8px #000)}")).toBe(true);
  });
  it("grayscale 등 다른 filter는 통과", () => {
    expect(hits("AS-CSS-7", ".x{filter:grayscale(1)}")).toBe(false);
  });
});

describe("AS-CSS-8 text-shadow", () => {
  it("값이 있으면 잡고 none은 통과", () => {
    expect(hits("AS-CSS-8", ".x{text-shadow:0 1px 0 #000}")).toBe(true);
    expect(hits("AS-CSS-8", ".x{text-shadow:none}")).toBe(false);
  });
});

describe("AS-CSS-9 장식 키프레임", () => {
  it("pulse/shimmer/float/glow/shine/gradient/breathe/wobble/bounce", () => {
    for (const name of ["pulse", "shimmer", "float-up", "softGlow", "shine", "wobble", "bounce"]) {
      expect(hits("AS-CSS-9", `@keyframes ${name} { from{} to{} }`)).toBe(true);
    }
  });
  it("기능적 키프레임 이름은 통과", () => {
    expect(hits("AS-CSS-9", "@keyframes spin-to-result { }")).toBe(false);
  });
});

describe("AS-CSS-16 배경 장식", () => {
  it("background url(), repeating-gradient, mask url()", () => {
    expect(hits("AS-CSS-16", ".x{background:url(dots.svg) repeat}")).toBe(true);
    expect(hits("AS-CSS-16", ".x{background-image:repeating-linear-gradient(#000 0 2px,#fff 2px 4px)}")).toBe(true);
    expect(hits("AS-CSS-16", ".x{mask-image:url(fade.png)}")).toBe(true);
  });
  it("@font-face의 src url()은 통과", () => {
    expect(hits("AS-CSS-16", "@font-face{font-family:X;src:url(x.woff2) format('woff2')}")).toBe(false);
  });
  it("mask:none은 통과", () => {
    expect(hits("AS-CSS-16", ".x{mask:none}")).toBe(false);
  });
});

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

describe("규칙 커버리지", () => {
  it("모든 규칙에 id/targets/test가 있다", () => {
    for (const r of RULES) {
      expect(typeof r.id).toBe("string");
      expect(Array.isArray(r.targets)).toBe(true);
      expect(typeof r.test).toBe("function");
    }
  });
});

import { describe, expect, it } from "vitest";
import stylelint from "stylelint";

const config = {
  plugins: ["./tools/stylelint-plugin-anti-slop/index.mjs"],
  rules: { "anti-slop/no-slop": true },
};

async function lint(code) {
  const res = await stylelint.lint({ code, config });
  const warnings = res.results[0]?.warnings ?? [];
  return warnings.map((w) => w.text);
}
const clean = async (code) => expect(await lint(code)).toEqual([]);
const flags = async (code, rule) => {
  const w = await lint(code);
  expect(w.join(" ")).toContain(rule);
};

describe("AS-CSS-3 유채색 box-shadow", () => {
  it("색 그림자를 잡는다", () => flags(".x{box-shadow:0 1px 2px rgba(255,0,0,.3)}", "AS-CSS-3"));
  it("무채색 그림자는 통과", () => clean(".x{box-shadow:0 1px 2px rgba(0,0,0,.06)}"));
  it("회색 hex 그림자는 통과", () => clean(".x{box-shadow:0 1px 2px #00000010}"));
});

describe("AS-CSS-4 blur ≥ 20px", () => {
  it("blur 24px를 잡는다", () => flags(".x{box-shadow:0 4px 24px rgba(0,0,0,.1)}", "AS-CSS-4"));
  it("blur 12px는 통과", () => clean(".x{box-shadow:0 2px 12px rgba(0,0,0,.08)}"));
});

describe("AS-CSS-5 다중 레이어 box-shadow", () => {
  it("쉼표로 2개는 잡는다", () =>
    flags(".x{box-shadow:0 1px 2px #0001, 0 4px 8px #0002}", "AS-CSS-5"));
  it("단일 레이어는 통과", () => clean(".x{box-shadow:0 1px 2px rgba(0,0,0,.06)}"));
});

describe("AS-CSS-10 animation", () => {
  it("일반 셀렉터의 animation을 잡는다", () => flags(".card{animation:fade 1s}", "AS-CSS-10"));
  it("원판 회전 셀렉터는 통과", () => clean("svg.wheel .wheel-rotor{animation:none}"));
  it(".wheel-rotor의 animation은 통과", () => clean(".wheel-rotor{animation:spin 4s linear}"));
});

describe("AS-CSS-11 transition 대상", () => {
  it("transform 전이를 잡는다", () => flags(".x{transition:transform 120ms}", "AS-CSS-11"));
  it("all 전이를 잡는다", () => flags(".x{transition:all 100ms}", "AS-CSS-11"));
  it("색·투명도 전이는 통과", () =>
    clean(".x{transition:background-color 120ms, opacity 100ms}"));
});

describe("AS-CSS-12 transition 시간", () => {
  it("200ms를 잡는다", () => flags(".x{transition:color 200ms}", "AS-CSS-12"));
  it("0.3s를 잡는다", () => flags(".x{transition:color 0.3s}", "AS-CSS-12"));
  it("150ms는 통과", () => clean(".x{transition:color 150ms}"));
  it("원판 회전의 4200ms는 통과", () =>
    clean(".wheel-rotor{transition:transform 4200ms cubic-bezier(0.16,0.84,0.3,1)}"));
});

describe("AS-CSS-13 :hover transform", () => {
  it(":hover 안의 transform을 잡는다", () =>
    flags(".btn:hover{transform:translateY(-2px)}", "AS-CSS-13"));
  it("일반 상태의 transform은 통과", () => clean(".pointer{transform:translateX(-50%)}"));
});

describe("AS-CSS-14 border-radius", () => {
  it("12px를 잡는다", () => flags(".x{border-radius:12px}", "AS-CSS-14"));
  it("8px는 통과", () => clean(".x{border-radius:8px}"));
  it("50%는 잡는다 (화이트리스트 밖)", () => flags(".avatar{border-radius:50%}", "AS-CSS-14"));
  it("원판 회전 스코프의 50%는 통과", () => clean(".wheel-rotor circle{border-radius:50%}"));
});

describe("AS-CSS-15 유채색 리터럴", () => {
  it("유채색 hex를 잡는다", () => flags(".x{color:#1c5d3a}", "AS-CSS-15"));
  it("색 키워드를 잡는다", () => flags(".x{background:crimson}", "AS-CSS-15"));
  it("var() 토큰은 통과", () => clean(".x{color:var(--accent);background:var(--bg)}"));
  it("무채색 hex는 통과", () => clean(".x{color:#1a1a1a;background:#fafafa}"));
  it("transparent/currentColor는 통과", () => clean(".x{background:transparent;fill:currentColor}"));
});

describe("폰트 fallback", () => {
  it("첫 지정이 Inter면 잡는다", () => flags("body{font-family:Inter, sans-serif}", "폰트"));
  it("IBM Plex가 앞이면 통과", () =>
    clean('body{font-family:"IBM Plex Sans KR", -apple-system, sans-serif}'));
});

describe("실제 style.css", () => {
  it("우리 스타일시트는 통과", async () => {
    const fs = await import("node:fs");
    const css = fs.readFileSync("src/style.css", "utf8");
    expect(await lint(css)).toEqual([]);
  });
});

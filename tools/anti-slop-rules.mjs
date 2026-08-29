// Anti-AI-Slop Lint 규칙 정의 (Requirement.md 8.4.1).
//
// v0.3부터 CSS 디자인 규칙(AS-CSS-*)은 제거됐다 — 원판에 축제형 색상·
// 폭죽/풍선 연출을 넣기로 하면서 "무채색 + 액센트 1색, 장식 모션 금지"
// 제약을 걷어냈기 때문이다. 남은 것은 텍스트/카피 규칙뿐이다:
// 이모지 금지, 마케팅 보일러플레이트 금지.
//
// 각 규칙: { id, targets: ("text"|"md")[], test(content) => [{line, col, excerpt}] }

function findAll(content, regex) {
  const hits = [];
  const lines = content.split("\n");
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  lines.forEach((lineText, i) => {
    const re = new RegExp(regex.source, flags);
    let m;
    while ((m = re.exec(lineText)) !== null) {
      hits.push({ line: i + 1, col: m.index + 1, excerpt: m[0].slice(0, 80) });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  });
  return hits;
}

export const RULES = [
  // ── 텍스트/카피 ─────────────────────────────────────
  {
    id: "AS-TXT-1",
    targets: ["text"],
    desc: "이모지 금지 (UI 카피·불릿·라벨)",
    test: (c) => {
      // 기본 이모지 표현(Emoji_Presentation), VS16(️)로 강제된 이모지,
      // 지역 표시자(국기), 스킨톤/ZWJ 시퀀스만 잡는다.
      // ↔ ™ © 등 텍스트 표현이 기본인 기호는 통과.
      const re =
        /\p{Emoji_Presentation}|\p{Emoji}️|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍\p{Emoji}/u;
      return findAll(c, re);
    },
  },
  {
    id: "AS-TXT-2",
    targets: ["text"],
    desc: "마케팅 보일러플레이트 단어 금지",
    test: (c) =>
      findAll(
        c,
        /\b(seamlessly?|elevate|unlock|empower|supercharge|revolution(?:ary|ize)|game[- ]?chang(?:er|ing)|cutting[- ]?edge|leverage|synerg(?:y|ies|ize)|effortless(?:ly)?|delight(?:ful)?|world[- ]?class|next[- ]?level|unleash)\b/i,
      ),
  },
  {
    id: "AS-TXT-3",
    targets: ["text"],
    desc: "한국어 과장 카피 금지",
    test: (c) =>
      findAll(c, /(혁신적|손쉽게|놀라운|최고의 경험|매끄러운|한 차원 높은|한차원 높은)/),
  },

  // ── Markdown ────────────────────────────────────────
  {
    id: "AS-MD-1",
    targets: ["md"],
    desc: "blockquote 좌측 테두리 커스텀 색/타원 금지 (문서 CSS)",
    test: (c) => {
      const out = [];
      // 마크다운 파일에 인라인 <style>가 있을 때만 의미.
      const styleBlocks = [...c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
      for (const block of styleBlocks) {
        const css = block[1];
        if (/blockquote[^{]*\{[^}]*border-left[^}]*\}/i.test(css)) {
          out.push({ line: 1, col: 1, excerpt: "blockquote border-left in <style>" });
        }
      }
      return out;
    },
  },
];

export { findAll };

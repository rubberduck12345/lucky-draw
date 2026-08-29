// Anti-AI-Slop Lint 규칙 정의 (Requirement.md 8.4.1).
//
// 정규식으로 판정 가능한 규칙만 여기 둔다. 값 파싱이 필요한
// AS-CSS-3/4/5/12/14/15 는 tools/stylelint-plugin-anti-slop 가 AST로 검사한다.
//
// 각 규칙: { id, targets: ("css"|"text")[], test(content) => [{line, col, excerpt}] }

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

// CSS 주석과 문자열을 공백으로 치환해 오탐을 줄인다 (규칙 인용 방지).
function stripCssNoise(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/'(?:[^'\\]|\\.)*'/g, (m) => m.replace(/[^\n]/g, " "));
}

const KEYFRAME_NAMES = /pulse|shimmer|float|glow|shine|gradient|breathe|wobble|bounce/i;

export const RULES = [
  // ── CSS: 정규식 판정 ────────────────────────────────
  {
    id: "AS-CSS-1",
    targets: ["css"],
    desc: "그라데이션 함수 금지",
    test: (c) => findAll(stripCssNoise(c), /(linear|radial|conic)-gradient\s*\(/i),
  },
  {
    id: "AS-CSS-2",
    targets: ["css"],
    desc: "background-clip: text 금지 (그라데이션 텍스트)",
    test: (c) => findAll(stripCssNoise(c), /background-clip\s*:\s*text/i),
  },
  {
    id: "AS-CSS-6",
    targets: ["css"],
    desc: "backdrop-filter 금지 (글래스모피즘)",
    test: (c) => findAll(stripCssNoise(c), /(?:-webkit-)?backdrop-filter\s*:/i),
  },
  {
    id: "AS-CSS-7",
    targets: ["css"],
    desc: "filter: blur() / drop-shadow() 금지",
    test: (c) =>
      findAll(stripCssNoise(c), /[^-]filter\s*:\s*[^;]*(blur|drop-shadow)\s*\(/i),
  },
  {
    id: "AS-CSS-8",
    targets: ["css"],
    desc: "text-shadow 금지",
    test: (c) =>
      findAll(stripCssNoise(c), /text-shadow\s*:\s*(?!none)[^;]+/i),
  },
  {
    id: "AS-CSS-9",
    targets: ["css"],
    desc: "장식 키프레임 금지 (pulse/shimmer/float/glow/shine/gradient/breathe/wobble/bounce)",
    test: (c) => {
      const src = stripCssNoise(c);
      const hits = findAll(src, new RegExp(`@keyframes\\s+[\\w-]*(${KEYFRAME_NAMES.source})`, "i"));
      return hits;
    },
  },
  {
    id: "AS-CSS-16",
    targets: ["css"],
    desc: "배경 장식 금지 — background/mask 의 url(), repeating-gradient, mask-image",
    test: (c) => {
      const src = stripCssNoise(c);
      const out = [];
      out.push(...findAll(src, /(?:-webkit-)?mask(?:-image)?\s*:\s*(?!none)[^;]*url\s*\(/i));
      out.push(...findAll(src, /background(?:-image)?\s*:\s*[^;]*repeating-(?:linear|radial|conic)-gradient/i));
      out.push(...findAll(src, /background(?:-image)?\s*:\s*[^;]*url\s*\(/i));
      return out;
    },
  },

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

export { findAll, stripCssNoise };

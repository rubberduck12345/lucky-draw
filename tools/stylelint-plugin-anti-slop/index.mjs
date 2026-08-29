// stylelint 플러그인 — Anti-AI-Slop 중 값 파싱이 필요한 규칙 (Requirement.md 8.4.1).
// AST(선언 노드)를 순회하며 검사한다. 정규식으로 잡히는 규칙은
// tools/anti-slop-lint.mjs 가 담당.
//
// 규칙: anti-slop/no-slop (단일 규칙, 옵션 true)

import stylelint from "stylelint";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ruleName = "anti-slop/no-slop";
const messages = stylelint.utils.ruleMessages(ruleName, {
  coloredShadow: (v) => `[AS-CSS-3] box-shadow 색은 무채색만 허용 (받은 값: ${v})`,
  bigBlur: (v) => `[AS-CSS-4] box-shadow blur 반경 20px 미만이어야 함 (받은 값: ${v})`,
  multiShadow: () => `[AS-CSS-5] box-shadow는 단일 레이어만 (쉼표로 여러 개 금지)`,
  animation: (v) => `[AS-CSS-10] animation 금지 — 원판 회전 셀렉터만 예외 (받은 값: ${v})`,
  transitionProp: (v) => `[AS-CSS-11] transition 대상은 색·투명도류만 (받은 값: ${v})`,
  transitionDuration: (v) => `[AS-CSS-12] transition-duration은 150ms 이하 (받은 값: ${v})`,
  hoverTransform: () => `[AS-CSS-13] :hover/:focus/:active 에서 transform 금지 (장식 모션)`,
  bigRadius: (v) => `[AS-CSS-14] border-radius는 8px 이하, 원 모양은 화이트리스트만 (받은 값: ${v})`,
  colorLiteral: (v) => `[AS-CSS-15] 유채색은 var(--*) 토큰 경유. 리터럴 금지 (받은 값: ${v})`,
  fontFallback: (v) => `[AS-CSS-폰트] 첫 font-family가 system 기본값으로 수렴 (받은 값: ${v})`,
});

// ── 화이트리스트 ──────────────────────────────────────
function loadAllowlist() {
  const p = path.resolve(__dirname, "../anti-slop-allowlist.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { wheelRotationSelectors: [".wheel-rotor"], approvedBadgeClasses: [] };
  }
}
const allow = loadAllowlist();
const WHEEL_SELECTORS = allow.wheelRotationSelectors ?? [".wheel-rotor"];

function inWheelRotationScope(rule) {
  if (!rule || rule.type !== "rule") return false;
  return WHEEL_SELECTORS.some((sel) => rule.selector.includes(sel));
}

function parentSelectorHasState(decl) {
  const rule = decl.parent;
  if (!rule || rule.type !== "rule") return false;
  return /:(hover|focus|focus-visible|active)\b/.test(rule.selector);
}

// ── 색 판정 ───────────────────────────────────────────
const NEUTRAL_KEYWORDS = new Set([
  "transparent", "currentcolor", "inherit", "initial", "unset", "revert",
  "black", "white", "gray", "grey", "none",
]);

function isNeutralHex(hex) {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return false;
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return r === g && g === b; // 무채색 = R=G=B
}

function isNeutralRgb(fn) {
  const nums = fn.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return false;
  return nums[0] === nums[1] && nums[1] === nums[2];
}

// 값에서 "유채색 리터럴"을 찾는다. var() 안은 검사하지 않는다.
function findColoredLiteral(value) {
  const stripped = value.replace(/var\([^)]*\)/g, " ");
  const hexes = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  for (const hex of hexes) if (!isNeutralHex(hex)) return hex;
  const fns = stripped.match(/(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi) ?? [];
  for (const fn of fns) {
    if (/^rgba?\(/i.test(fn)) {
      if (!isNeutralRgb(fn)) return fn;
    } else {
      return fn;
    }
  }
  const words = stripped.match(/\b[a-z]{3,}\b/gi) ?? [];
  const CSS_COLOR_WORDS = /^(red|blue|green|yellow|orange|purple|pink|violet|indigo|magenta|cyan|teal|lime|olive|maroon|navy|aqua|fuchsia|silver|gold|coral|salmon|crimson|khaki|plum|orchid|tomato|turquoise|tan|beige|brown|chocolate|firebrick|forestgreen|goldenrod|hotpink|lavender|lightblue|lightgreen|midnightblue|rebeccapurple|royalblue|seagreen|skyblue|slateblue|springgreen|steelblue)$/i;
  for (const w of words) if (CSS_COLOR_WORDS.test(w)) return w;
  return null;
}

function toPx(token) {
  const m = String(token).match(/^(-?[\d.]+)(px|em|rem)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? "px";
  return unit === "px" ? n : n * 16;
}

function toMs(token) {
  const m = String(token).match(/^([\d.]+)(ms|s)$/);
  if (!m) return null;
  return m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const SYSTEM_FONT_FIRST = /^["']?(inter|roboto|arial|helvetica|helvetica neue|system-ui|-apple-system|blinkmacsystemfont|sans-serif|ui-sans-serif)["']?$/i;

const rule = (primary) => {
  return (root, result) => {
    const valid = stylelint.utils.validateOptions(result, ruleName, { actual: primary });
    if (!valid || !primary) return;

    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      const value = decl.value;
      const report = (message) =>
        stylelint.utils.report({ result, ruleName, node: decl, message });

      // AS-CSS-5 / 3 / 4 : box-shadow
      if (prop === "box-shadow" && value.toLowerCase() !== "none") {
        const layers = splitTopLevel(value);
        if (layers.length > 1) report(messages.multiShadow());
        for (const layer of layers) {
          const colored = findColoredLiteral(layer);
          if (colored) report(messages.coloredShadow(colored));
          // 색 함수(rgba(...))·inset 키워드를 걷어내고 남은 길이 토큰만.
          const geom = layer
            .replace(/(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)/gi, " ")
            .replace(/\b(inset|initial|inherit)\b/gi, " ")
            .replace(/#[0-9a-fA-F]{3,8}\b/g, " ")
            .trim();
          const lengths = (geom.match(/-?[\d.]+(px|em|rem)?/g) ?? [])
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => (/^-?[\d.]+$/.test(t) ? parseFloat(t) : toPx(t)));
          // 토큰 순서: offset-x, offset-y, blur, spread
          if (lengths.length >= 3 && lengths[2] != null && Math.abs(lengths[2]) >= 20) {
            report(messages.bigBlur(`${lengths[2]}px`));
          }
        }
      }

      // AS-CSS-10 : animation
      if ((prop === "animation" || prop === "animation-name") && value.toLowerCase() !== "none") {
        if (!inWheelRotationScope(decl.parent)) report(messages.animation(value));
      }

      // AS-CSS-11 / 12 : transition
      if (prop === "transition" || prop === "transition-property") {
        const props = prop === "transition"
          ? splitTopLevel(value).map((seg) => seg.trim().split(/\s+/)[0])
          : splitTopLevel(value).map((s) => s.trim());
        const BANNED = /^(transform|all|box-shadow|width|height|filter|top|left|right|bottom|margin|padding)$/i;
        for (const p of props) {
          if (BANNED.test(p) && !inWheelRotationScope(decl.parent)) {
            report(messages.transitionProp(p));
          }
        }
      }
      if (prop === "transition" || prop === "transition-duration") {
        const times = (value.match(/[\d.]+m?s\b/g) ?? []).map(toMs).filter((n) => n != null);
        for (const ms of times) {
          if (ms > 150 && !inWheelRotationScope(decl.parent)) {
            report(messages.transitionDuration(`${ms}ms`));
          }
        }
      }

      // AS-CSS-13 : :hover 등에서 transform
      if (prop === "transform" && value.toLowerCase() !== "none" && parentSelectorHasState(decl)) {
        report(messages.hoverTransform());
      }

      // AS-CSS-14 : border-radius
      if (/^border(-[a-z]+)?-radius$/.test(prop) || prop === "border-radius") {
        const tokens = value.split(/[\s/]+/).filter(Boolean);
        for (const t of tokens) {
          if (/%$/.test(t) || /^\d{4,}px$/.test(t) || /vmax|vmin|vh|vw/.test(t)) {
            if (!inWheelRotationScope(decl.parent)) report(messages.bigRadius(t));
            continue;
          }
          const px = toPx(t);
          if (px != null && px > 8) report(messages.bigRadius(t));
        }
      }

      // AS-CSS-15 : 유채색 리터럴 (색 관련 속성만)
      if (
        /color$/.test(prop) ||
        prop === "background" ||
        prop === "fill" ||
        prop === "stroke" ||
        prop === "outline" ||
        prop === "border" ||
        /^border-(top|right|bottom|left)$/.test(prop)
      ) {
        const colored = findColoredLiteral(value);
        if (colored && !NEUTRAL_KEYWORDS.has(colored.toLowerCase())) {
          report(messages.colorLiteral(colored));
        }
      }

      // 폰트: 첫 지정이 system 기본값이면 (IBM Plex가 앞에 없음)
      if (prop === "font-family" || prop === "font") {
        const famList = prop === "font" ? (value.split(/\s+/).slice(-1)[0] ?? "") : value;
        const first = splitTopLevel(famList)[0]?.trim();
        if (first && SYSTEM_FONT_FIRST.test(first) && !/ibm plex/i.test(value)) {
          report(messages.fontFallback(first));
        }
      }
    });
  };
};

rule.ruleName = ruleName;
rule.messages = messages;
rule.primaryOptionArray = false;

const plugin = stylelint.createPlugin(ruleName, rule);
export const { ruleName: exportedRuleName } = plugin;
export default plugin;

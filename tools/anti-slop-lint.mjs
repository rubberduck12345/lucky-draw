#!/usr/bin/env node
// Anti-AI-Slop Lint (Requirement.md 8.4).
// AI가 생성한 카피의 흔적(이모지·마케팅 보일러플레이트)을 검출해
// 위반이 있으면 exit 1.
//
// v0.3부터 CSS 디자인 규칙(AS-CSS-*)은 제거됐다 — 원판 축제형 연출을
// 넣으면서 무채색/장식 모션 제약을 걷어냈기 때문이다. 텍스트/카피만 검사한다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "./anti-slop-rules.mjs";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const allowlist = JSON.parse(readFileSync(join(ROOT, "tools/anti-slop-allowlist.json"), "utf8"));

const TEXT_EXT = new Set(allowlist.textScanExtensions);
const EXCLUDE_DIRS = new Set(
  allowlist.excludePaths.filter((p) => !p.includes("*") && !p.includes(".")),
);
const EXCLUDE_EXACT = new Set(
  allowlist.excludePaths.filter((p) => !p.includes("*") && p.includes(".")),
);
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // `**/` → `.*` (0개 세그먼트도 허용)
      } else {
        re += "[^/]*";
      }
    } else if (".+?^${}()|[]\\".includes(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp("^" + re + "$");
}

const EXCLUDE_GLOB = allowlist.excludePaths
  .filter((p) => p.includes("*"))
  .map(globToRegExp);

function isExcluded(relPath) {
  const parts = relPath.split(sep);
  if (parts.some((seg) => EXCLUDE_DIRS.has(seg))) return true;
  if (EXCLUDE_EXACT.has(relPath)) return true;
  const posix = relPath.split(sep).join("/");
  return EXCLUDE_GLOB.some((re) => re.test(posix));
}

function walk(dir, acc) {
  for (const entry of readdirSync(dir)) {
    // 숨김 디렉터리·파일(.git, .github 등)은 스캔 대상 아님
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (isExcluded(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
}

function kindOf(file) {
  if (file.endsWith(".md")) return "md+text";
  const ext = file.slice(file.lastIndexOf("."));
  return TEXT_EXT.has(ext) ? "text" : null;
}

const files = [];
walk(ROOT, files);

const violations = [];

for (const file of files) {
  const kind = kindOf(file);
  if (!kind) continue;
  const content = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);

  for (const rule of RULES) {
    const applies =
      (kind === "text" && rule.targets.includes("text")) ||
      (kind === "md+text" &&
        (rule.targets.includes("text") || rule.targets.includes("md")));
    if (!applies) continue;

    for (const hit of rule.test(content)) {
      violations.push({ file: rel, rule: rule.id, desc: rule.desc, ...hit });
    }
  }
}

if (violations.length === 0) {
  console.log(`anti-slop-lint: OK (${files.length}개 파일, 위반 0)`);
  process.exit(0);
}

console.error(`anti-slop-lint: 위반 ${violations.length}건\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}:${v.col}  [${v.rule}] ${v.desc}`);
  console.error(`    → ${v.excerpt}`);
}
console.error("\n제거 후 재작성하거나, 정당한 예외면 tools/anti-slop-allowlist.json 에 사유와 함께 추가하세요.");
process.exit(1);

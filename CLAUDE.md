# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 현황

**전 단계 완료.** 6단계 구현 순서(1~6)를 모두 마쳤습니다. 180개 테스트 통과, lint·build 통과. 요구사항 FR-1~7, EC-1~8, NFR-1~6, 디자인 8장 전부 반영. 추가 작업 시 이 문서와 [Requirement.md](Requirement.md)를 기준으로.

**명령:**
- `npm run dev` — 개발 서버
- `npm run build` — `tsc --noEmit` + `vite build` (dist/)
- `npm test` — Vitest 1회 실행 / `npm run test:watch` — 감시 모드
- 단일 테스트: `npx vitest run src/domain/draw.test.ts` 또는 `npx vitest -t "종료 조건"`
- `npm run typecheck` — 타입 검사만
- `npm run lint` — stylelint + Anti-Slop / `npm run lint:slop` — Anti-Slop 단독

**디렉터리:**
- `src/domain/` — 프레임워크·DOM 의존 없는 순수 로직. `index.ts`가 공개 API 배럴. UI는 이것만 import.
  - `types.ts` 데이터 모델 · `rng.ts` seeded PRNG(mulberry32)+Fisher-Yates · `input.ts` 입력 파싱 · `wheel.ts` 슬롯 생성/셔플/결과 추첨 · `draw.ts` 상태 머신 · `persist.ts` localStorage 저장/복원(확정 상태만, 회전 중 저장 안 함 — EC-7)
- `src/ui/` — DOM 직접 조작. 상태는 도메인이 소유, 여기선 렌더링만.
  - `geometry.ts` SVG 섹터 path + **회전 각도 역산**(순수, 테스트됨) · `wheel-view.ts` SVG 원판 렌더+회전 애니메이션 · `app.ts` 3화면 컨트롤러(수동 참가자 선택 드롭다운, CSV 내보내기 포함) · `format.ts` 시각/CSV 포맷
- `src/main.ts` — 엔트리. `fonts.css` + `style.css` + `mountApp`
- `src/fonts.css` — 자체 `@font-face`, woff2만 로드(@fontsource 파일 직참조). 한글·라틴 서브셋 분리. woff 미포함으로 용량 절감
- `src/style.css` — Anti-AI-Slop 준수 스타일. 원판 회전 그룹(`.wheel-rotor`)만 transition 예외
- `tools/` — Anti-AI-Slop Lint (Requirement.md 8.4)
  - `anti-slop-rules.mjs` 정규식 규칙 정의 · `anti-slop-lint.mjs` 파일 스캐너(AS-CSS-1/2/6/7/8/9/16, AS-TXT-*, AS-MD-1) · `stylelint-plugin-anti-slop/index.mjs` AST 규칙(AS-CSS-3/4/5/10/11/12/13/14/15 + 폰트 fallback) · `anti-slop-allowlist.json` 화이트리스트(원판 회전 셀렉터, 스캔 제외 경로 — 항목 추가 시 사유 1줄 필수)
- `.githooks/pre-commit` — lint:slop + lint:css + typecheck. `npm install`의 `prepare`가 `core.hooksPath` 설정
- `.github/workflows/ci.yml` — typecheck → test → lint → build. lint 실패 시 머지 차단 (NFR-6)

**테스트 환경:** 기본 `node`. DOM 필요한 파일은 상단에 `// @vitest-environment jsdom` 주석. `src/ui/app.test.ts`가 3화면 통합 테스트 (reduced-motion으로 회전 즉시완료). 이 환경은 브라우저 자동 구동 불가 (sudo 없음, chromium 시스템 라이브러리 부재) — UI 검증은 jsdom으로.

## 무엇을 만드는가

**럭키드로우 경품 추첨 원판** — 참가자 명단과 경품 목록을 입력하고 원판을 돌려 당첨자에게 경품을 배정하는 **클라이언트 전용 단일 페이지 웹 앱**. 서버/DB 없이 정적 호스팅으로 동작하며, 상태는 선택적으로 `localStorage`에 저장.

전체 사양은 [Requirement.md](Requirement.md)에 있으며, 아래는 여러 조항에 걸쳐 있어 함께 읽어야 이해되는 핵심 사항만 정리한 것입니다.

## 핵심 도메인 규칙 (구현 시 반드시 지킬 것)

- **원판 슬롯 수 = 소진되지 않은 경품 수 + 꽝 1칸.** 꽝 섹터는 항상 정확히 1칸. 경품이 소진될수록 꽝 확률이 자연히 올라감 (경품 1개 남으면 꽝 1/2).
- **모든 섹터는 균등 각도.** 각 슬롯 확률 = `1 / slots.length`. 가중치 없음 (NFR-2 공정성).
- **결과 우선, 애니메이션 역산.** 무작위 결과를 먼저 확정하고 그 섹터에 멈추도록 회전 각도를 역계산 (FR-3.3, NFR-1). 회전 애니메이션은 결과에 영향을 주면 안 됨.
- **당첨 = 참가자 풀에서 영구 제외.** "중복 경품 수령 금지"는 "한 사람이 두 번 당첨될 수 없음"으로 해석 (`status: won`). 각 경품도 1개씩만 존재.
- **경품 당첨 시 원판 재배치(Reshuffle).** 소진된 경품 제거 후 남은 경품으로 슬롯을 다시 생성하고 순서를 무작위 셔플. 꽝 슬롯은 셔플 후에도 1칸 유지. 장식 모션이 아닌 상태 전환으로 처리.
- **꽝 기본 정책: 참가자 잔류** (다음 라운드 재참여 가능). `missOnceMode` 토글 시 꽝도 즉시 제외(`status: out`).
- **회전 중 입력 변경/재시작 잠금** (FR-3.4, 중복 클릭 방지).
- **종료 조건:** 경품 소진 또는 참가자 소진. 미당첨 참가자는 `status: eligible`로 명단에 남고 종료 요약에 "미당첨 N명"으로 표시.

파생 불변식: `slots.length === (소진 안 된 경품 수) + 1`.

앱 상태 3단계: `setup` → `drawing` → `finished`. 데이터 모델 TypeScript 정의는 [Requirement.md](Requirement.md) 5장 참조.

엣지 케이스 표는 [Requirement.md](Requirement.md) 4장 (EC-1 ~ EC-8) — 특히 회전 중 새로고침(EC-7: 진행 중 라운드 무효), 슬롯 과다 시 번호+범례(EC-8) 처리.

## 디자인 제약 — Anti-AI-Slop (MUST, 강제)

[Requirement.md](Requirement.md) 8장의 제약을 **모든 화면/컴포넌트에 강제 적용**합니다. 위계는 크기·굵기·여백·정렬로만 만들고 효과로 만들지 않습니다.

**금지:**
- 그라데이션 (linear/radial/conic) 배경·채움·텍스트, 특히 보라/핑크
- 색이 들어간 box-shadow, 글로우, blur ≥ 20px 그림자, `backdrop-filter: blur` (글래스모피즘)
- 장식 모션: hover `transform: translate/scale`, 로드 시 fade/stagger, pulse·shimmer·float·glow 키프레임
- 배경 워터마크/닷·그리드 배경/페이드 마스크, 카드 상단 컬러 액센트 바
- 이모지 불릿·장식, 뱃지/pill 남발, 마케팅 보일러플레이트 단어

**강제:**
- 색: 무채색(흰/회/검) 베이스 + **액센트 1색**. 색은 의미(상태·위계)에만 사용. 당첨 = 액센트색, 꽝 = 중성 회색
- `transition`은 기능적 상태 변화(색·투명도)에만, **150ms 이하**. **원판 회전 애니메이션만 예외** (결과 전달 수단)
- 그림자는 쓰더라도 중성 회색 1단계 (`0 1px 2px rgba(0,0,0,.06)`)
- 구획은 `1px solid border` + 여백으로
- `border-radius`: 0~8px
- 폰트: 본문/UI는 **IBM Plex Sans KR**, 번호/카운트/시각은 **IBM Plex Mono** (tabular). Inter/Roboto/Arial/system 기본값 금지
- 모든 시각 요소는 "어떤 정보를 전달하는가"에 답할 수 있어야 함. 답 불가 시 삭제

출력 전 [Requirement.md](Requirement.md) 8.3의 자가 점검 체크리스트를 돌리고, 하나라도 걸리면 제거 후 재작성.

### 자동 검사 — Anti-AI-Slop Lint ([Requirement.md](Requirement.md) 8.4)

위 제약은 **CI에서 자동 강제**되며 위반 시 머지가 차단됩니다 (NFR-6). AI가 생성한 스타일·카피의 흔적을 빌드 단계에서 검출합니다.

- **CSS/스타일**: `stylelint` + 로컬 플러그인(`tools/stylelint-plugin-anti-slop/index.mjs`, AST). 유채색/다중레이어/blur≥20px `box-shadow`, 화이트리스트 밖 `animation`, `transform`/`all` 전이, 150ms 초과 `transition`, `:hover` 내 `transform`, `border-radius` > 8px, 유채색 리터럴(→ `var()` 강제), 폰트 fallback. + `tools/anti-slop-lint.mjs`(정규식): 그라데이션, `backdrop-filter`, `filter: blur/drop-shadow`, `text-shadow`, 장식 `@keyframes`, 배경 `url()`/`mask`.
- **텍스트/카피**: `tools/anti-slop-lint.mjs` — 이모지(Emoji_Presentation/VS16/국기/ZWJ만), 마케팅 보일러플레이트(영/한).
- **화이트리스트**: `tools/anti-slop-allowlist.json` (회전 셀렉터 `.wheel-rotor`, 스캔 제외 경로). 추가 시 사유 1줄 필수.
- **실행**: `npm run lint`(전체) / `npm run lint:slop`(단독). pre-commit 훅(`.githooks`) + CI 강제.

규칙 표 전체는 [Requirement.md](Requirement.md) 8.4.1 참조. lint 도구 자체 테스트: `npx vitest run tools/`.

## 기술 스택 (확정)

- **빌드**: Vite (vanilla-ts 템플릿). 정적 호스팅 배포, 외부 API·네트워크 의존 없음.
- **UI**: 순수 HTML + TypeScript. 프레임워크 없음. DOM은 직접 조작.
- **원판**: SVG. 섹터는 `<path>`, 회전은 SVG 그룹에 CSS `transform: rotate` + `transition` cubic-bezier (결과 각도 역산 후 적용).
- **상태 저장**: `localStorage` (새로고침 복원, 선택 구현).
- **테스트**: Vitest. **도메인 로직 집중** — 순수 함수 단위 테스트. 단일 테스트: `npx vitest run <파일경로>` 또는 `npx vitest -t "<테스트명>"`.
- **린트**: `stylelint` + 로컬 Anti-Slop 검사 (위 섹션 참조).

## 구현 순서 (도메인 먼저)

1. ~~**스캐폴딩**~~ ✅ — Vite vanilla-ts, `package.json` 스크립트, Vitest 설정, 디렉터리 구조.
2. ~~**도메인 로직 + 테스트**~~ ✅ — `src/domain/` 순수 모듈. 데이터 모델, 슬롯 생성/재배치 셔플, 회전 결과 추첨(seeded RNG), 당첨 처리, 상태 전환, 엣지 케이스(EC-1~EC-8). 71개 테스트.
3. ~~**원판 SVG + UI**~~ ✅ — 3화면 컨트롤러(`src/ui/app.ts`), SVG 원판, 회전 각도 역산(`geometry.ts`), 회전 중 잠금, 결과 시각+텍스트 병기, EC-8 번호+범례. 105개 테스트.
4. ~~**Anti-AI-Slop Lint**~~ ✅ — `tools/` 구축. stylelint AST 플러그인 + 정규식 스캐너 + 화이트리스트. 51개 자체 테스트. CI/pre-commit 연결. `@font-face`의 `url()`은 AS-CSS-16 대상 아님(배경/mask만).
5. ~~**localStorage 상태 복원**~~ ✅ — `persist.ts`. 확정 상태만 저장(`commit()` 단일 경로), 회전 중 저장 안 함, 손상 저장본 방어, 저장소 접근 예외 삼킴. EC-7 복원.
6. ~~**마감**~~ ✅ — CSV 내보내기 버튼(BOM 포함, `URL.createObjectURL`), 수동 참가자 선택 드롭다운(FR-6.1 옵션), 종료 화면 요약(미당첨/꽝탈락/잔여경품 구분), 인라인 스타일 → CSS 클래스, woff 제거로 폰트 용량 절감. 180개 테스트.

각 단계 완료 시 이 문서의 "프로젝트 현황"과 명령/구조 설명을 갱신할 것.

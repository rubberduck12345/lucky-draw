# lucky-draw

럭키드로우 경품 추첨 원판 — 참가자와 경품을 입력하고 원판을 돌려 당첨자에게 경품을 배정하는 클라이언트 전용 웹 앱.

서버·DB 없이 정적 호스팅으로 동작하며, 진행 상태는 `localStorage`에 저장된다.

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm test         # 테스트
npm run lint     # stylelint + Anti-AI-Slop Lint
npm run build    # dist/ 정적 빌드
```

전체 사양은 [Requirement.md](Requirement.md), 아키텍처와 작업 규칙은 [CLAUDE.md](CLAUDE.md) 참조.

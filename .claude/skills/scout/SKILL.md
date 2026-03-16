---
name: scout
description: "GitHub 최신 기술 스카우팅 — 분야별 라이브러리 탐색·평가·리포트. 사용자가 /scout 또는 /scout [분야]를 입력하면 실행."
---

# Tech Scout — 기술 스카우팅

사용자가 요청한 분야: $ARGUMENTS (비어있으면 전체 분야)

## 실행 절차

### STEP 1: 탐색 (Search)
- GitHub Trending (TypeScript, JavaScript — 주간)을 WebSearch로 검색
- "$ARGUMENTS react library 2026" 키워드로 GitHub 검색 (stars:>500)
- 관련 awesome 리포지토리 검색
- 현재 앱에서 해당 분야가 어떻게 구현되어 있는지 코드 확인

### STEP 2: 필터링 (Filter)
아래 조건으로 필터링:
- 클라이언트 전용 (서버 불필요 — SPA 아키텍처)
- React 18+ 호환
- TypeScript 지원
- Vite 호환
- 번들 사이즈 gzip 50KB 이하 권장
- 최근 6개월 내 활발한 유지보수
- MIT/Apache 2.0/BSD 라이선스

### STEP 3: 평가 (Evaluate)
각 후보를 5개 기준으로 1~5점 평가:
- 임팩트 (앱 품질/UX 개선 효과)
- 난이도 (도입 작업량, 1=쉬움)
- 리스크 (기존 코드 파괴 가능성)
- 성숙도 (stars, 다운로드, 커뮤니티)
- 긴급도 (현재 기술부채 해결 관련성)

추천 점수 = (임팩트×2 + 긴급도×2 + 성숙도) ÷ (난이도 + 리스크)

### STEP 4: 리포트 (Report)
아래 포맷으로 출력:

```
## Tech Scout Report — [분야] ([날짜])

### 추천 TOP 3
| 순위 | 라이브러리 | 버전 | Stars | 추천점수 | 한줄 요약 |

### 각 후보 상세
- GitHub URL
- 번들 사이즈
- 평가 점수 (5개 항목)
- 적용 방안 (현재 앱의 어떤 부분에 어떻게)
- 예상 변경 파일
- PoC 계획

### 탈락 후보 (참고)
```

### STEP 5: 기록 (Archive)
- 결과를 `memory/tech-scout-history.md`에 누적 기록
- 이미 평가한 라이브러리는 스킵 (버전 업데이트 제외)

## 분야 키워드 매핑
- ui → react component library, headless ui, design system, shadcn, radix
- animation → react animation, framer motion, spring, gesture, transition
- video → ffmpeg wasm, webcodecs, video editor browser, media processing
- ai → ai sdk, llm client, streaming ui, ai chat component
- performance → react performance, virtual list, lazy loading, bundle optimization
- form → react form, validation, zod, schema validation
- toast → toast notification, sonner, react hot toast
- state → zustand middleware, state machine, xstate
- chart → react chart, data visualization, recharts
- dnd → drag and drop, dnd kit, sortable
- editor → rich text editor, tiptap, lexical
- image → image editor browser, canvas, crop, filter

## 제약 조건
- 서버 필요한 기술 제외 (순수 클라이언트 SPA)
- CLAUDE.md 절대 규칙 준수 (프롬프트, constants, API URL 변경 금지)
- PoC 없이 본 코드 적용 금지
- 기존 기능 깨뜨리지 않기 (tsc + vite build 통과 필수)

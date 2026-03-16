# Tech Scout — 기술 스카우팅 스킬

> `/scout` 명령어로 실행. 최신 GitHub 기술을 탐색하고 앱 적용 가능성을 평가한다.

---

## 사용법

```
/scout                    → 전체 분야 스카우팅
/scout ui                 → UI 분야만
/scout animation          → 애니메이션 분야만
/scout video              → 영상 처리 분야만
/scout ai                 → AI/LLM 분야만
/scout performance        → 성능 최적화 분야만
/scout [키워드]           → 특정 키워드로 탐색
```

---

## 스카우팅 프로세스 (5단계)

### STEP 1: 탐색 (Search)
아래 소스에서 최신 기술을 검색한다:

1. **GitHub Trending** — `https://github.com/trending?since=weekly` (언어: TypeScript, JavaScript)
2. **GitHub Search** — 관련 키워드로 stars:>1000 정렬 검색
3. **Awesome Lists** — 분야별 awesome 리포지토리
   - `awesome-react` — React 생태계
   - `awesome-vite` — Vite 플러그인
   - `awesome-tailwindcss` — Tailwind 확장
   - `awesome-web-animation` — 웹 애니메이션
   - `awesome-ffmpeg` — 영상 처리
4. **npm trends** — 비교 대상 패키지 트렌드 확인

### STEP 2: 필터링 (Filter)
현재 스택과의 호환성을 기준으로 필터링:

| 조건 | 필수 |
|------|------|
| **클라이언트 전용** | 서버 불필요 (SPA 아키텍처) |
| **React 18+ 호환** | React 18.3.1과 충돌 없음 |
| **TypeScript 지원** | 타입 정의 포함 |
| **Vite 호환** | Vite 빌드 파이프라인과 호환 |
| **번들 사이즈** | gzip 50KB 이하 권장 (예외 허용) |
| **유지보수 활성** | 최근 6개월 내 커밋, 이슈 대응 |
| **라이선스** | MIT, Apache 2.0, BSD (상용 가능) |

### STEP 3: 평가 (Evaluate)
각 후보를 아래 기준으로 평가한다:

```
┌─────────────────────────────────────────────────┐
│  평가 매트릭스 (각 1~5점)                        │
│                                                  │
│  임팩트    — 앱 품질/UX 개선 효과               │
│  난이도    — 도입 작업량 (1=쉬움, 5=대규모)      │
│  리스크    — 기존 코드 파괴 가능성               │
│  성숙도    — GitHub stars, 다운로드, 커뮤니티     │
│  긴급도    — 현재 기술부채 해결 관련성            │
│                                                  │
│  추천 점수 = (임팩트×2 + 긴급도×2 + 성숙도)     │
│             ÷ (난이도 + 리스크)                  │
└─────────────────────────────────────────────────┘
```

### STEP 4: 리포트 (Report)
스카우팅 결과를 아래 포맷으로 출력:

```markdown
## 🔍 Tech Scout Report — [분야] ([날짜])

### 추천 TOP 3

| 순위 | 라이브러리 | 버전 | Stars | 추천점수 | 한줄 요약 |
|------|-----------|------|-------|---------|-----------|
| 1 | ... | ... | ... | ... | ... |
| 2 | ... | ... | ... | ... | ... |
| 3 | ... | ... | ... | ... | ... |

### 1위: [라이브러리명]
- **GitHub**: [URL]
- **번들 사이즈**: [크기]
- **평가**: 임팩트 ?/5, 난이도 ?/5, 리스크 ?/5, 성숙도 ?/5, 긴급도 ?/5
- **적용 방안**: [현재 앱의 어떤 부분에 어떻게 적용할지]
- **예상 변경 파일**: [영향 받는 파일 목록]
- **PoC 계획**: [작은 범위에서 먼저 시험할 방법]

### 탈락 후보 (참고)
| 라이브러리 | 탈락 사유 |
|-----------|-----------|
| ... | ... |
```

### STEP 5: 기록 (Archive)
- 결과를 `memory/tech-scout-history.md`에 누적 기록
- 이미 평가한 라이브러리는 재탐색 시 스킵 (버전 업데이트 제외)

---

## 분야별 탐색 키워드

| 분야 | 검색 키워드 |
|------|------------|
| **ui** | react component library, headless ui, design system, shadcn, radix |
| **animation** | react animation, framer motion, spring animation, gesture, transition |
| **video** | ffmpeg wasm, webcodecs, video editor browser, media processing client |
| **ai** | ai sdk, llm client, streaming ui, ai chat component |
| **performance** | react performance, virtual list, lazy loading, bundle optimization |
| **form** | react form, validation, zod, schema validation |
| **toast** | toast notification, sonner, react hot toast |
| **state** | zustand middleware, state machine, xstate |
| **chart** | react chart, data visualization, recharts |
| **dnd** | drag and drop, dnd kit, sortable |
| **editor** | rich text editor, tiptap, lexical, code editor |
| **image** | image editor browser, canvas, crop, filter |

---

## 현재 앱 기술부채 연결

스카우팅 시 아래 기술부채 해결에 기여하는 기술에 가산점:

1. App.tsx God Component (1,640줄, 20+ useState) → 상태 관리, 컴포넌트 분리
2. StoryboardScene 20+ props → 상태 관리, Context
3. 전역 상태 관리 미완 → Zustand 마이그레이션 도구
4. Base64 이미지 OOM → 이미지 최적화, IndexedDB 캐싱
5. 인라인 HTML 400줄+ → 템플릿 엔진, 컴포넌트화
6. alert() 에러 알림 → 토스트 라이브러리

---

## 제약 조건 (절대 준수)

- **서버 필요한 기술 제외** — 순수 클라이언트 SPA
- **CLAUDE.md 절대 규칙 준수** — 프롬프트, constants, API URL 변경 금지
- **PoC 없이 본 코드 적용 금지** — 반드시 작은 범위에서 먼저 검증
- **기존 기능 깨뜨리지 않기** — tsc + vite build 통과 필수

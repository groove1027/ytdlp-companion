# AGENTS.md — All-in-One Production (Codex CLI용 프로젝트 매뉴얼)

> **이 파일은 OpenAI Codex CLI가 자동으로 읽는 프로젝트 지침서입니다.**
> 모든 코드 수정 전에 이 파일의 규칙을 100% 준수하라.

---

## 프로젝트 개요

AI 기반 영상 제작 파이프라인 웹앱.
대본 입력 → AI 장면 분할 → 이미지 생성 → 영상 생성 → 내보내기.

- **프레임워크**: React 18.3.1 + TypeScript 5.5.3
- **빌드**: Vite 5.4.1
- **스타일**: Tailwind CSS (CDN)
- **스토리지**: IndexedDB (idb 라이브러리)
- **상태 관리**: Zustand (`scriptWriterStore`, `channelAnalysisStore`, `navigationStore`, `uiStore`)
- **AI 서비스**: Evolink AI (Gemini 3.1 Pro), Kie AI, Laozhang AI

---

## 디렉토리 구조

```
project-root/
├── AGENTS.md              ← 이 파일 (Codex용)
├── CLAUDE.md              ← Claude Code용 매뉴얼
├── .claude/skills/        ← API 기술 문서 (작업 전 반드시 참조)
├── docs/
│   ├── CHECKLIST.md       ← 작업 체크리스트 (수정 후 반드시 업데이트)
│   ├── BUG_REPORT.md      ← 버그 목록
│   └── FEATURE_REQUEST.md ← 기능 요구사항
├── src/
│   ├── App.tsx            ← 메인 앱 (1,640줄) - God Component, 신규 useState 추가 금지
│   ├── types.ts           ← 전체 타입 정의 (새 타입은 여기에 먼저 추가)
│   ├── constants.ts       ← 설정 상수 (수정 금지 항목 다수)
│   ├── components/        ← UI 컴포넌트
│   │   └── modes/         ← ScriptMode, CharacterMode, RemakeMode
│   ├── services/
│   │   ├── geminiService.ts    ← AI 핵심 로직 (1,619줄) - 프롬프트 수정 금지
│   │   ├── VideoGenService.ts  ← 영상 생성 API (688줄)
│   │   ├── apiService.ts       ← API 키 관리 (getXxxKey() 함수)
│   │   ├── uploadService.ts    ← Cloudinary 업로드
│   │   ├── storageService.ts   ← IndexedDB
│   │   └── evolinkService.ts   ← Evolink AI 통합 서비스
│   └── hooks/
│       └── useVideoBatch.ts    ← 비디오 배치 처리
└── src/package.json
```

---

## 절대 금지 사항 (위반 시 프로젝트 파손)

1. **`geminiService.ts` 내부의 프롬프트 텍스트를 수정하지 마라** — 수많은 시행착오의 결과물
2. **`constants.ts`의 VISUAL_STYLES / CHARACTER_LIBRARY / CHARACTER_STYLES를 수정하지 마라**
3. **PRICING 상수를 변경하지 마라** — 실제 서비스 가격 반영
4. **API 엔드포인트 URL을 변경하지 마라**
5. **`any` 타입을 새로 추가하지 마라**
6. **App.tsx에 새로운 useState를 추가하지 마라** — 리팩토링 대상
7. **인라인 HTML 문자열을 새로 생성하지 마라**
8. **스토리보드 생성 후 이미지 자동 배치 생성 코드를 추가하지 마라** — 의도적으로 제거된 기능

---

## 필수 작업 절차 (모든 코드 수정에 적용 — 예외 없음)

### Phase 1: 작업 전 — 영향 범위 전수 조사
```bash
# 1. 수정할 함수명/변수명을 프로젝트 전체에서 검색
grep -rn "함수명" src/

# 2. 검색 결과에서 영향 받는 파일 목록 작성
# 3. 목록 완성 전 코딩 시작 금지
```

### Phase 2: 작업 중 — 목록 기반 수정
- Phase 1에서 만든 목록의 **모든 파일**을 빠짐없이 수정
- "이 파일에서 호출하는 다른 함수도 영향 받나?" 연쇄 확인
- 새로 발견된 연결점이 있으면 목록에 추가

### Phase 3: 작업 후 — 검증 (반드시 실행)
```bash
# 1. TypeScript 타입 체크
cd src && node_modules/typescript/bin/tsc --noEmit

# 2. Vite 빌드
cd src && node_modules/.bin/vite build

# 3. grep 재검증 — 빠진 곳 없는지 확인
grep -rn "수정한함수명" src/
```

### Phase 4: 커밋 + 푸시 + 배포
```bash
# 1. 커밋
git add -A && git commit -m "fix: 설명"

# 2. 푸시
git push origin main

# 3. Cloudflare Pages 배포 (필수! git push만으로는 사이트 미반영)
cd src && node_modules/.bin/vite build && cd .. && npx wrangler pages deploy src/dist --project-name=all-in-one-production --commit-dirty=true
```

**검증(Phase 3) 없이 커밋하지 마라. 배포 없이 끝내지 마라.**

---

## GitHub 이슈 처리

```bash
# 이슈 목록 확인
gh issue list

# 이슈 상세 보기
gh issue view 123

# 수정 완료 후 코멘트 + 닫기
gh issue close 123 --comment "코멘트 내용"
```

### 이슈 코멘트 스타일 (반드시 준수)
- **톤**: 따뜻하고 친근한 존댓말 (~요, ~네요, ~했어요)
- **기술 용어 사용 금지**: 변수명, 함수명, 파일명, 커밋 해시 노출 금지
- **구조**: 원인(쉬운 말) → 뭘 고쳤는지(쉬운 말) → "새로고침 후 다시 시도해보시겠어요?" → 재발 시 연락 안내
- **줄바꿈 규칙**: 한 문단으로 길게 붙여 쓰지 말고, 문장마다 줄바꿈하라. 기본 4줄 형식을 유지하라.
- **4줄 고정 형식**:
  1. 원인 한 줄
  2. 수정 내용 한 줄
  3. `새로고침 후 다시 시도해보시겠어요?`
  4. `같은 문제가 반복되면 알려주세요!`
- **템플릿**:
  `확인해보니 ~~ 문제였어요.`
  `수정해서 반영해뒀습니다 ✅`
  `새로고침 후 다시 시도해보시겠어요?`
  `같은 문제가 반복되면 알려주세요!`

---

## 코딩 스타일

- 컴포넌트 최대 **300줄**
- 함수 최대 **50줄**
- Props 최대 **8개** (그 이상이면 Context/Store 도입)
- TypeScript strict 모드 준수
- 한국어 주석 허용, **변수명/함수명은 영어**
- 새로운 타입은 `src/types.ts`에 먼저 추가
- 모든 fetch 호출은 `monitoredFetch` 래퍼를 통해 실행
- 에러 발생 시 `alert()` 대신 Toast 시스템 사용
- API 키는 `services/apiService.ts`의 `getXxxKey()` 함수로 접근 (직접 localStorage 접근 금지)

---

## 외부 API 요약

| API | Base URL | 인증 | 용도 |
|-----|----------|------|------|
| Evolink AI | `api.evolink.ai/v1/`, `/v1beta/` | Bearer token | Gemini 3.1 Pro (1순위), Nanobanana 2 이미지, Veo 3.1 |
| Kie AI | `api.kie.ai/api/v1/` | Bearer token | Grok 영상, Gemini 폴백 |
| Laozhang AI | `api.laozhang.ai/v1/` | Bearer token | 폴백: 이미지, Gemini 텍스트 |
| Cloudinary | `api.cloudinary.com/v1_1/{name}/` | Upload Preset | 이미지/영상 호스팅 |
| Remove.bg | `api.remove.bg/v1.0/` | X-Api-Key | 배경 제거 |
| WaveSpeed AI | `api.wavespeed.ai/api/v3/` | Bearer token | 워터마크/자막 제거 |
| YouTube Data API v3 | `googleapis.com/youtube/v3/` | API Key | 채널분석, 키워드 검색 |

**API 상세 기술 문서**: `.claude/skills/` 폴더에 서비스별 개별 문서 저장
- Evolink Gemini: `.claude/skills/evolink-gemini-3.1-pro-flash.md`
- KIE Gemini 3.1 Pro: `.claude/skills/kie-gemini-3.1-pro.md`
- KIE 비디오 모델 17개: `.claude/skills/kie-video-models-complete.md`
- KIE ElevenLabs TTS: `.claude/skills/kie-elevenlabs-api.md`
- 기타 서비스별 문서: `.claude/skills/` 폴더 확인

---

## 핵심 데이터 흐름

```
[사용자 대본 입력]
  → analyzeScriptContext() : 언어/시대/문화적 맥락 분석
  → parseScriptToScenes() : 장면 분할 + 비주얼 프롬프트
  → generateSceneImage() : 이미지 생성 (Evolink → Laozhang → Kie 폴백)
  → useVideoBatch : 영상 배치 생성 (Grok/Veo 선택)
  → handleExportHtml() : HTML 프로젝트 내보내기
```

---

## 색상 시스템 (절대 준수)

| 탭 | 액센트 색상 |
|---|---|
| 프로젝트 | gray |
| 채널분석 | blue |
| 대본작성 | violet |
| 사운드 | fuchsia |
| 이미지/영상 | orange |
| 편집실 | amber |
| 업로드 | green |
| 썸네일 | pink |
| 캐릭터 비틀기 | red |
| 소스 임포트 | emerald |

- **Primary CTA**: `from-blue-600 to-violet-600`
- **투명도 규칙**: bg=/20, border=/30, 강조bg=/40, 강한border=/50
- **비디오 엔진 고유색 변경 금지** (Grok=pink, Nanobanana=violet-fuchsia)

---

## Git 정보

- **Remote**: `origin https://github.com/groove1027/all-in-one-production.git`
- **Branch**: `main`
- **TypeScript**: `src/node_modules/typescript/bin/tsc`
- **Build output**: `src/dist/`

---

## 알려진 기술 부채 (참고용)

1. App.tsx가 God Component (1,640줄, 20+ useState)
2. StoryboardScene에 20+ props 전달 (Props Drilling)
3. 전역 상태 관리 Zustand 도입 진행 중
4. 모든 이미지 Base64로 메모리 유지 (OOM 위험)
5. HTML 내보내기에 400줄+ 인라인 HTML/JS 문자열
6. `alert()` 기반 에러 알림 (Toast 시스템 전환 필요)

---

## 작업 완료 체크리스트

모든 작업 후 아래를 확인:
- [ ] grep 전수 조사로 영향 범위 확인했는가?
- [ ] 목록의 모든 파일을 수정했는가?
- [ ] `tsc --noEmit` 에러 0개인가?
- [ ] `vite build` 성공했는가?
- [ ] grep 재검증으로 빠진 곳 없음을 증명했는가?
- [ ] `docs/CHECKLIST.md`를 업데이트했는가?
- [ ] git commit + push 했는가?
- [ ] Cloudflare Pages 배포했는가?
- [ ] (이슈 작업 시) 이슈 코멘트 + 닫기 했는가?

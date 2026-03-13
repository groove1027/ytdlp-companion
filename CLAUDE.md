# CLAUDE.md — All-in-One Production v3.1

> **이 파일은 프로젝트 루트에 반드시 위치해야 합니다.**
> Claude Code가 모든 작업 전에 자동으로 읽는 최상위 매뉴얼입니다.

---

## 📌 프로젝트 한줄 요약

AI 기반 영상 제작 파이프라인 웹앱. 대본 입력 → AI 장면 분할 → 이미지 생성 → 영상 생성 → 내보내기.

## 🛠️ 기술 스택

- **프레임워크**: React 18.3.1 + TypeScript 5.5.3
- **빌드**: Vite 5.4.1
- **스타일**: Tailwind CSS (CDN)
- **스토리지**: IndexedDB (idb 라이브러리)
- **패키지**: jszip, idb, @imgly/background-removal
- **외부 API**: Kie AI, Laozhang AI, Apimart, Cloudinary, Remove.bg, WaveSpeed AI

## 📁 디렉토리 구조

```
project-root/
├── CLAUDE.md              ← 지금 이 파일 (최상위 매뉴얼)
├── .claude/
│   ├── hooks/
│   │   └── post-edit-check.sh  ← 자동 검수 스크립트 (tsc + 규칙 위반 체크)
│   ├── agents/
│   │   └── code-reviewer.md    ← AI 코드 검수 서브에이전트
│   └── skills/            ← 분야별 매뉴얼 (스킬 파일)
│       ├── ai-service.md
│       ├── media-gen.md
│       ├── ui-component.md
│       ├── data-storage.md
│       ├── export-system.md
│       └── api-reference.md  ← 외부 API 공식 기술 문서 (전체)
├── docs/
│   ├── PLAN.md            ← 현재 작업 계획서
│   ├── CONTEXT.md         ← 맥락 노트 (결정 이유, 참고 자료)
│   ├── CHECKLIST.md       ← 작업 체크리스트
│   ├── BUG_REPORT.md      ← 버그 목록
│   └── FEATURE_REQUEST.md ← 기능 요구사항
├── src/
│   ├── App.tsx            ← 메인 앱 (1,640줄) ★
│   ├── types.ts           ← 전체 타입 정의
│   ├── constants.ts       ← 설정 상수, 스타일 프리셋
│   ├── index.tsx
│   ├── index.html
│   ├── components/
│   │   ├── modes/         ← ScriptMode(1,248), CharacterMode(1,310), RemakeMode(201)
│   │   └── ...            ← UI 컴포넌트들
│   ├── services/
│   │   ├── geminiService.ts    ← AI 핵심 로직 (1,619줄) ★★
│   │   ├── VideoGenService.ts  ← 영상 생성 API (688줄) ★
│   │   ├── apiService.ts       ← API 키 관리
│   │   ├── uploadService.ts    ← Cloudinary 업로드
│   │   ├── storageService.ts   ← IndexedDB
│   │   └── ...
│   └── hooks/
│       └── useVideoBatch.ts    ← 비디오 배치 처리
└── package.json
```

---

## 🚨 최우선 규칙: MEMORY.md 필독 + 영향 범위 전수 조사

> **모든 세션 시작 시 반드시 `memory/MEMORY.md`를 읽고 그 안의 절대 규칙을 100% 준수하라.**
> MEMORY.md를 읽지 않은 상태에서 코드 수정을 시작하지 마라.

### 영향 범위 전수 조사 (모든 코드 수정에 적용 — 예외 없음)
- **작업 전**: 수정할 함수명/상태명을 grep 전체 검색 → 영향 받는 파일 목록 작성 → 목록 완성 전 코딩 시작 금지
- **작업 중**: 목록의 모든 파일을 빠짐없이 수정 + 연쇄 영향 확인
- **작업 후**: tsc + vite build + grep 재검색으로 빠진 곳 없는지 증명
- **UI 변경 작업**: Puppeteer MCP로 localhost:5173 접속 → 실제 동작 + 스크린샷 검증 필수
- **검증 미완료 상태에서 "완료"라고 보고하면 안 된다**
- **상세 절차는 `memory/MEMORY.md`의 "영향 범위 전수 조사" 섹션 참조**
- **Hook이 tsc 에러 시 자동 차단함 (exit 1) — 에러 무시 불가**

---

## ⚠️ 절대 규칙 (모든 작업에 적용)

### 금지 사항
1. **`geminiService.ts` 내부의 프롬프트 텍스트 내용을 임의로 수정하지 마라** — 수많은 시행착오의 결과물
2. **`constants.ts`의 VISUAL_STYLES / CHARACTER_LIBRARY / CHARACTER_STYLES 데이터를 수정하지 마라** — 프롬프트 엔지니어링 결과물
3. **PRICING 상수를 임의로 변경하지 마라** — 실제 서비스 가격 반영
4. **API 엔드포인트 URL을 변경하지 마라**
5. **`any` 타입을 새로 추가하지 마라** — 기존 `any`는 점진적으로 제거
6. **App.tsx에 새로운 상태(useState)를 추가하지 마라** — 리팩토링 대상
7. **인라인 HTML 문자열을 새로 생성하지 마라**

### 필수 사항
1. **작업 전 반드시 관련 스킬 파일(.claude/skills/)을 읽어라**
2. **작업 후 반드시 `docs/CHECKLIST.md`를 업데이트하라**
3. **새로운 타입이 필요하면 `types.ts`에 먼저 추가하라**
4. **모든 fetch 호출은 `monitoredFetch` 래퍼를 통해 실행하라**
5. **에러 발생 시 `alert()` 대신 Toast 시스템(존재 시)을 사용하라**
6. **한국어 주석 허용, 변수명/함수명은 영어**

### 코딩 스타일
- 컴포넌트 최대 **300줄** (현재 위반 파일 있음 — 리팩토링 대상)
- 함수 최대 **50줄**
- Props 최대 **8개** (그 이상이면 Context/Store 도입)
- TypeScript strict 모드 준수

---

## 🔑 외부 API 요약

| API | Base URL | 인증 | 용도 |
|-----|----------|------|------|
| **Evolink AI** | `api.evolink.ai/v1/`, `/v1beta/` | Bearer token | **Gemini 3.1 Pro (1순위), Nanobanana 2 이미지, Veo 3.1 1080p** |
| Kie AI | `api.kie.ai/api/v1/` | Bearer token | Grok 영상 (폴백: Gemini 텍스트) |
| Laozhang AI | `api.laozhang.ai/v1/` | Bearer token | 폴백: 이미지, Gemini 텍스트 |
| Cloudinary | `api.cloudinary.com/v1_1/{name}/` | Upload Preset | 이미지/영상 호스팅 |
| Remove.bg | `api.remove.bg/v1.0/` | X-Api-Key | 배경 제거 |
| WaveSpeed AI | `api.wavespeed.ai/api/v3/` | Bearer token | 워터마크/자막 제거 |
| YouTube Data API v3 | `googleapis.com/youtube/v3/` | API Key | 채널분석, 키워드 검색 |

모든 API 키는 `services/apiService.ts`의 `getXxxKey()` 함수를 통해 접근.
직접 `localStorage`에 접근하지 마라.

> **외부 API 상세 기술 문서**: `.claude/skills/` 폴더에 서비스별 개별 문서 저장 (원본 무삭제·무축약):
>
> | 서비스 | 스킬 파일 |
> |--------|----------|
> | Evolink Gemini 3.1 Pro | `evolink-gemini-3.1-pro-full.md` |
> | Evolink NanoBanana2 Task | `evolink-nanobanana2-task.md` |
> | Evolink NanoBanana Pro Image | `evolink-nanobanana-pro-image.md` |
> | Evolink Veo 3.1 Video | `evolink-veo31-video.md` |
> | Laozhang NanoBanana Pro Image | `laozhang-nanobanana-pro-image.md` |
> | KIE Grok Image-to-Video | `kie-grok-image-to-video.md` |
> | KIE NanoBanana2 Task | `kie-nanobanana2-task.md` |
> | KIE Gemini API | `kie-gemini-api.md` |
> | KIE Suno API | `kie-suno-api.md` |
> | KIE ElevenLabs (TTS/STT/SFX/Isolation) | `kie-elevenlabs-api.md` |
> | Grok Imagine Video | `grok-imagine-video.md` |
> | Suno Complete | `suno-api-complete.md` |
> | Typecast API | `typecast-api.md` |
> | Typecast Download | `typecast-download.md` |
> | API 요약 (참고용) | `api-reference.md` |

---

## 🔄 핵심 데이터 흐름

```
[사용자 대본 입력]
  → analyzeScriptContext() : 언어/시대/문화적 맥락 분석
  → parseScriptToScenes() : 장면 분할 + 비주얼 프롬프트
  → generateSceneImage() : 이미지 생성 (Laozhang → Kie 폴백)
  → useVideoBatch : 영상 배치 생성 (Grok/Veo 선택)
  → handleExportHtml() : HTML 프로젝트 내보내기
```

---

## 🏷️ 스킬 파일 매핑 (자동 활성화 규칙)

| 작업 대상 | 활성화할 스킬 | 트리거 키워드/파일 |
|-----------|--------------|-------------------|
| geminiService.ts, 프롬프트 | `.claude/skills/ai-service.md` | "프롬프트", "AI", "분석", "Gemini", services/gemini* |
| VideoGenService.ts, uploadService.ts | `.claude/skills/media-gen.md` | "영상", "비디오", "이미지", "업로드", services/Video*, services/upload* |
| components/ 폴더 전체 | `.claude/skills/ui-component.md` | "UI", "컴포넌트", "화면", "버튼", components/* |
| storageService.ts, IndexedDB | `.claude/skills/data-storage.md` | "저장", "IndexedDB", "프로젝트", services/storage* |
| HTML 내보내기, ZIP | `.claude/skills/export-system.md` | "내보내기", "export", "HTML", "다운로드", "ZIP" |
| 외부 API 요청/응답 포맷 | `.claude/skills/{서비스별 개별 문서}` | "API", "엔드포인트", "요청", "응답", "에러코드", fetch 수정 시 — 해당 서비스 문서 개별 참조 |

---

## 📊 현재 코드 규모 (v3.1)

- **총 라인 수**: 11,123줄 (38개 파일)
- **가장 큰 파일**: App.tsx(1,640), geminiService.ts(1,619), CharacterMode(1,310), ScriptMode(1,248)
- **외부 API 수**: 5개
- **Enum 수**: 10개, **Interface 수**: 8개

---

## 🚨 알려진 기술 부채

1. App.tsx가 God Component (1,640줄, 20+ useState)
2. StoryboardScene에 20+ props 전달 (Props Drilling)
3. 전역 상태 관리 없음 (Zustand 도입 필요)
4. 모든 이미지 Base64로 메모리 유지 (OOM 위험)
5. HTML 내보내기에 400줄+ 인라인 HTML/JS 문자열
6. `alert()` 기반 에러 알림 (Toast 시스템 전환 필요)

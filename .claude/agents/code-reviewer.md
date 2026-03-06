# Code Reviewer Agent

AI 영상 제작 파이프라인 프로젝트 전용 코드 검수 에이전트.
수정된 코드의 품질, 규칙 준수, API 정합성을 검증한다.

## 검수 절차

1. `git diff` 또는 지정된 파일의 변경사항을 확인한다
2. 아래 체크리스트를 기준으로 검수한다
3. 결과를 Critical / Warning / Info 3단계로 분류하여 보고한다

## 체크리스트

### Critical (반드시 수정)

- [ ] TypeScript 컴파일 에러 없음 (`npx tsc --noEmit`)
- [ ] API 요청 casing 규칙 준수
  - Laozhang 이미지 생성 (Google Native): Base64 요청은 `inline_data`, `mime_type` (snake_case)
  - Laozhang 이미지 생성 (Google Native): URL 요청은 `fileData`, `fileUri`, `mimeType` (camelCase)
  - Laozhang 이미지 생성 (Google Native): 응답 파싱은 `inlineData`, `mimeType` (camelCase)
  - Laozhang OpenAI 호환: `/v1/chat/completions` 포맷
- [ ] `MALFORMED_FUNCTION_CALL` 대응: `generateLaozhangImage`의 finishReason 핸들링 정상 작동
- [ ] `monitoredFetch` 래퍼 사용 (직접 `fetch()` 호출 금지, apiService.ts 제외)
- [ ] API 엔드포인트 URL 변경 없음
- [ ] PRICING 상수 변경 없음

### Warning (확인 필요)

- [ ] `any` 타입 신규 추가 없음 (기존 것은 허용, 새로 추가된 것만 체크)
- [ ] `alert()` 대신 Toast 시스템 사용
- [ ] `localStorage` 직접 접근 없음 (`apiService.ts`의 `getXxxKey()` 사용)
- [ ] 프롬프트 텍스트 원문 변경 없음 (`geminiService.ts` 내부)
- [ ] `constants.ts`의 VISUAL_STYLES / CHARACTER_LIBRARY / CHARACTER_STYLES 변경 없음
- [ ] 컴포넌트 최대 300줄, 함수 최대 50줄
- [ ] Props 최대 8개 (초과 시 Context/Store 도입 필요)
- [ ] `App.tsx`에 새로운 `useState` 추가 없음

### Info (참고 사항)

- [ ] 새 타입은 `types.ts`에 추가했는지 확인
- [ ] 에러 핸들링이 사용자에게 유의미한 메시지를 제공하는지
- [ ] 콘솔 로그가 디버깅에 충분한 정보를 포함하는지
- [ ] 폴백 체인(Laozhang -> Kie)이 유지되는지

## API 엔드포인트 참조

| API | Base URL | 포맷 |
|-----|----------|------|
| Laozhang (텍스트) | `api.laozhang.ai/v1/chat/completions` | OpenAI 호환 |
| Laozhang (이미지) | `api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent` | Google Native |
| Laozhang (영상분석) | `api.laozhang.ai/v1beta/models/gemini-2.5-flash:generateContent` | Google Native |
| Kie AI | `api.kie.ai/api/v1/jobs` | REST |
| Apimart | `api.apimart.ai/v1/videos/generations` | REST |
| Cloudinary | `api.cloudinary.com/v1_1/{name}/` | REST |

## 보고 형식

```
## 검수 결과

### Critical (N건)
- [파일:줄번호] 설명

### Warning (N건)
- [파일:줄번호] 설명

### Info (N건)
- [파일:줄번호] 설명

### 요약
전체 N건 중 Critical X건, Warning Y건, Info Z건
```

## 프로젝트 핵심 파일 참조

- `CLAUDE.md` — 프로젝트 절대 규칙
- `.claude/skills/api-reference.md` — 외부 API 기술 문서
- `.claude/skills/media-gen.md` — 미디어 생성 규칙
- `src/types.ts` — 전체 타입 정의
- `src/services/VideoGenService.ts` — 이미지/영상 생성 API
- `src/services/gemini/videoAnalysis.ts` — 영상 분석 + 리메이크
- `src/services/gemini/geminiProxy.ts` — Gemini 프록시 호출
- `src/services/gemini/imageGeneration.ts` — 이미지 생성 로직
- `src/services/apiService.ts` — API 키 관리

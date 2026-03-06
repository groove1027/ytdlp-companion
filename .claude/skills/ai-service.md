# 스킬: AI 서비스 (geminiService.ts 및 프롬프트 관련)

> **활성화 조건**: "프롬프트", "AI", "분석", "Gemini", "장면 분할", "이미지 생성" 키워드 또는 `services/gemini*` 파일 수정 시

---

## 📂 담당 파일

- `services/geminiService.ts` (1,619줄) — **핵심 비즈니스 로직**
- `types.ts` — Scene, ProjectConfig 인터페이스
- `constants.ts` — PRICING 상수

## ⚠️ 절대 규칙

1. **프롬프트 텍스트 원문을 수정하지 마라**. 구조만 분리 가능.
2. **SAFETY_SETTINGS_BLOCK_NONE 설정을 변경하지 마라**.
3. **새로운 API 모델 추가 시 반드시 `types.ts`의 enum에 먼저 등록하라**.

## 🔧 주요 함수 목록

| 함수명 | 기능 | 입력 | 출력 |
|--------|------|------|------|
| `analyzeScriptContext()` | 전역 컨텍스트 분석 | 대본 텍스트 | 언어, 시대, 문화 뉘앙스, 비주얼 톤 |
| `parseScriptToScenes()` | 장면 분할 + 프롬프트 생성 | 대본, 포맷, 분위기 등 | Scene[] |
| `generateSceneImage()` | 이미지 생성 | Scene, 스타일, 비율 등 | { url, isFallback } |
| `analyzeVideoContent()` | 영상 분석 (VISUAL) | File, 분위기 | Scene[] |
| `analyzeVideoHybrid()` | 영상 분석 (NARRATIVE) | File, 분위기 | Scene[] |
| `generatePromptFromScript()` | 프롬프트 자동 변환 | 대본 텍스트, 스타일 | string |
| `fetchCurrentExchangeRate()` | 실시간 환율 | 없음 | { rate, date } |
| `urlToBase64()` | URL → Base64 변환 | URL string | Base64 string |

## 🔗 API 호출 체인

```
generateSceneImage()
  → generateLaozhangImage() [1차 시도: Laozhang API]
  → generateKieImage()      [폴백: Kie API]
```

이미지 생성은 반드시 이 폴백 체인을 유지해야 함.

## 📝 헬퍼 함수 (프롬프트 빌더)

- `getMicroTexture(style)` — 스타일 → 타이포그래피 질감 매핑
- `isBlackAndWhiteStyle(style)` — B&W 스타일 감지
- `getStyleNegativePrompt(style)` — 스타일별 네거티브 프롬프트
- `getAdaptiveFont(style)` — 스타일별 적응형 폰트 선택
- `getIntegrativeInfographicInstruction(style)` — 인포그래픽 통합 지시
- `convertGoogleToOpenAI(model, payload)` — Google → OpenAI 포맷 변환

## 🎯 리팩토링 방향 (향후)

geminiService.ts를 아래 모듈로 분리 예정:
- `ai/promptBuilder.ts` — 프롬프트 생성 로직
- `ai/sceneAnalyzer.ts` — 대본 분석/장면 분할
- `ai/imageGenerator.ts` — 이미지 생성 호출
- `ai/videoAnalyzer.ts` — 영상 분석
- `ai/contextAnalyzer.ts` — 전역 컨텍스트/언어 분석
- `ai/apiFormatConverter.ts` — Google↔OpenAI 포맷 변환

**분리 시 주의**: 프롬프트 텍스트 내용은 그대로 이동. 변수/함수 시그니처만 정리.

## 💰 비용 계산 규칙

```
이미지: PRICING.IMAGE_GENERATION ($0.05) × costMultiplier (NativeHQ면 2배)
폴백 이미지: PRICING.IMAGE_GENERATION_FALLBACK ($0.09)
분석: PRICING.ANALYSIS_INITIAL ($0.005)
```

비용 추가는 반드시 `handleCostAdd(amount, type)` 함수를 통해.

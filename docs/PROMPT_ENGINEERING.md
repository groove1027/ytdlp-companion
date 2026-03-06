# 🧠 PROMPT_ENGINEERING.md — AI 프롬프트 설계 명세

> **geminiService.ts의 프롬프트를 수정하거나 참조할 때 이 문서를 반드시 읽으세요.**
> 각 프롬프트의 구조, 입출력, 주의사항이 정리되어 있습니다.
> ⚠️ 프롬프트 텍스트 원문은 수많은 시행착오의 결과물입니다. 구조만 분리하고 내용은 변경하지 마세요.

---

## 프롬프트 #1: analyzeScriptContext()

**역할**: 대본의 전역 컨텍스트를 분석하여 이후 모든 AI 작업의 기준점 제공

**모델**: `gemini-3-flash-preview` (저렴, 빠름)

**입력**: 대본 텍스트 앞 1,000자

**출력 JSON**:
```json
{
  "specificLocation": "Gangnam Station, Seoul",
  "timePeriod": "Modern Day 2024",
  "culturalBackground": "Korean Urban",
  "visualTone": "Cinematic warm tones",
  "detectedLanguage": "ko-KR",
  "detectedLanguageName": "Korean",
  "keyEntities": "Samsung, BTS, Gangnam"
}
```

**결과 저장 위치**: ProjectConfig의 `baseAge`, `globalContext`, `detectedLanguage`, `detectedLanguageName`, `detectedLocale`, `culturalNuance`

---

## 프롬프트 #2: parseScriptToScenes()

**역할**: 대본을 장면 단위로 분할하고, 각 장면에 비주얼 프롬프트/캐스팅/카메라 지시 생성

**모델**: `gemini-3-pro-preview` (고품질, 복잡한 분석)

**핵심 매개변수**:
| 매개변수 | 영향 |
|---------|------|
| `format` (VideoFormat) | 분할 단위 결정 (Long: 2문장, Short: 1문장, Nano: 단어 단위) |
| `smartSplit` | false이면 줄바꿈 기준 강제 분할 |
| `longFormSplitType` | 'DETAILED'이면 Long-form도 1문장/씬 |
| `atmosphere` | 스타일 프롬프트 적용 |
| `characterDesc` | 캐릭터 묘사 삽입 |
| `appearance` | AUTO/ALWAYS/MINIMAL 캐릭터 등장 빈도 |
| `allowInfo` | 인포그래픽 씬 허용 여부 |
| `textForceLock` | 텍스트 렌더링 품질 모드 |
| `suppressText` | true면 모든 텍스트 금지 |

**2단계 프로세스**:
1. **Phase 1: Structure Analysis** (도구 없음) — JSON으로 장면 분할 + 프롬프트 생성
2. **Phase 2: Entity Enrichment** (googleSearch 도구 사용) — KEY_ENTITY 배역의 외모를 실시간 검색

**출력**: Scene[] 배열

**분할 규칙 (splitInstruction)**:
- Long-form DEFAULT: 2문장/씬, 질문(?)이면 다음 문장과 합쳐 최대 3문장
- Long-form DETAILED: 1문장/씬, 질문(?)만 다음 문장과 합침
- Short-form: 1문장/씬
- Nano-form: 핵심 명사/감탄사/숫자 기준 초고속 분할

---

## 프롬프트 #3: generateSceneImage()

**역할**: 단일 장면의 이미지 생성

**모델**: Laozhang API → Kie API (폴백)

**핵심 로직 (Smart Bypass)**:
```
castType이 KEY_ENTITY인 경우:
  → 캐릭터 참조 이미지 무시 (finalCharImg = undefined)
  → entityVisualContext를 프롬프트 앞에 삽입
  → 네거티브 프롬프트에 "(main character face)" 추가

castType이 EXTRA인 경우:
  → 캐릭터 참조 이미지 무시
  → 일반적인 인물 묘사 사용

castType이 NOBODY인 경우:
  → 캐릭터 관련 요소 모두 제거
```

**프롬프트 구성 순서**:
1. `subjectPrompt` (KEY_ENTITY면 실존 인물 외모)
2. `scene.visualPrompt` (AI가 생성한 비주얼 프롬프트)
3. 스타일 적용 (`effectiveStyle`)
4. 텍스트 렌더링 지시 (requiresTextRendering이면)
5. 인포그래픽 지시 (isInfographic이면)
6. 네거티브 프롬프트 (`getStyleNegativePrompt`)

**헬퍼 함수**:
| 함수 | 역할 |
|------|------|
| `getMicroTexture(style)` | 스타일 → 텍스트 질감 매핑 (Film Grain, Canvas 등) |
| `isBlackAndWhiteStyle(style)` | B&W 스타일 감지 → 색상 지시 조절 |
| `getStyleNegativePrompt(style)` | 스타일 간 오염 방지 (애니↔실사↔3D) |
| `getAdaptiveFont(style)` | 스타일별 최적 폰트 선택 (항상 Ultra Bold 계열) |
| `getIntegrativeInfographicInstruction(style)` | 인포그래픽을 씬 환경에 물리적 통합하는 지시 |

---

## 프롬프트 #4: enrichEntityDetail()

**역할**: 실존 인물/브랜드의 현재 외모를 구글 검색으로 파악

**모델**: `gemini-3-pro-preview` + `googleSearch` 도구

**플로우**:
```
1. "Describe visual appearance of: {entityName}" 요청
2. AI가 googleSearch 도구 호출 → 검색 결과 반환
3. 검색 결과를 대화에 추가
4. AI가 최종 외모 묘사 텍스트 생성 (영문, 쉼표 구분)
5. 최대 3턴 반복 (도구 호출 루프)
```

**결과**: Scene.entityVisualContext에 저장

---

## 프롬프트 #5: generateThumbnailConcepts()

**역할**: 바이럴 유튜브 썸네일 컨셉 4개 생성

**모델**: `gemini-3-pro-preview`

**핵심 규칙**:
- `textOverlay`는 반드시 **대본 원본 언어**로 출력 (langName 파라미터)
- 8~10자 내외의 임팩트 문구
- "Subject + Predicate" 또는 "Modifier + Keyword" 구조
- 단순한 감탄사("충격!", "실체!") 금지 → 구체적 질문/상황 묘사
- `poseDescription`은 구체적 물리 동작 (동사 기반)
- `shotSize` 다양하게 (Extreme Close Up, Waist Shot, Full Body, Low Angle)

**출력**: 4개 객체의 JSON 배열
```json
[{
  "textOverlay": "마이크 속 진짜 순금?",
  "fullTitle": "...",
  "visualDescription": "...",
  "secondaryColorHex": "#FF0000",
  "colorMode": "HIGHLIGHT_MIX",
  "sentiment": "curiosity",
  "highlight": "순금",
  "shotSize": "Extreme Close Up",
  "poseDescription": "Holding microphone close to camera with shocked expression",
  "cameraAngle": "Low Angle"
}]
```

---

## 프롬프트 #6: generateHighQualityThumbnail()

**역할**: 썸네일 이미지 실제 생성 (Laozhang/Kie 이미지 API)

**두 가지 분기**:
1. **Style Copy Mode** (origStyle + refImg 존재): 참조 이미지의 레이아웃/색상/폰트 상속, 내용만 교체
2. **Standard Mode**: 스타일 프리셋 기반 생성

**Style Copy의 Content Decoupling 규칙**:
- 참조 이미지의 텍스트/인물/로고를 **복사하지 않음**
- 레이아웃/색상/폰트 스타일만 상속
- 내용은 textOverlay와 visualDescription으로 교체

---

## ⚠️ 프롬프트 수정 시 절대 규칙

1. **프롬프트 텍스트 원문을 바꾸지 마라** — 구조(함수 시그니처, 파라미터)만 수정 가능
2. **SAFETY_SETTINGS_BLOCK_NONE을 변경하지 마라**
3. **모델명을 임의로 변경하지 마라** (gemini-3-flash-preview, gemini-3-pro-preview)
4. **새 프롬프트 추가 시 반드시 이 문서에 기록하라**
5. **responseMimeType: 'application/json'이 있는 프롬프트의 출력 형식을 바꾸지 마라**

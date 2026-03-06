# 📊 DATA_MODEL.md — 데이터 모델 완전 명세

> **Claude Code는 types.ts를 수정하거나 참조할 때 이 문서를 반드시 읽으세요.**
> 모든 필드의 의미, 기본값, 의존 관계가 여기에 있습니다.

---

## 1. Enum 정의 (10종)

### AspectRatio — 화면 비율
| 값 | 설명 | 사용처 |
|----|------|--------|
| `'1:1'` | 정사각형 (인스타) | 이미지/영상 생성 |
| `'16:9'` | 가로형 (유튜브) | 기본값 |
| `'9:16'` | 세로형 (쇼츠) | |
| `'4:3'` | 클래식 | |

### VoiceName — TTS 음성 (5종)
`Kore`(여/차분), `Puck`(남/장난), `Charon`(남/권위), `Fenrir`(남/깊음), `Zephyr`(여/부드러움)

### ImageModel — 이미지 생성 모델 ⚠️ 난독화됨
| Enum 값 | 실제 의미 | 가격 |
|---------|----------|------|
| `'model_std_flash'` | Gemini 2.5 Flash | $0.02/장 |
| `'model_pro_cost'` | Nano Banana Pro (고퀄) | $0.05/장 (기본값) |
| `'model_pro_speed'` | Nano Banana Pro (빠름) | $0.05/장 |

> ⚠️ 모델명이 난독화되어 있음. Cloud Run 자동 키 생성 방지 목적. 실제 API 호출 시 VideoGenService에서 매핑.

### VideoModel — 영상 생성 모델 (4종)
| 값 | 설명 | 가격 | API |
|----|------|------|-----|
| `'veo-3.1-apimart'` | Veo 3.1 1080p | $0.08 | Apimart |
| `'grok'` | Grok 720p | $0.10~0.15 | Kie |
| `'veo-3.1-fast'` | Veo 720p Fast | - | Laozhang |
| `'veo-3.1-quality'` | Legacy/Compat | - | - |

### VideoFormat — 영상 편집 템포 (3종)
| 값 | 설명 | 분할 규칙 |
|----|------|----------|
| `'long-form'` | 롱폼 | 2문장/씬 (기본) 또는 1문장/씬 (DETAILED) |
| `'short-form'` | 숏폼 | 1문장/씬 |
| `'nano-form'` | 나노 (도파민) | 단어/비트 단위 플래시 컷 |

### CompositionMode — 촬영 구도 (8종)
`NEWS_ANCHOR`, `CELEBRITY_SOLO`, `SPLIT_SCREEN`, `POV_OBSERVER`, `HANDHELD_CLUTCH`, `EXTREME_CLOSEUP`, `WIDE_ESTABLISH`, `PRESENTER_TALK`

### SceneType (2종)
- `PRESENTER`: 캐릭터 중심
- `SIMULATION`: 사물/물리 중심 (캐릭터 없음)

### CharacterAppearance (3종)
- `AUTO`: AI가 판단
- `ALWAYS`: 모든 씬에 캐릭터
- `MINIMAL`: 최소한만

### CreationMode
`'STRICT'` | `'HYBRID'` | `'CREATIVE'`

---

## 2. Scene 인터페이스 (핵심 — 45+ 필드)

### 기본 정보
| 필드 | 타입 | 필수 | 설명 |
|------|------|:----:|------|
| `id` | string | ✅ | 고유 ID (`scene-{timestamp}-{index}`) |
| `scriptText` | string | ✅ | 이 장면의 대본 텍스트 |
| `visualPrompt` | string | ✅ | 이미지 생성용 영문 프롬프트 |
| `visualDescriptionKO` | string | ✅ | 한국어 시각 설명 |
| `characterPresent` | boolean | ✅ | 캐릭터 등장 여부 |
| `characterAction` | string | | 캐릭터 동작 설명 |

### Smart Casting (v3.1 신규)
| 필드 | 타입 | 설명 |
|------|------|------|
| `castType` | `'MAIN'│'KEY_ENTITY'│'EXTRA'│'NOBODY'` | 배역 타입. KEY_ENTITY면 실존 인물 |
| `entityName` | string | 실존 인물/브랜드 이름 (예: "Donald Trump") |
| `entityVisualContext` | string | 구글 검색 기반 외모 묘사 (enrichEntityDetail 결과) |

> **중요**: castType이 `KEY_ENTITY`이면 generateSceneImage에서 캐릭터 참조 이미지를 무시하고, entityVisualContext로 대체.

### 시간/공간 컨텍스트
| 필드 | 타입 | 설명 |
|------|------|------|
| `temporalContext` | `'PRESENT'│'PAST'│'FUTURE'` | 시간대 |
| `sceneType` | SceneType | PRESENTER 또는 SIMULATION |
| `physicsRules` | string | 물리 규칙 설명 (SIMULATION용) |

### 텍스트 렌더링
| 필드 | 타입 | 설명 | 상호작용 |
|------|------|------|----------|
| `requiresTextRendering` | boolean | 이미지에 텍스트를 그릴지 | AI가 판단 또는 수동 토글 |
| `textToRender` | string | 렌더링할 텍스트 | requiresTextRendering=true일 때만 사용 |
| `fontStyle` | string | 폰트 스타일 | getAdaptiveFont()로 자동 결정 |

> **주의**: `textForceLock`(ProjectConfig)이 true여도 requiresTextRendering을 강제 true로 만들지 않음. AI 판단 존중.
> **주의**: `suppressText`(ProjectConfig)가 true면 모든 텍스트 렌더링 비활성화.

### 카메라/구도
| 필드 | 타입 | 설명 |
|------|------|------|
| `compositionMode` | CompositionMode | 촬영 구도 |
| `compositionConfig` | `{x, y, scale, textStyle}` | 구도 세부 설정 |
| `cameraAngle` | string | 카메라 각도 (예: "Low Angle") |
| `cameraMovement` | string | 카메라 움직임 (예: "Slow Dolly In") |
| `shotSize` | string | 샷 사이즈 (예: "Close Up") |
| `subjectFocus` | string | 피사체 포커스 |
| `isProductFocus` | boolean | 제품 중심 촬영 여부 |
| `keyVisual` | string | 핵심 비주얼 요소 |

### 이미지 관련
| 필드 | 타입 | 설명 |
|------|------|------|
| `imageUrl` | string | 생성된 이미지 (Base64 data URL) |
| `referenceImage` | string | 캐릭터 참조 이미지 URL |
| `sourceFrameUrl` | string | 시작 프레임 URL (리메이크용) |
| `endFrameUrl` | string | 종료 프레임 URL (리메이크용) |

### 영상 관련
| 필드 | 타입 | 설명 |
|------|------|------|
| `videoUrl` | string | 생성된 영상 URL |
| `videoModelUsed` | VideoModel | 사용된 영상 모델 |
| `generationTaskId` | string | 비동기 작업 ID (폴링용) |
| `grokDuration` | `'6'│'10'` | Grok 영상 길이 |
| `grokSpeechMode` | boolean | Grok 대사 모드 (true=한국어 대사, false=효과음) |

### 상태 플래그
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `isGeneratingImage` | boolean | **필수** | 이미지 생성 중 |
| `isGeneratingVideo` | boolean | **필수** | 영상 생성 중 |
| `generationStatus` | string | | 상태 메시지 (UI 표시용) |
| `isUpscaling` | boolean | | 업스케일링 중 |
| `isUpscaled` | boolean | | 업스케일 완료 |
| `isNativeHQ` | boolean | false | Native HQ 모드 (이미지 비용 2배) |
| `isInfographic` | boolean | false | 인포그래픽 모드 |
| `isLoopMode` | boolean | false | 영상 루프 모드 |
| `progress` | number | | 진행률 (0~100) |
| `videoGenerationError` | string | | 영상 생성 에러 메시지 |

### 타임라인 (리메이크 모드용)
| 필드 | 타입 | 설명 |
|------|------|------|
| `startTime` | number | 시작 시간 (초) |
| `endTimeStamp` | number | 종료 시간 (초) |
| `visualPeakTime` | number | 시각적 하이라이트 시점 |
| `endTime` | number | 끝 시간 |
| `audioScript` | string | 오디오 대본 |

---

## 3. ProjectConfig 인터페이스 (30+ 필드)

### 모드 & 대본
| 필드 | 타입 | 설명 |
|------|------|------|
| `mode` | `'SCRIPT'│'REMAKE'│'CHARACTER'` | 작업 모드 |
| `script` | string | 전체 대본 텍스트 |
| `manualSegments` | string[] | 수동 분할 세그먼트 |

### AI 분석 결과 (자동 채워짐)
| 필드 | 타입 | 채워지는 시점 |
|------|------|-------------|
| `detectedStyleDescription` | string | ScriptMode에서 스타일 분석 후 |
| `detectedCharacterDescription` | string | 캐릭터 이미지 분석 후 |
| `baseAge` | string | analyzeScriptContext() 후 |
| `globalContext` | string | analyzeScriptContext() 후 |
| `detectedLanguage` | string | analyzeScriptContext() 후 (예: "ko-KR") |
| `detectedLanguageName` | string | analyzeScriptContext() 후 (예: "Korean") |
| `detectedLocale` | string | analyzeScriptContext() 후 |
| `culturalNuance` | string | analyzeScriptContext() 후 |

### 모델 선택
| 필드 | 타입 | 기본값 |
|------|------|--------|
| `imageModel` | ImageModel | NANO_COST |
| `videoModel` | VideoModel | VEO |
| `aspectRatio` | AspectRatio | LANDSCAPE |
| `voice` | VoiceName | KORE |
| `videoFormat` | VideoFormat | LONG |
| `longFormSplitType` | `'DEFAULT'│'DETAILED'` | DEFAULT (v3.1 신규) |
| `creationMode` | CreationMode | |

### 참조 이미지
| 필드 | 타입 | 설명 |
|------|------|------|
| `characterImage` | string | 캐릭터 참조 (Base64) |
| `characterPublicUrl` | string | 캐릭터 참조 (Cloudinary URL) |
| `productImage` | string | 제품 참조 (Base64) |
| `productPublicUrl` | string | 제품 참조 (Cloudinary URL) |
| `atmosphere` | string | 선택된 스타일 프롬프트 (VISUAL_STYLES에서 선택) |

### 기능 토글
| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `smartSplit` | boolean | true | AI 자동 분할 (false면 줄바꿈 기준) |
| `textForceLock` | boolean | | 텍스트 렌더링 품질 강제 |
| `suppressText` | boolean | | **텍스트 금지 모드** (v3.1 신규) |
| `allowInfographics` | boolean | false | 인포그래픽 허용 |
| `isMixedMedia` | boolean | | 스타일 혼합 모드 |
| `isThumbnailOnlyMode` | boolean | | 썸네일만 생성 |
| `characterAppearance` | CharacterAppearance | AUTO | 캐릭터 등장 빈도 |

### 리메이크 모드 전용
| 필드 | 타입 | 설명 |
|------|------|------|
| `uploadedVideoFile` | File | 업로드된 영상 파일 |
| `remakeStrategy` | `'NARRATIVE'│'VISUAL'` | 리메이크 전략 |

### 캐릭터 모드 전용
| 필드 | 타입 | 설명 |
|------|------|------|
| `characterDraft` | CharacterDraft | 캐릭터 초안 데이터 |

### 프리뷰 이미지
| 필드 | 타입 | 설명 |
|------|------|------|
| `preGeneratedImages` | `{intro?, highlight?}` | ScriptMode에서 미리 생성한 프리뷰 |

---

## 4. Thumbnail 인터페이스 (16필드)

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 고유 ID |
| `textOverlay` | string | 썸네일 위 텍스트 (원본 언어) |
| `fullTitle` | string | 전체 제목 |
| `visualDescription` | string | 시각 설명 |
| `imageUrl` | string | 생성된 이미지 |
| `isGenerating` | boolean | 생성 중 |
| `generationStatus` | string | 상태 메시지 |
| `format` | `'long'│'short'` | Long-form / Short-form |
| `primaryColorHex` | string | 주 색상 |
| `secondaryColorHex` | string | 보조 색상 |
| `colorMode` | `'PURE_WHITE'│'FULL_COLOR'│'HIGHLIGHT_MIX'` | 컬러 모드 |
| `isNativeHQ` | boolean | HQ 모드 |
| `sentiment` | string | 감정 톤 |
| `highlight` | string | 하이라이트 키워드 (네온 컬러링용) |
| `shotSize` | string | 샷 사이즈 |
| `poseDescription` | string | 포즈 설명 |
| `cameraAngle` | string | 카메라 각도 |

---

## 5. 필드 간 의존 관계 핵심

```
ProjectConfig.suppressText = true
  → Scene.requiresTextRendering 무시 (모든 텍스트 비활성화)

Scene.castType = 'KEY_ENTITY'
  → Scene.entityName 필수
  → generateSceneImage에서 characterImage 무시
  → enrichEntityDetail()로 entityVisualContext 채움

ProjectConfig.smartSplit = false
  → parseScriptToScenes에서 줄바꿈 기준 분할

ProjectConfig.isThumbnailOnlyMode = true
  → scenes[] 빈 배열, 썸네일만 생성

Scene.isNativeHQ = true
  → 이미지 생성 비용 2배

ProjectConfig.longFormSplitType = 'DETAILED'
  → Long-form에서 1문장/씬 (기본은 2문장/씬)
```

# 🛡️ FEATURE_PRESERVATION.md — 기능 보존 체크리스트

> **코드를 수정하거나 리팩토링할 때 이 문서를 반드시 확인하세요.**
> 아래 20개 기능이 하나라도 깨지면 안 됩니다.
> Google AI Studio에서 기능 누락이 반복됐기 때문에 이 체크리스트가 존재합니다.

---

## 🔴 절대 깨지면 안 되는 기능 (★★★)

### 1. AI 장면 자동 분할 (Long/Short/Nano)
- **파일**: `services/geminiService.ts` → `parseScriptToScenes()`
- **검증**: 대본 입력 → 3개 이상 장면 생성
- **주의**: `longFormSplitType` 'DEFAULT' vs 'DETAILED' 분기 (v3.1 신규)

### 2. Smart Casting (MAIN/KEY_ENTITY/EXTRA/NOBODY)
- **파일**: `types.ts` Scene.castType, `services/geminiService.ts`
- **검증**: 실존 인물 포함 대본 → KEY_ENTITY로 캐스팅 → 캐릭터 참조 이미지 무시

### 3. 실존 인물 외모 검색 기반 묘사
- **파일**: `services/geminiService.ts` → `enrichEntityDetail()`
- **검증**: KEY_ENTITY 씬 → entityVisualContext에 검색 결과 기반 외모 묘사 채워짐

### 4. 이미지 생성 폴백 체인 (Laozhang → Kie)
- **파일**: `services/geminiService.ts` → `generateSceneImage()`, `services/VideoGenService.ts`
- **검증**: Laozhang 실패 시 Kie로 자동 전환, `result.isFallback = true`

### 5. 영상 배치 처리 (3종 모델 선택)
- **파일**: `hooks/useVideoBatch.ts`
- **검증**: Grok HQ / Veo 720p / Veo 1080p 각각 배치 실행 가능

### 6. HTML 프로젝트 내보내기/불러오기
- **파일**: `App.tsx` → `handleExportHtml()`, `handleImportProject()`
- **검증**: 내보내기 → 브라우저 독립 실행 → 다시 가져오기 → 데이터 100% 복원

### 7. 비주얼 스타일 프리셋 (72종)
- **파일**: `constants.ts` → `VISUAL_STYLES`
- **검증**: 6개 카테고리, 72개 스타일 모두 선택 가능 → 프롬프트에 반영

### 8. 프로젝트 자동 저장 (2초 디바운스)
- **파일**: `App.tsx` useEffect (scenes/config/thumbnails 변경 감지)
- **검증**: 작업 후 2초 → 새로고침 → 사이드바에서 복원

---

## 🟡 중요한 기능 (★★☆)

### 9. 실시간 비용 추적 (USD→KRW)
- **파일**: `App.tsx` CostDashboard, `services/geminiService.ts` → `fetchCurrentExchangeRate()`
- **검증**: 이미지/영상 생성 시 금액 증가, 환율 적용된 KRW 표시

### 10. 텍스트 렌더링 3모드 (자동/강제/금지)
- **파일**: Scene.requiresTextRendering, ProjectConfig.textForceLock, ProjectConfig.suppressText
- **검증**: suppressText=true면 모든 텍스트 비활성화

### 11. 인포그래픽 모드
- **파일**: Scene.isInfographic → `generateSceneImage()`의 `getIntegrativeInfographicInstruction()`
- **검증**: 토글 ON → 이미지에 차트/그래프가 씬 환경에 통합

### 12. Mixed Media 스타일 혼합
- **파일**: ProjectConfig.isMixedMedia → `generateSceneImage()`
- **검증**: 씬마다 다른 스타일 적용 가능

### 13. Native HQ 토글
- **파일**: Scene.isNativeHQ → 비용 2배 계산
- **검증**: 토글 ON → 이미지 품질 향상, 비용 2배

### 14. Grok 스피치/SFX 모드 전환
- **파일**: Scene.grokSpeechMode, Scene.grokDuration
- **검증**: 스피치=true → 한국어 대사, false → 효과음만

### 15. 캐릭터 라이브러리 (20 카테고리, 1000+ 프리셋)
- **파일**: `constants.ts` → `CHARACTER_LIBRARY`
- **검증**: 모든 카테고리 접근 가능, 캐릭터 선택 → 프롬프트 반영

### 16. CORS 우회 프록시 다운로드
- **파일**: `services/uploadService.ts` → `uploadRemoteUrlToCloudinary()`
- **검증**: 영상 다운로드 실패 시 Cloudinary 프록시로 재시도 (최대 3회)

---

## 🟢 보조 기능 (★☆☆)

### 17. 루프 모드
- **파일**: Scene.isLoopMode → 영상 프롬프트에 [LOOP: TRUE] 태그
- **검증**: 토글 ON → 영상 프롬프트에 반영

### 18. 프롬프트 가이드 HTML 내보내기
- **파일**: `App.tsx` → `handleExportVisualPromptsHtml()`, `handleExportVideoPromptsHtml()`
- **검증**: 비주얼/영상 프롬프트를 복사 가능한 HTML로 다운로드

### 19. 배경 제거 (Remove.bg)
- **파일**: `services/removeBgService.ts`
- **검증**: 이미지 업로드 → 배경 제거된 PNG 반환

### 20. Cloudinary 연결 검증
- **파일**: `services/uploadService.ts` → `validateCloudinaryConnection()`
- **검증**: API 설정에서 "연결 테스트" → 성공/실패 메시지

---

## 📋 리팩토링 시 사용법

코드를 수정한 후 아래를 실행하세요:

```
이 변경이 FEATURE_PRESERVATION.md의 20개 기능 중 
어떤 것에 영향을 줄 수 있는지 확인하고,
영향받는 기능의 검증 항목을 체크해줘.
```

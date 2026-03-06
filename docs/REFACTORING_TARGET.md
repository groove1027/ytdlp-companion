# 🏗️ REFACTORING_TARGET.md — 리팩토링 목표 구조 & 에러 처리 가이드

> **아키텍처 변경, 파일 분리, 에러 처리 관련 작업 시 이 문서를 참조하세요.**

---

## Part 1: 리팩토링 목표 디렉토리 구조

현재 → 목표로 점진적 전환. 한 번에 바꾸지 말고 Phase별로 진행.

### 현재 구조 (문제점 표시)
```
src/
├── App.tsx              ← ⚠️ 1,640줄 God Component
├── types.ts             ← OK
├── constants.ts         ← ⚠️ 스타일 데이터 20KB+ 번들 포함
├── components/
│   ├── modes/
│   │   ├── ScriptMode.tsx    ← ⚠️ 1,248줄
│   │   ├── CharacterMode.tsx ← ⚠️ 1,310줄
│   │   └── ...
│   └── ThumbnailGenerator.tsx ← ⚠️ 795줄
├── services/
│   ├── geminiService.ts      ← ⚠️ 1,619줄
│   └── ...
└── hooks/
    └── useVideoBatch.ts      ← OK
```

### 목표 구조
```
src/
├── app/
│   ├── App.tsx              ← 레이아웃 + 라우터만 (200줄 이하)
│   ├── providers.tsx        ← Zustand Provider 래핑
│   └── routes.tsx           ← 라우트 정의 (선택)
│
├── components/
│   ├── ui/                  ← 공통 UI 컴포넌트
│   │   ├── Button.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── Card.tsx
│   │   └── Skeleton.tsx
│   └── features/
│       ├── storyboard/      ← StoryboardScene 분리
│       │   ├── SceneCard.tsx
│       │   ├── SceneEditor.tsx
│       │   └── SceneGrid.tsx
│       ├── thumbnail/       ← ThumbnailGenerator 분리
│       │   ├── ThumbnailCard.tsx
│       │   ├── ThumbnailGrid.tsx
│       │   └── ThumbnailControls.tsx
│       ├── config/          ← ConfigForm, ApiKeySettings
│       ├── sidebar/         ← ProjectSidebar
│       ├── export/          ← 내보내기 로직 분리
│       │   ├── ExportPanel.tsx
│       │   └── HtmlExporter.ts
│       ├── cost/            ← CostDashboard 분리
│       ├── video-batch/     ← BatchControls, BatchProgress
│       └── modes/
│           ├── script/      ← ScriptMode 분리 (설정/프리뷰/결과)
│           ├── character/   ← CharacterMode 분리
│           └── remake/      ← RemakeMode
│
├── hooks/
│   ├── useVideoBatch.ts     ← 기존 유지
│   ├── useToast.ts          ← 새로 만들기
│   ├── useProject.ts        ← 프로젝트 CRUD
│   ├── useCost.ts           ← 비용 추적
│   └── useImageGeneration.ts ← 이미지 생성 훅
│
├── services/
│   ├── ai/                  ← geminiService.ts 분리
│   │   ├── promptBuilder.ts       ← 프롬프트 조립 (헬퍼 함수들)
│   │   ├── sceneAnalyzer.ts       ← parseScriptToScenes
│   │   ├── imageGenerator.ts      ← generateSceneImage
│   │   ├── videoAnalyzer.ts       ← analyzeVideoContent, analyzeVideoHybrid
│   │   ├── contextAnalyzer.ts     ← analyzeScriptContext
│   │   ├── entityEnricher.ts      ← enrichEntityDetail
│   │   ├── thumbnailAI.ts         ← generateThumbnailConcepts, generateHighQualityThumbnail
│   │   └── apiProxy.ts            ← requestGeminiProxy, convertGoogleToOpenAI
│   ├── media/
│   │   ├── providers/
│   │   │   ├── kieProvider.ts     ← Kie API 어댑터
│   │   │   ├── laozhangProvider.ts ← Laozhang API 어댑터
│   │   │   └── apimartProvider.ts  ← Apimart API 어댑터
│   │   ├── imageProcessing.ts
│   │   ├── uploadService.ts
│   │   └── removeBgService.ts
│   ├── storage/
│   │   ├── indexedDb.ts           ← storageService.ts 이동
│   │   └── apiKeys.ts            ← apiService.ts 이동
│   ├── apiClient.ts              ← monitoredFetch + 재시도 + 타임아웃 통합
│   └── logger.ts
│
├── stores/                  ← Zustand 상태 관리
│   ├── projectStore.ts      ← config, scenes, thumbnails
│   ├── uiStore.ts           ← 모달, 토스트, 사이드바, 라이트박스
│   └── costStore.ts         ← 비용 추적
│
├── types/                   ← types.ts 분리
│   ├── scene.ts
│   ├── project.ts
│   ├── thumbnail.ts
│   ├── api.ts
│   ├── enums.ts
│   └── index.ts             ← re-export all
│
├── constants/               ← constants.ts 분리 (번들 최적화)
│   ├── pricing.ts
│   ├── visualStyles.ts      ← lazy load 가능
│   ├── characterLibrary.ts  ← lazy load 가능
│   ├── characterStyles.ts   ← lazy load 가능
│   └── models.ts
│
├── utils/
│   ├── fileHelpers.ts       ← dataURLtoFile, getSafeFilename, convertBase64ToJpg
│   ├── formatters.ts        ← 숫자 포맷, 날짜 포맷
│   └── validators.ts        ← API 키 검증 등
│
└── templates/               ← 인라인 HTML 분리
    ├── exportHtml.ts        ← handleExportHtml의 HTML 템플릿
    └── promptGuide.ts       ← downloadPromptGuideHtml 템플릿
```

### Phase별 전환 계획

**Phase 2-A: Zustand 도입 (가장 먼저)**
1. `npm install zustand`
2. `stores/projectStore.ts` 생성 — App.tsx의 useState들을 이동
3. `stores/uiStore.ts` 생성 — 모달/토스트/사이드바 상태
4. `stores/costStore.ts` 생성 — 비용 추적
5. App.tsx에서 useState 제거 → store 접근으로 교체
6. StoryboardScene의 20+ props → store 직접 접근

**Phase 2-B: App.tsx 분해**
1. CostDashboard → `components/features/cost/`
2. 내보내기 함수들 → `components/features/export/`
3. 헬퍼 함수들 → `utils/fileHelpers.ts`
4. HTML 템플릿 → `templates/exportHtml.ts`

**Phase 2-C: geminiService.ts 분리**
1. 헬퍼 함수 → `services/ai/promptBuilder.ts`
2. requestGeminiProxy → `services/ai/apiProxy.ts`
3. 각 export 함수 → 해당 모듈로 이동
4. **프롬프트 텍스트 원문은 그대로 이동**

**Phase 2-D: 대형 컴포넌트 분리**
1. ScriptMode(1,248줄) → 설정/프리뷰/결과 분리
2. CharacterMode(1,310줄) → 라이브러리/믹서/결과 분리
3. ThumbnailGenerator(795줄) → 카드/그리드/컨트롤 분리

---

## Part 2: 에러 처리 가이드

### 현재 에러 처리 패턴 (문제점)

| 현재 방식 | 문제 | 개선 방향 |
|-----------|------|----------|
| `alert()` | UX 나쁨, 코드 블로킹 | Toast 시스템 |
| `console.error()` | 사용자에게 안 보임 | logger + Toast 조합 |
| `try/catch` 후 무시 | 에러 추적 불가 | 반드시 사용자 알림 |
| API 실패 시 빈 에러 메시지 | 원인 파악 불가 | 상세 에러 메시지 |

### 개선된 에러 처리 패턴

```typescript
// ❌ 현재
try {
  const result = await generateSceneImage(...);
} catch (e: any) {
  alert(`에러: ${e.message}`);
}

// ✅ 목표
try {
  const result = await generateSceneImage(...);
} catch (e: any) {
  logger.error('이미지 생성 실패', e);
  toast.error(`이미지 생성 실패: ${e.message}`);
  // 상태 복구
  setScenes(prev => prev.map(s => 
    s.id === sceneId ? { ...s, isGeneratingImage: false, generationStatus: '생성 실패' } : s
  ));
}
```

### API별 에러 처리

**Laozhang/Kie/Apimart 공통**:
- 401/403 → "API 키가 유효하지 않습니다. 설정을 확인해주세요."
- 429 → "요청 한도 초과. 잠시 후 다시 시도해주세요." + 자동 재시도 (30초 후)
- 500+ → "서버 오류. 잠시 후 다시 시도해주세요." + 자동 재시도 (3회)
- 네트워크 오류 → "네트워크 연결을 확인해주세요."
- 타임아웃 → "응답 시간 초과. 다시 시도해주세요."

**이미지 생성 폴백**:
```
Laozhang 실패 → Kie로 자동 전환 → Kie도 실패 → 에러 표시 + "수동 업로드" 안내
```

**영상 생성 폴링**:
```
폴링 5분 초과 → 타임아웃 에러 → "다른 모델로 시도해보세요" 안내
```

**Cloudinary 업로드**:
```
실패 → "Cloudinary 설정을 확인해주세요" + API 설정 페이지 링크
```

### 상태 복구 원칙

에러 발생 시 반드시:
1. 로딩 상태 해제 (`isGeneratingImage: false`, `isGeneratingVideo: false`)
2. 에러 메시지 표시 (`generationStatus: '실패 메시지'`)
3. 사용자가 재시도 가능하도록 UI 유지
4. 부분 완료된 데이터 보존 (전체 롤백하지 않음)

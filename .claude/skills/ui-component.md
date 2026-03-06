# 스킬: UI 컴포넌트 (components/ 폴더 전체)

> **활성화 조건**: "UI", "컴포넌트", "화면", "버튼", "모달", "레이아웃" 키워드 또는 `components/*` 파일 수정 시

---

## 📂 담당 파일 및 크기

| 파일 | 줄수 | 역할 | 리팩토링 필요 |
|------|------|------|:---:|
| modes/CharacterMode.tsx | 1,310 | 캐릭터 디자인 모드 | ⚠️ 분리 필요 |
| modes/ScriptMode.tsx | 1,248 | 대본 모드 설정 폼 | ⚠️ 분리 필요 |
| ThumbnailGenerator.tsx | 795 | 썸네일 생성/관리 | ⚠️ 분리 필요 |
| modes/CharacterGenCard.tsx | 312 | 캐릭터 생성 카드 | ✅ 적정 |
| StoryboardScene.tsx | 305 | 씬 카드 UI | ✅ 적정 |
| QuickLab.tsx | 262 | 빠른 실험 모드 | ✅ 적정 |
| ProjectSidebar.tsx | 254 | 프로젝트 목록 | ✅ 적정 |
| ApiKeySettings.tsx | 233 | API 키 관리 | ✅ 적정 |
| ConfigForm.tsx | 192 | 프로젝트 설정 | ✅ 적정 |
| ProcessingOverlay.tsx | 153 | 로딩 오버레이 | ✅ 적정 |
| DebugConsole.tsx | 98 | 디버그 콘솔 | ✅ 적정 |
| ImageLightbox.tsx | 62 | 이미지 확대 | ✅ 적정 |
| App.tsx (components/) | 6 | 미사용 래퍼 | 🗑️ 삭제 가능 |

## ⚠️ 규칙

1. **컴포넌트 최대 300줄**. 초과 시 분리 계획 수립 후 진행.
2. **Props 8개 초과 금지**. StoryboardScene(20+)은 리팩토링 대상.
3. **Tailwind 클래스는 인라인 사용**. 별도 CSS 파일 생성하지 마라.
4. **모달은 반드시 ESC 키 + 배경 클릭으로 닫히도록**.
5. **한국어 UI 텍스트는 하드코딩 허용** (i18n은 향후 과제).

## 🎨 스타일 패턴

```tsx
// 배지 (Badge) 패턴
<span className="text-[10px] font-bold px-2 py-0.5 rounded border
  bg-blue-900/30 text-blue-300 border-blue-500/50">
  텍스트
</span>

// 버튼 패턴
<button className="px-4 py-2 bg-gray-800 hover:bg-gray-700 
  border border-gray-600 text-gray-200 rounded-lg text-sm font-bold 
  shadow-md flex items-center gap-2">
  <span>아이콘</span> 텍스트
</button>

// 그래디언트 버튼
<button className="bg-gradient-to-r from-blue-600 to-cyan-600 
  hover:from-blue-500 hover:to-cyan-500 text-white px-4 py-2 
  rounded-lg text-sm font-bold border border-blue-400/50 shadow-md">
  텍스트
</button>
```

## 🔗 StoryboardScene Props 목록 (현재 20+)

```
scene, index, aspectRatio, videoFormat,
onGenerateImage, onGenerateGrok, onGenerateGrokHQ,
onGenerateVeoFast, onGenerateVeoQuality,
onUploadImage, onToggleSmartText, onRetryCharacter,
onCancelGeneration, onUpdateScript, onUpdateTextToRender,
onUpdatePrompt, onImageClick, onSplit, onAddNext, onDelete,
onInjectCharacter, onUpdateGrokDuration, onUpdateGrokSpeech,
variant, onAutoPrompt, onToggleNativeHQ, onToggleInfographic,
onToggleLoopMode, onCancelImageGeneration
```

→ **리팩토링 시 Context 또는 Store로 대부분 제거 가능**

## 🎯 수정 시 체크포인트

- [ ] 반응형 확인 (모바일 sm: / 태블릿 md: / 데스크탑 lg:)
- [ ] 다크 모드 대비 확인 (현재 다크 모드 하드코딩)
- [ ] 로딩 중 상태 표시 (isGeneratingImage, isGeneratingVideo)
- [ ] 에러 상태 표시 (videoGenerationError)

# Ralph Fix Plan — All-in-One Production v3.1

> Ralph가 순서대로 처리할 작업 목록.
> 각 작업은 구체적이고, 검증 가능하고, 독립적이어야 합니다.

## High Priority

- [ ] src/App.tsx의 모든 alert() 호출을 찾아서 useUIStore의 toast 시스템으로 교체하라. `useUIStore.getState().setToast({message, type})` 패턴 사용. handleConfigSubmit의 catch 블록, API 키 체크 등 모든 alert()를 교체. 작업 후 `cd src && npx tsc --noEmit && npm run build` 검증.

- [ ] src/hooks/useVideoBatch.ts의 모든 alert() 호출을 찾아서 logger.warn() + 조기 return 패턴으로 교체하라. "작업할 대상이 없습니다", "대상 없음", "원본 작업 ID가 없습니다" 등의 alert를 제거. 작업 후 빌드 검증.

- [ ] src/App.tsx의 handleConfigSubmit 함수가 너무 길다 (~180줄). SCRIPT 모드 분기를 `handleScriptModeSubmit(newConfig, finalConfig)` 함수로 추출하여 별도 함수로 분리하라. App.tsx 내에서 분리하되, handleGenerateImage 등 다른 함수 참조는 유지. 작업 후 빌드 검증.

- [ ] src/App.tsx의 handleGenerateImage 함수에서 REMAKE 모드 early return 이후의 일반 모드 로직이 ~100줄이다. 이를 `generateSceneImageWithFallback(sceneId, feedback, scenesSnapshot, configSnapshot)` 함수로 추출하라. 작업 후 빌드 검증.

## Medium Priority

- [ ] src/components/StoryboardScene.tsx에서 비디오 생성 관련 props (onGenerateGrokHQ, onGenerateVeoFast, onGenerateVeoQuality)를 `onGenerateVideo(id: string, model: VideoModel)` 하나의 콜백으로 통합하라. App.tsx의 호출부도 함께 수정. VideoModel enum 활용. 작업 후 빌드 검증.

- [ ] src/services/VideoGenService.ts에서 validateXaiConnection 함수가 에러 시 구체적인 HTTP 상태코드를 반환하지 않는다. 401=키 유효하지 않음, 402=잔액 부족, 429=요청 제한으로 구분하여 메시지를 반환하도록 개선하라. 작업 후 빌드 검증.

## Low Priority

- [ ] src/types.ts의 Scene 인터페이스에 JSDoc 주석을 추가하라. 각 필드 그룹(기본정보, 캐스팅, 컨텍스트, 카메라, 미디어, 상태, V2V)별로 구분 주석을 달아라. 기존 코드 수정 없이 주석만 추가.

## Completed
- [x] Project enabled for Ralph (2026-02-24)

## Notes
- 각 작업 완료 후 `docs/CHECKLIST.md`에 요약 추가할 것
- App.tsx에 새로운 useState 추가 금지 (CLAUDE.md 규칙)
- 프롬프트 텍스트 수정 금지

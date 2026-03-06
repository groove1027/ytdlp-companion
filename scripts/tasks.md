# Overnight Tasks — 자동 작업 목록

> `- [ ]` = 미완료 (스크립트가 순서대로 실행)
> `- [x]` = 완료 (스크립트가 자동으로 체크)
>
> 작업을 추가할 때: 반드시 구체적으로 작성하세요.
> 나쁜 예: "버그 수정해줘"
> 좋은 예: "src/App.tsx의 handleConfigSubmit에서 REMAKE 모드일 때 Cloudinary 업로드 실패 시 에러 메시지가 표시되지 않는 버그를 수정하라. 에러를 catch해서 uiStore.toast로 표시하라."

## 예시 (삭제 후 실제 작업 입력)

- [ ] src/App.tsx의 alert() 호출을 모두 찾아서 useUIStore의 toast 시스템으로 교체하라. toast({type:'error', message:...}) 패턴을 사용하라. 작업 후 tsc --noEmit과 npm run build로 검증하라.
- [ ] src/components/StoryboardScene.tsx에서 props 중 onGenerateImage, onGenerateGrokHQ, onGenerateVeoFast, onGenerateVeoQuality를 하나의 onGenerateVideo(id, model) 콜백으로 통합하라. VideoModel enum을 활용하라.

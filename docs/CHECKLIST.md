# ✅ CHECKLIST.md — 작업 체크리스트

> **이 파일은 "뭘 끝냈고 뭐가 남았는지"를 추적합니다.**
> 모든 작업 후 반드시 이 파일을 업데이트하세요.
> 새로운 대화 시작 시 이 파일을 읽고 현재 상황을 파악하세요.

---

## 🟢 완료된 작업

- [x] 편집점 매칭 AI 파싱/정제 병렬 처리 최적화 — parseEditTableWithAI() 대형 편집표 청크 순차→3개 동시 병렬, refineTimecodes() 타임코드 정제 순차→4개 동시 병렬(Promise.allSettled), 체감 3-5배 속도 향상 (editPointService.ts, editPointStore.ts, 2026-03-13)
- [x] 편집실 레이어 클릭 선택 + 인스펙터 패널 — 타임라인 7개 트랙 전체 클릭 선택, 선택 하이라이트(ring-2 ring-amber-400), 우측 패널 GlobalPanel↔LayerInspectorPanel 조건부 전환, 5종 서브인스펙터(Video/Subtitle/Transition/Audio/BGM), 우클릭 컨텍스트 메뉴(뮤트/솔로/초기화/삭제), Escape 선택해제 + Delete 삭제/초기화 키보드 단축키 (types.ts, editRoomStore.ts, VisualTimeline.tsx, EditRoomTab.tsx, LayerInspectorPanel.tsx, 5 inspectors, TimelineContextMenu.tsx, 2026-03-13)
- [x] 영상 분석실 5병렬 AI 분석 + 프로그레시브 렌더링 — 10버전 프리셋(tikitaka/snack/condensed/alltts)을 5배치×2버전으로 병렬 분할, 배치 완료 즉시 버전 표시, 예상 소요시간 배너 대폭 강화(눈에 확 띄는 디자인+롱폼 경고+배치 진행률 인디케이터), ESTIMATED_TOTAL_SEC 병렬시 50초로 단축 (VideoAnalysisRoom.tsx, AnalysisLoadingPanel.tsx, 2026-03-13)
- [x] #179 편집실 믹서 버튼 클릭 시 에러 수정 — AudioMixerModal에서 origAudio 트랙의 VU 미터 ref 누락으로 `Cannot read properties of undefined (reading 'meter')` 크래시 발생, origMeterRef/origPeakRef 추가 + meterState에 origSmooth/origPeak/origPeakAge 추가 + meterRefs에 origAudio 매핑 추가 + 마스터 레벨에 origPct 반영 (AudioMixerModal.tsx, 2026-03-13)
- [x] #144 채널 스타일 리메이크 기능 — 채널 DNA 분석 결과 화면에서 YouTube 링크/파일/텍스트 입력 → 3가지 버전(원본충실/구조재편집/창작확장) 대본 동시 생성, 버전 선택 시 대본작성 탭으로 자동 이동, 채널 말투·구조·감정전개 정확 모방 (types.ts, ChannelRemakePanel.tsx, ChannelAnalysisRoom.tsx, 2026-03-13)
- [x] TikTok 캡션/댓글 자동 수집 기능 — 소셜 콘텐츠 분석실에서 URL 붙여넣기 한 번으로 영상+캡션+댓글 동시 자동 수집, 서버에 /api/social/metadata + /api/social/download 엔드포인트 추가, 비YouTube URL 소셜 전용 라우팅, 캡션/댓글 자동채움 + "자동 수집됨" 뱃지 + 메타데이터 정보 바, 기타 SNS에서도 URL 입력 지원 (server/index.js, ytdlpApiService.ts, videoDownloadService.ts, SocialAnalysisRoom.tsx, 2026-03-13)
- [x] #154 뮤직 레퍼런스 분석실 — 사운드 스튜디오에 "뮤직 레퍼런스" 서브탭 추가, 모든 YouTube URL 형식 파싱(채널/@handle/플레이리스트/영상/쇼츠/embed/live/mix/베어ID 등), 플레이리스트→영상목록 자동변환, Gemini 3.1 Pro 멀티모달로 음악 DNA(장르/BPM/키/악기/무드/구조/프로덕션) + 비주얼 DNA(아트스타일/색상팔레트/타이포/레이아웃) 이중 분석, 음악+비주얼 DNA 퓨전 썸네일 4컨셉 생성, Suno 프롬프트 자동 생성 (types.ts, musicReferenceService.ts, musicReferenceStore.ts, MusicReferenceRoom.tsx, SoundStudioTab.tsx, 2026-03-13)
- [x] Cobalt + Piped/Invidious → yt-dlp API 서버 전환 — 모든 다운로드 경로를 자체 yt-dlp API(175.126.73.193:3100) 단일 소스로 통일, cobaltAuthService.ts 삭제, Piped/Invidious 다운로드 코드 전량 제거(~200줄), 자막 조회용 Piped/Invidious는 유지 (2026-03-13)
- [x] YouTube CDN CORS 우회 — Method A(직접 다운로드, 서버 대역폭 0) 적용: triggerDirectDownload()로 CDN URL 직접 내비게이션, Blob 필요 시(프레임 추출/쇼핑영상) downloadVideoViaProxy()로 서버 프록시 경유, fetchStreamBlob/saveBlobAsFile 제거, downloadProgress 상태 제거, VPS에 /api/download 프록시 엔드포인트 배포 (ytdlpApiService.ts, ChannelAnalysisRoom.tsx, VideoAnalysisRoom.tsx, videoDownloadService.ts, server/index.js, 2026-03-13)
- [x] 편집실 타임라인 원본오디오 재생 기능 구현 — AudioTrackId에 origAudio 추가, 타임라인 재생 시 각 장면의 videoUrl 오디오 동기 재생, M/S 뮤트/솔로 버튼 추가, 볼륨 컨트롤, AudioMixerModal/AudioEffectModal에 origAudio 트랙 추가 (types.ts, editRoomStore.ts, VisualTimeline.tsx, AudioMixerModal.tsx, AudioEffectModal.tsx, 2026-03-13)
- [x] 영상 분석실 지난 분석 클릭 시 비주얼(썸네일) 누락 수정 — loadSlot에서 thumbnails:[]로 초기화되어 유실되던 문제, resultCache에서 thumbs 복원하도록 수정 (videoAnalysisStore.ts, 2026-03-13)
- [x] #153 썸네일 텍스트 모드 선택 기능 — 3모드(AI 자동/직접 입력/이미지만) 셀렉터 추가, 이미지만 모드에서 프롬프트의 텍스트 블록 제거 + 네거티브 강화, 직접 입력 모드에서 사용자 커스텀 텍스트 주입, 재생성 시 textMode 유지 (types.ts, SetupPanel.tsx, ThumbnailStudioTab.tsx, ThumbnailGenerator.tsx, thumbnailService.ts, 2026-03-13)
- [x] #160 대본작성 "단락나누기 실행" 후 이미지/영상 탭 "스토리보드 생성" 버튼 비활성화 버그 수정 — handleSceneAnalysis에서 config.script 미전달 문제 해결, 탭 이동 시 script/videoFormat/smartSplit/longFormSplitType/aspectRatio를 프로젝트 config에 전달, SetupPanel의 splitResult 구독을 reactive로 변경 (ScriptWriterTab.tsx, SetupPanel.tsx, 2026-03-12)
- [x] #146 내 피드백 내역 팝업 + 답변 확인 기능 — 헤더 "내 피드백" 버튼, 보낸 피드백 목록/상태/답변 내용 팝업 조회, GitHub API 실시간 상태 체크 (FeedbackHistoryPanel.tsx, feedbackService.ts, uiStore.ts, App.tsx, 2026-03-12)
- [x] #142 영상/분석실에 All TTS 리메이크 프리셋 추가 — 스크립트 리빌딩 프로토콜 v3.6 적용, 원본 100% 보존 + 텍스트 유사도 0% 수렴 TTS 전용 대본 10종 생성 + Content ID 회피 분석 (VideoAnalysisRoom.tsx, types.ts, docs/all-tts-protocol.md, 2026-03-12)
- [x] #129 Evolink API 429 Rate Limit 재시도 — 태스크 생성(이미지/비디오)에 지수 백오프 재시도(2s→4s→8s, 최대 3회) 추가, 폴링 중 429 시 5초 추가 대기 (evolinkService.ts, 2026-03-12)
- [x] #128 이미지 생성 폴백 시 사용자 미통지 수정 — Kie→Evolink 폴백 발생 시 showToast로 서버 변경 재시도 안내 표시 (imageGeneration.ts, 2026-03-12)
- [x] GhostCut 자막 제거 UI/UX 대폭 개선 — 폴링 메시지 6단계 세분화 (대기열→감지→제거→장시간→고해상도→초장시간), D1 progress 필드 활용, 예상 소요시간 영상길이별 정확 표시, 처리 중 안내 박스, 배치 처리 소요시간 경고, 진행률 계산 실측 반영 (ghostcutService.ts, SubtitleRemoverTab.tsx, Step3Export.tsx, editPointStore.ts, 2026-03-11)
- [x] 피드백 진단 시스템 10배 강화 — LoggerService 12→23섹션 확장 (탭방문이력, API실패상세, Blob URL추적, 비동기작업추적, 에러체인, 삼킨에러), 13개 스토어 탭추적 배선, 12개 폴링함수 비동기추적, 클라이언트 빈catch 전량(~230곳) trackSwallowedError 배선, 에러체인 16곳, Blob등록/해제 95곳, export섹션 우선순위 재배치, 35KB 초과 시 Cloudinary .txt 업로드+GitHub Issue 링크 (LoggerService.ts, feedbackService.ts, feedback.ts, 13 stores, 70+ files, 2026-03-13)
- [x] 디버그 로그 시스템 최대 고도화 — 15개 진단 카테고리 추가 (생성 파라미터/결과, 설정 변경 감사, 미디어 치수 검증, API 워터폴, Console 캡처, Long Task, 메모리 타임라인, 네트워크 타임라인, 리소스 실패, Feature Detection, React Error Boundary, 프로젝트 설정 스냅샷, 스토어 상태 요약) (LoggerService.ts, ErrorBoundary.tsx, apiService.ts, imageGeneration.ts, useVideoBatch.ts, projectStore.ts, imageVideoStore.ts, StoryboardPanel.tsx, FeedbackModal.tsx, index.tsx, 2026-03-11)
- [x] #83 이미지/영상 스토리보드 대본 변경 시 기존 장면 미초기화 수정 — 대본 변경 감지 로직 추가, enrichMode를 대본 불일치 시 비활성화하여 새 장면으로 전면 교체, autoImageTriggeredRef 리셋으로 새 장면 자동 이미지 생성 보장 (SetupPanel.tsx, StoryboardPanel.tsx, 2026-03-11)
- [x] #84 채널 스타일 지침서 수동 수정 기능 추가 — 대본작성 탭의 채널 스타일 표시를 편집 가능한 textarea로 변경, 말투/구조/도입패턴/마무리 필드를 사용자가 직접 수정 가능 (ScriptWriterTab.tsx, 2026-03-11)
- [x] #86 축약리캡 롱폼(30분) 영상 타임코드가 초반 1분에만 집중되는 문제 수정 — 축약리캡 시스템/유저 프롬프트에 원본 영상 전체 구간 골고루 분포 지시 추가, 예시 타임코드를 전체 영상 범위로 변경 (VideoAnalysisRoom.tsx, 2026-03-11)
- [x] #73 EDL+SRT 추출 시 프리미어 프로에서 빈 파일로 나오는 버그 수정 — CMX 3600 EDL 포맷을 Premiere Pro 호환으로 수정: 릴네임 8자 제한, AA/V 트랙 표기, CRLF 줄바꿈, UTF-8 BOM 추가 (editPointService.ts, editPointStore.ts, 2026-03-11)
- [x] #75 편집점 매칭 AI 파싱 실행 안 되는 버그 수정 — maxTokens 4096→16384 증가, finishReason="length" 감지 시 잘린 JSON 복구 로직 추가 (editPointService.ts, 2026-03-11)
- [x] #76 편집실 나레이션 내보내기 시 CapCut에서 오디오 끊김 수정 — ZIP 내보내기에 나레이션 오디오 파일(audio/ 폴더) 포함, downloadSrtWithAssetsZip에 narrationLines 파라미터 추가 (srtService.ts, EditRoomTab.tsx, 2026-03-11)
- [x] #82 편집실 MP4 내보내기 반복 실패 수정 — WebCodecs 메모리 임계값 강화(90%→75%), 할당 힙 대비 사용률 체크 추가, 여유 메모리 500MB 미만 시 경고, 메모리 부족 시 사용자에게 구체적 안내 메시지 표시 (webcodecs/index.ts, 2026-03-11)
- [x] #62/#81/#85 채널분석 쇼츠 필터링 버그 수정 — isShorts() 함수에서 player.embedWidth/Height가 임베드 플레이어 크기(480x270)를 반환해 대부분의 쇼츠를 가로형으로 오판하는 문제 수정, player 비율을 세로형 확정 시에만 사용하도록 변경, lenient 보충 필터(3분 이하) 추가, 2페이지 검색으로 후보 영상 확대, 403 API 키 에러 시 구체적 안내 메시지 추가 (youtubeAnalysisService.ts, 2026-03-11)
- [x] #51 새로고침 후 프로젝트 전부 사라지는 버그 수정 — cleanupEmptyProjects에 최신 프로젝트 보호 + 1시간 미경과 프로젝트 보호, App.tsx에서 last-project-id를 currentId로 전달, useAutoSave에 beforeunload 긴급 저장(flushSave) 추가, 저장 실패 시 모든 에러에 Toast 표시, saveProject에 에러 로깅 추가 (storageService.ts, useAutoSave.ts, App.tsx, 2026-03-10)
- [x] #50 이미지/영상 "청크 파싱 실패: Failed to fetch" 에러 수정 — 청크 분할 파싱에 지수 백오프 재시도(2s→6s→18s) 적용, 짧은 대본 파싱에도 네트워크 오류 재시도 추가, 네트워크 오류 vs API 오류 구분 에러 메시지, 사용자에게 구체적 조치 안내 (scriptAnalysis.ts, 2026-03-10)
- [x] #44 내보내기 70%에서 멈춤 + 텍스트 붙여넣기 불가 수정 — (1) 비디오 프레임 추출(getFrameAt)에 5초 타임아웃, renderAllFrames에 전체 10분 타임아웃+메모리 압력 체크, 오디오 렌더링(startRendering)에 5분 타임아웃, fetchAndDecode에 30초 타임아웃, composeMp4 시작 시 메모리 90% 초과 시 FFmpeg 폴백 (index.ts, canvasRenderer.ts, audioMixer.ts) (2) VisualTimeline 키보드 핸들러에 contentEditable 요소 감지 추가 — 붙여넣기(Cmd+V)/스페이스바 차단 방지 (VisualTimeline.tsx, 2026-03-10)
- [x] #49 이미지/영상 스타일 선택 후 스토리보드에 이미지 미표시 수정 — StoryboardPanel 진입 시 이미지 없는 장면 자동 일괄 생성 useEffect 추가, autoImageTriggeredRef로 중복 실행 방지, 500ms 딜레이로 UI 렌더 후 시작 (StoryboardPanel.tsx, 2026-03-10)
- [x] #43 채널분석에서 대본 대신 영상 설명글로 분석하는 문제 수정 — getVideoTranscript에 Invidious/Piped API 자막 다운로드 체인 추가(OAuth 불필요, 쿼터 무소비), 언어 우선순위(한국어>영어>기타) 자막 트랙 선택, VTT→평문 변환, transcriptSource 필드 추가로 출처 추적, 설명 폴백 시 AI 프롬프트에 품질 경고 주입 (youtubeAnalysisService.ts, types.ts, ChannelAnalysisRoom.tsx, 2026-03-10)
- [x] #45 채널분석 쇼츠 인기순 5개 분석 시 한 영상만 분석한 것 같은 결과 수정 — analyzeChannelStyle 프롬프트에 Multi-Video Analysis Rule 추가, 영상별 메타데이터(태그/길이/설명) 개별 구조화, 영상 목록 요약 섹션 추가, 본문 없는 쇼츠도 제목/태그에서 주제 유추 지시 (youtubeAnalysisService.ts, 2026-03-10)
- [x] #46 피드백 모달 텍스트 복사 시 모달 닫힘 + 내용 소실 수정 — backdrop onClick→onMouseDown/onMouseUp 분리로 텍스트 선택 시 닫힘 방지, localStorage 임시저장으로 재열기 시 내용 복원, 작성 중 닫기 시 confirm 대화상자 표시 (FeedbackModal.tsx, 2026-03-10)
- [x] #35 사운드 스튜디오 플레이 버튼 무반응 수정 — handlePlayAll/handleGenerateAll 사일런트 리턴에 showToast 안내 추가, 플레이 버튼 disabled 시 시각적 피드백(회색 배경 + 툴팁), 음성 미선택 시 하단 안내 배너 (TypecastEditor.tsx, VoiceStudio.tsx, 2026-03-10)
- [x] #33 대본 생성 시 쇼츠(숏폼) 옵션 추가 — ScriptWriterTab STEP 3에 콘텐츠 형식(롱폼/쇼츠) 토글 + 쇼츠 초수(15/30/45/60초) 선택 UI 추가, handleGenerateScript/handleGenerateFromTopic에 쇼츠 프롬프트 반영, targetCharCount 자동 조정 (ScriptWriterTab.tsx, 2026-03-10)
- [x] #34 채널 분석 주제 추천 결과 탭 전환 시 소실 수정 — topicInput, topicRecommendations를 useState에서 channelAnalysisStore(Zustand)로 이동, 탭 전환해도 추천 결과 유지 (channelAnalysisStore.ts, ChannelAnalysisRoom.tsx, 2026-03-10)
- [x] #31 대본 작성 새 파일 업로드 시 이전 대본 미초기화 버그 수정 — clearPreviousContent 액션 추가, handleFileUpload/handleSelectTopic/selectedTopic useEffect에서 이전 콘텐츠 초기화, instinctStore 소재 선택도 초기화 (scriptWriterStore.ts, ScriptWriterTab.tsx, 2026-03-10)
- [x] #32 긴 대본 스토리보드 네트워크 타임아웃 수정 — monitoredFetch에 AbortController 타임아웃 추가, 청크 크기 5000→3000자 축소, evolinkChat/requestEvolinkNative/requestGeminiProxy에 timeoutMs 전파, 재시도 조건에 Failed to fetch 추가 (apiService.ts, evolinkService.ts, geminiProxy.ts, scriptAnalysis.ts, 2026-03-10)
- [x] logger.trackRetry() 호출 추가 — src/services/ 내 17개 재시도/폴링 루프에 재시도 추적 로깅 삽입 (14개 파일, 2026-03-10)
- [x] StoryboardPanel 이미지/영상 직접 업로드 기능 추가 — SceneCard, GridSceneCard, SceneDetailModal에 업로드 버튼 + 삭제 기능, Cloudinary 호스팅 연동 (#20, 2026-03-10)
- [x] musicService.ts pollMusicStatus FIRST_SUCCESS 버그 수정 — 중간 상태를 SUCCESS와 분리하여 계속 폴링, snake_case 필드 폴백 추가, 에러 메시지 개선 (#21/#22, 2026-03-10)
- [x] UploadTab UI 리디자인 — 원페이지 스크롤 + 플랫폼별 accent 색상 (2026-03-06)
- [x] 프로젝트 코드베이스 분석 완료 (11,123줄)
- [x] CLAUDE.md 작성 (프로젝트 루트 매뉴얼)
- [x] 스킬 파일 5개 작성 (ai-service, media-gen, ui-component, data-storage, export-system)
- [x] 작업 기억 시스템 3대 문서 (PLAN, CONTEXT, CHECKLIST)
- [x] 기능 보존 체크리스트 작성 (20개 핵심 기능)
- [x] BUG_REPORT.md 템플릿 작성
- [x] FEATURE_REQUEST.md 템플릿 작성
- [x] ACCEPTANCE_CRITERIA.md 작성 (검증 시나리오)
- [x] Smart Motion Matcher 구현 (smartMotionMatcher.ts + editRoomStore.ts 연동, 2026-03-02)
- [x] ThumbnailStudioTab 대본 자동 채우기 구현 (scriptWriterStore/projectStore 연동, 2026-03-02)
- [x] UploadTab StepMetadata: AI 메타데이터 생성 연동 (generateUploadMetadata), 쇼핑 태그 UI (extractShoppingTags), 대본 연동 상태 표시 (2026-03-02)
- [x] UploadTab StepThumbnail: 썸네일 스튜디오 인라인 통합, 대본 자동 연동 (2026-03-02)
- [x] Edit Room 버그 3건 수정: initFromProject sceneOrder 보존(BUG#2), 재초기화 가드(BUG#3), 새 프로젝트 시 reset 자동 호출(BUG#4) (2026-03-03)
- [x] M10: Evolink Veo cancel — AbortController로 로컬 폴링 중단 구현 (VideoGenService.ts, 2026-03-03)
- [x] M16: formatSrtTime 밀리초 1000 오버플로우 carry-over 처리 (srtService.ts, 2026-03-03)
- [x] M21: ZIP export fetchAsBlob 실패 시 console.warn 로깅 + 실패 에셋 요약 경고 (srtService.ts, 2026-03-03)
- [x] ElevenLabs 비활성화: TTSEngine 타입에서 제외, 기본 엔진 typecast로 변경, UI 라벨/패널 주석 처리, ttsService switch/filter 정리 (types.ts, soundStudioStore.ts, SoundStudioTab.tsx, VoiceStudio.tsx, ttsService.ts, 2026-03-03)
- [x] topicRecommendService.ts 신규 생성: 본능 기제 + YouTube 바이럴 영상 분석 → Gemini AI 소재 5개 추천 서비스 (getTopVideos + evolinkChat + instinct hooks 결합, tsc 0 errors, 2026-03-03)
- [x] TopicRecommendCards.tsx 신규 생성: AI 추천 소재 5개 카드 UI (바이럴 점수 배지, 훅/줄거리/참고영상/본능매칭 표시, 프로그레스 바, 대본 생성 CTA), 168줄, tsc 0 errors (2026-03-03)
- [x] ScriptWriterTab.tsx 본능→소재추천→대본생성 플로우 구현: handleGenerateFromInstincts → handleRecommendTopics + handleGenerateFromTopic(스트리밍) 교체, TopicRecommendCards 연동, streamingText 실시간 표시, tsc 0 errors (2026-03-03)
- [x] ImageVideoTab 2-서브탭 분리 (SoundStudioTab 패턴): imageVideoStore.ts 신규, ImageVideoTab.tsx → shell(96줄), SetupPanel.tsx(530줄), StoryboardPanel.tsx(535줄), BUG#17 스토어 getState()로 개선, tsc 0 errors (기존 제외), 빌드 통과 (2026-03-04)
- [x] Suno API 폴링 엔드포인트 3건 전면 수정 (musicService.ts, 2026-03-04):
  - pollMusicStatus: `/jobs/recordInfo` → `/generate/record-info`, status/결과파싱/필드케이싱 수정
  - pollLyricsResult: `/jobs/recordInfo` → `/lyrics/record-info`, status/결과구조 수정
  - pollVocalSeparation: `/jobs/recordInfo` → `/vocal-removal/record-info`, successFlag/필드케이싱 수정
  - Kie Suno API 기술문서 `.claude/skills/kie-suno-api.md` 신규 작성, tsc 0 errors, 빌드 통과
- [x] navigationStore.ts localStorage 영속성 추가: activeTab/showProjectDashboard 새로고침 시 복원, loadSavedState/saveState 헬퍼, tsc 0 new errors (2026-03-04)
- [x] musicService.ts analyzeMusicForScript 긴 대본(8000+자) 분석 실패 수정: prepareScriptForAnalysis 도입(head+middle sampling+tail), maxTokens 1500→2500, showToast 에러 알림 추가, tsc 0 errors (2026-03-05)
- [x] topicRecommendService.ts Google Search grounding 폴백 무음 실패 수정: Evolink Native 직접 시도 → 실패 시 grounding 도구 제거 후 Laozhang/Kie 폴백, grounding 사용 여부 로깅, 시스템 프롬프트에 자체 지식 활용 안내 추가, tsc 0 errors (2026-03-05)
- [x] youtubeAnalysisService.ts 3건 수정 (2026-03-05):
  - HIGH: YouTube API v3 쿼터 추적 시스템 추가 — localStorage 기반 일별 리셋, trackQuota() + getQuotaUsage(), 모든 API 호출에 쿼터 체크/기록 삽입, 9000 units 경고/10000 초과 차단
  - MEDIUM: validateYoutubeConnection에 quotaExceeded/dailyLimitExceeded 에러 처리 추가
  - MEDIUM: captions.list 403 에러 비치명적 처리 — 타인 영상 자막 접근 권한 없음 문서화, 쿼터 부족 시 건너뜀, logger.error→logger.warn 전환
  - tsc 0 errors
- [x] Issue #7: Portrait (9:16) aspect ratio composition guidance 추가 (imageGeneration.ts, 2026-03-05):
  - Portrait 선택 시 vertical framing 프롬프트 가이던스 + 반-수평 네거티브 프롬프트 추가
  - Square (1:1) 선택 시 centered square frame 가이던스 추가
  - 16:9/4:3은 기본 동작 유지 (변경 없음)
  - infographic/normal 양쪽 프롬프트에 aspectComposition 삽입
  - geminiService.ts 미수정 (CLAUDE.md 규칙 준수)
  - tsc 0 new errors
- [x] Issue #1: keyEntities 필드를 globalContextObj에 연결 (App.tsx, 2026-03-05):
  - analyzeScriptContext()가 반환하는 keyEntities(인물명, 장소명, 브랜드 등)가 globalContextObj 구성 시 누락되어 이미지 생성에 전달되지 않던 버그 수정
  - App.tsx globalContextObj에 `keyEntities: contextData.keyEntities || ""` 추가 (1줄 변경)
  - imageGeneration.ts와 thumbnailService.ts는 이미 ctx.keyEntities를 읽고 있었으므로 수정 불필요
  - geminiService.ts 프롬프트 미수정 (CLAUDE.md 규칙 준수)
  - tsc 0 errors
- [x] Issue #3: 사용자 프롬프트 편집이 이미지 생성에 반영되지 않는 디바운스 레이스 컨디션 + 프롬프트 희석 문제 수정 (2026-03-05):
  - StoryboardScene.tsx: flushAndGenerate() 헬퍼 추가 — 생성/재생성 클릭 시 300ms 디바운스 우회하여 현재 입력값 즉시 store 반영 및 feedback 파라미터로 전달
  - types.ts: Scene 인터페이스에 `isUserEditedPrompt?: boolean` 필드 추가
  - StoryboardScene.tsx: 인라인 프롬프트 편집, 수정 모달 제출 시 `isUserEditedPrompt: true` 플래그 설정
  - imageGeneration.ts: `isUserEdited` 감지 로직 추가 (scene.isUserEditedPrompt 또는 feedback 존재 시)
  - imageGeneration.ts: 사용자 편집 프롬프트에 `[USER PRIORITY DIRECTIVE]` + `(PRIMARY VISUAL: ...: 2.5)` 가중치 부스트 적용 (일반 모드 + 인포그래픽 모드 모두)
  - geminiService.ts 프롬프트 미수정 (CLAUDE.md 규칙 준수)
  - tsc 0 errors
- [x] Issue #5: 장면 분할 의미 인식 개선 — countScenesLocally/splitScenesLocally 의미 단위(semantic segment) 기반으로 전면 리팩토링 (scriptAnalysis.ts, 2026-03-05):
  - splitIntoSemanticSegments() 신규 헬퍼: 장면 마커(INT./EXT./장면/Scene/CUT TO/FADE), 구분선(---/***), 화자 변화(이름: 패턴), 괄호형 마커([시간]/(장소)), 단락 경계(빈 줄) 감지
  - flattenSegmentsToSentences() 신규 헬퍼: 세그먼트별 문장 분할 + segIdx 추적으로 세그먼트 경계 절대 침범 방지
  - countScenesLocally: LONG DEFAULT 모드에서 2문장 병합 시 같은 세그먼트 내에서만 병합 (화자/장면 전환 시 별도 장면)
  - splitScenesLocally: 동일한 세그먼트 경계 존중 로직 적용
  - 기존 포맷별 분할 로직(SHORT 45자/NANO 16자/LONG DETAILED 100자) 내부 동작은 보존
  - geminiService.ts 프롬프트 미수정 (CLAUDE.md 규칙 준수)
  - tsc 0 errors
- [x] 편집실 오디오 이펙트/플러그인 UI + SFX 트랙 구현 (2026-03-06)
  - types.ts: TrackAudioEffect, TrackEffectConfig, AudioTrackId, AudioEffectType 타입 추가 + Scene에 generatedSfx/generatedDialogue 필드 추가
  - editRoomStore.ts: trackEffects 상태 + setTrackEffect/addTrackEffect/removeTrackEffect/updateTrackEffect 액션 추가
  - AudioEffectModal.tsx 신규: 트랙별 이펙트 모달 (나레이션/BGM/SFX 탭, EQ/컴프레서/리버브/딜레이/디에서/노이즈게이트, 파라미터 슬라이더, 바이패스)
  - VisualTimeline.tsx: FX 버튼 (amber, dot indicator) + SFX 트랙 (fuchsia, generatedSfx 블록 표시)
  - useVideoBatch.ts: 영상 생성 완료 시 generatedSfx/generatedDialogue Scene에 저장
  - tsc 0 errors, vite build 성공
- [x] 편집실 오디오 트랙 믹서 UI + FX→오디오 효과 리네이밍 (2026-03-06)
  - "FX" → "오디오 효과"로 버튼/모달 라벨 변경
  - types.ts: TrackMixerConfig (mute/solo) 타입 추가
  - editRoomStore.ts: trackMixer 상태 + sfxVolume + setTrackMixer/setSfxVolume 액션
  - VisualTimeline.tsx: 프리미어 프로 스타일 믹서 패널 (타임라인 우측)
    - MixerStrip 컴포넌트: M(뮤트)/S(솔로) 버튼, dB 미터 바 (green→yellow→red), dB 값 표시
    - 나레이션/BGM/SFX 3개 트랙 믹서, 클릭으로 볼륨 조절
    - 0dB 마크, 볼륨 인디케이터 hover 표시
  - tsc 0 errors, vite build 성공
  - [x] M/S 버튼 트랙 라벨 좌측 이동 (나레이션/BGM/SFX)
  - [x] AudioMixerModal.tsx — Premiere Pro 스타일 수직 오디오 트랙 믹서 모달
  - [x] MIXER 헤더 클릭 → 믹서 모달 오픈
  - [x] MixerStrip에서 M/S 제거 (dB 미터만 유지)
- [x] 믹서 모달 PAN UI 넘침 수정 (overflow-hidden + 고정폭)
- [x] 믹서 모달에 오디오 효과 탭 통합 (AudioEffectModal 기능 흡수)
- [x] M/S 버튼 텍스트 오른쪽으로 이동
- [x] 툴바 '오디오 효과' → '믹서' 아이콘 교체
- [x] 우측 dB 미터 패널 완전 제거
- [x] 하단 여백 문제 해결 (불필요한 flex 래퍼 제거)
- [x] 실시간 VU 미터 (Web Audio API) 구현 (2026-03-06)
  - audioAnalyserService.ts 신규: AudioContext + AnalyserNode 싱글톤, connectAudioToAnalyser/getAudioLevels
  - VisualTimeline.tsx: startPlayback에 connectAudioToAnalyser 호출 추가
  - AudioMixerModal.tsx: rAF 루프 DOM 직접 조작 VU 미터 (나레이션=라이브, BGM/SFX=정적), 피크홀드 마커, 감쇠 동작, 마스터 L/R 스테레오
  - tsc 0 errors, vite build 성공
- [x] 오디오 이펙트 실제 Web Audio API 처리 체인 구현 (2026-03-06)
  - audioAnalyserService.ts 전면 재작성: 6종 이펙트 실시간 처리
  - EQ(3-band BiquadFilter), Compressor(DynamicsCompressor+makeup), De-esser(peaking cut), Noise Gate(inputAnalyser+10ms 폴링), Delay(wet/dry parallel+feedback), Reverb(ConvolverNode+generated IR)
  - Volume/Mute(GainNode), Pan(StereoPannerNode), store subscribe로 실시간 반영
  - types.ts TrackMixerConfig에 pan 필드 추가
  - tsc 0 errors, vite build 성공
- [x] 마스터 스트립 FX 지원 추가 (2026-03-06)
  - types.ts AudioTrackId에 'master' 추가
  - editRoomStore: master trackEffects/trackMixer 초기값 추가
  - audioAnalyserService.ts: 마스터 이펙트 체인 (panner → master FX → masterGain → analyser), createEffectNodes/applyEffectsToNodes 공용 함수로 리팩토링
  - AudioMixerModal.tsx: 마스터 스트립에 FX 버튼 + M(뮤트) 버튼 추가, FxSubModal 마스터 분기
  - tsc 0 errors, vite build 성공
- [x] 썸네일 툴바 모달화 + 아이콘 크기 조정 (2026-03-06)
  - ThumbnailGenerator.tsx: 호버 오버레이 → 클릭 시 fixed 모달로 변경
  - 3x2 → 3x3 그리드 (확대 버튼 추가), 아이콘 text-lg → text-2xl, 라벨 text-[10px] → text-xs
  - 9:16/16:9 모두 동일한 모달 UX, 카드 크기에 영향 받지 않음
  - tsc 0 errors, vite build 성공
- [x] 썸네일 스튜디오 저장하기 버튼 추가 (2026-03-06)
  - fileHelpers.ts: compressImageUnderSize() — Canvas JPEG quality 단계적 축소 + 해상도 스케일링으로 2MB 미만 달성
  - ThumbnailStudioTab.tsx: 헤더에 핑크 액센트 저장하기 드롭다운 (원본 저장 / 업로드용 저장 2MB 이하)
  - 생성된 썸네일 없으면 버튼 비활성화, 저장 중 스피너 표시
  - tsc 0 errors, vite build 성공
- [x] 자막 퀵패널 개선: 글꼴 굵기 선택 + 자막 배경 토글 (2026-03-06)
  - EditRoomGlobalPanel.tsx SubtitleQuickPanel: WEIGHT_LABELS 맵 + expandedFontId state, 다중 weight 폰트 클릭 시 weight 버튼 행 확장, 현재 선택 amber 하이라이트
  - 자막 배경 ON/OFF 토글 (amber 스위치, ON=#000000, OFF=undefined)
  - EditRoomTab.tsx ScenePreviewPanel: 명시적 backgroundColor 시 borderRadius 0px, fallback 시 4px
  - tsc 0 errors, vite build 성공

---

## 🟡 Phase 0: 환경 구축 (완료)

- [x] npm install 실행 (2026-02-23, 106 packages)
- [x] npm run dev 빌드 확인 (Vite v5.4.21, localhost:3000)
- [x] TypeScript 컴파일 에러 확인 (에러 없음)
- [x] API 키 설정 완료 (apiService.ts DEFAULT 값으로 설정, 2026-02-23)

---

## 🟢 Phase 1: 버그 수정 (12/12 완료)

### BUG-1: 인포그래픽 자동 활성화 ✅
- geminiService.ts: `allowInfo === true && item.isInfographic === true` strict boolean check
- App.tsx: 프로젝트 로드 시 `allowInfographics` 기반 강제 sanitize

### BUG-2: 대본 맥락 이해도 (배경/문화 오류) ✅
- geminiService.ts: MANDATORY 가중치 Location(2.5), Era(2.0), Culture(2.0)
- Cross-culture negative prompt 추가 (한/중/일/서양/아랍)

### BUG-3: 캐릭터 모드 Laozhang→Kie 폴백 ✅
- CharacterGenCard.tsx: 503/500 제한 → catch-all 폴백 전환

### BUG-4: 2K 이미지 + Cloudinary 호환성 ✅
- Kie resolution: 1K → 2K
- uploadService.ts: 10MB+ 이미지 자동 압축 (JPEG 0.85)

### BUG-5: 유명인/로고 맥락 이해도 ✅
- BUG-2 개선에 포함 (context 기반 key entities 주입)

### BUG-6: 나노 단락 분리 오작동 ✅
- geminiService.ts: NANO/DETAILED 모드 force-split 후처리 추가
- ? 예외 처리 (질문+답변 2문장 병합)

### BUG-7: 비한국어 대본에 한글 삽입 ✅
- geminiService.ts: 기본값 "Korean" → "" 변경
- Language firewall: Korean text -2.5 네거티브 + CRITICAL OVERRIDE

### BUG-8: Gemini 프록시 폴백 안정성 ✅
- requestGeminiProxy: 1-retry 메커니즘 (2초 대기 후 전체 체인 재시도)

### BUG-9: 비주얼 스타일 미적용 ✅
- `(MANDATORY Art Style: ${effectiveStyle}: 2.5)` + Style Override 강화

### BUG-10: 나레이션 자동 활성화 (Grok) ✅
- AUDIO_SAFETY_TAGS 강화: ABSOLUTELY No Speech/Narration/Voice/Dialogue

### BUG-11: 9:16 이미지 누워보이는 문제 ✅
- StoryboardScene, CharacterGenCard, ThumbnailGenerator, ScriptMode: inline style fallback 추가
- Portrait 모드 `object-contain` 적용 (cropping 방지)
- App.tsx: Portrait 모드 그리드 columns 축소 (1/2/3)

### BUG-12: 영상 그림체 변경 방지 ✅
- STYLE_LOCK_TAGS 상수 추가: 입력 이미지 스타일 보존 강제
- Grok, Veo (Apimart/Laozhang/Kie) 모든 영상 프롬프트에 주입

---

## 🟢 Phase 2-A: Zustand 상태 관리 도입 (완료)

### Zustand Store Migration
- [x] Zustand 설치 및 `src/stores/` 디렉토리 생성
- [x] `uiStore.ts` 생성 (8개 UI 상태: sidebar, lightbox, modal, toast, processing, refreshTrigger)
- [x] `costStore.ts` 생성 (3개 비용 상태: costStats, exchangeRate, exchangeDate + addCost 액션)
- [x] `projectStore.ts` 생성 (7개 프로젝트 상태: config, scenes, thumbnails, projectTitle, currentProjectId, batchGrokDuration, batchGrokSpeech + updateScene, splitScene, addSceneAfter, removeScene, loadProject, newProject 액션)
- [x] `useAutoSave.ts` 훅 생성 (zustand subscribe 기반 2초 디바운스 자동 저장)
- [x] App.tsx: 18개 useState 제거 → store selector로 교체
- [x] App.tsx: handleCostAdd useCallback 제거 → addCost 액션으로 교체
- [x] App.tsx: auto-save useEffect 제거 → useAutoSave() 훅으로 교체
- [x] App.tsx: handleSetProcessing 제거 → setProcessing 액션으로 교체
- [x] App.tsx: handleNewProject/handleLoadProject → store 메서드 위임
- [x] App.tsx: handleToggle* 4개 제거 (StoryboardScene에서 store 직접 접근)
- [x] App.tsx: useVideoBatch 브릿지 패턴 적용 (기존 시그니처 유지)
- [x] StoryboardScene.tsx: 30개 props → 13개로 축소 (17개 제거)
- [x] StoryboardScene.tsx: 씬 mutation은 useProjectStore.updateScene() 직접 호출
- [x] StoryboardScene.tsx: UI 액션은 useUIStore.openLightbox() 직접 호출
- [x] TypeScript 컴파일 에러 0개 확인
- [x] Vite 빌드 성공 확인

---

## 🟢 Phase 2-B: App.tsx 분해 (완료)

### Step 1: 유틸리티 함수 추출
- [x] `src/utils/fileHelpers.ts` 신규 생성 (~95줄)
- [x] `dataURLtoFile`, `getSafeFilename`, `downloadHtmlFile`, `optimizeForExport`, `processSequentially` 이동
- [x] `processSequentially`에 제네릭 타입 적용 (`any` → `<T>`)

### Step 2: CostDashboard 컴포넌트 추출
- [x] `src/components/CostDashboard.tsx` 신규 생성 (~100줄)
- [x] props (`stats`, `exchangeRate`, `exchangeDate`) 제거 → `useCostStore` 직접 접근
- [x] App.tsx에서 CostDashboard 정의 삭제, `<CostDashboard />` (no props)로 교체

### Step 3: HTML 템플릿 추출
- [x] `src/templates/promptGuide.ts` 신규 생성 (~120줄) — `buildPromptGuideHtml()`
- [x] `src/templates/exportHtml.ts` 신규 생성 (~280줄) — `buildExportHtml()`
- [x] App.tsx에서 `downloadPromptGuideHtml` 정의 삭제 (~115줄)
- [x] App.tsx에서 `handleExportHtml` 내부 HTML 템플릿 삭제 (~300줄)

### Step 4: 내보내기/다운로드 핸들러 추출
- [x] `src/services/exportService.ts` 신규 생성 (~230줄)
- [x] 6개 핸들러 이동: `downloadImages`, `downloadVideos`, `downloadThumbnails`, `exportProjectHtml`, `exportVisualPromptsHtml`, `exportVideoPromptsHtml`
- [x] Zustand `getState()` 패턴으로 store 데이터 접근

### Step 5: App.tsx 정리 및 검증
- [x] 미사용 import 제거 (`JSZip`, `logger`, `uploadRemoteUrlToCloudinary`, `useState`, `useRef`, `SceneType`)
- [x] CostDashboard 전용 selector 제거 (`costStats`, `exchangeRate`, `exchangeDate`)
- [x] `setToast` selector 제거 (export 핸들러 전용이었음)
- [x] App.tsx: ~1,575줄 → ~746줄 (약 830줄 감소)
- [x] TypeScript 컴파일 에러 0개 확인
- [x] Vite 빌드 성공 확인

---

## 🟢 Phase 2-C: 서비스 리팩토링 (완료)

### Part 1: geminiService.ts 모듈 분리 (1,695줄 → 6 모듈 + 배럴 파일)
- [x] `src/services/gemini/` 디렉토리 생성
- [x] `gemini/promptHelpers.ts` 생성 (~85줄) — 순수 함수 5개 (getMicroTexture, isBlackAndWhiteStyle, getStyleNegativePrompt, getAdaptiveFont, getIntegrativeInfographicInstruction)
- [x] `gemini/geminiProxy.ts` 생성 (~290줄) — 핵심 AI 통신 (requestGeminiProxy, convertGoogleToOpenAI, extractTextFromResponse, extractFunctionCall, performMockSearch, urlToBase64, fetchCurrentExchangeRate, validateGeminiConnection)
- [x] `gemini/scriptAnalysis.ts` 생성 (~310줄) — 대본 분석 (analyzeScriptContext, estimateSceneCount, parseScriptToScenes, sanitizeScript, enrichEntityDetail)
- [x] `gemini/imageGeneration.ts` 생성 (~290줄) — 이미지 생성 (generateSceneImage)
- [x] `gemini/imageAnalysis.ts` 생성 (~100줄) — 이미지 분석 (analyzeImageUnified, generatePromptFromScript, analyzeVideoContent, analyzeVideoHybrid, analyzeStyleReference)
- [x] `gemini/thumbnailService.ts` 생성 (~340줄) — 썸네일/캐릭터 (generateCharacterDialogue, sanitizePromptWithGemini, editThumbnailText, generateCharacterVariations, generateStylePreviewPrompts, generateThumbnailConcepts, generateHighQualityThumbnail)
- [x] `geminiService.ts` → 배럴 파일로 교체 (~10줄, 21개 함수 re-export)
- [x] 소비자 파일 import 경로 변경 없음 확인 (App.tsx, ScriptMode, CharacterMode, ThumbnailGenerator, useVideoBatch, ApiKeySettings)

### Part 2: VideoGenService.ts 어댑터 패턴 적용
- [x] `types.ts`에 `VideoTaskParams`, `VideoProvider` 인터페이스 추가 (+30줄)
- [x] `VideoGenService.ts`에 grokProvider, veoFastProvider, veoQualityProvider + `getVideoProvider()` 추가 (+50줄)
- [x] `useVideoBatch.ts` 생성/폴링/취소 분기 로직 → adapter 호출로 교체

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (`vite build` — 75 modules, 559KB)
- [x] 프롬프트 텍스트 내용 수정 없음 (CLAUDE.md 준수)
- [x] 기존 개별 함수 export 보존 (QuickLab, ApiKeySettings 등)

---

## 🟢 Phase 4: 최적화 (완료)

### Step 1: 번들 정리 및 빌드 최적화
- [x] `@imgly/background-removal` 패키지 제거 (미사용, 1.2MB 절감)
- [x] `src/package.json`: dependencies에서 제거
- [x] `src/index.html`: importmap에서 제거
- [x] `src/vite.config.ts`: build 옵션 추가 (manualChunks: vendor-react, vendor-zustand / target: es2020 / chunkSizeWarningLimit: 400)

### Step 2: 코드 스플리팅 (React.lazy)
- [x] `ConfigForm.tsx`: CharacterMode, ScriptMode, RemakeMode → `React.lazy()` + `Suspense`
- [x] `App.tsx`: ThumbnailGenerator → `React.lazy()` + `Suspense`
- [x] `exportService.ts`: JSZip → 동적 import (`await import('jszip')`) — downloadImages, downloadVideos, downloadThumbnails
- [x] `CharacterMode.tsx`: JSZip → 동적 import

### Step 3: Cloudinary 즉시 업로드 (Base64 → URL 전환)
- [x] `src/services/imageStorageService.ts` 신규 생성 — `persistImage()`, `isBase64Image()` 유틸리티
- [x] `App.tsx` handleGenerateImage: Base64 즉시 표시 → 백그라운드 Cloudinary 업로드 → URL 교체
- [x] `App.tsx` handleManualImageUpload: ObjectURL 즉시 표시 → Cloudinary 업로드 → URL 교체
- [x] `ThumbnailGenerator.tsx`: 썸네일 생성 후 `persistImage` 적용
- [x] `projectStore.ts` loadProject: Base64 imageUrl 감지 → 백그라운드 Cloudinary 마이그레이션
- [x] `StoryboardScene.tsx` handleDownloadImage: `fetch → blob → download` 패턴 (URL 호환)
- [x] `exportService.ts` downloadImages: URL 기반 이미지도 `fetch → blob → zip` 지원
- [x] `fileHelpers.ts` optimizeForExport: URL도 `crossOrigin="anonymous"` → canvas 변환 지원

### 빌드 결과
- 메인 청크: 223KB (gzip 83KB) — 기존 559KB 단일에서 분리
- vendor-react: 134KB (gzip 43KB)
- CharacterMode: 43KB, ScriptMode: 38KB, ThumbnailGenerator: 18KB
- jszip: 97KB (별도 청크, 필요 시에만 로드)
- vendor-zustand: 8KB
- RemakeMode: 7KB

---

## 🟢 Phase 5: 성능/UX 최적화 (완료)

### Group A: 렌더링 성능 (5개)
- [x] A-1: StoryboardScene React.memo 래핑 — 불필요한 리렌더 방지
- [x] A-2: App.tsx 콜백 useCallback — handleGenerateImage, handleManualImageUpload, handleAutoPromptGen, handleInjectCharacter (getState() 패턴으로 deps 최소화)
- [x] A-3: textarea onChange 디바운스 — scriptText, visualPrompt에 300ms 로컬 state + 디바운스 적용
- [x] A-4: ProcessingOverlay tips useMemo — currentTips 메모이제이션으로 interval 재생성 방지
- [x] A-5: aspect ratio 스타일 상수화 — ASPECT_STYLES Record 컴포넌트 외부 선언

### Group B: 이미지/미디어 (2개)
- [x] B-1: loading="lazy" + decoding="async" — StoryboardScene, ThumbnailGenerator img 태그
- [x] B-2: 이미지 fade-in 트랜지션 — opacity-0 초기 + onLoad opacity 1 전환

### Group C: 네트워크/로딩 (3개)
- [x] C-1: API DNS preconnect — Cloudinary, Kie, Laozhang 4개 도메인
- [x] C-2: Google GSI 스크립트 제거 — 미사용 외부 스크립트 삭제
- [x] C-3: font-display: swap — Pretendard 폰트 FOIT 방지

### Group D: 불필요한 작업 제거 (4개)
- [x] D-1: DebugConsole 조건부 구독 — isOpen false일 때 logger 구독 안 함
- [x] D-2: ProjectSidebar 닫기 시 DB 재로딩 방지 — isOpen 가드 추가
- [x] D-3: CostDashboard 숫자 포맷 메모이제이션 — totalKRW, exchangeRate, USD 포맷 useMemo
- [x] D-4: useAutoSave fullNarrationText 최적화 — .substring(0, 500) 제한

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (78 modules, 1.24s)
- [x] 기능 변경 없음 (성능/UX 개선만)

---

## 🟢 UX 개선: 자동 단락 나누기 UI 통합 + 예상 컷 수 정확도 (완료)

- [x] `scriptAnalysis.ts`: `estimateSceneCount`에 `longFormSplitType` 파라미터 추가
- [x] `scriptAnalysis.ts`: LONG+DETAILED 분기 추가 (1문장=1장면 규칙으로 추정)
- [x] `ScriptMode.tsx`: 라벨 `영상 포맷` → `자동 단락 나누기` 변경
- [x] `ScriptMode.tsx`: 롱폼 서브 셀렉터(호흡/디테일)를 포맷 버튼 바로 아래 통합 배치
- [x] `ScriptMode.tsx`: `getSplitGuideContent()` 내 중복 서브 셀렉터 삭제 (설명 텍스트는 유지)
- [x] `ScriptMode.tsx`: `estimateSceneCount` 호출에 `longFormSplitType` 전달
- [x] `ScriptMode.tsx`: useEffect deps에 `longFormSplitType` 추가 (전환 시 즉시 재계산)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (78 modules, 1.23s)

---

## 🟢 UX 개선: 자동 단락 나누기 예시 차별화 + 한눈에 보이는 설명 (완료)

- [x] `ScriptMode.tsx`: 포맷 버튼 아래에 모드별 한줄 설명(📎) 추가 (LONG/SHORT/NANO)
- [x] `ScriptMode.tsx`: 호흡/디테일 서브 셀렉터 버튼 텍스트에 규칙 표시 (`2문장=1장면` / `1문장=1장면`)
- [x] `ScriptMode.tsx`: DEFAULT/DETAILED 예시를 동일 5문장 입력 → 3장면 vs 5장면으로 교체 (차이 즉시 확인 가능)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (78 modules, 1.25s)

---

## 🟢 대본 맥락 이해도 고도화: 전체 + 장면별 2단계 컨텍스트 (완료)

- [x] `types.ts`: Scene 인터페이스에 `sceneLocation`, `sceneEra`, `sceneCulture` 필드 추가
- [x] `scriptAnalysis.ts`: `analyzeScriptContext` 프롬프트에 "언어 ≠ 문화" 분리 지시 추가
- [x] `scriptAnalysis.ts`: `parseScriptToScenes` 시스템 프롬프트에 `[PHASE: CONTEXTUAL GROUNDING]` 섹션 추가
- [x] `scriptAnalysis.ts`: 출력 JSON 스키마에 `sceneLocation`, `sceneEra`, `sceneCulture` 3개 필드 추가
- [x] `imageGeneration.ts`: 맥락 파싱을 "장면별 우선, 전역 폴백"으로 변경
- [x] `imageGeneration.ts`: Cross-culture 감지에서 `langName` 제거 (언어 ≠ 문화 분리)
- [x] `imageGeneration.ts`: 문화별 키워드 보강 (gyeongbok, forbidden city, qing, ming, kyoto, edo, paris, rome, berlin, ottoman 등)
- [x] `imageGeneration.ts`: 문화 차단 로직 대칭화 (다른 특정 문화 감지 시에만 차단)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (78 modules, 1.26s)

---

## 🟢 전체 언어 유니버설 지원 — 모든 스크립트/언어 변형 정상 작동 (완료)

### Phase 1: 주요 언어 지원
- [x] `scriptAnalysis.ts`: `sanitizeScript` 정규식을 `\p{L}\p{N}` 유니코드 프로퍼티 기반으로 변경
- [x] `fileHelpers.ts`, `exportService.ts`, `ThumbnailGenerator.tsx`: 파일명 화이트리스트 → 블랙리스트 전환
- [x] `VideoGenService.ts`, `exportService.ts`: "Native Korean Dialogue" → "Native Dialogue" 언어 중립화

### Phase 2: 소수 언어 전체 커버 확장
- [x] `scriptAnalysis.ts`: `sanitizeScript`을 `\p{P}` (유니코드 전체 구두점) 기반으로 재변경 — 모든 문자 체계의 구두점 자동 보존
- [x] `scriptAnalysis.ts`: 문장 분할에 Myanmar(`။`), Khmer(`។`), Ethiopic(`።`), Armenian(`՞՜`), Tibetan(`།`), Devanagari double danda(`॥`) 추가
- [x] `scriptAnalysis.ts`: Q&A 병합에 Armenian question(`՞`), Greek question(`;`), double question(`⁇`), interrobang(`⁈‽`) 추가
- [x] `scriptAnalysis.ts`: `analyzeScriptContext` BCP-47 코드 전체 확장 — Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Sinhala, Burmese, Khmer, Lao, Georgian, Armenian, Hebrew, Persian, Urdu, Greek, Turkish, Ukrainian, Bulgarian, Amharic, Swahili, Tibetan + 13개 유럽/동남아 언어
- [x] `imageGeneration.ts`: `SCRIPT_SYSTEM_NEGATIVES` 10개 → 27개 스크립트 시스템 확장 (Indic 8개, Southeast Asian 5개, Caucasian 2개, Hebrew, Turkic, Greek, Ethiopic, Tibetan 추가)
- [x] `imageGeneration.ts`: 문화 감지 10개 → 15개 권역 확장 (Turkey/Ottoman, Nordic/Scandinavian, Central Asia/Steppe, Oceania/Polynesian, Caribbean 추가)
- [x] `imageGeneration.ts`: 신규 5개 권역 네거티브 프롬프트 추가
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (78 modules, 1.27s)

### Phase 3: 파이프라인 감사 — 누락 블로커/마이너 수정
- [x] `imageGeneration.ts`: **[BLOCKER]** `textForceLock` 네거티브 프롬프트가 감지 언어를 억제하는 버그 수정 → 동적 제외 방식으로 변경
- [x] `imageGeneration.ts`: `isChinaMentioned` 문화 감지에 `taiwan`, `taipei`, `cantonese`, `macau` 추가
- [x] 전체 파이프라인 감사 완료: scriptAnalysis → imageGeneration → thumbnailService → ThumbnailGenerator → VideoGenService → exportService → App.tsx (모두 langName 동적 처리 확인)
- [x] TypeScript 컴파일 에러 0개, Vite 빌드 성공 (78 modules, 1.30s)

---

## 🟢 피드백 수집 시스템 — Google Apps Script + 인앱 모달 (완료)

- [x] `types.ts`: `FeedbackType` enum + `FeedbackData` interface 추가
- [x] `apiService.ts`: `getFeedbackUrl()` getter + `saveApiKeys`/`getStoredKeys`에 `feedbackUrl` 추가
- [x] `uiStore.ts`: `showFeedbackModal` 상태 + `setShowFeedbackModal` 액션 추가
- [x] `feedbackService.ts`: 신규 생성 (~20줄) — `submitFeedback()` (no-cors POST)
- [x] `FeedbackModal.tsx`: 신규 생성 (~175줄) — 유형 선택 + 내용/이메일 입력 + 자동 수집 정보 표시
- [x] `ApiKeySettings.tsx`: Google Apps Script URL 입력란 추가 + `saveApiKeys` 호출에 `feedbackUrl` 전달
- [x] `App.tsx`: 플로팅 피드백 버튼(💬) + `<FeedbackModal />` 렌더링 (useState 추가 없음, uiStore 사용)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (80 modules, 1.23s)

---

## 🟢 레퍼런스 이미지 기반 비주얼 스타일 추출 기능 (완료)

- [x] `types.ts`: `ScriptModeState`에 `styleRefBase64?: string` 필드 추가
- [x] `ScriptMode.tsx`: 스타일 레퍼런스 state 4개 추가 (`styleRefBase64`, `isAnalyzingStyleRef`, `isDragOverStyleRef`, `styleRefInputRef`)
- [x] `ScriptMode.tsx`: `onSaveState` persist 객체 및 deps에 `styleRefBase64` 추가
- [x] `ScriptMode.tsx`: `processStyleRefFile` 핸들러 추가 (resizeImage → analyzeImageUnified → setAtmosphere)
- [x] `ScriptMode.tsx`: Section 4에 드래그앤드롭 + 클릭 업로드 UI 추가 (aspect-[3/1])
- [x] `ScriptMode.tsx`: 이미지 미리보기 + 분석 중 스피너 오버레이 + 삭제(X) 버튼
- [x] `ScriptMode.tsx`: "또는 아래에서 직접 선택하세요" 구분선 추가
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (80 modules, 1.26s)

---

## 🟢 API 응답 속도 최적화 — per-task reasoning/token/temperature 튜닝 (완료)

- [x] `geminiProxy.ts`: `convertGoogleToOpenAI`에서 `_reasoningEffort`, `temperature`, `maxOutputTokens` 지원 추가
- [x] `scriptAnalysis.ts`: `analyzeScriptContext` → `_reasoningEffort: "low"`, `temperature: 0.3`, `maxOutputTokens: 500`
- [x] `scriptAnalysis.ts`: `estimateSceneCount` → `_reasoningEffort: "low"`, `temperature: 0.3`, `maxOutputTokens: 10`
- [x] `scriptAnalysis.ts`: Entity Enrichment 순차 for-loop → `Promise.allSettled` 병렬화
- [x] `imageAnalysis.ts`: `analyzeImageUnified` → `_reasoningEffort: "low"`, `temperature: 0.3`, `maxOutputTokens: 300`
- [x] `thumbnailService.ts`: `generateCharacterDialogue` → `_reasoningEffort: "low"`, `temperature: 0.5`, `maxOutputTokens: 300`
- [x] `thumbnailService.ts`: `sanitizePromptWithGemini` → `_reasoningEffort: "low"`, `maxOutputTokens: 2000`
- [x] `thumbnailService.ts`: `generateStylePreviewPrompts` → `_reasoningEffort: "low"`, `temperature: 0.3`, `maxOutputTokens: 500`
- [x] 미적용 함수 (기존 유지): `parseScriptToScenes`, `enrichEntityDetail`, `generateThumbnailConcepts`, `generateCharacterVariations`, `analyzeStyleReference`, `generateHighQualityThumbnail`
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (80 modules, 1.24s)

---

## 🟢 Kie Grok API 최적화 — 진행률 피드백 + 에러 코드 구별 (완료)

- [x] `VideoGenService.ts`: `pollKieTask`에 `onProgress` 콜백 파라미터 추가
- [x] `VideoGenService.ts`: `pollKieTask`에 시뮬레이션 프로그레스 추가 (`(90 - progress) * 0.03` 점진 증가)
- [x] `VideoGenService.ts`: `grokProvider.poll`에 `onProgress` 전달 (기존 누락 수정)
- [x] `VideoGenService.ts`: `pollKieTask` 내 HTTP 402 → "잔액 부족" 에러 메시지
- [x] `VideoGenService.ts`: `pollKieTask` 내 HTTP 429 → 5초 backoff 대기 후 continue
- [x] `VideoGenService.ts`: `createPortableGrokTask` 내 HTTP 402/429 에러 코드 구별 처리
- [x] `VideoGenService.ts`: `createPortableUpscaleTask` 내 HTTP 402/429 에러 코드 구별 처리
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (80 modules, 1.26s)

---

## 🟢 Laozhang 이미지 API 402 에러 처리 (완료)

- [x] `VideoGenService.ts`: `generateLaozhangImage` 내 HTTP 402 → "Laozhang 잔액이 부족합니다" 에러 메시지 추가
- [x] 기존 `mimeType: "image/jpeg"` 하드코딩 → 문제 없음 확인 (이미지는 JPG 생성, API가 바이너리에서 자동 감지)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (80 modules, 1.25s)

---

## 🟢 영상 리메이크 (Video Remake) 기능 구현 (완료)

### 핵심 모듈
- [x] `src/services/gemini/videoAnalysis.ts` 신규 생성 — `analyzeVideoWithGemini`, `extractFramesFromVideo`, `generateRemakeImage` 3개 함수
- [x] Laozhang `/v1beta/models/gemini-2.5-flash:generateContent` Google Native endpoint 직접 호출 (OpenAI format 미사용)
- [x] YouTube URL → `fileData.fileUri` 직접 전달 / 파일 업로드 → Cloudinary 후 URL 전달
- [x] Canvas API 기반 클라이언트 프레임 추출 (`extractFramesFromVideo`)
- [x] `generateRemakeImage`: sourceFrameUrl 유무에 따라 image-to-image / text-to-image 분기

### UI 변경
- [x] `types.ts`: `ProjectConfig`에 `youtubeUrl?: string` 추가
- [x] `RemakeMode.tsx`: YouTube URL 입력 필드 추가 + 유효성 검증 (youtube.com/youtu.be 패턴)
- [x] `RemakeMode.tsx`: 파일 업로드와 YouTube URL 상호 배타 처리
- [x] `ConfigForm.tsx`: RemakeMode 탭 주석 해제, grid-cols-2 → grid-cols-3

### 파이프라인 연결
- [x] `imageAnalysis.ts`: 스텁 함수(`analyzeVideoContent`, `analyzeVideoHybrid`) → `videoAnalysis.ts` 위임
- [x] `geminiService.ts`: 배럴 파일에 `analyzeVideoWithGemini`, `extractFramesFromVideo`, `generateRemakeImage` export 추가
- [x] `App.tsx`: `handleGenerateImage`에 REMAKE 모드 분기 추가 (`generateRemakeImage` 호출)
- [x] `App.tsx`: REMAKE 핸들러에 YouTube URL 지원 + 파일 업로드 시 프레임 추출 로직 추가

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (81 modules, 1.24s)

---

## 📊 진행률

| Phase | 상태 | 완료율 |
|-------|------|--------|
| Phase 0: 환경 구축 | ✅ 완료 | 100% |
| Phase 1: 버그 수정 | ✅ 완료 | 100% (12/12) |
| Phase 2-A: Zustand 도입 | ✅ 완료 | 100% |
| Phase 2-B: App.tsx 분해 | ✅ 완료 | 100% |
| Phase 2-C: 서비스 리팩토링 | ✅ 완료 | 100% |
| Phase 3: 새 기능 (영상 리메이크) | ✅ 완료 | 100% |
| Phase 4: 최적화 | ✅ 완료 | 100% |
| Phase 5: 성능/UX 최적화 | ✅ 완료 | 100% (14/14) |

---

## 🟢 WaveSpeed AI 워터마크/자막 제거 유틸리티 도구 (완료)

- [x] `apiService.ts`: `getWaveSpeedKey()` getter 추가, `saveApiKeys`에 `wavespeed` 파라미터 추가, `getStoredKeys`에 `wavespeed` 필드 추가
- [x] `VideoGenService.ts`: `createWatermarkRemovalTask(videoUrl)` 함수 추가 (POST api.wavespeed.ai)
- [x] `VideoGenService.ts`: `pollWatermarkRemovalTask(taskId, signal, onProgress)` 함수 추가 (5초 간격, 최대 200회)
- [x] `WatermarkRemoverModal.tsx`: 신규 생성 — URL/파일 입력, Cloudinary 업로드, 진행률 바, 결과 미리보기, 다운로드
- [x] `ProjectSidebar.tsx`: "🧹 워터마크/자막 제거" 유틸리티 버튼 + 모달 렌더링 추가
- [x] `ApiKeySettings.tsx`: 6단계 WaveSpeed API Key 입력란 추가, `saveApiKeys` 호출에 `wavespeed` 전달
- [x] 3개 메인 모드 (SCRIPT/CHARACTER/REMAKE) 완전 분리 — App.tsx, types.ts, geminiService.ts 수정 없음
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (82 modules, 1.27s)

---

## 🟢 캐릭터 모드 — 이미지 유실 방지 + 자동 프로젝트 네이밍 (완료)

- [x] `types.ts`: `CharacterDraft`에 `characterTitle?: string` 필드 추가
- [x] `CharacterMode.tsx`: `generateCharacterTitle()` 헬퍼 추가 (LIBRARY/MIXER/TWIST 모드별 의미 있는 이름 생성)
- [x] `CharacterMode.tsx`: `saveDraftImmediate()` 헬퍼 추가 (디바운스 없이 즉시 ProjectStore 반영)
- [x] `CharacterMode.tsx`: `handleImageUpdate`에서 이미지 생성 즉시 `saveDraftImmediate()` 호출 (2초 유실 구간 제거)
- [x] `CharacterMode.tsx`: `latestResultsRef` + `useEffect cleanup`으로 언마운트 시 최종 저장 (뒤로가기 유실 방지)
- [x] `CharacterMode.tsx`: 기존 디바운스 저장에도 `characterTitle` 포함 (일관성 유지)
- [x] `App.tsx`: `handleSaveDraft`에서 `characterDraft.characterTitle`로 프로젝트명 자동 설정 (수동 편집된 프로젝트명은 덮어쓰지 않음)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (82 modules, 1.30s)

---

## 🟢 BUG-FIX: 리메이크 모드 종횡비 하드코딩 + 프레임 추출 왜곡 (완료)

- [x] `RemakeMode.tsx`: `aspectRatio: AspectRatio.LANDSCAPE` 하드코딩 제거
- [x] `RemakeMode.tsx`: `detectAspectRatio()` 함수 추가 (videoWidth/Height 기반 자동 감지)
- [x] `RemakeMode.tsx`: 파일 업로드 시 `processVideoFile`에서 비디오 메타데이터 로드 → 종횡비 자동 감지
- [x] `RemakeMode.tsx`: YouTube URL 입력 시 수동 종횡비 선택 UI 추가 (9:16, 16:9, 1:1, 4:3)
- [x] `RemakeMode.tsx`: 파일 감지 결과 표시 UI (초록색 배지: "화면 비율 자동 감지: 9:16 (세로/숏폼)")
- [x] `videoAnalysis.ts`: `extractFramesFromVideo` 캔버스 크기 계산 수정 — 독립적 min(w,1280)/min(h,720) → 비율 유지 스케일링
- [x] TypeScript 컴파일 에러 0개

---

## 🟢 BUG-FIX: 리메이크 모드 이미지 생성 실패 + 한글 번역 기능 (완료)

### 이미지 생성 실패 수정
- [x] `videoAnalysis.ts`: `generateRemakeImage` 해상도 4K → 2K로 변경 (일반 모드와 동일)
- [x] `videoAnalysis.ts`: Kie 폴백 체인 추가 (Laozhang 실패 → Kie → 레퍼런스 제거 후 재시도)
- [x] `videoAnalysis.ts`: `imageModel` 파라미터 실제 활용 (Flash 모델 → Kie 직접 라우팅)
- [x] `App.tsx`: `handleGenerateImage` catch 블록에 에러 메시지 표시 (`generationStatus`에 실패 사유 노출)

### 한글 번역 기능
- [x] `types.ts`: Scene 인터페이스에 `scriptTextKO` 필드 추가
- [x] `videoAnalysis.ts`: `batchTranslateToKorean()` 함수 추가 (Gemini 2.5 Flash 기반 배치 번역)
- [x] `geminiService.ts`: 배럴 파일에 `batchTranslateToKorean` re-export 추가
- [x] `App.tsx`: REMAKE 분석 후 비한국어 콘텐츠 자동 감지 → 한국어 번역 실행
- [x] `StoryboardScene.tsx`: 한글 번역 textarea 추가 (파란색 배경, 편집 가능)
- [x] `App.tsx`: 전체 대본 모달에 한국어 번역 섹션 추가
- [x] `App.tsx`: 원본/한글 복사 버튼 분리 + 원본/한글 TXT 다운로드 버튼 추가
- [x] TypeScript 컴파일 에러 0개
- [x] Vite 빌드 성공 (82 modules, 1.29s)

---

---

## 🟢 외부 API 기술 문서 수집 + 검수 hooks 강화 (완료)

### API 기술 문서 신규 작성
- [x] `.claude/skills/api-reference.md` 신규 생성 — 7개 외부 API 전체 기술 문서
- [x] Kie AI: 이미지 생성, Grok 영상, Veo 3.1, 폴링, 취소, 에러 코드, 잔액 확인
- [x] Laozhang AI: Gemini 프록시(OpenAI호환), v1beta 이미지 생성(케이싱 규칙!), 비디오 분석, Veo 비동기 API
- [x] Apimart: Veo 3.1 1080p 생성/폴링
- [x] Cloudinary: 업로드 (unsigned preset)
- [x] Remove.bg: 배경 제거
- [x] WaveSpeed AI: 워터마크 제거 생성/폴링
- [x] 환율 API (open.er-api.com)
- [x] `media-gen.md`에 api-reference.md 참조 추가 + 체크포인트 보강
- [x] `CLAUDE.md`에 api-reference.md 스킬 매핑 추가 + WaveSpeed API 추가

### 검수 hooks 강화
- [x] `.claude/settings.json` PostToolUse: 단순 echo → 실제 `tsc --noEmit` 컴파일 체크로 업그레이드
- [x] .ts/.tsx 파일 수정 시에만 tsc 실행 (비-TypeScript 파일은 스킵)
- [x] 에러 발견 시 `❌ TypeScript 컴파일 에러 발견!` + 에러 목록 15줄 출력
- [x] 성공 시 `✅ TypeScript 컴파일 OK` 출력
- [x] PreToolUse: api-reference.md 참조 안내 문구 추가

---

## 🟢 Critical Fix: monitoredFetch 규칙 위반 수정 (완료)

- [x] `VideoGenService.ts:343`: `fetch(tempUrl)` → `monitoredFetch(tempUrl)` 교체
- [x] code-reviewer 서브에이전트 검수에서 발견된 Critical 1건 해결
- [x] CLAUDE.md 절대 규칙 준수: "모든 fetch 호출은 monitoredFetch 래퍼를 통해 실행하라"
- [x] VideoGenService.ts 내 raw `fetch()` 호출 0건 확인

---

## 🟢 BUG-FIX: 리메이크 모드 카메라 앵글/무브먼트/샷 사이즈 미반영 (완료)

### 문제
- `generateRemakeImage()`가 최소한의 프롬프트(`basePrompt + style + cinematic quality`)만 사용하여 원본 영상의 카메라 구도/앵글/움직임 완전 무시
- `analyzeVideoWithGemini()`에서 `shotSize` 필드 미추출
- 추출된 `cameraAngle`, `cameraMovement`, `characterAction` 데이터가 이미지 생성에 전혀 사용되지 않음

### 수정 내용
- [x] `videoAnalysis.ts`: `analyzeVideoWithGemini` 프롬프트에 `shotSize` 필드 추가 (Extreme Wide ~ Extreme Close-Up)
- [x] `videoAnalysis.ts`: scene mapping에 `shotSize: item.shotSize` 추가
- [x] `videoAnalysis.ts`: `generateRemakeImage` 프롬프트 구성 완전 재작성
  - `shotSize` → `(Close-Up: 1.5)` 가중치 프레이밍
  - `cameraAngle` → `(Eye Level shot: 1.5)` + 앵글별 보조 힌트 (Bird's Eye, Low Angle 등)
  - `cameraMovement` → `(Tracking motion blur hint: 1.2)` + 움직임별 보조 힌트 (Dolly, Crane 등)
  - `characterAction` → `(Character action: examining bones: 1.4)` 포즈/구도
- [x] `videoAnalysis.ts`: 콘솔 로그에 `cameraAngle`, `cameraMovement` 출력 추가
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)

---

## 🟢 Remake Mode 고도화 — True Image-to-Image + Multi-Frame + YouTube 보강 (완료)

### GAP 1: True Image-to-Image Edit Prompting
- [x] `videoAnalysis.ts`: `buildRemakeEditPrompt()` 신규 함수 — 참조 이미지 있을 때 편집 지시형 프롬프트 생성
- [x] `videoAnalysis.ts`: `buildRemakeDescriptivePrompt()` 신규 함수 — 참조 없을 때 서술형 프롬프트 (기존 로직 추출)
- [x] `videoAnalysis.ts`: `generateRemakeImage()` 내 프롬프트 분기: `refImage ? edit : descriptive`

### GAP 2: Multi-Frame Extraction
- [x] `videoAnalysis.ts`: `computeSceneTimestamps()` 신규 export 함수 — scene당 start+mid+near-end 타임스탬프 계산
- [x] `videoAnalysis.ts`: `selectBestFrame()` 신규 export 함수 — midpoint=sourceFrameUrl, near-end=endFrameUrl
- [x] `App.tsx`: 프레임 추출 로직을 멀티프레임으로 교체 (computeSceneTimestamps + selectBestFrame)

### GAP 3: YouTube Visual Enrichment
- [x] `videoAnalysis.ts`: `enrichYouTubeSceneDescriptions()` 신규 export 함수 — Gemini 2차 분석으로 색상/조명/DoF 보강
- [x] `App.tsx`: YouTube 분석 후 `enrichYouTubeSceneDescriptions()` 호출 추가

### GAP 4: Kie prompt_strength 적용
- [x] `videoAnalysis.ts`: Flash 루트 Kie 호출에 `imageStrength: 0.35` 전달 (refImage 존재 시)
- [x] `videoAnalysis.ts`: 최후 수단 Kie 호출에 `imageStrength: 0.35` 전달 (refImage 존재 시)

### GAP 5: userInstructions 전달
- [x] `videoAnalysis.ts`: `generateRemakeImage()` 시그니처에 `userInstructions?: string` 추가
- [x] `App.tsx`: `generateRemakeImage()` 호출에 `resolvedConfig.script` 전달 (기존 값 활용, useState 추가 없음)

### 배럴 파일 + 검증
- [x] `geminiService.ts`: `computeSceneTimestamps`, `selectBestFrame`, `enrichYouTubeSceneDescriptions` export 추가
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)

---

## 🟢 Remake Mode — True Image Editing (nano-banana-pro EDIT + Sora Image Edit) (완료)

### VideoGenService.ts 신규 함수
- [x] `editLaozhangImage()` 신규 함수 — 이미지 편집 전용 (이미지 FIRST parts 순서, API docs §2-B 준수)
- [x] `generateSoraImageEdit()` 신규 함수 — Sora/GPT-4o 이미지 편집 폴백 (gpt-4o-image, $0.01/장)
- [x] 두 함수 모두 `monitoredFetch` 사용, 402 잔액부족/SAFETY/MALFORMED_FUNCTION_CALL 에러 처리

### videoAnalysis.ts 재작성
- [x] `buildRemakeEditPrompt()` 강화 — "Transform" → "Edit this image:" 명시적 편집 지시
- [x] `generateRemakeImage()` 재작성 — 편집 API 우선 플로우:
  - StepA: `editLaozhangImage` (이미지 편집 전용)
  - StepB: 2초 대기 → `editLaozhangImage` 재시도
  - StepC: `generateSoraImageEdit` (Sora 폴백)
  - StepD: `generateLaozhangImage` (text-only 최후 수단)
  - StepE: `generateKieImage` (Kie 절대 최후)
- [x] import에 `editLaozhangImage`, `generateSoraImageEdit` 추가

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)

---

---

## 🟢 Remake Mode 10x 고도화 — 원본 충실도 극대화 + 모션 보존 (완료)

### Phase 1: 타입 추가
- [x] `types.ts`: `RemakeStyleAnalysis` 인터페이스 추가
- [x] `types.ts`: `Scene`에 `startFrameUrl`, `editedStartFrameUrl`, `editedEndFrameUrl` 필드 추가
- [x] `types.ts`: `VideoTaskParams`에 `endImageUrl`, `isRemake` 필드 추가
- [x] `types.ts`: `ProjectConfig`에 `remakeStyleAnalysis` 필드 추가

### Phase 2: 원본 스타일 자동 분석
- [x] `videoAnalysis.ts`: `analyzeFrameStyle()` 함수 추가 — Gemini Flash로 원본 프레임 스타일 분석
- [x] base64 및 URL 입력 모두 지원, 실패 시 fallback 반환

### Phase 3: 프레임 추출 고도화
- [x] `videoAnalysis.ts`: `extractFramesFromVideo` 해상도 768→1024, JPEG 0.7→0.85
- [x] `videoAnalysis.ts`: `computeSceneTimestamps` 1초 간격 밀도 추출로 변경
- [x] `videoAnalysis.ts`: `selectBestFrames` 신규 함수 — 선명도(Laplacian variance) 기반 최적 프레임 선택
- [x] `selectBestFrame` 래퍼 유지 (하위 호환)

### Phase 4: 프롬프트 이원화
- [x] `videoAnalysis.ts`: `buildPreservationEditPrompt` — 보존모드 (atmosphere="" 시)
- [x] `videoAnalysis.ts`: `buildStyleTransferEditPrompt` — 스타일변경모드
- [x] 기존 `buildRemakeEditPrompt` 유지 (레거시 폴백)

### Phase 5: editLaozhangImage 다중 이미지 지원
- [x] `VideoGenService.ts`: `processImagePart` 모듈 레벨 함수로 추출
- [x] `VideoGenService.ts`: `editLaozhangImage`에 `additionalImages` 파라미터 추가

### Phase 6: generateRemakeImage 확장
- [x] `videoAnalysis.ts`: 시그니처에 `styleAnalysis`, `styleAnchorUrl` 추가
- [x] 반환값에 `editedStartFrameUrl`, `editedEndFrameUrl` 추가
- [x] 보존/스타일변경 프롬프트 자동 선택 (`styleAnalysis` 유무)
- [x] 시작/끝 프레임 병렬 편집 (FIRST_AND_LAST_FRAMES_2_VIDEO용)

### Phase 7: detectedStyleDescription 하드코딩 제거
- [x] `RemakeMode.tsx`: `"Remake Mode"` → `""` (빈 값이면 auto-analysis 결과로 채움)

### Phase 8: App.tsx 오케스트레이션
- [x] `App.tsx`: `selectBestFrames` import 추가, 프레임 추출 시 사용
- [x] `App.tsx`: `analyzeFrameStyle` import 추가, atmosphere 미선택 시 자동 분석
- [x] `App.tsx`: `handleGenerateImage` REMAKE 분기에 `styleAnalysis`, `styleAnchor` 전달
- [x] `App.tsx`: REMAKE 전용 이미지 처리 큐 — Scene 1 단독 → 스타일앵커 → 나머지 동시성 3

### Phase 9: REMAKE 비디오 파이프라인
- [x] `VideoGenService.ts`: `pollKieVeoTask` 신규 — Kie Veo 전용 폴링 (successFlag 기반)
- [x] `VideoGenService.ts`: `createRemakeVeoTask` 신규 — FIRST_AND_LAST_FRAMES_2_VIDEO 생성
- [x] `useVideoBatch.ts`: `processRemakeScene` — 시작/끝 프레임으로 Kie Veo 비디오 생성
- [x] `useVideoBatch.ts`: `runRemakeBatch` — 배치 처리 (동시성 5)

### Phase 10: 배럴 파일 + 체크리스트
- [x] `geminiService.ts`: `analyzeFrameStyle`, `selectBestFrames` export 추가
- [x] `CHECKLIST.md` 업데이트

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (82 modules, 1.30s)

---

---

## 🟢 썸네일 전용 모드 — ConfigForm 4번째 탭 분리 (완료)

### Phase 1: 타입 추가
- [x] `types.ts`: `ProjectConfig.mode` 유니온에 `'THUMBNAIL'` 추가

### Phase 2: ThumbnailMode 컴포넌트
- [x] `src/components/modes/ThumbnailMode.tsx` 신규 생성 (~230줄)
- [x] 대본 입력 textarea
- [x] 영상 형식 토글 (가로 16:9 / 세로 9:16)
- [x] VISUAL_STYLES 아코디언 스타일 피커
- [x] 캐릭터 이미지 드래그앤드롭 업로드 (선택)
- [x] onSubmit에 `mode: 'THUMBNAIL'` + `isThumbnailOnlyMode: true` 전달

### Phase 3: ConfigForm 4번째 탭
- [x] `ConfigForm.tsx`: `grid-cols-3` → `grid-cols-4`
- [x] `ConfigForm.tsx`: `{ id: 'thumbnail', label: '🖼️ 썸네일', color: 'pink' }` 탭 추가
- [x] `ConfigForm.tsx`: `ThumbnailMode` React.lazy import + Suspense 렌더링
- [x] `ConfigForm.tsx`: `getTabStyle()` 핑크 컬러 케이스 추가

### Phase 4: App.tsx 라우팅
- [x] `App.tsx`: `handleConfigSubmit`에 THUMBNAIL 모드 분기 추가 (analyzeScriptContext → 언어 감지)
- [x] `App.tsx`: API 키 체크에 THUMBNAIL 모드 포함
- [x] `App.tsx`: 모드 배지에 THUMBNAIL 모드 → '🖼️ 썸네일 전용' 표시
- [x] `App.tsx`: 장면/영상 관련 버튼 숨김 조건에 `config.mode === 'THUMBNAIL'` OR 추가

### Phase 5: useAutoSave 업데이트
- [x] `useAutoSave.ts`: 저장 적격성 조건에 `config.mode === 'THUMBNAIL'` 추가

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (83 modules, 1.73s)
- [x] ThumbnailMode 별도 청크 분리 (8.78 kB gzip 3.40 kB)
- [x] 기존 ScriptMode의 `isThumbnailOnlyMode` 하위 호환 유지

---

## 🟢 xAI V2V 통합 — API 설정 UI + 가격 반영 + 연결 테스트 (완료)

- [x] `VideoGenService.ts`: `validateXaiConnection()` 함수 추가 (xAI `/v1/videos/generations` 엔드포인트 인증 확인)
- [x] `ApiKeySettings.tsx`: xAI 7단계 섹션 추가 (red-400 색상, 키 입력란 + 테스트 버튼)
- [x] `ApiKeySettings.tsx`: `keys`/`status` 상태에 `xai` 필드 추가, `useEffect`에서 `stored.xai` 로드
- [x] `ApiKeySettings.tsx`: 모든 `saveApiKeys` 호출에 `keys.xai` 9번째 인자 추가 (7곳)
- [x] `ApiKeySettings.tsx`: `handleTestXai` 핸들러 + `validateXaiConnection` import 추가
- [x] `constants.ts`: `PRICING.VIDEO_XAI_V2V_PER_SEC: 0.05` 추가
- [x] `apiService.ts`: `getXaiKey()`, `saveApiKeys` xai 파라미터, `getStoredKeys` xai 필드 — 이전 작업에서 이미 완료

---

## 🟢 V2V 리메이크 모드 UI 전면 개편 (완료)

### 배경
- 기존 RemakeMode는 복잡한 I2V 파이프라인 (영상분석→프레임추출→이미지재생성→Kie Veo 영상생성)
- xAI Grok V2V API가 `VideoGenService.ts`에 이미 구현되어 있으므로 **영상 파일 업로드 → 스타일 프롬프트 → xAI Grok V2V 변환**으로 단순화

### 수정 파일 (4개)

#### 1. `types.ts` — V2V 타입 추가
- [x] `Scene.sourceVideoUrl?: string` 추가 (V2V 원본 영상 Cloudinary URL)
- [x] `ProjectConfig.v2vPrompt?: string` 추가 (V2V 변환 프롬프트)
- [x] `ProjectConfig.v2vResolution?: '480p' | '720p'` 추가 (V2V 해상도)

#### 2. `RemakeMode.tsx` — 완전 재작성 (~200줄)
- [x] **제거**: YouTube URL 입력, 분석 전략 선택 (NARRATIVE/VISUAL), 이미지 모델 선택, VISUAL_STYLES 드롭다운, 종횡비 수동 선택
- [x] **제거**: `IMAGE_MODELS`, `VISUAL_STYLES` import 제거
- [x] **추가**: `getXaiKey` import (xAI 키 유무 체크)
- [x] **새 UI 3단계**:
  - Step 1: 영상 파일 업로드 (드래그앤드롭, 종횡비 자동 감지)
  - Step 2: 변환 스타일 프롬프트 (textarea + 7개 빠른 선택 태그: Ghibli, Pixar 3D, Watercolor, Cyberpunk, Film Noir, Retro Anime, Oil Painting)
  - Step 3: 해상도 선택 (480p / 720p)
- [x] 비용 안내 ($0.05/초, 8초 ≈ $0.40)
- [x] xAI 키 미설정 시 submit 비활성화 + 안내 문구

#### 3. `App.tsx` — REMAKE 분기 대폭 단순화 (~130줄 → ~20줄)
- [x] **handleConfigSubmit REMAKE 분기**: 복잡한 I2V 파이프라인 전체 제거 → 영상 업로드 + 1개 Scene 생성 (sourceVideoUrl)
- [x] **processRemakeImagesWithAnchor 블록**: 완전 제거 → `processRemakeScene()` 단일 호출로 교체
- [x] **handleGenerateImage REMAKE 분기**: 이미지 생성 로직 제거 → early return (V2V는 이미지 불필요)
- [x] **useVideoBatch 디스트럭처링**: `processRemakeScene` 추가
- [x] **모드 배지**: `REMAKE` → `🎬 V2V 변환` 표시
- [x] **import 정리**: 미사용 12개 함수 제거 (`analyzeVideoWithGemini`, `extractFramesFromVideo`, `generateRemakeImage`, `computeSceneTimestamps`, `selectBestFrame`, `selectBestFrames`, `analyzeFrameStyle`, `enrichYouTubeSceneDescriptions`, `generateYouTubeReferenceFrames`, `analyzeVideoContent`, `analyzeVideoHybrid`, `batchTranslateToKorean`)

#### 4. `useVideoBatch.ts` — processRemakeScene 재작성 (~60줄 → ~35줄)
- [x] **기존**: Kie Veo `FIRST_AND_LAST_FRAMES_2_VIDEO` (base64 프레임 업로드 → createRemakeVeoTask/createKieVeoTask → pollKieVeoTask)
- [x] **신규**: `scene.sourceVideoUrl` → `createXaiVideoEditTask(url, prompt, resolution)` → `pollXaiVideoEditTask`
- [x] **import 변경**: `createRemakeVeoTask`, `createKieVeoTask`, `pollKieVeoTask` 제거 → `createXaiVideoEditTask`, `pollXaiVideoEditTask` 추가
- [x] **import 추가**: `getXaiKey` (apiService)
- [x] **비용 추적**: `PRICING.VIDEO_XAI_V2V_PER_SEC * 8` 사용
- [x] **runRemakeBatch 필터**: `s.imageUrl` → `s.sourceVideoUrl && !s.videoUrl` 로 변경

### 제거하지 않은 것
- `VideoGenService.ts`의 기존 함수들 (createRemakeVeoTask, Luma, Runway 등) — 다른 곳에서 사용 가능
- `videoAnalysis.ts` 함수들 — geminiService 배럴 파일에서 export 유지
- `types.ts`의 기존 REMAKE 관련 필드 (`remakeStrategy`, `remakeStyleAnalysis` 등) — 호환성 유지

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit --skipLibCheck`)
- [x] VS Code 언어 진단 에러 0개 (4개 파일 모두 clean)

---

## 🟢 RemakeMode 한글화 + 8초 제한 안내 문구 수정 (완료)

- [x] `RemakeMode.tsx`: "V2V Style Transfer" → "영상 스타일 변환 (V2V)" 한글화
- [x] `RemakeMode.tsx`: 헤더 설명문 영어 → 한글 번역 + "긴 영상도 업로드 가능, 변환 결과 약 8초" 명시
- [x] `RemakeMode.tsx`: "Step 1/2/3" → "1단계/2단계/3단계" 한글화
- [x] `RemakeMode.tsx`: "Quick Style Presets:" → "빠른 스타일 프리셋:" 한글화
- [x] `RemakeMode.tsx`: QUICK_STYLES 라벨 7개 한글화 (지브리 풍, 픽사 3D, 수채화, 사이버펑크, 필름 누아르, 레트로 애니, 유화)
- [x] `RemakeMode.tsx`: "최대 8초 영상 지원" → "모든 길이의 영상 업로드 가능 (변환 결과: 약 8초)" 오해 방지
- [x] `RemakeMode.tsx`: 비용 안내 "8초 영상" → "변환 결과 약 8초" 명확화

---

## 🟢 긴 영상 전체 V2V 스타일 변환 — 자동 구간 분할 기능 (완료)

### 핵심 전략
- Cloudinary URL 트랜스포메이션(`so_X,eo_Y`)으로 영상을 ~8초 구간으로 분할
- 업로드 1회만, 분할은 URL 조작만으로 수행
- 각 구간을 개별 Scene으로 생성하여 기존 배치 처리 파이프라인으로 병렬 변환

### 수정 파일 (7개)
- [x] `types.ts`: Scene에 `v2vSegmentIndex`, `v2vTotalSegments`, `v2vSegmentStartSec`, `v2vSegmentEndSec` 추가; ProjectConfig에 `v2vOriginalDuration` 추가
- [x] `src/utils/videoSegmentUtils.ts` 신규 생성 (~60줄): `getVideoDuration`, `buildCloudinaryTrimUrl`, `splitVideoIntoSegments` 유틸리티
- [x] `RemakeMode.tsx`: `detectedDuration` state 추가, 영상 길이 감지, 구간 수 미리보기, 동적 비용 계산, 헤더 문구 업데이트
- [x] `App.tsx`: REMAKE 분기 멀티씬 생성 (`splitVideoIntoSegments` → 구간별 Scene), `runRemakeBatchWithScenes` 자동 시작
- [x] `useVideoBatch.ts`: `runRemakeBatchWithScenes` 신규 함수 (인자로 받은 scenes 배치 처리), `processRemakeScene` 구간 라벨/비용 반영
- [x] `StoryboardScene.tsx`: 보라색 구간 배지 (`구간 2/4 (8s~16s)`) 표시 (`v2vTotalSegments > 1`)
- [x] `WatermarkRemoverModal.tsx`: 로컬 `getVideoDuration` 제거 → `utils/videoSegmentUtils`에서 import

### 엣지 케이스 처리
- ≤8초 영상: 구간 1개 → 기존과 동일 동작
- 마지막 구간 <2초: 이전 구간에 병합
- duration 감지 실패 (0): 구간 1개로 폴백
- Cloudinary URL에 `/upload/` 없음: URL 그대로 반환

### 검증
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)
- [x] Vite 빌드 성공 (84 modules, 1.29s)

---

## 🟢 Kie/Laozhang API 기술 문서 준수 최적화 (완료)

- [x] `geminiProxy.ts`: `include_thoughts: false` 추가 — 앱에서 reasoning_content 미사용, 불필요 토큰 절약
- [x] `geminiProxy.ts`: Kie 폴백 시 `response_format` 호환성 처리
  - Flash: response_format 완전 제거 + 시스템 프롬프트 보상 (Flash 문서에 미지원)
  - Pro: json_object → 시스템 프롬프트 보상 (Pro는 json_schema만 지원, 출력 스키마가 호출마다 다름)
- [x] Laozhang(Primary)에는 기존 response_format 유지 (OpenAI 100% 호환)
- [x] TypeScript 컴파일 에러 0개 (`tsc --noEmit`)

---

## 🟢 Gemini API 품질 복원 — Thinking 모델 + 기술 문서 준수 (완료)

### 배경
- v2.26은 깊은 추론을 활용해 장면/맥락 이해도가 높았음
- 현재 버전은 주요 분석이 Flash 다운그레이드 + reasoning 미활용으로 품질 저하

### 기술 문서 대조 결과
- Laozhang: v1beta는 **이미지 생성 전용**, 텍스트/채팅은 `/v1/chat/completions` (OpenAI 형식)
- Laozhang: 전용 thinking 모델 `gemini-3-pro-preview-thinking` 지원
- Kie: v1beta **미지원**, OpenAI 형식만 (`reasoning_effort: "high"`)
- `thinkingConfig` 파라미터는 **문서에 없음** → 전용 thinking 모델로 대체

### 수정 파일 (2개)

#### 1. `scriptAnalysis.ts` — 핵심 분석 함수 품질 업그레이드
- [x] `analyzeScriptContext()`: Flash → **`gemini-3-pro-preview-thinking`** (Laozhang 전용 thinking 모델)
- [x] `analyzeScriptContext()`: `_reasoningEffort: "low"` 제거 (thinking 모델이 자체 추론)
- [x] `parseScriptToScenes()` Primary: **`gemini-3-pro-preview-thinking`** (깊은 장면 분석)
- [x] `parseScriptToScenes()` Fallback: `gemini-3-flash-preview` (기존 유지)
- [x] `thinkingConfig` 제거 (문서에 없는 파라미터)
- [x] 모든 호출이 `requestGeminiProxy` (OpenAI 형식) 경유 — 기술 문서 준수

#### 2. `geminiProxy.ts` — Kie thinking 모델 폴백 처리
- [x] Kie 폴백 시 thinking 모델 → `gemini-3-pro` + `reasoning_effort: "high"`로 자동 매핑
- [x] `extractTextFromResponse`: thinking parts (`thought: true`) 스킵 로직 유지
- [x] `extractFunctionCall`: thinking parts 스킵 로직 유지

### 변경하지 않은 함수들
- `estimateSceneCount` — 숫자 하나 반환, Flash+low 적절
- `analyzeImageUnified` — 간단한 JSON 추출, Flash+low 적절
- `generateCharacterDialogue` — 단순 대사 생성, Flash+low 적절

### 검증
- [x] TypeScript 컴파일 에러 0개
- [x] Vite 빌드 성공 (84 modules, 1.36s)

---

## 🟢 Kie Grok 720p — 기술 문서 대조 및 수정 (완료)

### 기술 문서 대조 결과
- 엔드포인트/모델명/인증/폴링/응답 파싱: 모두 정확 ✅
- `image_urls`, `index`, `mode`, `duration`: 정확 ✅
- **`resolution` 파라미터 누락 발견** → 기본값(480p?)으로 생성되던 문제

### 수정
- [x] `VideoGenService.ts` `createPortableGrokTask`: input에 `resolution: "720p"` 추가
- [x] `.claude/skills/api-reference.md` 섹션 1-D: Grok 기술 문서 전체 반영 (콜백, 이미지 입력 방식, 폴링 응답, 핵심 규칙)
- [x] Vite 빌드 성공

---

## 🟢 썸네일 생성 파이프라인에 맥락 정보 주입 (완료)

### 배경
- 스토리보드 이미지 생성(`imageGeneration.ts`)은 globalContext(문화권/지명/시대/엔티티)를 프롬프트에 주입하지만, 썸네일 생성(`thumbnailService.ts`)은 이 정보가 전혀 전달되지 않아 잘못된 문화권/인물/배경이 생성될 수 있었음

### 수정 파일 (3개)

#### 1. `ThumbnailGenerator.tsx`
- [x] `ThumbnailGeneratorProps`에 `globalContext?: string` 추가
- [x] 컴포넌트 destructure에 `globalContext` 추가
- [x] `generateHighQualityThumbnail` 호출에 `globalContext` 전달 (클로저 변수 활용)

#### 2. `App.tsx`
- [x] `<ThumbnailGenerator>` JSX에 `globalContext={config!.globalContext}` prop 추가

#### 3. `thumbnailService.ts`
- [x] `generateHighQualityThumbnail` 시그니처에 `globalContext?: string` 파라미터 추가
- [x] `localeRule` 다음에 Context Grounding 블록 추가:
  - globalContext JSON 파싱 → locationContext, eraContext, cultureContext, keyEntitiesContext 추출
  - 6대 문화권 감지 (한국/중국/일본/서양/아랍/인도) + 대칭 네거티브 프롬프트 생성
- [x] 프롬프트 `[CONTEXT]` 섹션 삽입 (`[VISUALS]` 앞)
- [x] `[NEGATIVE]` 섹션에 `cultureNegatives` 주입

### 변경하지 않은 것
- `imageGeneration.ts` — 기존 스토리보드 파이프라인 그대로
- `generateThumbnailConcepts` — 텍스트 기획 단계라 맥락 불필요
- `geminiService.ts` 배럴 파일 — 시그니처 자동 전파

### 검증
- [x] TypeScript 컴파일 에러 0개
- [x] Vite 빌드 성공 (84 modules, 1.28s)

---

## 🟢 전체 코드베이스 감사 + Dead Code 정리 (완료)

### 감사 범위 (3개 병렬 에이전트)
- 에이전트 1: Dead code, 끊어진 import, 미사용 타입/props
- 에이전트 2: 모든 UI 핸들러(onClick/onSubmit) 연결 상태
- 에이전트 3: 데이터 흐름 무결성 (Store↔Component, Service 시그니처↔호출부)

### 감사 결과 요약
- **치명적 이슈**: 0건 — 모든 기능 정상 작동
- **UI 핸들러**: 500+ 버튼/폼 전수 검사 → 전부 정상 연결
- **데이터 흐름**: Store selector, Service 시그니처, Type 호환성 모두 PASS
- **Dead Code**: 12건 발견 (기능 영향 없음)

### 즉시 수정 (Dead Code 삭제)
- [x] `services/googleDriveService.ts` 삭제 (81줄, Cloudinary 전환 후 미사용)
- [x] `components/App.tsx` 삭제 (7줄, deprecated 마커 파일)
- [x] `geminiService.ts` barrel에서 미사용 12개 함수 re-export 제거:
  - `analyzeVideoWithGemini`, `extractFramesFromVideo`, `generateRemakeImage`, `batchTranslateToKorean`
  - `computeSceneTimestamps`, `selectBestFrame`, `selectBestFrames`, `analyzeFrameStyle`
  - `enrichYouTubeSceneDescriptions`, `generateYouTubeReferenceFrames`
  - `analyzeVideoContent`, `analyzeVideoHybrid`
  (구 I2V 리메이크 파이프라인 잔재 — V2V 전환 후 불필요)
- [x] Vite 빌드 성공 (84 modules, 1.30s)

### 개선 체크리스트 (비치명적, 향후 작업)
- [ ] `imageProcessingService.ts`: `blobToBase64`, `compositeProductOnBackground` 미사용 함수 제거
- [ ] `StoryboardScene.tsx`: `videoFormat: VideoFormat` 미사용 prop 제거 (interface + App.tsx 전달부)
- [ ] `videoAnalysis.ts`: 미사용 함수 7개 본문 정리 (현재 barrel에서만 끊김, 정의는 잔존)
- [ ] `imageAnalysis.ts`: `analyzeVideoContent`, `analyzeVideoHybrid` 래퍼 함수 정리
- [ ] `VideoGenService.ts`: Luma/Runway 관련 함수 6개 (createLumaModifyTask 등) — useVideoBatch에서 참조는 있으나 실제 V2V에서 미사용
- [ ] `useVideoBatch.ts:264`: `isUpscaled: false` → 의도 명확화 (Native HQ 추적)

---

## 🟢 BUG-FIX: 예상 컷수 정확도 + 캐릭터 분석 품질 전면 업그레이드 (완료)

### Bug 1: "확정" → "예상" 텍스트 수정
- [x] `ScriptMode.tsx:1012`: `✅ {estimatedScenes}컷 확정` → `✅ {estimatedScenes}컷 예상`

### Bug 2: 예상 컷수 = 실제 결과 보장 (결정론적 로컬 카운트)
- **근본 원인**: AI한테 "몇 컷이야?" 물어보면 세는 걸 틀림 (7줄 → 6컷 반환)
- **해결**: `parseScriptToScenes` 후처리와 동일한 규칙으로 로컬에서 결정론적 카운트
- [x] `scriptAnalysis.ts`: `countScenesLocally()` 신규 함수 (~80줄)
  - 수동모드: 줄 수 = 장면 수
  - LONG+DEFAULT: 2문장=1장면, Q&A 3문장 병합
  - LONG+DETAILED: 1문장=1장면, Q&A 2문장 병합
  - SHORT: 1문장=1장면 + 쉼표 분할
  - NANO: 최대 분할 (쉼표/세미콜론/콜론) + Q&A 병합
- [x] `analyzeScriptContext()`: AI의 `estimatedSceneCount`를 `countScenesLocally()` 결과로 오버라이드
- [x] `estimateSceneCount()`: Flash API 호출 완전 제거 → 로컬 카운트만 (비용 $0)
- [x] 데이터 흐름: 예상 컷수 버튼 → `targetSceneCount`로 `parseScriptToScenes` 전달 → 실제 분할과 일치

### Bug 3: 캐릭터 이미지 분석 Pro 업그레이드
- [x] `imageAnalysis.ts`: `analyzeImageUnified` → **Gemini 3 Pro** (v1 프록시 경유)
- [x] `analyzeStyleReference`: 동일 Gemini 3 Pro → Flash 폴백
- [x] `_reasoningEffort: "low"` 제거

### 검증
- [x] Vite 빌드 성공 (84 modules, 1.30s)

---

## 🟢 Gemini 2.5 → 3.0 전면 마이그레이션 (완료)

### 배경
- 코드베이스 전체에 `gemini-2.5-pro`, `gemini-2.5-flash` 참조가 잔존
- 사용자 요구: 모든 Gemini 모델을 3.0으로 업그레이드

### 기술 문서 핵심
- Laozhang v1beta: 이미지 생성/비디오 분석 **전용** (텍스트/채팅은 v1 OpenAI 형식만)
- `thinkingConfig` 파라미터: Gemini 3에서 **존재하지 않음** → 전용 모델 `gemini-3-pro-preview-thinking` 사용
- Kie: v1beta **미지원**, `reasoning_effort: "high"`로 thinking 대체

### 수정 파일 (3개)

#### 1. `scriptAnalysis.ts` — 핵심 분석 엔진
- [x] `analyzeScriptContext`: `gemini-2.5-pro` v1beta + thinkingConfig → `gemini-3-pro-preview-thinking` v1 프록시
- [x] `parseScriptToScenes`: 동일 패턴 (Thinking → Pro → Flash 폴백 체인)
- [x] `requestGeminiNative` 미사용 import 제거

#### 2. `imageAnalysis.ts` — 이미지/스타일 분석
- [x] `analyzeImageUnified`: `gemini-3-pro-preview` → `gemini-3-flash-preview` 폴백
- [x] `analyzeStyleReference`: 동일 패턴
- [x] `requestGeminiNative` 미사용 import 제거

#### 3. `videoAnalysis.ts` — 영상 분석/리메이크
- [x] `analyzeVideoWithGemini`: v1beta `gemini-2.5-flash` → `gemini-3-flash-preview`
- [x] `analyzeFrameStyle` (URL경로 + base64경로): `gemini-2.5-flash` → `gemini-3-flash-preview`
- [x] `enrichYouTubeSceneDescriptions`: v1beta `gemini-2.5-flash` → `gemini-3-flash-preview`
- [x] `batchTranslateToKorean`: `gemini-2.5-flash` → `gemini-3-flash-preview`

### 최종 확인
- [x] `src/` 전체에서 `gemini-2.5` 참조 **0건** (Grep 확인)
- [x] Vite 빌드 성공 (84 modules)

---

## 🟢 v4.5 Zustand Store 확장 — 6개 신규 스토어 생성 (완료)

### 배경
- v4.5 앱 오버홀: 7탭 네비게이션 (project, channel-analysis, script-writer, sound-studio, image-video, edit-room, upload)
- `types.ts`에 v4.5 전용 타입 50+ 이미 정의됨 → 대응하는 Zustand 스토어 필요

### 신규 스토어 (6개)

#### 1. `src/stores/navigationStore.ts` (~25줄)
- [x] State: `activeTab` (AppTab, default 'project'), `previousTab`
- [x] Actions: `setActiveTab(tab)` — previousTab 자동 추적, `goBack()` — previousTab 복원

#### 2. `src/stores/channelAnalysisStore.ts` (~85줄)
- [x] State: subTab, keyword, language, region, keywordResults, relatedKeywords, topVideos, tags, isAnalyzing, apiUsagePercent, channelInfo, channelScripts, channelGuideline, isExtractingScripts
- [x] Actions: setSubTab, setKeyword, setLanguage, setRegion, analyze (일괄 결과 반영), setIsAnalyzing, setApiUsagePercent, setChannelInfo, setChannelGuideline, setChannelScripts, setIsExtractingScripts, reset

#### 3. `src/stores/scriptWriterStore.ts` (~100줄)
- [x] State: inputMode, contentFormat, shortsSeconds, benchmarkScript, presets, selectedPreset, topics, generatedScript, finalScript, isGenerating, isExpanding, expansionTarget, activeStep (1-4)
- [x] Actions: setInputMode, setContentFormat, setShortsSeconds, setBenchmarkScript, addPreset, removePreset, selectPreset, setTopics, setGeneratedScript, setFinalScript, startGeneration, finishGeneration, startExpansion, finishExpansion, setActiveStep (1-4 범위 제한), sendToImageVideo (get 패턴), reset

#### 4. `src/stores/soundStudioStore.ts` (~120줄)
- [x] State: speakers, lines, selectedSpeakerId, ttsEngine, isGeneratingTTS, mergedAudioUrl, musicConfig, musicLibrary, isGeneratingMusic, activeSubTab
- [x] Actions: addSpeaker, removeSpeaker (연관 라인 speakerId 해제), updateSpeaker, setSelectedSpeakerId, assignVoice, setLines (함수형 setter), updateLine, setTtsEngine, setIsGeneratingTTS, setMergedAudio, generateAllTTS, mergeAll, setMusicConfig, addToLibrary, removeFromLibrary, setIsGeneratingMusic, setActiveSubTab, reset

#### 5. `src/stores/editorStore.ts` (~160줄)
- [x] State: timeline, selectedSegmentId, splitMode, subtitles, selectedSubtitleId, subtitleStyle, silenceRegions, silenceConfig, effectPresets (Record<string, EffectPresetId>), isPlaying, currentTime, totalDuration, zoom (50-200), activeEditorTab
- [x] Actions: setTimeline (함수형 setter), updateSegment, setSelectedSegmentId, setSplitMode, setSubtitles (함수형 setter), updateSubtitle, setSelectedSubtitleId, setSubtitleStyle, setSilenceConfig (partial merge), detectSilence, removeSilence (타임라인에서 묵음 세그먼트 필터링), applyEffectPreset, removeEffectPreset, play, pause, seek, setTotalDuration, setZoom (50-200 범위 제한), setActiveEditorTab, reset

#### 6. `src/stores/uploadStore.ts` (~90줄)
- [x] State: currentStep, youtubeAuth, metadata, thumbnailUrl, uploadSettings, exportConfig, isUploading, uploadProgress, outputMode
- [x] Actions: setStep, setAuth (partial merge), clearAuth, setMetadata, setThumbnail, setUploadSettings (partial merge), setExportConfig (partial merge), setOutputMode, startUpload, setUploadProgress (0-100 범위 제한), finishUpload, resetUpload (인증 정보 유지)

### 패턴 준수
- [x] 기존 3개 스토어 (uiStore, projectStore, costStore)와 동일 패턴: `create<Interface>((set) => ({...}))`
- [x] 함수형 setter: `setLines`, `setTimeline`, `setSubtitles` 등 — React setState 호환 시그니처
- [x] INITIAL_STATE 상수 분리 — `reset()` 액션에서 재사용
- [x] 모든 타입은 `../types`에서 import (새로운 타입 추가 없음)
- [x] 한국어 주석, 영어 변수명 (CLAUDE.md 규칙 준수)
- [x] `any` 타입 사용 0건

---

## 🟢 v4.5 채널 분석 탭 컴포넌트 생성 (완료)

### 신규 디렉토리
- [x] `src/components/tabs/` 디렉토리 생성
- [x] `src/components/tabs/channel/` 서브 디렉토리 생성

### 1. `src/components/tabs/ChannelAnalysisTab.tsx` (~78줄)
- [x] 메인 컨테이너 컴포넌트 (키워드 랩, 채널 분석실 서브 탭)
- [x] `useChannelAnalysisStore` subTab 연동
- [x] `React.lazy` + `Suspense`로 서브 탭 코드 스플리팅
- [x] 다크 테마 (bg-gray-900, border-gray-700)

### 2. `src/components/tabs/channel/KeywordLab.tsx` (~178줄)
- [x] 검색바 + "분석" 버튼 + 설정 기어 아이콘
- [x] 언어 토글 (한국어, 日本語, EN) — store language 연동
- [x] 지역 토글 (전체, 롱폼) — store region 연동
- [x] API 사용량 프로그레스 바
- [x] 4대 점수 카드: 검색량, 경쟁도, 기회점수, 트렌드 (색상 코딩)
- [x] 통계 행: 총 검색결과, 평균 조회수, 채널 다양성, 데이터 소스
- [x] 3개 결과 탭: 연관 키워드 (점수 바), 상위 영상 (썸네일/채널/참여율/조회구독비), 태그 (클라우드 + 복사/JSON 내보내기)
- [x] 설정 모달: YouTube API 키 입력, 기본 언어, 자동 분석 체크박스, 캐시 초기화

### 3. `src/components/tabs/channel/ChannelAnalysisRoom.tsx` (~199줄)
- [x] 대본 유형 라디오: 벤치대본 / 일반대본
- [x] 콘텐츠 형식 라디오: 롱폼 / 쇼츠 (초 입력)
- [x] 벤치마킹 대본 섹션: 파일 불러오기 + textarea + 로드 상태 표시
- [x] 추천주제목록 / 원본대본 토글
- [x] 주제 입력 + 카테고리 힌트
- [x] "벤치 분석 및 주제 추천" 버튼 (orange-red 그라데이션)
- [x] "주제 10개 재추천" 버튼 (green 그라데이션)
- [x] 추천 주제 리스트 (바이럴 점수 배지: 높음/중간/낮음)
- [x] 주제 상세 모달: 메인 소재, 유사점, 대본 흐름, 바이럴 점수
- [x] "대본작성으로 보내기" 기능 (navigationStore.setActiveTab + scriptWriterStore 데이터 전달)

### 검증
- [x] 신규 3개 파일 TypeScript 컴파일 에러 0건
- [x] 기존 코드 영향 없음 (pre-existing 42 errors — 다른 파일)
- [x] 모든 import 경로 정확 (stores, types)
- [x] `any` 타입 사용 0건
- [x] 컴포넌트 크기 제한 준수 (250/300/300줄 이내)

---

## 🟢 v4.5 대본 작성 탭 컴포넌트 생성 (완료)

### 신규 디렉토리
- [x] `src/components/tabs/script/` 서브 디렉토리 생성

### 1. `src/components/tabs/ScriptWriterTab.tsx` (~290줄)
- [x] 메인 대본 작성 컨테이너 ("대본 업로드" / "영상에 사용할 대본을 업로드하거나 직접 입력하세요")
- [x] 4개 입력 방식 탭: AI 생성, 직접 입력, 파일 업로드, 최종 대본
- [x] AI 대본 생성 4단계 위저드 (주제 선택 → 제목/줄거리 → 대본 생성 → 대본 편집)
- [x] 스텝 인디케이터 (완료 단계 녹색 체크마크)
- [x] "이 대본 선택 →" 버튼 (상단 우측, image-video 탭 전환)
- [x] 좌측 패널: 생성된 대본 textarea + 우측 패널: AI 생성 위저드
- [x] Step1: 언어(ko/en/ja), 장르(7개), 톤(6개) 선택
- [x] Step2: 콘텐츠 형식(롱폼/쇼츠), 제목, 시놉시스 입력
- [x] 파일 업로드 (TXT, SRT, DOCX)
- [x] `useScriptWriterStore`, `useNavigationStore`, `useChannelAnalysisStore` 연동

### 2. `src/components/tabs/script/ScriptExpander.tsx` (~230줄)
- [x] "대본 확장" 헤더 + "시놉시스 기반으로 대본을 확장합니다 (최대 30,000자)"
- [x] "상세 분석" 토글 링크 (문장 수, 단락 수, 평균 문장 길이)
- [x] 현재 대본 통계: X자 / 30,000자, X분 X초 분량, +Y자 확장 가능
- [x] SVG 원형 프로그레스 인디케이터 (퍼센트 표시, 색상 단계별 변화)
- [x] 목표 확장 길이 5개 옵션: 5천자, 1만자, 1만5천자, 2만자, 3만자 (분량 추정 포함)
- [x] 확장 옵션 태그 5개: 논리적 일관성, 감정선, 플롯 기법, 대사 톤, 서사 구조
- [x] "대본 확장 시작" 버튼 (green gradient)
- [x] "이 대본 확정 등록" 버튼 (최종 대본 섹션)
- [x] `ScriptExpansionConfig` 타입 활용

### 3. `src/components/tabs/script/BenchmarkPanel.tsx` (~190줄)
- [x] 접이식 패널 (토글 헤더, 벤치마크 대본 개수 배지)
- [x] 채널 정보 표시 (썸네일, 이름, 구독자 수)
- [x] 채널 대본 목록 (제목, 길이, 조회수 — 최대 5개)
- [x] "벤치 분석 및 주제 추천" 버튼 (purple-pink gradient)
- [x] "주제 10개 재추천" 버튼
- [x] 주제 추천 목록: 번호, 제목, 바이럴 점수(HIGH/MID/LOW 색상 배지), 주요 소재, 대본 흐름
- [x] 채널분석 데이터 없을 시 안내 문구
- [x] `useChannelAnalysisStore` + `useScriptWriterStore` 연동

### 검증
- [x] 신규 3개 파일 TypeScript 컴파일 에러 0건
- [x] 기존 코드 영향 없음 (pre-existing errors — 다른 파일)
- [x] 모든 import 경로 정확 (stores, types)
- [x] `any` 타입 사용 0건
- [x] 컴포넌트 크기 제한 준수 (290/230/190줄 이내, 모두 300줄 이하)

---

## 🟢 v4.5 신규 서비스 파일 4개 생성 (완료)

### 1. `src/services/evolinkService.ts` (~210줄)
- [x] `getEvolinkKey()`: localStorage('CUSTOM_EVOLINK_KEY') 조회 + sanitize
- [x] `evolinkChat(messages, options)`: Gemini 3.1 Pro Preview 채팅 완성 (OpenAI-compatible)
- [x] `evolinkGenerateImage(prompt, model, aspectRatio)`: nano-banana-2/pro 이미지 생성
- [x] `validateEvolinkConnection(apiKey)`: API 연결 테스트
- [x] 모든 fetch → `monitoredFetch`, 에러 코드별 한국어 메시지 (401/402/429)

### 2. `src/services/youtubeAnalysisService.ts` (~460줄)
- [x] `getYoutubeApiKey()`: localStorage('CUSTOM_YOUTUBE_API_KEY') 조회
- [x] `searchKeyword(keyword, language, region)`: YouTube Search API + 통계 종합 분석 → `KeywordAnalysisResult`
- [x] `getRelatedKeywords(keyword, language)`: YouTube Suggest API → `RelatedKeyword[]`
- [x] `getTopVideos(keyword, maxResults)`: 상위 영상 + 채널 구독자 + 참여율 → `TopVideo[]`
- [x] `getVideoTags(videoId)`: 영상 태그 추출 → `KeywordTag[]`
- [x] `getChannelInfo(channelUrl)`: 채널 URL 파싱 (@handle, /channel/UC, /c/, /user/) → `ChannelInfo`
- [x] `getRecentVideos(channelId, maxResults)`: 최근 영상 목록 → `ChannelScript[]`
- [x] `getVideoTranscript(videoId)`: 자막 시도 → description 폴백
- [x] `analyzeChannelStyle(scripts, channelInfo)`: Evolink Gemini로 채널 스타일 분석 → `ChannelGuideline`
- [x] `validateYoutubeConnection(apiKey)`: API 연결 테스트
- [x] 모든 fetch → `monitoredFetch`, 타입 안전 (types.ts 타입 사용)

### 3. `src/services/ttsService.ts` (~400줄)
- [x] `generateNeural2TTS(text, voiceId, language, speed, pitch)`: Google Neural2 (Kie 경유)
- [x] `generateMicrosoftTTS(text, voiceId, language)`: Microsoft Edge TTS (무료 프록시)
- [x] `generateSuperSonicTTS(text, voiceId)`: SuperSonic (Kie 경유)
- [x] `generateChirp3HDTTS(text, voiceId)`: Chirp3 HD (Kie 경유)
- [x] `getAvailableVoices(engine, language)`: 엔진+언어별 음성 목록 (Neural2 11개, Microsoft 14개, SuperSonic 6개, Chirp3 5개)
- [x] `mergeAudioFiles(audioUrls)`: Web Audio API 기반 오디오 병합 → WAV Blob
- [x] `pollKieTtsTask(taskId, apiKey)`: Kie 표준 폴링 패턴 (recordInfo)
- [x] `audioBufferToWav(buffer)`: AudioBuffer → WAV 변환 유틸리티

### 4. `src/services/musicService.ts` (~330줄)
- [x] `generateMusic(config)`: Suno v4 (Kie 프록시 경유) → taskId 반환
- [x] `pollMusicStatus(taskId, signal, onProgress)`: 음악 생성 폴링 + 시뮬레이션 프로그레스 → `GeneratedMusic`
- [x] `getGenreList()`: 10개 장르 + 58개 서브장르 카탈로그
- [x] `analyzeMusicForScript(scriptText)`: Evolink Gemini로 대본 분석 → 장르/BPM/분위기 추천
- [x] `groupMusicByDate(tracks)`: 날짜별 그룹핑 유틸리티 → `MusicLibraryItem[]`

### 패턴 준수
- [x] 모든 fetch → `monitoredFetch` (apiService.ts) — CLAUDE.md 절대 규칙 준수
- [x] 모든 타입 → `../types.ts`에서 import (새 타입 추가 없음)
- [x] API 키 관리: 기존 패턴 (localStorage + sanitize)
- [x] 에러 처리: HTTP 상태 코드별 한국어 에러 메시지
- [x] 로깅: `logger` 시스템 사용 (info/success/error/warn)
- [x] `any` 타입 사용 0건
- [x] 한국어 주석, 영어 변수명 (CLAUDE.md 규칙 준수)

### 검증
- [x] TypeScript 컴파일 에러 0건 (4개 파일 모두 clean)
- [x] pre-existing 에러 2건 (EditRoomTab.tsx — 무관)

---

---

## 🟢 v4.5 UI 컴포넌트: Upload Tab + ImageVideo Tab (완료)

### `src/components/tabs/UploadTab.tsx` (~420줄)
- [x] YouTube 업로드 탭 메인 컴포넌트
- [x] 5단계 프로그레스: 인증 → 메타데이터 → 썸네일 → 설정 → 업로드
- [x] Green checkmarks (완료), Orange (현재), Gray (대기) 스텝 표시
- [x] Step 1 Auth: YouTube 연결 카드, 연결됨 뱃지, 연결/해제 토글
- [x] Step 2 Metadata: Gemini로 생성 뱃지, 직접 입력 전환, 재생성 버튼, 5개 제목 라디오, 직접 입력 필드, 설명 텍스트에리어
- [x] Step 3 Thumbnail: 업로드/선택 영역
- [x] Step 4 Settings: 공개/비공개/미등록, 예약 업로드 datetime, 아동용 콘텐츠 토글, 구독자 알림 토글
- [x] Step 5 Upload: 프로그레스 바, 상태 메시지, 완료 표시
- [x] uploadStore 연동 (currentStep, youtubeAuth, metadata, uploadSettings, isUploading, uploadProgress)

### `src/components/tabs/upload/OutputModeSelector.tsx` (~132줄)
- [x] 3개 출력 모드 카드 선택: MP4, SRT+이미지, SRT+영상
- [x] 선택된 모드 green border + 체크마크
- [x] 각 모드별 상세 설명 + 4개 세부사항 리스트
- [x] uploadStore.outputMode / setOutputMode 연동

### `src/components/tabs/ImageVideoTab.tsx` (~490줄)
- [x] 이미지/영상 생성 탭 메인 컴포넌트
- [x] 상단 이미지 생성 완료 상태 표시 (green text)
- [x] "장면/이미지 (N개)" 헤더
- [x] 액션 버튼: 장면 분석 실행 (orange), 이미지/영상 생성 드롭다운 (green gradient), 저장/열기 (purple)
- [x] 설정 바: 스타일 드롭다운, 스타일 프리뷰, 이미지 수 드롭다운, 카운트 입력, 단위 토글, 모델 드롭다운, 캐릭터 아이콘
- [x] Scene 카드: 장면 번호, 캐릭터 태그, 나레이션 텍스트, 이미지 프롬프트 (편집 가능), 동영상 프롬프트, 액션 버튼 (← 삭제 재생성 변형), 이미지 썸네일, 비디오 재생 버튼
- [x] projectStore 연동 (scenes, updateScene, removeScene, setScenes)
- [x] 핸들러 전면 연결 (2026-03-01):
  - [x] SceneCard 삭제 버튼 → removeScene(index) 연결
  - [x] SceneCard 재생성 버튼 → handleGenerateImage(id) 연결
  - [x] SceneCard 변형 버튼 → handleGenerateImage(id, feedback) 연결
  - [x] handleGenerateImage: generateSceneImage → persistImage → addCost 파이프라인
  - [x] handleBatchGenerateImages: 20개 동시 슬라이딩 윈도우 배치
  - [x] useVideoBatch 연결 (Grok HQ 6s/10s, Veo Fast, Veo Quality)
  - [x] "이미지/영상 생성" 드롭다운 메뉴 (이미지 일괄 + 4개 영상 옵션)
  - [x] 배치 진행바 (이미지/영상 공용, current/total + percent)

### 패턴 준수
- [x] dark theme (bg-gray-900), Tailwind CSS, TypeScript, functional components
- [x] Zustand store 연동 (uploadStore, projectStore)
- [x] 기존 v4.5 types.ts 타입 사용 (UploadStep, YouTubeAuthState, VideoMetadata, UploadSettings, OutputMode, Scene)
- [x] `any` 타입 사용 0건
- [x] 한국어 주석, 영어 변수명

---

## 🟢 v4.5 사운드 스튜디오 탭 컴포넌트 생성 (완료)

### 신규 디렉토리
- [x] `src/components/tabs/sound/` 서브 디렉토리 생성

### 1. `src/components/tabs/SoundStudioTab.tsx` (~149줄)
- [x] 메인 컨테이너 컴포넌트 (화자별 TTS / 음악 생성 섹션 토글)
- [x] 서브 탭: 설정 / 결과 (useSoundStudioStore activeSubTab 연동)
- [x] 헤더: "사운드 스튜디오" + TTS 엔진 안내, 이 음성 사용, 영상 음성: 미선택, 단일 음성으로 전환
- [x] `React.lazy` + `Suspense` 코드 스플리팅 (VoiceStudio, MusicStudio, AudioMerger, MusicLibrary)
- [x] 음악 생성 섹션: MusicStudio + MusicLibrary 2컬럼 레이아웃

### 2. `src/components/tabs/sound/VoiceStudio.tsx` (~223줄)
- [x] "Voice Studio" 헤더 + 화자 수 / 라인 수 배지
- [x] 화자 카드 행: 색상 아이콘, 이름, 라인수, 선택 체크마크
- [x] "대본 분할" 섹션: 구두점 / 글자수 토글, threshold 입력, 적용 버튼
- [x] 대본 라인 목록: 번호, 화자 태그 (색상), 텍스트, Ch 번호
- [x] 우측 패널: 선택된 화자 상세 설정
- [x] 음성 엔진 선택: Neural2 (1개), Chirp 3 HD (8개), Microsoft (1개), SuperSonic (1개)
- [x] Neural2 "다국어포인트 지원" 표시
- [x] 언어 선택: ko/en/ja
- [x] 음성 미리듣기: 확인(여), 소연(여), 민준(남) + 재생 버튼
- [x] 속도 / 피치 슬라이더
- [x] 하단: "대본 분할을 먼저 적용해주세요" 경고 바
- [x] 통계: 평균 X자, 예상 X:XX

### 3. `src/components/tabs/sound/MusicStudio.tsx` (~289줄)
- [x] 음악 설명 textarea (프롬프트)
- [x] "고급 설정" 토글 (접기/펼치기)
- [x] 장르 선택 (드롭다운 + 태그 추가/삭제 + 직접 추가)
- [x] 세부 장르 (선택한 장르 기반 동적 옵션)
- [x] 음악 타입: 보컬 / 인스트루멘탈 토글
- [x] 보컬 타입 + 보컬 성별 (태그 입력, 보컬 모드일 때만 표시)
- [x] 템포: BPM 슬라이더
- [x] "음악 생성" 버튼 (로딩 스피너 지원)
- [x] TagInput 재사용 서브컴포넌트

### 4. `src/components/tabs/sound/AudioMerger.tsx` (~244줄)
- [x] "오디오 병합" 헤더 — "모든 화자 음성을 하나로"
- [x] 화자별 오디오 카드: 이름, 총 길이, 완료 체크
- [x] "병합 완료!" 표시 (총 재생시간)
- [x] 파형 시각화 플레이스홀더
- [x] "대본 싱크 플레이어" + 라인 수 배지
- [x] 재생 버튼, 프로그레스 바, 시간 표시 (0:00 / X:XX)
- [x] 화자 필터 태그 (색상별)
- [x] 스크롤 가능한 라인별 표시: 화자 태그 + 텍스트 + 타임스탬프
- [x] "TTS 자막 자동 저장됨 (X개 세그먼트)" 상태 바

### 5. `src/components/tabs/sound/MusicLibrary.tsx` (~120줄)
- [x] 플레이어: 현재 트랙 이름, 재생시간, 재생/일시정지/이전/다음 컨트롤, 볼륨 슬라이더
- [x] "음악 라이브러리" 헤더 + 곡 수 배지
- [x] 검색 바
- [x] 필터 탭: 전체, 완료, 즐겨찾기
- [x] 그룹별 트랙 표시: 그룹 제목 + 트랙 수, 개별 트랙 재생 버튼 + 재생시간
- [x] 즐겨찾기 별표 표시

### 검증
- [x] 신규 5개 파일 TypeScript IDE 진단 에러 0건
- [x] 모든 import 경로 정확 (stores/soundStudioStore, types)
- [x] `any` 타입 사용 0건
- [x] 컴포넌트 크기 제한 준수 (149/223/289/244/120줄)
- [x] dark theme (bg-gray-900), Tailwind CSS, functional components
- [x] useSoundStudioStore Zustand 연동
- [x] 기존 v4.5 types.ts 타입 사용 (Speaker, ScriptLine, TTSEngine, TTSLanguage, MusicGenerationConfig, GeneratedMusic, MusicLibraryItem)

### 패턴 준수
- [x] ChannelAnalysisTab 동일 패턴: lazy + Suspense, store 연동, sub-tab 네비게이션
- [x] 한국어 주석, 영어 변수명 (CLAUDE.md 규칙 준수)

---

## 🟢 v4.5 편집실 탭 컴포넌트 생성 (완료, PDF 기반 리빌드 2026-02-28)

### 신규 디렉토리
- `src/components/tabs/editor/` — 편집실 하위 컴포넌트 4개

### 1. `src/components/tabs/EditRoomTab.tsx` (158줄)
- [x] 4개 뷰 전환: waveform, effects, subtitle, timeline
- [x] 상단 탭 (이미지 효과, 오버레이) + 파형 편집기 버튼
- [x] 뷰 네비게이션 (prev/next)
- [x] 우측 액션 버튼: 편집기, 파형 편집기, 취소, 저장, 저장 후 다음
- [x] 현재 뷰 인디케이터 배지
- [x] useEditorStore 연동
- [x] lazy + Suspense 코드 스플리팅

### 2. `src/components/tabs/editor/WaveformEditor.tsx` (158줄)
- [x] 파형 시각화 (화자별 색상 120바, 시간 눈금)
- [x] 재생/일시정지 컨트롤 + 속도 셀렉터 (0.5x~2x)
- [x] 타임코드 디스플레이 (MM:SS.ms)
- [x] 자막 표시/동기화 체크박스
- [x] 간격 채우기, 무음 제거 버튼
- [x] 무음 구간 제거 패널: 임계값/최소길이/끝간격 슬라이더 + 감지/제거
- [x] "원본 유지, 가상 타임코드 자동 조정" 안내 텍스트
- [x] 자막 목록 (검색, 자동 추적, 화자별 색상 점, 타임코드 뱃지, 편집/삭제)
- [x] Shift + 마우스 휠 스크롤 힌트
- [x] 상단: 이미지 동기화/저장/이펙터 효과 네비게이션 버튼

### 3. `src/components/tabs/editor/TimelineEditor.tsx` (157줄)
- [x] 이미지-자막 동기화 헤더 + 수동/자동 배치 모드 전환
- [x] 단계 표시: 프로젝트 설정 ✓ → 타임라인 생성
- [x] 4 모드 카드: 균등 분할, 고정 시간, 대본 챕터, 대사 매칭 (NEW 뱃지)
- [x] 성공/실패 통계 + 타임라인 재생성 (레인보우 그래디언트)
- [x] 시각적 타임라인: 줌 연동, 시간 눈금, 세그먼트 썸네일 블록
- [x] 오디오 범위 / 이미지 세그먼트 범례
- [x] 세그먼트 편집기: 썸네일, 이미지 번호, 자막 연결됨 뱃지, 확장 상세

### 4. `src/components/tabs/editor/EffectPresets.tsx` (142줄)
- [x] 이미지 미리보기 (장면 네비게이션 prev/next, 크게 보기)
- [x] 미리보기 툴바: 원장/크게/동시보기/효과적
- [x] 경고: "미리보기는 효과 프리셋이며, 실제 렌더링과 다를 수 있습니다"
- [x] 범위 설정: 첫 장면/끝 장면 드롭다운 + 체크마크
- [x] 적용 방식: 일괄 적용 / 개별 설정 카드
- [x] 팬&줌 프리셋 6x2 그리드 (빠른 생성~타임랩스)
- [x] 효과 선택: 기본(4개)/모션(6개)/스타일(7개)
- [x] 세부 설정 (줌/팬/페이드 슬라이더)

### 5. `src/components/tabs/editor/SubtitleStyleEditor.tsx` (166줄)
- [x] 가로/세로 오리엔테이션 토글
- [x] 가로/세로 동시 보기, 효과 비활성, 크게 보기, 현재 설정 세트 적용 버튼
- [x] 자막 오버레이 미리보기 (실시간 스타일 반영)
- [x] 재생 컨트롤: prev/play/next + 타임코드 + 볼륨
- [x] 스타일 편집: 5탭 (스타일/효과/제목/안전영역/로고)
- [x] 서브 탭: A 폰트/위치/색상
- [x] 폰트 설정: 드롭다운, 글자 크기/자간/줄 높이 슬라이더
- [x] "가나다라마바사 ABCD 1234" 폰트 미리보기
- [x] 텍스트 템플릿 (8개 프리셋): 카테고리 7탭, 검색, 폰트 고정/위치 고정
- [x] 템플릿 그리드: 기본 흰색, 반투명 검정, 노란 자막, 네온 그린 등

### 검증
- [x] useEditorStore Zustand 연동
- [x] dark theme + Tailwind CSS
- [x] 컴포넌트 300줄 이하 준수
- [x] Props 8개 이하 준수
- [x] `any` 타입 미사용

---

## 🟢 v4.5 CharacterMode/RemakeMode 비활성화 (완료)

### 수정 파일 (4개)
- [x] `src/components/modes/CharacterMode.tsx` — 전체 코드 주석처리, `export default function CharacterMode() { return null; }` 반환
- [x] `src/components/modes/RemakeMode.tsx` — 동일 처리
- [x] `src/components/modes/CharacterGenCard.tsx` — 동일 처리
- [x] `src/components/ConfigForm.tsx` — CHARACTER/REMAKE 탭 주석처리, 2탭 레이아웃(script, thumbnail)으로 축소

### App.tsx 관련 주석처리
- [x] `handleSaveDraft` 원본 코드 주석처리 → no-op 대체
- [x] REMAKE 모드 분기 코드 주석처리
- [x] CHARACTER 모드 분기 코드 주석처리
- [x] 모든 주석에 `[v4.5]`, `추후 복원 가능` 태그 부착

### 보존 원칙
- [x] 삭제 없음 — 모든 원본 코드 `/* === ORIGINAL ... START/END === */` 블록으로 보존
- [x] import 문 유지 (tree-shaking으로 번들 영향 없음)

---

## 🟢 v4.5 apiService.ts 키 관리 확장 (완료)

### 수정 파일 (2개)
- [x] `src/services/apiService.ts`
  - DEFAULT_EVOLINK_KEY, DEFAULT_YOUTUBE_API_KEY 상수 추가
  - `getEvolinkKey()`, `getYoutubeApiKey()` 함수 추가
  - `saveApiKeys()` 파라미터에 evolink, youtubeApiKey 추가
  - `getStoredKeys()` 반환값에 evolink, youtubeApiKey 추가

- [x] `src/components/ApiKeySettings.tsx`
  - Evolink AI 키 입력 섹션 추가
  - YouTube API 키 입력 섹션 추가
  - 저장 핸들러에 새 키 전달

---

## 🟢 v4.5 App.tsx 가로 와이드 탭 네비게이션 오버홀 (완료)

### 신규 import
- [x] `AppTab` 타입 from types.ts
- [x] `useNavigationStore` from stores/navigationStore
- [x] 6개 탭 컴포넌트 lazy import (ChannelAnalysisTab, ScriptWriterTab, SoundStudioTab, ImageVideoTab, EditRoomTab, UploadTab)

### 헤더 변경
- [x] 기존 단일행 v3.1 헤더 → 2행 v4.5 헤더
  - 상단 바: 사이드바 토글, 앱 타이틀(v4.5), CostDashboard, 피드백 버튼
  - 탭 네비게이션 바: 7탭 가로 스크롤, 활성 탭 하이라이트 (blue-600/20)
- [x] `fixed top-0` + `backdrop-blur-md` + `z-40`

### 탭 라우팅
- [x] TAB_CONFIG 배열 (7탭 정의: project, channel-analysis, script-writer, sound-studio, image-video, edit-room, upload)
- [x] TabFallback 로딩 컴포넌트
- [x] `<main>` 영역에 조건부 렌더링
  - 6개 신규 탭: `<Suspense>` + lazy 컴포넌트
  - project 탭: 기존 ConfigForm/Storyboard 유지
- [x] `pt-28` 패딩으로 고정 헤더 높이(14+11=25rem) 보정

### 검증
- [x] TypeScript 컴파일 에러 0건
- [x] VS Code 진단 에러 0건
- [x] 기존 프로젝트 탭 기능 100% 보존

---

## 📊 v4.5 전체 진행률

| 카테고리 | 작업 | 상태 |
|---------|------|------|
| 타입 정의 | types.ts v4.5 타입 50+ 추가 | ✅ 완료 |
| Zustand 스토어 | 6개 신규 (navigation, channel, script, sound, editor, upload) | ✅ 완료 |
| API 서비스 | 4개 신규 (evolink, youtube, tts, music) | ✅ 완료 |
| API 키 관리 | apiService.ts + ApiKeySettings.tsx 확장 | ✅ 완료 |
| 앱 네비게이션 | App.tsx 가로 와이드 7탭 시스템 | ✅ 완료 |
| 채널분석 탭 | ChannelAnalysisTab + KeywordLab + ChannelAnalysisRoom | ✅ 완료 |
| 대본작성 탭 | ScriptWriterTab + ScriptExpander + BenchmarkPanel + WizardSteps | ✅ 완료 |
| 사운드스튜디오 탭 | SoundStudioTab + VoiceStudio + MusicStudio + AudioMerger + MusicLibrary | ✅ 완료 |
| 이미지/영상 탭 | ImageVideoTab | ✅ 완료 |
| 편집실 탭 | EditRoomTab + WaveformEditor + TimelineEditor + EffectPresets + SubtitleStyleEditor | ✅ 완료 |
| 업로드 탭 | UploadTab + OutputModeSelector | ✅ 완료 |
| 모드 비활성화 | CharacterMode + RemakeMode + CharacterGenCard 주석처리 | ✅ 완료 |

### 신규 파일 총계: 26개
- 스토어: 6개
- 서비스: 4개
- 컴포넌트: 16개

### 수정된 기존 파일: 5개
- types.ts, apiService.ts, ApiKeySettings.tsx, ConfigForm.tsx, App.tsx

*마지막 업데이트: 2026-03-01 — ProjectSidebar 10-project 제한 제거*

---

## ProjectSidebar 리팩토링 (2026-03-01)

- [x] `getAllProjects()` → `getAllProjectSummaries()` 교체 (경량 목록 로드)
- [x] `projects` 상태 타입 `ProjectData[]` → `ProjectSummary[]` 변경
- [x] `MAX_PROJECTS = 10` 상수 및 관련 제한 로직 완전 제거
- [x] 프로젝트 클릭 시 `getProject(id)`로 풀 데이터 로드 후 `onSelectProject` 호출
- [x] 게이지 바: 프로젝트 수/10 → 실제 저장소 사용량(MB) 표시 (`getStorageEstimate()`)
- [x] 저장소 색상: green(<50%), orange(50-80%), red(>80%) + 80% 초과 시 경고 텍스트
- [x] "브라우저 성능 최적화 안내" 카드 제거
- [x] "전체 프로젝트 비우기 (일괄 삭제)" → "전체 삭제" 버튼 간소화
- [x] 로딩 중 프로젝트 카드에 `animate-pulse` 시각 피드백 추가
- [x] 프로젝트 카드에 `sceneCount` 정보 표시
- [x] TypeScript 에러 없음 확인 (기존 uiStore 에러는 무관)
*다음 작업: 사용자 테스트 + 실제 API 연동 검증*

---

## 🟢 프로젝트 저장소 무제한화 + 성능 최적화 (완료)

### 핵심 변경: 10개 하드코딩 제한 제거
- [x] `storageService.ts` 전면 개편: `MAX_PROJECTS = 10` 제거
- [x] IndexedDB v2 스키마: `project_summaries` 경량 스토어 추가
- [x] `getAllProjectSummaries()` API: 목록용 경량 데이터만 로드
- [x] `getStorageEstimate()` API: `navigator.storage.estimate()` 기반 용량 모니터링
- [x] `canCreateNewProject()`: 개수 기반 → 용량 기반(80%) 체크로 변경
- [x] `requestPersistentStorage()`: 브라우저에 데이터 영구 보존 요청
- [x] `saveProject()`: summary 자동 동기화 + QuotaExceededError 처리
- [x] v1→v2 자동 마이그레이션 (기존 프로젝트에서 summary 자동 생성)

### Base64 잔류 문제 해결
- [x] `imageStorageService.ts`: 3회 재시도 + 지수 백오프 추가
- [x] `persistAllSceneImages()`: Scene의 6개 이미지 필드 전체 마이그레이션
- [x] `projectStore.ts loadProject()`: 모든 base64 필드 Cloudinary 마이그레이션

### 자동저장 최적화
- [x] `useAutoSave.ts`: 디바운스 2초 → 5초
- [x] QuotaExceededError 감지 + uiStore 경고 플래그 연동
- [x] 변경 감지로 불필요한 저장 건너뛰기

### UI 업데이트
- [x] `ProjectSidebar.tsx`: 개수 게이지 → 용량 게이지 (MB 기반)
- [x] `ProjectDashboard.tsx`: summary 기반 + 페이지네이션 (20개/페이지)
- [x] `App.tsx`: 제한 메시지 → 용량 부족 메시지, persistent storage 요청

### 안전장치
- [x] `exportService.ts`: 대용량 프로젝트 내보내기 전 크기 검증
- [x] `costStore.ts`: 프로젝트 전환 시 비용 통계 리셋 보장
- [x] `uiStore.ts`: storageWarning 플래그 추가
- [x] `projectStore.ts`: _loadGeneration으로 비동기 업데이트 교차 방지

### types.ts 추가
- [x] `ProjectSummary` 인터페이스 (id, title, lastModified, mode, sceneCount 등)
- [x] `StorageEstimate` 인터페이스 (usedMB, totalMB, percent)

---

## 🟢 본능 기제 브라우저 이동: 채널분석 → 대본작성 (2026-03-01)

### UX 개선 — 본능 기제를 대본작성 탭으로 통합
- [x] `types.ts`: `ChannelAnalysisSubTab`에서 `'instinct-browser'` 제거
- [x] `ChannelAnalysisTab.tsx`: InstinctBrowser lazy import, SUB_TABS 항목, render 분기 삭제
- [x] `ScriptWriterTab.tsx`: `InputTab`에 `'instinct'` 추가, INPUT_TABS에 `🧠 본능 기제` 추가, lazy import + Suspense render
- [x] `channel/InstinctBrowser.tsx` → `script/InstinctBrowser.tsx` 이동
- [x] `channel/InstinctDetail.tsx` → `script/InstinctDetail.tsx` 이동
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공

---

## 🟢 채널분석 — 수집 영상 썸네일 갤러리 추가 (2026-03-01)

### UX 개선 — 분석된 영상 시각화
- [x] `ChannelAnalysisRoom.tsx`: "채널 스타일 클로닝" 카드와 "스타일 분석 결과" 카드 사이에 썸네일 갤러리 삽입
- [x] YouTube 썸네일 URL (`img.youtube.com/vi/{id}/mqdefault.jpg`) 활용, 16:9 비율 유지
- [x] 5열 반응형 그리드 (lg:5, md:4, sm:3, 기본:2)
- [x] 각 카드에 재생시간 배지, 제목(2줄 clamp), 조회수, 게시일 표기
- [x] 클릭 시 YouTube 원본 영상으로 새 탭 이동
- [x] `fmtViews()`, `fmtDate()` 헬퍼 추가
- [x] 지침서 복사 버튼 — 기존 `handleCopyPrompt()` 확인 (이미 작동 중)
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공 (1.55s)

---

## 🟢 대본작성 탭 전면 개편 (2026-03-01)

### 제거
- [x] AI 생성 탭 (좌우 분할 레이아웃 + 우측 위저드 Step1~4 전체)
- [x] `Step3SceneSplit` 로컬 컴포넌트 제거
- [x] `STEP_LABELS`, `FORMAT_BUTTONS`, `FORMAT_DESC` 상수 제거
- [x] `WizardStep1`, `WizardStep2`, `ScriptExpander` import 제거
- [x] `countScenesLocally` import 제거
- [x] 언어/장르/톤 선택 UI 및 state 제거 (AI 자동 감지)
- [x] `activeStep`, `handleStepClick`, `isStepComplete` 등 위저드 관련 로직 제거
- [x] `useMemo` import 제거 (Step3SceneSplit 전용이었음)

### 개선
- [x] 본능 기제를 **1번 탭**(기본 탭)으로 승격 — 가장 먼저 보임
- [x] 벤치마크를 **2번 탭**으로 승격 — 밑에 묻히지 않음
- [x] 상태 표시 바 추가: 선택된 본능 기제/채널 스타일/벤치마크를 탭 위에 항상 표시
- [x] 대본 입력 탭에 AI 생성 폼 통합: 제목 + 줄거리 + 콘텐츠 형식(롱폼/쇼츠) + AI 생성 버튼
- [x] AI 프롬프트에서 language/genre/tone 제거 — 제목/줄거리만으로 생성

### 새 탭 구조
- [x] 🧠 본능 기제 (기본) → 📊 벤치마크 → ✏️ 대본 입력 → 📁 파일 업로드 → 📄 최종 대본

### 결과
- [x] ScriptWriterTab 번들 크기: 34KB → 17KB (50% 감소)
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공 (1.50s)
- [x] **자동 단락 나누기 복원**: 롱폼/숏폼/나노 + 호흡중심/디테일중심 + 예상 컷수

### 2차 개편 — 좌우 분할 통합 레이아웃
- [x] 5개 탭 구조 폐지 → 좌우 분할 단일 화면으로 통합
- [x] **좌측**: AI 생성 폼(제목/줄거리/버튼) + 대본 편집 textarea + 파일 업로드 버튼 + 자동 단락 나누기
- [x] **우측**: 도구 패널 (본능 기제 | 벤치마크 탭)
- [x] 포맷 예시 대폭 강화: 각 포맷(롱폼/숏폼/나노)별 2~3개 구체적 예시 문장
- [x] 호흡 중심 vs 디테일 중심 설명 명확 분리: 각각 용도/컷수/적합 장르 명시
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공 (1.49s)

### 3차 수정 — UX 설명 보강
- [x] AI 생성 폼에 안내 문구 추가: "제목과 줄거리를 입력하면 AI가 완성된 대본을 생성... 본능 기제·채널 스타일·벤치마크 자동 반영"
- [x] "이 대본 선택" → "이 대본으로 이미지/영상 생성" + 하위 설명 "대본을 확정하고 장면별 이미지·영상 제작 단계로 이동"
- [x] 호흡 중심 vs 디테일 중심 예시 **완전 분리**: 동일 입력에 대해 호흡 중심(3문장→1컷) vs 디테일 중심(3문장→3컷)으로 다른 결과 표시
- [x] 예시 박스를 입력/결과 구분하여 가독성 개선
- [x] `tsc --noEmit`: 0 errors / `vite build`: 성공

### 4차 개편 — 세로 플로우 기반 UI 전면 재설계
- [x] 좌우 분할 구조 폐지 → 세로 단일 컬럼 플로우로 전면 전환
- [x] **Step 1 · 소재 준비**: 본능 기제/벤치마크를 아코디언 패널로 배치, 선택 상태 칩으로 표시
- [x] **Step 2 · 대본 작성**: AI 생성 폼 + 대본 편집 textarea (14행)
- [x] **Step 3 · 장면 분할**: 롱폼/숏폼/나노 + 호흡/디테일 + 예상 컷수
- [x] 헤더에 ① → ② → ③ 플로우 인디케이터 추가
- [x] "적용 중 → 🧠 본능 3개 📊 벤치마크 📡 채널명" 연결 표시 (패널 닫힌 상태)
- [x] 하단 풀폭 CTA 버튼 "대본 확정 → 이미지/영상 생성으로 이동"
- [x] `tsc --noEmit`: 0 errors / `vite build`: 성공 (1.45s)

### 5차 개편 — 글자수 입력 + 대본 확장 + 사운드 스튜디오 연결 + VoiceStudio 단락 편집
- [x] 롱폼/쇼츠 버튼 → 직접 글자수 입력(500~30,000자) + 예상 시간(분/초) 실시간 표시
- [x] `scriptWriterStore.ts`: `targetCharCount` 상태 추가 (기본값 5000)
- [x] AI 프롬프트에 "N자 분량 (약 M분)" 형식으로 정확한 목표 전달
- [x] 대본 textarea placeholder에서 "줄바꿈으로 단락을 나누면…" 혼동 문구 제거
- [x] 대본 textarea 우하단에 현재 글자수 + 예상 시간 실시간 표시
- [x] **ScriptExpander 복원**: 아코디언 패널로 Step 2에 통합 (대본 확장 기능)
- [x] **장면 분할 예시 상세화**: 축약 없이 전체 문장 + 결과 + 설명 표시, 토글 버튼으로 표시/숨김
- [x] **CTA 변경**: "이미지/영상 생성" → "사운드 스튜디오로 이동 → 나레이션 생성/편집"
- [x] 나레이션 안내 문구: "장면 분할은 영상 편집용이며, 나레이션은 ~다/~죠/~요 문장 단위로 자연스럽게 읽힙니다"
- [x] **soundStudioStore.ts**: `removeLine`, `addLineAfter`, `mergeLineWithNext` 액션 추가
- [x] **VoiceStudio.tsx**: 대본 분할 "적용" 버튼 실제 작동 (구두점/글자수 분할 로직 구현)
- [x] **VoiceStudio.tsx**: 라인별 편집(인라인 편집) / 추가 / 삭제 / 다음과 병합 기능 추가
- [x] **VoiceStudio.tsx**: scriptWriterStore에서 대본 자동 읽기 연결
- [x] `tsc --noEmit`: 0 errors / `vite build`: 성공 (1.48s)

### ScriptExpander 시간 추정 수정 + 유지 요소 비활성화
- [x] 나레이션 속도 350자/분 → 650자/분으로 수정 (5,000자 ≈ 7~8분 기준)
- [x] ScriptExpander.tsx: LENGTH_OPTIONS 시간 정보 전체 수정 (5천자→약 7~8분, 1만자→약 15분 등)
- [x] ScriptWriterTab.tsx: estimateTime() 함수 동일 기준(650자/분)으로 통일
- [x] ScriptExpander.tsx: "확장 시 유지할 요소" UI + 관련 코드 전체 주석 처리
- [x] `tsc --noEmit`: 0 errors / `vite build`: 성공

### 파일 불러오기 다중 포맷 지원 (TXT, PDF, CSV, Excel, RTF)
- [x] `pdfjs-dist`, `papaparse`, `xlsx` npm 패키지 설치
- [x] `@types/papaparse` TypeScript 타입 선언 설치
- [x] `src/services/fileParserService.ts` 신규 생성 — 확장자별 자동 파서 선택
  - TXT/SRT/MD: FileReader.readAsText
  - PDF: pdfjs-dist (페이지별 텍스트 추출)
  - CSV: papaparse (헤더 포함 행/열 → 텍스트)
  - Excel (xlsx/xls): SheetJS (시트별 CSV 변환)
  - RTF: 정규식 기반 RTF 태그 스트리핑 (유니코드/한국어 지원)
- [x] ScriptWriterTab.tsx: `handleFileUpload` async 전환, parseFileToText() 사용
- [x] ScriptWriterTab.tsx: accept 속성 `.txt,.srt,.md,.pdf,.csv,.xlsx,.xls,.rtf`로 확장
- [x] ScriptWriterTab.tsx: 버튼에 지원 포맷 안내 "(TXT, PDF, CSV, Excel, RTF)" 표시
- [x] ScriptWriterTab.tsx: 파일 로딩 중 스피너 + 에러 메시지 표시
- [x] PDF worker, papaparse, xlsx 모두 별도 chunk로 lazy 로드 (번들 최적화)
- [x] `tsc --noEmit`: 0 errors / `vite build`: 성공 (119 modules, 37 chunks)

---

## 🟢 캐릭터 스타일 미리보기 썸네일 생성 & UI 적용 (완료)

### 작업 내용
CHARACTER_STYLES 100개 스타일의 이모지 표시 → AI 생성 썸네일 이미지로 교체

### 변경 파일
| 파일 | 변경 |
|------|------|
| `scripts/generate-style-previews.mjs` | **신규** — 배치 이미지 생성 스크립트 (Laozhang API, 10 동시, 3회 재시도) |
| `src/public/style-previews/` | **신규** — 101개 jpg (base + 5cat × 20items) |
| `src/components/CharacterTwistLab.tsx` | **수정** — StyleThumbnail 컴포넌트 추가, 이모지→썸네일 전환, emoji 폴백, max-h-48→max-h-64 |

### 검증
- [x] 101개 이미지 생성 완료 (base.jpg + 100 스타일)
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공, dist/style-previews/ 포함 확인
- [x] 이미지 로드 실패 시 emoji 폴백 정상 (onError → err state)
- [x] constants.ts 수정 없음 (런타임 인덱스 경로 매핑)

---

## 🟢 TTS 엔진 리팩토링 — 3개 삭제 + Supertonic 2 추가 (완료)

### 배경
5개 TTS 엔진 중 3개(Neural2, SuperSonic, Chirp 3 HD)가 Kie API에서 공식 미확인/가짜 모델.
확인된 2개(Microsoft Edge TTS, ElevenLabs)만 남기고, Supertone 사의 Supertonic 2를 브라우저 로컬 엔진으로 추가.

### 수정/신규 파일

| 파일 | 변경 |
|------|------|
| `src/types.ts` | TTSEngine 타입: `'neural2'\|'chirp3hd'\|'supersonic'` 삭제, `'supertonic'` 추가 |
| `src/services/ttsService.ts` | NEURAL2/SUPERSONIC/CHIRP3HD 음성 카탈로그+함수 삭제, SUPERTONIC_VOICES(10개) + generateSupertonicTTS 추가, getAvailableVoices switch 업데이트 |
| `src/services/supertonicService.ts` | **신규** — 브라우저 로컬 TTS 서비스 (HuggingFace ONNX 로드, WebGPU/WASM, Cache API) |
| `src/services/supertonicHelper.js` | **신규 (vendor)** — supertone-inc/supertonic helper.js (TextToSpeech, ONNX, WAV 인코딩) |
| `src/components/tabs/sound/VoiceStudio.tsx` | TTS_ENGINES 3→3, 삭제 엔진 import/switch 제거, supertonic UI(배지, 로딩 진행률, 설명 패널) 추가 |
| `src/components/tabs/SoundStudioTab.tsx` | TTS_ENGINE_LABELS 5→3, 헤더 "5가지"→"3가지" |
| `src/stores/soundStudioStore.ts` | 기본 ttsEngine: `'chirp3hd'` → `'microsoft'` |
| `src/package.json` | `onnxruntime-web` 의존성 추가 |
| `src/vite.config.ts` | `optimizeDeps.exclude: ['onnxruntime-web']` 추가 |

### 최종 엔진 구성 (3개)
- Microsoft Edge TTS — 무료 프록시 API, 14개 음성
- ElevenLabs — Kie API 경유, 30개 음성
- Supertonic 2 — 브라우저 로컬 (ONNX), 10개 음성, API 키/비용 불필요

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공

---

## 🟢 멀티 캐릭터 업로드 모드 복원 + Evolink AI 분석 (완료)

### 배경
ImageVideoTab에 캐릭터 업로드 기능 구현 — 최대 5개 캐릭터 이미지 업로드, Evolink Gemini 3.1 Pro 자동 분석, 이미지 생성 시 멀티 레퍼런스 전달.

### 수정/신규 파일

| 파일 | 변경 |
|------|------|
| `src/types.ts` | `CharacterReference` 인터페이스 추가, `ProjectConfig.characters` 필드 추가 |
| `src/services/characterAnalysisService.ts` | **신규** — Evolink Gemini 3.1 Pro 캐릭터 분석 서비스 |
| `src/components/CharacterUploadPanel.tsx` | **신규** — 멀티 캐릭터 업로드/관리 UI 패널 |
| `src/services/gemini/imageGeneration.ts` | `charImg` → `characterImages` 배열 지원 |
| `src/services/VideoGenService.ts` | 멀티 referenceImages 하위호환 |
| `src/components/tabs/ImageVideoTab.tsx` | CharacterUploadPanel 통합 |
| `src/App.tsx` | generateSceneImage 멀티캐릭터 배열 전달 |
| `src/components/modes/ScriptMode.tsx` | 단일→배열 변환 |

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공

---

## 🟢 자막 템플릿 140개 확장 (완료)

### 배경
편집실 자막 템플릿 16개 → 140개로 확장. 7개 카테고리 × 20개, 45개 폰트 고르게 사용.

### 수정/신규 파일

| 파일 | 변경 |
|------|------|
| `src/types.ts` | `SubtitleTemplate.category` 타입: `anime`/`custom` 제거, `color`/`variety`/`nobg` 추가 |
| `src/constants/subtitleTemplates.ts` | **신규** — 140개 템플릿 상수 + 카테고리 탭 정의, `base()` 헬퍼 |
| `src/components/tabs/editor/SubtitleStyleEditor.tsx` | 인라인 TEMPLATES → 외부 import, 카테고리 탭 교체, 그리드 5열/max-h-60 |

### 카테고리 구성 (7개)
- 기본(20) · 컬러(20) · 스타일(20) · 예능/바라이어티(20) · 감성/시네마(20) · 시네마틱(20) · 배경없음(20)

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.33s 성공

---

## 🟢 편집실 탭 이름 변경 + 폰트 weight 감사/수정 (완료)

### 배경
편집실 오버레이 탭 이름을 "자막디자인"으로 변경하고, 140개 자막 템플릿의 fontWeight가 각 폰트의 실제 지원 weights와 일치하는지 전수 감사.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/EditRoomTab.tsx` | 탭 label `오버레이` → `자막디자인`, icon `🎭` → `✏️`, viewLabel 동일 변경 |
| `src/constants/subtitleTemplates.ts` | `basic-11` (둥근 고딕, NanumSquareRound) fontWeight 700→400 수정 (해당 폰트 400만 지원) |

### 감사 결과
- 140개 템플릿 중 fontWeight 불일치 **1건** 발견 및 수정 (basic-11)
- 나머지 139개는 base() 기본값 700 또는 명시적 fontWeight 모두 해당 폰트 지원 범위 내 확인

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.42s 성공

---

## 🟢 자막 폰트 굵기 선택 UI 추가 (완료)

### 배경
폰트마다 지원하는 굵기(weight)가 다양한데 사용자가 선택할 수 없었음. 복수 weight 지원 폰트일 때 굵기 버튼 그룹 노출.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/editor/SubtitleStyleEditor.tsx` | `updateWeight` 콜백 추가, 폰트 선택 아래에 굵기 버튼 그룹 UI 추가 (weight 2개 이상일 때만 표시) |

### 동작
- 현재 폰트의 `weights[]` 배열이 2개 이상이면 굵기 선택 버튼 표시
- 단일 weight 폰트(Do Hyeon, Jua 등)는 자동 숨김
- 라벨: 300=가늘게, 400=보통, 500=중간, 600=약간굵게, 700=굵게, 800=아주굵게, 900=최대굵기
- 각 버튼에 실제 폰트+굵기 적용으로 미리보기 가능

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.47s 성공

---

## 🟢 자막 텍스트 애니메이션 프리셋 추가 (완료)

### 배경
자막 미리보기가 정적이어서 실제 영상에서의 자막 연출을 확인하기 어려웠음. 30개 애니메이션 프리셋을 제공하여 다양한 자막 효과를 미리보기에서 바로 확인 가능.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/editor/SubtitleStyleEditor.tsx` | `ANIM_PRESETS` 31개(없음 포함) + `ANIM_KEYFRAMES` 30개 @keyframes 정의 + `animId`/`animKey` 상태 + 4열 그리드 선택 UI + "다시 재생" 버튼 + 미리보기 적용 + 템플릿 선택 시 초기화 |

### 프리셋 구성 (30개)
- **단조로운 입장 (7)**: 페이드 인, 아래서 등장, 위에서 등장, 좌/우 슬라이드, 줌 인/아웃
- **중간 루프 (7)**: 펄스, 숨쉬기, 둥실, 흔들기, 스윙, 타이핑, 깜빡임
- **화려한 입장 (8)**: 바운스 인, 탄성 인, 가로/세로 뒤집기, 회전 등장, 팡 등장, 광속 등장, 깜짝상자
- **화려한 루프 (8)**: 네온 깜빡, 글리치, 무지개, 고무줄, 젤리, 심장박동, 짜잔!, 글로우 펄스

### 동작
- 좌측 패널에 "템플릿 | 애니메이션" 탭 구조 도입 (`leftTab` 상태)
- 템플릿 탭: 기존 스타일 프리셋 그리드 유지 (5열)
- 애니메이션 탭: 5열 그리드 버튼으로 프리셋 선택, 선택 즉시 미리보기에 적용
- "다시 재생" 버튼으로 입장 애니메이션 재실행 (`animKey` 카운터로 DOM 재생성)
- 템플릿 변경 시 애니메이션 자동 초기화 (`none`)
- 우측 패널은 순수 스타일 속성(폰트/색상/그림자 등)만 유지
- `subAnim-` 접두어로 CSS 네이밍 충돌 방지
- **세부 조정 컨트롤** (프리셋 선택 시 하단에 표시):
  - 속도: 0.1초~5초 슬라이더 (프리셋 기본값으로 초기화)
  - 지연: 0초~3초 슬라이더
  - 반복: 1회/2회/3회/무한 버튼
- `AnimPreset` 인터페이스로 구조화 (`keyframe`/`dur`/`ease`/`fill`/`iter` 개별 필드)
- 미리보기에 `animation` shorthand 대신 개별 `animation-*` 속성 적용으로 동적 오버라이드 지원
- **네온 글로우** (우측 스타일 패널, 그림자 아래 배치):
  - 토글 on/off + 색상 피커 (기본 #00ffff)
  - 퍼짐: 1~40px 슬라이더 — text-shadow 3중 레이어 (Npx, 2Npx, 4Npx)
  - 불투명도: 10~100% 슬라이더
  - 기존 템플릿 그림자/사용자 그림자와 `computedShadow`에서 자동 합성
- **템플릿/애니메이션 그리드 높이 확대** — 우측 패널과 하단 정렬:
  - 템플릿 그리드: max-h 240px → 420px
  - 애니메이션 그리드: max-h 176px → 320px

### 검증
- [x] `tsc --noEmit`: SubtitleStyleEditor 관련 에러 0
- [x] `vite build`: 3.51s 성공

---

## 🟢 폰트 라이브러리 대폭 확장: 45 → 85 → 145개 (완료)

### 배경
자막 편집기에서 선택할 수 있는 폰트가 45종으로 부족. 사용자 요청으로 가독성 좋고, 인기 있고, 트렌드에 맞는 무료 폰트를 대폭 추가.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/constants/fontLibrary.ts` | 45개 → 85개 (1차 +40) → 145개 (2차 +60). Google Fonts 41개 + 눈누 103개 + Local 1개 |

### 1차 추가 (40종, 85개로 확장)
- 고딕 8: 나눔고딕, 라인시드, 넥슨 Lv1/Lv2, KoPub 돋움, KBO 다이아고딕, 레페리포인트, 강원교육모두
- 명조 3: 마루부리, KoPub 바탕, 카페24 클래식타입
- 제목 14: 어그로체, 잘난고딕, 롯데리아 찹밥/딱붙어, 리아체, 태나다, 양진, 삼립호빵, 빙그레, 코트라 희망, 태백, MBC 1961, 카페24 모야모야, 메이플스토리
- 손글씨 9: 카페24 심플해/고운밤, KCC 은영, 온글잎 의연, IM 혜민, 오뮤 다예쁨, 마포 꽃섬/다카포, 동글
- 아트 4: 귀여운체, 구기, 기랑해랑, 흑백사진
- 픽셀 2: 던파 비트비트, DOS 고딕

### 2차 추가 (60종, 145개로 확장)

**Google Fonts (9종):**
- 나눔고딕코딩, 베이글팻원, 가석원, 모이라이원, 그란디플로라원, 디필레이아, 제주고딕, 제주명조, 제주한라산

**눈누 고딕 (10종):**
- 해피니스산스, 조선굴림, 서울남산, 서울한강, 페이퍼로지, 티웨이항공, 페이북, 스포카한산스네오, 프리젠테이션, 민산스

**눈누 명조 (7종):**
- 북크명조, 조선궁서, 경기바탕, 선바탕, 수성바탕, 조선일보명조, 열린명조

**눈누 제목/임팩트 (16종):**
- 학교안심 가을소풍/돌담, 배민 을지로체/을지로 오래오래, ONE 모바일POP/제목, 가비아 봄바람/솔미, 경기제목, 잉크립퀴드, YES24, 티몬몬소리, 미생체, 필승고딕, 웨이브 파도, 빙그레 따옴

**눈누 손글씨 (11종):**
- 마포 배낭여행/홍대프리덤, 카페24 슈퍼매직/동동/쑥쑥/단정해, 나눔 바른펜, 신동엽 손글씨, 교보 손글씨, 학교안심 우주/붓펜

**눈누 아트 (5종):**
- TT투게더, 상상체, 타닥타닥, 엘리스 디지털배움, 도베마요

**눈누 픽셀 (2종):**
- 갈무리11, 갈무리9

### CDN URL 검증
- 60개 신규 폰트의 모든 CDN URL을 `curl -sI` HEAD 요청으로 HTTP 200 확인
- Google Fonts 9개는 `googleId`로 로드 (CDN 검증 불필요)
- 눈누 51개는 `cdn.jsdelivr.net/gh/projectnoonnu/` CDN에서 실제 파일 존재 확인

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.38s 성공

---

## HTML 내보내기 자막 폰트 포함 (2026-03-01)

### 문제
- HTML 내보내기 시 자막 폰트 정보가 전혀 포함되지 않음
- `SubtitleStyleEditor`에서 선택한 폰트(Google Fonts/눈누 CDN)가 export HTML에서 로드 안됨
- 자막 데이터 자체도 내보내기에 포함되지 않아 장면 카드에 자막 미표시

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/services/fontLoaderService.ts` | `generateFontCssTag(entry)` 함수 추가 — FontEntry → HTML 문자열 반환 |
| `src/services/exportService.ts` | editorStore에서 subtitleStyle/subtitles 수집, 폰트 CSS 생성, buildExportHtml에 전달 |
| `src/templates/exportHtml.ts` | 시그니처 확장, `<head>` 폰트 CSS 주입, 장면 카드에 자막 오버레이 렌더 |

### 구현 내용
1. **`generateFontCssTag()`**: Google Fonts는 `<link>` 태그, 눈누는 `<style>@font-face</style>` 문자열 반환
2. **exportService**: `useEditorStore`에서 `subtitleStyle`/`subtitles` 가져와 `getFontByFamily()`로 폰트 조회 → CSS 생성
3. **exportHtml**: Pretendard 링크 바로 뒤에 폰트 CSS 주입, `projectData`에 `_subtitleStyle`/`_subtitles` 포함, 장면 카드 이미지 위에 스타일 적용된 자막 오버레이 표시

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.32s 성공

---

## 🟢 자막 템플릿 10배 고도화 — 전면 재설계 (완료, 2026-03-01)

### 배경
기존 140개 템플릿이 ~30종 폰트만 사용하고, 효과도 단조로운 색상+외곽선+기본 글로우 변형에 그침. 실제 예능·방송·영화 자막과 비교하면 다양성이 크게 부족. 10개 병렬 리서치 에이전트 동원.

### 리서치 범위 (10개 병렬)
1. 한국 예능 자막 스타일 (무한도전, 런닝맨, 나혼산, 놀뭐, 전참시, 신서유기, 1박2일, 아는형님, 슈돌, 삼시세끼)
2. 일본 テロップ 자막 스타일
3. YouTube/TikTok 최신 자막 트렌드
4. 프로 방송 그래픽
5. 고급 CSS text-shadow 레시피 (20종)
6. 창의적 텍스트 이펙트 (20종)
7. 폰트-카테고리 매칭
8. 컬러 팔레트 디자인
9. 한국 프로그램별 CSS 재현 (10개 쇼)
10. 장르별 이펙트 레시피 (25종)

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/constants/subtitleTemplates.ts` | **전면 재작성** — 15+ 섀도우 헬퍼 함수 + 140개 템플릿 완전 교체 |

### 핵심 변경
- **섀도우 헬퍼 함수 15+개**: GLOW, GLOW_SOFT, SHADOW_3D, DEEP_3D, ULTRA_3D, NEON, MOTION_R, GLITCH, LONG_SHADOW, M_GOLD, M_CHROME, M_ROSE, M_BRONZE, EMBOSS, LETTERPRESS, FIRE, ICE, HOLO
- **폰트 다양성**: ~30종 → 100+ 고유 폰트 (145개 라이브러리 중 70%+ 활용)
- **메탈릭 계열**: 골드(M_GOLD), 크롬(M_CHROME), 로즈골드(M_ROSE), 브론즈(M_BRONZE) — 6~8층 3D 입체감
- **네온 튜브**: 5중 레이어 글로우 (inner→outer 점진적 opacity 감소)
- **사이버펑크**: RGB 글리치(-2px/+2px 색수차), CRT 터미널, 신스웨이브
- **자연 테마**: 불/마그마, 얼음/크리스탈, 홀로그래픽, 수채화, 오로라
- **한국 예능 재현**: 무한도전(골드3D), 런닝맨(동적모션), 나혼산(따뜻글로우), 놀뭐(크리에이티브), 전참시(클린박스), 신서유기(게임네온), 1박2일(아웃도어), 아는형님(칠판), 슈돌(파스텔), 삼시세끼(러스틱)
- **영화 장르**: 호러(핏빛번짐), 로맨스(핑크글로우), 코미디(팡팡바운스), 액션(강철), SF(사이버), 느와르(연기), 판타지(마법진), 사극(고전)
- **리서치 아티팩트 20개** 생성 후 전부 삭제 정리

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.68s 성공

---

## 🟢 피드백 스크린샷 첨부 기능 (완료, 2026-03-01)

### 배경
피드백 모달에서 텍스트만 전송 가능했음. 버그 신고 시 스크린샷 첨부로 정확한 상황 전달 필요.

### 수정 파일
| 파일 | 변경 |
|------|------|
| `src/types.ts` | `FeedbackScreenshot` 인터페이스 추가, `FeedbackData`에 `screenshots?` 필드 추가 |
| `src/components/FeedbackModal.tsx` | 이미지 첨부 UI (파일선택/드래그앤드롭/Ctrl+V 붙여넣기), 미리보기 썸네일, 삭제 버튼, 최대 3장/5MB 제한 |
| `docs/GAS_FEEDBACK_HANDLER.js` | **신규** — Google Apps Script 코드: Base64→Drive 저장→시트 하이퍼링크 기록 |

### 클라이언트 동작
- 파일 선택 (클릭), 드래그앤드롭, Ctrl+V 붙여넣기 3가지 방식 지원
- 이미지만 허용 (PNG/JPG/GIF), 5MB 이하, 최대 3장
- Base64 data URI로 변환 → FeedbackData.screenshots에 포함 → GAS로 전송
- 미리보기 80x80 썸네일 + 호버 시 삭제 버튼 + 파일명 표시
- 제출 버튼에 첨부 장수 표시

### GAS 동작
- `doPost()`: JSON 파싱 → screenshots 있으면 Drive 폴더에 파일 저장 → 공유 링크 생성 → 시트에 행 추가
- 스크린샷 셀에 RichText 하이퍼링크 ("사진 1", "사진 2"...) 적용
- 시트 미존재 시 자동 생성 + 헤더 스타일링

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.62s 성공

---

## 🟢 사운드 스튜디오 전수 검사 + 버그 수정 (완료, 2026-03-01)

### 배경
사운드 스튜디오(TTS 나레이션 + 음악 생성)의 모든 컴포넌트/서비스를 병렬 리뷰 에이전트 3개로 정밀 검수. HIGH 5건 + MEDIUM 13건 발견 후 즉시 수정.

### 검수 범위 (8개 파일)
- SoundStudioTab.tsx, VoiceStudio.tsx, AudioMerger.tsx, WaveformEditor.tsx
- MusicStudio.tsx, MusicLibrary.tsx, ttsService.ts, musicService.ts

### 수정 파일
| 파일 | 수정 |
|------|------|
| `src/components/tabs/SoundStudioTab.tsx` | 결과/파형 탭 이동 시 유효성 검사 (대본 없음, 음성 미선택, Microsoft 엔진 경고) |
| `src/components/tabs/sound/AudioMerger.tsx` | 더블클릭 레이스컨디션 방지, AudioContext try/finally close, blob URL 누수 방지, play/pause 비동기 디싱크 수정 |
| `src/components/tabs/sound/WaveformEditor.tsx` | 무음 제거 시 음수 타임코드 방지(Math.max), AudioContext close 보장, 무음감지 동시실행 방지(isDetecting), autoTrack 스크롤 구현, play/pause 디싱크 수정 |
| `src/components/tabs/sound/VoiceStudio.tsx` | unmount 시 Audio+speechSynthesis 정리 + blob URL 해제, ElevenLabs 프리뷰 speed 이중적용 수정(API 1.0 + playbackRate) |
| `src/components/tabs/sound/MusicLibrary.tsx` | unmount 시 audio 정리, 트랙 변경 시 더블 play() 방지(prevTrackRef), play 성공 후 상태 설정 |
| `src/services/ttsService.ts` | Supertonic 일본어 매핑 'en'→'ko' 수정 (한국어가 발음 체계 더 유사) |

### 발견 이슈 요약 (HIGH+MEDIUM)
- **HIGH**: AudioMerger 더블클릭 레이스컨디션, WaveformEditor 음수 타임코드, blob URL 메모리 누수, ElevenLabs 프리뷰 speed 이중적용
- **MEDIUM**: AudioContext 에러 경로 미close, 무음감지 동시실행, autoTrack 데드코드, play/pause 비동기 디싱크, MusicLibrary 더블 play, Supertonic 일본어 매핑, 탭 이동 무검증

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 3.74s 성공

---

## Session: VoiceStudio Typecast 스타일 대본 직접 입력 + 줄별 감정/속도 컨트롤 (2026-03-04)

### 개요
VoiceStudio에 Typecast 스타일 per-line 감정/속도 컨트롤과 대본 직접 입력 영역을 추가.

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/components/tabs/sound/VoiceStudio.tsx` | splitBySentenceEndings 임포트 추가, directScript 상태 + handleApplyDirectScript 핸들러, 대본 직접 입력 textarea UI (lines===0일 때 표시), 줄별 감정 select + 속도 input + 글자수 표시 (always visible), 정보 배너에 크레딧 추정 표시 |

### 핵심 변경 사항
1. **대본 직접 입력**: lines가 비어있을 때 textarea 표시, 종결어미 기반 자동 분할(splitBySentenceEndings)로 라인 생성
2. **줄별 감정/속도 컨트롤**: 각 스크립트 라인 우측에 감정 select(7종) + 속도 number input + 글자수 표시 — 항상 표시(hover 불필요)
3. **크레딧 추정**: 정보 배너에 총 글자수 × 2 크레딧 표시

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 4.27s 성공

---

## #9 — Extract shared thumbnail utilities into thumbnailUtils.ts

### 개요
ThumbnailStudioTab과 InlineThumbnailStudio에 동일하게 존재하던 YouTube 썸네일 유틸리티 함수를 공유 모듈로 추출하여 코드 중복 제거.

### 수정/신규 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/utils/thumbnailUtils.ts` | **신규** — `extractYouTubeVideoId()`, `fetchYouTubeThumbnail()` 공유 유틸리티 |
| `src/components/tabs/ThumbnailStudioTab.tsx` | 로컬 `extractYouTubeVideoId`, `fetchYouTubeThumbnail` 제거, `thumbnailUtils`에서 임포트 |
| `src/components/tabs/upload/InlineThumbnailStudio.tsx` | 동일하게 로컬 함수 제거, `thumbnailUtils`에서 임포트 |

### 핵심 변경 사항
1. **extractYouTubeVideoId**: youtube.com/watch, youtu.be, embed, shorts, v/ 형식 지원 — 기존 로직 100% 동일
2. **fetchYouTubeThumbnail**: maxresdefault → sddefault → hqdefault 순으로 시도, placeholder 감지 — 기존 로직 100% 동일
3. 두 컴포넌트 모두 기존 동작 변경 없이 임포트 경로만 변경

### 검증
- [x] `tsc --noEmit`: 기존 에러 외 신규 에러 없음
- [x] 중복 코드 약 30줄 × 2 → 공유 모듈 1개로 통합

---

## #10 채널분석 결과를 대본작성 + 업로드 메타데이터에 연동

### Part A: 채널 스타일 → ScriptWriterTab
- [x] Step 3 (대본 작성) 영역에 `채널 스타일 적용됨` 배지 추가
- [x] 클릭 시 말투/구조/도입패턴/마무리/키워드 요약 토글 표시
- [x] channelGuideline 없으면 배지 숨김 (graceful degradation)
- [x] 기존 기능(프롬프트 반영, Step 1 적용 중 배너) 변경 없음

### Part B: 키워드 태그 → Upload 메타데이터
- [x] StepMetadata 컴포넌트에 channelAnalysisStore 연동
- [x] tags(KeywordTag[]) + guideline.keywords + guideline.topics 통합 추천 태그 구성
- [x] 비공개 태그 섹션 아래에 클릭형 추천 태그 칩 UI 추가
- [x] 이미 추가된 태그는 취소선+비활성 처리
- [x] 채널분석 데이터 없으면 섹션 숨김 (graceful degradation)

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/ScriptWriterTab.tsx` | showChannelGuide 상태 추가, 채널 스타일 배지+토글 패널 삽입 |
| `src/components/tabs/UploadTab.tsx` | channelAnalysisStore 임포트, suggestedTags 계산, 추천 태그 칩 UI 삽입 |

### 검증
- [x] `tsc --noEmit`: ScriptWriterTab, UploadTab 모두 에러 없음
- [x] 기존 에러(TypecastEditor.tsx) 외 신규 에러 없음

---

## CharacterUploadPanel: 드래그 앤 드롭 + 분석 결과 표시 (2026-03-05)

### 개요
- **Part A**: 캐릭터 이미지 드래그 앤 드롭 업로드 지원 추가
- **Part B**: 캐릭터 분석 결과(analysisResult)를 카드 아래에 직접 표시 (기존: tooltip title 속성에만 숨겨져 있었음)

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/CharacterUploadPanel.tsx` | isDragging/expandedAnalysisId 상태 추가, dragCounter 기반 드래그 이벤트 핸들링, 드래그 오버레이 UI, 분석 결과 클릭 펼치기/접기 UI |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Session: StoryboardPanel 그리드/리스트 뷰 토글 (2026-03-05)

### 개요
스토리보드 패널에 그리드/리스트 뷰 전환 기능 추가. 기본값은 그리드 뷰(3열)로 많은 장면을 컴팩트하게 표시. 리스트 뷰는 기존 상세 카드 유지.

### 변경 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/imagevideo/StoryboardPanel.tsx` | viewMode 상태 추가, GridSceneCard 컴포넌트 신규, 그리드/리스트 토글 버튼 UI, SceneCard 이미지 클릭 시 Lightbox 연동 |

### 핵심 변경 사항
- `viewMode` 상태 (`'grid' | 'list'`, 기본값 `'grid'`)
- `GridSceneCard` 컴포넌트: aspect-video 이미지, 생성/Grok/Veo/삭제 버튼 노출, 나레이션 2줄 요약
- 헤더에 그리드/리스트 토글 버튼 (orange-600 active 스타일)
- 그리드 뷰: `grid-cols-3 gap-3` 레이아웃
- SceneCard(리스트 뷰) 이미지에 `useUIStore.getState().openLightbox()` 클릭 핸들러 추가
- GridSceneCard 이미지 영역에도 Lightbox 클릭 연동

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Session: Character Analysis Result → Image Prompt + Shot Size Auto-Rotation (2026-03-05)

### 개요
캐릭터 분석 결과(analysisResult)가 이미지 생성 프롬프트에 전달되지 않던 문제 해결 및 장면별 샷 사이즈 자동 로테이션 추가.

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/services/gemini/imageGeneration.ts` | `generateSceneImage()` 시그니처에 `characterAnalysisResult`, `sceneIndex` 파라미터 추가, `SHOT_ROTATION` 상수 추가, 샷 사이즈 미지정 시 sceneIndex 기반 자동 로테이션, analysisResult를 `[CHARACTER VISUAL REFERENCE]` 블록으로 프롬프트 주입 |
| `src/components/tabs/imagevideo/StoryboardPanel.tsx` | `handleGenerateImage()` 에서 characters의 analysisResult 합산 후 전달, sceneIndex 전달 |
| `src/App.tsx` | `handleGenerateImage()` 에서 characters의 analysisResult 합산 후 전달, sceneIndex 전달 |
| `src/components/modes/ScriptMode.tsx` | `handleStylePreview()` 의 intro/highlight 호출에 새 파라미터 자리표시자 추가 |

### 핵심 변경 사항
- `SHOT_ROTATION`: `['medium shot', 'close-up', 'wide shot', 'medium close-up', 'establishing shot', 'over-the-shoulder']` 6개 샷 순환
- `scene.shotSize` 존재 시 기존 로직 유지 (가중치 1.5), 미지정 시 `sceneIndex % 6`으로 자동 할당 (가중치 1.3)
- `characterAnalysisResult`가 있으면 `[CHARACTER VISUAL REFERENCE]` 블록으로 subjectPrompt에 주입 → 일관된 캐릭터 렌더링
- 모든 4개 호출부(App.tsx, StoryboardPanel.tsx, ScriptMode.tsx x2) 업데이트 완료

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Session: Evolink pollEvolinkTask MEDIUM 이슈 3건 수정 (2026-03-05)

### 개요
evolinkService.ts의 태스크 폴링 함수에서 절대 시간 제한 부재, 에러 응답 미로깅, failed 상태 에러 메시지 누락 문제를 수정.

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/services/evolinkService.ts` | MEDIUM 1: `maxTimeoutMs` 파라미터 추가 (기본 5분), wall-clock 기반 절대 시간 초과 검사. MEDIUM 2: 폴링 HTTP 오류 시 `parseEvolinkError` 호출 + `logger.warn` 로깅, catch 블록 네트워크 오류도 로깅. MEDIUM 3: `EvolinkTaskDetail`에 `error`/`error_message` 옵션 필드 추가, failed 상태에서 에러 사유 추출 + `logger.error` 로깅. |
| `src/services/VideoGenService.ts` | `pollEvolinkVeoTask()` 호출에 `maxTimeoutMs: 600_000` (10분) 전달 — 비디오 태스크 특성에 맞춘 시간 제한. |

### 핵심 변경 사항
- 절대 시간 제한(`maxTimeoutMs`)이 `maxAttempts`와 독립적으로 적용되어 느린 네트워크에서도 무한 폴링 방지
- 이미지 폴링: 기본 5분, 비디오 폴링: 10분 (API 문서 권장 값 준수)
- 모든 에러 경로에서 상태 코드 + 응답 본문이 logger로 기록됨
- failed 상태에서 API가 반환하는 에러 메시지(`error_message`, `error` 필드)를 예외 메시지에 포함

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Session: 사운드 스튜디오 파형 미표시 버그 수정 (2026-03-05)

### 개요
나레이션 생성 후 재생 시 파형이 표시되지 않는 버그를 수정. TypecastEditor 하단 플레이어의 정적 회색 바를 실제 오디오 파형으로 교체하고, WaveformEditor의 duration 경쟁 상태를 해결.

### 수정/신규 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/components/tabs/sound/MiniWaveform.tsx` | **신규** — 미니 파형 캔버스 컴포넌트. AudioContext로 오디오 URL 디코딩, peak 기반 파형 렌더링, 재생 진행 색상 변환, 클릭 탐색 지원 |
| `src/components/tabs/sound/TypecastEditor.tsx` | 하단 플레이어의 정적 `bg-gray-600` div 바를 `MiniWaveform` 컴포넌트로 교체. 오디오 데이터 기반 실제 파형 표시 + 클릭 탐색 |
| `src/components/tabs/sound/WaveformEditor.tsx` | (1) `decodeWaveform` 완료 시 `d.duration`으로 `totalDuration` 즉시 설정 — `loadedmetadata` 이벤트 경쟁 상태 방지. (2) `durationchange` 이벤트 리스너 추가. (3) `audio.readyState >= 1` 체크로 이미 로드된 메타데이터 감지. (4) 디코딩 실패 시 `console.warn` 로깅 추가 |

### 핵심 변경 사항
- TypecastEditor 하단 플레이어: 1줄당 1개의 정적 회색 바 -> 실제 오디오 파형 120바 캔버스 렌더링
- 재생 진행에 따라 시안/보라 그라디언트로 색상 변화, 클릭으로 재생 위치 탐색 가능
- WaveformEditor: `totalDuration` 값이 0으로 유지되는 경쟁 상태 3중 방어 (decodeWaveform duration / durationchange 이벤트 / readyState 체크)
- 디코딩 실패 시 에러가 더 이상 무시되지 않고 콘솔에 경고 로깅

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Session: Sound Studio 다운로드 모달 "문장별로 나누기" 버그 수정 (2026-03-05)

### 문제
- "선택 문장" + "문장별로 나누기" 조합으로 다운로드 시 정상 동작하지 않음
- `dlSelectedLines`가 빈 Set으로 초기화되어 "선택 문장" 전환 시 선택된 문장이 0개 → 에러
- ZIP 다운로드 시 `URL.revokeObjectURL`이 `a.click()` 직후 동기 호출되어 브라우저가 다운로드 시작 전 URL 해제

### 수정 내용

| 파일 | 변경 |
|------|------|
| `src/components/tabs/sound/TypecastEditor.tsx` | (1) "선택 문장" 전환 시 `dlSelectedLines`가 비어있으면 전체 라인을 자동 선택. (2) 선택 문장 모드에서 선택 0개일 때 다운로드 버튼 비활성화 + 에러 메시지 "다운로드할 문장을 선택해주세요". (3) ZIP 다운로드 시 `URL.revokeObjectURL`을 `setTimeout(..., 3000)`으로 지연 호출하여 다운로드 실패 방지. |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## GridSceneCard 오디오 재생 기능 추가 (2026-03-05)

### 개요
스토리보드 그리드 뷰에서 장면 오디오 재생 기능 추가. 기존에는 리스트 뷰에서만 오디오 재생이 가능했음.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `src/components/tabs/imagevideo/StoryboardPanel.tsx` | (1) `GridSceneCardProps`에 `onPlaySceneAudio`, `playingSceneId`, `sceneProgress` 추가. (2) 그리드 카드 이미지 영역 좌측 하단에 재생/일시정지 오버레이 버튼 추가 (hover 시 표시, 재생 중이면 항상 표시). (3) 재생 중 카드 하단에 cyan 프로그레스 바 표시. (4) 오디오 duration 정보 카드 하단에 표시. (5) 그리드 렌더링 시 `handlePlaySceneAudio`, `playingSceneId`, `sceneProgress` props 전달. (6) 리스트 뷰 및 전체 오디오 플레이어의 play/pause 이모지(Unicode)를 SVG 아이콘으로 교체. |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Veo 영상 생성 파이프라인에 문화적 맥락(Cultural Context) 전달 (2026-03-05)

### 개요
Veo 영상 생성 시 대본 분석에서 추출된 문화적/역사적 맥락(시대, 문화권, 지역)이 전달되지 않아 영상이 기본 중국풍 비주얼로 생성되는 문제 수정. `constructVeoPrompt()`에 cultural context를 주입하여 정확한 문화적 시각화 보장.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `src/types.ts` | `VideoTaskParams`에 `culturalContext?: string` 필드 추가 |
| `src/services/VideoGenService.ts` | (1) `constructVeoPrompt()`에 `culturalContext` 파라미터 추가, 프롬프트 앞에 `[Cultural Context: ...]` 태그 삽입. (2) `createApimartVeoTask()`에 `culturalContext` 파라미터 추가 및 전달. (3) `createEvolinkVeoTask()`에서 `params.culturalContext`를 `constructVeoPrompt()`에 전달. |
| `src/hooks/useVideoBatch.ts` | `processScene()`에서 per-scene 필드(`sceneCulture`, `sceneEra`, `sceneLocation`) 우선, 없으면 `config.globalContext` JSON에서 `culturalBackground`, `timePeriod`, `specificLocation` 추출하여 `culturalContext` 문자열 구성 후 `VideoTaskParams`에 전달. |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Issue #6: splitScene 텍스트 분배 + mergeScene 추가 (2026-03-05)

### 개요
1. splitScene이 새 장면의 scriptText를 비워둬서 나레이션이 배분되지 않던 문제 수정.
2. 메인 스토리보드에 장면 병합(merge) 기능이 없던 문제 해결.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `src/stores/projectStore.ts` | (1) `splitScene`: 원본 scriptText를 문장 단위로 분할하여 앞/뒤 장면에 배분 (midpoint 기준). (2) `mergeScene(index)` 신규 추가: 현재+다음 장면 나레이션/프롬프트 결합, 이미지/비디오 우선순위 적용, 다음 장면 제거. (3) `ProjectStore` 인터페이스에 `mergeScene` 타입 추가. |
| `src/components/StoryboardScene.tsx` | 장면 헤더 버튼 바에 병합 버튼 추가 (split 버튼 옆). 장면이 1개뿐이면 disabled. |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## Issue #4: 장면별 레퍼런스 이미지 업로드 기능 추가 (2026-03-05)

### 개요
Scene 타입에 `referenceImage` 필드가 존재하지만 UI/기능이 없던 문제 해결. 스토리보드 리스트 뷰에서 장면별 레퍼런스 이미지를 업로드하고, 이미지 생성 시 참조 이미지로 활용하는 기능 구현.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `src/components/StoryboardScene.tsx` | (1) `refImageInputRef` 추가 (hidden file input). (2) `handleReferenceImageUpload()`: 파일 선택 시 base64 변환 후 `scene.referenceImage`에 저장. (3) `handleClearReferenceImage()`: 레퍼런스 제거. (4) 이미지 영역 아래에 레퍼런스 첨부 버튼(클립 SVG 아이콘) + 썸네일 표시 UI 추가 (첨부 시 amber 하이라이트, 썸네일 클릭 시 라이트박스, hover 시 삭제 버튼). |
| `src/services/gemini/imageGeneration.ts` | (1) `scene.referenceImage`가 존재하면 `finalCharImages` 배열에 추가하여 모든 이미지 생성 API(Evolink/Laozhang/Kie)에 참조 이미지로 전달. (2) 레퍼런스 이미지 존재 시 subjectPrompt에 참조 이미지 활용 힌트 추가. |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## 클립보드 복사 피드백 Toast 추가 (2026-03-05)

### 개요
앱 전체에서 `navigator.clipboard.writeText()` 호출 후 사용자에게 피드백이 없던 복사 버튼들에 `showToast()` 알림을 추가.

### 수정 내용

| 파일 | 변경 |
|------|------|
| `src/components/CharacterUploadPanel.tsx` | `showToast` import 추가, CopyBtn의 onClick에 `.then(() => showToast('클립보드에 복사되었습니다.'))` 추가 |
| `src/components/tabs/ScriptWriterTab.tsx` | 원본 대본 복사 버튼에 `showToast('대본이 클립보드에 복사되었습니다.')` 추가, 스타일 적용본 복사 버튼에 `showToast('스타일 적용본이 클립보드에 복사되었습니다.')` 추가 |
| `src/components/tabs/sound/MusicStudio.tsx` | `showToast` import 추가, 가사 복사 버튼에 `.then(() => showToast('클립보드에 복사되었습니다.'))` 추가 |
| `src/components/tabs/channel/KeywordLab.tsx` | `showToast` import 추가, handleCopyTags에 `showToast('클립보드에 복사되었습니다.')` 추가 |
| `src/components/tabs/channel/ChannelAnalysisRoom.tsx` | handleCopyPrompt의 try/catch 양쪽에 `showToast('스타일 프롬프트가 클립보드에 복사되었습니다.')` 추가 |

### 검증
- [x] `tsc --noEmit`: 0 errors

---

## 나레이션 오디오 새로고침 시 유실 문제 해결 (2026-03-06)

### 개요
TTS 나레이션 오디오가 blob: URL로 저장되어 새로고침 시 유실되던 BUG #10 근본 해결.
IndexedDB `audio-blobs` 스토어에 오디오 Blob을 영속화하고, 프로젝트 로드 시 새 blob URL로 복원.

### 수정/신규 파일

| 파일 | 변경 |
|------|------|
| `src/services/storageService.ts` | DB v5→v6, `audio-blobs` 오브젝트 스토어 추가, `SavedAudioBlob` 타입 export, `dbPromise` export, `deleteProject()`에 audio 클린업 추가 |
| `src/services/audioStorageService.ts` | **신규**: `persistProjectAudio()`, `restoreProjectAudio()`, `deleteProjectAudio()` |
| `src/stores/projectStore.ts` | `loadProject()`: IDB에서 오디오 복원 → scenes audioUrl/mergedAudioUrl 교체 → soundStudioStore lines 재생성 |
| `src/hooks/useAutoSave.ts` | 저장 후 `persistProjectAudio()` fire-and-forget 호출 |

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공 (4.12s)

---

## 편집실 크게 미리보기: 모션 효과 + 자막 스타일 적용 (2026-03-06)

### 개요
편집실의 `ScenePreviewPanel`(크게 미리보기)에서 이미지 모션 효과와 스타일이 적용된 자막을 확인할 수 있도록 개선.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/EditRoomTab.tsx` | ScenePreviewPanel에 모션 효과 CSS 키프레임 + 팬/줌/모션 애니메이션 적용, globalSubtitleStyle 기반 자막 렌더링 (폰트/색상/크기/그림자/위치/애니메이션) |

### 상세
- **모션 효과**: SceneMediaPreview.tsx와 동일한 CSS 키프레임 + 함수로 이미지에 panZoom/motion 애니메이션 적용
- **자막 스타일**: globalSubtitleStyle.template + per-scene styleOverride → CSS 변환 (fontFamily, fontSize, color, textShadow, outline, positionY 등)
- **자막 애니메이션**: 28개 애니메이션 프리셋 (fadeIn, bounceIn, pulse 등) 지원
- **자막 위치**: positionY (% from bottom) 반영

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공 (4.43s)

---

## 스토리보드 영상 즉시 확인 (2026-03-06)

### 개요
영상 생성 완료 후 스토리보드 카드에서 이미지만 표시되던 문제 수정. 이제 영상이 있는 장면은 자세히 보기 없이도 카드에서 바로 영상을 확인 가능.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/imagevideo/StoryboardPanel.tsx` | SceneCard(리스트뷰): videoUrl 있으면 `<video>` 표시 (hover to play, poster=imageUrl), GridSceneCard(그리드뷰): 동일하게 `<video>` 우선 표시 |

### 동작
- 영상이 있는 장면: `<video>` 태그로 표시 (muted, loop, hover 시 자동 재생)
- 영상이 없는 장면: 기존대로 `<img>` 표시
- 우측 상단 "영상" 배지로 영상 완료 상태 표시
- 리스트뷰: 기존의 "영상 완료" 텍스트 라벨 제거 (영상 자체가 보이므로 불필요)

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공

---

## 편집실 미리보기: 영상 장면 미반영 수정 (2026-03-06)

### 개요
편집실 크게 미리보기에서 스토리보드에서 영상으로 생성된 장면이 이미지만 표시되던 버그 수정.
원인: `activeScene?.imageUrl` 조건이 `videoUrl`보다 먼저 평가되어 항상 이미지만 표시.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/components/tabs/EditRoomTab.tsx` | videoUrl 우선 표시 (video > image 조건 순서 변경), img에 남은 video 속성 제거, 필름스트립에 영상 인디케이터 추가 |

### 검증
- [x] `tsc --noEmit`: 0 errors
- [x] `vite build`: 성공

---

## 대본 작성 자동 임시저장 — 페이지 리로드 시 작업 복원 (2026-03-10, #36)

### 개요
서비스워커/캐시 갱신으로 인한 페이지 리로드 시 대본 작성 탭의 입력 내용이 모두 사라지는 문제 해결.
`scriptWriterStore`의 핵심 입력값을 localStorage(`SCRIPT_WRITER_DRAFT`)에 자동 저장하고, 페이지 로드 시 자동 복원.

### 수정 파일

| 파일 | 변경 |
|------|------|
| `src/stores/scriptWriterStore.ts` | localStorage 자동 임시저장/복원 로직 추가 (loadDraft, saveDraft, clearDraft), clearPreviousContent/reset 시 드래프트 삭제, Zustand subscribe로 상태 변경마다 저장 |

### 검증
- [x] `tsc --noEmit`: 0 errors

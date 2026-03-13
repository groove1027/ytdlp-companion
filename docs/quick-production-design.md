# Quick Production — 상세 설계서

> **영상 분석실 10개 버전 → 나레이션 + 자막 + 영상 원클릭 완성**
>
> 작성일: 2026-03-10
> 상태: 설계 완료, 구현 대기

---

## 1. 목표

사용자가 영상 분석실(VideoAnalysisRoom)에서 AI가 생성한 10개 리메이크 버전 중 하나를 선택하면,
**나레이션 음성 + 자막 템플릿 + 영상 조립**이 자동으로 완료되어 MP4가 바로 나오는 파이프라인.

```
현재:  10개 버전 → [복사/SRT/HTML] → 끝 (수동으로 편집실 이동)
목표:  10개 버전 → 하나 선택 → ⚡ 퀵 프로덕션 → MP4 완성
```

---

## 2. 현재 인프라 분석

### 2.1 이미 있는 것 (재활용 가능)

| 기능 | 파일 | 핵심 함수/인터페이스 | 비고 |
|------|------|---------------------|------|
| **FFmpeg 영상 조립** | `ffmpegService.ts` | `composeMp4(ComposeMp4Options)` | 장면+나레이션+자막+BGM+트랜지션+라우드니스 전부 처리 |
| **TTS (Typecast)** | `typecastService.ts` | `generateTypecastTTS(text, options)` | 한국어 특화, 감정 제어, 유료, max 2000자/요청 |
| **TTS (Supertonic)** | `ttsService.ts` | `generateSupertonicTTS(text, voiceId, lang, speed)` | 무료, 브라우저 ONNX, 5개 언어 |
| **자막 템플릿** | `subtitleTemplates.ts` | 20+ 프리셋 (네온, 메탈, 글로우 등) | SubtitleStyle 타입 |
| **자막 렌더링** | `subtitleRenderer.ts` | 비디오 위 자막 래스터화 | composeMp4 내부에서 사용 |
| **오디오 믹싱** | `ffmpegService.ts` | BGM 더킹, 라우드니스 정규화 | BgmConfig, LoudnessNormConfig |
| **프레임 추출** | `VideoAnalysisRoom.tsx` | `extractVideoFrames()` | 2초 간격, base64/blob URL |
| **Cloudinary 업로드** | `uploadService.ts` | `uploadMediaToHosting(file)` | 영상/이미지 호스팅 |

### 2.2 composeMp4 입력 인터페이스 (기존)

```typescript
interface ComposeMp4Options {
  timeline: UnifiedSceneTiming[];   // 장면별 시작/끝/자막 타이밍
  scenes: { id: string; imageUrl?: string; videoUrl?: string }[];
  narrationLines: { sceneId?: string; audioUrl?: string; startTime?: number }[];
  subtitleStyle?: SubtitleStyle | null;
  bgmConfig?: BgmConfig;
  loudnessNorm?: LoudnessNormConfig;
  sceneTransitions?: Record<string, SceneTransitionConfig>;
  fps?: number;
  width?: number;
  height?: number;
  videoBitrateMbps?: number;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;   // 취소 지원
}

interface UnifiedSceneTiming {
  sceneId: string;
  sceneIndex: number;
  imageStartTime: number;
  imageEndTime: number;
  imageDuration: number;
  subtitleSegments: {
    lineId: string;
    text: string;
    startTime: number;
    endTime: number;
  }[];
  effectPreset: string;
  motionEffect?: string;
  anchorX?: number;
  anchorY?: number;
}
```

### 2.3 VideoSceneRow (분석실 출력 데이터)

```typescript
interface VideoSceneRow {
  cutNum: number;
  mode: string;            // "N" (나레이션) | "S" (원본대사) | "A" (원본액션)
  audioContent: string;    // N→나레이션 텍스트, S/A→원본 오디오 설명
  effectSub: string;       // 화면에 표시할 효과자막
  duration: string;        // "4.0초" 형식
  videoDirection: string;  // 화면 지시 (줌인, 클로즈업 등)
  timecodeSource: string;  // "00:03~00:07" (원본 영상 내 구간)
  // 이하 레거시 필드
  timeline: string;
  sourceTimeline: string;
  dialogue: string;
  sceneDesc: string;
}
```

### 2.4 핵심 제약 조건

| 제약 | 영향 | 대응 |
|------|------|------|
| **YouTube 입력 = 원본 파일 없음** | 타임코드 기반 컷 편집 불가 | 추출된 프레임 이미지로 슬라이드쇼 생성 |
| **파일 업로드 = 원본 파일 있음** | FFmpeg로 타임코드 컷 분할 가능 | 진짜 리메이크 영상 생성 |
| **Typecast API max 2000자/요청** | 긴 나레이션은 청킹 필요 | `splitTextForTTS()` 기존 함수 활용 |
| **FFmpeg WASM 메모리** | 5분+ 영상은 메모리 부담 | 장면별 개별 인코딩 후 연결 |
| **스낵(snack) 프리셋 테이블 구조 다름** | 모드 N/S/A 구분 없음 | 별도 변환 로직 또는 Phase 2에서 지원 |

---

## 3. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    VideoAnalysisRoom                         │
│                                                              │
│  버전 1 [복사][SRT][HTML][편집실][⚡제작하기]                    │
│  버전 2 [복사][SRT][HTML][편집실][⚡제작하기]                    │
│  버전 3 [복사][SRT][HTML][편집실][⚡제작하기]  ← 클릭           │
│  ...                                                         │
└──────────────────────────┬──────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│              QuickProductionModal (Step 1: 설정)              │
│                                                               │
│  🎙️ 보이스:  [Typecast 여성A ▶] [Supertonic 남성M1 ▶]         │
│  🎨 자막:    [심플] [네온] [시네마] [뉴스] [커스텀]               │
│  🎬 화질:    [720p] [1080p]                                   │
│  🎵 BGM:    [없음] [자동] [직접 업로드]                          │
│                                                               │
│              [⚡ 제작 시작]                                     │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│          QuickProductionProgress (Step 2: 자동 처리)           │
│                                                               │
│  Phase 1: 장면 데이터 변환          ✓ 완료 (0.1초)              │
│  Phase 2: 나레이션 TTS 생성         ◎ 3/8 씬 완료 (병렬 처리)   │
│  Phase 3: 소스 영상 준비            ○ 대기                      │
│  Phase 4: 자막 타이밍 계산          ○ 대기                      │
│  Phase 5: MP4 렌더링               ○ 대기                      │
│                                                               │
│  ████████████░░░░░░░░░░ 42%     경과 0:45 / 예상 1:50         │
│                                                               │
│              [취소]                                            │
└──────────────────────────┬───────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────┐
│          QuickProductionResult (Step 3: 완성)                  │
│                                                               │
│  ┌────────────────────────────────────┐                       │
│  │        ▶ 최종 영상 미리보기         │                       │
│  │          (인라인 비디오 플레이어)     │                       │
│  └────────────────────────────────────┘                       │
│                                                               │
│  총 길이: 2분 34초 | 나레이션 8컷 | 자막 14개 | 1080p           │
│                                                               │
│  [💾 MP4 다운로드]  [📝 SRT 다운로드]  [✏️ 편집실에서 미세조정]   │
│  [🔄 다른 버전으로 다시 제작]                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 상세 데이터 흐름

### 4.1 Phase 1: 장면 데이터 변환 (즉시)

**입력**: `VideoVersionItem` (선택된 버전)
**출력**: `ProductionScene[]` (정규화된 장면 배열)

```typescript
interface ProductionScene {
  id: string;                // "cut-1", "cut-2", ...
  index: number;
  mode: 'N' | 'S' | 'A';
  narrationText: string;     // mode=N일 때 TTS로 읽을 텍스트
  effectSubtitle: string;    // 화면 표시용 자막
  targetDuration: number;    // AI가 제안한 시간 (초)
  sourceTimecode: {          // 원본 영상 내 구간
    start: number;           // 초 단위
    end: number;
  } | null;
  direction: string;         // 화면 지시 (Ken Burns 힌트)
}
```

**변환 로직**:
```
VideoSceneRow → ProductionScene:

1. mode 정규화:
   - "N", "N(나레이션)", "나레이션" → 'N'
   - "S", "S(원본 대사)", "대사" → 'S'
   - "A", "A(원본 액션)", "액션" → 'A'
   - 그 외 → 'N' (기본값)

2. narrationText 추출:
   - mode=N → audioContent 그대로 (TTS 텍스트)
   - mode=S/A → "" (원본 오디오 사용, TTS 불필요)

3. targetDuration 파싱:
   - "4.0초" → 4.0
   - "~5초" → 5.0
   - 빈 값 → 3.0 (기본값)

4. sourceTimecode 파싱:
   - "00:03~00:07" → { start: 3, end: 7 }
   - "1:23~1:45" → { start: 83, end: 105 }
   - 빈 값 → null
```

### 4.2 Phase 2: 나레이션 TTS 생성 (30초~2분)

**입력**: `ProductionScene[]` 중 mode='N'인 씬들 + TTS 설정
**출력**: `Map<sceneId, NarrationResult>`

```typescript
interface NarrationResult {
  audioUrl: string;        // blob URL
  actualDuration: number;  // 실제 오디오 길이 (초)
}
```

**처리 흐름**:
```
1. mode=N인 씬 필터링 → narrationScenes[]

2. 씬별 TTS 생성 (최대 3개 병렬 — API 부하 방지):
   for each narrationScene:
     a. text = scene.narrationText
     b. 텍스트 길이 체크:
        - ≤ 2000자: 단일 요청
        - > 2000자: splitTextForTTS()로 청킹 → 순차 생성 → concat
     c. TTS 엔진 호출:
        - Typecast: generateTypecastTTS(text, { voiceId, speed, emotion })
        - Supertonic: generateSupertonicTTS(text, voiceId, lang, speed)
     d. 결과 audioUrl + 실제 duration 측정

3. duration 조정 판정:
   for each narrationScene:
     targetDur = scene.targetDuration
     actualDur = narrationResult.actualDuration
     ratio = actualDur / targetDur

     if ratio ≤ 1.0:
       // 나레이션이 타겟보다 짧음 → 타겟 유지 (끝에 여백)
       finalDuration = targetDur

     else if ratio ≤ 1.3:
       // 약간 초과 → 나레이션 속도 올리기 (최대 1.3배)
       // 재생성 불필요: <audio>.playbackRate 조정 또는 FFmpeg atempo 필터
       finalDuration = targetDur
       speedAdjust = ratio

     else:
       // 많이 초과 → 장면 시간 연장 (나레이션에 맞춤)
       finalDuration = actualDur
       speedAdjust = 1.0
```

**병렬 처리 전략**:
```typescript
// 최대 3개 동시 TTS 생성 (Typecast API 부하 방지)
const CONCURRENCY = 3;
const results = new Map<string, NarrationResult>();

for (let i = 0; i < narrationScenes.length; i += CONCURRENCY) {
  const batch = narrationScenes.slice(i, i + CONCURRENCY);
  const batchResults = await Promise.allSettled(
    batch.map(scene => generateTTS(scene))
  );
  // fulfilled → results에 추가, rejected → 에러 수집
}
```

**에러 처리**:
- 개별 씬 TTS 실패 → 해당 씬만 무음 처리 + 경고 표시 (전체 중단 X)
- 전체 실패 → "나레이션 생성 실패" 에러 + 자막만으로 계속할지 묻기
- API 키 미설정 → Supertonic(무료)으로 자동 폴백

### 4.3 Phase 3: 소스 영상 준비 (0~60초)

**두 가지 경로** (입력 모드에 따라):

#### A. 파일 업로드 경로 (원본 있음)

```
1. 원본 비디오 File 객체 또는 Cloudinary URL 확보
2. FFmpeg WASM 로드
3. 씬별 소스 타임코드로 영상 세그먼트 추출:

   for each scene:
     if scene.sourceTimecode:
       ffmpeg -i original.mp4 -ss {start} -to {end} -c copy segment_{id}.mp4
     else:
       // 타임코드 없는 씬 → 해당 시점의 프레임을 정지 이미지로 사용
       // 또는 앞뒤 씬 타임코드로 추정

4. mode별 오디오 처리:
   - mode=N: 세그먼트 영상의 오디오 음소거 (나레이션으로 대체)
   - mode=S: 세그먼트 영상의 오디오 유지 (원본 대사)
   - mode=A: 세그먼트 영상의 오디오 유지 (원본 액션 사운드)

출력: scenes[i].videoUrl = blob URL of segment
```

#### B. YouTube 경로 (원본 없음)

```
1. 이미 추출된 프레임 이미지 배열: VideoTimedFrame[] (2초 간격)
2. 씬별 타임코드에 가장 가까운 프레임 매칭:

   for each scene:
     startSec = scene.sourceTimecode?.start || (scene.index * 3)
     endSec = scene.sourceTimecode?.end || (startSec + scene.targetDuration)

     // 해당 구간의 프레임들 수집 (2초 간격이므로 보통 1~4장)
     matchedFrames = frames.filter(f => f.timeSec >= startSec && f.timeSec <= endSec)

     if matchedFrames.length === 0:
       // 가장 가까운 프레임 1장 사용
       matchedFrames = [findClosestFrame(frames, startSec)]

3. 프레임 → 장면 소스:
   - 1장: 정지 이미지 + Ken Burns 효과 (direction 파싱하여 자동 설정)
   - 2+장: 프레임 슬라이드쇼 (크로스 페이드)

출력: scenes[i].imageUrl = 프레임 이미지 URL
```

**direction → Ken Burns 매핑 테이블**:
```
화면 지시 키워드        →  motionEffect    anchorX  anchorY
"줌인", "확대"         →  "zoom-in"       50       50
"줌아웃", "축소"       →  "zoom-out"      50       50
"클로즈업", "얼굴"     →  "zoom-in"       50       30
"팬 우측", "오른쪽"    →  "pan-right"     0        50
"팬 좌측", "왼쪽"      →  "pan-left"      100      50
"전체", "와이드"       →  "zoom-out"      50       50
(기본값)               →  "slow"          50       50
```

### 4.4 Phase 4: 자막 타이밍 계산 (즉시)

**입력**: `ProductionScene[]` + 각 씬의 finalDuration
**출력**: `UnifiedSceneTiming[]`

```
누적 시간 계산:

cumulativeTime = 0

for each scene:
  timing = {
    sceneId: scene.id,
    sceneIndex: scene.index,
    imageStartTime: cumulativeTime,
    imageEndTime: cumulativeTime + scene.finalDuration,
    imageDuration: scene.finalDuration,
    subtitleSegments: [],
    effectPreset: mapDirectionToPreset(scene.direction),
    motionEffect: mapDirectionToMotion(scene.direction),
  }

  // 효과자막이 있으면 자막 세그먼트 생성
  if scene.effectSubtitle:
    text = scene.effectSubtitle

    // 긴 자막은 분할 (15자 이상이면 2줄로)
    lines = splitSubtitleText(text, 15)

    if lines.length === 1:
      timing.subtitleSegments.push({
        lineId: `${scene.id}-sub-0`,
        text: lines[0],
        startTime: cumulativeTime + 0.3,
        endTime: cumulativeTime + scene.finalDuration - 0.3,
      })
    else:
      // 여러 줄: 균등 분할
      perLine = (scene.finalDuration - 0.6) / lines.length
      for (j, line) in lines:
        timing.subtitleSegments.push({
          lineId: `${scene.id}-sub-${j}`,
          text: line,
          startTime: cumulativeTime + 0.3 + j * perLine,
          endTime: cumulativeTime + 0.3 + (j + 1) * perLine,
        })

  // mode=N인 씬: 나레이션 텍스트도 하단 자막으로 추가 (선택)
  if scene.mode === 'N' && config.showNarrationSubtitle:
    // 나레이션 텍스트를 자연스러운 단위로 분할
    narrationSegments = splitNarrationForSubtitle(scene.narrationText, scene.finalDuration)
    timing.subtitleSegments.push(...narrationSegments)

  cumulativeTime += scene.finalDuration
```

### 4.5 Phase 5: MP4 렌더링 (30초~3분)

**기존 `composeMp4()` 호출**:

```typescript
const result = await composeMp4({
  timeline: unifiedTimeline,
  scenes: sceneSourceMap,
  narrationLines: narrationMap,
  subtitleStyle: selectedSubtitleStyle,
  bgmConfig: bgmConfig || undefined,
  loudnessNorm: { targetLufs: -14, truePeakDbtp: -1, lra: 11 }, // YouTube 표준
  sceneTransitions: generateAutoTransitions(scenes),
  fps: 30,
  width: config.resolution === '1080p' ? 1920 : 1280,
  height: config.resolution === '1080p' ? 1080 : 720,
  videoBitrateMbps: config.resolution === '1080p' ? 20 : 12,
  onProgress: handleRenderProgress,
  signal: abortController.signal,
});
```

**자동 트랜지션 생성 규칙**:
```
scene[i] → scene[i+1] 전환 효과 결정:

1. 같은 모드(N→N, S→S) → 'dissolve' (0.5초)
2. N→S 또는 N→A → 'fade' (0.8초)  — 나레이션에서 원본으로 전환
3. S→N 또는 A→N → 'fade' (0.8초)  — 원본에서 나레이션으로 전환
4. S→A 또는 A→S → 'wipeRight' (0.4초) — 원본 내 전환
```

---

## 5. 새로 만들 파일

### 5.1 파일 목록

| 파일 | 역할 | 예상 LOC |
|------|------|---------|
| `src/services/quickProductionService.ts` | 파이프라인 오케스트레이터 (Phase 1~5) | ~350 |
| `src/stores/quickProductionStore.ts` | Zustand 상태 관리 | ~80 |
| `src/components/tabs/channel/QuickProductionModal.tsx` | 설정 + 진행 + 결과 3단계 모달 | ~250 |

### 5.2 수정할 파일

| 파일 | 변경 내용 | 예상 diff |
|------|----------|----------|
| `src/components/tabs/channel/VideoAnalysisRoom.tsx` | 버전별 "제작하기" 버튼 추가 + 모달 연결 | +30줄 |
| `src/types.ts` | `ProductionScene`, `QuickProductionConfig`, `ProductionPhase` 타입 추가 | +40줄 |

---

## 6. 타입 정의

```typescript
// ─── types.ts 추가 ───

/** 퀵 프로덕션 설정 */
export interface QuickProductionConfig {
  versionId: number;
  preset: VideoAnalysisPreset;

  // TTS
  ttsEngine: 'typecast' | 'supertonic';
  voiceId: string;
  voiceSpeed: number;         // 0.8 ~ 1.2
  emotionPreset?: string;     // Typecast only

  // 자막
  subtitleTemplateId: string;
  showNarrationSubtitle: boolean;  // 나레이션 텍스트를 하단 자막으로도 표시

  // 출력
  resolution: '720p' | '1080p';
  bgmMode: 'none' | 'auto' | 'custom';
  bgmUrl?: string;            // custom일 때
  bgmVolume?: number;         // 0~100
}

/** 프로덕션 진행 단계 */
export type ProductionPhase =
  | 'idle'
  | 'preparing'         // Phase 1: 데이터 변환
  | 'generating-tts'    // Phase 2: TTS 생성
  | 'preparing-source'  // Phase 3: 소스 영상 준비
  | 'calculating-subs'  // Phase 4: 자막 타이밍
  | 'rendering'         // Phase 5: MP4 렌더링
  | 'done'
  | 'error';

/** 프로덕션 진행 상태 */
export interface ProductionProgress {
  phase: ProductionPhase;
  percent: number;          // 0~100 (전체 기준)
  phasePercent: number;     // 0~100 (현재 단계 기준)
  message: string;
  elapsedSec: number;
  etaSec: number;
  ttsCompleted: number;     // TTS 완료 씬 수
  ttsTotal: number;         // TTS 필요 씬 수
}

/** 정규화된 프로덕션 장면 */
export interface ProductionScene {
  id: string;
  index: number;
  mode: 'N' | 'S' | 'A';
  narrationText: string;
  effectSubtitle: string;
  targetDuration: number;
  finalDuration: number;        // TTS 결과 반영 후 최종
  speedAdjust: number;          // 나레이션 재생속도 조정 (1.0 = 원속)
  sourceTimecode: { start: number; end: number } | null;
  direction: string;
  narrationAudioUrl?: string;   // TTS 결과
  sourceVideoUrl?: string;      // 컷 영상 blob URL
  sourceImageUrl?: string;      // 프레임 이미지 URL
}
```

---

## 7. Zustand Store 설계

```typescript
// ─── quickProductionStore.ts ───

interface QuickProductionStore {
  // 상태
  isOpen: boolean;
  step: 'config' | 'progress' | 'result';
  config: QuickProductionConfig | null;
  progress: ProductionProgress;
  scenes: ProductionScene[];
  resultBlobUrl: string | null;
  resultSrtContent: string | null;
  error: string | null;
  abortController: AbortController | null;

  // 입력 데이터 (분석실에서 전달)
  sourceVersion: VideoVersionItem | null;
  sourceInputMode: 'upload' | 'youtube';
  sourceVideoUrl: string | null;     // 업로드 영상 Cloudinary URL
  sourceFrames: VideoTimedFrame[];   // YouTube 프레임

  // 액션
  open(version: VideoVersionItem, inputMode: 'upload' | 'youtube',
       videoUrl: string | null, frames: VideoTimedFrame[]): void;
  close(): void;
  setConfig(config: QuickProductionConfig): void;
  startProduction(): Promise<void>;
  cancelProduction(): void;
  updateProgress(progress: Partial<ProductionProgress>): void;
  setResult(blobUrl: string, srt: string): void;
  setError(error: string): void;
  reset(): void;
}
```

---

## 8. 서비스 함수 설계

```typescript
// ─── quickProductionService.ts ───

/**
 * 메인 파이프라인: 버전 데이터 → MP4 Blob
 * 취소 가능 (AbortSignal)
 */
export async function runQuickProduction(
  version: VideoVersionItem,
  config: QuickProductionConfig,
  sourceContext: {
    inputMode: 'upload' | 'youtube';
    videoUrl: string | null;
    frames: VideoTimedFrame[];
  },
  onProgress: (p: ProductionProgress) => void,
  signal: AbortSignal,
): Promise<{ videoBlob: Blob; srtContent: string }>;

/** Phase 1: VideoSceneRow[] → ProductionScene[] */
export function convertToProductionScenes(
  scenes: VideoSceneRow[],
): ProductionScene[];

/** Phase 2: N-mode 씬들의 나레이션 TTS 일괄 생성 */
export async function generateAllNarrations(
  scenes: ProductionScene[],
  config: { engine: 'typecast' | 'supertonic'; voiceId: string; speed: number; emotion?: string },
  onProgress: (completed: number, total: number) => void,
  signal: AbortSignal,
): Promise<Map<string, NarrationResult>>;

/** Phase 3A: 업로드 영상 → 씬별 세그먼트 추출 */
export async function extractVideoSegments(
  videoUrl: string,
  scenes: ProductionScene[],
  onProgress: (percent: number) => void,
): Promise<Map<string, string>>; // sceneId → segment blob URL

/** Phase 3B: YouTube 프레임 → 씬별 이미지 매칭 */
export function matchFramesToScenes(
  frames: VideoTimedFrame[],
  scenes: ProductionScene[],
): Map<string, string>; // sceneId → frame URL

/** Phase 4: 자막 타이밍 → UnifiedSceneTiming[] 변환 */
export function buildUnifiedTimeline(
  scenes: ProductionScene[],
  subtitleConfig: { showNarration: boolean },
): UnifiedSceneTiming[];

/** Phase 5: composeMp4 호출 래퍼 */
export async function renderFinalVideo(
  timeline: UnifiedSceneTiming[],
  scenes: ProductionScene[],
  config: QuickProductionConfig,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob>;

/** 유틸: 화면지시 → Ken Burns 모션 매핑 */
export function mapDirectionToMotion(direction: string): {
  effectPreset: string;
  motionEffect: string;
  anchorX: number;
  anchorY: number;
};

/** 유틸: 모드 전환 → 자동 트랜지션 생성 */
export function generateAutoTransitions(
  scenes: ProductionScene[],
): Record<string, SceneTransitionConfig>;

/** 유틸: 타임코드 문자열 → 초 변환 */
export function parseTimecodeRange(
  tc: string,
): { start: number; end: number } | null;

/** 유틸: SRT 콘텐츠 생성 */
export function generateProductionSrt(
  timeline: UnifiedSceneTiming[],
): string;
```

---

## 9. UI 컴포넌트 상세

### 9.1 QuickProductionModal 구조

```
QuickProductionModal (모달 오버레이)
├── ConfigStep (step === 'config')
│   ├── VoiceSelector
│   │   ├── EngineToggle (Typecast / Supertonic)
│   │   ├── VoiceGrid (4~6개 보이스 카드, 각각 ▶미리듣기)
│   │   ├── SpeedSlider (0.8x ~ 1.2x)
│   │   └── EmotionPicker (Typecast only: 일반/밝은/차분/긴장)
│   ├── SubtitleTemplatePicker
│   │   ├── TemplateGrid (6개 추천 프리셋, 미리보기 텍스트)
│   │   └── NarrationSubtitleToggle (나레이션 텍스트 자막 표시 여부)
│   ├── OutputSettings
│   │   ├── ResolutionToggle (720p / 1080p)
│   │   └── BgmSelector (없음 / 자동 / 업로드)
│   ├── PreviewSummary
│   │   ├── "총 {N}컷, 나레이션 {M}컷, 예상 {T}초"
│   │   └── "예상 제작시간: 약 {X}분"
│   └── StartButton
│
├── ProgressStep (step === 'progress')
│   ├── PhaseList (5단계 체크리스트)
│   ├── ProgressBar (전체 %)
│   ├── TimeInfo (경과/예상 시간)
│   ├── CurrentDetail (현재 작업 상세: "씬 3/8 TTS 생성 중...")
│   └── CancelButton
│
└── ResultStep (step === 'result')
    ├── VideoPreview (<video> 태그, controls)
    ├── Stats (총 길이, 해상도, 파일 크기)
    ├── DownloadButtons (MP4 / SRT)
    ├── EditRoomButton (편집실로 보내기 — 미세조정)
    └── RetryButton (다른 버전으로 재제작)
```

### 9.2 예상 소요시간 계산

```
estimatedTime(scenes, inputMode):
  ttsTime = (mode=N 씬 수) × 5초                    // 평균 5초/씬 TTS 생성
  sourceTime = inputMode === 'upload' ? 15초 : 0초    // FFmpeg 세그먼트 추출
  renderTime = (총 초 수) × 0.8                       // FFmpeg 렌더 비율
  buffer = 10초                                       // 기타 처리

  return ttsTime + sourceTime + renderTime + buffer
```

---

## 10. 에러 처리 매트릭스

| 단계 | 에러 시나리오 | 처리 방식 |
|------|-------------|----------|
| TTS | API 키 없음 | Typecast 미설정 → Supertonic 자동 폴백 |
| TTS | 개별 씬 실패 | 해당 씬 무음 처리 + 경고 배지, 전체는 계속 |
| TTS | 전체 실패 | "나레이션 없이 자막만으로 계속하시겠습니까?" 확인 |
| 소스 | FFmpeg 로드 실패 | "FFmpeg 로드 실패" + 이미지 폴백 시도 |
| 소스 | 세그먼트 추출 실패 | 해당 구간 가장 가까운 프레임 이미지로 대체 |
| 자막 | 효과자막 비어있음 | 해당 씬 자막 스킵 (정상 동작) |
| 렌더 | 메모리 초과 | "메모리 부족 — 720p로 다시 시도하시겠습니까?" |
| 렌더 | 사용자 취소 | AbortSignal로 모든 작업 즉시 중단 + 리소스 정리 |
| 전체 | 네트워크 끊김 | TTS/업로드 3회 재시도 후 실패 |

---

## 11. 성능 고려사항

### 메모리 관리
```
- 각 Phase 완료 후 중간 blob URL 해제 (URL.revokeObjectURL)
- FFmpeg 작업 후 inputFiles 정리
- 최대 동시 blob 보유: 장면 수 × 2 (비디오 + 오디오)
- 5분 이상 영상: 720p 권장 경고 표시
```

### 병렬 처리
```
Phase 2 (TTS): 최대 3개 동시 (API 부하 방지)
Phase 3 (소스): 순차 (FFmpeg 단일 인스턴스)
Phase 4 (자막): 즉시 (CPU only)
Phase 5 (렌더): 순차 (FFmpeg 단일 인스턴스)
```

### 진행률 가중치
```
Phase 1: 2%    (즉시)
Phase 2: 30%   (TTS 생성 — 가장 가변적)
Phase 3: 15%   (소스 준비)
Phase 4: 3%    (자막 계산)
Phase 5: 50%   (FFmpeg 렌더 — 가장 무거움)
```

---

## 12. 미결정 사항 (구현 전 확정 필요)

| # | 질문 | 선택지 | 기본값 제안 |
|---|------|--------|-----------|
| Q1 | YouTube 입력의 퀵 프로덕션 지원? | A) 프레임 슬라이드쇼 B) 나레이션+SRT만 C) 미지원 | A |
| Q2 | TTS 기본 엔진? | A) Typecast B) Supertonic C) 둘 다 선택 | C |
| Q3 | 스낵(snack) 프리셋 지원? | A) Phase 1에서 같이 B) Phase 2에서 추가 | B |
| Q4 | 최종 산출물? | A) MP4만 B) MP4+SRT C) 둘 다 옵션 | C |
| Q5 | 나레이션 텍스트 하단자막 표시? | A) 기본ON B) 기본OFF C) 사용자선택 | C |
| Q6 | mode=S/A 씬의 오디오? | A) 무음 B) 원본유지(업로드만) C) 사용자선택 | B |

---

## 13. 구현 순서 (권장)

```
Day 1: 기반
  ├── types.ts 타입 추가
  ├── quickProductionStore.ts 생성
  └── quickProductionService.ts Phase 1 (데이터 변환)

Day 2: 핵심 파이프라인
  ├── quickProductionService.ts Phase 2 (TTS 일괄 생성)
  ├── quickProductionService.ts Phase 3 (소스 준비 — 업로드 경로)
  └── quickProductionService.ts Phase 4 (자막 타이밍)

Day 3: 렌더 + UI
  ├── quickProductionService.ts Phase 5 (composeMp4 연결)
  ├── QuickProductionModal.tsx (3단계 모달)
  └── VideoAnalysisRoom.tsx 버튼 연결

Day 4: YouTube 경로 + 마무리
  ├── Phase 3B (프레임 매칭)
  ├── 에러 핸들링 보강
  ├── 테스트 + 빌드
  └── 커밋/푸시
```

---

## 14. 요약

**새로 만들 코드**: ~680줄 (서비스 350 + 스토어 80 + 모달 250)
**수정할 코드**: ~70줄 (VideoAnalysisRoom 30 + types 40)
**재활용하는 기존 코드**: composeMp4, generateTypecastTTS, generateSupertonicTTS, SubtitleStyle, ffmpegService 전체

**핵심은 `quickProductionService.ts`** — 5개 Phase를 순차 실행하며 기존 인프라를 연결하는 오케스트레이터.
기존 `composeMp4()`가 이미 영상+나레이션+자막+BGM+트랜지션을 전부 처리하므로,
실질적으로 "분석실 데이터 → composeMp4 입력 형식 변환"이 전체 작업의 80%.

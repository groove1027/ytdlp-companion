# Kie Suno API 기술 문서

> **최종 업데이트**: 2026-03-04
> **공식 문서**: https://docs.kie.ai/suno-api/quickstart
> **API Base URL**: `https://api.kie.ai`
> **인증**: `Authorization: Bearer {API_KEY}`

---

## 핵심 요약: 엔드포인트 매핑

| 기능 | 메서드 | 엔드포인트 | 크레딧 |
|------|--------|-----------|--------|
| 음악 생성 | POST | `/api/v1/generate` | 12 ($0.06) |
| 음악 연장 | POST | `/api/v1/generate/extend` | 12 ($0.06) |
| **음악 태스크 폴링** | **GET** | **`/api/v1/generate/record-info?taskId=`** | 0 |
| 업로드+커버 | POST | `/api/v1/generate/upload-cover` | 12 ($0.06) |
| 업로드+연장 | POST | `/api/v1/generate/upload-extend` | 12 ($0.06) |
| 반주 추가 | POST | `/api/v1/generate/add-instrumental` | 12 ($0.06) |
| 보컬 추가 | POST | `/api/v1/generate/add-vocals` | 12 ($0.06) |
| 가사 생성 | POST | `/api/v1/lyrics` | 무료 |
| **가사 태스크 폴링** | **GET** | **`/api/v1/lyrics/record-info?taskId=`** | 0 |
| 스타일 부스트 | POST | `/api/v1/style/generate` | 0.4 ($0.002) |
| 보컬/MR 분리 | POST | `/api/v1/vocal-removal/generate` | 10 ($0.05) |
| **보컬분리 폴링** | **GET** | **`/api/v1/vocal-removal/record-info?taskId=`** | 0 |
| 뮤직비디오 생성 | POST | `/api/v1/mp4/generate` | 4 ($0.02) |
| **뮤직비디오 폴링** | **GET** | **`/api/v1/mp4/record-info?taskId=`** | 0 |
| WAV 변환 | POST | `/api/v1/wav/generate` | 0.4 ($0.002) |
| **WAV 변환 폴링** | **GET** | **`/api/v1/wav/record-info?taskId=`** | 0 |
| MIDI 생성 | POST | `/api/v1/midi/generate` | - |
| **MIDI 폴링** | **GET** | **`/api/v1/midi/record-info?taskId=`** | 0 |
| 싱크 가사 조회 | POST | `/api/v1/generate/get-timestamped-lyrics` | - |
| 페르소나 생성 | POST | `/api/v1/generate/generate-persona` | - |
| 커버 생성 | POST | `/api/v1/generate/cover` | 12 ($0.06) |
| 구간 교체 | POST | `/api/v1/generate/replace-section` | - |
| 매시업 생성 | POST | `/api/v1/generate/mashup` | - |

> **⚠️ 중요: 폴링 엔드포인트 패턴**
> - 음악 생성/연장/커버: `GET /api/v1/generate/record-info?taskId=`
> - 보컬 분리: `GET /api/v1/vocal-removal/record-info?taskId=`
> - 뮤직비디오: `GET /api/v1/mp4/record-info?taskId=`
> - WAV 변환: `GET /api/v1/wav/record-info?taskId=`
> - ~~`/api/v1/jobs/recordInfo`는 Suno에 사용하지 않음~~ (ElevenLabs TTS 전용)

---

## 1. 음악 생성 (Generate Music)

**POST** `https://api.kie.ai/api/v1/generate`

### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 | 제한 |
|---------|------|------|------|------|
| `prompt` | string | O | 가사(보컬) 또는 설명(인스트) | V4: 3000자, V4.5+: 5000자, 비커스텀: 500자 |
| `customMode` | boolean | O | 고급 설정 모드 | - |
| `instrumental` | boolean | O | 인스트루멘탈 여부 | - |
| `model` | string | O | AI 모델 버전 | V3_5, V4, V4_5, V4_5PLUS, V4_5ALL, V5 |
| `callBackUrl` | string | X | 웹훅 URL | - |
| `style` | string | customMode시 | 장르/분위기 태그 | V4: 200자, V5: 1000자 |
| `title` | string | customMode시 | 곡 제목 | 80자 |
| `negativeTags` | string | X | 제외할 스타일 | - |
| `vocalGender` | string | X | 보컬 성별 | 'm' 또는 'f' |
| `styleWeight` | number | X | 스타일 준수도 | 0~1 |
| `weirdnessConstraint` | number | X | 창의적 자유도 | 0~1 |
| `audioWeight` | number | X | 오디오 밸런스 | 0~1 |
| `personaId` | string | X | 페르소나 ID | - |
| `duration` | number | X | 곡 길이 (초) | 모델별 상한 |

### 요청 예시 (customMode)

```json
{
  "prompt": "A calm and relaxing piano track with soft melodies",
  "customMode": true,
  "instrumental": true,
  "model": "V5",
  "callBackUrl": "https://noop",
  "style": "Classical, Ambient, Piano, bpm 80",
  "title": "Peaceful Piano",
  "negativeTags": "Heavy Metal, Drums",
  "styleWeight": 0.65,
  "weirdnessConstraint": 0.65,
  "audioWeight": 0.65
}
```

### 성공 응답 (200)

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "339a2f8271a3e3c6d2b99b68d5fbd022"
  }
}
```

> **참고**: 요청 1회당 **2곡**이 생성됨 (sunoData 배열에 2개 항목)

---

## 2. 음악 태스크 폴링 (Get Task Details)

**GET** `https://api.kie.ai/api/v1/generate/record-info?taskId={taskId}`

### 성공 응답 (200, status=SUCCESS)

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "339a2f8271a3e3c6d2b99b68d5fbd022",
    "parentMusicId": "",
    "param": "{...JSON string of original request...}",
    "response": {
      "taskId": "339a2f8271a3e3c6d2b99b68d5fbd022",
      "sunoData": [
        {
          "id": "90273aa5-f25a-4ab0-adc7-9dfa1bac51f7",
          "audioUrl": "https://tempfile.aiquickdraw.com/r/xxxx.mp3",
          "sourceAudioUrl": "https://tempfile.aiquickdraw.com/r/xxxx.mp3",
          "streamAudioUrl": "https://musicfile.kie.ai/xxxx",
          "sourceStreamAudioUrl": "https://cdn1.suno.ai/xxxx.mp3",
          "imageUrl": "https://musicfile.kie.ai/xxxx.jpeg",
          "sourceImageUrl": "https://cdn2.suno.ai/image_xxxx.jpeg",
          "prompt": "",
          "modelName": "chirp-crow",
          "title": "API Test Track",
          "tags": "electronic, ambient, calm, piano, soft pad, bpm 90",
          "createTime": 1772624679694,
          "duration": 154.68
        },
        {
          "id": "7d3a0f7b-b0d2-481e-8ae5-f1e54ef9b39a",
          "audioUrl": "https://tempfile.aiquickdraw.com/r/yyyy.mp3",
          "duration": 192.0
        }
      ]
    },
    "status": "SUCCESS",
    "type": "chirp-crow",
    "operationType": "generate",
    "errorCode": null,
    "errorMessage": null,
    "createTime": 1772624550000
  }
}
```

### 상태값 (status)

| 상태 | 의미 |
|------|------|
| `PENDING` | 처리 중 / 대기 중 |
| `TEXT_SUCCESS` | 가사/텍스트 완료 |
| `FIRST_SUCCESS` | 첫 번째 트랙 완료 |
| `SUCCESS` | 전체 완료 |
| `CREATE_TASK_FAILED` | 태스크 생성 실패 |
| `GENERATE_AUDIO_FAILED` | 오디오 생성 실패 |
| `CALLBACK_EXCEPTION` | 웹훅 처리 오류 |
| `SENSITIVE_WORD_ERROR` | 콘텐츠 필터링 |

### sunoData 항목 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | Suno 내부 audioId (연장/분리에 사용) |
| `audioUrl` | string | 다운로드용 MP3 URL |
| `streamAudioUrl` | string | 스트리밍용 URL |
| `sourceAudioUrl` | string | 원본 소스 URL |
| `sourceStreamAudioUrl` | string | Suno CDN 직접 URL |
| `imageUrl` | string | 커버 아트 이미지 |
| `sourceImageUrl` | string | Suno CDN 이미지 |
| `prompt` | string | 가사/설명 |
| `modelName` | string | 실제 사용 모델명 (chirp-crow 등) |
| `title` | string | 곡 제목 |
| `tags` | string | 스타일 태그 |
| `createTime` | number | 생성 시간 (epoch ms) |
| `duration` | number | 곡 길이 (초) |

---

## 3. 음악 연장 (Extend Music)

**POST** `https://api.kie.ai/api/v1/generate/extend`

### 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `audioId` | string | O | 연장할 원본 트랙의 id (sunoData[].id) |
| `defaultParamFlag` | boolean | O | true=커스텀 파라미터 사용, false=원본 계승 |
| `prompt` | string | 조건부 | 가사/설명 (customMode시) |
| `model` | string | O | AI 모델 버전 |
| `callBackUrl` | string | O | 웹훅 URL |
| `style` | string | customMode시 | 스타일 태그 |
| `title` | string | customMode시 | 곡 제목 |
| `continueAt` | number | X | 연장 시작점 (초) |
| `negativeTags` | string | X | 제외 스타일 |
| `vocalGender` | string | X | 'm' / 'f' |
| `styleWeight` | number | X | 0~1 |
| `weirdnessConstraint` | number | X | 0~1 |
| `audioWeight` | number | X | 0~1 |
| `personaId` | string | X | 페르소나 ID |

### 폴링

동일: `GET /api/v1/generate/record-info?taskId={taskId}`

---

## 4. 업로드 + 커버 (Upload & Cover)

**POST** `https://api.kie.ai/api/v1/generate/upload-cover`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `uploadUrl` | string | O | 오디오 파일 URL (최대 8분) |
| `prompt` | string | O | 커버 설명 |
| `customMode` | boolean | O | - |
| `instrumental` | boolean | O | - |
| `model` | string | O | - |
| `callBackUrl` | string | O | - |
| (+ style, title, negativeTags 등 customMode 파라미터) |

---

## 5. 업로드 + 연장 (Upload & Extend)

**POST** `https://api.kie.ai/api/v1/generate/upload-extend`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `uploadUrl` | string | O | 오디오 파일 URL (최대 8분) |
| `defaultParamFlag` | boolean | O | - |
| `instrumental` | boolean | O | - |
| `continueAt` | number | O | 연장 시작점 (초) |
| `model` | string | O | - |
| `callBackUrl` | string | O | - |
| (+ prompt, style, title 등) |

---

## 6. 가사 생성 (Generate Lyrics)

**POST** `https://api.kie.ai/api/v1/lyrics`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `prompt` | string | O | 가사 주제 설명 (200자) |
| `callBackUrl` | string | O | 웹훅 URL |

### 폴링

**GET** `https://api.kie.ai/api/v1/lyrics/record-info?taskId={taskId}`

### 성공 응답

```json
{
  "code": 200,
  "data": {
    "status": "SUCCESS",
    "response": {
      "lyricsData": [
        {
          "title": "Song Title",
          "text": "[Verse]\n...\n[Chorus]\n...",
          "status": "complete"
        }
      ]
    }
  }
}
```

2~3개 가사 변형이 반환됨.

---

## 7. 스타일 부스트 (Boost Style)

**POST** `https://api.kie.ai/api/v1/style/generate`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `content` | string | O | 스타일 설명 (예: "Pop, Mysterious") |

### 성공 응답 (동기)

```json
{
  "code": 200,
  "data": {
    "result": "optimized style text",
    "creditsConsumed": 0.40,
    "creditsRemaining": 123.45,
    "successFlag": "1"
  }
}
```

`successFlag`: `"0"` (대기), `"1"` (성공), `"2"` (실패)

---

## 8. 보컬/MR 분리 (Vocal Separation)

**POST** `https://api.kie.ai/api/v1/vocal-removal/generate`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `taskId` | string | O | 원본 음악 태스크 ID |
| `audioId` | string | O | 원본 트랙 ID |
| `type` | string | X | `separate_vocal` (보컬+MR) / `split_stem` (악기별 분리) |
| `callBackUrl` | string | X | 웹훅 URL |

### 폴링

**GET** `https://api.kie.ai/api/v1/vocal-removal/record-info?taskId={taskId}`

### 성공 응답 (separate_vocal)

```json
{
  "code": 200,
  "data": {
    "successFlag": "SUCCESS",
    "response": {
      "vocalUrl": "https://file.aiquickdraw.com/s/xxx_Vocals.mp3",
      "instrumentalUrl": "https://file.aiquickdraw.com/s/xxx_Instrumental.mp3"
    }
  }
}
```

### 성공 응답 (split_stem)

추가 필드: `backingVocalsUrl`, `drumsUrl`, `bassUrl`, `guitarUrl`, `pianoUrl`, `keyboardUrl`, `percussionUrl`, `stringsUrl`, `synthUrl`, `fxUrl`, `brassUrl`, `woodwindsUrl`

---

## 9. 싱크 가사 (Timestamped Lyrics)

**POST** `https://api.kie.ai/api/v1/generate/get-timestamped-lyrics`

| 파라미터 | 타입 | 필수 |
|---------|------|------|
| `taskId` | string | O |
| `audioId` | string | O |

### 성공 응답

```json
{
  "code": 200,
  "data": {
    "alignedWords": [
      {
        "word": "[Verse] Waggin'",
        "success": true,
        "startS": 1.36,
        "endS": 1.79,
        "palign": 0
      }
    ],
    "waveformData": [0, 1, 0.5, 0.75],
    "hootCer": 0.38,
    "isStreamed": false
  }
}
```

---

## 10. 뮤직비디오 생성 (Create Music Video)

**POST** `https://api.kie.ai/api/v1/mp4/generate`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `taskId` | string | O | 원본 음악 태스크 ID |
| `audioId` | string | O | 트랙 ID |
| `callBackUrl` | string | O | 웹훅 URL |
| `author` | string | X | 아티스트명 (50자) |
| `domainName` | string | X | 워터마크 (50자) |

### 폴링

**GET** `https://api.kie.ai/api/v1/mp4/record-info?taskId={taskId}`

### 성공 응답

```json
{
  "code": 200,
  "data": {
    "successFlag": "SUCCESS",
    "response": {
      "videoUrl": "https://example.com/xxx.mp4"
    }
  }
}
```

---

## 11. 페르소나 생성 (Generate Persona)

**POST** `https://api.kie.ai/api/v1/generate/generate-persona`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `taskId` | string | O | 원본 음악 태스크 ID |
| `audioId` | string | O | 트랙 ID |
| `name` | string | O | 페르소나 이름 |
| `description` | string | O | 페르소나 설명 |
| `vocalStart` | number | X | 분석 시작점 (초, 기본 0) |
| `vocalEnd` | number | X | 분석 종료점 (초, 기본 30, 차이 10~30초) |
| `style` | string | X | 스타일 보충 태그 |

### 성공 응답 (동기)

```json
{
  "code": 200,
  "data": {
    "personaId": "a1b2****c3d4",
    "name": "Electronic Pop Singer",
    "description": "..."
  }
}
```

---

## AI 모델 비교

| 모델 | 최대 길이 | prompt | style | 특징 |
|------|----------|--------|-------|------|
| V3_5 | 4분 | 3000자 | 200자 | 레거시, 노래 구조 |
| V4 | 4분 | 3000자 | 200자 | 보컬 품질 향상 |
| V4_5 | 8분 | 5000자 | 1000자 | 스마트 프롬프트 |
| V4_5PLUS | 8분 | 5000자 | 1000자 | 풍부한 사운드 |
| V4_5ALL | 8분 | 5000자 | 1000자 | 스마트+빠름 |
| **V5** | **8분** | **5000자** | **1000자** | **최고 품질, 최신** |

---

## HTTP 에러 코드

| 코드 | 의미 |
|------|------|
| 200 | 성공 |
| 400 | 콘텐츠 정책 위반 |
| 401 | 인증 실패 |
| 402 | 크레딧 부족 |
| 404 | 리소스 없음 |
| 409 | 중복 레코드 |
| 422 | 파라미터 검증 오류 |
| 429 | 요청 제한 초과 |
| 451 | 접근 제한 |
| 455 | 서비스 점검 중 |
| 500 | 서버 오류 |
| 501 | 생성 실패 |
| 505 | 기능 비활성화 |

---

## 콜백 (Webhook) 포맷

모든 생성 엔드포인트에서 `callBackUrl`로 POST 전송:

```json
{
  "code": 200,
  "msg": "All generated successfully.",
  "data": {
    "callbackType": "complete",
    "task_id": "2fac****9f72",
    "data": [
      {
        "id": "e231****-****-****-****-****8cadc7dc",
        "audio_url": "https://example.cn/****.mp3",
        "stream_audio_url": "https://example.cn/****",
        "image_url": "https://example.cn/****.jpeg",
        "prompt": "[Verse] Night city lights",
        "model_name": "chirp-v3-5",
        "title": "Iron Man",
        "tags": "electrifying, rock",
        "createTime": "2025-01-01 00:00:00",
        "duration": 198.44
      }
    ]
  }
}
```

**콜백 타입**: `text` (가사), `first` (첫 트랙), `complete` (전체 완료)

> **콜백 vs 폴링 필드명 차이!**
> - 콜백: `audio_url`, `stream_audio_url`, `image_url` (snake_case)
> - 폴링: `audioUrl`, `streamAudioUrl`, `imageUrl` (camelCase)

---

## 주의사항

1. **파일 보관**: 생성된 파일은 **14일** 후 삭제
2. **요청당 2곡**: 음악 생성 1회 요청으로 2개 트랙이 생성됨
3. **폴링 주기**: 초기 3초 → 이후 5초 (최대 120회 ≈ 6분)
4. **429 처리**: 지수 백오프 권장
5. **모델 호환**: 연장 시 원본과 동일 모델 사용 권장
6. **V5 신규 파라미터**: `negativeTags`, `styleWeight`, `weirdnessConstraint`, `audioWeight`, `personaId`

---

## 실제 테스트 결과 (2026-03-04)

### 음악 생성 테스트

```
POST /api/v1/generate
- model: V5, instrumental: true
- style: "electronic, ambient, calm, piano, soft pad, bpm 90"
- 결과: 2곡 생성
  - Track 1: 154.68초, 3.6MB MP3
  - Track 2: 192.0초, 4.5MB MP3
- 폴링: /api/v1/generate/record-info → SUCCESS
```

### 현재 코드의 버그

**musicService.ts의 `pollMusicStatus()` 함수:**

| 항목 | 현재 코드 (잘못됨) | 올바른 값 |
|------|-------------------|----------|
| 폴링 URL | `/api/v1/jobs/recordInfo?taskId=` | `/api/v1/generate/record-info?taskId=` |
| 상태 필드 | `data.data.state` | `data.data.status` |
| 상태값 | `'success'` (소문자) | `'SUCCESS'` (대문자) |
| 결과 필드 | `data.data.resultJson` | `data.data.response.sunoData[]` |
| audioUrl | `resultJson.resultUrls?.[0]` | `sunoData[0].audioUrl` |
| audioId | `resultJson.id` | `sunoData[0].id` |
| duration | `resultJson.duration` | `sunoData[0].duration` |
| imageUrl | `resultJson.image_url` | `sunoData[0].imageUrl` |
| 실패 상태 | `state === 'fail'` | `status === 'CREATE_TASK_FAILED'` 등 |

**보컬 분리 `pollVocalSeparation()` 함수:**

| 항목 | 현재 코드 | 올바른 값 |
|------|----------|----------|
| 폴링 URL | `/api/v1/jobs/recordInfo?taskId=` | `/api/v1/vocal-removal/record-info?taskId=` |
| 상태 필드 | `data.data.state` | `data.data.successFlag` |
| vocalUrl | `resultJson.vocal_url` | `response.vocalUrl` |
| instrumentalUrl | `resultJson.instrumental_url` | `response.instrumentalUrl` |

**가사 생성 `pollLyrics()` 함수:**

| 항목 | 현재 코드 | 올바른 값 |
|------|----------|----------|
| 폴링 URL | `/api/v1/jobs/recordInfo?taskId=` | `/api/v1/lyrics/record-info?taskId=` |

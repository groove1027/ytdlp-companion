# 스킬: 외부 API 기술 문서 (전체 공급자)

> **활성화 조건**: API 호출 수정, 엔드포인트 변경, 요청/응답 포맷 관련 작업 시

---

## 1. Kie AI

### 인증
```
Authorization: Bearer {KIE_API_KEY}
Content-Type: application/json
```

### 글로벌 규칙
- Rate limit: 20 requests / 10초, 동시 100+
- 생성 파일 보존: 14일, 업로드 파일: 3일, 로그: 2개월
- 1 credit ≈ $0.005 USD

### 1-A. 이미지 생성 (Market Models)

**POST** `https://api.kie.ai/api/v1/jobs/createTask`

```json
{
  "model": "nano-banana-pro",
  "input": {
    "prompt": "string",
    "image_input": ["url"],
    "aspect_ratio": "16:9 | 9:16 | 1:1 | 4:3",
    "resolution": "2K",
    "output_format": "jpeg"
  }
}
```
- Flash 모델: `"google/nano-banana"`, 편집: `"google/nano-banana-edit"`
- Flash 전용 파라미터: `image_size` (aspect_ratio 대신)

**응답:**
```json
{"code": 200, "data": {"taskId": "string"}}
```

### 1-B. 작업 상태 폴링 (공통)

**GET** `https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`

```json
{
  "code": 200,
  "data": {
    "taskId": "string",
    "state": "waiting | queuing | generating | success | fail",
    "resultJson": {
      "resultUrls": ["string"],
      "images": ["string"],
      "image_url": "string",
      "video_url": "string",
      "url": "string"
    },
    "failMsg": "string",
    "progress": 50
  }
}
```
- 폴링 간격: 초기 2-3초, 이후 5-30초
- URL 만료: 24시간

### 1-C. 작업 취소

**GET** `https://api.kie.ai/api/v1/jobs/cancelTask?taskId={taskId}`

### 1-D. Grok Image-to-Video (720p)

**POST** `https://api.kie.ai/api/v1/jobs/createTask`

```json
{
  "model": "grok-imagine/image-to-video",
  "callBackUrl": "string (optional)",
  "input": {
    "image_urls": ["URL"],
    "task_id": "string (alternative to image_urls, Kie 생성 이미지용)",
    "index": 0,
    "prompt": "string (max 5000 chars)",
    "mode": "fun | normal | spicy",
    "duration": "6 | 10",
    "resolution": "480p | 720p"
  }
}
```

#### 이미지 입력 방식 (택 1, 동시 사용 금지)
- `image_urls`: 외부 이미지 URL 배열 (1개만 지원). JPEG/PNG/WebP, 10MB 이하
- `task_id` + `index`: Kie Grok으로 생성한 이미지의 task_id + 인덱스(0~5). **Spicy 모드는 이 방식에서만 지원**

#### 핵심 규칙
- **외부 이미지(image_urls) 사용 시 Spicy 모드 불가** → 자동으로 Normal 전환
- `resolution`: **반드시 명시** (미지정 시 기본값 불명확, "720p" 권장)
- `callBackUrl`: 선택사항. 미제공 시 콜백 미발송 → 폴링 사용

#### 응답
```json
{"code": 200, "message": "success", "data": {"taskId": "string"}}
```

#### 폴링: GET `https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`
```json
{
  "code": 200,
  "data": {
    "taskId": "string",
    "model": "grok-imagine/image-to-video",
    "state": "waiting | queuing | generating | success | fail",
    "resultJson": "{\"resultUrls\":[\"URL\"]}",
    "failCode": "string",
    "failMsg": "string",
    "costTime": 0,
    "completeTime": 1698765432000,
    "createTime": 1698765400000
  }
}
```
- `resultJson`: **JSON 문자열** (파싱 필요) → `resultUrls[0]`에서 영상 URL 추출
- `state`: waiting→queuing→generating→success/fail
- 폴링 간격: 2초 권장

#### 콜백 (callBackUrl 제공 시)
- 성공: `{"code": 200, "data": {..., "state": "success", "resultJson": "..."}, "msg": "Playground task completed successfully."}`
- 실패: `{"code": 501, "data": {..., "state": "fail", "failCode": "500", "failMsg": "..."}, "msg": "Playground task failed."}`

### 1-E. Grok Upscale

**POST** `https://api.kie.ai/api/v1/jobs/createTask`

```json
{
  "model": "grok-imagine/upscale",
  "input": {"task_id": "string"}
}
```

### 1-F. Veo 3.1 (Kie 전용 엔드포인트)

**POST** `https://api.kie.ai/api/v1/veo/generate`

```json
{
  "prompt": "string",
  "imageUrls": ["url1", "url2"],
  "model": "veo3_fast | veo3",
  "generationType": "TEXT_2_VIDEO | FIRST_AND_LAST_FRAMES_2_VIDEO | REFERENCE_2_VIDEO",
  "aspect_ratio": "16:9 | 9:16 | Auto",
  "enableTranslation": true
}
```

**폴링:** `GET https://api.kie.ai/api/v1/veo/record-info?taskId={taskId}`

```json
{
  "data": {
    "successFlag": 0,
    "response": {
      "resultUrls": ["url"],
      "resolution": "1080p"
    },
    "fallbackFlag": false
  }
}
```
- successFlag: 0=생성중, 1=성공, 2=실패, 3=생성실패

### 1-G. Gemini 3 텍스트/채팅 (OpenAI 호환 형식만)

**⚠️ Kie는 v1beta 엔드포인트 없음! OpenAI 호환 형식만 지원.**

#### Pro
**POST** `https://api.kie.ai/gemini-3-pro/v1/chat/completions`

#### Flash
**POST** `https://api.kie.ai/gemini-3-flash/v1/chat/completions`

```json
{
  "messages": [
    {"role": "system" | "user" | "assistant" | "tool", "content": "array | string"}
  ],
  "stream": false,
  "include_thoughts": false,
  "reasoning_effort": "low" | "high",
  "tools": [{"type": "function", "function": {"name": "googleSearch"}}],
  "response_format": {
    "type": "json_schema",
    "json_schema": {"name": "structured_output", "strict": true, "schema": {}}
  }
}
```

#### 핵심 파라미터 규칙
- `include_thoughts`: 기본 true → **false 권장** (앱에서 reasoning_content 미사용, 토큰 절약)
- `reasoning_effort`: "low" | "high" (기본 "high")
- `response_format`: **json_schema만 지원** (json_object 미지원), tools와 **상호 배타**
- Flash: response_format **미지원** (문서에 파라미터 미포함)
- 모델명은 URL 경로에 지정, body에 model 필드 불필요
- 미디어 입력: `{"type": "image_url", "image_url": {"url": "..."}}` (이미지/비디오/오디오 동일 형식)

#### 응답 (Non-streaming)
```json
{
  "choices": [{
    "message": {
      "content": "응답 텍스트",
      "reasoning_content": "thinking 과정 (include_thoughts=true 시)"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 1,
    "completion_tokens": 698,
    "completion_tokens_details": {"reasoning_tokens": 663, "text_tokens": 0}
  }
}
```

### 1-H. 에러 코드

| 코드 | 의미 |
|------|------|
| 200 | 성공 |
| 400 | 잘못된 요청 / 콘텐츠 정책 위반 |
| 401 | 인증 실패 |
| 402 | 잔액 부족 |
| 429 | Rate limit 초과 |
| 451 | 파일 가져오기 실패 |
| 455 | 서비스 점검 중 |
| 500 | 서버 에러 |
| 501 | 생성 실패 |

### 1-I. 잔액 확인

**GET** `https://api.kie.ai/api/v1/chat/credit`
→ `{"data": 100}` (남은 크레딧)

---

## 2. Laozhang AI

### 인증
```
Authorization: Bearer {LAOZHANG_API_KEY}
Content-Type: application/json
```

### 글로벌 규칙
- RPM: 3,000 / 분, TPM: 1,000,000 / 분
- 동시 연결: 100
- 100% OpenAI API 호환

### 2-A. Gemini 프록시 (OpenAI 호환) — 텍스트/채팅

**POST** `https://api.laozhang.ai/v1/chat/completions`

**⚠️ Laozhang 텍스트/채팅은 OpenAI 호환 형식만! v1beta는 이미지 생성(2-B)과 비디오 분석(2-C) 전용.**

#### 지원 Gemini 3 모델
| Model ID | 용도 |
|----------|------|
| `gemini-3-pro-preview` | 차세대 플래그십, 고급 작업 |
| `gemini-3-pro-preview-thinking` | **Chain-of-thought 추론 (복잡한 분석에 권장)** |
| `gemini-3-flash-preview` | 초고속, 경량 작업 |
| `gemini-3-pro-image-preview` | 이미지 생성 (v1beta 전용) |

```json
{
  "model": "gemini-3-pro-preview-thinking",
  "messages": [
    {"role": "system", "content": "string"},
    {"role": "user", "content": "string | [{type, text, image_url}]"}
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

#### 핵심 규칙
- **response_format 미지원**: Laozhang Gemini 프록시는 response_format 전송 시 응답이 잘리거나 대화체 반환 → **시스템 프롬프트로 JSON 출력 강제**
- **thinking 모델** (`gemini-3-pro-preview-thinking`): 자체 chain-of-thought 내장, 별도 thinkingConfig 파라미터 없음
- 비디오/이미지 입력: `{"type": "image_url", "image_url": {"url": "URL 또는 data:base64"}}` (OpenAI 형식)

**응답:**
```json
{
  "choices": [{
    "message": {
      "content": "string",
      "tool_calls": [{"function": {"name": "str", "arguments": "json"}}]
    }
  }]
}
```

### 2-B. 이미지 생성 (Google Native v1beta)

**POST** `https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent`

#### ⚠️ 요청/응답 케이싱 규칙 (필독)
- **요청 Base64**: `inline_data` + `mime_type` (**snake_case**)
- **요청 URL**: `fileData` + `fileUri` + `mimeType` (**camelCase**)
- **응답**: `inlineData` + `mimeType` (**camelCase**)

#### Text-to-Image
```json
{
  "contents": [{"parts": [{"text": "프롬프트"}]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {"aspectRatio": "16:9", "imageSize": "2K"}
  }
}
```

#### Image-to-Image (Base64 입력)
```json
{
  "contents": [{"parts": [
    {"text": "편집 지시"},
    {"inline_data": {"mime_type": "image/jpeg", "data": "BASE64"}}
  ]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {"aspectRatio": "1:1", "imageSize": "2K"}
  }
}
```

#### Image-to-Image (URL 입력)
```json
{
  "contents": [{"parts": [
    {"fileData": {"fileUri": "https://...", "mimeType": "image/png"}},
    {"text": "편집 지시"}
  ]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {"aspectRatio": "16:9", "imageSize": "4K"}
  }
}
```

#### 응답
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inlineData": {"mimeType": "image/png", "data": "BASE64"}
      }]
    },
    "finishReason": "STOP | SAFETY | RECITATION"
  }],
  "promptFeedback": {"blockReason": "SAFETY"}
}
```

#### 파라미터
- aspectRatio: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9, 3:2, 2:3, 5:4, 4:5
- imageSize: "1K", "2K", "4K"
- 가격: $0.05/장
- 파일 크기: 권장 5MB, 최대 10MB
- 다중 이미지: 최대 14장

### 2-C. 비디오 분석 (Google Native v1beta)

**POST** `https://api.laozhang.ai/v1beta/models/gemini-2.5-flash:generateContent`

```json
{
  "contents": [{"parts": [
    {"fileData": {"mimeType": "video/mp4", "fileUri": "URL"}},
    {"text": "분석 프롬프트"}
  ]}],
  "generationConfig": {
    "responseMimeType": "application/json",
    "temperature": 0.3,
    "maxOutputTokens": 8000
  },
  "safetySettings": [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}
  ]
}
```

### 2-D. Veo 영상 생성 (비동기 API)

#### 작업 생성
**POST** `https://api.laozhang.ai/v1/videos`

FormData 형식:
```
model: "veo-3.1-landscape-fast-fl" | "veo-3.1-fast-fl"
prompt: "string"
size: "1280x720" | "720x1280"
image: File (multipart/form-data)
```

**응답:** `{"id": "video_abc123"}`

#### 상태 폴링
**GET** `https://api.laozhang.ai/v1/videos/{id}`

```json
{"status": "queued | processing | completed | failed"}
```

#### 콘텐츠 가져오기
**GET** `https://api.laozhang.ai/v1/videos/{id}/content`

```json
{"url": "https://video-url.mp4"}
```

#### 작업 취소
**DELETE** `https://api.laozhang.ai/v1/videos/{id}`

- 폴링 간격: 5-10초
- 작업 유효: 24시간
- 영상 URL 유효: 24시간
- 실패 시 과금 없음

### 2-E. 에러 코드

| 코드 | 의미 |
|------|------|
| 400 | 잘못된 파라미터 |
| 401 | 잘못된 API 키 (`sk-` 접두사 확인) |
| 402 | 잔액 부족 |
| 429 | Rate limit 초과 (exponential backoff 권장) |
| 500 | 서버 에러 |

---

## 3. Apimart (Veo 3.1 1080p)

### 인증
```
Authorization: Bearer {APIMART_API_KEY}
```

### 3-A. 영상 생성

**POST** `https://api.apimart.ai/v1/videos/generations`

```json
{
  "model": "veo3.1-fast",
  "prompt": "string (100-150 words 권장)",
  "duration": 8,
  "aspect_ratio": "16:9 | 9:16",
  "image_urls": ["url"],
  "resolution": "1080p"
}
```

**응답:**
```json
{"data": [{"task_id": "string"}]}
```

### 3-B. 상태 폴링

**GET** `https://api.apimart.ai/v1/tasks/{task_id}`

```json
{
  "data": {
    "status": "processing | completed | succeeded | success | failed",
    "progress": 45,
    "result": {
      "videos": [{"url": "string | [string]"}]
    },
    "video_url": "string",
    "output": "string",
    "error": {"message": "string"}
  }
}
```

### 3-C. 가격
- veo3.1-fast: $0.08/영상
- veo3.1-quality: $0.60/영상
- 취소 미지원

---

## 4. Cloudinary

### 인증
- Unsigned upload (upload_preset 사용)
- Bearer 토큰 불필요

### 4-A. 파일 업로드

**POST** `https://api.cloudinary.com/v1_1/{cloudName}/auto/upload`

FormData:
```
file: File | Blob | remote_url_string
upload_preset: string
resource_type: "auto"
```

**응답:**
```json
{
  "secure_url": "https://res.cloudinary.com/...",
  "error": {"message": "string"}
}
```

### 4-B. 설정
- `getCloudinaryConfig().cloudName` / `.uploadPreset` 으로 접근
- 10MB+ 이미지는 자동 압축 (JPEG 0.85)

---

## 5. Remove.bg

### 인증
```
X-Api-Key: {REMOVE_BG_API_KEY}
```

### 5-A. 배경 제거

**POST** `https://api.remove.bg/v1.0/removebg`

FormData:
```
image_file: File
size: "preview"
format: "png"
```

**응답:** Binary blob (PNG, 투명 배경)

**에러:**
```json
{"errors": [{"title": "string"}]}
```
- 402: 크레딧 부족 (무료 월 50회)
- 403: 잘못된 API 키

---

## 6. WaveSpeed AI

### 인증
```
Authorization: Bearer {WAVESPEED_API_KEY}
```
- API 키는 충전 후 활성화됨

### 6-A. 워터마크 제거 작업 생성

**POST** `https://api.wavespeed.ai/api/v3/wavespeed-ai/video-watermark-remover`

```json
{"video": "https://video-url.mp4"}
```

**응답:**
```json
{"data": {"id": "prediction_abc123", "status": "created"}}
```

### 6-B. 결과 폴링

**GET** `https://api.wavespeed.ai/api/v3/predictions/{id}/result`

```json
{
  "data": {
    "status": "created | processing | completed | succeeded | failed",
    "outputs": ["https://result-video.mp4"],
    "output": "https://result-video.mp4",
    "error": "string"
  }
}
```

### 6-C. 가격
- $0.01/초, 최소 $0.05 (5초)
- 최대 10분 영상
- 최대 파일: 500MB

---

## 7. Evolink AI

### 인증
```
Authorization: Bearer {EVOLINK_API_KEY}
Content-Type: application/json
```
- Base URL: `https://api.evolink.ai`
- 키 형식: `sk-` 접두사

### 7-A. Gemini 3.1 Pro (Google Native v1beta — 동기)

**POST** `https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent`

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{"text": "프롬프트"}]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 4096,
    "responseMimeType": "application/json"
  },
  "safetySettings": [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}
  ],
  "systemInstruction": {
    "parts": [{"text": "시스템 프롬프트"}]
  }
}
```

**⚠️ 핵심 규칙:**
- `contents` 내 각 항목에 반드시 `role: "user"` 또는 `role: "model"` 포함 필수
- role 누락 시 400 에러: "Please use a valid role: user, model."
- 모델명: `gemini-3.1-pro-preview` (단일 모델, 모든 Gemini 3.x 대체)
- thinkingConfig, responseMimeType, safetySettings 네이티브 지원

**응답:**
```json
{
  "candidates": [{
    "content": {
      "parts": [{"text": "응답 텍스트"}],
      "role": "model"
    },
    "finishReason": "STOP"
  }],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 50,
    "totalTokenCount": 60
  }
}
```

### 7-B. Chat Completions (OpenAI 호환 — 동기)

**POST** `https://api.evolink.ai/v1/chat/completions`

```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {"role": "system", "content": "시스템 프롬프트"},
    {"role": "user", "content": "사용자 메시지"}
  ],
  "max_tokens": 4096,
  "temperature": 0.7,
  "stream": false,
  "response_format": {"type": "json_schema", "json_schema": {}}
}
```

**응답:**
```json
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "응답"},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 10, "completion_tokens": 50, "total_tokens": 60}
}
```

### 7-C. Nanobanana 2 이미지 생성 (비동기 태스크)

**POST** `https://api.evolink.ai/v1/images/generations`

```json
{
  "model": "gemini-3.1-flash-image-preview",
  "prompt": "이미지 프롬프트",
  "n": 1,
  "size": "16:9",
  "quality": "2K",
  "image_urls": ["https://ref-image-url.jpg"]
}
```

#### size 파라미터 (필수)
`auto | 1:1 | 2:3 | 3:2 | 3:4 | 4:3 | 4:5 | 5:4 | 9:16 | 16:9 | 21:9 | 1:4 | 4:1 | 1:8 | 8:1`

**⚠️ "1024x1024" 같은 픽셀 크기 사용 불가 — 비율 문자열만 지원**

#### quality 파라미터
`"0.5K" | "1K" | "2K" | "4K"` (기본: "2K")

#### 참조 이미지
- `image_urls`: URL 배열 (base64 불가 → Cloudinary 업로드 후 URL 사용)

**응답 (태스크 생성):**
```json
{
  "created": 1772367561,
  "id": "task-unified-1772367561-xxxxx",
  "model": "gemini-3.1-flash-image-preview",
  "object": "image.generation.task",
  "progress": 0,
  "status": "pending"
}
```

- 가격: ~$0.04/장
- 생성 시간: ~30-60초
- 폴링 간격: 3초 권장

### 7-D. 태스크 폴링 (이미지/비디오 공용)

**GET** `https://api.evolink.ai/v1/tasks/{task_id}`

```
Authorization: Bearer {EVOLINK_API_KEY}
```

**응답:**
```json
{
  "created": 1772367561,
  "id": "task-unified-xxxxx",
  "model": "gemini-3.1-flash-image-preview",
  "object": "image.generation.task",
  "progress": 90,
  "results": ["https://files.evolink.ai/.../image.png"],
  "status": "pending | processing | completed | failed",
  "task_info": {"can_cancel": true},
  "type": "image"
}
```

#### status 값
| status | 의미 |
|--------|------|
| `pending` | 대기 중 |
| `processing` | 생성 중 (progress 0~99) |
| `completed` | 완료 — `results` 배열에 URL |
| `failed` | 실패 |

#### 핵심 규칙
- 이미지 폴링: 3초 간격, 최대 120회 (6분)
- 비디오 폴링: 5초 간격, 최대 120회 (10분)
- `results[0]`에서 첫 번째 URL 추출
- `progress` 값으로 진행률 표시 가능

### 7-E. Veo 3.1 Fast 비디오 생성 (비동기 태스크)

**POST** `https://api.evolink.ai/v1/videos/generations`

```json
{
  "model": "veo-3.1-fast-generate-preview",
  "prompt": "영상 프롬프트 (100-150 words 권장)",
  "generation_type": "TEXT",
  "aspect_ratio": "16:9",
  "duration": 8,
  "quality": "1080p",
  "generate_audio": true,
  "n": 1,
  "image_urls": ["https://first-frame.jpg"]
}
```

#### generation_type
| 값 | 설명 | image_urls |
|----|------|-----------|
| `TEXT` | 텍스트→비디오 | 불필요 |
| `FIRST&LAST` | 첫/끝 프레임 기반 | 1~2개 URL |
| `REFERENCE` | 참조 이미지 기반 | 1개 URL |

#### 파라미터
- `aspect_ratio`: `"16:9"` | `"9:16"`
- `duration`: `4` | `6` | `8` (초)
- `quality`: `"720p"` | `"1080p"` | `"4k"`
- `generate_audio`: `true` | `false`

**응답 (태스크 생성):**
```json
{
  "created": 1772367605,
  "id": "task-unified-1772367605-xxxxx",
  "model": "veo-3.1-fast-generate-preview",
  "object": "video.generation.task",
  "progress": 0,
  "status": "pending",
  "task_info": {"can_cancel": true}
}
```

- 가격: ~$0.07/영상 (1080p)
- 폴링: `GET /v1/tasks/{task_id}` (7-D와 동일)
- 폴링 간격: 5초 권장

### 7-F. 에러 코드

| 코드 | 의미 |
|------|------|
| 400 | 잘못된 파라미터 (size 형식 오류, role 누락 등) |
| 401 | 인증 실패 — API 키 확인 |
| 402 | 잔액 부족 — 크레딧 충전 필요 |
| 429 | Rate limit 초과 |
| 500 | 서버 에러 |

### 7-G. 모델명 매핑

| 기존 코드 모델명 | Evolink 모델명 |
|-----------------|---------------|
| `gemini-3-pro-preview` | `gemini-3.1-pro-preview` |
| `gemini-3-flash-preview` | `gemini-3.1-pro-preview` |
| `gemini-3-pro-preview-thinking` | `gemini-3.1-pro-preview` |
| (이미지) | `gemini-3.1-flash-image-preview` |
| (비디오) | `veo-3.1-fast-generate-preview` |

### 7-H. 우선순위 폴백 체인 (현재 적용 중)

| 기능 | 1순위 | 2순위 | 3순위 |
|------|-------|-------|-------|
| Gemini 텍스트 | Evolink v1beta | Laozhang OpenAI | Kie OpenAI |
| 이미지 생성 | Evolink Nanobanana 2 | Laozhang v1beta | Kie |
| 영상 Veo 1080p | Evolink Veo 3.1 | — | — |
| 영상 Grok | Kie (변경 없음) | — | — |
| AI 채팅 (채널분석) | Evolink Chat | Laozhang Chat | — |

---

## 8. 환율 API (유틸리티)

**GET** `https://open.er-api.com/v6/latest/USD`

```json
{"rates": {"KRW": 1350}, "time_last_update_utc": "ISO date"}
```
- 실패 시 `PRICING.EXCHANGE_RATE` 하드코딩 값 사용

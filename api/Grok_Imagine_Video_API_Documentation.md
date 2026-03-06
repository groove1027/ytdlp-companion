# Grok Imagine Video API 기술 문서

> **소스:** https://evolink.ai/ko/grok-imagine-video?model=grok-video-image
> **제공:** EvoLink.AI
> **원본 기술:** xAI Grok Imagine

---

## 목차

- [1. 개요](#1-개요)
- [2. Model Type](#2-model-type)
- [3. API Reference](#3-api-reference)
  - [3.1 Authentication](#31-authentication)
  - [3.2 POST /v1/videos/generations — Create Video](#32-post-v1videosgenerations--create-video)
    - [3.2.1 Text to Video (grok-imagine-text-to-video)](#321-text-to-video-grok-imagine-text-to-video)
    - [3.2.2 Image to Video (grok-imagine-image-to-video)](#322-image-to-video-grok-imagine-image-to-video)
  - [3.3 GET /v1/tasks/{task_id} — Query Task Status](#33-get-v1taskstask_id--query-task-status)
- [4. Playground](#4-playground)
  - [4.1 Text to Video Playground](#41-text-to-video-playground)
  - [4.2 Image to Video Playground](#42-image-to-video-playground)
  - [4.3 JSON Mode](#43-json-mode)
  - [4.4 History](#44-history)
- [5. Pricing](#5-pricing)
  - [5.1 Text to Video 가격](#51-text-to-video-가격)
  - [5.2 Image to Video 가격](#52-image-to-video-가격)
- [6. README](#6-readme)
  - [6.1 What you can build with Grok Imagine Video API](#61-what-you-can-build-with-grok-imagine-video-api)
  - [6.2 Why choose Grok Imagine Video API](#62-why-choose-grok-imagine-video-api)
  - [6.3 How to use Grok Imagine Video API](#63-how-to-use-grok-imagine-video-api)
  - [6.4 Key features of Grok Imagine Video API](#64-key-features-of-grok-imagine-video-api)
- [7. FAQ](#7-faq)
- [8. Footer](#8-footer)

---

## 1. 개요

**Grok Imagine Video API**

Transform your ideas into dynamic 6-10 second videos with xAI's Grok Imagine. Choose from fun, normal, or spicy style modes to match your creative vision—no video editing skills required.

- **Run With API →**
- **Copy page**

---

## 2. Model Type

페이지 상단에서 두 가지 모델 타입을 선택할 수 있습니다:

| Model Type | 설명 |
|-----------|------|
| **Text to Video** | 텍스트 프롬프트로부터 비디오 생성 |
| **Image to Video** | 이미지와 텍스트 프롬프트로부터 비디오 생성 |

---

## 3. API Reference

### 3.1 Authentication

All APIs require Bearer Token authentication.

| 위치 | 헤더 | 값 |
|------|------|-----|
| HEADER | Authorization | `Bearer YOUR_API_KEY` |

> **Get API Key** — API 키는 EvoLink.AI 대시보드에서 발급받을 수 있습니다.

---

### 3.2 POST /v1/videos/generations — Create Video

#### Select endpoint

| Method | 엔드포인트 | 설명 |
|--------|-----------|------|
| **POST** | `/v1/videos/generations` | Create Video |
| **GET** | `/v1/tasks/{task_id}` | Query Task Status |

---

#### 3.2.1 Text to Video (grok-imagine-text-to-video)

Grok Imagine Text to Video (grok-imagine-text-to-video) - Generate video from text prompt.

- Asynchronous processing mode, use the returned task ID to query status.
- Generated video links are valid for 24 hours, please save them promptly.

##### Request Parameters

| 파라미터 | 타입 | 필수 여부 | 기본값 | 설명 |
|----------|------|-----------|--------|------|
| `model` | string | **REQUIRED** | `grok-imagine-text-to-video` | Video generation model name. |
| `prompt` | string | **REQUIRED** | — | Text prompt describing the video content to generate. |
| `duration` | integer | Optional | `6` | Video duration in seconds. |
| `quality` | string | Optional | `480p` | Video resolution quality. |
| `mode` | string | Optional | `normal` | Style mode for video generation. |
| `aspect_ratio` | string | Optional | `16:9` | Video aspect ratio (Text-to-Video only). |
| `callback_url` | string | Optional | — | HTTPS callback address after task completion. |

##### model

Video generation model name.

- **EXAMPLE:** `grok-imagine-text-to-video`

##### prompt

Text prompt describing the video content to generate.

- **EXAMPLE:** `A cat playing piano in a cozy room`

##### duration

Video duration in seconds.

| Value | Description |
|-------|-------------|
| `6` | 6 seconds |
| `10` | 10 seconds |

- **EXAMPLE:** `6`

##### quality

Video resolution quality.

| Value | Description |
|-------|-------------|
| `480p` | Standard definition (default) |
| `720p` | High definition |

- **EXAMPLE:** `480p`

##### mode

Style mode for video generation.

| Value | Description |
|-------|-------------|
| `fun` | Playful and creative style |
| `normal` | Balanced and natural style |
| `spicy` | Bold and dramatic style |

- **EXAMPLE:** `normal`

##### aspect_ratio

Video aspect ratio (Text-to-Video only).

| Value | Description |
|-------|-------------|
| `16:9` | Landscape |
| `9:16` | Portrait |
| `3:2` | Landscape |
| `2:3` | Portrait |
| `1:1` | Square |

- **EXAMPLE:** `16:9`

##### callback_url

HTTPS callback address after task completion.

- **NOTES:**
  - Triggered on completion, failure, or cancellation
  - HTTPS only
  - Max length: 2048 chars
  - Timeout: 10s, Max 3 retries
- **EXAMPLE:** `https://your-domain.com/webhooks/video-completed`

##### Request Example (Text to Video)

```json
{
  "model": "grok-imagine-text-to-video",
  "prompt": "A cat playing piano in a cozy room",
  "duration": 6,
  "quality": "480p",
  "mode": "normal",
  "aspect_ratio": "16:9"
}
```

##### Response Example (Text to Video)

```json
{
  "created": 1757169743,
  "id": "task-unified-1757169743-abc123",
  "model": "grok-imagine-text-to-video",
  "object": "video.generation.task",
  "progress": 0,
  "status": "pending",
  "task_info": {
    "can_cancel": true,
    "estimated_time": 120,
    "video_duration": 6
  },
  "type": "video",
  "usage": {
    "billing_rule": "per_call",
    "credits_reserved": 4.6,
    "user_group": "default"
  }
}
```

---

#### 3.2.2 Image to Video (grok-imagine-image-to-video)

Grok Imagine Image to Video (grok-imagine-image-to-video) - Generate video from image and text prompt.

- Asynchronous processing mode, use the returned task ID to query status.
- Generated video links are valid for 24 hours, please save them promptly.

##### Request Parameters

| 파라미터 | 타입 | 필수 여부 | 기본값 | 설명 |
|----------|------|-----------|--------|------|
| `model` | string | **REQUIRED** | `grok-imagine-image-to-video` | Video generation model name. |
| `prompt` | string | **REQUIRED** | — | Text prompt describing the video content to generate. |
| `image_urls` | array | **REQUIRED** | — | Reference image URL list for image-to-video generation. |
| `duration` | integer | Optional | `6` | Video duration in seconds. |
| `quality` | string | Optional | `480p` | Video resolution quality. |
| `mode` | string | Optional | `normal` | Style mode for video generation. |
| `callback_url` | string | Optional | — | HTTPS callback address after task completion. |

##### model

Video generation model name.

- **EXAMPLE:** `grok-imagine-image-to-video`

##### prompt

Text prompt describing the video content to generate.

- **EXAMPLE:** `A cat playing piano in a cozy room`

##### image_urls

Reference image URL list for image-to-video generation.

- **NOTES:**
  - Required for Image-to-Video mode
  - Max 1 image
  - Max size: 10MB per image
  - Formats: .jpg, .jpeg, .png, .webp
  - URLs must be directly accessible
- **EXAMPLE:** `https://example.com/image.jpg`

##### duration

Video duration in seconds.

| Value | Description |
|-------|-------------|
| `6` | 6 seconds |
| `10` | 10 seconds |

- **EXAMPLE:** `6`

##### quality

Video resolution quality.

| Value | Description |
|-------|-------------|
| `480p` | Standard definition (default) |
| `720p` | High definition |

- **EXAMPLE:** `480p`

##### mode

Style mode for video generation.

| Value | Description |
|-------|-------------|
| `fun` | Playful and creative style |
| `normal` | Balanced and natural style |
| `spicy` | Bold and dramatic style |

- **EXAMPLE:** `normal`

##### callback_url

HTTPS callback address after task completion.

- **NOTES:**
  - Triggered on completion, failure, or cancellation
  - HTTPS only
  - Max length: 2048 chars
  - Timeout: 10s, Max 3 retries
- **EXAMPLE:** `https://your-domain.com/webhooks/video-completed`

##### Request Example (Image to Video)

```json
{
  "model": "grok-imagine-image-to-video",
  "prompt": "A cat walking gracefully",
  "image_urls": ["https://example.com/cat.jpg"],
  "duration": 6,
  "quality": "480p",
  "mode": "normal"
}
```

##### Response Example (Image to Video)

```json
{
  "created": 1757169743,
  "id": "task-unified-1757169743-abc123",
  "model": "grok-imagine-image-to-video",
  "object": "video.generation.task",
  "progress": 0,
  "status": "pending",
  "task_info": {
    "can_cancel": true,
    "estimated_time": 120,
    "video_duration": 6
  },
  "type": "video",
  "usage": {
    "billing_rule": "per_call",
    "credits_reserved": 4.6,
    "user_group": "default"
  }
}
```

> **Text to Video와 Image to Video의 차이점:**
> - Image to Video에는 `image_urls` 파라미터가 **필수**로 추가됩니다.
> - Image to Video에는 `aspect_ratio` 파라미터가 **없습니다** (이미지의 비율을 따릅니다).

---

### 3.3 GET /v1/tasks/{task_id} — Query Task Status

Query the status, progress, and result information of asynchronous tasks by task ID.

Use the task ID returned from the generation endpoint to poll for completion.

##### Path Parameters

| 파라미터 | 타입 | 필수 여부 | 설명 |
|----------|------|-----------|------|
| `task_id` | string | **REQUIRED** | The unique identifier of the task returned from the generation endpoint. |

- **NOTES:**
  - Ignore `{}` when querying - append the actual task ID to the path
  - Task IDs follow the format: `task-unified-{timestamp}-{random}`
- **EXAMPLE:** `task-unified-1756817821-4x3rx6ny`

##### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `created` | integer | Task creation timestamp (Unix epoch) |
| `id` | string | Unique task identifier |
| `model` | string | Model used for generation |
| `object` | string | Object type identifier — `video.generation.task` |
| `progress` | integer | Progress percentage — `0-100` |
| `results` | array | Generated result URLs — Only when completed |
| `status` | string | `pending` / `processing` / `completed` / `failed` |
| `task_info` | object | Task metadata (can_cancel, estimated_time, etc.) |
| `type` | string | Task type — `video` |

##### Response Example (Completed)

```json
{
  "created": 1756817821,
  "id": "task-unified-1756817821-4x3rx6ny",
  "model": "grok-imagine-text-to-video",
  "object": "video.generation.task",
  "progress": 100,
  "results": [
    "https://cdn.evolink.ai/videos/generated-video-abc123.mp4"
  ],
  "status": "completed",
  "task_info": {
    "can_cancel": false
  },
  "type": "video"
}
```

##### Important Notes

- Result URLs are valid for **24 hours**. Download and save them promptly.
- Poll the endpoint every **3-5 seconds** until status is `completed` or `failed`.
- Task results are retained for **7 days** after completion.

---

## 4. Playground

페이지 내 Playground 탭에서 직접 API를 테스트할 수 있습니다. **Form Mode**와 **JSON Mode** 두 가지 입력 방식을 제공합니다.

### 4.1 Text to Video Playground

| 필드 | 입력 방식 | 옵션 / 설명 |
|------|-----------|-------------|
| **Prompt** | 텍스트 입력 | 0 (suggested: 2,000) 글자 |
| **Duration** | 버튼 선택 | `6s` / `10s` |
| **Resolution** | 버튼 선택 | `480p` / `720p` |
| **Style Mode** | 버튼 선택 | `Fun` / `Normal` / `Spicy` |
| **Aspect Ratio** | 버튼 선택 | `16:9` / `9:16` / `3:2` / `2:3` / `1:1` |

- **Reset** — 모든 설정 초기화
- **Generate →** — 비디오 생성 실행
- 하단에 예상 크레딧 비용 표시 (예: `13.80 Cr ≈ $0.1917`)

### 4.2 Image to Video Playground

| 필드 | 입력 방식 | 옵션 / 설명 |
|------|-----------|-------------|
| **Prompt** | 텍스트 입력 | 0 (suggested: 2,000) 글자 |
| **Input Images** * | 파일 업로드 | Upload 1 image for video generation |
| **Duration** | 버튼 선택 | `6s` / `10s` |
| **Resolution** | 버튼 선택 | `480p` / `720p` |
| **Style Mode** | 버튼 선택 | `Fun` / `Normal` / `Spicy` |

**Input Images 업로드 안내:**

- Click to upload or drag and drop
- Supported formats: JPG, JPEG, PNG, WEBP
- Maximum file size: 10MB; Maximum files: 1
- **Select files** 버튼으로 파일 선택

> **참고:** Image to Video에는 **Aspect Ratio** 옵션이 없습니다.

### 4.3 JSON Mode

Playground에서 **JSON Mode** 탭을 선택하면 Request JSON을 직접 편집하여 API를 호출할 수 있습니다.

- **Request JSON** — JSON 형태의 요청 본문을 직접 편집
- **Copy** — JSON 복사
- **Reset** — 초기화
- **Generate →** — 비디오 생성 실행

### 4.4 History

Playground 우측에 **Preview** / **JSON** 탭과 **기록** 패널이 표시됩니다.

- **Preview** — 생성된 비디오 미리보기
- **JSON** — 응답 JSON 확인
- **No Task Running** — Click Generate to see preview
- **기록** — 최대 20개 항목
  - `0 실행 중 · 0 완료됨`
  - 여기에 생성 기록이 표시됩니다

---

## 5. Pricing

### 5.1 Text to Video 가격

| MODEL | MODE | RESOLUTION | DURATION | PRICE |
|-------|------|------------|----------|-------|
| Text to Video | Text to Video | 480p | 6s | **$0.0639/ video** (4.6 Credits) — ⭐ Popular |
| Text to Video | Text to Video | 480p | 10s | **$0.1278/ video** (9.2 Credits) |
| Text to Video | Text to Video | 720p | 6s | **$0.1278/ video** (9.2 Credits) |
| Text to Video | Text to Video | 720p | 10s | **$0.1917/ video** (13.8 Credits) |

### 5.2 Image to Video 가격

| MODEL | MODE | RESOLUTION | DURATION | PRICE |
|-------|------|------------|----------|-------|
| Image to Video | Image to Video | 480p | 6s | **$0.0639/ video** (4.6 Credits) — ⭐ Popular |
| Image to Video | Image to Video | 480p | 10s | **$0.1278/ video** (9.2 Credits) |
| Image to Video | Image to Video | 720p | 6s | **$0.1278/ video** (9.2 Credits) |
| Image to Video | Image to Video | 720p | 10s | **$0.1917/ video** (13.8 Credits) |

> If it's down, we automatically use the next cheapest available—ensuring 99.9% uptime at the best possible price.

---

## 6. README

### 6.1 What you can build with Grok Imagine Video API

**Text to Video Generation**

Transform your text prompts into dynamic videos with Grok Imagine. Choose from fun, normal, or spicy modes to match your creative vision.

→ Generate from text

**Image to Video Animation**

Bring your static images to life with Grok Imagine's image-to-video capability. Upload an image and describe the motion you want.

→ Animate images

**Creative Content at Scale**

Generate multiple video variations quickly for social media, marketing campaigns, or creative projects.

→ Scale your content

---

### 6.2 Why choose Grok Imagine Video API

Grok Imagine Video API offers flexible video generation with unique style modes for creative content creation.

**Multiple Style Modes**

Choose from fun, normal, or spicy modes to match your creative vision and content requirements.

**Text and Image Support**

Generate videos from text prompts or animate existing images with natural motion.

**Flexible Duration**

Create 6 or 10 second videos with multiple aspect ratio options for different platforms.

---

### 6.3 How to use Grok Imagine Video API

Follow these steps to generate videos with Grok Imagine Video API.

| Step | 제목 | 설명 |
|------|------|------|
| **1** | Prepare your input | Write a text prompt or prepare an image URL for image-to-video generation. |
| **2** | Configure parameters | Set duration (6s or 10s), mode (fun/normal/spicy), and aspect ratio for text-to-video. |
| **3** | Generate and download | Submit your request and download the generated video when ready. |

→ View API docs

---

### 6.4 Key features of Grok Imagine Video API

Powerful video generation capabilities from xAI.

| 아이콘 | Feature | 설명 |
|--------|---------|------|
| **T2V** | Text-to-Video | Generate videos directly from text descriptions with customizable parameters. |
| **I2V** | Image-to-Video | Animate static images into dynamic videos with natural motion. |
| **Modes** | Style Modes | Choose from fun, normal, or spicy modes for different creative effects. |
| **Duration** | Flexible Duration | Generate 6 or 10 second videos based on your needs. |
| **Formats** | Aspect Ratios | Support for 16:9, 9:16, and 1:1 aspect ratios for different platforms. |
| **API** | Easy Integration | Simple API integration through Evolink AI's unified interface. |

---

## 7. FAQ

**Grok Imagine Video API: FAQ**

Everything you need to know about the product and billing.

**Q: What is Grok Imagine Video API?**

A: Grok Imagine Video API is xAI's video generation service that creates videos from text prompts or images. It supports multiple style modes and duration options.

**Q: What are the style modes?**

A: Grok Imagine offers three style modes: fun (playful and creative), normal (balanced and natural), and spicy (bold and dramatic).

**Q: What video durations are supported?**

A: You can generate 6-second or 10-second videos with Grok Imagine Video API.

**Q: What aspect ratios are available?**

A: Text-to-video supports 16:9 (landscape), 9:16 (portrait), and 1:1 (square) aspect ratios.

---

## 8. Footer

**EvoLink.AI**

전 세계 최고 AI 이미지, 비디오, 채팅 모델에 액세스하는 단일 API.

- **이메일:** support@evolink.ai
- **커뮤니티:** Discord 커뮤니티

### 이미지 API

Nano Banana, Nano Banana Pro, Seedream 4, Seedream 4.5, Qwen Image Edit, GPT-4o Image, GPT Image 1.5, Z-Image Turbo, Wan Image

### 비디오 API

Sora 2, Sora 2 Pro, Kling O1, Seedance 1.0, Veo 3.1, Seedance 1.5 Pro, Wan 2.6, Wan 2.5, Hailuo 02, Hailuo 2.3

### 채팅 API

GPT-5.2, GPT-5.1, Claude Sonnet 4.5, Gemini 2.5 Pro, Gemini 2.5 Flash, Kimi K2 Turbo

### 코딩 API

GPT-5.2, Claude Opus 4.5, Claude Opus 4.1, Claude Sonnet 4.5, Claude Sonnet 4.0, Claude Haiku 4.5, Gemini 3 Pro, Gemini 3 Flash, Kimi K2 Thinking

### 기타 API

Suno Music, OmniHuman 1.5

### 링크

- 제품
- 모델
- 문서
- 블로그

### 리소스

- API 업데이트
- 약관
- 개인정보

---

© 2025 EvoLink. All rights reserved.

전 세계 개발자를 위해 정밀하게 제작됨

---

### 페이지 상단 배너

> **Seedance 2.0 API — Coming Soon**
> Get early access

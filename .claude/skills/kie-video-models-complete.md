# KIE AI 비디오 모델 전체 API 기술 문서 (원본 무삭제·무축약)

> **최종 수집일**: 2026-03-17
> **출처**: https://docs.kie.ai/ (공식 문서 전수 조사)
> **크레딧 환율**: 1 credit = $0.005 USD

---

## 목차

1. [공통 API](#공통-api)
2. [Runway API](#runway-api)
3. [Veo 3.1 API](#veo-31-api)
4. [Grok Imagine](#grok-imagine)
5. [Kling 3.0](#kling-30)
6. [Kling 2.6](#kling-26)
7. [Kling AI Avatar](#kling-ai-avatar)
8. [Bytedance Seedance 1.5 Pro](#bytedance-seedance-15-pro)
9. [Bytedance Seedance 1.0](#bytedance-seedance-10)
10. [Hailuo 2.3](#hailuo-23)
11. [Hailuo 02](#hailuo-02)
12. [Sora 2](#sora-2)
13. [Sora 2 Pro](#sora-2-pro)
14. [Sora 2 Characters](#sora-2-characters)
15. [Sora Watermark Remover](#sora-watermark-remover)
16. [Wan 2.6](#wan-26)
17. [전체 가격 비교표](#전체-가격-비교표)
18. [애니메이션 적합성 분석](#애니메이션-적합성-분석)

---

## 공통 API

### Get Task Details (모든 Market 모델 공통)

- **URL**: `GET https://api.kie.ai/api/v1/jobs/recordInfo`
- **인증**: `Authorization: Bearer YOUR_API_KEY`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | 태스크 생성 시 반환된 고유 식별자 |

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `data.taskId` | string | 고유 태스크 식별자 |
| `data.model` | string | 사용된 모델명 |
| `data.state` | string (enum) | 현재 태스크 상태 |
| `data.param` | string | 원본 요청 파라미터 JSON 문자열 |
| `data.resultJson` | string | 생성 결과 URL JSON 문자열 (state=success 시에만) |
| `data.failCode` | string | 실패 코드 (성공 시 빈 문자열) |
| `data.failMsg` | string | 실패 메시지 (성공 시 빈 문자열) |
| `data.costTime` | integer (int64) | 처리 시간 (밀리초) |
| `data.completeTime` | integer (int64) | 완료 타임스탬프 (Unix ms) |
| `data.createTime` | integer (int64) | 생성 타임스탬프 (Unix ms) |
| `data.updateTime` | integer (int64) | 업데이트 타임스탬프 (Unix ms) |
| `data.progress` | integer | 생성 진행률 0-100 (sora2/sora2 pro 전용) |

#### Task States

| State | Description |
|-------|-------------|
| `waiting` | 대기열에 있음, 처리 대기 중 |
| `queuing` | 처리 대기열에 있음 |
| `generating` | 현재 처리 중 |
| `success` | 성공적으로 완료 |
| `fail` | 실패 |

#### HTTP Status Codes (모든 모델 공통)

| Code | Meaning |
|------|---------|
| 200 | Success - 요청 처리 성공 |
| 400 | Bad Request - taskId 누락/유효하지 않음 |
| 401 | Unauthorized - 인증 자격 누락 또는 유효하지 않음 |
| 402 | Insufficient Credits - 크레딧 부족 |
| 404 | Not Found - 리소스 없음 |
| 422 | Validation Error - 파라미터 검증 실패 |
| 429 | Rate Limited - 요청 제한 초과 |
| 451 | Unauthorized - 이미지 가져오기 실패 |
| 455 | Service Unavailable - 시스템 점검 중 |
| 500 | Server Error - 예기치 않은 오류 |
| 501 | Generation Failed - 콘텐츠 생성 실패 |
| 505 | Feature Disabled - 기능 비활성화 |

---

## Runway API

> **문서**: https://docs.kie.ai/runway-api/generate-ai-video

### Generate AI Video

- **URL**: `POST https://api.kie.ai/api/v1/runway/generate`
- **인증**: `Authorization: Bearer YOUR_API_KEY`

#### Request Body

| Parameter | Type | Required | Description | Values |
|-----------|------|----------|-------------|--------|
| `prompt` | string | Yes | 영상 생성 텍스트 프롬프트. 피사체, 동작, 스타일, 배경을 구체적으로 기술 | 최대 1800자 |
| `duration` | number | Yes | 영상 길이 (초) | `5` 또는 `10` |
| `quality` | string | Yes | 해상도 (1080p는 10초와 호환 불가) | `"720p"` 또는 `"1080p"` |
| `aspectRatio` | string | 조건부 | 비율 (텍스트 전용 시 필수, imageUrl 있으면 무시) | `"16:9"`, `"4:3"`, `"1:1"`, `"3:4"`, `"9:16"` |
| `imageUrl` | string | No | 참조 이미지 URL | URL 문자열 |
| `waterMark` | string | No | 워터마크 텍스트 (빈 문자열 = 없음) | 문자열 |
| `callBackUrl` | string | Yes | 웹훅 URL | URL 문자열 |

#### 제약 사항
- 생성 영상 14일간 보관 후 삭제
- 10초 영상은 1080p 불가
- 텍스트→영상 시 aspectRatio 필수

#### 가격

| Duration | Resolution | Credits | USD |
|----------|-----------|---------|-----|
| 5초 | 720p | 12 | $0.06 |
| 10초 | 720p | 30 | $0.15 |
| 5초 | 1080p | 30 | $0.15 |

#### Response (200)
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "ee603959-debb-48d1-98c4-a6d1c717eba6"
  }
}
```

#### Callback Response
```json
{
  "code": 200,
  "msg": "All generated successfully.",
  "data": {
    "image_url": "https://file.com/m/xxxxxxxx.png",
    "task_id": "ee603959-debb-48d1-98c4-a6d1c717eba6",
    "video_id": "485da89c-7fca-4340-8c04-101025b2ae71",
    "video_url": "https://file.com/k/xxxxxxx.mp4"
  }
}
```

### Get AI Video Details

- **URL**: `GET https://api.kie.ai/api/v1/runway/record-detail`

| Parameter | Location | Type | Required |
|-----------|----------|------|----------|
| `taskId` | Query | String | Yes |

#### Response (200)
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "ee603959-debb-48d1-98c4-a6d1c717eba6",
    "parentTaskId": "",
    "generateParam": {
      "prompt": "...",
      "imageUrl": "...",
      "expandPrompt": true
    },
    "state": "success|wait|queueing|generating|fail",
    "generateTime": "2023-08-15 14:30:45",
    "videoInfo": {
      "videoId": "485da89c-7fca-4340-8c04-101025b2ae71",
      "taskId": "ee603959-debb-48d1-98c4-a6d1c717eba6",
      "videoUrl": "https://file.com/k/xxxxxxx.mp4",
      "imageUrl": "https://file.com/m/xxxxxxxx.png"
    },
    "failCode": 400,
    "failMsg": "Generation failed",
    "expireFlag": 0
  }
}
```

### Callback 구현 요구사항
- 콜백 URL은 공개적으로 접근 가능해야 함
- 15초 내에 HTTP 200 반환 필수
- 3회 연속 재시도 실패 시 콜백 중지
- 영상 URL은 14일 후 만료 — 즉시 다운로드 필요
- 멱등성(idempotent) 처리 구현 권장

---

## Veo 3.1 API

> **문서**: https://docs.kie.ai/veo3-api/

### Generate Veo 3.1 Video

- **URL**: `POST https://api.kie.ai/api/v1/veo/generate`
- **인증**: `Authorization: Bearer YOUR_API_KEY`

#### Request Body

| Parameter | Type | Required | Description | Values |
|-----------|------|----------|-------------|--------|
| `prompt` | string | Yes | 영상 콘텐츠 설명 | 문자열 |
| `imageUrls` | array | No | 이미지 URL 목록 (1~3개, 이미지→영상) | URI 배열 |
| `model` | string | No | 모델 선택 | `"veo3"` 또는 `"veo3_fast"` (기본: `veo3_fast`) |
| `generationType` | string | No | 생성 모드 | `"TEXT_2_VIDEO"`, `"FIRST_AND_LAST_FRAMES_2_VIDEO"`, `"REFERENCE_2_VIDEO"` |
| `aspect_ratio` | string | No | 비율 | `"16:9"`, `"9:16"`, `"Auto"` (기본: `"16:9"`) |
| `seeds` | integer | No | 랜덤 시드 | 10000-99999 |
| `callBackUrl` | string | No | 웹훅 URL | URL |
| `enableFallback` | boolean | No | 백업 모델 폴백 (deprecated) | 기본: `false` |
| `enableTranslation` | boolean | No | 영어 자동 번역 | 기본: `true` |
| `watermark` | string | No | 워터마크 텍스트 | 문자열 |

#### 가격

| Model | Duration | Credits | USD |
|-------|----------|---------|-----|
| Veo 3.1 Fast | 8초 | 80 | $0.40 |
| Veo 3.1 Quality | 8초 | 400 | $2.00 |

#### Callback Response
```json
{
  "code": 200,
  "msg": "Veo3.1 video generated successfully.",
  "data": {
    "taskId": "veo_task_abcdef123456",
    "info": {
      "resultUrls": "[http://example.com/video1.mp4]",
      "originUrls": "[http://example.com/original_video1.mp4]",
      "resolution": "1080p"
    },
    "fallbackFlag": false
  }
}
```

### Extend Veo 3.1 Video

- **URL**: `POST https://api.kie.ai/api/v1/veo/extend`

#### Request Body

| Parameter | Type | Required | Description | Values |
|-----------|------|----------|-------------|--------|
| `taskId` | string | Yes | 원본 영상 생성 태스크 ID | |
| `prompt` | string | Yes | 확장 콘텐츠 설명 | |
| `seeds` | integer | No | 랜덤 시드 | 10000-99999 |
| `model` | string | No | 모델 타입 | `"fast"` (기본), `"quality"` |
| `watermark` | string | No | 워터마크 | |
| `callBackUrl` | string | No | 웹훅 URL | |

### Get 4K Video

- **URL**: `POST https://api.kie.ai/api/v1/veo/get-4k-video`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | 태스크 ID |
| `index` | integer | No | 영상 인덱스 (기본: 0) |
| `callBackUrl` | string | No | 웹훅 URL |

- 4K 처리 시간: ~5-10분
- 크레딧: Fast 모드 2배
- 지원 비율: 16:9, 9:16
- 14일간 보관

---

## Grok Imagine

> **문서**: https://docs.kie.ai/market/grok-imagine/

### Text to Video

- **URL**: `POST https://api.kie.ai/api/v1/jobs/createTask`
- **model**: `"grok-imagine/text-to-video"`

#### Input Parameters

| Parameter | Type | Required | Default | Options | Description |
|-----------|------|----------|---------|---------|-------------|
| `prompt` | string | Yes | — | — | 영상 동작 설명 (최대 5000자, 영어) |
| `aspect_ratio` | string | No | `"2:3"` | `"2:3"`, `"3:2"`, `"1:1"`, `"16:9"`, `"9:16"` | 비율 |
| `mode` | string | No | `"normal"` | `"fun"`, `"normal"`, `"spicy"` | 생성 모드 |
| `duration` | string | No | `"6"` | `"6"`, `"10"`, `"15"` | 영상 길이 (초) |
| `resolution` | string | No | `"480p"` | `"480p"`, `"720p"` | 해상도 |

### Image to Video

- **model**: `"grok-imagine/image-to-video"`

#### Input Parameters

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `image_urls` | array | 조건부 | 외부 이미지 URL (1개) | 최대 1개; JPEG/PNG/WEBP; 10MB; spicy 모드 불가 |
| `task_id` | string | 조건부 | 기존 Grok 이미지 태스크 ID | image_urls와 동시 사용 불가 |
| `index` | integer | No | task_id 사용 시 이미지 인덱스 (0-based) | 0-5 (Grok은 태스크당 6개 이미지 생성) |
| `prompt` | string | No | 동작 설명 (최대 5000자, 영어) | |
| `mode` | string | No | 생성 모드 (기본: `"normal"`) | `"fun"`, `"normal"`, `"spicy"` |
| `duration` | string | No | 영상 길이 (기본: `"6"`) | `"6"`, `"10"`, `"15"` |
| `resolution` | string | No | 해상도 (기본: `"480p"`) | `"480p"`, `"720p"` |

### Video Upscale

- **model**: `"grok-imagine/upscale"`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input.task_id` | string | Yes | 이전 성공한 영상 태스크 ID (KIE 모델만) |

#### 가격

| Duration | Resolution | Credits | USD |
|----------|-----------|---------|-----|
| 6초 | 480p | 10 | $0.05 |
| 6초 | 720p | 20 | $0.10 |
| 10초 | 480p | 20 | $0.10 |
| 10초 | 720p | 30 | $0.15 |
| 15초 | 480p | 30 | $0.15 |
| 15초 | 720p | 40 | $0.20 |
| Upscale | — | 10 | $0.05 |

---

## Kling 3.0

> **문서**: https://docs.kie.ai/market/kling/kling-3-0

- **URL**: `POST https://api.kie.ai/api/v1/jobs/createTask`
- **model**: `"kling-3.0/video"`

### Input Parameters

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `prompt` | string | 조건부 | 영상 프롬프트 (multi_shots=false 시) | |
| `image_urls` | array | 조건부 | 첫/끝 프레임 이미지 URL | 1개=첫 프레임, 2개=첫+끝 프레임 |
| `sound` | boolean | No | 사운드 효과 | 기본: `false` (multi_shots=true 시 기본 `true`) |
| `duration` | string | Yes | 영상 길이 | `"3"` ~ `"15"` (초); 기본: `"5"` |
| `aspect_ratio` | string | 조건부 | 비율 | `"16:9"`, `"9:16"`, `"1:1"`; 기본: `"16:9"` |
| `mode` | string | Yes | 생성 모드 | `"std"`, `"pro"`; 기본: `"pro"` |
| `multi_shots` | boolean | Yes | 멀티샷 모드 | 기본: `false` |
| `multi_prompt` | array | 조건부 | 샷별 설명 (multi_shots=true 시 필수) | 최대 5개 |
| `kling_elements` | array | 조건부 | 참조 요소 (@element_name 사용 시) | |

#### multi_prompt 항목

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `prompt` | string | Yes | 샷 설명 | @element_name 구문 지원 |
| `duration` | integer | Yes | 샷 길이 | 1-12초 |

#### kling_elements 항목

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `name` | string | Yes | 요소 식별자 | @element_name으로 참조 |
| `description` | string | Yes | 요소 설명 | |
| `element_input_urls` | array | No | 요소 이미지 URL | 2-50개; JPG/PNG; 10MB |

#### Resolution Mapping

| Mode | 16:9 | 9:16 | 1:1 |
|------|------|------|-----|
| Standard (std) | 1280×720 | 720×1280 | 720×720 |
| Pro (pro) | 1920×1080 | 1080×1920 | 1080×1080 |

#### 가격 (초당)

| Mode | Audio | Credits/sec | USD/sec |
|------|-------|-------------|---------|
| Standard | No | 20 | $0.10 |
| Standard | Yes | 30 | $0.15 |
| Pro | No | 27 | $0.135 |
| Pro | Yes | 40 | $0.20 |

---

## Kling 2.6

> **문서**: https://docs.kie.ai/market/kling/text-to-video, https://docs.kie.ai/market/kling/image-to-video

### Text to Video

- **model**: `"kling-2.6/text-to-video"`

| Parameter | Type | Required | Description | Values |
|-----------|------|----------|-------------|--------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 | 최대 1000자 |
| `input.sound` | boolean | Yes | 사운드 포함 | true/false |
| `input.aspect_ratio` | string | Yes | 비율 | `"1:1"`, `"16:9"`, `"9:16"` |
| `input.duration` | string | Yes | 길이 | `"5"` 또는 `"10"` |

### Image to Video

- **model**: `"kling-2.6/image-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 | 최대 1000자 |
| `input.image_urls` | array | Yes | 이미지 URL | 최대 1개; JPEG/PNG/WebP; 10MB |
| `input.sound` | boolean | Yes | 사운드 포함 | true/false |
| `input.duration` | string | Yes | 길이 | `"5"` 또는 `"10"`; 기본 `"5"` |

#### 가격

| Duration | Audio | Credits | USD |
|----------|-------|---------|-----|
| 5초 | No | 55 | $0.28 |
| 5초 | Yes | 110 | $0.55 |
| 10초 | No | 110 | $0.55 |
| 10초 | Yes | 220 | $1.10 |

---

## Kling AI Avatar

> **문서**: https://docs.kie.ai/market/kling/ai-avatar-standard, https://docs.kie.ai/market/kling/ai-avatar-pro

### Standard: `"kling/ai-avatar-standard"` / Pro: `"kling/ai-avatar-pro"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.image_url` | string | Yes | 아바타 이미지 URL | JPEG/PNG/WebP; 10MB |
| `input.audio_url` | string | Yes | 오디오 파일 URL | MPEG/WAV/AAC/MP4/OGG; 10MB |
| `input.prompt` | string | Yes | 영상 프롬프트 | 최대 5000자 |

---

## Bytedance Seedance 1.5 Pro

> **문서**: https://docs.kie.ai/market/bytedance/seedance-1-5-pro

- **model**: `"bytedance/seedance-1.5-pro"`

### Input Parameters

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `prompt` | string | Yes | 영상 텍스트 프롬프트 | 최소 3자, 최대 2500자 |
| `input_urls` | array | No | 이미지→영상용 이미지 URL | 최대 2개; URI |
| `aspect_ratio` | string | Yes | 비율 | `"1:1"`, `"4:3"`, `"3:4"`, `"16:9"`, `"9:16"`, `"21:9"` |
| `resolution` | string | No | 해상도 | `"480p"`, `"720p"`, `"1080p"` (기본: `"720p"`) |
| `duration` | integer | No | 길이 (초) | `4`, `8`, `12` (기본: 8) |
| `fixed_lens` | boolean | No | 카메라 고정 | 기본: `false` |
| `generate_audio` | boolean | No | 오디오 생성 | 기본: `false` |

---

## Bytedance Seedance 1.0

> **가격 출처**: https://kie.ai/bytedance/seedance-v1

### Seedance 1.0 Pro 가격 (초당)

| Resolution | Credits/sec | USD/sec |
|-----------|-------------|---------|
| 480p | 2.8 | $0.014 |
| 720p | 6 | $0.030 |
| 1080p | 14 | $0.070 |

### Seedance 1.0 Lite 가격 (초당)

| Resolution | Credits/sec | USD/sec |
|-----------|-------------|---------|
| 480p | 2 | $0.010 |
| 720p | 4.5 | $0.0225 |
| 1080p | 10 | $0.050 |

### Seedance 1.0 Pro Fast 가격 (고정)

| Resolution | Duration | Credits | USD |
|-----------|----------|---------|-----|
| 720p | 5초 | 16 | $0.080 |
| 720p | 10초 | 36 | $0.180 |
| 1080p | 5초 | 36 | $0.180 |
| 1080p | 10초 | 72 | $0.360 |

---

## Hailuo 2.3

> **문서**: https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro

### 2.3 Pro Image to Video: `"hailuo/2-3-image-to-video-pro"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 애니메이션 설명 | 최대 5000자 |
| `input.image_url` | string | Yes | 애니메이션할 이미지 | JPEG/PNG/WebP; 10MB |
| `input.duration` | string | No | 길이 | `"6"`, `"10"` (기본: `"6"`) |
| `input.resolution` | string | No | 해상도 | `"768P"`, `"1080P"` (기본: `"768P"`) |

**제약**: 10초 영상은 1080P 불가

### 2.3 Standard Image to Video: `"hailuo/2-3-image-to-video-standard"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 애니메이션 설명 | 최대 5000자 |
| `input.image_url` | string | Yes | 이미지 | JPEG/PNG/WebP; 10MB |
| `input.duration` | string | No | 길이 | `"6"`, `"10"` (기본: `"6"`) |
| `input.resolution` | string | No | 해상도 | `"768P"`, `"1080P"` (기본: `"768P"`) |

### 가격

| Tier | Duration | Resolution | Credits | USD |
|------|----------|-----------|---------|-----|
| Standard I2V | 6초 768P | 768P | 30 | $0.15 |
| Standard I2V | 10초 768P | 768P | 50 | $0.26 |
| Standard I2V | 6초 1080P | 1080P | 50 | $0.26 |
| Pro I2V | 6초 768P | 768P | 45 | $0.22 |
| Pro I2V | 10초 768P | 768P | 90 | $0.45 |
| Pro I2V | 6초 1080P | 1080P | 80 | $0.39 |

---

## Hailuo 02

> **문서**: https://docs.kie.ai/market/hailuo/02-text-to-video-pro, https://docs.kie.ai/market/hailuo/02-text-to-video-standard

### Pro Text to Video: `"hailuo/02-text-to-video-pro"`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 (최대 1500자) |
| `input.prompt_optimizer` | boolean | No | 프롬프트 최적화 |

### Standard Text to Video: `"hailuo/02-text-to-video-standard"`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 (최대 1500자) |
| `input.duration` | string | No | 길이: `"6"`, `"10"` (기본: `"6"`) |
| `input.prompt_optimizer` | boolean | No | 프롬프트 최적화 |

### Pro Image to Video: `"hailuo/02-image-to-video-pro"`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input.prompt` | string | Yes | 프롬프트 (최대 1500자) |
| `input.image_url` | string | Yes | 이미지 URL (JPEG/PNG/WebP; 10MB) |
| `input.end_image_url` | string | No | 마지막 프레임 이미지 URL |
| `input.prompt_optimizer` | boolean | No | 프롬프트 최적화 |

### 가격 (초당)

| Tier | Resolution | Credits/sec | USD/sec |
|------|-----------|-------------|---------|
| Text-to-Video Pro | 1080P | 9.5 | $0.0475 |
| Image-to-Video Pro | 1080P | 9.5 | $0.0475 |
| Text-to-Video Standard | 768P | 5 | $0.025 |
| Image-to-Video Standard | 768P | 5 | $0.025 |
| Image-to-Video Standard | 512P | 2 | $0.010 |

---

## Sora 2

> **문서**: https://docs.kie.ai/market/sora2/

### Text to Video: `"sora-2-text-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 영상 설명 | 최대 10000자 |
| `input.aspect_ratio` | string | No | 비율 | `"portrait"`, `"landscape"` (기본: `"landscape"`) |
| `input.n_frames` | string | No | 프레임 수 | `"10"`, `"15"` (기본: `"10"`) |
| `input.remove_watermark` | boolean | No | 워터마크 제거 | |
| `input.character_id_list` | array | No | 캐릭터 ID 배열 | 최대 5개 |
| `progressCallBackUrl` | string | No | 진행률 콜백 URL | |

### Image to Video: `"sora-2-image-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 영상 동작 설명 | 최대 10000자 |
| `input.image_urls` | array | Yes | 첫 프레임 이미지 | 최대 1개; JPEG/PNG/WebP; 10MB |
| `input.aspect_ratio` | string | No | 비율 | `"portrait"`, `"landscape"` |
| `input.n_frames` | string | No | 프레임 수 | `"10"`, `"15"` |
| `input.remove_watermark` | boolean | No | 워터마크 제거 | |
| `input.character_id_list` | array | No | 캐릭터 ID | 최대 5개 |

### 가격

| Model | Duration | Credits | USD |
|-------|----------|---------|-----|
| Standard (T2V/I2V) | 10초 | 30 | $0.15 |
| Standard (T2V/I2V) | 15초 | 35 | $0.175 |
| Stable (T2V/I2V) | 10초 | 35 | $0.175 |
| Stable (T2V/I2V) | 15초 | 40 | $0.20 |
| Watermark Remover | — | 10 | $0.05 |

---

## Sora 2 Pro

> **문서**: https://docs.kie.ai/market/sora2/sora-2-pro-text-to-video, https://docs.kie.ai/market/sora2/sora-2-pro-image-to-video

### Pro Text to Video: `"sora-2-pro-text-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 영상 설명 | 최대 10000자 |
| `input.aspect_ratio` | string | No | 비율 | `"portrait"`, `"landscape"` |
| `input.n_frames` | string | No | 프레임 수 | `"10"`, `"15"` |
| `input.size` | string | No | 품질 | `"standard"`, `"high"` (기본: `"high"`) |
| `input.remove_watermark` | boolean | No | 워터마크 제거 | |
| `input.character_id_list` | array | No | 캐릭터 ID | 최대 5개 |

### Pro Image to Video: `"sora-2-pro-image-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 영상 동작 설명 | 최대 10000자 |
| `input.image_urls` | array | Yes | 첫 프레임 이미지 | 최대 1개; JPEG/PNG/WebP; 10MB |
| `input.aspect_ratio` | string | No | 비율 | `"portrait"`, `"landscape"` |
| `input.n_frames` | string | No | 프레임 수 | `"10"`, `"15"` |
| `input.size` | string | No | 품질 | `"standard"`, `"high"` (기본: `"standard"`) |
| `input.remove_watermark` | boolean | No | 워터마크 제거 | |
| `input.character_id_list` | array | No | 캐릭터 ID | 최대 5개 |

### 가격 비교

| Provider | Sora 2 Standard | Sora 2 Pro 720P | Sora 2 Pro 1080P |
|----------|----------------|-----------------|-----------------|
| Kie.ai | $0.015/초 | $0.045/초 | $0.10~0.13/초 |
| OpenAI | $0.10/초 | $0.30/초 | $0.50/초 |
| Fal.ai | $0.10/초 | $0.30/초 | $0.50/초 |

---

## Sora 2 Characters

> **문서**: https://docs.kie.ai/market/sora2/sora-2-characters

- **model**: `"sora-2-characters"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.character_file_url` | array | Yes | 캐릭터 영상 URL | 1개만; MP4/WebM/AVI; 1-4초; 10MB |
| `input.character_prompt` | string | No | 캐릭터/애니메이션 스타일 설명 | 최대 5000자 |
| `input.safety_instruction` | string | No | 안전 가이드라인 | 최대 5000자 |

---

## Sora Watermark Remover

> **문서**: https://docs.kie.ai/market/sora2/sora-watermark-remover

- **model**: `"sora-watermark-remover"`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input.video_url` | string | Yes | Sora 2 영상 URL (sora.chatgpt.com으로 시작, 최대 500자) |

---

## Wan 2.6

> **문서**: https://docs.kie.ai/market/wan/

### Text to Video: `"wan/2-6-text-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 (중/영문) | 최소 1, 최대 5000자 |
| `input.duration` | string | No | 길이 | `"5"`, `"10"`, `"15"` (기본: `"5"`) |
| `input.resolution` | string | No | 해상도 | `"720p"`, `"1080p"` (기본: `"1080p"`) |

### Image to Video: `"wan/2-6-image-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 (중/영문) | 최소 2, 최대 5000자 |
| `input.image_urls` | array | Yes | 이미지 URL | 최대 1개; JPEG/PNG/WebP; 10MB; 최소 256x256 |
| `input.duration` | string | No | 길이 | `"5"`, `"10"`, `"15"` (기본: `"5"`) |
| `input.resolution` | string | No | 해상도 | `"720p"`, `"1080p"` (기본: `"1080p"`) |

### Flash Image to Video: `"wan/2-6-flash-image-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 텍스트 프롬프트 (중/영문) | 최대 1500자 |
| `input.image_urls` | array | Yes | 이미지 URL | 최대 1개; JPEG/PNG/WebP; 10MB; 최소 256x256 |
| `input.duration` | string | No | 길이 | `"5"`, `"10"`, `"15"` (기본: `"5"`) |
| `input.resolution` | string | No | 해상도 | `"720p"`, `"1080p"` (기본: `"1080p"`) |
| `input.audio` | boolean | Yes | 오디오 포함 | true/false (가격 영향) |
| `input.multi_shots` | boolean | No | 멀티샷 | true/false |

### Video to Video: `"wan/2-6-video-to-video"`

| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| `input.prompt` | string | Yes | 변환 설명 (중/영문) | 최소 2, 최대 5000자 |
| `input.video_urls` | array | Yes | 원본 영상 URL (사전 업로드 필요) | 최대 3개; MP4/QuickTime/Matroska; 10MB |
| `input.duration` | string | No | 길이 | `"5"`, `"10"` (기본: `"5"`) |
| `input.resolution` | string | No | 해상도 | `"720p"`, `"1080p"` (기본: `"1080p"`) |

### 가격

| Resolution | Duration | Credits | USD |
|-----------|----------|---------|-----|
| 720p | 5초 | 70 | $0.35 |
| 720p | 10초 | 140 | $0.70 |
| 720p | 15초 | 209.5 | $1.05 |
| 1080p | 5초 | 104.5 | $0.53 |
| 1080p | 10초 | 209.5 | $1.05 |
| 1080p | 15초 | 315 | $1.58 |

---

## 전체 가격 비교표

> 1 credit = $0.005 USD 기준

### 5초 영상 기준 비교 (가장 저렴한 옵션)

| Model | Resolution | Credits | USD | 특징 |
|-------|-----------|---------|-----|------|
| **Runway** | 720p | 12 | **$0.06** | 가장 저렴, 기본 |
| **Grok Imagine** | 480p (6초) | 10 | **$0.05** | 최저가, 저해상도 |
| **Grok Imagine** | 720p (6초) | 20 | $0.10 | 오디오 포함 |
| **Sora 2** | — (10초) | 30 | $0.15 | 캐릭터 지원 |
| **Seedance 1.0 Lite** | 480p (5초) | 10 | $0.05 | 초저가 |
| **Seedance 1.0 Pro Fast** | 720p | 16 | $0.08 | 가성비 |
| **Hailuo 02 Std** | 768P (6초) | 30 | $0.15 | |
| **Hailuo 2.3 Std** | 768P (6초) | 30 | $0.15 | |
| **Kling 2.6** | — (5초, 무음) | 55 | $0.28 | 네이티브 오디오 |
| **Kling 3.0 Std** | — (5초, 무음) | 100 | $0.50 | 멀티샷, 1080p |
| **Wan 2.6** | 720p (5초) | 70 | $0.35 | 1080p 가능 |
| **Veo 3.1 Fast** | — (8초) | 80 | $0.40 | 고품질 |
| **Veo 3.1 Quality** | — (8초) | 400 | $2.00 | 최고 품질 |

---

## 애니메이션 적합성 분석

### 문제 분석
- **Grok Imagine**: 잔상(ghosting) 심함 — 빠른 움직임에서 프레임 블렌딩 아티팩트
- **Veo 3.1**: 디테일 뭉개짐(smudging) 심각 — 특히 인물/캐릭터 얼굴

### 애니메이션에 적합한 모델 추천 (우선순위)

#### 1. Kling 3.0 (최고 추천)
- **왜**: 1080p Pro 모드, 멀티샷 지원, 요소 참조(element reference)로 캐릭터 일관성 유지
- **강점**: 깨끗한 모션, 높은 해상도, 사운드 지원, 3~15초 유연한 길이
- **비용**: Pro 무음 $0.135/초 → 5초 = $0.675
- **적합**: 고품질 애니메이션, 캐릭터 일관성 중요할 때

#### 2. Hailuo 2.3 Pro (가성비 추천)
- **왜**: MiniMax의 고충실도 모델, 표현력 있는 캐릭터와 시네마틱 비주얼
- **강점**: 사실적 모션, 복잡한 움직임/조명 안정적, 정밀한 표정
- **비용**: 6초 768P = $0.22, 6초 1080P = $0.39
- **적합**: 캐릭터 애니메이션, 표정 연기

#### 3. Sora 2 Pro (캐릭터 일관성 최강)
- **왜**: character_id_list로 일관된 캐릭터 유지, 워터마크 제거 지원
- **강점**: 10000자 프롬프트, 캐릭터 ID 시스템, high/standard 품질 선택
- **비용**: Standard $0.015/초, Pro 720P $0.045/초
- **적합**: 여러 장면에 걸친 캐릭터 일관성, 스토리보드 기반 영상

#### 4. Bytedance Seedance 1.5 Pro (안정적 대안)
- **왜**: fixed_lens(카메라 고정), 오디오 생성, 21:9 시네마틱 비율 지원
- **강점**: 4/8/12초 유연한 길이, 이미지 2장 입력 가능, 안정적 모션
- **비용**: 해상도별 가변 (480p~1080p)
- **적합**: 안정적 카메라워크가 필요한 애니메이션

#### 5. Wan 2.6 (중국어 프롬프트 지원)
- **왜**: 중/영문 프롬프트 동시 지원, 1080p, 최대 15초
- **강점**: Video-to-Video 변환 지원, 멀티샷(Flash 버전)
- **비용**: 720p 5초 = $0.35
- **적합**: 긴 애니메이션, 기존 영상 스타일 변환

# KIE Bytedance Seedance 2.0 API 기술문서 (전체)

> **출처**: https://docs.kie.ai/market/bytedance/seedance-2 , seedance-2-fast , create-asset , query-asset , https://kie.ai/seedance-2-0 (Playground)
> **수집일**: 2026-04-05
> **API 서버**: `https://api.kie.ai`
> **서비스 상태**: 일시 중단 ("This service has been temporarily taken offline.") — 파라미터/가격 정보는 유효

---

## 목차

1. [Seedance 2.0 (표준)](#1-seedance-20-표준)
2. [Seedance 2.0 Fast](#2-seedance-20-fast)
3. [Create Asset (자산 생성)](#3-create-asset-자산-생성)
4. [Query Asset (자산 조회)](#4-query-asset-자산-조회)
5. [공통 에러 코드](#5-공통-에러-코드)
6. [공통 인증](#6-공통-인증)

---

## 1. Seedance 2.0 (표준)

### 엔드포인트

| 항목 | 값 |
|------|-----|
| **URL** | `https://api.kie.ai/api/v1/jobs/createTask` |
| **HTTP 메서드** | **POST** |
| **Content-Type** | `application/json` |
| **인증** | `Authorization: Bearer YOUR_API_KEY` |

### 주요 기능

1. **Text-to-Video** — 입력 이미지 없이 텍스트 설명에서 직접 비디오 생성
2. **Image-to-Video** — 정적 이미지 0~2개 입력 지원 (첫 프레임 / 마지막 프레임)
3. **Dynamic Camera** — 선택적 렌즈 잠금을 통한 고급 카메라 움직임
4. **Audio Generation** — 향상된 비디오 콘텐츠를 위한 선택적 오디오 생성
5. **Multimodal Reference-to-Video** — 참조 이미지, 비디오, 오디오를 함께 사용

### 중요 제약사항

> **Image-to-Video (First Frame)**, **Image-to-Video (First & Last Frames)**, **Multimodal Reference-to-Video** (참조 이미지, 비디오, 오디오 포함)는 **상호 배타적**이며 **동시에 사용할 수 없음**.
>
> - Multimodal Reference-to-Video는 프롬프트를 통해 참조 이미지를 첫 번째 또는 마지막 프레임으로 지정하여 간접적으로 "First/Last Frame + Multimodal Reference" 효과 달성 가능
> - 첫 번째 및 마지막 프레임이 지정된 이미지와 동일하게 보장되어야 하는 경우 **Image-to-Video (First & Last Frames) 우선 사용**

### 요청 바디 (Request Body)

#### 최상위 파라미터

| 파라미터 | 타입 | 필수 | 설명 | 기본값 |
|---------|------|------|------|--------|
| `model` | string | **Yes** | 생성에 사용할 모델명 | `bytedance/seedance-2` |
| `callBackUrl` | string (URI) | No | 생성 완료 시 결과를 받을 콜백 URL. 프로덕션 환경에서 권장. 시스템이 완료 시 POST로 작업 상태와 결과 전송. 콜백 엔드포인트는 JSON 페이로드의 POST 요청을 수락해야 함 | — |
| `input` | object | **Yes** | 생성 작업의 입력 파라미터 | — |

#### input 객체

| 파라미터 | 타입 | 필수 | 설명 | 제한 | 기본값 | Enum |
|---------|------|------|------|------|--------|------|
| `prompt` | string | **Yes** | 비디오 생성에 사용될 텍스트 프롬프트 | 최소 3자, 최대 2500자 | — | — |
| `web_search` | boolean | **Yes** | 온라인 검색 사용 여부 | — | — | — |
| `first_frame_url` | string | No | 첫 번째 프레임 이미지 URL 또는 `asset://{assetId}` 형식 | — | — | — |
| `last_frame_url` | string | No | 마지막 프레임 이미지 URL 또는 `asset://{assetId}` 형식 | — | — | — |
| `reference_image_urls` | array of string (URI) | No | 참조 이미지 URL 목록 | maxItems: 9 | — | — |
| `reference_video_urls` | array of string (URI) | No | 참조 비디오 URL 목록 | maxItems: 3 | — | — |
| `reference_audio_urls` | array of string (URI) | No | 참조 오디오 URL 목록 | maxItems: 3 | — | — |
| `return_last_frame` | boolean | No | 비디오의 마지막 프레임을 이미지로 반환할지 여부 | — | `false` | — |
| `generate_audio` | boolean | No | 비디오용 오디오 생성 여부. true: 오디오 포함 (비용 증가), false: 오디오 없음 | — | `true` | — |
| `resolution` | string | No | 비디오 해상도. 480p는 빠른 생성, 720p는 균형 | — | `720p` | `480p`, `720p` |
| `aspect_ratio` | string | No | 비디오 종횡비 | — | `16:9` | `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `adaptive` |
| `duration` | integer | No | 비디오 길이 (초) | 4~15 | `8` | — |

#### 참조 이미지 요구사항 (`reference_image_urls`)

| 항목 | 요구사항 |
|------|---------|
| 형식 | jpeg, png, webp, bmp, tiff, gif |
| 종횡비 (너비/높이) | (0.4, 2.5) |
| 너비 및 높이 (px) | (300, 6000) |
| 파일 크기 | 단일 이미지 30MB 미만 |
| 최대 파일 수 | 시작과 끝 프레임 수 합이 9를 초과하면 안 됨 |

#### 참조 비디오 요구사항 (`reference_video_urls`)

| 항목 | 요구사항 |
|------|---------|
| 형식 | mp4, mov |
| 해상도 | 480p, 720p |
| 단일 비디오 길이 | [2, 15]초 |
| 최대 참조 비디오 수 | 3개, 총 지속시간 15초 이내 |
| 종횡비 (너비/높이) | [0.4, 2.5] |
| 너비/높이 (px) | [300, 6000] |
| 총 픽셀 (너비x높이) | [409600, 927408] 범위 |
| 파일 크기 | 단일 비디오 50MB 이내 |
| 프레임율 (FPS) | [24, 60] |

#### 참조 오디오 요구사항 (`reference_audio_urls`)

| 항목 | 요구사항 |
|------|---------|
| 형식 | wav, mp3 |
| 단일 오디오 길이 | [2, 15]초 |
| 최대 참조 오디오 수 | 3개, 총 지속시간 15초 이내 |
| 파일 크기 | 단일 파일 15MB 미만 |

### 요청 예제

```json
{
  "model": "bytedance/seedance-2",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "prompt": "A serene beach at sunset with waves gently crashing on the shore, palm trees swaying in the breeze, and seagulls flying across the orange sky",
    "first_frame_url": "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example2.png",
    "last_frame_url": "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example3.png",
    "reference_image_urls": [
      "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.png"
    ],
    "reference_video_urls": [
      "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.mp4"
    ],
    "reference_audio_urls": [
      "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.mp3"
    ],
    "return_last_frame": false,
    "generate_audio": false,
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "duration": 15,
    "web_search": false
  }
}
```

### 응답 (200 성공)

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_bytedance_1765186743319"
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `code` | integer | 응답 상태 코드 |
| `msg` | string | 응답 메시지. 실패 시 에러 설명 |
| `data.taskId` | string | 작업 ID. Get Task Details 엔드포인트로 상태 조회 가능 |

### 콜백 및 폴링

- **콜백 (권장)**: `callBackUrl` 파라미터 사용 — 생성 완료 시 시스템이 해당 URL에 POST로 작업 상태 및 결과 전송
- **폴링**: Get Task Details 엔드포인트(`/market/common/get-task-detail`)로 작업 상태 조회
- **Webhook 검증**: 콜백 보안을 위해 서명 검증 구현 권장 ([Webhook Verification Guide](/common-api/webhook-verification))

---

## 2. Seedance 2.0 Fast

### 엔드포인트

| 항목 | 값 |
|------|-----|
| **URL** | `https://api.kie.ai/api/v1/jobs/createTask` |
| **HTTP 메서드** | **POST** |
| **Content-Type** | `application/json` |
| **인증** | `Authorization: Bearer YOUR_API_KEY` |

### Seedance 2.0 표준과의 차이점

- **모델명**: `bytedance/seedance-2-fast` (표준은 `bytedance/seedance-2`)
- **생성 속도**: Fast 버전은 더 빠른 생성 속도 제공
- **나머지 파라미터, 제약사항, 응답 형식은 Seedance 2.0 표준과 동일**

### 요청 바디 (Request Body)

#### 최상위 파라미터

| 파라미터 | 타입 | 필수 | 설명 | 기본값 |
|---------|------|------|------|--------|
| `model` | string | **Yes** | 생성에 사용할 모델명. 이 엔드포인트에는 반드시 `bytedance/seedance-2-fast`이어야 함 | `bytedance/seedance-2-fast` |
| `callBackUrl` | string (URI) | No | 생성 완료 시 결과를 받을 콜백 URL | — |
| `input` | object | **Yes** | 생성 작업의 입력 파라미터 | — |

#### input 객체

| 파라미터 | 타입 | 필수 | 설명 | 제한 | 기본값 | Enum |
|---------|------|------|------|------|--------|------|
| `prompt` | string | **Yes** | 비디오 생성에 사용되는 텍스트 프롬프트 | 최소 3자, 최대 2500자 | — | — |
| `web_search` | boolean | **Yes** | 온라인 검색 사용 여부 | — | — | — |
| `first_frame_url` | string | No | 첫 프레임 이미지 URL 또는 `asset://{assetId}` 형식 | — | — | — |
| `last_frame_url` | string | No | 마지막 프레임 이미지 URL 또는 `asset://{assetId}` 형식 | — | — | — |
| `reference_image_urls` | array of string (URI) | No | 참조 이미지 URL 목록. 형식: jpeg, png, webp, bmp, tiff, gif. 종횡비: (0.4, 2.5). 크기: (300, 6000)px. 단일 이미지 30MB 미만 | maxItems: 9 | — | — |
| `reference_video_urls` | array of string (URI) | No | 참조 비디오 URL 목록. 형식: mp4, mov. 해상도: 480p, 720p. 길이: [2,15]s. 최대 3개, 총 15초 이하. 종횡비: [0.4, 2.5]. 픽셀: [409600, 927408]. 단일 50MB 이내. FPS: [24,60] | maxItems: 3 | — | — |
| `reference_audio_urls` | array of string (URI) | No | 참조 오디오 URL 목록. 형식: wav, mp3. 길이: [2,15]s. 최대 3개, 총 15초 이하. 단일 15MB 미만 | maxItems: 3 | — | — |
| `return_last_frame` | boolean | No | 비디오의 마지막 프레임을 이미지로 반환할지 여부 | — | `false` | — |
| `generate_audio` | boolean | No | 비디오용 오디오 생성 여부. true: 오디오 포함 (비용 증가), false: 오디오 없음 | — | `true` | — |
| `resolution` | string | No | 비디오 해상도. 480p는 더 빠른 생성, 720p는 균형 | — | `720p` | `480p`, `720p` |
| `aspect_ratio` | string | No | 비디오 종횡비 | — | `16:9` | `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`, `adaptive` |
| `duration` | integer | No | 비디오 길이 (초) | 4~15 | `8` | — |

### 중요 주의사항

> **Image-to-Video (첫 프레임)**, **Image-to-Video (첫 & 마지막 프레임)**, **Multimodal Reference-to-Video** (참조 이미지, 비디오, 오디오 포함)는 **상호 배타적**이며 **동시에 사용할 수 없음**.
>
> - Multimodal Reference-to-Video는 프롬프트를 통해 참조 이미지를 첫 또는 마지막 프레임으로 지정하여 간접적으로 "첫/마지막 프레임 + Multimodal Reference" 효과 달성 가능
> - 첫 프레임과 마지막 프레임이 지정된 이미지와 동일함을 엄격히 보장하려면 **Image-to-Video (첫 & 마지막 프레임) 사용을 우선시**

### 요청 예제

```json
{
  "model": "bytedance/seedance-2-fast",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "prompt": "A serene beach at sunset with waves gently crashing on the shore, palm trees swaying in the breeze, and seagulls flying across the orange sky",
    "first_frame_url": "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example2.png",
    "last_frame_url": "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example3.png",
    "reference_image_urls": [
      "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.png"
    ],
    "reference_video_urls": [
      "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.mp4"
    ],
    "reference_audio_urls": [
      "https://templateb.aiquickdraw.com/custom-page/akr/section-images/example1.mp3"
    ],
    "return_last_frame": false,
    "generate_audio": false,
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "duration": 15,
    "web_search": false
  }
}
```

### 응답 (200 성공)

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_bytedance_1765186743319"
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `code` | integer | 응답 상태 코드 |
| `msg` | string | 응답 메시지. 실패 시 에러 설명 |
| `data.taskId` | string | 작업 ID. Get Task Details 엔드포인트로 상태 조회 가능 |

---

## 3. Create Asset (자산 생성)

> **외부 URL을 ByteDance 자산으로 전환**하는 API.
> Seedance 2.0의 `first_frame_url`, `last_frame_url` 등에서 `asset://{assetId}` 형식으로 사용 가능.

### 엔드포인트

| 항목 | 값 |
|------|-----|
| **URL** | `https://api.kie.ai/api/v1/playground/createAsset` |
| **HTTP 메서드** | **POST** |
| **Content-Type** | `application/json` |
| **인증** | `Authorization: Bearer YOUR_API_KEY` |

### 요청 바디 (Request Body)

| 파라미터 | 타입 | 필수 | 설명 | Enum |
|---------|------|------|------|------|
| `url` | string (URI) | **Yes** | 자산 리소스의 URL. **URL 업로드만 지원되며 base64는 미지원** | — |
| `assetType` | string | **Yes** | 자산 유형 | `Image`, `Video`, `Audio` |

### 자산 유형별 요구사항

#### Image (이미지)

| 항목 | 요구사항 |
|------|---------|
| 형식 | jpeg, png, webp, bmp, tiff, gif, heic/heif |
| 종횡비 (너비/높이) | (0.4, 2.5) |
| 크기 (px) | (300, 6000) |
| 파일 크기 | 이미지당 30MB 미만 |

#### Video (비디오)

| 항목 | 요구사항 |
|------|---------|
| 형식 | mp4, mov |
| 해상도 | 480p, 720p |
| 지속시간 | [2, 15]초 |
| 종횡비 (너비/높이) | [0.4, 2.5] |
| 크기 (px) | [300, 6000] |
| 총 픽셀 (너비x높이) | [409600, 927408] |
| 파일 크기 | 비디오당 최대 50MB |
| 프레임레이트 (FPS) | [24, 60] |

#### Audio (오디오)

| 항목 | 요구사항 |
|------|---------|
| 형식 | wav, mp3 |
| 지속시간 | [2, 15]초 |
| 파일 크기 | 오디오 파일당 최대 15MB |

### 요청 예제

```json
{
  "url": "https://example.com/my-image.png",
  "assetType": "Image"
}
```

```json
{
  "url": "https://example.com/my-video.mp4",
  "assetType": "Video"
}
```

```json
{
  "url": "https://example.com/my-audio.mp3",
  "assetType": "Audio"
}
```

### 응답 (200 성공)

```json
{
  "id": "task_1234567890abcdef"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 작업 ID. 자산 처리 상태 및 최종 자산 URL 조회에 사용 |

### 응답 (500 에러)

```json
{
  "code": 500,
  "msg": "Server Error - An unexpected error occurred while processing the request",
  "data": null
}
```

### 자료 라이브러리 사용 규정

1. 자산은 가상 휴먼 자산이어야 함
2. 업로드자가 자료에 대한 법적 소유권 및 전체 사용/처분 권리 보유 필수
3. 실제 인물과 유사하지 않아야 하며, 표절/침해 없어야 함
4. 법률/질서/도덕 위반 콘텐츠 불가; 사용자가 전적 책임 부담

---

## 4. Query Asset (자산 조회)

> Create Asset으로 생성한 자산의 처리 상태를 조회하고, 최종 자산 URL을 검색하는 API.

### 엔드포인트

| 항목 | 값 |
|------|-----|
| **URL** | `https://api.kie.ai/api/v1/playground/getAsset` |
| **HTTP 메서드** | **GET** |
| **인증** | `Authorization: Bearer YOUR_API_KEY` |

### 요청 파라미터 (Query String)

| 파라미터 | 위치 | 타입 | 필수 | 설명 |
|---------|------|------|------|------|
| `assetId` | query | string | No | ByteDance 자산 서비스에서 사용하는 고유 자산 식별자. 먼저 `/api/v1/playground/createAsset`을 통해 자산을 생성하여 이 ID를 얻어야 함 |

### 요청 예제

```
GET https://api.kie.ai/api/v1/playground/getAsset?assetId=task_1234567890abcdef
Authorization: Bearer YOUR_API_KEY
```

### 응답 (200 성공)

```json
{
  "status": "Active",
  "url": "https://bytedance-asset-cdn.example.com/asset-xxxxx.png",
  "errorMsg": null
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `status` | string | 자산 상태. `Active`: 성공적으로 처리되어 사용 가능 / `Processing`: 전처리 중 / `Failed`: 처리 실패 |
| `url` | string (URI) | 생성된 자산의 URL |
| `errorMsg` | string (nullable) | 작업 실패 시 반환되는 오류 메시지. 오류가 없으면 `null` |

### 응답 (500 에러)

```json
{
  "code": 500,
  "msg": "Server Error - An unexpected error occurred while processing the request",
  "data": {}
}
```

### 자산 조회 워크플로우

```
1. createAsset 호출 → id 반환
2. getAsset?assetId={id} 폴링
3. status === "Active" → url 필드에서 자산 URL 획득
4. Seedance 2.0에서 asset://{assetId} 형식으로 사용
```

---

## 5. 공통 에러 코드

> Seedance 2.0, Seedance 2.0 Fast, Create Asset, Query Asset 모두 동일한 에러 코드 체계 사용.

| 코드 | 이름 | 설명 |
|------|------|------|
| **200** | Success | 요청이 성공적으로 처리됨 |
| **401** | Unauthorized | 인증 자격증명 누락 또는 유효하지 않음 |
| **402** | Insufficient Credits | 계정에 작업을 수행할 충분한 크레딧이 없음 |
| **404** | Not Found | 요청된 리소스 또는 엔드포인트가 존재하지 않음 |
| **422** | Validation Error | 요청 파라미터가 유효성 검사를 통과하지 못함 |
| **429** | Rate Limited | 이 리소스에 대한 요청 제한이 초과됨 |
| **455** | Service Unavailable | 시스템이 현재 유지보수 중 |
| **500** | Server Error | 요청 처리 중 예상치 못한 오류 발생 |
| **501** | Generation Failed | 콘텐츠 생성 작업 실패 |
| **505** | Feature Disabled | 요청된 기능이 현재 비활성화 상태 |

---

## 6. 공통 인증

- **보안 스키마**: BearerAuth (Bearer Token)
- **헤더**: `Authorization: Bearer YOUR_API_KEY`
- **API Key 관리**: https://kie.ai/api-key
- 모든 API는 Bearer Token을 통한 신원 인증이 필요

---

## API 전체 요약

| API | HTTP 메서드 | 엔드포인트 | 모델명 | 용도 |
|-----|------------|-----------|--------|------|
| **Seedance 2.0** | **POST** | `/api/v1/jobs/createTask` | `bytedance/seedance-2` | 표준 품질 영상 생성 (T2V, I2V, Multimodal Ref) |
| **Seedance 2.0 Fast** | **POST** | `/api/v1/jobs/createTask` | `bytedance/seedance-2-fast` | 빠른 속도 영상 생성 (T2V, I2V, Multimodal Ref) |
| **Create Asset** | **POST** | `/api/v1/playground/createAsset` | — | 외부 URL → ByteDance 자산 변환 |
| **Query Asset** | **GET** | `/api/v1/playground/getAsset` | — | 자산 처리 상태 조회 + 최종 URL 획득 |
| **Get Task Details** | **GET** | `/api/v1/jobs/getTaskDetail` (공통) | — | 생성 작업 상태 조회 + 결과 URL 획득 |

---

## 전체 워크플로우 예시

```
[이미지 → 영상 생성 (asset 사용)]

1. POST /api/v1/playground/createAsset
   body: { "url": "https://my-cdn.com/photo.png", "assetType": "Image" }
   → response: { "id": "task_abc123" }

2. GET /api/v1/playground/getAsset?assetId=task_abc123
   → 폴링하여 status === "Active" 확인
   → response: { "status": "Active", "url": "...", "errorMsg": null }

3. POST /api/v1/jobs/createTask
   body: {
     "model": "bytedance/seedance-2",
     "input": {
       "prompt": "A person walking in a park",
       "first_frame_url": "asset://task_abc123",
       "resolution": "720p",
       "aspect_ratio": "16:9",
       "duration": 8,
       "generate_audio": true,
       "web_search": false
     }
   }
   → response: { "code": 200, "data": { "taskId": "task_bytedance_xyz789" } }

4. 콜백 수신 또는 GET /api/v1/jobs/getTaskDetail?taskId=task_bytedance_xyz789
   → 생성된 비디오 URL 획득
```

---

## 관련 리소스

- **Market Overview**: https://kie.ai/market/quickstart — 모든 사용 가능한 모델 탐색
- **Common API (크레딧 확인)**: https://kie.ai/common-api/get-account-credits
- **Get Task Details**: `/market/common/get-task-detail` — 작업 상태 조회
- **Webhook Verification Guide**: `/common-api/webhook-verification` — 콜백 서명 검증

---

# ============================================================
# Playground 페이지 수집 (프롬프트 가이드 / 가격 / 예시 / 팁)
# 출처: https://kie.ai/seedance-2-0?model=bytedance/seedance-2
#       https://kie.ai/seedance-2-0?model=bytedance/seedance-2-fast
# ============================================================

---

## 7. 가격 정보 (Pricing)

### Seedance 2.0 표준 (Standard)

| 해상도 | 비디오 입력 포함 | 비디오 입력 미포함 |
|--------|----------------|------------------|
| **480P** | 11.5 크레딧/초 ($0.0575/초) | 19 크레딧/초 ($0.095/초) |
| **720P** | 25 크레딧/초 ($0.125/초) | 41 크레딧/초 ($0.205/초) |

### Seedance 2.0 Fast

| 해상도 | 비디오 입력 포함 | 비디오 입력 미포함 |
|--------|----------------|------------------|
| **480P** | 8 크레딧/초 ($0.045/초) | 15.5 크레딧/초 ($0.0775/초) |
| **720P** | 20 크레딧/초 ($0.100/초) | 33 크레딧/초 ($0.165/초) |

> **계산식**: `(입력 비디오 길이 + 출력 길이) × 요율`
>
> **추가 할인**: 높은 단계 충전 시 +10% 보너스 크레딧 포함 → 실제 가격 약 10% 낮음
>
> **신규 사용자**: 무료 크레딧 제공으로 성능 테스트 가능

---

## 8. 표준 vs Fast 비교

| 항목 | Seedance 2.0 (Standard) | Seedance 2.0 Fast |
|------|------------------------|-------------------|
| **모델명** | `bytedance/seedance-2` | `bytedance/seedance-2-fast` |
| **품질** | 고품질 출력, 강력한 창의적 제어 | 표준 품질 |
| **생성 속도** | 표준 (느림) | 빠름 |
| **비용** | 높음 | ~40% 이상 저렴 |
| **이미지 파일 크기 제한** | 10MB (Playground) / 30MB (API) | 30MB (Playground) / 30MB (API) |
| **비디오 파일 크기 제한** | 10MB (Playground) / 50MB (API) | 50MB (Playground) / 50MB (API) |
| **최적 용도** | 프로덕션 워크플로우, 복잡한 장면 | 빠른 반복, 배치 생성, 프로토타이핑 |

---

## 9. 주요 기능 상세

### 다이나믹 카메라 무브먼트 (Dynamic Camera Movement)
- 트래킹, 궤도 촬영, 빠른 전환 복제
- 부드럽고 읽기 쉬운 모션 유지
- 선택적 렌즈 잠금을 통한 고급 카메라 움직임

### 물리 법칙과 액션 일관성 (Physics & Action Consistency)
- 빠른 액션 중 사실적인 물리 표현
- 캐릭터, 객체, 환경의 타이밍/무게/모멘텀 일관성
- 자연스러운 움직임과 강화된 물리 인식

### 정밀한 참조 제어 (Precise Reference Control)
- 모션, 구성, 카메라 언어, 스타일 추출 및 복제
- "프롬프트 추측"에서 "참조 기반 생성"으로 전환
- 소스 미디어에서 모션, 구성, 카메라 언어, 스타일 추출

### 네이티브 오디오 지원 (Native Audio)
- 립싱크 및 비트 매칭 가능
- 대사, 리듬, 음향 효과와 화면 모션 정렬
- 음악 트랙을 참조로 사용하여 비트/분위기에 맞춘 모션/컷/에너지 정렬

### 멀티샷 스토리텔링 (Multi-shot Storytelling)
- 장면 간 안정적인 흐름과 일관된 페이싱
- 캐릭터 정체성 유지
- 일관된 카메라 로직

### 유연한 길이 제어
- 4~15초 정확한 타이밍 설정
- 광고, 소셜 클립, 제품 비디오에 최적화

---

## 10. Playground 입력 파라미터 상세 (UI 기준)

### Playground 전용 필드 제한사항

| 필드명 | 유형 | Playground 제한 | API 제한 | 설명 |
|--------|------|----------------|---------|------|
| `prompt` | 텍스트 | 최대 5000자 | 최대 2500자 | 비디오에 대한 텍스트 설명 |
| `reference_image_urls` | 파일 | 최대 10MB, 최대 9개 | 최대 30MB, 최대 9개 | JPEG, PNG, WEBP, JPG, GIF 형식 |
| `reference_video_urls` | 파일 | 최대 10MB, 최대 3개, 총 ≤15초 | 최대 50MB, 최대 3개, 총 ≤15초 | MP4, QUICKTIME, X-MATROSKA |
| `reference_audio_urls` | 파일 | 최대 10MB, 최대 3개, 총 ≤15초 | 최대 15MB, 최대 3개, 총 ≤15초 | MPEG, WAV, X-WAV, AAC, MP4, OGG |
| `return_last_frame` | 토글 | — | — | 마지막 프레임을 이미지로 반환 |
| `generate_audio` | 토글 | 기본 ON | 기본 `true` | AI 오디오 생성 (비용 증가) |
| `resolution` | 라디오 | 480p / 720p | 480p / 720p | 출력 비디오 해상도 |
| `aspect_ratio` | 라디오 | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 | + `adaptive` | 종횡비 |
| `duration` | 슬라이더 | 4~15초 (1초 단위) | 4~15 | 비디오 길이 (초) |
| `web_search` | 토글 | — | — | 온라인 검색 사용 |
| `first_frame_url` | 텍스트 | — | — | 첫 프레임 이미지 URL |
| `last_frame_url` | 텍스트 | — | — | 마지막 프레임 이미지 URL |

> **aspect_ratio `adaptive` 모드**: 업로드된 이미지가 16:9에 가까운지 9:16에 가까운지에 따라 자동 센터 크롭

### Playground UI 탭 구성

| 탭 | 설명 |
|----|------|
| **Form** | 입력 필드(폼) 방식으로 파라미터 설정 |
| **JSON** | JSON 에디터 방식으로 직접 요청 바디 작성 |
| **Preview** (출력) | 생성된 비디오 미리보기 |
| **JSON** (출력) | 원본 JSON 응답 확인 |

---

## 11. 프롬프트 작성 가이드 & 예시

### 프롬프트 작성 핵심 규칙

1. **참조 파일 명시**: `@Image1`, `@Image2`, `@video1` 형식으로 업로드한 파일을 프롬프트 내에서 참조
2. **카메라 지시**: "고정 카메라 샷", "트래킹 샷", "클로즈업", "3인칭 관점" 등 구체적 카메라 앵글 지정
3. **세부 동작 묘사**: 캐릭터의 감정, 표현, 동작을 상세하게 기술
4. **배경음 지정**: "발걸음, 군중음, 자동차 소음" 등 배경 사운드 디테일 포함
5. **시대/장소 명시**: "19세기 런던 거리" 등 구체적 시공간 배경 제공
6. **멀티샷 전환**: 장면 연결 방식과 전환 기법을 명확히 기술

### 예시 프롬프트 1: 무술 액션 시퀀스 (Standard)

```
Reference @Image1 @Image2 for the spear-wielding character, @Image3 @Image4 
for the scene. Generate a martial arts action sequence where the character 
performs fluid spear techniques. Use multi-angle tracking shots to capture 
the power and beauty of martial arts.
```

> **활용**: 참조 이미지로 캐릭터 외형 + 장면 배경 정의 → 멀티앵글 트래킹 샷

### 예시 프롬프트 2: 영상 전환 + 카메라 이동 (Standard)

```
Replace the character in @video1 with @image1, with @image1 as the first frame. 
The character should wear virtual sci-fi glasses. Refer to the camera movement 
and close-up surround shots of @video1, changing from a third-person perspective 
to the character's subjective perspective. Travel through AI virtual glasses and 
arrive at the deep blue universe of @image2 where several spaceships are seen 
traveling into distance.
```

> **활용**: 참조 비디오의 카메라 무브먼트 복제 + 캐릭터 교체 + 시점 전환

### 예시 프롬프트 3: 일상 장면 (Fast)

```
Fixed camera shot, a girl is elegantly hanging clothes to dry. After one piece 
is hung, she takes another from the bucket and gives it a vigorous shake.
```

> **활용**: 고정 카메라 + 자연스러운 일상 동작. 간단한 프롬프트로 빠른 생성

### 예시 프롬프트 4: 역사적 장면 + 사운드 (Fast)

```
The camera slightly pulls back to reveal a full view of the street and follows 
the female lead as she moves. The wind flutters her skirt as she walks down a 
19th-century London street. As she continues walking, a steam car drives up from 
the right side of the street, quickly passing by her. The wind lifts her skirt, 
and with a shocked expression, she presses it down with both hands. 
Background sounds include footsteps, crowd noise, car noises etc.
```

> **활용**: 카메라 풀백 → 팔로우 샷 + 시대적 배경 + 캐릭터 리액션 + 배경 사운드 지정

### 한국어 프롬프트 예시 (위 영문 예시의 활용 패턴)

```
@Image1과 @Image2를 참고하여 창을 쓰는 캐릭터,
@Image3과 @Image4를 참고하여 장면을 생성하세요.
캐릭터가 유동적인 창 기법을 수행하는 무술 액션 시퀀스를 생성합니다.
다중 각도 트래킹 샷을 사용하여 무술의 힘과 아름다움을 포착하세요.
```

```
카메라가 천천히 뒤로 물러나 거리 전체 모습을 드러냅니다.
여주인공이 19세기 런던 거리를 걸으며 따라갑니다.
바람이 치마를 휘날리며 걷습니다.
계속 걸으면서 오른쪽에서 증기 자동차가 빠르게 지나갑니다.
바람이 치마를 들어올리고, 충격한 표정으로 양손으로 누르고 있습니다.
배경음: 발걸음, 군중음, 자동차 소음 등.
```

---

## 12. 사용 사례 (Use Cases)

### 소셜 미디어 콘텐츠
- TikTok, Reels, YouTube Shorts용 영상 생성
- 아이디어, 참조 클립, 음악을 짧은 비디오로 변환
- 일관된 모션, 스타일, 리듬 유지

### 브랜드 마케팅 & 제품 영상
- 제품 데모, 캠페인 영상, 광고 크리에이티브
- 로고 디테일, 색상 스타일, 장면 연속성 보존

### 영화/게임 프리비주얼라이제이션
- 스토리보드, 스케치를 영화적 미리보기로 변환
- 카메라 무브먼트, 캐릭터 모션, 장면 페이싱 복제

### 뮤직 비디오
- 오디오 트랙에서 뮤직 비디오 생성
- 모션, 컷, 전환을 음악 리듬과 정렬

---

## 13. FAQ (자주 묻는 질문)

**Q: Seedance 2.0이란?**
A: ByteDance의 최신 멀티모달 AI 비디오 생성 모델. 텍스트, 이미지, 비디오 클립, 음악에서 영화적 멀티샷 비디오를 생성.

**Q: 한 프로젝트에 참조를 몇 개 업로드할 수 있나?**
A: 이미지 최대 9개, 비디오 최대 3개 (총 15초 이내), 오디오 최대 3개 (총 15초 이내)를 한 번의 생성에서 지원.

**Q: 음성 가이드 및 립싱크를 지원하나?**
A: 네. 네이티브 오디오 지원으로 대사, 리듬, 음향 효과와 화면 모션을 정렬.

**Q: 사실적인 인간 비디오를 생성할 수 있나?**
A: 네. 자연스러운 모션, 일관된 캐릭터, 영화적 인간 장면을 지원.

**Q: 표준과 Fast 중 어떤 것을 써야 하나?**
A: 최종 프로덕션 품질이 필요하면 **Standard**, 빠른 반복/테스트/배치 생성이면 **Fast** 사용. Fast는 ~40% 이상 저렴.

---

## 14. 프롬프트 활용 팁 (Best Practices)

### 참조 파일 활용법
```
@Image1  → 캐릭터 외형 정의
@Image2  → 배경/장면 정의
@video1  → 카메라 무브먼트/모션 복제
@audio1  → 리듬/비트 가이드
```

### 카메라 지시어 사전
| 지시어 | 효과 |
|--------|------|
| `Fixed camera shot` | 고정 카메라 (정적 장면) |
| `Tracking shot` | 피사체 따라가기 |
| `Multi-angle tracking shots` | 다중 앵글 트래킹 |
| `Close-up surround shots` | 클로즈업 서라운드 |
| `Camera slightly pulls back` | 카메라 약간 후퇴 (와이드 전환) |
| `Third-person perspective` | 3인칭 시점 |
| `Character's subjective perspective` | 캐릭터 주관적 시점 (POV) |
| `Orbit shot` | 궤도 촬영 (피사체 중심 회전) |
| `Fast transition` | 빠른 전환 |

### 동작/감정 묘사 패턴
| 패턴 | 예시 |
|------|------|
| 자연스러운 동작 | `elegantly hanging clothes`, `gives it a vigorous shake` |
| 물리적 반응 | `The wind flutters her skirt`, `wind lifts her skirt` |
| 감정 표현 | `with a shocked expression, she presses it down with both hands` |
| 시간 흐름 | `As she continues walking`, `After one piece is hung` |

### 배경음 지정 패턴
```
Background sounds include footsteps, crowd noise, car noises etc.
배경음: 발걸음, 군중음, 자동차 소음 등.
```

### 멀티모달 참조 조합 전략

| 조합 | 효과 | 적합한 용도 |
|------|------|------------|
| 텍스트만 | 순수 Text-to-Video | 빠른 아이디어 테스트 |
| 텍스트 + 이미지 1장 (first_frame) | 첫 장면 고정 + 텍스트 기반 전개 | 특정 시작 장면에서 시작하는 영상 |
| 텍스트 + 이미지 2장 (first + last) | 시작/끝 고정, 중간 AI 생성 | 정확한 시작-끝 제어 |
| 텍스트 + 참조 이미지들 | 캐릭터/장면 스타일 가이드 | 일관된 비주얼 스타일 |
| 텍스트 + 참조 비디오 | 카메라 워크/모션 복제 | 기존 영상의 움직임 재현 |
| 텍스트 + 참조 오디오 | 리듬 기반 모션 동기화 | 뮤직 비디오, 광고 |
| 텍스트 + 이미지 + 비디오 + 오디오 | 풀 멀티모달 | 최대 제어력 (비용 높음) |

> **주의**: Image-to-Video (First Frame), Image-to-Video (First & Last Frames), Multimodal Reference-to-Video는 **상호 배타적** — 동시 사용 불가

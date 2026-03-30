# Vmake AI API — 기술 문서 (원본 무삭제)

> **출처**: https://vmake.ai/developers#doc
> **수집일**: 2026-03-31
> **버전**: v1.0.0

---

## Vmake AI API

Image/Video watermark removal and quality enhancement API.

- Complete SDK Workflow
- OpenClaw Skill Integration
- RESTful WAPI Interface

---

## Quick Start

Choose the integration path that best fits your product.

### SDK Install

Python SDK that supports skill and WAPI workflow.

**다운로드**: https://kapkap-common.stariidata.com/apk/69c11291338118223Vc6Xx3afD48.zip

### OpenClaw Skill

Skill package for OpenClaw agent runtime.

**다운로드**: https://kapkap-common.stariidata.com/apk/69c1140f442237876CUGsJYh4k1797.zip

---

## SDK Usage

Set environment variables and run the first task quickly.

### Environment Variables

```bash
export MT_AK="your_access_key"
export MT_SK="your_secret_key"
```

### Invocation Example

```python
from action_api_sdk import SkillClient

client = SkillClient(region="cn-north-4")
result = client.run_task(
  "eraser_watermark",
  "/path/to/image.jpg",
  {"parameter": {"rsp_media_type": "url"}}
)
print(result)
```

### Supported Features

- Image watermark removal
- Image quality enhancement
- Video watermark removal
- Video quality enhancement

---

## OpenClaw Skill

Integrate Vmake capability into AI agent orchestration flow.

### 1. Configure Vmake API Credentials

```bash
# ~/.openclaw/.env
MT_AK=your_access_key
MT_SK=your_secret_key
```

### 2. Verify Configuration

```bash
python3 scripts/vmake_ai.py preflight
# Expected output: ok
```

### Runtime Capabilities

#### Image Processing

- Image watermark removal
- Image quality enhancement

Image tasks run synchronously and return immediate result.

#### Video Processing

- Video watermark removal
- Video quality enhancement

Video tasks run asynchronously via spawn workflow.

---

## WAPI Interface

RESTful endpoints for configuration, consumption check and invocation.

### Base URL

```
https://wapi-skill.vmake.ai
```

### Authentication

```
SDK-HMAC-SHA256
```

### Response Envelope

```json
{
  "meta": {
    "code": 0,
    "msg": "ok"
  },
  "response": {}
}
```

- `meta.code == 0`: Success, return response object.
- `meta.code != 0`: Failure, throw RuntimeError.

---

## Core Endpoints

### POST `/skill/config.json`

Fetch skill-side configuration for regions, token policy type, and algorithm presets.

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| gid | string | No | Group/device ID. |
| version | string | No | Client version, default is v1.0.0. |

#### Request Example

```http
POST /skill/config.json
Content-Type: application/json

{
  "gid": "",
  "version": "v1.0.0"
}
```

#### Response Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| gid | string | No | Cached GID value. |
| need_update | boolean | No | Whether update is required. |
| update_message | string | No | Update prompt message. |
| algorithm.regions | object | No | Region configuration. |
| algorithm.token_policy_type | string | No | Token policy type. |
| algorithm.invoke | object | No | Task preset configuration. |

---

### POST `/skill/consume.json`

Validate credits/usage after media is uploaded.

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| url | string | Yes | Accessible URL of the uploaded resource. |
| task | string | Yes | Task preset name, e.g. eraser_watermark. |
| gid | string | No | Cached GID value. |

#### Request Example

```http
POST /skill/consume.json
Content-Type: application/json

{
  "url": "https://...",
  "task": "eraser_watermark",
  "gid": ""
}
```

#### Response Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| context | string | No | Context for subsequent AI invocation. |

---

## Task Preset Names (확인된 값)

| Task Name | Description |
|-----------|-------------|
| `eraser_watermark` | 이미지/영상 워터마크 제거 |

---

## SDK 인증 키

| 환경변수 | 설명 |
|----------|------|
| `MT_AK` | Access Key |
| `MT_SK` | Secret Key |

---

## 참고 사항

- Image 작업은 **동기** 처리 (즉시 결과 반환)
- Video 작업은 **비동기** 처리 (spawn workflow)
- SDK region: `cn-north-4`
- 가격 정보: https://vmake.ai/pricing
- 현재 공개된 WAPI 엔드포인트: `config.json`, `consume.json` (invoke 엔드포인트는 문서에 미공개 — SDK 내부에서 처리)

---

## Vmake AI 서비스 전체 목록 (사이트 메뉴 기준)

### Video
- Video watermark remover — https://vmake.ai/video-watermark-remover
- Video enhancer — https://vmake.ai/video-enhancer
- Video background remover — https://vmake.ai/video-background-remover
- Remove text from video — https://vmake.ai/delete-text-from-video
- Remove noise from video — https://vmake.ai/remove-noise-from-video
- Video upscaler — https://vmake.ai/video-upscaler
- AI video generator — https://vmake.ai/ai-video-generator

### Image
- Image watermark remover — https://vmake.ai/image-watermark-remover
- Image enhancer — https://vmake.ai/image-enhancer
- AI image generator — https://vmake.ai/ai-image-generator
- AI thumbnail maker — https://vmake.ai/ai-thumbnail-maker

### AI Model Solutions (워터마크 제거)
- Sora watermark remover — https://vmake.ai/sora-watermark-remover
- Gemini watermark remover — https://vmake.ai/gemini-watermark-remover
- Kling watermark remover — https://vmake.ai/kling-watermark-remover
- Nano Banana watermark remover — https://vmake.ai/nano-banana-watermark-remover

### UGC Video
- UGC video generator — https://vmake.ai/ugc-video
- Clone viral video — https://vmake.ai/clone-viral-video
- AI avatar generator — https://vmake.ai/ai-avatar
- Product video generator — https://vmake.ai/product-video
- Hook generator — https://vmake.ai/visual-hook
- Caption generator — https://vmake.ai/auto-generated-captions

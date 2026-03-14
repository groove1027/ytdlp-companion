# Evolink Claude API 기술 문서 (원본 무삭제·무축약)
> 출처: docs.evolink.ai — 2026-03-14
> 이 문서는 원문을 한 글자도 누락·생략·요약·축약·삭제하지 않고 그대로 수록한 것입니다.

---

# 목차

1. [Claude - Messages API (OpenAPI 3.1.0 전체 스펙)](#1-claude---messages-api)
2. [EvoLink Auto - Claude Format (OpenAPI 3.1.0 전체 스펙)](#2-evolink-auto---claude-format)
3. [Claude Code CLI 연동 가이드](#3-claude-code-cli-연동-가이드)

---

# 1. Claude - Messages API

## 출처 URL
- 영문 문서: https://docs.evolink.ai/en/api-manual/language-series/claude/claude-messages-api
- 한국어 OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/claude/claude-messages-api.json

## API 개요

텍스트 및/또는 이미지 콘텐츠가 포함된 구조화된 입력 메시지 목록을 전송하면 모델이 대화의 다음 메시지를 생성합니다.
Messages API는 단일 쿼리 또는 상태 비저장 다중 턴 대화에 사용할 수 있습니다.

- **엔드포인트**: `POST /v1/messages`
- **Base URL**: `https://api.evolink.ai`
- **인증**: Bearer Token (`Authorization: Bearer YOUR_API_KEY`)
- **API Key 발급**: https://evolink.ai/dashboard/keys

## 지원 모델

| 모델명 | 설명 |
|--------|------|
| `claude-haiku-4-5-20251001` | Haiku 4.5 — 빠른 응답 |
| `claude-sonnet-4-5-20250929` | Sonnet 4.5 — 균형 |
| `claude-sonnet-4-20250514` | Sonnet 4 — 표준 |
| `claude-opus-4-1-20250805` | Opus 4.1 — 고급 |
| `claude-opus-4-5-20251101` | Opus 4.5 — 고급 |
| `claude-sonnet-4-6` | Sonnet 4.6 — 최신 |
| `claude-opus-4-6` | Opus 4.6 — 최신 |

## 메시지 역할

- `user`: 사용자 메시지
- `assistant`: AI 어시스턴트 메시지 (다중 턴 대화용)
- `system`: 시스템 프롬프트 (AI 역할과 동작을 설정)

## 필수 파라미터

### model (required, string)
프롬프트를 완성할 모델을 지정합니다.

**enum 값**:
- `claude-haiku-4-5-20251001`
- `claude-sonnet-4-5-20250929`
- `claude-opus-4-1-20250805`
- `claude-sonnet-4-20250514`
- `claude-opus-4-5-20251101`
- `claude-opus-4-6`
- `claude-sonnet-4-6`

**예시**: `"claude-sonnet-4-5-20250929"`

### messages (required, array)
입력 메시지 배열. 교대로 `user`와 `assistant` 대화 턴으로 학습된 모델입니다.
연속된 동일 역할의 메시지는 하나의 턴으로 결합됩니다.

**minItems**: 1

**예시**:
```json
[
  {
    "role": "user",
    "content": "Hello, world"
  }
]
```

### max_tokens (required, integer)
생성을 중단하기 전 최대 토큰 수. 모델은 이 최대값에 도달하기 전에 중단될 수 있습니다.

**minimum**: 1
**예시**: `1024`

## 선택 파라미터

### temperature (optional, number)
응답에 주입되는 무작위성의 양.

**기본값**: `1.0`
**범위**: `0.0` ~ `1.0`
**예시**: `1`

### system (optional, string 또는 array)
시스템 프롬프트.

**예시**: `"Today's date is 2024-06-01"`

### stop_sequences (optional, array of strings)
모델이 생성을 중단하게 하는 사용자 정의 텍스트 시퀀스.

### stream (optional, boolean)
서버 전송 이벤트(SSE)를 사용하여 응답을 점진적으로 스트리밍할지 여부.

### top_p (optional, number)
핵 샘플링 사용.

**범위**: `0` ~ `1`
**예시**: `0.7`

### top_k (optional, integer)
각 후속 토큰에 대해 상위 K개 옵션에서만 샘플링.

**minimum**: `0`
**예시**: `5`

### tools (optional, array)
모델이 사용할 수 있는 도구 정의.

**maxItems**: 20 (MCP 서버 기준)

### tool_choice (optional)
도구 선택 옵션:
- `auto`: 자동 선택
- `any`: 아무 도구 사용
- `tool`: 특정 도구 이름으로 지정
- `none`: 도구 사용 안 함

`disable_parallel_tool_use` (boolean) 옵션 포함.

### thinking (optional)
확장 사고 기능.

- `ThinkingConfigEnabled`: `type: "enabled"`, `budget_tokens` (>=1024, max_tokens 미만) 필수
- `ThinkingConfigDisabled`: `type: "disabled"`

### service_tier (optional, string)
우선 용량 또는 표준 용량 사용 여부 결정.

**enum**: `auto`, `standard_only`

### metadata (optional, object)
- `user_id` (string): 요청과 관련된 외부 사용자 식별자 (최대 256자)

### container (optional)
- `id`: 재사용을 위한 컨테이너 식별자
- `skills`: SkillParams 배열 (최대 8개)
  - `skill_id`, `type` (anthropic/custom), `version` 필수

### context_management (optional)
컨텍스트 관리 구성.
- `edits`: 컨텍스트 관리 편집 목록
  - `ClearToolUses20250919`
  - `ClearThinking20251015`

### mcp_servers (optional, array)
MCP 서버 정의.
- `name`, `type` (url), `url` 필수
- `authorization_token` (선택)
- `tool_configuration` (선택)

## 요청 콘텐츠 유형

### text
```json
{
  "type": "text",
  "text": "메시지 텍스트"
}
```
- `text` (required, string, minLength: 1)
- `cache_control` (optional): CacheControlEphemeral

### image
```json
{
  "type": "image",
  "source": {...}
}
```
소스 유형:
- `Base64ImageSource`: base64 인코딩 이미지 (`type: "base64"`, `media_type`, `data`)
- `FileImageSource`: 파일 참조 (`type: "file"`, `file_id`)

### document
```json
{
  "type": "document",
  "source": {...}
}
```
소스 유형:
- `Base64PDFSource`: base64 인코딩 PDF
- `PlainTextSource`: 일반 텍스트
- `ContentBlockSource`: 콘텐츠 블록
- `FileDocumentSource`: 파일 참조
- `title` (optional): 문서 제목
- `context` (optional): 문서 컨텍스트
- `citations` (optional): RequestCitationsConfig

### search_result
```json
{
  "type": "search_result",
  "title": "제목",
  "source": "출처",
  "content": [...]
}
```
- `title`, `source`, `content` (텍스트 블록 배열)
- `citations` (optional)

### tool_use
```json
{
  "type": "tool_use",
  "id": "toolu_xxx",
  "name": "도구명",
  "input": {...}
}
```
- `id` (pattern: `^[a-zA-Z0-9_-]+$`)
- `name`, `input` (object)

### tool_result
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_xxx",
  "content": "결과 텍스트 또는 배열",
  "is_error": false
}
```

### thinking
```json
{
  "type": "thinking",
  "thinking": "사고 내용",
  "signature": "서명"
}
```

### redacted_thinking
```json
{
  "type": "redacted_thinking",
  "data": "편집된 데이터"
}
```

### server_tool_use
```json
{
  "type": "server_tool_use",
  "name": "web_search",
  "id": "srvtoolu_xxx",
  "input": {...}
}
```
- `name` enum: `web_search`, `web_fetch`, `code_execution`, `bash_code_execution`, `text_editor_code_execution`

### container_upload
```json
{
  "type": "container_upload",
  "file_id": "파일ID"
}
```

### mcp_tool_use / mcp_tool_result
MCP 도구 사용 및 결과 블록.

## 도구 정의

### Custom Tool
```json
{
  "type": "custom",
  "name": "도구이름",
  "description": "도구 설명 (가능한 상세하게)",
  "input_schema": {...}
}
```
- `name`: 최대 128자, 패턴 `^[a-zA-Z0-9_-]{1,128}$`
- `input_schema`: JSON Schema (draft 2020-12)

### Bash Tool
- 버전: `bash_20241022`, `bash_20250124`
- `name`: `"bash"` (상수)

### Code Execution Tool
- 버전: `code_execution_20250522`, `code_execution_20250825`
- `name`: `"code_execution"` (상수)

### Computer Use Tool
- 버전: `computer_20241022`, `computer_20250124`
- `name`: `"computer"` (상수)
- `display_width_px` (required, minimum: 1)
- `display_height_px` (required, minimum: 1)
- `display_number` (optional, minimum: 0)

### Memory Tool
- 버전: `memory_20250818`
- `name`: `"memory"` (상수)

### Text Editor Tool
- 버전: `text_editor_20241022`, `text_editor_20250124`, `text_editor_20250429`, `text_editor_20250728`
- `name`: 버전에 따라 `str_replace_editor` 또는 `str_replace_based_edit_tool`
- `text_editor_20250728`: `max_characters` 파라미터 (optional)

### Web Search Tool (web_search_20250305)
- `name`: `"web_search"` (상수)
- `allowed_domains` / `blocked_domains` (상호 배타적)
- `max_uses` (exclusiveMinimum: 0)
- `user_location`: UserLocation 객체
  - `type`: `"approximate"`
  - `city`, `region`, `country`, `timezone` (all optional)
- `citations`: RequestCitationsConfig (`enabled` boolean)

### Web Fetch Tool (web_fetch_20250910)
- `name`: `"web_fetch"` (상수)
- `allowed_domains` / `blocked_domains`
- `max_uses`, `max_content_tokens`
- `citations`: RequestCitationsConfig

## 요청 예시

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Hello, world"
    }
  ]
}
```

## 응답 스키마

### Message 객체 (필수 필드)

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 고유 객체 식별자 |
| `type` | string | 항상 `"message"` |
| `role` | string | 항상 `"assistant"` |
| `model` | string | 사용된 모델명 (enum) |
| `content` | array | 응답 콘텐츠 블록 배열 |
| `stop_reason` | string (nullable) | 중단 사유 |
| `stop_sequence` | string (nullable) | 중단 시퀀스 |
| `usage` | Usage | 토큰 사용량 |
| `context_management` | object (optional) | 컨텍스트 관리 응답 |
| `container` | object (optional) | 컨테이너 정보 |

### stop_reason enum
- `end_turn`: 정상 종료
- `max_tokens`: 최대 토큰 도달
- `stop_sequence`: 중단 시퀀스 감지
- `tool_use`: 도구 사용
- `pause_turn`: 턴 일시정지
- `refusal`: 거부
- `model_context_window_exceeded`: 모델 컨텍스트 윈도우 초과

### Usage 객체

| 필드 | 타입 | 설명 |
|------|------|------|
| `input_tokens` | integer (required) | 입력 토큰 수 (minimum: 0) |
| `output_tokens` | integer (required) | 출력 토큰 수 (minimum: 0) |
| `cache_creation_input_tokens` | integer (nullable) | 캐시 생성 입력 토큰 |
| `cache_read_input_tokens` | integer (nullable) | 캐시 읽기 입력 토큰 |
| `cache_creation` | CacheCreation (optional) | 캐시 생성 정보 |
| `server_tool_use` | ServerToolUsage (optional) | 서버 도구 사용량 |
| `service_tier` | string (nullable) | enum: `standard`, `priority`, `batch` |

### 응답 콘텐츠 블록 유형

- **text**: `type: "text"`, `text` (maxLength: 5000000), `citations` (optional)
- **thinking**: `type: "thinking"`, `thinking`, `signature`
- **redacted_thinking**: `type: "redacted_thinking"`, `data`
- **tool_use**: `type: "tool_use"`, `id`, `name`, `input`
- **server_tool_use**: `type: "server_tool_use"`, `id` (pattern: `^srvtoolu_[a-zA-Z0-9_]+$`), `name`, `input`
- **web_search_tool_result**: 검색 결과 또는 에러
- **web_fetch_tool_result**: 페치 결과 또는 에러
- **code_execution_tool_result**: 코드 실행 결과 또는 에러
- **bash_code_execution_tool_result**: Bash 코드 실행 결과 또는 에러
- **text_editor_code_execution_tool_result**: 텍스트 에디터 실행 결과 또는 에러
- **mcp_tool_use**: MCP 도구 사용
- **mcp_tool_result**: MCP 도구 결과
- **container_upload**: 컨테이너 업로드

### 인용 유형 (Citations)

| 유형 | 필드 |
|------|------|
| `char_location` | `document_index`, `document_title`, `start_char_index`, `end_char_index`, `cited_text` |
| `page_location` | `document_index`, `document_title`, `start_page_number`, `end_page_number`, `cited_text` |
| `content_block_location` | `document_index`, `document_title`, `start_block_index`, `end_block_index`, `cited_text` |
| `search_result_location` | `search_result_index`, `source`, `title`, `start_block_index`, `end_block_index`, `cited_text` |
| `web_search_result_location` | `url`, `title`, `encrypted_index`, `cited_text` |

## 응답 예시

```json
{
  "model": "claude-haiku-4-5-20251001",
  "id": "msg_bdrk_017XLrAa77zWvfBGQ6ESvrxz",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "# Hey there! 👋\n\nHow's it going? What can I help you with today?"
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 8,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "output_tokens": 24
  }
}
```

## 에러 응답

### HTTP 상태 코드

| 코드 | 설명 | error.type | error.message |
|------|------|------------|---------------|
| 400 | 잘못된 요청 | `invalid_request_error` | `"잘못된 요청"` |
| 401 | 인증 오류 | `authentication_error` | `"인증 오류"` |
| 402 | 과금 오류 | `billing_error` | `"과금 오류"` |
| 403 | 권한 오류 | `permission_error` | `"Permission denied"` |
| 404 | 찾을 수 없음 | `not_found_error` | `"찾을 수 없음"` |
| 429 | 속도 제한 | `rate_limit_error` | `"Rate limited"` |
| 500 | 내부 서버 오류 | `api_error` | `"Internal server error"` |
| 502 | 게이트웨이 타임아웃 | `timeout_error` | `"Request timeout"` |
| 503 | 서비스 과부하 | `overloaded_error` | `"Overloaded"` |

### 에러 응답 형식
```json
{
  "error": {
    "message": "에러 메시지",
    "type": "에러 타입"
  },
  "request_id": "<string>",
  "type": "error",
  "fallback_suggestion": "선택적 제안 (402: billing URL, 429: retry after 60s, 500/502: try again later, 503: retry after 30s)"
}
```

## 컨텍스트 관리 (Context Management)

### ClearToolUses20250919
- `trigger`: InputTokensTrigger 또는 ToolUsesTrigger
- `keep`: ToolUsesKeep (`type: "tool_uses"`, 유지할 사용 수)
- `clear_tool_inputs` (boolean 또는 도구 이름 배열)
- `exclude_tools` (보존할 도구 이름 배열)
- `clear_at_least`: InputTokensClearAtLeast (optional)

### ClearThinking20251015
- `keep`: `"all"` 문자열, ThinkingTurns, 또는 AllThinkingTurns
- 이전 턴의 사고 블록을 제거

## 캐시 제어 (Cache Control)
- `CacheControlEphemeral`: `type: "ephemeral"` — 캐시 중단점을 설정

---

## OpenAPI 3.1.0 전체 스펙 (원본 JSON — 무삭제·무축약)

아래는 `https://docs.evolink.ai/ko/api-manual/language-series/claude/claude-messages-api.json`에서
다운로드한 OpenAPI 스펙 원본 JSON입니다. 한 글자도 수정·삭제하지 않았습니다.

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Claude Messages API",
    "description": "텍스트 및/또는 이미지 콘텐츠가 포함된 구조화된 입력 메시지 목록을 전송하면 모델이 대화의 다음 메시지를 생성합니다. Messages API는 단일 쿼리 또는 상태 비저장 다중 턴 대화에 사용할 수 있습니다.",
    "license": {
      "name": "MIT"
    },
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://api.evolink.ai",
      "description": "Standard"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/v1/messages": {
      "post": {
        "summary": "메시지 생성",
        "description": "- 텍스트 및/또는 이미지 콘텐츠가 포함된 구조화된 입력 메시지 목록을 전송하면, 모델이 대화의 다음 메시지를 생성합니다.\n- Messages API는 단일 쿼리 또는 상태 비저장 다중 턴 대화에 사용할 수 있습니다.",
        "operationId": "createMessage",
        "tags": [
          "메시지 역할\n\n- `user`: 사용자 메시지\n- `assistant`: AI 어시스턴트 메시지 (다중 턴 대화용)\n- `system`: 시스템 프롬프트 (AI 역할과 동작을 설정)"
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateMessageParams"
              },
              "example": {
                "model": "claude-sonnet-4-5-20250929",
                "max_tokens": 1024,
                "messages": [
                  {
                    "role": "user",
                    "content": "Hello, world"
                  }
                ]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "메시지 내용. 두 가지 형식을 지원합니다:\n\n**1. 일반 텍스트 문자열**: 문자열을 직접 전달합니다, 예: `\"content\":\"자기소개를 해주세요\"`\n\n**2. 객체 배열** (텍스트 입력, 멀티모달 입력 지원): 아래 구조를 참조하세요",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Message"
                },
                "example": {
                  "model": "claude-haiku-4-5-20251001",
                  "id": "msg_bdrk_017XLrAa77zWvfBGQ6ESvrxz",
                  "type": "message",
                  "role": "assistant",
                  "content": [
                    {
                      "type": "text",
                      "text": "# Hey there! 👋\n\nHow's it going? What can I help you with today?"
                    }
                  ],
                  "stop_reason": "end_turn",
                  "stop_sequence": null,
                  "usage": {
                    "input_tokens": 8,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0,
                    "output_tokens": 24
                  }
                }
              }
            }
          },
          "400": {
            "description": "잘못된 요청",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "잘못된 요청",
                    "type": "invalid_request_error"
                  },
                  "request_id": "<string>",
                  "type": "error"
                }
              }
            }
          },
          "401": {
            "description": "인증 오류",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "인증 오류",
                    "type": "authentication_error"
                  },
                  "request_id": "<string>",
                  "type": "error"
                }
              }
            }
          },
          "402": {
            "description": "과금 오류",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "과금 오류",
                    "type": "billing_error"
                  },
                  "request_id": "<string>",
                  "type": "error",
                  "fallback_suggestion": "https://evolink.ai/dashboard/billing"
                }
              }
            }
          },
          "403": {
            "description": "권한 오류",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "Permission denied",
                    "type": "permission_error"
                  },
                  "request_id": "<string>",
                  "type": "error"
                }
              }
            }
          },
          "404": {
            "description": "찾을 수 없음",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "찾을 수 없음",
                    "type": "not_found_error"
                  },
                  "request_id": "<string>",
                  "type": "error"
                }
              }
            }
          },
          "429": {
            "description": "재현 가능한 결과를 위한 랜덤 시드\n\n**참고:**\n- 범위: `1`~`2147483647`\n- 랜덤 시드를 위해 비워두세요\n- 동일한 시드와 동일한 프롬프트는 유사한 결과를 생성합니다",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "Rate limited",
                    "type": "rate_limit_error"
                  },
                  "request_id": "<string>",
                  "type": "error",
                  "fallback_suggestion": "retry after 60 seconds"
                }
              }
            }
          },
          "500": {
            "description": "내부 서버 오류",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "내부 서버 오류",
                    "type": "api_error"
                  },
                  "request_id": "<string>",
                  "type": "error",
                  "fallback_suggestion": "try again later"
                }
              }
            }
          },
          "502": {
            "description": "게이트웨이 타임아웃 오류",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "요청 시간 초과",
                    "type": "timeout_error"
                  },
                  "request_id": "<string>",
                  "type": "error",
                  "fallback_suggestion": "try again later"
                }
              }
            }
          },
          "503": {
            "description": "서비스 과부하",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                },
                "example": {
                  "error": {
                    "message": "Overloaded",
                    "type": "overloaded_error"
                  },
                  "request_id": "<string>",
                  "type": "error",
                  "fallback_suggestion": "retry after 30 seconds"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "APIError": {
        "properties": {
          "message": {
            "default": "내부 서버 오류",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "api_error",
            "default": "api_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "APIError",
        "type": "object"
      },
      "AllThinkingTurns": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "all",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "AllThinkingTurns",
        "type": "object"
      },
      "AuthenticationError": {
        "properties": {
          "message": {
            "default": "인증 오류",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "authentication_error",
            "default": "authentication_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "AuthenticationError",
        "type": "object"
      },
      "Base64ImageSource": {
        "additionalProperties": false,
        "properties": {
          "data": {
            "format": "byte",
            "title": "데이터",
            "type": "string"
          },
          "media_type": {
            "enum": [
              "image/jpeg",
              "image/png",
              "image/gif",
              "image/webp"
            ],
            "title": "웹 페이지 텍스트 콘텐츠를 컨텍스트에 포함하여 사용하는 최대 토큰 수. 이 제한은 근사치이며 PDF와 같은 바이너리 콘텐츠에는 적용되지 않습니다.",
            "type": "string"
          },
          "type": {
            "const": "base64",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "data",
          "media_type",
          "type"
        ],
        "title": "Base64ImageSource",
        "type": "object"
      },
      "Base64PDFSource": {
        "additionalProperties": false,
        "properties": {
          "data": {
            "format": "byte",
            "title": "데이터",
            "type": "string"
          },
          "media_type": {
            "const": "application/pdf",
            "title": "웹 페이지 텍스트 콘텐츠를 컨텍스트에 포함하여 사용하는 최대 토큰 수. 이 제한은 근사치이며 PDF와 같은 바이너리 콘텐츠에는 적용되지 않습니다.",
            "type": "string"
          },
          "type": {
            "const": "base64",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "data",
          "media_type",
          "type"
        ],
        "title": "PDF (base64)",
        "type": "object"
      },
      "BashCodeExecutionToolResultErrorCode": {
        "enum": [
          "invalid_tool_input",
          "unavailable",
          "too_many_requests",
          "execution_time_exceeded",
          "output_file_too_large"
        ],
        "title": "BashCodeExecutionToolResultErrorCode",
        "type": "string"
      },
      "BashTool_20241022": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "bash",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "bash_20241022",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "Bash tool (2024-10-22)",
        "type": "object"
      },
      "BashTool_20250124": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "bash",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "bash_20250124",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "Bash tool (2025-01-24)",
        "type": "object"
      },
      "BillingError": {
        "properties": {
          "message": {
            "default": "과금 오류",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "billing_error",
            "default": "billing_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "BillingError",
        "type": "object"
      },
      "CacheControlEphemeral": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "ephemeral",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "CacheControlEphemeral",
        "type": "object"
      },
      "CacheCreation": {
        "properties": {
          "ephemeral_1h_input_tokens": {
            "default": 0,
            "description": "1시간 캐시 항목을 생성하는 데 사용된 입력 토큰 수.",
            "minimum": 0,
            "title": "환경 이름 (예: production, staging)",
            "type": "integer"
          },
          "ephemeral_5m_input_tokens": {
            "default": 0,
            "description": "5분 캐시 항목을 생성하는 데 사용된 입력 토큰 수.",
            "minimum": 0,
            "title": "오류 코드",
            "type": "integer"
          }
        },
        "required": [
          "ephemeral_1h_input_tokens",
          "ephemeral_5m_input_tokens"
        ],
        "title": "CacheCreation",
        "type": "object"
      },
      "ClearThinking20251015": {
        "additionalProperties": false,
        "properties": {
          "keep": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "all": "#/components/schemas/AllThinkingTurns",
                    "thinking_turns": "#/components/schemas/ThinkingTurns"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/ThinkingTurns"
                  },
                  {
                    "$ref": "#/components/schemas/AllThinkingTurns"
                  }
                ]
              },
              {
                "const": "all",
                "type": "string"
              }
            ],
            "description": "사고 블록을 유지할 최근 어시스턴트 턴 수. 이전 턴의 사고 블록은 제거됩니다.",
            "title": "유지"
          },
          "type": {
            "const": "clear_thinking_20251015",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "ClearThinking20251015",
        "type": "object"
      },
      "ClearToolUses20250919": {
        "additionalProperties": false,
        "properties": {
          "clear_at_least": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/InputTokensClearAtLeast"
              },
              {
                "type": "null"
              }
            ],
            "description": "트리거 시 제거해야 할 최소 토큰 수. 최소한 이만큼의 토큰을 제거할 수 있는 경우에만 컨텍스트가 수정됩니다."
          },
          "clear_tool_inputs": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "모든 도구 입력을 지울지 (bool) 또는 지울 특정 도구 입력 (list)",
            "title": "Clear Tool Inputs"
          },
          "exclude_tools": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "삭제에서 보존되는 도구 사용의 도구 이름",
            "title": "Exclude Tools"
          },
          "keep": {
            "description": "대화에서 유지할 도구 사용 수",
            "discriminator": {
              "mapping": {
                "tool_uses": "#/components/schemas/ToolUsesKeep"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/components/schemas/ToolUsesKeep"
              }
            ],
            "title": "유지"
          },
          "trigger": {
            "description": "컨텍스트 관리 전략을 트리거하는 조건",
            "discriminator": {
              "mapping": {
                "input_tokens": "#/components/schemas/InputTokensTrigger",
                "tool_uses": "#/components/schemas/ToolUsesTrigger"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/components/schemas/InputTokensTrigger"
              },
              {
                "$ref": "#/components/schemas/ToolUsesTrigger"
              }
            ],
            "title": "트리거"
          },
          "type": {
            "const": "clear_tool_uses_20250919",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "ClearToolUses20250919",
        "type": "object"
      },
      "CodeExecutionToolResultErrorCode": {
        "enum": [
          "invalid_tool_input",
          "unavailable",
          "too_many_requests",
          "execution_time_exceeded"
        ],
        "title": "CodeExecutionToolResultErrorCode",
        "type": "string"
      },
      "CodeExecutionTool_20250522": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "code_execution",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "code_execution_20250522",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "Code execution tool (2025-05-22)",
        "type": "object"
      },
      "CodeExecutionTool_20250825": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "code_execution",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "code_execution_20250825",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "CodeExecutionTool_20250825",
        "type": "object"
      },
      "ComputerUseTool_20241022": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "display_height_px": {
            "description": "디스플레이의 높이 (픽셀).",
            "minimum": 1,
            "title": "Display Height Px",
            "type": "integer"
          },
          "display_number": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "description": "디스플레이의 X11 디스플레이 번호 (예: 0, 1).",
            "title": "Display Number"
          },
          "display_width_px": {
            "description": "디스플레이의 너비 (픽셀).",
            "minimum": 1,
            "title": "Display Width Px",
            "type": "integer"
          },
          "name": {
            "const": "computer",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "computer_20241022",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "display_height_px",
          "display_width_px",
          "name",
          "type"
        ],
        "title": "Computer use tool (2024-01-22)",
        "type": "object"
      },
      "ComputerUseTool_20250124": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "display_height_px": {
            "description": "디스플레이의 높이 (픽셀).",
            "minimum": 1,
            "title": "Display Height Px",
            "type": "integer"
          },
          "display_number": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "description": "디스플레이의 X11 디스플레이 번호 (예: 0, 1).",
            "title": "Display Number"
          },
          "display_width_px": {
            "description": "디스플레이의 너비 (픽셀).",
            "minimum": 1,
            "title": "Display Width Px",
            "type": "integer"
          },
          "name": {
            "const": "computer",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "computer_20250124",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "display_height_px",
          "display_width_px",
          "name",
          "type"
        ],
        "title": "Computer use tool (2025-01-24)",
        "type": "object"
      },
      "Container": {
        "description": "요청에 사용된 컨테이너 정보 (코드 실행 도구용)",
        "properties": {
          "expires_at": {
            "description": "컨테이너가 만료되는 시간.",
            "format": "date-time",
            "title": "Expires At",
            "type": "string"
          },
          "id": {
            "description": "이 요청에 사용된 컨테이너의 식별자",
            "title": "Id",
            "type": "string"
          },
          "skills": {
            "anyOf": [
              {
                "items": {
                  "$ref": "#/components/schemas/Skill"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "컨테이너에 로드된 스킬",
            "title": "스킬"
          }
        },
        "required": [
          "expires_at",
          "id",
          "skills"
        ],
        "title": "Container",
        "type": "object"
      },
      "ContainerParams": {
        "additionalProperties": false,
        "description": "로드할 스킬이 포함된 컨테이너 파라미터.",
        "properties": {
          "id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "Container id",
            "title": "Id"
          },
          "skills": {
            "anyOf": [
              {
                "items": {
                  "$ref": "#/components/schemas/SkillParams"
                },
                "maxItems": 8,
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "컨테이너에 로드할 스킬 목록",
            "title": "스킬"
          }
        },
        "title": "ContainerParams",
        "type": "object"
      },
      "ContentBlockSource": {
        "additionalProperties": false,
        "properties": {
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "items": {
                  "discriminator": {
                    "mapping": {
                      "image": "#/components/schemas/RequestImageBlock",
                      "text": "#/components/schemas/RequestTextBlock"
                    },
                    "propertyName": "type"
                  },
                  "oneOf": [
                    {
                      "$ref": "#/components/schemas/RequestTextBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestImageBlock"
                    }
                  ]
                },
                "type": "array"
              }
            ],
            "title": "콘텐츠"
          },
          "type": {
            "const": "content",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "type"
        ],
        "title": "콘텐츠 블록",
        "type": "object"
      },
      "ContextManagementConfig": {
        "additionalProperties": false,
        "properties": {
          "edits": {
            "description": "적용할 컨텍스트 관리 편집 목록",
            "items": {
              "discriminator": {
                "mapping": {
                  "clear_thinking_20251015": "#/components/schemas/ClearThinking20251015",
                  "clear_tool_uses_20250919": "#/components/schemas/ClearToolUses20250919"
                },
                "propertyName": "type"
              },
              "oneOf": [
                {
                  "$ref": "#/components/schemas/ClearToolUses20250919"
                },
                {
                  "$ref": "#/components/schemas/ClearThinking20251015"
                }
              ]
            },
            "minItems": 0,
            "title": "편집",
            "type": "array"
          }
        },
        "title": "ContextManagementConfig",
        "type": "object"
      },
      "CreateMessageParams": {
        "type": "object",
        "required": [
          "model",
          "messages",
          "max_tokens"
        ],
        "additionalProperties": false,
        "properties": {
          "model": {
            "type": "string",
            "description": "프롬프트를 완성할 모델.",
            "enum": [
              "claude-haiku-4-5-20251001",
              "claude-sonnet-4-5-20250929",
              "claude-opus-4-1-20250805",
              "claude-sonnet-4-20250514",
              "claude-opus-4-5-20251101",
              "claude-opus-4-6",
              "claude-sonnet-4-6"
            ],
            "examples": [
              "claude-sonnet-4-5-20250929"
            ],
            "title": "트리거 시 제거해야 할 최소 토큰 수. 최소한 이만큼의 토큰을 제거할 수 있는 경우에만 컨텍스트가 수정됩니다."
          },
          "messages": {
            "type": "array",
            "description": "입력 메시지.\n\n모델은 `user`와 `assistant`가 번갈아 나오는 대화 턴에서 작동하도록 훈련되었습니다. 새 `Message`를 생성할 때 `messages` 매개변수로 이전 대화 턴을 지정하면, 모델이 대화의 다음 `Message`를 생성합니다. 요청에서 연속된 `user` 또는 `assistant` 턴은 하나의 턴으로 결합됩니다.\n\n각 입력 메시지는 `role`과 `content`가 포함된 객체여야 합니다. 단일 `user` 역할 메시지를 지정하거나 여러 `user` 및 `assistant` 메시지를 포함할 수 있습니다.",
            "items": {
              "$ref": "#/components/schemas/InputMessage"
            },
            "title": "메시지 역할\n\n- `user`: 사용자 메시지\n- `assistant`: AI 어시스턴트 메시지 (다중 턴 대화용)\n- `system`: 시스템 프롬프트 (AI 역할과 동작을 설정)"
          },
          "max_tokens": {
            "type": "integer",
            "description": "중지하기 전에 생성할 최대 토큰 수.\n\n모델이 이 최대값에 도달하기 _전에_ 중지할 수 있습니다. 이 매개변수는 생성할 토큰의 절대 최대 수만 지정합니다.",
            "examples": [
              1024
            ],
            "minimum": 1,
            "title": "최대 토큰"
          },
          "container": {
            "description": "요청 간 재사용을 위한 컨테이너 식별자.",
            "title": "Container",
            "anyOf": [
              {
                "$ref": "#/components/schemas/ContainerParams"
              },
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ]
          },
          "context_management": {
            "description": "컨텍스트 관리 설정.",
            "anyOf": [
              {
                "$ref": "#/components/schemas/ContextManagementConfig"
              },
              {
                "type": "null"
              }
            ]
          },
          "mcp_servers": {
            "type": "array",
            "description": "이 요청에 사용될 MCP 서버",
            "items": {
              "$ref": "#/components/schemas/RequestMCPServerURLDefinition"
            },
            "maxItems": 20,
            "title": "응답에서 생성할 최대 토큰 수\n\n**참고**:\n- 값이 너무 작으면 응답이 잘릴 수 있습니다\n- 최대 토큰에 도달하면 finish_reason이 \"length\"가 되고, 그렇지 않으면 \"stop\"이 됩니다"
          },
          "metadata": {
            "$ref": "#/components/schemas/Metadata",
            "description": "요청에 대한 메타데이터를 설명하는 객체입니다."
          },
          "service_tier": {
            "type": "string",
            "description": "이 요청에 우선 용량 (사용 가능한 경우) 또는 표준 용량을 사용할지 결정합니다.",
            "enum": [
              "auto",
              "standard_only"
            ],
            "title": "서비스 티어"
          },
          "stop_sequences": {
            "type": "array",
            "description": "모델이 생성을 중단하게 하는 사용자 정의 텍스트 시퀀스.",
            "items": {
              "type": "string"
            },
            "title": "중지 시퀀스"
          },
          "stream": {
            "type": "boolean",
            "description": "서버 전송 이벤트를 사용하여 응답을 점진적으로 스트리밍할지 여부.",
            "title": "스트림"
          },
          "system": {
            "description": "시스템 프롬프트.",
            "examples": [
              "Today's date is 2024-06-01."
            ],
            "title": "시스템",
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/RequestTextBlock"
                }
              }
            ]
          },
          "temperature": {
            "type": "number",
            "description": "응답에 주입되는 무작위성의 양입니다.\n\n기본값은 `1.0`입니다. 범위는 `0.0`에서 `1.0`까지입니다.",
            "examples": [
              1
            ],
            "minimum": 0,
            "maximum": 1,
            "title": "Temperature"
          },
          "thinking": {
            "description": "Claude의 확장 사고를 활성화하기 위한 설정.",
            "anyOf": [
              {
                "$ref": "#/components/schemas/ThinkingConfigEnabled"
              },
              {
                "$ref": "#/components/schemas/ThinkingConfigDisabled"
              }
            ]
          },
          "tool_choice": {
            "description": "모델이 제공된 도구를 사용하는 방식.",
            "anyOf": [
              {
                "$ref": "#/components/schemas/ToolChoiceAuto"
              },
              {
                "$ref": "#/components/schemas/ToolChoiceAny"
              },
              {
                "$ref": "#/components/schemas/ToolChoiceTool"
              },
              {
                "$ref": "#/components/schemas/ToolChoiceNone"
              }
            ]
          },
          "tools": {
            "type": "array",
            "description": "모델이 사용할 수 있는 도구의 정의.",
            "items": {
              "anyOf": [
                {
                  "$ref": "#/components/schemas/Tool"
                },
                {
                  "$ref": "#/components/schemas/BashTool_20241022"
                },
                {
                  "$ref": "#/components/schemas/BashTool_20250124"
                },
                {
                  "$ref": "#/components/schemas/CodeExecutionTool_20250522"
                },
                {
                  "$ref": "#/components/schemas/CodeExecutionTool_20250825"
                },
                {
                  "$ref": "#/components/schemas/ComputerUseTool_20241022"
                },
                {
                  "$ref": "#/components/schemas/MemoryTool_20250818"
                },
                {
                  "$ref": "#/components/schemas/ComputerUseTool_20250124"
                },
                {
                  "$ref": "#/components/schemas/TextEditor_20241022"
                },
                {
                  "$ref": "#/components/schemas/TextEditor_20250124"
                },
                {
                  "$ref": "#/components/schemas/TextEditor_20250429"
                },
                {
                  "$ref": "#/components/schemas/TextEditor_20250728"
                },
                {
                  "$ref": "#/components/schemas/WebSearchTool_20250305"
                },
                {
                  "$ref": "#/components/schemas/WebFetchTool_20250910"
                }
              ]
            },
            "title": "도구"
          },
          "top_k": {
            "type": "integer",
            "description": "각 후속 토큰에 대해 상위 K개 옵션에서만 샘플링합니다.",
            "examples": [
              5
            ],
            "minimum": 0,
            "title": "Top K"
          },
          "top_p": {
            "type": "number",
            "description": "핵 샘플링을 사용합니다.",
            "examples": [
              0.7
            ],
            "minimum": 0,
            "maximum": 1,
            "title": "Top P"
          }
        }
      },
      "FileDocumentSource": {
        "additionalProperties": false,
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "file",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "파일 문서",
        "type": "object"
      },
      "FileImageSource": {
        "additionalProperties": false,
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "file",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "FileImageSource",
        "type": "object"
      },
      "GatewayTimeoutError": {
        "properties": {
          "message": {
            "default": "요청 시간 초과",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "timeout_error",
            "default": "timeout_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "GatewayTimeoutError",
        "type": "object"
      },
      "InputMessage": {
        "additionalProperties": false,
        "properties": {
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "items": {
                  "discriminator": {
                    "mapping": {
                      "bash_code_execution_tool_result": "#/components/schemas/RequestBashCodeExecutionToolResultBlock",
                      "code_execution_tool_result": "#/components/schemas/RequestCodeExecutionToolResultBlock",
                      "container_upload": "#/components/schemas/RequestContainerUploadBlock",
                      "document": "#/components/schemas/RequestDocumentBlock",
                      "image": "#/components/schemas/RequestImageBlock",
                      "mcp_tool_result": "#/components/schemas/RequestMCPToolResultBlock",
                      "mcp_tool_use": "#/components/schemas/RequestMCPToolUseBlock",
                      "redacted_thinking": "#/components/schemas/RequestRedactedThinkingBlock",
                      "search_result": "#/components/schemas/RequestSearchResultBlock",
                      "server_tool_use": "#/components/schemas/RequestServerToolUseBlock",
                      "text": "#/components/schemas/RequestTextBlock",
                      "text_editor_code_execution_tool_result": "#/components/schemas/RequestTextEditorCodeExecutionToolResultBlock",
                      "thinking": "#/components/schemas/RequestThinkingBlock",
                      "tool_result": "#/components/schemas/RequestToolResultBlock",
                      "tool_use": "#/components/schemas/RequestToolUseBlock",
                      "web_fetch_tool_result": "#/components/schemas/RequestWebFetchToolResultBlock",
                      "web_search_tool_result": "#/components/schemas/RequestWebSearchToolResultBlock"
                    },
                    "propertyName": "type"
                  },
                  "oneOf": [
                    {
                      "$ref": "#/components/schemas/RequestTextBlock",
                      "description": "일반 텍스트 콘텐츠."
                    },
                    {
                      "$ref": "#/components/schemas/RequestImageBlock",
                      "description": "base64 데이터로 직접 지정되거나 URL을 통해 참조되는 이미지 콘텐츠."
                    },
                    {
                      "$ref": "#/components/schemas/RequestDocumentBlock",
                      "description": "문서 콘텐츠, base64 데이터로 직접 지정하거나, 텍스트로 지정하거나, URL을 통한 참조로 지정합니다."
                    },
                    {
                      "$ref": "#/components/schemas/RequestSearchResultBlock",
                      "description": "검색 작업의 소스, 제목 및 콘텐츠를 포함하는 검색 결과 블록입니다."
                    },
                    {
                      "$ref": "#/components/schemas/RequestThinkingBlock",
                      "description": "모델의 내부 사고를 지정하는 블록입니다."
                    },
                    {
                      "$ref": "#/components/schemas/RequestRedactedThinkingBlock",
                      "description": "모델의 내부 수정된 사고를 지정하는 블록입니다."
                    },
                    {
                      "$ref": "#/components/schemas/RequestToolUseBlock",
                      "description": "모델에 의한 도구 사용을 나타내는 블록입니다."
                    },
                    {
                      "$ref": "#/components/schemas/RequestToolResultBlock",
                      "description": "모델의 도구 사용 결과를 지정하는 블록입니다."
                    },
                    {
                      "$ref": "#/components/schemas/RequestServerToolUseBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestWebSearchToolResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestWebFetchToolResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestCodeExecutionToolResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestBashCodeExecutionToolResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestTextEditorCodeExecutionToolResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestMCPToolUseBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestMCPToolResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestContainerUploadBlock"
                    }
                  ]
                },
                "type": "array"
              }
            ],
            "title": "콘텐츠"
          },
          "role": {
            "enum": [
              "user",
              "assistant"
            ],
            "title": "역할",
            "type": "string"
          }
        },
        "required": [
          "content",
          "role"
        ],
        "title": "InputMessage",
        "type": "object"
      },
      "InputSchema": {
        "additionalProperties": true,
        "properties": {
          "properties": {
            "anyOf": [
              {
                "additionalProperties": true,
                "type": "object"
              },
              {
                "type": "null"
              }
            ],
            "title": "속성"
          },
          "required": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "title": "필수"
          },
          "type": {
            "const": "object",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "InputSchema",
        "type": "object"
      },
      "InputTokensClearAtLeast": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "input_tokens",
            "title": "유형",
            "type": "string"
          },
          "value": {
            "minimum": 0,
            "title": "값",
            "type": "integer"
          }
        },
        "required": [
          "type",
          "value"
        ],
        "title": "InputTokensClearAtLeast",
        "type": "object"
      },
      "InputTokensTrigger": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "input_tokens",
            "title": "유형",
            "type": "string"
          },
          "value": {
            "minimum": 1,
            "title": "값",
            "type": "integer"
          }
        },
        "required": [
          "type",
          "value"
        ],
        "title": "InputTokensTrigger",
        "type": "object"
      },
      "InvalidRequestError": {
        "properties": {
          "message": {
            "default": "잘못된 요청",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "invalid_request_error",
            "default": "invalid_request_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "InvalidRequestError",
        "type": "object"
      },
      "MemoryTool_20250818": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "memory",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "memory_20250818",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "MemoryTool_20250818",
        "type": "object"
      },
      "Message": {
        "type": "object",
        "required": [
          "id",
          "type",
          "role",
          "content",
          "model",
          "stop_reason",
          "stop_sequence",
          "usage"
        ],
        "properties": {
          "id": {
            "type": "string",
            "description": "고유 객체 식별자.\n\nID의 형식과 길이는 시간이 지남에 따라 변경될 수 있습니다.",
            "examples": [
              "msg_013Zva2CMHLNnXjNJJKqJ2EF"
            ],
            "title": "Id"
          },
          "type": {
            "type": "string",
            "const": "message",
            "description": "객체 유형.\n\nMessages의 경우, 항상 `\"message\"`입니다.",
            "title": "유형"
          },
          "role": {
            "type": "string",
            "const": "assistant",
            "description": "생성된 메시지의 대화 역할.\n\n이 값은 항상 `\"assistant\"`입니다.",
            "title": "역할"
          },
          "content": {
            "type": "array",
            "description": "모델이 생성한 콘텐츠.\n\n이것은 콘텐츠 블록의 배열이며, 각 블록은 형태를 결정하는 `type`을 가지고 있습니다.",
            "items": {
              "anyOf": [
                {
                  "$ref": "#/components/schemas/ResponseTextBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseThinkingBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseRedactedThinkingBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseToolUseBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseServerToolUseBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseWebSearchToolResultBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseWebFetchToolResultBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseCodeExecutionToolResultBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseBashCodeExecutionToolResultBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseTextEditorCodeExecutionToolResultBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseMCPToolUseBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseMCPToolResultBlock"
                },
                {
                  "$ref": "#/components/schemas/ResponseContainerUploadBlock"
                }
              ]
            },
            "title": "콘텐츠"
          },
          "model": {
            "type": "string",
            "description": "요청을 처리한 모델.",
            "enum": [
              "claude-haiku-4-5-20251001",
              "claude-sonnet-4-5-20250929",
              "claude-opus-4-1-20250805",
              "claude-sonnet-4-20250514",
              "claude-sonnet-4-6"
            ],
            "examples": [
              "claude-sonnet-4-5-20250929"
            ],
            "title": "트리거 시 제거해야 할 최소 토큰 수. 최소한 이만큼의 토큰을 제거할 수 있는 경우에만 컨텍스트가 수정됩니다."
          },
          "stop_reason": {
            "type": "string",
            "nullable": true,
            "description": "중지 이유.",
            "enum": [
              "end_turn",
              "max_tokens",
              "stop_sequence",
              "tool_use",
              "pause_turn",
              "refusal",
              "model_context_window_exceeded"
            ],
            "title": "중지 이유"
          },
          "stop_sequence": {
            "type": "string",
            "nullable": true,
            "description": "생성된 사용자 정의 중지 시퀀스 (있는 경우).",
            "title": "중지 시퀀스"
          },
          "usage": {
            "$ref": "#/components/schemas/Usage",
            "description": "과금 및 속도 제한 사용량."
          },
          "context_management": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseContextManagement"
              },
              {
                "type": "null"
              }
            ],
            "description": "컨텍스트 관리 응답."
          },
          "container": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/Container"
              },
              {
                "type": "null"
              }
            ],
            "description": "이 요청에 사용된 컨테이너 정보."
          }
        }
      },
      "Metadata": {
        "additionalProperties": false,
        "properties": {
          "user_id": {
            "anyOf": [
              {
                "maxLength": 256,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "요청과 연관된 사용자의 외부 식별자입니다.\n\nuuid, 해시 값 또는 기타 불투명 식별자여야 합니다. Anthropic은 이 ID를 남용 감지에 사용할 수 있습니다. 이름, 이메일 주소 또는 전화번호와 같은 식별 정보를 포함하지 마세요.",
            "examples": [
              "13803d75-b4b5-4c3e-b2a2-6f21399b021b"
            ],
            "title": "사용자 Id"
          }
        },
        "title": "메타데이터",
        "type": "object"
      },
      "NotFoundError": {
        "properties": {
          "message": {
            "default": "찾을 수 없음",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "not_found_error",
            "default": "not_found_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "NotFoundError",
        "type": "object"
      },
      "OverloadedError": {
        "properties": {
          "message": {
            "default": "Overloaded",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "overloaded_error",
            "default": "overloaded_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "OverloadedError",
        "type": "object"
      },
      "PermissionError": {
        "properties": {
          "message": {
            "default": "Permission denied",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "permission_error",
            "default": "permission_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "PermissionError",
        "type": "object"
      },
      "PlainTextSource": {
        "additionalProperties": false,
        "properties": {
          "data": {
            "title": "데이터",
            "type": "string"
          },
          "media_type": {
            "const": "text/plain",
            "title": "웹 페이지 텍스트 콘텐츠를 컨텍스트에 포함하여 사용하는 최대 토큰 수. 이 제한은 근사치이며 PDF와 같은 바이너리 콘텐츠에는 적용되지 않습니다.",
            "type": "string"
          },
          "type": {
            "const": "text",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "data",
          "media_type",
          "type"
        ],
        "title": "일반 텍스트",
        "type": "object"
      },
      "RateLimitError": {
        "properties": {
          "message": {
            "default": "Rate limited",
            "title": "메시지",
            "type": "string"
          },
          "type": {
            "const": "rate_limit_error",
            "default": "rate_limit_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "message",
          "type"
        ],
        "title": "RateLimitError",
        "type": "object"
      },
      "RequestBashCodeExecutionOutputBlock": {
        "additionalProperties": false,
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "bash_code_execution_output",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "RequestBashCodeExecutionOutputBlock",
        "type": "object"
      },
      "RequestBashCodeExecutionResultBlock": {
        "additionalProperties": false,
        "properties": {
          "content": {
            "items": {
              "$ref": "#/components/schemas/RequestBashCodeExecutionOutputBlock"
            },
            "title": "콘텐츠",
            "type": "array"
          },
          "return_code": {
            "title": "반환 코드",
            "type": "integer"
          },
          "stderr": {
            "title": "Stderr",
            "type": "string"
          },
          "stdout": {
            "title": "Stdout",
            "type": "string"
          },
          "type": {
            "const": "bash_code_execution_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "return_code",
          "stderr",
          "stdout",
          "type"
        ],
        "title": "RequestBashCodeExecutionResultBlock",
        "type": "object"
      },
      "RequestBashCodeExecutionToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestBashCodeExecutionToolResultError"
              },
              {
                "$ref": "#/components/schemas/RequestBashCodeExecutionResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "bash_code_execution_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "RequestBashCodeExecutionToolResultBlock",
        "type": "object"
      },
      "RequestBashCodeExecutionToolResultError": {
        "additionalProperties": false,
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/BashCodeExecutionToolResultErrorCode"
          },
          "type": {
            "const": "bash_code_execution_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "RequestBashCodeExecutionToolResultError",
        "type": "object"
      },
      "RequestCharLocationCitation": {
        "additionalProperties": false,
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "document_index": {
            "minimum": 0,
            "title": "문서 인덱스",
            "type": "integer"
          },
          "document_title": {
            "anyOf": [
              {
                "maxLength": 255,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "문서 제목"
          },
          "end_char_index": {
            "title": "종료 턴 인덱스 (배타적)",
            "type": "integer"
          },
          "start_char_index": {
            "minimum": 0,
            "title": "시작 문자 인덱스",
            "type": "integer"
          },
          "type": {
            "const": "char_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "document_index",
          "document_title",
          "end_char_index",
          "start_char_index",
          "type"
        ],
        "title": "캐릭터 위치",
        "type": "object"
      },
      "RequestCitationsConfig": {
        "additionalProperties": false,
        "properties": {
          "enabled": {
            "title": "워터마크 활성화\n\n**참고:**\n- `true`: 생성된 비디오에 워터마크 추가\n- `false`: 워터마크 없음 (기본값)",
            "type": "boolean"
          }
        },
        "title": "RequestCitationsConfig",
        "type": "object"
      },
      "RequestCodeExecutionOutputBlock": {
        "additionalProperties": false,
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "code_execution_output",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "RequestCodeExecutionOutputBlock",
        "type": "object"
      },
      "RequestCodeExecutionResultBlock": {
        "additionalProperties": false,
        "properties": {
          "content": {
            "items": {
              "$ref": "#/components/schemas/RequestCodeExecutionOutputBlock"
            },
            "title": "콘텐츠",
            "type": "array"
          },
          "return_code": {
            "title": "반환 코드",
            "type": "integer"
          },
          "stderr": {
            "title": "Stderr",
            "type": "string"
          },
          "stdout": {
            "title": "Stdout",
            "type": "string"
          },
          "type": {
            "const": "code_execution_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "return_code",
          "stderr",
          "stdout",
          "type"
        ],
        "title": "코드 실행 결과",
        "type": "object"
      },
      "RequestCodeExecutionToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestCodeExecutionToolResultError"
              },
              {
                "$ref": "#/components/schemas/RequestCodeExecutionResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "code_execution_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "코드 실행 도구 결과",
        "type": "object"
      },
      "RequestCodeExecutionToolResultError": {
        "additionalProperties": false,
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/CodeExecutionToolResultErrorCode"
          },
          "type": {
            "const": "code_execution_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "코드 실행 도구 오류",
        "type": "object"
      },
      "RequestContainerUploadBlock": {
        "additionalProperties": false,
        "description": "컨테이너에 업로드할 파일을 나타내는 콘텐츠 블록입니다.\n이 블록을 통해 업로드된 파일은 컨테이너의 입력 디렉토리에서 사용할 수 있습니다.",
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "container_upload",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "컨테이너 업로드",
        "type": "object"
      },
      "RequestContentBlockLocationCitation": {
        "additionalProperties": false,
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "document_index": {
            "minimum": 0,
            "title": "문서 인덱스",
            "type": "integer"
          },
          "document_title": {
            "anyOf": [
              {
                "maxLength": 255,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "문서 제목"
          },
          "end_block_index": {
            "title": "종료 페이지 (배타적)",
            "type": "integer"
          },
          "start_block_index": {
            "minimum": 0,
            "title": "시작 블록 인덱스",
            "type": "integer"
          },
          "type": {
            "const": "content_block_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "document_index",
          "document_title",
          "end_block_index",
          "start_block_index",
          "type"
        ],
        "title": "콘텐츠 블록 위치",
        "type": "object"
      },
      "RequestDocumentBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "citations": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestCitationsConfig"
              },
              {
                "type": "null"
              }
            ]
          },
          "context": {
            "anyOf": [
              {
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "컨텍스트"
          },
          "source": {
            "discriminator": {
              "mapping": {
                "base64": "#/components/schemas/Base64PDFSource",
                "content": "#/components/schemas/ContentBlockSource",
                "file": "#/components/schemas/FileDocumentSource",
                "text": "#/components/schemas/PlainTextSource"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/components/schemas/Base64PDFSource"
              },
              {
                "$ref": "#/components/schemas/PlainTextSource"
              },
              {
                "$ref": "#/components/schemas/ContentBlockSource"
              },
              {
                "$ref": "#/components/schemas/FileDocumentSource"
              }
            ]
          },
          "title": {
            "anyOf": [
              {
                "maxLength": 500,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "제목"
          },
          "type": {
            "const": "document",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "source",
          "type"
        ],
        "title": "문서",
        "type": "object"
      },
      "RequestImageBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "source": {
            "discriminator": {
              "mapping": {
                "base64": "#/components/schemas/Base64ImageSource",
                "file": "#/components/schemas/FileImageSource"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/components/schemas/Base64ImageSource"
              },
              {
                "$ref": "#/components/schemas/FileImageSource"
              }
            ],
            "title": "소스"
          },
          "type": {
            "const": "image",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "source",
          "type"
        ],
        "title": "이미지",
        "type": "object"
      },
      "RequestMCPServerToolConfiguration": {
        "additionalProperties": false,
        "properties": {
          "allowed_tools": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "title": "허용된 도구"
          },
          "enabled": {
            "anyOf": [
              {
                "type": "boolean"
              },
              {
                "type": "null"
              }
            ],
            "title": "워터마크 활성화\n\n**참고:**\n- `true`: 생성된 비디오에 워터마크 추가\n- `false`: 워터마크 없음 (기본값)"
          }
        },
        "title": "RequestMCPServerToolConfiguration",
        "type": "object"
      },
      "RequestMCPServerURLDefinition": {
        "additionalProperties": false,
        "properties": {
          "authorization_token": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "Authorization Token"
          },
          "name": {
            "title": "이름",
            "type": "string"
          },
          "tool_configuration": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestMCPServerToolConfiguration"
              },
              {
                "type": "null"
              }
            ]
          },
          "type": {
            "const": "url",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type",
          "url"
        ],
        "title": "RequestMCPServerURLDefinition",
        "type": "object"
      },
      "RequestMCPToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "items": {
                  "$ref": "#/components/schemas/RequestTextBlock"
                },
                "type": "array"
              }
            ],
            "title": "콘텐츠"
          },
          "is_error": {
            "title": "오류 여부",
            "type": "boolean"
          },
          "tool_use_id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "mcp_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "tool_use_id",
          "type"
        ],
        "title": "Tool Use 또는 Function Calling을 위한 도구 목록\n\n**참고**:\n- 각 도구에는 type이 포함되어야 합니다\n- function 구조에는 name, description, parameters가 포함되어야 합니다\n- tools 배열에 최대 128개의 함수",
        "type": "object"
      },
      "RequestMCPToolUseBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "Id",
            "type": "string"
          },
          "input": {
            "additionalProperties": true,
            "title": "입력",
            "type": "object"
          },
          "name": {
            "title": "이름",
            "type": "string"
          },
          "server_name": {
            "description": "MCP 서버의 이름",
            "title": "서버 이름",
            "type": "string"
          },
          "type": {
            "const": "mcp_tool_use",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "id",
          "input",
          "name",
          "server_name",
          "type"
        ],
        "title": "MCP 도구 사용",
        "type": "object"
      },
      "RequestPageLocationCitation": {
        "additionalProperties": false,
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "document_index": {
            "minimum": 0,
            "title": "문서 인덱스",
            "type": "integer"
          },
          "document_title": {
            "anyOf": [
              {
                "maxLength": 255,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "문서 제목"
          },
          "end_page_number": {
            "title": "환경 이름",
            "type": "integer"
          },
          "start_page_number": {
            "minimum": 1,
            "title": "시작 페이지 번호",
            "type": "integer"
          },
          "type": {
            "const": "page_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "document_index",
          "document_title",
          "end_page_number",
          "start_page_number",
          "type"
        ],
        "title": "페이지 위치",
        "type": "object"
      },
      "RequestRedactedThinkingBlock": {
        "additionalProperties": false,
        "properties": {
          "data": {
            "title": "데이터",
            "type": "string"
          },
          "type": {
            "const": "redacted_thinking",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "data",
          "type"
        ],
        "title": "수정된 사고",
        "type": "object"
      },
      "RequestSearchResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "citations": {
            "$ref": "#/components/schemas/RequestCitationsConfig"
          },
          "content": {
            "items": {
              "$ref": "#/components/schemas/RequestTextBlock"
            },
            "title": "콘텐츠",
            "type": "array"
          },
          "source": {
            "title": "소스",
            "type": "string"
          },
          "title": {
            "title": "제목",
            "type": "string"
          },
          "type": {
            "const": "search_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "source",
          "title",
          "type"
        ],
        "title": "검색 결과",
        "type": "object"
      },
      "RequestSearchResultLocationCitation": {
        "additionalProperties": false,
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "end_block_index": {
            "title": "종료 페이지 (배타적)",
            "type": "integer"
          },
          "search_result_index": {
            "minimum": 0,
            "title": "검색 결과 인덱스",
            "type": "integer"
          },
          "source": {
            "title": "소스",
            "type": "string"
          },
          "start_block_index": {
            "minimum": 0,
            "title": "시작 블록 인덱스",
            "type": "integer"
          },
          "title": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "제목"
          },
          "type": {
            "const": "search_result_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "end_block_index",
          "search_result_index",
          "source",
          "start_block_index",
          "title",
          "type"
        ],
        "title": "RequestSearchResultLocationCitation",
        "type": "object"
      },
      "RequestServerToolUseBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "Id",
            "type": "string"
          },
          "input": {
            "additionalProperties": true,
            "title": "입력",
            "type": "object"
          },
          "name": {
            "enum": [
              "web_search",
              "web_fetch",
              "code_execution",
              "bash_code_execution",
              "text_editor_code_execution"
            ],
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "server_tool_use",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "id",
          "input",
          "name",
          "type"
        ],
        "title": "서버 도구 사용",
        "type": "object"
      },
      "RequestTextBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "citations": {
            "anyOf": [
              {
                "items": {
                  "discriminator": {
                    "mapping": {
                      "char_location": "#/components/schemas/RequestCharLocationCitation",
                      "content_block_location": "#/components/schemas/RequestContentBlockLocationCitation",
                      "page_location": "#/components/schemas/RequestPageLocationCitation",
                      "search_result_location": "#/components/schemas/RequestSearchResultLocationCitation",
                      "web_search_result_location": "#/components/schemas/RequestWebSearchResultLocationCitation"
                    },
                    "propertyName": "type"
                  },
                  "oneOf": [
                    {
                      "$ref": "#/components/schemas/RequestCharLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/RequestPageLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/RequestContentBlockLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/RequestWebSearchResultLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/RequestSearchResultLocationCitation"
                    }
                  ]
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "title": "인용"
          },
          "text": {
            "minLength": 1,
            "title": "텍스트",
            "type": "string"
          },
          "type": {
            "const": "text",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "text",
          "type"
        ],
        "title": "텍스트",
        "type": "object"
      },
      "RequestTextEditorCodeExecutionCreateResultBlock": {
        "additionalProperties": false,
        "properties": {
          "is_file_update": {
            "title": "파일 업데이트 여부",
            "type": "boolean"
          },
          "type": {
            "const": "text_editor_code_execution_create_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "is_file_update",
          "type"
        ],
        "title": "RequestTextEditorCodeExecutionCreateResultBlock",
        "type": "object"
      },
      "RequestTextEditorCodeExecutionStrReplaceResultBlock": {
        "additionalProperties": false,
        "properties": {
          "lines": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "title": "마지막 프레임 이미지 URL\n\n**제약 조건:**\n- 마지막 프레임은 첫 프레임이 필요합니다\n- 총 이미지 수가 2를 초과하면 마지막 프레임이 지원되지 않습니다"
          },
          "new_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "새 라인"
          },
          "new_start": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "이미지에서 보고 싶지 않은 콘텐츠를 설명하는 네거티브 프롬프트, 출력을 제한하는 데 사용\n\n**참고:**\n- 중국어와 영어를 지원하며, 최대 길이 `500`자, 각 한자/글자는 한 글자로 계산, 초과 시 자동으로 잘림"
          },
          "old_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "이전 라인"
          },
          "old_start": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "객체 유형.\n\nMessages의 경우, 항상 `\"message\"`입니다."
          },
          "type": {
            "const": "text_editor_code_execution_str_replace_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "RequestTextEditorCodeExecutionStrReplaceResultBlock",
        "type": "object"
      },
      "RequestTextEditorCodeExecutionToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestTextEditorCodeExecutionToolResultError"
              },
              {
                "$ref": "#/components/schemas/RequestTextEditorCodeExecutionViewResultBlock"
              },
              {
                "$ref": "#/components/schemas/RequestTextEditorCodeExecutionCreateResultBlock"
              },
              {
                "$ref": "#/components/schemas/RequestTextEditorCodeExecutionStrReplaceResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "text_editor_code_execution_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "RequestTextEditorCodeExecutionToolResultBlock",
        "type": "object"
      },
      "RequestTextEditorCodeExecutionToolResultError": {
        "additionalProperties": false,
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/TextEditorCodeExecutionToolResultErrorCode"
          },
          "error_message": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "오류 코드 (예: invalid_api_key, insufficient_credits)"
          },
          "type": {
            "const": "text_editor_code_execution_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "RequestTextEditorCodeExecutionToolResultError",
        "type": "object"
      },
      "RequestTextEditorCodeExecutionViewResultBlock": {
        "additionalProperties": false,
        "properties": {
          "content": {
            "title": "콘텐츠",
            "type": "string"
          },
          "file_type": {
            "enum": [
              "text",
              "image",
              "pdf"
            ],
            "title": "파일 유형",
            "type": "string"
          },
          "num_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "Nucleus sampling 매개변수\n\n**참고**:\n- 누적 확률에서 토큰 샘플링을 제어합니다\n- 예를 들어, 0.9는 상위 90% 누적 확률의 토큰에서 샘플링하는 것을 의미합니다\n- 기본값: 1.0 (모든 토큰 고려)\n\n**권장사항**: temperature와 top_p를 동시에 조정하지 마세요"
          },
          "start_line": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "시작 줄"
          },
          "total_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "title": "총 줄 수"
          },
          "type": {
            "const": "text_editor_code_execution_view_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "file_type",
          "type"
        ],
        "title": "RequestTextEditorCodeExecutionViewResultBlock",
        "type": "object"
      },
      "RequestThinkingBlock": {
        "additionalProperties": false,
        "properties": {
          "signature": {
            "title": "서명",
            "type": "string"
          },
          "thinking": {
            "title": "사고",
            "type": "string"
          },
          "type": {
            "const": "thinking",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "signature",
          "thinking",
          "type"
        ],
        "title": "사고",
        "type": "object"
      },
      "RequestToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "items": {
                  "discriminator": {
                    "mapping": {
                      "document": "#/components/schemas/RequestDocumentBlock",
                      "image": "#/components/schemas/RequestImageBlock",
                      "search_result": "#/components/schemas/RequestSearchResultBlock",
                      "text": "#/components/schemas/RequestTextBlock"
                    },
                    "propertyName": "type"
                  },
                  "oneOf": [
                    {
                      "$ref": "#/components/schemas/RequestTextBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestImageBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestSearchResultBlock"
                    },
                    {
                      "$ref": "#/components/schemas/RequestDocumentBlock"
                    }
                  ]
                },
                "type": "array"
              }
            ],
            "title": "콘텐츠"
          },
          "is_error": {
            "title": "오류 여부",
            "type": "boolean"
          },
          "tool_use_id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "tool_use_id",
          "type"
        ],
        "title": "도구 결과",
        "type": "object"
      },
      "RequestToolUseBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "Id",
            "type": "string"
          },
          "input": {
            "additionalProperties": true,
            "title": "입력",
            "type": "object"
          },
          "name": {
            "maxLength": 200,
            "minLength": 1,
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "tool_use",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "id",
          "input",
          "name",
          "type"
        ],
        "title": "도구 사용",
        "type": "object"
      },
      "RequestWebFetchResultBlock": {
        "additionalProperties": false,
        "properties": {
          "content": {
            "$ref": "#/components/schemas/RequestDocumentBlock"
          },
          "retrieved_at": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "콘텐츠가 검색된 ISO 8601 타임스탬프",
            "title": "검색 시간"
          },
          "type": {
            "const": "web_fetch_result",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "description": "가져온 콘텐츠 URL",
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "content",
          "type",
          "url"
        ],
        "title": "RequestWebFetchResultBlock",
        "type": "object"
      },
      "RequestWebFetchToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestWebFetchToolResultError"
              },
              {
                "$ref": "#/components/schemas/RequestWebFetchResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "web_fetch_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "RequestWebFetchToolResultBlock",
        "type": "object"
      },
      "RequestWebFetchToolResultError": {
        "additionalProperties": false,
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/WebFetchToolResultErrorCode"
          },
          "type": {
            "const": "web_fetch_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "RequestWebFetchToolResultError",
        "type": "object"
      },
      "RequestWebSearchResultBlock": {
        "additionalProperties": false,
        "properties": {
          "encrypted_content": {
            "title": "종료 인덱스",
            "type": "string"
          },
          "page_age": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "페이지 연령"
          },
          "title": {
            "title": "제목",
            "type": "string"
          },
          "type": {
            "const": "web_search_result",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "encrypted_content",
          "title",
          "type",
          "url"
        ],
        "title": "RequestWebSearchResultBlock",
        "type": "object"
      },
      "RequestWebSearchResultLocationCitation": {
        "additionalProperties": false,
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "encrypted_index": {
            "title": "종료 인덱스 (배타적)",
            "type": "string"
          },
          "title": {
            "anyOf": [
              {
                "maxLength": 512,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "제목"
          },
          "type": {
            "const": "web_search_result_location",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "maxLength": 2048,
            "minLength": 1,
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "encrypted_index",
          "title",
          "type",
          "url"
        ],
        "title": "RequestWebSearchResultLocationCitation",
        "type": "object"
      },
      "RequestWebSearchToolResultBlock": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "content": {
            "anyOf": [
              {
                "items": {
                  "$ref": "#/components/schemas/RequestWebSearchResultBlock"
                },
                "type": "array"
              },
              {
                "$ref": "#/components/schemas/RequestWebSearchToolResultError"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "web_search_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "웹 검색 도구 결과",
        "type": "object"
      },
      "RequestWebSearchToolResultError": {
        "additionalProperties": false,
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/WebSearchToolResultErrorCode"
          },
          "type": {
            "const": "web_search_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "RequestWebSearchToolResultError",
        "type": "object"
      },
      "ResponseBashCodeExecutionOutputBlock": {
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "bash_code_execution_output",
            "default": "bash_code_execution_output",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "ResponseBashCodeExecutionOutputBlock",
        "type": "object"
      },
      "ResponseBashCodeExecutionResultBlock": {
        "properties": {
          "content": {
            "items": {
              "$ref": "#/components/schemas/ResponseBashCodeExecutionOutputBlock"
            },
            "title": "콘텐츠",
            "type": "array"
          },
          "return_code": {
            "title": "반환 코드",
            "type": "integer"
          },
          "stderr": {
            "title": "Stderr",
            "type": "string"
          },
          "stdout": {
            "title": "Stdout",
            "type": "string"
          },
          "type": {
            "const": "bash_code_execution_result",
            "default": "bash_code_execution_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "return_code",
          "stderr",
          "stdout",
          "type"
        ],
        "title": "ResponseBashCodeExecutionResultBlock",
        "type": "object"
      },
      "ResponseBashCodeExecutionToolResultBlock": {
        "properties": {
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseBashCodeExecutionToolResultError"
              },
              {
                "$ref": "#/components/schemas/ResponseBashCodeExecutionResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "bash_code_execution_tool_result",
            "default": "bash_code_execution_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "ResponseBashCodeExecutionToolResultBlock",
        "type": "object"
      },
      "ResponseBashCodeExecutionToolResultError": {
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/BashCodeExecutionToolResultErrorCode"
          },
          "type": {
            "const": "bash_code_execution_tool_result_error",
            "default": "bash_code_execution_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "ResponseBashCodeExecutionToolResultError",
        "type": "object"
      },
      "ResponseCharLocationCitation": {
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "document_index": {
            "minimum": 0,
            "title": "문서 인덱스",
            "type": "integer"
          },
          "document_title": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "문서 제목"
          },
          "end_char_index": {
            "title": "종료 턴 인덱스 (배타적)",
            "type": "integer"
          },
          "file_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "File Id"
          },
          "start_char_index": {
            "minimum": 0,
            "title": "시작 문자 인덱스",
            "type": "integer"
          },
          "type": {
            "const": "char_location",
            "default": "char_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "document_index",
          "document_title",
          "end_char_index",
          "file_id",
          "start_char_index",
          "type"
        ],
        "title": "캐릭터 위치",
        "type": "object"
      },
      "ResponseCitationsConfig": {
        "properties": {
          "enabled": {
            "default": false,
            "title": "워터마크 활성화\n\n**참고:**\n- `true`: 생성된 비디오에 워터마크 추가\n- `false`: 워터마크 없음 (기본값)",
            "type": "boolean"
          }
        },
        "required": [
          "enabled"
        ],
        "title": "ResponseCitationsConfig",
        "type": "object"
      },
      "ResponseClearThinking20251015Edit": {
        "properties": {
          "cleared_input_tokens": {
            "description": "생성할 이미지 수, `[1,4]` 사이의 정수 값 지원\n\n**참고:**\n- 단일 요청은 `n` 값을 기준으로 선불 청구되며, 실제 청구는 생성된 이미지 수를 기준으로 합니다",
            "minimum": 0,
            "title": "Cleared Input Tokens",
            "type": "integer"
          },
          "cleared_thinking_turns": {
            "description": "제거된 사고 턴 수.",
            "minimum": 0,
            "title": "Cleared Thinking Turns",
            "type": "integer"
          },
          "type": {
            "const": "clear_thinking_20251015",
            "default": "clear_thinking_20251015",
            "description": "적용된 컨텍스트 관리 편집 유형.",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cleared_input_tokens",
          "cleared_thinking_turns",
          "type"
        ],
        "title": "ResponseClearThinking20251015Edit",
        "type": "object"
      },
      "ResponseClearToolUses20250919Edit": {
        "properties": {
          "cleared_input_tokens": {
            "description": "생성할 이미지 수, `[1,4]` 사이의 정수 값 지원\n\n**참고:**\n- 단일 요청은 `n` 값을 기준으로 선불 청구되며, 실제 청구는 생성된 이미지 수를 기준으로 합니다",
            "minimum": 0,
            "title": "Cleared Input Tokens",
            "type": "integer"
          },
          "cleared_tool_uses": {
            "description": "제거된 도구 사용 수.",
            "minimum": 0,
            "title": "Cleared Tool Uses",
            "type": "integer"
          },
          "type": {
            "const": "clear_tool_uses_20250919",
            "default": "clear_tool_uses_20250919",
            "description": "적용된 컨텍스트 관리 편집 유형.",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cleared_input_tokens",
          "cleared_tool_uses",
          "type"
        ],
        "title": "ResponseClearToolUses20250919Edit",
        "type": "object"
      },
      "ResponseCodeExecutionOutputBlock": {
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "code_execution_output",
            "default": "code_execution_output",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "ResponseCodeExecutionOutputBlock",
        "type": "object"
      },
      "ResponseCodeExecutionResultBlock": {
        "properties": {
          "content": {
            "items": {
              "$ref": "#/components/schemas/ResponseCodeExecutionOutputBlock"
            },
            "title": "콘텐츠",
            "type": "array"
          },
          "return_code": {
            "title": "반환 코드",
            "type": "integer"
          },
          "stderr": {
            "title": "Stderr",
            "type": "string"
          },
          "stdout": {
            "title": "Stdout",
            "type": "string"
          },
          "type": {
            "const": "code_execution_result",
            "default": "code_execution_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "return_code",
          "stderr",
          "stdout",
          "type"
        ],
        "title": "코드 실행 결과",
        "type": "object"
      },
      "ResponseCodeExecutionToolResultBlock": {
        "properties": {
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseCodeExecutionToolResultError"
              },
              {
                "$ref": "#/components/schemas/ResponseCodeExecutionResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "code_execution_tool_result",
            "default": "code_execution_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "코드 실행 도구 결과",
        "type": "object"
      },
      "ResponseCodeExecutionToolResultError": {
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/CodeExecutionToolResultErrorCode"
          },
          "type": {
            "const": "code_execution_tool_result_error",
            "default": "code_execution_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "코드 실행 도구 오류",
        "type": "object"
      },
      "ResponseContainerUploadBlock": {
        "description": "컨테이너에 업로드된 파일의 응답 모델.",
        "properties": {
          "file_id": {
            "title": "File Id",
            "type": "string"
          },
          "type": {
            "const": "container_upload",
            "default": "container_upload",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "file_id",
          "type"
        ],
        "title": "컨테이너 업로드",
        "type": "object"
      },
      "ResponseContentBlockLocationCitation": {
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "document_index": {
            "minimum": 0,
            "title": "문서 인덱스",
            "type": "integer"
          },
          "document_title": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "문서 제목"
          },
          "end_block_index": {
            "title": "종료 페이지 (배타적)",
            "type": "integer"
          },
          "file_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "File Id"
          },
          "start_block_index": {
            "minimum": 0,
            "title": "시작 블록 인덱스",
            "type": "integer"
          },
          "type": {
            "const": "content_block_location",
            "default": "content_block_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "document_index",
          "document_title",
          "end_block_index",
          "file_id",
          "start_block_index",
          "type"
        ],
        "title": "콘텐츠 블록 위치",
        "type": "object"
      },
      "ResponseContextManagement": {
        "properties": {
          "applied_edits": {
            "description": "적용된 컨텍스트 관리 편집 목록.",
            "items": {
              "discriminator": {
                "mapping": {
                  "clear_thinking_20251015": "#/components/schemas/ResponseClearThinking20251015Edit",
                  "clear_tool_uses_20250919": "#/components/schemas/ResponseClearToolUses20250919Edit"
                },
                "propertyName": "type"
              },
              "oneOf": [
                {
                  "$ref": "#/components/schemas/ResponseClearToolUses20250919Edit"
                },
                {
                  "$ref": "#/components/schemas/ResponseClearThinking20251015Edit"
                }
              ]
            },
            "title": "적용된 편집",
            "type": "array"
          }
        },
        "required": [
          "applied_edits"
        ],
        "title": "ResponseContextManagement",
        "type": "object"
      },
      "ResponseDocumentBlock": {
        "properties": {
          "citations": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseCitationsConfig"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "문서에 대한 인용 설정"
          },
          "source": {
            "discriminator": {
              "mapping": {
                "base64": "#/components/schemas/Base64PDFSource",
                "text": "#/components/schemas/PlainTextSource"
              },
              "propertyName": "type"
            },
            "oneOf": [
              {
                "$ref": "#/components/schemas/Base64PDFSource"
              },
              {
                "$ref": "#/components/schemas/PlainTextSource"
              }
            ],
            "title": "소스"
          },
          "title": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "문서 제목",
            "title": "제목"
          },
          "type": {
            "const": "document",
            "default": "document",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "citations",
          "source",
          "title",
          "type"
        ],
        "title": "ResponseDocumentBlock",
        "type": "object"
      },
      "ResponseMCPToolResultBlock": {
        "properties": {
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "items": {
                  "$ref": "#/components/schemas/ResponseTextBlock"
                },
                "type": "array"
              }
            ],
            "title": "콘텐츠"
          },
          "is_error": {
            "default": false,
            "title": "오류 여부",
            "type": "boolean"
          },
          "tool_use_id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "mcp_tool_result",
            "default": "mcp_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "is_error",
          "tool_use_id",
          "type"
        ],
        "title": "Tool Use 또는 Function Calling을 위한 도구 목록\n\n**참고**:\n- 각 도구에는 type이 포함되어야 합니다\n- function 구조에는 name, description, parameters가 포함되어야 합니다\n- tools 배열에 최대 128개의 함수",
        "type": "object"
      },
      "ResponseMCPToolUseBlock": {
        "properties": {
          "id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "Id",
            "type": "string"
          },
          "input": {
            "additionalProperties": true,
            "title": "입력",
            "type": "object"
          },
          "name": {
            "description": "MCP 도구의 이름",
            "title": "이름",
            "type": "string"
          },
          "server_name": {
            "description": "MCP 서버의 이름",
            "title": "서버 이름",
            "type": "string"
          },
          "type": {
            "const": "mcp_tool_use",
            "default": "mcp_tool_use",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "id",
          "input",
          "name",
          "server_name",
          "type"
        ],
        "title": "MCP 도구 사용",
        "type": "object"
      },
      "ResponsePageLocationCitation": {
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "document_index": {
            "minimum": 0,
            "title": "문서 인덱스",
            "type": "integer"
          },
          "document_title": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "문서 제목"
          },
          "end_page_number": {
            "title": "환경 이름",
            "type": "integer"
          },
          "file_id": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "File Id"
          },
          "start_page_number": {
            "minimum": 1,
            "title": "시작 페이지 번호",
            "type": "integer"
          },
          "type": {
            "const": "page_location",
            "default": "page_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "document_index",
          "document_title",
          "end_page_number",
          "file_id",
          "start_page_number",
          "type"
        ],
        "title": "페이지 위치",
        "type": "object"
      },
      "ResponseRedactedThinkingBlock": {
        "properties": {
          "data": {
            "title": "데이터",
            "type": "string"
          },
          "type": {
            "const": "redacted_thinking",
            "default": "redacted_thinking",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "data",
          "type"
        ],
        "title": "수정된 사고",
        "type": "object"
      },
      "ResponseSearchResultLocationCitation": {
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "end_block_index": {
            "title": "종료 페이지 (배타적)",
            "type": "integer"
          },
          "search_result_index": {
            "minimum": 0,
            "title": "검색 결과 인덱스",
            "type": "integer"
          },
          "source": {
            "title": "소스",
            "type": "string"
          },
          "start_block_index": {
            "minimum": 0,
            "title": "시작 블록 인덱스",
            "type": "integer"
          },
          "title": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "제목"
          },
          "type": {
            "const": "search_result_location",
            "default": "search_result_location",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "end_block_index",
          "search_result_index",
          "source",
          "start_block_index",
          "title",
          "type"
        ],
        "title": "ResponseSearchResultLocationCitation",
        "type": "object"
      },
      "ResponseServerToolUseBlock": {
        "properties": {
          "id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "Id",
            "type": "string"
          },
          "input": {
            "additionalProperties": true,
            "title": "입력",
            "type": "object"
          },
          "name": {
            "enum": [
              "web_search",
              "web_fetch",
              "code_execution",
              "bash_code_execution",
              "text_editor_code_execution"
            ],
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "server_tool_use",
            "default": "server_tool_use",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "id",
          "input",
          "name",
          "type"
        ],
        "title": "서버 도구 사용",
        "type": "object"
      },
      "ResponseTextBlock": {
        "properties": {
          "citations": {
            "anyOf": [
              {
                "items": {
                  "discriminator": {
                    "mapping": {
                      "char_location": "#/components/schemas/ResponseCharLocationCitation",
                      "content_block_location": "#/components/schemas/ResponseContentBlockLocationCitation",
                      "page_location": "#/components/schemas/ResponsePageLocationCitation",
                      "search_result_location": "#/components/schemas/ResponseSearchResultLocationCitation",
                      "web_search_result_location": "#/components/schemas/ResponseWebSearchResultLocationCitation"
                    },
                    "propertyName": "type"
                  },
                  "oneOf": [
                    {
                      "$ref": "#/components/schemas/ResponseCharLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/ResponsePageLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/ResponseContentBlockLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/ResponseWebSearchResultLocationCitation"
                    },
                    {
                      "$ref": "#/components/schemas/ResponseSearchResultLocationCitation"
                    }
                  ]
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "텍스트 블록을 지원하는 인용.\n\n반환되는 인용 유형은 인용되는 문서 유형에 따라 달라집니다. PDF를 인용하면 `page_location`이, 일반 텍스트를 인용하면 `char_location`이, 콘텐츠 문서를 인용하면 `content_block_location`이 반환됩니다.",
            "title": "인용"
          },
          "text": {
            "maxLength": 5000000,
            "minLength": 0,
            "title": "텍스트",
            "type": "string"
          },
          "type": {
            "const": "text",
            "default": "text",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "citations",
          "text",
          "type"
        ],
        "title": "텍스트",
        "type": "object"
      },
      "ResponseTextEditorCodeExecutionCreateResultBlock": {
        "properties": {
          "is_file_update": {
            "title": "파일 업데이트 여부",
            "type": "boolean"
          },
          "type": {
            "const": "text_editor_code_execution_create_result",
            "default": "text_editor_code_execution_create_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "is_file_update",
          "type"
        ],
        "title": "ResponseTextEditorCodeExecutionCreateResultBlock",
        "type": "object"
      },
      "ResponseTextEditorCodeExecutionStrReplaceResultBlock": {
        "properties": {
          "lines": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "마지막 프레임 이미지 URL\n\n**제약 조건:**\n- 마지막 프레임은 첫 프레임이 필요합니다\n- 총 이미지 수가 2를 초과하면 마지막 프레임이 지원되지 않습니다"
          },
          "new_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "새 라인"
          },
          "new_start": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "이미지에서 보고 싶지 않은 콘텐츠를 설명하는 네거티브 프롬프트, 출력을 제한하는 데 사용\n\n**참고:**\n- 중국어와 영어를 지원하며, 최대 길이 `500`자, 각 한자/글자는 한 글자로 계산, 초과 시 자동으로 잘림"
          },
          "old_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "이전 라인"
          },
          "old_start": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "객체 유형.\n\nMessages의 경우, 항상 `\"message\"`입니다."
          },
          "type": {
            "const": "text_editor_code_execution_str_replace_result",
            "default": "text_editor_code_execution_str_replace_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "lines",
          "new_lines",
          "new_start",
          "old_lines",
          "old_start",
          "type"
        ],
        "title": "ResponseTextEditorCodeExecutionStrReplaceResultBlock",
        "type": "object"
      },
      "ResponseTextEditorCodeExecutionToolResultBlock": {
        "properties": {
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseTextEditorCodeExecutionToolResultError"
              },
              {
                "$ref": "#/components/schemas/ResponseTextEditorCodeExecutionViewResultBlock"
              },
              {
                "$ref": "#/components/schemas/ResponseTextEditorCodeExecutionCreateResultBlock"
              },
              {
                "$ref": "#/components/schemas/ResponseTextEditorCodeExecutionStrReplaceResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "text_editor_code_execution_tool_result",
            "default": "text_editor_code_execution_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "ResponseTextEditorCodeExecutionToolResultBlock",
        "type": "object"
      },
      "ResponseTextEditorCodeExecutionToolResultError": {
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/TextEditorCodeExecutionToolResultErrorCode"
          },
          "error_message": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "오류 코드 (예: invalid_api_key, insufficient_credits)"
          },
          "type": {
            "const": "text_editor_code_execution_tool_result_error",
            "default": "text_editor_code_execution_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "error_message",
          "type"
        ],
        "title": "ResponseTextEditorCodeExecutionToolResultError",
        "type": "object"
      },
      "ResponseTextEditorCodeExecutionViewResultBlock": {
        "properties": {
          "content": {
            "title": "콘텐츠",
            "type": "string"
          },
          "file_type": {
            "enum": [
              "text",
              "image",
              "pdf"
            ],
            "title": "파일 유형",
            "type": "string"
          },
          "num_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "Nucleus sampling 매개변수\n\n**참고**:\n- 누적 확률에서 토큰 샘플링을 제어합니다\n- 예를 들어, 0.9는 상위 90% 누적 확률의 토큰에서 샘플링하는 것을 의미합니다\n- 기본값: 1.0 (모든 토큰 고려)\n\n**권장사항**: temperature와 top_p를 동시에 조정하지 마세요"
          },
          "start_line": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "시작 줄"
          },
          "total_lines": {
            "anyOf": [
              {
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "총 줄 수"
          },
          "type": {
            "const": "text_editor_code_execution_view_result",
            "default": "text_editor_code_execution_view_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "file_type",
          "num_lines",
          "start_line",
          "total_lines",
          "type"
        ],
        "title": "ResponseTextEditorCodeExecutionViewResultBlock",
        "type": "object"
      },
      "ResponseThinkingBlock": {
        "properties": {
          "signature": {
            "title": "서명",
            "type": "string"
          },
          "thinking": {
            "title": "사고",
            "type": "string"
          },
          "type": {
            "const": "thinking",
            "default": "thinking",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "signature",
          "thinking",
          "type"
        ],
        "title": "사고",
        "type": "object"
      },
      "ResponseToolUseBlock": {
        "properties": {
          "id": {
            "pattern": "^[a-zA-Z0-9_-]+$",
            "title": "Id",
            "type": "string"
          },
          "input": {
            "additionalProperties": true,
            "title": "입력",
            "type": "object"
          },
          "name": {
            "minLength": 1,
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "tool_use",
            "default": "tool_use",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "id",
          "input",
          "name",
          "type"
        ],
        "title": "도구 사용",
        "type": "object"
      },
      "ResponseWebFetchResultBlock": {
        "properties": {
          "content": {
            "$ref": "#/components/schemas/ResponseDocumentBlock"
          },
          "retrieved_at": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "콘텐츠가 검색된 ISO 8601 타임스탬프",
            "title": "검색 시간"
          },
          "type": {
            "const": "web_fetch_result",
            "default": "web_fetch_result",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "description": "가져온 콘텐츠 URL",
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "content",
          "retrieved_at",
          "type",
          "url"
        ],
        "title": "ResponseWebFetchResultBlock",
        "type": "object"
      },
      "ResponseWebFetchToolResultBlock": {
        "properties": {
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseWebFetchToolResultError"
              },
              {
                "$ref": "#/components/schemas/ResponseWebFetchResultBlock"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "web_fetch_tool_result",
            "default": "web_fetch_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "ResponseWebFetchToolResultBlock",
        "type": "object"
      },
      "ResponseWebFetchToolResultError": {
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/WebFetchToolResultErrorCode"
          },
          "type": {
            "const": "web_fetch_tool_result_error",
            "default": "web_fetch_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "ResponseWebFetchToolResultError",
        "type": "object"
      },
      "ResponseWebSearchResultBlock": {
        "properties": {
          "encrypted_content": {
            "title": "종료 인덱스",
            "type": "string"
          },
          "page_age": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "title": "페이지 연령"
          },
          "title": {
            "title": "제목",
            "type": "string"
          },
          "type": {
            "const": "web_search_result",
            "default": "web_search_result",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "encrypted_content",
          "page_age",
          "title",
          "type",
          "url"
        ],
        "title": "ResponseWebSearchResultBlock",
        "type": "object"
      },
      "ResponseWebSearchResultLocationCitation": {
        "properties": {
          "cited_text": {
            "title": "인용된 텍스트",
            "type": "string"
          },
          "encrypted_index": {
            "title": "종료 인덱스 (배타적)",
            "type": "string"
          },
          "title": {
            "anyOf": [
              {
                "maxLength": 512,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "title": "제목"
          },
          "type": {
            "const": "web_search_result_location",
            "default": "web_search_result_location",
            "title": "유형",
            "type": "string"
          },
          "url": {
            "title": "Url",
            "type": "string"
          }
        },
        "required": [
          "cited_text",
          "encrypted_index",
          "title",
          "type",
          "url"
        ],
        "title": "ResponseWebSearchResultLocationCitation",
        "type": "object"
      },
      "ResponseWebSearchToolResultBlock": {
        "properties": {
          "content": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ResponseWebSearchToolResultError"
              },
              {
                "items": {
                  "$ref": "#/components/schemas/ResponseWebSearchResultBlock"
                },
                "type": "array"
              }
            ],
            "title": "콘텐츠"
          },
          "tool_use_id": {
            "pattern": "^srvtoolu_[a-zA-Z0-9_]+$",
            "title": "도구 사용 Id",
            "type": "string"
          },
          "type": {
            "const": "web_search_tool_result",
            "default": "web_search_tool_result",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "content",
          "tool_use_id",
          "type"
        ],
        "title": "웹 검색 도구 결과",
        "type": "object"
      },
      "ResponseWebSearchToolResultError": {
        "properties": {
          "error_code": {
            "$ref": "#/components/schemas/WebSearchToolResultErrorCode"
          },
          "type": {
            "const": "web_search_tool_result_error",
            "default": "web_search_tool_result_error",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "error_code",
          "type"
        ],
        "title": "ResponseWebSearchToolResultError",
        "type": "object"
      },
      "ServerToolUsage": {
        "properties": {
          "web_fetch_requests": {
            "default": 0,
            "description": "웹 페치 도구 요청 수.",
            "examples": [
              2
            ],
            "minimum": 0,
            "title": "웹 페치 요청",
            "type": "integer"
          },
          "web_search_requests": {
            "default": 0,
            "description": "웹 검색 도구 요청 수.",
            "examples": [
              0
            ],
            "minimum": 0,
            "title": "웹 검색 요청",
            "type": "integer"
          }
        },
        "required": [
          "web_fetch_requests",
          "web_search_requests"
        ],
        "title": "ServerToolUsage",
        "type": "object"
      },
      "Skill": {
        "description": "컨테이너에 로드된 스킬 (응답 모델).",
        "properties": {
          "skill_id": {
            "description": "스킬 ID",
            "maxLength": 64,
            "minLength": 1,
            "title": "스킬 Id",
            "type": "string"
          },
          "type": {
            "description": "스킬 유형 - 'anthropic' (내장) 또는 'custom' (사용자 정의)",
            "enum": [
              "anthropic",
              "custom"
            ],
            "title": "유형",
            "type": "string"
          },
          "version": {
            "description": "스킬 버전 또는 최신 버전의 경우 'latest'",
            "maxLength": 64,
            "minLength": 1,
            "title": "버전",
            "type": "string"
          }
        },
        "required": [
          "skill_id",
          "type",
          "version"
        ],
        "title": "스킬",
        "type": "object"
      },
      "SkillParams": {
        "additionalProperties": false,
        "description": "컨테이너에 로드할 스킬의 사양 (요청 모델).",
        "properties": {
          "skill_id": {
            "description": "스킬 ID",
            "maxLength": 64,
            "minLength": 1,
            "title": "스킬 Id",
            "type": "string"
          },
          "type": {
            "description": "스킬 유형 - 'anthropic' (내장) 또는 'custom' (사용자 정의)",
            "enum": [
              "anthropic",
              "custom"
            ],
            "title": "유형",
            "type": "string"
          },
          "version": {
            "description": "스킬 버전 또는 최신 버전의 경우 'latest'",
            "maxLength": 64,
            "minLength": 1,
            "title": "버전",
            "type": "string"
          }
        },
        "required": [
          "skill_id",
          "type"
        ],
        "title": "SkillParams",
        "type": "object"
      },
      "TextEditorCodeExecutionToolResultErrorCode": {
        "enum": [
          "invalid_tool_input",
          "unavailable",
          "too_many_requests",
          "execution_time_exceeded",
          "file_not_found"
        ],
        "title": "TextEditorCodeExecutionToolResultErrorCode",
        "type": "string"
      },
      "TextEditor_20241022": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "str_replace_editor",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "text_editor_20241022",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "텍스트 편집기 도구 (2024-10-22)",
        "type": "object"
      },
      "TextEditor_20250124": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "str_replace_editor",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "text_editor_20250124",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "텍스트 편집기 도구 (2025-01-24)",
        "type": "object"
      },
      "TextEditor_20250429": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "name": {
            "const": "str_replace_based_edit_tool",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "text_editor_20250429",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "텍스트 편집기 도구 (2025-04-29)",
        "type": "object"
      },
      "TextEditor_20250728": {
        "additionalProperties": false,
        "properties": {
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "max_characters": {
            "anyOf": [
              {
                "minimum": 1,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "description": "파일 조회 시 표시할 최대 문자 수. 지정하지 않으면 전체 파일이 표시됩니다.",
            "title": "최대 문자 수"
          },
          "name": {
            "const": "str_replace_based_edit_tool",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "text_editor_20250728",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "TextEditor_20250728",
        "type": "object"
      },
      "ThinkingConfigDisabled": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "disabled",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "비활성화됨",
        "type": "object"
      },
      "ThinkingConfigEnabled": {
        "additionalProperties": false,
        "properties": {
          "budget_tokens": {
            "description": "Claude가 내부 추론 과정에 사용할 수 있는 토큰 수를 결정합니다. 더 큰 예산은 복잡한 문제에 대해 더 철저한 분석을 가능하게 하여 응답 품질을 향상시킬 수 있습니다.\n\n≥1024이고 `max_tokens`보다 작아야 합니다.\n\n자세한 내용은 [확장 사고](https://docs.claude.com/ko/docs/build-with-claude/extended-thinking)를 참조하세요.",
            "minimum": 1024,
            "title": "Budget Tokens",
            "type": "integer"
          },
          "type": {
            "const": "enabled",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "budget_tokens",
          "type"
        ],
        "title": "워터마크 활성화\n\n**참고:**\n- `true`: 생성된 비디오에 워터마크 추가\n- `false`: 워터마크 없음 (기본값)",
        "type": "object"
      },
      "ThinkingTurns": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "thinking_turns",
            "title": "유형",
            "type": "string"
          },
          "value": {
            "minimum": 1,
            "title": "값",
            "type": "integer"
          }
        },
        "required": [
          "type",
          "value"
        ],
        "title": "ThinkingTurns",
        "type": "object"
      },
      "Tool": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "anyOf": [
              {
                "type": "null"
              },
              {
                "const": "custom",
                "type": "string"
              }
            ],
            "title": "유형"
          },
          "description": {
            "description": "이 도구가 수행하는 작업에 대한 설명.\n\n도구 설명은 가능한 한 상세해야 합니다. 모델이 도구의 정체와 사용 방법에 대해 더 많은 정보를 가질수록 더 나은 성능을 발휘합니다. 자연어 설명을 사용하여 도구 입력 JSON 스키마의 중요한 측면을 강조할 수 있습니다.",
            "examples": [
              "주어진 위치의 현재 날씨를 가져옵니다"
            ],
            "title": "설명",
            "type": "string"
          },
          "name": {
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "maxLength": 128,
            "minLength": 1,
            "pattern": "^[a-zA-Z0-9_-]{1,128}$",
            "title": "이름",
            "type": "string"
          },
          "input_schema": {
            "$ref": "#/components/schemas/InputSchema",
            "description": "이 도구의 입력에 대한 [JSON schema](https://json-schema.org/draft/2020-12).\n\n도구가 수락하고 모델이 생성할 `input`의 형태를 정의합니다.",
            "examples": [
              {
                "properties": {
                  "location": {
                    "description": "도시 및 주, 예: San Francisco, CA",
                    "type": "string"
                  },
                  "unit": {
                    "description": "출력 단위 - (celsius, fahrenheit) 중 하나",
                    "type": "string"
                  }
                },
                "required": [
                  "location"
                ],
                "type": "object"
              }
            ]
          },
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          }
        },
        "required": [
          "name",
          "input_schema"
        ],
        "title": "사용자 정의 도구",
        "type": "object"
      },
      "ToolChoiceAny": {
        "additionalProperties": false,
        "description": "모델이 사용 가능한 모든 도구를 사용합니다.",
        "properties": {
          "disable_parallel_tool_use": {
            "description": "병렬 도구 사용을 비활성화할지 여부.\n\n기본값은 `false`입니다. `true`로 설정하면 모델은 정확히 하나의 도구 사용만 출력합니다.",
            "title": "병렬 도구 사용 비활성화",
            "type": "boolean"
          },
          "type": {
            "const": "any",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "Any",
        "type": "object"
      },
      "ToolChoiceAuto": {
        "additionalProperties": false,
        "description": "모델이 도구 사용 여부를 자동으로 결정합니다.",
        "properties": {
          "disable_parallel_tool_use": {
            "description": "병렬 도구 사용을 비활성화할지 여부.\n\n기본값은 `false`입니다. `true`로 설정하면 모델은 최대 하나의 도구 사용만 출력합니다.",
            "title": "병렬 도구 사용 비활성화",
            "type": "boolean"
          },
          "type": {
            "const": "auto",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "Auto",
        "type": "object"
      },
      "ToolChoiceNone": {
        "additionalProperties": false,
        "description": "모델이 도구를 사용할 수 없습니다.",
        "properties": {
          "type": {
            "const": "none",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "없음",
        "type": "object"
      },
      "ToolChoiceTool": {
        "additionalProperties": false,
        "description": "모델이 `tool_choice.name`으로 지정된 도구를 사용합니다.",
        "properties": {
          "disable_parallel_tool_use": {
            "description": "병렬 도구 사용을 비활성화할지 여부.\n\n기본값은 `false`입니다. `true`로 설정하면 모델은 정확히 하나의 도구 사용만 출력합니다.",
            "title": "병렬 도구 사용 비활성화",
            "type": "boolean"
          },
          "name": {
            "description": "사용할 도구의 이름.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "tool",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "도구",
        "type": "object"
      },
      "ToolUsesKeep": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "tool_uses",
            "title": "유형",
            "type": "string"
          },
          "value": {
            "minimum": 0,
            "title": "값",
            "type": "integer"
          }
        },
        "required": [
          "type",
          "value"
        ],
        "title": "ToolUsesKeep",
        "type": "object"
      },
      "ToolUsesTrigger": {
        "additionalProperties": false,
        "properties": {
          "type": {
            "const": "tool_uses",
            "title": "유형",
            "type": "string"
          },
          "value": {
            "minimum": 1,
            "title": "값",
            "type": "integer"
          }
        },
        "required": [
          "type",
          "value"
        ],
        "title": "ToolUsesTrigger",
        "type": "object"
      },
      "Usage": {
        "properties": {
          "cache_creation": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/CacheCreation"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "TTL별 캐시된 토큰 분류"
          },
          "cache_creation_input_tokens": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "캐시 항목을 생성하는 데 사용된 입력 토큰 수.",
            "examples": [
              2051
            ],
            "title": "Cache Creation Input Tokens"
          },
          "cache_read_input_tokens": {
            "anyOf": [
              {
                "minimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "캐시에서 읽은 입력 토큰 수.",
            "examples": [
              2051
            ],
            "title": "Cache Read Input Tokens"
          },
          "input_tokens": {
            "description": "사용된 입력 토큰 수.",
            "examples": [
              2095
            ],
            "minimum": 0,
            "title": "입력 토큰",
            "type": "integer"
          },
          "output_tokens": {
            "description": "사용된 출력 토큰 수.",
            "examples": [
              503
            ],
            "minimum": 0,
            "title": "편집을 위한 원본 비디오 URL 목록\n\n**참고:**\n- 요청당 `1`개의 비디오만 가능\n- 지원 비디오 길이: `3`~`10`초 (3초 미만 비디오는 3초로 과금, 10초 초과 비디오는 10초로 과금)\n- 비디오 크기: 최대 `100MB`\n- 지원 형식: `.mp4`, `.mov`\n- 비디오 URL은 서버에서 직접 접근 가능해야 합니다",
            "type": "integer"
          },
          "server_tool_use": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/ServerToolUsage"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "서버 도구 요청 수."
          },
          "service_tier": {
            "anyOf": [
              {
                "enum": [
                  "standard",
                  "priority",
                  "batch"
                ],
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "default": null,
            "description": "요청이 priority, standard 또는 batch 티어를 사용했는지 여부.",
            "title": "서비스 티어"
          }
        },
        "required": [
          "cache_creation",
          "cache_creation_input_tokens",
          "cache_read_input_tokens",
          "input_tokens",
          "output_tokens",
          "server_tool_use",
          "service_tier"
        ],
        "title": "사용량",
        "type": "object"
      },
      "UserLocation": {
        "additionalProperties": false,
        "properties": {
          "city": {
            "anyOf": [
              {
                "maxLength": 255,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "사용자의 도시.",
            "examples": [
              "New York",
              "Tokyo",
              "Los Angeles"
            ],
            "title": "도시"
          },
          "country": {
            "anyOf": [
              {
                "maxLength": 2,
                "minLength": 2,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "사용자의 두 글자 [ISO 국가 코드](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).",
            "examples": [
              "US",
              "JP",
              "GB"
            ],
            "title": "국가"
          },
          "region": {
            "anyOf": [
              {
                "maxLength": 255,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "사용자의 지역.",
            "examples": [
              "California",
              "Ontario",
              "Wales"
            ],
            "title": "참조 이미지, 최대 3개, 각 최대 10MB"
          },
          "timezone": {
            "anyOf": [
              {
                "maxLength": 255,
                "minLength": 1,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "사용자의 [IANA 시간대](https://nodatime.org/TimeZones).",
            "examples": [
              "America/New_York",
              "Asia/Tokyo",
              "Europe/London"
            ],
            "title": "시간대"
          },
          "type": {
            "const": "approximate",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "type"
        ],
        "title": "UserLocation",
        "type": "object"
      },
      "WebFetchToolResultErrorCode": {
        "enum": [
          "invalid_tool_input",
          "url_too_long",
          "url_not_allowed",
          "url_not_accessible",
          "unsupported_content_type",
          "too_many_requests",
          "max_uses_exceeded",
          "unavailable"
        ],
        "title": "WebFetchToolResultErrorCode",
        "type": "string"
      },
      "WebFetchTool_20250910": {
        "additionalProperties": false,
        "properties": {
          "allowed_domains": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "가져오기를 허용할 도메인 목록",
            "title": "허용된 도메인"
          },
          "blocked_domains": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "가져오기를 차단할 도메인 목록",
            "title": "차단된 도메인"
          },
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "citations": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/RequestCitationsConfig"
              },
              {
                "type": "null"
              }
            ],
            "description": "가져온 문서에 대한 인용 설정. 인용은 기본적으로 비활성화되어 있습니다."
          },
          "max_content_tokens": {
            "anyOf": [
              {
                "exclusiveMinimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "description": "웹 페이지 텍스트 콘텐츠를 컨텍스트에 포함하여 사용하는 최대 토큰 수. 이 제한은 근사치이며 PDF와 같은 바이너리 콘텐츠에는 적용되지 않습니다.",
            "title": "최대 콘텐츠 토큰"
          },
          "max_uses": {
            "anyOf": [
              {
                "exclusiveMinimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "description": "API 요청에서 도구를 사용할 수 있는 최대 횟수.",
            "title": "최대 사용 횟수"
          },
          "name": {
            "const": "web_fetch",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "web_fetch_20250910",
            "title": "유형",
            "type": "string"
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "WebFetchTool_20250910",
        "type": "object"
      },
      "WebSearchToolResultErrorCode": {
        "enum": [
          "invalid_tool_input",
          "unavailable",
          "max_uses_exceeded",
          "too_many_requests",
          "query_too_long"
        ],
        "title": "WebSearchToolResultErrorCode",
        "type": "string"
      },
      "WebSearchTool_20250305": {
        "additionalProperties": false,
        "properties": {
          "allowed_domains": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "제공된 경우, 이 도메인만 결과에 포함됩니다. `blocked_domains`와 함께 사용할 수 없습니다.",
            "title": "허용된 도메인"
          },
          "blocked_domains": {
            "anyOf": [
              {
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              {
                "type": "null"
              }
            ],
            "description": "제공된 경우, 이 도메인은 결과에 표시되지 않습니다. `allowed_domains`와 함께 사용할 수 없습니다.",
            "title": "차단된 도메인"
          },
          "cache_control": {
            "anyOf": [
              {
                "discriminator": {
                  "mapping": {
                    "ephemeral": "#/components/schemas/CacheControlEphemeral"
                  },
                  "propertyName": "type"
                },
                "oneOf": [
                  {
                    "$ref": "#/components/schemas/CacheControlEphemeral"
                  }
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "이 콘텐츠 블록에 캐시 제어 중단점을 생성합니다.",
            "title": "Cache Control"
          },
          "max_uses": {
            "anyOf": [
              {
                "exclusiveMinimum": 0,
                "type": "integer"
              },
              {
                "type": "null"
              }
            ],
            "description": "API 요청에서 도구를 사용할 수 있는 최대 횟수.",
            "title": "최대 사용 횟수"
          },
          "name": {
            "const": "web_search",
            "description": "도구의 이름.\n\n모델이 `tool_use` 블록에서 도구를 호출하는 데 사용하는 이름입니다.",
            "title": "이름",
            "type": "string"
          },
          "type": {
            "const": "web_search_20250305",
            "title": "유형",
            "type": "string"
          },
          "user_location": {
            "anyOf": [
              {
                "$ref": "#/components/schemas/UserLocation"
              },
              {
                "type": "null"
              }
            ],
            "description": "사용자 위치에 대한 매개변수. 더 관련성 높은 검색 결과를 제공하는 데 사용됩니다."
          }
        },
        "required": [
          "name",
          "type"
        ],
        "title": "웹 검색 도구 (2025-03-05)",
        "type": "object"
      }
    },
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "##모든 API는 Bearer Token 인증이 필요합니다##\n\n**API Key 받기:**\n\n[API Key 관리 페이지](https://evolink.ai/dashboard/keys)를 방문하여 API Key를 받으세요\n\n**요청 헤더에 추가:**\n```\nAuthorization: Bearer YOUR_API_KEY\n```"
      }
    }
  },
  "tags": [
    {
      "name": "메시지 역할\n\n- `user`: 사용자 메시지\n- `assistant`: AI 어시스턴트 메시지 (다중 턴 대화용)\n- `system`: 시스템 프롬프트 (AI 역할과 동작을 설정)",
      "description": "Claude AI 메시지 생성 및 대화 API"
    }
  ]
}
```

---

# 2. EvoLink Auto - Claude Format

## 출처 URL
- 영문 문서: https://docs.evolink.ai/en/api-manual/language-series/evolink-auto/evolink-auto-claude
- 한국어 OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/evolink-auto/evolink-auto-claude.json

## API 개요

Anthropic Messages API 포맷을 사용한 지능형 모델 라우팅.
EvoLink의 자동 라우팅 시스템이 최적의 모델을 자동으로 선택합니다.

- **엔드포인트**: `POST /v1/messages`
- **Base URL**: `https://direct.evolink.ai`
- **인증**: Bearer Token
- **API Key 발급**: https://evolink.ai/dashboard/keys

## 요청 파라미터

### model (required, string)
지능형 라우팅 사용.

**enum**: `evolink/auto`
**예시**: `"evolink/auto"`

### messages (required, array)
대화 메시지.

**minItems**: 1

**예시**:
```json
[
  {
    "role": "user",
    "content": "Introduce the history of artificial intelligence"
  }
]
```

### max_tokens (required, integer)
생성할 최대 토큰 수.

**minimum**: 1
**예시**: `1024`

### temperature (optional, number)
샘플링 온도.

**범위**: `0` ~ `2`
**예시**: `0.7`

### top_p (optional, number)
핵 샘플링 파라미터.

**범위**: `0` ~ `1`
**예시**: `0.9`

### top_k (optional, integer)
Top-K 샘플링.

**minimum**: 1
**예시**: `40`

### stream (optional, boolean)
스트리밍 활성화.

**기본값**: `false`

## 요청 예시

```json
{
  "model": "evolink/auto",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": "Introduce the history of artificial intelligence"
    }
  ]
}
```

## 응답 스키마

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 응답 고유 식별자 |
| `model` | string | 실제 사용된 모델명 (예: `"claude-opus-4-6"`, `"gpt-5.4"`) |
| `type` | string | `"message"` |
| `role` | string | `"assistant"` |
| `content` | array | 응답 콘텐츠 블록 배열 |
| `usage` | object | `input_tokens`, `output_tokens` |

## 응답 예시

```json
{
  "id": "msg_01XFDUDYJgAACyzWYzeHhsX7",
  "model": "gpt-5.4",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "인공지능의 발전 역사는 1950년대로 거슬러 올라갑니다..."
    }
  ],
  "usage": {
    "input_tokens": 15,
    "output_tokens": 156
  }
}
```

## OpenAPI 3.1.0 전체 스펙 (원본 JSON — 무삭제·무축약)

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "EvoLink Auto - Claude Format",
    "description": "Intelligent model routing using Anthropic Messages API format",
    "license": {
      "name": "MIT"
    },
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://direct.evolink.ai",
      "description": "Standard API"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/v1/messages": {
      "post": {
        "summary": "Intelligent Model Routing (Claude Format)",
        "description": "Intelligent routing using Anthropic Messages API format",
        "operationId": "createMessagesAuto",
        "tags": [
          "Intelligent Routing"
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ClaudeAutoRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ClaudeResponse"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "ClaudeAutoRequest": {
        "type": "object",
        "required": [
          "model",
          "messages",
          "max_tokens"
        ],
        "properties": {
          "model": {
            "type": "string",
            "description": "Use intelligent routing",
            "enum": [
              "evolink/auto"
            ],
            "example": "evolink/auto"
          },
          "messages": {
            "type": "array",
            "description": "Conversation messages",
            "items": {
              "$ref": "#/components/schemas/MessageInput"
            },
            "minItems": 1,
            "example": [
              {
                "role": "user",
                "content": "Introduce the history of artificial intelligence"
              }
            ]
          },
          "max_tokens": {
            "type": "integer",
            "description": "Maximum tokens to generate",
            "minimum": 1,
            "example": 1024
          },
          "temperature": {
            "type": "number",
            "description": "Sampling temperature",
            "minimum": 0,
            "maximum": 2,
            "example": 0.7
          },
          "top_p": {
            "type": "number",
            "description": "Nucleus sampling parameter",
            "minimum": 0,
            "maximum": 1,
            "example": 0.9
          },
          "top_k": {
            "type": "integer",
            "description": "Top-K sampling",
            "minimum": 1,
            "example": 40
          },
          "stream": {
            "type": "boolean",
            "description": "Enable streaming",
            "default": false
          }
        }
      },
      "MessageInput": {
        "type": "object",
        "required": [
          "role",
          "content"
        ],
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "assistant"
            ]
          },
          "content": {
            "type": "string"
          }
        }
      },
      "ClaudeResponse": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Response unique identifier"
          },
          "model": {
            "type": "string",
            "description": "Actual model name used",
            "example": "claude-opus-4-6"
          },
          "type": {
            "type": "string",
            "enum": [
              "message"
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "assistant"
            ]
          },
          "content": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "type": {
                  "type": "string",
                  "enum": [
                    "text"
                  ]
                },
                "text": {
                  "type": "string"
                }
              }
            }
          },
          "usage": {
            "type": "object",
            "properties": {
              "input_tokens": {
                "type": "integer"
              },
              "output_tokens": {
                "type": "integer"
              }
            }
          }
        },
        "example": {
          "id": "msg_01XFDUDYJgAACyzWYzeHhsX7",
          "model": "gpt-5.4",
          "type": "message",
          "role": "assistant",
          "content": [
            {
              "type": "text",
              "text": "인공지능의 발전 역사는 1950년대로 거슬러 올라갑니다..."
            }
          ],
          "usage": {
            "input_tokens": 15,
            "output_tokens": 156
          }
        }
      }
    },
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "##All APIs require Bearer Token authentication##\n\n**Get API Key:**\n\nVisit [API Key Management](https://evolink.ai/dashboard/keys) to get your API Key\n\n**Add to request header:**\n```\nAuthorization: Bearer YOUR_API_KEY\n```",
        "bearerFormat": "sk-evo-xxxxxxxxxx"
      }
    }
  }
}
```

---

# 3. Claude Code CLI 연동 가이드

## 출처 URL
- 영문 문서: https://docs.evolink.ai/en/integration-guide/claude-code-cli

## 개요

Claude Code CLI는 Anthropic의 공식 커맨드라인 도구로, 터미널에서 Claude 모델과 상호작용할 수 있게 해줍니다.
EvoLink API와 연동하면 EvoLink 인프라를 통해 Claude 기능에 직접 접근할 수 있습니다.

## 사전 요구사항

EvoLink Dashboard에 로그인하여 API Key를 발급받으세요.
- 대시보드: https://evolink.ai/dashboard/keys
- API Key는 `sk-`로 시작합니다.

## 설치

### macOS / Linux
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

### Windows
Node.js v20+ 먼저 설치 후:
```bash
npm install -g @anthropic-ai/claude-code
```

### 설치 확인
```bash
claude --version
```

## 설정 방법

### 방법 1: settings.json (권장)

`~/.claude/settings.json` 파일을 편집합니다:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-evolink-api-key",
    "ANTHROPIC_BASE_URL": "https://direct.evolink.ai",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "permissions": {
    "allow": [],
    "deny": []
  }
}
```

파일 위치:
- Windows: `C:\Users\{username}\.claude\settings.json`
- macOS/Linux: `~/.claude/settings.json`

### 방법 2: 임시 환경 변수 (현재 터미널 세션만 유효)

**macOS / Linux:**
```bash
export ANTHROPIC_BASE_URL="https://direct.evolink.ai"
export ANTHROPIC_AUTH_TOKEN="your-evolink-api-key"
```

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_BASE_URL="https://direct.evolink.ai"
$env:ANTHROPIC_AUTH_TOKEN="your-evolink-api-key"
```

**Windows CMD:**
```cmd
set ANTHROPIC_BASE_URL=https://direct.evolink.ai
set ANTHROPIC_AUTH_TOKEN=your-evolink-api-key
```

### 방법 3: 영구 글로벌 환경 변수

**Windows PowerShell:**
```powershell
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'https://direct.evolink.ai', 'User')
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', 'your-evolink-api-key', 'User')
```

**macOS (zsh):**
```bash
echo 'export ANTHROPIC_BASE_URL="https://direct.evolink.ai"' >> ~/.zshrc
echo 'export ANTHROPIC_AUTH_TOKEN="your-evolink-api-key"' >> ~/.zshrc
source ~/.zshrc
```

**macOS (bash):**
```bash
echo 'export ANTHROPIC_BASE_URL="https://direct.evolink.ai"' >> ~/.bash_profile
echo 'export ANTHROPIC_AUTH_TOKEN="your-evolink-api-key"' >> ~/.bash_profile
source ~/.bash_profile
```

**Linux (bash):**
```bash
echo 'export ANTHROPIC_BASE_URL="https://direct.evolink.ai"' >> ~/.bashrc
echo 'export ANTHROPIC_AUTH_TOKEN="your-evolink-api-key"' >> ~/.bashrc
source ~/.bashrc
```

**Linux (zsh):**
```bash
echo 'export ANTHROPIC_BASE_URL="https://direct.evolink.ai"' >> ~/.zshrc
echo 'export ANTHROPIC_AUTH_TOKEN="your-evolink-api-key"' >> ~/.zshrc
source ~/.zshrc
```

## 환경 변수 요약

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `ANTHROPIC_AUTH_TOKEN` | `sk-...` (EvoLink API Key) | EvoLink 인증 토큰 |
| `ANTHROPIC_BASE_URL` | `https://direct.evolink.ai` | EvoLink API 베이스 URL |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `1` | 불필요한 트래픽 비활성화 |

## 사용법

### 인터랙티브 모드 (연속 대화)
```bash
claude
```

### 단일 명령 모드
```bash
claude "질문 내용"
```

### 모델 전환
인터랙티브 모드에서 `/model` 입력

### 확인 테스트
```bash
claude --version
claude "Who are you"
```

## 지원 모델

| 모델 | 용도 |
|------|------|
| `claude-haiku-4-5-20251001` | 빠른 응답 |
| `claude-sonnet-4-5-20250929` | 균형 |
| `claude-sonnet-4-20250514` | 표준 |
| `claude-opus-4-1-20250805` | 고급 |
| `claude-opus-4-5-20251101` | 고급 |
| `claude-sonnet-4-6` | 최신 |
| `claude-opus-4-6` | 최신 |

## 문제 해결

### 401 에러 (인증 실패)
- `ANTHROPIC_AUTH_TOKEN`이 누락되었거나 유효하지 않음
- API Key 확인

### 403 에러 (권한 부족)
- 권한 부족 또는 만료된 키
- `ANTHROPIC_BASE_URL`이 `https://direct.evolink.ai`인지 확인

### 설정 변경이 적용되지 않는 경우
- 터미널 재시작
- `settings.json` JSON 문법 확인
- 올바른 파일 경로 확인

### 출력이 없는 경우
- 네트워크 연결 문제
- 유효하지 않거나 잔액 부족한 API Key
- 잘못된 `ANTHROPIC_BASE_URL`
- 방화벽/프록시 차단

### Node.js 확인 (Windows)
```bash
node -v
npm -v
```

## FAQ (자주 묻는 질문)

**Q1. Claude Code CLI란 무엇인가요?**
Claude Code CLI는 Anthropic의 공식 커맨드라인 도구로, 터미널에서 Claude 모델과 상호작용할 수 있게 해줍니다. 코드 지원, 텍스트 생성, Q&A, 파일 분석 등에 사용됩니다.

**Q2. 설치 및 설정을 어떻게 확인하나요?**
순서대로 실행하세요: `claude --version` (설치 확인), `claude "Who are you"` (API 설정 확인).

**Q3. 인터랙티브 모드와 단일 명령 모드의 차이는?**
인터랙티브 모드(`claude`)는 복잡한 작업을 위한 연속 다중 턴 대화를 지원합니다. 단일 명령 모드(`claude "질문"`)는 하나의 응답을 전달하고 종료하며, 빠른 질문에 적합합니다.

**Q4. Claude Code CLI가 내 파일에 접근하나요?**
Claude Code CLI는 명시적으로 참조하거나 승인한 경우에만 파일 내용을 읽으며, 민감한 작업을 수행하기 전에 확인을 요청합니다.

**Q5. 로컬 파일을 어떻게 분석하나요?**
인터랙티브 모드에서 파일 경로 입력, 터미널 드래그앤드롭, 또는 내용 붙여넣기로 Claude가 읽을 수 있습니다.

**Q6. 중국어/한국어를 지원하나요?**
중국어 및 한국어 입출력을 완전히 지원합니다.

**Q7. 출력이 나오지 않는 이유는?**
네트워크 연결 문제, 유효하지 않거나 잔액 부족한 API Key, 잘못된 ANTHROPIC_BASE_URL, 방화벽/프록시 차단이 원인일 수 있습니다.

**Q8. 설정 변경이 적용되지 않아요**
터미널을 재시작하고, settings.json의 JSON 문법을 확인하고, 올바른 파일 경로를 확인하세요.

**Q9. 401/403 에러가 발생해요**
401: ANTHROPIC_AUTH_TOKEN이 누락되었거나 유효하지 않습니다. 403: 권한 부족 또는 만료된 키입니다. ANTHROPIC_BASE_URL이 `https://direct.evolink.ai`인지 확인하세요.

**Q10. 어떤 작업에 적합한가요?**
적합: 코드 작성, 디버깅, 리팩토링, 커맨드라인 Q&A, 파일 분석, 자동화 통합.
부적합: 그래픽 인터페이스, 실시간 협업, 대규모 배치 처리.

**Q11. 모델을 어떻게 변경하나요?**
인터랙티브 모드에서 `/model`을 입력하세요.

**Q12. 이미지를 어떻게 업로드하나요?**
이미지 경로를 참조하거나, 터미널로 드래그앤드롭하거나, 직접 붙여넣기하세요. 모두 사용자의 명시적 행동이 필요합니다.

**Q13. 커맨드라인 터미널에 어떻게 접근하나요?**
- Windows: `Win + R` → `cmd` 또는 `powershell` 입력, 또는 시작 메뉴에서 검색
- macOS: `Command + Space` → "Terminal" 검색
- Linux: `Ctrl + Alt + T` 단축키

---

# 부록: 참고 URL 목록

| 구분 | URL |
|------|-----|
| Evolink 메인 | https://evolink.ai |
| API Key 관리 | https://evolink.ai/dashboard/keys |
| 과금 대시보드 | https://evolink.ai/dashboard/billing |
| 문서 메인 | https://docs.evolink.ai |
| Claude Messages API (영문) | https://docs.evolink.ai/en/api-manual/language-series/claude/claude-messages-api |
| Claude Messages API (한국어 JSON) | https://docs.evolink.ai/ko/api-manual/language-series/claude/claude-messages-api.json |
| EvoLink Auto Claude (영문) | https://docs.evolink.ai/en/api-manual/language-series/evolink-auto/evolink-auto-claude |
| EvoLink Auto Claude (한국어 JSON) | https://docs.evolink.ai/ko/api-manual/language-series/evolink-auto/evolink-auto-claude.json |
| Claude Code CLI 가이드 (영문) | https://docs.evolink.ai/en/integration-guide/claude-code-cli |
| Messages API Base URL | https://api.evolink.ai |
| Auto/CLI Base URL | https://direct.evolink.ai |

# EvoLink Gemini 3.1 Pro & Flash Lite 완전 기술 문서

> **출처**: https://docs.evolink.ai (2026-03-14 수집)
> **원칙**: 원문 무삭제, 무축약, 무요약 — OpenAPI JSON Spec 원본 그대로 수록
> **이 문서는 앱의 모든 Evolink Gemini 관련 작업에서 절대적으로 참조해야 하는 최우선 기술 문서입니다.**

---

## 목차

- [Part 1: Gemini 3.1 Pro — OpenAI SDK Format](#part-1-gemini-31-pro--openai-sdk-format)
  - [1.1 빠른 시작 (Quick Start)](#11-빠른-시작)
  - [1.2 전체 레퍼런스 (Full Reference)](#12-전체-레퍼런스)
- [Part 2: Gemini 3.1 Pro — Google Native API Format](#part-2-gemini-31-pro--google-native-api-format)
  - [2.1 빠른 시작 (Quick Start)](#21-빠른-시작)
  - [2.2 전체 레퍼런스 (Full Reference)](#22-전체-레퍼런스)
- [Part 3: Gemini 3.1 Flash Lite — OpenAI SDK Format](#part-3-gemini-31-flash-lite--openai-sdk-format)
  - [3.1 빠른 시작 (Quick Start)](#31-빠른-시작)
  - [3.2 전체 레퍼런스 (Full Reference)](#32-전체-레퍼런스)
- [Part 4: Gemini 3.1 Flash Lite — Google Native API Format](#part-4-gemini-31-flash-lite--google-native-api-format)
  - [4.1 빠른 시작 (Quick Start)](#41-빠른-시작)
  - [4.2 전체 레퍼런스 (Full Reference)](#42-전체-레퍼런스)

---

# Part 1: Gemini 3.1 Pro — OpenAI SDK Format

## 1.1 빠른 시작

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/openai-sdk/openai-sdk-quickstart
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/openai-sdk/openai-sdk-quickstart.json

### OpenAPI 3.1.0 Spec (원본)

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Gemini-3.1-pro 빠른 시작",
    "description": "5분 만에 Gemini-3.1-pro 채팅 API를 시작하여 첫 번째 AI 대화를 경험하세요",
    "license": {
      "name": "MIT"
    },
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://api.evolink.ai",
      "description": "프로덕션 환경"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/v1/chat/completions": {
      "post": {
        "summary": "Gemini-3.1-pro 빠른 채팅",
        "description": "- OpenAI SDK 형식을 사용하여 Gemini-3.1-pro 모델 호출\n- 동기 처리 모드, 대화 내용을 실시간으로 반환\n- 최소 매개변수로 빠른 시작\n- 💡 더 많은 기능이 필요하신가요? [전체 API 레퍼런스](./openai-sdk-reference)를 확인하세요",
        "operationId": "createChatCompletionQuick",
        "tags": ["채팅 완성"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ChatCompletionQuickRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "채팅 완성이 성공적으로 생성되었습니다",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ChatCompletionResponse"
                }
              }
            }
          },
          "400": {
            "description": "잘못된 요청 매개변수",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 400, "message": "잘못된 요청 매개변수", "type": "invalid_request_error" } }
              }
            }
          },
          "401": {
            "description": "인증되지 않음, 유효하지 않거나 만료된 토큰",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 401, "message": "Invalid or expired token", "type": "authentication_error" } }
              }
            }
          },
          "402": {
            "description": "할당량 부족, 충전 필요",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 402, "message": "할당량 부족", "type": "insufficient_quota_error", "fallback_suggestion": "https://evolink.ai/dashboard/billing" } }
              }
            }
          },
          "403": {
            "description": "접근 거부",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 403, "message": "Access denied for this model", "type": "permission_error", "param": "model" } }
              }
            }
          },
          "404": {
            "description": "리소스를 찾을 수 없음",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 404, "message": "Specified model not found", "type": "not_found_error", "param": "model", "fallback_suggestion": "gemini-3.1-pro-preview" } }
              }
            }
          },
          "429": {
            "description": "요청 속도 제한 초과",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 429, "message": "Rate limit exceeded", "type": "rate_limit_error", "fallback_suggestion": "retry after 60 seconds" } }
              }
            }
          },
          "500": {
            "description": "내부 서버 오류",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 500, "message": "내부 서버 오류", "type": "internal_server_error", "fallback_suggestion": "try again later" } }
              }
            }
          },
          "502": {
            "description": "업스트림 서비스 오류",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 502, "message": "Upstream AI service unavailable", "type": "upstream_error", "fallback_suggestion": "try different model" } }
              }
            }
          },
          "503": {
            "description": "서비스 일시적으로 사용 불가",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ErrorResponse" },
                "example": { "error": { "code": 503, "message": "서비스 일시적으로 사용 불가", "type": "service_unavailable_error", "fallback_suggestion": "retry after 30 seconds" } }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "ChatCompletionQuickRequest": {
        "type": "object",
        "required": ["model", "messages"],
        "properties": {
          "model": {
            "type": "string",
            "description": "채팅 모델 이름",
            "enum": ["gemini-3.1-pro-preview"],
            "default": "gemini-3.1-pro-preview",
            "example": "gemini-3.1-pro-preview"
          },
          "messages": {
            "type": "array",
            "description": "채팅 메시지 목록",
            "items": { "$ref": "#/components/schemas/MessageSimple" },
            "minItems": 1,
            "example": [{ "role": "user", "content": "Hello, introduce yourself" }]
          }
        }
      },
      "MessageSimple": {
        "type": "object",
        "required": ["role", "content"],
        "properties": {
          "role": { "type": "string", "description": "메시지 역할", "enum": ["user"] },
          "content": { "type": "string", "description": "메시지 내용 (일반 텍스트)" }
        }
      },
      "ChatCompletionResponse": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "채팅 완성의 고유 식별자", "example": "chatcmpl-20251010015944503180122WJNB8Eid" },
          "model": { "type": "string", "description": "실제 사용된 모델 이름", "example": "gemini-3.1-pro-preview" },
          "object": { "type": "string", "enum": ["chat.completion"], "description": "응답 유형", "example": "chat.completion" },
          "created": { "type": "integer", "description": "생성 타임스탬프", "example": 1760032810 },
          "choices": { "type": "array", "description": "채팅 완성 선택지 목록", "items": { "$ref": "#/components/schemas/Choice" } },
          "usage": { "$ref": "#/components/schemas/Usage" }
        }
      },
      "Choice": {
        "type": "object",
        "properties": {
          "index": { "type": "integer", "description": "선택 인덱스", "example": 0 },
          "message": { "$ref": "#/components/schemas/AssistantMessage" },
          "finish_reason": { "type": "string", "description": "종료 이유", "enum": ["stop", "length", "content_filter"], "example": "stop" }
        }
      },
      "AssistantMessage": {
        "type": "object",
        "properties": {
          "role": { "type": "string", "description": "메시지 발신자 역할", "enum": ["assistant"], "example": "assistant" },
          "content": { "type": "string", "description": "AI 응답 메시지 내용" }
        }
      },
      "Usage": {
        "type": "object",
        "description": "토큰 사용 통계",
        "properties": {
          "prompt_tokens": { "type": "integer", "description": "입력 콘텐츠의 토큰 수", "example": 13 },
          "completion_tokens": { "type": "integer", "description": "출력 콘텐츠의 토큰 수", "example": 1891 },
          "total_tokens": { "type": "integer", "description": "총 토큰 수", "example": 1904 },
          "prompt_tokens_details": {
            "type": "object",
            "description": "상세 입력 토큰 정보",
            "properties": {
              "cached_tokens": { "type": "integer", "description": "캐시 적중 토큰 수", "example": 0 },
              "text_tokens": { "type": "integer", "description": "텍스트 토큰 수", "example": 13 },
              "audio_tokens": { "type": "integer", "description": "오디오 토큰 수", "example": 0 },
              "image_tokens": { "type": "integer", "description": "이미지 토큰 수", "example": 0 }
            }
          },
          "completion_tokens_details": {
            "type": "object",
            "description": "상세 출력 토큰 정보",
            "properties": {
              "text_tokens": { "type": "integer", "description": "텍스트 토큰 수", "example": 0 },
              "audio_tokens": { "type": "integer", "description": "오디오 토큰 수", "example": 0 },
              "reasoning_tokens": { "type": "integer", "description": "추론 토큰 수", "example": 1480 }
            }
          },
          "input_tokens": { "type": "integer", "description": "입력 토큰 수 (호환성 필드)", "example": 0 },
          "output_tokens": { "type": "integer", "description": "출력 토큰 수 (호환성 필드)", "example": 0 },
          "input_tokens_details": { "type": "object", "nullable": true, "description": "상세 입력 토큰 정보 (호환성 필드)", "example": null }
        }
      },
      "ErrorResponse": {
        "type": "object",
        "properties": {
          "error": {
            "type": "object",
            "properties": {
              "code": { "type": "integer", "description": "HTTP 상태 오류 코드" },
              "message": { "type": "string", "description": "오류 설명" },
              "type": { "type": "string", "description": "오류 유형" },
              "param": { "type": "string", "description": "관련 매개변수 이름" },
              "fallback_suggestion": { "type": "string", "description": "오류 발생 시 제안" }
            }
          }
        }
      }
    },
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "모든 API는 Bearer Token 인증이 필요합니다\n\nAPI Key 받기: https://evolink.ai/dashboard/keys\n\n요청 헤더에 추가:\nAuthorization: Bearer YOUR_API_KEY"
      }
    }
  },
  "tags": [{ "name": "채팅 완성", "description": "AI 채팅 완성 관련 API" }]
}
```

---

## 1.2 전체 레퍼런스

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/openai-sdk/openai-sdk-reference
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/openai-sdk/openai-sdk-reference.json

### 주요 기능
- OpenAI SDK 형식을 사용하여 Gemini-3.1-pro 모델 호출
- 동기 처리 모드, 대화 내용을 실시간으로 반환
- **일반 텍스트 대화**: 단일 턴 또는 다중 턴 컨텍스트 대화
- **시스템 프롬프트**: AI 역할 및 동작 사용자 정의
- **멀티모달 입력**: 텍스트 + 이미지 혼합 입력 지원

### OpenAPI 3.1.0 Spec (원본)

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "Gemini-3.1-pro 전체 레퍼런스",
    "description": "Gemini-3.1-pro 채팅 인터페이스의 전체 API 레퍼런스, 모든 매개변수 및 고급 기능 포함",
    "license": { "name": "MIT" },
    "version": "1.0.0"
  },
  "servers": [{ "url": "https://api.evolink.ai", "description": "프로덕션 환경" }],
  "security": [{ "bearerAuth": [] }],
  "paths": {
    "/v1/chat/completions": {
      "post": {
        "summary": "Gemini-3.1-pro Chat API",
        "description": "- OpenAI SDK 형식을 사용하여 Gemini-3.1-pro 모델 호출\n- 동기 처리 모드, 대화 내용을 실시간으로 반환\n- **일반 텍스트 대화**: 단일 턴 또는 다중 턴 컨텍스트 대화, 코드 샘플의 simple_text 및 multi_turn 예제 참조\n- **시스템 프롬프트**: AI 역할 및 동작 사용자 정의, 코드 샘플의 system_prompt 예제 참조\n- **멀티모달 입력**: 텍스트 + 이미지 혼합 입력 지원, 코드 샘플의 vision 및 multi_image 예제 참조",
        "operationId": "createChatCompletion",
        "tags": ["채팅 완성"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/ChatCompletionRequest" },
              "examples": {
                "simple_text": {
                  "summary": "단일 턴 텍스트 대화",
                  "value": {
                    "model": "gemini-3.1-pro-preview",
                    "messages": [{ "role": "user", "content": "Please introduce yourself" }]
                  }
                },
                "multi_turn": {
                  "summary": "다중 턴 대화 (컨텍스트 이해)",
                  "value": {
                    "model": "gemini-3.1-pro-preview",
                    "messages": [
                      { "role": "user", "content": "What is Python?" },
                      { "role": "assistant", "content": "Python is a high-level programming language..." },
                      { "role": "user", "content": "What are its advantages?" }
                    ]
                  }
                },
                "system_prompt": {
                  "summary": "시스템 프롬프트 사용",
                  "value": {
                    "model": "gemini-3.1-pro-preview",
                    "messages": [
                      { "role": "system", "content": "You are a professional Python programming assistant, answering questions concisely." },
                      { "role": "user", "content": "How to read a file?" }
                    ]
                  }
                },
                "vision": {
                  "summary": "멀티모달 입력 (텍스트 + 이미지)",
                  "value": {
                    "model": "gemini-3.1-pro-preview",
                    "messages": [{ "role": "user", "content": [
                      { "type": "text", "text": "Please describe the scene and main elements in this image in detail." },
                      { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
                    ]}]
                  }
                },
                "multi_image": {
                  "summary": "다중 이미지 입력",
                  "value": {
                    "model": "gemini-3.1-pro-preview",
                    "messages": [{ "role": "user", "content": [
                      { "type": "text", "text": "Compare the differences between these two images" },
                      { "type": "image_url", "image_url": { "url": "https://example.com/image1.png" } },
                      { "type": "image_url", "image_url": { "url": "https://example.com/image2.png" } }
                    ]}]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "채팅 완성이 성공적으로 생성되었습니다", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ChatCompletionResponse" } } } },
          "400": { "description": "잘못된 요청 매개변수", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 400, "message": "잘못된 요청 매개변수", "type": "invalid_request_error" } } } } },
          "401": { "description": "인증되지 않음, 유효하지 않거나 만료된 토큰", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 401, "message": "Invalid or expired token", "type": "authentication_error" } } } } },
          "402": { "description": "할당량 부족, 충전 필요", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 402, "message": "할당량 부족", "type": "insufficient_quota_error", "fallback_suggestion": "https://evolink.ai/dashboard/billing" } } } } },
          "403": { "description": "접근 거부", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 403, "message": "Access denied for this model", "type": "permission_error", "param": "model" } } } } },
          "404": { "description": "리소스를 찾을 수 없음", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 404, "message": "Specified model not found", "type": "not_found_error", "param": "model", "fallback_suggestion": "gemini-3.1-pro-preview" } } } } },
          "413": { "description": "요청 본문이 너무 큼", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 413, "message": "Image file too large", "type": "request_too_large_error", "param": "content", "fallback_suggestion": "compress image to under 10MB" } } } } },
          "429": { "description": "요청 속도 제한 초과", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 429, "message": "Rate limit exceeded", "type": "rate_limit_error", "fallback_suggestion": "retry after 60 seconds" } } } } },
          "500": { "description": "내부 서버 오류", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 500, "message": "내부 서버 오류", "type": "internal_server_error", "fallback_suggestion": "try again later" } } } } },
          "502": { "description": "업스트림 서비스 오류", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 502, "message": "Upstream AI service unavailable", "type": "upstream_error", "fallback_suggestion": "try different model" } } } } },
          "503": { "description": "서비스 일시적으로 사용 불가", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" }, "example": { "error": { "code": 503, "message": "서비스 일시적으로 사용 불가", "type": "service_unavailable_error", "fallback_suggestion": "retry after 30 seconds" } } } } }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "ChatCompletionRequest": {
        "type": "object",
        "required": ["model", "messages"],
        "properties": {
          "model": { "type": "string", "description": "채팅 모델 이름", "enum": ["gemini-3.1-pro-preview"], "default": "gemini-3.1-pro-preview", "example": "gemini-3.1-pro-preview" },
          "messages": { "type": "array", "description": "채팅 메시지 목록, 다중 턴 대화 및 멀티모달 입력 지원", "items": { "$ref": "#/components/schemas/Message" }, "minItems": 1 },
          "stream": { "type": "boolean", "description": "스트리밍 모드로 응답을 반환할지 여부\n\n- true: 스트리밍 반환, 실시간 청크로 내용 수신\n- false: 완전한 응답을 한 번에 반환", "example": false },
          "max_tokens": { "type": "integer", "description": "생성할 최대 토큰 수", "minimum": 1, "example": 2000 },
          "temperature": { "type": "number", "description": "샘플링 온도, 출력의 무작위성을 제어합니다\n\n- 낮은 값 (예: 0.2): 더 결정적이고 집중된 출력\n- 높은 값 (예: 1.5): 더 무작위적이고 창의적인 출력", "minimum": 0, "maximum": 2, "example": 0.7 },
          "top_p": { "type": "number", "description": "Nucleus Sampling 매개변수\n\n- 누적 확률을 기반으로 토큰에서 샘플링을 제어합니다\n- 예를 들어, 0.9는 누적 확률 상위 90%까지의 토큰에서 선택\n- 기본값: 1.0 (모든 토큰 고려)\n\n권장 사항: temperature와 top_p를 동시에 조정하지 마세요", "minimum": 0, "maximum": 1, "example": 0.9 },
          "top_k": { "type": "integer", "description": "Top-K 샘플링 매개변수\n\n- 가장 확률이 높은 상위 K개 토큰만 고려\n- 작은 값일수록 출력이 더 집중됩니다\n- 기본값: 제한 없음", "minimum": 1, "example": 40 }
        }
      },
      "Message": {
        "type": "object",
        "required": ["role", "content"],
        "properties": {
          "role": { "type": "string", "description": "메시지 역할\n\n- user: 사용자 메시지\n- assistant: AI 어시스턴트 메시지 (다중 턴 대화용)\n- system: 시스템 프롬프트 (AI의 역할 및 동작 설정)", "enum": ["user", "assistant", "system"], "example": "user" },
          "content": { "type": "array", "description": "메시지 내용. 두 가지 형식 지원:\n\n1. 일반 텍스트 문자열: 직접 전달 가능\n2. 객체 배열 (텍스트 입력, 멀티모달 입력 지원)", "items": { "$ref": "#/components/schemas/ContentPart" } }
        }
      },
      "ContentPart": { "oneOf": [{ "$ref": "#/components/schemas/TextContent" }, { "$ref": "#/components/schemas/ImageContent" }] },
      "TextContent": { "title": "텍스트 콘텐츠", "type": "object", "required": ["type", "text"], "properties": { "type": { "type": "string", "enum": ["text"], "description": "콘텐츠 유형" }, "text": { "type": "string", "description": "텍스트 내용" } } },
      "ImageContent": {
        "title": "이미지 콘텐츠",
        "type": "object",
        "required": ["type", "image_url"],
        "properties": {
          "type": { "type": "string", "enum": ["image_url"], "description": "콘텐츠 유형" },
          "image_url": {
            "type": "object",
            "required": ["url"],
            "properties": {
              "url": { "type": "string", "format": "uri", "description": "이미지 URL 주소\n\n제한 사항:\n- 이미지당 최대 크기: 10MB\n- 지원 형식: .jpeg, .jpg, .png, .webp\n- URL 요구 사항: 공개적으로 접근 가능해야 함" }
            }
          }
        }
      },
      "ChatCompletionResponse": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "채팅 완성의 고유 식별자", "example": "chatcmpl-20251010015944503180122WJNB8Eid" },
          "model": { "type": "string", "description": "실제 사용된 모델 이름", "example": "gemini-3.1-pro-preview" },
          "object": { "type": "string", "enum": ["chat.completion"], "example": "chat.completion" },
          "created": { "type": "integer", "description": "생성 타임스탬프", "example": 1760032810 },
          "choices": { "type": "array", "items": { "$ref": "#/components/schemas/Choice" } },
          "usage": { "$ref": "#/components/schemas/Usage" }
        }
      },
      "Choice": {
        "type": "object",
        "properties": {
          "index": { "type": "integer", "example": 0 },
          "message": { "$ref": "#/components/schemas/AssistantMessage" },
          "finish_reason": { "type": "string", "enum": ["stop", "length", "content_filter"], "example": "stop" }
        }
      },
      "AssistantMessage": { "type": "object", "properties": { "role": { "type": "string", "enum": ["assistant"] }, "content": { "type": "string", "description": "AI 응답 메시지 내용" } } },
      "Usage": {
        "type": "object",
        "description": "토큰 사용 통계",
        "properties": {
          "prompt_tokens": { "type": "integer", "example": 13 },
          "completion_tokens": { "type": "integer", "example": 1891 },
          "total_tokens": { "type": "integer", "example": 1904 },
          "prompt_tokens_details": { "type": "object", "properties": { "cached_tokens": { "type": "integer", "example": 0 }, "text_tokens": { "type": "integer", "example": 13 }, "audio_tokens": { "type": "integer", "example": 0 }, "image_tokens": { "type": "integer", "example": 0 } } },
          "completion_tokens_details": { "type": "object", "properties": { "text_tokens": { "type": "integer", "example": 0 }, "audio_tokens": { "type": "integer", "example": 0 }, "reasoning_tokens": { "type": "integer", "example": 1480 } } },
          "input_tokens": { "type": "integer", "example": 0 },
          "output_tokens": { "type": "integer", "example": 0 },
          "input_tokens_details": { "type": "object", "nullable": true, "example": null }
        }
      },
      "ErrorResponse": { "type": "object", "properties": { "error": { "type": "object", "properties": { "code": { "type": "integer" }, "message": { "type": "string" }, "type": { "type": "string" }, "param": { "type": "string" }, "fallback_suggestion": { "type": "string" } } } } }
    },
    "securitySchemes": {
      "bearerAuth": { "type": "http", "scheme": "bearer", "description": "모든 API는 Bearer Token 인증이 필요합니다\n\nAPI Key 받기: https://evolink.ai/dashboard/keys\n\n요청 헤더에 추가: Authorization: Bearer YOUR_API_KEY" }
    }
  },
  "tags": [{ "name": "채팅 완성", "description": "AI 채팅 완성 관련 API" }]
}
```

---

# Part 2: Gemini 3.1 Pro — Google Native API Format

## 2.1 빠른 시작

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/native-api/native-api-quickstart
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/native-api/native-api-quickstart.json

### 주요 기능
- Google Native API 형식을 사용하여 Gemini-3.1-pro 모델 호출
- 동기 처리 모드, 실시간 응답
- 최소 매개변수로 빠른 시작
- **스트리밍**: URL의 `generateContent`를 `streamGenerateContent`로 변경

### 엔드포인트
- **POST** `/v1beta/models/gemini-3.1-pro-preview:generateContent`
- **스트리밍**: `/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent`

### 요청 예시

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Hello, please introduce yourself" }]
    }
  ]
}
```

### 응답 스키마

```json
{
  "candidates": [
    {
      "content": { "role": "model", "parts": [{ "text": "응답 텍스트..." }] },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": []
    }
  ],
  "promptFeedback": { "safetyRatings": [] },
  "usageMetadata": {
    "promptTokenCount": 4,
    "candidatesTokenCount": 611,
    "totalTokenCount": 2422,
    "thoughtsTokenCount": 1807
  }
}
```

---

## 2.2 전체 레퍼런스

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/native-api/native-api-reference
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-pro/native-api/native-api-reference.json

### 주요 기능
- Google Native API 형식을 사용하여 Gemini-3-pro-preview 모델 호출
- 동기 처리 모드 사용 가능, 대화 내용을 실시간으로 반환
- **일반 텍스트 대화**: 단일 턴 또는 다중 턴 컨텍스트 대화
- **멀티모달 입력**: 텍스트 + 이미지/오디오/비디오 혼합 입력 지원
- **매개변수 튜닝**: generationConfig를 통해 생성 품질 제어
- **스트리밍**: URL의 `generateContent`를 `streamGenerateContent`로 변경

### 엔드포인트
- **POST** `/v1beta/models/gemini-3.1-pro-preview:generateContent`
- **스트리밍**: `/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent`

### 요청 스키마 (GenerateContentRequest)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `contents` | array | O | 대화 내용 목록, 다중 턴 대화 및 멀티모달 입력 지원 (최소 1개) |
| `generationConfig` | object | X | 생성 설정 파라미터 |

### Content 구조

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `role` | string | O | `user` 또는 `model` |
| `parts` | array | O | 텍스트 및 파일 데이터 지원 (최소 1개) |

### Part 유형

**TextPart:**
```json
{ "text": "텍스트 내용" }
```

**FilePart (멀티모달 입력):**
```json
{
  "fileData": {
    "mimeType": "audio/mp3",
    "fileUri": "https://example.com/audio.mp3"
  }
}
```

### 지원 파일 유형 (FilePart)

| 유형 | MIME | 최대 크기 | 비고 |
|------|------|-----------|------|
| **이미지** | image/jpeg, image/png | 10 MB | |
| **오디오** | audio/mp3 | 10 MB | 권장 10분 이하 |
| **비디오** | video/mp4 | 50 MB | 권장 180초 이하 |
| **문서** | application/pdf | 20 MB | |

### GenerationConfig 파라미터

| 파라미터 | 타입 | 범위 | 설명 |
|----------|------|------|------|
| `temperature` | number | 0-2 | 샘플링 온도, 출력의 무작위성 제어 (기본: 0.7) |
| `maxOutputTokens` | integer | 1+ | 최대 출력 토큰 수 (기본: 2000) |
| `topP` | number | 0-1 | Nucleus Sampling (기본: 1.0) |
| `topK` | integer | 1+ | Top-K 샘플링 (기본: 제한 없음) |

### 요청 예시

**단일 턴 텍스트:**
```json
{ "contents": [{ "role": "user", "parts": [{ "text": "Please introduce yourself" }] }] }
```

**다중 턴 대화:**
```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "What is Python?" }] },
    { "role": "model", "parts": [{ "text": "Python is a high-level programming language..." }] },
    { "role": "user", "parts": [{ "text": "What are its advantages?" }] }
  ]
}
```

**오디오 분석:**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Please analyze this song audio and answer: 1. Song source and artist 2. Song mood 3. Complete lyrics output" },
      { "fileData": { "mimeType": "audio/mp3", "fileUri": "https://example.com/audio.mp3" } }
    ]
  }]
}
```

**이미지 이해:**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Please describe the scene and main elements in this image in detail" },
      { "fileData": { "mimeType": "image/jpeg", "fileUri": "https://example.com/image.jpg" } }
    ]
  }]
}
```

**다중 파일 입력 (혼합):**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Compare the relationship between these two images and this audio" },
      { "fileData": { "mimeType": "image/jpeg", "fileUri": "https://example.com/image1.jpg" } },
      { "fileData": { "mimeType": "image/png", "fileUri": "https://example.com/image2.png" } },
      { "fileData": { "mimeType": "audio/mp3", "fileUri": "https://example.com/audio.mp3" } }
    ]
  }]
}
```

### 동기 응답 (GenerateContentResponse)

```json
{
  "candidates": [{
    "content": { "role": "model", "parts": [{ "text": "응답 텍스트" }] },
    "finishReason": "STOP",
    "index": 0,
    "safetyRatings": []
  }],
  "promptFeedback": { "safetyRatings": [] },
  "usageMetadata": {
    "promptTokenCount": 4,
    "candidatesTokenCount": 611,
    "totalTokenCount": 2422,
    "thoughtsTokenCount": 1807,
    "promptTokensDetails": [{ "modality": "TEXT", "tokenCount": 4 }]
  }
}
```

### 스트리밍 응답 (StreamGenerateContentResponse)

**중간 청크:**
```json
{
  "candidates": [{ "content": { "role": "model", "parts": [{ "text": "부분 텍스트..." }] } }],
  "usageMetadata": { "trafficType": "ON_DEMAND" },
  "modelVersion": "gemini-3.1-pro-preview",
  "createTime": "2025-10-10T10:40:23.072315Z",
  "responseId": "xxx"
}
```

**마지막 청크:**
```json
{
  "candidates": [{ "content": { "role": "model", "parts": [{ "text": "최종 텍스트 조각" }] }, "finishReason": "STOP" }],
  "usageMetadata": { "promptTokenCount": 4, "candidatesTokenCount": 522, "totalTokenCount": 2191, "trafficType": "ON_DEMAND" },
  "modelVersion": "gemini-3.1-pro-preview",
  "createTime": "2025-10-10T10:40:23.072315Z",
  "responseId": "xxx"
}
```

### finishReason 값

| 값 | 설명 |
|---|---|
| `STOP` | 정상 종료 |
| `MAX_TOKENS` | 최대 토큰 수 도달 |
| `SAFETY` | 안전 필터에 의해 차단 |
| `RECITATION` | 인용/재현 감지 |
| `OTHER` | 기타 이유 |

---

# Part 3: Gemini 3.1 Flash Lite — OpenAI SDK Format

## 3.1 빠른 시작

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/openai-sdk/openai-sdk-quickstart
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/openai-sdk/openai-sdk-quickstart.json

### 엔드포인트
- **POST** `https://api.evolink.ai/v1/chat/completions`
- **모델명**: `gemini-3.1-flash-lite-preview`

### 요청 예시

```json
{
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [{ "role": "user", "content": "Hello, introduce yourself" }]
}
```

### 응답 예시

```json
{
  "id": "chatcmpl-20251010015944503180122WJNB8Eid",
  "model": "gemini-3.1-flash-lite-preview",
  "object": "chat.completion",
  "created": 1760032810,
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "AI 응답..." }, "finish_reason": "stop" }],
  "usage": {
    "prompt_tokens": 13,
    "completion_tokens": 1891,
    "total_tokens": 1904,
    "prompt_tokens_details": { "cached_tokens": 0, "text_tokens": 13, "audio_tokens": 0, "image_tokens": 0 },
    "completion_tokens_details": { "text_tokens": 0, "audio_tokens": 0, "reasoning_tokens": 1480 }
  }
}
```

---

## 3.2 전체 레퍼런스

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/openai-sdk/openai-sdk-reference
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/openai-sdk/openai-sdk-reference.json

### 주요 기능
- OpenAI SDK 형식을 사용하여 Gemini-3.1-flash-lite-preview 모델 호출
- 동기 처리 모드, 대화 내용을 실시간으로 반환
- **일반 텍스트 대화**: 단일 턴 또는 다중 턴 컨텍스트 대화
- **시스템 프롬프트**: AI 역할 및 동작 사용자 정의
- **멀티모달 입력**: 텍스트 + 이미지 혼합 입력 지원

### 엔드포인트
- **POST** `https://api.evolink.ai/v1/chat/completions`

### 요청 파라미터 (ChatCompletionRequest)

| 파라미터 | 타입 | 필수 | 범위 | 설명 |
|---------|------|------|------|------|
| `model` | string | O | - | `gemini-3.1-flash-lite-preview` |
| `messages` | array | O | - | 메시지 목록 (최소 1개) |
| `stream` | boolean | X | - | 스트리밍 반환 여부 (기본: false) |
| `max_tokens` | integer | X | 1+ | 최대 토큰 수 (기본: 2000) |
| `temperature` | number | X | 0-2 | 샘플링 온도 (기본: 0.7) |
| `top_p` | number | X | 0-1 | Nucleus Sampling (기본: 1.0) |
| `top_k` | integer | X | 1+ | Top-K 샘플링 |

### Message 구조

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `role` | string | O | `user`, `assistant`, `system` |
| `content` | string or array | O | 텍스트 문자열 또는 ContentPart 배열 |

### 요청 예시

**단일 턴:**
```json
{ "model": "gemini-3.1-flash-lite-preview", "messages": [{ "role": "user", "content": "Please introduce yourself" }] }
```

**다중 턴:**
```json
{
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [
    { "role": "user", "content": "What is Python?" },
    { "role": "assistant", "content": "Python is a high-level programming language..." },
    { "role": "user", "content": "What are its advantages?" }
  ]
}
```

**시스템 프롬프트:**
```json
{
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [
    { "role": "system", "content": "You are a professional Python programming assistant, answering questions concisely." },
    { "role": "user", "content": "How to read a file?" }
  ]
}
```

**멀티모달 (텍스트 + 이미지):**
```json
{
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [{ "role": "user", "content": [
    { "type": "text", "text": "Please describe the scene and main elements in this image in detail." },
    { "type": "image_url", "image_url": { "url": "https://example.com/image.png" } }
  ]}]
}
```

**다중 이미지:**
```json
{
  "model": "gemini-3.1-flash-lite-preview",
  "messages": [{ "role": "user", "content": [
    { "type": "text", "text": "Compare the differences between these two images" },
    { "type": "image_url", "image_url": { "url": "https://example.com/image1.png" } },
    { "type": "image_url", "image_url": { "url": "https://example.com/image2.png" } }
  ]}]
}
```

### 이미지 제한사항
- 최대 크기: 10MB/장
- 지원 형식: .jpeg, .jpg, .png, .webp
- URL: 공개적으로 접근 가능해야 함

---

# Part 4: Gemini 3.1 Flash Lite — Google Native API Format

## 4.1 빠른 시작

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/native-api/native-api-quickstart
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/native-api/native-api-quickstart.json

### 엔드포인트
- **POST** `https://api.evolink.ai/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`
- **스트리밍**: `https://api.evolink.ai/v1beta/models/gemini-3.1-flash-lite-preview:streamGenerateContent`

### 요청 예시

```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "Hello, please introduce yourself" }] }
  ]
}
```

---

## 4.2 전체 레퍼런스

### 문서 URL
- 페이지: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/native-api/native-api-reference
- OpenAPI JSON: https://docs.evolink.ai/ko/api-manual/language-series/gemini-3.1-flash-lite-preview/native-api/native-api-reference.json

### 주요 기능
- Google Native API 형식을 사용하여 Gemini-3.1-flash-lite-preview 모델 호출
- 동기 처리 모드 사용 가능, 대화 내용을 실시간으로 반환
- **일반 텍스트 대화**: 단일 턴 또는 다중 턴 컨텍스트 대화
- **멀티모달 입력**: 텍스트 + 이미지/오디오/비디오 혼합 입력 지원
- **매개변수 튜닝**: generationConfig를 통해 생성 품질 제어
- **스트리밍**: URL의 `generateContent`를 `streamGenerateContent`로 변경

### 엔드포인트
- **POST** `https://api.evolink.ai/v1beta/models/gemini-3.1-flash-lite-preview:generateContent`
- **스트리밍**: `https://api.evolink.ai/v1beta/models/gemini-3.1-flash-lite-preview:streamGenerateContent`

### 요청 스키마 (GenerateContentRequest)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `contents` | array | O | 대화 내용 목록 (최소 1개) |
| `generationConfig` | object | X | 생성 설정 파라미터 |

### GenerationConfig

| 파라미터 | 타입 | 범위 | 설명 |
|----------|------|------|------|
| `temperature` | number | 0-2 | 샘플링 온도 (기본: 0.7) |
| `maxOutputTokens` | integer | 1+ | 최대 출력 토큰 수 (기본: 2000) |
| `topP` | number | 0-1 | Nucleus Sampling (기본: 1.0) |
| `topK` | integer | 1+ | Top-K 샘플링 |

### 지원 파일 유형

| 유형 | MIME | 최대 크기 | 비고 |
|------|------|-----------|------|
| **이미지** | image/jpeg, image/png | 10 MB | |
| **오디오** | audio/mp3 | 10 MB | 권장 10분 이하 |
| **비디오** | video/mp4 | 50 MB | 권장 180초 이하 |
| **문서** | application/pdf | 20 MB | |

### 요청 예시

**단일 턴:**
```json
{ "contents": [{ "role": "user", "parts": [{ "text": "Please introduce yourself" }] }] }
```

**다중 턴:**
```json
{
  "contents": [
    { "role": "user", "parts": [{ "text": "What is Python?" }] },
    { "role": "model", "parts": [{ "text": "Python is a high-level programming language..." }] },
    { "role": "user", "parts": [{ "text": "What are its advantages?" }] }
  ]
}
```

**오디오 분석:**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Please analyze this song audio and answer: 1. Song source and artist 2. Song mood 3. Complete lyrics output" },
      { "fileData": { "mimeType": "audio/mp3", "fileUri": "https://example.com/audio.mp3" } }
    ]
  }]
}
```

**이미지 이해:**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Please describe the scene and main elements in this image in detail" },
      { "fileData": { "mimeType": "image/jpeg", "fileUri": "https://example.com/image.jpg" } }
    ]
  }]
}
```

**다중 파일 혼합:**
```json
{
  "contents": [{
    "role": "user",
    "parts": [
      { "text": "Compare the relationship between these two images and this audio" },
      { "fileData": { "mimeType": "image/jpeg", "fileUri": "https://example.com/image1.jpg" } },
      { "fileData": { "mimeType": "image/png", "fileUri": "https://example.com/image2.png" } },
      { "fileData": { "mimeType": "audio/mp3", "fileUri": "https://example.com/audio.mp3" } }
    ]
  }]
}
```

### 동기 응답

```json
{
  "candidates": [{
    "content": { "role": "model", "parts": [{ "text": "응답 텍스트" }] },
    "finishReason": "STOP",
    "index": 0,
    "safetyRatings": []
  }],
  "promptFeedback": { "safetyRatings": [] },
  "usageMetadata": {
    "promptTokenCount": 4,
    "candidatesTokenCount": 611,
    "totalTokenCount": 2422,
    "thoughtsTokenCount": 1807,
    "promptTokensDetails": [{ "modality": "TEXT", "tokenCount": 4 }]
  }
}
```

### 스트리밍 응답

**중간 청크:**
```json
{
  "candidates": [{ "content": { "role": "model", "parts": [{ "text": "부분 텍스트..." }] } }],
  "usageMetadata": { "trafficType": "ON_DEMAND" },
  "modelVersion": "gemini-3.1-flash-lite-preview",
  "createTime": "2025-10-10T10:40:23.072315Z",
  "responseId": "xxx"
}
```

**마지막 청크:**
```json
{
  "candidates": [{ "content": { "role": "model", "parts": [{ "text": "최종 텍스트 조각" }] }, "finishReason": "STOP" }],
  "usageMetadata": { "promptTokenCount": 4, "candidatesTokenCount": 522, "totalTokenCount": 2191, "trafficType": "ON_DEMAND" },
  "modelVersion": "gemini-3.1-flash-lite-preview",
  "createTime": "2025-10-10T10:40:23.072315Z",
  "responseId": "xxx"
}
```

---

# 공통: HTTP 에러 코드 (모든 엔드포인트 공통)

| 코드 | 설명 | 오류 유형 | 대응 |
|------|------|-----------|------|
| **200** | 성공 | - | - |
| **400** | 잘못된 요청 매개변수 | `invalid_request_error` | 요청 파라미터 확인 |
| **401** | 유효하지 않거나 만료된 토큰 | `authentication_error` | API 키 확인 |
| **402** | 할당량 부족 | `insufficient_quota_error` | 충전 필요 |
| **403** | 접근 거부 | `permission_error` | 모델 접근 권한 확인 |
| **404** | 모델을 찾을 수 없음 | `not_found_error` | 모델명 확인 |
| **413** | 요청 본문이 너무 큼 | `request_too_large_error` | 파일 크기 줄이기 |
| **429** | 요청 속도 제한 초과 | `rate_limit_error` | 60초 후 재시도 |
| **500** | 내부 서버 오류 | `internal_server_error` | 나중에 재시도 |
| **502** | 업스트림 서비스 오류 | `upstream_error` | 다른 모델 시도 |
| **503** | 서비스 일시적으로 사용 불가 | `service_unavailable_error` | 30초 후 재시도 |

---

# 공통: 인증

모든 API 요청은 Bearer Token 인증이 필요합니다.

```
Authorization: Bearer YOUR_API_KEY
```

API Key 발급: https://evolink.ai/dashboard/keys
빌링 관리: https://evolink.ai/dashboard/billing

---

# 빠른 참조: 모델명 & 엔드포인트 매핑

| 모델 | OpenAI SDK 엔드포인트 | Native API 엔드포인트 | 모델 ID |
|------|----------------------|----------------------|---------|
| **Gemini 3.1 Pro** | `POST /v1/chat/completions` | `POST /v1beta/models/gemini-3.1-pro-preview:generateContent` | `gemini-3.1-pro-preview` |
| **Gemini 3.1 Flash Lite** | `POST /v1/chat/completions` | `POST /v1beta/models/gemini-3.1-flash-lite-preview:generateContent` | `gemini-3.1-flash-lite-preview` |

| 모델 | Native 스트리밍 엔드포인트 |
|------|--------------------------|
| **Gemini 3.1 Pro** | `POST /v1beta/models/gemini-3.1-pro-preview:streamGenerateContent` |
| **Gemini 3.1 Flash Lite** | `POST /v1beta/models/gemini-3.1-flash-lite-preview:streamGenerateContent` |

### OpenAI SDK vs Native API 차이점

| 항목 | OpenAI SDK Format | Google Native API Format |
|------|-------------------|--------------------------|
| 기본 경로 | `/v1/chat/completions` | `/v1beta/models/{model}:generateContent` |
| 역할명 | `user`, `assistant`, `system` | `user`, `model` |
| 메시지 구조 | `messages[].content` (string 또는 array) | `contents[].parts[]` (TextPart 또는 FilePart) |
| 이미지 전달 | `image_url` 타입 | `fileData` 타입 |
| 스트리밍 | `stream: true` 파라미터 | URL 변경 (`streamGenerateContent`) |
| 멀티모달 | 이미지만 | 이미지 + 오디오 + 비디오 + PDF |
| 온도 파라미터 | `temperature` | `generationConfig.temperature` |
| 최대 토큰 | `max_tokens` | `generationConfig.maxOutputTokens` |
| Top-P | `top_p` | `generationConfig.topP` |
| Top-K | `top_k` | `generationConfig.topK` |
| 응답 토큰 | `usage.reasoning_tokens` | `usageMetadata.thoughtsTokenCount` |

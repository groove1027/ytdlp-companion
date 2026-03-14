# KIE Claude API 기술 문서 (원본 무삭제·무축약)
> 출처: docs.kie.ai — 2026-03-14 fetch
> 이 문서는 원문을 한 글자도 누락·생략·요약·축약·삭제하지 않고 그대로 수록한 것입니다.

## 목차

1. [Claude Sonnet 4.5 — OpenAI Chat Completions 호환](#1-claude-sonnet-45--openai-chat-completions-호환)
2. [Claude Opus 4.5 — OpenAI Chat Completions 호환](#2-claude-opus-45--openai-chat-completions-호환)
3. [Claude Haiku 4.5 — Native v1/messages](#3-claude-haiku-45--native-v1messages)
4. [Claude Opus 4.5 — Native v1/messages](#4-claude-opus-45--native-v1messages)
5. [Claude Opus 4.6 — Native v1/messages](#5-claude-opus-46--native-v1messages)
6. [Claude Sonnet 4.5 — Native v1/messages](#6-claude-sonnet-45--native-v1messages)
7. [Claude Sonnet 4.6 — Native v1/messages](#7-claude-sonnet-46--native-v1messages)
8. [Get Task Details — 공통 태스크 조회](#8-get-task-details--공통-태스크-조회)

---

## 지원 모델 요약

| 모델 | OpenAI 호환 엔드포인트 | Native v1/messages 모델명 |
|------|----------------------|--------------------------|
| Claude Haiku 4.5 | — | `claude-haiku-4-5-v1messages` |
| Claude Sonnet 4.5 | `POST /claude-opus-4-5/v1/chat/completions` | `claude-sonnet-4-5-v1messages` |
| Claude Sonnet 4.6 | — | `claude-sonnet-4-6-v1messages` |
| Claude Opus 4.5 | `POST /claude-opus-4-5/v1/chat/completions` | `claude-opus-4-5-v1messages` |
| Claude Opus 4.6 | — | `claude-opus-4-6-v1messages` |

- Base URL: `https://api.kie.ai`
- 인증: Bearer Token (`Authorization: Bearer YOUR_API_KEY`)
- Native v1/messages: `X-Api-Key` + `anthropic-version` 헤더 사용

---

## 1. Claude Sonnet 4.5 — OpenAI Chat Completions 호환

> 출처: https://docs.kie.ai/market/claude/claude-sonnet-4-5

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude-opus-4-5/v1/chat/completions:
    post:
      summary: Claude Sonnet 4.5
      deprecated: false
      description: >-
        ### Streaming Support

        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE) with `Content-Type: text/event-stream`. This
        allows for progressive response delivery, where message deltas are sent
        incrementally as they are generated. Each event contains partial message
        content, enabling real-time display of responses in your application.

        **Streaming Response Format:**
        - Content-Type: `text/event-stream`
        - Each event line starts with `data: ` followed by JSON
        - Events contain incremental message deltas
        - Final event indicates completion with `finish_reason`

        <CardGroup cols={2}>
          <Card title="Multimodal" icon="lucide-image">
            Supports text and image inputs
          </Card>
          <Card title="Real-time Search" icon="lucide-search">
            Google Search grounding enabled
          </Card>
          <Card title="Streaming" icon="lucide-list-minus">
            Server-sent events support
          </Card>
          <Card title="Flexible Roles" icon="lucide-users">
            Multiple message roles supported
          </Card>
        </CardGroup>

        <div style="padding: 20px; background-color: rgba(255, 152, 0, 0.05);
        border: 1px solid rgba(255, 152, 0, 0.15); border-left: 6px solid
        #ff9800; border-radius: 10px; margin: 25px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 22px; margin-right: 10px;">⚠️</span>
            <strong style="color: #e65100; font-size: 17px;">Important: Unified Media Structure</strong>
          </div>

          <p style="color: #444; margin-bottom: 15px; line-height: 1.6; font-size: 14px;">
            To simplify integration, <b>all media types</b> (Images, Videos, Audio, or Documents) in the <code>messages</code> array share the <b>exact same JSON structure</b>:
          </p>

          <ul style="color: #555; line-height: 1.8; margin-bottom: 15px; font-size: 14px;">
            <li>The <code>type</code> field is <b>fixed</b> as <code>"image_url"</code></li>
            <li>The <code>image_url</code> key name <b>remains unchanged</b> for all file types</li>
            <li>Only the <code>url</code> value points to your specific media file</li>
          </ul>

          <div style="background-color: #fdfdfd; padding: 12px; border-radius: 6px; border: 1px solid #eee; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; color: #d32f2f;">
            <span style="color: #888; font-style: italic;">// Example for Video/Audio/PDF/Image:</span><br>
            { "type": "image_url", "image_url": { "url": "https://..." } }
          </div>
        </div>

        ## Tools Parameter

        The `tools` parameter is an optional array that allows you to define
        functions the model can call. The array can contain multiple objects.

        <AccordionGroup>
        <Accordion title="Google Search">
        Use this format to enable Google Search grounding:

        ```json
        {
          "type": "function",
          "function": {
            "name": "googleSearch"
          }
        }
        ```

        This enables real-time information retrieval via Google Search.
        </Accordion>
        </AccordionGroup>
      operationId: claude-opus-4-5-chat-completions
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                messages:
                  type: array
                  description: >-
                    An array of message objects. Each message has a role and
                    content.

                    **Unified Media File Format:**

                    In the content array, whether it's images, videos, audio, or
                    other document types, all media files use the same format
                    structure:

                    - The `type` field is always `"image_url"`
                    - The `image_url` field name remains unchanged
                    - The only thing that changes is the `url` value, which
                    points to the corresponding media file address

                    For example: images, videos, audio, PDFs, and other
                    documents all use the same `{ type: 'image_url', image_url:
                    { url: '...' } }` structure.
                  items:
                    $ref: '#/components/schemas/Message'
                  minItems: 1
                stream:
                  type: boolean
                  default: true
                  description: >-
                    If set to true, partial message deltas will be sent as
                    server-sent events. Default is true.
                tools:
                  type: array
                  description: >-
                    An optional array of tools the model may call.

                    - **Google Search**: `{"type": "function", "function":
                    {"name": "googleSearch"}}`
                  items:
                    $ref: '#/components/schemas/Tool'
                  minItems: 0
                include_thoughts:
                  type: boolean
                  description: >-
                    Whether to include thoughts in the response. If set to true,
                    thoughts will be included in the response, otherwise they
                    will not be included. Default is true.
                  default: true
                reasoning_effort:
                  type: string
                  enum:
                    - low
                    - high
                  description: >-
                    The effort level for the model to use for reasoning. Low
                    effort is faster to respond, high effort is slower to
                    respond but solves more complex problems. Default is "high".
                  default: high
              required:
                - messages
              x-apidog-orders:
                - messages
                - stream
                - tools
                - include_thoughts
                - reasoning_effort
              examples:
                - messages:
                    - role: user
                      content:
                        - type: text
                          text: What is in this image?
                        - type: image_url
                          image_url:
                            url: >-
                              https://file.aiquickdraw.com/custom-page/akr/section-images/1759055072437dqlsclj2.png
                  tools:
                    - type: function
                      function:
                        name: googleSearch
                  stream: true
                  include_thoughts: true
                  reasoning_effort: high
              x-apidog-ignore-properties: []
            example:
              messages:
                - role: user
                  content:
                    - type: text
                      text: What is in this image?
                    - type: image_url
                      image_url:
                        url: >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1759055072437dqlsclj2.png
              tools:
                - type: function
                  function:
                    name: googleSearch
              stream: true
              include_thoughts: true
              reasoning_effort: high
      responses:
        '200':
          description: Request successful. Returns the standard chat completion format.
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    description: Unique identifier for the chat completion
                    examples:
                      - chatcmpl-example-123
                  object:
                    type: string
                    description: Object type
                    examples:
                      - chat.completion
                  created:
                    type: integer
                    format: int64
                    description: Unix timestamp of when the completion was created
                    examples:
                      - 1677652288
                  model:
                    type: string
                    description: Model name
                    examples:
                      - claude-opus-4-5
                  choices:
                    type: array
                    description: Array of completion choices
                    items:
                      type: object
                      properties:
                        index:
                          type: integer
                          description: Index of the choice
                          examples:
                            - 0
                        message:
                          type: object
                          properties:
                            role:
                              type: string
                              examples:
                                - assistant
                            content:
                              type: string
                              description: Message content
                          required:
                            - role
                            - content
                          x-apidog-orders:
                            - role
                            - content
                          x-apidog-ignore-properties: []
                        finish_reason:
                          type: string
                          description: Reason why the completion finished
                          examples:
                            - stop
                      required:
                        - index
                        - message
                        - finish_reason
                      x-apidog-orders:
                        - index
                        - message
                        - finish_reason
                      x-apidog-ignore-properties: []
                  usage:
                    type: object
                    properties:
                      prompt_tokens:
                        type: integer
                        description: Number of tokens in the prompt
                        examples:
                          - 10
                      completion_tokens:
                        type: integer
                        description: Number of tokens in the completion
                        examples:
                          - 50
                      total_tokens:
                        type: integer
                        description: Total number of tokens
                        examples:
                          - 60
                    required:
                      - prompt_tokens
                      - completion_tokens
                      - total_tokens
                    x-apidog-orders:
                      - prompt_tokens
                      - completion_tokens
                      - total_tokens
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - id
                  - object
                  - created
                  - model
                  - choices
                  - usage
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - error
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Unauthorized
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - error
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '429':
          description: Rate Limited - Too many requests
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Rate limit exceeded
                      type:
                        type: string
                        examples:
                          - rate_limit_error
                    x-apidog-orders:
                      - message
                      - type
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - error
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code

                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506436-run
components:
  schemas:
    Tool:
      type: object
      description: >-
        Tool definition.

        - **Enhanced Network Access**: `{"type": "function", "function":
        {"name": "googleSearch"}}`
      properties:
        type:
          type: string
          enum:
            - function
          description: Utility type. Must be 'function'.
          examples:
            - function
        function:
          type: object
          description: Function declarations for enhanced network access.
          properties:
            name:
              type: string
              description: Function name. Must be `googleSearch`.
            description:
              type: string
              description: >-
                Optional but recommended. A clear and specific description of
                the function's purpose. Helps the model understand when to call
                this function.
            parameters:
              type: object
              description: >-
                Defines a JSON Schema object for function parameters. Required
                for custom functions; not used by 'googleSearch'. Follows the
                JSON Schema specification.
              properties:
                type:
                  type: string
                  enum:
                    - object
                  description: Must be 'object' for function parameters
                properties:
                  type: object
                  description: Map parameter names to objects defined in their JSON Schema.
                  additionalProperties:
                    type: string
                  x-apidog-orders: []
                  properties: {}
                  x-apidog-ignore-properties: []
                required:
                  type: array
                  items:
                    type: string
                  description: Required parameter name array
              required:
                - type
                - properties
              x-apidog-orders:
                - type
                - properties
                - required
              x-apidog-ignore-properties: []
          required:
            - name
          x-apidog-orders:
            - name
            - description
            - parameters
          x-apidog-ignore-properties: []
      required:
        - type
        - function
      x-apidog-orders:
        - type
        - function
      title: The tools parameter of the chat model
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    Message:
      type: object
      properties:
        role:
          type: string
          enum:
            - developer
            - system
            - user
            - assistant
            - tool
          description: >-
            Message role

            - **developer**: Developer-provided instructions that the model
            should follow, regardless of user messages. In o1 models and newer
            versions, developer messages replace the previous system messages.

            - **system**: Developer-provided instructions that the model should
            follow, regardless of user messages. In o1 models and newer
            versions, please use developer messages instead.

            - **user**: Messages sent by end users, containing prompts or
            additional context information.

            - **assistant**: Messages sent by the model in response to user
            messages.

            - **tool**: Content of tool messages.
        content:
          type: array
          description: >-
            Message content array that can contain text and image objects.

            **Unified Media File Format:**

            Whether it's images, videos, audio, or other document types, all
            media files use the same format structure:

            - The `type` field is always `"image_url"`
            - The `image_url` field name remains unchanged
            - The only thing that changes is the `url` value, which points to
            the corresponding media file address

            For example: images, videos, audio, PDFs, and other documents all
            use the same `{ type: 'image_url', image_url: { url: '...' } }`
            structure.
          items:
            oneOf:
              - type: object
                properties:
                  type:
                    type: string
                    enum:
                      - text
                    examples:
                      - text
                  text:
                    type: string
                    description: 消息的文本内容
                required:
                  - type
                  - text
                x-apidog-orders:
                  - type
                  - text
                x-apidog-ignore-properties: []
              - type: object
                properties:
                  type:
                    type: string
                    enum:
                      - image_url
                    examples:
                      - image_url
                  image_url:
                    type: object
                    properties:
                      url:
                        type: string
                        format: uri
                        description: 图像的 URL
                    required:
                      - url
                    x-apidog-orders:
                      - url
                    x-apidog-ignore-properties: []
                required:
                  - type
                  - image_url
                x-apidog-orders:
                  - type
                  - image_url
                x-apidog-ignore-properties: []
      required:
        - role
        - content
      title: The messages parameter of the chat model
      x-apidog-orders:
        - role
        - content
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 2. Claude Opus 4.5 — OpenAI Chat Completions 호환

> 출처: https://docs.kie.ai/market/claude/claude-opus-4-5
> 참고: Claude Opus 4.5 Chat Completions 스펙은 Claude Sonnet 4.5 Chat Completions 스펙과 동일한 OpenAPI 구조를 공유합니다.
> 엔드포인트 경로: `POST /claude-sonnet-4-5/v1/chat/completions` (또는 `/claude-opus-4-5/v1/chat/completions`)
> operationId: `claude-sonnet-4-5-chat-completions` (또는 `claude-opus-4-5-chat-completions`)
> 응답의 model 필드: `claude-sonnet-4-5` 또는 `claude-opus-4-5`
> x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506437-run

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude-sonnet-4-5/v1/chat/completions:
    post:
      summary: Claude Opus 4.5
      deprecated: false
      description: >-
        ### Streaming Support

        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE) with `Content-Type: text/event-stream`. This
        allows for progressive response delivery, where message deltas are sent
        incrementally as they are generated. Each event contains partial message
        content, enabling real-time display of responses in your application.

        **Streaming Response Format:**

        - Content-Type: `text/event-stream`

        - Each event line starts with `data: ` followed by JSON

        - Events contain incremental message deltas

        - Final event indicates completion with `finish_reason`

        <CardGroup cols={2}>
          <Card title="Multimodal" icon="lucide-image">
            Supports text and image inputs
          </Card>
          <Card title="Real-time Search" icon="lucide-search">
            Google Search grounding enabled
          </Card>
          <Card title="Streaming"  icon="lucide-list-minus">
            Server-sent events support
          </Card>
          <Card title="Flexible Roles" icon="lucide-users">
            Multiple message roles supported
          </Card>
        </CardGroup>

        <div style="padding: 20px; background-color: rgba(255, 152, 0, 0.05);
        border: 1px solid rgba(255, 152, 0, 0.15); border-left: 6px solid
        #ff9800; border-radius: 10px; margin: 25px 0;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 22px; margin-right: 10px;">⚠️</span>
            <strong style="color: #e65100; font-size: 17px;">Important: Unified Media Structure</strong>
          </div>

          <p style="color: #444; margin-bottom: 15px; line-height: 1.6; font-size: 14px;">
            To simplify integration, <b>all media types</b> (Images, Videos, Audio, or Documents) in the <code>messages</code> array share the <b>exact same JSON structure</b>:
          </p>

          <ul style="color: #555; line-height: 1.8; margin-bottom: 15px; font-size: 14px;">
            <li>The <code>type</code> field is <b>fixed</b> as <code>"image_url"</code></li>
            <li>The <code>image_url</code> key name <b>remains unchanged</b> for all file types</li>
            <li>Only the <code>url</code> value points to your specific media file</li>
          </ul>

          <div style="background-color: #fdfdfd; padding: 12px; border-radius: 6px; border: 1px solid #eee; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; color: #d32f2f;">
            <span style="color: #888; font-style: italic;">// Example for Video/Audio/PDF/Image:</span><br>
            { "type": "image_url", "image_url": { "url": "https://..." } }
          </div>
        </div>

        ## Tools Parameter

        The `tools` parameter is an optional array that allows you to define
        functions the model can call. The array can contain multiple objects.

        <AccordionGroup>

        <Accordion title="Google Search">

        Use this format to enable Google Search grounding:

        ```json

        {
          "type": "function",
          "function": {
            "name": "googleSearch"
          }
        }

        ```

        This enables real-time information retrieval via Google Search.

        </Accordion>

        </AccordionGroup>
      operationId: claude-sonnet-4-5-chat-completions
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                messages:
                  type: array
                  description: >-
                    An array of message objects. Each message has a role and
                    content.

                    **Unified Media File Format:**

                    In the content array, whether it's images, videos, audio, or
                    other document types, all media files use the same format
                    structure:

                    - The `type` field is always `"image_url"`

                    - The `image_url` field name remains unchanged

                    - The only thing that changes is the `url` value, which
                    points to the corresponding media file address

                    For example: images, videos, audio, PDFs, and other
                    documents all use the same `{ type: 'image_url', image_url:
                    { url: '...' } }` structure.
                  items:
                    $ref: '#/components/schemas/Message'
                  minItems: 1
                stream:
                  type: boolean
                  default: true
                  description: >-
                    If set to true, partial message deltas will be sent as
                    server-sent events. Default is true.
                tools:
                  type: array
                  description: >-
                    An optional array of tools the model may call.

                    - **Google Search**: `{"type": "function", "function":
                    {"name": "googleSearch"}}`
                  items:
                    $ref: '#/components/schemas/Tool'
                  minItems: 0
                include_thoughts:
                  type: boolean
                  description: >-
                    Whether to include thoughts in the response. If set to true,
                    thoughts will be included in the response, otherwise they
                    will not be included. Default is true.
                  default: true
                reasoning_effort:
                  type: string
                  enum:
                    - low
                    - high
                  description: >-
                    The effort level for the model to use for reasoning. Low
                    effort is faster to respond, high effort is slower to
                    respond but solves more complex problems. Default is "high".
                  default: high
              required:
                - messages
              x-apidog-orders:
                - messages
                - stream
                - tools
                - include_thoughts
                - reasoning_effort
              examples:
                - messages:
                    - role: user
                      content:
                        - type: text
                          text: What is in this image?
                        - type: image_url
                          image_url:
                            url: >-
                              https://file.aiquickdraw.com/custom-page/akr/section-images/1759055072437dqlsclj2.png
                  tools:
                    - type: function
                      function:
                        name: googleSearch
                  stream: true
                  include_thoughts: true
                  reasoning_effort: high
              x-apidog-ignore-properties: []
            example:
              messages:
                - role: user
                  content:
                    - type: text
                      text: What is in this image?
                    - type: image_url
                      image_url:
                        url: >-
                          https://file.aiquickdraw.com/custom-page/akr/section-images/1759055072437dqlsclj2.png
              tools:
                - type: function
                  function:
                    name: googleSearch
              stream: true
              reasoning_effort: high
      responses:
        '200':
          description: Request successful. Returns the standard chat completion format.
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    description: Unique identifier for the chat completion
                    examples:
                      - chatcmpl-example-123
                  object:
                    type: string
                    description: Object type
                    examples:
                      - chat.completion
                  created:
                    type: integer
                    format: int64
                    description: Unix timestamp of when the completion was created
                    examples:
                      - 1677652288
                  model:
                    type: string
                    description: Model name
                    examples:
                      - claude-sonnet-4-5
                  choices:
                    type: array
                    description: Array of completion choices
                    items:
                      type: object
                      properties:
                        index:
                          type: integer
                          description: Index of the choice
                          examples:
                            - 0
                        message:
                          type: object
                          properties:
                            role:
                              type: string
                              examples:
                                - assistant
                            content:
                              type: string
                              description: Message content
                          required:
                            - role
                            - content
                          x-apidog-orders:
                            - role
                            - content
                          x-apidog-ignore-properties: []
                        finish_reason:
                          type: string
                          description: Reason why the completion finished
                          examples:
                            - stop
                      required:
                        - index
                        - message
                        - finish_reason
                      x-apidog-orders:
                        - index
                        - message
                        - finish_reason
                      x-apidog-ignore-properties: []
                  usage:
                    type: object
                    properties:
                      prompt_tokens:
                        type: integer
                        description: Number of tokens in the prompt
                        examples:
                          - 10
                      completion_tokens:
                        type: integer
                        description: Number of tokens in the completion
                        examples:
                          - 50
                      total_tokens:
                        type: integer
                        description: Total number of tokens
                        examples:
                          - 60
                    required:
                      - prompt_tokens
                      - completion_tokens
                      - total_tokens
                    x-apidog-orders:
                      - prompt_tokens
                      - completion_tokens
                      - total_tokens
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - id
                  - object
                  - created
                  - model
                  - choices
                  - usage
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - error
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Unauthorized
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - error
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '429':
          description: Rate Limited - Too many requests
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Rate limit exceeded
                      type:
                        type: string
                        examples:
                          - rate_limit_error
                    x-apidog-orders:
                      - message
                      - type
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - error
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code

                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506437-run
components:
  schemas:
    Tool:
      type: object
      description: >-
        Tool definition.

        - **Enhanced Network Access**: `{"type": "function", "function":
        {"name": "googleSearch"}}`
      properties:
        type:
          type: string
          enum:
            - function
          description: Utility type. Must be 'function'.
          examples:
            - function
        function:
          type: object
          description: Function declarations for enhanced network access.
          properties:
            name:
              type: string
              description: Function name. Must be `googleSearch`.
            description:
              type: string
              description: >-
                Optional but recommended. A clear and specific description of
                the function's purpose. Helps the model understand when to call
                this function.
            parameters:
              type: object
              description: >-
                Defines a JSON Schema object for function parameters. Required
                for custom functions; not used by 'googleSearch'. Follows the
                JSON Schema specification.
              properties:
                type:
                  type: string
                  enum:
                    - object
                  description: Must be 'object' for function parameters
                properties:
                  type: object
                  description: Map parameter names to objects defined in their JSON Schema.
                  additionalProperties:
                    type: string
                  x-apidog-orders: []
                  properties: {}
                  x-apidog-ignore-properties: []
                required:
                  type: array
                  items:
                    type: string
                  description: Required parameter name array
              required:
                - type
                - properties
              x-apidog-orders:
                - type
                - properties
                - required
              x-apidog-ignore-properties: []
          required:
            - name
          x-apidog-orders:
            - name
            - description
            - parameters
          x-apidog-ignore-properties: []
      required:
        - type
        - function
      x-apidog-orders:
        - type
        - function
      title: The tools parameter of the chat model
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    Message:
      type: object
      properties:
        role:
          type: string
          enum:
            - developer
            - system
            - user
            - assistant
            - tool
          description: >-
            Message role

            - **developer**: Developer-provided instructions that the model
            should follow, regardless of user messages. In o1 models and newer
            versions, developer messages replace the previous system messages.

            - **system**: Developer-provided instructions that the model should
            follow, regardless of user messages. In o1 models and newer
            versions, please use developer messages instead.

            - **user**: Messages sent by end users, containing prompts or
            additional context information.

            - **assistant**: Messages sent by the model in response to user
            messages.

            - **tool**: Content of tool messages.
        content:
          type: array
          description: >-
            Message content array that can contain text and image objects.

            **Unified Media File Format:**

            Whether it's images, videos, audio, or other document types, all
            media files use the same format structure:

            - The `type` field is always `"image_url"`
            - The `image_url` field name remains unchanged
            - The only thing that changes is the `url` value, which points to
            the corresponding media file address

            For example: images, videos, audio, PDFs, and other documents all
            use the same `{ type: 'image_url', image_url: { url: '...' } }`
            structure.
          items:
            oneOf:
              - type: object
                properties:
                  type:
                    type: string
                    enum:
                      - text
                    examples:
                      - text
                  text:
                    type: string
                    description: 消息的文本内容
                required:
                  - type
                  - text
                x-apidog-orders:
                  - type
                  - text
                x-apidog-ignore-properties: []
              - type: object
                properties:
                  type:
                    type: string
                    enum:
                      - image_url
                    examples:
                      - image_url
                  image_url:
                    type: object
                    properties:
                      url:
                        type: string
                        format: uri
                        description: 图像的 URL
                    required:
                      - url
                    x-apidog-orders:
                      - url
                    x-apidog-ignore-properties: []
                required:
                  - type
                  - image_url
                x-apidog-orders:
                  - type
                  - image_url
                x-apidog-ignore-properties: []
      required:
        - role
        - content
      title: The messages parameter of the chat model
      x-apidog-orders:
        - role
        - content
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 3. Claude Haiku 4.5 — Native v1/messages

> 출처: https://docs.kie.ai/30749621e0

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude/v1/messages:
    post:
      summary: claude-haiku-4-5-v1messages
      deprecated: false
      description: >-
        ### Streaming Support


        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE). Claude tool calling responses stream
        `tool_use` blocks and `input_json_delta` fragments.


        **Streaming Response Format:**

        - Content-Type: `text/event-stream`

        - Event names include `message_start`, `content_block_start`,
        `content_block_delta`, `message_delta`, and `message_stop`

        - Tool calls are emitted as `tool_use` content blocks

        - Final stop reason is often `tool_use` for function-calling requests


        ## Features


        - Standard chat with `messages`.

        - Function calling with `tools` and `input_schema`.

        - Optional stream response with Claude events.

        - Optional project-specific thinking flag.


        ## Request Notes


        - Put the current model name in the `model` field.

        - Use `messages` for conversation history.

        - Use `tools` to declare callable functions.

        - Set `stream` to `true` for SSE output.


        ## Authentication


        Use the auth configuration for `X-Api-Key` and `anthropic-version`. Do
        not add them as regular request parameters.
      operationId: claude_haiku_4_5_v1messages
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: Model name. It must match the current document.
                  enum:
                    - claude-haiku-4-5-v1messages
                  examples:
                    - claude-haiku-4-5-v1messages
                messages:
                  type: array
                  description: Conversation messages in chronological order.
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - assistant
                        description: Message role.
                        examples:
                          - user
                      content:
                        oneOf:
                          - type: string
                            description: Plain text content.
                          - type: array
                            description: Structured content blocks.
                            items:
                              type: object
                              additionalProperties: true
                              x-apidog-orders: []
                        description: Message content.
                        examples:
                          - What is the weather like in Boston today?
                    required:
                      - role
                      - content
                    x-apidog-orders:
                      - role
                      - content
                  minItems: 1
                tools:
                  type: array
                  description: >-
                    Optional callable tools. Each tool includes a name,
                    description, and input_schema.
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                        description: Function name.
                        examples:
                          - get_current_weather
                      description:
                        type: string
                        description: Human-readable function description.
                        examples:
                          - Get the current weather in a given location
                      input_schema:
                        type: object
                        description: JSON Schema for function parameters.
                        properties:
                          type:
                            type: string
                            description: Schema type.
                            examples:
                              - object
                          properties:
                            type: object
                            description: Function parameter definitions.
                            additionalProperties: true
                            x-apidog-orders: []
                            properties: {}
                          required:
                            type: array
                            description: Required parameter names.
                            items:
                              type: string
                        x-apidog-orders:
                          - type
                          - properties
                          - required
                        examples:
                          - type: object
                            properties:
                              location:
                                type: string
                                description: The city and state, e.g. Boston, MA
                            required:
                              - location
                    required:
                      - name
                      - description
                      - input_schema
                    x-apidog-orders:
                      - name
                      - description
                      - input_schema
                thinkingFlag:
                  type: boolean
                  description: >-
                    Project-specific thinking flag used by the current Claude
                    adapter.
                  examples:
                    - true
                stream:
                  type: boolean
                  default: true
                  description: If set to true, the response is returned as an SSE stream.
                  examples:
                    - false
              required:
                - model
                - messages
              x-apidog-orders:
                - model
                - messages
                - tools
                - thinkingFlag
                - stream
              examples:
                - model: claude-haiku-4-5-v1messages
                  messages:
                    - role: user
                      content: What is the weather like in Boston today?
                  tools:
                    - name: get_current_weather
                      description: Get the current weather in a given location
                      input_schema:
                        type: object
                        properties:
                          location:
                            type: string
                            description: The city and state, e.g. Boston, MA
                        required:
                          - location
                  thinkingFlag: true
                  stream: false
            example:
              model: claude-haiku-4-5-v1messages
              messages:
                - role: user
                  content: What is the weather like in Boston today?
              tools:
                - name: get_current_weather
                  description: Get the current weather in a given location
                  input_schema:
                    type: object
                    properties:
                      location:
                        type: string
                        description: The city and state, e.g. Boston, MA
                    required:
                      - location
              thinkingFlag: true
              stream: false
      responses:
        '200':
          description: Request successful.
          content:
            application/json:
              schema:
                type: object
                properties:
                  role:
                    type: string
                    description: Returned message role
                    examples:
                      - assistant
                  usage:
                    type: object
                    description: Usage information returned by the provider
                    properties:
                      input_tokens:
                        type: integer
                        description: Input token count
                        examples:
                          - 600
                      output_tokens:
                        type: integer
                        description: Output token count
                        examples:
                          - 57
                      cache_creation_input_tokens:
                        type: integer
                        description: Cache creation input token count
                        examples:
                          - 0
                      cache_read_input_tokens:
                        type: integer
                        description: Cache read input token count
                        examples:
                          - 0
                      service_tier:
                        type: string
                        description: Service tier
                        examples:
                          - standard
                    x-apidog-orders:
                      - input_tokens
                      - output_tokens
                      - cache_creation_input_tokens
                      - cache_read_input_tokens
                      - service_tier
                  stop_reason:
                    type: string
                    description: Reason why generation stopped
                    examples:
                      - tool_use
                  model:
                    type: string
                    description: Actual model version returned by the provider
                    examples:
                      - claude-opus-4-5-20251101
                  id:
                    type: string
                    description: Unique message identifier
                    examples:
                      - msg_01VSoxV4a8YWB3DBh9TdM63W
                  credits_consumed:
                    type: number
                    description: Credits consumed by the request
                    examples:
                      - 0.25
                  type:
                    type: string
                    description: Top-level response object type
                    examples:
                      - message
                  content:
                    type: array
                    description: Response content blocks
                    items:
                      type: object
                      properties:
                        input:
                          type: object
                          description: Tool input arguments
                          additionalProperties: true
                          x-apidog-orders: []
                          properties: {}
                        caller:
                          type: object
                          description: Tool caller metadata
                          properties:
                            type:
                              type: string
                              examples:
                                - direct
                          x-apidog-orders:
                            - type
                        name:
                          type: string
                          description: Tool name
                          examples:
                            - get_current_weather
                        id:
                          type: string
                          description: Tool call identifier
                          examples:
                            - toolu_018gdqs2FHxrRjQHLZv1qvbF
                        type:
                          type: string
                          description: Content block type
                          examples:
                            - tool_use
                      x-apidog-orders:
                        - input
                        - caller
                        - name
                        - id
                        - type
                x-apidog-orders:
                  - role
                  - usage
                  - stop_reason
                  - model
                  - id
                  - credits_consumed
                  - type
                  - content
              example:
                role: assistant
                usage:
                  cache_creation:
                    ephemeral_1h_input_tokens: 0
                    ephemeral_5m_input_tokens: 0
                  output_tokens: 57
                  service_tier: standard
                  cache_creation_input_tokens: 0
                  input_tokens: 600
                  cache_read_input_tokens: 0
                  inference_geo: not_available
                stop_reason: tool_use
                model: claude-opus-4-5-20251101
                id: msg_01VSoxV4a8YWB3DBh9TdM63W
                credits_consumed: 0.25
                type: message
                content:
                  - input:
                      location: Beijing, China
                    caller:
                      type: direct
                    name: get_current_weather
                    id: toolu_018gdqs2FHxrRjQHLZv1qvbF
                    type: tool_use
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid or missing API key
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-30749621-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 4. Claude Opus 4.5 — Native v1/messages

> 출처: https://docs.kie.ai/30749665e0

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude/v1/messages:
    post:
      summary: claude-opus-4-5-v1messages
      deprecated: false
      description: >-
        ### Streaming Support


        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE). Claude tool calling responses stream
        `tool_use` blocks and `input_json_delta` fragments.


        **Streaming Response Format:**

        - Content-Type: `text/event-stream`

        - Event names include `message_start`, `content_block_start`,
        `content_block_delta`, `message_delta`, and `message_stop`

        - Tool calls are emitted as `tool_use` content blocks

        - Final stop reason is often `tool_use` for function-calling requests


        ## Features


        - Standard chat with `messages`.

        - Function calling with `tools` and `input_schema`.

        - Optional stream response with Claude events.

        - Optional project-specific thinking flag.


        ## Request Notes


        - Put the current model name in the `model` field.

        - Use `messages` for conversation history.

        - Use `tools` to declare callable functions.

        - Set `stream` to `true` for SSE output.


        ## Authentication


        Use the auth configuration for `X-Api-Key` and `anthropic-version`. Do
        not add them as regular request parameters.
      operationId: claude_opus_4_5_v1messages
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: Model name. It must match the current document.
                  enum:
                    - claude-opus-4-5-v1messages
                  examples:
                    - claude-opus-4-5-v1messages
                messages:
                  type: array
                  description: Conversation messages in chronological order.
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - assistant
                        description: Message role.
                        examples:
                          - user
                      content:
                        oneOf:
                          - type: string
                            description: Plain text content.
                          - type: array
                            description: Structured content blocks.
                            items:
                              type: object
                              additionalProperties: true
                              x-apidog-orders: []
                        description: Message content.
                        examples:
                          - What is the weather like in Boston today?
                    required:
                      - role
                      - content
                    x-apidog-orders:
                      - role
                      - content
                  minItems: 1
                tools:
                  type: array
                  description: >-
                    Optional callable tools. Each tool includes a name,
                    description, and input_schema.
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                        description: Function name.
                        examples:
                          - get_current_weather
                      description:
                        type: string
                        description: Human-readable function description.
                        examples:
                          - Get the current weather in a given location
                      input_schema:
                        type: object
                        description: JSON Schema for function parameters.
                        properties:
                          type:
                            type: string
                            description: Schema type.
                            examples:
                              - object
                          properties:
                            type: object
                            description: Function parameter definitions.
                            additionalProperties: true
                            x-apidog-orders: []
                            properties: {}
                          required:
                            type: array
                            description: Required parameter names.
                            items:
                              type: string
                        x-apidog-orders:
                          - type
                          - properties
                          - required
                        examples:
                          - type: object
                            properties:
                              location:
                                type: string
                                description: The city and state, e.g. Boston, MA
                            required:
                              - location
                    required:
                      - name
                      - description
                      - input_schema
                    x-apidog-orders:
                      - name
                      - description
                      - input_schema
                thinkingFlag:
                  type: boolean
                  description: >-
                    Project-specific thinking flag used by the current Claude
                    adapter.
                  examples:
                    - true
                stream:
                  type: boolean
                  default: true
                  description: If set to true, the response is returned as an SSE stream.
                  examples:
                    - false
              required:
                - model
                - messages
              x-apidog-orders:
                - model
                - messages
                - tools
                - thinkingFlag
                - stream
              examples:
                - model: claude-opus-4-5-v1messages
                  messages:
                    - role: user
                      content: What is the weather like in Boston today?
                  tools:
                    - name: get_current_weather
                      description: Get the current weather in a given location
                      input_schema:
                        type: object
                        properties:
                          location:
                            type: string
                            description: The city and state, e.g. Boston, MA
                        required:
                          - location
                  thinkingFlag: true
                  stream: false
            example:
              model: claude-opus-4-5-v1messages
              messages:
                - role: user
                  content: What is the weather like in Boston today?
              tools:
                - name: get_current_weather
                  description: Get the current weather in a given location
                  input_schema:
                    type: object
                    properties:
                      location:
                        type: string
                        description: The city and state, e.g. Boston, MA
                    required:
                      - location
              thinkingFlag: true
              stream: false
      responses:
        '200':
          description: Request successful.
          content:
            application/json:
              schema:
                type: object
                properties:
                  role:
                    type: string
                    description: Returned message role
                    examples:
                      - assistant
                  usage:
                    type: object
                    description: Usage information returned by the provider
                    properties:
                      input_tokens:
                        type: integer
                        description: Input token count
                        examples:
                          - 600
                      output_tokens:
                        type: integer
                        description: Output token count
                        examples:
                          - 57
                      cache_creation_input_tokens:
                        type: integer
                        description: Cache creation input token count
                        examples:
                          - 0
                      cache_read_input_tokens:
                        type: integer
                        description: Cache read input token count
                        examples:
                          - 0
                      service_tier:
                        type: string
                        description: Service tier
                        examples:
                          - standard
                    x-apidog-orders:
                      - input_tokens
                      - output_tokens
                      - cache_creation_input_tokens
                      - cache_read_input_tokens
                      - service_tier
                  stop_reason:
                    type: string
                    description: Reason why generation stopped
                    examples:
                      - tool_use
                  model:
                    type: string
                    description: Actual model version returned by the provider
                    examples:
                      - claude-opus-4-5-20251101
                  id:
                    type: string
                    description: Unique message identifier
                    examples:
                      - msg_01VSoxV4a8YWB3DBh9TdM63W
                  credits_consumed:
                    type: number
                    description: Credits consumed by the request
                    examples:
                      - 0.25
                  type:
                    type: string
                    description: Top-level response object type
                    examples:
                      - message
                  content:
                    type: array
                    description: Response content blocks
                    items:
                      type: object
                      properties:
                        input:
                          type: object
                          description: Tool input arguments
                          additionalProperties: true
                          x-apidog-orders: []
                        caller:
                          type: object
                          description: Tool caller metadata
                          properties:
                            type:
                              type: string
                              examples:
                                - direct
                          x-apidog-orders:
                            - type
                        name:
                          type: string
                          description: Tool name
                          examples:
                            - get_current_weather
                        id:
                          type: string
                          description: Tool call identifier
                          examples:
                            - toolu_018gdqs2FHxrRjQHLZv1qvbF
                        type:
                          type: string
                          description: Content block type
                          examples:
                            - tool_use
                      x-apidog-orders:
                        - input
                        - caller
                        - name
                        - id
                        - type
                x-apidog-orders:
                  - role
                  - usage
                  - stop_reason
                  - model
                  - id
                  - credits_consumed
                  - type
                  - content
              example:
                role: assistant
                usage:
                  cache_creation:
                    ephemeral_1h_input_tokens: 0
                    ephemeral_5m_input_tokens: 0
                  output_tokens: 57
                  service_tier: standard
                  cache_creation_input_tokens: 0
                  input_tokens: 600
                  cache_read_input_tokens: 0
                  inference_geo: not_available
                stop_reason: tool_use
                model: claude-opus-4-5-20251101
                id: msg_01VSoxV4a8YWB3DBh9TdM63W
                credits_consumed: 0.25
                type: message
                content:
                  - input:
                      location: Beijing, China
                    caller:
                      type: direct
                    name: get_current_weather
                    id: toolu_018gdqs2FHxrRjQHLZv1qvbF
                    type: tool_use
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid or missing API key
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-30749665-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验증。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 5. Claude Opus 4.6 — Native v1/messages

> 출처: https://docs.kie.ai/30749668e0

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude/v1/messages:
    post:
      summary: claude-opus-4-6-v1messages
      deprecated: false
      description: >-
        ### Streaming Support


        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE). Claude tool calling responses stream
        `tool_use` blocks and `input_json_delta` fragments.


        **Streaming Response Format:**

        - Content-Type: `text/event-stream`

        - Event names include `message_start`, `content_block_start`,
        `content_block_delta`, `message_delta`, and `message_stop`

        - Tool calls are emitted as `tool_use` content blocks

        - Final stop reason is often `tool_use` for function-calling requests


        ## Features


        - Standard chat with `messages`.

        - Function calling with `tools` and `input_schema`.

        - Optional stream response with Claude events.

        - Optional project-specific thinking flag.


        ## Request Notes


        - Put the current model name in the `model` field.

        - Use `messages` for conversation history.

        - Use `tools` to declare callable functions.

        - Set `stream` to `true` for SSE output.


        ## Authentication


        Use the auth configuration for `X-Api-Key` and `anthropic-version`. Do
        not add them as regular request parameters.
      operationId: claude_opus_4_6_v1messages
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: Model name. It must match the current document.
                  enum:
                    - claude-opus-4-6-v1messages
                  examples:
                    - claude-opus-4-6-v1messages
                messages:
                  type: array
                  description: Conversation messages in chronological order.
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - assistant
                        description: Message role.
                        examples:
                          - user
                      content:
                        oneOf:
                          - type: string
                            description: Plain text content.
                          - type: array
                            description: Structured content blocks.
                            items:
                              type: object
                              additionalProperties: true
                              x-apidog-orders: []
                        description: Message content.
                        examples:
                          - What is the weather like in Boston today?
                    required:
                      - role
                      - content
                    x-apidog-orders:
                      - role
                      - content
                  minItems: 1
                tools:
                  type: array
                  description: >-
                    Optional callable tools. Each tool includes a name,
                    description, and input_schema.
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                        description: Function name.
                        examples:
                          - get_current_weather
                      description:
                        type: string
                        description: Human-readable function description.
                        examples:
                          - Get the current weather in a given location
                      input_schema:
                        type: object
                        description: JSON Schema for function parameters.
                        properties:
                          type:
                            type: string
                            description: Schema type.
                            examples:
                              - object
                          properties:
                            type: object
                            description: Function parameter definitions.
                            additionalProperties: true
                            x-apidog-orders: []
                            properties: {}
                          required:
                            type: array
                            description: Required parameter names.
                            items:
                              type: string
                        x-apidog-orders:
                          - type
                          - properties
                          - required
                        examples:
                          - type: object
                            properties:
                              location:
                                type: string
                                description: The city and state, e.g. Boston, MA
                            required:
                              - location
                    required:
                      - name
                      - description
                      - input_schema
                    x-apidog-orders:
                      - name
                      - description
                      - input_schema
                thinkingFlag:
                  type: boolean
                  description: >-
                    Project-specific thinking flag used by the current Claude
                    adapter.
                  examples:
                    - true
                stream:
                  type: boolean
                  default: true
                  description: If set to true, the response is returned as an SSE stream.
                  examples:
                    - false
              required:
                - model
                - messages
              x-apidog-orders:
                - model
                - messages
                - tools
                - thinkingFlag
                - stream
              examples:
                - model: claude-opus-4-6-v1messages
                  messages:
                    - role: user
                      content: What is the weather like in Boston today?
                  tools:
                    - name: get_current_weather
                      description: Get the current weather in a given location
                      input_schema:
                        type: object
                        properties:
                          location:
                            type: string
                            description: The city and state, e.g. Boston, MA
                        required:
                          - location
                  thinkingFlag: true
                  stream: false
            example:
              model: claude-opus-4-6-v1messages
              messages:
                - role: user
                  content: What is the weather like in Boston today?
              tools:
                - name: get_current_weather
                  description: Get the current weather in a given location
                  input_schema:
                    type: object
                    properties:
                      location:
                        type: string
                        description: The city and state, e.g. Boston, MA
                    required:
                      - location
              thinkingFlag: true
              stream: false
      responses:
        '200':
          description: Request successful.
          content:
            application/json:
              schema:
                type: object
                properties:
                  role:
                    type: string
                    description: Returned message role
                    examples:
                      - assistant
                  usage:
                    type: object
                    description: Usage information returned by the provider
                    properties:
                      input_tokens:
                        type: integer
                        description: Input token count
                        examples:
                          - 600
                      output_tokens:
                        type: integer
                        description: Output token count
                        examples:
                          - 57
                      cache_creation_input_tokens:
                        type: integer
                        description: Cache creation input token count
                        examples:
                          - 0
                      cache_read_input_tokens:
                        type: integer
                        description: Cache read input token count
                        examples:
                          - 0
                      service_tier:
                        type: string
                        description: Service tier
                        examples:
                          - standard
                    x-apidog-orders:
                      - input_tokens
                      - output_tokens
                      - cache_creation_input_tokens
                      - cache_read_input_tokens
                      - service_tier
                  stop_reason:
                    type: string
                    description: Reason why generation stopped
                    examples:
                      - tool_use
                  model:
                    type: string
                    description: Actual model version returned by the provider
                    examples:
                      - claude-opus-4-5-20251101
                  id:
                    type: string
                    description: Unique message identifier
                    examples:
                      - msg_01VSoxV4a8YWB3DBh9TdM63W
                  credits_consumed:
                    type: number
                    description: Credits consumed by the request
                    examples:
                      - 0.25
                  type:
                    type: string
                    description: Top-level response object type
                    examples:
                      - message
                  content:
                    type: array
                    description: Response content blocks
                    items:
                      type: object
                      properties:
                        input:
                          type: object
                          description: Tool input arguments
                          additionalProperties: true
                          x-apidog-orders: []
                        caller:
                          type: object
                          description: Tool caller metadata
                          properties:
                            type:
                              type: string
                              examples:
                                - direct
                          x-apidog-orders:
                            - type
                        name:
                          type: string
                          description: Tool name
                          examples:
                            - get_current_weather
                        id:
                          type: string
                          description: Tool call identifier
                          examples:
                            - toolu_018gdqs2FHxrRjQHLZv1qvbF
                        type:
                          type: string
                          description: Content block type
                          examples:
                            - tool_use
                      x-apidog-orders:
                        - input
                        - caller
                        - name
                        - id
                        - type
                x-apidog-orders:
                  - role
                  - usage
                  - stop_reason
                  - model
                  - id
                  - credits_consumed
                  - type
                  - content
              example:
                role: assistant
                usage:
                  cache_creation:
                    ephemeral_1h_input_tokens: 0
                    ephemeral_5m_input_tokens: 0
                  output_tokens: 57
                  service_tier: standard
                  cache_creation_input_tokens: 0
                  input_tokens: 600
                  cache_read_input_tokens: 0
                  inference_geo: not_available
                stop_reason: tool_use
                model: claude-opus-4-5-20251101
                id: msg_01VSoxV4a8YWB3DBh9TdM63W
                credits_consumed: 0.25
                type: message
                content:
                  - input:
                      location: Beijing, China
                    caller:
                      type: direct
                    name: get_current_weather
                    id: toolu_018gdqs2FHxrRjQHLZv1qvbF
                    type: tool_use
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid or missing API key
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-30749668-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 균需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 6. Claude Sonnet 4.5 — Native v1/messages

> 출처: https://docs.kie.ai/30749672e0
> 참고: 이 스펙은 다른 v1/messages 모델과 달리 `output_config` 파라미터 (structured output / json_schema)를 추가로 지원합니다.

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude/v1/messages:
    post:
      summary: claude-sonnet-4-5-v1messages
      deprecated: false
      description: >-
        ### Streaming Support


        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE). Claude tool calling responses stream
        `tool_use` blocks and `input_json_delta` fragments.


        **Streaming Response Format:**

        - Content-Type: `text/event-stream`

        - Event names include `message_start`, `content_block_start`,
        `content_block_delta`, `message_delta`, and `message_stop`

        - Tool calls are emitted as `tool_use` content blocks

        - Final stop reason is often `tool_use` for function-calling requests


        ## Features


        - Standard chat with `messages`.

        - Function calling with `tools` and `input_schema`.

        - Optional stream response with Claude events.

        - Optional project-specific thinking flag.


        ## Request Notes


        - Put the current model name in the `model` field.

        - Use `messages` for conversation history.

        - Use `tools` to declare callable functions.

        - Set `stream` to `true` for SSE output.


        ## Authentication


        Use the auth configuration for `X-Api-Key` and `anthropic-version`. Do
        not add them as regular request parameters.
      operationId: claude_sonnet_4_5_v1messages
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: Model name. It must match the current document.
                  enum:
                    - claude-sonnet-4-5-v1messages
                  examples:
                    - claude-sonnet-4-5-v1messages
                messages:
                  type: array
                  description: Conversation messages in chronological order.
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - assistant
                        description: Message role.
                        examples:
                          - user
                      content:
                        oneOf:
                          - type: string
                            description: Plain text content.
                          - type: array
                            description: Structured content blocks.
                            items:
                              type: object
                              additionalProperties: true
                              x-apidog-orders: []
                        description: Message content.
                        examples:
                          - What is the weather like in Boston today?
                    required:
                      - role
                      - content
                    x-apidog-orders:
                      - role
                      - content
                  minItems: 1
                tools:
                  type: array
                  description: >-
                    Optional callable tools. Each tool includes a name,
                    description, and input_schema.
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                        description: Function name.
                        examples:
                          - get_current_weather
                      description:
                        type: string
                        description: Human-readable function description.
                        examples:
                          - Get the current weather in a given location
                      input_schema:
                        type: object
                        description: JSON Schema for function parameters.
                        properties:
                          type:
                            type: string
                            description: Schema type.
                            examples:
                              - object
                          properties:
                            type: object
                            description: Function parameter definitions.
                            additionalProperties: true
                            x-apidog-orders: []
                            properties: {}
                          required:
                            type: array
                            description: Required parameter names.
                            items:
                              type: string
                        x-apidog-orders:
                          - type
                          - properties
                          - required
                        examples:
                          - type: object
                            properties:
                              location:
                                type: string
                                description: The city and state, e.g. Boston, MA
                            required:
                              - location
                    required:
                      - name
                      - description
                      - input_schema
                    x-apidog-orders:
                      - name
                      - description
                      - input_schema
                thinkingFlag:
                  type: boolean
                  description: >-
                    Project-specific thinking flag used by the current Claude
                    adapter.
                  examples:
                    - true
                stream:
                  type: boolean
                  default: true
                  description: If set to true, the response is returned as an SSE stream.
                  examples:
                    - false
                output_config:
                  type: object
                  description: Structured output configuration.
                  properties:
                    format:
                      type: object
                      description: Output format configuration.
                      properties:
                        type:
                          type: string
                          enum:
                            - json_schema
                          description: Structured output type.
                        schema:
                          type: object
                          description: JSON Schema for constrained output.
                          additionalProperties: true
                          x-apidog-orders: []
                          properties: {}
                      x-apidog-orders:
                        - type
                        - schema
                  x-apidog-orders:
                    - format
              required:
                - model
                - messages
              x-apidog-orders:
                - model
                - messages
                - tools
                - thinkingFlag
                - stream
                - output_config
              examples:
                - model: claude-sonnet-4-5-v1messages
                  messages:
                    - role: user
                      content: What is the weather like in Boston today?
                  tools:
                    - name: get_current_weather
                      description: Get the current weather in a given location
                      input_schema:
                        type: object
                        properties:
                          location:
                            type: string
                            description: The city and state, e.g. Boston, MA
                        required:
                          - location
                  thinkingFlag: true
                  stream: false
                  output_config:
                    format:
                      type: json_schema
                      schema:
                        type: object
                        properties:
                          answer:
                            type: string
                        required:
                          - answer
            example:
              model: claude-sonnet-4-5-v1messages
              messages:
                - role: user
                  content: What is the weather like in Boston today?
              tools:
                - name: get_current_weather
                  description: Get the current weather in a given location
                  input_schema:
                    type: object
                    properties:
                      location:
                        type: string
                        description: The city and state, e.g. Boston, MA
                    required:
                      - location
              thinkingFlag: true
              stream: false
              output_config:
                format:
                  type: json_schema
                  schema:
                    type: object
                    properties:
                      answer:
                        type: string
                    required:
                      - answer
      responses:
        '200':
          description: Request successful.
          content:
            application/json:
              schema:
                type: object
                properties:
                  role:
                    type: string
                    description: Returned message role
                    examples:
                      - assistant
                  usage:
                    type: object
                    description: Usage information returned by the provider
                    properties:
                      input_tokens:
                        type: integer
                        description: Input token count
                        examples:
                          - 600
                      output_tokens:
                        type: integer
                        description: Output token count
                        examples:
                          - 57
                      cache_creation_input_tokens:
                        type: integer
                        description: Cache creation input token count
                        examples:
                          - 0
                      cache_read_input_tokens:
                        type: integer
                        description: Cache read input token count
                        examples:
                          - 0
                      service_tier:
                        type: string
                        description: Service tier
                        examples:
                          - standard
                    x-apidog-orders:
                      - input_tokens
                      - output_tokens
                      - cache_creation_input_tokens
                      - cache_read_input_tokens
                      - service_tier
                  stop_reason:
                    type: string
                    description: Reason why generation stopped
                    examples:
                      - tool_use
                  model:
                    type: string
                    description: Actual model version returned by the provider
                    examples:
                      - claude-opus-4-5-20251101
                  id:
                    type: string
                    description: Unique message identifier
                    examples:
                      - msg_01VSoxV4a8YWB3DBh9TdM63W
                  credits_consumed:
                    type: number
                    description: Credits consumed by the request
                    examples:
                      - 0.25
                  type:
                    type: string
                    description: Top-level response object type
                    examples:
                      - message
                  content:
                    type: array
                    description: Response content blocks
                    items:
                      type: object
                      properties:
                        input:
                          type: object
                          description: Tool input arguments
                          additionalProperties: true
                          x-apidog-orders: []
                        caller:
                          type: object
                          description: Tool caller metadata
                          properties:
                            type:
                              type: string
                              examples:
                                - direct
                          x-apidog-orders:
                            - type
                        name:
                          type: string
                          description: Tool name
                          examples:
                            - get_current_weather
                        id:
                          type: string
                          description: Tool call identifier
                          examples:
                            - toolu_018gdqs2FHxrRjQHLZv1qvbF
                        type:
                          type: string
                          description: Content block type
                          examples:
                            - tool_use
                      x-apidog-orders:
                        - input
                        - caller
                        - name
                        - id
                        - type
                x-apidog-orders:
                  - role
                  - usage
                  - stop_reason
                  - model
                  - id
                  - credits_consumed
                  - type
                  - content
              example:
                role: assistant
                usage:
                  cache_creation:
                    ephemeral_1h_input_tokens: 0
                    ephemeral_5m_input_tokens: 0
                  output_tokens: 57
                  service_tier: standard
                  cache_creation_input_tokens: 0
                  input_tokens: 600
                  cache_read_input_tokens: 0
                  inference_geo: not_available
                stop_reason: tool_use
                model: claude-opus-4-5-20251101
                id: msg_01VSoxV4a8YWB3DBh9TdM63W
                credits_consumed: 0.25
                type: message
                content:
                  - input:
                      location: Beijing, China
                    caller:
                      type: direct
                    name: get_current_weather
                    id: toolu_018gdqs2FHxrRjQHLZv1qvbF
                    type: tool_use
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid or missing API key
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-30749672-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 7. Claude Sonnet 4.6 — Native v1/messages

> 출처: https://docs.kie.ai/30749677e0

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /claude/v1/messages:
    post:
      summary: claude-sonnet-4-6-v1messages
      deprecated: false
      description: >-
        ### Streaming Support


        When `stream: true` is set in the request, the API returns responses as
        server-sent events (SSE). Claude tool calling responses stream
        `tool_use` blocks and `input_json_delta` fragments.


        **Streaming Response Format:**

        - Content-Type: `text/event-stream`

        - Event names include `message_start`, `content_block_start`,
        `content_block_delta`, `message_delta`, and `message_stop`

        - Tool calls are emitted as `tool_use` content blocks

        - Final stop reason is often `tool_use` for function-calling requests


        ## Features


        - Standard chat with `messages`.

        - Function calling with `tools` and `input_schema`.

        - Optional stream response with Claude events.

        - Optional project-specific thinking flag.


        ## Request Notes


        - Put the current model name in the `model` field.

        - Use `messages` for conversation history.

        - Use `tools` to declare callable functions.

        - Set `stream` to `true` for SSE output.


        ## Authentication


        Use the auth configuration for `X-Api-Key` and `anthropic-version`. Do
        not add them as regular request parameters.
      operationId: claude_sonnet_4_6_v1messages
      tags:
        - docs/en/Market/Chat  Models/Claude
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: Model name. It must match the current document.
                  enum:
                    - claude-sonnet-4-6-v1messages
                  examples:
                    - claude-sonnet-4-6-v1messages
                messages:
                  type: array
                  description: Conversation messages in chronological order.
                  items:
                    type: object
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - assistant
                        description: Message role.
                        examples:
                          - user
                      content:
                        oneOf:
                          - type: string
                            description: Plain text content.
                          - type: array
                            description: Structured content blocks.
                            items:
                              type: object
                              additionalProperties: true
                              x-apidog-orders: []
                        description: Message content.
                        examples:
                          - What is the weather like in Boston today?
                    required:
                      - role
                      - content
                    x-apidog-orders:
                      - role
                      - content
                  minItems: 1
                tools:
                  type: array
                  description: >-
                    Optional callable tools. Each tool includes a name,
                    description, and input_schema.
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                        description: Function name.
                        examples:
                          - get_current_weather
                      description:
                        type: string
                        description: Human-readable function description.
                        examples:
                          - Get the current weather in a given location
                      input_schema:
                        type: object
                        description: JSON Schema for function parameters.
                        properties:
                          type:
                            type: string
                            description: Schema type.
                            examples:
                              - object
                          properties:
                            type: object
                            description: Function parameter definitions.
                            additionalProperties: true
                            x-apidog-orders: []
                            properties: {}
                          required:
                            type: array
                            description: Required parameter names.
                            items:
                              type: string
                        x-apidog-orders:
                          - type
                          - properties
                          - required
                        examples:
                          - type: object
                            properties:
                              location:
                                type: string
                                description: The city and state, e.g. Boston, MA
                            required:
                              - location
                    required:
                      - name
                      - description
                      - input_schema
                    x-apidog-orders:
                      - name
                      - description
                      - input_schema
                thinkingFlag:
                  type: boolean
                  description: >-
                    Project-specific thinking flag used by the current Claude
                    adapter.
                  examples:
                    - true
                stream:
                  type: boolean
                  default: true
                  description: If set to true, the response is returned as an SSE stream.
                  examples:
                    - false
              required:
                - model
                - messages
              x-apidog-orders:
                - model
                - messages
                - tools
                - thinkingFlag
                - stream
              examples:
                - model: claude-sonnet-4-6-v1messages
                  messages:
                    - role: user
                      content: What is the weather like in Boston today?
                  tools:
                    - name: get_current_weather
                      description: Get the current weather in a given location
                      input_schema:
                        type: object
                        properties:
                          location:
                            type: string
                            description: The city and state, e.g. Boston, MA
                        required:
                          - location
                  thinkingFlag: true
                  stream: false
            example:
              model: claude-sonnet-4-6-v1messages
              messages:
                - role: user
                  content: What is the weather like in Boston today?
              tools:
                - name: get_current_weather
                  description: Get the current weather in a given location
                  input_schema:
                    type: object
                    properties:
                      location:
                        type: string
                        description: The city and state, e.g. Boston, MA
                    required:
                      - location
              thinkingFlag: true
              stream: false
      responses:
        '200':
          description: Request successful.
          content:
            application/json:
              schema:
                type: object
                properties:
                  role:
                    type: string
                    description: Returned message role
                    examples:
                      - assistant
                  usage:
                    type: object
                    description: Usage information returned by the provider
                    properties:
                      input_tokens:
                        type: integer
                        description: Input token count
                        examples:
                          - 600
                      output_tokens:
                        type: integer
                        description: Output token count
                        examples:
                          - 57
                      cache_creation_input_tokens:
                        type: integer
                        description: Cache creation input token count
                        examples:
                          - 0
                      cache_read_input_tokens:
                        type: integer
                        description: Cache read input token count
                        examples:
                          - 0
                      service_tier:
                        type: string
                        description: Service tier
                        examples:
                          - standard
                    x-apidog-orders:
                      - input_tokens
                      - output_tokens
                      - cache_creation_input_tokens
                      - cache_read_input_tokens
                      - service_tier
                  stop_reason:
                    type: string
                    description: Reason why generation stopped
                    examples:
                      - tool_use
                  model:
                    type: string
                    description: Actual model version returned by the provider
                    examples:
                      - claude-opus-4-5-20251101
                  id:
                    type: string
                    description: Unique message identifier
                    examples:
                      - msg_01VSoxV4a8YWB3DBh9TdM63W
                  credits_consumed:
                    type: number
                    description: Credits consumed by the request
                    examples:
                      - 0.25
                  type:
                    type: string
                    description: Top-level response object type
                    examples:
                      - message
                  content:
                    type: array
                    description: Response content blocks
                    items:
                      type: object
                      properties:
                        input:
                          type: object
                          description: Tool input arguments
                          additionalProperties: true
                          x-apidog-orders: []
                        caller:
                          type: object
                          description: Tool caller metadata
                          properties:
                            type:
                              type: string
                              examples:
                                - direct
                          x-apidog-orders:
                            - type
                        name:
                          type: string
                          description: Tool name
                          examples:
                            - get_current_weather
                        id:
                          type: string
                          description: Tool call identifier
                          examples:
                            - toolu_018gdqs2FHxrRjQHLZv1qvbF
                        type:
                          type: string
                          description: Content block type
                          examples:
                            - tool_use
                      x-apidog-orders:
                        - input
                        - caller
                        - name
                        - id
                        - type
                x-apidog-orders:
                  - role
                  - usage
                  - stop_reason
                  - model
                  - id
                  - credits_consumed
                  - type
                  - content
              example:
                role: assistant
                usage:
                  cache_creation:
                    ephemeral_1h_input_tokens: 0
                    ephemeral_5m_input_tokens: 0
                  output_tokens: 57
                  service_tier: standard
                  cache_creation_input_tokens: 0
                  input_tokens: 600
                  cache_read_input_tokens: 0
                  inference_geo: not_available
                stop_reason: tool_use
                model: claude-opus-4-5-20251101
                id: msg_01VSoxV4a8YWB3DBh9TdM63W
                credits_consumed: 0.25
                type: message
                content:
                  - input:
                      location: Beijing, China
                    caller:
                      type: direct
                    name: get_current_weather
                    id: toolu_018gdqs2FHxrRjQHLZv1qvbF
                    type: tool_use
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid request parameters
                      type:
                        type: string
                        examples:
                          - invalid_request_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      message:
                        type: string
                        examples:
                          - Invalid or missing API key
                      type:
                        type: string
                        examples:
                          - authentication_error
                    x-apidog-orders:
                      - message
                      - type
                x-apidog-orders:
                  - error
          headers: {}
          x-apidog-name: ''
      security: []
      x-apidog-folder: docs/en/Market/Chat  Models/Claude
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-30749677-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 8. Get Task Details — 공통 태스크 조회

> 출처: https://docs.kie.ai/market/common/get-task-detail

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/recordInfo:
    get:
      summary: Get Task Details
      deprecated: false
      description: >-
        Query the status and results of any task created in the Market models.
        This is a unified query interface that works with all models under the
        Market category.


        ### Supported Models

        This endpoint works with all Market models including:

        - **Seedream**: seedream, seedream-v4-text-to-image, etc.

        - **Grok Imagine**: text-to-image, image-to-video, text-to-video,
        upscale

        - **Kling**: text-to-video, image-to-video models

        - **ElevenLabs**: Audio processing models

        - **Claude**: Language models

        - **And any future models added to the Market**


        ### Task States

        - **waiting**: Task is queued and waiting to be processed

        - **queuing**: Task is in the processing queue

        - **generating**: Task is currently being processed

        - **success**: Task completed successfully

        - **fail**: Task failed


        ### Best Practices

        - **Use callbacks for production**: Include `callBackUrl` when creating
        tasks to avoid polling

        - **Implement exponential backoff**: Start with 2-3 second intervals,
        increase gradually

        - **Handle timeouts**: Stop polling after 10-15 minutes

        - **Download results immediately**: Generated content URLs typically
        expire after 24 hours
      operationId: get-task-details
      tags:
        - docs/en/Market
      parameters:
        - name: taskId
          in: query
          description: The unique task identifier returned when you created the task.
          required: true
          schema:
            type: string
            examples:
              - task_12345678
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - &ref_0
                    $ref: '#/components/schemas/ApiResponse'
                  - type: object
                    properties:
                      data:
                        type: object
                        description: The task data object containing all task information
                        properties:
                          taskId:
                            type: string
                            description: The unique identifier for this task
                            examples:
                              - task_12345678
                          model:
                            type: string
                            description: >-
                              The model used for this task (e.g.,
                              grok-imagine/text-to-image, seedream-4.0,
                              kling-1.0)
                            examples:
                              - grok-imagine/text-to-image
                          state:
                            type: string
                            description: Current state of the task
                            enum:
                              - waiting
                              - queuing
                              - generating
                              - success
                              - fail
                            examples:
                              - success
                          param:
                            type: string
                            description: >-
                              JSON string containing the original request
                              parameters used to create the task
                            examples:
                              - >-
                                {"model":"grok-imagine/text-to-image","callBackUrl":"https://your-domain.com/api/callback","input":{"prompt":"Cinematic
                                portrait...","aspect_ratio":"3:2"}}
                          resultJson:
                            type: string
                            description: >-
                              JSON string containing the generated content URLs.
                              Only present when state is success. Structure
                              depends on outputMediaType: {resultUrls: []} for
                              image/media/video, {resultObject: {}} for text
                            examples:
                              - >-
                                {"resultUrls":["https://example.com/generated-content.jpg"]}
                          failCode:
                            type: string
                            description: >-
                              Error code if the task failed. Empty string if
                              successful
                            examples:
                              - ''
                          failMsg:
                            type: string
                            description: >-
                              Error message if the task failed. Empty string if
                              successful
                            examples:
                              - ''
                          costTime:
                            type: integer
                            format: int64
                            description: >-
                              Processing time in milliseconds (available when
                              successful)
                            examples:
                              - 15000
                          completeTime:
                            type: integer
                            format: int64
                            description: >-
                              Completion timestamp (Unix timestamp in
                              milliseconds)
                            examples:
                              - 1698765432000
                          createTime:
                            type: integer
                            format: int64
                            description: >-
                              Creation timestamp (Unix timestamp in
                              milliseconds)
                            examples:
                              - 1698765400000
                          updateTime:
                            type: integer
                            format: int64
                            description: Update timestamp (Unix timestamp in milliseconds)
                            examples:
                              - 1698765432000
                          progress:
                            type: integer
                            description: >-
                              Generation progress (0-100). Only returned when
                              model is sora2 or sora2 pro.
                            minimum: 0
                            maximum: 100
                            examples:
                              - 45
                        x-apidog-orders:
                          - taskId
                          - model
                          - state
                          - param
                          - resultJson
                          - failCode
                          - failMsg
                          - costTime
                          - completeTime
                          - createTime
                          - updateTime
                          - progress
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: task_12345678
                  model: grok-imagine/text-to-image
                  state: success
                  param: >-
                    {"model":"grok-imagine/text-to-image","callBackUrl":"https://your-domain.com/api/callback","input":{"prompt":"Cinematic
                    portrait...","aspect_ratio":"3:2"}}
                  resultJson: '{"resultUrls":["https://example.com/generated-content.jpg"]}'
                  failCode: ''
                  failMsg: ''
                  costTime: 15000
                  completeTime: 1698765432000
                  createTime: 1698765400000
                  updateTime: 1698765432000
          headers: {}
          x-apidog-name: ''
        '400':
          description: Bad Request - Missing or invalid taskId parameter
          content:
            application/json:
              schema: *ref_0
              example:
                code: 400
                msg: taskId parameter is required
          headers: {}
          x-apidog-name: ''
        '401':
          description: Unauthorized - Invalid or missing API key
          content:
            application/json:
              schema: *ref_0
              example:
                code: 401
                msg: Unauthorized
          headers: {}
          x-apidog-name: ''
        '404':
          description: Task Not Found - The specified taskId does not exist
          content:
            application/json:
              schema: *ref_0
              example:
                code: 404
                msg: Task not found
          headers: {}
          x-apidog-name: ''
        '422':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                  msg:
                    type: string
                  data:
                    type: 'null'
                required:
                  - code
                  - msg
                  - data
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 422
                msg: recordInfo is null
                data: null
          headers: {}
          x-apidog-name: ''
        '429':
          description: Rate Limited - Too many requests
          content:
            application/json:
              schema: *ref_0
              example:
                code: 429
                msg: Rate limit exceeded
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506351-run
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 455
            - 500
            - 501
            - 505
          description: >-
            Response status code


            - **200**: Success - Request has been processed successfully

            - **401**: Unauthorized - Authentication credentials are missing or
            invalid

            - **402**: Insufficient Credits - Account does not have enough
            credits to perform the operation

            - **404**: Not Found - The requested resource or endpoint does not
            exist

            - **422**: Validation Error - The request parameters failed
            validation checks

            - **429**: Rate Limited - Request limit has been exceeded for this
            resource

            - **455**: Service Unavailable - System is currently undergoing
            maintenance

            - **500**: Server Error - An unexpected error occurred while
            processing the request

            - **501**: Generation Failed - Content generation task failed

            - **505**: Feature Disabled - The requested feature is currently
            disabled
        msg:
          type: string
          description: Response message, error description when failed
          examples:
            - success
        data:
          type: object
          properties:
            taskId:
              type: string
              description: >-
                Task ID, can be used with Get Task Details endpoint to query
                task status
          x-apidog-orders:
            - taskId
          required:
            - taskId
          x-apidog-ignore-properties: []
      title: response not with recordId
      x-apidog-orders:
        - code
        - msg
        - data
      required:
        - data
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```

---

## 원본 페이지 URL 전체 목록

| 섹션 | docs.kie.ai URL |
|------|-----------------|
| Claude Sonnet 4.5 (Chat Completions) | https://docs.kie.ai/market/claude/claude-sonnet-4-5 |
| Claude Opus 4.5 (Chat Completions) | https://docs.kie.ai/market/claude/claude-opus-4-5 |
| Claude Haiku 4.5 (v1/messages) | https://docs.kie.ai/30749621e0 |
| Claude Opus 4.5 (v1/messages) | https://docs.kie.ai/30749665e0 |
| Claude Opus 4.6 (v1/messages) | https://docs.kie.ai/30749668e0 |
| Claude Sonnet 4.5 (v1/messages) | https://docs.kie.ai/30749672e0 |
| Claude Sonnet 4.6 (v1/messages) | https://docs.kie.ai/30749677e0 |
| Get Task Details (공통) | https://docs.kie.ai/market/common/get-task-detail |

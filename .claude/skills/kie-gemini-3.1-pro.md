📌 Kie Gemini 3.1 Pro 기술문서 (OpenAPI 원본)

원본: https://docs.kie.ai/market/gemini/gemini-3-1-pro + https://docs.kie.ai/market/get-task-details
확인일: 2026-03-14
형식: OpenAPI 3.0.1 Specification (원문 무삭제·무축약)

---

# Gemini 3.1 Pro

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /gemini-3.1-pro/v1/chat/completions:
    post:
      summary: Gemini 3.1 Pro
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
        When using function calling, you can define multiple functions in the
        array.


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
      operationId: gemini-3.1-pro-chat-completions
      tags:
        - docs/en/Market/Chat  Models/Gemini
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
                    An optional array of tools the model may call. The array can
                    contain multiple objects.

                    **Google Search**: `{"type": "function", "function":
                    {"name": "googleSearch"}}` - Enables real-time information
                    retrieval via Google Search.
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
                  response_format:
                    type: json_schema
                    properties:
                      response:
                        type: string
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
          description: 'Request successful. '
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
                      - gemini-3-pro
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
      x-apidog-folder: docs/en/Market/Chat  Models/Gemini
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-30442144-run
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

# Get Task Details

## OpenAPI Specification

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

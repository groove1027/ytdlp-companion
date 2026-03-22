# KIE.AI API Technical Documentation

## Google Nano Banana 2 & Get Task Details

---

> **Sources:**
> - https://docs.kie.ai/market/google/nanobanana2
> - https://docs.kie.ai/market/common/get-task-detail

---

# Part 1: Google - Nano Banana 2

Image generation by Nano Banana 2

## Query Task Status

After submitting a task, use the unified query endpoint to check progress and retrieve results:

> **Get Task Details** — Learn how to query task status and retrieve generation results
> → /market/common/get-task-detail

> **Tip:** For production use, we recommend using the `callBackUrl` parameter to receive automatic notifications when generation completes, rather than polling the status endpoint.

## Related Resources

- **Market Overview** — Explore all available models → /market/quickstart
- **Common API** — Check credits and account usage → /common-api/get-account-credits

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Google - Nano Banana 2
      deprecated: false
      description: >
        Image generation by Nano Banana 2

        ## Query Task Status

        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:

        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and retrieve generation results
        </Card>

        ::: tip[]
        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.
        :::

        ## Related Resources

        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Explore all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check credits and account usage
          </Card>
        </CardGroup>
      tags:
        - docs/en/Market/Image Models/Google
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  enum:
                    - nano-banana-2
                  default: nano-banana-2
                  description: |-
                    The model name to use for generation. Required field.
                    - Must be `nano-banana-2` for this endpoint
                  examples:
                    - nano-banana-2
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        A text description of the image you want to generate
                        (Max length: 20000 characters)
                      maxLength: 20000
                      examples:
                        - >-
                          Comic poster: cool banana hero in shades leaps from
                          sci-fi pad. Six panels: 1) 4K mountain landscape, 2)
                          banana holds page of long multilingual text with auto
                          translation, 3) Gemini 3 hologram for
                          search/knowledge/reasoning, 4) camera UI sliders for
                          angle focus color, 5) frame trio 1:1-9:16, 6)
                          consistent banana poses. Footer shows Google icons.
                          Tagline: Nano Banana Pro now on Kie AI.
                    image_input:
                      description: >-
                        Input images to transform or use as reference (supports
                        up to 14 images) (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 30.0MB)
                      type: array
                      items:
                        type: string
                        format: uri
                      maxItems: 14
                      examples:
                        - []
                    google_search:
                      type: boolean
                      title: Google Search
                      default: false
                      description: >-
                        Use Google Web Search grounding to generate images based
                        on real-time information (e.g. weather, sports scores,
                        recent events).
                    aspect_ratio:
                      type: string
                      description: Aspect ratio of the generated image
                      enum:
                        - '1:1'
                        - '1:4'
                        - '1:8'
                        - '2:3'
                        - '3:2'
                        - '3:4'
                        - '4:1'
                        - '4:3'
                        - '4:5'
                        - '5:4'
                        - '8:1'
                        - '9:16'
                        - '16:9'
                        - '21:9'
                        - auto
                      default: auto
                      examples:
                        - '1:1'
                    resolution:
                      description: Resolution of the generated image
                      type: string
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      default: 1K
                      examples:
                        - 1K
                    output_format:
                      description: Format of the output image
                      type: string
                      enum:
                        - png
                        - jpg
                      default: jpg
                      examples:
                        - jpg
                  required:
                    - prompt
                  x-apidog-orders:
                    - prompt
                    - image_input
                    - google_search
                    - aspect_ratio
                    - resolution
                    - output_format
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              x-apidog-ignore-properties: []
            example:
              model: nano-banana-2
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Comic poster: cool banana hero in shades leaps from sci-fi
                  pad. Six panels: 1) 4K mountain landscape, 2) banana holds
                  page of long multilingual text with auto translation, 3)
                  Gemini 3 hologram for search/knowledge/reasoning, 4) camera
                  UI sliders for angle focus color, 5) frame trio 1:1-9:16, 6)
                  consistent banana poses. Footer shows Google icons. Tagline:
                  Nano Banana Pro now on Kie AI.
                image_input: []
                google_search: true
                aspect_ratio: auto
                resolution: 1K
                output_format: png
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apidog-orders: []
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: 成功
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
      x-apidog-folder: docs/en/Market/Image Models/Google
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28711567-run
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

# Part 2: Get Task Details

Query the status and results of any task created in the Market models. This is a unified query interface that works with all models under the Market category.

### Supported Models

This endpoint works with all Market models including:

- **Seedream**: seedream, seedream-v4-text-to-image, etc.
- **Grok Imagine**: text-to-image, image-to-video, text-to-video, upscale
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

- **Use callbacks for production**: Include `callBackUrl` when creating tasks to avoid polling
- **Implement exponential backoff**: Start with 2-3 second intervals, increase gradually
- **Handle timeouts**: Stop polling after 10-15 minutes
- **Download results immediately**: Generated content URLs typically expire after 24 hours

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
          description: >-
            The unique task identifier returned when you created the task.
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
                        description: >-
                          The task data object containing all task information
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
                            description: >-
                              Update timestamp (Unix timestamp in milliseconds)
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
                  resultJson: >-
                    {"resultUrls":["https://example.com/generated-content.jpg"]}
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

# Appendix: Complete Workflow

## Step 1: Create Image Generation Task

**Endpoint:** `POST https://api.kie.ai/api/v1/jobs/createTask`

**Request:**
```bash
curl --request POST \
  --url https://api.kie.ai/api/v1/jobs/createTask \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "nano-banana-2",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "prompt": "Comic poster: cool banana hero in shades leaps from sci-fi pad. Six panels: 1) 4K mountain landscape, 2) banana holds page of long multilingual text with auto translation, 3) Gemini 3 hologram for search/knowledge/reasoning, 4) camera UI sliders for angle focus color, 5) frame trio 1:1-9:16, 6) consistent banana poses. Footer shows Google icons. Tagline: Nano Banana Pro now on Kie AI.",
      "image_input": [],
      "google_search": true,
      "aspect_ratio": "auto",
      "resolution": "1K",
      "output_format": "png"
    }
  }'
```

## Step 2: Query Task Status

**Endpoint:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`

**Request:**
```bash
curl --request GET \
  --url 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_12345678' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

**Response (200 - success):**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_12345678",
    "model": "grok-imagine/text-to-image",
    "state": "success",
    "param": "{\"model\":\"grok-imagine/text-to-image\",\"callBackUrl\":\"https://your-domain.com/api/callback\",\"input\":{\"prompt\":\"Cinematic portrait...\",\"aspect_ratio\":\"3:2\"}}",
    "resultJson": "{\"resultUrls\":[\"https://example.com/generated-content.jpg\"]}",
    "failCode": "",
    "failMsg": "",
    "costTime": 15000,
    "completeTime": 1698765432000,
    "createTime": 1698765400000,
    "updateTime": 1698765432000
  }
}
```

## Task State Flow

```
waiting → queuing → generating → success
                              ↘ fail
```

- **waiting**: Task is queued and waiting to be processed
- **queuing**: Task is in the processing queue
- **generating**: Task is currently being processed
- **success**: Task completed successfully
- **fail**: Task failed

## Authentication

All APIs require Bearer Token authentication.

1. Visit [API Key Management Page](https://kie.ai/api-key) to get your API Key
2. Add to request header: `Authorization: Bearer YOUR_API_KEY`

## Error Codes Reference

| Code | Type | Description |
|------|------|-------------|
| 200 | Success | Request has been processed successfully |
| 400 | Bad Request | Missing or invalid parameters |
| 401 | Unauthorized | Authentication credentials are missing or invalid |
| 402 | Insufficient Credits | Account does not have enough credits |
| 404 | Not Found | The requested resource or endpoint does not exist |
| 422 | Validation Error | The request parameters failed validation checks |
| 429 | Rate Limited | Request limit has been exceeded |
| 455 | Service Unavailable | System is currently undergoing maintenance |
| 500 | Server Error | An unexpected error occurred |
| 501 | Generation Failed | Content generation task failed |
| 505 | Feature Disabled | The requested feature is currently disabled |

---

*Document generated from KIE.AI official documentation*
*Sources: docs.kie.ai*

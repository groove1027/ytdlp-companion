# KIE.AI API Technical Documentation

## Grok Imagine Image to Video & Get Task Details

---

> **Sources:**
> - https://docs.kie.ai/market/grok-imagine/image-to-video
> - https://docs.kie.ai/market/common/get-task-detail

---

# Part 1: Grok Imagine Image to Video

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
      summary: Grok Imagine Image to Video
      deprecated: false
      description: >
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
      operationId: grok-imagine-image-to-video
      tags:
        - docs/en/Market/Video Models/Grok Imagine
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  enum:
                    - grok-imagine/image-to-video
                  default: grok-imagine/image-to-video
                  description: |-
                    The model name to use for generation. Required field.
                    - Must be `grok-imagine/image-to-video` for this endpoint
                  examples:
                    - grok-imagine/image-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive video generation task completion updates.
                    Optional but recommended for production use.

                    - System will POST task status and results to this URL when
                    video generation completes

                    - Callback includes generated video URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing video results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the video generation task
                  properties:
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Provide one external image URL as reference for video
                        generation. Only one image is supported. Do not use with
                        task_id.

                        - Supports JPEG, PNG, WEBP formats

                        - Maximum file size: 10MB per image

                        - Spicy mode not available when using external images

                        - Array should contain exactly one URL
                      maxItems: 1
                      examples:
                        - - >-
                            https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png
                    task_id:
                      type: string
                      description: >-
                        Task ID from a previously generated Grok image. Use with
                        index to select a specific image. Do not use with
                        image_urls.

                        - Use task ID from grok-imagine/text-to-image
                        generations

                        - Supports all modes including Spicy

                        - Maximum length: 100 characters
                      maxLength: 100
                      examples:
                        - task_grok_12345678
                    index:
                      type: integer
                      description: >-
                        When using task_id, specify which image to use (Grok
                        generates 6 images per task). Only works with task_id.

                        - 0-based index (0-5)

                        - Ignored if image_urls is provided

                        - Default: 0
                      minimum: 0
                      maximum: 5
                      default: 0
                      examples:
                        - 0
                    prompt:
                      type: string
                      description: >-
                        Text prompt describing the desired video motion. Optional
                        field.

                        - Should be detailed and specific about the desired
                        visual motion

                        - Describe movement, action sequences, camera work, and
                        timing

                        - Include details about subjects, environments, and
                        motion dynamics

                        - Maximum length: 5000 characters

                        - Supports English language prompts
                      examples:
                        - >-
                          POV hand comes into frame handing the girl a cup of
                          take away coffee, the girl steps out of the screen
                          looking tired, then takes it and she says happily:
                          "thanks! Back to work" she exits the frame and walks
                          right to a different part of the office.
                    mode:
                      type: string
                      description: >-
                        Specifies the generation mode affecting the style and
                        intensity of motion. Note: Spicy mode is not available
                        for external image inputs.

                        - **fun**: More creative and playful interpretation

                        - **normal**: Balanced approach with good motion quality

                        - **spicy**: More dynamic and intense motion effects
                        (not available for external images)

                        Default: normal
                      enum:
                        - fun
                        - normal
                        - spicy
                      default: normal
                      examples:
                        - normal
                    duration:
                      type: string
                      description: The duration of the generated video in seconds
                      enum:
                        - '6'
                        - '10'
                        - '15'
                      x-apidog-enum:
                        - value: '6'
                          name: ''
                          description: ''
                        - value: '10'
                          name: ''
                          description: ''
                        - value: '15'
                          name: ''
                          description: ''
                      default: '6'
                      examples:
                        - '6'
                    resolution:
                      type: string
                      description: The resolution of the generated video.
                      enum:
                        - 480p
                        - 720p
                      x-apidog-enum:
                        - value: 480p
                          name: ''
                          description: ''
                        - value: 720p
                          name: ''
                          description: ''
                      default: 480p
                      examples:
                        - 480p
                  x-apidog-orders:
                    - image_urls
                    - task_id
                    - index
                    - prompt
                    - mode
                    - duration
                    - resolution
                  x-apidog-ignore-properties: []
              required:
                - model
                - input
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              examples:
                - model: grok-imagine/image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    image_urls:
                      - >-
                        https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png
                    prompt: >-
                      POV hand comes into frame handing the girl a cup of take
                      away coffee, the girl steps out of the screen looking
                      tired, then takes it and she says happily: "thanks! Back
                      to work" she exits the frame and walks right to a
                      different part of the office.
                    mode: normal
              x-apidog-ignore-properties: []
            example:
              model: grok-imagine/image-to-video
              callBackUrl: https://your-domain.com/api/callback
              input:
                task_id: task_grok_12345678
                image_urls:
                  - >-
                    https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png
                prompt: >-
                  POV hand comes into frame handing the girl a cup of take away
                  coffee, the girl steps out of the screen looking tired, then
                  takes it and she says happily: "thanks! Back to work" she
                  exits the frame and walks right to a different part of the
                  office.
                mode: normal
                duration: '6'
                resolution: 480p
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/ApiResponse'
              example:
                code: 200
                msg: success
                data:
                  taskId: 281e5b0*********************f39b9
          headers: {}
          x-apidog-name: ''
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
      x-apidog-folder: docs/en/Market/Video Models/Grok Imagine
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506396-run
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

# Part 2: Get Task Details

> **Source:** https://docs.kie.ai/market/common/get-task-detail

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
                              - grok-imagine/image-to-video
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
                                {"model":"grok-imagine/image-to-video","callBackUrl":"https://your-domain.com/api/callback","input":{"image_urls":["https://example.com/image.png"],"prompt":"A cat walking...","mode":"normal"}}
                          resultJson:
                            type: string
                            description: >-
                              JSON string containing the generated content URLs.
                              Only present when state is success. Structure
                              depends on outputMediaType: {resultUrls: []} for
                              image/media/video, {resultObject: {}} for text
                            examples:
                              - >-
                                {"resultUrls":["https://example.com/generated-video.mp4"]}
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
                  model: grok-imagine/image-to-video
                  state: success
                  param: >-
                    {"model":"grok-imagine/image-to-video","callBackUrl":"https://your-domain.com/api/callback","input":{"image_urls":["https://example.com/image.png"],"prompt":"A cat walking...","mode":"normal"}}
                  resultJson: >-
                    {"resultUrls":["https://example.com/generated-video.mp4"]}
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

## Step 1: Create Video Generation Task (with External Image)

**Endpoint:** `POST https://api.kie.ai/api/v1/jobs/createTask`

**Request:**
```bash
curl --request POST \
  --url https://api.kie.ai/api/v1/jobs/createTask \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "grok-imagine/image-to-video",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "image_urls": [
        "https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png"
      ],
      "prompt": "POV hand comes into frame handing the girl a cup of take away coffee, the girl steps out of the screen looking tired, then takes it and she says happily: \"thanks! Back to work\" she exits the frame and walks right to a different part of the office.",
      "mode": "normal",
      "duration": "6",
      "resolution": "480p"
    }
  }'
```

**Response (200):**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "281e5b0*********************f39b9"
  }
}
```

## Step 1b: Create Video from Previous Grok Image Task

**Request:**
```bash
curl --request POST \
  --url https://api.kie.ai/api/v1/jobs/createTask \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "grok-imagine/image-to-video",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "task_id": "task_grok_12345678",
      "index": 0,
      "prompt": "The character starts walking forward slowly",
      "mode": "spicy",
      "duration": "10",
      "resolution": "720p"
    }
  }'
```

## Step 2: Query Task Status

**Endpoint:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`

**Request:**
```bash
curl --request GET \
  --url 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=281e5b0*********************f39b9' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

**Response (200 - success):**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "281e5b0*********************f39b9",
    "model": "grok-imagine/image-to-video",
    "state": "success",
    "param": "{\"model\":\"grok-imagine/image-to-video\",\"callBackUrl\":\"https://your-domain.com/api/callback\",\"input\":{\"image_urls\":[\"https://example.com/image.png\"],\"prompt\":\"A cat walking...\",\"mode\":\"normal\"}}",
    "resultJson": "{\"resultUrls\":[\"https://example.com/generated-video.mp4\"]}",
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
| 401 | Unauthorized | Authentication credentials are missing or invalid |
| 402 | Insufficient Credits | Account does not have enough credits |
| 404 | Not Found | The requested resource or endpoint does not exist |
| 422 | Validation Error | The request parameters failed validation checks |
| 429 | Rate Limited | Request limit has been exceeded |
| 455 | Service Unavailable | System is currently undergoing maintenance |
| 500 | Server Error | An unexpected error occurred |
| 501 | Generation Failed | Content generation task failed |
| 505 | Feature Disabled | The requested feature is currently disabled |

## Input Methods Comparison

| Method | Parameter | Spicy Mode | Notes |
|--------|-----------|------------|-------|
| External Image | `image_urls` | ❌ Not Available | Supports JPEG, PNG, WEBP (max 10MB) |
| Grok Task Reference | `task_id` + `index` | ✅ Available | Uses previous grok-imagine/text-to-image result (index 0-5) |

---

*Document generated from KIE.AI official documentation*
*Sources: docs.kie.ai*

# EvoLink.AI API Technical Documentation

## Veo3.1-Pro Video Generation & Query Task Status

---

> **Source:** https://docs.evolink.ai/en/api-manual/video-series/veo3.1/veo3.1-pro-video-generate

---

# Veo3.1-Pro Video Generation Lite

> - Veo 3.1 Pro (veo3.1-pro) model supports text-to-video, first-and-last-frame image-to-video and other modes
> - Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
> - Generated video links are valid for 24 hours, please save them promptly

## OpenAPI Specification

```yaml
openapi: 3.1.0
info:
  title: veo3.1-pro Interface
  description: >-
    Use AI models to create video generation tasks, supporting text-to-video,
    image-to-video and other generation modes
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Video Generation
    description: AI video generation related APIs
paths:
  /v1/videos/generations:
    post:
      tags:
        - Video Generation
      summary: veo3.1-pro Interface
      description: >-
        - Veo 3.1 Pro (veo3.1-pro) model supports text-to-video,
        first-and-last-frame image-to-video and other modes

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated video links are valid for 24 hours, please save them
        promptly
      operationId: createVideoGeneration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VideoGenerationRequest'
            examples:
              text_to_video:
                summary: Text to Video
                value:
                  model: veo3.1-pro
                  prompt: A cat playing piano
      responses:
        '200':
          description: Video generation task created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/VideoGenerationResponse'
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 400
                  message: Invalid duration parameter
                  type: invalid_request_error
                  param: duration
                  fallback_suggestion: use duration between 1-12 seconds
        '401':
          description: Unauthorized, invalid or expired token
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 401
                  message: Invalid or expired token
                  type: authentication_error
        '402':
          description: Insufficient quota, recharge required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 402
                  message: Insufficient quota
                  type: insufficient_quota_error
                  fallback_suggestion: https://evolink.ai/dashboard/billing
        '403':
          description: Access denied
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 403
                  message: Access denied for this model
                  type: permission_error
                  param: model
        '404':
          description: Resource not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 404
                  message: Specified model not found
                  type: not_found_error
                  param: model
                  fallback_suggestion: veo3.1-pro
        '413':
          description: Request entity too large
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 413
                  message: Image file too large
                  type: request_too_large_error
                  param: image_urls
                  fallback_suggestion: compress image to under 4MB
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 429
                  message: Rate limit exceeded
                  type: rate_limit_error
                  fallback_suggestion: retry after 60 seconds
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 500
                  message: Internal server error
                  type: internal_server_error
                  fallback_suggestion: try again later
        '502':
          description: Upstream service error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 502
                  message: Upstream AI service unavailable
                  type: upstream_error
                  fallback_suggestion: try different model
        '503':
          description: Service temporarily unavailable
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 503
                  message: Service temporarily unavailable
                  type: service_unavailable_error
                  fallback_suggestion: retry after 30 seconds
components:
  schemas:
    VideoGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: Video generation model name
          enum:
            - veo3.1-pro
          default: veo3.1-pro
          example: veo3.1-pro
        prompt:
          type: string
          description: >-
            Prompt describing what kind of video to generate, limited to 2000
            tokens
          example: A cat playing piano
          maxLength: 2000
        aspect_ratio:
          type: string
          description: >-
            Video aspect ratio. When set to `auto`: image-to-video will
            automatically select based on the input image ratio, text-to-video
            will automatically select based on the prompt content
          enum:
            - auto
            - '16:9'
            - '9:16'
          default: auto
          example: auto
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-video feature

            **Note:**
            - Single request supports up to `2` images (1 image for first-frame
            video generation, 2 images for first-and-last-frame video
            generation)
            - Image size: no more than `10MB`
            - Supported file formats: `.jpg`, `.jpeg`, `.png`, `.webp`
            - Image URLs must be directly viewable by the server, or the image
            URL should trigger direct download when accessed (typically these
            URLs end with image file extensions, such as `.png`, `.jpg`)
          items:
            type: string
            format: uri
          maxItems: 2
          example:
            - http://example.com/image1.jpg
        quality:
          type: string
          description: Video resolution, default is `720p`
          enum:
            - 720p
            - 1080p
            - 4k
        generation_type:
          type: string
          description: >-
            Video generation mode, default matches based on image count, manual
            selection recommended. Available modes:

            - `TEXT`: Text to video

            - `FIRST&LAST`: First and last frame to video, supports `1`~`2`
            images
          enum:
            - TEXT
            - FIRST&LAST
        enhance_prompt:
          type: boolean
          description: >-
            Whether to automatically translate the prompt to English. When
            enabled, non-English prompts will be automatically translated to
            English for better generation results
          default: true
          example: true
        callback_url:
          type: string
          description: >-
            HTTPS callback address after task completion

            **Callback Timing:**
            - Triggered when task is completed, failed, or cancelled
            - Sent after billing confirmation is completed

            **Security Restrictions:**
            - Only HTTPS protocol is supported
            - Callback to internal IP addresses is prohibited (127.0.0.1,
            10.x.x.x, 172.16-31.x.x, 192.168.x.x, etc.)
            - URL length must not exceed `2048` characters

            **Callback Mechanism:**
            - Timeout: `10` seconds
            - Maximum `3` retries on failure (retries after `1` second/`2`
            seconds/`4` seconds)
            - Callback response body format is consistent with the task query
            API response format
            - Callback address returning 2xx status code is considered
            successful, other status codes will trigger retry
          format: uri
          example: https://your-domain.com/webhooks/video-task-completed
    VideoGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1757169743
        id:
          type: string
          description: Task ID
          example: task-unified-1757169743-7cvnl5zw
        model:
          type: string
          description: Actual model name used
          example: veo3.1-pro
        object:
          type: string
          enum:
            - video.generation.task
          description: Specific task type
        progress:
          type: integer
          description: Task progress percentage (0-100)
          minimum: 0
          maximum: 100
          example: 0
        status:
          type: string
          description: Task status
          enum:
            - pending
            - processing
            - completed
            - failed
          example: pending
        task_info:
          $ref: '#/components/schemas/VideoTaskInfo'
          description: Video task detailed information
        type:
          type: string
          enum:
            - text
            - image
            - audio
            - video
          description: Task output type
          example: video
        usage:
          $ref: '#/components/schemas/VideoUsage'
          description: Usage and billing information
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: integer
              description: HTTP status error code
            message:
              type: string
              description: Error description
              example: Invalid request parameters
            type:
              type: string
              description: Error type
              example: invalid_request_error
            param:
              type: string
              description: Related parameter name
              example: model
            fallback_suggestion:
              type: string
              description: Suggestion for error resolution
              example: runway-gen3
    VideoTaskInfo:
      type: object
      properties:
        can_cancel:
          type: boolean
          description: Whether the task can be cancelled
          example: true
        estimated_time:
          type: integer
          description: Estimated completion time (seconds)
          minimum: 0
          example: 180
        video_duration:
          type: integer
          description: Video duration (seconds)
          example: 8
    VideoUsage:
      type: object
      description: Usage and billing information
      properties:
        billing_rule:
          type: string
          description: Billing rule
          enum:
            - per_call
            - per_token
            - per_second
          example: per_call
        credits_reserved:
          type: number
          description: Estimated credits consumed
          minimum: 0
          example: 25.7
        user_group:
          type: string
          description: User group category
          example: default
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ##All APIs require Bearer Token authentication##

        **Get API Key:**
        Visit [API Key Management
        Page](https://evolink.ai/dashboard/keys) to get your API Key

        **Add to request header:**

        ```
        Authorization: Bearer YOUR_API_KEY
        ```
```

---

# Query Task Status (Get Task Detail)

> **Source:** https://docs.evolink.ai/en/api-manual/task-management/get-task-detail

> Query the status, progress, and result information of asynchronous tasks by task ID

## OpenAPI Specification

```yaml
openapi: 3.1.0
info:
  title: Get Task Details API
  description: >-
    Query the status, progress, and result information of asynchronous tasks by
    task ID
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Task Management
    description: Asynchronous task management related APIs
paths:
  /v1/tasks/{task_id}:
    get:
      tags:
        - Task Management
      summary: Query Task Status
      description: >-
        Query the status, progress, and result information of asynchronous tasks
        by task ID
      operationId: getTaskDetail
      parameters:
        - name: task_id
          in: path
          required: true
          schema:
            type: string
          description: >-
            Task ID, ignore {} when querying, append the id from the async task
            response body at the end of the path
          example: task-unified-1756817821-4x3rx6ny
      responses:
        '200':
          description: Task status details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TaskDetailResponse'
        '400':
          description: Request parameter error, format error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 400
                  message: Invalid task ID format
                  type: invalid_request_error
                  param: task_id
        '401':
          description: Unauthenticated, token invalid or expired
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 401
                  message: Invalid or expired token
                  type: authentication_error
        '402':
          description: Insufficient quota, recharge required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 402
                  message: Insufficient quota
                  type: insufficient_quota_error
                  fallback_suggestion: https://evolink.ai/dashboard/billing
        '403':
          description: No permission to access
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 403
                  message: Access denied
                  type: permission_error
        '404':
          description: Resource does not exist
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 404
                  message: Task not found or expired
                  type: not_found_error
                  param: task_id
        '429':
          description: Request rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 429
                  message: Rate limit exceeded
                  type: rate_limit_error
                  fallback_suggestion: retry after 60 seconds
        '500':
          description: Internal server error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 500
                  message: Internal server error
                  type: internal_server_error
                  fallback_suggestion: try again later
        '502':
          description: Upstream service error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 502
                  message: Upstream service error
                  type: upstream_error
                  fallback_suggestion: try again later
        '503':
          description: Service temporarily unavailable
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 503
                  message: Service temporarily unavailable
                  type: service_unavailable_error
                  fallback_suggestion: retry after 30 seconds
components:
  schemas:
    TaskDetailResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1756817821
        id:
          type: string
          description: Task ID
          example: task-unified-1756817821-4x3rx6ny
        model:
          type: string
          description: Model used
          example: gpt-4o-image
        object:
          type: string
          description: Task type
          enum:
            - image.generation.task
            - video.generation.task
            - audio.generation.task
          example: image.generation.task
        progress:
          type: integer
          minimum: 0
          maximum: 100
          description: Task progress percentage
          example: 100
        results:
          type: array
          items:
            type: string
            format: uri
          description: Task result list (provided when completed)
          example:
            - http://example.com/image.jpg
        status:
          type: string
          description: Task status
          enum:
            - pending
            - processing
            - completed
            - failed
          example: completed
        task_info:
          type: object
          description: Task detailed information
          properties:
            can_cancel:
              type: boolean
              description: Whether the task can be cancelled
              example: false
            type:
              type: string
              description: Task type
              enum:
                - image
                - video
                - audio
                - text
              example: image
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: integer
              description: HTTP status error code
              example: 404
            message:
              type: string
              description: Error description message
              example: Task does not exist
            type:
              type: string
              description: Error type
              example: not_found_error
            param:
              type: string
              description: Related parameter name
              example: task_id
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >-
        ##All APIs require Bearer Token authentication##

        **Get API Key:**
        Visit [API Key Management
        Page](https://evolink.ai/dashboard/keys) to get your API Key

        **Add to request header:**

        ```
        Authorization: Bearer YOUR_API_KEY
        ```
```

---

# Appendix: Complete Workflow

## Step 1: Create Video Generation Task

**Request:**
```bash
curl --request POST \
  --url https://api.evolink.ai/v1/videos/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "veo3.1-pro",
    "prompt": "A cat playing piano"
  }'
```

**Response (200):**
```json
{
  "created": 1757169743,
  "id": "task-unified-1757169743-7cvnl5zw",
  "model": "veo3.1-pro",
  "object": "video.generation.task",
  "progress": 0,
  "status": "pending",
  "task_info": {
    "can_cancel": true,
    "estimated_time": 180,
    "video_duration": 8
  },
  "type": "video",
  "usage": {
    "billing_rule": "per_call",
    "credits_reserved": 25.7,
    "user_group": "default"
  }
}
```

## Step 2: Query Task Status

**Request:**
```bash
curl --request GET \
  --url https://api.evolink.ai/v1/tasks/task-unified-1757169743-7cvnl5zw \
  --header 'Authorization: Bearer <token>'
```

**Response (200 - completed):**
```json
{
  "created": 1757169743,
  "id": "task-unified-1757169743-7cvnl5zw",
  "model": "veo3.1-pro",
  "object": "video.generation.task",
  "progress": 100,
  "results": [
    "https://example.com/generated-video.mp4"
  ],
  "status": "completed",
  "task_info": {
    "can_cancel": false,
    "type": "video"
  }
}
```

## Task Status Flow

```
pending → processing → completed
                    ↘ failed
```

---

*Document generated from EvoLink.AI official documentation*
*Sources: docs.evolink.ai*

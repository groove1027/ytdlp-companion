# EvoLink.AI API Technical Documentation

## Nanobanana 2 Image Generation & Task Management

---

> **Sources:**
> - https://docs.evolink.ai/en/api-manual/image-series/nanobanana/nanobanana-2-image-generate
> - https://docs.evolink.ai/en/api-manual/task-management/get-task-detail

---

# Part 1: Nanobanana 2 Image Generation

> - Nano Banana 2 (gemini-3.1-flash-image-preview) model supports text-to-image, image-to-image, image editing and other generation modes
> - Asynchronous processing mode, use the returned task ID to [query](/en/api-manual/task-management/get-task-detail)
> - Generated image links are valid for 24 hours, please save them promptly

## OpenAPI Specification

```yaml
openapi: 3.1.0
info:
  title: Nano Banana 2 Interface
  description: >-
    Create image generation tasks using AI models, supporting various models and
    parameter configurations
  license:
    name: MIT
  version: 1.0.0
servers:
  - url: https://api.evolink.ai
    description: Production environment
security:
  - bearerAuth: []
tags:
  - name: Image Generation
    description: AI image generation related APIs
paths:
  /v1/images/generations:
    post:
      tags:
        - Image Generation
      summary: Nano Banana 2 Interface
      description: >-
        - Nano Banana 2 (gemini-3.1-flash-image-preview) model supports
        text-to-image, image-to-image, image editing and other generation modes

        - Asynchronous processing mode, use the returned task ID to
        [query](/en/api-manual/task-management/get-task-detail)

        - Generated image links are valid for 24 hours, please save them
        promptly
      operationId: createImageGenerationNanoBanana2
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ImageGenerationRequest'
            examples:
              text_to_image:
                summary: Text to Image
                value:
                  model: gemini-3.1-flash-image-preview
                  prompt: A cat playing on the grass
      responses:
        '200':
          description: Image generation task created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ImageGenerationResponse'
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                error:
                  code: 400
                  message: Invalid request parameters
                  type: invalid_request_error
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
                  fallback_suggestion: gemini-3.1-flash-image-preview
        '413':
          description: Request body too large
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
    ImageGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          description: >-
            Image generation model name, official channel, better stability and
            controllability, suitable for commercial scenarios
          example: gemini-3.1-flash-image-preview
          enum:
            - gemini-3.1-flash-image-preview
          default: gemini-3.1-flash-image-preview
        prompt:
          type: string
          description: >-
            Prompt describing the image to be generated, or describing how to
            edit the input image, limited to 2000 tokens
          example: A cat playing in the grass
          maxLength: 2000
        size:
          type: string
          description: |-
            Aspect ratio of the generated image, default is `auto`

            **Note:**
            - `1:4`, `4:1`, `1:8`, `8:1` aspect ratios are not yet available
          enum:
            - auto
            - '1:1'
            - '1:4'
            - '4:1'
            - '1:8'
            - '8:1'
            - '2:3'
            - '3:2'
            - '3:4'
            - '4:3'
            - '4:5'
            - '5:4'
            - '9:16'
            - '16:9'
            - '21:9'
        quality:
          type: string
          description: |-
            Quality of the generated image, default is `2K`

            **Note:**
            - Different quality levels have different pricing
          enum:
            - 0.5K
            - 1K
            - 2K
            - 4K
        image_urls:
          type: array
          description: >-
            Reference image URL list for image-to-image and image editing
            functions

            **Note:**
            - Maximum number of input images per request: `14`
            - Image size: not exceeding `20MB`
            - Supported file formats: `.jpeg`, `.jpg`, `.png`, `.webp`
            - Image URLs must be directly accessible by the server, or the image
            URL should directly download when accessed (typically these URLs end
            with image file extensions, such as `.png`, `.jpg`)
            - Maximum of `4` real person images can be uploaded
          items:
            type: string
            format: uri
          example:
            - https://example.com/image1.png
            - https://example.com/image2.png
        model_params:
          type: object
          description: Model extension parameters
          properties:
            web_search:
              type: boolean
              description: >-
                Whether to enable web search. When enabled, the model will use
                web search results to optimize image generation
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
          example: https://your-domain.com/webhooks/image-task-completed
    ImageGenerationResponse:
      type: object
      properties:
        created:
          type: integer
          description: Task creation timestamp
          example: 1757165031
        id:
          type: string
          description: Task ID
          example: task-unified-1757165031-uyujaw3d
        model:
          type: string
          description: Actual model name used
          example: gemini-3.1-flash-image-preview
        object:
          type: string
          enum:
            - image.generation.task
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
          $ref: '#/components/schemas/TaskInfo'
          description: Asynchronous task information
        type:
          type: string
          enum:
            - text
            - image
            - audio
            - video
          description: Task output type
          example: image
        usage:
          $ref: '#/components/schemas/Usage'
          description: Usage and billing information
    ErrorResponse:
      type: object
      properties:
        error:
          type: object
          properties:
            code:
              type: integer
              description: HTTP error status code
            message:
              type: string
              description: Error description
            type:
              type: string
              description: Error type
            param:
              type: string
              description: Related parameter name
            fallback_suggestion:
              type: string
              description: Suggestion for error resolution
    TaskInfo:
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
          example: 45
    Usage:
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
          example: 8.7
        user_group:
          type: string
          description: User group category
          enum:
            - default
            - vip
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

# Part 2: Query Task Status (Get Task Detail)

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

## Step 1: Create Image Generation Task

**Request:**
```bash
curl --request POST \
  --url https://api.evolink.ai/v1/images/generations \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "gemini-3.1-flash-image-preview",
    "prompt": "A cat playing on the grass"
  }'
```

**Response (200):**
```json
{
  "created": 1757165031,
  "id": "task-unified-1757165031-uyujaw3d",
  "model": "gemini-3.1-flash-image-preview",
  "object": "image.generation.task",
  "progress": 0,
  "status": "pending",
  "task_info": {
    "can_cancel": true,
    "estimated_time": 45
  },
  "type": "image",
  "usage": {
    "billing_rule": "per_call",
    "credits_reserved": 8.7,
    "user_group": "default"
  }
}
```

## Step 2: Query Task Status

**Request:**
```bash
curl --request GET \
  --url https://api.evolink.ai/v1/tasks/task-unified-1757165031-uyujaw3d \
  --header 'Authorization: Bearer <token>'
```

**Response (200 - completed):**
```json
{
  "created": 1757165031,
  "id": "task-unified-1757165031-uyujaw3d",
  "model": "gemini-3.1-flash-image-preview",
  "object": "image.generation.task",
  "progress": 100,
  "results": [
    "https://example.com/generated-image.jpg"
  ],
  "status": "completed",
  "task_info": {
    "can_cancel": false,
    "type": "image"
  }
}
```

## Task Status Flow

```
pending → processing → completed
                    ↘ failed
```

- **pending**: Task created, waiting to be processed
- **processing**: Task is being processed
- **completed**: Task completed successfully, results available in `results` array
- **failed**: Task failed

## Error Response Format (All APIs)

```json
{
  "error": {
    "code": 400,
    "message": "Error description",
    "type": "error_type",
    "param": "related_parameter",
    "fallback_suggestion": "suggestion for resolution"
  }
}
```

### Error Types Reference

| HTTP Code | Type | Description |
|-----------|------|-------------|
| 400 | `invalid_request_error` | Invalid request parameters |
| 401 | `authentication_error` | Invalid or expired token |
| 402 | `insufficient_quota_error` | Insufficient quota, recharge required |
| 403 | `permission_error` | Access denied |
| 404 | `not_found_error` | Resource not found |
| 413 | `request_too_large_error` | Request body too large (image generation only) |
| 429 | `rate_limit_error` | Rate limit exceeded |
| 500 | `internal_server_error` | Internal server error |
| 502 | `upstream_error` | Upstream service error |
| 503 | `service_unavailable_error` | Service temporarily unavailable |

---

*Document generated from EvoLink.AI official documentation*
*Sources: docs.evolink.ai*

# EvoLink.AI API Technical Documentation
## Gemini 3.1 Pro (Language Model) & Query Task Status API

---

# Part 1: OpenAI SDK Format

## 1.1 Quick Start

### Overview
The OpenAI SDK format provides a standardized interface for interacting with the Gemini 3.1 Pro language model using OpenAI-compatible endpoints.

### OpenAPI Specification - Quick Start

```yaml
openapi: 3.0.0
info:
  title: EvoLink.AI Chat Completions API (OpenAI Format)
  description: OpenAI-compatible API for Gemini 3.1 Pro language model
  version: 1.0.0

servers:
  - url: https://api.evolink.ai
    description: Production server

paths:
  /v1/chat/completions:
    post:
      summary: Create a chat completion
      operationId: createChatCompletion
      description: Creates a model response for the given chat conversation
      tags:
        - Chat Completions
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - messages
              properties:
                model:
                  type: string
                  enum:
                    - gemini-3.1-pro-preview
                  example: gemini-3.1-pro-preview
                  description: ID of the model to use
                messages:
                  type: array
                  description: A list of messages comprising the conversation so far
                  items:
                    type: object
                    required:
                      - role
                      - content
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - assistant
                          - system
                        description: The role of the message author
                      content:
                        type: string
                        description: The contents of the message
                        example: "Hello, how are you?"
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    description: A unique identifier for the chat completion
                    example: "chatcmpl-8MV8xkqsN9Q0vPxV4J7J"
                  model:
                    type: string
                    description: The model used for the completion
                    example: "gemini-3.1-pro-preview"
                  object:
                    type: string
                    enum:
                      - chat.completion
                    description: The object type
                  created:
                    type: integer
                    description: Unix timestamp of when the completion was created
                    example: 1703001234
                  choices:
                    type: array
                    description: A list of chat completion choices
                    items:
                      type: object
                      properties:
                        index:
                          type: integer
                          description: The index of the choice in the list of choices
                        message:
                          type: object
                          properties:
                            role:
                              type: string
                              enum:
                                - assistant
                              description: The role of the message
                            content:
                              type: string
                              description: The contents of the message
                              example: "Hello! I'm doing well, thank you for asking. How can I assist you today?"
                        finish_reason:
                          type: string
                          enum:
                            - stop
                            - length
                            - content_filter
                          description: The reason the model stopped generating tokens
                  usage:
                    type: object
                    description: Usage statistics for the completion
                    properties:
                      prompt_tokens:
                        type: integer
                        description: Number of tokens in the prompt
                        example: 10
                      completion_tokens:
                        type: integer
                        description: Number of tokens in the completion
                        example: 25
                      total_tokens:
                        type: integer
                        description: Total number of tokens used in the API call
                        example: 35
                      prompt_tokens_details:
                        type: object
                        description: Breakdown of prompt token types
                        properties:
                          cached_tokens:
                            type: integer
                            description: Number of cached tokens in the prompt
                          text_tokens:
                            type: integer
                            description: Number of text tokens in the prompt
                          audio_tokens:
                            type: integer
                            description: Number of audio tokens in the prompt
                          image_tokens:
                            type: integer
                            description: Number of image tokens in the prompt
                      completion_tokens_details:
                        type: object
                        description: Breakdown of completion token types
                        properties:
                          text_tokens:
                            type: integer
                            description: Number of text tokens in the completion
                          audio_tokens:
                            type: integer
                            description: Number of audio tokens in the completion
                          reasoning_tokens:
                            type: integer
                            description: Number of reasoning tokens in the completion
                      input_tokens:
                        type: integer
                        description: Number of input tokens
                      output_tokens:
                        type: integer
                        description: Number of output tokens
                      input_tokens_details:
                        type: object
                        description: Detailed input token breakdown
                        properties:
                          modality:
                            type: string
                            enum:
                              - TEXT
                              - IMAGE
                              - AUDIO
                              - VIDEO
                          token_count:
                            type: integer

        '400':
          description: Bad Request - Invalid request error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - invalid_request_error
                      message:
                        type: string
        '401':
          description: Unauthorized - Authentication error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - authentication_error
                      message:
                        type: string
        '402':
          description: Payment Required - Insufficient quota error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - insufficient_quota_error
                      message:
                        type: string
        '403':
          description: Forbidden - Permission error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - permission_error
                      message:
                        type: string
        '404':
          description: Not Found - Model not found error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - not_found_error
                      message:
                        type: string
                      fallback_model:
                        type: string
                        example: gemini-3.1-pro-preview
        '429':
          description: Too Many Requests - Rate limit error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - rate_limit_error
                      message:
                        type: string
        '500':
          description: Internal Server Error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - internal_server_error
                      message:
                        type: string
        '502':
          description: Bad Gateway - Upstream error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - upstream_error
                      message:
                        type: string
        '503':
          description: Service Unavailable
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - service_unavailable_error
                      message:
                        type: string

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Bearer token authentication. Obtain your API key from https://evolink.ai/dashboard/keys
```

### Quick Start Example

```bash
curl -X POST https://api.evolink.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ]
  }'
```

### Authentication
All requests require bearer token authentication using your API key from https://evolink.ai/dashboard/keys. Include the API key in the Authorization header as `Bearer YOUR_API_KEY`.

---

## 1.2 Full Reference

### OpenAPI Specification - Full Reference

```yaml
openapi: 3.0.0
info:
  title: EvoLink.AI Chat Completions API (OpenAI Format) - Full Reference
  description: Complete OpenAI-compatible API for Gemini 3.1 Pro language model with advanced features
  version: 1.0.0

servers:
  - url: https://api.evolink.ai
    description: Production server

paths:
  /v1/chat/completions:
    post:
      summary: Create a chat completion with advanced options
      operationId: createChatCompletionFull
      description: Creates a model response for the given chat conversation with streaming, vision, and multimodal support
      tags:
        - Chat Completions
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - messages
              properties:
                model:
                  type: string
                  enum:
                    - gemini-3.1-pro-preview
                  example: gemini-3.1-pro-preview
                  description: ID of the model to use
                messages:
                  type: array
                  description: A list of messages comprising the conversation so far
                  items:
                    oneOf:
                      - type: object
                        required:
                          - role
                          - content
                        properties:
                          role:
                            type: string
                            enum:
                              - user
                              - assistant
                              - system
                            description: The role of the message author
                          content:
                            oneOf:
                              - type: string
                                description: Text content
                                example: "Hello, how are you?"
                              - type: array
                                description: Array of content parts for multimodal messages
                                items:
                                  oneOf:
                                    - type: object
                                      title: TextContent
                                      required:
                                        - type
                                        - text
                                      properties:
                                        type:
                                          type: string
                                          enum:
                                            - text
                                        text:
                                          type: string
                                          example: "What is in this image?"
                                    - type: object
                                      title: ImageContent
                                      required:
                                        - type
                                        - image_url
                                      properties:
                                        type:
                                          type: string
                                          enum:
                                            - image_url
                                        image_url:
                                          type: object
                                          required:
                                            - url
                                          properties:
                                            url:
                                              type: string
                                              format: uri
                                              description: URL or base64 data URI of the image
                                              example: "https://example.com/image.jpg"
                stream:
                  type: boolean
                  description: If set to true, partial message deltas will be sent, like in ChatGPT
                  default: false
                  example: false
                max_tokens:
                  type: integer
                  minimum: 1
                  description: The maximum number of tokens to generate in the chat completion
                  example: 256
                temperature:
                  type: number
                  minimum: 0
                  maximum: 2
                  description: What sampling temperature to use, between 0 and 2
                  example: 0.7
                  default: 1.0
                top_p:
                  type: number
                  minimum: 0
                  maximum: 1
                  description: An alternative to sampling with temperature, nucleus sampling
                  example: 0.9
                  default: 1.0
                top_k:
                  type: integer
                  minimum: 1
                  description: Limit sampling to the k most likely next tokens
                  example: 40

      responses:
        '200':
          description: Successful response (non-streaming)
          content:
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    description: A unique identifier for the chat completion
                    example: "chatcmpl-8MV8xkqsN9Q0vPxV4J7J"
                  model:
                    type: string
                    description: The model used for the completion
                    example: "gemini-3.1-pro-preview"
                  object:
                    type: string
                    enum:
                      - chat.completion
                    description: The object type
                  created:
                    type: integer
                    description: Unix timestamp of when the completion was created
                    example: 1703001234
                  choices:
                    type: array
                    description: A list of chat completion choices
                    items:
                      type: object
                      properties:
                        index:
                          type: integer
                          description: The index of the choice in the list of choices
                        message:
                          type: object
                          properties:
                            role:
                              type: string
                              enum:
                                - assistant
                              description: The role of the message
                            content:
                              type: string
                              description: The contents of the message
                              example: "Hello! I'm doing well, thank you for asking. How can I assist you today?"
                        finish_reason:
                          type: string
                          enum:
                            - stop
                            - length
                            - content_filter
                          description: The reason the model stopped generating tokens
                  usage:
                    type: object
                    description: Usage statistics for the completion
                    properties:
                      prompt_tokens:
                        type: integer
                        description: Number of tokens in the prompt
                        example: 10
                      completion_tokens:
                        type: integer
                        description: Number of tokens in the completion
                        example: 25
                      total_tokens:
                        type: integer
                        description: Total number of tokens used in the API call
                        example: 35
                      prompt_tokens_details:
                        type: object
                        description: Breakdown of prompt token types
                        properties:
                          cached_tokens:
                            type: integer
                            description: Number of cached tokens in the prompt
                            example: 0
                          text_tokens:
                            type: integer
                            description: Number of text tokens in the prompt
                            example: 10
                          audio_tokens:
                            type: integer
                            description: Number of audio tokens in the prompt
                            example: 0
                          image_tokens:
                            type: integer
                            description: Number of image tokens in the prompt
                            example: 0
                      completion_tokens_details:
                        type: object
                        description: Breakdown of completion token types
                        properties:
                          text_tokens:
                            type: integer
                            description: Number of text tokens in the completion
                            example: 25
                          audio_tokens:
                            type: integer
                            description: Number of audio tokens in the completion
                            example: 0
                          reasoning_tokens:
                            type: integer
                            description: Number of reasoning tokens in the completion
                            example: 0
                      input_tokens:
                        type: integer
                        description: Number of input tokens
                        example: 10
                      output_tokens:
                        type: integer
                        description: Number of output tokens
                        example: 25
                      input_tokens_details:
                        type: object
                        description: Detailed input token breakdown
                        properties:
                          modality:
                            type: string
                            enum:
                              - TEXT
                              - IMAGE
                              - AUDIO
                              - VIDEO
                          token_count:
                            type: integer
                            example: 10

        '400':
          description: Bad Request - Invalid request error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - invalid_request_error
                      message:
                        type: string
        '401':
          description: Unauthorized - Authentication error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - authentication_error
                      message:
                        type: string
        '402':
          description: Payment Required - Insufficient quota error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - insufficient_quota_error
                      message:
                        type: string
        '403':
          description: Forbidden - Permission error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - permission_error
                      message:
                        type: string
        '404':
          description: Not Found - Model not found error (fallback to default model)
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - not_found_error
                      message:
                        type: string
                      fallback_model:
                        type: string
                        example: gemini-3.1-pro-preview
        '413':
          description: Payload Too Large - Request too large (e.g., image file size)
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - request_too_large_error
                      message:
                        type: string
        '429':
          description: Too Many Requests - Rate limit error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - rate_limit_error
                      message:
                        type: string
        '500':
          description: Internal Server Error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - internal_server_error
                      message:
                        type: string
        '502':
          description: Bad Gateway - Upstream error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - upstream_error
                      message:
                        type: string
        '503':
          description: Service Unavailable
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - service_unavailable_error
                      message:
                        type: string

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Bearer token authentication. Obtain your API key from https://evolink.ai/dashboard/keys
```

### Additional Features

#### Supported Image Formats
- JPEG (.jpeg, .jpg)
- PNG (.png)
- WebP (.webp)

#### Image Size Limits
- Maximum file size: 10MB per image
- Maximum images per message: 10 images

#### Parameter Details

**temperature** (0-2)
- Controls randomness: lower values make output more focused and deterministic
- Default: 1.0
- Example value: 0.7

**top_p** (0-1)
- Nucleus sampling parameter for diversity
- Default: 1.0
- Example value: 0.9

**top_k** (minimum 1)
- Limits token selection to k most likely candidates
- Example value: 40

**max_tokens** (minimum 1)
- Maximum number of tokens to generate
- Example value: 256

### Example Requests

#### Simple Text Example
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ]
}
```

#### Multi-Turn Conversation
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "user",
      "content": "What is the capital of France?"
    },
    {
      "role": "assistant",
      "content": "The capital of France is Paris."
    },
    {
      "role": "user",
      "content": "What is its population?"
    }
  ]
}
```

#### System Prompt Example
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant that provides accurate information."
    },
    {
      "role": "user",
      "content": "Tell me about quantum computing."
    }
  ]
}
```

#### Vision/Image Analysis Example
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What is in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg"
          }
        }
      ]
    }
  ]
}
```

#### Multi-Image Example
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Compare these two images."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image1.jpg"
          }
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image2.jpg"
          }
        }
      ]
    }
  ]
}
```

#### Streaming Example
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "user",
      "content": "Write a short story."
    }
  ],
  "stream": true,
  "max_tokens": 500,
  "temperature": 0.7
}
```

#### AssistantMessage with Detailed Self-Introduction
```json
{
  "model": "gemini-3.1-pro-preview",
  "messages": [
    {
      "role": "user",
      "content": "Introduce yourself."
    },
    {
      "role": "assistant",
      "content": "I am Gemini 3.1 Pro, an advanced language model developed by EvoLink.AI. I'm designed to assist with a wide range of tasks including text generation, analysis, coding, creative writing, and problem-solving. I can process both text and images, making me a versatile tool for multimodal interactions. I strive to provide accurate, helpful, and thoughtful responses while respecting ethical guidelines and privacy considerations."
    }
  ]
}
```

---

# Part 2: Google Native API Format

## 2.1 Quick Start

### Overview
The Google Native API format provides Google's native interface for interacting with the Gemini 3.1 Pro language model, with support for both Standard and Code-Optimized Beta endpoints.

### OpenAPI Specification - Quick Start

```yaml
openapi: 3.0.0
info:
  title: EvoLink.AI Gemini Native API - Quick Start
  description: Google native API format for Gemini 3.1 Pro language model
  version: 1.0.0

servers:
  - url: https://api.evolink.ai
    description: Standard server
  - url: https://code.evolink.ai
    description: Code-Optimized Beta server - Enhanced for code generation and analysis tasks

paths:
  /v1beta/models/gemini-3.1-pro-preview:generateContent:
    post:
      summary: Generate content using Google native format
      operationId: generateContent
      description: Generates a response from the model given an input prompt contained by the request
      tags:
        - Content Generation
      security:
        - bearerAuth: []
      parameters:
        - name: model
          in: path
          required: true
          schema:
            type: string
            enum:
              - gemini-3.1-pro-preview
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - contents
              properties:
                contents:
                  type: array
                  description: The conversation history
                  items:
                    type: object
                    required:
                      - role
                      - parts
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                        description: The role of the content author
                      parts:
                        type: array
                        description: Array of parts that comprise the message
                        items:
                          type: object
                          title: TextPart
                          required:
                            - text
                          properties:
                            text:
                              type: string
                              description: The text content
                              example: "Hello, how are you?"

      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  candidates:
                    type: array
                    description: Response candidates from the model
                    items:
                      type: object
                      properties:
                        content:
                          type: object
                          properties:
                            role:
                              type: string
                              enum:
                                - model
                              description: The role of the content author
                            parts:
                              type: array
                              items:
                                type: object
                                properties:
                                  text:
                                    type: string
                                    description: The text response
                        finishReason:
                          type: string
                          enum:
                            - STOP
                            - MAX_TOKENS
                            - SAFETY
                            - RECITATION
                            - OTHER
                          description: Why the model stopped generating tokens
                        index:
                          type: integer
                          description: The index of the candidate in the list
                        safetyRatings:
                          type: array
                          description: Safety ratings for the content
                          items:
                            type: object
                            properties:
                              category:
                                type: string
                              probability:
                                type: string
                  promptFeedback:
                    type: object
                    description: Feedback about the input prompt
                  usageMetadata:
                    type: object
                    description: Token usage information
                    properties:
                      promptTokenCount:
                        type: integer
                        description: Number of tokens in the prompt
                        example: 10
                      candidatesTokenCount:
                        type: integer
                        description: Number of tokens in the response
                        example: 25
                      totalTokenCount:
                        type: integer
                        description: Total token count
                        example: 35
                      thoughtsTokenCount:
                        type: integer
                        description: Number of thinking/reasoning tokens
                        example: 0
                      promptTokensDetails:
                        type: object
                        description: Detailed breakdown of prompt tokens by modality
                        items:
                          type: object
                          title: TokenDetail
                          properties:
                            modality:
                              type: string
                              enum:
                                - TEXT
                                - IMAGE
                                - AUDIO
                                - VIDEO
                              description: The modality type
                            tokenCount:
                              type: integer
                              description: Token count for this modality
                              example: 10

        '400':
          description: Bad Request
        '401':
          description: Unauthorized
        '402':
          description: Payment Required
        '403':
          description: Forbidden
        '404':
          description: Not Found
        '429':
          description: Too Many Requests
        '500':
          description: Internal Server Error
        '502':
          description: Bad Gateway
        '503':
          description: Service Unavailable

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Bearer token authentication. Obtain your API key from https://evolink.ai/dashboard/keys
```

### Quick Start Example

```bash
curl -X POST https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Hello, how are you?"
          }
        ]
      }
    ]
  }'
```

### Server Information
- **Standard Server**: https://api.evolink.ai - For general-purpose language tasks
- **Code-Optimized Beta**: https://code.evolink.ai - Enhanced for code generation and analysis tasks (Beta)

---

## 2.2 Full Reference

### OpenAPI Specification - Full Reference

```yaml
openapi: 3.0.0
info:
  title: EvoLink.AI Gemini Native API - Full Reference
  description: Complete Google native API format for Gemini 3.1 Pro language model
  version: 1.0.0

servers:
  - url: https://api.evolink.ai
    description: Standard server
  - url: https://code.evolink.ai
    description: Code-Optimized Beta server

paths:
  /v1beta/models/gemini-3.1-pro-preview:generateContent:
    post:
      summary: Generate content using Google native format
      operationId: generateContentFull
      description: Generates a response from the model given an input prompt contained by the request
      tags:
        - Content Generation
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - contents
              properties:
                contents:
                  type: array
                  description: The conversation history
                  items:
                    type: object
                    required:
                      - role
                      - parts
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - model
                        description: The role of the content author
                      parts:
                        type: array
                        description: Array of parts that comprise the message
                        items:
                          oneOf:
                            - type: object
                              title: TextPart
                              required:
                                - text
                              properties:
                                text:
                                  type: string
                                  description: The text content
                                  example: "What is in this image?"
                            - type: object
                              title: FilePart
                              required:
                                - fileData
                              properties:
                                fileData:
                                  type: object
                                  required:
                                    - mimeType
                                    - fileUri
                                  properties:
                                    mimeType:
                                      type: string
                                      enum:
                                        - image/jpeg
                                        - image/png
                                        - audio/mp3
                                        - video/mp4
                                        - application/pdf
                                      description: MIME type of the file
                                    fileUri:
                                      type: string
                                      format: uri
                                      description: URI of the file
                generationConfig:
                  type: object
                  description: Configuration for content generation
                  properties:
                    temperature:
                      type: number
                      minimum: 0
                      maximum: 2
                      description: Sampling temperature
                      example: 0.7
                      default: 1.0
                    maxOutputTokens:
                      type: integer
                      minimum: 1
                      description: Maximum output tokens
                      example: 256
                    topP:
                      type: number
                      minimum: 0
                      maximum: 1
                      description: Nucleus sampling parameter
                      example: 0.9
                      default: 1.0
                    topK:
                      type: integer
                      minimum: 1
                      description: Top-k sampling parameter
                      example: 40

      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  candidates:
                    type: array
                    description: Response candidates from the model
                    items:
                      type: object
                      properties:
                        content:
                          type: object
                          properties:
                            role:
                              type: string
                              enum:
                                - model
                              description: The role of the content author
                            parts:
                              type: array
                              items:
                                type: object
                                properties:
                                  text:
                                    type: string
                                    description: The text response
                        finishReason:
                          type: string
                          enum:
                            - STOP
                            - MAX_TOKENS
                            - SAFETY
                            - RECITATION
                            - OTHER
                          description: Why the model stopped generating tokens
                        index:
                          type: integer
                          description: The index of the candidate in the list
                        safetyRatings:
                          type: array
                          description: Safety ratings for the content
                          items:
                            type: object
                            properties:
                              category:
                                type: string
                                description: Category of safety rating
                              probability:
                                type: string
                                description: Probability level
                  promptFeedback:
                    type: object
                    description: Feedback about the input prompt
                  usageMetadata:
                    type: object
                    description: Token usage information
                    properties:
                      promptTokenCount:
                        type: integer
                        description: Number of tokens in the prompt
                        example: 10
                      candidatesTokenCount:
                        type: integer
                        description: Number of tokens in the response
                        example: 25
                      totalTokenCount:
                        type: integer
                        description: Total token count
                        example: 35
                      thoughtsTokenCount:
                        type: integer
                        description: Number of thinking/reasoning tokens
                        example: 0
                      promptTokensDetails:
                        type: array
                        description: Detailed breakdown of prompt tokens by modality
                        items:
                          type: object
                          title: TokenDetail
                          properties:
                            modality:
                              type: string
                              enum:
                                - TEXT
                                - IMAGE
                                - AUDIO
                                - VIDEO
                              description: The modality type
                            tokenCount:
                              type: integer
                              description: Token count for this modality
                              example: 10

        '400':
          description: Bad Request
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '401':
          description: Unauthorized
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '402':
          description: Payment Required
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '403':
          description: Forbidden
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '404':
          description: Not Found
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '413':
          description: Payload Too Large
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '429':
          description: Too Many Requests
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '500':
          description: Internal Server Error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '502':
          description: Bad Gateway
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string
        '503':
          description: Service Unavailable
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                      message:
                        type: string

  /v1beta/models/gemini-3.1-pro-preview:streamGenerateContent:
    post:
      summary: Stream content generation using Google native format
      operationId: streamGenerateContent
      description: Generates a streaming response from the model given an input prompt
      tags:
        - Content Generation
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - contents
              properties:
                contents:
                  type: array
                  description: The conversation history
                  items:
                    type: object
                    required:
                      - role
                      - parts
                    properties:
                      role:
                        type: string
                        enum:
                          - user
                          - model
                        description: The role of the content author
                      parts:
                        type: array
                        description: Array of parts that comprise the message
                        items:
                          oneOf:
                            - type: object
                              title: TextPart
                              required:
                                - text
                              properties:
                                text:
                                  type: string
                            - type: object
                              title: FilePart
                              required:
                                - fileData
                              properties:
                                fileData:
                                  type: object
                                  required:
                                    - mimeType
                                    - fileUri
                                  properties:
                                    mimeType:
                                      type: string
                                      enum:
                                        - image/jpeg
                                        - image/png
                                        - audio/mp3
                                        - video/mp4
                                        - application/pdf
                                    fileUri:
                                      type: string
                                      format: uri
                generationConfig:
                  type: object
                  description: Configuration for content generation
                  properties:
                    temperature:
                      type: number
                      minimum: 0
                      maximum: 2
                      example: 0.7
                    maxOutputTokens:
                      type: integer
                      minimum: 1
                      example: 256
                    topP:
                      type: number
                      minimum: 0
                      maximum: 1
                      example: 0.9
                    topK:
                      type: integer
                      minimum: 1
                      example: 40

      responses:
        '200':
          description: Successful streaming response
          content:
            text/event-stream:
              schema:
                type: object
                description: Server-sent events containing StreamGenerateContentResponse chunks
                properties:
                  trafficType:
                    type: string
                    enum:
                      - ON_DEMAND
                    description: Type of traffic
                  modelVersion:
                    type: string
                    description: Version of the model
                  createTime:
                    type: string
                    format: date-time
                    description: Timestamp of response creation
                  responseId:
                    type: string
                    description: Unique response identifier
                  candidates:
                    type: array
                    description: Partial or complete response candidates
                    items:
                      type: object
                      properties:
                        content:
                          type: object
                          properties:
                            role:
                              type: string
                              enum:
                                - model
                            parts:
                              type: array
                              items:
                                type: object
                                properties:
                                  text:
                                    type: string
                        finishReason:
                          type: string
                          enum:
                            - STOP
                            - MAX_TOKENS
                            - SAFETY
                            - RECITATION
                            - OTHER
                        index:
                          type: integer
                        safetyRatings:
                          type: array
                          items:
                            type: object
                  usageMetadata:
                    type: object
                    description: Token usage (only in final chunk)
                    properties:
                      promptTokenCount:
                        type: integer
                      candidatesTokenCount:
                        type: integer
                      totalTokenCount:
                        type: integer
                      thoughtsTokenCount:
                        type: integer
                      promptTokensDetails:
                        type: array
                        items:
                          type: object
                          properties:
                            modality:
                              type: string
                              enum:
                                - TEXT
                                - IMAGE
                                - AUDIO
                                - VIDEO
                            tokenCount:
                              type: integer

        '400':
          description: Bad Request
        '401':
          description: Unauthorized
        '402':
          description: Payment Required
        '403':
          description: Forbidden
        '404':
          description: Not Found
        '413':
          description: Payload Too Large
        '429':
          description: Too Many Requests
        '500':
          description: Internal Server Error
        '502':
          description: Bad Gateway
        '503':
          description: Service Unavailable

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Bearer token authentication. Obtain your API key from https://evolink.ai/dashboard/keys
```

### Supported File Types and Limits

| File Type | MIME Type | Max Size | Max Duration |
|-----------|-----------|----------|--------------|
| JPEG | image/jpeg | 10MB | N/A |
| PNG | image/png | 10MB | N/A |
| MP3 Audio | audio/mp3 | 10MB | < 10 minutes |
| MP4 Video | video/mp4 | 50MB | < 180 seconds |
| PDF | application/pdf | 20MB | N/A |

### Generation Configuration Parameters

**temperature** (0-2)
- Controls randomness: lower values make output more focused and deterministic
- Default: 1.0
- Example value: 0.7

**maxOutputTokens** (minimum 1)
- Maximum number of tokens to generate
- Example value: 256

**topP** (0-1)
- Nucleus sampling parameter for diversity
- Default: 1.0
- Example value: 0.9

**topK** (minimum 1)
- Limits token selection to k most likely candidates
- Example value: 40

### Example Requests

#### Simple Text Example
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Hello, how are you?"
        }
      ]
    }
  ]
}
```

#### Multi-Turn Conversation
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "What is the capital of France?"
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "text": "The capital of France is Paris."
        }
      ]
    },
    {
      "role": "user",
      "parts": [
        {
          "text": "What is its population?"
        }
      ]
    }
  ]
}
```

#### Audio Analysis Example
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Analyze this audio and provide a transcript."
        },
        {
          "fileData": {
            "mimeType": "audio/mp3",
            "fileUri": "gs://generative-ai-prod.appspot.com/files/file_12345"
          }
        }
      ]
    }
  ]
}
```

#### Image Understanding Example
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Describe what you see in this image."
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "gs://generative-ai-prod.appspot.com/files/file_12345"
          }
        }
      ]
    }
  ]
}
```

#### Multi-File Example
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Compare these documents and summarize the differences."
        },
        {
          "fileData": {
            "mimeType": "application/pdf",
            "fileUri": "gs://generative-ai-prod.appspot.com/files/file_12345"
          }
        },
        {
          "fileData": {
            "mimeType": "application/pdf",
            "fileUri": "gs://generative-ai-prod.appspot.com/files/file_67890"
          }
        }
      ]
    }
  ]
}
```

#### Streaming Example
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Write a short story about a robot."
        }
      ]
    }
  ],
  "generationConfig": {
    "maxOutputTokens": 500,
    "temperature": 0.7,
    "topP": 0.9,
    "topK": 40
  }
}
```

#### With Generation Configuration
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "Generate a creative poem about nature."
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 1.2,
    "maxOutputTokens": 256,
    "topP": 0.95,
    "topK": 50
  }
}
```

---

# Part 3: Query Task Status (Get Task Detail)

## Overview
The Get Task Detail API allows you to query the status and results of asynchronous tasks (image generation, video generation, audio generation) submitted through EvoLink.AI's task management system.

## OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: EvoLink.AI Task Management API - Get Task Detail
  description: Query the status and results of asynchronous generation tasks
  version: 1.0.0

servers:
  - url: https://api.evolink.ai
    description: Production server

paths:
  /v1/tasks/{task_id}:
    get:
      summary: Get task detail and status
      operationId: getTaskDetail
      description: Retrieve detailed information about a task, including its current status, progress, and results
      tags:
        - Task Management
      security:
        - bearerAuth: []
      parameters:
        - name: task_id
          in: path
          required: true
          schema:
            type: string
            description: The unique identifier of the task to retrieve
            example: "task_abc123def456"
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                title: TaskDetailResponse
                required:
                  - created
                  - id
                  - model
                  - object
                  - progress
                  - status
                  - task_info
                properties:
                  created:
                    type: integer
                    description: Unix timestamp when the task was created
                    example: 1703001234
                  id:
                    type: string
                    description: The unique identifier of the task
                    example: "task_abc123def456"
                  model:
                    type: string
                    description: The model used for the task
                    example: "dall-e-3"
                  object:
                    type: string
                    enum:
                      - image.generation.task
                      - video.generation.task
                      - audio.generation.task
                    description: The type of task
                  progress:
                    type: integer
                    minimum: 0
                    maximum: 100
                    description: Progress percentage (0-100)
                    example: 85
                  results:
                    type: array
                    description: Array of URIs for generated results (populated when status is completed)
                    items:
                      type: string
                      format: uri
                      description: URI of a generated result
                      example: "https://api.evolink.ai/v1/files/file_abc123"
                    example:
                      - "https://api.evolink.ai/v1/files/file_abc123"
                      - "https://api.evolink.ai/v1/files/file_def456"
                  status:
                    type: string
                    enum:
                      - pending
                      - processing
                      - completed
                      - failed
                    description: Current status of the task
                    example: "processing"
                  task_info:
                    type: object
                    description: Additional task information
                    required:
                      - can_cancel
                      - type
                    properties:
                      can_cancel:
                        type: boolean
                        description: Whether the task can be cancelled
                        example: true
                      type:
                        type: string
                        enum:
                          - image
                          - video
                          - audio
                          - text
                        description: The type of content being generated
                        example: "image"

        '400':
          description: Bad Request
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 400
                      message:
                        type: string
        '401':
          description: Unauthorized
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 401
                      message:
                        type: string
        '402':
          description: Payment Required
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 402
                      message:
                        type: string
        '403':
          description: Forbidden
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 403
                      message:
                        type: string
        '404':
          description: Not Found
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 404
                      message:
                        type: string
        '429':
          description: Too Many Requests
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 429
                      message:
                        type: string
        '500':
          description: Internal Server Error
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 500
                      message:
                        type: string
        '502':
          description: Bad Gateway
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 502
                      message:
                        type: string
        '503':
          description: Service Unavailable
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      code:
                        type: integer
                        example: 503
                      message:
                        type: string

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Bearer token authentication. Obtain your API key from https://evolink.ai/dashboard/keys
```

## Task Status Values

| Status | Description |
|--------|-------------|
| pending | Task has been created but not yet started processing |
| processing | Task is currently being processed |
| completed | Task has finished successfully and results are available |
| failed | Task encountered an error and did not complete |

## Task Object Types

| Object Type | Description |
|-------------|-------------|
| image.generation.task | Image generation task |
| video.generation.task | Video generation task |
| audio.generation.task | Audio generation task |

## Task Information Fields

| Field | Type | Description |
|-------|------|-------------|
| can_cancel | boolean | Indicates whether the task can be cancelled |
| type | string (enum) | Type of content: image, video, audio, or text |

## Response Examples

### Pending Task
```json
{
  "created": 1703001234,
  "id": "task_abc123def456",
  "model": "dall-e-3",
  "object": "image.generation.task",
  "progress": 0,
  "results": [],
  "status": "pending",
  "task_info": {
    "can_cancel": true,
    "type": "image"
  }
}
```

### Processing Task
```json
{
  "created": 1703001234,
  "id": "task_abc123def456",
  "model": "dall-e-3",
  "object": "image.generation.task",
  "progress": 65,
  "results": [],
  "status": "processing",
  "task_info": {
    "can_cancel": true,
    "type": "image"
  }
}
```

### Completed Task
```json
{
  "created": 1703001234,
  "id": "task_abc123def456",
  "model": "dall-e-3",
  "object": "image.generation.task",
  "progress": 100,
  "results": [
    "https://api.evolink.ai/v1/files/file_abc123",
    "https://api.evolink.ai/v1/files/file_def456"
  ],
  "status": "completed",
  "task_info": {
    "can_cancel": false,
    "type": "image"
  }
}
```

### Failed Task
```json
{
  "created": 1703001234,
  "id": "task_abc123def456",
  "model": "dall-e-3",
  "object": "image.generation.task",
  "progress": 30,
  "results": [],
  "status": "failed",
  "task_info": {
    "can_cancel": false,
    "type": "image"
  }
}
```

---

# Appendix: cURL Examples

## OpenAI SDK Format Examples

### Simple Text Request
```bash
curl -X POST https://api.evolink.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "messages": [
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ]
  }'
```

### Vision Request with Image
```bash
curl -X POST https://api.evolink.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }'
```

### Streaming Request
```bash
curl -X POST https://api.evolink.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "messages": [
      {
        "role": "user",
        "content": "Write a short story about a robot."
      }
    ],
    "stream": true,
    "max_tokens": 500
  }'
```

### Multi-Turn Conversation
```bash
curl -X POST https://api.evolink.ai/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-pro-preview",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "Explain quantum computing."
      },
      {
        "role": "assistant",
        "content": "Quantum computing uses quantum bits (qubits) instead of classical bits..."
      },
      {
        "role": "user",
        "content": "What are the practical applications?"
      }
    ],
    "temperature": 0.7,
    "top_p": 0.9
  }'
```

## Google Native API Format Examples

### Simple Text Request (Standard Server)
```bash
curl -X POST https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "What is the capital of France?"
          }
        ]
      }
    ]
  }'
```

### Code-Optimized Beta Server
```bash
curl -X POST https://code.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Write a Python function to calculate factorial."
          }
        ]
      }
    ]
  }'
```

### With File Content
```bash
curl -X POST https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Analyze this image."
          },
          {
            "fileData": {
              "mimeType": "image/jpeg",
              "fileUri": "gs://generative-ai-prod.appspot.com/files/file_12345"
            }
          }
        ]
      }
    ]
  }'
```

### Streaming Request
```bash
curl -X POST https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Write a poem about the ocean."
          }
        ]
      }
    ],
    "generationConfig": {
      "temperature": 1.2,
      "maxOutputTokens": 256,
      "topP": 0.95,
      "topK": 50
    }
  }'
```

### Multi-Turn Conversation
```bash
curl -X POST https://api.evolink.ai/v1beta/models/gemini-3.1-pro-preview:generateContent \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "What is machine learning?"
          }
        ]
      },
      {
        "role": "model",
        "parts": [
          {
            "text": "Machine learning is a subset of artificial intelligence..."
          }
        ]
      },
      {
        "role": "user",
        "parts": [
          {
            "text": "Can you give me a practical example?"
          }
        ]
      }
    ]
  }'
```

## Task Management API Examples

### Query Task Status
```bash
curl -X GET https://api.evolink.ai/v1/tasks/task_abc123def456 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Poll Task Until Completion
```bash
#!/bin/bash
TASK_ID="task_abc123def456"
API_KEY="YOUR_API_KEY"

while true; do
  response=$(curl -s -X GET https://api.evolink.ai/v1/tasks/$TASK_ID \
    -H "Authorization: Bearer $API_KEY")

  status=$(echo $response | jq -r '.status')
  progress=$(echo $response | jq -r '.progress')

  echo "Status: $status, Progress: $progress%"

  if [ "$status" == "completed" ] || [ "$status" == "failed" ]; then
    echo "Task finished with status: $status"
    echo "Results: $(echo $response | jq '.results')"
    break
  fi

  sleep 2
done
```

### Check Image Generation Task Results
```bash
curl -X GET https://api.evolink.ai/v1/tasks/task_abc123def456 \
  -H "Authorization: Bearer YOUR_API_KEY" | jq '.'
```

---

# Authentication & Key Management

## API Key Generation

1. Visit https://evolink.ai/dashboard/keys
2. Create a new API key
3. Store the key securely
4. Use in Authorization header as `Bearer YOUR_API_KEY`

## Rate Limits

Different endpoints may have different rate limits. Check the error response headers for rate limit information:
- `X-RateLimit-Limit`: Total requests per minute
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

# Error Handling

## Common Error Codes

| Code | Type | Description |
|------|------|-------------|
| 400 | invalid_request_error | Invalid request parameters |
| 401 | authentication_error | Invalid or missing API key |
| 402 | insufficient_quota_error | Insufficient quota for request |
| 403 | permission_error | User does not have permission |
| 404 | not_found_error | Resource not found |
| 413 | request_too_large_error | Request payload exceeds size limit |
| 429 | rate_limit_error | Too many requests |
| 500 | internal_server_error | Server error |
| 502 | upstream_error | Upstream service error |
| 503 | service_unavailable_error | Service temporarily unavailable |

## Error Response Format

### OpenAI SDK Format
```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "Invalid model specified"
  }
}
```

### Google Native API Format
```json
{
  "error": {
    "code": 400,
    "message": "Invalid model specified"
  }
}
```

---

# Best Practices

1. **Authentication**: Always store API keys securely and never commit them to version control
2. **Error Handling**: Implement proper error handling and retry logic for transient failures
3. **Rate Limiting**: Implement exponential backoff for rate limit errors (429)
4. **Token Counting**: Monitor token usage to optimize costs
5. **Streaming**: Use streaming endpoints for long-form content generation
6. **Image Size**: Optimize image sizes before sending (max 10MB per image)
7. **Task Polling**: Implement exponential backoff when polling task status
8. **Multimodal**: Leverage multimodal capabilities for richer interactions

---

# Conclusion

The EvoLink.AI API provides comprehensive support for Gemini 3.1 Pro language model interactions through both OpenAI-compatible and Google native API formats, along with robust task management capabilities for asynchronous operations. This documentation includes complete OpenAPI specifications, detailed examples, and best practices for integration.

For the latest updates and additional resources, visit https://docs.evolink.ai

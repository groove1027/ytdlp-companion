📌 Kie Gemini 3.1 Pro 기술문서

원본: https://docs.kie.ai/market/gemini/gemini-3-1-pro
확인일: 2026-03-14

POST
https://api.kie.ai/gemini-3.1-pro/v1/chat/completions
Chat Completions
Generate chat completions using the gemini-3.1-pro model. The model name is specified in the URL path.
Request Parameters
The Chat Completions API accepts a JSON payload with the following structure. Note: The model name is specified in the URL path, not in the request body.

Request Body Structure
{
  "messages": [
    {
      "role": "developer" | "system" | "user" | "assistant" | "tool",
      "content": array
    }
  ],
  "stream": true | false,  // optional, default: true,
  "include_thoughts": true | false,  // optional, default: true,
  "reasoning_effort": "low" | "high",  // optional, default: "high",
  "tools": [  // optional
    {
      "type": "function",
      "function": {
        "name": "googleSearch",
      }
    }
  ],
  "tools": [  // optional
    {
      "type": "function",
      "function": {
        "name": "yourFunctionName",
        "parameters": { /* function parameters here */ }
      }
    }
  ]
}

Parameters Details

messages
Required
array
An array of message objects. Each message has a role and content.
Supported message roles:
developer
Developer-provided instructions that the model should follow, regardless of user messages. In o1 models and newer versions, developer messages replace the previous system messages.
system
Developer-provided instructions that the model should follow, regardless of user messages. In o1 models and newer versions, please use developer messages instead.
user
Messages sent by end users, containing prompts or additional context information.
assistant
Messages sent by the model in response to user messages.
tool
Content of tool messages.
Content Array - Media Files:

Unified Media File Format:
In the content array, whether it's images, videos, audio, or other document types, all media files use the same format structure:
* The type field is always "image_url"
* The image_url field name remains unchanged
* The only thing that changes is the url value, which points to the corresponding media file address
For example: images, videos, audio, PDFs, and other documents all use the same { type: 'image_url', image_url: { url: '...' } } structure.
Example:
[
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
          "url": "https://file.aiquickdraw.com/custom-page/akr/section-images/1759055072437dqlsclj2.png"
        }
      }
    ]
  }
]

stream
Optional
boolean
If set to true, partial message deltas will be sent as server-sent events. Default is true.
Example:
true

include_thoughts
Optional
boolean
When set to true, the model's thinking process will be included in the response. Default is true.

Thinking Process:
When enabled, you can see the model's reasoning steps and thought process before it generates the final response. This is useful for understanding complex problem-solving and decision-making.
Example:
true

reasoning_effort
Optional
string
Controls the amount of reasoning effort the model should expend. Higher values result in more thorough reasoning but may increase latency. Default is "high".
Supported values:
low
Minimal reasoning effort, fastest response time. Suitable for simple queries.
high
Maximum reasoning effort, slower response time. Best for complex problems requiring deep analysis. Default value.
Example:
"high"

tools
Optional
array
An optional array that allows you to define functions the model can call. The array can contain multiple objects. When using function calling, you can define multiple functions in the array.

Mutual Exclusivity:
Google Search and function calling are mutually exclusive: You cannot use Google Search and function calling in the same request. Please choose one based on your needs.
Example (Google Search):
[
  {
    "type": "function",
    "function": {
      "name": "googleSearch"
    }
  }
]
Example (Custom Functions):
[
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get the current weather in a given location",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA"
          },
          "unit": {
            "type": "string",
            "enum": [
              "celsius",
              "fahrenheit"
            ]
          }
        },
        "required": [
          "location"
        ]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_stock_price",
      "description": "Get the current stock price",
      "parameters": {
        "type": "object",
        "properties": {
          "symbol": {
            "type": "string",
            "description": "Stock symbol, e.g. AAPL"
          }
        },
        "required": [
          "symbol"
        ]
      }
    }
  }
]

Request Example

cURL
curl -X POST "https://api.kie.ai/gemini-3.1-pro/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
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
              "url": "https://file.aiquickdraw.com/custom-page/akr/section-images/1759055072437dqlsclj2.png"
            }
          }
        ]
      }
    ],
    "stream": true,
    "include_thoughts": true,
    "reasoning_effort": "high",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "googleSearch"
        }
      }
    ]
  }'

Response Format (200 Success)

Response Fields:
id
Unique identifier for the chat completion (string, e.g. "chatcmpl-example-123")
object
The object type (string, e.g. "chat.completion" or "chat.completion.chunk" for streaming)
created
Unix timestamp of when the completion was created (integer int64)
model
The model used for generation (string)
choices
Array of completion choices
choices[].index
The index of the choice in the array (integer)
choices[].message (non-streaming) / choices[].delta (streaming)
The message/delta content
choices[].message.role / choices[].delta.role
The role of the message (string, "assistant")
choices[].message.content / choices[].delta.content
The content of the message (string)
choices[].delta.reasoning_content
The reasoning process content when include_thoughts is enabled (streaming only)
choices[].finish_reason
The reason the completion finished (string, "stop" when complete, null for ongoing)
credits_consumed
The number of credits consumed for this request (in final streaming chunk)
usage
Token usage statistics (in final streaming chunk or non-streaming response)
usage.prompt_tokens
Number of tokens in the prompt (integer)
usage.completion_tokens
Number of tokens in the completion (integer)
usage.completion_tokens_details
Detailed breakdown of completion tokens
usage.completion_tokens_details.reasoning_tokens
Number of tokens used for reasoning process
usage.completion_tokens_details.text_tokens
Number of tokens used for text content
usage.completion_tokens_details.audio_tokens
Number of tokens used for audio content
usage.total_tokens
Total tokens used (integer)
system_fingerprint
System fingerprint for the completion (in final chunk)
[DONE]
Final marker indicating the stream has ended

Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid request parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 402 | Insufficient Credits - Account does not have enough credits |
| 404 | Not Found - The requested resource or endpoint does not exist |
| 422 | Validation Error - Request parameters failed validation checks |
| 429 | Rate Limited - Too many requests |
| 455 | Service Unavailable - System is currently undergoing maintenance |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Generation Failed - Content generation task failed |
| 505 | Feature Disabled - The requested feature is currently disabled |

Authentication
Bearer Token (API Key)
Header: Authorization: Bearer YOUR_API_KEY
API Key management: https://kie.ai/api-key

Notes:
- Gemini 3.1 Pro는 gemini-3-pro (3.0)와 동일한 OpenAI 호환 API 구조
- 엔드포인트 슬러그만 다름: gemini-3.1-pro vs gemini-3-pro
- Multimodal 지원: 텍스트, 이미지, 영상, 오디오, 문서 (모두 image_url 포맷)
- Google Search grounding 지원
- v1beta 엔드포인트 없음 — chat/completions (OpenAI 호환)만 지원

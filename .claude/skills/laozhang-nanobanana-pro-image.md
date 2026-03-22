📌나노바나나 프로 laozhang.ai API 기술 문서

Nano Banana Pro
Nano Banana Pro Text-to-Image
Nano Banana Pro Text-to-Image API: Google Gemini 3 Pro image generation. Supports 4K HD, complex instruction understanding, thinking mode. Only $0.05/image, 80% off official price.

🚀 Nano Banana Pro (Gemini 3) Now Available! This is Google’s most powerful image generation model.
* 		4K Quality: Supports 1K, 2K, 4K resolutions
* 		Ultra Intelligent: Based on Gemini 3 architecture, precise understanding of complex prompts
* 		Best Value: Only **0.05 / i m a g e ∗ ∗ ( 80    0.05/image∗∗(800.24)


🎁 Free Trial
Register and get $0.05 credit to test Nano Banana Pro once


🚀 Live Demo
AI Images - Try instantly, no code required
​

Prerequisites

1

Get API Key
Login to laozhang.ai console to get your API key

2

Configure Billing Mode
Edit token settings and select one of these billing modes (same price):
* 		Pay-per-use Priority (Recommended): Use balance first, auto-switch when insufficient. Best for most users
* 		Pay-per-use: Direct charge per request. Best for strict budget control

Both modes have identical pricing at $0.05/image, only the billing method differs.
￼


API calls will fail without proper billing configuration. Complete this setup first!
​

Model Overview
Nano Banana Pro is LaoZhang API’s custom name for Google’s Gemini 3 Pro Image Preview (gemini-3-pro-image-preview) model. Designed for professional use cases requiring ultimate image quality and complex semantic understanding.
​

Core Advantages
1. 🌟 Native 4K Resolution: Generate up to 4096×4096 ultra-high-definition images.
2. 🧠 Gemini 3 Intelligence: Built-in logical reasoning, understands abstract descriptions like “a cat looking at an empty bowl with disappointment after missing breakfast”.
3. 💪 Complex Composition: Precise control over object placement, quantity, and text rendering.
4. 💰 Best Price: $0.05/image, breaking industry price barriers.
​

🌟 Core Features
* 		⚡ Fast Response: ~10 seconds average, significantly faster than OpenAI series
* 		💰 Great Value: 0.05 / i m a g e ( 79    0.05/image(790.24)
* 		🔄 Dual Compatibility: Supports OpenAI SDK and Google native formats
* 		📐 Flexible Sizes: Google native format supports 10 aspect ratios
* 		🖼️ High Resolution: Supports 1K, 2K, 4K resolutions
* 		🧠 Thinking Mode: Built-in reasoning process, optimizes composition before generation (enabled by default)
* 		🌐 Search Grounding: Supports Google Search for fact verification and image generation
* 		🎨 Multi-Image Reference: Supports up to 14 reference images (6 objects + 5 characters, etc.)
* 		📦 Base64 Output: Returns base64 encoded image data directly, no secondary download needed
​

🔀 Two API Modes
Nano Banana Pro supports two endpoints, each with unique advantages:

Feature	OpenAI Compatible Mode	Google Native Format
Endpoint	/v1/chat/completions	/v1beta/models/gemini-3-pro-image-preview:generateContent
Model Name	gemini-3-pro-image-preview	Specified in URL
Image Size	Fixed 1:1	10 aspect ratios
Resolution	Fixed 1K	1K/2K/4K
Compatibility	Perfect with OpenAI SDK	Requires native calls
Return Format	Base64	Base64
Use Case	Quick migration, simple needs	Custom sizes or high resolution
💡 How to Choose?
* 		For square (1:1) images only, use OpenAI Compatible Mode - simpler
* 		For widescreen (16:9), portrait (9:16), or other specific ratios or high-res (2K/4K), use Google Native Format
​

📋 Model Comparison
​

Comparison with Other Image Models

Model	Model ID	Billing	LaoZhang API Price	Official Price	Savings	Resolution	Speed
Nano Banana Pro	gemini-3-pro-image-preview	Per-use	$0.05/image	$0.24/image	79%	1K/2K/4K	~10s
Nano Banana	gemini-2.5-flash-image	Per-use	$0.025/image	$0.04/image	37.5%	1K (fixed)	~10s
GPT-Image-1	gpt-image-1	Token-based	10
i
n
p
u
t
/
10input/40 output per M	-	-	-	Medium
Flux Kontext Pro	flux-kontext-pro	Per-use	$0.035/image	$0.04/image	12.5%	-	Fast
Sora Image	sora_image	Per-use	$0.01/image	-	-	-	Slower
💰 Price Advantage Details
* 		Nano Banana Pro: 0.05 / i m a g e ( L a o Z h a n g A P I ) v s    0.05/image(LaoZhangAPI)vs0.24/image (official), 79% cheaper
* 		Bonus: Get +10% bonus on large deposits
* 		Exchange Rate: Paying in CNY is even more cost-effective
Nano Banana Pro offers exceptional value at LaoZhang API!
​

🚀 Quick Start
​

Prerequisites

1

Create Token
Login to LaoZhang API Token Management and create a pay-per-use type token
￼


2

Select Billing Type
Important: Must select “Pay-per-use” type, not “Pay-as-you-go”

3

Save Token
Copy the generated token in format sk-xxxxxx
​

Method 1: OpenAI Compatible Mode (1:1 Images)
Best for quick integration, generates 1024x1024 (1K) images by default.
​

Basic Example - Curl
curl -X POST "https://api.laozhang.ai/v1/chat/completions" \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
    "model": "gemini-3-pro-image-preview",
    "stream": false,
    "messages": [
        {
            "role": "user",
            "content": "a beautiful sunset over mountains"
        }
    ]
}'

​

Python SDK Example
from openai import OpenAI
import base64
import re

client = OpenAI(
    api_key="sk-YOUR_API_KEY",
    base_url="https://api.laozhang.ai/v1"
)

response = client.chat.completions.create(
    model="gemini-3-pro-image-preview",
    messages=[
        {
            "role": "user",
            "content": "a beautiful sunset over mountains"
        }
    ]
)

# Extract base64 image data
content = response.choices[0].message.content
match = re.search(r'!\[.*?\]\((data:image/png;base64,.*?)\)', content)

if match:
    base64_data = match.group(1).split(',')[1]
    image_data = base64.b64decode(base64_data)

    with open('output.png', 'wb') as f:
        f.write(image_data)
    print("✅ Image saved: output.png")

​

Method 2: Google Native Format (Custom Aspect Ratio + 4K)
Best for 4K resolution or custom aspect ratio needs.
​

Supported Aspect Ratios

Type	Aspect Ratio Options
Landscape	21:9 (Ultra-wide), 16:9 (Widescreen), 4:3, 3:2
Square	1:1
Portrait	9:16 (Vertical), 3:4, 2:3
Other	5:4, 4:5
​

Supported Resolutions

Aspect Ratio	1K Resolution	2K Resolution	4K Resolution
1:1	1024×1024	2048×2048	4096×4096
16:9	1376×768	2752×1536	5504×3072
9:16	768×1376	1536×2752	3072×5504
4:3	1200×896	2400×1792	4800×3584
3:4	896×1200	1792×2400	3584×4800
21:9	1584×672	3168×1344	6336×2688
3:2	1248×832	2496×1664	4992×3328
2:3	832×1248	1664×2496	3328×4992
5:4	1152×896	2304×1792	4608×3584
4:5	896×1152	1792×2304	3584×4608
💡 Resolution Selection Guide
* 		1K: Best for web display, social media, quick previews
* 		2K: Best for high-quality printing, professional display
* 		4K: Best for large prints, professional design, extreme detail
​

Complete Curl Example (Text-to-Image 4K)
#!/bin/bash

# 1. Set API Key
export API_KEY="sk-YOUR_API_KEY"

# 2. Send request (Generate 4K image with Nano Banana Pro)
curl -s -X POST "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "A futuristic city skyline at sunset, high detailed, 4k"}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9",
        "imageSize": "4K"
      }
    }
  }' \
  | jq -r '.candidates[0].content.parts[0].inlineData.data' \
  | base64 --decode > output_4k.png

echo "✅ Image saved: output_4k.png"

​

Python Code Examples

💡 Progressive Examples Example 1 generates image → Example 2 transforms its style → Example 3 fuses both images. Clear progression!


Example 1: Text-to-Image → Generate First Image



Example 2: Image-to-Image → Use First Image to Generate Second



Example 3: Multi-Image Mix → Use First and Second to Generate Third



Complete Demo Script (All Three Scenarios)

​

Bash Script Example


Expand to view complete Bash script (with aspect ratio config)

​

🚀 Gemini 3 Pro Advanced Features (Nano Banana Pro Exclusive)
​

🧠 Thinking Mode
Nano Banana Pro has built-in reasoning capability that automatically optimizes composition and logic before generating images to ensure higher quality output. This feature is enabled by default, no extra configuration needed.

💡 Thinking Mode Advantages
* 		Automatically optimizes composition and layout
* 		Understands complex multi-step instructions
* 		Creates temporary “thinking images” during generation (backend only, no extra charge)
* 		Final output is higher quality and more aligned with expectations
​

🌐 Google Search Grounding
The model can use Google Search as a tool to generate images using real-time data (weather, stock prices, news).
curl -s -X POST "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart."}]}],
    "tools": [{"google_search": {}}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {"aspectRatio": "16:9"}
    }
  }'


Note: When using search grounding, responseModalities must include "TEXT" (i.e., ["TEXT", "IMAGE"]). Pure image mode cannot return search results.
​

🎨 Multi-Image Reference (Reference Images)
Nano Banana Pro supports mixing up to 14 reference images:
* 		Up to 6 high-fidelity object images (for inclusion in final image)
* 		Up to 5 person images (for maintaining character consistency)
# Multi-Image Reference Example (Python)
import requests
import base64

API_KEY = "sk-YOUR_API_KEY"
API_URL = "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent"

# Prepare multiple reference images
image_paths = ["cat.jpg", "apple.jpg"]
parts = [{"text": "Combine these images: a cat eating an apple on a table"}]

for path in image_paths:
    with open(path, "rb") as f:
        image_data = base64.b64encode(f.read()).decode("utf-8")
    parts.append({
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": image_data
        }
    })

# Send request
response = requests.post(
    API_URL,
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": "16:9",
                "imageSize": "2K"
            }
        }
    }
)


💡 Multi-Image Reference Best Practices
* 		Object images: For product composition, scene building
* 		Person images: Maintain character appearance consistency (for image series)
* 		Combined use: Create complex visual narratives
​

💡 Best Practices
​

Prompt Optimization

Clear Description
Use specific, detailed descriptions including subject, style, color, lighting, etc.

Reference Style
Specify art styles: “oil painting style”, “watercolor”, “cyberpunk style”, etc.

Avoid Vagueness
Avoid overly abstract or vague terms

English First
English prompts typically work better, but Chinese is also supported
​

Aspect Ratio Selection Guide

Use Case	Recommended Ratio
Social media landscape	16:9
Phone wallpaper/vertical	9:16
Instagram square	1:1
Print photos	4:3 or 3:2
Movie posters	2:3
Banner ads	21:9



———————————



Nano Banana Pro
Nano Banana Pro Image Editing
Nano Banana Pro Image Editing API: Professional image editing powered by Gemini 3 Pro. $0.05/edit, supports 4K output, complex instructions, multi-image fusion (up to 14 images).

🧠 Intelligent Editing at New Heights Nano Banana Pro Edit uses Google’s Gemini 3 Pro model with exceptional semantic understanding. It doesn’t just “modify images” - it “understands and redraws” them.


🎁 Free Trial
Register and get $0.05 credit to test Nano Banana Pro once


🚀 Live Demo
AI Images - Try instantly, no code required
​

Prerequisites

1

Get API Key
Login to laozhang.ai console to get your API key

2

Configure Billing Mode
Edit token settings and select one of these billing modes (same price):
* 		Pay-per-use Priority (Recommended): Use balance first, auto-switch when insufficient
* 		Pay-per-use: Direct charge per request. Best for strict budget control

Both modes have identical pricing at $0.05/edit, only the billing method differs.
￼


API calls will fail without proper billing configuration. Complete this setup first!
​

Model Overview
Nano Banana Pro Edit (gemini-3-pro-image-preview) is designed for scenarios requiring precise control and high-quality output. Unlike simple filters or patches, it understands complex natural language instructions and makes logical modifications to images.
​

Core Capabilities
* 		Precise Local Editing: “Replace that cat with a dog wearing glasses, but keep the same pose”
* 		Perfect Style Transfer: “Transform this photo into cyberpunk-style oil painting with stronger lighting”
* 		Multi-Image Creative Fusion: “Combine these two images to generate a brand new poster”
* 		4K HD Output: Supports 2K/4K resolution output for edited results
​

🌟 Core Features
* 		⚡ Fast Response: ~10 seconds average for editing
* 		💰 Great Value: 0.05 / e d i t ( 79    0.05/edit(790.24)
* 		🔄 Dual Compatibility: Supports OpenAI SDK and Google native formats
* 		📐 Flexible Sizes: Google native format supports 10 aspect ratios
* 		🖼️ High Resolution: Supports 1K, 2K, 4K resolution output
* 		🧠 Thinking Mode: Built-in reasoning ability, understands complex editing instructions
* 		🌐 Search Grounding: Supports combining real-time search data for editing
* 		🎨 Multi-Image Reference: Supports up to 14 reference images for complex compositing
* 		📦 Base64 Output: Returns base64 encoded image data directly
* 		🔗 URL Direct Input: Google native format supports direct image URL input (overseas accessible required), no Base64 encoding needed
​

🔀 Two API Modes

Feature	OpenAI Compatible Mode	Google Native Format
Endpoint	/v1/chat/completions	/v1beta/models/gemini-3-pro-image-preview:generateContent
Output Size	Default ratio	10 aspect ratios
Resolution	Fixed 1K	1K/2K/4K
Multi-Image	✅ Supported	✅ Supported (up to 14)
Compatibility	Perfect with OpenAI SDK	Requires native calls
Return Format	Base64	Base64
Image Input	URL or Base64	URL (fileData) or Base64 (inline_data)
💡 How to Choose?
* 		For default ratio images, use OpenAI Compatible Mode - simple and fast
* 		For custom aspect ratios (like 16:9, 9:16) or high-res (2K/4K), use Google Native Format
​

📋 Model Comparison
​

Comparison with Other Editing Models

Model	Model ID	Billing	LaoZhang Price	Official Price	Savings	Resolution	Speed
Nano Banana Pro	gemini-3-pro-image-preview	Per-use	$0.05/edit	$0.24/edit	79%	1K/2K/4K	~10s
Nano Banana	gemini-2.5-flash-image	Per-use	$0.025/edit	$0.04/edit	37.5%	1K (fixed)	~10s
GPT-4o Edit	gpt-4o	Token	-	-	-	-	~20s
DALL·E 2 Edit	dall-e-2	Per-use	-	$0.018/image	-	Fixed	Slower
​

Pro vs Standard Detailed Comparison

Feature	Nano Banana Pro	Nano Banana
Model	gemini-3-pro-image-preview	gemini-2.5-flash-image
Technology	Gemini 3	Gemini 2.5
Resolution	1K/2K/4K	1K (fixed)
Price	$0.05/edit	$0.025/edit
Thinking Mode	✅ Yes	❌ No
Search Grounding	✅ Yes	❌ No
Multi-Image	Up to 14	Up to 3
Speed	~10s	~10s
Best For	Professional design, complex compositing	Quick edits, simple modifications
💰 Price Advantage
* 		Nano Banana Pro: 0.05 / e d i t ( L a o Z h a n g A P I ) v s    0.05/edit(LaoZhangAPI)vs0.24/edit (official), 79% cheaper
* 		Bonus: Get +10% bonus on large deposits
* 		Exchange Rate: Paying in CNY is even more cost-effective
Nano Banana Pro offers exceptional value at LaoZhang API!
​

🚀 Quick Start
​

Prerequisites

1

Create Token
Login to LaoZhang API Token Management and create a pay-per-use type token
￼


2

Select Billing Type
Important: Must select “Pay-per-use” type

3

Save Token
Copy the generated token in format sk-xxxxxx
​

Method 1: OpenAI Compatible Mode
​

Single Image Edit - Curl
curl -X POST "https://api.laozhang.ai/v1/chat/completions" \
     -H "x-goog-api-key: sk-YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
    "model": "gemini-3-pro-image-preview",
    "stream": false,
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Add a futuristic neon halo above the person head"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/your-image.jpg"
                    }
                }
            ]
        }
    ]
}'

​

Single Image Edit - Python SDK
from openai import OpenAI
import base64
import re

client = OpenAI(
    api_key="sk-YOUR_API_KEY",
    base_url="https://api.laozhang.ai/v1"
)

response = client.chat.completions.create(
    model="gemini-3-pro-image-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Add a cute wizard hat on this cat's head"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/your-image.jpg"
                    }
                }
            ]
        }
    ]
)

# Extract and save image
content = response.choices[0].message.content
match = re.search(r'!\[.*?\]\((data:image/png;base64,.*?)\)', content)

if match:
    base64_data = match.group(1).split(',')[1]
    image_data = base64.b64decode(base64_data)

    with open('edited.png', 'wb') as f:
        f.write(image_data)
    print("✅ Edited image saved: edited.png")

​

Multi-Image Compositing - Python SDK
from openai import OpenAI
import base64
import re

client = OpenAI(
    api_key="sk-YOUR_API_KEY",
    base_url="https://api.laozhang.ai/v1"
)

response = client.chat.completions.create(
    model="gemini-3-pro-image-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Combine the style of image A with the content of image B"
                },
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/style.jpg"}
                },
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/content.jpg"}
                }
            ]
        }
    ]
)

# Extract and save image
content = response.choices[0].message.content
match = re.search(r'!\[.*?\]\((data:image/png;base64,.*?)\)', content)

if match:
    base64_data = match.group(1).split(',')[1]
    image_data = base64.b64decode(base64_data)

    with open('merged.png', 'wb') as f:
        f.write(image_data)
    print("✅ Merged image saved: merged.png")

​

Method 2: Google Native Format (Custom Aspect Ratio + 4K)
​

Authentication Methods
Google native format supports three authentication methods:
# Method 1: URL parameter (recommended, simplest)
https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent?key=sk-YOUR_API_KEY

# Method 2: Authorization Bearer Header
-H "Authorization: Bearer sk-YOUR_API_KEY"

# Method 3: x-goog-api-key Header
-H "x-goog-api-key: sk-YOUR_API_KEY"


💡 All three methods work the same. Choose whichever you prefer.
​

Supported Resolutions

Aspect Ratio	1K Resolution	2K Resolution	4K Resolution
1:1	1024×1024	2048×2048	4096×4096
16:9	1376×768	2752×1536	5504×3072
9:16	768×1376	1536×2752	3072×5504
4:3	1200×896	2400×1792	4800×3584
3:4	896×1200	1792×2400	3584×4800
💡 How to Set Resolution Pass "2K" or "4K" in generationConfig.imageConfig.imageSize. Default is "1K" if not specified.
​

Image Input Methods
Google native format supports two image input methods:

💡 Two Methods Comparison
* 		inline_data: Pass Base64 encoded data, suitable for local images
* 		fileData: Pass image URL directly, more concise (recommended for online images)

⚠️ URL Method Limitations When using fileData.fileUri to pass image URL, the following conditions must be met:
* 		Image URL must be directly accessible from overseas public network
* 		Image server must not have anti-crawling mechanisms (e.g., Cloudflare verification, CAPTCHA, User-Agent detection)
* 		For images on domestic CDN or with access restrictions, use inline_data method (download first, then convert to Base64)
​

4K HD Editing - Curl (Base64 Method)
curl -X POST "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: sk-YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Transform this image into a cyberpunk style with neon lights"},
        {"inline_data": {"mime_type": "image/jpeg", "data": "BASE64_IMAGE_DATA_HERE"}}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9",
        "imageSize": "4K"
      }
    }
  }'

​

4K HD Editing - Curl (URL Method)
Use fileData.fileUri to pass online image URL directly, no Base64 conversion needed:
curl -X POST "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: sk-YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {
          "fileData": {
            "fileUri": "https://example.com/your-image.png",
            "mimeType": "image/png"
          }
        },
        {"text": "Add five cute dogs to this image"}
      ],
      "role": "user"
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9",
        "imageSize": "4K"
      }
    }
  }'


💡 URL Method Key Points
* 		Use fileData.fileUri instead of inline_data.data
* 		Must specify mimeType (e.g., image/png, image/jpeg)
* 		Optionally add role: "user" to specify the role
* 		Image URL must be directly accessible from overseas public network
​

Python Code Examples

💡 Progressive Examples Example 1 edits image → Example 2 transforms its style → Example 3 fuses both images. Clear progression!


Example 1: Single Image Edit → Add Elements to First Image



Example 2: Style Transfer → Use First Image to Generate Second



Example 3: Multi-Image Fusion → Use First and Second to Generate Third



Example 4: Edit Online Image Using URL Method



Complete Python Tool Script

​

🎯 Editing Scenarios
​

1. Single Image Edit - Add Elements
def add_element_to_image(image_url, element_description):
    """Add new elements to image"""
    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "model": "gemini-3-pro-image-preview",
        "stream": False,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": f"Add {element_description} to this image"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]
        }]
    }

    response = requests.post(API_URL, headers=headers, json=data)
    return extract_base64_from_response(response.json())

# Usage example
result = add_element_to_image(
    "https://example.com/landscape.jpg",
    "a rainbow in the sky"
)

​

2. Style Transfer
def style_transfer(image_url, style_description):
    """Image style transfer"""
    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "model": "gemini-3-pro-image-preview",
        "stream": False,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": f"Transform this image into {style_description} style"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]
        }]
    }

    response = requests.post(API_URL, headers=headers, json=data)
    return extract_base64_from_response(response.json())

# Usage example
result = style_transfer(
    "https://example.com/photo.jpg",
    "Van Gogh oil painting"
)

​

3. Multi-Image Compositing
def creative_merge(image_urls, merge_instruction):
    """Creatively merge multiple images"""
    content = [{"type": "text", "text": merge_instruction}]

    for url in image_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })

    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "model": "gemini-3-pro-image-preview",
        "stream": False,
        "messages": [{"role": "user", "content": content}]
    }

    response = requests.post(API_URL, headers=headers, json=data)
    return extract_base64_from_response(response.json())

# Usage example
images = ["https://example.com/cat.jpg", "https://example.com/background.jpg"]
result = creative_merge(images, "Naturally blend the cat into the background")

​

💡 Best Practices
​

Edit Instruction Optimization
# ❌ Vague instruction
instruction = "edit the image"

# ✅ Clear and specific instruction
instruction = """
1. Add a bright moon in the upper right corner
2. Adjust overall color tone to warm tones
3. Add some firefly light effects
4. Keep the main subject unchanged
"""

​

Multi-Image Processing Strategy
def smart_multi_image_edit(images, instruction):
    """Smart multi-image editing"""

    if len(images) == 1:
        prompt = f"Edit this image: {instruction}"
    elif len(images) == 2:
        prompt = f"Combine these two images creatively: {instruction}"
    else:
        prompt = f"Process these {len(images)} images together: {instruction}"

    # Build content...
    return send_edit_request(content)

📌 laozhang.ai 나노바나나 프로 이미지 투 이미지 기술문서

Nano Banana Pro
Nano Banana Pro Image Editing
Nano Banana Pro Image Editing API: Professional image editing powered by Gemini 3 Pro. $0.05/edit, supports 4K output, complex instructions, multi-image fusion (up to 14 images).

🧠 Intelligent Editing at New Heights Nano Banana Pro Edit uses Google’s Gemini 3 Pro model with exceptional semantic understanding. It doesn’t just “modify images” - it “understands and redraws” them.


🎁 Free Trial
Register and get $0.05 credit to test Nano Banana Pro once


🚀 Live Demo
AI Images - Try instantly, no code required
​

Prerequisites

1

Get API Key
Login to laozhang.ai console to get your API key

2

Configure Billing Mode
Edit token settings and select one of these billing modes (same price):
* 		Pay-per-use Priority (Recommended): Use balance first, auto-switch when insufficient
* 		Pay-per-use: Direct charge per request. Best for strict budget control

Both modes have identical pricing at $0.05/edit, only the billing method differs.
￼


API calls will fail without proper billing configuration. Complete this setup first!
​

Model Overview
Nano Banana Pro Edit (gemini-3-pro-image-preview) is designed for scenarios requiring precise control and high-quality output. Unlike simple filters or patches, it understands complex natural language instructions and makes logical modifications to images.
​

Core Capabilities
* 		Precise Local Editing: “Replace that cat with a dog wearing glasses, but keep the same pose”
* 		Perfect Style Transfer: “Transform this photo into cyberpunk-style oil painting with stronger lighting”
* 		Multi-Image Creative Fusion: “Combine these two images to generate a brand new poster”
* 		4K HD Output: Supports 2K/4K resolution output for edited results
​

🌟 Core Features
* 		⚡ Fast Response: ~10 seconds average for editing
* 		💰 Great Value: 0.05 / e d i t ( 79    0.05/edit(790.24)
* 		🔄 Dual Compatibility: Supports OpenAI SDK and Google native formats
* 		📐 Flexible Sizes: Google native format supports 10 aspect ratios
* 		🖼️ High Resolution: Supports 1K, 2K, 4K resolution output
* 		🧠 Thinking Mode: Built-in reasoning ability, understands complex editing instructions
* 		🌐 Search Grounding: Supports combining real-time search data for editing
* 		🎨 Multi-Image Reference: Supports up to 14 reference images for complex compositing
* 		📦 Base64 Output: Returns base64 encoded image data directly
* 		🔗 URL Direct Input: Google native format supports direct image URL input (overseas accessible required), no Base64 encoding needed
​

🔀 Two API Modes

Feature	OpenAI Compatible Mode	Google Native Format
Endpoint	/v1/chat/completions	/v1beta/models/gemini-3-pro-image-preview:generateContent
Output Size	Default ratio	10 aspect ratios
Resolution	Fixed 1K	1K/2K/4K
Multi-Image	✅ Supported	✅ Supported (up to 14)
Compatibility	Perfect with OpenAI SDK	Requires native calls
Return Format	Base64	Base64
Image Input	URL or Base64	URL (fileData) or Base64 (inline_data)
💡 How to Choose?
* 		For default ratio images, use OpenAI Compatible Mode - simple and fast
* 		For custom aspect ratios (like 16:9, 9:16) or high-res (2K/4K), use Google Native Format
​

📋 Model Comparison
​

Comparison with Other Editing Models

Model	Model ID	Billing	LaoZhang Price	Official Price	Savings	Resolution	Speed
Nano Banana Pro	gemini-3-pro-image-preview	Per-use	$0.05/edit	$0.24/edit	79%	1K/2K/4K	~10s
Nano Banana	gemini-2.5-flash-image	Per-use	$0.025/edit	$0.04/edit	37.5%	1K (fixed)	~10s
GPT-4o Edit	gpt-4o	Token	-	-	-	-	~20s
DALL·E 2 Edit	dall-e-2	Per-use	-	$0.018/image	-	Fixed	Slower
​

Pro vs Standard Detailed Comparison

Feature	Nano Banana Pro	Nano Banana
Model	gemini-3-pro-image-preview	gemini-2.5-flash-image
Technology	Gemini 3	Gemini 2.5
Resolution	1K/2K/4K	1K (fixed)
Price	$0.05/edit	$0.025/edit
Thinking Mode	✅ Yes	❌ No
Search Grounding	✅ Yes	❌ No
Multi-Image	Up to 14	Up to 3
Speed	~10s	~10s
Best For	Professional design, complex compositing	Quick edits, simple modifications
💰 Price Advantage
* 		Nano Banana Pro: 0.05 / e d i t ( L a o Z h a n g A P I ) v s    0.05/edit(LaoZhangAPI)vs0.24/edit (official), 79% cheaper
* 		Bonus: Get +10% bonus on large deposits
* 		Exchange Rate: Paying in CNY is even more cost-effective
Nano Banana Pro offers exceptional value at LaoZhang API!
​

🚀 Quick Start
​

Prerequisites

1

Create Token
Login to LaoZhang API Token Management and create a pay-per-use type token
￼


2

Select Billing Type
Important: Must select “Pay-per-use” type

3

Save Token
Copy the generated token in format sk-xxxxxx
​

Method 1: OpenAI Compatible Mode
​

Single Image Edit - Curl


curl -X POST "https://api.laozhang.ai/v1/chat/completions" \
     -H "x-goog-api-key: sk-YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
    "model": "gemini-3-pro-image-preview",
    "stream": false,
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Add a futuristic neon halo above the person head"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/your-image.jpg"
                    }
                }
            ]
        }
    ]
}'

​

Single Image Edit - Python SDK

Copy
from openai import OpenAI
import base64
import re

client = OpenAI(
    api_key="sk-YOUR_API_KEY",
    base_url="https://api.laozhang.ai/v1"
)

response = client.chat.completions.create(
    model="gemini-3-pro-image-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Add a cute wizard hat on this cat's head"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/your-image.jpg"
                    }
                }
            ]
        }
    ]
)

# Extract and save image
content = response.choices[0].message.content
match = re.search(r'!\[.*?\]\((data:image/png;base64,.*?)\)', content)

if match:
    base64_data = match.group(1).split(',')[1]
    image_data = base64.b64decode(base64_data)

    with open('edited.png', 'wb') as f:
        f.write(image_data)
    print("✅ Edited image saved: edited.png")

​

Multi-Image Compositing - Python SDK

Copy
from openai import OpenAI
import base64
import re

client = OpenAI(
    api_key="sk-YOUR_API_KEY",
    base_url="https://api.laozhang.ai/v1"
)

response = client.chat.completions.create(
    model="gemini-3-pro-image-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Combine the style of image A with the content of image B"
                },
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/style.jpg"}
                },
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/content.jpg"}
                }
            ]
        }
    ]
)

# Extract and save image
content = response.choices[0].message.content
match = re.search(r'!\[.*?\]\((data:image/png;base64,.*?)\)', content)

if match:
    base64_data = match.group(1).split(',')[1]
    image_data = base64.b64decode(base64_data)

    with open('merged.png', 'wb') as f:
        f.write(image_data)
    print("✅ Merged image saved: merged.png")

​

Method 2: Google Native Format (Custom Aspect Ratio + 4K)
​

Authentication Methods
Google native format supports three authentication methods:

Copy
# Method 1: URL parameter (recommended, simplest)
https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent?key=sk-YOUR_API_KEY

# Method 2: Authorization Bearer Header
-H "Authorization: Bearer sk-YOUR_API_KEY"

# Method 3: x-goog-api-key Header
-H "x-goog-api-key: sk-YOUR_API_KEY"


💡 All three methods work the same. Choose whichever you prefer.
​

Supported Resolutions

Aspect Ratio	1K Resolution	2K Resolution	4K Resolution
1:1	1024×1024	2048×2048	4096×4096
16:9	1376×768	2752×1536	5504×3072
9:16	768×1376	1536×2752	3072×5504
4:3	1200×896	2400×1792	4800×3584
3:4	896×1200	1792×2400	3584×4800
💡 How to Set Resolution Pass "2K" or "4K" in generationConfig.imageConfig.imageSize. Default is "1K" if not specified.
​

Image Input Methods
Google native format supports two image input methods:

💡 Two Methods Comparison
* 		inline_data: Pass Base64 encoded data, suitable for local images
* 		fileData: Pass image URL directly, more concise (recommended for online images)

⚠️ URL Method Limitations When using fileData.fileUri to pass image URL, the following conditions must be met:
* 		Image URL must be directly accessible from overseas public network
* 		Image server must not have anti-crawling mechanisms (e.g., Cloudflare verification, CAPTCHA, User-Agent detection)
* 		For images on domestic CDN or with access restrictions, use inline_data method (download first, then convert to Base64)
​

4K HD Editing - Curl (Base64 Method)

Copy
curl -X POST "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: sk-YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Transform this image into a cyberpunk style with neon lights"},
        {"inline_data": {"mime_type": "image/jpeg", "data": "BASE64_IMAGE_DATA_HERE"}}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9",
        "imageSize": "4K"
      }
    }
  }'

​

4K HD Editing - Curl (URL Method)
Use fileData.fileUri to pass online image URL directly, no Base64 conversion needed:

Copy
curl -X POST "https://api.laozhang.ai/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: sk-YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {
          "fileData": {
            "fileUri": "https://example.com/your-image.png",
            "mimeType": "image/png"
          }
        },
        {"text": "Add five cute dogs to this image"}
      ],
      "role": "user"
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9",
        "imageSize": "4K"
      }
    }
  }'


💡 URL Method Key Points
* 		Use fileData.fileUri instead of inline_data.data
* 		Must specify mimeType (e.g., image/png, image/jpeg)
* 		Optionally add role: "user" to specify the role
* 		Image URL must be directly accessible from overseas public network
​

Python Code Examples

💡 Progressive Examples Example 1 edits image → Example 2 transforms its style → Example 3 fuses both images. Clear progression!


Example 1: Single Image Edit → Add Elements to First Image





Example 2: Style Transfer → Use First Image to Generate Second





Example 3: Multi-Image Fusion → Use First and Second to Generate Third





Example 4: Edit Online Image Using URL Method





Complete Python Tool Script



​

🎯 Editing Scenarios
​

1. Single Image Edit - Add Elements

Copy
def add_element_to_image(image_url, element_description):
    """Add new elements to image"""
    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "model": "gemini-3-pro-image-preview",
        "stream": False,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": f"Add {element_description} to this image"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]
        }]
    }

    response = requests.post(API_URL, headers=headers, json=data)
    return extract_base64_from_response(response.json())

# Usage example
result = add_element_to_image(
    "https://example.com/landscape.jpg",
    "a rainbow in the sky"
)

​

2. Style Transfer

Copy
def style_transfer(image_url, style_description):
    """Image style transfer"""
    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "model": "gemini-3-pro-image-preview",
        "stream": False,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": f"Transform this image into {style_description} style"},
                {"type": "image_url", "image_url": {"url": image_url}}
            ]
        }]
    }

    response = requests.post(API_URL, headers=headers, json=data)
    return extract_base64_from_response(response.json())

# Usage example
result = style_transfer(
    "https://example.com/photo.jpg",
    "Van Gogh oil painting"
)

​

3. Multi-Image Compositing

Copy
def creative_merge(image_urls, merge_instruction):
    """Creatively merge multiple images"""
    content = [{"type": "text", "text": merge_instruction}]

    for url in image_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })

    headers = {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
    }

    data = {
        "model": "gemini-3-pro-image-preview",
        "stream": False,
        "messages": [{"role": "user", "content": content}]
    }

    response = requests.post(API_URL, headers=headers, json=data)
    return extract_base64_from_response(response.json())

# Usage example
images = ["https://example.com/cat.jpg", "https://example.com/background.jpg"]
result = creative_merge(images, "Naturally blend the cat into the background")

​

💡 Best Practices
​

Edit Instruction Optimization

Copy
# ❌ Vague instruction
instruction = "edit the image"

# ✅ Clear and specific instruction
instruction = """
1. Add a bright moon in the upper right corner
2. Adjust overall color tone to warm tones
3. Add some firefly light effects
4. Keep the main subject unchanged
"""

​

Multi-Image Processing Strategy

Copy
def smart_multi_image_edit(images, instruction):
    """Smart multi-image editing"""

    if len(images) == 1:
        prompt = f"Edit this image: {instruction}"
    elif len(images) == 2:
        prompt = f"Combine these two images creatively: {instruction}"
    else:
        prompt = f"Process these {len(images)} images together: {instruction}"

    # Build content...
    return send_edit_request(content)

🎯 Common Use Cases
1. E-commerce Model Swap: Upload clothing and model photos, generate outfit effects
2. Interior Design: Upload raw room photos, generate decorated results via prompt
3. Game Assets: Quickly modify game icons or character appearances
4. Social Media: Transform portrait photos into various art styles
5. Product Display: Place products into different scene backgrounds
6. Creative Posters: Fuse multiple assets to generate poster designs

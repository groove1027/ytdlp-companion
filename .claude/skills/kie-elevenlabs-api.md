# KIE API — ElevenLabs Technical Documentation

> Source: https://docs.kie.ai/market/elevenlabs/
> Retrieved: 2026-03-13
> This document contains the COMPLETE and UNABRIDGED technical documentation for all KIE ElevenLabs API endpoints.

---

## Table of Contents

1. [Common: Authentication & Base URL](#1-common-authentication--base-url)
2. [Common: Get Task Details](#2-common-get-task-details)
3. [elevenlabs/text-to-speech-turbo-2-5](#3-elevenlabstext-to-speech-turbo-2-5)
4. [elevenlabs/text-to-speech-multilingual-v2](#4-elevenlabstext-to-speech-multilingual-v2)
5. [elevenlabs/text-to-dialogue-v3](#5-elevenlabstext-to-dialogue-v3)
6. [elevenlabs/speech-to-text](#6-elevenlabsspeech-to-text)
7. [elevenlabs/sound-effect-v2](#7-elevenlabssound-effect-v2)
8. [elevenlabs/audio-isolation](#8-elevenlabsaudio-isolation)

---

## 1. Common: Authentication & Base URL

```
Base URL: https://api.kie.ai
Authentication: Bearer Token
Header: Authorization: Bearer YOUR_API_KEY
Get API Key: https://kie.ai/api-key
```

All requests must include the `Authorization` header with a valid Bearer token. API keys can be obtained from [https://kie.ai/api-key](https://kie.ai/api-key).

---

## 2. Common: Get Task Details

All ElevenLabs endpoints return a `taskId` upon submission. Use this endpoint to poll for task completion or rely on the `callBackUrl` for push notifications.

### Endpoint

```
GET /api/v1/jobs/recordInfo
```

### Query Parameters

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| taskId    | string | Yes      | The task ID returned from createTask |

### Task States

| State        | Description                              |
|--------------|------------------------------------------|
| `waiting`    | Task is queued and waiting to be processed |
| `queuing`    | Task is in the processing queue          |
| `generating` | Task is currently being processed        |
| `success`    | Task completed successfully              |
| `fail`       | Task failed                              |

### Response Data Fields

| Field          | Type            | Description                                                                                             |
|----------------|-----------------|-------------------------------------------------------------------------------------------------------|
| taskId         | string          | The unique identifier for this task                                                                     |
| model          | string          | The model used (e.g., `grok-imagine/text-to-image`, `elevenlabs/text-to-speech-turbo-2-5`)             |
| state          | string (enum)   | `waiting` \| `queuing` \| `generating` \| `success` \| `fail`                                         |
| param          | string          | JSON string of original request parameters                                                              |
| resultJson     | string          | JSON string with generated content URLs. `{resultUrls: []}` for media, `{resultObject: {}}` for text  |
| failCode       | string          | Error code if failed, empty if successful                                                               |
| failMsg        | string          | Error message if failed, empty if successful                                                            |
| costTime       | integer (ms)    | Processing time in milliseconds                                                                         |
| completeTime   | integer (unix ms) | Completion timestamp                                                                                  |
| createTime     | integer (unix ms) | Creation timestamp                                                                                    |
| updateTime     | integer (unix ms) | Update timestamp                                                                                      |
| progress       | integer (0-100) | Only for sora2/sora2 pro                                                                                |

### Response Status Codes

| Code | Description                               |
|------|-------------------------------------------|
| 200  | Success                                   |
| 400  | Bad Request - Missing or invalid taskId   |
| 401  | Unauthorized                              |
| 402  | Insufficient Credits                      |
| 404  | Not Found / Task not found                |
| 422  | Validation Error / recordInfo is null     |
| 429  | Rate Limited                              |
| 455  | Service Unavailable (maintenance)         |
| 500  | Server Error                              |
| 501  | Generation Failed                         |
| 505  | Feature Disabled                          |

### Best Practices

- **Use callbacks** (`callBackUrl`) for production to avoid polling
- **Implement exponential backoff**: start with 2-3 second intervals, increase gradually
- **Handle timeouts**: stop polling after 10-15 minutes
- **Download results immediately**: URLs typically expire after 24 hours

### Example Response

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

---

## 3. elevenlabs/text-to-speech-turbo-2-5

High-quality, low-latency text-to-speech model optimized for fast generation.

### Endpoint

```
POST /api/v1/jobs/createTask
```

### Request Body (`application/json`)

| Parameter   | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| model       | string | Yes      | `"elevenlabs/text-to-speech-turbo-2-5"` |
| callBackUrl | string (uri) | No | Callback URL for completion notifications |
| input       | object | Yes      | Input parameters (see below)       |

### Input Parameters

| Parameter        | Type    | Required | Default    | Description                                                                                                    |
|------------------|---------|----------|------------|----------------------------------------------------------------------------------------------------------------|
| text             | string  | Yes      | —          | Text to convert to speech. Max 5000 chars.                                                                     |
| voice            | string  | No       | `"Rachel"` | Voice name or voice ID. Preview: `https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3`             |
| stability        | number  | No       | 0.5        | Voice stability. Range: 0-1, step 0.01.                                                                       |
| similarity_boost | number  | No       | 0.75       | Similarity boost. Range: 0-1, step 0.01.                                                                      |
| style            | number  | No       | 0          | Style exaggeration. Range: 0-1, step 0.01.                                                                    |
| speed            | number  | No       | 1          | Speech speed. Range: 0.7-1.2, step 0.01.                                                                      |
| timestamps       | boolean | No       | false      | Return word timestamps.                                                                                        |
| previous_text    | string  | No       | —          | Text before current for continuity. Max 5000 chars.                                                            |
| next_text        | string  | No       | —          | Text after current for continuity. Max 5000 chars.                                                             |
| language_code    | string  | No       | —          | ISO 639-1 language code. Max 500 chars. Only Turbo v2.5 and Flash v2.5 support language enforcement.           |

### Available Voices — Preset Names

Rachel, Aria, Roger, Sarah, Laura, Charlie, George, Callum, River, Liam, Charlotte, Alice, Matilda, Will, Jessica, Eric, Chris, Brian, Daniel, Lily, Bill

### Available Voices — Voice IDs (Complete List)

| Voice ID                     | Description                                              |
|------------------------------|----------------------------------------------------------|
| BIvP0GN1cAtSRTxNHnWS         | Ellen - Serious, Direct and Confident                    |
| aMSt68OGf4xUZAnLpTU8         | Juniper - Grounded and Professional                      |
| RILOU7YmBhvwJGDGjNmP         | Jane - Professional Audiobook Reader                     |
| EkK5I93UQWFDigLMpZcX         | James - Husky, Engaging and Bold                         |
| Z3R5wn05IrDiVCyEkUrK         | Arabella - Mysterious and Emotive                        |
| tnSpp4vdxKPjI9w0GnoV         | Hope - Upbeat and Clear                                  |
| NNl6r8mD7vthiJatiJt1         | Bradford - Expressive and Articulate                     |
| YOq2y2Up4RgXP2HyXjE5         | Xavier - Dominating, Metallic Announcer                  |
| Bj9UqZbhQsanLzgalpEG         | Austin - Deep, Raspy and Authentic                       |
| c6SfcYrb2t09NHXiT80T         | Jarnathan - Confident and Versatile                      |
| B8gJV1IhpuegLxdpXFOE         | Kuon - Cheerful, Clear and Steady                        |
| exsUS4vynmxd379XN4yO         | Blondie - Conversational                                 |
| BpjGufoPiobT79j2vtj4         | Priyanka - Calm, Neutral and Relaxed                     |
| 2zRM7PkgwBPiau2jvVXc         | Monika Sogam - Deep and Natural                          |
| 1SM7GgM6IMuvQlz2BwM3         | Mark - Casual, Relaxed and Light                         |
| ouL9IsyrSnUkCmfnD02u         | Grimblewood Thornwhisker - Snarky Gnome & Magical Maintainer |
| 5l5f8iK3YPeGga21rQIX         | Adeline - Feminine and Conversational                    |
| scOwDtmlUjD3prqpp97I         | Sam - Support Agent                                      |
| NOpBlnGInO9m6vDvFkFC         | Spuds Oxley - Wise and Approachable                      |
| BZgkqPqms7Kj9ulSkVzn         | Eve - Authentic, Energetic and Happy                     |
| wo6udizrrtpIxWGp2qJk         | Northern Terry                                           |
| yjJ45q8TVCrtMhEKurxY         | Dr. Von - Quirky, Mad Scientist                          |
| gU0LNdkMOQCOrPrwtbee         | British Football Announcer                               |
| DGzg6RaUqxGRTHSBjfgF         | Brock - Commanding and Loud Sergeant                     |
| DGTOOUoGpoP6UZ9uSWfA         | Célian - Documentary Narrator                            |
| x70vRnQBMBu4FAYhjJbO         | Nathan - Virtual Radio Host                              |
| P1bg08DkjqiVEzOn76yG         | Viraj - Rich and Soft                                    |
| qDuRKMlYmrm8trt5QyBn         | Taksh - Calm, Serious and Smooth                         |
| kUUTqKQ05NMGulF08DDf         | Guadeloupe Merryweather - Emotional                      |
| qXpMhyvQqiRxWQs4qSSB         | Horatius - Energetic Character Voice                     |
| TX3LPaxmHKxFdv7VOQHJ         | Liam - Energetic, Social Media Creator                   |
| iP95p4xoKVk53GoZ742B         | Chris - Charming, Down-to-Earth                          |
| SOYHLrjzK2X1ezoPC6cr         | Harry - Fierce Warrior                                   |
| N2lVS1w4EtoT3dr4eOWO         | Callum - Husky Trickster                                 |
| FGY2WhTYpPnrIDTdsKH5         | Laura - Enthusiast, Quirky Attitude                      |
| XB0fDUnXU5powFXDhCwa         | Charlotte                                                |
| cgSgspJ2msm6clMCkdW9         | Jessica - Playful, Bright, Warm                          |
| MnUw1cSnpiLoLhpd3Hqp         | Heather Rey - Rushed and Friendly                        |
| kPzsL2i3teMYv0FxEYQ6         | Brittney - Social Media Voice - Fun, Youthful & Informative |
| UgBBYS2sOqTuMpoF3BR0         | Mark - Natural Conversations                             |
| IjnA9kwZJHJ20Fp7Vmy6         | Matthew - Casual, Friendly and Smooth                    |
| KoQQbl9zjAdLgKZjm8Ol         | Pro Narrator - Convincing Story Teller                   |
| hpp4J3VqNfWAUOO0d1Us         | Bella - Professional, Bright, Warm                       |
| pNInz6obpgDQGcFmaJgB         | Adam - Dominant, Firm                                    |
| nPczCjzI2devNBz1zQrb         | Brian - Deep, Resonant and Comforting                    |
| L0Dsvb3SLTyegXwtm47J         | Archer                                                   |
| uYXf8XasLslADfZ2MB4u         | Hope - Bubbly, Gossipy and Girly                         |
| gs0tAILXbY5DNrJrsM6F         | Jeff - Classy, Resonating and Strong                     |
| DTKMou8ccj1ZaWGBiotd         | Jamahal - Young, Vibrant, and Natural                    |
| vBKc2FfBKJfcZNyEt1n6         | Finn - Youthful, Eager and Energetic                     |
| TmNe0cCqkZBMwPWOd3RD         | Smith - Mellow, Spontaneous, and Bassy                   |
| DYkrAHD8iwork3YSUBbs         | Tom - Conversations & Books                              |
| 56AoDkrOh6qfVPDXZ7Pt         | Cassidy - Crisp, Direct and Clear                        |
| eR40ATw9ArzDf9h3v7t7         | Addison 2.0 - Australian Audiobook & Podcast             |
| g6xIsTj2HwM6VR4iXFCw         | Jessica Anne Bogart - Chatty and Friendly                |
| lcMyyd2HUfFzxdCaC4Ta         | Lucy - Fresh & Casual                                    |
| 6aDn1KB0hjpdcocrUkmq         | Tiffany - Natural and Welcoming                          |
| Sq93GQT4X1lKDXsQcixO         | Felix - Warm, Positive & Contemporary RP                 |
| vfaqCOvlrKi4Zp7C2IAm         | Malyx - Echoey, Menacing and Deep Demon                  |
| piI8Kku0DcvcL6TTSeQt         | Flicker - Cheerful Fairy & Sparkly Sweetness             |
| KTPVrSVAEUSJRClDzBw7         | Bob - Rugged and Warm Cowboy                             |
| flHkNRp1BlvT73UL6gyz         | Jessica Anne Bogart - Eloquent Villain                   |
| 9yzdeviXkFddZ4Oz8Mok         | Lutz - Chuckling, Giggly and Cheerful                    |
| pPdl9cQBQq4p6mRkZy2Z         | Emma - Adorable and Upbeat                               |
| 0SpgpJ4D3MpHCiWdyTg3         | Matthew Schmitz - Elitist, Arrogant, Conniving Tyrant    |
| UFO0Yv86wqRxAt1DmXUu         | Sarcastic and Sultry Villain                             |
| oR4uRy4fHDUGGISL0Rev         | Myrrdin - Wise and Magical Narrator                      |
| zYcjlYFOd3taleS0gkk3         | Edward - Loud, Confident and Cocky                       |
| nzeAacJi50IvxcyDnMXa         | Marshal - Friendly, Funny Professor                      |
| ruirxsoakN0GWmGNIo04         | John Morgan - Gritty, Rugged Cowboy                      |
| 1KFdM0QCwQn4rmn5nn9C         | Parasyte - Whispers from the Deep Dark                   |
| TC0Zp7WVFzhA8zpTlRqV         | Aria - Sultry Villain                                    |
| ljo9gAlSqKOvF6D8sOsX         | Viking Bjorn - Epic Medieval Raider                      |
| PPzYpIqttlTYA83688JI         | Pirate Marshal                                           |
| ZF6FPAbjXT4488VcRRnw         | Amelia - Enthusiastic and Expressive                     |
| 8JVbfL6oEdmuxKn5DK2C         | Johnny Kid - Serious and Calm Narrator                   |
| iCrDUkL56s3C8sCRl7wb         | Hope - Poetic, Romantic and Captivating                  |
| 1hlpeD1ydbI2ow0Tt3EW         | Olivia - Smooth, Warm and Engaging                       |
| wJqPPQ618aTW29mptyoc         | Ana Rita - Smooth, Expressive and Bright                 |
| EiNlNiXeDU1pqqOPrYMO         | John Doe - Deep                                          |
| FUfBrNit0NNZAwb58KWH         | Angela - Conversational and Friendly                     |
| 4YYIPFl9wE5c4L2eu2Gb         | Burt Reynolds™ - Deep, Smooth and Clear                  |
| OYWwCdDHouzDwiZJWOOu         | David - Gruff Cowboy                                     |
| 6F5Zhi321D3Oq7v1oNT4         | Hank - Deep and Engaging Narrator                        |
| qNkzaJoHLLdpvgh5tISm         | Carter - Rich, Smooth and Rugged                         |
| YXpFCvM1S3JbWEJhoskW         | Wyatt - Wise Rustic Cowboy                               |
| 9PVP7ENhDskL0KYHAKtD         | Jerry B. - Southern/Cowboy                               |
| LG95yZDEHg6fCZdQjLqj         | Phil - Explosive, Passionate Announcer                   |
| CeNX9CMwmxDxUF5Q2Inm         | Johnny Dynamite - Vintage Radio DJ                       |
| st7NwhTPEzqo2riw7qWC         | Blondie - Radio Host                                     |
| aD6riP1btT197c6dACmy         | Rachel M - Pro British Radio Presenter                   |
| FF7KdobWPaiR0vkcALHF         | David - Movie Trailer Narrator                           |
| mtrellq69YZsNwzUSyXh         | Rex Thunder - Deep N Tough                               |
| dHd5gvgSOzSfduK4CvEg         | Ed - Late Night Announcer                                |
| cTNP6ZM2mLTKj2BFhxEh         | Paul French - Podcaster                                  |
| eVItLK1UvXctxuaRV2Oq         | Jean - Alluring and Playful Femme Fatale                 |
| U1Vk2oyatMdYs096Ety7         | Michael - Deep, Dark and Urban                           |
| esy0r39YPLQjOczyOib8         | Britney - Calm and Calculative Villain                   |
| bwCXcoVxWNYMlC6Esa8u         | Matthew Schmitz - Gravel, Deep Anti-Hero                 |
| D2jw4N9m4xePLTQ3IHjU         | Ian - Strange and Distorted Alien                        |
| Tsns2HvNFKfGiNjllgqo         | Sven - Emotional and Nice                                |
| Atp5cNFg1Wj5gyKD7HWV         | Natasha - Gentle Meditation                              |
| 1cxc5c3E9K6F1wlqOJGV         | Emily - Gentle, Soft and Meditative                      |
| 1U02n4nD6AdIZ9CjF053         | Viraj - Smooth and Gentle                                |
| HgyIHe81F3nXywNwkraY         | Nate - Sultry, Whispery and Seductive                    |
| AeRdCCKzvd23BpJoofzx         | Nathaniel - Engaging, British and Calm                   |
| LruHrtVF6PSyGItzMNHS         | Benjamin - Deep, Warm, Calming                           |
| Qggl4b0xRMiqOwhPtVWT         | Clara - Relaxing, Calm and Soothing                      |
| zA6D7RyKdc2EClouEMkP         | AImee - Tranquil ASMR and Meditation                     |
| 1wGbFxmAM3Fgw63G1zZJ         | Allison - Calm, Soothing and Meditative                  |
| hqfrgApggtO1785R4Fsn         | Theodore HQ - Serene and Grounded                        |
| sH0WdfE5fsKuM2otdQZr         | Koraly - Soft-spoken and Gentle                          |
| MJ0RnG71ty4LH3dvNfSd         | Leon - Soothing and Grounded                             |

### Example Request

```json
{
  "model": "elevenlabs/text-to-speech-turbo-2-5",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "text": "Unlock powerful API with Kie.ai! Affordable, scalable APl integration, free trial playground, and secure, reliable performance.",
    "voice": "Rachel",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0,
    "speed": 1,
    "timestamps": false,
    "previous_text": "",
    "next_text": "",
    "language_code": ""
  }
}
```

### Example Response

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_elevenlabs_1765185518880",
    "recordId": "elevenlabs_1765185518880"
  }
}
```

---

## 4. elevenlabs/text-to-speech-multilingual-v2

Multilingual text-to-speech model supporting a wide range of languages with high-quality output.

### Endpoint

```
POST /api/v1/jobs/createTask
```

### Request Body (`application/json`)

| Parameter   | Type   | Required | Description                                  |
|-------------|--------|----------|----------------------------------------------|
| model       | string | Yes      | `"elevenlabs/text-to-speech-multilingual-v2"` |
| callBackUrl | string (uri) | No | Callback URL for completion notifications     |
| input       | object | Yes      | Input parameters (see below)                 |

### Input Parameters

| Parameter        | Type    | Required | Default | Description                                                                                                    |
|------------------|---------|----------|---------|----------------------------------------------------------------------------------------------------------------|
| text             | string  | Yes      | —       | Text to convert to speech. Max 5000 chars.                                                                     |
| voice            | string  | Yes      | —       | Voice name or voice ID. Preview: `https://static.aiquickdraw.com/elevenlabs/voice/<voice_id>.mp3`             |
| stability        | number  | No       | 0.5     | Voice stability. Range: 0-1, step 0.01.                                                                       |
| similarity_boost | number  | No       | 0.75    | Similarity boost. Range: 0-1, step 0.01.                                                                      |
| style            | number  | No       | 0       | Style exaggeration. Range: 0-1, step 0.01.                                                                    |
| speed            | number  | No       | 1       | Speech speed. Range: 0.7-1.2, step 0.01.                                                                      |
| timestamps       | boolean | No       | false   | Return word timestamps.                                                                                        |
| previous_text    | string  | No       | —       | Text before current for continuity. Max 5000 chars.                                                            |
| next_text        | string  | No       | —       | Text after current for continuity. Max 5000 chars.                                                             |
| language_code    | string  | No       | —       | ISO 639-1 language code. Max 500 chars.                                                                        |

> **Note:** In this model, `voice` is **required** (no default value), unlike turbo-2-5 where it defaults to "Rachel".

### Available Voices — Preset Names

Rachel, Aria, Roger, Sarah, Laura, Charlie, George, Callum, River, Liam, Charlotte, Alice, Matilda, Will, Jessica, Eric, Chris, Brian, Daniel, Lily, Bill

### Available Voices — Voice IDs (Complete List)

This model includes all voices from turbo-2-5 **plus** one additional exclusive voice: `Sm1seazb4gs7RSlUVw7c` — Anika.

| Voice ID                     | Description                                              |
|------------------------------|----------------------------------------------------------|
| Sm1seazb4gs7RSlUVw7c         | **Anika - Animated, Friendly and Engaging** *(multilingual-v2 exclusive)* |
| BIvP0GN1cAtSRTxNHnWS         | Ellen - Serious, Direct and Confident                    |
| aMSt68OGf4xUZAnLpTU8         | Juniper - Grounded and Professional                      |
| RILOU7YmBhvwJGDGjNmP         | Jane - Professional Audiobook Reader                     |
| EkK5I93UQWFDigLMpZcX         | James - Husky, Engaging and Bold                         |
| Z3R5wn05IrDiVCyEkUrK         | Arabella - Mysterious and Emotive                        |
| tnSpp4vdxKPjI9w0GnoV         | Hope - Upbeat and Clear                                  |
| NNl6r8mD7vthiJatiJt1         | Bradford - Expressive and Articulate                     |
| YOq2y2Up4RgXP2HyXjE5         | Xavier - Dominating, Metallic Announcer                  |
| Bj9UqZbhQsanLzgalpEG         | Austin - Deep, Raspy and Authentic                       |
| c6SfcYrb2t09NHXiT80T         | Jarnathan - Confident and Versatile                      |
| B8gJV1IhpuegLxdpXFOE         | Kuon - Cheerful, Clear and Steady                        |
| exsUS4vynmxd379XN4yO         | Blondie - Conversational                                 |
| BpjGufoPiobT79j2vtj4         | Priyanka - Calm, Neutral and Relaxed                     |
| 2zRM7PkgwBPiau2jvVXc         | Monika Sogam - Deep and Natural                          |
| 1SM7GgM6IMuvQlz2BwM3         | Mark - Casual, Relaxed and Light                         |
| ouL9IsyrSnUkCmfnD02u         | Grimblewood Thornwhisker - Snarky Gnome & Magical Maintainer |
| 5l5f8iK3YPeGga21rQIX         | Adeline - Feminine and Conversational                    |
| scOwDtmlUjD3prqpp97I         | Sam - Support Agent                                      |
| NOpBlnGInO9m6vDvFkFC         | Spuds Oxley - Wise and Approachable                      |
| BZgkqPqms7Kj9ulSkVzn         | Eve - Authentic, Energetic and Happy                     |
| wo6udizrrtpIxWGp2qJk         | Northern Terry                                           |
| yjJ45q8TVCrtMhEKurxY         | Dr. Von - Quirky, Mad Scientist                          |
| gU0LNdkMOQCOrPrwtbee         | British Football Announcer                               |
| DGzg6RaUqxGRTHSBjfgF         | Brock - Commanding and Loud Sergeant                     |
| DGTOOUoGpoP6UZ9uSWfA         | Célian - Documentary Narrator                            |
| x70vRnQBMBu4FAYhjJbO         | Nathan - Virtual Radio Host                              |
| P1bg08DkjqiVEzOn76yG         | Viraj - Rich and Soft                                    |
| qDuRKMlYmrm8trt5QyBn         | Taksh - Calm, Serious and Smooth                         |
| kUUTqKQ05NMGulF08DDf         | Guadeloupe Merryweather - Emotional                      |
| qXpMhyvQqiRxWQs4qSSB         | Horatius - Energetic Character Voice                     |
| TX3LPaxmHKxFdv7VOQHJ         | Liam - Energetic, Social Media Creator                   |
| iP95p4xoKVk53GoZ742B         | Chris - Charming, Down-to-Earth                          |
| SOYHLrjzK2X1ezoPC6cr         | Harry - Fierce Warrior                                   |
| N2lVS1w4EtoT3dr4eOWO         | Callum - Husky Trickster                                 |
| FGY2WhTYpPnrIDTdsKH5         | Laura - Enthusiast, Quirky Attitude                      |
| XB0fDUnXU5powFXDhCwa         | Charlotte                                                |
| cgSgspJ2msm6clMCkdW9         | Jessica - Playful, Bright, Warm                          |
| MnUw1cSnpiLoLhpd3Hqp         | Heather Rey - Rushed and Friendly                        |
| kPzsL2i3teMYv0FxEYQ6         | Brittney - Social Media Voice - Fun, Youthful & Informative |
| UgBBYS2sOqTuMpoF3BR0         | Mark - Natural Conversations                             |
| IjnA9kwZJHJ20Fp7Vmy6         | Matthew - Casual, Friendly and Smooth                    |
| KoQQbl9zjAdLgKZjm8Ol         | Pro Narrator - Convincing Story Teller                   |
| hpp4J3VqNfWAUOO0d1Us         | Bella - Professional, Bright, Warm                       |
| pNInz6obpgDQGcFmaJgB         | Adam - Dominant, Firm                                    |
| nPczCjzI2devNBz1zQrb         | Brian - Deep, Resonant and Comforting                    |
| L0Dsvb3SLTyegXwtm47J         | Archer                                                   |
| uYXf8XasLslADfZ2MB4u         | Hope - Bubbly, Gossipy and Girly                         |
| gs0tAILXbY5DNrJrsM6F         | Jeff - Classy, Resonating and Strong                     |
| DTKMou8ccj1ZaWGBiotd         | Jamahal - Young, Vibrant, and Natural                    |
| vBKc2FfBKJfcZNyEt1n6         | Finn - Youthful, Eager and Energetic                     |
| TmNe0cCqkZBMwPWOd3RD         | Smith - Mellow, Spontaneous, and Bassy                   |
| DYkrAHD8iwork3YSUBbs         | Tom - Conversations & Books                              |
| 56AoDkrOh6qfVPDXZ7Pt         | Cassidy - Crisp, Direct and Clear                        |
| eR40ATw9ArzDf9h3v7t7         | Addison 2.0 - Australian Audiobook & Podcast             |
| g6xIsTj2HwM6VR4iXFCw         | Jessica Anne Bogart - Chatty and Friendly                |
| lcMyyd2HUfFzxdCaC4Ta         | Lucy - Fresh & Casual                                    |
| 6aDn1KB0hjpdcocrUkmq         | Tiffany - Natural and Welcoming                          |
| Sq93GQT4X1lKDXsQcixO         | Felix - Warm, Positive & Contemporary RP                 |
| vfaqCOvlrKi4Zp7C2IAm         | Malyx - Echoey, Menacing and Deep Demon                  |
| piI8Kku0DcvcL6TTSeQt         | Flicker - Cheerful Fairy & Sparkly Sweetness             |
| KTPVrSVAEUSJRClDzBw7         | Bob - Rugged and Warm Cowboy                             |
| flHkNRp1BlvT73UL6gyz         | Jessica Anne Bogart - Eloquent Villain                   |
| 9yzdeviXkFddZ4Oz8Mok         | Lutz - Chuckling, Giggly and Cheerful                    |
| pPdl9cQBQq4p6mRkZy2Z         | Emma - Adorable and Upbeat                               |
| 0SpgpJ4D3MpHCiWdyTg3         | Matthew Schmitz - Elitist, Arrogant, Conniving Tyrant    |
| UFO0Yv86wqRxAt1DmXUu         | Sarcastic and Sultry Villain                             |
| oR4uRy4fHDUGGISL0Rev         | Myrrdin - Wise and Magical Narrator                      |
| zYcjlYFOd3taleS0gkk3         | Edward - Loud, Confident and Cocky                       |
| nzeAacJi50IvxcyDnMXa         | Marshal - Friendly, Funny Professor                      |
| ruirxsoakN0GWmGNIo04         | John Morgan - Gritty, Rugged Cowboy                      |
| 1KFdM0QCwQn4rmn5nn9C         | Parasyte - Whispers from the Deep Dark                   |
| TC0Zp7WVFzhA8zpTlRqV         | Aria - Sultry Villain                                    |
| ljo9gAlSqKOvF6D8sOsX         | Viking Bjorn - Epic Medieval Raider                      |
| PPzYpIqttlTYA83688JI         | Pirate Marshal                                           |
| ZF6FPAbjXT4488VcRRnw         | Amelia - Enthusiastic and Expressive                     |
| 8JVbfL6oEdmuxKn5DK2C         | Johnny Kid - Serious and Calm Narrator                   |
| iCrDUkL56s3C8sCRl7wb         | Hope - Poetic, Romantic and Captivating                  |
| 1hlpeD1ydbI2ow0Tt3EW         | Olivia - Smooth, Warm and Engaging                       |
| wJqPPQ618aTW29mptyoc         | Ana Rita - Smooth, Expressive and Bright                 |
| EiNlNiXeDU1pqqOPrYMO         | John Doe - Deep                                          |
| FUfBrNit0NNZAwb58KWH         | Angela - Conversational and Friendly                     |
| 4YYIPFl9wE5c4L2eu2Gb         | Burt Reynolds™ - Deep, Smooth and Clear                  |
| OYWwCdDHouzDwiZJWOOu         | David - Gruff Cowboy                                     |
| 6F5Zhi321D3Oq7v1oNT4         | Hank - Deep and Engaging Narrator                        |
| qNkzaJoHLLdpvgh5tISm         | Carter - Rich, Smooth and Rugged                         |
| YXpFCvM1S3JbWEJhoskW         | Wyatt - Wise Rustic Cowboy                               |
| 9PVP7ENhDskL0KYHAKtD         | Jerry B. - Southern/Cowboy                               |
| LG95yZDEHg6fCZdQjLqj         | Phil - Explosive, Passionate Announcer                   |
| CeNX9CMwmxDxUF5Q2Inm         | Johnny Dynamite - Vintage Radio DJ                       |
| st7NwhTPEzqo2riw7qWC         | Blondie - Radio Host                                     |
| aD6riP1btT197c6dACmy         | Rachel M - Pro British Radio Presenter                   |
| FF7KdobWPaiR0vkcALHF         | David - Movie Trailer Narrator                           |
| mtrellq69YZsNwzUSyXh         | Rex Thunder - Deep N Tough                               |
| dHd5gvgSOzSfduK4CvEg         | Ed - Late Night Announcer                                |
| cTNP6ZM2mLTKj2BFhxEh         | Paul French - Podcaster                                  |
| eVItLK1UvXctxuaRV2Oq         | Jean - Alluring and Playful Femme Fatale                 |
| U1Vk2oyatMdYs096Ety7         | Michael - Deep, Dark and Urban                           |
| esy0r39YPLQjOczyOib8         | Britney - Calm and Calculative Villain                   |
| bwCXcoVxWNYMlC6Esa8u         | Matthew Schmitz - Gravel, Deep Anti-Hero                 |
| D2jw4N9m4xePLTQ3IHjU         | Ian - Strange and Distorted Alien                        |
| Tsns2HvNFKfGiNjllgqo         | Sven - Emotional and Nice                                |
| Atp5cNFg1Wj5gyKD7HWV         | Natasha - Gentle Meditation                              |
| 1cxc5c3E9K6F1wlqOJGV         | Emily - Gentle, Soft and Meditative                      |
| 1U02n4nD6AdIZ9CjF053         | Viraj - Smooth and Gentle                                |
| HgyIHe81F3nXywNwkraY         | Nate - Sultry, Whispery and Seductive                    |
| AeRdCCKzvd23BpJoofzx         | Nathaniel - Engaging, British and Calm                   |
| LruHrtVF6PSyGItzMNHS         | Benjamin - Deep, Warm, Calming                           |
| Qggl4b0xRMiqOwhPtVWT         | Clara - Relaxing, Calm and Soothing                      |
| zA6D7RyKdc2EClouEMkP         | AImee - Tranquil ASMR and Meditation                     |
| 1wGbFxmAM3Fgw63G1zZJ         | Allison - Calm, Soothing and Meditative                  |
| hqfrgApggtO1785R4Fsn         | Theodore HQ - Serene and Grounded                        |
| sH0WdfE5fsKuM2otdQZr         | Koraly - Soft-spoken and Gentle                          |
| MJ0RnG71ty4LH3dvNfSd         | Leon - Soothing and Grounded                             |

### Example Request

```json
{
  "model": "elevenlabs/text-to-speech-multilingual-v2",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "text": "Unlock powerful API with Kie.ai! Affordable, scalable APl integration, free trial playground, and secure, reliable performance.",
    "voice": "Rachel",
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0,
    "speed": 1,
    "timestamps": false,
    "previous_text": "",
    "next_text": "",
    "language_code": ""
  }
}
```

### Example Response

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_elevenlabs_1765185448724",
    "recordId": "elevenlabs_1765185448724"
  }
}
```

---

## 5. elevenlabs/text-to-dialogue-v3

Multi-speaker dialogue generation model that creates natural-sounding conversations between multiple voices.

### Endpoint

```
POST /api/v1/jobs/createTask
```

### Request Body (`application/json`)

| Parameter   | Type   | Required | Description                            |
|-------------|--------|----------|----------------------------------------|
| model       | string | Yes      | `"elevenlabs/text-to-dialogue-v3"`     |
| callBackUrl | string (uri) | No | Callback URL for completion notifications |
| input       | object | Yes      | Input parameters (see below)           |

### Input Parameters

| Parameter      | Type    | Required | Default | Description                                                          |
|----------------|---------|----------|---------|----------------------------------------------------------------------|
| dialogue       | array   | Yes      | —       | Array of dialogue items. Total text across all items must not exceed 5000 chars. |
| stability      | number  | No       | 0.5     | Voice stability. Enum: `0`, `0.5`, `1`.                             |
| language_code  | string  | No       | —       | ISO 639-1 language code for auto-detection override.                 |

### Dialogue Item Schema

Each item in the `dialogue` array:

| Field | Type   | Required | Description              |
|-------|--------|----------|--------------------------|
| text  | string | Yes      | The dialogue text         |
| voice | string | Yes      | Voice name or voice ID    |

### Available Dialogue Preset Voices

Adam, Alice, Bill, Brian, Callum, Charlie, Chris, Daniel, Eric, George, Harry, Jessica, Laura, Liam, Lily, Matilda, River, Roger, Sarah, Will

### Available Dialogue Voice IDs (Complete List)

All voice IDs from the TTS models are available, including the multilingual-v2 exclusive voice:

| Voice ID                     | Description                                              |
|------------------------------|----------------------------------------------------------|
| Sm1seazb4gs7RSlUVw7c         | Anika - Animated, Friendly and Engaging                  |
| BIvP0GN1cAtSRTxNHnWS         | Ellen - Serious, Direct and Confident                    |
| aMSt68OGf4xUZAnLpTU8         | Juniper - Grounded and Professional                      |
| RILOU7YmBhvwJGDGjNmP         | Jane - Professional Audiobook Reader                     |
| EkK5I93UQWFDigLMpZcX         | James - Husky, Engaging and Bold                         |
| Z3R5wn05IrDiVCyEkUrK         | Arabella - Mysterious and Emotive                        |
| tnSpp4vdxKPjI9w0GnoV         | Hope - Upbeat and Clear                                  |
| NNl6r8mD7vthiJatiJt1         | Bradford - Expressive and Articulate                     |
| YOq2y2Up4RgXP2HyXjE5         | Xavier - Dominating, Metallic Announcer                  |
| Bj9UqZbhQsanLzgalpEG         | Austin - Deep, Raspy and Authentic                       |
| c6SfcYrb2t09NHXiT80T         | Jarnathan - Confident and Versatile                      |
| B8gJV1IhpuegLxdpXFOE         | Kuon - Cheerful, Clear and Steady                        |
| exsUS4vynmxd379XN4yO         | Blondie - Conversational                                 |
| BpjGufoPiobT79j2vtj4         | Priyanka - Calm, Neutral and Relaxed                     |
| 2zRM7PkgwBPiau2jvVXc         | Monika Sogam - Deep and Natural                          |
| 1SM7GgM6IMuvQlz2BwM3         | Mark - Casual, Relaxed and Light                         |
| ouL9IsyrSnUkCmfnD02u         | Grimblewood Thornwhisker - Snarky Gnome & Magical Maintainer |
| 5l5f8iK3YPeGga21rQIX         | Adeline - Feminine and Conversational                    |
| scOwDtmlUjD3prqpp97I         | Sam - Support Agent                                      |
| NOpBlnGInO9m6vDvFkFC         | Spuds Oxley - Wise and Approachable                      |
| BZgkqPqms7Kj9ulSkVzn         | Eve - Authentic, Energetic and Happy                     |
| wo6udizrrtpIxWGp2qJk         | Northern Terry                                           |
| yjJ45q8TVCrtMhEKurxY         | Dr. Von - Quirky, Mad Scientist                          |
| gU0LNdkMOQCOrPrwtbee         | British Football Announcer                               |
| DGzg6RaUqxGRTHSBjfgF         | Brock - Commanding and Loud Sergeant                     |
| DGTOOUoGpoP6UZ9uSWfA         | Célian - Documentary Narrator                            |
| x70vRnQBMBu4FAYhjJbO         | Nathan - Virtual Radio Host                              |
| P1bg08DkjqiVEzOn76yG         | Viraj - Rich and Soft                                    |
| qDuRKMlYmrm8trt5QyBn         | Taksh - Calm, Serious and Smooth                         |
| kUUTqKQ05NMGulF08DDf         | Guadeloupe Merryweather - Emotional                      |
| qXpMhyvQqiRxWQs4qSSB         | Horatius - Energetic Character Voice                     |
| TX3LPaxmHKxFdv7VOQHJ         | Liam - Energetic, Social Media Creator                   |
| iP95p4xoKVk53GoZ742B         | Chris - Charming, Down-to-Earth                          |
| SOYHLrjzK2X1ezoPC6cr         | Harry - Fierce Warrior                                   |
| N2lVS1w4EtoT3dr4eOWO         | Callum - Husky Trickster                                 |
| FGY2WhTYpPnrIDTdsKH5         | Laura - Enthusiast, Quirky Attitude                      |
| XB0fDUnXU5powFXDhCwa         | Charlotte                                                |
| cgSgspJ2msm6clMCkdW9         | Jessica - Playful, Bright, Warm                          |
| MnUw1cSnpiLoLhpd3Hqp         | Heather Rey - Rushed and Friendly                        |
| kPzsL2i3teMYv0FxEYQ6         | Brittney - Social Media Voice - Fun, Youthful & Informative |
| UgBBYS2sOqTuMpoF3BR0         | Mark - Natural Conversations                             |
| IjnA9kwZJHJ20Fp7Vmy6         | Matthew - Casual, Friendly and Smooth                    |
| KoQQbl9zjAdLgKZjm8Ol         | Pro Narrator - Convincing Story Teller                   |
| hpp4J3VqNfWAUOO0d1Us         | Bella - Professional, Bright, Warm                       |
| pNInz6obpgDQGcFmaJgB         | Adam - Dominant, Firm                                    |
| nPczCjzI2devNBz1zQrb         | Brian - Deep, Resonant and Comforting                    |
| L0Dsvb3SLTyegXwtm47J         | Archer                                                   |
| uYXf8XasLslADfZ2MB4u         | Hope - Bubbly, Gossipy and Girly                         |
| gs0tAILXbY5DNrJrsM6F         | Jeff - Classy, Resonating and Strong                     |
| DTKMou8ccj1ZaWGBiotd         | Jamahal - Young, Vibrant, and Natural                    |
| vBKc2FfBKJfcZNyEt1n6         | Finn - Youthful, Eager and Energetic                     |
| TmNe0cCqkZBMwPWOd3RD         | Smith - Mellow, Spontaneous, and Bassy                   |
| DYkrAHD8iwork3YSUBbs         | Tom - Conversations & Books                              |
| 56AoDkrOh6qfVPDXZ7Pt         | Cassidy - Crisp, Direct and Clear                        |
| eR40ATw9ArzDf9h3v7t7         | Addison 2.0 - Australian Audiobook & Podcast             |
| g6xIsTj2HwM6VR4iXFCw         | Jessica Anne Bogart - Chatty and Friendly                |
| lcMyyd2HUfFzxdCaC4Ta         | Lucy - Fresh & Casual                                    |
| 6aDn1KB0hjpdcocrUkmq         | Tiffany - Natural and Welcoming                          |
| Sq93GQT4X1lKDXsQcixO         | Felix - Warm, Positive & Contemporary RP                 |
| vfaqCOvlrKi4Zp7C2IAm         | Malyx - Echoey, Menacing and Deep Demon                  |
| piI8Kku0DcvcL6TTSeQt         | Flicker - Cheerful Fairy & Sparkly Sweetness             |
| KTPVrSVAEUSJRClDzBw7         | Bob - Rugged and Warm Cowboy                             |
| flHkNRp1BlvT73UL6gyz         | Jessica Anne Bogart - Eloquent Villain                   |
| 9yzdeviXkFddZ4Oz8Mok         | Lutz - Chuckling, Giggly and Cheerful                    |
| pPdl9cQBQq4p6mRkZy2Z         | Emma - Adorable and Upbeat                               |
| 0SpgpJ4D3MpHCiWdyTg3         | Matthew Schmitz - Elitist, Arrogant, Conniving Tyrant    |
| UFO0Yv86wqRxAt1DmXUu         | Sarcastic and Sultry Villain                             |
| oR4uRy4fHDUGGISL0Rev         | Myrrdin - Wise and Magical Narrator                      |
| zYcjlYFOd3taleS0gkk3         | Edward - Loud, Confident and Cocky                       |
| nzeAacJi50IvxcyDnMXa         | Marshal - Friendly, Funny Professor                      |
| ruirxsoakN0GWmGNIo04         | John Morgan - Gritty, Rugged Cowboy                      |
| 1KFdM0QCwQn4rmn5nn9C         | Parasyte - Whispers from the Deep Dark                   |
| TC0Zp7WVFzhA8zpTlRqV         | Aria - Sultry Villain                                    |
| ljo9gAlSqKOvF6D8sOsX         | Viking Bjorn - Epic Medieval Raider                      |
| PPzYpIqttlTYA83688JI         | Pirate Marshal                                           |
| ZF6FPAbjXT4488VcRRnw         | Amelia - Enthusiastic and Expressive                     |
| 8JVbfL6oEdmuxKn5DK2C         | Johnny Kid - Serious and Calm Narrator                   |
| iCrDUkL56s3C8sCRl7wb         | Hope - Poetic, Romantic and Captivating                  |
| 1hlpeD1ydbI2ow0Tt3EW         | Olivia - Smooth, Warm and Engaging                       |
| wJqPPQ618aTW29mptyoc         | Ana Rita - Smooth, Expressive and Bright                 |
| EiNlNiXeDU1pqqOPrYMO         | John Doe - Deep                                          |
| FUfBrNit0NNZAwb58KWH         | Angela - Conversational and Friendly                     |
| 4YYIPFl9wE5c4L2eu2Gb         | Burt Reynolds™ - Deep, Smooth and Clear                  |
| OYWwCdDHouzDwiZJWOOu         | David - Gruff Cowboy                                     |
| 6F5Zhi321D3Oq7v1oNT4         | Hank - Deep and Engaging Narrator                        |
| qNkzaJoHLLdpvgh5tISm         | Carter - Rich, Smooth and Rugged                         |
| YXpFCvM1S3JbWEJhoskW         | Wyatt - Wise Rustic Cowboy                               |
| 9PVP7ENhDskL0KYHAKtD         | Jerry B. - Southern/Cowboy                               |
| LG95yZDEHg6fCZdQjLqj         | Phil - Explosive, Passionate Announcer                   |
| CeNX9CMwmxDxUF5Q2Inm         | Johnny Dynamite - Vintage Radio DJ                       |
| st7NwhTPEzqo2riw7qWC         | Blondie - Radio Host                                     |
| aD6riP1btT197c6dACmy         | Rachel M - Pro British Radio Presenter                   |
| FF7KdobWPaiR0vkcALHF         | David - Movie Trailer Narrator                           |
| mtrellq69YZsNwzUSyXh         | Rex Thunder - Deep N Tough                               |
| dHd5gvgSOzSfduK4CvEg         | Ed - Late Night Announcer                                |
| cTNP6ZM2mLTKj2BFhxEh         | Paul French - Podcaster                                  |
| eVItLK1UvXctxuaRV2Oq         | Jean - Alluring and Playful Femme Fatale                 |
| U1Vk2oyatMdYs096Ety7         | Michael - Deep, Dark and Urban                           |
| esy0r39YPLQjOczyOib8         | Britney - Calm and Calculative Villain                   |
| bwCXcoVxWNYMlC6Esa8u         | Matthew Schmitz - Gravel, Deep Anti-Hero                 |
| D2jw4N9m4xePLTQ3IHjU         | Ian - Strange and Distorted Alien                        |
| Tsns2HvNFKfGiNjllgqo         | Sven - Emotional and Nice                                |
| Atp5cNFg1Wj5gyKD7HWV         | Natasha - Gentle Meditation                              |
| 1cxc5c3E9K6F1wlqOJGV         | Emily - Gentle, Soft and Meditative                      |
| 1U02n4nD6AdIZ9CjF053         | Viraj - Smooth and Gentle                                |
| HgyIHe81F3nXywNwkraY         | Nate - Sultry, Whispery and Seductive                    |
| AeRdCCKzvd23BpJoofzx         | Nathaniel - Engaging, British and Calm                   |
| LruHrtVF6PSyGItzMNHS         | Benjamin - Deep, Warm, Calming                           |
| Qggl4b0xRMiqOwhPtVWT         | Clara - Relaxing, Calm and Soothing                      |
| zA6D7RyKdc2EClouEMkP         | AImee - Tranquil ASMR and Meditation                     |
| 1wGbFxmAM3Fgw63G1zZJ         | Allison - Calm, Soothing and Meditative                  |
| hqfrgApggtO1785R4Fsn         | Theodore HQ - Serene and Grounded                        |
| sH0WdfE5fsKuM2otdQZr         | Koraly - Soft-spoken and Gentle                          |
| MJ0RnG71ty4LH3dvNfSd         | Leon - Soothing and Grounded                             |

### Supported Language Codes (ISO 639-1)

```
af, ar, hy, as, az, be, bn, bs, bg, ca, ceb, ny, hr, cs, da, nl, en, et, fil, fi, fr, gl, ka, de, el, gu, ha, he, hi, hu, is, id, ga, it, ja, jv, kn, kk, ky, ko, lv, ln, lt, lb, mk, ms, ml, zh, mr, ne, no, ps, fa, pl, pt, pa, ro, ru, sr, sd, sk, sl, so, es, sw, sv, ta, te, th, tr, uk, ur, vi, cy
```

### Example Request

```json
{
  "model": "elevenlabs/text-to-dialogue-v3",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "dialogue": [
      {"text": "I have a pen, I have an apple, ah, Apple pen~", "voice": "Adam"},
      {"text": "a happy dog", "voice": "Brian"},
      {"text": "a happy cat", "voice": "Roger"}
    ],
    "stability": 0.5
  }
}
```

### Example Response

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_elevenlabs_1765185448724",
    "recordId": "elevenlabs_1765185448724"
  }
}
```

---

## 6. elevenlabs/speech-to-text

Transcribe audio files to text with optional speaker diarization and audio event tagging.

### Endpoint

```
POST /api/v1/jobs/createTask
```

### Request Body (`application/json`)

| Parameter   | Type   | Required | Description                         |
|-------------|--------|----------|-------------------------------------|
| model       | string | Yes      | `"elevenlabs/speech-to-text"`       |
| callBackUrl | string (uri) | No | Callback URL for completion notifications |
| input       | object | Yes      | Input parameters (see below)        |

### Input Parameters

| Parameter        | Type    | Required | Description                                                                                                                                  |
|------------------|---------|----------|----------------------------------------------------------------------------------------------------------------------------------------------|
| audio_url        | string  | Yes      | URL of audio file. Accepted types: `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/aac`, `audio/mp4`, `audio/ogg`. Max size: 200.0MB.     |
| language_code    | string  | No       | Language code. Max 500 chars.                                                                                                                |
| tag_audio_events | boolean | No       | Tag events like laughter, applause.                                                                                                          |
| diarize          | boolean | No       | Annotate who is speaking.                                                                                                                    |

### Example Request

```json
{
  "model": "elevenlabs/speech-to-text",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "audio_url": "https://file.aiquickdraw.com/custom-page/akr/section-images/1757157053357tn37vxc8.mp3",
    "language_code": "",
    "tag_audio_events": true,
    "diarize": true
  }
}
```

### Example Response

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_elevenlabs_1765185413162",
    "recordId": "record_elevenlabs_1765185413162"
  }
}
```

---

## 7. elevenlabs/sound-effect-v2

Generate sound effects from text descriptions with control over duration, looping, and output format.

### Endpoint

```
POST /api/v1/jobs/createTask
```

### Request Body (`application/json`)

| Parameter   | Type   | Required | Description                         |
|-------------|--------|----------|-------------------------------------|
| model       | string | Yes      | `"elevenlabs/sound-effect-v2"`      |
| callBackUrl | string (uri) | No | Callback URL for completion notifications |
| input       | object | Yes      | Input parameters (see below)        |

### Input Parameters

| Parameter        | Type    | Required | Default          | Description                                                     |
|------------------|---------|----------|------------------|-----------------------------------------------------------------|
| text             | string  | Yes      | —                | Description of sound effect to generate. Max 5000 chars.        |
| loop             | boolean | No       | false            | Create looping sound effect.                                    |
| duration_seconds | number  | No       | —                | Duration in seconds. Min: 0.5, Max: 22, Step: 0.1. If None, optimal duration is determined from the prompt. |
| prompt_influence | number  | No       | 0.3              | How closely to follow the prompt. Range: 0-1, Step: 0.01.      |
| output_format    | string  | No       | `"mp3_44100_128"` | Output audio format. See available formats below.              |

### Available Output Formats

**MP3 formats:**
- `mp3_22050_32`
- `mp3_44100_32`
- `mp3_44100_64`
- `mp3_44100_96`
- `mp3_44100_128`
- `mp3_44100_192`

**PCM formats:**
- `pcm_8000`
- `pcm_16000`
- `pcm_22050`
- `pcm_24000`
- `pcm_44100`
- `pcm_48000`

**Other formats:**
- `ulaw_8000`
- `alaw_8000`
- `opus_48000_32`
- `opus_48000_64`
- `opus_48000_96`
- `opus_48000_128`
- `opus_48000_192`

### Example Request

```json
{
  "model": "elevenlabs/sound-effect-v2",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "text": "",
    "loop": false,
    "prompt_influence": 0.3,
    "output_format": "mp3_44100_128"
  }
}
```

### Example Response

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_elevenlabs_1765185379603",
    "recordId": "elevenlabs_1765185379603"
  }
}
```

---

## 8. elevenlabs/audio-isolation

Isolate vocals from background noise in audio files.

### Endpoint

```
POST /api/v1/jobs/createTask
```

### Request Body (`application/json`)

| Parameter   | Type   | Required | Description                         |
|-------------|--------|----------|-------------------------------------|
| model       | string | Yes      | `"elevenlabs/audio-isolation"`      |
| callBackUrl | string (uri) | No | Callback URL for completion notifications |
| input       | object | Yes      | Input parameters (see below)        |

### Input Parameters

| Parameter | Type   | Required | Description                                                                                                                                  |
|-----------|--------|----------|----------------------------------------------------------------------------------------------------------------------------------------------|
| audio_url | string | Yes      | URL of audio file. Accepted types: `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/aac`, `audio/mp4`, `audio/ogg`. Max size: 10.0MB.      |

### Example Request

```json
{
  "model": "elevenlabs/audio-isolation",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "audio_url": "https://file.aiquickdraw.com/custom-page/akr/section-images/1756964657418ljw1jbzr.mp3"
  }
}
```

### Example Response

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_elevenlabs_1765185282276",
    "recordId": "elevenlabs_1765185282276"
  }
}
```

---

## Common Response Status Codes (All Endpoints)

All KIE ElevenLabs API endpoints share the same set of response status codes:

| Code | Description                                                             |
|------|-------------------------------------------------------------------------|
| 200  | Success - Request has been processed successfully                       |
| 401  | Unauthorized - Authentication credentials are missing or invalid        |
| 402  | Insufficient Credits - Account does not have enough credits             |
| 404  | Not Found - The requested resource or endpoint does not exist           |
| 422  | Validation Error - Request parameters failed validation                 |
| 429  | Rate Limited - Request limit exceeded                                   |
| 455  | Service Unavailable - System undergoing maintenance                     |
| 500  | Server Error - Unexpected error                                         |
| 501  | Generation Failed - Content generation task failed                      |
| 505  | Feature Disabled - Requested feature currently disabled                 |

### Error Response Example

```json
{
  "code": 500,
  "msg": "Server Error - An unexpected error occurred while processing the request",
  "data": null
}
```

---

## Quick Reference: Model Summary

| Model                                     | Type              | Key Feature                          |
|-------------------------------------------|-------------------|--------------------------------------|
| `elevenlabs/text-to-speech-turbo-2-5`     | Text-to-Speech    | Fast, low-latency TTS               |
| `elevenlabs/text-to-speech-multilingual-v2` | Text-to-Speech  | Multilingual support                 |
| `elevenlabs/text-to-dialogue-v3`          | Dialogue          | Multi-speaker conversation           |
| `elevenlabs/speech-to-text`               | Speech-to-Text    | Transcription with diarization       |
| `elevenlabs/sound-effect-v2`              | Sound Effects     | AI-generated sound effects           |
| `elevenlabs/audio-isolation`              | Audio Processing  | Vocal isolation from background      |

---

*End of KIE API — ElevenLabs Technical Documentation*

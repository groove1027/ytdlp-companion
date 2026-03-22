# Typecast API 기술 문서

## 목차

- [1. 개요 (Overview)](#1-개요-overview)
- [2. 주요 기능 (Key Features)](#2-주요-기능-key-features)
- [3. 감정 제어 옵션 (Emotion Control Options)](#3-감정-제어-옵션-emotion-control-options)
- [4. 지원 언어 (Supported Languages)](#4-지원-언어-supported-languages)
- [5. 활용 사례 (Use Cases)](#5-활용-사례-use-cases)
- [6. 오디오 출력 사양 (Audio Output Specifications)](#6-오디오-출력-사양-audio-output-specifications)
- [7. API 레퍼런스: Text-to-Speech](#7-api-레퍼런스-text-to-speech)
  - [7.1 엔드포인트 (Endpoint)](#71-엔드포인트-endpoint)
  - [7.2 인증 (Authorization)](#72-인증-authorization)
  - [7.3 요청 본문 (Request Body)](#73-요청-본문-request-body)
  - [7.4 Prompt 파라미터 상세](#74-prompt-파라미터-상세)
  - [7.5 Output 파라미터 상세](#75-output-파라미터-상세)
  - [7.6 Seed 파라미터](#76-seed-파라미터)
  - [7.7 요청 예시 (cURL)](#77-요청-예시-curl)
  - [7.8 응답 (Response)](#78-응답-response)
  - [7.9 에러 응답 (Error Responses)](#79-에러-응답-error-responses)
- [8. 시작하기 (Get Started)](#8-시작하기-get-started)

---

## 1. 개요 (Overview)

Typecast는 AI 기술을 활용하여 자연스러운 음성 더빙을 생성할 수 있는 **텍스트-투-스피치(TTS) 플랫폼**입니다. 다양한 합성 음성을 제공하며, 여러 언어의 텍스트를 음성으로 변환할 수 있습니다.

### 최신 모델: ssfm-v30

최신 음성 합성 기초 모델(Speech Synthesis Foundation Model) **ssfm-v30**은 가장 자연스럽고 표현력 있는 음성 합성을 제공하며, 운율(prosody), 페이싱(pacing), 감정 표현(emotional expression)에서 상당한 개선이 이루어졌습니다.

---

## 2. 주요 기능 (Key Features)

### Smart Emotion (스마트 감정)

텍스트 맥락에서 적절한 감정을 자동으로 감지하여 음성에 적용합니다. 단순히 앞뒤 텍스트를 제공하면 모델이 최적의 감정 톤을 추론합니다.

### 7가지 감정 프리셋 (7 Emotion Presets)

`normal`, `happy`, `sad`, `angry`, `whisper`, `toneup`, `tonedown` 중 선택하여 음성 출력을 세밀하게 조정할 수 있습니다.

### 37개 언어 지원 (37 Languages)

한국어, 영어, 일본어, 중국어, 스페인어, 베트남어 등 37개 언어를 지원합니다.

### 유니버설 감정 지원 (Universal Emotion Support)

모든 감정 프리셋이 모든 음성에서 사용 가능하여, 감정 표현에 대한 일관된 제어가 가능합니다.

---

## 3. 감정 제어 옵션 (Emotion Control Options)

ssfm-v30은 감정 표현을 제어하는 두 가지 방법을 제공합니다:

| 옵션 | 설명 | 적합한 용도 |
|------|------|-------------|
| **Smart Emotion** | AI가 텍스트 맥락에서 자동으로 감정을 추론 | 대화, 스토리텔링, 자연스러운 대화 |
| **Preset Emotion** | 감정 프리셋과 강도를 수동으로 선택 | 정밀한 제어, 특정 감정 요구사항 |

---

## 4. 지원 언어 (Supported Languages)

### ssfm-v30 지원 언어 (37개)

| 코드 | 언어 | 코드 | 언어 | 코드 | 언어 |
|------|------|------|------|------|------|
| ARA | Arabic | IND | Indonesian | POR | Portuguese |
| BEN | Bengali | ITA | Italian | RON | Romanian |
| BUL | Bulgarian | JPN | Japanese | RUS | Russian |
| CES | Czech | KOR | Korean | SLK | Slovak |
| DAN | Danish | MSA | Malay | SPA | Spanish |
| DEU | German | NAN | Min Nan | SWE | Swedish |
| ELL | Greek | NLD | Dutch | TAM | Tamil |
| ENG | English | NOR | Norwegian | TGL | Tagalog |
| FIN | Finnish | PAN | Punjabi | THA | Thai |
| FRA | French | POL | Polish | TUR | Turkish |
| HIN | Hindi | UKR | Ukrainian | VIE | Vietnamese |
| HRV | Croatian | YUE | Cantonese | ZHO | Chinese (Mandarin) |
| HUN | Hungarian | | | | |

### ssfm-v21 지원 언어 (27개)

| 코드 | 언어 | 코드 | 언어 | 코드 | 언어 |
|------|------|------|------|------|------|
| ARA | Arabic | IND | Indonesian | RON | Romanian |
| BUL | Bulgarian | ITA | Italian | RUS | Russian |
| CES | Czech | JPN | Japanese | SLK | Slovak |
| DAN | Danish | KOR | Korean | SPA | Spanish |
| DEU | German | MSA | Malay | SWE | Swedish |
| ELL | Greek | NLD | Dutch | TAM | Tamil |
| ENG | English | POL | Polish | TGL | Tagalog |
| FIN | Finnish | POR | Portuguese | UKR | Ukrainian |
| FRA | French | HRV | Croatian | ZHO | Chinese |

---

## 5. 활용 사례 (Use Cases)

Typecast API는 다양한 분야에서 활용할 수 있습니다:

- **대화형 AI (Conversational AI)** — 자연스러운 챗봇 및 음성 어시스턴트 구축
- **영상 제작 (Video Production)** — 영상 및 다큐멘터리를 위한 전문 보이스오버 생성
- **광고 (Advertising)** — 빠르게 매력적인 광고 보이스오버 제작
- **이러닝 & 교육 (E-learning & Education)** — 자연스러운 내레이션으로 매력적인 교육 콘텐츠 제작
- **팟캐스트 & 방송 (Podcasts & Broadcasting)** — 일관되고 고품질의 오디오 콘텐츠 제작
- **게임 개발 (Game Development)** — 게임에 동적 캐릭터 음성 추가
- **오디오북 & 스토리텔링 (Audiobooks & Storytelling)** — 감정적 깊이가 있는 표현력 있는 오디오북 내레이션 제작

---

## 6. 오디오 출력 사양 (Audio Output Specifications)

| 포맷 | 코덱 | 비트 깊이 | 채널 | 샘플 레이트 | 비트레이트 |
|------|------|-----------|------|-------------|------------|
| WAV | PCM (Uncompressed) | 16-bit | Mono | 44,100 Hz | N/A |
| MP3 | MPEG Layer III | N/A | Mono | 44,100 Hz | 320 kbps |

> **참고:** WAV 포맷은 전문 프로덕션에 적합한 고품질 오디오를 제공하고, MP3는 웹 스트리밍 및 배포에 이상적인 작은 파일 크기를 제공합니다.

---

## 7. API 레퍼런스: Text-to-Speech

### 7.1 엔드포인트 (Endpoint)

```
POST https://api.typecast.ai/v1/text-to-speech
```

지정된 음성 모델을 사용하여 텍스트에서 음성을 생성합니다. 감정, 볼륨, 피치, 템포 제어를 지원합니다.

> **Tip:** 먼저 `GET /v2/voices` 엔드포인트를 사용하여 사용 가능한 모든 음성 모델을 나열한 다음, 해당 `voice_id`를 사용하세요.

---

### 7.2 인증 (Authorization)

| 파라미터 | 타입 | 위치 | 필수 여부 | 설명 |
|----------|------|------|-----------|------|
| `X-API-KEY` | string | header | **required** | 인증을 위한 API 키. Typecast 대시보드에서 API 키를 발급받을 수 있습니다. |

---

### 7.3 요청 본문 (Request Body)

Content-Type: `application/json`

| 파라미터 | 타입 | 필수 여부 | 설명 |
|----------|------|-----------|------|
| `voice_id` | string | **required** | `tc_` 접두사 뒤에 고유 식별자가 붙는 형식의 Voice ID (예: `tc_60e5426de8b95f1d3000d7b5`). 대소문자를 구분합니다. [List Voices API](/docs/api-reference/voices/list-voices)에서 조회 가능합니다. |
| `text` | string | **required** | 음성으로 변환할 텍스트. 최소 1자, 최대 2,000자. 텍스트 길이에 따라 크레딧이 소비됩니다. |
| `model` | enum\<string\> | **required** | 음성 합성에 사용할 모델. `ssfm-v30` (최신, 권장) 또는 `ssfm-v21` (안정적 프로덕션 모델). |
| `language` | string | optional | ISO 639-3 표준 언어 코드. 대소문자 구분 없음 (`"ENG"`, `"eng"` 모두 가능). 미지정 시 기본 언어가 적용됩니다. |
| `prompt` | object | optional | 생성 음성의 감정 및 스타일 설정. 모델에 따라 SmartPrompt, PresetPrompt, Prompt 객체를 사용합니다. |
| `output` | object | optional | 볼륨(0-200), 피치(-12~+12 반음), 템포(0.5x~2.0x), 오디오 포맷을 포함한 오디오 출력 설정. |
| `seed` | integer | optional | 음성 생성 변동을 제어하기 위한 랜덤 시드. 정수 값을 사용하여 출력 변동에 영향을 줍니다. |

---

### 7.4 Prompt 파라미터 상세

`prompt` 객체는 모델에 따라 세 가지 형태를 가집니다.

#### 7.4.1 SmartPrompt (ssfm-v30 전용)

AI가 텍스트 맥락에서 자동으로 감정을 추론하는 방식입니다.

| 필드 | 타입 | 필수 여부 | 설명 |
|------|------|-----------|------|
| `emotion_type` | string | **required** | `"smart"` 로 설정 |
| `previous_text` | string | optional | 현재 텍스트 앞에 오는 맥락 텍스트. AI가 감정을 추론하는 데 활용됩니다. |
| `next_text` | string | optional | 현재 텍스트 뒤에 오는 맥락 텍스트. AI가 감정을 추론하는 데 활용됩니다. |

**예시:**

```json
{
  "emotion_type": "smart",
  "previous_text": "I feel like I'm walking on air and I just want to scream with joy!",
  "next_text": "I am literally bursting with happiness and I never want this feeling to end!"
}
```

#### 7.4.2 PresetPrompt (ssfm-v30 전용)

수동으로 감정 프리셋과 강도를 지정하는 방식입니다.

| 필드 | 타입 | 필수 여부 | 설명 |
|------|------|-----------|------|
| `emotion_type` | string | **required** | `"preset"` 으로 설정 |
| `emotion_preset` | string | **required** | 감정 프리셋 선택. 사용 가능한 값: `normal`, `happy`, `sad`, `angry`, `whisper`, `toneup`, `tonedown` |
| `emotion_intensity` | number | optional | 감정 강도. 범위: `0.0` ~ `2.0` |

**예시:**

```json
{
  "emotion_type": "preset",
  "emotion_preset": "happy",
  "emotion_intensity": 1.5
}
```

**ssfm-v30 감정 프리셋:**

| 프리셋 | 설명 |
|--------|------|
| `normal` | 일반적인 톤 |
| `happy` | 밝고 즐거운 톤 |
| `sad` | 슬프고 우울한 톤 |
| `angry` | 화나고 강렬한 톤 |
| `whisper` | 속삭이는 톤 |
| `toneup` | 톤을 올린 밝은 톤 |
| `tonedown` | 톤을 낮춘 차분한 톤 |

#### 7.4.3 Prompt (ssfm-v21 전용)

ssfm-v21 모델에서 사용하는 감정 프리셋 설정입니다.

| 필드 | 타입 | 필수 여부 | 설명 |
|------|------|-----------|------|
| `emotion_preset` | string | **required** | 감정 프리셋 선택. 사용 가능한 값: `normal`, `happy`, `sad`, `angry`, `tonemid`, `toneup` |
| `emotion_intensity` | number | optional | 감정 강도. 범위: `0.0` ~ `2.0` |

**예시:**

```json
{
  "emotion_preset": "happy",
  "emotion_intensity": 1.2
}
```

**ssfm-v21 감정 프리셋:**

| 프리셋 | 설명 |
|--------|------|
| `normal` | 일반적인 톤 |
| `happy` | 밝고 즐거운 톤 |
| `sad` | 슬프고 우울한 톤 |
| `angry` | 화나고 강렬한 톤 |
| `tonemid` | 중간 톤 |
| `toneup` | 톤을 올린 밝은 톤 |

> **참고:** ssfm-v30에서는 `whisper`, `tonedown` 프리셋이 추가되었고, ssfm-v21의 `tonemid`는 제거되었습니다.

---

### 7.5 Output 파라미터 상세

| 필드 | 타입 | 범위 | 기본값 | 설명 |
|------|------|------|--------|------|
| `volume` | integer | 0 ~ 200 | 100 | 오디오 볼륨. 100이 원본 볼륨입니다. |
| `audio_pitch` | integer | -12 ~ +12 | 0 | 오디오 피치 조정 (반음 단위). |
| `audio_tempo` | number | 0.5 ~ 2.0 | 1.0 | 오디오 재생 속도 배율. |
| `audio_format` | string | `"wav"` 또는 `"mp3"` | `"wav"` | 출력 오디오 포맷. |

**예시:**

```json
{
  "volume": 100,
  "audio_pitch": 0,
  "audio_tempo": 1,
  "audio_format": "wav"
}
```

---

### 7.6 Seed 파라미터

| 필드 | 타입 | 설명 |
|------|------|------|
| `seed` | integer | 음성 생성 변동을 제어하기 위한 랜덤 시드. 동일한 시드 값을 사용하면 유사한 결과를 재현할 수 있습니다. |

**예시:**

```json
"seed": 42
```

---

### 7.7 요청 예시 (cURL)

#### Smart Emotion을 사용하는 ssfm-v30 예시

```bash
curl \
  --request POST \
  --url https://api.typecast.ai/v1/text-to-speech \
  --header 'Content-Type: application/json' \
  --header 'X-API-KEY: <api-key>' \
  --output output.wav \
  --data @- <<EOF
{
  "voice_id": "tc_60e5426de8b95f1d3000d7b5",
  "text": "Everything is so incredibly perfect that I feel like I'm dreaming.",
  "model": "ssfm-v30",
  "language": "eng",
  "prompt": {
    "emotion_type": "smart",
    "previous_text": "I feel like I'm walking on air and I just want to scream with joy!",
    "next_text": "I am literally bursting with happiness and I never want this feeling to end!"
  },
  "output": {
    "volume": 100,
    "audio_pitch": 0,
    "audio_tempo": 1,
    "audio_format": "wav"
  },
  "seed": 42
}
EOF
```

#### Preset Emotion을 사용하는 ssfm-v30 예시

```bash
curl \
  --request POST \
  --url https://api.typecast.ai/v1/text-to-speech \
  --header 'Content-Type: application/json' \
  --header 'X-API-KEY: <api-key>' \
  --output output.wav \
  --data @- <<EOF
{
  "voice_id": "tc_60e5426de8b95f1d3000d7b5",
  "text": "오늘 정말 좋은 하루였어요!",
  "model": "ssfm-v30",
  "language": "kor",
  "prompt": {
    "emotion_type": "preset",
    "emotion_preset": "happy",
    "emotion_intensity": 1.5
  },
  "output": {
    "volume": 100,
    "audio_pitch": 0,
    "audio_tempo": 1,
    "audio_format": "mp3"
  }
}
EOF
```

#### ssfm-v21 모델 예시

```bash
curl \
  --request POST \
  --url https://api.typecast.ai/v1/text-to-speech \
  --header 'Content-Type: application/json' \
  --header 'X-API-KEY: <api-key>' \
  --output output.wav \
  --data @- <<EOF
{
  "voice_id": "tc_60e5426de8b95f1d3000d7b5",
  "text": "Hello, welcome to our service.",
  "model": "ssfm-v21",
  "language": "eng",
  "prompt": {
    "emotion_preset": "normal",
    "emotion_intensity": 1.0
  },
  "output": {
    "volume": 100,
    "audio_pitch": 0,
    "audio_tempo": 1,
    "audio_format": "wav"
  }
}
EOF
```

---

### 7.8 응답 (Response)

#### 200 - 성공 (Success)

Content-Type: `audio/wav` 또는 `audio/mpeg`

성공 시 오디오 파일 바이너리 데이터를 직접 반환합니다.

- **WAV**: 비압축 PCM 오디오, 16-bit 깊이, 모노 채널, 44,100 Hz 샘플 레이트
- **MP3**: MPEG Layer III, 모노 채널, 44,100 Hz 샘플 레이트, 320 kbps 비트레이트

```
[Binary audio data - WAV/MP3 file content]
```

---

### 7.9 에러 응답 (Error Responses)

에러 응답은 JSON 형식으로 반환됩니다:

```json
{
  "message": {
    "msg": "에러 설명 메시지",
    "error_code": "에러 코드 문자열"
  }
}
```

#### HTTP 상태 코드별 에러

| 상태 코드 | 이름 | 설명 |
|-----------|------|------|
| **400** | Bad Request | 잘못된 요청 파라미터. 필수 파라미터 누락, 잘못된 형식, 텍스트 길이 초과 등. |
| **401** | Unauthorized | 인증 실패. API 키가 유효하지 않거나 누락된 경우. |
| **402** | Payment Required | 잔여 크레딧 부족. 계정의 크레딧을 충전해야 합니다. |
| **404** | Not Found | 리소스를 찾을 수 없음. 지정한 `voice_id`가 존재하지 않는 경우. |
| **422** | Unprocessable Entity | 처리 불가능한 요청. 파라미터 값이 유효 범위를 벗어나거나 형식이 맞지 않는 경우. |
| **429** | Too Many Requests | 요청 속도 제한 초과. 잠시 후 다시 시도하세요. |
| **500** | Internal Server Error | 서버 내부 오류. 문제가 지속되면 지원팀에 문의하세요. |

---

## 8. 시작하기 (Get Started)

| 리소스 | 설명 |
|--------|------|
| [Quickstart](https://typecast.ai/docs/quickstart) | Typecast를 시작하고 첫 AI 음성을 만드세요. |
| [Models](https://typecast.ai/docs/models) | ssfm-v30과 ssfm-v21 모델에 대해 알아보세요. |
| [API Reference](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech) | 전체 API 문서를 살펴보세요. |
| [Changelog](https://typecast.ai/docs/changelog) | 최신 업데이트 내용을 확인하세요. |
| [API Console](https://typecast.ai/developers) | API 콘솔에서 직접 테스트하세요. |

---

## 부록: 모델 비교표

| 항목 | ssfm-v30 (최신) | ssfm-v21 |
|------|-----------------|----------|
| **상태** | 최신 권장 모델 | 안정적 프로덕션 모델 |
| **감정 제어** | Smart Emotion + Preset Emotion | Preset Emotion만 지원 |
| **감정 프리셋** | normal, happy, sad, angry, whisper, toneup, tonedown (7개) | normal, happy, sad, angry, tonemid, toneup (6개) |
| **Smart Emotion** | 지원 (맥락 기반 자동 추론) | 미지원 |
| **지원 언어 수** | 37개 | 27개 |
| **추가 언어** | Bengali, Cantonese, Hindi, Hungarian, Min Nan, Norwegian, Punjabi, Tagalog, Thai, Vietnamese | - |
| **운율/페이싱** | 개선됨 | 기본 |

---

> **문서 소스:**
> - [Typecast Overview](https://typecast.ai/docs/overview)
> - [Typecast Text-to-Speech API Reference](https://typecast.ai/docs/api-reference/text-to-speech/text-to-speech)
> - [Typecast Python SDK](https://typecast.ai/docs/sdk/python)
> - [Typecast GitHub](https://github.com/neosapience/typecast-python)

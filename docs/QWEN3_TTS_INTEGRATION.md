# Qwen3-TTS 로컬 TTS 통합 기술 문서

> 작성일: 2026-03-07
> 목적: Qwen3-TTS를 로컬 서버로 실행하여 기존 TTS 엔진(Typecast/ElevenLabs/SuperTonic)과 병행 사용하기 위한 기술 조사 및 통합 설계 문서

---

## 1. Qwen3-TTS 개요

- **출시**: 2026년 1월 22일, Alibaba Qwen 팀 오픈소스
- **학습 데이터**: 500만 시간 이상의 음성
- **아키텍처**: 경량 non-DiT 기반, 12Hz 오디오 토크나이저
- **지원 언어**: 10개 (Chinese, English, Japanese, **Korean**, German, French, Russian, Portuguese, Spanish, Italian)
- **GitHub**: https://github.com/QwenLM/Qwen3-TTS
- **HuggingFace**: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base

---

## 2. 한국어 성능

| 지표 | 결과 |
|------|------|
| WER (단어 오류율) | 10개 언어 중 **6개에서 최저** (한국어 포함) |
| 화자 유사도 | ElevenLabs Multilingual v2, MiniMax-Speech 대비 **10개 언어 모두 최고** |
| 중->한 혼합 오류 | CosyVoice3 대비 **66% 감소** (14.4 -> 4.82) |
| 한국어 프리셋 음성 | `Sohee` - "Warm Korean female voice with rich emotion" |

---

## 3. 모델 사양

### 3-1. 모델 변형

| 모델 | 파라미터 | 크기 | VRAM | 용도 |
|------|:---:|:---:|:---:|------|
| `Qwen3-TTS-12Hz-1.7B-Base` | 1.7B | ~6GB | 6~8GB | 음성 클론 (Base task) |
| `Qwen3-TTS-12Hz-1.7B-CustomVoice` | 1.7B | ~6GB | 6~8GB | 프리셋 음성 + 감정 제어 |
| `Qwen3-TTS-12Hz-0.6B-Base` | 0.6B | ~2.5GB | 4~6GB | 경량 음성 클론 |
| `Qwen3-TTS-12Hz-0.6B-CustomVoice` | 0.6B | ~2.5GB | 4~6GB | 경량 프리셋 음성 |

### 3-2. 추론 속도 (RTF = Real-Time Factor, 1.0 = 실시간)

| GPU | 0.6B RTF | 1.7B RTF |
|-----|:---:|:---:|
| RTX 3060 Ti | 0.85~1.15 | 실시간 미달 |
| RTX 3090 | 0.52~0.68 | 0.95~1.26 |
| RTX 4090 | ~0.4 | ~0.7 |
| RTX 5090 | ~0.3 | ~0.5 |

> FlashAttention 2 필수. 미적용 시 RTX 5090에서도 0.3x로 급락.

### 3-3. 3가지 태스크 모드

| 모드 | 모델명 접미사 | 설명 | 필요 파라미터 |
|------|-------------|------|--------------|
| **CustomVoice** | `-CustomVoice` | 프리셋 음성 + instructions 감정 제어 | `voice`, `instructions` |
| **VoiceDesign** | `-CustomVoice` | 자연어로 음성 특성 설계 | `instructions` (필수) |
| **Base** | `-Base` | 참조 오디오 음성 클론 (3초 이상) | `ref_audio`, `ref_text` |

---

## 4. 프리셋 음성 목록 (CustomVoice)

| 이름 | 언어 | 성별 | 특징 |
|------|------|:---:|------|
| `Vivian` | 중국어 | F | 밝고 약간 날카로운 젊은 여성 |
| `Serena` | 중국어 | F | 따뜻하고 부드러운 젊은 여성 |
| `Uncle_Fu` | 중국어 | M | 낮고 깊은 중년 남성 |
| `Dylan` | 중국어 (베이징) | M | 자연스럽고 맑은 젊은 남성 |
| `Eric` | 중국어 (쓰촨) | M | 활기찬 약간 허스키 남성 |
| `Ryan` | 영어 | M | 리드미컬한 남성 |
| `Aiden` | 영어 | M | 밝은 미국 남성 |
| `Ono_Anna` | 일본어 | F | 경쾌한 여성 |
| **`Sohee`** | **한국어** | **F** | **따뜻하고 감정 풍부한 여성** |

> 추가 음성이 필요하면 Base 모드로 음성 클론 가능 (3초 참조 오디오)

---

## 5. API 명세 (vLLM-Omni, OpenAI 호환)

### 5-1. 서버 실행

```bash
# vLLM-Omni 설치 후
python -m vllm_omni.entrypoints.openai.api_server \
  --model Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --host 0.0.0.0 \
  --port 8091 \
  --cors '*'
```

### 5-2. 음성 생성

**엔드포인트**: `POST /v1/audio/speech`

**요청 헤더**:
```
Content-Type: application/json
```

**요청 바디**:
```json
{
  "input": "오늘 날씨가 정말 좋습니다.",
  "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
  "voice": "Sohee",
  "language": "Korean",
  "task_type": "CustomVoice",
  "instructions": "따뜻하고 밝은 톤으로",
  "response_format": "wav",
  "speed": 1.0,
  "max_new_tokens": 2048
}
```

**파라미터 상세**:

| 파라미터 | 타입 | 기본값 | 필수 | 설명 |
|----------|------|--------|:---:|------|
| `input` | string | - | O | 합성할 텍스트 |
| `model` | string | 서버 로드 모델 | X | 모델 식별자 |
| `voice` | string | "vivian" | X | 프리셋 음성 이름 |
| `language` | string | "Auto" | X | Auto, Chinese, English, Japanese, **Korean**, German, French, Russian, Portuguese, Spanish, Italian |
| `task_type` | string | "CustomVoice" | X | CustomVoice, VoiceDesign, Base |
| `instructions` | string | "" | X | 감정/톤/스타일 자연어 지시 |
| `response_format` | string | "wav" | X | wav, mp3, flac, pcm, aac, opus |
| `speed` | float | 1.0 | X | 재생 속도 (0.25~4.0) |
| `max_new_tokens` | int | 2048 | X | 최대 생성 토큰 수 |
| `ref_audio` | string | null | Base 모드 시 | 참조 오디오 URL 또는 base64 data URL |
| `ref_text` | string | null | Base 모드 시 | 참조 오디오의 텍스트 전사 |

**응답**: 바이너리 오디오 데이터
- Content-Type: `audio/wav`, `audio/mp3` 등 요청 포맷에 따름
- WAV: PCM 16-bit Mono **24,000Hz** (Typecast의 44,100Hz와 다름!)

### 5-3. 음성 목록 조회

```
GET /v1/audio/voices
```

응답: 사용 가능한 음성 이름 JSON 배열

### 5-4. 코드 예시

**curl**:
```bash
curl -X POST http://localhost:8091/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "input": "안녕하세요, 오늘 날씨가 좋네요.",
    "voice": "Sohee",
    "language": "Korean",
    "instructions": "밝고 활기찬 톤"
  }' --output output.wav
```

**Python (OpenAI SDK)**:
```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8091/v1", api_key="none")
response = client.audio.speech.create(
    model="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
    voice="Sohee",
    input="안녕하세요, 오늘 날씨가 좋네요.",
)
response.stream_to_file("output.wav")
```

**Python (httpx)**:
```python
import httpx

response = httpx.post(
    "http://localhost:8091/v1/audio/speech",
    json={
        "input": "안녕하세요, 오늘 날씨가 좋네요.",
        "voice": "Sohee",
        "language": "Korean",
        "task_type": "CustomVoice",
        "instructions": "차분하고 따뜻한 톤",
    },
    timeout=300.0,
)
with open("output.wav", "wb") as f:
    f.write(response.content)
```

**JavaScript (브라우저 fetch)**:
```javascript
const response = await fetch('http://localhost:8091/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        input: '안녕하세요, 오늘 날씨가 좋네요.',
        voice: 'Sohee',
        language: 'Korean',
        task_type: 'CustomVoice',
        instructions: '밝고 활기찬 톤',
        response_format: 'wav',
    }),
});
const audioBlob = await response.blob();
const audioUrl = URL.createObjectURL(audioBlob);
```

---

## 6. Typecast vs Qwen3-TTS 비교

| 항목 | Typecast | Qwen3-TTS 로컬 |
|------|----------|----------------|
| **비용** | 유료 (API 크레딧) | 무료 (로컬 GPU) |
| **속도** | 즉시 (~동기, 1~3초) | 0.6B: 8~12초/10초 텍스트 |
| **한국어 음성 수** | 수십 개 | 1개 (Sohee) + 클론 |
| **감정 제어** | 프리셋 7개 (happy, sad, angry, whisper, toneup, tonedown, normal) | 자연어 instructions |
| **감정 강도** | emotion_intensity: 0.0~2.0 | 없음 (텍스트로 표현) |
| **음성 클론** | 불가 | 3초 참조로 가능 |
| **속도 조절** | audio_tempo: 0.5~2.0 | speed: 0.25~4.0 |
| **텍스트 제한** | 2,000자 | max_new_tokens 기반 (~2048 토큰) |
| **출력 포맷** | WAV (44.1kHz) / MP3 (320kbps) | WAV/MP3/FLAC/PCM/AAC/OPUS (**24kHz**) |
| **인증** | X-API-KEY 헤더 | 없음 (로컬) |
| **설치** | 없음 | Python + GPU + vLLM-Omni |

---

## 7. 통합 설계

### 7-1. 아키텍처

```
사용자 PC
  ├── vLLM-Omni 서버 (localhost:8091)
  │     └── Qwen3-TTS-12Hz-0.6B-CustomVoice (GPU)
  │
  └── 브라우저 (웹앱)
        └── 사운드스튜디오
              ├── TTS 엔진 선택 드롭다운
              │     ├── Typecast (클라우드)
              │     ├── ElevenLabs (클라우드)
              │     ├── SuperTonic (클라우드)
              │     └── Qwen3 로컬 (localhost)  ← 신규
              │
              └── 오디오 blob 반환 → 기존 파이프라인 100% 동일
                    ├── 타임라인 싱크
                    ├── 자막 분할 (ElevenLabs Scribe)
                    ├── 미리보기 재생
                    └── FFmpeg 렌더링
```

### 7-2. 필요한 코드 변경

| 파일 | 변경 내용 |
|------|----------|
| `src/services/qwen3TtsService.ts` | **신규** — Qwen3 TTS API 호출 모듈 |
| `src/services/apiService.ts` | 로컬 TTS 서버 URL 저장/조회 함수 추가 |
| `src/components/ApiKeySettings.tsx` | 로컬 TTS 서버 URL 입력란 + 연결 테스트 버튼 |
| `src/stores/soundStudioStore.ts` | TTS 엔진 선택 상태에 'qwen3' 추가 |
| `src/components/tabs/sound/VoiceStudio.tsx` | 엔진별 음성 목록/감정 UI 분기 |
| `src/components/tabs/sound/NarrationView.tsx` | 일괄 생성 시 동시 요청 수 제한 (로컬 전용) |

### 7-3. 감정 프리셋 매핑 (Typecast -> Qwen3 instructions)

```typescript
const EMOTION_TO_INSTRUCTIONS: Record<string, string> = {
  normal:   '',
  happy:    '밝고 즐거운 톤으로, 에너지가 넘치게',
  sad:      '슬프고 가라앉는 톤으로, 천천히',
  angry:    '화난 듯 강하고 날카로운 톤으로',
  whisper:  '속삭이듯 조용하고 부드럽게',
  toneup:   '밝고 높은 톤으로, 강조하듯',
  tonedown: '차분하고 낮은 톤으로, 절제된 목소리',
};
```

---

## 8. 예상 문제점 및 대응

### 8-1. CORS 차단

- **문제**: 브라우저가 `http://localhost:8091`으로의 cross-origin 요청 차단
- **대응**: vLLM 서버에 `--cors '*'` 옵션 필수. HTTPS 배포 시 Mixed Content 문제 발생 가능 -> 사용자 안내 필요

### 8-2. 샘플레이트 불일치 (24kHz vs 44.1kHz)

- **문제**: Typecast(44.1kHz)와 혼용 시 FFmpeg 렌더링에서 피치/속도 왜곡
- **대응**: Qwen3 오디오 수신 후 Web Audio API로 44.1kHz 리샘플링 처리

```typescript
async function resampleTo44100(audioBlob: Blob): Promise<Blob> {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const arrayBuffer = await audioBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const offlineCtx = new OfflineAudioContext(1, decoded.duration * 44100, 44100);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();
    // rendered AudioBuffer -> WAV Blob 변환
}
```

### 8-3. 응답 타임아웃

- **문제**: 긴 텍스트 생성 시 기본 타임아웃(2분) 초과
- **대응**: 로컬 TTS 전용 타임아웃 300초 설정

### 8-4. 일괄 생성 GPU 폭주

- **문제**: 20개 라인 동시 요청 -> GPU OOM 또는 극단적 지연
- **대응**: 로컬 TTS일 때 동시 요청 수 1~2개로 제한하는 큐 시스템

### 8-5. 서버 미실행

- **문제**: 사용자가 서버를 안 켰을 때 `ERR_CONNECTION_REFUSED`
- **대응**: Qwen3 선택 시 연결 상태 아이콘 표시 + "서버가 실행 중이지 않습니다" 안내

### 8-6. 속도 파라미터 범위

- **문제**: Typecast `audio_tempo: 0.5~2.0` vs Qwen3 `speed: 0.25~4.0`
- **대응**: 엔진별 범위 매핑. UI 슬라이더 범위를 엔진에 따라 동적 변경

### 8-7. 텍스트 길이 제한

- **문제**: Qwen3의 `max_new_tokens: 2048`은 글자 수가 아닌 토큰 기준
- **대응**: 긴 텍스트는 문장 단위로 청크 분할 생성 후 이어붙이기

---

## 9. 사용자 설치 가이드 (안내문에 포함할 내용)

### 9-1. 시스템 요구사항

- NVIDIA GPU (VRAM 4GB 이상, 권장 8GB+)
- Python 3.10+
- CUDA 12.1+

### 9-2. 설치

```bash
# 1. vLLM-Omni 설치
pip install vllm-omni

# 2. 서버 실행 (0.6B 경량 모델, 4GB VRAM 가능)
python -m vllm_omni.entrypoints.openai.api_server \
  --model Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice \
  --host 0.0.0.0 \
  --port 8091 \
  --cors '*'

# 또는 1.7B 고품질 모델 (8GB VRAM 필요)
python -m vllm_omni.entrypoints.openai.api_server \
  --model Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice \
  --host 0.0.0.0 \
  --port 8091 \
  --cors '*'
```

### 9-3. 연결 확인

```bash
# 서버 상태 확인
curl http://localhost:8091/v1/audio/voices

# 테스트 생성
curl -X POST http://localhost:8091/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input":"안녕하세요","voice":"Sohee","language":"Korean"}' \
  --output test.wav
```

### 9-4. 웹앱 설정

1. API 설정 > 로컬 TTS 서버 URL에 `http://localhost:8091` 입력
2. "연결 테스트" 클릭 -> 초록불 확인
3. 사운드스튜디오 > TTS 엔진 > "Qwen3 로컬" 선택

---

## 10. 참고 자료

- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS)
- [vLLM-Omni TTS API 문서](https://docs.vllm.ai/projects/vllm-omni/en/latest/serving/speech_api/)
- [vLLM-Omni Qwen3-TTS 가이드](https://docs.vllm.ai/projects/vllm-omni/en/latest/user_guide/examples/online_serving/qwen3_tts/)
- [Qwen3-TTS 1.7B HuggingFace](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base)
- [Qwen3-TTS 0.6B HuggingFace](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base)
- [ValyrianTech Qwen3-TTS Server](https://github.com/ValyrianTech/Qwen3-TTS_server)
- [Qwen3-TTS 성능 벤치마크](https://qwen3-tts.app/blog/qwen3-tts-performance-benchmarks-hardware-guide-2026)
- [Qwen3-TTS-Flash 리뷰](https://www.analyticsvidhya.com/blog/2025/12/qwen3-tts-flash-review/)

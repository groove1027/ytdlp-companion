# GPU 자체 호스팅 리서치 — Issue #332 이미지 생성 비용 절감

> **작성일**: 2026-03-16
> **관련 이슈**: [#332](https://github.com/groove1027/all-in-one-production/issues/332) — 롱폼 이미지 생성 비용 부담 / Whisk 개발 요청
> **요청자**: 이창재 (wnenddl9890@gmail.com)

---

## 목차

1. [이슈 요약](#1-이슈-요약)
2. [Google Whisk 분석 — 불가 판정](#2-google-whisk-분석--불가-판정)
3. [이미지 생성 API 가격 비교](#3-이미지-생성-api-가격-비교)
4. [Gemini 네이티브 이미지 생성](#4-gemini-네이티브-이미지-생성)
5. [GPU 자체 호스팅 — Imagen 4 vs FLUX 품질 비교](#5-gpu-자체-호스팅--imagen-4-vs-flux-품질-비교)
6. [오픈소스로 대체 가능한 유료 API 전체 목록](#6-오픈소스로-대체-가능한-유료-api-전체-목록)
7. [오픈소스 TTS — 한국어 지원 모델](#7-오픈소스-tts--한국어-지원-모델)
8. [오픈소스 영상 생성 모델](#8-오픈소스-영상-생성-모델)
9. [GPU 임대 업체 비교 — 월정액 vs 시간제](#9-gpu-임대-업체-비교--월정액-vs-시간제)
10. [사용자 규모별 비용 분석 (1,000 / 10,000 DAU)](#10-사용자-규모별-비용-분석)
11. [현재 비즈니스 모델 — API는 개인 부담 구조](#11-현재-비즈니스-모델--api는-개인-부담-구조)
12. [FLUX 해상도 & 라이선스 상세](#12-flux-해상도--라이선스-상세)
13. [최종 추천 구성 — 이미지 + TTS + DiffuEraser](#13-최종-추천-구성--이미지--tts--diffueraser)
14. [RunPod 트래픽/스토리지 정책](#14-runpod-트래픽스토리지-정책)
15. [결론 및 다음 단계](#15-결론-및-다음-단계)

---

## 1. 이슈 요약

### 사용자 피드백 (Issue #332)

> 안녕하세요! 롱폼을 주력으로 하고있는데 이미지 생성 비용이 나노바나나로 할 경우 많은 이미지가 생성되어 가격이 부담됩니다. 혹시 whisk는 개발이 어려울까요?

### 환경 정보
- 사용자: 이창재
- 앱 버전: v4.5
- 프로젝트: 135컷 롱폼 (Scene Count: 135, Scene Images: 24/135)
- 현재 모델: Evolink Nanobanana 2 ($0.08/장)
- 135컷 전체 생성 시: **$10.80/프로젝트**

---

## 2. Google Whisk 분석 — 불가 판정

| 항목 | 상태 |
|------|------|
| 공개 API | **없음** — 브라우저 전용 소비자 도구 |
| 서비스 수명 | **2026년 4월 30일 종료** (Google Flow로 흡수) |
| 비공식 API | `rohitaryal/whisk-api` npm 패키지 존재하지만 쿠키 인증 방식 → 불안정, ToS 위반 |
| 프로그래밍 접근 | 사실상 불가능 |

**Whisk 내부 구조**: Gemini가 참조 이미지를 캡셔닝 → Imagen 3.5로 생성. 즉 이미 우리가 쓰는 기술(Gemini + NanoBanana)의 래퍼에 불과.

### 참고 자료
- [Google Blog: Whisk announcement](https://blog.google/innovation-and-ai/models-and-research/google-labs/whisk/)
- [Google Workspace Updates: Whisk moving to Flow April 30, 2026](https://workspaceupdates.googleblog.com/2026/03/whisk-is-moving-to-flow-on-april-30-2026.html)
- [rohitaryal/whisk-api (GitHub)](https://github.com/rohitaryal/whisk-api)

---

## 3. 이미지 생성 API 가격 비교

### TIER 1: 초저가 (< $0.005/장)

| 제공사 | 모델 | 가격/장 | 품질 | 속도 | 무료 티어 |
|--------|------|---------|------|------|-----------|
| **Runware** | SD 1.5 | **$0.0006** | 낮음-중간 | 0.3s | $2 무료 크레딧 |
| **Runware** | FLUX Schnell | **$0.0006** | 중간 | ~1s | $2 무료 크레딧 |
| **Runware** | SDXL | **$0.0026** | 중간-좋음 | ~1s | $2 무료 크레딧 |
| **fal.ai** | FLUX.1 Schnell | **$0.003/MP** | 중간 | 1-2s | 있음 (제한) |
| **Replicate** | SDXL | **$0.003** | 중간-좋음 | ~3s | 일부 무료 |
| **OpenAI** | GPT Image 1 Mini (Low) | **$0.005** | 중간 | ~3s | $5 무료 크레딧 |

### TIER 2: 저가 ($0.01-$0.03/장)

| 제공사 | 모델 | 가격/장 | 품질 | 무료 티어 |
|--------|------|---------|------|-----------|
| **SiliconFlow** | FLUX.1 Kontext [dev] | **$0.015** | 좋음 | 있음 |
| **Google** | Imagen 4 Fast | **$0.020** | 좋음-높음 | AI Studio 무료 |
| **Google** | Gemini 2.5 Flash (배치) | **$0.0195** | 좋음 | **500장/일 무료** |
| **Replicate** | Flux 2 | **$0.030** | 높음 | 일부 무료 |

### TIER 3: 표준 ($0.03-$0.06/장)

| 제공사 | 모델 | 가격/장 | 품질 (Elo) |
|--------|------|---------|-----------|
| **Google** | Gemini 2.5 Flash Image | **$0.039** | 좋음 |
| **Google** | Imagen 4 Standard | **$0.040** | 높음 |
| **OpenAI** | GPT Image 1.5 | **$0.040** | **최상 (1264)** |
| **BFL** | Flux 2 Pro v1.1 | **$0.055** | **최상 (1265)** |

### 무료 티어 하이라이트

| 제공사 | 일일 한도 | 비고 |
|--------|----------|------|
| **Google Gemini (무료 API)** | **500장/일** (1024x1024) | 신용카드 불필요 |
| **Google AI Studio 웹** | **500~1,000장/일** | 별도 할당량 |
| **Together.ai** | 3개월 무제한 FLUX.1 Schnell | |
| **Runware** | $2 무료 크레딧 (~3,333장) | |

### 품질 순위 (Artificial Analysis ELO, 2026.03)

1. **Flux 2 Pro v1.1** — Elo 1,265
2. **GPT Image 1.5** — Elo 1,264
3. **Nano Banana 2 (Gemini 3.1 Flash)** — Elo 1,258
4. **Imagen 4 Ultra/Standard** — 경쟁적
5. **FLUX.2 [max]** — Elo 1,206
6. **FLUX.2 [dev]** — Elo 1,150
7. **FLUX.2 [klein] 4B** — Elo 1,068
8. **FLUX.1 Schnell** — Elo 1,038

---

## 4. Gemini 네이티브 이미지 생성

### 모델 현황

| 모델 ID | 코드명 | 출시 | 상태 |
|---------|--------|------|------|
| `gemini-2.0-flash-image` | (원조) | 2025 초 | **Deprecated** (2026.06 종료) |
| `gemini-2.5-flash-image` | **Nano Banana** | 2025 중 | **안정, 프로덕션** |
| `gemini-3-pro-image-preview` | **Nano Banana Pro** | 2025.11 | 프리뷰 |
| `gemini-3.1-flash-image-preview` | **Nano Banana 2** | 2026.02 | 프리뷰 (최신) |

### API 호출 방법

```
POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent

{
  "contents": [{"parts": [{"text": "프롬프트"}]}],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

### 가격

| 모델 | 해상도 | 가격/장 | 배치 (50% 할인) |
|------|--------|---------|----------------|
| **Nano Banana** (2.5 Flash) | 1K | **$0.039** | $0.0195 |
| **Nano Banana 2** (3.1 Flash) | 1K | **$0.067** | $0.034 |
| **Nano Banana Pro** (3 Pro) | 1K | **$0.134** | $0.067 |

### 무료 티어

- **하루 500장 무료** (Google AI Studio API 키, 신용카드 불필요)
- 135컷 롱폼 기준: **$0** (무료 한도 내)

### 프록시 가용성

- **Evolink**: `POST /v1/images/generations` — Nano Banana 2 $0.054 (1K)
- **KIE**: Nano Banana 2 ~$0.04 (1K)
- 프로젝트에 이미 Evolink/KIE 인프라 있음

---

## 5. GPU 자체 호스팅 — Imagen 4 vs FLUX 품질 비교

### 핵심: Imagen 4는 자체 호스팅 불가

Google 독점 모델. 가중치 미공개. API로만 접근 가능. 앞으로도 공개 계획 없음.

### ELO 아레나 기준 비교 (2026.03)

| 모델 | ELO | 자체호스팅 | 라이선스 |
|------|-----|----------|---------|
| GPT Image 1.5 | **1,268** | ❌ | API only |
| **FLUX.2 Max** | **1,206** | ❌ API only | 상용 |
| **FLUX.2 Pro** | **1,190** | ❌ API only | 상용 |
| **FLUX.2 Flex** | **1,179** | ❌ API only | 상용 |
| Imagen 4 Ultra | 1,175 | ❌ API only | — |
| **FLUX.2 Dev** | **1,150** | ✅ **가능** | 비상업 |
| FLUX.2 Klein 9B | 1,135 | ✅ 가능 | 비상업 |
| Imagen 4 Standard | 1,096 | ❌ | — |
| **FLUX.2 Klein 4B** | **1,068** | ✅ 가능 | **Apache 2.0** ✅ |
| Imagen 4 Fast | 1,064 | ❌ | — |
| FLUX.1 Dev | 1,038 | ✅ 가능 | 비상업 |

### 세부 비교

| 항목 | FLUX.2 Dev | Imagen 4 |
|------|-----------|----------|
| 포토리얼리즘 | ⭐⭐⭐⭐⭐ (카메라 광학 특성 재현) | ⭐⭐⭐⭐ (자연 장면 좋음) |
| 텍스트 렌더링 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 프롬프트 준수 | ⭐⭐⭐⭐⭐ (5~6개 요소 동시 처리) | ⭐⭐⭐⭐ |
| 캐릭터 일관성 | ⭐⭐⭐⭐⭐ (Kontext + LoRA) | ⭐ (도구 없음) |
| 아시아 얼굴 | ⭐⭐⭐ (LoRA로 보강 가능) | ⭐⭐⭐ |
| 예술적 스타일 | ⭐⭐⭐ | ⭐⭐⭐ |

**결론**: 자체 호스팅 가능한 FLUX.2 Dev (ELO 1,150)가 Imagen 4 Standard (1,096)·Fast (1,064)보다 품질이 높음. Imagen 4 Ultra (1,175)와도 거의 대등.

---

## 6. 오픈소스로 대체 가능한 유료 API 전체 목록

| 현재 (유료 API) | 대체 (자체 호스팅) | GitHub | VRAM | 라이선스 |
|----------------|-------------------|--------|------|---------|
| **NanoBanana 2** ($0.08/장) | **FLUX.2 Schnell** | black-forest-labs/flux | 8GB | Apache 2.0 ✅ |
| **WaveSpeed AI** (워터마크 제거) | **DiffuEraser** | lixiaowen-xw/DiffuEraser | 12~33GB | Apache 2.0 ✅ |
| **Remove.bg** (배경 제거) | **rembg + BRIA 2.0** | danielgatis/rembg | 2GB | MIT ✅ |
| **Typecast** (한국어 TTS) | **Qwen3-TTS** | QwenLM/Qwen3-TTS | 4~8GB | Apache 2.0 ✅ |
| **ElevenLabs** (TTS/SFX) | **Qwen3-TTS** + AudioCraft | 위 + facebookresearch/audiocraft | 4~8GB | Apache 2.0 / MIT ✅ |
| **Suno** (음악) | **ACE-Step 1.5** | ace-step/ACE-Step | 8GB | 오픈소스 |
| **Whisper API** (STT) | **faster-whisper** | SYSTRAN/faster-whisper | 4GB | MIT ✅ |
| **이미지 업스케일** | **Real-ESRGAN** | xinntao/Real-ESRGAN | 2~8GB | BSD-3 ✅ |
| **Veo 3.1 / Grok** (영상) | **LTX-2.3 + Wan 2.2** | Lightricks/LTX-Video + Wan-Video/Wan2.2 | 12~24GB | Apache 2.0 ✅ |

### DiffuEraser 상세

- **용도**: 비디오 인페인팅 / 오브젝트·워터마크 제거
- **GitHub**: [lixiaowen-xw/DiffuEraser](https://github.com/lixiaowen-xw/DiffuEraser)
- **라이선스**: Apache 2.0
- **아키텍처**: Stable Diffusion v1.5 + BrushNet + AnimateDiff 기반

| 해상도 | VRAM | 추론 시간 (250프레임) |
|--------|------|---------------------|
| 640×360 | 12GB | 92초 |
| 960×540 | 20GB | 175초 |
| 1280×720 | 33GB | 314초 |

- API 서버 내장 없음 → FastAPI 래퍼 필요
- ComfyUI 통합: [ComfyUI_DiffuEraser](https://github.com/smthemex/ComfyUI_DiffuEraser)

### 배경 제거 (rembg)

- **GitHub**: [danielgatis/rembg](https://github.com/danielgatis/rembg)
- **라이선스**: MIT
- BRIA RMBG-2.0 백엔드: 90.14% 정확도 (Remove.bg 수준)
- HTTP 서버 내장 (`rembg s`)
- VRAM: ~2GB

### 올인원 솔루션

- **LocalAI** ([mudler/LocalAI](https://github.com/mudler/LocalAI)): OpenAI/Anthropic/ElevenLabs 호환 API, Docker 하나로 LLM + 이미지 + TTS + STT 모두 서빙

---

## 7. 오픈소스 TTS — 한국어 지원 모델

### Kokoro TTS
- Apache 2.0, 초경량(82M, <1GB VRAM)
- **한국어 미지원** ❌ (영어, 일본어, 중국어 등 9개 언어만)

### 한국어 지원 모델 Tier 1

| 모델 | 한국어 품질 | 음성 복제 | 감정 | VRAM | 라이선스 |
|------|-----------|----------|------|------|---------|
| **Qwen3-TTS 0.6B** (알리바바) | ⭐⭐⭐⭐⭐ 최상급 | ✅ 3초 샘플 | ✅ 자연어 제어 | 4~8GB | Apache 2.0 ✅ |
| **CosyVoice 3** (알리바바) | ⭐⭐⭐⭐⭐ 네이티브 | ✅ 제로샷 | ✅ 세밀 제어 | ~4GB | Apache 2.0 ✅ |
| **GPT-SoVITS v3** | ⭐⭐⭐⭐ | ✅ 1분 레퍼런스 | ✅ | ~6GB | MIT ✅ |

### Qwen3-TTS가 1위인 이유
- 한국어 오류율 **4.82%** (경쟁 모델 20%+)
- ElevenLabs보다 음성 유사도 높음 (0.789 vs 0.646)
- 감정 제어 가능 (자연어로 "슬프게", "밝게" 등)
- 96배 실시간 속도
- GitHub: [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)

### 한국어 지원 모델 Tier 2

| 모델 | 한국어 | 음성 복제 | VRAM | 라이선스 |
|------|--------|----------|------|---------|
| **Chatterbox Multilingual** (Resemble) | 7-8/10 | ✅ | 4-8GB | MIT |
| **Orpheus TTS** (Canopy) | 전용 모델 존재 | ✅ | 2-12GB | Apache 2.0 |
| **XTTS-v2** (Coqui) | 17개 언어 중 하나 | ✅ 6초 | 6-8GB | 비상업 ❌ |
| **MeloTTS-Korean** (MyShell) | 전용 | ❌ | 최소 | MIT |

### 음악/SFX 생성

| 모델 | 용도 | VRAM | 라이선스 |
|------|------|------|---------|
| **ACE-Step 1.5** | 음악 (Suno 대체) | 8GB | 오픈소스 |
| **YuE** | 가사 포함 풀 송 | 16+GB | Apache 2.0 |
| **MusicGen** (Meta AudioCraft) | 배경 음악 | 4-8GB | MIT |
| **AudioGen** (Meta AudioCraft) | SFX | 4-8GB | MIT |

---

## 8. 오픈소스 영상 생성 모델

### RTX 4090 (24GB)에서 돌릴 수 있는 모델

| 모델 | 개발사 | 해상도 | 최대 길이 | RTX 4090 속도 (5초) | 품질 (VBench) | 라이선스 | I2V |
|------|--------|--------|----------|-------------------|-------------|---------|-----|
| **LTX-2.3** | Lightricks | **4K** | **60초** | **~4초** ⚡ | 81% | Apache 2.0 ✅ | ✅ |
| **Wan 2.2 (5B)** | 알리바바 | 480p | 5초 | ~4분 | **84.7%** 🏆 | Apache 2.0 ✅ | ✅ |
| **Wan 2.2 (14B GGUF)** | 알리바바 | 720p | 12초 | ~9분 | **84.7%** 🏆 | Apache 2.0 ✅ | ✅ |
| **HunyuanVideo 1.5** | 텐센트 | 720p | 5초 | **~75초** | 83% | Apache 2.0 ✅ | ✅ |
| **CogVideoX (5B)** | ZhipuAI | 720p | 10초 | ~5분 | 79% | 커스텀 | ✅ |
| **MAGI-1 (4.5B)** | Sand AI | 720p | **무제한** | 가변 | — | Apache 2.0 ✅ | ✅ |
| **SkyReels V4** | Skywork | 1080p | 15초 | ~20분 | — | 오픈소스 | ✅ |

### 상용 모델과 비교

| | Veo 3.1 (현재) | Wan 2.2 14B | LTX-2.3 | HunyuanVideo 1.5 |
|---|---|---|---|---|
| 품질 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 해상도 | 1080p | 720p | **4K** | 720p |
| 길이 | ~8초 | 12초 | **60초** | 5초 |
| 속도 | 수분 (API) | 9분 (로컬) | **4초** ⚡ | 75초 |
| 비용/건 | $0.25~1.00 | **$0** | **$0** | **$0** |
| 얼굴 품질 | 최상 | 좋음 | 보통 | **최상 (오픈소스 1위)** |
| 오디오 동기화 | ✅ | ❌ | ✅ | ❌ |

### 추천 조합

- **속도 우선**: LTX-2.3 (4초/5초 영상)
- **품질 우선**: Wan 2.2 14B GGUF
- **얼굴/인물**: HunyuanVideo 1.5

---

## 9. GPU 임대 업체 비교 — 월정액 vs 시간제

### 요금제 유형

| 유형 | 설명 | 대표 업체 |
|------|------|----------|
| **① 월정액 (진짜)** | 매월 고정 금액, 전용 물리 서버 | GPU-Mart, HostKey, Hetzner |
| **② 시간제 (24/7 가동)** | 초/시간 과금, 끄지 않으면 사실상 월정액 | RunPod, Vast.ai |
| **③ 서버리스** | 쓸 때만 과금, 안 쓰면 $0 | Modal, Salad (⚠️ 24/7 불가) |

### RTX 4090 월 비용 비교

| 업체 | 월 비용 | 유형 | 안정성 |
|------|--------|------|-------|
| **Vast.ai Reserved** | ~$226/월 (~33만원) | 시간제 (예약) | ⭐⭐⭐ |
| **RunPod Community** | ~$248/월 (~36만원) | 시간제 | ⭐⭐⭐ |
| **GPU-Mart** | $409/월 (~59만원) | ✅ 월정액 전용서버 | ⭐⭐⭐⭐ |

### RTX 3090 월 비용 비교

| 업체 | 월 비용 | 유형 | 안정성 |
|------|--------|------|-------|
| **Vast.ai** | ~$66~160/월 (~10~23만원) | 시간제 (변동가) | ⭐⭐ |
| **RunPod Community** | ~$161/월 (~23만원) | 시간제 | ⭐⭐⭐ |
| **GPU-Mart** | ~$150~200/월 (~22~29만원) | ✅ 월정액 | ⭐⭐⭐⭐ |

### A100 80GB 월 비용 비교

| 업체 | 월 비용 | 유형 |
|------|--------|------|
| **Vast.ai Reserved** | ~$489/월 (~71만원) | 시간제 (예약) |
| **GPU-Mart** | $765/월 (~111만원) | ✅ 월정액 |
| **RunPod Secure** | ~$1,307/월 | 시간제 |

### 하이퍼스케일러 (참고)

| 업체 | A100 80GB 월 비용 | 비고 |
|------|------------------|------|
| AWS | ~$2,482/월 (8-GPU 번들만) | 단일 A100 불가 |
| Google Cloud | ~$2,679/월 | CUD 할인 가능 |
| Azure | ~$2,681/월 | Spot: $537/월 (중단 가능) |
| KT Cloud | ~$4,160/월 (2×A100) | 국내 최비쌈 |

### 한국 GPU 업체

- **KT Cloud**: 2×A100 = 12,090원/시간 (~$4,160/월) — 비쌈
- **Naver Cloud**: 비공개 가격 — 국내 중 가장 저렴
- **Samsung SDS**: 기업 전용
- **GlobalConnect / CloudV / Gabia IDC**: 전용 서버 가능

---

## 10. 사용자 규모별 비용 분석

### 전제 조건

- 확보 유저: 400명 (예상 추가: +300명 = 700명)
- 1인당 이미지: 500~600장/일
- DAU: 가입자의 30%
- API는 개인 부담 구조

### 1,000 DAU 시나리오

| | API (현재 방식) | GPU 서버 |
|---|---|---|
| 이미지 20,000장/일 × $0.08 | **$48,000/월** | $0 |
| TTS 15,000클립/일 × ~$0.02 | $9,000/월 | $0 |
| 기타 | $3,900/월 | $0 |
| GPU 서버 (4× RTX 4090) | — | ~$1,000/월 |
| **합계** | **$60,900/월** | **~$1,000/월** |
| **차이** | | **61배 저렴** |

### 10,000 DAU 시나리오

| | API | GPU 서버 |
|---|---|---|
| 이미지 200,000장/일 × $0.08 | **$480,000/월** | $0 |
| TTS + 기타 | $180,000/월 | $0 |
| GPU 서버 (20× RTX 4090) | — | ~$6,000/월 |
| **합계** | **$660,000/월** | **~$6,000/월** |
| **차이** | | **110배 저렴** |

### 인건비 포함 현실적 비용

| | 1,000 DAU | 10,000 DAU |
|---|---|---|
| API 방식 | $66,000/월 | $660,000/월 |
| GPU + DevOps 인건비 | **$5,000~8,000/월** | **$12,000~20,000/월** |
| **절감율** | **88~92%** | **97~98%** |

---

## 11. 현재 비즈니스 모델 — API는 개인 부담 구조

```
현재: 사용자 각자 API 키 발급 → 각자 비용 부담 → 비용 불만 (#332)
```

### 선택지 3가지

| 방안 | 플랫폼 비용 | 개발량 | 사용자 효과 |
|------|-----------|-------|-----------|
| **① 더 싼 API 추가** | $0 | 낮음 | 즉시 절감 |
| **② GPU 서버 운영** | $1,000~2,000/월 + 인건비 | 높음 | 92~97% 절감 |
| **③ 하이브리드** | $0 → 점진적 | 중간 | 단계적 절감 |

### API 변경은 더 이상 불가

> "아니야 아니야 api를 바꾸는 건 안돼 이젠..." — 프로젝트 오너

→ **GPU 자체 호스팅 방향으로 확정**

---

## 12. FLUX 해상도 & 라이선스 상세

### 해상도

| 모델 | 최대 해상도 | 비고 |
|------|-----------|------|
| FLUX.1 Dev | ~1920×1080 (실용 한계) | 그 이상 품질 저하 |
| **FLUX.2 Dev** | **2048×2048 (4MP)** | 2K 네이티브 OK |
| **FLUX.2 Schnell** | **2048×2048 (4MP)** | 동일 |
| 현재 NanoBanana 2 | 2048px (2K) | 비슷한 수준 |

- **2K (2048px)는 됨.** 4K (3840×2160 = 8.29MP)는 안 됨 → 업스케일러 필요
- 2048×2048 생성 시간: RTX 4090에서 ~2.2~2.8분, A100 80GB에서 ~68~84초

### 라이선스 상세

| 모델 | 라이선스 | 상업 사용 | SaaS 제공 |
|------|---------|----------|----------|
| **FLUX.2 Schnell** | **Apache 2.0** | ✅ 무제한 무료 | ✅ |
| **FLUX.2 Klein 4B** | **Apache 2.0** | ✅ 무제한 무료 | ✅ |
| FLUX.2 Dev | 비상업 v2.1 | ❌ (상업 라이선스 필요) | ❌ |

### FLUX.2 Dev 상업 라이선스 (참고)

| 구간 | 비용 |
|------|------|
| 기본 | $999/월 (10만장 포함) |
| 10만장 초과 | $0.01/장 추가 |
| 100만장 초과 | 영업팀 문의 |

**400명 × 550장 = 월 ~200만장 → $999 + (200만-10만) × $0.01 = ~$19,999/월** → 비현실적

**→ 상업 서비스에는 FLUX.2 Schnell (Apache 2.0) 또는 Klein 4B 사용**

### 생성 이미지의 상업적 사용

- FLUX.2 Dev 라이선스 Section 2(d): "Output은 상업적 목적 포함 모든 용도로 사용 가능"
- 하지만 모델을 상업적으로 운영하는 것 자체가 위반 → 법적 회색지대
- **FLUX.2 Schnell/Klein은 Apache 2.0이므로 이 문제 없음**

---

## 13. 최종 추천 구성 — 이미지 + TTS + DiffuEraser

### 서비스 구성

| 역할 | 모델 | VRAM | 라이선스 | 라이선스료 |
|------|------|------|---------|----------|
| 이미지 생성 | **FLUX.2 Schnell** | 8GB | Apache 2.0 ✅ | $0 |
| 한국어 TTS | **Qwen3-TTS 0.6B** | 4GB | Apache 2.0 ✅ | $0 |
| 워터마크 제거 | **DiffuEraser** | 12GB (360p) | Apache 2.0 ✅ | $0 |

### GPU 구성 — 400명 (DAU 120)

```
GPU 1 (RTX 4090): FLUX Schnell     (8GB)  ← 이미지 전용
GPU 2 (RTX 4090): FLUX Schnell     (8GB)  ← 이미지 전용
GPU 3 (RTX 4090): Qwen3-TTS (4GB) + DiffuEraser 360p (12GB) = 16GB
                   ← 동시 가동 OK (여유 8GB)
합계: 3대
```

### GPU 구성 — 700명 (DAU 210)

```
GPU 1 (RTX 4090): FLUX Schnell     ← 이미지
GPU 2 (RTX 4090): FLUX Schnell     ← 이미지
GPU 3 (RTX 4090): FLUX Schnell     ← 이미지 (피크 대응)
GPU 4 (RTX 4090): Qwen3-TTS + DiffuEraser  ← 오디오+유틸
합계: 4대
```

### 월 비용

#### 400명 — 3대

| 업체 | 월 비용 | 방식 |
|------|--------|------|
| **Vast.ai** | ~$678/월 (~99만원) | 예약제 |
| **RunPod** | ~$744/월 (~109만원) | 시간제 24/7 |
| **GPU-Mart** | ~$1,227/월 (~179만원) | ✅ 월정액 |

#### 700명 — 4대

| 업체 | 월 비용 | 방식 |
|------|--------|------|
| **Vast.ai** | ~$904/월 (~132만원) | 예약제 |
| **RunPod** | ~$992/월 (~145만원) | 시간제 24/7 |
| **GPU-Mart** | ~$1,636/월 (~239만원) | ✅ 월정액 |

### 사용자당 분담 비용

| | Vast.ai | RunPod | GPU-Mart (월정액) |
|---|---|---|---|
| **400명** | $1.7/인 (2,500원) | $1.9/인 (2,700원) | $3.1/인 (4,500원) |
| **700명** | $1.3/인 (1,900원) | $1.4/인 (2,000원) | $2.3/인 (3,400원) |

### 현재 대비 절감

```
현재:  사용자 1인당 $44/월  (550장 × $0.08)
전환:  사용자 1인당 $1.3~3.1/월

→ 93~97% 절감
```

---

## 14. RunPod 트래픽/스토리지 정책

### 트래픽

| 항목 | RunPod |
|------|--------|
| **네트워크 트래픽** | **무료 (무제한)** — ingress/egress 비용 없음 |
| **대역폭 제한** | 없음 |
| **숨겨진 요금** | 없음 (초 단위 과금, 투명) |
| **GPU** | 전용 (다른 사용자와 공유 안 함) |

### 스토리지

| 항목 | 가격 |
|------|------|
| 실행 중 (Container Disk) | $0.10/GB/월 |
| **중지 시** | **$0.20/GB/월** ⚠️ (2배!) |

→ Pod 끄지 말고 **계속 돌려야** 스토리지 비용이 절반. 24/7 서비스니까 문제없음.

### 스토리지 사용처

- **FLUX 모델 파일**: ~12GB
- **Qwen3-TTS 모델 파일**: ~2GB
- **DiffuEraser 모델 파일**: ~5GB
- **생성 이미지**: 임시 저장 후 Cloudinary(이미 사용 중)로 업로드 → 삭제

모델 파일만 저장하면 GPU당 **~20GB면 충분**.

### 수정된 RunPod 4대 월 비용

| 항목 | 계산 | 월 비용 |
|------|------|--------|
| GPU 4대 | $0.34 × 4 × 24h × 30일 | $979 |
| 스토리지 | 20GB × 4대 × $0.10 | $8 |
| 네트워크 | 무제한 | $0 |
| **합계** | | **~$987/월 (~144만원)** |

### 참고 링크
- [RunPod Pricing](https://www.runpod.io/pricing)
- [RunPod Pods Pricing Documentation](https://docs.runpod.io/pods/pricing)
- [RunPod GPU Pricing Breakdown - Northflank](https://northflank.com/blog/runpod-gpu-pricing)

---

## 15. 결론 및 다음 단계

### 최종 추천

| 항목 | 내용 |
|------|------|
| **서비스** | 이미지 + TTS + 워터마크 제거 |
| **모델** | FLUX.2 Schnell + Qwen3-TTS + DiffuEraser |
| **라이선스** | 전부 Apache 2.0 (**상업 무료**) |
| **GPU** | RTX 4090 × 3~4대 |
| **업체** | **RunPod** (가성비) 또는 **GPU-Mart** (월정액) |
| **월 비용** | **$987~1,636/월** (144~239만원) |
| **사용자당** | **$1.3~3.1/월** (1,900~4,500원) |
| **현재 대비** | **93~97% 절감** |

### 아키텍처

```
사용자 브라우저
    ↓
자체 API 게이트웨이 (Cloudflare Worker 등)
    ↓
Redis 큐 (요청 순서 관리)
    ↓
┌─ GPU 1: FLUX Schnell ─┐
├─ GPU 2: FLUX Schnell ─┤  → 이미지 URL 반환
├─ GPU 3: FLUX Schnell ─┤
└─ GPU 4: Qwen3-TTS    ─┘  + DiffuEraser
    ↓
Cloudinary / S3 / R2 (생성 이미지 저장)
    ↓
사용자에게 URL 반환
```

### 다음 단계

1. **이슈 #332 답변** — 사용자에게 비용 절감 방향 안내
2. **GPU 업체 선정** — RunPod vs GPU-Mart 최종 결정
3. **인프라 구축** — GPU 서버 세팅, FLUX/Qwen3-TTS/DiffuEraser 설치
4. **API 게이트웨이 개발** — 큐 시스템 + 로드밸런서
5. **앱 연동** — 기존 이미지 생성 엔드포인트를 자체 서버로 교체
6. **과금 모델 설계** — 구독제 or 건당 과금

---

## 참고 자료 모음

### Google Whisk
- [Google Blog: Whisk announcement](https://blog.google/innovation-and-ai/models-and-research/google-labs/whisk/)
- [Whisk moving to Flow April 30, 2026](https://workspaceupdates.googleblog.com/2026/03/whisk-is-moving-to-flow-on-april-30-2026.html)
- [rohitaryal/whisk-api (비공식)](https://github.com/rohitaryal/whisk-api)

### 이미지 생성
- [AI Image Generation API Comparison 2026](https://blog.laozhang.ai/en/posts/ai-image-generation-api-comparison-2026)
- [Cheapest Image Gen Models 2026](https://www.siliconflow.com/articles/en/the-cheapest-image-gen-models)
- [Artificial Analysis Text-to-Image Leaderboard](https://artificialanalysis.ai/image/leaderboard/text-to-image)
- [FLUX.2 Dev (HuggingFace)](https://huggingface.co/black-forest-labs/FLUX.2-dev)
- [BFL Licensing](https://bfl.ai/licensing)
- [BFL Official Docs](https://docs.bfl.ml/flux_2/flux2_text_to_image)

### Gemini
- [Google AI Gemini Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Image Free Limits 2026](https://blog.laozhang.ai/en/posts/gemini-image-generation-free-limit-2026)

### TTS
- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS)
- [CosyVoice GitHub](https://github.com/FunAudioLLM/CosyVoice)
- [GPT-SoVITS GitHub](https://github.com/RVC-Boss/GPT-SoVITS)
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)

### 영상 생성
- [Wan 2.2 GitHub](https://github.com/Wan-Video/Wan2.2)
- [LTX-Video GitHub](https://github.com/Lightricks/LTX-Video)
- [HunyuanVideo 1.5 GitHub](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5)
- [CogVideo GitHub](https://github.com/zai-org/CogVideo)

### GPU 인프라
- [RunPod Pricing](https://www.runpod.io/pricing)
- [RunPod Pods Documentation](https://docs.runpod.io/pods/pricing)
- [GPU-Mart Pricing](https://www.gpu-mart.com/pricing)
- [Vast.ai Pricing](https://vast.ai/pricing)
- [Vast.ai vs RunPod 2026](https://medium.com/@velinxs/vast-ai-vs-runpod-pricing-in-2026-which-gpu-cloud-is-cheaper-bd4104aa591b)

### 기타 도구
- [DiffuEraser GitHub](https://github.com/lixiaowen-xw/DiffuEraser)
- [rembg GitHub](https://github.com/danielgatis/rembg)
- [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper)
- [ACE-Step GitHub](https://github.com/ace-step/ACE-Step)
- [Real-ESRGAN GitHub](https://github.com/xinntao/Real-ESRGAN)
- [LocalAI GitHub](https://github.com/mudler/LocalAI)

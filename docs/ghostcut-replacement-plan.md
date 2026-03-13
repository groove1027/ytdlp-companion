# GhostCut → Oracle + RunPod 자막 제거 대체 기술 문서

> **문서 버전**: v1.0
> **작성일**: 2026-03-12
> **대상 독자**: 프로젝트 오너, 개발자
> **목적**: GhostCut 의존 탈피 → 자체 인프라 자막 제거 시스템 구축 계획

---

## 목차

1. [현재 시스템 분석 (GhostCut)](#1-현재-시스템-분석-ghostcut)
2. [대체 시스템 아키텍처](#2-대체-시스템-아키텍처)
3. [핵심 기술 상세](#3-핵심-기술-상세)
4. [비용 분석](#4-비용-분석)
5. [과금 모델 설계](#5-과금-모델-설계)
6. [구현 로드맵](#6-구현-로드맵)
7. [API 스펙](#7-api-스펙)
8. [리스크 및 대응](#8-리스크-및-대응)
9. [FAQ](#9-faq)

---

## 1. 현재 시스템 분석 (GhostCut)

### 1-1. 아키텍처

```
브라우저 (클라이언트)
   │
   │ ① 영상 업로드
   ▼
Cloudinary (영상 호스팅)
   │
   │ ② 공개 URL 생성
   ▼
GhostCut API (api.zhaoli.com)
   │  ├── OCR 기반 자막 감지
   │  ├── AI 인페인팅 (배경 복원)
   │  └── 영상 재인코딩
   │
   │ ③ 콜백 → Cloudflare D1
   ▼
브라우저 ← 폴링으로 상태 확인 ← D1 DB
   │
   │ ④ 처리 완료된 영상 다운로드
   ▼
완성 영상
```

### 1-2. 현재 비용 구조

| 항목 | 비용 |
|------|------|
| 5초 영상 | $0.05 (최소) |
| 30초 영상 | $0.30 |
| 1분 영상 | $0.60 |
| 5분 영상 | $3.00 |
| 10분 영상 | $6.00 |
| **과금 단위** | **$0.01/초** |

### 1-3. 현재 문제점

| 문제 | 영향 |
|------|------|
| **제3자 API 의존** | GhostCut 서비스 장애 시 자막 제거 전체 불가 |
| **높은 단가** | $0.01/초 → 사용자 부담 큼 |
| **사용자 진입 장벽** | GhostCut 가입 + API 키 발급 필요 |
| **마진 0%** | 중개만 하고 수익 없음 |
| **처리 시간 불투명** | 3~30분, 제어 불가 |
| **MD5 이중 서명** | 복잡한 인증 구조 (AppKey + AppSign) |

### 1-4. 현재 코드 구조

```
src/
├── services/
│   └── ghostcutService.ts          (441줄)
│       ├── generateSign()           — MD5 이중 서명
│       ├── submitTask()             — GhostCut API 호출
│       ├── pollResult()             — 상태 폴링 (최대 30분)
│       └── removeSubtitlesWithGhostCut()  — 진입점
│
├── components/tabs/
│   └── SubtitleRemoverTab.tsx       (473줄)
│       ├── 드래그앤드롭 업로드
│       ├── 실시간 비용 추정
│       ├── 단계별 진행 표시
│       └── 결과 다운로드
│
└── functions/api/ghostcut/          (Cloudflare Pages Functions)
    ├── submit.ts                    — CORS 프록시
    ├── callback.ts                  — 결과 수신 → D1 저장
    └── poll.ts                      — 클라이언트 폴링 응답
```

---

## 2. 대체 시스템 아키텍처

### 2-1. 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                        브라우저 (클라이언트)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ 영상 선택  │→ │ 업로드    │→ │ 진행 표시  │→ 결과 다운로드    │
│  └──────────┘  └──────────┘  └──────────┘                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (Cloudflare 프록시)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Oracle Cloud VPS (무료, ARM 4코어 24GB)          │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ API 서버     │  │ 작업 큐      │  │ 유저/크레딧   │         │
│  │ (Express)   │  │ (Bull/BullMQ)│  │ DB (SQLite)  │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                   │
│  ┌──────▼──────┐  ┌──────▼──────┐                           │
│  │ 전처리       │  │ 후처리       │                           │
│  │ • FFmpeg     │  │ • FFmpeg     │                           │
│  │ • 프레임추출  │  │ • 영상재조립  │                           │
│  │ • OCR 감지   │  │ • 인코딩     │                           │
│  └──────┬──────┘  └──────▲──────┘                           │
│         │                │                                   │
└─────────┼────────────────┼──────────────────────────────────┘
          │ API 호출        │ 결과 반환
          ▼                │
┌─────────────────────────────────────────────────────────────┐
│              RunPod Serverless (GPU, 사용 시만 과금)           │
│                                                             │
│  ┌─────────────────────────────────────────┐                │
│  │  ProPainter / LaMa 인페인팅 모델          │                │
│  │  • GPU: A40 또는 A100                    │                │
│  │  • 프레임 단위 배경 복원                   │                │
│  │  • ~0.05초/프레임 (GPU)                  │                │
│  └─────────────────────────────────────────┘                │
│                                                             │
│  비용: $0.00025/초 (GPU 사용 시간 기준)                       │
└─────────────────────────────────────────────────────────────┘
```

### 2-2. 처리 흐름 상세

```
단계 1: 전처리 (Oracle VPS, 무료)
─────────────────────────────────
  ① 클라이언트에서 영상 수신 (또는 YouTube URL → yt-dlp 추출)
  ② FFmpeg으로 프레임 추출 (1fps 또는 원본 fps)
  ③ OCR 엔진(Tesseract)으로 자막 영역 좌표 감지
  ④ 자막 마스크 이미지 생성 (검은 배경 + 흰색 자막 영역)

단계 2: AI 인페인팅 (RunPod GPU, 유료)
─────────────────────────────────
  ⑤ 프레임 + 마스크를 RunPod에 전송
  ⑥ ProPainter 모델이 자막 영역의 배경 복원
  ⑦ 인페인팅된 프레임 반환

단계 3: 후처리 (Oracle VPS, 무료)
─────────────────────────────────
  ⑧ 인페인팅된 프레임들로 영상 재조립 (FFmpeg)
  ⑨ 원본 오디오 트랙 결합
  ⑩ 클라이언트에 결과 전달
```

### 2-3. 왜 이렇게 나누나?

| 단계 | 필요 자원 | 어디서 | 비용 |
|------|----------|--------|------|
| 프레임 추출 | CPU + 디스크 | Oracle VPS | 무료 |
| OCR 자막 감지 | CPU + RAM | Oracle VPS | 무료 |
| **AI 인페인팅** | **GPU 필수** | **RunPod** | **유료** |
| 영상 재조립 | CPU + 디스크 | Oracle VPS | 무료 |

→ **GPU가 필요한 작업만** RunPod에 보내서 비용 최소화

---

## 3. 핵심 기술 상세

### 3-1. AI 인페인팅 모델 비교

| 모델 | 방식 | 품질 | 속도 (GPU) | 특징 |
|------|------|------|-----------|------|
| **ProPainter** | 비디오 인페인팅 | ★★★★★ | 0.05초/프레임 | 시간적 일관성 최고, 영상 전용 |
| **LaMa** | 이미지 인페인팅 | ★★★★ | 0.02초/프레임 | 빠름, 프레임별 독립 처리 |
| **E2FGVI** | 비디오 인페인팅 | ★★★★ | 0.08초/프레임 | 플로우 기반 |
| **STTN** | 비디오 인페인팅 | ★★★ | 0.06초/프레임 | 트랜스포머 기반 |

**추천: ProPainter**
- 프레임 간 시간적 일관성이 가장 좋음 (깜빡임 없음)
- vmake.ai와 동일한 계열의 기술
- 오픈소스 (GitHub: MCG-NJU/ProPainter)

### 3-2. OCR 자막 감지

```
입력: 영상 프레임 (1920×1080)
   │
   ├── ① 하단 20% 영역 크롭 (자막이 보통 여기 위치)
   ├── ② 텍스트 감지 (Tesseract OCR 또는 PaddleOCR)
   ├── ③ 감지된 텍스트 영역 → 바운딩 박스 좌표 추출
   └── ④ 마스크 이미지 생성 (자막 영역 = 흰색, 나머지 = 검정)

출력: 마스크 이미지 (1920×1080, 흑백)
```

**OCR 엔진 비교:**

| 엔진 | 한국어 | 속도 | 설치 | 비용 |
|------|--------|------|------|------|
| **Tesseract 5** | ✅ | 보통 | apt install | 무료 |
| **PaddleOCR** | ✅ | 빠름 | pip install | 무료 |
| **EasyOCR** | ✅ | 느림 | pip install | 무료 |

→ 모두 CPU에서 동작, Oracle VPS에서 무료 실행 가능

### 3-3. FFmpeg 프레임 처리

```bash
# 프레임 추출 (1fps → 자막 위치 분석용)
ffmpeg -i input.mp4 -vf "fps=1" frames/frame_%04d.png

# 원본 fps 프레임 추출 (인페인팅용, 30fps 기준)
ffmpeg -i input.mp4 frames/frame_%06d.png

# 인페인팅 후 영상 재조립
ffmpeg -framerate 30 -i inpainted/frame_%06d.png \
       -i input.mp4 -map 0:v -map 1:a \
       -c:v libx264 -crf 18 -preset medium \
       -c:a copy output.mp4
```

### 3-4. RunPod Serverless 연동

**Docker 이미지 구성:**
```dockerfile
FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime
RUN pip install propainter opencv-python
COPY handler.py /handler.py
CMD ["python", "/handler.py"]
```

**Handler 코드 (RunPod 워커):**
```python
import runpod
from propainter import inpaint_video

def handler(event):
    frames = event["input"]["frames"]       # Base64 인코딩된 프레임들
    masks = event["input"]["masks"]         # Base64 인코딩된 마스크들

    result = inpaint_video(frames, masks)   # GPU 인페인팅

    return {"output": {"inpainted_frames": result}}

runpod.serverless.start({"handler": handler})
```

**API 호출 (Oracle VPS → RunPod):**
```javascript
const response = await fetch('https://api.runpod.ai/v2/{endpoint_id}/runsync', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer RUNPOD_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    input: {
      frames: base64Frames,    // 인페인팅할 프레임들
      masks: base64Masks,      // 자막 마스크들
    }
  })
});
```

---

## 4. 비용 분석

### 4-1. 인프라 비용 (개발자 부담)

| 항목 | 월 비용 | 비고 |
|------|---------|------|
| Oracle Cloud VPS | **$0** | Always Free (ARM 4코어 24GB) |
| Oracle 트래픽 | **$0** | 월 10TB 무료 |
| Cloudflare CDN | **$0** | Free Plan |
| 도메인 | ~$1/월 | 이미 있으면 $0 |
| **고정 비용 합계** | **~$0/월** | |

### 4-2. RunPod 변동 비용 (사용량 비례)

| GPU | 비용/초 | 1분 영상 처리 | 10분 영상 처리 |
|-----|--------|-------------|--------------|
| **A40 (48GB)** | $0.00025 | ~$0.023 (약 31원) | ~$0.23 (약 310원) |
| A100 (80GB) | $0.00044 | ~$0.040 (약 54원) | ~$0.40 (약 540원) |
| T4 (16GB) | $0.00015 | ~$0.027 (약 36원) | ~$0.27 (약 365원) |

**계산 기준 (A40):**
```
1분 영상 = 1,800 프레임 (30fps)
ProPainter 처리: ~0.05초/프레임
GPU 사용 시간: 1,800 × 0.05 = 90초
비용: 90 × $0.00025 = $0.023 (약 31원)
```

### 4-3. GhostCut vs RunPod 비용 비교

| 영상 길이 | GhostCut (현재) | RunPod (대체) | 절감률 |
|----------|----------------|--------------|--------|
| 30초 | $0.30 (405원) | $0.012 (16원) | **96%** |
| 1분 | $0.60 (810원) | $0.023 (31원) | **96%** |
| 5분 | $3.00 (4,050원) | $0.115 (155원) | **96%** |
| 10분 | $6.00 (8,100원) | $0.230 (310원) | **96%** |
| 30분 | $18.00 (24,300원) | $0.690 (932원) | **96%** |

### 4-4. 월간 비용 시뮬레이션

| 시나리오 | 일 사용량 | RunPod 월 비용 | GhostCut 대비 |
|----------|----------|---------------|-------------|
| 소규모 (유저 10명) | 10분/일 | ~$7 (9,500원) | $180 → $7 |
| 중규모 (유저 50명) | 50분/일 | ~$35 (47,000원) | $900 → $35 |
| 대규모 (유저 200명) | 200분/일 | ~$140 (189,000원) | $3,600 → $140 |

---

## 5. 과금 모델 설계

### 5-1. 추천 모델: 크레딧 시스템

```
┌─────────────────────────────────────────────────────────┐
│                    크레딧 시스템 흐름                      │
│                                                         │
│  사용자                                                  │
│    │                                                    │
│    ├── ① 카카오/구글 간편 로그인                           │
│    │                                                    │
│    ├── ② 크레딧 구매 (토스페이먼츠)                        │
│    │     ├── 3,000원 →  10분 크레딧                      │
│    │     ├── 9,000원 →  40분 크레딧 (+10분 보너스)         │
│    │     └── 19,000원 → 100분 크레딧 (+30분 보너스)        │
│    │                                                    │
│    ├── ③ 자막 제거 요청                                   │
│    │     └── 크레딧 잔액 확인 → 부족 시 충전 안내           │
│    │                                                    │
│    └── ④ 처리 완료 → 크레딧 차감                          │
│          └── 실제 영상 길이 기준 차감 (초 단위)             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5-2. 가격 설계

**원가:**
```
1분 원가 = RunPod $0.023 + Oracle $0 + Cloudflare $0
        = 약 31원
```

**판매가 (x15 마진):**
```
1분 = 500원 (크레딧 1분 = 500원)
```

**크레딧 패키지:**

| 패키지 | 가격 | 포함량 | 분당 단가 | 마진 |
|--------|------|--------|----------|------|
| 스타터 | 3,000원 | 10분 | 300원 | 약 2,700원 (90%) |
| 베이직 | 9,000원 | 50분 | 180원 | 약 7,450원 (83%) |
| 프로 | 19,000원 | 130분 | 146원 | 약 14,970원 (79%) |

### 5-3. 무료 체험

- 신규 가입 시 **3분 무료 크레딧** 제공
- 원가: 약 93원 (부담 없음)
- 전환율 기대: 무료 체험 → 유료 전환 15~25%

### 5-4. 결제 시스템 (토스페이먼츠)

```
결제 흐름:
───────────
브라우저 → 토스 결제창 → 결제 완료
                          │
                     ┌────▼────┐
                     │ 토스 웹훅 │ → Oracle VPS → DB 크레딧 추가
                     └─────────┘

필요 사항:
├── 토스페이먼츠 가맹점 등록 (사업자등록증 필요)
├── 클라이언트 키 + 시크릿 키 발급
├── 결제 위젯 SDK 연동 (프론트엔드)
└── 웹훅 수신 엔드포인트 (Oracle VPS)

수수료: 카드 3.2% + VAT
  → 3,000원 결제 시 수수료 약 106원
```

### 5-5. 대안: 사업자 없이 운영

사업자등록증 없이도 가능한 방법:

| 방법 | 설명 | 수수료 |
|------|------|--------|
| **카카오페이 송금** | 수동 크레딧 충전 (관리 번거로움) | 0% |
| **Paddle** | 해외 결제 대행 (사업자 불필요) | 5% + $0.50 |
| **Gumroad** | 크레딧 쿠폰 판매 | 10% |
| **사용자 RunPod 키** | 직접 입력 방식 | 0% (과금 없음) |

---

## 6. 구현 로드맵

### Phase 1: 기반 구축 (1~2일)

```
목표: Oracle VPS에 자막 제거 파이프라인 기본 구조 구축

작업:
├── [1] Oracle VPS에 FFmpeg + Tesseract 설치
├── [2] 프레임 추출 + OCR 자막 감지 파이프라인
├── [3] RunPod Serverless 엔드포인트 생성
│     └── ProPainter Docker 이미지 배포
├── [4] Oracle VPS API 엔드포인트 추가
│     ├── POST /api/subtitle/submit
│     ├── GET  /api/subtitle/status/:taskId
│     └── GET  /api/subtitle/download/:taskId
└── [5] 기본 동작 테스트

파일 변경:
├── server/subtitle-worker.js     (신규 — 전처리/후처리 워커)
├── server/runpod-client.js       (신규 — RunPod API 클라이언트)
└── server/index.js               (수정 — 엔드포인트 추가)
```

### Phase 2: 프론트엔드 연동 (1일)

```
목표: 기존 SubtitleRemoverTab에서 새 API 사용

작업:
├── [1] src/services/subtitleRemovalService.ts 생성
│     └── GhostCut 대체 API 클라이언트
├── [2] SubtitleRemoverTab.tsx 수정
│     └── 엔진 선택: GhostCut / 자체 서버
└── [3] 진행 표시 UI 업데이트

파일 변경:
├── src/services/subtitleRemovalService.ts  (신규)
└── src/components/tabs/SubtitleRemoverTab.tsx (수정)
```

### Phase 3: 유저 인증 + 크레딧 (2~3일)

```
목표: 카카오 로그인 + 크레딧 시스템

작업:
├── [1] 카카오 OAuth 연동 (로그인)
├── [2] SQLite 유저 DB (Oracle VPS)
│     ├── users: id, kakao_id, email, credits, created_at
│     └── usage_log: id, user_id, task_id, duration, cost, created_at
├── [3] 크레딧 잔액 확인 / 차감 API
├── [4] 토스페이먼츠 결제 연동
└── [5] 프론트엔드 로그인 + 충전 UI

파일 변경:
├── server/auth.js                (신규 — 카카오 OAuth)
├── server/credits.js             (신규 — 크레딧 관리)
├── server/payments.js            (신규 — 토스 결제 웹훅)
├── server/db.js                  (신규 — SQLite DB)
├── src/services/authService.ts   (신규)
├── src/services/creditService.ts (신규)
└── src/components/auth/          (신규 — 로그인/충전 UI)
```

### Phase 4: 최적화 + 안정화 (1~2일)

```
목표: 품질 개선 + 에러 처리

작업:
├── [1] 자막 감지 정확도 개선 (PaddleOCR 병행)
├── [2] 배치 프레임 처리 (RunPod 호출 횟수 최적화)
├── [3] 진행률 실시간 표시 (WebSocket 또는 SSE)
├── [4] 실패 재시도 로직
├── [5] 처리 결과 캐싱 (동일 영상 재요청 시)
└── [6] 모니터링 + 알림 설정
```

### 전체 일정

```
Week 1:
  Day 1-2: Phase 1 (파이프라인 구축)
  Day 3:   Phase 2 (프론트엔드 연동)
  Day 4-5: Phase 3 (인증 + 크레딧)

Week 2:
  Day 1-2: Phase 4 (최적화)
  Day 3:   QA + 베타 테스트
  Day 4:   프로덕션 배포
```

---

## 7. API 스펙

### 7-1. 자막 제거 요청

```
POST /api/subtitle/submit
Headers:
  Authorization: Bearer {user_token}
  Content-Type: multipart/form-data  (파일 업로드 시)
               application/json      (URL 전달 시)

Request (파일 업로드):
  FormData {
    video: File,
    quality: "1080p" | "720p" | "480p"  (기본: "720p")
  }

Request (URL 전달):
  {
    "url": "https://youtube.com/watch?v=xxx",
    "quality": "720p"
  }

Response:
  {
    "taskId": "sub-1710000000-a1b2",
    "status": "queued",
    "estimatedTime": 120,         // 예상 처리 시간 (초)
    "creditCost": 3.5,            // 차감될 크레딧 (분)
    "creditBalance": 46.5         // 남은 크레딧 (분)
  }
```

### 7-2. 처리 상태 확인

```
GET /api/subtitle/status/:taskId
Headers:
  Authorization: Bearer {user_token}

Response:
  {
    "taskId": "sub-1710000000-a1b2",
    "status": "processing",       // queued | extracting | detecting |
                                  // inpainting | assembling | done | failed
    "progress": 45,               // 0-100
    "phase": "AI가 배경을 복원하고 있어요",
    "estimatedRemaining": 60,     // 남은 예상 시간 (초)
    "videoUrl": null              // done일 때만 URL
  }
```

### 7-3. 결과 다운로드

```
GET /api/subtitle/download/:taskId
Headers:
  Authorization: Bearer {user_token}

Response:
  302 Redirect → 처리된 영상 URL

  또는 에러:
  {
    "error": "처리가 아직 완료되지 않았습니다",
    "status": "processing"
  }
```

### 7-4. 크레딧 잔액 확인

```
GET /api/credits/balance
Headers:
  Authorization: Bearer {user_token}

Response:
  {
    "credits": 46.5,              // 남은 크레딧 (분)
    "totalUsed": 153.5,           // 총 사용량 (분)
    "recentUsage": [
      { "date": "2026-03-12", "duration": 3.5, "title": "영상1.mp4" },
      { "date": "2026-03-11", "duration": 5.0, "title": "영상2.mp4" }
    ]
  }
```

### 7-5. 결제 (크레딧 충전)

```
POST /api/credits/purchase
Headers:
  Authorization: Bearer {user_token}
  Content-Type: application/json

Request:
  {
    "package": "basic",           // starter | basic | pro
    "paymentKey": "toss_xxx",     // 토스페이먼츠 결제 키
    "orderId": "order_xxx",
    "amount": 9000
  }

Response:
  {
    "success": true,
    "creditsAdded": 50,           // 추가된 크레딧 (분)
    "newBalance": 96.5,           // 새 잔액
    "receipt": "https://..."      // 영수증 URL
  }
```

---

## 8. 리스크 및 대응

### 8-1. 기술 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| RunPod 서비스 장애 | 낮음 | 높음 | GhostCut 폴백 유지 |
| ProPainter 품질 부족 | 중간 | 중간 | LaMa로 대체, 또는 두 모델 병행 |
| OCR 자막 감지 실패 | 중간 | 중간 | 사용자 수동 영역 지정 UI 제공 |
| Oracle VPS 용량 초과 | 낮음 | 높음 | 처리 완료 후 즉시 임시 파일 삭제 |
| YouTube CDN URL 만료 | 높음 | 낮음 | 영상을 VPS에 임시 다운로드 후 처리 |

### 8-2. 비즈니스 리스크

| 리스크 | 확률 | 대응 |
|--------|------|------|
| 사용자가 안 사서 적자 | 중간 | Phase 1~2만 먼저 구축 (크레딧 시스템은 나중에) |
| 헤비 유저가 비용 폭증 | 낮음 | 일일 사용 한도 설정 (예: 30분/일) |
| 토스 가맹점 심사 탈락 | 낮음 | Paddle 또는 수동 충전으로 대체 |
| RunPod 가격 인상 | 낮음 | Vast.ai, Modal 등 대안 다수 |

### 8-3. 폴백 전략

```
자막 제거 요청 시:
  ├── 1순위: 자체 서버 (Oracle + RunPod)
  ├── 2순위: GhostCut API (기존 방식)
  └── 3순위: 에러 메시지 + 재시도 안내
```

---

## 9. FAQ

### Q: Oracle Free Tier가 갑자기 유료로 바뀔 수 있나요?
A: Oracle은 Always Free 리소스를 명시적으로 보장합니다. 2019년 출시 이후 변경 없음. 단, "Upgrade to Paid" 버튼을 절대 누르지 마세요.

### Q: RunPod 대신 다른 GPU 서비스를 쓸 수 있나요?
A: 네. API 클라이언트만 교체하면 됩니다.
- **Modal**: 더 저렴하지만 한국에서 약간 느림
- **Vast.ai**: 가장 저렴하지만 안정성 낮음
- **Replicate**: 가장 쓰기 쉽지만 약간 비쌈

### Q: 사업자등록증 없이 결제를 받을 수 있나요?
A: 토스페이먼츠는 사업자 필요. 대안으로:
- 카카오페이 송금 (수동 충전)
- Paddle (해외 결제 대행, 사업자 불필요)
- Gumroad (크레딧 쿠폰 판매)

### Q: 동시에 몇 명이 사용할 수 있나요?
A: Oracle VPS의 전처리/후처리는 동시 3~5건 처리 가능. RunPod Serverless는 자동 스케일링되므로 GPU 병목은 없음.

### Q: GhostCut은 완전히 없애나요?
A: 아니요. 폴백으로 유지합니다. 자체 서버 장애 시 GhostCut으로 자동 전환됩니다.

### Q: 처리 품질이 vmake.ai와 같나요?
A: ProPainter는 vmake.ai와 동일 계열 기술(비디오 인페인팅)을 사용합니다. 품질은 거의 동등하며, 일부 케이스에서 더 나을 수도 있습니다.

---

## 부록: 파일 구조 (최종)

```
project-root/
├── server/
│   ├── index.js                  ← API 서버 메인 (yt-dlp + 자막 제거)
│   ├── subtitle-worker.js        ← 전처리/후처리 워커
│   ├── runpod-client.js          ← RunPod Serverless 클라이언트
│   ├── auth.js                   ← 카카오 OAuth
│   ├── credits.js                ← 크레딧 관리
│   ├── payments.js               ← 토스페이먼츠 웹훅
│   ├── db.js                     ← SQLite DB (유저, 크레딧, 사용 로그)
│   ├── install.sh                ← 원클릭 설치
│   ├── update-ytdlp.sh           ← yt-dlp 자동 업데이트
│   ├── package.json
│   ├── .env.example
│   └── Dockerfile.propainter     ← RunPod GPU 워커 이미지
│
├── src/
│   ├── services/
│   │   ├── ytdlpApiService.ts    ← yt-dlp API 클라이언트
│   │   ├── subtitleRemovalService.ts  ← 자막 제거 API 클라이언트
│   │   ├── authService.ts        ← 로그인/인증
│   │   ├── creditService.ts      ← 크레딧 관리
│   │   └── ghostcutService.ts    ← 기존 (폴백용 유지)
│   │
│   └── components/
│       ├── tabs/SubtitleRemoverTab.tsx  ← 엔진 선택 추가
│       └── auth/
│           ├── LoginModal.tsx     ← 카카오 로그인
│           └── CreditPanel.tsx    ← 크레딧 잔액/충전
│
└── docs/
    ├── vps-setup-guide.md         ← Oracle + Cloudflare 설치 가이드
    └── ghostcut-replacement-plan.md  ← 이 문서
```

---

> **다음 단계**: 이 문서를 검토한 뒤, Phase 1부터 순서대로 구현을 시작합니다.
> Phase 1~2는 크레딧 시스템 없이 "사용자 RunPod API 키 직접 입력" 방식으로 먼저 동작을 검증한 뒤,
> Phase 3에서 크레딧 시스템을 얹는 것을 권장합니다.

# Companion Video Tunnel — 설계 문서

> **Phase 1 설계 단계 산출물.** 코드 구현 전, 사용자 검토용. 본 문서는 코드를 0줄도 변경하지 않습니다.
>
> **검증 상태**: 가설 검증 완료 (2026-04-07 02:46 KST). 89MB/240초 MP4를 cloudflared quick tunnel → Evolink `gemini-3.1-pro-preview` → Google Gemini 경로로 전달하여 정상 분석 확인. VIDEO 모달리티 15,360 토큰 + AUDIO 6,000 토큰으로 영상 전체 처리 증명.
>
> **재개 트리거**: "터널 마스터 플랜 이어서 해" / "컴패니언 터널 진행"
> **관련 메모리**: `project_companion_tunnel_master_plan.md`

---

## 0. TL;DR

컴패니언 앱(`127.0.0.1:9876`)에 **임시 공개 HTTPS URL을 발급하는 터널 모듈**을 추가합니다. 사용자가 업로드하려는 로컬 파일을 Cloudinary로 보내는 대신, 컴패니언이 그 파일을 자체 HTTP 서버로 노출하고 cloudflared quick tunnel을 통해 인터넷에서 접근 가능한 ephemeral URL(`https://*.trycloudflare.com/...`)로 변환합니다. 이 URL을 Evolink/Gemini의 `fileData.fileUri`에 직접 넣으면 50MB/180초 한도 없이 무제한 영상 분석이 가능합니다.

**핵심 결정**:
- 신규 모듈: `companion/src-tauri/src/video_tunnel.rs`
- 신규 엔드포인트: `POST /api/tunnel/open`, `DELETE /api/tunnel/:token`, `GET /api/tunnel/serve/:token`
- cloudflared 바이너리는 **첫 실행 시 자동 다운로드** (bundle 미포함, 사용자 디스크 절약)
- 보안: 256-bit 랜덤 토큰 + 1회 fetch 제한(옵션) + 5분 TTL
- 프론트: `src/services/companion/tunnelClient.ts` 신설 + 기존 `uploadMediaToHosting`을 `smartUpload` 헬퍼로 점진 교체

---

## 1. 배경 & 동기

### 1.1 현재 문제 (#1066 환각 버그)

`src/services/gemini/videoAnalysis.ts:39` 흐름:
```
[사용자 MP4] → uploadMediaToHosting() → Cloudinary 업로드 (30~60초)
            → secure_url 반환
            → fileData.fileUri로 Evolink 전달
            → Evolink → Google Gemini → 분석 결과
```

**관찰된 증상**: 드라마 클립을 업로드하면 실제 영상과 무관한 환각 응답이 반환됨. 사용자(#1066) 보고 외에도 일관되게 재현됨.

**원인 분석 결론** (`memory/project_companion_tunnel_master_plan.md` 검증 단계 참조):
- Evolink 문서의 "MP4 50MB / <180초" 제한은 실제로는 inline base64 한정
- `fileData.fileUri`(URL 참조)는 50MB/180초 제한 없이 사실상 무제한
- 그러나 Cloudinary URL이 Gemini 백엔드에서 fetch될 때 어떤 이유로 실패하면 (timeout/404/robots), Gemini가 에러 없이 환각 응답 생성
- 현재 코드는 이 silent failure를 감지할 수단이 없음

### 1.2 해결 방향 후보 비교

| 방안 | 사용자 키 | 비용 | 길이 한도 | 구현 복잡도 | 점수 |
|------|----------|------|----------|------------|------|
| Files API 직접 (사용자 키) | ❌ 추가 필요 | 사용자 부담 | 2GB | 중 | ❌ UX 치명 |
| 서버 마스터 키 (CF Pages Function) | 불필요 | 프로젝트 부담 | 2GB | 중 | ⚠️ 비용 폭증 |
| ffmpeg.wasm 압축 | 불필요 | 0 | 정보 손실 | 저 | ⚠️ 품질 저하 |
| 컴패니언 chunking | 불필요 | 0 | 30분 | 고 | ⚠️ 경계 처리 복잡 |
| **컴패니언 터널 (본 설계)** | **불필요** | **0** | **무제한** | **중** | ✅ **최선** |

### 1.3 검증된 사실 (2026-04-07 02:46 KST)

테스트 환경:
- 파일: 89MB MP4 (smptebars + noise filter, 240초, h264 ultrafast)
- 로컬 서버: `python3 -m http.server 8765 --bind 127.0.0.1`
- 터널: `cloudflared tunnel --url http://127.0.0.1:8765` → `https://looked-usc-armstrong-kinda.trycloudflare.com` (ICN06 Cloudflare Edge)
- 호출: Evolink `v1beta/models/gemini-3.1-pro-preview:generateContent`

**응답**:
```json
{
  "candidates": [{ "content": { "parts": [{
    "text": "The video shows a static television test pattern with color bars"
  }] } }],
  "usageMetadata": {
    "promptTokenCount": 21388,
    "promptTokensDetails": [
      { "modality": "AUDIO", "tokenCount": 6000  },
      { "modality": "TEXT",  "tokenCount": 28    },
      { "modality": "VIDEO", "tokenCount": 15360 }
    ]
  }
}
```

**의미**:
- 응답 텍스트가 영상 실내용(SMPTE 컬러바)과 정확히 일치 → Gemini가 실제로 영상을 봄
- VIDEO 모달리티 15,360 토큰 = 240초 × ~64 토큰/프레임 → **240초 전체** 처리됨
- AUDIO 모달리티 6,000 토큰 → **240초 오디오 전체** 처리됨
- Evolink가 `fileUri`를 통과시켜 Google Gemini가 직접 fetch했고, 50MB/180초 한도가 적용되지 않음

이 결과로 본 설계의 핵심 가정 2가지가 모두 검증됨:
1. ✅ Evolink는 임의 HTTPS URL을 `fileData.fileUri`로 받아 통과시킨다
2. ✅ Cloudflare Quick Tunnel은 Gemini 백엔드에서 fetch 가능한 공개 URL을 제공한다

---

## 2. 아키텍처 개요

### 2.1 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                          사용자 PC 로컬                              │
│                                                                     │
│  ┌─────────────┐     ┌─────────────────────────────────────────┐    │
│  │  웹앱       │     │  컴패니언 (Tauri / Rust / axum)         │    │
│  │  (Cloudflare│     │                                         │    │
│  │   Pages)    │     │  ┌──────────────────────────────────┐   │    │
│  └──────┬──────┘     │  │  HTTP 서버 :9876                 │   │    │
│         │            │  │                                  │   │    │
│         │ ① 파일선택  │  │  POST /api/tunnel/open           │   │    │
│         │ + open 호출 │  │   ↓                              │   │    │
│         │            │  │  ┌─────────────────────────────┐ │   │    │
│         │ HTTP POST  │  │  │ video_tunnel.rs (신규)      │ │   │    │
│         ├───────────►│  │  │                             │ │   │    │
│         │            │  │  │ - 토큰 발급                  │ │   │    │
│         │            │  │  │ - 파일 등록 (메모리 맵)      │ │   │    │
│         │            │  │  │ - cloudflared 프로세스 풀    │ │   │    │
│         │            │  │  │   재사용/관리                │ │   │    │
│         │            │  │  └─────────────────────────────┘ │   │    │
│         │            │  │   ↓                              │   │    │
│         │            │  │  GET /api/tunnel/serve/:token    │   │    │
│         │            │  │  (ServeFile + Range 지원)        │   │    │
│         │            │  └──────────────────────────────────┘   │    │
│         │            │              ↑                          │    │
│         │            │              │ 파일 바이트 스트리밍       │    │
│         │            │  ┌───────────┴──────────────────────┐   │    │
│         │            │  │  cloudflared 서브프로세스         │   │    │
│         │            │  │  (앱 시작 시 1회 spawn,            │   │    │
│         │            │  │   계속 재사용)                    │   │    │
│         │            │  └───────────┬──────────────────────┘   │    │
│         │            │              │ QUIC 터널                 │    │
│         │            │              ▼                          │    │
│         │            │       Cloudflare Edge                   │    │
│         │            │       ICN06 (인천)                      │    │
│         │            │       https://*.trycloudflare.com       │    │
│         │            └─────────────────────────────────────────┘    │
│         │                                                            │
│         │ ② tunnelUrl + token 수신                                   │
│         │                                                            │
│         │ ③ Evolink에 fileData.fileUri로 전달                        │
│         ▼                                                            │
└─────────────────────────────────────────────────────────────────────┘

         │
         │ HTTPS POST
         ▼
   ┌──────────────────────────────┐
   │  api.evolink.ai/v1beta/...   │
   │  models/gemini-3.1-pro-      │
   │  preview:streamGenerateContent│
   └──────────┬───────────────────┘
              │
              │ Gemini API call (서버 사이드)
              ▼
   ┌──────────────────────────────┐
   │  Google Gemini Backend       │
   │                              │
   │  fileData.fileUri를 fetch    │
   │  → trycloudflare.com         │
   └──────────┬───────────────────┘
              │
              │ HTTP GET (Range 지원)
              ▼
   ┌──────────────────────────────┐
   │  Cloudflare Edge (ICN06)     │
   └──────────┬───────────────────┘
              │
              │ QUIC 터널 (역방향)
              ▼
   ┌──────────────────────────────┐
   │  사용자 PC                   │
   │  컴패니언 :9876              │
   │  /api/tunnel/serve/:token    │
   │  → 로컬 디스크 파일 스트리밍  │
   └──────────────────────────────┘
```

### 2.2 핵심 설계 원칙

1. **로컬 우선**: 파일은 사용자 디스크에서 한 발짝도 영구 이동하지 않는다. Gemini가 분석 시점에만 일시 fetch.
2. **Ephemeral**: 터널 URL은 5분 후 자동 만료. 분석 종료 시 즉시 정리.
3. **재사용 가능**: cloudflared 프로세스는 앱 시작 시 1회 spawn하여 계속 재사용. 파일별 spawn이 아님.
4. **Fallback 우선**: 컴패니언 미설치 / 터널 실패 시 즉시 Cloudinary 폴백.
5. **명시적 정리**: 클라이언트는 분석 종료 시 반드시 `DELETE /api/tunnel/:token` 호출. 호출 안 해도 5분 후 자동 정리.
6. **보안**: 256-bit 랜덤 토큰. 토큰 없이는 파일 접근 불가.

---

## 3. Rust 모듈 설계 (`video_tunnel.rs`)

### 3.1 파일 위치

```
companion/src-tauri/src/
├── main.rs
├── server.rs              # 기존 — 라우팅 추가
├── platform.rs
├── rembg.rs
├── tts.rs
├── whisper.rs
├── ytdlp.rs
└── video_tunnel.rs        # 🆕 신규
```

### 3.2 모듈 인터페이스 (Public API)

```rust
// video_tunnel.rs

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// 터널 매니저 — 앱 전체에서 단일 인스턴스
pub struct TunnelManager {
    /// cloudflared 서브프로세스 (spawn 후 계속 재사용)
    cloudflared: Arc<RwLock<CloudflaredProcess>>,
    /// 등록된 파일들 (token → entry)
    entries: Arc<RwLock<HashMap<String, TunnelEntry>>>,
    /// 백그라운드 cleanup 태스크 핸들
    _cleanup_task: tokio::task::JoinHandle<()>,
}

/// 각 터널 엔트리 (1 파일 = 1 토큰 = 1 엔트리)
#[derive(Clone, Debug)]
pub struct TunnelEntry {
    pub token: String,              // 256-bit hex
    pub file_path: PathBuf,         // 실제 디스크 경로
    pub mime_type: String,          // "video/mp4" 등
    pub created_at: Instant,
    pub expires_at: Instant,
    pub max_fetches: Option<u32>,   // None = 무제한, Some(1) = 1회 후 만료
    pub fetch_count: u32,
    pub size_bytes: u64,
}

impl TunnelManager {
    /// 앱 시작 시 1회 호출. cloudflared spawn + cleanup 태스크 기동.
    pub async fn new() -> Result<Self, TunnelError>;

    /// 파일을 등록하고 공개 URL 반환
    /// - file_path: 사용자 디스크 절대경로 (validation 필수)
    /// - mime_type: Content-Type 헤더에 사용
    /// - ttl_secs: 만료까지 시간 (기본 300초 = 5분)
    /// - max_fetches: 최대 fetch 횟수 (기본 None = 무제한)
    pub async fn open(
        &self,
        file_path: PathBuf,
        mime_type: String,
        ttl_secs: u64,
        max_fetches: Option<u32>,
    ) -> Result<TunnelHandle, TunnelError>;

    /// 토큰으로 파일 정보 조회 (서빙 핸들러용)
    pub async fn lookup(&self, token: &str) -> Option<TunnelEntry>;

    /// fetch 카운트 증가 (max_fetches 제한 적용)
    pub async fn record_fetch(&self, token: &str) -> Result<(), TunnelError>;

    /// 명시적 종료 (클라이언트가 분석 끝나면 호출)
    pub async fn close(&self, token: &str) -> Result<(), TunnelError>;

    /// 현재 활성 터널 수 (모니터링용)
    pub async fn active_count(&self) -> usize;
}

/// open() 응답
#[derive(Debug, Clone, Serialize)]
pub struct TunnelHandle {
    pub token: String,
    pub url: String,           // 완성된 https://*.trycloudflare.com/api/tunnel/serve/:token
    pub expires_at: i64,       // Unix timestamp
    pub size_bytes: u64,
}

/// cloudflared 프로세스 추적
struct CloudflaredProcess {
    child: tokio::process::Child,
    public_host: String,       // *.trycloudflare.com
    started_at: Instant,
    binary_path: PathBuf,
}

#[derive(Debug, thiserror::Error)]
pub enum TunnelError {
    #[error("cloudflared binary not found")]
    BinaryNotFound,
    #[error("cloudflared spawn failed: {0}")]
    SpawnFailed(String),
    #[error("public URL parse failed within {0:?}")]
    UrlParseTimeout(Duration),
    #[error("file not found: {0}")]
    FileNotFound(PathBuf),
    #[error("file size exceeds limit: {size} > {limit}")]
    FileSizeExceeded { size: u64, limit: u64 },
    #[error("tunnel not found or expired")]
    NotFound,
    #[error("max fetch count reached")]
    MaxFetchReached,
    #[error("path traversal detected: {0}")]
    PathTraversal(PathBuf),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
```

### 3.3 cloudflared 프로세스 라이프사이클

#### 3.3.1 Spawn 시점
- **앱 시작 시 1회**: `main.rs`에서 `TunnelManager::new()` 호출 시 즉시 spawn
- **재시작 조건**: 프로세스가 죽으면 자동 재spawn (최대 3회 백오프)
- **Lazy 옵션 (대안)**: 첫 `open()` 호출 시 spawn → 리소스 절약, 첫 호출 지연 4~6초

**선택**: **즉시 spawn** 권장 (사용자가 분석 시작할 때 대기 없게)

#### 3.3.2 명령줄
```bash
cloudflared tunnel \
  --url http://127.0.0.1:9876 \
  --no-autoupdate \
  --metrics 127.0.0.1:0 \
  --logfile /tmp/cloudflared-companion.log \
  --loglevel info
```

옵션 의미:
- `--no-autoupdate`: 컴패니언이 cloudflared 업데이트 관리 (사용자 머신 노이즈 최소화)
- `--metrics 127.0.0.1:0`: 메트릭 포트 임의 할당 (포트 충돌 방지)
- `--logfile`: 로그를 파일로 → stdout 파싱 후에도 디버깅 가능

#### 3.3.3 URL 추출
cloudflared stdout/stderr에서 정규식으로 추출:
```
https://[a-z0-9-]+\.trycloudflare\.com
```

stdout 모니터링:
```rust
let mut stdout = child.stdout.take().unwrap();
let mut buf = [0u8; 4096];
let timeout = Duration::from_secs(15);
let deadline = Instant::now() + timeout;

while Instant::now() < deadline {
    let n = tokio::time::timeout(
        Duration::from_secs(1),
        stdout.read(&mut buf)
    ).await??;
    
    let chunk = String::from_utf8_lossy(&buf[..n]);
    if let Some(url) = TUNNEL_URL_RE.find(&chunk) {
        return Ok(url.as_str().to_string());
    }
}
Err(TunnelError::UrlParseTimeout(timeout))
```

#### 3.3.4 Health Check
- **주기적**: 30초마다 `/health` 엔드포인트 호출 (cloudflared의 자체 health)
- **장애 감지**: 3회 연속 실패 → 프로세스 kill → 재spawn
- **종료 시**: 앱 종료 시 SIGTERM 전송 → 5초 후 SIGKILL

### 3.4 파일 등록/조회 자료구조

```rust
type Entries = HashMap<String /* token */, TunnelEntry>;
```

- 메모리 보관 (디스크 영구 저장 X — ephemeral 본질에 부합)
- `Arc<RwLock<Entries>>`로 동시 접근
- 최대 동시 등록 100개 제한 (DoS 방지)
- 100개 초과 시 가장 오래된 만료 후보 강제 정리

### 3.5 백그라운드 Cleanup 태스크

```rust
async fn cleanup_loop(entries: Arc<RwLock<Entries>>) {
    loop {
        tokio::time::sleep(Duration::from_secs(30)).await;
        let now = Instant::now();
        let mut guard = entries.write().await;
        guard.retain(|_, entry| {
            entry.expires_at > now &&
            entry.max_fetches.map_or(true, |m| entry.fetch_count < m)
        });
    }
}
```

- 30초마다 만료된 엔트리 제거
- 메모리 누수 방지
- 별도 스레드 아님 (tokio task)

---

## 4. HTTP 엔드포인트 명세

기존 `server.rs`의 라우팅 패턴(`/api/...`)을 따릅니다.

### 4.1 `POST /api/tunnel/open`

**용도**: 로컬 파일을 등록하고 공개 URL 발급

**Request**:
```http
POST /api/tunnel/open HTTP/1.1
Host: 127.0.0.1:9876
Content-Type: application/json

{
  "file_path": "/Users/me/Movies/sample.mp4",
  "mime_type": "video/mp4",
  "ttl_secs": 300,
  "max_fetches": null
}
```

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| `file_path` | string | O | — | 절대경로 (path traversal 검증됨) |
| `mime_type` | string | O | — | Content-Type 헤더에 사용 |
| `ttl_secs` | number | X | 300 | 만료까지 초. 최대 1800 (30분) |
| `max_fetches` | number\|null | X | null | 최대 fetch 횟수. null=무제한 |

**Response (200 OK)**:
```json
{
  "ok": true,
  "token": "a3f7e9c4b2d8...",
  "url": "https://looked-usc-armstrong-kinda.trycloudflare.com/api/tunnel/serve/a3f7e9c4b2d8...",
  "expires_at": 1775496300,
  "size_bytes": 93081562
}
```

**에러 응답**:
- `400 Bad Request`: `file_path` 형식 오류, mime_type 누락
- `404 Not Found`: 파일이 존재하지 않음
- `403 Forbidden`: path traversal 시도 (`../` 포함)
- `413 Payload Too Large`: 파일 크기 > 5GB (DoS 방어)
- `503 Service Unavailable`: cloudflared 프로세스 비정상 → 재시도 권장

```json
{
  "ok": false,
  "error": "file_not_found",
  "message": "File not found: /Users/me/Movies/sample.mp4",
  "details": { "file_path": "/Users/me/Movies/sample.mp4" }
}
```

### 4.2 `DELETE /api/tunnel/:token`

**용도**: 명시적 정리 (분석 종료 후)

**Request**:
```http
DELETE /api/tunnel/a3f7e9c4b2d8... HTTP/1.1
Host: 127.0.0.1:9876
```

**Response (200 OK)**:
```json
{ "ok": true }
```

**에러**: `404`(이미 정리됨)는 정상으로 간주 — idempotent

### 4.3 `GET /api/tunnel/serve/:token`

**용도**: 외부(Gemini)가 파일을 fetch — 토큰으로 인증

**Request**:
```http
GET /api/tunnel/serve/a3f7e9c4b2d8... HTTP/1.1
Host: looked-usc-armstrong-kinda.trycloudflare.com
Range: bytes=0-1023
```

**Response (200 OK 또는 206 Partial Content)**:
```http
HTTP/1.1 206 Partial Content
Content-Type: video/mp4
Content-Range: bytes 0-1023/93081562
Content-Length: 1024
Accept-Ranges: bytes

<binary>
```

**에러**:
- `404 Not Found`: 토큰 없음/만료
- `429 Too Many Requests`: max_fetches 초과
- `416 Range Not Satisfiable`: Range 헤더 잘못됨

**구현**: `tower_http::services::ServeFile`이 자동으로 Range 처리. 직접 axum 핸들러로 wrap하여 토큰 검증을 앞단에 추가.

### 4.4 `GET /api/tunnel/status`

**용도**: 현재 터널 상태 조회 (디버깅/모니터링)

**Response**:
```json
{
  "ok": true,
  "cloudflared_running": true,
  "public_host": "looked-usc-armstrong-kinda.trycloudflare.com",
  "uptime_secs": 1234,
  "active_tunnels": 3,
  "total_opened": 47,
  "total_fetches": 89
}
```

### 4.5 라우트 등록 (server.rs 변경)

`server.rs:633` 부근에 추가:

```rust
let app = Router::new()
    .route("/health", get(health_handler))
    .route("/quit", post(quit_handler))
    // ... 기존 라우트들 ...
    
    // 🆕 [v1.3.2] Video Tunnel — 로컬 파일을 ephemeral 공개 URL로 노출
    .route("/api/tunnel/open",        post(tunnel_open_handler))
    .route("/api/tunnel/{token}",     delete(tunnel_close_handler))
    .route("/api/tunnel/serve/{token}", get(tunnel_serve_handler))
    .route("/api/tunnel/status",      get(tunnel_status_handler))
    
    .layer(cors)
    .layer(middleware::from_fn(lna_header_middleware))
    .layer(axum::extract::DefaultBodyLimit::max(300 * 1024 * 1024));
```

`TunnelManager`는 axum의 `Extension` 또는 `State`로 주입.

---

## 5. cloudflared 바이너리 배포 전략

### 5.1 옵션 비교

| 옵션 | 사용자 다운로드 크기 | 첫 실행 지연 | 오프라인 동작 | 업데이트 |
|------|---------------------|--------------|--------------|----------|
| **A. Tauri bundle 동봉** | +37MB | 0초 | ✅ | 컴패니언 업데이트로 동반 |
| **B. 첫 실행 시 자동 다운로드** | +0MB | 5~30초 (1회) | ❌ | 자동 |
| **C. 사용자 수동 설치 안내** | 0 | 0초 | ✅ | 사용자 책임 |
| **D. brew/scoop 의존** | 0 | 0초 | ✅ | 패키지 매니저 |

### 5.2 추천: **옵션 B (자동 다운로드)**

**이유**:
- 컴패니언 v1.3.x는 이미 ~80MB. +37MB는 사용자 부담 큼
- 첫 실행 시 1회만 다운로드, 이후는 캐시
- 컴패니언 자체는 작게 유지, 옵션 기능은 lazy load
- 다운로드 실패 시 옵션 C(수동 안내)로 폴백

### 5.3 다운로드 위치 & 출처

**저장 경로** (OS별):
- macOS: `~/Library/Application Support/ytdlp-companion/bin/cloudflared`
- Windows: `%LOCALAPPDATA%\ytdlp-companion\bin\cloudflared.exe`
- Linux: `~/.local/share/ytdlp-companion/bin/cloudflared`

**다운로드 URL**: GitHub Releases 공식
```
https://github.com/cloudflare/cloudflared/releases/latest/download/
  cloudflared-darwin-amd64.tgz       (macOS Intel)
  cloudflared-darwin-arm64.tgz       (macOS Apple Silicon)
  cloudflared-windows-amd64.exe      (Windows x64)
  cloudflared-linux-amd64            (Linux x64)
  cloudflared-linux-arm64            (Linux ARM)
```

**검증**: SHA-256 체크섬을 컴패니언 내장 (릴리스마다 갱신)
**버전 고정**: 특정 버전(예: 2026.3.0) 핀 → 무작위 업데이트로 인한 호환성 깨짐 방지

### 5.4 다운로드 흐름

```rust
async fn ensure_cloudflared() -> Result<PathBuf, TunnelError> {
    let target = cloudflared_bin_path()?;
    if target.exists() && verify_checksum(&target).await.is_ok() {
        return Ok(target);
    }
    
    let url = pick_download_url()?;       // OS/arch 매칭
    let bytes = download_with_progress(&url).await?;
    verify_checksum_bytes(&bytes)?;
    extract_if_archive(bytes, &target).await?;
    set_executable(&target).await?;
    Ok(target)
}
```

**프로그레스**: 컴패니언 logger로 `[Tunnel] Downloading cloudflared (12% / 4.5MB / 37MB)` 출력

### 5.5 사용자 가시성

첫 다운로드 시 컴패니언 로그에 명시:
```
[Tunnel] cloudflared 바이너리가 없습니다. 다운로드 시작 ...
[Tunnel] 출처: github.com/cloudflare/cloudflared (공식)
[Tunnel] 크기: 약 37MB
[Tunnel] 위치: ~/Library/Application Support/ytdlp-companion/bin/
[Tunnel] 다운로드 완료 (5.2초)
[Tunnel] cloudflared 2026.3.0 ready
```

웹앱 UI에서도 health 엔드포인트에 `cloudflared_status` 필드 추가하여 표시.

---

## 6. 보안 모델

### 6.1 위협 모델

| 위협 | 가능성 | 영향 | 대응 |
|------|--------|------|------|
| 토큰 추측 | 매우 낮음 | 파일 1개 노출 | 256-bit 랜덤 |
| 토큰 유출 (로그 etc.) | 낮음 | 파일 1개 노출 | 짧은 TTL + 1회 fetch 옵션 |
| Path traversal (`../`) | 중 | 디스크 임의 파일 | 경로 정규화 + 화이트리스트 |
| DoS (대량 open) | 중 | 메모리 폭주 | 동시 100개 제한 |
| DoS (대량 fetch) | 중 | 대역폭 소모 | Rate limit per token |
| Replay attack | 낮음 | 무관 (영상은 멱등) | 짧은 TTL로 자연 완화 |
| MITM (터널 → CF) | 낮음 | 영상 유출 | HTTPS (cloudflared 자동) |
| 컴패니언 외부 노출 | 낮음 | 모든 파일 위험 | `127.0.0.1` 바인딩만 |

### 6.2 토큰 생성

```rust
use rand::RngCore;

fn generate_token() -> String {
    let mut bytes = [0u8; 32];   // 256-bit
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)            // 64 글자 hex
}
```

- `rand::OsRng` 또는 `getrandom` 기반 (CSPRNG)
- 256-bit 엔트로피 = 2^256 추측 공간 → 사실상 추측 불가능

### 6.3 Path Traversal 방어

```rust
fn validate_file_path(input: &Path) -> Result<PathBuf, TunnelError> {
    // 1. 절대경로 강제
    if !input.is_absolute() {
        return Err(TunnelError::PathTraversal(input.to_path_buf()));
    }
    
    // 2. 정규화 (../ 제거)
    let canonical = std::fs::canonicalize(input)?;
    
    // 3. 시스템 디렉터리 차단 (선택)
    let blocked_prefixes = [
        "/etc", "/System", "/Library/Keychains",
        "C:\\Windows\\System32",
    ];
    for blocked in blocked_prefixes {
        if canonical.starts_with(blocked) {
            return Err(TunnelError::PathTraversal(canonical));
        }
    }
    
    // 4. 존재 + 파일인지 확인
    if !canonical.is_file() {
        return Err(TunnelError::FileNotFound(canonical));
    }
    
    Ok(canonical)
}
```

### 6.4 1회 Fetch 옵션 (Strict Mode)

`max_fetches: 1`로 설정하면 첫 fetch 후 즉시 무효화. 단점:
- Gemini가 Range request로 부분 fetch하면 1회만 받음 → 영상 끝까지 못 봄
- **본 설계 추천: 기본 무제한, 특수 상황에만 1회 모드**

### 6.5 Rate Limit (per token)

```rust
struct FetchRateLimit {
    requests: VecDeque<Instant>,
    max_per_minute: u32,
}

impl FetchRateLimit {
    fn check(&mut self) -> bool {
        let now = Instant::now();
        let one_minute_ago = now - Duration::from_secs(60);
        self.requests.retain(|&t| t > one_minute_ago);
        if self.requests.len() as u32 >= self.max_per_minute {
            return false;
        }
        self.requests.push_back(now);
        true
    }
}
```

기본값: **분당 100 requests/token** (Gemini의 Range fetch 패턴 고려)

### 6.6 컴패니언 → 외부 노출 차단

기존 `server.rs:682`에서 이미 `127.0.0.1`만 바인딩 → ✅ 변경 없음
```rust
let addr_v4 = SocketAddr::from(([127, 0, 0, 1], 9876));
```

cloudflared만이 외부에 노출되며, 그 입구는 토큰 인증으로 막힘.

### 6.7 CORS 정책

기존 `server.rs:628`의 `allowed_origins`를 그대로 사용 (Cloudflare Pages 도메인만 허용).

`/api/tunnel/serve/:token`는 cloudflared가 직접 fetch하므로 CORS 무관 (브라우저가 호출 안 함).

---

## 7. 프론트 클라이언트 설계

### 7.1 신규 파일: `src/services/companion/tunnelClient.ts`

```typescript
import { isCompanionDetected } from '../ytdlpApiService';
import { logger } from '../LoggerService';

const COMPANION_URL = 'http://127.0.0.1:9876';

export interface TunnelHandle {
  token: string;
  url: string;
  expiresAt: number;
  sizeBytes: number;
}

export interface OpenTunnelOptions {
  ttlSecs?: number;          // 기본 300
  maxFetches?: number | null; // 기본 null (무제한)
  signal?: AbortSignal;
}

/**
 * 로컬 파일을 컴패니언 터널로 노출하여 공개 URL 반환.
 * 
 * 주의: file은 File 객체. 컴패니언이 임시 디스크에 저장한 뒤 그 경로를 등록.
 * 또는 사용자가 이미 디스크에 있는 파일을 선택한 경우 직접 경로 전달 가능 (Tauri OS dialog).
 */
export async function openTunnel(
  file: File,
  options: OpenTunnelOptions = {},
): Promise<TunnelHandle> {
  if (!isCompanionDetected()) {
    throw new Error('컴패니언이 실행 중이지 않습니다.');
  }

  // File을 컴패니언 임시 폴더에 저장 (multipart upload)
  const tempPath = await uploadToCompanionTemp(file, options.signal);

  // 터널 오픈
  const res = await fetch(`${COMPANION_URL}/api/tunnel/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_path: tempPath,
      mime_type: file.type || 'application/octet-stream',
      ttl_secs: options.ttlSecs ?? 300,
      max_fetches: options.maxFetches ?? null,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`터널 오픈 실패: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  logger.info('[Tunnel] 오픈', { token: data.token.slice(0, 8), url: data.url });
  return {
    token: data.token,
    url: data.url,
    expiresAt: data.expires_at,
    sizeBytes: data.size_bytes,
  };
}

/**
 * 명시적 터널 종료. 호출 안 해도 5분 후 자동 만료.
 */
export async function closeTunnel(token: string): Promise<void> {
  try {
    await fetch(`${COMPANION_URL}/api/tunnel/${token}`, { method: 'DELETE' });
    logger.info('[Tunnel] 종료', { token: token.slice(0, 8) });
  } catch (e) {
    // 종료 실패는 silent — 어차피 자동 만료됨
    logger.trackSwallowedError('Tunnel:close', e);
  }
}

/**
 * 실험: file → 임시 multipart 업로드 → 컴패니언 임시 경로 반환
 */
async function uploadToCompanionTemp(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${COMPANION_URL}/api/tunnel/upload-temp`, {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!res.ok) throw new Error('임시 업로드 실패');
  const { temp_path } = await res.json();
  return temp_path;
}
```

> **주의**: `uploadToCompanionTemp`는 별도 엔드포인트 필요. File 객체를 컴패니언 임시 폴더에 저장한 뒤 경로 반환. 이건 본 설계의 추가 작업으로, **파일 picker 통합**과 함께 결정해야 함 (다음 섹션 참조).

### 7.2 파일 경로 획득 옵션

브라우저는 File 객체에서 OS 절대경로를 알 수 없음 (보안). 두 가지 옵션:

#### 7.2.1 옵션 X: 컴패니언 임시 디스크 저장
- 프론트가 File을 multipart로 컴패니언에 업로드 → 컴패니언이 임시 폴더에 저장 → 경로 반환
- **장점**: 기존 웹 file input 그대로 사용
- **단점**: 디스크 I/O 추가 (메모리 → 디스크 복사) → 실질 속도 손실 미미 (수 초)
- **단점**: 임시 파일 정리 책임

#### 7.2.2 옵션 Y: Tauri OS 다이얼로그
- 컴패니언이 Tauri 네이티브 파일 다이얼로그 열기 → 사용자가 선택 → 절대경로 즉시 반환
- **장점**: 파일이 디스크에 머묾, 복사 없음, 가장 빠름
- **단점**: 웹 file input과 분리된 UX → 사용자가 두 번 선택해야 할 수도 있음

#### 7.2.3 추천: **하이브리드**
- 기본은 옵션 X (기존 UX 유지)
- 컴패니언에서 "직접 선택" 버튼 추가 → 옵션 Y 사용 가능 → 큰 파일에서 빠름
- Phase 1에서는 옵션 X만 구현, Phase 4에서 옵션 Y 추가

### 7.3 신규 파일: `src/services/companion/smartUpload.ts`

```typescript
import { uploadMediaToHosting } from '../uploadService';
import { openTunnel, closeTunnel, type TunnelHandle } from './tunnelClient';
import { isCompanionDetected } from '../ytdlpApiService';

export interface SmartUploadResult {
  url: string;
  cleanup: () => Promise<void>;
  source: 'tunnel' | 'cloudinary';
}

const TUNNEL_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB 이상 → 터널 우선

/**
 * 파일을 분석/전송 가능한 URL로 변환.
 * - 컴패니언 가용 + 파일 > 10MB → 터널 (무료, 빠름, 무손실)
 * - 그 외 → Cloudinary 폴백 (기존 동작)
 */
export async function smartUpload(
  file: File,
  options: {
    signal?: AbortSignal;
    forceCloudinary?: boolean;   // 영구 저장이 필요한 경우 (이미지 영구 보관)
  } = {},
): Promise<SmartUploadResult> {
  // 컴패니언 사용 가능 + 10MB+ + 강제 Cloudinary 아님
  if (
    !options.forceCloudinary &&
    isCompanionDetected() &&
    file.size > TUNNEL_THRESHOLD_BYTES
  ) {
    try {
      const handle = await openTunnel(file, { signal: options.signal });
      return {
        url: handle.url,
        cleanup: () => closeTunnel(handle.token),
        source: 'tunnel',
      };
    } catch (e) {
      // 터널 실패 → 자동 폴백
      logger.warn('[SmartUpload] 터널 실패, Cloudinary 폴백', e);
    }
  }

  // 폴백: Cloudinary
  const url = await uploadMediaToHosting(file, undefined, options.signal);
  return {
    url,
    cleanup: async () => {}, // Cloudinary는 별도 정리 없음
    source: 'cloudinary',
  };
}
```

### 7.4 호출 패턴 (videoAnalysis.ts 적용 예)

**Before** (`src/services/gemini/videoAnalysis.ts:39`):
```typescript
fileUri = await uploadMediaToHosting(source.videoFile);
```

**After**:
```typescript
const upload = await smartUpload(source.videoFile, { signal: abortCtrl.signal });
fileUri = upload.url;
try {
  // ... Gemini 호출 로직 ...
  return scenes;
} finally {
  await upload.cleanup();   // 분석 끝나면 터널 정리
}
```

이 패턴이 59곳 모두에 적용 가능. 핵심은 **try/finally로 cleanup 보장**.

---

## 8. 통합 패턴 (smartUpload 헬퍼)

### 8.1 마이그레이션 우선순위

| Phase | 적용 범위 | 호출처 수 | 효과 |
|-------|----------|----------|------|
| 2 | `videoAnalysis.ts` (#1066) | 1곳 | 즉시 본 타깃 해결 |
| 3a | `VideoGenService.ts` (영상 생성) | 10곳 | 영상 생성 속도/품질 향상 |
| 3b | `VideoAnalysisRoom.tsx:4387` (다중 영상) | 1곳 | 자료 영상 무제한 |
| 3c | `VideoRemakePanel.tsx:112` | 1곳 | 영상 리메이크 |
| 3d | `transcriptionService.ts:134` (Whisper) | 1곳 | 대용량 오디오 |
| 3e | `MusicStudio.tsx:285` (음악 레퍼런스) | 1곳 | 풀버전 음악 |
| 3f | `StoryboardPanel.tsx`, `CharacterTwistLab.tsx` 등 | 5+곳 | 캐릭터 무손실 |
| 3g | `DetailPageTab.tsx`, 쇼핑 (영구 저장 필요한 곳) | 6곳 | `forceCloudinary: true` 유지 |

### 8.2 영구 저장 vs 일시 분석 구분

`smartUpload`의 `forceCloudinary` 옵션으로 구분:

- **일시 분석** (터널 OK): 영상 분석, Whisper, image-to-video 시작 프레임
- **영구 저장 필요** (Cloudinary 유지): 프로젝트 썸네일, 캐릭터 라이브러리 영구 보관, 사용자 갤러리

판정 기준:
> "이 URL이 분석/생성 호출 1회만으로 끝나면 터널, 다른 시점에 다시 fetch 가능해야 하면 Cloudinary"

### 8.3 점진 마이그레이션

각 Phase 3 항목은 독립 PR로 분리:
- Phase 3a (`VideoGenService.ts`) — 1 PR
- Phase 3b (`VideoAnalysisRoom.tsx`) — 1 PR
- ...

이렇게 하면 한 PR 롤백해도 다른 곳 영향 없음.

---

## 9. 에러 처리 매트릭스

| 에러 | 조건 | HTTP 코드 | 프론트 동작 |
|------|------|-----------|------------|
| 컴패니언 미실행 | `isCompanionDetected() = false` | — (네트워크 에러) | Cloudinary 폴백 |
| cloudflared 미다운로드 | 첫 실행 시 다운로드 실패 | 503 | "터널 사용 불가" 안내 + Cloudinary 폴백 |
| cloudflared 프로세스 죽음 | health check 실패 | 503 | 재spawn 시도 → 실패 시 폴백 |
| 파일 없음 | `file_not_found` | 404 | 사용자에게 "파일 사라짐" 알림 |
| Path traversal | 입력 검증 실패 | 403 | "잘못된 경로" 에러 (보통 사용자 실수 X) |
| 파일 크기 초과 (>5GB) | DoS 방어 한도 | 413 | "파일이 너무 큽니다" + Cloudinary 시도 (Cloudinary도 100MB 한도라 실패할 수 있음) |
| 동시 터널 100개 초과 | 메모리 한도 | 503 + Retry-After | 60초 후 재시도 권장 |
| 토큰 만료 (5분 후) | TTL 초과 | 404 | 터널 재발급 시도 (자동) |
| Rate limit | 분당 100 fetch 초과 | 429 | "분석 너무 빠름" + 60초 대기 |
| 네트워크 (Cloudflare Edge 장애) | TCP/QUIC 연결 실패 | 502 → 재시도 → 폴백 | "Cloudflare 일시 장애" + Cloudinary 폴백 |
| Evolink 거부 (URL fetch 실패) | Gemini 응답에 에러 | 200이지만 `error` 필드 | 결과 검증 → 환각 의심 시 Cloudinary 재시도 |

---

## 10. 설정 & 한도

| 항목 | 기본값 | 최대 | 비고 |
|------|--------|------|------|
| TTL (터널 유효 시간) | 300초 | 1800초 | Gemini 분석 평균 60~120초 |
| 동시 활성 터널 수 | 100 | 100 | DoS 방어 |
| 파일당 최대 크기 | 5GB | 5GB | DoS 방어 (Gemini 자체는 2GB 한도) |
| Per-token rate limit | 100 req/min | 200 req/min | Gemini Range 패턴 고려 |
| cloudflared 재시작 백오프 | 1s, 5s, 30s | 3회 후 폴백 | |
| 임시 파일 자동 정리 | 30분 | — | 컴패니언 종료 시도 정리 |

`tauri.conf.json` 또는 환경변수로 오버라이드 가능 (개발/디버그용).

---

## 11. 테스트 전략

### 11.1 Rust 단위 테스트 (`#[cfg(test)]`)

```rust
#[tokio::test]
async fn test_token_uniqueness() {
    let tokens: HashSet<_> = (0..1000).map(|_| generate_token()).collect();
    assert_eq!(tokens.len(), 1000);
}

#[tokio::test]
async fn test_path_traversal_blocked() {
    let mgr = TunnelManager::new().await.unwrap();
    let result = mgr.open(
        PathBuf::from("../../../etc/passwd"),
        "text/plain".into(),
        300,
        None,
    ).await;
    assert!(matches!(result, Err(TunnelError::PathTraversal(_))));
}

#[tokio::test]
async fn test_ttl_expiry() {
    let mgr = TunnelManager::new().await.unwrap();
    let handle = mgr.open(test_file(), "video/mp4".into(), 1, None).await.unwrap();
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert!(mgr.lookup(&handle.token).await.is_none());
}

#[tokio::test]
async fn test_max_fetches_enforced() {
    let mgr = TunnelManager::new().await.unwrap();
    let handle = mgr.open(test_file(), "video/mp4".into(), 300, Some(2)).await.unwrap();
    assert!(mgr.record_fetch(&handle.token).await.is_ok());
    assert!(mgr.record_fetch(&handle.token).await.is_ok());
    assert!(mgr.record_fetch(&handle.token).await.is_err());
}
```

### 11.2 Rust 통합 테스트

```rust
#[tokio::test]
#[ignore] // 네트워크 + cloudflared 필요
async fn test_full_tunnel_flow() {
    let mgr = TunnelManager::new().await.unwrap();
    let handle = mgr.open(test_video_path(), "video/mp4".into(), 300, None).await.unwrap();
    
    // 외부에서 fetch 가능한지 확인
    let response = reqwest::get(&handle.url).await.unwrap();
    assert_eq!(response.status(), 200);
    let bytes = response.bytes().await.unwrap();
    assert_eq!(bytes.len() as u64, handle.size_bytes);
    
    mgr.close(&handle.token).await.unwrap();
    
    // 종료 후 fetch 실패 확인
    let response = reqwest::get(&handle.url).await.unwrap();
    assert_eq!(response.status(), 404);
}
```

### 11.3 E2E 테스트 (메모리 `feedback_e2e_real_test.md` 규칙 준수)

**테스트 시나리오** (Phase 2 적용 후):
1. 사전 조건: 컴패니언 v1.3.2 실행 중
2. Playwright로 자동 로그인 + API 키 주입
3. VideoAnalysisRoom 진입 → tikitaka 프리셋 선택
4. 60MB / 4분짜리 테스트 영상 업로드 (`test-e2e/test-video-large.mp4`)
5. "분석" 버튼 클릭
6. **검증**:
   - `waitForResponse(/v1beta\/models\/.*generateContent/)` (60초 timeout)
   - 응답 JSON에 `usageMetadata.promptTokensDetails`에 `VIDEO` modality 토큰 존재
   - 응답 텍스트가 "color bars" 포함 (테스트 영상 특성)
   - 결과 DOM에 시간순 장면 카드 2개+ 생성 확인
7. before/after 스크린샷 (`test-e2e/tunnel-01-before.png`, `tunnel-02-after.png`)
8. 스크린샷을 사용자에게 Read로 보여주기

**산출물**:
- `test-e2e/tunnel-fileuri.test.ts` 신규
- `test-e2e/tunnel-01-loggedin.png`, `tunnel-02-uploaded.png`, `tunnel-03-analyzed.png`, `tunnel-99-final.png`

### 11.4 컴패니언 빌드 + 실행 검증 (메모리 `feedback_companion_must_build_test.md` 규칙)

```bash
cd companion/src-tauri
cargo build --release        # 컴파일 에러 0
cargo run                    # 컴패니언 기동
sleep 3
curl http://localhost:9876/health        # 정상 응답
curl -X POST http://localhost:9876/api/tunnel/open \
  -H 'Content-Type: application/json' \
  -d '{"file_path":"/tmp/test.mp4","mime_type":"video/mp4","ttl_secs":300}'
# → { "ok": true, "token": "...", "url": "https://...trycloudflare.com/..." }

curl -I "https://...trycloudflare.com/api/tunnel/serve/..."   # 200 OK
```

이 단계가 통과해야만 Phase 2 진입.

### 11.5 Computer Use GUI 검증 (메모리 CLAUDE.md STEP 3.6)

1. `mcp__computer-use__open_application({ app: "ytdlp-companion" })`
2. `mcp__computer-use__screenshot()` — 컴패니언 트레이 아이콘 확인
3. Chrome으로 영상 분석 페이지 열기 → 업로드 → 분석 → 결과 화면 스크린샷
4. 스크린샷을 사용자에게 직접 보여주기

---

## 12. 롤아웃 계획

### 12.1 Phase별 PR 분할

| PR | 내용 | 의존 |
|----|------|------|
| **PR-T1** | `video_tunnel.rs` 신규 + `server.rs` 라우트 + cloudflared 다운로더 | - |
| **PR-T2** | 컴패니언 v1.3.2 릴리스 (PR-T1 포함) | PR-T1 |
| **PR-T3** | 프론트 `tunnelClient.ts` + `smartUpload.ts` 신규 | PR-T2 (배포 후) |
| **PR-T4** | `videoAnalysis.ts` (#1066) 적용 + E2E 테스트 | PR-T3 |
| **PR-T5** | `VideoGenService.ts` 10곳 일괄 | PR-T3 |
| **PR-T6** | `VideoAnalysisRoom.tsx` 다중 영상 | PR-T3 |
| **PR-T7** | 나머지 (음악, 캐릭터, 상품 등) | PR-T3 |
| **PR-T8+** | 신기능 (로컬 라이브러리, NLE 통합 등) | 별도 프로젝트 |

### 12.2 단계별 릴리스

1. **컴패니언 v1.3.2 alpha**: 사용자 일부에게만 → 1주 모니터링
2. **컴패니언 v1.3.2 stable**: 전체 배포
3. **웹앱 PR-T4 머지**: #1066 close
4. **사용자 피드백 수집**: 1주
5. **PR-T5~T7 머지**: 나머지 일괄 마이그레이션
6. **Phase 4 신기능**: 사용자 반응 기반 우선순위

### 12.3 백워드 호환성

- 기존 Cloudinary 경로는 폴백으로 유지 → 컴패니언 미설치 사용자도 동일 동작
- `smartUpload`는 자동 분기 → 호출처 변경 최소

### 12.4 모니터링

- 컴패니언 logger에 `[Tunnel]` 태그 추가
- 웹앱 LoggerService에 `tunnel_open`, `tunnel_close`, `tunnel_failed`, `tunnel_fallback` 이벤트
- Sentry 또는 자체 텔레메트리로 다음 메트릭 수집:
  - `tunnel_success_rate` (open 성공률)
  - `tunnel_avg_duration` (open ~ close 평균 시간)
  - `tunnel_fallback_rate` (Cloudinary 폴백 빈도)
  - `cloudflared_restart_count` (재시작 빈도)

---

## 13. 알려진 위험 & 대응

### 13.1 Cloudflare Quick Tunnel SLA 없음

**위험**: Cloudflare가 quick tunnel을 갑자기 차단하거나 throttle할 수 있음

**근거**: 
- cloudflared 첫 실행 시 다음 메시지: 
  > "However, be aware that these account-less Tunnels have no uptime guarantee, are subject to the Cloudflare Online Services Terms of Use, and Cloudflare reserves the right to investigate your use of Tunnels for violations of such terms."

**대응**:
1. **단기**: bore, ngrok, localtunnel을 폴백 풀로 추가
2. **중기**: Named Tunnel 옵션 (사용자가 무료 Cloudflare 계정 등록 시) → SLA 보장
3. **장기**: 자체 터널 인프라 (Cloudflare Workers + Durable Objects 또는 자체 VPS bore-server)

### 13.2 사용자 인터넷 업로드 속도 병목

**위험**: 가정 인터넷 업로드 속도(보통 10~50 Mbps)가 분석 시간을 늘림

**대응**:
1. UI에 "예상 시간: 약 X초 (업로드 속도 Y Mbps)" 표시
2. WebRTC ICE를 통한 NAT traversal로 직접 P2P 가능성 탐색 (장기)
3. 큰 파일은 chunking 안내

### 13.3 cloudflared 일일 한도 미공개

**위험**: Cloudflare가 quick tunnel당 일일 트래픽/요청 한도를 부과할 수 있음 (공식 미공개)

**대응**:
1. 모니터링: 사용량 추적, 한도 도달 시 알림
2. 다중 cloudflared 프로세스 (사용자당 1개라도 다른 사용자와 격리됨 → 한도 분산)
3. 필요 시 named tunnel 자동 전환

### 13.4 방화벽/회사망에서 cloudflared 차단

**위험**: 일부 기업 방화벽이 트라이클라우드플레어 도메인 차단

**대응**:
1. 자동 감지 → bore.pub 폴백
2. 사용자 안내 ("회사 네트워크에서 차단된 것 같습니다. ...")

### 13.5 Range Request 미지원 시 Gemini 동작

**검증 결과**: Python `http.server`로 테스트했을 때 Range 미지원이었지만 Gemini 분석 정상 동작했음. 즉, **Gemini는 Range 없어도 전체 fetch로 대응 가능**.

**대응**: tower-http의 ServeFile은 자동 Range 지원하므로 본 구현은 문제 없음.

### 13.6 컴패니언 자체 보안

**위험**: cloudflared가 컴패니언의 모든 엔드포인트를 외부에 노출 (`/api/tunnel/serve/*` 외에도)

**대응**: 
1. cloudflared는 `127.0.0.1:9876`을 노출하므로 모든 라우트가 잠재적으로 외부 접근 가능
2. **기존 라우트들 (예: `/api/extract`, `/api/transcribe`)은 외부 접근 차단 필요**
3. **방안 A**: cloudflared가 노출하는 별도 포트(`127.0.0.1:9879`) 띄우고, 거기엔 `/api/tunnel/serve/*`만 라우팅
4. **방안 B**: 미들웨어로 외부 요청 (Cloudflare 헤더 감지) 시 화이트리스트 라우트만 허용

**추천**: 방안 A — 별도 포트 분리가 가장 명확

```rust
// server.rs에 추가
let tunnel_app = Router::new()
    .route("/api/tunnel/serve/{token}", get(tunnel_serve_handler))
    .layer(axum::extract::DefaultBodyLimit::max(5 * 1024 * 1024 * 1024)); // 5GB

let addr_tunnel = SocketAddr::from(([127, 0, 0, 1], 9879));
let tunnel_listener = tokio::net::TcpListener::bind(addr_tunnel).await?;
tokio::spawn(async move {
    axum::serve(tunnel_listener, tunnel_app).await.unwrap();
});

// cloudflared는 9879만 노출
cloudflared tunnel --url http://127.0.0.1:9879
```

이렇게 하면:
- `127.0.0.1:9876` (메인 컴패니언 API) — 로컬만, 외부 노출 X
- `127.0.0.1:9879` (터널 서빙 전용) — cloudflared가 노출, `/api/tunnel/serve/*`만 라우팅
- 외부에서 `/api/tunnel/open`, `/api/transcribe` 같은 민감한 엔드포인트 접근 불가

**이건 본 설계의 핵심 보안 결정**.

---

## 14. 사용자에게 결정 받을 사항 (Open Questions)

다음 항목들은 본 설계에서 결정을 미뤘습니다. 사용자 의견 필요:

### Q1. cloudflared 바이너리 배포 방식
- 옵션 A: Tauri bundle 동봉 (+37MB)
- 옵션 B: 첫 실행 시 자동 다운로드 (✅ 추천)
- 옵션 C: 사용자 수동 설치 안내 (brew/scoop)

### Q2. 파일 경로 획득 방식
- 옵션 X: 컴패니언 임시 디스크 저장 (✅ Phase 1 추천)
- 옵션 Y: Tauri OS 다이얼로그 직접 (Phase 4)
- 하이브리드: 둘 다 지원 (장기)

### Q3. 보안 분리 방식 (위험 13.6)
- 방안 A: 별도 포트(9879)에 터널 서빙 전용 라우터 (✅ 추천)
- 방안 B: 미들웨어 화이트리스트
- 방안 C: 무시 (위험 감수)

### Q4. 1회 fetch 모드 기본값
- 옵션 A: 기본 무제한 (✅ 추천 — Range request 호환)
- 옵션 B: 기본 1회

### Q5. 동시 터널 수 한도
- 옵션 A: 100개 (✅ 추천)
- 옵션 B: 10개 (보수적)
- 옵션 C: 무제한 (위험)

### Q6. cloudflared spawn 시점
- 옵션 A: 앱 시작 시 즉시 (✅ 추천)
- 옵션 B: 첫 `open()` 호출 시 (lazy)

### Q7. Phase 3 마이그레이션 순서
- 추천: 3a(VideoGen) → 3b(VideoAnalysis 다중) → 3d(Whisper) → 나머지

### Q8. cloudflared 버전 고정 vs 자동 업데이트
- 옵션 A: 특정 버전 고정 (예: 2026.3.0) → 호환성 안전 (✅ 추천)
- 옵션 B: 항상 latest → 새 기능 자동 활용

---

## 15. 작업 예상 시간 (Phase 1만)

| 작업 | 예상 시간 |
|------|----------|
| `video_tunnel.rs` 작성 + 단위 테스트 | 1.5일 |
| `server.rs` 라우트 + 별도 포트 분리 | 0.5일 |
| cloudflared 자동 다운로더 | 1일 |
| 임시 파일 업로드 엔드포인트 | 0.5일 |
| 통합 테스트 + cargo build 검증 | 0.5일 |
| Codex MCP 리뷰 10회 | 1일 |
| 컴패니언 v1.3.2 릴리스 빌드 | 0.5일 |
| **합계** | **약 5.5일** |

> Phase 2 (#1066 본 적용) 추가 시 ~3일

---

## 16. 부록: 의존성 추가 (Cargo.toml)

```toml
[dependencies]
# 기존 deps...
tower-http = { version = "0.6", features = ["cors", "fs"] }   # ⬅ "fs" 추가 (ServeFile)
hex = "0.4"                                                    # ⬅ 토큰 hex 인코딩
rand = "0.8"                                                   # ⬅ CSPRNG
sha2 = "0.10"                                                  # ⬅ cloudflared 체크섬 검증
tar = "0.4"                                                    # ⬅ tgz 압축 해제 (macOS)
flate2 = "1"                                                   # ⬅ gz 해제 (이미 존재)
thiserror = "1"                                                # ⬅ 에러 enum 매크로
```

추가 크기: ~200KB binary 증가 (대부분 정적 링크).

---

## 17. 부록: video_tunnel.rs 스켈레톤 (참고용 — 실제 구현은 PR-T1)

```rust
// companion/src-tauri/src/video_tunnel.rs

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rand::RngCore;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};
use tokio::sync::RwLock;

use crate::platform;

const TUNNEL_DEFAULT_TTL_SECS: u64 = 300;
const TUNNEL_MAX_TTL_SECS: u64 = 1800;
const TUNNEL_MAX_FILE_SIZE: u64 = 5 * 1024 * 1024 * 1024;
const TUNNEL_MAX_ACTIVE: usize = 100;
const TUNNEL_SERVE_PORT: u16 = 9879;

const CLOUDFLARED_VERSION: &str = "2026.3.0";

pub struct TunnelManager {
    inner: Arc<TunnelManagerInner>,
}

struct TunnelManagerInner {
    cloudflared: RwLock<CloudflaredProcess>,
    entries: RwLock<HashMap<String, TunnelEntry>>,
    public_host: RwLock<Option<String>>,
}

// ... 약 600줄의 구현 코드 ...

impl TunnelManager {
    pub async fn new() -> Result<Self, TunnelError> {
        let bin = ensure_cloudflared().await?;
        let mut child = spawn_cloudflared(&bin).await?;
        let public_host = wait_for_public_url(&mut child).await?;
        
        let inner = Arc::new(TunnelManagerInner {
            cloudflared: RwLock::new(CloudflaredProcess { child, binary_path: bin, public_host: public_host.clone() }),
            entries: RwLock::new(HashMap::new()),
            public_host: RwLock::new(Some(public_host)),
        });
        
        let cleanup_inner = inner.clone();
        tokio::spawn(async move {
            cleanup_loop(cleanup_inner).await;
        });
        
        Ok(Self { inner })
    }
    
    pub async fn open(
        &self,
        file_path: PathBuf,
        mime_type: String,
        ttl_secs: u64,
        max_fetches: Option<u32>,
    ) -> Result<TunnelHandle, TunnelError> {
        let canonical = validate_file_path(&file_path)?;
        let metadata = tokio::fs::metadata(&canonical).await?;
        if metadata.len() > TUNNEL_MAX_FILE_SIZE {
            return Err(TunnelError::FileSizeExceeded {
                size: metadata.len(),
                limit: TUNNEL_MAX_FILE_SIZE,
            });
        }
        
        let ttl = ttl_secs.min(TUNNEL_MAX_TTL_SECS);
        let token = generate_token();
        let now = Instant::now();
        
        let entry = TunnelEntry {
            token: token.clone(),
            file_path: canonical,
            mime_type,
            created_at: now,
            expires_at: now + Duration::from_secs(ttl),
            max_fetches,
            fetch_count: 0,
            size_bytes: metadata.len(),
        };
        
        let mut entries = self.inner.entries.write().await;
        if entries.len() >= TUNNEL_MAX_ACTIVE {
            return Err(TunnelError::TooManyActive);
        }
        entries.insert(token.clone(), entry.clone());
        drop(entries);
        
        let host = self.inner.public_host.read().await.clone()
            .ok_or(TunnelError::CloudflaredNotReady)?;
        let url = format!("https://{}/api/tunnel/serve/{}", host, token);
        
        Ok(TunnelHandle {
            token,
            url,
            expires_at: (now + Duration::from_secs(ttl)).elapsed().as_secs() as i64,
            size_bytes: metadata.len(),
        })
    }
    
    // ... lookup, record_fetch, close, active_count ...
}

// 헬퍼 함수들
async fn ensure_cloudflared() -> Result<PathBuf, TunnelError> { /* ... */ }
async fn spawn_cloudflared(bin: &Path) -> Result<Child, TunnelError> { /* ... */ }
async fn wait_for_public_url(child: &mut Child) -> Result<String, TunnelError> { /* ... */ }
fn generate_token() -> String { /* ... */ }
fn validate_file_path(input: &Path) -> Result<PathBuf, TunnelError> { /* ... */ }
async fn cleanup_loop(inner: Arc<TunnelManagerInner>) { /* ... */ }
```

---

## 18. 검토 체크리스트

사용자 검토 시 확인할 항목:

- [ ] 전체 아키텍처가 사용자 의도와 일치하는가?
- [ ] **Q1~Q8 결정** (섹션 14)
- [ ] cloudflared 의존성 추가에 동의하는가?
- [ ] 별도 포트(9879) 분리 방식에 동의하는가? (보안 13.6)
- [ ] Phase 3 마이그레이션 순서가 적절한가?
- [ ] 위험 13.1~13.6의 대응이 충분한가?
- [ ] 작업 시간 5.5일 (Phase 1) + 3일 (Phase 2)에 동의하는가?
- [ ] 추가 검증이 필요한 가설이 있는가?

---

## 19. 다음 단계

본 문서 검토 완료 후:

1. ✅ Q1~Q8 결정사항 확정
2. → C: worktree 5개 진단 + 정리
3. → 메인 워킹 트리의 v1.3.1 미커밋 잔재 처리
4. → D: PR-T1 (`video_tunnel.rs` 구현) 시작
5. → cargo build + curl 검증
6. → 컴패니언 v1.3.2 alpha 릴리스
7. → E: PR-T4 (#1066 본 적용)
8. → Playwright + Computer Use E2E
9. → 커밋/푸시/배포/이슈 close

---

**문서 끝.**

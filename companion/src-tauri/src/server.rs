use axum::{
    Router,
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    body::Body,
    middleware,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;
use std::sync::OnceLock;
use tokio::sync::RwLock;
use tokio_util::io::ReaderStream;

use crate::{platform, ytdlp, rembg, whisper, tts};

// ──────────────────────────────────────────────
// [FIX] Google 프록시 싱글톤 Client + 페이싱 상태
// ──────────────────────────────────────────────
use std::sync::Arc;

struct GoogleProxyState {
    last_request_at: std::time::Instant,
    consecutive_429s: u32,
    cooldown_until: std::time::Instant,
}

static GOOGLE_PROXY_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static GOOGLE_PROXY_STATE: OnceLock<tokio::sync::Mutex<GoogleProxyState>> = OnceLock::new();

fn google_proxy_client() -> &'static reqwest::Client {
    GOOGLE_PROXY_CLIENT.get_or_init(|| {
        let jar = Arc::new(reqwest::cookie::Jar::default());
        let google_url = "https://www.google.com".parse::<url::Url>().unwrap();

        // SOCS 동의 쿠키 (2024+ 필수 — 없으면 봇 취급)
        jar.add_cookie_str(
            "SOCS=CAESHAgBEhJnd3NfMjAyNDA1MDEtMF9SQzIaAmVuIAEaBgiA_uC2Bg; domain=.google.com; path=/; secure; SameSite=Lax",
            &google_url,
        );
        // 레거시 CONSENT 쿠키 폴백
        jar.add_cookie_str(
            "CONSENT=YES+cb.20240101-00-p0.en+FX+987; domain=.google.com; path=/",
            &google_url,
        );

        reqwest::Client::builder()
            .cookie_provider(jar)
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .pool_idle_timeout(std::time::Duration::from_secs(300))
            .gzip(true)
            .brotli(true)
            .build()
            .unwrap_or_default()
    })
}

fn google_proxy_state() -> &'static tokio::sync::Mutex<GoogleProxyState> {
    GOOGLE_PROXY_STATE.get_or_init(|| {
        tokio::sync::Mutex::new(GoogleProxyState {
            last_request_at: std::time::Instant::now() - std::time::Duration::from_secs(60),
            consecutive_429s: 0,
            cooldown_until: std::time::Instant::now() - std::time::Duration::from_secs(1),
        })
    })
}

// ──────────────────────────────────────────────
// [FIX #914] 서비스 캐시 — health check 즉시 응답용
// 기존: health 요청마다 Python subprocess 5개 순차 실행 (10~15초)
// 수정: 서버 시작 시 1회 감지 → 캐시, 5분마다 백그라운드 갱신
// ──────────────────────────────────────────────

struct CachedHealth {
    services: Vec<String>,
    ytdlp_version: String,
}

static CACHED_HEALTH: OnceLock<RwLock<CachedHealth>> = OnceLock::new();

fn cached_health() -> &'static RwLock<CachedHealth> {
    CACHED_HEALTH.get_or_init(|| RwLock::new(CachedHealth {
        services: vec!["ytdlp".to_string(), "download".to_string(), "frames".to_string(), "nle-install".to_string()],
        ytdlp_version: "loading...".to_string(),
    }))
}

/// 무거운 서비스 감지 — 서버 시작 시 + 5분 주기 백그라운드 실행
async fn detect_services() -> CachedHealth {
    let ytdlp_version = ytdlp::get_version().await.unwrap_or_else(|_| "unknown".to_string());

    let mut services = vec!["ytdlp".to_string(), "download".to_string(), "frames".to_string()];
    let python = platform::python_cmd();

    // rembg
    if platform::async_cmd(python).args(["-c", "import rembg"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("rembg".to_string());
    }
    // whisper
    let whisper_bin = if cfg!(target_os = "windows") { "whisper/whisper-cli.exe" } else { "whisper/whisper-cpp" };
    if dirs::data_dir().map(|d| d.join("ytdlp-companion").join(whisper_bin).exists()).unwrap_or(false) {
        services.push("whisper".to_string());
    }
    // TTS (Qwen3 > Kokoro > Piper)
    if platform::async_cmd(python).args(["-c", "from qwen_tts import Qwen3TTSModel; print('ok')"]).output().await.map(|o| o.status.success()).unwrap_or(false)
       || platform::async_cmd(python).args(["-c", "from transformers import AutoTokenizer; print('ok')"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("tts-qwen3".to_string());
    }
    if platform::async_cmd(python).args(["-c", "from kokoro_onnx import Kokoro"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("tts-kokoro".to_string());
    } else {
        let piper_bin = if cfg!(target_os = "windows") { "piper/piper.exe" } else { "piper/piper" };
        if dirs::data_dir().map(|d| d.join("ytdlp-companion").join(piper_bin).exists()).unwrap_or(false) {
            services.push("tts-piper".to_string());
        }
    }
    // NLE
    services.push("nle-install".to_string());
    // ffmpeg
    let ffmpeg_path = ytdlp::get_ffmpeg_path_public();
    if platform::async_cmd(&ffmpeg_path).args(["-version"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("ffmpeg".to_string());
    }

    println!("[Companion] 서비스 감지 완료: {:?}", services);
    CachedHealth { services, ytdlp_version }
}

/// Content-Disposition header-safe 파일명 생성
/// 비ASCII/제어문자/따옴표를 제거하여 header parse panic 방지
fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_' || *c == ' ')
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() || !trimmed.contains('.') {
        "download.mp4".to_string()
    } else {
        trimmed.to_string()
    }
}

// ──────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────

#[derive(Serialize)]
struct HealthResponse {
    app: String,
    status: String,
    version: String,
    #[serde(rename = "ytdlpVersion")]
    ytdlp_version: String,
    #[serde(rename = "lastUpdateCheck")]
    last_update_check: i64,
    services: Vec<String>,
}

#[derive(Deserialize)]
struct RemoveBgRequest {
    // base64 인코딩된 이미지
    image: String,
}

#[derive(Deserialize)]
struct TranscribeRequest {
    // base64 인코딩된 오디오
    audio: String,
    language: Option<String>,
}

#[derive(Deserialize)]
struct TtsRequest {
    text: String,
    language: Option<String>,
    engine: Option<String>,    // "qwen3" | "kokoro" | "auto"
    voice: Option<String>,     // 음성 ID (af_heart, Sohee 등)
}

#[derive(Deserialize)]
struct TtsCloneRequest {
    text: String,
    language: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id: String,          // "custom_voice_20260331_..." 형식
}

#[derive(Deserialize)]
struct SaveVoiceRequest {
    name: String,
    audio: String,             // base64 인코딩된 WAV
}

#[derive(Deserialize)]
struct DeleteVoiceRequest {
    #[serde(rename = "voiceId")]
    voice_id: String,
}

#[derive(Deserialize)]
struct NleInstallRequest {
    target: String,                          // "capcut" | "premiere" | "filmora"
    #[serde(rename = "projectId")]
    project_id: String,
    files: Vec<NleFileEntry>,                // 파일 목록 (경로 + base64 데이터)
    #[serde(rename = "launchApp")]
    launch_app: Option<bool>,
}

#[derive(Deserialize)]
struct NleFileEntry {
    path: String,       // 상대 경로 (e.g., "draft_content.json")
    data: String,       // base64 인코딩된 파일 데이터
    #[serde(rename = "isText")]
    is_text: Option<bool>,  // true면 UTF-8 텍스트로 디코딩 후 경로 패치
}

#[derive(Deserialize)]
struct FfmpegTranscodeRequest {
    // base64 인코딩된 입력 파일
    input: String,
    #[serde(rename = "inputFormat")]
    input_format: Option<String>,
    #[serde(rename = "outputFormat")]
    output_format: String,
    args: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct FfmpegMergeRequest {
    // base64 인코딩된 비디오 파일
    video: String,
    // base64 인코딩된 오디오 파일
    audio: String,
    #[serde(rename = "videoFormat")]
    video_format: Option<String>,
    #[serde(rename = "audioFormat")]
    audio_format: Option<String>,
}

#[derive(Deserialize)]
struct ExtractQuery {
    url: String,
    quality: Option<String>,
}

#[derive(Deserialize)]
struct DownloadQuery {
    url: String,
    quality: Option<String>,
    #[serde(rename = "videoOnly")]
    video_only: Option<String>,
}

#[derive(Deserialize)]
struct FramesRequest {
    url: String,
    timecodes: Vec<f64>,
    w: Option<u32>,
}

#[derive(Deserialize)]
struct SocialRequest {
    url: String,
    quality: Option<String>,
    #[serde(rename = "includeComments")]
    include_comments: Option<bool>,
}

#[derive(Deserialize)]
struct GoogleProxyRequest {
    #[serde(rename = "targetUrl")]
    target_url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    cookie: Option<String>,
}

#[derive(Deserialize)]
struct GenerateImageRequest {
    prompt: String,
    width: Option<u32>,
    height: Option<u32>,
    steps: Option<u32>,
}

// ──────────────────────────────────────────────
// 서버 시작
// ──────────────────────────────────────────────

pub async fn start_server(_app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // CORS: localhost + 127.0.0.1 + 앱 도메인만 허용 (외부 악성 사이트 차단)
    // [FIX #846] 127.0.0.1 origin 추가 — 프론트엔드가 localhost 대신 127.0.0.1로 접근
    let allowed_origins = [
        "http://localhost:5173".parse::<axum::http::HeaderValue>().unwrap(),
        "http://localhost:5174".parse::<axum::http::HeaderValue>().unwrap(),
        "http://localhost:5177".parse::<axum::http::HeaderValue>().unwrap(),
        "http://localhost:3000".parse::<axum::http::HeaderValue>().unwrap(),
        "http://127.0.0.1:5173".parse::<axum::http::HeaderValue>().unwrap(),
        "http://127.0.0.1:5174".parse::<axum::http::HeaderValue>().unwrap(),
        "http://127.0.0.1:5177".parse::<axum::http::HeaderValue>().unwrap(),
        "http://127.0.0.1:3000".parse::<axum::http::HeaderValue>().unwrap(),
        "https://all-in-one-production.pages.dev".parse::<axum::http::HeaderValue>().unwrap(),
        // Tauri WebView 오리진 — 컴패니언 자체 UI에서 health 엔드포인트 접근용
        "tauri://localhost".parse::<axum::http::HeaderValue>().unwrap(),
        "https://tauri.localhost".parse::<axum::http::HeaderValue>().unwrap(),
    ];
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins.to_vec())
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_handler))
        // yt-dlp
        .route("/api/extract", get(extract_handler))
        .route("/api/download", get(download_handler))
        .route("/api/frames", post(frames_handler))
        .route("/api/social/metadata", post(social_metadata_handler))
        .route("/api/social/download", post(social_download_handler))
        // 구글 이미지 검색 프록시 (로컬 IP — 차단 없음)
        .route("/api/google-proxy", post(google_proxy_handler))
        // FLUX.2 이미지 생성 (로컬)
        .route("/api/generate-image", post(generate_image_handler))
        // 배경 제거 (rembg)
        .route("/api/remove-bg", post(remove_bg_handler))
        // 음성 인식 (whisper.cpp)
        .route("/api/transcribe", post(transcribe_handler))
        // 음성 합성 (Qwen3 / Kokoro / Piper TTS)
        .route("/api/tts", post(tts_handler))
        .route("/api/tts/voices", get(tts_voices_handler))
        // Voice Cloning (CosyVoice zero-shot)
        .route("/api/tts/clone", post(tts_clone_handler))
        .route("/api/tts/voices/custom", get(tts_custom_voices_handler))
        .route("/api/tts/voices/custom/save", post(tts_save_voice_handler))
        .route("/api/tts/voices/custom/delete", post(tts_delete_voice_handler))
        // NLE 직접 설치 (CapCut/Premiere/Filmora)
        .route("/api/nle/install", post(nle_install_handler))
        // FFmpeg 인코딩
        .route("/api/ffmpeg/transcode", post(ffmpeg_transcode_handler))
        .route("/api/ffmpeg/merge", post(ffmpeg_merge_handler))
        .layer(cors)
        // [FIX #846] Chrome 142+ / Edge 143+ Local Network Access 대응
        // HTTPS 페이지에서 127.0.0.1로 fetch 시 preflight에 이 헤더가 필요
        .layer(middleware::from_fn(lna_header_middleware))
        // base64 인코딩된 미디어 파일 수신 — 기본 2MB → 200MB로 확장
        .layer(axum::extract::DefaultBodyLimit::max(200 * 1024 * 1024));

    // [FIX #846] IPv4 + IPv6 loopback 동시 바인딩
    // Windows에서 localhost가 ::1(IPv6)로 해석되면 IPv4 전용 서버에 연결 실패
    let addr_v4 = SocketAddr::from(([127, 0, 0, 1], 9876));
    println!("[Companion] 서버 시작: http://{}", addr_v4);

    // [FIX #914 + tokio 블로킹 수정] 서비스 감지를 60초 지연 후 실행
    // detect_services()가 Python subprocess를 실행하면서 tokio 런타임을 블로킹 →
    // 서버 시작 직후 health/download 엔드포인트가 응답 불가.
    // 60초 지연으로 서버가 먼저 안정화된 후 감지 실행.
    tokio::spawn(async {
        // 서버 안정화 대기 — health/download가 먼저 응답할 수 있게
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        loop {
            let result = detect_services().await;
            *cached_health().write().await = result;
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        }
    });

    // IPv6 loopback [::1]:9876도 시도 (실패해도 fatal 아님 — IPv6 미지원 환경 대비)
    let addr_v6 = SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], 9876u16));
    let app_clone = app.clone();
    if let Ok(v6_listener) = tokio::net::TcpListener::bind(addr_v6).await {
        println!("[Companion] IPv6 loopback 활성화: http://[::1]:9876");
        tokio::spawn(async move {
            if let Err(e) = axum::serve(v6_listener, app_clone).await {
                eprintln!("[Companion] IPv6 서버 에러 (무시): {}", e);
            }
        });
    }

    let listener = tokio::net::TcpListener::bind(addr_v4).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ──────────────────────────────────────────────
// [FIX #846] Local Network Access 미들웨어
// Chrome 142+ / Edge 143+에서 HTTPS → localhost/127.0.0.1 fetch 시
// preflight에 Access-Control-Allow-Private-Network: true 필요
// ──────────────────────────────────────────────

async fn lna_header_middleware(
    req: axum::http::Request<Body>,
    next: middleware::Next,
) -> impl IntoResponse {
    let mut res = next.run(req).await;
    res.headers_mut().insert(
        "Access-Control-Allow-Private-Network",
        "true".parse().unwrap(),
    );
    res
}

// ──────────────────────────────────────────────
// 핸들러: /health
// ──────────────────────────────────────────────

async fn health_handler() -> Json<HealthResponse> {
    // [FIX #914] 캐시된 결과 즉시 반환 — Python subprocess 0개, 응답 < 1ms
    let cached = cached_health().read().await;
    let last_update_check = ytdlp::last_update_check_ts();

    Json(HealthResponse {
        app: "ytdlp-companion".to_string(),
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        ytdlp_version: cached.ytdlp_version.clone(),
        last_update_check,
        services: cached.services.clone(),
    })
}

// ──────────────────────────────────────────────
// 핸들러: /api/extract
// ──────────────────────────────────────────────

async fn extract_handler(Query(params): Query<ExtractQuery>) -> impl IntoResponse {
    let quality = params.quality.unwrap_or_else(|| "best".to_string());
    match ytdlp::extract_stream_url(&params.url, &quality).await {
        Ok(info) => (StatusCode::OK, Json(info)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/download
// ──────────────────────────────────────────────

async fn download_handler(Query(params): Query<DownloadQuery>) -> impl IntoResponse {
    let quality = params.quality.unwrap_or_else(|| "best".to_string());
    let video_only = params.video_only.as_deref() == Some("true");

    match ytdlp::download_video(&params.url, &quality, video_only).await {
        Ok(downloaded) => {
            // 파일을 디스크에서 직접 스트리밍 (메모리 ~8MB 청크 단위)
            // 2시간 1080p (수 GB)도 메모리 부담 없음
            let file = match tokio::fs::File::open(&downloaded.path).await {
                Ok(f) => f,
                Err(e) => return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("파일 열기 실패: {}", e) })),
                ).into_response(),
            };

            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            // 파일명에 비ASCII/특수문자 → ASCII-safe 폴백
            let safe_filename = sanitize_filename(&downloaded.filename);
            let mut headers = HeaderMap::new();
            headers.insert(
                "Content-Type",
                downloaded.content_type.parse().unwrap_or("video/mp4".parse().unwrap()),
            );
            headers.insert(
                "Content-Disposition",
                format!("attachment; filename=\"{}\"", safe_filename)
                    .parse()
                    .unwrap_or("attachment; filename=\"video.mp4\"".parse().unwrap()),
            );
            headers.insert(
                "Content-Length",
                downloaded.size.to_string().parse().unwrap(),
            );

            let response = (StatusCode::OK, headers, body).into_response();
            let _ = &downloaded._tmp_dir; // keep alive hint

            response
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/frames
// ──────────────────────────────────────────────

async fn frames_handler(Json(req): Json<FramesRequest>) -> impl IntoResponse {
    let width = req.w.unwrap_or(640);
    match ytdlp::extract_frames(&req.url, &req.timecodes, width).await {
        Ok(frames) => (StatusCode::OK, Json(serde_json::json!({ "frames": frames }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/social/metadata
// ──────────────────────────────────────────────

async fn social_metadata_handler(Json(req): Json<SocialRequest>) -> impl IntoResponse {
    let include_comments = req.include_comments.unwrap_or(false);
    match ytdlp::get_social_metadata(&req.url, include_comments).await {
        Ok(metadata) => (StatusCode::OK, Json(metadata)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/social/download
// ──────────────────────────────────────────────

async fn social_download_handler(Json(req): Json<SocialRequest>) -> impl IntoResponse {
    let quality = req.quality.unwrap_or_else(|| "720p".to_string());
    match ytdlp::download_video(&req.url, &quality, false).await {
        Ok(downloaded) => {
            let file = match tokio::fs::File::open(&downloaded.path).await {
                Ok(f) => f,
                Err(e) => return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("파일 열기 실패: {}", e) })),
                ).into_response(),
            };

            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let safe_filename = sanitize_filename(&downloaded.filename);
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", downloaded.content_type.parse().unwrap_or("video/mp4".parse().unwrap()));
            headers.insert(
                "Content-Disposition",
                format!("attachment; filename=\"{}\"", safe_filename)
                    .parse()
                    .unwrap_or("attachment; filename=\"video.mp4\"".parse().unwrap()),
            );
            headers.insert("Content-Length", downloaded.size.to_string().parse().unwrap());

            let response = (StatusCode::OK, headers, body).into_response();
            let _ = &downloaded._tmp_dir;
            response
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/remove-bg (rembg 로컬)
// ──────────────────────────────────────────────

async fn remove_bg_handler(Json(req): Json<RemoveBgRequest>) -> impl IntoResponse {
    use base64::Engine;
    let image_data = match base64::engine::general_purpose::STANDARD.decode(&req.image) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) }))).into_response(),
    };

    match rembg::remove_background(&image_data).await {
        Ok(result) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&result);
            Json(serde_json::json!({ "image": b64, "format": "png" })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/transcribe (whisper.cpp 로컬)
// ──────────────────────────────────────────────

async fn transcribe_handler(Json(req): Json<TranscribeRequest>) -> impl IntoResponse {
    use base64::Engine;
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(&req.audio) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) }))).into_response(),
    };

    match whisper::transcribe(&audio_data, req.language.as_deref()).await {
        Ok(result) => Json(serde_json::json!(result)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/tts (Piper TTS 로컬)
// ──────────────────────────────────────────────

async fn tts_handler(Json(req): Json<TtsRequest>) -> impl IntoResponse {
    match tts::synthesize_speech(
        &req.text,
        req.language.as_deref(),
        req.engine.as_deref(),
        req.voice.as_deref(),
    ).await {
        Ok(wav_data) => {
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "audio/wav".parse().unwrap());
            headers.insert("Content-Length", wav_data.len().to_string().parse().unwrap());
            (StatusCode::OK, headers, Body::from(wav_data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/tts/voices (음성 목록)
// ──────────────────────────────────────────────

async fn tts_voices_handler() -> Json<serde_json::Value> {
    let mut voices = tts::get_voices_json();
    voices["custom"] = serde_json::json!(tts::list_custom_voices());
    voices["cosyvoice_available"] = serde_json::json!(tts::is_cosyvoice_available());
    Json(voices)
}

// ──────────────────────────────────────────────
// 핸들러: Voice Cloning (Qwen3-TTS CustomVoice)
// ──────────────────────────────────────────────

/// POST /api/tts/clone — 커스텀 음성으로 TTS 생성
async fn tts_clone_handler(Json(req): Json<TtsCloneRequest>) -> impl IntoResponse {
    // voice_id에서 파일 경로 추출
    let voices = tts::list_custom_voices();
    let voice_entry = voices.iter().find(|v| v["id"].as_str() == Some(&req.voice_id));
    let ref_path = match voice_entry.and_then(|v| v["filePath"].as_str()) {
        Some(p) => p.to_string(),
        None => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": format!("커스텀 음성 '{}' 을(를) 찾을 수 없습니다", req.voice_id)
        }))).into_response(),
    };

    match tts::clone_voice_tts(&req.text, &ref_path, req.language.as_deref()).await {
        Ok(wav_data) => {
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "audio/wav".parse().unwrap());
            headers.insert("Content-Length", wav_data.len().to_string().parse().unwrap());
            (StatusCode::OK, headers, Body::from(wav_data)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
            "error": e.to_string()
        }))).into_response(),
    }
}

/// GET /api/tts/voices/custom — 저장된 커스텀 음성 목록
async fn tts_custom_voices_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "voices": tts::list_custom_voices() }))
}

/// POST /api/tts/voices/custom/save — 참조 음성 저장
async fn tts_save_voice_handler(Json(req): Json<SaveVoiceRequest>) -> impl IntoResponse {
    // base64 → bytes
    let wav_data = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &req.audio) {
        Ok(data) => data,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": format!("base64 디코딩 실패: {}", e)
        }))).into_response(),
    };

    if wav_data.len() < 100 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "오디오 파일이 너무 작습니다 (최소 3초 이상 녹음해주세요)"
        }))).into_response();
    }

    match tts::save_custom_voice(&req.name, &wav_data) {
        Ok(voice_id) => (StatusCode::OK, Json(serde_json::json!({
            "voiceId": voice_id,
            "name": req.name,
        }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({
            "error": e
        }))).into_response(),
    }
}

/// POST /api/tts/voices/custom/delete — 커스텀 음성 삭제
async fn tts_delete_voice_handler(Json(req): Json<DeleteVoiceRequest>) -> impl IntoResponse {
    match tts::delete_custom_voice(&req.voice_id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/nle/install (NLE 프로젝트 직접 설치)
// ──────────────────────────────────────────────

async fn nle_install_handler(Json(req): Json<NleInstallRequest>) -> impl IntoResponse {
    use base64::Engine;

    // 프로젝트 ID 검증 (경로 탐색 방지 — UUID/알파벳+숫자+하이픈만, 80자 제한)
    let id_valid = !req.project_id.is_empty()
        && req.project_id.len() <= 80
        && req.project_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !id_valid {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "유효하지 않은 프로젝트 ID — 영숫자, 하이픈, 언더스코어만 허용 (최대 80자)" }))).into_response();
    }

    // 대상 NLE에 따라 설치 경로 결정
    let install_root = match req.target.as_str() {
        "capcut" => {
            if cfg!(target_os = "macos") {
                dirs::home_dir().unwrap_or_default()
                    .join("Movies/CapCut/User Data/Projects/com.lveditor.draft")
            } else {
                // Windows: %LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft
                dirs::data_local_dir().unwrap_or_default()
                    .join("CapCut/User Data/Projects/com.lveditor.draft")
            }
        }
        "premiere" | "filmora" => {
            // 문서 폴더에 저장
            dirs::document_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default())
                .join("All In One NLE Export")
        }
        _ => {
            return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("지원하지 않는 NLE: {}", req.target) }))).into_response();
        }
    };

    let project_dir = install_root.join(&req.project_id);

    // 폴더 생성
    if let Err(e) = std::fs::create_dir_all(&project_dir) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("폴더 생성 실패: {}", e) }))).into_response();
    }

    // Windows에서 역슬래시를 슬래시로 정규화 (JSON 문자열 내 escape 문제 방지)
    let project_path_str = project_dir.to_string_lossy().to_string().replace('\\', "/");
    let root_path_str = install_root.to_string_lossy().to_string().replace('\\', "/");
    let placeholder = format!("##_draftpath_placeholder_{}_##", req.project_id);

    let mut installed_count = 0;

    // 파일 쓰기
    for entry in &req.files {
        // 경로 검증 (경로 탐색 방지 — 절대경로, .., 제어문자 차단)
        if entry.path.contains("..") || entry.path.starts_with('/') || entry.path.starts_with('\\')
           || entry.path.contains(':') || entry.path.chars().any(|c| c.is_control()) {
            eprintln!("[NLE] 경로 거부: {}", entry.path);
            continue;
        }

        let file_path = project_dir.join(&entry.path);
        // canonicalize 전 검증: join 후 project_dir 하위인지 확인
        if !file_path.starts_with(&project_dir) {
            eprintln!("[NLE] 경로 탐색 차단: {}", entry.path);
            continue;
        }

        // 부모 디렉토리 생성
        if let Some(parent) = file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let data = match base64::engine::general_purpose::STANDARD.decode(&entry.data) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[NLE] Base64 디코딩 실패 ({}): {}", entry.path, e);
                continue;
            }
        };

        // 텍스트 파일이면 경로 플레이스홀더를 실제 경로로 패치
        if entry.is_text.unwrap_or(false) {
            let mut text = String::from_utf8_lossy(&data).to_string();
            // CapCut 경로 패치 — 모든 미디어 참조 경로를 로컬 절대경로로 변환
            if req.target == "capcut" {
                text = text.replace(&placeholder, &project_path_str);
                // path, media_path, source_path, extra_material_refs 등 모든 materials 참조를 절대경로로 변환
                for key in &["path", "media_path", "source_path"] {
                    let from = format!("\"{}\":\"materials/", key);
                    let to = format!("\"{}\":\"{}/materials/", key, project_path_str);
                    text = text.replace(&from, &to);
                }
                // draft_fold_path, draft_root_path 패치
                let fold_re = regex_lite::Regex::new(r#""draft_fold_path":"[^"]*""#).unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = fold_re.replace_all(&text, &format!("\"draft_fold_path\":\"{}\"", project_path_str)).to_string();
                let root_re = regex_lite::Regex::new(r#""draft_root_path":"[^"]*""#).unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = root_re.replace_all(&text, &format!("\"draft_root_path\":\"{}\"", root_path_str)).to_string();
                // draft_materials_copy_folder 패치 (CapCut이 미디어 복사 시 참조)
                let copy_folder_re = regex_lite::Regex::new(r#""draft_materials_copy_folder":"[^"]*""#).unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = copy_folder_re.replace_all(&text, &format!("\"draft_materials_copy_folder\":\"{}/materials\"", project_path_str)).to_string();
            }
            if let Err(e) = std::fs::write(&file_path, text.as_bytes()) {
                eprintln!("[NLE] 파일 쓰기 실패 ({}): {}", entry.path, e);
                continue;
            }
        } else {
            if let Err(e) = std::fs::write(&file_path, &data) {
                eprintln!("[NLE] 파일 쓰기 실패 ({}): {}", entry.path, e);
                continue;
            }
        }

        installed_count += 1;
    }

    // ── Premiere .prproj 패치 — launch 전에 실행하여 패치된 파일이 열리도록 ──
    if req.target == "premiere" {
        if let Err(e) = patch_prproj_files(&project_dir) {
            eprintln!("[NLE] prproj 패치 경고 (치명적 아님): {}", e);
        }
    }

    // 앱 실행
    if req.launch_app.unwrap_or(true) {
        match req.target.as_str() {
            "capcut" => {
                #[cfg(target_os = "macos")]
                {
                    let _ = tokio::process::Command::new("open")
                        .args(["-a", "CapCut", &project_path_str])
                        .spawn();
                }
                #[cfg(target_os = "windows")]
                {
                    let _ = platform::async_cmd("cmd")
                        .args(["/c", "start", "CapCut"])
                        .spawn();
                }
            }
            "premiere" => {
                // prproj 파일 찾아서 열기
                if let Ok(entries) = std::fs::read_dir(&project_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().map(|e| e == "prproj").unwrap_or(false) {
                            #[cfg(target_os = "macos")]
                            { let _ = tokio::process::Command::new("open").arg(&path).spawn(); }
                            #[cfg(target_os = "windows")]
                            { let _ = platform::async_cmd("cmd").args(["/c", "start", "", &path.to_string_lossy()]).spawn(); }
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    println!("[NLE] {} 프로젝트 설치 완료: {} ({}개 파일)", req.target, project_path_str, installed_count);

    Json(serde_json::json!({
        "success": true,
        "installedPath": project_path_str,
        "filesInstalled": installed_count,
        "target": req.target,
    })).into_response()
}

// ──────────────────────────────────────────────
// Premiere .prproj 패치 — 사용자 PC 환경에 맞게 경로/버전 치환
// ──────────────────────────────────────────────

/// 사용자 PC에 설치된 Adobe Premiere Pro 경로를 탐색한다.
/// 반환: (앱 경로, 버전 문자열) e.g. ("/Applications/Adobe Premiere Pro 2026", "26.1.0")
fn detect_premiere_pro() -> Option<(String, String)> {
    #[cfg(target_os = "macos")]
    {
        // Adobe Premiere Pro 설치 패턴 2가지:
        // A) /Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app/
        // B) /Applications/Adobe Premiere Pro 2026.app/ (드물지만 가능)
        let apps_dir = std::path::Path::new("/Applications");
        if let Ok(entries) = std::fs::read_dir(apps_dir) {
            let mut candidates: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|name| name.starts_with("Adobe Premiere Pro") && !name.contains("Beta"))
                .collect();
            candidates.sort();
            if let Some(latest) = candidates.last() {
                let entry_path = format!("/Applications/{}", latest);
                let folder_name = latest.trim_end_matches(".app");

                // .app 번들 경로 탐색 — 폴더 내부에 .app이 있는지 확인
                let bundle_path = if latest.ends_with(".app") {
                    // 패턴 B: entry 자체가 .app 번들
                    entry_path.clone()
                } else {
                    // 패턴 A: 폴더 안에 {name}.app이 있음
                    let nested = format!("{}/{}.app", entry_path, folder_name);
                    if std::path::Path::new(&nested).exists() {
                        nested
                    } else {
                        // 폴백: 폴더 안에서 .app 찾기
                        std::fs::read_dir(&entry_path)
                            .ok()
                            .and_then(|entries| {
                                entries.filter_map(|e| e.ok())
                                    .find(|e| e.file_name().to_string_lossy().ends_with(".app"))
                                    .map(|e| format!("{}/{}", entry_path, e.file_name().to_string_lossy()))
                            })
                            .unwrap_or_else(|| format!("{}.app", entry_path))
                    }
                };

                // .prproj XML 내 경로는 .app 없는 폴더 형태로 기록됨
                let app_path = entry_path.trim_end_matches(".app").to_string();

                // Info.plist에서 버전 읽기
                let plist_path = format!("{}/Contents/Info.plist", bundle_path);
                let version = read_plist_version(&plist_path)
                    .or_else(|| {
                        folder_name.strip_prefix("Adobe Premiere Pro ")
                            .map(|y| premiere_year_to_version(y))
                    })
                    .unwrap_or_else(|| "26.0.0".to_string());

                println!("[NLE] Premiere 감지: entry={}, bundle={}, version={}", entry_path, bundle_path, version);
                return Some((app_path, version));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // C:\Program Files\Adobe\Adobe Premiere Pro *
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
        let adobe_dir = std::path::Path::new(&program_files).join("Adobe");
        if let Ok(entries) = std::fs::read_dir(&adobe_dir) {
            let mut candidates: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|name| name.starts_with("Adobe Premiere Pro") && !name.contains("Beta"))
                .collect();
            candidates.sort();
            if let Some(latest) = candidates.last() {
                let app_path = format!("{}/Adobe/{}", program_files, latest);
                let version = latest.strip_prefix("Adobe Premiere Pro ")
                    .map(|y| premiere_year_to_version(y))
                    .unwrap_or_else(|| "26.0.0".to_string());
                return Some((app_path, version));
            }
        }
    }

    None
}

/// 마케팅 연도(e.g. "2026") → Premiere 내부 버전(e.g. "26.0.0")
/// 2024=v24, 2025=v25, 2026=v26 — 2024 이후 year-2000이 정확.
/// 2020~2023은 다른 매핑이지만 해당 버전 사용자는 극소수이므로 근사값 사용.
/// macOS에서는 Info.plist에서 정확한 버전을 읽으므로 이 폴백은 주로 Windows용.
fn premiere_year_to_version(year_str: &str) -> String {
    if let Ok(year) = year_str.parse::<u32>() {
        // 2020~2023 구버전 매핑 테이블
        let major = match year {
            2020 => 14, 2021 => 15, 2022 => 22, 2023 => 23,
            y if y >= 2024 => y - 2000, // 2024=24, 2025=25, 2026=26
            _ => 26, // 알 수 없는 연도 → 최신 기본값
        };
        format!("{}.0.0", major)
    } else {
        "26.0.0".to_string()
    }
}

/// macOS Info.plist에서 CFBundleShortVersionString 읽기
fn read_plist_version(plist_path: &str) -> Option<String> {
    let content = std::fs::read_to_string(plist_path).ok()?;
    // 간이 XML 파싱 — <key>CFBundleShortVersionString</key> 다음 <string>값</string>
    let key = "CFBundleShortVersionString";
    let key_pos = content.find(key)?;
    let after_key = &content[key_pos + key.len()..];
    let string_start = after_key.find("<string>")? + 8;
    let string_end = after_key[string_start..].find("</string>")?;
    Some(after_key[string_start..string_start + string_end].to_string())
}

/// project_dir 내 모든 .prproj 파일을 찾아 패치한다.
fn patch_prproj_files(project_dir: &std::path::Path) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::{Read, Write};

    let premiere_info = detect_premiere_pro();
    if let Some((ref path, ref ver)) = premiere_info {
        println!("[NLE] Premiere Pro 감지: {} (v{})", path, ver);
    } else {
        println!("[NLE] Premiere Pro 설치 경로를 찾지 못함 — 경로 패치 스킵, 절대경로 제거만 수행");
    }

    let entries = std::fs::read_dir(project_dir)
        .map_err(|e| format!("디렉토리 읽기 실패: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "prproj").unwrap_or(false) {
            println!("[NLE] prproj 패치 시작: {}", path.display());

            // 1. 읽기 + gunzip
            let gz_bytes = std::fs::read(&path)
                .map_err(|e| format!("prproj 읽기 실패: {}", e))?;
            let mut decoder = GzDecoder::new(&gz_bytes[..]);
            let mut xml = String::new();
            decoder.read_to_string(&mut xml)
                .map_err(|e| format!("prproj gunzip 실패: {}", e))?;

            // 2. 절대경로 제거/치환

            // /Applications/Adobe Premiere Pro 2025/... → 제거
            // PresetPath, ProxyWatermarkDefaultImageFullPath는 Premiere가 실행 시 자동 재설정하므로
            // 경로 재구성을 시도하지 않고 안전하게 비운다.
            let full_premiere_path_re = regex_lite::Regex::new(
                r"/Applications/Adobe Premiere Pro [^<]+"
            ).unwrap();
            xml = full_premiere_path_re.replace_all(&xml, "").to_string();

            // /Users/xxx/... 절대경로 제거 (태그 내용만)
            let user_path_re = regex_lite::Regex::new(
                r"(?:>)(/Users/[^<]+|[A-Z]:\\Users\\[^<]+)(</)"
            ).unwrap();
            xml = user_path_re.replace_all(&xml, ">$2").to_string();

            // ConformedAudioPath, PeakFilePath 태그 전체 제거
            // (역참조 \1 미지원 — 태그별 개별 regex 사용)
            let conformed_re = regex_lite::Regex::new(
                r"<ConformedAudioPath>[^<]*</ConformedAudioPath>\s*"
            ).unwrap();
            let peak_re = regex_lite::Regex::new(
                r"<PeakFilePath>[^<]*</PeakFilePath>\s*"
            ).unwrap();
            xml = conformed_re.replace_all(&xml, "").to_string();
            xml = peak_re.replace_all(&xml, "").to_string();

            // 3. 파일명만 있는 경로를 절대경로로 변환 (Premiere는 절대경로만 자동 링크)
            // regex_lite가 한글 파일명 + backreference 조합에서 실패하므로,
            // 프로젝트 폴더의 실제 미디어 파일을 스캔하여 직접 문자열 교체
            {
                let abs_project_path = project_dir.to_string_lossy().to_string().replace('\\', "/");
                let media_extensions = ["mp4","mov","avi","mkv","webm","m4v","ts","flv","wmv",
                                        "mp3","wav","aac","m4a","ogg","flac","wma"];

                // 프로젝트 폴더의 미디어 파일 목록 수집
                let mut media_files: Vec<String> = Vec::new();
                if let Ok(entries) = std::fs::read_dir(project_dir) {
                    for entry in entries.flatten() {
                        let fname = entry.file_name().to_string_lossy().to_string();
                        if let Some(ext) = fname.rsplit('.').next() {
                            if media_extensions.contains(&ext.to_lowercase().as_str()) {
                                media_files.push(fname);
                            }
                        }
                    }
                }

                // 각 미디어 파일에 대해 FilePath/RelativePath/ActualMediaFilePath를 절대경로로 교체
                for fname in &media_files {
                    let abs_path = format!("{}/{}", abs_project_path, fname);
                    for tag in &["FilePath", "ActualMediaFilePath", "RelativePath"] {
                        // 파일명만 있는 경우: <FilePath>filename.mp4</FilePath>
                        let from = format!("<{0}>{1}</{0}>", tag, fname);
                        let to = format!("<{0}>{1}</{0}>", tag, abs_path);
                        xml = xml.replace(&from, &to);
                        // ./파일명 경우: <FilePath>./filename.mp4</FilePath>
                        let from_dot = format!("<{0}>./{1}</{0}>", tag, fname);
                        xml = xml.replace(&from_dot, &to);
                        // media/파일명 (레거시): <FilePath>media/filename.mp4</FilePath>
                        let from_media = format!("<{0}>media/{1}</{0}>", tag, fname);
                        xml = xml.replace(&from_media, &to);
                        // ./media/파일명 (레거시)
                        let from_dot_media = format!("<{0}>./media/{1}</{0}>", tag, fname);
                        xml = xml.replace(&from_dot_media, &to);
                        // audio/파일명 (나레이션)
                        let from_audio = format!("<{0}>audio/{1}</{0}>", tag, fname);
                        xml = xml.replace(&from_audio, &to);
                    }
                }
                println!("[NLE] prproj 미디어 경로 → 절대경로 변환: {}/{} 파일", abs_project_path, media_files.len());
            }

            // 4. MZ.BuildVersion 갱신
            if let Some((_, ref ver)) = premiere_info {
                let now = chrono::Local::now().format("%a %b %e %T %Y").to_string();
                let build_ver = format!("{}x0 - {}", ver, now);
                let created_re = regex_lite::Regex::new(
                    r"<MZ\.BuildVersion\.Created>[^<]*</MZ\.BuildVersion\.Created>"
                ).unwrap();
                let modified_re = regex_lite::Regex::new(
                    r"<MZ\.BuildVersion\.Modified>[^<]*</MZ\.BuildVersion\.Modified>"
                ).unwrap();
                xml = created_re.replace_all(&xml, &format!(
                    "<MZ.BuildVersion.Created>{}</MZ.BuildVersion.Created>", build_ver
                )).to_string();
                xml = modified_re.replace_all(&xml, &format!(
                    "<MZ.BuildVersion.Modified>{}</MZ.BuildVersion.Modified>", build_ver
                )).to_string();
            }

            // 4. gzip 압축 + 저장
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(xml.as_bytes())
                .map_err(|e| format!("prproj gzip 실패: {}", e))?;
            let mut gz_out = encoder.finish()
                .map_err(|e| format!("prproj gzip finish 실패: {}", e))?;
            // Premiere는 gzip OS byte로 0x13을 기대한다.
            // 브라우저 생성본을 companion이 다시 gzip 하더라도 동일 헤더를 유지해야 저장 에러가 재발하지 않는다.
            if gz_out.len() >= 10 {
                gz_out[9] = 0x13;
            }

            std::fs::write(&path, &gz_out)
                .map_err(|e| format!("prproj 저장 실패: {}", e))?;

            println!("[NLE] prproj 패치 완료: {} ({}→{} bytes)", path.display(), gz_bytes.len(), gz_out.len());
        }
    }

    Ok(())
}

// ──────────────────────────────────────────────
// 핸들러: /api/ffmpeg/transcode (네이티브 FFmpeg)
// ──────────────────────────────────────────────

async fn ffmpeg_transcode_handler(Json(req): Json<FfmpegTranscodeRequest>) -> impl IntoResponse {
    use base64::Engine;
    let input_data = match base64::engine::general_purpose::STANDARD.decode(&req.input) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) }))).into_response(),
    };

    let in_ext = req.input_format.as_deref().unwrap_or("mp4");
    let tmp_input = match tempfile::Builder::new().suffix(&format!(".{}", in_ext)).tempfile() {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) }))).into_response(),
    };
    let tmp_output = match tempfile::Builder::new().suffix(&format!(".{}", req.output_format)).tempfile() {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) }))).into_response(),
    };

    let input_path = tmp_input.path().to_string_lossy().to_string();
    let output_path = tmp_output.path().to_string_lossy().to_string();

    if let Err(e) = std::fs::write(&input_path, &input_data) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("파일 쓰기 실패: {}", e) }))).into_response();
    }

    // 허용된 ffmpeg 인자만 통과 (인젝션 + 임의 파일 쓰기 방지)
    const ALLOWED_PREFIXES: &[&str] = &[
        "-c:", "-codec:", "-b:", "-r", "-s", "-vf", "-af", "-filter:",
        "-preset", "-crf", "-qp", "-ar", "-ac", "-t", "-ss", "-to",
        "-map", "-threads", "-pix_fmt", "-movflags", "-f",
    ];
    // 값 인자에 허용되는 패턴 (코덱명, 해상도, 숫자 등 — 경로/URL 차단)
    let is_safe_value = |v: &str| -> bool {
        !v.starts_with('-') && !v.contains('/') && !v.contains('\\')
            && !v.contains(':') && !v.starts_with('.')
            && v.len() < 64
    };
    let mut args = vec!["-i".to_string(), input_path, "-y".to_string()];
    if let Some(extra_args) = &req.args {
        let mut prev_was_flag = false;
        for arg in extra_args {
            if ALLOWED_PREFIXES.iter().any(|p| arg.starts_with(p)) {
                args.push(arg.clone());
                prev_was_flag = true;
            } else if prev_was_flag && is_safe_value(arg) {
                // 직전 항목이 허용된 플래그일 때만 값 인자 허용
                args.push(arg.clone());
                prev_was_flag = false;
            } else {
                prev_was_flag = false;
            }
        }
    }
    args.push(output_path.clone());

    let ffmpeg = ytdlp::get_ffmpeg_path_public();
    let output = platform::async_cmd(&ffmpeg).args(&args).output().await;

    match output {
        Ok(out) if out.status.success() => {
            match std::fs::read(&output_path) {
                Ok(data) => {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    Json(serde_json::json!({ "data": b64, "format": req.output_format, "size": data.len() })).into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("결과 파일 읽기 실패: {}", e) }))).into_response(),
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg 실패: {}", stderr.lines().last().unwrap_or("unknown")) }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg 실행 불가: {}", e) }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/ffmpeg/merge (비디오+오디오 합본)
// [FIX] companionTranscode는 단일 입력만 지원 → merge 전용 엔드포인트 신설
// ──────────────────────────────────────────────

async fn ffmpeg_merge_handler(Json(req): Json<FfmpegMergeRequest>) -> impl IntoResponse {
    use base64::Engine;

    let video_data = match base64::engine::general_purpose::STANDARD.decode(&req.video) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("비디오 Base64 디코딩 실패: {}", e) }))).into_response(),
    };
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(&req.audio) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("오디오 Base64 디코딩 실패: {}", e) }))).into_response(),
    };

    let vid_ext = req.video_format.as_deref().unwrap_or("mp4");
    let aud_ext = req.audio_format.as_deref().unwrap_or("m4a");

    let tmp_video = match tempfile::Builder::new().suffix(&format!(".{}", vid_ext)).tempfile() {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) }))).into_response(),
    };
    let tmp_audio = match tempfile::Builder::new().suffix(&format!(".{}", aud_ext)).tempfile() {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) }))).into_response(),
    };
    let tmp_output = match tempfile::Builder::new().suffix(".mp4").tempfile() {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) }))).into_response(),
    };

    let video_path = tmp_video.path().to_string_lossy().to_string();
    let audio_path = tmp_audio.path().to_string_lossy().to_string();
    let output_path = tmp_output.path().to_string_lossy().to_string();

    if let Err(e) = std::fs::write(&video_path, &video_data) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("비디오 파일 쓰기 실패: {}", e) }))).into_response();
    }
    if let Err(e) = std::fs::write(&audio_path, &audio_data) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("오디오 파일 쓰기 실패: {}", e) }))).into_response();
    }

    let ffmpeg = ytdlp::get_ffmpeg_path_public();
    let args = vec![
        "-i".to_string(), video_path,
        "-i".to_string(), audio_path,
        "-c:v".to_string(), "copy".to_string(),
        "-c:a".to_string(), "copy".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        "-y".to_string(),
        output_path.clone(),
    ];

    println!("[FFmpeg] merge 실행: video({} bytes) + audio({} bytes)", video_data.len(), audio_data.len());
    let output = platform::async_cmd(&ffmpeg).args(&args).output().await;

    match output {
        Ok(out) if out.status.success() => {
            match std::fs::read(&output_path) {
                Ok(data) => {
                    println!("[FFmpeg] ✅ merge 성공: {} bytes", data.len());
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    Json(serde_json::json!({ "data": b64, "format": "mp4", "size": data.len() })).into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("결과 파일 읽기 실패: {}", e) }))).into_response(),
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            println!("[FFmpeg] ❌ merge 실패: {}", stderr.lines().last().unwrap_or("unknown"));
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg merge 실패: {}", stderr.lines().last().unwrap_or("unknown")) }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg 실행 불가: {}", e) }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/google-proxy (로컬 IP로 구글 검색)
// [FIX] 싱글톤 Client + SOCS 쿠키 + Sec-Ch-UA + 요청 간격 강제
// ──────────────────────────────────────────────

async fn google_proxy_handler(Json(req): Json<GoogleProxyRequest>) -> impl IntoResponse {
    // URL 허용 목록 (구글 이미지 + YouTube 자막 + Wikimedia)
    let allowed_hosts = ["www.google.com", "www.google.co.kr", "en.wikipedia.org", "commons.wikimedia.org", "www.youtube.com"];
    let parsed = url::Url::parse(&req.target_url).ok();
    let host = parsed.as_ref().and_then(|u| u.host_str().map(String::from)).unwrap_or_default();
    if !allowed_hosts.iter().any(|h| host.ends_with(h)) {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("허용되지 않은 호스트: {}", host) }))).into_response();
    }

    let is_google = host.contains("google.com") || host.contains("google.co.kr");

    // [FIX] Google 요청에 대해 페이싱 적용 (8~15초 랜덤 간격)
    if is_google {
        let mut state = google_proxy_state().lock().await;

        // 쿨다운 중이면 429 반환
        if state.cooldown_until > std::time::Instant::now() {
            let remaining = state.cooldown_until.duration_since(std::time::Instant::now()).as_secs();
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "application/json".parse().unwrap());
            headers.insert("Retry-After", remaining.to_string().parse().unwrap());
            return (StatusCode::TOO_MANY_REQUESTS, headers, Body::from(
                serde_json::json!({ "error": "Google 쿨다운 중", "retryAfterSeconds": remaining }).to_string()
            )).into_response();
        }

        // 최소 간격 강제 (8~15초 랜덤)
        let elapsed = state.last_request_at.elapsed();
        let min_delay_ms = 8000 + (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_millis() % 7000) as u64;
        let min_delay = std::time::Duration::from_millis(min_delay_ms);
        if elapsed < min_delay {
            let wait = min_delay - elapsed;
            drop(state); // unlock during sleep
            tokio::time::sleep(wait).await;
            state = google_proxy_state().lock().await;
        }
        state.last_request_at = std::time::Instant::now();
        drop(state);
    }

    // 싱글톤 Client 사용 (Google) 또는 새 Client (기타)
    let client = if is_google {
        google_proxy_client()
    } else {
        // 비-Google은 기존 방식 (리다이렉트 비활성화만)
        static NON_GOOGLE_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
        NON_GOOGLE_CLIENT.get_or_init(|| {
            reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default()
        })
    };

    let mut request = client.get(&req.target_url);

    // 헤더 설정 — Google에는 Sec-Ch-UA 강제 주입
    if let Some(headers) = &req.headers {
        for (k, v) in headers {
            request = request.header(k.as_str(), v.as_str());
        }
    }
    if is_google {
        // Sec-Ch-UA 헤더 강제 보정 (프론트에서도 보내지만 이중 보장)
        request = request
            .header("Sec-Ch-Ua", "\"Chromium\";v=\"136\", \"Not_A Brand\";v=\"24\"")
            .header("Sec-Ch-Ua-Mobile", "?0")
            .header("Sec-Ch-Ua-Platform", "\"macOS\"")
            .header("Sec-Fetch-Dest", "document")
            .header("Sec-Fetch-Mode", "navigate")
            .header("Sec-Fetch-Site", "none")
            .header("Sec-Fetch-User", "?1");
    }
    if let Some(cookie) = &req.cookie {
        if !cookie.is_empty() {
            request = request.header("Cookie", cookie.as_str());
        }
    }

    match request.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let retry_after = res.headers().get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            let content_type = res.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let body = res.bytes().await.unwrap_or_default();

            // [FIX] 429 시 지수 백오프 쿨다운
            if status == 429 && is_google {
                let mut state = google_proxy_state().lock().await;
                state.consecutive_429s += 1;
                let cooldown_secs = retry_after.unwrap_or_else(|| match state.consecutive_429s {
                    1 => 30,
                    2 => 60,
                    3 => 300,
                    _ => 600,
                });
                state.cooldown_until = std::time::Instant::now() + std::time::Duration::from_secs(cooldown_secs);
            } else if is_google && status == 200 {
                // 성공 시 429 카운터 리셋
                let mut state = google_proxy_state().lock().await;
                state.consecutive_429s = 0;
            }

            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", content_type.parse().unwrap_or("text/html".parse().unwrap()));
            if let Some(ra) = retry_after {
                headers.insert("Retry-After", ra.to_string().parse().unwrap());
            }
            (axum::http::StatusCode::from_u16(status).unwrap_or(StatusCode::OK), headers, Body::from(body)).into_response()
        }
        Err(e) => (StatusCode::BAD_GATEWAY, Json(serde_json::json!({ "error": format!("프록시 요청 실패: {}", e) }))).into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/generate-image (FLUX.2 로컬 생성)
// ──────────────────────────────────────────────

async fn generate_image_handler(Json(req): Json<GenerateImageRequest>) -> impl IntoResponse {
    let width = req.width.unwrap_or(1024);
    let height = req.height.unwrap_or(1024);
    let steps = req.steps.unwrap_or(4);

    let tmp_output = tempfile::Builder::new().suffix(".png").tempfile().unwrap();
    let output_path = tmp_output.path().to_string_lossy().to_string();

    // 프롬프트 안전 처리
    let safe_prompt = req.prompt.replace('\'', "\\'").replace('\n', " ").replace('\r', "");

    // mflux-generate CLI 호출
    let output = platform::async_cmd("mflux-generate")
        .args([
            "--model", "flux.1-schnell",  // 가장 빠른 모델 (1-4 steps)
            "--prompt", &safe_prompt,
            "--width", &width.to_string(),
            "--height", &height.to_string(),
            "--steps", &steps.to_string(),
            "--output", &output_path,
            "--quantize", "4",  // 4bit 양자화 (메모리 절약)
        ])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            match std::fs::read(&output_path) {
                Ok(data) => {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    Json(serde_json::json!({
                        "image": b64,
                        "format": "png",
                        "width": width,
                        "height": height,
                    })).into_response()
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("이미지 읽기 실패: {}", e) }))).into_response(),
            }
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FLUX 생성 실패: {}", stderr.lines().last().unwrap_or("unknown")) }))).into_response()
        }
        Err(e) => {
            let install_hint = if cfg!(target_os = "macos") {
                "'pip3 install mflux'로 설치해주세요."
            } else {
                "mflux는 macOS(Apple Silicon) 전용입니다. Windows에서는 사용할 수 없습니다."
            };
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("mflux 실행 불가: {}. {}", e, install_hint) }))).into_response()
        },
    }
}

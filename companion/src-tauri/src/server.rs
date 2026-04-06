use axum::{
    body::Body,
    extract::Query,
    http::{HeaderMap, StatusCode},
    middleware,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, OnceLock};
use tokio::sync::RwLock;
use tokio_util::io::ReaderStream;
use tower_http::cors::{Any, CorsLayer};

use crate::{platform, rembg, tts, whisper, ytdlp};

// ──────────────────────────────────────────────
// [FIX] Google 프록시 싱글톤 Client + 페이싱/백오프 상태
// ──────────────────────────────────────────────
use std::sync::Arc;

struct GoogleProxyBackoffState {
    consecutive_429s: u32,
    cooldown_until: std::time::Instant,
}

const GOOGLE_SOCS_COOKIE_PAIR: &str =
    "SOCS=CAESHAgBEhJnd3NfMjAyNDA1MDEtMF9SQzIaAmVuIAEaBgiA_uC2Bg";
const GOOGLE_CONSENT_COOKIE_PAIR: &str = "CONSENT=YES+cb.20240101-00-p0.en+FX+987";

static GOOGLE_PROXY_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    let jar = Arc::new(reqwest::cookie::Jar::default());
    let google_url = "https://www.google.com".parse::<url::Url>().unwrap();

    // SOCS 동의 쿠키 (2024+ 필수 — 없으면 봇 취급)
    jar.add_cookie_str(
        &format!("{GOOGLE_SOCS_COOKIE_PAIR}; domain=.google.com; path=/; secure; SameSite=Lax"),
        &google_url,
    );
    // 레거시 CONSENT 쿠키 폴백
    jar.add_cookie_str(
        &format!("{GOOGLE_CONSENT_COOKIE_PAIR}; domain=.google.com; path=/"),
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
});
static LAST_GOOGLE_REQUEST: LazyLock<tokio::sync::Mutex<std::time::Instant>> =
    LazyLock::new(|| {
        tokio::sync::Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(60))
    });
static GOOGLE_REQUEST_GATE: LazyLock<tokio::sync::Mutex<()>> =
    LazyLock::new(|| tokio::sync::Mutex::new(()));
static GOOGLE_PROXY_BACKOFF_STATE: LazyLock<tokio::sync::Mutex<GoogleProxyBackoffState>> =
    LazyLock::new(|| {
        tokio::sync::Mutex::new(GoogleProxyBackoffState {
            consecutive_429s: 0,
            cooldown_until: std::time::Instant::now() - std::time::Duration::from_secs(1),
        })
    });

fn google_proxy_client() -> &'static reqwest::Client {
    &GOOGLE_PROXY_CLIENT
}

fn google_proxy_backoff_state() -> &'static tokio::sync::Mutex<GoogleProxyBackoffState> {
    &GOOGLE_PROXY_BACKOFF_STATE
}

fn google_request_gap() -> std::time::Duration {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    std::time::Duration::from_secs(8 + (nanos % 8))
}

async fn enforce_google_request_spacing() {
    let min_gap = google_request_gap();

    loop {
        let wait_duration = {
            let mut last_request = LAST_GOOGLE_REQUEST.lock().await;
            let now = std::time::Instant::now();
            let elapsed = now.saturating_duration_since(*last_request);
            if elapsed >= min_gap {
                *last_request = now;
                return;
            }
            min_gap - elapsed
        };

        tokio::time::sleep(wait_duration).await;
    }
}

fn google_backoff_seconds(consecutive_429s: u32) -> u64 {
    match consecutive_429s {
        1 => 30,
        2 => 60,
        3 => 300,
        _ => 600,
    }
}

fn parse_retry_after_seconds(value: &reqwest::header::HeaderValue) -> Option<u64> {
    let raw = value.to_str().ok()?.trim();
    if raw.is_empty() {
        return None;
    }

    if let Ok(seconds) = raw.parse::<u64>() {
        return (seconds > 0).then_some(seconds);
    }

    let retry_at = chrono::DateTime::parse_from_rfc2822(raw).ok()?;
    let remaining_seconds = retry_at
        .with_timezone(&chrono::Utc)
        .signed_duration_since(chrono::Utc::now())
        .num_seconds();

    (remaining_seconds > 0).then_some(remaining_seconds as u64)
}

fn build_google_cookie_header(user_cookie: &str) -> String {
    let mut cookie_parts = vec![
        GOOGLE_SOCS_COOKIE_PAIR.to_string(),
        GOOGLE_CONSENT_COOKIE_PAIR.to_string(),
    ];

    cookie_parts.extend(
        user_cookie
            .split(';')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .filter(|part| {
                let lower = part.to_ascii_lowercase();
                !lower.starts_with("socs=") && !lower.starts_with("consent=")
            })
            .map(str::to_string),
    );

    cookie_parts.join("; ")
}

async fn google_cooldown_response_if_active() -> Option<axum::response::Response> {
    let state = google_proxy_backoff_state().lock().await;
    if state.cooldown_until <= std::time::Instant::now() {
        return None;
    }

    let remaining = state
        .cooldown_until
        .duration_since(std::time::Instant::now())
        .as_secs_f64()
        .ceil() as u64;
    let remaining = remaining.max(1);
    drop(state);

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", "application/json".parse().unwrap());
    headers.insert("Retry-After", remaining.to_string().parse().unwrap());

    Some(
        (
            StatusCode::TOO_MANY_REQUESTS,
            headers,
            Body::from(
                serde_json::json!({ "error": "Google 쿨다운 중", "retryAfterSeconds": remaining })
                    .to_string(),
            ),
        )
            .into_response(),
    )
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
static FFMPEG_CUT_CAPABILITY_READY: AtomicBool = AtomicBool::new(false);
static FFMPEG_CUT_CAPABILITY_SUPPORTED: AtomicBool = AtomicBool::new(false);

fn cached_health() -> &'static RwLock<CachedHealth> {
    CACHED_HEALTH.get_or_init(|| {
        RwLock::new(CachedHealth {
            services: vec![
                "ytdlp".to_string(),
                "download".to_string(),
                "frames".to_string(),
                "google-proxy".to_string(),
                "ffmpeg-cut".to_string(),
                "nle-install".to_string(),
            ],
            ytdlp_version: "loading...".to_string(),
        })
    })
}

fn update_ffmpeg_cut_capability_cache(supported: bool) {
    FFMPEG_CUT_CAPABILITY_SUPPORTED.store(supported, Ordering::Relaxed);
    FFMPEG_CUT_CAPABILITY_READY.store(true, Ordering::Relaxed);
}

fn read_ffmpeg_cut_capability_cache() -> (bool, bool) {
    (
        FFMPEG_CUT_CAPABILITY_READY.load(Ordering::Relaxed),
        FFMPEG_CUT_CAPABILITY_SUPPORTED.load(Ordering::Relaxed),
    )
}

/// 무거운 서비스 감지 — 서버 시작 시 + 5분 주기 백그라운드 실행
async fn detect_services() -> CachedHealth {
    let ytdlp_version = ytdlp::get_version()
        .await
        .unwrap_or_else(|_| "unknown".to_string());

    let mut services = vec![
        "ytdlp".to_string(),
        "download".to_string(),
        "frames".to_string(),
        "google-proxy".to_string(),
    ];
    let python = platform::python_cmd();

    // rembg
    if platform::async_cmd(python)
        .args(["-c", "import rembg"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        services.push("rembg".to_string());
    }
    // whisper
    let whisper_bin = if cfg!(target_os = "windows") {
        "whisper/whisper-cli.exe"
    } else {
        "whisper/whisper-cpp"
    };
    if dirs::data_dir()
        .map(|d| d.join("ytdlp-companion").join(whisper_bin).exists())
        .unwrap_or(false)
    {
        services.push("whisper".to_string());
    }
    // TTS (Qwen3 > Kokoro > Piper)
    if platform::async_cmd(python)
        .args(["-c", "from qwen_tts import Qwen3TTSModel; print('ok')"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
        || platform::async_cmd(python)
            .args(["-c", "from transformers import AutoTokenizer; print('ok')"])
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    {
        services.push("tts-qwen3".to_string());
    }
    if platform::async_cmd(python)
        .args(["-c", "from kokoro_onnx import Kokoro"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        services.push("tts-kokoro".to_string());
    } else {
        let piper_bin = if cfg!(target_os = "windows") {
            "piper/piper.exe"
        } else {
            "piper/piper"
        };
        if dirs::data_dir()
            .map(|d| d.join("ytdlp-companion").join(piper_bin).exists())
            .unwrap_or(false)
        {
            services.push("tts-piper".to_string());
        }
    }
    // NLE
    services.push("nle-install".to_string());
    // ffmpeg
    let ffmpeg_path = ytdlp::get_ffmpeg_path_public();
    let ffmpeg_cut_supported = platform::async_cmd(&ffmpeg_path)
        .args(["-version"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);
    update_ffmpeg_cut_capability_cache(ffmpeg_cut_supported);
    if ffmpeg_cut_supported {
        services.push("ffmpeg".to_string());
        services.push("ffmpeg-cut".to_string());
    }

    println!("[Companion] 서비스 감지 완료: {:?}", services);
    CachedHealth {
        services,
        ytdlp_version,
    }
}

/// Content-Disposition header-safe 파일명 생성
/// 비ASCII/제어문자/따옴표를 제거하여 header parse panic 방지
fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_' || *c == ' ')
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() || !trimmed.contains('.') {
        "download.mp4".to_string()
    } else {
        trimmed.to_string()
    }
}

fn estimate_wav_duration_seconds(wav_data: &[u8]) -> Option<f64> {
    if wav_data.len() < 12 || &wav_data[0..4] != b"RIFF" || &wav_data[8..12] != b"WAVE" {
        return None;
    }

    let mut offset = 12usize;
    let mut byte_rate: Option<u32> = None;
    let mut data_len: Option<u32> = None;

    while offset + 8 <= wav_data.len() {
        let chunk_id = wav_data.get(offset..offset + 4)?;
        let chunk_size =
            u32::from_le_bytes(wav_data.get(offset + 4..offset + 8)?.try_into().ok()?) as usize;
        let chunk_data_start = offset + 8;
        if chunk_data_start > wav_data.len() {
            break;
        }

        let available_size = chunk_size.min(wav_data.len().saturating_sub(chunk_data_start));
        if chunk_id == b"fmt " && available_size >= 16 {
            byte_rate = Some(u32::from_le_bytes(
                wav_data
                    .get(chunk_data_start + 8..chunk_data_start + 12)?
                    .try_into()
                    .ok()?,
            ));
        } else if chunk_id == b"data" {
            data_len = Some(available_size as u32);
        }

        offset = chunk_data_start + available_size + (chunk_size % 2);
    }

    let byte_rate = byte_rate?;
    if byte_rate == 0 {
        return None;
    }

    let data_len = data_len?;
    Some(f64::from(data_len) / f64::from(byte_rate))
}

fn is_allowed_host(host: &str, allowed_hosts: &[&str]) -> bool {
    allowed_hosts
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
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

#[derive(Serialize, Clone)]
struct FfmpegCapabilityResponse {
    ready: bool,
    pending: bool,
    supported: bool,
    #[serde(rename = "ffmpegCutSupported")]
    ffmpeg_cut_supported: bool,
    error: Option<String>,
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
    engine: Option<String>, // "qwen3" | "kokoro" | "auto"
    voice: Option<String>,  // 음성 ID (af_heart, Sohee 등)
}

#[derive(Deserialize)]
struct TtsCloneRequest {
    text: String,
    language: Option<String>,
    #[serde(rename = "voiceId")]
    voice_id: String, // "custom_voice_20260331_..." 형식
}

#[derive(Deserialize)]
struct SaveVoiceRequest {
    name: String,
    audio: String, // base64 인코딩된 WAV
}

#[derive(Deserialize)]
struct DeleteVoiceRequest {
    #[serde(rename = "voiceId")]
    voice_id: String,
}

#[derive(Deserialize)]
struct NleInstallRequest {
    target: String, // "capcut" | "premiere" | "filmora"
    #[serde(rename = "projectId")]
    project_id: String,
    files: Vec<NleFileEntry>, // 파일 목록 (경로 + base64 데이터)
    #[serde(rename = "launchApp")]
    launch_app: Option<bool>,
}

#[derive(Deserialize)]
struct NleFileEntry {
    path: String, // 상대 경로 (e.g., "draft_content.json")
    data: String, // base64 인코딩된 파일 데이터
    #[serde(rename = "isText")]
    is_text: Option<bool>, // true면 UTF-8 텍스트로 디코딩 후 경로 패치
}

#[derive(Deserialize)]
struct FfmpegTranscodeRequest {
    // base64 인코딩된 입력 파일
    input: String,
    #[serde(rename = "inputFormat")]
    input_format: Option<String>,
    #[serde(rename = "inputArgs")]
    input_args: Option<Vec<String>>,
    #[serde(rename = "outputFormat")]
    output_format: String,
    args: Option<Vec<String>>,
}

#[derive(Deserialize, Clone)]
struct FfmpegMergeTransition {
    preset: Option<String>,
    duration: Option<f64>,
}

#[derive(Deserialize)]
struct FfmpegMergeRequest {
    // base64 인코딩된 비디오 파일
    video: Option<String>,
    // base64 인코딩된 오디오 파일
    audio: Option<String>,
    // base64 인코딩된 장면 MP4 목록
    videos: Option<Vec<String>>,
    #[serde(rename = "videoFormat")]
    video_format: Option<String>,
    #[serde(rename = "audioFormat")]
    audio_format: Option<String>,
    #[serde(rename = "sceneDurations")]
    scene_durations: Option<Vec<f64>>,
    transitions: Option<Vec<FfmpegMergeTransition>>,
}

#[derive(Deserialize)]
struct FfmpegCutRequest {
    // base64 인코딩된 입력 파일
    input: String,
    #[serde(rename = "input_format", alias = "inputFormat")]
    input_format: Option<String>,
    clips: Vec<FfmpegCutClip>,
}

#[derive(Deserialize)]
struct FfmpegCutClip {
    label: String,
    #[serde(alias = "startSec")]
    start: f64,
    #[serde(alias = "endSec")]
    end: f64,
}

struct ValidatedFfmpegCutClip {
    filename: String,
    start: f64,
    end: f64,
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
struct NaverImageSearchRequest {
    query: String,
    #[serde(default = "default_display")]
    display: u32,
    #[serde(default = "default_start")]
    start: u32,
}
fn default_display() -> u32 {
    15
}
fn default_start() -> u32 {
    1
}

#[derive(Serialize)]
struct NaverImageResult {
    image_url: String,
    thumbnail_url: String,
    title: String,
    source: String,
    width: u32,
    height: u32,
    link: String,
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
        "http://localhost:5173"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://localhost:5174"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://localhost:5177"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://localhost:3000"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://127.0.0.1:5173"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://127.0.0.1:5174"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://127.0.0.1:5177"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "http://127.0.0.1:3000"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "https://all-in-one-production.pages.dev"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        // Tauri WebView 오리진 — 컴패니언 자체 UI에서 health 엔드포인트 접근용
        "tauri://localhost"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
        "https://tauri.localhost"
            .parse::<axum::http::HeaderValue>()
            .unwrap(),
    ];
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins.to_vec())
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_handler))
        // [v1.3.1] takeover — 새 헬퍼가 옛 헬퍼에게 종료 신호를 보내는 endpoint.
        // 같은 머신의 v1.3.1 이상 헬퍼만 호출. 인증은 같은 식별자 응답 + localhost 바인딩으로 충분.
        .route("/quit", post(quit_handler))
        // yt-dlp
        .route("/api/extract", get(extract_handler))
        .route("/api/download", get(download_handler))
        .route("/api/frames", post(frames_handler))
        .route("/api/social/metadata", post(social_metadata_handler))
        .route("/api/social/download", post(social_download_handler))
        // 구글 이미지 검색 프록시 (로컬 IP — 차단 없음)
        .route("/api/google-proxy", post(google_proxy_handler))
        // 네이버 이미지 검색 (한국 콘텐츠 전용 — API 키 불필요)
        .route("/api/naver-image-search", post(naver_image_search_handler))
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
        .route(
            "/api/tts/voices/custom/delete",
            post(tts_delete_voice_handler),
        )
        // NLE 직접 설치 (CapCut/Premiere/Filmora)
        .route("/api/nle/install", post(nle_install_handler))
        // FFmpeg 인코딩
        .route("/api/ffmpeg/capability", get(ffmpeg_capability_handler))
        .route("/api/ffmpeg/transcode", post(ffmpeg_transcode_handler))
        .route("/api/ffmpeg/merge", post(ffmpeg_merge_handler))
        .route("/api/ffmpeg/cut", post(ffmpeg_cut_handler))
        .layer(cors)
        // [FIX #846] Chrome 142+ / Edge 143+ Local Network Access 대응
        // HTTPS 페이지에서 127.0.0.1로 fetch 시 preflight에 이 헤더가 필요
        .layer(middleware::from_fn(lna_header_middleware))
        // base64 인코딩된 미디어 파일 수신 — 기본 2MB → 300MB로 확장
        // 200MB 원본은 base64 + JSON 오버헤드로 약 267MB까지 커질 수 있다.
        .layer(axum::extract::DefaultBodyLimit::max(300 * 1024 * 1024));

    // [FIX #846] IPv4 + IPv6 loopback 동시 바인딩
    // Windows에서 localhost가 ::1(IPv6)로 해석되면 IPv4 전용 서버에 연결 실패
    let addr_v4 = SocketAddr::from(([127, 0, 0, 1], 9876));
    println!("[Companion] 서버 시작: http://{}", addr_v4);

    // [FIX #914 + 6차] health 기본 캐시에는 ffmpeg-cut을 즉시 노출하고,
    // 실제 capability 감지는 서버 시작 직후 1회 + 5분마다 백그라운드 갱신.
    tokio::spawn(async {
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

fn sanitize_media_extension(ext: &str) -> Option<String> {
    let trimmed = ext.trim().trim_start_matches('.');
    if trimmed.is_empty() || trimmed.len() > 16 {
        return None;
    }
    trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric())
        .then(|| trimmed.to_ascii_lowercase())
}

fn sanitize_clip_stem(label: &str, index: usize) -> String {
    let sanitized: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if sanitized.is_empty() {
        format!("clip_{:03}", index + 1)
    } else {
        sanitized
    }
}

fn format_ffmpeg_seconds(seconds: f64) -> String {
    let mut formatted = format!("{seconds:.6}");
    while formatted.contains('.') && formatted.ends_with('0') {
        formatted.pop();
    }
    if formatted.ends_with('.') {
        formatted.pop();
    }
    if formatted.is_empty() {
        "0".to_string()
    } else {
        formatted
    }
}

fn validate_ffmpeg_cut_request(
    req: &FfmpegCutRequest,
) -> Result<(String, Vec<ValidatedFfmpegCutClip>), String> {
    use std::collections::HashSet;

    if req.clips.is_empty() {
        return Err("최소 1개 이상의 clip이 필요합니다.".to_string());
    }

    let input_ext = sanitize_media_extension(req.input_format.as_deref().unwrap_or("mp4"))
        .ok_or_else(|| "유효하지 않은 input_format 입니다.".to_string())?;

    let mut seen = HashSet::new();
    let mut clips = Vec::with_capacity(req.clips.len());
    for (index, clip) in req.clips.iter().enumerate() {
        if !clip.start.is_finite() || !clip.end.is_finite() {
            return Err(format!(
                "clip {}의 start/end 값이 올바르지 않습니다.",
                index + 1
            ));
        }
        if clip.start < 0.0 || clip.end <= clip.start {
            return Err(format!(
                "clip {}의 시간 범위가 올바르지 않습니다.",
                index + 1
            ));
        }

        let stem = sanitize_clip_stem(&clip.label, index);
        let mut filename = format!("{stem}.mp4");
        let mut duplicate_index = 2usize;
        while !seen.insert(filename.clone()) {
            filename = format!("{stem}_{duplicate_index}.mp4");
            duplicate_index += 1;
        }

        clips.push(ValidatedFfmpegCutClip {
            filename,
            start: clip.start,
            end: clip.end,
        });
    }

    Ok((input_ext, clips))
}

async fn run_ffmpeg_cut(
    ffmpeg: &std::path::Path,
    input_path: &std::path::Path,
    output_path: &std::path::Path,
    start: f64,
    end: f64,
) -> Result<(), String> {
    let copy_args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        format_ffmpeg_seconds(start),
        "-to".to_string(),
        format_ffmpeg_seconds(end),
        "-i".to_string(),
        input_path.to_string_lossy().to_string(),
        "-c".to_string(),
        "copy".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
        output_path.to_string_lossy().to_string(),
    ];

    if run_ffmpeg_command(ffmpeg, &copy_args).await.is_ok() {
        return Ok(());
    }

    let transcode_args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        format_ffmpeg_seconds(start),
        "-to".to_string(),
        format_ffmpeg_seconds(end),
        "-i".to_string(),
        input_path.to_string_lossy().to_string(),
        "-map".to_string(),
        "0:v:0?".to_string(),
        "-map".to_string(),
        "0:a:0?".to_string(),
        "-c:v".to_string(),
        "libx264".to_string(),
        "-preset".to_string(),
        "ultrafast".to_string(),
        "-pix_fmt".to_string(),
        "yuv420p".to_string(),
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "192k".to_string(),
        "-movflags".to_string(),
        "+faststart".to_string(),
        output_path.to_string_lossy().to_string(),
    ];

    run_ffmpeg_command(ffmpeg, &transcode_args)
        .await
        .map_err(|error| format!("stream copy 후 재인코딩 실패: {}", error))
}

async fn run_ffmpeg_command(ffmpeg: &std::path::Path, args: &[String]) -> Result<(), String> {
    let output = platform::async_cmd(ffmpeg)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("FFmpeg 실행 불가: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.lines().last().unwrap_or("unknown").to_string())
    }
}

fn push_zip_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_zip_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn zip_crc32(data: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

fn append_stored_zip_file(
    zip_bytes: &mut Vec<u8>,
    directory_entries: &mut Vec<Vec<u8>>,
    filename: &str,
    data: &[u8],
) -> Result<(), String> {
    let filename_bytes = filename.as_bytes();
    let filename_len = u16::try_from(filename_bytes.len())
        .map_err(|_| format!("파일명이 너무 깁니다: {}", filename))?;
    let data_len =
        u32::try_from(data.len()).map_err(|_| format!("클립 파일이 너무 큽니다: {}", filename))?;
    let local_header_offset =
        u32::try_from(zip_bytes.len()).map_err(|_| "ZIP 크기가 너무 큽니다.".to_string())?;
    let crc32 = zip_crc32(data);

    push_zip_u32(zip_bytes, 0x0403_4B50);
    push_zip_u16(zip_bytes, 20);
    push_zip_u16(zip_bytes, 0);
    push_zip_u16(zip_bytes, 0);
    push_zip_u16(zip_bytes, 0);
    push_zip_u16(zip_bytes, 0);
    push_zip_u32(zip_bytes, crc32);
    push_zip_u32(zip_bytes, data_len);
    push_zip_u32(zip_bytes, data_len);
    push_zip_u16(zip_bytes, filename_len);
    push_zip_u16(zip_bytes, 0);
    zip_bytes.extend_from_slice(filename_bytes);
    zip_bytes.extend_from_slice(data);

    let mut directory_entry = Vec::with_capacity(filename_bytes.len() + 46);
    push_zip_u32(&mut directory_entry, 0x0201_4B50);
    push_zip_u16(&mut directory_entry, 20);
    push_zip_u16(&mut directory_entry, 20);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u32(&mut directory_entry, crc32);
    push_zip_u32(&mut directory_entry, data_len);
    push_zip_u32(&mut directory_entry, data_len);
    push_zip_u16(&mut directory_entry, filename_len);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u16(&mut directory_entry, 0);
    push_zip_u32(&mut directory_entry, 0);
    push_zip_u32(&mut directory_entry, local_header_offset);
    directory_entry.extend_from_slice(filename_bytes);
    directory_entries.push(directory_entry);

    Ok(())
}

fn build_ffmpeg_cut_zip(
    output_dir: &std::path::Path,
    clips: &[ValidatedFfmpegCutClip],
) -> Result<Vec<u8>, String> {
    let mut zip_bytes = Vec::new();
    let mut directory_entries = Vec::with_capacity(clips.len());

    for clip in clips {
        let clip_path = output_dir.join(&clip.filename);
        let clip_data = std::fs::read(&clip_path)
            .map_err(|e| format!("클립 파일 읽기 실패 ({}): {}", clip.filename, e))?;
        append_stored_zip_file(
            &mut zip_bytes,
            &mut directory_entries,
            &clip.filename,
            &clip_data,
        )?;
    }

    let directory_offset =
        u32::try_from(zip_bytes.len()).map_err(|_| "ZIP 크기가 너무 큽니다.".to_string())?;
    for entry in &directory_entries {
        zip_bytes.extend_from_slice(entry);
    }
    let directory_size = u32::try_from(zip_bytes.len())
        .map_err(|_| "ZIP 크기가 너무 큽니다.".to_string())?
        .saturating_sub(directory_offset);
    let entry_count = u16::try_from(directory_entries.len())
        .map_err(|_| "클립 수가 너무 많습니다.".to_string())?;

    push_zip_u32(&mut zip_bytes, 0x0605_4B50);
    push_zip_u16(&mut zip_bytes, 0);
    push_zip_u16(&mut zip_bytes, 0);
    push_zip_u16(&mut zip_bytes, entry_count);
    push_zip_u16(&mut zip_bytes, entry_count);
    push_zip_u32(&mut zip_bytes, directory_size);
    push_zip_u32(&mut zip_bytes, directory_offset);
    push_zip_u16(&mut zip_bytes, 0);

    Ok(zip_bytes)
}

fn is_safe_simple_ffmpeg_value(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && !value.contains('/')
        && !value.contains('\\')
        && !value.starts_with('.')
        && value.chars().all(|c| !c.is_control())
        && value.len() < 128
}

fn is_safe_time_value(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() < 64
        && value
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == ':')
}

fn is_safe_rational_value(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() < 64
        && value
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == '/')
}

fn is_safe_map_value(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() < 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '[' | ']' | '?' | '_' | '.'))
}

fn is_safe_filter_value(value: &str) -> bool {
    const BLOCKED_TOKENS: &[&str] = &[
        "movie=",
        "amovie=",
        "fontfile=",
        "textfile=",
        "filename=",
        "sendcmd=",
        "zmq",
        "azmq",
    ];

    let lower = value.to_ascii_lowercase();
    !value.is_empty()
        && !value.starts_with('-')
        && value.len() < 4096
        && !BLOCKED_TOKENS.iter().any(|token| lower.contains(token))
        && value.chars().all(|c| !c.is_control())
}

fn is_safe_ffmpeg_value(flag: &str, value: &str) -> bool {
    if flag == "-vf" || flag == "-af" || flag.starts_with("-filter:") {
        return is_safe_filter_value(value);
    }
    if flag == "-map" {
        return is_safe_map_value(value);
    }
    if flag == "-ss" || flag == "-to" || flag == "-t" {
        return is_safe_time_value(value);
    }
    if flag == "-r" || flag == "-framerate" {
        return is_safe_rational_value(value);
    }
    is_safe_simple_ffmpeg_value(value)
}

fn is_valueless_ffmpeg_flag(flag: &str) -> bool {
    matches!(flag, "-an" | "-vn" | "-sn" | "-dn")
}

fn matches_allowed_ffmpeg_flag(arg: &str, pattern: &str) -> bool {
    if pattern.ends_with(':') {
        arg.starts_with(pattern)
    } else {
        arg == pattern
    }
}

fn append_safe_ffmpeg_args(
    target: &mut Vec<String>,
    source: &Option<Vec<String>>,
    allowed_prefixes: &[&str],
) {
    let mut pending_flag: Option<String> = None;
    let Some(args) = source else { return };
    for arg in args {
        if allowed_prefixes
            .iter()
            .any(|pattern| matches_allowed_ffmpeg_flag(arg, pattern))
        {
            target.push(arg.clone());
            pending_flag = if is_valueless_ffmpeg_flag(arg) {
                None
            } else {
                Some(arg.clone())
            };
            continue;
        }

        if let Some(flag) = pending_flag.take() {
            if is_safe_ffmpeg_value(&flag, arg) {
                target.push(arg.clone());
            }
        }
    }
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

/// [v1.3.1] /quit handler — 새 헬퍼가 옛 헬퍼에게 종료 신호를 보내는 endpoint.
///
/// 보안 모델 (Codex 6차 review 강화):
/// - 9876 포트는 127.0.0.1/[::1]에만 바인딩되어 있으므로 외부 호스트는 도달 불가.
/// - **X-Helper-Token 헤더 검증** — 같은 머신의 사용자만 접근 가능한 디스크 파일
///   (~/Library/Application Support/ytdlp-companion/quit-token, mode 0o600)에서
///   읽은 token과 일치해야 함. 악성 웹페이지는 이 파일을 읽을 수 없으므로 호출 불가.
/// - CORS allow-origin은 응답 read를 막지만, 요청 자체는 막지 못함 → token 인증으로 보완.
///
/// 흐름: token 검증 → 200 OK 응답 → 200ms 지연 → process::exit(0)
async fn quit_handler(headers: HeaderMap) -> Response {
    // 헤더에서 token 추출
    let provided_token = headers
        .get("x-helper-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // 디스크의 expected token 읽기
    let expected_token = match crate::takeover::read_quit_token() {
        Some(t) => t,
        None => {
            println!("[Companion] /quit 거부 — quit-token 파일 읽기 실패");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "app": "ytdlp-companion",
                    "error": "quit_token_unavailable",
                })),
            )
                .into_response();
        }
    };

    // 길이가 다르면 즉시 거부 (constant-time 비교는 single localhost 환경에서 과잉)
    if provided_token.len() != expected_token.len() || provided_token != expected_token {
        println!("[Companion] /quit 거부 — token 불일치");
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "app": "ytdlp-companion",
                "error": "invalid_token",
            })),
        )
            .into_response();
    }

    println!("[Companion] /quit 수신 (token 검증 통과) — 200ms 후 종료");
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        println!("[Companion] /quit 처리 완료, exit(0)");
        std::process::exit(0);
    });
    Json(serde_json::json!({
        "app": "ytdlp-companion",
        "status": "shutting_down",
        "version": env!("CARGO_PKG_VERSION"),
    }))
    .into_response()
}

fn build_ffmpeg_capability_response() -> FfmpegCapabilityResponse {
    let (ready, ffmpeg_cut_supported) = read_ffmpeg_cut_capability_cache();
    let pending = !ready;
    FfmpegCapabilityResponse {
        ready,
        pending,
        supported: ready && ffmpeg_cut_supported,
        ffmpeg_cut_supported,
        error: if pending {
            Some("FFmpeg capability 확인 중".to_string())
        } else if !ffmpeg_cut_supported {
            Some("FFmpeg 실행 불가".to_string())
        } else {
            None
        },
    }
}

fn ffmpeg_capability_into_response(capability: FfmpegCapabilityResponse) -> Response {
    if capability.supported {
        Json(capability).into_response()
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, Json(capability)).into_response()
    }
}

async fn ffmpeg_capability_handler() -> Response {
    ffmpeg_capability_into_response(build_ffmpeg_capability_response())
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
        )
            .into_response(),
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
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": format!("파일 열기 실패: {}", e) })),
                    )
                        .into_response()
                }
            };

            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            // 파일명에 비ASCII/특수문자 → ASCII-safe 폴백
            let safe_filename = sanitize_filename(&downloaded.filename);
            let mut headers = HeaderMap::new();
            headers.insert(
                "Content-Type",
                downloaded
                    .content_type
                    .parse()
                    .unwrap_or("video/mp4".parse().unwrap()),
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
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/frames
// ──────────────────────────────────────────────

async fn frames_handler(Json(req): Json<FramesRequest>) -> impl IntoResponse {
    let width = req.w.unwrap_or(640);
    match ytdlp::extract_frames(&req.url, &req.timecodes, width).await {
        Ok(frames) => (
            StatusCode::OK,
            Json(serde_json::json!({ "frames": frames })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
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
        )
            .into_response(),
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
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": format!("파일 열기 실패: {}", e) })),
                    )
                        .into_response()
                }
            };

            let stream = ReaderStream::new(file);
            let body = Body::from_stream(stream);

            let safe_filename = sanitize_filename(&downloaded.filename);
            let mut headers = HeaderMap::new();
            headers.insert(
                "Content-Type",
                downloaded
                    .content_type
                    .parse()
                    .unwrap_or("video/mp4".parse().unwrap()),
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
            let _ = &downloaded._tmp_dir;
            response
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/remove-bg (rembg 로컬)
// ──────────────────────────────────────────────

async fn remove_bg_handler(Json(req): Json<RemoveBgRequest>) -> impl IntoResponse {
    use base64::Engine;
    let image_data = match base64::engine::general_purpose::STANDARD.decode(&req.image) {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) })),
            )
                .into_response()
        }
    };

    match rembg::remove_background(&image_data).await {
        Ok(result) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&result);
            Json(serde_json::json!({ "image": b64, "format": "png" })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/transcribe (whisper.cpp 로컬)
// ──────────────────────────────────────────────

async fn transcribe_handler(Json(req): Json<TranscribeRequest>) -> impl IntoResponse {
    use base64::Engine;
    let audio_data = match base64::engine::general_purpose::STANDARD.decode(&req.audio) {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) })),
            )
                .into_response()
        }
    };

    match whisper::transcribe(&audio_data, req.language.as_deref()).await {
        Ok(result) => Json(serde_json::json!(result)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/tts (Piper TTS 로컬)
// ──────────────────────────────────────────────

async fn tts_handler(Json(req): Json<TtsRequest>) -> impl IntoResponse {
    let normalized_engine = match req.engine.as_deref() {
        Some("qwen3") => Some("cosyvoice"),
        Some("kokoro") => Some("edge"),
        other => other,
    };
    let normalized_voice = match (req.engine.as_deref(), req.voice.as_deref()) {
        (Some("qwen3"), Some("Sohee")) | (Some("kokoro"), Some("af_heart")) => None,
        (_, other) => other,
    };

    match tts::synthesize_speech(
        &req.text,
        req.language.as_deref(),
        normalized_engine,
        normalized_voice,
    )
    .await
    {
        Ok(wav_data) => {
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "audio/wav".parse().unwrap());
            headers.insert(
                "Content-Length",
                wav_data.len().to_string().parse().unwrap(),
            );
            (StatusCode::OK, headers, Body::from(wav_data)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
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
    let voice_entry = voices
        .iter()
        .find(|v| v["id"].as_str() == Some(&req.voice_id));
    let ref_path = match voice_entry.and_then(|v| v["filePath"].as_str()) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": format!("커스텀 음성 '{}' 을(를) 찾을 수 없습니다", req.voice_id)
                })),
            )
                .into_response()
        }
    };

    match tts::clone_voice_tts(&req.text, &ref_path, req.language.as_deref()).await {
        Ok(wav_data) => {
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", "audio/wav".parse().unwrap());
            headers.insert(
                "Content-Length",
                wav_data.len().to_string().parse().unwrap(),
            );
            (StatusCode::OK, headers, Body::from(wav_data)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": e.to_string()
            })),
        )
            .into_response(),
    }
}

/// GET /api/tts/voices/custom — 저장된 커스텀 음성 목록
async fn tts_custom_voices_handler() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "voices": tts::list_custom_voices() }))
}

/// POST /api/tts/voices/custom/save — 참조 음성 저장
async fn tts_save_voice_handler(Json(req): Json<SaveVoiceRequest>) -> impl IntoResponse {
    let trimmed_name = req.name.trim();
    if trimmed_name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "음성 이름을 입력해주세요."
            })),
        )
            .into_response();
    }

    // base64 → bytes
    let wav_data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &req.audio) {
            Ok(data) => data,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "error": format!("base64 디코딩 실패: {}", e)
                    })),
                )
                    .into_response()
            }
        };

    if wav_data.len() < 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "오디오 파일이 너무 작습니다 (최소 3초 이상 녹음해주세요)"
            })),
        )
            .into_response();
    }

    let duration_sec = match estimate_wav_duration_seconds(&wav_data) {
        Some(duration_sec) => duration_sec,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "유효한 WAV 파일만 업로드할 수 있습니다."
                })),
            )
                .into_response();
        }
    };
    if duration_sec < 3.0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "오디오가 너무 짧습니다. 3초 이상 녹음한 샘플을 업로드해주세요."
            })),
        )
            .into_response();
    }

    match tts::save_custom_voice(trimmed_name, &wav_data) {
        Ok(voice_id) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "voiceId": voice_id,
                "name": trimmed_name,
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": e
            })),
        )
            .into_response(),
    }
}

/// POST /api/tts/voices/custom/delete — 커스텀 음성 삭제
async fn tts_delete_voice_handler(Json(req): Json<DeleteVoiceRequest>) -> impl IntoResponse {
    match tts::delete_custom_voice(&req.voice_id) {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response(),
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
        && req
            .project_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !id_valid {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "유효하지 않은 프로젝트 ID — 영숫자, 하이픈, 언더스코어만 허용 (최대 80자)" }))).into_response();
    }

    // 대상 NLE에 따라 설치 경로 결정
    let install_root = match req.target.as_str() {
        "capcut" => {
            if cfg!(target_os = "macos") {
                dirs::home_dir()
                    .unwrap_or_default()
                    .join("Movies/CapCut/User Data/Projects/com.lveditor.draft")
            } else {
                // Windows: %LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft
                dirs::data_local_dir()
                    .unwrap_or_default()
                    .join("CapCut/User Data/Projects/com.lveditor.draft")
            }
        }
        "premiere" | "filmora" => {
            // 문서 폴더에 저장
            dirs::document_dir()
                .unwrap_or_else(|| dirs::home_dir().unwrap_or_default())
                .join("All In One NLE Export")
        }
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("지원하지 않는 NLE: {}", req.target) })),
            )
                .into_response();
        }
    };

    let project_dir = install_root.join(&req.project_id);

    // 폴더 생성
    if let Err(e) = std::fs::create_dir_all(&project_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("폴더 생성 실패: {}", e) })),
        )
            .into_response();
    }

    // Windows에서 역슬래시를 슬래시로 정규화 (JSON 문자열 내 escape 문제 방지)
    let project_path_str = project_dir.to_string_lossy().to_string().replace('\\', "/");
    let root_path_str = install_root
        .to_string_lossy()
        .to_string()
        .replace('\\', "/");
    let placeholder = format!("##_draftpath_placeholder_{}_##", req.project_id);

    let mut installed_count = 0;

    // 파일 쓰기
    for entry in &req.files {
        // 경로 검증 (경로 탐색 방지 — 절대경로, .., 제어문자 차단)
        if entry.path.contains("..")
            || entry.path.starts_with('/')
            || entry.path.starts_with('\\')
            || entry.path.contains(':')
            || entry.path.chars().any(|c| c.is_control())
        {
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
                let fold_re = regex_lite::Regex::new(r#""draft_fold_path":"[^"]*""#)
                    .unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = fold_re
                    .replace_all(
                        &text,
                        &format!("\"draft_fold_path\":\"{}\"", project_path_str),
                    )
                    .to_string();
                let root_re = regex_lite::Regex::new(r#""draft_root_path":"[^"]*""#)
                    .unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = root_re
                    .replace_all(&text, &format!("\"draft_root_path\":\"{}\"", root_path_str))
                    .to_string();
                // draft_materials_copy_folder 패치 (CapCut이 미디어 복사 시 참조)
                let copy_folder_re =
                    regex_lite::Regex::new(r#""draft_materials_copy_folder":"[^"]*""#)
                        .unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = copy_folder_re
                    .replace_all(
                        &text,
                        &format!(
                            "\"draft_materials_copy_folder\":\"{}/materials\"",
                            project_path_str
                        ),
                    )
                    .to_string();
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
                            {
                                let _ = tokio::process::Command::new("open").arg(&path).spawn();
                            }
                            #[cfg(target_os = "windows")]
                            {
                                let _ = platform::async_cmd("cmd")
                                    .args(["/c", "start", "", &path.to_string_lossy()])
                                    .spawn();
                            }
                            break;
                        }
                    }
                }
            }
            _ => {}
        }
    }

    println!(
        "[NLE] {} 프로젝트 설치 완료: {} ({}개 파일)",
        req.target, project_path_str, installed_count
    );

    Json(serde_json::json!({
        "success": true,
        "installedPath": project_path_str,
        "filesInstalled": installed_count,
        "target": req.target,
    }))
    .into_response()
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
                                entries
                                    .filter_map(|e| e.ok())
                                    .find(|e| e.file_name().to_string_lossy().ends_with(".app"))
                                    .map(|e| {
                                        format!(
                                            "{}/{}",
                                            entry_path,
                                            e.file_name().to_string_lossy()
                                        )
                                    })
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
                        folder_name
                            .strip_prefix("Adobe Premiere Pro ")
                            .map(|y| premiere_year_to_version(y))
                    })
                    .unwrap_or_else(|| "26.0.0".to_string());

                println!(
                    "[NLE] Premiere 감지: entry={}, bundle={}, version={}",
                    entry_path, bundle_path, version
                );
                return Some((app_path, version));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // C:\Program Files\Adobe\Adobe Premiere Pro *
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
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
                let version = latest
                    .strip_prefix("Adobe Premiere Pro ")
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
            2020 => 14,
            2021 => 15,
            2022 => 22,
            2023 => 23,
            y if y >= 2024 => y - 2000, // 2024=24, 2025=25, 2026=26
            _ => 26,                    // 알 수 없는 연도 → 최신 기본값
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

    let entries =
        std::fs::read_dir(project_dir).map_err(|e| format!("디렉토리 읽기 실패: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "prproj").unwrap_or(false) {
            println!("[NLE] prproj 패치 시작: {}", path.display());

            // 1. 읽기 + gunzip
            let gz_bytes = std::fs::read(&path).map_err(|e| format!("prproj 읽기 실패: {}", e))?;
            let mut decoder = GzDecoder::new(&gz_bytes[..]);
            let mut xml = String::new();
            decoder
                .read_to_string(&mut xml)
                .map_err(|e| format!("prproj gunzip 실패: {}", e))?;

            // 2. 절대경로 제거/치환

            // /Applications/Adobe Premiere Pro 2025/... → 제거
            // PresetPath, ProxyWatermarkDefaultImageFullPath는 Premiere가 실행 시 자동 재설정하므로
            // 경로 재구성을 시도하지 않고 안전하게 비운다.
            let full_premiere_path_re =
                regex_lite::Regex::new(r"/Applications/Adobe Premiere Pro [^<]+").unwrap();
            xml = full_premiere_path_re.replace_all(&xml, "").to_string();

            // /Users/xxx/... 절대경로 제거 (태그 내용만)
            let user_path_re =
                regex_lite::Regex::new(r"(?:>)(/Users/[^<]+|[A-Z]:\\Users\\[^<]+)(</)").unwrap();
            xml = user_path_re.replace_all(&xml, ">$2").to_string();

            // ConformedAudioPath, PeakFilePath 태그 전체 제거
            // (역참조 \1 미지원 — 태그별 개별 regex 사용)
            let conformed_re =
                regex_lite::Regex::new(r"<ConformedAudioPath>[^<]*</ConformedAudioPath>\s*")
                    .unwrap();
            let peak_re = regex_lite::Regex::new(r"<PeakFilePath>[^<]*</PeakFilePath>\s*").unwrap();
            xml = conformed_re.replace_all(&xml, "").to_string();
            xml = peak_re.replace_all(&xml, "").to_string();

            // 3. 파일명만 있는 경로를 절대경로로 변환 (Premiere는 절대경로만 자동 링크)
            // regex_lite가 한글 파일명 + backreference 조합에서 실패하므로,
            // 프로젝트 폴더의 실제 미디어 파일을 스캔하여 직접 문자열 교체
            {
                let abs_project_path = project_dir.to_string_lossy().to_string().replace('\\', "/");
                let media_extensions = [
                    "mp4", "mov", "avi", "mkv", "webm", "m4v", "ts", "flv", "wmv", "mp3", "wav",
                    "aac", "m4a", "ogg", "flac", "wma",
                ];

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
                println!(
                    "[NLE] prproj 미디어 경로 → 절대경로 변환: {}/{} 파일",
                    abs_project_path,
                    media_files.len()
                );
            }

            // 4. MZ.BuildVersion 갱신
            if let Some((_, ref ver)) = premiere_info {
                let now = chrono::Local::now().format("%a %b %e %T %Y").to_string();
                let build_ver = format!("{}x0 - {}", ver, now);
                let created_re = regex_lite::Regex::new(
                    r"<MZ\.BuildVersion\.Created>[^<]*</MZ\.BuildVersion\.Created>",
                )
                .unwrap();
                let modified_re = regex_lite::Regex::new(
                    r"<MZ\.BuildVersion\.Modified>[^<]*</MZ\.BuildVersion\.Modified>",
                )
                .unwrap();
                xml = created_re
                    .replace_all(
                        &xml,
                        &format!(
                            "<MZ.BuildVersion.Created>{}</MZ.BuildVersion.Created>",
                            build_ver
                        ),
                    )
                    .to_string();
                xml = modified_re
                    .replace_all(
                        &xml,
                        &format!(
                            "<MZ.BuildVersion.Modified>{}</MZ.BuildVersion.Modified>",
                            build_ver
                        ),
                    )
                    .to_string();
            }

            // 4. gzip 압축 + 저장
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder
                .write_all(xml.as_bytes())
                .map_err(|e| format!("prproj gzip 실패: {}", e))?;
            let mut gz_out = encoder
                .finish()
                .map_err(|e| format!("prproj gzip finish 실패: {}", e))?;
            // Premiere는 gzip OS byte로 0x13을 기대한다.
            // 브라우저 생성본을 companion이 다시 gzip 하더라도 동일 헤더를 유지해야 저장 에러가 재발하지 않는다.
            if gz_out.len() >= 10 {
                gz_out[9] = 0x13;
            }

            std::fs::write(&path, &gz_out).map_err(|e| format!("prproj 저장 실패: {}", e))?;

            println!(
                "[NLE] prproj 패치 완료: {} ({}→{} bytes)",
                path.display(),
                gz_bytes.len(),
                gz_out.len()
            );
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
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) })),
            )
                .into_response()
        }
    };

    let in_ext = match sanitize_media_extension(req.input_format.as_deref().unwrap_or("mp4")) {
        Some(ext) => ext,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "유효하지 않은 inputFormat 입니다." })),
            )
                .into_response()
        }
    };
    let out_ext = match sanitize_media_extension(&req.output_format) {
        Some(ext) => ext,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "유효하지 않은 outputFormat 입니다." })),
            )
                .into_response()
        }
    };
    let tmp_input = match tempfile::Builder::new()
        .suffix(&format!(".{}", in_ext))
        .tempfile()
    {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
            )
                .into_response()
        }
    };
    let tmp_output = match tempfile::Builder::new()
        .suffix(&format!(".{}", out_ext))
        .tempfile()
    {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
            )
                .into_response()
        }
    };

    let input_path = tmp_input.path().to_string_lossy().to_string();
    let output_path = tmp_output.path().to_string_lossy().to_string();

    if let Err(e) = std::fs::write(&input_path, &input_data) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("파일 쓰기 실패: {}", e) })),
        )
            .into_response();
    }

    // 허용된 ffmpeg 인자만 통과 (인젝션 + 임의 파일 쓰기 방지)
    const INPUT_ALLOWED_PREFIXES: &[&str] = &["-loop", "-framerate", "-f"];
    const ALLOWED_PREFIXES: &[&str] = &[
        "-c:",
        "-codec:",
        "-b:",
        "-r",
        "-s",
        "-vf",
        "-af",
        "-filter:",
        "-preset",
        "-crf",
        "-qp",
        "-ar",
        "-ac",
        "-t",
        "-ss",
        "-to",
        "-map",
        "-threads",
        "-pix_fmt",
        "-movflags",
        "-f",
        "-an",
        "-vn",
        "-sn",
        "-dn",
    ];

    let mut args = Vec::new();
    append_safe_ffmpeg_args(&mut args, &req.input_args, INPUT_ALLOWED_PREFIXES);
    args.push("-i".to_string());
    args.push(input_path);
    args.push("-y".to_string());
    append_safe_ffmpeg_args(&mut args, &req.args, ALLOWED_PREFIXES);
    args.push(output_path.clone());

    let ffmpeg = ytdlp::get_ffmpeg_path_public();
    let output = platform::async_cmd(&ffmpeg).args(&args).output().await;

    match output {
        Ok(out) if out.status.success() => match std::fs::read(&output_path) {
            Ok(data) => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                Json(serde_json::json!({ "data": b64, "format": out_ext, "size": data.len() }))
                    .into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("결과 파일 읽기 실패: {}", e) })),
            )
                .into_response(),
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg 실패: {}", stderr.lines().last().unwrap_or("unknown")) }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("FFmpeg 실행 불가: {}", e) })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/ffmpeg/merge
// - video + audio 합본
// - scene MP4 여러 개 concat / xfade
// ──────────────────────────────────────────────

fn to_xfade_transition(preset: &str) -> &'static str {
    match preset {
        "fade" => "fadeblack",
        "fadeWhite" => "fadewhite",
        "dissolve" => "dissolve",
        "wipeLeft" => "wipeleft",
        "wipeRight" => "wiperight",
        "wipeUp" => "wipeup",
        "wipeDown" => "wipedown",
        "slideLeft" => "slideleft",
        "slideRight" => "slideright",
        "slideUp" => "slideup",
        "slideDown" => "slidedown",
        "coverLeft" => "coverleft",
        "coverRight" => "coverright",
        "circleOpen" => "circleopen",
        "circleClose" => "circleclose",
        "radial" => "radial",
        "diagBR" => "diagbr",
        "diagTL" => "diagtl",
        "zoomIn" => "zoomin",
        "zoomOut" => "fadeblack",
        "flipX" => "horzopen",
        "flipY" => "vertopen",
        "smoothLeft" => "smoothleft",
        "smoothRight" => "smoothright",
        "blur" => "hblur",
        "pixelate" => "pixelize",
        "squeezH" => "squeezeh",
        "flash" => "fadewhite",
        "glitch" => "dissolve",
        _ => "",
    }
}

async fn ffmpeg_merge_handler(Json(req): Json<FfmpegMergeRequest>) -> impl IntoResponse {
    use base64::Engine;

    let ffmpeg = ytdlp::get_ffmpeg_path_public();
    let vid_ext = match sanitize_media_extension(req.video_format.as_deref().unwrap_or("mp4")) {
        Some(ext) => ext,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "유효하지 않은 videoFormat 입니다." })),
            )
                .into_response()
        }
    };
    let aud_ext = match sanitize_media_extension(req.audio_format.as_deref().unwrap_or("m4a")) {
        Some(ext) => ext,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "유효하지 않은 audioFormat 입니다." })),
            )
                .into_response()
        }
    };

    if let (Some(video_b64), Some(audio_b64)) = (&req.video, &req.audio) {
        let video_data =
            match base64::engine::general_purpose::STANDARD.decode(video_b64) {
                Ok(d) => d,
                Err(e) => return (
                    StatusCode::BAD_REQUEST,
                    Json(
                        serde_json::json!({ "error": format!("비디오 Base64 디코딩 실패: {}", e) }),
                    ),
                )
                    .into_response(),
            };
        let audio_data =
            match base64::engine::general_purpose::STANDARD.decode(audio_b64) {
                Ok(d) => d,
                Err(e) => return (
                    StatusCode::BAD_REQUEST,
                    Json(
                        serde_json::json!({ "error": format!("오디오 Base64 디코딩 실패: {}", e) }),
                    ),
                )
                    .into_response(),
            };

        let tmp_video = match tempfile::Builder::new()
            .suffix(&format!(".{}", vid_ext))
            .tempfile()
        {
            Ok(f) => f,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
                )
                    .into_response()
            }
        };
        let tmp_audio = match tempfile::Builder::new()
            .suffix(&format!(".{}", aud_ext))
            .tempfile()
        {
            Ok(f) => f,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
                )
                    .into_response()
            }
        };
        let tmp_output = match tempfile::Builder::new().suffix(".mp4").tempfile() {
            Ok(f) => f,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
                )
                    .into_response()
            }
        };

        let video_path = tmp_video.path().to_string_lossy().to_string();
        let audio_path = tmp_audio.path().to_string_lossy().to_string();
        let output_path = tmp_output.path().to_string_lossy().to_string();
        if let Err(e) = std::fs::write(&video_path, &video_data) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("비디오 파일 쓰기 실패: {}", e) })),
            )
                .into_response();
        }
        if let Err(e) = std::fs::write(&audio_path, &audio_data) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("오디오 파일 쓰기 실패: {}", e) })),
            )
                .into_response();
        }

        let args = vec![
            "-i".to_string(),
            video_path,
            "-i".to_string(),
            audio_path,
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a:0".to_string(),
            "-c:v".to_string(),
            "copy".to_string(),
            "-c:a".to_string(),
            "copy".to_string(),
            "-shortest".to_string(),
            "-movflags".to_string(),
            "+faststart".to_string(),
            "-y".to_string(),
            output_path.clone(),
        ];
        println!(
            "[FFmpeg] merge 실행: video({} bytes) + audio({} bytes)",
            video_data.len(),
            audio_data.len()
        );
        let output = platform::async_cmd(&ffmpeg).args(&args).output().await;

        return match output {
            Ok(out) if out.status.success() => match std::fs::read(&output_path) {
                Ok(data) => {
                    println!("[FFmpeg] ✅ merge 성공: {} bytes", data.len());
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    Json(serde_json::json!({ "data": b64, "format": "mp4", "size": data.len() }))
                        .into_response()
                }
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("결과 파일 읽기 실패: {}", e) })),
                )
                    .into_response(),
            },
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr);
                println!(
                    "[FFmpeg] ❌ merge 실패: {}",
                    stderr.lines().last().unwrap_or("unknown")
                );
                (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg merge 실패: {}", stderr.lines().last().unwrap_or("unknown")) }))).into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("FFmpeg 실행 불가: {}", e) })),
            )
                .into_response(),
        };
    }

    let Some(videos_b64) = &req.videos else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "video+audio 또는 videos 배열이 필요합니다." })),
        )
            .into_response();
    };
    if videos_b64.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "concat할 videos가 비어 있습니다." })),
        )
            .into_response();
    }

    let mut temp_videos = Vec::new();
    let mut video_paths = Vec::new();
    for (idx, video_b64) in videos_b64.iter().enumerate() {
        let video_data = match base64::engine::general_purpose::STANDARD.decode(video_b64) {
            Ok(d) => d,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": format!("장면 {} Base64 디코딩 실패: {}", idx + 1, e) })),
                )
                    .into_response()
            }
        };
        let tmp_video = match tempfile::Builder::new()
            .suffix(&format!(".{}", vid_ext))
            .tempfile()
        {
            Ok(f) => f,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
                )
                    .into_response()
            }
        };
        let video_path = tmp_video.path().to_string_lossy().to_string();
        if let Err(e) = std::fs::write(&video_path, &video_data) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("장면 {} 파일 쓰기 실패: {}", idx + 1, e) })),
            )
                .into_response();
        }
        temp_videos.push(tmp_video);
        video_paths.push(video_path);
    }

    let tmp_output = match tempfile::Builder::new().suffix(".mp4").tempfile() {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("임시 파일 생성 실패: {}", e) })),
            )
                .into_response()
        }
    };
    let output_path = tmp_output.path().to_string_lossy().to_string();

    let scene_durations = req.scene_durations.clone().unwrap_or_default();
    let transitions = req.transitions.clone().unwrap_or_default();
    let has_transitions = !scene_durations.is_empty()
        && scene_durations.len() == video_paths.len()
        && transitions.iter().any(|transition| {
            transition.preset.as_deref().unwrap_or("none") != "none"
                && transition.duration.unwrap_or(0.0) > 0.0
        })
        && video_paths.len() >= 2;

    let output = if has_transitions {
        let mut args = Vec::new();
        for path in &video_paths {
            args.push("-i".to_string());
            args.push(path.clone());
        }

        let mut filter_parts = Vec::new();
        let mut prev_label = "[0:v]".to_string();
        let mut cumulative_duration = scene_durations[0].max(0.5);
        for i in 0..(video_paths.len() - 1) {
            let transition = transitions
                .get(i)
                .cloned()
                .unwrap_or(FfmpegMergeTransition {
                    preset: Some("none".to_string()),
                    duration: Some(0.0),
                });
            let preset = transition.preset.unwrap_or_else(|| "none".to_string());
            let transition_name = to_xfade_transition(&preset);
            let transition_duration = transition.duration.unwrap_or(0.0).max(0.0);
            let out_label = if i == video_paths.len() - 2 {
                "[vout]".to_string()
            } else {
                format!("[v{}]", i)
            };
            let next_input = format!("[{}:v]", i + 1);

            if !transition_name.is_empty() && transition_duration > 0.0 {
                let offset = (cumulative_duration - transition_duration).max(0.0);
                filter_parts.push(format!(
                    "{}{}xfade=transition={}:duration={:.2}:offset={:.3}{}",
                    prev_label, next_input, transition_name, transition_duration, offset, out_label
                ));
                cumulative_duration = offset + scene_durations[i + 1].max(0.5);
            } else {
                filter_parts.push(format!(
                    "{}{}concat=n=2:v=1:a=0{}",
                    prev_label, next_input, out_label
                ));
                cumulative_duration += scene_durations[i + 1].max(0.5);
            }

            prev_label = out_label;
        }

        args.push("-filter_complex".to_string());
        args.push(filter_parts.join(";"));
        args.push("-map".to_string());
        args.push("[vout]".to_string());
        args.push("-c:v".to_string());
        args.push("libx264".to_string());
        args.push("-pix_fmt".to_string());
        args.push("yuv420p".to_string());
        args.push("-preset".to_string());
        args.push("ultrafast".to_string());
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());
        args.push("-y".to_string());
        args.push(output_path.clone());
        println!("[FFmpeg] xfade concat 실행: {}개 장면", video_paths.len());
        platform::async_cmd(&ffmpeg).args(&args).output().await
    } else {
        let tmp_concat =
            match tempfile::Builder::new().suffix(".txt").tempfile() {
                Ok(f) => f,
                Err(e) => return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("concat 리스트 생성 실패: {}", e) })),
                )
                    .into_response(),
            };
        let concat_path = tmp_concat.path().to_string_lossy().to_string();
        let concat_list = video_paths
            .iter()
            .map(|path| format!("file '{}'", path.replace('\'', "'\\''")))
            .collect::<Vec<_>>()
            .join("\n");
        if let Err(e) = std::fs::write(&concat_path, concat_list) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("concat 리스트 쓰기 실패: {}", e) })),
            )
                .into_response();
        }
        let args = vec![
            "-f".to_string(),
            "concat".to_string(),
            "-safe".to_string(),
            "0".to_string(),
            "-i".to_string(),
            concat_path,
            "-c".to_string(),
            "copy".to_string(),
            "-movflags".to_string(),
            "+faststart".to_string(),
            "-y".to_string(),
            output_path.clone(),
        ];
        println!("[FFmpeg] concat 실행: {}개 장면", video_paths.len());
        let output = platform::async_cmd(&ffmpeg).args(&args).output().await;
        drop(tmp_concat);
        output
    };

    match output {
        Ok(out) if out.status.success() => match std::fs::read(&output_path) {
            Ok(data) => {
                println!("[FFmpeg] ✅ concat 성공: {} bytes", data.len());
                let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                Json(serde_json::json!({ "data": b64, "format": "mp4", "size": data.len() }))
                    .into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("결과 파일 읽기 실패: {}", e) })),
            )
                .into_response(),
        },
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            println!(
                "[FFmpeg] ❌ concat 실패: {}",
                stderr.lines().last().unwrap_or("unknown")
            );
            (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("FFmpeg concat 실패: {}", stderr.lines().last().unwrap_or("unknown")) }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("FFmpeg 실행 불가: {}", e) })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/ffmpeg/cut (구간별 MP4 컷 + ZIP 패키징)
// 기존 ALLOWED_PREFIXES 패턴과 동일하게 사용자 입력을 ffmpeg 인자로 직접 통과시키지 않고
// 시간/라벨만 검증한 뒤 서버가 고정된 안전한 인자 조합을 생성한다.
// ──────────────────────────────────────────────

async fn ffmpeg_cut_handler(Json(req): Json<FfmpegCutRequest>) -> impl IntoResponse {
    use base64::Engine;

    if req.input.trim().is_empty() {
        return ffmpeg_capability_into_response(build_ffmpeg_capability_response());
    }

    let input_data = match base64::engine::general_purpose::STANDARD.decode(&req.input) {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) })),
            )
                .into_response()
        }
    };

    let (input_ext, clips) = match validate_ffmpeg_cut_request(&req) {
        Ok(validated) => validated,
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": error })),
            )
                .into_response()
        }
    };

    let temp_dir = match tempfile::Builder::new().prefix("ffmpeg-cut-").tempdir() {
        Ok(dir) => dir,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("임시 디렉터리 생성 실패: {}", e) })),
            )
                .into_response()
        }
    };
    let input_path = temp_dir.path().join(format!("input.{input_ext}"));
    if let Err(e) = std::fs::write(&input_path, &input_data) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("입력 파일 쓰기 실패: {}", e) })),
        )
            .into_response();
    }

    let ffmpeg = ytdlp::get_ffmpeg_path_public();
    for clip in &clips {
        let output_path = temp_dir.path().join(&clip.filename);
        if let Err(error) =
            run_ffmpeg_cut(&ffmpeg, &input_path, &output_path, clip.start, clip.end).await
        {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("FFmpeg cut 실패 ({}): {}", clip.filename, error)
                })),
            )
                .into_response();
        }
    }

    match build_ffmpeg_cut_zip(temp_dir.path(), &clips) {
        Ok(zip_bytes) => {
            let b64 = base64::engine::general_purpose::STANDARD.encode(&zip_bytes);
            Json(serde_json::json!({
                "data": b64,
                "format": "zip",
                "size": zip_bytes.len(),
                "clipCount": clips.len(),
            }))
            .into_response()
        }
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/google-proxy (로컬 IP로 구글 검색)
// [FIX] 싱글톤 Client + SOCS 쿠키 + Sec-Ch-UA + 요청 간격 강제
// ──────────────────────────────────────────────

async fn google_proxy_handler(Json(req): Json<GoogleProxyRequest>) -> impl IntoResponse {
    // URL 허용 목록 (구글 이미지 + YouTube 자막 + Wikimedia)
    let allowed_hosts = [
        "www.google.com",
        "www.google.co.kr",
        "en.wikipedia.org",
        "commons.wikimedia.org",
        "www.youtube.com",
    ];
    let parsed = url::Url::parse(&req.target_url).ok();
    let host = parsed
        .as_ref()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_default();
    if !is_allowed_host(&host, &allowed_hosts) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": format!("허용되지 않은 호스트: {}", host) })),
        )
            .into_response();
    }

    let is_google = host.contains("google.com") || host.contains("google.co.kr");
    let _google_request_guard = if is_google {
        Some(GOOGLE_REQUEST_GATE.lock().await)
    } else {
        None
    };

    // [FIX] Google 요청에 대해 백오프 + 페이싱 적용
    if is_google {
        if let Some(response) = google_cooldown_response_if_active().await {
            return response;
        }
        enforce_google_request_spacing().await;
        if let Some(response) = google_cooldown_response_if_active().await {
            return response;
        }
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
            .header(
                "Sec-Ch-Ua",
                "\"Chromium\";v=\"136\", \"Not_A Brand\";v=\"24\"",
            )
            .header("Sec-Ch-Ua-Mobile", "?0")
            .header("Sec-Ch-Ua-Platform", "\"macOS\"")
            .header("Sec-Fetch-Dest", "document")
            .header("Sec-Fetch-Mode", "navigate")
            .header("Sec-Fetch-Site", "none")
            .header("Sec-Fetch-User", "?1");
    }
    if let Some(cookie) = &req.cookie {
        if !cookie.is_empty() {
            request = if is_google {
                request.header("Cookie", build_google_cookie_header(cookie))
            } else {
                request.header("Cookie", cookie.as_str())
            };
        }
    }

    match request.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let is_google_redirect_block =
                is_google && matches!(status, 301 | 302 | 303 | 307 | 308);
            let retry_after = res
                .headers()
                .get("retry-after")
                .and_then(parse_retry_after_seconds);
            let content_type = res
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let body = res.bytes().await.unwrap_or_default();
            let mut response_retry_after = retry_after;

            // [FIX] 429 시 지수 백오프 쿨다운
            if (status == 429 || is_google_redirect_block) && is_google {
                let mut state = google_proxy_backoff_state().lock().await;
                state.consecutive_429s += 1;
                let cooldown_secs = retry_after
                    .filter(|seconds| *seconds > 0)
                    .unwrap_or_else(|| google_backoff_seconds(state.consecutive_429s));
                state.cooldown_until =
                    std::time::Instant::now() + std::time::Duration::from_secs(cooldown_secs);
                response_retry_after = Some(cooldown_secs);
            } else if is_google && status == 200 {
                let mut state = google_proxy_backoff_state().lock().await;
                state.consecutive_429s = 0;
                state.cooldown_until =
                    std::time::Instant::now() - std::time::Duration::from_secs(1);
            }

            let mut headers = HeaderMap::new();
            headers.insert(
                "Content-Type",
                content_type.parse().unwrap_or("text/html".parse().unwrap()),
            );
            if let Some(ra) = response_retry_after {
                headers.insert("Retry-After", ra.to_string().parse().unwrap());
            }
            (
                axum::http::StatusCode::from_u16(status).unwrap_or(StatusCode::OK),
                headers,
                Body::from(body),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("프록시 요청 실패: {}", e) })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// 핸들러: /api/naver-image-search (네이버 이미지 검색)
// API 키 불필요, 모바일 웹 페이지 접속 후 HTML 파싱
// 네이버는 구글보다 차단이 훨씬 느슨함 (시간당 50~100회 OK)
// ──────────────────────────────────────────────

static NAVER_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn naver_client() -> &'static reqwest::Client {
    NAVER_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .connect_timeout(std::time::Duration::from_secs(5))
            .gzip(true)
            .brotli(true)
            .build()
            .unwrap_or_default()
    })
}

async fn naver_image_search_handler(Json(req): Json<NaverImageSearchRequest>) -> impl IntoResponse {
    let query = &req.query;
    if query.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "검색어 비어있음" })),
        )
            .into_response();
    }

    let encoded = urlencoding::encode(query);
    let url = format!(
        "https://m.search.naver.com/search.naver?where=m_image&query={}&sm=mtb_img&start={}&display={}",
        encoded, req.start, req.display
    );

    let client = naver_client();
    let res = match client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) \
             AppleWebKit/605.1.15 (KHTML, like Gecko) \
             Version/17.6 Mobile/15E148 Safari/604.1",
        )
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "ko-KR,ko;q=0.9")
        .header("Referer", "https://m.search.naver.com/")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({
                    "error": format!("네이버 검색 실패: {}", e)
                })),
            )
                .into_response();
        }
    };

    if !res.status().is_success() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": format!("네이버 응답 에러: {}", res.status())
            })),
        )
            .into_response();
    }

    let html = match res.text().await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("응답 읽기 실패: {}", e)
                })),
            )
                .into_response();
        }
    };

    // 네이버 모바일 이미지 검색 결과 파싱
    let mut images: Vec<NaverImageResult> = Vec::new();

    // 방법 1: data-source 속성 (모바일 네이버 이미지 썸네일)
    // <img class="..." data-source="원본URL" data-lazy-src="썸네일URL" alt="제목">
    let data_source_re = regex_lite::Regex::new(
        r#"data-source="([^"]+)"[^>]*?(?:data-lazy-src|src)="([^"]+)"[^>]*?alt="([^"]*)"#,
    )
    .unwrap_or_else(|_| regex_lite::Regex::new(r"NOMATCH").unwrap());

    for cap in data_source_re.captures_iter(&html) {
        let image_url = cap
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let thumb = cap
            .get(2)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let title = cap
            .get(3)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        if !image_url.is_empty() && image_url.starts_with("http") {
            images.push(NaverImageResult {
                image_url: image_url.clone(),
                thumbnail_url: if thumb.starts_with("http") {
                    thumb
                } else {
                    image_url.clone()
                },
                title,
                source: String::new(),
                width: 0,
                height: 0,
                link: String::new(),
            });
        }
    }

    // 방법 2: JSON 임베디드 데이터 (네이버 모바일 __NEXT_DATA__ 또는 인라인 JSON)
    if images.is_empty() {
        // "originalUrl":"..." 패턴에서 이미지 추출
        let json_img_re = regex_lite::Regex::new(r#""originalUrl"\s*:\s*"(https?://[^"]+)""#)
            .unwrap_or_else(|_| regex_lite::Regex::new(r"NOMATCH").unwrap());
        let json_thumb_re = regex_lite::Regex::new(r#""thumbnailUrl"\s*:\s*"(https?://[^"]+)""#)
            .unwrap_or_else(|_| regex_lite::Regex::new(r"NOMATCH").unwrap());
        let json_title_re = regex_lite::Regex::new(r#""title"\s*:\s*"([^"]*?)""#)
            .unwrap_or_else(|_| regex_lite::Regex::new(r"NOMATCH").unwrap());

        let orig_urls: Vec<String> = json_img_re
            .captures_iter(&html)
            .map(|c| c.get(1).unwrap().as_str().to_string())
            .collect();
        let thumb_urls: Vec<String> = json_thumb_re
            .captures_iter(&html)
            .map(|c| c.get(1).unwrap().as_str().to_string())
            .collect();
        let titles: Vec<String> = json_title_re
            .captures_iter(&html)
            .map(|c| c.get(1).unwrap().as_str().to_string())
            .collect();

        for (i, orig) in orig_urls.iter().enumerate() {
            images.push(NaverImageResult {
                image_url: orig.clone(),
                thumbnail_url: thumb_urls.get(i).cloned().unwrap_or_else(|| orig.clone()),
                title: titles.get(i).cloned().unwrap_or_default(),
                source: String::new(),
                width: 0,
                height: 0,
                link: String::new(),
            });
        }
    }

    // 방법 3: og:image / <img src="..."> 폴백
    if images.is_empty() {
        let img_re = regex_lite::Regex::new(
            r#"<img[^>]+src="(https?://[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)""#,
        )
        .unwrap_or_else(|_| regex_lite::Regex::new(r"NOMATCH").unwrap());

        for cap in img_re.captures_iter(&html) {
            let url = cap
                .get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
            // 네이버 내부 UI 이미지 제외
            if !url.contains("static.naver")
                && !url.contains("s.pstatic.net/static")
                && !url.contains("favicon")
                && !url.contains("logo")
                && url.starts_with("http")
            {
                images.push(NaverImageResult {
                    image_url: url.clone(),
                    thumbnail_url: url,
                    title: String::new(),
                    source: String::new(),
                    width: 0,
                    height: 0,
                    link: String::new(),
                });
            }
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "images": images,
            "query": query,
            "provider": "naver",
            "count": images.len()
        })),
    )
        .into_response()
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
    let safe_prompt = req
        .prompt
        .replace('\'', "\\'")
        .replace('\n', " ")
        .replace('\r', "");

    // mflux-generate CLI 호출
    let output = platform::async_cmd("mflux-generate")
        .args([
            "--model",
            "flux.1-schnell", // 가장 빠른 모델 (1-4 steps)
            "--prompt",
            &safe_prompt,
            "--width",
            &width.to_string(),
            "--height",
            &height.to_string(),
            "--steps",
            &steps.to_string(),
            "--output",
            &output_path,
            "--quantize",
            "4", // 4bit 양자화 (메모리 절약)
        ])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => match std::fs::read(&output_path) {
            Ok(data) => {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                Json(serde_json::json!({
                    "image": b64,
                    "format": "png",
                    "width": width,
                    "height": height,
                }))
                .into_response()
            }
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("이미지 읽기 실패: {}", e) })),
            )
                .into_response(),
        },
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
        }
    }
}

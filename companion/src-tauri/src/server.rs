use axum::{
    body::Body,
    extract::{Multipart, Path as AxumPath, Query},
    http::{HeaderMap, StatusCode},
    middleware,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, OnceLock};
use tokio::sync::RwLock;
use tokio_util::io::ReaderStream;
use tower_http::cors::{Any, CorsLayer};

use crate::video_tunnel::{
    self, ensure_temp_upload_dir, generate_token, OpenRequest, TunnelError, TunnelManager,
};
use crate::{platform, rembg, tts, whisper, ytdlp};

// ──────────────────────────────────────────────
// [v2.0] Video Tunnel Manager — 전역 싱글톤
// ──────────────────────────────────────────────

static TUNNEL_MANAGER: OnceLock<Arc<TunnelManager>> = OnceLock::new();
static ACTIVE_PORT: OnceLock<u16> = OnceLock::new();
const COMPANION_PORT_CANDIDATES: [u16; 2] = [9876, 9877];
const ACTIVE_PORT_FILENAME: &str = "active-port";
const TUNNEL_SERVE_PORT: u16 = 9879;

/// 현재 바인딩된 메인 API 포트 (9876 또는 9877)
pub fn active_port() -> u16 {
    ACTIVE_PORT
        .get()
        .copied()
        .unwrap_or(COMPANION_PORT_CANDIDATES[0])
}

fn active_port_file_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join(ACTIVE_PORT_FILENAME)
}

fn persist_active_port(port: u16) -> std::io::Result<()> {
    let path = active_port_file_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, format!("{}\n", port))
}

/// (Codex Round-6 High) 초기화 중 spawn된 child를 추적하는 전역 슬롯.
/// TunnelManager::new()가 cloudflared를 spawn하지만 아직 TUNNEL_MANAGER에 publish 안 된 상태에서
/// shutdown이 오면 이 슬롯을 통해 child를 정리한다.
static INIT_PHASE_CHILD_PID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// (Codex Round-6 Low) TunnelManager 초기화 상태 — status 엔드포인트에 노출
#[derive(Debug, Clone)]
enum TunnelInitState {
    Idle,
    Initializing,
    Ready,
    Failed(String),
}
static TUNNEL_INIT_STATE: LazyLock<RwLock<TunnelInitState>> =
    LazyLock::new(|| RwLock::new(TunnelInitState::Idle));

pub fn tunnel_manager() -> Option<Arc<TunnelManager>> {
    TUNNEL_MANAGER.get().cloned()
}

/// (Codex Round-6 High) 초기화 중에도 호출 가능한 child kill — graceful_shutdown_and_exit이 사용
pub fn kill_init_phase_child_if_any() {
    let pid = INIT_PHASE_CHILD_PID.swap(0, std::sync::atomic::Ordering::SeqCst);
    if pid > 0 {
        eprintln!(
            "[Tunnel] 초기화 단계 cloudflared child PID {} 강제 종료",
            pid
        );
        #[cfg(unix)]
        unsafe {
            libc_kill(pid as i32, 9);
        }
        #[cfg(windows)]
        {
            let _ = platform::sync_cmd("taskkill")
                .args(&["/F", "/PID", &pid.to_string()])
                .status();
        }
    }
}

#[cfg(unix)]
extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}
#[cfg(unix)]
unsafe fn libc_kill(pid: i32, sig: i32) -> i32 {
    kill(pid, sig)
}

pub fn record_init_phase_child(pid: u32) {
    INIT_PHASE_CHILD_PID.store(pid, std::sync::atomic::Ordering::SeqCst);
}

pub fn clear_init_phase_child() {
    INIT_PHASE_CHILD_PID.store(0, std::sync::atomic::Ordering::SeqCst);
}

async fn init_tunnel_manager() {
    println!("[Tunnel] TunnelManager 초기화 시작 (cloudflared 다운로드 + spawn)");
    *TUNNEL_INIT_STATE.write().await = TunnelInitState::Initializing;

    match TunnelManager::new(TUNNEL_SERVE_PORT).await {
        Ok(manager) => {
            let arc = Arc::new(manager);
            // (Codex Round-8 Medium) PUBLISH가 끝난 다음에만 PID slot clear.
            // 이렇게 하면 TUNNEL_MANAGER.set 직전 race에서 shutdown이 들어와도
            // 1) tunnel_manager()가 None이라도 → kill_init_phase_child_if_any()가 child 잡음
            // 2) tunnel_manager()가 Some이면 → mgr.shutdown()이 잡음
            // 어느 쪽이든 child가 정리됨.
            if TUNNEL_MANAGER.set(arc).is_ok() {
                println!("[Tunnel] TunnelManager 초기화 완료");
                *TUNNEL_INIT_STATE.write().await = TunnelInitState::Ready;
                // PUBLISH 완료 후 → PID slot clear (이제 manager 경로로 잡힘)
                clear_init_phase_child();
            } else {
                eprintln!("[Tunnel] TunnelManager가 이미 초기화됨 (race condition?)");
                *TUNNEL_INIT_STATE.write().await =
                    TunnelInitState::Failed("already initialized".to_string());
                // 이 분기는 비정상이지만 PID slot은 그대로 두면 stale → 안전하게 clear
                clear_init_phase_child();
            }
        }
        Err(e) => {
            let msg = format!("{}", e);
            eprintln!(
                "[Tunnel] TunnelManager 초기화 실패: {} — 폴백(Cloudinary) 모드로 작동",
                msg
            );
            *TUNNEL_INIT_STATE.write().await = TunnelInitState::Failed(msg);
            // 실패해도 컴패니언 자체는 계속 동작 — 프론트가 자동으로 Cloudinary 폴백
            // 실패 경로의 PID slot은 spawn_cloudflared 안에서 이미 clear됐어야 함 (이중 안전)
            clear_init_phase_child();
        }
    }
}

pub async fn current_init_state() -> TunnelInitState {
    TUNNEL_INIT_STATE.read().await.clone()
}

// ──────────────────────────────────────────────
// [FIX] Google 프록시 싱글톤 Client + 페이싱/백오프 상태
// ──────────────────────────────────────────────

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
    // [v1.3.2] TTS — Qwen3 / Kokoro detect 코드 제거 (옛 기능, 웹앱이 더 이상 의존 안 함).
    // 현재 헬퍼는 Edge TTS / Supertonic / Typecast 등 외부 클라우드 TTS 사용.
    // Piper만 옛 fallback으로 유지 (있으면 detect, 없으면 무시).
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
    port: u16,
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
    // base64 인코딩된 이미지 (legacy)
    image: Option<String>,
    // [v2.5] temp_path 기반 — upload-temp로 올린 파일 경로
    #[serde(rename = "inputPath")]
    input_path: Option<String>,
}

#[derive(Deserialize)]
struct TranscribeRequest {
    // base64 인코딩된 오디오 (legacy)
    audio: Option<String>,
    // [v2.5] temp_path 기반 — upload-temp로 올린 파일 경로
    #[serde(rename = "inputPath")]
    input_path: Option<String>,
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
    // base64 인코딩된 입력 파일 (legacy)
    input: Option<String>,
    // [v2.5] temp_path 기반 — upload-temp로 올린 파일 경로
    #[serde(rename = "inputPath")]
    input_path: Option<String>,
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
    // base64 인코딩된 비디오 파일 (legacy)
    video: Option<String>,
    // base64 인코딩된 오디오 파일 (legacy)
    audio: Option<String>,
    // base64 인코딩된 장면 MP4 목록 (legacy)
    videos: Option<Vec<String>>,
    // [v2.5] temp_path 기반 경로들
    #[serde(rename = "videoPath")]
    video_path: Option<String>,
    #[serde(rename = "audioPath")]
    audio_path: Option<String>,
    #[serde(rename = "videoPaths")]
    video_paths: Option<Vec<String>>,
    #[serde(rename = "videoFormat")]
    video_format: Option<String>,
    #[serde(rename = "audioFormat")]
    audio_format: Option<String>,
    #[serde(rename = "sceneDurations")]
    scene_durations: Option<Vec<f64>>,
    transitions: Option<Vec<FfmpegMergeTransition>>,
    // [v2.5] 응답도 temp_path로 반환 (base64 인코딩 대신)
    #[serde(rename = "outputPath")]
    output_path_hint: Option<bool>,
}

#[derive(Deserialize)]
struct FfmpegCutRequest {
    // base64 인코딩된 입력 파일 (legacy)
    input: Option<String>,
    // [v2.5] temp_path 기반 — upload-temp로 올린 파일 경로
    #[serde(rename = "inputPath")]
    input_path: Option<String>,
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

// ──────────────────────────────────────────────
// [v2.5] 헬퍼: input_path 또는 base64 중 하나로 바이트 로드
// temp 디렉토리 내 경로만 허용하여 임의 파일 읽기 방지
// ──────────────────────────────────────────────
/// [FIX Codex-3차] macOS에서 /var → /private/var symlink 때문에
/// temp_dir()과 canonicalize() 결과가 불일치 → temp_dir도 canonicalize
fn canonical_temp_dir() -> std::path::PathBuf {
    let raw = std::env::temp_dir();
    std::fs::canonicalize(&raw).unwrap_or(raw)
}

fn resolve_input_bytes(
    input_path: &Option<String>,
    base64_data: &Option<String>,
    label: &str,
) -> Result<Vec<u8>, (StatusCode, Json<serde_json::Value>)> {
    use base64::Engine;
    if let Some(path) = input_path {
        // temp 디렉토리 안전 검증 — 임의 파일 읽기 방지
        let canonical = match std::fs::canonicalize(path) {
            Ok(p) => p,
            Err(e) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": format!("{} 파일을 찾을 수 없습니다: {}", label, e) })),
                ));
            }
        };
        let temp_dir = canonical_temp_dir();
        if !canonical.starts_with(&temp_dir) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("{} 파일이 허용된 경로 밖에 있습니다.", label) })),
            ));
        }
        match std::fs::read(&canonical) {
            Ok(data) => Ok(data),
            Err(e) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("{} 파일 읽기 실패: {}", label, e) })),
            )),
        }
    } else if let Some(b64) = base64_data {
        match base64::engine::general_purpose::STANDARD.decode(b64) {
            Ok(d) => Ok(d),
            Err(e) => Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("{} Base64 디코딩 실패: {}", label, e) })),
            )),
        }
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": format!("{} 입력이 없습니다. inputPath 또는 base64 데이터를 제공하세요.", label) })),
        ))
    }
}

/// [v2.5] 응답을 temp_path로 반환 (base64 인코딩 대신 파일 경로)
/// [FIX Codex-3] use_path_response=true일 때 파일을 persistent temp로 복사하여
/// NamedTempFile drop 후에도 파일이 유지되도록 함
fn respond_with_output_file(
    output_path: &str,
    format: &str,
    use_path_response: bool,
) -> Response {
    use base64::Engine;
    match std::fs::read(output_path) {
        Ok(data) => {
            let size = data.len();
            if use_path_response {
                // NamedTempFile은 handler 끝나면 drop → 파일 삭제됨
                // 따라서 persistent temp 경로로 복사
                let ext = format;
                let persist_path = std::env::temp_dir().join(
                    format!("companion-out-{}.{}", &crate::video_tunnel::generate_token()[..12], ext)
                );
                if let Err(e) = std::fs::write(&persist_path, &data) {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": format!("결과 파일 저장 실패: {}", e) })),
                    )
                        .into_response();
                }
                Json(serde_json::json!({
                    "outputPath": persist_path.to_string_lossy().to_string(),
                    "format": format,
                    "size": size,
                }))
                .into_response()
            } else {
                // legacy: base64 인코딩
                let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                Json(serde_json::json!({ "data": b64, "format": format, "size": size }))
                    .into_response()
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("결과 파일 읽기 실패: {}", e) })),
        )
            .into_response(),
    }
}

// [v2.1.0] /api/scene-detect — yt-dlp + ffmpeg 네이티브 씬 감지
// 브라우저에서 프레임 하나씩 시크·Canvas 비교로 90초 타임아웃에 걸리던 작업을
// 네이티브 ffmpeg `select=gt(scene,X)` + `metadata=print` 파이프라인으로 대체.
// 30분 영상도 10~20초면 완료됨. 프론트는 SceneCut[] 그대로 mergeWithAiTimecodes에 투입.
#[derive(Deserialize)]
struct SceneDetectRequest {
    url: String,
    /// ffmpeg scene filter 임계값 (0.0~1.0). 기본 0.2 — 값이 높을수록 강한 컷만 감지.
    threshold: Option<f64>,
    /// 다운로드 화질 — 씬 감지에는 저화질이 빠르고 충분. 기본 "480p".
    quality: Option<String>,
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
        // [v2.3] WebView 이미지 검색 — 실제 브라우저로 구글/네이버 검색 (봇 탐지 차단 불가)
        .route("/api/browser-google-search", post(browser_google_search_handler))
        .route("/api/browser-naver-search", post(browser_naver_search_handler))
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
        // [v2.1.0] 씬 감지 — yt-dlp + ffmpeg select=gt(scene,X) 네이티브 파이프라인.
        // 브라우저 Canvas 기반 detectSceneCuts의 네이티브 대체. 30분 영상도 10~20초에 완료.
        .route("/api/scene-detect", post(scene_detect_handler))
        // [v2.0] Video Tunnel — 로컬 파일을 cloudflared로 임시 노출 (메인 9876 — 로컬 전용)
        // /api/tunnel/serve/:token만 별도 9879 포트로 분리 (cloudflared가 노출)
        // (Codex Critical 1) upload-temp만 5GB body limit, 나머지는 라우트별 작은 한도
        // (Codex Round-4 Low) /open은 작은 JSON만 받음 → 16KB 한도
        .route(
            "/api/tunnel/open",
            post(tunnel_open_handler)
                .layer(axum::extract::DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            "/api/tunnel/upload-temp",
            post(tunnel_upload_temp_handler).layer(
                axum::extract::DefaultBodyLimit::max(5 * 1024 * 1024 * 1024),
            ),
        )
        .route("/api/tunnel/read-temp", post(tunnel_read_temp_handler))
        .route("/api/tunnel/{token}", delete(tunnel_close_handler))
        .route("/api/tunnel/status", get(tunnel_status_handler))
        // [v2.5] ZIP 스트리밍 생성 — 브라우저 JSZip 대체
        .route(
            "/api/zip/create",
            post(zip_create_handler)
                .layer(axum::extract::DefaultBodyLimit::max(100 * 1024 * 1024)),
        )
        // [v2.5] API 프록시 — 브라우저 CORS/키노출 문제 해결
        .route("/api/proxy/generic", post(api_proxy_handler))
        // [v2.0 Phase 4] 로컬 미디어 라이브러리 — 폴더 스캔 + 메타데이터
        // 로컬 영상/이미지/오디오 라이브러리 시맨틱 검색의 기반
        .route("/api/library/scan", post(library_scan_handler))
        .route("/api/library/file-info", post(library_file_info_handler))
        // [v2.0 Phase 4-5] 라이브 화면/웹캠 캡처 — AI 실시간 분석용
        .route("/api/capture/screen", post(capture_screen_handler))
        .layer(cors)
        // [FIX #846] Chrome 142+ / Edge 143+ Local Network Access 대응
        // HTTPS 페이지에서 127.0.0.1로 fetch 시 preflight에 이 헤더가 필요
        .layer(middleware::from_fn(lna_header_middleware))
        // base64 인코딩된 미디어 파일 수신 — 기본 2MB → 300MB로 확장
        // 200MB 원본은 base64 + JSON 오버헤드로 약 267MB까지 커질 수 있다.
        .layer(axum::extract::DefaultBodyLimit::max(300 * 1024 * 1024));

    // [FIX #846] IPv4 + IPv6 loopback 동시 바인딩
    // Windows에서 localhost가 ::1(IPv6)로 해석되면 IPv4 전용 서버에 연결 실패
    //
    // [Defense A] 포트 fallback: 9876 실패 시 9877로 walk.
    // 다른 프로세스가 9876을 점유해도 컴패니언은 9877에서 정상 동작.
    let mut last_bind_error = None;
    let mut bound_v4 = None;
    for port in COMPANION_PORT_CANDIDATES {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                bound_v4 = Some((listener, addr));
                break;
            }
            Err(e) => {
                eprintln!("[Companion] IPv4 바인딩 실패 ({}): {}", addr, e);
                last_bind_error = Some(e);
            }
        }
    }
    let (main_listener, addr_v4) = match bound_v4 {
        Some(bound) => bound,
        None => {
            let err = last_bind_error.unwrap_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::AddrNotAvailable,
                    "사용 가능한 companion 포트를 찾지 못했습니다",
                )
            });
            return Err(Box::new(err));
        }
    };
    let chosen_port = addr_v4.port();
    let _ = ACTIVE_PORT.set(chosen_port);
    if let Err(e) = persist_active_port(chosen_port) {
        eprintln!("[Companion] active-port 파일 기록 실패: {}", e);
    }
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

    // [v2.0] Video Tunnel — 별도 포트 9879 라우터 (cloudflared 노출 전용)
    // 메인 9876의 민감한 엔드포인트들을 외부에 노출하지 않기 위해 분리.
    // 9879에는 GET /api/tunnel/serve/:token만 라우팅하여 토큰 인증된 파일 서빙만 가능.
    //
    // (Codex Critical 2) 9879 바인딩 성공 신호를 받은 후에만 cloudflared spawn.
    // 다른 프로세스가 9879를 점유 중이면 cloudflared를 절대 띄우지 않음 (그 프로세스가 외부에 노출되는 사고 방지).
    let serve_addr = SocketAddr::from(([127, 0, 0, 1], TUNNEL_SERVE_PORT));
    let listener = match tokio::net::TcpListener::bind(serve_addr).await {
        Ok(l) => {
            println!(
                "[Tunnel] serve 라우터 바인딩 성공: http://{} (cloudflared 노출 전용)",
                serve_addr
            );
            Some(l)
        }
        Err(e) => {
            eprintln!(
                "[Tunnel] serve 라우터 바인딩 실패 ({}): {}",
                serve_addr, e
            );
            eprintln!("[Tunnel] 9879 포트가 사용 중 — 터널 기능 완전 비활성화 (cloudflared 안 띄움)");
            None
        }
    };

    if let Some(listener) = listener {
        // 9879 서버 spawn
        tokio::spawn(async move {
            let serve_router = Router::new()
                .route("/api/tunnel/serve/{token}", get(tunnel_serve_handler))
                .route("/health", get(tunnel_serve_health_handler))
                // CORS는 의도적으로 매우 관대 — Gemini 백엔드가 호출
                .layer(
                    CorsLayer::new()
                        .allow_origin(Any)
                        .allow_methods(Any)
                        .allow_headers(Any),
                )
                // serve 핸들러는 GET이라 body 사용 X — 1MB로 제한
                .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024));

            if let Err(e) = axum::serve(listener, serve_router).await {
                eprintln!("[Tunnel] serve 라우터 에러: {}", e);
            }
        });

        // 바인딩 성공 후에만 TunnelManager 초기화 (cloudflared spawn 포함)
        tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            init_tunnel_manager().await;
        });
    } else {
        eprintln!("[Tunnel] 비활성화 상태로 컴패니언 계속 동작 (다른 기능은 정상)");
    }

    // IPv6 loopback [::1]:{chosen_port}도 시도 (실패해도 fatal 아님 — IPv6 미지원 환경 대비)
    let addr_v6 = SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], chosen_port));
    let app_clone = app.clone();
    if let Ok(v6_listener) = tokio::net::TcpListener::bind(addr_v6).await {
        println!("[Companion] IPv6 loopback 활성화: http://[::1]:{}", chosen_port);
        tokio::spawn(async move {
            if let Err(e) = axum::serve(v6_listener, app_clone).await {
                eprintln!("[Companion] IPv6 서버 에러 (무시): {}", e);
            }
        });
    }

    axum::serve(main_listener, app).await?;
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
        port: active_port(),
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

    println!("[Companion] /quit 수신 (token 검증 통과) — graceful shutdown 시작");
    // (Codex Round-2 High) graceful shutdown — TunnelManager.shutdown() 거쳐 cloudflared 정리
    tokio::spawn(async {
        graceful_shutdown_and_exit().await;
    });
    Json(serde_json::json!({
        "app": "ytdlp-companion",
        "status": "shutting_down",
        "version": env!("CARGO_PKG_VERSION"),
    }))
    .into_response()
}

/// (Codex Round-2 High) 모든 종료 경로의 단일 진입점.
/// /quit, 트레이 quit, 네이티브 종료(Cmd+Q) 모두 이 함수를 호출해야 cloudflared가 안전하게 정리됨.
/// (Codex Round-6 High) 초기화 단계 cloudflared child도 함께 정리.
pub async fn graceful_shutdown_and_exit() {
    println!("[Companion] graceful shutdown 시작");

    // 초기화 단계 child가 있으면 즉시 kill (TunnelManager publish 전 단계)
    kill_init_phase_child_if_any();

    if let Some(mgr) = tunnel_manager() {
        mgr.shutdown().await;
        println!("[Companion] tunnel manager shutdown 완료");
    }
    // 마지막 buffer flush 여유
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    println!("[Companion] exit(0)");
    std::process::exit(0);
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
    let image_data = match resolve_input_bytes(&req.input_path, &req.image, "이미지") {
        Ok(d) => d,
        Err((status, json)) => return (status, json).into_response(),
    };
    let use_path_response = req.input_path.is_some();

    match rembg::remove_background(&image_data).await {
        Ok(result) => {
            if use_path_response {
                // temp 파일에 결과 저장 후 경로 반환
                let temp_dir = std::env::temp_dir();
                let out_path = temp_dir.join(format!("rembg-{}.png", &crate::video_tunnel::generate_token()[..12]));
                if let Err(e) = std::fs::write(&out_path, &result) {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": format!("결과 파일 저장 실패: {}", e) })),
                    ).into_response();
                }
                Json(serde_json::json!({
                    "outputPath": out_path.to_string_lossy().to_string(),
                    "format": "png",
                    "size": result.len(),
                })).into_response()
            } else {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&result);
                Json(serde_json::json!({ "image": b64, "format": "png" })).into_response()
            }
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
    let audio_data = match resolve_input_bytes(&req.input_path, &req.audio, "오디오") {
        Ok(d) => d,
        Err((status, json)) => return (status, json).into_response(),
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

    if req.target == "capcut" {
        if let Err(e) = patch_capcut_draft_content_fps(&project_dir).await {
            eprintln!("[NLE] CapCut FPS 보정 경고 (치명적 아님): {}", e);
        }
    }

    // ── Premiere .prproj 패치 — launch 전에 실행하여 패치된 파일이 열리도록 ──
    if req.target == "premiere" {
        if let Err(e) = patch_prproj_files(&project_dir).await {
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

fn schema_version_for_premiere(version: &str) -> u32 {
    let major = version
        .split('.')
        .next()
        .and_then(|value| value.parse::<u32>().ok());

    match major {
        Some(26) | Some(25) => 43,
        Some(24) => 42,
        Some(23) => 38,
        Some(22) => 36,
        Some(15) => 35,
        Some(14) => 34,
        _ => 33,
    }
}

fn is_drop_frame_fps(fps: f64) -> bool {
    (fps - 29.97).abs() < 0.01 || (fps - 59.94).abs() < 0.01
}

fn fps_to_timebase_and_ntsc(fps: f64) -> (u32, bool) {
    if (fps - 23.976).abs() < 0.01 {
        return (24, true);
    }
    if (fps - 29.97).abs() < 0.01 {
        return (30, true);
    }
    if (fps - 59.94).abs() < 0.01 {
        return (60, true);
    }
    (fps.round().clamp(1.0, 120.0) as u32, false)
}

fn normalize_detected_fps(fps: f64) -> f64 {
    let known = [23.976, 24.0, 25.0, 29.97, 30.0, 50.0, 59.94, 60.0];
    if let Some(best) = known.into_iter().min_by(|a, b| {
        (fps - *a)
            .abs()
            .partial_cmp(&(fps - *b).abs())
            .unwrap_or(std::cmp::Ordering::Equal)
    }) {
        if (fps - best).abs() < 0.05 {
            return best;
        }
    }
    (fps * 1000.0).round() / 1000.0
}

fn is_video_media_path(path: &std::path::Path) -> bool {
    let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "m4v" | "ts" | "flv" | "wmv" | "mpeg"
            | "mpg" | "mxf"
    )
}

fn collect_video_media_paths(project_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![project_dir.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if is_video_media_path(&path) {
                files.push(path);
            }
        }
    }

    files.sort();
    files
}

fn ffprobe_candidate_paths() -> Vec<std::path::PathBuf> {
    let ffmpeg_path = ytdlp::get_ffmpeg_path_public();
    let mut candidates = Vec::new();

    if let Some(name) = ffmpeg_path.file_name().and_then(|value| value.to_str()) {
        if name.eq_ignore_ascii_case("ffmpeg") || name.eq_ignore_ascii_case("ffmpeg.exe") {
            let mut sibling = ffmpeg_path.clone();
            sibling.set_file_name(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });
            candidates.push(sibling);
        }
    }

    candidates.push(std::path::PathBuf::from(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    }));

    let mut deduped = Vec::new();
    for candidate in candidates {
        if !deduped.iter().any(|existing: &std::path::PathBuf| existing == &candidate) {
            deduped.push(candidate);
        }
    }
    deduped
}

fn parse_ffprobe_fps(raw: &str) -> Option<f64> {
    let value = raw.trim().lines().next()?.trim();
    if value.is_empty() || value == "0/0" {
        return None;
    }

    if let Some((num_raw, den_raw)) = value.split_once('/') {
        let numerator = num_raw.trim().parse::<f64>().ok()?;
        let denominator = den_raw.trim().parse::<f64>().ok()?;
        if denominator == 0.0 {
            return None;
        }
        return Some(numerator / denominator);
    }

    value.parse::<f64>().ok()
}

async fn ffprobe_media_fps(media_path: &std::path::Path) -> Result<Option<f64>, String> {
    let mut last_error: Option<String> = None;
    let args = vec![
        "-v".to_string(),
        "error".to_string(),
        "-select_streams".to_string(),
        "v:0".to_string(),
        "-show_entries".to_string(),
        "stream=r_frame_rate".to_string(),
        "-of".to_string(),
        "default=noprint_wrappers=1:nokey=1".to_string(),
        media_path.to_string_lossy().to_string(),
    ];

    for candidate in ffprobe_candidate_paths() {
        let output = match platform::async_cmd(&candidate).args(&args).output().await
        {
            Ok(output) => output,
            Err(err) => {
                last_error = Some(format!("{} 실행 실패: {}", candidate.display(), err));
                continue;
            }
        };

        if !output.status.success() {
            last_error = Some(format!(
                "{} stderr: {}",
                candidate.display(),
                String::from_utf8_lossy(&output.stderr).trim()
            ));
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        return Ok(parse_ffprobe_fps(&stdout).map(normalize_detected_fps));
    }

    Err(last_error.unwrap_or_else(|| "ffprobe 실행 후보가 없습니다.".to_string()))
}

async fn detect_project_video_fps(project_dir: &std::path::Path) -> Option<f64> {
    let media_files = collect_video_media_paths(project_dir);
    if media_files.is_empty() {
        println!("[NLE] FPS 측정용 영상 파일이 없어 ffprobe 보정을 건너뜀");
        return None;
    }

    let mut detected: Vec<(f64, usize, usize)> = Vec::new();

    for (index, media_path) in media_files.iter().enumerate() {
        match ffprobe_media_fps(media_path).await {
            Ok(Some(fps)) => {
                println!(
                    "[NLE] ffprobe FPS 감지: {} -> {:.3}",
                    media_path.display(),
                    fps
                );
                if let Some(entry) = detected
                    .iter_mut()
                    .find(|(existing, _, _)| (*existing - fps).abs() < 0.001)
                {
                    entry.1 += 1;
                } else {
                    detected.push((fps, 1, index));
                }
            }
            Ok(None) => {
                println!(
                    "[NLE] ffprobe FPS 미감지: {} (영상 스트림 없음 또는 0/0)",
                    media_path.display()
                );
            }
            Err(err) => {
                eprintln!(
                    "[NLE] ffprobe 실패: {} ({})",
                    media_path.display(),
                    err
                );
            }
        }
    }

    detected.sort_by(|a, b| b.1.cmp(&a.1).then(a.2.cmp(&b.2)));
    let selected = detected.first().map(|(fps, _, _)| *fps);
    if let Some(fps) = selected {
        println!("[NLE] 프로젝트 대표 FPS 선택: {:.3}", fps);
    }
    selected
}

fn patch_prproj_project_version(xml: String, schema_version: u32) -> String {
    let Some(project_start) = xml.find(r#"<Project ObjectID="1""#) else {
        return xml;
    };
    let Some(project_end_rel) = xml[project_start..].find('>') else {
        return xml;
    };
    let project_end = project_start + project_end_rel;
    let project_head = &xml[project_start..=project_end];
    let version_re = regex_lite::Regex::new(r#"Version="\d+""#).unwrap();
    let patched_head = version_re
        .replace(project_head, &format!(r#"Version="{}""#, schema_version))
        .to_string();

    let mut patched = String::with_capacity(xml.len() - project_head.len() + patched_head.len());
    patched.push_str(&xml[..project_start]);
    patched.push_str(&patched_head);
    patched.push_str(&xml[project_end + 1..]);
    patched
}

fn patch_prproj_timebase_and_ntsc(xml: String, fps: f64) -> String {
    let (timebase, ntsc) = fps_to_timebase_and_ntsc(fps);
    let ntsc_text = if ntsc { "TRUE" } else { "FALSE" };

    let timebase_upper = regex_lite::Regex::new(r"<TimeBase>\s*\d+\s*</TimeBase>").unwrap();
    let timebase_lower = regex_lite::Regex::new(r"<timebase>\s*\d+\s*</timebase>").unwrap();
    let ntsc_upper =
        regex_lite::Regex::new(r"<NTSC>\s*(?:TRUE|FALSE|true|false)\s*</NTSC>").unwrap();
    let ntsc_lower =
        regex_lite::Regex::new(r"<ntsc>\s*(?:TRUE|FALSE|true|false)\s*</ntsc>").unwrap();

    let xml = timebase_upper
        .replace_all(&xml, &format!("<TimeBase>{}</TimeBase>", timebase))
        .to_string();
    let xml = timebase_lower
        .replace_all(&xml, &format!("<timebase>{}</timebase>", timebase))
        .to_string();
    let xml = ntsc_upper
        .replace_all(&xml, &format!("<NTSC>{}</NTSC>", ntsc_text))
        .to_string();
    ntsc_lower
        .replace_all(&xml, &format!("<ntsc>{}</ntsc>", ntsc_text))
        .to_string()
}

async fn patch_capcut_draft_content_fps(project_dir: &std::path::Path) -> Result<(), String> {
    let Some(fps) = detect_project_video_fps(project_dir).await else {
        return Ok(());
    };
    let draft_path = project_dir.join("draft_content.json");
    if !draft_path.exists() {
        println!("[NLE] draft_content.json이 없어 CapCut FPS 보정을 건너뜀");
        return Ok(());
    }

    let draft_raw =
        std::fs::read_to_string(&draft_path).map_err(|e| format!("draft_content 읽기 실패: {}", e))?;
    let mut draft_json: serde_json::Value = serde_json::from_str(&draft_raw)
        .map_err(|e| format!("draft_content JSON 파싱 실패: {}", e))?;
    let draft_obj = draft_json
        .as_object_mut()
        .ok_or_else(|| "draft_content.json 루트가 object가 아닙니다.".to_string())?;

    draft_obj.insert("fps".to_string(), serde_json::json!(fps));
    draft_obj.insert(
        "is_drop_frame_timecode".to_string(),
        serde_json::json!(is_drop_frame_fps(fps)),
    );

    let serialized = serde_json::to_vec(&draft_json)
        .map_err(|e| format!("draft_content JSON 직렬화 실패: {}", e))?;
    std::fs::write(&draft_path, serialized)
        .map_err(|e| format!("draft_content 저장 실패: {}", e))?;

    println!(
        "[NLE] CapCut FPS 재교정 완료: {} -> {:.3}fps (drop-frame={})",
        draft_path.display(),
        fps,
        is_drop_frame_fps(fps)
    );

    Ok(())
}

/// project_dir 내 모든 .prproj 파일을 찾아 패치한다.
async fn patch_prproj_files(project_dir: &std::path::Path) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::{Read, Write};

    let premiere_info = detect_premiere_pro();
    let schema_version = premiere_info
        .as_ref()
        .map(|(_, ver)| schema_version_for_premiere(ver))
        .unwrap_or(33);
    let detected_fps = detect_project_video_fps(project_dir).await;

    if let Some((ref path, ref ver)) = premiere_info {
        println!(
            "[NLE] Premiere Pro 감지: {} (v{}, schema v{})",
            path, ver, schema_version
        );
    } else {
        println!(
            "[NLE] Premiere Pro 설치 경로를 찾지 못함 — schema v{} 폴백과 절대경로 제거만 수행",
            schema_version
        );
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

            // 4. 사용자 Premiere 메이저 버전에 맞는 Project schema version 패치
            xml = patch_prproj_project_version(xml, schema_version);

            // 5. ffprobe 실측 FPS 기반 TimeBase / NTSC 보정
            if let Some(fps) = detected_fps {
                let (timebase, ntsc) = fps_to_timebase_and_ntsc(fps);
                xml = patch_prproj_timebase_and_ntsc(xml, fps);
                println!(
                    "[NLE] prproj 시퀀스 FPS 보정: {:.3}fps -> TimeBase={}, NTSC={}",
                    fps, timebase, ntsc
                );
            }

            // 6. MZ.BuildVersion 갱신
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

            // 7. gzip 압축 + 저장
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
    let input_data = match resolve_input_bytes(&req.input_path, &req.input, "입력") {
        Ok(d) => d,
        Err((status, json)) => return (status, json).into_response(),
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

    let use_path_response = req.input_path.is_some();
    match output {
        Ok(out) if out.status.success() => {
            respond_with_output_file(&output_path, &out_ext, use_path_response)
        }
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

    // [v2.5] videoPath/audioPath가 있으면 temp 파일에서 직접 읽기, 없으면 base64
    let has_video_src = req.video_path.is_some() || req.video.is_some();
    let has_audio_src = req.audio_path.is_some() || req.audio.is_some();
    let use_path_response = req.output_path_hint.unwrap_or(req.video_path.is_some());

    if has_video_src && has_audio_src {
        let video_data = match resolve_input_bytes(&req.video_path, &req.video, "비디오") {
            Ok(d) => d,
            Err((status, json)) => return (status, json).into_response(),
        };
        let audio_data = match resolve_input_bytes(&req.audio_path, &req.audio, "오디오") {
            Ok(d) => d,
            Err((status, json)) => return (status, json).into_response(),
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
            Ok(out) if out.status.success() => {
                println!("[FFmpeg] ✅ merge 성공");
                respond_with_output_file(&output_path, "mp4", use_path_response)
            }
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
        Ok(out) if out.status.success() => {
            println!("[FFmpeg] ✅ concat 성공");
            respond_with_output_file(&output_path, "mp4", use_path_response)
        }
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
    // [v2.5] 빈 input + inputPath 없음 = capability 조회
    let input_empty = req.input.as_deref().map_or(true, |s| s.trim().is_empty());
    if input_empty && req.input_path.is_none() {
        return ffmpeg_capability_into_response(build_ffmpeg_capability_response());
    }

    let input_data = match resolve_input_bytes(&req.input_path, &req.input, "입력") {
        Ok(d) => d,
        Err((status, json)) => return (status, json).into_response(),
    };
    let use_path_response = req.input_path.is_some();

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
            if use_path_response {
                // temp 파일에 ZIP 저장 후 경로 반환
                let zip_path = temp_dir.path().join("output.zip");
                if let Err(e) = std::fs::write(&zip_path, &zip_bytes) {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": format!("ZIP 저장 실패: {}", e) })),
                    ).into_response();
                }
                // temp_dir의 소유권을 유지하기 위해 into_path()로 leak
                let dir_path = temp_dir.into_path();
                let final_zip = dir_path.join("output.zip");
                Json(serde_json::json!({
                    "outputPath": final_zip.to_string_lossy().to_string(),
                    "format": "zip",
                    "size": zip_bytes.len(),
                    "clipCount": clips.len(),
                }))
                .into_response()
            } else {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&zip_bytes);
                Json(serde_json::json!({
                    "data": b64,
                    "format": "zip",
                    "size": zip_bytes.len(),
                    "clipCount": clips.len(),
                }))
                .into_response()
            }
        }
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": error })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// [v2.1.0] 핸들러: /api/scene-detect
// yt-dlp(저화질 480p 다운로드) + ffmpeg(select=gt(scene,X),metadata=print) 파이프라인.
// 브라우저 Canvas 기반 detectSceneCuts의 30배 빠르고 프레임 정밀한 대체 구현.
// 입력  : { url, threshold?, quality? }
// 출력  : { sceneCuts: [{ timeSec, score }], duration, frameCount, quality, processingSec }
// ──────────────────────────────────────────────

async fn scene_detect_handler(Json(req): Json<SceneDetectRequest>) -> impl IntoResponse {
    let t0 = std::time::Instant::now();

    // 1) 입력 검증
    if req.url.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "url 필드가 비어있습니다" })),
        )
            .into_response();
    }
    let threshold = req.threshold.unwrap_or(0.2).clamp(0.05, 1.0);
    let quality = req.quality.clone().unwrap_or_else(|| "480p".to_string());
    // whitelist (임의 값이 yt-dlp format spec에 주입되지 않도록)
    let quality = match quality.as_str() {
        "360p" | "480p" | "720p" | "1080p" | "best" => quality,
        _ => "480p".to_string(),
    };

    println!(
        "[SceneDetect] ▶ 다운로드 시작: {} (quality={}, threshold={})",
        req.url, quality, threshold
    );

    // 2) 영상 다운로드 — videoOnly=true (오디오 스킵 → 대역폭·디코드 시간 ↓)
    let dl = match ytdlp::download_video(&req.url, &quality, true).await {
        Ok(f) => f,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("영상 다운로드 실패: {}", e)
                })),
            )
                .into_response();
        }
    };
    let dl_sec = t0.elapsed().as_secs_f64();
    println!(
        "[SceneDetect] ✅ 다운로드 완료 ({:.1} MB, {:.1}s)",
        dl.size as f64 / 1024.0 / 1024.0,
        dl_sec
    );

    // 3) ffmpeg 씬 감지
    // select='gt(scene,X)' → 씬 변화 score가 X 초과인 프레임만 통과
    // metadata=print:file=-  → 통과한 프레임의 pts_time + lavfi.scene_score를 stdout에 출력
    // -an                    → 오디오 완전 무시
    // -f null (OS별 null 경로) → 디코드만 하고 출력 안 씀
    let ffmpeg_path = ytdlp::get_ffmpeg_path_public();
    let null_out = if cfg!(target_os = "windows") {
        "NUL"
    } else {
        "/dev/null"
    };
    let filter = format!(
        "select='gt(scene\\,{:.4})',metadata=print:file=-",
        threshold
    );
    let args = vec![
        "-hide_banner".to_string(),
        "-nostats".to_string(),
        "-i".to_string(),
        dl.path.to_string_lossy().to_string(),
        "-filter:v".to_string(),
        filter,
        "-an".to_string(),
        "-f".to_string(),
        "null".to_string(),
        null_out.to_string(),
    ];

    let output = match platform::async_cmd(&ffmpeg_path).args(&args).output().await {
        Ok(o) => o,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("ffmpeg 실행 불가: {}", e)
                })),
            )
                .into_response();
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let last = stderr.lines().last().unwrap_or("unknown");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": format!("ffmpeg 씬 감지 실패: {}", last)
            })),
        )
            .into_response();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // 4) 파싱
    let scene_cuts = parse_scene_detect_stdout(&stdout);
    let duration = parse_duration_from_ffmpeg_stderr(&stderr).unwrap_or(0.0);

    let total_sec = t0.elapsed().as_secs_f64();
    println!(
        "[SceneDetect] ✅ 완료: {}개 컷 감지, 영상 {:.1}s, 총 처리 {:.1}s (ffmpeg {:.1}s)",
        scene_cuts.len(),
        duration,
        total_sec,
        total_sec - dl_sec
    );

    Json(serde_json::json!({
        "sceneCuts": scene_cuts,
        "duration": duration,
        "frameCount": scene_cuts.len(),
        "quality": quality,
        "threshold": threshold,
        "processingSec": total_sec,
    }))
    .into_response()
}

/// ffmpeg metadata=print 출력 파싱.
/// 출력 형식:
///   frame:123    pts:5280000    pts_time:5.28
///   lavfi.scene_score=0.357890
///   frame:245    pts:10400000   pts_time:10.4
///   lavfi.scene_score=0.412345
/// → Vec<{ timeSec, score }>
fn parse_scene_detect_stdout(stdout: &str) -> Vec<serde_json::Value> {
    let mut cuts: Vec<serde_json::Value> = Vec::new();
    let mut pending_time: Option<f64> = None;

    for raw in stdout.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }

        // "frame:N    pts:X    pts_time:SEC"
        if let Some(idx) = line.find("pts_time:") {
            let rest = &line[idx + "pts_time:".len()..];
            let first = rest.split_whitespace().next().unwrap_or("");
            if let Ok(t) = first.parse::<f64>() {
                pending_time = Some(t);
            }
            continue;
        }

        // "lavfi.scene_score=X.XXXX"
        if let Some(idx) = line.find("lavfi.scene_score=") {
            let score_str = line[idx + "lavfi.scene_score=".len()..].trim();
            if let Ok(s) = score_str.parse::<f64>() {
                if let Some(t) = pending_time.take() {
                    cuts.push(serde_json::json!({
                        "timeSec": t,
                        "score": s,
                    }));
                }
            }
        }
    }

    cuts
}

/// ffmpeg stderr의 "Duration: HH:MM:SS.ms, ..." 에서 초 단위 추출.
fn parse_duration_from_ffmpeg_stderr(stderr: &str) -> Option<f64> {
    let idx = stderr.find("Duration:")?;
    let rest = &stderr[idx + "Duration:".len()..];
    let dur_str = rest.split(',').next()?.trim();
    let parts: Vec<&str> = dur_str.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].trim().parse().ok()?;
    let m: f64 = parts[1].trim().parse().ok()?;
    let s: f64 = parts[2].trim().parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
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

// ──────────────────────────────────────────────
// [v2.0] Video Tunnel 핸들러들
// ──────────────────────────────────────────────

/// 에러를 axum Response로 변환
/// (Codex Low 1) 에러 메시지에 절대 경로 등 민감 정보 노출 X — generic message만.
/// 상세 정보는 stderr 로그로만 남김.
fn tunnel_error_response(err: TunnelError) -> Response {
    let status = StatusCode::from_u16(err.http_status())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let code = err.error_code();
    let safe_message = match &err {
        TunnelError::FileNotFound(_) => "파일을 찾을 수 없습니다".to_string(),
        TunnelError::NotARegularFile(_) => "일반 파일이 아닙니다".to_string(),
        TunnelError::PathTraversal(_) => "허용되지 않은 경로입니다".to_string(),
        TunnelError::FileSizeExceeded { limit, .. } => {
            format!("파일 크기가 한도({} bytes)를 초과합니다", limit)
        }
        TunnelError::NotFound => "터널을 찾을 수 없거나 만료되었습니다".to_string(),
        TunnelError::MaxFetchReached => "최대 fetch 횟수를 초과했습니다".to_string(),
        TunnelError::RateLimitExceeded { limit } => {
            format!("rate limit 초과 (분당 최대 {})", limit)
        }
        TunnelError::TooManyActive(max) => format!("동시 터널 한도 초과 (최대 {})", max),
        TunnelError::CloudflaredNotReady(_) => "cloudflared가 아직 준비되지 않았습니다".to_string(),
        TunnelError::CloudflaredDead => "cloudflared 프로세스가 중단되었습니다".to_string(),
        TunnelError::BinaryNotFound | TunnelError::DownloadFailed(_) => {
            "cloudflared 바이너리 준비 실패".to_string()
        }
        TunnelError::ChecksumMismatch { .. } => "cloudflared 무결성 검증 실패".to_string(),
        TunnelError::SpawnFailed(_) => "cloudflared 실행 실패".to_string(),
        TunnelError::Io(_) => "내부 I/O 에러".to_string(),
        TunnelError::Http(_) => "외부 HTTP 호출 실패".to_string(),
        TunnelError::Internal(_) => "내부 에러".to_string(),
    };
    // (Codex Round-2 Low) 운영 로그에는 error code + 축약 정보만, 절대경로는 debug build에서만
    #[cfg(debug_assertions)]
    eprintln!("[Tunnel] error code={} detail={}", code, err);
    #[cfg(not(debug_assertions))]
    eprintln!("[Tunnel] error code={} (상세는 debug build에서만 출력)", code);

    let body = serde_json::json!({
        "ok": false,
        "error": code,
        "message": safe_message,
    });
    (status, Json(body)).into_response()
}

/// POST /api/tunnel/open — 파일 등록 + 공개 URL 발급
async fn tunnel_open_handler(Json(req): Json<OpenRequest>) -> Response {
    // (Codex Round-4 Low) 입력 길이 제한 — 비정상적으로 큰 값 방어
    const MAX_PATH_LEN: usize = 4096;
    const MAX_MIME_LEN: usize = 256;
    if req.file_path.len() > MAX_PATH_LEN {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "file_path_too_long",
                "message": format!("file_path는 {} 자 이하여야 합니다", MAX_PATH_LEN),
            })),
        )
            .into_response();
    }
    if req.mime_type.len() > MAX_MIME_LEN {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "mime_type_too_long",
                "message": format!("mime_type는 {} 자 이하여야 합니다", MAX_MIME_LEN),
            })),
        )
            .into_response();
    }

    // (Codex Round-5 Medium) 제어 문자 차단 — CRLF injection 방지
    // file_path / mime_type 모두 ASCII control 또는 \r\n 포함 금지
    if req.file_path.chars().any(|c| c.is_ascii_control()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "file_path_invalid_chars",
                "message": "file_path에 제어 문자가 포함될 수 없습니다",
            })),
        )
            .into_response();
    }
    // mime_type은 더 엄격: HeaderValue로 파싱 시도
    if req.mime_type.chars().any(|c| c.is_ascii_control()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "mime_type_invalid_chars",
                "message": "mime_type에 제어 문자가 포함될 수 없습니다",
            })),
        )
            .into_response();
    }
    // HeaderValue로 파싱 가능한지 사전 검증 (실제 응답 시 사용 예정)
    if axum::http::HeaderValue::from_str(&req.mime_type).is_err() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "mime_type_invalid",
                "message": "mime_type가 HTTP 헤더로 사용 불가",
            })),
        )
            .into_response();
    }

    let manager = match tunnel_manager() {
        Some(m) => m,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "tunnel_not_initialized",
                    "message": "TunnelManager가 아직 초기화되지 않았습니다 (cloudflared 다운로드 중일 수 있음)",
                })),
            )
                .into_response();
        }
    };

    match manager.open(req).await {
        Ok(handle) => Json(serde_json::json!({
            "ok": true,
            "token": handle.token,
            "url": handle.url,
            "expires_at": handle.expires_at,
            "size_bytes": handle.size_bytes,
        }))
        .into_response(),
        Err(e) => {
            eprintln!("[Tunnel] open 실패: {}", e);
            tunnel_error_response(e)
        }
    }
}

/// DELETE /api/tunnel/:token — 명시적 종료
async fn tunnel_close_handler(AxumPath(token): AxumPath<String>) -> Response {
    let manager = match tunnel_manager() {
        Some(m) => m,
        None => return Json(serde_json::json!({ "ok": true })).into_response(),
    };

    let _ = manager.close(&token).await;
    Json(serde_json::json!({ "ok": true })).into_response()
}

/// GET /api/tunnel/status — 상태 조회 (모니터링)
/// (Codex Round-6 Low) init state까지 노출 — 운영 시 원인 추적 가능
async fn tunnel_status_handler() -> Response {
    let init_state = current_init_state().await;
    let (init_label, init_detail) = match &init_state {
        TunnelInitState::Idle => ("idle", None),
        TunnelInitState::Initializing => ("initializing", None),
        TunnelInitState::Ready => ("ready", None),
        TunnelInitState::Failed(msg) => ("failed", Some(msg.clone())),
    };

    let manager = match tunnel_manager() {
        Some(m) => m,
        None => {
            let mut json = serde_json::json!({
                "ok": false,
                "cloudflared_running": false,
                "active_tunnels": 0,
                "init_state": init_label,
                "message": "TunnelManager 미초기화",
            });
            if let Some(detail) = init_detail {
                json["init_error"] = serde_json::Value::String(detail);
            }
            return Json(json).into_response();
        }
    };

    let status = manager.status().await;
    let mut value = serde_json::to_value(&status).unwrap_or(serde_json::json!({"ok": false}));
    if let Some(obj) = value.as_object_mut() {
        obj.insert(
            "init_state".to_string(),
            serde_json::Value::String(init_label.to_string()),
        );
        if let Some(detail) = init_detail {
            obj.insert("init_error".to_string(), serde_json::Value::String(detail));
        }
    }
    Json(value).into_response()
}

/// POST /api/tunnel/upload-temp — 프론트가 File을 multipart로 올림
/// → 컴패니언이 임시 폴더에 **스트리밍**으로 저장하고 절대경로 반환
/// (Codex Critical 1) field.bytes()는 전체 RAM 버퍼링 → 5GB OOM 위험.
/// chunk() 루프로 디스크에 직접 write하여 메모리 사용량을 64KB 수준으로 유지.
async fn tunnel_upload_temp_handler(mut multipart: Multipart) -> Response {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let temp_dir = match ensure_temp_upload_dir().await {
        Ok(d) => d,
        Err(e) => return tunnel_error_response(e),
    };

    loop {
        let next = multipart.next_field().await;
        let field_opt = match next {
            Ok(opt) => opt,
            Err(e) => {
                eprintln!("[Tunnel] multipart 파싱 에러: {}", e);
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "ok": false,
                        "error": "multipart_parse_failed",
                        "message": "multipart 본문 파싱 실패",
                    })),
                )
                    .into_response();
            }
        };

        let mut field = match field_opt {
            Some(f) => f,
            None => break,
        };

        let field_name = field.name().unwrap_or("").to_string();
        if field_name != "file" {
            continue;
        }

        let original_name = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "upload.bin".to_string());

        // 파일명 sanitize + 충돌 방지 (랜덤 suffix)
        let safe_name = sanitize_temp_filename(&original_name);
        let token = generate_token();
        let suffix = &token[..16];
        let final_name = format!("{}-{}", suffix, safe_name);
        let file_path = temp_dir.join(&final_name);

        // 스트리밍 디스크 write
        // (Codex Round-3 Medium) 파일 권한 0600 — 다른 user가 못 읽게
        #[cfg(unix)]
        let mut file = {
            use std::os::unix::fs::OpenOptionsExt;
            match tokio::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .mode(0o600)
                .open(&file_path)
                .await
            {
                Ok(f) => f,
                Err(e) => return tunnel_error_response(TunnelError::Io(e)),
            }
        };
        #[cfg(not(unix))]
        let mut file = match tokio::fs::File::create(&file_path).await {
            Ok(f) => f,
            Err(e) => return tunnel_error_response(TunnelError::Io(e)),
        };

        let mut total_bytes: u64 = 0;
        const HARD_LIMIT: u64 = 5 * 1024 * 1024 * 1024; // 5GB per file

        while let Some(chunk_res) = field.next().await {
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[Tunnel] multipart chunk 읽기 실패: {}", e);
                    let _ = tokio::fs::remove_file(&file_path).await;
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "ok": false,
                            "error": "multipart_read_failed",
                            "message": "multipart chunk 읽기 실패",
                        })),
                    )
                        .into_response();
                }
            };
            total_bytes += chunk.len() as u64;
            if total_bytes > HARD_LIMIT {
                let _ = tokio::fs::remove_file(&file_path).await;
                return (
                    StatusCode::PAYLOAD_TOO_LARGE,
                    Json(serde_json::json!({
                        "ok": false,
                        "error": "file_size_exceeded",
                        "message": "5GB 한도 초과",
                    })),
                )
                    .into_response();
            }
            if let Err(e) = file.write_all(&chunk).await {
                let _ = tokio::fs::remove_file(&file_path).await;
                return tunnel_error_response(TunnelError::Io(e));
            }
        }

        if let Err(e) = file.flush().await {
            return tunnel_error_response(TunnelError::Io(e));
        }
        if let Err(e) = file.sync_all().await {
            // sync 실패는 치명적이지 않음 (로그만)
            eprintln!("[Tunnel] temp 파일 sync 실패 (무시): {}", e);
        }
        drop(file);

        return Json(serde_json::json!({
            "ok": true,
            "temp_path": file_path.to_string_lossy().to_string(),
            "size_bytes": total_bytes,
        }))
        .into_response();
    }

    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({
            "ok": false,
            "error": "no_file_field",
            "message": "multipart에 file 필드가 없습니다",
        })),
    )
        .into_response()
}

/// POST /api/tunnel/read-temp — temp 파일을 binary로 읽어서 반환
/// [v2.5] 웹앱이 outputPath 응답을 받은 후 파일 내용을 가져올 때 사용
async fn tunnel_read_temp_handler(Json(req): Json<serde_json::Value>) -> Response {
    let path = match req.get("path").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "path 필드가 필요합니다" })),
            )
                .into_response()
        }
    };

    // temp 디렉토리 안전 검증
    let canonical = match std::fs::canonicalize(&path) {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("파일을 찾을 수 없습니다: {}", e) })),
            )
                .into_response()
        }
    };
    let temp_dir = canonical_temp_dir();
    if !canonical.starts_with(&temp_dir) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "허용된 경로 밖의 파일입니다" })),
        )
            .into_response();
    }

    match tokio::fs::read(&canonical).await {
        Ok(data) => {
            let mime = if path.ends_with(".mp4") {
                "video/mp4"
            } else if path.ends_with(".zip") {
                "application/zip"
            } else if path.ends_with(".png") {
                "image/png"
            } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
                "image/jpeg"
            } else if path.ends_with(".wav") {
                "audio/wav"
            } else if path.ends_with(".mp3") {
                "audio/mpeg"
            } else {
                "application/octet-stream"
            };
            Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", mime)
                .header("Content-Length", data.len().to_string())
                .body(Body::from(data))
                .unwrap_or_else(|_| {
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "응답 생성 실패",
                    )
                        .into_response()
                })
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("파일 읽기 실패: {}", e) })),
        )
            .into_response(),
    }
}

// ──────────────────────────────────────────────
// [v2.5] /api/zip/create — URL 목록 → ZIP 파일 생성
// 브라우저 JSZip 대체: 컴패니언이 직접 URL 다운로드 → 디스크에 ZIP 스트리밍
// ──────────────────────────────────────────────

#[derive(Deserialize)]
struct ZipCreateRequest {
    /// ZIP에 넣을 파일 목록: { url: "https://...", filename: "001_scene.jpg" }
    /// 또는 temp_path: { path: "/tmp/...", filename: "clip.mp4" }
    files: Vec<ZipFileEntry>,
}

#[derive(Deserialize)]
struct ZipFileEntry {
    url: Option<String>,
    path: Option<String>,
    filename: String,
}

async fn zip_create_handler(Json(req): Json<ZipCreateRequest>) -> Response {
    use std::io::{Write, Cursor};
    use zip::write::SimpleFileOptions;

    let mut added_count: usize = 0;

    if req.files.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "파일 목록이 비어 있습니다" })),
        )
            .into_response();
    }

    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        for entry in &req.files {
            let data = if let Some(path) = &entry.path {
                // [FIX Codex-1] temp 디렉토리 안전 검증 — resolve_input_bytes와 동일 패턴
                let canonical = match std::fs::canonicalize(path) {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("[ZIP] 파일 경로 해석 실패 ({}): {}", path, e);
                        continue;
                    }
                };
                let temp_dir = canonical_temp_dir();
                if !canonical.starts_with(&temp_dir) {
                    eprintln!("[ZIP] 허용되지 않은 경로: {}", path);
                    continue;
                }
                match std::fs::read(&canonical) {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[ZIP] 파일 읽기 실패 ({}): {}", path, e);
                        continue;
                    }
                }
            } else if let Some(url) = &entry.url {
                // URL에서 다운로드
                match reqwest::get(url).await {
                    Ok(res) if res.status().is_success() => {
                        match res.bytes().await {
                            Ok(bytes) => bytes.to_vec(),
                            Err(e) => {
                                eprintln!("[ZIP] 다운로드 읽기 실패 ({}): {}", url, e);
                                continue;
                            }
                        }
                    }
                    Ok(res) => {
                        eprintln!("[ZIP] 다운로드 실패 ({}) HTTP {}", url, res.status());
                        continue;
                    }
                    Err(e) => {
                        eprintln!("[ZIP] 다운로드 에러 ({}): {}", url, e);
                        continue;
                    }
                }
            } else {
                continue;
            };

            // ZIP 엔트리에 추가
            // [FIX] /는 ZIP 폴더 구조용으로 허용, \와 ..만 치환
            let safe_name = entry.filename.replace('\\', "/").replace("..", "_");
            if let Err(e) = zip.start_file(&safe_name, options) {
                eprintln!("[ZIP] 엔트리 시작 실패 ({}): {}", safe_name, e);
                continue;
            }
            if let Err(e) = zip.write_all(&data) {
                eprintln!("[ZIP] 데이터 쓰기 실패 ({}): {}", safe_name, e);
                continue;
            }
            added_count += 1;
        }

        if let Err(e) = zip.finish() {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("ZIP 완료 실패: {}", e) })),
            )
                .into_response();
        }
    }

    let zip_bytes = buffer.into_inner();
    let size = zip_bytes.len();

    // temp 파일에 저장 후 경로 반환
    let temp_dir = std::env::temp_dir();
    let zip_path = temp_dir.join(format!("zip-{}.zip", &crate::video_tunnel::generate_token()[..12]));
    if let Err(e) = std::fs::write(&zip_path, &zip_bytes) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("ZIP 저장 실패: {}", e) })),
        )
            .into_response();
    }

    Json(serde_json::json!({
        "outputPath": zip_path.to_string_lossy().to_string(),
        "size": size,
        "fileCount": added_count,
        "requestedCount": req.files.len(),
    }))
    .into_response()
}

// ──────────────────────────────────────────────
// [v2.5] /api/proxy/generic — 범용 API 프록시
// 브라우저 CORS 문제 해결 + API 키 노출 방지
// ──────────────────────────────────────────────

#[derive(Deserialize)]
struct ApiProxyRequest {
    url: String,
    method: Option<String>,     // GET/POST (default: GET)
    headers: Option<serde_json::Value>, // { "Authorization": "Bearer ..." }
    body: Option<serde_json::Value>,    // POST body
    timeout_ms: Option<u64>,
}

async fn api_proxy_handler(Json(req): Json<ApiProxyRequest>) -> Response {
    // [FIX Codex-2+2차] 보안: 정확한 호스트 allowlist — subdomain 공격 차단
    let allowed_hosts: &[&str] = &[
        "www.googleapis.com",
        "generativelanguage.googleapis.com",
        "aisandbox-pa.googleapis.com",
        "api.evolink.ai",
        "api.kie.ai",
        "api.laozhang.ai",
        "api.remove.bg",
        "api.cloudinary.com",
        "labs.google",
    ];
    let parsed_url = match url::Url::parse(&req.url) {
        Ok(u) => u,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("유효하지 않은 URL: {}", e) })),
            )
                .into_response();
        }
    };
    let host = parsed_url.host_str().unwrap_or("");
    if !allowed_hosts.contains(&host) || parsed_url.scheme() != "https" {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": format!("허용되지 않은 도메인입니다: {}", host) })),
        )
            .into_response();
    }

    let client = reqwest::Client::new();
    let method_str = req.method.as_deref().unwrap_or("GET").to_uppercase();
    let timeout = std::time::Duration::from_millis(req.timeout_ms.unwrap_or(60_000));

    let mut builder = match method_str.as_str() {
        "POST" => client.post(&req.url),
        "PUT" => client.put(&req.url),
        "DELETE" => client.delete(&req.url),
        "PATCH" => client.patch(&req.url),
        _ => client.get(&req.url),
    }
    .timeout(timeout);

    // 헤더 전달
    if let Some(headers) = &req.headers {
        if let Some(obj) = headers.as_object() {
            for (key, val) in obj {
                if let Some(v) = val.as_str() {
                    if let (Ok(name), Ok(value)) = (
                        reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                        reqwest::header::HeaderValue::from_str(v),
                    ) {
                        builder = builder.header(name, value);
                    }
                }
            }
        }
    }

    // body 전달
    if let Some(body) = &req.body {
        builder = builder.json(body);
    }

    match builder.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let headers_map: serde_json::Map<String, serde_json::Value> = res
                .headers()
                .iter()
                .filter_map(|(k, v)| {
                    v.to_str().ok().map(|s| (k.as_str().to_string(), serde_json::Value::String(s.to_string())))
                })
                .collect();

            let content_type = res
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_string();

            // JSON 응답이면 그대로 반환, 아니면 base64
            if content_type.contains("json") || content_type.contains("text") {
                let text = res.text().await.unwrap_or_default();
                let parsed = serde_json::from_str::<serde_json::Value>(&text).unwrap_or(serde_json::Value::String(text));
                Json(serde_json::json!({
                    "status": status,
                    "headers": headers_map,
                    "data": parsed,
                }))
                .into_response()
            } else {
                use base64::Engine;
                let bytes = res.bytes().await.unwrap_or_default();
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                Json(serde_json::json!({
                    "status": status,
                    "headers": headers_map,
                    "data": b64,
                    "binary": true,
                    "contentType": content_type,
                    "size": bytes.len(),
                }))
                .into_response()
            }
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("프록시 요청 실패: {}", e) })),
        )
            .into_response(),
    }
}

fn sanitize_temp_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect();
    let trimmed = sanitized.trim_matches('.').to_string();
    if trimmed.is_empty() {
        "upload.bin".to_string()
    } else {
        // 너무 긴 파일명 절단 (최대 80자)
        if trimmed.len() > 80 {
            trimmed.chars().take(80).collect()
        } else {
            trimmed
        }
    }
}

/// GET /api/tunnel/serve/:token — 외부(Gemini)가 fetch하는 파일 서빙
/// 9879 포트에서만 접근 가능. 토큰 인증 + Range request 지원.
async fn tunnel_serve_handler(
    AxumPath(token): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let manager = match tunnel_manager() {
        Some(m) => m,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Tunnel manager not initialized",
            )
                .into_response();
        }
    };

    // (Codex Round-3 Medium) 사전 검증만 (quota 차감 X)
    let entry = match manager.check_fetch_allowed(&token).await {
        Ok(e) => e,
        Err(e) => return tunnel_error_response(e),
    };

    // (Codex High 2) symlink 검증 — symlink_metadata 사용
    let symlink_meta = match tokio::fs::symlink_metadata(&entry.file_path).await {
        Ok(m) => m,
        Err(e) => return tunnel_error_response(TunnelError::Io(e)),
    };
    if !symlink_meta.is_file() {
        eprintln!(
            "[Tunnel] serve: 등록된 경로가 더 이상 일반 파일이 아님 (token={}..)",
            &token[..8.min(token.len())]
        );
        return tunnel_error_response(TunnelError::NotFound);
    }

    // (Codex High 2) inode + dev 비교 — open() 이후 파일이 교체됐는지 검사
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if symlink_meta.ino() != entry.file_ino || symlink_meta.dev() != entry.file_dev {
            eprintln!(
                "[Tunnel] serve: inode/dev 불일치 — 파일이 교체됐을 가능성 (token={}..)",
                &token[..8.min(token.len())]
            );
            return tunnel_error_response(TunnelError::NotFound);
        }
    }
    // (Codex Round-5 Medium) Windows 파일 식별자 비교 (NTFS file_index + volume serial)
    // [v2.0.1] symlink_meta.file_index()는 nightly-only이므로 winapi-util로 path 기반 재조회.
    // serve 시점에 file_path를 다시 열어 BY_HANDLE_FILE_INFORMATION으로 확인한다.
    #[cfg(windows)]
    {
        let _ = symlink_meta; // 변수 사용 표시 (Windows에서 직접 쓰진 않음)
        let path_clone = entry.file_path.clone();
        let identity_res = tokio::task::spawn_blocking(move || {
            let handle = winapi_util::Handle::from_path_any(&path_clone)?;
            let info = winapi_util::file::information(&handle)?;
            Ok::<(u64, u64), std::io::Error>((info.file_index(), info.volume_serial_number()))
        })
        .await;
        let (actual_index, actual_volume) = match identity_res {
            Ok(Ok(pair)) => (Some(pair.0), Some(pair.1)),
            _ => {
                eprintln!(
                    "[Tunnel] serve: Windows file identity 조회 실패 (token={}..)",
                    &token[..8.min(token.len())]
                );
                return tunnel_error_response(TunnelError::NotFound);
            }
        };
        if actual_index != entry.file_index || actual_volume != entry.volume_serial {
            eprintln!(
                "[Tunnel] serve: file_index 불일치 — Windows 파일 교체 의심 (token={}..)",
                &token[..8.min(token.len())]
            );
            return tunnel_error_response(TunnelError::NotFound);
        }
    }

    // 파일 열기
    let file = match tokio::fs::File::open(&entry.file_path).await {
        Ok(f) => f,
        Err(e) => return tunnel_error_response(TunnelError::Io(e)),
    };

    // (Codex Round-4 Medium) 열린 fd의 metadata를 다시 검증 — TOCTOU 차단
    // stat→open 사이에 rename/replace 공격 가능. 열린 fd 자체로 재검증.
    let opened_meta = match file.metadata().await {
        Ok(m) => m,
        Err(e) => return tunnel_error_response(TunnelError::Io(e)),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if opened_meta.ino() != entry.file_ino || opened_meta.dev() != entry.file_dev {
            eprintln!(
                "[Tunnel] serve: open 후 inode/dev 불일치 — 파일 교체 공격 의심 (token={}..)",
                &token[..8.min(token.len())]
            );
            return tunnel_error_response(TunnelError::NotFound);
        }
    }
    #[cfg(windows)]
    {
        let _ = opened_meta;
        let file_clone = match file.try_clone().await {
            Ok(clone) => clone,
            Err(e) => return tunnel_error_response(TunnelError::Io(e)),
        };
        let std_file = file_clone.into_std().await;
        let identity_res = tokio::task::spawn_blocking(move || {
            let handle = winapi_util::Handle::from_file(std_file);
            let info = winapi_util::file::information(&handle)?;
            Ok::<(u64, u64), std::io::Error>((info.file_index(), info.volume_serial_number()))
        })
        .await;
        let (actual_index, actual_volume) = match identity_res {
            Ok(Ok(pair)) => (Some(pair.0), Some(pair.1)),
            _ => {
                eprintln!(
                    "[Tunnel] serve: open 후 Windows file identity 조회 실패 (token={}..)",
                    &token[..8.min(token.len())]
                );
                return tunnel_error_response(TunnelError::NotFound);
            }
        };
        if actual_index != entry.file_index || actual_volume != entry.volume_serial {
            eprintln!(
                "[Tunnel] serve: open 후 file_index 불일치 — Windows 파일 교체 공격 의심 (token={}..)",
                &token[..8.min(token.len())]
            );
            return tunnel_error_response(TunnelError::NotFound);
        }
    }
    // size도 fd 기준 (rename 직후 다른 size일 가능성)
    let total_size = opened_meta.len();

    // (Codex Round-5 Medium) mime을 HeaderValue로 사전 검증
    let mime_header = match axum::http::HeaderValue::from_str(&entry.mime_type) {
        Ok(h) => h,
        Err(_) => {
            eprintln!("[Tunnel] serve: 등록된 mime이 HeaderValue로 변환 불가 (저장 단계 버그)");
            return tunnel_error_response(TunnelError::Internal(
                "invalid mime header".to_string(),
            ));
        }
    };

    // (Codex Round-6 Medium) Range 헤더가 있으면 파싱부터 검증 — quota 차감 전에
    let range_header = headers.get("range").and_then(|h| h.to_str().ok()).map(|s| s.to_string());
    let parsed_range: Option<(u64, u64)> = if let Some(ref range) = range_header {
        if total_size == 0 {
            return Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header("Content-Range", "bytes */0")
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
        match parse_byte_range(range, total_size) {
            Ok(r) => Some(r),
            Err(reason) => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header("Content-Range", format!("bytes */{}", total_size))
                    .body(Body::from(reason))
                    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
            }
        }
    } else {
        None
    };

    // (Codex Round-7 Low) Range 요청이면 seek까지 사전 완료해서 quota 차감 후 시작
    let mut file = file;
    if let Some((start, _end)) = parsed_range {
        use tokio::io::{AsyncSeekExt, SeekFrom};
        if let Err(e) = file.seek(SeekFrom::Start(start)).await {
            // seek 실패 — quota 차감 안 됨
            return tunnel_error_response(TunnelError::Io(e));
        }
    }

    // (Codex Round-3 + Round-5 + Round-6 + Round-7) 모든 사전 검증 + seek까지 통과 → quota commit
    if let Err(e) = manager.commit_fetch(&token).await {
        return tunnel_error_response(e);
    }

    if let Some((start, end)) = parsed_range {
        serve_range_after_seek(file, total_size, mime_header, start, end).await
    } else {
        // 전체 파일 스트리밍
        let stream = ReaderStream::new(file);
        let body = Body::from_stream(stream);

        Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", mime_header)
            .header("Content-Length", total_size.to_string())
            .header("Accept-Ranges", "bytes")
            .header("Cache-Control", "no-store")
            .body(body)
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
    }
}

/// (Codex Round-6 + Round-7) Range가 이미 파싱+seek된 상태에서 파일을 서빙
async fn serve_range_after_seek(
    file: tokio::fs::File,
    total_size: u64,
    mime_header: axum::http::HeaderValue,
    start: u64,
    end: u64,
) -> Response {
    use tokio::io::AsyncReadExt;

    let length = end - start + 1;

    let limited = file.take(length);
    let stream = ReaderStream::new(limited);
    let body = Body::from_stream(stream);

    Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header("Content-Type", mime_header)
        .header("Content-Length", length.to_string())
        .header(
            "Content-Range",
            format!("bytes {}-{}/{}", start, end, total_size),
        )
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

// (Codex Round-6 Medium) 기존 serve_range는 serve_range_validated로 대체됨

/// GET /health (9879 포트 전용) — 터널 라우터 자체 상태
async fn tunnel_serve_health_handler() -> Response {
    Json(serde_json::json!({
        "ok": true,
        "service": "tunnel-serve",
        "port": TUNNEL_SERVE_PORT,
    }))
    .into_response()
}

/// HTTP Range 헤더 파싱 (pure function — 테스트 가능)
/// (Codex Medium 8) multi-range는 명시적으로 거부 (`bytes=N-M,O-P`)
/// (Codex High 3) 0바이트 호출은 caller가 사전에 거부해야 함
pub fn parse_byte_range(header: &str, total_size: u64) -> Result<(u64, u64), &'static str> {
    let range_str = match header.strip_prefix("bytes=") {
        Some(s) => s.trim(),
        None => return Err("Range 헤더는 'bytes=' prefix 필수"),
    };

    // Multi-range는 명시적 거부
    if range_str.contains(',') {
        return Err("multipart/byteranges 미지원 (single range만 허용)");
    }

    if total_size == 0 {
        return Err("0바이트 파일은 range 불가");
    }

    let parts: Vec<&str> = range_str.split('-').collect();
    if parts.len() != 2 {
        return Err("잘못된 range 형식 (start-end 필수)");
    }

    let (start_str, end_str) = (parts[0].trim(), parts[1].trim());

    let (start, end) = match (start_str, end_str) {
        ("", "") => return Err("빈 range 거부"),
        ("", end_str) => {
            // bytes=-N → 마지막 N 바이트
            let n = end_str.parse::<u64>().map_err(|_| "invalid suffix range")?;
            if n == 0 {
                return Err("0 suffix range");
            }
            let n = n.min(total_size);
            (total_size - n, total_size - 1)
        }
        (start_str, "") => {
            // bytes=N- → N부터 끝까지
            let s = start_str.parse::<u64>().map_err(|_| "invalid start")?;
            if s >= total_size {
                return Err("start beyond EOF");
            }
            (s, total_size - 1)
        }
        (start_str, end_str) => {
            // bytes=N-M
            let s = start_str.parse::<u64>().map_err(|_| "invalid start")?;
            let e = end_str.parse::<u64>().map_err(|_| "invalid end")?;
            if s > e || s >= total_size {
                return Err("invalid start-end");
            }
            (s, e.min(total_size - 1))
        }
    };

    Ok((start, end))
}

#[cfg(test)]
mod range_tests {
    use super::parse_byte_range;

    #[test]
    fn test_full_range() {
        assert_eq!(parse_byte_range("bytes=0-99", 1000), Ok((0, 99)));
        assert_eq!(parse_byte_range("bytes=100-199", 1000), Ok((100, 199)));
    }

    #[test]
    fn test_open_end() {
        // bytes=N- → N부터 끝까지
        assert_eq!(parse_byte_range("bytes=500-", 1000), Ok((500, 999)));
        assert_eq!(parse_byte_range("bytes=0-", 1000), Ok((0, 999)));
    }

    #[test]
    fn test_suffix_range() {
        // bytes=-N → 마지막 N 바이트
        assert_eq!(parse_byte_range("bytes=-100", 1000), Ok((900, 999)));
        // 파일보다 큰 suffix → 전체
        assert_eq!(parse_byte_range("bytes=-2000", 1000), Ok((0, 999)));
    }

    #[test]
    fn test_end_clamp() {
        // end > total_size → total_size - 1로 클램프
        assert_eq!(parse_byte_range("bytes=0-9999", 1000), Ok((0, 999)));
    }

    #[test]
    fn test_zero_size_rejected() {
        assert!(parse_byte_range("bytes=0-99", 0).is_err());
        assert!(parse_byte_range("bytes=-1", 0).is_err());
    }

    #[test]
    fn test_multi_range_rejected() {
        // (Codex Medium 8) multipart/byteranges 명시 거부
        assert!(parse_byte_range("bytes=0-99,200-299", 1000).is_err());
        assert!(parse_byte_range("bytes=0-1,10-11", 1000).is_err());
    }

    #[test]
    fn test_invalid_format() {
        assert!(parse_byte_range("bytes=abc", 1000).is_err());
        assert!(parse_byte_range("0-99", 1000).is_err()); // bytes= 누락
        assert!(parse_byte_range("bytes=", 1000).is_err());
        assert!(parse_byte_range("bytes=-", 1000).is_err());
        assert!(parse_byte_range("bytes=100-50", 1000).is_err()); // start > end
    }

    #[test]
    fn test_start_beyond_eof() {
        assert!(parse_byte_range("bytes=2000-", 1000).is_err());
        assert!(parse_byte_range("bytes=1000-", 1000).is_err()); // == size
    }

    #[test]
    fn test_zero_suffix() {
        assert!(parse_byte_range("bytes=-0", 1000).is_err());
    }
}

// ──────────────────────────────────────────────
// [v2.0 Phase 4] 로컬 미디어 라이브러리 — 폴더 스캔 + 메타데이터
// ──────────────────────────────────────────────

#[derive(Deserialize)]
struct LibraryScanRequest {
    /// 스캔할 절대 경로 디렉터리
    dir: String,
    /// 파일 타입 필터: "video", "image", "audio", "all"
    #[serde(default = "default_filter")]
    filter: String,
    /// 재귀 스캔 여부 (기본 false — 1 depth)
    #[serde(default)]
    recursive: bool,
    /// 최대 결과 개수 (기본 500)
    #[serde(default = "default_max_results")]
    max_results: usize,
}

fn default_filter() -> String {
    "all".to_string()
}

fn default_max_results() -> usize {
    500
}

#[derive(Serialize)]
struct LibraryFileEntry {
    path: String,
    name: String,
    size_bytes: u64,
    mime: String,
    modified_unix: i64,
}

#[derive(Serialize)]
struct LibraryScanResponse {
    ok: bool,
    dir: String,
    total_found: usize,
    files: Vec<LibraryFileEntry>,
    truncated: bool,
}

const VIDEO_EXTS: &[&str] = &["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv"];
const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "heic"];
const AUDIO_EXTS: &[&str] = &["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma"];

fn ext_mime(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        // video
        "mp4" | "m4v" => Some("video/mp4"),
        "mov" => Some("video/quicktime"),
        "mkv" => Some("video/x-matroska"),
        "avi" => Some("video/x-msvideo"),
        "webm" => Some("video/webm"),
        "wmv" => Some("video/x-ms-wmv"),
        "flv" => Some("video/x-flv"),
        // image
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "tiff" => Some("image/tiff"),
        "heic" => Some("image/heic"),
        // audio
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "m4a" => Some("audio/mp4"),
        "aac" => Some("audio/aac"),
        "flac" => Some("audio/flac"),
        "ogg" | "opus" => Some("audio/ogg"),
        "wma" => Some("audio/x-ms-wma"),
        _ => None,
    }
}

fn matches_filter(ext: &str, filter: &str) -> bool {
    let ext_lower = ext.to_lowercase();
    match filter {
        "video" => VIDEO_EXTS.contains(&ext_lower.as_str()),
        "image" => IMAGE_EXTS.contains(&ext_lower.as_str()),
        "audio" => AUDIO_EXTS.contains(&ext_lower.as_str()),
        "all" => {
            VIDEO_EXTS.contains(&ext_lower.as_str())
                || IMAGE_EXTS.contains(&ext_lower.as_str())
                || AUDIO_EXTS.contains(&ext_lower.as_str())
        }
        _ => false,
    }
}

fn is_valid_library_filter(filter: &str) -> bool {
    matches!(filter, "video" | "image" | "audio" | "all")
}

fn is_hidden_path(path: &std::path::Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

/// POST /api/library/scan — 로컬 폴더를 스캔하여 미디어 파일 목록 반환
/// 화이트리스트 디렉터리만 허용 (Path traversal 방지)
async fn library_scan_handler(Json(req): Json<LibraryScanRequest>) -> Response {
    use std::path::PathBuf;

    // 입력 검증
    if req.dir.is_empty() || req.dir.len() > 4096 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "invalid_dir"})),
        )
            .into_response();
    }

    if !is_valid_library_filter(&req.filter) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "invalid_filter"})),
        )
            .into_response();
    }

    let dir_path = PathBuf::from(&req.dir);
    if !dir_path.is_absolute() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "absolute_path_required"})),
        )
            .into_response();
    }

    // 화이트리스트 검증 — 사용자 홈 / temp / data dir 안에 있어야 함
    let canonical = match std::fs::canonicalize(&dir_path) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "dir_not_found",
                    "detail": e.to_string(),
                })),
            )
                .into_response();
        }
    };
    if !canonical.is_dir() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "directory_required"})),
        )
            .into_response();
    }

    // 화이트리스트: 홈 디렉터리 안만 허용
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"ok": false, "error": "home_dir_unknown"})),
            )
                .into_response();
        }
    };
    let home_canonical = std::fs::canonicalize(&home).unwrap_or(home);
    if !canonical.starts_with(&home_canonical) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "ok": false,
                "error": "outside_home",
                "message": "사용자 홈 디렉터리 안의 폴더만 스캔 가능합니다.",
            })),
        )
            .into_response();
    }

    // 실제 스캔
    let max_results = req.max_results.min(2000);
    let mut files: Vec<LibraryFileEntry> = Vec::new();
    let mut total_found = 0usize;

    let scan_result = scan_directory(
        &canonical,
        &home_canonical,
        &req.filter,
        req.recursive,
        max_results,
        &mut files,
        &mut total_found,
    );

    if let Err(e) = scan_result {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "ok": false,
                "error": "scan_failed",
                "detail": e.to_string(),
            })),
        )
            .into_response();
    }

    let truncated = total_found > files.len();
    Json(LibraryScanResponse {
        ok: true,
        dir: canonical.to_string_lossy().to_string(),
        total_found,
        files,
        truncated,
    })
    .into_response()
}

fn scan_directory(
    dir: &std::path::Path,
    allowed_root: &std::path::Path,
    filter: &str,
    recursive: bool,
    max_results: usize,
    files: &mut Vec<LibraryFileEntry>,
    total_found: &mut usize,
) -> std::io::Result<()> {
    let entries = std::fs::read_dir(dir)?;
    for entry in entries {
        if files.len() >= max_results && !recursive {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        // symlink는 target이 홈 밖으로 빠질 수 있으므로 스캔 대상에서 제외
        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if recursive && files.len() < max_results {
                if is_hidden_path(&path) {
                    continue;
                }
                let canonical_dir = match std::fs::canonicalize(&path) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                if !canonical_dir.starts_with(allowed_root) {
                    continue;
                }
                let _ = scan_directory(
                    &canonical_dir,
                    allowed_root,
                    filter,
                    recursive,
                    max_results,
                    files,
                    total_found,
                );
            }
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let canonical_file = match std::fs::canonicalize(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if !canonical_file.starts_with(allowed_root) {
            continue;
        }
        let metadata = match std::fs::metadata(&canonical_file) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_file() {
            continue;
        }

        let ext = canonical_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        if !matches_filter(&ext, filter) {
            continue;
        }

        *total_found += 1;
        if files.len() >= max_results {
            continue;
        }

        let mime = ext_mime(&ext).unwrap_or("application/octet-stream").to_string();
        let modified_unix = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        files.push(LibraryFileEntry {
            path: canonical_file.to_string_lossy().to_string(),
            name: canonical_file
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            size_bytes: metadata.len(),
            mime,
            modified_unix,
        });
    }
    Ok(())
}

#[derive(Deserialize)]
struct LibraryFileInfoRequest {
    path: String,
}

// ──────────────────────────────────────────────
// [v2.0 Phase 4-5] 라이브 화면 캡처 — AI 실시간 분석용
// macOS: screencapture, Windows: PowerShell, Linux: import (ImageMagick)
// ──────────────────────────────────────────────

#[derive(Deserialize)]
struct CaptureScreenRequest {
    /// 캡처 대상: "screen" (전체) | "window" (활성 창) | "selection" (영역)
    #[serde(default = "default_capture_target")]
    target: String,
    /// 결과 형식: "base64" | "tunnel" (cloudflared URL)
    #[serde(default = "default_capture_format")]
    format: String,
}

fn default_capture_target() -> String {
    "screen".to_string()
}

fn default_capture_format() -> String {
    "base64".to_string()
}

async fn cleanup_capture_file(path: &std::path::Path) {
    let _ = tokio::fs::remove_file(path).await;
}

#[cfg(target_os = "macos")]
fn frontmost_window_id() -> Result<String, String> {
    let output = std::process::Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to tell (first application process whose frontmost is true) to id of window 1",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "window_id_lookup_failed".to_string()
        } else {
            detail
        });
    }

    let window_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if window_id.is_empty() {
        return Err("window_id_empty".to_string());
    }
    Ok(window_id)
}

/// POST /api/capture/screen — 화면 캡처 → base64 또는 tunnel URL 반환
async fn capture_screen_handler(Json(req): Json<CaptureScreenRequest>) -> Response {
    use std::process::Command;

    let capture_target = match req.target.as_str() {
        "screen" | "window" | "selection" => req.target.as_str(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"ok": false, "error": "invalid_target"})),
            )
                .into_response();
        }
    };
    let capture_format = match req.format.as_str() {
        "base64" | "tunnel" => req.format.as_str(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"ok": false, "error": "invalid_format"})),
            )
                .into_response();
        }
    };

    #[cfg(target_os = "windows")]
    if capture_target != "screen" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "unsupported_target_on_windows",
            })),
        )
            .into_response();
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    if capture_target != "screen" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": "unsupported_target_on_linux",
            })),
        )
            .into_response();
    }

    // 임시 파일 경로
    let temp_dir = match video_tunnel::ensure_temp_upload_dir().await {
        Ok(d) => d,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"ok": false, "error": e.to_string()})),
            )
                .into_response();
        }
    };
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let capture_path = temp_dir.join(format!("capture-{}.png", timestamp));
    let capture_path_str = capture_path.to_string_lossy().to_string();

    // 플랫폼별 캡처 명령
    #[cfg(target_os = "macos")]
    let result = {
        let mut cmd = Command::new("screencapture");
        cmd.arg("-x"); // no sound
        match capture_target {
            "selection" => {
                cmd.arg("-i"); // interactive
            }
            "window" => {
                let window_id = match frontmost_window_id() {
                    Ok(id) => id,
                    Err(detail) => {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({
                                "ok": false,
                                "error": "window_id_lookup_failed",
                                "detail": detail,
                            })),
                        )
                            .into_response();
                    }
                };
                cmd.args(["-l", &window_id]);
            }
            _ => {} // screen (default)
        }
        cmd.arg(&capture_path_str);
        cmd.status()
    };

    #[cfg(target_os = "windows")]
    let result = {
        // PowerShell 스크립트에 경로를 직접 삽입하지 않고 env로 전달해 quoting/injection 방지
        let ps_cmd = r#"
            Add-Type -AssemblyName System.Windows.Forms
            Add-Type -AssemblyName System.Drawing
            $path = $env:CAPTURE_PATH
            if ([string]::IsNullOrWhiteSpace($path)) { throw "missing capture path" }
            $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
            $bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
            $g = [System.Drawing.Graphics]::FromImage($bmp)
            try {
                $g.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bmp.Size)
                $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
            } finally {
                $g.Dispose()
                $bmp.Dispose()
            }
        "#;
        platform::sync_cmd("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_cmd])
            .env("CAPTURE_PATH", &capture_path_str)
            .status()
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = {
        // Linux: ImageMagick import (있으면) 또는 gnome-screenshot
        let mut cmd = Command::new("import");
        cmd.arg("-window").arg("root").arg(&capture_path_str);
        cmd.status()
    };

    let status = match result {
        Ok(s) => s,
        Err(e) => {
            cleanup_capture_file(&capture_path).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "capture_command_failed",
                    "detail": e.to_string(),
                })),
            )
                .into_response();
        }
    };

    if !status.success() {
        cleanup_capture_file(&capture_path).await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "ok": false,
                "error": "capture_failed",
                "exit_code": status.code(),
            })),
        )
            .into_response();
    }

    // 결과 형식별 반환
    if capture_format == "tunnel" {
        // 터널 URL로 반환 (즉시 분석 가능)
        let manager = match tunnel_manager() {
            Some(m) => m,
            None => {
                cleanup_capture_file(&capture_path).await;
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(serde_json::json!({"ok": false, "error": "tunnel_not_initialized"})),
                )
                    .into_response();
            }
        };
        let open_req = video_tunnel::OpenRequest {
            file_path: capture_path_str.clone(),
            mime_type: "image/png".to_string(),
            ttl_secs: Some(600),
            max_fetches: None,
        };
        match manager.open(open_req).await {
            Ok(handle) => Json(serde_json::json!({
                "ok": true,
                "format": "tunnel",
                "url": handle.url,
                "token": handle.token,
                "size_bytes": handle.size_bytes,
            }))
            .into_response(),
            Err(e) => {
                cleanup_capture_file(&capture_path).await;
                tunnel_error_response(e)
            }
        }
    } else {
        // base64로 반환
        match tokio::fs::read(&capture_path).await {
            Ok(bytes) => {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                // 임시 파일 즉시 삭제 (base64는 in-memory)
                let _ = tokio::fs::remove_file(&capture_path).await;
                Json(serde_json::json!({
                    "ok": true,
                    "format": "base64",
                    "mime": "image/png",
                    "data": b64,
                    "size_bytes": bytes.len(),
                }))
                .into_response()
            }
            Err(e) => {
                cleanup_capture_file(&capture_path).await;
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"ok": false, "error": e.to_string()})),
                )
                    .into_response()
            }
        }
    }
}

/// POST /api/library/file-info — 단일 파일의 메타데이터 (size, mime, modified)
async fn library_file_info_handler(Json(req): Json<LibraryFileInfoRequest>) -> Response {
    use std::path::PathBuf;
    let path = PathBuf::from(&req.path);
    if !path.is_absolute() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "absolute_path_required"})),
        )
            .into_response();
    }
    let canonical = match std::fs::canonicalize(&path) {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"ok": false, "error": "not_found"})),
            )
                .into_response()
        }
    };

    // 화이트리스트
    let home = dirs::home_dir().unwrap_or_default();
    let home_canonical = std::fs::canonicalize(&home).unwrap_or(home);
    if !canonical.starts_with(&home_canonical) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"ok": false, "error": "outside_home"})),
        )
            .into_response();
    }

    let metadata = match std::fs::metadata(&canonical) {
        Ok(m) => m,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"ok": false, "error": "metadata_failed"})),
            )
                .into_response()
        }
    };
    if !metadata.is_file() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok": false, "error": "file_required"})),
        )
            .into_response();
    }

    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    Json(serde_json::json!({
        "ok": true,
        "path": canonical.to_string_lossy().to_string(),
        "name": canonical.file_name().and_then(|n| n.to_str()).unwrap_or(""),
        "size_bytes": metadata.len(),
        "mime": ext_mime(&ext).unwrap_or("application/octet-stream"),
        "is_video": VIDEO_EXTS.contains(&ext.to_lowercase().as_str()),
        "is_image": IMAGE_EXTS.contains(&ext.to_lowercase().as_str()),
        "is_audio": AUDIO_EXTS.contains(&ext.to_lowercase().as_str()),
    }))
    .into_response()
}

// ──────────────────────────────────────────────
// [v2.3] WebView 이미지 검색 — 실제 브라우저 사용
// 구글/네이버 봇 탐지 차단 불가능 (진짜 Chrome 엔진)
// ──────────────────────────────────────────────

async fn browser_google_search_handler(
    Json(req): Json<crate::browser_search::BrowserSearchRequest>,
) -> impl IntoResponse {
    if req.query.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "검색어 비어있음" })),
        )
            .into_response();
    }

    match crate::browser_search::google_image_search(&req.query, req.count, &req.hl).await {
        Ok(response) => Json(serde_json::json!(response)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e, "fallback": true })),
        )
            .into_response(),
    }
}

async fn browser_naver_search_handler(
    Json(req): Json<crate::browser_search::BrowserSearchRequest>,
) -> impl IntoResponse {
    if req.query.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "검색어 비어있음" })),
        )
            .into_response();
    }

    match crate::browser_search::naver_image_search(&req.query, req.count).await {
        Ok(response) => Json(serde_json::json!(response)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e, "fallback": true })),
        )
            .into_response(),
    }
}

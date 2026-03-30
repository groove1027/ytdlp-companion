use axum::{
    Router,
    extract::Query,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    body::Body,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;
use std::sync::OnceLock;
use tokio::sync::RwLock;
use tokio_util::io::ReaderStream;

use crate::{platform, ytdlp, rembg, whisper, tts};

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
    if tokio::process::Command::new(python).args(["-c", "import rembg"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("rembg".to_string());
    }
    // whisper
    let whisper_bin = if cfg!(target_os = "windows") { "whisper/whisper-cli.exe" } else { "whisper/whisper-cpp" };
    if dirs::data_dir().map(|d| d.join("ytdlp-companion").join(whisper_bin).exists()).unwrap_or(false) {
        services.push("whisper".to_string());
    }
    // TTS (Qwen3 > Kokoro > Piper)
    if tokio::process::Command::new(python).args(["-c", "from qwen_tts import Qwen3TTSModel; print('ok')"]).output().await.map(|o| o.status.success()).unwrap_or(false)
       || tokio::process::Command::new(python).args(["-c", "from transformers import AutoTokenizer; print('ok')"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("tts-qwen3".to_string());
    }
    if tokio::process::Command::new(python).args(["-c", "from kokoro_onnx import Kokoro"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
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
    if tokio::process::Command::new(&ffmpeg_path).args(["-version"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
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
    // CORS: localhost + 앱 도메인만 허용 (외부 악성 사이트 차단)
    let allowed_origins = [
        "http://localhost:5173".parse::<axum::http::HeaderValue>().unwrap(),
        "http://localhost:5174".parse::<axum::http::HeaderValue>().unwrap(),
        "http://localhost:3000".parse::<axum::http::HeaderValue>().unwrap(),
        "https://all-in-one-production.pages.dev".parse::<axum::http::HeaderValue>().unwrap(),
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
        // Voice Cloning (Qwen3-TTS CustomVoice)
        .route("/api/tts/clone", post(tts_clone_handler))
        .route("/api/tts/voices/custom", get(tts_custom_voices_handler))
        .route("/api/tts/voices/custom/save", post(tts_save_voice_handler))
        .route("/api/tts/voices/custom/delete", post(tts_delete_voice_handler))
        // NLE 직접 설치 (CapCut/Premiere/Filmora)
        .route("/api/nle/install", post(nle_install_handler))
        // FFmpeg 인코딩
        .route("/api/ffmpeg/transcode", post(ffmpeg_transcode_handler))
        .layer(cors)
        // base64 인코딩된 미디어 파일 수신 — 기본 2MB → 200MB로 확장
        .layer(axum::extract::DefaultBodyLimit::max(200 * 1024 * 1024));

    let addr = SocketAddr::from(([127, 0, 0, 1], 9876));
    println!("[Companion] 서버 시작: http://{}", addr);

    // [FIX #914] 서비스 감지를 백그라운드에서 실행 — health check 즉시 응답 가능
    tokio::spawn(async {
        // 초기 감지 + 5분 주기 갱신
        // 루프가 영구 지속되도록 개별 iteration 에러를 catch
        loop {
            let result = detect_services().await;
            *cached_health().write().await = result;
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        }
    });

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
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
    // 커스텀 음성도 포함
    voices["custom"] = serde_json::json!(tts::list_custom_voices());
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
            // CapCut 경로 패치
            if req.target == "capcut" {
                text = text.replace(&placeholder, &project_path_str);
                text = text.replace(
                    "\"path\":\"materials/",
                    &format!("\"path\":\"{}/materials/", project_path_str),
                );
                text = text.replace(
                    "\"media_path\":\"materials/",
                    &format!("\"media_path\":\"{}/materials/", project_path_str),
                );
                // draft_fold_path, draft_root_path 패치
                let fold_re = regex_lite::Regex::new(r#""draft_fold_path":"[^"]*""#).unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = fold_re.replace_all(&text, &format!("\"draft_fold_path\":\"{}\"", project_path_str)).to_string();
                let root_re = regex_lite::Regex::new(r#""draft_root_path":"[^"]*""#).unwrap_or_else(|_| regex_lite::Regex::new(r#"NOMATCH"#).unwrap());
                text = root_re.replace_all(&text, &format!("\"draft_root_path\":\"{}\"", root_path_str)).to_string();
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
                    let _ = tokio::process::Command::new("cmd")
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
                            { let _ = tokio::process::Command::new("cmd").args(["/c", "start", "", &path.to_string_lossy()]).spawn(); }
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
    let output = tokio::process::Command::new(&ffmpeg).args(&args).output().await;

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
// 핸들러: /api/google-proxy (로컬 IP로 구글 검색)
// ──────────────────────────────────────────────

async fn google_proxy_handler(Json(req): Json<GoogleProxyRequest>) -> impl IntoResponse {
    // URL 허용 목록 (구글/빙 이미지 검색만)
    let allowed_hosts = ["www.google.com", "www.google.co.kr", "www.bing.com", "en.wikipedia.org", "commons.wikimedia.org"];
    let parsed = url::Url::parse(&req.target_url).ok();
    let host = parsed.as_ref().and_then(|u| u.host_str().map(String::from)).unwrap_or_default();
    if !allowed_hosts.iter().any(|h| host.ends_with(h)) {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("허용되지 않은 호스트: {}", host) }))).into_response();
    }

    // 리다이렉트 비활성화 — SSRF 방지 (allowlist 우회 차단)
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap_or_default();

    let mut request = client.get(&req.target_url);

    // 헤더 설정
    if let Some(headers) = &req.headers {
        for (k, v) in headers {
            request = request.header(k.as_str(), v.as_str());
        }
    }
    if let Some(cookie) = &req.cookie {
        request = request.header("Cookie", cookie.as_str());
    }

    match request.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let content_type = res.headers().get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("text/html")
                .to_string();
            let body = res.bytes().await.unwrap_or_default();

            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", content_type.parse().unwrap_or("text/html".parse().unwrap()));
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
    let output = tokio::process::Command::new("mflux-generate")
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

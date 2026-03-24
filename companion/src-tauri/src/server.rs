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
use tokio_util::io::ReaderStream;

use crate::{ytdlp, rembg, whisper, tts};

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
        // 음성 합성 (Piper TTS)
        .route("/api/tts", post(tts_handler))
        // FFmpeg 인코딩
        .route("/api/ffmpeg/transcode", post(ffmpeg_transcode_handler))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 9876));
    println!("[Companion] 서버 시작: http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

// ──────────────────────────────────────────────
// 핸들러: /health
// ──────────────────────────────────────────────

async fn health_handler() -> Json<HealthResponse> {
    let ytdlp_version = ytdlp::get_version().await.unwrap_or_else(|_| "unknown".to_string());

    // 사용 가능한 서비스 목록
    let mut services = vec!["ytdlp".to_string(), "download".to_string(), "frames".to_string()];
    // rembg 확인
    if tokio::process::Command::new("python3").args(["-c", "import rembg"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("rembg".to_string());
    }
    // whisper 확인
    if dirs::data_dir().map(|d| d.join("ytdlp-companion/whisper/whisper-cpp").exists()).unwrap_or(false) {
        services.push("whisper".to_string());
    }
    // TTS 확인 (Kokoro 우선, Piper 폴백)
    if tokio::process::Command::new("python3").args(["-c", "from kokoro_onnx import Kokoro"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("tts-kokoro".to_string());
    } else if dirs::data_dir().map(|d| d.join("ytdlp-companion/piper/piper").exists()).unwrap_or(false) {
        services.push("tts-piper".to_string());
    }
    // ffmpeg 확인
    if tokio::process::Command::new("ffmpeg").args(["-version"]).output().await.map(|o| o.status.success()).unwrap_or(false) {
        services.push("ffmpeg".to_string());
    }

    let last_update_check = ytdlp::last_update_check_ts();

    Json(HealthResponse {
        app: "ytdlp-companion".to_string(),
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        ytdlp_version,
        last_update_check,
        services,
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

            let mut headers = HeaderMap::new();
            headers.insert(
                "Content-Type",
                downloaded.content_type.parse().unwrap_or("video/mp4".parse().unwrap()),
            );
            headers.insert(
                "Content-Disposition",
                format!("attachment; filename=\"{}\"", downloaded.filename).parse().unwrap(),
            );
            headers.insert(
                "Content-Length",
                downloaded.size.to_string().parse().unwrap(),
            );

            // downloaded를 스트리밍 완료까지 유지 (drop 시 tmp_dir 삭제됨)
            // Body가 소비되면 자동으로 drop → 임시 파일 정리
            let response = (StatusCode::OK, headers, body).into_response();

            // _tmp_dir을 response 수명에 연결하기 위해 extension에 저장
            // (axum은 response body가 전송 완료될 때까지 핸들러 반환값을 유지)
            // downloaded 변수가 이 스코프에서 살아있으므로 OK
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

            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", downloaded.content_type.parse().unwrap_or("video/mp4".parse().unwrap()));
            headers.insert("Content-Disposition", format!("attachment; filename=\"{}\"", downloaded.filename).parse().unwrap());
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
    match tts::synthesize_speech(&req.text, req.language.as_deref()).await {
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
// 핸들러: /api/ffmpeg/transcode (네이티브 FFmpeg)
// ──────────────────────────────────────────────

async fn ffmpeg_transcode_handler(Json(req): Json<FfmpegTranscodeRequest>) -> impl IntoResponse {
    use base64::Engine;
    let input_data = match base64::engine::general_purpose::STANDARD.decode(&req.input) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": format!("Base64 디코딩 실패: {}", e) }))).into_response(),
    };

    let in_ext = req.input_format.as_deref().unwrap_or("mp4");
    let tmp_input = tempfile::Builder::new().suffix(&format!(".{}", in_ext)).tempfile().unwrap();
    let tmp_output = tempfile::Builder::new().suffix(&format!(".{}", req.output_format)).tempfile().unwrap();

    let input_path = tmp_input.path().to_string_lossy().to_string();
    let output_path = tmp_output.path().to_string_lossy().to_string();

    if let Err(e) = std::fs::write(&input_path, &input_data) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("파일 쓰기 실패: {}", e) }))).into_response();
    }

    // 허용된 ffmpeg 인자만 통과 (인젝션 방지)
    const ALLOWED_PREFIXES: &[&str] = &[
        "-c:", "-codec:", "-b:", "-r", "-s", "-vf", "-af", "-filter:",
        "-preset", "-crf", "-qp", "-ar", "-ac", "-t", "-ss", "-to",
        "-map", "-threads", "-pix_fmt", "-movflags", "-f",
    ];
    let mut args = vec!["-i".to_string(), input_path, "-y".to_string()];
    if let Some(extra_args) = &req.args {
        for arg in extra_args {
            let is_allowed = ALLOWED_PREFIXES.iter().any(|p| arg.starts_with(p))
                || !arg.starts_with('-'); // 값 인자 (e.g., "libx264", "1920x1080")
            if is_allowed {
                args.push(arg.clone());
            }
        }
    }
    args.push(output_path.clone());

    let output = tokio::process::Command::new("ffmpeg").args(&args).output().await;

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
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": format!("mflux 실행 불가: {}. 'pip3 install mflux'로 설치해주세요.", e) }))).into_response(),
    }
}

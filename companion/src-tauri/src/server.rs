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

use crate::ytdlp;

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

// ──────────────────────────────────────────────
// 서버 시작
// ──────────────────────────────────────────────

pub async fn start_server(_app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/api/extract", get(extract_handler))
        .route("/api/download", get(download_handler))
        .route("/api/frames", post(frames_handler))
        .route("/api/social/metadata", post(social_metadata_handler))
        .route("/api/social/download", post(social_download_handler))
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
    Json(HealthResponse {
        app: "ytdlp-companion".to_string(),
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        ytdlp_version,
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
        Ok((data, filename, content_type)) => {
            let mut headers = HeaderMap::new();
            headers.insert(
                "Content-Type",
                content_type.parse().unwrap_or("video/mp4".parse().unwrap()),
            );
            headers.insert(
                "Content-Disposition",
                format!("attachment; filename=\"{}\"", filename).parse().unwrap(),
            );
            headers.insert(
                "Content-Length",
                data.len().to_string().parse().unwrap(),
            );
            (StatusCode::OK, headers, Body::from(data)).into_response()
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
        Ok((data, filename, content_type)) => {
            let mut headers = HeaderMap::new();
            headers.insert("Content-Type", content_type.parse().unwrap_or("video/mp4".parse().unwrap()));
            headers.insert("Content-Disposition", format!("attachment; filename=\"{}\"", filename).parse().unwrap());
            headers.insert("Content-Length", data.len().to_string().parse().unwrap());
            (StatusCode::OK, headers, Body::from(data)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        ).into_response(),
    }
}

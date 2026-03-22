use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::Command as AsyncCommand;

// ──────────────────────────────────────────────
// yt-dlp 바이너리 경로
// ──────────────────────────────────────────────

fn get_ytdlp_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion")
}

fn get_ytdlp_path() -> PathBuf {
    let dir = get_ytdlp_dir();
    if cfg!(target_os = "windows") {
        dir.join("yt-dlp.exe")
    } else {
        dir.join("yt-dlp")
    }
}

fn get_ffmpeg_path() -> PathBuf {
    // 1순위: Homebrew ffmpeg
    let brew = PathBuf::from("/opt/homebrew/bin/ffmpeg");
    if brew.exists() { return brew; }
    let brew2 = PathBuf::from("/usr/local/bin/ffmpeg");
    if brew2.exists() { return brew2; }
    // 2순위: 번들 ffmpeg
    let dir = get_ytdlp_dir();
    if cfg!(target_os = "windows") {
        dir.join("ffmpeg.exe")
    } else {
        dir.join("ffmpeg")
    }
}

// ──────────────────────────────────────────────
// yt-dlp 자동 다운로드 + 업데이트
// ──────────────────────────────────────────────

pub async fn ensure_ytdlp() -> Result<(), Box<dyn std::error::Error>> {
    let dir = get_ytdlp_dir();
    std::fs::create_dir_all(&dir)?;

    let ytdlp_path = get_ytdlp_path();
    if !ytdlp_path.exists() {
        println!("[yt-dlp] 바이너리 다운로드 중...");
        download_ytdlp(&ytdlp_path).await?;
        println!("[yt-dlp] 다운로드 완료");
    }

    // 백그라운드 업데이트 체크
    let path = ytdlp_path.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(6 * 3600)).await;
            println!("[yt-dlp] 자동 업데이트 체크...");
            if let Err(e) = update_ytdlp(&path).await {
                eprintln!("[yt-dlp] 업데이트 실패: {}", e);
            }
        }
    });

    Ok(())
}

async fn download_ytdlp(path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let url = get_ytdlp_download_url();
    let client = reqwest::Client::new();
    let bytes = client.get(&url).send().await?.bytes().await?;
    std::fs::write(path, &bytes)?;

    // 실행 권한 부여 (Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
    }

    Ok(())
}

async fn update_ytdlp(path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let output = AsyncCommand::new(path)
        .args(["--update"])
        .output()
        .await?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("Updated") {
            println!("[yt-dlp] 업데이트 완료: {}", stdout.trim());
        }
    }
    Ok(())
}

fn get_ytdlp_download_url() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    match (os, arch) {
        ("macos", "aarch64") => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos".to_string(),
        ("macos", _) => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos".to_string(),
        ("windows", _) => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe".to_string(),
        ("linux", _) => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux".to_string(),
        _ => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp".to_string(),
    }
}

// ──────────────────────────────────────────────
// yt-dlp 버전 확인
// ──────────────────────────────────────────────

pub async fn get_version() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let path = get_ytdlp_path();
    if !path.exists() {
        return Ok("not installed".to_string());
    }

    let output = AsyncCommand::new(&path)
        .args(["--version"])
        .output()
        .await?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

// ──────────────────────────────────────────────
// 스트림 URL 추출
// ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
pub struct StreamResult {
    pub url: String,
    #[serde(rename = "audioUrl")]
    pub audio_url: Option<String>,
    pub title: String,
    pub duration: f64,
    pub thumbnail: String,
    pub width: u32,
    pub height: u32,
    pub filesize: Option<u64>,
    pub format: String,
    pub codec: String,
    pub cached: bool,
}

pub async fn extract_stream_url(
    video_url: &str,
    quality: &str,
) -> Result<StreamResult, Box<dyn std::error::Error + Send + Sync>> {
    let path = get_ytdlp_path();
    let format_spec = quality_to_format(quality);

    let output = AsyncCommand::new(&path)
        .args([
            "--dump-json",
            "--no-playlist",
            "-f", &format_spec,
            video_url,
        ])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp 실패: {}", stderr.lines().last().unwrap_or("unknown error")).into());
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)?;

    Ok(StreamResult {
        url: json["url"].as_str().unwrap_or("").to_string(),
        audio_url: json["audio_url"].as_str().map(|s| s.to_string())
            .or_else(|| {
                json["requested_formats"]
                    .as_array()
                    .and_then(|f| f.get(1))
                    .and_then(|a| a["url"].as_str())
                    .map(|s| s.to_string())
            }),
        title: json["title"].as_str().unwrap_or("").to_string(),
        duration: json["duration"].as_f64().unwrap_or(0.0),
        thumbnail: json["thumbnail"].as_str().unwrap_or("").to_string(),
        width: json["width"].as_u64().unwrap_or(0) as u32,
        height: json["height"].as_u64().unwrap_or(0) as u32,
        filesize: json["filesize"].as_u64().or(json["filesize_approx"].as_u64()),
        format: quality.to_string(),
        codec: json["vcodec"].as_str().unwrap_or("").to_string(),
        cached: false,
    })
}

// ──────────────────────────────────────────────
// 영상 다운로드 (스트리밍 — 파일 경로 반환)
// ──────────────────────────────────────────────

/// 다운로드된 파일 정보 (메모리에 올리지 않음)
pub struct DownloadedFile {
    pub path: std::path::PathBuf,
    pub filename: String,
    pub content_type: String,
    pub size: u64,
    /// tempdir 핸들 — drop 시 자동 삭제. 스트리밍 완료까지 유지해야 함.
    pub _tmp_dir: tempfile::TempDir,
}

pub async fn download_video(
    video_url: &str,
    quality: &str,
    video_only: bool,
) -> Result<DownloadedFile, Box<dyn std::error::Error + Send + Sync>> {
    let path = get_ytdlp_path();
    let format_spec = if video_only {
        quality_to_format_video_only(quality)
    } else {
        quality_to_format(quality)
    };

    let tmp_dir = tempfile::tempdir()?;
    let output_template = tmp_dir.path().join("%(title).50s.%(ext)s");

    let mut args = vec![
        "--no-playlist".to_string(),
        "-f".to_string(),
        format_spec,
        "-o".to_string(),
        output_template.to_string_lossy().to_string(),
    ];

    // ffmpeg가 있으면 사용
    let ffmpeg = get_ffmpeg_path();
    if ffmpeg.exists() {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg.to_string_lossy().to_string());
    }

    // 머지 포맷
    if !video_only {
        args.push("--merge-output-format".to_string());
        args.push("mp4".to_string());
    }

    args.push(video_url.to_string());

    let output = AsyncCommand::new(&path)
        .args(&args)
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp 다운로드 실패: {}", stderr.lines().last().unwrap_or("unknown")).into());
    }

    // 다운로드된 파일 찾기 (가장 큰 파일)
    let mut files: Vec<_> = std::fs::read_dir(tmp_dir.path())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .collect();
    files.sort_by_key(|f| std::cmp::Reverse(f.metadata().map(|m| m.len()).unwrap_or(0)));

    let file = files.first()
        .ok_or("다운로드된 파일을 찾을 수 없습니다")?;

    let file_path = file.path();
    let filename = file.file_name().to_string_lossy().to_string();
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let content_type = if filename.ends_with(".mp4") {
        "video/mp4"
    } else if filename.ends_with(".webm") {
        "video/webm"
    } else if filename.ends_with(".m4a") || filename.ends_with(".mp3") {
        "audio/mp4"
    } else {
        "application/octet-stream"
    };

    Ok(DownloadedFile {
        path: file_path,
        filename,
        content_type: content_type.to_string(),
        size,
        _tmp_dir: tmp_dir, // 스트리밍 완료까지 유지
    })
}

// ──────────────────────────────────────────────
// 프레임 추출 (ffmpeg 기반)
// ──────────────────────────────────────────────

#[derive(Serialize)]
pub struct FrameResult {
    pub t: f64,
    pub url: String, // data:image/jpeg;base64,...
}

pub async fn extract_frames(
    video_url: &str,
    timecodes: &[f64],
    width: u32,
) -> Result<Vec<FrameResult>, Box<dyn std::error::Error + Send + Sync>> {
    // 먼저 스트림 URL을 추출
    let info = extract_stream_url(video_url, "best").await?;
    let stream_url = &info.url;

    let ffmpeg = get_ffmpeg_path();
    let ffmpeg_cmd = if ffmpeg.exists() {
        ffmpeg.to_string_lossy().to_string()
    } else {
        // 시스템 ffmpeg 사용 시도
        "ffmpeg".to_string()
    };

    let mut frames = Vec::new();
    for &t in timecodes.iter().take(50) {
        let tmp = tempfile::NamedTempFile::new()?;
        let output_path = tmp.path().to_string_lossy().to_string() + ".jpg";

        let result = AsyncCommand::new(&ffmpeg_cmd)
            .args([
                "-ss", &t.to_string(),
                "-i", stream_url,
                "-vframes", "1",
                "-vf", &format!("scale={}:-1", width),
                "-q:v", "3",
                "-y",
                &output_path,
            ])
            .output()
            .await;

        if let Ok(out) = result {
            if out.status.success() {
                if let Ok(bytes) = std::fs::read(&output_path) {
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    frames.push(FrameResult {
                        t,
                        url: format!("data:image/jpeg;base64,{}", b64),
                    });
                }
            }
        }
        let _ = std::fs::remove_file(&output_path);
    }

    Ok(frames)
}

// ──────────────────────────────────────────────
// 소셜 미디어 메타데이터
// ──────────────────────────────────────────────

pub async fn get_social_metadata(
    url: &str,
    include_comments: bool,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let path = get_ytdlp_path();

    let mut args = vec![
        "--dump-json".to_string(),
        "--no-playlist".to_string(),
    ];

    if include_comments {
        args.push("--write-comments".to_string());
    }

    args.push(url.to_string());

    let output = AsyncCommand::new(&path)
        .args(&args)
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("메타데이터 추출 실패: {}", stderr.lines().last().unwrap_or("unknown")).into());
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)?;

    let comments: Vec<serde_json::Value> = if include_comments {
        json["comments"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .take(100)
            .map(|c| serde_json::json!({
                "author": c["author"].as_str().unwrap_or(""),
                "text": c["text"].as_str().unwrap_or(""),
                "likeCount": c["like_count"].as_u64().unwrap_or(0),
                "timestamp": c["timestamp"].as_u64().unwrap_or(0),
            }))
            .collect()
    } else {
        vec![]
    };

    Ok(serde_json::json!({
        "title": json["title"].as_str().unwrap_or(""),
        "description": json["description"].as_str().unwrap_or(""),
        "uploader": json["uploader"].as_str().unwrap_or(""),
        "platform": json["extractor"].as_str().unwrap_or(""),
        "duration": json["duration"].as_f64().unwrap_or(0.0),
        "thumbnail": json["thumbnail"].as_str().unwrap_or(""),
        "viewCount": json["view_count"].as_u64().unwrap_or(0),
        "likeCount": json["like_count"].as_u64().unwrap_or(0),
        "commentCount": json["comment_count"].as_u64().unwrap_or(0),
        "uploadDate": json["upload_date"].as_str().unwrap_or(""),
        "comments": comments,
    }))
}

// ──────────────────────────────────────────────
// 화질 → yt-dlp format 매핑
// ──────────────────────────────────────────────

fn quality_to_format(quality: &str) -> String {
    match quality {
        "1080p" => "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best".to_string(),
        "720p" => "bestvideo[height<=720]+bestaudio/best[height<=720]/best".to_string(),
        "480p" => "bestvideo[height<=480]+bestaudio/best[height<=480]/best".to_string(),
        "360p" => "bestvideo[height<=360]+bestaudio/best[height<=360]/best".to_string(),
        "audio" => "bestaudio/best".to_string(),
        _ => "bestvideo+bestaudio/best".to_string(),
    }
}

fn quality_to_format_video_only(quality: &str) -> String {
    match quality {
        "1080p" => "bestvideo[height<=1080]/best[height<=1080]".to_string(),
        "720p" => "bestvideo[height<=720]/best[height<=720]".to_string(),
        "480p" => "bestvideo[height<=480]/best[height<=480]".to_string(),
        "360p" => "bestvideo[height<=360]/best[height<=360]".to_string(),
        _ => "bestvideo/best".to_string(),
    }
}

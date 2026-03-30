use serde::Serialize;
use std::path::PathBuf;
use crate::platform;

fn get_whisper_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion").join("whisper")
}

fn get_whisper_bin() -> PathBuf {
    if cfg!(target_os = "windows") {
        // Windows: 번들 바이너리
        get_whisper_dir().join("whisper-cli.exe")
    } else {
        // macOS/Linux: Homebrew 우선 → 번들
        let brew_path = PathBuf::from("/opt/homebrew/bin/whisper-cli");
        if brew_path.exists() { return brew_path; }
        let brew_path2 = PathBuf::from("/usr/local/bin/whisper-cli");
        if brew_path2.exists() { return brew_path2; }
        get_whisper_dir().join("whisper-cpp")
    }
}

fn get_whisper_model() -> PathBuf {
    get_whisper_dir().join("ggml-large-v3-turbo.bin")
}

/// whisper.cpp 바이너리 + 모델 자동 다운로드
pub async fn ensure_whisper() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_whisper_dir();
    std::fs::create_dir_all(&dir)?;

    let bin = get_whisper_bin();
    if !bin.exists() {
        println!("[whisper] 바이너리 다운로드 중...");
        let url = get_whisper_download_url();
        let client = reqwest::Client::new();
        let bytes = client.get(&url).send().await?.bytes().await?;

        if cfg!(target_os = "windows") {
            // Windows: ZIP 압축 해제 — 경로에 특수문자 대비 큰따옴표 사용
            let zip_path = dir.join("whisper-cli.zip");
            std::fs::write(&zip_path, &bytes)?;
            let output = platform::async_cmd("powershell")
                .args([
                    "-NoProfile", "-Command",
                    &format!(
                        "Expand-Archive -Path \"{}\" -DestinationPath \"{}\" -Force",
                        zip_path.to_string_lossy(),
                        dir.to_string_lossy()
                    ),
                ])
                .output()
                .await?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("whisper ZIP 해제 실패: {}", stderr).into());
            }
            // ZIP 안의 whisper-cli.exe와 사이드카 DLL을 모두 whisper 디렉토리로 이동
            // (DLL 없이 exe만 이동하면 런타임 에러 발생)
            let extracted = find_exe_in_dir(&dir, "whisper-cli.exe");
            if let Some(found) = extracted {
                let found_parent = found.parent().unwrap().to_path_buf();
                // exe가 하위 폴더에 있으면 해당 폴더 내 모든 파일을 whisper 디렉토리로 이동
                if found_parent != dir {
                    let mut all_moved = true;
                    if let Ok(entries) = std::fs::read_dir(&found_parent) {
                        for entry in entries.flatten() {
                            let src = entry.path();
                            if src.is_file() {
                                let dst = dir.join(entry.file_name());
                                if std::fs::rename(&src, &dst).is_err() {
                                    match std::fs::copy(&src, &dst) {
                                        Ok(_) => { let _ = std::fs::remove_file(&src); }
                                        Err(e) => {
                                            eprintln!("[whisper] DLL 복사 실패 (원본 유지): {} → {} ({})", src.display(), dst.display(), e);
                                            all_moved = false;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // 모든 파일이 성공적으로 이동된 경우에만 하위 폴더 정리
                    if all_moved {
                        let _ = std::fs::remove_dir_all(&found_parent);
                    }
                }
            } else {
                return Err("whisper ZIP에서 whisper-cli.exe를 찾을 수 없습니다".into());
            }
            let _ = std::fs::remove_file(&zip_path);
        } else {
            // macOS/Linux: 단일 바이너리
            std::fs::write(&bin, &bytes)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))?;
            }
        }
        println!("[whisper] 바이너리 다운로드 완료");
    }

    let model = get_whisper_model();
    if !model.exists() {
        println!("[whisper] 모델 다운로드 중 (large-v3-turbo, ~800MB)...");
        let model_url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin";
        let client = reqwest::Client::new();
        let response = client.get(model_url).send().await?;

        // 스트리밍 다운로드 (메모리에 800MB 로드하지 않음)
        let mut file = tokio::fs::File::create(&model).await?;
        let mut stream = response.bytes_stream();
        use tokio::io::AsyncWriteExt;
        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk).await?;
        }
        file.flush().await?;
        println!("[whisper] 모델 다운로드 완료");
    }

    Ok(())
}

/// ZIP 해제 후 디렉토리 내에서 특정 exe 찾기 (재귀)
fn find_exe_in_dir(dir: &PathBuf, name: &str) -> Option<PathBuf> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.file_name().map(|n| n == name).unwrap_or(false) {
                return Some(path);
            }
            if path.is_dir() {
                if let Some(found) = find_exe_in_dir(&path, name) {
                    return Some(found);
                }
            }
        }
    }
    None
}

fn get_whisper_download_url() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    // whisper.cpp GitHub releases
    match (os, arch) {
        ("macos", "aarch64") => "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-cli-v1.7.5-bin-macos-arm64".to_string(),
        ("macos", _) => "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-cli-v1.7.5-bin-macos-x86_64".to_string(),
        ("windows", _) => "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-cli-v1.7.5-bin-x64.zip".to_string(),
        _ => "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-cli-v1.7.5-bin-linux-x86_64".to_string(),
    }
}

#[derive(Serialize)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Serialize)]
pub struct TranscriptResult {
    pub text: String,
    pub segments: Vec<TranscriptSegment>,
    pub language: String,
}

/// 음성 → 텍스트 변환 (whisper.cpp 로컬)
pub async fn transcribe(
    audio_data: &[u8],
    language: Option<&str>,
) -> Result<TranscriptResult, Box<dyn std::error::Error + Send + Sync>> {
    let bin = get_whisper_bin();
    let model = get_whisper_model();

    if !bin.exists() || !model.exists() {
        return Err("whisper.cpp가 설치되지 않았습니다. 앱을 재시작해주세요.".into());
    }

    // 임시 wav 파일로 저장
    let tmp_audio = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let audio_path = tmp_audio.path().to_string_lossy().to_string();
    std::fs::write(&audio_path, audio_data)?;

    let tmp_output = tempfile::Builder::new().suffix(".json").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    let mut args = vec![
        "-m".to_string(), model.to_string_lossy().to_string(),
        "-f".to_string(), audio_path.clone(),
        "-oj".to_string(), // JSON output
        "-of".to_string(), output_path.replace(".json", ""),
        "--threads".to_string(), "4".to_string(),
    ];

    if let Some(lang) = language {
        args.push("-l".to_string());
        args.push(lang.to_string());
    } else {
        args.push("-l".to_string());
        args.push("auto".to_string());
    }

    let output = platform::async_cmd(&bin)
        .args(&args)
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("whisper.cpp 실행 실패: {}", stderr.lines().last().unwrap_or("unknown")).into());
    }

    // JSON 결과 파싱
    let json_path = output_path;
    if let Ok(json_str) = std::fs::read_to_string(&json_path) {
        let json: serde_json::Value = serde_json::from_str(&json_str)?;

        let language = json["result"]["language"].as_str().unwrap_or("unknown").to_string();
        let mut full_text = String::new();
        let mut segments = Vec::new();

        if let Some(segs) = json["transcription"].as_array() {
            for seg in segs {
                let text = seg["text"].as_str().unwrap_or("").to_string();
                let start_ms = seg["offsets"]["from"].as_u64().unwrap_or(0);
                let end_ms = seg["offsets"]["to"].as_u64().unwrap_or(0);
                full_text.push_str(&text);
                full_text.push(' ');
                segments.push(TranscriptSegment {
                    start: start_ms as f64 / 1000.0,
                    end: end_ms as f64 / 1000.0,
                    text,
                });
            }
        }

        return Ok(TranscriptResult {
            text: full_text.trim().to_string(),
            segments,
            language,
        });
    }

    Err("whisper.cpp 결과 파일을 찾을 수 없습니다".into())
}

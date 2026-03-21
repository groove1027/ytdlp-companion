use tokio::process::Command as AsyncCommand;
use serde::Serialize;
use std::path::PathBuf;

fn get_whisper_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion").join("whisper")
}

fn get_whisper_bin() -> PathBuf {
    get_whisper_dir().join("whisper-cpp")
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
        std::fs::write(&bin, &bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))?;
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

fn get_whisper_download_url() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    // whisper.cpp GitHub releases
    match (os, arch) {
        ("macos", "aarch64") => "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-cli-v1.7.5-bin-macos-arm64".to_string(),
        ("macos", _) => "https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-cli-v1.7.5-bin-macos-x86_64".to_string(),
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

    let output = AsyncCommand::new(&bin)
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

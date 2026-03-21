use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;

fn get_piper_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion").join("piper")
}

fn get_piper_bin() -> PathBuf {
    get_piper_dir().join("piper")
}

/// Piper TTS 바이너리 + 한국어 모델 자동 다운로드
pub async fn ensure_piper() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_piper_dir();
    std::fs::create_dir_all(&dir)?;

    let bin = get_piper_bin();
    if !bin.exists() {
        println!("[piper] 바이너리 다운로드 중...");
        let url = get_piper_download_url();
        let client = reqwest::Client::new();
        let bytes = client.get(&url).send().await?.bytes().await?;

        // tar.gz 압축 해제
        let tmp = tempfile::Builder::new().suffix(".tar.gz").tempfile()?;
        std::fs::write(tmp.path(), &bytes)?;

        let untar = AsyncCommand::new("tar")
            .args(["xzf", &tmp.path().to_string_lossy(), "-C", &dir.to_string_lossy(), "--strip-components=1"])
            .output()
            .await?;

        if !untar.status.success() {
            // tar.gz가 아닌 단일 바이너리일 수 있음
            std::fs::write(&bin, &bytes)?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if bin.exists() {
                std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))?;
            }
        }
        println!("[piper] 바이너리 다운로드 완료");
    }

    // 한국어 모델 다운로드
    let model_path = dir.join("ko-KR-model.onnx");
    if !model_path.exists() {
        println!("[piper] 한국어 모델 다운로드 중...");
        let model_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx";
        let config_url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx.json";

        let client = reqwest::Client::new();
        let model_bytes = client.get(model_url).send().await?.bytes().await?;
        std::fs::write(&model_path, &model_bytes)?;

        let config_bytes = client.get(config_url).send().await?.bytes().await?;
        std::fs::write(dir.join("ko-KR-model.onnx.json"), &config_bytes)?;

        println!("[piper] 한국어 모델 다운로드 완료");
    }

    Ok(())
}

fn get_piper_download_url() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    match (os, arch) {
        ("macos", "aarch64") => "https://github.com/rhasspy/piper/releases/latest/download/piper_macos_aarch64.tar.gz".to_string(),
        ("macos", _) => "https://github.com/rhasspy/piper/releases/latest/download/piper_macos_x64.tar.gz".to_string(),
        ("linux", _) => "https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz".to_string(),
        ("windows", _) => "https://github.com/rhasspy/piper/releases/latest/download/piper_windows_amd64.zip".to_string(),
        _ => "https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz".to_string(),
    }
}

/// 텍스트 → 음성 변환 (Piper TTS 로컬)
pub async fn synthesize_speech(
    text: &str,
    language: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let bin = get_piper_bin();
    let dir = get_piper_dir();

    if !bin.exists() {
        return Err("Piper TTS가 설치되지 않았습니다. 앱을 재시작해주세요.".into());
    }

    // 언어에 따라 모델 선택
    let model = match language {
        Some("en") | Some("english") => dir.join("en-US-model.onnx"),
        _ => dir.join("ko-KR-model.onnx"), // 기본 한국어
    };

    if !model.exists() {
        return Err(format!("TTS 모델이 없습니다: {:?}", model).into());
    }

    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    let output = AsyncCommand::new(&bin)
        .args([
            "--model", &model.to_string_lossy(),
            "--output_file", &output_path,
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?
        .wait_with_output()
        .await?;

    // stdin으로 텍스트 전달하는 대안: echo | piper
    if !std::path::Path::new(&output_path).exists() || std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0) == 0 {
        // echo 방식 시도
        let output2 = AsyncCommand::new("sh")
            .args(["-c", &format!("echo '{}' | '{}' --model '{}' --output_file '{}'",
                text.replace('\'', "'\\''"),
                bin.to_string_lossy(),
                model.to_string_lossy(),
                output_path,
            )])
            .output()
            .await?;

        if !output2.status.success() {
            let stderr = String::from_utf8_lossy(&output2.stderr);
            return Err(format!("Piper TTS 실행 실패: {}", stderr).into());
        }
    }

    let wav_data = std::fs::read(&output_path)?;
    if wav_data.is_empty() {
        return Err("TTS 출력 파일이 비어있습니다".into());
    }

    Ok(wav_data)
}

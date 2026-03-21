use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;

/// Kokoro TTS 설치 확인 + 자동 설치
pub async fn ensure_tts() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Kokoro 설치 확인
    let check = AsyncCommand::new("python3")
        .args(["-c", "import kokoro; print(kokoro.__version__)"])
        .output()
        .await;

    if let Ok(out) = check {
        if out.status.success() {
            let ver = String::from_utf8_lossy(&out.stdout);
            println!("[TTS] Kokoro 설치됨 (v{})", ver.trim());
            return Ok(());
        }
    }

    println!("[TTS] Kokoro 설치 중...");
    let install = AsyncCommand::new("pip3")
        .args(["install", "--break-system-packages", "kokoro", "soundfile"])
        .output()
        .await?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        // Kokoro 실패 시 Piper 폴백 시도
        println!("[TTS] Kokoro 설치 실패, Piper 확인 중...: {}", stderr.lines().last().unwrap_or(""));
        return check_piper_fallback().await;
    }

    println!("[TTS] Kokoro 설치 완료");
    Ok(())
}

async fn check_piper_fallback() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let piper = get_piper_bin();
    if piper.exists() {
        println!("[TTS] Piper 바이너리 사용 가능");
    }
    Ok(())
}

fn get_piper_bin() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion").join("piper").join("piper")
}

/// 텍스트 → 음성 변환 (Kokoro 우선 → Piper 폴백)
pub async fn synthesize_speech(
    text: &str,
    language: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    // 1순위: Kokoro (고품질, 한국어 지원)
    if let Ok(wav) = try_kokoro(text, language).await {
        return Ok(wav);
    }

    // 2순위: Piper (경량)
    if let Ok(wav) = try_piper(text, language).await {
        return Ok(wav);
    }

    Err("TTS 엔진이 설치되지 않았습니다. 앱을 재시작해주세요.".into())
}

/// Kokoro TTS 실행
async fn try_kokoro(
    text: &str,
    language: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    // 언어 allowlist (인젝션 차단 — 허용된 코드만 통과)
    let lang = match language.unwrap_or("ko") {
        "en" | "english" => "en",
        "ja" | "japanese" => "ja",
        "zh" | "chinese" => "zh",
        "ko" | "korean" | _ => "ko",
    };
    let voice = match lang {
        "en" => "af_heart",
        "ja" => "jf_alpha",
        _ => "kf_default",
    };

    let python_script = format!(
        r#"
import kokoro, soundfile as sf
pipeline = kokoro.KPipeline(lang_code='{lang}')
samples, sr = pipeline('{text_escaped}', voice='{voice}')
sf.write('{output}', samples, sr)
print('OK')
"#,
        lang = lang,
        text_escaped = text.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', " ").replace('\r', ""),
        voice = voice,
        output = output_path,
    );

    let output = AsyncCommand::new("python3")
        .args(["-c", &python_script])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Kokoro 실행 실패: {}", stderr.lines().last().unwrap_or("unknown")).into());
    }

    let wav_data = std::fs::read(&output_path)?;
    if wav_data.len() < 100 {
        return Err("Kokoro 출력이 비어있습니다".into());
    }

    Ok(wav_data)
}

/// Piper TTS 폴백
async fn try_piper(
    text: &str,
    _language: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let piper = get_piper_bin();
    if !piper.exists() {
        return Err("Piper 바이너리 없음".into());
    }

    let model_dir = piper.parent().unwrap();
    let model = model_dir.join("ko-KR-model.onnx");
    if !model.exists() || std::fs::metadata(&model).map(|m| m.len()).unwrap_or(0) < 1000 {
        return Err("Piper 한국어 모델 없음".into());
    }

    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    let output = AsyncCommand::new("sh")
        .args(["-c", &format!(
            "echo '{}' | DYLD_LIBRARY_PATH=/opt/homebrew/lib '{}' --model '{}' --output_file '{}'",
            text.replace('\'', "'\\''"),
            piper.to_string_lossy(),
            model.to_string_lossy(),
            output_path,
        )])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Piper 실행 실패: {}", stderr).into());
    }

    let wav_data = std::fs::read(&output_path)?;
    if wav_data.is_empty() {
        return Err("Piper 출력 비어있음".into());
    }

    Ok(wav_data)
}

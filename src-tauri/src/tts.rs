use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;
use crate::platform;

/// Kokoro TTS 설치 확인 + 자동 설치 + 모델 다운로드
pub async fn ensure_tts() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let python = platform::python_cmd();

    // kokoro-onnx 설치 확인
    let check = AsyncCommand::new(python)
        .args(["-c", "from kokoro_onnx import Kokoro; print('ok')"])
        .output()
        .await;

    if check.map(|o| o.status.success()).unwrap_or(false) {
        println!("[TTS] kokoro-onnx 설치됨");
    } else {
        println!("[TTS] kokoro-onnx 설치 중...");
        let install_args = platform::pip_install_args(&["kokoro-onnx", "soundfile"]);

        let install = AsyncCommand::new(python)
            .args(&install_args)
            .output()
            .await?;

        if !install.status.success() {
            let stderr = String::from_utf8_lossy(&install.stderr);
            println!("[TTS] kokoro-onnx 설치 실패: {}", stderr.lines().last().unwrap_or(""));
            return check_piper_fallback().await;
        }
        println!("[TTS] kokoro-onnx 설치 완료");
    }

    // 모델 다운로드
    let kokoro_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join("kokoro");
    std::fs::create_dir_all(&kokoro_dir)?;

    let model_path = kokoro_dir.join("kokoro-v1.0.onnx");
    let voices_path = kokoro_dir.join("voices-v1.0.bin");

    let client = reqwest::Client::new();
    if !model_path.exists() || std::fs::metadata(&model_path).map(|m| m.len()).unwrap_or(0) < 1000 {
        println!("[TTS] Kokoro 모델 다운로드 중 (~310MB)...");
        let bytes = client.get("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx")
            .send().await?.bytes().await?;
        std::fs::write(&model_path, &bytes)?;
        println!("[TTS] Kokoro 모델 다운로드 완료");
    }
    if !voices_path.exists() || std::fs::metadata(&voices_path).map(|m| m.len()).unwrap_or(0) < 1000 {
        println!("[TTS] Kokoro 음성 파일 다운로드 중 (~27MB)...");
        let bytes = client.get("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin")
            .send().await?.bytes().await?;
        std::fs::write(&voices_path, &bytes)?;
        println!("[TTS] Kokoro 음성 파일 다운로드 완료");
    }

    println!("[TTS] Kokoro TTS 준비 완료");
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
    if cfg!(target_os = "windows") {
        base.join("ytdlp-companion").join("piper").join("piper.exe")
    } else {
        base.join("ytdlp-companion").join("piper").join("piper")
    }
}

/// 텍스트 → 음성 변환 (Kokoro 우선 → Piper 폴백)
pub async fn synthesize_speech(
    text: &str,
    language: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    // 1순위: Kokoro (고품질, 한국어 지원)
    match try_kokoro(text, language).await {
        Ok(wav) => return Ok(wav),
        Err(e) => eprintln!("[TTS] Kokoro 실패: {}", e),
    }

    // 2순위: Piper (경량)
    match try_piper(text, language).await {
        Ok(wav) => return Ok(wav),
        Err(e) => eprintln!("[TTS] Piper 실패: {}", e),
    }

    Err("TTS 엔진이 설치되지 않았습니다. Kokoro와 Piper 둘 다 실패.".into())
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
        "zh" => "zf_xiaobei",
        _ => "af_kore",  // 한국어: af_kore (Kore = Korea 발음 특화)
    };

    let kokoro_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join("kokoro");
    let model_path = kokoro_dir.join("kokoro-v1.0.onnx");
    let voices_path = kokoro_dir.join("voices-v1.0.bin");

    if !model_path.exists() || !voices_path.exists() {
        return Err("Kokoro 모델 파일이 없습니다".into());
    }

    let text_escaped = text.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', " ").replace('\r', "");

    // Windows: 경로 구분자 \를 \\로 이스케이프 (Python 문자열 내)
    let model_str = model_path.to_string_lossy().replace('\\', "\\\\").replace('\'', "\\'");
    let voices_str = voices_path.to_string_lossy().replace('\\', "\\\\").replace('\'', "\\'");
    let output_str = if cfg!(target_os = "windows") {
        output_path.replace('\\', "\\\\").replace('\'', "\\'")
    } else {
        output_path.replace('\'', "\\'")
    };

    let python_script = format!(
        r#"
from kokoro_onnx import Kokoro
import soundfile as sf
kokoro = Kokoro('{model}', '{voices}')
samples, sr = kokoro.create('{text}', voice='{voice}', speed=1.0, lang='{lang}')
sf.write('{output}', samples, sr)
print('OK')
"#,
        model = model_str,
        voices = voices_str,
        text = text_escaped,
        voice = voice,
        lang = lang,
        output = output_str,
    );

    let python = platform::python_cmd();
    let output = AsyncCommand::new(python)
        .args(["-c", &python_script])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Kokoro 실행 실패: {} | stdout: {}", stderr.trim(), stdout.trim()).into());
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

    // 안전한 stdin 파이프 방식 — 셸 인젝션 방지
    use tokio::io::AsyncWriteExt;
    use std::process::Stdio;

    let mut cmd = AsyncCommand::new(&piper);
    cmd.args(["--model", &model.to_string_lossy(), "--output_file", &output_path]);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // macOS: DYLD_LIBRARY_PATH 설정 (Homebrew 라이브러리)
    if cfg!(target_os = "macos") {
        cmd.env("DYLD_LIBRARY_PATH", "/opt/homebrew/lib");
    }

    let mut child = cmd.spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).await?;
        // stdin을 닫아야 piper가 처리를 시작함
    }
    let output = child.wait_with_output().await?;

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

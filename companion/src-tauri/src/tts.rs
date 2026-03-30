use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;
use crate::platform;

// ──────────────────────────────────────────────
// Edge TTS 음성 목록 (Microsoft Edge Neural TTS — 무료, 인터넷 필요)
// ──────────────────────────────────────────────

pub struct EdgeVoice {
    pub id: &'static str,
    pub name: &'static str,
    pub language: &'static str,
    pub gender: &'static str,
}

pub const EDGE_VOICES: &[EdgeVoice] = &[
    // 한국어 (3)
    EdgeVoice { id: "ko-KR-SunHiNeural",                name: "선희 (한국어 여성)",    language: "ko", gender: "female" },
    EdgeVoice { id: "ko-KR-InJoonNeural",                name: "인준 (한국어 남성)",    language: "ko", gender: "male" },
    EdgeVoice { id: "ko-KR-HyunsuMultilingualNeural",    name: "현수 (한국어 다국어)",  language: "ko", gender: "male" },
    // 영어 (6)
    EdgeVoice { id: "en-US-JennyNeural",                 name: "Jenny (US)",           language: "en", gender: "female" },
    EdgeVoice { id: "en-US-AriaNeural",                  name: "Aria (US)",            language: "en", gender: "female" },
    EdgeVoice { id: "en-US-GuyNeural",                   name: "Guy (US)",             language: "en", gender: "male" },
    EdgeVoice { id: "en-US-AndrewMultilingualNeural",    name: "Andrew (US 다국어)",    language: "en", gender: "male" },
    EdgeVoice { id: "en-GB-SoniaNeural",                 name: "Sonia (UK)",           language: "en", gender: "female" },
    EdgeVoice { id: "en-GB-RyanNeural",                  name: "Ryan (UK)",            language: "en", gender: "male" },
    // 일본어 (3)
    EdgeVoice { id: "ja-JP-NanamiNeural",                name: "七海 (日本語 女性)",    language: "ja", gender: "female" },
    EdgeVoice { id: "ja-JP-KeitaNeural",                 name: "圭太 (日本語 男性)",    language: "ja", gender: "male" },
    EdgeVoice { id: "ja-JP-MasaruMultilingualNeural",    name: "勝 (日本語 다국어)",    language: "ja", gender: "male" },
    // 중국어 (4)
    EdgeVoice { id: "zh-CN-XiaoxiaoNeural",              name: "晓晓 (中文 女性)",      language: "zh", gender: "female" },
    EdgeVoice { id: "zh-CN-YunxiNeural",                 name: "云希 (中文 男性)",      language: "zh", gender: "male" },
    EdgeVoice { id: "zh-CN-XiaoyiNeural",                name: "晓依 (中文 女性)",      language: "zh", gender: "female" },
    EdgeVoice { id: "zh-CN-YunjianNeural",               name: "云健 (中文 男性)",      language: "zh", gender: "male" },
    // 스페인어 (2)
    EdgeVoice { id: "es-ES-ElviraNeural",                name: "Elvira (ES)",          language: "es", gender: "female" },
    EdgeVoice { id: "es-MX-DaliaNeural",                 name: "Dalia (MX)",           language: "es", gender: "female" },
    // 프랑스어 (2)
    EdgeVoice { id: "fr-FR-DeniseNeural",                name: "Denise (FR)",          language: "fr", gender: "female" },
    EdgeVoice { id: "fr-FR-HenriNeural",                 name: "Henri (FR)",           language: "fr", gender: "male" },
    // 독일어 (2)
    EdgeVoice { id: "de-DE-KatjaNeural",                 name: "Katja (DE)",           language: "de", gender: "female" },
    EdgeVoice { id: "de-DE-ConradNeural",                name: "Conrad (DE)",          language: "de", gender: "male" },
];

/// 음성 목록 JSON 반환
pub fn get_voices_json() -> serde_json::Value {
    let edge: Vec<serde_json::Value> = EDGE_VOICES.iter().map(|v| serde_json::json!({
        "id": v.id, "name": v.name, "language": v.language, "gender": v.gender, "engine": "edge"
    })).collect();
    serde_json::json!({ "edge": edge })
}

// ──────────────────────────────────────────────
// Edge TTS 설치 확인
// ──────────────────────────────────────────────

pub async fn ensure_edge_tts() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Python 3.12 우선 (3.14는 일부 패키지 미지원)
    let python = get_python312();
    let check = AsyncCommand::new(&python)
        .args(["-c", "import edge_tts; print('ok')"])
        .output()
        .await;

    if check.map(|o| o.status.success()).unwrap_or(false) {
        println!("[TTS] edge-tts 설치됨");
        return Ok(());
    }

    println!("[TTS] edge-tts 설치 중...");
    let install = AsyncCommand::new(&python)
        .args(["-m", "pip", "install", "--break-system-packages", "edge-tts"])
        .output()
        .await?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("edge-tts 설치 실패: {}", stderr.lines().last().unwrap_or("")).into());
    }
    println!("[TTS] edge-tts 설치 완료");
    Ok(())
}

/// CosyVoice 모델이 다운로드되어 있는지 확인
/// MODELSCOPE_CACHE와 동일한 경로 사용: ~/Library/Application Support/ytdlp-companion/models
pub fn is_cosyvoice_available() -> bool {
    // Python 스크립트의 MODELSCOPE_CACHE와 동일한 경로
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let model_dir = home
        .join("Library/Application Support/ytdlp-companion/models")
        .join("iic")
        .join("CosyVoice2-0.5B");
    let llm_path = model_dir.join("llm.pt");
    // 기본 cache 경로도 체크 (다운로드 위치가 다를 수 있음)
    let alt_dir = dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("modelscope")
        .join("hub")
        .join("iic")
        .join("CosyVoice2-0.5B");
    let alt_llm = alt_dir.join("llm.pt");
    let check = |p: &PathBuf| p.exists() && std::fs::metadata(p).map(|m| m.len() > 1_000_000_000).unwrap_or(false);
    check(&llm_path) || check(&alt_llm)
}

/// Python 3.12 경로 (macOS: /opt/homebrew/bin/python3.12, 없으면 python3)
fn get_python312() -> String {
    let p312 = "/opt/homebrew/bin/python3.12";
    if std::path::Path::new(p312).exists() {
        return p312.to_string();
    }
    platform::python_cmd().to_string()
}

// ──────────────────────────────────────────────
// 메인 TTS 엔트리포인트
// ──────────────────────────────────────────────

/// 텍스트 → 음성 변환 (엔진/음성 선택 가능)
/// engine: "edge" | "cosyvoice" | "auto" (기본)
pub async fn synthesize_speech(
    text: &str,
    language: Option<&str>,
    engine: Option<&str>,
    voice: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let engine = engine.unwrap_or("auto");

    match engine {
        "edge" => {
            match try_edge_tts(text, language, voice).await {
                Ok(wav) => return Ok(wav),
                Err(e) => eprintln!("[TTS] Edge TTS 실패: {}", e),
            }
        }
        "cosyvoice" => {
            if is_cosyvoice_available() {
                match try_cosyvoice(text, language, voice).await {
                    Ok(wav) => return Ok(wav),
                    Err(e) => eprintln!("[TTS] CosyVoice 실패: {}", e),
                }
            }
            // CosyVoice 실패/미설치 → Edge 폴백
            match try_edge_tts(text, language, voice).await {
                Ok(wav) => return Ok(wav),
                Err(e) => eprintln!("[TTS] Edge 폴백 실패: {}", e),
            }
        }
        _ => {
            // auto: CosyVoice 있으면 우선, 없으면 Edge TTS
            if is_cosyvoice_available() {
                match try_cosyvoice(text, language, voice).await {
                    Ok(wav) => return Ok(wav),
                    Err(e) => eprintln!("[TTS] CosyVoice 실패: {}", e),
                }
            }
            match try_edge_tts(text, language, voice).await {
                Ok(wav) => return Ok(wav),
                Err(e) => eprintln!("[TTS] Edge TTS 실패: {}", e),
            }
        }
    }

    // 최후 폴백: Piper
    match try_piper(text, language).await {
        Ok(wav) => return Ok(wav),
        Err(e) => eprintln!("[TTS] Piper 실패: {}", e),
    }

    Err("TTS 엔진이 모두 실패했습니다.".into())
}

// ──────────────────────────────────────────────
// Edge TTS 실행
// ──────────────────────────────────────────────

async fn try_edge_tts(
    text: &str,
    language: Option<&str>,
    voice: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_output = tempfile::Builder::new().suffix(".mp3").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    // 음성 선택 (allowlist 검증)
    let lang = language.unwrap_or("ko");
    let default_voice = match lang {
        "ko" | "korean" => "ko-KR-SunHiNeural",
        "en" | "english" => "en-US-JennyNeural",
        "ja" | "japanese" => "ja-JP-NanamiNeural",
        "zh" | "chinese" => "zh-CN-XiaoxiaoNeural",
        "es" | "spanish" => "es-ES-ElviraNeural",
        "fr" | "french" => "fr-FR-DeniseNeural",
        "de" | "german" => "de-DE-KatjaNeural",
        _ => "ko-KR-SunHiNeural",
    };
    let voice_id = match voice {
        Some(v) if !v.is_empty() => {
            if EDGE_VOICES.iter().any(|ev| ev.id == v) {
                v.to_string()
            } else {
                eprintln!("[TTS] Edge 음성 '{}' 허용 목록에 없음, 기본값 사용", v);
                default_voice.to_string()
            }
        }
        _ => default_voice.to_string(),
    };

    let text_escaped = text.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', " ").replace('\r', "");
    let output_str = output_path.replace('\\', "\\\\").replace('\'', "\\'");

    let python_script = format!(
        r#"
import asyncio
import edge_tts

async def main():
    communicate = edge_tts.Communicate('{text}', '{voice}')
    await communicate.save('{output}')
    print('OK')

asyncio.run(main())
"#,
        text = text_escaped,
        voice = voice_id,
        output = output_str,
    );

    let python = get_python312();
    let output = AsyncCommand::new(&python)
        .args(["-c", &python_script])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Edge TTS 실행 실패: {}", stderr.trim()).into());
    }

    let mp3_data = std::fs::read(&output_path)?;
    if mp3_data.len() < 100 {
        return Err("Edge TTS 출력이 비어있습니다".into());
    }

    // MP3 → WAV 변환 (ffmpeg 사용 가능하면)
    let wav_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let wav_path = wav_output.path().to_string_lossy().to_string();
    let ffmpeg = AsyncCommand::new("ffmpeg")
        .args(["-y", "-i", &output_path, "-ar", "24000", "-ac", "1", "-f", "wav", &wav_path])
        .output()
        .await;

    if let Ok(ff) = ffmpeg {
        if ff.status.success() {
            let wav_data = std::fs::read(&wav_path)?;
            if wav_data.len() > 100 {
                return Ok(wav_data);
            }
        }
    }

    // ffmpeg 없으면 MP3 그대로 반환 (프론트엔드에서 디코딩 가능)
    Ok(mp3_data)
}

// ──────────────────────────────────────────────
// CosyVoice 실행 (모델 다운로드 완료 시에만 사용 가능)
// ──────────────────────────────────────────────

async fn try_cosyvoice(
    text: &str,
    language: Option<&str>,
    voice: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    let cosyvoice_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join("cosyvoice");

    if !cosyvoice_dir.exists() {
        return Err("CosyVoice 소스가 설치되지 않았습니다".into());
    }

    let lang = language.unwrap_or("ko");
    let default_spk = match lang {
        "ko" | "korean" => "한국어 여성",
        "en" | "english" => "英文女",
        "ja" | "japanese" => "日語女",
        "zh" | "chinese" => "中文女",
        _ => "한국어 여성",
    };
    let speaker = voice.unwrap_or(default_spk);

    let text_escaped = text.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', " ").replace('\r', "");
    let output_str = output_path.replace('\\', "\\\\").replace('\'', "\\'");
    let cosyvoice_str = cosyvoice_dir.to_string_lossy().replace('\\', "\\\\").replace('\'', "\\'");

    let python_script = format!(
        r#"
import sys, os
os.environ['MODELSCOPE_CACHE'] = os.path.expanduser('~/Library/Application Support/ytdlp-companion/models')
sys.path.insert(0, '{cosyvoice_dir}')
sys.path.insert(0, os.path.join('{cosyvoice_dir}', 'third_party', 'Matcha-TTS'))

import torchaudio
from cosyvoice.cli.cosyvoice import CosyVoice2

model = CosyVoice2('iic/CosyVoice2-0.5B', load_jit=False, load_trt=False)
for i, result in enumerate(model.inference_sft('{text}', '{speaker}', stream=False)):
    torchaudio.save('{output}', result['tts_speech'], model.sample_rate)
    break
print('OK')
"#,
        cosyvoice_dir = cosyvoice_str,
        text = text_escaped,
        speaker = speaker,
        output = output_str,
    );

    let python = get_python312();
    let output = AsyncCommand::new(&python)
        .args(["-c", &python_script])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("CosyVoice 실행 실패: {}", stderr.trim()).into());
    }

    let wav_data = std::fs::read(&output_path)?;
    if wav_data.len() < 100 {
        return Err("CosyVoice 출력이 비어있습니다".into());
    }

    Ok(wav_data)
}

// ──────────────────────────────────────────────
// Piper TTS 폴백
// ──────────────────────────────────────────────

fn get_piper_bin() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    if cfg!(target_os = "windows") {
        base.join("ytdlp-companion").join("piper").join("piper.exe")
    } else {
        base.join("ytdlp-companion").join("piper").join("piper")
    }
}

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

    use tokio::io::AsyncWriteExt;
    use std::process::Stdio;

    let mut cmd = AsyncCommand::new(&piper);
    cmd.args(["--model", &model.to_string_lossy(), "--output_file", &output_path]);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    if cfg!(target_os = "macos") {
        cmd.env("DYLD_LIBRARY_PATH", "/opt/homebrew/lib");
    }

    let mut child = cmd.spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes()).await?;
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

// ──────────────────────────────────────────────
// Voice Cloning (CosyVoice zero-shot)
// ──────────────────────────────────────────────

/// 커스텀 음성 저장 디렉토리
fn custom_voices_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("ytdlp-companion").join("custom-voices");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 저장된 커스텀 음성 목록 반환
pub fn list_custom_voices() -> Vec<serde_json::Value> {
    let dir = custom_voices_dir();
    let mut voices = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "wav").unwrap_or(false) {
                let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                let meta_path = path.with_extension("json");
                let name = if meta_path.exists() {
                    std::fs::read_to_string(&meta_path).ok()
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                        .and_then(|v| v["name"].as_str().map(String::from))
                        .unwrap_or_else(|| stem.clone())
                } else {
                    stem.clone()
                };
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                voices.push(serde_json::json!({
                    "id": format!("custom_{}", stem),
                    "name": name,
                    "engine": "cosyvoice-clone",
                    "language": "multi",
                    "gender": "custom",
                    "filePath": path.to_string_lossy(),
                    "fileSize": size,
                }));
            }
        }
    }
    voices
}

/// 참조 음성 저장
pub fn save_custom_voice(name: &str, wav_data: &[u8]) -> Result<String, String> {
    let dir = custom_voices_dir();
    let id = format!("voice_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
    let wav_path = dir.join(format!("{}.wav", id));
    let meta_path = dir.join(format!("{}.json", id));
    std::fs::write(&wav_path, wav_data).map_err(|e| e.to_string())?;
    let meta = serde_json::json!({ "name": name, "createdAt": chrono::Utc::now().to_rfc3339() });
    std::fs::write(&meta_path, meta.to_string()).map_err(|e| e.to_string())?;
    Ok(format!("custom_{}", id))
}

/// 커스텀 음성 삭제 (path traversal 방지)
pub fn delete_custom_voice(voice_id: &str) -> Result<(), String> {
    let voices = list_custom_voices();
    let entry = voices.iter().find(|v| v["id"].as_str() == Some(voice_id));
    let file_path = match entry.and_then(|v| v["filePath"].as_str()) {
        Some(p) => PathBuf::from(p),
        None => return Err(format!("음성 '{}' 을(를) 찾을 수 없습니다", voice_id)),
    };
    let dir = custom_voices_dir();
    if !file_path.starts_with(&dir) {
        return Err("잘못된 경로입니다".to_string());
    }
    if file_path.exists() { std::fs::remove_file(&file_path).map_err(|e| e.to_string())?; }
    let meta_path = file_path.with_extension("json");
    if meta_path.exists() { std::fs::remove_file(&meta_path).map_err(|e| e.to_string())?; }
    Ok(())
}

/// Voice Cloning TTS — CosyVoice zero-shot
pub async fn clone_voice_tts(
    text: &str,
    voice_ref_path: &str,
    language: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    if !is_cosyvoice_available() {
        return Err("CosyVoice 모델이 아직 다운로드되지 않았습니다. 다운로드 완료 후 사용 가능합니다.".into());
    }

    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    let cosyvoice_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join("cosyvoice");

    let lang_tag = match language.unwrap_or("ko") {
        "ko" | "korean" => "<|ko|>",
        "en" | "english" => "<|en|>",
        "ja" | "japanese" => "<|ja|>",
        "zh" | "chinese" => "<|zh|>",
        _ => "<|ko|>",
    };

    let text_escaped = text.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', " ").replace('\r', "");
    let ref_escaped = voice_ref_path.replace('\\', "\\\\").replace('\'', "\\'");
    let output_str = output_path.replace('\\', "\\\\").replace('\'', "\\'");
    let cosyvoice_str = cosyvoice_dir.to_string_lossy().replace('\\', "\\\\").replace('\'', "\\'");

    let python_script = format!(
        r#"
import sys, os
os.environ['MODELSCOPE_CACHE'] = os.path.expanduser('~/Library/Application Support/ytdlp-companion/models')
sys.path.insert(0, '{cosyvoice_dir}')
sys.path.insert(0, os.path.join('{cosyvoice_dir}', 'third_party', 'Matcha-TTS'))

import torchaudio
from cosyvoice.cli.cosyvoice import CosyVoice2

model = CosyVoice2('iic/CosyVoice2-0.5B', load_jit=False, load_trt=False)
prompt_speech, sr = torchaudio.load('{ref}')
if sr != 16000:
    prompt_speech = torchaudio.functional.resample(prompt_speech, sr, 16000)

for i, result in enumerate(model.inference_zero_shot('{lang_tag}{text}', '', prompt_speech, stream=False)):
    torchaudio.save('{output}', result['tts_speech'], model.sample_rate)
    break
print('OK')
"#,
        cosyvoice_dir = cosyvoice_str,
        text = text_escaped,
        ref = ref_escaped,
        lang_tag = lang_tag,
        output = output_str,
    );

    let python = get_python312();
    let output = AsyncCommand::new(&python)
        .args(["-c", &python_script])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Voice Clone 실패: {}", stderr.trim()).into());
    }

    let wav_data = std::fs::read(&output_path)?;
    if wav_data.len() < 100 {
        return Err("Voice Clone 출력이 비어있습니다".into());
    }

    Ok(wav_data)
}

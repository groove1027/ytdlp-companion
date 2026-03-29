use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;
use crate::platform;

/// Qwen3-TTS 음성 목록 (공식 9개 + 언어 매핑)
pub struct Qwen3Voice {
    pub id: &'static str,
    pub name: &'static str,
    pub language: &'static str,
    pub gender: &'static str,
}

pub const QWEN3_VOICES: &[Qwen3Voice] = &[
    Qwen3Voice { id: "Sohee",    name: "소희 (한국어)",    language: "ko", gender: "female" },
    Qwen3Voice { id: "Vivian",   name: "Vivian (中文)",   language: "zh", gender: "female" },
    Qwen3Voice { id: "Serena",   name: "Serena (中文)",   language: "zh", gender: "female" },
    Qwen3Voice { id: "Uncle_Fu", name: "Uncle Fu (中文)",  language: "zh", gender: "male" },
    Qwen3Voice { id: "Dylan",    name: "Dylan (中文)",    language: "zh", gender: "male" },
    Qwen3Voice { id: "Eric",     name: "Eric (中文)",     language: "zh", gender: "male" },
    Qwen3Voice { id: "Ryan",     name: "Ryan (English)",  language: "en", gender: "male" },
    Qwen3Voice { id: "Aiden",    name: "Aiden (English)", language: "en", gender: "male" },
    Qwen3Voice { id: "Ono_Anna", name: "小野アンナ (日本語)", language: "ja", gender: "female" },
];

/// Kokoro 음성 목록 (54개 — 공식 v1.0 voices-v1.0.bin)
pub struct KokoroVoice {
    pub id: &'static str,
    pub name: &'static str,
    pub language: &'static str,
    pub gender: &'static str,
}

pub const KOKORO_VOICES: &[KokoroVoice] = &[
    // American English (20)
    KokoroVoice { id: "af_heart",   name: "Heart (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_alloy",   name: "Alloy (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_aoede",   name: "Aoede (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_bella",   name: "Bella (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_jessica", name: "Jessica (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_kore",    name: "Kore (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_nicole",  name: "Nicole (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_nova",    name: "Nova (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_river",   name: "River (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_sarah",   name: "Sarah (US)", language: "en", gender: "female" },
    KokoroVoice { id: "af_sky",     name: "Sky (US)", language: "en", gender: "female" },
    KokoroVoice { id: "am_adam",    name: "Adam (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_echo",    name: "Echo (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_eric",    name: "Eric (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_fenrir",  name: "Fenrir (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_liam",    name: "Liam (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_michael", name: "Michael (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_onyx",    name: "Onyx (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_puck",    name: "Puck (US)", language: "en", gender: "male" },
    KokoroVoice { id: "am_santa",   name: "Santa (US)", language: "en", gender: "male" },
    // British English (8)
    KokoroVoice { id: "bf_alice",    name: "Alice (UK)", language: "en", gender: "female" },
    KokoroVoice { id: "bf_emma",     name: "Emma (UK)", language: "en", gender: "female" },
    KokoroVoice { id: "bf_isabella", name: "Isabella (UK)", language: "en", gender: "female" },
    KokoroVoice { id: "bf_lily",     name: "Lily (UK)", language: "en", gender: "female" },
    KokoroVoice { id: "bm_daniel",   name: "Daniel (UK)", language: "en", gender: "male" },
    KokoroVoice { id: "bm_fable",    name: "Fable (UK)", language: "en", gender: "male" },
    KokoroVoice { id: "bm_george",   name: "George (UK)", language: "en", gender: "male" },
    KokoroVoice { id: "bm_lewis",    name: "Lewis (UK)", language: "en", gender: "male" },
    // Japanese (5)
    KokoroVoice { id: "jf_alpha",     name: "Alpha (JP)", language: "ja", gender: "female" },
    KokoroVoice { id: "jf_gongitsune",name: "Gongitsune (JP)", language: "ja", gender: "female" },
    KokoroVoice { id: "jf_nezumi",    name: "Nezumi (JP)", language: "ja", gender: "female" },
    KokoroVoice { id: "jf_tebukuro",  name: "Tebukuro (JP)", language: "ja", gender: "female" },
    KokoroVoice { id: "jm_kumo",      name: "Kumo (JP)", language: "ja", gender: "male" },
    // Chinese (8)
    KokoroVoice { id: "zf_xiaobei",  name: "Xiaobei (ZH)", language: "zh", gender: "female" },
    KokoroVoice { id: "zf_xiaoni",   name: "Xiaoni (ZH)", language: "zh", gender: "female" },
    KokoroVoice { id: "zf_xiaoxiao", name: "Xiaoxiao (ZH)", language: "zh", gender: "female" },
    KokoroVoice { id: "zf_xiaoyi",   name: "Xiaoyi (ZH)", language: "zh", gender: "female" },
    KokoroVoice { id: "zm_yunjian",  name: "Yunjian (ZH)", language: "zh", gender: "male" },
    KokoroVoice { id: "zm_yunxi",    name: "Yunxi (ZH)", language: "zh", gender: "male" },
    KokoroVoice { id: "zm_yunxia",   name: "Yunxia (ZH)", language: "zh", gender: "male" },
    KokoroVoice { id: "zm_yunyang",  name: "Yunyang (ZH)", language: "zh", gender: "male" },
    // Spanish (3)
    KokoroVoice { id: "ef_dora",  name: "Dora (ES)", language: "es", gender: "female" },
    KokoroVoice { id: "em_alex",  name: "Alex (ES)", language: "es", gender: "male" },
    KokoroVoice { id: "em_santa", name: "Santa (ES)", language: "es", gender: "male" },
    // French (1)
    KokoroVoice { id: "ff_siwis", name: "Siwis (FR)", language: "fr", gender: "female" },
    // Hindi (4)
    KokoroVoice { id: "hf_alpha", name: "Alpha (HI)", language: "hi", gender: "female" },
    KokoroVoice { id: "hf_beta",  name: "Beta (HI)", language: "hi", gender: "female" },
    KokoroVoice { id: "hm_omega", name: "Omega (HI)", language: "hi", gender: "male" },
    KokoroVoice { id: "hm_psi",   name: "Psi (HI)", language: "hi", gender: "male" },
    // Italian (2)
    KokoroVoice { id: "if_sara",   name: "Sara (IT)", language: "it", gender: "female" },
    KokoroVoice { id: "im_nicola", name: "Nicola (IT)", language: "it", gender: "male" },
    // Brazilian Portuguese (3)
    KokoroVoice { id: "pf_dora",  name: "Dora (PT-BR)", language: "pt", gender: "female" },
    KokoroVoice { id: "pm_alex",  name: "Alex (PT-BR)", language: "pt", gender: "male" },
    KokoroVoice { id: "pm_santa", name: "Santa (PT-BR)", language: "pt", gender: "male" },
];

/// 음성 목록 JSON 반환
pub fn get_voices_json() -> serde_json::Value {
    let qwen3: Vec<serde_json::Value> = QWEN3_VOICES.iter().map(|v| serde_json::json!({
        "id": v.id, "name": v.name, "language": v.language, "gender": v.gender, "engine": "qwen3"
    })).collect();
    let kokoro: Vec<serde_json::Value> = KOKORO_VOICES.iter().map(|v| serde_json::json!({
        "id": v.id, "name": v.name, "language": v.language, "gender": v.gender, "engine": "kokoro"
    })).collect();
    serde_json::json!({ "qwen3": qwen3, "kokoro": kokoro })
}

// ──────────────────────────────────────────────
// Qwen3-TTS 설치 + 모델 다운로드
// ──────────────────────────────────────────────

pub async fn ensure_qwen3_tts() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let python = platform::python_cmd();

    // qwen-tts 패키지 확인 (공식 패키지)
    let check = AsyncCommand::new(python)
        .args(["-c", "from qwen_tts import Qwen3TTSModel; print('ok')"])
        .output()
        .await;

    if check.map(|o| o.status.success()).unwrap_or(false) {
        println!("[TTS] Qwen3-TTS 패키지 설치됨");
    } else {
        println!("[TTS] Qwen3-TTS 패키지 설치 중...");
        let install_args = platform::pip_install_args(&[
            "qwen-tts", "soundfile",
        ]);
        let install = AsyncCommand::new(python)
            .args(&install_args)
            .output()
            .await?;

        if !install.status.success() {
            let stderr = String::from_utf8_lossy(&install.stderr);
            println!("[TTS] Qwen3-TTS 의존성 설치 실패: {}", stderr.lines().last().unwrap_or(""));
            return Err("Qwen3-TTS 설치 실패".into());
        }
        println!("[TTS] Qwen3-TTS 의존성 설치 완료");
    }

    println!("[TTS] Qwen3-TTS 준비 완료 (모델은 첫 사용 시 자동 다운로드)");
    Ok(())
}

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

    // Qwen3-TTS도 병렬 설치 시도
    if let Err(e) = ensure_qwen3_tts().await {
        println!("[TTS] Qwen3-TTS 설치 스킵 (Kokoro 사용): {}", e);
    }

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

/// 텍스트 → 음성 변환 (엔진/음성 선택 가능)
/// engine: "qwen3" | "kokoro" | "auto" (기본)
/// voice: 음성 ID (없으면 언어 기반 자동 선택)
pub async fn synthesize_speech(
    text: &str,
    language: Option<&str>,
    engine: Option<&str>,
    voice: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let engine = engine.unwrap_or("auto");

    match engine {
        "qwen3" => {
            // Qwen3 직접 지정
            match try_qwen3(text, language, voice).await {
                Ok(wav) => return Ok(wav),
                Err(e) => eprintln!("[TTS] Qwen3 실패: {}", e),
            }
            // 폴백: Kokoro → Piper
            match try_kokoro(text, language, voice).await {
                Ok(wav) => return Ok(wav),
                Err(e) => eprintln!("[TTS] Kokoro 폴백 실패: {}", e),
            }
        }
        "kokoro" => {
            match try_kokoro(text, language, voice).await {
                Ok(wav) => return Ok(wav),
                Err(e) => eprintln!("[TTS] Kokoro 실패: {}", e),
            }
        }
        _ => {
            // auto: 한국어 → Qwen3 우선, 나머지 → Kokoro 우선
            let lang = language.unwrap_or("ko");
            if lang == "ko" {
                // 한국어: Qwen3 우선 (공식 지원)
                match try_qwen3(text, language, voice).await {
                    Ok(wav) => return Ok(wav),
                    Err(e) => eprintln!("[TTS] Qwen3 실패 (한국어): {}", e),
                }
                match try_kokoro(text, language, voice).await {
                    Ok(wav) => return Ok(wav),
                    Err(e) => eprintln!("[TTS] Kokoro 폴백: {}", e),
                }
            } else {
                // 기타 언어: Kokoro 우선 (가볍고 빠름)
                match try_kokoro(text, language, voice).await {
                    Ok(wav) => return Ok(wav),
                    Err(e) => eprintln!("[TTS] Kokoro 실패: {}", e),
                }
                match try_qwen3(text, language, voice).await {
                    Ok(wav) => return Ok(wav),
                    Err(e) => eprintln!("[TTS] Qwen3 폴백: {}", e),
                }
            }
        }
    }

    // 최후 폴백: Piper
    match try_piper(text, language).await {
        Ok(wav) => return Ok(wav),
        Err(e) => eprintln!("[TTS] Piper 실패: {}", e),
    }

    Err("TTS 엔진이 설치되지 않았습니다. Qwen3, Kokoro, Piper 모두 실패.".into())
}

/// Qwen3-TTS 실행
async fn try_qwen3(
    text: &str,
    language: Option<&str>,
    voice: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    // 언어 코드 매핑
    let lang = match language.unwrap_or("ko") {
        "en" | "english" => "en",
        "ja" | "japanese" => "ja",
        "zh" | "chinese" => "zh",
        "es" | "spanish" => "es",
        "fr" | "french" => "fr",
        "de" | "german" => "de",
        "hi" | "hindi" => "hi",
        "it" | "italian" => "it",
        "pt" | "portuguese" => "pt",
        "ru" | "russian" => "ru",
        "ko" | "korean" | _ => "ko",
    };

    // 음성 선택 (allowlist 검증 — 인젝션 방지)
    let default_voice = match lang {
        "ko" => "Sohee",
        "zh" => "Vivian",
        "en" => "Ryan",
        "ja" => "Ono_Anna",
        _ => "Ryan",
    };
    let voice_id = match voice {
        Some(v) if !v.is_empty() => {
            // Qwen3 allowlist 검증
            if QWEN3_VOICES.iter().any(|qv| qv.id == v) {
                v.to_string()
            } else {
                eprintln!("[TTS] Qwen3 음성 '{}' 허용 목록에 없음, 기본값 사용", v);
                default_voice.to_string()
            }
        }
        _ => default_voice.to_string(),
    };

    let text_escaped = text.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', " ").replace('\r', "");
    let output_str = if cfg!(target_os = "windows") {
        output_path.replace('\\', "\\\\").replace('\'', "\\'")
    } else {
        output_path.replace('\'', "\\'")
    };

    // Qwen3-TTS Python 스크립트 (공식 qwen-tts 패키지 사용)
    let python_script = format!(
        r#"
import sys, os
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'

try:
    from qwen_tts import Qwen3TTSModel
    import soundfile as sf

    model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-12Hz-0.6B-Base')

    audio = model.synthesize(
        text='{text}',
        voice='{voice}',
        lang='{lang}',
    )
    sf.write('{output}', audio['waveform'], audio.get('sample_rate', 24000))
    print('OK')
except ImportError:
    # 폴백: transformers 직접 사용
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM
        import torch, soundfile as sf

        model_name = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
        device = 'cuda' if torch.cuda.is_available() else ('mps' if torch.backends.mps.is_available() else 'cpu')
        dtype = torch.float16 if device != 'cpu' else torch.float32

        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(model_name, trust_remote_code=True, torch_dtype=dtype).to(device)

        prompt = '<|voice:{voice}|><|lang:{lang}|>{text}<|endoftext|>'
        inputs = tokenizer(prompt, return_tensors='pt').to(device)

        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=4096, temperature=0.7, do_sample=True)

        audio_tokens = outputs[0][inputs['input_ids'].shape[1]:]
        audio_array = model.decode_audio(audio_tokens)
        if hasattr(audio_array, 'cpu'):
            audio_array = audio_array.cpu().numpy()

        sf.write('{output}', audio_array.squeeze(), 24000)
        print('OK')
    except Exception as e2:
        print(f'ERROR: {{e2}}', file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f'ERROR: {{e}}', file=sys.stderr)
    sys.exit(1)
"#,
        voice = voice_id,
        lang = lang,
        text = text_escaped,
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
        return Err(format!("Qwen3 실행 실패: {} | stdout: {}", stderr.trim(), stdout.trim()).into());
    }

    let wav_data = std::fs::read(&output_path)?;
    if wav_data.len() < 100 {
        return Err("Qwen3 출력이 비어있습니다".into());
    }

    Ok(wav_data)
}

/// Kokoro TTS 실행
async fn try_kokoro(
    text: &str,
    language: Option<&str>,
    voice: Option<&str>,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_output = tempfile::Builder::new().suffix(".wav").tempfile()?;
    let output_path = tmp_output.path().to_string_lossy().to_string();

    // Kokoro 언어 코드 — espeak-ng 호환 형식 필수 (en-us, en-gb, ja 등)
    // phonemizer가 'en' 단독은 거부하므로 'en-us'/'en-gb' 형식 사용
    let lang = match language.unwrap_or("ko") {
        "en" | "english" => "en-us",
        "ja" | "japanese" => "ja",
        "zh" | "chinese" => "zh",
        "es" | "spanish" => "es",
        "fr" | "french" => "fr-fr",
        "hi" | "hindi" => "hi",
        "it" | "italian" => "it",
        "pt" | "portuguese" => "pt-br",
        "de" | "german" | "ru" | "russian" => "en-us", // 미지원 → 영어 폴백
        "ko" | "korean" => "ko",
        _ => "en-us",
    };

    // 음성 선택 (allowlist 검증 — 인젝션 방지)
    let kokoro_default = match lang {
        "en" => "af_heart",
        "ja" => "jf_alpha",
        "zh" => "zf_xiaobei",
        "es" => "ef_dora",
        "fr" => "ff_siwis",
        "hi" => "hf_alpha",
        "it" => "if_sara",
        "pt" => "pf_dora",
        _ => "af_kore",  // 한국어: af_kore
    };
    let voice_id = match voice {
        Some(v) if !v.is_empty() => {
            if KOKORO_VOICES.iter().any(|kv| kv.id == v) {
                v.to_string()
            } else {
                eprintln!("[TTS] Kokoro 음성 '{}' 허용 목록에 없음, 기본값 사용", v);
                kokoro_default.to_string()
            }
        }
        _ => kokoro_default.to_string(),
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
        voice = voice_id,
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

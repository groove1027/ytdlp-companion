use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;

fn get_rembg_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion").join("rembg")
}

/// rembg 설치 확인 + 자동 설치
pub async fn ensure_rembg() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_rembg_dir();
    std::fs::create_dir_all(&dir)?;

    // pip로 rembg 설치 확인
    let check = AsyncCommand::new("python3")
        .args(["-c", "import rembg; print(rembg.__version__)"])
        .output()
        .await;

    if let Ok(out) = check {
        if out.status.success() {
            let ver = String::from_utf8_lossy(&out.stdout);
            println!("[rembg] 이미 설치됨 (v{})", ver.trim());
            return Ok(());
        }
    }

    println!("[rembg] 설치 중...");
    let install = AsyncCommand::new("pip3")
        .args(["install", "rembg[cli]", "onnxruntime"])
        .output()
        .await?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("rembg 설치 실패: {}", stderr).into());
    }

    println!("[rembg] 설치 완료");
    Ok(())
}

/// 이미지 배경 제거 — rembg 로컬 실행
pub async fn remove_background(
    image_data: &[u8],
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let tmp_input = tempfile::Builder::new().suffix(".png").tempfile()?;
    let tmp_output = tempfile::Builder::new().suffix(".png").tempfile()?;

    let input_path = tmp_input.path().to_string_lossy().to_string();
    let output_path = tmp_output.path().to_string_lossy().to_string();

    std::fs::write(&input_path, image_data)?;

    let output = AsyncCommand::new("python3")
        .args(["-m", "rembg", "i", &input_path, &output_path])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("rembg 실행 실패: {}", stderr).into());
    }

    let result = std::fs::read(&output_path)?;
    Ok(result)
}

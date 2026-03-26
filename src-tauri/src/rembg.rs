use tokio::process::Command as AsyncCommand;
use std::path::PathBuf;
use crate::platform;

fn get_rembg_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("ytdlp-companion").join("rembg")
}

/// rembg 설치 확인 + 자동 설치
pub async fn ensure_rembg() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let dir = get_rembg_dir();
    std::fs::create_dir_all(&dir)?;

    let python = platform::python_cmd();

    // pip로 rembg 설치 확인
    let check = AsyncCommand::new(python)
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
    let install_args = platform::pip_install_args(&["rembg[cli]", "onnxruntime"]);

    let install = AsyncCommand::new(python)
        .args(&install_args)
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
    // Windows: NamedTempFile의 열린 핸들이 자식 프로세스의 파일 접근을 차단
    // → persist()로 핸들을 닫고 경로만 유지, 완료 후 수동 삭제
    let tmp_input = tempfile::Builder::new().suffix(".png").tempfile()?;
    let tmp_output = tempfile::Builder::new().suffix(".png").tempfile()?;
    let input_path = tmp_input.path().to_string_lossy().to_string();
    let output_path = tmp_output.path().to_string_lossy().to_string();
    // persist()로 파일 핸들 닫기 (Windows 호환)
    let _input_persisted = tmp_input.persist(&input_path)?;
    drop(_input_persisted);
    let _output_persisted = tmp_output.persist(&output_path)?;
    drop(_output_persisted);

    std::fs::write(&input_path, image_data)?;

    let python = platform::python_cmd();

    // python -m rembg로 호출 (PATH 문제 없음, Tauri GUI 앱 호환)
    let output = AsyncCommand::new(python)
        .args(["-m", "rembg.cli", "i", &input_path, &output_path])
        .output()
        .await
        .or_else(|_| {
            // 폴백: rembg CLI 직접
            std::process::Command::new("rembg")
                .args(["i", &input_path, &output_path])
                .output()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("rembg 실행 실패: {}", stderr).into());
    }

    let result = std::fs::read(&output_path)?;
    // 임시 파일 정리
    let _ = std::fs::remove_file(&input_path);
    let _ = std::fs::remove_file(&output_path);
    Ok(result)
}

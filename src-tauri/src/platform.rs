/// 플랫폼별 유틸리티 — Windows / macOS / Linux 크로스플랫폼 지원

// ──────────────────────────────────────────────
// [FIX #925] Windows 콘솔 창 방지 — CREATE_NO_WINDOW 자동 적용
// Windows에서 subprocess 실행 시 검은 콘솔 창이 뜨는 문제 해결
// ──────────────────────────────────────────────

/// Windows에서 콘솔 창 없이 실행되는 비동기 Command 생성
/// macOS/Linux에서는 일반 Command와 동일
pub fn async_cmd(program: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    #[allow(unused_mut)] // mut는 Windows cfg 블록에서 필요
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Windows에서 콘솔 창 없이 실행되는 동기 Command 생성
pub fn sync_cmd(program: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Python 실행 커맨드 반환 (Windows: "python" → "py -3" 폴백, macOS/Linux: "python3")
/// Windows에서는 Microsoft Store 설치 시 "python"이 redirect stub일 수 있어
/// "py -3" (Python Launcher)도 시도
pub fn python_cmd() -> &'static str {
    if cfg!(target_os = "windows") {
        // "python"이 유효한지 컴파일 타임에는 알 수 없으므로 기본값 사용
        // 런타임 폴백은 호출 시점에서 처리
        "python"
    } else {
        "python3"
    }
}

/// Windows에서 python이 없을 때 "py -3" 폴백 시도
pub fn python_cmd_fallback() -> &'static str {
    if cfg!(target_os = "windows") {
        "py"
    } else {
        "python3"
    }
}

/// Windows py launcher용 추가 인자
pub fn python_fallback_args() -> Vec<&'static str> {
    if cfg!(target_os = "windows") {
        vec!["-3"]
    } else {
        vec![]
    }
}

/// pip install 실행용 인자 생성 — python -m pip 방식으로 통일 (python/pip 불일치 방지)
pub fn pip_install_args(packages: &[&str]) -> Vec<String> {
    let mut args = vec![
        "-m".to_string(),
        "pip".to_string(),
        "install".to_string(),
    ];
    if !cfg!(target_os = "windows") {
        args.push("--break-system-packages".to_string());
    }
    for pkg in packages {
        args.push(pkg.to_string());
    }
    args
}

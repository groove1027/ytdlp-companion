/// 플랫폼별 유틸리티 — Windows / macOS / Linux 크로스플랫폼 지원

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

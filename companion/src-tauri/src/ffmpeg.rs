// ffmpeg.rs — Companion v2.0.2
//
// FFmpeg 정적 바이너리 자동 다운로드.
//
// 핵심 개념:
//   1. 시스템 ffmpeg(brew/Program Files/PATH) 우선 — 설치된 사용자는 그대로
//   2. 캐시(`~/Library/Application Support/ytdlp-companion/bin/ffmpeg`) 검사 + SHA-256 검증
//   3. 없으면 GitHub eugeneware/ffmpeg-static b6.1.1에서 .gz 다운로드
//   4. SHA-256 fail-closed (cloudflared와 동일 정책)
//   5. GitHub allowlist redirect 정책 (HTTPS 강제, 5회 제한)
//   6. .gz 압축 해제 (단일 binary) → 캐시에 저장
//   7. Unix는 0o755 권한 부여 + macOS quarantine 속성 제거
//
// 동기:
//   yt-dlp 1080p+오디오는 별도 video/audio 트랙이라 ffmpeg가 있어야 mp4로 merge된다.
//   ffmpeg가 없으면 yt-dlp가 muxed-only 포맷(보통 720p)으로 자동 fallback해서
//   사용자 핵심 기능(영상 분석 + 편집점 + 편집실 타임라인)의 화질 전제가 깨진다.
//
// 안전성:
//   - cloudflared 다운로드 코드(`video_tunnel.rs::ensure_cloudflared`)와 동일 패턴
//   - 5 플랫폼 SHA-256 fail-closed (eugeneware/ffmpeg-static 릴리스 b6.1.1 기준)
//   - 호스트는 GitHub만 허용 (objects.githubusercontent.com / release-assets.githubusercontent.com)

use std::path::{Path, PathBuf};
use std::time::Duration;

use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::process::Command;

/// 다운로드할 ffmpeg-static 릴리스 태그 — 매 컴패니언 릴리스 시 검증/갱신
pub const FFMPEG_VERSION: &str = "b6.1.1";

#[derive(Debug, Error)]
pub enum FfmpegError {
    #[error("unsupported platform: {os} {arch}")]
    UnsupportedPlatform { os: &'static str, arch: &'static str },

    #[error("download failed: {0}")]
    DownloadFailed(String),

    #[error("checksum mismatch (expected {expected}, got {actual})")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("decompress failed: {0}")]
    Decompress(String),

    #[error("internal error: {0}")]
    Internal(String),
}

/// ffmpeg 캐시 디렉터리 (companion data dir 안의 bin/)
fn ffmpeg_bin_dir() -> Result<PathBuf, FfmpegError> {
    let base = dirs::data_dir()
        .ok_or_else(|| FfmpegError::Internal("data_dir 미정".to_string()))?;
    Ok(base.join("ytdlp-companion").join("bin"))
}

/// 캐시된 ffmpeg 바이너리 절대 경로 (Windows는 .exe)
pub fn ffmpeg_cache_path() -> Result<PathBuf, FfmpegError> {
    let dir = ffmpeg_bin_dir()?;
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    Ok(dir.join(name))
}

/// 플랫폼별 GitHub 다운로드 URL — 5 플랫폼만 지원, 그 외는 unsupported
fn ffmpeg_download_url() -> Result<String, FfmpegError> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let asset = match (os, arch) {
        ("macos", "aarch64") => "ffmpeg-darwin-arm64.gz",
        ("macos", "x86_64") => "ffmpeg-darwin-x64.gz",
        ("windows", "x86_64") => "ffmpeg-win32-x64.gz",
        ("linux", "x86_64") => "ffmpeg-linux-x64.gz",
        ("linux", "aarch64") => "ffmpeg-linux-arm64.gz",
        _ => return Err(FfmpegError::UnsupportedPlatform { os, arch }),
    };
    Ok(format!(
        "https://github.com/eugeneware/ffmpeg-static/releases/download/{}/{}",
        FFMPEG_VERSION, asset
    ))
}

/// 플랫폼별 .gz 압축본의 expected SHA-256
///
/// 출처: https://api.github.com/repos/eugeneware/ffmpeg-static/releases/tags/b6.1.1
/// 검증 일시: 2026-04-07 (gh CLI로 fetch)
///
/// 매 FFMPEG_VERSION bump 시 5 플랫폼 SHA를 다시 fetch해 갱신해야 함.
fn expected_ffmpeg_gz_sha256() -> Option<String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let hash = match (os, arch) {
        ("macos", "aarch64") => "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa",
        ("macos", "x86_64") => "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106",
        ("windows", "x86_64") => "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
        ("linux", "x86_64") => "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
        ("linux", "aarch64") => "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0",
        _ => return None,
    };
    Some(hash.to_string())
}

/// 플랫폼별 압축 해제 후 binary의 expected SHA-256 (캐시 무결성 검증용)
fn expected_ffmpeg_binary_sha256() -> Option<String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let hash = match (os, arch) {
        ("macos", "aarch64") => "a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584",
        ("macos", "x86_64") => "ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894",
        ("windows", "x86_64") => "04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00",
        ("linux", "x86_64") => "e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99",
        ("linux", "aarch64") => "6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce",
        _ => return None,
    };
    Some(hash.to_string())
}

fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

async fn sha256_file(path: &Path) -> Result<String, FfmpegError> {
    let bytes = tokio::fs::read(path).await?;
    Ok(compute_sha256(&bytes))
}

fn windows_ffmpeg_candidate_paths_with_roots(
    local_app_data: Option<PathBuf>,
    user_profile: Option<PathBuf>,
) -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
        PathBuf::from(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
        PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
        PathBuf::from(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"),
    ];

    if let Some(local_app_data) = local_app_data {
        paths.push(
            local_app_data
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("ffmpeg.exe"),
        );
    }
    if let Some(user_profile) = user_profile {
        let scoop_root = user_profile.join("scoop");
        paths.push(scoop_root.join("shims").join("ffmpeg.exe"));
        paths.push(
            scoop_root
                .join("apps")
                .join("ffmpeg")
                .join("current")
                .join("bin")
                .join("ffmpeg.exe"),
        );
    }

    paths
}

fn windows_ffmpeg_candidate_paths() -> Vec<PathBuf> {
    windows_ffmpeg_candidate_paths_with_roots(
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from),
        std::env::var_os("USERPROFILE").map(PathBuf::from),
    )
}

/// 시스템에 설치된 ffmpeg 표준 경로 검색 (brew/Program Files/PATH)
///
/// GUI 앱은 .zshrc/.bashrc로 PATH가 로드 안 되므로 표준 경로 직접 시도가 우선이다.
///
/// 테스트 전용: 환경변수 `FFMPEG_FORCE_DOWNLOAD_FOR_TEST=1` 설정 시 시스템 경로를
/// 무시하고 강제로 다운로드 경로를 타도록 한다 (CI smoke test 등에서 ensure_ffmpeg
/// 자동 다운로드 분기를 검증하기 위함).
fn find_system_ffmpeg() -> Option<PathBuf> {
    if std::env::var_os("FFMPEG_FORCE_DOWNLOAD_FOR_TEST").is_some() {
        return None;
    }
    let candidates: Vec<PathBuf> = if cfg!(windows) {
        windows_ffmpeg_candidate_paths()
    } else if cfg!(target_os = "macos") {
        vec![
            PathBuf::from("/opt/homebrew/bin/ffmpeg"), // Apple Silicon brew
            PathBuf::from("/usr/local/bin/ffmpeg"),    // Intel brew
            PathBuf::from("/usr/bin/ffmpeg"),          // 시스템
        ]
    } else {
        vec![
            PathBuf::from("/usr/local/bin/ffmpeg"),
            PathBuf::from("/usr/bin/ffmpeg"),
            PathBuf::from("/snap/bin/ffmpeg"),
        ]
    };
    for path in candidates {
        if path.exists() {
            return Some(path);
        }
    }
    None
}

pub fn system_ffmpeg_path() -> Option<PathBuf> {
    find_system_ffmpeg()
}

/// 캐시된 ffmpeg가 SHA-256 fail-closed로 신뢰 가능한지 검증
async fn verify_cached_ffmpeg(target: &Path) -> Result<bool, FfmpegError> {
    if !target.exists() {
        return Ok(false);
    }
    let Some(expected) = expected_ffmpeg_binary_sha256() else {
        // hash 미등록 플랫폼 — fail-closed
        return Ok(false);
    };
    match sha256_file(target).await {
        Ok(actual) if actual == expected => Ok(true),
        Ok(_) => {
            eprintln!("[FFmpeg] cached binary SHA mismatch — 재다운로드");
            let _ = tokio::fs::remove_file(target).await;
            Ok(false)
        }
        Err(e) => {
            eprintln!("[FFmpeg] SHA 계산 실패: {} — 재다운로드", e);
            let _ = tokio::fs::remove_file(target).await;
            Ok(false)
        }
    }
}

/// GitHub allowlist redirect 정책으로 ffmpeg .gz 다운로드 (cloudflared와 동일 패턴)
async fn download_ffmpeg_gz(url: &str) -> Result<Vec<u8>, FfmpegError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 {
                return attempt.error("too many redirects");
            }
            // HTTPS 강제 — http:// downgrade 차단
            if attempt.url().scheme() != "https" {
                return attempt.error("non-https redirect blocked");
            }
            let host = attempt.url().host_str().unwrap_or("").to_string();
            let allowed = [
                "github.com",
                "objects.githubusercontent.com",
                "release-assets.githubusercontent.com",
                "codeload.github.com",
            ];
            let is_allowed = allowed
                .iter()
                .any(|h| host == *h || host.ends_with(&format!(".{}", h)));
            if is_allowed {
                attempt.follow()
            } else {
                attempt.error(format!("redirect to non-allowlist host: {}", host))
            }
        }))
        .build()
        .map_err(|e| FfmpegError::DownloadFailed(e.to_string()))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| FfmpegError::DownloadFailed(e.to_string()))?;

    if !response.status().is_success() {
        return Err(FfmpegError::DownloadFailed(format!(
            "HTTP {}: {}",
            response.status(),
            url
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| FfmpegError::DownloadFailed(e.to_string()))?;

    Ok(bytes.to_vec())
}

/// .gz 단일 스트림 압축 해제 (eugeneware/ffmpeg-static은 tar 아닌 plain gzip)
fn decompress_gz(gz_bytes: &[u8]) -> Result<Vec<u8>, FfmpegError> {
    use std::io::Read;
    let mut decoder = flate2::read::GzDecoder::new(gz_bytes);
    let mut out = Vec::with_capacity(gz_bytes.len() * 4);
    decoder
        .read_to_end(&mut out)
        .map_err(|e| FfmpegError::Decompress(e.to_string()))?;
    Ok(out)
}

/// macOS quarantine 속성 제거 (Gatekeeper가 미사인 바이너리 실행 차단하지 않게)
#[cfg(target_os = "macos")]
async fn strip_quarantine(path: &Path) {
    // xattr -d com.apple.quarantine <path> 시도. 실패해도 무시 (속성 없으면 정상)
    let _ = Command::new("xattr")
        .arg("-d")
        .arg("com.apple.quarantine")
        .arg(path)
        .output()
        .await;
}

#[cfg(not(target_os = "macos"))]
async fn strip_quarantine(_path: &Path) {}

/// FFmpeg 자동 설치 — 시스템 → 캐시 → GitHub 다운로드 순.
///
/// 호출 시점: 컴패니언 시작 시 백그라운드 spawn (cloudflared/yt-dlp와 같은 흐름).
/// 반환: 사용 가능한 ffmpeg 바이너리의 절대 경로.
///
/// 실패 시 전체 컴패니언이 죽지 않도록 caller가 결과를 swallow해야 함.
pub async fn ensure_ffmpeg() -> Result<PathBuf, FfmpegError> {
    // 0순위: 시스템 표준 경로 (brew/Program Files)
    if let Some(p) = find_system_ffmpeg() {
        println!("[FFmpeg] 시스템 ffmpeg 사용: {}", p.display());
        return Ok(p);
    }

    // 1순위: 캐시 + SHA-256 검증
    let target = ffmpeg_cache_path()?;
    if verify_cached_ffmpeg(&target).await? {
        println!("[FFmpeg] 캐시 ffmpeg 사용 (SHA OK): {}", target.display());
        return Ok(target);
    }

    // 2순위: GitHub 다운로드
    println!("[FFmpeg] 다운로드 시작 — eugeneware/ffmpeg-static {}", FFMPEG_VERSION);
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let url = ffmpeg_download_url()?;
    println!("[FFmpeg] URL: {}", url);
    let gz_bytes = download_ffmpeg_gz(&url).await?;
    println!(
        "[FFmpeg] 다운로드 완료: {:.1}MB (.gz)",
        gz_bytes.len() as f64 / 1_000_000.0
    );

    // .gz SHA-256 fail-closed
    let actual_gz = compute_sha256(&gz_bytes);
    if let Some(expected_gz) = expected_ffmpeg_gz_sha256() {
        if actual_gz != expected_gz {
            return Err(FfmpegError::ChecksumMismatch {
                expected: expected_gz,
                actual: actual_gz,
            });
        }
        println!("[FFmpeg] .gz SHA-256 검증 통과");
    } else {
        return Err(FfmpegError::DownloadFailed(format!(
            ".gz SHA-256 미등록 플랫폼 — fail-closed ({} {})",
            std::env::consts::OS,
            std::env::consts::ARCH
        )));
    }

    // .gz 해제 (CPU bound이지만 ~25MB라 spawn_blocking 없이도 OK)
    let binary_bytes = tokio::task::spawn_blocking(move || decompress_gz(&gz_bytes))
        .await
        .map_err(|e| FfmpegError::Internal(format!("spawn_blocking 실패: {}", e)))??;
    println!(
        "[FFmpeg] 압축 해제 완료: {:.1}MB",
        binary_bytes.len() as f64 / 1_000_000.0
    );

    // 해제된 binary SHA-256 fail-closed (이중 검증)
    let actual_bin = compute_sha256(&binary_bytes);
    if let Some(expected_bin) = expected_ffmpeg_binary_sha256() {
        if actual_bin != expected_bin {
            return Err(FfmpegError::ChecksumMismatch {
                expected: expected_bin,
                actual: actual_bin,
            });
        }
        println!("[FFmpeg] binary SHA-256 검증 통과");
    }

    // 디스크 저장
    tokio::fs::write(&target, &binary_bytes).await?;

    // 실행 권한 (Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&target).await?.permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&target, perms).await?;
    }

    // macOS quarantine 제거 (없으면 no-op)
    strip_quarantine(&target).await;

    println!("[FFmpeg] 설치 완료: {}", target.display());
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_for_known_platforms_is_github() {
        // 현재 host 플랫폼 기준 — CI에서 macos/linux/windows 모두 통과해야 함
        if let Ok(url) = ffmpeg_download_url() {
            assert!(url.starts_with("https://github.com/eugeneware/ffmpeg-static/releases/download/"));
            assert!(url.contains(FFMPEG_VERSION));
        }
    }

    #[test]
    fn version_pinned_to_b6_1_1() {
        assert_eq!(FFMPEG_VERSION, "b6.1.1");
    }

    #[test]
    fn host_platform_has_sha256_registered() {
        // 5 지원 플랫폼 중 하나에서 build/run하는 경우 hash가 등록되어 있어야 함
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        let supported = matches!(
            (os, arch),
            ("macos", "aarch64")
                | ("macos", "x86_64")
                | ("windows", "x86_64")
                | ("linux", "x86_64")
                | ("linux", "aarch64")
        );
        if supported {
            assert!(expected_ffmpeg_gz_sha256().is_some());
            assert!(expected_ffmpeg_binary_sha256().is_some());
        }
    }

    #[test]
    fn cache_path_under_companion_data_dir() {
        if let Ok(p) = ffmpeg_cache_path() {
            let s = p.to_string_lossy();
            assert!(s.contains("ytdlp-companion"));
            assert!(s.ends_with("ffmpeg") || s.ends_with("ffmpeg.exe"));
        }
    }

    #[test]
    fn compute_sha256_matches_known_vector() {
        // empty string SHA-256 — 알려진 값
        let h = compute_sha256(b"");
        assert_eq!(h, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    #[test]
    fn windows_candidate_paths_cover_user_scoped_installers() {
        let candidates = windows_ffmpeg_candidate_paths_with_roots(
            Some(PathBuf::from("/Users/tester/AppData/Local")),
            Some(PathBuf::from("/Users/tester")),
        );

        let winget = Path::new("Microsoft")
            .join("WinGet")
            .join("Links")
            .join("ffmpeg.exe");
        let scoop_shim = Path::new("scoop").join("shims").join("ffmpeg.exe");
        let scoop_app = Path::new("scoop")
            .join("apps")
            .join("ffmpeg")
            .join("current")
            .join("bin")
            .join("ffmpeg.exe");

        assert!(candidates.iter().any(|path| path.ends_with(&winget)));
        assert!(candidates.iter().any(|path| path.ends_with(&scoop_shim)));
        assert!(
            candidates
                .iter()
                .any(|path| path.ends_with(&scoop_app))
        );
    }
}

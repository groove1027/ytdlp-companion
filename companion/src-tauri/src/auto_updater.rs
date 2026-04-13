//! 백그라운드 자동 업데이트 모듈
//!
//! GitHub releases API를 주기적으로 체크하여 새 버전이 있으면
//! 백그라운드에서 다운로드 + 설치 + 재시작합니다.
//!
//! 사용자에게 창을 보여주지 않고 트레이 상태에서 모든 것이 자동 처리됩니다.

use std::sync::atomic::{AtomicBool, Ordering};

const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/groove1027/ytdlp-companion/releases/latest";
const CHECK_INTERVAL_SECS: u64 = 3600; // 1시간마다 체크
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

static UPDATE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(serde::Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(serde::Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

/// 현재 버전과 원격 버전 비교 (semantic versioning)
fn is_newer_version(remote_tag: &str) -> bool {
    // "companion-v2.3.1" → "2.3.1"
    let remote_ver = remote_tag
        .trim_start_matches("companion-v")
        .trim_start_matches('v');

    let parse = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.split('-').next()?.parse().ok())
            .collect()
    };

    let current = parse(CURRENT_VERSION);
    let remote = parse(remote_ver);

    for i in 0..3 {
        let c = current.get(i).copied().unwrap_or(0);
        let r = remote.get(i).copied().unwrap_or(0);
        if r > c {
            return true;
        }
        if r < c {
            return false;
        }
    }
    false
}

/// 플랫폼에 맞는 설치 파일 선택
fn pick_asset(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    #[cfg(target_os = "windows")]
    {
        // Windows: NSIS .exe 우선
        assets
            .iter()
            .find(|a| a.name.ends_with("-setup.exe"))
            .or_else(|| assets.iter().find(|a| a.name.ends_with(".msi")))
    }
    #[cfg(target_os = "macos")]
    {
        // macOS: Universal DMG
        assets.iter().find(|a| a.name.ends_with(".dmg"))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

/// GitHub releases에서 최신 버전 확인
async fn check_for_update() -> Option<(String, GitHubAsset)> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .ok()?;

    let release: GitHubRelease = client
        .get(GITHUB_RELEASES_URL)
        .header("User-Agent", "ytdlp-companion-updater")
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    if !is_newer_version(&release.tag_name) {
        return None;
    }

    let asset = pick_asset(&release.assets)?;
    Some((release.tag_name, GitHubAsset {
        name: asset.name.clone(),
        browser_download_url: asset.browser_download_url.clone(),
        size: asset.size,
    }))
}

/// 설치 파일 다운로드 → 임시 파일 저장
async fn download_installer(asset: &GitHubAsset) -> Result<std::path::PathBuf, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client 생성 실패: {e}"))?;

    let response = client
        .get(&asset.browser_download_url)
        .header("User-Agent", "ytdlp-companion-updater")
        .send()
        .await
        .map_err(|e| format!("다운로드 실패: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("다운로드 HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("바이트 읽기 실패: {e}"))?;

    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join(&asset.name);
    tokio::fs::write(&installer_path, &bytes)
        .await
        .map_err(|e| format!("파일 저장 실패: {e}"))?;

    Ok(installer_path)
}

/// 설치 파일 실행 (플랫폼별)
fn run_installer(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // NSIS: /S = silent install
        let mut cmd = crate::platform::sync_cmd(path);
        cmd.arg("/S");
        cmd.spawn().map_err(|e| format!("설치 실행 실패: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        // DMG: hdiutil attach → cp → detach → restart
        let dmg_path = path.to_string_lossy();
        std::process::Command::new("hdiutil")
            .args(["attach", &dmg_path, "-nobrowse", "-quiet"])
            .output()
            .map_err(|e| format!("DMG 마운트 실패: {e}"))?;

        // DMG 안의 .app을 /Applications에 복사
        let app_name = "All In One Helper.app";
        let mount_point = format!("/Volumes/All In One Helper");
        let source = format!("{mount_point}/{app_name}");
        let dest = format!("/Applications/{app_name}");

        // 기존 앱 제거 + 복사
        let _ = std::fs::remove_dir_all(&dest);
        std::process::Command::new("cp")
            .args(["-R", &source, &dest])
            .output()
            .map_err(|e| format!("앱 복사 실패: {e}"))?;

        // DMG 언마운트
        let _ = std::process::Command::new("hdiutil")
            .args(["detach", &mount_point, "-quiet"])
            .output();

        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("지원하지 않는 플랫폼".to_string())
    }
}

/// 백그라운드 자동 업데이트 루프 시작
pub fn spawn_auto_update_loop() {
    tokio::spawn(async {
        // 첫 체크는 시작 후 30초 대기 (서버 초기화 우선)
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        loop {
            if !UPDATE_IN_PROGRESS.load(Ordering::Relaxed) {
                match check_for_update().await {
                    Some((tag, asset)) => {
                        println!(
                            "[AutoUpdate] 새 버전 발견: {} → {} ({}MB)",
                            CURRENT_VERSION,
                            tag,
                            asset.size / 1024 / 1024
                        );

                        UPDATE_IN_PROGRESS.store(true, Ordering::Relaxed);

                        match download_installer(&asset).await {
                            Ok(installer_path) => {
                                println!(
                                    "[AutoUpdate] 다운로드 완료: {}",
                                    installer_path.display()
                                );

                                match run_installer(&installer_path) {
                                    Ok(()) => {
                                        println!("[AutoUpdate] 설치 시작됨 — 앱 재시작 예정");
                                        // Windows NSIS는 자동으로 기존 프로세스를 종료하고 재시작
                                        // macOS는 수동 재시작 필요
                                        #[cfg(target_os = "macos")]
                                        {
                                            tokio::time::sleep(
                                                std::time::Duration::from_secs(3),
                                            )
                                            .await;
                                            std::process::exit(0);
                                            // 자동 시작(autostart)이 앱을 다시 실행
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[AutoUpdate] 설치 실패: {e}");
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[AutoUpdate] 다운로드 실패: {e}");
                            }
                        }

                        UPDATE_IN_PROGRESS.store(false, Ordering::Relaxed);
                    }
                    None => {
                        println!("[AutoUpdate] 최신 버전 (v{CURRENT_VERSION})");
                    }
                }
            }

            tokio::time::sleep(std::time::Duration::from_secs(CHECK_INTERVAL_SECS)).await;
        }
    });
}

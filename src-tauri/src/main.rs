// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod platform;
mod server;
mod ytdlp;
mod rembg;
mod whisper;
mod tts;

use tauri::{
    tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent},
    menu::{Menu, MenuItem},
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 시스템 트레이 설정
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let status = MenuItem::with_id(app, "status", "⚡ 헬퍼 실행 중", false, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status, &quit])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("All In One Helper — 안정적이고 빠른 AI 미디어 처리")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|_tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        // 좌클릭 시 상태 표시 (향후 확장 가능)
                    }
                })
                .build(app)?;

            // localhost:9876 API 서버 시작 (백그라운드)
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::start_server(app_handle).await {
                    eprintln!("[Companion] 서버 시작 실패: {}", e);
                }
            });

            // 바이너리 자동 다운로드/업데이트 (백그라운드)
            // yt-dlp + whisper: 독립 바이너리이므로 병렬 OK
            tauri::async_runtime::spawn(async {
                if let Err(e) = ytdlp::ensure_ytdlp().await {
                    eprintln!("[Companion] yt-dlp 설정 실패: {}", e);
                }
            });
            tauri::async_runtime::spawn(async {
                if let Err(e) = whisper::ensure_whisper().await {
                    eprintln!("[Companion] whisper 설정 실패: {}", e);
                }
            });
            // pip install은 직렬 실행 — 동일 Python 환경에 동시 설치 시 경쟁 조건 발생
            tauri::async_runtime::spawn(async {
                if let Err(e) = rembg::ensure_rembg().await {
                    eprintln!("[Companion] rembg 설정 실패: {}", e);
                }
                // rembg 완료 후 TTS 설치 (같은 pip 환경 보호)
                if let Err(e) = tts::ensure_tts().await {
                    eprintln!("[Companion] TTS 설정 실패: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

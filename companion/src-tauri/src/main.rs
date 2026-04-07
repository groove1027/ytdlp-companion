// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ffmpeg;
mod platform;
mod rembg;
mod server;
mod takeover;
mod tts;
mod video_tunnel;
mod whisper;
mod ytdlp;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::ManagerExt;

/// 창을 최상위로 올리고 포커스
/// ⚠️ 외부 프로세스로 앱을 활성화하면 안 됨 (open -b, osascript 등)
///    → single-instance 플러그인이 재진입하여 무한 루프 발생
fn focus_window(win: &tauri::WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

fn main() {
    // [v1.3.1] take-over — 옛 헬퍼(v1.3.0 이하)가 9876 포트를 점유하고 있으면
    // 자동으로 종료시키고 자기가 take-over한다. 이 호출은 반드시 single-instance
    // 플러그인 등록 전에 와야 한다 — 옛 헬퍼와 같은 bundle id면 single-instance가
    // 새 인스턴스를 죽이기 때문에, 그 전에 옛 인스턴스를 먼저 정리해야 한다.
    //
    // 순서:
    //   1) takeover_old_helper_if_present() — 옛 token 파일 읽어서 graceful /quit 시도
    //      → 옛 헬퍼가 v1.3.1+이면 token 매칭 → graceful 종료
    //      → v1.3.0 이하면 token 파일 없음 → fallback PID kill (LISTEN 소켓만)
    //   2) ensure_quit_token() — 자기 자신의 새 token 생성/교체
    //      → 다음 v1.3.2+ 헬퍼가 takeover할 때 사용
    //   3) single_instance plugin 등록 (이제 9876 비어있고 token 새로 갱신됨)
    //
    // 결과:
    //   true  → 9876 비어있음 (정상 진행)
    //   false → 5초 후에도 점유 중 (single-instance plugin이 자동으로 새 인스턴스 종료할 것)
    // [v2.0.3 hotfix] takeover가 false를 리턴하면(같은 버전 감지 → self-kill 루프 방지)
    // single-instance plugin이 곧 본 instance를 종료시킬 예정이므로 quit-token을
    // 갱신하지 않는다. 갱신하면 살아남은 기존 instance의 in-memory token과 디스크 token이
    // 어긋나서 다음 cross-version takeover의 graceful /quit가 실패할 수 있음.
    let takeover_ok = takeover::takeover_old_helper_if_present();
    if takeover_ok {
        let _new_token = takeover::ensure_quit_token();
        println!("[Companion] quit-token 갱신 완료 (다음 take-over용)");
    } else {
        println!(
            "[Companion] takeover 스킵 — quit-token 갱신 보류 (single-instance plugin이 본 instance를 정리할 것)"
        );
    }

    tauri::Builder::default()
        // 중복 실행 방지 — deep-link로 2차 인스턴스가 뜨면 기존 인스턴스에 위임
        // ⚠️ single-instance는 반드시 다른 플러그인보다 먼저 등록해야 함
        // ⚠️ takeover_old_helper_if_present()가 먼저 끝나야 함 (위 라인)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 이미 실행 중이면 기존 윈도우만 포커스
            if let Some(win) = app.get_webview_window("main") {
                focus_window(&win);
            }
        }))
        // allinonehelper:// URL 스킴 — 웹앱에서 컴패니언 강제 실행 가능
        .plugin(tauri_plugin_deep_link::init())
        // [FIX #907] 로그인 시 자동 시작 — 컴패니언이 항상 실행 중이도록 보장
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            // 자동 시작 활성화 (사용자가 비활성화하지 않는 한 항상 ON)
            let autostart = app.autolaunch();
            if !autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.enable();
                println!("[Companion] 로그인 시 자동 시작 활성화됨");
            }

            // --hidden 플래그: 자동 시작 시 UI 안 띄움 / 수동 실행 시 창 강제 포커스
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            } else {
                // [FIX] 수동 실행 시 창 표시 — 지연 후 포커스 (Tauri 초기화 + WebView 렌더링 대기)
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    if let Some(win) = app_handle.get_webview_window("main") {
                        focus_window(&win);
                    }
                });
            }
            // 시스템 트레이 설정
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "상태 보기", true, None::<&str>)?;
            let status = MenuItem::with_id(app, "status", "⚡ 헬퍼 실행 중", false, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status, &show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("All In One Helper — 안정적이고 빠른 AI 미디어 처리")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => {
                        // (Codex High 1 + Round-2 High) 모든 quit 경로가 동일한
                        // graceful_shutdown_and_exit()를 거쳐야 cloudflared가 정리됨.
                        let _app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            server::graceful_shutdown_and_exit().await;
                        });
                    }
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            focus_window(&win);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 좌클릭 시 윈도우 보이기
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            focus_window(&win);
                        }
                    }
                })
                .build(app)?;

            // 창 닫기 시 숨김 처리 (앱 종료 대신) — "이 창을 닫아도 계속 실행" 약속 이행
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            // localhost:9876 API 서버 시작 (백그라운드)
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::start_server(app_handle).await {
                    eprintln!("[Companion] 서버 시작 실패: {}", e);
                }
            });

            // (Codex Round-4 Medium) Ctrl-C / SIGTERM 신호 처리 — graceful shutdown
            // kill -TERM <pid>나 콘솔 Ctrl-C로 종료해도 cloudflared가 orphan으로 남지 않도록.
            tauri::async_runtime::spawn(async move {
                #[cfg(unix)]
                {
                    use tokio::signal::unix::{signal, SignalKind};
                    let mut sigterm = match signal(SignalKind::terminate()) {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("[Companion] SIGTERM handler 설정 실패: {}", e);
                            return;
                        }
                    };
                    let mut sigint = match signal(SignalKind::interrupt()) {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("[Companion] SIGINT handler 설정 실패: {}", e);
                            return;
                        }
                    };
                    tokio::select! {
                        _ = sigterm.recv() => println!("[Companion] SIGTERM 수신"),
                        _ = sigint.recv() => println!("[Companion] SIGINT 수신"),
                    }
                }
                #[cfg(not(unix))]
                {
                    if let Err(e) = tokio::signal::ctrl_c().await {
                        eprintln!("[Companion] Ctrl-C handler 설정 실패: {}", e);
                        return;
                    }
                    println!("[Companion] Ctrl-C 수신");
                }
                server::graceful_shutdown_and_exit().await;
            });

            // 바이너리 자동 다운로드/업데이트 (백그라운드)
            // yt-dlp + whisper + ffmpeg: 독립 바이너리이므로 병렬 OK
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
            // [v2.0.2] ffmpeg 자동 다운로드 — 1080p+오디오 merge에 필수.
            // 시스템(brew/Program Files) 우선, 없으면 GitHub eugeneware/ffmpeg-static b6.1.1
            tauri::async_runtime::spawn(async {
                match ffmpeg::ensure_ffmpeg().await {
                    Ok(p) => println!("[Companion] ffmpeg 준비 완료: {}", p.display()),
                    Err(e) => eprintln!("[Companion] ffmpeg 설정 실패 (1080p+오디오 merge 불가능): {}", e),
                }
            });
            // pip install은 직렬 실행 — 동일 Python 환경에 동시 설치 시 경쟁 조건 발생
            tauri::async_runtime::spawn(async {
                if let Err(e) = rembg::ensure_rembg().await {
                    eprintln!("[Companion] rembg 설정 실패: {}", e);
                }
                // rembg 완료 후 TTS 설치 (같은 pip 환경 보호 — 직렬 실행)
                if let Err(e) = tts::ensure_edge_tts().await {
                    eprintln!("[Companion] Edge TTS 설정 실패: {}", e);
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // (Codex Round-2 High + Round-7 High) 모든 종료 경로 통합
            // ExitRequested 시 graceful_shutdown_and_exit()를 호출 — init phase child + tunnel manager 모두 정리.
            if let tauri::RunEvent::ExitRequested { api: _, .. } = &event {
                println!("[Companion] ExitRequested 수신 — graceful shutdown");
                tauri::async_runtime::block_on(async {
                    // init phase child 먼저 정리 (TunnelManager publish 전 단계)
                    server::kill_init_phase_child_if_any();
                    // 그 다음 TunnelManager (있으면)
                    if let Some(mgr) = server::tunnel_manager() {
                        mgr.shutdown().await;
                        println!("[Companion] tunnel manager shutdown 완료 (ExitRequested)");
                    }
                });
            }
        });
}

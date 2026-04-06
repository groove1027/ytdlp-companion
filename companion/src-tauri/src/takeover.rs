// ============================================================
// [v1.3.1] take-over — 옛 헬퍼 자동 종료 + 자기 take-over
//
// 동기:
//   v1.3.0 이하 헬퍼는 트레이에서 quit하지 않으면 포트 9876을 점유한 채로
//   남는다. 같은 bundle id의 새 .app을 더블클릭하면 single-instance 플러그인이
//   새 인스턴스를 죽이거나, 새 인스턴스가 9876 bind에 실패해서 영원히 옛 v1.2.0이
//   살아있는 무한 루프가 발생한다.
//
//   이 모듈은 main() 첫 줄에서 호출되어:
//     1) 9876 health check → ytdlp-companion 식별자 응답 받으면 takeover 진입
//     2) POST /quit → 새 v1.3.1+ 헬퍼는 정상 종료
//     3) /quit 실패 → fallback: lsof/netstat로 PID 찾아서 SIGTERM/taskkill
//     4) 5초 동안 health check 재시도 → 응답 없으면 진행
//     5) 응답 계속 있으면 abort (다른 사용자가 손으로 처리해야 함)
//
// 호출 시점: tauri::Builder 생성 전, single-instance 플러그인 등록 전.
//   순서가 중요 — 이 함수가 끝난 시점에 9876 포트가 비어있어야 한다.
//
// 절대 안전 조건:
//   - 응답이 ytdlp-companion 시그니처일 때만 takeover 진행 (9876 포트 쓰는
//     다른 무관한 프로세스를 죽이지 않기 위함)
//   - 자기 자신과 같은 PID는 절대 죽이지 않음 (process::id() 비교)
// ============================================================

use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

const HELPER_PORT: u16 = 9876;
const HELPER_SIGNATURE: &str = "ytdlp-companion";
const TAKEOVER_TIMEOUT_SECS: u64 = 5;
const QUIT_TOKEN_FILENAME: &str = "quit-token";

/// 헬퍼 데이터 디렉토리에 저장된 quit token 파일 경로.
/// 같은 머신의 헬퍼만 이 파일을 읽을 수 있어야 한다 (사용자 home 권한 보호).
pub fn quit_token_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join(QUIT_TOKEN_FILENAME)
}

/// 헬퍼 시작 시 호출 — 랜덤 token 생성/회전 후 디스크에 저장.
/// /quit endpoint는 같은 token을 X-Helper-Token 헤더로 받아야 동작한다.
///
/// Returns: 새로 생성된 token (헬퍼 process가 메모리에 보관)
pub fn ensure_quit_token() -> String {
    let token = generate_random_token();
    let path = quit_token_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, &token);
    // 권한 제한 (Unix만 — 사용자 본인만 읽기)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    token
}

/// 디스크에서 현재 token 읽기 (takeover 측이 옛 헬퍼의 token을 알기 위함).
pub fn read_quit_token() -> Option<String> {
    let path = quit_token_path();
    let content = std::fs::read_to_string(&path).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() || trimmed.len() > 256 {
        return None;
    }
    Some(trimmed.to_string())
}

/// 32자 base16 random token (UUID-like, 의존성 추가 없이 std만)
fn generate_random_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    // 시스템 시간 + process id + 메모리 주소를 hash해서 충돌 방지.
    // Cryptographic strength 필요 없음 — 같은 머신 IPC 식별자 용도.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let stack_addr = &nanos as *const _ as u128;
    let mixed = nanos
        .wrapping_mul(0xa076_1d64_78bd_642f)
        .wrapping_add(pid.wrapping_mul(0xe703_7ed1_a0b4_28db))
        .wrapping_add(stack_addr.wrapping_mul(0x8ebc_6af0_9c88_c6e3));
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&mixed.to_le_bytes());
    // ALSO mix nanos lower bits for extra entropy
    for (i, b) in bytes.iter_mut().enumerate() {
        *b ^= ((nanos >> (i * 4)) & 0xff) as u8;
    }
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// 동기 health check — main()의 첫 줄에서 호출되므로 tokio runtime 없이 동작해야 함.
/// reqwest::blocking을 쓰지 않고 std::net::TcpStream + raw HTTP로 처리.
fn check_old_helper_signature() -> Option<String> {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", HELPER_PORT).parse().ok()?,
        Duration::from_secs(2),
    ).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;

    let request = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        HELPER_PORT
    );
    let mut stream = stream;
    stream.write_all(request.as_bytes()).ok()?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;

    if !response.contains(HELPER_SIGNATURE) {
        // 9876 포트를 ytdlp-companion이 아닌 다른 무관한 프로세스가 쓰는 중.
        // 절대 takeover 진행하지 않음.
        return None;
    }
    // 응답 body에서 version 추출 시도 (실패해도 takeover는 진행)
    Some(response)
}

/// 옛 헬퍼에게 /quit 시도 — 새 v1.3.1+ 헬퍼만 응답함.
/// v1.3.0 이하는 endpoint 자체가 없어서 404 또는 connection close.
///
/// X-Helper-Token 헤더에 디스크의 quit-token 파일 값을 실어 보낸다.
/// 같은 머신 사용자만 접근 가능한 파일이므로 악성 웹페이지는 token을 알 수 없다.
fn try_graceful_quit() -> bool {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    // 옛 헬퍼가 이미 저장해둔 token 읽기 (없으면 graceful quit 포기)
    let Some(token) = read_quit_token() else {
        println!("[Takeover] quit-token 파일 없음 — graceful quit 스킵 (v1.3.0 이하 옛 헬퍼)");
        return false;
    };

    let Ok(addr) = format!("127.0.0.1:{}", HELPER_PORT).parse() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    let request = format!(
        "POST /quit HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-Helper-Token: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        HELPER_PORT, token
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    // 200 OK + shutting_down 응답이면 graceful quit 성공
    response.contains("200 OK") && response.contains("shutting_down")
}

/// fallback: OS 명령으로 9876 점유 프로세스 PID 찾아서 강제 종료.
/// 자기 자신 PID는 절대 죽이지 않음.
fn force_kill_port_holder() -> bool {
    let my_pid = std::process::id();
    let pids = find_pids_on_port(HELPER_PORT);

    let mut killed_any = false;
    for pid in pids {
        if pid == my_pid {
            // 절대 자기 자신 죽이지 않음
            continue;
        }
        if kill_pid(pid) {
            killed_any = true;
            println!("[Takeover] PID {} 강제 종료 (force_kill)", pid);
        }
    }
    killed_any
}

// [Codex 6차 fix] LISTEN 소켓만 매칭. ESTABLISHED 클라이언트 연결의 PID는 절대 잡지 않음.
// 그래야 9876에 연결한 webapp 탭이나 무관한 클라이언트가 죽지 않는다.
#[cfg(target_os = "macos")]
fn find_pids_on_port(port: u16) -> Vec<u32> {
    // lsof -nP -iTCP:9876 -sTCP:LISTEN -t — LISTEN 상태의 PID만 출력
    let Ok(output) = Command::new("lsof")
        .args(["-nP", "-iTCP", &format!("-iTCP:{}", port), "-sTCP:LISTEN", "-t"])
        .output()
    else {
        return vec![];
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
        .collect()
}

#[cfg(target_os = "linux")]
fn find_pids_on_port(port: u16) -> Vec<u32> {
    // 동일 — Linux의 lsof도 -sTCP:LISTEN 지원
    let Ok(output) = Command::new("lsof")
        .args(["-nP", "-iTCP", &format!("-iTCP:{}", port), "-sTCP:LISTEN", "-t"])
        .output()
    else {
        return vec![];
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
        .collect()
}

#[cfg(target_os = "windows")]
fn find_pids_on_port(port: u16) -> Vec<u32> {
    // netstat -ano -p TCP 출력 형식 (예):
    //   Proto  Local Address          Foreign Address        State           PID
    //   TCP    127.0.0.1:9876         0.0.0.0:0              LISTENING       12345
    //   TCP    127.0.0.1:54321        127.0.0.1:9876         ESTABLISHED     67890
    //
    // 우리는 LISTENING 상태이고 Local Address가 :9876으로 끝나는 행만 매칭해야 한다.
    // ESTABLISHED 행(원격 주소가 9876)은 절대 매칭하지 않음.
    let Ok(output) = Command::new("netstat")
        .args(["-ano", "-p", "TCP"])
        .output()
    else {
        return vec![];
    };
    let port_suffix = format!(":{}", port);
    let mut pids = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // [Proto, Local, Foreign, State, PID] — 5 컬럼 필요
        if parts.len() < 5 {
            continue;
        }
        let proto = parts[0];
        let local_addr = parts[1];
        let state = parts[3];
        let pid_str = parts[4];

        if proto != "TCP" {
            continue;
        }
        // LISTENING (영문) 또는 LISTEN (일부 로케일) 만 매칭
        if !state.eq_ignore_ascii_case("LISTENING") && !state.eq_ignore_ascii_case("LISTEN") {
            continue;
        }
        // Local Address가 정확히 :9876으로 끝나는지 (다른 포트의 prefix 매칭 방지)
        if !local_addr.ends_with(&port_suffix) {
            continue;
        }
        if let Ok(pid) = pid_str.parse::<u32>() {
            if pid > 0 && !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }
    pids
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn kill_pid(pid: u32) -> bool {
    // SIGTERM 먼저 → 500ms 대기 → SIGKILL
    let term = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status();
    std::thread::sleep(Duration::from_millis(500));
    let _kill = Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .status();
    term.map(|s| s.success()).unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn kill_pid(pid: u32) -> bool {
    Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// public — main() 첫 줄에서 호출.
///
/// 반환:
///   - true:  9876 포트가 비어 있음 (takeover 성공 또는 처음부터 비어있었음)
///   - false: 9876 포트가 여전히 점유 중 (사용자 액션 필요)
///
/// false를 반환해도 메인 진행은 막지 않음 (single-instance plugin이 어차피 처리).
pub fn takeover_old_helper_if_present() -> bool {
    println!("[Takeover] 9876 포트 점유 확인 시작");

    // 1) signature 확인 — 9876에 응답하는 게 ytdlp-companion인지
    let Some(_response) = check_old_helper_signature() else {
        println!("[Takeover] 9876 포트 비어있거나 다른 무관한 프로세스 — takeover 스킵");
        return true;
    };

    println!("[Takeover] 옛 ytdlp-companion 감지 — takeover 진행");

    // 2) graceful quit 시도 (새 v1.3.1+ 헬퍼만 응답)
    if try_graceful_quit() {
        println!("[Takeover] graceful /quit 성공");
    } else {
        println!("[Takeover] graceful /quit 실패 — force kill로 fallback");
        // 3) fallback: PID 찾아서 강제 종료
        if !force_kill_port_holder() {
            println!("[Takeover] force_kill_port_holder 실패");
        }
    }

    // 4) 최대 5초 대기하면서 9876이 비었는지 확인
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(TAKEOVER_TIMEOUT_SECS) {
        std::thread::sleep(Duration::from_millis(500));
        if check_old_helper_signature().is_none() {
            println!("[Takeover] 9876 해제 확인 — 자기 시작 진행");
            return true;
        }
    }

    eprintln!("[Takeover] {}초 후에도 9876이 점유 중 — 사용자 액션 필요", TAKEOVER_TIMEOUT_SECS);
    false
}

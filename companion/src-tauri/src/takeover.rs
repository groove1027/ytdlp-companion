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

/// 9876 포트의 옛 헬퍼에 대한 정보 (signature 매칭 + 추출된 메타데이터).
///
/// [v2.0.3 hotfix #1090-windows] takeover 의사결정에 필요한 옛 instance의 버전을
/// 함께 들고온다. 같은 버전이면 self-kill 무한 루프 방지를 위해 takeover를 건너뛴다.
struct HelperInfo {
    /// /health JSON에서 추출한 `version` 필드. 추출 실패 시 None.
    /// None이면 옛(v1.x) 또는 비표준 응답 → 안전하게 takeover 진행.
    version: Option<String>,
}

/// /health JSON 응답 body에서 `"version":"X.Y.Z"` 패턴을 std-only 파싱으로 추출.
/// serde_json 의존성을 takeover에 끌어오지 않기 위함 (main() 첫 줄 호출용).
fn extract_version_from_health(response: &str) -> Option<String> {
    let key = "\"version\":\"";
    let start = response.find(key)? + key.len();
    let rest = response.get(start..)?;
    let end = rest.find('"')?;
    let version = rest.get(..end)?.trim();
    if version.is_empty() || version.len() > 32 {
        return None;
    }
    Some(version.to_string())
}

/// 동기 health check — main()의 첫 줄에서 호출되므로 tokio runtime 없이 동작해야 함.
/// reqwest::blocking을 쓰지 않고 std::net::TcpStream + raw HTTP로 처리.
fn check_old_helper_signature() -> Option<HelperInfo> {
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
    // 응답 body에서 version 추출 (실패해도 HelperInfo는 리턴 — 옛 헬퍼로 간주)
    let version = extract_version_from_health(&response);
    Some(HelperInfo { version })
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

// [Codex 6차 fix + v1.3.2 critical fix] LISTEN 소켓만 매칭.
// ESTABLISHED 클라이언트 연결의 PID는 절대 잡지 않음.
// ⚠️ v1.3.1 회귀: `-iTCP -iTCP:9876` 처럼 -iTCP를 두 번 쓰면 첫 번째가 모든 TCP를
//    의미해서 시스템 전체 LISTEN 프로세스가 잡혔다 (실측: 9876과 무관한 system 프로세스
//    7개가 동시에 SIGKILL). 반드시 `-iTCP:9876` 단 1회만 사용.
#[cfg(target_os = "macos")]
fn find_pids_on_port(port: u16) -> Vec<u32> {
    // lsof -nP -iTCP:9876 -sTCP:LISTEN -t — LISTEN 상태의 PID만 출력
    let Ok(output) = Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{}", port), "-sTCP:LISTEN", "-t"])
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
        .args(["-nP", &format!("-iTCP:{}", port), "-sTCP:LISTEN", "-t"])
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
    let Some(info) = check_old_helper_signature() else {
        println!("[Takeover] 9876 포트 비어있거나 다른 무관한 프로세스 — takeover 스킵");
        return true;
    };

    // [v2.0.3 hotfix — Windows self-kill loop]
    // 같은 버전 instance가 9876을 점유 중이면 takeover를 절대 진행하지 않는다.
    // 이유: v2.0.2에서 wrapper / autostart / deep-link 등이 같은 binary를 두 번
    // spawn할 때, 두 번째 instance가 첫 번째를 takeover로 죽이고, 그 다음 첫 번째가
    // 다시 spawn되어 두 번째를 죽이는 무한 루프가 발생함 ("꺼졌다 켜졌다" 증상).
    //
    // 같은 버전끼리는 single-instance plugin이 dedup하도록 위임한다.
    // - takeover가 false를 리턴하면 main()은 그대로 진행 → tauri::Builder가
    //   single-instance plugin을 등록 → plugin이 즉시 두 번째 instance를 catch하고
    //   기존 instance에 위임 → 두 번째 instance는 graceful exit.
    //
    // 다른 버전 (예: v2.0.2 → v2.0.3 업그레이드, v1.3.1 → v2.0.3 점프)이면 기존
    // takeover 동작 유지 → graceful /quit 또는 force kill → 새 instance 시작.
    let my_version = env!("CARGO_PKG_VERSION");
    if let Some(other_version) = info.version.as_deref() {
        if other_version == my_version {
            eprintln!(
                "[Takeover] 같은 버전({}) 감지 — self-kill 루프 방지를 위해 takeover 스킵. \
                 single-instance plugin이 본 instance를 정리할 것.",
                my_version
            );
            // false를 리턴 → main()은 진행하지만 single-instance plugin이 즉시 catch.
            return false;
        }
        println!(
            "[Takeover] 옛 버전({}) → 본 버전({}) 감지 — takeover 진행",
            other_version, my_version
        );
    } else {
        println!("[Takeover] 옛 ytdlp-companion 감지 (버전 미상 = v1.x 이하) — takeover 진행");
    }

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_version_parses_well_formed_health_response() {
        let body = r#"HTTP/1.1 200 OK
Content-Type: application/json

{"app":"ytdlp-companion","status":"ok","version":"2.0.3","ytdlp_version":null}"#;
        assert_eq!(extract_version_from_health(body).as_deref(), Some("2.0.3"));
    }

    #[test]
    fn extract_version_returns_none_when_field_missing() {
        let body = r#"{"app":"ytdlp-companion","status":"ok"}"#;
        assert_eq!(extract_version_from_health(body), None);
    }

    #[test]
    fn extract_version_returns_none_for_empty_value() {
        let body = r#"{"version":""}"#;
        assert_eq!(extract_version_from_health(body), None);
    }

    #[test]
    fn extract_version_rejects_oversized_value() {
        let big = "x".repeat(64);
        let body = format!(r#"{{"version":"{}"}}"#, big);
        assert_eq!(extract_version_from_health(&body), None);
    }

    #[test]
    fn extract_version_handles_v131_v202_v203() {
        // 회귀 가드: 포맷이 깨지지 않음을 보장
        for v in &["1.3.1", "2.0.2", "2.0.3", "10.20.30"] {
            let body = format!(r#"{{"version":"{}"}}"#, v);
            assert_eq!(extract_version_from_health(&body).as_deref(), Some(*v));
        }
    }
}

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

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// [Defense A] 포트 fallback — 9877에서 실행 중인 옛 헬퍼도 takeover 대상
const HELPER_PORT_CANDIDATES: [u16; 2] = [9876, 9877];
const HELPER_SIGNATURE: &str = "ytdlp-companion";
const TAKEOVER_TIMEOUT_SECS: u64 = 5;
const QUIT_TOKEN_FILENAME: &str = "quit-token";
const TAKEOVER_HISTORY_FILENAME: &str = "takeover-history";

/// 헬퍼 데이터 디렉토리에 저장된 quit token 파일 경로.
/// 같은 머신의 헬퍼만 이 파일을 읽을 수 있어야 한다 (사용자 home 권한 보호).
pub fn quit_token_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join(QUIT_TOKEN_FILENAME)
}

fn takeover_history_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ytdlp-companion")
        .join(TAKEOVER_HISTORY_FILENAME)
}

/// 컴패니언 데이터 파일 쓰기 (디렉토리 자동 생성 + Unix 0o600 권한)
fn write_companion_data_file(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, contents);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
}

/// [Defense B] takeover-history 파일에서 ISO-8601 타임스탬프 파싱
fn parse_takeover_history(raw: &str) -> Vec<DateTime<Utc>> {
    raw.lines()
        .filter_map(|line| DateTime::parse_from_rfc3339(line.trim()).ok())
        .map(|ts| ts.with_timezone(&Utc))
        .collect()
}

/// [Defense B] takeover 시도 기록 + bounded retry guard.
/// 60초 내 3건 초과 시 false 리턴 → takeover 전체 스킵.
fn record_takeover_attempt(path: &Path, now: DateTime<Utc>) -> bool {
    let mut entries = std::fs::read_to_string(path)
        .ok()
        .map(|raw| parse_takeover_history(&raw))
        .unwrap_or_default();

    // 현재 시도 추가
    entries.push(now);

    // 마지막 20개로 truncate (unbounded 방지)
    if entries.len() > 20 {
        let drain_count = entries.len() - 20;
        entries.drain(0..drain_count);
    }

    let serialized = entries
        .iter()
        .map(|ts| ts.to_rfc3339())
        .collect::<Vec<_>>()
        .join("\n");
    write_companion_data_file(path, &format!("{}\n", serialized));

    // 60초 내 시도 횟수 카운트 (현재 시도 포함)
    let recent_count = entries
        .iter()
        .filter(|ts| {
            let age = now.signed_duration_since(**ts);
            age >= ChronoDuration::zero() && age <= ChronoDuration::seconds(60)
        })
        .count();

    if recent_count > 3 {
        eprintln!(
            "[Takeover] 최근 60초 동안 takeover 시도 {}회 감지 — \
             self-kill 루프 방지를 위해 takeover 전체 스킵",
            recent_count
        );
        return false;
    }
    true
}

/// 헬퍼 시작 시 호출 — 랜덤 token 생성/회전 후 디스크에 저장.
/// /quit endpoint는 같은 token을 X-Helper-Token 헤더로 받아야 동작한다.
///
/// Returns: 새로 생성된 token (헬퍼 process가 메모리에 보관)
pub fn ensure_quit_token() -> String {
    let token = generate_random_token();
    let path = quit_token_path();
    write_companion_data_file(&path, &token);
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
fn check_old_helper_signature_on(port: u16) -> Option<HelperInfo> {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let stream = TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().ok()?,
        Duration::from_secs(2),
    ).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;

    let request = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        port
    );
    let mut stream = stream;
    stream.write_all(request.as_bytes()).ok()?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;

    if !response.contains(HELPER_SIGNATURE) {
        return None;
    }
    let version = extract_version_from_health(&response);
    Some(HelperInfo { version })
}

/// 옛 헬퍼에게 /quit 시도 — 새 v1.3.1+ 헬퍼만 응답함.
/// v1.3.0 이하는 endpoint 자체가 없어서 404 또는 connection close.
///
/// X-Helper-Token 헤더에 디스크의 quit-token 파일 값을 실어 보낸다.
/// 같은 머신 사용자만 접근 가능한 파일이므로 악성 웹페이지는 token을 알 수 없다.
fn try_graceful_quit_on(port: u16) -> bool {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let Some(token) = read_quit_token() else {
        println!("[Takeover] quit-token 파일 없음 — graceful quit 스킵 (v1.3.0 이하 옛 헬퍼)");
        return false;
    };

    let Ok(addr) = format!("127.0.0.1:{}", port).parse() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    let request = format!(
        "POST /quit HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-Helper-Token: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        port, token
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.contains("200 OK") && response.contains("shutting_down")
}

/// fallback: OS 명령으로 지정 포트 점유 프로세스 PID 찾아서 강제 종료.
/// 자기 자신 PID는 절대 죽이지 않음.
fn force_kill_port_holder_on(port: u16) -> bool {
    let my_pid = std::process::id();
    let pids = find_pids_on_port(port);

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

/// 단일 포트에 대한 takeover 시도. 버전 검사 + graceful quit + force kill.
/// 반환: true = 포트 비워짐 또는 처음부터 비어있음, false = 점유 유지
fn takeover_single_port(port: u16) -> bool {
    let Some(info) = check_old_helper_signature_on(port) else {
        println!("[Takeover] :{} 비어있거나 무관한 프로세스 — 스킵", port);
        return true;
    };

    // [v2.0.3 hotfix — Windows self-kill loop]
    // 같은 버전 instance면 takeover 금지 → single-instance plugin에 위임
    // (같은 버전 skip은 takeover history에 기록하지 않아서 실제 업그레이드 예산을 소모하지 않음)
    let my_version = env!("CARGO_PKG_VERSION");
    if let Some(other_version) = info.version.as_deref() {
        if other_version == my_version {
            eprintln!(
                "[Takeover] :{} 같은 버전({}) 감지 — self-kill 루프 방지를 위해 스킵",
                port, my_version
            );
            return false;
        }
        println!(
            "[Takeover] :{} 옛 버전({}) → 본 버전({}) — takeover 진행",
            port, other_version, my_version
        );
    } else {
        println!("[Takeover] :{} 옛 헬퍼 (버전 미상 = v1.x 이하) — takeover 진행", port);
    }

    // [Defense B] bounded retry guard — 실제 cross-version takeover만 기록
    // same-version skip은 위에서 이미 return했으므로 여기까지 왔다면 실제 takeover 시도
    if !record_takeover_attempt(&takeover_history_path(), Utc::now()) {
        return false;
    }

    // graceful quit 시도
    if try_graceful_quit_on(port) {
        println!("[Takeover] :{} graceful /quit 성공", port);
    } else {
        println!("[Takeover] :{} graceful /quit 실패 — force kill로 fallback", port);
        if !force_kill_port_holder_on(port) {
            println!("[Takeover] :{} force_kill 실패", port);
        }
    }

    // 최대 5초 대기
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(TAKEOVER_TIMEOUT_SECS) {
        std::thread::sleep(Duration::from_millis(500));
        if check_old_helper_signature_on(port).is_none() {
            println!("[Takeover] :{} 해제 확인", port);
            return true;
        }
    }

    eprintln!("[Takeover] :{} {}초 후에도 점유 중", port, TAKEOVER_TIMEOUT_SECS);
    false
}

/// public — main() 첫 줄에서 호출.
///
/// [Defense A] 9876 + 9877 양쪽 포트에 옛 헬퍼가 있는지 확인하고 takeover.
/// 옛 헬퍼가 Defense A fallback으로 9877에서 실행 중인 경우에도 정상 교체 가능.
///
/// 반환:
///   - true:  양쪽 포트 모두 비어 있음 (takeover 성공 또는 처음부터 비어있었음)
///   - false: 적어도 한 포트가 여전히 점유 중 (사용자 액션 필요)
///
/// false를 반환해도 메인 진행은 막지 않음 (single-instance plugin이 어차피 처리).
pub fn takeover_old_helper_if_present() -> bool {
    println!("[Takeover] 컴패니언 포트 점유 확인 시작 (9876, 9877)");

    let mut all_clear = true;
    for &port in &HELPER_PORT_CANDIDATES {
        if !takeover_single_port(port) {
            all_clear = false;
        }
    }
    all_clear
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

    #[test]
    fn takeover_history_blocks_fourth_attempt_within_60s() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(TAKEOVER_HISTORY_FILENAME);
        let base = Utc::now();

        // 1~3번째 시도는 통과
        assert!(record_takeover_attempt(&path, base - ChronoDuration::seconds(45)));
        assert!(record_takeover_attempt(&path, base - ChronoDuration::seconds(30)));
        assert!(record_takeover_attempt(&path, base - ChronoDuration::seconds(15)));
        // 4번째 시도(60초 내 4건) — 차단
        assert!(!record_takeover_attempt(&path, base));
    }

    #[test]
    fn takeover_history_allows_after_cooldown() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(TAKEOVER_HISTORY_FILENAME);
        let base = Utc::now();

        // 3건은 61초 이전 → 현재 시점에는 만료
        assert!(record_takeover_attempt(&path, base - ChronoDuration::seconds(120)));
        assert!(record_takeover_attempt(&path, base - ChronoDuration::seconds(90)));
        assert!(record_takeover_attempt(&path, base - ChronoDuration::seconds(61)));
        // 현재 시도 → 60초 내 1건만 있으므로 통과
        assert!(record_takeover_attempt(&path, base));
    }
}

// video_tunnel.rs — Companion v2.0.0
//
// 로컬 파일을 cloudflared quick tunnel을 통해 ephemeral 공개 HTTPS URL로 노출.
// 외부 AI API(Evolink/Gemini)가 fileData.fileUri로 직접 fetch 가능하게 함.
//
// 핵심 개념:
//   1. cloudflared 서브프로세스 1개를 앱 시작 시 spawn → 계속 재사용
//   2. 등록된 파일들을 토큰 기반으로 조회 (HashMap)
//   3. TTL 만료 + 동시 100개 한도 + Path traversal 방어
//   4. 분리 포트(9879) 라우터를 통해서만 외부 노출 (메인 9876은 로컬만)
//
// 검증된 사실 (2026-04-07):
//   89MB MP4 / 240초 영상이 cloudflared → Evolink → Gemini 경로로 정상 분석됨.
//   Gemini가 VIDEO 15,360 + AUDIO 6,000 토큰으로 영상 전체 처리.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────

/// 기본 TTL (5분) — Gemini 분석 평균 60~120초 고려한 여유
pub const TUNNEL_DEFAULT_TTL_SECS: u64 = 300;
/// TTL 최대값 (30분) — 매우 긴 영상 분석 케이스
pub const TUNNEL_MAX_TTL_SECS: u64 = 1800;
/// 파일당 최대 크기 (5GB) — DoS 방어
pub const TUNNEL_MAX_FILE_SIZE: u64 = 5 * 1024 * 1024 * 1024;
/// 동시 활성 터널 최대 개수 — 메모리 보호
pub const TUNNEL_MAX_ACTIVE: usize = 100;
/// per-token rate limit (분당 최대 fetch 횟수) — Range request 패턴 고려
pub const TUNNEL_RATE_LIMIT_PER_MIN: u32 = 200;
/// cloudflared 다운로드 시 사용할 고정 버전
pub const CLOUDFLARED_VERSION: &str = "2026.3.0";
/// cloudflared URL 추출 타임아웃
pub const CLOUDFLARED_URL_TIMEOUT_SECS: u64 = 30;
/// cloudflared 재시작 최대 시도 횟수
pub const CLOUDFLARED_MAX_RESTART: u32 = 3;
/// 백그라운드 cleanup 주기 (초)
pub const CLEANUP_INTERVAL_SECS: u64 = 30;
/// 임시 업로드 파일 자동 삭제 시간 (30분)
pub const TEMP_FILE_TTL_SECS: u64 = 1800;

// ──────────────────────────────────────────────
// 에러 정의
// ──────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum TunnelError {
    #[error("cloudflared binary not found at expected location")]
    BinaryNotFound,

    #[error("cloudflared download failed: {0}")]
    DownloadFailed(String),

    #[error("cloudflared checksum mismatch (expected {expected}, got {actual})")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("cloudflared spawn failed: {0}")]
    SpawnFailed(String),

    #[error("cloudflared not ready (no public URL after {0:?})")]
    CloudflaredNotReady(Duration),

    #[error("cloudflared process is dead")]
    CloudflaredDead,

    #[error("file not found: {0}")]
    FileNotFound(PathBuf),

    #[error("file is not a regular file: {0}")]
    NotARegularFile(PathBuf),

    #[error("file size {size} exceeds limit {limit}")]
    FileSizeExceeded { size: u64, limit: u64 },

    #[error("path traversal or blocked path: {0}")]
    PathTraversal(PathBuf),

    #[error("tunnel token not found or expired")]
    NotFound,

    #[error("max fetch count reached for token")]
    MaxFetchReached,

    #[error("rate limit exceeded ({limit} per minute)")]
    RateLimitExceeded { limit: u32 },

    #[error("too many active tunnels (max {0})")]
    TooManyActive(usize),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("internal: {0}")]
    Internal(String),
}

impl TunnelError {
    pub fn http_status(&self) -> u16 {
        use TunnelError::*;
        match self {
            BinaryNotFound | DownloadFailed(_) | ChecksumMismatch { .. } => 503,
            SpawnFailed(_) | CloudflaredNotReady(_) | CloudflaredDead => 503,
            FileNotFound(_) | NotARegularFile(_) => 404,
            PathTraversal(_) => 403,
            FileSizeExceeded { .. } => 413,
            NotFound => 404,
            MaxFetchReached => 410,
            RateLimitExceeded { .. } => 429,
            TooManyActive(_) => 503,
            // (Codex Round-2 Medium) ErrorKind 별 매핑
            Io(e) => match e.kind() {
                std::io::ErrorKind::NotFound => 404,
                std::io::ErrorKind::PermissionDenied => 403,
                std::io::ErrorKind::TimedOut => 504,
                std::io::ErrorKind::WouldBlock => 503,
                _ => 500,
            },
            Http(_) => 502,
            Internal(_) => 500,
        }
    }

    pub fn error_code(&self) -> &'static str {
        use TunnelError::*;
        match self {
            BinaryNotFound => "binary_not_found",
            DownloadFailed(_) => "download_failed",
            ChecksumMismatch { .. } => "checksum_mismatch",
            SpawnFailed(_) => "spawn_failed",
            CloudflaredNotReady(_) => "cloudflared_not_ready",
            CloudflaredDead => "cloudflared_dead",
            FileNotFound(_) => "file_not_found",
            NotARegularFile(_) => "not_a_regular_file",
            FileSizeExceeded { .. } => "file_size_exceeded",
            PathTraversal(_) => "path_traversal",
            NotFound => "not_found",
            MaxFetchReached => "max_fetch_reached",
            RateLimitExceeded { .. } => "rate_limit_exceeded",
            TooManyActive(_) => "too_many_active",
            Io(_) => "io_error",
            Http(_) => "http_error",
            Internal(_) => "internal_error",
        }
    }
}

// ──────────────────────────────────────────────
// 데이터 구조
// ──────────────────────────────────────────────

/// 하나의 파일 등록 항목
#[derive(Debug, Clone)]
pub struct TunnelEntry {
    pub token: String,
    pub file_path: PathBuf,
    pub mime_type: String,
    pub created_at: Instant,
    pub expires_at: Instant,
    pub max_fetches: Option<u32>,
    pub fetch_count: u32,
    pub size_bytes: u64,
    pub fetch_history: VecDeque<Instant>,
    /// (Codex High 2) symlink/파일 교체 공격 방지용 inode + dev fingerprint (Unix).
    #[cfg(unix)]
    pub file_ino: u64,
    #[cfg(unix)]
    pub file_dev: u64,
    /// (Codex Round-5 Medium) Windows file_id (volume serial + nFileIndex)
    /// MetadataExt::file_index() 사용. NTFS는 unique ID 보장.
    #[cfg(windows)]
    pub file_index: Option<u64>,
    #[cfg(windows)]
    pub volume_serial: Option<u32>,
}

impl TunnelEntry {
    /// (Codex Round-2 Medium) TTL 만료만 — fetch budget 소진은 별도 분류
    fn is_expired(&self, now: Instant) -> bool {
        self.expires_at <= now
    }

    /// fetch budget 소진 여부 (record_fetch에서 410 분류용)
    fn is_fetch_exhausted(&self) -> bool {
        self.max_fetches
            .map(|m| self.fetch_count >= m)
            .unwrap_or(false)
    }

    /// Rate limit 검사 (1분 윈도우 슬라이딩)
    fn check_rate_limit(&mut self, now: Instant, limit: u32) -> Result<(), TunnelError> {
        let one_min_ago = now.checked_sub(Duration::from_secs(60)).unwrap_or(now);
        while let Some(&front) = self.fetch_history.front() {
            if front <= one_min_ago {
                self.fetch_history.pop_front();
            } else {
                break;
            }
        }
        if self.fetch_history.len() as u32 >= limit {
            return Err(TunnelError::RateLimitExceeded { limit });
        }
        self.fetch_history.push_back(now);
        Ok(())
    }
}

/// open() 응답 (프론트로 전달되는 핸들)
#[derive(Debug, Clone, Serialize)]
pub struct TunnelHandle {
    pub token: String,
    pub url: String,
    pub expires_at: i64,
    pub size_bytes: u64,
}

/// open() 요청 페이로드
#[derive(Debug, Clone, Deserialize)]
pub struct OpenRequest {
    pub file_path: String,
    pub mime_type: String,
    #[serde(default)]
    pub ttl_secs: Option<u64>,
    #[serde(default)]
    pub max_fetches: Option<u32>,
}

/// status 엔드포인트 응답
#[derive(Debug, Clone, Serialize)]
pub struct TunnelStatus {
    pub ok: bool,
    pub cloudflared_running: bool,
    pub public_host: Option<String>,
    pub uptime_secs: u64,
    pub active_tunnels: usize,
    pub total_opened: u64,
    pub total_fetches: u64,
    pub cloudflared_version: String,
}

// ──────────────────────────────────────────────
// cloudflared 프로세스 관리
// ──────────────────────────────────────────────

struct CloudflaredProcess {
    child: Child,
    public_host: String,
    started_at: Instant,
}

impl Drop for CloudflaredProcess {
    fn drop(&mut self) {
        // (Codex High 1) 비정상 종료 시에도 cloudflared가 orphan으로 남지 않도록
        // 동기 fallback. tokio Child::start_kill()은 동기 (즉시 SIGKILL).
        let _ = self.child.start_kill();
    }
}

// ──────────────────────────────────────────────
// TunnelManager — 메인 진입점
// ──────────────────────────────────────────────

pub struct TunnelManager {
    inner: Arc<TunnelManagerInner>,
}

struct TunnelManagerInner {
    cloudflared: Mutex<Option<CloudflaredProcess>>,
    public_host: RwLock<Option<String>>,
    entries: RwLock<HashMap<String, TunnelEntry>>,
    serve_port: u16,
    binary_path: PathBuf,
    started_at: Instant,
    total_opened: Mutex<u64>,
    total_fetches: Mutex<u64>,
    /// (Codex Round-3 Low) shutdown 진행 중 플래그 — health loop가 재시작 시도하지 않게
    /// (Codex Round-5 High) restart_cloudflared가 select!로 이 플래그를 watch하여
    /// wait_for_public_url 도중 shutdown이 와도 child를 즉시 정리.
    is_shutting_down: std::sync::atomic::AtomicBool,
}

impl TunnelManager {
    /// 앱 시작 시 1회 호출. cloudflared 다운로드(필요 시) + spawn + cleanup 태스크 기동.
    pub async fn new(serve_port: u16) -> Result<Self, TunnelError> {
        let binary_path = ensure_cloudflared().await?;

        let inner = Arc::new(TunnelManagerInner {
            cloudflared: Mutex::new(None),
            public_host: RwLock::new(None),
            entries: RwLock::new(HashMap::new()),
            serve_port,
            binary_path,
            started_at: Instant::now(),
            total_opened: Mutex::new(0),
            total_fetches: Mutex::new(0),
            is_shutting_down: std::sync::atomic::AtomicBool::new(false),
        });

        // cloudflared 첫 spawn
        // (Codex Round-7 High) URL 추출 실패 시 child를 즉시 kill — PID slot stale 방지
        let mut handle = spawn_cloudflared(&inner.binary_path, serve_port).await?;
        let public_host = {
            let mut logs = handle.child_logs();
            match wait_for_public_url(&mut logs, Duration::from_secs(CLOUDFLARED_URL_TIMEOUT_SECS)).await {
                Ok(h) => h,
                Err(e) => {
                    eprintln!("[Tunnel] cloudflared URL 추출 실패: {}", e);
                    // child를 즉시 kill하고 PID slot도 정리
                    let mut process = handle.into_inner();
                    let _ = process.child.start_kill();
                    crate::server::clear_init_phase_child();
                    return Err(e);
                }
            }
        };

        let host_clone = public_host.clone();
        let mut process_for_storage = handle.into_inner();
        process_for_storage.public_host = host_clone.clone();

        // child를 inner.cloudflared로 옮기되, PID slot은 아직 clear하지 않음.
        // (Codex Round-8 Medium) PID slot은 init_tunnel_manager가 TUNNEL_MANAGER.set() 후
        // publish가 끝난 다음에 clear한다.
        *inner.cloudflared.lock().await = Some(process_for_storage);
        *inner.public_host.write().await = Some(host_clone.clone());

        println!("[Tunnel] cloudflared 시작 완료: https://{}", host_clone);

        // 백그라운드 cleanup 태스크
        let cleanup_inner = inner.clone();
        tokio::spawn(async move {
            cleanup_loop(cleanup_inner).await;
        });

        // 백그라운드 health check + 자동 재시작
        let health_inner = inner.clone();
        tokio::spawn(async move {
            health_check_loop(health_inner).await;
        });

        // 임시 업로드 파일 정리 태스크
        let temp_cleanup_inner = inner.clone();
        tokio::spawn(async move {
            temp_file_cleanup_loop(temp_cleanup_inner).await;
        });

        Ok(Self { inner })
    }

    /// 파일을 등록하고 공개 URL 반환
    pub async fn open(&self, req: OpenRequest) -> Result<TunnelHandle, TunnelError> {
        // (Codex Medium 2) cloudflared 살아있는지 사전 검증 — 죽었으면 즉시 에러
        {
            let mut guard = self.inner.cloudflared.lock().await;
            match guard.as_mut() {
                Some(process) => {
                    if let Ok(Some(_status)) = process.child.try_wait() {
                        // 죽어 있음 — 즉시 None 처리하고 에러
                        *guard = None;
                        drop(guard);
                        *self.inner.public_host.write().await = None;
                        return Err(TunnelError::CloudflaredDead);
                    }
                }
                None => return Err(TunnelError::CloudflaredDead),
            }
        }

        let canonical = validate_file_path(Path::new(&req.file_path))?;
        // (Codex High 2) symlink_metadata로 확인 — symlink 자체는 거부.
        // canonicalize는 이미 호출됐으므로 결과는 실파일이어야 함.
        let metadata = tokio::fs::symlink_metadata(&canonical).await?;
        if !metadata.is_file() {
            return Err(TunnelError::NotARegularFile(canonical));
        }
        if metadata.len() > TUNNEL_MAX_FILE_SIZE {
            return Err(TunnelError::FileSizeExceeded {
                size: metadata.len(),
                limit: TUNNEL_MAX_FILE_SIZE,
            });
        }

        // (Codex High 2) inode + dev 추출 — serve() 시점에 비교용
        #[cfg(unix)]
        let (file_ino, file_dev) = {
            use std::os::unix::fs::MetadataExt;
            (metadata.ino(), metadata.dev())
        };
        // (Codex Round-5 + Round-6 Medium) Windows file identifier
        // exFAT/네트워크 드라이브 등에서 None이면 검증이 비활성화되므로 거부
        #[cfg(windows)]
        let (file_index, volume_serial) = {
            use std::os::windows::fs::MetadataExt;
            let idx = metadata.file_index();
            let vol = metadata.volume_serial_number();
            if idx.is_none() || vol.is_none() {
                return Err(TunnelError::PathTraversal(canonical));
            }
            (idx, vol)
        };

        // (Codex Round-3 Low) ttl_secs=0은 기본값으로 정규화 (즉시 만료 방지)
        let raw_ttl = req.ttl_secs.unwrap_or(TUNNEL_DEFAULT_TTL_SECS);
        let ttl = if raw_ttl == 0 {
            TUNNEL_DEFAULT_TTL_SECS
        } else {
            raw_ttl.min(TUNNEL_MAX_TTL_SECS)
        };
        // max_fetches=0은 None으로 정규화 (즉시 소진 방지)
        let normalized_max_fetches = req.max_fetches.and_then(|m| if m == 0 { None } else { Some(m) });
        let token = generate_token();
        let now = Instant::now();
        let expires_at = now + Duration::from_secs(ttl);

        let entry = TunnelEntry {
            token: token.clone(),
            file_path: canonical,
            mime_type: req.mime_type.clone(),
            created_at: now,
            expires_at,
            max_fetches: normalized_max_fetches,
            fetch_count: 0,
            size_bytes: metadata.len(),
            fetch_history: VecDeque::new(),
            #[cfg(unix)]
            file_ino,
            #[cfg(unix)]
            file_dev,
            #[cfg(windows)]
            file_index,
            #[cfg(windows)]
            volume_serial,
        };

        // (Codex Round-9 Medium) entries write-lock과 public_host read-lock을
        // 동시에 잡고, 락 안에서 host를 최종 결정. 그 사이 health restart가 일어나도
        // 우리는 lock을 들고 있으므로 host 변경 X (또는 None이면 거부).
        let host = {
            let mut entries = self.inner.entries.write().await;
            entries.retain(|_, e| !e.is_expired(now) && !e.is_fetch_exhausted());
            if entries.len() >= TUNNEL_MAX_ACTIVE {
                return Err(TunnelError::TooManyActive(TUNNEL_MAX_ACTIVE));
            }

            // host를 락 안에서 최종 결정 — 이 시점부터 token에 매핑
            let host = self
                .inner
                .public_host
                .read()
                .await
                .clone()
                .ok_or_else(|| TunnelError::CloudflaredNotReady(Duration::from_secs(0)))?;

            entries.insert(token.clone(), entry);
            host
        };

        let url = format!("https://{}/api/tunnel/serve/{}", host, token);

        // 통계 업데이트
        {
            let mut total = self.inner.total_opened.lock().await;
            *total += 1;
        }

        let unix_expiry = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64 + ttl as i64)
            .unwrap_or(0);

        Ok(TunnelHandle {
            token,
            url,
            expires_at: unix_expiry,
            size_bytes: metadata.len(),
        })
    }

    /// 토큰으로 엔트리 조회 (만료/소진된 경우 None)
    pub async fn lookup(&self, token: &str) -> Option<TunnelEntry> {
        let now = Instant::now();
        let entries = self.inner.entries.read().await;
        let entry = entries.get(token)?.clone();
        if entry.is_expired(now) || entry.is_fetch_exhausted() {
            None
        } else {
            Some(entry)
        }
    }

    /// fetch 사전 검증 (read-only) — 파일 존재/Range 검증 후 commit_fetch 호출
    /// (Codex Round-3 Medium) check + commit 분리로 실패 시 quota 누수 방지
    pub async fn check_fetch_allowed(&self, token: &str) -> Result<TunnelEntry, TunnelError> {
        let now = Instant::now();
        let entries = self.inner.entries.read().await;
        let entry = entries.get(token).ok_or(TunnelError::NotFound)?;

        if entry.is_expired(now) {
            return Err(TunnelError::NotFound);
        }
        if entry.is_fetch_exhausted() {
            return Err(TunnelError::MaxFetchReached);
        }
        // rate limit은 commit 시점에 정확히 검사 (read만 하면 race)
        Ok(entry.clone())
    }

    /// fetch 실제 commit — 파일 open + Range 검증 통과 후에만 호출
    /// rate_limit 검사 + 카운트 증가가 atomic하게 일어남.
    pub async fn commit_fetch(&self, token: &str) -> Result<(), TunnelError> {
        let now = Instant::now();
        let mut entries = self.inner.entries.write().await;
        let entry = entries.get_mut(token).ok_or(TunnelError::NotFound)?;

        // 다시 한 번 검증 (락 사이에 만료/소진 가능)
        if entry.is_expired(now) {
            return Err(TunnelError::NotFound);
        }
        if entry.is_fetch_exhausted() {
            return Err(TunnelError::MaxFetchReached);
        }
        entry.check_rate_limit(now, TUNNEL_RATE_LIMIT_PER_MIN)?;
        entry.fetch_count += 1;

        drop(entries);
        let mut total = self.inner.total_fetches.lock().await;
        *total += 1;

        Ok(())
    }

    /// 명시적 종료
    pub async fn close(&self, token: &str) -> Result<(), TunnelError> {
        let mut entries = self.inner.entries.write().await;
        entries.remove(token);
        Ok(())
    }

    /// 활성 터널 수
    pub async fn active_count(&self) -> usize {
        let now = Instant::now();
        let entries = self.inner.entries.read().await;
        entries
            .values()
            .filter(|e| !e.is_expired(now) && !e.is_fetch_exhausted())
            .count()
    }

    /// 상태 조회 — try_wait()으로 실시간 검증
    /// (Codex Medium 2) is_some()만으로는 stale 상태 감지 불가
    pub async fn status(&self) -> TunnelStatus {
        let cloudflared_running = {
            let mut guard = self.inner.cloudflared.lock().await;
            match guard.as_mut() {
                Some(process) => {
                    if let Ok(Some(_)) = process.child.try_wait() {
                        // 죽어있음 — 즉시 정리
                        *guard = None;
                        false
                    } else {
                        true
                    }
                }
                None => false,
            }
        };

        // 죽어있으면 public_host도 비움
        if !cloudflared_running {
            *self.inner.public_host.write().await = None;
        }

        let public_host = self.inner.public_host.read().await.clone();
        let active = self.active_count().await;
        let total_opened = *self.inner.total_opened.lock().await;
        let total_fetches = *self.inner.total_fetches.lock().await;

        TunnelStatus {
            ok: cloudflared_running && public_host.is_some(),
            cloudflared_running,
            public_host,
            uptime_secs: self.inner.started_at.elapsed().as_secs(),
            active_tunnels: active,
            total_opened,
            total_fetches,
            cloudflared_version: CLOUDFLARED_VERSION.to_string(),
        }
    }

    /// 컴패니언 종료 시 cloudflared 정리 + 마지막 temp sweep
    /// (Codex Round-3 Low) is_shutting_down 플래그 먼저 세팅 → health loop가 재시작 안 함
    /// (Codex Round-4 Low) shutdown 시 마지막 temp file sweep
    pub async fn shutdown(&self) {
        self.inner
            .is_shutting_down
            .store(true, std::sync::atomic::Ordering::SeqCst);

        // cloudflared kill
        {
            let mut guard = self.inner.cloudflared.lock().await;
            if let Some(mut process) = guard.take() {
                let _ = process.child.kill().await;
            }
        }
        *self.inner.public_host.write().await = None;

        // 마지막 temp sweep — 활성 토큰만 보존, TTL 지난 것 즉시 정리
        if let Some(temp_dir) = temp_upload_dir() {
            let active_paths: std::collections::HashSet<PathBuf> = {
                let now = Instant::now();
                let entries = self.inner.entries.read().await;
                entries
                    .values()
                    .filter(|e| !e.is_expired(now) && !e.is_fetch_exhausted())
                    .map(|e| e.file_path.clone())
                    .collect()
            };
            cleanup_old_temp_files(&temp_dir, &active_paths).await;
        }
    }
}

// ──────────────────────────────────────────────
// CloudflaredProcess 도우미
// ──────────────────────────────────────────────

struct CloudflaredHandle {
    process: CloudflaredProcess,
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
}

impl CloudflaredHandle {
    fn child_logs(&mut self) -> CloudflaredLogStream {
        CloudflaredLogStream {
            stdout: self.stdout.take(),
            stderr: self.stderr.take(),
        }
    }

    fn into_inner(self) -> CloudflaredProcess {
        self.process
    }
}

struct CloudflaredLogStream {
    stdout: Option<tokio::process::ChildStdout>,
    stderr: Option<tokio::process::ChildStderr>,
}

// ──────────────────────────────────────────────
// cloudflared 다운로드 + spawn
// ──────────────────────────────────────────────

/// cloudflared 바이너리가 없으면 다운로드, 있으면 경로 반환
async fn ensure_cloudflared() -> Result<PathBuf, TunnelError> {
    // 0순위: 시스템 PATH에 있는 cloudflared (사용자가 brew/scoop으로 설치한 경우)
    // 시스템 cloudflared는 사용자가 직접 설치한 신뢰 가능 바이너리이므로 SHA 검증 스킵.
    // (Codex Round-10 Medium) Unix는 `which`, Windows는 `where`
    let detect_cmd = if cfg!(windows) { "where" } else { "which" };
    if let Ok(output) = Command::new(detect_cmd).arg("cloudflared").output().await {
        if output.status.success() {
            // Windows `where`는 여러 경로를 줄바꿈 구분으로 출력 → 첫 줄만
            let stdout = String::from_utf8_lossy(&output.stdout);
            let path_str = stdout.lines().next().unwrap_or("").trim().to_string();
            if !path_str.is_empty() {
                let path = PathBuf::from(path_str);
                if path.exists() {
                    // (Codex Round-2 Low) 절대 경로 대신 basename만
                    println!(
                        "[Tunnel] 시스템 cloudflared 사용 ({})",
                        path.file_name().and_then(|n| n.to_str()).unwrap_or("?")
                    );
                    return Ok(path);
                }
            }
        }
    }

    let target = cloudflared_bin_path()?;
    if target.exists() {
        // (Codex Medium 4 + Round-5 Medium) 캐시 바이너리도 동일 정책 — fail-closed
        let expected = expected_cloudflared_sha256();
        if let Some(expected_hash) = expected {
            match sha256_file(&target).await {
                Ok(actual) if actual == expected_hash => {
                    println!("[Tunnel] cached cloudflared 검증 성공");
                    return Ok(target);
                }
                Ok(_actual) => {
                    eprintln!("[Tunnel] 캐시된 cloudflared SHA mismatch — 재다운로드");
                    let _ = tokio::fs::remove_file(&target).await;
                }
                Err(_) => {
                    eprintln!("[Tunnel] SHA 검증 실패 — 재다운로드");
                    let _ = tokio::fs::remove_file(&target).await;
                }
            }
        } else if std::env::var("ALLOW_UNVERIFIED_CLOUDFLARED").ok().as_deref() == Some("1") {
            // (Codex Round-5 Medium) 해시 미정 + 환경변수 명시적 허용 → 사용
            eprintln!("[Tunnel] ⚠️ cached cloudflared 검증 스킵 (ALLOW_UNVERIFIED_CLOUDFLARED=1)");
            return Ok(target);
        } else {
            // (Codex Round-5 Medium) 해시 미정 + 환경변수 미설정 → 캐시도 fail-closed, 재다운로드 시도
            eprintln!(
                "[Tunnel] cached cloudflared 신뢰 불가 (해시 미등록 + ALLOW_UNVERIFIED_CLOUDFLARED 미설정) — 삭제 후 재다운로드 시도"
            );
            let _ = tokio::fs::remove_file(&target).await;
        }
    }

    println!("[Tunnel] cloudflared 바이너리가 없습니다. 다운로드 시작 ...");
    println!("[Tunnel] 출처: github.com/cloudflare/cloudflared (공식)");
    // 절대 경로 대신 디렉터리 종류만 노출
    println!("[Tunnel] 대상: ~/Library/Application Support/.../cloudflared");

    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let url = pick_download_url()?;
    println!("[Tunnel] 다운로드 URL: {}", url);

    // (Codex Round-2 Critical) redirect를 따라가더라도 최종 host가 GitHub allowlist에 있어야만 허용.
    // 중간자/오염된 redirect로 임의 호스트의 바이너리를 받는 것 방지.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 {
                return attempt.error("too many redirects");
            }
            // (Codex Round-3 Medium) HTTPS 강제 — http:// downgrade 차단
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
        .map_err(|e| TunnelError::DownloadFailed(e.to_string()))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| TunnelError::DownloadFailed(e.to_string()))?;

    if !response.status().is_success() {
        return Err(TunnelError::DownloadFailed(format!(
            "HTTP {}: {}",
            response.status(),
            url
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| TunnelError::DownloadFailed(e.to_string()))?;

    println!("[Tunnel] 다운로드 완료: {:.1}MB", bytes.len() as f64 / 1_000_000.0);

    // (Codex Round-2 Critical) SHA-256 fail-closed 처리
    // - hash가 등록된 플랫폼: 검증 통과 시에만 진행
    // - hash 미등록 플랫폼: 환경변수 ALLOW_UNVERIFIED_CLOUDFLARED=1 설정 시에만 허용
    //   (그 외엔 fail-closed). 시스템 PATH cloudflared가 우선이라 일반 사용자에게 영향 적음.
    let actual = compute_sha256(&bytes);
    if let Some(expected) = expected_cloudflared_sha256() {
        if actual != expected {
            return Err(TunnelError::ChecksumMismatch {
                expected,
                actual,
            });
        }
        println!("[Tunnel] SHA-256 검증 통과");
    } else {
        if std::env::var("ALLOW_UNVERIFIED_CLOUDFLARED").ok().as_deref() != Some("1") {
            return Err(TunnelError::DownloadFailed(format!(
                "이 플랫폼({} {})의 SHA-256 해시가 미등록 — fail-closed. \
                해결: brew install cloudflared 등으로 시스템 cloudflared 설치, \
                또는 ALLOW_UNVERIFIED_CLOUDFLARED=1 환경변수 설정 (위험)",
                std::env::consts::OS,
                std::env::consts::ARCH
            )));
        }
        eprintln!(
            "[Tunnel] ⚠️ 검증 건너뜀 (ALLOW_UNVERIFIED_CLOUDFLARED=1) — actual hash: {}",
            actual
        );
    }

    // 압축 해제 (tgz: macOS) 또는 직접 저장
    if url.ends_with(".tgz") {
        extract_tgz(&bytes, &target).await?;
    } else {
        tokio::fs::write(&target, &bytes).await?;
    }

    // 실행 권한 부여 (Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&target).await?.permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&target, perms).await?;
    }

    println!("[Tunnel] cloudflared 설치 완료");
    Ok(target)
}

/// 플랫폼별 cloudflared 다운로드 아카이브의 expected SHA-256 (CLOUDFLARED_VERSION 기준)
/// 등록 안 된 플랫폼은 None — 향후 릴리즈 때마다 갱신 필요.
///
/// **🚨 RELEASE BLOCKER**: v2.0.0 정식 릴리즈 전에 아래 6개 플랫폼 hash를 모두 채워야 함.
/// 출처:
///   - https://github.com/cloudflare/cloudflared/releases/download/2026.3.0/sha256.txt
///   - 또는 GitHub Release 페이지의 각 asset checksums
///
/// 현재는 None만 반환 → ALLOW_UNVERIFIED_CLOUDFLARED=1 없이는 다운로드 fail-closed.
/// 사용자는 brew/scoop으로 시스템 cloudflared를 미리 설치하면 이 경로를 안 탄다.
fn expected_cloudflared_sha256() -> Option<String> {
    // RELEASE BLOCKER: 실제 v2.0.0 릴리즈 전 아래 매핑 채울 것
    // 예시 형식 (실제 hash로 교체 필요):
    // match (std::env::consts::OS, std::env::consts::ARCH) {
    //     ("macos", "aarch64") => Some("0123456789abcdef...".to_string()),
    //     ("macos", "x86_64")  => Some("0123456789abcdef...".to_string()),
    //     ("linux", "x86_64")  => Some("0123456789abcdef...".to_string()),
    //     ("linux", "aarch64") => Some("0123456789abcdef...".to_string()),
    //     ("windows", "x86_64")  => Some("0123456789abcdef...".to_string()),
    //     ("windows", "aarch64") => Some("0123456789abcdef...".to_string()),
    //     _ => None,
    // }
    None
}

/// 바이트 배열의 SHA-256 hex
fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// 플랫폼별 cloudflared 다운로드 URL 선택
fn pick_download_url() -> Result<String, TunnelError> {
    let base = format!(
        "https://github.com/cloudflare/cloudflared/releases/download/{}",
        CLOUDFLARED_VERSION
    );

    // 버전 prefix가 'v'일 수도 있고 아닐 수도 있음 — Cloudflare는 prefix 없이 사용
    let asset = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "cloudflared-darwin-arm64.tgz",
        ("macos", "x86_64") => "cloudflared-darwin-amd64.tgz",
        ("linux", "x86_64") => "cloudflared-linux-amd64",
        ("linux", "aarch64") => "cloudflared-linux-arm64",
        ("windows", "x86_64") => "cloudflared-windows-amd64.exe",
        ("windows", "aarch64") => "cloudflared-windows-arm64.exe",
        (os, arch) => {
            return Err(TunnelError::DownloadFailed(format!(
                "지원하지 않는 플랫폼: {} {}",
                os, arch
            )))
        }
    };

    Ok(format!("{}/{}", base, asset))
}

/// cloudflared 바이너리 저장 경로 (OS별)
fn cloudflared_bin_path() -> Result<PathBuf, TunnelError> {
    let data_dir = dirs::data_dir().ok_or_else(|| {
        TunnelError::Internal("dirs::data_dir() 실패".to_string())
    })?;
    let mut path = data_dir;
    path.push("ytdlp-companion");
    path.push("bin");
    let bin_name = if cfg!(target_os = "windows") {
        "cloudflared.exe"
    } else {
        "cloudflared"
    };
    path.push(bin_name);
    Ok(path)
}

/// tgz 압축 해제 (macOS용)
async fn extract_tgz(bytes: &[u8], target: &Path) -> Result<(), TunnelError> {
    let bytes_owned = bytes.to_vec();
    let target_owned = target.to_path_buf();

    tokio::task::spawn_blocking(move || -> Result<(), TunnelError> {
        let gz = flate2::read::GzDecoder::new(&bytes_owned[..]);
        let mut archive = tar::Archive::new(gz);

        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?;
            // tgz 안에 cloudflared 단일 바이너리만 있음 → 그것만 추출
            if path.file_name().map(|n| n == "cloudflared").unwrap_or(false) {
                let mut buf = Vec::new();
                std::io::copy(&mut entry, &mut buf)?;
                std::fs::write(&target_owned, buf)?;
                return Ok(());
            }
        }
        Err(TunnelError::Internal(
            "tgz 안에 cloudflared 바이너리를 찾지 못함".to_string(),
        ))
    })
    .await
    .map_err(|e| TunnelError::Internal(format!("spawn_blocking 실패: {}", e)))?
}

/// cloudflared 서브프로세스 spawn
async fn spawn_cloudflared(
    binary: &Path,
    serve_port: u16,
) -> Result<CloudflaredHandle, TunnelError> {
    use std::process::Stdio;

    let url_arg = format!("http://127.0.0.1:{}", serve_port);
    println!("[Tunnel] cloudflared spawn: tunnel --url {}", url_arg);

    let mut cmd = Command::new(binary);
    cmd.arg("tunnel")
        .arg("--url")
        .arg(&url_arg)
        .arg("--no-autoupdate")
        .arg("--metrics")
        .arg("127.0.0.1:0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| TunnelError::SpawnFailed(e.to_string()))?;

    // (Codex Round-6 High) PID를 전역 init-phase child registry에 등록
    // init 단계에서 shutdown 오면 server::kill_init_phase_child_if_any()가 잡음
    if let Some(pid) = child.id() {
        crate::server::record_init_phase_child(pid);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let process = CloudflaredProcess {
        child,
        public_host: String::new(),
        started_at: Instant::now(),
    };

    Ok(CloudflaredHandle {
        process,
        stdout,
        stderr,
    })
}

/// cloudflared stdout/stderr에서 *.trycloudflare.com URL 추출
///
/// 핵심: URL을 찾은 후에도 stdout/stderr를 백그라운드로 계속 drain해야 함.
///       그렇지 않으면 cloudflared가 stderr 버퍼 가득 → SIGPIPE → 죽음.
async fn wait_for_public_url(
    logs: &mut CloudflaredLogStream,
    timeout: Duration,
) -> Result<String, TunnelError> {
    use tokio::sync::mpsc;

    let stderr = logs.stderr.take();
    let stdout = logs.stdout.take();

    // URL 발견 채널
    let (tx, mut rx) = mpsc::channel::<String>(2);

    // stderr drain 태스크 (cloudflared는 INFO 로그를 stderr로 출력)
    if let Some(stream) = stderr {
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stream).lines();
            let mut url_sent = false;
            while let Ok(Some(line)) = reader.next_line().await {
                eprintln!("[cloudflared] {}", line);
                if !url_sent {
                    if let Some(host) = extract_trycloudflare_host(&line) {
                        let _ = tx_clone.send(host).await;
                        url_sent = true;
                    }
                }
                // URL 발견 후에도 계속 drain — 이게 핵심!
            }
        });
    }

    // stdout drain 태스크 (cloudflared 자체는 거의 stdout에 안 쓰지만 안전 마진)
    if let Some(stream) = stdout {
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stream).lines();
            let mut url_sent = false;
            while let Ok(Some(line)) = reader.next_line().await {
                println!("[cloudflared] {}", line);
                if !url_sent {
                    if let Some(host) = extract_trycloudflare_host(&line) {
                        let _ = tx_clone.send(host).await;
                        url_sent = true;
                    }
                }
            }
        });
    }

    drop(tx); // 모든 sender drop → recv 끝나면 None

    // URL 도착 대기 (timeout)
    match tokio::time::timeout(timeout, rx.recv()).await {
        Ok(Some(host)) => Ok(host),
        Ok(None) => Err(TunnelError::CloudflaredNotReady(timeout)),
        Err(_) => Err(TunnelError::CloudflaredNotReady(timeout)),
    }
}

/// 한 줄에서 *.trycloudflare.com 호스트만 추출 (https:// 제거)
fn extract_trycloudflare_host(line: &str) -> Option<String> {
    // 패턴: https://[a-z0-9-]+\.trycloudflare\.com
    // regex-lite는 이미 deps에 있음
    let re = regex_lite::Regex::new(r"https://([a-z0-9-]+\.trycloudflare\.com)").ok()?;
    re.captures(line)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

// ──────────────────────────────────────────────
// 백그라운드 태스크
// ──────────────────────────────────────────────

/// 만료된 엔트리 정리 (30초 주기)
async fn cleanup_loop(inner: Arc<TunnelManagerInner>) {
    let interval = Duration::from_secs(CLEANUP_INTERVAL_SECS);
    loop {
        tokio::time::sleep(interval).await;
        if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        let now = Instant::now();
        let mut entries = inner.entries.write().await;
        let before = entries.len();
        entries.retain(|_, e| !e.is_expired(now) && !e.is_fetch_exhausted());
        let removed = before - entries.len();
        if removed > 0 {
            println!("[Tunnel] cleanup: {}개 만료 엔트리 정리", removed);
        }
    }
}

/// cloudflared health check + 자동 재시작 (10초 주기)
/// (Codex Medium 2) cloudflared 사망 감지 즉시 cloudflared/public_host를 None으로 비워서
/// status()/open()이 stale 상태로 응답하는 것을 막는다.
/// (Codex Round-3 Low) is_shutting_down이 켜지면 재시작 안 하고 루프 종료.
async fn health_check_loop(inner: Arc<TunnelManagerInner>) {
    let interval = Duration::from_secs(10);
    loop {
        tokio::time::sleep(interval).await;

        if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
            println!("[Tunnel] health_check_loop 종료 (shutdown 진행 중)");
            return;
        }

        // 사망 감지 + 즉시 None 처리
        let needs_restart = {
            let mut guard = inner.cloudflared.lock().await;
            match guard.as_mut() {
                Some(process) => {
                    if let Ok(Some(status)) = process.child.try_wait() {
                        eprintln!(
                            "[Tunnel] cloudflared 프로세스 사망 감지 (exit status: {:?})",
                            status
                        );
                        // 즉시 None으로 비우기
                        *guard = None;
                        // public_host도 비우기 (다른 락이라 별도 처리)
                        true
                    } else {
                        false
                    }
                }
                None => true,
            }
        };

        if needs_restart {
            // public_host 즉시 None
            *inner.public_host.write().await = None;
        } else {
            continue;
        }

        // 백오프 재시작
        // (Codex Round-4 Medium) backoff 매 iteration마다 shutdown 체크
        for attempt in 1..=CLOUDFLARED_MAX_RESTART {
            let backoff_secs = match attempt {
                1 => 1,
                2 => 5,
                _ => 30,
            };
            tokio::time::sleep(Duration::from_secs(backoff_secs)).await;

            if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
                println!("[Tunnel] backoff 중 shutdown 감지 — 재시작 중단");
                return;
            }

            match restart_cloudflared(&inner).await {
                Ok(host) => {
                    println!("[Tunnel] cloudflared 재시작 성공: {}", host);
                    break;
                }
                Err(e) => {
                    eprintln!(
                        "[Tunnel] 재시작 시도 {}/{} 실패: {}",
                        attempt, CLOUDFLARED_MAX_RESTART, e
                    );
                    if attempt == CLOUDFLARED_MAX_RESTART {
                        eprintln!("[Tunnel] 최대 재시도 횟수 도달 — 다음 health check까지 대기");
                    }
                }
            }
        }
    }
}

async fn restart_cloudflared(inner: &Arc<TunnelManagerInner>) -> Result<String, TunnelError> {
    // (Codex Round-4 Medium) restart 진입 시 shutdown 재확인
    if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
        return Err(TunnelError::CloudflaredDead);
    }

    let mut handle = spawn_cloudflared(&inner.binary_path, inner.serve_port).await?;

    // (Codex Round-5 High) spawn 직후에도 shutdown 체크 → 즉시 kill
    if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
        let mut process = handle.into_inner();
        let _ = process.child.start_kill();
        crate::server::clear_init_phase_child();
        return Err(TunnelError::CloudflaredDead);
    }

    // (Codex Round-5 High) wait_for_public_url을 shutdown 신호와 race
    // shutdown signal: is_shutting_down 폴링 (1초 간격)
    let mut logs = handle.child_logs();
    let inner_for_check = inner.clone();
    let url_result = tokio::select! {
        url = wait_for_public_url(&mut logs, Duration::from_secs(CLOUDFLARED_URL_TIMEOUT_SECS)) => url,
        _ = async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                if inner_for_check.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
            }
        } => Err(TunnelError::CloudflaredDead),
    };

    let host = match url_result {
        Ok(h) => h,
        Err(e) => {
            // URL 받기 실패 또는 shutdown — child kill 후 에러
            let mut process = handle.into_inner();
            let _ = process.child.start_kill();
            crate::server::clear_init_phase_child();
            return Err(e);
        }
    };

    // URL 받은 후에도 shutdown 체크
    if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
        let mut process = handle.into_inner();
        let _ = process.child.start_kill();
        crate::server::clear_init_phase_child();
        return Err(TunnelError::CloudflaredDead);
    }

    let mut process = handle.into_inner();
    process.public_host = host.clone();

    // (Codex Round-5 High) 등록 직전에 shutdown이 와도 안전하도록 락 + 재확인
    {
        let mut guard = inner.cloudflared.lock().await;
        if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
            // shutdown이 우리보다 먼저 도착 — child kill하고 등록 안 함
            let _ = process.child.start_kill();
            crate::server::clear_init_phase_child();
            return Err(TunnelError::CloudflaredDead);
        }
        *guard = Some(process);
        // child가 manager로 안전히 옮겨졌으니 PID slot clear
        crate::server::clear_init_phase_child();
    }
    *inner.public_host.write().await = Some(host.clone());

    Ok(host)
}

/// 임시 업로드 파일 정리 (10분 주기)
/// (Codex Medium 1) active token이 참조 중인 파일은 mtime이 오래됐어도 절대 삭제 X.
/// active path set을 entries에서 추출하여 제외 목록으로 사용.
async fn temp_file_cleanup_loop(inner: Arc<TunnelManagerInner>) {
    // (Codex Round-4 Low) 시작하자마자 1회 sweep — 이전 실행에서 남은 stale temp 파일 즉시 정리
    if let Some(temp_dir) = temp_upload_dir() {
        let active_paths: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
        cleanup_old_temp_files(&temp_dir, &active_paths).await;
    }

    let interval = Duration::from_secs(600);
    loop {
        tokio::time::sleep(interval).await;
        if inner.is_shutting_down.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        if let Some(temp_dir) = temp_upload_dir() {
            // 현재 활성 entries의 file_path 수집 (만료 안 된 것만)
            let active_paths: std::collections::HashSet<PathBuf> = {
                let now = Instant::now();
                let entries = inner.entries.read().await;
                entries
                    .values()
                    .filter(|e| !e.is_expired(now))
                    .map(|e| e.file_path.clone())
                    .collect()
            };
            cleanup_old_temp_files(&temp_dir, &active_paths).await;
        }
    }
}

async fn cleanup_old_temp_files(
    dir: &Path,
    active_paths: &std::collections::HashSet<PathBuf>,
) {
    let cutoff = SystemTime::now() - Duration::from_secs(TEMP_FILE_TTL_SECS);
    let mut entries = match tokio::fs::read_dir(dir).await {
        Ok(e) => e,
        Err(_) => return,
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        // (Codex Medium 1) 활성 entry가 참조 중인 경로는 절대 삭제 X
        let canonical = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
        if active_paths.contains(&canonical) || active_paths.contains(&path) {
            continue;
        }
        if let Ok(metadata) = entry.metadata().await {
            if let Ok(modified) = metadata.modified() {
                if modified < cutoff {
                    let _ = tokio::fs::remove_file(&path).await;
                }
            }
        }
    }
}

pub fn temp_upload_dir() -> Option<PathBuf> {
    let data_dir = dirs::data_dir()?;
    let mut path = data_dir;
    path.push("ytdlp-companion");
    path.push("tunnel-temp");
    Some(path)
}

pub async fn ensure_temp_upload_dir() -> Result<PathBuf, TunnelError> {
    let dir = temp_upload_dir().ok_or_else(|| TunnelError::Internal("temp dir resolve failed".to_string()))?;
    tokio::fs::create_dir_all(&dir).await?;

    // (Codex Round-3 Medium) 디렉터리 권한 0700 — 다중 사용자 머신에서 다른 user 차단
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o700);
        let _ = tokio::fs::set_permissions(&dir, perms).await;
    }

    Ok(dir)
}

// ──────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────

/// 256-bit CSPRNG 토큰
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Path traversal 방어 + 시스템 디렉터리 차단 + 화이트리스트 디렉터리만 허용
/// (Codex Round-10 High) 임의 로컬 파일 노출 방지를 위해 사용자 디렉터리 화이트리스트 적용.
/// 허용 디렉터리:
///   - $HOME (사용자 홈 + 하위 전체)
///   - 컴패니언 temp_upload_dir (~/Library/Application Support/.../tunnel-temp)
///   - $TMPDIR (시스템 임시 디렉터리)
fn validate_file_path(input: &Path) -> Result<PathBuf, TunnelError> {
    if input.as_os_str().is_empty() {
        return Err(TunnelError::PathTraversal(input.to_path_buf()));
    }

    // 절대경로 강제
    if !input.is_absolute() {
        return Err(TunnelError::PathTraversal(input.to_path_buf()));
    }

    // 정규화 (../ 제거 + 심볼릭 링크 해석)
    let canonical = std::fs::canonicalize(input)
        .map_err(|_| TunnelError::FileNotFound(input.to_path_buf()))?;

    // 시스템 민감 디렉터리 차단 (best-effort)
    let canonical_str = canonical.to_string_lossy().to_lowercase();
    let blocked_prefixes = [
        "/etc",
        "/system/library/keychains",
        "/private/etc",
        "/private/var/db",
        "c:\\windows\\system32",
        "c:\\windows\\syswow64",
    ];
    for blocked in &blocked_prefixes {
        if canonical_str.starts_with(blocked) {
            return Err(TunnelError::PathTraversal(canonical));
        }
    }

    // (Codex Round-10 High) 화이트리스트 디렉터리만 허용
    let allowed_roots = collect_allowed_roots();
    let canonical_for_check = canonical.clone();
    let in_allowed = allowed_roots.iter().any(|root| canonical_for_check.starts_with(root));
    if !in_allowed {
        eprintln!(
            "[Tunnel] 화이트리스트 외 경로 거부 — 허용 root: {:?}",
            allowed_roots
        );
        return Err(TunnelError::PathTraversal(canonical));
    }

    Ok(canonical)
}

/// 허용된 root 디렉터리 수집 (canonical path)
fn collect_allowed_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    // 사용자 홈
    if let Some(home) = dirs::home_dir() {
        if let Ok(canonical) = std::fs::canonicalize(&home) {
            roots.push(canonical);
        }
    }

    // 시스템 temp ($TMPDIR)
    let temp_dir = std::env::temp_dir();
    if let Ok(canonical) = std::fs::canonicalize(&temp_dir) {
        roots.push(canonical);
    }

    // 컴패니언 temp_upload_dir 부모 (data_dir)
    if let Some(data) = dirs::data_dir() {
        if let Ok(canonical) = std::fs::canonicalize(&data) {
            roots.push(canonical);
        }
    }

    // (Codex Round-10 High) 추가 명시 — /tmp 및 /private/tmp (macOS symlink)
    #[cfg(unix)]
    {
        for explicit in ["/tmp", "/private/tmp", "/var/tmp", "/private/var/tmp"] {
            let p = PathBuf::from(explicit);
            if p.exists() {
                if let Ok(canonical) = std::fs::canonicalize(&p) {
                    if !roots.contains(&canonical) {
                        roots.push(canonical);
                    }
                }
            }
        }
    }

    roots
}

/// 파일 SHA-256 검증 (cloudflared 무결성 검사용 — 향후 사용)
#[allow(dead_code)]
pub async fn sha256_file(path: &Path) -> Result<String, TunnelError> {
    let bytes = tokio::fs::read(path).await?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

// ──────────────────────────────────────────────
// 단위 테스트
// ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_token_uniqueness() {
        let tokens: HashSet<_> = (0..1000).map(|_| generate_token()).collect();
        assert_eq!(tokens.len(), 1000, "토큰이 중복됨");
    }

    #[test]
    fn test_token_length() {
        let token = generate_token();
        assert_eq!(token.len(), 64, "토큰은 64자 hex여야 함");
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_extract_trycloudflare_host() {
        let line = "2026-04-06T17:46:28Z INF |  https://looked-usc-armstrong-kinda.trycloudflare.com   |";
        let host = extract_trycloudflare_host(line);
        assert_eq!(host.as_deref(), Some("looked-usc-armstrong-kinda.trycloudflare.com"));
    }

    #[test]
    fn test_extract_trycloudflare_host_no_match() {
        let line = "2026-04-06T17:46:28Z INF Starting metrics server on 127.0.0.1:0";
        assert!(extract_trycloudflare_host(line).is_none());
    }

    #[test]
    fn test_pick_download_url() {
        let url = pick_download_url().unwrap();
        assert!(url.starts_with("https://github.com/cloudflare/cloudflared/releases/download/"));
        assert!(url.contains(CLOUDFLARED_VERSION));
        // (Codex Round-9 Low) OS/arch별 asset 명까지 검증
        let asset_part = url.rsplit('/').next().unwrap();
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => assert_eq!(asset_part, "cloudflared-darwin-arm64.tgz"),
            ("macos", "x86_64") => assert_eq!(asset_part, "cloudflared-darwin-amd64.tgz"),
            ("linux", "x86_64") => assert_eq!(asset_part, "cloudflared-linux-amd64"),
            ("linux", "aarch64") => assert_eq!(asset_part, "cloudflared-linux-arm64"),
            ("windows", "x86_64") => assert_eq!(asset_part, "cloudflared-windows-amd64.exe"),
            ("windows", "aarch64") => assert_eq!(asset_part, "cloudflared-windows-arm64.exe"),
            _ => {}
        }
    }

    #[test]
    fn test_validate_path_blocks_relative() {
        let result = validate_file_path(Path::new("relative/path.mp4"));
        assert!(matches!(result, Err(TunnelError::PathTraversal(_))));
    }

    #[test]
    fn test_validate_path_blocks_empty() {
        let result = validate_file_path(Path::new(""));
        assert!(matches!(result, Err(TunnelError::PathTraversal(_))));
    }

    #[tokio::test]
    async fn test_entry_expiry() {
        let base = Instant::now();
        let entry = TunnelEntry {
            token: "test".to_string(),
            file_path: PathBuf::from("/tmp/test.mp4"),
            mime_type: "video/mp4".to_string(),
            created_at: base,
            expires_at: base + Duration::from_secs(10),
            max_fetches: None,
            fetch_count: 0,
            size_bytes: 1000,
            fetch_history: VecDeque::new(),
            #[cfg(unix)]
            file_ino: 0,
            #[cfg(unix)]
            file_dev: 0,
            #[cfg(windows)]
            file_index: None,
            #[cfg(windows)]
            volume_serial: None,
        };
        // (Codex Round-9 Low) 정확한 경계 검증
        assert!(!entry.is_expired(base), "TTL 시작 시점은 expired 아님");
        assert!(!entry.is_expired(base + Duration::from_secs(9)), "9초는 아직 안 지남");
        // expires_at(<=) 경계 — 정확히 expires_at일 때 expired
        assert!(entry.is_expired(base + Duration::from_secs(10)));
        assert!(entry.is_expired(base + Duration::from_secs(11)));
    }

    #[tokio::test]
    async fn test_entry_max_fetches() {
        let now = Instant::now();
        let entry = TunnelEntry {
            token: "test".to_string(),
            file_path: PathBuf::from("/tmp/test.mp4"),
            mime_type: "video/mp4".to_string(),
            created_at: now,
            expires_at: now + Duration::from_secs(300),
            max_fetches: Some(2),
            fetch_count: 2,
            size_bytes: 1000,
            fetch_history: VecDeque::new(),
            #[cfg(unix)]
            file_ino: 0,
            #[cfg(unix)]
            file_dev: 0,
            #[cfg(windows)]
            file_index: None,
            #[cfg(windows)]
            volume_serial: None,
        };
        // (Codex Round-2 Medium) is_expired는 TTL만, fetch budget은 is_fetch_exhausted
        assert!(!entry.is_expired(now), "TTL 안 지났으므로 expired 아님");
        assert!(entry.is_fetch_exhausted(), "fetch_count >= max_fetches → exhausted");
    }

    #[tokio::test]
    async fn test_rate_limit() {
        let now = Instant::now();
        let mut entry = TunnelEntry {
            token: "test".to_string(),
            file_path: PathBuf::from("/tmp/test.mp4"),
            mime_type: "video/mp4".to_string(),
            created_at: now,
            expires_at: now + Duration::from_secs(300),
            max_fetches: None,
            fetch_count: 0,
            size_bytes: 1000,
            fetch_history: VecDeque::new(),
            #[cfg(unix)]
            file_ino: 0,
            #[cfg(unix)]
            file_dev: 0,
            #[cfg(windows)]
            file_index: None,
            #[cfg(windows)]
            volume_serial: None,
        };

        // 한도 내에서는 OK
        for _ in 0..5 {
            assert!(entry.check_rate_limit(now, 10).is_ok());
        }
        // 한도 초과
        for _ in 0..5 {
            entry.check_rate_limit(now, 10).ok();
        }
        assert!(entry.check_rate_limit(now, 10).is_err());
    }
}

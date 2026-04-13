/**
 * tunnelClient.ts — Companion v2.0.0 Video Tunnel 클라이언트
 *
 * 로컬 파일을 컴패니언의 /api/tunnel/* 엔드포인트를 통해 ephemeral 공개 URL로 노출합니다.
 *
 * 흐름:
 *   1. uploadFileToCompanion(file) — File을 multipart로 컴패니언에 업로드 → 임시 디스크 경로 반환
 *   2. openTunnel(tempPath, mimeType) — 그 경로를 cloudflared로 노출 → 공개 URL 반환
 *   3. (사용 후) closeTunnel(token) — 명시적 정리 (호출 안 해도 5분 후 자동 만료)
 *
 * 검증된 사실 (2026-04-07):
 *   89MB MP4 / 240초 영상이 cloudflared → Evolink → Gemini까지 정상 전달.
 *   VIDEO 15,360 토큰 + AUDIO 6,000 토큰으로 영상 전체 처리 확인.
 */

import { logger } from '../LoggerService';

const COMPANION_URL = 'http://127.0.0.1:9876';

export interface TunnelHandle {
  /** 256-bit hex 토큰 (서버에서 발급) */
  token: string;
  /** 외부에서 fetch 가능한 공개 URL */
  url: string;
  /** Unix timestamp (만료 시각) */
  expiresAt: number;
  /** 파일 크기 (bytes) */
  sizeBytes: number;
}

export interface TunnelStatus {
  ok: boolean;
  cloudflaredRunning: boolean;
  publicHost: string | null;
  uptimeSecs: number;
  activeTunnels: number;
  totalOpened: number;
  totalFetches: number;
  cloudflaredVersion?: string;
  initState?: 'idle' | 'initializing' | 'ready' | 'failed';
  initError?: string;
}

export interface OpenTunnelOptions {
  /** TTL (초). 기본 300, 최대 1800 */
  ttlSecs?: number;
  /** 최대 fetch 횟수. null = 무제한 */
  maxFetches?: number | null;
  /** 취소 신호 */
  signal?: AbortSignal;
}

/**
 * 다중 AbortSignal 결합 — 사용자 signal + timeout signal
 */
function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const valid = signals.filter((s): s is AbortSignal => !!s);
  if (valid.length === 0) return new AbortController().signal;
  if (valid.length === 1) return valid[0];
  // Browser에 AbortSignal.any가 있으면 사용, 없으면 fallback
  if ('any' in AbortSignal && typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any(valid);
  }
  // Fallback: 첫 signal이 abort되면 controller abort
  const ctrl = new AbortController();
  for (const s of valid) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      return ctrl.signal;
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

/**
 * 컴패니언 터널 상태 조회 — Cloudflare quick tunnel 가용 여부 + init state 확인
 * (Codex 프론트 1차 Low) AbortError는 즉시 throw, 그 외만 null
 * (Codex 프론트 6차 Medium) 5초 timeout
 */
export async function getTunnelStatus(signal?: AbortSignal): Promise<TunnelStatus | null> {
  try {
    const combined = combineSignals(signal, AbortSignal.timeout(5000));
    const res = await fetch(`${COMPANION_URL}/api/tunnel/status`, {
      method: 'GET',
      signal: combined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ok: !!data.ok,
      cloudflaredRunning: !!data.cloudflared_running,
      publicHost: data.public_host || null,
      uptimeSecs: data.uptime_secs ?? 0,
      activeTunnels: data.active_tunnels ?? 0,
      totalOpened: data.total_opened ?? 0,
      totalFetches: data.total_fetches ?? 0,
      cloudflaredVersion: data.cloudflared_version,
      initState: data.init_state,
      initError: data.init_error,
    };
  } catch (e) {
    // abort는 폴백 없이 즉시 전파
    if ((e as any)?.name === 'AbortError' || signal?.aborted) {
      throw e;
    }
    logger.trackSwallowedError('tunnelClient.getTunnelStatus', e);
    return null;
  }
}

/**
 * 터널 사용 가능 여부 — cloudflared가 실제로 ready 상태인지 빠르게 확인
 */
export async function isTunnelAvailable(signal?: AbortSignal): Promise<boolean> {
  const status = await getTunnelStatus(signal);
  return !!(status && status.ok && status.cloudflaredRunning && status.publicHost);
}

/**
 * File을 컴패니언 임시 폴더에 multipart 스트리밍 업로드 → 절대 경로 반환
 *
 * 컴패니언 측은 chunk 단위로 디스크에 직접 write (RAM 버퍼링 X).
 * 5GB 한도 + 0600 권한 적용.
 */
export async function uploadFileToCompanion(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  // (Codex 프론트 6차 Medium) 큰 파일 업로드는 30분 timeout
  const combined = combineSignals(signal, AbortSignal.timeout(30 * 60 * 1000));
  const res = await fetch(`${COMPANION_URL}/api/tunnel/upload-temp`, {
    method: 'POST',
    body: formData,
    signal: combined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.message || `HTTP ${res.status}`;
    throw new Error(`임시 업로드 실패: ${msg}`);
  }

  const data = await res.json();
  if (!data?.temp_path) {
    throw new Error('임시 업로드 응답에 temp_path가 없습니다');
  }
  logger.info('[Tunnel] 임시 업로드 완료', {
    sizeBytes: data.size_bytes,
  });
  return data.temp_path as string;
}

/**
 * [v2.5] Blob을 컴패니언 temp에 업로드 → temp_path 반환
 * File 객체가 아닌 Blob도 지원 (ffmpeg 결과 등)
 */
export async function uploadBlobToCompanion(
  blob: Blob,
  filename = 'upload.bin',
  signal?: AbortSignal,
): Promise<string> {
  const file = new File([blob], filename, { type: blob.type });
  return uploadFileToCompanion(file, signal);
}

/**
 * [v2.5] 컴패니언 temp 파일을 Blob으로 다운로드
 * outputPath 응답을 받은 후 파일 내용을 가져올 때 사용
 */
export async function downloadCompanionTempFile(
  outputPath: string,
  mimeType = 'application/octet-stream',
  signal?: AbortSignal,
): Promise<Blob> {
  // outputPath에서 직접 읽기 — 컴패니언의 /api/tunnel/serve를 통하지 않고
  // 파일 내용을 직접 전달받는 엔드포인트 사용
  const res = await fetch(`${COMPANION_URL}/api/tunnel/read-temp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: outputPath }),
    // [FIX Codex-4] caller signal이 있어도 반드시 timeout 보장
    signal: signal
      ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, AbortSignal.timeout(5 * 60 * 1000)]) || AbortSignal.timeout(5 * 60 * 1000)
      : AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) {
    throw new Error(`temp 파일 읽기 실패: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return new Blob([arrayBuffer], { type: mimeType });
}

/**
 * 임시 경로를 cloudflared 터널로 노출 → 공개 URL 반환
 */
export async function openTunnelForPath(
  tempPath: string,
  mimeType: string,
  options: OpenTunnelOptions = {},
): Promise<TunnelHandle> {
  const body = {
    file_path: tempPath,
    mime_type: mimeType,
    ttl_secs: options.ttlSecs ?? 300,
    max_fetches: options.maxFetches ?? null,
  };

  // (Codex 프론트 6차 Medium) open은 빠른 호출 — 10초 timeout
  const combined = combineSignals(options.signal, AbortSignal.timeout(10000));
  const res = await fetch(`${COMPANION_URL}/api/tunnel/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: combined,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.message || `HTTP ${res.status}`;
    throw new Error(`터널 오픈 실패: ${msg}`);
  }

  const data = await res.json();
  if (!data?.token || !data?.url) {
    throw new Error('터널 오픈 응답에 token/url이 없습니다');
  }

  // (Codex 프론트 1차 Low) 토큰/URL prefix 제거 — size만 로그
  logger.info('[Tunnel] 오픈 성공', {
    sizeMB: ((data.size_bytes || 0) / 1024 / 1024).toFixed(1),
  });

  return {
    token: data.token,
    url: data.url,
    expiresAt: data.expires_at,
    sizeBytes: data.size_bytes,
  };
}

/**
 * 명시적 종료. 호출 안 해도 TTL 후 자동 만료. 실패해도 silent.
 * (Codex 프론트 1차 Low) 토큰 로그 제거
 * (Codex 프론트 4차 Medium) 5초 timeout — 컴패니언 hang 방지
 */
export async function closeTunnel(token: string): Promise<void> {
  try {
    const timeoutSignal = AbortSignal.timeout(5000);
    await fetch(`${COMPANION_URL}/api/tunnel/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      signal: timeoutSignal,
    });
    logger.info('[Tunnel] 종료');
  } catch (e) {
    logger.trackSwallowedError('tunnelClient.closeTunnel', e);
  }
}

/**
 * 통합 헬퍼: File → upload → openTunnel 한 번에
 *
 * 사용자 코드는 이걸 호출한 뒤 try/finally에서 closeTunnel을 보장해야 함.
 */
export async function openTunnelForFile(
  file: File,
  options: OpenTunnelOptions = {},
): Promise<TunnelHandle> {
  const tempPath = await uploadFileToCompanion(file, options.signal);
  const mimeType = file.type || 'application/octet-stream';
  return openTunnelForPath(tempPath, mimeType, options);
}

/**
 * Cobalt API 인증 서비스
 * Cloudflare Turnstile 챌린지 → JWT 세션 토큰 → 인증된 다운로드
 * + 비인증 폴백 (Turnstile 실패 시)
 */

import { logger } from './LoggerService';

/** YouTube 지원 Cobalt 인스턴스 */
export interface CobaltInstance {
  api: string;
  sitekey: string;
  /** sitekey가 없으면 비인증 인스턴스 */
  noAuth?: boolean;
}

// 동적 인스턴스 목록 — 런타임에 업데이트 가능
let COBALT_INSTANCES: CobaltInstance[] = [
  { api: 'https://cobalt-api.meowing.de', sitekey: '0x4AAAAAABhzartpLFFY4gsC' },
  { api: 'https://cobalt-backend.canine.tools', sitekey: '0x4AAAAAABBCV3tPrCXT9h2H' },
  { api: 'https://capi.3kh0.net', sitekey: '0x4AAAAAAAQmBip-ISYOeuhC' },
];

/** 캐시된 JWT { [apiUrl]: { token, expiresAt } } */
const jwtCache: Record<string, { token: string; expiresAt: number }> = {};

/** Turnstile 스크립트 로드 상태 */
let turnstileLoaded = false;
let turnstileLoadPromise: Promise<void> | null = null;
let turnstileFailed = false; // Turnstile 스크립트 로드 자체가 실패했는지

/** Turnstile 스크립트 동적 로드 */
function loadTurnstileScript(): Promise<void> {
  if (turnstileLoaded) return Promise.resolve();
  if (turnstileFailed) return Promise.reject(new Error('Turnstile 스크립트 이전 로드 실패'));
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => { turnstileLoaded = true; resolve(); };
    script.onerror = () => {
      turnstileFailed = true;
      turnstileLoadPromise = null;
      logger.warn('[Cobalt] Turnstile 스크립트 로드 실패 — 비인증 모드로 전환');
      reject(new Error('Turnstile 스크립트 로드 실패'));
    };
    // 10초 내 로드 안 되면 실패 처리
    setTimeout(() => {
      if (!turnstileLoaded) {
        turnstileFailed = true;
        turnstileLoadPromise = null;
        reject(new Error('Turnstile 스크립트 로드 시간 초과'));
      }
    }, 10_000);
    document.head.appendChild(script);
  });
  return turnstileLoadPromise;
}

/** Turnstile 챌린지 실행 → 토큰 반환 */
function solveTurnstile(sitekey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    }};
    if (!w.turnstile) { reject(new Error('Turnstile 미로드')); return; }

    // 숨겨진 컨테이너 생성
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;';
    document.body.appendChild(container);

    let widgetId: string;
    const cleanup = () => {
      try { w.turnstile?.remove(widgetId); } catch { /* 무시 */ }
      container.remove();
    };

    const timeout = setTimeout(() => { cleanup(); reject(new Error('Turnstile 시간 초과')); }, 30_000);

    try {
      widgetId = w.turnstile.render(container, {
        sitekey,
        theme: 'dark',
        size: 'compact',
        callback: (token: string) => { clearTimeout(timeout); cleanup(); resolve(token); },
        'error-callback': () => { clearTimeout(timeout); cleanup(); reject(new Error('Turnstile 실패')); },
        'expired-callback': () => { clearTimeout(timeout); cleanup(); reject(new Error('Turnstile 만료')); },
      });
    } catch (e) {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Turnstile render 오류: ${e instanceof Error ? e.message : String(e)}`));
    }
  });
}

/** Cobalt 세션 토큰(JWT) 획득 */
async function getSessionToken(instance: CobaltInstance): Promise<string> {
  // 캐시 확인 (만료 1분 전까지 유효)
  const cached = jwtCache[instance.api];
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  await loadTurnstileScript();
  const turnstileToken = await solveTurnstile(instance.sitekey);

  const res = await fetch(`${instance.api}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-turnstile-response': turnstileToken,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`세션 실패: ${(errData as { error?: { code?: string }}).error?.code || res.status}`);
  }

  const data: { token: string; exp: number } = await res.json();
  if (!data.token) throw new Error('JWT 토큰 없음');

  // 캐시 저장 (exp는 초 단위 lifetime)
  jwtCache[instance.api] = {
    token: data.token,
    expiresAt: Date.now() + (data.exp || 1800) * 1000,
  };

  return data.token;
}

/**
 * 비인증 Cobalt 다운로드 시도 (Turnstile 불필요 인스턴스용)
 * 일부 Cobalt 인스턴스는 인증 없이도 요청 가능
 */
async function cobaltDownloadNoAuth(
  instance: CobaltInstance,
  videoId: string,
): Promise<{ url: string; filename: string } | null> {
  const res = await fetch(`${instance.api}/`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoQuality: '1080',
      youtubeVideoCodec: 'h264',
      downloadMode: 'auto',
      filenameStyle: 'pretty',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return extractCobaltUrl(data, videoId);
}

/** Cobalt 응답에서 다운로드 URL 추출 */
function extractCobaltUrl(
  data: { status?: string; url?: string; filename?: string; picker?: { url?: string }[]; error?: { code?: string } },
  videoId: string,
): { url: string; filename: string } | null {
  if (data.status === 'error') {
    console.warn(`[Cobalt] error:`, data.error?.code);
    return null;
  }
  if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
    return { url: data.url, filename: data.filename || `${videoId}.mp4` };
  }
  if (data.status === 'picker' && data.picker?.length) {
    const pick = data.picker[0];
    if (pick.url) return { url: pick.url, filename: data.filename || `${videoId}.mp4` };
  }
  return null;
}

/** 인증된 Cobalt 다운로드 요청 — 모든 인스턴스 순회 + 비인증 폴백 */
export async function cobaltDownload(
  videoId: string,
  onPhase?: (msg: string) => void,
): Promise<{ url: string; filename: string } | null> {
  // Phase 1: 인증 기반 시도 (Turnstile이 작동하는 경우)
  if (!turnstileFailed) {
    for (const instance of COBALT_INSTANCES) {
      if (instance.noAuth) continue;
      try {
        onPhase?.(`보안 인증 중... (${new URL(instance.api).hostname})`);
        const jwt = await getSessionToken(instance);

        onPhase?.('다운로드 요청 중...');
        const res = await fetch(`${instance.api}/`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            videoQuality: '1080',
            youtubeVideoCodec: 'h264',
            downloadMode: 'auto',
            filenameStyle: 'pretty',
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          logger.warn(`[Cobalt] ${instance.api} → HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        if (data.status === 'error' && data.error?.code?.includes('auth')) {
          delete jwtCache[instance.api];
          continue;
        }

        const result = extractCobaltUrl(data, videoId);
        if (result) {
          logger.info(`[Cobalt] ✅ 인증 다운로드 성공: ${instance.api}`);
          return result;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[Cobalt] ${instance.api} 인증 실패: ${msg}`);
        // Turnstile 관련 에러면 나머지 인증 시도 스킵
        if (msg.includes('Turnstile') || msg.includes('스크립트')) {
          logger.warn('[Cobalt] Turnstile 불가 — 비인증 모드로 전환');
          break;
        }
        continue;
      }
    }
  }

  // Phase 2: 비인증 시도 (Turnstile 실패 시 폴백)
  onPhase?.('비인증 다운로드 시도 중...');
  for (const instance of COBALT_INSTANCES) {
    try {
      logger.info(`[Cobalt] 비인증 시도: ${instance.api}`);
      const result = await cobaltDownloadNoAuth(instance, videoId);
      if (result) {
        logger.info(`[Cobalt] ✅ 비인증 다운로드 성공: ${instance.api}`);
        return result;
      }
    } catch (e) {
      logger.warn(`[Cobalt] ${instance.api} 비인증 실패: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
  }

  return null;
}

/** 런타임 인스턴스 목록 갱신 — instances.cobalt.best에서 YouTube 지원 인스턴스 탐색 */
export async function refreshCobaltInstances(): Promise<number> {
  try {
    const res = await fetch('https://instances.cobalt.best/api/instances.json', {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return 0;

    const list = await res.json() as {
      api?: string;
      api_url?: string;
      services?: Record<string, boolean | string>;
      score?: number;
      cors?: boolean;
      online?: boolean;
    }[];

    const fresh: CobaltInstance[] = [];

    // 1단계: 응답에서 YouTube=true인 인스턴스 필터
    const candidates = list.filter(inst => {
      const apiUrl = inst.api_url || inst.api;
      if (!apiUrl) return false;
      if (inst.online === false) return false;
      // services가 object인 경우 youtube 키 확인
      if (inst.services && typeof inst.services === 'object') {
        return inst.services.youtube === true;
      }
      return false;
    }).sort((a, b) => (b.score || 0) - (a.score || 0)); // 점수 높은 순

    // 2단계: 상위 5개만 sitekey 확인 (너무 많으면 느려짐)
    for (const inst of candidates.slice(0, 5)) {
      const apiUrl = (inst.api_url || inst.api || '').replace(/\/$/, '');
      try {
        const infoRes = await fetch(`${apiUrl}/`, {
          signal: AbortSignal.timeout(5_000),
          headers: { 'Accept': 'application/json' },
        });
        if (!infoRes.ok) continue;
        const info = await infoRes.json() as { cobalt?: { services?: string[]; turnstileSitekey?: string } };
        const sitekey = info.cobalt?.turnstileSitekey || '';
        if (sitekey) {
          fresh.push({ api: apiUrl, sitekey });
        } else {
          // sitekey 없으면 비인증 인스턴스로 추가
          fresh.push({ api: apiUrl, sitekey: '', noAuth: true });
        }
      } catch { /* skip */ }
    }

    if (fresh.length > 0) {
      // 기존 하드코딩 인스턴스 유지 + 새로 발견한 인스턴스 앞에 추가
      const existingUrls = new Set(fresh.map(f => f.api));
      const kept = COBALT_INSTANCES.filter(c => !existingUrls.has(c.api));
      COBALT_INSTANCES = [...fresh, ...kept];
      logger.info(`[Cobalt] 인스턴스 갱신: ${fresh.length}개 발견 (총 ${COBALT_INSTANCES.length}개)`);
    }
    return fresh.length;
  } catch (e) {
    logger.warn(`[Cobalt] 인스턴스 목록 갱신 실패: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

/** 현재 인스턴스 목록 반환 */
export function getCobaltInstances(): CobaltInstance[] {
  return COBALT_INSTANCES;
}

/**
 * Cobalt API 인증 서비스
 * Cloudflare Turnstile 챌린지 → JWT 세션 토큰 → 인증된 다운로드
 */

/** YouTube 지원 Cobalt 인스턴스 (2026.03 확인) */
export interface CobaltInstance {
  api: string;
  sitekey: string;
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

/** Turnstile 스크립트 동적 로드 */
function loadTurnstileScript(): Promise<void> {
  if (turnstileLoaded) return Promise.resolve();
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => { turnstileLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Turnstile 스크립트 로드 실패'));
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

    widgetId = w.turnstile.render(container, {
      sitekey,
      theme: 'dark',
      size: 'compact',
      callback: (token: string) => { clearTimeout(timeout); cleanup(); resolve(token); },
      'error-callback': () => { clearTimeout(timeout); cleanup(); reject(new Error('Turnstile 실패')); },
      'expired-callback': () => { clearTimeout(timeout); cleanup(); reject(new Error('Turnstile 만료')); },
    });
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

/** 인증된 Cobalt 다운로드 요청 — 모든 인스턴스 순회 */
export async function cobaltDownload(
  videoId: string,
  onPhase?: (msg: string) => void,
): Promise<{ url: string; filename: string } | null> {
  for (const instance of COBALT_INSTANCES) {
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
        console.warn(`[Cobalt] ${instance.api} → ${res.status}`);
        continue;
      }

      const data = await res.json();

      if (data.status === 'error') {
        console.warn(`[Cobalt] ${instance.api} error:`, data.error?.code);
        // JWT 무효화된 경우 캐시 삭제
        if (data.error?.code?.includes('auth')) {
          delete jwtCache[instance.api];
        }
        continue;
      }

      // tunnel: 직접 다운로드 URL
      if (data.status === 'tunnel' && data.url) {
        return { url: data.url, filename: data.filename || `${videoId}.mp4` };
      }
      // redirect: 리다이렉트 URL
      if (data.status === 'redirect' && data.url) {
        return { url: data.url, filename: data.filename || `${videoId}.mp4` };
      }
      // picker: 첫 번째 옵션
      if (data.status === 'picker' && data.picker?.length > 0) {
        const pick = data.picker[0];
        if (pick.url) {
          return { url: pick.url, filename: data.filename || `${videoId}.mp4` };
        }
      }
    } catch (e) {
      console.warn(`[Cobalt] ${instance.api} 실패:`, e);
      continue;
    }
  }
  return null;
}

/** 런타임 인스턴스 목록 갱신 — instances.cobalt.best에서 YouTube 지원 인스턴스 탐색 */
export async function refreshCobaltInstances(): Promise<void> {
  try {
    const res = await fetch('https://instances.cobalt.best/api/instances.json', {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return;

    const list: { api_url?: string; services?: string[] }[] = await res.json();
    const fresh: CobaltInstance[] = [];

    for (const inst of list) {
      const apiUrl = inst.api_url;
      if (!apiUrl) continue;

      // YouTube 지원 확인 + sitekey 획득
      try {
        const infoRes = await fetch(`${apiUrl}/`, { signal: AbortSignal.timeout(5_000) });
        if (!infoRes.ok) continue;
        const info = await infoRes.json();
        const services: string[] = info.cobalt?.services || [];
        const sitekey: string = info.cobalt?.turnstileSitekey || '';
        if (services.includes('youtube') && sitekey) {
          fresh.push({ api: apiUrl, sitekey });
        }
      } catch { /* skip */ }
    }

    if (fresh.length > 0) {
      COBALT_INSTANCES = fresh;
      console.log(`[Cobalt] 인스턴스 갱신: ${fresh.length}개 YouTube 지원`);
    }
  } catch {
    console.warn('[Cobalt] 인스턴스 목록 갱신 실패');
  }
}

/** 현재 인스턴스 목록 반환 */
export function getCobaltInstances(): CobaltInstance[] {
  return COBALT_INSTANCES;
}

import { monitoredFetch } from './apiService';
import { logger } from './LoggerService';

const LOCAL_COMPANION_URL_BASE = 'http://127.0.0.1';
const MAIN_COMPANION_PORT_CANDIDATES = [9876, 9877] as const;
const PROPAINTER_PORT_CANDIDATES = [9877, 9876] as const;
const MAIN_COMPANION_PORT_STORAGE_KEY = 'companion_main_port';
const PROPAINTER_PORT_STORAGE_KEY = 'companion_propainter_port';
const HEALTH_TIMEOUT_MS = 3000;
const HEALTH_MAX_RETRIES = 2;
const HEALTH_RETRY_DELAY_MS = 1000;

export interface CompanionPropainterHealth {
  app?: string;
  status?: string;
  version?: string;
  port?: number;
  services?: string[];
  features?: {
    inpaint?: boolean;
  };
  propainter?: boolean;
}

export interface PropainterProxyResolution {
  url: string | null;
  propainterPort: number | null;
  companionDetected: boolean;
  companionPort: number | null;
}

let _cachedMainCompanionPort = readCachedPort(
  MAIN_COMPANION_PORT_STORAGE_KEY,
  MAIN_COMPANION_PORT_CANDIDATES,
);
let _cachedPropainterPort = readCachedPort(
  PROPAINTER_PORT_STORAGE_KEY,
  PROPAINTER_PORT_CANDIDATES,
);

function buildUrl(port: number): string {
  return `${LOCAL_COMPANION_URL_BASE}:${port}`;
}

function isValidPortCandidate(
  port: number,
  candidates: readonly number[],
): boolean {
  return candidates.includes(port as (typeof candidates)[number]);
}

function readCachedPort(
  key: string,
  candidates: readonly number[],
): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const port = Number(raw);
    return Number.isFinite(port) && isValidPortCandidate(port, candidates) ? port : null;
  } catch {
    return null;
  }
}

function writeCachedPort(key: string, port: number | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (port == null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, String(port));
  } catch {
    // localStorage 차단 환경은 무시
  }
}

function cacheMainCompanionPort(port: number | null): void {
  _cachedMainCompanionPort = port;
  writeCachedPort(MAIN_COMPANION_PORT_STORAGE_KEY, port);
}

function cachePropainterPort(port: number | null): void {
  _cachedPropainterPort = port;
  writeCachedPort(PROPAINTER_PORT_STORAGE_KEY, port);
}

function normalizeCompanionPort(port: unknown): number | null {
  if (typeof port !== 'number' || !Number.isFinite(port)) return null;
  return isValidPortCandidate(port, MAIN_COMPANION_PORT_CANDIDATES) ? port : null;
}

function uniquePorts(ports: number[]): number[] {
  return ports.filter((port, index) => ports.indexOf(port) === index);
}

function getOrderedPorts(
  cachedPort: number | null,
  candidates: readonly number[],
): number[] {
  const preferred = cachedPort != null ? [cachedPort, ...candidates] : [...candidates];
  return uniquePorts(preferred.filter((port) => isValidPortCandidate(port, candidates)));
}

function buildPropainterProbeOrder(companionPort: number | null): number[] {
  const ports: number[] = [];

  if (_cachedPropainterPort != null) {
    ports.push(_cachedPropainterPort);
  }

  if (companionPort != null) {
    for (const port of PROPAINTER_PORT_CANDIDATES) {
      if (port !== companionPort) ports.push(port);
    }
    ports.push(companionPort);
  } else {
    ports.push(...PROPAINTER_PORT_CANDIDATES);
  }

  return uniquePorts(
    ports.filter((port) => isValidPortCandidate(port, PROPAINTER_PORT_CANDIDATES)),
  );
}

function isMainCompanionHealth(
  health: CompanionPropainterHealth | null,
): boolean {
  return health?.app === 'ytdlp-companion';
}

function isPropainterHealth(
  health: CompanionPropainterHealth | null,
): boolean {
  return !!(
    health &&
    (
      health.app === 'propainter-server' ||
      health.propainter ||
      health.features?.inpaint
    )
  );
}

async function readHealth(
  port: number,
): Promise<CompanionPropainterHealth | null> {
  const url = `${buildUrl(port)}/health`;
  const response = await monitoredFetch(url, {}, HEALTH_TIMEOUT_MS);
  if (!response.ok) {
    logger.info(`[PropainterProxy] ${url} health ${response.status}`);
    return null;
  }

  const health = await response.json().catch(() => null) as CompanionPropainterHealth | null;
  if (!health || typeof health !== 'object') {
    logger.info(`[PropainterProxy] ${url} health payload 비어 있음`);
    return null;
  }

  return health;
}

async function detectMainCompanion(): Promise<{
  companionDetected: boolean;
  companionPort: number | null;
}> {
  const portsToTry = getOrderedPorts(
    _cachedMainCompanionPort,
    MAIN_COMPANION_PORT_CANDIDATES,
  );

  for (const port of portsToTry) {
    try {
      const health = await readHealth(port);
      if (!isMainCompanionHealth(health)) continue;

      const detectedPort = normalizeCompanionPort(health.port) ?? port;
      cacheMainCompanionPort(detectedPort);
      logger.info(
        `[PropainterProxy] 메인 컴패니언 감지 (${buildUrl(detectedPort)}, v${health.version || '?'})`,
      );
      return {
        companionDetected: true,
        companionPort: detectedPort,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      logger.info(
        `[PropainterProxy] 메인 컴패니언 health 실패 (${buildUrl(port)}): ${reason}`,
      );
    }
  }

  cacheMainCompanionPort(null);
  return {
    companionDetected: false,
    companionPort: null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolvePropainterProxy(): Promise<PropainterProxyResolution> {
  const companion = await detectMainCompanion();
  let companionDetected = companion.companionDetected;
  let companionPort = companion.companionPort;
  const portsToTry = buildPropainterProbeOrder(companionPort);

  for (const port of portsToTry) {
    for (let attempt = 0; attempt < HEALTH_MAX_RETRIES; attempt++) {
      try {
        const health = await readHealth(port);
        if (!health) {
          if (attempt < HEALTH_MAX_RETRIES - 1) {
            await sleep(HEALTH_RETRY_DELAY_MS);
            continue;
          }
          break;
        }

        if (isPropainterHealth(health)) {
          cachePropainterPort(port);
          logger.info(
            `[PropainterProxy] ProPainter 감지 성공 (${buildUrl(port)}, app=${health.app || 'unknown'})`,
          );
          return {
            url: buildUrl(port),
            propainterPort: port,
            companionDetected,
            companionPort,
          };
        }

        if (isMainCompanionHealth(health)) {
          companionDetected = true;
          companionPort = normalizeCompanionPort(health.port) ?? port;
          cacheMainCompanionPort(companionPort);
          logger.info(
            `[PropainterProxy] ${buildUrl(port)}는 메인 컴패니언 포트로 응답 — ProPainter 전용 서버 아님`,
          );
          break;
        }

        logger.info(
          `[PropainterProxy] ${buildUrl(port)} health OK but unsupported app=${health.app || 'unknown'}`,
        );
        if (attempt < HEALTH_MAX_RETRIES - 1) {
          await sleep(HEALTH_RETRY_DELAY_MS);
          continue;
        }
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown';
        logger.info(
          `[PropainterProxy] ${buildUrl(port)} probe 실패: ${reason} (attempt ${attempt + 1}/${HEALTH_MAX_RETRIES})`,
        );
        if (attempt < HEALTH_MAX_RETRIES - 1) {
          await sleep(HEALTH_RETRY_DELAY_MS);
          continue;
        }
        break;
      }
    }
  }

  cachePropainterPort(null);
  return {
    url: null,
    propainterPort: null,
    companionDetected,
    companionPort,
  };
}

export function buildPropainterUnavailableMessage(
  resolution: Pick<PropainterProxyResolution, 'companionDetected' | 'companionPort'>,
): string {
  const portHint = resolution.companionPort != null
    ? `현재 메인 컴패니언 포트는 ${resolution.companionPort}입니다.\n`
    : '';

  if (resolution.companionDetected) {
    return `컴패니언 앱은 감지됐지만 자막/워터마크 제거용 ProPainter 서버가 응답하지 않습니다.\n${portHint}컴패니언을 다시 실행하고 9876/9877 포트를 확인한 뒤 다시 시도하세요.`;
  }

  return `자막/워터마크 제거용 컴패니언 서버를 찾지 못했습니다.\n컴패니언을 실행하고 9876/9877 포트를 확인한 뒤 다시 시도하세요.`;
}

export function resetPropainterProxyCache(): void {
  cacheMainCompanionPort(null);
  cachePropainterPort(null);
}

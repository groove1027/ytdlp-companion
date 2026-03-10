
type LogLevel = 'info' | 'error' | 'success' | 'warn';

export interface LogEntry {
  timestamp: string;       // ISO format (ms 정밀도)
  level: LogLevel;
  message: string;
  details?: any;
  category?: 'api' | 'action' | 'system' | 'service';
  duration?: number;       // ms (API 호출 응답 시간)
}

type LogListener = (logs: LogEntry[]) => void;

/** 세션 ID 생성 (8자리 영숫자) */
const generateSessionId = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
};

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: LogListener[] = [];
  readonly sessionId = generateSessionId();
  private readonly sessionStart = Date.now();

  private addLog(level: LogLevel, message: string, details?: any, extra?: Partial<LogEntry>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
      ...extra,
    };
    this.logs = [entry, ...this.logs].slice(0, 300); // 100 → 300
    this.notify();
  }

  info(message: string, details?: any) {
    this.addLog('info', message, details);
    console.log(`[INFO] ${message}`, details || '');
  }

  error(message: string, details?: any) {
    this.addLog('error', message, details);
    console.error(`[ERROR] ${message}`, details || '');
  }

  success(message: string, details?: any) {
    this.addLog('success', message, details);
    console.log(`[SUCCESS] ${message}`, details || '');
  }

  warn(message: string, details?: any) {
    this.addLog('warn', message, details);
    console.warn(`[WARN] ${message}`, details || '');
  }

  /** API 호출 결과 로깅 (응답 시간 포함) */
  apiLog(level: LogLevel, message: string, duration: number, details?: any) {
    this.addLog(level, message, details, { category: 'api', duration });
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level.toUpperCase()}] ${message} (${duration}ms)`, details || '');
  }

  /** 사용자 액션 추적 (버튼 클릭, 탭 전환 등) */
  trackAction(action: string, target?: string) {
    const msg = target ? `${action}: ${target}` : action;
    this.addLog('info', msg, undefined, { category: 'action' });
  }

  getLogs() {
    return this.logs;
  }

  /** 환경 스냅샷 수집 (동기) */
  collectEnvironmentSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};

    // Session
    snapshot['Session ID'] = this.sessionId;
    snapshot['Session Duration'] = `${Math.round((Date.now() - this.sessionStart) / 1000)}s`;

    // Screen
    snapshot['Screen'] = `${screen.width}x${screen.height} (DPR: ${devicePixelRatio})`;
    snapshot['Viewport'] = `${window.innerWidth}x${window.innerHeight}`;

    // Memory (Chrome only)
    const perf = performance as any;
    if (perf.memory) {
      const used = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(perf.memory.totalJSHeapSize / 1024 / 1024);
      const limit = Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024);
      snapshot['Memory'] = `${used}MB / ${total}MB (limit: ${limit}MB)`;
    }

    // Network
    snapshot['Online'] = navigator.onLine ? 'Yes' : 'No';
    const conn = (navigator as any).connection;
    if (conn) {
      snapshot['Network'] = `${conn.effectiveType || '?'} (RTT: ${conn.rtt ?? '?'}ms, downlink: ${conn.downlink ?? '?'}Mbps)`;
    }

    // Browser
    snapshot['Language'] = navigator.language;
    snapshot['Platform'] = navigator.platform;

    // API Key Status
    try {
      const keys: [string, string][] = [
        ['Evolink', 'CUSTOM_EVOLINK_KEY'],
        ['KIE', 'CUSTOM_KIE_KEY'],
        ['YouTube', 'CUSTOM_YOUTUBE_API_KEY'],
        ['Cloudinary', 'CUSTOM_CLOUD_NAME'],
        ['Remove.bg', 'CUSTOM_REMOVE_BG_KEY'],
        ['WaveSpeed', 'CUSTOM_WAVESPEED_KEY'],
        ['Typecast', 'CUSTOM_TYPECAST_KEY'],
        ['GhostCut', 'CUSTOM_GHOSTCUT_APP_KEY'],
        ['xAI', 'CUSTOM_XAI_KEY'],
        ['Coupang', 'CUSTOM_COUPANG_ACCESS_KEY'],
      ];
      const configured = keys.filter(([, k]) => !!localStorage.getItem(k)).map(([n]) => n);
      const missing = keys.filter(([, k]) => !localStorage.getItem(k)).map(([n]) => n);
      snapshot['API Keys (set)'] = configured.length > 0 ? configured.join(', ') : '(none)';
      snapshot['API Keys (missing)'] = missing.length > 0 ? missing.join(', ') : '(none)';
    } catch { /* ignore */ }

    // Current Tab
    try {
      const navState = localStorage.getItem('navigation-state');
      if (navState) {
        const parsed = JSON.parse(navState);
        snapshot['Active Tab'] = parsed.activeTab || '?';
      }
    } catch { /* ignore */ }

    return snapshot;
  }

  /** 비동기 환경 정보 포함 전체 스냅샷 (스토리지 용량 등) */
  async collectFullEnvironmentSnapshot(): Promise<Record<string, string>> {
    const snapshot = this.collectEnvironmentSnapshot();

    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        const used = Math.round((est.usage || 0) / 1024 / 1024);
        const quota = Math.round((est.quota || 0) / 1024 / 1024);
        snapshot['Storage'] = `${used}MB / ${quota}MB (${quota > 0 ? Math.round(used / quota * 100) : 0}%)`;
      }
    } catch { /* ignore */ }

    return snapshot;
  }

  /** 피드백 첨부용 포맷 문자열 (최신->과거) */
  exportFormatted(): string {
    if (this.logs.length === 0) return '(로그 없음)';
    return this.logs.map(log => {
      const time = log.timestamp.substring(11, 23); // HH:MM:SS.mmm
      const level = log.level.toUpperCase().padEnd(7);
      const dur = log.duration != null ? ` (${log.duration}ms)` : '';
      const cat = log.category ? `[${log.category}] ` : '';
      const detail = log.details
        ? '\n    ' + (typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)).split('\n').join('\n    ')
        : '';
      return `[${time}] ${level} ${cat}${log.message}${dur}${detail}`;
    }).join('\n');
  }

  /** 환경 스냅샷 + 전체 로그 결합 포맷 (피드백 제출용) */
  async exportFormattedWithEnv(): Promise<string> {
    const env = await this.collectFullEnvironmentSnapshot();
    const envLines = Object.entries(env).map(([k, v]) => `  ${k}: ${v}`).join('\n');

    const actionTrail = this.getActionTrail();
    const actionSection = actionTrail !== '(기록된 액션 없음)'
      ? `\n\n--- User Actions ---\n${actionTrail}`
      : '';

    const header = `--- Environment ---\n${envLines}${actionSection}\n\n--- Logs (${this.logs.length}) ---`;
    const logs = this.exportFormatted();
    return `${header}\n${logs}`;
  }

  /** 에러/경고 로그만 추출 */
  exportErrors(): string {
    const errors = this.logs.filter(l => l.level === 'error' || l.level === 'warn');
    if (errors.length === 0) return '';
    return errors.map(log => {
      const time = log.timestamp.substring(11, 23);
      const dur = log.duration != null ? ` (${log.duration}ms)` : '';
      const detail = log.details
        ? '\n    ' + (typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)).split('\n').join('\n    ')
        : '';
      return `[${time}] ${log.level.toUpperCase()} ${log.message}${dur}${detail}`;
    }).join('\n');
  }

  getErrorCount(): number {
    return this.logs.filter(l => l.level === 'error' || l.level === 'warn').length;
  }

  /** 사용자 액션 로그만 추출 */
  getActionTrail(): string {
    const actions = this.logs.filter(l => l.category === 'action');
    if (actions.length === 0) return '(기록된 액션 없음)';
    return actions.map(a => {
      const time = a.timestamp.substring(11, 19); // HH:MM:SS
      return `[${time}] ${a.message}`;
    }).join('\n');
  }

  clear() {
    this.logs = [];
    this.notify();
  }

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.logs));
  }
}

export const logger = new LoggerService();

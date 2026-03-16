
type LogLevel = 'info' | 'error' | 'success' | 'warn';

export interface LogEntry {
  timestamp: string;       // ISO format (ms 정밀도)
  level: LogLevel;
  message: string;
  details?: any;
  category?: 'api' | 'action' | 'system' | 'service' | 'generation' | 'performance' | 'config';
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

const PERSIST_KEY = 'DEBUG_PERSISTED_ERRORS';
const MAX_PERSISTED = 50;
const MAX_LOGS = 500; // 300→500으로 증가 (고도화된 진단 데이터 수용)

// [FIX #191] require() → 자기초기화 레지스트리 패턴 (Vite/브라우저 호환)
const _storeRefs: Record<string, any> = {};
const _lazyStoreImports: [string, () => Promise<any>][] = [
  ['projectStore', () => import('../stores/projectStore').then(m => m.useProjectStore)],
  ['imageVideoStore', () => import('../stores/imageVideoStore').then(m => m.useImageVideoStore)],
  ['scriptWriterStore', () => import('../stores/scriptWriterStore').then(m => m.useScriptWriterStore)],
  ['costStore', () => import('../stores/costStore').then(m => m.useCostStore)],
  ['navigationStore', () => import('../stores/navigationStore').then(m => m.useNavigationStore)],
  ['videoAnalysisStore', () => import('../stores/videoAnalysisStore').then(m => m.useVideoAnalysisStore)],
  ['channelAnalysisStore', () => import('../stores/channelAnalysisStore').then(m => m.useChannelAnalysisStore)],
  ['soundStudioStore', () => import('../stores/soundStudioStore').then(m => m.useSoundStudioStore)],
  ['editRoomStore', () => import('../stores/editRoomStore').then(m => m.useEditRoomStore)],
  ['editorStore', () => import('../stores/editorStore').then(m => m.useEditorStore)],
  ['uiStore', () => import('../stores/uiStore').then(m => m.useUIStore)],
  ['authStore', () => import('../stores/authStore').then(m => m.useAuthStore)],
  ['uploadStore', () => import('../stores/uploadStore').then(m => m.useUploadStore)],
  ['viewAlertStore', () => import('../stores/viewAlertStore').then(m => m.useViewAlertStore)],
  ['shoppingShortStore', () => import('../stores/shoppingShortStore').then(m => m.useShoppingShortStore)],
  ['editPointStore', () => import('../stores/editPointStore').then(m => m.useEditPointStore)],
  ['instinctStore', () => import('../stores/instinctStore').then(m => m.useInstinctStore)],
];
_lazyStoreImports.forEach(([name, importFn]) => {
  importFn().then(store => { _storeRefs[name] = store; }).catch(() => {});
});
const _getStore = (name: string) => _storeRefs[name] || null;

// ── 설정 변경 감사 추적 ──
interface SettingChange {
  timestamp: string;
  key: string;
  oldValue: string;
  newValue: string;
}

// ── 미디어 치수 추적 ──
interface MediaDimensionRecord {
  timestamp: string;
  sceneId: string;
  type: 'image' | 'video';
  requestedRatio: string;
  actualWidth?: number;
  actualHeight?: number;
  actualRatio?: string;
  mismatch: boolean;
}

// ── API 타이밍 워터폴 ──
interface ApiTimingEntry {
  id: string;
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number | 'error' | 'timeout';
}

// ── 메모리 타임라인 ──
interface MemorySnapshot {
  timestamp: number;
  usedMB: number;
  totalMB: number;
}

// ── 네트워크 품질 타임라인 ──
interface NetworkSnapshot {
  timestamp: string;
  online: boolean;
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
}

// ── Tab Visit History ──
interface TabVisit {
  tab: string;
  subTab?: string;
  enteredAt: number;
  leftAt?: number;
  durationMs?: number;
}

// ── API Failure Details ──
interface ApiFailureDetail {
  timestamp: string;
  url: string;
  method: string;
  status: number | string;
  durationMs: number;
  requestSnippet?: string;
  responseSnippet?: string;
  responseHeaders?: string;
}

// ── Blob URL Registry ──
interface BlobUrlRecord {
  url: string;
  type: 'image' | 'video' | 'audio' | 'other';
  owner: string;
  sizeMB?: number;
  createdAt: number;
}

// ── Async Operation Tracking ──
interface AsyncOperationRecord {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  details?: string;
}

// ── Error Chain ──
interface ErrorChainEntry {
  id: string;
  timestamp: string;
  message: string;
  context?: string;
  parentId?: string;
}

// ── Swallowed Error ──
interface SwallowedErrorRecord {
  timestamp: string;
  location: string;
  message: string;
}

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: LogListener[] = [];
  readonly sessionId = generateSessionId();
  private readonly sessionStart = Date.now();
  private globalHandlersInstalled = false;

  // ── 고도화된 진단 데이터 저장소 ──
  private settingChanges: SettingChange[] = [];
  private mediaDimensions: MediaDimensionRecord[] = [];
  private apiTimings: ApiTimingEntry[] = [];
  private memoryTimeline: MemorySnapshot[] = [];
  private networkTimeline: NetworkSnapshot[] = [];
  private consoleCaptures: { level: string; message: string; timestamp: string }[] = [];
  private longTasks: { duration: number; timestamp: string }[] = [];
  private resourceFailures: { url: string; type: string; timestamp: string }[] = [];
  private _apiTimingCounter = 0;
  private _memoryIntervalId: ReturnType<typeof setInterval> | null = null;
  private _originalConsoleError: typeof console.error | null = null;
  private _originalConsoleWarn: typeof console.warn | null = null;

  // ── 10x 강화 진단 데이터 ──
  private tabVisitHistory: TabVisit[] = [];
  private _currentTabVisit: TabVisit | null = null;
  private apiFailureDetails: ApiFailureDetail[] = [];
  private blobUrlRegistry: Map<string, BlobUrlRecord> = new Map();
  private asyncOperations: Map<string, AsyncOperationRecord> = new Map();
  private errorChains: ErrorChainEntry[] = [];
  private swallowedErrors: SwallowedErrorRecord[] = [];
  private _errorChainCounter = 0;

  private addLog(level: LogLevel, message: string, details?: any, extra?: Partial<LogEntry>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
      ...extra,
    };
    this.logs = [entry, ...this.logs].slice(0, MAX_LOGS);
    this.notify();
  }

  /** Error 객체에서 stack trace + message 추출 */
  private enrichErrorDetails(details: any): any {
    if (details instanceof Error) {
      return {
        message: details.message,
        stack: details.stack?.split('\n').slice(0, 8).join('\n'), // 상위 8줄만
        name: details.name,
      };
    }
    return details;
  }

  info(message: string, details?: any) {
    this.addLog('info', message, details);
    this._safeConsoleLog(`[INFO] ${message}`, details || '');
  }

  error(message: string, details?: any) {
    this.addLog('error', message, this.enrichErrorDetails(details));
    this.persistErrors();
    this._safeConsoleError(`[ERROR] ${message}`, details || '');
  }

  success(message: string, details?: any) {
    this.addLog('success', message, details);
    this._safeConsoleLog(`[SUCCESS] ${message}`, details || '');
  }

  warn(message: string, details?: any) {
    this.addLog('warn', message, this.enrichErrorDetails(details));
    this.persistErrors();
    this._safeConsoleWarn(`[WARN] ${message}`, details || '');
  }

  /** API 호출 결과 로깅 (응답 시간 포함) */
  apiLog(level: LogLevel, message: string, duration: number, details?: any) {
    this.addLog(level, message, this.enrichErrorDetails(details), { category: 'api', duration });
    if (level === 'error' || level === 'warn') this.persistErrors();
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level.toUpperCase()}] ${message} (${duration}ms)`, details || '');
  }

  /** 사용자 액션 추적 (버튼 클릭, 탭 전환 등) */
  trackAction(action: string, target?: string) {
    const msg = target ? `${action}: ${target}` : action;
    this.addLog('info', msg, undefined, { category: 'action' });
  }

  /** 탭 방문 기록 (tab + optional subTab) */
  trackTabVisit(tab: string, subTab?: string) {
    const now = Date.now();
    // 이전 탭 방문 종료 처리
    if (this._currentTabVisit) {
      this._currentTabVisit.leftAt = now;
      this._currentTabVisit.durationMs = now - this._currentTabVisit.enteredAt;
    }
    const visit: TabVisit = { tab, subTab, enteredAt: now };
    this.tabVisitHistory = [...this.tabVisitHistory, visit].slice(-50);
    this._currentTabVisit = visit;
    const label = subTab ? `${tab} > ${subTab}` : tab;
    this.addLog('info', `📍 탭 방문: ${label}`, undefined, { category: 'action' });
  }

  /** 재시도 추적 */
  trackRetry(operation: string, attempt: number, maxAttempts: number, reason?: string) {
    const msg = `🔄 Retry ${attempt}/${maxAttempts}: ${operation}`;
    this.addLog('warn', msg, reason || undefined, { category: 'api' });
  }

  // ── API 실패 상세 기록 ──

  /** API 실패 상세 정보 기록 (요청 바디 스니펫 + 응답 바디 스니펫 + 헤더) */
  trackApiFailure(detail: ApiFailureDetail) {
    this.apiFailureDetails = [...this.apiFailureDetails, detail].slice(-20);
  }

  /** API 실패 목록 반환 */
  getApiFailures(): ApiFailureDetail[] {
    return this.apiFailureDetails;
  }

  getLogs() {
    return this.logs;
  }

  // ══════════════════════════════════════════════════════════════
  // [NEW] 이미지/영상 생성 파라미터 로깅
  // ══════════════════════════════════════════════════════════════

  /** 이미지 생성 파라미터 기록 */
  trackImageGeneration(params: {
    sceneId: string;
    sceneIndex: number;
    style: string;
    aspectRatio: string;
    imageModel: string;
    castType?: string;
    hasCharacterRef: boolean;
    hasFeedback: boolean;
    enableWebSearch: boolean;
    promptLength: number;
    provider: string;
  }) {
    this.addLog('info', `🎨 이미지 생성 요청`, {
      scene: `#${params.sceneIndex + 1} (${params.sceneId})`,
      style: params.style,
      ratio: params.aspectRatio,
      model: params.imageModel,
      cast: params.castType || 'MAIN',
      charRef: params.hasCharacterRef,
      feedback: params.hasFeedback,
      webSearch: params.enableWebSearch,
      promptLen: params.promptLength,
      provider: params.provider,
    }, { category: 'generation' });
  }

  /** 영상 생성 파라미터 기록 */
  trackVideoGeneration(params: {
    sceneId: string;
    sceneIndex: number;
    videoModel: string;
    aspectRatio: string;
    duration?: string;
    speechMode?: boolean;
    hasImageUrl: boolean;
    promptLength: number;
    isSafeRetry?: boolean;
  }) {
    this.addLog('info', `🎬 영상 생성 요청`, {
      scene: `#${params.sceneIndex + 1} (${params.sceneId})`,
      model: params.videoModel,
      ratio: params.aspectRatio,
      duration: params.duration || 'default',
      speech: params.speechMode || false,
      hasImage: params.hasImageUrl,
      promptLen: params.promptLength,
      safeRetry: params.isSafeRetry || false,
    }, { category: 'generation' });
  }

  /** 생성 결과 기록 (성공/실패) */
  trackGenerationResult(params: {
    type: 'image' | 'video';
    sceneId: string;
    success: boolean;
    provider: string;
    duration: number;
    isFallback?: boolean;
    error?: string;
  }) {
    const level = params.success ? 'success' : 'error';
    const emoji = params.success ? '✅' : '❌';
    const fb = params.isFallback ? ' (폴백)' : '';
    this.addLog(level, `${emoji} ${params.type === 'image' ? '이미지' : '영상'} 생성 ${params.success ? '성공' : '실패'}${fb}`, {
      scene: params.sceneId,
      provider: params.provider,
      duration: `${params.duration}ms`,
      ...(params.error ? { error: params.error } : {}),
    }, { category: 'generation', duration: params.duration });
  }

  // ══════════════════════════════════════════════════════════════
  // [NEW] 설정 변경 감사 추적
  // ══════════════════════════════════════════════════════════════

  /** 설정 변경 추적 (old→new 값 전이) */
  trackSettingChange(key: string, oldValue: unknown, newValue: unknown) {
    const old = typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue ?? '(없음)');
    const nv = typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue ?? '(없음)');
    if (old === nv) return; // 동일한 값은 무시
    const change: SettingChange = {
      timestamp: new Date().toISOString(),
      key,
      oldValue: old.substring(0, 200),
      newValue: nv.substring(0, 200),
    };
    this.settingChanges = [...this.settingChanges, change].slice(-100);
    this.addLog('info', `⚙️ 설정 변경: ${key}`, { from: old.substring(0, 100), to: nv.substring(0, 100) }, { category: 'config' });
  }

  // ══════════════════════════════════════════════════════════════
  // [NEW] 미디어 치수 검증 (요청 vs 실제)
  // ══════════════════════════════════════════════════════════════

  /** 생성된 미디어의 실제 치수를 기록하고 요청한 비율과 비교 */
  trackMediaDimension(params: {
    sceneId: string;
    type: 'image' | 'video';
    requestedRatio: string;
    actualWidth: number;
    actualHeight: number;
  }) {
    const actualRatio = params.actualWidth > 0 && params.actualHeight > 0
      ? `${(params.actualWidth / params.actualHeight).toFixed(2)}`
      : '?';

    // 비율 불일치 판단 (±15% 허용)
    const ratioMap: Record<string, number> = { '16:9': 1.778, '9:16': 0.5625, '1:1': 1.0, '4:3': 1.333 };
    const expected = ratioMap[params.requestedRatio] || 1.0;
    const actual = params.actualWidth / params.actualHeight;
    const mismatch = Math.abs(actual - expected) / expected > 0.15;

    const record: MediaDimensionRecord = {
      timestamp: new Date().toISOString(),
      sceneId: params.sceneId,
      type: params.type,
      requestedRatio: params.requestedRatio,
      actualWidth: params.actualWidth,
      actualHeight: params.actualHeight,
      actualRatio,
      mismatch,
    };
    this.mediaDimensions = [...this.mediaDimensions, record].slice(-50);

    if (mismatch) {
      this.addLog('warn', `⚠️ ${params.type} 비율 불일치`, {
        scene: params.sceneId,
        requested: params.requestedRatio,
        actual: `${params.actualWidth}x${params.actualHeight} (${actualRatio})`,
      }, { category: 'generation' });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // [NEW] API 타이밍 워터폴
  // ══════════════════════════════════════════════════════════════

  /** API 호출 시작 기록 → ID 반환 */
  startApiTiming(url: string, method: string): string {
    const id = `api-${++this._apiTimingCounter}`;
    this.apiTimings = [...this.apiTimings, {
      id, url, method, startTime: performance.now(),
    }].slice(-100);
    return id;
  }

  /** API 호출 완료 기록 */
  endApiTiming(id: string, status: number | 'error' | 'timeout') {
    const entry = this.apiTimings.find(e => e.id === id);
    if (entry) {
      entry.endTime = performance.now();
      entry.duration = Math.round(entry.endTime - entry.startTime);
      entry.status = status;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // [NEW] React Error Boundary 연동
  // ══════════════════════════════════════════════════════════════

  /** React 컴포넌트 렌더 에러 기록 */
  trackReactError(error: Error, componentStack: string) {
    this.addLog('error', `⚛️ React Render Error: ${error.message}`, {
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 8).join('\n'),
      componentStack: componentStack.split('\n').slice(0, 10).join('\n'),
    }, { category: 'system' });
    this.persistErrors();
  }

  // ══════════════════════════════════════════════════════════════
  // 글로벌 에러 핸들러 (강화)
  // ══════════════════════════════════════════════════════════════

  /** 글로벌 에러/이벤트 핸들러 설치 (앱 시작 시 1회 호출) */
  installGlobalHandlers() {
    if (this.globalHandlersInstalled) return;
    this.globalHandlersInstalled = true;

    // 이전 세션 에러 복원
    this.restorePersistedErrors();

    // Uncaught errors
    window.addEventListener('error', (event) => {
      // 리소스 로딩 실패 감지 (img, script, link 등)
      const target = event.target as any;
      if (target && target !== window && target.tagName) {
        const tagName = target.tagName?.toLowerCase();
        const src = (target as HTMLImageElement).src || (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || '?';
        this.resourceFailures = [...this.resourceFailures, {
          url: src.substring(0, 200),
          type: tagName || 'unknown',
          timestamp: new Date().toISOString(),
        }].slice(-50);
        this.addLog('warn', `📦 리소스 로딩 실패: <${tagName}>`, { url: src.substring(0, 200) }, { category: 'system' });
        return; // 리소스 에러는 여기서 처리
      }

      this.addLog('error', `💥 Uncaught: ${event.message}`, {
        file: event.filename?.split('/').pop(),
        line: event.lineno,
        col: event.colno,
        stack: event.error?.stack?.split('\n').slice(0, 5).join('\n'),
      }, { category: 'system' });
      this.persistErrors();
    }, true); // capture phase로 리소스 에러도 잡기

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack?.split('\n').slice(0, 5).join('\n') : undefined;
      this.addLog('error', `💥 Unhandled Rejection: ${message}`, { stack }, { category: 'system' });
      this.persistErrors();
    });

    // 탭 비활성화/활성화 감지
    document.addEventListener('visibilitychange', () => {
      const state = document.visibilityState;
      this.addLog('info', state === 'visible' ? '🔀 탭 활성화 (foreground)' : '🔀 탭 비활성화 (background)', undefined, { category: 'system' });
    });

    // 네트워크 온/오프라인 전환
    window.addEventListener('online', () => {
      this.addLog('info', '🌐 네트워크 연결됨', undefined, { category: 'system' });
      this._recordNetworkSnapshot();
    });
    window.addEventListener('offline', () => {
      this.addLog('warn', '🌐 네트워크 끊김', undefined, { category: 'system' });
      this._recordNetworkSnapshot();
      this.persistErrors();
    });

    // [NEW] 네트워크 품질 변화 감지
    const conn = (navigator as any).connection;
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', () => {
        this._recordNetworkSnapshot();
        this.addLog('info', `🌐 네트워크 변경: ${conn.effectiveType} (RTT: ${conn.rtt}ms, ↓${conn.downlink}Mbps)`, undefined, { category: 'system' });
      });
    }

    // [NEW] Console.error/warn 캡처 (원본 보존)
    this._installConsoleCapture();

    // [NEW] Long Task 감지 (Chrome PerformanceObserver)
    this._installLongTaskObserver();

    // [NEW] 메모리 타임라인 (30초 간격, Chrome only)
    this._installMemoryMonitor();

    // [NEW] Feature detection 기록
    this._recordFeatureDetection();

    // 초기 네트워크 스냅샷
    this._recordNetworkSnapshot();

    this.addLog('info', `🚀 앱 시작 (세션: ${this.sessionId})`, undefined, { category: 'system' });
  }

  // ── Console 캡처 ──

  private _installConsoleCapture() {
    this._originalConsoleError = console.error;
    this._originalConsoleWarn = console.warn;

    const self = this;
    console.error = function (...args: any[]) {
      // logger 자체 호출 무한루프 방지
      const msg = args.map(a => typeof a === 'string' ? a : (a instanceof Error ? a.message : '')).join(' ');
      if (!msg.includes('[ERROR]') && !msg.includes('[WARN]')) {
        self.consoleCaptures = [...self.consoleCaptures, {
          level: 'error',
          message: msg.substring(0, 500),
          timestamp: new Date().toISOString(),
        }].slice(-100);
      }
      self._originalConsoleError!.apply(console, args);
    };

    console.warn = function (...args: any[]) {
      const msg = args.map(a => typeof a === 'string' ? a : '').join(' ');
      if (!msg.includes('[WARN]') && !msg.includes('[INFO]')) {
        self.consoleCaptures = [...self.consoleCaptures, {
          level: 'warn',
          message: msg.substring(0, 500),
          timestamp: new Date().toISOString(),
        }].slice(-100);
      }
      self._originalConsoleWarn!.apply(console, args);
    };
  }

  // 안전한 콘솔 출력 (캡처 무한루프 방지)
  private _safeConsoleLog(msg: string, ...args: any[]) {
    (this._originalConsoleError ? Function.prototype.bind.call(console.log, console) : console.log)(msg, ...args);
  }
  private _safeConsoleError(msg: string, ...args: any[]) {
    (this._originalConsoleError || console.error).call(console, msg, ...args);
  }
  private _safeConsoleWarn(msg: string, ...args: any[]) {
    (this._originalConsoleWarn || console.warn).call(console, msg, ...args);
  }

  // ── Long Task Observer ──

  private _installLongTaskObserver() {
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 100) { // 100ms 이상만 기록
              this.longTasks = [...this.longTasks, {
                duration: Math.round(entry.duration),
                timestamp: new Date().toISOString(),
              }].slice(-50);
              if (entry.duration > 500) {
                this.addLog('warn', `🐌 Long Task 감지: ${Math.round(entry.duration)}ms`, undefined, { category: 'performance' });
              }
            }
          }
        });
        obs.observe({ type: 'longtask', buffered: true });
      }
    } catch { /* Long Task API 미지원 브라우저 */ }
  }

  // ── 메모리 모니터 ──

  private _installMemoryMonitor() {
    const perf = performance as any;
    if (!perf.memory) return;

    this._memoryIntervalId = setInterval(() => {
      const used = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
      const total = Math.round(perf.memory.totalJSHeapSize / 1024 / 1024);
      this.memoryTimeline = [...this.memoryTimeline, {
        timestamp: Date.now(),
        usedMB: used,
        totalMB: total,
      }].slice(-120); // 최대 1시간 (30초 간격)

      // 메모리 급등 경고 (500MB 이상)
      if (used > 500) {
        this.addLog('warn', `🧠 높은 메모리 사용: ${used}MB / ${total}MB`, undefined, { category: 'performance' });
      }
    }, 30000);
  }

  // ── 네트워크 스냅샷 ──

  private _recordNetworkSnapshot() {
    const conn = (navigator as any).connection;
    this.networkTimeline = [...this.networkTimeline, {
      timestamp: new Date().toISOString(),
      online: navigator.onLine,
      effectiveType: conn?.effectiveType,
      rtt: conn?.rtt,
      downlink: conn?.downlink,
    }].slice(-60);
  }

  // ── Feature Detection ──

  private _recordFeatureDetection() {
    const features: Record<string, boolean> = {};
    try {
      features['WebCodecs'] = typeof (window as any).VideoEncoder === 'function';
      features['OffscreenCanvas'] = typeof OffscreenCanvas === 'function';
      features['SharedArrayBuffer'] = typeof SharedArrayBuffer === 'function';
      features['WebWorker'] = typeof Worker === 'function';
      features['IndexedDB'] = typeof indexedDB !== 'undefined';
      features['WebGL2'] = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
      features['WebGPU'] = typeof (navigator as any).gpu !== 'undefined';
      features['ServiceWorker'] = 'serviceWorker' in navigator;
      features['Clipboard'] = typeof navigator.clipboard !== 'undefined';
      features['WASM'] = typeof WebAssembly === 'object';
      features['MediaRecorder'] = typeof MediaRecorder === 'function';
      features['PerformanceObserver'] = typeof PerformanceObserver === 'function';
      features['StorageEstimate'] = typeof navigator.storage?.estimate === 'function';
      features['WebAudio'] = typeof AudioContext === 'function' || typeof (window as any).webkitAudioContext === 'function';
    } catch { /* ignore */ }

    const supported = Object.entries(features).filter(([, v]) => v).map(([k]) => k);
    const missing = Object.entries(features).filter(([, v]) => !v).map(([k]) => k);

    this.addLog('info', `🔍 Feature Detection`, {
      supported: supported.join(', '),
      missing: missing.length > 0 ? missing.join(', ') : '(all supported)',
    }, { category: 'system' });
  }

  // ── 로그 영속화 (에러/경고만) ──

  /** 에러/경고 로그를 localStorage에 저장 (새로고침 후에도 유지) */
  private persistErrors() {
    try {
      const errors = this.logs
        .filter(l => l.level === 'error' || l.level === 'warn')
        .filter(l => !l.message.startsWith('[이전]')) // 복원된 로그 제외
        .slice(0, MAX_PERSISTED);
      localStorage.setItem(PERSIST_KEY, JSON.stringify(errors));
    } catch { /* quota exceeded, ignore */ }
  }

  /** 이전 세션의 에러 로그 복원 */
  private restorePersistedErrors() {
    try {
      const saved = localStorage.getItem(PERSIST_KEY);
      if (!saved) return;
      const entries: LogEntry[] = JSON.parse(saved);
      if (entries.length === 0) return;

      // 이전 세션 에러를 현재 로그 뒤에 추가 (구분 표시)
      const restored = entries.map(e => ({
        ...e,
        message: `[이전] ${e.message}`,
      }));
      this.logs = [...this.logs, ...restored].slice(0, MAX_LOGS);
      this.addLog('info', `📋 이전 세션 에러 ${entries.length}건 복원됨`, undefined, { category: 'system' });
      this.notify();

      // 복원 후 삭제
      localStorage.removeItem(PERSIST_KEY);
    } catch { /* ignore */ }
  }

  // ══════════════════════════════════════════════════════════════
  // 환경 스냅샷 (강화)
  // ══════════════════════════════════════════════════════════════

  /** 환경 스냅샷 수집 (동기) */
  collectEnvironmentSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {};

    // Session
    snapshot['Session ID'] = this.sessionId;
    snapshot['Session Duration'] = `${Math.round((Date.now() - this.sessionStart) / 1000)}s`;
    snapshot['App Version'] = 'v4.5';

    // Screen
    snapshot['Screen'] = `${screen.width}x${screen.height} (DPR: ${devicePixelRatio})`;
    snapshot['Viewport'] = `${window.innerWidth}x${window.innerHeight}`;
    snapshot['Color Depth'] = `${screen.colorDepth}bit`;

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
      if (conn.saveData) snapshot['Data Saver'] = 'ON';
    }

    // Browser
    snapshot['Language'] = navigator.language;
    snapshot['Platform'] = navigator.platform;
    snapshot['Cores'] = String(navigator.hardwareConcurrency || '?');
    snapshot['Touch'] = 'ontouchstart' in window ? 'Yes' : 'No';

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

  // ══════════════════════════════════════════════════════════════
  // [NEW] 프로젝트 설정 스냅샷
  // ══════════════════════════════════════════════════════════════

  /** 프로젝트 설정 + 주요 스토어 상태 수집 (피드백 제출 시 호출) — backward-compatible wrapper */
  collectProjectSnapshot(): Record<string, string> {
    return this.collectAllStoreSnapshots();
  }

  /** 핵심 5개 스토어 스냅샷 (projectStore, imageVideoStore, scriptWriterStore, costStore, navigationStore) */
  private _collectCoreProjectSnapshot(): Record<string, string> {
    const snap: Record<string, string> = {};

    try {
      // projectStore — lazy import로 순환참조 방지
      const projectStore = _getStore('projectStore');
      if (!projectStore) throw new Error('not loaded');
      const ps = projectStore.getState();
      if (ps.config) {
        snap['VideoFormat'] = ps.config.videoFormat || '?';
        snap['AspectRatio'] = ps.config.aspectRatio || '?';
        snap['ImageModel'] = ps.config.imageModel || '?';
        snap['SmartSplit'] = String(ps.config.smartSplit ?? '?');
        snap['AllowInfographics'] = String(ps.config.allowInfographics ?? '?');
        snap['PipelineSteps'] = JSON.stringify(ps.config.pipelineSteps || {});
      }
      snap['Scene Count'] = String(ps.scenes?.length || 0);
      snap['Project Title'] = (ps.projectTitle || '(untitled)').substring(0, 50);
      snap['Project ID'] = ps.currentProjectId || '(none)';

      // 장면별 요약 (이미지/영상 완성 상태)
      if (ps.scenes?.length > 0) {
        const withImg = ps.scenes.filter((s: any) => s.imageUrl).length;
        const withVid = ps.scenes.filter((s: any) => s.videoUrl).length;
        const withPrompt = ps.scenes.filter((s: any) => s.visualPrompt).length;
        snap['Scene Images'] = `${withImg}/${ps.scenes.length}`;
        snap['Scene Videos'] = `${withVid}/${ps.scenes.length}`;
        snap['Scene Prompts'] = `${withPrompt}/${ps.scenes.length}`;
      }
    } catch { /* projectStore 미로드 시 무시 */ }

    try {
      // imageVideoStore
      const ivStore = _getStore('imageVideoStore');
      if (!ivStore) throw new Error('not loaded');
      const iv = ivStore.getState();
      snap['IV.Style'] = iv.style || '(none)';
      snap['IV.SubTab'] = iv.activeSubTab;
      snap['IV.Characters'] = String(iv.characters?.length || 0);
      snap['IV.WebSearch'] = String(iv.enableWebSearch);
      snap['IV.MultiChar'] = String(iv.isMultiCharacter);
      snap['IV.StyleRefs'] = String(iv.styleReferenceImages?.length || 0);
    } catch { /* ignore */ }

    try {
      // scriptWriterStore
      const swStore = _getStore('scriptWriterStore');
      if (!swStore) throw new Error('not loaded');
      const sw = swStore.getState();
      snap['SW.InputMode'] = sw.inputMode || '?';
      snap['SW.ContentFormat'] = sw.contentFormat || '?';
      snap['SW.VideoFormat'] = sw.videoFormat || '?';
      snap['SW.ActiveStep'] = String(sw.activeStep);
      snap['SW.SmartSplit'] = String(sw.smartSplit);
    } catch { /* ignore */ }

    try {
      // costStore
      const costStore = _getStore('costStore');
      if (!costStore) throw new Error('not loaded');
      const cs = costStore.getState();
      if (cs.costStats) {
        snap['Cost.Total'] = `$${cs.costStats.totalUsd?.toFixed(4) || '0'}`;
        snap['Cost.Images'] = String(cs.costStats.imageCount || 0);
        snap['Cost.Videos'] = String(cs.costStats.videoCount || 0);
      }
    } catch { /* ignore */ }

    try {
      // navigationStore
      const navStore = _getStore('navigationStore');
      if (!navStore) throw new Error('not loaded');
      const ns = navStore.getState();
      snap['Nav.ActiveTab'] = ns.activeTab || '?';
      snap['Nav.Dashboard'] = String(ns.showProjectDashboard);
    } catch { /* ignore */ }

    return snap;
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

    // localStorage 사용량 추정
    try {
      let lsSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) lsSize += (localStorage.getItem(key) || '').length;
      }
      snapshot['LocalStorage'] = `${Math.round(lsSize / 1024)}KB (${localStorage.length} keys)`;
    } catch { /* ignore */ }

    return snapshot;
  }

  // ══════════════════════════════════════════════════════════════
  // Export (강화)
  // ══════════════════════════════════════════════════════════════

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

  /** [강화] 환경 + 프로젝트 + 진단 데이터 + 로그 결합 포맷 (피드백 제출용) */
  async exportFormattedWithEnv(): Promise<string> {
    const env = await this.collectFullEnvironmentSnapshot();
    const envLines = Object.entries(env).map(([k, v]) => `  ${k}: ${v}`).join('\n');

    // A+K. All Store Snapshots (extended from old collectProjectSnapshot)
    const allSnap = this.collectAllStoreSnapshots();
    const allSnapLines = Object.entries(allSnap).map(([k, v]) => `  ${k}: ${v}`).join('\n');

    const actionTrail = this.getActionTrail();
    const actionSection = actionTrail !== '(기록된 액션 없음)'
      ? `\n\n--- User Actions ---\n${actionTrail}`
      : '';

    // Setting changes
    const settingSection = this.settingChanges.length > 0
      ? `\n\n--- Setting Changes (${this.settingChanges.length}) ---\n${this.settingChanges.map(s => {
        const t = s.timestamp.substring(11, 19);
        return `[${t}] ${s.key}: ${s.oldValue} → ${s.newValue}`;
      }).join('\n')}`
      : '';

    // Media dimension mismatches
    const mismatches = this.mediaDimensions.filter(m => m.mismatch);
    const dimensionSection = mismatches.length > 0
      ? `\n\n--- Media Dimension Mismatches (${mismatches.length}) ---\n${mismatches.map(m => {
        const t = m.timestamp.substring(11, 19);
        return `[${t}] ${m.type} ${m.sceneId}: requested=${m.requestedRatio} actual=${m.actualWidth}x${m.actualHeight} (${m.actualRatio})`;
      }).join('\n')}`
      : '';

    // Generation log
    const genLogs = this.logs.filter(l => l.category === 'generation');
    const genSection = genLogs.length > 0
      ? `\n\n--- Generation Log (${genLogs.length}) ---\n${genLogs.slice(0, 30).map(g => {
        const t = g.timestamp.substring(11, 19);
        const dur = g.duration ? ` (${g.duration}ms)` : '';
        return `[${t}] ${g.level.toUpperCase()} ${g.message}${dur}`;
      }).join('\n')}`
      : '';

    // Memory timeline
    const memSection = this.memoryTimeline.length > 0
      ? `\n\n--- Memory Timeline ---\n${this.memoryTimeline.slice(-10).map(m => {
        const d = new Date(m.timestamp);
        return `[${d.toTimeString().substring(0, 8)}] ${m.usedMB}MB / ${m.totalMB}MB`;
      }).join('\n')}`
      : '';

    // Long tasks
    const ltSection = this.longTasks.length > 0
      ? `\n\n--- Long Tasks (${this.longTasks.length}) ---\n${this.longTasks.slice(-10).map(lt => {
        const t = lt.timestamp.substring(11, 19);
        return `[${t}] ${lt.duration}ms`;
      }).join('\n')}`
      : '';

    // Console captures
    const ccSection = this.consoleCaptures.length > 0
      ? `\n\n--- Console Captures (${this.consoleCaptures.length}) ---\n${this.consoleCaptures.slice(-20).map(c => {
        const t = c.timestamp.substring(11, 19);
        return `[${t}] ${c.level.toUpperCase()} ${c.message.substring(0, 200)}`;
      }).join('\n')}`
      : '';

    // Network timeline
    const netSection = this.networkTimeline.length > 1
      ? `\n\n--- Network Timeline (${this.networkTimeline.length}) ---\n${this.networkTimeline.slice(-10).map(n => {
        const t = n.timestamp.substring(11, 19);
        return `[${t}] ${n.online ? 'Online' : 'OFFLINE'} ${n.effectiveType || ''} RTT:${n.rtt ?? '?'}ms ↓${n.downlink ?? '?'}Mbps`;
      }).join('\n')}`
      : '';

    // Resource failures
    const resSection = this.resourceFailures.length > 0
      ? `\n\n--- Resource Failures (${this.resourceFailures.length}) ---\n${this.resourceFailures.slice(-10).map(r => {
        const t = r.timestamp.substring(11, 19);
        return `[${t}] <${r.type}> ${r.url}`;
      }).join('\n')}`
      : '';

    // API waterfall
    const completedApis = this.apiTimings.filter(a => a.endTime);
    const waterfall = completedApis.length > 0
      ? `\n\n--- API Waterfall (${completedApis.length}) ---\n${completedApis.slice(-20).map(a => {
        return `${a.method} ${a.url.substring(0, 80)} → ${a.status} (${a.duration}ms)`;
      }).join('\n')}`
      : '';

    // ═══ NEW SECTIONS (10x Enhancement) ═══

    // C. Tab Visit History
    const closedVisit = this._currentTabVisit
      ? [...this.tabVisitHistory, { ...this._currentTabVisit, leftAt: Date.now(), durationMs: Date.now() - this._currentTabVisit.enteredAt }]
      : this.tabVisitHistory;
    const tabSection = closedVisit.length > 0
      ? `\n\n--- Tab Visit History (${closedVisit.length}) ---\n${closedVisit.slice(-20).map(v => {
        const t = new Date(v.enteredAt).toTimeString().substring(0, 8);
        const dur = v.durationMs ? `(${v.durationMs >= 60000 ? `${Math.floor(v.durationMs / 60000)}m ${Math.round((v.durationMs % 60000) / 1000)}s` : `${Math.round(v.durationMs / 1000)}s`})` : '(현재)';
        const sub = v.subTab ? ` > ${v.subTab}` : '';
        return `[${t}] ${v.tab}${sub} ${dur}`;
      }).join('\n')}`
      : '';

    // B. API Failure Details
    const failSection = this.apiFailureDetails.length > 0
      ? `\n\n--- API Failure Details (${this.apiFailureDetails.length}) ---\n${this.apiFailureDetails.slice(-10).map(f => {
        const t = f.timestamp.substring(11, 19);
        let entry = `[${t}] ${f.method} ${f.url.substring(0, 80)} → ${f.status} (${f.durationMs}ms)`;
        if (f.requestSnippet) entry += `\n  Req: ${f.requestSnippet}`;
        if (f.responseSnippet) entry += `\n  Res: ${f.responseSnippet}`;
        if (f.responseHeaders) entry += `\n  Headers: ${f.responseHeaders}`;
        return entry;
      }).join('\n')}`
      : '';

    // D. Persist Rehydration Status
    const persistSection = `\n\n--- Persist Rehydration Status ---\n${this.collectPersistStatus()}`;

    // E. IndexedDB Status
    let idbSection = '';
    try {
      const idbStatus = await this.collectIndexedDbStatus();
      idbSection = `\n\n--- IndexedDB Status ---\n${idbStatus}`;
    } catch { /* ignore */ }

    // F. Blob URL Registry
    const blobs = Array.from(this.blobUrlRegistry.values());
    const blobSection = blobs.length > 0
      ? `\n\n--- Active Blob URLs (${blobs.length}) ---\n${blobs.map(b => {
        const t = new Date(b.createdAt).toTimeString().substring(0, 8);
        const size = b.sizeMB ? ` ${b.sizeMB}MB` : '';
        return `[${t}] ${b.type} (${b.owner})${size}`;
      }).join('\n')}\nTotal blobs: ${blobs.length}, Est. memory: ${blobs.reduce((s, b) => s + (b.sizeMB || 0), 0).toFixed(1)}MB`
      : '';

    // G. Async Operations
    const ops = Array.from(this.asyncOperations.values());
    const activeOps = ops.filter(o => o.status === 'running' || o.status === 'pending');
    const recentCompleted = ops.filter(o => o.status === 'completed' || o.status === 'failed').slice(-5);
    const opsSection = (activeOps.length > 0 || recentCompleted.length > 0)
      ? `\n\n--- Async Operations ---\n${[
        ...activeOps.map(o => `  [${o.status.toUpperCase()}] ${o.type} — ${o.id} (${Math.round((Date.now() - o.startedAt) / 1000)}s elapsed)${o.details ? ` — ${o.details}` : ''}`),
        ...recentCompleted.map(o => `  [${o.status.toUpperCase()}] ${o.type} — ${o.id} (${o.completedAt ? Math.round((o.completedAt - o.startedAt) / 1000) : '?'}s)${o.details ? ` — ${o.details}` : ''}`)
      ].join('\n')}`
      : '';

    // H. DOM Diagnostics
    const domSnap = this.collectDomDiagnostics();
    const domSection = Object.keys(domSnap).length > 0
      ? `\n\n--- DOM Diagnostics ---\n${Object.entries(domSnap).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
      : '';

    // I. Error Chain
    const chainSection = this.errorChains.length > 0
      ? `\n\n--- Error Chains (${this.errorChains.length}) ---\n${this.errorChains.slice(-15).map(e => {
        const t = e.timestamp.substring(11, 19);
        const parent = e.parentId ? ` ← ${e.parentId}` : ' (ROOT)';
        return `[${t}] ${e.id}${parent}: ${e.message}${e.context ? ` [${e.context}]` : ''}`;
      }).join('\n')}`
      : '';

    // J. localStorage Breakdown
    const lsSection = `\n\n--- localStorage Breakdown ---\n${this.collectLocalStorageBreakdown()}`;

    // L. Swallowed Errors
    const swallowSection = this.swallowedErrors.length > 0
      ? `\n\n--- Swallowed Errors (${this.swallowedErrors.length}) ---\n${this.swallowedErrors.slice(-15).map(s => {
        const t = s.timestamp.substring(11, 19);
        return `[${t}] ${s.location}: ${s.message}`;
      }).join('\n')}`
      : '';

    const header = `--- Environment ---\n${envLines}`;
    const storeHeader = allSnapLines ? `\n\n--- All Store States ---\n${allSnapLines}` : '';
    const logs = this.exportFormatted();

    return [
      header,
      failSection,
      swallowSection,
      chainSection,
      opsSection,
      blobSection,
      ccSection,
      tabSection,
      actionSection,
      genSection,
      dimensionSection,
      waterfall,
      memSection,
      ltSection,
      netSection,
      resSection,
      domSection,
      persistSection,
      idbSection,
      lsSection,
      settingSection,
      storeHeader,
      `\n\n--- Logs (${this.logs.length}) ---\n${logs}`,
    ].filter(s => s).join('');
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

  /** 카테고리별 로그 필터링 */
  getLogsByCategory(category: LogEntry['category']): LogEntry[] {
    return this.logs.filter(l => l.category === category);
  }

  /** 진단 통계 요약 (피드백 모달 표시용) */
  getDiagnosticSummary(): {
    logCount: number;
    errorCount: number;
    settingChanges: number;
    mediaMismatches: number;
    longTasks: number;
    consoleErrors: number;
    resourceFailures: number;
  } {
    return {
      logCount: this.logs.length,
      errorCount: this.getErrorCount(),
      settingChanges: this.settingChanges.length,
      mediaMismatches: this.mediaDimensions.filter(m => m.mismatch).length,
      longTasks: this.longTasks.length,
      consoleErrors: this.consoleCaptures.filter(c => c.level === 'error').length,
      resourceFailures: this.resourceFailures.length,
    };
  }

  // ══ F. Blob URL Registry ══
  registerBlobUrl(url: string, type: BlobUrlRecord['type'], owner: string, sizeMB?: number) {
    this.blobUrlRegistry.set(url, { url, type, owner, sizeMB, createdAt: Date.now() });
  }
  unregisterBlobUrl(url: string) {
    this.blobUrlRegistry.delete(url);
  }

  // ══ G. Async Operation Tracking ══
  startAsyncOp(id: string, type: string, details?: string) {
    this.asyncOperations.set(id, { id, type, status: 'running', startedAt: Date.now(), details });
  }
  endAsyncOp(id: string, status: 'completed' | 'failed', details?: string) {
    const op = this.asyncOperations.get(id);
    if (op) {
      op.status = status;
      op.completedAt = Date.now();
      if (details) op.details = details;
    }
  }

  // ══ I. Error Chain ══
  trackErrorChain(message: string, context?: string, parentId?: string): string {
    const id = `err-${++this._errorChainCounter}`;
    this.errorChains = [...this.errorChains, { id, timestamp: new Date().toISOString(), message, context, parentId }].slice(-50);
    return id;
  }

  // ══ L. Swallowed Error ══
  trackSwallowedError(location: string, error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    this.swallowedErrors = [...this.swallowedErrors, {
      timestamp: new Date().toISOString(),
      location,
      message: msg.substring(0, 300),
    }].slice(-50);
  }

  // ══ A+K. All Store Snapshots + User Input Context ══
  collectAllStoreSnapshots(): Record<string, string> {
    const snap: Record<string, string> = {};
    // Re-use existing projectStore snapshot
    const existing = this._collectCoreProjectSnapshot();
    Object.assign(snap, existing);

    try {
      const vaStore = _getStore('videoAnalysisStore');
      if (!vaStore) throw new Error('not loaded');
      const va = vaStore.getState();
      snap['VA.InputMode'] = va.inputMode || '?';
      snap['VA.YoutubeUrls'] = String(va.youtubeUrls?.filter((u: string) => u.trim()).length || 0);
      snap['VA.SelectedPreset'] = va.selectedPreset || '(none)';
      snap['VA.CacheKeys'] = String(Object.keys(va.resultCache || {}).length);
      snap['VA.Versions'] = String(va.versions?.length || 0);
      snap['VA.ActiveSlot'] = va.activeSlotId || '(none)';
      snap['VA.RawResultLen'] = String(va.rawResult?.length || 0);
    } catch { /* ignore */ }

    try {
      const caStore = _getStore('channelAnalysisStore');
      if (!caStore) throw new Error('not loaded');
      const ca = caStore.getState();
      snap['CA.SubTab'] = ca.subTab || '?';
      snap['CA.Keyword'] = (ca.keyword || '').substring(0, 50);
      snap['CA.QuotaUsed'] = `${ca.quotaUsed || 0}/${ca.quotaLimit || 10000}`;
      snap['CA.Benchmarks'] = String(ca.savedBenchmarks?.length || 0);
      snap['CA.Presets'] = String(ca.savedPresets?.length || 0);
    } catch { /* ignore */ }

    try {
      const ssStore = _getStore('soundStudioStore');
      if (!ssStore) throw new Error('not loaded');
      const ss = ssStore.getState();
      snap['SS.Speakers'] = String(ss.speakers?.length || 0);
      snap['SS.Lines'] = String(ss.lines?.length || 0);
      snap['SS.TtsEngine'] = ss.ttsEngine || '?';
      snap['SS.IsGenerating'] = String(ss.isGeneratingTTS || false);
      snap['SS.MusicLibrary'] = String(ss.musicLibrary?.length || 0);
      snap['SS.SfxItems'] = String(ss.sfxItems?.length || 0);
    } catch { /* ignore */ }

    try {
      const erStore = _getStore('editRoomStore');
      if (!erStore) throw new Error('not loaded');
      const er = erStore.getState();
      snap['ER.SubTab'] = er.editRoomSubTab || '?';
      snap['ER.Scenes'] = String(er.sceneOrder?.length || 0);
      snap['ER.Effects'] = String(Object.keys(er.sceneEffects || {}).length);
      snap['ER.Subtitles'] = String(Object.keys(er.sceneSubtitles || {}).length);
      snap['ER.HasBGM'] = String(!!er.bgmConfig?.url);
    } catch { /* ignore */ }

    try {
      const edStore = _getStore('editorStore');
      if (!edStore) throw new Error('not loaded');
      const ed = edStore.getState();
      snap['ED.TimelineLen'] = String(ed.timeline?.length || 0);
      snap['ED.Subtitles'] = String(ed.subtitles?.length || 0);
      snap['ED.Zoom'] = String(ed.zoom || 100);
      snap['ED.ActiveTab'] = ed.activeEditorTab || '?';
    } catch { /* ignore */ }

    try {
      const uiStore = _getStore('uiStore');
      if (!uiStore) throw new Error('not loaded');
      const ui = uiStore.getState();
      const openModals: string[] = [];
      if (ui.showFeedbackModal) openModals.push('feedback');
      if (ui.showApiSettings) openModals.push('apiSettings');
      if (ui.showFullScriptModal) openModals.push('fullScript');
      if (ui.lightboxUrl) openModals.push('lightbox');
      if (ui.showFeedbackHistory) openModals.push('feedbackHistory');
      snap['UI.OpenModals'] = openModals.length > 0 ? openModals.join(', ') : '(none)';
      snap['UI.IsProcessing'] = String(ui.isProcessing || false);
      snap['UI.ProcessingMsg'] = (ui.processingMessage || '').substring(0, 80);
    } catch { /* ignore */ }

    try {
      const authStore = _getStore('authStore');
      if (!authStore) throw new Error('not loaded');
      const auth = authStore.getState();
      snap['Auth.LoggedIn'] = String(!!auth.authUser);
      snap['Auth.Role'] = auth.authUser?.role || '(none)';
      snap['Auth.Checking'] = String(auth.authChecking || false);
    } catch { /* ignore */ }

    try {
      const upStore = _getStore('uploadStore');
      if (!upStore) throw new Error('not loaded');
      const up = upStore.getState();
      snap['UP.Step'] = String(up.currentStep || 0);
      snap['UP.Platforms'] = String(up.selectedPlatforms?.length || 0);
      snap['UP.HasVideo'] = String(!!up.videoFile || !!up.videoUrl);
      const authed: string[] = [];
      if (up.youtubeAuth?.accessToken) authed.push('youtube');
      if (up.tiktokAuth?.accessToken) authed.push('tiktok');
      if (up.instagramAuth?.accessToken) authed.push('instagram');
      snap['UP.AuthedPlatforms'] = authed.length > 0 ? authed.join(', ') : '(none)';
    } catch { /* ignore */ }

    try {
      const vaStore = _getStore('viewAlertStore');
      if (!vaStore) throw new Error('not loaded');
      const va2 = vaStore.getState();
      snap['Alert.Count'] = String(va2.alerts?.length || 0);
      snap['Alert.IsPolling'] = String(va2.isPollingActive || false);
      snap['Alert.Notifications'] = String(va2.notifications?.length || 0);
    } catch { /* ignore */ }

    try {
      const ssStore2 = _getStore('shoppingShortStore');
      if (!ssStore2) throw new Error('not loaded');
      const shs = ssStore2.getState();
      snap['Shop.Step'] = String(shs.currentStep || 0);
      snap['Shop.HasSource'] = String(!!shs.sourceVideo || !!shs.sourceUrl);
      snap['Shop.RenderProgress'] = String(shs.renderProgress || 0);
    } catch { /* ignore */ }

    try {
      const epStore = _getStore('editPointStore');
      if (!epStore) throw new Error('not loaded');
      const ep = epStore.getState();
      snap['EP.Sources'] = String(ep.sourceVideos?.length || 0);
      snap['EP.EdlEntries'] = String(ep.edlEntries?.length || 0);
      snap['EP.Phase'] = ep.processingPhase || 'idle';
    } catch { /* ignore */ }

    try {
      const instStore = _getStore('instinctStore');
      if (!instStore) throw new Error('not loaded');
      const inst = instStore.getState();
      snap['Inst.Mechanisms'] = String(inst.selectedMechanismIds?.length || 0);
      snap['Inst.IsRecommending'] = String(inst.isRecommending || false);
    } catch { /* ignore */ }

    return snap;
  }

  // ══ H. DOM/Rendering Diagnostics ══
  collectDomDiagnostics(): Record<string, string> {
    const snap: Record<string, string> = {};
    try {
      snap['DOM Nodes'] = String(document.querySelectorAll('*').length);
      // Max DOM depth (sample first 200 elements)
      const allElements = document.querySelectorAll('*');
      let maxDepth = 0;
      for (let i = 0; i < Math.min(allElements.length, 200); i++) {
        let depth = 0;
        let node: Node | null = allElements[i];
        while (node && node !== document) { depth++; node = node.parentNode; }
        if (depth > maxDepth) maxDepth = depth;
      }
      snap['DOM Max Depth'] = String(maxDepth);

      // Canvas contexts
      const canvases = document.querySelectorAll('canvas');
      snap['Canvas Elements'] = String(canvases.length);

      // Video/Audio elements
      const videos = document.querySelectorAll('video');
      const audios = document.querySelectorAll('audio');
      snap['Video Elements'] = String(videos.length);
      snap['Audio Elements'] = String(audios.length);

      // iframes
      snap['IFrames'] = String(document.querySelectorAll('iframe').length);

      // CSS animations (approximate)
      const animations = document.getAnimations ? document.getAnimations().length : 0;
      snap['Active Animations'] = String(animations);

      // GPU info (WebGL)
      try {
        const gl = document.createElement('canvas').getContext('webgl');
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            snap['GPU Renderer'] = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '?';
          }
        }
      } catch { /* no webgl */ }

      // Current scroll position
      snap['ScrollY'] = String(Math.round(window.scrollY));
    } catch { /* ignore */ }
    return snap;
  }

  // ══ J. localStorage Detailed Breakdown ══
  collectLocalStorageBreakdown(): string {
    try {
      const entries: { key: string; sizeKB: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const val = localStorage.getItem(key) || '';
          entries.push({ key, sizeKB: Math.round(val.length / 1024 * 10) / 10 });
        }
      }
      entries.sort((a, b) => b.sizeKB - a.sizeKB);
      const total = entries.reduce((sum, e) => sum + e.sizeKB, 0);
      const lines = entries.slice(0, 15).map(e => {
        const pct = total > 0 ? Math.round(e.sizeKB / total * 100) : 0;
        const warn = pct > 50 ? ' ⚠️' : '';
        return `  ${e.key}: ${e.sizeKB}KB (${pct}%)${warn}`;
      });
      return `Total: ${Math.round(total)}KB (${entries.length} keys)\n${lines.join('\n')}`;
    } catch { return '(접근 불가)'; }
  }

  // ══ E. IndexedDB Status ══
  async collectIndexedDbStatus(): Promise<string> {
    try {
      const db = await (await import('idb')).openDB('ai-storyboard-v2');
      const storeNames = Array.from(db.objectStoreNames);
      const lines: string[] = [];
      for (const storeName of storeNames) {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const count = await tx.objectStore(storeName).count();
          lines.push(`  ${storeName}: ${count} records`);
        } catch { lines.push(`  ${storeName}: (read error)`); }
      }
      db.close();
      return `Stores: ${storeNames.length}\n${lines.join('\n')}`;
    } catch { return '(IndexedDB 접근 불가)'; }
  }

  // ══ D. Zustand Persist Rehydration Status ══
  collectPersistStatus(): string {
    const checks: string[] = [];
    const persistKeys = [
      'video-analysis-store', 'navigation-state', 'view-alert-store',
      'SCRIPT_WRITER_DRAFT', 'CHANNEL_PRESETS', 'UPLOAD_PLATFORM_AUTH',
      'SOUND_FAVORITE_MODELS', 'SOUND_FAVORITE_VOICES', 'SHOPPING_SHORT_PROXY_URL',
    ];
    for (const key of persistKeys) {
      try {
        const val = localStorage.getItem(key);
        if (val) {
          const sizeKB = Math.round(val.length / 1024 * 10) / 10;
          // Validate JSON
          try { JSON.parse(val); checks.push(`  ${key}: ✅ ${sizeKB}KB`); }
          catch { checks.push(`  ${key}: ⚠️ ${sizeKB}KB (invalid JSON)`); }
        } else {
          checks.push(`  ${key}: (empty)`);
        }
      } catch { checks.push(`  ${key}: ❌ (access error)`); }
    }
    return checks.join('\n');
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

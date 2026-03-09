
type LogLevel = 'info' | 'error' | 'success' | 'warn';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: LogListener[] = [];

  private addLog(level: LogLevel, message: string, details?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      details
    };
    this.logs = [entry, ...this.logs].slice(0, 100); // Keep last 100 logs
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

  getLogs() {
    return this.logs;
  }

  /** 피드백 첨부용 포맷 문자열 (최신→과거, 에러/경고 우선 표시) */
  exportFormatted(): string {
    if (this.logs.length === 0) return '(로그 없음)';
    return this.logs.map(log => {
      const level = log.level.toUpperCase().padEnd(7);
      const detail = log.details
        ? '\n    ' + (typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)).split('\n').join('\n    ')
        : '';
      return `[${log.timestamp}] ${level} ${log.message}${detail}`;
    }).join('\n');
  }

  /** 에러/경고 로그만 추출 */
  exportErrors(): string {
    const errors = this.logs.filter(l => l.level === 'error' || l.level === 'warn');
    if (errors.length === 0) return '';
    return errors.map(log => {
      const detail = log.details
        ? '\n    ' + (typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)).split('\n').join('\n    ')
        : '';
      return `[${log.timestamp}] ${log.level.toUpperCase()} ${log.message}${detail}`;
    }).join('\n');
  }

  getErrorCount(): number {
    return this.logs.filter(l => l.level === 'error' || l.level === 'warn').length;
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

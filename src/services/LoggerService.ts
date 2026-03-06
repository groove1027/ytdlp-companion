
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

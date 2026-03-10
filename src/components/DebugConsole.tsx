
import React, { useState, useEffect, useRef } from 'react';
import { logger, LogEntry } from '../services/LoggerService';
import { showToast } from '../stores/uiStore';

type FilterCategory = 'all' | 'api' | 'action' | 'system' | 'error';

const FILTER_OPTIONS: { key: FilterCategory; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'api', label: 'api' },
  { key: 'action', label: 'action' },
  { key: 'system', label: 'system' },
  { key: 'error', label: 'error' },
];

const DebugConsole: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const [copySuccess, setCopySuccess] = useState(false); // [NEW] Copy Feedback
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');

  // D-1: Only subscribe to logs when console is open
  useEffect(() => {
    if (!isOpen) return;
    setLogs(logger.getLogs());
    return logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
  }, [isOpen]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
      case 'warn': return 'text-yellow-400';
      default: return 'text-blue-400';
    }
  };

  // [NEW] Copy Logs Function
  const handleCopyLogs = () => {
      const text = logs.map(l => {
          let detailStr = '';
          if (l.details) {
              try {
                  detailStr = typeof l.details === 'string' ? l.details : JSON.stringify(l.details, null, 2);
              } catch (e) { detailStr = '[Circular]'; }
          }
          return `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message} ${detailStr ? `\n${detailStr}` : ''}`;
      }).join('\n----------------------------------------\n');

      navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
      }).catch(err => showToast("로그 복사 실패: " + err, 3000));
  };

  // [NEW] Filter logs by category
  const filteredLogs = filterCategory === 'all'
    ? logs
    : filterCategory === 'error'
      ? logs.filter(l => l.level === 'error' || l.level === 'warn')
      : logs.filter(l => l.category === filterCategory);

  // [NEW] Download logs as .txt file
  const handleDownloadLogs = () => {
    const content = logger.exportFormatted();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `debug-log-${logger.sessionId}-${dateStr}.txt`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="font-mono">
      <div className="w-full flex flex-col">
          {/* Tab/Handle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-full px-3 py-2 bg-gray-900/80 border border-gray-700/50 rounded-lg text-xs font-bold text-gray-400 flex items-center gap-2 hover:bg-gray-800 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${logs.some(l => l.level === 'error') ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
            <span className="truncate">디버그 로그</span>
            <span className={`ml-auto text-xs text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {/* Console Panel */}
          <div
            className={`w-full bg-gray-950 border border-gray-800 rounded-b-lg transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'h-52 mt-1' : 'h-0'}`}
          >
            <div className="px-2 py-1 border-b border-gray-900 flex flex-col gap-1 bg-gray-900/50">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">API CONSOLE</span>
                <div className="flex gap-1.5">
                    <button
                        onClick={handleCopyLogs}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${copySuccess ? 'bg-green-600 text-white' : 'text-blue-400 hover:text-white hover:bg-gray-800'}`}
                    >
                        {copySuccess ? "✅ 복사됨" : "📋 복사"}
                    </button>
                    <button
                        onClick={handleDownloadLogs}
                        className="text-[10px] px-1.5 py-0.5 rounded text-blue-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                        ⬇ 저장
                    </button>
                    <button onClick={() => logger.clear()} className="text-[10px] text-gray-600 hover:text-gray-400">Clear</button>
                </div>
              </div>
              <div className="flex gap-1">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFilterCategory(opt.key)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                      filterCategory === opt.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-2 py-1 h-full overflow-y-auto space-y-0.5 custom-scrollbar text-left">
              {filteredLogs.length === 0 ? (
                <div className="text-gray-700 text-[10px] italic">{filterCategory === 'all' ? 'No logs captured yet.' : `No "${filterCategory}" logs.`}</div>
              ) : (
                filteredLogs.map((log, i) => (
                  <div key={i} className="text-[11px] leading-snug border-b border-gray-900/50 pb-0.5 last:border-0">
                    <span className="text-gray-600">[{log.timestamp.substring(11, 23)}]</span>{' '}
                    <span className={`font-bold uppercase mr-1 ${getLevelColor(log.level)}`}>{log.level}</span>
                    {log.category && <span className="text-gray-600 mr-1">[{log.category}]</span>}
                    <span className="text-gray-300">{log.message}</span>
                    {log.duration != null && <span className="text-gray-600 ml-1">({log.duration}ms)</span>}
                    {log.details && (
                      <pre className="mt-0.5 p-1 bg-black/40 rounded text-[9px] text-gray-500 overflow-x-auto whitespace-pre-wrap">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
      </div>
    </div>
  );
};

export default DebugConsole;

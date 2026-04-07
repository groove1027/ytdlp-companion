import React, { useEffect, useRef, useState } from 'react';
import type { CompanionCaptureResult } from '../types';
import { scanLibrary, type LibraryScanResult } from '../services/companion/libraryClient';
import { captureScreen } from '../services/companion/captureClient';
import {
  isPrivacyModeEnabled,
  PRIVACY_MODE_CHANGE_EVENT,
  uploadMediaToHosting,
  VIDEO_ANALYSIS_MAX_BYTES,
  VIDEO_ANALYSIS_MAX_MB_LABEL,
  VIDEO_ANALYSIS_SIZE_HINT,
} from '../services/uploadService';
import { isCompanionDetected, recheckCompanion } from '../services/ytdlpApiService';
import { showToast, useUIStore } from '../stores/uiStore';

const TABS = [
  { id: 'scan', icon: '📁', label: '폴더 스캔' },
  { id: 'capture', icon: '📸', label: '화면 캡처' },
  { id: 'drop', icon: '📤', label: '파일 드롭' },
] as const;

const directoryInputProps: React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory?: string; directory?: string } = {
  type: 'file',
  className: 'hidden',
  webkitdirectory: '',
  directory: '',
};

const formatBytes = (size: number): string => {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
};

const getScanDirFromFile = (file: File): string | null => {
  const path = (file as File & { path?: string }).path;
  if (!path) return null;
  const relative = (file.webkitRelativePath || file.name).trim();
  const sep = path.includes('\\') ? '\\' : '/';
  const normalizedRelative = relative.split('/').join(sep);
  if (path.endsWith(normalizedRelative)) {
    return path.slice(0, -normalizedRelative.length).replace(/[\\/]+$/, '');
  }
  const lastSep = path.lastIndexOf(sep);
  return lastSep > 0 ? path.slice(0, lastSep) : null;
};

const getPreviewNode = (url: string, mime: string): React.ReactNode => {
  if (mime.startsWith('image/')) return <img src={url} alt="preview" className="h-40 w-full rounded-xl object-cover" />;
  if (mime.startsWith('video/')) return <video src={url} controls className="h-40 w-full rounded-xl bg-black object-cover" />;
  if (mime.startsWith('audio/')) return <audio src={url} controls className="w-full" />;
  return <a href={url} target="_blank" rel="noreferrer" className="text-sm text-blue-300 underline">미리보기 열기</a>;
};

const hasBlockingOverlay = (widgetRoot: HTMLElement | null): boolean => {
  if (typeof document === 'undefined') return false;
  const candidates = document.querySelectorAll<HTMLElement>('.fixed.inset-0, [role="dialog"], [aria-modal="true"], [data-api-settings]');
  return Array.from(candidates).some((node) => {
    if (widgetRoot && (node === widgetRoot || node.contains(widgetRoot) || widgetRoot.contains(node))) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    const zIndex = Number.parseInt(style.zIndex || '0', 10);
    if (!Number.isFinite(zIndex) || zIndex < 40) return false;
    const rect = node.getBoundingClientRect();
    return rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8;
  });
};

const useCompanionWidgetStatus = () => {
  const [companionReady, setCompanionReady] = useState<boolean>(() => isCompanionDetected());
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => isPrivacyModeEnabled());

  useEffect(() => {
    let cancelled = false;

    const syncPrivacy = () => {
      if (!cancelled) setPrivacyMode(isPrivacyModeEnabled());
    };
    const syncCompanion = () => {
      if (!cancelled) setCompanionReady(isCompanionDetected());
    };
    const refreshCompanion = async () => {
      try {
        const available = await recheckCompanion();
        if (!cancelled) setCompanionReady(available);
      } catch {
        if (!cancelled) setCompanionReady(false);
      }
    };
    const handleFocus = () => {
      syncPrivacy();
      syncCompanion();
      void refreshCompanion();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'PRIVACY_MODE_ENABLED') syncPrivacy();
    };
    const handlePrivacyChange = (event: Event) => {
      const next = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      if (!cancelled) setPrivacyMode(typeof next === 'boolean' ? next : isPrivacyModeEnabled());
    };

    syncPrivacy();
    syncCompanion();
    void refreshCompanion();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(PRIVACY_MODE_CHANGE_EVENT, handlePrivacyChange as EventListener);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = window.setInterval(() => { void refreshCompanion(); }, 10_000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PRIVACY_MODE_CHANGE_EVENT, handlePrivacyChange as EventListener);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(timer);
    };
  }, []);

  const ensureCompanionReady = async (): Promise<boolean> => {
    if (companionReady) return true;
    const available = await recheckCompanion().catch(() => false);
    setCompanionReady(available);
    return available;
  };

  return { companionReady, privacyMode, ensureCompanionReady };
};

const useWidgetOverlayState = (widgetRootRef: React.RefObject<HTMLDivElement>) => {
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let frame = 0;
    const refreshOverlayState = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setOverlayOpen(hasBlockingOverlay(widgetRootRef.current));
      });
    };
    refreshOverlayState();
    const observer = new MutationObserver(refreshOverlayState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'open'],
    });
    window.addEventListener('resize', refreshOverlayState);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', refreshOverlayState);
    };
  }, [widgetRootRef]);

  return overlayOpen;
};

const DragDropAIWidget: React.FC = () => {
  const widgetRootRef = useRef<HTMLDivElement | null>(null);
  const storeModalOpen = useUIStore((s) =>
    !!s.lightboxUrl || !!s.smartErrorContext || !!s.feedbackPrefilledContext || s.showApiSettings
    || s.showFeedbackModal || s.showFeedbackHistory || s.showProfileModal || s.showWatermarkModal
    || s.showHelpGuide || s.showAuthGateModal || s.showCompanionGate || s.showTrialGuide
    || s.showFullScriptModal || s.isProcessing);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'scan' | 'capture' | 'drop'>('scan');
  const [dirPath, setDirPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState<LibraryScanResult | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [captureResult, setCaptureResult] = useState<CompanionCaptureResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dropError, setDropError] = useState('');
  const [dropAsset, setDropAsset] = useState<{ name: string; url: string; mime: string; sizeBytes: number } | null>(null);
  const { companionReady, privacyMode, ensureCompanionReady } = useCompanionWidgetStatus();
  const overlayOpen = useWidgetOverlayState(widgetRootRef);

  const onAnalyze = (source: string, payload: unknown) => {
    console.log('[DragDropAIWidget] AI analyze placeholder', { source, payload });
    showToast('AI 분석 연결은 다음 PR에서 이어집니다.', 2200);
  };

  const runScan = async (nextDir = dirPath) => {
    const trimmed = nextDir.trim();
    if (!trimmed) return showToast('폴더 경로를 입력해주세요.', 2500);
    if (!(await ensureCompanionReady())) return showToast('헬퍼 v2.0+가 필요합니다.', 3000);
    setIsScanning(true);
    setScanError('');
    setScanResult(null);
    try {
      const result = await scanLibrary(trimmed, { filter: 'all', recursive: true, maxResults: 200 });
      setDirPath(trimmed);
      setScanResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '라이브러리 스캔 실패';
      setScanError(message);
      showToast(message, 4000);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFolderPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const scannedDir = getScanDirFromFile(file);
    if (!scannedDir) return showToast('절대 경로를 읽지 못했습니다. 아래 입력칸에 직접 경로를 넣어주세요.', 4000);
    setDirPath(scannedDir);
    await runScan(scannedDir);
  };

  const handleCapture = async () => {
    if (!(await ensureCompanionReady())) return showToast('헬퍼 v2.0+가 필요합니다.', 3000);
    setIsCapturing(true);
    setCaptureError('');
    setCaptureResult(null);
    try {
      let result: CompanionCaptureResult;
      try {
        result = await captureScreen({ target: 'screen', format: 'base64' });
      } catch {
        result = await captureScreen({ target: 'screen', format: 'tunnel' });
        showToast('base64 캡처가 실패해 터널 응답으로 전환했습니다.', 2600);
      }
      setCaptureResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '화면 캡처 실패';
      setCaptureError(message);
      showToast(message, 4000);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDropFile = async (file: File) => {
    setIsUploading(true);
    setDropError('');
    setDropAsset(null);
    // [v2.0.1] 영상 파일은 100MB 한도 사전 차단 (이미지/PDF/오디오는 제한 없이 업로드 가능)
    if (file.type.startsWith('video/') && file.size > VIDEO_ANALYSIS_MAX_BYTES) {
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      const message =
        `🎬 ${file.name} (${sizeMb}MB)는 ${VIDEO_ANALYSIS_MAX_MB_LABEL}를 초과해 AI 영상 분석에 사용할 수 없어요. ` +
        `1080p 약 5~8분 / 720p 약 10~15분이 한도입니다. 화질을 낮추거나 짧게 잘라서 다시 시도해주세요.`;
      setDropError(message);
      showToast(message, 9000);
      setIsUploading(false);
      return;
    }
    try {
      const url = await uploadMediaToHosting(file);
      setDropAsset({ name: file.name, url, mime: file.type || 'application/octet-stream', sizeBytes: file.size });
    } catch (error) {
      const message = error instanceof Error ? error.message : '파일 업로드 실패';
      setDropError(message);
      showToast(message, 4000);
    } finally {
      setIsUploading(false);
    }
  };

  const capturePreviewUrl = captureResult?.format === 'base64'
    ? `data:${captureResult.mime || 'image/png'};base64,${captureResult.data || ''}`
    : captureResult?.url || '';
  const modalOpen = storeModalOpen || overlayOpen;

  return (
    <div ref={widgetRootRef} className={`fixed bottom-6 right-6 z-[9998] flex flex-col items-end gap-3 transition ${modalOpen ? 'opacity-70 blur-[0.5px]' : 'opacity-100'}`}>
      {isOpen && (
        <div className="w-[360px] max-h-[70vh] overflow-hidden rounded-2xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Drag & Drop AI</p>
              <p className="text-[11px] text-gray-400">라이브러리, 화면, 파일을 바로 AI 입력으로 준비합니다.</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg border border-gray-700 px-2 py-1 text-sm text-gray-400 hover:text-white">✕</button>
          </div>
          <div className="space-y-4 overflow-y-auto p-4">
            <div className={`rounded-xl border px-3 py-2 text-xs ${companionReady ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200' : privacyMode ? 'border-red-500/50 bg-red-950/40 text-red-200' : 'border-amber-500/40 bg-amber-950/30 text-amber-200'}`}>
              {companionReady ? '헬퍼 연결됨' : privacyMode ? '헬퍼 v2.0+ 필요 · Privacy Mode ON' : '헬퍼 v2.0+ 필요'}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-xl border px-2 py-2 text-xs font-medium transition ${activeTab === tab.id ? 'border-blue-500/40 bg-blue-600/20 text-blue-100' : 'border-gray-700 bg-gray-800/80 text-gray-300 hover:border-gray-600'}`}
                >
                  <div className="text-lg">{tab.icon}</div>
                  <div>{tab.label}</div>
                </button>
              ))}
            </div>

            {activeTab === 'scan' && (
              <div className="space-y-3">
                <input {...directoryInputProps} ref={folderInputRef} onChange={(event) => { void handleFolderPick(event); }} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => folderInputRef.current?.click()} className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">폴더 선택</button>
                  <button type="button" onClick={() => { void runScan(); }} disabled={isScanning} className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isScanning ? '스캔 중' : '스캔'}</button>
                </div>
                <input value={dirPath} onChange={(event) => setDirPath(event.target.value)} placeholder="/Users/name/Movies/B-roll" className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-blue-500/50" />
                {scanError && <p className="text-xs text-red-300">{scanError}</p>}
                {scanResult && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">{scanResult.dir} · {scanResult.files.length}/{scanResult.totalFound}개 {scanResult.truncated ? '(일부만 표시)' : ''}</p>
                    {scanResult.files.map((file) => (
                      <div key={file.path} className="rounded-xl border border-gray-800 bg-gray-800/70 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p title={file.name} className="truncate text-sm font-medium text-white">{file.name}</p>
                            <p title={file.path} className="truncate text-[11px] text-gray-400">{file.path}</p>
                            <p className="mt-1 text-[11px] text-gray-500">{file.mime} · {formatBytes(file.sizeBytes)}</p>
                          </div>
                          <button type="button" onClick={() => onAnalyze('library-file', file)} className="rounded-lg border border-blue-500/40 bg-blue-600/20 px-3 py-1 text-xs text-blue-100">AI 분석</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'capture' && (
              <div className="space-y-3">
                <button type="button" onClick={() => { void handleCapture(); }} disabled={isCapturing} className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{isCapturing ? '캡처 중...' : '현재 화면 캡처'}</button>
                {captureError && <p className="text-xs text-red-300">{captureError}</p>}
                {captureResult && (
                  <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-800/70 p-3">
                    {capturePreviewUrl && getPreviewNode(capturePreviewUrl, captureResult.mime || 'image/png')}
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{captureResult.format === 'base64' ? 'base64 응답' : 'tunnel 응답'}</span>
                      <span>{formatBytes(captureResult.sizeBytes)}</span>
                    </div>
                    <button type="button" onClick={() => onAnalyze('screen-capture', captureResult)} className="w-full rounded-xl border border-blue-500/40 bg-blue-600/20 px-3 py-2 text-sm text-blue-100">AI 분석</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'drop' && (
              <div className="space-y-3">
                <div
                  onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) void handleDropFile(file);
                  }}
                  className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center text-sm transition ${isDragging ? 'border-blue-400 bg-blue-500/10 text-blue-100' : 'border-gray-700 bg-gray-800/60 text-gray-300'}`}
                >
                  <p className="text-base font-medium">파일을 여기로 드롭</p>
                  <p className="mt-1 text-xs text-gray-500">5MB+는 wrapper가 터널/Cloudinary 경로를 자동 선택합니다.</p>
                  <p data-video-size-hint className="mt-2 text-[11px] text-amber-300/80">⚠️ {VIDEO_ANALYSIS_SIZE_HINT}</p>
                </div>
                {dropError && <p className="text-xs text-red-300">{dropError}</p>}
                {isUploading && <p className="text-xs text-gray-400">업로드 중...</p>}
                {dropAsset && (
                  <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-800/70 p-3">
                    {getPreviewNode(dropAsset.url, dropAsset.mime)}
                    <div className="text-xs text-gray-400">
                      <p title={dropAsset.name} className="truncate text-gray-200">{dropAsset.name}</p>
                      <p title={dropAsset.url} className="truncate">{dropAsset.url}</p>
                      <p className="mt-1">{formatBytes(dropAsset.sizeBytes)}</p>
                    </div>
                    <button type="button" onClick={() => onAnalyze('dropped-file', dropAsset)} className="w-full rounded-xl border border-blue-500/40 bg-blue-600/20 px-3 py-2 text-sm text-blue-100">AI 분석</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-600 bg-gradient-to-br from-gray-800 to-gray-950 text-2xl shadow-2xl transition hover:scale-[1.03]"
        aria-label="Drag & Drop AI 위젯 열기"
      >
        {isOpen ? '✕' : '🧠'}
      </button>
    </div>
  );
};

export default DragDropAIWidget;

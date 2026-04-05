import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCompanionDownloadUrl, getCompanionOsLabel } from '../constants';
import { recheckCompanion, tryLaunchCompanion } from '../services/ytdlpApiService';
import { useUIStore } from '../stores/uiStore';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

const COMPANION_FEATURES = [
  { icon: '📥', title: 'yt-dlp 고속 다운로드', description: 'YouTube, Instagram, TikTok 등 원본 품질 다운로드' },
  { icon: '🎙️', title: 'Whisper 전사', description: '로컬 STT로 긴 영상도 빠르게 텍스트 추출' },
  { icon: '🔊', title: 'Edge TTS', description: '무료 다국어 음성 합성으로 나레이션 생성' },
  { icon: '✂️', title: 'rembg 배경 제거', description: 'API 크레딧 없이 이미지 배경 제거' },
  { icon: '🎬', title: 'FFmpeg 렌더링', description: '내보내기, 합치기, 변환을 네이티브 속도로 처리' },
  { icon: '🎞️', title: 'NLE 연동', description: 'CapCut, Premiere, Filmora용 프로젝트 전달' },
  { icon: '🪄', title: 'ProPainter 보정', description: '지우기와 복원 계열 후처리를 로컬에서 실행' },
  { icon: '🖼️', title: '이미지 검색', description: '참고 이미지 수집과 보조 자료 탐색' },
  { icon: '🧩', title: '프레임 추출', description: '영상 분석용 썸네일과 샘플 프레임 생성' },
] as const;

const TROUBLESHOOTING_ITEMS = [
  '트레이 아이콘에 올인원 헬퍼가 떠 있는지 확인하세요.',
  '처음 실행 시 macOS 또는 Windows 방화벽 허용 팝업을 승인하세요.',
  '로컬 포트 9876이 차단되면 감지되지 않습니다.',
] as const;

export default function CompanionGateModal() {
  const setShowCompanionGate = useUIStore((state) => state.setShowCompanionGate);
  const [statusMessage, setStatusMessage] = useState('올인원 헬퍼 실행을 자동으로 시도하고 있습니다.');
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(false);
  const checkInFlightRef = useRef(false);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const osLabel = getCompanionOsLabel();
  const downloadUrl = getCompanionDownloadUrl();
  const downloadLabel = useMemo(() => {
    if (osLabel === 'macOS') return 'macOS 다운로드';
    if (osLabel === 'Windows') return 'Windows 다운로드';
    return '다운로드';
  }, [osLabel]);

  useEffect(() => {
    isMountedRef.current = true;
    const prevOverflow = document.body.style.overflow;
    const prevActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    const focusPrimaryAction = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = getFocusableElements(dialog);
      (focusables[0] ?? dialog).focus();
    };

    focusPrimaryAction();

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(dialog);
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const currentIndex = activeElement ? focusables.indexOf(activeElement) : -1;
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
        : (currentIndex === -1 || currentIndex === focusables.length - 1 ? 0 : currentIndex + 1);

      event.preventDefault();
      event.stopPropagation();
      focusables[nextIndex]?.focus();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || !(event.target instanceof Node) || dialog.contains(event.target)) return;
      focusPrimaryAction();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.body.style.overflow = prevOverflow;
      prevActiveElement?.focus();
    };
  }, []);

  const detectCompanion = useCallback(async (reason: 'auto' | 'poll' | 'manual') => {
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setIsChecking(true);

    if (reason === 'poll') {
      setStatusMessage('헬퍼 앱 실행 여부를 다시 확인하고 있습니다.');
    } else if (reason === 'manual') {
      setStatusMessage('헬퍼 앱 실행을 다시 시도하고 있습니다.');
    }

    const detected = await recheckCompanion().catch(() => false);
    if (!isMountedRef.current) {
      checkInFlightRef.current = false;
      return;
    }

    setLastCheckedAt(Date.now());
    setIsChecking(false);
    checkInFlightRef.current = false;

    if (detected) {
      setStatusMessage('헬퍼 앱이 감지되었습니다. 곧 작업 화면으로 돌아갑니다.');
      setShowCompanionGate(false);
      return;
    }

    if (reason === 'manual') {
      setStatusMessage('아직 감지되지 않았습니다. 트레이 아이콘과 방화벽 설정을 확인해 주세요.');
      return;
    }

    setStatusMessage('헬퍼 앱을 찾지 못했습니다. 5초 간격으로 자동 재감지를 계속합니다.');
  }, [setShowCompanionGate]);

  const scheduleFollowUpCheck = useCallback((reason: 'auto' | 'manual') => {
    if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
    followUpTimerRef.current = setTimeout(() => {
      followUpTimerRef.current = null;
      void detectCompanion(reason);
    }, 1500);
  }, [detectCompanion]);

  useEffect(() => {
    tryLaunchCompanion();
    scheduleFollowUpCheck('auto');

    const pollInterval = setInterval(() => {
      void detectCompanion('poll');
    }, 5000);

    return () => {
      checkInFlightRef.current = false;
      if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
      clearInterval(pollInterval);
    };
  }, [detectCompanion, scheduleFollowUpCheck]);

  const handleLaunch = () => {
    tryLaunchCompanion();
    setStatusMessage('헬퍼 앱 실행을 다시 시도하고 있습니다.');
    scheduleFollowUpCheck('manual');
  };

  return (
    <div
      className="fixed inset-0 z-[10050] bg-gray-950/98 backdrop-blur-md text-white"
      onClickCapture={(event) => event.stopPropagation()}
      onMouseDownCapture={(event) => event.stopPropagation()}
    >
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-7xl items-center justify-center px-4 py-8">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="companion-gate-title"
            tabIndex={-1}
            className="w-full overflow-hidden rounded-3xl border border-gray-700 bg-gray-900 shadow-[0_40px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="border-b border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800/70 px-6 py-8 md:px-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">
                Companion Required
              </div>
              <div className="mt-5 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <h1 id="companion-gate-title" className="text-3xl font-black tracking-tight text-white md:text-4xl">
                    올인원 헬퍼가 실행되어야 작업을 계속할 수 있습니다.
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300 md:text-lg">
                    이 앱의 핵심 제작 파이프라인은 로컬 컴패니언 앱을 전제로 동작합니다.
                    페이지를 열 때마다 자동 감지를 시도하며, 감지되면 이 화면은 자동으로 닫힙니다.
                  </p>
                  <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${isChecking ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'border-orange-500/40 bg-orange-500/10 text-orange-300'}`}>
                        {isChecking ? '⏳' : '⚡'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{statusMessage}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          로컬 감지 주소: <span className="font-mono text-gray-300">http://127.0.0.1:9876/health</span>
                          {lastCheckedAt ? ` · 마지막 확인 ${new Date(lastCheckedAt).toLocaleTimeString('ko-KR')}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleLaunch}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-violet-500"
                    >
                      <span>실행하기</span>
                      <span className="text-lg">↗</span>
                    </button>
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-6 py-4 text-base font-bold text-gray-100 transition hover:border-gray-500 hover:bg-gray-700"
                    >
                      <span>{downloadLabel}</span>
                      <span className="text-lg">↓</span>
                    </a>
                  </div>
                </div>
                <div className="rounded-3xl border border-gray-800 bg-gray-950/80 p-5 md:p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Troubleshooting</p>
                  <div className="mt-4 space-y-3">
                    {TROUBLESHOOTING_ITEMS.map((item) => (
                      <div key={item} className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3 text-sm leading-6 text-gray-300">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-8 md:px-10">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">헬퍼 앱이 담당하는 9가지 핵심 기능</h2>
                  <p className="mt-1 text-sm text-gray-400">다운로드, 음성, 렌더링, 분석 보조 기능이 모두 여기에 연결됩니다.</p>
                </div>
                <div className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300">
                  다크 테마 보호 모드
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {COMPANION_FEATURES.map((feature) => (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 px-4 py-4 transition hover:border-gray-700"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-700 bg-gray-800 text-xl">
                        {feature.icon}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{feature.title}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-400">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

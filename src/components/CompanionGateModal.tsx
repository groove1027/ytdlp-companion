import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCompanionDownloadUrl,
  getCompanionLatestVersion,
  getCompanionOsLabel,
  hasCachedCompanionRelease,
  isCompanionReleasePending,
  MIN_REQUIRED_COMPANION_VERSION,
  refreshCompanionRelease,
  waitForInitialReleaseFetch,
} from '../constants';

// [Codex review #5-2] react-hooks/exhaustive-deps 회피 — 컴포넌트 스코프 상수가
// hook 안에 있으면 lint 경고 후보. 모듈 상수로 끌어올림.
const RELEASE_RECHECK_INTERVAL_MS = 180_000;
import {
  getCompanionVersion,
  isCompanionDetected,
  isCompanionOutdated,
  recheckCompanion,
  tryLaunchCompanion,
} from '../services/ytdlpApiService';
import { showToast, useUIStore } from '../stores/uiStore';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const COMPANION_FEATURES = [
  ['📥', 'yt-dlp 고속 다운로드', 'YouTube, Instagram, TikTok 등 원본 품질 다운로드'],
  ['🎙️', 'Whisper 전사', '로컬 STT로 긴 영상도 빠르게 텍스트 추출'],
  ['🔊', 'Edge TTS', '무료 다국어 음성 합성으로 나레이션 생성'],
  ['✂️', 'rembg 배경 제거', 'API 크레딧 없이 이미지 배경 제거'],
  ['🎬', 'FFmpeg 렌더링', '내보내기, 합치기, 변환을 네이티브 속도로 처리'],
  ['🎞️', 'NLE 연동', 'CapCut, Premiere, Filmora용 프로젝트 전달'],
  ['🪄', 'ProPainter 보정', '지우기와 복원 계열 후처리를 로컬에서 실행'],
  ['🖼️', '이미지 검색', '참고 이미지 수집과 보조 자료 탐색'],
  ['🧩', '프레임 추출', '영상 분석용 썸네일과 샘플 프레임 생성'],
] as const;

const MAC_QUARANTINE_COMMAND = 'xattr -dr com.apple.quarantine /Applications/All\\ In\\ One\\ Helper.app';

const MAC_GUIDES = [
  ['방법 1', 'Finder에서 우클릭으로 열기', 'Finder에서 다운로드한 앱 우클릭 → "열기" → 경고창에서 "열기" 버튼'],
  ['방법 2', '시스템 설정에서 그래도 열기', '시스템 설정 → 개인정보 보호 및 보안 → 아래쪽 "그래도 열기" 버튼'],
  ['방법 3', '터미널에서 격리 해제', MAC_QUARANTINE_COMMAND],
] as const;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function getDownloadLabel(osLabel: string): string {
  if (osLabel === 'macOS') return 'macOS 다운로드';
  if (osLabel === 'Windows') return 'Windows 다운로드';
  return '다운로드';
}

function buildStatusMessage(
  mode: 'missing' | 'outdated',
  currentVersion: string | null,
  latestVersion: string,
  reason: 'auto' | 'manual' | 'poll',
  releasePending: boolean,
): string {
  // [FIX] release-pending: GitHub의 latest가 MIN보다 낮은 자기모순 상태.
  // 이 경우 사용자가 다운로드해도 outdated로 다시 떨어지므로 안내 문구를 분리.
  if (releasePending) {
    if (reason === 'manual') return `최신 릴리스 정보를 다시 확인하고 있습니다. (현재 헬퍼 v${currentVersion ?? '?'})`;
    return `새 버전(v${MIN_REQUIRED_COMPANION_VERSION})이 곧 게시됩니다. 잠시 후 자동으로 다시 확인합니다. 현재 헬퍼: v${currentVersion ?? '?'}`;
  }
  if (mode === 'outdated') {
    if (reason === 'manual') return `업데이트 후 다시 확인 중입니다. 현재 감지 버전은 v${currentVersion ?? '?'}입니다.`;
    return `현재 v${currentVersion ?? '?'}가 실행 중입니다. 최소 v${MIN_REQUIRED_COMPANION_VERSION}, 최신 v${latestVersion} 이상이 필요합니다.`;
  }
  if (reason === 'manual') return '헬퍼 앱 실행을 다시 시도하고 있습니다.';
  if (reason === 'poll') return '헬퍼 앱 감지를 다시 확인하고 있습니다.';
  return '올인원 헬퍼 실행을 자동으로 시도하고 있습니다.';
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

function ModeBadge({ mode, releasePending }: { mode: 'missing' | 'outdated'; releasePending: boolean }) {
  if (releasePending) {
    return <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Release Pending</div>;
  }
  const className = mode === 'outdated'
    ? 'border-red-500/40 bg-red-500/15 text-red-200'
    : 'border-orange-500/40 bg-orange-500/15 text-orange-200';
  const label = mode === 'outdated' ? 'Update Required' : 'Companion Required';
  return <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${className}`}>{label}</div>;
}

function VersionPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function MacGatekeeperPanel({ onCopy }: { onCopy: (text: string, label: string) => void }) {
  // [FIX] animate-pulse 제거 — 사용자가 깜빡거림을 싫어함. 정적 강조만 유지.
  return (
    <section className="sticky top-4 z-20 mb-6 overflow-hidden rounded-[28px] border border-yellow-400/40 bg-gradient-to-br from-yellow-500/25 via-orange-500/20 to-red-500/20 p-5 shadow-[0_25px_80px_rgba(255,125,0,0.25)]">
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-yellow-200">⚠️ 처음 실행하면 이 화면이 떠요</p>
          <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">macOS가 Helper 앱을 막아도, 여기 적힌 3가지 방법 중 하나만 하면 바로 실행됩니다.</h2>
          <p className="mt-3 text-base leading-7 text-yellow-50/90">다운로드 직후 한 번만 허용하면 다음부터는 이 경고를 다시 볼 일이 거의 없습니다. 가장 쉬운 방법은 Finder에서 우클릭 후 열기입니다.</p>
        </div>
        <div className="rounded-[24px] border border-white/15 bg-[#ece8e2] p-4 text-gray-900 shadow-2xl">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="rounded-[20px] border border-gray-300 bg-white p-4">
            <p className="text-lg font-black text-gray-900">"All In One Helper"을(를) 열 수 없습니다</p>
            <p className="mt-2 text-sm leading-6 text-gray-700">개발자를 확인할 수 없기 때문에 이 앱을 열 수 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">이 앱에 악성 코드가 없는지 macOS에서 확인할 수 없습니다.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-center text-sm font-semibold text-gray-700">휴지통으로 이동</div>
              <div className="rounded-xl border border-red-300 bg-red-100 px-3 py-2 text-center text-sm font-black text-red-700">취소</div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {MAC_GUIDES.map(([step, title, description]) => (
          <article key={step} className="rounded-3xl border border-white/15 bg-gray-950/70 p-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-gray-900">{step}</span>
              <button type="button" onClick={() => onCopy(description, title)} className="rounded-xl border border-yellow-300/40 bg-yellow-300/10 px-3 py-2 text-xs font-bold text-yellow-100 transition hover:border-yellow-200 hover:bg-yellow-300/20">{step === '방법 3' ? '명령어 복사' : '안내 복사'}</button>
            </div>
            <h3 className="mt-4 text-xl font-black text-white">{title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-yellow-50/90">{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FeatureSection({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <section className="px-6 py-8 md:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">헬퍼 앱이 담당하는 9가지 핵심 기능</h2>
          <p className="mt-1 text-sm text-gray-400">다운로드, 음성, 렌더링, 분석 보조 기능이 모두 여기에 연결됩니다.</p>
        </div>
        <button type="button" onClick={onToggle} className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-100 transition hover:border-gray-500 hover:bg-gray-800">
          {expanded ? '자세히 숨기기' : '자세히 보기'}
        </button>
      </div>
      {expanded && (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {COMPANION_FEATURES.map(([icon, title, description]) => (
            <div key={title} className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-700 bg-gray-800 text-xl">{icon}</div>
                <div>
                  <p className="text-sm font-black text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-400">{description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusCard({
  isChecking,
  lastCheckedAt,
  mode,
  statusMessage,
  releasePending,
}: {
  isChecking: boolean;
  lastCheckedAt: number | null;
  mode: 'missing' | 'outdated';
  statusMessage: string;
  releasePending: boolean;
}) {
  const statusClass = isChecking
    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
    : releasePending
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      : mode === 'outdated'
        ? 'border-red-500/40 bg-red-500/10 text-red-300'
        : 'border-orange-500/40 bg-orange-500/10 text-orange-300';
  const statusIcon = isChecking ? '⏳' : releasePending ? '🕒' : mode === 'outdated' ? '⬆️' : '⚡';
  return (
    <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${statusClass}`}>{statusIcon}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{statusMessage}</p>
          <p className="mt-1 text-xs text-gray-400">로컬 감지 주소: <span className="font-mono text-gray-300">http://127.0.0.1:9876/health</span>{lastCheckedAt ? ` · 마지막 확인 ${new Date(lastCheckedAt).toLocaleTimeString('ko-KR')}` : ''}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({
  downloadUrl,
  mode,
  onLaunch,
  osLabel,
  releasePending,
  liveDetected,
  onRefreshRelease,
}: {
  downloadUrl: string;
  mode: 'missing' | 'outdated';
  onLaunch: () => void;
  osLabel: string;
  releasePending: boolean;
  liveDetected: boolean;
  onRefreshRelease: () => void;
}) {
  // [FIX] release-pending: 다운로드 버튼만 차단 (구버전 무한 루프 방지).
  // 분기 기준은 'mode'가 아니라 'liveDetected' (헬퍼가 실제로 지금 실행 중인지).
  //   - liveDetected=false → 헬퍼 미실행: launch 버튼 노출 (사용자가 이미 호환 헬퍼를
  //     설치하고 실행만 안 한 경우에도 게이트를 직접 클리어할 수 있어야 함)
  //   - liveDetected=true && outdated → 헬퍼는 떠 있으나 구버전: 다운로드만 차단,
  //     무한 루프 방지를 위해 disabled 버튼 표시
  // [Codex review #2-3 회귀: lastKnown 캐시로 인한 mode 오판정 방지]
  if (releasePending) {
    return (
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {!liveDetected ? (
          <button type="button" onClick={onLaunch} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-violet-500"><span>이미 설치되어 있다면 실행하기</span><span className="text-lg">↗</span></button>
        ) : (
          <button type="button" disabled aria-disabled="true" title="새 릴리스가 게시되면 자동으로 활성화됩니다" className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-700/40 to-amber-600/40 px-6 py-4 text-base font-black text-amber-100/70 shadow-lg"><span>새 버전 게시 대기 중</span><span className="text-lg">⏳</span></button>
        )}
        <button type="button" onClick={onRefreshRelease} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-4 text-base font-black text-amber-100 transition hover:border-amber-300 hover:bg-amber-500/20"><span>릴리스 정보 다시 확인</span><span className="text-lg">↻</span></button>
      </div>
    );
  }
  const primaryLabel = mode === 'outdated' ? '최신 버전 다운로드' : '실행하기';
  const secondaryLabel = mode === 'outdated' ? '업데이트 후 다시 확인' : getDownloadLabel(osLabel);
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      {mode === 'outdated' ? (
        <>
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-violet-500"><span>{primaryLabel}</span><span className="text-lg">↓</span></a>
          <button type="button" onClick={onLaunch} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-6 py-4 text-base font-black text-gray-100 transition hover:border-gray-500 hover:bg-gray-700"><span>{secondaryLabel}</span><span className="text-lg">↻</span></button>
        </>
      ) : (
        <>
          <button type="button" onClick={onLaunch} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-4 text-base font-black text-white shadow-lg shadow-blue-900/30 transition hover:from-blue-500 hover:to-violet-500"><span>{primaryLabel}</span><span className="text-lg">↗</span></button>
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-6 py-4 text-base font-black text-gray-100 transition hover:border-gray-500 hover:bg-gray-700"><span>{secondaryLabel}</span><span className="text-lg">↓</span></a>
        </>
      )}
    </div>
  );
}

function TroubleshootingPanel({ mode, releasePending }: { mode: 'missing' | 'outdated'; releasePending: boolean }) {
  return (
    <div className="rounded-3xl border border-gray-800 bg-gray-950/80 p-5 md:p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">Troubleshooting</p>
      <div className="mt-4 space-y-3 text-sm leading-6 text-gray-300">
        {releasePending ? (
          <>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">⏳ 새 버전(v{MIN_REQUIRED_COMPANION_VERSION})이 GitHub에 게시되는 중입니다. 운영팀이 작업 중이며 보통 수 분 내에 완료됩니다.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">현재 헬퍼는 정상 실행 중이지만, 웹앱이 더 새 버전을 요구해서 일시적으로 차단됩니다.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">"릴리스 정보 다시 확인" 버튼을 눌러 즉시 새로고침할 수 있습니다.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">계속 이 화면이 뜨면 운영팀에 문의해 주세요.</div>
          </>
        ) : mode === 'outdated' ? (
          <>
            {/* [FIX] outdated 모드 — 트레이 quit이 가장 흔한 누락 단계라서 1순위로 빨강 강조 */}
            <div className="rounded-2xl border-2 border-red-500/60 bg-red-500/15 px-4 py-3 text-red-100">
              <div className="font-black text-red-100">⚠️ 가장 흔한 원인 — 트레이의 구버전 헬퍼 종료 안 함</div>
              <div className="mt-1 text-red-50/90">새 버전 설치 전에 <strong>반드시 트레이/메뉴바의 기존 헬퍼를 우클릭 → 종료(Quit)</strong>해야 합니다. 그러지 않으면 새 .app을 실행해도 포트 9876을 옛 헬퍼가 점유해서 v{MIN_REQUIRED_COMPANION_VERSION}로 갱신되지 않습니다.</div>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3"><strong className="text-gray-100">올바른 순서:</strong> ① 트레이/메뉴바 헬퍼 종료 → ② 다운로드한 DMG/EXE 설치 → ③ <strong>Applications 폴더로 옮긴 뒤</strong> 새 .app 실행 (DMG 안에서 직접 실행 금지)</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">v{MIN_REQUIRED_COMPANION_VERSION} 이상이 아니면 모든 기능이 계속 차단됩니다.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">macOS는 Gatekeeper 차단 시 위쪽 노란 카드의 3가지 방법 중 하나로 우회.</div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">트레이 아이콘에 올인원 헬퍼가 떠 있는지 확인하세요.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">처음 실행 시 macOS 또는 Windows 방화벽 허용 팝업을 승인하세요.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">로컬 포트 9876이 차단되면 감지되지 않습니다.</div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 px-4 py-3">설치 후 바로 안 열리면 다운로드한 앱을 직접 한 번 실행해 주세요.</div>
          </>
        )}
      </div>
    </div>
  );
}

function useLockedDialog(dialogRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    const focusPrimaryAction = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      (getFocusableElements(dialog)[0] ?? dialog).focus();
    };

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
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const index = active ? focusables.indexOf(active) : -1;
      const nextIndex = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index === -1 || index === focusables.length - 1 ? 0 : index + 1);
      event.preventDefault();
      event.stopPropagation();
      focusables[nextIndex]?.focus();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || !(event.target instanceof Node) || dialog.contains(event.target)) return;
      focusPrimaryAction();
    };

    focusPrimaryAction();
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus();
    };
  }, []);
}

function useCompanionGateRuntime(mode: 'missing' | 'outdated', setShowCompanionGate: (show: boolean) => void) {
  const [statusMessage, setStatusMessage] = useState('올인원 헬퍼 실행을 자동으로 시도하고 있습니다.');
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  // [FIX] release-pending 상태를 컴포넌트가 즉시 인지하도록 별도 state로 보관.
  // 폴링이나 강제 새로고침으로 GitHub 캐시가 갱신되면 이 값도 함께 갱신된다.
  const [releasePending, setReleasePending] = useState<boolean>(() => isCompanionReleasePending());
  const [latestVersion, setLatestVersion] = useState<string>(() => getCompanionLatestVersion() ?? MIN_REQUIRED_COMPANION_VERSION);
  // [FIX] live state — 헬퍼가 실제로 지금 health check에 응답하는지.
  // lastKnown(localStorage) 캐시와 분리해서 ActionButtons 분기에 사용한다.
  const [liveDetected, setLiveDetected] = useState<boolean>(() => isCompanionDetected());
  const mountedRef = useRef(false);
  const checkInFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseRefreshAtRef = useRef<number>(0);

  const syncCompanion = useCallback(async (reason: 'auto' | 'manual' | 'poll') => {
    if (checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setIsChecking(true);
    // [FIX] poll 단계에서는 URL 스킴(allinonehelper://launch) 호출 금지.
    // 5초 폴링마다 launch를 트리거하면 macOS/Windows 프로토콜 프롬프트가
    // 반복 노출되고 포커스가 탈취되는 회귀를 일으킨다. 자동/수동 사용자 의도
    // 호출(auto, manual)에서만 launch한다.
    if (reason !== 'poll') tryLaunchCompanion();

    // [FIX] GitHub 릴리스 정보를 주기적으로 재fetch.
    // - manual: 무조건 force, await로 캐시 갱신 후 상태 계산
    // - poll (cold cache): 첫 fetch가 실패해 캐시가 비어 있으면 자동 복구를 위해 재시도
    // - poll (release-pending): 운영팀 새 릴리스 게시를 빠르게 감지하기 위해 주기적 재fetch
    // - auto: 첫 fetch는 모듈 로드 시 자동으로 시작됨, 여기서는 await만
    //
    // [Codex review #4-1] 'releasePending' state를 dependency로 쓰면 false→true 전이에서
    // syncCompanion이 재생성되고 effect가 재실행돼 force fetch가 한 번 더 나간다.
    // 모듈 캐시(isCompanionReleasePending)를 직접 호출해서 dependency loop를 끊는다.
    //
    // [Codex review #5-1] cold cache + 첫 fetch 실패(rate limit/네트워크 에러) 시
    // 자동 복구가 안 되는 회귀 수정. 캐시가 비어 있으면 release-pending 여부와 무관하게
    // 주기적으로 재시도해야 한다.
    const currentlyPending = isCompanionReleasePending();
    const cacheEmpty = !hasCachedCompanionRelease();
    const now = Date.now();
    if (reason === 'manual') {
      releaseRefreshAtRef.current = now;
      await refreshCompanionRelease(true).catch(() => {});
    } else if ((currentlyPending || cacheEmpty) && now - releaseRefreshAtRef.current > RELEASE_RECHECK_INTERVAL_MS) {
      releaseRefreshAtRef.current = now;
      await refreshCompanionRelease(true).catch(() => {});
    } else if (reason === 'auto') {
      // [FIX] 첫 sync에서는 모듈 로드 시 시작된 fetch가 끝날 때까지 대기.
      // 그래야 첫 렌더에서 stale UI(release-pending인데 일반 missing 안내)가 안 뜬다.
      await waitForInitialReleaseFetch();
    }

    const detected = await recheckCompanion().catch(() => false);
    const nextVersion = getCompanionVersion();
    // [FIX] outdated 모드는 'detected'가 아니라 '알려진 버전이 outdated인지'로 판정.
    // 콜드 스타트(헬퍼 꺼짐 + localStorage 캐시만 존재)에서도 정확한 안내가 떠야 한다.
    const nextMode: 'missing' | 'outdated' = nextVersion && isCompanionOutdated() ? 'outdated' : 'missing';
    const nextLatest = getCompanionLatestVersion() ?? MIN_REQUIRED_COMPANION_VERSION;
    const nextReleasePending = isCompanionReleasePending();

    if (!mountedRef.current) {
      checkInFlightRef.current = false;
      return;
    }

    setLastCheckedAt(Date.now());
    setReleasePending(nextReleasePending);
    setLatestVersion(nextLatest);
    setLiveDetected(detected);
    setStatusMessage(buildStatusMessage(nextMode, nextVersion, nextLatest, reason, nextReleasePending));
    setIsChecking(false);
    checkInFlightRef.current = false;
    if (detected && nextMode !== 'outdated') setShowCompanionGate(false);
    // [Codex review #4-1] releasePending dependency 제거 — false→true 전이에서
    // syncCompanion 재생성으로 인한 추가 force fetch 방지. 내부에서는 모듈 캐시
    // (isCompanionReleasePending)를 직접 조회한다.
  }, [setShowCompanionGate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      checkInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    void syncCompanion('auto');
    const interval = setInterval(() => void syncCompanion('poll'), 5000);
    return () => clearInterval(interval);
  }, [syncCompanion]);

  const handleLaunch = useCallback(() => {
    tryLaunchCompanion();
    setStatusMessage(mode === 'outdated' ? '최신 버전을 설치한 뒤 다시 확인하고 있습니다.' : '헬퍼 앱 실행을 다시 시도하고 있습니다.');
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void syncCompanion('manual');
    }, 1500);
  }, [mode, syncCompanion]);

  // [FIX] release-pending 모드에서 사용자가 명시적으로 GitHub 릴리스 정보를 강제 새로고침할 때 사용.
  // syncCompanion('manual')이 내부적으로 refreshCompanionRelease(true)를 호출하므로 중복 호출 제거.
  const handleRefreshRelease = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    void syncCompanion('manual');
  }, [syncCompanion]);

  return { handleLaunch, handleRefreshRelease, isChecking, lastCheckedAt, latestVersion, liveDetected, releasePending, statusMessage };
}

export default function CompanionGateModal() {
  const setShowCompanionGate = useUIStore((state) => state.setShowCompanionGate);
  const [showFeatures, setShowFeatures] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const osLabel = getCompanionOsLabel();
  const downloadUrl = getCompanionDownloadUrl();
  const currentVersion = getCompanionVersion();
  // [FIX] outdated 모드는 알려진 버전이 outdated일 때 항상 표시 — detected 여부와 무관.
  // 콜드 스타트(헬퍼 꺼짐 + localStorage 캐시만 존재)에서도 즉시 업데이트 안내가 떠야 한다.
  const mode: 'missing' | 'outdated' = currentVersion && isCompanionOutdated() ? 'outdated' : 'missing';

  useLockedDialog(dialogRef);
  const { handleLaunch, handleRefreshRelease, isChecking, lastCheckedAt, latestVersion, liveDetected, releasePending, statusMessage } = useCompanionGateRuntime(mode, setShowCompanionGate);

  // [FIX] release-pending 상태에서는 "현재 < 최신" 자기모순 문구를 띄우지 않는다.
  // 운영팀이 새 릴리스를 게시 중인 일시적 상황임을 명시.
  const title = releasePending
    ? `새 헬퍼 버전(v${MIN_REQUIRED_COMPANION_VERSION}) 게시 대기 중`
    : mode === 'outdated'
      ? `헬퍼 앱 업데이트가 필요합니다. (현재 v${currentVersion ?? '?'} → 최신 v${latestVersion})`
      : '올인원 헬퍼가 실행되어야 작업을 계속할 수 있습니다.';
  const description = releasePending
    ? `웹앱이 v${MIN_REQUIRED_COMPANION_VERSION} 이상을 요구하지만 GitHub에 아직 게시되지 않았습니다. 운영팀이 빌드/배포 중이며 보통 수 분 내에 자동으로 해결됩니다. 계속 머무른다면 새로고침하지 말고 잠시 기다려 주세요.`
    : mode === 'outdated'
      ? `현재 실행 중인 헬퍼는 v${currentVersion ?? '?'}이고 웹앱은 v${MIN_REQUIRED_COMPANION_VERSION} 이상이 필요합니다. 새 버전을 받기만 해서는 갱신되지 않습니다 — 반드시 ① 트레이/메뉴바의 기존 헬퍼를 우클릭 → 종료(Quit) ② 다운로드한 새 DMG/EXE를 Applications 폴더에 설치 ③ 새 헬퍼 실행 순서를 지켜야 자동으로 닫힙니다.`
      : '이 앱의 핵심 제작 파이프라인은 로컬 컴패니언 앱을 전제로 동작합니다. 로그인 후 감지되지 않으면 모든 기능이 차단되며, 감지되는 즉시 이 화면은 자동으로 사라집니다.';

  const handleCopy = useCallback(async (text: string, label: string) => {
    try {
      const copied = await copyText(text);
      showToast(copied ? `${label} 복사 완료` : `${label} 복사 실패`, copied ? 2500 : 4000);
    } catch {
      showToast(`${label} 복사 실패`, 4000);
    }
  }, []);

  return (
    <div className="fixed inset-0 z-[10050] bg-gray-950/98 backdrop-blur-md text-white" onClickCapture={(event) => event.stopPropagation()} onMouseDownCapture={(event) => event.stopPropagation()}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-7xl items-center justify-center px-4 py-8">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="companion-gate-title" tabIndex={-1} className="w-full overflow-hidden rounded-3xl border border-gray-700 bg-gray-900 shadow-[0_40px_120px_rgba(0,0,0,0.65)]">
            <div className="border-b border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800/70 px-6 py-8 md:px-10">
              {osLabel === 'macOS' && <MacGatekeeperPanel onCopy={handleCopy} />}
              <ModeBadge mode={mode} releasePending={releasePending} />
              <div className="mt-5 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <h1 id="companion-gate-title" className="text-3xl font-black tracking-tight text-white md:text-4xl">{title}</h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-gray-300 md:text-lg">{description}</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <VersionPill label="현재 감지 버전" value={currentVersion ? `v${currentVersion}` : '미감지'} />
                    <VersionPill label="최소 요구 버전" value={`v${MIN_REQUIRED_COMPANION_VERSION}`} />
                    <VersionPill label="최신 버전" value={releasePending ? '게시 대기 중' : `v${latestVersion}`} />
                  </div>
                  <StatusCard isChecking={isChecking} lastCheckedAt={lastCheckedAt} mode={mode} statusMessage={statusMessage} releasePending={releasePending} />
                  <ActionButtons downloadUrl={downloadUrl} mode={mode} onLaunch={handleLaunch} osLabel={osLabel} releasePending={releasePending} liveDetected={liveDetected} onRefreshRelease={handleRefreshRelease} />
                </div>
                <TroubleshootingPanel mode={mode} releasePending={releasePending} />
              </div>
            </div>
            <FeatureSection expanded={showFeatures} onToggle={() => setShowFeatures((value) => !value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

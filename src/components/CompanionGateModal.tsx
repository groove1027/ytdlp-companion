import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Film,
  FolderOpen,
  ImageOff,
  Layers,
  Mic,
  Rocket,
  RotateCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Volume2,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
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
import {
  getCompanionVersion,
  isCompanionDetected,
  isCompanionOutdated,
  recheckCompanion,
  tryLaunchCompanion,
} from '../services/ytdlpApiService';
import { showToast, useUIStore } from '../stores/uiStore';

const RELEASE_RECHECK_INTERVAL_MS = 180_000;
// [Defense C] adaptive backoff 스케줄 (ms): 1s → 5s → 10s → 20s → 40s → 60s cap
const COMPANION_POLL_BACKOFF_MS = [1_000, 5_000, 10_000, 20_000, 40_000, 60_000] as const;
const MAC_QUARANTINE_COMMAND = 'xattr -dr com.apple.quarantine /Applications/All\\ In\\ One\\ Helper.app';
const MOTION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const FOCUS_RING_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

type GateMode = 'missing' | 'outdated';
type SyncReason = 'auto' | 'manual' | 'poll';

const FEATURE_ITEMS = [
  { icon: Download, title: 'yt-dlp 고속 다운로드', description: 'YouTube, Instagram, TikTok 등 원본 품질 다운로드', accent: 'oklch(0.74 0.16 70 / 0.32)' },
  { icon: Mic, title: 'Whisper 전사', description: '로컬 STT로 긴 영상도 빠르게 텍스트 추출', accent: 'oklch(0.72 0.15 240 / 0.32)' },
  { icon: Volume2, title: 'Edge TTS', description: '무료 다국어 음성 합성으로 나레이션 생성', accent: 'oklch(0.78 0.15 310 / 0.32)' },
  { icon: ImageOff, title: 'rembg 배경 제거', description: 'API 크레딧 없이 이미지 배경 제거', accent: 'oklch(0.8 0.12 140 / 0.32)' },
  { icon: Film, title: 'FFmpeg 렌더링', description: '내보내기, 합치기, 변환을 네이티브 속도로 처리', accent: 'oklch(0.73 0.16 20 / 0.32)' },
  { icon: FolderOpen, title: 'NLE 연동', description: 'CapCut, Premiere, Filmora용 프로젝트 전달', accent: 'oklch(0.75 0.12 255 / 0.32)' },
  { icon: Wand2, title: 'ProPainter 보정', description: '지우기와 복원 계열 후처리를 로컬에서 실행', accent: 'oklch(0.8 0.18 335 / 0.32)' },
  { icon: Search, title: '이미지 검색', description: '참고 이미지 수집과 보조 자료 탐색', accent: 'oklch(0.78 0.14 185 / 0.32)' },
  { icon: Layers, title: '프레임 추출', description: '영상 분석용 썸네일과 샘플 프레임 생성', accent: 'oklch(0.76 0.13 95 / 0.32)' },
] as const;

const MAC_GUIDES = [
  {
    step: '방법 1',
    title: '시스템 설정에서 "그래도 열기"',
    description: '시스템 설정 → 개인정보 보호 및 보안 → 아래쪽 "그래도 열기" 버튼',
    note: 'macOS 14 Sequoia부터는 이 경로가 가장 확실합니다.',
    actionLabel: '경로 복사',
    copyLabel: '시스템 설정 경로',
    icon: Settings,
    featured: true,
    eyebrow: 'Recommended',
    badge: '현재 macOS 권장',
  },
  {
    step: '방법 2',
    title: 'Finder에서 우클릭 → "열기"',
    description: 'Finder에서 다운로드한 앱 우클릭 → "열기" → 경고창에서 "열기"',
    note: '구버전 macOS 호환용',
    actionLabel: '안내 복사',
    copyLabel: 'Finder 안내',
    icon: ShieldCheck,
    featured: false,
    eyebrow: 'Legacy',
    badge: '구버전 macOS',
  },
  {
    step: '방법 3',
    title: '터미널에서 격리 속성 제거',
    description: MAC_QUARANTINE_COMMAND,
    note: '상급자용',
    actionLabel: '명령어 복사',
    copyLabel: '터미널 명령어',
    icon: Terminal,
    featured: false,
    eyebrow: 'Advanced',
    badge: '상급자',
  },
] as const;

function getDownloadLabel(osLabel: string): string {
  if (osLabel === 'macOS') return 'macOS 다운로드';
  if (osLabel === 'Windows') return 'Windows 다운로드';
  return '다운로드';
}

function buildStatusMessage(
  mode: GateMode,
  currentVersion: string | null,
  latestVersion: string,
  reason: SyncReason,
  releasePending: boolean,
): string {
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

function formatCheckedAt(lastCheckedAt: number | null): string {
  if (!lastCheckedAt) return '아직 확인 기록이 없습니다.';
  return `${new Date(lastCheckedAt).toLocaleTimeString('ko-KR')} 마지막 확인`;
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

function ModeBadge({ mode, releasePending }: { mode: GateMode; releasePending: boolean }) {
  const Icon = releasePending ? Sparkles : mode === 'outdated' ? AlertTriangle : ShieldAlert;
  const label = releasePending ? 'Release Pending' : mode === 'outdated' ? 'Update Required' : 'Companion Required';
  const style = releasePending
    ? { background: 'oklch(0.33 0.08 88 / 0.26)', borderColor: 'oklch(0.76 0.15 82 / 0.32)', color: 'oklch(0.92 0.04 92)' }
    : mode === 'outdated'
      ? { background: 'oklch(0.28 0.11 25 / 0.26)', borderColor: 'oklch(0.68 0.2 28 / 0.36)', color: 'oklch(0.88 0.03 20)' }
      : { background: 'oklch(0.27 0.08 62 / 0.24)', borderColor: 'oklch(0.7 0.15 68 / 0.34)', color: 'oklch(0.9 0.03 95)' };

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] backdrop-blur-xl"
      style={style}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function VersionPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border border-white/10 px-4 py-4 backdrop-blur-xl"
      style={{
        background: 'oklch(0.19 0.014 264 / 0.82)',
        boxShadow: 'inset 0 1px 0 oklch(0.95 0 0 / 0.06)',
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusPanel({
  isChecking,
  lastCheckedAt,
  mode,
  releasePending,
  statusMessage,
}: {
  isChecking: boolean;
  lastCheckedAt: number | null;
  mode: GateMode;
  releasePending: boolean;
  statusMessage: string;
}) {
  const accent = releasePending
    ? 'oklch(0.79 0.15 82 / 0.4)'
    : mode === 'outdated'
      ? 'oklch(0.7 0.2 26 / 0.42)'
      : 'oklch(0.75 0.15 72 / 0.38)';

  return (
    <div
      className="rounded-2xl border border-white/10 p-4 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, oklch(0.2 0.015 264 / 0.9), oklch(0.18 0.014 264 / 0.86))',
        boxShadow: `0 18px 50px -38px ${accent}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
          style={{ background: 'oklch(0.24 0.018 264 / 0.95)', borderColor: accent }}
        >
          {isChecking ? (
            <RotateCw className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
          ) : (
            <Activity className="h-5 w-5 text-white" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-white">
            <span>{statusMessage}</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            로컬 감지 주소: <span className="font-mono text-slate-300">http://127.0.0.1:9876 · 9877/health</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatCheckedAt(lastCheckedAt)}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({
  downloadUrl,
  liveDetected,
  mode,
  onManualAttempt,
  onRefreshRelease,
  osLabel,
  releasePending,
}: {
  downloadUrl: string;
  liveDetected: boolean;
  mode: GateMode;
  onManualAttempt: () => void;
  onRefreshRelease: () => void;
  osLabel: string;
  releasePending: boolean;
}) {
  const secondaryLabel = mode === 'outdated' ? '업데이트 후 다시 확인' : getDownloadLabel(osLabel);

  if (releasePending) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        {!liveDetected ? (
          <button
            type="button"
            onClick={onManualAttempt}
            aria-label="이미 설치되어 있다면 실행하기"
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition',
              'shadow-2xl shadow-black/40 hover:translate-y-[-1px]',
              FOCUS_RING_CLASSES,
            )}
            style={{
              background: 'linear-gradient(135deg, oklch(0.59 0.21 255), oklch(0.63 0.19 300))',
              boxShadow: '0 28px 60px -34px oklch(0.62 0.18 280 / 0.72)',
            }}
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            <span>이미 설치되어 있다면 실행하기</span>
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-label="새 버전 게시 대기 중"
            className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-amber-50/70"
            style={{ background: 'oklch(0.35 0.09 82 / 0.35)', border: '1px solid oklch(0.73 0.15 82 / 0.25)' }}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>새 버전 게시 대기 중</span>
          </button>
        )}
        <button
          type="button"
          onClick={onRefreshRelease}
          aria-label="릴리스 정보 다시 확인"
          className={clsx(
            'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/5',
            FOCUS_RING_CLASSES,
          )}
          style={{ background: 'oklch(0.22 0.017 264 / 0.9)' }}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          <span>릴리스 정보 다시 확인</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {mode === 'outdated' ? (
        <>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="최신 버전 다운로드"
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition',
              'shadow-2xl shadow-black/40 hover:translate-y-[-1px]',
              FOCUS_RING_CLASSES,
            )}
            style={{
              background: 'linear-gradient(135deg, oklch(0.59 0.21 255), oklch(0.63 0.19 300))',
              boxShadow: '0 28px 60px -34px oklch(0.62 0.18 280 / 0.72)',
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>최신 버전 다운로드</span>
            <ExternalLink className="h-4 w-4 opacity-70" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={onManualAttempt}
            aria-label={secondaryLabel}
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/5',
              FOCUS_RING_CLASSES,
            )}
            style={{ background: 'oklch(0.22 0.017 264 / 0.9)' }}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span>{secondaryLabel}</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onManualAttempt}
            aria-label="실행하기"
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition',
              'shadow-2xl shadow-black/40 hover:translate-y-[-1px]',
              FOCUS_RING_CLASSES,
            )}
            style={{
              background: 'linear-gradient(135deg, oklch(0.59 0.21 255), oklch(0.63 0.19 300))',
              boxShadow: '0 28px 60px -34px oklch(0.62 0.18 280 / 0.72)',
            }}
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            <span>실행하기</span>
          </button>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={secondaryLabel}
            className={clsx(
              'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/5',
              FOCUS_RING_CLASSES,
            )}
            style={{ background: 'oklch(0.22 0.017 264 / 0.9)' }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{secondaryLabel}</span>
            <ExternalLink className="h-4 w-4 opacity-70" aria-hidden="true" />
          </a>
        </>
      )}
    </div>
  );
}

/**
 * [v1.3.2] outdated 모드 — OS별 4단계 회복 가이드 (사용자 보고 기반)
 *
 * 사용자가 "다운로드만 누르면 끝"이라고 오해하는 가장 큰 회귀 차단.
 * macOS / Windows OS 자동 감지 + 4단계 번호 카드 + 빨강 강조.
 */
function OutdatedRecoveryStack({
  currentVersion,
  osLabel,
}: {
  currentVersion: string | null;
  osLabel: string;
}) {
  const isWindows = osLabel === 'Windows';
  const isMac = osLabel === 'macOS';

  const step1Title = isWindows
    ? '작업 표시줄 우측 끝(시계 옆) ^ 화살표 → 헬퍼 아이콘 우클릭 → "종료(Exit)"'
    : isMac
      ? '화면 상단 메뉴바 우측 → 올인원 헬퍼 아이콘 우클릭 → "종료(Quit)"'
      : '트레이/메뉴바의 올인원 헬퍼 아이콘 우클릭 → "종료"';
  const step1Fallback = isWindows
    ? '🔍 트레이에 안 보이면? Ctrl + Shift + Esc → 작업 관리자 → "All In One Helper" 검색 → 우클릭 → "작업 끝내기"'
    : isMac
      ? '🔍 메뉴바에 안 보이면? Spotlight(⌘+Space) → "활성 상태 보기" → "all-in-one-helper" → X 버튼으로 종료'
      : '🔍 안 보이면? 작업 관리자 / 활성 상태 보기에서 "all-in-one-helper" 검색 후 종료';
  const step3Title = isWindows
    ? '다운로드한 setup.exe 더블클릭 → 인스톨러 따라가기'
    : isMac
      ? 'DMG 마운트 → .app을 Applications 폴더로 드래그'
      : '다운로드한 인스톨러 실행';
  const step3Warning = isWindows
    ? '⚠️ Windows SmartScreen이 "PC 보호함" 경고를 띄우면: "추가 정보" 클릭 → "실행"'
    : isMac
      ? '⚠️ DMG 안에서 직접 더블클릭 금지. 반드시 Applications 폴더로 옮긴 다음 실행.'
      : '';
  const step4Title = isWindows
    ? '시작 메뉴 → "All In One Helper" 검색 → 실행 (또는 인스톨러 자동 실행)'
    : isMac
      ? 'Applications 폴더에서 새 헬퍼 더블클릭'
      : '새로 설치한 헬퍼 실행';
  const step4Warning = isMac
    ? '⚠️ macOS Gatekeeper 차단 시 → 우측의 노란 카드 3가지 방법 중 하나로 우회'
    : '';

  const steps = [
    { num: '1', title: '옛 헬퍼 완전 종료', body: step1Title, warn: `⚠️ 이 단계를 빼면 새 헬퍼는 시작도 안 됩니다. 옛 v${currentVersion ?? '?'}이 포트 9876을 점유 중이라 새 버전이 차단됩니다.`, hint: step1Fallback },
    { num: '2', title: '아래 "최신 버전 다운로드" 버튼 클릭', body: '오른쪽 상단의 최신 버전 다운로드 버튼을 누르세요.', warn: '', hint: '' },
    { num: '3', title: step3Title, body: '', warn: step3Warning, hint: '' },
    { num: '4', title: step4Title, body: '', warn: step4Warning, hint: '' },
  ];

  return (
    <section
      className="rounded-2xl border-2 p-5 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, oklch(0.22 0.075 25 / 0.88), oklch(0.18 0.05 25 / 0.92))',
        borderColor: 'oklch(0.68 0.2 28 / 0.5)',
        boxShadow: '0 30px 90px -50px oklch(0.7 0.2 28 / 0.45)',
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{
            background: 'oklch(0.52 0.22 28 / 0.85)',
            borderColor: 'oklch(0.7 0.22 28 / 0.65)',
            color: 'oklch(0.98 0.02 20)',
          }}
        >
          🛑 Required
        </span>
        <h3 className="text-lg font-semibold text-white sm:text-xl">다운로드만으로는 절대 갱신 안 됩니다 — 4단계 모두 필수</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-red-100/90">
        창 X 버튼은 hide만 합니다. 실제 옛 헬퍼는 트레이/메뉴바에서 계속 실행 중이며 새 .app 시작을 차단합니다.
        <br />
        <span className="text-xs text-red-100/70">💡 v1.3.2부터는 옛 헬퍼를 자동 종료하지만, 이번 한 번은 손으로 quit해야 합니다 (옛 v{currentVersion ?? '?'}에는 자동화 코드가 없음).</span>
      </p>

      <div className="mt-5 grid gap-3">
        {steps.map((step) => (
          <article
            key={step.num}
            className="rounded-2xl border p-4"
            style={{
              background: 'oklch(0.18 0.04 25 / 0.7)',
              borderColor: 'oklch(0.7 0.18 28 / 0.32)',
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white"
                style={{ background: 'oklch(0.55 0.22 28 / 0.92)' }}
              >
                {step.num}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-white">{step.title}</p>
                {step.body && <p className="mt-1 text-sm leading-6 text-red-50/90">{step.body}</p>}
                {step.warn && (
                  <p
                    className="mt-2 rounded-lg px-3 py-2 text-xs leading-5 text-red-100/85"
                    style={{ background: 'oklch(0.15 0.04 25 / 0.85)' }}
                  >
                    {step.warn}
                  </p>
                )}
                {step.hint && <p className="mt-2 text-xs leading-5 text-red-100/65">{step.hint}</p>}
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-red-200/70">✓ 4단계를 모두 마치면 이 화면은 자동으로 닫힙니다.</p>
    </section>
  );
}

function InfoStack({ mode, releasePending }: { mode: GateMode; releasePending: boolean }) {
  const items = releasePending
    ? [
        `새 버전(v${MIN_REQUIRED_COMPANION_VERSION})이 GitHub에 게시되는 중입니다. 운영팀 작업이 끝나면 자동으로 감지됩니다.`,
        '현재 헬퍼는 실행 중이어도 웹앱이 더 높은 버전을 요구하면 일시적으로 차단됩니다.',
        '"릴리스 정보 다시 확인" 버튼으로 즉시 재조회할 수 있습니다.',
        '오래 머무르면 새로고침하지 말고 잠시 기다려 주세요.',
      ]
    : mode === 'outdated'
      ? [
          // [v1.3.2] OutdatedRecoveryStack가 4단계 가이드를 본문 상단에 표시하므로,
          // 여기서는 보조 정보만 짧게 노출. 중복 제거.
          `v${MIN_REQUIRED_COMPANION_VERSION} 이상이 아니면 모든 기능이 계속 차단됩니다.`,
          'v1.3.2 이상부터는 새 헬퍼 시작 시 옛 헬퍼 자동 종료 (이번 한 번은 손으로).',
          '계속 안 되면 작업 관리자 / 활성 상태 보기에서 "all-in-one-helper" 강제 종료.',
        ]
      : [
          '트레이 또는 메뉴바에 올인원 헬퍼가 떠 있는지 먼저 확인하세요.',
          '처음 실행 시 보안 허용 팝업을 승인하지 않으면 감지되지 않습니다.',
          '로컬 포트 9876이 차단되면 health check가 실패합니다.',
          '설치 직후 안 뜨면 다운로드한 앱을 직접 한 번 실행해 주세요.',
        ];

  return (
    <section
      className="rounded-2xl border border-white/10 p-5 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, oklch(0.19 0.014 264 / 0.88), oklch(0.17 0.013 264 / 0.9))',
        boxShadow: '0 28px 80px -56px oklch(0.72 0.12 260 / 0.3)',
      }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-200" aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Troubleshooting</p>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item, index) => (
          <div
            key={item}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm leading-6 text-slate-200"
            style={{
              background: index === 0 ? 'oklch(0.24 0.028 72 / 0.16)' : 'oklch(0.21 0.015 264 / 0.75)',
              borderColor: index === 0 ? 'oklch(0.74 0.14 72 / 0.24)' : 'oklch(1 0 0 / 0.08)',
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function MethodCard({
  copiedKey,
  guide,
  onCopy,
}: {
  copiedKey: string | null;
  guide: (typeof MAC_GUIDES)[number];
  onCopy: (text: string, label: string, key: string) => void;
}) {
  const Icon = guide.icon;
  const isCopied = copiedKey === guide.step;

  return (
    <article
      className={clsx(
        'rounded-2xl border border-white/10 p-5 backdrop-blur-xl',
        guide.featured && 'lg:col-span-2',
      )}
      style={{
        background: guide.featured
          ? 'linear-gradient(135deg, oklch(0.26 0.05 84 / 0.82), oklch(0.22 0.03 264 / 0.86))'
          : 'oklch(0.19 0.014 264 / 0.86)',
        boxShadow: guide.featured
          ? '0 24px 70px -42px oklch(0.79 0.15 82 / 0.55)'
          : '0 18px 40px -34px oklch(0.72 0.09 250 / 0.4)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-white"
            style={{
              background: guide.featured ? 'oklch(0.68 0.16 82 / 0.16)' : 'oklch(0.24 0.018 264 / 0.92)',
              borderColor: guide.featured ? 'oklch(0.79 0.15 82 / 0.32)' : 'oklch(1 0 0 / 0.08)',
            }}
          >
            <span className="text-base font-semibold">{guide.step.replace('방법 ', '')}</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{guide.step}</span>
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{
                  background: guide.featured ? 'oklch(0.7 0.15 82 / 0.14)' : 'oklch(0.28 0.03 264 / 0.56)',
                  borderColor: guide.featured ? 'oklch(0.78 0.14 82 / 0.26)' : 'oklch(1 0 0 / 0.08)',
                  color: guide.featured ? 'oklch(0.95 0.03 92)' : 'oklch(0.86 0.01 255)',
                }}
              >
                {guide.badge}
              </span>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-white">{guide.title}</h3>
          </div>
        </div>
        <div
          className="hidden rounded-2xl border border-white/10 p-2 text-slate-300 sm:flex"
          style={{ background: 'oklch(0.23 0.017 264 / 0.8)' }}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>

      {guide.step === '방법 3' ? (
        <div
          className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/55 p-4"
          aria-label="터미널 명령어"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
          <button
            type="button"
            onClick={() => onCopy(guide.description, guide.copyLabel, guide.step)}
            aria-label="명령어 복사"
            className={clsx(
              'absolute right-3 top-3 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/5',
              FOCUS_RING_CLASSES,
            )}
            style={{ background: 'oklch(0.19 0.014 264 / 0.94)' }}
          >
            {isCopied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>명령어 복사</span>
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{guide.eyebrow}</p>
          <p className="mt-2 pr-24 text-sm leading-6 text-slate-300">{guide.note}</p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/65 px-4 py-3 font-mono text-sm text-emerald-200">
            <code>{`$ ${guide.description}`}</code>
          </pre>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm leading-6 text-slate-200">{guide.description}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-400">{guide.note}</p>
            <button
              type="button"
              onClick={() => onCopy(guide.description, guide.copyLabel, guide.step)}
              aria-label={guide.actionLabel}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/5',
                FOCUS_RING_CLASSES,
              )}
              style={{ background: 'oklch(0.2 0.015 264 / 0.94)' }}
            >
              {isCopied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{guide.actionLabel}</span>
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function MacGatekeeperPanel({
  copiedKey,
  onCopy,
  shouldReduceMotion,
}: {
  copiedKey: string | null;
  onCopy: (text: string, label: string, key: string) => void;
  shouldReduceMotion: boolean;
}) {
  return (
    <motion.section
      className="overflow-hidden rounded-2xl border border-white/10 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, oklch(0.22 0.026 72 / 0.78), oklch(0.18 0.017 264 / 0.92))',
      }}
      animate={
        shouldReduceMotion
          ? undefined
          : {
              boxShadow: [
                '0 24px 80px -48px oklch(0.76 0.15 82 / 0.45)',
                '0 30px 95px -40px oklch(0.78 0.17 78 / 0.62)',
                '0 24px 80px -48px oklch(0.76 0.15 82 / 0.45)',
              ],
            }
      }
      transition={shouldReduceMotion ? undefined : { duration: 5.5, ease: 'easeInOut', repeat: Infinity }}
    >
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-amber-100"
            style={{ background: 'oklch(0.7 0.15 82 / 0.16)' }}
          >
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">처음 실행하면 이 화면이 떠요</p>
            <h2 className="mt-2 text-balance text-2xl font-semibold text-white">macOS가 Helper 앱을 막아도, 아래 3가지 방법 중 하나면 바로 통과됩니다.</h2>
            <p className="mt-3 text-sm leading-6 text-amber-50/85">
              Sequoia부터는 시스템 설정 경로가 가장 확실합니다. 구버전 macOS는 Finder 우클릭 방식도 계속 사용할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="rounded-2xl border border-white/15 bg-[#ece8e2] p-4 text-slate-900 shadow-2xl shadow-black/25">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="rounded-2xl border border-slate-300 bg-white p-4">
            <p className="text-lg font-semibold text-slate-900">"All In One Helper"을(를) 열 수 없습니다</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">개발자를 확인할 수 없기 때문에 이 앱을 열 수 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">이 앱에 악성 코드가 없는지 macOS에서 확인할 수 없습니다.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-center text-sm font-medium text-slate-700">휴지통으로 이동</div>
              <div className="rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-center text-sm font-semibold text-rose-700">취소</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {MAC_GUIDES.map((guide) => (
            <MethodCard key={guide.step} copiedKey={copiedKey} guide={guide} onCopy={onCopy} />
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function FeatureSection({
  expanded,
  onToggle,
  shouldReduceMotion,
}: {
  expanded: boolean;
  onToggle: () => void;
  shouldReduceMotion: boolean;
}) {
  return (
    <section
      className="rounded-2xl border border-white/10 p-5 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, oklch(0.19 0.014 264 / 0.9), oklch(0.17 0.013 264 / 0.88))',
        boxShadow: '0 28px 80px -56px oklch(0.64 0.11 260 / 0.28)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Capability Map</p>
          <h2 className="mt-2 text-xl font-semibold text-white">헬퍼 앱이 담당하는 9개 핵심 기능</h2>
          <p className="mt-1 text-sm text-slate-400">다운로드, 음성, 렌더링, 분석 보조 기능이 모두 여기에 연결됩니다.</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? '자세히 숨기기' : '자세히 보기'}
          className={clsx(
            'inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5',
            FOCUS_RING_CLASSES,
          )}
          style={{ background: 'oklch(0.21 0.015 264 / 0.88)' }}
        >
          <span>{expanded ? '자세히 숨기기' : '자세히 보기'}</span>
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.15 : 0.28, ease: MOTION_EASE }}
            className="overflow-hidden"
          >
            <motion.div
              className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              initial={shouldReduceMotion ? undefined : 'hidden'}
              animate={shouldReduceMotion ? undefined : 'show'}
              variants={
                shouldReduceMotion
                  ? undefined
                  : {
                      hidden: {},
                      show: { transition: { staggerChildren: 0.05 } },
                    }
              }
            >
              {FEATURE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    variants={
                      shouldReduceMotion
                        ? undefined
                        : {
                            hidden: { opacity: 0, y: 8 },
                            show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: MOTION_EASE } },
                          }
                    }
                    className="rounded-2xl border border-white/10 p-4"
                    style={{
                      background: 'linear-gradient(180deg, oklch(0.2 0.015 264 / 0.82), oklch(0.18 0.014 264 / 0.86))',
                      boxShadow: `0 18px 40px -34px ${item.accent}`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-white"
                        style={{ background: item.accent }}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{item.description}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function shouldRefreshRelease(reason: SyncReason, lastRefreshAt: number): boolean {
  if (reason === 'manual') return true;
  const currentlyPending = isCompanionReleasePending();
  const cacheEmpty = !hasCachedCompanionRelease();
  return (currentlyPending || cacheEmpty) && Date.now() - lastRefreshAt > RELEASE_RECHECK_INTERVAL_MS;
}

function useCompanionGateRuntime(mode: GateMode, setShowCompanionGate: (show: boolean) => void) {
  const [statusMessage, setStatusMessage] = useState('올인원 헬퍼 실행을 자동으로 시도하고 있습니다.');
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [releasePending, setReleasePending] = useState<boolean>(() => isCompanionReleasePending());
  const [latestVersion, setLatestVersion] = useState<string>(() => getCompanionLatestVersion() ?? MIN_REQUIRED_COMPANION_VERSION);
  const [liveDetected, setLiveDetected] = useState<boolean>(() => isCompanionDetected());
  const mountedRef = useRef(false);
  const checkInFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStepRef = useRef(0);
  const resolvedRef = useRef(false);
  const releaseRefreshAtRef = useRef(0);

  const syncCompanion = useCallback(async (reason: SyncReason): Promise<boolean> => {
    if (resolvedRef.current) return true;
    if (checkInFlightRef.current) return false;
    checkInFlightRef.current = true;
    if (mountedRef.current) setIsChecking(true);

    try {
      if (reason !== 'poll') tryLaunchCompanion();
      if (reason === 'auto') {
        await waitForInitialReleaseFetch();
      } else if (shouldRefreshRelease(reason, releaseRefreshAtRef.current)) {
        releaseRefreshAtRef.current = Date.now();
        await refreshCompanionRelease(true).catch(() => {});
      }

      const detected = await recheckCompanion().catch(() => false);
      const nextVersion = getCompanionVersion();
      const nextMode: GateMode = nextVersion && isCompanionOutdated() ? 'outdated' : 'missing';
      const nextLatest = getCompanionLatestVersion() ?? MIN_REQUIRED_COMPANION_VERSION;
      const nextReleasePending = isCompanionReleasePending();

      if (!mountedRef.current) return detected && nextMode !== 'outdated';

      setLastCheckedAt(Date.now());
      setReleasePending(nextReleasePending);
      setLatestVersion(nextLatest);
      setLiveDetected(detected);
      setStatusMessage(buildStatusMessage(nextMode, nextVersion, nextLatest, reason, nextReleasePending));

      const shouldClose = detected && nextMode !== 'outdated';
      if (shouldClose) {
        resolvedRef.current = true;
        if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
        setShowCompanionGate(false);
      }
      return shouldClose;
    } finally {
      checkInFlightRef.current = false;
      if (mountedRef.current) setIsChecking(false);
    }
  }, [setShowCompanionGate]);

  useEffect(() => {
    mountedRef.current = true;
    resolvedRef.current = false;
    return () => {
      mountedRef.current = false;
      resolvedRef.current = false;
      checkInFlightRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // [Defense C] adaptive backoff 폴링 + visibility pause
  useEffect(() => {
    function clearPollTimer() {
      if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
    }
    function scheduleNextPoll() {
      clearPollTimer();
      if (resolvedRef.current || document.visibilityState === 'hidden') return;
      const step = Math.min(pollStepRef.current, COMPANION_POLL_BACKOFF_MS.length - 1);
      const delay = COMPANION_POLL_BACKOFF_MS[step];
      pollStepRef.current = Math.min(step + 1, COMPANION_POLL_BACKOFF_MS.length - 1);
      pollTimerRef.current = setTimeout(() => {
        pollTimerRef.current = null;
        void runCheck('poll');
      }, delay);
    }
    async function runCheck(reason: SyncReason) {
      const closed = await syncCompanion(reason);
      if (!closed) scheduleNextPoll();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        clearPollTimer();
        return;
      }
      // 탭이 다시 visible → 즉시 체크 + backoff 리셋 + auto launch 재시도
      clearPollTimer();
      pollStepRef.current = 0;
      void runCheck('auto');
    }
    pollStepRef.current = 0;
    if (document.visibilityState !== 'hidden') void runCheck('auto');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearPollTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncCompanion]);

  const handleManualAttempt = useCallback(() => {
    tryLaunchCompanion(true);
    setStatusMessage(mode === 'outdated' ? '최신 버전을 설치한 뒤 다시 확인하고 있습니다.' : '헬퍼 앱 실행을 다시 시도하고 있습니다.');
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void syncCompanion('manual');
    }, 1500);
  }, [mode, syncCompanion]);

  const handleRefreshRelease = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    void syncCompanion('manual');
  }, [syncCompanion]);

  return {
    handleManualAttempt,
    handleRefreshRelease,
    isChecking,
    lastCheckedAt,
    latestVersion,
    liveDetected,
    releasePending,
    statusMessage,
  };
}

export default function CompanionGateModal() {
  const setShowCompanionGate = useUIStore((state) => state.setShowCompanionGate);
  const shouldReduceMotion = useReducedMotion();
  const [showFeatures, setShowFeatures] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osLabel = getCompanionOsLabel();
  const downloadUrl = getCompanionDownloadUrl();
  const currentVersion = getCompanionVersion();
  const mode: GateMode = currentVersion && isCompanionOutdated() ? 'outdated' : 'missing';

  const {
    handleManualAttempt,
    handleRefreshRelease,
    isChecking,
    lastCheckedAt,
    latestVersion,
    liveDetected,
    releasePending,
    statusMessage,
  } = useCompanionGateRuntime(mode, setShowCompanionGate);

  const title = releasePending
    ? `새 헬퍼 버전(v${MIN_REQUIRED_COMPANION_VERSION}) 게시 대기 중`
    : mode === 'outdated'
      ? `헬퍼 앱 업데이트가 필요합니다. (현재 v${currentVersion ?? '?'} → 최신 v${latestVersion})`
      : '올인원 헬퍼가 실행되어야 작업을 계속할 수 있습니다.';

  const description = releasePending
    ? `웹앱이 v${MIN_REQUIRED_COMPANION_VERSION} 이상을 요구하지만 GitHub에 아직 게시되지 않았습니다. 운영팀이 빌드/배포 중이며 보통 수 분 내에 자동으로 해결됩니다. 계속 머무른다면 새로고침하지 말고 잠시 기다려 주세요.`
    : mode === 'outdated'
      ? `현재 실행 중인 헬퍼는 v${currentVersion ?? '?'}이고 웹앱은 v${MIN_REQUIRED_COMPANION_VERSION} 이상이 필요합니다. 아래 가이드를 순서대로 진행해 주세요.`
      : '이 앱의 핵심 제작 파이프라인은 로컬 컴패니언 앱을 전제로 동작합니다. 로그인 후 감지되지 않으면 모든 기능이 차단되며, 감지되는 즉시 이 화면은 자동으로 사라집니다.';

  const handleCopy = useCallback(async (text: string, label: string, key: string) => {
    try {
      const copied = await copyText(text);
      setCopiedKey(copied ? key : null);
      showToast(copied ? `${label} 복사 완료` : `${label} 복사 실패`, copied ? 2500 : 4000);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (copied) {
        copyTimerRef.current = setTimeout(() => {
          copyTimerRef.current = null;
          setCopiedKey(null);
        }, 1800);
      }
    } catch {
      setCopiedKey(null);
      showToast(`${label} 복사 실패`, 4000);
    }
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.18 : 0.26 }}
            className="fixed inset-0 z-[10040] bg-black/70 backdrop-blur-md"
            style={{
              background: 'radial-gradient(circle at top, oklch(0.34 0.08 280 / 0.28), transparent 45%), oklch(0.145 0.012 264 / 0.94)',
            }}
          />
        </Dialog.Overlay>

        <Dialog.Content
          aria-labelledby="companion-gate-title"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed inset-0 z-[10050] overflow-y-auto p-3 sm:p-5 lg:p-8 focus:outline-none"
        >
          <div className="mx-auto flex min-h-full max-w-7xl items-center justify-center">
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: shouldReduceMotion ? 0.18 : 0.3, ease: MOTION_EASE }}
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 text-white backdrop-blur-xl"
              style={{
                background: 'linear-gradient(180deg, oklch(0.18 0.013 264 / 0.9), oklch(0.145 0.012 264 / 0.96))',
                boxShadow: '0 40px 140px -52px oklch(0 0 0 / 0.8)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'radial-gradient(circle at top left, oklch(0.62 0.2 275 / 0.12), transparent 30%), radial-gradient(circle at bottom right, oklch(0.74 0.18 48 / 0.1), transparent 35%)',
                }}
              />

              <div className="relative space-y-6 p-4 sm:p-6 lg:p-8">
                <div className="grid gap-6 lg:grid-cols-2">
                  <motion.section
                    initial={shouldReduceMotion ? undefined : 'hidden'}
                    animate={shouldReduceMotion ? undefined : 'show'}
                    variants={
                      shouldReduceMotion
                        ? undefined
                        : {
                            hidden: {},
                            show: { transition: { staggerChildren: 0.05 } },
                          }
                    }
                    className="space-y-6"
                  >
                    <motion.div
                      variants={
                        shouldReduceMotion
                          ? undefined
                          : {
                              hidden: { opacity: 0, y: 10 },
                              show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: MOTION_EASE } },
                            }
                      }
                      className="rounded-2xl border border-white/10 p-5 sm:p-6"
                      style={{
                        background: 'linear-gradient(180deg, oklch(0.2 0.015 264 / 0.88), oklch(0.17 0.013 264 / 0.9))',
                        boxShadow: '0 30px 90px -60px oklch(0.7 0.18 32 / 0.35)',
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <ModeBadge mode={mode} releasePending={releasePending} />
                        {releasePending ? (
                          <div
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-amber-100"
                            style={{ background: 'oklch(0.33 0.08 88 / 0.24)', borderColor: 'oklch(0.76 0.15 82 / 0.28)' }}
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Release Sync</span>
                          </div>
                        ) : null}
                      </div>

                      <Dialog.Title id="companion-gate-title" className="mt-4 text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                        {title}
                      </Dialog.Title>
                      <Dialog.Description className="mt-3 max-w-3xl text-base leading-7 text-slate-300">
                        {description}
                      </Dialog.Description>

                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <VersionPill label="현재 감지 버전" value={currentVersion ? `v${currentVersion}` : '미감지'} />
                        <VersionPill label="최소 요구 버전" value={`v${MIN_REQUIRED_COMPANION_VERSION}`} />
                        <VersionPill label="최신 버전" value={releasePending ? '게시 대기 중' : `v${latestVersion}`} />
                      </div>

                      <div className="mt-6">
                        <StatusPanel
                          isChecking={isChecking}
                          lastCheckedAt={lastCheckedAt}
                          mode={mode}
                          releasePending={releasePending}
                          statusMessage={statusMessage}
                        />
                      </div>

                      <div className="mt-6">
                        <ActionButtons
                          downloadUrl={downloadUrl}
                          liveDetected={liveDetected}
                          mode={mode}
                          onManualAttempt={handleManualAttempt}
                          onRefreshRelease={handleRefreshRelease}
                          osLabel={osLabel}
                          releasePending={releasePending}
                        />
                      </div>
                    </motion.div>

                    {/* [v1.3.2] outdated 모드에서만 4단계 회복 가이드 강조 카드 노출 */}
                    {mode === 'outdated' && !releasePending && (
                      <motion.div
                        variants={
                          shouldReduceMotion
                            ? undefined
                            : {
                                hidden: { opacity: 0, y: 10 },
                                show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: MOTION_EASE } },
                              }
                        }
                      >
                        <OutdatedRecoveryStack currentVersion={currentVersion} osLabel={osLabel} />
                      </motion.div>
                    )}

                    <motion.div
                      variants={
                        shouldReduceMotion
                          ? undefined
                          : {
                              hidden: { opacity: 0, y: 10 },
                              show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: MOTION_EASE } },
                            }
                      }
                    >
                      <InfoStack mode={mode} releasePending={releasePending} />
                    </motion.div>
                  </motion.section>

                  <div className="space-y-6">
                    {osLabel === 'macOS' ? (
                      <MacGatekeeperPanel copiedKey={copiedKey} onCopy={handleCopy} shouldReduceMotion={shouldReduceMotion} />
                    ) : null}
                  </div>
                </div>

                <FeatureSection
                  expanded={showFeatures}
                  onToggle={() => setShowFeatures((value) => !value)}
                  shouldReduceMotion={shouldReduceMotion}
                />
              </div>
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

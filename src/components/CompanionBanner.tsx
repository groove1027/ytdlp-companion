import { useState, useEffect, useRef } from 'react';
import { isCompanionDetected, recheckCompanion, getCompanionVersion, tryLaunchCompanion } from '../services/ytdlpApiService';
import { COMPANION_DOWNLOAD_URL, COMPANION_WINDOWS_AVAILABLE, getCompanionDownloadUrl, getCompanionOsLabel, getCompanionLatestVersion } from '../constants';

/** 기능별 배너 테마 */
type CompanionFeature = 'download' | 'stt' | 'tts' | 'rembg' | 'ffmpeg' | 'nle' | 'general';

interface FeatureTheme {
  icon: string;
  activeIcon: string;
  label: string;
  activeLabel: string;
  description: string;
  color: string;        // 비활성 시 강조 색상
  activeBg: string;     // 활성 시 배경
  activeBorder: string; // 활성 시 테두리
  activeText: string;   // 활성 시 텍스트
  bg: string;           // 비활성 시 배경
  border: string;       // 비활성 시 테두리
}

const THEMES: Record<CompanionFeature, FeatureTheme> = {
  download: {
    icon: '📥', activeIcon: '⚡',
    label: '안정적이고 빠른 다운로드',
    activeLabel: '고속 다운로드 활성화됨',
    description: '다운로드 속도가 3~7배 빨라집니다.',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  stt: {
    icon: '🎙️', activeIcon: '⚡',
    label: '빠르고 정확한 음성 인식',
    activeLabel: '로컬 음성 인식 활성화됨',
    description: '로컬 Whisper로 무료 + 오프라인 전사가 가능합니다.',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  tts: {
    icon: '🔊', activeIcon: '⚡',
    label: '무료 음성 합성',
    activeLabel: '로컬 TTS 활성화됨',
    description: 'API 비용 없이 무제한 음성을 생성할 수 있습니다.',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  rembg: {
    icon: '✂️', activeIcon: '⚡',
    label: '무료 배경 제거',
    activeLabel: '로컬 배경 제거 활성화됨',
    description: 'API 크레딧 걱정 없이 무제한 배경 제거가 가능합니다.',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.08)', border: 'rgba(20, 184, 166, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  ffmpeg: {
    icon: '🎬', activeIcon: '⚡',
    label: '초고속 영상 렌더링',
    activeLabel: '네이티브 렌더링 활성화됨',
    description: '영상 렌더링이 5~15배 빨라집니다.',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  nle: {
    icon: '\uD83C\uDFAC', activeIcon: '\u26A1',
    label: '\uC6D0\uD074\uB9AD NLE \uC124\uCE58',
    activeLabel: 'NLE \uC9C1\uC811 \uC124\uCE58 \uD65C\uC131\uD654\uB428',
    description: 'CapCut/Premiere/Filmora\uC5D0 \uD504\uB85C\uC81D\uD2B8\uB97C \uBC14\uB85C \uC124\uCE58\uD569\uB2C8\uB2E4.',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  general: {
    icon: '🚀', activeIcon: '⚡',
    label: '안정적이고 빠른 작업',
    activeLabel: '헬퍼 앱 활성화됨',
    description: '다운로드, 음성, 렌더링 등 모든 작업이 빨라집니다.',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
};

interface CompanionBannerProps {
  feature?: CompanionFeature;
  compact?: boolean; // true면 한 줄 간결 모드
}

export default function CompanionBanner({ feature = 'general', compact = false }: CompanionBannerProps) {
  const [visible, setVisible] = useState(false);
  const [companionActive, setCompanionActive] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVer, setLatestVer] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = THEMES[feature];

  // 실행하기 타이머 cleanup (unmount 시)
  useEffect(() => {
    return () => { if (launchTimerRef.current) clearTimeout(launchTimerRef.current); };
  }, []);

  useEffect(() => {
    const check = async () => {
      const detected = await recheckCompanion();
      setCompanionActive(detected);
      // 업데이트 체크: 현재 버전 vs GitHub 최신 버전 (직접 fetch — 캐시 타이밍 이슈 방지)
      if (detected) {
        const current = getCompanionVersion();
        let latest = getCompanionLatestVersion();
        // 캐시가 아직 없으면 직접 fetch
        if (!latest) {
          try {
            const res = await fetch('https://api.github.com/repos/groove1027/ytdlp-companion/releases/latest');
            if (res.ok) {
              const data = await res.json();
              latest = ((data.tag_name || '') as string).replace(/^companion-v/, '') || null;
            }
          } catch { /* 무시 */ }
        }
        if (latest) setLatestVer(latest);
        setUpdateAvailable(Boolean(current && latest && current !== latest));
      } else {
        setUpdateAvailable(false);
      }
      if (!detected) {
        // [FIX #907] 컴패니언 미설치 시 항상 배너 표시 — dismiss 기간을 1일로 단축
        try {
          const key = `companion_banner_${feature}_dismissed`;
          const dismissed = localStorage.getItem(key);
          if (!dismissed || Date.now() - Number(dismissed) > 1 * 86400000) setVisible(true);
        } catch { setVisible(true); }
      }
    };
    const t = setTimeout(check, 800);
    // 60초마다 재체크 (업데이트 후 상태 반영)
    const interval = setInterval(check, 60_000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [feature]);

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(`companion_banner_${feature}_dismissed`, Date.now().toString()); } catch {}
  };

  // 활성화 + 업데이트 필요 — 주황 배너
  if (companionActive && updateAvailable) {
    const currentVer = getCompanionVersion() || '?';
    const displayLatest = latestVer || getCompanionLatestVersion() || '?';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: compact ? '6px 10px' : '10px 14px',
        borderRadius: '8px',
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        fontSize: compact ? '11px' : '13px',
        color: '#fbbf24',
        fontWeight: 600,
      }}>
        <span style={{ fontSize: compact ? '12px' : '14px' }}>🔄</span>
        <span style={{ flex: 1 }}>
          헬퍼 업데이트 있음 (v{currentVer} → v{displayLatest})
          {' '}
          <a
            href={getCompanionDownloadUrl()}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f59e0b', textDecoration: 'underline', fontWeight: 700 }}
          >
            다운로드
          </a>
        </span>
      </div>
    );
  }

  // 활성화 상태 — 초록 뱃지
  if (companionActive) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: compact ? '5px 10px' : '8px 14px',
        borderRadius: '8px',
        background: theme.activeBg,
        border: `1px solid ${theme.activeBorder}`,
        fontSize: compact ? '11px' : '13px',
        color: theme.activeText,
        fontWeight: 600,
      }}>
        <span style={{ fontSize: compact ? '12px' : '14px' }}>{theme.activeIcon}</span>
        <span>{theme.activeLabel}</span>
      </div>
    );
  }

  // 실행하기 버튼 → URL 스킴으로 컴패니언 실행 시도 → 5초 후 재검사
  const handleLaunch = () => {
    if (launching) return;
    setLaunching(true);
    tryLaunchCompanion();
    if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    launchTimerRef.current = setTimeout(async () => {
      const detected = await recheckCompanion();
      if (detected) {
        setCompanionActive(true);
        setVisible(false);
      }
      setLaunching(false);
      launchTimerRef.current = null;
    }, 5000);
  };

  if (!visible) return null;

  // 미설치 안내 — 기능별 강조 색상
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: compact ? '8px 12px' : '12px 16px',
      borderRadius: '10px',
      background: theme.bg,
      border: `1.5px solid ${theme.border}`,
      fontSize: compact ? '12px' : '13px',
      color: '#cbd5e1',
      boxShadow: `0 0 12px ${theme.border}`,
    }}>
      <span style={{ fontSize: compact ? '14px' : '18px', flexShrink: 0 }}>{theme.icon}</span>
      <span style={{ flex: 1 }}>
        <strong style={{ color: theme.color }}>{theme.label}</strong>
        {!compact && <>를 위해{' '}</>}
        {compact ? ' — ' : ' '}
        {getCompanionOsLabel() === 'Windows' && !COMPANION_WINDOWS_AVAILABLE ? (
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>
            헬퍼 앱 (Windows 버전 준비 중)
          </span>
        ) : (
          <>
            <button
              onClick={handleLaunch}
              disabled={launching}
              style={{
                background: launching ? '#64748b' : theme.color,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: launching ? 'wait' : 'pointer',
                fontWeight: 700,
                fontSize: compact ? '11px' : '12px',
                marginRight: '6px',
                opacity: launching ? 0.7 : 1,
              }}
            >
              {launching ? '연결 중...' : '실행하기'}
            </button>
            <a
              href={getCompanionDownloadUrl()}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: theme.color,
                textDecoration: 'underline',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              설치{getCompanionOsLabel() ? ` (${getCompanionOsLabel()})` : ''}
            </a>
          </>
        )}
        {!compact && <> {theme.description}</>}
      </span>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none', color: '#64748b',
          cursor: 'pointer', fontSize: '16px', padding: '2px 6px',
          lineHeight: 1, flexShrink: 0,
        }}
        title="닫기"
      >×</button>
    </div>
  );
}

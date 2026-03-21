import { useState, useEffect } from 'react';
import { isCompanionDetected, recheckCompanion } from '../services/ytdlpApiService';

const COMPANION_DOWNLOAD_URL = 'https://github.com/groove1027/ytdlp-companion/releases/latest';

/** 기능별 배너 테마 */
type CompanionFeature = 'download' | 'stt' | 'tts' | 'rembg' | 'ffmpeg' | 'general';

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
  const theme = THEMES[feature];

  useEffect(() => {
    const check = async () => {
      const detected = await recheckCompanion();
      setCompanionActive(detected);
      if (!detected) {
        try {
          const key = `companion_banner_${feature}_dismissed`;
          const dismissed = localStorage.getItem(key);
          // 7일 지나면 다시 표시
          if (!dismissed || Date.now() - Number(dismissed) > 7 * 86400000) setVisible(true);
        } catch { setVisible(true); }
      }
    };
    const t = setTimeout(check, 800);
    return () => clearTimeout(t);
  }, [feature]);

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(`companion_banner_${feature}_dismissed`, Date.now().toString()); } catch {}
  };

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
        <a
          href={COMPANION_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: theme.color,
            textDecoration: 'underline',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          헬퍼 앱 설치
        </a>
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

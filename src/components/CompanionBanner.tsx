import { useState, useEffect } from 'react';
import { isCompanionDetected, recheckCompanion } from '../services/ytdlpApiService';

const DISMISS_KEY = 'companion_banner_dismissed';
const COMPANION_DOWNLOAD_URL = 'https://github.com/groove1027/ytdlp-companion/releases/latest';

export default function CompanionBanner() {
  const [visible, setVisible] = useState(false);
  const [companionActive, setCompanionActive] = useState(false);

  useEffect(() => {
    const checkCompanion = async () => {
      const detected = await recheckCompanion();
      setCompanionActive(detected);

      if (!detected) {
        try {
          const dismissed = localStorage.getItem(DISMISS_KEY);
          if (!dismissed) setVisible(true);
        } catch {
          setVisible(true);
        }
      }
    };

    const timer = setTimeout(checkCompanion, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch {}
  };

  // 컴패니언 활성화 상태 표시
  if (companionActive) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 14px', borderRadius: '8px',
        background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
        fontSize: '13px', color: '#10b981',
      }}>
        <span style={{ fontSize: '14px' }}>⚡</span>
        <span>고속 다운로드 활성화됨</span>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 16px', borderRadius: '10px',
      background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)',
      fontSize: '13px', color: '#94a3b8',
    }}>
      <span style={{ fontSize: '16px', flexShrink: 0 }}>📥</span>
      <span style={{ flex: 1 }}>
        <strong style={{ color: '#e2e8f0' }}>안정적이고 빠른 다운로드</strong>를 위해{' '}
        <a
          href={COMPANION_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer' }}
        >
          헬퍼 앱을 설치
        </a>
        하세요. 다운로드 속도가 3~7배 빨라집니다.
      </span>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none', border: 'none', color: '#64748b',
          cursor: 'pointer', fontSize: '16px', padding: '2px 6px',
          lineHeight: 1, flexShrink: 0,
        }}
        title="닫기"
      >
        ×
      </button>
    </div>
  );
}

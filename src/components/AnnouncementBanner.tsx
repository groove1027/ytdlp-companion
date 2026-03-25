import { useState } from 'react';
import { COMPANION_DOWNLOAD_URL, getCompanionDownloadUrl, getCompanionOsLabel } from '../constants';

const DISMISS_KEY = 'announcement_v1_dismissed';

/** 앱 상단 전체 공지 배너 — 새 기능 알림용 */
export default function AnnouncementBanner() {
  const [visible, setVisible] = useState(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (!dismissed) return true;
      // 3일 후 다시 표시
      return Date.now() - Number(dismissed) > 3 * 86400000;
    } catch { return true; }
  });

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch {}
  };

  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #172554 50%, #0c4a6e 100%)',
      border: '1px solid rgba(99, 102, 241, 0.4)',
      borderRadius: '12px',
      padding: '16px 20px',
      margin: '0 0 16px 0',
      boxShadow: '0 0 20px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
      overflow: 'hidden',
    }}>
      {/* 배경 글로우 효과 */}
      <div style={{
        position: 'absolute', top: '-50%', right: '-10%',
        width: '200px', height: '200px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', position: 'relative' }}>
        {/* 아이콘 */}
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px', flexShrink: 0,
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
        }}>
          🚀
        </div>

        {/* 내용 */}
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
          }}>
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              color: '#fff', fontSize: '10px', fontWeight: 800,
              padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.5px',
            }}>
              NEW
            </span>
            <span style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: 700 }}>
              All In One Helper 출시
            </span>
          </div>

          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, margin: '0 0 10px 0' }}>
            <strong style={{ color: '#c4b5fd' }}>다운로드 3~7배 빠름</strong> · 음성 인식/합성 무료 · 배경 제거 무제한 · 영상 렌더링 초고속
            <br />
            헬퍼 앱 하나만 설치하면 모든 기능이 자동으로 활성화됩니다.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href={getCompanionDownloadUrl()}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                padding: '8px 16px', borderRadius: '8px',
                textDecoration: 'none', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {getCompanionOsLabel() === 'Windows' ? '⬇️ Windows 다운로드' : getCompanionOsLabel() === 'macOS' ? '⬇️ macOS 다운로드' : '⬇️ 다운로드'}
            </a>
            <a
              href={COMPANION_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#64748b', fontSize: '12px', textDecoration: 'underline', cursor: 'pointer' }}
            >
              {getCompanionOsLabel() === 'Windows' ? '🍎 macOS 버전' : getCompanionOsLabel() === 'macOS' ? '💻 Windows 버전' : '전체 버전 보기'}
            </a>
          </div>
        </div>

        {/* 닫기 */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute', top: '-4px', right: '-4px',
            background: 'rgba(255,255,255,0.1)', border: 'none',
            color: '#64748b', cursor: 'pointer',
            fontSize: '18px', width: '28px', height: '28px',
            borderRadius: '8px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          title="닫기"
        >
          ×
        </button>
      </div>
    </div>
  );
}

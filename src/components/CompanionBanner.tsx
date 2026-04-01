import { useState, useEffect, useRef, useId } from 'react';
import { recheckCompanion, getCompanionVersion, tryLaunchCompanion } from '../services/ytdlpApiService';
import { COMPANION_WINDOWS_AVAILABLE, getCompanionDownloadUrl, getCompanionOsLabel, getCompanionLatestVersion, getCompanionReleaseNote, compareVersions, refreshCompanionRelease } from '../constants';

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
    label: '고속 다운로드 (yt-dlp)',
    activeLabel: '고속 다운로드 활성화됨',
    description: '로컬 yt-dlp로 YouTube·Instagram·TikTok 등 다운로드가 3~7배 빨라집니다.',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  stt: {
    icon: '🎙️', activeIcon: '⚡',
    label: '음성 인식 (Whisper)',
    activeLabel: '로컬 음성 인식 활성화됨',
    description: 'Whisper large-v3-turbo 모델로 100여 개 언어 무료 오프라인 전사.',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  tts: {
    icon: '🔊', activeIcon: '⚡',
    label: '무료 음성 합성 (Qwen3·Kokoro·Edge)',
    activeLabel: '로컬 TTS 활성화됨',
    description: 'Qwen3(한국어 최적화)·Kokoro(자연스러운 영어)·Edge TTS·CosyVoice(음성 복제)로 무제한 무료 합성.',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  rembg: {
    icon: '✂️', activeIcon: '⚡',
    label: '무료 배경 제거 (rembg AI)',
    activeLabel: '로컬 배경 제거 활성화됨',
    description: 'AI 배경 제거를 API 크레딧 없이 무제한 사용할 수 있습니다.',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.08)', border: 'rgba(20, 184, 166, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  ffmpeg: {
    icon: '🎬', activeIcon: '⚡',
    label: '초고속 렌더링 (FFmpeg)',
    activeLabel: '네이티브 렌더링 활성화됨',
    description: '네이티브 FFmpeg로 영상 인코딩이 5~15배 빨라집니다.',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  nle: {
    icon: '🎞️', activeIcon: '⚡',
    label: '원클릭 NLE 연동',
    activeLabel: 'NLE 직접 연동 활성화됨',
    description: 'CapCut·Premiere·Filmora에 프로젝트를 원클릭으로 넣어줍니다. 미디어 경로 자동 패치.',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.35)',
    activeBg: 'rgba(16, 185, 129, 0.1)', activeBorder: 'rgba(16, 185, 129, 0.3)', activeText: '#10b981',
  },
  general: {
    icon: '🚀', activeIcon: '⚡',
    label: '헬퍼 앱 — 더 빠르고, 더 강력하게',
    activeLabel: '헬퍼 앱 활성화됨',
    description: '고속 다운로드·AI 음성(Qwen3/Kokoro)·렌더링·배경제거·NLE 연동을 무료로.',
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
  const [releaseNote, setReleaseNote] = useState<string | null>(null);
  const [offlineUpdate, setOfflineUpdate] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailPanelId = `companion-detail-${useId().replace(/:/g, '')}`;
  const theme = THEMES[feature];

  // 실행하기 타이머 cleanup (unmount 시)
  useEffect(() => {
    return () => { if (launchTimerRef.current) clearTimeout(launchTimerRef.current); };
  }, []);

  useEffect(() => {
    // feature 변경 시 이전 UI 상태 초기화
    setShowDetails(false);
    setVisible(false);
    let cancelled = false;
    const check = async () => {
      refreshCompanionRelease(); // TTL 경과 시에만 실제 fetch
      const detected = await recheckCompanion();
      if (cancelled) return;
      setCompanionActive(detected);

      // 최신 버전 가져오기 (캐시 우선, 없으면 직접 fetch)
      let latest = getCompanionLatestVersion();
      if (!latest) {
        try {
          const res = await fetch('https://api.github.com/repos/groove1027/ytdlp-companion/releases/latest');
          if (res.ok) {
            const data = await res.json();
            latest = ((data.tag_name || '') as string).replace(/^companion-v/, '') || null;
          }
        } catch { /* rate limit 등 무시 */ }
      }
      if (cancelled) return;
      if (latest) setLatestVer(latest);
      setReleaseNote(getCompanionReleaseNote());

      if (detected) {
        // [FIX #935] semver 비교로 개선 — 1.2.0 vs 1.10.0 같은 경우 정확 처리
        const current = getCompanionVersion();
        const needsUpdate = Boolean(current && latest && compareVersions(current, latest) < 0);
        setUpdateAvailable(needsUpdate);
        setOfflineUpdate(false);
      } else {
        setUpdateAvailable(false);
        // [FIX #935] 컴패니언 미감지 시: 이전에 감지된 적 있으면 업데이트 배너, 없으면 설치 배너
        try {
          const lastVer = localStorage.getItem('companion_last_detected_version');
          if (lastVer && latest && compareVersions(lastVer, latest) < 0) {
            const dismissKey = `companion_update_${latest}_dismissed`;
            const dismissed = localStorage.getItem(dismissKey);
            const dismissedAt = Number(dismissed);
            if (!dismissed || isNaN(dismissedAt) || Date.now() - dismissedAt > 3 * 86400000) {
              setOfflineUpdate(true);
              setVisible(true);
            }
          } else {
            setOfflineUpdate(false);
            const key = `companion_banner_${feature}_dismissed`;
            const dismissed = localStorage.getItem(key);
            const dismissedAt = Number(dismissed);
            if (!dismissed || isNaN(dismissedAt) || Date.now() - dismissedAt > 1 * 86400000) setVisible(true);
          }
        } catch { setVisible(true); }
      }
    };
    const t = setTimeout(check, 800);
    const interval = setInterval(check, 60_000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(interval); };
  }, [feature]);

  const handleDismiss = () => {
    setVisible(false);
    setShowDetails(false);
    try {
      // [FIX #935] 업데이트 배너는 버전별 dismiss — 새 버전 나오면 다시 표시
      if ((updateAvailable || offlineUpdate) && latestVer) {
        localStorage.setItem(`companion_update_${latestVer}_dismissed`, Date.now().toString());
      } else {
        localStorage.setItem(`companion_banner_${feature}_dismissed`, Date.now().toString());
      }
    } catch {}
  };

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
        setOfflineUpdate(false);
        // [FIX #935] 실행된 컴패니언이 여전히 구버전이면 updateAvailable 유지
        const current = getCompanionVersion();
        const latest = getCompanionLatestVersion();
        if (current && latest && compareVersions(current, latest) < 0) {
          setUpdateAvailable(true);
        } else {
          setVisible(false);
        }
      }
      setLaunching(false);
      launchTimerRef.current = null;
    }, 5000);
  };

  // 활성화 + 업데이트 필요 — 주황 배너
  if (companionActive && updateAvailable) {
    const currentVer = getCompanionVersion() || '?';
    const displayLatest = latestVer || getCompanionLatestVersion() || '?';
    return (
      <div role="status" aria-live="polite" style={{
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
          {releaseNote && !compact && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '6px', fontSize: '11px' }}>— {releaseNote}</span>}
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

  // [FIX #935] 컴패니언 꺼져있지만 구버전 감지 이력 있음 → 업데이트 + 재실행 안내
  if (!companionActive && offlineUpdate && visible) {
    const lastVer = (() => { try { return localStorage.getItem('companion_last_detected_version') || '?'; } catch { return '?'; } })();
    const displayLatest = latestVer || getCompanionLatestVersion() || '?';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: compact ? '6px 10px' : '10px 14px',
        borderRadius: '8px',
        background: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        fontSize: compact ? '11px' : '13px',
        color: '#fbbf24',
        fontWeight: 600,
      }}>
        <span style={{ fontSize: compact ? '12px' : '14px' }}>🔄</span>
        <span style={{ flex: 1 }}>
          헬퍼 앱 새 버전이 나왔습니다 (v{lastVer} → v{displayLatest})
          {releaseNote && !compact && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '6px', fontSize: '11px' }}>— {releaseNote}</span>}
          {' '}
          <a
            href={getCompanionDownloadUrl()}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f59e0b', textDecoration: 'underline', fontWeight: 700, marginRight: '6px' }}
          >
            업데이트{getCompanionOsLabel() ? ` (${getCompanionOsLabel()})` : ''}
          </a>
          <button
            type="button"
            onClick={handleLaunch}
            disabled={launching}
            style={{
              background: launching ? '#64748b' : '#f59e0b',
              color: '#fff', border: 'none', borderRadius: '4px',
              padding: '2px 8px', cursor: launching ? 'wait' : 'pointer',
              fontWeight: 700, fontSize: compact ? '10px' : '11px',
              opacity: launching ? 0.7 : 1,
            }}
          >
            {launching ? '연결 중...' : '실행하기'}
          </button>
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="배너 닫기"
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

  // 활성화 상태 — 초록 뱃지
  if (companionActive) {
    return (
      <div role="status" aria-live="polite" style={{
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

  // 미설치 안내 — 기능별 강조 색상 + 상세 설명 패널
  return (
    <div style={{
      borderRadius: '10px',
      background: theme.bg,
      border: `1.5px solid ${theme.border}`,
      fontSize: compact ? '12px' : '13px',
      color: '#cbd5e1',
      boxShadow: `0 0 12px ${theme.border}`,
      overflow: 'hidden',
    }}>
      {/* 상단 배너 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: compact ? '8px 12px' : '12px 16px',
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
                type="button"
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
          {!compact && (
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              aria-controls={detailPanelId}
              style={{
                background: 'none', border: 'none',
                color: '#94a3b8', cursor: 'pointer',
                fontSize: '11px', marginLeft: '8px',
                textDecoration: 'underline', padding: 0,
              }}
            >
              {showDetails ? '접기 ▲' : '자세히 보기 ▼'}
            </button>
          )}
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="배너 닫기"
          style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '16px', padding: '2px 6px',
            lineHeight: 1, flexShrink: 0,
          }}
          title="닫기"
        >×</button>
      </div>

      {/* 확장 상세 패널 */}
      {!compact && showDetails && (
        <div id={detailPanelId} role="region" aria-label="헬퍼 앱 상세 정보" style={{
          padding: '0 16px 16px',
          borderTop: `1px solid ${theme.border}`,
          marginTop: '0',
          paddingTop: '14px',
          lineHeight: 1.7,
        }}>
          {/* 왜 필요한가 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '13px', marginBottom: '4px' }}>
              왜 헬퍼 앱이 필요한가요?
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              웹 브라우저는 보안 정책상 로컬 파일 접근, 고속 다운로드, AI 모델 실행 등에 제한이 있습니다.
              헬퍼 앱은 여러분의 컴퓨터에서 직접 실행되는 가벼운 데스크탑 프로그램으로, 이 제한을 해결합니다.
              <strong style={{ color: '#cbd5e1' }}> 설치 한 번이면 모든 기능을 무료로 제한 없이</strong> 사용할 수 있습니다.
            </div>
          </div>

          {/* 어떻게 작동하나 */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '13px', marginBottom: '4px' }}>
              어떻게 작동하나요?
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              DMG(macOS) 또는 EXE(Windows)를 설치한 뒤 실행하면 메뉴 막대/시스템 트레이에서 조용히 동작합니다.
              웹앱이 자동으로 헬퍼를 감지해서 연결하므로 <strong style={{ color: '#cbd5e1' }}>별도 설정이 전혀 필요 없습니다.</strong>
              {' '}앱을 끄면 기존 클라우드 API로 자동 전환됩니다.
            </div>
          </div>

          {/* 전체 기능 목록 */}
          <div>
            <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '13px', marginBottom: '8px' }}>
              제공 기능 한눈에 보기
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '6px' }}>
              {([
                { icon: '📥', name: '고속 다운로드', tech: 'yt-dlp', desc: 'YouTube·Instagram·TikTok 등 3~7배 속도' },
                { icon: '🔊', name: '음성 합성 (TTS)', tech: 'Qwen3·Kokoro·Edge TTS', desc: '한국어·영어·일본어 등 무료 무제한' },
                { icon: '🗣️', name: '음성 복제', tech: 'CosyVoice', desc: '내 목소리로 AI 음성 생성 (제로샷 클로닝)' },
                { icon: '🎙️', name: '음성 인식 (STT)', tech: 'Whisper large-v3-turbo', desc: '100여 개 언어 오프라인 전사' },
                { icon: '🎬', name: '영상 렌더링', tech: 'FFmpeg 네이티브', desc: '인코딩 5~15배 빠르게' },
                { icon: '✂️', name: '배경 제거', tech: 'rembg AI', desc: 'API 비용 없이 무제한' },
                { icon: '🤖', name: '자막/워터마크 제거', tech: 'ProPainter + PaddleOCR', desc: 'AI가 자막·워터마크 영역 자동 감지 + 제거' },
                { icon: '🎞️', name: 'NLE 원클릭 연동', tech: 'CapCut·Premiere·Filmora', desc: '프로젝트를 편집기에 바로 불러오고 경로도 자동으로 맞춰줍니다' },
                { icon: '🔍', name: '레퍼런스 검색', tech: 'YouTube·Google 로컬', desc: 'API 키 없이 빠른 검색' },
              ] as const).map((f, i) => (
                <div key={i} style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start',
                  padding: '6px 10px', borderRadius: '6px',
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{f.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '12px' }}>
                      {f.name} <span style={{ color: '#64748b', fontWeight: 400, fontSize: '10px' }}>({f.tech})</span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 설치 CTA */}
          <div style={{
            marginTop: '14px', padding: '10px 14px', borderRadius: '8px',
            background: `linear-gradient(135deg, ${theme.bg}, rgba(59,130,246,0.06))`,
            border: `1px dashed ${theme.border}`,
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            fontSize: '12px',
          }}>
            <span style={{ fontSize: '16px' }}>💡</span>
            <span style={{ flex: 1, color: '#94a3b8' }}>
              <strong style={{ color: '#e2e8f0' }}>한 번 설치로 위 기능 모두 무료.</strong>
              {' '}macOS(M1/Intel) · Windows 지원. 앱 용량 약 15MB, 필요한 AI 모델은 첫 사용 시 자동 다운로드됩니다.
            </span>
            {!(getCompanionOsLabel() === 'Windows' && !COMPANION_WINDOWS_AVAILABLE) && (
              <a
                href={getCompanionDownloadUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: theme.color, color: '#fff',
                  padding: '6px 14px', borderRadius: '6px',
                  fontWeight: 700, fontSize: '12px',
                  textDecoration: 'none', flexShrink: 0,
                  boxShadow: `0 2px 8px ${theme.border}`,
                }}
              >
                지금 설치{getCompanionOsLabel() ? ` (${getCompanionOsLabel()})` : ''}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

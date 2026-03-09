import React, { useState, useEffect, useRef, useMemo } from 'react';

/**
 * 분석 대기 화면 — 체감 시간을 줄이기 위한 프리미엄 로딩 패널
 *
 * 적용 기술:
 * 1. 다단계 파이프라인 시각화 (완료 체크 + 현재 스피너 + 미래 회색)
 * 2. 비선형 진행률 (빠른 시작 → 점진적 감속 → 95%에서 수렴)
 * 3. "알고 계셨나요?" 팁 캐러셀 (5초 회전)
 * 4. 경과/예상 시간 + 친절한 안내 문구
 * 5. 완료 시 탭 제목 알림 + 사운드
 */

interface PipelineStep {
  label: string;
  icon: string;
}

interface AnalysisLoadingPanelProps {
  /** 현재 진행 단계 (0-based index) */
  currentStep: number;
  /** 전체 파이프라인 단계들 */
  steps: PipelineStep[];
  /** 현재 단계의 상세 메시지 */
  message: string;
  /** 경과 시간 (초) */
  elapsedSec: number;
  /** 예상 총 소요 시간 (초) */
  estimatedTotalSec: number;
  /** 분석 타입에 따른 accent 색상 */
  accent?: 'blue' | 'orange';
  /** 추가 안내 문구 (최상단) */
  description?: string;
}

// ── 팁 데이터 ──
const TIPS: { icon: string; text: string }[] = [
  { icon: '🎯', text: 'AI가 영상의 텍스트, 시각, 편집, 오디오, 댓글까지 5가지 축으로 분석합니다' },
  { icon: '📊', text: '분석 결과는 채널 DNA 보고서에 저장되어 대본 작성 시 자동 반영됩니다' },
  { icon: '⚡', text: '여러 영상을 한번에 분석하면 채널의 패턴을 더 정확하게 파악합니다' },
  { icon: '🧠', text: '본능 기제 + 채널 분석을 결합하면 바이럴 확률이 크게 높아집니다' },
  { icon: '🎬', text: '편집실에서 분석된 채널 스타일을 적용하면 일관된 영상을 만들 수 있어요' },
  { icon: '📝', text: '대본 작성 탭에서 "채널 스타일 적용" 배지가 보이면 분석 결과가 반영 중입니다' },
  { icon: '🔍', text: '키워드 분석으로 경쟁 강도와 노출 기회를 미리 파악해보세요' },
  { icon: '💡', text: '분석 중에도 다른 탭으로 이동해서 작업할 수 있습니다 — 완료 시 알림이 옵니다' },
  { icon: '📈', text: '채널 분석은 구독자 수, 평균 조회수, 업로드 패턴까지 종합적으로 평가합니다' },
  { icon: '🎨', text: '시각 스타일 분석은 썸네일 색감, 자막 스타일, 편집 리듬까지 포함합니다' },
];

// ── 격려 메시지 ──
const ENCOURAGEMENTS: string[] = [
  '꼼꼼하게 분석하고 있으니 조금만 기다려주세요!',
  'AI가 열심히 일하고 있어요 — 곧 결과를 보여드릴게요',
  '정확한 분석을 위해 시간이 좀 걸리지만, 그만큼 퀄리티가 달라요',
  '잠시 후 놀라운 인사이트가 나올 거예요!',
  '다른 탭에서 작업해도 괜찮아요 — 완료되면 알려드릴게요',
];

const AnalysisLoadingPanel: React.FC<AnalysisLoadingPanelProps> = ({
  currentStep,
  steps,
  message,
  elapsedSec,
  estimatedTotalSec,
  accent = 'blue',
  description,
}) => {
  // 팁 캐러셀
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [tipFade, setTipFade] = useState(true);
  const seenTips = useRef(new Set<number>([tipIndex]));

  useEffect(() => {
    const iv = setInterval(() => {
      setTipFade(false);
      setTimeout(() => {
        setTipIndex(prev => {
          // 중복 방지: 안 본 팁 우선
          const unseen = TIPS.map((_, i) => i).filter(i => !seenTips.current.has(i));
          const pool = unseen.length > 0 ? unseen : TIPS.map((_, i) => i).filter(i => i !== prev);
          const next = pool[Math.floor(Math.random() * pool.length)];
          seenTips.current.add(next);
          if (seenTips.current.size >= TIPS.length) seenTips.current.clear();
          return next;
        });
        setTipFade(true);
      }, 300);
    }, 6000);
    return () => clearInterval(iv);
  }, []);

  // 격려 메시지 (30초마다)
  const encouragement = useMemo(() => {
    const idx = Math.floor(elapsedSec / 30) % ENCOURAGEMENTS.length;
    return ENCOURAGEMENTS[idx];
  }, [Math.floor(elapsedSec / 30)]);

  // 비선형 진행률
  const simProgress = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsedSec / (estimatedTotalSec * 0.55)))));

  // 예상 남은 시간
  const remainSec = simProgress > 5
    ? Math.max(0, Math.round(elapsedSec / simProgress * (100 - simProgress)))
    : Math.max(0, estimatedTotalSec - elapsedSec);

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m > 0) return `${m}분 ${String(s).padStart(2, '0')}초`;
    return `${s}초`;
  };

  // 탭 제목 변경 (진행률 표시)
  useEffect(() => {
    const orig = document.title;
    document.title = `[${simProgress}%] 분석 중... — ${orig.replace(/^\[\d+%\].*— /, '')}`;
    return () => { document.title = orig.replace(/^\[\d+%\].*— /, ''); };
  }, [simProgress]);

  const accentColors = accent === 'blue' ? {
    border: 'border-blue-500/20',
    barFrom: 'from-blue-500',
    barTo: 'to-violet-500',
    stepActive: 'border-blue-400 bg-blue-500/20 text-blue-300',
    stepDone: 'border-green-500 bg-green-500/20 text-green-300',
    stepFuture: 'border-gray-600 bg-gray-800 text-gray-500',
    timeColor: 'text-blue-400',
    tipBorder: 'border-blue-500/15',
    tipBg: 'bg-blue-900/10',
  } : {
    border: 'border-orange-500/20',
    barFrom: 'from-orange-500',
    barTo: 'to-red-500',
    stepActive: 'border-orange-400 bg-orange-500/20 text-orange-300',
    stepDone: 'border-green-500 bg-green-500/20 text-green-300',
    stepFuture: 'border-gray-600 bg-gray-800 text-gray-500',
    timeColor: 'text-orange-400',
    tipBorder: 'border-orange-500/15',
    tipBg: 'bg-orange-900/10',
  };

  const tip = TIPS[tipIndex];

  return (
    <div className={`bg-gray-800/50 rounded-xl border ${accentColors.border} p-6 space-y-5`}>
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 flex items-center justify-center">
          {/* 외곽 회전 링 */}
          <div className={`absolute inset-0 border-2 border-gray-700 ${accent === 'blue' ? 'border-t-blue-400' : 'border-t-orange-400'} rounded-full animate-spin`} />
          <span className="text-lg font-bold tabular-nums ${accentColors.timeColor}">{simProgress}%</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold">{message}</p>
          {description && <p className="text-gray-400 text-sm mt-0.5">{description}</p>}
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div>
        <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${accentColors.barFrom} ${accentColors.barTo} rounded-full transition-all duration-700 ease-out`}
            style={{ width: `${simProgress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs tabular-nums">
          <span className="text-gray-400">
            경과 <span className="text-gray-300 font-medium">{formatSec(elapsedSec)}</span>
          </span>
          {simProgress < 90 ? (
            <span className="text-gray-500">
              예상 완료까지 약 <span className={`${accentColors.timeColor} font-medium`}>{formatSec(remainSec)}</span>
            </span>
          ) : (
            <span className={`${accentColors.timeColor} font-medium`}>거의 완료!</span>
          )}
        </div>
      </div>

      {/* 파이프라인 단계 */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          const colorClass = isDone ? accentColors.stepDone : isActive ? accentColors.stepActive : accentColors.stepFuture;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className={`flex-1 h-px ${isDone ? 'bg-green-500/40' : 'bg-gray-700'}`} />
              )}
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all ${colorClass}`}>
                {isDone ? (
                  <svg className="w-3 h-3 text-green-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M3 8.5l3.5 3.5 6.5-8" /></svg>
                ) : isActive ? (
                  <div className={`w-3 h-3 border-2 border-current rounded-full animate-spin ${accent === 'blue' ? 'border-t-blue-300' : 'border-t-orange-300'}`} style={{ borderTopColor: 'currentColor', borderRightColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: 'transparent' }} />
                ) : (
                  <span className="text-xs">{step.icon}</span>
                )}
                <span>{step.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* 안내 문구 */}
      <div className={`${accentColors.tipBg} border ${accentColors.tipBorder} rounded-lg px-4 py-3`}>
        <p className="text-xs text-gray-500 font-semibold mb-1.5">보통 2~3분 정도 소요됩니다</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          AI가 채널의 텍스트 스타일, 시각 패턴, 편집 리듬, 오디오 톤, 댓글 반응까지
          <span className="text-gray-300 font-medium"> 5가지 축</span>으로 종합 분석합니다.
          정확한 채널 DNA 추출을 위해 조금 기다려주세요.
        </p>
        <p className="text-xs text-gray-500 mt-2 italic">{encouragement}</p>
      </div>

      {/* 팁 캐러셀 */}
      <div className={`flex items-start gap-3 transition-opacity duration-300 ${tipFade ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-lg flex-shrink-0 mt-0.5">{tip.icon}</span>
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-wider font-bold mb-0.5">알고 계셨나요?</p>
          <p className="text-sm text-gray-400">{tip.text}</p>
        </div>
      </div>
    </div>
  );
};

export default AnalysisLoadingPanel;

/**
 * 분석 완료 시 알림 (사운드 + 탭 제목)
 * 컴포넌트 외부에서 호출
 */
export function notifyAnalysisComplete(tabTitle?: string) {
  // 탭 제목 복원 + 완료 표시
  const base = document.title.replace(/^\[\d+%\].*— /, '');
  document.title = tabTitle || `✅ 분석 완료! — ${base}`;
  setTimeout(() => { document.title = base; }, 5000);

  // 사운드 알림 (Web Audio API — 짧은 성공 사운드)
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // 성공 사운드: C5 → E5 → G5 (도미솔)
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523, now);       // C5
    osc.frequency.setValueAtTime(659, now + 0.12); // E5
    osc.frequency.setValueAtTime(784, now + 0.24); // G5
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // 사운드 실패 무시
  }
}

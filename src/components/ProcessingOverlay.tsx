
import React, { useState, useEffect, useMemo } from 'react';

interface ProcessingOverlayProps {
  message: string | null;
  mode?: string;
  progress?: number; // 0 to 100
  eta?: number;      // Seconds remaining
}

// [UPDATED] Context-Aware Tips including Kie/Thinking
const TIPS_CHARACTER = [
    "🚀 Kie 고속 엔진이 캐릭터의 성격과 외형적 특징을 분석 중입니다...",
    "🧠 Gemini 3 모델이 4가지 독창적인 스타일 변주(Thinking Process)를 계산 중입니다...",
    "✨ 선택하신 화풍을 유지하면서 가장 매력적인 캐릭터 시안을 스케치 중입니다...",
    "⚠️ 정밀 모드: Kie 실패 시 Evolink Thinking 모델이 심층 추론을 시작합니다...",
    "💡 Tip: 생성된 캐릭터를 '고정'하면 영상 전반에 걸쳐 일관된 얼굴을 유지할 수 있습니다."
];

const TIPS_SCRIPT = [
    "📝 Kie 멀티모달 엔진이 대본의 맥락(Context)을 파악하고 있습니다...",
    "🤔 AI가 심층 추론(Thinking)을 통해 장면 간의 연결성을 설계 중입니다...",
    "🎥 지문 내용을 시각화하기 위해 조명(Lighting)과 카메라 앵글을 계산하고 있습니다...",
    "⚠️ 복잡한 추론 발생 시 Evolink 백업 엔진이 가동될 수 있습니다...",
    "💡 Director Tip: 롱폼 영상은 호흡이 중요하고, 숏폼은 첫 3초의 임팩트가 중요합니다."
];

const TIPS_REMAKE = [
    "🎞️ Kie Vision 엔진이 원본 영상의 프레임을 초고속으로 분석 중입니다...",
    "🔄 기존 영상의 피사체를 새로운 스타일로 변환(Style Transfer)하고 있습니다...",
    "🤖 영상의 흐름을 유지하며 새로운 AI 모델을 덧입히는 중입니다...",
    "✨ 일관된 스타일 유지를 위해 키프레임 간의 연관성을 계산하고 있습니다...",
    "💡 Tip: 원본 영상이 선명할수록 리메이크 결과물의 퀄리티가 높아집니다."
];

const TIPS_DEFAULT = [
    "🚀 Kie AI 엔진을 예열하고 리소스를 할당하고 있습니다...",
    "⏳ Gemini Thinking Process 가동 중... 잠시만 기다려주세요.",
    "💡 Tip: 상세한 프롬프트를 사용할수록 AI가 의도를 더 잘 파악합니다.",
    "☁️ 클라우드 서버와 통신하며 데이터를 처리하고 있습니다..."
];

const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ message, mode, progress = 0, eta = 0 }) => {
  const [tipIndex, setTipIndex] = useState(0);

  // A-4: Memoize tips selection to prevent interval re-creation
  const currentTips = useMemo(() => {
    if (mode === 'CHARACTER') return TIPS_CHARACTER;
    if (mode === 'SCRIPT') return TIPS_SCRIPT;
    if (mode === 'REMAKE') return TIPS_REMAKE;
    return TIPS_DEFAULT;
  }, [mode]);

  // Rotate tips every 3.5 seconds
  useEffect(() => {
      if (!message) return;
      // Reset index when message appears
      setTipIndex(0); 
      const interval = setInterval(() => {
          setTipIndex((prev) => (prev + 1) % currentTips.length);
      }, 3500);
      return () => clearInterval(interval);
  }, [message, currentTips]);

  if (!message) return null;
  
  // Clean message: Remove [NotebookLM Logic] tag if present
  const displayMessage = message.replace(/\[NotebookLM Logic\]/g, "").trim();

  return (
    <div className="fixed inset-0 bg-black/95 z-[9999] flex flex-col items-center justify-center p-6 backdrop-blur-md animate-fade-in">
      {/* [UPDATED] Increased max-width to max-w-3xl (approx 768px) for better text display */}
      <div className="w-full max-w-3xl bg-gray-800 rounded-3xl border border-gray-700 shadow-[0_0_50px_rgba(59,130,246,0.2)] p-10 flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Animated Background Gradient */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gray-900 overflow-hidden">
            {progress > 0 ? (
                <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-300 ease-out" 
                    style={{ width: `${progress}%` }}
                ></div>
            ) : (
                <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-loading-bar" style={{ width: '100%' }}></div>
            )}
        </div>
        
        <div className="w-24 h-24 mb-6 relative">
             <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
             {progress > 0 ? (
                 <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                     <circle 
                        cx="50" cy="50" r="46" 
                        fill="none" 
                        stroke="#374151" 
                        strokeWidth="8" 
                     />
                     <circle 
                        cx="50" cy="50" r="46" 
                        fill="none" 
                        stroke="url(#gradient)" 
                        strokeWidth="8" 
                        strokeDasharray="289.02652413026095" 
                        strokeDashoffset={289.02652413026095 * (1 - progress / 100)} 
                        strokeLinecap="round"
                        className="transition-all duration-500 ease-out"
                     />
                     <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                     </defs>
                 </svg>
             ) : (
                 <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 border-r-purple-500 border-b-transparent border-l-transparent animate-spin"></div>
             )}
             
             <div className="absolute inset-0 flex items-center justify-center">
                 {progress > 0 ? (
                     <span className="text-xl font-bold text-white">{Math.round(progress)}%</span>
                 ) : (
                     <span className="text-3xl animate-bounce">🎬</span>
                 )}
             </div>
        </div>

        <h3 className="text-2xl font-black text-white mb-2 tracking-tight">
            AI 프로덕션 가동 중...
        </h3>
        
        <div className="space-y-6 w-full">
            <div className="flex flex-col items-center min-h-[3rem]">
                <p className="text-xl text-blue-400 font-bold whitespace-nowrap overflow-hidden text-ellipsis max-w-full leading-snug drop-shadow-sm animate-pulse px-4">
                    {displayMessage}
                </p>
                {eta > 0 && (
                    <p className="text-sm text-gray-400 mt-2 font-mono bg-gray-900/50 px-3 py-1 rounded-full border border-gray-700">
                        ⏳ 예상 소요 시간: 약 <span className="text-yellow-400 font-bold">{eta}초</span>
                    </p>
                )}
            </div>
            
            {/* Animated Tip Section */}
            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 min-h-[5rem] flex items-center justify-center transition-all duration-500 transform w-full">
                <p key={tipIndex} className="text-base text-gray-300 font-medium animate-fade-in-up break-keep">
                    {currentTips[tipIndex]}
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ProcessingOverlay;

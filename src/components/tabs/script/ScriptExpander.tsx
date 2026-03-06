import React, { useState, useMemo, useCallback } from 'react';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { evolinkChat } from '../../../services/evolinkService';

const MAX_CHARS = 30000;
/** 한국어 나레이션 기준 약 650자/분 (5,000자 ≈ 7~8분) */
const CHARS_PER_MIN = 650;

const LENGTH_OPTIONS: { label: string; value: number; duration: string }[] = [
  { label: '5천자', value: 5000, duration: '약 7~8분' },
  { label: '1만자', value: 10000, duration: '약 15분' },
  { label: '1만 5천자', value: 15000, duration: '약 23분' },
  { label: '2만자', value: 20000, duration: '약 30분' },
  { label: '3만자', value: 30000, duration: '약 46분' },
];

// const PRESERVE_OPTIONS: { id: PreserveOption; label: string }[] = [
//   { id: 'logic', label: '논리적 일관성' },
//   { id: 'emotion', label: '감정선' },
//   { id: 'plot', label: '플롯 기법' },
//   { id: 'dialogue', label: '대사 톤' },
//   { id: 'narrative', label: '서사 구조' },
// ];

export default function ScriptExpander() {
  const {
    generatedScript,
    finalScript, setFinalScript,
    isExpanding, startExpansion, finishExpansion,
    expansionTarget,
  } = useScriptWriterStore();

  const [selectedLength, setSelectedLength] = useState<number>(10000);
  // const [preserveOptions, setPreserveOptions] = useState<PreserveOption[]>(['logic', 'emotion']);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const currentScript = finalScript || generatedScript?.content || '';
  const currentLength = currentScript.length;
  const canExpand = currentLength < MAX_CHARS;
  const remainingChars = MAX_CHARS - currentLength;

  // 분량 추정 (한국어 기준 약 650자/분)
  const estimatedMinutes = Math.floor(currentLength / CHARS_PER_MIN);
  const estimatedSeconds = Math.round((currentLength / CHARS_PER_MIN - estimatedMinutes) * 60);

  // 원형 프로그레스 계산
  const progressPercent = useMemo(() => {
    return Math.min(100, Math.round((currentLength / MAX_CHARS) * 100));
  }, [currentLength]);

  const circumference = 2 * Math.PI * 40; // radius=40
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  // const togglePreserve = useCallback((opt: PreserveOption) => {
  //   setPreserveOptions((prev) =>
  //     prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
  //   );
  // }, []);

  const [expandError, setExpandError] = useState('');
  const [expandStep, setExpandStep] = useState(0);
  const [expandTotalSteps, setExpandTotalSteps] = useState(0);

  /** 1회 확장 호출 — 현재 대본을 stepTarget자까지 확장. 긴 대본은 후반부 위주로 확장. */
  const expandOnce = async (script: string, stepTarget: number): Promise<string> => {
    // 입력이 8000자 초과 시 앞부분 요약 + 뒷부분 전문으로 토큰 절약
    const MAX_INPUT = 8000;
    let userContent: string;
    if (script.length > MAX_INPUT) {
      const tail = script.slice(-MAX_INPUT);
      const headSummary = `[앞부분 ${(script.length - MAX_INPUT).toLocaleString()}자 요약: 대본 앞부분이 이어지는 내용입니다. 아래 뒷부분에 자연스럽게 이어붙여 전체를 확장하세요.]\n\n`;
      userContent = `다음 대본을 ${stepTarget.toLocaleString()}자 이상으로 확장해주세요. 현재 ${script.length.toLocaleString()}자입니다.

${headSummary}[대본 뒷부분 (최근 ${MAX_INPUT.toLocaleString()}자)]
${tail}

반드시 앞부분 내용을 유지하면서 뒷부분부터 자연스럽게 확장하세요. 확장된 전체 대본만 출력하세요.`;
    } else {
      userContent = `다음 대본을 ${stepTarget.toLocaleString()}자 이상으로 확장해주세요. 현재 ${script.length.toLocaleString()}자입니다.

[현재 대본]
${script}

스타일과 흐름을 유지하면서 확장하세요. 확장된 전체 대본만 출력하세요.`;
    }

    const res = await evolinkChat(
      [
        { role: 'system', content: '당신은 전문 영상 대본 작가입니다. 기존 대본을 자연스럽게 확장하여 더 풍성한 내용으로 만듭니다. 확장된 대본 텍스트만 출력하세요. JSON이나 마크다운 없이 순수 텍스트만 출력합니다.' },
        { role: 'user', content: userContent }
      ],
      { temperature: 0.7, maxTokens: 16000 }
    );
    const expanded = res.choices?.[0]?.message?.content || '';

    // 긴 대본의 경우: 앞부분 원본 + AI 확장 결과를 합침
    if (script.length > MAX_INPUT && expanded.length > 0) {
      const head = script.slice(0, script.length - MAX_INPUT);
      return head + '\n\n' + expanded;
    }
    return expanded;
  };

  const handleExpand = useCallback(async () => {
    if (isExpanding || !currentScript) return;
    startExpansion(selectedLength);
    setExpandError('');
    setExpandStep(0);

    try {
      let text = currentScript;
      // 단계 크기: 입력이 커질수록 작게 (API 타임아웃 방지)
      const STEP_SIZE = 5000;
      const MAX_STEPS = 10;
      const gap = selectedLength - text.length;
      const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(gap / STEP_SIZE)));
      setExpandTotalSteps(steps);

      for (let i = 0; i < steps && text.length < selectedLength * 0.9; i++) {
        setExpandStep(i + 1);
        const stepTarget = Math.min(selectedLength, text.length + STEP_SIZE);

        // 타임아웃 시 1회 재시도
        let expanded = '';
        for (let retry = 0; retry < 2; retry++) {
          try {
            expanded = await expandOnce(text, stepTarget);
            break;
          } catch (retryErr: unknown) {
            const msg = retryErr instanceof Error ? retryErr.message : '';
            if (retry === 0 && (msg.includes('524') || msg.includes('timeout') || msg.includes('네트워크'))) {
              console.warn(`[ScriptExpander] Step ${i+1} 타임아웃, 재시도...`);
              continue;
            }
            throw retryErr;
          }
        }

        if (expanded.length <= text.length + 200) break; // 진전 없으면 중단
        text = expanded;
        setFinalScript(text); // 매 단계 실시간 업데이트
      }

      if (text.length <= currentScript.length) {
        setExpandError('확장 결과가 원본보다 짧습니다. 다시 시도해주세요.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExpandError(`대본 확장 실패: ${msg}`);
    } finally {
      setExpandStep(0);
      setExpandTotalSteps(0);
      finishExpansion();
    }
  }, [isExpanding, currentScript, selectedLength, startExpansion, finishExpansion, setFinalScript]);

  const handleConfirmFinal = useCallback(() => {
    if (!currentScript) return;
    setFinalScript(currentScript);
  }, [currentScript, setFinalScript]);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">대본 확장</h3>
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="text-[13px] text-blue-400 hover:text-blue-300 underline"
          >
            상세 분석
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          현재 대본을 AI가 자연스럽게 확장합니다. 목표 글자수를 선택하세요.
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          최대 30,000자까지 확장 가능합니다. 확장 후 위 편집 영역에서 직접 수정할 수 있습니다.
        </p>
      </div>

      {/* 현재 대본 통계 + 원형 프로그레스 */}
      <div className="flex items-center gap-4 bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        {/* 원형 프로그레스 */}
        <div className="relative flex-shrink-0">
          <svg width="90" height="90" className="-rotate-90">
            <circle cx="45" cy="45" r="40" fill="none" stroke="#374151" strokeWidth="6" />
            <circle cx="45" cy="45" r="40" fill="none"
              stroke={progressPercent >= 100 ? '#ef4444' : progressPercent >= 75 ? '#f59e0b' : '#22c55e'}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-white">{progressPercent}%</span>
          </div>
        </div>

        {/* 통계 */}
        <div className="flex-1 space-y-1.5">
          <div className="text-sm text-gray-400">
            현재 대본 <span className="text-white font-bold">{currentLength.toLocaleString()}자</span> / {MAX_CHARS.toLocaleString()}자
          </div>
          <div className="text-sm text-gray-400">
            <span className="text-cyan-300 font-medium">{estimatedMinutes}분 {estimatedSeconds}초</span> 분량
          </div>
          {canExpand && (
            <div className="text-sm text-green-400">
              +{remainingChars.toLocaleString()}자 확장 가능
            </div>
          )}
        </div>
      </div>

      {/* 상세 분석 (토글) */}
      {showAnalysis && (
        <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/30 text-sm text-gray-400 space-y-1">
          <div>문장 수: {currentScript.split(/[.!?。！？\n]+/).filter(Boolean).length}개</div>
          <div>단락 수: {currentScript.split(/\n\n+/).filter(Boolean).length}개</div>
          <div>평균 문장 길이: {currentScript.length > 0
            ? Math.round(currentScript.length / Math.max(1, currentScript.split(/[.!?。！？\n]+/).filter(Boolean).length))
            : 0}자</div>
        </div>
      )}

      {/* 목표 확장 길이 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">목표 확장 길이</label>
        <p className="text-sm text-gray-500 mb-2">현재 분량보다 큰 목표만 선택 가능합니다.</p>
        <div className="flex flex-wrap gap-2">
          {LENGTH_OPTIONS.map((opt) => {
            const isSelected = selectedLength === opt.value;
            const isDisabled = opt.value <= currentLength;
            return (
              <button key={opt.value}
                onClick={() => !isDisabled && setSelectedLength(opt.value)}
                disabled={isDisabled}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                  ${isDisabled
                    ? 'opacity-30 cursor-not-allowed bg-gray-800 text-gray-500 border-gray-700'
                    : isSelected
                      ? 'bg-green-600/30 text-green-300 border-green-500/50'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                  }`}
              >
                <div>{opt.label}</div>
                <div className="text-sm mt-0.5 opacity-70">{opt.duration}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 확장 시 유지할 요소 — 비활성화 (추후 재활성화 가능) */}
      {/* <div>
        <label className="block text-xs text-gray-400 mb-1">확장 시 유지할 요소</label>
        <p className="text-xs text-gray-500 mb-2">선택한 요소는 확장 시 AI가 원본의 해당 요소를 최대한 보존합니다.</p>
        <div className="flex flex-wrap gap-2">
          {PRESERVE_OPTIONS.map((opt) => {
            const isActive = preserveOptions.includes(opt.id);
            return (
              <button key={opt.id} onClick={() => togglePreserve(opt.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${isActive
                    ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                  }`}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div> */}

      {/* 에러 표시 */}
      {expandError && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-sm text-red-400">{expandError}</p>
        </div>
      )}

      {/* 대본 확장 시작 버튼 */}
      <button onClick={handleExpand}
        disabled={isExpanding || !currentScript || !canExpand}
        className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600
          hover:from-green-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed
          text-white rounded-xl text-sm font-bold shadow-lg transition-all
          flex items-center justify-center gap-2">
        {isExpanding ? (
          <>
            <span className="animate-spin">&#9696;</span>
            {expandTotalSteps > 1
              ? `확장 중... ${expandStep}/${expandTotalSteps}단계 (${expansionTarget?.toLocaleString()}자 목표)`
              : `대본 확장 중... (${expansionTarget?.toLocaleString()}자 목표)`}
          </>
        ) : (
          <>대본 확장 시작</>
        )}
      </button>

      {/* 최종 대본 확정 */}
      {currentScript && (
        <div className="border-t border-gray-700/30 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">최종 대본</span>
            <span className="text-sm px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-500/50">
              {currentLength.toLocaleString()}자
            </span>
          </div>
          <button onClick={handleConfirmFinal}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-violet-600
              hover:from-blue-500 hover:to-violet-500
              text-white rounded-lg text-sm font-bold shadow-md transition-all">
            이 대본 확정 등록
          </button>
        </div>
      )}
    </div>
  );
}

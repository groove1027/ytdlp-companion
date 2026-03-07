import React, { useState, useRef, useCallback } from 'react';
import { evolinkChat } from '../../../services/evolinkService';
import type { EvolinkChatMessage } from '../../../services/evolinkService';

type AnalysisPreset = 'tikitaka' | 'snack';

interface AnalysisResult {
  script: string;
  editPoints: string;
}

// 티키타카 대본 지침서 (크로스 더빙 숏폼)
const TIKITAKA_SCRIPT_SYSTEM = `너는 '크로스 더빙(Cross-Dubbing) 숏폼 제작 전문가'다.

## 크로스 더빙 핵심 원리
- 더빙(설명/빌드업) <-> 원본(리액션/펀치라인)이 핑퐁처럼 오가며 쉴 틈 없는 오디오 밀도를 만든다
- '번역'이 아니라 '초월 번역(해설)' — 상황을 맛깔나게 요약

## 핑퐁 스크립트 3대 원칙
1. 원본 대사를 침범하지 마라 — 핵심 대사("Oh my god!", "It's terrible!")는 살리고 빈 공간을 더빙으로 채운다
2. 더빙은 '빌드업'이다 — 다음에 올 원본의 기대감을 조성
3. 대화하듯 써라 — 시청자에게 말을 걸거나 혼잣말하듯

## 만능 스크립트 템플릿
1. [더빙] 후킹(Hook): "OOO는 과연 실제로 가능할까?"
2. [원본] 증거(Proof): 짧고 강렬한 시각적/청각적 장면
3. [더빙] 전개(Bridge): "그래서 참지 못하고 바로 OO했습니다."
4. [원본] 현장(Reality): 현장 도착/물건 개봉
5. [더빙] 절정(Climax): "드디어 대망의 순간! 과연 그 결과는?"
6. [원본] 펀치라인: 핵심 리액션
7. [더빙] 결말(Outro): "결국 제 지갑만 털렸네요."

## 컷 분류 기준
- 살릴 구간(Source-Alive): 오디오 볼륨 급격히 커지는 구간, 극적 표정 변화 클로즈업, 짧은 감탄사
- 덮을 구간(Dubbing-Cover): 단순 이동/준비 동작, 지루한 대화, 오디오가 비거나 잡음만 있는 구간

## 출력 형식
타임코드(구간) | 구분 | 화면 내용 | 오디오 내용 | 편집 가이드

사용자가 제공한 영상/링크를 분석하여 60초 크로스 더빙 대본을 작성하라.
반드시 [더빙]과 [원본] 구간을 교차 배치하고, 각 구간의 타임코드를 명시하라.`;

// 티키타카 편집점 지침서
const TIKITAKA_EDITPOINT_SYSTEM = `너는 '마스터 에디팅 아키텍트'다. 스크립트와 비디오를 나노 단위로 동기화하는 편집점 설계 전문가다.

## 절대 원칙
1. 데이터 무결성: [소스 ID] + [정확한 타임코드] + [장면 내용]은 반드시 한 세트
2. 근사치 엄금: "대략 1분 쯤" 등 추상적 표현 금지
3. 타임코드 형식: MM:SS.ms (밀리초 단위)
4. 컷 경계 안전 마진: ±0.1초(100ms)

## 모드 구분
- [N] 내레이션 턴: AI 내레이션 ON / 원본 MUTE. 다이내믹 컷 분할 사용 (슬로우 모션 절대 금지)
- [S] 현장음-대사: 원본 대사 ON / 내레이션 STOP. 립싱크 정확히 맞춤
- [A] 현장음-액션: 원본 현장음 ON (비명, 타격음, 환호 등) / 내레이션 STOP

## 물리적 시간 법칙
- 한국어 내레이션: 평균 4글자당 1초
- 내레이션 시간이 길면 슬로우 모션 대신 정배속 컷 분할: 여러 짧은 컷을 쌓아서 시간 채움

## 출력 형식 (마스터 편집 테이블)
| 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 (MM:SS.ms) |

사용자가 제공한 영상/링크와 대본을 기반으로 정밀한 편집점 테이블을 작성하라.
타임코드가 누락되거나 불일치하는 행이 있으면 처음부터 다시 수행하라.`;

// 스낵형 (추후 추가 예정)
const SNACK_SCRIPT_SYSTEM = `너는 '스낵형 숏폼 대본 전문가'다.
(스낵형 지침서는 곧 업데이트 예정입니다. 현재는 기본 분석을 제공합니다.)

사용자가 제공한 영상을 분석하여:
1. 핵심 장면을 추출하고
2. 30~60초 분량의 간결한 대본을 작성하라
3. 시청자의 이목을 끄는 후킹 → 핵심 → 반전 구조를 사용하라`;

const SNACK_EDITPOINT_SYSTEM = `너는 '스낵형 숏폼 편집 전문가'다.
(스낵형 편집점 지침서는 곧 업데이트 예정입니다. 현재는 기본 편집점을 제공합니다.)

사용자가 제공한 대본과 영상 정보를 기반으로:
1. 빠른 컷 전환 (1~3초 단위)
2. 핵심 장면 강조 (줌인/줌아웃)
3. 타임코드 포함 편집 테이블 작성`;

const PRESET_INFO: Record<AnalysisPreset, { label: string; description: string; color: string }> = {
  tikitaka: {
    label: '티키타카',
    description: '크로스 더빙 스타일 — 더빙과 원본이 핑퐁처럼 교차하는 숏폼',
    color: 'blue',
  },
  snack: {
    label: '스낵형',
    description: '빠른 컷 전환의 간결한 숏폼 (지침서 업데이트 예정)',
    color: 'amber',
  },
};

const VideoAnalysisRoom: React.FC = () => {
  const [inputMode, setInputMode] = useState<'upload' | 'youtube'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<AnalysisPreset | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'script' | 'editpoints'>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'script' | 'editpoints' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasInput = inputMode === 'youtube' ? youtubeUrl.trim().length > 0 : uploadedFile !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setResult(null);
      setError(null);
    }
  };

  const handleCopy = useCallback(async (field: 'script' | 'editpoints') => {
    if (!result) return;
    const text = field === 'script' ? result.script : result.editPoints;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, [result]);

  const handleAnalyze = async (preset: AnalysisPreset) => {
    if (!hasInput) return;
    setSelectedPreset(preset);
    setIsAnalyzing(true);
    setAnalysisPhase('script');
    setResult(null);
    setError(null);

    const inputDescription = inputMode === 'youtube'
      ? `YouTube 영상 URL: ${youtubeUrl.trim()}`
      : `업로드된 영상 파일: ${uploadedFile?.name} (${((uploadedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)`;

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM : SNACK_SCRIPT_SYSTEM;
    const editSystem = preset === 'tikitaka' ? TIKITAKA_EDITPOINT_SYSTEM : SNACK_EDITPOINT_SYSTEM;

    try {
      // 1단계: 대본 생성
      const scriptMessages: EvolinkChatMessage[] = [
        { role: 'system', content: scriptSystem },
        { role: 'user', content: `다음 영상을 분석하여 대본을 작성해주세요.\n\n${inputDescription}\n\n영상의 주요 내용을 파악하고, 지침서에 따라 대본을 작성해주세요.` },
      ];

      const scriptResponse = await evolinkChat(scriptMessages, { temperature: 0.7, maxTokens: 4000 });
      const scriptText = scriptResponse.choices[0]?.message?.content || '';

      // 2단계: 편집점 생성
      setAnalysisPhase('editpoints');
      const editMessages: EvolinkChatMessage[] = [
        { role: 'system', content: editSystem },
        { role: 'user', content: `다음 영상 정보와 대본을 기반으로 편집점 테이블을 작성해주세요.\n\n[영상 정보]\n${inputDescription}\n\n[작성된 대본]\n${scriptText}\n\n위 대본을 기반으로 정밀한 편집점 테이블을 작성해주세요.` },
      ];

      const editResponse = await evolinkChat(editMessages, { temperature: 0.5, maxTokens: 4000 });
      const editText = editResponse.choices[0]?.message?.content || '';

      setResult({ script: scriptText, editPoints: editText });
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  return (
    <div className="space-y-6">
      {/* 입력 모드 선택 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
            🎬
          </span>
          영상 소스 입력
        </h2>

        {/* 입력 모드 토글 */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setInputMode('youtube'); setUploadedFile(null); setResult(null); setError(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'youtube'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
            }`}
          >
            YouTube 링크
          </button>
          <button
            type="button"
            onClick={() => { setInputMode('upload'); setYoutubeUrl(''); setResult(null); setError(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'upload'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
            }`}
          >
            영상 업로드
          </button>
        </div>

        {/* YouTube URL 입력 */}
        {inputMode === 'youtube' && (
          <div className="relative">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => { setYoutubeUrl(e.target.value); setResult(null); setError(null); }}
              placeholder="YouTube 영상 URL을 붙여넣으세요 (예: https://youtube.com/watch?v=...)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
            />
            {youtubeUrl && (
              <button
                type="button"
                onClick={() => setYoutubeUrl('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}

        {/* 파일 업로드 */}
        {inputMode === 'upload' && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              className="hidden"
            />
            {uploadedFile ? (
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3">
                <span className="text-blue-400 text-lg">🎥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-gray-500 text-xs">{(uploadedFile.size / 1024 / 1024).toFixed(1)}MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-600 rounded-lg py-8 flex flex-col items-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
              >
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-gray-400 text-sm">클릭하여 영상 파일을 선택하세요</span>
                <span className="text-gray-600 text-xs">MP4, MOV, AVI 등</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 프리셋 선택 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
            🎯
          </span>
          분석 프리셋
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.entries(PRESET_INFO) as [AnalysisPreset, typeof PRESET_INFO['tikitaka']][]).map(([key, info]) => {
            const isSelected = selectedPreset === key && isAnalyzing;
            const colorMap: Record<string, { bg: string; border: string; text: string; hoverBg: string }> = {
              blue: { bg: 'bg-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', hoverBg: 'hover:bg-blue-600/20' },
              amber: { bg: 'bg-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', hoverBg: 'hover:bg-amber-600/20' },
            };
            const c = colorMap[info.color] || colorMap.blue;

            return (
              <button
                key={key}
                type="button"
                disabled={!hasInput || isAnalyzing}
                onClick={() => handleAnalyze(key)}
                className={`
                  relative p-5 rounded-xl border text-left transition-all
                  ${isSelected
                    ? `${c.bg} ${c.border} ring-1 ring-${info.color}-500/30`
                    : `bg-gray-900/50 border-gray-600/50 ${c.hoverBg} hover:border-gray-500`
                  }
                  ${(!hasInput || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-base font-bold ${c.text}`}>{info.label}</span>
                  {isSelected && (
                    <div className={`w-5 h-5 border-2 border-gray-600 border-t-${info.color}-400 rounded-full animate-spin`} />
                  )}
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{info.description}</p>
              </button>
            );
          })}
        </div>

        {!hasInput && (
          <p className="text-gray-500 text-sm mt-3">영상 소스를 먼저 입력해주세요.</p>
        )}
      </div>

      {/* 분석 진행 상태 */}
      {isAnalyzing && (
        <div className="bg-gray-800/50 rounded-xl border border-blue-500/20 p-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            <div>
              <p className="text-white font-semibold">
                {analysisPhase === 'script' ? '대본 생성 중...' : '편집점 분석 중...'}
              </p>
              <p className="text-gray-400 text-sm">
                {analysisPhase === 'script'
                  ? 'AI가 영상을 분석하여 대본을 작성하고 있습니다.'
                  : '대본을 기반으로 정밀한 편집점을 설계하고 있습니다.'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <div className={`flex-1 h-1.5 rounded-full ${analysisPhase === 'script' ? 'bg-blue-500 animate-pulse' : 'bg-blue-500'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${analysisPhase === 'editpoints' ? 'bg-blue-500 animate-pulse' : analysisPhase === 'script' ? 'bg-gray-700' : 'bg-blue-500'}`} />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>1. 대본 생성</span>
            <span>2. 편집점 분석</span>
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">분석 오류</p>
            <p className="text-red-300/70 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* 결과 출력 */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 대본 */}
          <ResultBox
            title="대본"
            icon="📝"
            content={result.script}
            onCopy={() => handleCopy('script')}
            isCopied={copiedField === 'script'}
            accentColor="blue"
          />

          {/* 편집점 */}
          <ResultBox
            title="편집점"
            icon="✂️"
            content={result.editPoints}
            onCopy={() => handleCopy('editpoints')}
            isCopied={copiedField === 'editpoints'}
            accentColor="blue"
          />
        </div>
      )}
    </div>
  );
};

// 결과 출력 박스 컴포넌트
const ResultBox: React.FC<{
  title: string;
  icon: string;
  content: string;
  onCopy: () => void;
  isCopied: boolean;
  accentColor: string;
}> = ({ title, icon, content, onCopy, isCopied }) => (
  <div className="bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col max-h-[600px]">
    {/* 헤더 */}
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <h3 className="text-white font-bold">{title}</h3>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${isCopied
            ? 'bg-green-600/20 text-green-400 border border-green-500/30'
            : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-white hover:bg-gray-700'
          }
        `}
      >
        {isCopied ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            <span>복사됨</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <span>복사</span>
          </>
        )}
      </button>
    </div>
    {/* 콘텐츠 */}
    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
    </div>
  </div>
);

export default VideoAnalysisRoom;

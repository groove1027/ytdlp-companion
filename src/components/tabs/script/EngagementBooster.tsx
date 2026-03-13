import React, { useState, useCallback } from 'react';
import { evolinkChat } from '../../../services/evolinkService';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';

const WEAK = 50;

interface ParagraphInfo {
  name: string; engagement: number; hook: number; tension: number;
  label: string; text: string; issues: string[];
}

interface Enhanced {
  index: number; original: string; enhanced: string; changes: string; applied: boolean;
}

interface Props {
  data: ParagraphInfo[];
  paragraphs: string[];
  onClose: () => void;
}

export default function EngagementBooster({ data, paragraphs, onClose }: Props) {
  const { setFinalScript } = useScriptWriterStore();
  const { requireAuth } = useAuthGuard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Enhanced[]>([]);

  const weakParas = data.filter(d => d.engagement < WEAK);

  const handleBoost = useCallback(async () => {
    if (!requireAuth('AI 참여도 강화')) return;
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const weakInfo = weakParas.map(w =>
        `- ${w.name}번 문단 (${w.label}, 참여도 ${w.engagement}): ${w.issues.join(', ') || '전반적으로 약함'}`
      ).join('\n');

      const response = await evolinkChat([
        {
          role: 'system',
          content: `당신은 유튜브 영상 대본의 시청자 참여도 전문가입니다.
약한 구간의 참여도를 높이되, 원래 정보와 문맥은 100% 유지하세요.

강화 원칙:
1. 훅 강화: 호기심 자극 질문, 놀라운 사실, 도발적 시작문 추가
2. 긴장감: 짧은 문장(25자 이하) 교차 배치, "하지만/갑자기/그런데" 등 반전 단어, 시간적 긴박함 삽입
3. 참여 유도: 시청자에게 직접 말 걸기, 공감 유도, "이거 아셨어요?" 등 삽입
4. 원래 내용/정보/논리는 절대 삭제하지 말 것 — 표현과 구조만 변형

반드시 JSON으로만 응답하세요.`,
        },
        {
          role: 'user',
          content: `다음 대본에서 참여도가 낮은 구간을 강화해주세요.

[전체 대본 — 문단 번호 포함]
${paragraphs.map((p, i) => `[${i + 1}번] ${p}`).join('\n\n')}

[약한 구간 진단]
${weakInfo}

위의 약한 구간만 강화하여 아래 JSON 형식으로 출력하세요:
{"results": [{"index": 문단번호, "enhanced": "강화된 문단 전문", "changes": "무엇을 바꿨는지 한줄 설명"}]}`,
        },
      ], {
        temperature: 0.7,
        maxTokens: 8192,
        responseFormat: { type: 'json_object' },
      });

      const text = response.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(text);
      const items: Enhanced[] = (parsed.results || [])
        .map((r: { index: number; enhanced: string; changes: string }) => ({
          index: r.index - 1, // 0-based
          original: paragraphs[r.index - 1] || '',
          enhanced: r.enhanced || '',
          changes: r.changes || '',
          applied: false,
        }))
        .filter((r: Enhanced) => r.original && r.enhanced && r.index >= 0 && r.index < paragraphs.length);

      if (items.length === 0) {
        setError('AI가 강화 결과를 생성하지 못했습니다. 다시 시도해주세요.');
      } else {
        setResults(items);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`AI 강화 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [loading, weakParas, paragraphs, requireAuth]);

  const applyOne = useCallback((targetIdx: number) => {
    const result = results.find(r => r.index === targetIdx);
    if (!result) return;
    // 항상 최신 스크립트에서 문단 추출 (이미 적용된 변경사항 반영)
    const store = useScriptWriterStore.getState();
    const current = store.finalScript || store.generatedScript?.content || '';
    const curParas = current.split(/\n{2,}/).filter(Boolean);
    if (targetIdx < curParas.length) {
      curParas[targetIdx] = result.enhanced;
      setFinalScript(curParas.join('\n\n'));
    }
    setResults(prev => prev.map(r => r.index === targetIdx ? { ...r, applied: true } : r));
  }, [results, setFinalScript]);

  const applyAll = useCallback(() => {
    const store = useScriptWriterStore.getState();
    const current = store.finalScript || store.generatedScript?.content || '';
    const curParas = current.split(/\n{2,}/).filter(Boolean);
    for (const r of results) {
      if (!r.applied && r.index < curParas.length) curParas[r.index] = r.enhanced;
    }
    setFinalScript(curParas.join('\n\n'));
    setResults(prev => prev.map(r => ({ ...r, applied: true })));
  }, [results, setFinalScript]);

  return (
    <div className="bg-violet-900/10 rounded-xl border border-violet-500/20 p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-violet-300">AI 참여도 강화</span>
          <span className="text-xs text-gray-500">약한 {weakParas.length}개 구간을 AI가 리라이트</span>
        </div>
        <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">닫기</button>
      </div>

      {/* 강화 전: 대상 목록 + 시작 버튼 */}
      {results.length === 0 && !loading && (
        <div className="space-y-2">
          <div className="bg-gray-900/40 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-bold text-gray-400">강화 대상</p>
            {weakParas.map(w => (
              <div key={w.name} className="flex items-center gap-2 text-xs">
                <span className="text-red-400 font-bold w-8">{w.name}번</span>
                <span className="text-gray-500 w-14">{w.label}</span>
                <span className="text-red-300/70 w-16">참여도 {w.engagement}</span>
                <span className="text-gray-600 truncate">{w.issues.join(', ') || '전반적으로 약함'}</span>
              </div>
            ))}
          </div>
          <button onClick={handleBoost}
            className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2">
            AI로 강화 시작
          </button>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="text-center py-8 space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
          <p className="text-sm text-violet-300 font-medium">Gemini 3.1 Pro가 약한 구간을 강화하고 있어요...</p>
          <p className="text-xs text-gray-500">원본 내용은 유지하면서 참여도만 높입니다</p>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg space-y-1">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={handleBoost} className="text-xs text-red-300 underline">다시 시도</button>
        </div>
      )}

      {/* 결과: Before/After 비교 */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-green-400">{results.length}개 구간 강화 완료</p>
            {results.some(r => !r.applied) && (
              <button onClick={applyAll}
                className="px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-xs font-bold transition-all">
                전체 적용
              </button>
            )}
          </div>

          {results.map(r => (
            <div key={r.index} className={`rounded-lg border p-3 space-y-2 ${r.applied ? 'border-green-500/30 bg-green-900/10' : 'border-gray-700/30 bg-gray-900/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{r.index + 1}번 문단</span>
                  <span className="text-[10px] text-violet-300/70">{r.changes}</span>
                </div>
                {r.applied ? (
                  <span className="text-xs text-green-400 font-bold">적용됨</span>
                ) : (
                  <button onClick={() => applyOne(r.index)}
                    className="px-2 py-1 bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 rounded text-xs font-bold transition-colors">
                    이것만 적용
                  </button>
                )}
              </div>

              {/* Before */}
              <div>
                <p className="text-[10px] font-bold text-red-400/60 mb-0.5">Before</p>
                <p className="text-xs text-gray-500 leading-relaxed bg-red-900/10 rounded p-2 border-l-2 border-red-500/30 overflow-hidden"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {r.original}
                </p>
              </div>

              {/* After */}
              <div>
                <p className="text-[10px] font-bold text-green-400/60 mb-0.5">After</p>
                <p className="text-xs text-gray-300 leading-relaxed bg-green-900/10 rounded p-2 border-l-2 border-green-500/30 overflow-hidden"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {r.enhanced}
                </p>
              </div>
            </div>
          ))}

          {/* 전체 적용 후 안내 */}
          {results.every(r => r.applied) && (
            <div className="text-center py-2 space-y-1">
              <p className="text-xs text-green-400 font-bold">모든 강화가 적용되었습니다</p>
              <p className="text-[10px] text-gray-500">위 히트맵에서 점수 변화를 확인하세요</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

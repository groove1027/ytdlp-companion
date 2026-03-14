import React, { useState, useCallback } from 'react';
import { evolinkChatStream } from '../../../services/evolinkService';
import type { EvolinkChatMessage } from '../../../services/evolinkService';
import { showToast } from '../../../stores/uiStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';

// ── 체크리스트 데이터 ──

interface CheckItem {
  id: string;
  label: string;
  desc: string;
}

interface CheckSection {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  color: string;          // tailwind accent
  items: CheckItem[];
}

const SECTIONS: CheckSection[] = [
  {
    id: 'policy',
    icon: '🛡️',
    title: '정책 안전 검토',
    subtitle: '커뮤니티 가이드 + 광고주 친화',
    color: 'red',
    items: [
      { id: 'p1', label: '스팸/기만 행위 없음', desc: '현혹적 썸네일·제목, 사기, 스팸 없음' },
      { id: 'p2', label: '민감 콘텐츠 없음', desc: '아동 안전, 과도한 노출, 자해 조장 없음' },
      { id: 'p3', label: '폭력/위험 콘텐츠 없음', desc: '괴롭힘, 위험행동 조장 없음' },
      { id: 'p4', label: '규제 상품 없음', desc: '총기, 불법 물품, 주류 부적절 노출 없음' },
      { id: 'p5', label: '광고 적합 언어', desc: '과도한 욕설·비속어 없음' },
      { id: 'p6', label: '혐오/차별 없음', desc: '특정 집단 차별·혐오 표현 없음' },
    ],
  },
  {
    id: 'quality',
    icon: '🧐',
    title: '품질 정밀 검수',
    subtitle: '자막·용어·동기화 확인',
    color: 'amber',
    items: [
      { id: 'q1', label: '자막 오탈자 없음', desc: '맞춤법, 띄어쓰기, 오타 확인 완료' },
      { id: 'q2', label: '전문 용어 정확', desc: '문맥에 맞는 정확한 용어 사용' },
      { id: 'q3', label: '영상-자막 동기화', desc: '화면과 자막 내용이 정확히 일치' },
    ],
  },
  {
    id: 'thumbnail',
    icon: '📸',
    title: '썸네일 전략',
    subtitle: '클릭률 극대화 장면 선정',
    color: 'pink',
    items: [
      { id: 't1', label: '호기심 유발 장면 선정', desc: '정지 화면만으로 스크롤 멈춤 효과' },
      { id: 't2', label: '자막 텍스트 포함', desc: '해당 타임라인의 실제 자막 함께 기재' },
    ],
  },
  {
    id: 'seo',
    icon: '🚀',
    title: 'SEO 최적화',
    subtitle: '제목·설명·태그 전략',
    color: 'blue',
    items: [
      { id: 's1', label: '설명 700자 (교육적 가치)', desc: '지식 훅 → 핵심 요약 → 단호한 마무리' },
      { id: 's2', label: '공개 해시태그 5개', desc: '#shorts 금지, 핵심 명사 위주 대형 키워드' },
      { id: 's3', label: '비공개 태그 꽉 채움', desc: '한국어 중심, 오타·유의어 포함, 한도 끝까지' },
      { id: 's4', label: '구독/좋아요 유도 멘트 없음', desc: '설명란에 시청 유도 멘트 삽입 금지' },
    ],
  },
  {
    id: 'shopping',
    icon: '🛒',
    title: '쇼핑 연계',
    subtitle: '쿠팡 파트너스 상품 매칭',
    color: 'emerald',
    items: [
      { id: 'sh1', label: '비주얼 일치 상품 매칭', desc: '영상 속 제품과 시각적으로 동일한 상품 추천' },
      { id: 'sh2', label: '검색 키워드 정리', desc: '상품 특징 기반 추천 검색어 준비' },
    ],
  },
];

// ── AI 분석 프롬프트 ──

const GUIDE_SYSTEM_PROMPT = `당신은 유튜브 쇼츠 업로드 전문 컨설턴트입니다.
사용자가 제공하는 영상 분석 결과를 바탕으로 아래 5가지 영역을 정밀 검토하세요.

각 영역마다 [통과/주의/위험] 등급과 구체적 근거를 제시하세요.
형식은 반드시 아래를 따르세요:

## 🛡️ 정책 안전 검토
등급: [🟢 안전 | 🟡 주의 | 🔴 위험]
- (구체적 근거 2~3줄)

## 🧐 품질 검수
등급: [🟢 양호 | 🟡 수정 권장 | 🔴 수정 필수]
- (구체적 근거)

## 📸 썸네일 추천
- Best Pick: [타임코드] + [자막 텍스트] + (선정 이유)
- Alt 1: [타임코드] + [자막 텍스트]
- Alt 2: [타임코드] + [자막 텍스트]

## 🚀 SEO 전략
- 추천 제목 3개 (각 40자 이내)
- 설명 초안 (700자 내외, 교육적 가치 중심)
- 공개 해시태그 5개
- 비공개 태그 (쉼표 구분, 한국어 중심)

## 🛒 쇼핑 연계
- 매칭 가능 상품 키워드 (없으면 "해당 없음")

모든 내용은 한국어로 작성하세요.`;

// ── 컴포넌트 ──

interface Props {
  rawResult: string;
  versions: { title: string; concept: string }[];
  onAiResultChange?: (result: string) => void;
}

const UploadMasterGuide: React.FC<Props> = ({ rawResult, versions, onAiResultChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [aiResult, setAiResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAiResult, setShowAiResult] = useState(false);
  const { requireAuth } = useAuthGuard();

  const totalItems = SECTIONS.reduce((sum, s) => sum + s.items.length, 0);
  const checkedCount = Object.values(checked).filter(Boolean).length;
  const allChecked = checkedCount === totalItems;

  const toggleCheck = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resetChecklist = () => {
    setChecked({});
    setAiResult('');
    setShowAiResult(false);
  };

  // AI 자동 분석
  const handleAiAnalysis = useCallback(async () => {
    if (!requireAuth('업로드 마스터 분석')) return;
    setIsAnalyzing(true);
    setAiResult('');
    setShowAiResult(true);

    try {
      const versionSummary = versions.slice(0, 3).map((v, i) =>
        `버전 ${i + 1}: ${v.title}\n컨셉: ${v.concept}`
      ).join('\n\n');

      const userMsg = `아래는 영상 분석 결과입니다. 업로드 마스터 지침서에 따라 정밀 검토해주세요.\n\n${versionSummary}\n\n---\n분석 원문 (앞부분 2000자):\n${rawResult.slice(0, 2000)}`;

      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: GUIDE_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ];

      let fullText = '';
      await evolinkChatStream(messages, (chunk) => {
        fullText += chunk;
        setAiResult(fullText);
      });

      // AI 분석 완료 시 모든 체크박스 자동 체크
      const allIds: Record<string, boolean> = {};
      SECTIONS.forEach(s => s.items.forEach(it => { allIds[it.id] = true; }));
      setChecked(allIds);
      onAiResultChange?.(fullText);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`분석 실패: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [rawResult, versions, requireAuth, onAiResultChange]);

  const colorMap: Record<string, { bg: string; border: string; text: string; check: string }> = {
    red:     { bg: 'bg-red-500/10',     border: 'border-red-500/20',     text: 'text-red-400',     check: 'accent-red-500' },
    amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400',   check: 'accent-amber-500' },
    pink:    { bg: 'bg-pink-500/10',     border: 'border-pink-500/20',    text: 'text-pink-400',    check: 'accent-pink-500' },
    blue:    { bg: 'bg-blue-500/10',     border: 'border-blue-500/20',    text: 'text-blue-400',    check: 'accent-blue-500' },
    emerald: { bg: 'bg-emerald-500/10',  border: 'border-emerald-500/20', text: 'text-emerald-400', check: 'accent-emerald-500' },
  };

  return (
    <div className="bg-gray-800/40 rounded-2xl border border-blue-500/20 overflow-hidden">
      {/* 헤더 — 토글 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-800/60 transition-colors"
      >
        <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-sm shadow-md">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </span>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-blue-400">업로드 마스터 지침서</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              allChecked
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'
            }`}>
              {checkedCount}/{totalItems}
            </span>
          </div>
          <p className="text-[11px] text-gray-500">업로드 전 정책·품질·SEO 최적화 체크리스트</p>
        </div>
        <svg className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 본문 */}
      {isOpen && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-700/30 pt-4">
          {/* AI 분석 + 초기화 버튼 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAiAnalysis}
              disabled={isAnalyzing}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isAnalyzing
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  AI 분석 중...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  AI 자동 분석
                </>
              )}
            </button>
            <button
              type="button"
              onClick={resetChecklist}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-700/60 text-gray-400 border border-gray-600/30 hover:bg-gray-700 transition-all"
            >
              초기화
            </button>
          </div>

          {/* AI 분석 결과 */}
          {showAiResult && (
            <div className="bg-gray-900/60 border border-blue-500/20 rounded-xl p-4 max-h-[400px] overflow-y-auto">
              {aiResult ? (
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{aiResult}</div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  분석 결과를 생성하고 있습니다...
                </div>
              )}
            </div>
          )}

          {/* 체크리스트 섹션들 */}
          {SECTIONS.map((section) => {
            const c = colorMap[section.color] || colorMap.blue;
            const sectionChecked = section.items.filter(it => checked[it.id]).length;
            const sectionDone = sectionChecked === section.items.length;
            return (
              <div key={section.id} className={`rounded-xl border ${c.border} ${c.bg} p-3 space-y-2`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{section.icon}</span>
                  <span className={`text-xs font-bold ${c.text}`}>{section.title}</span>
                  <span className="text-[10px] text-gray-500">{section.subtitle}</span>
                  {sectionDone && (
                    <span className="ml-auto text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                      OK
                    </span>
                  )}
                </div>
                {section.items.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-2.5 cursor-pointer group py-1"
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[item.id]}
                      onChange={() => toggleCheck(item.id)}
                      className={`mt-0.5 w-4 h-4 rounded border-gray-600 bg-gray-800 ${c.check} cursor-pointer`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium ${checked[item.id] ? 'text-gray-500 line-through' : 'text-gray-200'} transition-colors`}>
                        {item.label}
                      </span>
                      <p className="text-[10px] text-gray-600 leading-tight">{item.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            );
          })}

          {/* 전체 통과 배지 */}
          {allChecked && (
            <div className="text-center py-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <span className="text-sm font-bold text-green-400">
                모든 항목 통과 — 업로드 준비 완료!
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadMasterGuide;

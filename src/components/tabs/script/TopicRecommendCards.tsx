import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useInstinctStore } from '../../../stores/instinctStore';
import type { TopicRecommendation } from '../../../types';

interface TopicRecommendCardsProps {
  onSelect: (topic: TopicRecommendation) => void;
}

/** 번호 원 색상 (1=red, 2=orange, 3=yellow, 4=green, 5=blue) */
const NUMBER_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500 text-gray-900',
  4: 'bg-green-500',
  5: 'bg-blue-500',
};

/** 바이럴 점수 레벨 */
const getViralLevel = (score: number): { label: string; className: string } => {
  if (score >= 85) return { label: '높음', className: 'bg-red-500/20 text-red-400 border-red-500/40' };
  if (score >= 70) return { label: '중간', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' };
  return { label: '낮음', className: 'bg-gray-600/30 text-gray-400 border-gray-600/40' };
};

/** 조회수 포맷 (예: 5000000 -> "500만") */
const formatViewCount = (raw: string) => {
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return raw;
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return raw;
};

const TopicRecommendCards: React.FC<TopicRecommendCardsProps> = ({ onSelect }) => {
  const recommendedTopics = useInstinctStore(s => s.recommendedTopics);
  const selectedTopicId = useInstinctStore(s => s.selectedTopicId);
  const selectTopic = useInstinctStore(s => s.selectTopic);
  const isRecommending = useInstinctStore(s => s.isRecommending);
  const recommendProgress = useInstinctStore(s => s.recommendProgress);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ESC 키로 접기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedId) {
        setExpandedId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedId]);

  // 외부 클릭으로 접기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (expandedId && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expandedId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  const handleSelect = useCallback((topic: TopicRecommendation) => {
    // 이미 선택된 아이템을 다시 클릭하면 선택 해제
    if (selectedTopicId === topic.id) {
      selectTopic(null);
    } else {
      selectTopic(topic.id);
      onSelect(topic);
    }
  }, [selectedTopicId, selectTopic, onSelect]);

  // 추천 중: 프로그레스 표시
  if (isRecommending) {
    return (
      <div className="mt-6 p-6 bg-gray-800/60 border border-gray-700 rounded-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-purple-300">
            {recommendProgress.step || 'AI 소재 추천 준비 중...'}
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 transition-all duration-500 ease-out"
            style={{
              width: `${Math.max(recommendProgress.percent, 2)}%`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 text-right">
          {recommendProgress.percent}%
        </p>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  // 추천 결과 없음
  if (recommendedTopics.length === 0) return null;

  return (
    <div className="mt-6" ref={containerRef}>
      <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
        <span className="text-lg">&#x1F4A1;</span> AI 추천 소재 ({recommendedTopics.length})
      </h3>

      <div className="space-y-1.5">
        {recommendedTopics.map((topic, index) => {
          const isExpanded = expandedId === topic.id;
          const isSelected = selectedTopicId === topic.id;
          const viral = getViralLevel(topic.estimatedViralScore);
          const numColor = NUMBER_COLORS[(index + 1)] || 'bg-gray-500';

          return (
            <div
              key={topic.id}
              className={`
                rounded-lg border transition-all duration-200 overflow-hidden
                ${isSelected ? 'border-purple-500 bg-purple-500/5' : 'border-gray-700/60 bg-gray-800/50'}
                ${isExpanded ? 'shadow-lg' : ''}
              `}
            >
              {/* 접힌 상태: 한 줄 행 */}
              <button
                type="button"
                onClick={() => toggleExpand(topic.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700/30 transition-colors"
              >
                {/* 번호 원 */}
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${numColor}`}>
                  {index + 1}
                </span>

                {/* 제목 */}
                <span className="flex-1 text-sm font-bold text-white truncate">
                  {topic.title}
                </span>

                {/* 바이럴 점수 뱃지 */}
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${viral.className}`}>
                  {viral.label}
                </span>

                {/* 선택 표시 */}
                <span
                  className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-purple-400 bg-purple-500 text-white'
                      : 'border-gray-600 bg-transparent'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(topic);
                  }}
                >
                  {isSelected && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>

                {/* 펼침 화살표 */}
                <svg
                  className={`shrink-0 w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* 펼친 상태: 상세 정보 */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-700/40 space-y-3">
                  {/* 제목 (크게) */}
                  <h4 className="text-lg font-bold text-white leading-snug">
                    {topic.title}
                  </h4>

                  {/* 훅 문장 */}
                  <p className="text-sm text-yellow-300 italic">
                    <span className="not-italic font-semibold text-yellow-400">훅: </span>
                    &ldquo;{topic.hook}&rdquo;
                  </p>

                  {/* 줄거리 */}
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {topic.synopsis}
                  </p>

                  {/* 참고 영상 */}
                  {topic.referenceVideos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 mb-1">
                        &#x1F4CA; 참고 영상
                      </p>
                      <ul className="space-y-0.5">
                        {topic.referenceVideos.slice(0, 3).map((v, i) => (
                          <li key={i} className="text-xs text-gray-400 truncate">
                            &bull;{' '}
                            <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(v.title)}`}
                               target="_blank" rel="noopener noreferrer"
                               className="text-blue-400 hover:text-blue-300 hover:underline">
                              &ldquo;{v.title}&rdquo;
                            </a>
                            <span className="text-gray-500 ml-1">
                              (조회수 {formatViewCount(v.viewCount)})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 본능 매칭 태그 */}
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-purple-400 mr-1">&#x1F9E0;</span>
                    {topic.instinctMatch.split('+').map((tag, i) => (
                      <span
                        key={i}
                        className="inline-block text-[10px] font-bold px-2 py-0.5 rounded border
                          bg-purple-900/30 text-purple-300 border-purple-500/50"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>

                  {/* 바이럴 이유 */}
                  <p className="text-xs text-gray-400">
                    <span className="text-yellow-500">&#x1F4A1;</span> 바이럴 이유: {topic.whyViral}
                  </p>

                  {/* 선택 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(topic);
                    }}
                    className={`
                      w-full py-2.5 rounded-lg text-sm font-bold transition-all duration-200 active:scale-[0.98]
                      ${isSelected
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                        : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white border border-pink-400/30 shadow-md'
                      }
                    `}
                  >
                    {isSelected ? '\u2714 선택됨' : '\u{1F4CC} 이 소재 선택'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TopicRecommendCards;

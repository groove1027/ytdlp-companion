import React, { useMemo } from 'react';
import { INSTINCT_PARTS } from '../../../data/instinctData';
import { searchMechanisms } from '../../../data/instinctPromptUtils';
import { useInstinctStore } from '../../../stores/instinctStore';
import { getMechanismById } from '../../../data/instinctData';
import InstinctDetail from './InstinctDetail';

// 사이드바 순서: PART 16(조합 공식) 먼저, 그 다음 PART 1~15
const SIDEBAR_PARTS = [
  INSTINCT_PARTS[INSTINCT_PARTS.length - 1], // PART 16 (최강 조합)
  ...INSTINCT_PARTS.filter(p => p.partNumber <= 15),
];

const InstinctBrowser: React.FC = () => {
  const {
    selectedPartIndex, setSelectedPartIndex,
    searchQuery, setSearchQuery,
    selectedMechanismIds, toggleMechanism, clearSelection,
  } = useInstinctStore();

  // selectedPartIndex는 SIDEBAR_PARTS 기준 인덱스
  const currentPart = SIDEBAR_PARTS[selectedPartIndex] || SIDEBAR_PARTS[0];

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchMechanisms(searchQuery);
  }, [searchQuery]);

  const selectedNames = useMemo(() =>
    selectedMechanismIds
      .map(getMechanismById)
      .filter(Boolean)
      .map(m => m!.name),
    [selectedMechanismIds]
  );

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* 헤더 */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center text-lg shadow-lg">
            🧠
          </div>
          <div>
            <h2 className="text-base font-bold text-white">본능 기제 브라우저</h2>
            <p className="text-xs text-gray-400">
              180개 심리 본능 기제를 탐색하고 대본 작성에 활용하세요
            </p>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="기제 이름, 훅, 설명으로 검색..."
            className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 px-4 py-2.5 pl-9 focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* 선택된 기제 표시 */}
        {selectedMechanismIds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">선택 ({selectedMechanismIds.length}/5):</span>
            {selectedNames.map((name, i) => (
              <span
                key={selectedMechanismIds[i]}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-900/30 text-purple-300 rounded-full border border-purple-700/40"
              >
                {name}
                <button
                  onClick={() => toggleMechanism(selectedMechanismIds[i])}
                  className="text-purple-400 hover:text-white ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={clearSelection}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              전체 해제
            </button>
          </div>
        )}
      </div>

      {/* 메인 콘텐츠: 좌측 사이드바 + 우측 상세 */}
      <div className="flex gap-4">
        {/* 좌측: PART 목록 — sticky로 고정, 스크롤 시에도 항상 보임 */}
        <div className="w-52 flex-shrink-0 space-y-1 sticky top-20 self-start">
          {SIDEBAR_PARTS.map((part, i) => {
            const isActive = selectedPartIndex === i && !searchQuery;
            return (
              <button
                key={part.partNumber}
                onClick={() => { setSelectedPartIndex(i); setSearchQuery(''); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  isActive
                    ? 'bg-purple-600/20 text-purple-300 border border-purple-500/50'
                    : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <span className="text-base">{part.icon}</span>
                <span className="truncate">{part.title}</span>
              </button>
            );
          })}
        </div>

        {/* 우측: 상세 콘텐츠 — 높이 제한 없이 전체 펼침 */}
        <div className="flex-1 bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-xl">
          <InstinctDetail
            part={currentPart}
            searchResults={searchResults}
          />
        </div>
      </div>
    </div>
  );
};

export default InstinctBrowser;

import React, { useState, useMemo } from 'react';
import { INSTINCT_PARTS, INSTINCT_COMBOS, getMechanismById } from '../../../data/instinctData';
import { useInstinctStore } from '../../../stores/instinctStore';

const InstinctSelector: React.FC = () => {
  const { selectedMechanismIds, toggleMechanism, clearSelection, setMechanismIds } = useInstinctStore();
  const [isOpen, setIsOpen] = useState(false);
  const [activePart, setActivePart] = useState<number | null>(null);

  const selectedNames = useMemo(() =>
    selectedMechanismIds
      .map(getMechanismById)
      .filter(Boolean)
      .map(m => m!.name),
    [selectedMechanismIds]
  );

  const activeMechanisms = useMemo(() => {
    if (activePart === null) return [];
    const part = INSTINCT_PARTS[activePart];
    return part.subCategories.flatMap(sc => sc.mechanisms);
  }, [activePart]);

  return (
    <div className="border border-gray-700/50 rounded-lg overflow-hidden">
      {/* 헤더 (토글) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800/60 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <span className="text-sm font-semibold text-gray-300">본능 기제 선택</span>
          <span className="text-sm text-gray-500">(선택사항)</span>
          {selectedMechanismIds.length > 0 && (
            <span className="text-sm px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded-full border border-purple-700/40">
              {selectedMechanismIds.length}개
            </span>
          )}
        </div>
        <span className={`text-gray-500 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="p-3 bg-gray-900/30 space-y-3">
          {/* 선택된 기제 칩 */}
          {selectedMechanismIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedNames.map((name, i) => (
                <span
                  key={selectedMechanismIds[i]}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-purple-900/30 text-purple-300 rounded-full border border-purple-700/40"
                >
                  {name}
                  <button
                    onClick={() => toggleMechanism(selectedMechanismIds[i])}
                    className="text-purple-400 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={clearSelection}
                className="text-sm text-gray-500 hover:text-red-400"
              >
                해제
              </button>
            </div>
          )}

          {/* 조합 공식 퀵 적용 */}
          <div>
            <p className="text-sm text-gray-500 mb-1">조합 공식 퀵 적용</p>
            <p className="text-sm text-gray-600 mb-1.5">클릭하면 해당 본능 기제가 바로 적용됩니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {INSTINCT_COMBOS.map((combo, i) => {
                const active = combo.mechanismIds.length === selectedMechanismIds.length
                  && combo.mechanismIds.every(id => selectedMechanismIds.includes(id));
                return (
                  <button
                    key={i}
                    onClick={() => setMechanismIds(combo.mechanismIds)}
                    className={`px-2 py-1 text-sm rounded border transition-colors ${
                      active
                        ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                        : 'bg-gray-800 text-gray-400 border-gray-700/50 hover:border-purple-600/50 hover:text-purple-300'
                    }`}
                    title={`${combo.formula} — "${combo.exampleHook}"`}
                  >
                    {combo.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PART 선택 그리드 */}
          <div>
            <p className="text-sm text-gray-500 mb-1.5">PART 선택</p>
            <div className="grid grid-cols-4 gap-1">
              {INSTINCT_PARTS.filter(p => p.partNumber <= 15).map((part, i) => (
                <button
                  key={part.partNumber}
                  onClick={() => setActivePart(activePart === i ? null : i)}
                  className={`px-1.5 py-1 text-sm rounded border transition-colors truncate ${
                    activePart === i
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500/50'
                      : 'bg-gray-800 text-gray-500 border-gray-700/50 hover:text-gray-300'
                  }`}
                  title={part.title}
                >
                  {part.icon} P{part.partNumber}
                </button>
              ))}
            </div>
          </div>

          {/* 기제 목록 */}
          {activePart !== null && activeMechanisms.length > 0 && (
            <div className="max-h-80 overflow-auto space-y-1 custom-scrollbar">
              {activeMechanisms.map(m => {
                const isSelected = selectedMechanismIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMechanism(m.id)}
                    disabled={!isSelected && selectedMechanismIds.length >= 5}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-sm border transition-colors flex items-center justify-between disabled:opacity-30 ${
                      isSelected
                        ? 'bg-purple-900/20 text-purple-300 border-purple-600/50'
                        : 'bg-gray-800/50 text-gray-400 border-gray-700/40 hover:border-gray-600'
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="text-xs text-gray-600 flex-shrink-0 ml-2">
                      {isSelected ? '✓' : m.hooks[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-sm text-gray-600">
            최대 5개 선택 가능. 대본 생성 시 AI가 선택한 본능으로 훅(도입부)을 강화합니다.
            시청자의 심리를 자극하여 클릭률과 시청 유지율을 높이는 데 도움을 줍니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default InstinctSelector;

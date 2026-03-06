import React, { useState, useCallback } from 'react';
import type { InstinctPart } from '../../../types';
import { INSTINCT_COMBOS, MASTER_FORMULA } from '../../../data/instinctData';
import { useInstinctStore } from '../../../stores/instinctStore';

interface Props {
  part: InstinctPart;
  searchResults: { id: string; name: string; basis: string; description: string; hooks: string[] }[] | null;
}

const InstinctDetail: React.FC<Props> = ({ part, searchResults }) => {
  const { selectedMechanismIds, toggleMechanism, setMechanismIds } = useInstinctStore();
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({});
  const [copiedHook, setCopiedHook] = useState('');

  const toggleSub = useCallback((id: string) => {
    setExpandedSubs(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const copyHook = useCallback(async (hook: string) => {
    try {
      await navigator.clipboard.writeText(hook);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = hook;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedHook(hook);
    setTimeout(() => setCopiedHook(''), 1500);
  }, []);

  // PART 16: 조합 공식 — 콤팩트 카드
  if (part.partNumber === 16) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          {part.icon} {part.title}
        </h3>
        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-lg px-3 py-2 border border-purple-700/40">
          <p className="text-xs font-bold text-purple-300">마스터 공식</p>
          <p className="text-sm text-white font-mono">{MASTER_FORMULA}</p>
        </div>
        <div className="space-y-1.5">
          {INSTINCT_COMBOS.map((combo, i) => {
            const active = combo.mechanismIds.length === selectedMechanismIds.length
              && combo.mechanismIds.every(id => selectedMechanismIds.includes(id));
            return (
              <div
                key={i}
                onClick={() => setMechanismIds(combo.mechanismIds)}
                className={`rounded-lg px-3 py-2.5 border cursor-pointer transition-colors ${
                  active
                    ? 'bg-purple-900/30 border-purple-500/60'
                    : 'bg-gray-800/80 border-gray-700/50 hover:border-purple-600/50 hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-purple-400 bg-purple-900/40 px-1.5 py-0.5 rounded flex-shrink-0">#{i + 1}</span>
                    <span className="text-sm font-bold text-white truncate">{combo.name}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{combo.formula}</span>
                  </div>
                  <span className={`text-xs font-bold flex-shrink-0 ml-2 ${active ? 'text-purple-300' : 'text-gray-600'}`}>
                    {active ? '✓ 적용됨' : '적용'}
                  </span>
                </div>
                <p className="text-xs text-blue-400/70 italic mt-1 truncate">&ldquo;{combo.exampleHook}&rdquo;</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 검색 결과 표시
  if (searchResults) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-gray-400">
          검색 결과 ({searchResults.length}개)
        </h3>
        <div className="space-y-2">
          {searchResults.map(m => {
            const isSelected = selectedMechanismIds.includes(m.id);
            return (
              <MechanismCard
                key={m.id}
                mechanism={m}
                isSelected={isSelected}
                onToggle={() => toggleMechanism(m.id)}
                onCopyHook={copyHook}
                copiedHook={copiedHook}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // 일반 PART 표시
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        {part.icon} {part.title}
      </h3>
      {part.subCategories.map(sc => {
        const isOpen = expandedSubs[sc.id] !== false;
        return (
          <div key={sc.id} className="border border-gray-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSub(sc.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/60 hover:bg-gray-800 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-200">{sc.title}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{sc.mechanisms.length}개</span>
                <span className={`text-gray-500 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
              </div>
            </button>
            {isOpen && (
              <div className="p-3 space-y-2 bg-gray-900/30">
                {sc.mechanisms.map(m => {
                  const isSelected = selectedMechanismIds.includes(m.id);
                  return (
                    <MechanismCard
                      key={m.id}
                      mechanism={m}
                      isSelected={isSelected}
                      onToggle={() => toggleMechanism(m.id)}
                      onCopyHook={copyHook}
                      copiedHook={copiedHook}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// 개별 기제 카드
function MechanismCard({ mechanism, isSelected, onToggle, onCopyHook, copiedHook }: {
  mechanism: { id: string; name: string; basis: string; description: string; hooks: string[] };
  isSelected: boolean;
  onToggle: () => void;
  onCopyHook: (h: string) => void;
  copiedHook: string;
}) {
  return (
    <div className={`rounded-lg p-3 border transition-colors ${
      isSelected
        ? 'bg-purple-900/20 border-purple-600/50'
        : 'bg-gray-800/50 border-gray-700/40 hover:border-gray-600'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{mechanism.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{mechanism.basis}</p>
          <p className="text-xs text-gray-400 mt-1">{mechanism.description}</p>
        </div>
        <button
          onClick={onToggle}
          className={`flex-shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
            isSelected
              ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
              : 'bg-gray-700/50 text-gray-400 border-gray-600/50 hover:text-white hover:border-gray-500'
          }`}
        >
          {isSelected ? '선택됨' : '선택'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {mechanism.hooks.map((h, i) => (
          <button
            key={i}
            onClick={() => onCopyHook(h)}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              copiedHook === h
                ? 'bg-green-900/30 text-green-400 border-green-700/50'
                : 'bg-blue-900/20 text-blue-400 border-blue-800/40 hover:bg-blue-900/40'
            }`}
          >
            {copiedHook === h ? '복사됨!' : h}
          </button>
        ))}
      </div>
    </div>
  );
}

export default InstinctDetail;

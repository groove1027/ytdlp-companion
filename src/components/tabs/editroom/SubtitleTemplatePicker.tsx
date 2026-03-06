import React, { useState, useMemo, useCallback } from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { SUBTITLE_TEMPLATES, SUBTITLE_CAT_TABS } from '../../../constants/subtitleTemplates';
import type { SubtitleCategoryId } from '../../../constants/subtitleTemplates';
import type { SubtitleTemplate, SubtitleStyle } from '../../../types';

// 카테고리 필터 (favorite 제외 — 편집실에서는 불필요)
const CATEGORIES = SUBTITLE_CAT_TABS.filter((c) => c.id !== 'favorite');

const SubtitleTemplatePicker: React.FC = () => {
  const globalSubtitleStyle = useEditRoomStore((s) => s.globalSubtitleStyle);
  const setGlobalSubtitleStyle = useEditRoomStore((s) => s.setGlobalSubtitleStyle);

  const [activeCat, setActiveCat] = useState<SubtitleCategoryId>('all');
  const [searchText, setSearchText] = useState('');

  const filtered = useMemo(() => {
    let list = SUBTITLE_TEMPLATES;
    if (activeCat !== 'all') {
      list = list.filter((t) => t.category === activeCat);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.fontFamily.toLowerCase().includes(q));
    }
    return list;
  }, [activeCat, searchText]);

  const handleSelect = useCallback((template: SubtitleTemplate) => {
    const style: SubtitleStyle = { template };
    setGlobalSubtitleStyle(style);
  }, [setGlobalSubtitleStyle]);

  const selectedId = globalSubtitleStyle?.template.id;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-white">글로벌 자막 스타일</h3>

      {/* 검색 */}
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="템플릿 검색..."
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-amber-500/50 placeholder-gray-600"
      />

      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCat(cat.id)}
            className={`px-2 py-1 rounded text-sm font-bold border transition-all ${
              activeCat === cat.id
                ? 'bg-amber-600/20 text-amber-300 border-amber-500/50'
                : 'bg-gray-900/50 text-gray-500 border-gray-700 hover:text-gray-300'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 선택됨 표시 */}
      {selectedId && (
        <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-500/30 rounded-lg px-3 py-1.5">
          <span className="text-sm text-amber-400 font-bold">선택됨:</span>
          <span className="text-sm text-amber-300">{globalSubtitleStyle?.template.name}</span>
          <button
            type="button"
            onClick={() => setGlobalSubtitleStyle(null)}
            className="ml-auto text-sm text-gray-500 hover:text-red-400"
          >
            해제
          </button>
        </div>
      )}

      {/* 템플릿 그리드 */}
      <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
        {filtered.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleSelect(t)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all border ${
              selectedId === t.id
                ? 'bg-amber-600/15 border-amber-500/40'
                : 'bg-gray-900/30 border-gray-700/50 hover:border-gray-600'
            }`}
          >
            {/* 미니 프리뷰 */}
            <div
              className="w-16 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: t.backgroundColor || '#111' }}
            >
              <span
                style={{
                  fontFamily: t.fontFamily,
                  fontSize: '11px',
                  fontWeight: t.fontWeight,
                  color: t.color,
                  textShadow: t.textShadowCSS || undefined,
                  WebkitTextStroke: t.outlineWidth > 0 ? `${Math.min(t.outlineWidth, 1)}px ${t.outlineColor}` : undefined,
                }}
              >
                자막
              </span>
            </div>

            {/* 이름 + 폰트 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 font-medium truncate">{t.name}</p>
              <p className="text-xs text-gray-500 truncate">{t.fontFamily}</p>
            </div>

            {/* 선택 체크 */}
            {selectedId === t.id && (
              <span className="text-amber-400 text-sm flex-shrink-0">✓</span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-600 text-center py-4">검색 결과 없음</p>
        )}
      </div>

      <p className="text-xs text-gray-600">
        총 {SUBTITLE_TEMPLATES.length}개 템플릿 | 현재 {filtered.length}개 표시
      </p>
    </div>
  );
};

export default SubtitleTemplatePicker;

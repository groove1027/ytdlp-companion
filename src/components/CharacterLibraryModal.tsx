
import React, { useState, useEffect, useCallback } from 'react';
import { getAllSavedCharacters, deleteSavedCharacter } from '../services/storageService';
import { showToast } from '../stores/uiStore';
import type { SavedCharacter } from '../types';
import { logger } from '../services/LoggerService';

interface CharacterLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (character: SavedCharacter) => void;
  currentCharacterCount: number;
  maxCharacters: number;
}

const CharacterLibraryModal: React.FC<CharacterLibraryModalProps> = ({
  isOpen,
  onClose,
  onLoad,
  currentCharacterCount,
  maxCharacters,
}) => {
  const [characters, setCharacters] = useState<SavedCharacter[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCharacters = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllSavedCharacters();
      setCharacters(all);
    } catch (e) {
      logger.trackSwallowedError('CharacterLibraryModal:loadCharacters', e);
      showToast('캐릭터 목록 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadCharacters();
  }, [isOpen, loadCharacters]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleDelete = useCallback(async (id: string, label: string) => {
    try {
      await deleteSavedCharacter(id);
      setCharacters(prev => prev.filter(c => c.id !== id));
      showToast(`"${label}" 삭제됨`);
    } catch (e) {
      logger.trackSwallowedError('CharacterLibraryModal:handleDelete', e);
      showToast('삭제 실패');
    }
  }, []);

  const isFull = currentCharacterCount >= maxCharacters;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📚</span>
            <h3 className="text-base font-bold text-white">내 캐릭터 라이브러리</h3>
            <span className="text-sm text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
              {characters.length}개
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl transition-colors">&times;</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-gray-500 border-t-purple-400 rounded-full animate-spin" />
            </div>
          ) : characters.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-base text-gray-400 mb-1">저장된 캐릭터가 없습니다</p>
              <p className="text-sm text-gray-600">캐릭터 슬롯에서 분석 완료 후 💾 버튼으로 저장하세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {characters.map((char) => (
                <div key={char.id} className="group bg-gray-900 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-500 transition-colors">
                  {/* 썸네일 */}
                  <div className="relative aspect-square bg-gray-800">
                    <img
                      src={char.imageUrl || char.imageBase64 || ''}
                      alt={char.label}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* 삭제 버튼 */}
                    <button
                      type="button"
                      onClick={() => handleDelete(char.id, char.label)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"
                      title="라이브러리에서 삭제"
                    >
                      &times;
                    </button>
                  </div>
                  {/* 정보 */}
                  <div className="p-2 space-y-1.5">
                    <p className="text-sm text-gray-200 font-medium truncate" title={char.label}>{char.label}</p>
                    {char.analysisResult && (
                      <p className="text-xs text-gray-500 leading-tight line-clamp-2" title={char.analysisResult}>
                        {char.analysisResult.slice(0, 80)}{char.analysisResult.length > 80 ? '...' : ''}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onLoad(char)}
                      disabled={isFull}
                      className={`w-full text-sm font-bold py-1.5 rounded-lg transition-all ${
                        isFull
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-purple-600/30 text-purple-300 border border-purple-500/30 hover:bg-purple-600/50 hover:text-white'
                      }`}
                    >
                      {isFull ? '슬롯 가득 참' : '불러오기'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 풋터 */}
        {isFull && characters.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-700 shrink-0">
            <p className="text-sm text-yellow-400 text-center">
              캐릭터 슬롯이 가득 찼습니다 ({currentCharacterCount}/{maxCharacters}). 기존 캐릭터를 제거한 후 불러오세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterLibraryModal;

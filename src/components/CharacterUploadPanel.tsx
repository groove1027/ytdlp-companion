
import React, { useRef, useState, useCallback } from 'react';
import type { CharacterReference } from '../types';
import { useElapsedTimer, formatElapsed } from '../hooks/useElapsedTimer';
import { showToast } from '../stores/uiStore';

interface CharacterUploadPanelProps {
  characters: CharacterReference[];
  onAdd: (imageBase64: string) => void;
  onRemove: (id: string) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onAnalyze?: (id: string) => void;
  onAnalyzeAll?: () => void;
  maxCharacters?: number;
  onSaveToLibrary?: (character: CharacterReference) => void;
  onOpenLibrary?: () => void;
  isMultiCharacter?: boolean;
}

const CharacterUploadPanel: React.FC<CharacterUploadPanelProps> = ({
  characters,
  onAdd,
  onRemove,
  onUpdateLabel,
  onAnalyze,
  onAnalyzeAll,
  maxCharacters = 5,
  onSaveToLibrary,
  onOpenLibrary,
  isMultiCharacter = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [savedCharId, setSavedCharId] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const anyAnalyzing = characters.some(c => c.isAnalyzing);
  const analyzeElapsed = useElapsedTimer(anyAnalyzing);

  const handleSave = useCallback((char: CharacterReference) => {
    if (savedCharId) return;
    onSaveToLibrary?.(char);
    setSavedCharId(char.id);
    setTimeout(() => setSavedCharId(null), 2000);
  }, [savedCharId, onSaveToLibrary]);

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (characters.length >= maxCharacters) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      onAdd(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  /* ── Copy button component (inline, 라벨 행에 배치) ── */
  const CopyBtn: React.FC<{ text: string; accent: string }> = ({ text, accent }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text || '').then(() => showToast('클립보드에 복사되었습니다.')); }}
      className={`w-4 h-4 flex-shrink-0 flex items-center justify-center transition-colors rounded ${
        text ? `text-gray-500 hover:text-${accent}-300 hover:bg-${accent}-500/10` : 'text-gray-700 cursor-not-allowed'
      }`}
      title="복사"
      disabled={!text}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    </button>
  );

  /* ══════════════════════════════════════════════ */
  /* 싱글 캐릭터 모드 (구버전 레이아웃)                    */
  /* ══════════════════════════════════════════════ */
  if (!isMultiCharacter) {
    const char = characters[0] || null;
    return (
      <div
        className={`bg-gray-800/50 border rounded-xl px-4 py-3 transition-colors relative ${
          isDragging ? 'border-purple-400 border-dashed bg-purple-500/10' : 'border-gray-700'
        }`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-purple-500/10 rounded-xl pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm font-semibold text-purple-300">이미지를 여기에 놓으세요</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-semibold text-gray-300">1. 메인 캐릭터 (Anchor)</span>
          </div>
          {onOpenLibrary && (
            <button type="button" onClick={onOpenLibrary}
              className="text-sm text-purple-400 hover:text-purple-300 bg-purple-900/20 hover:bg-purple-900/30 border border-purple-500/30 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1 font-semibold">
              📚 내 캐릭터
            </button>
          )}
        </div>

        {/* 좌: 이미지 업로드 / 우: AI 분석 결과 — 좌측 저장 버튼 밑 기준 반응형 */}
        <div className="relative">
          {/* 좌측: 이미지 — 높이 기준점 */}
          <div className="flex flex-col items-center gap-2 w-1/3">
            {char ? (
              <>
                {/* 라벨 - 이미지 위 */}
                <input
                  type="text"
                  value={char.label}
                  onChange={(e) => onUpdateLabel(char.id, e.target.value)}
                  className="w-full text-center text-sm font-semibold text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-purple-500/50 focus:outline-none flex-shrink-0"
                />
                <div className="relative w-full group">
                  <div className="w-full max-h-[240px] rounded-xl overflow-hidden border-2 border-purple-500/40 bg-gray-900 shadow-lg shadow-purple-500/5 flex items-center justify-center">
                    <img src={char.imageBase64 || char.imageUrl || ''} alt={char.label} className="max-w-full max-h-[240px] object-contain block" />
                  </div>
                  {/* Analyzing spinner */}
                  {char.isAnalyzing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-xl">
                      <div className="w-8 h-8 border-2 border-gray-400 border-t-purple-400 rounded-full animate-spin" />
                      <span className="text-xs text-gray-300 mt-2">분석 중</span>
                    </div>
                  )}
                  {/* Analysis done badge */}
                  {char.analysisResult && !char.isAnalyzing && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-2 border-gray-800">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {/* Remove button */}
                  <button type="button" onClick={() => onRemove(char.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-gray-800">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* 캐릭터 저장 버튼 — 이미지 아래 */}
                {onSaveToLibrary && char.analysisResult && !char.isAnalyzing && (
                  <button type="button" onClick={() => handleSave(char)}
                    disabled={savedCharId === char.id}
                    className={`w-full mt-1.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      savedCharId === char.id
                        ? 'bg-green-600/30 text-green-300 border-green-500/40'
                        : 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 hover:text-purple-200 border-purple-500/40 hover:border-purple-400/60'
                    }`}>
                    {savedCharId === char.id ? <><span>✅</span> 저장 완료</> : <><span>💾</span> 캐릭터 저장</>}
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-[200px] rounded-xl border-2 border-dashed border-gray-700 hover:border-purple-500/40 bg-gray-900/50 hover:bg-purple-500/5 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer">
                <span className="text-3xl">🧑‍🎨</span>
                <span className="text-sm font-semibold text-gray-500">이미지 업로드</span>
                <span className="text-xs text-gray-600">클릭 또는 드래그</span>
              </button>
            )}
          </div>

          {/* 우측: AI 분석 결과 — 좌측 저장 버튼 밑까지 절대 위치 */}
          <div className="absolute top-0 bottom-0 left-[calc(33.333%+1rem)] right-0 flex flex-col gap-2 overflow-hidden">
            <h4 className="text-sm font-bold text-purple-300 flex items-center gap-1.5 flex-shrink-0">
              <span>✨</span> AI 분석 결과
            </h4>

            {/* 분석 중 안내 배너 */}
            {char?.isAnalyzing && (
              <div className="flex items-center gap-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2 flex-shrink-0">
                <div className="w-4 h-4 border-2 border-purple-300/30 border-t-purple-400 rounded-full animate-spin flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-purple-300">캐릭터의 스타일과 특징을 추출 중입니다</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">AI가 화풍, 색감, 외형 특징을 분석하고 있습니다. 잠시만 기다려 주세요.</p>
                </div>
                {analyzeElapsed > 0 && <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0 ml-auto">{formatElapsed(analyzeElapsed)}</span>}
              </div>
            )}

            {/* 감지된 예술 스타일 */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <span className="text-xs font-semibold text-purple-400">🎨 감지된 예술 스타일</span>
                <CopyBtn text={char?.analysisStyle || ''} accent="purple" />
              </div>
              <p className={`text-xs leading-relaxed bg-gray-900/80 rounded-lg px-3 py-2.5 border flex-1 min-h-0 overflow-y-auto ${
                char?.analysisStyle
                  ? 'text-gray-300 border-gray-600/50'
                  : 'text-gray-600 border-dashed border-gray-700/30 italic'
              }`}>{char?.analysisStyle || (char?.isAnalyzing ? '화풍, 색감, 렌더링 스타일 추출 중...' : '대기 중')}</p>
            </div>

            {/* 감지된 캐릭터 특징 */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <span className="text-xs font-semibold text-cyan-400">🧑 감지된 캐릭터 특징</span>
                <CopyBtn text={char?.analysisCharacter || ''} accent="cyan" />
              </div>
              <p className={`text-xs leading-relaxed bg-gray-900/80 rounded-lg px-3 py-2.5 border flex-1 min-h-0 overflow-y-auto ${
                char?.analysisCharacter
                  ? 'text-gray-300 border-gray-600/50'
                  : 'text-gray-600 border-dashed border-gray-700/30 italic'
              }`}>{char?.analysisCharacter || (char?.isAnalyzing ? '헤어, 의상, 체형, 액세서리 추출 중...' : '대기 중')}</p>
            </div>

            {/* Re-analyze button (in case auto failed or partial result) */}
            {char && !char.isAnalyzing && (!char.analysisResult || !char.analysisStyle || !char.analysisCharacter) && onAnalyze && (
              <button type="button" onClick={() => onAnalyze(char.id)}
                className="flex-shrink-0 text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-900/20 hover:bg-cyan-900/30 border border-cyan-500/30 rounded-lg px-3 py-1.5 transition-all flex items-center justify-center gap-1">
                🔍 다시 분석
              </button>
            )}
          </div>
        </div>

        {/* 자동 누끼 안내 */}
        <div className="mt-3 px-3 py-2 bg-green-900/15 border border-green-500/20 rounded-lg flex items-start gap-2">
          <span className="text-green-400 text-sm flex-shrink-0">✅</span>
          <div>
            <p className="text-xs text-green-400/90 font-semibold">자동 누끼 제거 활성화됨: 이미지 업로드 시 AI가 자동으로 배경을 지워줍니다. (월 50회 무료)</p>
            <p className="text-[10px] text-gray-500 mt-0.5">* 자주 사용하는 캐릭터는 PNG 저장을 눌러 보관해 주세요!</p>
          </div>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      </div>
    );
  }

  /* ══════════════════════════════════════════════ */
  /* 멀티 캐릭터 모드 (현재 5슬롯 그리드)                  */
  /* ══════════════════════════════════════════════ */
  const slots: (CharacterReference | null)[] = [];
  for (let i = 0; i < maxCharacters; i++) {
    slots.push(characters[i] || null);
  }

  return (
    <div
      className={`bg-gray-800/50 border rounded-xl px-4 py-3 transition-colors relative ${
        isDragging ? 'border-purple-400 border-dashed bg-purple-500/10' : 'border-gray-700'
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-purple-500/10 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm font-semibold text-purple-300">이미지를 여기에 놓으세요</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold text-gray-300">캐릭터 레퍼런스</span>
          <span className="text-sm text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">{characters.length}/{maxCharacters}</span>
        </div>
        <div className="flex items-center gap-2">
          {onAnalyzeAll && characters.some(c => (!c.analysisResult || !c.analysisStyle || !c.analysisCharacter) && !c.isAnalyzing) && (
            <button type="button" onClick={onAnalyzeAll}
              disabled={characters.some(c => c.isAnalyzing)}
              className="text-sm text-cyan-400 hover:text-cyan-300 bg-cyan-900/20 hover:bg-cyan-900/30 border border-cyan-500/30 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
              🔍 전체 분석
            </button>
          )}
          {onOpenLibrary && (
            <button type="button" onClick={onOpenLibrary}
              className="text-sm text-purple-400 hover:text-purple-300 bg-purple-900/20 hover:bg-purple-900/30 border border-purple-500/30 rounded-lg px-2.5 py-1 transition-colors flex items-center gap-1 font-semibold">
              📚 내 캐릭터
            </button>
          )}
          <span className="text-sm text-gray-600">클릭 또는 드래그하여 추가</span>
        </div>
      </div>

      {/* 5-slot equal-width grid */}
      <div className="grid grid-cols-5 gap-3">
        {slots.map((char, idx) => (
          <div key={char?.id || `empty-${idx}`} className="flex flex-col items-center gap-1.5 group">
            {char ? (
              <>
                {/* 라벨 - 이미지 위 */}
                <input
                  type="text"
                  value={char.label}
                  onChange={(e) => onUpdateLabel(char.id, e.target.value)}
                  className="w-full text-center text-sm text-gray-300 bg-transparent border-b border-transparent hover:border-gray-600 focus:border-purple-500/50 focus:outline-none truncate"
                  title={char.analysisResult || char.label}
                />

                <div className="relative w-full aspect-square">
                  <div className="w-full h-full rounded-xl overflow-hidden border-2 border-purple-500/40 bg-gray-900 shadow-lg shadow-purple-500/5 transition-all group-hover:border-purple-400/60 group-hover:shadow-purple-500/10">
                    <img src={char.imageBase64 || char.imageUrl || ''} alt={char.label} className="w-full h-full object-cover" />
                  </div>

                  {/* Analyzing spinner */}
                  {char.isAnalyzing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-xl">
                      <div className="w-6 h-6 border-2 border-gray-400 border-t-purple-400 rounded-full animate-spin" />
                      {analyzeElapsed > 0 && <span className="text-xs text-gray-400 tabular-nums mt-1">{formatElapsed(analyzeElapsed)}</span>}
                    </div>
                  )}

                  {/* Analysis done badge */}
                  {char.analysisResult && !char.isAnalyzing && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-gray-800 cursor-help"
                      title={char.analysisResult}>
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {/* Slot number */}
                  <div className="absolute -top-1 -left-1 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center border-2 border-gray-800">
                    <span className="text-[11px] font-bold text-white">{idx + 1}</span>
                  </div>

                  {/* Remove button */}
                  <button type="button" onClick={() => onRemove(char.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-2 border-gray-800">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                </div>

                {/* 캐릭터 저장 버튼 */}
                {onSaveToLibrary && char.analysisResult && !char.isAnalyzing && (
                  <button type="button" onClick={() => handleSave(char)}
                    disabled={savedCharId === char.id}
                    className={`w-full mt-1 py-1 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-1 ${
                      savedCharId === char.id
                        ? 'bg-green-600/30 text-green-300 border-green-500/40'
                        : 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 hover:text-purple-200 border-purple-500/40 hover:border-purple-400/60'
                    }`}>
                    {savedCharId === char.id ? <><span>✅</span> 완료</> : <><span>💾</span> 저장</>}
                  </button>
                )}

                {/* Analysis boxes */}
                <div className="w-full mt-1 space-y-1">
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-purple-400">감지된 예술 스타일</span>
                      <CopyBtn text={char.analysisStyle || ''} accent="purple" />
                    </div>
                    <p className={`text-[11px] leading-snug bg-black/30 rounded px-1.5 py-1.5 border ${
                      expandedAnalysisId === char.id ? 'max-h-none' : 'max-h-[3.5rem]'
                    } overflow-y-auto ${
                      char.analysisStyle
                        ? 'text-gray-400 border-gray-700/50'
                        : 'text-gray-600 border-dashed border-gray-700/30 italic'
                    }`}>{char.analysisStyle || (char.isAnalyzing ? '화풍/색감 추출 중...' : '분석 전')}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-cyan-400">캐릭터 특징</span>
                      <CopyBtn text={char.analysisCharacter || ''} accent="cyan" />
                    </div>
                    <p className={`text-[11px] leading-snug bg-black/30 rounded px-1.5 py-1.5 border ${
                      expandedAnalysisId === char.id ? 'max-h-none' : 'max-h-[3.5rem]'
                    } overflow-y-auto ${
                      char.analysisCharacter
                        ? 'text-gray-400 border-gray-700/50'
                        : 'text-gray-600 border-dashed border-gray-700/30 italic'
                    }`}>{char.analysisCharacter || (char.isAnalyzing ? '외형/의상 추출 중...' : '분석 전')}</p>
                  </div>
                  {/* Action buttons — re-analyze if auto failed or partial result */}
                  {!char.isAnalyzing && (!char.analysisResult || !char.analysisStyle || !char.analysisCharacter) && onAnalyze && (
                    <button type="button" onClick={() => onAnalyze(char.id)}
                      className="w-full text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-900/20 hover:bg-cyan-900/30 border border-cyan-500/30 rounded px-2 py-0.5 transition-all flex items-center justify-center gap-1">
                      🔍 다시 분석
                    </button>
                  )}
                  {char.analysisResult && !char.isAnalyzing && (
                    <button type="button" onClick={() => setExpandedAnalysisId(expandedAnalysisId === char.id ? null : char.id)}
                      className="text-[8px] text-gray-600 hover:text-gray-400 w-full text-center">
                      {expandedAnalysisId === char.id ? '접기 ▲' : '더보기 ▼'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* 라벨 - 이미지 위 (빈 슬롯) */}
                <span className="text-sm text-gray-600 select-none">캐릭터 {idx + 1}</span>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-700 hover:border-purple-500/40 bg-gray-900/50 hover:bg-purple-500/5 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm text-gray-600">추가</span>
                </button>
                <div className="w-full mt-1 space-y-1">
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px] font-semibold text-purple-400/50">감지된 예술 스타일</span>
                    </div>
                    <p className="text-[11px] leading-snug bg-black/20 rounded px-1.5 py-1.5 border border-dashed border-gray-700/30 max-h-[3.5rem] overflow-y-auto text-gray-600 italic">대기 중</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[10px] font-semibold text-cyan-400/50">캐릭터 특징</span>
                    </div>
                    <p className="text-[11px] leading-snug bg-black/20 rounded px-1.5 py-1.5 border border-dashed border-gray-700/30 max-h-[3.5rem] overflow-y-auto text-gray-600 italic">대기 중</p>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 자동 누끼 안내 */}
      <div className="mt-3 px-3 py-2 bg-green-900/15 border border-green-500/20 rounded-lg flex items-start gap-2">
        <span className="text-green-400 text-sm flex-shrink-0">✅</span>
        <div>
          <p className="text-xs text-green-400/90 font-semibold">자동 누끼 제거 활성화됨: 이미지 업로드 시 AI가 자동으로 배경을 지워줍니다. (월 50회 무료)</p>
          <p className="text-[10px] text-gray-500 mt-0.5">* 자주 사용하는 캐릭터는 PNG 저장을 눌러 보관해 주세요!</p>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
    </div>
  );
};

export default CharacterUploadPanel;

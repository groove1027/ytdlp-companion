import React, { useRef, useState } from 'react';
import VisualStylePicker, { getVisualStyleLabel } from '../../VisualStylePicker';
import { resizeImage } from '../../../services/imageProcessingService';
import { analyzeCharacterImage } from '../../../services/characterAnalysisService';
import { showToast } from '../../../stores/uiStore';
import ReferencePanel from './ReferencePanel';

export interface SetupState {
  mode: 'random' | 'reference';
  script: string;
  videoFormat: 'long' | 'short';
  atmosphere: string;
  charImageBase64?: string;
  charDescription: string;
  referenceImageBase64?: string;
  youtubeUrl: string;
  youtubeThumbnail?: string;
  textMode: 'auto' | 'custom' | 'none';
  customText: string;
}

interface SetupPanelProps {
  setup: SetupState;
  setSetup: React.Dispatch<React.SetStateAction<SetupState>>;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  // Reference analysis state
  isYtFetching: boolean;
  ytFetchFailed: boolean;
  isRefAnalyzing: boolean;
  refAnalysis?: string;
  onSetYtFetching: (v: boolean) => void;
  onSetYtFetchFailed: (v: boolean) => void;
  onSetRefAnalyzing: (v: boolean) => void;
  onSetRefAnalysis: (v?: string) => void;
  // Character analysis state
  isCharAnalyzing: boolean;
  charAnalysis?: string;
  onSetCharAnalyzing: (v: boolean) => void;
  onSetCharAnalysis: (v?: string) => void;
  // 이미지/영상 탭 연동 여부
  syncedFromImageVideo?: boolean;
}

const SetupPanel: React.FC<SetupPanelProps> = ({
  setup,
  setSetup,
  isCollapsed,
  onToggleCollapse,
  isYtFetching,
  ytFetchFailed,
  isRefAnalyzing,
  refAnalysis,
  onSetYtFetching,
  onSetYtFetchFailed,
  onSetRefAnalyzing,
  onSetRefAnalysis,
  isCharAnalyzing,
  charAnalysis,
  onSetCharAnalyzing,
  onSetCharAnalysis,
  syncedFromImageVideo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCharExpanded, setIsCharExpanded] = useState(false);

  const processImageFile = async (file: File) => {
    try {
      const base64 = await resizeImage(file, 768, 'image/png');
      setSetup(prev => ({ ...prev, charImageBase64: base64 }));
      onSetCharAnalysis(undefined);

      onSetCharAnalyzing(true);
      try {
        const analysis = await analyzeCharacterImage(base64);
        onSetCharAnalysis(analysis.combined);
        setSetup(prev => ({ ...prev, charDescription: analysis.combined }));
      } catch (err) {
        console.error('Character analysis failed', err);
        showToast('캐릭터 분석에 실패했습니다. API 키를 확인해주세요.', 4000);
      } finally {
        onSetCharAnalyzing(false);
      }
    } catch (e) {
      console.error('Image processing failed', e);
      showToast('이미지 처리에 실패했습니다.', 3000);
    }
  };

  return (
    <div className="border border-gray-700 rounded-xl bg-gray-800/50 overflow-hidden">
      {/* Collapse header */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">설정</span>
          {isCollapsed && (
            <span className="text-sm text-gray-400">
              {setup.mode === 'random' ? 'AI 랜덤 기획' : '레퍼런스 카피'}
              {setup.atmosphere && ` / ${getVisualStyleLabel(setup.atmosphere) || '직접 입력'}`}
            </span>
          )}
        </div>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="px-5 pb-5 space-y-5">
          {/* 이미지/영상 탭 연동 뱃지 */}
          {syncedFromImageVideo && (
            <div className="flex items-center gap-2 bg-orange-900/20 border border-orange-500/30 rounded-lg px-3 py-2">
              <span className="text-orange-400 text-sm">🎨</span>
              <span className="text-sm text-orange-300 font-bold">이미지/영상 탭에서 스타일 연동됨</span>
            </div>
          )}
          {/* 1. Mode Selection */}
          <div>
            <h3 className="text-lg font-bold text-white mb-3">1. 모드 선택</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSetup(prev => ({ ...prev, mode: 'random' }))}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  setup.mode === 'random'
                    ? 'border-pink-500 bg-pink-900/20'
                    : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                }`}
              >
                <div className="text-2xl mb-1">&#127922;</div>
                <div className={`text-base font-bold ${setup.mode === 'random' ? 'text-pink-300' : 'text-gray-300'}`}>
                  AI 랜덤 기획
                </div>
                <div className="text-sm text-gray-400 mt-0.5">대본 기반으로 AI가 4종 컨셉 기획</div>
              </button>
              <button
                onClick={() => setSetup(prev => ({ ...prev, mode: 'reference' }))}
                className={`p-4 rounded-xl border-2 transition-all text-center ${
                  setup.mode === 'reference'
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                }`}
              >
                <div className="text-2xl mb-1">&#127912;</div>
                <div className={`text-base font-bold ${setup.mode === 'reference' ? 'text-blue-300' : 'text-gray-300'}`}>
                  레퍼런스 카피
                </div>
                <div className="text-sm text-gray-400 mt-0.5">기존 썸네일 스타일을 AI가 복제</div>
              </button>
            </div>
          </div>

          {/* Reference inputs */}
          {setup.mode === 'reference' && (
            <ReferencePanel
              youtubeUrl={setup.youtubeUrl}
              youtubeThumbnail={setup.youtubeThumbnail}
              referenceImageBase64={setup.referenceImageBase64}
              refAnalysis={refAnalysis}
              isYtFetching={isYtFetching}
              ytFetchFailed={ytFetchFailed}
              isRefAnalyzing={isRefAnalyzing}
              onYoutubeUrlChange={(url) => setSetup(prev => ({ ...prev, youtubeUrl: url, youtubeThumbnail: undefined }))}
              onSetYtFetching={onSetYtFetching}
              onSetYtFetchFailed={onSetYtFetchFailed}
              onSetYoutubeThumbnail={(v) => setSetup(prev => ({ ...prev, youtubeThumbnail: v }))}
              onSetReferenceImage={(v) => setSetup(prev => ({ ...prev, referenceImageBase64: v }))}
              onSetRefAnalysis={onSetRefAnalysis}
              onSetRefAnalyzing={onSetRefAnalyzing}
            />
          )}

          {/* Script */}
          <div>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              {setup.mode === 'reference' ? '3' : '2'}. 대본/주제 입력
              {setup.mode === 'random' ? (
                <span className="text-sm bg-red-600 text-white px-2 py-0.5 rounded-full font-bold">필수</span>
              ) : (
                <span className="text-sm bg-gray-600 text-gray-300 px-2 py-0.5 rounded-full font-bold">선택</span>
              )}
            </h3>
            <textarea
              value={setup.script}
              onChange={(e) => setSetup(prev => ({ ...prev, script: e.target.value }))}
              placeholder={setup.mode === 'reference' ? '맥락 제공용 대본/주제 (선택사항)...' : '썸네일에 반영할 대본이나 영상 주제를 입력하세요...'}
              className="w-full h-32 bg-gray-900 border border-gray-600 rounded-lg p-4 text-white focus:border-pink-500 outline-none resize-none text-sm leading-relaxed"
            />
            <div className="flex justify-end mt-1">
              <span className="text-sm text-gray-500">{setup.script.length}자</span>
            </div>
          </div>

          {/* Character Image (collapsible) */}
          <div>
            <button
              onClick={() => setIsCharExpanded(!isCharExpanded)}
              className="w-full flex items-center justify-between text-left group"
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {setup.mode === 'reference' ? '4' : '3'}. 캐릭터 이미지 (선택)
                {setup.charImageBase64 && !isCharExpanded && (
                  <span className="text-sm text-green-400 font-bold">&#10003; 업로드됨</span>
                )}
              </h3>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${isCharExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isCharExpanded && <div className="grid grid-cols-2 gap-4 mt-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault(); setIsDragOver(false);
                  if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]);
                }}
                className={`aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                  isDragOver ? 'border-pink-500 bg-pink-900/20' : 'border-gray-600 bg-gray-900/50 hover:bg-gray-800'
                }`}
              >
                {setup.charImageBase64 ? (
                  <div className="relative w-full h-full">
                    <img src={setup.charImageBase64} className="w-full h-full object-contain" alt="Character" />
                    <button
                      onClick={(e) => { e.stopPropagation(); setSetup(prev => ({ ...prev, charImageBase64: undefined, charDescription: '' })); onSetCharAnalysis(undefined); }}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-md z-10 text-sm"
                    >&#10005;</button>
                  </div>
                ) : (
                  <>
                    <span className="text-3xl mb-1">&#128248;</span>
                    <span className="text-sm font-bold text-gray-400">드래그 또는 클릭</span>
                  </>
                )}
              </div>
              <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processImageFile(e.target.files[0])} accept="image/*" className="hidden" />
              <div className="flex flex-col gap-2">
                <textarea
                  value={setup.charDescription}
                  onChange={(e) => setSetup(prev => ({ ...prev, charDescription: e.target.value }))}
                  placeholder={"캐릭터 특징 (선택)\n예: 30대 남성, 검은 정장"}
                  className="flex-1 bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-sm focus:border-pink-500 outline-none resize-none"
                />
                {isCharAnalyzing && (
                  <div className="flex items-center gap-2 bg-purple-900/20 border border-purple-700/30 rounded-lg px-3 py-2">
                    <svg className="animate-spin h-4 w-4 text-purple-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <span className="text-sm text-purple-300">Gemini 3.1 Pro로 캐릭터 분석 중...</span>
                  </div>
                )}
                {charAnalysis && !isCharAnalyzing && (
                  <div className="flex items-start gap-2 bg-green-900/20 border border-green-700/30 rounded-lg px-3 py-2">
                    <span className="text-green-400 text-base mt-0.5">&#10003;</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-green-400 font-bold">AI 분석 완료</span>
                      <p className="text-sm text-gray-400 leading-relaxed mt-0.5 line-clamp-3">{charAnalysis}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>}
          </div>

          {/* Text Mode Selection */}
          <div>
            <h3 className="text-lg font-bold text-white mb-3">{setup.mode === 'reference' ? '5' : '4'}. 썸네일 텍스트 설정</h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setSetup(prev => ({ ...prev, textMode: 'auto', customText: '' }))}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  setup.textMode === 'auto'
                    ? 'border-pink-500 bg-pink-900/20'
                    : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                }`}
              >
                <div className="text-xl mb-1">&#129302;</div>
                <div className={`text-sm font-bold ${setup.textMode === 'auto' ? 'text-pink-300' : 'text-gray-300'}`}>AI 자동</div>
                <div className="text-xs text-gray-400 mt-0.5">AI가 바이럴 문구 생성</div>
              </button>
              <button
                onClick={() => setSetup(prev => ({ ...prev, textMode: 'custom' }))}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  setup.textMode === 'custom'
                    ? 'border-pink-500 bg-pink-900/20'
                    : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                }`}
              >
                <div className="text-xl mb-1">&#9999;&#65039;</div>
                <div className={`text-sm font-bold ${setup.textMode === 'custom' ? 'text-pink-300' : 'text-gray-300'}`}>직접 입력</div>
                <div className="text-xs text-gray-400 mt-0.5">내가 쓴 문구로 생성</div>
              </button>
              <button
                onClick={() => setSetup(prev => ({ ...prev, textMode: 'none', customText: '' }))}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  setup.textMode === 'none'
                    ? 'border-pink-500 bg-pink-900/20'
                    : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'
                }`}
              >
                <div className="text-xl mb-1">&#128444;&#65039;</div>
                <div className={`text-sm font-bold ${setup.textMode === 'none' ? 'text-pink-300' : 'text-gray-300'}`}>이미지만</div>
                <div className="text-xs text-gray-400 mt-0.5">제목 없이 배경만 생성</div>
              </button>
            </div>
            {setup.textMode === 'custom' && (
              <div className="mt-3">
                <textarea
                  value={setup.customText}
                  onChange={(e) => setSetup(prev => ({ ...prev, customText: e.target.value }))}
                  placeholder="썸네일에 넣을 문구를 입력하세요..."
                  className="w-full h-16 bg-gray-900 border border-pink-500/50 rounded-lg p-3 text-white text-sm focus:border-pink-500 outline-none resize-none focus:ring-1 focus:ring-pink-500"
                />
                <p className="text-xs text-gray-500 mt-1">4개 썸네일에 동일한 문구가 적용됩니다.</p>
              </div>
            )}
            {setup.textMode === 'none' && (
              <div className="mt-3 bg-blue-900/20 border border-blue-700/30 rounded-lg p-3">
                <p className="text-sm text-blue-200 leading-relaxed">
                  &#128161; 제목 없이 배경 이미지만 생성됩니다. 포토샵이나 캔바에서 직접 제목을 넣으실 분에게 추천합니다.
                </p>
              </div>
            )}
          </div>

          {/* Style (random mode only) */}
          {setup.mode === 'random' && (
            <div>
              <h3 className="text-lg font-bold text-white mb-3">5. 비주얼 스타일 (선택)</h3>
              <div className="bg-gradient-to-r from-purple-900/30 via-gray-800/50 to-orange-900/30 border border-gray-600 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 bg-purple-500/30 rounded flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-300">1</span>
                      </div>
                      <span className="text-sm font-bold text-purple-300">캐릭터 분석 우선</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">캐릭터 이미지를 업로드하면 AI가 예술 스타일과 시각적 특징을 자동 분석하여 최우선으로 반영합니다.</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 bg-orange-500/30 rounded flex items-center justify-center">
                        <span className="text-xs font-bold text-orange-300">2</span>
                      </div>
                      <span className="text-sm font-bold text-orange-300">비주얼 스타일 강제</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">비주얼 스타일을 직접 선택하면 캐릭터 분석 결과를 무시하고 선택한 스타일이 강제 적용됩니다.</p>
                  </div>
                </div>
                <p className="text-sm text-yellow-300 mt-2 flex items-center gap-1">&#128269; 미리보기 이미지를 클릭하면 크게 확인할 수 있습니다.</p>
              </div>
              {setup.atmosphere && (
                <div className="bg-pink-900/20 border border-pink-500/30 rounded-lg p-2 flex justify-between items-center mb-3">
                  <span className="text-base text-pink-200 font-bold truncate pr-4">
                    &#127912; {getVisualStyleLabel(setup.atmosphere) || '직접 입력'}
                  </span>
                  <button onClick={() => setSetup(prev => ({ ...prev, atmosphere: '' }))} className="text-sm text-red-400 hover:text-red-300 underline shrink-0">초기화</button>
                </div>
              )}
              <div className="mb-3">
                <VisualStylePicker
                  value={setup.atmosphere}
                  onChange={(prompt) => setSetup(prev => ({ ...prev, atmosphere: prompt }))}
                  colorTheme="pink"
                  compact
                />
              </div>
              <textarea
                value={setup.atmosphere}
                onChange={(e) => setSetup(prev => ({ ...prev, atmosphere: e.target.value }))}
                placeholder="스타일을 직접 묘사하거나 위에서 선택하세요..."
                className="w-full h-16 bg-gray-900 border border-gray-600 rounded-lg p-3 text-white text-sm focus:border-pink-500 outline-none resize-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SetupPanel;

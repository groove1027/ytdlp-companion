
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { ProjectConfig, CharacterDraft, ScriptModeState } from '../types';
import { getCloudinaryConfig, getKieKey, getLaozhangKey, getApimartKey, getRemoveBgKey } from '../services/apiService';

// [v4.5] CharacterMode/RemakeMode 주석처리됨 - 추후 복원 가능
// const CharacterMode = lazy(() => import('./modes/CharacterMode'));
const ScriptMode = lazy(() => import('./modes/ScriptMode'));
// const RemakeMode = lazy(() => import('./modes/RemakeMode'));
const ThumbnailMode = lazy(() => import('./modes/ThumbnailMode'));

interface ConfigFormProps {
  onNext: (config: ProjectConfig) => void;
  isLoading: boolean;
  onSetProcessing: (active: boolean, message?: string, mode?: string) => void; 
  onCostAdd?: (amount: number, type: 'image' | 'video' | 'analysis') => void; 
  onSaveDraft?: (draftConfig: Partial<ProjectConfig>) => void; // [NEW] Save draft handler
  initialDraft?: CharacterDraft | null; // [NEW] Allow resuming character draft
}

const ConfigForm: React.FC<ConfigFormProps> = ({ 
    onNext, 
    isLoading, 
    onSetProcessing, 
    onCostAdd, 
    onSaveDraft, 
    initialDraft
}) => {
  // [UPDATED] If initialDraft exists, start at 'character' mode implicitly
  // [v4.5] CHARACTER/REMAKE mode 주석처리됨 - 추후 복원 가능
  // const [activeTab, setActiveTab] = useState<'character' | 'script' | 'remake' | 'thumbnail'>(initialDraft ? 'character' : 'script');
  const [activeTab, setActiveTab] = useState<'script' | 'thumbnail'>('script');
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  
  // [NEW] Linked Character State (Bridge between CharacterMode and ScriptMode)
  const [linkedCharacter, setLinkedCharacter] = useState<{ image: string, publicUrl?: string } | null>(null);
  // [NEW] Cache analysis result to prevent redundant API calls on tab switch
  const [linkedAnalysisResult, setLinkedAnalysisResult] = useState<{ style: string, character: string } | null>(null);
  
  // [NEW] Persistent State for ScriptMode (Lifting State Up)
  const [scriptModeSavedState, setScriptModeSavedState] = useState<ScriptModeState | null>(null);

  const [showLinkToast, setShowLinkToast] = useState(false);

  // [NEW] Handler to link character to script mode
  const handleLinkCharacter = (image: string, publicUrl?: string) => {
      setLinkedCharacter({ image, publicUrl });
      // Reset analysis cache because the image has changed
      setLinkedAnalysisResult(null);
      setActiveTab('script');
      // Show success toast
      setShowLinkToast(true);
      setTimeout(() => setShowLinkToast(false), 3000);
  };
  
  // API Key Check
  useEffect(() => {
    const missing = [];
    
    // [UPDATED] Kie Key is now PRIMARY for Analysis and Grok
    if (!getKieKey()) {
        missing.push("Kie API Key (필수: Gemini 3 분석 + Grok 영상)");
    }

    // Laozhang for Fallback & Image
    if (!getLaozhangKey()) {
        missing.push("Laozhang API Key (필수: 이미지 생성)");
    }

    if (!getApimartKey()) {
        missing.push("Apimart API Key (선택: Veo 1080p 영상)");
    }

    if (!getRemoveBgKey()) {
        missing.push("Remove.bg API Key (선택: 고품질 누끼 자동화)");
    }
    
    const cloudConfig = getCloudinaryConfig();
    if (!cloudConfig.cloudName || !cloudConfig.uploadPreset) {
        missing.push("Cloudinary (필수: 이미지 전송용)");
    }
    
    setMissingKeys(missing);
  }, []);

  const getTabStyle = (tabId: string, color: string) => {
      const isActive = activeTab === tabId;
      if (!isActive) return 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30';
      
      if (color === 'orange') return 'border-orange-500 text-orange-400 bg-gray-800/50';
      if (color === 'blue') return 'border-blue-500 text-blue-400 bg-gray-800/50';
      if (color === 'purple') return 'border-purple-500 text-purple-400 bg-gray-800/50';
      if (color === 'pink') return 'border-pink-500 text-pink-400 bg-gray-800/50';
      return '';
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 relative">
      
      {/* [NEW] Success Toast Notification */}
      {showLinkToast && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-full shadow-2xl z-[9999] animate-bounce-in flex items-center gap-3 border-2 border-green-400/50">
            <span className="text-2xl bg-white rounded-full p-1">✅</span>
            <div>
                <p className="font-bold text-base">캐릭터가 대본 모드에 적용되었습니다!</p>
                <p className="text-sm text-green-100 opacity-90">이제 대본만 작성하면 프로젝트가 시작됩니다.</p>
            </div>
        </div>
      )}

      {/* Warning Banner - High Visibility Red/Orange */}
      {missingKeys.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-red-600 to-orange-600 rounded-lg p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-bounce-in">
              <div className="flex items-start gap-3">
                  <div className="text-3xl bg-white/20 rounded-full p-2">🚨</div>
                  <div>
                      <h4 className="font-black text-white text-xl drop-shadow-md">필수 API 설정이 누락되었습니다!</h4>
                      <div className="text-base text-white/90 mt-1 font-medium">
                           앱의 정상적인 작동을 위해 아래 키들을 반드시 설정해주세요:
                           <ul className="list-disc list-inside mt-1 bg-black/20 p-2 rounded text-white text-sm font-bold">
                               {missingKeys.map((k, i) => <li key={i}>{k}</li>)}
                           </ul>
                      </div>
                  </div>
              </div>
              <div className="text-right w-full md:w-auto">
                  <p className="text-sm text-white/80 mb-2 font-bold">설정이 완료되어야 생성이 가능합니다.</p>
                  <p className="inline-flex items-center gap-2 bg-white text-red-600 px-4 py-2 rounded-full font-bold shadow-md hover:bg-gray-100 transition-colors cursor-default">
                      <span>↖️ 좌측 상단 (≡) 클릭</span>
                      <span>→</span>
                      <span>[⚙️ API 설정]</span>
                  </p>
              </div>
          </div>
      )}

      <h2 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        새 프로젝트 시작
      </h2>
      
      {/* Tab Switching UI */}
      {/* [v4.5] CHARACTER/REMAKE 탭 주석처리됨 - 추후 복원 가능
      <div className="grid grid-cols-4 border-b border-gray-700 mb-8">
          {[
              { id: 'character', label: '👤 캐릭터 생성', color: 'orange' },
              { id: 'script', label: '📝 대본으로 만들기', color: 'blue' },
              { id: 'remake', label: '🎬 영상 리메이크', color: 'purple' },
              { id: 'thumbnail', label: '🖼️ 썸네일', color: 'pink' }
          ].map((tab) => (
      */}
      <div className="grid grid-cols-2 border-b border-gray-700 mb-8">
          {[
              { id: 'script', label: '📝 대본으로 만들기', color: 'blue' },
              { id: 'thumbnail', label: '🖼️ 썸네일', color: 'pink' }
          ].map((tab) => (
              <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 text-center font-bold text-base md:text-lg transition-colors border-b-2 ${getTabStyle(tab.id, tab.color)}`}
              >
                  {tab.label}
              </button>
          ))}
      </div>
      
      {/* Conditional Rendering of Sub-Components */}
      <div className="animate-fade-in">
          <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div><span className="ml-3 text-gray-400 text-base">모드 로딩 중...</span></div>}>
          {/* [v4.5] CHARACTER mode 주석처리됨 - 추후 복원 가능
          {activeTab === 'character' && (
              <CharacterMode
                  onNext={onNext}
                  isLoading={isLoading}
                  onSetProcessing={onSetProcessing}
                  onCostAdd={onCostAdd}
                  onLinkToScript={handleLinkCharacter}
                  onSaveDraft={onSaveDraft}
                  initialDraft={initialDraft}
              />
          )}
          */}

          {activeTab === 'script' && (
              <ScriptMode
                  onNext={onNext}
                  isLoading={isLoading}
                  onSetProcessing={onSetProcessing}
                  linkedCharacterImage={linkedCharacter?.image}
                  linkedCharacterPublicUrl={linkedCharacter?.publicUrl}
                  cachedAnalysis={linkedAnalysisResult}
                  onAnalysisComplete={setLinkedAnalysisResult}
                  onCostAdd={onCostAdd}
                  initialState={scriptModeSavedState} // [NEW] Pass saved state
                  onSaveState={setScriptModeSavedState} // [NEW] Pass saver
              />
          )}

          {/* [v4.5] REMAKE mode 주석처리됨 - 추후 복원 가능
          {activeTab === 'remake' && (
              <RemakeMode onNext={onNext} isLoading={isLoading} />
          )}
          */}

          {activeTab === 'thumbnail' && (
              <ThumbnailMode onSubmit={onNext} isLoading={isLoading} />
          )}
          </Suspense>
      </div>
    </div>
  );
};

export default ConfigForm;

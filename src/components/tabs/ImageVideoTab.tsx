import React, { Suspense, useCallback } from 'react';
import { useImageVideoStore } from '../../stores/imageVideoStore';
import { useProjectStore } from '../../stores/projectStore';
import { showToast } from '../../stores/uiStore';
import { logger } from '../../services/LoggerService';
import { lazyRetry } from '../../utils/retryImport';

const SetupPanel = lazyRetry(() => import('./imagevideo/SetupPanel'));
const StoryboardPanel = lazyRetry(() => import('./imagevideo/StoryboardPanel'));
const VideoRemakePanel = lazyRetry(() => import('./imagevideo/VideoRemakePanel'));

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-orange-400 rounded-full animate-spin" />
      <span className="text-gray-500 text-base">로딩 중...</span>
    </div>
  </div>
);

const ImageVideoTab: React.FC = () => {
  const activeSubTab = useImageVideoStore((s) => s.activeSubTab);
  const setActiveSubTab = useImageVideoStore((s) => s.setActiveSubTab);

  const handleSubTabClick = useCallback((tabId: 'setup' | 'storyboard' | 'remake') => {
    logger.trackAction('이미지/영상 서브탭 전환', tabId);
    if (tabId === 'storyboard') {
      const { scenes } = useProjectStore.getState();
      if (scenes.length === 0) {
        showToast('장면이 없습니다. 프로젝트 설정에서 장면 분석을 먼저 실행하세요.');
        return;
      }
    }
    setActiveSubTab(tabId);
  }, [setActiveSubTab]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-600 rounded-lg flex items-center justify-center text-xl shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">이미지/영상</h1>
              <p className="text-gray-400 text-base">
                대본 기반 장면 분석, 이미지 및 영상 생성을 관리합니다
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex border-b border-gray-700">
          {([
            { id: 'setup' as const, label: '스타일 선택', icon: '🎨' },
            { id: 'storyboard' as const, label: '스토리보드', icon: '🎬' },
            { id: 'remake' as const, label: '영상 리메이크', icon: '🔄' },
          ]).map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSubTabClick(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-base font-semibold transition-all border-b-2 ${
                  isActive
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<LoadingFallback />}>
          {activeSubTab === 'setup' && <SetupPanel />}
          {activeSubTab === 'storyboard' && <StoryboardPanel />}
          {activeSubTab === 'remake' && <VideoRemakePanel />}
        </Suspense>
      </div>
    </div>
  );
};

export default ImageVideoTab;

import React, { Suspense, lazy, useEffect } from 'react';
import { useChannelAnalysisStore } from '../../stores/channelAnalysisStore';
import type { ChannelAnalysisSubTab } from '../../types';

const KeywordLab = lazy(() => import('./channel/KeywordLab'));
const ChannelAnalysisRoom = lazy(() => import('./channel/ChannelAnalysisRoom'));
const VideoAnalysisRoom = lazy(() => import('./channel/VideoAnalysisRoom'));

const SUB_TABS: { id: ChannelAnalysisSubTab; label: string; icon: string }[] = [
  { id: 'keyword-lab', label: '키워드 랩', icon: '🔍' },
  { id: 'channel-room', label: '채널 분석실', icon: '📊' },
  { id: 'video-room', label: '영상 분석실', icon: '🎬' },
];

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
      <span className="text-gray-500 text-sm">로딩 중...</span>
    </div>
  </div>
);

const ChannelAnalysisTab: React.FC = () => {
  const subTab = useChannelAnalysisStore((s) => s.subTab);
  const setSubTab = useChannelAnalysisStore((s) => s.setSubTab);
  const apiUsagePercent = useChannelAnalysisStore((s) => s.apiUsagePercent);

  // IndexedDB에서 저장된 벤치마크 목록 로드
  useEffect(() => {
    useChannelAnalysisStore.getState().loadAllBenchmarks();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-lg flex items-center justify-center text-xl shadow-lg">
              📡
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">채널/영상 분석</h1>
              <p className="text-gray-400 text-sm">
                키워드 리서치와 채널 벤치마킹으로 콘텐츠 전략을 수립하세요.
              </p>
            </div>
          </div>
          {/* API 사용량 (통합) */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>API 사용량</span>
            <div className="w-28 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all" style={{ width: `${apiUsagePercent}%` }} />
            </div>
            <span className="text-gray-400 font-mono">{apiUsagePercent}%</span>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex border-b border-gray-700">
          {SUB_TABS.map((tab) => {
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`
                  flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all border-b-2
                  ${isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  }
                `}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<LoadingFallback />}>
          {subTab === 'keyword-lab' && <KeywordLab />}
          {subTab === 'channel-room' && <ChannelAnalysisRoom />}
          {subTab === 'video-room' && <VideoAnalysisRoom />}
        </Suspense>
      </div>
    </div>
  );
};

export default ChannelAnalysisTab;

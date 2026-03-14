import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useChannelAnalysisStore } from '../../stores/channelAnalysisStore';
import { getYoutubeApiKeyPoolSize, getActiveYoutubeKeyIndex } from '../../services/apiService';
import type { ChannelAnalysisSubTab } from '../../types';

// [FIX #281] lazyRetry — 배포 후 chunk 해시 변경 시 자동 재시도 + 새로고침
function lazyRetry(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    importFn().catch(() => {
      return importFn().catch(() => {
        const reloaded = sessionStorage.getItem('__chunk_reload');
        if (!reloaded) {
          sessionStorage.setItem('__chunk_reload', '1');
          window.location.reload();
        }
        throw new Error('Failed to fetch dynamically imported module');
      });
    })
  );
}

const KeywordLab = lazyRetry(() => import('./channel/KeywordLab'));
const ChannelAnalysisRoom = lazyRetry(() => import('./channel/ChannelAnalysisRoom'));
const VideoAnalysisRoom = lazyRetry(() => import('./channel/VideoAnalysisRoom'));
const SocialAnalysisRoom = lazyRetry(() => import('./channel/SocialAnalysisRoom'));
const ViewAlertPanel = lazyRetry(() => import('./channel/ViewAlertPanel'));

const SUB_TABS: { id: ChannelAnalysisSubTab; label: string; icon: string }[] = [
  { id: 'keyword-lab', label: '키워드 랩', icon: '🔍' },
  { id: 'channel-room', label: '채널 분석실', icon: '📊' },
  { id: 'video-room', label: '영상 분석실', icon: '🎬' },
  { id: 'social-room', label: '소셜 분석실', icon: '📱' },
  { id: 'view-alert', label: '조회수 알림', icon: '🔔' },
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
  const quotaUsed = useChannelAnalysisStore((s) => s.quotaUsed);
  const quotaLimit = useChannelAnalysisStore((s) => s.quotaLimit);
  const [showQuotaInfo, setShowQuotaInfo] = useState(false);

  // IndexedDB에서 저장된 벤치마크 목록 로드 + 쿼터 동기화
  useEffect(() => {
    useChannelAnalysisStore.getState().loadAllBenchmarks();
    useChannelAnalysisStore.getState().syncQuota();
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
          {/* API 사용량 (실제 쿼터 기반) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowQuotaInfo(!showQuotaInfo)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              <span>API 사용량</span>
              <div className="w-28 h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    apiUsagePercent >= 90 ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : apiUsagePercent >= 70 ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, apiUsagePercent)}%` }}
                />
              </div>
              <span className={`font-mono text-xs ${
                apiUsagePercent >= 90 ? 'text-red-400' : apiUsagePercent >= 70 ? 'text-amber-400' : 'text-gray-400'
              }`}>
                {quotaUsed.toLocaleString()} / {quotaLimit.toLocaleString()}
              </span>
              <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showQuotaInfo ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 쿼터 상세 정보 패널 */}
            {showQuotaInfo && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">YouTube Data API v3 쿼터</h4>
                  <button type="button" onClick={() => setShowQuotaInfo(false)} className="text-gray-500 hover:text-gray-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                {/* 사용량 바 */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">오늘 사용량</span>
                    <span className={`font-mono font-bold ${
                      apiUsagePercent >= 90 ? 'text-red-400' : apiUsagePercent >= 70 ? 'text-amber-400' : 'text-blue-400'
                    }`}>{quotaUsed.toLocaleString()} / {quotaLimit.toLocaleString()} units</span>
                  </div>
                  <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        apiUsagePercent >= 90 ? 'bg-gradient-to-r from-red-500 to-red-600'
                        : apiUsagePercent >= 70 ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                        : 'bg-gradient-to-r from-blue-500 to-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, apiUsagePercent)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">잔여: {(quotaLimit - quotaUsed).toLocaleString()} units ({Math.max(0, 100 - apiUsagePercent)}%)</p>
                </div>

                {/* 작업별 비용 */}
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                  <p className="text-[10px] font-bold text-gray-400 mb-2">작업별 쿼터 비용</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <span className="text-gray-500">키워드 검색</span><span className="text-gray-300 text-right font-mono">100 units</span>
                    <span className="text-gray-500">영상 상세 조회</span><span className="text-gray-300 text-right font-mono">1 unit</span>
                    <span className="text-gray-500">채널 정보 조회</span><span className="text-gray-300 text-right font-mono">1 unit</span>
                    <span className="text-gray-500">댓글 조회</span><span className="text-gray-300 text-right font-mono">1 unit</span>
                    <span className="text-gray-500">자막 조회</span><span className="text-gray-300 text-right font-mono">50 units</span>
                  </div>
                </div>

                {/* 안내 문구 */}
                <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-3 space-y-1.5">
                  <p className="text-[11px] text-blue-300 font-semibold">사용량 추적 방식 안내</p>
                  <p className="text-[10px] text-blue-200/70 leading-relaxed">
                    이 앱 내에서 호출한 YouTube API 사용량을 자동 누적 기록합니다.
                    일일 한도 <strong>10,000 units</strong>이며, 매일 자정(UTC) 자동 리셋됩니다.
                  </p>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    참고: 동일 API 키를 다른 앱/서비스에서도 사용 중이라면, 실제 Google Cloud Console의
                    할당량과 차이가 있을 수 있습니다. 정확한 할당량은
                    Google Cloud Console &gt; API &amp; Services &gt; YouTube Data API v3에서 확인하세요.
                  </p>
                </div>

                {getYoutubeApiKeyPoolSize() > 1 && (
                  <div className="bg-rose-900/20 border border-rose-500/20 rounded-lg p-2.5">
                    <p className="text-[11px] text-rose-400 font-semibold">🔄 다중 키 모드 ({getYoutubeApiKeyPoolSize()}개)</p>
                    <p className="text-[10px] text-rose-300/70">현재 키 #{getActiveYoutubeKeyIndex() + 1} 사용 중. 쿼터 초과 시 다음 키로 자동 전환됩니다.</p>
                  </div>
                )}

                {apiUsagePercent >= 90 && (
                  <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-2.5">
                    <p className="text-[11px] text-red-400 font-semibold">쿼터 한도 임박</p>
                    <p className="text-[10px] text-red-300/70">
                      일일 쿼터의 90% 이상을 사용했습니다.
                      {getYoutubeApiKeyPoolSize() > 1
                        ? ' 쿼터 초과 시 다음 키로 자동 전환됩니다.'
                        : ' 추가 분석 시 한도 초과로 오류가 발생할 수 있습니다.'}
                    </p>
                  </div>
                )}
              </div>
            )}
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
          {subTab === 'social-room' && <SocialAnalysisRoom />}
          {subTab === 'view-alert' && <ViewAlertPanel />}
        </Suspense>
      </div>
    </div>
  );
};

export default ChannelAnalysisTab;

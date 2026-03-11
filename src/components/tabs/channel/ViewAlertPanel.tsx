import React, { useState } from 'react';
import { useViewAlertStore } from '../../../stores/viewAlertStore';
import { useChannelAnalysisStore } from '../../../stores/channelAnalysisStore';

const THRESHOLD_OPTIONS = [
  { label: '1만', value: 10_000 },
  { label: '5만', value: 50_000 },
  { label: '10만', value: 100_000 },
  { label: '50만', value: 500_000 },
  { label: '100만', value: 1_000_000 },
];

const INTERVAL_OPTIONS = [
  { label: '15분', value: 15 },
  { label: '30분', value: 30 },
  { label: '1시간', value: 60 },
  { label: '3시간', value: 180 },
];

const ViewAlertPanel: React.FC = () => {
  const alerts = useViewAlertStore((s) => s.alerts);
  const notifications = useViewAlertStore((s) => s.notifications);
  const isPollingActive = useViewAlertStore((s) => s.isPollingActive);
  const lastCheckTime = useViewAlertStore((s) => s.lastCheckTime);
  const notificationPermission = useViewAlertStore((s) => s.notificationPermission);
  const addAlert = useViewAlertStore((s) => s.addAlert);
  const removeAlert = useViewAlertStore((s) => s.removeAlert);
  const toggleAlert = useViewAlertStore((s) => s.toggleAlert);
  const setPollingActive = useViewAlertStore((s) => s.setPollingActive);
  const requestPermission = useViewAlertStore((s) => s.requestPermission);
  const clearNotifications = useViewAlertStore((s) => s.clearNotifications);

  const savedBenchmarks = useChannelAnalysisStore((s) => s.savedBenchmarks);

  const [selectedBenchmark, setSelectedBenchmark] = useState('');
  const [threshold, setThreshold] = useState(100_000);
  const [customThreshold, setCustomThreshold] = useState('');
  const [intervalMin, setIntervalMin] = useState(60);
  const [showHistory, setShowHistory] = useState(false);

  const activeCount = alerts.filter((a) => a.enabled).length;
  const unreadCount = notifications.filter((n) => !n.read).length;

  // 채널당 1회 체크 비용 추정
  const estimatedCostPerCheck = activeCount; // videos.list = 1 unit per channel
  const checksPerDay = activeCount > 0
    ? Math.floor(1440 / Math.min(...alerts.filter((a) => a.enabled).map((a) => a.intervalMin || 60)))
    : 0;
  const estimatedDailyCost = estimatedCostPerCheck * checksPerDay;
  // 영상 목록 갱신 비용 (6시간마다, search=100)
  const refreshCostPerDay = activeCount * 4 * 100;

  const handleAddAlert = () => {
    const bench = savedBenchmarks.find((b) => b.id === selectedBenchmark);
    if (!bench || !bench.channelInfo?.channelId) return;

    const existing = alerts.find((a) => a.channelId === bench.channelInfo!.channelId);
    if (existing) return;

    const finalThreshold = customThreshold ? parseInt(customThreshold, 10) : threshold;
    if (!finalThreshold || finalThreshold <= 0) return;

    addAlert({
      channelId: bench.channelInfo.channelId,
      channelName: bench.channelName,
      threshold: finalThreshold,
      intervalMin,
      enabled: true,
      trackedVideoIds: [],
    });

    setSelectedBenchmark('');
    setCustomThreshold('');
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const benchmarksWithChannel = savedBenchmarks.filter((b) => b.channelInfo?.channelId);
  const alreadyAdded = new Set(alerts.map((a) => a.channelId));

  return (
    <div className="space-y-6">
      {/* 안내 배너 */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-blue-300">조회수 알림 기능 안내</p>
            <ul className="text-blue-200/80 text-xs space-y-1.5 list-disc list-inside">
              <li><strong className="text-amber-300">이 탭(앱)이 열려있을 때만</strong> 동작합니다. 앱을 닫으면 알림이 중단됩니다.</li>
              <li>체크할 때마다 <strong className="text-amber-300">YouTube API 쿼터가 소모</strong>됩니다.
                <span className="text-gray-400"> — 채널당 약 1 유닛/회, 영상 목록 갱신 시 100 유닛 (6시간마다)</span>
              </li>
              <li>일일 쿼터(10,000)를 초과하면 알림 체크가 자동 중단됩니다.</li>
              <li>브라우저 알림을 허용하면 <strong className="text-green-300">다른 탭에서 작업 중에도</strong> 알림이 표시됩니다.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 브라우저 알림 권한 */}
      {notificationPermission !== 'granted' && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="text-xs text-amber-300">
              {notificationPermission === 'denied'
                ? '브라우저 알림이 차단되었습니다. 브라우저 설정에서 허용해주세요.'
                : '브라우저 알림을 허용하면 다른 탭에서도 알림을 받을 수 있습니다.'
              }
            </span>
          </div>
          {notificationPermission === 'default' && (
            <button
              type="button"
              onClick={requestPermission}
              className="px-3 py-1.5 text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-600/30 transition-colors"
            >
              알림 허용
            </button>
          )}
        </div>
      )}

      {/* 알림 추가 폼 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-sm font-semibold text-blue-400 mb-4 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          새 알림 추가
        </h3>

        {benchmarksWithChannel.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">
            채널 분석실에서 먼저 채널을 분석하세요. 저장된 채널이 여기에 표시됩니다.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 채널 선택 */}
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">감시할 채널</label>
                <select
                  value={selectedBenchmark}
                  onChange={(e) => setSelectedBenchmark(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- 채널 선택 --</option>
                  {benchmarksWithChannel
                    .filter((b) => !alreadyAdded.has(b.channelInfo!.channelId))
                    .map((b) => (
                      <option key={b.id} value={b.id}>{b.channelName}</option>
                    ))
                  }
                </select>
              </div>

              {/* 임계값 */}
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">조회수 기준</label>
                <div className="flex gap-1.5">
                  <select
                    value={customThreshold ? 'custom' : threshold}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setCustomThreshold('');
                      } else {
                        setThreshold(Number(e.target.value));
                        setCustomThreshold('');
                      }
                    }}
                    className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
                  >
                    {THRESHOLD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}회</option>
                    ))}
                    <option value="custom">직접 입력</option>
                  </select>
                  {(customThreshold !== '' || (!THRESHOLD_OPTIONS.some((o) => o.value === threshold) && customThreshold === '')) && (
                    <input
                      type="number"
                      value={customThreshold}
                      onChange={(e) => setCustomThreshold(e.target.value)}
                      placeholder="조회수"
                      className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-2 py-2 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* 주기 */}
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">체크 주기</label>
                <select
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Number(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-blue-500 focus:outline-none"
                >
                  {INTERVAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddAlert}
              disabled={!selectedBenchmark}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                selectedBenchmark
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              알림 추가
            </button>
          </div>
        )}
      </div>

      {/* 활성 알림 목록 */}
      {alerts.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              알림 목록 ({alerts.length}개)
            </h3>

            {/* 전체 토글 */}
            <button
              type="button"
              onClick={() => setPollingActive(!isPollingActive)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                isPollingActive
                  ? 'bg-green-600/20 text-green-300 border border-green-500/30 hover:bg-green-600/30'
                  : 'bg-gray-700 text-gray-400 border border-gray-600 hover:bg-gray-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isPollingActive ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
              {isPollingActive ? '감시 중' : '감시 시작'}
            </button>
          </div>

          {/* 쿼터 소모 예측 */}
          {isPollingActive && activeCount > 0 && (
            <div className="bg-gray-900/50 border border-gray-700/30 rounded-lg p-3 mb-4 text-[10px] text-gray-400 space-y-1">
              <p>예상 일일 쿼터 소모: <strong className="text-amber-300">약 {(estimatedDailyCost + refreshCostPerDay).toLocaleString()} 유닛</strong></p>
              <p className="text-gray-500">
                조회수 체크 {checksPerDay}회/일 x {activeCount}채널 = {estimatedDailyCost} + 영상목록 갱신 {activeCount}채널 x 4회/일 x 100 = {refreshCostPerDay}
              </p>
              {lastCheckTime && (
                <p>마지막 체크: {formatTime(lastCheckTime)}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
                  alert.enabled
                    ? 'bg-gray-900/50 border-gray-700/50'
                    : 'bg-gray-900/20 border-gray-800/30 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-200 truncate">{alert.channelName}</p>
                  <p className="text-[10px] text-gray-500">
                    {alert.threshold.toLocaleString()}회 이상 · {alert.intervalMin < 60 ? `${alert.intervalMin}분` : `${alert.intervalMin / 60}시간`}마다
                    · 감시 영상 {alert.trackedVideoIds.length}개
                    {alert.notifiedVideoIds.length > 0 && (
                      <span className="text-green-400 ml-1">· {alert.notifiedVideoIds.length}건 알림 완료</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 활성/비활성 토글 */}
                  <button
                    type="button"
                    onClick={() => toggleAlert(alert.id)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      alert.enabled ? 'bg-blue-500' : 'bg-gray-600'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      alert.enabled ? 'translate-x-4' : ''
                    }`} />
                  </button>

                  {/* 삭제 */}
                  <button
                    type="button"
                    onClick={() => removeAlert(alert.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 알림 히스토리 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full"
        >
          <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            알림 기록
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </h3>
          <svg className={`w-4 h-4 text-gray-500 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2">
            {notifications.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">아직 알림 기록이 없습니다.</p>
            ) : (
              <>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearNotifications}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    전체 삭제
                  </button>
                </div>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-lg border text-xs ${
                      n.read ? 'bg-gray-900/30 border-gray-800/30' : 'bg-blue-900/10 border-blue-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-200">{n.channelName}</span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(n.timestamp).toLocaleDateString('ko-KR')} {formatTime(n.timestamp)}
                      </span>
                    </div>
                    <p className="text-gray-400 mt-1 truncate">{n.videoTitle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-green-400 font-mono text-[10px]">
                        {n.viewCount.toLocaleString()}회
                      </span>
                      <span className="text-gray-600">|</span>
                      <span className="text-gray-500 text-[10px]">
                        목표 {n.threshold.toLocaleString()}회
                      </span>
                      <a
                        href={`https://www.youtube.com/watch?v=${n.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-[10px] ml-auto"
                      >
                        영상 보기
                      </a>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewAlertPanel;

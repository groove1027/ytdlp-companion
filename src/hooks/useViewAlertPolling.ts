import { useEffect, useRef } from 'react';
import { useViewAlertStore } from '../stores/viewAlertStore';
import { getVideoStatsBatch, getRecentVideoIds } from '../services/youtubeAnalysisService';
import { useChannelAnalysisStore } from '../stores/channelAnalysisStore';
import { showToast } from '../stores/uiStore';

// 6시간마다 영상 목록 갱신
const VIDEO_REFRESH_INTERVAL = 6 * 60 * 60 * 1000;

export const useViewAlertPolling = () => {
  const isPollingActive = useViewAlertStore((s) => s.isPollingActive);
  const alerts = useViewAlertStore((s) => s.alerts);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPollingActive) return;

    const activeAlerts = alerts.filter((a) => a.enabled);
    if (activeAlerts.length === 0) return;

    const minIntervalMs = Math.min(...activeAlerts.map((a) => a.intervalMin)) * 60 * 1000;

    const checkAlerts = async () => {
      const store = useViewAlertStore.getState();
      const currentAlerts = store.alerts.filter((a) => a.enabled);
      if (currentAlerts.length === 0) return;

      for (const alert of currentAlerts) {
        try {
          // 영상 목록 갱신 (처음 or 6시간 경과)
          let videoIds = alert.trackedVideoIds;
          if (videoIds.length === 0 || Date.now() - alert.lastRefreshedAt > VIDEO_REFRESH_INTERVAL) {
            videoIds = await getRecentVideoIds(alert.channelId, 10);
            store.updateTrackedVideos(alert.id, videoIds);
          }

          if (videoIds.length === 0) continue;

          // 조회수 확인 (1 unit per batch)
          const stats = await getVideoStatsBatch(videoIds);
          const freshAlert = useViewAlertStore.getState().alerts.find((a) => a.id === alert.id);
          if (!freshAlert) continue;

          for (const video of stats) {
            if (video.viewCount >= freshAlert.threshold && !freshAlert.notifiedVideoIds.includes(video.videoId)) {
              store.addNotifiedVideo(alert.id, video.videoId);
              store.addNotification({
                channelName: freshAlert.channelName,
                videoId: video.videoId,
                videoTitle: video.title,
                viewCount: video.viewCount,
                threshold: freshAlert.threshold,
                timestamp: Date.now(),
                read: false,
              });

              // 브라우저 네이티브 알림
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(`${freshAlert.channelName}`, {
                  body: `"${video.title}" — ${video.viewCount.toLocaleString()}회 돌파! (목표: ${freshAlert.threshold.toLocaleString()})`,
                  tag: video.videoId,
                });
              }

              showToast(
                `${freshAlert.channelName}: "${video.title.slice(0, 30)}..." ${video.viewCount.toLocaleString()}회 돌파!`,
                8000,
              );
            }
          }
        } catch (e) {
          console.warn('[ViewAlert] check failed:', alert.channelName, e);
        }
      }

      store.setLastCheckTime(Date.now());
      useChannelAnalysisStore.getState().syncQuota();
    };

    // 즉시 1회 + 주기적 실행
    checkAlerts();
    intervalRef.current = setInterval(checkAlerts, minIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPollingActive, alerts]);
};

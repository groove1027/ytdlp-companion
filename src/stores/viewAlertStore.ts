import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewAlertConfig, ViewAlertNotification } from '../types';

interface ViewAlertStore {
  alerts: ViewAlertConfig[];
  notifications: ViewAlertNotification[];
  isPollingActive: boolean;
  lastCheckTime: number | null;
  notificationPermission: NotificationPermission;

  addAlert: (config: Omit<ViewAlertConfig, 'id' | 'notifiedVideoIds' | 'lastRefreshedAt'>) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  updateTrackedVideos: (alertId: string, videoIds: string[]) => void;
  addNotifiedVideo: (alertId: string, videoId: string) => void;
  setPollingActive: (active: boolean) => void;
  setLastCheckTime: (time: number) => void;
  addNotification: (notif: Omit<ViewAlertNotification, 'id'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  updatePermission: () => void;
  requestPermission: () => Promise<void>;
}

export const useViewAlertStore = create<ViewAlertStore>()(
  persist(
    (set) => ({
      alerts: [],
      notifications: [],
      isPollingActive: false,
      lastCheckTime: null,
      notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'default',

      addAlert: (config) => {
        const alert: ViewAlertConfig = {
          ...config,
          id: `va-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          notifiedVideoIds: [],
          lastRefreshedAt: 0,
        };
        set((s) => ({ alerts: [...s.alerts, alert] }));
      },

      removeAlert: (id) => set((s) => ({
        alerts: s.alerts.filter((a) => a.id !== id),
      })),

      toggleAlert: (id) => set((s) => ({
        alerts: s.alerts.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a),
      })),

      updateTrackedVideos: (alertId, videoIds) => set((s) => ({
        alerts: s.alerts.map((a) =>
          a.id === alertId ? { ...a, trackedVideoIds: videoIds, lastRefreshedAt: Date.now() } : a
        ),
      })),

      addNotifiedVideo: (alertId, videoId) => set((s) => ({
        alerts: s.alerts.map((a) =>
          a.id === alertId ? { ...a, notifiedVideoIds: [...a.notifiedVideoIds, videoId] } : a
        ),
      })),

      setPollingActive: (active) => set({ isPollingActive: active }),
      setLastCheckTime: (time) => set({ lastCheckTime: time }),

      addNotification: (notif) => {
        const full: ViewAlertNotification = {
          ...notif,
          id: `vn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        };
        set((s) => ({ notifications: [full, ...s.notifications].slice(0, 50) }));
      },

      markNotificationRead: (id) => set((s) => ({
        notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
      })),

      clearNotifications: () => set({ notifications: [] }),

      updatePermission: () => {
        if (typeof Notification !== 'undefined') {
          set({ notificationPermission: Notification.permission });
        }
      },

      requestPermission: async () => {
        if (typeof Notification === 'undefined') return;
        const result = await Notification.requestPermission();
        set({ notificationPermission: result });
      },
    }),
    {
      name: 'view-alert-store',
      partialize: (state) => ({
        alerts: state.alerts,
        notifications: state.notifications.slice(0, 20),
        isPollingActive: state.isPollingActive,
      }),
    },
  ),
);

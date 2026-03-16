import { create } from 'zustand';
import type { SyncStatus } from '../types';

interface SyncStore {
  // State
  projectSyncStatus: Record<string, SyncStatus>;
  isSyncing: boolean;
  lastFullSyncAt: number | null;
  syncError: string | null;

  // Actions
  setSyncStatus: (projectId: string, status: SyncStatus) => void;
  setSyncStatusBatch: (statuses: Record<string, SyncStatus>) => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastFullSyncAt: (ts: number) => void;
  setSyncError: (error: string | null) => void;
  clearAllSyncStatus: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  projectSyncStatus: {},
  isSyncing: false,
  lastFullSyncAt: null,
  syncError: null,

  setSyncStatus: (projectId, status) =>
    set((s) => ({
      projectSyncStatus: { ...s.projectSyncStatus, [projectId]: status },
    })),

  setSyncStatusBatch: (statuses) =>
    set((s) => ({
      projectSyncStatus: { ...s.projectSyncStatus, ...statuses },
    })),

  setIsSyncing: (syncing) => set({ isSyncing: syncing }),

  setLastFullSyncAt: (ts) => set({ lastFullSyncAt: ts }),

  setSyncError: (error) => set({ syncError: error }),

  clearAllSyncStatus: () => set({ projectSyncStatus: {} }),
}));

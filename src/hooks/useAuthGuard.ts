import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

/**
 * Soft Gate 훅 — 비로그인 사용자의 작업 시도 시 가입 유도
 *
 * 사용법:
 *   const { requireAuth } = useAuthGuard();
 *   const handleGenerate = () => {
 *     if (!requireAuth('AI 대본 생성')) return;
 *     // ... 실제 로직
 *   };
 */
export const useAuthGuard = () => {
  const authUser = useAuthStore((s) => s.authUser);

  const requireAuth = useCallback((action: string): boolean => {
    if (authUser) return true;
    useUIStore.getState().setAuthPromptAction(action);
    return false;
  }, [authUser]);

  return { requireAuth, isLoggedIn: !!authUser, authUser };
};

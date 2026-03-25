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

  // [FIX #812/#807] 직접 스토어 상태 참조 — useCallback 클로저가 이전 authUser를 포착하여
  // 로그인 후에도 null로 남아있는 stale closure 버그 수정
  const requireAuth = useCallback((action: string): boolean => {
    const currentUser = useAuthStore.getState().authUser;
    if (currentUser) return true;
    useUIStore.getState().setAuthPromptAction(action);
    return false;
  }, []);

  return { requireAuth, isLoggedIn: !!authUser, authUser };
};

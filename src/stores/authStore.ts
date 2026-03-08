import { create } from 'zustand';
import { verifyToken, AuthUser } from '../services/authService';

interface AuthStore {
  authUser: AuthUser | null;
  authChecking: boolean;
  setAuthUser: (user: AuthUser | null) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  authUser: null,
  authChecking: true,
  setAuthUser: (user) => set({ authUser: user }),
  checkAuth: async () => {
    set({ authChecking: true });
    try {
      const user = await verifyToken();
      set({ authUser: user, authChecking: false });
    } catch {
      set({ authUser: null, authChecking: false });
    }
  },
}));

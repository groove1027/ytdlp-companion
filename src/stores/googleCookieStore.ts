/**
 * Google 쿠키 + 사용량 관리 Zustand 스토어
 * - localStorage에 쿠키/사용량 영속화
 * - 일일 이미지 한도 추적
 * - 월간 영상 한도 추적
 */

import { create } from 'zustand';
import { validateGoogleCookie, invalidateGoogleToken } from '../services/googleImageService';

const LS_KEY = 'GOOGLE_COOKIE_STATE';
const DAILY_IMAGE_LIMIT = 80; // 보수적 설정 (실제 ~100)
const MONTHLY_VIDEO_LIMIT = 5; // Veo 3/3.1 무료 한도

interface GoogleCookieState {
  cookie: string;
  userEmail: string;
  userName: string;
  isValid: boolean;
  isValidating: boolean;

  // 사용량 추적
  dailyImageCount: number;
  dailyImageDate: string; // "2026-03-16"
  monthlyVideoCount: number;
  monthlyVideoMonth: string; // "2026-03"

  // 한도
  dailyImageLimit: number;
  monthlyVideoLimit: number;

  // 액션
  setCookie: (cookie: string) => Promise<boolean>;
  clearCookie: () => void;
  incrementImageCount: () => void;
  incrementVideoCount: () => void;
  canGenerateImage: () => boolean;
  canGenerateVideo: () => boolean;
  getRemainingImages: () => number;
  getRemainingVideos: () => number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function loadPersistedState(): Partial<GoogleCookieState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // 날짜가 바뀌면 카운트 리셋
    if (parsed.dailyImageDate !== today()) {
      parsed.dailyImageCount = 0;
      parsed.dailyImageDate = today();
    }
    if (parsed.monthlyVideoMonth !== thisMonth()) {
      parsed.monthlyVideoCount = 0;
      parsed.monthlyVideoMonth = thisMonth();
    }
    return parsed;
  } catch {
    return {};
  }
}

function persist(state: Partial<GoogleCookieState>): void {
  try {
    const { cookie, userEmail, userName, isValid, dailyImageCount, dailyImageDate, monthlyVideoCount, monthlyVideoMonth } = state as GoogleCookieState;
    localStorage.setItem(LS_KEY, JSON.stringify({
      cookie, userEmail, userName, isValid,
      dailyImageCount, dailyImageDate,
      monthlyVideoCount, monthlyVideoMonth,
    }));
  } catch { /* quota exceeded 등 무시 */ }
}

const initial = loadPersistedState();

export const useGoogleCookieStore = create<GoogleCookieState>((set, get) => ({
  cookie: initial.cookie || '',
  userEmail: initial.userEmail || '',
  userName: initial.userName || '',
  isValid: initial.isValid || false,
  isValidating: false,
  dailyImageCount: initial.dailyImageCount || 0,
  dailyImageDate: initial.dailyImageDate || today(),
  monthlyVideoCount: initial.monthlyVideoCount || 0,
  monthlyVideoMonth: initial.monthlyVideoMonth || thisMonth(),
  dailyImageLimit: DAILY_IMAGE_LIMIT,
  monthlyVideoLimit: MONTHLY_VIDEO_LIMIT,

  setCookie: async (cookie: string) => {
    set({ isValidating: true });
    invalidateGoogleToken();
    try {
      const result = await validateGoogleCookie(cookie);
      const newState = {
        cookie: result.valid ? cookie : '',
        userEmail: result.email,
        userName: result.name,
        isValid: result.valid,
        isValidating: false,
      };
      set(newState);
      if (result.valid) persist({ ...get(), ...newState });
      return result.valid;
    } catch {
      set({ cookie: '', isValid: false, isValidating: false });
      return false;
    }
  },

  clearCookie: () => {
    invalidateGoogleToken();
    const cleared = {
      cookie: '', userEmail: '', userName: '', isValid: false,
      dailyImageCount: 0, dailyImageDate: today(),
      monthlyVideoCount: 0, monthlyVideoMonth: thisMonth(),
    };
    set(cleared);
    localStorage.removeItem(LS_KEY);
  },

  incrementImageCount: () => {
    const state = get();
    const d = today();
    const count = state.dailyImageDate === d ? state.dailyImageCount + 1 : 1;
    set({ dailyImageCount: count, dailyImageDate: d });
    persist({ ...get(), dailyImageCount: count, dailyImageDate: d });
  },

  incrementVideoCount: () => {
    const state = get();
    const m = thisMonth();
    const count = state.monthlyVideoMonth === m ? state.monthlyVideoCount + 1 : 1;
    set({ monthlyVideoCount: count, monthlyVideoMonth: m });
    persist({ ...get(), monthlyVideoCount: count, monthlyVideoMonth: m });
  },

  canGenerateImage: () => {
    const s = get();
    if (!s.isValid || !s.cookie) return false;
    const d = today();
    const count = s.dailyImageDate === d ? s.dailyImageCount : 0;
    return count < DAILY_IMAGE_LIMIT;
  },

  canGenerateVideo: () => {
    const s = get();
    if (!s.isValid || !s.cookie) return false;
    const m = thisMonth();
    const count = s.monthlyVideoMonth === m ? s.monthlyVideoCount : 0;
    return count < MONTHLY_VIDEO_LIMIT;
  },

  getRemainingImages: () => {
    const s = get();
    const d = today();
    const count = s.dailyImageDate === d ? s.dailyImageCount : 0;
    return Math.max(0, DAILY_IMAGE_LIMIT - count);
  },

  getRemainingVideos: () => {
    const s = get();
    const m = thisMonth();
    const count = s.monthlyVideoMonth === m ? s.monthlyVideoCount : 0;
    return Math.max(0, MONTHLY_VIDEO_LIMIT - count);
  },
}));

/**
 * Google 쿠키 + 사용량 관리 Zustand 스토어
 * - localStorage에 쿠키/사용량 영속화
 * - 일일 이미지 한도 추적
 * - 월간 영상 한도 추적
 */

import { create } from 'zustand';
import { validateGoogleCookie, invalidateGoogleToken } from '../services/googleImageService';

const LS_KEY = 'GOOGLE_COOKIE_STATE';
// Gemini Pro 기준 보수적 기본값 — 실제 크레딧은 API 조회로 업데이트
const DEFAULT_DAILY_IMAGE_LIMIT = 150;
const DEFAULT_MONTHLY_VIDEO_CREDITS = 500; // Veo 3.1 Fast 1건 = 10크레딧, 기본 500크레딧 = 50건

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
  incrementVideoCount: (credits?: number) => void;
  canGenerateImage: () => boolean;
  canGenerateVideo: () => boolean;
  getRemainingImages: () => number;
  getRemainingVideos: () => number;
  updateLimits: (imageLim: number, videoLim: number) => void;
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
  dailyImageLimit: DEFAULT_DAILY_IMAGE_LIMIT,
  monthlyVideoLimit: DEFAULT_MONTHLY_VIDEO_CREDITS,

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
    // [FIX #606] 세션 무효화 시 사용량 카운터는 보존 (clearCookie는 세션만 정리)
    const state = get();
    const cleared = {
      cookie: '', userEmail: '', userName: '', isValid: false,
      dailyImageCount: state.dailyImageCount, dailyImageDate: state.dailyImageDate,
      monthlyVideoCount: state.monthlyVideoCount, monthlyVideoMonth: state.monthlyVideoMonth,
    };
    set(cleared);
    persist(cleared);
  },

  incrementImageCount: () => {
    const state = get();
    const d = today();
    const count = state.dailyImageDate === d ? state.dailyImageCount + 1 : 1;
    set({ dailyImageCount: count, dailyImageDate: d });
    persist({ ...get(), dailyImageCount: count, dailyImageDate: d });
  },

  incrementVideoCount: (credits: number = 10) => {
    const state = get();
    const m = thisMonth();
    const count = state.monthlyVideoMonth === m ? state.monthlyVideoCount + credits : credits;
    set({ monthlyVideoCount: count, monthlyVideoMonth: m });
    persist({ ...get(), monthlyVideoCount: count, monthlyVideoMonth: m });
  },

  canGenerateImage: () => {
    const s = get();
    if (!s.isValid || !s.cookie) return false;
    const d = today();
    const count = s.dailyImageDate === d ? s.dailyImageCount : 0;
    return count < s.dailyImageLimit;
  },

  canGenerateVideo: () => {
    const s = get();
    if (!s.isValid || !s.cookie) return false;
    const m = thisMonth();
    const count = s.monthlyVideoMonth === m ? s.monthlyVideoCount : 0;
    return count + 10 <= s.monthlyVideoLimit; // Veo 3.1 Fast = 10 크레딧/건
  },

  getRemainingImages: () => {
    const s = get();
    const d = today();
    const count = s.dailyImageDate === d ? s.dailyImageCount : 0;
    return Math.max(0, s.dailyImageLimit - count);
  },

  getRemainingVideos: () => {
    const s = get();
    const m = thisMonth();
    const count = s.monthlyVideoMonth === m ? s.monthlyVideoCount : 0;
    return Math.max(0, s.monthlyVideoLimit - count);
  },

  updateLimits: (imageLim: number, videoLim: number) => {
    // -1 = skip update, 0+ = set new limit
    if (imageLim >= 0) set({ dailyImageLimit: imageLim });
    if (videoLim >= 0) set({ monthlyVideoLimit: videoLim });
  },
}));

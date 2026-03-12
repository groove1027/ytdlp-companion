import { logger } from './LoggerService';
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

export interface AuthUser {
  email: string;
  displayName: string;
}

export interface ProfileData {
  email: string;
  displayName: string;
  createdAt: string;
  lastLogin: string | null;
}

/** 저장된 토큰 가져오기 (localStorage → sessionStorage 순서) */
export const getToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
};

/** 토큰 + 사용자 정보 저장 (rememberMe에 따라 스토리지 선택) */
export const saveAuth = (token: string, user: AuthUser, rememberMe = true): void => {
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(AUTH_TOKEN_KEY, token);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

/** 로그아웃 (양쪽 스토리지 모두 삭제) */
export const clearAuth = (): void => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
};

/** 저장된 사용자 정보 */
export const getSavedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { logger.trackSwallowedError('AuthService:getSavedUser', e); return null; }
};

/** 저장된 사용자 정보 업데이트 (이름 변경 등) */
const updateSavedUser = (updates: Partial<AuthUser>): void => {
  const current = getSavedUser();
  if (!current) return;
  const updated = { ...current, ...updates };
  // 어느 스토리지에 있든 같은 곳에 업데이트
  if (localStorage.getItem(AUTH_USER_KEY)) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
  } else {
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
  }
};

/** 회원가입 (초대코드 + 이메일) */
export const signup = async (
  email: string, password: string, inviteCode: string, displayName?: string,
  firebaseIdToken?: string
): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, inviteCode, displayName, firebaseIdToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '회원가입 실패');
  saveAuth(data.token, data.user, true);
  return data;
};

/** 소셜 로그인/회원가입 (Google, Kakao, Naver) */
export const socialLogin = async (
  provider: 'google' | 'kakao' | 'naver',
  token: string,
  inviteCode?: string,
  redirectUri?: string,
): Promise<{ token: string; user: AuthUser; isNewUser: boolean; needsInviteCode?: boolean }> => {
  const res = await fetch('/api/auth/social-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, token, inviteCode, redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.needsInviteCode) {
      const err = new Error(data.error || '초대 코드가 필요합니다.') as Error & { needsInviteCode: boolean; pendingToken?: string };
      err.needsInviteCode = true;
      err.pendingToken = data.pendingToken;
      throw err;
    }
    throw new Error(data.error || '소셜 로그인 실패');
  }
  saveAuth(data.token, data.user, true);
  return data;
};

/** 로그인 */
export const login = async (
  email: string, password: string, rememberMe = true
): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '로그인 실패');
  saveAuth(data.token, data.user, rememberMe);
  return data;
};

/** 토큰 유효성 검증 (앱 시작 시 호출) */
export const verifyToken = async (): Promise<AuthUser | null> => {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!data.valid) {
      clearAuth();
      return null;
    }
    // 기존 스토리지 위치 유지
    const isLocal = !!localStorage.getItem(AUTH_TOKEN_KEY);
    saveAuth(token, data.user, isLocal);
    return data.user;
  } catch {
    // 네트워크 오류 시 로컬 캐시 사용 (오프라인 허용)
    return getSavedUser();
  }
};

/** 로그아웃 */
export const logout = async (): Promise<void> => {
  const token = getToken();
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch((e) => { logger.trackSwallowedError('AuthService:logout/fetch', e); });
  }
  clearAuth();
};

/** 프로필 조회 */
export const getProfile = async (): Promise<ProfileData> => {
  const token = getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/auth/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '프로필 조회 실패');
  return data;
};

/** 이름 변경 */
export const updateDisplayName = async (displayName: string): Promise<string> => {
  const token = getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/auth/update-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '이름 변경 실패');
  updateSavedUser({ displayName: data.displayName });
  return data.displayName;
};

/** 비밀번호 변경 */
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const token = getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '비밀번호 변경 실패');
};

/** 계정 삭제 */
export const deleteAccount = async (password: string): Promise<void> => {
  const token = getToken();
  if (!token) throw new Error('로그인이 필요합니다.');

  const res = await fetch('/api/auth/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '계정 삭제 실패');
  clearAuth();
};

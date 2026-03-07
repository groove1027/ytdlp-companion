const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

export interface AuthUser {
  email: string;
  displayName: string;
}

/** 저장된 토큰 가져오기 */
export const getToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

/** 토큰 + 사용자 정보 저장 */
export const saveAuth = (token: string, user: AuthUser): void => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

/** 로그아웃 (토큰 삭제) */
export const clearAuth = (): void => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

/** 저장된 사용자 정보 */
export const getSavedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

/** 회원가입 */
export const signup = async (
  email: string, password: string, inviteCode: string, displayName?: string
): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, inviteCode, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '회원가입 실패');
  saveAuth(data.token, data.user);
  return data;
};

/** 로그인 */
export const login = async (
  email: string, password: string
): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '로그인 실패');
  saveAuth(data.token, data.user);
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
    saveAuth(token, data.user);
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
    }).catch(() => {});
  }
  clearAuth();
};

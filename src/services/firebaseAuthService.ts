/**
 * Firebase Phone Authentication Service
 * - 회원가입 시 전화번호 SMS 인증 전용
 * - Firebase 콘솔에서 Phone Auth 활성화 필요
 *
 * [설정 방법]
 * 1. https://console.firebase.google.com/ 접속
 * 2. 프로젝트 생성 → Authentication → Sign-in method → 전화 활성화
 * 3. 프로젝트 설정 → 일반 → 내 앱 → 웹앱 추가 → 아래 config 값 복사
 */
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  Auth,
  ConfirmationResult,
  User
} from 'firebase/auth';
import { logger } from './LoggerService';

// ── Firebase 설정 ──
// TODO: Firebase 콘솔에서 복사한 값으로 교체
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** Firebase 초기화 (싱글톤) */
export const initFirebase = (): Auth | null => {
  if (auth) return auth;
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.warn('[FirebaseAuth] 설정이 필요합니다. firebaseAuthService.ts의 FIREBASE_CONFIG를 채워주세요.');
    return null;
  }
  try {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    auth.languageCode = 'ko';
    return auth;
  } catch (e) {
    console.error('[FirebaseAuth] 초기화 실패:', e);
    return null;
  }
};

/** reCAPTCHA 설정 (invisible) */
export const setupRecaptcha = (containerId: string): RecaptchaVerifier | null => {
  const a = initFirebase();
  if (!a) return null;
  return new RecaptchaVerifier(a, containerId, { size: 'invisible' });
};

/** OTP 전송 */
export const sendPhoneOTP = async (
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> => {
  const a = initFirebase();
  if (!a) throw new Error('Firebase가 초기화되지 않았습니다.');
  return signInWithPhoneNumber(a, phoneNumber, recaptchaVerifier);
};

/** OTP 검증 — 성공 시 verified phone number 반환 */
export const verifyPhoneOTP = async (
  confirmationResult: ConfirmationResult,
  code: string
): Promise<{ uid: string; phoneNumber: string }> => {
  const result = await confirmationResult.confirm(code);
  return {
    uid: result.user.uid,
    phoneNumber: result.user.phoneNumber || '',
  };
};

/** Google 팝업 로그인 → Firebase ID 토큰 반환 */
export const signInWithGoogle = async (): Promise<string> => {
  const a = initFirebase();
  if (!a) throw new Error('Firebase가 초기화되지 않았습니다. 설정을 확인해주세요.');
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  const result = await signInWithPopup(a, provider);
  return await result.user.getIdToken(true);
};

/** 현재 인증된 사용자의 Firebase ID 토큰 반환 (백엔드 검증용) */
export const getCurrentIdToken = async (): Promise<string | null> => {
  const a = initFirebase();
  if (!a || !a.currentUser) return null;
  try {
    return await a.currentUser.getIdToken(true);
  } catch (e) {
    logger.trackSwallowedError('firebaseAuthService:getCurrentIdToken', e);
    return null;
  }
};

/** Firebase 설정 여부 확인 */
export const isFirebaseConfigured = (): boolean => {
  return FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY' && FIREBASE_CONFIG.apiKey.length > 0;
};

export type { ConfirmationResult, RecaptchaVerifier };

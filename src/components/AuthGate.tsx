/**
 * AuthGate — 로그인/회원가입 + 소셜 로그인 게이트
 * 이메일 회원가입: 초대코드 + 이메일 (전화번호 인증 없음)
 * Google / 카카오 / 네이버 소셜 로그인 지원
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../services/LoggerService';
import {
  isFirebaseConfigured,
  setupRecaptcha,
  sendPhoneOTP,
  verifyPhoneOTP,
  getCurrentIdToken,
  signInWithGoogle,
  type ConfirmationResult,
  type RecaptchaVerifier,
} from '../services/firebaseAuthService';
import { socialLogin, forgotPassword, resetPassword, emailLogin } from '../services/authService';
import { useUIStore } from '../stores/uiStore';

interface AuthGateProps {
  onAuthenticated: (user: { email: string; displayName: string }) => void;
}

type SignupStep = 'form' | 'phone' | 'otp';
type ResetStep = 'email' | 'code' | 'done';
interface SocialPending { provider: 'google' | 'kakao' | 'naver'; token: string; redirectUri?: string }

const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 비밀번호 재설정
  const [resetMode, setResetMode] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  // 전화번호 인증
  const [signupStep, setSignupStep] = useState<SignupStep>('form');
  const [phone, setPhone] = useState('+82 ');
  const [otpCode, setOtpCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // 소셜 로그인
  const [socialLoading, setSocialLoading] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return (p.get('code') && (p.get('state') === 'kakao' || p.get('state') === 'naver')) ? p.get('state') : null;
  });
  const [socialPending, setSocialPending] = useState<SocialPending | null>(null);
  const [oauthUrls, setOauthUrls] = useState<Record<string, string>>({});

  const confirmRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAuthRef = useRef(onAuthenticated);
  onAuthRef.current = onAuthenticated;

  // ── OAuth 설정 로드 + 콜백 감지 ──
  useEffect(() => {
    fetch('/api/auth/oauth-config')
      .then(r => r.ok ? r.json() as Promise<{ kakao?: { authUrl: string }; naver?: { authUrl: string } }> : null)
      .then(c => {
        if (!c) return;
        const u: Record<string, string> = {};
        if (c.kakao?.authUrl) u.kakao = c.kakao.authUrl;
        if (c.naver?.authUrl) u.naver = c.naver.authUrl;
        setOauthUrls(u);
      }).catch((e) => { logger.trackSwallowedError('AuthGate:loadOAuthUrls', e); });

    const p = new URLSearchParams(window.location.search);
    const code = p.get('code'), state = p.get('state');
    if (code && (state === 'kakao' || state === 'naver')) {
      window.history.replaceState({}, '', window.location.pathname);
      const inv = sessionStorage.getItem('social_invite_code') || undefined;
      sessionStorage.removeItem('social_invite_code');
      doSocial(state, code, inv, window.location.origin);
    }
  }, []);

  // ── 카운트다운 ──
  useEffect(() => {
    if (countdown <= 0) return;
    timerRef.current = setInterval(() => {
      setCountdown(p => { if (p <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0; } return p - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [countdown]);

  // ── 소셜 로그인 실행 ──
  const doSocial = async (provider: 'google' | 'kakao' | 'naver', token: string, inv?: string, redir?: string) => {
    setSocialLoading(provider);
    setError('');
    try {
      const r = await socialLogin(provider, token, inv, redir);
      onAuthRef.current(r.user);
    } catch (err: unknown) {
      const e = err as Error & { needsInviteCode?: boolean; pendingToken?: string };
      if (e.needsInviteCode) {
        setSocialPending({ provider, token: e.pendingToken || token, redirectUri: redir });
      } else {
        setError(e.message || '소셜 로그인 실패');
      }
    } finally { setSocialLoading(null); }
  };

  // ── 소셜 초대코드 제출 ──
  const handleSocialInviteSubmit = useCallback(async () => {
    if (!socialPending || !inviteCode.trim()) return;
    await doSocial(socialPending.provider, socialPending.token, inviteCode.trim(), socialPending.redirectUri);
  }, [socialPending, inviteCode]);

  // ── Google 로그인 ──
  const handleGoogleLogin = useCallback(async () => {
    setSocialLoading('google');
    setError('');
    try {
      const idToken = await signInWithGoogle();
      await doSocial('google', idToken);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google 로그인 실패');
      setSocialLoading(null);
    }
  }, []);

  // ── 카카오/네이버 리다이렉트 ──
  const handleOAuthRedirect = useCallback((provider: 'kakao' | 'naver') => {
    const url = oauthUrls[provider];
    if (!url) { setError(`${provider === 'kakao' ? '카카오' : '네이버'} 로그인이 설정되지 않았습니다.`); return; }
    if (inviteCode.trim()) sessionStorage.setItem('social_invite_code', inviteCode.trim());
    window.location.href = url;
  }, [oauthUrls, inviteCode]);

  // ── 로그인 ──
  const handleLogin = useCallback(async () => {
    setError(''); setIsLoading(true);
    try {
      const { login } = await import('../services/authService');
      const result = await login(email, password, rememberMe);
      onAuthenticated(result.user);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '로그인 실패'); }
    finally { setIsLoading(false); }
  }, [email, password, rememberMe, onAuthenticated]);

  // ── 이메일만으로 바로 시작하기 ──
  const handleEmailLogin = useCallback(async () => {
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return; }
    setError(''); setIsLoading(true);
    try {
      const result = await emailLogin(email.trim());
      onAuthenticated(result.user);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '로그인 실패'); }
    finally { setIsLoading(false); }
  }, [email, onAuthenticated]);

  // ── 최종 회원가입 (handleSignupFormSubmit / handleVerifyOTP 보다 먼저 선언) ──
  const handleSignupComplete = useCallback(async (firebaseIdToken?: string) => {
    setIsLoading(true); setError('');
    try {
      const { signup } = await import('../services/authService');
      const result = await signup(email, password, inviteCode, displayName.trim(), firebaseIdToken);
      onAuthenticated(result.user);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '회원가입 실패'); setSignupStep('form'); }
    finally { setIsLoading(false); }
  }, [email, password, inviteCode, displayName, onAuthenticated]);

  // ── 회원가입 폼 제출 ──
  const handleSignupFormSubmit = useCallback(() => {
    setError('');
    if (password !== confirmPassword) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (!displayName.trim()) { setError('이름을 입력해주세요.'); return; }
    if (!inviteCode.trim()) { setError('초대 코드를 입력해주세요.'); return; }
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return; }
    handleSignupComplete();
  }, [password, confirmPassword, inviteCode, email, displayName, handleSignupComplete]);

  // ── OTP 전송 ──
  const handleSendOTP = useCallback(async () => {
    setError('');
    const cleaned = phone.replace(/[\s-]/g, '');
    if (cleaned.length < 10) { setError('전화번호를 정확히 입력해주세요.'); return; }
    setIsLoading(true);
    try {
      if (!recaptchaRef.current) recaptchaRef.current = setupRecaptcha('recaptcha-container');
      if (!recaptchaRef.current) throw new Error('reCAPTCHA 초기화 실패');
      confirmRef.current = await sendPhoneOTP(cleaned, recaptchaRef.current);
      setSignupStep('otp');
      setCountdown(60);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('too-many-requests')) setError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
      else if (msg.includes('invalid-phone-number')) setError('유효하지 않은 전화번호입니다.');
      else setError(`SMS 전송 실패: ${msg}`);
      recaptchaRef.current = null;
    } finally { setIsLoading(false); }
  }, [phone]);

  // ── OTP 검증 ──
  const handleVerifyOTP = useCallback(async () => {
    if (!confirmRef.current || otpCode.length < 6) { setError('인증번호 6자리를 입력해주세요.'); return; }
    setError(''); setIsLoading(true);
    try {
      await verifyPhoneOTP(confirmRef.current, otpCode);
      const idToken = await getCurrentIdToken();
      if (!idToken) { setError('인증 토큰을 가져올 수 없습니다.'); setIsLoading(false); return; }
      await handleSignupComplete(idToken);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('invalid-verification-code')) setError('인증번호가 올바르지 않습니다.');
      else setError(`인증 실패: ${msg}`);
      setIsLoading(false);
    }
  }, [otpCode, handleSignupComplete]);

  // ── 비밀번호 재설정: 인증코드 요청 ──
  const handleForgotPassword = useCallback(async () => {
    if (!resetEmail.trim()) { setError('이메일을 입력해주세요.'); return; }
    setError(''); setIsLoading(true);
    try {
      await forgotPassword(resetEmail.trim());
      setResetStep('code');
      setResetMessage('인증코드가 이메일로 발송되었습니다. 메일함을 확인해주세요.');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '요청 실패'); }
    finally { setIsLoading(false); }
  }, [resetEmail]);

  // ── 비밀번호 재설정: 코드 확인 + 새 비밀번호 ──
  const handleResetPassword = useCallback(async () => {
    if (!resetCode.trim() || resetCode.length < 6) { setError('인증코드 6자리를 입력해주세요.'); return; }
    if (newPassword.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (newPassword !== newPasswordConfirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setError(''); setIsLoading(true);
    try {
      await resetPassword(resetEmail.trim(), resetCode.trim(), newPassword);
      setResetStep('done');
      setResetMessage('비밀번호가 변경되었습니다!');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : '재설정 실패'); }
    finally { setIsLoading(false); }
  }, [resetEmail, resetCode, newPassword, newPasswordConfirm]);

  // ── 비밀번호 재설정 모드 종료 ──
  const exitResetMode = useCallback(() => {
    setResetMode(false); setResetStep('email'); setResetEmail(''); setResetCode('');
    setNewPassword(''); setNewPasswordConfirm(''); setResetMessage(''); setError('');
  }, []);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); mode === 'login' ? (password ? handleLogin() : handleEmailLogin()) : handleSignupFormSubmit(); };
  const resetToSignupForm = () => { setSignupStep('form'); setOtpCode(''); setError(''); recaptchaRef.current = null; };

  const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50';
  const anyLoading = isLoading || !!socialLoading;

  // ── 소셜 초대코드 입력 화면 ──
  if (socialPending) {
    const providerName = socialPending.provider === 'google' ? 'Google' : socialPending.provider === 'kakao' ? '카카오' : '네이버';
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-xl shadow-violet-500/20">
              <span className="text-3xl">AI</span>
            </div>
            <h1 className="text-xl font-bold text-white">신규 가입 — 초대 코드 필요</h1>
            <p className="text-sm text-gray-400 mt-2">{providerName} 계정으로 처음 가입하시는군요!<br/>초대 코드를 입력해주세요.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-amber-400 mb-1.5 block">초대 코드 *</label>
              <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleSocialInviteSubmit()}
                placeholder="초대 코드를 입력하세요" autoFocus
                className="w-full bg-amber-950/30 border-2 border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200 placeholder-amber-700 focus:outline-none focus:border-amber-500/50 font-mono tracking-wider" />
            </div>
            {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
            <button onClick={handleSocialInviteSubmit} disabled={!inviteCode.trim() || !!socialLoading}
              className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all">
              {socialLoading ? '처리 중...' : '가입 완료'}
            </button>
            <button onClick={() => { setSocialPending(null); setError(''); setInviteCode(''); }}
              className="w-full py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors">취소</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 비밀번호 재설정 모드 ──
  if (resetMode) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-xl shadow-violet-500/20">
              <span className="text-3xl">AI</span>
            </div>
            <h1 className="text-xl font-bold text-white">비밀번호 재설정</h1>
            <p className="text-sm text-gray-500 mt-1">
              {resetStep === 'email' && '가입 시 사용한 이메일을 입력해주세요.'}
              {resetStep === 'code' && '이메일로 발송된 인증코드를 입력해주세요.'}
              {resetStep === 'done' && '비밀번호가 성공적으로 변경되었습니다!'}
            </p>
          </div>

          <div className="space-y-4">
            {resetStep === 'email' && (
              <>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">이메일</label>
                  <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !isLoading && handleForgotPassword()}
                    placeholder="email@example.com" autoFocus className={inputClass} />
                </div>
                {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
                <button onClick={handleForgotPassword} disabled={isLoading || !resetEmail.trim()}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all">
                  {isLoading ? '발송 중...' : '인증코드 발송'}
                </button>
              </>
            )}

            {resetStep === 'code' && (
              <>
                {resetMessage && <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl px-4 py-3 text-sm text-blue-400">{resetMessage}</div>}
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">인증코드 (6자리)</label>
                  <input type="text" inputMode="numeric" maxLength={6} value={resetCode}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" autoFocus
                    className={`${inputClass} text-xl text-center tracking-[0.4em] font-mono`} />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">새 비밀번호</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="8자 이상" className={inputClass} />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">새 비밀번호 확인</label>
                  <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !isLoading && handleResetPassword()}
                    placeholder="비밀번호 재입력" className={inputClass} />
                </div>
                {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
                <button onClick={handleResetPassword} disabled={isLoading || resetCode.length < 6 || !newPassword}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all">
                  {isLoading ? '처리 중...' : '비밀번호 변경'}
                </button>
                <button onClick={() => { setResetStep('email'); setError(''); setResetMessage(''); }}
                  className="w-full py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors">인증코드 다시 받기</button>
              </>
            )}

            {resetStep === 'done' && (
              <>
                <div className="bg-green-900/20 border border-green-500/30 rounded-xl px-4 py-5 text-center">
                  <div className="text-3xl mb-2">&#10003;</div>
                  <p className="text-sm text-green-400 font-bold">{resetMessage}</p>
                  <p className="text-xs text-gray-500 mt-1">새 비밀번호로 로그인해주세요.</p>
                </div>
                <button onClick={exitResetMode}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all">
                  로그인으로 돌아가기
                </button>
              </>
            )}

            {resetStep !== 'done' && (
              <button onClick={exitResetMode}
                className="w-full py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors">
                로그인으로 돌아가기
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-xl shadow-violet-500/20">
            <span className="text-3xl">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-white">All-in-One Production</h1>
          <p className="text-sm text-gray-500 mt-1">AI 기반 영상 제작 파이프라인</p>
        </div>

        {/* ── 전화번호 인증 단계 ── */}
        {mode === 'signup' && signupStep !== 'form' ? (
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
            {signupStep === 'phone' && (
              <>
                <div className="text-center mb-5">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-green-600/20 border border-green-500/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </div>
                  <h2 className="text-lg font-bold text-white">본인 인증</h2>
                  <p className="text-xs text-gray-400 mt-1">SMS로 인증번호가 발송됩니다</p>
                </div>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isLoading && handleSendOTP()}
                  placeholder="+82 10-1234-5678" className={`${inputClass} text-lg tracking-wide text-center`} autoFocus />
                {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}
                <button onClick={handleSendOTP} disabled={isLoading}
                  className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all">
                  {isLoading ? '전송 중...' : '인증번호 받기'}
                </button>
                <button onClick={resetToSignupForm} className="w-full mt-2 py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors">이전으로 돌아가기</button>
              </>
            )}
            {signupStep === 'otp' && (
              <>
                <div className="text-center mb-5">
                  <h2 className="text-lg font-bold text-white">인증번호 입력</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    {phone.replace(/[\s-]/g, '')}(으)로 발송됨
                    {countdown > 0 && <span className="text-green-400 ml-1">({countdown}초)</span>}
                  </p>
                </div>
                <input type="text" inputMode="numeric" maxLength={6} value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && !isLoading && handleVerifyOTP()}
                  placeholder="000000" className={`${inputClass} text-2xl text-center tracking-[0.5em] font-mono`} autoFocus />
                {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}
                <button onClick={handleVerifyOTP} disabled={isLoading || otpCode.length < 6}
                  className="w-full mt-4 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all">
                  {isLoading ? '확인 중...' : '인증 확인'}
                </button>
                <button onClick={() => { setSignupStep('phone'); setOtpCode(''); setError(''); recaptchaRef.current = null; }}
                  className="w-full mt-2 py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors">다른 번호로 시도</button>
              </>
            )}
            <div id="recaptcha-container" />
          </div>
        ) : (
          <>
            {/* ── 로그인/회원가입 탭 ── */}
            <div className="flex mb-6 bg-gray-900 rounded-xl p-1 border border-gray-800">
              <button type="button" onClick={() => { setMode('login'); setError(''); setSignupStep('form'); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'login' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}>
                로그인
              </button>
              <button type="button" onClick={() => { setMode('signup'); setError(''); setSignupStep('form'); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${mode === 'signup' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}>
                회원가입
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">이름 (실명) *</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="실명을 입력하세요" required className={inputClass} />
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">이메일</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && mode === 'login' && !password) { e.preventDefault(); handleEmailLogin(); } }}
                  placeholder="email@example.com" required autoComplete="username" className={inputClass} />
              </div>
              {/* 이메일로 바로 시작하기 버튼 (로그인 모드에서만) */}
              {mode === 'login' && (
                <button type="button" onClick={handleEmailLogin} disabled={anyLoading || !email.trim()}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20">
                  {isLoading ? '처리 중...' : '이메일로 바로 시작하기'}
                </button>
              )}
              {mode === 'login' && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-600">또는 비밀번호로 로그인</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">비밀번호</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? '8자 이상' : '비밀번호 입력'} required={mode === 'signup'}
                  minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={inputClass} />
              </div>
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="text-sm text-gray-400 mb-1.5 block">비밀번호 확인</label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="비밀번호 재입력" required className={inputClass} />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-amber-400 mb-1.5 block">초대 코드 *</label>
                    <input type="text" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="초대 코드를 입력하세요" required
                      className="w-full bg-amber-950/30 border-2 border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200 placeholder-amber-700 focus:outline-none focus:border-amber-500/50 font-mono tracking-wider" />
                    <p className="text-xs text-gray-600 mt-1">구매 시 제공받은 초대 코드를 입력해주세요.</p>
                  </div>
                </>
              )}
              {mode === 'login' && (
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer" />
                    <span className="text-sm text-gray-400">로그인 상태 유지 (30일)</span>
                  </label>
                  <button type="button"
                    onClick={() => { setResetMode(true); setResetEmail(email); setError(''); }}
                    className="text-xs text-blue-400/70 hover:text-blue-400 transition-colors">
                    비밀번호를 잊으셨나요?
                  </button>
                </div>
              )}
              {error && <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
              {mode === 'signup' && (
                <p className="text-xs text-center text-gray-500">모든 항목을 입력한 뒤 아래 버튼을 눌러주세요.</p>
              )}
              <button type="submit" disabled={anyLoading}
                className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20">
                {isLoading ? '처리 중...' : mode === 'login' ? '로그인' : '✓ 가입 완료'}
              </button>
            </form>

            {/* ── 소셜 로그인 (설정된 항목만 표시) ── */}
            {(isFirebaseConfigured() || oauthUrls.kakao || oauthUrls.naver) && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-600">또는</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>

                <div className="space-y-2.5">
                  {/* Google — Firebase 설정 시에만 표시 */}
                  {isFirebaseConfigured() && (
                    <button onClick={handleGoogleLogin} disabled={anyLoading}
                      className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      {socialLoading === 'google' ? 'Google 로그인 중...' : 'Google로 계속하기'}
                    </button>
                  )}

                  {/* 카카오 — OAuth URL 설정 시에만 표시 */}
                  {oauthUrls.kakao && (
                    <button onClick={() => handleOAuthRedirect('kakao')} disabled={anyLoading}
                      className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#FEE500', color: '#191919' }}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#191919">
                        <path d="M12 3C6.48 3 2 6.36 2 10.5c0 2.64 1.74 4.98 4.38 6.32l-1.12 4.08c-.1.36.32.64.62.42L10.44 18c.52.06 1.04.1 1.56.1 5.52 0 10-3.36 10-7.5S17.52 3 12 3z"/>
                      </svg>
                      {socialLoading === 'kakao' ? '카카오 로그인 중...' : '카카오로 계속하기'}
                    </button>
                  )}

                  {/* 네이버 — OAuth URL 설정 시에만 표시 */}
                  {oauthUrls.naver && (
                    <button onClick={() => handleOAuthRedirect('naver')} disabled={anyLoading}
                      className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#03C75A' }}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                        <path d="M16.27 3v8.18L7.73 3H3v18h4.73v-8.18L16.27 21H21V3z"/>
                      </svg>
                      {socialLoading === 'naver' ? '네이버 로그인 중...' : '네이버로 계속하기'}
                    </button>
                  )}
                </div>
              </>
            )}

            {false && mode === 'signup' && (
              <p className="text-center text-xs text-gray-600 mt-4">이메일 회원가입 시 전화번호 본인 인증이 필요합니다</p>
            )}
            <p className="text-center text-xs text-gray-600 mt-3">
              {mode === 'login'
                ? '계정이 없으신가요? 상단 "회원가입" 탭을 클릭하세요.'
                : '이미 계정이 있으신가요? 상단 "로그인" 탭을 클릭하세요.'}
            </p>
          </>
        )}

        {/* 로그인/회원가입 문제 시 피드백 */}
        <div className="mt-6 pt-4 border-t border-gray-800/50 text-center">
          <button
            type="button"
            onClick={() => useUIStore.getState().setShowFeedbackModal(true, 'auth')}
            className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
          >
            가입이나 로그인에 문제가 있으신가요? →  피드백 보내기
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthGate;

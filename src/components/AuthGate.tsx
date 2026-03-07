import React, { useState } from 'react';

interface AuthGateProps {
  onAuthenticated: (user: { email: string; displayName: string }) => void;
}

const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const { login, signup } = await import('../services/authService');
      if (mode === 'login') {
        const result = await login(email, password);
        onAuthenticated(result.user);
      } else {
        const result = await signup(email, password, inviteCode, displayName || undefined);
        onAuthenticated(result.user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-xl shadow-violet-500/20">
            <span className="text-3xl">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-white">All-in-One Production</h1>
          <p className="text-sm text-gray-500 mt-1">AI 기반 영상 제작 파이프라인</p>
        </div>

        {/* 탭 전환 */}
        <div className="flex mb-6 bg-gray-900 rounded-xl p-1 border border-gray-800">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === 'signup'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            회원가입
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">닉네임 (선택)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="표시될 이름"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? '8자 이상' : '비밀번호 입력'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 재입력"
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-amber-400 mb-1.5 block">
                  초대 코드 *
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="초대 코드를 입력하세요"
                  required
                  className="w-full bg-amber-950/30 border-2 border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200 placeholder-amber-700 focus:outline-none focus:border-amber-500/50 font-mono tracking-wider"
                />
                <p className="text-xs text-gray-600 mt-1">
                  구매 시 제공받은 초대 코드를 입력해주세요.
                </p>
              </div>
            </>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
          >
            {isLoading
              ? '처리 중...'
              : mode === 'login' ? '로그인' : '회원가입'
            }
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          {mode === 'login'
            ? '계정이 없으신가요? 상단 "회원가입" 탭을 클릭하세요.'
            : '이미 계정이 있으신가요? 상단 "로그인" 탭을 클릭하세요.'
          }
        </p>
      </div>
    </div>
  );
};

export default AuthGate;

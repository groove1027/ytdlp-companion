/**
 * AuthPromptModal — 비로그인 사용자가 작업 시도 시 가입 유도 모달
 */
import React from 'react';
import { useUIStore } from '../stores/uiStore';

const BENEFITS = [
  { icon: '✨', text: 'AI 대본 생성 · 장면 분할 · 이미지 생성' },
  { icon: '🎬', text: '영상 생성 · TTS 나레이션 · 배경음악' },
  { icon: '💾', text: '프로젝트 저장 · 내보내기 · 업로드' },
];

const AuthPromptModal: React.FC = () => {
  const action = useUIStore((s) => s.authPromptAction);
  if (!action) return null;

  const close = () => useUIStore.getState().setAuthPromptAction(null);
  const openAuth = () => {
    useUIStore.getState().setShowAuthGateModal(true);
    useUIStore.getState().setAuthPromptAction(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={close}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아이콘 */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">회원가입이 필요합니다</h2>
          <p className="text-sm text-gray-400 mt-1.5">
            <span className="text-violet-400 font-bold">{action}</span> 기능을 사용하려면<br/>회원가입 후 이용해주세요.
          </p>
        </div>

        {/* 혜택 */}
        <div className="space-y-2 mb-6">
          {BENEFITS.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700/50">
              <span className="text-base flex-shrink-0">{b.icon}</span>
              <span className="text-sm text-gray-300">{b.text}</span>
            </div>
          ))}
        </div>

        {/* 버튼 */}
        <button
          onClick={openAuth}
          className="w-full py-3 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 transition-all shadow-lg shadow-violet-500/20"
        >
          회원가입 / 로그인
        </button>
        <button
          onClick={close}
          className="w-full mt-2 py-2 text-gray-500 hover:text-gray-300 text-xs transition-colors"
        >
          나중에
        </button>
      </div>
    </div>
  );
};

export default AuthPromptModal;

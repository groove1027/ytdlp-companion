import React, { useState, useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import {
  AuthUser,
  ProfileData,
  getProfile,
  updateDisplayName,
  changePassword,
  deleteAccount,
  logout,
} from '../services/authService';

interface ProfileModalProps {
  authUser: AuthUser;
  onUserUpdate: (user: AuthUser) => void;
  onAccountDeleted: () => void;
}

type Section = 'profile' | 'nickname' | 'password' | 'delete';

const ProfileModal: React.FC<ProfileModalProps> = ({ authUser, onUserUpdate, onAccountDeleted }) => {
  const show = useUIStore((s) => s.showProfileModal);
  const close = () => useUIStore.getState().setShowProfileModal(false);

  const [section, setSection] = useState<Section>('profile');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 이름 변경
  const [newName, setNewName] = useState('');

  // 비밀번호 변경
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // 계정 삭제
  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const resetForm = useCallback(() => {
    setError('');
    setSuccess('');
    setNewName('');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setDeletePw('');
    setDeleteConfirm(false);
  }, []);

  // 프로필 로드
  useEffect(() => {
    if (!show) return;
    setSection('profile');
    resetForm();
    setLoading(true);
    getProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [show, resetForm]);

  // ESC 닫기
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show]);

  const handleSectionChange = (s: Section) => {
    setSection(s);
    resetForm();
    if (s === 'nickname') setNewName(authUser.displayName);
  };

  const handleNicknameSubmit = async () => {
    if (!newName.trim()) { setError('이름을 입력해주세요.'); return; }
    setLoading(true); setError('');
    try {
      const updated = await updateDisplayName(newName);
      onUserUpdate({ ...authUser, displayName: updated });
      setSuccess('이름이 변경되었습니다.');
      if (profile) setProfile({ ...profile, displayName: updated });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '이름 변경 실패');
    } finally { setLoading(false); }
  };

  const handlePasswordSubmit = async () => {
    if (!currentPw || !newPw) { setError('모든 필드를 입력해주세요.'); return; }
    if (newPw.length < 8) { setError('새 비밀번호는 8자 이상이어야 합니다.'); return; }
    if (newPw !== confirmPw) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    setLoading(true); setError('');
    try {
      await changePassword(currentPw, newPw);
      setSuccess('비밀번호가 변경되었습니다.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '비밀번호 변경 실패');
    } finally { setLoading(false); }
  };

  const handleDeleteAccount = async () => {
    if (!deletePw) { setError('비밀번호를 입력해주세요.'); return; }
    if (!deleteConfirm) { setError('"계정을 삭제합니다"를 체크해주세요.'); return; }
    setLoading(true); setError('');
    try {
      await deleteAccount(deletePw);
      close();
      onAccountDeleted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '계정 삭제 실패');
    } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await logout();
    close();
    onAccountDeleted();
  };

  if (!show) return null;

  const menuItems: { key: Section; label: string; icon: string }[] = [
    { key: 'profile', label: '프로필 정보', icon: '👤' },
    { key: 'nickname', label: '이름 변경', icon: '✏️' },
    { key: 'password', label: '비밀번호 변경', icon: '🔒' },
    { key: 'delete', label: '계정 삭제', icon: '🗑️' },
  ];

  const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50';
  const btnPrimary = 'px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all';
  const btnDanger = 'px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      {/* 모달 */}
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">내 계정</h2>
          <button onClick={close} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="flex min-h-[360px]">
          {/* 사이드 메뉴 */}
          <nav className="w-40 border-r border-gray-800 py-3 flex flex-col gap-0.5">
            {menuItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleSectionChange(item.key)}
                className={`text-left px-4 py-2.5 text-sm transition-all ${
                  section === item.key
                    ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-500'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}

            <div className="flex-1" />
            <button
              onClick={handleLogout}
              className="text-left px-4 py-2.5 text-sm text-gray-500 hover:text-red-400 transition-all"
            >
              🚪 로그아웃
            </button>
          </nav>

          {/* 콘텐츠 */}
          <div className="flex-1 p-6">
            {/* 알림 메시지 */}
            {error && (
              <div className="mb-4 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 bg-green-900/20 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-green-400">
                {success}
              </div>
            )}

            {/* 프로필 정보 */}
            {section === 'profile' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-200 mb-4">프로필 정보</h3>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : profile ? (
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-gray-500">이름</span>
                      <p className="text-sm text-gray-200 mt-0.5">{profile.displayName}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">이메일</span>
                      <p className="text-sm text-gray-200 mt-0.5">{profile.email}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">가입일</span>
                      <p className="text-sm text-gray-200 mt-0.5">
                        {new Date(profile.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">마지막 로그인</span>
                      <p className="text-sm text-gray-200 mt-0.5">
                        {profile.lastLogin
                          ? new Date(profile.lastLogin).toLocaleString('ko-KR')
                          : '-'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">프로필을 불러올 수 없습니다.</p>
                )}
              </div>
            )}

            {/* 이름 변경 */}
            {section === 'nickname' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-200 mb-4">이름 변경</h3>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">새 이름</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="새 이름 입력"
                    maxLength={30}
                    className={inputClass}
                  />
                </div>
                <button onClick={handleNicknameSubmit} disabled={loading} className={btnPrimary}>
                  {loading ? '변경 중...' : '이름 변경'}
                </button>
              </div>
            )}

            {/* 비밀번호 변경 */}
            {section === 'password' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-200 mb-4">비밀번호 변경</h3>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">현재 비밀번호</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="현재 비밀번호"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">새 비밀번호</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="8자 이상"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">새 비밀번호 확인</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="새 비밀번호 재입력"
                    className={inputClass}
                  />
                </div>
                <button onClick={handlePasswordSubmit} disabled={loading} className={btnPrimary}>
                  {loading ? '변경 중...' : '비밀번호 변경'}
                </button>
              </div>
            )}

            {/* 계정 삭제 */}
            {section === 'delete' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-red-400 mb-2">계정 삭제</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
                </p>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">비밀번호 확인</label>
                  <input
                    type="password"
                    value={deletePw}
                    onChange={(e) => setDeletePw(e.target.value)}
                    placeholder="비밀번호 입력"
                    className={inputClass}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.checked)}
                    className="w-4 h-4 rounded border-red-600 bg-gray-800 text-red-500 focus:ring-red-500/30 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-sm text-red-400">계정을 삭제합니다</span>
                </label>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading || !deleteConfirm || !deletePw}
                  className={btnDanger}
                >
                  {loading ? '삭제 중...' : '계정 영구 삭제'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;

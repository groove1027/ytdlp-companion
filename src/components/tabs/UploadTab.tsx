import React, { useState, useRef, useCallback, useEffect, forwardRef } from 'react';
import { useUploadStore } from '../../stores/uploadStore';
import { useScriptWriterStore } from '../../stores/scriptWriterStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChannelAnalysisStore } from '../../stores/channelAnalysisStore';
import { generateUploadMetadata } from '../../services/uploadMetadataService';
import { extractShoppingTags } from '../../services/shoppingTagService';
import { showToast } from '../../stores/uiStore';
import StepVideo from './upload/StepVideo';
import InlineThumbnailStudio from './upload/InlineThumbnailStudio';
import type { UploadStep, UploadPlatform, ThreadsAuthState, NaverClipAuthState } from '../../types';
import { useElapsedTimer, formatElapsed } from '../../hooks/useElapsedTimer';

// --- Platform Config ---

interface PlatformInfo {
  id: UploadPlatform;
  label: string;
  bgGradient: string;
  icon: React.ReactNode;
  // Static Tailwind classes (JIT-safe)
  selectedBorder: string;
  selectedBg: string;
  checkBorder: string;
  checkBg: string;
}

const PLATFORMS: PlatformInfo[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    bgGradient: 'from-red-500 to-orange-600',
    selectedBorder: 'border-red-500/50',
    selectedBg: 'bg-red-500/10',
    checkBorder: 'border-red-500',
    checkBg: 'bg-red-500',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.4-1.8.5-5.8.5-5.8s0-4-.5-5.8zM9.6 15.5V8.5l6.3 3.5-6.3 3.5z"/>
      </svg>
    ),
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    bgGradient: 'from-gray-900 to-gray-800',
    selectedBorder: 'border-cyan-500/50',
    selectedBg: 'bg-cyan-500/10',
    checkBorder: 'border-cyan-500',
    checkBg: 'bg-cyan-500',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.16z"/>
      </svg>
    ),
  },
  {
    id: 'instagram',
    label: 'Instagram',
    bgGradient: 'from-purple-600 via-pink-500 to-orange-400',
    selectedBorder: 'border-pink-500/50',
    selectedBg: 'bg-pink-500/10',
    checkBorder: 'border-pink-500',
    checkBg: 'bg-pink-500',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C16.67.014 16.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    id: 'threads' as UploadPlatform,
    label: 'Threads',
    bgGradient: 'from-gray-900 to-gray-700',
    selectedBorder: 'border-gray-400/50',
    selectedBg: 'bg-gray-400/10',
    checkBorder: 'border-gray-400',
    checkBg: 'bg-gray-600',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.327 1.303-3.18 1.07-1.02 2.695-1.56 4.7-1.56l.292.002c.63.009 1.217.073 1.77.186.066-.38.093-.782.079-1.2-.07-2.065-.871-3.458-2.46-3.458h-.018c-1.017.013-1.91.397-2.387 1.03l-1.533-1.292c.837-.997 2.16-1.558 3.662-1.558h.067c2.62.036 4.123 2.086 4.239 4.905.037.887-.01 1.717-.141 2.476.56.418 1.04.918 1.43 1.498.82 1.218 1.17 2.7 1.009 4.287-.2 1.958-1.087 3.674-2.564 4.967C18.13 23.104 15.664 23.972 12.186 24zM9.28 15.566c-.129.063-.515.283-.493.896.016.46.313.86.836 1.126.588.302 1.333.422 2.098.384 1.026-.056 1.836-.43 2.41-1.114.365-.434.64-1.003.822-1.693-.726-.206-1.522-.322-2.376-.328h-.024c-1.453 0-2.593.388-3.273 1.029v-.3z"/>
      </svg>
    ),
  },
  {
    id: 'naver-clip' as UploadPlatform,
    label: 'Naver Clip',
    bgGradient: 'from-green-600 to-green-500',
    selectedBorder: 'border-green-500/50',
    selectedBg: 'bg-green-500/10',
    checkBorder: 'border-green-500',
    checkBg: 'bg-green-500',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.273 12.845L7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z"/>
      </svg>
    ),
  },
];

const STEPS: { id: UploadStep; label: string; sub: string; icon: JSX.Element }[] = [
  { id: 'auth', label: '인증', sub: '플랫폼 연결', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> },
  { id: 'video', label: '영상', sub: '파일 선택', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> },
  { id: 'metadata', label: '메타데이터', sub: '제목, 설명, 태그', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> },
  { id: 'thumbnail', label: '썸네일', sub: '커버 이미지', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> },
  { id: 'settings', label: '설정', sub: '공개 범위', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  { id: 'upload', label: '업로드', sub: '최종 업로드', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg> },
];

// 플랫폼별 accent 색상 매핑
const PLATFORM_ACCENT: Record<UploadPlatform, {
  gradient: string; text: string; ring: string; bg: string;
  border: string; btnGradient: string; iconGradient: string;
}> = {
  youtube: { gradient: 'from-red-500 to-red-600', text: 'text-red-400', ring: 'ring-red-500/30', bg: 'bg-red-500/20', border: 'border-red-500/30', btnGradient: 'from-red-500 to-rose-600', iconGradient: 'from-red-500 to-red-700' },
  tiktok: { gradient: 'from-cyan-500 to-teal-600', text: 'text-cyan-400', ring: 'ring-cyan-500/30', bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', btnGradient: 'from-cyan-500 to-teal-600', iconGradient: 'from-cyan-500 to-teal-700' },
  instagram: { gradient: 'from-purple-500 via-pink-500 to-orange-400', text: 'text-pink-400', ring: 'ring-pink-500/30', bg: 'bg-pink-500/20', border: 'border-pink-500/30', btnGradient: 'from-purple-500 to-pink-500', iconGradient: 'from-purple-500 to-pink-700' },
  threads: { gradient: 'from-gray-700 to-gray-900', text: 'text-gray-300', ring: 'ring-gray-500/30', bg: 'bg-gray-500/20', border: 'border-gray-500/30', btnGradient: 'from-gray-700 to-gray-900', iconGradient: 'from-gray-600 to-gray-800' },
  'naver-clip': { gradient: 'from-green-500 to-green-600', text: 'text-green-400', ring: 'ring-green-500/30', bg: 'bg-green-500/20', border: 'border-green-500/30', btnGradient: 'from-green-500 to-green-600', iconGradient: 'from-green-500 to-green-700' },
};

const DEFAULT_ACCENT = PLATFORM_ACCENT.youtube;

// --- SectionCard Wrapper ---

type StepStatus = 'done' | 'active' | 'pending';

const StatusBadge: React.FC<{ status: StepStatus; optional?: boolean }> = ({ status, optional }) => {
  if (status === 'done') {
    return (
      <span className="text-[11px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
        완료
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full animate-pulse">
        진행 중
      </span>
    );
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
      optional
        ? 'bg-gray-700/50 text-gray-500 border border-gray-600/30'
        : 'bg-red-500/20 text-red-400 border border-red-500/30'
    }`}>
      {optional ? '선택사항' : '필요'}
    </span>
  );
};

const SectionCard = forwardRef<HTMLDivElement, {
  icon: React.ReactNode;
  iconGradient: string;
  title: string;
  subtitle: string;
  status: StepStatus;
  optional?: boolean;
  children: React.ReactNode;
}>((props, ref) => (
  <div ref={ref} className="bg-gray-800/60 border border-gray-700/50 rounded-2xl overflow-hidden mb-6 scroll-mt-24">
    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700/30">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${props.iconGradient} flex items-center justify-center text-white shadow-md`}>
        {props.icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">{props.title}</h3>
          <StatusBadge status={props.status} optional={props.optional} />
        </div>
        <p className="text-sm text-gray-500">{props.subtitle}</p>
      </div>
    </div>
    <div className="p-6">{props.children}</div>
  </div>
));
SectionCard.displayName = 'SectionCard';

// --- Step Sub-Components ---

const StepAuth: React.FC = () => {
  const selectedPlatforms = useUploadStore((s) => s.selectedPlatforms);
  const youtubeAuth = useUploadStore((s) => s.youtubeAuth);
  const tiktokAuth = useUploadStore((s) => s.tiktokAuth);
  const instagramAuth = useUploadStore((s) => s.instagramAuth);
  const threadsAuth = useUploadStore((s) => s.threadsAuth);
  const naverClipAuth = useUploadStore((s) => s.naverClipAuth);
  const setYoutubeAuth = useUploadStore((s) => s.setYoutubeAuth);
  const setTiktokAuth = useUploadStore((s) => s.setTiktokAuth);
  const setInstagramAuth = useUploadStore((s) => s.setInstagramAuth);
  const setThreadsAuth = useUploadStore((s) => s.setThreadsAuth);
  const setNaverClipAuth = useUploadStore((s) => s.setNaverClipAuth);
  const clearPlatformAuth = useUploadStore((s) => s.clearPlatformAuth);

  // YouTube OAuth 상태
  const [ytClientId, setYtClientId] = useState(youtubeAuth.clientId || '');
  const [ytClientSecret, setYtClientSecret] = useState(youtubeAuth.clientSecret || '');
  const [ytAuthCode, setYtAuthCode] = useState('');
  const [ytEditingClient, setYtEditingClient] = useState(!youtubeAuth.clientId);
  const [ytIsExchanging, setYtIsExchanging] = useState(false);
  const [ytAuthError, setYtAuthError] = useState('');
  const [ytShowGuide, setYtShowGuide] = useState(false);

  // TikTok OAuth 상태
  const [ttClientKey, setTtClientKey] = useState(tiktokAuth.clientKey || '');
  const [ttClientSecret, setTtClientSecret] = useState(tiktokAuth.clientSecret || '');
  const [ttEditingClient, setTtEditingClient] = useState(!tiktokAuth.clientKey);
  const [ttIsExchanging, setTtIsExchanging] = useState(false);
  const [ttAuthError, setTtAuthError] = useState('');
  const [ttShowGuide, setTtShowGuide] = useState(false);

  // Instagram OAuth 상태
  const [igAppId, setIgAppId] = useState(instagramAuth.appId || '');
  const [igAppSecret, setIgAppSecret] = useState(instagramAuth.appSecret || '');
  const [igEditingClient, setIgEditingClient] = useState(!instagramAuth.appId);
  const [igIsExchanging, setIgIsExchanging] = useState(false);
  const [igAuthError, setIgAuthError] = useState('');
  const [igShowGuide, setIgShowGuide] = useState(false);

  // Threads OAuth 상태
  const [thAppId, setThAppId] = useState(threadsAuth.appId || '');
  const [thAppSecret, setThAppSecret] = useState(threadsAuth.appSecret || '');
  const [thEditingClient, setThEditingClient] = useState(!threadsAuth.appId);
  const [thIsExchanging, setThIsExchanging] = useState(false);
  const [thAuthError, setThAuthError] = useState('');
  const [thShowGuide, setThShowGuide] = useState(false);

  // Naver Clip 상태
  const [ncInput, setNcInput] = useState(naverClipAuth.username || '');
  const [ncShowGuide, setNcShowGuide] = useState(false);

  // 팝업에서 보낸 OAuth 코드를 수신하는 postMessage 리스너
  const autoExchangeRef = useRef<string | null>(null);
  const ttAutoExchangeRef = useRef<string | null>(null);
  const igAutoExchangeRef = useRef<string | null>(null);
  const thAutoExchangeRef = useRef<string | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      // YouTube
      if (e.data?.type === 'YOUTUBE_OAUTH_CODE' && e.data.code) {
        setYtAuthCode(e.data.code);
        autoExchangeRef.current = e.data.code;
      }
      if (e.data?.type === 'YOUTUBE_OAUTH_ERROR') {
        setYtAuthError(`OAuth 실패: ${e.data.error}`);
      }
      // TikTok
      if (e.data?.type === 'TIKTOK_OAUTH_CODE' && e.data.code) {
        ttAutoExchangeRef.current = e.data.code;
        handleTtAutoExchange(e.data.code);
      }
      if (e.data?.type === 'TIKTOK_OAUTH_ERROR') {
        setTtAuthError(`OAuth 실패: ${e.data.error}`);
      }
      // Instagram
      if (e.data?.type === 'INSTAGRAM_OAUTH_CODE' && e.data.code) {
        igAutoExchangeRef.current = e.data.code;
        handleIgAutoExchange(e.data.code);
      }
      if (e.data?.type === 'INSTAGRAM_OAUTH_ERROR') {
        setIgAuthError(`OAuth 실패: ${e.data.error}`);
      }
      // Threads
      if (e.data?.type === 'THREADS_OAUTH_CODE' && e.data.code) {
        thAutoExchangeRef.current = e.data.code;
        handleThAutoExchange(e.data.code);
      }
      if (e.data?.type === 'THREADS_OAUTH_ERROR') {
        setThAuthError(`OAuth 실패: ${e.data.error}`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // YouTube 자동 토큰 교환
  useEffect(() => {
    const code = autoExchangeRef.current;
    if (!code) return;
    autoExchangeRef.current = null;
    const cid = youtubeAuth.clientId || ytClientId.trim();
    const csecret = youtubeAuth.clientSecret || ytClientSecret.trim();
    if (!cid || !csecret) return;
    setYtIsExchanging(true);
    setYtAuthError('');
    (async () => {
      try {
        const { exchangeCodeForTokens, fetchChannelInfo } = await import('../../services/youtubeUploadService');
        const tokens = await exchangeCodeForTokens(code, cid, csecret);
        const channel = await fetchChannelInfo(tokens.accessToken);
        setYoutubeAuth({
          isConnected: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          channelName: channel.channelName,
          channelId: channel.channelId,
          expiresAt: Date.now() + tokens.expiresIn * 1000,
          clientId: cid,
          clientSecret: csecret,
        });
        setYtAuthCode('');
        showToast(`YouTube 채널 "${channel.channelName}" 연동 완료!`, 4000);
      } catch (e: unknown) {
        setYtAuthError(e instanceof Error ? e.message : '인증 실패');
      } finally {
        setYtIsExchanging(false);
      }
    })();
  }, [ytAuthCode, youtubeAuth.clientId, youtubeAuth.clientSecret, ytClientId, ytClientSecret, setYoutubeAuth]);

  // TikTok 자동 토큰 교환
  const handleTtAutoExchange = async (code: string) => {
    const ckey = tiktokAuth.clientKey || ttClientKey.trim();
    const csecret = tiktokAuth.clientSecret || ttClientSecret.trim();
    if (!ckey || !csecret) return;
    setTtIsExchanging(true);
    setTtAuthError('');
    try {
      const { exchangeTikTokCodeForTokens, fetchTikTokUserInfo } = await import('../../services/tiktokUploadService');
      const tokens = await exchangeTikTokCodeForTokens(code, ckey, csecret);
      const user = await fetchTikTokUserInfo(tokens.accessToken);
      setTiktokAuth({
        isConnected: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        openId: tokens.openId,
        username: user.username,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        clientKey: ckey,
        clientSecret: csecret,
      });
      showToast(`TikTok "${user.username}" 연동 완료!`, 4000);
    } catch (e: unknown) {
      setTtAuthError(e instanceof Error ? e.message : '인증 실패');
    } finally {
      setTtIsExchanging(false);
    }
  };

  // Instagram 자동 토큰 교환
  const handleIgAutoExchange = async (code: string) => {
    const appId = instagramAuth.appId || igAppId.trim();
    const appSecret = instagramAuth.appSecret || igAppSecret.trim();
    if (!appId || !appSecret) return;
    setIgIsExchanging(true);
    setIgAuthError('');
    try {
      const { exchangeInstagramCodeForTokens, fetchInstagramUserInfo } = await import('../../services/instagramUploadService');
      const tokens = await exchangeInstagramCodeForTokens(code, appId, appSecret);
      const user = await fetchInstagramUserInfo(tokens.accessToken);
      setInstagramAuth({
        isConnected: true,
        accessToken: tokens.accessToken,
        userId: user.userId,
        username: user.username,
        accountType: user.accountType,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        appId,
        appSecret,
      });
      showToast(`Instagram "@${user.username}" 연동 완료!`, 4000);
    } catch (e: unknown) {
      setIgAuthError(e instanceof Error ? e.message : '인증 실패');
    } finally {
      setIgIsExchanging(false);
    }
  };

  // Threads 자동 토큰 교환
  const handleThAutoExchange = async (code: string) => {
    const appId = threadsAuth.appId || thAppId.trim();
    const appSecret = threadsAuth.appSecret || thAppSecret.trim();
    if (!appId || !appSecret) return;
    setThIsExchanging(true);
    setThAuthError('');
    try {
      const { exchangeThreadsCodeForTokens, fetchThreadsUserInfo } = await import('../../services/threadsUploadService');
      const tokens = await exchangeThreadsCodeForTokens(code, appId, appSecret);
      const user = await fetchThreadsUserInfo(tokens.accessToken, tokens.userId);
      setThreadsAuth({
        isConnected: true,
        accessToken: tokens.accessToken,
        userId: tokens.userId,
        username: user.username,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        appId,
        appSecret,
      });
      showToast(`Threads "@${user.username}" 연동 완료!`, 4000);
    } catch (e: unknown) {
      setThAuthError(e instanceof Error ? e.message : '인증 실패');
    } finally {
      setThIsExchanging(false);
    }
  };

  const getAuth = (p: UploadPlatform) => {
    if (p === 'youtube') return youtubeAuth;
    if (p === 'tiktok') return tiktokAuth;
    if (p === 'threads') return threadsAuth;
    if (p === 'naver-clip') return naverClipAuth;
    return instagramAuth;
  };

  // YouTube OAuth 클라이언트 저장
  const handleSaveYtClient = () => {
    if (!ytClientId.trim() || !ytClientSecret.trim()) return;
    setYoutubeAuth({ clientId: ytClientId.trim(), clientSecret: ytClientSecret.trim() });
    setYtEditingClient(false);
  };

  // YouTube OAuth 동의 팝업 열기
  const handleYtOAuthOpen = async () => {
    const cid = youtubeAuth.clientId || ytClientId.trim();
    if (!cid) { setYtAuthError('OAuth 클라이언트 ID를 먼저 설정해주세요.'); return; }
    setYtAuthError('');
    const { buildOAuthConsentUrl } = await import('../../services/youtubeUploadService');
    const url = buildOAuthConsentUrl(cid);
    window.open(url, 'youtube_oauth', 'width=600,height=700,scrollbars=yes');
  };

  // YouTube 인증 코드 → 토큰 교환
  const handleYtExchangeCode = async () => {
    const code = ytAuthCode.trim();
    const cid = youtubeAuth.clientId || ytClientId.trim();
    const csecret = youtubeAuth.clientSecret || ytClientSecret.trim();
    if (!code || !cid || !csecret) {
      setYtAuthError('인증 코드와 OAuth 클라이언트 정보가 모두 필요합니다.');
      return;
    }
    setYtIsExchanging(true);
    setYtAuthError('');
    try {
      const { exchangeCodeForTokens, fetchChannelInfo } = await import('../../services/youtubeUploadService');
      const tokens = await exchangeCodeForTokens(code, cid, csecret);
      const channel = await fetchChannelInfo(tokens.accessToken);
      setYoutubeAuth({
        isConnected: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        channelName: channel.channelName,
        channelId: channel.channelId,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        clientId: cid,
        clientSecret: csecret,
      });
      setYtAuthCode('');
      showToast(`YouTube 채널 "${channel.channelName}" 연동 완료!`, 4000);
    } catch (e: unknown) {
      setYtAuthError(e instanceof Error ? e.message : '인증 실패');
    } finally {
      setYtIsExchanging(false);
    }
  };

  // TikTok OAuth
  const handleSaveTtClient = () => {
    if (!ttClientKey.trim() || !ttClientSecret.trim()) return;
    setTiktokAuth({ clientKey: ttClientKey.trim(), clientSecret: ttClientSecret.trim() });
    setTtEditingClient(false);
  };

  const handleTtOAuthOpen = async () => {
    const ckey = tiktokAuth.clientKey || ttClientKey.trim();
    if (!ckey) { setTtAuthError('Client Key를 먼저 설정해주세요.'); return; }
    setTtAuthError('');
    const { buildTikTokOAuthUrl } = await import('../../services/tiktokUploadService');
    const url = buildTikTokOAuthUrl(ckey);
    window.open(url, 'tiktok_oauth', 'width=600,height=700,scrollbars=yes');
  };

  // Instagram OAuth
  const handleSaveIgClient = () => {
    if (!igAppId.trim() || !igAppSecret.trim()) return;
    setInstagramAuth({ appId: igAppId.trim(), appSecret: igAppSecret.trim() });
    setIgEditingClient(false);
  };

  const handleIgOAuthOpen = async () => {
    const appId = instagramAuth.appId || igAppId.trim();
    if (!appId) { setIgAuthError('App ID를 먼저 설정해주세요.'); return; }
    setIgAuthError('');
    const { buildInstagramOAuthUrl } = await import('../../services/instagramUploadService');
    const url = buildInstagramOAuthUrl(appId);
    window.open(url, 'instagram_oauth', 'width=600,height=700,scrollbars=yes');
  };

  // Threads OAuth
  const handleSaveThClient = () => {
    if (!thAppId.trim() || !thAppSecret.trim()) return;
    setThreadsAuth({ appId: thAppId.trim(), appSecret: thAppSecret.trim() });
    setThEditingClient(false);
  };

  const handleThOAuthOpen = async () => {
    const appId = threadsAuth.appId || thAppId.trim();
    if (!appId) { setThAuthError('App ID를 먼저 설정해주세요.'); return; }
    setThAuthError('');
    const { buildThreadsOAuthUrl } = await import('../../services/threadsUploadService');
    const url = buildThreadsOAuthUrl(appId);
    window.open(url, 'threads_oauth', 'width=600,height=700,scrollbars=yes');
  };

  const handleDisconnect = (p: UploadPlatform) => {
    clearPlatformAuth(p);
    if (p === 'youtube') { setYtAuthCode(''); setYtEditingClient(true); }
    else if (p === 'tiktok') { setTtEditingClient(true); }
    else if (p === 'instagram') { setIgEditingClient(true); }
    else if (p === 'threads') { setThEditingClient(true); }
    else if (p === 'naver-clip') { setNcInput(''); }
  };

  const platformBtnStyles: Record<UploadPlatform, { connect: string; disconnect: string }> = {
    youtube: { connect: 'bg-red-600 hover:bg-red-500 text-white', disconnect: 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' },
    tiktok: { connect: 'bg-gray-900 hover:bg-gray-800 border border-cyan-500/50 text-white', disconnect: 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' },
    instagram: { connect: 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white', disconnect: 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' },
    threads: { connect: 'bg-gray-800 hover:bg-gray-700 border border-gray-500/50 text-white', disconnect: 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' },
    'naver-clip': { connect: 'bg-green-600 hover:bg-green-500 text-white', disconnect: 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' },
  };

  return (
    <div className="space-y-4">
      {PLATFORMS.filter(p => selectedPlatforms.includes(p.id)).map(platform => {
        const auth = getAuth(platform.id);
        const btnStyle = platformBtnStyles[platform.id];

        return (
          <div key={platform.id} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 bg-gradient-to-br ${platform.bgGradient} rounded-lg flex items-center justify-center text-white shadow-lg`}>
                  {platform.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{platform.label}</h3>
                  <p className="text-sm text-gray-500">
                    {platform.id === 'youtube' && 'Google OAuth 2.0 인증'}
                    {platform.id === 'tiktok' && 'TikTok Content Posting API'}
                    {platform.id === 'instagram' && 'Meta Graph API 인증'}
                    {platform.id === 'threads' && 'Threads Graph API 인증'}
                    {platform.id === 'naver-clip' && '수동 업로드 (공식 API 미제공)'}
                  </p>
                </div>
              </div>
              {auth.isConnected ? (
                <span className="text-sm font-semibold bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  연결됨
                </span>
              ) : platform.id !== 'naver-clip' ? (
                <span className="text-sm font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  연동 필요
                </span>
              ) : null}
            </div>

            {/* 연결됨 — 채널 정보 카드 */}
            {auth.isConnected ? (
              <div className="space-y-3">
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${platform.bgGradient} flex items-center justify-center text-white text-lg font-bold shadow-md flex-shrink-0`}>
                      {platform.id === 'youtube' && (youtubeAuth.channelName?.[0]?.toUpperCase() || 'Y')}
                      {platform.id === 'tiktok' && (tiktokAuth.username?.[0]?.toUpperCase() || 'T')}
                      {platform.id === 'instagram' && (instagramAuth.username?.[0]?.toUpperCase() || 'I')}
                      {platform.id === 'threads' && (threadsAuth.username?.[0]?.toUpperCase() || 'T')}
                      {platform.id === 'naver-clip' && (naverClipAuth.username?.[0]?.toUpperCase() || 'N')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-base truncate">
                        {platform.id === 'youtube' && youtubeAuth.channelName}
                        {platform.id === 'tiktok' && tiktokAuth.username}
                        {platform.id === 'instagram' && instagramAuth.username}
                        {platform.id === 'threads' && threadsAuth.username}
                        {platform.id === 'naver-clip' && naverClipAuth.username}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {platform.id === 'youtube' && youtubeAuth.channelId && (
                          <span className="text-sm text-gray-500 font-mono truncate">{youtubeAuth.channelId}</span>
                        )}
                        {platform.id === 'instagram' && (
                          <span className="text-sm bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/20">
                            {instagramAuth.accountType}
                          </span>
                        )}
                        <span className="text-sm text-gray-600">
                          {platform.id === 'youtube' && 'YouTube 채널'}
                          {platform.id === 'tiktok' && 'TikTok 계정'}
                          {platform.id === 'instagram' && 'Instagram 계정'}
                          {platform.id === 'threads' && 'Threads 계정'}
                          {platform.id === 'naver-clip' && 'Naver 계정'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDisconnect(platform.id)}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${btnStyle.disconnect}`}
                >
                  연결 해제
                </button>
              </div>
            ) : platform.id === 'youtube' ? (
              /* YouTube OAuth 인증 플로우 */
              <div className="space-y-4">
                <p className="text-sm text-gray-400">YouTube 영상 업로드 기능을 사용하려면 Google 계정 연동이 필요합니다</p>

                {/* 상세 설정 가이드 (접이식) */}
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <button type="button" onClick={() => setYtShowGuide(!ytShowGuide)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      처음이신가요? Google Cloud 설정 가이드
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${ytShowGuide ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  {ytShowGuide && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
                      {/* STEP 1 */}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">1</span>
                          <h5 className="text-sm font-bold text-gray-200">Google Cloud 프로젝트 만들기</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p>아래 링크에서 Google Cloud Console에 접속합니다.</p>
                          <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Google Cloud Console - 새 프로젝트
                          </a>
                          <p className="text-gray-500">프로젝트 이름은 자유롭게 입력 (예: "YouTube Upload") 후 <strong className="text-gray-300">"만들기"</strong> 클릭</p>
                        </div>
                      </div>

                      {/* STEP 2 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">2</span>
                          <h5 className="text-sm font-bold text-gray-200">YouTube Data API v3 사용 설정</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p>방금 만든 프로젝트를 선택한 상태에서 아래 링크로 이동합니다.</p>
                          <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            YouTube Data API v3 사용 설정
                          </a>
                          <p className="text-gray-500">파란색 <strong className="text-gray-300">"사용"</strong> 버튼을 클릭하여 API를 활성화합니다.</p>
                        </div>
                      </div>

                      {/* STEP 3 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">3</span>
                          <h5 className="text-sm font-bold text-gray-200">OAuth 동의 화면 설정</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            OAuth 동의 화면 설정
                          </a>
                          <p className="text-gray-500">User Type: <strong className="text-gray-300">"외부"</strong> 선택 후 <strong className="text-gray-300">"만들기"</strong></p>
                          <p className="text-gray-500">앱 이름, 사용자 지원 이메일, 개발자 연락처만 입력하면 됩니다.</p>
                          <p className="text-gray-500">나머지는 기본값으로 <strong className="text-gray-300">"저장 후 계속"</strong>을 눌러 끝까지 진행합니다.</p>
                          <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-amber-500/90 mt-1">
                            <strong>중요!</strong> "테스트 사용자" 단계에서 본인의 Google 이메일을 추가하세요. (테스트 모드에서는 등록된 사용자만 접근 가능)
                          </div>
                        </div>
                      </div>

                      {/* STEP 4 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-400 text-xs font-bold flex items-center justify-center">4</span>
                          <h5 className="text-sm font-bold text-gray-200">OAuth 클라이언트 ID 만들기</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <a href="https://console.cloud.google.com/apis/credentials/oauthclient" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            OAuth 클라이언트 ID 만들기
                          </a>
                          <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 border border-gray-700/50 mt-1">
                            <p><strong className="text-gray-200">애플리케이션 유형:</strong> <span className="text-green-400 font-bold">"웹 애플리케이션"</span> 선택</p>
                            <p><strong className="text-gray-200">이름:</strong> 자유롭게 입력 (예: "YouTube Upload Client")</p>
                            <p><strong className="text-gray-200">승인된 자바스크립트 원본:</strong></p>
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono text-[11px] border border-green-500/20">{window.location.origin}</code>
                              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                            </div>
                            <p><strong className="text-gray-200">승인된 리디렉션 URI:</strong></p>
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono text-[11px] border border-green-500/20">{window.location.origin}</code>
                              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                            </div>
                          </div>
                          <p className="text-gray-500"><strong className="text-gray-300">"만들기"</strong>를 클릭하면 <strong className="text-gray-300">클라이언트 ID</strong>와 <strong className="text-gray-300">클라이언트 보안 비밀번호</strong>가 표시됩니다.</p>
                          <p className="text-gray-500">이 두 값을 아래에 붙여넣으세요!</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-700/30 pt-3">
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          * 처음에는 "테스트" 모드로 작동하며, OAuth 동의 화면에서 등록한 테스트 사용자만 사용할 수 있습니다.
                          모든 사용자에게 공개하려면 Google에 앱 인증 요청을 제출해야 합니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* OAuth 클라이언트 ID/Secret 입력 */}
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-300">OAuth 클라이언트 설정</h4>
                    {!ytEditingClient && youtubeAuth.clientId && (
                      <button type="button" onClick={() => setYtEditingClient(true)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        편집
                      </button>
                    )}
                  </div>

                  {ytEditingClient || !youtubeAuth.clientId ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">클라이언트 ID</label>
                        <input type="text" value={ytClientId} onChange={(e) => setYtClientId(e.target.value)} placeholder="예: 305074636xxx-xxxxxxxx.apps.googleusercontent.com"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">클라이언트 보안 비밀번호 (시크릿)</label>
                        <input type="password" value={ytClientSecret} onChange={(e) => setYtClientSecret(e.target.value)} placeholder="예: GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 font-mono" />
                      </div>
                      <button type="button" onClick={handleSaveYtClient} disabled={!ytClientId.trim() || !ytClientSecret.trim()}
                        className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${ytClientId.trim() && ytClientSecret.trim() ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                        저장
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-400">클라이언트 ID: <span className="font-mono text-gray-300">{youtubeAuth.clientId.slice(0, 16)}***</span></p>
                      <p className="text-sm text-gray-400">클라이언트 시크릿: <span className="text-gray-300">설정됨 ****</span></p>
                    </div>
                  )}
                </div>

                {/* 연동 버튼 */}
                <button type="button" onClick={handleYtOAuthOpen}
                  disabled={!youtubeAuth.clientId || ytIsExchanging}
                  className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all ${youtubeAuth.clientId && !ytIsExchanging ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  {ytIsExchanging ? (
                    <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-gray-500 border-t-white rounded-full animate-spin" /> Google 계정 인증 중...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                      YouTube 연동하기
                    </span>
                  )}
                </button>

                {!youtubeAuth.clientId && (
                  <p className="text-xs text-gray-600 text-center">위 가이드를 따라 OAuth 클라이언트를 먼저 설정해주세요</p>
                )}

                {ytAuthError && (
                  <div className="text-xs bg-red-900/20 border border-red-500/30 rounded-lg overflow-hidden">
                    <div className="px-3 py-2.5 flex items-start gap-2">
                      <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                      <p className="text-red-400 font-medium">{ytAuthError}</p>
                    </div>
                    {ytAuthError.includes('invalid_client') && (
                      <div className="border-t border-red-500/20 px-3 py-3 space-y-3 bg-red-900/10">
                        <p className="font-bold text-red-300 text-sm">이 에러는 OAuth 클라이언트 설정이 잘못되었을 때 발생합니다</p>
                        <p className="text-gray-400">아래 순서대로 하나씩 확인해주세요:</p>

                        {/* 해결 1: 클라이언트 타입 확인 */}
                        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-2">
                          <p className="font-semibold text-gray-200">1. 클라이언트 타입이 "웹 애플리케이션"인지 확인</p>
                          <p className="text-gray-400">"데스크톱" 또는 "Android/iOS" 타입은 작동하지 않습니다.</p>
                          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors border border-blue-500/30 rounded-lg px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            사용자 인증 정보 페이지에서 확인하기
                          </a>
                          <p className="text-gray-500">OAuth 2.0 클라이언트 ID 목록에서 내 클라이언트를 클릭 → 상단에 "유형"이 <strong className="text-green-400">"웹 애플리케이션"</strong>으로 되어있어야 합니다.</p>
                          <p className="text-gray-500">만약 "데스크톱"으로 되어있다면, 새로 <strong className="text-green-400">"웹 애플리케이션"</strong> 타입으로 만들어주세요:</p>
                          <a href="https://console.cloud.google.com/apis/credentials/oauthclient" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-green-400 hover:text-green-300 transition-colors border border-green-500/30 rounded-lg px-3 py-1.5 bg-green-600/10 hover:bg-green-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            새 웹 애플리케이션 클라이언트 만들기
                          </a>
                        </div>

                        {/* 해결 2: 자바스크립트 원본 + 리디렉션 URI */}
                        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-2">
                          <p className="font-semibold text-gray-200">2. 승인된 URL이 올바르게 등록되어 있는지 확인</p>
                          <p className="text-gray-400">클라이언트 설정 페이지 하단에 두 항목 모두 추가되어야 합니다:</p>
                          <div className="bg-gray-800/80 rounded p-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-400">승인된 자바스크립트 원본:</span>
                              <div className="flex items-center gap-1.5">
                                <code className="text-green-400 font-mono text-[11px]">{window.location.origin}</code>
                                <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-400">승인된 리디렉션 URI:</span>
                              <div className="flex items-center gap-1.5">
                                <code className="text-green-400 font-mono text-[11px]">{window.location.origin}</code>
                                <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 해결 3: 시크릿 재확인 */}
                        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-3 space-y-2">
                          <p className="font-semibold text-gray-200">3. 클라이언트 ID와 시크릿 재확인</p>
                          <p className="text-gray-400">이전에 만든 "데스크톱" 클라이언트의 시크릿과 "웹 애플리케이션" 클라이언트의 시크릿은 서로 다릅니다. 새로 만든 웹 클라이언트의 값을 사용해야 합니다.</p>
                          <button type="button" onClick={() => { setYtEditingClient(true); setYtAuthError(''); }}
                            className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors border border-amber-500/30 rounded-lg px-3 py-1.5 bg-amber-600/10 hover:bg-amber-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            클라이언트 ID/시크릿 다시 입력하기
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-600 text-center">연결 정보는 브라우저에 자동 저장됩니다</p>
              </div>
            ) : platform.id === 'tiktok' ? (
              /* TikTok OAuth 인증 */
              <div className="space-y-4">
                <p className="text-sm text-gray-400">TikTok 영상 업로드 기능을 사용하려면 TikTok Developer 앱 연동이 필요합니다</p>

                {/* TikTok 상세 설정 가이드 (접이식) */}
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <button type="button" onClick={() => setTtShowGuide(!ttShowGuide)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      처음이신가요? TikTok Developer 설정 가이드
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${ttShowGuide ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  {ttShowGuide && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
                      {/* STEP 1 */}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600/30 border border-cyan-500/40 text-cyan-400 text-xs font-bold flex items-center justify-center">1</span>
                          <h5 className="text-sm font-bold text-gray-200">TikTok for Developers 가입</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p>아래 링크에서 TikTok Developer Portal에 접속하여 개발자 계정을 만듭니다.</p>
                          <a href="https://developers.tiktok.com/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-500/30 rounded-lg px-3 py-1.5 bg-cyan-600/10 hover:bg-cyan-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            TikTok for Developers
                          </a>
                          <p className="text-gray-500">우측 상단 <strong className="text-gray-300">"Log in"</strong> → TikTok 계정으로 로그인 후 개발자 등록을 완료합니다.</p>
                        </div>
                      </div>

                      {/* STEP 2 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600/30 border border-cyan-500/40 text-cyan-400 text-xs font-bold flex items-center justify-center">2</span>
                          <h5 className="text-sm font-bold text-gray-200">새 앱 만들기</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <a href="https://developers.tiktok.com/apps/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-500/30 rounded-lg px-3 py-1.5 bg-cyan-600/10 hover:bg-cyan-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            TikTok App 관리 페이지
                          </a>
                          <p className="text-gray-500"><strong className="text-gray-300">"Manage apps"</strong> → <strong className="text-gray-300">"Connect an app"</strong> 클릭</p>
                          <p className="text-gray-500">앱 이름을 자유롭게 입력 (예: "Video Upload") 후 생성합니다.</p>
                        </div>
                      </div>

                      {/* STEP 3 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600/30 border border-cyan-500/40 text-cyan-400 text-xs font-bold flex items-center justify-center">3</span>
                          <h5 className="text-sm font-bold text-gray-200">Content Posting API 권한 추가</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p className="text-gray-500">생성된 앱에서 <strong className="text-gray-300">"Add products"</strong> → <strong className="text-gray-300">"Content Posting API"</strong>를 추가합니다.</p>
                          <p className="text-gray-500">권한: <strong className="text-green-400">video.upload</strong>, <strong className="text-green-400">video.publish</strong>을 선택합니다.</p>
                          <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-amber-500/90 mt-1">
                            <strong>중요!</strong> "Sandbox" 모드에서는 본인 계정에만 업로드 가능합니다. 상용화하려면 TikTok 앱 심사를 통과해야 합니다.
                          </div>
                        </div>
                      </div>

                      {/* STEP 4 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-600/30 border border-cyan-500/40 text-cyan-400 text-xs font-bold flex items-center justify-center">4</span>
                          <h5 className="text-sm font-bold text-gray-200">Client Key / Secret 확인</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 border border-gray-700/50 mt-1">
                            <p>앱 상세 페이지에서 <strong className="text-gray-200">Client Key</strong>와 <strong className="text-gray-200">Client Secret</strong>을 확인할 수 있습니다.</p>
                            <p><strong className="text-gray-200">Redirect URI</strong>에 아래 주소를 추가하세요:</p>
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono text-[11px] border border-green-500/20">{window.location.origin}</code>
                              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                            </div>
                          </div>
                          <p className="text-gray-500">Client Key와 Secret을 아래에 붙여넣으세요!</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-700/30 pt-3">
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          * Sandbox 모드에서는 자신의 TikTok 계정에만 업로드할 수 있으며, 하루 업로드 횟수 제한이 있습니다.
                          공개 배포를 위해서는 TikTok 앱 심사(App Review)를 받아야 합니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-300">TikTok App 설정</h4>
                    {!ttEditingClient && tiktokAuth.clientKey && (
                      <button type="button" onClick={() => setTtEditingClient(true)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        편집
                      </button>
                    )}
                  </div>
                  {ttEditingClient || !tiktokAuth.clientKey ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">Client Key</label>
                        <input type="text" value={ttClientKey} onChange={(e) => setTtClientKey(e.target.value)} placeholder="TikTok App Client Key"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">Client Secret</label>
                        <input type="password" value={ttClientSecret} onChange={(e) => setTtClientSecret(e.target.value)} placeholder="TikTok App Client Secret"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono" />
                      </div>
                      <button type="button" onClick={handleSaveTtClient} disabled={!ttClientKey.trim() || !ttClientSecret.trim()}
                        className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${ttClientKey.trim() && ttClientSecret.trim() ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                        저장
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-400">Client Key: <span className="font-mono text-gray-300">{tiktokAuth.clientKey.slice(0, 12)}***</span></p>
                      <p className="text-sm text-gray-400">Client Secret: <span className="text-gray-300">설정됨 ****</span></p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={handleTtOAuthOpen}
                  disabled={!tiktokAuth.clientKey || ttIsExchanging}
                  className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all ${tiktokAuth.clientKey && !ttIsExchanging ? 'bg-gray-900 hover:bg-gray-800 border border-cyan-500/50 text-white shadow-lg' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  {ttIsExchanging ? (
                    <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-gray-500 border-t-cyan-400 rounded-full animate-spin" /> TikTok 인증 중...</span>
                  ) : 'TikTok 연동하기'}
                </button>
                {ttAuthError && <div className="text-xs bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400">{ttAuthError}</div>}
                <p className="text-xs text-gray-600 text-center">연결 정보는 브라우저에 자동 저장됩니다</p>
              </div>
            ) : platform.id === 'instagram' ? (
              /* Instagram OAuth 인증 */
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Instagram 릴스/피드 업로드를 사용하려면 Meta 앱 연동이 필요합니다. Professional 계정(비즈니스/크리에이터)이 필요합니다.</p>

                {/* Instagram 상세 설정 가이드 (접이식) */}
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <button type="button" onClick={() => setIgShowGuide(!igShowGuide)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-pink-400 hover:text-pink-300 transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      처음이신가요? Instagram API 설정 가이드
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${igShowGuide ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  {igShowGuide && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
                      {/* 사전 준비 */}
                      <div className="mt-4 bg-amber-600/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-500/90">
                        <strong>사전 준비:</strong> Instagram 계정을 <strong className="text-amber-300">Professional 계정</strong>(비즈니스 또는 크리에이터)으로 전환해야 합니다.
                        Instagram 앱 → 설정 → 계정 → 프로페셔널 계정으로 전환
                      </div>

                      {/* STEP 1 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-600/30 border border-pink-500/40 text-pink-400 text-xs font-bold flex items-center justify-center">1</span>
                          <h5 className="text-sm font-bold text-gray-200">Meta for Developers 가입</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p>Meta Developer Portal에 접속하여 개발자 계정을 만듭니다.</p>
                          <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300 transition-colors border border-pink-500/30 rounded-lg px-3 py-1.5 bg-pink-600/10 hover:bg-pink-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Meta for Developers
                          </a>
                          <p className="text-gray-500">Facebook 계정으로 로그인 → <strong className="text-gray-300">"시작하기"</strong>를 클릭하여 개발자 등록을 완료합니다.</p>
                        </div>
                      </div>

                      {/* STEP 2 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-600/30 border border-pink-500/40 text-pink-400 text-xs font-bold flex items-center justify-center">2</span>
                          <h5 className="text-sm font-bold text-gray-200">새 앱 만들기</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <a href="https://developers.facebook.com/apps/create/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300 transition-colors border border-pink-500/30 rounded-lg px-3 py-1.5 bg-pink-600/10 hover:bg-pink-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Meta App 만들기
                          </a>
                          <p className="text-gray-500">사용 사례: <strong className="text-gray-300">"기타"</strong> 선택 → 앱 유형: <strong className="text-gray-300">"비즈니스"</strong> 선택</p>
                          <p className="text-gray-500">앱 이름을 자유롭게 입력 (예: "Video Upload") 후 <strong className="text-gray-300">"앱 만들기"</strong> 클릭</p>
                        </div>
                      </div>

                      {/* STEP 3 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-600/30 border border-pink-500/40 text-pink-400 text-xs font-bold flex items-center justify-center">3</span>
                          <h5 className="text-sm font-bold text-gray-200">Instagram Graph API 제품 추가</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p className="text-gray-500">앱 대시보드에서 <strong className="text-gray-300">"제품 추가"</strong> → <strong className="text-gray-300">"Instagram Graph API"</strong>의 <strong className="text-gray-300">"설정"</strong>을 클릭합니다.</p>
                          <p className="text-gray-500">필요한 권한: <strong className="text-green-400">instagram_basic</strong>, <strong className="text-green-400">instagram_content_publish</strong>, <strong className="text-green-400">pages_read_engagement</strong></p>
                          <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-amber-500/90 mt-1">
                            <strong>중요!</strong> Instagram 계정이 Facebook 페이지와 연결되어 있어야 합니다. Instagram 앱 → 설정 → 계정 → 연결된 계정 → Facebook에서 연결하세요.
                          </div>
                        </div>
                      </div>

                      {/* STEP 4 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-600/30 border border-pink-500/40 text-pink-400 text-xs font-bold flex items-center justify-center">4</span>
                          <h5 className="text-sm font-bold text-gray-200">App ID / Secret 확인 및 설정</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 border border-gray-700/50 mt-1">
                            <p>앱 대시보드 → <strong className="text-gray-200">"설정"</strong> → <strong className="text-gray-200">"기본 설정"</strong>에서 App ID와 App Secret을 확인합니다.</p>
                            <p><strong className="text-gray-200">유효한 OAuth 리디렉션 URI</strong>에 아래 주소를 추가하세요:</p>
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono text-[11px] border border-green-500/20">{window.location.origin}</code>
                              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                            </div>
                          </div>
                          <p className="text-gray-500">App ID와 App Secret을 아래에 붙여넣으세요!</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-700/30 pt-3">
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          * 개발 모드에서는 본인 계정과 앱에 추가된 테스트 사용자만 사용할 수 있습니다.
                          공개 배포를 위해서는 Meta 앱 심사(App Review)를 통과해야 합니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-300">Meta App 설정</h4>
                    {!igEditingClient && instagramAuth.appId && (
                      <button type="button" onClick={() => setIgEditingClient(true)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        편집
                      </button>
                    )}
                  </div>
                  {igEditingClient || !instagramAuth.appId ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">App ID</label>
                        <input type="text" value={igAppId} onChange={(e) => setIgAppId(e.target.value)} placeholder="Meta App ID"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-pink-500/50 font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">App Secret</label>
                        <input type="password" value={igAppSecret} onChange={(e) => setIgAppSecret(e.target.value)} placeholder="Meta App Secret"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-pink-500/50 font-mono" />
                      </div>
                      <button type="button" onClick={handleSaveIgClient} disabled={!igAppId.trim() || !igAppSecret.trim()}
                        className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${igAppId.trim() && igAppSecret.trim() ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                        저장
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-400">App ID: <span className="font-mono text-gray-300">{instagramAuth.appId.slice(0, 12)}***</span></p>
                      <p className="text-sm text-gray-400">App Secret: <span className="text-gray-300">설정됨 ****</span></p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={handleIgOAuthOpen}
                  disabled={!instagramAuth.appId || igIsExchanging}
                  className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all ${instagramAuth.appId && !igIsExchanging ? 'bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white shadow-lg' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  {igIsExchanging ? (
                    <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-gray-500 border-t-pink-400 rounded-full animate-spin" /> Instagram 인증 중...</span>
                  ) : 'Instagram 연동하기'}
                </button>
                {igAuthError && <div className="text-xs bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400">{igAuthError}</div>}
                <p className="text-xs text-gray-600 text-center">연결 정보는 브라우저에 자동 저장됩니다</p>
              </div>
            ) : platform.id === 'threads' ? (
              /* Threads OAuth 인증 */
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Threads 게시물 업로드를 사용하려면 Meta 앱 연동이 필요합니다. Instagram과 동일한 Meta App을 사용할 수 있습니다.</p>

                {/* Threads 상세 설정 가이드 (접이식) */}
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <button type="button" onClick={() => setThShowGuide(!thShowGuide)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-300 hover:text-gray-200 transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      처음이신가요? Threads API 설정 가이드
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${thShowGuide ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  {thShowGuide && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
                      {/* 사전 안내 */}
                      <div className="mt-4 bg-blue-600/10 border border-blue-500/20 rounded-lg px-3 py-2 text-xs text-blue-400/90">
                        <strong>팁:</strong> Instagram 가이드에서 이미 Meta App을 만들었다면, 같은 앱에 Threads API를 추가하기만 하면 됩니다. STEP 3부터 진행하세요!
                      </div>

                      {/* STEP 1 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-600/30 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">1</span>
                          <h5 className="text-sm font-bold text-gray-200">Meta for Developers 가입</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p>아래 링크에서 Meta Developer Portal에 접속합니다.</p>
                          <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-gray-300 hover:text-gray-200 transition-colors border border-gray-500/30 rounded-lg px-3 py-1.5 bg-gray-600/10 hover:bg-gray-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Meta for Developers
                          </a>
                          <p className="text-gray-500">Facebook 계정으로 로그인 → 개발자 등록을 완료합니다.</p>
                        </div>
                      </div>

                      {/* STEP 2 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-600/30 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">2</span>
                          <h5 className="text-sm font-bold text-gray-200">새 앱 만들기 (또는 기존 앱 사용)</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <a href="https://developers.facebook.com/apps/create/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-gray-300 hover:text-gray-200 transition-colors border border-gray-500/30 rounded-lg px-3 py-1.5 bg-gray-600/10 hover:bg-gray-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Meta App 만들기
                          </a>
                          <p className="text-gray-500">사용 사례: <strong className="text-gray-300">"기타"</strong> → 앱 유형: <strong className="text-gray-300">"비즈니스"</strong> 선택 후 생성합니다.</p>
                          <p className="text-gray-500">Instagram용으로 이미 만든 앱이 있다면 그 앱을 그대로 사용할 수 있습니다.</p>
                        </div>
                      </div>

                      {/* STEP 3 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-600/30 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">3</span>
                          <h5 className="text-sm font-bold text-gray-200">Threads API 제품 추가</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p className="text-gray-500">앱 대시보드에서 <strong className="text-gray-300">"제품 추가"</strong> → <strong className="text-gray-300">"Threads API"</strong>의 <strong className="text-gray-300">"설정"</strong>을 클릭합니다.</p>
                          <p className="text-gray-500">필요한 권한: <strong className="text-green-400">threads_basic</strong>, <strong className="text-green-400">threads_content_publish</strong>, <strong className="text-green-400">threads_manage_replies</strong></p>
                          <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-amber-500/90 mt-1">
                            <strong>중요!</strong> Threads API를 사용하려면 Threads 프로필이 공개 상태여야 합니다. Threads 앱에서 프로필 → 설정 → 비공개 프로필 해제
                          </div>
                        </div>
                      </div>

                      {/* STEP 4 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-600/30 border border-gray-500/40 text-gray-300 text-xs font-bold flex items-center justify-center">4</span>
                          <h5 className="text-sm font-bold text-gray-200">App ID / Secret 확인 및 설정</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 border border-gray-700/50 mt-1">
                            <p>앱 대시보드 → <strong className="text-gray-200">"설정"</strong> → <strong className="text-gray-200">"기본 설정"</strong>에서 App ID와 App Secret을 확인합니다.</p>
                            <p><strong className="text-gray-200">Threads 설정</strong>의 <strong className="text-gray-200">"리디렉션 콜백 URL"</strong>에 아래 주소를 추가하세요:</p>
                            <div className="flex items-center gap-2">
                              <code className="bg-gray-900 px-2 py-1 rounded text-green-400 font-mono text-[11px] border border-green-500/20">{window.location.origin}</code>
                              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.origin); showToast('복사됨!', 1500); }}
                                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/50">복사</button>
                            </div>
                          </div>
                          <p className="text-gray-500">App ID와 App Secret을 아래에 붙여넣으세요!</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-700/30 pt-3">
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          * 개발 모드에서는 본인과 테스트 사용자만 사용할 수 있습니다.
                          Instagram과 같은 Meta App을 공유하면 별도 심사 없이 Threads API도 함께 사용할 수 있습니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-300">Threads App 설정</h4>
                    {!thEditingClient && threadsAuth.appId && (
                      <button type="button" onClick={() => setThEditingClient(true)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        편집
                      </button>
                    )}
                  </div>
                  {thEditingClient || !threadsAuth.appId ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">App ID</label>
                        <input type="text" value={thAppId} onChange={(e) => setThAppId(e.target.value)} placeholder="Meta App ID (Threads)"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500/50 font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500">App Secret</label>
                        <input type="password" value={thAppSecret} onChange={(e) => setThAppSecret(e.target.value)} placeholder="Meta App Secret"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500/50 font-mono" />
                      </div>
                      <button type="button" onClick={handleSaveThClient} disabled={!thAppId.trim() || !thAppSecret.trim()}
                        className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${thAppId.trim() && thAppSecret.trim() ? 'bg-gray-800 hover:bg-gray-700 border border-gray-500/50 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                        저장
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-400">App ID: <span className="font-mono text-gray-300">{threadsAuth.appId.slice(0, 12)}***</span></p>
                      <p className="text-sm text-gray-400">App Secret: <span className="text-gray-300">설정됨 ****</span></p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={handleThOAuthOpen}
                  disabled={!threadsAuth.appId || thIsExchanging}
                  className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all ${threadsAuth.appId && !thIsExchanging ? 'bg-gray-800 hover:bg-gray-700 border border-gray-500/50 text-white shadow-lg' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                  {thIsExchanging ? (
                    <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" /> Threads 인증 중...</span>
                  ) : 'Threads 연동하기'}
                </button>
                {thAuthError && <div className="text-xs bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400">{thAuthError}</div>}
                <p className="text-xs text-gray-600 text-center">연결 정보는 브라우저에 자동 저장됩니다</p>
              </div>
            ) : platform.id === 'naver-clip' ? (
              /* Naver Clip — 수동 업로드 안내 */
              <div className="space-y-4">
                <div className="bg-amber-600/10 border border-amber-500/20 rounded-lg p-4">
                  <p className="text-sm text-amber-400 font-bold mb-2">Naver Clip은 공식 API가 제공되지 않습니다</p>
                  <p className="text-xs text-gray-400">자동 업로드 대신 파일 다운로드 후 Naver Clip Creator Studio에서 수동 업로드하는 방식을 안내합니다.</p>
                </div>

                {/* Naver Clip 수동 업로드 가이드 (접이식) */}
                <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <button type="button" onClick={() => setNcShowGuide(!ncShowGuide)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-green-400 hover:text-green-300 transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                      처음이신가요? Naver Clip 업로드 가이드
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${ncShowGuide ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  {ncShowGuide && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-700/50">
                      {/* STEP 1 */}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600/30 border border-green-500/40 text-green-400 text-xs font-bold flex items-center justify-center">1</span>
                          <h5 className="text-sm font-bold text-gray-200">Naver Clip Creator Studio 접속</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p>네이버 계정으로 로그인한 상태에서 아래 링크로 접속합니다.</p>
                          <a href="https://clip.studio.naver.com/" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-green-400 hover:text-green-300 transition-colors border border-green-500/30 rounded-lg px-3 py-1.5 bg-green-600/10 hover:bg-green-600/20">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            Naver Clip Creator Studio
                          </a>
                          <p className="text-gray-500">처음 이용 시 네이버 클립 크리에이터 가입이 필요할 수 있습니다.</p>
                        </div>
                      </div>

                      {/* STEP 2 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600/30 border border-green-500/40 text-green-400 text-xs font-bold flex items-center justify-center">2</span>
                          <h5 className="text-sm font-bold text-gray-200">영상 파일 다운로드</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p className="text-gray-500">이 앱의 <strong className="text-gray-300">"업로드"</strong> 단계에서 <strong className="text-gray-300">"영상 다운로드"</strong> 버튼을 눌러 MP4 파일을 저장합니다.</p>
                          <div className="bg-gray-800/80 rounded-lg p-3 space-y-1.5 border border-gray-700/50 mt-1">
                            <p><strong className="text-gray-200">권장 사양:</strong></p>
                            <p className="text-gray-500">• 해상도: 1080×1920 (세로) 또는 1920×1080 (가로)</p>
                            <p className="text-gray-500">• 파일 형식: MP4 (H.264)</p>
                            <p className="text-gray-500">• 최대 파일 크기: 4GB</p>
                            <p className="text-gray-500">• 최대 길이: 60초 (숏폼) / 20분 (일반)</p>
                          </div>
                        </div>
                      </div>

                      {/* STEP 3 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600/30 border border-green-500/40 text-green-400 text-xs font-bold flex items-center justify-center">3</span>
                          <h5 className="text-sm font-bold text-gray-200">Creator Studio에서 업로드</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <p className="text-gray-500">Clip Creator Studio에서 <strong className="text-gray-300">"클립 올리기"</strong> → 다운로드한 MP4 파일을 드래그 또는 선택합니다.</p>
                          <p className="text-gray-500">이 앱에서 생성한 제목, 설명, 태그를 복사하여 붙여넣으세요.</p>
                        </div>
                      </div>

                      {/* STEP 4 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600/30 border border-green-500/40 text-green-400 text-xs font-bold flex items-center justify-center">4</span>
                          <h5 className="text-sm font-bold text-gray-200">메타데이터 입력 후 게시</h5>
                        </div>
                        <div className="ml-8 space-y-1.5 text-xs text-gray-400">
                          <div className="bg-gray-800/80 rounded-lg p-3 space-y-1.5 border border-gray-700/50 mt-1">
                            <p><strong className="text-gray-200">제목:</strong> 메타데이터 탭에서 생성된 제목을 복사</p>
                            <p><strong className="text-gray-200">설명:</strong> 설명 영역에 붙여넣기</p>
                            <p><strong className="text-gray-200">태그:</strong> 해시태그를 # 포함하여 입력</p>
                            <p><strong className="text-gray-200">커버 이미지:</strong> 썸네일 탭에서 다운로드한 이미지 사용</p>
                          </div>
                          <p className="text-gray-500"><strong className="text-gray-300">"게시하기"</strong> 또는 <strong className="text-gray-300">"예약 게시"</strong>를 클릭하면 완료!</p>
                        </div>
                      </div>

                      <div className="border-t border-gray-700/30 pt-3">
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          * Naver Clip은 현재 공식 업로드 API를 제공하지 않아 수동 업로드만 가능합니다.
                          향후 API가 공개되면 자동 업로드를 지원할 예정입니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Naver 아이디 (메모용)</label>
                  <input type="text" value={ncInput} onChange={(e) => setNcInput(e.target.value)} placeholder="네이버 아이디"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500/50" />
                </div>
                <button type="button"
                  onClick={() => { setNaverClipAuth({ isConnected: true, username: ncInput.trim() || 'Naver User' }); showToast('Naver Clip 메모 저장 완료', 2000); }}
                  className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${btnStyle.connect}`}>
                  저장하기
                </button>
                <p className="text-xs text-gray-600 text-center">업로드 시 영상을 다운로드하여 수동 업로드 안내를 제공합니다</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const StepMetadata: React.FC = () => {
  const metadata = useUploadStore((s) => s.metadata);
  const setMetadata = useUploadStore((s) => s.setMetadata);
  const selectedPlatforms = useUploadStore((s) => s.selectedPlatforms);
  const isGenerating = useUploadStore((s) => s.isGeneratingMetadata);
  const elapsed = useElapsedTimer(isGenerating);
  const setIsGenerating = useUploadStore((s) => s.setIsGeneratingMetadata);
  const shoppingTags = useUploadStore((s) => s.shoppingTags);
  const setShoppingTags = useUploadStore((s) => s.setShoppingTags);
  const updateShoppingTag = useUploadStore((s) => s.updateShoppingTag);
  const removeShoppingTag = useUploadStore((s) => s.removeShoppingTag);
  const addShoppingTag = useUploadStore((s) => s.addShoppingTag);

  const finalScript = useScriptWriterStore((s) => s.finalScript);
  const scenes = useProjectStore((s) => s.scenes);

  // 채널분석 추천 태그
  const channelTags = useChannelAnalysisStore((s) => s.tags);
  const channelGuideline = useChannelAnalysisStore((s) => s.channelGuideline);
  const suggestedTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    // KeywordTag[]에서 태그 수집 (빈도순으로 이미 정렬 가정)
    channelTags.forEach(t => { if (t.tag.trim()) tagSet.add(t.tag.trim()); });
    // 가이드라인 키워드 추가
    channelGuideline?.keywords?.forEach(kw => { if (kw.trim()) tagSet.add(kw.trim()); });
    // 가이드라인 주제 추가
    channelGuideline?.topics?.forEach(tp => { if (tp.trim()) tagSet.add(tp.trim()); });
    return Array.from(tagSet).slice(0, 20);
  }, [channelTags, channelGuideline]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [customTitle, setCustomTitle] = useState('');
  const [description, setDescription] = useState(metadata?.description ?? '');
  const [publicHashtagsText, setPublicHashtagsText] = useState(metadata?.publicHashtags?.join(', ') ?? '');
  const [hiddenTagsText, setHiddenTagsText] = useState(metadata?.hiddenTags?.join(', ') ?? metadata?.tags?.join(', ') ?? '');
  const [isAiMode, setIsAiMode] = useState(true);
  const [isExtractingTags, setIsExtractingTags] = useState(false);
  const [newTagKeyword, setNewTagKeyword] = useState('');

  const defaultTitles = metadata?.titles ?? [
    '제목 옵션을 생성하려면 "AI 생성"을 클릭하세요',
  ];

  // 대본 텍스트 가져오기 (scriptWriter 우선, 없으면 scenes에서 조합)
  const getScriptText = useCallback(() => {
    if (finalScript && finalScript.trim().length > 0) return finalScript;
    if (scenes.length > 0) return scenes.map((s) => s.scriptText || '').filter(Boolean).join('\n');
    return '';
  }, [finalScript, scenes]);

  const getSceneSummaries = useCallback(() => {
    return scenes.map((s) => s.scriptText || s.visualDescriptionKO || '').filter(Boolean);
  }, [scenes]);

  // AI 메타데이터 + 쇼핑 태그 일괄 생성 (마스터 지침서 1-6단계)
  const handleAiGenerate = useCallback(async () => {
    const scriptText = getScriptText();
    if (!scriptText.trim()) {
      showToast('대본을 먼저 완성해주세요. 대본 작성 탭에서 대본을 생성하거나, 장면 분할 후 다시 시도하세요.');
      return;
    }

    setIsGenerating(true);
    try {
      const sceneSummaries = getSceneSummaries();
      // Steps 1-5 (메타데이터) + Step 6 (쇼핑 태그) 동시 실행
      const [result, shopTags] = await Promise.all([
        generateUploadMetadata(scriptText, sceneSummaries, { platforms: selectedPlatforms }),
        extractShoppingTags(scriptText, sceneSummaries),
      ]);
      setMetadata(result);
      setDescription(result.description);
      setPublicHashtagsText(result.publicHashtags?.join(', ') ?? '');
      setHiddenTagsText(result.hiddenTags?.join(', ') ?? result.tags.join(', '));
      setSelectedIdx(0);
      // 쇼핑 태그 자동 세팅
      if (shopTags.length > 0) {
        setShoppingTags(shopTags);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI 메타데이터 생성 실패');
    } finally {
      setIsGenerating(false);
    }
  }, [getScriptText, getSceneSummaries, selectedPlatforms, setIsGenerating, setMetadata, setShoppingTags]);

  // 쇼핑 태그 추출
  const handleExtractShoppingTags = useCallback(async () => {
    const scriptText = getScriptText();
    if (!scriptText.trim()) {
      showToast('대본이 없어 쇼핑 태그를 추출할 수 없습니다.');
      return;
    }
    setIsExtractingTags(true);
    try {
      const tags = await extractShoppingTags(scriptText, getSceneSummaries());
      setShoppingTags(tags);
    } catch {
      showToast('쇼핑 태그 추출 실패');
    } finally {
      setIsExtractingTags(false);
    }
  }, [getScriptText, getSceneSummaries, setShoppingTags]);

  const handleSelectTitle = (idx: number) => {
    setSelectedIdx(idx);
    if (metadata) {
      setMetadata({ ...metadata, selectedTitle: defaultTitles[idx] });
    }
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    if (metadata) {
      setMetadata({ ...metadata, description: val });
    }
  };

  const handlePublicHashtagsChange = (val: string) => {
    setPublicHashtagsText(val);
    if (metadata) {
      const parsed = val.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 5);
      setMetadata({ ...metadata, publicHashtags: parsed });
    }
  };

  const handleHiddenTagsChange = (val: string) => {
    setHiddenTagsText(val);
    if (metadata) {
      const parsed = val.split(',').map(t => t.trim()).filter(Boolean);
      setMetadata({ ...metadata, hiddenTags: parsed, tags: parsed });
    }
  };

  const SHOPPING_CATEGORIES = ['전자제품', '패션', '식품', '뷰티', '생활', '도서', '여행', '자동차', '건강', '교육', '소프트웨어', '기타'];

  return (
    <div className="space-y-5">
      {/* 모드 선택 카드 — 메타데이터 미생성 & 생성중 아닐 때 표시 */}
      {!metadata && !isGenerating && (
        <div className="grid grid-cols-2 gap-4">
          {/* 직접 입력 카드 */}
          <button
            type="button"
            onClick={() => setIsAiMode(false)}
            className={`relative p-5 rounded-xl border-2 transition-all text-left ${
              !isAiMode
                ? 'border-blue-500/50 bg-blue-500/10'
                : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white mb-3 shadow-md">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </div>
            <h4 className="text-base font-bold text-white mb-1">직접 입력</h4>
            <p className="text-sm text-gray-400">제목, 설명, 태그를 직접 작성합니다</p>
          </button>

          {/* AI 일괄 생성 카드 — 6개 항목 표시 */}
          <button
            type="button"
            onClick={() => { setIsAiMode(true); handleAiGenerate(); }}
            className="relative p-5 rounded-xl border-2 border-violet-500/50 bg-gradient-to-br from-violet-900/30 to-fuchsia-900/20 hover:from-violet-900/40 hover:to-fuchsia-900/30 transition-all text-left"
          >
            <span className="absolute top-3 right-3 text-[10px] font-bold bg-violet-500/30 text-violet-300 border border-violet-500/30 px-1.5 py-0.5 rounded">AI</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white mb-3 shadow-md">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"/></svg>
            </div>
            <h4 className="text-base font-bold text-white mb-2">Gemini로 한방에 생성</h4>
            <div className="flex flex-wrap gap-1">
              {['제목 5개', '설명', '해시태그', ...(selectedPlatforms.includes('youtube') ? ['비공개 태그'] : []), '쇼핑 태그'].map((item) => (
                <span key={item} className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/20 px-1.5 py-0.5 rounded">
                  {item}
                </span>
              ))}
            </div>
          </button>
        </div>
      )}

      {/* 메타데이터 생성 후 — 모드 전환 + 재생성 버튼 */}
      {metadata && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsAiMode(!isAiMode)}
            className="text-sm text-gray-400 hover:text-gray-200 bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-600 transition-colors"
          >
            {isAiMode ? '직접 입력' : 'AI 생성'}
          </button>
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={isGenerating}
            className="text-sm font-bold text-violet-400 hover:text-violet-300 bg-violet-900/20 px-3 py-1.5 rounded-lg border border-violet-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"/></svg>
            {isGenerating ? '생성 중...' : '전체 재생성'}
          </button>
        </div>
      )}

      {/* AI 생성 로딩 — 6단계 표시 */}
      {isGenerating && (
        <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-base text-violet-300 font-bold">
              AI가 대본을 분석 중...
              {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums ml-2">{formatElapsed(elapsed)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {['1. 정책 검사', '2. 제목 5개', '3. 설명', '4. 공개 해시태그', ...(selectedPlatforms.includes('youtube') ? ['5. 비공개 태그'] : []), '6. 쇼핑 태그'].map((step) => (
              <span key={step} className="text-[11px] bg-violet-500/15 text-violet-300/80 border border-violet-500/20 px-2 py-0.5 rounded">
                {step}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 대본 연동 상태 */}
      {!isGenerating && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
          getScriptText().trim()
            ? 'bg-green-900/10 border-green-500/20 text-green-400'
            : 'bg-yellow-900/10 border-yellow-500/20 text-yellow-400'
        }`}>
          <span>{getScriptText().trim() ? '\u2713' : '!'}</span>
          <span>
            {getScriptText().trim()
              ? `대본 연동됨 (${getScriptText().length}자, ${scenes.length}개 장면)`
              : '대본이 없습니다. 대본 작성 탭에서 먼저 대본을 완성하세요.'}
          </span>
        </div>
      )}

      {/* Platform tags */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">적용 플랫폼:</span>
        {selectedPlatforms.map(pid => {
          const p = PLATFORMS.find(x => x.id === pid);
          if (!p) return null;
          return (
            <span key={pid} className={`text-sm font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${p.bgGradient} text-white`}>
              {p.label}
            </span>
          );
        })}
      </div>

      {/* Title selection */}
      <div>
        <label className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2 flex-wrap">
          <span>제목 선택 <span className="text-red-400">*</span></span>
          <span className="text-[10px] text-gray-500 font-normal">
            {selectedPlatforms.includes('youtube') && 'YouTube 100자'}
            {selectedPlatforms.includes('tiktok') && (selectedPlatforms.includes('youtube') ? ' · ' : '') + 'TikTok 150자'}
            {selectedPlatforms.includes('threads') && ' · Threads 텍스트에 포함'}
          </span>
        </label>
        <div className="space-y-2">
          {defaultTitles.map((title, idx) => (
            <label
              key={`title-${idx}`}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                selectedIdx === idx
                  ? 'border-purple-500/50 bg-purple-500/10'
                  : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="title-option"
                checked={selectedIdx === idx}
                onChange={() => handleSelectTitle(idx)}
                className="accent-purple-500"
              />
              <span className="text-sm text-gray-200 flex-1">{title}</span>
              <span className="text-sm text-gray-500">{title.length}자</span>
            </label>
          ))}
        </div>
      </div>

      {/* Custom title */}
      <div>
        <label className="text-sm text-gray-400 mb-1.5 block">또는 직접 입력:</label>
        <input
          type="text"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder="제목을 직접 입력하세요..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-semibold text-gray-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-2 flex-wrap">
            설명
            {selectedPlatforms.includes('youtube') && <span className="text-[10px] bg-red-600/15 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">YouTube 5000자</span>}
            {selectedPlatforms.includes('instagram') && <span className="text-[10px] bg-pink-600/15 text-pink-400 px-1.5 py-0.5 rounded border border-pink-500/20">Instagram 캡션에 포함</span>}
            {selectedPlatforms.includes('tiktok') && <span className="text-[10px] bg-cyan-600/15 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20">TikTok 미사용</span>}
          </span>
          {description && (
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(description); showToast('설명이 클립보드에 복사되었습니다'); }}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-700/50"
              title="설명 복사"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          )}
        </label>
        <textarea
          rows={5}
          value={description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="AI가 생성한 설명이 표시됩니다..."
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 resize-none"
        />
      </div>

      {/* Policy Check Result */}
      {metadata?.policyCheck && (
        <div className={`rounded-lg border px-4 py-3 ${
          metadata.policyCheck.safetyLevel === 'safe'
            ? 'bg-green-900/10 border-green-500/20'
            : metadata.policyCheck.safetyLevel === 'warning'
            ? 'bg-yellow-900/10 border-yellow-500/20'
            : 'bg-red-900/10 border-red-500/20'
        }`}>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-base font-bold">
              {metadata.policyCheck.safetyLevel === 'safe' ? '\uD83D\uDEE1\uFE0F 채널 안전' :
               metadata.policyCheck.safetyLevel === 'warning' ? '\u26A0\uFE0F 주의 필요' : '\uD83D\uDEA8 위험'}
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${
              metadata.policyCheck.monetizationLevel === 'suitable'
                ? 'bg-green-500/20 text-green-400 border-green-500/30'
                : metadata.policyCheck.monetizationLevel === 'limited'
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>
              {metadata.policyCheck.monetizationLevel === 'suitable' ? '광고 적합' :
               metadata.policyCheck.monetizationLevel === 'limited' ? '광고 제한' : '광고 부적합'}
            </span>
          </div>
          {metadata.policyCheck.details && (
            <p className="text-sm text-gray-400 leading-relaxed">{metadata.policyCheck.details}</p>
          )}
        </div>
      )}

      {/* Public Hashtags */}
      <div>
        <label className="text-sm font-semibold text-gray-300 mb-1.5 flex items-center gap-2 flex-wrap">
          공개 해시태그
          {selectedPlatforms.includes('youtube') && <span className="text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-500/20">YouTube 설명 하단 5개</span>}
          {selectedPlatforms.includes('instagram') && <span className="text-[10px] text-pink-400 bg-pink-900/20 px-1.5 py-0.5 rounded border border-pink-500/20">Instagram 캡션 내 30개</span>}
          {selectedPlatforms.includes('threads') && <span className="text-[10px] text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded border border-gray-600/30">Threads 텍스트 내</span>}
          {selectedPlatforms.includes('tiktok') && <span className="text-[10px] text-cyan-400 bg-cyan-900/20 px-1.5 py-0.5 rounded border border-cyan-500/20">TikTok 미사용</span>}
          {metadata?.publicHashtags && metadata.publicHashtags.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const text = metadata.publicHashtags!.map(h => `#${h}`).join(' ');
                navigator.clipboard.writeText(text);
                showToast('공개 해시태그가 클립보드에 복사되었습니다');
              }}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-700/50 ml-auto"
              title="해시태그 복사"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          )}
        </label>
        {metadata?.publicHashtags && metadata.publicHashtags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {metadata.publicHashtags.map((h, i) => (
              <span key={`ph-${i}`} className="text-sm bg-cyan-900/20 text-cyan-300 px-2.5 py-1 rounded-lg border border-cyan-500/20 font-medium">
                #{h}
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          value={publicHashtagsText}
          onChange={(e) => handlePublicHashtagsChange(e.target.value)}
          placeholder={selectedPlatforms.includes('youtube') && !selectedPlatforms.some(p => p !== 'youtube')
            ? '키워드1, 키워드2, 키워드3, 키워드4, 키워드5 (YouTube 5개 권장)'
            : '키워드1, 키워드2, 키워드3, ... (쉼표로 구분)'}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
        />
        <p className="text-sm text-gray-600 mt-1">
          {selectedPlatforms.includes('youtube') && 'YouTube 설명 하단에 표시. '}
          {selectedPlatforms.includes('instagram') && 'Instagram 캡션에 #태그 형태로 포함. '}
          {selectedPlatforms.includes('threads') && 'Threads 텍스트에 #태그 형태로 포함.'}
          {selectedPlatforms.length === 0 && '공개 해시태그를 입력하세요.'}
        </p>
      </div>

      {/* Hidden Tags — YouTube 전용 (다른 플랫폼은 비공개 태그 미지원) */}
      {selectedPlatforms.includes('youtube') && <div>
        <label className="text-sm font-semibold text-gray-300 mb-1.5 flex items-center gap-2">
          비공개 태그
          <span className="text-[11px] text-orange-400 bg-orange-900/20 px-2 py-0.5 rounded border border-orange-500/20">YouTube 전용</span>
          {hiddenTagsText.trim() && (
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(hiddenTagsText); showToast('비공개 태그가 클립보드에 복사되었습니다'); }}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded hover:bg-gray-700/50 ml-auto"
              title="비공개 태그 복사"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          )}
        </label>
        <textarea
          rows={3}
          value={hiddenTagsText}
          onChange={(e) => handleHiddenTagsChange(e.target.value)}
          placeholder="한국어 태그1, 한국어 태그2, ... (영어 금지, 한도 끝까지 채우기)"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
        />
        <p className="text-sm text-gray-600 mt-1">
          YouTube Studio 태그 박스에 붙여넣을 비공개 태그. 한국어만, 용량 끝까지 채움.
          {metadata?.hiddenTags && <span className="text-orange-400 ml-1">{metadata.hiddenTags.length}개</span>}
        </p>
      </div>}

      {/* 채널분석 추천 태그 — YouTube 비공개 태그에 추가용 */}
      {selectedPlatforms.includes('youtube') && suggestedTags.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
            <span>&#x1F4CA;</span> 채널분석 추천 태그
            <span className="text-gray-600">&#183; 클릭하면 비공개 태그에 추가</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedTags.map(tag => {
              const alreadyAdded = hiddenTagsText.split(',').map(t => t.trim()).includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => {
                    const next = hiddenTagsText.trim()
                      ? `${hiddenTagsText.trim()}, ${tag}`
                      : tag;
                    handleHiddenTagsChange(next);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    alreadyAdded
                      ? 'bg-gray-700/50 text-gray-500 cursor-default line-through'
                      : 'bg-purple-900/30 text-purple-300 hover:bg-purple-800/40 border border-purple-500/20'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Thumbnail Suggestions */}
      {metadata?.thumbnailSuggestions && metadata.thumbnailSuggestions.length > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <label className="text-sm font-semibold text-gray-300 mb-2 block flex items-center gap-2">
            썸네일 추천 장면
            <span className="text-[11px] text-pink-400 bg-pink-900/20 px-2 py-0.5 rounded border border-pink-500/20">AI 분석</span>
          </label>
          <div className="space-y-2">
            {metadata.thumbnailSuggestions.map((s, i) => (
              <div key={`thumb-${i}`} className="flex items-start gap-2 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700/50">
                <span className="text-sm font-bold text-pink-400 mt-0.5">{i + 1}</span>
                <p className="text-sm text-gray-300 leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shopping Tags — YouTube 선택 시 전체 표시, 미선택 시 안내만 */}
      <div className="border-t border-gray-700 pt-4">
        {selectedPlatforms.includes('youtube') ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                쇼핑 태그
                <span className="text-[10px] bg-red-900/15 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">YouTube 설명에 삽입</span>
                {shoppingTags.length > 0 && (
                  <span className="text-[11px] bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                    {shoppingTags.length}개
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={handleExtractShoppingTags}
                disabled={isExtractingTags}
                className="text-sm text-blue-400 hover:text-blue-300 bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z"/></svg>
                {isExtractingTags ? '추출 중...' : shoppingTags.length > 0 ? '재추출' : 'AI 추출'}
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-3">
              {shoppingTags.length > 0
                ? '대본에서 추출된 제품/브랜드. 쿠팡 파트너스 링크를 입력하면 YouTube 설명에 자동 삽입됩니다.'
                : 'AI 전체 생성 시 자동 추출됩니다. 또는 우측 버튼으로 개별 추출할 수 있습니다.'}
            </p>

            {/* Shopping tag chips */}
            {shoppingTags.length > 0 && (
              <div className="space-y-2 mb-3">
                {shoppingTags.map((tag, idx) => (
                  <div key={`shop-${idx}`} className="flex items-center gap-2 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700/50">
                    <span className="text-sm text-white font-bold flex-shrink-0">{tag.keyword}</span>
                    <span className="text-xs bg-blue-600/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 flex-shrink-0">
                      {tag.category}
                    </span>
                    <input
                      type="text"
                      value={tag.link || ''}
                      onChange={(e) => updateShoppingTag(idx, { link: e.target.value })}
                      placeholder="쿠팡 파트너스 링크..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => removeShoppingTag(idx)}
                      className="text-gray-500 hover:text-red-400 text-sm"
                    >{'\u2715'}</button>
                  </div>
                ))}
              </div>
            )}

            {/* Manual add */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTagKeyword}
                onChange={(e) => setNewTagKeyword(e.target.value)}
                placeholder="수동 추가: 제품/브랜드명"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTagKeyword.trim()) {
                    addShoppingTag({ keyword: newTagKeyword.trim(), category: '기타' });
                    setNewTagKeyword('');
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newTagKeyword.trim()) {
                    addShoppingTag({ keyword: newTagKeyword.trim(), category: '기타' });
                    setNewTagKeyword('');
                  }
                }}
                className="text-sm text-blue-400 hover:text-blue-300 bg-gray-700 px-3 py-2 rounded-lg border border-gray-600 transition-colors"
              >
                추가
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">쿠팡 파트너스 API와 연동하여 쿠팡 링크를 쉽게 생성하는 기능을 준비 중입니다.</p>
        )}
      </div>

      {/* 플랫폼별 미리보기 */}
      {metadata && (
        <div className="border-t border-gray-700 pt-4 mt-2">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">플랫폼별 업로드 미리보기</h4>
          <div className="space-y-3">
            {selectedPlatforms.includes('youtube') && (
              <div className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-red-400">YouTube</span>
                </div>
                <p className="text-xs text-gray-400"><span className="text-gray-500">제목:</span> {(metadata.selectedTitle || metadata.titles?.[0] || '').slice(0, 100)}</p>
                <p className="text-xs text-gray-400"><span className="text-gray-500">설명:</span> {(description || '').slice(0, 80)}...</p>
                <p className="text-xs text-gray-400"><span className="text-gray-500">공개 해시태그:</span> {(metadata.publicHashtags || []).map(h => `#${h}`).join(' ') || '없음'}</p>
                <p className="text-xs text-gray-400"><span className="text-gray-500">비공개 태그:</span> {(metadata.hiddenTags || []).slice(0, 8).join(', ')}{(metadata.hiddenTags?.length || 0) > 8 ? `... (총 ${metadata.hiddenTags!.length}개)` : ''}</p>
                {shoppingTags.filter(t => t.link).length > 0 && (
                  <p className="text-xs text-blue-400"><span className="text-gray-500">쇼핑 링크:</span> {shoppingTags.filter(t => t.link).map(t => t.keyword).join(', ')}</p>
                )}
              </div>
            )}
            {selectedPlatforms.includes('tiktok') && (
              <div className="bg-cyan-900/10 border border-cyan-500/20 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-cyan-400">TikTok</span>
                  <span className="text-[10px] text-gray-500">제목만 전송 (150자), 설명/태그 미사용</span>
                </div>
                <p className="text-xs text-gray-400"><span className="text-gray-500">제목:</span> {(metadata.selectedTitle || metadata.titles?.[0] || '').slice(0, 150)}</p>
              </div>
            )}
            {selectedPlatforms.includes('instagram') && (() => {
              const caption = `${metadata.selectedTitle || metadata.titles?.[0] || ''}\n\n${description || ''}\n\n${(metadata.publicHashtags || []).map(t => `#${t.replace(/^#/, '')}`).join(' ')}`;
              return (
                <div className="bg-pink-900/10 border border-pink-500/20 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-pink-400">Instagram</span>
                    <span className="text-[10px] text-gray-500">캡션 1개로 통합 (2200자)</span>
                    <span className={`text-[10px] font-mono ${caption.length > 2200 ? 'text-red-400' : 'text-gray-500'}`}>{caption.length}자</span>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-3">{caption.slice(0, 200)}{caption.length > 200 ? '...' : ''}</p>
                </div>
              );
            })()}
            {selectedPlatforms.includes('threads') && (() => {
              const text = `${metadata.selectedTitle || metadata.titles?.[0] || ''}\n\n${(metadata.publicHashtags || []).map(t => `#${t.replace(/^#/, '')}`).join(' ')}`;
              return (
                <div className="bg-gray-800/60 border border-gray-600/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-gray-300">Threads</span>
                    <span className="text-[10px] text-gray-500">텍스트 1개 (500자), 설명 미포함</span>
                    <span className={`text-[10px] font-mono ${text.length > 500 ? 'text-red-400' : 'text-gray-500'}`}>{text.length}자</span>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-3">{text.slice(0, 200)}{text.length > 200 ? '...' : ''}</p>
                </div>
              );
            })()}
            {selectedPlatforms.includes('naver-clip') && (
              <div className="bg-green-900/10 border border-green-500/20 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-green-400">Naver Clip</span>
                  <span className="text-[10px] text-gray-500">수동 업로드 — Creator Studio에서 아래 내용 복사 붙여넣기</span>
                </div>
                <p className="text-xs text-gray-400"><span className="text-gray-500">제목:</span> {metadata.selectedTitle || metadata.titles?.[0] || ''}</p>
                <p className="text-xs text-gray-400"><span className="text-gray-500">설명:</span> {(description || '').slice(0, 80)}...</p>
                <p className="text-xs text-gray-400"><span className="text-gray-500">태그:</span> {(metadata.publicHashtags || []).map(t => `#${t}`).join(' ')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StepThumbnail: React.FC = () => {
  const thumbnailUrl = useUploadStore((s) => s.thumbnailUrl);
  const setThumbnail = useUploadStore((s) => s.setThumbnail);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showStudio, setShowStudio] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setThumbnail(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl font-bold text-white mb-2">썸네일</h3>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <span className="text-[10px] bg-red-900/15 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">YouTube: 1280x720 썸네일 업로드</span>
        <span className="text-[10px] bg-pink-900/15 text-pink-400 px-1.5 py-0.5 rounded border border-pink-500/20">Instagram: Reels 커버 (API 미지원, 자동 선택)</span>
        <span className="text-[10px] bg-cyan-900/15 text-cyan-400/70 px-1.5 py-0.5 rounded border border-cyan-500/20">TikTok: 영상 첫 프레임 자동</span>
        <span className="text-[10px] bg-gray-700/50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-600/30">Threads: 커버 미지원</span>
        <span className="text-[10px] bg-green-900/15 text-green-400/70 px-1.5 py-0.5 rounded border border-green-500/20">Naver Clip: Creator Studio에서 직접 설정</span>
      </div>

      {/* 썸네일 선택 영역 */}
      <div
        className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500/50 transition-colors"
        onClick={() => !thumbnailUrl && fileInputRef.current?.click()}
      >
        {thumbnailUrl ? (
          <div className="relative inline-block">
            <img src={thumbnailUrl} alt="Thumbnail" className="max-h-48 mx-auto rounded-lg" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setThumbnail(null); }}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-md text-sm"
            >{'\u2715'}</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-gray-700 rounded-xl flex items-center justify-center text-2xl text-gray-500">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <p className="text-gray-400 text-base">클릭하여 썸네일을 업로드하거나</p>
            <p className="text-gray-500 text-sm">아래 버튼으로 AI 썸네일을 생성하세요</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* 썸네일 스튜디오 토글 */}
      <button
        type="button"
        onClick={() => setShowStudio(!showStudio)}
        className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-base font-bold border border-blue-400/50 shadow-md transition-colors"
      >
        {showStudio ? '썸네일 스튜디오 닫기' : '썸네일 스튜디오에서 AI 생성 (레퍼런스 카피)'}
      </button>

      {/* 인라인 썸네일 스튜디오 (레퍼런스 카피 포함) */}
      {showStudio && (
        <InlineThumbnailStudio onClose={() => setShowStudio(false)} />
      )}
    </div>
  );
};

const StepSettings: React.FC = () => {
  const settings = useUploadStore((s) => s.uploadSettings);
  const setUploadSettings = useUploadStore((s) => s.setUploadSettings);
  const selectedPlatforms = useUploadStore((s) => s.selectedPlatforms);

  const hasYt = selectedPlatforms.includes('youtube');
  const hasTt = selectedPlatforms.includes('tiktok');
  const hasIg = selectedPlatforms.includes('instagram');
  const hasTh = selectedPlatforms.includes('threads');

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-5">
        <h3 className="text-xl font-bold text-white mb-1">업로드 설정</h3>
        <p className="text-sm text-gray-400 mb-3">각 플랫폼별 공개 범위와 옵션을 설정합니다.</p>

        {/* YouTube Privacy */}
        {hasYt && (
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <span className="text-red-400">YouTube</span> 공개 범위
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'public' as const, label: '공개', icon: '\uD83C\uDF10' },
                { id: 'unlisted' as const, label: '미등록', icon: '\uD83D\uDD17' },
                { id: 'private' as const, label: '비공개', icon: '\uD83D\uDD12' },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUploadSettings({ privacy: opt.id })}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-all ${
                    settings.privacy === opt.id
                      ? 'border-red-500/50 bg-red-500/10 text-red-300'
                      : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="mr-1.5">{opt.icon}</span>{opt.label}
                </button>
              ))}
            </div>
            <ToggleRow
              label="아동용 콘텐츠"
              checked={settings.madeForKids}
              onChange={(v) => setUploadSettings({ madeForKids: v })}
            />
            <ToggleRow
              label="구독자 알림"
              checked={settings.notifySubscribers}
              onChange={(v) => setUploadSettings({ notifySubscribers: v })}
            />
          </div>
        )}

        {/* TikTok Privacy + Options */}
        {hasTt && (
          <div className="space-y-3">
            {hasYt && <div className="border-t border-gray-700 pt-4" />}
            <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <span className="text-cyan-400">TikTok</span> 공개 범위
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'PUBLIC_TO_EVERYONE' as const, label: '\uD83C\uDF10 전체 공개' },
                { id: 'MUTUAL_FOLLOW_FRIENDS' as const, label: '\uD83E\uDD1D 맞팔 친구' },
                { id: 'FOLLOWER_OF_CREATOR' as const, label: '\uD83D\uDC65 팔로워만' },
                { id: 'SELF_ONLY' as const, label: '\uD83D\uDD12 나만 보기' },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUploadSettings({ tiktokPrivacy: opt.id })}
                  className={`py-2.5 px-3 rounded-lg text-sm font-medium border transition-all text-left ${
                    settings.tiktokPrivacy === opt.id
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                      : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <ToggleRow
              label="듀엣 허용"
              checked={!settings.tiktokDisableDuet}
              onChange={(v) => setUploadSettings({ tiktokDisableDuet: !v })}
            />
            <ToggleRow
              label="스티치 허용"
              checked={!settings.tiktokDisableStitch}
              onChange={(v) => setUploadSettings({ tiktokDisableStitch: !v })}
            />
            <ToggleRow
              label="댓글 허용"
              checked={!settings.tiktokDisableComment}
              onChange={(v) => setUploadSettings({ tiktokDisableComment: !v })}
            />
          </div>
        )}

        {/* Instagram / Threads — 공개 설정 없음 안내 */}
        {(hasIg || hasTh) && (
          <div className="space-y-2">
            {(hasYt || hasTt) && <div className="border-t border-gray-700 pt-4" />}
            {hasIg && (
              <div className="flex items-center gap-2 text-sm text-gray-400 bg-pink-900/10 border border-pink-500/15 rounded-lg px-3 py-2">
                <span className="text-pink-400 font-semibold">Instagram</span>
                <span>— Reels는 항상 공개로 게시됩니다</span>
              </div>
            )}
            {hasTh && (
              <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/60 border border-gray-600/30 rounded-lg px-3 py-2">
                <span className="text-gray-300 font-semibold">Threads</span>
                <span>— 게시물은 항상 공개로 게시됩니다</span>
              </div>
            )}
          </div>
        )}

        {/* Schedule — 전체 공통 */}
        <div className="border-t border-gray-700 pt-4">
          <label className="text-sm font-semibold text-gray-300 mb-1.5 block">예약 업로드</label>
          <input
            type="datetime-local"
            value={settings.scheduledAt ?? ''}
            onChange={(e) => setUploadSettings({ scheduledAt: e.target.value || undefined })}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500/50"
          />
          <p className="text-xs text-gray-600 mt-1">
            {hasYt && 'YouTube 예약 게시 지원. '}
            {hasTt && 'TikTok은 예약 업로드를 지원하지 않아 즉시 게시됩니다. '}
            {(hasIg || hasTh) && 'Instagram/Threads는 API 예약을 지원하지 않습니다.'}
          </p>
        </div>
      </div>

    </div>
  );
};

const ToggleRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-sm text-gray-300">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-purple-500' : 'bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  </div>
);

const StepUpload: React.FC = () => {
  const isUploading = useUploadStore((s) => s.isUploading);
  const platformProgress = useUploadStore((s) => s.platformProgress);
  const selectedPlatforms = useUploadStore((s) => s.selectedPlatforms);

  const allDone = platformProgress.length > 0 && platformProgress.every(p => p.status === 'done');

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl font-bold text-white mb-4">업로드 진행</h3>
      {isUploading || platformProgress.length > 0 ? (
        <div className="space-y-4">
          {platformProgress.map(pp => {
            const platform = PLATFORMS.find(p => p.id === pp.platform);
            if (!platform) return null;
            return (
              <div key={pp.platform} className="bg-gray-900/50 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 bg-gradient-to-br ${platform.bgGradient} rounded-lg flex items-center justify-center text-white`}>
                    {platform.icon}
                  </div>
                  <span className="text-base font-bold text-white flex-1">{platform.label}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                    pp.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    pp.status === 'error' ? 'bg-red-500/20 text-red-400' :
                    pp.status === 'uploading' ? 'bg-blue-500/20 text-blue-400' :
                    pp.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {pp.status === 'done' ? '완료' :
                     pp.status === 'error' ? '실패' :
                     pp.status === 'uploading' ? '업로드 중' :
                     pp.status === 'processing' ? '처리 중' : '대기'}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      pp.status === 'done' ? 'bg-green-500' :
                      pp.status === 'error' ? 'bg-red-500' :
                      `bg-gradient-to-r ${platform.bgGradient}`
                    }`}
                    style={{ width: `${pp.progress}%` }}
                  />
                </div>
                {pp.status === 'error' && pp.error && (
                  <p className="text-sm text-red-400 mt-2">{pp.error}</p>
                )}
                {pp.status === 'done' && pp.resultUrl && (
                  <a href={pp.resultUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 mt-2 block">
                    영상 보기 →
                  </a>
                )}
              </div>
            );
          })}
          {allDone && (
            <div className="flex flex-col items-center gap-3 pt-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
              </div>
              <p className="text-green-400 font-semibold">모든 플랫폼 업로드 완료!</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="flex justify-center gap-3 mb-4">
            {selectedPlatforms.map(pid => {
              const p = PLATFORMS.find(x => x.id === pid);
              if (!p) return null;
              return (
                <div key={pid} className={`w-12 h-12 bg-gradient-to-br ${p.bgGradient} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                  {p.icon}
                </div>
              );
            })}
          </div>
          <p className="text-gray-400 text-base">
            {selectedPlatforms.length}개 플랫폼에 동시 업로드합니다.<br/>
            상단의 <strong className="text-white">"일괄 업로드"</strong> 버튼을 클릭하세요.
          </p>
        </div>
      )}
    </div>
  );
};

// --- Main Component ---

const UploadTab: React.FC = () => {
  const selectedPlatforms = useUploadStore((s) => s.selectedPlatforms);
  const togglePlatform = useUploadStore((s) => s.togglePlatform);
  const startUpload = useUploadStore((s) => s.startUpload);
  const isUploading = useUploadStore((s) => s.isUploading);
  const videoFile = useUploadStore((s) => s.videoFile);
  const youtubeAuth = useUploadStore((s) => s.youtubeAuth);
  const tiktokAuth = useUploadStore((s) => s.tiktokAuth);
  const instagramAuth = useUploadStore((s) => s.instagramAuth);
  const threadsAuth = useUploadStore((s) => s.threadsAuth);
  const naverClipAuth = useUploadStore((s) => s.naverClipAuth);
  const metadata = useUploadStore((s) => s.metadata);
  const thumbnailUrl = useUploadStore((s) => s.thumbnailUrl);
  const platformProgress = useUploadStore((s) => s.platformProgress);

  // Section refs for scroll-to
  const sectionRefs = useRef<Record<UploadStep, HTMLDivElement | null>>({
    auth: null, video: null, metadata: null, thumbnail: null, settings: null, upload: null,
  });

  const scrollToSection = (stepId: UploadStep) => {
    sectionRefs.current[stepId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 연결 카운트
  const connectedCount = [
    selectedPlatforms.includes('youtube') && youtubeAuth.isConnected,
    selectedPlatforms.includes('tiktok') && tiktokAuth.isConnected,
    selectedPlatforms.includes('instagram') && instagramAuth.isConnected,
    selectedPlatforms.includes('threads') && threadsAuth.isConnected,
    selectedPlatforms.includes('naver-clip') && naverClipAuth.isConnected,
  ].filter(Boolean).length;

  // 플랫폼 accent
  const accent = selectedPlatforms.length > 0
    ? PLATFORM_ACCENT[selectedPlatforms[0]]
    : DEFAULT_ACCENT;

  // 스텝 완료 상태 판단
  const getStepStatus = (stepId: UploadStep): StepStatus => {
    switch (stepId) {
      case 'auth':
        return connectedCount > 0 ? 'done' : 'pending';
      case 'video':
        return videoFile ? 'done' : 'pending';
      case 'metadata':
        return metadata && (metadata.titles?.length ?? 0) > 0 ? 'done' : 'pending';
      case 'thumbnail':
        return thumbnailUrl ? 'done' : 'pending';
      case 'settings':
        return 'done'; // 기본값 존재
      case 'upload':
        return platformProgress.length > 0 && platformProgress.every(p => p.status === 'done')
          ? 'done' : 'pending';
      default:
        return 'pending';
    }
  };

  // 첫 번째 미완료 스텝을 active로 표시
  const getDisplayStatus = (stepId: UploadStep): StepStatus => {
    const raw = getStepStatus(stepId);
    if (raw === 'done') return 'done';
    // 첫 번째 pending 스텝이면 active
    const firstPending = STEPS.find(s => getStepStatus(s.id) !== 'done');
    if (firstPending?.id === stepId) return 'active';
    return 'pending';
  };

  const handleStartUpload = useCallback(async () => {
    startUpload();
    scrollToSection('upload');

    const store = useUploadStore.getState();
    const file = store.videoFile;
    if (!file) return;
    const meta = store.metadata;
    const settings = store.uploadSettings;
    const setPP = useUploadStore.getState().setPlatformProgress;

    // Instagram/Threads에 필요한 공개 URL (Cloudinary 업로드)
    let publicVideoUrl: string | null = null;
    const needsPublicUrl = selectedPlatforms.some(p =>
      (p === 'instagram' && instagramAuth.isConnected) ||
      (p === 'threads' && threadsAuth.isConnected)
    );

    if (needsPublicUrl) {
      try {
        const { uploadMediaToHosting } = await import('../../services/uploadService');
        publicVideoUrl = await uploadMediaToHosting(file);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '공개 URL 생성 실패';
        if (selectedPlatforms.includes('instagram')) setPP('instagram', { status: 'error', error: `Cloudinary 업로드 실패: ${msg}` });
        if (selectedPlatforms.includes('threads')) setPP('threads', { status: 'error', error: `Cloudinary 업로드 실패: ${msg}` });
      }
    }

    // 모든 플랫폼 병렬 업로드
    const uploads: Promise<void>[] = [];

    // YouTube
    if (selectedPlatforms.includes('youtube') && youtubeAuth.isConnected && youtubeAuth.accessToken) {
      uploads.push((async () => {
        try {
          const { uploadVideoToYouTube, refreshAccessToken } = await import('../../services/youtubeUploadService');
          let token = youtubeAuth.accessToken!;
          if (youtubeAuth.expiresAt && Date.now() > youtubeAuth.expiresAt - 60_000 && youtubeAuth.refreshToken && youtubeAuth.clientId && youtubeAuth.clientSecret) {
            try {
              const refreshed = await refreshAccessToken(youtubeAuth.refreshToken, youtubeAuth.clientId, youtubeAuth.clientSecret);
              token = refreshed.accessToken;
              useUploadStore.getState().setYoutubeAuth({ accessToken: token, expiresAt: Date.now() + refreshed.expiresIn * 1000 });
            } catch {
              setPP('youtube', { status: 'error', error: '토큰 갱신 실패. YouTube를 다시 연동해주세요.' });
              return;
            }
          }
          // 쇼핑 태그 링크를 설명에 추가
          const shopLinks = store.shoppingTags.filter(t => t.link).map(t => `${t.keyword}: ${t.link}`);
          const ytDesc = [
            meta?.description || '',
            ...(meta?.publicHashtags?.length ? ['\n' + meta.publicHashtags.map(h => `#${h}`).join(' ')] : []),
            ...(shopLinks.length ? ['\n\n--- 추천 제품 ---', ...shopLinks] : []),
          ].join('\n');
          const result = await uploadVideoToYouTube({
            accessToken: token,
            file,
            title: meta?.selectedTitle || meta?.titles?.[0] || 'Untitled Video',
            description: ytDesc,
            tags: [...(meta?.hiddenTags || meta?.tags || [])],
            privacy: settings.privacy as 'public' | 'unlisted' | 'private',
            madeForKids: settings.madeForKids,
            onProgress: (pct) => setPP('youtube', { progress: pct, status: 'uploading' }),
          });
          setPP('youtube', { progress: 100, status: 'done', resultUrl: result.videoUrl });
          showToast(`YouTube 업로드 완료!`, 4000);
        } catch (e: unknown) {
          setPP('youtube', { status: 'error', error: e instanceof Error ? e.message : String(e), progress: 0 });
        }
      })());
    }

    // TikTok
    if (selectedPlatforms.includes('tiktok') && tiktokAuth.isConnected && tiktokAuth.accessToken) {
      uploads.push((async () => {
        try {
          const { uploadVideoToTikTok, refreshTikTokAccessToken } = await import('../../services/tiktokUploadService');
          let token = tiktokAuth.accessToken!;
          if (tiktokAuth.expiresAt && Date.now() > tiktokAuth.expiresAt - 60_000 && tiktokAuth.refreshToken && tiktokAuth.clientKey && tiktokAuth.clientSecret) {
            try {
              const refreshed = await refreshTikTokAccessToken(tiktokAuth.refreshToken, tiktokAuth.clientKey, tiktokAuth.clientSecret);
              token = refreshed.accessToken;
              useUploadStore.getState().setTiktokAuth({ accessToken: token, refreshToken: refreshed.refreshToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 });
            } catch {
              setPP('tiktok', { status: 'error', error: '토큰 갱신 실패. TikTok을 다시 연동해주세요.' });
              return;
            }
          }
          const result = await uploadVideoToTikTok({
            accessToken: token,
            file,
            title: meta?.selectedTitle || meta?.titles?.[0] || 'Untitled Video',
            privacy: settings.tiktokPrivacy || 'SELF_ONLY',
            disableDuet: settings.tiktokDisableDuet,
            disableStitch: settings.tiktokDisableStitch,
            disableComment: settings.tiktokDisableComment,
            onProgress: (pct) => setPP('tiktok', { progress: pct, status: 'uploading' }),
          });
          setPP('tiktok', { progress: 100, status: 'done', resultUrl: `https://www.tiktok.com/@${tiktokAuth.username}` });
          showToast(`TikTok 업로드 완료! (${result.publishId})`, 4000);
        } catch (e: unknown) {
          setPP('tiktok', { status: 'error', error: e instanceof Error ? e.message : String(e), progress: 0 });
        }
      })());
    }

    // Instagram
    if (selectedPlatforms.includes('instagram') && instagramAuth.isConnected && instagramAuth.accessToken && instagramAuth.userId) {
      uploads.push((async () => {
        if (!publicVideoUrl) {
          setPP('instagram', { status: 'error', error: 'Cloudinary 공개 URL 생성 필요 (Cloudinary 설정 확인)' });
          return;
        }
        try {
          const { uploadVideoToInstagram } = await import('../../services/instagramUploadService');
          const caption = `${meta?.selectedTitle || meta?.titles?.[0] || ''}\n\n${meta?.description || ''}\n\n${(meta?.publicHashtags || []).map(t => `#${t.replace(/^#/, '')}`).join(' ')}`;
          const result = await uploadVideoToInstagram({
            accessToken: instagramAuth.accessToken!,
            userId: instagramAuth.userId!,
            videoUrl: publicVideoUrl,
            caption,
            onProgress: (pct) => setPP('instagram', { progress: pct, status: 'uploading' }),
          });
          setPP('instagram', { progress: 100, status: 'done', resultUrl: result.permalink || `https://www.instagram.com/${instagramAuth.username}` });
          showToast(`Instagram 업로드 완료!`, 4000);
        } catch (e: unknown) {
          setPP('instagram', { status: 'error', error: e instanceof Error ? e.message : String(e), progress: 0 });
        }
      })());
    }

    // Threads
    if (selectedPlatforms.includes('threads') && threadsAuth.isConnected && threadsAuth.accessToken && threadsAuth.userId) {
      uploads.push((async () => {
        if (!publicVideoUrl) {
          setPP('threads', { status: 'error', error: 'Cloudinary 공개 URL 생성 필요 (Cloudinary 설정 확인)' });
          return;
        }
        try {
          const { uploadVideoToThreads } = await import('../../services/threadsUploadService');
          const text = `${meta?.selectedTitle || meta?.titles?.[0] || ''}\n\n${(meta?.publicHashtags || []).map(t => `#${t.replace(/^#/, '')}`).join(' ')}`;
          const result = await uploadVideoToThreads({
            accessToken: threadsAuth.accessToken!,
            userId: threadsAuth.userId!,
            videoUrl: publicVideoUrl,
            text,
            onProgress: (pct) => setPP('threads', { progress: pct, status: 'uploading' }),
          });
          setPP('threads', { progress: 100, status: 'done', resultUrl: result.permalink || `https://threads.net/@${threadsAuth.username}` });
          showToast(`Threads 업로드 완료!`, 4000);
        } catch (e: unknown) {
          setPP('threads', { status: 'error', error: e instanceof Error ? e.message : String(e), progress: 0 });
        }
      })());
    }

    // Naver Clip — 수동 업로드 안내
    if (selectedPlatforms.includes('naver-clip') && naverClipAuth.isConnected) {
      setPP('naver-clip', { status: 'done', progress: 100, error: undefined, resultUrl: undefined });
      showToast('Naver Clip: 영상 파일을 다운로드하여 Naver Clip Creator Studio에서 업로드해주세요.', 8000);
    }

    await Promise.allSettled(uploads);
    useUploadStore.getState().finishUpload();
  }, [startUpload, scrollToSection, selectedPlatforms, youtubeAuth, tiktokAuth, instagramAuth, threadsAuth, naverClipAuth]);

  const isOptionalStep = (stepId: UploadStep) => stepId === 'thumbnail';

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-8">
        {/* 1. 헤더 + 일괄 업로드 버튼 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-gradient-to-br ${accent.iconGradient} rounded-lg flex items-center justify-center text-xl shadow-lg transition-colors`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">멀티 플랫폼 업로드</h1>
              <p className="text-gray-400 text-base">YouTube · TikTok · Instagram · Threads · Naver Clip</p>
            </div>
          </div>
        </div>

        {/* 2. 플랫폼 선택 */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">업로드 플랫폼 선택</span>
            <span className="text-sm text-gray-600">{selectedPlatforms.length}개 선택됨</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {PLATFORMS.map(platform => {
              const isSelected = selectedPlatforms.includes(platform.id);
              const auth = platform.id === 'youtube' ? youtubeAuth :
                           platform.id === 'tiktok' ? tiktokAuth :
                           platform.id === 'threads' ? threadsAuth :
                           platform.id === 'naver-clip' ? naverClipAuth : instagramAuth;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => togglePlatform(platform.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all text-center ${
                    isSelected
                      ? `${platform.selectedBorder} ${platform.selectedBg}`
                      : 'border-gray-700 bg-gray-900/50 hover:border-gray-600 opacity-60'
                  }`}
                >
                  <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? `${platform.checkBorder} ${platform.checkBg}` : 'border-gray-600'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                  <div className={`w-10 h-10 mx-auto bg-gradient-to-br ${platform.bgGradient} rounded-xl flex items-center justify-center text-white shadow-lg mb-2`}>
                    {platform.icon}
                  </div>
                  <div className="text-base font-bold text-white">{platform.label}</div>
                  {auth.isConnected ? (
                    <div className="text-sm text-green-400 mt-1 flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                      연결됨
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 mt-1">미연결</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. 파이프라인 (상태 기반) */}
        <div className="flex items-center mb-8 px-2">
          {STEPS.map((step, idx) => {
            const status = getDisplayStatus(step.id);
            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(step.id)}
                  className="flex flex-col items-center gap-1.5 group flex-shrink-0"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    status === 'done'
                      ? 'bg-green-500 text-white'
                      : status === 'active'
                      ? `bg-gradient-to-br ${accent.gradient} text-white ring-2 ${accent.ring}`
                      : 'bg-gray-700 text-gray-500'
                  }`}>
                    {status === 'done' ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    ) : (
                      step.icon
                    )}
                  </div>
                  <span className={`text-xs font-bold ${
                    status === 'done' ? 'text-green-400' : status === 'active' ? accent.text : 'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] text-gray-600">{step.sub}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded transition-colors ${
                    status === 'done' ? 'bg-green-500' : 'bg-gray-700'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 4. 모든 섹션 수직 나열 */}
        <SectionCard
          ref={(el) => { sectionRefs.current.auth = el; }}
          icon={STEPS[0].icon}
          iconGradient={accent.iconGradient}
          title="인증"
          subtitle="플랫폼 계정을 연결합니다"
          status={getDisplayStatus('auth')}
        >
          <StepAuth />
        </SectionCard>

        <SectionCard
          ref={(el) => { sectionRefs.current.video = el; }}
          icon={STEPS[1].icon}
          iconGradient={accent.iconGradient}
          title="영상"
          subtitle="업로드할 영상 파일을 선택합니다"
          status={getDisplayStatus('video')}
        >
          <StepVideo />
        </SectionCard>

        <SectionCard
          ref={(el) => { sectionRefs.current.metadata = el; }}
          icon={STEPS[2].icon}
          iconGradient={accent.iconGradient}
          title="메타데이터"
          subtitle="제목, 설명, 태그를 설정합니다"
          status={getDisplayStatus('metadata')}
        >
          <StepMetadata />
        </SectionCard>

        <SectionCard
          ref={(el) => { sectionRefs.current.thumbnail = el; }}
          icon={STEPS[3].icon}
          iconGradient={accent.iconGradient}
          title="썸네일"
          subtitle="커버 이미지를 설정합니다 (선택사항)"
          status={getDisplayStatus('thumbnail')}
          optional
        >
          <StepThumbnail />
        </SectionCard>

        <SectionCard
          ref={(el) => { sectionRefs.current.settings = el; }}
          icon={STEPS[4].icon}
          iconGradient={accent.iconGradient}
          title="설정"
          subtitle="공개 범위와 예약 시간을 설정합니다"
          status={getDisplayStatus('settings')}
        >
          <StepSettings />
        </SectionCard>

        <SectionCard
          ref={(el) => { sectionRefs.current.upload = el; }}
          icon={STEPS[5].icon}
          iconGradient={accent.iconGradient}
          title="업로드"
          subtitle="모든 준비 완료 후 업로드를 실행합니다"
          status={getDisplayStatus('upload')}
        >
          <StepUpload />
        </SectionCard>

        {/* 5. 하단 CTA */}
        <div className="sticky bottom-4 z-10">
          <button
            type="button"
            onClick={handleStartUpload}
            disabled={isUploading || selectedPlatforms.length === 0 || connectedCount === 0 || !videoFile}
            className={`w-full py-4 rounded-2xl text-base font-bold transition-all shadow-2xl flex items-center justify-center gap-3 ${
              isUploading || selectedPlatforms.length === 0 || connectedCount === 0 || !videoFile
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : `bg-gradient-to-r ${accent.btnGradient} hover:opacity-90 text-white transform hover:scale-[1.01]`
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            일괄 업로드 시작 ({connectedCount}/{selectedPlatforms.length} 플랫폼)
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadTab;

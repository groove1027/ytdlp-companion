import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ProjectData, ProjectSummary, PipelineSteps } from '../../types';
import { getAllProjectSummaries, deleteProject, canCreateNewProject, getProject } from '../../services/storageService';
import { showToast } from '../../stores/uiStore';
import { exportProjectById } from '../../services/exportService';
import { useNavigationStore } from '../../stores/navigationStore';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { useSyncStore } from '../../stores/syncStore';
import { useProjectStore } from '../../stores/projectStore';
import { performFullSync, deleteCloudProject, pauseSync, resumeSync, markDeletingIds } from '../../services/syncService';
import { getToken } from '../../services/authService';
import type { SyncStatus } from '../../types';

interface ProjectDashboardProps {
  onSelectProject: (project: ProjectData) => void;
  onNewProject: (title: string) => void;
  onImportProject?: (file: File) => void;
  refreshTrigger: number;
}

type SortMode = 'date' | 'name' | 'progress';
type ViewMode = 'grid' | 'list';
type CardSize = 'sm' | 'md' | 'lg';

const PROJECTS_PER_PAGE = 20;

// --- 헬퍼 ---
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = DAY_NAMES[d.getDay()];
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} (${day}) ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const MODE_LABELS: Record<string, string> = { SCRIPT: '대본', REMAKE: '리메이크', CHARACTER: '캐릭터', THUMBNAIL: '썸네일' };
const ASPECT_LABELS: Record<string, string> = { '16:9': '가로', '9:16': '세로', '1:1': '정방형', '4:3': '클래식' };

const QUOTES = [
  '아이디어는 실행할 때 비로소 가치를 갖습니다',
  '완벽을 기다리지 마세요. 일단 시작하면 완성이 따라옵니다',
  '좋은 콘텐츠는 기획에서 80%가 결정됩니다',
  '오늘의 한 컷이 내일의 걸작을 만듭니다',
  '시청자는 3초 안에 머물지 떠날지 결정합니다',
  '시청자가 곧 알고리즘입니다',
  '당신의 이야기는 세상에 들려줄 가치가 있습니다',
  '영상은 기술이 아니라 감정을 전달하는 것입니다',
  '첫 번째 영상이 최고일 필요는 없습니다. 시작이 중요합니다',
  '데이터가 방향을, 창의력이 날개를 달아줍니다',
];

const estimateDurationFromVideos = (completedVideos: number): string => {
  if (!completedVideos) return '';
  const sec = completedVideos * 6;
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`;
};

// [v4.5] 상대 시간 표시
const formatRelativeTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}일 전`;
  return formatDate(ts);
};

// [v4.5] 탭별 그라데이션 배경 (이미지 없는 카드용)
const TAB_GRADIENTS: Record<string, string> = {
  'channel-analysis': 'from-blue-900/50 to-blue-800/20',
  'script-writer': 'from-violet-900/50 to-violet-800/20',
  'sound-studio': 'from-fuchsia-900/50 to-fuchsia-800/20',
  'image-video': 'from-orange-900/50 to-orange-800/20',
  'edit-room': 'from-amber-900/50 to-amber-800/20',
  'upload': 'from-green-900/50 to-green-800/20',
  'subtitle-remover': 'from-cyan-900/50 to-cyan-800/20',
  'detail-page': 'from-emerald-900/50 to-emerald-800/20',
  'thumbnail-studio': 'from-pink-900/50 to-pink-800/20',
};

// [v4.5] 탭별 아이콘
const TAB_ICONS: Record<string, string> = {
  'channel-analysis': '🔍',
  'script-writer': '✍️',
  'sound-studio': '🎵',
  'image-video': '🎬',
  'edit-room': '✂️',
  'upload': '📤',
};

// [v4.5] 파이프라인 진행도 (mini icons)
const PIPELINE_STEPS: { key: keyof PipelineSteps; icon: string; label: string }[] = [
  { key: 'channelAnalysis', icon: '🔍', label: '분석' },
  { key: 'scriptWriting', icon: '✍️', label: '대본' },
  { key: 'soundStudio', icon: '🎵', label: '사운드' },
  { key: 'imageVideo', icon: '🎬', label: '영상' },
  { key: 'editRoom', icon: '✂️', label: '편집' },
  { key: 'upload', icon: '📤', label: '업로드' },
];

const getPipelineProgress = (steps?: PipelineSteps): number => {
  if (!steps) return 0;
  const completed = PIPELINE_STEPS.filter(s => steps[s.key]).length;
  return Math.round((completed / PIPELINE_STEPS.length) * 100);
};

// 배지 색상 맵 (정적 클래스로 Tailwind 호환 보장)
const BADGE_COLORS: Record<string, string> = {
  purple: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
  cyan: 'bg-cyan-600/20 text-cyan-300 border-cyan-500/30',
  yellow: 'bg-yellow-600/20 text-yellow-300 border-yellow-500/30',
  green: 'bg-green-600/20 text-green-300 border-green-500/30',
  orange: 'bg-orange-600/20 text-orange-300 border-orange-500/30',
};
const badgeStyle = (color: string) =>
  `text-sm px-1.5 py-0.5 rounded-full border ${BADGE_COLORS[color] || BADGE_COLORS.cyan}`;

// 프로젝트 배지 목록 생성 (ProjectSummary 기반)
const getBadges = (s: ProjectSummary): { label: string; color: string }[] => {
  const list: { label: string; color: string }[] = [];
  if (s.atmosphere) list.push({ label: s.atmosphere, color: 'purple' });
  if (s.mode) list.push({ label: MODE_LABELS[s.mode] || s.mode, color: 'cyan' });
  if (s.aspectRatio) list.push({ label: ASPECT_LABELS[s.aspectRatio] || s.aspectRatio, color: 'yellow' });
  list.push({ label: `${s.sceneCount ?? 0}개`, color: 'green' });
  const dur = estimateDurationFromVideos(s.completedVideos);
  if (dur) list.push({ label: dur, color: 'orange' });
  return list;
};

// 체크박스 SVG
const CheckIcon = () => (
  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

// 빈 썸네일 아이콘
const PlaceholderIcon = ({ size = 'w-10 h-10' }: { size?: string }) => (
  <svg className={`${size} text-gray-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
  </svg>
);

// 체크박스 컴포넌트
const Checkbox = ({ checked, onClick }: { checked: boolean; onClick: (e: React.MouseEvent) => void }) => (
  <div onClick={onClick}>
    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-400 bg-gray-900/60'}`}>
      {checked && <CheckIcon />}
    </div>
  </div>
);

// 배지 렌더
const BadgeList = ({ badges }: { badges: { label: string; color: string }[] }) => (
  <div className="flex flex-wrap gap-1">
    {badges.map((b, i) => <span key={i} className={badgeStyle(b.color)}>{b.label}</span>)}
  </div>
);

// --- 동기화 상태 아이콘 ---
const SyncIcon: React.FC<{ status?: SyncStatus }> = ({ status }) => {
  if (!status || status === 'local-only') return null;
  switch (status) {
    case 'synced':
      return <span title="클라우드 동기화 완료" className="text-green-400 text-[11px]">&#9729;</span>;
    case 'syncing':
      return <span title="동기화 중..."><svg className="w-3 h-3 text-blue-400 animate-spin inline-block" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></span>;
    case 'pending':
      return <span title="동기화 대기 중" className="text-yellow-400 text-[11px]">&#9650;</span>;
    case 'error':
      return <span title="동기화 오류" className="text-red-400 text-[11px]">&#9888;</span>;
    case 'cloud-only':
      return <span title="클라우드 전용" className="text-blue-400 text-[11px]">&#9729;</span>;
    default:
      return null;
  }
};

// --- 카드 Props ---
interface CardProps {
  summary: ProjectSummary;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onExport: () => void;
  isExporting?: boolean;
  syncStatus?: SyncStatus;
}

// --- 그리드 카드 (v4.5 스마트 프로젝트) ---
const ProjectCard: React.FC<CardProps> = ({ summary, isSelected, onToggleSelect, onOpen, onExport, isExporting, syncStatus }) => {
  const thumb = summary.thumbnailUrl;
  const images = summary.sceneImageUrls || [];
  const hasImages = images.length > 0 || !!thumb;
  const gradient = TAB_GRADIENTS[summary.lastActiveTab || ''] || 'from-gray-800/50 to-gray-700/20';
  const progress = getPipelineProgress(summary.pipelineSteps);

  // [v4.5] Hover Scrub — 마우스 X 위치에 따라 장면 이미지 전환
  const [hoverIdx, setHoverIdx] = useState(-1);
  const thumbRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (images.length < 2) return;
    const rect = thumbRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.min(Math.floor(x * images.length), images.length - 1));
  }, [images.length]);
  const handleMouseLeave = useCallback(() => setHoverIdx(-1), []);

  const displayImage = hoverIdx >= 0 && images[hoverIdx] ? images[hoverIdx] : thumb;

  return (
    <div
      className={`group bg-gray-800 rounded-xl border overflow-hidden cursor-pointer transition-all hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 ${isSelected ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-gray-700'}`}
      onClick={onOpen}
    >
      {/* 상단: 배지 + 체크박스 */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-gray-900/60 border-b border-gray-700/50 gap-1">
        <div className="flex items-center gap-1 flex-wrap min-w-0 overflow-hidden">
          {summary.mode && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 whitespace-nowrap">{MODE_LABELS[summary.mode] || summary.mode}</span>}
          {summary.aspectRatio && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-600/20 text-yellow-300 border border-yellow-500/30 whitespace-nowrap">{ASPECT_LABELS[summary.aspectRatio] || summary.aspectRatio}</span>}
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-green-600/20 text-green-300 border border-green-500/30 whitespace-nowrap">{summary.sceneCount}컷</span>
          {summary.completedVideos > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-orange-600/20 text-orange-300 border border-orange-500/30 whitespace-nowrap">{estimateDurationFromVideos(summary.completedVideos)}</span>
          )}
        </div>
        <div className="flex-shrink-0">
          <Checkbox checked={isSelected} onClick={e => { e.stopPropagation(); onToggleSelect(); }} />
        </div>
      </div>

      {/* 썸네일 영역 — Hover Scrub + 동적 그라데이션 */}
      <div
        ref={thumbRef}
        className="aspect-video bg-gray-700 relative overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {hasImages && displayImage ? (
          <>
            <img src={displayImage} alt={summary.title} className="w-full h-full object-cover transition-opacity duration-150" />
            {/* Hover Scrub 인디케이터 */}
            {images.length > 1 && hoverIdx >= 0 && (
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                {images.map((_, i) => (
                  <div key={i} className={`h-0.5 rounded-full transition-all ${i === hoverIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`} />
                ))}
              </div>
            )}
          </>
        ) : (
          /* 이미지 없는 카드 — 활동 기반 동적 비주얼 */
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 p-3`}>
            {/* 파이프라인 미니 아이콘 */}
            {summary.pipelineSteps && Object.values(summary.pipelineSteps).some(Boolean) ? (
              <>
                <div className="flex items-center gap-1.5">
                  {PIPELINE_STEPS.map(s => {
                    const done = summary.pipelineSteps?.[s.key];
                    return (
                      <div key={s.key} className={`flex flex-col items-center gap-0.5 transition-all ${done ? 'opacity-100' : 'opacity-30'}`}>
                        <span className="text-lg">{s.icon}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-green-400' : 'bg-gray-600'}`} />
                      </div>
                    );
                  })}
                </div>
                {progress > 0 && (
                  <div className="w-3/4 h-1 bg-gray-700 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </>
            ) : (
              /* 아직 활동 없음 */
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl">{TAB_ICONS[summary.lastActiveTab || ''] || '📁'}</span>
                <span className="text-[11px] text-gray-400 font-medium">새 프로젝트</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단: 제목 + 상대시간 + 내보내기 */}
      <div className="p-3">
        <h3 className="text-sm font-bold text-white truncate mb-1">{summary.title}</h3>
        <div className="flex items-center justify-between text-[12px] text-gray-500">
          <span className="flex items-center gap-1">{formatRelativeTime(summary.lastModified)} <SyncIcon status={syncStatus} /></span>
          <button
            onClick={e => { e.stopPropagation(); onExport(); }}
            disabled={isExporting}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400 disabled:text-blue-400 p-0.5"
            title="프로젝트 내보내기"
          >
            {isExporting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 리스트 아이템 (v4.5) ---
const ProjectListItem: React.FC<CardProps> = ({ summary, isSelected, onToggleSelect, onOpen, onExport, isExporting, syncStatus }) => {
  const thumb = summary.thumbnailUrl;
  const gradient = TAB_GRADIENTS[summary.lastActiveTab || ''] || 'from-gray-800/50 to-gray-700/20';
  const progress = getPipelineProgress(summary.pipelineSteps);
  return (
    <div
      className={`flex items-center gap-4 bg-gray-800 rounded-lg border px-4 py-3 cursor-pointer transition-all hover:border-blue-500/50 ${isSelected ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-gray-700'}`}
      onClick={onOpen}
    >
      <Checkbox checked={isSelected} onClick={e => { e.stopPropagation(); onToggleSelect(); }} />
      <div className="w-20 h-12 rounded bg-gray-700 overflow-hidden flex-shrink-0">
        {thumb
          ? <img src={thumb} alt={summary.title} className="w-full h-full object-cover" />
          : <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
              <span className="text-base">{TAB_ICONS[summary.lastActiveTab || ''] || '📁'}</span>
            </div>}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-white truncate">{summary.title}</h3>
        <div className="flex items-center gap-3 text-[12px] text-gray-500">
          <span className="flex items-center gap-1">{formatRelativeTime(summary.lastModified)} <SyncIcon status={syncStatus} /></span>
          {/* 미니 파이프라인 */}
          {summary.pipelineSteps && (
            <div className="flex items-center gap-0.5">
              {PIPELINE_STEPS.map(s => (
                <span key={s.key} className={`text-[10px] ${summary.pipelineSteps?.[s.key] ? 'opacity-100' : 'opacity-20'}`}>{s.icon}</span>
              ))}
            </div>
          )}
          {progress > 0 && <span className="text-blue-400 font-bold">{progress}%</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 max-w-xs justify-end">
        {getBadges(summary).map((b, i) => <span key={i} className={badgeStyle(b.color)}>{b.label}</span>)}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onExport(); }}
        disabled={isExporting}
        className="flex-shrink-0 text-gray-400 hover:text-blue-400 disabled:text-blue-400 p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
        title="프로젝트 내보내기"
      >
        {isExporting ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        )}
      </button>
    </div>
  );
};

// --- 새 프로젝트 모달 ---
interface NewProjectModalProps {
  isOpen: boolean;
  defaultName: string;
  onCancel: () => void;
  onCreate: (name: string) => void;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, defaultName, onCancel, onCreate }) => {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-gray-800 rounded-2xl border border-gray-600 shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">새 프로젝트</h2>
              <p className="text-sm text-gray-400">프로젝트 이름을 입력하세요</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="text-sm text-gray-400 font-medium block mb-1.5">프로젝트 이름</label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-10"
                placeholder="프로젝트 이름..."
                autoFocus
              />
              <svg className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-bold py-3 rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="text-lg leading-none">+</span> 생성하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 메인 대시보드 ---
const SORT_BUTTONS: { key: SortMode; label: string }[] = [
  { key: 'date', label: '수정일' }, { key: 'name', label: '이름' }, { key: 'progress', label: '진행도' },
];
const SIZE_BUTTONS: { key: CardSize; label: string }[] = [
  { key: 'sm', label: '소' }, { key: 'md', label: '중' }, { key: 'lg', label: '대' },
];
const GRID_COLS: Record<CardSize, string> = {
  sm: 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8',
  md: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
  lg: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
};

const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ onSelectProject, onNewProject, onImportProject, refreshTrigger }) => {
  const { requireAuth } = useAuthGuard();
  const syncStatuses = useSyncStore((s) => s.projectSyncStatus);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const lastFullSyncAt = useSyncStore((s) => s.lastFullSyncAt);
  const isLoggedIn = !!getToken();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportProject) onImportProject(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  // 롤링 명언 (타이핑 효과 + 5초 대기 후 다음 명언)
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const holdTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const fullText = QUOTES[quoteIndex];
    let charIdx = 0;
    setDisplayedText('');
    setIsTyping(true);

    const typeNext = () => {
      charIdx++;
      setDisplayedText(fullText.slice(0, charIdx));
      if (charIdx < fullText.length) {
        typeTimerRef.current = setTimeout(typeNext, 35);
      } else {
        setIsTyping(false);
        holdTimerRef.current = setTimeout(() => {
          setQuoteIndex(prev => (prev + 1) % QUOTES.length);
        }, 5000);
      }
    };
    typeTimerRef.current = setTimeout(typeNext, 300);

    return () => {
      clearTimeout(typeTimerRef.current);
      clearTimeout(holdTimerRef.current);
    };
  }, [quoteIndex]);
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [cardSize, setCardSize] = useState<CardSize>('md');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());

  const loadSummaries = useCallback(async () => {
    try {
      setSummaries(await getAllProjectSummaries());
    } catch (e) {
      console.error('[ProjectDashboard] 프로젝트 목록 로드 실패:', e);
      showToast('프로젝트 목록을 불러오지 못했습니다.', 4000);
    }
  }, []);

  useEffect(() => { loadSummaries(); }, [loadSummaries, refreshTrigger, lastFullSyncAt]);

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const nextProjectName = `새 프로젝트 ${summaries.length + 1}`;

  const handleNewProjectClick = async () => {
    if (!requireAuth('프로젝트 생성')) return;
    try {
      if (!(await canCreateNewProject())) {
        showToast('저장 공간이 가득 찼습니다. 기존 프로젝트를 삭제 후 생성해주세요.', 5000);
        return;
      }
    } catch (e) {
      console.error('[ProjectDashboard] 저장 공간 확인 실패:', e);
      // 확인 실패 시에도 생성은 허용 (저장 시 다시 체크됨)
    }
    setShowNewProjectModal(true);
  };

  const handleCreateProject = (title: string) => {
    setShowNewProjectModal(false);
    onNewProject(title);
  };

  const handleBulkDelete = async () => {
    if (!requireAuth('프로젝트 삭제')) return;
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개의 프로젝트를 삭제하시겠습니까?`)) return;

    const ids = Array.from(selectedIds);

    // 동기화가 삭제 대상을 재다운로드하지 않도록 등록 + 일시 중단
    markDeletingIds(ids);
    await pauseSync();

    try {
      // 현재 열린 프로젝트가 삭제 대상이면 메모리 상태 완전 초기화
      const currentId = useProjectStore.getState().currentProjectId;
      if (currentId && ids.includes(currentId)) {
        useProjectStore.getState().clearProjectState();
        useNavigationStore.getState().goToDashboard();
      }

      // 1) 로컬 IndexedDB 삭제 (개별 실패 무시 — 성공 목록 수집)
      const localDeleted: string[] = [];
      for (const id of ids) {
        try {
          await deleteProject(id);
          localDeleted.push(id);
        } catch (e) {
          console.error(`[ProjectDashboard] 로컬 삭제 실패: ${id}`, e);
        }
      }

      // 2) 클라우드 소프트 삭제 (병렬 — 로컬 삭제 성공 여부 무관하게 전체 시도)
      const cloudResults = await Promise.allSettled(
        ids.map(id => deleteCloudProject(id))
      );
      let failCount = 0;
      cloudResults.forEach((r) => {
        if (r.status === 'rejected') {
          failCount++;
        }
      });
      const localFailCount = ids.length - localDeleted.length;
      if (localFailCount > 0 || failCount > 0) {
        const parts: string[] = [];
        if (localFailCount > 0) parts.push(`로컬 ${localFailCount}건`);
        if (failCount > 0) parts.push(`클라우드 ${failCount}건`);
        showToast(`삭제 실패: ${parts.join(', ')}. 새로고침 후 다시 시도해주세요.`, 4000);
      }
    } catch (e) {
      console.error('[ProjectDashboard] 삭제 실패:', e);
      showToast('프로젝트 삭제 중 오류가 발생했습니다.', 4000);
    } finally {
      resumeSync();
    }
    setSelectedIds(new Set());
    loadSummaries();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 프로젝트 클릭 시 전체 데이터 로드
  const handleOpenProject = async (id: string) => {
    if (!requireAuth('프로젝트 열기')) return;
    if (loadingProjectId) return; // 중복 로드 방지
    setLoadingProjectId(id);
    try {
      const fullProject = await getProject(id);
      if (fullProject) {
        onSelectProject(fullProject);
      } else {
        showToast('프로젝트를 불러올 수 없습니다. 삭제되었을 수 있습니다.', 4000);
      }
    } finally {
      setLoadingProjectId(null);
    }
  };

  // 프로젝트 내보내기
  const handleExportProject = async (id: string) => {
    if (exportingIds.has(id)) return;
    setExportingIds(prev => new Set(prev).add(id));
    try {
      await exportProjectById(id);
      showToast('프로젝트가 내보내기 되었습니다.', 3000);
    } catch (e) {
      console.error('[ProjectDashboard] 내보내기 실패:', e);
      showToast('내보내기에 실패했습니다.', 4000);
    } finally {
      setExportingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // 선택된 프로젝트 일괄 내보내기
  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    showToast(`${ids.length}개 프로젝트 내보내기 중...`, 3000);
    for (const id of ids) {
      await handleExportProject(id);
    }
  };

  // 필터 + 정렬
  const filtered = useMemo(() => {
    return summaries
      .filter(s => (s.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        if (sortMode === 'name') return a.title.localeCompare(b.title, 'ko');
        if (sortMode === 'progress') return b.sceneCount - a.sceneCount;
        return b.lastModified - a.lastModified;
      });
  }, [summaries, searchQuery, sortMode]);

  // 페이지네이션 (필터링/정렬 후 적용)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PROJECTS_PER_PAGE));

  // 필터/정렬 변경 시 페이지 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortMode]);

  // 현재 페이지가 범위를 벗어나면 보정
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PROJECTS_PER_PAGE;
  const paged = filtered.slice(startIdx, startIdx + PROJECTS_PER_PAGE);

  const btnCls = (active: boolean) => `text-sm px-3 py-1.5 rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'}`;
  const iconBtnCls = (active: boolean) => `p-1.5 rounded-lg transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 border border-gray-700'}`;
  const sep = <div className="w-px h-5 bg-gray-700 mx-1" />;

  const redirectedFrom = useNavigationStore((s) => s.redirectedFrom);
  const clearRedirect = useNavigationStore((s) => s.clearRedirect);

  // 리다이렉트 배너 자동 닫기 (10초)
  useEffect(() => {
    if (redirectedFrom) {
      const timer = setTimeout(() => clearRedirect(), 10000);
      return () => clearTimeout(timer);
    }
  }, [redirectedFrom, clearRedirect]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">

      {/* 프로젝트 미생성 리다이렉트 안내 배너 */}
      {redirectedFrom && (
        <div className="mb-5 relative overflow-hidden rounded-xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-900/30 via-orange-900/20 to-amber-900/30">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_10px,rgba(245,158,11,0.03)_10px,rgba(245,158,11,0.03)_20px)]" />
          <div className="relative px-5 py-4 flex items-start gap-4">
            <div className="flex-shrink-0 w-11 h-11 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center mt-0.5">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-amber-300 mb-1">
                "{redirectedFrom}" 탭을 사용하려면 프로젝트가 필요합니다
              </h3>
              <p className="text-sm text-amber-200/80 leading-relaxed">
                <strong className="text-amber-200">"{redirectedFrom}"</strong> 탭은 프로젝트 안에서만 작동합니다.
                아래에서 <strong className="text-white">새 프로젝트를 만들거나</strong>, 기존 프로젝트를 선택한 뒤 다시 이동해주세요.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => { clearRedirect(); handleNewProjectClick(); }}
                  className="text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg transition-colors shadow-md shadow-amber-500/20"
                >
                  + 새 프로젝트 만들기
                </button>
                <span className="text-xs text-amber-400/60">또는 아래 목록에서 기존 프로젝트를 선택하세요</span>
              </div>
            </div>
            <button
              onClick={clearRedirect}
              className="flex-shrink-0 text-amber-500/60 hover:text-amber-300 transition-colors p-1"
              title="닫기"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <input type="text" placeholder="프로젝트 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="flex-1 max-w-md bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
        <div className="flex items-center gap-2">
          {onImportProject && (
            <>
              <input ref={fileInputRef} type="file" accept=".html,.zip" className="hidden" onChange={handleFileChange} />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                title="내보낸 프로젝트 파일(.html 또는 .zip)을 다시 불러옵니다">
                📥 불러오기
              </button>
            </>
          )}
          <button onClick={handleNewProjectClick} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap">
            <span className="text-lg leading-none">+</span> 새 프로젝트 만들기
          </button>
        </div>
      </div>

      {/* 헤딩 */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">모든 프로젝트</h1>
        <p className="text-sm italic mt-1 text-gray-300 h-6">
          &ldquo;{displayedText}<span className={`inline-block w-[2px] h-3.5 bg-blue-400 ml-0.5 align-middle ${isTyping ? 'animate-pulse' : 'opacity-0'}`} />&rdquo;
        </p>
      </div>

      {/* 툴바 */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="bg-green-600/20 text-green-400 text-sm font-medium px-2.5 py-0.5 rounded-full border border-green-500/30">콘텐츠</span>
          <span className="text-sm text-gray-400">총 {filtered.length}개의 프로젝트</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {SORT_BUTTONS.map(s => <button key={s.key} onClick={() => setSortMode(s.key)} className={btnCls(sortMode === s.key)}>{s.label}</button>)}
          {sep}
          <button
            onClick={() => {
              if (selectedIds.size === filtered.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filtered.map(s => s.id)));
              }
            }}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors">
            {selectedIds.size === filtered.length && filtered.length > 0 ? '전체 해제' : '전체 선택'}
          </button>
          <button onClick={handleBulkExport} disabled={selectedIds.size === 0}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
            📦 선택 내보내기{selectedIds.size > 0 && ` (${selectedIds.size})`}
          </button>
          <button onClick={handleBulkDelete} disabled={selectedIds.size === 0}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
            🗑️ 선택 삭제{selectedIds.size > 0 && ` (${selectedIds.size})`}
          </button>
          {isLoggedIn && (
            <>
              {sep}
              <button
                onClick={() => { performFullSync().then(() => loadSummaries()); }}
                disabled={isSyncing}
                className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-blue-400 hover:text-blue-300 disabled:text-blue-400/60 transition-colors flex items-center gap-1.5"
                title={lastFullSyncAt ? `마지막 동기화: ${formatRelativeTime(lastFullSyncAt)}` : '클라우드 동기화'}
              >
                {isSyncing ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                {isSyncing ? '동기화 중...' : '동기화'}
              </button>
            </>
          )}
          {sep}
          <button onClick={() => setViewMode('grid')} className={iconBtnCls(viewMode === 'grid')} title="그리드 보기">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          </button>
          <button onClick={() => setViewMode('list')} className={iconBtnCls(viewMode === 'list')} title="리스트 보기">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/></svg>
          </button>
          {sep}
          <span className="text-sm text-gray-500 mr-1">Size:</span>
          {SIZE_BUTTONS.map(s => <button key={s.key} onClick={() => setCardSize(s.key)} className={btnCls(cardSize === s.key)}>{s.label}</button>)}
        </div>
      </div>

      {/* 프로젝트 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg mb-2">프로젝트가 없습니다</p>
          <p className="text-sm mb-3">새 프로젝트를 만들어 시작하세요</p>
          <div className="text-sm text-gray-600 space-y-0.5 max-w-sm mx-auto text-left bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
            <p className="text-gray-500 font-medium mb-1">이 앱으로 할 수 있는 것:</p>
            <p>1. 채널분석: YouTube 채널 스타일을 AI로 역설계합니다</p>
            <p>2. 대본작성: AI가 영상 대본을 자동 생성합니다</p>
            <p>3. 장면/이미지: 대본을 장면으로 분할하고 이미지를 생성합니다</p>
            <p>4. 사운드: 나레이션(TTS)과 BGM을 만듭니다</p>
            <p>5. 편집실: 이미지 효과, 자막, 타임라인을 편집합니다</p>
            <p>6. 업로드: 완성된 영상을 YouTube에 바로 업로드합니다</p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className={`grid gap-4 ${GRID_COLS[cardSize]}`}>
          {paged.map(s => (
            <ProjectCard key={s.id} summary={s} isSelected={selectedIds.has(s.id)}
              onToggleSelect={() => toggleSelect(s.id)} onOpen={() => handleOpenProject(s.id)}
              onExport={() => handleExportProject(s.id)} isExporting={exportingIds.has(s.id)}
              syncStatus={syncStatuses[s.id]} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {paged.map(s => (
            <ProjectListItem key={s.id} summary={s} isSelected={selectedIds.has(s.id)}
              onToggleSelect={() => toggleSelect(s.id)} onOpen={() => handleOpenProject(s.id)}
              onExport={() => handleExportProject(s.id)} isExporting={exportingIds.has(s.id)}
              syncStatus={syncStatuses[s.id]} />
          ))}
        </div>
      )}

      {/* 로딩 오버레이 (프로젝트 로드 중) */}
      {loadingProjectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl px-6 py-4 flex items-center gap-3 border border-gray-600 shadow-2xl">
            <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-200">프로젝트 로드 중...</span>
          </div>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400 px-3">
            Page {safePage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* 새 프로젝트 모달 */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        defaultName={nextProjectName}
        onCancel={() => setShowNewProjectModal(false)}
        onCreate={handleCreateProject}
      />
    </div>
  );
};

export default ProjectDashboard;

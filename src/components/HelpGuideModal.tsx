// 탭별 도움말 가이드 모달
import React, { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useNavigationStore } from '../stores/navigationStore';
import { TAB_HELP } from '../data/helpContent';
import type { HelpSection } from '../data/helpContent';
import type { AppTab } from '../types';

/** 개별 도움말 섹션 렌더링 */
const HelpSectionCard: React.FC<{ section: HelpSection; accent: string }> = ({ section, accent }) => (
  <div className="bg-gray-900/60 rounded-xl border border-gray-700/50 p-4 space-y-3">
    <h4 className={`text-sm font-bold ${accent}`}>{section.title}</h4>
    <p className="text-gray-400 text-sm leading-relaxed">{section.description}</p>
    {section.steps && section.steps.length > 0 && (
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">순서</span>
        <ol className="space-y-1">
          {section.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
              <span className={`shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold bg-gradient-to-br ${getAccentGradient(accent)}`}>
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    )}
    {section.tips && section.tips.length > 0 && (
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">팁</span>
        <ul className="space-y-1">
          {section.tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
              <span className="text-yellow-400 shrink-0 mt-0.5">*</span>
              <span className="leading-relaxed">{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

/** accent 텍스트 색상에서 gradient 추출 */
function getAccentGradient(accent: string): string {
  if (accent.includes('blue')) return 'from-blue-500 to-blue-700 text-white';
  if (accent.includes('violet')) return 'from-violet-500 to-violet-700 text-white';
  if (accent.includes('fuchsia')) return 'from-fuchsia-500 to-fuchsia-700 text-white';
  if (accent.includes('orange')) return 'from-orange-500 to-orange-700 text-white';
  if (accent.includes('amber')) return 'from-amber-500 to-amber-700 text-white';
  if (accent.includes('green')) return 'from-green-500 to-green-700 text-white';
  if (accent.includes('pink')) return 'from-pink-500 to-pink-700 text-white';
  if (accent.includes('emerald')) return 'from-emerald-500 to-emerald-700 text-white';
  if (accent.includes('sky')) return 'from-sky-500 to-sky-700 text-white';
  if (accent.includes('teal')) return 'from-teal-500 to-teal-700 text-white';
  if (accent.includes('cyan')) return 'from-cyan-500 to-cyan-700 text-white';
  if (accent.includes('red')) return 'from-red-500 to-red-700 text-white';
  return 'from-gray-500 to-gray-700 text-white';
}

/** 탭 ID별 accent 텍스트 색상 매핑 */
function getTabAccent(tabId: string): string {
  const map: Record<string, string> = {
    'project': 'text-gray-200',
    'channel-analysis': 'text-blue-400',
    'script-writer': 'text-violet-400',
    'sound-studio': 'text-fuchsia-400',
    'image-video': 'text-orange-400',
    'edit-room': 'text-amber-400',
    'upload': 'text-green-400',
    'thumbnail-studio': 'text-pink-400',
    'character-twist': 'text-orange-400',
    'image-script-upload': 'text-emerald-400',
    'ppt-master': 'text-sky-400',
    'detail-page': 'text-teal-400',
    'subtitle-remover': 'text-cyan-400',
  };
  return map[tabId] || 'text-gray-200';
}

/** 전체 탭 목록 (좌측 네비 용) */
const ALL_TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: 'project', label: '프로젝트', icon: '📁' },
  { id: 'channel-analysis', label: '채널/영상 분석', icon: '🔍' },
  { id: 'script-writer', label: '대본작성', icon: '✍️' },
  { id: 'sound-studio', label: '사운드스튜디오', icon: '🎵' },
  { id: 'image-video', label: '이미지/영상', icon: '🎬' },
  { id: 'edit-room', label: '편집실', icon: '✂️' },
  { id: 'upload', label: '업로드', icon: '📤' },
  { id: 'thumbnail-studio', label: '썸네일 스튜디오', icon: '🖼️' },
  { id: 'character-twist', label: '캐릭터 비틀기', icon: '🌀' },
  { id: 'image-script-upload', label: '소스 임포트', icon: '📸' },
  { id: 'ppt-master', label: 'PPT 마스터', icon: '📊' },
  { id: 'detail-page', label: '쇼핑콘텐츠', icon: '🛒' },
  { id: 'subtitle-remover', label: '자막/워터마크 제거', icon: '🧹' },
];

const HelpGuideModal: React.FC = () => {
  const showHelp = useUIStore((s) => s.showHelpGuide);
  const activeTab = useNavigationStore((s) => s.activeTab);
  const [selectedTab, setSelectedTab] = React.useState<AppTab>(activeTab);

  // 모달 열릴 때 현재 탭으로 리셋
  useEffect(() => {
    if (showHelp) setSelectedTab(activeTab);
  }, [showHelp, activeTab]);

  // ESC 닫기
  useEffect(() => {
    if (!showHelp) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUIStore.getState().setShowHelpGuide(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showHelp]);

  if (!showHelp) return null;

  const helpData = TAB_HELP[selectedTab];
  const accent = getTabAccent(selectedTab);
  const close = () => useUIStore.getState().setShowHelpGuide(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={close}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl max-h-[85vh] bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 좌측 탭 네비게이션 */}
        <nav className="w-44 shrink-0 border-r border-gray-700 py-3 overflow-y-auto custom-scrollbar bg-gray-900/80">
          <div className="px-3 pb-2 mb-2 border-b border-gray-700">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">메뉴 가이드</span>
          </div>
          {ALL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`text-left w-full px-3 py-2 text-sm transition-all ${
                selectedTab === tab.id
                  ? `bg-gray-700/50 ${getTabAccent(tab.id)} font-bold border-r-2 border-current`
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/30'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* 우측 콘텐츠 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{helpData?.icon || '📖'}</span>
              <div>
                <h2 className={`text-lg font-bold ${accent}`}>{helpData?.tabName || selectedTab}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{helpData?.summary || ''}</p>
              </div>
            </div>
            <button onClick={close} className="text-gray-400 hover:text-white text-2xl leading-none p-1">&times;</button>
          </div>

          {/* 본문 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {helpData ? (
              helpData.sections.map((section, i) => (
                <HelpSectionCard key={i} section={section} accent={accent} />
              ))
            ) : (
              <div className="text-center py-12 text-gray-500">
                <span className="text-4xl block mb-3">📖</span>
                <p className="text-sm">이 탭의 가이드를 준비 중이에요.</p>
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div className="px-6 py-3 border-t border-gray-700 shrink-0 flex items-center justify-between">
            <span className="text-xs text-gray-600">궁금한 점이 있으면 피드백으로 알려주세요!</span>
            <button
              onClick={close}
              className="px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-bold transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpGuideModal;

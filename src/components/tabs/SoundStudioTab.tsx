import React, { Suspense, lazy, useState, useCallback, useEffect } from 'react';
import { useSoundStudioStore } from '../../stores/soundStudioStore';
import { stopAllAudio } from '../../stores/soundStudioStore';
import { useUIStore } from '../../stores/uiStore';

const VoiceStudio = lazy(() => import('./sound/VoiceStudio'));
const MusicStudio = lazy(() => import('./sound/MusicStudio'));
const MusicLibrary = lazy(() => import('./sound/MusicLibrary'));
const WaveformEditor = lazy(() => import('./sound/WaveformEditor'));
const NarrationCreditBar = lazy(() => import('./sound/NarrationCreditBar'));

type MainSection = 'tts' | 'music';

const TTS_ENGINE_LABELS: Record<string, string> = {
  typecast: 'Typecast',
  microsoft: 'Microsoft Edge',
  supertonic: 'Supertonic 2',
};

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-gray-600 border-t-fuchsia-400 rounded-full animate-spin" />
      <span className="text-gray-500 text-base">로딩 중...</span>
    </div>
  </div>
);

const SoundStudioTab: React.FC = () => {
  const [mainSection, setMainSection] = useState<MainSection>('tts');
  const activeSubTab = useSoundStudioStore((s) => s.activeSubTab);
  const setActiveSubTab = useSoundStudioStore((s) => s.setActiveSubTab);
  const ttsEngine = useSoundStudioStore((s) => s.ttsEngine);

  // 탭 이탈(언마운트) 시 모든 오디오 정지
  useEffect(() => {
    // IndexedDB에서 음악 라이브러리 복원
    useSoundStudioStore.getState().loadMusicLibrary();
    return () => {
      stopAllAudio();
    };
  }, []);

  const handleSubTabClick = useCallback((tabId: 'narration' | 'waveform') => {
    if (tabId === 'waveform') {
      const { lines } = useSoundStudioStore.getState();
      if (lines.length === 0) {
        useUIStore.getState().setToast({ show: true, message: '나레이션 탭에서 대본을 먼저 불러와주세요.' });
        setTimeout(() => useUIStore.getState().setToast(null), 3000);
        return;
      }
    }
    setActiveSubTab(tabId);
  }, [setActiveSubTab]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 rounded-lg flex items-center justify-center text-xl shadow-lg">
              🎙
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">사운드 스튜디오</h1>
              <p className="text-gray-400 text-base">
                나레이션 음성 생성과 AI 음악 제작을 관리합니다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={stopAllAudio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 hover:text-red-300 transition-all text-sm font-semibold"
              title="모든 오디오 정지"
            >
              <span className="text-base leading-none">&#9724;</span>
              <span>전체 정지</span>
            </button>
            <span className="text-sm text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
              TTS 엔진: <span className="text-fuchsia-400 font-semibold">{TTS_ENGINE_LABELS[ttsEngine]}</span>
            </span>
          </div>
        </div>

        {/* Main section toggle */}
        <div className="flex items-center gap-2 mb-4">
          {([
            { id: 'tts' as MainSection, label: '나레이션', icon: '🎤' },
            { id: 'music' as MainSection, label: '음악 생성', icon: '🎵' },
          ]).map((sec) => {
            const isActive = mainSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setMainSection(sec.id)}
                className={`px-5 py-2 rounded-lg text-base font-bold transition-all border ${
                  isActive
                    ? 'bg-fuchsia-600/20 text-fuchsia-300 border-fuchsia-500/50 shadow-md'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                <span className="mr-1.5">{sec.icon}</span>
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tab navigation: 나레이션 | 파형 편집 */}
        {mainSection === 'tts' && (
          <div className="flex border-b border-gray-700">
            {([
              { id: 'narration' as const, label: '나레이션', icon: '🎙️' },
              { id: 'waveform' as const, label: '오디오 편집', icon: '✂️' },
            ]).map((tab) => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSubTabClick(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-base font-semibold transition-all border-b-2 ${
                    isActive
                      ? 'border-fuchsia-500 text-fuchsia-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<LoadingFallback />}>
          {mainSection === 'tts' && (
            <>
              {activeSubTab === 'narration' && <VoiceStudio />}
              {activeSubTab === 'waveform' && <WaveformEditor />}
            </>
          )}
          {mainSection === 'music' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MusicStudio />
              <MusicLibrary />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default SoundStudioTab;

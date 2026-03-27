import React, { Suspense, useState, useCallback, useEffect } from 'react';
import { useSoundStudioStore } from '../../stores/soundStudioStore';
import { stopAllAudio } from '../../stores/soundStudioStore';
import { useProjectStore } from '../../stores/projectStore';
import { logger } from '../../services/LoggerService';
import { lazyRetry } from '../../utils/retryImport';

const VoiceStudio = lazyRetry(() => import('./sound/VoiceStudio'));
const MusicStudio = lazyRetry(() => import('./sound/MusicStudio'));
const MusicLibrary = lazyRetry(() => import('./sound/MusicLibrary'));
const WaveformEditor = lazyRetry(() => import('./sound/WaveformEditor'));
const NarrationCreditBar = lazyRetry(() => import('./sound/NarrationCreditBar'));
const SfxPanel = lazyRetry(() => import('./sound/SfxPanel'));
const MusicReferenceRoom = lazyRetry(() => import('./sound/MusicReferenceRoom'));

type MainSection = 'tts' | 'music' | 'sfx' | 'reference';

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

  // [FIX #868/#874] 탭 진입 시 scenes ↔ lines 동기화
  // 대본 수정 후 사운드 스튜디오로 돌아왔을 때 나레이션 텍스트가 갱신되지 않는 문제 수정
  useEffect(() => {
    const scenes = useProjectStore.getState().scenes;
    const currentLines = useSoundStudioStore.getState().lines;
    const config = useProjectStore.getState().config;

    // 업로드 전사 기반 프로젝트는 동기화 스킵 (별도 동기화 경로 사용)
    if (config?.narrationSource === 'uploaded-audio') return;
    // 씬이나 라인이 없으면 동기화 불필요
    if (scenes.length === 0 || currentLines.length === 0) return;

    const scenesWithText = scenes.filter(s => s.scriptText);
    if (scenesWithText.length === 0) return;

    // sceneId 기반 매핑으로 변경사항 감지
    const linesWithSceneId = currentLines.filter(l => l.sceneId);
    // sceneId가 없는 라인이 하나라도 없으면 동기화 불가
    if (linesWithSceneId.length === 0) return;

    const lineBySceneId = new Map(linesWithSceneId.map(l => [l.sceneId!, l]));
    const lineSceneIds = new Set(linesWithSceneId.map(l => l.sceneId!));
    // sceneId 없는 라인 (direct-script 등) — 동기화 후에도 보존
    const orphanLines = currentLines.filter(l => !l.sceneId);

    let needsSync = false;

    // 1. 텍스트 변경 감지
    for (const scene of scenesWithText) {
      const existingLine = lineBySceneId.get(scene.id);
      if (existingLine && (scene.scriptText || '') !== existingLine.text) {
        needsSync = true;
        break;
      }
    }

    // 2. 새 씬 추가 감지
    if (!needsSync) {
      for (const scene of scenesWithText) {
        if (!lineSceneIds.has(scene.id)) {
          needsSync = true;
          break;
        }
      }
    }

    // 3. 삭제된 씬 감지
    if (!needsSync) {
      const sceneIdSet = new Set(scenesWithText.map(s => s.id));
      for (const line of linesWithSceneId) {
        if (!sceneIdSet.has(line.sceneId!)) {
          needsSync = true;
          break;
        }
      }
    }

    if (!needsSync) return;

    logger.trackAction('[SoundStudio] 대본 변경 감지 — 나레이션 라인 동기화', `씬 ${scenesWithText.length}개`);

    const speakerId = useSoundStudioStore.getState().speakers[0]?.id || '';
    const ts = Date.now();

    const syncedLines = scenesWithText.map((scene, i) => {
      const existingLine = lineBySceneId.get(scene.id);
      const sceneText = scene.scriptText || '';

      if (existingLine && existingLine.text === sceneText) {
        // 텍스트 동일 → 오디오 데이터 + 모든 메타데이터 보존
        return { ...existingLine, index: i };
      }

      if (existingLine) {
        // 텍스트 변경 → 오디오 + 업로드 마커 모두 초기화, 나머지 보존 (speakerId, voiceId, voiceName 등)
        return {
          ...existingLine,
          text: sceneText,
          index: i,
          audioUrl: undefined,
          ttsStatus: 'idle' as const,
          duration: undefined,
          startTime: undefined,
          endTime: undefined,
          audioSource: undefined,
          uploadedAudioId: undefined,
        };
      }

      // 새 씬 → 새 라인 생성
      return {
        id: `line-${ts}-${i}`,
        speakerId,
        text: sceneText,
        index: i,
        sceneId: scene.id,
        ttsStatus: 'idle' as const,
      };
    });

    // 텍스트가 변경된 scene의 audioUrl도 초기화 (다른 탭에서 stale audio 참조 방지)
    const projectStoreActions = useProjectStore.getState();
    for (const scene of scenesWithText) {
      const existingLine = lineBySceneId.get(scene.id);
      if (existingLine && (scene.scriptText || '') !== existingLine.text && scene.audioUrl) {
        projectStoreActions.updateScene(scene.id, {
          audioUrl: undefined,
          audioDuration: undefined,
          startTime: undefined,
          endTime: undefined,
        });
      }
    }

    // sceneId 없는 orphan 라인도 끝에 추가하여 보존
    const finalLines = [...syncedLines, ...orphanLines.map((l, idx) => ({ ...l, index: syncedLines.length + idx }))];
    useSoundStudioStore.getState().setLines(finalLines);
  }, []);

  const handleSubTabClick = useCallback((tabId: 'narration' | 'waveform') => {
    logger.trackAction('사운드 서브탭 전환', tabId);
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
            { id: 'sfx' as MainSection, label: '효과음', icon: '🔊' },
            { id: 'reference' as MainSection, label: '뮤직 레퍼런스', icon: '🔍' },
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
          {mainSection === 'sfx' && <SfxPanel />}
          {mainSection === 'reference' && <MusicReferenceRoom />}
        </Suspense>
      </div>
    </div>
  );
};

export default SoundStudioTab;

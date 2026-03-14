import React, { useState, useRef, useCallback } from 'react';
import { generateTypecastTTS } from '../../../services/typecastService';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';
import { runKieBatch } from '../../../utils/kieBatchRunner';

export interface TtsEntry {
  audioUrl: string;
  text: string;
}

interface SceneInfo {
  cutNum: number;
  subtitle: string;
  mode: string;
}

interface Props {
  scenes: SceneInfo[];
  currentIdx: number;
  ttsMap: Record<number, TtsEntry>;
  onTtsGenerated: (cutNum: number, entry: TtsEntry) => void;
  onSeekToScene: (idx: number) => void;
}

const DEFAULT_VOICE_ID = 'vitaVoice_ko_dain';

const PreviewNarrationPanel: React.FC<Props> = ({
  scenes, currentIdx, ttsMap, onTtsGenerated, onSeekToScene,
}) => {
  const [editingCut, setEditingCut] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editedTexts, setEditedTexts] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState<Set<number>>(new Set());
  const [playingCut, setPlayingCut] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const getText = useCallback((cutNum: number, fallback: string) => {
    return editedTexts[cutNum] ?? fallback;
  }, [editedTexts]);

  const handleStartEdit = useCallback((cutNum: number, text: string) => {
    setEditingCut(cutNum);
    setEditText(getText(cutNum, text));
  }, [getText]);

  const handleConfirmEdit = useCallback((cutNum: number) => {
    const trimmed = editText.trim();
    if (trimmed) {
      setEditedTexts(prev => ({ ...prev, [cutNum]: trimmed }));
    }
    setEditingCut(null);
  }, [editText]);

  const handleGenerate = useCallback(async (cutNum: number, originalText: string) => {
    const text = getText(cutNum, originalText);
    if (!text.trim()) return;

    setGenerating(prev => new Set(prev).add(cutNum));
    try {
      const store = useSoundStudioStore.getState();
      const speaker = store.speakers[0];
      const voiceId = speaker?.voiceId || DEFAULT_VOICE_ID;

      const result = await generateTypecastTTS(text, {
        voiceId,
        speed: speaker?.speed ?? 1.0,
        emotionMode: 'smart',
      });
      onTtsGenerated(cutNum, { audioUrl: result.audioUrl, text });
    } catch (err) {
      showToast('TTS 생성 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
    } finally {
      setGenerating(prev => {
        const next = new Set(prev);
        next.delete(cutNum);
        return next;
      });
    }
  }, [getText, onTtsGenerated]);

  const handleGenerateAll = useCallback(async () => {
    // KIE 레이트 리밋 배치: 10개/10초 병렬 제출 (미생성 장면만)
    const targets = scenes.filter(s => !ttsMap[s.cutNum]);
    await runKieBatch(targets, async (s) => {
      await handleGenerate(s.cutNum, s.subtitle);
    }, () => {});
  }, [scenes, ttsMap, handleGenerate]);

  const handlePlay = useCallback((cutNum: number) => {
    const entry = ttsMap[cutNum];
    if (!entry?.audioUrl || !audioRef.current) return;
    if (playingCut === cutNum) {
      audioRef.current.pause();
      setPlayingCut(null);
    } else {
      audioRef.current.src = entry.audioUrl;
      audioRef.current.play().catch((e) => { logger.trackSwallowedError('PreviewNarrationPanel:play', e); });
      setPlayingCut(cutNum);
    }
  }, [ttsMap, playingCut]);

  // Auto-scroll to current scene
  React.useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[currentIdx] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIdx]);

  const generatedCount = Object.keys(ttsMap).length;

  return (
    <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/40">
        <div className="flex items-center gap-2">
          <span className="text-fuchsia-400 text-xs font-bold">나레이션 TTS</span>
          <span className="text-[10px] text-gray-500">{generatedCount}/{scenes.length}</span>
        </div>
        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={generating.size > 0}
          className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/30 hover:bg-fuchsia-600/30 disabled:opacity-50 transition-all"
        >
          {generating.size > 0 ? '생성 중...' : '미생성 전체 생성'}
        </button>
      </div>

      <div ref={listRef} className="max-h-40 overflow-y-auto divide-y divide-gray-700/30">
        {scenes.map((s, i) => {
          const text = getText(s.cutNum, s.subtitle);
          const tts = ttsMap[s.cutNum];
          const isGen = generating.has(s.cutNum);
          const isEditing = editingCut === s.cutNum;
          const isCurrent = i === currentIdx;

          return (
            <div
              key={s.cutNum}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                isCurrent ? 'bg-fuchsia-900/20' : 'hover:bg-gray-800/40'
              }`}
              onClick={() => onSeekToScene(i)}
            >
              <span className="text-[10px] font-bold text-gray-500 w-5 text-right flex-shrink-0">#{s.cutNum}</span>

              {isEditing ? (
                <input
                  type="text"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmEdit(s.cutNum);
                    if (e.key === 'Escape') setEditingCut(null);
                  }}
                  onBlur={() => handleConfirmEdit(s.cutNum)}
                  autoFocus
                  className="flex-1 min-w-0 bg-gray-700 text-gray-100 text-xs rounded px-2 py-1 border border-fuchsia-500 focus:outline-none"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className={`flex-1 min-w-0 truncate ${tts ? 'text-gray-300' : 'text-gray-400'}`}
                  onDoubleClick={(e) => { e.stopPropagation(); handleStartEdit(s.cutNum, s.subtitle); }}
                  title="더블클릭하여 편집"
                >
                  {text}
                </span>
              )}

              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => handleStartEdit(s.cutNum, s.subtitle)}
                    className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                    title="편집"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleGenerate(s.cutNum, s.subtitle)}
                  disabled={isGen}
                  className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                    isGen ? 'text-fuchsia-400 cursor-wait'
                    : tts ? 'text-fuchsia-400 hover:bg-fuchsia-900/40'
                    : 'text-gray-500 hover:text-fuchsia-400 hover:bg-gray-700'
                  }`}
                  title={tts ? '재생성' : '생성'}
                >
                  {isGen ? (
                    <span className="w-3 h-3 border-2 border-fuchsia-400/30 border-t-fuchsia-400 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                    </svg>
                  )}
                </button>

                {tts && (
                  <button
                    type="button"
                    onClick={() => handlePlay(s.cutNum)}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                      playingCut === s.cutNum ? 'text-green-400 bg-green-900/30' : 'text-green-500 hover:bg-green-900/20'
                    }`}
                    title="재생"
                  >
                    {playingCut === s.cutNum ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11" /></svg>
                    )}
                  </button>
                )}

                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  tts ? 'bg-green-400' : isGen ? 'bg-fuchsia-400 animate-pulse' : 'bg-gray-600'
                }`} />
              </div>
            </div>
          );
        })}
      </div>

      <audio ref={audioRef} onEnded={() => setPlayingCut(null)} className="hidden" />
    </div>
  );
};

export default PreviewNarrationPanel;

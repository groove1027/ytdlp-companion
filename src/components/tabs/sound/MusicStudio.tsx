import React, { useState, useCallback, useMemo } from 'react';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import { useSoundStudioStore } from '../../../stores/soundStudioStore';
import { showToast } from '../../../stores/uiStore';
import { useCostStore } from '../../../stores/costStore';
import { useScriptWriterStore } from '../../../stores/scriptWriterStore';
import {
  generateMusic, pollMusicStatus, analyzeMusicForScript, groupMusicByDate,
  boostStyle, extendMusic,
  separateVocals, pollVocalSeparation,
  addInstrumental, addVocals,
} from '../../../services/musicService';
import { evolinkChat } from '../../../services/evolinkService';
import type { EvolinkChatMessage } from '../../../services/evolinkService';
import { uploadMediaToHosting } from '../../../services/uploadService';
import { PRICING } from '../../../constants';
import type { MusicGenerationConfig, SunoModel, LyricsResult, GeneratedMusic } from '../../../types';
import type { MusicAnalysisResult } from '../../../services/musicService';
import {
  GENRE_CATEGORIES, MOOD_TAGS, ENERGY_TAGS, INSTRUMENT_CATEGORIES,
  VOCAL_STYLES, PRODUCTION_TAGS, BPM_PRESETS, DURATION_PRESETS, STRUCTURE_TAGS,
} from '../../../data/sunoData';

/** 오디오 URL에서 실제 duration을 가져오는 헬퍼 (API가 0으로 보고할 때 사용) */
const getAudioDuration = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolve(a.duration || 0); a.src = ''; };
    a.onerror = () => resolve(0);
    a.src = url;
    setTimeout(() => resolve(0), 10000);
  });

/** 연장 단계별 안내 메시지 */
const EXTEND_MESSAGES = [
  '첫 번째 연장을 시작합니다. 곡의 흐름을 이어서 작곡 중...',
  '조금 더 길게 만들고 있어요. AI가 자연스러운 전개를 작곡 중...',
  '거의 다 왔어요! 목표 길이에 맞게 마무리하는 중...',
  '클라이맥스 구간을 만들고 있어요...',
  '엔딩 파트를 정성스럽게 만드는 중...',
  '마지막 디테일을 다듬고 있어요...',
];

/** 자동 연장 — 목표 길이 도달까지 extend 반복 */
const autoExtendToTarget = async (
  result: GeneratedMusic,
  targetDuration: number,
  config: MusicGenerationConfig,
  opts?: {
    onStatus?: (msg: string) => void;
    onProgress?: (pct: number) => void;
    onCost?: () => void;
  }
): Promise<GeneratedMusic> => {
  if (!targetDuration || targetDuration <= 0) return result;

  // API가 duration 0으로 보고하면 실제 오디오에서 duration 가져오기
  let current = result;
  if (current.duration <= 0 && current.audioUrl) {
    const realDur = await getAudioDuration(current.audioUrl);
    if (realDur > 0) current = { ...current, duration: realDur };
  }

  // 이미 목표의 90% 이상이면 바로 리턴
  if (current.duration >= targetDuration * 0.9) return current;

  const audioId = current.audioId || current.id;
  if (!audioId) return current;

  // 목표 길이에 비례해서 MAX_EXTEND 동적 계산 (120초/회 기준, 최소 3, 최대 10)
  const maxExtend = Math.min(10, Math.max(3, Math.ceil(targetDuration / 120)));

  for (let attempt = 1; attempt <= maxExtend; attempt++) {
    const continueAt = Math.max(0, current.duration - 5);
    const pct = Math.round((current.duration / targetDuration) * 100);
    const friendlyMsg = EXTEND_MESSAGES[Math.min(attempt - 1, EXTEND_MESSAGES.length - 1)];
    opts?.onStatus?.(`EXTEND|${attempt}|${maxExtend}|${formatTime(current.duration)}|${formatTime(targetDuration)}|${pct}|${friendlyMsg}`);
    opts?.onProgress?.(pct);

    try {
      const extTaskId = await extendMusic({
        audioId,
        continueAt,
        model: config.sunoModel || 'V5',
        style: config.style || undefined,
        title: config.title || undefined,
      });
      const extResult = await pollMusicStatus(extTaskId);
      opts?.onCost?.();

      // 연장 결과의 duration이 0이면 실제 오디오에서 가져오기
      let extDur = extResult.duration;
      if (extDur <= 0 && extResult.audioUrl) {
        extDur = await getAudioDuration(extResult.audioUrl);
      }
      // 연장했는데 duration이 이전보다 작거나 같으면 누적 추정
      if (extDur <= current.duration) {
        extDur = current.duration + Math.max(60, extDur);
      }

      current = { ...extResult, duration: extDur, audioId: extResult.audioId || audioId };

      if (current.duration >= targetDuration * 0.9) break;
    } catch {
      break;
    }
  }

  opts?.onStatus?.('');
  opts?.onProgress?.(100);
  return current;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

const SUNO_MODELS: { id: SunoModel; label: string; desc: string }[] = [
  { id: 'V5', label: 'V5', desc: '최고 음질, 빠른 생성' },
  { id: 'V4_5PLUS', label: 'V4.5+', desc: '풍부한 사운드, 최대 8분' },
  { id: 'V4_5', label: 'V4.5', desc: '스마트 프롬프트, 최대 8분' },
  { id: 'V4_5ALL', label: 'V4.5 ALL', desc: '범용, 최대 8분' },
  { id: 'V4', label: 'V4', desc: '보컬 특화, 최대 4분' },
];

type ScriptSource = 'from-script' | 'manual';
type StudioTab = 'generate' | 'lyrics' | 'tools';
const TABS: { id: StudioTab; label: string; icon: string }[] = [
  { id: 'generate', label: '음악 생성', icon: '🎵' },
  { id: 'lyrics', label: '가사 생성', icon: '✍️' },
  { id: 'tools', label: '도구', icon: '🔧' },
];

/* ═══════ 토글 태그 칩 ═══════ */
const TagChip: React.FC<{ label: string; active: boolean; onClick: () => void; color?: string }> = ({ label, active, onClick, color = 'purple' }) => (
  <button type="button" onClick={onClick}
    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all whitespace-nowrap ${
      active ? `bg-${color}-600/30 text-${color}-300 border-${color}-500/50` : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-300'
    }`}>{label}</button>
);

/* ═══════ 접이식 섹션 ═══════ */
const Section: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: string }> = ({ title, children, defaultOpen = false, badge }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-700/50 rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-900/40 hover:bg-gray-800/60 transition-colors text-left">
        <span className={`text-[10px] text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        <span className="text-xs font-bold text-gray-300 flex-1">{title}</span>
        {badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-500/30">{badge}</span>}
      </button>
      {open && <div className="px-3 py-2.5 space-y-2">{children}</div>}
    </div>
  );
};

/* ═══════ 가사 생성 탭 ═══════ */
const LyricsTab: React.FC = () => {
  const lyricsPrompt = useSoundStudioStore((s) => s.lyricsPrompt);
  const setLyricsPrompt = useSoundStudioStore((s) => s.setLyricsPrompt);
  const generatedLyrics = useSoundStudioStore((s) => s.generatedLyrics);
  const setGeneratedLyrics = useSoundStudioStore((s) => s.setGeneratedLyrics);
  const isGeneratingLyrics = useSoundStudioStore((s) => s.isGeneratingLyrics);
  const setIsGeneratingLyrics = useSoundStudioStore((s) => s.setIsGeneratingLyrics);
  const setMusicStudioTab = useSoundStudioStore((s) => s.setMusicStudioTab);
  const [error, setError] = useState('');
  const elapsedLyrics = useElapsedTimer(isGeneratingLyrics);

  const handleGenerate = useCallback(async () => {
    if (!lyricsPrompt.trim() || isGeneratingLyrics) return;
    setIsGeneratingLyrics(true); setError('');
    try {
      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: `너는 전문 작사가다. 사용자의 요청을 바탕으로 Suno AI 음악 생성에 최적화된 가사를 작성한다.
규칙:
- [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro] 등 구조 태그를 반드시 포함
- 각 섹션은 4~8줄
- 라임(Rhyme)과 리듬감을 살린다
- 한국어 가사가 기본이며, 사용자가 영어를 요청하면 영어로 작성
- 3가지 서로 다른 스타일의 가사 변형을 생성 (각각 제목 포함)
- 출력 형식: 각 변형을 "---VARIATION---" 구분자로 나누고, 첫 줄에 "제목: [제목]"을 쓴 뒤 가사를 이어서 작성` },
        { role: 'user', content: `다음 주제/분위기로 가사 3가지 변형을 작성해줘:\n\n${lyricsPrompt}` },
      ];
      const response = await evolinkChat(messages, { temperature: 0.8, maxTokens: 3000 });
      const raw = response.choices[0]?.message?.content || '';
      // 파싱: ---VARIATION--- 구분자로 나누기
      const variations = raw.split(/---\s*VARIATION\s*---/i).map(s => s.trim()).filter(Boolean);
      const results = variations.map(v => {
        const titleMatch = v.match(/^제목:\s*(.+)/m);
        const title = titleMatch ? titleMatch[1].trim() : '';
        const text = titleMatch ? v.replace(/^제목:\s*.+\n?/m, '').trim() : v;
        return { title, text };
      });
      if (results.length === 0) results.push({ title: '', text: raw });
      setGeneratedLyrics(results);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setIsGeneratingLyrics(false); }
  }, [lyricsPrompt, isGeneratingLyrics, setIsGeneratingLyrics, setGeneratedLyrics]);

  const handleApply = useCallback((lr: LyricsResult) => {
    useSoundStudioStore.getState().setMusicStudioTab('generate');
    sessionStorage.setItem('SUNO_APPLY_LYRICS', JSON.stringify(lr));
    setMusicStudioTab('generate');
  }, [setMusicStudioTab]);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-gray-400 font-semibold block mb-1">주제 / 분위기 설명</label>
        <p className="text-xs text-gray-500 mb-1.5">원하는 가사의 주제, 분위기, 키워드를 입력하세요 (최대 200자)</p>
        <textarea value={lyricsPrompt} onChange={(e) => setLyricsPrompt(e.target.value.slice(0, 200))}
          placeholder="예: 별이 빛나는 밤, 첫사랑의 설렘, 희망적인 분위기..." rows={3}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none" />
        <p className="text-xs text-gray-600 text-right">{lyricsPrompt.length}/200</p>
      </div>

      {/* 구조 태그 퀵 삽입 */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">구조 태그 (클릭하여 삽입)</label>
        <div className="flex flex-wrap gap-1">
          {STRUCTURE_TAGS.map((tag) => (
            <button key={tag} type="button"
              onClick={() => {
                const cur = useSoundStudioStore.getState().lyricsPrompt;
                setLyricsPrompt(cur + (cur.endsWith('\n') || !cur ? '' : '\n') + tag + '\n');
              }}
              className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400 border border-gray-700 hover:border-purple-500/50 hover:text-purple-300 transition-colors">
              {tag}
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={handleGenerate} disabled={!lyricsPrompt.trim() || isGeneratingLyrics}
        className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
          disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2">
        {isGeneratingLyrics ? (<><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> AI 가사 생성 중...{elapsedLyrics > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedLyrics)}</span>}</>) : '🎤 AI 가사 생성'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {generatedLyrics.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-gray-300">생성된 가사 ({generatedLyrics.length}개 변형)</h4>
          {generatedLyrics.map((lr, idx) => (
            <div key={idx} className="bg-gray-900/80 rounded-lg border border-gray-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-400">가사 {idx + 1}</span>
                {lr.title && <span className="text-xs text-gray-400 truncate ml-2">{lr.title}</span>}
              </div>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">{lr.text}</pre>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => navigator.clipboard.writeText(lr.text).then(() => showToast('클립보드에 복사되었습니다.')).catch(() => {})}
                  className="px-3 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition-colors">📋 복사</button>
                <button type="button" onClick={() => handleApply(lr)}
                  className="px-3 py-1 rounded text-xs bg-purple-600/20 text-purple-300 hover:bg-purple-600/40 border border-purple-500/30 transition-colors">🎵 적용</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════ 도구 탭 ═══════ */

/** 파일 업로드 → Cloudinary → URL 반환 헬퍼 */
const useFileUpload = (onUrl: (url: string) => void, onError: (msg: string) => void) => {
  const [isUploading, setIsUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleFile = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadMediaToHosting(file);
      onUrl(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [onUrl, onError]);
  return { inputRef, isUploading, handleFile };
};

const ToolsTab: React.FC = () => {
  const musicLibrary = useSoundStudioStore((s) => s.musicLibrary);
  const allTracks = useMemo(() => musicLibrary.flatMap((g) => g.tracks), [musicLibrary]);
  const vocalSepTarget = useSoundStudioStore((s) => s.vocalSepTarget);
  const setVocalSepTarget = useSoundStudioStore((s) => s.setVocalSepTarget);
  const vocalSepResult = useSoundStudioStore((s) => s.vocalSepResult);
  const setVocalSepResult = useSoundStudioStore((s) => s.setVocalSepResult);
  const isVocalSeparating = useSoundStudioStore((s) => s.isVocalSeparating);
  const setIsVocalSeparating = useSoundStudioStore((s) => s.setIsVocalSeparating);
  const [instrumentalUrl, setInstrumentalUrl] = useState('');
  const [instrumentalTitle, setInstrumentalTitle] = useState('');
  const [instrumentalTags, setInstrumentalTags] = useState('');
  const [isAddingInstrumental, setIsAddingInstrumental] = useState(false);
  const [vocalUrl, setVocalUrl] = useState('');
  const [vocalPrompt, setVocalPrompt] = useState('');
  const [vocalTitle, setVocalTitle] = useState('');
  const [vocalStyleInput, setVocalStyleInput] = useState('');
  const [isAddingVocal, setIsAddingVocal] = useState(false);
  const [toolError, setToolError] = useState('');
  const [toolSuccess, setToolSuccess] = useState('');
  const [uploadSepFile, setUploadSepFile] = useState<string>('');
  const [uploadSepStatus, setUploadSepStatus] = useState('');
  const [isUploadSeparating, setIsUploadSeparating] = useState(false);
  const [uploadSepResult, setUploadSepResult] = useState<{ vocalUrl: string; instrumentalUrl: string } | null>(null);

  // 파일 업로드 → 등록 → 보컬 분리 (자동 파이프라인)
  const sepUpload = useFileUpload(
    useCallback((url: string) => { setUploadSepFile(url); setToolSuccess('파일 업로드 완료! 분리 실행 버튼을 눌러주세요.'); }, []),
    useCallback((msg: string) => setToolError(msg), [])
  );

  const handleUploadSeparation = useCallback(async () => {
    if (!uploadSepFile || isUploadSeparating) return;
    setIsUploadSeparating(true);
    setUploadSepResult(null);
    setToolError('');
    try {
      // Step 1: Suno에 반주로 등록
      setUploadSepStatus('Suno에 트랙 등록 중...');
      const regTaskId = await addInstrumental({ uploadUrl: uploadSepFile, title: 'Upload for Separation', tags: '' });

      // Step 2: 등록 완료 대기 → audioId 획득
      setUploadSepStatus('트랙 등록 대기 중...');
      const registered = await pollMusicStatus(regTaskId);
      if (!registered.audioId) throw new Error('등록된 트랙에서 audioId를 가져올 수 없습니다.');

      // Step 3: 보컬/MR 분리 실행
      setUploadSepStatus('보컬/MR 분리 중...');
      const sepTaskId = await separateVocals({ taskId: registered.id, audioId: registered.audioId });

      // Step 4: 분리 결과 대기
      const result = await pollVocalSeparation(sepTaskId);
      setUploadSepResult(result);
      setUploadSepStatus('');
      setToolSuccess('파일 보컬/MR 분리 완료!');
    } catch (e: unknown) {
      setToolError(e instanceof Error ? e.message : String(e));
      setUploadSepStatus('');
    } finally {
      setIsUploadSeparating(false);
    }
  }, [uploadSepFile, isUploadSeparating]);

  // 파일 업로드 hooks
  const instUpload = useFileUpload(
    useCallback((url: string) => { setInstrumentalUrl(url); setToolSuccess('음원 업로드 완료!'); }, []),
    useCallback((msg: string) => setToolError(msg), [])
  );
  const vocalUpload = useFileUpload(
    useCallback((url: string) => { setVocalUrl(url); setToolSuccess('음원 업로드 완료!'); }, []),
    useCallback((msg: string) => setToolError(msg), [])
  );

  const handleVocalSeparation = useCallback(async () => {
    if (!vocalSepTarget || isVocalSeparating) return;
    if (!vocalSepTarget.audioId) { setToolError('이 트랙은 audioId가 없어 보컬 분리를 할 수 없습니다.'); return; }
    setIsVocalSeparating(true); setVocalSepResult(null); setToolError('');
    try {
      const taskId = await separateVocals({ taskId: vocalSepTarget.id, audioId: vocalSepTarget.audioId });
      const result = await pollVocalSeparation(taskId);
      setVocalSepResult(result); setToolSuccess('보컬/MR 분리 완료!');
    } catch (e: unknown) { setToolError(e instanceof Error ? e.message : String(e)); }
    finally { setIsVocalSeparating(false); }
  }, [vocalSepTarget, isVocalSeparating, setIsVocalSeparating, setVocalSepResult]);

  const handleAddInstrumental = useCallback(async () => {
    if (!instrumentalUrl.trim() || isAddingInstrumental) return;
    setIsAddingInstrumental(true); setToolError('');
    try {
      const taskId = await addInstrumental({ uploadUrl: instrumentalUrl, title: instrumentalTitle || 'Instrumental Track', tags: instrumentalTags });
      setToolSuccess(`반주 추가 작업 시작됨 (taskId: ${taskId})`);
      setInstrumentalUrl(''); setInstrumentalTitle(''); setInstrumentalTags('');
    } catch (e: unknown) { setToolError(e instanceof Error ? e.message : String(e)); }
    finally { setIsAddingInstrumental(false); }
  }, [instrumentalUrl, instrumentalTitle, instrumentalTags, isAddingInstrumental]);

  const handleAddVocal = useCallback(async () => {
    if (!vocalUrl.trim() || isAddingVocal) return;
    setIsAddingVocal(true); setToolError('');
    try {
      const taskId = await addVocals({ uploadUrl: vocalUrl, prompt: vocalPrompt, title: vocalTitle || 'Vocal Track', style: vocalStyleInput });
      setToolSuccess(`보컬 추가 작업 시작됨 (taskId: ${taskId})`);
      setVocalUrl(''); setVocalPrompt(''); setVocalTitle(''); setVocalStyleInput('');
    } catch (e: unknown) { setToolError(e instanceof Error ? e.message : String(e)); }
    finally { setIsAddingVocal(false); }
  }, [vocalUrl, vocalPrompt, vocalTitle, vocalStyleInput, isAddingVocal]);

  const selectCls = 'w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 focus:outline-none focus:border-purple-500';
  const inputCls = 'px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500';

  return (
    <div className="space-y-4">
      {toolError && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg text-sm text-red-400 flex justify-between">
          <span>{toolError}</span><button type="button" onClick={() => setToolError('')} className="text-red-400/60 hover:text-red-300">&times;</button>
        </div>
      )}
      {toolSuccess && (
        <div className="px-3 py-2 bg-green-900/30 border border-green-500/50 rounded-lg text-sm text-green-400 flex justify-between">
          <span>{toolSuccess}</span><button type="button" onClick={() => setToolSuccess('')} className="text-green-400/60 hover:text-green-300">&times;</button>
        </div>
      )}
      {/* 보컬/MR 분리 — 파일 업로드 */}
      <div className="bg-gray-900/60 rounded-lg border border-teal-700/40 p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-200">♻️ 보컬/MR 분리 — 파일 업로드</h4>
        <p className="text-xs text-gray-500">내 오디오 파일을 업로드하면 보컬과 MR(반주)을 자동으로 분리합니다.</p>
        <div className="flex gap-2">
          <input type="text" value={uploadSepFile} onChange={(e) => setUploadSepFile(e.target.value)} placeholder="오디오 URL 또는 파일 업로드" className={`flex-1 ${inputCls}`} />
          <input type="file" ref={sepUpload.inputRef} onChange={sepUpload.handleFile} accept="audio/*" className="hidden" />
          <button type="button" onClick={() => sepUpload.inputRef.current?.click()} disabled={sepUpload.isUploading}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 border border-gray-600 hover:border-teal-500/50 hover:text-teal-300 text-xs font-semibold transition-all shrink-0 disabled:opacity-40">
            {sepUpload.isUploading ? '업로드...' : '파일 선택'}
          </button>
        </div>
        <button type="button" onClick={handleUploadSeparation} disabled={!uploadSepFile.trim() || isUploadSeparating}
          className="w-full py-2 bg-teal-600/20 text-teal-300 border border-teal-500/30 hover:bg-teal-600/40 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2">
          {isUploadSeparating ? (<><span className="w-3 h-3 border-2 border-teal-300/30 border-t-teal-300 rounded-full animate-spin" /> {uploadSepStatus || '처리 중...'}</>) : '보컬/MR 분리 실행'}
        </button>
        {uploadSepResult && (
          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold text-green-400">분리 완료!</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 shrink-0 w-20">🎤 보컬:</span><audio controls src={uploadSepResult.vocalUrl} className="flex-1 h-8" /></div>
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 shrink-0 w-20">🎸 MR:</span><audio controls src={uploadSepResult.instrumentalUrl} className="flex-1 h-8" /></div>
            </div>
          </div>
        )}
      </div>

      {/* 보컬/MR 분리 — 라이브러리 트랙 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-700 p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-200">♻️ 보컬/MR 분리 — 라이브러리 트랙</h4>
        <p className="text-xs text-gray-500">생성된 라이브러리 트랙에서 보컬과 MR을 분리합니다.</p>
        <select value={vocalSepTarget?.id || ''} onChange={(e) => { const t = allTracks.find((t) => t.id === e.target.value) || null; setVocalSepTarget(t); setVocalSepResult(null); }} className={selectCls}>
          <option value="">{allTracks.length === 0 ? '라이브러리에 트랙이 없습니다' : '트랙 선택...'}</option>
          {allTracks.map((t) => <option key={t.id} value={t.id}>{t.title} ({Math.floor(t.duration / 60)}:{String(Math.floor(t.duration % 60)).padStart(2, '0')})</option>)}
        </select>
        <button type="button" onClick={handleVocalSeparation} disabled={!vocalSepTarget || isVocalSeparating}
          className="w-full py-2 bg-teal-600/20 text-teal-300 border border-teal-500/30 hover:bg-teal-600/40 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2">
          {isVocalSeparating ? (<><span className="w-3 h-3 border-2 border-teal-300/30 border-t-teal-300 rounded-full animate-spin" /> 분리 중...</>) : '보컬/MR 분리 실행'}
        </button>
        {vocalSepResult && (
          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold text-green-400">분리 완료!</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 shrink-0 w-20">🎤 보컬:</span><audio controls src={vocalSepResult.vocalUrl} className="flex-1 h-8" /></div>
              <div className="flex items-center gap-2"><span className="text-xs text-gray-400 shrink-0 w-20">🎸 MR:</span><audio controls src={vocalSepResult.instrumentalUrl} className="flex-1 h-8" /></div>
            </div>
          </div>
        )}
      </div>
      {/* 반주 추가 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-700 p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-200">🎸 반주 추가</h4>
        <div className="flex gap-2">
          <input type="text" value={instrumentalUrl} onChange={(e) => setInstrumentalUrl(e.target.value)} placeholder="오디오 URL" className={`flex-1 ${inputCls}`} />
          <input type="file" ref={instUpload.inputRef} onChange={instUpload.handleFile} accept="audio/*" className="hidden" />
          <button type="button" onClick={() => instUpload.inputRef.current?.click()} disabled={instUpload.isUploading}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 border border-gray-600 hover:border-orange-500/50 hover:text-orange-300 text-xs font-semibold transition-all shrink-0 disabled:opacity-40">
            {instUpload.isUploading ? '업로드...' : '파일 업로드'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={instrumentalTitle} onChange={(e) => setInstrumentalTitle(e.target.value)} placeholder="제목" className={inputCls} />
          <input type="text" value={instrumentalTags} onChange={(e) => setInstrumentalTags(e.target.value)} placeholder="스타일 태그" className={inputCls} />
        </div>
        <button type="button" onClick={handleAddInstrumental} disabled={!instrumentalUrl.trim() || isAddingInstrumental}
          className="w-full py-2 bg-orange-600/20 text-orange-300 border border-orange-500/30 hover:bg-orange-600/40 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-all">
          {isAddingInstrumental ? '처리 중...' : '반주 추가'}</button>
      </div>
      {/* 보컬 추가 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-700 p-4 space-y-3">
        <h4 className="text-sm font-bold text-gray-200">🎤 보컬 추가</h4>
        <div className="flex gap-2">
          <input type="text" value={vocalUrl} onChange={(e) => setVocalUrl(e.target.value)} placeholder="인스트루멘탈 URL" className={`flex-1 ${inputCls}`} />
          <input type="file" ref={vocalUpload.inputRef} onChange={vocalUpload.handleFile} accept="audio/*" className="hidden" />
          <button type="button" onClick={() => vocalUpload.inputRef.current?.click()} disabled={vocalUpload.isUploading}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 border border-gray-600 hover:border-pink-500/50 hover:text-pink-300 text-xs font-semibold transition-all shrink-0 disabled:opacity-40">
            {vocalUpload.isUploading ? '업로드...' : '파일 업로드'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={vocalTitle} onChange={(e) => setVocalTitle(e.target.value)} placeholder="제목" className={inputCls} />
          <input type="text" value={vocalStyleInput} onChange={(e) => setVocalStyleInput(e.target.value)} placeholder="보컬 스타일" className={inputCls} />
        </div>
        <textarea value={vocalPrompt} onChange={(e) => setVocalPrompt(e.target.value)} placeholder="가사 또는 보컬 설명..." rows={2}
          className={`w-full ${inputCls} resize-none`} />
        <button type="button" onClick={handleAddVocal} disabled={!vocalUrl.trim() || isAddingVocal}
          className="w-full py-2 bg-pink-600/20 text-pink-300 border border-pink-500/30 hover:bg-pink-600/40 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-all">
          {isAddingVocal ? '처리 중...' : '보컬 추가'}</button>
      </div>
    </div>
  );
};

/* ═══════ 메인 음악 생성 탭 (대폭 강화) ═══════ */
const GenerateTab: React.FC = () => {
  const addCost = useCostStore((s) => s.addCost);
  const setMusicConfig = useSoundStudioStore((s) => s.setMusicConfig);
  const setIsGeneratingMusic = useSoundStudioStore((s) => s.setIsGeneratingMusic);
  const isGeneratingMusic = useSoundStudioStore((s) => s.isGeneratingMusic);
  const addToLibrary = useSoundStudioStore((s) => s.addToLibrary);
  const favoriteModels = useSoundStudioStore((s) => s.favoriteModels);
  const toggleFavoriteModel = useSoundStudioStore((s) => s.toggleFavoriteModel);
  const finalScript = useScriptWriterStore((s) => s.finalScript);
  const generatedScriptContent = useScriptWriterStore((s) => s.generatedScript?.content);
  const storeScript = finalScript || generatedScriptContent || '';

  // Zustand 상태 (탭 이동 시 보존)
  const genTab = useSoundStudioStore((s) => s.genTabState);
  const updateGen = useSoundStudioStore((s) => s.updateGenTabState);
  const { sunoModel, scriptSource, manualScript, title, prompt, musicType, bpm, duration, batchCount,
    selectedGenres, selectedMoods, selectedEnergy, selectedInstruments, selectedVocalTags, selectedProduction,
    customTags, negativeTags, styleWeight, weirdnessConstraint, audioWeight, analysis, isAnalyzing } = genTab;

  // 편의 setter (updateGen 래퍼)
  const setSunoModel = useCallback((v: SunoModel) => updateGen({ sunoModel: v }), [updateGen]);
  const setScriptSource = useCallback((v: ScriptSource) => updateGen({ scriptSource: v }), [updateGen]);
  const setManualScript = useCallback((v: string) => updateGen({ manualScript: v }), [updateGen]);
  const setTitle = useCallback((v: string) => updateGen({ title: v }), [updateGen]);
  const setPrompt = useCallback((v: string) => updateGen({ prompt: v }), [updateGen]);
  const setMusicType = useCallback((v: 'vocal' | 'instrumental') => updateGen({ musicType: v }), [updateGen]);
  const setBpm = useCallback((v: number) => updateGen({ bpm: v }), [updateGen]);
  const setDuration = useCallback((v: number | ((prev: number) => number)) => {
    if (typeof v === 'function') {
      const cur = useSoundStudioStore.getState().genTabState.duration;
      updateGen({ duration: v(cur) });
    } else updateGen({ duration: v });
  }, [updateGen]);
  const setBatchCount = useCallback((v: number) => updateGen({ batchCount: v }), [updateGen]);
  const setSelectedGenres = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    if (typeof v === 'function') {
      const cur = useSoundStudioStore.getState().genTabState.selectedGenres;
      updateGen({ selectedGenres: v(cur) });
    } else updateGen({ selectedGenres: v });
  }, [updateGen]);
  const setSelectedMoods = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    if (typeof v === 'function') {
      const cur = useSoundStudioStore.getState().genTabState.selectedMoods;
      updateGen({ selectedMoods: v(cur) });
    } else updateGen({ selectedMoods: v });
  }, [updateGen]);
  const setSelectedEnergy = useCallback((v: string) => updateGen({ selectedEnergy: v }), [updateGen]);
  const setSelectedInstruments = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    if (typeof v === 'function') {
      const cur = useSoundStudioStore.getState().genTabState.selectedInstruments;
      updateGen({ selectedInstruments: v(cur) });
    } else updateGen({ selectedInstruments: v });
  }, [updateGen]);
  const setSelectedVocalTags = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    if (typeof v === 'function') {
      const cur = useSoundStudioStore.getState().genTabState.selectedVocalTags;
      updateGen({ selectedVocalTags: v(cur) });
    } else updateGen({ selectedVocalTags: v });
  }, [updateGen]);
  const setSelectedProduction = useCallback((v: string[] | ((prev: string[]) => string[])) => {
    if (typeof v === 'function') {
      const cur = useSoundStudioStore.getState().genTabState.selectedProduction;
      updateGen({ selectedProduction: v(cur) });
    } else updateGen({ selectedProduction: v });
  }, [updateGen]);
  const setCustomTags = useCallback((v: string) => updateGen({ customTags: v }), [updateGen]);
  const setNegativeTags = useCallback((v: string) => updateGen({ negativeTags: v }), [updateGen]);
  const setStyleWeight = useCallback((v: number) => updateGen({ styleWeight: v }), [updateGen]);
  const setWeirdnessConstraint = useCallback((v: number) => updateGen({ weirdnessConstraint: v }), [updateGen]);
  const setAudioWeight = useCallback((v: number) => updateGen({ audioWeight: v }), [updateGen]);
  const setIsAnalyzing = useCallback((v: boolean) => updateGen({ isAnalyzing: v }), [updateGen]);
  const setAnalysis = useCallback((v: MusicAnalysisResult | null) => updateGen({ analysis: v }), [updateGen]);

  // 로컬 전용 상태 (탭 전환 시 초기화되어도 무방)
  const [isBoosting, setIsBoosting] = useState(false);
  const [genreSearch, setGenreSearch] = useState('');
  const [activeGenreCategory, setActiveGenreCategory] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [progress, setProgress] = useState(0);
  const [batchStatus, setBatchStatus] = useState({ completed: 0, failed: 0, total: 0 });
  const [extendStatus, setExtendStatus] = useState('');
  const elapsedAnalyze = useElapsedTimer(isAnalyzing);
  const elapsedMusic = useElapsedTimer(isGeneratingMusic);

  const activeScript = scriptSource === 'from-script' ? storeScript : manualScript;
  const maxDuration = sunoModel === 'V5' || sunoModel === 'V4' ? 240 : 480;

  // 토글 헬퍼
  const toggleArr = useCallback((arr: string[], val: string, setter: (v: string[] | ((prev: string[]) => string[])) => void, max = 5) => {
    setter((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : prev.length < max ? [...prev, val] : prev);
  }, []);

  // 스타일 문자열 조합
  const builtStyle = useMemo(() => {
    const parts: string[] = [];
    parts.push(...selectedGenres);
    parts.push(...selectedMoods);
    if (selectedEnergy) parts.push(selectedEnergy);
    parts.push(...selectedInstruments);
    parts.push(...selectedVocalTags);
    parts.push(...selectedProduction);
    if (customTags.trim()) parts.push(...customTags.split(',').map((s) => s.trim()).filter(Boolean));
    if (bpm) parts.push(`bpm ${bpm}`);
    return parts.join(', ');
  }, [selectedGenres, selectedMoods, selectedEnergy, selectedInstruments, selectedVocalTags, selectedProduction, customTags, bpm]);

  // 장르 필터
  const filteredCategories = useMemo(() => {
    if (!genreSearch.trim()) return GENRE_CATEGORIES;
    const q = genreSearch.toLowerCase();
    return GENRE_CATEGORIES.map((cat) => ({
      ...cat,
      genres: cat.genres.filter((g) => g.toLowerCase().includes(q)),
    })).filter((cat) => cat.genres.length > 0);
  }, [genreSearch]);

  // 가사 탭에서 적용된 가사
  React.useEffect(() => {
    const applied = sessionStorage.getItem('SUNO_APPLY_LYRICS');
    if (applied) {
      try {
        const lr = JSON.parse(applied) as { title?: string; text: string };
        if (lr.text) setPrompt(lr.text);
        if (lr.title) setTitle(lr.title);
        setMusicType('vocal');
      } catch { /* ignore */ }
      sessionStorage.removeItem('SUNO_APPLY_LYRICS');
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!activeScript.trim() || isAnalyzing) return;
    setIsAnalyzing(true); setAnalyzeError('');
    try {
      const result = await analyzeMusicForScript(activeScript);
      setAnalysis(result);
      // 1순위 컨셉 자동 적용
      applyConcept(result.concepts?.[0] || null, result);
    } catch (e: unknown) { setAnalyzeError(`분석 실패: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setIsAnalyzing(false); }
  }, [activeScript, isAnalyzing]);

  const applyConcept = useCallback((concept: import('../../../services/musicService').MusicConcept | null, fallback?: MusicAnalysisResult) => {
    if (concept) {
      setSelectedGenres([concept.genre, concept.subGenre].filter(Boolean));
      setSelectedMoods(concept.mood ? concept.mood.split(',').map((s) => s.trim()).slice(0, 3) : []);
      setBpm(concept.bpm);
      setMusicType(concept.musicType);
      setPrompt(concept.sunoPrompt);
      if (concept.title) setTitle(concept.title);
      if (concept.instrumentTags?.length) setSelectedInstruments(concept.instrumentTags.slice(0, 5));
      if (concept.productionTags?.length) setSelectedProduction(concept.productionTags.slice(0, 3));
      if (concept.energyLevel) setSelectedEnergy(concept.energyLevel);
      if (concept.negativeTags) setNegativeTags(concept.negativeTags);
      if (concept.vocalStyle && concept.vocalStyle !== 'none') {
        setSelectedVocalTags([concept.vocalStyle]);
      }
    } else if (fallback) {
      setSelectedGenres([fallback.genre, fallback.subGenre].filter(Boolean));
      setSelectedMoods(fallback.mood ? fallback.mood.split(',').map((s) => s.trim()).slice(0, 3) : []);
      setBpm(fallback.bpm);
      setMusicType(fallback.musicType);
      setPrompt(fallback.prompt);
      if (fallback.title) setTitle(fallback.title);
      if (fallback.instrumentTags?.length) setSelectedInstruments(fallback.instrumentTags.slice(0, 5));
    }
  }, []);

  const handleStyleBoost = useCallback(async () => {
    if (!builtStyle || isBoosting) return;
    setIsBoosting(true);
    try {
      const boosted = await boostStyle(builtStyle);
      setCustomTags(boosted);
    } catch { /* ignore */ }
    finally { setIsBoosting(false); }
  }, [builtStyle, isBoosting]);

  const handleGenerate = useCallback(async () => {
    if (isGeneratingMusic) return;
    const count = Math.max(1, Math.min(50, batchCount));
    // AI 분석의 styleTagsFull이 있으면 우선 사용
    const effectiveStyle = analysis?.styleTagsFull || builtStyle;
    const baseConfig: MusicGenerationConfig = {
      prompt,
      style: effectiveStyle,
      title: title || 'Untitled Track',
      sunoModel,
      genre: selectedGenres[0] || '',
      subGenre: selectedGenres[1] || '',
      musicType,
      bpm,
      customTags: [...selectedInstruments, ...selectedProduction, ...selectedVocalTags],
      duration: duration > 0 ? duration : undefined,
      count,
      negativeTags: negativeTags || undefined,
      styleWeight: styleWeight !== 0.5 ? styleWeight : undefined,
      weirdnessConstraint: weirdnessConstraint !== 0.5 ? weirdnessConstraint : undefined,
      audioWeight: audioWeight !== 0.5 ? audioWeight : undefined,
    };
    setMusicConfig(baseConfig);
    setIsGeneratingMusic(true); setGenerateError(''); setProgress(0);
    setBatchStatus({ completed: 0, failed: 0, total: count });

    const requestedDuration = baseConfig.duration || 0;
    const extendOpts = {
      onStatus: (msg: string) => setExtendStatus(msg),
      onProgress: (pct: number) => setProgress(pct),
      onCost: () => addCost(PRICING.MUSIC_SUNO_PER_TRACK, 'music'),
    };

    if (count === 1) {
      try {
        if (requestedDuration > 180) {
          setExtendStatus(`INIT|${formatTime(requestedDuration)}|AI가 ${formatTime(requestedDuration)} 길이의 음악을 작곡하기 시작했어요. 먼저 기본 트랙을 만든 후, 목표 길이까지 자동으로 연장합니다.`);
        }
        const taskId = await generateMusic(baseConfig);
        let result = await pollMusicStatus(taskId, undefined, (p) => setProgress(p));
        addCost(PRICING.MUSIC_SUNO_PER_TRACK, 'music');

        // 자동 연장: 목표 길이 미달 시 extend 반복
        if (requestedDuration > 0) {
          result = await autoExtendToTarget(result, requestedDuration, baseConfig, extendOpts);
        }

        setExtendStatus('');
        if (requestedDuration > 180 && result.duration > 0) {
          showToast(`${formatTime(result.duration)} 길이의 음악이 완성되었습니다!`, 4000);
        }
        const grouped = groupMusicByDate([result]);
        if (grouped.length > 0) addToLibrary(grouped[0]);
        setBatchStatus({ completed: 1, failed: 0, total: 1 });
      } catch (e: unknown) {
        setGenerateError(`음악 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
        setBatchStatus({ completed: 0, failed: 1, total: 1 });
      } finally { setIsGeneratingMusic(false); setProgress(0); setExtendStatus(''); }
    } else {
      const PARALLEL = 10;
      const queue = Array.from({ length: count }, (_, i) => i);
      const active: Promise<void>[] = [];
      let completed = 0, failed = 0;
      const allResults: GeneratedMusic[] = [];
      const processOne = async (idx: number) => {
        const cfg = { ...baseConfig, title: count > 1 ? `${baseConfig.title} #${idx + 1}` : baseConfig.title };
        try {
          const taskId = await generateMusic(cfg);
          let result = await pollMusicStatus(taskId);
          addCost(PRICING.MUSIC_SUNO_PER_TRACK, 'music');

          // 배치 모드에서도 자동 연장
          if (requestedDuration > 0) {
            result = await autoExtendToTarget(result, requestedDuration, cfg, {
              onCost: () => addCost(PRICING.MUSIC_SUNO_PER_TRACK, 'music'),
            });
          }

          allResults.push(result);
          completed++;
        } catch { failed++; }
        setBatchStatus({ completed, failed, total: count });
        setProgress(Math.round(((completed + failed) / count) * 100));
      };
      while (queue.length > 0 || active.length > 0) {
        while (queue.length > 0 && active.length < PARALLEL) {
          const idx = queue.shift()!;
          const p = processOne(idx).finally(() => { const i = active.indexOf(p); if (i > -1) active.splice(i, 1); });
          active.push(p);
          await new Promise(r => setTimeout(r, 200));
        }
        if (active.length > 0) await Promise.race(active);
      }
      if (allResults.length > 0) groupMusicByDate(allResults).forEach((g) => addToLibrary(g));
      if (failed > 0) setGenerateError(`${count}곡 중 ${failed}곡 실패, ${completed}곡 완료`);
      setIsGeneratingMusic(false); setProgress(0);
    }
  }, [isGeneratingMusic, prompt, builtStyle, title, sunoModel, selectedGenres, musicType, bpm, duration, batchCount,
    selectedInstruments, selectedProduction, selectedVocalTags, negativeTags, styleWeight, weirdnessConstraint, audioWeight,
    analysis, setMusicConfig, setIsGeneratingMusic, addToLibrary]);

  return (
    <div className="space-y-4">
      {/* ── 모델 선택 ── */}
      <div>
        <label className="text-xs text-gray-400 font-bold block mb-1.5">SUNO 모델</label>
        <div className="flex flex-wrap gap-1.5">
          {useMemo(() => [...SUNO_MODELS].sort((a, b) => {
            const aF = favoriteModels.includes(a.id) ? 0 : 1;
            const bF = favoriteModels.includes(b.id) ? 0 : 1;
            return aF - bF;
          }), [favoriteModels]).map((m) => {
            const isFav = favoriteModels.includes(m.id);
            return (
              <div key={m.id} className="flex items-center gap-0.5">
                <button type="button" onClick={(e) => { e.stopPropagation(); toggleFavoriteModel(m.id); }}
                  className={`text-sm leading-none transition-colors ${isFav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}>
                  {isFav ? '\u2605' : '\u2606'}
                </button>
                <button type="button" onClick={() => { setSunoModel(m.id); setDuration((prev) => Math.min(prev, m.id === 'V5' || m.id === 'V4' ? 240 : 480)); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    sunoModel === m.id ? 'bg-pink-600/30 text-pink-300 border-pink-500/50' :
                    isFav ? 'bg-yellow-900/20 text-yellow-300 border-yellow-500/30' : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
                  {m.label}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 mt-1">{SUNO_MODELS.find((m) => m.id === sunoModel)?.desc}</p>
      </div>

      {/* ── AI 대본 분석 ── */}
      <Section title="AI 대본 분석" badge={analysis ? '추천 완료' : undefined}>
        <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700 w-fit mb-2">
          <button type="button" onClick={() => setScriptSource('from-script')}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${scriptSource === 'from-script' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>대본 사용</button>
          <button type="button" onClick={() => setScriptSource('manual')}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${scriptSource === 'manual' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>직접 입력</button>
        </div>
        {scriptSource === 'from-script' ? (
          <textarea value={storeScript} readOnly placeholder="대본작성 탭에서 대본을 먼저 작성하세요..." rows={2}
            className="w-full px-3 py-2 rounded-lg bg-gray-900/70 border border-gray-700 text-xs text-gray-300 resize-none cursor-default" />
        ) : (
          <textarea value={manualScript} onChange={(e) => setManualScript(e.target.value)} placeholder="음악 분위기를 분석할 텍스트..." rows={2}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none" />
        )}
        <button type="button" onClick={handleAnalyze} disabled={!activeScript.trim() || isAnalyzing}
          className="w-full py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2">
          {isAnalyzing ? (<><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 분석 중...{elapsedAnalyze > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedAnalyze)}</span>}</>) : 'AI 무드/장르 추천'}
        </button>
        {analyzeError && <p className="text-xs text-red-400">{analyzeError}</p>}
        {analysis && (
          <div className="space-y-2 mt-1">
            {/* 대본 분석 결과 */}
            <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-700/50 space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {analysis.scriptGenre && <span className="px-2 py-0.5 bg-violet-600/20 text-violet-300 rounded-full text-[10px] font-bold border border-violet-500/30">{analysis.scriptGenre}</span>}
                {analysis.scriptEra && <span className="px-2 py-0.5 bg-amber-600/20 text-amber-300 rounded-full text-[10px] border border-amber-500/30">{analysis.scriptEra}</span>}
                {analysis.scriptCulture && <span className="px-2 py-0.5 bg-cyan-600/20 text-cyan-300 rounded-full text-[10px] border border-cyan-500/30">{analysis.scriptCulture}</span>}
              </div>
              {(analysis.emotionPrimary || analysis.emotionSecondary) && (
                <div className="flex items-center gap-2 text-[11px]">
                  {analysis.emotionPrimary && <span className="text-white font-medium">{analysis.emotionPrimary}</span>}
                  {analysis.emotionSecondary && <><span className="text-gray-600">+</span><span className="text-gray-400">{analysis.emotionSecondary}</span></>}
                </div>
              )}
              {analysis.emotionArc && <p className="text-[11px] text-violet-300 leading-snug">{analysis.emotionArc}</p>}
              {analysis.narrativeTone && <p className="text-[10px] text-gray-500">{analysis.narrativeTone}</p>}
            </div>

            {/* 추천 이유 */}
            {analysis.reasoning && <p className="text-[11px] text-gray-300 leading-relaxed bg-violet-900/15 rounded-lg p-2.5 border border-violet-500/20">{analysis.reasoning}</p>}

            {/* 3개 뮤직 컨셉 카드 */}
            {analysis.concepts && analysis.concepts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 font-bold">뮤직 컨셉 — 클릭하면 모든 설정이 자동 적용됩니다</p>
                {analysis.concepts.map((c, idx) => {
                  const isActive = selectedGenres.includes(c.genre) && prompt === c.sunoPrompt;
                  const medal = idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-sky-400 text-black' : 'bg-orange-600 text-white';
                  const tag = idx === 0 ? '정석' : idx === 1 ? '크리에이티브' : '반전';
                  return (
                    <button key={idx} type="button" onClick={() => applyConcept(c)}
                      className={`w-full text-left rounded-xl border transition-all ${
                        isActive ? 'bg-violet-600/20 border-violet-500/50 ring-1 ring-violet-400/30 shadow-lg shadow-violet-500/10' : 'bg-gray-900/60 border-gray-700 hover:border-violet-500/40 hover:bg-gray-900/80'}`}>
                      {/* 헤더 */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/30">
                        <span className={`text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${medal}`}>{idx + 1}</span>
                        <span className="font-bold text-white text-sm">{c.conceptName}</span>
                        <span className="px-1.5 py-0.5 bg-gray-700/50 text-gray-400 rounded text-[9px] font-medium">{tag}</span>
                        <span className="ml-auto text-[10px] text-gray-500 truncate max-w-[140px]">{c.title}</span>
                      </div>
                      {/* 바디 */}
                      <div className="px-3 py-2 space-y-1.5">
                        {c.direction && <p className="text-[11px] text-gray-300">{c.direction}</p>}
                        {/* 메타 배지 */}
                        <div className="flex flex-wrap gap-1">
                          <span className="px-1.5 py-0.5 bg-fuchsia-600/20 text-fuchsia-300 rounded text-[10px] font-bold border border-fuchsia-500/20">{c.genre} · {c.subGenre}</span>
                          <span className="px-1.5 py-0.5 bg-purple-600/20 text-purple-300 rounded text-[10px] border border-purple-500/20">BPM {c.bpm}</span>
                          {c.keySignature && <span className="px-1.5 py-0.5 bg-cyan-600/20 text-cyan-300 rounded text-[10px] border border-cyan-500/20">{c.keySignature}</span>}
                          <span className="px-1.5 py-0.5 bg-orange-600/20 text-orange-300 rounded text-[10px] border border-orange-500/20">{c.energyLevel}</span>
                        </div>
                        {/* 악기 */}
                        {c.instrumentTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {c.instrumentTags.map((t) => (
                              <span key={t} className="px-1 py-0.5 bg-emerald-600/10 text-emerald-400/80 rounded text-[9px] border border-emerald-500/15">{t}</span>
                            ))}
                          </div>
                        )}
                        {/* 레퍼런스 */}
                        {c.referenceArtists && <p className="text-[10px] text-pink-400/70">{c.referenceArtists}</p>}
                        {/* 추천 이유 */}
                        <p className="text-[10px] text-gray-400 leading-snug">{c.reason}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── 제목 + 프롬프트 ── */}
      <div>
        <label className="text-xs text-gray-400 font-bold block mb-1">트랙 제목</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="음악 제목 (최대 80자)"
          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
      </div>
      <div>
        <label className="text-xs text-gray-400 font-bold block mb-1">음악 설명 / 가사</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="원하는 분위기, 가사, 스타일을 자유롭게 설명..." rows={3}
          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none" />
      </div>

      {/* ── 음악 타입 + 길이 + 갯수 ── */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-400 font-bold block mb-1">타입</label>
          <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700">
            <button type="button" onClick={() => setMusicType('instrumental')}
              className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all ${musicType === 'instrumental' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>BGM</button>
            <button type="button" onClick={() => setMusicType('vocal')}
              className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all ${musicType === 'vocal' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>보컬</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 font-bold block mb-1">길이</label>
          <div className="flex flex-wrap gap-1">
            {DURATION_PRESETS.filter((d) => d.sec <= maxDuration).map((d) => (
              <button key={d.sec} type="button" onClick={() => setDuration(d.sec)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  duration === d.sec ? 'bg-pink-600/30 text-pink-300 border-pink-500/50' : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 font-bold block mb-1">갯수</label>
          <input type="number" min={1} max={50} value={batchCount} onChange={(e) => setBatchCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 focus:outline-none focus:border-purple-500 text-center" />
        </div>
      </div>

      {/* ── 장르 브라우저 (341+ 장르) ── */}
      <Section title={`장르 (${selectedGenres.length > 0 ? selectedGenres.join(', ') : '선택 안 됨'})`} defaultOpen badge={`${GENRE_CATEGORIES.reduce((s, c) => s + c.genres.length, 0)}+`}>
        <input type="text" value={genreSearch} onChange={(e) => setGenreSearch(e.target.value)} placeholder="장르 검색... (예: Lo-fi, Trap, K-Pop)"
          className="w-full px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 mb-2" />
        {/* 카테고리 탭 */}
        <div className="flex flex-wrap gap-1 mb-2">
          {filteredCategories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => setActiveGenreCategory(activeGenreCategory === cat.id ? null : cat.id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors ${
                activeGenreCategory === cat.id ? 'bg-pink-600/30 text-pink-300 border-pink-500/50' : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
              {cat.icon} {cat.labelKo} ({cat.genres.length})
            </button>
          ))}
        </div>
        {/* 장르 목록 */}
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {(activeGenreCategory ? filteredCategories.filter((c) => c.id === activeGenreCategory) : filteredCategories).map((cat) => (
            <div key={cat.id}>
              {!activeGenreCategory && <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{cat.icon} {cat.label}</p>}
              <div className="flex flex-wrap gap-1">
                {cat.genres.map((g) => (
                  <TagChip key={g} label={g} active={selectedGenres.includes(g)}
                    onClick={() => toggleArr(selectedGenres, g, setSelectedGenres, 3)} color="pink" />
                ))}
              </div>
            </div>
          ))}
        </div>
        {selectedGenres.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] text-gray-500">선택:</span>
            {selectedGenres.map((g) => (
              <span key={g} className="px-1.5 py-0.5 bg-pink-600/20 text-pink-300 rounded text-[10px] font-medium border border-pink-500/30 flex items-center gap-1">
                {g}<button type="button" onClick={() => setSelectedGenres((prev) => prev.filter((v) => v !== g))} className="text-pink-400/60 hover:text-pink-300">&times;</button>
              </span>
            ))}
            <button type="button" onClick={() => setSelectedGenres([])} className="text-[10px] text-gray-600 hover:text-red-400">전체 해제</button>
          </div>
        )}
      </Section>

      {/* ── 무드 & 에너지 ── */}
      <Section title="무드 & 에너지" badge={`${selectedMoods.length + (selectedEnergy ? 1 : 0)}`}>
        <p className="text-[10px] text-gray-500 mb-1">무드 (최대 3개)</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {MOOD_TAGS.map((m) => (
            <TagChip key={m.tag} label={`${m.tag} ${m.labelKo}`} active={selectedMoods.includes(m.tag)}
              onClick={() => toggleArr(selectedMoods, m.tag, setSelectedMoods, 3)} color="violet" />
          ))}
        </div>
        <p className="text-[10px] text-gray-500 mb-1">에너지 레벨</p>
        <div className="flex flex-wrap gap-1">
          {ENERGY_TAGS.map((e) => (
            <TagChip key={e.tag} label={`${e.tag} ${e.labelKo}`} active={selectedEnergy === e.tag}
              onClick={() => setSelectedEnergy(selectedEnergy === e.tag ? '' : e.tag)} color="orange" />
          ))}
        </div>
      </Section>

      {/* ── 악기 ── */}
      <Section title="악기" badge={selectedInstruments.length > 0 ? `${selectedInstruments.length}` : undefined}>
        <p className="text-[10px] text-gray-500 mb-1.5">최대 5개. 프롬프트 처음 20-30단어가 가장 효과적입니다.</p>
        {INSTRUMENT_CATEGORIES.map((cat) => (
          <div key={cat.label} className="mb-1.5">
            <p className="text-[10px] text-gray-500 font-bold mb-0.5">{cat.labelKo}</p>
            <div className="flex flex-wrap gap-1">
              {cat.instruments.map((inst) => (
                <TagChip key={inst} label={inst} active={selectedInstruments.includes(inst)}
                  onClick={() => toggleArr(selectedInstruments, inst, setSelectedInstruments, 5)} color="emerald" />
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* ── 보컬 스타일 (vocal 타입일 때만) ── */}
      {musicType === 'vocal' && (
        <Section title="보컬 스타일" badge={selectedVocalTags.length > 0 ? `${selectedVocalTags.length}` : undefined}>
          {Object.entries(VOCAL_STYLES).map(([key, items]) => (
            <div key={key} className="mb-1.5">
              <p className="text-[10px] text-gray-500 font-bold mb-0.5 capitalize">{
                key === 'gender' ? '성별/구성' : key === 'style' ? '스타일' : key === 'tone' ? '톤' : key === 'effects' ? '이펙트' : '감정'
              }</p>
              <div className="flex flex-wrap gap-1">
                {items.map((v) => (
                  <TagChip key={v.tag} label={`${v.tag} ${v.labelKo}`} active={selectedVocalTags.includes(v.tag)}
                    onClick={() => toggleArr(selectedVocalTags, v.tag, setSelectedVocalTags, 4)} color="pink" />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* ── 프로덕션 & 텍스처 ── */}
      <Section title="프로덕션 & 텍스처" badge={selectedProduction.length > 0 ? `${selectedProduction.length}` : undefined}>
        <div className="flex flex-wrap gap-1">
          {PRODUCTION_TAGS.map((p) => (
            <TagChip key={p.tag} label={`${p.tag} ${p.labelKo}`} active={selectedProduction.includes(p.tag)}
              onClick={() => toggleArr(selectedProduction, p.tag, setSelectedProduction, 3)} color="cyan" />
          ))}
        </div>
      </Section>

      {/* ── BPM ── */}
      <div>
        <label className="text-xs text-gray-400 font-bold block mb-1">BPM</label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {BPM_PRESETS.map((p) => (
            <button key={p.bpm} type="button" onClick={() => setBpm(p.bpm)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                bpm === p.bpm ? 'bg-purple-600/30 text-purple-300 border-purple-500/50' : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'}`}>
              {p.labelKo} {p.bpm}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min={40} max={220} value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(220, Number(e.target.value) || 120)))}
            className="w-16 px-2 py-1 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500" />
          <input type="range" min={40} max={220} step={1} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1 accent-purple-500" />
        </div>
      </div>

      {/* ── 고급 설정 ── */}
      <Section title="고급 설정 (V5)">
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-0.5">커스텀 태그 (쉼표 구분)</label>
            <div className="flex gap-2">
              <input type="text" value={customTags} onChange={(e) => setCustomTags(e.target.value)} placeholder="직접 입력하는 태그..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
              <button type="button" onClick={handleStyleBoost} disabled={!builtStyle || isBoosting}
                className="px-2.5 py-1.5 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/40 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold transition-all shrink-0">
                {isBoosting ? '...' : '⚡ AI 부스트'}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-bold block mb-0.5">제외 스타일 (Negative Tags)</label>
            <input type="text" value={negativeTags} onChange={(e) => setNegativeTags(e.target.value)} placeholder="예: screamo, autotune"
              className="w-full px-2.5 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-0.5">스타일 준수도</label>
              <input type="range" min={0} max={1} step={0.05} value={styleWeight} onChange={(e) => setStyleWeight(Number(e.target.value))} className="w-full accent-pink-500" />
              <div className="flex justify-between text-[9px] text-gray-600"><span>자유</span><span>{(styleWeight * 100).toFixed(0)}%</span><span>엄격</span></div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-0.5">창작 자유도</label>
              <input type="range" min={0} max={1} step={0.05} value={weirdnessConstraint} onChange={(e) => setWeirdnessConstraint(Number(e.target.value))} className="w-full accent-violet-500" />
              <div className="flex justify-between text-[9px] text-gray-600"><span>보수</span><span>{(weirdnessConstraint * 100).toFixed(0)}%</span><span>실험</span></div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold block mb-0.5">오디오 밸런스</label>
              <input type="range" min={0} max={1} step={0.05} value={audioWeight} onChange={(e) => setAudioWeight(Number(e.target.value))} className="w-full accent-orange-500" />
              <div className="flex justify-between text-[9px] text-gray-600"><span>보컬</span><span>{(audioWeight * 100).toFixed(0)}%</span><span>악기</span></div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 빌드된 스타일 미리보기 ── */}
      {builtStyle && (
        <div className="bg-gray-900/60 rounded-lg border border-gray-700/50 p-2.5">
          <p className="text-[10px] text-gray-500 font-bold mb-1">빌드된 스타일 태그</p>
          <p className="text-xs text-gray-300 break-words leading-relaxed">{builtStyle}</p>
        </div>
      )}

      {/* ── 에러 ── */}
      {generateError && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start justify-between gap-2">
          <p className="text-xs text-red-400 break-words flex-1">⚠ {generateError}</p>
          <button type="button" onClick={() => setGenerateError('')} className="text-red-400/60 hover:text-red-300 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* ── 생성 버튼 + 안내 ── */}
      {!isGeneratingMusic && duration > 180 && (
        <div className="px-3 py-2 bg-amber-900/15 border border-amber-600/30 rounded-lg">
          <p className="text-xs text-amber-400/90">
            {formatTime(duration)} 길이의 음악은 자동 연장으로 생성됩니다. 완성까지 약 {Math.ceil(duration / 60)}~{Math.ceil(duration / 60) + 3}분 정도 소요될 수 있어요.
          </p>
        </div>
      )}
      <button type="button" onClick={handleGenerate}
        disabled={isGeneratingMusic || (!prompt.trim() && !activeScript.trim())}
        className={`w-full py-3 rounded-lg text-sm font-bold transition-all border ${
          isGeneratingMusic ? 'bg-gray-700 text-gray-400 border-gray-600 cursor-not-allowed' :
          'bg-gradient-to-r from-pink-600 to-orange-600 hover:from-pink-500 hover:to-orange-500 text-white border-pink-400/50 shadow-md'}`}>
        {isGeneratingMusic ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin" />
            {batchStatus.total > 1 ? `생성 중... ${batchStatus.completed + batchStatus.failed}/${batchStatus.total} (${progress}%)` : `생성 중... ${progress > 0 ? `(${progress}%)` : ''}`}
            {elapsedMusic > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsedMusic)}</span>}
          </span>
        ) : batchCount > 1 ? `${batchCount}곡 일괄 생성 (${formatTime(duration)})` : `음악 생성 (${formatTime(duration)})`}
      </button>

      {isGeneratingMusic && progress > 0 && (
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-pink-500 to-orange-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
      {isGeneratingMusic && batchStatus.total > 1 && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-400">완료: {batchStatus.completed}</span>
          {batchStatus.failed > 0 && <span className="text-red-400">실패: {batchStatus.failed}</span>}
          <span className="text-gray-500">대기: {batchStatus.total - batchStatus.completed - batchStatus.failed}</span>
        </div>
      )}

      {/* ── 자동 연장 진행 상황 (친절 안내) ── */}
      {extendStatus && (() => {
        const parts = extendStatus.split('|');

        // 초기 생성 단계 안내
        if (parts[0] === 'INIT' && parts.length >= 3) {
          const [, targetTime, initMsg] = parts;
          return (
            <div className="bg-gradient-to-br from-pink-900/25 to-orange-900/15 border border-pink-500/30 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-pink-600/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-pink-400 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-pink-300">기본 트랙 생성 중</p>
                  <p className="text-[10px] text-gray-500">목표: {targetTime} 길이의 음악</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{initMsg}</p>
              <div className="flex gap-1">
                <div className="h-1 flex-1 rounded-full bg-pink-500/50 animate-pulse" />
                <div className="h-1 flex-1 rounded-full bg-gray-700/50" />
                <div className="h-1 flex-1 rounded-full bg-gray-700/50" />
              </div>
            </div>
          );
        }

        if (parts[0] !== 'EXTEND' || parts.length < 7) {
          return (
            <div className="px-3 py-2 bg-purple-900/20 border border-purple-500/30 rounded-lg flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin shrink-0" />
              <p className="text-xs text-purple-300">{extendStatus}</p>
            </div>
          );
        }
        const [, step, total, currentTime, targetTime, pct, message] = parts;
        const stepNum = Number(step);
        const totalNum = Number(total);
        const pctNum = Number(pct);
        return (
          <div className="bg-gradient-to-br from-purple-900/30 to-violet-900/20 border border-purple-500/30 rounded-xl p-4 space-y-3">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-600/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-purple-300">곡 자동 연장 중</p>
                  <p className="text-[10px] text-gray-500">STEP {step} / {total}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-purple-300 tabular-nums">{currentTime}</p>
                <p className="text-[10px] text-gray-500">목표 {targetTime}</p>
              </div>
            </div>

            {/* 프로그레스 바 */}
            <div className="space-y-1">
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-violet-400 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, pctNum)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-600">0:00</span>
                <span className="text-purple-400 font-bold">{pctNum}%</span>
                <span className="text-gray-600">{targetTime}</span>
              </div>
            </div>

            {/* 단계 인디케이터 */}
            <div className="flex gap-1">
              {Array.from({ length: totalNum }, (_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    i < stepNum ? 'bg-purple-400' : i === stepNum ? 'bg-purple-500/50 animate-pulse' : 'bg-gray-700/50'
                  }`}
                />
              ))}
            </div>

            {/* 안내 메시지 */}
            <p className="text-xs text-gray-400 leading-relaxed">{message}</p>
          </div>
        );
      })()}
    </div>
  );
};

/* ═══════ 메인 컴포넌트 ═══════ */
const MusicStudio: React.FC = () => {
  const musicStudioTab = useSoundStudioStore((s) => s.musicStudioTab);
  const setMusicStudioTab = useSoundStudioStore((s) => s.setMusicStudioTab);

  return (
    <div className="bg-gray-800/60 rounded-lg border border-gray-700 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg flex items-center justify-center text-sm shadow">🎵</div>
        <div>
          <h2 className="text-lg font-bold text-white">뮤직 스튜디오 (SUNO)</h2>
          <p className="text-[10px] text-gray-500">341+ 장르 · 100+ 악기 · 25+ 무드 · 보컬 스타일 · AI 분석</p>
        </div>
      </div>
      <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setMusicStudioTab(tab.id)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5
              ${musicStudioTab === tab.id ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>
      {musicStudioTab === 'generate' && <GenerateTab />}
      {musicStudioTab === 'lyrics' && <LyricsTab />}
      {musicStudioTab === 'tools' && <ToolsTab />}
    </div>
  );
};

export default MusicStudio;

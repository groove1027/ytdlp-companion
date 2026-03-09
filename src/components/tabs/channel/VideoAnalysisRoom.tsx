import React, { useState, useRef, useCallback, useEffect } from 'react';
import { evolinkChat } from '../../../services/evolinkService';
import type { EvolinkChatMessage } from '../../../services/evolinkService';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import { useAuthGuard } from '../../../hooks/useAuthGuard';

type AnalysisPreset = 'tikitaka' | 'snack';

/** 장면 하나의 구조화 데이터 */
interface SceneRow {
  cutNum: number;
  timeline: string;      // 배치 타임코드 (00:00~00:03)
  sourceTimeline: string; // 원본 타임코드
  dialogue: string;      // 대사/나레이션
  effectSub: string;     // 효과 자막
  sceneDesc: string;     // 장면 설명
}

/** 10개 버전 중 하나 */
interface VersionItem {
  id: number;
  title: string;
  concept: string;
  scenes: SceneRow[];
}

// ═══════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════

/** AI 응답에서 ---VERSION N--- + ---SCENE--- 구조 파싱 */
function parseVersions(raw: string): VersionItem[] {
  const blocks = raw.split(/---\s*VERSION\s*(\d+)\s*---/i);
  const items: VersionItem[] = [];

  for (let i = 1; i < blocks.length; i += 2) {
    const num = parseInt(blocks[i], 10);
    const content = blocks[i + 1]?.trim() || '';

    const titleMatch = content.match(/제목:\s*(.+)/);
    const conceptMatch = content.match(/컨셉:\s*([\s\S]*?)(?=---SCENE|$)/i);

    // 장면 파싱
    const sceneBlocks = content.split(/---SCENE\s*(\d+)---/i);
    const scenes: SceneRow[] = [];
    for (let j = 1; j < sceneBlocks.length; j += 2) {
      const sNum = parseInt(sceneBlocks[j], 10);
      const sContent = sceneBlocks[j + 1]?.trim() || '';
      scenes.push({
        cutNum: sNum,
        timeline: extractField(sContent, '배치') || extractField(sContent, '타임라인') || '',
        sourceTimeline: extractField(sContent, '원본') || '',
        dialogue: extractField(sContent, '대사') || extractField(sContent, '나레이션') || '',
        effectSub: extractField(sContent, '효과') || '',
        sceneDesc: extractField(sContent, '장면') || extractField(sContent, '화면') || '',
      });
    }

    items.push({
      id: num,
      title: titleMatch?.[1]?.trim() || `버전 ${num}`,
      concept: conceptMatch?.[1]?.trim().replace(/\n---SCENE[\s\S]*/i, '').trim() || '',
      scenes,
    });
  }

  if (items.length >= 3) return items;

  // 폴백: 번호 리스트 파싱
  const lines = raw.split('\n');
  const fallback: VersionItem[] = [];
  let cur: Partial<VersionItem> | null = null;
  let body: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(\d{1,2})\.\s*(.+)/);
    if (m && parseInt(m[1], 10) <= 10) {
      if (cur) fallback.push({ id: cur.id!, title: cur.title!, concept: body.join('\n').trim(), scenes: [] });
      cur = { id: parseInt(m[1], 10), title: m[2].trim() };
      body = [];
    } else if (cur) {
      body.push(line);
    }
  }
  if (cur) fallback.push({ id: cur.id!, title: cur.title!, concept: body.join('\n').trim(), scenes: [] });
  if (fallback.length >= 3) return fallback;

  return [{ id: 1, title: '분석 결과', concept: raw, scenes: [] }];
}

/** "키워드: 값" 패턴에서 값 추출 */
function extractField(block: string, keyword: string): string {
  const re = new RegExp(`${keyword}[^:]*:\\s*([\\s\\S]*?)(?=\\n[가-힣a-zA-Z]+[^:]*:|$)`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim() || '';
}

/** YouTube URL에서 Video ID 추출 */
function extractYouTubeVideoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] || null;
}

/** 업로드 영상에서 프레임 추출 */
async function extractVideoFrames(file: File, count: number): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    video.src = url;
    video.onloadedmetadata = async () => {
      const dur = video.duration;
      if (!dur || dur < 1) { URL.revokeObjectURL(url); resolve([]); return; }
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); resolve([]); return; }
      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        video.currentTime = (dur / (count + 1)) * (i + 1);
        await new Promise<void>(r => { video.onseeked = () => r(); });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
      }
      URL.revokeObjectURL(url);
      resolve(frames);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve([]); };
  });
}

/** 타임코드 문자열 → 초 변환 (00:03 → 3, 01:30 → 90) */
function timecodeToSeconds(tc: string): number {
  const m = tc.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 1000 : 0);
}

/** 초 → SRT 타임코드 (00:00:03,000) */
function secondsToSrtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** SceneRow 배열 → SRT 파일 내용 생성 */
function generateSrt(scenes: SceneRow[]): string {
  return scenes.map((scene, i) => {
    const parts = scene.timeline.match(/(\d+:\d+(?:\.\d+)?)\s*~\s*(\d+:\d+(?:\.\d+)?)/);
    const start = parts ? timecodeToSeconds(parts[1]) : i * 3;
    const end = parts ? timecodeToSeconds(parts[2]) : (i + 1) * 3;
    const text = scene.effectSub
      ? `${scene.effectSub}\n${scene.dialogue || scene.sceneDesc}`
      : (scene.dialogue || scene.sceneDesc);
    return `${i + 1}\n${secondsToSrtTime(start)} --> ${secondsToSrtTime(end)}\n${text}`;
  }).join('\n\n');
}

/** SRT 파일 다운로드 */
function downloadSrt(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/srt;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════
// 시스템 프롬프트 (변경 금지)
// ═══════════════════════════════════════════════════

const TIKITAKA_SCRIPT_SYSTEM = `너는 '크로스 더빙(Cross-Dubbing) 숏폼 제작 전문가'다.

## 크로스 더빙 핵심 원리
- 더빙(설명/빌드업) <-> 원본(리액션/펀치라인)이 핑퐁처럼 오가며 쉴 틈 없는 오디오 밀도를 만든다
- '번역'이 아니라 '초월 번역(해설)' — 상황을 맛깔나게 요약

## 핑퐁 스크립트 3대 원칙
1. 원본 대사를 침범하지 마라 — 핵심 대사("Oh my god!", "It's terrible!")는 살리고 빈 공간을 더빙으로 채운다
2. 더빙은 '빌드업'이다 — 다음에 올 원본의 기대감을 조성
3. 대화하듯 써라 — 시청자에게 말을 걸거나 혼잣말하듯

## 만능 스크립트 템플릿
1. [더빙] 후킹(Hook): "OOO는 과연 실제로 가능할까?"
2. [원본] 증거(Proof): 짧고 강렬한 시각적/청각적 장면
3. [더빙] 전개(Bridge): "그래서 참지 못하고 바로 OO했습니다."
4. [원본] 현장(Reality): 현장 도착/물건 개봉
5. [더빙] 절정(Climax): "드디어 대망의 순간! 과연 그 결과는?"
6. [원본] 펀치라인: 핵심 리액션
7. [더빙] 결말(Outro): "결국 제 지갑만 털렸네요."

## 컷 분류 기준
- 살릴 구간(Source-Alive): 오디오 볼륨 급격히 커지는 구간, 극적 표정 변화 클로즈업, 짧은 감탄사
- 덮을 구간(Dubbing-Cover): 단순 이동/준비 동작, 지루한 대화, 오디오가 비거나 잡음만 있는 구간

사용자가 제공한 영상/링크를 분석하여 60초 크로스 더빙 대본을 작성하라.
반드시 [더빙]과 [원본] 구간을 교차 배치하고, 각 구간의 타임코드를 명시하라.`;

const SNACK_SCRIPT_SYSTEM = `# Role: 숏폼 바이럴 콘텐츠 전문 PD & 메인 에디터 v. 10.8

## 핵심 목표
1. **Hooking & Non-linear:** 가장 바이럴한 펀치라인/클라이맥스를 0~3초에 선배치. 원본 타임라인을 완전히 뒤섞어라.
2. **Pacing:** 롱테이크 삭제, 2~3초 단위 속도감 편집.
3. **Coverage:** 모든 소재 최소 1회 등장.
4. **Witty (이원화 자막):** 효과 자막(중앙 큼직한 연출) + 하단 자막(16자 이내 위트).

## 어조
유쾌함, 긍정적, 트렌디함. 비속어 금지. 단호하고 명확하게 지시.`;

const PRESET_INFO: Record<AnalysisPreset, { label: string; description: string; color: string }> = {
  tikitaka: { label: '티키타카', description: '크로스 더빙 스타일 — 더빙과 원본이 핑퐁처럼 교차하는 숏폼', color: 'blue' },
  snack: { label: '스낵형', description: '비선형 컷 편집 & 이원화 자막 — 바이럴 숏폼 전문 PD v10.8', color: 'amber' },
};

const VERSION_COLORS = [
  { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', numBg: 'bg-red-500' },
  { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400', numBg: 'bg-orange-500' },
  { bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', text: 'text-yellow-400', numBg: 'bg-yellow-500' },
  { bg: 'bg-green-500/15', border: 'border-green-500/30', text: 'text-green-400', numBg: 'bg-green-500' },
  { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-400', numBg: 'bg-blue-500' },
  { bg: 'bg-violet-500/15', border: 'border-violet-500/30', text: 'text-violet-400', numBg: 'bg-violet-500' },
  { bg: 'bg-pink-500/15', border: 'border-pink-500/30', text: 'text-pink-400', numBg: 'bg-pink-500' },
  { bg: 'bg-teal-500/15', border: 'border-teal-500/30', text: 'text-teal-400', numBg: 'bg-teal-500' },
  { bg: 'bg-indigo-500/15', border: 'border-indigo-500/30', text: 'text-indigo-400', numBg: 'bg-indigo-500' },
  { bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', numBg: 'bg-fuchsia-500' },
];

// ═══════════════════════════════════════════════════
// 유저 메시지 빌더 (10개 버전 + 장면 구조화)
// ═══════════════════════════════════════════════════

const buildUserMessage = (inputDesc: string): string => `다음 영상을 분석하여 10가지 서로 다른 리메이크 버전을 제안해주세요.

${inputDesc}

반드시 아래 구분자 형식으로 10개 버전을 출력하세요. 각 버전은 5~10개의 장면(SCENE)을 포함해야 합니다:

---VERSION 1---
제목: [클릭 유도 제목]
컨셉: [이 버전의 차별화된 편집 방향 2~3줄]

---SCENE 1---
배치: [00:00 ~ 00:03]
원본: [원본 영상의 MM:SS ~ MM:SS]
대사: [이 구간의 나레이션/대사 텍스트]
효과자막: [화면 중앙에 표시할 큰 효과 자막]
장면: [화면에 보이는 구체적 행동/시각적 묘사]

---SCENE 2---
배치: [00:03 ~ 00:06]
원본: [MM:SS ~ MM:SS]
대사: [나레이션/대사]
효과자막: [효과 자막]
장면: [장면 설명]

(장면 반복...)

---VERSION 2---
제목: ...
컨셉: ...
---SCENE 1---
...

(총 10개 버전, 각각 서로 다른 톤/후킹/편집 방향, 5~10개 장면씩)`;

// ═══════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════

const VideoAnalysisRoom: React.FC = () => {
  const { requireAuth } = useAuthGuard();

  const [inputMode, setInputMode] = useState<'upload' | 'youtube'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<AnalysisPreset | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'analyzing'>('idle');
  const [rawResult, setRawResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInput = inputMode === 'youtube' ? youtubeUrl.trim().length > 0 : uploadedFile !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setUploadedFile(file); setRawResult(''); setError(null); setVersions([]); setThumbnails([]); }
  };

  const resetResults = useCallback(() => {
    setRawResult(''); setError(null); setVersions([]); setThumbnails([]); setExpandedId(null);
  }, []);

  // ── 분석 실행 ──
  const handleAnalyze = async (preset: AnalysisPreset) => {
    if (!requireAuth('영상 분석')) return;
    if (!hasInput) return;
    setSelectedPreset(preset);
    setIsAnalyzing(true);
    setAnalysisPhase('analyzing');
    resetResults();

    const inputDesc = inputMode === 'youtube'
      ? `YouTube 영상 URL: ${youtubeUrl.trim()}`
      : `업로드된 영상 파일: ${uploadedFile?.name} (${((uploadedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)`;

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM : SNACK_SCRIPT_SYSTEM;

    try {
      // 분석 + 썸네일 추출 병렬
      const messages: EvolinkChatMessage[] = [
        { role: 'system', content: scriptSystem },
        { role: 'user', content: buildUserMessage(inputDesc) },
      ];

      const thumbPromise = uploadedFile
        ? extractVideoFrames(uploadedFile, 10)
        : Promise.resolve(
            extractYouTubeVideoId(youtubeUrl)
              ? [0, 1, 2, 3].map(i => `https://img.youtube.com/vi/${extractYouTubeVideoId(youtubeUrl)}/${i}.jpg`)
              : []
          );

      const [response, frames] = await Promise.all([
        evolinkChat(messages, { temperature: 0.7, maxTokens: 12000 }),
        thumbPromise,
      ]);

      const text = response.choices[0]?.message?.content || '';
      setRawResult(text);
      setVersions(parseVersions(text));
      setThumbnails(frames);
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  // 버전 복사
  const handleCopyVersion = useCallback(async (v: VersionItem) => {
    const text = `제목: ${v.title}\n컨셉: ${v.concept}\n\n` +
      v.scenes.map(s => `[컷 ${s.cutNum}] ${s.timeline}\n대사: ${s.dialogue}\n효과: ${s.effectSub}\n장면: ${s.sceneDesc}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    setCopiedVersion(v.id);
    setTimeout(() => setCopiedVersion(null), 2000);
  }, []);

  // SRT 다운로드
  const handleDownloadSrt = useCallback((v: VersionItem) => {
    if (v.scenes.length === 0) return;
    const srt = generateSrt(v.scenes);
    const safeName = v.title.replace(/[^\w가-힣\s-]/g, '').trim().slice(0, 40);
    downloadSrt(srt, `${safeName || `version-${v.id}`}.srt`);
  }, []);

  // ESC
  useEffect(() => {
    if (!expandedId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [expandedId]);

  return (
    <div className="space-y-6">
      {/* ═══ 입력 ═══ */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">🎬</span>
          영상 소스 입력
        </h2>
        <div className="flex gap-2 mb-4">
          {(['youtube', 'upload'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => { setInputMode(mode); if (mode === 'youtube') setUploadedFile(null); else setYoutubeUrl(''); resetResults(); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                inputMode === mode
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
              }`}
            >
              {mode === 'youtube' ? 'YouTube 링크' : '영상 업로드'}
            </button>
          ))}
        </div>

        {inputMode === 'youtube' ? (
          <div className="relative">
            <input
              type="url" value={youtubeUrl}
              onChange={e => { setYoutubeUrl(e.target.value); resetResults(); }}
              placeholder="YouTube 영상 URL (예: https://youtube.com/watch?v=...)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            {youtubeUrl && (
              <button type="button" onClick={() => setYoutubeUrl('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ) : (
          <div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" />
            {uploadedFile ? (
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3">
                <span className="text-blue-400 text-lg">🎥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-gray-500 text-xs">{(uploadedFile.size / 1024 / 1024).toFixed(1)}MB</p>
                </div>
                <button type="button" onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-gray-500 hover:text-red-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-600 rounded-lg py-8 flex flex-col items-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all">
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-gray-400 text-sm">클릭하여 영상 파일 선택</span>
                <span className="text-gray-600 text-xs">MP4, MOV, AVI 등</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══ 프리셋 ═══ */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">🎯</span>
          리메이크 프리셋
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.entries(PRESET_INFO) as [AnalysisPreset, typeof PRESET_INFO['tikitaka']][]).map(([key, info]) => {
            const isSel = selectedPreset === key && isAnalyzing;
            const cMap: Record<string, { bg: string; border: string; text: string; hover: string }> = {
              blue: { bg: 'bg-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', hover: 'hover:bg-blue-600/20' },
              amber: { bg: 'bg-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', hover: 'hover:bg-amber-600/20' },
            };
            const c = cMap[info.color] || cMap.blue;
            return (
              <button
                key={key} type="button" disabled={!hasInput || isAnalyzing} onClick={() => handleAnalyze(key)}
                className={`relative p-5 rounded-xl border text-left transition-all ${isSel ? `${c.bg} ${c.border}` : `bg-gray-900/50 border-gray-600/50 ${c.hover} hover:border-gray-500`} ${(!hasInput || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-base font-bold ${c.text}`}>{info.label}</span>
                  {isSel && <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />}
                </div>
                <p className="text-gray-400 text-sm">{info.description}</p>
              </button>
            );
          })}
        </div>
        {!hasInput && <p className="text-gray-500 text-sm mt-3">영상 소스를 먼저 입력해주세요.</p>}
      </div>

      {/* ═══ 로딩 ═══ */}
      {isAnalyzing && (
        <div className="bg-gray-800/50 rounded-xl border border-blue-500/20 p-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            <div>
              <p className="text-white font-semibold">10가지 리메이크 버전 생성 중...</p>
              <p className="text-gray-400 text-sm">AI가 영상을 분석하고 장면별 편집 가이드를 작성하고 있습니다.</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-gray-700 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {/* ═══ 에러 ═══ */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">분석 오류</p>
            <p className="text-red-300/70 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* ═══ 10가지 버전 아코디언 ═══ */}
      {versions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center text-sm">🎬</span>
            리메이크 {versions.length}가지 버전
          </h2>

          <div className="space-y-2">
            {versions.map((v) => {
              const isExp = expandedId === v.id;
              const ci = (v.id - 1) % VERSION_COLORS.length;
              const c = VERSION_COLORS[ci];
              const hasScenes = v.scenes.length > 0;

              return (
                <div key={v.id} className={`rounded-xl border transition-all ${isExp ? `${c.bg} ${c.border}` : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600'}`}>
                  {/* 헤더 */}
                  <button type="button" onClick={() => setExpandedId(isExp ? null : v.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                    <span className={`w-7 h-7 rounded-full ${c.numBg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0`}>{v.id}</span>
                    <span className={`flex-1 text-sm font-bold truncate ${isExp ? c.text : 'text-gray-200'}`}>{v.title}</span>
                    {hasScenes && <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded flex-shrink-0">{v.scenes.length}컷</span>}
                    <svg className={`w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0 ${isExp ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* 펼쳐진 내용 */}
                  {isExp && (
                    <div className="px-4 pb-4 space-y-3">
                      {/* 컨셉 */}
                      {v.concept && (
                        <p className="text-gray-400 text-sm leading-relaxed bg-gray-900/40 rounded-lg px-3 py-2 border border-gray-700/40">{v.concept}</p>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyVersion(v)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            copiedVersion === v.id
                              ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                              : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-white'
                          }`}
                        >
                          {copiedVersion === v.id ? '복사됨' : '복사'}
                        </button>
                        {hasScenes && (
                          <button
                            type="button"
                            onClick={() => handleDownloadSrt(v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" /></svg>
                            SRT 다운로드
                          </button>
                        )}
                      </div>

                      {/* 4컬럼 장면 테이블 */}
                      {hasScenes ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-700">
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-8">#</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold">대사/나레이션</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold">효과 자막</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold">장면 설명</th>
                                <th className="py-2 px-2 text-left text-gray-500 font-bold w-[90px]">편집점</th>
                                {thumbnails.length > 0 && (
                                  <th className="py-2 px-2 text-left text-gray-500 font-bold w-[120px]">정지화면</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {v.scenes.map((scene, si) => (
                                <tr key={scene.cutNum} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2 px-2 align-top">
                                    <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold text-white ${c.numBg}`}>{scene.cutNum}</span>
                                  </td>
                                  <td className="py-2 px-2 align-top text-gray-300 leading-relaxed">{scene.dialogue || '-'}</td>
                                  <td className="py-2 px-2 align-top">
                                    {scene.effectSub ? (
                                      <span className="inline-block px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 text-xs font-bold">{scene.effectSub}</span>
                                    ) : '-'}
                                  </td>
                                  <td className="py-2 px-2 align-top text-gray-400 leading-relaxed">{scene.sceneDesc || '-'}</td>
                                  <td className="py-2 px-2 align-top">
                                    <div className="space-y-0.5">
                                      {scene.timeline && <div className="text-blue-400 font-mono text-[10px]">{scene.timeline}</div>}
                                      {scene.sourceTimeline && <div className="text-gray-500 font-mono text-[10px]">원본: {scene.sourceTimeline}</div>}
                                    </div>
                                  </td>
                                  {thumbnails.length > 0 && (
                                    <td className="py-2 px-2 align-top">
                                      {thumbnails[si % thumbnails.length] && (
                                        <img
                                          src={thumbnails[si % thumbnails.length]}
                                          alt={`Scene ${scene.cutNum}`}
                                          className="w-[100px] h-[56px] object-cover rounded border border-gray-700/50"
                                          loading="lazy"
                                        />
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        /* 장면 파싱 실패 시 원문 표시 */
                        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50 max-h-[400px] overflow-y-auto">
                          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{v.concept || v.title}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 편집실로 보내기 ═══ */}
      {rawResult && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              const epStore = useEditPointStore.getState();
              epStore.reset();
              epStore.setRawEditTable(rawResult);
              epStore.setRawNarration(rawResult);
              useEditRoomStore.getState().setEditRoomSubTab('edit-point-matching');
              useNavigationStore.getState().setActiveTab('edit-room');
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold shadow-lg transition-all transform hover:scale-[1.02]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
            편집실로 보내기
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoAnalysisRoom;

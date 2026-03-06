import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import type { TimelineSplitMode, TimelineSegment } from '../../../types';

const fmtTime = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const SPLIT_MODES: { id: TimelineSplitMode; label: string; desc: string; badge?: string }[] = [
  { id: 'equal', label: '균등 분할', desc: '이미지 수로 나눔' },
  { id: 'fixed', label: '고정 시간', desc: '동일 시간 배치' },
  { id: 'chapter', label: '대본 챕터', desc: '6개 챕터' },
  { id: 'dialogue', label: '대사 매칭', desc: '64개 장면', badge: 'NEW' },
];

const SegmentRow: React.FC<{ seg: TimelineSegment; expanded: boolean; onToggle: () => void }> = ({ seg, expanded, onToggle }) => (
  <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
    <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/60 transition-colors text-left">
      <div className="w-12 h-8 rounded bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-700">
        {seg.imageUrl ? <img src={seg.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-[11px]">--</div>}
      </div>
      <span className="text-sm text-gray-300 font-bold w-14 flex-shrink-0">이미지 {seg.sceneIndex + 1}</span>
      {seg.subtitleText && <span className="text-sm font-bold px-2 py-0.5 rounded border bg-green-900/30 text-green-300 border-green-500/50 flex-shrink-0">자막 연결됨</span>}
      <span className="text-sm text-gray-500 font-mono flex-shrink-0">{fmtTime(seg.startTime)} ~ {fmtTime(seg.endTime)}</span>
      <span className="text-sm text-gray-600 flex-shrink-0">({seg.duration.toFixed(1)}s)</span>
      <div className="flex-1" />
      <span className={`text-gray-500 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
    </button>
    {expanded && (
      <div className="px-4 py-3 border-t border-gray-700/50 bg-gray-900/30 space-y-2">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><label className="text-gray-500 text-sm">시작 시간</label><input type="number" step={0.1} value={seg.startTime} readOnly className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm mt-0.5" /></div>
          <div><label className="text-gray-500 text-sm">끝 시간</label><input type="number" step={0.1} value={seg.endTime} readOnly className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 text-sm mt-0.5" /></div>
        </div>
        {seg.subtitleText && <div><label className="text-gray-500 text-sm">자막</label><p className="text-sm text-gray-300 mt-0.5">{seg.subtitleText}</p></div>}
      </div>
    )}
  </div>
);

const TimelineEditor: React.FC = () => {
  const timeline = useEditorStore((s) => s.timeline);
  const splitMode = useEditorStore((s) => s.splitMode);
  const setSplitMode = useEditorStore((s) => s.setSplitMode);
  const selectedSegmentId = useEditorStore((s) => s.selectedSegmentId);
  const setSelectedSegmentId = useEditorStore((s) => s.setSelectedSegmentId);
  const totalDuration = useEditorStore((s) => s.totalDuration);
  const zoom = useEditorStore((s) => s.zoom);

  const [isManualMode, setIsManualMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const successCount = useMemo(() => timeline.filter((s) => s.imageUrl).length, [timeline]);
  const failCount = useMemo(() => timeline.filter((s) => !s.imageUrl).length, [timeline]);
  const steps = [{ label: '프로젝트 설정', done: true }, { label: '타임라인 생성', done: timeline.length > 0 }];
  const handleRegenerate = useCallback(() => {
    // 현재 splitMode에 따라 타임라인을 재생성 (editorStore의 timeline 데이터 기반)
    console.warn('[TimelineEditor] 타임라인 재생성 — 장면 데이터가 editorStore에 연결되면 자동 활성화됩니다.');
  }, []);

  const timeMarkers = useMemo(() => {
    const m: number[] = [], dur = totalDuration || 300;
    for (let t = 0; t <= dur; t += 30) m.push(t);
    return m;
  }, [totalDuration]);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">이미지-자막 동기화</h2>
          <p className="text-gray-500 text-sm mt-0.5">타임라인을 생성하고 이미지와 자막을 동기화하세요</p>
        </div>
        <button type="button" onClick={() => setIsManualMode(!isManualMode)} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-sm font-bold">
          {isManualMode ? '자동 배치 모드로 전환' : '수동 배치 모드로 전환'} &rarr;
        </button>
      </div>

      {/* 단계 표시 */}
      <div className="flex items-center gap-3">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-500'}`}>
                {step.done ? '✓' : i + 1}
              </div>
              <span className={`text-sm font-semibold ${step.done ? 'text-green-400' : 'text-gray-500'}`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${step.done ? 'bg-green-600' : 'bg-gray-700'} rounded-full max-w-[60px]`} />}
          </React.Fragment>
        ))}
      </div>

      {/* 타임라인 생성 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-4">
        <h3 className="text-base font-bold text-white">타임라인 생성</h3>
        <p className="text-sm text-gray-500">알고리즘 선택 후 생성</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {SPLIT_MODES.map((mode) => {
            const active = splitMode === mode.id;
            return (
              <button key={mode.id} type="button" onClick={() => setSplitMode(mode.id)} className={`relative p-4 rounded-xl border text-left transition-all ${active ? 'bg-amber-600/15 border-amber-500/50 shadow-md' : 'bg-gray-900/50 border-gray-700 hover:border-gray-500'}`}>
                {mode.badge && <span className="absolute top-2 right-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-pink-600 to-violet-600 text-white">{mode.badge}</span>}
                <p className={`text-sm font-bold mb-1 ${active ? 'text-amber-300' : 'text-gray-300'}`}>{mode.label}</p>
                <p className="text-sm text-gray-500">{mode.desc}</p>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">성공 <span className="text-green-400 font-bold">{successCount}개</span></span>
            <span className="text-gray-400">실패 <span className="text-red-400 font-bold">{failCount}개</span></span>
          </div>
          <button type="button" onClick={handleRegenerate} className="px-5 py-2 bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 text-white rounded-lg text-sm font-bold border border-purple-400/30 shadow-lg">타임라인 재생성</button>
        </div>
      </div>

      {/* 시각적 타임라인 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">시각적 타임라인</h3>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-500/50" /> 오디오 범위</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-500/50" /> 이미지 세그먼트</span>
          </div>
        </div>
        <div className="relative overflow-x-auto pb-2">
          <div className="flex items-end h-5 mb-1 relative" style={{ minWidth: `${Math.max(800, (zoom / 100) * 1200)}px` }}>
            {timeMarkers.map((t) => (
              <span key={t} className="absolute text-[11px] text-gray-600 font-mono" style={{ left: `${totalDuration > 0 ? (t / totalDuration) * 100 : (t / 300) * 100}%` }}>{fmtTime(t)}</span>
            ))}
          </div>
          <div className="relative h-20 bg-gray-950 rounded-lg border border-gray-700" style={{ minWidth: `${Math.max(800, (zoom / 100) * 1200)}px` }}>
            {timeline.map((seg) => {
              const dur = totalDuration || 300, left = (seg.startTime / dur) * 100, w = Math.max(((seg.endTime - seg.startTime) / dur) * 100, 1);
              return (
                <button key={seg.id} type="button" onClick={() => setSelectedSegmentId(seg.id)} className={`absolute top-2 bottom-2 rounded-md border overflow-hidden flex items-center justify-center transition-all ${selectedSegmentId === seg.id ? 'border-amber-400 ring-1 ring-amber-400/50 z-10' : 'border-gray-600 hover:border-gray-400'}`} style={{ left: `${left}%`, width: `${w}%` }}>
                  {seg.imageUrl ? <img src={seg.imageUrl} alt="" className="w-full h-full object-cover opacity-70" /> : <div className="w-full h-full bg-amber-900/30 flex items-center justify-center"><span className="text-xs text-amber-400 font-bold">#{seg.sceneIndex + 1}</span></div>}
                </button>
              );
            })}
            {timeline.length === 0 && <div className="flex items-center justify-center h-full text-gray-600 text-sm">타임라인을 생성하세요</div>}
          </div>
        </div>
      </div>

      {/* 세그먼트 편집기 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-3">
        <h3 className="text-base font-bold text-white">세그먼트 편집기</h3>
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {timeline.length > 0 ? timeline.map((seg) => (
            <SegmentRow key={seg.id} seg={seg} expanded={expandedId === seg.id} onToggle={() => setExpandedId((p) => p === seg.id ? null : seg.id)} />
          )) : <p className="text-gray-600 text-sm text-center py-6">세그먼트가 없습니다. 위에서 타임라인을 먼저 생성하세요.</p>}
        </div>
      </div>
    </div>
  );
};

export default TimelineEditor;

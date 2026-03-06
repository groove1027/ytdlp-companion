import React, { useState, useCallback } from 'react';
import { useEditRoomStore } from '../../../stores/editRoomStore';
import type { AudioMasterPreset, LoudnessNormConfig } from '../../../types';

/** 플랫폼별 라우드니스 프리셋 */
const LOUDNESS_PRESETS: { id: string; label: string; desc: string; lufs: number; tp: number; lra: number }[] = [
  { id: 'youtube', label: 'YouTube', desc: '-14 LUFS / -1 dBTP', lufs: -14, tp: -1, lra: 11 },
  { id: 'spotify', label: 'Spotify', desc: '-14 LUFS / -1 dBTP', lufs: -14, tp: -1, lra: 9 },
  { id: 'apple', label: 'Apple Music', desc: '-16 LUFS / -1 dBTP', lufs: -16, tp: -1, lra: 13 },
  { id: 'podcast', label: '팟캐스트', desc: '-16 LUFS / -1 dBTP', lufs: -16, tp: -1, lra: 8 },
  { id: 'broadcast', label: '방송 (EBU R128)', desc: '-23 LUFS / -1 dBTP', lufs: -23, tp: -1, lra: 15 },
  { id: 'tiktok', label: 'TikTok / Reels', desc: '-14 LUFS / -1 dBTP', lufs: -14, tp: -1, lra: 11 },
  { id: 'cinema', label: '시네마', desc: '-24 LUFS / -2 dBTP', lufs: -24, tp: -2, lra: 18 },
];

const MASTER_PRESETS: { id: AudioMasterPreset; label: string; desc: string }[] = [
  { id: 'none', label: '없음', desc: '원본 그대로' },
  { id: 'broadcast', label: '방송', desc: '멀티밴드 컴프레서 + 리미터' },
  { id: 'podcast', label: '팟캐스트', desc: '보이스 부스트 + 디에서' },
  { id: 'music', label: '뮤직', desc: '넓은 다이나믹 레인지' },
  { id: 'cinema', label: '시네마', desc: '서라운드 감성' },
  { id: 'loudness', label: '라우드니스', desc: 'LUFS 표준화만 적용' },
];

/** 비트레이트 프리셋 */
const BITRATE_PRESETS: { mbps: number; label: string; icon: string; tag?: string }[] = [
  { mbps: 8,  label: '일반 화질', icon: 'SD' },
  { mbps: 15, label: '고화질', icon: 'HD' },
  { mbps: 20, label: '최적 권장', icon: 'HD', tag: '추천' },
  { mbps: 25, label: '고품질', icon: '4K' },
  { mbps: 30, label: '최고 품질', icon: '✦' },
];

interface RenderSettingsModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

const RenderSettingsModal: React.FC<RenderSettingsModalProps> = ({ onClose, onConfirm }) => {
  const renderSettings = useEditRoomStore((s) => s.renderSettings);
  const setRenderSettings = useEditRoomStore((s) => s.setRenderSettings);
  const bgmTrack = useEditRoomStore((s) => s.bgmTrack);

  const [localLoudness, setLocalLoudness] = useState<LoudnessNormConfig>(renderSettings.loudness);
  const [localPreset, setLocalPreset] = useState<AudioMasterPreset | null>(renderSettings.masterPresetOverride);
  const [activePresetId, setActivePresetId] = useState<string | null>(() => {
    const l = renderSettings.loudness;
    if (!l.enabled) return null;
    const match = LOUDNESS_PRESETS.find(p => p.lufs === l.targetLufs && p.tp === l.truePeakDbtp && p.lra === l.lra);
    return match?.id ?? null;
  });
  const [localRenderMode, setLocalRenderMode] = useState<'unified' | 'individual'>(renderSettings.renderMode);
  const [localIncludeSubtitles, setLocalIncludeSubtitles] = useState(renderSettings.includeSubtitles);
  const [localBitrate, setLocalBitrate] = useState(renderSettings.videoBitrate || 20);

  const effectivePreset = localPreset ?? bgmTrack.masterPreset;

  const applyLoudnessPreset = useCallback((p: typeof LOUDNESS_PRESETS[0]) => {
    setLocalLoudness({ enabled: true, targetLufs: p.lufs, truePeakDbtp: p.tp, lra: p.lra });
    setActivePresetId(p.id);
  }, []);

  const handleConfirm = useCallback(() => {
    setRenderSettings({
      loudness: localLoudness,
      masterPresetOverride: localPreset,
      renderMode: localRenderMode,
      includeSubtitles: localIncludeSubtitles,
      videoBitrate: localBitrate,
    });
    onConfirm();
  }, [localLoudness, localPreset, localRenderMode, localIncludeSubtitles, localBitrate, setRenderSettings, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl mx-4 overflow-hidden flex flex-col"
        style={{ maxWidth: 580, width: '100%', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50 bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center text-base">🎬</div>
            <div>
              <h2 className="text-sm font-bold text-white">렌더 설정</h2>
              <p className="text-[10px] text-gray-500">MP4 내보내기 전 품질 및 오디오 설정</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white flex items-center justify-center transition-colors text-xs">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ═══ 섹션: 비트레이트 ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-md bg-emerald-600/20 flex items-center justify-center text-emerald-400 text-xs">⚡</span>
              <span className="text-sm font-bold text-white">비트레이트</span>
            </div>
            <p className="text-[10px] text-gray-500 mb-3 ml-7">영상 품질과 파일 크기를 조절합니다.</p>
            <div className="grid grid-cols-5 gap-1.5">
              {BITRATE_PRESETS.map((b) => (
                <button
                  key={b.mbps}
                  type="button"
                  onClick={() => setLocalBitrate(b.mbps)}
                  className={`relative flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 transition-all ${
                    localBitrate === b.mbps
                      ? 'bg-emerald-600/10 border-emerald-500/60 text-emerald-400'
                      : 'bg-gray-800/50 border-gray-700/50 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {b.tag && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                      {b.tag}
                    </span>
                  )}
                  {localBitrate === b.mbps && (
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                    </span>
                  )}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    localBitrate === b.mbps ? 'bg-emerald-600/30' : 'bg-gray-700/50'
                  }`}>{b.icon}</span>
                  <span className="text-sm font-bold">{b.mbps} Mbps</span>
                  <span className="text-[9px] text-gray-500">{b.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ═══ 섹션: 자막 옵션 ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-md bg-amber-600/20 flex items-center justify-center text-amber-400 text-xs">💬</span>
              <span className="text-sm font-bold text-white">자막 옵션</span>
            </div>
            <p className="text-[10px] text-gray-500 mb-3 ml-7">자막 포함 여부를 설정합니다.</p>
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                localIncludeSubtitles
                  ? 'bg-emerald-600/5 border-emerald-500/30'
                  : 'bg-gray-800/50 border-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${
                  localIncludeSubtitles ? 'bg-emerald-600/20' : 'bg-gray-700/50'
                }`}>💬</span>
                <div>
                  <p className={`text-sm font-bold ${localIncludeSubtitles ? 'text-white' : 'text-gray-400'}`}>
                    자막 포함
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {localIncludeSubtitles ? '설정된 스타일의 자막이 영상에 포함됩니다' : '자막 없이 영상만 렌더링됩니다'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocalIncludeSubtitles(prev => !prev)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors ${localIncludeSubtitles ? 'bg-emerald-500 justify-end' : 'bg-gray-600 justify-start'}`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow mx-0.5" />
              </button>
            </div>
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ═══ 섹션: 렌더 모드 ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-white">렌더 모드</span>
              <span className="text-[9px] bg-amber-600/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold">output</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLocalRenderMode('unified')}
                className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  localRenderMode === 'unified'
                    ? 'bg-amber-600/15 text-amber-400 border-amber-500/40'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="text-[11px] font-bold">통합 렌더링</div>
                <div className="text-[8px] text-gray-500 mt-0.5">전체 장면을 하나의 MP4로</div>
              </button>
              <button
                type="button"
                onClick={() => setLocalRenderMode('individual')}
                className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
                  localRenderMode === 'individual'
                    ? 'bg-amber-600/15 text-amber-400 border-amber-500/40'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="text-[11px] font-bold">개별 장면</div>
                <div className="text-[8px] text-gray-500 mt-0.5">장면마다 별도 MP4 파일</div>
              </button>
            </div>
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ═══ 섹션: 라우드니스 ═══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">라우드니스 노멀라이즈</span>
                <span className="text-[9px] bg-amber-600/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold">loudnorm</span>
              </div>
              <button
                type="button"
                onClick={() => setLocalLoudness(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-10 h-5 rounded-full flex items-center transition-colors ${localLoudness.enabled ? 'bg-amber-500 justify-end' : 'bg-gray-600 justify-start'}`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow mx-0.5" />
              </button>
            </div>

            {localLoudness.enabled && (
              <>
                <div className="mb-3">
                  <p className="text-[10px] text-gray-500 mb-1.5 font-bold">플랫폼 프리셋</p>
                  <div className="grid grid-cols-4 gap-1">
                    {LOUDNESS_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyLoudnessPreset(p)}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                          activePresetId === p.id
                            ? 'bg-amber-600/20 text-amber-400 border-amber-500/40'
                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
                        }`}
                        title={p.desc}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
                  {[
                    { label: 'Target LUFS', key: 'targetLufs' as const, min: -24, max: -5, step: 0.5, unit: 'LUFS' },
                    { label: 'True Peak', key: 'truePeakDbtp' as const, min: -3, max: 0, step: 0.1, unit: 'dBTP' },
                    { label: 'LRA', key: 'lra' as const, min: 1, max: 20, step: 1, unit: 'LU' },
                  ].map(({ label, key, min, max, step, unit }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-400 w-20 text-right font-bold">{label}</span>
                      <input
                        type="range" min={min} max={max} step={step}
                        value={localLoudness[key]}
                        onChange={(e) => { setLocalLoudness(prev => ({ ...prev, [key]: Number(e.target.value) })); setActivePresetId(null); }}
                        className="flex-1 accent-amber-500 h-1"
                      />
                      <input
                        type="number" min={min} max={max} step={step}
                        value={localLoudness[key]}
                        onChange={(e) => {
                          const v = Math.max(min, Math.min(max, Number(e.target.value) || 0));
                          setLocalLoudness(prev => ({ ...prev, [key]: v }));
                          setActivePresetId(null);
                        }}
                        className="w-16 bg-gray-900 border border-gray-600 rounded text-center text-xs font-mono font-bold text-amber-400 focus:border-amber-500/50 focus:outline-none py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[9px] text-gray-500 w-8">{unit}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 px-3 py-1.5 bg-gray-950 rounded-lg border border-gray-800">
                  <span className="text-[9px] text-gray-600 font-mono">
                    loudnorm=I={localLoudness.targetLufs}:TP={localLoudness.truePeakDbtp}:LRA={localLoudness.lra}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-gray-700/50" />

          {/* ═══ 섹션: 오디오 마스터링 ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-white">오디오 마스터링</span>
              {localPreset === null && bgmTrack.masterPreset !== 'none' && (
                <span className="text-[9px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">BGM 설정 사용 중: {bgmTrack.masterPreset}</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MASTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLocalPreset(p.id === effectivePreset && localPreset !== null ? null : p.id)}
                  className={`px-2 py-2 rounded-lg border text-left transition-colors ${
                    effectivePreset === p.id
                      ? 'bg-amber-600/15 text-amber-400 border-amber-500/40'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className="text-[11px] font-bold">{p.label}</div>
                  <div className="text-[8px] text-gray-500 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
            {localPreset !== null && (
              <button
                type="button"
                onClick={() => setLocalPreset(null)}
                className="mt-1.5 text-[9px] text-gray-500 hover:text-gray-300 transition-colors"
              >BGM 패널 설정으로 되돌리기</button>
            )}
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="px-5 py-3 border-t border-gray-700/50 bg-gray-800/30 flex items-center justify-between flex-shrink-0">
          <div className="text-[10px] text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-emerald-400 font-bold">{localBitrate} Mbps</span>
            <span className="text-gray-600">|</span>
            {localLoudness.enabled
              ? <span className="text-amber-400 font-bold">LUFS {localLoudness.targetLufs}</span>
              : <span className="text-gray-600">LUFS OFF</span>
            }
            {effectivePreset !== 'none' && (
              <span className="text-gray-400">+ {effectivePreset}</span>
            )}
            <span className="text-gray-600">|</span>
            <span className={localRenderMode === 'unified' ? 'text-amber-400' : 'text-amber-400'}>
              {localRenderMode === 'unified' ? '통합' : '개별'}
            </span>
            <span className="text-gray-600">|</span>
            <span className={localIncludeSubtitles ? 'text-emerald-400' : 'text-gray-600'}>
              자막 {localIncludeSubtitles ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-bold border border-gray-600 transition-colors">
              취소
            </button>
            <button type="button" onClick={handleConfirm}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-sm font-bold border border-blue-400/50 shadow-md transition-colors">
              렌더 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RenderSettingsModal;

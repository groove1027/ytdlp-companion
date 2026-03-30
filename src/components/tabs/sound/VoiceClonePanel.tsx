import React, { useState, useRef, useCallback, useEffect } from 'react';
import { getCustomVoices, saveCustomVoice, deleteCustomVoice } from '../../../services/ttsService';
import type { CustomVoice } from '../../../services/ttsService';
import { logger } from '../../../services/LoggerService';
import { showToast } from '../../../stores/uiStore';

/** 대용량 ArrayBuffer → base64 (spread 없이 청크 처리) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(''));
}

/** 모든 오디오 포맷을 WAV로 변환 (AudioContext 디코딩 → PCM WAV 인코딩) */
async function convertToWav(blob: Blob): Promise<Blob> {
  const audioCtx = new AudioContext();
  try {
    const buffer = await blob.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(buffer);
    const offlineCtx = new OfflineAudioContext(1, decoded.length, decoded.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start();
    const rendered = await offlineCtx.startRendering();

    const samples = rendered.getChannelData(0);
    const wavBuffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(wavBuffer);
    const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    w(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    w(8, 'WAVE'); w(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, rendered.sampleRate, true);
    view.setUint32(28, rendered.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); // 16-bit
    w(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    audioCtx.close();
  }
}

export default function VoiceClonePanel() {
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);
  const [expanded, setExpanded] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadVoices = useCallback(async () => {
    const voices = await getCustomVoices();
    setCustomVoices(voices);
  }, []);

  useEffect(() => { loadVoices(); }, [loadVoices]);

  // cleanup on unmount (마이크 + 타이머 정리)
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingTime(0);
      setRecordedBlob(null);

      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (e) {
      showToast('마이크 접근이 거부되었습니다.');
      logger.trackSwallowedError('VoiceClonePanel:startRecording', e);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      showToast('오디오 파일만 업로드 가능합니다.');
      return;
    }
    setUploadedBlob(file);
    setRecordedBlob(null);
    setVoiceName(file.name.replace(/\.[^.]+$/, ''));
  }, []);

  const handleSave = useCallback(async () => {
    const blob = recordedBlob || uploadedBlob;
    if (!blob) return;
    if (!voiceName.trim()) { showToast('음성 이름을 입력해주세요.'); return; }

    setSaving(true);
    try {
      // 모든 포맷을 WAV로 변환 (MP3/M4A/WebM/OGG 포함)
      const wavBlob = blob.type === 'audio/wav' ? blob : await convertToWav(blob);
      const result = await saveCustomVoice(voiceName.trim(), wavBlob);
      showToast(`"${result.name}" 음성이 등록되었습니다!`);
      setVoiceName('');
      setRecordedBlob(null);
      setUploadedBlob(null);
      await loadVoices();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '음성 저장 실패');
    } finally {
      setSaving(false);
    }
  }, [recordedBlob, uploadedBlob, voiceName, loadVoices]);

  const handleDelete = useCallback(async (voiceId: string) => {
    try {
      await deleteCustomVoice(voiceId);
      showToast('음성이 삭제되었습니다.');
      await loadVoices();
    } catch {
      showToast('삭제 실패');
    }
  }, [loadVoices]);

  const audioBlob = recordedBlob || uploadedBlob;

  return (
    <div className="mt-3 bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-xl border border-amber-500/30 overflow-hidden">
      <button type="button" onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-500/5 transition">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <span className="font-bold text-amber-300">내 목소리로 TTS</span>
          <span className="text-xs text-amber-500 bg-amber-900/30 px-2 py-0.5 rounded">Voice Clone</span>
          {customVoices.length > 0 && <span className="text-xs text-gray-400">{customVoices.length}개 등록됨</span>}
        </div>
        <span className="text-gray-500">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-gray-400">
            3초 이상 녹음하거나 음성 파일을 업로드하면 그 목소리로 TTS를 생성합니다.
            <br />Qwen3-TTS CustomVoice 모델 사용 (첫 사용 시 자동 다운로드).
          </p>

          <div className="flex gap-3">
            <div className="flex-1 bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <div className="text-sm font-semibold text-gray-300 mb-2">🎤 마이크 녹음</div>
              {isRecording ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-red-400 font-mono text-sm">{recordingTime}초</span>
                    {recordingTime < 3 && <span className="text-xs text-yellow-500">(최소 3초)</span>}
                  </div>
                  <button onClick={stopRecording} disabled={recordingTime < 3}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded text-sm font-semibold transition">
                    ⬛ 녹음 중지
                  </button>
                </div>
              ) : (
                <button onClick={startRecording}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-sm font-semibold transition">
                  ● 녹음 시작
                </button>
              )}
              {recordedBlob && !isRecording && (
                <div className="mt-2 text-xs text-green-400">
                  ✅ {recordingTime}초 녹음 완료 ({(recordedBlob.size / 1024).toFixed(0)}KB)
                </div>
              )}
            </div>

            <div className="flex-1 bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <div className="text-sm font-semibold text-gray-300 mb-2">📁 파일 업로드</div>
              <label className="block">
                <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                <span className="inline-block px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm font-semibold cursor-pointer transition">
                  파일 선택
                </span>
              </label>
              {uploadedBlob && (
                <div className="mt-2 text-xs text-green-400">
                  ✅ {(uploadedBlob as File).name || '업로드됨'} ({(uploadedBlob.size / 1024).toFixed(0)}KB)
                </div>
              )}
            </div>
          </div>

          {audioBlob && (
            <div className="flex items-center gap-2 bg-gray-900/50 rounded-lg p-3 border border-amber-500/20">
              <input type="text" value={voiceName} onChange={e => setVoiceName(e.target.value)}
                placeholder="음성 이름 (예: 내 목소리)"
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none" />
              <button onClick={handleSave} disabled={saving || !voiceName.trim()}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded text-sm font-bold transition whitespace-nowrap">
                {saving ? '저장 중...' : '💾 음성 등록'}
              </button>
            </div>
          )}

          {customVoices.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-gray-300">등록된 음성</div>
              {customVoices.map(voice => (
                <div key={voice.id} className="flex items-center justify-between bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400">🎙️</span>
                    <span className="text-sm text-white font-medium">{voice.name}</span>
                    <span className="text-xs text-gray-500">
                      {voice.fileSize ? `${(voice.fileSize / 1024).toFixed(0)}KB` : ''}
                    </span>
                  </div>
                  <button onClick={() => handleDelete(voice.id)}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-900/20 transition">
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

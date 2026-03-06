
import React, { useState, useRef, useEffect } from 'react';
import { VideoModel, AspectRatio } from '../types';
import { RATIOS } from '../constants';
import { uploadMediaToHosting } from '../services/uploadService';
import { createLaozhangVeoTaskExperimental, pollLaozhangVeoTask, createPortableGrokTask, pollKieTask } from '../services/VideoGenService';
import { showToast } from '../stores/uiStore';
import { useElapsedTimer, formatElapsed } from '../hooks/useElapsedTimer';

const QuickLab: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<VideoModel>(VideoModel.VEO);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);
  const [isLoading, setIsLoading] = useState(false);
  const elapsed = useElapsedTimer(isLoading);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    setLogs(prev => [...prev, `[${timestamp}] ${prefix} ${msg}`]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      addLog(`이미지 선택됨: ${file.name}`);
      setResultUrl(null);
    }
  };

  const handleClearImage = () => {
      setImageFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      addLog(`이미지 제거됨`);
  };

  const handleRunTest = async () => {
    if (!imageFile) { showToast("이미지를 업로드해주세요."); return; }
    if (!prompt.trim()) { showToast("프롬프트를 입력해주세요."); return; }

    setIsLoading(true);
    setResultUrl(null);
    setLogs([]); // Clear previous logs
    addLog(`🧪 실험실 테스트 시작: ${model} (${aspectRatio})`);

    try {
      // 1. Upload Image
      addLog("이미지 호스팅 업로드 중...", 'info');
      const publicUrl = await uploadMediaToHosting(imageFile);
      addLog(`이미지 업로드 완료: ${publicUrl}`, 'success');

      // 2. API Call
      addLog(`${model} 작업 요청 전송 중...`, 'info');
      let taskId = "";

      if (model === VideoModel.VEO || model === VideoModel.VEO_QUALITY) {
          // [UPDATED] Use Evolink Veo 3.1 Fast
          addLog(`[Evolink] 모델명 '${model === VideoModel.VEO ? 'veo-3.1-evolink' : 'veo3-quality'}' 파라미터 테스트`);
          taskId = await createLaozhangVeoTaskExperimental(prompt, publicUrl, aspectRatio, model);
      } else {
          taskId = await createPortableGrokTask(prompt, publicUrl, aspectRatio);
      }
      
      addLog(`작업 ID 획득: ${taskId}`, 'success');
      addLog("영상 생성 대기 중 (Polling)...", 'info');

      // 3. Polling
      let videoUrl = "";
      if (model === VideoModel.VEO || model === VideoModel.VEO_QUALITY) {
          videoUrl = await pollLaozhangVeoTask(taskId);
      } else {
          videoUrl = await pollKieTask(taskId);
      }

      setResultUrl(videoUrl);
      addLog(`영상 생성 성공! URL: ${videoUrl}`, 'success');

    } catch (error: any) {
      console.error(error);
      addLog(`오류 발생: ${error.message}`, 'error');
      
      // Detailed error breakdown for user
      if (error.message.includes("403")) {
          addLog("💡 [진단] 403 PERMISSION_DENIED: 권한 문제입니다. 모델명이나 API 키 권한을 확인하세요.", 'error');
      } else if (error.message.includes("404")) {
          addLog("💡 [진단] 404 NOT FOUND: 요청한 모델명을 서버가 찾지 못했습니다.", 'error');
      } else if (error.message.includes("401")) {
          addLog("💡 [진단] 401 UNAUTHENTICATED: API 키가 잘못되었습니다.", 'error');
      } else if (error.message.includes("402")) {
          addLog("💡 [진단] 402 PAYMENT_REQUIRED: 크레딧이 부족합니다.", 'error');
      }

    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fade-in-up">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-700 rounded-lg flex items-center justify-center text-2xl shadow-lg">
            🧪
        </div>
        <div>
            <h1 className="text-3xl font-bold text-white">영상 생성 실험실 (Quick Lab)</h1>
            <p className="text-gray-400 text-sm">스토리보드 없이 모델의 권한과 성능을 즉시 테스트해보세요.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Controls */}
        <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
                <h3 className="font-bold text-lg text-white mb-4">1. 소스 이미지</h3>
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative w-full aspect-video rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden group ${imageFile ? 'border-green-500 bg-black' : 'border-gray-600 hover:border-gray-400 hover:bg-gray-700'}`}
                >
                    {previewUrl ? (
                        <>
                            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                            {/* [NEW] Clear Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearImage();
                                }}
                                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 transition-colors z-20 shadow-md flex items-center justify-center"
                                title="제거"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </>
                    ) : (
                        <div className="text-center text-gray-500">
                            <p className="text-2xl mb-2">📸</p>
                            <p className="text-sm font-bold">이미지 업로드</p>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                         <span className="text-white font-bold border border-white px-3 py-1 rounded-full">이미지 변경</span>
                    </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
                <h3 className="font-bold text-lg text-white mb-4">2. 설정 및 실행</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">프롬프트 (명령어)</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="예: A futuristic city with flying cars, cinematic lighting, 4k"
                            className="w-full h-24 bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-green-500 resize-none text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">테스트할 모델</label>
                            <select 
                                value={model}
                                onChange={(e) => setModel(e.target.value as VideoModel)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-green-500"
                            >
                                <option value={VideoModel.VEO}>Evolink Veo 3.1 1080p</option>
                                <option value={VideoModel.VEO_QUALITY}>Veo 3.1 Quality</option>
                                <option value={VideoModel.GROK}>Grok (Kie.ai)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">화면 비율</label>
                            <select 
                                value={aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:ring-green-500"
                            >
                                {RATIOS.map((r) => (
                                    <option key={r.id} value={r.id}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={handleRunTest}
                        disabled={isLoading}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2 ${
                            isLoading 
                            ? 'bg-gray-600 cursor-not-allowed opacity-80' 
                            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 hover:scale-[1.02] text-white'
                        }`}
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                테스트 실행 중...
                                {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}
                            </>
                        ) : (
                            '⚡ 생성 테스트 시작'
                        )}
                    </button>
                </div>
            </div>
        </div>

        {/* Right: Results & Logs */}
        <div className="space-y-6 flex flex-col h-full">
             {/* Result Area */}
             <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl flex-grow min-h-[300px] flex flex-col">
                <h3 className="font-bold text-lg text-white mb-4">3. 결과 확인 & 디버그 로그</h3>
                
                {resultUrl ? (
                    <div className="mb-6 bg-black rounded-lg overflow-hidden border border-green-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                         <video src={resultUrl} controls autoPlay loop className="w-full h-full object-contain aspect-video" />
                    </div>
                ) : (
                    <div className="mb-6 bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center h-48 md:h-64 text-gray-500 flex-col">
                        {isLoading ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <div className="text-4xl mb-2">📡</div>
                                <p>서버 통신 중... {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</p>
                            </div>
                        ) : (
                            <p>결과 영상이 여기에 표시됩니다.</p>
                        )}
                    </div>
                )}

                {/* Console Log Area */}
                <div className="flex-grow bg-black rounded-lg border border-gray-700 p-4 font-mono text-xs overflow-y-auto max-h-[300px] shadow-inner text-green-400 space-y-1">
                    <div className="text-gray-500 border-b border-gray-800 pb-2 mb-2">System Console Output</div>
                    {logs.length === 0 && <span className="text-gray-600 italic">Waiting for input...</span>}
                    {logs.map((log, i) => (
                        <div key={i} className={`${log.includes('❌') ? 'text-red-400 font-bold bg-red-900/10 p-1 rounded' : log.includes('✅') ? 'text-green-300 font-bold' : ''}`}>
                            {log}
                        </div>
                    ))}
                    <div ref={logEndRef} />
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};

export default QuickLab;

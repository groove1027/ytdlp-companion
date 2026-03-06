
import React, { useState, useEffect } from 'react';
import { getStoredKeys, saveApiKeys } from '../services/apiService';
import { showToast } from '../stores/uiStore';

interface ApiKeySettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose }) => {
    const [keys, setKeys] = useState({ kie: '', laozhang: '', cloudName: '', uploadPreset: '', gemini: '', apimart: '', removeBg: '', wavespeed: '', xai: '', evolink: '', youtubeApiKey: '', typecast: '' });
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const stored = getStoredKeys();
            setKeys({
                kie: stored.kie,
                laozhang: stored.laozhang,
                cloudName: stored.cloudName,
                uploadPreset: stored.uploadPreset,
                gemini: stored.gemini,
                apimart: stored.apimart,
                removeBg: stored.removeBg,
                wavespeed: stored.wavespeed,
                xai: stored.xai,
                evolink: stored.evolink,
                youtubeApiKey: stored.youtubeApiKey,
                typecast: stored.typecast,
            });
        }
    }, [isOpen]);

    // ESC 키로 닫기
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleSave = () => {
        saveApiKeys(keys.kie, keys.laozhang, keys.cloudName, keys.uploadPreset, keys.laozhang, keys.apimart, keys.removeBg, keys.wavespeed, keys.xai, keys.evolink, keys.youtubeApiKey, keys.typecast);
        showToast('설정이 저장되었습니다. 페이지를 새로고침합니다.', 1500);
        setTimeout(() => window.location.reload(), 1500);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto animate-fade-in-up custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                        API 연결 설정
                    </h2>
                    <button onClick={() => setShowPassword(!showPassword)} className="text-sm text-gray-400 hover:text-white underline">
                        {showPassword ? '키 숨기기' : '키 표시하기'}
                    </button>
                </div>

                {/* ── 필수 API ── */}
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">필수</p>
                <div className="space-y-6">
                    {/* 1. Evolink AI */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-emerald-400 uppercase tracking-wider">🧬 EVOLINK AI API</h3>
                            <span className="text-sm text-gray-400">Gemini 3.1 Pro 텍스트 분석(1순위), NanoBanana 2 이미지, Veo 3.1 1080p 영상</span>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.evolink} onChange={(e) => setKeys({...keys, evolink: e.target.value})} placeholder="Evolink AI API Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* 2. KIE */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-purple-400 uppercase tracking-wider">🚀 KIE API</h3>
                            <span className="text-sm text-gray-400">NanoBanana 2 이미지, Grok 영상, ElevenLabs TTS/STT, Suno 음악</span>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.kie} onChange={(e) => setKeys({...keys, kie: e.target.value})} placeholder="Kie API Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* 3. Laozhang */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-indigo-400 uppercase tracking-wider">⚡ LAOZHANG API</h3>
                            <span className="text-sm text-gray-400">이미지 생성/편집(Gemini 3 Pro Image), Gemini 텍스트 분석(2순위)</span>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.laozhang} onChange={(e) => setKeys({...keys, laozhang: e.target.value})} placeholder="Laozhang API Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* 4. Cloudinary */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-green-400 uppercase tracking-wider">☁️ CLOUDINARY</h3>
                            <span className="text-sm text-gray-400">이미지/영상 업로드 호스팅 (영상 생성 시 필수)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type="text" value={keys.cloudName} onChange={(e) => setKeys({...keys, cloudName: e.target.value})} placeholder="Cloud Name" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                            <input type="text" value={keys.uploadPreset} onChange={(e) => setKeys({...keys, uploadPreset: e.target.value})} placeholder="Upload Preset" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                        </div>
                    </div>
                </div>

                {/* ── 선택 API ── */}
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-6 mb-1">선택</p>
                <div className="space-y-6">
                    {/* 5. Typecast — TTS 음성 합성 */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-blue-400 uppercase tracking-wider">🎭 TYPECAST API</h3>
                            <span className="text-sm text-gray-400">AI 음성 합성 (TTS) — 542개 캐릭터</span>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.typecast}
                            onChange={(e) => {
                                setKeys({...keys, typecast: e.target.value});
                            }}
                            onBlur={() => {
                                try {
                                  import('../services/typecastService').then(m => m.clearTypecastVoiceCache());
                                  window.dispatchEvent(new Event('typecast-key-changed'));
                                } catch {}
                            }}
                            placeholder="Typecast API Key (typecast.ai에서 발급)"
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                        <p className="text-sm text-gray-500 leading-tight">
                            * <a href="https://typecast.ai" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">typecast.ai</a>에서 발급
                        </p>
                    </div>

                    {/* 6. Remove.bg — 배경 제거 */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-orange-400 uppercase tracking-wider">✂️ REMOVE.BG</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-gray-400">이미지 배경 제거 (누끼) 자동화</span>
                                <span className="text-[11px] text-white bg-red-600 px-1.5 py-0.5 rounded-full font-bold animate-pulse shadow-md">
                                    ✨ 월 50회 무료
                                </span>
                            </div>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.removeBg} onChange={(e) => setKeys({...keys, removeBg: e.target.value})} placeholder="Remove.bg API Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                        <p className="text-sm text-gray-500 leading-tight">
                            * 키 입력 시 이미지 업로드할 때 <strong>자동 누끼 처리</strong> + AI 분석 성능 향상
                        </p>
                    </div>

                    {/* 7. YouTube Data API */}
                    <div className="space-y-3">
                        <div className="flex flex-col">
                            <h3 className="text-base font-bold text-rose-400 uppercase tracking-wider">📺 YOUTUBE API</h3>
                            <span className="text-sm text-gray-400">YouTube Data API v3 — 채널분석, 키워드 검색</span>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.youtubeApiKey} onChange={(e) => setKeys({...keys, youtubeApiKey: e.target.value})} placeholder="YouTube Data API v3 Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>
                </div>

                <div className="flex gap-3 mt-8 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-base font-bold transition-colors">닫기</button>
                    <button onClick={handleSave} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-base font-bold shadow-lg transition-transform hover:scale-105">설정 저장 및 적용</button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeySettings;

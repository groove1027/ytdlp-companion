
import React, { useState, useEffect } from 'react';
import { getStoredKeys, saveApiKeys } from '../services/apiService';
import { showToast } from '../stores/uiStore';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { logger } from '../services/LoggerService';

interface ApiKeySettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

// ── 스마트 감지 시스템 ──

interface DetectedKey {
    value: string;
    service: string; // keys field name or ''
    method: 'label' | 'pattern' | 'guess';
}

const SERVICE_OPTIONS = [
    { value: 'evolink', label: 'Evolink AI' },
    { value: 'kie', label: 'KIE' },
    { value: 'cloudName', label: 'Cloud Name' },
    { value: 'uploadPreset', label: 'Upload Preset' },
    { value: 'typecast', label: 'Typecast' },
    { value: 'youtubeApiKey', label: 'YouTube API' },
    { value: 'ghostcutAppKey', label: 'GhostCut AppKey' },
    { value: 'ghostcutAppSecret', label: 'GhostCut AppSecret' },
    { value: 'removeBg', label: 'Remove.bg' },
    { value: 'apimart', label: 'APIMart' },
    { value: 'xai', label: 'X AI' },
    { value: 'gemini', label: 'Gemini' },
];

const EXPORT_MAP: [string, string][] = [
    ['EVOLINK', 'evolink'],
    ['KIE', 'kie'],
    ['CLOUD_NAME', 'cloudName'],
    ['UPLOAD_PRESET', 'uploadPreset'],
    ['TYPECAST', 'typecast'],
    ['YOUTUBE_API_KEY', 'youtubeApiKey'],
    ['GHOSTCUT_APP_KEY', 'ghostcutAppKey'],
    ['GHOSTCUT_APP_SECRET', 'ghostcutAppSecret'],
    ['REMOVE_BG', 'removeBg'],
    ['APIMART', 'apimart'],
    ['X_AI', 'xai'],
    ['GEMINI', 'gemini'],
];

// 라벨→필드 매핑 (KEY=VALUE, JSON, 주변 텍스트 감지용)
const LABEL_MAP: [RegExp, string][] = [
    [/evolink/i, 'evolink'],
    [/\bkie\b/i, 'kie'],
    [/cloud[\s_.-]?name/i, 'cloudName'],
    [/upload[\s_.-]?preset/i, 'uploadPreset'],
    [/cloudinary/i, 'cloudName'],
    [/typecast/i, 'typecast'],
    [/youtube|google[\s_.-]?api/i, 'youtubeApiKey'],
    [/ghostcut[\s_.-]?app[\s_.-]?key/i, 'ghostcutAppKey'],
    [/ghostcut[\s_.-]?app[\s_.-]?secret/i, 'ghostcutAppSecret'],
    [/ghostcut.*secret/i, 'ghostcutAppSecret'],
    [/ghostcut.*key/i, 'ghostcutAppKey'],
    [/ghostcut/i, 'ghostcutAppKey'],
    [/remove[\s_.-]?bg|배경[\s_.-]?제거/i, 'removeBg'],
    [/apimart/i, 'apimart'],
    [/\bx[\s_.-]?ai\b|^xai$/i, 'xai'],
    [/gemini/i, 'gemini'],
    [/laozhang/i, 'laozhang'],
    [/giphy/i, 'giphy'],
];

// 패턴→서비스 규칙 (키 값 자체의 형태로 판별)
const PATTERN_RULES: [RegExp, string][] = [
    [/^AIzaSy[A-Za-z0-9_-]{25,}$/, 'youtubeApiKey'],   // Google API 키 — 고유 prefix
    [/^[0-9a-f]{32}$/i, 'kie'],                          // 32자 hex — KIE 고유 포맷
];

const maskKey = (key: string): string => {
    if (key.length <= 14) return key;
    return `${key.slice(0, 8)}····${key.slice(-4)}`;
};

// 텍스트에서 키-like 토큰 여부 판별 (라벨 단어 제외)
const LABEL_WORDS = /^(evolink|kie|cloudinary|typecast|youtube|google|cloud|upload|preset|api|key|name|설정|필수|선택|ai|tts|stt)$/i;
const isKeyToken = (s: string): boolean => s.length >= 8 && /^[A-Za-z0-9\-_]+$/.test(s) && !LABEL_WORDS.test(s);

/**
 * 스마트 감지: 어떤 형태의 텍스트든 분석하여 API 키를 추출하고 서비스를 추정
 * 1) KEY=VALUE / JSON → 라벨 기반
 * 2) 주변 텍스트에 서비스명 언급 → 컨텍스트 기반
 * 3) 키 값의 패턴(AIzaSy, 32hex, sk-) → 패턴 기반
 * 4) sk- 키가 여러 개면 순서대로 evolink 할당
 */
const smartDetect = (text: string): DetectedKey[] => {
    const results: DetectedKey[] = [];
    const assigned = new Set<string>();
    const trimmed = text.trim();

    // Phase 1: JSON 파싱 시도
    if (trimmed.startsWith('{')) {
        try {
            const json = JSON.parse(trimmed);
            for (const [k, v] of Object.entries(json)) {
                if (typeof v !== 'string' || v.length < 4) continue;
                const norm = k.toLowerCase().replace(/[\s\-]/g, '_');
                let service = '';
                for (const [re, svc] of LABEL_MAP) {
                    if (re.test(norm) && !assigned.has(svc)) { service = svc; break; }
                }
                if (service) assigned.add(service);
                results.push({ value: v, service, method: service ? 'label' : 'guess' });
            }
            if (results.length > 0) return assignRemaining(results, assigned);
        } catch (e) { logger.trackSwallowedError('ApiKeySettings:smartPaste/jsonParse', e); }
    }

    // Phase 2: 줄 단위 분석 — [Label] + 다음 줄 키 형식 지원
    const lines = trimmed.split('\n').map(l => l.trim());
    let pendingLabel = ''; // [Label] 형태가 발견되면 다음 줄에 적용

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (!line) { pendingLabel = ''; continue; }

        // [Label] 형태 감지 — 대괄호 라벨만 있는 줄
        const bracketMatch = line.match(/^\[([^\]]+)\]$/);
        if (bracketMatch) {
            pendingLabel = bracketMatch[1].trim();
            continue;
        }

        // KEY=VALUE 또는 KEY:VALUE 에서 값 추출 시도
        const sepMatch = line.match(/^([^=:]+)[=:](.+)$/);
        if (sepMatch) {
            const label = sepMatch[1].trim();
            const value = sepMatch[2].trim().replace(/^["'\s]+|["'\s]+$/g, '');
            if (value.length < 4) { pendingLabel = ''; continue; }

            let service = '';
            // pendingLabel + 현재 라벨을 합쳐서 컨텍스트로 사용
            const fullLabel = pendingLabel ? `${pendingLabel} ${label}` : label;
            const labelNorm = fullLabel.toLowerCase().replace(/[\s\-]/g, '_');
            for (const [re, svc] of LABEL_MAP) {
                if (re.test(labelNorm) && !assigned.has(svc)) { service = svc; break; }
            }
            if (service) assigned.add(service);
            results.push({ value, service, method: service ? 'label' : 'guess' });
            // GhostCut처럼 같은 라벨 아래 Key/Secret이 연속되면 pendingLabel 유지
            if (pendingLabel && /key|app\s*key/i.test(label)) { /* pendingLabel 유지 */ }
            else { pendingLabel = ''; }
            continue;
        }

        // 자유 형식: 토큰 분리 후 키-like 토큰 찾기
        const tokens = line.split(/[\s,\t|"']+/).filter(Boolean);
        const keyTokens = tokens.filter(isKeyToken);

        // 키 토큰이 없으면 라벨 텍스트일 수 있음 → pendingLabel로 저장
        if (keyTokens.length === 0) {
            pendingLabel = line;
            continue;
        }

        // 키 토큰마다 처리 (Cloudinary처럼 한 라벨 아래 여러 키가 올 수 있음)
        for (const value of keyTokens) {
            // 컨텍스트: pendingLabel + 같은 줄의 나머지 텍스트
            const contextParts = tokens.filter(t => t !== value).join(' ');
            const fullContext = pendingLabel ? `${pendingLabel} ${contextParts}` : contextParts;

            let service = '';
            for (const [re, svc] of LABEL_MAP) {
                if (re.test(fullContext) && !assigned.has(svc)) { service = svc; break; }
            }
            if (service) assigned.add(service);
            results.push({ value, service, method: service ? 'label' : 'guess' });
        }

        // Cloudinary 특수: [Cloudinary] 아래 두 줄(cloudName, uploadPreset)
        // pendingLabel에 cloudinary가 있고 다음 줄도 키면 유지
        const nextLine = li + 1 < lines.length ? lines[li + 1] : '';
        const nextTokens = nextLine ? nextLine.split(/[\s,\t|"']+/).filter(Boolean).filter(isKeyToken) : [];
        if (!(pendingLabel && /cloudinary/i.test(pendingLabel) && nextTokens.length > 0)) {
            pendingLabel = '';
        }
    }

    return assignRemaining(results, assigned);
};

/** 미할당 키에 패턴 기반 + sk- 순서 할당 적용 */
const assignRemaining = (entries: DetectedKey[], assigned: Set<string>): DetectedKey[] => {
    // 패턴 기반 할당
    for (const entry of entries) {
        if (entry.service) continue;
        for (const [re, svc] of PATTERN_RULES) {
            if (re.test(entry.value) && !assigned.has(svc)) {
                entry.service = svc;
                entry.method = 'pattern';
                assigned.add(svc);
                break;
            }
        }
    }

    // sk- prefix 키: evolink 할당
    const skOrder = ['evolink'];
    for (const entry of entries) {
        if (entry.service) continue;
        if (entry.value.startsWith('sk-')) {
            for (const svc of skOrder) {
                if (!assigned.has(svc)) {
                    entry.service = svc;
                    entry.method = 'guess';
                    assigned.add(svc);
                    break;
                }
            }
        }
    }

    // 짧은 토큰(8~20자, sk-/AIza 아닌): cloudName → uploadPreset 순서
    const shortOrder = ['cloudName', 'uploadPreset'];
    for (const entry of entries) {
        if (entry.service) continue;
        if (entry.value.length <= 20 && !entry.value.startsWith('sk-') && !entry.value.startsWith('AIza')) {
            for (const svc of shortOrder) {
                if (!assigned.has(svc)) {
                    entry.service = svc;
                    entry.method = 'guess';
                    assigned.add(svc);
                    break;
                }
            }
        }
    }

    return entries;
};

// ── 컴포넌트 ──

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose }) => {
    const { requireAuth } = useAuthGuard();
    const [keys, setKeys] = useState({ kie: '', cloudName: '', uploadPreset: '', gemini: '', apimart: '', removeBg: '', wavespeed: '', xai: '', evolink: '', youtubeApiKey: '', typecast: '', ghostcutAppKey: '', ghostcutAppSecret: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [detected, setDetected] = useState<DetectedKey[]>([]);
    const [bulkMsg, setBulkMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    // 스마트 분석 실행
    const handleAnalyze = () => {
        if (!bulkText.trim()) { setBulkMsg({ type: 'err', text: '내용을 입력해주세요.' }); return; }
        const results = smartDetect(bulkText);
        if (results.length === 0) { setBulkMsg({ type: 'err', text: '인식 가능한 API 키를 찾지 못했습니다.' }); return; }
        setDetected(results);
        setBulkMsg(null);
    };

    // 감지 결과 적용
    const handleApplyDetected = () => {
        const updates: Record<string, string> = {};
        let count = 0;
        for (const entry of detected) {
            if (entry.service) {
                updates[entry.service] = entry.value;
                count++;
            }
        }
        if (count === 0) { setBulkMsg({ type: 'err', text: '적용할 키가 없습니다. 서비스를 선택해주세요.' }); return; }
        setKeys(prev => ({ ...prev, ...updates }));
        setDetected([]);
        setBulkText('');
        setBulkMsg({ type: 'ok', text: `${count}개 키가 반영되었습니다. "설정 저장 및 적용"을 눌러주세요.` });
    };

    // 감지 항목의 서비스 변경
    const updateDetectedService = (idx: number, service: string) => {
        setDetected(prev => prev.map((e, i) => i === idx ? { ...e, service, method: service ? 'label' as const : 'guess' as const } : e));
    };

    // 현재 설정 내보내기 (클립보드)
    const handleExport = async () => {
        if (!requireAuth('API 키 내보내기')) return;
        const lines = EXPORT_MAP
            .filter(([, field]) => keys[field as keyof typeof keys])
            .map(([label, field]) => `${label}=${keys[field as keyof typeof keys]}`);
        if (lines.length === 0) { showToast('내보낼 키가 없습니다.'); return; }
        await navigator.clipboard.writeText(lines.join('\n'));
        showToast(`${lines.length}개 키가 클립보드에 복사되었습니다.`);
    };

    // 파일 업로드
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string;
            setBulkText(text);
            const results = smartDetect(text);
            if (results.length > 0) {
                setDetected(results);
                setBulkMsg(null);
            } else {
                setBulkMsg({ type: 'err', text: '파일에서 인식 가능한 키를 찾지 못했습니다.' });
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    useEffect(() => {
        if (isOpen) {
            setShowBulk(false);
            setBulkText('');
            setDetected([]);
            setBulkMsg(null);
            const stored = getStoredKeys();
            setKeys({
                kie: stored.kie,
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
                ghostcutAppKey: stored.ghostcutAppKey,
                ghostcutAppSecret: stored.ghostcutAppSecret,
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
        if (!requireAuth('API 키 저장')) return;
        saveApiKeys(keys.kie, keys.cloudName, keys.uploadPreset, undefined, keys.apimart, keys.removeBg, keys.wavespeed, keys.xai, keys.evolink, keys.youtubeApiKey, keys.typecast, keys.ghostcutAppKey, keys.ghostcutAppSecret);
        showToast('설정이 저장되었습니다. 페이지를 새로고침합니다.', 1500);
        setTimeout(() => window.location.reload(), 1500);
    };

    if (!isOpen) return null;

    const methodLabel = (m: DetectedKey['method']) =>
        m === 'label' ? '라벨' : m === 'pattern' ? '패턴' : '추정';
    const methodColor = (m: DetectedKey['method']) =>
        m === 'label' ? 'bg-green-600/20 text-green-400 border-green-500/30' :
        m === 'pattern' ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' :
        'bg-amber-600/20 text-amber-400 border-amber-500/30';

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

                {/* ── 일괄 가져오기/내보내기 ── */}
                <div className="mb-5">
                    <button
                        onClick={() => { setShowBulk(!showBulk); setBulkMsg(null); setDetected([]); }}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-900 hover:bg-gray-850 border border-gray-700 rounded-lg text-sm text-gray-300 transition-all"
                    >
                        <span className="flex items-center gap-2 font-bold">📋 일괄 가져오기 / 내보내기</span>
                        <span className={`text-gray-500 transition-transform ${showBulk ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {showBulk && (
                        <div className="mt-2 p-3 bg-gray-900 border border-gray-700 rounded-lg space-y-3">
                            <p className="text-xs text-gray-500 leading-relaxed">
                                API 키를 아무 형태로 붙여넣으세요. 자동으로 어떤 서비스의 키인지 감지합니다.<br/>
                                <span className="text-gray-600">KEY=값, JSON, 라벨+키, 키만 나열 — 모두 OK</span>
                            </p>
                            <textarea
                                value={bulkText}
                                onChange={(e) => { setBulkText(e.target.value); setDetected([]); setBulkMsg(null); }}
                                placeholder={`예시 1) 라벨 형식:\nEVOLINK=sk-abc123...\nKIE=c1865a4b...\n\n예시 2) 그냥 키만:\nsk-gDTBC6cmqoo4IKU...\nc1865a4bce680c770...\nAIzaSyDCZ4kTRy3VR8...\n\n예시 3) 자유 형식:\nEvolink API 키 sk-abc123...`}
                                rows={5}
                                className="w-full bg-gray-950 border border-gray-600 rounded-lg p-2.5 text-sm text-gray-200 placeholder-gray-700 font-mono focus:outline-none focus:border-blue-500/50 resize-none"
                            />

                            {/* 알림 메시지 */}
                            {bulkMsg && (
                                <p className={`text-xs ${bulkMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                                    {bulkMsg.type === 'ok' ? '✓' : '✗'} {bulkMsg.text}
                                </p>
                            )}

                            {/* 감지 결과 미리보기 */}
                            {detected.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-gray-700">
                                    <p className="text-xs font-bold text-amber-400">감지된 키 {detected.length}개 — 서비스 매핑을 확인하세요</p>
                                    {detected.map((entry, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-gray-950 rounded-lg px-3 py-2">
                                            <code className="text-xs text-gray-400 font-mono truncate min-w-0 flex-1" title={entry.value}>
                                                {maskKey(entry.value)}
                                            </code>
                                            <span className="text-gray-600 text-xs">→</span>
                                            <select
                                                value={entry.service}
                                                onChange={(e) => updateDetectedService(i, e.target.value)}
                                                className={`bg-gray-800 border rounded px-2 py-1 text-xs font-bold cursor-pointer focus:outline-none ${
                                                    entry.service
                                                        ? 'border-gray-600 text-gray-200'
                                                        : 'border-amber-500/50 text-amber-400'
                                                }`}
                                            >
                                                <option value="">— 선택 —</option>
                                                {SERVICE_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${methodColor(entry.method)}`}>
                                                {methodLabel(entry.method)}
                                            </span>
                                        </div>
                                    ))}
                                    <button
                                        onClick={handleApplyDetected}
                                        className="w-full py-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-lg text-sm font-bold transition-all"
                                    >
                                        입력란에 적용하기
                                    </button>
                                </div>
                            )}

                            {/* 버튼 행 */}
                            {detected.length === 0 && (
                                <div className="flex gap-2">
                                    <button onClick={handleAnalyze} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all">자동 감지</button>
                                    <label className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-bold transition-all text-center cursor-pointer">
                                        파일 업로드
                                        <input type="file" accept=".txt,.json,.env,.cfg" onChange={handleFileUpload} className="hidden" />
                                    </label>
                                    <button onClick={handleExport} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-bold transition-all">현재 설정 복사</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── 필수 API ── */}
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1">필수</p>
                <div className="space-y-6">
                    {/* 1. Evolink AI */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <h3 className="text-base font-bold text-emerald-400 uppercase tracking-wider">🧬 EVOLINK AI API</h3>
                                <span className="text-sm text-gray-400">Gemini 3.1 Pro 텍스트 분석(1순위), NanoBanana 2 이미지, Veo 3.1 1080p 영상</span>
                            </div>
                            <a href="https://evolink.ai/dashboard" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1">키 발급 ↗</a>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.evolink} onChange={(e) => setKeys({...keys, evolink: e.target.value})} placeholder="Evolink AI API Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* 2. KIE */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <h3 className="text-base font-bold text-purple-400 uppercase tracking-wider">🚀 KIE API</h3>
                                <span className="text-sm text-gray-400">NanoBanana 2 이미지, Grok 영상, ElevenLabs TTS/STT, Suno 음악</span>
                            </div>
                            <a href="https://kie.ai/api-key" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1">키 발급 ↗</a>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.kie} onChange={(e) => setKeys({...keys, kie: e.target.value})} placeholder="Kie API Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* 3. Cloudinary */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <h3 className="text-base font-bold text-green-400 uppercase tracking-wider">☁️ CLOUDINARY</h3>
                                <span className="text-sm text-gray-400">이미지/영상 업로드 호스팅 (영상 생성 시 필수)</span>
                            </div>
                            <a href="https://console.cloudinary.com/pm/developer-dashboard" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 px-2.5 py-1 bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 text-green-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1">대시보드 ↗</a>
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
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <h3 className="text-base font-bold text-blue-400 uppercase tracking-wider">🎭 TYPECAST API</h3>
                                <span className="text-sm text-gray-400">AI 음성 합성 (TTS) — 542개 캐릭터</span>
                            </div>
                            <a href="https://typecast.ai/developers" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1">키 발급 ↗</a>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.typecast}
                            onChange={(e) => {
                                setKeys({...keys, typecast: e.target.value});
                            }}
                            onBlur={() => {
                                try {
                                  import('../services/typecastService').then(m => m.clearTypecastVoiceCache());
                                  window.dispatchEvent(new Event('typecast-key-changed'));
                                } catch (e) { logger.trackSwallowedError('ApiKeySettings:typecastKeyBlur', e); }
                            }}
                            placeholder="Typecast API Key (typecast.ai에서 발급)"
                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* [DISABLED] 6. Remove.bg — 배경 제거 (기능 비활성화) */}

                    {/* 7. YouTube Data API */}
                    <div className="space-y-3 pb-4 border-b border-gray-700">
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <h3 className="text-base font-bold text-rose-400 uppercase tracking-wider">📺 YOUTUBE API</h3>
                                <span className="text-sm text-gray-400">YouTube Data API v3 — 채널분석, 키워드 검색</span>
                            </div>
                            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1">키 발급 ↗</a>
                        </div>
                        <input type={showPassword ? "text" : "password"} value={keys.youtubeApiKey} onChange={(e) => setKeys({...keys, youtubeApiKey: e.target.value})} placeholder="YouTube Data API v3 Key" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                    </div>

                    {/* 8. GhostCut — AI 자막 제거 */}
                    <div className="space-y-3">
                        <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <h3 className="text-base font-bold text-cyan-400 uppercase tracking-wider">👻 GHOSTCUT API</h3>
                                <span className="text-sm text-gray-400">AI 자막/워터마크 자동 제거 (OCR 기반)</span>
                            </div>
                            <a href="https://jollytoday.com" target="_blank" rel="noopener noreferrer" className="shrink-0 ml-3 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/30 text-cyan-400 text-xs font-bold rounded-lg transition-all flex items-center gap-1">키 발급 ↗</a>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <input type={showPassword ? "text" : "password"} value={keys.ghostcutAppKey} onChange={(e) => setKeys({...keys, ghostcutAppKey: e.target.value})} placeholder="AppKey" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                            <input type={showPassword ? "text" : "password"} value={keys.ghostcutAppSecret} onChange={(e) => setKeys({...keys, ghostcutAppSecret: e.target.value})} placeholder="AppSecret" className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-base text-white" />
                        </div>
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

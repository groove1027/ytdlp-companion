
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { submitFeedback, FeedbackResult, requestNotificationPermission, getTrackedIssues } from '../services/feedbackService';
import { getSavedUser } from '../services/authService';
import { logger } from '../services/LoggerService';
import { FeedbackType } from '../types';
import type { FeedbackData, FeedbackScreenshot, SmartErrorContext } from '../types';

const FEEDBACK_TYPES = [
    { type: FeedbackType.BUG, icon: '\uD83D\uDC1B', label: '버그/오류' },
    { type: FeedbackType.AUTH, icon: '\uD83D\uDD12', label: '로그인/가입' },
    { type: FeedbackType.SUGGESTION, icon: '\uD83D\uDCA1', label: '제안' },
    { type: FeedbackType.OTHER, icon: '\uD83D\uDCDD', label: '기타' },
] as const;

const MAX_SCREENSHOTS = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DRAFT_STORAGE_KEY = 'feedback_draft';

interface FeedbackDraft {
    selectedType: FeedbackType;
    message: string;
    email: string;
}

const saveDraft = (draft: FeedbackDraft) => {
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft)); } catch (e) { logger.trackSwallowedError('FeedbackModal:saveDraft', e); /* ignore */ }
};

const loadDraft = (): FeedbackDraft | null => {
    try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as FeedbackDraft;
    } catch (e) { logger.trackSwallowedError('FeedbackModal:loadDraft', e); return null; }
};

const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (e) { logger.trackSwallowedError('FeedbackModal:clearDraft', e); /* ignore */ }
};

const fileToScreenshot = (file: File): Promise<FeedbackScreenshot> => {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) { reject(new Error('이미지 파일만 첨부 가능합니다')); return; }
        if (file.size > MAX_FILE_SIZE) { reject(new Error('파일 크기는 5MB 이하여야 합니다')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, base64: reader.result as string, mimeType: file.type });
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
    });
};

const FeedbackModal: React.FC = () => {
    const showFeedbackModal = useUIStore((s) => s.showFeedbackModal);
    const setShowFeedbackModal = useUIStore((s) => s.setShowFeedbackModal);
    const setToast = useUIStore((s) => s.setToast);

    const [selectedType, setSelectedType] = useState<FeedbackType>(FeedbackType.BUG);
    const [message, setMessage] = useState('');
    const [email, setEmail] = useState('');
    const [screenshots, setScreenshots] = useState<FeedbackScreenshot[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [submitResult, setSubmitResult] = useState<FeedbackResult | null>(null);
    const attachLogs = true; // [FIX #175-6] 항상 자동 포함
    const fileInputRef = useRef<HTMLInputElement>(null);
    // 텍스트 선택 중 backdrop 클릭으로 모달이 닫히는 것을 방지하기 위한 ref
    const mouseDownInsideRef = useRef(false);

    // [FIX #175-6] 디버그 로그 UI 숨김 — logCount/errorCount/diagnostics 제거

    // 로그인 사용자 정보 자동 채우기
    const savedUser = getSavedUser();
    const userEmail = savedUser?.email || '';
    const userDisplayName = savedUser?.displayName || '';

    // Pre-filled context (SmartErrorBanner에서 전달)
    const feedbackPrefilledContext = useUIStore((s) => s.feedbackPrefilledContext);
    const [prefilledCtx, setPrefilledCtx] = useState<SmartErrorContext | null>(null);

    // 모달 열릴 때 localStorage에서 임시저장 복원 + defaultType 반영
    const feedbackDefaultType = useUIStore((s) => s.feedbackDefaultType);
    useEffect(() => {
        if (showFeedbackModal) {
            // SmartErrorBanner에서 전달된 pre-filled context 우선
            if (feedbackPrefilledContext) {
                setPrefilledCtx(feedbackPrefilledContext);
                setSelectedType(FeedbackType.BUG);
                const errorLabel = feedbackPrefilledContext.errorType === 'api' ? '[API 오류]'
                    : feedbackPrefilledContext.errorType === 'render' ? '[화면 오류]'
                    : feedbackPrefilledContext.errorType === 'timeout' ? '[시간 초과]'
                    : feedbackPrefilledContext.errorType === 'network' ? '[네트워크]'
                    : '[오류]';
                setMessage(`${errorLabel} ${feedbackPrefilledContext.errorMessage}`);
                useUIStore.getState().setFeedbackPrefilledContext(null);
                return;
            }
            const draft = loadDraft();
            if (draft) {
                setSelectedType(draft.selectedType);
                setMessage(draft.message);
                setEmail(draft.email);
            } else if (feedbackDefaultType) {
                setSelectedType(feedbackDefaultType as FeedbackType);
            }
        } else {
            setPrefilledCtx(null);
        }
    }, [showFeedbackModal, feedbackDefaultType, feedbackPrefilledContext]);

    // 입력 내용이 변경될 때마다 localStorage에 임시저장
    useEffect(() => {
        if (showFeedbackModal && (message || email)) {
            saveDraft({ selectedType, message, email });
        }
    }, [showFeedbackModal, selectedType, message, email]);

    // 작성 중인 내용이 있는지 확인하는 헬퍼
    const hasUnsavedContent = message.trim().length > 0 || screenshots.length > 0;

    // 확인 후 닫기 — 작성 중 내용이 있으면 확인 대화상자 표시
    const tryClose = useCallback(() => {
        if (hasUnsavedContent) {
            const confirmed = window.confirm('작성 중인 내용이 있습니다. 닫으시겠습니까?\n(내용은 임시저장되어 다시 열면 복원됩니다)');
            if (!confirmed) return;
        }
        setShowFeedbackModal(false);
        // 확인 후 닫을 때도 draft는 유지 — 다시 열면 복원됨
        // draft를 지우지 않음 (제출 성공 시에만 지움)
    }, [hasUnsavedContent, setShowFeedbackModal]);

    // ESC 키로 닫기
    useEffect(() => {
        if (!showFeedbackModal) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') tryClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showFeedbackModal, tryClose]);

    // 클립보드 붙여넣기
    useEffect(() => {
        if (!showFeedbackModal) return;
        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) continue;
                    try {
                        const shot = await fileToScreenshot(file);
                        setScreenshots(prev => prev.length >= MAX_SCREENSHOTS ? prev : [...prev, shot]);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : '붙여넣기 실패';
                        setToast({ show: true, message: msg });
                        setTimeout(() => setToast(null), 3000);
                    }
                    break;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [showFeedbackModal, setToast]);

    const addFiles = useCallback(async (files: FileList | File[]) => {
        const remaining = MAX_SCREENSHOTS - screenshots.length;
        if (remaining <= 0) {
            setToast({ show: true, message: `최대 ${MAX_SCREENSHOTS}장까지 첨부 가능합니다` });
            setTimeout(() => setToast(null), 3000);
            return;
        }
        const toProcess = Array.from(files).slice(0, remaining);
        for (const file of toProcess) {
            try {
                const shot = await fileToScreenshot(file);
                setScreenshots(prev => prev.length >= MAX_SCREENSHOTS ? prev : [...prev, shot]);
            } catch (err) {
                const msg = err instanceof Error ? err.message : '파일 처리 실패';
                setToast({ show: true, message: msg });
                setTimeout(() => setToast(null), 3000);
            }
        }
    }, [screenshots.length, setToast]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    }, [addFiles]);

    const removeScreenshot = (index: number) => {
        setScreenshots(prev => prev.filter((_, i) => i !== index));
    };

    if (!showFeedbackModal) return null;

    // 완전 초기화 (제출 성공 후 또는 명시적 닫기)
    const resetAndClose = () => {
        setShowFeedbackModal(false);
        setMessage('');
        setEmail('');
        setScreenshots([]);
        setSelectedType(FeedbackType.BUG);
        setSubmitResult(null);
        clearDraft();
    };

    // 확인 대화상자 포함 닫기 (backdrop 클릭, 취소 버튼, X 버튼)
    const handleClose = () => {
        // 제출 성공 화면에서는 바로 닫기 + 초기화
        if (submitResult) {
            resetAndClose();
            return;
        }
        tryClose();
    };

    const handleSubmit = async () => {
        if (!message.trim()) return;

        setIsSubmitting(true);
        try {
            const currentProjectId = useProjectStore.getState().currentProjectId;

            // 환경 스냅샷 + 로그를 결합한 포맷 생성
            const debugLogs = attachLogs ? await logger.exportFormattedWithEnv() : undefined;

            // Breadcrumb + State Snapshot (자동 수집 또는 pre-filled context에서)
            const breadcrumbs = prefilledCtx?.breadcrumbs || logger.getFormattedBreadcrumbs(50);
            const stateSnapshot = prefilledCtx?.stateSnapshot || Object.entries(logger.collectAllStoreSnapshots())
                .map(([k, v]) => `${k}: ${v}`).join('\n');
            const autoScreenshotBase64 = prefilledCtx?.autoScreenshotBase64 || undefined;

            const data: FeedbackData = {
                type: selectedType,
                message: message.trim(),
                email: email.trim() || userEmail || undefined,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                appVersion: 'v4.5',
                currentProjectId: currentProjectId || undefined,
                screenshots: screenshots.length > 0 ? screenshots : undefined,
                userDisplayName: userDisplayName || undefined,
                debugLogs,
                breadcrumbs: breadcrumbs !== '(기록된 행동 없음)' ? breadcrumbs : undefined,
                stateSnapshot,
                autoScreenshotBase64,
            };

            const result = await submitFeedback(data);
            setSubmitResult(result);
            clearDraft(); // 제출 성공 시 임시저장 삭제
            // 피드백 응답 알림을 받기 위해 브라우저 알림 권한 요청
            requestNotificationPermission();
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : '알 수 없는 오류';
            setToast({ show: true, message: `피드백 전송 실패: ${errorMsg}` });
            setTimeout(() => setToast(null), 4000);
        } finally {
            setIsSubmitting(false);
        }
    };

    // backdrop mousedown/mouseup 방식으로 텍스트 선택 시 모달 닫힘 방지
    const handleBackdropMouseDown = (e: React.MouseEvent) => {
        // 배경(backdrop) 자체에서 mousedown이 시작된 경우만 true
        if (e.target === e.currentTarget) {
            mouseDownInsideRef.current = false;
        }
    };

    const handleBackdropMouseUp = (e: React.MouseEvent) => {
        // mousedown이 모달 내부에서 시작되었으면 닫지 않음 (텍스트 선택 중)
        if (mouseDownInsideRef.current) {
            mouseDownInsideRef.current = false;
            return;
        }
        // backdrop에서 mousedown + mouseup 모두 발생했을 때만 닫기
        if (e.target === e.currentTarget) {
            handleClose();
        }
    };

    return (
        <div
            data-feedback-modal
            className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 animate-fade-in"
            onMouseDown={handleBackdropMouseDown}
            onMouseUp={handleBackdropMouseUp}
        >
            <div
                className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-lg p-6 animate-fade-in-up max-h-[90vh] overflow-y-auto"
                onMouseDown={() => { mouseDownInsideRef.current = true; }}
            >
                {/* 성공 화면 */}
                {submitResult ? (
                    <div className="text-center py-6 space-y-5">
                        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center">
                            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white mb-2">피드백이 접수되었습니다!</h2>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                소중한 의견 감사합니다.<br />
                                전달해 주신 내용을 검토하여 빠르게 반영하겠습니다.
                            </p>
                        </div>
                        <div className="bg-gray-900/70 rounded-lg p-4 border border-gray-700 text-left space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">접수 번호:</span>
                                <span className="text-blue-400 font-mono font-bold">#{submitResult.issueNumber}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">처리 상태:</span>
                                <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    접수 완료
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 pt-1 border-t border-gray-700/50">
                                진행 상황은 접수 번호로 확인할 수 있습니다
                            </p>
                        </div>
                        <button
                            onClick={resetAndClose}
                            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-base font-bold transition-colors"
                        >
                            닫기
                        </button>
                    </div>
                ) : <>

                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="text-blue-400">{'\uD83D\uDCAC'}</span> 피드백 보내기
                    </h2>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
                    >
                        {'\u2715'}
                    </button>
                </div>

                {/* [FIX #526] 내 피드백 내역 바로가기 배너 — 항상 표시 */}
                <button
                    type="button"
                    onClick={() => {
                        setShowFeedbackModal(false);
                        useUIStore.getState().setShowFeedbackHistory(true);
                    }}
                    className="w-full mb-4 p-3 rounded-xl bg-gradient-to-r from-blue-900/40 to-violet-900/40 border border-blue-500/30 hover:border-blue-400/50 transition-all text-left flex items-center gap-3 group"
                >
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{'\uD83D\uDCCB'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-blue-300 group-hover:text-blue-200 transition-colors">
                            내 피드백 내역 보기
                        </p>
                        <p className="text-xs text-blue-400/60">
                            {getTrackedIssues().length > 0
                                ? `보낸 피드백 ${getTrackedIssues().length}건 — 답변 여부 확인`
                                : '보낸 피드백 내역과 답변을 확인하세요'}
                        </p>
                    </div>
                    <svg className="w-5 h-5 text-blue-400/50 group-hover:text-blue-300 group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                <div className="space-y-5">
                    {/* 유형 선택 */}
                    <div>
                        <label className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-2 block">유형 선택</label>
                        <div className="grid grid-cols-4 gap-2">
                            {FEEDBACK_TYPES.map((ft) => {
                                const activeClass = ft.type === FeedbackType.BUG
                                    ? 'bg-red-600/30 border-red-400 text-red-300 shadow-lg shadow-red-500/10'
                                    : ft.type === FeedbackType.AUTH
                                        ? 'bg-amber-600/30 border-amber-400 text-amber-300 shadow-lg shadow-amber-500/10'
                                        : ft.type === FeedbackType.SUGGESTION
                                            ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/10'
                                            : 'bg-blue-600/30 border-blue-400 text-blue-300 shadow-lg shadow-blue-500/10';
                                return (
                                    <button
                                        key={ft.type}
                                        onClick={() => setSelectedType(ft.type)}
                                        className={`py-2.5 rounded-lg text-sm font-bold transition-all border ${
                                            selectedType === ft.type
                                                ? activeClass
                                                : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                                        }`}
                                    >
                                        {ft.icon} {ft.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 내용 입력 */}
                    <div>
                        <label className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-2 block">내용</label>

                        {/* 로그인/가입 선택 시 안내 문구 */}
                        {selectedType === FeedbackType.AUTH && (
                            <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <p className="text-amber-300 text-sm font-bold mb-2">아래 내용을 포함해 주시면 빠르게 해결해 드릴 수 있어요:</p>
                                <ul className="text-amber-200/90 text-sm space-y-1 ml-1">
                                    <li className="flex gap-2"><span className="text-amber-400 flex-shrink-0">1.</span><span><span className="text-amber-300 font-bold">어떤 방식</span>으로 가입/로그인 시도했는지 (이메일, Google, 카카오, 네이버)</span></li>
                                    <li className="flex gap-2"><span className="text-amber-400 flex-shrink-0">2.</span><span><span className="text-amber-300 font-bold">화면에 나온 에러 메시지</span>가 있다면 그대로 알려주세요</span></li>
                                    <li className="flex gap-2"><span className="text-amber-400 flex-shrink-0">3.</span><span><span className="text-amber-300 font-bold">스크린샷</span>을 첨부해주시면 더 빠른 해결이 가능합니다</span></li>
                                </ul>
                            </div>
                        )}

                        {/* 버그/오류 선택 시 안내 문구 */}
                        {selectedType === FeedbackType.BUG && (
                            <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <p className="text-amber-300 text-sm font-bold mb-2">정확한 수정을 위해 아래 내용을 포함해 주세요:</p>
                                <ul className="text-amber-200/90 text-sm space-y-1 ml-1">
                                    <li className="flex gap-2"><span className="text-amber-400 flex-shrink-0">1.</span><span><span className="text-amber-300 font-bold">어느 탭/모드</span>에서 발생했는지</span></li>
                                    <li className="flex gap-2"><span className="text-amber-400 flex-shrink-0">2.</span><span><span className="text-amber-300 font-bold">어떤 기능/버튼</span>을 사용했는지</span></li>
                                    <li className="flex gap-2"><span className="text-amber-400 flex-shrink-0">3.</span><span><span className="text-amber-300 font-bold">어떻게</span> 안 되는지 (에러 메시지, 멈춤, 결과 이상 등)</span></li>
                                </ul>
                                <div className="mt-2.5 pt-2 border-t border-amber-500/20 space-y-1.5">
                                    <div className="flex items-start gap-2 text-sm">
                                        <span className="text-red-400 font-bold flex-shrink-0">{'✗'} 잘못된 예:</span>
                                        <span className="text-red-300/80">{'"이미지가 안 나와요"'}</span>
                                    </div>
                                    <div className="flex items-start gap-2 text-sm">
                                        <span className="text-emerald-400 font-bold flex-shrink-0">{'✓'} 올바른 예:</span>
                                        <span className="text-emerald-300/80">{'"이미지/영상 탭에서 장면 3번의 이미지 재생성 버튼을 눌렀는데, 로딩만 계속 돌고 이미지가 생성되지 않습니다"'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder={selectedType === FeedbackType.BUG
                                ? '[탭/모드] → [기능/버튼] → [증상] 순서로 알려주세요...\n예: 대본작성 탭 → AI 생성 버튼 → 클릭해도 반응이 없습니다'
                                : selectedType === FeedbackType.AUTH
                                    ? '예: 이메일로 회원가입하려는데 "유효하지 않은 초대 코드" 에러가 나와요'
                                    : selectedType === FeedbackType.SUGGESTION
                                        ? '어떤 기능이 추가되면 좋겠는지 알려주세요...'
                                        : '자유롭게 의견을 작성해 주세요...'
                            }
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-base text-white placeholder-gray-400 resize-none focus:border-blue-500 focus:outline-none transition-colors"
                            rows={4}
                            maxLength={2000}
                        />
                        <div className="text-right text-sm text-gray-500 mt-1">{message.length}/2000</div>
                    </div>

                    {/* 스크린샷 첨부 */}
                    <div>
                        <label className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-2 block">
                            스크린샷 첨부 <span className="text-gray-500 font-normal normal-case">(선택, 최대 {MAX_SCREENSHOTS}장)</span>
                        </label>

                        {/* 드래그앤드롭 영역 */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => screenshots.length < MAX_SCREENSHOTS && fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                                isDragOver
                                    ? 'border-blue-400 bg-blue-500/10'
                                    : screenshots.length >= MAX_SCREENSHOTS
                                        ? 'border-gray-700 bg-gray-900/30 cursor-not-allowed opacity-50'
                                        : 'border-gray-600 bg-gray-900/50 hover:border-gray-500 hover:bg-gray-900/70'
                            }`}
                        >
                            <div className="text-gray-400 text-base">
                                {screenshots.length >= MAX_SCREENSHOTS
                                    ? `${MAX_SCREENSHOTS}장 모두 첨부됨`
                                    : isDragOver
                                        ? '여기에 놓으세요'
                                        : '클릭하여 이미지 선택 / 드래그앤드롭 / Ctrl+V 붙여넣기'
                                }
                            </div>
                            <div className="text-sm text-gray-600 mt-1">PNG, JPG, GIF / 5MB 이하</div>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                        />

                        {/* 미리보기 썸네일 */}
                        {screenshots.length > 0 && (
                            <div className="flex gap-2 mt-3">
                                {screenshots.map((shot, i) => (
                                    <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-600 flex-shrink-0">
                                        <img src={shot.base64} alt={shot.name} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => removeScreenshot(i)}
                                            className="absolute top-0 right-0 bg-red-600 text-white w-5 h-5 flex items-center justify-center text-xs rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            {'\u2715'}
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-gray-300 text-center py-0.5 truncate px-1">
                                            {shot.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 자동 감지 안내 배지 (SmartErrorBanner에서 전달 시) */}
                    {prefilledCtx && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-red-400 text-sm font-bold">자동 감지된 오류</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/30 text-red-300 border border-red-500/30 font-bold">AUTO</span>
                            </div>
                            <div className="text-xs text-red-300/70 space-y-1">
                                <p>행동 기록 {prefilledCtx.breadcrumbs.split('\n').length}건 자동 포함</p>
                                <p>앱 상태 스냅샷 자동 포함</p>
                                {prefilledCtx.autoScreenshotBase64 && <p>화면 캡처 자동 포함</p>}
                            </div>
                        </div>
                    )}

                    {/* [FIX #175-6] 디버그 로그 — 항상 자동 포함, 사용자에게 간결히 안내만 */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700/30">
                        <span className="text-green-400 text-sm">✓</span>
                        <span className="text-sm text-gray-400">진단 정보가 자동으로 포함됩니다</span>
                    </div>

                    {/* 이메일 입력 (선택) */}
                    <div>
                        <label className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-2 block">이메일 <span className="text-gray-500 font-normal normal-case">(선택)</span></label>
                        <input
                            type="email"
                            value={email || userEmail}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="답변받을 이메일 (선택)"
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-base text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none transition-colors"
                        />
                    </div>

                    {/* 자동 수집 정보 */}
                    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                        <p className="text-sm text-gray-400 font-bold mb-1.5">자동 수집 정보</p>
                        <div className="text-sm text-gray-500 space-y-0.5">
                            {userDisplayName && <p>사용자: <span className="text-gray-400">{userDisplayName}</span></p>}
                            {userEmail && <p>계정: <span className="text-gray-400">{userEmail}</span></p>}
                            <p>앱 버전: <span className="text-gray-400">v4.5</span></p>
                            <p>세션 ID: <span className="text-gray-400 font-mono">{logger.sessionId}</span></p>
                            <p className="truncate">브라우저: <span className="text-gray-400">{navigator.userAgent.substring(0, 80)}...</span></p>
                            <p>화면: <span className="text-gray-400">{window.innerWidth}x{window.innerHeight}</span></p>
                            {attachLogs && (
                                <p>디버그 로그: <span className="text-blue-400">포함됨</span></p>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-600 mt-1.5 pt-1.5 border-t border-gray-700/50">
                            환경 + 프로젝트 설정 + 생성 이력 + 성능 + 네트워크 + API 워터폴이 자동 포함됩니다
                        </p>
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleClose}
                            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-base font-bold transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!message.trim() || isSubmitting}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-base font-bold shadow-lg transition-all hover:scale-[1.02]"
                        >
                            {isSubmitting
                                ? screenshots.length > 0 ? '이미지 업로드 중...' : '전송 중...'
                                : screenshots.length > 0
                                    ? `피드백 제출 (${screenshots.length}장 첨부)`
                                    : '피드백 제출'
                            }
                        </button>
                    </div>
                </div>

                </>}
            </div>
        </div>
    );
};

export default FeedbackModal;

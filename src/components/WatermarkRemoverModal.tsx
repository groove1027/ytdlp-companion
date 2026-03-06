
/* WatermarkRemoverModal 전체 주석처리 — WaveSpeed 비활성화

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { getWaveSpeedKey } from '../services/apiService';
import { uploadMediaToHosting } from '../services/uploadService';
import { createWatermarkRemovalTask, pollWatermarkRemovalTask } from '../services/VideoGenService';
import { useCostStore } from '../stores/costStore';
import { getVideoDuration } from '../utils/videoSegmentUtils';

const WAVESPEED_COST_PER_SEC = 0.01;
const WAVESPEED_MIN_COST = 0.05;

interface WatermarkRemoverModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const WatermarkRemoverModal: React.FC<WatermarkRemoverModalProps> = ({ isOpen, onClose }) => {
    const addCost = useCostStore((s) => s.addCost);

    // ESC 키로 닫기
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const [inputMode, setInputMode] = useState<'url' | 'file'>('url');
    const [videoUrl, setVideoUrl] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState<number | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const resetState = useCallback(() => {
        setVideoUrl('');
        setVideoFile(null);
        setIsProcessing(false);
        setProgress(0);
        setResultUrl(null);
        setError(null);
        setEstimatedCost(null);
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, []);

    const handleClose = () => {
        if (isProcessing && abortRef.current) {
            abortRef.current.abort();
        }
        resetState();
        onClose();
    };

    const handleFileSelect = (file: File) => {
        if (!file.type.startsWith('video/')) {
            setError('영상 파일만 업로드할 수 있습니다.');
            return;
        }
        if (file.size > 500 * 1024 * 1024) {
            setError('파일 크기가 500MB를 초과합니다.');
            return;
        }
        setVideoFile(file);
        setError(null);
        setResultUrl(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handleProcess = async () => {
        const apiKey = getWaveSpeedKey();
        if (!apiKey) {
            setError('WaveSpeed API Key가 설정되지 않았습니다. 사이드바 > API 설정에서 키를 입력해주세요.');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setError(null);
        setResultUrl(null);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            let targetUrl = videoUrl;

            // File upload → Cloudinary → get URL
            if (inputMode === 'file' && videoFile) {
                setProgress(5);
                targetUrl = await uploadMediaToHosting(videoFile);
                setProgress(10);
            }

            if (!targetUrl) {
                throw new Error('영상 URL을 입력하거나 파일을 업로드해주세요.');
            }

            // Create task
            const taskId = await createWatermarkRemovalTask(targetUrl);
            setProgress(15);

            // Poll for result
            const result = await pollWatermarkRemovalTask(taskId, controller.signal, (p) => {
                setProgress(15 + Math.round(p * 0.85));
            });

            setResultUrl(result);
            setProgress(100);

            // Cost tracking: detect video duration from result, calculate cost
            const duration = await getVideoDuration(result);
            const cost = duration > 0
                ? Math.max(duration * WAVESPEED_COST_PER_SEC, WAVESPEED_MIN_COST)
                : WAVESPEED_MIN_COST;
            setEstimatedCost(cost);
            addCost(cost, 'video');
        } catch (e: unknown) {
            const err = e as Error;
            if (err.name !== 'AbortError' && err.message !== 'Cancelled') {
                setError(err.message);
            }
        } finally {
            setIsProcessing(false);
            abortRef.current = null;
        }
    };

    const handleDownload = async () => {
        if (!resultUrl) return;
        try {
            const response = await fetch(resultUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `watermark_removed_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            window.open(resultUrl, '_blank');
        }
    };

    const canProcess = !isProcessing && (
        (inputMode === 'url' && videoUrl.trim().length > 0) ||
        (inputMode === 'file' && videoFile !== null)
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto animate-fade-in-up custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                ...component JSX...
            </div>
        </div>
    );
};
*/

// Stub export to prevent import breakage
export default function WatermarkRemoverModal() { return null; }

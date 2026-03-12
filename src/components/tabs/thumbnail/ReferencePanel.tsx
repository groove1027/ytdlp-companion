import React, { useRef, useState } from 'react';
import { resizeImage } from '../../../services/imageProcessingService';
import { analyzeStyleReference } from '../../../services/geminiService';
import { extractYouTubeVideoId, fetchYouTubeThumbnail } from '../../../utils/thumbnailUtils';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';

interface ReferencePanelProps {
  youtubeUrl: string;
  youtubeThumbnail?: string;
  referenceImageBase64?: string;
  refAnalysis?: string;
  isYtFetching: boolean;
  ytFetchFailed: boolean;
  isRefAnalyzing: boolean;
  onYoutubeUrlChange: (url: string) => void;
  onSetYtFetching: (v: boolean) => void;
  onSetYtFetchFailed: (v: boolean) => void;
  onSetYoutubeThumbnail: (v?: string) => void;
  onSetReferenceImage: (v?: string) => void;
  onSetRefAnalysis: (v?: string) => void;
  onSetRefAnalyzing: (v: boolean) => void;
}

const ReferencePanel: React.FC<ReferencePanelProps> = ({
  youtubeUrl,
  youtubeThumbnail,
  referenceImageBase64,
  refAnalysis,
  isYtFetching,
  ytFetchFailed,
  isRefAnalyzing,
  onYoutubeUrlChange,
  onSetYtFetching,
  onSetYtFetchFailed,
  onSetYoutubeThumbnail,
  onSetReferenceImage,
  onSetRefAnalysis,
  onSetRefAnalyzing,
}) => {
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const [isRefDragOver, setIsRefDragOver] = useState(false);

  const processRefImageFile = async (file: File) => {
    try {
      const base64 = await resizeImage(file, 1024, 'image/jpeg', 0.85);
      onSetReferenceImage(base64);
      onSetRefAnalysis(undefined);
    } catch (e) {
      console.error('Reference image processing failed', e);
    }
  };

  const handleYoutubeUrlChange = async (url: string) => {
    onYoutubeUrlChange(url);
    onSetYtFetchFailed(false);
    onSetRefAnalysis(undefined);

    const videoId = extractYouTubeVideoId(url.trim());
    if (!videoId) return;

    onSetYtFetching(true);
    try {
      const base64 = await fetchYouTubeThumbnail(videoId);
      onSetYoutubeThumbnail(base64);
    } catch (e) {
      logger.trackSwallowedError('ReferencePanel:fetchYouTubeThumbnail', e);
      onSetYtFetchFailed(true);
    } finally {
      onSetYtFetching(false);
    }
  };

  const handleAnalyzeReference = async () => {
    const ref = referenceImageBase64 || youtubeThumbnail;
    if (!ref || isRefAnalyzing) return;
    onSetRefAnalyzing(true);
    try {
      const analysis = await analyzeStyleReference(ref);
      onSetRefAnalysis(analysis);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown Error';
      console.error('Reference analysis failed', e);
      showToast(`스타일 분석 실패: ${msg}`, 4000);
    } finally {
      onSetRefAnalyzing(false);
    }
  };

  return (
    <>
      {/* YouTube Reference */}
      <div className="border border-red-700/50 rounded-xl p-5 bg-gray-800">
        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-sm font-black">&#9654;</span>
          유튜브 레퍼런스
        </h3>
        <input
          type="text"
          value={youtubeUrl}
          onChange={(e) => handleYoutubeUrlChange(e.target.value)}
          placeholder="유튜브 영상 URL을 입력하세요"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:border-red-500 outline-none"
        />
        {isYtFetching && (
          <div className="mt-3 flex items-center gap-2 text-base text-gray-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            썸네일 가져오는 중...
          </div>
        )}
        {youtubeThumbnail && !isYtFetching && (
          <div className="mt-3 relative">
            <img src={youtubeThumbnail} alt="YouTube Thumbnail" className="w-full rounded-lg border border-gray-600" />
            <div className="absolute top-2 left-2 bg-red-600/90 text-white text-sm px-2 py-1 rounded font-bold">YOUTUBE</div>
            <button
              onClick={() => { onSetYoutubeThumbnail(undefined); onYoutubeUrlChange(''); onSetRefAnalysis(undefined); }}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-md text-sm"
            >&#10005;</button>
          </div>
        )}
        {ytFetchFailed && !isYtFetching && (
          <p className="mt-2 text-sm text-red-400">썸네일 자동 가져오기에 실패했습니다. 아래 파일 업로드를 이용해주세요.</p>
        )}
      </div>

      {/* File Reference */}
      <div className="border border-gray-700 rounded-xl p-5 bg-gray-800">
        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-purple-600 rounded flex items-center justify-center text-sm">&#128206;</span>
          파일 레퍼런스
        </h3>
        <div
          onClick={() => refFileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsRefDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsRefDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault(); setIsRefDragOver(false);
            if (e.dataTransfer.files?.[0]) processRefImageFile(e.dataTransfer.files[0]);
          }}
          className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
            isRefDragOver
              ? 'border-purple-500 bg-purple-900/20'
              : referenceImageBase64
                ? 'border-purple-500/40 bg-gray-900/50'
                : 'border-gray-600 bg-gray-900/50 hover:border-purple-500 hover:bg-gray-800'
          } ${referenceImageBase64 ? '' : 'py-10'}`}
        >
          {referenceImageBase64 ? (
            <div className="relative w-full">
              <img src={referenceImageBase64} className="w-full rounded-lg" alt="File Reference" />
              <div className="absolute top-2 left-2 bg-purple-600/90 text-white text-sm px-2 py-1 rounded font-bold">FILE</div>
              <button
                onClick={(e) => { e.stopPropagation(); onSetReferenceImage(undefined); onSetRefAnalysis(undefined); }}
                className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-md z-10 text-sm"
              >&#10005;</button>
            </div>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-base font-bold text-gray-400">파일 업로드</span>
              <span className="text-sm text-gray-500 mt-1">이미지 파일을 드래그하거나 클릭</span>
            </>
          )}
        </div>
        <input type="file" ref={refFileInputRef} onChange={(e) => e.target.files?.[0] && processRefImageFile(e.target.files[0])} accept="image/*" className="hidden" />
      </div>

      {/* AI Analysis */}
      <div className="border border-purple-700/50 rounded-xl p-5 bg-gradient-to-r from-gray-800 to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-purple-600/30 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            <div>
              <div className="text-base font-bold text-white">AI 자동 분석</div>
              <div className="text-sm text-gray-400">레퍼런스 이미지 스타일 분석</div>
            </div>
          </div>
          <button
            onClick={handleAnalyzeReference}
            disabled={!(referenceImageBase64 || youtubeThumbnail) || isRefAnalyzing}
            className={`px-4 py-2 rounded-lg text-base font-bold transition-all flex items-center gap-1.5 ${
              !(referenceImageBase64 || youtubeThumbnail) || isRefAnalyzing
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/20'
            }`}
          >
            {isRefAnalyzing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                분석 중...
              </>
            ) : (
              <>&#10024; AI 분석</>
            )}
          </button>
        </div>
        {refAnalysis ? (
          <div className="mt-3 bg-gray-900/50 rounded-lg p-3 border border-purple-700/30 max-h-40 overflow-y-auto">
            <p className="text-sm text-purple-400 font-bold mb-1">분석 결과:</p>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{refAnalysis}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mt-3">유튜브 URL 입력 또는 이미지 업로드 시 자동으로 AI 분석이 시작됩니다.</p>
        )}
      </div>
    </>
  );
};

export default ReferencePanel;

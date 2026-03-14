import React, { useState, useCallback, useRef } from 'react';
import { parseFileToText, SUPPORTED_EXTENSIONS, SUPPORTED_FORMATS_LABEL } from '../../../services/fileParserService';
import { showToast } from '../../../stores/uiStore';
import { logger } from '../../../services/LoggerService';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';
import type { ChannelInputSource, ParsedFileEntry, ContentFormat, ContentRegion, ChannelScript } from '../../../types';

const inp = 'bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:ring-2';
const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const INPUT_TABS: { id: ChannelInputSource; label: string; icon: string }[] = [
  { id: 'youtube', label: 'YouTube 채널', icon: '📺' },
  { id: 'file', label: '파일 업로드', icon: '📄' },
  { id: 'manual', label: '직접 입력', icon: '✏️' },
];

const Spin = () => <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface ChannelInputPanelProps {
  inputSource: ChannelInputSource;
  onInputSourceChange: (source: ChannelInputSource) => void;
  // YouTube
  channelUrl: string;
  onChannelUrlChange: (url: string) => void;
  contentFormat: ContentFormat;
  onContentFormatChange: (format: ContentFormat) => void;
  contentRegion: ContentRegion;
  onContentRegionChange: (region: ContentRegion) => void;
  videoCount: number;
  onVideoCountChange: (count: number) => void;
  videoSortOrder: 'latest' | 'popular';
  onVideoSortOrderChange: (order: 'latest' | 'popular') => void;
  onYoutubeAnalyze: () => void;
  // File
  uploadedFiles: ParsedFileEntry[];
  onFilesChange: (files: ParsedFileEntry[]) => void;
  // Common
  sourceName: string;
  onSourceNameChange: (name: string) => void;
  onFileManualAnalyze: (scripts: ChannelScript[]) => void;
  isAnalyzing: boolean;
  error: string;
}

const ChannelInputPanel: React.FC<ChannelInputPanelProps> = ({
  inputSource, onInputSourceChange,
  channelUrl, onChannelUrlChange, contentFormat, onContentFormatChange, contentRegion, onContentRegionChange, videoCount, onVideoCountChange, videoSortOrder, onVideoSortOrderChange, onYoutubeAnalyze,
  uploadedFiles, onFilesChange,
  sourceName, onSourceNameChange, onFileManualAnalyze,
  isAnalyzing, error,
}) => {
  const elapsed = useElapsedTimer(isAnalyzing);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualText, setManualText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  // 파일 파싱 처리
  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    if (fileLoading) return;
    const files = Array.from(fileList);
    if (uploadedFiles.length + files.length > MAX_FILES) {
      showToast(`최대 ${MAX_FILES}개까지 업로드할 수 있습니다.`);
    }
    const remaining = MAX_FILES - uploadedFiles.length;
    const toProcess = files.slice(0, remaining);
    if (toProcess.length === 0) return;

    setFileLoading(true);
    const results: ParsedFileEntry[] = [];

    for (const file of toProcess) {
      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name}: 파일 크기가 10MB를 초과합니다.`);
        continue;
      }
      try {
        const text = await parseFileToText(file);
        if (!text.trim()) {
          showToast(`${file.name}: 텍스트를 추출할 수 없습니다.`);
          continue;
        }
        results.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          fileSize: file.size,
          text,
          preview: text.substring(0, 100).replace(/\n/g, ' '),
        });
      } catch (e) {
        logger.trackSwallowedError('ChannelInputPanel:parseFile', e);
        showToast(`${file.name}: 파일 파싱 실패`);
      }
    }

    if (results.length > 0) {
      onFilesChange([...uploadedFiles, ...results]);
      showToast(`${results.length}개 파일이 추가되었습니다.`);
    }
    setFileLoading(false);
  }, [uploadedFiles, onFilesChange]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleRemoveFile = useCallback((id: string) => {
    onFilesChange(uploadedFiles.filter(f => f.id !== id));
  }, [uploadedFiles, onFilesChange]);

  // 직접 입력 → ChannelScript 변환
  const handleManualAnalyze = useCallback(() => {
    const sections = manualText.split(/\n---\n/).filter(s => s.trim());
    if (sections.length === 0) {
      showToast('분석할 텍스트를 입력해주세요.');
      return;
    }
    const scripts: ChannelScript[] = sections.map((text, i) => ({
      videoId: `manual-${crypto.randomUUID().slice(0, 8)}`,
      title: `텍스트 ${i + 1}`,
      description: text,
      transcript: text,
      publishedAt: new Date().toISOString(),
      viewCount: 0,
      duration: '0:00',
    }));
    onFileManualAnalyze(scripts);
  }, [manualText, onFileManualAnalyze]);

  // 파일 → ChannelScript 변환
  const handleFileAnalyze = useCallback(() => {
    if (uploadedFiles.length === 0) {
      showToast('파일을 먼저 업로드해주세요.');
      return;
    }
    const scripts: ChannelScript[] = uploadedFiles.map((f) => ({
      videoId: `file-${f.id}`,
      title: f.fileName.replace(/\.[^.]+$/, ''),
      description: f.text,
      transcript: f.text,
      publishedAt: new Date().toISOString(),
      viewCount: 0,
      duration: '0:00',
    }));
    onFileManualAnalyze(scripts);
  }, [uploadedFiles, onFileManualAnalyze]);

  const manualSections = manualText.split(/\n---\n/).filter(s => s.trim());

  return (
    <>
      {/* 탭 선택 */}
      <div className="flex gap-2 mb-4 justify-end">
        {INPUT_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onInputSourceChange(tab.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
              inputSource === tab.id
                ? 'bg-orange-600/20 text-orange-400 border-orange-600/50'
                : 'bg-gray-900/50 text-gray-400 border-gray-700/50 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: YouTube */}
      {inputSource === 'youtube' && (
        <>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <label className="text-sm font-medium text-gray-400">콘텐츠 형식</label>
            <div className="flex gap-2">
              {(['long', 'shorts'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onContentFormatChange(f)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-all ${contentFormat === f
                    ? 'bg-orange-600/20 text-orange-400 border-orange-600/50'
                    : 'bg-gray-900/50 text-gray-400 border-gray-700/50 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {f === 'long' ? '롱폼' : '쇼츠'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-gray-700">
              <label className="text-sm font-medium text-gray-400">콘텐츠 지역</label>
              {(['domestic', 'overseas'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onContentRegionChange(r)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${contentRegion === r
                    ? 'bg-blue-600/20 text-blue-400 border-blue-600/50'
                    : 'bg-gray-900/50 text-gray-400 border-gray-700/50 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {r === 'domestic' ? '국내' : '해외'}
                </button>
              ))}
              <span className="text-xs text-gray-600 ml-1">자동 감지</span>
            </div>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium text-gray-400 flex-shrink-0">분석 영상 수</label>
            <div className="flex gap-1.5">
              {[5, 10, 15, 20, 30].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onVideoCountChange(n)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${videoCount === n
                    ? 'bg-orange-600/20 text-orange-400 border-orange-600/50'
                    : 'bg-gray-900/50 text-gray-400 border-gray-700/50 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {n}개
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-gray-700">
              {([['latest', '최신순'], ['popular', '인기순']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onVideoSortOrderChange(val)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${videoSortOrder === val
                    ? 'bg-blue-600/20 text-blue-400 border-blue-600/50'
                    : 'bg-gray-900/50 text-gray-400 border-gray-700/50 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={channelUrl}
              onChange={e => onChannelUrlChange(e.target.value)}
              placeholder="YouTube URL (채널, 영상, 쇼츠 모두 가능 — 예: @채널명, 영상/쇼츠 링크)"
              className={`flex-1 ${inp} px-4 py-2.5 focus:ring-orange-500`}
            />
            <button
              type="button"
              onClick={onYoutubeAnalyze}
              disabled={isAnalyzing || !channelUrl.trim()}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isAnalyzing ? <><Spin /> 분석 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</> : '분석 시작'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            YouTube API 키가 필요합니다. 파일이나 텍스트로 분석하려면 "파일 업로드" 또는 "직접 입력" 탭을 사용하세요.
          </p>
        </>
      )}

      {/* Tab 2: 파일 업로드 */}
      {inputSource === 'file' && (
        <>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">작가/채널 이름 (선택)</label>
            <input
              type="text"
              value={sourceName}
              onChange={e => onSourceNameChange(e.target.value)}
              placeholder="분석할 콘텐츠의 출처 이름 (예: 홍길동 블로그, 뉴스레터 A)"
              className={`w-full ${inp} px-4 py-2 focus:ring-orange-500`}
            />
          </div>

          {/* 드래그 앤 드롭 영역 */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-orange-500 bg-orange-900/10'
                : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_EXTENSIONS}
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              {fileLoading ? (
                <>
                  <Spin />
                  <p className="text-sm text-gray-400">파일 처리 중...</p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-300 font-medium">파일을 여기에 드래그하거나 클릭하여 업로드</p>
                  <p className="text-xs text-gray-500">지원 형식: {SUPPORTED_FORMATS_LABEL} | 최대 {MAX_FILES}개, 10MB/파일</p>
                </>
              )}
            </div>
          </div>

          {/* 업로드된 파일 목록 */}
          {uploadedFiles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium text-gray-500">업로드된 파일 ({uploadedFiles.length}개)</p>
              {uploadedFiles.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-gray-900/50 rounded-lg px-3 py-2 border border-gray-700/50">
                  <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{f.fileName}</p>
                    <p className="text-xs text-gray-500 truncate">{fmtSize(f.fileSize)} · {f.preview}...</p>
                  </div>
                  <button type="button" onClick={() => handleRemoveFile(f.id)} className="text-gray-500 hover:text-red-400 flex-shrink-0 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 가이드 */}
          <div className="mt-4 bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 space-y-2">
            <p className="text-sm font-semibold text-orange-400">파일 업로드 가이드</p>
            <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
              <li><span className="text-gray-300 font-medium">지원 형식:</span> {SUPPORTED_FORMATS_LABEL}</li>
              <li><span className="text-gray-300 font-medium">최적 사용법:</span> 같은 작가/채널의 글 <span className="text-orange-300 font-medium">5~10개</span>를 올리면 가장 정확한 스타일 분석이 됩니다.</li>
              <li><span className="text-gray-300 font-medium">활용 예시:</span> 블로그 글, 뉴스레터, 기존 대본, 에세이 등 텍스트 기반 콘텐츠</li>
              <li><span className="text-gray-300 font-medium">분석 결과 활용:</span> 분석된 말투/구조가 <span className="text-blue-400">대본 작성</span>에 자동 적용되고, 추출된 키워드는 <span className="text-green-400">업로드 태그</span>에 반영됩니다.</li>
              <li><span className="text-gray-300 font-medium">파일당 용량:</span> 텍스트 기준 약 30,000자까지 분석에 활용됩니다 (초과분은 균등 분할).</li>
            </ul>
          </div>

          {/* 분석 시작 */}
          <button
            type="button"
            onClick={handleFileAnalyze}
            disabled={isAnalyzing || uploadedFiles.length === 0}
            className="w-full mt-4 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAnalyzing ? <><Spin /> AI 스타일 분석 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</> : `${uploadedFiles.length}개 파일로 스타일 분석 시작`}
          </button>
        </>
      )}

      {/* Tab 3: 직접 입력 */}
      {inputSource === 'manual' && (
        <>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">작가/채널 이름 (선택)</label>
            <input
              type="text"
              value={sourceName}
              onChange={e => onSourceNameChange(e.target.value)}
              placeholder="분석할 콘텐츠의 출처 이름"
              className={`w-full ${inp} px-4 py-2 focus:ring-orange-500`}
            />
          </div>

          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder={'여기에 분석할 글을 붙여넣으세요.\n\n여러 글을 구분하려면 줄바꿈 후 --- 를 입력하세요.\n\n예시:\n첫 번째 글 내용...\n---\n두 번째 글 내용...\n---\n세 번째 글 내용...'}
            className={`w-full ${inp} px-4 py-3 focus:ring-blue-500 min-h-[200px] resize-y`}
          />

          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-500">
              {manualText.length.toLocaleString()}자 입력됨
              {manualSections.length > 0 && ` · ${manualSections.length}개 텍스트 감지됨`}
            </p>
          </div>

          {/* 가이드 */}
          <div className="mt-4 bg-gray-900/50 rounded-lg p-4 border border-gray-700/50 space-y-2">
            <p className="text-sm font-semibold text-blue-400">직접 입력 가이드</p>
            <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
              <li><span className="text-gray-300 font-medium">여러 글 구분:</span> 글 사이에 <code className="bg-gray-800 px-1 py-0.5 rounded text-orange-300 text-xs">---</code>를 줄바꿈 후 입력하면 개별 글로 분리됩니다.</li>
              <li><span className="text-gray-300 font-medium">최적 분량:</span> 글 <span className="text-orange-300 font-medium">3~10개</span>, 각 500자 이상이면 분석 정확도가 높아집니다.</li>
              <li><span className="text-gray-300 font-medium">추천 콘텐츠:</span> 유튜브 영상 대본, 블로그 글, SNS 포스트, 뉴스 기사 등 분석하고 싶은 문체의 글을 붙여넣으세요.</li>
              <li><span className="text-gray-300 font-medium">결과 연동:</span> 분석 결과는 <span className="text-blue-400">대본 작성</span> 시 자동으로 스타일 가이드로 적용됩니다. <span className="text-purple-400">벤치마크 패널</span>에서 소재 추천도 받을 수 있습니다.</li>
            </ul>
          </div>

          {/* 분석 시작 */}
          <button
            type="button"
            onClick={handleManualAnalyze}
            disabled={isAnalyzing || !manualText.trim()}
            className="w-full mt-4 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAnalyzing ? <><Spin /> AI 스타일 분석 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</> : `${manualSections.length || 0}개 텍스트로 스타일 분석 시작`}
          </button>
        </>
      )}

      {/* 공통 에러 표시 */}
      {error && (
        <div className="mt-3 px-4 py-2.5 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
          {inputSource === 'youtube' && (
            <p className="text-sm text-gray-500 mt-1">YouTube API 키와 URL을 확인 후 다시 시도해주세요. (채널, 영상, 쇼츠 URL 모두 지원)</p>
          )}
        </div>
      )}
    </>
  );
};

export default ChannelInputPanel;

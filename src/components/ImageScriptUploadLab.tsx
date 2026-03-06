import React, { useState, useCallback, useRef } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useNavigationStore } from '../stores/navigationStore';
import { ProjectConfig, AspectRatio, VideoFormat, ImageModel, VideoModel, VoiceName } from '../types';
import { useElapsedTimer, formatElapsed } from '../hooks/useElapsedTimer';

const ImageScriptUploadLab: React.FC = () => {
  const [scriptText, setScriptText] = useState('');
  const [images, setImages] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setActiveTab = useNavigationStore((s) => s.setActiveTab);
  const elapsed = useElapsedTimer(isLoading);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setError('');
    setIsLoading(true);

    try {
      const newImages: { name: string; url: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // ZIP 파일 처리
        if (file.name.endsWith('.zip')) {
          try {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(file);
            const imgFiles = Object.keys(zip.files)
              .filter(name => /\.(jpg|jpeg|png|webp|gif)$/i.test(name) && !name.startsWith('__MACOSX'))
              .sort();

            for (const imgName of imgFiles) {
              const blob = await zip.files[imgName].async('blob');
              const url = URL.createObjectURL(blob);
              newImages.push({ name: imgName.split('/').pop() || imgName, url });
            }
          } catch (err) {
            setError('ZIP 파일을 읽을 수 없습니다.');
          }
          continue;
        }

        // 개별 이미지
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          newImages.push({ name: file.name, url });
        }
      }

      setImages(prev => [...prev, ...newImages]);
    } finally {
      setIsLoading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setImages(prev => {
      const removed = prev[index];
      if (removed.url.startsWith('blob:')) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleCreateStoryboard = useCallback(() => {
    if (!scriptText.trim() || images.length === 0) {
      setError('대본과 이미지를 모두 입력해주세요.');
      return;
    }

    const lines = scriptText.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      setError('대본에 내용이 없습니다.');
      return;
    }

    const projectStore = useProjectStore.getState();

    // 1:1 매칭 (이미지 수와 줄 수 중 작은 쪽 기준, 나머지는 빈 슬롯)
    const maxLen = Math.max(lines.length, images.length);
    const scenes = Array.from({ length: maxLen }, (_, i) => ({
      id: `scene-${Date.now()}-${i}`,
      scriptText: lines[i] || '',
      visualPrompt: '',
      visualDescriptionKO: '',
      characterPresent: false,
      isGeneratingImage: false,
      isGeneratingVideo: false,
      imageUrl: images[i]?.url || undefined,
    }));

    projectStore.setScenes(scenes);
    projectStore.setConfig((prev) => prev ? { ...prev, script: scriptText } : {
      script: scriptText,
      mode: 'SCRIPT',
      videoFormat: VideoFormat.SHORT,
      aspectRatio: AspectRatio.PORTRAIT,
      imageModel: ImageModel.FLASH,
      smartSplit: true,
      allowInfographics: false,
      suppressText: false,
      textForceLock: false,
      detectedStyleDescription: '',
      detectedCharacterDescription: '',
      videoModel: VideoModel.VEO,
      voice: VoiceName.KORE,
    } as ProjectConfig);

    setActiveTab('image-video');
  }, [scriptText, images, setActiveTab]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 pt-6 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-lg flex items-center justify-center text-xl shadow-lg">
            📸
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">소스 임포트</h1>
            <p className="text-gray-400 text-sm">이미지와 대본을 업로드하면 자동으로 스토리보드를 생성합니다</p>
          </div>
          <span className="ml-auto text-sm font-bold px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/50">도구모음</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 대본 입력 */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-gray-300 block">대본 입력</label>
            <p className="text-xs text-cyan-300/70 font-medium">줄바꿈 기준으로 각 줄이 하나의 장면이 됩니다</p>
            <textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder={"각 줄이 하나의 장면이 됩니다.\n예:\n첫 번째 장면의 나레이션입니다.\n두 번째 장면의 나레이션입니다."}
              rows={12}
              className="w-full bg-gray-800/50 text-gray-200 p-4 text-sm leading-relaxed rounded-xl border border-gray-700/40 focus:outline-none focus:border-blue-500/30 resize-none placeholder-gray-600"
            />
            <p className="text-xs text-gray-500">
              {scriptText.split('\n').filter(l => l.trim()).length}줄 = {scriptText.split('\n').filter(l => l.trim()).length}장면
            </p>
          </div>

          {/* 이미지 업로드 */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-gray-300 block">이미지 업로드</label>
            <p className="text-xs text-cyan-300/70 font-medium">개별 이미지 또는 ZIP 파일을 업로드하세요. 순서대로 장면에 매칭됩니다.</p>

            <div
              onClick={() => !isLoading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${isLoading ? 'border-blue-500/50 bg-blue-900/10 cursor-wait' : 'border-gray-600 cursor-pointer hover:border-gray-400'}`}
            >
              {isLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-3 border-t-blue-400 border-b-transparent border-l-transparent border-r-blue-400 rounded-full animate-spin" />
                  <p className="text-blue-400 text-sm font-bold animate-pulse">이미지 처리 중...</p>
                  {elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}
                </div>
              ) : (
                <>
                  <p className="text-gray-400 text-sm">클릭하여 이미지/ZIP 업로드</p>
                  <p className="text-gray-500 text-xs mt-1">JPG, PNG, WebP, GIF 또는 ZIP</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.zip"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            {images.length > 0 && (
              <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-auto">
                {images.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img.url} alt={img.name} className="w-full h-20 object-cover rounded-lg border border-gray-700" />
                    <span className="absolute top-0.5 left-0.5 text-xs bg-black/70 text-white px-1 rounded">{i + 1}</span>
                    <button
                      onClick={() => handleRemoveImage(i)}
                      className="absolute top-0.5 right-0.5 text-xs bg-red-600/80 text-white w-4 h-4 rounded-full hidden group-hover:flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">{images.length}개 이미지 업로드됨</p>
          </div>
        </div>

        {/* 매칭 미리보기 */}
        {scriptText.trim() && images.length > 0 && (
          <div className="mt-6 bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
            <span className="text-sm font-bold text-blue-300 mb-3 block">매칭 미리보기</span>
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {scriptText.split('\n').filter(l => l.trim()).map((line, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded bg-blue-900/30 flex items-center justify-center text-xs text-blue-300 font-bold shrink-0">
                    {i + 1}
                  </span>
                  {images[i] ? (
                    <img src={images[i].url} alt="" className="w-10 h-7 object-cover rounded border border-gray-600 shrink-0" />
                  ) : (
                    <div className="w-10 h-7 rounded border border-gray-600 bg-gray-800 flex items-center justify-center text-xs text-gray-500 shrink-0">
                      없음
                    </div>
                  )}
                  <span className="text-gray-300 truncate">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleCreateStoryboard}
          disabled={!scriptText.trim() || images.length === 0}
          className="mt-6 w-full py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500
            disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold
            border border-emerald-400/40 shadow-lg transition-all flex items-center justify-center gap-2"
        >
          스토리보드 생성 → 이미지/영상 탭으로 이동
        </button>
      </div>
    </div>
  );
};

export default ImageScriptUploadLab;

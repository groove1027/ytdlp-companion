import React from 'react';
import { ContentFormat } from '../../../types';
import InstinctSelector from './InstinctSelector';
import { useElapsedTimer, formatElapsed } from '../../../hooks/useElapsedTimer';

const GENRE_OPTIONS = ['정보/교육', '엔터테인먼트', '브이로그', '리뷰', '뉴스', '드라마/사연', '쇼핑/광고'];
const TONE_OPTIONS = ['친근한', '전문적인', '유머러스', '감성적', '진지한', '도발적인'];

/* ─── Step 1: 주제 선택 ─── */
export function WizardStep1(props: {
  language: string; setLanguage: (v: string) => void;
  genre: string; setGenre: (v: string) => void;
  tone: string; setTone: (v: string) => void;
  onNext: () => void;
}) {
  const { language, setLanguage, genre, setGenre, tone, setTone, onNext } = props;
  return (
    <div className="space-y-5">
      <h3 className="text-base font-bold text-white">Step 1: 주제 선택</h3>
      <p className="text-sm text-gray-500">대본의 기본 설정을 선택합니다. 언어, 장르, 톤은 AI가 대본을 생성할 때 참고하는 핵심 정보입니다.</p>

      <div>
        <label className="block text-sm text-gray-400 mb-1.5">언어</label>
        <div className="flex gap-2">
          {[['ko', '한국어'], ['en', 'English'], ['ja', '日本語']].map(([val, label]) => (
            <button key={val} onClick={() => setLanguage(val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${language === val
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1.5">장르</label>
        <div className="flex flex-wrap gap-2">
          {GENRE_OPTIONS.map((g) => (
            <button key={g} onClick={() => setGenre(g)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${genre === g
                  ? 'bg-purple-600/30 text-purple-300 border-purple-500/50'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1.5">톤</label>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((t) => (
            <button key={t} onClick={() => setTone(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${tone === t
                  ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/50'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <InstinctSelector />

      <button onClick={onNext} disabled={!genre || !tone}
        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-violet-600
          hover:from-blue-500 hover:to-violet-500 disabled:opacity-40
          text-white rounded-lg text-sm font-bold shadow-md transition-all">
        다음 단계 &rarr;
      </button>
    </div>
  );
}

/* ─── Step 2: 제목/줄거리 ─── */
export function WizardStep2(props: {
  title: string; setTitle: (v: string) => void;
  synopsis: string; setSynopsis: (v: string) => void;
  contentFormat: ContentFormat; setContentFormat: (v: ContentFormat) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const { title, setTitle, synopsis, setSynopsis, contentFormat, setContentFormat, isGenerating, onGenerate, onBack } = props;
  const elapsed = useElapsedTimer(isGenerating);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">&larr;</button>
        <h3 className="text-base font-bold text-white">Step 2: 제목 / 줄거리</h3>
      </div>
      <p className="text-sm text-gray-500">영상의 제목과 간략한 줄거리를 입력하세요. 채널분석에서 주제를 선택한 경우 자동으로 채워집니다. 직접 수정도 가능합니다.</p>

      <div>
        <label className="block text-sm text-gray-400 mb-1.5">콘텐츠 형식</label>
        <div className="flex gap-2">
          {([['long', '롱폼'], ['shorts', '쇼츠']] as [ContentFormat, string][]).map(([val, label]) => (
            <button key={val} onClick={() => setContentFormat(val)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors
                ${contentFormat === val
                  ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1.5">제목</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 아무도 모르는 AI의 숨겨진 비밀 10가지"
          className="w-full bg-gray-800 text-gray-200 rounded-lg px-3 py-2 text-sm
            border border-gray-700 focus:outline-none focus:border-blue-500/50" />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1.5">시놉시스</label>
        <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)}
          placeholder="영상의 줄거리를 2~5문장으로 작성하세요.&#10;예: AI 기술의 놀라운 발전 사례 10가지를 소개합니다. 일상 속에서 이미 사용 중인 AI부터 곧 다가올 미래 기술까지, 시청자가 놀랄 만한 사실들을 빠르게 전달합니다."
          rows={5}
          className="w-full bg-gray-800 text-gray-200 rounded-lg px-3 py-2 text-sm
            border border-gray-700 focus:outline-none focus:border-blue-500/50 resize-none" />
      </div>

      <button onClick={onGenerate} disabled={!title || !synopsis || isGenerating}
        className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600
          hover:from-green-500 hover:to-emerald-500 disabled:opacity-40
          text-white rounded-lg text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2">
        {isGenerating ? (
          <><span className="animate-spin">&#9696;</span> 생성 중...{elapsed > 0 && <span className="text-xs text-gray-400 tabular-nums">{formatElapsed(elapsed)}</span>}</>
        ) : (
          <>대본 생성</>
        )}
      </button>
    </div>
  );
}

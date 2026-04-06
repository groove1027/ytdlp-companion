/**
 * 체험판 사용자 안내 모달
 * Gemini API 키 발급 방법 + 사용 가능 기능 상세 안내
 */
import React, { useState } from 'react';
import { getTrialDaysLeft, type AuthUser } from '../services/authService';
import { testGoogleGeminiKey } from '../services/googleGeminiDirectService';
import { getGoogleGeminiKey } from '../services/apiService';

interface TrialGuideModalProps {
  user: AuthUser;
  onClose: () => void;
  onSaveGeminiKey: (key: string) => void;
}

const TrialGuideModal: React.FC<TrialGuideModalProps> = ({ user, onClose, onSaveGeminiKey }) => {
  const [geminiKey, setGeminiKey] = useState(getGoogleGeminiKey());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const daysLeft = getTrialDaysLeft(user);

  const handleTestKey = async () => {
    if (!geminiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    const valid = await testGoogleGeminiKey(geminiKey.trim());
    setTestResult(valid ? 'success' : 'fail');
    setTesting(false);
  };

  const handleSave = () => {
    if (!geminiKey.trim()) return;
    onSaveGeminiKey(geminiKey.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* 헤더 */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">체험판 가이드</h2>
              <p className="text-sm text-amber-400 mt-1">
                {daysLeft >= 0 ? `남은 기간: ${daysLeft}일` : '무제한'}
              </p>
            </div>
            <button onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          {/* 진행 바 */}
          {daysLeft >= 0 && (
            <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                style={{ width: `${Math.max(5, (daysLeft / Math.max(daysLeft + 1, 14)) * 100)}%` }} />
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-6">
          {/* STEP 1: API 키 발급 */}
          <section>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">STEP 1</span>
              Google Gemini API 키 발급
            </h3>
            <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-3 text-sm text-gray-300">
              <p><strong className="text-white">1.</strong> Google AI Studio에 접속합니다</p>
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold">
                Google AI Studio 바로가기 &rarr;
              </a>
              <p><strong className="text-white">2.</strong> Google 계정으로 로그인 후 <strong className="text-amber-400">"Create API Key"</strong> 클릭</p>
              <p><strong className="text-white">3.</strong> 생성된 키를 복사하여 아래에 붙여넣기</p>
              <div className="bg-gray-900 border border-gray-500 rounded p-3 text-xs text-gray-400">
                <p>키 형식 예시: <code className="text-green-400">AIzaSyD...</code> (약 39자)</p>
                <p className="mt-1 text-amber-400">무료 사용량: 분당 15회 요청, 하루 1,500회 요청 (충분합니다!)</p>
              </div>
            </div>
          </section>

          {/* API 키 입력 + 테스트 */}
          <section>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">STEP 2</span>
              API 키 등록
            </h3>
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => { setGeminiKey(e.target.value); setTestResult(null); }}
                placeholder="AIzaSy..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 text-white rounded-lg text-sm
                  focus:border-blue-500 focus:outline-none"
              />
              <button onClick={handleTestKey} disabled={testing || !geminiKey.trim()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {testing ? '확인 중...' : '테스트'}
              </button>
              <button onClick={handleSave} disabled={!geminiKey.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                저장
              </button>
            </div>
            {testResult === 'success' && (
              <p className="text-green-400 text-sm mt-2">API 키가 정상적으로 확인되었습니다!</p>
            )}
            {testResult === 'fail' && (
              <p className="text-red-400 text-sm mt-2">API 키가 유효하지 않습니다. 다시 확인해주세요.</p>
            )}
          </section>

          {/* 사용 가능 기능 */}
          <section>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded">STEP 3</span>
              사용 가능한 기능
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FeatureCard icon="&#x1F4DD;" title="대본 작성 / AI 분석" desc="AI가 대본을 작성하고 분석합니다" available />
              <FeatureCard icon="&#x1F3AC;" title="장면 분할" desc="대본을 자동으로 장면별로 나눕니다" available />
              <FeatureCard icon="&#x1F5BC;" title="이미지 생성" desc="Gemini 이미지 생성 모델로 제작" available />
              <FeatureCard icon="&#x1F3A5;" title="영상 생성" desc="Google Veo로 영상을 생성합니다" available />
              <FeatureCard icon="&#x1F4F9;" title="영상 분석" desc="영상의 내용을 AI가 분석합니다" available />
              <FeatureCard icon="&#x1F50D;" title="채널 분석실" desc="YouTube 채널/영상을 분석합니다" note="YouTube API 키 필요" available />
              <FeatureCard icon="&#x1F399;" title="TTS 음성 생성" desc="텍스트를 자연스러운 음성으로 변환" note="Typecast API 키 필요" available />
              <FeatureCard icon="&#x2601;" title="클라우드 호스팅" desc="이미지/영상을 클라우드에 업로드" note="Cloudinary 키 필요" />
            </div>
          </section>

          {/* 체험판 모델 차이 안내 — 중요! */}
          <section className="bg-amber-950/40 border-2 border-amber-500/60 rounded-xl p-5 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0 mt-0.5">&#x26A0;</span>
              <div>
                <p className="font-bold text-amber-300 text-base mb-2">체험판과 정식 버전의 차이</p>
                <div className="space-y-2 text-gray-300">
                  <p>체험판은 <strong className="text-white">Google Gemini 2.5 Flash</strong> 모델 하나로 모든 AI 기능을 처리합니다.</p>
                  <p>정식 버전에서는 각 기능에 <strong className="text-white">최적화된 전문 모델</strong>을 사용합니다:</p>
                  <ul className="ml-4 space-y-1 text-xs text-gray-400">
                    <li>&#x2022; 대본 작성: <strong className="text-gray-300">Gemini 3.1 Pro</strong> (웹 검색 + 최신 정보 반영)</li>
                    <li>&#x2022; 이미지 생성: <strong className="text-gray-300">NanoBanana 2 Pro</strong> (고품질 2K/4K 이미지)</li>
                    <li>&#x2022; 영상 생성: <strong className="text-gray-300">Veo 3.1 1080p + Grok</strong> (고해상도 영상)</li>
                    <li>&#x2022; TTS: <strong className="text-gray-300">ElevenLabs v3</strong> (자연스러운 다국어 음성)</li>
                  </ul>
                  <p className="text-amber-400/80 mt-2 text-xs">
                    따라서 체험판의 결과물은 정식 버전과 <strong>품질 차이가 있을 수 있습니다.</strong>
                    정식 버전의 전체 기능을 경험하려면 정규/프리미엄 멤버로 업그레이드해주세요.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 추가 안내 */}
          <section className="bg-gray-800 border border-gray-600 rounded-lg p-4 text-sm text-gray-300">
            <p className="font-bold text-amber-400 mb-2">추가 API 키 안내</p>
            <ul className="space-y-1">
              <li><strong>YouTube API 키</strong>: <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a>에서 발급</li>
              <li><strong>Typecast API 키</strong>: <a href="https://typecast.ai" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">typecast.ai</a>에서 발급 (한국어 TTS)</li>
            </ul>
            <p className="mt-3 text-gray-400">모든 키는 설정 &rarr; API 키 관리에서 등록할 수 있습니다.</p>
          </section>
        </div>

        {/* 하단 */}
        <div className="p-6 border-t border-gray-700 flex justify-end">
          <button onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500
              text-white rounded-lg text-sm font-bold">
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
};

/** 기능 카드 */
const FeatureCard: React.FC<{
  icon: string; title: string; desc: string; note?: string; available?: boolean;
}> = ({ icon, title, desc, note, available }) => (
  <div className={`border rounded-lg p-3 ${available
    ? 'border-green-500/30 bg-green-900/10'
    : 'border-gray-600 bg-gray-800/50 opacity-60'}`}>
    <div className="flex items-center gap-2 mb-1">
      <span className="text-lg" dangerouslySetInnerHTML={{ __html: icon }} />
      <span className="font-bold text-white text-sm">{title}</span>
      {available && <span className="text-[10px] bg-green-600 text-white px-1.5 py-0.5 rounded font-bold">사용 가능</span>}
    </div>
    <p className="text-xs text-gray-400">{desc}</p>
    {note && <p className="text-xs text-amber-400 mt-1">{note}</p>}
  </div>
);

export default TrialGuideModal;

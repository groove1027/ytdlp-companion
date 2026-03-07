import React, { useState, useRef, useCallback } from 'react';
import { evolinkChat } from '../../../services/evolinkService';
import type { EvolinkChatMessage } from '../../../services/evolinkService';
import { useNavigationStore } from '../../../stores/navigationStore';
import { useEditPointStore } from '../../../stores/editPointStore';
import { useEditRoomStore } from '../../../stores/editRoomStore';

type AnalysisPreset = 'tikitaka' | 'snack';

interface AnalysisResult {
  script: string;
  editPoints: string;
}

// 티키타카 대본 지침서 (크로스 더빙 숏폼)
const TIKITAKA_SCRIPT_SYSTEM = `너는 '크로스 더빙(Cross-Dubbing) 숏폼 제작 전문가'다.

## 크로스 더빙 핵심 원리
- 더빙(설명/빌드업) <-> 원본(리액션/펀치라인)이 핑퐁처럼 오가며 쉴 틈 없는 오디오 밀도를 만든다
- '번역'이 아니라 '초월 번역(해설)' — 상황을 맛깔나게 요약

## 핑퐁 스크립트 3대 원칙
1. 원본 대사를 침범하지 마라 — 핵심 대사("Oh my god!", "It's terrible!")는 살리고 빈 공간을 더빙으로 채운다
2. 더빙은 '빌드업'이다 — 다음에 올 원본의 기대감을 조성
3. 대화하듯 써라 — 시청자에게 말을 걸거나 혼잣말하듯

## 만능 스크립트 템플릿
1. [더빙] 후킹(Hook): "OOO는 과연 실제로 가능할까?"
2. [원본] 증거(Proof): 짧고 강렬한 시각적/청각적 장면
3. [더빙] 전개(Bridge): "그래서 참지 못하고 바로 OO했습니다."
4. [원본] 현장(Reality): 현장 도착/물건 개봉
5. [더빙] 절정(Climax): "드디어 대망의 순간! 과연 그 결과는?"
6. [원본] 펀치라인: 핵심 리액션
7. [더빙] 결말(Outro): "결국 제 지갑만 털렸네요."

## 컷 분류 기준
- 살릴 구간(Source-Alive): 오디오 볼륨 급격히 커지는 구간, 극적 표정 변화 클로즈업, 짧은 감탄사
- 덮을 구간(Dubbing-Cover): 단순 이동/준비 동작, 지루한 대화, 오디오가 비거나 잡음만 있는 구간

## 출력 형식
타임코드(구간) | 구분 | 화면 내용 | 오디오 내용 | 편집 가이드

사용자가 제공한 영상/링크를 분석하여 60초 크로스 더빙 대본을 작성하라.
반드시 [더빙]과 [원본] 구간을 교차 배치하고, 각 구간의 타임코드를 명시하라.`;

// 티키타카 편집점 지침서
const TIKITAKA_EDITPOINT_SYSTEM = `너는 '마스터 에디팅 아키텍트'다. 스크립트와 비디오를 나노 단위로 동기화하는 편집점 설계 전문가다.

## 절대 원칙
1. 데이터 무결성: [소스 ID] + [정확한 타임코드] + [장면 내용]은 반드시 한 세트
2. 근사치 엄금: "대략 1분 쯤" 등 추상적 표현 금지
3. 타임코드 형식: MM:SS.ms (밀리초 단위)
4. 컷 경계 안전 마진: ±0.1초(100ms)

## 모드 구분
- [N] 내레이션 턴: AI 내레이션 ON / 원본 MUTE. 다이내믹 컷 분할 사용 (슬로우 모션 절대 금지)
- [S] 현장음-대사: 원본 대사 ON / 내레이션 STOP. 립싱크 정확히 맞춤
- [A] 현장음-액션: 원본 현장음 ON (비명, 타격음, 환호 등) / 내레이션 STOP

## 물리적 시간 법칙
- 한국어 내레이션: 평균 4글자당 1초
- 내레이션 시간이 길면 슬로우 모션 대신 정배속 컷 분할: 여러 짧은 컷을 쌓아서 시간 채움

## 출력 형식 (마스터 편집 테이블)
| 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 (MM:SS.ms) |

사용자가 제공한 영상/링크와 대본을 기반으로 정밀한 편집점 테이블을 작성하라.
타임코드가 누락되거나 불일치하는 행이 있으면 처음부터 다시 수행하라.`;

// 스낵형 — 숏폼 바이럴 콘텐츠 전문 PD & 메인 에디터 v.10.8
const SNACK_SCRIPT_SYSTEM = `# Role: 숏폼 바이럴 콘텐츠 전문 PD & 메인 에디터 v. 10.8 — Phase 1: 분석 & 제목 추출

## 1. 프로젝트 개요
당신은 유튜브 쇼츠, 틱톡, 릴스 등 숏폼 플랫폼에서 수백만 조회수를 기록하는 '바이럴 콘텐츠 전문 PD'입니다. 사용자로부터 [영상 파일, 영상 링크, 대본, 이미지 시퀀스] 중 하나를 입력받으면, 이를 분석하여 시청 지속 시간(Retention)을 극대화할 수 있는 **[제목 10선]**과 **[나노 단위 비선형 컷 편집 및 이원화 자막 지침서]**를 작성해야 합니다.

## 2. 핵심 목표 (Mission)
1. **Hooking & Non-linear (후킹과 비선형 재배치):** 썸네일과 제목, 초반 3초에서 시청자의 이탈을 막는다. **절대 원본 영상의 시간 흐름(순차적)대로 편집하지 마라.** 원본에서 가장 바이럴하고 자극적인 펀치라인/클라이맥스를 무조건 맨 앞(0~3초)에 선배치하고, 그 이후에도 텐션이 떨어지지 않게 원본의 타임라인을 완전히 뒤섞어(비선형 재배치) 시청자를 쉴 틈 없이 몰아쳐야 한다.
2. **Pacing (속도감):** 지루한 롱테이크(Long-take)는 과감히 삭제하고, 핵심 장면(Highlight) 위주로 2~3초 단위의 속도감 있는 편집을 설계한다.
3. **Coverage (완전성):** 영상에 등장하는 **모든 소재(음식, 동물, 인물, 상황 등)가 최소 1회 이상 등장**해야 한다. (하나라도 누락 금지)
4. **Witty (재치 & 이원화 자막):** MZ세대 트렌드와 밈(Meme)을 반영한 16자 이내의 간결하고 임팩트 있는 '하단 기본 자막'과, 영상 상황 자체를 극대화하는 큼직한 '효과 자막(중앙 연출용)'을 동시에 기획한다.

## 3. 상세 분석 및 처리 프로세스

### STEP 1: 입력 데이터 정밀 분석
- 영상의 전체적인 분위기(Vibe), 등장인물/사물의 특징, 배경 음악의 비트, 돌발 상황 등을 프레임 단위로 분석한다.
- **[중요]** 영상이 여러 에피소드나 사물의 나열로 이루어진 경우(예: 먹방 모음, 동물 모음), 절대 특정 장면만 길게 쓰지 말고, **모든 종류가 다 나오도록 배분**한다.
- 타임라인을 완벽히 뒤섞기 위해, 영상 내 모든 컷의 '바이럴 임팩트 수치(리액션, 소리, 시각적 충격)'를 평가하여 0순위, 1순위, 2순위 컷을 분류한다.

### STEP 2: 제목(카피라이팅) 추출
- 사용자가 영상 프레임 상단이나 썸네일에 사용할 수 있는 **제목 10가지**를 추천한다.
- **조건:**
    - 클릭을 유도하는 의문형, 감탄형, '주접' 멘트, 정보 공유형 등을 섞을 것.
    - 예시: "이거 모르면 손해 ㅋㅋ", "마지막 반전 주의", "사람이 어떻게 핑크 복숭아? 🍑"

## 4. 출력 형식 (Phase 1)

### 📝 숏폼 편집 지침서: [영상 주제 요약] 편

#### 1️⃣ 제목 추천 (상단 '제목을 입력하세요'에 들어갈 문구)
*시청자의 클릭을 유도하는 훅(Hook)이 있는 제목 10가지입니다.*
1. [제목 1]
2. [제목 2]
...
10.[제목 10]

#### 2️⃣ 원본 영상 정밀 분석 결과
- **전체 분위기(Vibe):** [분석 결과]
- **등장 소재 목록:** [모든 소재 나열]
- **바이럴 임팩트 순위:** 0순위(핵심) / 1순위(서브) / 2순위(필러) 분류 결과
- **비선형 재배치 전략:** [타임라인 해체·재조립 전략 요약]

## 5. 예외 처리
- **소리가 없는 영상인 경우:** 시각적 요소(식감, 표정, 자막 드립)에 더 집중하여 분석한다.
- **특정 대사가 있는 경우:** 대사를 그대로 받아적지 말고, 그 대사의 **속뜻이나 상황을 비트는 관점**으로 분석한다.
- **너무 정적인 영상인 경우:** "줌 인(Zoom-in)", "화면 흔들기" 등의 편집 효과를 제안한다.

## 6. 어조 및 태도
- **유쾌함, 긍정적, 트렌디함.**
- 인터넷 밈(Meme)이나 유행어를 적절히 활용하지만, 비속어는 피한다.
- 사용자가 바로 편집 툴에 적용할 수 있도록 **단호하고 명확하게** 지시한다.

---
**[명령 시작]**
이제 위 지침에 따라 사용자가 제공한 영상/자료를 분석하고, 제목 10선과 정밀 분석 결과를 출력하시오.`;

const SNACK_EDITPOINT_SYSTEM = `# Role: 숏폼 바이럴 콘텐츠 전문 PD & 메인 에디터 v. 10.8 — Phase 2: 비선형 컷 편집 & 이원화 자막 가이드

## 핵심 원칙 (반드시 준수)
1. **비선형 편집:** 절대 원본 영상의 시간 흐름(순차적)대로 편집하지 마라. 가장 바이럴한 펀치라인/클라이맥스를 무조건 맨 앞(0~3초)에 선배치하고, 텐션이 떨어지지 않게 타임라인을 완전히 뒤섞어라.
2. **속도감:** 하나의 컷은 가급적 2~4초를 넘기지 않는다. 롱테이크는 건너뛰고 동작의 정점(Climax)이나 표정 변화가 확실한 구간만 사용한다.
3. **완전성:** 영상에 등장하는 모든 소재가 최소 1회 이상 등장해야 한다.
4. **자막 이원화:**
   - **효과 자막 (화면 내 연출 자막):** 영상 자체의 상황, 타격감, 감정 등을 묘사하는 큼직한 예능형 텍스트 (예: 💥쾅!, ㅋㅋㅋ, 😳동공지진, 물음표?). 화면 중앙이나 피사체 옆 등 시각적으로 가장 눈에 띄는 곳에 배치.
   - **하단 기본 자막:** 공백 포함 16자 이내 (모바일 가독성 최적화). 시청자의 마음을 대변하거나, 엉뚱한 해석을 달거나, ASMR/식감을 강조하는 멘트. 문장 끝에 이모지 1개 필수.

## 출력 형식
*컷 순서는 원본 영상의 시간 순서가 아니라, 임팩트 순으로 완전히 뒤섞인 상태여야 합니다!*

앞서 제공된 Phase 1 분석 결과(제목 10선, 바이럴 임팩트 순위, 비선형 재배치 전략)를 기반으로 아래 형식의 장면별 컷 편집 & 자막 가이드를 작성하시오:

#### 장면별 비선형 편집 & 이원화 자막 가이드
*편집 규칙: 시간 순차적 나열 절대 금지! 가장 후킹한 구간을 맨 앞으로 선배치하고, 이후에도 텐션 위주로 원본 시간을 완전히 뒤섞어서 연결합니다.*

**🎬 컷 1 ([가장 바이럴한 펀치라인/클라이맥스 선배치])**
- **배치 타임라인:** 00:00 ~ 00:03 (원본 영상의 00:00~00:00 구간을 끌어옴)
- **화면:** [해당 장면의 구체적인 행동 및 시각적 충격 묘사]
- **효과 자막 (중앙):** [화면에 크게 들어갈 예능형 효과 자막. 예: 💥미쳤다💥]
- **하단 자막:** [16자 이내의 자막 내용] [이모지]

**🎬 컷 2 ([두 번째로 임팩트 있는 장면으로 교차])**
- **배치 타임라인:** 00:03 ~ 00:06 (원본 영상의 00:00~00:00 구간을 끌어옴)
- **화면:** [순서를 무시하고 텐션을 이어갈 다음 핵심 행동 묘사]
- **효과 자막 (중앙):** [예: ❓동공지진❓]
- **하단 자막:** [16자 이내의 자막 내용] [이모지]

(영상에 등장하는 모든 소재가 포함되도록, 위와 같은 방식으로 타임라인을 뒤섞어 영상 끝까지 컷 단위로 반복)

## 예외 처리
- **소리가 없는 영상인 경우:** 시각적 요소(식감, 표정, 자막 드립)에 더 집중하여 효과 자막과 하단 자막을 구성한다.
- **특정 대사가 있는 경우:** 대사를 그대로 받아적지 말고, 그 대사의 속뜻이나 상황을 비트는 자막을 단다.
- **너무 정적인 영상인 경우:** "줌 인(Zoom-in)", "화면 흔들기" 등의 편집 효과를 텍스트로 제안한다.

## 어조 및 태도
- 유쾌함, 긍정적, 트렌디함.
- 인터넷 밈(Meme)이나 유행어를 적절히 활용하지만, 비속어는 피한다.
- 사용자가 바로 편집 툴에 적용할 수 있도록 단호하고 명확하게 지시한다.

---
**[명령 시작]**
이제 앞서 제공된 분석 결과를 기반으로, 장면별 비선형 컷 편집 & 이원화 자막 가이드를 출력하시오.`;

const PRESET_INFO: Record<AnalysisPreset, { label: string; description: string; color: string }> = {
  tikitaka: {
    label: '티키타카',
    description: '크로스 더빙 스타일 — 더빙과 원본이 핑퐁처럼 교차하는 숏폼',
    color: 'blue',
  },
  snack: {
    label: '스낵형',
    description: '비선형 컷 편집 & 이원화 자막 — 바이럴 숏폼 전문 PD v10.8',
    color: 'amber',
  },
};

const VideoAnalysisRoom: React.FC = () => {
  const [inputMode, setInputMode] = useState<'upload' | 'youtube'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<AnalysisPreset | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'idle' | 'script' | 'editpoints'>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'script' | 'editpoints' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasInput = inputMode === 'youtube' ? youtubeUrl.trim().length > 0 : uploadedFile !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setResult(null);
      setError(null);
    }
  };

  const handleCopy = useCallback(async (field: 'script' | 'editpoints') => {
    if (!result) return;
    const text = field === 'script' ? result.script : result.editPoints;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, [result]);

  const handleAnalyze = async (preset: AnalysisPreset) => {
    if (!hasInput) return;
    setSelectedPreset(preset);
    setIsAnalyzing(true);
    setAnalysisPhase('script');
    setResult(null);
    setError(null);

    const inputDescription = inputMode === 'youtube'
      ? `YouTube 영상 URL: ${youtubeUrl.trim()}`
      : `업로드된 영상 파일: ${uploadedFile?.name} (${((uploadedFile?.size || 0) / 1024 / 1024).toFixed(1)}MB)`;

    const scriptSystem = preset === 'tikitaka' ? TIKITAKA_SCRIPT_SYSTEM : SNACK_SCRIPT_SYSTEM;
    const editSystem = preset === 'tikitaka' ? TIKITAKA_EDITPOINT_SYSTEM : SNACK_EDITPOINT_SYSTEM;

    try {
      // 1단계: 대본 생성
      const scriptMessages: EvolinkChatMessage[] = [
        { role: 'system', content: scriptSystem },
        { role: 'user', content: `다음 영상을 분석하여 대본을 작성해주세요.\n\n${inputDescription}\n\n영상의 주요 내용을 파악하고, 지침서에 따라 대본을 작성해주세요.` },
      ];

      const scriptResponse = await evolinkChat(scriptMessages, { temperature: 0.7, maxTokens: 4000 });
      const scriptText = scriptResponse.choices[0]?.message?.content || '';

      // 2단계: 편집점 생성
      setAnalysisPhase('editpoints');
      const editMessages: EvolinkChatMessage[] = [
        { role: 'system', content: editSystem },
        { role: 'user', content: `다음 영상 정보와 대본을 기반으로 편집점 테이블을 작성해주세요.\n\n[영상 정보]\n${inputDescription}\n\n[작성된 대본]\n${scriptText}\n\n위 대본을 기반으로 정밀한 편집점 테이블을 작성해주세요.` },
      ];

      const editResponse = await evolinkChat(editMessages, { temperature: 0.5, maxTokens: 4000 });
      const editText = editResponse.choices[0]?.message?.content || '';

      setResult({ script: scriptText, editPoints: editText });
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisPhase('idle');
    }
  };

  return (
    <div className="space-y-6">
      {/* 입력 모드 선택 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
            🎬
          </span>
          영상 소스 입력
        </h2>

        {/* 입력 모드 토글 */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setInputMode('youtube'); setUploadedFile(null); setResult(null); setError(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'youtube'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
            }`}
          >
            YouTube 링크
          </button>
          <button
            type="button"
            onClick={() => { setInputMode('upload'); setYoutubeUrl(''); setResult(null); setError(null); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'upload'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-gray-300'
            }`}
          >
            영상 업로드
          </button>
        </div>

        {/* YouTube URL 입력 */}
        {inputMode === 'youtube' && (
          <div className="relative">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => { setYoutubeUrl(e.target.value); setResult(null); setError(null); }}
              placeholder="YouTube 영상 URL을 붙여넣으세요 (예: https://youtube.com/watch?v=...)"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
            />
            {youtubeUrl && (
              <button
                type="button"
                onClick={() => setYoutubeUrl('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}

        {/* 파일 업로드 */}
        {inputMode === 'upload' && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              className="hidden"
            />
            {uploadedFile ? (
              <div className="flex items-center gap-3 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3">
                <span className="text-blue-400 text-lg">🎥</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-gray-500 text-xs">{(uploadedFile.size / 1024 / 1024).toFixed(1)}MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-600 rounded-lg py-8 flex flex-col items-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
              >
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <span className="text-gray-400 text-sm">클릭하여 영상 파일을 선택하세요</span>
                <span className="text-gray-600 text-xs">MP4, MOV, AVI 등</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 프리셋 선택 */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-sm">
            🎯
          </span>
          리메이크 프리셋
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.entries(PRESET_INFO) as [AnalysisPreset, typeof PRESET_INFO['tikitaka']][]).map(([key, info]) => {
            const isSelected = selectedPreset === key && isAnalyzing;
            const colorMap: Record<string, { bg: string; border: string; text: string; hoverBg: string }> = {
              blue: { bg: 'bg-blue-600/10', border: 'border-blue-500/30', text: 'text-blue-400', hoverBg: 'hover:bg-blue-600/20' },
              amber: { bg: 'bg-amber-600/10', border: 'border-amber-500/30', text: 'text-amber-400', hoverBg: 'hover:bg-amber-600/20' },
            };
            const c = colorMap[info.color] || colorMap.blue;

            return (
              <button
                key={key}
                type="button"
                disabled={!hasInput || isAnalyzing}
                onClick={() => handleAnalyze(key)}
                className={`
                  relative p-5 rounded-xl border text-left transition-all
                  ${isSelected
                    ? `${c.bg} ${c.border} ring-1 ring-${info.color}-500/30`
                    : `bg-gray-900/50 border-gray-600/50 ${c.hoverBg} hover:border-gray-500`
                  }
                  ${(!hasInput || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-base font-bold ${c.text}`}>{info.label}</span>
                  {isSelected && (
                    <div className={`w-5 h-5 border-2 border-gray-600 border-t-${info.color}-400 rounded-full animate-spin`} />
                  )}
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{info.description}</p>
              </button>
            );
          })}
        </div>

        {!hasInput && (
          <p className="text-gray-500 text-sm mt-3">영상 소스를 먼저 입력해주세요.</p>
        )}
      </div>

      {/* 분석 진행 상태 */}
      {isAnalyzing && (
        <div className="bg-gray-800/50 rounded-xl border border-blue-500/20 p-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
            <div>
              <p className="text-white font-semibold">
                {analysisPhase === 'script' ? '대본 생성 중...' : '편집점 분석 중...'}
              </p>
              <p className="text-gray-400 text-sm">
                {analysisPhase === 'script'
                  ? 'AI가 영상을 분석하여 대본을 작성하고 있습니다.'
                  : '대본을 기반으로 정밀한 편집점을 설계하고 있습니다.'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <div className={`flex-1 h-1.5 rounded-full ${analysisPhase === 'script' ? 'bg-blue-500 animate-pulse' : 'bg-blue-500'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${analysisPhase === 'editpoints' ? 'bg-blue-500 animate-pulse' : analysisPhase === 'script' ? 'bg-gray-700' : 'bg-blue-500'}`} />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>1. 대본 생성</span>
            <span>2. 편집점 분석</span>
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-400 text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">분석 오류</p>
            <p className="text-red-300/70 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* 결과 출력 */}
      {result && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 대본 */}
            <ResultBox
              title="대본"
              icon="📝"
              content={result.script}
              onCopy={() => handleCopy('script')}
              isCopied={copiedField === 'script'}
              accentColor="blue"
            />

            {/* 편집점 */}
            <ResultBox
              title="편집점"
              icon="✂️"
              content={result.editPoints}
              onCopy={() => handleCopy('editpoints')}
              isCopied={copiedField === 'editpoints'}
              accentColor="blue"
            />
          </div>

          {/* 편집실로 보내기 */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                const epStore = useEditPointStore.getState();
                epStore.reset();
                epStore.setRawEditTable(result.editPoints);
                epStore.setRawNarration(result.script);
                useEditRoomStore.getState().setEditRoomSubTab('edit-point-matching');
                useNavigationStore.getState().setActiveTab('edit-room');
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold shadow-lg transition-all transform hover:scale-[1.02]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
              편집실로 보내기
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// 결과 출력 박스 컴포넌트
const ResultBox: React.FC<{
  title: string;
  icon: string;
  content: string;
  onCopy: () => void;
  isCopied: boolean;
  accentColor: string;
}> = ({ title, icon, content, onCopy, isCopied }) => (
  <div className="bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col max-h-[600px]">
    {/* 헤더 */}
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <h3 className="text-white font-bold">{title}</h3>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${isCopied
            ? 'bg-green-600/20 text-green-400 border border-green-500/30'
            : 'bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:text-white hover:bg-gray-700'
          }
        `}
      >
        {isCopied ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            <span>복사됨</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <span>복사</span>
          </>
        )}
      </button>
    </div>
    {/* 콘텐츠 */}
    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{content}</div>
    </div>
  </div>
);

export default VideoAnalysisRoom;

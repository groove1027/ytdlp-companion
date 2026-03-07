const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/InstinctBrowser-DVnlGYAE.js","assets/index-kghtrxmb.js","assets/vendor-zustand-DCTLDZbJ.js","assets/vendor-react-v3_yO3qJ.js","assets/fileParserService-DkhXwtXM.js","assets/scriptWriterStore-HGw4UO3j.js","assets/channelAnalysisStore-D_NT_OQP.js","assets/useElapsedTimer-BBLl4BlT.js","assets/ScriptExpander-fTmXfB_X.js"])))=>i.map(i=>d[i]);
import{k as Ne,l as ie,r as ft,m as jt,u as rt,n as Ce,j as e,o as Nt,V as E,q as vt,t as qe,f as wt,s as fe,v as Xe,w as et,x as St,_ as nt}from"./index-kghtrxmb.js";import{c as kt,r as o,R as Me}from"./vendor-zustand-DCTLDZbJ.js";import{u as de}from"./scriptWriterStore-HGw4UO3j.js";import{u as re}from"./channelAnalysisStore-D_NT_OQP.js";import{b as Ee,g as Tt,p as $t,S as It,a as At}from"./fileParserService-DkhXwtXM.js";import{u as he,f as ge}from"./useElapsedTimer-BBLl4BlT.js";const tt=5,J=kt(l=>({selectedPartIndex:0,searchQuery:"",selectedMechanismIds:[],recommendedTopics:[],selectedTopicId:null,isRecommending:!1,recommendProgress:{step:"",percent:0},setSelectedPartIndex:n=>l({selectedPartIndex:n}),setSearchQuery:n=>l({searchQuery:n}),toggleMechanism:n=>l(i=>i.selectedMechanismIds.includes(n)?{selectedMechanismIds:i.selectedMechanismIds.filter(h=>h!==n)}:i.selectedMechanismIds.length>=tt?i:{selectedMechanismIds:[...i.selectedMechanismIds,n]}),setMechanismIds:n=>l({selectedMechanismIds:n.slice(0,tt)}),clearSelection:()=>l({selectedMechanismIds:[]}),setRecommendedTopics:n=>l({recommendedTopics:n}),selectTopic:n=>l({selectedTopicId:n}),clearTopics:()=>l({recommendedTopics:[],selectedTopicId:null}),setIsRecommending:n=>l({isRecommending:n}),setRecommendProgress:n=>l({recommendProgress:n})})),Ct=async l=>{const{mechanismIds:n,onProgress:i,channelGuideline:d,keyword:h}=l;i("본능 기제 분석 중...",10);const U=Ee(n),R=n.map(Tt).filter(Boolean).flatMap(m=>m?.hooks||[]).slice(0,5);i("Google 검색으로 바이럴 트렌드 분석 중...",30);const P={contents:[{role:"user",parts:[{text:`[선택된 본능 기제]
${U}

[훅 키워드]
${R.join(", ")}
${h?`
[사용자 지정 키워드]
${h}`:""}
${d?`
[채널 가이드라인]
${d}`:""}

[작업 지시]
1. 먼저 Google 검색으로 위 키워드와 관련된 최근 유튜브 바이럴 영상, 트렌드, 화제 주제를 조사하세요.
2. 조사 결과를 바탕으로, 위 본능 기제를 활용한 완전히 새로운 유튜브 영상 소재 5개를 추천하세요.
3. 기존 영상을 그대로 복사하지 말고, 본능 기제로 독창적으로 응용한 소재를 만드세요.

JSON 배열 형식 (정확히 5개):
[
  {
    "title": "영상 제목 (30자 이내, 클릭 유도형)",
    "hook": "첫 3초 훅 문장",
    "synopsis": "1-2줄 줄거리",
    "whyViral": "바이럴 예상 이유 (심리 분석 1줄)",
    "instinctMatch": "적용된 본능 기제",
    "referenceVideos": [{"title": "참고 영상/트렌드", "viewCount": "추정 조회수"}],
    "estimatedViralScore": 85
  }
]`}]}],systemInstruction:{parts:[{text:`당신은 유튜브 바이럴 콘텐츠 기획 전문가입니다.
Google 검색을 활용하여 최신 바이럴 트렌드와 인기 유튜브 영상을 조사한 뒤,
사용자가 선택한 심리 본능 기제를 결합하여 폭발적 조회수가 예상되는 새로운 콘텐츠 소재 5개를 추천합니다.
반드시 JSON 배열로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만.`}]},tools:[{googleSearch:{}}],generationConfig:{temperature:.8,maxOutputTokens:8e3}};i("AI가 소재 5개 생성 중...",60);let r,g=!1;try{if(!Ne())throw new Error("Evolink 키 없음 — 폴백으로 이동");ie.info("[소재추천] Evolink Native 시도 (Google Search grounding 포함)"),r=await ft("gemini-3.1-pro-preview",P),g=!0}catch(m){ie.warn("[소재추천] Evolink Native 실패, grounding 없이 폴백 요청",{error:m instanceof Error?m.message:String(m)});const w={...P,tools:void 0},j=`

[SYSTEM NOTICE] Google Search grounding이 현재 사용 불가합니다. 당신의 학습 데이터에 기반하여 최신 유튜브 트렌드와 바이럴 영상에 대한 지식을 최대한 활용하세요. referenceVideos 필드에는 당신이 알고 있는 실제 인기 영상을 포함해주세요.`;if(w.systemInstruction){const L=w.systemInstruction;L.parts?.[0]?.text&&(L.parts[0].text+=j)}try{r=await jt("gemini-3.1-pro-preview",w),g=!1}catch(L){throw ie.error("[소재추천] 모든 프록시 실패",L),L instanceof Error?L:new Error("소재 추천 실패")}}try{i("결과 분석 중...",90);const f=(r?.candidates?.[0]?.content?.parts?.map(F=>F.text||"").join("")||"").match(/\[[\s\S]*\]/);if(!f)throw new Error("JSON 배열을 찾을 수 없습니다.");const q=JSON.parse(f[0]),G=(Array.isArray(q)?q:[]).slice(0,5).map((F,x)=>{const u=F,ne=u.referenceVideos||u.reference_videos;return{id:`topic-${Date.now()}-${x}`,title:String(u.title||`소재 ${x+1}`),hook:String(u.hook||""),synopsis:String(u.synopsis||""),whyViral:String(u.whyViral||u.why_viral||""),instinctMatch:String(u.instinctMatch||u.instinct_match||""),referenceVideos:Array.isArray(ne)?ne.map(s=>({title:String(s.title||""),viewCount:String(s.viewCount||s.view_count||"")})):[],estimatedViralScore:Number(u.estimatedViralScore||u.estimated_viral_score||70)}});return G.sort((F,x)=>x.estimatedViralScore-F.estimatedViralScore),i("소재 추천 완료!",100),g?ie.success("[소재추천] Google Search grounding 완료",{count:G.length}):ie.warn("[소재추천] grounding 없이 완료 (LLM 자체 지식 기반 — 정확도 낮을 수 있음)",{count:G.length}),G}catch(m){throw ie.error("[소재추천] 응답 파싱 실패",m),m instanceof Error?m:new Error("소재 추천 실패")}},Et=`### [System Prompt: Ultimate Script Engine (Ver 26.16 - Zig-Zag Rhythm Mode)]

당신은 유튜브 채널 최고의 스토리텔러이자, '세상에서 가장 설명을 잘하는 똑똑한 옆집 형'입니다.
사용자의 입력을 바탕으로, [유튜브 공식 커뮤니티 가이드]와 [광고주 친화적 가이드라인]을 100% 준수하여 안전하되, 어려운 내용도 중학생이 알아듣게 만드는 '쉽고 찰진 구어체'로 무조건 공백 제외 6000자 분량의 완벽한 줄글 대본을 작성하십시오.

[핵심 지침]: 원본 텍스트의 문체와 구조를 완전히 파괴(Deconstruction)하고 재조립하여, 내용은 유지하되 텍스트 일치율을 1% 미만으로 낮추십시오.

1. [Adaptive Analysis] 분야별 최적화 해석 엔진 (The 50-Lens Matrix)

입력된 주제를 분석하여 가장 적합한 [해석 도구(Lens)]를 선택하되, 아래 50가지 세부 관점 중 주제를 가장 날카롭게 파고들 수 있는 도구들을 조합하여 입체적으로 서술하십시오.

[대중성 및 맥락 일치 절대 원칙]:
* 어설픈 비유 절대 금지: 맥락에 맞지 않거나 몰입감을 깨는 쌩뚱맞은 비유를 혐오하십시오.
* [쌍팔년도식 낡은 비유 금지]: '산업의 쌀', '동맥', '쌀독' 같은 진부한 비유를 혐오하십시오. 현대적이고 직관적인(예: 비타민, 배터리, OS) 비유만 허용합니다.
* 생활 밀착형 비유 의무화: 모든 분석 도구(A~E)는 반드시 시청자가 일상에서 겪는 '익숙한 경험'으로 치환되어야 합니다.

A. 자연/생물/의학: 진화생물학, 뇌과학, 에너지 효율성, 붉은 여왕 효과, 항상성, 핸디캡 이론, 기생과 숙주, 집단 지성, 알레로파시, 돌연변이
B. IT/기술/공학: 트레이드오프, 역공학, 단일 실패 지점, 기술 부채, 블랙박스, 확장성 문제, 불쾌한 골짜기, 표준 전쟁, 넛지 설계, 무어의 법칙과 한계
C. 경제/역사/사회: 인센티브 구조, 행동경제학, 생존 편향, 검은 백조, 죄수의 딜레마, 기회비용, 정보 비대칭, 도덕적 해이, 매몰 비용 오류, 창조적 파괴
D. 미스터리/다큐: 타임라인 재구성, 모순 발견, 침묵의 증언, 나비 효과, 신뢰할 수 없는 화자, 오컴의 면도날, 스모킹 건, 프로파일링, 알리바이 깨기, 가스라이팅
E. 인문/심리/예술: 시대정신, 인지 부조화, 언더독 효과, 그림자, 끓는 물 속의 개구리, 금지된 열매, 파우스트의 거래, 방 안의 코끼리, 디폴트 값, 권선징악의 배신

2. [Ruthless Fact-Audit & Timeline Sync] 팩트 검증 및 시점 동기화
추측성 서술 금지. 검증된 대체재 투입. 소속 구분 명확화. 타임라인 강제 동기화.

3. [The Hook: Immediate Impact] 오프닝 절대 원칙
질문형 오프닝을 전면 금지합니다. 대본의 첫 문장은 반드시 마침표(.)로 끝나는 가장 충격적인 모순이나 부정할 수 없는 팩트의 선언이어야 합니다.

4. [Meta-Narration Purge] 진행 멘트 및 예고 금지
"지금부터 알아보겠습니다" 같은 진행 멘트를 혐오하십시오. 곧바로 사건의 묘사로 문단을 시작하십시오.

5. [Cliché & Filler Detox] 감상평 및 군더더기 제거
화자의 감정이나 판단을 넣지 말고, 팩트 자체가 감정을 만들어내도록 건조하게 서술하십시오.

6. [No Translation-ese] 번역투 및 피동형 금지
딱딱한 번역투 문장을 혐오하십시오. 의문사절을 부적절한 서술어의 목적어로 쓰는 영어식 문장을 엄격히 금지합니다.

7. [The Feynman Rule: Easy Professionalism] 전문성의 대중화
전문 용어를 '술자리에서 친구에게 설명하듯' 완전히 쉬운 비유로 번역하십시오.

8. [Rhythm Control: The Strict Ending Protocol] 어미 규칙 (Zig-Zag Rule)
사용 가능한 어미: ~다/~입니다/~습니다/~합니다/~겁니다, ~죠.(마침표 필수), ~가요?/~까요?
Zig-Zag Rule: 딱딱한 평서문 어미가 3번 연속 나오는 것을 차단. 반드시 ~죠. 또는 ~까요?를 교차 사용.
절대 금지 어미: ~니까?, ~죠?, ~거든요., ~니까요., ~달까요?/~랄까요?, ~텐데요., ~십시오/~시오/~세요/~봅시다., ~하시나요?/~시나요?/~나요?, ~구요., ~는데요., ~요.(단독)

9. [Conjunction Diet & Seamless Flow] 접속사 다이어트
불필요한 접속사 삭제. 결론부 '하지만' 금지. 볼드체(**) 금지. 물 흐르는 전개.

10. [YouTube All-Safety Guard] 가이드라인 풀 패키지
성적/폭력/혐오/위험 표현 절대 금지. 단어 순화 필수.

11. [Formatting for Visibility] 가독성 최적화 포맷
숫자와 화폐 단위는 아라비아 숫자 사용. 종결 어미 뒤 줄바꿈. Markdown 서식 금지.

12. [Lingering Ending] 여운을 남기는 엔딩
담백하지만 묵직한 질문을 던져 시청자가 스스로 생각하며 여운을 느끼도록 마무리하십시오.

13. [10-Minute Full Feature Protocol] 장편 서사 구축 및 분량 확장
[1:5 확장 법칙] 하나의 팩트를 제시할 때마다 최소 5문장 이상의 배경/심리/파장 서술을 부착.
Layer 1 [Sensory]: Show, Don't Tell — 현장의 소음, 냄새, 시각적 공포를 확대 묘사.
Layer 2 [Micro-Scene]: 결정적 순간을 영화처럼 분초 단위로 재구성.
Layer 3 [Psychology]: 행위 주체의 진짜 욕망, 두려움, 딜레마를 파고듬.
Layer 4 [Context]: 과거의 결정적 실수나 전혀 다른 분야와의 연결고리를 추적.
Layer 5 [Future]: 최악의 미래를 시뮬레이션하여 위기감 고조.
Layer 6 [Global Ripple Effect]: 주변 인물, 제3세계, 일반 소비자의 혼란까지 훑어 분량 확보.
[Slow Pacing Rule]: 급하게 결론으로 달려가지 마십시오.`,Mt=`# Role Definition
당신은 유튜브 쇼츠 채널 '짤감자(Jjal-Gamja)'의 전속 메인 작가이자 AI 페르소나입니다.
당신의 역할은 인터넷 커뮤니티(네이트판, 디시인사이드, 블라인드 등)에 올라올 법한 '썰'이나 '충격적인 정보'를 가장 몰입감 있고, 빠르고, 냉소적이지만 핵심을 찌르는 쇼츠 대본으로 재가공하는 것입니다.
당신은 문법적 정확성보다 '구어적 리듬감'과 '현실적인 딕션'을 최우선으로 합니다.

# 1. [Cognitive Model] 사고 회로 및 세계관
* 세상 바라보기: 세상은 요지경이고, 사람들은 겉과 속이 다르며, 모르면 손해보는 것 투성이.
* 정보 전달 방식: "이거 모르면 너만 호구됨" 혹은 "이거 진짜 실화냐?"라는 식의 경각심 유발 또는 충격 요법.
* 감정의 이중성: 평소엔 시니컬하고 쿨한 척하지만, 슬픈 사연 앞에서는 담담하게 팩트를 나열하여 오히려 슬픔을 극대화.
* 광고의 자연화: 광고나 제품 추천이 포함될 경우, 앞부분의 '썰'이나 '정보'와 기가 막히게 연결.

# 2. [Syntactic Fingerprint] 문장 구조 및 호흡
* 종결어미 규칙 (절대 준수): 전체 문장의 95% 이상을 '음슴체' (~음, ~함, ~임, ~봄, ~듯) 혹은 명사형 종결 (~거, ~상태)로 끝냅니다. 존댓말(~요, ~니다)은 오직 대화문 인용(따옴표 안)에서만 사용.
* 조사 및 접속사 생략: '그래서', '그러나' 같은 접속사는 쓰지 않습니다. 주격 조사(이/가)와 목적격 조사(을/를)도 리듬감을 위해 과감히 생략.
* 문장 길이: 호흡이 매우 빠릅니다. 한 문장은 20자를 넘기지 않는 것을 지향.

# 3. [Visual Formatting] 시각적 리듬 및 줄바꿈
* 쇼츠 자막 최적화: 한 줄에 너무 많은 글자를 넣지 않습니다.
* 호흡 단위 줄바꿈: 문장이 끝나지 않아도, 호흡이 바뀌거나 강조해야 할 타이밍이면 줄을 바꿉니다.
* 대화문 처리: >> 표시나 줄바꿈을 통해 인물 간의 티키타카를 속도감 있게 표현.

# 4. [Lexical Database] 핵심 어휘 및 치환 규칙
* 강조 부사: '겁나', '개-', '미친', '존맛', '핵' 등 인터넷 구어체 사용.
* 지칭 대명사: '어떤 놈', '친구', '여사친', '사장님', '경찰' 등 구체적 대상을 바로 지칭.
* 의성어/상황 묘사: 생생하고 감각적인 단어 선택.
* 필수 어휘: 긍정(개꿀, 인정, 지림, 천국임, 떡상), 부정(나락, X됨, 헬게이트, 소름, 극혐), 놀람(ㄷㄷ, 와..., 충격).

# 5. [Narrative Arc] 기-승-전-결 전개 패턴
* 도입부 (Hook - 0~3초): 시청자의 스크롤을 멈추게 하는 강력한 한 문장.
* 전개 (Build-up): 배경 설명은 최소화하고 바로 사건의 핵심으로 진입.
* 절정 (Climax): 반전이 일어나거나 감정이 고조되는 순간.
* 결말 (Pay-off & Loop): 마지막 문장을 뚝 끊어서 영상 루프를 만드는 기법 사용.

# 6. [Negative Constraints] 절대 금기 사항
1. 설명조 금지: 교과서처럼 딱딱하게 설명하지 마십시오. 옆 친구에게 귓속말하듯 전달.
2. 존댓말 금지: 독자에게 절대 '여러분', '구독자님들'이라 부르며 존대하지 마십시오.
3. 지루한 서론 금지: 인사는 절대 하지 않습니다. 바로 본론으로 들어갑니다.
4. 완벽한 맞춤법 강박 버리기: 구어체 느낌을 살리기 위해 약간의 문법 파괴를 허용.

분량: 약 40초~50초 분량(공백 포함 약 250~350자 내외)`,Pt=`# <동적 타겟팅 기반 쇼핑형 대본 생성 지침서 v31.0>

이 지침서는 입력된 소재를 분석하여 가장 구매 확률이 높은 '최적의 타겟'을 스스로 찾아내고, 그들의 구매 욕구를 자극하는 쇼핑형 숏폼 대본 제작을 위한 절대 규칙이다.

### [단계 0: DYNAMIC TARGETING - 최적 타겟 자동 발굴]
최상위 목표: 소재를 분석하여 가장 즉각적이고 폭발적인 구매 반응을 보일 '최적의 타겟 페르소나'를 AI가 스스로 정의하고 선언한다.
1. 소재 매력도 스캔: 제품의 기능, 디자인, 감성이 어떤 연령대/성별/관심사 그룹에게 '필수템'으로 인식될지 판단.
2. 톤앤매너 매칭: 제품 분위기를 타겟의 소비 성향과 매칭.
3. 최종 타겟 선언: 대본 작성 전, [타겟 명칭]과 [핵심 이유]를 먼저 선언.

### [단계 1: 4단계 '구매 합리화' 프로토콜]

1단계: 타겟 본능 후킹 & 문제 종결 (0~5초)
* 목표: 설정된 타겟을 정확히 호출하고, 이 제품이 그들의 고질적인 문제나 갈증을 해결함을 선언.
* 패턴: (남성/덕후) "와, 남자들 이거 보면 환장합니다." / (여성/감성) "보자마자 소리 질렀어요." / (주부/생활) "살림은 장비빨이라더니."
* 제품의 핵심 가치를 타겟의 언어로 한 문장 요약하여 선포.

2단계: 기술적 명분 & 디테일 해부 (5~20초)
* 목표: 단순한 물건이 아님을 증명. 타겟이 중요하게 생각하는 포인트를 파고듦.
* 화법: "내부의 [핵심요소]가 ~하게 작용하는데요" / "단순한 ~이 아니라, ~까지 완벽하게 신경 썼죠"

3단계: 로망 실현 & 라이프스타일의 변화 (20~30초)
* 목표: 제품 사용 시 변하게 될 타겟의 '삶의 질'이나 '이미지'를 이상적으로 묘사.
* 필수 도입: "게다가 ~", "진짜 하이라이트는 여기죠."

4단계: 현실적 위트 & 사용 제안 (마무리)
* 목표: 로망에서 현실로 돌아오게 하며, 구체적인 사용 씬이나 구매 팁, 귀여운 경고.
* 화법: "~라고 하네요", "~할지도 모르겠네요", "~하기엔 이만한 게 없죠"

### [단계 2: 타겟 맞춤형 톤앤매너 적용]
* 전문가/에디터 톤 (남성/테크): 분석적, 흥분, 자신감 ("압도적인", "괴물 같은 성능", "솔직히 미쳤습니다")
* 찐친/공감 톤 (여성/1020): 감성적, 호들갑, 공유 욕구 ("대박", "너무 영롱하죠", "나만 알고 싶은데")
* 선배/정보통 톤 (주부/생활): 신뢰, 실용성 강조, 솔직함 ("확실히 다릅니다", "후회 안 하실 거예요")`,Lt=`# 고조회수 쇼츠 영상 대본 제작 지침서 (The Replicable Success Algorithm) v2.0

### 제1원칙: 4단계 '정보 각인' 프로토콜을 따르라

모든 영상 대본은 아래 4단계 구조를 예외 없이 따른다.

A단계 (0~5초): 시각적 충격과 언어적 정의
* 목표: 시청자의 분석적 사고를 차단하고, 현상을 뇌에 각인시킨다.
* 실행: 영상의 가장 충격적이거나 신기한 '결과' 장면을 시작과 동시에 보여준다.
* 공식: "이것은 [고유명사/현상]입니다." / "[결과]가 일어나는 모습입니다."

B단계 (5~12초): 원리 설명으로 지적 만족감 부여
* 목표: '왜?', '어떻게?'에 대한 답을 제공하여 시청자에게 지식 습득의 쾌감을 준다.
* 공식: "이게 가능한 이유는 [핵심 원리] 때문인데요." / "사실 이것은 [전문 용어]라는 것으로, [쉬운 설명]을 하는 원리입니다."

C단계 (12~18초): '의외성의 한 스푼'으로 깊이를 더하라
* 목표: 단순 정보를 '이야기'로 승격시켜 시청자의 기억에 강하게 남긴다.
* 3가지 유형의 '반전' 중 반드시 하나를 삽입:
  1. 한계/위험성 제시: "다만 이 기술은 [치명적 단점]이 있어서..."
  2. 통념 파괴: "하지만 우리가 알던 것과는 달리, 사실은 [반전 사실]입니다."
  3. 사회/문화적 맥락 부여: "안타까운 건 [숨겨진 배경] 때문에..."

D단계 (마무리): 결론의 증발
* 명확한 끝맺음 없이 여운을 남겨 영상 반복 재생이나 다음 영상 시청을 유도.
* 요약, 정리, 인사 등 모든 종류의 결론을 삭제.

### 제2원칙: 3초 안에 시청자를 포획하는 4대 후킹 공식
1. 결과 선언형: "이렇게 [행위]했을 뿐인데, [놀라운 결과]가 만들어집니다."
2. 가치 판단형: "이것은 세계에서 가장 [형용사]한 OO입니다."
3. 역설 제시형: "왜 [주체]는 [상식 밖의 행동]을 하는 것일까요?"
4. 존재 정의형: "이것은 [국가/분야]의 [고유명사]라는 것입니다."

### 제3원칙: '지식 큐레이터'의 어휘 팔레트를 사용하라
* 정의/명명: ~라고 부릅니다, 이것은, ~라는, 일종의
* 논리/인과: 때문에, 이유는, 덕분에, 이로 인해, 원리는
* 반전/심화: 하지만, 다만, 사실은, 그럼에도 불구하고, 안타까운 건
* 감탄/가치부여: 신의 경지에 이른, 예술적, 완벽한, 천재적인, 충격적인

### 제4원칙: '신뢰의 이중주' 어미 활용법
* 단정의 화법 (Fact 전달): -입니다, -습니다, -하죠, -것이죠
* 전달의 화법 (Report 전달): -다고 하네요, -다고 합니다
* 실전 조합: "핵심은 [A라는 원리]입니다.[단정] 다만, 숙련되기까지는 [B라는 시간]이 걸린다고 합니다.[전달]"

### 제5원칙: 의도된 미완결로 여운을 극대화하라
1. '심화 정보' 제시형: C단계의 반전/한계점을 마지막 문장으로 제시하고 그대로 끝낸다.
2. '상황 묘사' 지속형: 영상 속 마지막 장면을 묘사하거나 감탄하는 문장으로 내레이션을 끝낸다.
3. '청각적 마침표'형: 내레이션이 끝난 후 현장음이나 효과음으로 마무리.`,Ot=`### [System Prompt: '휴머니즘 사이다 쇼츠(Shorts) 스토리텔러' 페르소나 정의서]

당신은 유튜브 쇼츠(Shorts)와 릴스(Reels)에서 폭발적인 조회수를 기록하는 '휴머니즘 사이다 스토리텔러'입니다. 당신은 기업 회장, 리더, 혹은 절대적인 존재가 약자를 괴롭히는 빌런을 처단하고 정의를 구현하는 이야기를 가장 극적이고 감동적으로 전달하는 능력을 가졌습니다.

사용자가 어떤 주제를 던져주더라도, 당신은 그 내용을 [빌런의 갑질 -> 위기 -> 절대자의 등장 및 참교육 -> 감동적인 결말 -> 시청자 질문]이라는 문법으로 변환하여 대본을 작성해야 합니다.

### 1. [Cognitive Model] 사고 회로 및 세계관
* 권선징악의 이분법: 세상은 '개념 없는 중간 관리자(빌런)'와 '묵묵히 일하는 약자(피해자)', 그리고 이를 바로잡는 '진정한 리더(해결사)'로 구성.
* 극적인 인과율: 사소한 실수나 약점은 빌런에게 공격의 빌미가 되지만, 해결사에게는 감싸주어야 할 '훈장'이나 '사연'.
* 감동 강박: 모든 이야기의 결론은 돈이나 권력보다 '사람', '의리', '본질'이 중요하다는 교훈으로 귀결.

### 2. [Syntactic Fingerprint] 문장 구조 및 호흡
* 시그니처 오프닝: 충격적인 상황 묘사 -> 반응 묘사 -> "대체 무슨 일일까요?" 훅 질문 필수.
* 전환점 트리거: 위기가 최고조에 달했을 때 반드시 "바로 그때였습니다" 사용.
* 종결어미: "~했죠", "~습니다", "~내뱉었습니다" 등 구어체와 문어체 혼용, 단호하고 빠른 호흡.
* 마무리 패턴: 반드시 시청자에게 의견을 묻는 질문으로 끝맺음. ("여러분은 어떻게 생각하시나요?")

### 3. [Visual Formatting] 시각적 리듬 및 연출
* 행동 지문: 괄호() 쓰지 않고, 행동을 문장 속에 직접 녹여냄.
* 소리 묘사: 타격음이나 상황음을 텍스트로 직접 표기. (예: 쾅, 퍽, 짝)
* 긴장감 조성: 문단은 짧게 끊지 않고, 상황이 이어지는 호흡대로 덩어리째 서술.

### 4. [Lexical Database] 핵심 어휘 및 치환 규칙
* 상태 묘사: "얼어붙었습니다", "하얗게 질렸습니다", "사색이 되었습니다", "아수라장이 됐죠", "경악했습니다".
* 빌런의 언어: "늙은이", "민폐", "도둑놈", "당장 꺼져", "월급 도둑", "주제 파악".
* 해결사의 언어: "가족", "자산", "훈장", "역사", "의리", "책임", "자격".
* 참교육 동사: "일갈했습니다", "쇠기를 박았습니다", "쏘아봤습니다", "쫓겨났죠".

### 5. [Narrative Arc] 기-승-전-결 전개 패턴
1. [도입]: 자극적인 대사나 상황으로 시작 -> "이 행동에 모두 충격에 빠집니다. 대체 무슨 일일까요?"
2. [전개]: 약자가 실수를 하거나 빌런에게 억울하게 당함 -> 빌런의 폭언.
3. [위기]: 약자가 무릎을 꿇거나 눈물을 흘림 -> 빌런의 갑질이 절정.
4. [절정]: "바로 그때였습니다" -> 해결사 등장 -> 상황 목격 -> 빌런 제압.
5. [결말]: 약자에게 반전 보상 -> 빌런의 몰락.
6. [아웃트로]: 해결사의 철학 요약 -> "여러분은 어떻게 생각하시나요?"

### 6. [Emotional Dynamics] 감정의 증폭
* 분노 유발: 초반부에 빌런의 대사를 아주 모욕적으로 작성하여 청자의 분노를 최대한 끌어올림.
* 카타르시스: 해결사가 등장하여 빌런을 혼낼 때는 논리보다는 '감성'과 '호통'으로 제압.
* 따뜻함: 해결사가 약자를 대할 때는 말투가 급격히 부드러워지며, 신체 접촉으로 인간미 강조.

### 7. [Meta-Fiction] 변주 규칙
* 주제가 '과학'일 경우: 원자는 '약자', 불안정한 전자는 '빌런', 물리 법칙이나 과학자는 '회장님'으로 의인화.
* 주제가 '철학'일 경우: 잘못된 사상은 '빌런', 고뇌하는 인간은 '약자', 철학자는 '회장님' 포지션으로 참교육.
* 주제가 무엇이든 '갑질 -> 참교육 -> 감동'의 프레임에 강제로 끼워 맞춤.

### 8. [Negative Constraints] 절대 금기 사항
* 설명조 금지: 무조건 극적인 에피소드처럼 각색하십시오.
* 중립 금지: 빌런에게 타당한 이유를 부여하지 마십시오.
* 복잡한 결말 금지: 결말은 권선징악으로 명쾌해야 합니다.
* 라벨링 금지: 출력물 내부에 [도입], [전개] 같은 구분자를 넣지 마십시오.`,ce=[{id:"standard-longform",name:"스탠다드 롱폼",icon:"📝",description:"똑똑한 옆집 형 · 6000자 줄글",systemPrompt:Et},{id:"community",name:"커뮤니티",icon:"🔥",description:"짤감자 음슴체 · 쇼츠 250~350자",systemPrompt:Mt},{id:"shopping",name:"쇼핑",icon:"🛒",description:"동적 타겟팅 · 구매 합리화 숏폼",systemPrompt:Pt},{id:"knowledge",name:"지식",icon:"🧪",description:"정보 각인 프로토콜 · 지식 쇼츠",systemPrompt:Lt},{id:"humanism",name:"휴머니즘 사이다",icon:"⚖️",description:"빌런 참교육 · 감동 사이다 쇼츠",systemPrompt:Ot}],Rt={high:{bg:"bg-red-900/30",text:"text-red-300",label:"HIGH"},medium:{bg:"bg-yellow-900/30",text:"text-yellow-300",label:"MID"},low:{bg:"bg-gray-800/50",text:"text-gray-400",label:"LOW"}};function Ft(){const l=re(s=>s.channelScripts),n=re(s=>s.channelGuideline),i=re(s=>s.channelInfo),d=re(s=>s.savedBenchmarks),h=re(s=>s.loadBenchmark),U=re(s=>s.removeBenchmark),I=de(s=>s.topics),R=de(s=>s.setTopics),M=de(s=>s.setBenchmarkScript),z=de(s=>s.setActiveStep),P=de(s=>s.setSelectedTopic),[r,g]=o.useState(!1),m=he(r),[w,j]=o.useState(null),L=rt(s=>s.setActiveTab),[y,f]=o.useState(!1),q=l.length>0||n!==null,[H,G]=o.useState(""),F=o.useCallback(async()=>{if(r)return;g(!0),G("");const s=l.slice(0,5).map((D,X)=>`[대본 ${X+1}] 제목: ${D.title}
조회수: ${D.viewCount.toLocaleString()}
내용(앞 500자): ${D.transcript.slice(0,500)}`).join(`

`),te=n?`[채널 스타일 가이드]
채널명: ${n.channelName}
말투: ${n.tone}
구조: ${n.structure}
주제: ${n.topics.join(", ")}
도입패턴: ${n.hookPattern}
마무리패턴: ${n.closingPattern}`:"";try{const X=(await Ce([{role:"system",content:"당신은 유튜브 콘텐츠 전략가입니다. 벤치마크 채널의 대본과 스타일을 분석하여 바이럴 가능성이 높은 주제 10개를 추천합니다. 반드시 JSON 배열로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력합니다."},{role:"user",content:`다음 벤치마크 채널의 대본과 스타일을 분석하고, 이 채널 스타일에 맞는 새로운 영상 주제 10개를 추천해주세요.

${te}

${s}

다음 JSON 배열 형식으로 출력하세요:
[
  {
    "id": 1,
    "title": "추천 주제 제목",
    "mainSubject": "핵심 소재 한 줄 설명",
    "similarity": "벤치마크 대본과의 유사점/차별점",
    "scriptFlow": "대본 흐름 (예: 후킹 > 사례 > 분석 > CTA)",
    "viralScore": "high 또는 medium 또는 low"
  }
]

바이럴 가능성 판단 기준:
- high: 조회수 상위 대본과 유사한 구조 + 트렌드 소재
- medium: 채널 스타일과 맞지만 일반적 소재
- low: 실험적/틈새 주제

10개를 추천하되, high 3개, medium 4개, low 3개 비율로 추천하세요.`}],{temperature:.8,maxTokens:4e3})).choices?.[0]?.message?.content||"";if(!X.trim())throw new Error("AI 응답이 비어있습니다. 다시 시도해주세요.");let S=X;const me=X.match(/```(?:json)?\s*([\s\S]*?)```/);me&&(S=me[1].trim());let _;try{_=JSON.parse(S)}catch{throw new Error("AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.")}Array.isArray(_)&&_.length>0&&R(_.map((W,se)=>({id:W.id||se+1,title:W.title||`주제 ${se+1}`,mainSubject:W.mainSubject||"",similarity:W.similarity||"",scriptFlow:W.scriptFlow||"",viralScore:["high","medium","low"].includes(W.viralScore)?W.viralScore:"medium"})))}catch(D){const X=D instanceof Error?D.message:String(D);G(`벤치마크 분석 실패: ${X}`)}finally{g(!1)}},[r,l,n,R]),x=o.useCallback(()=>{R([]),F()},[F,R]),u=o.useCallback(s=>{P(s),z(2)},[P,z]),ne=o.useCallback(s=>{j(s.videoId),M(s.transcript)},[M]);return e.jsxs("div",{className:"border-t border-gray-700/30",children:[e.jsxs("button",{onClick:()=>f(!y),className:"w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm font-bold text-gray-300",children:"벤치마크 대본"}),q&&e.jsxs("span",{className:"text-sm px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-600/30",children:[l.length,"개"]})]}),e.jsx("span",{className:`text-gray-500 text-sm transition-transform ${y?"":"rotate-180"}`,children:"▼"})]}),!y&&e.jsxs("div",{className:"px-4 pb-4 space-y-3 max-h-[320px] overflow-auto",children:[i&&e.jsxs("div",{className:"flex items-center gap-2 p-2 bg-gray-800/30 rounded-lg border border-gray-700/30",children:[i.thumbnailUrl&&e.jsx("img",{src:i.thumbnailUrl,alt:i.title,className:"w-8 h-8 rounded-full object-cover"}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("div",{className:"text-sm font-medium text-white truncate",children:i.title}),e.jsxs("div",{className:"text-sm text-gray-400",children:["구독자 ",i.subscriberCount.toLocaleString(),"명"]})]})]}),l.length>0&&e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("span",{className:"text-sm text-gray-500 uppercase tracking-wider",children:"채널 대본"}),l.slice(0,5).map(s=>e.jsxs("button",{onClick:()=>ne(s),className:`w-full text-left p-2 rounded-lg border transition-colors text-sm flex items-center gap-3
                    ${w===s.videoId?"bg-blue-600/20 border-blue-500/50 text-blue-200":"bg-gray-800/30 border-gray-700/30 text-gray-300 hover:border-gray-600"}`,children:[s.thumbnailUrl?e.jsx("img",{src:s.thumbnailUrl,alt:"",className:"w-20 h-12 rounded object-cover flex-shrink-0 bg-gray-900"}):e.jsx("div",{className:"w-20 h-12 rounded bg-gray-800 flex items-center justify-center flex-shrink-0",children:e.jsx("svg",{className:"w-5 h-5 text-gray-600",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:1.5,d:"M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"})})}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("div",{className:"font-medium truncate",children:s.title}),e.jsx("div",{className:"text-sm text-gray-500 mt-0.5",children:s.viewCount>0?`${s.duration} / 조회수 ${s.viewCount.toLocaleString()}`:`${s.transcript.length.toLocaleString()}자`})]}),w===s.videoId&&e.jsx("span",{className:"text-blue-400 flex-shrink-0",children:"✓"})]},s.videoId))]}),H&&e.jsx("div",{className:"px-3 py-2 bg-red-900/30 border border-red-500/50 rounded-lg",children:e.jsx("p",{className:"text-sm text-red-400",children:H})}),q&&I.length===0&&e.jsx("button",{onClick:F,disabled:r,className:`w-full py-2.5 bg-gradient-to-r from-blue-600 to-violet-600
                hover:from-blue-500 hover:to-violet-500 disabled:opacity-40
                text-white rounded-lg text-sm font-bold shadow-md transition-all
                flex items-center justify-center gap-2`,children:r?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"animate-spin",children:"◠"})," 분석 중...",m>0&&e.jsx("span",{className:"text-xs text-gray-400 tabular-nums",children:ge(m)})]}):e.jsx(e.Fragment,{children:"벤치 분석 및 주제 추천"})}),d.length>0&&!q&&e.jsxs("div",{className:"space-y-1.5",children:[e.jsx("span",{className:"text-sm text-gray-500 uppercase tracking-wider",children:"저장된 벤치마크"}),d.map(s=>e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("button",{onClick:()=>h(s.id),className:"flex-1 text-left p-2 rounded-lg border bg-gray-800/30 border-gray-700/30 text-gray-300 hover:border-blue-500/50 hover:bg-blue-900/10 transition-colors text-sm",children:[e.jsx("div",{className:"font-medium",children:s.channelName}),e.jsxs("div",{className:"text-xs text-gray-500",children:[s.scripts.length,"개 대본 / ",new Date(s.savedAt).toLocaleDateString("ko")]})]}),e.jsx("button",{onClick:()=>U(s.id),className:"text-gray-600 hover:text-red-400 text-sm p-1 transition-colors",title:"삭제",children:"✕"})]},s.id))]}),!q&&d.length===0&&e.jsxs("div",{className:"bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-blue-500/40 rounded-xl p-5 text-center space-y-3",children:[e.jsx("div",{className:"w-12 h-12 mx-auto bg-blue-600/20 rounded-full flex items-center justify-center",children:e.jsx("span",{className:"text-2xl",children:"📊"})}),e.jsx("p",{className:"text-base font-bold text-white",children:"채널분석 탭에서 벤치마크 대본을 먼저 추출하세요"}),e.jsxs("p",{className:"text-sm text-gray-300 leading-relaxed",children:[e.jsx("span",{className:"text-blue-400 font-bold",children:"채널분석"})," > ",e.jsx("span",{className:"text-blue-400 font-bold",children:"채널 분석실"}),"에서 YouTube 채널 URL을 입력하고 ",e.jsx("span",{className:"text-cyan-400 font-bold",children:'"분석 시작"'}),"을 클릭하면",e.jsx("br",{}),"대본이 자동 수집됩니다."]}),e.jsx("div",{className:"flex justify-center",children:e.jsxs("button",{onClick:()=>L("channel-analysis"),className:"inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-blue-900/30",children:[e.jsx("span",{children:"🔍"}),e.jsx("span",{children:"채널분석 탭으로 이동"}),e.jsx("span",{children:"→"})]})})]}),I.length>0&&e.jsxs("div",{className:"space-y-2",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsx("span",{className:"text-sm text-gray-500 uppercase tracking-wider",children:"주제 추천"}),e.jsx("button",{onClick:x,className:"text-sm text-blue-400 hover:text-blue-300 underline",children:"주제 10개 재추천"})]}),I.map(s=>{const te=Rt[s.viralScore];return e.jsx("button",{onClick:()=>u(s),className:`w-full text-left p-2.5 bg-gray-800/30 rounded-lg border border-gray-700/30
                      hover:border-gray-600 transition-colors group`,children:e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsxs("span",{className:"text-sm font-bold text-gray-500 mt-0.5 flex-shrink-0 w-5",children:[s.id,"."]}),e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm font-medium text-white group-hover:text-blue-300 transition-colors",children:s.title}),e.jsx("span",{className:`text-xs px-1.5 py-0.5 rounded font-bold ${te.bg} ${te.text}`,children:te.label})]}),e.jsx("div",{className:"text-sm text-gray-400 mt-1 truncate",children:s.mainSubject}),e.jsx("div",{className:"text-sm text-gray-500 mt-0.5 truncate",children:s.scriptFlow})]})]})},s.id)})]})]})]})}const Dt={1:"bg-red-500",2:"bg-orange-500",3:"bg-yellow-500 text-gray-900",4:"bg-green-500",5:"bg-blue-500"},Gt=l=>l>=85?{label:"높음",className:"bg-red-500/20 text-red-400 border-red-500/40"}:l>=70?{label:"중간",className:"bg-yellow-500/20 text-yellow-400 border-yellow-500/40"}:{label:"낮음",className:"bg-gray-600/30 text-gray-400 border-gray-600/40"},_t=l=>{const n=parseInt(l.replace(/[^0-9]/g,""),10);return isNaN(n)?l:n>=1e8?`${(n/1e8).toFixed(1)}억`:n>=1e4?`${Math.round(n/1e4)}만`:n>=1e3?`${(n/1e3).toFixed(1)}천`:l},Vt=({onSelect:l})=>{const n=J(r=>r.recommendedTopics),i=J(r=>r.selectedTopicId),d=J(r=>r.selectTopic),h=J(r=>r.isRecommending),U=J(r=>r.recommendProgress),[I,R]=o.useState(null),M=o.useRef(null);o.useEffect(()=>{const r=g=>{g.key==="Escape"&&I&&R(null)};return document.addEventListener("keydown",r),()=>document.removeEventListener("keydown",r)},[I]),o.useEffect(()=>{const r=g=>{I&&M.current&&!M.current.contains(g.target)&&R(null)};return document.addEventListener("mousedown",r),()=>document.removeEventListener("mousedown",r)},[I]);const z=o.useCallback(r=>{R(g=>g===r?null:r)},[]),P=o.useCallback(r=>{i===r.id?d(null):(d(r.id),l(r))},[i,d,l]);return h?e.jsxs("div",{className:"mt-6 p-6 bg-gray-800/60 border border-gray-700 rounded-xl",children:[e.jsxs("div",{className:"flex items-center gap-3 mb-3",children:[e.jsx("div",{className:"w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"}),e.jsx("span",{className:"text-sm font-semibold text-purple-300",children:U.step||"AI 소재 추천 준비 중..."})]}),e.jsx("div",{className:"w-full h-2.5 bg-gray-700 rounded-full overflow-hidden",children:e.jsx("div",{className:"h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 transition-all duration-500 ease-out",style:{width:`${Math.max(U.percent,2)}%`,backgroundSize:"200% 100%",animation:"shimmer 2s linear infinite"}})}),e.jsxs("p",{className:"text-xs text-gray-500 mt-2 text-right",children:[U.percent,"%"]}),e.jsx("style",{children:"@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }"})]}):n.length===0?null:e.jsxs("div",{className:"mt-6",ref:M,children:[e.jsxs("h3",{className:"text-base font-bold text-white mb-3 flex items-center gap-2",children:[e.jsx("span",{className:"text-lg",children:"💡"})," AI 추천 소재 (",n.length,")"]}),e.jsx("div",{className:"space-y-1.5",children:n.map((r,g)=>{const m=I===r.id,w=i===r.id,j=Gt(r.estimatedViralScore),L=Dt[g+1]||"bg-gray-500";return e.jsxs("div",{className:`
                rounded-lg border transition-all duration-200 overflow-hidden
                ${w?"border-purple-500 bg-purple-500/5":"border-gray-700/60 bg-gray-800/50"}
                ${m?"shadow-lg":""}
              `,children:[e.jsxs("button",{type:"button",onClick:()=>z(r.id),className:"w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700/30 transition-colors",children:[e.jsx("span",{className:`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${L}`,children:g+1}),e.jsx("span",{className:"flex-1 text-sm font-bold text-white truncate",children:r.title}),e.jsx("span",{className:`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${j.className}`,children:j.label}),e.jsx("span",{className:`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${w?"border-purple-400 bg-purple-500 text-white":"border-gray-600 bg-transparent"}`,onClick:y=>{y.stopPropagation(),P(r)},children:w&&e.jsx("svg",{className:"w-3 h-3",fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:3,children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M5 13l4 4L19 7"})})}),e.jsx("svg",{className:`shrink-0 w-4 h-4 text-gray-500 transition-transform duration-200 ${m?"rotate-180":""}`,fill:"none",viewBox:"0 0 24 24",stroke:"currentColor",strokeWidth:2,children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M19 9l-7 7-7-7"})})]}),m&&e.jsxs("div",{className:"px-4 pb-4 pt-1 border-t border-gray-700/40 space-y-3",children:[e.jsx("h4",{className:"text-lg font-bold text-white leading-snug",children:r.title}),e.jsxs("p",{className:"text-sm text-yellow-300 italic",children:[e.jsx("span",{className:"not-italic font-semibold text-yellow-400",children:"훅: "}),"“",r.hook,"”"]}),e.jsx("p",{className:"text-sm text-gray-300 leading-relaxed",children:r.synopsis}),r.referenceVideos.length>0&&e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-semibold text-gray-400 mb-1",children:"📊 참고 영상"}),e.jsx("ul",{className:"space-y-0.5",children:r.referenceVideos.slice(0,3).map((y,f)=>e.jsxs("li",{className:"text-xs text-gray-400 truncate",children:["• “",y.title,"”",e.jsxs("span",{className:"text-gray-500 ml-1",children:["(조회수 ",_t(y.viewCount),")"]})]},f))})]}),e.jsxs("div",{className:"flex flex-wrap gap-1",children:[e.jsx("span",{className:"text-xs text-purple-400 mr-1",children:"🧠"}),r.instinctMatch.split("+").map((y,f)=>e.jsx("span",{className:`inline-block text-[10px] font-bold px-2 py-0.5 rounded border
                          bg-purple-900/30 text-purple-300 border-purple-500/50`,children:y.trim()},f))]}),e.jsxs("p",{className:"text-xs text-gray-400",children:[e.jsx("span",{className:"text-yellow-500",children:"💡"})," 바이럴 이유: ",r.whyViral]}),e.jsx("button",{type:"button",onClick:y=>{y.stopPropagation(),P(r)},className:`
                      w-full py-2.5 rounded-lg text-sm font-bold transition-all duration-200 active:scale-[0.98]
                      ${w?"bg-purple-600/30 text-purple-300 border border-purple-500/50":"bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white border border-pink-400/30 shadow-md"}
                    `,children:w?"✔ 선택됨":"📌 이 소재 선택"})]})]},r.id)})})]})},Bt=Me.lazy(()=>nt(()=>import("./InstinctBrowser-DVnlGYAE.js"),__vite__mapDeps([0,1,2,3,4,5,6,7]))),Jt=Me.lazy(()=>nt(()=>import("./ScriptExpander-fTmXfB_X.js"),__vite__mapDeps([8,1,2,3,5])));function je(l){const n=Math.round(l/650*60),i=Math.floor(n/60),d=n%60;return i===0?`약 ${d}초`:d===0?`약 ${i}분`:`약 ${i}분 ${d}초`}const Ut=[{id:E.LONG,label:"롱폼",color:"bg-blue-600"},{id:E.SHORT,label:"숏폼",color:"bg-emerald-600"},{id:E.NANO,label:"나노",color:"bg-pink-600"},{id:E.MANUAL,label:"수동",color:"bg-gray-600"}],zt={[E.LONG]:"롱폼 — 하위 옵션(호흡/디테일)에 따라 분할 방식이 달라집니다",[E.SHORT]:"쇼츠/릴스 — 1문장 = 1장면, 빠른 컷 전환",[E.NANO]:"틱톡/도파민 — 쉼표 단위 초고속 분할",[E.MANUAL]:"사용자가 직접 입력한 줄바꿈을 기준으로 분할합니다"},Ae={DEFAULT:{label:"호흡 중심",desc:"2~3문장 → 1장면 (적은 컷, 강의/설명)"},DETAILED:{label:"디테일 중심",desc:"1문장 → 1장면 (많은 컷, 다큐/사연)"}},Ht=[{id:1,label:"소재 준비",icon:"🎯"},{id:2,label:"추천 소재 선택",icon:"🔍"},{id:3,label:"대본 작성",icon:"✍️"},{id:4,label:"장면 설정",icon:"🎬"}],st=()=>e.jsx("div",{className:"flex items-center justify-center h-32",children:e.jsx("div",{className:"w-6 h-6 border-2 border-gray-600 border-t-violet-400 rounded-full animate-spin"})});function Wt(){const{generatedScript:l,setGeneratedScript:n,finalScript:i,setFinalScript:d,styledScript:h,styledStyleName:U,setStyledScript:I,clearStyledScript:R,isGenerating:M,startGeneration:z,finishGeneration:P,selectedTopic:r,benchmarkScript:g,videoFormat:m,setVideoFormat:w,longFormSplitType:j,setLongFormSplitType:L,smartSplit:y,targetCharCount:f,setTargetCharCount:q,splitResult:H,setSplitResult:G}=de(),F=rt(t=>t.setActiveTab),x=re(t=>t.channelGuideline),[u,ne]=o.useState(null),[s,te]=o.useState(!1),[D,X]=o.useState(!0),[S,me]=o.useState(""),[_,W]=o.useState(""),[se,Pe]=o.useState(""),[xe,V]=o.useState(""),[ve,pe]=o.useState(""),[ue,Le]=o.useState(null),[K,at]=o.useState(null),[Oe,Re]=o.useState(""),[Fe,lt]=o.useState(!1),N=J(t=>t.selectedMechanismIds),we=J(t=>t.isRecommending),De=J(t=>t.recommendedTopics),Se=J(t=>t.selectedTopicId),Ge=he(we),_e=he(M),Ve=he(!!ue);o.useEffect(()=>{r&&(W(r.title),Pe(`${r.mainSubject}

대본 흐름: ${r.scriptFlow}`))},[r]);const p=i||l?.content||S||"",Be=p,Je=o.useMemo(()=>p.trim()?Nt(p,m,y,m===E.LONG?j:void 0):0,[p,m,y,j]),ae=o.useMemo(()=>{if(!p.trim())return{original:"",scenes:[]};const t=p.split(/\n+/).filter(k=>k.trim());if(t.length===0)return{original:"",scenes:[]};const a=/[.!?。！？]\s*/,b=t.filter(k=>k.split(a).filter(T=>T.trim()).length>=2).sort((k,T)=>T.length-k.length)[0]||t.reduce((k,T)=>k.length>=T.length?k:T,""),A=vt(b,m,y,m===E.LONG?j:void 0);return{original:b,scenes:A}},[p,m,y,j]),ot=o.useCallback(()=>{const t=i||h||l?.content||S||"";t.trim()&&d(t),F("sound-studio")},[l,S,i,h,d,F]),[ee,Ue]=o.useState(!1),[ze,be]=o.useState(0),He=he(ee),it=o.useCallback(async()=>{if(!p.trim()||ee)return;if(!Ne()){V("Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.");return}const t=qe.getState();if(!t.currentProjectId){if(!await wt()){V("저장 공간이 부족합니다. 기존 프로젝트를 삭제해주세요.");return}const B=`proj_${Date.now()}`;t.setCurrentProjectId(B),t.config||t.setConfig({mode:"SCRIPT",script:p.substring(0,500),videoFormat:m,aspectRatio:"LANDSCAPE",imageModel:"NANO_COST",smartSplit:!0}),t.setProjectTitle(p.trim().substring(0,30)||"새 프로젝트"),fe("새 프로젝트가 자동 생성되었습니다")}Ue(!0),be(0),V("");let a=0;const c=p.length,b=setInterval(()=>{const C=c>8e3?.8:c>5e3?1.2:c>3e3?2:3,B=c>8e3?.3:c>5e3?.5:c>3e3?1:1.5,Y=c>8e3?.1:c>5e3?.2:c>3e3?.3:.5;a+=a<40?C:a<70?B:Y,a=Math.min(a,88),be(v=>Math.max(v,Math.round(a)))},c>8e3?800:c>5e3?500:300),A=i||h||l?.content||S||"";A.trim()&&d(A);const k=m===E.LONG?j==="DETAILED"?"롱폼 디테일 중심":"롱폼 호흡 중심":m===E.SHORT?"숏폼":"나노",T=`[절대 금지 — 위반 시 분할 품질 0점]
- 문장 중간에서 끊기 금지: 관형절("~하는/~된/~할"), 인용절("~라고/~다고"), 부사절("~해서/~하며") 중간 절단 절대 금지
- 주어와 서술어 분리 금지: "그는 ... 했습니다"를 "그는"과 "했습니다"로 나누지 마세요
- 인용문 분할 금지: 따옴표("...") 안의 내용은 절대 쪼개지 마세요
- 조사/어미 직전 절단 금지: "잠수함의" → "잠수함" / "의" ← 이런 분할 금지
- 의미 없는 조각 생성 금지: 10자 미만의 무의미한 조각이 단독 장면이 되면 안 됩니다

[핵심 원칙]
- 각 장면은 한국어 화자가 소리 내어 읽었을 때 자연스럽고 완결된 의미를 가져야 합니다
- 원문을 수정하거나 요약하지 마세요. 원문 텍스트를 그대로 유지하되 분할 지점만 결정하세요`,oe={"롱폼 호흡 중심":`[롱폼 호흡 중심 — 서사 흐름 기반 분할]
${T}

[분할 기준]
- 하나의 장면 = 하나의 "이야기 단위(narrative beat)"입니다
- 같은 주제/맥락/감정의 문장 2~3개를 하나로 묶으세요
- 장면이 바뀌는 자연스러운 지점:
  · 시간 전환 ("이때", "150년 뒤", "1776년")
  · 장소 이동 ("이탈리아로", "런던에서", "뉴욕 앞바다")
  · 화제 전환 ("하지만", "그런데", "한편")
  · 새로운 인물 등장
  · 감정/분위기 전환 (서술 → 감탄, 설명 → 비유)
- 원인+결과, 주장+근거, 질문+답변은 반드시 함께 묶으세요
- 장면당 80~200자가 자연스럽습니다
- 적합: 강의, 세미나, 설명 영상 (장면당 6~14초)`,"롱폼 디테일 중심":`[롱폼 디테일 중심 — 세밀한 컷 분할]
${T}

[분할 기준]
- 기본: 1문장 = 1장면이되, 아래 예외를 반드시 적용하세요
- 예외 1: 맥락상 분리하면 어색한 짧은 문장(40자 미만)은 앞이나 뒤 문장과 묶으세요
  예: "이유는 아주 참담하고도 현실적이었습니다." + 다음 문장 → 함께 (단독으로는 의미 불완전)
- 예외 2: 100자 초과 문장은 의미가 완결되는 절(clause) 단위로 분할하되, 반드시 각 조각이 독립적으로 읽힐 수 있어야 합니다
  좋은 예: "그는 이력서에서 자신을 다연장 로켓포, 장갑차, 거대 석궁의 개발자라고 소개하며" / "공작의 극심한 불안감을 정확히 저격했죠."
  나쁜 예: "그는 이력서에서 자신을" / "다연장 로켓포, 장갑차, 거대 석궁의 개발자라고 소개하며" ← 첫 조각이 불완전
- 예외 3: "~였기 때문이죠", "~인 셈입니다" 같은 결론부가 매우 짧으면 앞 문장과 묶으세요
- 적합: 다큐멘터리, 사연, 스토리텔링 (장면당 2~9초)`,숏폼:`[숏폼 — 빠른 컷 전환]
${T}

[분할 기준]
- 1문장 = 1장면, 빠른 컷 전환
- 80자 초과 문장은 자연스러운 호흡/의미 단위에서 분할하되 각 조각이 독립적으로 읽혀야 합니다
- 40자 미만 짧은 문장은 분할하지 마세요
- 적합: 쇼츠, 릴스 (장면당 2~7초)`,나노:`[나노 — 도파민 편집, 의미 최소 단위]
${T}

[분할 기준]
- 의미가 완성되는 최소 단위(절/clause)로 분할하세요
- 예: "이것만은 절대 하지 마세요, 왜냐하면 여러분의 건강에, 치명적인 영향을 줄 수 있기 때문입니다"
  → "이것만은 절대 하지 마세요" / "왜냐하면 여러분의 건강에" / "치명적인 영향을 줄 수 있기 때문입니다"
- 단, 2~5자짜리 무의미한 분할은 절대 금지 (예: "아니," 단독은 안 됨)
- 짧은 대화체("아니, 이게 맞나요?")는 통째로 1장면 유지
- 적합: 틱톡, 도파민 편집 (장면당 1~4초)`};try{const C=p.length>8e3?1.8:p.length>5e3?1.5:1.3,B=p.length*C;console.log(`[SceneAnalysis] 시작: ${p.length}자, 포맷: ${k}, 예상출력: ${Math.round(B)}자`);const Y=Date.now(),v=await Xe([{role:"system",content:`당신은 한국어 영상 대본을 장면(Scene) 단위로 분할하는 최고 전문가입니다.
대본의 서사 흐름, 감정 전환, 주제 변화를 정확히 파악하여 각 장면이 자연스럽고 완결된 의미를 갖도록 분할하세요.

${oe[k]}

[출력 형식]
- 반드시 JSON 배열로만 응답하세요: ["장면1 텍스트", "장면2 텍스트", ...]
- 마크다운 코드 블록 없이 순수 JSON만 출력하세요
- 원문 텍스트를 한 글자도 수정/요약/생략하지 마세요. 분할 지점만 결정하세요`},{role:"user",content:`다음 대본을 "${k}" 모드로 장면 분할해주세요:

${p}`}],($,O)=>{const Q=O.length/B,Qe=Math.min(97,40+Math.round(Q*57));be(ye=>Math.max(ye,Qe))},{temperature:.2,maxTokens:Math.max(8e3,p.length*2),responseFormat:{type:"json_schema"}});if(console.log(`[SceneAnalysis] 완료: ${((Date.now()-Y)/1e3).toFixed(1)}초, 응답: ${v.length}자`),console.log("[SceneAnalysis] 응답 앞 200자:",v.slice(0,200)),clearInterval(b),be(100),!v.trim())throw new Error("AI 응답이 비어있습니다.");let Z=[];try{let $=v;const O=v.match(/```(?:json)?\s*([\s\S]*?)```/);O&&($=O[1].trim());const Q=$.match(/\[[\s\S]*\]/);Q&&($=Q[0]),Z=JSON.parse($)}catch($){console.error("[SceneAnalysis] JSON 파싱 실패, extractJsonFromText 시도:",$);try{const O=et(v);if(O){const Q=JSON.parse(O);if(Array.isArray(Q))Z=Q;else if(Q&&typeof Q=="object"){const ye=Object.values(Q).find(yt=>Array.isArray(yt));ye&&(Z=ye)}}}catch{throw console.error("[SceneAnalysis] 모든 파싱 실패. raw 전체:",v),new Error(`JSON 파싱 실패 — AI 응답을 해석할 수 없습니다. (응답 길이: ${v.length}자)`)}}if(!Array.isArray(Z)||Z.length===0)throw new Error(`분할 결과가 비어있습니다. (응답 길이: ${v.length}자)`);G(Z);const ut=Z.join(`
`);d(ut);const Te=St.getState();let $e=Te.speakers[0]?.id||"";if(!$e){const $={id:`speaker-${Date.now()}`,name:"화자 1",color:"#6366f1",engine:"typecast",voiceId:"",language:"ko",speed:1,pitch:0,stability:.5,similarityBoost:.75,style:0,useSpeakerBoost:!0,lineCount:Z.length,totalDuration:0};Te.addSpeaker($),$e=$.id}const Ie=Date.now(),bt=Z.map(($,O)=>({id:`scene-${Ie}-${O}`,scriptText:$.trim(),audioScript:$.trim(),visualPrompt:"",visualDescriptionKO:"",characterPresent:!1,isGeneratingImage:!1,isGeneratingVideo:!1,isNativeHQ:!1}));qe.getState().setScenes(bt),Te.setLines(Z.map(($,O)=>({id:`line-${Ie}-${O}`,speakerId:$e,text:$.trim(),index:O,ttsStatus:"idle",sceneId:`scene-${Ie}-${O}`})))}catch(C){clearInterval(b);const B=C instanceof Error?C.message:String(C);console.error("[SceneAnalysis] 실패:",B,C),V(`장면 분석 실패: ${B}`)}finally{clearInterval(b),Ue(!1)}},[p,m,j,ee,i,h,l,S,d,G]),[ke,We]=o.useState(!1),[Ke,Ye]=o.useState(""),ct=o.useCallback(async t=>{const a=t.target.files?.[0];if(a){We(!0),Ye("");try{const c=await $t(a);if(!c.trim())throw new Error("파일에서 텍스트를 추출할 수 없습니다.");me(c),d(c),n(null)}catch(c){const b=c instanceof Error?c.message:String(c);Ye(`파일 불러오기 실패: ${b}`)}finally{We(!1),t.target.value=""}}},[d,n]),dt=o.useCallback(async()=>{const t=J.getState();t.setIsRecommending(!0),t.clearTopics();try{const a=await Ct({mechanismIds:N,onProgress:(c,b)=>t.setRecommendProgress({step:c,percent:b}),channelGuideline:x?.tone});t.setRecommendedTopics(a)}catch(a){V(a instanceof Error?a.message:"소재 추천 실패")}finally{t.setIsRecommending(!1)}},[N,x]),le=o.useMemo(()=>Se&&De.find(t=>t.id===Se)||null,[Se,De]),mt=o.useCallback(t=>{J.getState().selectTopic(t.id),W(t.title),Pe(t.synopsis)},[]),xt=o.useCallback(async t=>{if(!Ne()){V("Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.");return}z(),pe(""),V("");const a=Ee(N),c=`당신은 유튜브 바이럴 영상 전문 대본 작가입니다.
주어진 소재와 본능 기제를 바탕으로 완성된 대본을 작성합니다.
훅(도입부)에서 선택된 본능 기제가 시청자 심리를 강하게 자극하도록 설계하세요.`,b=`[소재]
제목: ${t.title}
훅: ${t.hook}
줄거리: ${t.synopsis}

[적용할 본능 기제]
${a}

[요구사항]
- 위 소재와 본능 기제를 결합한 완성 대본을 작성하세요
- 대본 길이: 약 ${f}자
- 훅(첫 3초)은 반드시 "${t.hook}"을 기반으로 작성
- 대본 형식: 나레이션 대본 (화자 지시 없이 내레이션만)

대본만 출력하세요. 제목이나 부가 설명 없이 본문만.`;try{const A=await Xe([{role:"system",content:c},{role:"user",content:b}],(k,T)=>{pe(T)},{temperature:.7,maxTokens:Math.min(32e3,Math.max(8e3,f*2))});n({title:t.title,content:A,charCount:A.length,estimatedDuration:`약 ${Math.round(A.length/350)}분`,structure:[]}),d(A),pe("")}catch(A){V(A instanceof Error?A.message:"대본 생성 실패"),pe("")}finally{P()}},[N,f,z,P,n,d]),ht=o.useCallback(async()=>{if(!_.trim()||!se.trim())return;if(!Ne()){V("Evolink API 키가 설정되지 않았습니다. 설정에서 키를 입력해주세요.");return}z(),V("");const t=`${f.toLocaleString()}자 분량 (${je(f)})`,a=`당신은 전문 영상 대본 작가입니다. 사용자의 요청에 따라 완성도 높은 영상 대본을 생성합니다.
반드시 JSON 형식으로만 응답하세요. 마크다운 코드 블록 없이 순수 JSON만 출력하세요.`,c=N.length>0?`

[적용할 본능 기제]
${Ee(N)}

위 본능 기제를 활용하여 도입부(훅)에서 시청자 심리를 강하게 자극하세요.`:"",b=x?`

[채널 스타일 가이드]
채널명: ${x.channelName}
말투: ${x.tone}
구조: ${x.structure}
도입패턴: ${x.hookPattern}
마무리패턴: ${x.closingPattern}
→ 위 채널 스타일에 맞춰 대본을 작성하세요.`:"",A=g?`

[참고 벤치마크 대본 (앞 800자)]
${g.slice(0,800)}
→ 위 대본의 말투와 흐름을 참고하되 내용은 새롭게 작성하세요.`:"",k=r?.instinctAnalysis?`

[주제 본능 분석]
핵심 본능: ${r.instinctAnalysis.primaryInstincts.join(", ")}
조합 공식: ${r.instinctAnalysis.comboFormula}
추천 훅: "${r.instinctAnalysis.hookSuggestion}"
→ 위 심리 기제를 도입부(훅)에 적극 반영하세요.`:"",T=`다음 조건에 맞는 영상 대본을 생성하세요:

- 제목: ${_}
- 줄거리: ${se}
- 분량: ${t}${c}${b}${A}${k}

다음 JSON 형식으로 출력하세요:
{
  "title": "제목",
  "content": "완성된 대본 전문 (줄바꿈 포함)",
  "estimatedDuration": "예상 분량 (예: 약 8분)",
  "structure": ["도입부", "전개", "클라이맥스", "결말"]
}`;try{const C=(await Ce([{role:"system",content:a},{role:"user",content:T}],{temperature:.7,maxTokens:Math.min(32e3,Math.max(8e3,Math.ceil(f*2)))})).choices?.[0]?.message?.content||"";if(!C.trim())throw new Error("AI 응답이 비어있습니다. 다시 시도해주세요.");const B=et(C);let Y;try{Y=JSON.parse(B||"{}")}catch{throw new Error("AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.")}const v=Y.content||"";if(!v.trim())throw new Error("생성된 대본이 비어있습니다. 다시 시도해주세요.");n({title:Y.title||_,content:v,charCount:v.length,estimatedDuration:Y.estimatedDuration||"약 5분",structure:Array.isArray(Y.structure)?Y.structure:["도입부","전개","클라이맥스","결말"]}),d(v)}catch(oe){const C=oe instanceof Error?oe.message:String(oe);V(`대본 생성 실패: ${C}`)}finally{P()}},[_,se,f,N,x,g,r,z,P,n,d]),gt=o.useCallback(async()=>{if(!K)return;const t=ce.find(c=>c.id===K);if(!t)return;const a=l?.content||S||"";if(a.trim()){Le(t.id),Re("");try{const b=(await Ce([{role:"system",content:`${t.systemPrompt}

[중요 지시] 사용자가 제공한 대본을 위 스타일 지침서에 맞게 재작성하십시오. 대본의 핵심 내용과 주제는 유지하되, 문체/어미/톤/구조를 지침서에 맞게 완전히 변환하십시오. 순수 대본 텍스트만 출력하십시오.`},{role:"user",content:`다음 대본을 '${t.name}' 스타일로 재작성하세요:

${a}`}],{temperature:.7,maxTokens:Math.min(32e3,Math.max(8e3,Math.ceil(a.length*2)))})).choices?.[0]?.message?.content||"";if(!b.trim())throw new Error("스타일 변환 결과가 비어있습니다. 다시 시도해주세요.");I(b,t.name),d(b)}catch(c){const b=c instanceof Error?c.message:String(c);Re(`스타일 적용 실패: ${b}`)}finally{Le(null)}}},[K,l,S,_,I,d]),Ze=t=>ne(a=>a===t?null:t),pt=N.length>0||!!g||!!x;return e.jsxs("div",{className:"h-full flex flex-col bg-gray-900 text-gray-100",children:[e.jsxs("div",{className:"px-6 pt-5 pb-4 border-b border-gray-700/50",children:[e.jsx("div",{className:"flex items-center justify-between mb-4",children:e.jsx("h2",{className:"text-lg font-bold text-white",children:"대본 작성"})}),e.jsx("div",{className:"flex items-center gap-0",children:Ht.map((t,a)=>e.jsxs(Me.Fragment,{children:[a>0&&e.jsx("div",{className:"flex-shrink-0 w-8 flex items-center justify-center",children:e.jsx("div",{className:"w-full h-px bg-gray-700"})}),e.jsxs("div",{className:"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400",children:[e.jsx("span",{className:"w-5 h-5 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-sm font-bold",children:t.id}),e.jsx("span",{children:t.icon}),e.jsx("span",{className:"font-medium",children:t.label})]})]},t.id))})]}),e.jsxs("div",{className:"flex-1 overflow-auto",children:[e.jsxs("div",{className:"px-6 py-4 border-b border-gray-700/30",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx("span",{className:"text-sm font-bold text-gray-500 uppercase tracking-wider",children:"Step 1"}),e.jsx("span",{className:"text-sm font-semibold text-gray-300",children:"소재 준비"}),e.jsx("span",{className:"text-sm text-yellow-400/80 font-medium",children:"(선택) 본능 기제/벤치마크를 설정하면 AI 대본에 자동 반영됩니다"})]}),e.jsxs("div",{className:"flex gap-2 flex-wrap",children:[e.jsxs("button",{onClick:()=>Ze("instinct"),className:`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${u==="instinct"?"bg-violet-600/20 border-violet-500/50 text-violet-300":N.length>0?"bg-violet-900/10 border-violet-700/40 text-violet-400 hover:border-violet-500/50":"bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"}`,children:[e.jsx("span",{children:"🧠"}),e.jsx("span",{children:"본능 기제"}),N.length>0&&e.jsxs("span",{className:"text-sm px-1.5 py-0.5 bg-violet-900/50 text-violet-300 rounded-full",children:[N.length,"개"]}),e.jsx("span",{className:"text-gray-600 text-sm",children:u==="instinct"?"▲":"▼"})]}),e.jsxs("button",{onClick:()=>Ze("benchmark"),className:`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all ${u==="benchmark"?"bg-green-600/20 border-green-500/50 text-green-300":g||x?"bg-green-900/10 border-green-700/40 text-green-400 hover:border-green-500/50":"bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"}`,children:[e.jsx("span",{children:"📊"}),e.jsx("span",{children:"벤치마크"}),g&&e.jsx("span",{className:"text-sm px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded-full",children:"참고 대본"}),x&&e.jsx("span",{className:"text-sm px-1.5 py-0.5 bg-orange-900/50 text-orange-300 rounded-full",children:x.channelName}),e.jsx("span",{className:"text-gray-600 text-sm",children:u==="benchmark"?"▲":"▼"})]})]}),pt&&u===null&&e.jsxs("div",{className:"mt-2 px-3 py-2 bg-green-900/15 border border-green-600/25 rounded-lg flex items-center gap-1.5",children:[e.jsx("span",{className:"text-sm text-green-400 font-medium",children:"적용 중 →"}),N.length>0&&e.jsxs("span",{className:"text-sm text-violet-300 font-medium",children:["🧠 본능 ",N.length,"개"]}),g&&e.jsx("span",{className:"text-sm text-green-300 font-medium",children:"📊 벤치마크"}),x&&e.jsxs("span",{className:"text-sm text-orange-300 font-medium",children:["📡 ",x.channelName]}),e.jsx("span",{className:"text-sm text-green-400/70",children:"— AI 생성 시 프롬프트에 자동 포함"})]}),u==="instinct"&&e.jsx("div",{className:"mt-3 rounded-xl border border-violet-700/30 bg-gray-800/20 p-4",children:e.jsx(o.Suspense,{fallback:e.jsx(st,{}),children:e.jsx(Bt,{})})}),u==="benchmark"&&e.jsx("div",{className:"mt-3 max-h-[420px] overflow-auto rounded-xl border border-green-700/30 bg-gray-800/20",children:e.jsx(Ft,{})})]}),e.jsxs("div",{className:"px-6 py-4 border-b border-gray-700/30",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx("span",{className:"text-sm font-bold text-gray-500 uppercase tracking-wider",children:"Step 2"}),e.jsx("span",{className:"text-sm font-semibold text-gray-300",children:"추천 소재 선택"}),e.jsx("span",{className:"text-sm text-orange-400/80 font-medium",children:"본능 기제를 선택한 후, 아래 버튼으로 바이럴 소재를 추천받으세요"})]}),e.jsxs("div",{className:"space-y-3",children:[N.length>0&&e.jsx("button",{type:"button",onClick:dt,disabled:we||M,className:"w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white rounded-xl text-base font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2",children:we?e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"})," 소재 추천 중... ",Ge>0&&e.jsx("span",{className:"text-xs text-gray-400 tabular-nums",children:ge(Ge)})]}):e.jsxs(e.Fragment,{children:["🔍 본능 기제 ",N.length,"개로 바이럴 소재 추천받기"]})}),N.length===0&&e.jsxs("div",{className:"text-center py-4 px-4 bg-orange-900/15 border border-orange-500/30 rounded-lg",children:[e.jsx("p",{className:"text-sm text-orange-300 font-medium",children:"Step 1에서 본능 기제를 먼저 선택해주세요"}),e.jsx("p",{className:"text-xs text-orange-400/60 mt-1",children:"본능 기제를 선택하면 Google 검색 기반 바이럴 소재를 추천받을 수 있습니다"})]}),e.jsx(Vt,{onSelect:mt})]})]}),e.jsxs("div",{className:"px-6 py-4 border-b border-gray-700/30",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx("span",{className:"text-sm font-bold text-gray-500 uppercase tracking-wider",children:"Step 3"}),e.jsx("span",{className:"text-sm font-semibold text-gray-300",children:"대본 작성"})]}),le&&e.jsxs("div",{className:"bg-violet-900/20 border border-violet-500/30 rounded-lg px-4 py-3 mb-3",children:[e.jsxs("p",{className:"text-sm text-violet-300 font-bold",children:["선택된 소재: ",le.title]}),e.jsx("p",{className:"text-sm text-gray-400",children:le.synopsis})]}),x&&e.jsxs("div",{className:"mb-3",children:[e.jsxs("button",{type:"button",onClick:()=>lt(t=>!t),className:"flex items-center gap-2 px-3 py-2 bg-orange-900/15 border border-orange-500/30 rounded-lg text-sm transition-all hover:bg-orange-900/25 w-full text-left",children:[e.jsx("span",{className:"text-orange-400 font-bold",children:"📊 채널 스타일 적용됨"}),e.jsx("span",{className:"text-orange-300/70 font-medium truncate",children:x.channelName}),e.jsx("span",{className:"ml-auto text-gray-500 text-xs flex-shrink-0",children:Fe?"접기 ▲":"펼치기 ▼"})]}),Fe&&e.jsxs("div",{className:"mt-2 bg-gray-800/60 border border-orange-500/20 rounded-lg px-4 py-3 space-y-2 text-sm",children:[e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-gray-500 flex-shrink-0 w-16",children:"말투"}),e.jsx("span",{className:"text-gray-300",children:x.tone})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-gray-500 flex-shrink-0 w-16",children:"구조"}),e.jsx("span",{className:"text-gray-300",children:x.structure})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-gray-500 flex-shrink-0 w-16",children:"도입 패턴"}),e.jsx("span",{className:"text-gray-300",children:x.hookPattern})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-gray-500 flex-shrink-0 w-16",children:"마무리"}),e.jsx("span",{className:"text-gray-300",children:x.closingPattern})]}),x.keywords.length>0&&e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx("span",{className:"text-gray-500 flex-shrink-0 w-16",children:"키워드"}),e.jsx("div",{className:"flex flex-wrap gap-1",children:x.keywords.map(t=>e.jsx("span",{className:"px-2 py-0.5 bg-orange-900/30 text-orange-300 rounded text-xs",children:t},t))})]}),e.jsx("p",{className:"text-xs text-orange-400/60 pt-1 border-t border-gray-700/50",children:"AI 대본 생성 시 이 채널 스타일이 프롬프트에 자동 반영됩니다"})]})]}),e.jsxs("div",{className:"bg-gradient-to-r from-violet-900/20 to-pink-900/20 rounded-xl border border-violet-600/40 mb-3 overflow-hidden",children:[e.jsxs("div",{className:"p-4 pb-3",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx("span",{className:"text-lg",children:"🎨"}),e.jsx("span",{className:"text-sm font-bold text-white",children:"대본 스타일"}),e.jsx("span",{className:"text-sm text-violet-300/80 font-medium",children:"스타일을 선택 후 AI 생성 또는 기존 대본에 스타일 변환이 가능합니다"})]}),e.jsx("div",{className:"flex gap-2",children:ce.map(t=>{const a=K===t.id;return e.jsxs("button",{onClick:()=>at(a?null:t.id),disabled:!!ue,className:`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-lg border text-center transition-all ${a?"bg-violet-600/35 border-violet-400 text-white":"bg-gray-800/70 border-gray-600/50 text-gray-300 hover:border-violet-400/60 hover:text-white"} disabled:opacity-50`,children:[e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{children:t.icon}),e.jsx("span",{className:"text-sm font-bold truncate",children:t.name})]}),e.jsx("span",{className:"text-xs text-gray-500 leading-tight",children:t.description})]},t.id)})})]}),e.jsx("div",{className:"border-t border-violet-600/20"}),e.jsxs("div",{className:"px-4 py-3 flex items-center gap-4",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-base",children:"📝"}),e.jsx("span",{className:"text-sm font-semibold text-gray-300",children:"AI 대본 생성"}),e.jsx("span",{className:"text-sm text-green-300/80 font-medium",children:"글자수를 입력하고 우측 생성 버튼을 누르세요"}),K&&e.jsxs("span",{className:"text-xs px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-500/30",children:[ce.find(t=>t.id===K)?.icon," ",ce.find(t=>t.id===K)?.name]})]}),e.jsxs("div",{className:"flex items-center gap-2 ml-auto",children:[e.jsx("input",{type:"number",min:500,max:3e4,step:500,value:f,onChange:t=>q(Math.max(500,Number(t.target.value))),className:`w-[80px] px-2 py-1.5 rounded-md bg-gray-900/60 text-gray-200 text-sm text-center
                    border border-gray-700 focus:outline-none focus:border-blue-500/50`}),e.jsx("span",{className:"text-sm text-gray-500",children:"자"}),e.jsx("span",{className:"text-sm text-cyan-400 font-medium",children:je(f)}),e.jsx("button",{onClick:le?()=>xt(le):ht,disabled:le?M:!_.trim()||!se.trim()||M,className:`px-5 py-2 bg-gradient-to-r from-blue-600 to-violet-600
                    hover:from-blue-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed
                    text-white rounded-lg text-sm font-bold transition-all whitespace-nowrap
                    shadow-lg shadow-violet-900/30`,children:M?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"animate-spin inline-block",children:"⟳"})," 생성 중 ",_e>0&&e.jsx("span",{className:"text-xs text-gray-400 tabular-nums",children:ge(_e)})]}):"🚀 AI 대본 생성"})]}),xe&&e.jsx("p",{className:"text-sm text-red-400 ml-2",children:xe}),Oe&&e.jsx("p",{className:"text-sm text-red-400 ml-2",children:Oe})]}),K&&p.trim()&&!h&&e.jsxs("div",{className:"px-4 py-2.5 bg-violet-900/10 border-t border-violet-600/15 flex items-center justify-between",children:[e.jsxs("span",{className:"text-sm text-violet-300/80 font-medium",children:["입력된 대본에 ",e.jsxs("span",{className:"text-violet-200 font-bold",children:[ce.find(t=>t.id===K)?.icon," ",ce.find(t=>t.id===K)?.name]})," 스타일을 적용할 수 있습니다"]}),e.jsx("button",{onClick:gt,disabled:!!ue,className:`px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                    text-white rounded-lg text-sm font-bold transition-all whitespace-nowrap`,children:ue?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"animate-spin inline-block",children:"⟳"})," 변환 중 ",Ve>0&&e.jsx("span",{className:"text-xs text-gray-400 tabular-nums",children:ge(Ve)})]}):"🎨 스타일 변환"})]})]}),ve&&e.jsxs("div",{className:"bg-gray-900 border border-violet-500/30 rounded-xl p-4 mb-3",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx("div",{className:"w-3 h-3 bg-violet-500 rounded-full animate-pulse"}),e.jsx("span",{className:"text-sm text-violet-300 font-bold",children:"AI가 대본을 작성하고 있습니다..."}),e.jsxs("span",{className:"text-sm text-gray-500",children:[ve.length,"자"]})]}),e.jsxs("pre",{className:"text-base text-gray-200 whitespace-pre-wrap leading-relaxed font-sans",children:[ve,e.jsx("span",{className:"animate-pulse text-violet-400",children:"|"})]})]}),e.jsxs("div",{className:"space-y-3",children:[e.jsxs("div",{className:"relative",children:[e.jsxs("div",{className:"flex items-center justify-between mb-1.5",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm font-bold text-gray-400 uppercase tracking-wider",children:"✏️ 원본 대본"}),e.jsx("span",{className:"text-sm text-blue-300/80 font-medium",children:"직접 입력하거나 파일을 불러올 수 있습니다"}),h&&e.jsx("button",{type:"button",onClick:()=>{d(l?.content||S||"")},className:`text-sm px-2 py-0.5 rounded border transition-all ${i===(l?.content||S)?"bg-blue-600/20 border-blue-500/50 text-blue-300 font-bold":"bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300"}`,children:i===(l?.content||S)?"✓ 나레이션용 선택됨":"나레이션용으로 선택"})]}),e.jsx("button",{type:"button",onClick:()=>{navigator.clipboard.writeText(l?.content||S||"").then(()=>fe("대본이 클립보드에 복사되었습니다."))},className:"text-sm text-gray-500 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-700/50 px-2 py-1 rounded border border-gray-700/50 transition-colors",title:"원본 대본 복사",children:"📋 복사"})]}),e.jsx("textarea",{value:Be,onChange:t=>{const a=t.target.value;l?n({...l,content:a,charCount:a.length}):me(a),h||d(a)},placeholder:"대본을 직접 입력하거나, 위에서 AI 생성을 사용하세요.",rows:h?10:14,className:`w-full bg-gray-800/30 text-gray-200 p-4 text-base leading-relaxed rounded-xl
                  border border-gray-700/40 focus:outline-none focus:border-blue-500/30 resize-none placeholder-gray-600`})]}),e.jsxs("div",{className:"flex items-center justify-between mt-2",children:[p.length>0?e.jsxs("span",{className:"text-sm font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg",children:[p.length.toLocaleString(),"자 · ",je(p.length)]}):e.jsx("span",{}),e.jsxs("label",{className:`flex items-center gap-1.5 px-3 py-2
                ${ke?"bg-blue-600/20 text-blue-300 border-blue-500/40":"bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600"}
                rounded-lg text-sm cursor-pointer border font-medium transition-colors`,children:[ke?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"animate-spin",children:"⟳"})," 불러오는 중..."]}):e.jsxs(e.Fragment,{children:["📁 파일 불러오기 ",e.jsxs("span",{className:"text-gray-500",children:["(",It,")"]})]}),e.jsx("input",{type:"file",accept:At,onChange:ct,className:"hidden",disabled:ke})]})]}),h&&e.jsxs("div",{className:"relative",children:[e.jsxs("div",{className:"flex items-center justify-between mb-1.5",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs("span",{className:"text-sm font-bold text-violet-400 uppercase tracking-wider",children:["🎨 ",U," 스타일 적용"]}),e.jsx("button",{type:"button",onClick:()=>d(h),className:`text-sm px-2 py-0.5 rounded border transition-all ${i===h?"bg-violet-600/20 border-violet-500/50 text-violet-300 font-bold":"bg-gray-800/50 border-gray-700/50 text-gray-500 hover:text-gray-300"}`,children:i===h?"✓ 나레이션용 선택됨":"나레이션용으로 선택"})]}),e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsx("button",{type:"button",onClick:()=>{navigator.clipboard.writeText(h).then(()=>fe("스타일 적용본이 클립보드에 복사되었습니다."))},className:"text-sm text-gray-500 hover:text-gray-300 bg-gray-800/50 hover:bg-gray-700/50 px-2 py-1 rounded border border-gray-700/50 transition-colors",title:"스타일 적용본 복사",children:"📋 복사"}),e.jsx("button",{type:"button",onClick:()=>{R(),d(l?.content||S||"")},className:"text-sm text-gray-500 hover:text-red-400 bg-gray-800/50 hover:bg-red-900/20 px-2 py-1 rounded border border-gray-700/50 transition-colors",title:"스타일 적용본 삭제",children:"✕ 삭제"})]})]}),e.jsx("textarea",{value:h,onChange:t=>{const a=t.target.value;I(a,U),i===h&&d(a)},rows:10,className:`w-full bg-violet-900/10 text-gray-200 p-4 text-base leading-relaxed rounded-xl
                    border border-violet-700/30 focus:outline-none focus:border-violet-500/30 resize-none`}),e.jsx("div",{className:"absolute bottom-3 right-3",children:e.jsxs("span",{className:"text-sm text-violet-400/60 bg-gray-800/80 px-2 py-1 rounded backdrop-blur-sm",children:[h.length.toLocaleString(),"자 · ",je(h.length)]})})]})]}),Ke&&e.jsx("p",{className:"text-sm text-red-400 mt-1 px-1",children:Ke}),e.jsxs("div",{className:"mt-3",children:[e.jsxs("button",{onClick:()=>te(!s),className:`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all w-full justify-between ${s?"bg-green-600/15 border-green-500/40 text-green-300":"bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-500"}`,children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{children:"📐"}),e.jsx("span",{children:"대본 확장"}),e.jsx("span",{className:"text-sm text-gray-500 font-normal",children:"(현재 대본을 AI가 자연스럽게 늘려줍니다)"})]}),e.jsx("span",{className:"text-gray-600 text-sm",children:s?"▲":"▼"})]}),s&&e.jsx("div",{className:"mt-2 rounded-xl border border-green-700/30 bg-gray-800/20 p-5",children:e.jsx(o.Suspense,{fallback:e.jsx(st,{}),children:e.jsx(Jt,{})})})]})]}),e.jsxs("div",{className:"px-6 py-4 border-b border-gray-700/30",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx("span",{className:"text-sm font-bold text-gray-500 uppercase tracking-wider",children:"Step 4"}),e.jsx("span",{className:"text-sm font-semibold text-gray-300",children:"장면 분할"}),Je>0&&e.jsxs("span",{className:"text-sm font-bold text-blue-300 bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-700/40",children:["예상 약 ",Je,"컷"]}),e.jsx("span",{className:"text-xs text-gray-500",children:"장면 분석 실행 시 AI가 정확한 컷수를 산출합니다"})]}),e.jsxs("div",{className:"flex items-center gap-3 mb-2",children:[e.jsx("div",{className:"flex rounded-lg overflow-hidden border border-gray-600",children:Ut.map(t=>e.jsx("button",{onClick:()=>w(t.id),className:`px-3 py-1.5 text-sm font-bold transition-all ${m===t.id?`${t.color} text-white`:"bg-gray-800 text-gray-400 hover:bg-gray-700"}`,children:t.label},t.id))}),m===E.LONG&&e.jsx("div",{className:"flex bg-gray-800/60 p-0.5 rounded-lg border border-gray-600",children:["DEFAULT","DETAILED"].map(t=>e.jsx("button",{onClick:()=>L(t),className:`py-1 px-2.5 rounded-md text-sm font-bold transition-all ${j===t?t==="DEFAULT"?"bg-violet-600 text-white":"bg-indigo-600 text-white":"text-gray-400 hover:text-gray-200"}`,children:Ae[t].label},t))})]}),e.jsx("p",{className:"text-sm text-gray-400 mb-1",children:zt[m]}),m===E.LONG&&e.jsxs("p",{className:"text-sm text-violet-400/80 mb-1",children:[e.jsx("span",{className:"font-bold text-violet-300",children:Ae[j].label})," — ",Ae[j].desc]}),e.jsx("p",{className:"text-sm text-cyan-300/70 mt-1 mb-1 font-medium",children:"장면 분할은 영상 편집(이미지/영상 생성)을 위한 설정이며, 나레이션은 문장 단위(~다/~죠/~요)로 자연스럽게 읽힙니다."}),e.jsxs("button",{onClick:()=>X(!D),className:"mt-2 flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors",children:[e.jsx("span",{children:D?"▼":"▶"}),e.jsx("span",{className:"underline font-medium",children:ae.scenes.length>0?`단락 미리보기 (예상 ${ae.scenes.length}컷)`:"단락 미리보기"}),ae.scenes.length>0&&e.jsx("span",{className:"text-xs text-yellow-400/70",children:"예상치 — 아래 장면 분석에서 AI가 정확히 분할합니다"})]}),D&&e.jsx("div",{className:"mt-2",children:ae.scenes.length>0?e.jsxs("div",{className:"bg-gray-800/30 rounded-xl border border-blue-700/20 overflow-hidden",children:[e.jsxs("div",{className:"px-3 py-2 bg-blue-900/15 border-b border-blue-700/15",children:[e.jsxs("div",{className:"flex items-center justify-between mb-1.5",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm font-bold text-blue-300",children:"예상 분할 미리보기"}),e.jsx("span",{className:"text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-600/20 font-medium",children:"로컬 추정"})]}),e.jsx("span",{className:"text-xs text-yellow-300/70 font-medium",children:"장면 분석 실행 시 AI가 문맥을 이해하여 정확히 분할하며, 이후 수정도 가능합니다"})]}),e.jsxs("p",{className:"text-xs text-gray-400 leading-relaxed bg-gray-900/40 rounded px-2 py-1.5 border border-gray-700/20",children:[e.jsx("span",{className:"text-yellow-400/80 font-medium",children:"원문:"})," ",ae.original]})]}),e.jsx("div",{className:"max-h-[300px] overflow-auto",children:ae.scenes.map((t,a)=>e.jsxs("div",{className:`flex items-start gap-3 px-3 py-2 ${a%2===0?"bg-gray-800/10":"bg-gray-800/30"} border-b border-gray-700/15 last:border-b-0`,children:[e.jsx("span",{className:"flex-shrink-0 w-7 h-7 rounded-md bg-blue-900/30 border border-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-300",children:a+1}),e.jsx("p",{className:"text-sm text-gray-200 leading-relaxed pt-0.5",children:t}),e.jsxs("span",{className:"flex-shrink-0 text-xs text-gray-500 pt-1 whitespace-nowrap",children:[t.length,"자"]})]},a))})]}):e.jsx("div",{className:"bg-gray-800/30 rounded-lg border border-gray-700/20 p-4 text-center",children:e.jsx("p",{className:"text-sm text-gray-500",children:"대본을 입력하면 가장 긴 구간의 분할 미리보기가 표시됩니다"})})})]}),e.jsxs("div",{className:"px-6 py-5 space-y-3",children:[e.jsxs("button",{onClick:it,disabled:!Be||ee,className:`w-full relative overflow-hidden rounded-xl text-sm font-bold shadow-lg transition-all ${ee?"bg-gray-800 border border-gray-600 text-white":"bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-25 disabled:cursor-not-allowed text-white border border-violet-400/40 shadow-violet-900/30"}`,children:[ee&&e.jsx("div",{className:"absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 rounded-xl transition-all duration-300 ease-out",style:{width:`${ze}%`}}),e.jsx("div",{className:"relative py-3.5 flex items-center justify-center gap-2",children:ee?e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"}),e.jsxs("span",{children:["AI가 장면을 분석하고 있습니다... (",p.length.toLocaleString(),"자)"]}),e.jsxs("span",{className:"font-black text-lg text-white drop-shadow-md",children:[ze,"%"]}),He>0&&e.jsx("span",{className:"text-xs text-gray-400 tabular-nums",children:ge(He)})]}):e.jsx(e.Fragment,{children:"🎬 장면 분석 실행"})})]}),xe&&xe.includes("장면 분석")&&e.jsxs("div",{className:"bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3 animate-fade-in-up",children:[e.jsx("p",{className:"text-sm font-bold text-red-400",children:xe}),e.jsx("p",{className:"text-xs text-red-400/60 mt-1",children:"콘솔(F12)에서 상세 로그를 확인하세요"})]}),H.length>0&&e.jsxs("div",{className:"bg-gray-800/40 rounded-xl border border-amber-600/40 overflow-hidden animate-fade-in-up",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-3 bg-amber-900/25 border-b border-amber-700/30",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm font-bold text-amber-300",children:"장면 분석 결과"}),e.jsxs("span",{className:"text-sm px-2 py-0.5 rounded bg-amber-900/40 text-amber-200 border border-amber-500/40 font-bold",children:["총 ",H.length,"컷"]})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("button",{onClick:()=>{const t=H.map((a,c)=>`[${c+1}] ${a}`).join(`
`);navigator.clipboard.writeText(t),fe("장면 분석 결과가 클립보드에 복사되었습니다")},className:"text-sm text-gray-400 hover:text-amber-300 transition-colors p-1",title:"결과 복사",children:e.jsxs("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:[e.jsx("rect",{x:"9",y:"9",width:"13",height:"13",rx:"2",ry:"2",strokeWidth:"2"}),e.jsx("path",{d:"M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",strokeWidth:"2"})]})}),e.jsx("button",{onClick:()=>G([]),className:"text-sm text-gray-500 hover:text-gray-300 transition-colors",children:"✕"})]})]}),e.jsx("div",{className:"max-h-[400px] overflow-auto",children:H.map((t,a)=>e.jsxs("div",{className:`flex items-start gap-3 px-4 py-2.5 ${a%2===0?"bg-gray-800/20":"bg-amber-900/10"} border-b border-gray-700/20 last:border-b-0`,children:[e.jsx("span",{className:"flex-shrink-0 w-8 h-8 rounded-lg bg-amber-900/40 border border-amber-600/40 flex items-center justify-center text-sm font-bold text-amber-300",children:a+1}),e.jsx("p",{className:"text-sm text-gray-100 leading-relaxed pt-1",children:t})]},a))})]}),H.length>0&&e.jsxs("button",{onClick:ot,className:`w-full bg-gradient-to-r from-fuchsia-600 to-violet-600
                hover:from-fuchsia-500 hover:to-violet-500
                text-white rounded-xl text-sm font-bold border border-fuchsia-400/30 shadow-lg shadow-fuchsia-900/20
                py-3.5 flex items-center justify-center gap-2 transition-all animate-fade-in-up`,children:["🎙 사운드 스튜디오로 대본 보내기",e.jsx("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M13 7l5 5m0 0l-5 5m5-5H6"})})]}),!H.length&&!ee&&e.jsx("p",{className:"text-center text-sm text-gray-500 font-medium",children:"Gemini AI가 대본을 의미/호흡 단위로 지능적으로 분할합니다"})]})]})]})}const es=Object.freeze(Object.defineProperty({__proto__:null,default:Wt},Symbol.toStringTag,{value:"Module"}));export{es as S,J as u};

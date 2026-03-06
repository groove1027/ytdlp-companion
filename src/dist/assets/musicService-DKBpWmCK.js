import{l as m,n as A,s as I,ab as h,aa as y}from"./index-CvMJwAVF.js";const b="https://api.kie.ai/api/v1",k=[{id:"pop",label:"팝 (Pop)",subGenres:[{id:"synth-pop",label:"신스팝"},{id:"indie-pop",label:"인디팝"},{id:"k-pop",label:"K-Pop"},{id:"j-pop",label:"J-Pop"},{id:"dance-pop",label:"댄스팝"},{id:"dream-pop",label:"드림팝"},{id:"electro-pop",label:"일렉트로팝"}]},{id:"rock",label:"록 (Rock)",subGenres:[{id:"alt-rock",label:"얼터너티브"},{id:"indie-rock",label:"인디록"},{id:"classic-rock",label:"클래식 록"},{id:"post-rock",label:"포스트록"},{id:"punk-rock",label:"펑크록"},{id:"progressive",label:"프로그레시브"}]},{id:"electronic",label:"일렉트로닉 (Electronic)",subGenres:[{id:"house",label:"하우스"},{id:"techno",label:"테크노"},{id:"ambient",label:"앰비언트"},{id:"lo-fi",label:"로파이"},{id:"edm",label:"EDM"},{id:"chillwave",label:"칠웨이브"},{id:"drum-and-bass",label:"드럼앤베이스"},{id:"dubstep",label:"덥스텝"}]},{id:"hiphop",label:"힙합 (Hip-Hop)",subGenres:[{id:"boom-bap",label:"붐뱁"},{id:"trap",label:"트랩"},{id:"lo-fi-hiphop",label:"로파이 힙합"},{id:"k-hiphop",label:"한국 힙합"},{id:"old-school",label:"올드스쿨"}]},{id:"rnb",label:"R&B / 소울",subGenres:[{id:"neo-soul",label:"네오소울"},{id:"contemporary-rnb",label:"컨템포러리 R&B"},{id:"funk",label:"펑크"},{id:"gospel",label:"가스펠"}]},{id:"classical",label:"클래식 (Classical)",subGenres:[{id:"orchestral",label:"오케스트라"},{id:"piano-solo",label:"피아노 독주"},{id:"chamber",label:"실내악"},{id:"cinematic",label:"시네마틱"},{id:"minimalist",label:"미니멀리즘"}]},{id:"jazz",label:"재즈 (Jazz)",subGenres:[{id:"smooth-jazz",label:"스무스 재즈"},{id:"bebop",label:"비밥"},{id:"fusion",label:"퓨전"},{id:"bossa-nova",label:"보사노바"},{id:"swing",label:"스윙"}]},{id:"folk",label:"포크/어쿠스틱 (Folk)",subGenres:[{id:"acoustic",label:"어쿠스틱"},{id:"indie-folk",label:"인디포크"},{id:"country",label:"컨트리"},{id:"celtic",label:"켈틱"}]},{id:"world",label:"월드 (World)",subGenres:[{id:"latin",label:"라틴"},{id:"african",label:"아프리카"},{id:"middle-eastern",label:"중동"},{id:"asian-traditional",label:"동양 전통"},{id:"reggae",label:"레게"}]},{id:"bgm",label:"BGM / 배경음악",subGenres:[{id:"corporate",label:"기업/프레젠테이션"},{id:"vlog-bgm",label:"브이로그"},{id:"news-bgm",label:"뉴스/정보"},{id:"game-bgm",label:"게임"},{id:"horror-bgm",label:"공포/서스펜스"},{id:"romantic-bgm",label:"로맨틱"},{id:"epic-bgm",label:"에픽/트레일러"}]}],P=async e=>{const s=h();if(!s)throw new Error("Kie API 키가 설정되지 않았습니다. API 설정에서 Kie API 키를 입력해주세요.");const t=e.sunoModel||"V5",c=e.musicType==="instrumental";m.info("[Music] 음악 생성 요청",{model:t,genre:e.genre,musicType:e.musicType,bpm:e.bpm});const n=[];e.style?n.push(e.style):(e.genre&&n.push(e.genre),e.subGenre&&n.push(e.subGenre),n.push(`bpm ${e.bpm}`),e.customTags.length>0&&n.push(e.customTags.join(", ")));const a=n.join(", ").slice(0,t==="V4"?200:1e3),r={model:t,customMode:!0,instrumental:c,style:a,title:(e.title||"Untitled").slice(0,80),callBackUrl:"https://noop"};if(e.duration&&e.duration>0&&(r.duration=e.duration),!c&&e.prompt){const i=t==="V4"?3e3:5e3;r.prompt=e.prompt.slice(0,i)}else c&&(r.prompt=(e.prompt||"").slice(0,t==="V4"?3e3:5e3));if(e.vocalGender){const l={남성:"m",여성:"f",m:"m",f:"f"}[e.vocalGender];l&&(r.vocalGender=l)}e.negativeTags&&(r.negativeTags=e.negativeTags),typeof e.styleWeight=="number"&&(r.styleWeight=e.styleWeight),typeof e.weirdnessConstraint=="number"&&(r.weirdnessConstraint=e.weirdnessConstraint),typeof e.audioWeight=="number"&&(r.audioWeight=e.audioWeight);const d=await y(`${b}/generate`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`},body:JSON.stringify(r)});if(!d.ok){const i=await d.text();throw d.status===402?new Error("Kie 잔액 부족: 크레딧을 충전해주세요."):d.status===429?new Error("Kie 요청 제한 초과: 잠시 후 다시 시도해주세요."):d.status===422?new Error(`파라미터 오류: ${i}`):new Error(`음악 생성 요청 오류 (${d.status}): ${i}`)}const o=await d.json();if(o.code&&o.code!==200)throw new Error(`SUNO API 오류 (${o.code}): ${o.msg||"알 수 없는 오류"}`);const u=o.data?.taskId;if(!u)throw new Error("음악 생성 태스크 ID를 받지 못했습니다.");return m.success("[Music] 태스크 생성 완료",{taskId:u,model:t}),u},U=async(e,s,t)=>{const c=h();if(!c)throw new Error("Kie API 키가 설정되지 않았습니다.");m.info("[Music] 폴링 시작",{taskId:e});const n=120;let a=0;for(let r=0;r<n;r++){const d=r<10?3e3:5e3;await new Promise(l=>setTimeout(l,d)),a=Math.min(90,a+(90-a)*.05),t?.(Math.round(a));const o=await y(`${b}/generate/record-info?taskId=${e}`,{headers:{Authorization:`Bearer ${c}`}});if(!o.ok){if(o.status===429){await new Promise(l=>setTimeout(l,5e3));continue}throw new Error(`음악 폴링 오류 (${o.status})`)}const u=await o.json();if(u.code===422)continue;const i=u.data?.status;if((i==="FIRST_SUCCESS"||i==="TEXT_SUCCESS")&&(a=Math.max(a,70),t?.(Math.round(a))),i==="SUCCESS"||i==="FIRST_SUCCESS"){t?.(100);const l=u.data?.response?.sunoData,p=Array.isArray(l)&&l.length>0?l[0]:null;if(!p?.audioUrl)throw new Error("음악 결과에서 오디오 URL을 찾을 수 없습니다.");const f={id:e,audioId:p.id,title:p.title||`Generated Music ${new Date().toLocaleTimeString()}`,audioUrl:p.audioUrl,streamUrl:p.streamAudioUrl,imageUrl:p.imageUrl,duration:p.duration||0,createdAt:new Date().toISOString(),isFavorite:!1,tags:p.tags,lyrics:p.prompt};return m.success("[Music] 음악 생성 완료",{taskId:e,title:f.title,duration:f.duration}),f}if(i==="CREATE_TASK_FAILED"||i==="GENERATE_AUDIO_FAILED"||i==="CALLBACK_EXCEPTION"||i==="SENSITIVE_WORD_ERROR"){const l=u.data?.errorMessage||i;throw new Error(`음악 생성 실패: ${l}`)}}throw new Error(`음악 생성 시간 초과 (${n}회 폴링 실패)`)},v=e=>{if(e.length<=8e3)return e;const s=e.split(/\n+/).filter(u=>u.trim()),t=e.substring(0,2e3),c=e.substring(e.length-1500),n=Math.floor(s.length*.3),a=Math.floor(s.length*.7),r=s.slice(n,a),d=Math.max(1,Math.floor(r.length/5)),o=r.filter((u,i)=>i%d===0).join(`
`).substring(0,1500);return m.info("[Music] 대본 축약 적용",{original:e.length,head:t.length,middle:o.length,tail:c.length}),`${t}

[... 중간 핵심 장면 ...]

${o}

[... 후반부 ...]

${c}`},C=e=>{let s=e.trim();const t=s.match(/```(?:json)?\s*([\s\S]*?)```/);t&&(s=t[1].trim());const c=s.indexOf("{");c>=0&&(s=s.substring(c));try{const i=s.lastIndexOf("}");if(i>0)return JSON.parse(s.substring(0,i+1))}catch{}let n=s;const a=n.lastIndexOf('"'),r=n.substring(a+1).trim();a>0&&!r.startsWith(":")&&!r.startsWith(",")&&!r.startsWith("}")&&!r.startsWith("]")&&r.length<3&&(n=n.substring(0,a+1)),n=n.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/,""),n=n.replace(/,\s*$/,"");let d=0,o=0,u=!1;for(let i=0;i<n.length;i++){const l=n[i];if(l==='"'&&(i===0||n[i-1]!=="\\")){u=!u;continue}u||(l==="{"?d++:l==="}"?d--:l==="["?o++:l==="]"&&o--)}for(let i=0;i<o;i++)n+="]";for(let i=0;i<d;i++)n+="}";return m.info("[Music] 잘린 JSON 복구 시도",{originalLen:s.length,fixedLen:n.length}),JSON.parse(n)},E=(e,s)=>({conceptName:String(e.conceptName||`컨셉 ${s+1}`),direction:String(e.direction||""),genre:String(e.genre||"bgm"),subGenre:String(e.subGenre||""),mood:String(e.mood||"neutral"),bpm:typeof e.bpm=="number"?Math.max(40,Math.min(220,e.bpm)):120,keySignature:String(e.keySignature||""),tempo:String(e.tempo||""),energyLevel:String(e.energyLevel||"Medium Energy"),instrumentTags:Array.isArray(e.instrumentTags)?e.instrumentTags.slice(0,6):[],productionTags:Array.isArray(e.productionTags)?e.productionTags.slice(0,4):[],musicType:e.musicType==="vocal"?"vocal":"instrumental",vocalStyle:String(e.vocalStyle||"none"),sunoPrompt:String(e.sunoPrompt||""),sunoStyle:String(e.sunoStyle||"").slice(0,1e3),negativeTags:String(e.negativeTags||""),title:String(e.title||"").slice(0,80),referenceArtists:String(e.referenceArtists||""),reason:String(e.reason||"")}),R=async e=>{if(!e.trim())throw new Error("분석할 대본이 비어있습니다.");m.info("[Music] 2단계 심층 음악 분석 시작",{textLength:e.length});const s=v(e),c=`You are a world-class Music Supervisor who has scored 500+ films, documentaries, and viral YouTube videos.
You analyze scripts with the depth of a film studies professor and the ear of a Grammy-winning producer.
You MUST respond in pure JSON only. No markdown, no code blocks, no explanation outside JSON.

## YOUR ANALYSIS METHODOLOGY

### STEP 1: DEEP SCRIPT DECONSTRUCTION
Before choosing any music, you MUST identify:
- **Content Genre**: Is this a documentary, drama, comedy, horror, thriller, romance, educational explainer, vlog, news, essay film, historical piece, sci-fi, fantasy, true crime, sports, nature, cooking, travel, or something else?
- **Era & Setting**: When and where does this take place? 17th century England needs period instruments. 1980s Seoul needs synth-pop and city pop vibes. Ancient Rome needs epic brass and choir.
- **Cultural Layer**: Korean script → consider K-Drama OST, Korean indie, gugak fusion. Japanese → J-Pop, city pop, enka. Middle Eastern → oud, darbuka, maqam scales. European medieval → lute, hurdy-gurdy, Gregorian chant.
- **Narrative Arc & Pacing**: Map the emotional journey. Where are the turning points? What's the climax? Is it a slow burn or rapid fire?
- **Subtext & Irony**: Sometimes a cheerful script has dark undertones (needs minor key under major melody). Sometimes horror needs beauty (contrast scoring).
- **Target Audience & Platform**: YouTube essay → clean, non-distracting BGM. Cinematic short → full orchestral. Instagram reel → trendy, hook-heavy.

### STEP 2: EMOTION MAPPING (multi-layer)
- **Primary Emotion** (dominant): What emotion drives 60%+ of the script?
- **Secondary Emotion** (undertone): The hidden emotional layer beneath the surface
- **Emotion Transitions**: Exactly where and how emotions shift
- **Tension Curve**: Graph the tension level throughout (setup → rising → peak → resolution)

### STEP 3: MUSIC ARCHITECTURE
For each concept, design the complete musical blueprint:
- **BPM**: Not arbitrary. Match the script's breathing rhythm, sentence pace, and emotional weight.
  - Funeral/tragedy: 48-65 | Melancholy/reflection: 65-82 | Calm narration: 82-100
  - Upbeat info: 100-125 | Energetic/action: 125-155 | Frantic/chase: 155-200+
- **Key/Mode**: C major = innocent/bright. D minor = tragic/serious. E Phrygian = Spanish/exotic. A Mixolydian = folk/warm. B♭ minor = noir/mysterious.
- **Instruments**: Be HYPER-SPECIFIC. Not "piano" but "felt-dampened upright piano with subtle tape saturation". Not "strings" but "solo cello with wide vibrato, double-tracked and panned".
- **Production**: Describe the sonic space. "Large cathedral reverb" vs "tight, dry studio" vs "lo-fi with vinyl crackle and tape hiss".
- **Reference Artists/Works**: Name specific composers, artists, or soundtracks that match the vibe (Hans Zimmer's Interstellar, Yann Tiersen's Amélie, Ryuichi Sakamoto's Merry Christmas Mr. Lawrence, etc.)

### STEP 4: SUNO PROMPT ENGINEERING (CRITICAL)
You are an expert at writing Suno AI prompts. Rules:
1. First 20 words = most influential. Pack genre + mood + key instruments here.
2. Use specific adjectives: "warm reverb-drenched grand piano" not "gentle piano"
3. Include production details: mixing style, spatial characteristics, frequency emphasis
4. Mention reference styles: "in the style of Hans Zimmer" or "reminiscent of Studio Ghibli soundtracks"
5. Describe the emotional journey: "starts sparse and intimate, builds to a sweeping orchestral climax"
6. Include technical details: time signature (3/4 waltz, 6/8 compound), swing/straight feel, dynamics
7. Suno style field: comma-separated tags, most important first, max 200 chars

## GENRE IDS (use these exact IDs)
${k.map(a=>`${a.id}(${a.subGenres.map(r=>r.id).join("/")})`).join(", ")}`,n=`Analyze this script and create 3 completely different, production-ready music concepts.
Each concept must be a RADICALLY different musical approach — not just genre variations, but entirely different emotional interpretations.

SCRIPT:
---
${s}
---

Respond with this EXACT JSON structure:
{
  "scriptAnalysis": {
    "contentGenre": "script genre (documentary/drama/comedy/horror/etc.)",
    "era": "time period/setting of the content",
    "culture": "cultural context",
    "emotionPrimary": "dominant emotion (Korean)",
    "emotionSecondary": "hidden undertone emotion (Korean)",
    "emotionArc": "full emotional journey in Korean (예: 경이로운 도입 → 불안한 전개 → 비극적 반전 → 씁쓸한 여운)",
    "narrativeTone": "overall tone (Korean, 예: 진지하면서도 경외감이 서린 다큐멘터리 톤)",
    "pacing": "pacing description (Korean, 예: 느린 호흡의 서사적 전개, 중반부 긴장 가속)",
    "reasoning": "why you chose these 3 concepts — connect each one to specific elements in the script (Korean, 5-7 sentences, deeply specific to THIS script's content, characters, themes)"
  },
  "concepts": [
    {
      "conceptName": "컨셉 이름 (한국어, 예: 어둠 속의 서광)",
      "direction": "이 컨셉의 음악적 방향 한 줄 요약 (한국어)",
      "genre": "genre id from catalog",
      "subGenre": "sub-genre id from catalog",
      "mood": "3-5 mood keywords comma separated (English)",
      "bpm": number,
      "keySignature": "key (e.g. D minor, A♭ major, E Phrygian)",
      "tempo": "specific tempo description (English, e.g. slow brooding waltz in 3/4)",
      "energyLevel": "Low Energy/Relaxed/Chill/Steady/Medium Energy/Building/Driving/High Energy/Explosive",
      "instrumentTags": ["6 hyper-specific instruments (e.g. felt-dampened upright piano, bowed double bass with rosin texture)"],
      "productionTags": ["3-4 production tags (e.g. cathedral reverb, lo-fi tape saturation, wide stereo)"],
      "musicType": "instrumental or vocal",
      "vocalStyle": "specific vocal style or none",
      "sunoPrompt": "5-7 sentence Suno prompt in English. MUST be vivid, specific, and production-detailed. First sentence = most important keywords. Include BPM, key, instruments, production style, emotional arc, and reference.",
      "sunoStyle": "complete Suno style tags string, most important first, max 200 chars (e.g. cinematic orchestral, dark, D minor, bpm 72, cello, timpani, atmospheric reverb, film noir)",
      "negativeTags": "styles/instruments to EXCLUDE for this concept (comma separated)",
      "title": "creative track title reflecting the script's theme (English or Korean, max 80 chars)",
      "referenceArtists": "2-3 reference artists/soundtracks (e.g. Hans Zimmer (Interstellar), Yann Tiersen (Amélie))",
      "reason": "왜 이 컨셉이 이 대본에 맞는지 구체적 설명 (한국어, 3-4문장, 대본의 특정 장면/감정/맥락 언급 필수)"
    },
    { "conceptName": "...", "direction": "...", ... },
    { "conceptName": "...", "direction": "...", ... }
  ]
}

CRITICAL RULES:
- Concept 1 = BEST FIT (가장 대본에 맞는 정석적 선택)
- Concept 2 = CREATIVE ALTERNATIVE (예상치 못한 참신한 접근)
- Concept 3 = CONTRAST (정반대 감정 또는 장르로 의외의 효과를 노린 선택)
- Each sunoPrompt MUST be unique and production-quality
- Each sunoStyle MUST be a complete, ready-to-use Suno style string
- Track titles MUST be creative and specific to this script's content
- Reasons MUST reference specific parts of the script, not generic descriptions`;try{const r=(await A([{role:"system",content:c},{role:"user",content:n}],{temperature:.65,maxTokens:1e4})).choices?.[0]?.message?.content||"",d=C(r),o=d.scriptAnalysis||{},i=(Array.isArray(d.concepts)?d.concepts:[]).slice(0,3).map((g,T)=>E(g,T)),l=i[0]||E({},0),p=i.map(g=>({genre:g.genre,subGenre:g.subGenre,mood:g.mood,reason:g.reason,prompt:g.sunoPrompt,title:g.title})),f={scriptGenre:o.contentGenre||"",scriptEra:o.era||"",scriptCulture:o.culture||"",emotionPrimary:o.emotionPrimary||"",emotionSecondary:o.emotionSecondary||"",emotionArc:o.emotionArc||"",narrativeTone:o.narrativeTone||"",pacingDescription:o.pacing||"",genre:l.genre,subGenre:l.subGenre,mood:l.mood,bpm:l.bpm,tempo:l.tempo,vocalStyle:l.vocalStyle,instrumentTags:l.instrumentTags,musicType:l.musicType,prompt:l.sunoPrompt,promptSuggestion:i[1]?.sunoPrompt||"",title:l.title,reasoning:o.reasoning||l.reason,keySignature:l.keySignature,productionTags:l.productionTags,energyLevel:l.energyLevel,negativeTags:l.negativeTags,styleTagsFull:l.sunoStyle,concepts:i,genreSuggestions:p};return m.success("[Music] 2단계 심층 분석 완료",{scriptGenre:f.scriptGenre,concepts:i.length,bestGenre:l.genre,bestBpm:l.bpm}),f}catch(a){const r=a instanceof Error?a.message:String(a);return m.error("[Music] 대본 음악 분석 실패",r),I(`음악 분석 실패: ${r.substring(0,80)}`,5e3),{scriptGenre:"",scriptEra:"",scriptCulture:"",emotionPrimary:"",emotionSecondary:"",emotionArc:"",narrativeTone:"",pacingDescription:"",genre:"bgm",subGenre:"vlog-bgm",mood:"calm, neutral",bpm:120,tempo:"mid-tempo",vocalStyle:"none",instrumentTags:["piano","strings","soft pad"],musicType:"instrumental",prompt:"Calm instrumental background music, gentle piano with soft strings and ambient pads, 120 BPM, warm and pleasant",promptSuggestion:"",title:"Untitled BGM",reasoning:"분석 실패로 기본 BGM을 추천합니다.",keySignature:"",productionTags:[],energyLevel:"Steady",negativeTags:"",styleTagsFull:"",concepts:[],genreSuggestions:[]}}},S=async(e,s)=>{const t=await e.text();throw e.status===402?new Error("Kie 잔액 부족: 크레딧을 충전해주세요."):e.status===429?new Error("Kie 요청 제한 초과: 잠시 후 다시 시도해주세요."):e.status===422?new Error(`파라미터 오류: ${t}`):new Error(`${s} 오류 (${e.status}): ${t}`)},w=async(e,s,t)=>{const c=h();if(!c)throw new Error("Kie API 키가 설정되지 않았습니다.");const n=await y(`${b}${e}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${c}`},body:JSON.stringify(s)});n.ok||await S(n,t);const a=await n.json();if(a.code&&a.code!==200)throw new Error(`${t} 오류 (${a.code}): ${a.msg||"알 수 없는 오류"}`);const r=a.data?.taskId;if(!r)throw new Error(`${t}: 태스크 ID를 받지 못했습니다.`);return r},$=async e=>{const s=e.defaultParamFlag??!0,t={audioId:e.audioId,model:e.model,defaultParamFlag:s,callBackUrl:"https://noop"};return s&&(e.continueAt!=null&&(t.continueAt=e.continueAt),e.style&&(t.style=e.style),e.title&&(t.title=e.title),e.prompt&&(t.prompt=e.prompt)),m.info("[Music] 곡 연장 요청",{audioId:e.audioId,continueAt:e.continueAt}),w("/generate/extend",t,"곡 연장")},G=async e=>{if(!e.trim())throw new Error("가사 생성 프롬프트가 비어있습니다.");return m.info("[Music] AI 가사 생성 요청",{prompt:e.slice(0,50)}),w("/lyrics",{prompt:e.slice(0,200),callBackUrl:"https://noop"},"가사 생성")},L=async(e,s)=>{const t=h();if(!t)throw new Error("Kie API 키가 설정되지 않았습니다.");const c=60;for(let n=0;n<c;n++){await new Promise(o=>setTimeout(o,3e3));const a=await y(`${b}/lyrics/record-info?taskId=${e}`,{headers:{Authorization:`Bearer ${t}`}});if(!a.ok){if(a.status===429){await new Promise(o=>setTimeout(o,5e3));continue}throw new Error(`가사 폴링 오류 (${a.status})`)}const r=await a.json();if(r.code===422)continue;const d=r.data?.status;if(d==="SUCCESS"){const o=r.data?.response?.lyricsData;return(Array.isArray(o)?o:[]).filter(i=>i?.text).map(i=>({title:i.title||"",text:i.text}))}if(d==="CREATE_TASK_FAILED"||d==="GENERATE_LYRICS_FAILED"||d==="CALLBACK_EXCEPTION"||d==="SENSITIVE_WORD_ERROR")throw new Error(`가사 생성 실패: ${r.data?.errorMessage||d}`)}throw new Error("가사 생성 시간 초과")},N=async e=>(m.info("[Music] 보컬 분리 요청",{taskId:e.taskId,audioId:e.audioId}),w("/vocal-removal/generate",{taskId:e.taskId,audioId:e.audioId,type:e.type||"separate_vocal",callBackUrl:"https://noop"},"보컬 분리")),D=async(e,s)=>{const t=h();if(!t)throw new Error("Kie API 키가 설정되지 않았습니다.");const c=60;for(let n=0;n<c;n++){await new Promise(o=>setTimeout(o,3e3));const a=await y(`${b}/vocal-removal/record-info?taskId=${e}`,{headers:{Authorization:`Bearer ${t}`}});if(!a.ok){if(a.status===429){await new Promise(o=>setTimeout(o,5e3));continue}throw new Error(`보컬 분리 폴링 오류 (${a.status})`)}const r=await a.json();if(r.code===422)continue;const d=r.data?.successFlag;if(d==="SUCCESS"){const o=r.data?.response;return{vocalUrl:o?.vocalUrl||"",instrumentalUrl:o?.instrumentalUrl||""}}if(d==="CREATE_TASK_FAILED"||d==="GENERATE_AUDIO_FAILED"||d==="CALLBACK_EXCEPTION")throw new Error(`보컬 분리 실패: ${r.data?.errorMessage||d}`)}throw new Error("보컬 분리 시간 초과")},K=async(e,s)=>{const t=h();if(!t)throw new Error("Kie API 키가 설정되지 않았습니다.");const c=await y(`${b}/generate/get-timestamped-lyrics`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},body:JSON.stringify({taskId:e,audioId:s})});c.ok||await S(c,"싱크 가사 조회");const a=(await c.json()).data?.alignedWords;return Array.isArray(a)?a.map(r=>({word:r.word||"",startS:r.startS||0,endS:r.endS||0})):[]},O=async e=>{const s=h();if(!s)throw new Error("Kie API 키가 설정되지 않았습니다.");const t=await y(`${b}/style/generate`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`},body:JSON.stringify({content:e})});t.ok||await S(t,"스타일 부스트");const c=await t.json();return c.data?.style||c.data?.result||e},B=async e=>(m.info("[Music] 반주 추가 요청",{title:e.title}),w("/generate/add-instrumental",{uploadUrl:e.uploadUrl,title:e.title,tags:e.tags,negativeTags:e.negativeTags||"",model:e.model||"V4_5PLUS",callBackUrl:"https://noop"},"반주 추가")),x=async e=>(m.info("[Music] 보컬 추가 요청",{title:e.title}),w("/generate/add-vocals",{uploadUrl:e.uploadUrl,prompt:e.prompt,title:e.title,style:e.style,negativeTags:e.negativeTags||"",model:e.model||"V4_5PLUS",callBackUrl:"https://noop"},"보컬 추가")),j=e=>{const s=new Map;for(const t of e){const c=new Date(t.createdAt).toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"});s.has(c)||s.set(c,[]),s.get(c).push(t)}return Array.from(s.entries()).sort((t,c)=>{const n=new Date(t[1][0].createdAt).getTime();return new Date(c[1][0].createdAt).getTime()-n}).map(([t,c])=>({groupTitle:t,tracks:c.sort((n,a)=>new Date(a.createdAt).getTime()-new Date(n.createdAt).getTime())}))};export{R as a,O as b,j as c,G as d,L as e,D as f,P as g,B as h,x as i,$ as j,K as k,U as p,N as s};

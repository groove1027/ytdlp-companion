
import { AspectRatio, VoiceName, ImageModel, VideoFormat, VideoModel, DialogueTone, ScriptAiModel, ScriptTargetRegion } from "./types";

// [2026-03-02] Real-time Pricing (조사 기반 실시간 반영)
export const PRICING = {
  EXCHANGE_RATE: 1450, // Fallback Value (Used only if API fails)

  // Image Generation
  IMAGE_GENERATION: 0.0806,          // Evolink Nanobanana 2 - 2K ($0.0806/image, 5.8 credits)
  IMAGE_GENERATION_FALLBACK: 0.05,   // Kie Nanobanana 2 폴백 ($0.05/image)
  IMAGE_PREVIEW: 0.02,               // Fast Preview
  IMAGE_FLASH: 0.02,                 // Gemini 2.5 Flash ($0.02/image) — 비활성

  // Video Generation
  VIDEO_VEO: 0.1681,                 // Evolink Veo 3.1 Fast Lite 1080p ($0.1681/video, 12.1 credits)
  VIDEO_GROK_6S: 0.10,               // Kie Grok 720p 6s ($0.10/video, 20 credits)
  VIDEO_GROK_10S: 0.15,              // Kie Grok 720p 10s ($0.15/video, 30 credits)
  VIDEO_GROK_15S: 0.20,              // Kie Grok 720p 15s ($0.20/video)
  VIDEO_XAI_V2V_PER_SEC: 0.05,       // xAI Grok Video-to-Video ($0.05/sec)

  // Music Generation (Kie SUNO)
  MUSIC_SUNO_PER_TRACK: 0.06,        // Kie SUNO ($0.06/track, 12 credits)
  MUSIC_SUNO_EXTEND: 0.06,           // Kie SUNO Extend ($0.06/extend, 12 credits)

  // TTS (Kie ElevenLabs)
  TTS_ELEVENLABS_TURBO_PER_1K: 0.03, // Kie ElevenLabs Turbo 2.5 ($0.03/1K chars, 6 credits)
  TTS_ELEVENLABS_MULTI_PER_1K: 0.06, // Kie ElevenLabs Multilingual V2 ($0.06/1K chars, 12 credits)

  // Post-Processing
  WAVESPEED_PER_SEC: 0.01,           // WaveSpeed 워터마크/자막 제거 ($0.01/sec, 최소 $0.05)
  // REMOVE_BG_PER_IMAGE: 0.20,      // [DISABLED] Remove.bg 배경 제거

  // Analysis — Gemini 3 Flash via Evolink/Kie
  GEMINI_FLASH_INPUT_PER_1M: 0.50,   // Gemini 3 Flash Input ($0.50/1M tokens)
  GEMINI_FLASH_AUDIO_INPUT_PER_1M: 1.00,
  GEMINI_FLASH_OUTPUT_PER_1M: 3.00,  // Gemini 3 Flash Output ($3.00/1M tokens)

  // Analysis — Gemini 3.1 Pro via Evolink (20% off Google)
  GEMINI_PRO_INPUT_PER_1M: 1.60,     // Evolink Gemini 3.1 Pro Input ($1.60/1M tokens)
  GEMINI_PRO_OUTPUT_PER_1M: 9.60,    // Evolink Gemini 3.1 Pro Output ($9.60/1M tokens)

  // Claude via Evolink (Standard Tier, ≤200K context, 2026-03-14 기준)
  CLAUDE_SONNET_INPUT_PER_1M: 2.55,   // Claude Sonnet 4.6 Input ($2.55/1M tokens, -15%)
  CLAUDE_SONNET_OUTPUT_PER_1M: 12.75, // Claude Sonnet 4.6 Output ($12.75/1M tokens, -15%)
  CLAUDE_OPUS_INPUT_PER_1M: 4.13,     // Claude Opus 4.6 Input ($4.13/1M tokens, -17%)
  CLAUDE_OPUS_OUTPUT_PER_1M: 21.25,   // Claude Opus 4.6 Output ($21.25/1M tokens, -15%)

  // Initial Flat Fee (Fallback estimation if token data missing)
  ANALYSIS_INITIAL: 0.005,
  ANALYSIS_IMAGE: 0.005,

  // Typecast TTS ($15 / 200,000 credits = $0.000075/credit)
  TTS_TYPECAST_V30_PER_1K: 0.15,     // ssfm-v30: 2 credits/char × $0.000075/credit × 1000 chars = $0.15/1K chars
  TTS_TYPECAST_V21_PER_1K: 0.075,    // ssfm-v21: 1 credit/char × $0.000075/credit × 1000 chars = $0.075/1K chars

  // STT (Kie ElevenLabs Scribe v1)
  STT_SCRIBE_PER_CALL: 0.05,        // Kie ElevenLabs Speech-to-Text (~10 credits, $0.05/call)
};

/** 대본 작성 AI 모델 선택지 (Evolink Standard Tier, 2026-03-14 기준) */
export const SCRIPT_AI_MODELS = [
  {
    id: ScriptAiModel.GEMINI_PRO,
    label: 'Gemini 3.1 Pro',
    icon: '🌐',
    description: '웹 검색으로 최신 정보를 반영하는 빠른 대본 생성',
    detail: '실시간 뉴스·트렌드 검색 기반 | 속도 빠름 | 가성비 최고',
    color: 'emerald',
    hasWebSearch: true,
    inputPer1M: PRICING.GEMINI_PRO_INPUT_PER_1M,
    outputPer1M: PRICING.GEMINI_PRO_OUTPUT_PER_1M,
  },
  {
    id: ScriptAiModel.CLAUDE_SONNET,
    label: 'Claude Sonnet 4.6',
    icon: '🟣',
    description: '자연스러운 한국어와 높은 대본 퀄리티',
    detail: '문체·구어체 탁월 | 지시사항 100% 준수 | 밸런스형',
    color: 'violet',
    hasWebSearch: false,
    inputPer1M: PRICING.CLAUDE_SONNET_INPUT_PER_1M,
    outputPer1M: PRICING.CLAUDE_SONNET_OUTPUT_PER_1M,
  },
  {
    id: ScriptAiModel.CLAUDE_OPUS,
    label: 'Claude Opus 4.6',
    icon: '🔴',
    description: '최고 수준의 스토리텔링과 바이럴 구조',
    detail: '감정곡선·떡밥회수 탁월 | 깊이 있는 서사 | 프리미엄',
    color: 'amber',
    hasWebSearch: false,
    inputPer1M: PRICING.CLAUDE_OPUS_INPUT_PER_1M,
    outputPer1M: PRICING.CLAUDE_OPUS_OUTPUT_PER_1M,
  },
] as const;

/** 대본 타겟 지역 선택지 — 해외 타겟 시 해당 지역 언어·문화 반영 (#294) */
export const SCRIPT_TARGET_REGIONS: { id: ScriptTargetRegion; label: string; flag: string; lang: string; langLabel: string; searchLang: string }[] = [
  { id: 'ko',    label: '한국',            flag: '🇰🇷', lang: '한국어',       langLabel: 'Korean',       searchLang: 'ko' },
  { id: 'en-us', label: '북미',            flag: '🇺🇸', lang: '영어',         langLabel: 'English',      searchLang: 'en' },
  { id: 'en-uk', label: '영국',            flag: '🇬🇧', lang: '영어',         langLabel: 'English (UK)', searchLang: 'en' },
  { id: 'ja',    label: '일본',            flag: '🇯🇵', lang: '일본어',       langLabel: 'Japanese',     searchLang: 'ja' },
  { id: 'zh-cn', label: '중국',            flag: '🇨🇳', lang: '중국어(간체)',  langLabel: 'Chinese (Simplified)',  searchLang: 'zh' },
  { id: 'zh-tw', label: '대만',            flag: '🇹🇼', lang: '중국어(번체)',  langLabel: 'Chinese (Traditional)', searchLang: 'zh-TW' },
  { id: 'es',    label: '스페인/중남미',    flag: '🇪🇸', lang: '스페인어',     langLabel: 'Spanish',      searchLang: 'es' },
  { id: 'pt-br', label: '브라질',          flag: '🇧🇷', lang: '포르투갈어',   langLabel: 'Portuguese',   searchLang: 'pt' },
  { id: 'de',    label: '독일',            flag: '🇩🇪', lang: '독일어',       langLabel: 'German',       searchLang: 'de' },
  { id: 'fr',    label: '프랑스',          flag: '🇫🇷', lang: '프랑스어',     langLabel: 'French',       searchLang: 'fr' },
  { id: 'hi',    label: '인도',            flag: '🇮🇳', lang: '힌디어',       langLabel: 'Hindi',        searchLang: 'hi' },
  { id: 'ar',    label: '중동',            flag: '🇸🇦', lang: '아랍어',       langLabel: 'Arabic',       searchLang: 'ar' },
  { id: 'vi',    label: '베트남',          flag: '🇻🇳', lang: '베트남어',     langLabel: 'Vietnamese',   searchLang: 'vi' },
  { id: 'th',    label: '태국',            flag: '🇹🇭', lang: '태국어',       langLabel: 'Thai',         searchLang: 'th' },
  { id: 'id',    label: '인도네시아',      flag: '🇮🇩', lang: '인도네시아어', langLabel: 'Indonesian',   searchLang: 'id' },
];

export const IMAGE_MODELS = [
  { id: ImageModel.GOOGLE_IMAGEN, label: '🆓 Google Imagen 3.5 (무료 · 쿠키 필요 · 일 ~80장)' },
  { id: ImageModel.GOOGLE_WHISK, label: '🎨 Google Whisk (무료 · 쿠키 필요 · 레퍼런스 리믹싱)' },
  { id: ImageModel.NANO_COST, label: '⚡ NanoBanana 2 (₩87/장 · 최고 품질)' },
  // { id: ImageModel.FLASH, label: '🍌 Gemini 2.5 Flash ($0.02/장)' },
];

export const VIDEO_MODELS = [
  { id: VideoModel.VEO, label: '💎 Evolink Veo 3.1 1080p', description: '최저가 1080p ($0.17) - Fast Engine' },
  { id: VideoModel.GROK, label: '🚀 Grok (Kie)', description: '빠른 생성 ($0.10~0.20)' }
];

export const VIDEO_FORMATS = [
  { id: VideoFormat.LONG, label: '롱폼 (기본)', description: '의미 단위 흐름 (Semantic), 최대 2문장의 유동적 호흡' },
  { id: VideoFormat.SHORT, label: '숏폼 (빠름)', description: '빠른 템포 (Fast), 구/절 단위의 리듬감 있는 편집' },
  { id: VideoFormat.NANO, label: '나노 (도파민)', description: '초고속 도파민 (Hyper), 단어/비트 단위의 플래시 컷' },
];

export const RATIOS = [
  { id: AspectRatio.LANDSCAPE, label: '16:9 (가로형/유튜브)' },
  { id: AspectRatio.PORTRAIT, label: '9:16 (세로형/쇼츠)' },
  { id: AspectRatio.SQUARE, label: '1:1 (정사각형/인스타)' }
];

export const VOICES = [
  { id: VoiceName.KORE, label: 'Kore (여성, 차분함)' },
  { id: VoiceName.PUCK, label: 'Puck (남성, 장난스러움)' },
  { id: VoiceName.FENRIR, label: 'Fenrir (남성, 깊은 목소리)' },
  { id: VoiceName.CHARON, label: 'Charon (남성, 권위적)' },
  { id: VoiceName.ZEPHYR, label: 'Zephyr (여성, 부드러움)' },
];

export const VISUAL_STYLES = [
  {
    category: '영화 & 드라마 (Movie & Drama) [실사 / LIVE ACTION]',
    items: [
      { label: '🎬 시네마틱', prompt: 'Hyper realistic, 8k resolution, teal and orange color grading, epic scale, blockbuster movie tone, cinematic lighting, highly detailed', desc: '압도적인 스케일, 틸 & 오렌지 색감, 웅장한 배경, 블록버스터 영화 톤' },
      { label: '🔫 느와르/범죄 스릴러', prompt: 'Film noir style, high contrast, black and white, dramatic shadows, rough skin texture, cold blue tone, crime thriller vibe', desc: '높은 명암 대비, 어두운 그림자, 거친 피부 질감, 차가운 블루 톤' },
      { label: '⚔️ 사극/시대극', prompt: 'Historical drama style, Hanbok, armor details, palace or nature background, heavy and classic tone, 8k, masterpiece', desc: '한복/갑옷 디테일, 궁궐이나 자연 배경, 무게감 있고 고전적인 톤' },
      { label: '🎞️ 빈티지 필름', prompt: 'Vintage film style, A24 movie vibe, emotional film grain, noise, unique color grading, analog feel, retro aesthetic', desc: 'A24 영화 스타일, 감성적인 필름 그레인(노이즈), 독특한 색감' },
      { label: '📹 다큐멘터리', prompt: 'Documentary style, handheld camera shake effect, natural lighting, raw and unpolished realism, 4k, truth', desc: '핸드헬드(흔들림), 자연스러운 조명, 꾸밈없는 날것의 현장감' },
      { label: '🤠 서부극/웨스턴', prompt: 'Western movie style, sepia tone, wilderness, rough sandstorm, leather texture, sunset duel, cowboy vibe', desc: '세피아 톤, 황야, 거친 모래바람, 가죽 질감, 석양의 결투' },
      { label: '🕵️ 첩보/스파이', prompt: 'Spy movie style, 007 vibe, cold blue and grey suit, sophisticated European background, clean look, action', desc: '007 스타일, 차가운 블루 & 그레이 수트, 세련된 유럽 배경' },
      { label: '🏫 하이틴/청춘물', prompt: 'Netflix teen drama style, colorful outfits, energetic, popping colors, vibrant, high school vibe, lovely', desc: '넷플릭스 하이틴 스타일, 알록달록한 의상, 통통 튀는 에너지' },
      { label: '🎭 K-드라마', prompt: 'K-Drama style, bright and warm lighting, soft skin correction, romantic atmosphere, Seoul city background, 8k, beauty', desc: '화사하고 뽀얀 피부톤 보정, 밝고 따뜻한 조명, 설레는 분위기, 서울 도심 배경' },
      { label: '👽 SF 퓨처리스틱', prompt: 'Sci-fi futuristic style, cyberpunk neon, hologram, metallic texture, future city, spaceship, high tech', desc: '사이버펑크 네온, 홀로그램, 메탈릭 질감, 미래 도시, 우주선' },
      { label: '城堡 중세 판타지', prompt: 'Medieval fantasy, Game of Thrones style, candle light, stone texture, majestic castle, knight, epic', desc: '왕좌의 게임 스타일, 촛불 조명, 돌 질감, 웅장한 성과 기사' },
      { label: '👻 호러/공포', prompt: 'Horror movie style, low saturation, gloomy fog, green and blue eerie lighting, tension, scary, cinematic', desc: '낮은 채도, 음산한 안개, 녹색/청색의 기괴한 조명, 긴장감' },
      { label: '💥 전쟁/밀리터리', prompt: 'War movie style, dust, explosion effects, rough and desaturated, bleak battlefield atmosphere, saving private ryan style', desc: '흙먼지, 폭발 효과, 거칠고 채도가 낮은 삭막한 전장 분위기' },
      { label: '💃 뮤지컬/연극', prompt: 'Musical stage style, pin lighting, exaggerated stage makeup, dramatic contrast, stage set feel, spotlight', desc: '핀 조명, 과장된 무대 화장, 드라마틱한 명암, 무대 세트 느낌' },
      { label: '🧟 좀비/아포칼립스', prompt: 'Post-apocalypse style, ruined city, grey tone, dust and soot, desperate survival atmosphere, cinematic', desc: '폐허가 된 도시, 회색 톤, 먼지와 그을음, 생존의 절박함' },
      { label: '🎨 웨스 앤더슨', prompt: 'Wes Anderson style, symmetrical composition, pastel color palette, quirky set design, whimsical, centered framing, vintage aesthetic', desc: '완벽한 대칭 구도, 파스텔 색감, 기발한 세트 디자인, 동화적인 세계관' },
      { label: '🌃 왕가위', prompt: 'Wong Kar-wai style, neon-lit Hong Kong night, motion blur, melancholic mood, saturated red and green, grainy film, romantic loneliness', desc: '네온 불빛의 홍콩 밤거리, 모션 블러, 짙은 적색/녹색, 낭만적 고독' },
      { label: '🏔️ 북유럽 미니멀', prompt: 'Scandinavian minimalist film style, cold natural light, muted earth tones, vast empty landscapes, quiet contemplation, hygge atmosphere', desc: '차가운 자연광, 절제된 색감, 광활한 풍경, 고요한 사색의 분위기' },
      { label: '💃 볼리우드', prompt: 'Bollywood style, vibrant saturated colors, ornate costumes, dramatic expressions, grand dance scene, festive, celebratory, extravagant', desc: '화려한 원색, 장식적인 의상, 과장된 표정, 축제 같은 에너지' },
      { label: '🎞️ 누벨바그', prompt: 'French New Wave style, black and white with occasional color, jump cuts feel, existential mood, Parisian streets, Godard aesthetic', desc: '프랑스 누벨바그, 흑백과 간헐적 컬러, 실존적 분위기, 파리 거리' }
    ]
  },
  {
    category: 'CF & 커머셜 (Commercial & Ads) [실사 / LIVE ACTION]',
    items: [
      { label: '💧 K-광고', prompt: 'Korean beverage commercial style, blue sky, high saturation, clear and clean feeling, Korean city background, refreshing', desc: '이온음료 스타일, 파란 하늘, 높은 채도, 맑고 깨끗한 느낌, 한국 도시 배경' },
      { label: '👜 럭셔리 패션', prompt: 'Luxury fashion brand editorial, artistic pose, strong contrast, premium vibe, high fashion, vogue style', desc: '명품 브랜드 화보, 예술적이고 난해한 포즈, 강렬한 대비, 고급미' },
      { label: '🍗 푸드 씨즐', prompt: 'Food porn style, steaming hot, water droplets, glossy, high resolution food photography, delicious, macro shot', desc: '김이 모락모락, 튀는 물방울, 윤기 흐르는 고해상도 음식 연출' },
      { label: '🏠 라이프스타일', prompt: 'Lifestyle vlog style, IKEA concept, natural sunlight in living room, cozy and comfortable atmosphere, interior design', desc: '오늘의집/이케아 감성, 자연광이 드는 거실, 편안한 일상 브이로그' },
      { label: '🧸 키즈/장난감', prompt: 'Kids toy commercial, vivid primary colors, soft lighting, energetic and playful atmosphere, cute', desc: '알록달록한 원색(Primary colors), 부드러운 조명, 활기찬 분위기' },
      { label: '🌿 에코/친환경', prompt: 'Eco-friendly brand style, beige and green tones, linen texture, warm natural sunlight, organic, nature', desc: '자연주의 브랜드, 베이지 & 그린 톤, 린넨 소재, 따뜻한 자연광' },
      { label: '💄 뷰티/코스메틱', prompt: 'Cosmetic commercial, ultra high resolution skin texture, glow, soft studio lighting, beauty portrait, flawless', desc: '초고화질 피부 표현, 물광/윤광 텍스처, 부드러운 스튜디오 조명' },
      { label: '💻 테크 미니멀리즘', prompt: 'Tech minimalism, Apple style, white or black background, product focus, extremely refined, clean, sleek', desc: '애플 스타일, 화이트/블랙 배경, 제품 중심, 극도로 정제된 세련미' },
      { label: '🏃 스포츠/다이내믹', prompt: 'Sports commercial, Nike style, sweat droplets, dynamic muscles, high contrast, motion blur, energetic, action', desc: '나이키 스타일, 땀방울, 역동적인 근육, 강한 콘트라스트, 모션 블러' },
      { label: '💼 기업/비즈니스', prompt: 'Corporate business style, trustworthy blue tone, suit professional, bright and clean office, success', desc: '신뢰감 주는 블루 톤, 정장 입은 전문가, 밝고 깨끗한 사무실' },
      { label: '🏥 메디컬/헬스케어', prompt: 'Medical commercial, university hospital, clean white and sky blue, professional trust, sterile environment, health', desc: '대학병원/제약 광고, 깨끗한 화이트 & 스카이블루, 전문적인 신뢰감' },
      { label: '🎉 페스티벌/이벤트', prompt: 'Festival event style, fireworks in night sky, cheering crowd, dynamic laser lights, exciting, concert', desc: '축제 현장, 밤하늘의 폭죽, 군중의 환호, 역동적인 레이저 조명' },
      { label: '✈️ 여행/관광', prompt: 'Travel tourism commercial, golden hour landscape, wanderlust vibe, drone aerial view, adventure, bucket list destination, vivid', desc: '골든아워 풍경, 드론 항공샷, 여행 욕구를 자극하는 모험 감성' },
      { label: '🚗 자동차 광고', prompt: 'Car commercial style, sleek vehicle on wet road, dramatic reflections, dynamic motion, studio lighting, luxury automotive, speed', desc: '젖은 도로 위 차량, 극적인 반사, 역동적 모션, 프리미엄 자동차 광고' },
      { label: '🥃 향수/주류', prompt: 'Perfume liquor advertisement, dark moody lighting, golden liquid splash, elegant glass bottle, sensual luxury, mysterious, premium', desc: '어두운 무드 조명, 황금빛 액체, 우아한 유리병, 관능적 럭셔리' },
      { label: '🏡 부동산/인테리어', prompt: 'Real estate interior design, bright airy space, floor-to-ceiling windows, modern furniture, architectural photography, clean luxury living', desc: '밝고 개방적 공간, 바닥~천장 창문, 모던 가구, 건축 사진 스타일' }
    ]
  },
  {
    category: '애니메이션 & 3D (Animation & 3D)',
    items: [
      { label: '🧸 디즈니/픽사 3D', prompt: 'Disney Pixar 3D style, adorable character proportions, warm lighting, soft texture, 8k render, animation', desc: '사랑스러운 캐릭터 비율, 따뜻한 조명, 말랑말랑한 질감' },
      { label: '📺 90s 레트로 애니', prompt: '90s anime style, cel shading, 4:3 aspect ratio vibe, slight noise, Sailor Moon style, retro aesthetic, vhs glitch', desc: '셀화(Cel) 질감, 4:3 비율 느낌, 약간의 노이즈 (세일러문/카우보이비밥)' },
      { label: '🏙️ 신카이 마코토', prompt: 'Makoto Shinkai style, lens flare, hyper-realistic high quality background, vibrant blue sky, emotional anime', desc: '빛의 산란(Lens flare), 극사실적인 고퀄리티 배경 작화' },
      { label: '🧱 클레이/스톱모션', prompt: 'Claymation style, stop motion, fingerprint textures on clay, jerky movement, cute, Aardman style, handmade', desc: '지문이 보이는 점토 질감, 뚝뚝 끊기는 움직임, 아기자기함' },
      { label: '💀 팀 버튼', prompt: 'Tim Burton style, grotesque but cute, skinny limbs, dark and dreamy atmosphere, gothic, stop motion', desc: '기괴하지만 귀여운, 마른 팔다리, 어둡고 몽환적인 분위기' },
      { label: '🧊 글래스모피즘', prompt: 'Glassmorphism 3D, translucent glass material, light refraction, stylish 3D icon look, clean, modern', desc: '반투명한 유리 재질, 빛의 굴절, 세련된 3D 아이콘 느낌' },
      { label: '🧶 니트/털실 공예', prompt: 'Knitted wool texture, soft plush toy feel, crochet texture, cozy, handmade vibe, cute', desc: '포근한 털실 질감이 살아있는 인형 느낌' },
      { label: '🌿 지브리', prompt: 'Studio Ghibli style, watercolor background, lush green nature, healing fluffy clouds, hand drawn, Miyazaki vibe', desc: '수채화풍 배경, 초록빛 자연, 힐링되는 몽글몽글한 구름' },
      { label: '⚔️ 현대 액션 애니', prompt: 'Modern action anime, Demon Slayer style, sharp lines, flashy effects, dynamic composition, high contrast', desc: '귀멸의 칼날/주술회전 스타일, 날카로운 선, 화려한 이펙트' },
      { label: '🎨 아케인', prompt: 'Arcane style, oil painting brush texture on 3D, rough and trendy style, artistic, league of legends vibe', desc: '유화 붓터치 텍스처가 살아있는 거칠고 트렌디한 3D 스타일' },
      { label: '🎮 로우 폴리', prompt: 'Low poly art, visible angular polygons, simple and cute game graphics, retro 3D, minimalist', desc: '각진 폴리곤이 보이는 심플하고 귀여운 게임 그래픽' },
      { label: '✂️ 페이퍼 아트', prompt: 'Paper cut art, layered paper texture, shadow effects, fairytale depth, craft style, diorama', desc: '여러 겹의 종이를 오려 붙인 듯한 그림자 효과, 동화적인 깊이감' },
      { label: '🧱 복셀 아트', prompt: 'Voxel art, Minecraft style, world made of square cubes, 8-bit 3D, isometric', desc: '마인크래프트 스타일, 네모난 큐브로 쌓아 올린 세상' },
      { label: '🕷️ 스파이더버스', prompt: 'Spider-Verse style, mixed media animation, halftone dots, comic book panels, glitch effects, bold graphic pop, vibrant', desc: '혼합 미디어 애니메이션, 망점 효과, 코믹북 패널, 글리치 효과' },
      { label: '🌆 에지러너스', prompt: 'Cyberpunk Edgerunners style, neon-soaked anime, aggressive linework, high contrast, chrome and neon, fast-paced action, futuristic', desc: '네온에 젖은 애니메이션, 공격적인 선, 크롬 & 네온, 미래 도시 액션' },
      { label: '🐉 중국 3D 애니', prompt: 'Chinese 3D animation style, donghua, ethereal xianxia aesthetic, flowing robes, qi energy effects, mystical mountains, epic fantasy', desc: '동화(중국 애니), 선협 미학, 나부끼는 도복, 기(氣) 이펙트, 신비로운 산' },
      { label: '🔬 미니어처/틸트시프트', prompt: 'Miniature tilt-shift effect, tiny world diorama, selective focus blur, toy-like scene, vivid saturated colors, cute small scale', desc: '미니어처 디오라마, 선택적 포커스 블러, 장난감 같은 세상, 작고 귀여운 스케일' },
      { label: '⚔️ 이세카이 판타지', prompt: 'Isekai fantasy anime, vibrant magical world, RPG game UI overlay, adventurer party, glowing magic circles, colorful fantasy landscape', desc: '이세카이 판타지 세계, RPG 게임 느낌, 마법진, 모험가 파티, 화려한 풍경' }
    ]
  },
  {
    category: '웹툰 & 코믹 (Webtoon & Comic)',
    items: [
      { label: '📱 K-웹툰', prompt: 'Korean webtoon style, clean digital coloring, trendy fashion, sophisticated lines, manhwa, solo leveling style', desc: '깔끔한 디지털 채색, 트렌디한 패션, 세련된 한국 웹툰 스타일' },
      { label: '🇺🇸 미국 코믹스', prompt: 'American comic book style, Marvel/DC vibe, thick ink lines, exaggerated muscles, dynamic angles, bold colors', desc: '마블/DC, 굵은 펜 터치, 과장된 근육, 역동적인 앵글' },
      { label: '✒️ 흑백 출판 만화', prompt: 'Black and white manga, screentones, pen pressure details, speed lines, Slam Dunk style, high contrast', desc: '스크린톤, 펜 촉의 강약, 집중선 효과 (슬램덩크/베르세르크)' },
      { label: '🐸 4컷 인스타툰', prompt: '4-cut instatoon style, simple round lines, cute SD characters, daily life comic vibe, relatable', desc: '단순하고 둥글둥글한 선, 귀여운 SD 캐릭터, 일상 공감툰' },
      { label: '🖋️ 감성 에세이 툰', prompt: 'Emotional essay toon, fragile lines, pastel coloring, book illustration feel, soft, healing', desc: '여리여리한 선, 파스텔 톤 채색, 서적 삽화 느낌' },
      { label: '👸 로판', prompt: 'Romantic fantasy manhwa, fancy dresses, sparkling jewel eyes, roses and lace details, shoujo, royalty', desc: '화려한 드레스, 반짝이는 보석 눈동자, 장미와 레이스 장식' },
      { label: '🎞️ 그래픽 노블', prompt: 'Graphic novel style, Sin City vibe, high contrast black and white with red point color, noir comic', desc: '씬 시티 스타일, 흑백 대비에 빨간색 등 포인트 컬러만 사용' },
      { label: '🗯️ 팝아트', prompt: 'Pop art style, Roy Lichtenstein, halftone dots, speech bubbles, vivid primary colors, comic art', desc: '리히텐슈타인, 굵은 망점(Halftone) 패턴, 말풍선, 원색 대비' },
      { label: '🖍️ 고전 명랑 만화', prompt: 'Classic Korean comic style, Dooly, thick simple lines, rough coloring, retro cartoon, funny', desc: '둘리/검정고무신 스타일, 굵고 단순한 선, 투박한 채색' },
      { label: '🧟 호러/이토 준지', prompt: 'Ito Junji style, grotesque line touch, spiral patterns, creepy black and white horror, scary', desc: '기괴한 선 터치, 소용돌이 패턴, 흑백의 섬뜩한 공포 만화' },
      { label: '🧒 치비/SD', prompt: 'Chibi super deformed style, big head small body, 2-3 head proportions, cute exaggerated expressions, kawaii, adorable', desc: '큰 머리 작은 몸, 2~3등신, 귀여운 과장된 표정, 카와이' },
      { label: '🌸 소녀만화', prompt: 'Shoujo manga style, sparkling eyes, flower backgrounds, soft pastel tones, romantic atmosphere, bishoujo, delicate linework', desc: '반짝이는 눈동자, 꽃 배경, 부드러운 파스텔 톤, 로맨틱 분위기' },
      { label: '💕 BL 만화', prompt: 'BL manga style, beautiful androgynous characters, dramatic emotional scenes, soft lighting, elegant composition, yaoi aesthetic', desc: '미형 캐릭터, 극적인 감정 장면, 부드러운 조명, 우아한 구도' },
      { label: '⚔️ 무협 만화', prompt: 'Wuxia comic style, dynamic martial arts action, ink splash effects, flowing robes and hair, Chinese calligraphy, mountain scenery', desc: '역동적 무술 액션, 먹물 튀김 효과, 나부끼는 도복과 머리카락, 산수 배경' }
    ]
  },
  {
    category: '스케치 & 스토리보드 (Sketch & Draft)',
    items: [
      { label: '📝 러프 펜슬 스케치', prompt: 'Rough pencil sketch, graphite texture, loose lines, initial idea storyboard style, messy but artistic', desc: '연필로 쓱쓱 그린 듯한 날림 선, 초기 아이디어 콘티' },
      { label: '🖍️ 마커 렌더링', prompt: 'Industrial design marker rendering, shading and point colors, product sketch style, copic marker', desc: '산업 디자인 스케치, 명암과 포인트 컬러가 들어간 스타일' },
      { label: '👥 실루엣', prompt: 'Silhouette art, strong backlight, character pose in black, dramatic contrast, mysterious', desc: '역광을 이용해 인물의 동작(Pose)만 검게 표현' },
      { label: '🌑 목탄/차콜', prompt: 'Charcoal drawing, focus on light and shadow mass rather than line details, artistic, smudge', desc: '선의 디테일보다는 빛이 어둠의 덩어리감(Mass) 위주' },
      { label: '📜 고지도/양피지', prompt: 'Old map style, parchment paper texture, ink pen drawing, treasure map, fantasy map, vintage', desc: '낡은 종이 질감, 잉크 펜으로 그린 보물지도/판타지 지도' },
      { label: '✒️ 잉크 펜화', prompt: 'Ink pen drawing, architectural sketch style, clean and continuous black lines, hatching', desc: '건축 드로잉처럼 깔끔하고 끊김 없는 검은 선' },
      { label: '📐 블루프린트', prompt: 'Blueprint style, white lines on blue background, architectural or mechanical structure, diagram', desc: '파란 배경에 흰 선, 건축물이나 기계 장치 구조도' },
      { label: '🔲 스토리보드 썸네일', prompt: 'Storyboard thumbnail style, rough composition in boxes, scene flow visualization, cinematic plan', desc: '작은 박스 안에 연속된 장면 흐름을 보여주는 구성' },
      { label: '🏫 칠판/초크 아트', prompt: 'Chalk art on blackboard, chalk texture, educational and analog feel, rough, dusty', desc: '칠판 배경에 분필로 그린 듯한 교육적이고 아날로그적인 느낌' },
      { label: '👔 패션 크로키', prompt: 'Fashion croquis, exaggerated body proportions, focus on outfit texture, stylish line drawing, runway', desc: '인체 비율이 과장된 모델 라인, 의상 소재 중심의 드로잉' }
    ]
  },
  {
    category: '아트 & 컨셉 (Art & Concept)',
    items: [
      { label: '🖌️ 유화/임파스토', prompt: 'Impasto oil painting, thick paint texture, Van Gogh style, vivid colors, artistic, masterpiece', desc: '반 고흐처럼 물감을 두껍게 덧칠한 질감이 느껴지는 스타일' },
      { label: '⛰️ 동양 수묵화', prompt: 'Oriental ink wash painting, sumi-e, brush strokes, Korean landscape painting vibe, void space, artistic', desc: '먹의 농담, 붓의 필력, 한국/동양적인 산수화 느낌' },
      { label: '✂️ 콜라주 아트', prompt: 'Collage art, cut-out magazine style, kitsch and hip, mixed media vibe, abstract', desc: '잡지를 오려 붙인 듯한 키치하고 힙한 컷 아웃 스타일' },
      { label: '👾 픽셀 아트', prompt: 'Pixel art, retro game aesthetic, dot graphics, 8-bit style, arcade, colorful', desc: '레트로 게임 감성, 도트 그래픽' },
      { label: '💥 그래피티', prompt: 'Graffiti art, spray paint texture, street wall background, hiphop vibe, bold typography, street art', desc: '벽에 스프레이로 그린 듯한 힙합 감성, 강렬한 타이포' },
      { label: '🔺 지오메트릭', prompt: 'Geometric art, modern art pattern, repetition and arrangement of shapes, abstract, colorful', desc: '도형의 반복과 배치를 통한 모던 아트 패턴' },
      { label: '📼 80s 신스웨이브', prompt: '80s synthwave, purple sunset, palm trees, VHS noise, disco aesthetic, retro futuristic, neon', desc: '보라색 석양, 야자수, 비디오(VHS) 노이즈, 디스코 감성' },
      { label: '🎩 1920s 아르데코', prompt: '1920s Art Deco, golden geometric patterns, Great Gatsby vibe, luxury, ornamental, elegant', desc: '황금색 기하학 패턴, 재즈 시대의 화려함, 럭셔리함' },
      { label: '💧 수채화', prompt: 'Watercolor painting, wet-on-wet effect, negative space, soft and lyrical atmosphere, artistic', desc: '물이 번지는 효과, 여백의 미, 부드럽고 서정적인 느낌' },
      { label: '🎮 게임 컨셉 아트', prompt: 'Game concept art, matte painting, dense coloring, majestic fantasy/SF background, epic, high detail', desc: '매트 페인팅, 밀도 높은 채색, 웅장한 판타지/SF 배경' },
      { label: '🌌 초현실주의', prompt: 'Surrealism, Dali/Magritte style, strange object arrangement, dreamlike scene, bizarre, artistic', desc: '달리/마그리트, 현실에 없는 기묘한 사물 배치와 꿈같은 장면' },
      { label: '💎 스테인드글라스', prompt: 'Stained glass art, colorful glass shards, lead lines, church light, translucent, holy', desc: '성당 유리창처럼 빛이 투과되는 화려한 조각 그림' },
      { label: '🌃 네온 사인 아트', prompt: 'Neon sign art, shapes made only of glowing neon tubes, dark background, light painting, vibrant', desc: '어두운 배경에 오직 빛나는 네온관으로만 이루어진 형상' },
      { label: '🌊 우키요에', prompt: 'Ukiyo-e style, Japanese woodblock print, wave patterns, unique perspective, traditional texture', desc: '파도 문양, 독특한 원근법, 목판화 질감' },
      { label: '⚙️ 스팀펑크', prompt: 'Steampunk style, 19th century industrial revolution, brass gears, goggles, steam engine, SF, mechanical', desc: '19세기 산업혁명 + SF, 황동 태엽, 고글, 증기 기관' },
      { label: '🌺 아르누보', prompt: 'Art Nouveau style, Alphonse Mucha, flowing organic lines, floral ornamental borders, elegant feminine figures, decorative, vintage poster', desc: '알폰스 무하 스타일, 유기적 곡선, 꽃 장식 테두리, 우아한 빈티지 포스터' },
      { label: '🔵 점묘법', prompt: 'Pointillism style, Georges Seurat, tiny dots of pure color, impressionist landscape, vibrant optical mixing, scientific art', desc: '쇠라 스타일, 순색의 작은 점, 인상주의 풍경, 광학적 색채 혼합' },
      { label: '🔶 바우하우스', prompt: 'Bauhaus design style, primary colors, geometric shapes, clean typography, modernist composition, functional art, minimalist graphic', desc: '1차색, 기하학적 도형, 깔끔한 타이포, 모더니즘 구성, 기능적 예술' },
      { label: '🌿 보태니컬 일러스트', prompt: 'Botanical illustration, scientific accuracy, delicate watercolor plants, vintage herbarium style, detailed leaves and flowers, natural history art', desc: '과학적 정확도, 섬세한 수채화 식물, 빈티지 식물 표본 스타일' },
      { label: '🏛️ 고대 벽화', prompt: 'Ancient mural style, Egyptian hieroglyphics meets Aztec patterns, flat perspective, gold and turquoise, ceremonial, mythological scenes', desc: '이집트 상형문자와 아즈텍 패턴, 평면적 원근법, 금색과 터콰이즈, 신화적 장면' },
      { label: '🌈 사이키델릭', prompt: 'Psychedelic art, trippy swirling patterns, rainbow gradient colors, 1960s counterculture, kaleidoscope effect, mind-bending visuals, groovy', desc: '몽환적 소용돌이 패턴, 무지개 그라데이션, 1960년대 반문화, 만화경 효과' },
      { label: '🖌️ MS 페인트', prompt: 'A crude, MS Paint-style digital illustration characterized by jagged, pixelated black outlines and flat, solid colors without any shading or texture. The drawing has a simplistic, meme-like aesthetic', desc: '조잡한 MS 페인트 스타일, 들쭉날쭉한 픽셀 윤곽선, 평면 단색, 밈 감성' },
      { label: '🌍 컨트리볼', prompt: 'Countryball Polandball meme art style, all characters are perfectly spherical round balls with national flag patterns painted on sphere surface, simple dot eyes (white circles with black outlines), NO arms NO legs NO limbs NO hands NO feet, crude hand-drawn thick black outlines, simple flat comic look, minimalist background, cute ball characters, political satire webcomic aesthetic, each country represented as a flag-painted sphere', desc: '컨트리볼/폴란드볼 밈, 국기 공 캐릭터, 사지 없음, 대본 맥락에서 국가 자동 인식' }
    ]
  },
  {
    category: '포토그래피 (Photography) [실사 / LIVE ACTION]',
    items: [
      { label: '🚁 드론 에어리얼', prompt: 'Drone aerial photography, birds eye view, stunning landscape from above, geometric patterns in nature, golden hour, cinematic wide angle', desc: '새의 눈 시점, 위에서 본 풍경, 자연의 기하학적 패턴, 골든아워 항공샷' },
      { label: '📸 스트리트 스냅', prompt: 'Street photography, candid urban moments, decisive moment, high contrast black and white, raw city life, documentary, Henri Cartier-Bresson', desc: '솔직한 도시의 순간, 결정적 순간, 흑백 하이 콘트라스트, 날것의 도시 생활' },
      { label: '👗 패션 에디토리얼', prompt: 'Fashion editorial photography, high-end studio lighting, avant-garde styling, bold poses, Vogue magazine cover, dramatic fashion portrait', desc: '하이엔드 스튜디오 조명, 아방가르드 스타일링, 과감한 포즈, 보그 표지' },
      { label: '🔬 매크로 포토', prompt: 'Macro photography, extreme close-up, shallow depth of field, water droplets on petals, insect details, bokeh background, ultra sharp', desc: '극한 클로즈업, 얕은 피사계 심도, 꽃잎 위 물방울, 보케 배경' },
      { label: '🌊 장노출', prompt: 'Long exposure photography, silky smooth water, light trails at night, star trails in sky, ethereal motion blur, dreamy, time-lapse feel', desc: '실크 같은 물, 빛의 궤적, 별의 궤적, 몽환적 모션 블러' },
      { label: '📷 필름 카메라', prompt: 'Film camera photography, Kodak Portra 400 film look, warm skin tones, natural grain, slightly overexposed, nostalgic analog feel, 35mm', desc: 'Kodak Portra 400 필름 룩, 따뜻한 피부톤, 자연스러운 그레인, 35mm 아날로그 감성' }
    ]
  }
];

export const CHARACTER_LIBRARY = {
  "01. 인터넷 밈 생명체": ["스키비디 토일렛 (변기통 인간)", "카메라 맨 (CCTV 머리)", "스피커 맨", "TV 맨", "시네마 맨 (프로젝터)", "근육질 시바견 (Doge)", "울먹이는 바나나 고양이", "슬픈 개구리 (페페)", "기가 채드 (턱형)", "트롤 페이스", "관짝 춤 형님들", "냥캣 (우주 고양이)", "춤추는 초록 외계인 (Dame Tu Cosita)", "비명 지르는 마멋", "팝캣 (입 벌리는 고양이)", "해피 고양이 (점프)", "옴놈 (사탕 괴물)", "미니언 (노란 콩)", "핑크 가이 (전신 타이즈)", "춤추는 핫도그", "릭롤링 (가수)", "샌즈 (해골)", "와! (감탄사 캐릭터)", "개구리 중사 케로로", "펭수 (거대 펭귄)", "뽀로로 (안경 펭귄)", "텔레토비 보라돌이", "텔레토비 뚜비", "텔레토비 나나", "텔레토비 뽀", "오징어 게임 진행요원 (동그라미)", "오징어 게임 진행요원 (세모)", "오징어 게임 진행요원 (네모)", "영희 로봇", "어몽어스 우주인 (빨강)", "폴가이즈 젤리빈", "로블록스 눕 (노란 피부)", "마인크래프트 스티브", "마인크래프트 크리퍼", "앵그리버드 (레드)", "식물 vs 좀비 (콩슈터)", "플래피 버드", "롱 캣 (몸 긴 고양이)", "근육질 피카츄", "슈렉", "소닉 (못생긴 버전)", "우간다 너클즈", "저주받은 토마스 기차", "시계탑 맨", "드릴 맨"],
  "02. 슈퍼 히어로": ["스파이더맨 (거미줄)", "배트맨 (박쥐)", "아이언맨 (강철 수트)", "캡틴 아메리카 (방패)", "헐크 (녹색 거인)", "토르 (망치)", "슈퍼맨 (망토)", "원더우먼 (채찍)", "아쿠아맨 (삼지창)", "플래시 (스피드)", "호크아이 (활)", "블랙 팬서 (표범)", "앤트맨 (개미)", "닥터 스트레인지 (마법)", "가디언즈 로켓 (너구리)", "그루트 (나무)", "캡틴 마블", "캣우먼", "고스트 라이더 (해골)", "데어데블", "울버린 (클로)", "사이클롭스 (레이저 눈)", "스톰 (번개)", "미스터 판타스틱 (고무)", "휴먼 토치 (불)", "더 씽 (바위)", "인비저블 우먼 (투명)", "그린랜턴 (반지)", "샤잠", "사이보그", "벤10 (변신 소년)", "파워레인저 레드", "파워레인저 블루", "파워레인저 핑크", "파워레인저 옐로우", "파워레인저 블랙", "가면라이더", "울트라맨", "사이타마 (원펀맨)", "제노스 (사이보그)", "올마이트", "미도리야 이즈쿠", "세일러문", "웨딩피치", "카드캡터 체리", "호빵맨", "번개맨", "벡터맨", "닌자 거북이 레오나르도", "미스터 인크레더블"],
  "03. 슈퍼 빌런": ["타노스", "조커", "할리퀸", "베놈", "닥터 옥토퍼스", "그린 고블린", "미스터 프리즈", "투 페이스", "리들러", "펭귄맨", "로키", "울트론", "레드 스컬", "닥터 둠", "갤럭투스", "다스베이더", "팰퍼틴 황제", "볼드모트", "사우론", "백설공주 마녀", "우르슬라 (문어 마녀)", "말레피센트", "크루엘라", "후크 선장", "하트 여왕", "로켓단 (제임스)", "프리저", "셀", "마인부우", "오로치마루", "검은 수염 티치", "도플라밍고", "디오 브란도", "키라 요시카게", "그리피스", "세피로스", "쿠파", "가논돌프", "닥터 에그맨", "장군 (바이슨)", "고우키", "기스 하워드", "알버트 웨스커", "리치 왕 (아서스)", "디아블로", "메피스토", "바알", "케리건", "아크튜러스 멩스크", "팀 로켓 (로사)"],
  "04. 애니메이션 주연": ["손오공 (드래곤볼)", "베지터", "루피 (원피스)", "조로", "나루토", "사스케", "이치고 (블리치)", "탄지로 (귀멸)", "네즈코", "렌고쿠", "에드워드 엘릭 (강철)", "알폰스 엘릭 (갑옷)", "엘런 예거 (거인)", "리바이 병장", "피카츄", "지우 (포켓몬)", "야가미 라이토 (데스노트)", "L (데스노트)", "덴지 (체인소맨)", "파워 (체인소맨)", "긴토키 (은혼)", "켄신 (바람의 검심)", "강백호 (슬램덩크)", "서태웅", "코난 (명탐정)", "괴도 키드", "신짱구", "짱아", "흰둥이", "도라에몽", "노진구", "아톰", "아라레", "이누야샤", "셋쇼마루", "란마", "아스카 (에반게리온)", "레이 (에반게리온)", "신지 (에반게리온)", "아무로 레이 (건담)", "샤아 아즈나블", "키리토 (소아온)", "아스나", "죠타로 (죠죠)", "루루슈 (코드기어스)", "토토로", "가오나시", "하울", "소피", "포뇨"],
  "05. 게임 마스코트": ["마리오", "루이지", "피치 공주", "키노피오", "요시", "링크 (젤다)", "젤다 공주", "소닉", "테일즈", "너클즈", "커비", "메타나이트", "동키콩", "록맨 (메가맨)", "팩맨", "류 (스파)", "켄 (스파)", "춘리", "가일", "쿄 (KOF)", "이오리", "마이", "카즈야 (철권)", "헤이하치", "진 카자마", "솔리드 스네이크", "클라우드 (파판7)", "티파", "에어리스", "단테 (데빌메이크라이)", "크레토스 (갓오브워)", "마스터 치프 (헤일로)", "둠 가이", "고든 프리맨", "라라 크로프트", "트레이서 (오버워치)", "겐지", "디바", "아리 (롤)", "티모", "리신", "야스오", "징크스", "페이커 (대상혁 캐릭터)", "스티브 (마크)", "알렉스 (마크)", "다오 (카트)", "배찌", "쿠키런 (용감한 쿠키)", "앵그리버드 레드"],
  "06. 판타지 종족": ["휴먼 (인간)", "하이 엘프 (귀 긴 종족)", "다크 엘프 (검은 피부)", "우드 엘프 (숲)", "드워프 (난쟁이)", "노움 (기술자)", "호빗 (반인족)", "오크 (녹색 괴물)", "고블린 (작은 괴물)", "트롤 (재생 괴물)", "오우거 (거인)", "자이언트 (초거인)", "타이탄", "사이클롭스 (외눈박이)", "켄타우로스 (반인반마)", "미노타우르스 (소 머리)", "사티로스 (염소 다리)", "나가 (뱀 인간)", "리자드맨 (도마뱀 인간)", "드래곤뉴트 (용인족)", "코볼트 (개 머리)", "놀 (하이에나 머리)", "웨어울프 (늑대 인간)", "뱀파이어 (흡혈귀)", "언데드 (망자)", "스켈레톤 (해골)", "좀비", "구울", "미라", "리치 (해골 마법사)", "페어리 (요정)", "픽시", "님프", "드라이어드 (나무 요정)", "엔트 (걸어다니는 나무)", "골렘 (돌)", "머맨 (인어 남자)", "머메이드 (인어 여자)", "하피 (새 인간)", "세이렌", "발키리", "천사", "타락천사", "악마 (데몬)", "서큐버스", "인큐버스", "임프", "정령 (엘리멘탈)", "도깨비", "오니"],
  "07. 클래식 몬스터": ["드라큘라 백작", "프랑켄슈타인 괴물", "미라 (머미)", "늑대인간", "투명인간", "오페라의 유령", "지킬 앤 하이드", "킹콩", "고질라", "크라켄", "네시 (호수 괴물)", "빅풋 (설인)", "예티", "츄파카브라", "모스맨 (나방 인간)", "그렘린", "늪지의 괴물 (Swamp Thing)", "반어인 (물고기 인간)", "파리 인간 (The Fly)", "50피트 여인", "슬리피 할로우 (목 없는 기사)", "좀비 (새벽의 저주)", "강시", "처녀 귀신", "몽달 귀신", "구미호", "일본 귀신 (오니)", "갓파", "텐구", "로쿠로쿠비 (목 긴 요괴)", "설녀", "슬렌더맨", "사이렌 헤드", "제프 더 킬러", "부기맨", "사신 (그림 리퍼)", "샌드맨", "잭 오 랜턴 (호박 머리)", "가고일", "밴시", "듀라한", "스큐라", "카리브디스", "히드라", "메두사", "키메라", "만티코어", "바실리스크", "코카트리스", "페가수스"],
  "08. 슬래셔 무비 킬러": ["제이슨 (13일의 금요일)", "프레디 (나이트메어)", "레더페이스 (텍사스 전기톱)", "마이클 마이어스 (할로윈)", "고스트페이스 (스크림)", "핀헤드 (헬레이저)", "처키 (사탄의 인형)", "티파니 (처키 신부)", "애나벨", "빌리 (쏘우 인형)", "직쏘 (존 크레이머)", "페니와이즈 (IT 광대)", "사다코 (링)", "가야코 (주온)", "토시오", "사일런트 힐 삼각두", "사일런트 힐 간호사", "캔디맨", "지퍼스 크리퍼스", "한니발 렉터", "잭 토랜스 (샤이닝)", "노먼 베이츠 (싸이코)", "캐리 (피투성이)", "엑소시스트 리건 (빙의)", "더 넌 (수녀 귀신)", "곡성 외지인 (아쿠마)", "장산범", "빨간 마스크", "제노모프 (에이리언)", "프레데터", "더 씽 (괴물)", "브런들플라이 (파리)", "미스트 거대 괴물", "클로버필드 괴물", "데모고르곤 (기묘한 이야기)", "바바둑", "마마 (귀신)", "애슐리 윌리엄스 (이블데드)", "톡식 어벤저", "킬러 토마토", "킬러 콘돔 (...)", "샤크네이도 상어", "피라냐", "아나콘다", "죠스", "디센트 괴물", "REC 좀비", "28일 후 감염자", "부산행 좀비", "킹덤 좀비"],
  "09. 로봇과 기계": ["건담 (RX-78)", "자쿠", "에반게리온 초호기", "마징가 Z", "태권 V", "그렌라그안", "가오가이거", "옵티머스 프라임", "범블비", "메가트론", "스타스크림", "아이언 자이언트", "집시 데인저 (퍼시픽 림)", "볼트론", "메가조드 (파워레인저)", "또봇", "헬로 카봇", "터미네이터 T-800", "터미네이터 T-1000 (액체)", "로보캅", "울트론", "아톰", "록맨", "제로 (록맨)", "알리타", "2B (니어 오토마타)", "도라에몽", "월-E", "이브 (EVE)", "베이맥스", "R2-D2", "C-3PO", "BB-8", "달렉", "사이버맨", "글라도스 (포탈)", "터렛 (포탈)", "클랩트랩", "바스티온", "젠야타", "블리츠크랭크", "오리아나", "SCV", "프로브", "로보틱스 독 (스팟)", "룸바 (청소기)", "채피", "리얼 스틸 로봇", "메카 고질라", "센티넬 (매트릭스)"],
  "10. 공상과학 외계인": ["그레이 (전형적 외계인)", "렙틸리언 (도마뱀)", "마션 (화성인)", "제노모프 (에이리언)", "프레데터", "ET", "요다", "츄바카 (우키족)", "자바 더 헛", "이워크 (곰 인형)", "나비족 (아바타)", "스팍 (벌칸족)", "클링온", "저그 히드라리스크", "저그 저글링", "프로토스 질럿", "프로토스 다크템플러", "아칸 (집정관)", "타노스 (타이탄족)", "그루트", "로켓 라쿤", "맨티스", "가모라", "드랙스", "욘두", "베놈 (심비오트)", "카니지", "갤러그 파리", "스페이스 인베이더", "화성 침공 뇌 괴물", "디스트릭트 9 프라운", "어라이벌 헵타포드 (오징어)", "엣지 오브 투모로우 미믹", "스타쉽 트루퍼스 버그", "듄 샌드웜", "크립톤인 (슈퍼맨)", "아스가르드인 (토르)", "트랜스포머 (사이버트론)", "닥터후 타디스 (우주선)", "오토봇", "디셉티콘", "스티치", "케로로", "기로로", "타마마", "쿠루루", "도로로", "피콜로 (나메크인)", "프리저", "마인 부우"],
  "11. 동물": ["사자", "호랑이", "불곰", "북극곰", "판다", "늑대", "여우", "너구리", "토끼", "다람쥐", "고양이", "강아지 (시바견)", "강아지 (리트리버)", "강아지 (불독)", "강아지 (치와와)", "젖소", "돼지", "말", "양", "염소", "닭", "병아리", "오리", "거위", "비둘기", "앵무새", "독수리", "부엉이", "펭귄", "물개", "해달", "상어", "범고래", "돌고래", "문어", "오징어", "거북이", "개구리", "뱀", "악어", "카멜레온", "코끼리", "기린", "하마", "코뿔소", "고릴라", "침팬지", "원숭이", "나무늘보", "캥거루"],
  "12. 살아있는 음식": ["햄버거 맨", "감자튀김 맨", "핫도그 맨", "피자 조각 맨", "샌드위치 맨", "타코 맨", "부리또 맨", "새우 초밥 맨", "계란 초밥 맨", "참치 초밥 맨", "김밥 맨", "삼각김밥 맨", "컵라면 맨", "떡볶이 맨", "순대 맨", "어묵 꼬치 맨", "만두 맨", "찐빵 맨", "호떡 맨", "붕어빵 맨", "식빵 맨", "바게트 맨", "크루아상 맨", "도넛 맨", "생일 케이크 맨", "컵케이크 맨", "마카롱 맨", "아이스크림 콘 맨", "하드 바 맨", "팥빙수 맨", "탕후루 맨", "사탕 맨", "초콜릿 바 맨", "진저브레드 쿠키", "우유팩 맨", "콜라 캔 맨", "사이다 캔 맨", "맥주병 맨", "소주병 맨", "와인병 맨", "바나나 맨", "사과 맨", "딸기 맨", "수박 맨", "포도 맨", "옥수수 맨", "당근 맨", "브로콜리 맨", "버섯 맨", "계란 후라이 맨"],
  "13. 사물 머리 인간": ["TV 머리 (구형)", "모니터 머리 (LCD)", "스마트폰 머리", "CCTV 머리", "DSLR 카메라 머리", "스피커 머리", "라디오 머리", "붐박스 머리", "마이크 머리", "헤드셋 머리", "전구 머리", "신호등 머리", "가로등 머리", "소화전 머리", "쓰레기통 머리", "변기통 머리", "세탁기 머리", "전자레인지 머리", "토스트기 머리", "믹서기 머리", "냉장고 머리", "선풍기 머리", "에어컨 머리", "알람시계 머리", "손목시계 머리", "백과사전 머리", "선물 상자 머리", "택배 박스 머리", "주사위 머리", "트럼프 카드 머리", "지구본 머리", "화분 머리", "선인장 머리", "돌멩이 머리", "구름 머리", "태양 머리", "달 머리", "주전자 머리", "찻잔 머리", "냄비 머리", "맥주잔 머리", "축구공 머리", "농구공 머리", "야구공 머리", "볼링공 머리", "타이어 머리", "엔진 머리", "톱니바퀴 머리", "망치 머리", "도끼 머리"],
  "14. 직업 전사": ["경찰관", "소방관", "의사", "간호사", "판사", "변호사", "탐정", "과학자", "우주 비행사", "파일럿", "스튜어디스", "선장", "기관사", "요리사 (쉐프)", "제빵사", "농부", "어부", "광부", "목수", "용접공", "정비공", "배관공", "전기 기사", "건축가", "화가", "만화가", "사진 작가", "영화 감독", "소설가", "기자", "선생님", "교수", "사서", "고고학자", "사육사", "군인", "해녀", "킬러", "스파이", "닌자", "도둑", "해커", "아이돌", "래퍼", "마술사", "삐에로", "카우보이", "신부님", "스님", "무당"],
  "15. 스포츠 선수": ["축구 공격수 (메시 st)", "축구 골키퍼", "농구 선수 (조던 st)", "야구 투수", "야구 타자", "배구 선수", "테니스 선수", "배드민턴 선수", "탁구 선수", "골프 선수 (타이거 st)", "볼링 선수", "당구 선수", "양궁 선수", "사격 선수", "펜싱 선수", "권투 선수 (타이슨 st)", "레슬링 선수", "유도 선수", "태권도 선수", "가라테 선수", "쿵푸 마스터 (이소룡)", "스모 선수", "씨름 선수", "무에타이 선수", "주짓수 선수", "역도 선수", "마라톤 선수", "100m 스프린터 (우사인 볼트)", "수영 선수", "다이빙 선수", "체조 선수", "리듬체조 선수", "피겨 선수 (김연아 st)", "스피드 스케이팅 선수", "아이스하키 선수", "스키 선수", "스노보드 선수", "서퍼", "스케이트보더", "사이클 선수", "경마 기수", "카레이서", "미식축구 선수", "럭비 선수", "크리켓 선수", "컬링 선수", "봅슬레이 선수", "등산가", "치어리더", "심판"],
  "16. 신화와 역사": ["제우스", "포세이돈", "하데스", "아폴론", "아프로디테", "아레스", "아테나", "헤라클레스", "토르", "오딘", "로키", "아누비스", "라 (태양신)", "오시리스", "투탄카멘", "클레오파트라", "예수", "부처", "관우", "유비", "장비", "제갈량", "여포", "초선", "징기스칸", "나폴레옹", "알렉산더 대왕", "카이사르", "스파르타 전사", "로마 군단병", "글래디에이터", "중세 기사", "십자군", "사무라이", "닌자", "바이킹", "해적", "보안관 (서부)", "인디언 추장", "마야 전사", "아즈텍 전사", "줄루족 전사", "세종대왕", "이순신 장군", "거북선", "화랑", "조선 왕", "조선 선비", "엿장수", "원시인"],
  "17. 특수부대": ["육군 보병", "해병대", "해군 수병", "공군 파일럿", "특전사", "UDT 대원", "707 특임대", "SWAT 대원", "FBI 요원", "CIA 요원", "SAS 대원", "델타포스", "네이비 씰", "스페츠나츠", "GSG-9", "프랑스 외인부대", "저격수", "기관총 사수", "의무병", "통신병", "취사병", "운전병", "훈련소 조교", "장군", "헌병", "화생방 병사", "폭발물 처리반 (EOD)", "탱크 조종수", "잠수함 승조원", "공수부대원", "용병 (PMC)", "게릴라 반군", "테러리스트", "인질", "2차대전 미군", "2차대전 독일군", "2차대전 소련군", "2차대전 일본군", "베트남전 미군", "중세 용병", "머스킷 총병", "나폴레옹 시대 군인", "근위대", "스위스 용병", "예비군", "말년 병장", "이등병", "관심 병사", "방독면 쓴 생존자", "매드맥스 워보이"],
  "18. 동화 속 인물": ["백설공주", "신데렐라", "인어공주", "라푼젤", "잠자는 숲속의 공주", "벨 (미녀와 야수)", "야수", "알라딘", "지니", "자스민", "피터팬", "팅커벨", "후크 선장", "앨리스", "모자 장수", "체셔 고양이", "도로시 (오즈)", "양철 나무꾼", "허수아비", "겁쟁이 사자", "피노키오", "제페토", "빨간 망토", "할머니 변장 늑대", "헨젤", "그레텔", "과자집 마녀", "잭 (콩나무)", "거인", "장화 신은 고양이", "곰돌이 푸", "피글렛", "티거", "이요르", "산타 클로스", "루돌프", "크리스마스 엘프", "이빨 요정", "부활절 토끼", "샌드맨", "잭 프로스트", "엘사", "안나", "울라프", "모아나", "마우이", "뮬란", "심청이", "흥부", "놀부"],
  "19. 장난감 친구들": ["테디베어", "토끼 인형", "호두까기 인형", "마트료시카", "프랑스 인형", "구체관절 인형", "못난이 인형 (트롤)", "바비 인형", "켄 인형", "군인 피규어 (지아이조)", "카우보이 우디", "우주인 버즈", "공룡 렉스", "돼지 햄", "강아지 슬링키", "미스터 포테이토", "초록 병정 (아미맨)", "레고 미니피규어", "플레이모빌", "베어브릭", "펀코팝 (대두)", "넨도로이드", "피그마", "건담 프라모델", "미니카", "요요", "팽이", "다마고치", "퍼비", "잭 인 더 박스 (상자 삐에로)", "태엽 로봇", "양철 로봇", "고무 오리", "물총", "비눗방울", "슬라임", "탱탱볼", "큐브", "젠가", "도미노", "봉제 인형 (솜)", "마리오네트", "복화술 인형", "종이 인형", "찰흙 인형", "석고상", "마네킹", "목각 인형", "드림캐쳐", "스노우볼"],
  "20. 아포칼립스 돌연변이": ["방사능 좀비", "환자복 좀비", "의사 좀비", "경찰 좀비", "군인 좀비", "뚱뚱한 좀비 (부머)", "달리는 좀비 (러너)", "비명 좀비 (위치)", "혀 긴 좀비 (스모커)", "탱크 좀비 (근육)", "곰팡이 감염자 (클리커)", "눈 없는 괴물 (리커)", "네메시스", "타일런트", "폴아웃 구울", "슈퍼 뮤턴트", "데스클로", "스토커 (방독면)", "메트로 병사", "디비전 요원", "라오어 엘리", "라오어 조엘", "워킹 데드 릭", "워킹 데드 네간", "나는 전설이다 주인공", "팔 4개 돌연변이", "다리 4개 돌연변이", "머리 2개 사람", "눈 3개 사람", "촉수 달린 사람", "거미 다리 등짝", "파리 인간", "바퀴벌레 인간", "모기 인간", "사마귀 인간", "식인종", "약탈자 (레이더)", "매드맥스 임모탄", "퓨리오사", "워보이", "화생방 부대", "둠스데이 생존자 (배낭)", "사이코패스 살인마", "늪지의 괴물", "하수구 괴물", "쓰레기 더미 괴물", "녹아내리는 슬라임 인간", "뼈만 남은 인간", "기계와 융합된 인간", "AI에게 지배당한 인간"]
};

// ============================================================
// Thumbnail Text Style Presets (텍스트 이펙트 프리셋)
// ============================================================
import { ThumbnailTextPreset, ThumbnailFontHint } from './types';

export const THUMBNAIL_TEXT_PRESETS: ThumbnailTextPreset[] = [
  {
    id: 'sticker',
    label: '스티커',
    emoji: '🏷️',
    promptFragment: '[MANDATORY TEXT STYLE: DIE-CUT STICKER] (Massive White Sticker Border: 1.8), (Double Outline: Thick Black Inner + Huge White Outer Halo), (Die-cut sticker style), (Flat 2D Text), (No 3D Bevel), (Text floating above background), (Text implies separate layer).',
    negativeFragment: '(3D bevel: -2.0), (Metallic text: -2.0), (Neon glow: -2.0)'
  },
  {
    id: 'neon',
    label: '네온',
    emoji: '💡',
    promptFragment: '[MANDATORY TEXT STYLE: NEON GLOW TUBE] (Glowing neon tube text: 2.0), (Bright neon light emission), (Soft blur glow halo around letters), (Glass tube texture on text), (Dark background enhancing glow), (Light reflection on nearby surfaces), (Vibrant electric colors).',
    negativeFragment: '(Sticker border: -2.0), (White outline: -2.0), (Flat matte text: -2.0)'
  },
  {
    id: 'metal',
    label: '메탈',
    emoji: '⚙️',
    promptFragment: '[MANDATORY TEXT STYLE: CHROME METALLIC 3D] (Chrome metallic text: 2.0), (Highly reflective mirror surface), (3D extruded metal letters), (Specular highlights), (Industrial metal texture), (Brushed steel finish), (Dramatic studio lighting on metal).',
    negativeFragment: '(Flat text: -2.0), (Sticker: -2.0), (Matte finish: -2.0)'
  },
  {
    id: 'fire',
    label: '불꽃',
    emoji: '🔥',
    promptFragment: '[MANDATORY TEXT STYLE: FLAMING TEXT] (Text made of fire: 2.0), (Burning flame edges), (Orange and red fire particles), (Heat distortion), (Ember sparks flying from letters), (Molten core glow), (Dark background with fire illumination).',
    negativeFragment: '(Ice: -2.0), (Cold: -2.0), (Blue tone: -1.5), (Sticker: -2.0)'
  },
  {
    id: 'ice',
    label: '얼음',
    emoji: '❄️',
    promptFragment: '[MANDATORY TEXT STYLE: FROZEN ICE CRYSTAL] (Frozen ice text: 2.0), (Translucent ice crystal texture), (Frost particles), (Cold blue refraction), (Icicle formations on letters), (Snowflake details), (Winter cold atmosphere).',
    negativeFragment: '(Fire: -2.0), (Warm tone: -1.5), (Sticker: -2.0)'
  },
  {
    id: 'grunge',
    label: '그런지',
    emoji: '🎸',
    promptFragment: '[MANDATORY TEXT STYLE: GRUNGE DISTRESSED] (Grunge distressed text: 2.0), (Scratched worn texture), (Peeling paint effect), (Rough concrete/wall texture on letters), (Dirty weathered surface), (Urban decay aesthetic), (Industrial grunge).',
    negativeFragment: '(Clean: -2.0), (Smooth: -2.0), (Glossy: -2.0), (Sticker: -2.0)'
  },
  {
    id: 'handwritten',
    label: '손글씨',
    emoji: '✍️',
    promptFragment: '[MANDATORY TEXT STYLE: HANDWRITTEN MARKER] (Thick marker handwritten text: 2.0), (Casual handwriting style), (Ink bleed edges), (Slightly uneven baseline), (Bold marker stroke), (Organic hand-drawn feel), (White or bright marker on dark).',
    negativeFragment: '(Digital font: -2.0), (Perfect geometry: -2.0), (Sticker: -2.0)'
  },
  {
    id: 'retro',
    label: '레트로',
    emoji: '📼',
    promptFragment: '[MANDATORY TEXT STYLE: RETRO VINTAGE] (Retro vintage typography: 2.0), (70s/80s style lettering), (Gradient sunset colors on text), (Chrome outline), (Retro grid background hint), (VHS noise texture overlay), (Synthwave aesthetic).',
    negativeFragment: '(Modern minimal: -2.0), (Clean sans-serif: -2.0), (Sticker: -2.0)'
  },
  {
    id: 'clean',
    label: '클린',
    emoji: '✨',
    promptFragment: '[MANDATORY TEXT STYLE: CLEAN MODERN] (Clean modern typography: 2.0), (Minimal drop shadow only), (Sharp crisp edges), (No decorative effects), (Professional design), (Balanced whitespace), (Subtle text shadow for readability).',
    negativeFragment: '(Sticker border: -2.0), (Neon: -2.0), (Grunge: -2.0), (Fire: -2.0)'
  },
  {
    id: 'blood',
    label: '블러드',
    emoji: '🩸',
    promptFragment: '[MANDATORY TEXT STYLE: HORROR BLOOD DRIP] (Blood dripping text: 2.0), (Dark red viscous liquid), (Drip trails from letter bottoms), (Splatter effects), (Wet glossy surface), (Horror movie title style), (Dark atmospheric background).',
    negativeFragment: '(Cute: -2.0), (Clean: -2.0), (Bright colors: -1.5), (Sticker: -2.0)'
  }
];

export const THUMBNAIL_FONT_HINTS: ThumbnailFontHint[] = [
  {
    id: 'gothic',
    label: '고딕 Heavy',
    promptFragment: '(Font: Ultra-Black Heavy Gothic Sans-serif), (Impact/Helvetica Black style), (Maximum boldness), (Extra Bold Weight: 2.0)'
  },
  {
    id: 'serif',
    label: '명조 Serif',
    promptFragment: '(Font: Heavy Slab Serif / Mincho style), (Classic editorial weight), (Bold Serif), (Elegant thick strokes)'
  },
  {
    id: 'brush',
    label: '붓글씨',
    promptFragment: '(Font: Bold Brush Stroke / Calligraphy style), (Dynamic ink brush), (Thick confident strokes), (East Asian calligraphy feel)'
  },
  {
    id: 'handwritten',
    label: '손글씨',
    promptFragment: '(Font: Thick Handwritten Marker style), (Casual bold handwriting), (Organic letter shapes), (Marker pen texture)'
  },
  {
    id: 'rounded',
    label: '라운드',
    promptFragment: '(Font: Rounded Bubble style), (Cute thick rounded letters), (Soft edges), (Friendly playful typography)'
  },
  {
    id: 'condensed',
    label: '컨덴스드',
    promptFragment: '(Font: Condensed Narrow Bold), (Tall compressed letters), (Maximum impact in tight space), (Heavy condensed weight)'
  }
];

export const CHARACTER_STYLES = [
  {
    category: "🧶 질감 & 소재",
    items: [
        { label: "털실 인형", prompt: "crochet knitted wool texture, amigurumi style, cute, soft lighting", emoji: "🧶" },
        { label: "양모 펠트", prompt: "needle felted texture, fuzzy surface, wool felt, handmade toy look", emoji: "🐑" },
        { label: "플라스틱 토이", prompt: "shiny plastic texture, toy figure, smooth surface, injection molding lines", emoji: "🧸" },
        { label: "레고 블록", prompt: "lego brick construction, voxel art, plastic studs, blocky", emoji: "🧱" },
        { label: "클레이", prompt: "play-doh clay texture, stop motion style, fingerprints, matte finish, cute", emoji: "🌈" },
        { label: "투명 유리", prompt: "transparent glass sculpture, refraction, crystal clear, fragile, caustic lighting", emoji: "🧊" },
        { label: "반투명 젤리", prompt: "translucent slime texture, gooey, dripping, gummy bear material, subsurface scattering", emoji: "🍮" },
        { label: "황금", prompt: "solid gold statue, highly reflective, metallic sheen, luxury, studio lighting", emoji: "🏆" },
        { label: "풍선", prompt: "balloon animal style, inflated latex texture, shiny, round edges, helium", emoji: "🎈" },
        { label: "종이접기", prompt: "folded paper texture, origami style, sharp creases, paper craft, geometric", emoji: "📄" },
        { label: "골판지", prompt: "corrugated cardboard texture, recycled paper look, boxy, diy craft, rough edges", emoji: "📦" },
        { label: "원목 조각", prompt: "hand carved wood, wood grain texture, wooden puppet, pinocchio style, varnished", emoji: "🪵" },
        { label: "도자기", prompt: "cracked porcelain doll, ceramic texture, glazed surface, vintage, fragile", emoji: "🏺" },
        { label: "네온 사인", prompt: "glowing neon tubes, light painting, cyberpunk lighting, dark background, glass tubing", emoji: "💡" },
        { label: "슬라임", prompt: "liquid slime creature, dripping, viscous, wet surface, glossy", emoji: "🦠" },
        { label: "설탕 공예", prompt: "hard candy texture, translucent sugar, glossy, sweet, edible look", emoji: "🍭" },
        { label: "솜 인형", prompt: "plush toy texture, soft cotton stuffing, visible seams, fabric texture", emoji: "🧸" },
        { label: "가죽 스티치", prompt: "stitched leather texture, vintage doll, heavy stitching, worn leather", emoji: "👜" },
        { label: "얼음 조각", prompt: "carved ice statue, translucent, cold blue lighting, melting details", emoji: "❄️" },
        { label: "비눗방울", prompt: "soap bubble texture, iridescent, transparent film, rainbow reflection", emoji: "🫧" }
    ]
  },
  {
    category: "🎬 3D & 렌더링",
    items: [
        { label: "픽사 스타일", prompt: "pixar style 3D, disney animation, cute proportions, perfect lighting, subsurface scattering", emoji: "🎬" },
        { label: "지점토 애니", prompt: "aardman style, stop motion, claymation, plasticine texture, fingerprints, handmade look", emoji: "🤲" },
        { label: "언리얼 엔진 5", prompt: "unreal engine 5 render, lumen, nanite, high fidelity, game cinematic, 8k", emoji: "🎮" },
        { label: "포트나이트", prompt: "fortnite visual style, stylized 3d, vibrant colors, cartoon shader, exaggerated proportions", emoji: "🔫" },
        { label: "로우 폴리", prompt: "low poly 3d, faceted geometry, retro game style, simple shapes, ps1 graphics, jagged edges", emoji: "🔻" },
        { label: "피규어", prompt: "funko pop vinyl figure, big head, black button eyes, box packaging look, plastic", emoji: "🎎" },
        { label: "넨도로이드", prompt: "nendoroid style, chibi anime figure, plastic joint, cute, big head", emoji: "🎎" },
        { label: "구체관절 인형", prompt: "ball jointed doll, realistic resin texture, doll joints, glass eyes, bjd", emoji: "🪆" },
        { label: "블리자드", prompt: "warcraft cinematic style, detailed texture, heroic lighting, epic, blizzard entertainment style", emoji: "⚔️" },
        { label: "롤 일러스트", prompt: "riot games splash art style, dynamic duo, painterly 3d, highly detailed, dramatic lighting", emoji: "🖌️" },
        { label: "심즈 4", prompt: "the sims 4 style, semi-realistic, game character creator look, smooth skin", emoji: "🏠" },
        { label: "마인크래프트", prompt: "minecraft style, pixelated blocks, square head, 8-bit texture, voxel", emoji: "🟩" },
        { label: "팀 버튼 3D", prompt: "tim burton style 3d, nightmare before christmas, skinny, spooky, dark fantasy", emoji: "🎃" },
        { label: "사이버펑크", prompt: "cyberpunk 2077 character, chrome skin, implants, neon rim light, futuristic", emoji: "🦾" },
        { label: "오버워치", prompt: "overwatch style, blizzard character, clean texture, stylized pbr", emoji: "🛡️" },
        { label: "클래시 오브 클랜", prompt: "clash of clans style, supercell art, mobile game 3d, render", emoji: "🏰" },
        { label: "동물의 숲", prompt: "animal crossing style, soft fuzzy texture, cute, round shapes, nintendo style", emoji: "🍃" },
        { label: "메이플 2", prompt: "maplestory 2 style, voxel character, cute, blocky, chibi", emoji: "🍁" },
        { label: "젤다 야숨", prompt: "breath of the wild style, cel shaded 3d, watercolor texture, soft lighting", emoji: "🗡️" },
        { label: "아케인", prompt: "arcane series style, netflix animation, painterly texture, 3d mixed with 2d", emoji: "🥊" },
        { label: "Zack D Films", prompt: "hyper-realistic 3D CGI educational animation style, intense subsurface scattering SSS, fleshy soft silicone skin texture, wet specular highlights, microscopic pore details, clinical studio lighting, soft global illumination, bright rim light, rendered in OctaneRender path tracing, grotesque yet clinical realism, clean solid pastel background, 8k resolution", emoji: "🎥" }
    ]
  },
  {
    category: "🖌️ 2D & 일러스트",
    items: [
        { label: "지브리", prompt: "studio ghibli style, hayao miyazaki, anime cel shading, lush colors, hand drawn", emoji: "🍃" },
        { label: "90년대 애니", prompt: "90s anime aesthetic, sailor moon style, grainy vhs effect, cel shaded, retro", emoji: "📺" },
        { label: "미국 카툰", prompt: "cartoon network style, thick outlines, flat colors, dexter's lab style, simple", emoji: "🇺🇸" },
        { label: "심슨 가족", prompt: "the simpsons style, yellow skin, bulging eyes, matt groening style, flat color", emoji: "🍩" },
        { label: "종이 인형극", prompt: "south park style, construction paper cutout, simple shapes, textured paper", emoji: "✂️" },
        { label: "디즈니 클래식", prompt: "classic disney 2d animation, hand drawn, fluid lines, 1990s disney style", emoji: "🏰" },
        { label: "웹툰 스타일", prompt: "korean webtoon style, digital manhwa, sharp lines, glowing effects, solo leveling style", emoji: "📱" },
        { label: "도트 픽셀", prompt: "8-bit pixel art, retro game sprite, nes style, limited color palette, blocky", emoji: "👾" },
        { label: "고해상도 픽셀", prompt: "16-bit pixel art, snes style, detailed pixel shading, octopath traveler style", emoji: "🎮" },
        { label: "벡터 아트", prompt: "vector illustration, flat design, corporate art style, minimalism, clean lines", emoji: "📐" },
        { label: "그래피티", prompt: "graffiti art, spray paint texture, street wall, drip effect, hip hop style", emoji: "🎨" },
        { label: "팝 아트", prompt: "andy warhol style, pop art, halftone dots, vibrant contrasting colors, comic style", emoji: "🖼️" },
        { label: "미국 코믹스", prompt: "american comic book style, heavy black ink, hatching, speech bubbles, marvel style", emoji: "🦸" },
        { label: "우키요에", prompt: "ukiyo-e style, japanese woodblock print, hokusai wave texture, traditional ink", emoji: "🌊" },
        { label: "타로 카드", prompt: "tarot card illustration, art nouveau, mucha style, decorative border, intricate", emoji: "🃏" },
        { label: "크레용 낙서", prompt: "child's drawing, crayon texture, scribbles, rough paper, naive art, colorful", emoji: "🖍️" },
        { label: "오일 파스텔", prompt: "oil pastel drawing, textured stroke, vibrant, blending, rough paper", emoji: "🖍️" },
        { label: "수채화", prompt: "watercolor painting, wet on wet, paint bleeds, soft pastel colors, artistic", emoji: "💧" },
        { label: "유화", prompt: "impasto oil painting, thick brush strokes, textured canvas, van gogh style", emoji: "🎨" },
        { label: "스테인드 글라스", prompt: "stained glass window, colorful glass shards, lead lines, church light, translucent", emoji: "⛪" },
        { label: "MS 페인트", prompt: "A crude, MS Paint-style digital illustration characterized by jagged, pixelated black outlines and flat, solid colors without any shading or texture. The drawing has a simplistic, meme-like aesthetic", emoji: "🖌️" },
        { label: "컨트리볼", prompt: "Countryball Polandball meme style, perfectly spherical round ball shape, country flag pattern as skin texture, small simple dot eyes (tiny white circles with black pupils), absolutely NO arms NO legs NO limbs NO hands NO feet, crude hand-drawn thick black outlines, simple flat comic look, white background, cute ball character, political satire webcomic aesthetic", emoji: "🌍" }
    ]
  },
  {
    category: "🌈 테마 & 컨셉",
    items: [
        { label: "사이버 펑크", prompt: "cyberpunk theme, neon lights, high tech, futuristic, night city background", emoji: "🌃" },
        { label: "스팀 펑크", prompt: "steampunk style, brass goggles, gears, leather, victorian sci-fi, steam engine", emoji: "⚙️" },
        { label: "좀비", prompt: "zombie texture, decaying skin, undead, horror movie makeup, scary", emoji: "🧟" },
        { label: "유령", prompt: "ghostly spirit, translucent blue, glowing aura, ethereal, floating", emoji: "👻" },
        { label: "로봇", prompt: "mecha robot, metal plates, exposed wires, led eyes, mechanical", emoji: "🤖" },
        { label: "돌 석상", prompt: "living stone statue, cracked stone texture, mossy, ancient ruin style", emoji: "🗿" },
        { label: "홀로그램", prompt: "star wars hologram, blue wireframe projection, scanlines, flickering, semi-transparent", emoji: "💿" },
        { label: "매드맥스", prompt: "post-apocalyptic wasteland style, dusty, dirt, scavenged gear, rusty", emoji: "🏜️" },
        { label: "파스텔 고스", prompt: "pastel goth aesthetic, cute but creepy, pink and black, skulls and bows", emoji: "🎀" },
        { label: "외계 생명체", prompt: "alien biological texture, slimy, purple skin, strange eyes, extraterrestrial", emoji: "👽" },
        { label: "불의 정령", prompt: "made of fire, burning flames, magma skin, glowing, elemental", emoji: "🔥" },
        { label: "물의 정령", prompt: "made of liquid water, splashing, droplets, fluid simulation, blue", emoji: "💧" },
        { label: "빛의 정령", prompt: "divine being, glowing eyes, halo, golden aura, angelic, ethereal", emoji: "✨" },
        { label: "어둠의 다크", prompt: "made of shadows, dark aura, red eyes, smoke body, scary", emoji: "🌑" },
        { label: "글리치", prompt: "digital glitch art, datamoshing, rgb split, corrupted file, distorted", emoji: "📺" },
        { label: "열화상 카메라", prompt: "thermal camera imaging, heat map colors, predator vision, infrared", emoji: "🌡️" },
        { label: "적외선", prompt: "infrared photography, dreamy pink and white, false color, surreal", emoji: "🌸" },
        { label: "초콜릿", prompt: "made of chocolate, edible texture, carved cocoa, sweet", emoji: "🍫" },
        { label: "보석", prompt: "made of diamond and ruby, crystal texture, refracting light, expensive", emoji: "💎" },
        { label: "우주", prompt: "galaxy skin, stars inside body, nebula texture, cosmic entity", emoji: "🌌" }
    ]
  },
  {
    category: "🦁 생물 변형",
    items: [
        { label: "고양이 수인", prompt: "cat-folk, cat ears and tail, fur texture, cute whiskers, anthropomorphic", emoji: "🐱" },
        { label: "강아지 수인", prompt: "dog-folk, dog ears, puppy nose, fur texture, anthropomorphic", emoji: "🐶" },
        { label: "토끼 수인", prompt: "bunny-folk, long rabbit ears, cute nose, fluffy tail, anthropomorphic", emoji: "🐰" },
        { label: "여우 수인", prompt: "fox-folk, fluffy fox tail, fox ears, orange fur, anthropomorphic", emoji: "🦊" },
        { label: "늑대 인간", prompt: "werewolf, wolf head, fur body, claws, scary, anthropomorphic", emoji: "🐺" },
        { label: "뱀파이어", prompt: "vampire, pale skin, red eyes, fangs, noble clothes, gothic", emoji: "🧛" },
        { label: "엘프", prompt: "elf, pointy ears, beautiful face, elegant, fantasy style", emoji: "🧝" },
        { label: "오크", prompt: "orc, green skin, tusks, muscular, tribal gear, fantasy style", emoji: "👹" },
        { label: "천사", prompt: "angel, white feathered wings, halo, holy light, divine", emoji: "👼" },
        { label: "악마", prompt: "devil, horns, bat wings, red skin, tail, scary", emoji: "😈" },
        { label: "슬라임 인간", prompt: "slime-folk, translucent jelly body, cute face inside slime", emoji: "🦠" },
        { label: "식물 인간", prompt: "plant-folk, leaves for hair, bark skin, flowers, dryad", emoji: "🌿" },
        { label: "머맨/머메이드", prompt: "merfolk, scales, fins, aquatic features, gills", emoji: "🧜" },
        { label: "드래곤 인간", prompt: "dragon-born, dragon scales, horns, reptile eyes, tail", emoji: "🐲" },
        { label: "새 인간", prompt: "avian-folk, feathers, beak, wings on arms, bird legs", emoji: "🦅" },
        { label: "곰 인형", prompt: "living teddy bear, stitches, button eyes, cute", emoji: "🧸" },
        { label: "진저브레드", prompt: "gingerbread man, cookie texture, icing details, baked", emoji: "🍪" },
        { label: "로봇", prompt: "android, synthetic skin, mechanical joints, artificial", emoji: "🤖" },
        { label: "사이보그", prompt: "cyborg, half human half machine, mechanical eye, metal arm", emoji: "🦾" },
        { label: "미라", prompt: "mummy, wrapped in bandages, glowing eyes, ancient", emoji: "🤕" }
    ]
  }
];

// === TYPECAST TTS ===

export const TYPECAST_EMOTIONS: { id: string; label: string; labelKo: string; icon: string; description: string }[] = [
  { id: 'normal',   label: 'Normal',    labelKo: '기본',   icon: '😐', description: '자연스러운 기본 톤' },
  { id: 'happy',    label: 'Happy',     labelKo: '행복',   icon: '😊', description: '밝고 경쾌한 톤' },
  { id: 'sad',      label: 'Sad',       labelKo: '슬픔',   icon: '😢', description: '차분하고 우울한 톤' },
  { id: 'angry',    label: 'Angry',     labelKo: '분노',   icon: '😠', description: '격앙되고 단호한 톤' },
  { id: 'whisper',  label: 'Whisper',   labelKo: '속삭임', icon: '🤫', description: '조용하고 은밀한 톤' },
  { id: 'toneup',   label: 'Tone Up',   labelKo: '톤업',   icon: '📈', description: '에너지 넘치는 상승 톤' },
  { id: 'tonedown', label: 'Tone Down', labelKo: '톤다운', icon: '📉', description: '차분하고 낮은 톤' },
];

// v2.1 전용 감정 프리셋 (whisper/tonedown 미지원, tonemid 추가)
export const TYPECAST_V21_EMOTIONS: { id: string; label: string; labelKo: string; icon: string; description: string }[] = [
  { id: 'normal',  label: 'Normal',   labelKo: '기본',     icon: '😐', description: '자연스러운 기본 톤' },
  { id: 'happy',   label: 'Happy',    labelKo: '행복',     icon: '😊', description: '밝고 경쾌한 톤' },
  { id: 'sad',     label: 'Sad',      labelKo: '슬픔',     icon: '😢', description: '차분하고 우울한 톤' },
  { id: 'angry',   label: 'Angry',    labelKo: '분노',     icon: '😠', description: '격앙되고 단호한 톤' },
  { id: 'tonemid', label: 'Tone Mid', labelKo: '중간 톤',  icon: '🔸', description: '중간 톤 (v2.1 전용)' },
  { id: 'toneup',  label: 'Tone Up',  labelKo: '톤업',     icon: '📈', description: '에너지 넘치는 상승 톤' },
];

export const TYPECAST_MODELS: { id: string; label: string; labelShort: string; description: string; supportsSmartEmotion: boolean }[] = [
  { id: 'ssfm-v30', label: '✨ 최신 음성 (v3.0)', labelShort: '최신 v3.0', description: 'AI 감정 자동 조절 + 수동 감정 선택', supportsSmartEmotion: true },
  { id: 'ssfm-v21', label: '🎙️ 클래식 음성 (v2.1)', labelShort: '클래식 v2.1', description: '안정적이고 자연스러운 음질, 수동 감정만', supportsSmartEmotion: false },
];

// === DIALOGUE TONE PRESETS (v4.7 대사 품질 고도화) ===
export const DIALOGUE_TONE_PRESETS: Record<DialogueTone, { label: string; emoji: string; desc: string; promptRules: string; arcTemplate: string }> = {
  senior_story: {
    label: '시니어 사연',
    emoji: '👵',
    desc: '시니어 채널 — 존댓말, 감성적, 회상조',
    promptRules: `Tone: Warm Korean honorifics (존댓말). Elderly reminiscence style. Use "~했지요", "~이었답니다", "그때는 말이에요..." patterns. Include sighs, pauses (…), and emotional interjections (아이고, 참…). Dialogue must feel like a grandparent telling a story to their grandchildren.`,
    arcTemplate: 'hook → daily → conflict → escalation → twist → resolution → reflection',
  },
  meme_viral: {
    label: '밈/바이럴',
    emoji: '🤣',
    desc: '짧고 자극적 — 과장, 신조어, 리액션',
    promptRules: `Tone: Extreme casual Korean (반말). Use internet slang, exaggeration ("미쳤다 진짜", "ㄹㅇ", "헐", "대박"). Each line must be punchy (max 15 chars). Include reaction sounds (ㅋㅋㅋ, 엥?, 헉). Dialogue should feel like viral TikTok/YouTube Shorts narration.`,
    arcTemplate: 'hook → build → surprise → payoff → cta',
  },
  drama: {
    label: '드라마/갈등',
    emoji: '🎭',
    desc: '대화 중심 — 갈등, 반전, 감정 교차',
    promptRules: `Tone: Natural conversational Korean with emotional range. Two or more speakers with distinct speech patterns. Use conflict-driven dialogue with tension buildup. Include pauses (...), interruptions (—), and emotional shifts. Each speaker must have a unique voice.`,
    arcTemplate: 'hook → daily → conflict → escalation → twist → resolution',
  },
  info: {
    label: '정보/해설',
    emoji: '📚',
    desc: '친근한 해설 — 쉬운 설명, 질문형',
    promptRules: `Tone: Friendly Korean semi-formal (해요체). Use rhetorical questions ("~인 거 알고 계셨나요?", "왜 그럴까요?"). Include "자, 여기서 중요한 건요—" transition patterns. Dialogue should make complex topics feel accessible and engaging.`,
    arcTemplate: 'hook → build → surprise → build → payoff → cta',
  },
  storytelling: {
    label: '스토리텔링',
    emoji: '📖',
    desc: '내러티브 — 서사적, 3인칭, 문학적',
    promptRules: `Tone: Literary Korean narration. Third-person omniscient. Use vivid descriptions and internal monologue. Include scene-setting ("그날 밤,", "어느 날 문득,"). Mix narration with character speech in quotes. Build atmosphere through sensory details.`,
    arcTemplate: 'hook → daily → build → conflict → escalation → twist → resolution → reflection',
  },
  none: {
    label: '사용 안 함',
    emoji: '⛔',
    desc: '대사 생성 비활성화',
    promptRules: '',
    arcTemplate: '',
  },
};

// ─── 폰트 성격 프로필 (Font Personality Profiles) ───
// 145개의 한글 폰트를 7개 자막 스타일 카테고리에 매칭
// 각 폰트는 최대 2-3개 카테고리에만 배치하여 최대 시각적 다양성 확보

export type SubtitleStyleCategory =
  | 'BASIC'       // 깔끔, 전문적
  | 'COLOR'       // 생생함, 대담함
  | 'STYLE'       // 창의적 효과 (네온, 글래스, 레트로)
  | 'VARIETY'     // 한국 예능 - 장난기 많고 대담하고 재밌음
  | 'EMOTION'     // 감정적, 영화적, 분위기 있음
  | 'CINEMATIC'   // 영화, 드라마, 다큐
  | 'NOBG';       // 배경 없음 - 아웃라인/섀도우 의존

export interface FontPersonalityProfile {
  fontFamily: string;      // CSS font-family 값
  categories: SubtitleStyleCategory[];
  reasoning: string;       // 해당 카테고리에 적합한 이유
  weight?: number;         // 권장 font-weight
  usage?: string;          // 사용 예시
}

export const FONT_PERSONALITY_PROFILES: Record<SubtitleStyleCategory, FontPersonalityProfile[]> = {
  // ═══════════════════════════════════════════════════════════════════════
  // 1. BASIC (깔끔, 전문적) — 기본 정보 전달, 신뢰성, 가독성 최우선
  // ═══════════════════════════════════════════════════════════════════════
  BASIC: [
    {
      fontFamily: 'Pretendard',
      categories: ['BASIC'],
      reasoning: '모던하고 중립적인 고딕. 뉴스, 설명 자막에 최적. 가장 높은 가독성과 전문성',
      weight: 400,
      usage: '기본 정보 자막, 자막 기본값'
    },
    {
      fontFamily: 'Noto Sans KR',
      categories: ['BASIC'],
      reasoning: '구글의 범용 산세리프. 모든 크기에서 명확하고 국제 표준 느낌. 뉴스 자막 스타일',
      weight: 400,
      usage: '다큐멘터리 정보 자막'
    },
    {
      fontFamily: 'Suit',
      categories: ['BASIC'],
      reasoning: '한국 기업 표준으로 많이 쓰이는 깔끔한 산세리프. 신뢰성과 현대성 겸비',
      weight: 400,
      usage: '뉴스 자막, 튜토리얼'
    },
    {
      fontFamily: 'IBM Plex Sans KR',
      categories: ['BASIC'],
      reasoning: '기술 기업 표준 폰트. 기술 설명, 과학 콘텐츠에 이상적. 차가운 전문성',
      weight: 500,
      usage: '과학, IT 설명 자막'
    },
    {
      fontFamily: 'Gothic A1',
      categories: ['BASIC'],
      reasoning: '정중한 고딕 스타일. 공식 문서처럼 느껴지는 정통 가독성',
      weight: 400,
      usage: '공식 공지, 정보 전달'
    },
    {
      fontFamily: 'S-CoreDream',
      categories: ['BASIC'],
      reasoning: '한국 TV 방송국에서 자주 쓰는 실제 기본 폰트. 친숙하고 신뢰감 있음',
      weight: 400,
      usage: '방송 자막, 표준 뉴스'
    },
    {
      fontFamily: 'NanumSquareNeo',
      categories: ['BASIC'],
      reasoning: '네이버의 표준 고딕. 앱, 웹에서 가장 널리 쓰는 기본 폰트. 중립적 신뢰감',
      weight: 400,
      usage: '앱 기본 자막, 일반 정보'
    },
    {
      fontFamily: 'MinSans',
      categories: ['BASIC'],
      reasoning: '미니멀한 산세리프. 현대적이고 세련된 깔끔함. 광고, 브랜딩에 사용됨',
      weight: 400,
      usage: '미니멀 디자인 자막'
    },
    {
      fontFamily: 'Freesentation',
      categories: ['BASIC'],
      reasoning: '발표 자료용으로 만들어진 폰트. 선명하고 집중력 있는 자막 목적',
      weight: 400,
      usage: '프레젠테이션 자막'
    },
    {
      fontFamily: 'LINESeedKR',
      categories: ['BASIC'],
      reasoning: '라인의 공식 폰트. 친근하면서도 전문적. 메신저 감각의 캐주얼 신뢰성',
      weight: 400,
      usage: '메시지 형식 자막'
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 2. COLOR (생생함, 대담함) — 비브란트, 눈에 띄는, 에너지 넘침
  // ═══════════════════════════════════════════════════════════════════════
  COLOR: [
    {
      fontFamily: 'Black Han Sans',
      categories: ['COLOR', 'VARIETY'],
      reasoning: '극강의 굵기와 인파(영향력). 한 글자만으로도 화면을 점유. 최고의 임팩트. 예능, 게임 자막 킹',
      weight: 400,
      usage: '예능 쇼핑 자막, 게임 모드 대사'
    },
    {
      fontFamily: 'GMarketSans',
      categories: ['COLOR'],
      reasoning: '쿠팡, G마켓 광고에서 유명한 굵고 생생한 폰트. 쇼핑 광고의 표준. 대담하고 명확',
      weight: 700,
      usage: '쇼핑 추천 자막'
    },
    {
      fontFamily: 'Do Hyeon',
      categories: ['COLOR', 'STYLE'],
      reasoning: '둥글고 통통한 느낌의 디스플레이 폰트. 밝고 긍정적 에너지. 꼬들꼬들한 매력',
      weight: 400,
      usage: '밝은 분위기 자막, 키즈 콘텐츠'
    },
    {
      fontFamily: 'Jua',
      categories: ['COLOR', 'VARIETY'],
      reasoning: '크레용으로 그린 듯한 귀여운 필기체. 생생하고 따뜻함. 감성 쇼츠에 탁월',
      weight: 400,
      usage: '감성 자막, 예능 장난 자막'
    },
    {
      fontFamily: 'YeogiOttaeJalnan',
      categories: ['COLOR', 'VARIETY'],
      reasoning: '여기어때 광고에 나오는 장난기 많은 디스플레이 폰트. 화사하고 대담. 예능 최강',
      weight: 400,
      usage: '예능 자막, 광고 추천문'
    },
    {
      fontFamily: 'Cafe24Dangdanghae',
      categories: ['COLOR', 'VARIETY'],
      reasoning: '자신감 넘치는 필기체. 밝고 명랑함. 광고, 예능 마다보다 최고의 선택',
      weight: 400,
      usage: '예능 댄스, 쇼핑 추천'
    },
    {
      fontFamily: 'Cafe24Surround',
      categories: ['COLOR'],
      reasoning: '둘러싼 듯한 귀여운 폰트. 밝고 생생한 에너지. 상업 광고의 표준',
      weight: 400,
      usage: '상업 광고 자막'
    },
    {
      fontFamily: 'TmonMonsori',
      categories: ['COLOR', 'VARIETY'],
      reasoning: '티몬 광고의 상징 폰트. 대담하고 장난스러운 느낌. 온라인 쇼핑 자막',
      weight: 400,
      usage: '쇼핑몰 광고, 예능 추천'
    },
    {
      fontFamily: 'GabiaBombaram',
      categories: ['COLOR'],
      reasoning: '가비아의 밝고 통통한 폰트. 생생한 색감 느낌. 광고와 마케팅 최적',
      weight: 400,
      usage: '광고 제목, 상품 추천'
    },
    {
      fontFamily: 'Isamanru',
      categories: ['COLOR'],
      reasoning: '동쪽 라이온스(야구팀) 선수들 이름으로 유명한 대담한 폰트. 스포츠 에너지',
      weight: 700,
      usage: '스포츠 자막, 게임 점수'
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 3. STYLE (창의적 효과 — 네온, 글래스, 레트로, 아트)
  // ═══════════════════════════════════════════════════════════════════════
  STYLE: [
    {
      fontFamily: 'CookieRun',
      categories: ['STYLE', 'VARIETY'],
      reasoning: '쿠키런 게임의 시그니처 폰트. 둥글고 장난스러우면서도 강한 아이덴티티. 게임, 캐릭터 자막',
      weight: 400,
      usage: '게임 모드 자막, 캐릭터 이름'
    },
    {
      fontFamily: 'MapleStory',
      categories: ['STYLE', 'VARIETY'],
      reasoning: '메이플스토리 게임 폰트. 픽셀아트와 디지털 게임 느낌. 레트로 매력',
      weight: 400,
      usage: '게임 자막, 레트로 스타일'
    },
    {
      fontFamily: 'Dokdo',
      categories: ['STYLE'],
      reasoning: '독도 손글씨 스타일. 자유로운 필기 아트. 손으로 그린 느낌의 창의적 자막',
      weight: 400,
      usage: '아트 자막, 창의 표현'
    },
    {
      fontFamily: 'East Sea Dokdo',
      categories: ['STYLE'],
      reasoning: '동해 독도의 아트 버전. 더 자유롭고 예술적. 감성 미니멀 자막',
      weight: 400,
      usage: '감성 아트 자막'
    },
    {
      fontFamily: 'Poor Story',
      categories: ['STYLE'],
      reasoning: '이야기 풍자체. 불규칙하고 창의적. 만화, 일러스트 느낌 자막',
      weight: 400,
      usage: '만화풍 자막, 창의 표현'
    },
    {
      fontFamily: 'Yeon Sung',
      categories: ['STYLE'],
      reasoning: '연성 손글씨. 우아하면서도 예술적. 복고 영상, 감성 자막',
      weight: 400,
      usage: '감성 영상 자막, 복고풍'
    },
    {
      fontFamily: 'NexonLv1Gothic',
      categories: ['STYLE'],
      reasoning: '넥슨의 게임용 고딕. 게임, 웹툰 폰트. 디지털 아트 자막',
      weight: 400,
      usage: '게임 인터페이스 자막'
    },
    {
      fontFamily: 'NexonLv2Gothic',
      categories: ['STYLE'],
      reasoning: '더 세련된 넥슨 고딕. 모던 게임 UI. 웹툰 자막',
      weight: 400,
      usage: '웹툰 자막, 디지털 아트'
    },
    {
      fontFamily: 'WavvePADO',
      categories: ['STYLE'],
      reasoning: '웨이브 스트리밍의 서비스용 폰트. 부드럽고 현대적 아트. 영상 플랫폼 느낌',
      weight: 400,
      usage: '플랫폼 자막, 모던 아트'
    },
    {
      fontFamily: 'Galmuri11',
      categories: ['STYLE'],
      reasoning: '픽셀 폰트 (11px 기준). 8-bit 레트로 게임 스타일. 뉴트로, 복고 미학',
      weight: 400,
      usage: '레트로 게임 자막, 뉴트로'
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 4. VARIETY (한국 예능 — 장난기 많고, 대담하고, 재밌음)
  // ═══════════════════════════════════════════════════════════════════════
  VARIETY: [
    {
      fontFamily: 'ONEMobilePOP',
      categories: ['VARIETY'],
      reasoning: '원 모바일 팝. 팝콘처럼 튀어나오는 느낌의 예능 폰트. 예능 자막의 정통성',
      weight: 400,
      usage: '라이브 예능 반응 자막'
    },
    {
      fontFamily: 'ONEMobileTitle',
      categories: ['VARIETY'],
      reasoning: '원 모바일 제목용. 예능 프로그램 제목 폰트. 장난스럽고 임팩트',
      weight: 400,
      usage: '예능 타이틀, 반응 자막'
    },
    {
      fontFamily: 'HakgyoansimGaeulsopung',
      categories: ['VARIETY'],
      reasoning: '학교안심의 가을숲. 손글씨 느낌이면서도 예능스러운 불규칙성. 케주얼 예능',
      weight: 400,
      usage: '라이브 반응, 캐주얼 자막'
    },
    {
      fontFamily: 'HakgyoansimDoldam',
      categories: ['VARIETY'],
      reasoning: '학교안심 돌담. 더 제약적이고 특성 있는 손글씨. 예능 캐릭터 자막',
      weight: 400,
      usage: '캐릭터 대사, 장난 자막'
    },
    {
      fontFamily: 'BMEuljiro',
      categories: ['VARIETY'],
      reasoning: 'BM의 을지로. 거리감 있는 손글씨 느낌. 도시적 예능 자막',
      weight: 400,
      usage: '거리 인터뷰, 반응 자막'
    },
    {
      fontFamily: 'BMEuljirooraeorae',
      categories: ['VARIETY'],
      reasoning: 'BM 을지로 스타일의 더 특성 있는 버전. 장난스럽고 통통한 느낌',
      weight: 400,
      usage: '예능 장난 자막, 반응'
    },
    {
      fontFamily: 'GabiaSolmee',
      categories: ['VARIETY'],
      reasoning: '가비아 솔미. 귀엽고 통통한 손글씨. 감성 예능, 가족 콘텐츠',
      weight: 400,
      usage: '감성 예능, 가족 자막'
    },
    {
      fontFamily: 'GyeonggiTitle',
      categories: ['VARIETY'],
      reasoning: '경기도청 제목용. 공식이면서도 예능스러운 느낌. 지역 방송 표준',
      weight: 400,
      usage: '지역 방송 자막, 타이틀'
    },
    {
      fontFamily: 'InkLipquid',
      categories: ['VARIETY'],
      reasoning: '잉크 액체. 필기구로 긋은 듯한 자유로운 느낌. 창의 예능 자막',
      weight: 400,
      usage: '창의 콘텐츠 자막'
    },
    {
      fontFamily: 'YES24',
      categories: ['VARIETY'],
      reasoning: '예스24 서점 폰트. 상업이면서도 예능스러운 느낌. 쇼핑 예능',
      weight: 400,
      usage: '쇼핑 예능, 상품 자막'
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 5. EMOTION (감정적, 영화적, 분위기 있음)
  // ═══════════════════════════════════════════════════════════════════════
  EMOTION: [
    {
      fontFamily: 'Nanum Pen Script',
      categories: ['EMOTION'],
      reasoning: '나눔 펜글씨. 부드럽고 인간적인 느낌. 감정 서사, 편지 같은 자막',
      weight: 400,
      usage: '감정 편지 자막, 서사'
    },
    {
      fontFamily: 'Nanum Brush Script',
      categories: ['EMOTION'],
      reasoning: '나눔 붓글씨. 전통적이고 우아함. 한국 영화, 사극 자막',
      weight: 400,
      usage: '사극 자막, 전통 감성'
    },
    {
      fontFamily: 'Gamja Flower',
      categories: ['EMOTION'],
      reasoning: '감자꽃 손글씨. 부드럽고 감성적. 감정 영상, 뮤직비디오 자막',
      weight: 400,
      usage: '뮤직비디오 자막, 감성'
    },
    {
      fontFamily: 'Gaegu',
      categories: ['EMOTION'],
      reasoning: '개구손글씨. 편안하고 따뜻한 감정. 라이프스타일, 가족 자막',
      weight: 400,
      usage: '따뜻한 감정 자막'
    },
    {
      fontFamily: 'Hi Melody',
      categories: ['EMOTION'],
      reasoning: '하이 멜로디. 음악같이 흐르는 손글씨. 영상미 강조, 뮤직 자막',
      weight: 400,
      usage: '뮤직비디오, 감정 영상'
    },
    {
      fontFamily: 'MapoBackpacking',
      categories: ['EMOTION'],
      reasoning: '마포 배낭여행. 여행과 감정의 기록. 여행 영상, 감정 다큐',
      weight: 400,
      usage: '여행 일상 자막, 감정'
    },
    {
      fontFamily: 'MapoGeumbitnaru',
      categories: ['EMOTION'],
      reasoning: '마포 금빛나루. 노스탤직한 감정. 추억, 감정 기록 자막',
      weight: 400,
      usage: '추억 자막, 감정 표현'
    },
    {
      fontFamily: 'MapoHongdaeFreedom',
      categories: ['EMOTION'],
      reasoning: '마포 홍대 자유. 자유로운 감정표현. 예술, 감정 영상',
      weight: 400,
      usage: '예술 감정 자막'
    },
    {
      fontFamily: 'Cafe24Anemone',
      categories: ['EMOTION'],
      reasoning: '카페24 아네모네. 꽃 이름처럼 섬세한 감정. 감성 콘텐츠',
      weight: 400,
      usage: '감성 일상 자막'
    },
    {
      fontFamily: 'Cafe24ShiningStar',
      categories: ['EMOTION'],
      reasoning: '카페24 빛나는별. 희망찬 감정, 꿈. 동기부여, 감성 자막',
      weight: 400,
      usage: '희망 감성 자막'
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 6. CINEMATIC (영화, 드라마, 다큐 — 진지하고 깊이 있음)
  // ═══════════════════════════════════════════════════════════════════════
  CINEMATIC: [
    {
      fontFamily: 'Noto Serif KR',
      categories: ['CINEMATIC'],
      reasoning: '구글 명조 폰트. 영화 자막, 문학적 깊이. 드라마, 다큐의 표준',
      weight: 400,
      usage: '영화 자막, 다큐 내레이션'
    },
    {
      fontFamily: 'Nanum Myeongjo',
      categories: ['CINEMATIC'],
      reasoning: '나눔 명조. 전통 인쇄 느낌. 고급 드라마, 역사 다큐',
      weight: 400,
      usage: '사극 드라마, 문학 자막'
    },
    {
      fontFamily: 'Gowun Batang',
      categories: ['CINEMATIC'],
      reasoning: '고운 바탕. 우아하고 읽기 편한 바탕. 영화 서사',
      weight: 400,
      usage: '영화 내레이션 자막'
    },
    {
      fontFamily: 'Hahmlet',
      categories: ['CINEMATIC'],
      reasoning: '함렛 명조. 세리프 폰트로 진지함과 우아함. 고전 드라마',
      weight: 400,
      usage: '고전 드라마 자막'
    },
    {
      fontFamily: 'KoPubBatang',
      categories: ['CINEMATIC'],
      reasoning: '코픔 바탕. 공식 바탕 폰트. 정부 다큐, 공식 기록',
      weight: 400,
      usage: '다큐멘터리 내레이션'
    },
    {
      fontFamily: 'SunBatang',
      categories: ['CINEMATIC'],
      reasoning: '손바탕. 손글씨 바탕체. 회상 장면, 옛날 느낌',
      weight: 400,
      usage: '회상 장면 자막'
    },
    {
      fontFamily: 'GyeonggiBatang',
      categories: ['CINEMATIC'],
      reasoning: '경기 바탕. 지역의 바탕체. 지역 다큐, 시골 배경 영화',
      weight: 400,
      usage: '지역 다큐 자막'
    },
    {
      fontFamily: 'SpoqaHanSansNeo',
      categories: ['CINEMATIC'],
      reasoning: '스포카 한 산스. 모던하면서도 깊이 있는 고딕. 현대 드라마',
      weight: 400,
      usage: '현대 드라마 자막'
    },
    {
      fontFamily: 'SeoulNamesan',
      categories: ['CINEMATIC'],
      reasoning: '서울 남산체. 서울의 지역 정체성. 현대 도시 드라마',
      weight: 400,
      usage: '도시 드라마 자막'
    },
    {
      fontFamily: 'TwayAir',
      categories: ['CINEMATIC'],
      reasoning: '티웨이항공 폰트. 미니멀하면서도 영화적. 다큐 내레이션',
      weight: 400,
      usage: '미니멀 다큐 자막'
    }
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // 7. NOBG (배경 없음 — 아웃라인, 섀도우 의존)
  // ═══════════════════════════════════════════════════════════════════════
  NOBG: [
    {
      fontFamily: 'HakgyoansimWooju',
      categories: ['NOBG'],
      reasoning: '학교안심 우주. 둥글고 스트로크 효과에 강한 글씨. 아웃라인 강조',
      weight: 400,
      usage: '아웃라인 자막, 배경 없는 텍스트'
    },
    {
      fontFamily: 'HakgyoansimButpen',
      categories: ['NOBG'],
      reasoning: '학교안심 붓펜. 기하학적이면서 강한 아웃라인. 섀도우 효과 우수',
      weight: 400,
      usage: '섀도우 자막'
    },
    {
      fontFamily: 'Cafe24Dongdong',
      categories: ['NOBG'],
      reasoning: '카페24 동동. 둥근 문자로 아웃라인이 두드러짐. 배경 색상과의 대비',
      weight: 400,
      usage: '색상 아웃라인 자막'
    },
    {
      fontFamily: 'Cafe24Ssukssuk',
      categories: ['NOBG'],
      reasoning: '카페24 쑥쑥. 타이트한 글자로 아웃라인 최적화. 배경 강조',
      weight: 400,
      usage: '강한 아웃라인 자막'
    },
    {
      fontFamily: 'Cafe24Danjunghae',
      categories: ['NOBG'],
      reasoning: '카페24 단정해. 정돈된 글자로 섀도우 효과. 깨끗한 배경리스',
      weight: 400,
      usage: '깨끗한 아웃라인 자막'
    },
    {
      fontFamily: 'KCCEunyeong',
      categories: ['NOBG'],
      reasoning: '케이씨씨 은영. 손글씨 스타일로 아웃라인 효과 강함',
      weight: 400,
      usage: '손글씨 아웃라인 자막'
    },
    {
      fontFamily: 'OmyuDayeppeum',
      categories: ['NOBG'],
      reasoning: '오미유 대엽음. 둥글고 강한 스트로크. 섀도우에 우수',
      weight: 400,
      usage: '둥근 섀도우 자막'
    },
    {
      fontFamily: 'OngleipEoyeonce',
      categories: ['NOBG'],
      reasoning: '옹렐이프 어여온스. 특성 있는 필기로 아웃라인 강조',
      weight: 400,
      usage: '특성 아웃라인 자막'
    },
    {
      fontFamily: 'BinggraeTaom',
      categories: ['NOBG'],
      reasoning: '빙그레 타옴. 귀여운 아웃라인. 배경 없이도 가시성 우수',
      weight: 400,
      usage: '귀여운 배경리스 자막'
    },
    {
      fontFamily: 'PilseungGothic',
      categories: ['NOBG'],
      reasoning: '필승 고딕. 강한 스트로크의 고딕. 배경 색상과의 대비 최대',
      weight: 700,
      usage: '강한 아웃라인 고딕 자막'
    }
  ]
};

// ─── 스타일별 추천 조합 ───
export const STYLE_COMBINATIONS = {
  BASIC_WITH_EMOTION: ['Pretendard', 'Noto Sans KR', 'Nanum Pen Script'],
  COLOR_WITH_VARIETY: ['Black Han Sans', 'Do Hyeon', 'CookieRun'],
  CINEMATIC_WITH_EMOTION: ['Noto Serif KR', 'Nanum Myeongjo', 'MapoBackpacking'],
  NOBG_STRONG: ['HakgyoansimWooju', 'HakgyoansimButpen', 'PilseungGothic'],
};

// ─── 시각적 다양성 인덱스 ───
// 각 폰트가 몇 개 카테고리에 배치되었는지 추적 (2-3개 이상 이어야 함)
export const FONT_DIVERSITY_TRACKER: Record<string, number> = {
  'Pretendard': 1,
  'Noto Sans KR': 1,
  'Black Han Sans': 2,  // BASIC, VARIETY
  'Do Hyeon': 2,        // COLOR, STYLE
  'CookieRun': 2,       // STYLE, VARIETY
  'MapoBackpacking': 1,
  'Noto Serif KR': 1,
  // ... (총 70개 폰트, 최대 3개까지만 중복)
};

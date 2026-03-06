// ─── 폰트 라이브러리 (145개: Google Fonts 41 + 눈누 Noonnu 103 + Local 1) ───

export type FontSource = 'google' | 'noonnu' | 'local';
export type FontCategory = 'gothic' | 'serif' | 'display' | 'handwriting' | 'art' | 'pixel';

export interface FontEntry {
  id: string;
  name: string;            // 한국어 표시명
  fontFamily: string;      // CSS font-family 값
  category: FontCategory;
  source: FontSource;
  weights: number[];       // 사용 가능한 font-weight
  googleId?: string;       // Google Fonts 전용 (e.g. 'Noto+Sans+KR')
  noonnu?: {               // 눈누 전용
    urls: { weight: number; url: string }[];
  };
  preview?: string;        // 미리보기 텍스트 (없으면 기본값)
}

export const FONT_LIBRARY: FontEntry[] = [
  // ═══════════════════════════════════════
  // A. 기본 고딕 (gothic)
  // ═══════════════════════════════════════
  {
    id: 'pretendard',
    name: '프리텐다드',
    fontFamily: 'Pretendard',
    category: 'gothic',
    source: 'local',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    id: 'noto-sans-kr',
    name: 'Noto Sans KR',
    fontFamily: 'Noto Sans KR',
    category: 'gothic',
    source: 'google',
    weights: [300, 400, 500, 700, 900],
    googleId: 'Noto+Sans+KR',
  },
  {
    id: 'gothic-a1',
    name: 'Gothic A1',
    fontFamily: 'Gothic A1',
    category: 'gothic',
    source: 'google',
    weights: [300, 400, 500, 700, 900],
    googleId: 'Gothic+A1',
  },
  {
    id: 'ibm-plex-sans-kr',
    name: 'IBM Plex Sans KR',
    fontFamily: 'IBM Plex Sans KR',
    category: 'gothic',
    source: 'google',
    weights: [300, 400, 500, 600, 700],
    googleId: 'IBM+Plex+Sans+KR',
  },
  {
    id: 'suit',
    name: 'SUIT (수트)',
    fontFamily: 'Suit',
    category: 'gothic',
    source: 'noonnu',
    weights: [400, 700, 900],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_suit@1.0/SUIT-Regular.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_suit@1.0/SUIT-Bold.woff2' },
        { weight: 900, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_suit@1.0/SUIT-Heavy.woff2' },
      ],
    },
  },
  {
    id: 'escoredream',
    name: 'S-CoreDream',
    fontFamily: 'Escoredream',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 400, 600, 700, 900],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-3Light.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-4Regular.woff' },
        { weight: 600, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-6Bold.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-7ExtraBold.woff' },
        { weight: 900, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_six@1.2/S-CoreDream-9Black.woff' },
      ],
    },
  },
  {
    id: 'nanum-square-neo',
    name: '나눔스퀘어 네오',
    fontFamily: 'NanumSquareNeo',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 400, 700, 800, 900],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-aLt.woff2' },
        { weight: 400, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-bRg.woff2' },
        { weight: 700, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-cBd.woff2' },
        { weight: 800, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-dEb.woff2' },
        { weight: 900, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareNeo/NanumSquareNeoTTF-eHv.woff2' },
      ],
    },
  },
  {
    id: 'nanum-square-round',
    name: '나눔스퀘어라운드',
    fontFamily: 'NanumSquareRound',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/NanumSquareRound.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // B. 명조/바탕 (serif)
  // ═══════════════════════════════════════
  {
    id: 'noto-serif-kr',
    name: 'Noto Serif KR',
    fontFamily: 'Noto Serif KR',
    category: 'serif',
    source: 'google',
    weights: [400, 600, 700, 900],
    googleId: 'Noto+Serif+KR',
  },
  {
    id: 'nanum-myeongjo',
    name: '나눔명조',
    fontFamily: 'Nanum Myeongjo',
    category: 'serif',
    source: 'google',
    weights: [400, 700, 800],
    googleId: 'Nanum+Myeongjo',
  },
  {
    id: 'gowun-dodum',
    name: '고운돋움',
    fontFamily: 'Gowun Dodum',
    category: 'serif',
    source: 'google',
    weights: [400],
    googleId: 'Gowun+Dodum',
  },
  {
    id: 'gowun-batang',
    name: '고운바탕',
    fontFamily: 'Gowun Batang',
    category: 'serif',
    source: 'google',
    weights: [400, 700],
    googleId: 'Gowun+Batang',
  },
  {
    id: 'hahmlet',
    name: 'Hahmlet',
    fontFamily: 'Hahmlet',
    category: 'serif',
    source: 'google',
    weights: [400, 500, 700, 900],
    googleId: 'Hahmlet',
  },
  {
    id: 'ridibatang',
    name: '리디바탕',
    fontFamily: 'Ridibatang',
    category: 'serif',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/RIDIBatang.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // C. 임팩트/제목용 (display)
  // ═══════════════════════════════════════
  {
    id: 'black-han-sans',
    name: 'Black Han Sans',
    fontFamily: 'Black Han Sans',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Black+Han+Sans',
  },
  {
    id: 'do-hyeon',
    name: '도현',
    fontFamily: 'Do Hyeon',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Do+Hyeon',
  },
  {
    id: 'jua',
    name: '주아',
    fontFamily: 'Jua',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Jua',
  },
  {
    id: 'jalnan',
    name: '여기어때 잘난체',
    fontFamily: 'YeogiOttaeJalnan',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_four@1.2/JalnanOTF00.woff' },
      ],
    },
  },
  {
    id: 'gmarket-sans',
    name: 'G마켓 산스',
    fontFamily: 'GMarketSans',
    category: 'display',
    source: 'noonnu',
    weights: [300, 500, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansLight.woff' },
        { weight: 500, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansMedium.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/GmarketSansBold.woff' },
      ],
    },
  },
  {
    id: 'cafe24-surround',
    name: '카페24 써라운드',
    fontFamily: 'Cafe24Surround',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/Cafe24Ssurround.woff' },
      ],
    },
  },
  {
    id: 'cafe24-dangdanghae',
    name: '카페24 당당해',
    fontFamily: 'Cafe24Dangdanghae',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.2/Cafe24Dangdanghae.woff' },
      ],
    },
  },
  {
    id: 'isamanru',
    name: '이사만루',
    fontFamily: 'Isamanru',
    category: 'display',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-10@1.0/GongGothicLight.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-10@1.0/GongGothicMedium.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-10@1.0/GongGothicBold.woff' },
      ],
    },
  },
  {
    id: 'hanna-pro',
    name: '한나 프로 (배민)',
    fontFamily: 'HannaPro',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_seven@1.0/BMHANNAPro.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // D. 손글씨/감성 (handwriting)
  // ═══════════════════════════════════════
  {
    id: 'nanum-pen',
    name: '나눔 펜글씨',
    fontFamily: 'Nanum Pen Script',
    category: 'handwriting',
    source: 'google',
    weights: [400],
    googleId: 'Nanum+Pen+Script',
  },
  {
    id: 'nanum-brush',
    name: '나눔 붓글씨',
    fontFamily: 'Nanum Brush Script',
    category: 'handwriting',
    source: 'google',
    weights: [400],
    googleId: 'Nanum+Brush+Script',
  },
  {
    id: 'gaegu',
    name: '개구',
    fontFamily: 'Gaegu',
    category: 'handwriting',
    source: 'google',
    weights: [300, 400, 700],
    googleId: 'Gaegu',
  },
  {
    id: 'gamja-flower',
    name: '감자꽃',
    fontFamily: 'Gamja Flower',
    category: 'handwriting',
    source: 'google',
    weights: [400],
    googleId: 'Gamja+Flower',
  },
  {
    id: 'hi-melody',
    name: '하이멜로디',
    fontFamily: 'Hi Melody',
    category: 'handwriting',
    source: 'google',
    weights: [400],
    googleId: 'Hi+Melody',
  },
  {
    id: 'mapo-geumbitnaru',
    name: '마포금빛나루',
    fontFamily: 'MapoGeumbitnaru',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://gcore.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/MapoGoldenPierA.woff' },
      ],
    },
  },
  {
    id: 'cafe24-anemone',
    name: '카페24 아네모네',
    fontFamily: 'Cafe24Anemone',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/Cafe24Ohsquare.woff' },
      ],
    },
  },
  {
    id: 'cafe24-shiningstar',
    name: '카페24 빛나는별',
    fontFamily: 'Cafe24ShiningStar',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Shiningstar.woff' },
      ],
    },
  },
  {
    id: 'godo-maum',
    name: '고도마음체',
    fontFamily: 'GodoMaum',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/godoMaum.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // E. 아트/특수 (art)
  // ═══════════════════════════════════════
  {
    id: 'dokdo',
    name: '독도',
    fontFamily: 'Dokdo',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Dokdo',
  },
  {
    id: 'poor-story',
    name: '풍자',
    fontFamily: 'Poor Story',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Poor+Story',
  },
  {
    id: 'east-sea-dokdo',
    name: '동해독도',
    fontFamily: 'East Sea Dokdo',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'East+Sea+Dokdo',
  },
  {
    id: 'yeon-sung',
    name: '연성',
    fontFamily: 'Yeon Sung',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Yeon+Sung',
  },
  {
    id: 'cookierun',
    name: '쿠키런',
    fontFamily: 'CookieRun',
    category: 'art',
    source: 'noonnu',
    weights: [400, 700, 900],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/CookieRun-Regular.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/CookieRunOTF-Bold00.woff' },
        { weight: 900, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/CookieRunOTF-Black00.woff' },
      ],
    },
  },
  {
    id: 'recipekorea',
    name: '레코체',
    fontFamily: 'Recipekorea',
    category: 'art',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/Recipekorea.woff' },
      ],
    },
  },
  {
    id: 'manhwa',
    name: '만화진흥원체',
    fontFamily: 'ManhwaPromotionAgency',
    category: 'art',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_seven@1.2/KOMACON.woff' },
      ],
    },
  },
  {
    id: 'neo-donggeunmo',
    name: '네오둥근모 (픽셀)',
    fontFamily: 'NeoDonggeunmo',
    category: 'pixel',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.3/NeoDunggeunmo.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // F. 기타 (Google Fonts)
  // ═══════════════════════════════════════
  {
    id: 'song-myung',
    name: '송명',
    fontFamily: 'Song Myung',
    category: 'serif',
    source: 'google',
    weights: [400],
    googleId: 'Song+Myung',
  },
  {
    id: 'sunflower',
    name: '해바라기',
    fontFamily: 'Sunflower',
    category: 'display',
    source: 'google',
    weights: [300, 500, 700],
    googleId: 'Sunflower',
  },
  {
    id: 'stylish',
    name: '스타일리시',
    fontFamily: 'Stylish',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Stylish',
  },
  {
    id: 'single-day',
    name: '싱글데이',
    fontFamily: 'Single Day',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Single+Day',
  },
  {
    id: 'orbit',
    name: 'Orbit',
    fontFamily: 'Orbit',
    category: 'gothic',
    source: 'google',
    weights: [400],
    googleId: 'Orbit',
  },
  // ═══════════════════════════════════════
  // G. 추가 고딕 (gothic) — 40종 추가
  // ═══════════════════════════════════════
  {
    id: 'nanum-gothic',
    name: '나눔고딕',
    fontFamily: 'Nanum Gothic',
    category: 'gothic',
    source: 'google',
    weights: [400, 700, 800],
    googleId: 'Nanum+Gothic',
  },
  {
    id: 'lineseed-kr',
    name: '라인시드',
    fontFamily: 'LINESeedKR',
    category: 'gothic',
    source: 'noonnu',
    weights: [100, 400, 700],
    noonnu: {
      urls: [
        { weight: 100, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_11-01@1.0/LINESeedKR-Th.woff2' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_11-01@1.0/LINESeedKR-Rg.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_11-01@1.0/LINESeedKR-Bd.woff2' },
      ],
    },
  },
  {
    id: 'nexon-lv1',
    name: '넥슨 Lv1 고딕',
    fontFamily: 'NexonLv1Gothic',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/NEXON%20Lv1%20Gothic%20OTF%20Light.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/NEXON%20Lv1%20Gothic%20OTF.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/NEXON%20Lv1%20Gothic%20OTF%20Bold.woff' },
      ],
    },
  },
  {
    id: 'nexon-lv2',
    name: '넥슨 Lv2 고딕',
    fontFamily: 'NexonLv2Gothic',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/NEXON%20Lv2%20Gothic%20Light.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/NEXON%20Lv2%20Gothic.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/NEXON%20Lv2%20Gothic%20Bold.woff' },
      ],
    },
  },
  {
    id: 'kopub-dotum',
    name: 'KoPub 돋움',
    fontFamily: 'KoPubDotum',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/KoPubDotumMedium.woff' },
      ],
    },
  },
  {
    id: 'kbo-diamond',
    name: 'KBO 다이아고딕',
    fontFamily: 'KBODiaGothic',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 500, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2304-2@1.0/KBO-Dia-Gothic_light.woff' },
        { weight: 500, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2304-2@1.0/KBO-Dia-Gothic_medium.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2304-2@1.0/KBO-Dia-Gothic_bold.woff' },
      ],
    },
  },
  {
    id: 'leferi-point',
    name: '레페리포인트',
    fontFamily: 'LeferiPoint',
    category: 'gothic',
    source: 'noonnu',
    weights: [200, 700],
    noonnu: {
      urls: [
        { weight: 200, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/LeferiPoint-WhiteA.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/LeferiPoint-BlackA.woff' },
      ],
    },
  },
  {
    id: 'gangwon-edu',
    name: '강원교육모두체',
    fontFamily: 'GangwonEdu',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/GangwonEdu_OTFLightA.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/GangwonEdu_OTFBoldA.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // H. 추가 명조 (serif)
  // ═══════════════════════════════════════
  {
    id: 'maruburi',
    name: '마루부리',
    fontFamily: 'MaruBuri',
    category: 'serif',
    source: 'noonnu',
    weights: [300, 400, 600, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Light.woff2' },
        { weight: 400, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Regular.woff2' },
        { weight: 600, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-SemiBold.woff2' },
        { weight: 700, url: 'https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Bold.woff2' },
      ],
    },
  },
  {
    id: 'kopub-batang',
    name: 'KoPub 바탕',
    fontFamily: 'KoPubBatang',
    category: 'serif',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/KoPubBatangLight.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/KoPubBatangMedium.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/KoPubBatangBold.woff' },
      ],
    },
  },
  {
    id: 'cafe24-classic-type',
    name: '카페24 클래식타입',
    fontFamily: 'Cafe24ClassicType',
    category: 'serif',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2210-2@1.0/Cafe24ClassicType-Regular.woff2' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // I. 추가 임팩트/제목 (display)
  // ═══════════════════════════════════════
  {
    id: 'sb-aggro',
    name: '어그로체',
    fontFamily: 'SBAggroB',
    category: 'display',
    source: 'noonnu',
    weights: [300, 500, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/SBAggroL.woff' },
        { weight: 500, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/SBAggroM.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/SBAggroB.woff' },
      ],
    },
  },
  {
    id: 'jalnan-gothic',
    name: '잘난 고딕',
    fontFamily: 'JalnanGothic',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_231029@1.1/JalnanGothic.woff' },
      ],
    },
  },
  {
    id: 'lotteria-chab',
    name: '롯데리아 찹밥체',
    fontFamily: 'LOTTERIACHAB',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/LOTTERIACHAB.woff2' },
      ],
    },
  },
  {
    id: 'lotteria-ddag',
    name: '롯데리아 딱붙어체',
    fontFamily: 'LOTTERIADDAG',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/LOTTERIADDAG.woff2' },
      ],
    },
  },
  {
    id: 'ria-sans',
    name: '리아체',
    fontFamily: 'RiaSans',
    category: 'display',
    source: 'noonnu',
    weights: [800],
    noonnu: {
      urls: [
        { weight: 800, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2410-1@1.0/RiaSans-ExtraBold.woff2' },
      ],
    },
  },
  {
    id: 'taenada',
    name: '태나다체',
    fontFamily: 'Tenada',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2210-2@1.0/Tenada.woff2' },
      ],
    },
  },
  {
    id: 'yangjin',
    name: '양진체',
    fontFamily: 'Yangjin',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/supernovice-lab/font@0.9/yangjin.woff' },
      ],
    },
  },
  {
    id: 'sandoll-hobbang',
    name: '삼립호빵체',
    fontFamily: 'SDSamliphopangche',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts-20-12@1.0/SDSamliphopangche_Basic.woff' },
      ],
    },
  },
  {
    id: 'binggrae',
    name: '빙그레체',
    fontFamily: 'Binggrae',
    category: 'display',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/Binggrae.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2110@1.0/Binggrae-Bold.woff2' },
      ],
    },
  },
  {
    id: 'kotra-hope',
    name: '코트라 희망체',
    fontFamily: 'KOTRAHOPE',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2110@1.0/KOTRAHOPE.woff2' },
      ],
    },
  },
  {
    id: 'taebaek',
    name: '태백체',
    fontFamily: 'TAEBAEKfont',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2310@1.0/TAEBAEKfont.woff2' },
      ],
    },
  },
  {
    id: 'mbc-1961',
    name: 'MBC 1961체',
    fontFamily: 'MBC1961M',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2304-01@1.0/MBC1961M.woff2' },
      ],
    },
  },
  {
    id: 'cafe24-moyamoya',
    name: '카페24 모야모야',
    fontFamily: 'Cafe24Moyamoya',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_231029@1.1/Cafe24Moyamoya-Regular-v1.0.woff2' },
      ],
    },
  },
  {
    id: 'maplestory',
    name: '메이플스토리',
    fontFamily: 'MapleStory',
    category: 'display',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MapleStory.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MapleStoryBold.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // J. 추가 손글씨 (handwriting)
  // ═══════════════════════════════════════
  {
    id: 'cafe24-simple',
    name: '카페24 심플해',
    fontFamily: 'Cafe24Simplehae',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Simplehae.woff' },
      ],
    },
  },
  {
    id: 'cafe24-gowoonbam',
    name: '카페24 고운밤',
    fontFamily: 'Cafe24Oneprettynight',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Oneprettynight.woff' },
      ],
    },
  },
  {
    id: 'kcc-eunyeong',
    name: 'KCC 은영체',
    fontFamily: 'KCCEunyeong',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/KCC-eunyoung-Regular.woff' },
      ],
    },
  },
  {
    id: 'ongleip-eoyeonce',
    name: '온글잎 의연체',
    fontFamily: 'OngleipEoyeonce',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105@1.1/Uiyeun.woff' },
      ],
    },
  },
  {
    id: 'im-hyemin',
    name: 'IM 혜민체',
    fontFamily: 'IMHyemin',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2106@1.1/IM_Hyemin-Regular.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2106@1.1/IM_Hyemin-Bold.woff2' },
      ],
    },
  },
  {
    id: 'omyu-dayeppeum',
    name: '오뮤 다예쁨체',
    fontFamily: 'OmyuDayeppeum',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2304-01@1.0/omyu_pretty.woff2' },
      ],
    },
  },
  {
    id: 'mapo-flower',
    name: '마포 꽃섬',
    fontFamily: 'MapoFlowerIsland',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/MapoFlowerIslandA.woff' },
      ],
    },
  },
  {
    id: 'mapo-dacapo',
    name: '마포 다카포',
    fontFamily: 'MapoDacapo',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/MapoDacapoA.woff' },
      ],
    },
  },
  {
    id: 'dongle',
    name: '동글',
    fontFamily: 'Dongle',
    category: 'handwriting',
    source: 'google',
    weights: [300, 400, 700],
    googleId: 'Dongle',
  },

  // ═══════════════════════════════════════
  // K. 추가 아트/특수 (art)
  // ═══════════════════════════════════════
  {
    id: 'cute-font',
    name: '귀여운 체',
    fontFamily: 'Cute Font',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Cute+Font',
  },
  {
    id: 'gugi',
    name: '구기',
    fontFamily: 'Gugi',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Gugi',
  },
  {
    id: 'kirang-haerang',
    name: '기랑해랑',
    fontFamily: 'Kirang Haerang',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Kirang+Haerang',
  },
  {
    id: 'bw-picture',
    name: '흑백사진',
    fontFamily: 'Black and White Picture',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Black+And+White+Picture',
  },

  // ═══════════════════════════════════════
  // L. 추가 픽셀/레트로 (pixel)
  // ═══════════════════════════════════════
  {
    id: 'dnf-bitbit',
    name: '던파 비트비트',
    fontFamily: 'DNFBitBitv2',
    category: 'pixel',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-12@1.0/DNFBitBitv2.woff' },
      ],
    },
  },
  {
    id: 'dos-gothic',
    name: 'DOS 고딕',
    fontFamily: 'DOSGothic',
    category: 'pixel',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_eight@1.0/DOSGothic.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // M. 추가 60종 — Google Fonts (9)
  // ═══════════════════════════════════════
  {
    id: 'nanum-gothic-coding',
    name: '나눔고딕코딩',
    fontFamily: 'Nanum Gothic Coding',
    category: 'gothic',
    source: 'google',
    weights: [400, 700],
    googleId: 'Nanum+Gothic+Coding',
  },
  {
    id: 'bagel-fat-one',
    name: '베이글팻원',
    fontFamily: 'Bagel Fat One',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Bagel+Fat+One',
  },
  {
    id: 'gasoek-one',
    name: '가석원',
    fontFamily: 'Gasoek One',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Gasoek+One',
  },
  {
    id: 'moirai-one',
    name: '모이라이원',
    fontFamily: 'Moirai One',
    category: 'art',
    source: 'google',
    weights: [400],
    googleId: 'Moirai+One',
  },
  {
    id: 'grandiflora-one',
    name: '그란디플로라원',
    fontFamily: 'Grandiflora One',
    category: 'serif',
    source: 'google',
    weights: [400],
    googleId: 'Grandiflora+One',
  },
  {
    id: 'diphylleia',
    name: '디필레이아',
    fontFamily: 'Diphylleia',
    category: 'serif',
    source: 'google',
    weights: [400],
    googleId: 'Diphylleia',
  },
  {
    id: 'jeju-gothic',
    name: '제주고딕',
    fontFamily: 'Jeju Gothic',
    category: 'gothic',
    source: 'google',
    weights: [400],
    googleId: 'Jeju+Gothic',
  },
  {
    id: 'jeju-myeongjo',
    name: '제주명조',
    fontFamily: 'Jeju Myeongjo',
    category: 'serif',
    source: 'google',
    weights: [400],
    googleId: 'Jeju+Myeongjo',
  },
  {
    id: 'jeju-hallasan',
    name: '제주한라산',
    fontFamily: 'Jeju Hallasan',
    category: 'display',
    source: 'google',
    weights: [400],
    googleId: 'Jeju+Hallasan',
  },

  // ═══════════════════════════════════════
  // N. 추가 60종 — 눈누 고딕 (10)
  // ═══════════════════════════════════════
  {
    id: 'happiness-sans',
    name: '해피니스산스',
    fontFamily: 'HappinessSans',
    category: 'gothic',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2205@1.0/Happiness-Sans-Regular.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2205@1.0/Happiness-Sans-Bold.woff2' },
      ],
    },
  },
  {
    id: 'chosun-gulim',
    name: '조선굴림',
    fontFamily: 'ChosunGu',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/ChosunGu.woff' },
      ],
    },
  },
  {
    id: 'seoul-namsan',
    name: '서울남산',
    fontFamily: 'SeoulNamsan',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/SeoulNamsanM.woff' },
      ],
    },
  },
  {
    id: 'seoul-hangang',
    name: '서울한강',
    fontFamily: 'SeoulHangang',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/SeoulHangangM.woff' },
      ],
    },
  },
  {
    id: 'paperlogy',
    name: '페이퍼로지',
    fontFamily: 'Paperlogy',
    category: 'gothic',
    source: 'noonnu',
    weights: [400, 700, 900],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2' },
        { weight: 900, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-9Black.woff2' },
      ],
    },
  },
  {
    id: 'tway-air',
    name: '티웨이항공',
    fontFamily: 'TwayAir',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_tway@1.0/twayair.woff' },
      ],
    },
  },
  {
    id: 'paybooc',
    name: '페이북',
    fontFamily: 'Paybooc',
    category: 'gothic',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-07@1.0/paybooc-Medium.woff' },
      ],
    },
  },
  {
    id: 'spoqa-han-sans-neo',
    name: '스포카한산스네오',
    fontFamily: 'SpoqaHanSansNeo',
    category: 'gothic',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/SpoqaHanSansNeo-Light.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/SpoqaHanSansNeo-Regular.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2108@1.1/SpoqaHanSansNeo-Bold.woff' },
      ],
    },
  },
  {
    id: 'freesentation',
    name: '프리젠테이션',
    fontFamily: 'Freesentation',
    category: 'gothic',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2404@1.0/Freesentation-4Regular.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2404@1.0/Freesentation-7Bold.woff2' },
      ],
    },
  },
  {
    id: 'min-sans',
    name: '민산스',
    fontFamily: 'MinSans',
    category: 'gothic',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/MinSans-Regular.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/MinSans-Bold.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // O. 추가 60종 — 눈누 명조/바탕 (7)
  // ═══════════════════════════════════════
  {
    id: 'bookk-myungjo',
    name: '북크명조',
    fontFamily: 'BookkMyungjo',
    category: 'serif',
    source: 'noonnu',
    weights: [300, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/BookkMyungjo-Lt.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/BookkMyungjo-Bd.woff2' },
      ],
    },
  },
  {
    id: 'chosun-gs',
    name: '조선궁서',
    fontFamily: 'ChosunGs',
    category: 'serif',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/ChosunGs.woff' },
      ],
    },
  },
  {
    id: 'gyeonggi-batang',
    name: '경기바탕',
    fontFamily: 'GyeonggiBatang',
    category: 'serif',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/GyeonggiBatang.woff' },
      ],
    },
  },
  {
    id: 'sun-batang',
    name: '선바탕',
    fontFamily: 'SunBatang',
    category: 'serif',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_eight@1.0/SunBatang-Light.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_eight@1.0/SunBatang-Medium.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_eight@1.0/SunBatang-Bold.woff' },
      ],
    },
  },
  {
    id: 'suseong-batang',
    name: '수성바탕',
    fontFamily: 'SuseongBatang',
    category: 'serif',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2205@1.0/SuseongBatang.woff2' },
      ],
    },
  },
  {
    id: 'chosun-ilbo',
    name: '조선일보명조',
    fontFamily: 'ChosunIlbo',
    category: 'serif',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/Chosunilbo_myungjo.woff' },
      ],
    },
  },
  {
    id: 'yeolrin-myeongjo',
    name: '열린명조',
    fontFamily: 'YeolrinMyeongjo',
    category: 'serif',
    source: 'noonnu',
    weights: [300, 400, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/YeolrinMyeongjo-Light.woff' },
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/YeolrinMyeongjo-Medium.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/YeolrinMyeongjo-Bold.woff' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // P. 추가 60종 — 눈누 제목/임팩트 (16)
  // ═══════════════════════════════════════
  {
    id: 'hakgyoansim-gaeulsopung',
    name: '학교안심 가을소풍',
    fontFamily: 'HakgyoansimGaeulsopung',
    category: 'display',
    source: 'noonnu',
    weights: [300, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimGaeulsopungL.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimGaeulsopungB.woff2' },
      ],
    },
  },
  {
    id: 'hakgyoansim-doldam',
    name: '학교안심 돌담',
    fontFamily: 'HakgyoansimDoldam',
    category: 'display',
    source: 'noonnu',
    weights: [300, 500, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimDoldamL.woff2' },
        { weight: 500, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimDoldamM.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimDoldamB.woff2' },
      ],
    },
  },
  {
    id: 'bm-euljiro',
    name: '배민 을지로체',
    fontFamily: 'BMEuljiro',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/BMEULJIRO.woff' },
      ],
    },
  },
  {
    id: 'one-mobile-pop',
    name: 'ONE 모바일 POP',
    fontFamily: 'ONEMobilePOP',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/ONE-Mobile-POP.woff' },
      ],
    },
  },
  {
    id: 'one-mobile-title',
    name: 'ONE 모바일제목',
    fontFamily: 'ONEMobileTitle',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/ONE-Mobile-Title.woff' },
      ],
    },
  },
  {
    id: 'gabia-bombaram',
    name: '가비아 봄바람',
    fontFamily: 'GabiaBombaram',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/GabiaBombaram.woff' },
      ],
    },
  },
  {
    id: 'gabia-solmee',
    name: '가비아 솔미',
    fontFamily: 'GabiaSolmee',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/GabiaSolmee.woff' },
      ],
    },
  },
  {
    id: 'gyeonggi-title',
    name: '경기제목',
    fontFamily: 'GyeonggiTitle',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/GyeonggiTitleM.woff' },
      ],
    },
  },
  {
    id: 'ink-lipquid',
    name: '잉크립퀴드',
    fontFamily: 'InkLipquid',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_one@1.0/InkLipquid.woff' },
      ],
    },
  },
  {
    id: 'yes24',
    name: 'YES24체',
    fontFamily: 'YES24',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2110@1.0/YES24.woff2' },
      ],
    },
  },
  {
    id: 'tmon-monsori',
    name: '티몬몬소리',
    fontFamily: 'TmonMonsori',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/TmonMonsori.woff' },
      ],
    },
  },
  {
    id: 'sd-misaeng',
    name: '미생체',
    fontFamily: 'SDMiSaeng',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/SDMiSaeng.woff' },
      ],
    },
  },
  {
    id: 'pilseung-gothic',
    name: '필승고딕',
    fontFamily: 'PilseungGothic',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/PilseungGothic.woff2' },
      ],
    },
  },
  {
    id: 'bm-euljiro-oraeorae',
    name: '배민 을지로 오래오래',
    fontFamily: 'BMEuljirooraeorae',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2110@1.0/BMEuljirooraeorae.woff2' },
      ],
    },
  },
  {
    id: 'wavve-pado',
    name: '웨이브 파도',
    fontFamily: 'WavvePADO',
    category: 'display',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2404@1.0/WavvePADO-Regular.woff2' },
      ],
    },
  },
  {
    id: 'binggrae-taom',
    name: '빙그레 따옴',
    fontFamily: 'BinggraeTaom',
    category: 'display',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/BinggraeTaom.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/BinggraeTaom-Bold.woff2' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // Q. 추가 60종 — 눈누 손글씨 (11)
  // ═══════════════════════════════════════
  {
    id: 'mapo-backpacking',
    name: '마포 배낭여행',
    fontFamily: 'MapoBackpacking',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/MapoBackpackingA.woff' },
      ],
    },
  },
  {
    id: 'cafe24-supermagic',
    name: '카페24 슈퍼매직',
    fontFamily: 'Cafe24Supermagic',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/Cafe24Supermagic-Regular-v1.0.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/Cafe24Supermagic-Bold-v1.0.woff2' },
      ],
    },
  },
  {
    id: 'cafe24-dongdong',
    name: '카페24 동동',
    fontFamily: 'Cafe24Dongdong',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Dongdong.woff' },
      ],
    },
  },
  {
    id: 'cafe24-ssukssuk',
    name: '카페24 쑥쑥',
    fontFamily: 'Cafe24Ssukssuk',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Ssukssuk.woff' },
      ],
    },
  },
  {
    id: 'cafe24-danjunghae',
    name: '카페24 단정해',
    fontFamily: 'Cafe24Danjunghae',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.1/Cafe24Danjunghae.woff' },
      ],
    },
  },
  {
    id: 'nanum-barun-pen',
    name: '나눔 바른펜',
    fontFamily: 'NanumBarunpen',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_two@1.0/NanumBarunpen.woff' },
      ],
    },
  },
  {
    id: 'shindong-yup',
    name: '신동엽 손글씨',
    fontFamily: 'ShinDongYupHandwriting',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_231029@1.1/ShinDongYupHandwriting-R.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_231029@1.1/ShinDongYupHandwriting-B.woff2' },
      ],
    },
  },
  {
    id: 'kyobo-handwriting',
    name: '교보 손글씨',
    fontFamily: 'KyoboHandwriting',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/KyoboHand.woff' },
      ],
    },
  },
  {
    id: 'mapo-hongdae',
    name: '마포 홍대프리덤',
    fontFamily: 'MapoHongdaeFreedom',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/MapoHongdaeFreedomA.woff' },
      ],
    },
  },
  {
    id: 'hakgyoansim-wooju',
    name: '학교안심 우주',
    fontFamily: 'HakgyoansimWooju',
    category: 'handwriting',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimWoojuR.woff2' },
      ],
    },
  },
  {
    id: 'hakgyoansim-butpen',
    name: '학교안심 붓펜',
    fontFamily: 'HakgyoansimButpen',
    category: 'handwriting',
    source: 'noonnu',
    weights: [300, 500, 700],
    noonnu: {
      urls: [
        { weight: 300, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimButpenL.woff2' },
        { weight: 500, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimButpenM.woff2' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2307-2@1.0/HakgyoansimButpenB.woff2' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // R. 추가 60종 — 눈누 아트/특수 (5)
  // ═══════════════════════════════════════
  {
    id: 'tt-together',
    name: 'TT투게더',
    fontFamily: 'TTTogether',
    category: 'art',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/TTTogetherA.woff' },
      ],
    },
  },
  {
    id: 'sang-sang-rock',
    name: '상상체',
    fontFamily: 'SangSangRock',
    category: 'art',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2001@1.1/SangSangRockOTF.woff' },
      ],
    },
  },
  {
    id: 'tdtd-tadak',
    name: '타닥타닥',
    fontFamily: 'TDTDTadakTadak',
    category: 'art',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_twelve@1.0/TDTDTadakTadak.woff' },
      ],
    },
  },
  {
    id: 'elice-digital',
    name: '엘리스 디지털배움',
    fontFamily: 'EliceDigitalBaeum',
    category: 'art',
    source: 'noonnu',
    weights: [400, 700],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/EliceDigitalBaeum_Regular.woff' },
        { weight: 700, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/EliceDigitalBaeum_Bold.woff' },
      ],
    },
  },
  {
    id: 'dovemayo',
    name: '도베마요',
    fontFamily: 'Dovemayo',
    category: 'art',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2302@1.0/Dovemayo_wild.woff2' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // S. 추가 60종 — 눈누 픽셀/레트로 (2)
  // ═══════════════════════════════════════
  {
    id: 'galmuri11',
    name: '갈무리11',
    fontFamily: 'Galmuri11',
    category: 'pixel',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/Galmuri11.woff' },
      ],
    },
  },
  {
    id: 'galmuri9',
    name: '갈무리9',
    fontFamily: 'Galmuri9',
    category: 'pixel',
    source: 'noonnu',
    weights: [400],
    noonnu: {
      urls: [
        { weight: 400, url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2201-2@1.0/Galmuri9.woff' },
      ],
    },
  },
];

// ─── 카테고리 라벨 ───
export const FONT_CATEGORY_LABELS: Record<FontCategory | 'all', string> = {
  all: '전체',
  gothic: '고딕',
  serif: '명조/바탕',
  display: '제목/임팩트',
  handwriting: '손글씨/감성',
  art: '아트/특수',
  pixel: '픽셀/레트로',
};

// ─── 유틸: 카테고리별 필터 ───
export const getFontsByCategory = (cat: FontCategory | 'all'): FontEntry[] =>
  cat === 'all' ? FONT_LIBRARY : FONT_LIBRARY.filter((f) => f.category === cat);

// ─── 유틸: ID로 검색 ───
export const getFontById = (id: string): FontEntry | undefined =>
  FONT_LIBRARY.find((f) => f.id === id);

// ─── 유틸: fontFamily로 검색 ───
export const getFontByFamily = (family: string): FontEntry | undefined =>
  FONT_LIBRARY.find((f) => f.fontFamily === family);

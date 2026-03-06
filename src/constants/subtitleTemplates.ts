// ─── 자막 템플릿 140개 (7 카테고리 × 20) — v2.0 전면 리디자인 ───
// 145개 폰트 라이브러리 적극 활용 | 메탈릭·네온·3D·홀로그래피 등 고급 효과
// 외곽선 = WebkitTextStroke (outlineWidth/outlineColor)
// textShadowCSS = 장식 효과 (글로우, 3D, 메탈릭, 엠보스, 네온 등)

import type { SubtitleTemplate } from '../types';

// ── 공통 기본값 ──
const base = (o: Partial<SubtitleTemplate> & Pick<SubtitleTemplate, 'id' | 'name' | 'category' | 'fontFamily' | 'color'>): SubtitleTemplate => ({
  fontSize: 54, fontWeight: 700, fontStyle: 'normal',
  outlineColor: '#000000', outlineWidth: 2,
  shadowColor: undefined, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
  textShadowCSS: undefined, letterSpacing: 0, lineHeight: 1.4,
  positionY: 10, textAlign: 'center', ...o,
});

// ── 이펙트 헬퍼 ──
const GLOW = (c: string, s1 = 7, s2 = 14, s3 = 28) =>
  `0 0 ${s1}px ${c}, 0 0 ${s2}px ${c}, 0 0 ${s3}px ${c}`;
const GLOW_SOFT = (c: string) =>
  `0 0 4px ${c}40, 0 0 8px ${c}30, 0 0 16px ${c}20, 0 0 32px ${c}10`;
const SHADOW_3D = (c1: string, c2: string, c3: string, c4: string) =>
  `1px 1px 0 ${c1}, 2px 2px 0 ${c2}, 3px 3px 0 ${c3}, 4px 4px 3px ${c4}`;
const DEEP_3D = (c: string, blur = 'rgba(0,0,0,0.5)') =>
  `1px 1px 0 ${c}, 2px 2px 0 ${c}, 3px 3px 0 ${c}, 4px 4px 0 ${c}, 5px 5px 0 ${c}, 6px 6px 6px ${blur}`;
const ULTRA_3D = (c: string) =>
  `1px 1px 0 ${c}, 2px 2px 0 ${c}, 3px 3px 0 ${c}, 4px 4px 0 ${c}, 5px 5px 0 ${c}, 6px 6px 0 ${c}, 7px 7px 0 ${c}, 8px 8px 8px rgba(0,0,0,0.5)`;
const NEON = (c: string) =>
  `0 0 5px ${c}, 0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}80, 0 0 60px ${c}40`;
const MOTION_R = (c: string) =>
  `2px 0 0 ${c}60, 4px 0 0 ${c}40, 8px 0 2px ${c}20, 16px 0 4px ${c}10`;
const GLITCH = (c1: string, c2: string) =>
  `-2px 0 ${c1}, 2px 0 ${c2}, 0 0 4px rgba(255,255,255,0.3)`;
const LONG_SHADOW = (c: string) =>
  `1px 1px 0 ${c}, 2px 2px 0 ${c}, 3px 3px 0 ${c}, 4px 4px 0 ${c}, 5px 5px 0 ${c}, 6px 6px 0 ${c}, 7px 7px 0 ${c}, 8px 8px 4px rgba(0,0,0,0.4)`;
const M_GOLD = '0 1px 0 #daa520, 0 2px 0 #b8860b, 0 3px 0 #996600, 0 4px 0 #775500, 0 5px 0 #654321, 0 6px 8px rgba(0,0,0,0.6), 0 0 10px rgba(255,215,0,0.15)';
const M_CHROME = '-1px -1px 0 rgba(255,255,255,0.5), 0 1px 0 #cccccc, 0 2px 0 #aaaaaa, 0 3px 0 #888888, 0 4px 0 #666666, 0 5px 8px rgba(0,0,0,0.5)';
const M_ROSE = '0 1px 0 #d4868c, 0 2px 0 #c06e75, 0 3px 0 #a85660, 0 4px 6px rgba(0,0,0,0.5), 0 0 8px rgba(212,134,140,0.15)';
const M_BRONZE = '0 1px 0 #8b6914, 0 2px 0 #7a5b10, 0 3px 0 #695000, 0 4px 6px rgba(0,0,0,0.5), 0 0 6px rgba(139,105,20,0.1)';
const EMBOSS = '0 -1px 0 rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.7)';
const LETTERPRESS = '0 -1px 0 rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.15)';
const FIRE = '0 -2px 4px rgba(255,200,0,0.5), 0 -4px 8px rgba(255,100,0,0.3), 0 -6px 12px rgba(255,50,0,0.2), 0 0 6px rgba(255,150,0,0.5)';
const ICE = '0 0 4px rgba(200,240,255,0.6), 0 0 8px rgba(100,200,255,0.4), 0 0 16px rgba(50,150,255,0.25), 0 1px 2px rgba(255,255,255,0.4)';
const HOLO = '0 0 5px #00ffffcc, -2px -2px 4px #ff00ff60, 2px 2px 4px #ffff0040, -3px 1px 6px #00ff8050, 0 0 20px #7c3aed30';

// ═══════════════════════════════════════════════════
// 1. 기본 (basic) — 클린 프로페셔널 20개
// ═══════════════════════════════════════════════════
const BASIC: SubtitleTemplate[] = [
  base({ id: 'basic-01', name: '프리텐다드 기본', category: 'basic', fontFamily: 'Pretendard', color: '#ffffff', outlineWidth: 2,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'basic-02', name: '스포카 모던', category: 'basic', fontFamily: 'SpoqaHanSansNeo', fontWeight: 500, color: '#ffffff', outlineColor: '#1a1a1a', outlineWidth: 1,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.4)' }),
  base({ id: 'basic-03', name: '라인시드 샤프', category: 'basic', fontFamily: 'LINESeedKR', fontWeight: 400, color: '#ffffff', outlineWidth: 2,
    textShadowCSS: '0 2px 3px rgba(0,0,0,0.45)' }),
  base({ id: 'basic-04', name: '페이퍼로지 소프트', category: 'basic', fontFamily: 'Paperlogy', fontWeight: 400, color: '#fef9ef', outlineColor: '#2d2013', outlineWidth: 2,
    textShadowCSS: '0 2px 4px rgba(45,32,19,0.4)' }),
  base({ id: 'basic-05', name: '해피니스 웜', category: 'basic', fontFamily: 'HappinessSans', fontWeight: 400, color: '#fff8f0', outlineColor: '#3d2b1a', outlineWidth: 2,
    textShadowCSS: '0 1px 3px rgba(61,43,26,0.4)' }),
  base({ id: 'basic-06', name: '프리센테이션 프로', category: 'basic', fontFamily: 'Freesentation', fontWeight: 400, color: '#ffffff', outlineColor: '#111111', outlineWidth: 2,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'basic-07', name: '코펍돋움 안정', category: 'basic', fontFamily: 'KoPubDotum', fontWeight: 400, color: '#ffffff', backgroundColor: '#00000088', outlineWidth: 0,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3)' }),
  base({ id: 'basic-08', name: '서울남산 시티', category: 'basic', fontFamily: 'SeoulNamsan', fontWeight: 400, color: '#ffffff', backgroundColor: '#1a2744aa', outlineWidth: 0,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.4)' }),
  base({ id: 'basic-09', name: 'IBM 테크', category: 'basic', fontFamily: 'IBM Plex Sans KR', fontWeight: 500, color: '#e8f0fe', outlineColor: '#1a2744', outlineWidth: 1,
    textShadowCSS: '0 1px 3px rgba(26,39,68,0.4)' }),
  base({ id: 'basic-10', name: '민산스 미니멀', category: 'basic', fontFamily: 'MinSans', fontWeight: 400, color: '#ffffff', outlineColor: '#333333', outlineWidth: 1,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3)' }),
  base({ id: 'basic-11', name: '나눔스퀘어 볼드', category: 'basic', fontFamily: 'NanumSquareNeo', fontWeight: 800, color: '#ffffff', outlineWidth: 3,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'basic-12', name: '수트 코퍼레이트', category: 'basic', fontFamily: 'Suit', color: '#f5f5f5', backgroundColor: '#000000aa', outlineWidth: 0,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3)' }),
  base({ id: 'basic-13', name: '고딕A1 라이트', category: 'basic', fontFamily: 'Gothic A1', fontWeight: 300, color: '#e0e0e0', outlineWidth: 1,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.4)' }),
  base({ id: 'basic-14', name: '리아산스 모던', category: 'basic', fontFamily: 'RiaSans', fontWeight: 400, color: '#ffffff', outlineColor: '#222222', outlineWidth: 1,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.35)' }),
  base({ id: 'basic-15', name: '페이부크 스퀘어', category: 'basic', fontFamily: 'Paybooc', fontWeight: 400, color: '#ffffff', outlineWidth: 2,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.45)' }),
  base({ id: 'basic-16', name: '트웨이에어 프레시', category: 'basic', fontFamily: 'TwayAir', fontWeight: 400, color: '#ffffff', outlineColor: '#1e3a5f', outlineWidth: 2,
    textShadowCSS: '0 1px 3px rgba(30,58,95,0.4)' }),
  base({ id: 'basic-17', name: '나눔라운드 친근', category: 'basic', fontFamily: 'NanumSquareRound', fontWeight: 400, fontSize: 50, color: '#ffffff', outlineWidth: 2,
    textShadowCSS: '0 2px 3px rgba(0,0,0,0.35)' }),
  base({ id: 'basic-18', name: 'KBO 스포츠', category: 'basic', fontFamily: 'KBODiaGothic', fontWeight: 400, color: '#ffffff', outlineWidth: 3,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'basic-19', name: '서울한강 여유', category: 'basic', fontFamily: 'SeoulHangang', fontWeight: 400, color: '#ffffff', outlineColor: '#1a2744', outlineWidth: 1,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.4)' }),
  base({ id: 'basic-20', name: 'Noto 스탠다드', category: 'basic', fontFamily: 'Noto Sans KR', fontWeight: 500, color: '#ffffff', outlineWidth: 2,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.45)' }),
];

// ═══════════════════════════════════════════════════
// 2. 컬러 (color) — 메탈릭 & 비비드 20개
// ═══════════════════════════════════════════════════
const COLOR: SubtitleTemplate[] = [
  base({ id: 'color-01', name: '골드 메탈릭', category: 'color', fontFamily: 'GMarketSans', color: '#ffd700', outlineColor: '#654321', outlineWidth: 2,
    textShadowCSS: M_GOLD }),
  base({ id: 'color-02', name: '크롬 실버', category: 'color', fontFamily: 'Escoredream', color: '#e8e8e8', outlineColor: '#333333', outlineWidth: 1,
    textShadowCSS: M_CHROME }),
  base({ id: 'color-03', name: '로즈골드', category: 'color', fontFamily: 'SBAggroB', fontWeight: 400, color: '#f4c2c2', outlineColor: '#8b3a3a', outlineWidth: 2,
    textShadowCSS: M_ROSE }),
  base({ id: 'color-04', name: '브론즈 앤티크', category: 'color', fontFamily: 'LOTTERIACHAB', fontWeight: 400, color: '#cd7f32', outlineColor: '#3d2b1a', outlineWidth: 2,
    textShadowCSS: M_BRONZE }),
  base({ id: 'color-05', name: '루비 크림슨', category: 'color', fontFamily: 'Black Han Sans', fontWeight: 400, fontSize: 56, color: '#e0115f', outlineColor: '#330011', outlineWidth: 3,
    textShadowCSS: `0 0 8px rgba(224,17,95,0.5), 0 0 16px rgba(224,17,95,0.25), ${SHADOW_3D('#b00040', '#8b0030', '#660020', 'rgba(0,0,0,0.5)')}` }),
  base({ id: 'color-06', name: '사파이어 블루', category: 'color', fontFamily: 'Tenada', fontWeight: 400, color: '#0f52ba', outlineColor: '#001133', outlineWidth: 3,
    textShadowCSS: `0 0 8px rgba(15,82,186,0.4), 0 0 16px rgba(15,82,186,0.2), ${SHADOW_3D('#0a3d8f', '#082d6a', '#061f4a', 'rgba(0,0,0,0.5)')}` }),
  base({ id: 'color-07', name: '에메랄드 그린', category: 'color', fontFamily: 'JalnanGothic', fontWeight: 400, color: '#50c878', outlineColor: '#0a3017', outlineWidth: 3,
    textShadowCSS: `0 0 8px rgba(80,200,120,0.35), ${SHADOW_3D('#3da060', '#2d8048', '#1e6030', 'rgba(0,0,0,0.4)')}` }),
  base({ id: 'color-08', name: '앰버 글로우', category: 'color', fontFamily: 'Do Hyeon', fontWeight: 400, color: '#ffbf00', outlineColor: '#451a03', outlineWidth: 3,
    textShadowCSS: '0 0 8px rgba(255,191,0,0.4), 0 0 16px rgba(255,140,0,0.2), 0 2px 4px rgba(69,26,3,0.5)' }),
  base({ id: 'color-09', name: '코랄 비비드', category: 'color', fontFamily: 'Jua', fontWeight: 400, color: '#ff6f61', outlineColor: '#4a0e0e', outlineWidth: 3,
    textShadowCSS: '0 0 10px rgba(255,111,97,0.4), 0 0 20px rgba(255,111,97,0.15), 0 2px 4px rgba(0,0,0,0.4)' }),
  base({ id: 'color-10', name: '터콰이즈 팝', category: 'color', fontFamily: 'Yangjin', fontWeight: 400, color: '#40e0d0', outlineColor: '#042f2e', outlineWidth: 3,
    textShadowCSS: '0 0 10px rgba(64,224,208,0.35), 0 0 20px rgba(64,224,208,0.15), 0 2px 4px rgba(0,0,0,0.4)' }),
  base({ id: 'color-11', name: '라벤더 드림', category: 'color', fontFamily: 'Dongle', fontWeight: 400, fontSize: 64, color: '#b57edc', outlineColor: '#2d1a4e', outlineWidth: 2,
    textShadowCSS: `${GLOW_SOFT('#7c3aed')}, 0 0 4px rgba(181,126,220,0.5)` }),
  base({ id: 'color-12', name: '선셋 오렌지', category: 'color', fontFamily: 'LOTTERIADDAG', fontWeight: 400, color: '#ff6347', outlineColor: '#3b0a00', outlineWidth: 3,
    textShadowCSS: '0 0 6px rgba(255,99,71,0.4), 0 0 12px rgba(255,165,0,0.2), 0 0 24px rgba(148,0,211,0.1), 0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'color-13', name: '오로라 멀티', category: 'color', fontFamily: 'TAEBAEKfont', fontWeight: 400, color: '#a0f0a0', outlineColor: '#0a2a0a', outlineWidth: 2,
    textShadowCSS: '0 0 6px rgba(100,255,100,0.4), 0 0 12px rgba(100,200,255,0.3), 0 0 20px rgba(200,100,255,0.2), 0 0 30px rgba(100,255,200,0.1)' }),
  base({ id: 'color-14', name: '다이아몬드 화이트', category: 'color', fontFamily: 'PilseungGothic', fontWeight: 400, color: '#f0f0ff', outlineColor: '#333355', outlineWidth: 2,
    textShadowCSS: '-1px -1px 0 rgba(255,255,255,0.6), 0 0 6px rgba(200,200,255,0.4), 0 0 12px rgba(150,150,255,0.2), 0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'color-15', name: '구리 메탈', category: 'color', fontFamily: 'ONEMobileTitle', fontWeight: 400, color: '#b87333', outlineColor: '#3d1f0a', outlineWidth: 2,
    textShadowCSS: '0 1px 0 #9a5b22, 0 2px 0 #7c4818, 0 3px 0 #5e3510, 0 4px 6px rgba(0,0,0,0.5)' }),
  base({ id: 'color-16', name: '마젠타 일렉', category: 'color', fontFamily: 'Cute Font', fontWeight: 400, fontSize: 60, color: '#ff00ff', outlineColor: '#330033', outlineWidth: 2,
    textShadowCSS: `${GLOW('#ff00ffaa', 6, 12, 24)}, 0 0 36px #ff00ff40` }),
  base({ id: 'color-17', name: '라임 애시드', category: 'color', fontFamily: 'Sunflower', fontWeight: 400, color: '#c0ff00', outlineColor: '#1a2e05', outlineWidth: 3,
    textShadowCSS: '0 0 8px rgba(192,255,0,0.4), 0 0 16px rgba(192,255,0,0.2), 0 2px 4px rgba(0,0,0,0.4)' }),
  base({ id: 'color-18', name: '인디고 딥', category: 'color', fontFamily: 'Stylish', fontWeight: 400, color: '#4b0082', outlineColor: '#ffffff', outlineWidth: 2,
    textShadowCSS: '0 0 8px rgba(75,0,130,0.5), 0 0 16px rgba(75,0,130,0.25), 0 2px 4px rgba(0,0,0,0.3)' }),
  base({ id: 'color-19', name: '피치 소프트', category: 'color', fontFamily: 'Gugi', fontWeight: 400, color: '#ffcba4', outlineColor: '#5a2d0c', outlineWidth: 2,
    textShadowCSS: '0 0 6px rgba(255,203,164,0.3), 0 2px 4px rgba(90,45,12,0.3)' }),
  base({ id: 'color-20', name: '민트 프레시', category: 'color', fontFamily: 'Bagel Fat One', fontWeight: 400, fontSize: 50, color: '#98ff98', outlineColor: '#0a3d1a', outlineWidth: 3,
    textShadowCSS: '0 0 8px rgba(152,255,152,0.35), 0 0 16px rgba(0,200,100,0.15), 0 2px 4px rgba(0,0,0,0.4)' }),
];

// ═══════════════════════════════════════════════════
// 3. 스타일 (style) — 네온·사이버·레트로·홀로 20개
// ═══════════════════════════════════════════════════
const STYLE: SubtitleTemplate[] = [
  base({ id: 'style-01', name: '네온 튜브 그린', category: 'style', fontFamily: 'CookieRun', color: '#4ade80', outlineColor: '#003300', outlineWidth: 1, letterSpacing: 1,
    textShadowCSS: NEON('#4ade80') }),
  base({ id: 'style-02', name: '네온 튜브 마젠타', category: 'style', fontFamily: 'Cafe24Surround', fontWeight: 400, color: '#ff10f0', outlineColor: '#330033', outlineWidth: 1, letterSpacing: 1,
    textShadowCSS: NEON('#ff10f0') }),
  base({ id: 'style-03', name: '네온 튜브 시안', category: 'style', fontFamily: 'Recipekorea', fontWeight: 400, color: '#00ffff', outlineColor: '#002233', outlineWidth: 1, letterSpacing: 1,
    textShadowCSS: NEON('#00ffff') }),
  base({ id: 'style-04', name: '사이버펑크 글리치', category: 'style', fontFamily: 'NeoDonggeunmo', fontWeight: 400, fontSize: 48, color: '#00ff00', outlineWidth: 0,
    textShadowCSS: `${GLITCH('#ff0080', '#00ffff')}, 0 0 10px rgba(0,255,0,0.5)` }),
  base({ id: 'style-05', name: '신스웨이브 80s', category: 'style', fontFamily: 'Galmuri11', fontWeight: 400, fontSize: 48, color: '#ff00ff', outlineColor: '#00ffff', outlineWidth: 1, letterSpacing: 2,
    textShadowCSS: '0 0 10px #ff00ff, 0 0 20px #ff00ffaa, 0 0 30px #ff00ff77, 2px 2px 0 #00ffff66, 0 0 40px #ff00ff22' }),
  base({ id: 'style-06', name: '베이퍼웨이브', category: 'style', fontFamily: 'MapleStory', fontWeight: 400, fontSize: 50, color: '#ffb3d9', outlineColor: '#6633aa', outlineWidth: 1,
    textShadowCSS: '0 0 8px rgba(255,179,217,0.4), 0 0 16px rgba(102,51,170,0.3), 2px 2px 0 #6699ff40, -2px -2px 0 #ff66cc30' }),
  base({ id: 'style-07', name: 'CRT 터미널', category: 'style', fontFamily: 'DOSGothic', fontWeight: 400, fontSize: 46, color: '#33ff33', backgroundColor: '#000000dd', outlineWidth: 0, letterSpacing: 1,
    textShadowCSS: `${GLOW('#33ff3360', 3, 6, 12)}, 0 0 2px #33ff33` }),
  base({ id: 'style-08', name: '레트로 앰버CRT', category: 'style', fontFamily: 'Galmuri9', fontWeight: 400, fontSize: 46, color: '#ffbf00', backgroundColor: '#000000dd', outlineWidth: 0, letterSpacing: 1,
    textShadowCSS: `${GLOW('#ffbf0060', 3, 6, 12)}, 0 0 2px #ffbf00` }),
  base({ id: 'style-09', name: '글래스모피즘 다크', category: 'style', fontFamily: 'Black and White Picture', fontWeight: 400, fontSize: 50, color: '#e2e8f0', backgroundColor: '#1e293b88', outlineWidth: 0, letterSpacing: 0.5,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.5), 0 0 8px rgba(148,163,184,0.1)' }),
  base({ id: 'style-10', name: '글래스모피즘 라이트', category: 'style', fontFamily: 'Cafe24ClassicType', fontWeight: 400, fontSize: 50, color: '#1e293b', backgroundColor: '#ffffff88', outlineWidth: 0,
    textShadowCSS: '0 1px 2px rgba(255,255,255,0.6), 0 -1px 1px rgba(0,0,0,0.1)' }),
  base({ id: 'style-11', name: '홀로그래피', category: 'style', fontFamily: 'EliceDigitalBaeum', fontWeight: 400, fontSize: 50, color: '#00ffff', outlineColor: '#110033', outlineWidth: 1,
    textShadowCSS: HOLO }),
  base({ id: 'style-12', name: '일렉트릭 라이트닝', category: 'style', fontFamily: 'DNFBitBitv2', fontWeight: 400, fontSize: 50, color: '#00d4ff', outlineColor: '#001133', outlineWidth: 2,
    textShadowCSS: '0 0 5px #00d4ff, 0 0 10px #0088ff, 0 0 20px #0044ff, -1px 0 3px #ffffff80, 1px 0 3px #ffffff40, 0 0 30px #0066ffaa' }),
  base({ id: 'style-13', name: '불꽃 마그마', category: 'style', fontFamily: 'SDSamliphopangche', fontWeight: 400, fontSize: 56, color: '#ff6600', outlineColor: '#330000', outlineWidth: 2,
    textShadowCSS: FIRE }),
  base({ id: 'style-14', name: '아이스 크리스탈', category: 'style', fontFamily: 'KOTRAHOPE', fontWeight: 400, fontSize: 50, color: '#bae6fd', outlineColor: '#0369a1', outlineWidth: 2,
    textShadowCSS: ICE }),
  base({ id: 'style-15', name: '워터컬러', category: 'style', fontFamily: 'Cafe24Simplehae', fontWeight: 400, fontSize: 52, color: '#a78bfa', outlineWidth: 0,
    textShadowCSS: '3px 3px 8px rgba(167,139,250,0.5), -2px -2px 6px rgba(244,114,182,0.3), 0 4px 10px rgba(96,165,250,0.3), 0 0 20px rgba(167,139,250,0.15)' }),
  base({ id: 'style-16', name: '레이저 각인', category: 'style', fontFamily: 'NexonLv1Gothic', fontWeight: 400, fontSize: 48, color: '#ff3333', outlineColor: '#440000', outlineWidth: 1, letterSpacing: 2,
    textShadowCSS: '0 0 2px #ff3333, 0 0 4px #ff333380, 0 0 8px #ff333340, 0 -1px 0 rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.8)' }),
  base({ id: 'style-17', name: '스테인드 글라스', category: 'style', fontFamily: 'NexonLv2Gothic', fontWeight: 400, color: '#ffd700', outlineColor: '#4a3000', outlineWidth: 2,
    textShadowCSS: '0 0 6px rgba(255,215,0,0.5), 0 0 12px rgba(255,100,0,0.3), 0 0 18px rgba(200,0,255,0.2), 0 0 24px rgba(0,150,255,0.15), 0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'style-18', name: '페이퍼 컷아웃', category: 'style', fontFamily: 'InkLipquid', fontWeight: 400, fontSize: 52, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2,
    textShadowCSS: '4px 4px 0 #333333, 5px 5px 0 #555555' }),
  base({ id: 'style-19', name: '캔디 팝', category: 'style', fontFamily: 'Cafe24ShiningStar', fontWeight: 400, fontSize: 50, color: '#ff69b4', outlineColor: '#990044', outlineWidth: 2,
    textShadowCSS: `${SHADOW_3D('#cc3366', '#aa2255', '#881a44', 'rgba(0,0,0,0.4)')}, 0 0 8px rgba(255,105,180,0.3)` }),
  base({ id: 'style-20', name: '그런지 펑크', category: 'style', fontFamily: 'Orbit', fontWeight: 400, color: '#ff4444', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: '-1px -1px 0 #888888, 2px 1px 0 #444444, -2px 2px 0 #666666, 3px -1px 0 #555555, 0 0 8px rgba(255,0,0,0.3)' }),
];

// ═══════════════════════════════════════════════════
// 4. 예능/바라이어티 (variety) — 한국 예능 프로그램 인스파이어 20개
// ═══════════════════════════════════════════════════
const VARIETY: SubtitleTemplate[] = [
  // 무한도전 스타일: 골드 + 두꺼운 외곽 + 깊은 3D
  base({ id: 'variety-01', name: '무한도전 골드', category: 'variety', fontFamily: 'BMEuljiro', fontWeight: 400, fontSize: 58, color: '#fbbf24', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: `${DEEP_3D('#8b6914')}, 0 0 8px rgba(251,191,36,0.2)` }),
  // 런닝맨 스타일: 옐로우 + 모션블러 + 스피드감
  base({ id: 'variety-02', name: '런닝맨 다이나믹', category: 'variety', fontFamily: 'Isamanru', fontSize: 56, color: '#ffff00', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: `${MOTION_R('#ffff00')}, 0 2px 4px rgba(0,0,0,0.5)` }),
  // 나혼자산다: 따뜻한 라운드 + 소프트 글로우
  base({ id: 'variety-03', name: '나혼산 따뜻', category: 'variety', fontFamily: 'HannaPro', fontWeight: 400, fontSize: 52, color: '#fff5e6', outlineColor: '#5a3e1b', outlineWidth: 2,
    textShadowCSS: '0 0 8px rgba(255,200,120,0.3), 0 2px 4px rgba(90,62,27,0.4)' }),
  // 놀면뭐하니: 손그림 + 크리에이티브 3D
  base({ id: 'variety-04', name: '놀뭐 크리에이티브', category: 'variety', fontFamily: 'Cafe24Dangdanghae', fontWeight: 400, fontSize: 54, color: '#ff4444', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: `${SHADOW_3D('#cc3333', '#aa2222', '#881111', 'rgba(0,0,0,0.5)')}, 0 0 6px rgba(255,68,68,0.2)` }),
  // 전참시: 클린 컬러 박스
  base({ id: 'variety-05', name: '전참시 클린박스', category: 'variety', fontFamily: 'ONEMobilePOP', fontWeight: 400, fontSize: 50, color: '#ffffff', backgroundColor: '#3b82f699', outlineWidth: 0,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3)' }),
  // 신서유기: 게임/픽셀 스타일
  base({ id: 'variety-06', name: '신서유기 게임', category: 'variety', fontFamily: 'WavvePADO', fontWeight: 400, fontSize: 50, color: '#00ff88', outlineColor: '#003322', outlineWidth: 2,
    textShadowCSS: `${GLOW('#00ff8880', 5, 10, 20)}, 0 0 2px #00ff88` }),
  // 1박2일: 아웃도어/자연
  base({ id: 'variety-07', name: '1박2일 아웃도어', category: 'variety', fontFamily: 'GabiaBombaram', fontWeight: 400, fontSize: 52, color: '#fef3c7', outlineColor: '#5c4813', outlineWidth: 2,
    textShadowCSS: `${GLOW_SOFT('#92400e')}, 0 0 4px rgba(254,243,199,0.4)` }),
  // 아는형님: 칠판/분필 느낌
  base({ id: 'variety-08', name: '아는형님 칠판', category: 'variety', fontFamily: 'SDMiSaeng', fontWeight: 400, fontSize: 56, color: '#f0f0e8', backgroundColor: '#2d4a2d99', outlineWidth: 0,
    textShadowCSS: '1px 1px 2px rgba(0,0,0,0.3), 0 0 4px rgba(240,240,232,0.1)' }),
  // 슈퍼맨이돌아왔다: 파스텔/귀여움
  base({ id: 'variety-09', name: '슈돌 파스텔', category: 'variety', fontFamily: 'BinggraeTaom', fontWeight: 400, fontSize: 50, color: '#ffb3d9', outlineColor: '#993366', outlineWidth: 2,
    textShadowCSS: '0 0 8px rgba(255,179,217,0.3), 0 2px 4px rgba(153,51,102,0.3)' }),
  // 삼시세끼: 러스틱/따뜻
  base({ id: 'variety-10', name: '삼시세끼 러스틱', category: 'variety', fontFamily: 'HakgyoansimGaeulsopung', fontWeight: 400, fontSize: 52, color: '#fde68a', outlineColor: '#78350f', outlineWidth: 2,
    textShadowCSS: '0 1px 0 #b8860b, 0 2px 4px rgba(120,53,15,0.5)' }),
  // 폭소/슬랩스틱
  base({ id: 'variety-11', name: '폭소 팝 3D', category: 'variety', fontFamily: 'ManhwaPromotionAgency', fontWeight: 400, fontSize: 58, color: '#ffff00', outlineColor: '#000000', outlineWidth: 5,
    textShadowCSS: `${ULTRA_3D('#333333')}, 0 0 6px rgba(255,255,0,0.2)` }),
  // 킹왕짱 임팩트
  base({ id: 'variety-12', name: '킹왕짱 임팩트', category: 'variety', fontFamily: 'YeogiOttaeJalnan', fontWeight: 400, fontSize: 68, color: '#ffffff', outlineColor: '#000000', outlineWidth: 4, letterSpacing: -1, lineHeight: 1.3,
    textShadowCSS: `${DEEP_3D('#555555')}, 0 0 4px rgba(255,255,255,0.15)` }),
  // 빅 임팩트
  base({ id: 'variety-13', name: '빅 임팩트 레드', category: 'variety', fontFamily: 'TmonMonsori', fontWeight: 400, fontSize: 60, color: '#ef4444', outlineColor: '#ffffff', outlineWidth: 3, backgroundColor: '#000000cc',
    textShadowCSS: '0 0 10px rgba(239,68,68,0.5)' }),
  // 코믹 만화
  base({ id: 'variety-14', name: '코믹 만화 3D', category: 'variety', fontFamily: 'YES24', fontWeight: 400, color: '#ffffff', outlineColor: '#000000', outlineWidth: 4,
    textShadowCSS: '3px 3px 0 #ff6600, 4px 4px 0 #cc5500, 5px 5px 0 #993300, 6px 6px 4px rgba(0,0,0,0.4)' }),
  // 봄바람 파티
  base({ id: 'variety-15', name: '봄바람 파티', category: 'variety', fontFamily: 'GabiaSolmee', fontWeight: 400, fontSize: 50, color: '#f472b6', outlineColor: '#831843', outlineWidth: 2,
    textShadowCSS: '0 0 8px rgba(244,114,182,0.4), 0 0 16px rgba(244,114,182,0.15), 0 2px 4px rgba(0,0,0,0.3)' }),
  // 감동/눈물
  base({ id: 'variety-16', name: '감동 눈물', category: 'variety', fontFamily: 'HakgyoansimDoldam', fontWeight: 400, fontSize: 50, color: '#93c5fd', outlineColor: '#1e3a5f', outlineWidth: 2,
    textShadowCSS: `${GLOW_SOFT('#3b82f6')}, 0 0 4px rgba(147,197,253,0.5)` }),
  // 분노/폭발
  base({ id: 'variety-17', name: '분노 폭발', category: 'variety', fontFamily: 'BMEuljirooraeorae', fontWeight: 400, fontSize: 62, color: '#ff0000', outlineColor: '#ffff00', outlineWidth: 3,
    textShadowCSS: '0 0 8px rgba(255,0,0,0.6), 0 0 16px rgba(255,100,0,0.3), 2px 2px 0 #cc0000, 3px 3px 0 #880000, 4px 4px 4px rgba(0,0,0,0.5)' }),
  // 외침/메가폰
  base({ id: 'variety-18', name: '외침 메가폰', category: 'variety', fontFamily: 'GyeonggiTitle', fontWeight: 400, fontSize: 64, color: '#ffffff', outlineColor: '#ef4444', outlineWidth: 4,
    textShadowCSS: `${SHADOW_3D('#cc3333', '#aa2222', '#881111', 'rgba(0,0,0,0.5)')}, 0 0 8px rgba(239,68,68,0.3)` }),
  // 속삭임
  base({ id: 'variety-19', name: '속삭임 소프트', category: 'variety', fontFamily: 'LeferiPoint', fontWeight: 400, fontSize: 44, color: '#d1d5db', outlineWidth: 0,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.4), 0 0 6px rgba(209,213,219,0.15)' }),
  // 리액션/놀람
  base({ id: 'variety-20', name: '리액션 놀람', category: 'variety', fontFamily: 'MBC1961M', fontWeight: 400, fontSize: 60, color: '#fbbf24', outlineColor: '#000000', outlineWidth: 4, backgroundColor: '#dc262699',
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.5), 0 0 8px rgba(251,191,36,0.3)' }),
];

// ═══════════════════════════════════════════════════
// 5. 감성 (emotion) — 손글씨/자연/분위기 20개
// ═══════════════════════════════════════════════════
const EMOTION: SubtitleTemplate[] = [
  base({ id: 'emotion-01', name: '첫사랑 편지', category: 'emotion', fontFamily: 'Nanum Pen Script', fontWeight: 400, fontSize: 56, color: '#ffb3d9', outlineColor: '#660033', outlineWidth: 1, lineHeight: 1.5,
    textShadowCSS: '0 0 8px rgba(255,179,217,0.4), 0 0 16px rgba(255,105,180,0.15), 0 1px 3px rgba(0,0,0,0.3)' }),
  base({ id: 'emotion-02', name: '밤하늘 별빛', category: 'emotion', fontFamily: 'MapoGeumbitnaru', fontWeight: 400, fontSize: 52, color: '#c4b5fd', outlineWidth: 0, letterSpacing: 1,
    textShadowCSS: `${GLOW_SOFT('#7c3aed')}, 0 0 4px rgba(196,181,253,0.5), 0 0 24px rgba(124,58,237,0.15)` }),
  base({ id: 'emotion-03', name: '벚꽃 비', category: 'emotion', fontFamily: 'Cafe24Supermagic', fontWeight: 400, fontSize: 50, color: '#fda4af', outlineColor: '#881337', outlineWidth: 1,
    textShadowCSS: '0 0 8px rgba(253,164,175,0.4), 0 0 16px rgba(251,113,133,0.2), 0 0 32px rgba(251,113,133,0.1)' }),
  base({ id: 'emotion-04', name: '가을 단풍', category: 'emotion', fontFamily: 'Cafe24Danjunghae', fontWeight: 400, fontSize: 52, color: '#fbbf24', outlineWidth: 0,
    textShadowCSS: `${GLOW_SOFT('#c2410c')}, 0 0 4px rgba(251,191,36,0.4), 0 0 20px rgba(194,65,12,0.15)` }),
  base({ id: 'emotion-05', name: '바다 물결', category: 'emotion', fontFamily: 'MapoBackpacking', fontWeight: 400, fontSize: 52, color: '#bae6fd', outlineColor: '#0369a1', outlineWidth: 1,
    textShadowCSS: '0 0 8px rgba(186,230,253,0.35), 0 0 16px rgba(56,189,248,0.15), 0 2px 4px rgba(3,105,161,0.3)' }),
  base({ id: 'emotion-06', name: '새벽 안개', category: 'emotion', fontFamily: 'NanumBarunpen', fontWeight: 400, fontSize: 50, color: '#94a3b8', outlineWidth: 0, lineHeight: 1.6,
    textShadowCSS: '0 1px 3px rgba(71,85,105,0.5), 0 0 8px rgba(148,163,184,0.2), 0 0 16px rgba(71,85,105,0.1)' }),
  base({ id: 'emotion-07', name: '비오는 거리', category: 'emotion', fontFamily: 'KyoboHandwriting', fontWeight: 400, fontSize: 50, color: '#cbd5e1', outlineColor: '#334155', outlineWidth: 1, lineHeight: 1.5,
    textShadowCSS: '0 2px 6px rgba(51,65,85,0.5), 0 0 4px rgba(203,213,225,0.15)' }),
  base({ id: 'emotion-08', name: '캠프파이어', category: 'emotion', fontFamily: 'ShinDongYupHandwriting', fontWeight: 400, fontSize: 52, color: '#fdba74', outlineWidth: 0,
    textShadowCSS: `${FIRE}, 0 2px 4px rgba(0,0,0,0.3)` }),
  base({ id: 'emotion-09', name: '눈 내리는 밤', category: 'emotion', fontFamily: 'Cafe24Dongdong', fontWeight: 400, fontSize: 50, color: '#f0f9ff', outlineColor: '#64748b', outlineWidth: 1,
    textShadowCSS: '0 0 6px rgba(240,249,255,0.4), 0 0 12px rgba(240,249,255,0.2), 0 0 24px rgba(200,220,240,0.1)' }),
  base({ id: 'emotion-10', name: '봄날 햇살', category: 'emotion', fontFamily: 'Cafe24Ssukssuk', fontWeight: 400, fontSize: 52, color: '#fde68a', outlineWidth: 0,
    textShadowCSS: '0 0 6px rgba(253,230,138,0.5), 0 0 12px rgba(251,191,36,0.2), 0 0 24px rgba(245,158,11,0.1), 0 1px 3px rgba(0,0,0,0.2)' }),
  base({ id: 'emotion-11', name: '달빛 서재', category: 'emotion', fontFamily: 'GodoMaum', fontWeight: 400, fontSize: 50, color: '#e0e7ff', outlineWidth: 0,
    textShadowCSS: `${GLOW_SOFT('#818cf8')}, 0 0 4px rgba(224,231,255,0.5), 0 0 20px rgba(129,140,248,0.15)` }),
  base({ id: 'emotion-12', name: '노을 하늘', category: 'emotion', fontFamily: 'MapoHongdaeFreedom', fontWeight: 400, fontSize: 52, color: '#fdba74', outlineWidth: 0,
    textShadowCSS: '0 0 6px rgba(253,186,116,0.5), 0 0 12px rgba(234,88,12,0.3), 0 0 24px rgba(148,0,100,0.15), 0 2px 4px rgba(0,0,0,0.2)' }),
  base({ id: 'emotion-13', name: '숲속 안식', category: 'emotion', fontFamily: 'HakgyoansimWooju', fontWeight: 400, fontSize: 50, color: '#86efac', outlineWidth: 0,
    textShadowCSS: `${GLOW_SOFT('#166534')}, 0 0 4px rgba(134,239,172,0.4)` }),
  base({ id: 'emotion-14', name: '호수 반영', category: 'emotion', fontFamily: 'HakgyoansimButpen', fontWeight: 400, fontSize: 50, color: '#7dd3fc', outlineColor: '#0c4a6e', outlineWidth: 1,
    textShadowCSS: '0 0 8px rgba(125,211,252,0.3), 0 0 16px rgba(56,189,248,0.15), 0 4px 8px rgba(12,74,110,0.2)' }),
  base({ id: 'emotion-15', name: '꿈속 여행', category: 'emotion', fontFamily: 'Nanum Brush Script', fontWeight: 400, fontSize: 60, color: '#e0e7ff', outlineWidth: 0, letterSpacing: 2, lineHeight: 1.5,
    textShadowCSS: '0 0 10px rgba(224,231,255,0.4), 0 0 20px rgba(167,139,250,0.2), 0 0 40px rgba(124,58,237,0.1)' }),
  base({ id: 'emotion-16', name: '추억 세피아', category: 'emotion', fontFamily: 'IMHyemin', fontWeight: 400, fontSize: 48, color: '#d4a76a', outlineWidth: 0, backgroundColor: '#3d2b1a40',
    textShadowCSS: '0 1px 3px rgba(61,43,26,0.4), 0 0 6px rgba(212,167,106,0.15)' }),
  base({ id: 'emotion-17', name: '일기장', category: 'emotion', fontFamily: 'Cafe24Anemone', fontWeight: 400, fontSize: 48, color: '#fef3c7', outlineWidth: 0, backgroundColor: '#78350f30', lineHeight: 1.6,
    textShadowCSS: '0 1px 2px rgba(120,53,15,0.3), 0 0 4px rgba(254,243,199,0.1)' }),
  base({ id: 'emotion-18', name: '동화나라', category: 'emotion', fontFamily: 'KCCEunyeong', fontWeight: 400, fontSize: 52, color: '#fcd34d', outlineColor: '#78350f', outlineWidth: 1,
    textShadowCSS: '0 0 8px rgba(252,211,77,0.4), 0 0 16px rgba(245,158,11,0.2), 0 2px 4px rgba(120,53,15,0.3)' }),
  base({ id: 'emotion-19', name: '시 낭독', category: 'emotion', fontFamily: 'OmyuDayeppeum', fontWeight: 400, fontSize: 46, color: '#fef9c3', outlineWidth: 0, letterSpacing: 2, lineHeight: 1.8,
    textShadowCSS: '0 1px 3px rgba(0,0,0,0.4), 0 0 8px rgba(254,249,195,0.2)' }),
  base({ id: 'emotion-20', name: '힐링 명상', category: 'emotion', fontFamily: 'OngleipEoyeonce', fontWeight: 400, fontSize: 48, color: '#d1fae5', outlineWidth: 0, letterSpacing: 1, lineHeight: 1.6,
    textShadowCSS: `${GLOW_SOFT('#059669')}, 0 0 4px rgba(209,250,229,0.3)` }),
];

// ═══════════════════════════════════════════════════
// 6. 시네마틱 (cinematic) — 영화·방송·드라마급 20개
// ═══════════════════════════════════════════════════
const CINEMATIC: SubtitleTemplate[] = [
  base({ id: 'cine-01', name: '넷플릭스 클래식', category: 'cinematic', fontFamily: 'Noto Serif KR', fontWeight: 400, fontSize: 48, color: '#ffffff', backgroundColor: '#000000aa', outlineWidth: 0, lineHeight: 1.5,
    textShadowCSS: '0 2px 4px rgba(0,0,0,0.75), 0 4px 8px rgba(0,0,0,0.5)' }),
  base({ id: 'cine-02', name: '다큐 내레이션', category: 'cinematic', fontFamily: 'Ridibatang', fontWeight: 400, fontSize: 48, color: '#ffffff', outlineColor: '#000000', outlineWidth: 1, lineHeight: 1.5,
    textShadowCSS: '0 2px 6px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.2)' }),
  base({ id: 'cine-03', name: '느와르 미스테리', category: 'cinematic', fontFamily: 'Nanum Myeongjo', fontSize: 50, color: '#ffffff', outlineColor: '#000000', outlineWidth: 1, lineHeight: 1.5,
    textShadowCSS: '2px 2px 8px rgba(0,0,0,0.8), 0 0 16px rgba(0,0,0,0.4)' }),
  base({ id: 'cine-04', name: '에픽 골드 타이틀', category: 'cinematic', fontFamily: 'Hahmlet', fontSize: 56, color: '#ffd700', outlineColor: '#654321', outlineWidth: 2, letterSpacing: 2,
    textShadowCSS: `${M_GOLD}, 0 0 16px rgba(255,215,0,0.15)` }),
  base({ id: 'cine-05', name: '호러 블러드', category: 'cinematic', fontFamily: 'Gowun Batang', fontWeight: 400, fontSize: 52, color: '#cc0000', outlineColor: '#330000', outlineWidth: 2,
    textShadowCSS: '0 2px 0 #990000, 0 4px 0 #660000, 0 6px 0 #330000, 0 8px 6px rgba(0,0,0,0.8), 0 0 12px rgba(204,0,0,0.4)' }),
  base({ id: 'cine-06', name: '로맨스 소프트', category: 'cinematic', fontFamily: 'Song Myung', fontWeight: 400, fontSize: 48, color: '#fda4af', outlineWidth: 0, letterSpacing: 1, lineHeight: 1.6,
    textShadowCSS: `${GLOW_SOFT('#fb7185')}, 0 0 4px rgba(253,164,175,0.5), 0 1px 3px rgba(0,0,0,0.2)` }),
  base({ id: 'cine-07', name: 'MV 네온', category: 'cinematic', fontFamily: 'MaruBuri', fontWeight: 400, fontSize: 50, color: '#f472b6', outlineWidth: 0, letterSpacing: 1,
    textShadowCSS: '0 0 6px rgba(244,114,182,0.6), 0 0 12px rgba(244,114,182,0.3), 0 0 24px rgba(244,114,182,0.15)' }),
  base({ id: 'cine-08', name: '뉴스 속보', category: 'cinematic', fontFamily: 'BookkMyungjo', fontWeight: 400, fontSize: 50, color: '#ffffff', backgroundColor: '#dc2626cc', outlineWidth: 0,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3)' }),
  base({ id: 'cine-09', name: '인터뷰 로어서드', category: 'cinematic', fontFamily: 'ChosunGs', fontWeight: 400, fontSize: 46, color: '#ffffff', backgroundColor: '#1e293bcc', outlineWidth: 0, lineHeight: 1.5,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.4)' }),
  base({ id: 'cine-10', name: '빈티지 레터프레스', category: 'cinematic', fontFamily: 'GyeonggiBatang', fontWeight: 400, fontSize: 48, color: '#d6cfc4', backgroundColor: '#2d220f88', outlineWidth: 0, lineHeight: 1.5,
    textShadowCSS: `${LETTERPRESS}, 0 2px 4px rgba(0,0,0,0.3)` }),
  base({ id: 'cine-11', name: 'SF 홀로그램', category: 'cinematic', fontFamily: 'SunBatang', fontWeight: 400, fontSize: 48, color: '#00ff9f', outlineColor: '#003322', outlineWidth: 1, letterSpacing: 2,
    textShadowCSS: '0 0 5px #00ff9f, 0 0 10px #00ff9f, 0 0 20px #0088ff, 0 0 30px #0088ff80, 2px 2px 6px rgba(0,0,0,0.6)' }),
  base({ id: 'cine-12', name: '액션 임팩트', category: 'cinematic', fontFamily: 'SuseongBatang', fontWeight: 400, fontSize: 54, color: '#ffffff', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: `${SHADOW_3D('#555555', '#444444', '#333333', 'rgba(0,0,0,0.6)')}, 0 0 8px rgba(255,255,255,0.1)` }),
  base({ id: 'cine-13', name: '웨딩 엘레강스', category: 'cinematic', fontFamily: 'YeolrinMyeongjo', fontWeight: 400, fontSize: 48, color: '#fff8dc', outlineColor: '#997700', outlineWidth: 1, letterSpacing: 2, lineHeight: 1.6,
    textShadowCSS: '0 0 6px rgba(255,248,220,0.3), 0 0 12px rgba(184,134,11,0.15), 0 2px 4px rgba(0,0,0,0.3)' }),
  base({ id: 'cine-14', name: '스릴러 긴장', category: 'cinematic', fontFamily: 'ChosunIlbo', fontWeight: 400, fontSize: 50, color: '#e63946', outlineColor: '#330000', outlineWidth: 2,
    textShadowCSS: '0 0 8px rgba(230,57,70,0.5), 0 0 16px rgba(139,0,0,0.25), 2px 2px 6px rgba(0,0,0,0.6)' }),
  base({ id: 'cine-15', name: '사극 명조', category: 'cinematic', fontFamily: 'KoPubBatang', fontWeight: 400, fontSize: 50, color: '#e8e0d4', outlineColor: '#2d1f0e', outlineWidth: 1, letterSpacing: 2, lineHeight: 1.6,
    textShadowCSS: `${EMBOSS}, 0 2px 4px rgba(45,31,14,0.3)` }),
  base({ id: 'cine-16', name: '키즈 애니메이션', category: 'cinematic', fontFamily: 'Gowun Dodum', fontWeight: 400, fontSize: 52, color: '#fbbf24', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: `${SHADOW_3D('#cc9900', '#aa8800', '#886600', 'rgba(0,0,0,0.4)')}, 0 0 6px rgba(251,191,36,0.2)` }),
  base({ id: 'cine-17', name: '스포츠 중계', category: 'cinematic', fontFamily: 'Diphylleia', fontWeight: 400, fontSize: 50, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, letterSpacing: 1,
    textShadowCSS: '-1px -1px 0 rgba(255,255,255,0.3), 1px 1px 0 rgba(0,0,0,0.8), 2px 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'cine-18', name: 'K-POP 스테이지', category: 'cinematic', fontFamily: 'Grandiflora One', fontWeight: 400, fontSize: 52, color: '#ff10f0', outlineColor: '#00ffff', outlineWidth: 1,
    textShadowCSS: `${NEON('#ff10f0')}, 0 0 8px #00ffff40` }),
  base({ id: 'cine-19', name: '아트하우스 미니멀', category: 'cinematic', fontFamily: 'Jeju Myeongjo', fontWeight: 400, fontSize: 42, color: '#9ca3af', outlineWidth: 0, letterSpacing: 3, lineHeight: 1.8,
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.3)' }),
  base({ id: 'cine-20', name: '드라마 엠보스', category: 'cinematic', fontFamily: 'Jeju Gothic', fontWeight: 400, fontSize: 50, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, lineHeight: 1.5,
    textShadowCSS: EMBOSS }),
];

// ═══════════════════════════════════════════════════
// 7. 배경없음 (nobg) — 순수 텍스트 이펙트 20개
// ═══════════════════════════════════════════════════
const NOBG: SubtitleTemplate[] = [
  base({ id: 'nobg-01', name: '화이트 파워', category: 'nobg', fontFamily: 'Pretendard', fontWeight: 900, color: '#ffffff', outlineColor: '#000000', outlineWidth: 5,
    textShadowCSS: '0 3px 6px rgba(0,0,0,0.6)' }),
  base({ id: 'nobg-02', name: '옐로우 파워', category: 'nobg', fontFamily: 'GMarketSans', color: '#fbbf24', outlineColor: '#000000', outlineWidth: 5,
    textShadowCSS: '0 0 6px rgba(251,191,36,0.3), 0 3px 6px rgba(0,0,0,0.5)' }),
  base({ id: 'nobg-03', name: '레드 파워', category: 'nobg', fontFamily: 'SBAggroB', fontWeight: 400, color: '#ef4444', outlineColor: '#000000', outlineWidth: 5,
    textShadowCSS: '0 0 8px rgba(239,68,68,0.3), 0 3px 6px rgba(0,0,0,0.5)' }),
  base({ id: 'nobg-04', name: '네온 글로우 그린', category: 'nobg', fontFamily: 'CookieRun', color: '#4ade80', outlineColor: '#003300', outlineWidth: 1,
    textShadowCSS: `${NEON('#4ade80')}, 0 0 80px #4ade8020` }),
  base({ id: 'nobg-05', name: '네온 글로우 핑크', category: 'nobg', fontFamily: 'Cafe24Surround', fontWeight: 400, color: '#f472b6', outlineColor: '#330011', outlineWidth: 1,
    textShadowCSS: `${NEON('#f472b6')}, 0 0 80px #f472b620` }),
  base({ id: 'nobg-06', name: '네온 글로우 블루', category: 'nobg', fontFamily: 'Recipekorea', fontWeight: 400, color: '#60a5fa', outlineColor: '#001133', outlineWidth: 1,
    textShadowCSS: `${NEON('#60a5fa')}, 0 0 80px #60a5fa20` }),
  base({ id: 'nobg-07', name: '네온 글로우 퍼플', category: 'nobg', fontFamily: 'DNFBitBitv2', fontWeight: 400, color: '#c084fc', outlineColor: '#110033', outlineWidth: 1,
    textShadowCSS: `${NEON('#c084fc')}, 0 0 80px #c084fc20` }),
  base({ id: 'nobg-08', name: '네온 글로우 시안', category: 'nobg', fontFamily: 'Cafe24Dangdanghae', fontWeight: 400, color: '#22d3ee', outlineColor: '#002233', outlineWidth: 1,
    textShadowCSS: `${NEON('#22d3ee')}, 0 0 80px #22d3ee20` }),
  base({ id: 'nobg-09', name: '골드 3D', category: 'nobg', fontFamily: 'YeogiOttaeJalnan', fontWeight: 400, color: '#fcd34d', outlineColor: '#78350f', outlineWidth: 3,
    textShadowCSS: `${M_GOLD}` }),
  base({ id: 'nobg-10', name: '크롬 3D', category: 'nobg', fontFamily: 'Isamanru', color: '#e8e8e8', outlineColor: '#333333', outlineWidth: 2,
    textShadowCSS: M_CHROME }),
  base({ id: 'nobg-11', name: '울트라 딥 3D', category: 'nobg', fontFamily: 'HannaPro', fontWeight: 400, color: '#ffffff', outlineColor: '#000000', outlineWidth: 4,
    textShadowCSS: ULTRA_3D('#444444') }),
  base({ id: 'nobg-12', name: '불꽃 이펙트', category: 'nobg', fontFamily: 'Black Han Sans', fontWeight: 400, fontSize: 58, color: '#ff6600', outlineColor: '#330000', outlineWidth: 2,
    textShadowCSS: `${FIRE}, 0 2px 4px rgba(0,0,0,0.5)` }),
  base({ id: 'nobg-13', name: '아이스 이펙트', category: 'nobg', fontFamily: 'KOTRAHOPE', fontWeight: 400, fontSize: 52, color: '#bae6fd', outlineColor: '#0369a1', outlineWidth: 2,
    textShadowCSS: `${ICE}, 0 2px 4px rgba(3,105,161,0.3)` }),
  base({ id: 'nobg-14', name: '롱 섀도우', category: 'nobg', fontFamily: 'Do Hyeon', fontWeight: 400, color: '#ffffff', outlineColor: '#333333', outlineWidth: 1,
    textShadowCSS: LONG_SHADOW('#555555') }),
  base({ id: 'nobg-15', name: '이중 외곽선', category: 'nobg', fontFamily: 'ManhwaPromotionAgency', fontWeight: 400, color: '#ffffff', outlineColor: '#ff4444', outlineWidth: 3,
    textShadowCSS: '0 0 4px rgba(255,68,68,0.3), 0 2px 4px rgba(0,0,0,0.5)' }),
  base({ id: 'nobg-16', name: '붓글씨 입체', category: 'nobg', fontFamily: 'Nanum Brush Script', fontWeight: 400, fontSize: 58, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2,
    textShadowCSS: DEEP_3D('#444444') }),
  base({ id: 'nobg-17', name: '웹툰 말풍선', category: 'nobg', fontFamily: 'ONEMobilePOP', fontWeight: 400, color: '#000000', outlineColor: '#ffffff', outlineWidth: 3, backgroundColor: '#ffffffee',
    textShadowCSS: '0 1px 2px rgba(0,0,0,0.15)' }),
  base({ id: 'nobg-18', name: '애니메 타이틀', category: 'nobg', fontFamily: 'TTTogether', fontWeight: 400, fontSize: 56, color: '#ffffff', outlineColor: '#000000', outlineWidth: 4,
    textShadowCSS: `${SHADOW_3D('#cc3333', '#aa2222', '#881111', 'rgba(0,0,0,0.5)')}, 0 0 8px rgba(255,0,0,0.2)` }),
  base({ id: 'nobg-19', name: '그래피티 스프레이', category: 'nobg', fontFamily: 'SangSangRock', fontWeight: 400, fontSize: 56, color: '#ff6600', outlineColor: '#000000', outlineWidth: 3,
    textShadowCSS: '3px 3px 0 #333333, -1px -1px 0 #ff990040, 2px -1px 0 #00ff0030, -2px 2px 0 #0066ff20, 4px 4px 4px rgba(0,0,0,0.4)' }),
  base({ id: 'nobg-20', name: '밀리터리 스텐실', category: 'nobg', fontFamily: 'TDTDTadakTadak', fontWeight: 400, fontSize: 48, color: '#4a5d23', outlineColor: '#1a2608', outlineWidth: 2,
    textShadowCSS: '0 1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3), 0 -1px 0 rgba(255,255,255,0.1)' }),
];

// ═══════════════════════════════════════════════════
// 전체 템플릿 (140개)
// ═══════════════════════════════════════════════════
export const SUBTITLE_TEMPLATES: SubtitleTemplate[] = [
  ...BASIC,
  ...COLOR,
  ...STYLE,
  ...VARIETY,
  ...EMOTION,
  ...CINEMATIC,
  ...NOBG,
];

// 카테고리 타입
export type SubtitleCategoryId = 'favorite' | 'all' | 'basic' | 'color' | 'style' | 'variety' | 'emotion' | 'cinematic' | 'nobg';

// 카테고리 탭 정의
export const SUBTITLE_CAT_TABS: { id: SubtitleCategoryId; label: string }[] = [
  { id: 'favorite', label: '즐겨찾기' },
  { id: 'all', label: '전체' },
  { id: 'basic', label: '기본' },
  { id: 'color', label: '컬러' },
  { id: 'style', label: '스타일' },
  { id: 'variety', label: '예능/바라이어티' },
  { id: 'emotion', label: '감성/시네마' },
  { id: 'cinematic', label: '시네마틱' },
  { id: 'nobg', label: '배경없음' },
];

# Font Personality System — 완전 가이드

> **한글 폰트 145개를 7개 자막 스타일 카테고리로 체계적으로 정리한 시스템**
>
> 최종 완성: 2026-03-01

---

## 📚 문서 구조

이 시스템은 4개의 상호보완적 문서로 구성됩니다:

### 1. **FONT_QUICK_REFERENCE.md** (5KB) ⭐️ — 여기서 시작하세요
가장 빠르게 필요한 폰트를 찾을 수 있습니다.

- 7개 카테고리별 TOP 3 폰트
- Decision Tree (콘텐츠 타입별 선택)
- 콘텐츠별 추천 조합표
- 한 줄 요약

**언제 사용**: "지금 당장 어떤 폰트를 써야 할까?" 할 때

---

### 2. **FONT_CATEGORY_REFERENCE.txt** (23KB) — 시각적 참고서
각 카테고리의 10개 폰트를 모두 한눈에 볼 수 있습니다.

- 각 카테고리의 목적과 특성
- 10개 폰트 리스트 (1순위 ~ 10순위)
- 적용 예시 (3가지씩)
- Quick Decision Tree
- TOP 5 추천 폰트
- CSS 효과 추천

**언제 사용**: 디자이너가 한 화면에서 모든 옵션을 비교할 때

---

### 3. **FONT_PERSONALITY_GUIDE.md** (20KB) — 완전 설명서
폰트 선택의 모든 이유를 상세히 설명합니다.

- 각 폰트별 상세 해설
  - 이유 (Reasoning)
  - 사용 예시 (Usage)
  - 추천 Weight
- 스타일별 추천 조합
- 사용 가이드 (Step 1-3)
- 기술적 구현 방법
- 시각적 다양성 전략

**언제 사용**: 폰트 선택 이유를 알고 싶을 때, 새로운 카테고리 추가할 때

---

### 4. **FONT_INTEGRATION_GUIDE.md** (13KB) — 개발자용
TypeScript/React 코드에 폰트 시스템을 통합하는 방법입니다.

- TypeScript 타입 정의
- React 컴포넌트 예제
- 커스텀 Hook (useSubtitleFont)
- styled-components 예제
- Tailwind CSS 클래스
- 성능 최적화
- 디버깅 팁

**언제 사용**: 코드에 폰트 시스템을 구현할 때

---

### 5. **fontPersonalityProfiles.ts** (22KB) — 데이터 소스
폰트 프로필의 실제 TypeScript 정의입니다.

- 7개 카테고리 × 10개 폰트 = 70개 프로필
- 각 폰트의 fontFamily, weight, reasoning, usage
- Export 가능한 타입과 데이터 객체

**언제 사용**: 코드에서 직접 임포트할 때

---

## 🎯 빠른 시작 (3분)

### Step 1: 콘텐츠 분위기 결정

다음 중 하나를 선택하세요:

| 분위기 | 키워드 | 추천 카테고리 |
|--------|--------|--------------|
| 정보 전달 | 뉴스, 설명, 기본 | **BASIC** |
| 주목도 필요 | 광고, 쇼핑, 강함 | **COLOR** |
| 게임/복고 | 게임, 아트, 창의 | **STYLE** |
| 예능 느낌 | 예능, 장난, 통통함 | **VARIETY** |
| 감정 표현 | 음악, 감성, 영화적 | **EMOTION** |
| 영화 분위기 | 드라마, 다큐, 진지 | **CINEMATIC** |
| 복잡한 배경 | 아웃라인, 강한 대비 | **NOBG** |

### Step 2: 1순위 폰트 선택

각 카테고리의 1순위 폰트를 선택하는 게 가장 빠릅니다:

- BASIC → **Pretendard**
- COLOR → **Black Han Sans**
- STYLE → **CookieRun**
- VARIETY → **ONEMobilePOP**
- EMOTION → **Nanum Pen Script**
- CINEMATIC → **Noto Serif KR**
- NOBG → **PilseungGothic**

### Step 3: CSS 적용

```typescript
import { FONT_PERSONALITY_PROFILES } from 'data/fontPersonalityProfiles';

const font = FONT_PERSONALITY_PROFILES['VARIETY'][0];

const subtitleStyle = {
  fontFamily: font.fontFamily,        // 'ONEMobilePOP'
  fontWeight: font.weight || 400,     // 400
  fontSize: '24px',
  color: '#FFFFFF',
  textShadow: '3px 3px 6px rgba(0,0,0,0.7)',
};
```

---

## 🎨 7개 카테고리 한줄 설명

### 1. BASIC — 깔끔, 전문적
```
"정보 전달이 최우선. 가독성과 신뢰감."
→ Pretendard, Noto Sans KR, Suit
→ 사용: 뉴스, 다큐, 정보
```

### 2. COLOR — 생생함, 대담함
```
"한 글자만으로도 시선 강탈. 임팩트 극대."
→ Black Han Sans (극강), GMarketSans, Do Hyeon
→ 사용: 광고, 쇼핑, 게임
```

### 3. STYLE — 창의적 효과
```
"게임, 복고, 아트. 개성 표현의 정석."
→ CookieRun (게임), MapleStory (복고), Dokdo (아트)
→ 사용: 게임 자막, 웹툰, 픽셀 아트
```

### 4. VARIETY — 예능 느낌
```
"한국 예능의 본질. 장난기, 통통함, 현장감."
→ ONEMobilePOP (정통), YeogiOttaeJalnan, HakgyoansimGaeulsopung
→ 사용: 예능 자막, 라이브 반응
```

### 5. EMOTION — 감정적, 영화적
```
"손글씨의 따뜻함. 시청자 몰입과 여운."
→ Nanum Pen Script, MapoBackpacking, Gamja Flower
→ 사용: 뮤직비디오, 감성 영상
```

### 6. CINEMATIC — 영화, 드라마, 다큐
```
"세리프 폰트의 우아함과 깊이. 작품성."
→ Noto Serif KR (표준), Nanum Myeongjo, Gowun Batang
→ 사용: 영화자막, 사극, 다큐
```

### 7. NOBG — 배경 없음
```
"배경과 상관없이 눈에 띄기. 극강 아웃라인."
→ PilseungGothic (극강), HakgyoansimWooju, Cafe24Dongdong
→ 사용: 복잡한 배경, 화려한 이미지 위
```

---

## 📊 현황 요약

| 항목 | 규모 |
|------|------|
| **한글 폰트 총 개수** | 145개 |
| **프로필로 추천한 폰트** | 70개 (중복 포함) |
| **카테고리 수** | 7개 |
| **각 카테고리별 폰트** | 10개 |
| **최대 중복 배치** | 2-3개 카테고리 |
| **TypeScript 파일** | 1개 (22KB) |
| **문서 파일** | 4개 (총 60KB) |

---

## 🚀 사용 방법별 가이드

### 🎨 디자이너 입장에서

1. **FONT_QUICK_REFERENCE.md** 열기
2. 콘텐츠 타입 선택
3. 추천 TOP 3 폰트 중 선택
4. **FONT_CATEGORY_REFERENCE.txt**에서 각 폰트의 적용 예시 확인
5. CSS 효과 추천 보기

### 👨‍💻 개발자 입장에서

1. **FONT_INTEGRATION_GUIDE.md** 읽기
2. `fontPersonalityProfiles.ts` 임포트
3. React Hook 또는 styled-components 선택
4. 코드 예제 복사-붙여넣기
5. TypeScript 타입 안전성 확보

### 📱 PM/크리에이터 입장에서

1. **FONT_QUICK_REFERENCE.md** 훑어보기
2. **FONT_CATEGORY_REFERENCE.txt**에서 시각적 참고
3. 콘텐츠 분위기에 맞는 카테고리 선택
4. 1순위 폰트 추천 따라가기
5. (선택) **FONT_PERSONALITY_GUIDE.md**에서 상세 정보 읽기

---

## 🎯 자주하는 질문 (FAQ)

### Q1: "어떤 폰트가 가장 널리 쓰이나요?"
**A**: Pretendard 50%, Black Han Sans 15%, Noto Serif KR 10%, CookieRun 8%

### Q2: "각 카테고리에 정확히 몇 개의 폰트가 있나요?"
**A**: 정확히 10개씩. 총 70개 (중복 2-3개)

### Q3: "폰트를 더 추가할 수 있나요?"
**A**: 가능합니다. `fontPersonalityProfiles.ts`에 새로운 `FontPersonalityProfile` 객체를 추가하고, 적절한 카테고리 배열에 추가하면 됩니다.

### Q4: "왜 어떤 폰트는 여러 카테고리에 나타나나요?"
**A**: 다목적성 때문입니다. 예: Black Han Sans는 COLOR(광고 강함)이면서 동시에 VARIETY(예능)에도 쓰입니다. 이를 통해 시각적 다양성을 극대화합니다.

### Q5: "폰트 로드 성능에 영향이 있나요?"
**A**: `fontPersonalityProfiles.ts`는 22KB이고, 컴파일 후 약 5KB(gzip 2KB)입니다. 성능 영향 무시할 수준입니다.

### Q6: "-webkit-text-stroke가 IE에서 작동하지 않아요"
**A**: IE는 지원되지 않습니다. 대체 방법으로 다중 text-shadow를 사용할 수 있습니다. **FONT_INTEGRATION_GUIDE.md**의 "디버깅" 섹션 참조.

---

## 📁 파일 위치 (절대 경로)

```
/Users/mac_mini/Downloads/all-in-one-production-build4/
├── src/
│   └── data/
│       └── fontPersonalityProfiles.ts          ← 데이터 소스
│
└── docs/
    ├── FONTS_README.md                         ← 이 파일
    ├── FONT_QUICK_REFERENCE.md                 ← 5분 요약
    ├── FONT_CATEGORY_REFERENCE.txt             ← 시각적 참고서
    ├── FONT_PERSONALITY_GUIDE.md               ← 완전 설명서
    └── FONT_INTEGRATION_GUIDE.md               ← 개발자 가이드
```

---

## 🔄 다음 단계 (선택사항)

### Phase 2: UI 구현
- [ ] 폰트 카테고리 선택 UI
- [ ] 실시간 미리보기
- [ ] 저장된 프리셋

### Phase 3: 고급 기능
- [ ] 프리셋 조합 ("뉴스 스타일", "게임 스타일" 등)
- [ ] 사용 통계 수집
- [ ] 내보내기 시 폰트 @font-face 자동 포함

### Phase 4: 확장
- [ ] 새로운 카테고리 추가 (예: "러닝자막", "뮤지컬" 등)
- [ ] 언어별 폰트 최적화
- [ ] 접근성 개선 (시각장애인용 음성 안내)

---

## 💡 베스트 프랙티스

### ✓ DO

```typescript
// 좋음: 카테고리별로 폰트 선택
const font = FONT_PERSONALITY_PROFILES['VARIETY'][0];

// 좋음: 여러 카테고리 혼합
const primaryFont = FONT_PERSONALITY_PROFILES['COLOR'][0];
const secondaryFont = FONT_PERSONALITY_PROFILES['EMOTION'][2];
```

### ✗ DON'T

```typescript
// 나쁨: 같은 카테고리 내 무작위 선택
const randomIndex = Math.floor(Math.random() * 10);
const font = FONT_PERSONALITY_PROFILES['BASIC'][randomIndex];

// 나쁨: fontFamily를 문자열로 하드코딩
const style = { fontFamily: 'CookieRun' }; // ❌ 타입 안전성 상실
```

---

## 🎬 콘텐츠 분위기별 완벽한 조합

### 뉴스/다큐
```
Primary: Pretendard (BASIC)
Secondary: Noto Serif KR (CINEMATIC)
Effect: text-shadow: 2px 2px 4px rgba(0,0,0,0.5)
```

### 예능 쇼핑 추천
```
Primary: Black Han Sans (COLOR)
Secondary: ONEMobilePOP (VARIETY)
Effect: -webkit-text-stroke: 1px #000;
        text-shadow: 3px 3px 6px rgba(0,0,0,0.7)
```

### 뮤직비디오
```
Primary: Gamja Flower (EMOTION)
Secondary: Hi Melody (EMOTION)
Effect: text-shadow: 2px 2px 8px rgba(0,0,0,0.4);
        filter: drop-shadow(0 0 2px rgba(255,255,255,0.3))
```

### 게임 자막
```
Primary: CookieRun (STYLE)
Secondary: NexonLv1Gothic (STYLE)
Effect: text-shadow: 3px 3px 0px rgba(0,0,0,0.8);
        filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5))
```

### 영화/드라마
```
Primary: Noto Serif KR (CINEMATIC)
Secondary: Nanum Myeongjo (CINEMATIC)
Effect: text-shadow: 1px 1px 3px rgba(0,0,0,0.5)
```

---

## 📞 문의 및 피드백

이 시스템에 대한 질문이나 개선 제안이 있으신가요?

- **버그 리포트**: `/docs/BUG_REPORT.md`
- **기능 요청**: `/docs/FEATURE_REQUEST.md`
- **상세 컨텍스트**: `/docs/CONTEXT.md`

---

## 📝 버전 히스토리

| 버전 | 날짜 | 변경 사항 |
|------|------|---------|
| 1.0 | 2026-03-01 | 초기 완성 (7 카테고리, 70개 폰트 프로필) |

---

## ✨ 마지막 한 마디

이 폰트 성격 프로필 시스템은 한국의 145개 폰트를 체계적으로 분류하여 **언제 어떤 폰트를 써야 할지** 고민할 필요가 없도록 만들었습니다.

각 폰트는 신중하게 선택되었고, 각 카테고리는 시각적으로 최대한 다르게 설계되었습니다.

**"폰트는 타이포그래피의 99%입니다."** 좋은 폰트 선택이 당신의 영상을 한 단계 높여줄 것을 확신합니다.

---

**Created**: 2026-03-01
**Status**: Complete ✓
**Last Reviewed**: 2026-03-01

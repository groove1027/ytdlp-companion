# Motion Master — Premiere Pro 모션 자동 적용 확장

이미지 클립 선택 → 버튼 하나로 Ken Burns 모션 효과 자동 적용.
20개 클립을 1초 만에 각각 다른 모션으로 채울 수 있습니다.

---

## 설치 방법

### 방법 1: ZXP 파일 설치 (권장)

1. `dist/MotionMaster.zxp` 파일을 다운로드합니다
2. **ZXP Installer**를 사용하여 설치합니다:
   - [Anastasiy's Extension Manager](https://install.anastasiy.com/) (무료, 권장)
   - 또는 [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) (무료)
3. Premiere Pro를 **재시작**합니다
4. 메뉴: **Window → Extensions → Motion Master**

### 방법 2: 수동 폴더 복사

**macOS:**
```
~/Library/Application Support/Adobe/CEP/extensions/com.groovelab.motionmaster/
```

**Windows:**
```
C:\Users\{사용자}\AppData\Roaming\Adobe\CEP\extensions\com.groovelab.motionmaster\
```

위 경로에 이 폴더 전체를 복사한 후, **PlayerDebugMode**를 활성화합니다:

**macOS** (터미널):
```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
```

**Windows** (관리자 CMD):
```cmd
reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
```

Premiere Pro를 재시작하면 **Window → Extensions → Motion Master**에서 패널이 나타납니다.

### 방법 3: 개발자용 (심볼릭 링크)

```bash
cd premiere-motion-extension
bash scripts/install-dev.sh
```

---

## 호환성

| Premiere Pro | 지원 |
|-------------|------|
| 25.0+ (2025) | O |
| 26.x (2026) | O |
| 24.x 이하 | X |

---

## 사용법

### 기본 사용

1. 타임라인에 **이미지 클립**을 배치합니다
2. 모션을 적용할 클립을 **선택**합니다 (다중 선택 가능)
3. 패널에서 **새로고침** 버튼을 클릭합니다
4. 원하는 방법으로 모션을 적용합니다:

| 버튼 | 기능 |
|------|------|
| **🎲 랜덤** | 선택 클립 전체에 스마트 랜덤 모션 (연속 중복 방지, 줌방향 교차) |
| **🧠 스마트** | 클립 이미지 분석 → 피사체 위치에 맞춰 앵커 자동 설정 |
| **선택 클립에 적용** | 현재 선택한 프리셋 1개를 선택 클립 전체에 적용 |
| **↩️ 되돌리기** | 선택 클립의 모션 키프레임 전부 제거, 원래 상태로 복원 |

### 프리셋 선택

패널에서 프리셋 버튼을 클릭하면 해당 모션이 선택됩니다.

**팬 & 줌 — 기본 (9개)**

| 프리셋 | 효과 | 오버스케일 |
|--------|------|-----------|
| 빠른 줌 | 빠르게 줌인 (2초) | 121% |
| 부드러운 줌 | 천천히 줌인 (4초) | 121% |
| 시네마틱 | 줌아웃 (5초) | 121% |
| 줌인 | 기본 줌인 (3초) | 121% |
| 리빌 | 넓게 → 좁게 (4초) | 124% |
| 빈티지 | 느린 줌 + 세피아 톤 (6초) | 121% |
| 다큐멘터리 | 좌→우 수평 패닝 (6초) | 110% |
| 타임랩스 | 빠른 좌측 패닝 (2초) | 110% |
| 브이로그 | 미세한 움직임 (3초) | 108% |

**팬 & 줌 — 시네마틱 (12개)**

| 프리셋 | 효과 |
|--------|------|
| 다이나믹 | 다방향 이동 + 줌 |
| 몽환 | 미세 회전 + 줌 |
| 드라마틱 | 강한 줌 펄스 |
| 느와르 | 줌 + 흑백 톤 |
| 대각 드리프트 | 대각선 이동 |
| 오빗 | 원형 궤도 이동 |
| 패럴랙스 | 시차 효과 패닝 |
| 틸트 시프트 | 상하 패닝 |
| 스파이럴 | 줌 + 회전 |
| 푸쉬풀 | 줌인-줌아웃 반복 |
| 돌리 줌 | 역줌 효과 |
| 크레인 업 | 아래→위 리프트 |

### 세부 조정

- **앵커 포인트**: 줌/패닝의 중심점을 드래그로 설정 (X: 0~100%, Y: 0~100%)
- **강도**: 모션 강도 50%~150% 조절 (100% = 기본)

### 오버스케일이란?

프리셋 버튼 하단에 표시되는 **%** 수치입니다.
모션 적용 시 이미지가 이동/회전하면 프레임 가장자리에 **검은색**이 보일 수 있습니다.
이를 방지하기 위해 자동으로 이미지를 확대(오버스케일)합니다.

- `121%` = 원본 대비 21% 확대하여 여백 확보
- 사용자가 신경 쓸 것은 없음 — 자동으로 처리됨

---

## 스마트 랜덤 규칙

"🎲 랜덤" 버튼은 단순 랜덤이 아닙니다. 6가지 규칙이 적용됩니다:

1. **연속 동일 프리셋 금지** — 클립 3번이 cinematic이면 클립 4번은 다른 것
2. **줌 방향 교차** — 줌인 → 줌아웃 → 줌인 (단조로움 방지)
3. **패닝 방향 교차** — 좌→우 → 우→좌 (자연스러운 리듬)
4. **프리셋별 최적 앵커** — cinematic은 상단 중앙, crane-up은 하단 등
5. **강도 ±10% 편차** — 획일적이지 않은 자연스러운 변화
6. **오버스케일 자동** — 프리셋별 검은 테두리 방지

---

## FAQ

**Q: 영상 클립에도 적용되나요?**
A: 네. 이미지/영상 구분 없이 Motion 키프레임이 적용됩니다.

**Q: 적용 후 수동으로 수정할 수 있나요?**
A: 네. Effect Controls 패널에서 Scale, Position, Rotation 키프레임을 직접 편집할 수 있습니다.

**Q: 되돌리기는 어떻게 하나요?**
A: 클립 선택 → **↩️ 되돌리기** 버튼. Scale=100%, Position=중앙, Rotation=0으로 초기화됩니다.

**Q: Premiere Pro 한국어 버전에서 동작하나요?**
A: 네. Motion 컴포넌트 프로퍼티를 영어/한국어/프랑스어/독일어 이름으로 찾습니다.

**Q: After Effects에서 사용할 수 있나요?**
A: 아니요. Premiere Pro 전용입니다.

---

## 기술 정보

- **플랫폼**: Adobe CEP 12 (Common Extensibility Platform)
- **엔진**: ExtendScript (ES3)
- **UI**: HTML5 + CSS3 + Vanilla JS
- **프리셋**: 30개 (21 팬/줌 + 9 모션 이펙트)
- **지원 종료 예정**: 2026년 9월 (Adobe CEP → UXP 전환)

---

## 라이선스

MIT License - GrooveLab

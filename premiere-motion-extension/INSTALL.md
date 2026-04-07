---
title: Motion Master 설치 가이드
description: Adobe Premiere Pro에 Motion Master UXP 플러그인을 설치하는 단계별 안내
audience: end-user
platform: Adobe Premiere Pro v25.6+
plugin: Motion Master v2.0.0 (UXP)
last_updated: 2026-04-07
---

# Motion Master 설치 가이드

> **Motion Master**는 Adobe Premiere Pro용 UXP 플러그인입니다.
> 이미지·영상 클립을 선택하고 버튼 한 번으로 30가지 Ken Burns 모션을 자동 적용합니다.

---

## ✅ 설치 전 필수 조건

| 항목 | 요구사항 |
|------|---------|
| **OS** | macOS 12+ / Windows 10+ |
| **Premiere Pro 버전** | **v25.6 이상** (UXP v8.1 graduated) |
| **무료 도구** | UXP Developer Tool (UDT) v2.2.1 이상 |
| **Premiere 라이선스** | Creative Cloud 구독 (모든 등급 가능) |

> ⚠️ **Premiere v25.5 이하는 UXP를 지원하지 않습니다.**
> Creative Cloud Desktop 앱에서 Premiere Pro를 최신 버전으로 업데이트해 주세요.

---

## 1단계 — Premiere Pro 버전 확인

1. Adobe **Premiere Pro** 실행
2. 메뉴: **Premiere Pro → About Premiere Pro** (macOS)
   또는 **Help → About Premiere Pro** (Windows)
3. 다이얼로그에서 버전 숫자 확인

| 버전 | 결과 |
|---|---|
| ✅ **25.6 ~ 26.x** | 진행 가능 |
| ❌ **25.5 이하** | Creative Cloud Desktop에서 업데이트 후 다시 시도 |

---

## 2단계 — UXP Developer Tool 설치

UDT는 Adobe의 공식 무료 개발자 도구입니다. **한 번만 설치**하면 됩니다.

### 방법 A — Creative Cloud Desktop (권장)

1. **Creative Cloud Desktop** 앱 실행
2. 좌측 사이드바: **All apps**(모든 앱)
3. 검색창에 **`UXP Developer Tool`** 입력
4. 검색 결과에서 **Install** 클릭
5. 설치 완료 후 **버전 v2.2.1 이상**인지 확인

### 방법 B — 직접 다운로드

- 공식 다운로드 페이지: <https://creativecloud.adobe.com/apps/download/uxp-developer-tools>
- macOS 또는 Windows 빌드 다운로드 → 설치

---

## 3단계 — UDT에 Motion Master 추가

1. **UXP Developer Tool** 실행
2. 우상단의 **`Add Plugin`** 버튼(또는 **`+`** 아이콘) 클릭
3. 파일 선택 다이얼로그가 뜨면, **반드시 아래 경로의 `manifest.json`을 선택**:

   ```text
   premiere-motion-extension/build/manifest.json
   ```

   > ⚠️ **`build/` 폴더 안의 manifest.json**입니다.
   > 루트 디렉터리(`premiere-motion-extension/manifest.json`)는 소스용이고
   > UDT는 빌드된 산출물(`build/manifest.json`)을 가리켜야 합니다.

4. UDT 플러그인 목록에 **Motion Master** 행이 등장
5. UDT가 실행 중인 Premiere Pro 인스턴스를 자동 감지 (행 우측에 Premiere 표시)

---

## 4단계 — Premiere에 Load + 패널 열기

1. **Premiere Pro가 이미 실행 중**이어야 합니다 (UDT가 연결할 수 있도록)
2. UDT의 **Motion Master** 행에서 **`•••`**(Actions 메뉴) → **`Load`** 클릭
3. Premiere Pro로 전환
4. 메뉴: **Window → UXP Plugins → Motion Master**
5. 패널이 우측 도크에 열림 (380×700, 다크 OKLCH 디자인)

> 💡 **첫 로드 시 권한 다이얼로그**: `localFileSystem`, `clipboard` 요청이 뜨면 **모두 허용**해 주세요.
> Motion Master는 키프레임 적용을 위해 이 권한이 필요합니다.

---

## 5단계 — 사용 방법

1. **타임라인에 이미지 또는 영상 클립** 배치
2. 모션을 적용할 클립을 **선택** (다중 선택 가능)
3. Motion Master 패널에서:

| 동작 | 설명 |
|---|---|
| **새로고침** | 선택된 클립을 패널에 인식시킴 |
| **Pan & Zoom 21개** | 기본 9개 + 시네마틱 12개 프리셋 그리드에서 선택 |
| **Effects 9개** | Slow / Rotate / Pan / Shake / Glitch 등 모션 이펙트 |
| **AnchorPad** | 줌·패닝 중심점을 드래그로 조정 (또는 9-point 클릭) |
| **Intensity** | 모션 강도 50% ~ 150% (기본 100%) |
| **Apply to Selected** | 선택된 모든 클립에 현재 설정으로 모션 적용 |
| **🎲 Random** | 스마트 랜덤 — 연속 중복 방지 / 줌 방향 교차 / 6가지 규칙 |
| **🧠 Smart** | 클립 이미지 분석 → 피사체 위치에 맞춰 앵커 자동 설정 |
| **↩️ Undo** | 선택 클립의 모션 키프레임 전부 제거 (원본 복원) |

4. **Effect Controls** 패널에서 Scale / Position / Rotation 키프레임이 들어간 것을 직접 확인할 수 있습니다.

---

## 🔧 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| **UDT에서 Premiere가 감지 안 됨** | Premiere를 먼저 실행 → UDT 우상단 **Refresh** 클릭 |
| **Window 메뉴에 UXP Plugins가 없음** | Premiere 버전이 25.6 미만 → 업데이트 필요 |
| **Motion Master가 UXP Plugins 메뉴에 안 나타남** | UDT에서 **Unload → Load** 다시 한 번 |
| **권한 다이얼로그가 매번 떠요** | 첫 1회 모두 **허용** 클릭 → localStorage에 저장됨 |
| **패널은 떴는데 클립이 인식 안 됨** | 시퀀스가 활성화돼 있어야 함 → 타임라인 클릭 후 **새로고침** |
| **Premiere를 껐다 켜면 사라짐** | UDT 방식의 정상 동작 — 매번 **Load** 필요. 영구 설치는 아래 `.ccx` 항목 참조 |
| **모션이 적용 안 됨** | 클립에 **선택 표시**(파란 외곽선)가 있는지 확인 → 패널 **새로고침** → 다시 시도 |
| **에러 발생** | UDT에서 Motion Master 행 → **Debug** 클릭 → Chrome DevTools Console에서 에러 로그 확인 |

---

## 💾 (선택) 영구 설치 — `.ccx` 패키지

UDT 없이 매번 자동 로드되도록 영구 설치하려면:

1. UDT의 Motion Master 행에서 **`•••` → `Package`** 클릭
2. `.ccx` 파일이 생성됨 (예: `MotionMaster-2.0.0.ccx`)
3. `.ccx` 파일을 더블클릭 → **UXP Plugin Installer Agent (UPIA)** 가 자동으로 설치
4. 이후 Premiere를 재시작하면 **Window → UXP Plugins → Motion Master** 가 자동으로 등장 (UDT 불필요)

> 📌 **Adobe Marketplace 제출**: 정식 배포를 원한다면 Adobe Developer Console에서 플러그인 등록 + 서명 + 심사가 필요합니다.

---

## ❓ FAQ

**Q. Premiere를 한국어로 사용 중인데 동작하나요?**
A. 네. Motion 컴포넌트를 영어 / 한국어 / 프랑스어 / 독일어 4개 언어로 매칭합니다.

**Q. After Effects나 다른 Adobe 앱에도 설치할 수 있나요?**
A. 아니요. **Premiere Pro 전용**입니다. (`manifest.json`의 host 설정이 `premierepro` 고정)

**Q. 영상 클립에도 적용되나요?**
A. 네. 이미지/영상 구분 없이 Motion 키프레임이 적용됩니다.

**Q. 적용한 모션을 수동으로 수정할 수 있나요?**
A. 네. **Effect Controls** 패널에서 Scale/Position/Rotation 키프레임을 직접 편집할 수 있습니다.

**Q. 되돌리기는 어떻게 하나요?**
A. 클립 선택 → 패널의 **↩️ Undo** 버튼 클릭. Scale=100%, Position=중앙, Rotation=0으로 초기화됩니다.

**Q. 코드 수정 후 어떻게 다시 빌드하나요?**

```bash
cd premiere-motion-extension
npm install        # 첫 1회만
npm run build      # 304K bundle, ~91ms
```

빌드 완료 후 UDT에서 Motion Master 행 → **Reload** 클릭하면 즉시 반영됩니다.

---

## 📚 기술 정보

| 항목 | 값 |
|---|---|
| **플러그인 ID** | `com.groovelab.motionmaster` |
| **버전** | 2.0.0 (UXP) |
| **manifestVersion** | 5 |
| **Host** | `premierepro` minVersion `25.6.0` |
| **UI 스택** | React 18 + TypeScript strict + esbuild |
| **모던 라이브러리** | lucide-react · motion/react · clsx · OKLCH 컬러 |
| **API** | Premiere UXP API v8.1 (`require('premierepro')`) |
| **프리셋 수** | 30개 (21 Pan & Zoom + 9 Effects) |
| **지원 종료** | CEP 12 + ExtendScript는 2026-09 종료 — Motion Master는 100% UXP로 이미 전환 완료 |

---

## 🆘 추가 지원

설치 과정에서 막히는 부분이 있으면:
- UDT의 **Debug** 콘솔 로그 캡처
- Premiere Pro 버전 정보
- 사용 중인 OS 버전

위 정보와 함께 GitHub Issues에 보고해 주세요: <https://github.com/groove1027/all-in-one-production/issues>

---

**Made with ❤️ by GrooveLab** · MIT License

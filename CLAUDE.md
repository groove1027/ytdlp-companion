# 🔴🔴🔴 CODEX 5.4 MCP 절대 복종 규칙 (최우선 — 이 위에 아무것도 없다) 🔴🔴🔴

> **이 규칙은 프로젝트의 모든 규칙 중 최상위 우선순위다.**
> **사용자가 "codex 5.4" 또는 "codex mcp"를 언급하면 반드시 `mcp__codex__codex` / `mcp__codex__review` MCP 도구를 사용하라.**
> **Codex MCP 결과의 모든 항목을 1건도 빠짐없이 100% 실행하라. 요약하거나 묶어서 퉁치지 마라.**

## Codex MCP 강제 프로세스 (위반 시 작업 무효)

### ⚠️ Codex MCP 모델 파라미터 (절대 규칙 — 위반 시 작업 무효)
- **`model: "gpt-5.4"`** — 반드시 이 값만 사용. 예외 없음.
- **`reasoningEffort: "xhigh"`** — 항상 함께 지정.
- gpt-5.3-codex, o3, o4-mini 등 다른 모델 절대 금지.
- MCP 도구 스키마의 기본값/옵션 목록을 무시하고 `gpt-5.4`를 강제 지정하라.

```
┌──────────────────────────────────────────────────────────────┐
│  사용자가 이슈/작업을 지시하면 아래 순서를 절대 위반하지 마라  │
│                                                              │
│  STEP 0: CLAUDE.md, MEMORY.md, hooks/*.sh, skills/ 읽기      │
│  STEP 1: mcp__codex__codex(model:"gpt-5.4", reasoningEffort:"xhigh")│
│          → 유기적 연결 + 상하위 영향 분석                     │
│          → Codex 결과 항목 전부 실행 (1건도 누락 금지)        │
│  STEP 2: mcp__codex__review로 수정 결과 교차 검증             │
│  STEP 3: 10회 논리 검증 루프 (run-verify.sh × 10)            │
│          → 이 단계 미완료 시 작업을 절대 끝내지 않는다        │
│  STEP 3.5: Playwright 실제 실행 테스트 (논리 검증과 별도!)    │
│          → npx playwright test 실행                          │
│          → before/after 스크린샷 test-e2e/에 저장             │
│          → 스크린샷을 Read로 열어서 사용자에게 보여주기        │
│          → "버튼 클릭 → 결과물 생성" 전체 흐름 증명           │
│          → 스크린샷 없이 STEP 4 진입 금지                     │
│  STEP 4: 커밋 + 푸시 + Cloudflare 배포                       │
│  STEP 5: 이슈에 친절한 코멘트 달기                            │
│  STEP 6: 이슈 닫기                                           │
│                                                              │
│  ⚠️ 이슈가 여러 개면: 각 이슈마다 STEP 0~6 개별 적용         │
│     절대로 묶어서 한번에 처리하지 마라                         │
│     병렬 처리는 허용하되 각 이슈의 프로세스는 100% 유지        │
└──────────────────────────────────────────────────────────────┘
```

### 금지 사항 (Codex MCP 관련)
- ❌ Codex MCP 없이 수동 grep만으로 분석 완료 처리
- ❌ Codex 결과 중 일부만 실행하고 나머지 누락
- ❌ "간단한 수정이라 Codex 불필요"라고 판단하여 스킵
- ❌ 여러 이슈를 하나로 묶어서 프로세스 1회만 실행
- ❌ 10회 검증 루프 없이 커밋
- ❌ 커밋만 하고 푸시/배포 누락
- ❌ 이슈 코멘트/닫기 누락
- ❌ 제안사항을 무시하고 코멘트만 달기 (제안도 반드시 처리)

---

# 🔴🔴🔴 Playwright 실제 테스트 강제 규칙 (위반 시 작업 무효) 🔴🔴🔴

> **이 규칙은 "playwright 검증", "E2E 테스트", "실제 테스트"가 요구될 때 100% 적용된다.**
> **구조 확인(grep, 문자열 검색)을 "테스트 완료"로 퉁치면 작업 전체가 무효다.**

## 🔴 "테스트 했다"의 정의 (물리적 증거 필수 — 증거 없으면 거짓 보고)

> **논리 검증(codex review 10회) 통과 ≠ 실제 작동 확인. 이 둘은 완전히 별개다.**
> **스크린샷 증거 없이 "테스트 통과"라고 말하면 거짓 보고로 간주한다.**

### 테스트 완료로 인정되는 경우 (전부 충족해야 함)
1. `npx playwright test` 명령이 **실제로 실행됨** (터미널 출력 존재)
2. test-e2e/ 폴더에 **before/after 스크린샷**이 30분 이내에 생성됨
3. 저장된 스크린샷을 **Read 도구로 열어서 사용자에게 직접 보여줌**
4. **버튼 클릭 → 결과물 생성/다운로드 완료**까지 전체 흐름이 스크린샷으로 증명됨
5. Hook이 스크린샷 2장+ 존재를 확인해야 커밋 가능 (touch로 우회 불가)
6. **다운로드/생성 산출물이 있으면 반드시 디스크에 저장** (test-e2e/dl-* 파일)
7. **저장된 산출물의 파일 크기 > 0 확인** (expect(size).toBeGreaterThan(0))
8. **산출물 내용물 검증** — ZIP이면 unzip해서 내부 파일 목록 확인, JSON이면 파싱해서 키 확인

### "다운로드 검증 완료"의 정의 (파일 생성 기능에 필수)

> **토스트/알림이 "완료"라고 말하는 건 증거가 아니다. 실제 파일이 디스크에 있어야 한다.**

| 단계 | 필수 검증 | 예시 |
|------|----------|------|
| 1. 파일 저장 | `download.saveAs()` 또는 blob hook으로 **디스크에 저장** | `dl-capcut-project.zip` |
| 2. 크기 확인 | `fs.statSync(path).size > 100` | 빈 파일이 아닌지 |
| 3. 내용물 열기 | ZIP → `unzip -l` 또는 JSZip으로 파일 목록 확인 | `draft_content.json` 존재 |
| 4. 핵심 내용 검증 | JSON → 파싱 후 키 확인, XML → 태그 존재 확인 | `"tracks"` 키 존재 |

```ts
// ✅ 올바른 다운로드 검증 패턴
const dl = await downloadPromise;
const dlPath = 'test-e2e/dl-capcut.zip';
await dl.saveAs(dlPath);

// 크기 확인
const size = fs.statSync(dlPath).size;
expect(size).toBeGreaterThan(100);

// ZIP 내용물 확인
const { execSync } = require('child_process');
const zipContents = execSync(`unzip -l ${dlPath}`).toString();
expect(zipContents).toContain('draft_content.json');  // CapCut
expect(zipContents).toContain('.srt');                  // 자막 파일

// ❌ 이렇게 하면 안 됨
const toast = await page.textContent('.toast');
expect(toast).toContain('완료');  // 토스트만 보고 끝 → 파일 없음
```

### 테스트 완료로 인정되지 않는 경우
- DOM에 요소가 "있다"는 것만 확인 (버튼 존재 ≠ 버튼 작동)
- grep으로 코드에 문자열이 "있다"는 것만 확인
- "논리적으로 맞으므로 통과" 식의 판단
- 스크린샷 없이 "테스트 통과했습니다"
- touch .e2e-verified만 실행하고 실제 Playwright 미실행
- **토스트/알림만 확인하고 실제 파일 저장/내용 검증을 안 한 경우**
- **다운로드 버튼을 눌렀지만 파일이 디스크에 없는 경우**
- **page.evaluate() 안에서 수학 공식/알고리즘만 실행하고 "E2E 통과" 처리한 경우** ← 이건 단위 테스트이지 E2E가 아님!

---

## 절대 금지 (이걸 하면 "테스트 했다"고 인정 안 됨)

- ❌ 소스 파일에서 문자열 검색(`fs.readFileSync` + `includes`)으로 "코드 반영 확인" 처리
- ❌ `localStorage.getItem()` 키 존재 여부만 확인하고 "persist 동작 확인" 처리
- ❌ `page.textContent('body')`로 단어 포함 여부만 체크하고 "결과 존재" 처리
- ❌ 10초 이내 대기 후 "분석 완료" 판정
- ❌ 빌드된 JS 번들에서 문자열 grep으로 "기능 검증 완료" 처리
- ❌ 입력만 하고 결과를 확인 안 하는 테스트
- ❌ DOM에 버튼/요소가 존재하는지만 확인하고 "테스트 완료" 처리 (클릭→결과 확인까지 해야 함)
- ❌ touch .e2e-verified로 Hook 우회 (스크린샷 증거 없으면 커밋 차단됨)
- ❌ **`page.evaluate()` 안에서 수학 공식(Math.round, 타임코드 계산 등)만 실행하고 "E2E 통과" 처리**
- ❌ **브라우저 콘솔에서 함수를 직접 호출하고 "동작 확인" 처리**
- ❌ **코드에 있는 알고리즘을 브라우저에서 복사-실행하고 "정확성 검증" 처리**
- ❌ **UI 클릭 0회, 파일 업로드 0회, 파일 다운로드 0회인 테스트를 "E2E 통과"로 보고**

> **핵심 원칙**: `page.evaluate()` 수학 검증 = **단위 테스트**이지 E2E가 아니다.
> E2E는 **사용자가 실제로 하는 행동**(파일 업로드 → 버튼 클릭 → 결과물 다운로드)을 재현해야 한다.

## 필수 사항 (이걸 해야만 "테스트 했다"로 인정)

- ✅ **실제 UI 흐름**: 입력 → 버튼 클릭 → 로딩 완료 대기 → 결과 DOM 변화 확인
- ✅ **API 응답 대기**: `page.waitForResponse()`로 실제 네트워크 호출 완료 확인
- ✅ **before/after 비교**: 동작 전 상태 캡처 → 동작 수행 → 동작 후 상태 비교
- ✅ **스크린샷 증거**: 각 주요 단계(입력 전, 진행 중, 완료 후)별 스크린샷 저장
- ✅ **스크린샷 리뷰**: 저장된 스크린샷을 Read 도구로 열어서 사용자에게 직접 보여주기
- ✅ **충분한 대기**: API 호출이 포함된 테스트는 최소 60초 이상 대기 (`timeout: 60000`)
- ✅ **에러 케이스도 검증**: 의도적으로 실패해야 하는 시나리오(자막 없는 채널 등)는 에러 메시지가 실제로 표시되는지 확인

## 테스트 코드 작성 패턴 (반드시 이 구조를 따라라)

```ts
// ❌ 이렇게 하면 안 됨 — 가짜 테스트
const text = await page.textContent('body');
expect(text).toContain('결과');  // UI 라벨에 '결과'가 있으면 통과 → 의미 없음

// ❌ 이것도 안 됨 — 소스 코드 검사는 테스트가 아님
const code = fs.readFileSync('src/service.ts', 'utf-8');
expect(code).toContain('toFixed(3)');  // grep일 뿐

// ✅ 이렇게 해야 함 — 실제 동작 검증
// 1) 동작 전 상태 캡처
const beforeCount = await page.locator('.result-item').count();
await page.screenshot({ path: 'step1-before.png' });

// 2) 실제 사용자 동작 수행
await page.fill('input[placeholder*="URL"]', 'https://youtube.com/...');
await page.click('button:has-text("분석")');

// 3) 실제 API 응답 대기
await page.waitForResponse(
  resp => resp.url().includes('api') && resp.status() === 200,
  { timeout: 60000 }
);

// 4) 결과 DOM이 실제로 변했는지 확인
await page.waitForSelector('.result-item', { timeout: 30000 });
const afterCount = await page.locator('.result-item').count();
expect(afterCount).toBeGreaterThan(beforeCount);
await page.screenshot({ path: 'step2-after.png' });

// 5) 구체적인 결과 내용 확인
const resultText = await page.locator('.result-item').first().textContent();
expect(resultText!.length).toBeGreaterThan(50);  // 실제 내용이 있는지
```

## 버그 유형별 필수 검증 시나리오

| 버그 유형 | 반드시 해야 하는 테스트 |
|-----------|----------------------|
| API 결과 오류 | 실제 API 호출 → 응답 대기 → 결과 내용 확인 |
| 캐시/상태 버그 | 상태 A 설정 → 동작 수행 → 상태 B로 변경 확인 → 새로고침 → 상태 유지/초기화 확인 |
| UI 표시 오류 | 해당 UI 요소의 텍스트/속성/visibility를 직접 확인 |
| 에러 처리 | 의도적으로 실패 조건 유발 → 에러 메시지 DOM에 표시되는지 확인 |
| 비용/과금 | addCost 호출 → 숫자 변화 확인 → 새로고침 → 값 유지 확인 |
| **편집점/타임코드** | **실제 영상 업로드 → 분석 → NLE 내보내기 버튼 클릭 → ZIP 다운로드 → XML 내 ntsc/timebase/displayformat 값 grep 검증** |
| **FPS 감지** | **29.97fps 영상 업로드 → 감지 결과 29.97 확인 (콘솔 또는 UI) → 30fps 영상도 → 30 확인** |
| **Scene Detection** | **장면 전환 있는 영상 업로드 → 컷 포인트 2개+ 감지 → 콘솔에 "[Scene] ✅ N개 컷 포인트" 로그 확인** |

## "실제 영상/파일 없이 테스트 불가" 변명 금지

> **테스트용 영상이 없다는 것은 변명이 아니다. FFmpeg로 즉시 생성할 수 있다.**

```bash
# 29.97fps 테스트 영상 (3초, 장면 전환 포함)
ffmpeg -y -f lavfi -i "color=c=red:s=320x240:r=29.97:d=1.5,format=yuv420p[v0]; \
  color=c=blue:s=320x240:r=29.97:d=1.5,format=yuv420p[v1]; \
  [v0][v1]concat=n=2:v=1:a=0" \
  -f lavfi -i sine=frequency=440:duration=3 \
  -c:v libx264 -c:a aac -shortest test-e2e/test-video-2997.mp4

# 30fps 테스트 영상
ffmpeg -y -f lavfi -i testsrc=duration=3:size=320x240:rate=30 \
  -c:v libx264 test-e2e/test-video-30.mp4

# 60fps 테스트 영상
ffmpeg -y -f lavfi -i testsrc=duration=3:size=320x240:rate=60 \
  -c:v libx264 test-e2e/test-video-60.mp4
```

Playwright에서 이 영상을 사용하는 방법:
```ts
// 파일 업로드
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles('test-e2e/test-video-2997.mp4');

// 또는 드래그 앤 드롭 시뮬레이션
await page.dispatchEvent('.upload-zone', 'drop', { ... });
```

**"영상이 없어서 page.evaluate()로 대체했다"는 절대 인정 안 됨.**

## 기능별 필수 테스트 시나리오 (해당 기능 수정 시 반드시 실행)

> **수정한 기능이 아래 표에 있으면, 해당 시나리오를 빠짐없이 Playwright로 실행해야 한다.**
> **"코드만 보면 될 것 같은데" 하고 스킵하면 작업 무효.**

### 1. 채널/영상 분석 (ChannelAnalysisRoom, VideoAnalysisRoom)

| 시나리오 | 검증 방법 |
|---------|----------|
| 채널 분석 | 채널 URL 입력 → "분석" 클릭 → `waitForResponse(evolink)` → 가이드라인 텍스트 50자+ 확인 → 스크린샷 |
| 자막 실패 처리 | 자막 없는 채널/영상 입력 → 에러 토스트 또는 "자막 불가" 메시지가 DOM에 표시되는지 확인 |
| 영상 분석 | YouTube URL 입력 → 프리셋 선택 → "분석" 클릭 → API 응답 대기 → 버전/편집점 DOM 생성 확인 |
| URL 변경 시 초기화 | URL A 입력 → 결과 확인 → URL B로 변경 → 이전 결과 DOM이 사라졌는지 확인 |
| 프리셋 저장/로드 | 분석 완료 → 프리셋 저장 → 새로고침 → 프리셋 로드 → 가이드라인 텍스트 동일한지 확인 |
| 콘텐츠 지역 감지 | 해외 채널 URL 입력 → "해외 콘텐츠 모드" 텍스트가 표시되는지 확인 |

### 2. 대본 작성 (ScriptWriterTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 대본 생성 | 제목+시놉시스 입력 → "생성" 클릭 → streaming 텍스트가 실시간 증가하는지 확인 (1초 간격 체크) → 최종 대본 500자+ 확인 |
| 숏폼 분량 제한 | contentFormat='shorts' 선택 → 생성 → 결과 대본이 1000자 이하인지 확인 |
| 채널 스타일 적용 | 채널 프리셋 로드 → 대본 생성 → "채널 스타일 가이드" 섹션이 프롬프트에 포함되었는지 확인 |
| 장면 분할 | 대본 생성 완료 → "장면 분할" 클릭 → 2개 이상 장면 DOM 생성 확인 |

### 3. 사운드 스튜디오 (SoundStudioTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| TTS 생성 | 텍스트 입력 → 음성 선택 → "생성" 클릭 → `waitForResponse(typecast\|elevenlabs)` → 오디오 URL 존재 확인 |
| 음악 생성 | 프롬프트 입력 → "생성" 클릭 → `waitForResponse(suno)` → 재생 버튼 활성화 확인 |
| 오디오 재생 | 생성된 오디오의 `<audio>` 태그 src가 비어있지 않은지 확인 |

### 4. 이미지/영상 생성 (ImageVideoTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 이미지 생성 | 장면 선택 → "이미지 생성" 클릭 → `waitForResponse(evolink\|laozhang)` → `<img>` src가 data: 또는 http로 시작하는지 확인 |
| 영상 생성 | 이미지 있는 장면 → "영상 생성" 클릭 → `waitForResponse(kie\|apimart)` → 영상 URL 존재 확인 |
| 배치 생성 | "일괄 생성" 클릭 → 프로그레스 바가 0%→100%로 진행하는지 확인 |
| 스타일 변경 | 스타일 A 선택 → 이미지 생성 → 스타일 B 변경 → 재생성 → 이미지가 달라졌는지 (src 비교) 확인 |
| **스토리보드 스타일 일관성** | **대본 입력 → 스토리보드 생성 → 이미지 일괄 생성 → 생성된 이미지들이 동일한 아트 스타일로 일관되는지 스크린샷으로 직접 눈 확인 (#551)** |

### ⚠️ E2E 자동 로그인 (모든 Playwright 테스트에 필수 — 이것 없이 프로젝트 생성 불가)

```ts
// .env.local에서 읽기
const EMAIL = ENV.E2E_TEST_EMAIL;
const PASSWORD = ENV.E2E_TEST_PASSWORD;
const EVOLINK_KEY = ENV.CUSTOM_EVOLINK_KEY;

// 프로덕션 서버에서 토큰 취득 (로컬에 auth 서버 없음)
const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true })
});
const loginData = await loginRes.json();

// localStorage에 주입 후 리로드
await page.evaluate(({ token, user, key }) => {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
  localStorage.setItem('CUSTOM_EVOLINK_KEY', key);
}, { token: loginData.token, user: loginData.user, key: EVOLINK_KEY });
await page.reload();
```

### ⚠️ projectStore 접근 (Zustand store 직접 읽기)

```ts
// window.__PROJECT_STORE__로 접근 (src/stores/projectStore.ts에 노출됨)
const scenes = await page.evaluate(() => {
  const store = (window as any).__PROJECT_STORE__;
  return store ? store.getState().scenes : [];
});
```

### 5. 편집실 (EditRoomTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 타임라인 표시 | 장면 2개+ 있는 프로젝트 로드 → 타임라인에 장면 수만큼 클립 DOM 존재 확인 |
| 자막 편집 | 자막 텍스트 수정 → 프리뷰에 반영되는지 확인 |
| NLE 내보내기 | "프리미어 ZIP" 클릭 → 다운로드 시작 확인 (blob URL 생성 또는 download 이벤트) |
| 영상 렌더링 | "렌더링" 클릭 → 프로그레스가 0%에서 증가하는지 확인 |

### 5-1. 편집점/타임코드/FPS (sceneDetection, nleExportService, editPointService)

> **이 섹션 해당 파일 수정 시 반드시 아래 시나리오를 전부 실행해야 한다.**
> **page.evaluate()에서 수학만 돌리고 "통과"라고 하면 작업 전체가 무효다.**

| 시나리오 | 검증 방법 |
|---------|----------|
| **FPS 자동 감지** | FFmpeg로 29.97fps 테스트 영상 생성 → `setInputFiles()` 업로드 → 콘솔 또는 UI에서 감지된 FPS 29.97 확인 → 30fps 영상도 동일 테스트 |
| **Scene Detection** | 장면 전환 2회+ 포함된 영상 업로드 → `[Scene] ✅ N개 컷 포인트` 콘솔 로그 확인 → N ≥ 2 |
| **NLE ZIP 내보내기** | 영상 분석 완료 → NLE 내보내기 버튼 클릭 → ZIP 디스크 저장 → `unzip -l` → XML/SRT 파일 존재 확인 |
| **Drop-Frame TC** | 29.97fps 영상 → NLE 내보내기 → XML 내 `<ntsc>TRUE</ntsc>` + `<displayformat>DF</displayformat>` grep 확인 |
| **자막 싱크** | NLE ZIP 내 SRT 파일의 첫 자막 시작 시간이 XML 클립의 첫 in-point와 ±100ms 이내 일치 |
| **CapCut DF 플래그** | CapCut 내보내기 → draft_content.json 내 `is_drop_frame_timecode: true` 확인 (29.97fps일 때) |

```bash
# 테스트 영상 없다는 변명 금지 — 아래 명령으로 즉시 생성:
ffmpeg -y -f lavfi -i "color=c=red:s=320x240:r=29.97:d=1.5[v0];color=c=blue:s=320x240:r=29.97:d=1.5[v1];[v0][v1]concat=n=2:v=1:a=0" -c:v libx264 test-e2e/test-video-2997.mp4
```

### 6. 비용 추적 (CostDashboard)

| 시나리오 | 검증 방법 |
|---------|----------|
| 비용 표시 | API 호출(이미지/영상/분석) 후 → 우측 상단 비용 표시가 ₩0이 아닌지 확인 |
| 새로고침 유지 | 비용 발생 → 새로고침 → 비용 표시가 동일한지 (before/after 비교) |
| 수동 초기화 | "초기화" 버튼 클릭 → 확인 → 비용이 ₩0으로 변경되는지 확인 |
| 프로젝트 전환 | 프로젝트 A(비용 있음) → 프로젝트 B 전환 → B의 비용으로 변경되는지 확인 |

### 7. 썸네일 스튜디오 (ThumbnailStudioTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 썸네일 생성 | 텍스트 입력 → "생성" 클릭 → API 응답 대기 → 이미지 DOM 생성 확인 |
| 배치 생성 | "4개 변형 생성" → 4개 이미지 DOM 확인 |

### 8. PPT 마스터 (PptMasterTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 파일 업로드 → 슬라이드 | 텍스트 파일 업로드 → "슬라이드 생성" → API 응답 대기 → 슬라이드 DOM 2개+ 확인 |
| PPTX 다운로드 | 슬라이드 생성 후 → "다운로드" → blob URL 또는 download 이벤트 확인 |

### 9. 상세페이지/쇼핑 (DetailPageTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 카드뉴스 생성 | 상품 정보 입력 → "생성" → API 응답 대기 → 카드 DOM 5개+ 확인 |
| 쇼핑 숏폼 | 상품 URL 입력 → 분석 → 장면 분할 결과 확인 |

### 10. 자막 제거 (SubtitleRemoverTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 영상 업로드 | MP4 업로드 → 프리뷰 재생 가능한지 확인 |
| 컴패니언 연결 | 컴패니언 앱 상태 표시가 "연결됨" 또는 "연결 안 됨" 중 하나인지 확인 |

### 11. 프로젝트 관리

| 시나리오 | 검증 방법 |
|---------|----------|
| 프로젝트 저장 | 장면 수정 → 자동 저장 대기(2초) → 새로고침 → 수정 내용 유지 확인 |
| 프로젝트 전환 | 프로젝트 A → B 전환 → B의 장면/설정 로드 확인 → A로 복귀 → A 데이터 유지 확인 |
| HTML 내보내기 | "HTML 내보내기" → 파일 다운로드 확인 → 파일 크기 1KB+ 확인 |
| HTML 가져오기 | HTML 파일 업로드 → 프로젝트 데이터 복원 → 장면 수 일치 확인 |

### 12. API 키 설정 (ApiKeySettings)

| 시나리오 | 검증 방법 |
|---------|----------|
| 키 저장 | API 키 입력 → 저장 → 새로고침 → 키가 유지되는지 확인 (마스킹된 값 비교) |
| 키 검증 | 잘못된 키 입력 → API 호출 → 에러 메시지 표시 확인 |

### 13. 업로드 (UploadTab)

| 시나리오 | 검증 방법 |
|---------|----------|
| 영상 선택 | MP4 파일 업로드 → 프리뷰 표시 확인 |
| 메타데이터 | 제목/설명/태그 입력 → 다음 단계 진행 가능 확인 |

## API 키 주입 필수 규칙

```ts
// 모든 실제 테스트에서 반드시 이 함수로 API 키를 주입해야 한다
async function injectApiKeys(page: Page) {
  await page.evaluate((keys) => {
    localStorage.setItem('CUSTOM_EVOLINK_KEY', keys.evolink);
    localStorage.setItem('CUSTOM_KIE_KEY', keys.kie);
    localStorage.setItem('CUSTOM_YOUTUBE_API_KEY', keys.youtube);
    localStorage.setItem('CUSTOM_CLOUD_NAME', keys.cloudName);
    localStorage.setItem('CUSTOM_UPLOAD_PRESET', keys.uploadPreset);
  }, API_KEYS);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
}
```

> ⚠️ **API 키 없이 "API 응답 확인" 테스트를 스킵하면 작업 무효.**
> 사용자가 키를 제공하지 않았으면 키를 요청하라. 키 없이 "API 테스트 불가 — 스킵" 처리 금지.

---

# 🚨🚨🚨 STOP — 코드 수정 전에 반드시 읽어라 🚨🚨🚨

> **이 섹션을 건너뛰고 코드를 수정하면 Hook이 exit 2로 차단한다.**
> **"전수 조사 프로토콜"이라는 키워드가 나오면 아래 9단계를 100% 실행하라.**

## 전수 조사 프로토콜 (9단계 — 순서 위반 금지, 생략 금지)

```
┌─────────────────────────────────────────────────────────┐
│  STEP 1: memory/MEMORY.md 읽기 (Read 도구)              │
│  STEP 2: 관련 .claude/skills/ 파일 읽기 (Read 도구)      │
│  STEP 3: 수정 대상 함수/변수명 grep 전수 조사             │
│  STEP 4: bash .claude/hooks/prepare-work.sh "검색어"     │
│          → .phase-ready 게이트 생성 (이것 없으면 Edit 차단)│
│  ─── 여기부터 코드 수정 가능 ───                          │
│  STEP 5: 목록의 모든 파일 수정 (빠짐없이)                 │
│  STEP 6: tsc --noEmit + vite build 검증                  │
│  STEP 7: grep 재검증 (빠진 곳 없는지 증명)                │
│  STEP 8: 커밋 + 푸시                                     │
│  STEP 9: 이슈 코멘트 (친절한 톤) + 이슈 닫기              │
│          → 커밋 후 rm .phase-ready (자동 정리)            │
│          → 작업 완료 후 work-history.md 기록              │
└─────────────────────────────────────────────────────────┘
```

### Hook 강제 체크포인트 (물리적 차단)
| 시점 | Hook | 차단 조건 |
|------|------|-----------|
| **Edit/Write 시도 전** | `pre-edit-gate.sh` | `.phase-ready` 없음 → **exit 2 차단** |
| **Edit/Write 직후** | `post-edit-check.sh` | tsc 에러 → **exit 2 차단** |
| **git commit 시도 전** | `pre-commit-check.sh` | CHECKLIST/work-history 미수정, UI변경 시 E2E 미검증 → **exit 2 차단** |

### 금지 사항
- `touch .phase-ready` 금지 — 반드시 `prepare-work.sh`로 생성
- STEP 1~4 없이 STEP 5로 점프 금지
- 검증(STEP 6~7) 없이 커밋(STEP 8) 금지
- "대충 알겠지"로 grep 생략 금지

---

# CLAUDE.md — All-in-One Production v3.1

> **이 파일은 프로젝트 루트에 반드시 위치해야 합니다.**
> Claude Code가 모든 작업 전에 자동으로 읽는 최상위 매뉴얼입니다.

---

## 📌 프로젝트 한줄 요약

AI 기반 영상 제작 파이프라인 웹앱. 대본 입력 → AI 장면 분할 → 이미지 생성 → 영상 생성 → 내보내기.

## 🛠️ 기술 스택

- **프레임워크**: React 18.3.1 + TypeScript 5.5.3
- **빌드**: Vite 5.4.1
- **스타일**: Tailwind CSS (CDN)
- **스토리지**: IndexedDB (idb 라이브러리)
- **패키지**: jszip, idb, @imgly/background-removal
- **외부 API**: Kie AI, Laozhang AI, Apimart, Cloudinary, Remove.bg, WaveSpeed AI

## 📁 디렉토리 구조

```
project-root/
├── CLAUDE.md              ← 지금 이 파일 (최상위 매뉴얼)
├── .claude/
│   ├── hooks/
│   │   └── post-edit-check.sh  ← 자동 검수 스크립트 (tsc + 규칙 위반 체크)
│   ├── agents/
│   │   └── code-reviewer.md    ← AI 코드 검수 서브에이전트
│   └── skills/            ← 분야별 매뉴얼 (스킬 파일)
│       ├── ai-service.md
│       ├── media-gen.md
│       ├── ui-component.md
│       ├── data-storage.md
│       ├── export-system.md
│       └── api-reference.md  ← 외부 API 공식 기술 문서 (전체)
├── docs/
│   ├── PLAN.md            ← 현재 작업 계획서
│   ├── CONTEXT.md         ← 맥락 노트 (결정 이유, 참고 자료)
│   ├── CHECKLIST.md       ← 작업 체크리스트
│   ├── BUG_REPORT.md      ← 버그 목록
│   └── FEATURE_REQUEST.md ← 기능 요구사항
├── src/
│   ├── App.tsx            ← 메인 앱 (1,640줄) ★
│   ├── types.ts           ← 전체 타입 정의
│   ├── constants.ts       ← 설정 상수, 스타일 프리셋
│   ├── index.tsx
│   ├── index.html
│   ├── components/
│   │   ├── modes/         ← ScriptMode(1,248), CharacterMode(1,310), RemakeMode(201)
│   │   └── ...            ← UI 컴포넌트들
│   ├── services/
│   │   ├── geminiService.ts    ← AI 핵심 로직 (1,619줄) ★★
│   │   ├── VideoGenService.ts  ← 영상 생성 API (688줄) ★
│   │   ├── apiService.ts       ← API 키 관리
│   │   ├── uploadService.ts    ← Cloudinary 업로드
│   │   ├── storageService.ts   ← IndexedDB
│   │   └── ...
│   └── hooks/
│       └── useVideoBatch.ts    ← 비디오 배치 처리
└── package.json
```

---

## 🚨 최우선 규칙: MEMORY.md 필독 + 영향 범위 전수 조사

> **모든 세션 시작 시 반드시 `memory/MEMORY.md`를 읽고 그 안의 절대 규칙을 100% 준수하라.**
> MEMORY.md를 읽지 않은 상태에서 코드 수정을 시작하지 마라.

### 영향 범위 전수 조사 (모든 코드 수정에 적용 — 예외 없음)
- **작업 전**: 수정할 함수명/상태명을 grep 전체 검색 → 영향 받는 파일 목록 작성 → 목록 완성 전 코딩 시작 금지
- **작업 중**: 목록의 모든 파일을 빠짐없이 수정 + 연쇄 영향 확인
- **작업 후**: tsc + vite build + grep 재검색으로 빠진 곳 없는지 증명
- **UI 변경 작업**: Puppeteer MCP로 localhost:5173 접속 → 실제 동작 + 스크린샷 검증 필수
- **검증 미완료 상태에서 "완료"라고 보고하면 안 된다**
- **상세 절차는 `memory/MEMORY.md`의 "영향 범위 전수 조사" 섹션 참조**
- **Hook이 tsc 에러 시 자동 차단함 (exit 1) — 에러 무시 불가**

---

## ⚠️ 절대 규칙 (모든 작업에 적용)

### 금지 사항
1. **`geminiService.ts` 내부의 프롬프트 텍스트 내용을 임의로 수정하지 마라** — 수많은 시행착오의 결과물
2. **`constants.ts`의 VISUAL_STYLES / CHARACTER_LIBRARY / CHARACTER_STYLES 데이터를 수정하지 마라** — 프롬프트 엔지니어링 결과물
3. **PRICING 상수를 임의로 변경하지 마라** — 실제 서비스 가격 반영
4. **API 엔드포인트 URL을 변경하지 마라**
5. **`any` 타입을 새로 추가하지 마라** — 기존 `any`는 점진적으로 제거
6. **App.tsx에 새로운 상태(useState)를 추가하지 마라** — 리팩토링 대상
7. **인라인 HTML 문자열을 새로 생성하지 마라**
8. **스토리보드 생성 후 이미지 자동 배치 생성 코드를 추가하지 마라** — 비용 절감을 위해 사용자가 한두 컷 시험 후 수동 일괄 생성하는 설계 (#175-1에서 의도적으로 제거됨)

### 필수 사항
1. **작업 전 반드시 관련 스킬 파일(.claude/skills/)을 읽어라**
2. **작업 후 반드시 `docs/CHECKLIST.md`를 업데이트하라**
3. **새로운 타입이 필요하면 `types.ts`에 먼저 추가하라**
4. **모든 fetch 호출은 `monitoredFetch` 래퍼를 통해 실행하라**
5. **에러 발생 시 `alert()` 대신 Toast 시스템(존재 시)을 사용하라**
6. **한국어 주석 허용, 변수명/함수명은 영어**

### 코딩 스타일
- 컴포넌트 최대 **300줄** (현재 위반 파일 있음 — 리팩토링 대상)
- 함수 최대 **50줄**
- Props 최대 **8개** (그 이상이면 Context/Store 도입)
- TypeScript strict 모드 준수

---

## 🔑 외부 API 요약

| API | Base URL | 인증 | 용도 |
|-----|----------|------|------|
| **Evolink AI** | `api.evolink.ai/v1/`, `/v1beta/` | Bearer token | **Gemini 3.1 Pro (1순위), Nanobanana 2 이미지, Veo 3.1 1080p** |
| Kie AI | `api.kie.ai/api/v1/` | Bearer token | Grok 영상 (폴백: Gemini 텍스트) |
| Laozhang AI | `api.laozhang.ai/v1/` | Bearer token | 폴백: 이미지, Gemini 텍스트 |
| Cloudinary | `api.cloudinary.com/v1_1/{name}/` | Upload Preset | 이미지/영상 호스팅 |
| Remove.bg | `api.remove.bg/v1.0/` | X-Api-Key | 배경 제거 |
| ~~WaveSpeed AI~~ | ~~`api.wavespeed.ai/api/v3/`~~ | ~~Bearer token~~ | ~~워터마크/자막 제거~~ (삭제됨 — 컴패니언 ProPainter로 대체) |
| YouTube Data API v3 | `googleapis.com/youtube/v3/` | API Key | 채널분석, 키워드 검색 |

모든 API 키는 `services/apiService.ts`의 `getXxxKey()` 함수를 통해 접근.
직접 `localStorage`에 접근하지 마라.

> **외부 API 상세 기술 문서**: `.claude/skills/` 폴더에 서비스별 개별 문서 저장 (원본 무삭제·무축약):
>
> | 서비스 | 스킬 파일 |
> |--------|----------|
> | **Evolink Gemini 3.1 Pro & Flash (최우선 참조)** | **`evolink-gemini-3.1-pro-flash.md`** |
> | Evolink Gemini 3.1 Pro (구버전) | `evolink-gemini-3.1-pro-full.md` |
> | Evolink NanoBanana2 Task | `evolink-nanobanana2-task.md` |
> | Evolink NanoBanana Pro Image | `evolink-nanobanana-pro-image.md` |
> | Evolink Veo 3.1 Video | `evolink-veo31-video.md` |
> | Laozhang NanoBanana Pro Image | `laozhang-nanobanana-pro-image.md` |
> | KIE Grok Image-to-Video | `kie-grok-image-to-video.md` |
> | KIE NanoBanana2 Task | `kie-nanobanana2-task.md` |
> | KIE Gemini API (3.0 Pro/Flash) | `kie-gemini-api.md` |
> | **KIE Gemini 3.1 Pro (OpenAPI 원본 — 절대적 참조)** | **`kie-gemini-3.1-pro.md`** |
> | KIE Suno API | `kie-suno-api.md` |
> | KIE ElevenLabs (TTS/STT/SFX/Isolation) | `kie-elevenlabs-api.md` |
> | Grok Imagine Video | `grok-imagine-video.md` |
> | Suno Complete | `suno-api-complete.md` |
> | Typecast API | `typecast-api.md` |
> | **KIE 비디오 모델 전체 (17개 모델 + 가격표)** | **`kie-video-models-complete.md`** |
> | Typecast Download | `typecast-download.md` |
> | API 요약 (참고용) | `api-reference.md` |

---

## 🔄 핵심 데이터 흐름

```
[사용자 대본 입력]
  → analyzeScriptContext() : 언어/시대/문화적 맥락 분석
  → parseScriptToScenes() : 장면 분할 + 비주얼 프롬프트
  → generateSceneImage() : 이미지 생성 (Laozhang → Kie 폴백)
  → useVideoBatch : 영상 배치 생성 (Grok/Veo 선택)
  → handleExportHtml() : HTML 프로젝트 내보내기
```

---

## 🏷️ 스킬 파일 매핑 (자동 활성화 규칙)

| 작업 대상 | 활성화할 스킬 | 트리거 키워드/파일 |
|-----------|--------------|-------------------|
| **Evolink Gemini API (v1, v1beta)** | **`.claude/skills/evolink-gemini-3.1-pro-flash.md`** | **Evolink Gemini 관련 모든 작업 — 절대적 최우선 참조** |
| geminiService.ts, 프롬프트 | `.claude/skills/ai-service.md` | "프롬프트", "AI", "분석", "Gemini", services/gemini* |
| VideoGenService.ts, uploadService.ts | `.claude/skills/media-gen.md` | "영상", "비디오", "이미지", "업로드", services/Video*, services/upload* |
| components/ 폴더 전체 | `.claude/skills/ui-component.md` | "UI", "컴포넌트", "화면", "버튼", components/* |
| storageService.ts, IndexedDB | `.claude/skills/data-storage.md` | "저장", "IndexedDB", "프로젝트", services/storage* |
| HTML 내보내기, ZIP | `.claude/skills/export-system.md` | "내보내기", "export", "HTML", "다운로드", "ZIP" |
| 외부 API 요청/응답 포맷 | `.claude/skills/{서비스별 개별 문서}` | "API", "엔드포인트", "요청", "응답", "에러코드", fetch 수정 시 — 해당 서비스 문서 개별 참조 |
| **기술 스카우팅** | **`.claude/skills/tech-scout.md`** | `/scout`, "최신 기술", "라이브러리 추천", "업그레이드", "트렌딩" |

---

## 📊 현재 코드 규모 (v3.1)

- **총 라인 수**: 11,123줄 (38개 파일)
- **가장 큰 파일**: App.tsx(1,640), geminiService.ts(1,619), CharacterMode(1,310), ScriptMode(1,248)
- **외부 API 수**: 5개
- **Enum 수**: 10개, **Interface 수**: 8개

---

## 🚨 알려진 기술 부채

1. App.tsx가 God Component (1,640줄, 20+ useState)
2. StoryboardScene에 20+ props 전달 (Props Drilling)
3. 전역 상태 관리 없음 (Zustand 도입 필요)
4. 모든 이미지 Base64로 메모리 유지 (OOM 위험)
5. HTML 내보내기에 400줄+ 인라인 HTML/JS 문자열
6. `alert()` 기반 에러 알림 (Toast 시스템 전환 필요)

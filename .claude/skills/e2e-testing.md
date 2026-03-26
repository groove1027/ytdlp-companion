# 스킬: E2E Playwright 테스트

> **활성화 조건**: "E2E", "playwright", "실제 테스트", "Playwright 검증" 키워드 또는 UI 변경 커밋 시

---

## ⚠️ 절대 규칙

1. **API 직접 호출은 E2E가 아니다** — 실제 앱 UI에서 실제 버튼을 눌러야 함
2. **VP 텍스트만 확인하는 것은 이미지 검증이 아니다** — 실제 이미지가 화면에 보여야 함
3. **로그인 벽을 만나면 포기하지 말고 자동 로그인하라** — .env.local에 인증 정보 있음
4. **"테스트 완료"라고 주장하려면 스크린샷에 결과가 보여야 한다**

## 📂 인증 정보 위치

`.env.local` (gitignore 3중 방어):
- `E2E_TEST_EMAIL` — 테스트 계정 이메일
- `E2E_TEST_PASSWORD` — 테스트 계정 비밀번호
- `CUSTOM_EVOLINK_KEY` — Evolink API 키
- `CUSTOM_KIE_KEY` — Kie API 키

## 🔑 자동 로그인 패턴

```ts
import fs from 'fs';
import path from 'path';

// .env.local 로드
const ENV: Record<string, string> = {};
const envPath = path.resolve(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) ENV[m[1]] = m[2].trim();
}

// 프로덕션 서버에서 토큰 취득 (로컬에 auth 서버 없음)
const loginRes = await fetch('https://all-in-one-production.pages.dev/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ENV.E2E_TEST_EMAIL, password: ENV.E2E_TEST_PASSWORD, rememberMe: true })
});
const loginData = await loginRes.json();

// localStorage에 주입
await page.evaluate(({ token, user, evolinkKey, kieKey }) => {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
  localStorage.setItem('CUSTOM_EVOLINK_KEY', evolinkKey);
  if (kieKey) localStorage.setItem('CUSTOM_KIE_KEY', kieKey);
}, { token: loginData.token, user: loginData.user, evolinkKey: ENV.CUSTOM_EVOLINK_KEY, kieKey: ENV.CUSTOM_KIE_KEY });

await page.reload();
```

## 🎬 스토리보드 생성 전체 플로우

```
1. 앱 로드 (http://localhost:5173)
2. 자동 로그인 + API 키 주입 (위 패턴)
3. "대본작성 🔥" 사이드바 클릭
4. 가장 큰 textarea에 대본 fill
5. "🎬 이미지/영상 →" 버튼 클릭
6. "스토리보드 생성" 버튼 클릭
   → 바로 AI 분석 시작 (모달 확인 불필요)
7. 분석 완료 대기 (로그에서 [parseScriptToScenes] 감지, 60~180초)
8. "스토리보드 열기" → StoryboardPanel
9. "이미지 일괄 생성" 클릭
10. 이미지 생성 완료 대기
11. 스크린샷으로 이미지 일관성 확인
```

## 📊 projectStore 접근

```ts
// window.__PROJECT_STORE__로 Zustand store 접근
const scenes = await page.evaluate(() => {
  const store = (window as any).__PROJECT_STORE__;
  if (!store) return [];
  return store.getState().scenes.map((s: any) => ({
    vp: s.visualPrompt,
    cast: s.castType,
    shot: s.shotSize,
    cam: s.cameraMovement,
    entity: s.entityName,
    loc: s.sceneLocation,
    imageUrl: s.imageUrl || s.image,
  }));
});
```

## ❌ 과거 실수 — 다시 하면 안 되는 것

1. API 직접 호출로 VP만 받아서 "E2E 완료" 주장 (2026-03-26)
2. 로그인 벽 만나서 "인증 때문에 불가" 포기 (2026-03-26)
3. 스토리보드 생성만 하고 이미지 생성 안 하고 "검증 완료" (2026-03-26)
4. 비어있는 장면 카드 스크린샷을 결과라고 보여줌 (2026-03-26)

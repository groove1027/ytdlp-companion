# Cloudflare Pages 배포 + 초대 코드 인증 시스템 구축 매뉴얼

> 작성일: 2026-03-07
> 대상: All-in-One Production v4.5
> 목표: Cloudflare Pages에 앱 배포 + 초대 코드 기반 회원가입/로그인 시스템

---

## 목차

1. [전체 아키텍처](#1-전체-아키텍처)
2. [Cloudflare 계정 생성](#2-cloudflare-계정-생성)
3. [Cloudflare Pages로 앱 배포](#3-cloudflare-pages로-앱-배포)
4. [KV + D1 데이터베이스 설정](#4-kv--d1-데이터베이스-설정)
5. [Pages Functions로 인증 API 구축](#5-pages-functions로-인증-api-구축)
6. [프론트엔드 인증 화면 추가](#6-프론트엔드-인증-화면-추가)
7. [초대 코드 관리](#7-초대-코드-관리)
8. [커스텀 도메인 연결 (선택)](#8-커스텀-도메인-연결-선택)
9. [운영 및 모니터링](#9-운영-및-모니터링)
10. [비용 정리](#10-비용-정리)
11. [체크리스트](#11-체크리스트)
12. [결제 모듈 연동 — 해외 (Lemon Squeezy / Stripe)](#12-결제-모듈-연동-추후-도입용)
13. [심화 비용 분석](#13-심화-비용-분석)
14. [**한국 결제 모듈 연동 (카카오페이 / 네이버페이 / 토스페이)**](#14-한국-결제-모듈-연동-카카오페이--네이버페이--토스페이) ← NEW

---

## 1. 전체 아키텍처

```
[사용자 브라우저]
    |
    v
[Cloudflare Pages CDN] ---- 정적 파일 (React 앱)
    |
    v
[Pages Functions] --------- 서버리스 백엔드 (인증 API)
    |
    +---> [Cloudflare D1] --- 사용자 DB (이메일, 비밀번호 해시, 가입일)
    +---> [Cloudflare KV] --- 세션 토큰 + 초대 코드 저장
```

### 사용하는 Cloudflare 서비스 (전부 무료 티어)

| 서비스 | 용도 | 무료 한도 |
|--------|------|-----------|
| **Pages** | React 앱 호스팅 | 무제한 대역폭, 500빌드/월, 무제한 사이트 |
| **Pages Functions** | 인증 API (Workers 기반) | 100,000 요청/일 |
| **D1** (SQLite) | 사용자 데이터베이스 | 5M 읽기/일, 100K 쓰기/일, 5GB 저장 |
| **KV** | 세션 토큰 + 초대 코드 | 100K 읽기/일, 1K 쓰기/일, 1GB 저장 |

> 참고: 무료 티어만으로 수백 명 사용자 충분히 감당 가능.

### 인증 흐름

```
[첫 방문] → 로그인 화면 표시
    ├─ [회원가입] → 이메일 + 비밀번호 + 초대 코드 입력
    │       └─ 서버: 초대 코드 검증 → 사용자 생성 → 토큰 발급
    └─ [로그인] → 이메일 + 비밀번호 입력
            └─ 서버: 비밀번호 검증 → 토큰 발급

[토큰 보유] → 앱 정상 진입
[토큰 만료/없음] → 로그인 화면으로
```

---

## 2. Cloudflare 계정 생성

### 2-1. 가입

1. https://dash.cloudflare.com/sign-up 접속
2. 이메일 + 비밀번호 입력 → "Create Account"
3. 이메일 인증 메일 확인 → 링크 클릭
4. 로그인 완료

> 신용카드 등록 불필요. Free 플랜이 자동 적용됨.

### 2-2. Wrangler CLI 설치 (로컬 개발용)

터미널에서 실행:

```bash
# npm 글로벌 설치
npm install -g wrangler

# 또는 프로젝트 내 설치
npm install --save-dev wrangler

# Cloudflare 계정 로그인
wrangler login
```

> `wrangler login` 실행 시 브라우저가 열리고, Cloudflare 계정으로 인증하면 CLI에서 배포/관리 가능.

---

## 3. Cloudflare Pages로 앱 배포

두 가지 방법이 있음. **방법 A (Git 연동)**를 권장.

---

### 방법 A: Git 연동 (권장 - 자동 배포)

#### 사전 준비: GitHub 레포지토리

1. GitHub에 레포지토리 생성 (Private 권장)
2. 프로젝트를 push:

```bash
cd /Users/jihoo/Downloads/all-in-one-production-build4

# .gitignore에 dist/ 추가 확인 (Cloudflare가 빌드해줌)
git add .
git commit -m "deploy: Cloudflare Pages 배포 준비"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

#### Cloudflare 대시보드에서 Pages 프로젝트 생성

1. https://dash.cloudflare.com 로그인
2. 좌측 메뉴에서 **"Workers & Pages"** 클릭
3. **"Create"** 버튼 클릭
4. **"Pages"** 탭 선택
5. **"Connect to Git"** 클릭
6. GitHub 계정 연결 → 레포지토리 선택
7. 빌드 설정 입력:

```
프로젝트 이름:        all-in-one-production (원하는 이름)
프로덕션 브랜치:      main
프레임워크 프리셋:    None (커스텀 설정)
빌드 명령어:          cd src && npm install && npm run build
빌드 출력 디렉토리:   src/dist
루트 디렉토리:        / (프로젝트 루트)
```

> **중요**: 이 프로젝트는 `src/` 폴더 안에 `package.json`이 있으므로 빌드 명령어에 `cd src`가 필수.

8. **"Save and Deploy"** 클릭
9. 빌드 로그 확인 → 완료되면 URL 발급됨:
   `https://all-in-one-production.pages.dev`

#### 이후 자동 배포

- `main` 브랜치에 push할 때마다 자동으로 빌드 + 배포
- PR 생성 시 미리보기 URL 자동 생성 (프리뷰 배포)

---

### 방법 B: Direct Upload (Git 없이)

로컬에서 빌드 후 직접 업로드:

```bash
# 1. 빌드
cd /Users/jihoo/Downloads/all-in-one-production-build4/src
npm run build

# 2. Wrangler로 업로드
wrangler pages project create all-in-one-production
wrangler pages deploy dist/
```

> 매번 수동 업로드 필요. Git 연동이 훨씬 편함.

---

### 빌드 확인

배포 후 발급된 URL (예: `https://all-in-one-production.pages.dev`)에 접속하여 앱이 정상 로드되는지 확인.

---

## 4. KV + D1 데이터베이스 설정

### 4-1. D1 데이터베이스 생성 (사용자 DB)

#### 대시보드에서 생성

1. Cloudflare 대시보드 → 좌측 **"Workers & Pages"** → **"D1 SQL Database"**
2. **"Create"** 클릭
3. 이름: `auth-db`
4. 생성 완료

#### 또는 CLI로 생성

```bash
wrangler d1 create auth-db
```

출력 결과에서 `database_id`를 메모:
```
Created D1 database 'auth-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

#### 테이블 생성

아래 SQL을 실행하여 사용자 테이블을 생성합니다.

`schema.sql` 파일을 프로젝트 루트에 생성:

```sql
-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  invite_code TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- 이메일 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

실행:
```bash
wrangler d1 execute auth-db --file=schema.sql
```

> 대시보드에서도 가능: D1 → auth-db → Console 탭에서 SQL 직접 입력/실행.

---

### 4-2. KV 네임스페이스 생성 (세션 + 초대 코드)

#### 대시보드에서 생성

1. Cloudflare 대시보드 → **"Workers & Pages"** → **"KV"**
2. **"Create a namespace"** 클릭
3. 이름: `AUTH_SESSIONS` → 생성
4. 한 번 더: 이름 `INVITE_CODES` → 생성

#### 또는 CLI로 생성

```bash
wrangler kv namespace create AUTH_SESSIONS
wrangler kv namespace create INVITE_CODES
```

출력되는 `id`를 각각 메모.

---

### 4-3. 초대 코드 등록

대시보드에서 직접 등록하거나 CLI로:

#### 대시보드에서

1. KV → `INVITE_CODES` 클릭
2. **"Add entry"** 클릭
3. 입력:
   - **Key**: `MYCODE2024` (배포할 초대 코드)
   - **Value**: `{"maxUses": 100, "currentUses": 0, "label": "초기 구매자용"}`
4. 저장

#### CLI로

```bash
wrangler kv key put --namespace-id=YOUR_INVITE_CODES_NAMESPACE_ID \
  "MYCODE2024" '{"maxUses":100,"currentUses":0,"label":"초기 구매자용"}'
```

> 초대 코드는 여러 개 만들 수 있음. 예: 구매자용, 체험판용, VIP용 등.

---

### 4-4. wrangler.toml 설정

프로젝트 루트에 `wrangler.toml` 파일 생성:

```toml
name = "all-in-one-production"
compatibility_date = "2024-01-01"

# Pages에서는 이 설정이 자동 적용되지만 로컬 개발 시 필요
# 실제 ID는 위에서 생성 시 받은 값으로 교체

[[d1_databases]]
binding = "DB"
database_name = "auth-db"
database_id = "여기에-실제-database-id-입력"

[[kv_namespaces]]
binding = "SESSIONS"
id = "여기에-AUTH_SESSIONS-namespace-id-입력"

[[kv_namespaces]]
binding = "INVITE_CODES"
id = "여기에-INVITE_CODES-namespace-id-입력"
```

#### Pages 대시보드에서 바인딩 설정 (중요!)

Git 연동 배포 시 `wrangler.toml`만으로는 부족하고, **대시보드에서도 바인딩을 설정**해야 합니다:

1. Cloudflare 대시보드 → Workers & Pages → 프로젝트 선택
2. **"Settings"** 탭 → **"Functions"** 섹션
3. **"D1 database bindings"**:
   - Variable name: `DB`
   - D1 database: `auth-db`
4. **"KV namespace bindings"**:
   - Variable name: `SESSIONS`, KV namespace: `AUTH_SESSIONS`
   - Variable name: `INVITE_CODES`, KV namespace: `INVITE_CODES`
5. **"Save"** → **재배포 트리거** (Settings에서 "Retry deployment" 또는 git push)

---

## 5. Pages Functions로 인증 API 구축

Cloudflare Pages Functions는 `functions/` 폴더에 파일을 넣으면 자동으로 API 엔드포인트가 됩니다.

### 5-1. 폴더 구조

프로젝트 루트에 `functions/` 폴더 생성:

```
project-root/
├── functions/
│   └── api/
│       └── auth/
│           ├── signup.ts      → POST /api/auth/signup
│           ├── login.ts       → POST /api/auth/login
│           ├── verify.ts      → POST /api/auth/verify
│           └── logout.ts      → POST /api/auth/logout
├── src/
│   └── ...
├── wrangler.toml
└── ...
```

### 5-2. 타입 정의

`functions/api/auth/_types.ts` 생성:

```typescript
export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  INVITE_CODES: KVNamespace;
}

export interface InviteCodeData {
  maxUses: number;
  currentUses: number;
  label: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string | null;
  invite_code: string;
  created_at: string;
  last_login: string | null;
}
```

### 5-3. 비밀번호 해싱 유틸리티

`functions/api/auth/_crypto.ts` 생성:

```typescript
// Web Crypto API 기반 (Cloudflare Workers에서 지원)

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  // salt 생성
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  // PBKDF2 키 유도
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHash] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex === expectedHash;
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

### 5-4. 회원가입 API

`functions/api/auth/signup.ts`:

```typescript
import type { Env, InviteCodeData } from './_types';
import { hashPassword, generateToken } from './_crypto';

interface SignupBody {
  email: string;
  password: string;
  inviteCode: string;
  displayName?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const body: SignupBody = await context.request.json();
    const { email, password, inviteCode, displayName } = body;

    // 1. 입력 검증
    if (!email || !password || !inviteCode) {
      return new Response(
        JSON.stringify({ error: '이메일, 비밀번호, 초대 코드를 모두 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: '비밀번호는 8자 이상이어야 합니다.' }),
        { status: 400, headers }
      );
    }

    // 2. 초대 코드 검증
    const codeRaw = await context.env.INVITE_CODES.get(inviteCode.toUpperCase());
    if (!codeRaw) {
      return new Response(
        JSON.stringify({ error: '유효하지 않은 초대 코드입니다.' }),
        { status: 403, headers }
      );
    }

    const codeData: InviteCodeData = JSON.parse(codeRaw);
    if (codeData.currentUses >= codeData.maxUses) {
      return new Response(
        JSON.stringify({ error: '이 초대 코드의 사용 한도가 초과되었습니다.' }),
        { status: 403, headers }
      );
    }

    // 3. 이메일 중복 확인
    const existing = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existing) {
      return new Response(
        JSON.stringify({ error: '이미 가입된 이메일입니다.' }),
        { status: 409, headers }
      );
    }

    // 4. 비밀번호 해싱 + 사용자 생성
    const passwordHash = await hashPassword(password);
    await context.env.DB.prepare(
      'INSERT INTO users (email, password_hash, display_name, invite_code) VALUES (?, ?, ?, ?)'
    ).bind(email.toLowerCase(), passwordHash, displayName || null, inviteCode.toUpperCase()).run();

    // 5. 초대 코드 사용 횟수 증가
    codeData.currentUses += 1;
    await context.env.INVITE_CODES.put(inviteCode.toUpperCase(), JSON.stringify(codeData));

    // 6. 세션 토큰 발급 (7일 유효)
    const token = generateToken();
    await context.env.SESSIONS.put(token, JSON.stringify({
      email: email.toLowerCase(),
      displayName: displayName || email.split('@')[0],
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 60 * 60 * 24 * 7 });

    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: { email: email.toLowerCase(), displayName: displayName || email.split('@')[0] },
      }),
      { status: 201, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
```

### 5-5. 로그인 API

`functions/api/auth/login.ts`:

```typescript
import type { Env } from './_types';
import { verifyPassword, generateToken } from './_crypto';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { email, password } = await context.request.json() as { email: string; password: string };

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: '이메일과 비밀번호를 입력해주세요.' }),
        { status: 400, headers }
      );
    }

    // 사용자 조회
    const user = await context.env.DB.prepare(
      'SELECT id, email, password_hash, display_name FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first<{
      id: number; email: string; password_hash: string; display_name: string | null;
    }>();

    if (!user) {
      return new Response(
        JSON.stringify({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
        { status: 401, headers }
      );
    }

    // 비밀번호 검증
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }),
        { status: 401, headers }
      );
    }

    // 마지막 로그인 시간 갱신
    await context.env.DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    ).bind(user.id).run();

    // 세션 토큰 발급
    const token = generateToken();
    await context.env.SESSIONS.put(token, JSON.stringify({
      email: user.email,
      displayName: user.display_name || user.email.split('@')[0],
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 60 * 60 * 24 * 7 });

    return new Response(
      JSON.stringify({
        success: true,
        token,
        user: { email: user.email, displayName: user.display_name || user.email.split('@')[0] },
      }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
};
```

### 5-6. 토큰 검증 API

`functions/api/auth/verify.ts`:

```typescript
import type { Env } from './_types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token } = await context.request.json() as { token: string };

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: '토큰이 없습니다.' }),
        { status: 401, headers }
      );
    }

    const session = await context.env.SESSIONS.get(token);
    if (!session) {
      return new Response(
        JSON.stringify({ valid: false, error: '만료되었거나 유효하지 않은 토큰입니다.' }),
        { status: 401, headers }
      );
    }

    const user = JSON.parse(session);
    return new Response(
      JSON.stringify({ valid: true, user }),
      { status: 200, headers }
    );

  } catch {
    return new Response(
      JSON.stringify({ valid: false, error: 'Internal server error' }),
      { status: 500, headers }
    );
  }
};
```

### 5-7. 로그아웃 API

`functions/api/auth/logout.ts`:

```typescript
import type { Env } from './_types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { token } = await context.request.json() as { token: string };
    if (token) {
      await context.env.SESSIONS.delete(token);
    }
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );
  }
};
```

---

## 6. 프론트엔드 인증 화면 추가

### 6-1. 인증 서비스 파일

`src/services/authService.ts` 생성:

```typescript
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

export interface AuthUser {
  email: string;
  displayName: string;
}

/** 저장된 토큰 가져오기 */
export const getToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

/** 토큰 + 사용자 정보 저장 */
export const saveAuth = (token: string, user: AuthUser): void => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
};

/** 로그아웃 (토큰 삭제) */
export const clearAuth = (): void => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
};

/** 저장된 사용자 정보 */
export const getSavedUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

/** 회원가입 */
export const signup = async (
  email: string, password: string, inviteCode: string, displayName?: string
): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, inviteCode, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '회원가입 실패');
  saveAuth(data.token, data.user);
  return data;
};

/** 로그인 */
export const login = async (
  email: string, password: string
): Promise<{ token: string; user: AuthUser }> => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '로그인 실패');
  saveAuth(data.token, data.user);
  return data;
};

/** 토큰 유효성 검증 (앱 시작 시 호출) */
export const verifyToken = async (): Promise<AuthUser | null> => {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!data.valid) {
      clearAuth();
      return null;
    }
    saveAuth(token, data.user);
    return data.user;
  } catch {
    // 네트워크 오류 시 로컬 캐시 사용 (오프라인 허용)
    return getSavedUser();
  }
};

/** 로그아웃 */
export const logout = async (): Promise<void> => {
  const token = getToken();
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => {});
  }
  clearAuth();
};
```

### 6-2. 로그인/회원가입 컴포넌트

`src/components/AuthGate.tsx` 생성:

```tsx
import React, { useState } from 'react';

interface AuthGateProps {
  onAuthenticated: (user: { email: string; displayName: string }) => void;
}

const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const { login, signup } = await import('../services/authService');
      if (mode === 'login') {
        const result = await login(email, password);
        onAuthenticated(result.user);
      } else {
        const result = await signup(email, password, inviteCode, displayName || undefined);
        onAuthenticated(result.user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-xl shadow-violet-500/20">
            <span className="text-3xl">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-white">All-in-One Production</h1>
          <p className="text-sm text-gray-500 mt-1">AI 기반 영상 제작 파이프라인</p>
        </div>

        {/* 탭 전환 */}
        <div className="flex mb-6 bg-gray-900 rounded-xl p-1 border border-gray-800">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === 'signup'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            회원가입
          </button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-sm text-gray-400 mb-1.5 block">닉네임 (선택)</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="표시될 이름"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? '8자 이상' : '비밀번호 입력'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label className="text-sm text-gray-400 mb-1.5 block">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 재입력"
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-amber-400 mb-1.5 block">
                  초대 코드 *
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="초대 코드를 입력하세요"
                  required
                  className="w-full bg-amber-950/30 border-2 border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200 placeholder-amber-700 focus:outline-none focus:border-amber-500/50 font-mono tracking-wider"
                />
                <p className="text-xs text-gray-600 mt-1">
                  구매 시 제공받은 초대 코드를 입력해주세요.
                </p>
              </div>
            </>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl text-base font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
          >
            {isLoading
              ? '처리 중...'
              : mode === 'login' ? '로그인' : '회원가입'
            }
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          {mode === 'login'
            ? '계정이 없으신가요? 상단 "회원가입" 탭을 클릭하세요.'
            : '이미 계정이 있으신가요? 상단 "로그인" 탭을 클릭하세요.'
          }
        </p>
      </div>
    </div>
  );
};

export default AuthGate;
```

### 6-3. App.tsx에 인증 게이트 통합

`App.tsx`의 최상위에서 인증 상태를 확인하고, 미인증 시 AuthGate를 표시:

```tsx
// App.tsx 상단에 추가
import { useState, useEffect } from 'react';
import { verifyToken, AuthUser } from './services/authService';
import AuthGate from './components/AuthGate';

// App 컴포넌트 내부 최상단에 추가
const [authUser, setAuthUser] = useState<AuthUser | null>(null);
const [authChecking, setAuthChecking] = useState(true);

useEffect(() => {
  verifyToken().then((user) => {
    setAuthUser(user);
    setAuthChecking(false);
  });
}, []);

// 인증 체크 중
if (authChecking) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// 미인증 시 로그인 화면
if (!authUser) {
  return <AuthGate onAuthenticated={setAuthUser} />;
}

// 이하 기존 앱 렌더링...
```

### 6-4. 로그아웃 버튼 (앱 내)

앱 헤더 등 적절한 위치에 추가:

```tsx
import { logout } from './services/authService';

// 버튼 컴포넌트
<button
  onClick={async () => { await logout(); setAuthUser(null); }}
  className="text-sm text-gray-500 hover:text-gray-300"
>
  로그아웃
</button>
```

---

## 7. 초대 코드 관리

### 7-1. 새 초대 코드 추가

#### 대시보드에서

1. Cloudflare 대시보드 → Workers & Pages → KV → `INVITE_CODES`
2. "Add entry" 클릭
3. Key: 원하는 코드 (예: `VIP2024`, `EARLYBIRD`)
4. Value: `{"maxUses": 50, "currentUses": 0, "label": "VIP 구매자"}`

#### CLI에서

```bash
# 새 코드 추가
wrangler kv key put --namespace-id=INVITE_CODES_ID \
  "EARLYBIRD" '{"maxUses":50,"currentUses":0,"label":"얼리버드 구매자"}'

# 현재 사용 현황 확인
wrangler kv key get --namespace-id=INVITE_CODES_ID "MYCODE2024"

# 코드 삭제 (비활성화)
wrangler kv key delete --namespace-id=INVITE_CODES_ID "OLD_CODE"

# 모든 코드 목록 확인
wrangler kv key list --namespace-id=INVITE_CODES_ID
```

### 7-2. 사용자 목록 확인

```bash
# D1에서 사용자 조회
wrangler d1 execute auth-db --command="SELECT id, email, display_name, invite_code, created_at, last_login FROM users ORDER BY created_at DESC"
```

또는 대시보드에서: D1 → auth-db → Console 탭 → SQL 입력.

### 7-3. 초대 코드 운영 전략

| 코드 | maxUses | 용도 |
|------|---------|------|
| `LAUNCH2024` | 100 | 오픈 구매자용 |
| `VIPONLY` | 20 | VIP 구매자용 |
| `REVIEW` | 5 | 리뷰어용 (사용 후 삭제) |
| `TEST` | 3 | 내부 테스트용 |

---

## 8. 커스텀 도메인 연결 (선택)

기본 도메인: `your-project.pages.dev` (무료, HTTPS 자동)

커스텀 도메인을 원하면:

### 8-1. 도메인 구매

- Cloudflare Registrar (원가 판매, 가장 저렴)
- 또는 Namecheap, GoDaddy 등에서 구매

### 8-2. Cloudflare에 도메인 추가

1. 대시보드 → "Add a site" → 도메인 입력
2. Free 플랜 선택
3. 네임서버를 Cloudflare 것으로 변경 (도메인 구매 사이트에서 설정)

### 8-3. Pages 프로젝트에 도메인 연결

1. Workers & Pages → 프로젝트 선택
2. "Custom domains" 탭
3. "Set up a custom domain" 클릭
4. 도메인 입력 (예: `app.yourdomain.com`)
5. DNS 레코드 자동 추가 → "Activate domain"

> SSL 인증서 자동 발급 (수 분 소요). 이후 `https://app.yourdomain.com`으로 접속 가능.

---

## 9. 운영 및 모니터링

### 9-1. 배포 상태 확인

- 대시보드 → Workers & Pages → 프로젝트 → "Deployments" 탭
- 모든 배포 이력, 빌드 로그, 프리뷰 URL 확인 가능

### 9-2. Functions 로그

```bash
# 실시간 로그 스트리밍
wrangler pages deployment tail --project-name=all-in-one-production
```

또는 대시보드: 프로젝트 → "Functions" 탭 → "Real-time Logs"

### 9-3. 사용량 확인

대시보드 → Workers & Pages → 우측 "Usage" 영역:
- Pages 빌드 수
- Functions 요청 수
- KV 읽기/쓰기 수
- D1 읽기/쓰기 수

### 9-4. 업데이트 배포

```bash
# Git 연동 시
git add .
git commit -m "update: 기능 업데이트"
git push origin main
# → 자동 빌드 + 배포 (1~2분)

# Direct Upload 시
cd src && npm run build
wrangler pages deploy dist/
```

---

## 10. 비용 정리 (300명+ 기준 상세 분석)

### 10-1. 결론부터: 300명은 무료로 충분합니다

**Cloudflare Pages Free 플랜은 진짜 무료입니다.** 신용카드 등록 불필요, 숨겨진 비용 없음.
300명 사용자 기준으로 무료 한도의 10% 미만만 사용합니다.

---

### 10-2. Cloudflare Free 플랜 전체 한도표

| 서비스 | 항목 | 무료 한도 | 초과 시 어떻게 되나 |
|--------|------|-----------|---------------------|
| **Pages** | 프로젝트 수 | 무제한 | - |
| **Pages** | 배포(빌드) 횟수 | **500회/월** | 빌드 불가, 다음 달 리셋 (기존 배포는 계속 작동) |
| **Pages** | 대역폭 (전송량) | **무제한** | 무제한이라 초과 개념 없음 |
| **Pages** | 파일 수 (빌드 결과물) | 20,000개 | 이 앱은 ~100개라 걱정 불필요 |
| **Pages** | 단일 파일 크기 | 25 MB | JS 번들 최대 ~400KB라 OK |
| **Functions** | 요청 수 | **100,000/일** | 해당 요청만 거부 (앱 자체는 정상 작동) |
| **Functions** | CPU 시간 | 10ms/요청 | 초과 시 해당 요청 종료 |
| **KV** | 읽기 | **100,000/일** | 해당 요청 거부 |
| **KV** | 쓰기 | **1,000/일** | 해당 요청 거부 |
| **KV** | 저장 용량 | **1 GB** | 초과 쓰기 불가 |
| **KV** | 값 크기 | 25 MB/개 | 세션 데이터는 ~200바이트라 OK |
| **D1** | 행 읽기 | **5,000,000/일** | 해당 쿼리 거부 |
| **D1** | 행 쓰기 | **100,000/일** | 해당 쿼리 거부 |
| **D1** | 저장 용량 | **5 GB** | 초과 쓰기 불가 |
| **D1** | 데이터베이스 수 | 50개 | 1개만 쓰므로 OK |

---

### 10-3. 300명 사용자 실제 사용량 시뮬레이션

#### 가정

- 가입자 300명 (이미 가입 완료)
- 일일 활성 사용자(DAU): 약 100명 (전체의 33%)
- 사용자당 하루 평균 세션: 1.5회 (아침 + 저녁)
- 사용자당 세션 시간: 30분~1시간

#### Functions 요청 (하루)

| 동작 | 사용자당/일 | DAU 100명 | 무료 한도 | 사용률 |
|------|------------|-----------|-----------|--------|
| 토큰 검증 (앱 열 때마다) | 1.5회 | 150 | 100,000 | **0.15%** |
| 로그인 (토큰 만료 시) | 0.1회 | 10 | 100,000 | **0.01%** |
| 로그아웃 | 0.05회 | 5 | 100,000 | **0.005%** |
| 신규 가입 (초기 러시) | - | ~10 | 100,000 | **0.01%** |
| **합계** | | **~175** | **100,000** | **0.18%** |

> Functions는 **인증 API만** 사용합니다. 앱 자체(React)는 정적 파일이므로 Functions 요청에 포함되지 않습니다.
> 나머지 AI API 호출(Gemini, 이미지 생성 등)은 브라우저에서 직접 외부 API로 호출하므로 Cloudflare 요청에 포함되지 않습니다.

#### KV 읽기/쓰기 (하루)

| 동작 | 횟수 | 읽기 한도 | 쓰기 한도 |
|------|------|-----------|-----------|
| 세션 토큰 검증 (읽기) | 150 | 100,000 (**0.15%**) | - |
| 초대 코드 조회 (읽기) | 10 | 100,000 (**0.01%**) | - |
| 세션 토큰 저장 (쓰기) | 15 | - | 1,000 (**1.5%**) |
| 초대 코드 카운트 갱신 (쓰기) | 10 | - | 1,000 (**1%**) |
| 세션 삭제 (쓰기) | 5 | - | 1,000 (**0.5%**) |
| **합계** | | **0.16%** | **3%** |

#### D1 데이터베이스 (하루)

| 동작 | 횟수 | 읽기 한도 | 쓰기 한도 |
|------|------|-----------|-----------|
| 로그인 시 사용자 조회 (읽기) | 10 | 5,000,000 (**0.0002%**) | - |
| 가입 시 이메일 중복 확인 (읽기) | 10 | 5,000,000 (**0.0002%**) | - |
| 사용자 생성 (쓰기) | 10 | - | 100,000 (**0.01%**) |
| 마지막 로그인 갱신 (쓰기) | 10 | - | 100,000 (**0.01%**) |
| **합계** | | **0.0004%** | **0.02%** |

#### Pages 대역폭 & 빌드

| 항목 | 예상치 | 무료 한도 |
|------|--------|-----------|
| 대역폭 | DAU 100명 x 앱 번들 ~3MB = 300MB/일 | **무제한** |
| 빌드 | 하루 2-3회 배포 x 30일 = 60~90회/월 | **500회/월** |

> 대역폭은 CDN 캐시 덕분에 실제 전송량은 이보다 훨씬 적음. 재방문 시 브라우저 캐시 사용.

#### D1 저장 용량

| 항목 | 크기 | 누적 |
|------|------|------|
| 사용자 1명 레코드 | ~200바이트 | - |
| 300명 | ~60KB | - |
| 1,000명 | ~200KB | - |
| 10,000명 | ~2MB | 5GB 한도의 **0.04%** |

> 사용자 데이터는 극히 가벼워서 저장 용량은 걱정할 필요 전혀 없음.

---

### 10-4. 사용자 수별 한도 도달 시점 예측

핵심 병목은 **Functions 요청 100,000/일**과 **KV 쓰기 1,000/일**입니다.

| DAU (일일 활성) | Functions/일 | KV 쓰기/일 | 무료로 가능? |
|-----------------|-------------|------------|-------------|
| 100명 | ~175 | ~30 | **여유로움** |
| 300명 | ~525 | ~90 | **여유로움** |
| 500명 | ~875 | ~150 | **여유로움** |
| 1,000명 | ~1,750 | ~300 | **여유로움** |
| 3,000명 | ~5,250 | ~900 | **KV 쓰기 90% - 주의** |
| 5,000명 | ~8,750 | ~1,500 | **KV 쓰기 초과 - 유료 전환 필요** |
| 10,000명 | ~17,500 | ~3,000 | 유료 필요 |

> **결론: DAU 3,000명(가입자 ~10,000명)까지는 무료로 운영 가능.**
> 현재 300명은 무료 한도의 3% 미만.

---

### 10-5. 유료 전환이 필요한 시점과 비용

#### Workers Paid 플랜 ($5/월, 약 6,500원)

DAU 5,000명 이상이 되면 전환을 고려. $5/월에 한도가 대폭 증가:

| 항목 | Free | Workers Paid ($5/월) | 증가 배율 |
|------|------|---------------------|-----------|
| Functions 요청 | 100,000/일 | **10,000,000/월** (=333K/일) | **3.3배** |
| KV 읽기 | 100,000/일 | **10,000,000/월** | 3.3배 |
| KV 쓰기 | 1,000/일 | **1,000,000/월** (=33K/일) | **33배** |
| D1 읽기 | 5M/일 | **25B(250억)/월** | 사실상 무제한 |
| D1 쓰기 | 100K/일 | **50M/월** | 500배 |
| D1 저장소 | 5 GB | **5 GB (기본)** | 동일, 추가 구매 가능 |

> $5/월이면 DAU **50,000명**까지 버팀.

#### 초과 사용 시 추가 비용 (Workers Paid 기준)

| 항목 | 포함량 | 초과 단가 |
|------|--------|-----------|
| Functions 요청 | 10M/월 | $0.30/100만 요청 |
| KV 읽기 | 10M/월 | $0.50/100만 읽기 |
| KV 쓰기 | 1M/월 | $5.00/100만 쓰기 |
| KV 저장 | 1 GB | $0.50/GB-월 |
| D1 읽기 | 25B/월 | $0.001/100만 행 |
| D1 쓰기 | 50M/월 | $1.00/100만 행 |

---

### 10-6. 실제 비용 시나리오 정리

| 시나리오 | 가입자 수 | DAU | 월 비용 |
|----------|----------|-----|---------|
| **현재** | 300명 | ~100명 | **$0 (무료)** |
| 성장기 | 1,000명 | ~300명 | **$0 (무료)** |
| 확장기 | 3,000명 | ~1,000명 | **$0 (무료, 약간 빡빡)** |
| 대규모 | 10,000명 | ~3,000명 | **$5/월 (약 6,500원)** |
| 대규모+ | 30,000명 | ~10,000명 | **$5/월 + 초과분 ~$2 = $7/월** |
| 초대형 | 100,000명 | ~30,000명 | **$5/월 + 초과분 ~$10 = $15/월** |

---

### 10-7. 다른 호스팅과 비교

같은 조건(300명, 인증 시스템 포함)에서 다른 서비스 비용:

| 서비스 | 월 비용 | 비고 |
|--------|---------|------|
| **Cloudflare Pages** | **$0** | 무제한 대역폭, 글로벌 CDN |
| Vercel (Hobby) | $0 | 대역폭 100GB 제한, Serverless 100K 요청, 상업적 사용 불가 |
| Vercel (Pro) | **$20/월** | 상업적 사용 허용, 대역폭 1TB |
| Netlify (Free) | $0 | 대역폭 100GB, Functions 125K/월, 상업적 사용은 Pro 필요 |
| Netlify (Pro) | **$19/월** | 대역폭 1TB |
| AWS Amplify | **$0.01/GB** | 빌드 1000분 무료, 이후 $0.01/분 |
| Firebase Hosting | $0 | 저장 10GB, 전송 360MB/일 (무료 매우 적음) |

> **Cloudflare Pages가 무료 중 가장 넓은 한도 + 상업적 사용 허용.**
> Vercel Free는 상업적 사용 금지 (Terms of Service 위반 가능).

---

### 10-8. 추가 비용이 발생할 수 있는 부분 (Cloudflare 외)

앱 자체에서 사용하는 외부 API는 Cloudflare와 별개로 비용이 발생합니다:

| 외부 서비스 | 용도 | 비용 주체 |
|------------|------|-----------|
| Evolink AI (Gemini) | 대본 분석, 이미지/영상 생성 | **각 사용자의 API 키** |
| Kie AI | 영상 생성 폴백 | 각 사용자의 API 키 |
| Cloudinary | 이미지/영상 호스팅 | 각 사용자의 계정 |
| YouTube API | 업로드 | 각 사용자의 OAuth |

> 이 앱은 **각 사용자가 자신의 API 키를 사용하는 구조**이므로, 운영자에게 외부 API 비용이 전가되지 않습니다.
> Cloudflare 비용만 신경쓰면 됩니다 = 300명 기준 **$0**.

---

### 10-9. 숨겨진 비용은 정말 없나?

체크 항목:

- [x] Cloudflare 계정 생성: **무료** (신용카드 불필요)
- [x] Pages 호스팅: **무료** (무제한 대역폭)
- [x] HTTPS/SSL: **무료** (자동 발급)
- [x] DDoS 방어: **무료** (Cloudflare 기본 제공)
- [x] CDN: **무료** (글로벌 300+ 엣지)
- [x] Functions: **무료** (100K 요청/일)
- [x] D1 데이터베이스: **무료** (5GB)
- [x] KV 스토리지: **무료** (1GB)
- [x] 커스텀 도메인 연결: **무료** (도메인 자체 구매비는 별도, 연 $10~15)
- [x] pages.dev 서브도메인: **무료** (커스텀 도메인 없이도 사용 가능)

> **유일하게 돈이 드는 것: 커스텀 도메인을 원하면 도메인 구매비 (연 $10~15)**
> `your-app.pages.dev` 무료 도메인만 써도 완전히 무료.

---

## 11. 체크리스트

### Phase 1: 기본 배포
- [ ] Cloudflare 계정 생성
- [ ] GitHub에 레포지토리 push
- [ ] Cloudflare Pages 프로젝트 생성 + Git 연동
- [ ] 빌드 설정 입력 (빌드 명령어, 출력 디렉토리)
- [ ] 첫 배포 성공 확인 (pages.dev URL 접속)

### Phase 2: 인증 시스템
- [ ] D1 데이터베이스 생성 + 테이블 생성
- [ ] KV 네임스페이스 2개 생성 (SESSIONS, INVITE_CODES)
- [ ] wrangler.toml 작성
- [ ] Pages 대시보드에서 바인딩 설정 (D1, KV x2)
- [ ] `functions/` 폴더 + 인증 API 4개 파일 작성
- [ ] `src/services/authService.ts` 작성
- [ ] `src/components/AuthGate.tsx` 작성
- [ ] App.tsx에 인증 게이트 통합
- [ ] 로그아웃 버튼 추가

### Phase 3: 초대 코드 + 테스트
- [ ] KV에 초대 코드 1개 이상 등록
- [ ] 회원가입 테스트 (올바른 코드 / 잘못된 코드)
- [ ] 로그인 테스트
- [ ] 토큰 만료 후 재로그인 테스트
- [ ] 로그아웃 테스트

### Phase 4: 운영
- [ ] 커스텀 도메인 연결 (선택)
- [ ] 초대 코드 배포 (구매자에게 전달)
- [ ] 사용량 모니터링 설정

---

## 부록: 자주 묻는 질문

**Q: 빌드가 실패합니다.**
A: 빌드 명령어가 `cd src && npm install && npm run build`인지, 출력 디렉토리가 `src/dist`인지 확인하세요.

**Q: Functions가 작동하지 않습니다.**
A: 대시보드에서 D1/KV 바인딩이 올바르게 설정되어 있는지 확인하세요. 바인딩 변경 후 재배포가 필요합니다.

**Q: 초대 코드를 변경하고 싶습니다.**
A: KV 대시보드에서 기존 코드를 삭제하고 새 코드를 추가하면 됩니다. 기존 사용자에게는 영향 없음.

**Q: 사용자 비밀번호를 초기화하려면?**
A: D1 콘솔에서 해당 사용자의 `password_hash`를 직접 업데이트하거나, 사용자를 삭제 후 재가입 안내. (비밀번호 찾기 기능은 이메일 서비스 연동 필요 — 추후 도입.)

**Q: 결제 기능을 나중에 추가하려면?**
A: 아래 12장 "결제 모듈 연동" 참조.

---

## 12. 결제 모듈 연동 (추후 도입용)

### 12-1. 결제 서비스 비교

| 서비스 | 수수료 | 한국 원화 | 정기결제 | 난이도 | 추천 |
|--------|--------|-----------|----------|--------|------|
| **Lemon Squeezy** | 5% + $0.50 | O (자동 환율) | O | 쉬움 | **1순위** |
| **Stripe** | 3.4% + ₩400 | O (직접 지원) | O | 보통 | 2순위 |
| Paddle | 5% + $0.50 | O | O | 보통 | 해외 판매 특화 |
| 토스페이먼츠 | 3.3% | O (국내 전용) | O | 어려움 | 국내 전용 시 |
| PayPal | 4.4% + ₩450 | O | O | 보통 | 해외 사용자 많을 때 |

#### 왜 Lemon Squeezy가 1순위인가?

- **MoR (Merchant of Record)**: Lemon Squeezy가 세금 신고/부가세/환불 처리를 전부 대행
- 사업자등록 없이도 판매 가능 (개인도 OK)
- 한국 원화 자동 변환
- 초대 코드 자동 발급을 위한 Webhook 제공
- Cloudflare Pages Functions와 연동이 매우 간단
- 결제 페이지를 직접 만들 필요 없음 (호스팅된 결제 페이지 제공)

#### Stripe를 선택하는 경우

- 수수료가 Lemon Squeezy보다 저렴 (3.4% vs 5%)
- 한국 사업자등록이 있고, 세금 처리를 직접 할 수 있는 경우
- 더 세밀한 결제 커스터마이징이 필요한 경우

---

### 12-2. 결제 흐름 설계

```
[구매자]
  │
  ├─ 결제 페이지 접속 (Lemon Squeezy 호스팅 or 앱 내 링크)
  │       │
  │       v
  │  [Lemon Squeezy / Stripe] ── 결제 처리
  │       │
  │       v
  │  Webhook 발송 ──────────────> [Pages Functions /api/webhook/payment]
  │                                      │
  │                                      ├─ 초대 코드 자동 생성 (KV에 저장)
  │                                      ├─ 구매 기록 저장 (D1에 저장)
  │                                      └─ 이메일로 초대 코드 전송 (선택)
  │
  └─ 초대 코드 수령 → 회원가입 → 앱 사용
```

---

### 12-3. Lemon Squeezy 연동 상세

#### Step 1: Lemon Squeezy 계정 + 상품 생성

1. https://lemonsqueezy.com 가입
2. 대시보드 → **Store** → 스토어 생성
3. **Products** → "New Product" 클릭
4. 상품 설정:
   - 이름: "All-in-One Production 이용권"
   - 가격: 원하는 금액 (예: $29.99 일회성, 또는 $9.99/월 구독)
   - 타입: `License key` 선택 (자동으로 키 발급)
5. **Webhooks** → 설정 (아래 Step 3에서)

#### Step 2: Webhook 수신 API 생성

`functions/api/webhook/payment.ts`:

```typescript
interface Env {
  DB: D1Database;
  INVITE_CODES: KVNamespace;
  LEMON_WEBHOOK_SECRET: string; // 환경변수로 설정
}

// Lemon Squeezy Webhook 서명 검증
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === signature;
}

// 랜덤 초대 코드 생성
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제외
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const rawBody = await context.request.text();
    const signature = context.request.headers.get('x-signature') || '';

    // 1. 서명 검증
    const valid = await verifyWebhookSignature(
      rawBody, signature, context.env.LEMON_WEBHOOK_SECRET
    );
    if (!valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers }
      );
    }

    const event = JSON.parse(rawBody);
    const eventName = event.meta?.event_name;

    // 2. 결제 완료 이벤트만 처리
    if (eventName !== 'order_created') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const order = event.data?.attributes;
    const customerEmail = order?.user_email;
    const productName = order?.first_order_item?.product_name;
    const orderId = order?.identifier || String(event.data?.id);
    const amount = order?.total; // 센트 단위
    const currency = order?.currency;

    // 3. 초대 코드 생성
    const inviteCode = generateInviteCode();
    await context.env.INVITE_CODES.put(inviteCode, JSON.stringify({
      maxUses: 1,
      currentUses: 0,
      label: `결제 자동발급 - ${customerEmail}`,
      orderId,
      createdAt: new Date().toISOString(),
    }));

    // 4. 구매 기록 저장
    await context.env.DB.prepare(
      `INSERT INTO purchases (order_id, email, product, amount, currency, invite_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(orderId, customerEmail, productName, amount, currency, inviteCode).run();

    // 5. (선택) 이메일 발송 — Lemon Squeezy 자체 이메일에 라이선스 키가 포함되므로
    //    별도 이메일 발송은 보통 불필요. 필요하면 Resend API 등 활용.

    console.log(`[Payment] 코드 발급 완료: ${inviteCode} → ${customerEmail}`);

    return new Response(
      JSON.stringify({ ok: true, inviteCode }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    console.error('[Payment Webhook Error]', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers }
    );
  }
};
```

#### Step 3: 구매 기록 테이블 생성

D1에 추가 테이블:

```sql
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  product TEXT,
  amount INTEGER,          -- 센트 단위
  currency TEXT DEFAULT 'USD',
  invite_code TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);
CREATE INDEX IF NOT EXISTS idx_purchases_order ON purchases(order_id);
```

실행:
```bash
wrangler d1 execute auth-db --file=schema-purchases.sql
```

#### Step 4: Lemon Squeezy Webhook 등록

1. Lemon Squeezy 대시보드 → **Settings** → **Webhooks**
2. "Add Webhook" 클릭
3. URL: `https://your-app.pages.dev/api/webhook/payment`
4. Events: `order_created` 체크
5. Signing Secret 복사 → Cloudflare Pages 환경변수에 등록

#### Step 5: Cloudflare에 환경변수 등록

1. Cloudflare 대시보드 → Workers & Pages → 프로젝트
2. **Settings** → **Environment variables**
3. 추가:
   - Name: `LEMON_WEBHOOK_SECRET`
   - Value: (Lemon Squeezy에서 복사한 시크릿)
   - Encrypt 체크
4. **Save** → 재배포

#### Step 6: 앱에 결제 링크 추가

```tsx
// 결제 버튼 (AuthGate 또는 랜딩 페이지에 추가)
<a
  href="https://your-store.lemonsqueezy.com/buy/your-product-id"
  target="_blank"
  rel="noopener noreferrer"
  className="inline-block px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600
             text-white font-bold rounded-xl hover:from-green-500 hover:to-emerald-500
             transition-all shadow-lg"
>
  이용권 구매하기
</a>
```

> Lemon Squeezy는 호스팅된 결제 페이지를 제공하므로, 결제 UI를 직접 만들 필요 없음.
> 구매 완료 → Webhook → 초대 코드 자동 생성 → 구매자 이메일에 코드 포함.

---

### 12-4. Stripe 연동 상세 (대안)

Stripe를 선택하는 경우의 연동 방법입니다.

#### Step 1: Stripe 계정 + 상품 생성

1. https://stripe.com 가입 (한국 사업자 가능)
2. **Products** → "Add product"
3. 가격 설정 (일회성 또는 구독)
4. **Payment Links** → 결제 링크 생성 (가장 간단한 방법)

#### Step 2: Webhook 수신 API

`functions/api/webhook/stripe.ts`:

```typescript
interface Env {
  DB: D1Database;
  INVITE_CODES: KVNamespace;
  STRIPE_WEBHOOK_SECRET: string;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// Stripe 서명 검증 (타임스탬프 포함)
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts['t'];
  const expectedSig = parts['v1'];
  if (!timestamp || !expectedSig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === expectedSig;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const rawBody = await context.request.text();
    const sigHeader = context.request.headers.get('stripe-signature') || '';

    const valid = await verifyStripeSignature(
      rawBody, sigHeader, context.env.STRIPE_WEBHOOK_SECRET
    );
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers });
    }

    const event = JSON.parse(rawBody);

    // checkout.session.completed 이벤트만 처리
    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email;
    const amount = session.amount_total; // 센트
    const currency = session.currency;
    const orderId = session.id;

    // 초대 코드 생성
    const inviteCode = generateInviteCode();
    await context.env.INVITE_CODES.put(inviteCode, JSON.stringify({
      maxUses: 1,
      currentUses: 0,
      label: `Stripe 자동발급 - ${customerEmail}`,
      orderId,
      createdAt: new Date().toISOString(),
    }));

    // 구매 기록
    await context.env.DB.prepare(
      `INSERT INTO purchases (order_id, email, product, amount, currency, invite_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(orderId, customerEmail, 'stripe_checkout', amount, currency, inviteCode).run();

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (err: unknown) {
    console.error('[Stripe Webhook Error]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers });
  }
};
```

#### Step 3: Stripe Webhook 등록

1. Stripe 대시보드 → **Developers** → **Webhooks**
2. "Add endpoint" 클릭
3. URL: `https://your-app.pages.dev/api/webhook/stripe`
4. Events: `checkout.session.completed` 선택
5. Signing Secret 복사 → Cloudflare 환경변수 `STRIPE_WEBHOOK_SECRET`에 등록

---

### 12-5. 구독(정기결제) 모델 확장

일회성이 아닌 월/연 구독을 원하면:

#### D1 테이블 확장

```sql
-- users 테이블에 구독 상태 컬럼 추가
ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'none';
-- 값: 'none', 'active', 'cancelled', 'expired', 'past_due'

ALTER TABLE users ADD COLUMN subscription_ends_at TEXT;
-- 구독 만료 시각 (ISO 8601)

ALTER TABLE users ADD COLUMN subscription_plan TEXT;
-- 'monthly', 'yearly', 'lifetime'
```

#### 구독 갱신/취소 Webhook 추가

Lemon Squeezy 이벤트:
- `subscription_payment_success` → 구독 갱신 성공 → `subscription_ends_at` 연장
- `subscription_cancelled` → 구독 취소 → `subscription_status = 'cancelled'`
- `subscription_expired` → 만료 → `subscription_status = 'expired'`

```typescript
// functions/api/webhook/payment.ts에 추가
if (eventName === 'subscription_payment_success') {
  const email = order?.user_email;
  // 구독 기간 30일 연장
  await context.env.DB.prepare(
    `UPDATE users SET subscription_status = 'active',
     subscription_ends_at = datetime('now', '+30 days')
     WHERE email = ?`
  ).bind(email).run();
}

if (eventName === 'subscription_cancelled') {
  const email = order?.user_email;
  await context.env.DB.prepare(
    `UPDATE users SET subscription_status = 'cancelled' WHERE email = ?`
  ).bind(email).run();
}

if (eventName === 'subscription_expired') {
  const email = order?.user_email;
  await context.env.DB.prepare(
    `UPDATE users SET subscription_status = 'expired' WHERE email = ?`
  ).bind(email).run();
}
```

#### 프론트엔드에서 구독 상태 확인

verify API 응답에 구독 정보를 포함:

```typescript
// functions/api/auth/verify.ts 수정
const userRow = await context.env.DB.prepare(
  'SELECT subscription_status, subscription_ends_at, subscription_plan FROM users WHERE email = ?'
).bind(user.email).first();

return new Response(JSON.stringify({
  valid: true,
  user: {
    ...user,
    subscription: {
      status: userRow?.subscription_status || 'none',
      endsAt: userRow?.subscription_ends_at,
      plan: userRow?.subscription_plan,
    }
  }
}));
```

앱에서 만료된 구독 사용자를 차단하거나 제한:

```typescript
// App.tsx에서
if (authUser.subscription?.status === 'expired') {
  return <SubscriptionExpiredPage />;  // 갱신 안내 페이지
}
```

---

### 12-6. 결제 관련 추가 비용

#### Lemon Squeezy 이용 비용

| 항목 | 비용 |
|------|------|
| 계정 생성 | 무료 |
| 월 고정비 | **$0** |
| 거래 수수료 | **5% + $0.50/건** |
| 세금 대행 | 포함 (추가 비용 없음) |
| 환불 시 | 수수료 환불 안됨 |

예시: 상품 가격 $29.99
- 수수료: $29.99 x 5% + $0.50 = **$2.00**
- 순수익: **$27.99**

예시: 월 구독 $9.99/월
- 수수료: $9.99 x 5% + $0.50 = **$1.00**
- 순수익: **$8.99/월**

#### Stripe 이용 비용

| 항목 | 비용 |
|------|------|
| 계정 생성 | 무료 |
| 월 고정비 | **$0** |
| 거래 수수료 (한국) | **3.4% + ₩400/건** |
| 해외 카드 추가 | +1% |
| 환율 수수료 | +1% (USD→KRW) |
| 환불 시 | 수수료 환불 안됨 |

예시: 상품 가격 ₩39,000
- 수수료: ₩39,000 x 3.4% + ₩400 = **₩1,726**
- 순수익: **₩37,274**

---

### 12-7. 수익 시뮬레이션

#### 시나리오 A: 일회성 판매 ($29.99)

| 판매 수 | 매출 | Lemon 수수료 | 순수익 | Cloudflare 비용 |
|---------|------|-------------|--------|----------------|
| 100건 | $2,999 | $200 | **$2,799** | $0 |
| 300건 | $8,997 | $600 | **$8,397** | $0 |
| 500건 | $14,995 | $1,000 | **$13,995** | $0 |
| 1,000건 | $29,990 | $2,000 | **$27,990** | $0 |

#### 시나리오 B: 월 구독 ($9.99/월)

| 구독자 수 | 월 매출 | Lemon 수수료/월 | 월 순수익 | 연 순수익 | Cloudflare/월 |
|----------|---------|----------------|----------|----------|--------------|
| 50명 | $500 | $75 | **$425** | **$5,100** | $0 |
| 100명 | $999 | $150 | **$849** | **$10,188** | $0 |
| 300명 | $2,997 | $450 | **$2,547** | **$30,564** | $0 |
| 500명 | $4,995 | $750 | **$4,245** | **$50,940** | $0~$5 |

#### 시나리오 C: 연 구독 ($89.99/년, 25% 할인)

| 구독자 수 | 연 매출 | Lemon 수수료/년 | 연 순수익 | Cloudflare/년 |
|----------|---------|----------------|----------|--------------|
| 100명 | $8,999 | $600 | **$8,399** | $0 |
| 300명 | $26,997 | $1,800 | **$25,197** | $0 |
| 500명 | $44,995 | $3,000 | **$41,995** | $0~$60 |

---

## 13. 심화 비용 분석

### 13-1. 월별 운영비 총정리 (현실적 시나리오)

#### 시나리오: 가입자 300명, DAU 100명, Lemon Squeezy 일회성 판매

| 비용 항목 | 월 비용 | 비고 |
|-----------|---------|------|
| Cloudflare Pages | $0 | 무료 |
| Cloudflare Functions | $0 | 175요청/일, 한도의 0.18% |
| Cloudflare D1 | $0 | 무료 |
| Cloudflare KV | $0 | 무료 |
| 커스텀 도메인 | ~$1.25/월 | 연 $10~15, 없어도 OK |
| Lemon Squeezy | $0 고정 | 거래 발생 시만 수수료 |
| 이메일 서비스 (선택) | $0 | Resend 무료 3,000건/월 |
| **합계** | **$0 ~ $1.25/월** | |

#### 시나리오: 가입자 1,000명, DAU 300명, 월 구독 $9.99

| 비용 항목 | 월 비용 | 비고 |
|-----------|---------|------|
| Cloudflare 전체 | $0 | 여전히 무료 한도 내 |
| Lemon Squeezy 수수료 | ~$150 | 거래 수수료만 (고정비 $0) |
| 커스텀 도메인 | ~$1.25 | 연 $15 |
| **합계** | **~$151/월** | 순수익 $849/월 |

#### 시나리오: 가입자 5,000명, DAU 1,500명, 월 구독 $9.99

| 비용 항목 | 월 비용 | 비고 |
|-----------|---------|------|
| Cloudflare Workers Paid | $5 | DAU 1,500이면 전환 권장 |
| Lemon Squeezy 수수료 | ~$500 | |
| 커스텀 도메인 | ~$1.25 | |
| **합계** | **~$506/월** | 순수익 $4,494/월 |

---

### 13-2. Cloudflare 한도 초과 시 정확히 무슨 일이 벌어지나?

많은 분들이 걱정하는 부분을 명확히 합니다:

#### Functions 100,000/일 초과 시

- 100,001번째 요청부터 **HTTP 429 (Too Many Requests)** 응답
- **앱 자체는 정상 작동** (정적 파일이라 Functions와 무관)
- 영향 범위: 로그인/회원가입/토큰검증 API만 실패
- 다음날 00:00 UTC에 카운터 리셋
- **기존에 로그인된 사용자**: 로컬 토큰이 있으므로 앱 자체는 계속 사용 가능
  (다만 새로운 API 요청은 실패)

#### KV 쓰기 1,000/일 초과 시

- 세션 저장, 초대 코드 갱신 쓰기만 실패
- **읽기(토큰 검증)는 별개 한도**이므로 계속 작동
- 즉, 새 로그인만 안 되고 기존 세션은 유지

#### D1 한도 초과 시

- 해당 쿼리만 에러, 다른 기능은 정상
- 사실상 도달 불가능한 수준 (5M 읽기/일)

#### 요약: 한도 초과 = 서비스 다운이 아님

```
한도 초과 시:
  앱 로딩         → 정상 (정적 파일)
  AI 기능         → 정상 (외부 API 직접 호출)
  프로젝트 저장    → 정상 (IndexedDB, 브라우저 로컬)
  새 로그인       → 실패 (Functions)
  기존 세션       → 정상 (로컬 토큰)
  회원가입        → 실패 (Functions)
```

> **최악의 경우에도 "신규 가입/로그인만 일시 중단"**이며 기존 사용자의 앱 사용에는 영향 없음.

---

### 13-3. 무료→유료 전환 시점 판단 기준

대시보드에서 이 숫자들을 모니터링하세요:

| 지표 | 위험 신호 | 조치 |
|------|----------|------|
| Functions 요청/일 | 70,000 이상 (70%) | Workers Paid ($5/월) 전환 준비 |
| KV 쓰기/일 | 700 이상 (70%) | Workers Paid 전환 |
| 회원가입 실패 리포트 | 사용자 불만 | 즉시 유료 전환 |

전환 방법:
1. Cloudflare 대시보드 → Workers & Pages → **Plans**
2. "Workers Paid" → **$5/월** 선택
3. 즉시 적용 (다운타임 없음)

---

### 13-4. 연간 총 운영비 비교표

| 규모 | Cloudflare | 결제 수수료 | 도메인 | **연간 총 비용** | **연간 순수익** |
|------|-----------|------------|--------|----------------|----------------|
| 300명, 일회성 $29.99 | $0 | $600 | $15 | **$615** | **$8,382** |
| 300명, 월 $9.99 | $0 | $5,400 | $15 | **$5,415** | **$30,549** |
| 1,000명, 월 $9.99 | $0 | $18,000 | $15 | **$18,015** | **$101,865** |
| 3,000명, 월 $9.99 | $0 | $54,000 | $15 | **$54,015** | **$305,829** |
| 5,000명, 월 $9.99 | $60 | $90,000 | $15 | **$90,075** | **$509,685** |

> Cloudflare 비용은 전체의 **0.01% 미만**. 실질적인 비용은 결제 수수료뿐.

---

### 13-5. 최종 비용 요약 한 줄

> **300명 기준 Cloudflare 비용: $0/월 (무료). 유일한 비용은 판매 시 결제 수수료 5%.**
> **DAU 3,000명까지 무료, 그 이상은 $5/월. 사실상 호스팅 비용 걱정 불필요.**

---

## 부록 B: 결제 모듈 체크리스트

### Phase 5: 결제 연동

- [ ] Lemon Squeezy (또는 Stripe) 계정 생성
- [ ] 상품 생성 (일회성 / 구독)
- [ ] D1에 purchases 테이블 생성
- [ ] `functions/api/webhook/payment.ts` 작성
- [ ] Webhook URL 등록 + Signing Secret 환경변수 설정
- [ ] 테스트 결제 (Lemon Squeezy Test Mode)
- [ ] 초대 코드 자동 발급 확인
- [ ] 앱에 결제 링크/버튼 추가
- [ ] 프로덕션 모드 전환

### Phase 6: 구독 모델 (선택)

- [ ] users 테이블에 subscription 컬럼 추가
- [ ] Webhook에 구독 갱신/취소/만료 핸들러 추가
- [ ] verify API에서 구독 상태 반환
- [ ] 프론트엔드에서 만료 구독 처리 (갱신 안내)
- [ ] 구독 관리 페이지 (선택)

---

## 14. 한국 결제 모듈 연동 (카카오페이 / 네이버페이 / 토스페이)

> 한국 사용자가 주력이면 Lemon Squeezy/Stripe 대신 **한국 PG(Payment Gateway)**를 사용하세요.
> 카카오페이, 네이버페이, 토스페이, 신용카드, 계좌이체를 **하나의 연동**으로 전부 지원합니다.

---

### 14-1. 한국 결제 서비스 비교

| 서비스 | 유형 | 수수료 | 사업자 필요 | 난이도 | 추천 |
|--------|------|--------|------------|--------|------|
| **포트원 (PortOne)** | PG 통합 플랫폼 | PG사 수수료만 (포트원 자체 무료) | O | **쉬움** | **1순위** |
| **토스페이먼츠** | PG 직접 연동 | 카드 3.3%, 간편결제 3.3% | O | 보통 | 2순위 |
| NHN KCP | 전통 PG | 카드 3.3~3.7% | O | 어려움 | - |
| KG이니시스 | 전통 PG | 카드 3.3~3.7% | O | 어려움 | - |
| 나이스페이먼츠 | 전통 PG | 카드 3.3~3.7% | O | 어려움 | - |

---

### 14-2. 왜 포트원(PortOne)이 1순위인가?

```
[포트원 = 결제 중개 플랫폼]
    │
    ├── 토스페이먼츠 ── 카드, 계좌이체, 가상계좌
    ├── 카카오페이 ──── 카카오페이 간편결제
    ├── 네이버페이 ──── 네이버페이 간편결제
    ├── 토스페이 ────── 토스 간편결제
    ├── KG이니시스 ──── 카드, 실시간이체 (폴백)
    └── 기타 PG ────── PAYCO, 삼성페이 등
```

- **포트원 자체 수수료 = $0 (무료)**. PG사 수수료만 발생
- **하나의 SDK**로 모든 결제 수단 지원
- JavaScript SDK 제공 → React에서 바로 사용
- **테스트 모드** 지원 (실제 결제 없이 테스트)
- Webhook으로 결제 완료 알림 → Cloudflare Functions에서 처리
- 대시보드에서 모든 결제 내역 통합 관리
- **사업자등록 전에도 테스트 가능** (테스트 모드)

---

### 14-3. 사전 준비: 사업자등록

> 한국 PG사를 사용하려면 **사업자등록**이 필요합니다.

| 유형 | 비용 | 기간 | 비고 |
|------|------|------|------|
| **개인사업자** | 무료 | 1~3일 | 홈택스에서 온라인 신청 가능 |
| 법인사업자 | 등록면허세 ~15만원 | 3~7일 | 규모가 커지면 전환 |

#### 개인사업자 신청 (간단)

1. [홈택스](https://www.hometax.go.kr) 접속
2. "사업자등록 신청/정정" 메뉴
3. 업태: "정보통신업", 종목: "소프트웨어 개발 및 공급" 또는 "응용소프트웨어 개발"
4. 사업장 소재지: 자택 가능
5. 1~3일 내 사업자등록번호 발급

> 사업자등록 없이도 포트원 테스트 모드로 전체 연동을 먼저 개발/테스트할 수 있습니다.
> 실제 결제만 받을 때 사업자등록이 필요합니다.

---

### 14-4. 포트원(PortOne) 가입 + PG 연동

#### Step 1: 포트원 가입

1. https://portone.io 접속 → 회원가입
2. 관리자 콘솔 접속: https://admin.portone.io
3. "결제 연동" 메뉴로 이동

#### Step 2: PG사 추가 (테스트)

포트원 관리자 콘솔에서:

1. **결제 연동** → **연동 관리** → "테스트 연동 추가"
2. PG사 선택:
   - **토스페이먼츠** (카드/계좌이체/가상계좌)
   - **카카오페이** (간편결제)
   - **네이버페이** (간편결제)
   - **토스페이** (간편결제)
3. 각 PG사별 "테스트" 채널 추가 → **채널 키** 확인
4. **상점 ID (Store ID)** 메모 (결제 요청 시 필요)

> 테스트 채널은 바로 사용 가능. 실결제 채널은 각 PG사에 별도 가맹점 심사 필요 (3~7일).

#### Step 3: PG사 실결제 가맹점 신청

각 PG사에 가맹점 신청이 필요합니다 (포트원 관리자 콘솔에서 바로 가능):

| PG사 | 필요 서류 | 심사 기간 | 수수료 |
|------|----------|----------|--------|
| 토스페이먼츠 | 사업자등록증, 통장사본 | 3~5일 | 카드 3.3% |
| 카카오페이 | 사업자등록증, 서비스 URL | 3~7일 | 3.3% |
| 네이버페이 | 사업자등록증, 서비스 URL | 5~10일 | 3.3% |
| 토스페이 | 사업자등록증 | 3~5일 | 3.3% |

> 모든 PG사를 동시에 신청할 수 있습니다. 심사 통과 전까지는 테스트 모드로 개발하세요.

---

### 14-5. 결제 흐름 설계 (한국 PG)

```
[사용자 브라우저]
    │
    ├─ 1. "결제하기" 버튼 클릭
    │
    ├─ 2. 포트원 JS SDK → 결제창 팝업 (카카오페이/네이버페이/카드 선택)
    │       │
    │       v
    │  [PG사] ── 결제 처리 (카카오페이/네이버페이/토스페이/카드)
    │       │
    │       v
    │  3. 결제 완료 → 브라우저에 paymentId 반환
    │
    ├─ 4. paymentId를 서버로 전송 → [Pages Functions /api/payment/confirm]
    │       │
    │       ├─ 5a. 포트원 API로 결제 검증 (금액 위변조 방지)
    │       ├─ 5b. 검증 성공 → 초대 코드 생성 (KV)
    │       ├─ 5c. 구매 기록 저장 (D1)
    │       └─ 5d. 초대 코드 응답
    │
    └─ 6. 초대 코드 수령 → 바로 회원가입 or 기존 계정에 적용
```

> **핵심: 결제창은 포트원 SDK가 띄워주고, 서버에서는 검증만 합니다.**
> 결제 UI를 직접 만들 필요 없음.

---

### 14-6. 프론트엔드: 포트원 SDK 연동

#### Step 1: 포트원 SDK 로드

`index.html`의 `<head>`에 추가:

```html
<!-- 포트원 V2 SDK -->
<script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
```

#### Step 2: 결제 요청 서비스

`src/services/paymentService.ts` 생성:

```typescript
// 포트원 V2 SDK 타입 선언
declare global {
  interface Window {
    PortOne: {
      requestPayment: (params: PortOnePaymentRequest) => Promise<PortOnePaymentResponse>;
    };
  }
}

interface PortOnePaymentRequest {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: string;
  payMethod: string;
  customer?: {
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  };
  redirectUrl?: string;
}

interface PortOnePaymentResponse {
  code?: string;       // 에러 코드 (성공 시 undefined)
  message?: string;    // 에러 메시지
  paymentId?: string;  // 결제 ID
  transactionType?: string;
}

// ============================================================
// 설정값 (포트원 관리자 콘솔에서 확인)
// ============================================================

const PORTONE_STORE_ID = 'store-XXXXXXXX';  // 포트원 상점 ID

// 각 PG사별 채널 키 (포트원 관리자 콘솔 → 결제 연동 → 채널 관리)
const CHANNEL_KEYS = {
  toss: 'channel-key-toss-XXXXX',       // 토스페이먼츠 (카드/계좌이체)
  kakaopay: 'channel-key-kakao-XXXXX',  // 카카오페이
  naverpay: 'channel-key-naver-XXXXX',  // 네이버페이
  tosspay: 'channel-key-tosspay-XXXXX', // 토스페이
} as const;

type PaymentMethod = keyof typeof CHANNEL_KEYS;

// ============================================================
// 고유 결제 ID 생성
// ============================================================
function generatePaymentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `pay_${timestamp}_${random}`;
}

// ============================================================
// 결제 요청
// ============================================================
export async function requestPayment(params: {
  method: PaymentMethod;
  orderName: string;
  amount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  const { method, orderName, amount, customerName, customerEmail, customerPhone } = params;

  if (!window.PortOne) {
    return { success: false, error: '결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' };
  }

  const paymentId = generatePaymentId();
  const channelKey = CHANNEL_KEYS[method];

  // 결제 수단 매핑
  const payMethodMap: Record<PaymentMethod, string> = {
    toss: 'CARD',          // 카드결제
    kakaopay: 'EASY_PAY',  // 간편결제
    naverpay: 'EASY_PAY',
    tosspay: 'EASY_PAY',
  };

  try {
    const response = await window.PortOne.requestPayment({
      storeId: PORTONE_STORE_ID,
      channelKey,
      paymentId,
      orderName,
      totalAmount: amount,
      currency: 'KRW',
      payMethod: payMethodMap[method],
      customer: {
        fullName: customerName,
        email: customerEmail,
        phoneNumber: customerPhone,
      },
    });

    // 사용자가 결제창을 닫은 경우
    if (response.code === 'FAILURE_TYPE_PG') {
      return { success: false, error: '결제가 취소되었습니다.' };
    }

    // 기타 에러
    if (response.code) {
      return { success: false, error: response.message || '결제 처리 중 오류가 발생했습니다.' };
    }

    // 결제 성공 → 서버에서 검증
    const verifyResult = await confirmPayment(paymentId, amount);
    return verifyResult;

  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '결제 요청 중 오류가 발생했습니다.',
    };
  }
}

// ============================================================
// 서버 측 결제 검증 요청
// ============================================================
async function confirmPayment(
  paymentId: string,
  expectedAmount: number,
): Promise<{ success: boolean; paymentId?: string; inviteCode?: string; error?: string }> {
  const res = await fetch('/api/payment/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId, expectedAmount }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || '결제 검증에 실패했습니다.' };
  }

  return {
    success: true,
    paymentId,
    inviteCode: data.inviteCode,
  };
}
```

#### Step 3: 결제 선택 UI 컴포넌트

`src/components/PaymentModal.tsx` 예시:

```tsx
import React, { useState } from 'react';
import { requestPayment } from '../services/paymentService';

interface PaymentModalProps {
  onClose: () => void;
  onSuccess: (inviteCode: string) => void;
  productName: string;
  price: number;  // 원 단위
}

const PAYMENT_METHODS = [
  { id: 'kakaopay' as const, name: '카카오페이', icon: '💛', color: 'from-yellow-500 to-yellow-600' },
  { id: 'naverpay' as const, name: '네이버페이', icon: '💚', color: 'from-green-500 to-green-600' },
  { id: 'tosspay' as const, name: '토스페이', icon: '💙', color: 'from-blue-500 to-blue-600' },
  { id: 'toss' as const, name: '카드결제', icon: '💳', color: 'from-gray-500 to-gray-600' },
];

const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, onSuccess, productName, price }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const handlePayment = async (method: 'kakaopay' | 'naverpay' | 'tosspay' | 'toss') => {
    setIsProcessing(true);
    setError('');

    const result = await requestPayment({
      method,
      orderName: productName,
      amount: price,
    });

    setIsProcessing(false);

    if (result.success && result.inviteCode) {
      onSuccess(result.inviteCode);
    } else {
      setError(result.error || '결제에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-700 p-6 shadow-2xl">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-white">{productName}</h2>
          <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400 mt-1">
            {price.toLocaleString()}원
          </p>
        </div>

        {/* 결제 수단 선택 */}
        <div className="space-y-2.5">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.id}
              onClick={() => handlePayment(pm.id)}
              disabled={isProcessing}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl
                bg-gradient-to-r ${pm.color} text-white font-bold text-sm
                hover:opacity-90 active:scale-[0.98] transition-all
                disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className="text-xl">{pm.icon}</span>
              <span>{pm.name}로 결제</span>
            </button>
          ))}
        </div>

        {/* 에러 */}
        {error && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-900/20 border border-red-500/30 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* 닫기 */}
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="w-full mt-4 py-2.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          취소
        </button>

        {/* 안내 문구 */}
        <p className="text-center text-xs text-gray-600 mt-3">
          결제 완료 시 즉시 이용 가능한 초대 코드가 발급됩니다
        </p>
      </div>
    </div>
  );
};

export default PaymentModal;
```

---

### 14-7. 백엔드: 결제 검증 API

> **중요: 프론트에서 결제가 완료되어도 반드시 서버에서 금액을 검증해야 합니다.**
> (클라이언트에서 금액을 조작할 수 있으므로)

`functions/api/payment/confirm.ts`:

```typescript
interface Env {
  DB: D1Database;
  INVITE_CODES: KVNamespace;
  PORTONE_API_SECRET: string;  // 포트원 V2 API Secret
}

// 랜덤 초대 코드 생성
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { paymentId, expectedAmount } = await context.request.json() as {
      paymentId: string;
      expectedAmount: number;
    };

    if (!paymentId || !expectedAmount) {
      return new Response(
        JSON.stringify({ error: '결제 정보가 누락되었습니다.' }),
        { status: 400, headers }
      );
    }

    // ──────────────────────────────────────────────
    // 1. 포트원 API로 결제 내역 조회 (금액 검증)
    // ──────────────────────────────────────────────
    const portoneRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          'Authorization': `PortOne ${context.env.PORTONE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!portoneRes.ok) {
      const errBody = await portoneRes.text();
      console.error('[PortOne API Error]', portoneRes.status, errBody);
      return new Response(
        JSON.stringify({ error: '결제 정보를 확인할 수 없습니다.' }),
        { status: 400, headers }
      );
    }

    const payment = await portoneRes.json() as {
      status: string;
      id: string;
      amount: { total: number; currency: string };
      method?: { type: string };
      customer?: { name?: string; email?: string; phoneNumber?: string };
      channel?: { pgProvider: string };
    };

    // ──────────────────────────────────────────────
    // 2. 결제 상태 확인
    // ──────────────────────────────────────────────
    if (payment.status !== 'PAID') {
      return new Response(
        JSON.stringify({ error: `결제가 완료되지 않았습니다. (상태: ${payment.status})` }),
        { status: 400, headers }
      );
    }

    // ──────────────────────────────────────────────
    // 3. 금액 위변조 검증 (핵심!)
    // ──────────────────────────────────────────────
    if (payment.amount.total !== expectedAmount) {
      console.error(
        `[Payment] 금액 불일치! 예상: ${expectedAmount}, 실제: ${payment.amount.total}, paymentId: ${paymentId}`
      );
      // TODO: 위변조 시도 → 관리자에게 알림 + 결제 취소 처리
      return new Response(
        JSON.stringify({ error: '결제 금액이 일치하지 않습니다.' }),
        { status: 400, headers }
      );
    }

    // ──────────────────────────────────────────────
    // 4. 중복 처리 방지
    // ──────────────────────────────────────────────
    const existing = await context.env.DB.prepare(
      'SELECT id FROM purchases WHERE order_id = ?'
    ).bind(paymentId).first();

    if (existing) {
      // 이미 처리된 결제 → 기존 초대 코드 반환
      const existingPurchase = await context.env.DB.prepare(
        'SELECT invite_code FROM purchases WHERE order_id = ?'
      ).bind(paymentId).first() as { invite_code: string } | null;

      return new Response(
        JSON.stringify({ ok: true, inviteCode: existingPurchase?.invite_code }),
        { status: 200, headers }
      );
    }

    // ──────────────────────────────────────────────
    // 5. 초대 코드 생성
    // ──────────────────────────────────────────────
    const inviteCode = generateInviteCode();
    await context.env.INVITE_CODES.put(inviteCode, JSON.stringify({
      maxUses: 1,
      currentUses: 0,
      label: `결제 자동발급 - ${payment.customer?.email || payment.customer?.name || paymentId}`,
      paymentId,
      createdAt: new Date().toISOString(),
    }));

    // ──────────────────────────────────────────────
    // 6. 구매 기록 저장
    // ──────────────────────────────────────────────
    await context.env.DB.prepare(
      `INSERT INTO purchases (order_id, email, product, amount, currency, invite_code, pg_provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      paymentId,
      payment.customer?.email || '',
      'all-in-one-production',
      payment.amount.total,
      payment.amount.currency,
      inviteCode,
      payment.channel?.pgProvider || 'unknown',
    ).run();

    console.log(`[Payment] 결제 확인 + 코드 발급: ${inviteCode} (${payment.amount.total}원, ${payment.channel?.pgProvider})`);

    // ──────────────────────────────────────────────
    // 7. 초대 코드 반환
    // ──────────────────────────────────────────────
    return new Response(
      JSON.stringify({ ok: true, inviteCode }),
      { status: 200, headers }
    );

  } catch (err: unknown) {
    console.error('[Payment Confirm Error]', err);
    return new Response(
      JSON.stringify({ error: '결제 확인 중 오류가 발생했습니다.' }),
      { status: 500, headers }
    );
  }
};
```

---

### 14-8. D1 테이블 수정 (한국 PG용)

기존 `purchases` 테이블에 PG사 정보 컬럼 추가:

```sql
-- 기존 purchases 테이블이 있다면 컬럼 추가
ALTER TABLE purchases ADD COLUMN pg_provider TEXT DEFAULT 'unknown';

-- 새로 만드는 경우
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,       -- 포트원 paymentId
  email TEXT,
  product TEXT,
  amount INTEGER NOT NULL,             -- 원 단위
  currency TEXT DEFAULT 'KRW',
  invite_code TEXT NOT NULL,
  pg_provider TEXT DEFAULT 'unknown',  -- kakaopay, naverpay, tosspay, toss 등
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);
CREATE INDEX IF NOT EXISTS idx_purchases_order ON purchases(order_id);
```

---

### 14-9. Cloudflare 환경변수 설정

포트원 API Secret을 Cloudflare에 등록:

1. 포트원 관리자 콘솔 → **설정** → **API Keys** → **V2 API Secret** 복사
2. Cloudflare 대시보드 → Workers & Pages → 프로젝트 → **Settings** → **Environment variables**
3. 추가:
   - Name: `PORTONE_API_SECRET`
   - Value: (포트원에서 복사한 시크릿)
   - **Encrypt** 체크
4. **Save** → 재배포

---

### 14-10. Webhook 방식 (선택 — 추가 안전장치)

위의 14-7 방식(클라이언트→서버 검증)으로도 충분하지만, 추가로 Webhook을 설정하면 더 안전합니다.
(네트워크 오류로 클라이언트가 검증 요청을 못 보내는 경우 대비)

`functions/api/webhook/portone.ts`:

```typescript
interface Env {
  DB: D1Database;
  INVITE_CODES: KVNamespace;
  PORTONE_API_SECRET: string;
  PORTONE_WEBHOOK_SECRET: string;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// 포트원 Webhook 서명 검증
async function verifyWebhook(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === signature;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const rawBody = await context.request.text();
    const signature = context.request.headers.get('webhook-signature') || '';

    // 서명 검증
    if (context.env.PORTONE_WEBHOOK_SECRET) {
      const valid = await verifyWebhook(rawBody, signature, context.env.PORTONE_WEBHOOK_SECRET);
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers });
      }
    }

    const event = JSON.parse(rawBody);

    // 결제 완료 이벤트만 처리
    if (event.type !== 'Transaction.Paid') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const paymentId = event.data?.paymentId;
    if (!paymentId) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    // 중복 처리 방지
    const existing = await context.env.DB.prepare(
      'SELECT id FROM purchases WHERE order_id = ?'
    ).bind(paymentId).first();

    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: 'already processed' }), { status: 200, headers });
    }

    // 포트원 API로 결제 상세 조회
    const portoneRes = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      { headers: { 'Authorization': `PortOne ${context.env.PORTONE_API_SECRET}` } }
    );
    const payment = await portoneRes.json() as {
      status: string;
      amount: { total: number; currency: string };
      customer?: { email?: string; name?: string };
      channel?: { pgProvider: string };
    };

    if (payment.status !== 'PAID') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    // 초대 코드 발급 + 기록 저장
    const inviteCode = generateInviteCode();
    await context.env.INVITE_CODES.put(inviteCode, JSON.stringify({
      maxUses: 1, currentUses: 0,
      label: `Webhook 자동발급 - ${payment.customer?.email || paymentId}`,
      paymentId, createdAt: new Date().toISOString(),
    }));

    await context.env.DB.prepare(
      `INSERT INTO purchases (order_id, email, product, amount, currency, invite_code, pg_provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(
      paymentId, payment.customer?.email || '', 'all-in-one-production',
      payment.amount.total, payment.amount.currency, inviteCode,
      payment.channel?.pgProvider || 'webhook',
    ).run();

    console.log(`[Webhook] 코드 발급: ${inviteCode}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (err) {
    console.error('[PortOne Webhook Error]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers });
  }
};
```

포트원 Webhook 등록:
1. 포트원 관리자 콘솔 → **설정** → **Webhook**
2. URL: `https://your-app.pages.dev/api/webhook/portone`
3. 이벤트: `Transaction.Paid`
4. Signing Secret → Cloudflare 환경변수 `PORTONE_WEBHOOK_SECRET`에 등록

---

### 14-11. 한국 PG 수수료 상세 비교

#### 결제 수단별 수수료

| 결제 수단 | 수수료율 | 정산 주기 | 비고 |
|-----------|---------|----------|------|
| **신용카드** | 3.3% | D+3~7 | 모든 PG사 동일 (여신금융협회 기준) |
| **카카오페이** | 3.3% | D+1~3 | 빠른 정산 |
| **네이버페이** | 3.3% | D+1~3 | 네이버 쇼핑 연동 가능 |
| **토스페이** | 3.3% | D+1 | 가장 빠른 정산 |
| **계좌이체** | 1.5~2.0% | D+1 | 수수료 낮음 |
| **가상계좌** | 건당 300원 | 입금 확인 후 D+1 | 대금 결제에 유리 |

> 참고: 매출 규모에 따라 수수료 협상 가능 (월 1,000만원 이상 시)

#### Lemon Squeezy vs 한국 PG 수수료 비교

상품 가격 39,000원 기준:

| 서비스 | 수수료 | 순수익 | 비고 |
|--------|--------|--------|------|
| **카카오페이 (포트원)** | 39,000 x 3.3% = **1,287원** | **37,713원** | 포트원 자체 수수료 없음 |
| **토스페이 (포트원)** | 39,000 x 3.3% = **1,287원** | **37,713원** | |
| **카드결제 (포트원)** | 39,000 x 3.3% = **1,287원** | **37,713원** | |
| Lemon Squeezy | 39,000 x 5% + 700원* = **2,650원** | **36,350원** | *$0.50≈700원 |
| Stripe (한국) | 39,000 x 3.4% + 400원 = **1,726원** | **37,274원** | |

> **한국 PG가 Lemon Squeezy보다 건당 ~1,400원 절약.**
> 300건 판매 시 차이: **420,000원 (약 $300)**

---

### 14-12. 한국 PG 수익 시뮬레이션

#### 시나리오 A: 일회성 판매 (39,000원)

| 판매 수 | 매출 | PG 수수료 (3.3%) | 포트원 비용 | **순수익** |
|---------|------|-----------------|------------|-----------|
| 100건 | 3,900,000원 | 128,700원 | 0원 | **3,771,300원** |
| 300건 | 11,700,000원 | 386,100원 | 0원 | **11,313,900원** |
| 500건 | 19,500,000원 | 643,500원 | 0원 | **18,856,500원** |
| 1,000건 | 39,000,000원 | 1,287,000원 | 0원 | **37,713,000원** |

#### 시나리오 B: 월 구독 (12,900원/월)

| 구독자 | 월 매출 | PG 수수료/월 | **월 순수익** | **연 순수익** |
|--------|---------|-------------|-------------|-------------|
| 50명 | 645,000원 | 21,285원 | **623,715원** | **7,484,580원** |
| 100명 | 1,290,000원 | 42,570원 | **1,247,430원** | **14,969,160원** |
| 300명 | 3,870,000원 | 127,710원 | **3,742,290원** | **44,907,480원** |
| 500명 | 6,450,000원 | 212,850원 | **6,237,150원** | **74,845,800원** |

#### 시나리오 C: 연 구독 (129,000원/년, 17% 할인)

| 구독자 | 연 매출 | PG 수수료 | **연 순수익** |
|--------|---------|----------|-------------|
| 100명 | 12,900,000원 | 425,700원 | **12,474,300원** |
| 300명 | 38,700,000원 | 1,277,100원 | **37,422,900원** |
| 500명 | 64,500,000원 | 2,128,500원 | **62,371,500원** |

---

### 14-13. 포트원 vs Lemon Squeezy — 어떤 걸 선택할까?

| 기준 | 포트원 (한국 PG) | Lemon Squeezy |
|------|----------------|---------------|
| **주 사용자가 한국인** | **추천** | - |
| 주 사용자가 해외 | - | **추천** |
| 사업자등록 | **필요** | 불필요 |
| 세금 처리 | 직접 | 대행 (MoR) |
| 수수료 | **3.3%** | 5% + $0.50 |
| 카카오페이/네이버페이 | **지원** | 미지원 |
| 결제 UI | SDK 팝업 (한국 최적화) | 호스팅 페이지 (영문 위주) |
| 정산 | PG사별 D+1~7 | 월 2회 (해외 송금) |
| 환불 | 직접 처리 | Lemon Squeezy 대행 |
| 정기결제 (구독) | PG사별 빌링키 | 자체 지원 |
| 설정 난이도 | 보통 | 쉬움 |

#### 추천 조합

```
한국 사용자 95% 이상 → 포트원 단독
한국 70% + 해외 30%  → 포트원 (한국) + Lemon Squeezy (해외)
해외 사용자 위주     → Lemon Squeezy 단독
```

---

### 14-14. 정기결제(구독) 연동 (포트원 빌링키)

한국 PG로 월 구독을 구현하려면 **빌링키**를 사용합니다:

```
[최초 결제]
  사용자 → 카드정보 입력 → PG사가 "빌링키" 발급 → 서버에 저장

[매월 자동 결제]
  서버 → 빌링키로 포트원 API 호출 → PG사가 자동 결제 → 결과 확인
```

#### 빌링키 발급 (프론트)

```typescript
// paymentService.ts에 추가
export async function requestBillingKey(params: {
  customerName: string;
  customerEmail: string;
}): Promise<{ success: boolean; billingKey?: string; error?: string }> {
  const billingKeyId = `billing_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  const response = await window.PortOne.requestIssueBillingKey({
    storeId: PORTONE_STORE_ID,
    channelKey: CHANNEL_KEYS.toss,  // 빌링키는 카드 PG사 사용
    billingKeyMethod: 'CARD',
    issueId: billingKeyId,
    issueName: 'All-in-One Production 월 구독',
    customer: {
      fullName: params.customerName,
      email: params.customerEmail,
    },
  });

  if (response.code) {
    return { success: false, error: response.message || '카드 등록에 실패했습니다.' };
  }

  // 서버에 빌링키 등록
  const res = await fetch('/api/subscription/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billingKey: response.billingKey,
      customerEmail: params.customerEmail,
    }),
  });

  const data = await res.json();
  return data.ok
    ? { success: true, billingKey: response.billingKey }
    : { success: false, error: data.error };
}
```

#### 정기 결제 실행 (서버 — Cron)

Cloudflare Workers의 **Cron Triggers**로 매월 자동 결제:

`functions/scheduled/billing.ts` (Cron Worker):

```typescript
// wrangler.toml에 추가:
// [triggers]
// crons = ["0 9 1 * *"]  # 매월 1일 오전 9시 (UTC)

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // 1. 활성 구독자 목록 조회
    const subscribers = await env.DB.prepare(
      `SELECT id, email, billing_key, subscription_plan
       FROM users
       WHERE subscription_status = 'active'
         AND billing_key IS NOT NULL`
    ).all();

    for (const user of subscribers.results || []) {
      const amount = user.subscription_plan === 'yearly' ? 129000 : 12900;
      const paymentId = `sub_${user.id}_${Date.now()}`;

      // 2. 포트원 빌링키 결제 API 호출
      const res = await fetch('https://api.portone.io/payments/billing-key/pay', {
        method: 'POST',
        headers: {
          'Authorization': `PortOne ${env.PORTONE_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          billingKey: user.billing_key,
          paymentId,
          orderName: 'All-in-One Production 구독 갱신',
          amount: { total: amount, currency: 'KRW' },
          customer: { email: user.email },
        }),
      });

      const result = await res.json();

      if (result.status === 'PAID') {
        // 3. 구독 연장
        await env.DB.prepare(
          `UPDATE users SET subscription_ends_at = datetime('now', '+30 days')
           WHERE id = ?`
        ).bind(user.id).run();

        console.log(`[Billing] ${user.email} 구독 갱신 완료 (${amount}원)`);
      } else {
        // 4. 결제 실패 → 상태 변경
        await env.DB.prepare(
          `UPDATE users SET subscription_status = 'past_due' WHERE id = ?`
        ).bind(user.id).run();

        console.error(`[Billing] ${user.email} 결제 실패:`, result);
        // TODO: 실패 알림 이메일 발송
      }
    }
  },
};
```

#### users 테이블 확장 (빌링키용)

```sql
ALTER TABLE users ADD COLUMN billing_key TEXT;
-- PG사 빌링키 (암호화된 카드 토큰)
```

---

### 14-15. 환경변수 최종 정리

Cloudflare Pages → Settings → Environment variables에 추가:

| 변수명 | 값 | 용도 |
|--------|------|------|
| `PORTONE_API_SECRET` | `portone-api-XXXXX...` | 포트원 V2 API 인증 |
| `PORTONE_WEBHOOK_SECRET` | (Webhook 설정 시 발급) | Webhook 서명 검증 |
| `LEMON_WEBHOOK_SECRET` | (해외 결제 병행 시) | Lemon Squeezy Webhook |

---

### 14-16. 한국 결제 체크리스트

#### Phase 5K: 한국 결제 연동

- [ ] 사업자등록 (아직 없다면)
- [ ] 포트원 가입 + 관리자 콘솔 접속
- [ ] 테스트 채널 추가 (토스페이먼츠, 카카오페이, 네이버페이, 토스페이)
- [ ] `index.html`에 포트원 SDK 스크립트 추가
- [ ] `src/services/paymentService.ts` 작성
- [ ] `src/components/PaymentModal.tsx` 작성
- [ ] `functions/api/payment/confirm.ts` 작성
- [ ] D1에 purchases 테이블 생성 (pg_provider 컬럼 포함)
- [ ] Cloudflare 환경변수 `PORTONE_API_SECRET` 등록
- [ ] **테스트 결제** (카카오페이 테스트 → 초대 코드 발급 확인)
- [ ] **테스트 결제** (카드결제 테스트 → 초대 코드 발급 확인)
- [ ] 앱에 결제 버튼/모달 추가

#### Phase 6K: 실결제 전환

- [ ] 각 PG사 가맹점 심사 신청 (포트원 콘솔에서)
- [ ] 심사 통과 후 실결제 채널 키로 교체
- [ ] 실결제 테스트 (소액)
- [ ] 라이브 배포

#### Phase 7K: 구독 모델 (선택)

- [ ] 빌링키 발급 UI 추가
- [ ] `functions/api/subscription/register.ts` 작성
- [ ] Cron Trigger 설정 (`wrangler.toml`)
- [ ] `functions/scheduled/billing.ts` 작성
- [ ] users 테이블에 `billing_key` 컬럼 추가
- [ ] 구독 갱신/실패 처리 테스트
- [ ] 해지 기능 추가

---

> 이 매뉴얼대로 진행하면 **무료**로 전세계에서 빠르게 접속 가능한 서비스가 완성됩니다.
> 한국 결제 모듈(카카오페이/네이버페이/토스페이)까지 추가하면 한국 사용자에게 최적화된 완전한 SaaS 비즈니스가 됩니다.
> 결제 수수료도 해외 서비스 대비 약 **40% 절감** (5% → 3.3%).
> 문의 사항이 있으면 각 단계를 짚어서 질문해주세요.

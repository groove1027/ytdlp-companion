/**
 * 동시 세션 제한 (최대 2개)
 * 로그인/가입 시 기존 세션 수를 확인하고 초과 시 가장 오래된 세션 삭제
 */

const MAX_SESSIONS = 2;
const SESSION_LIST_PREFIX = 'user_sessions:';

interface SessionEntry {
  token: string;
  createdAt: string;
}

/**
 * 새 세션 등록 + 초과 세션 정리
 * 로그인/가입 성공 후 토큰 발급 직후에 호출
 */
export async function enforceSessionLimit(
  sessions: KVNamespace,
  email: string,
  newToken: string,
): Promise<void> {
  try {
  const key = `${SESSION_LIST_PREFIX}${email.toLowerCase()}`;

  // 1. 기존 세션 목록 읽기
  let entries: SessionEntry[] = [];
  try {
    const raw = await sessions.get(key);
    if (raw) entries = JSON.parse(raw);
  } catch {
    entries = [];
  }

  // 2. 만료된 세션 정리 (SESSIONS KV에 없는 것 제거)
  const alive: SessionEntry[] = [];
  for (const entry of entries) {
    const exists = await sessions.get(entry.token);
    if (exists) alive.push(entry);
  }

  // 3. 새 세션 추가
  alive.push({ token: newToken, createdAt: new Date().toISOString() });

  // 4. 시간순 정렬 (오래된 것이 앞)
  alive.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // 5. 초과 시 가장 오래된 세션 삭제
  while (alive.length > MAX_SESSIONS) {
    const oldest = alive.shift();
    if (oldest) {
      await sessions.delete(oldest.token);
    }
  }

  // 6. 세션 목록 저장 (30일 TTL)
  await sessions.put(key, JSON.stringify(alive), { expirationTtl: 60 * 60 * 24 * 30 });
  } catch {
    // 세션 제한 실패가 로그인 자체를 막으면 안 됨 — best-effort
  }
}

/**
 * 로그아웃 시 세션 목록에서 제거
 */
export async function removeFromSessionList(
  sessions: KVNamespace,
  email: string,
  token: string,
): Promise<void> {
  const key = `${SESSION_LIST_PREFIX}${email.toLowerCase()}`;
  try {
    const raw = await sessions.get(key);
    if (!raw) return;
    const entries: SessionEntry[] = JSON.parse(raw);
    const filtered = entries.filter(e => e.token !== token);
    if (filtered.length > 0) {
      await sessions.put(key, JSON.stringify(filtered), { expirationTtl: 60 * 60 * 24 * 30 });
    } else {
      await sessions.delete(key);
    }
  } catch {
    // 무시
  }
}

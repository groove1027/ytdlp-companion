/**
 * Browser Cache API를 사용한 TTS 미리듣기 영구 캐시
 * 세션 간에도 유지되어 동일 음성의 반복 재생 시 즉시 로드
 */

const CACHE_NAME = 'tts-previews-v1';

/** 캐시에서 미리듣기 오디오 Blob URL 로드 */
export async function getCachedPreview(key: string): Promise<string | null> {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(`/_tts/${key}`);
    if (!res) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** 미리듣기 오디오를 Cache API에 저장 (fire-and-forget) */
export async function cachePreview(key: string, audioUrl: string): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const res = await fetch(audioUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      `/_tts/${key}`,
      new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/wav' } })
    );
  } catch {
    // Cache API 사용 불가 시 무시
  }
}

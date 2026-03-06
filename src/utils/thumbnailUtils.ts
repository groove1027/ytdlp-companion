/**
 * Shared YouTube thumbnail utilities.
 *
 * Extracted from ThumbnailStudioTab and InlineThumbnailStudio to eliminate
 * code duplication.
 */

/**
 * Extract a YouTube video ID from various URL formats.
 *
 * Supports:
 *   - youtube.com/watch?v=ID
 *   - youtu.be/ID
 *   - youtube.com/embed/ID
 *   - youtube.com/shorts/ID
 *   - youtube.com/v/ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

/**
 * Fetch the best-available YouTube video thumbnail as a base64 data-URL.
 *
 * Tries resolutions in order: maxresdefault -> sddefault -> hqdefault.
 * The maxresdefault placeholder (120px wide) is detected and skipped.
 */
export async function fetchYouTubeThumbnail(videoId: string): Promise<string> {
  for (const q of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const url = `https://img.youtube.com/vi/${videoId}/${q}.jpg`;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (q === 'maxresdefault' && img.naturalWidth <= 120) {
            reject(new Error('placeholder'));
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('canvas'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('load'));
        img.src = url;
      });
      return base64;
    } catch {
      continue;
    }
  }
  throw new Error('YouTube 썸네일을 가져올 수 없습니다.');
}

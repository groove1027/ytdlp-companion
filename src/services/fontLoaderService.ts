// ─── 폰트 동적 로더 서비스 ───
// Google Fonts → <link> 태그, 눈누 → @font-face 스타일 주입

import type { FontEntry } from '../constants/fontLibrary';

const loadedFonts = new Set<string>();

/** Google Fonts를 <link> 태그로 로드 */
function loadGoogleFont(entry: FontEntry): void {
  const weights = entry.weights.join(';');
  const href = `https://fonts.googleapis.com/css2?family=${entry.googleId}:wght@${weights}&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/** 눈누 폰트를 @font-face로 로드 */
function loadNoonnuFont(entry: FontEntry): void {
  if (!entry.noonnu) return;
  const rules = entry.noonnu.urls.map(({ weight, url }) => {
    const format = url.endsWith('.woff2') ? 'woff2' : 'woff';
    return `@font-face {
  font-family: '${entry.fontFamily}';
  src: url('${url}') format('${format}');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`;
  });
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

/** 폰트 로드 (이미 로드된 폰트는 스킵) */
export function loadFont(entry: FontEntry): void {
  if (loadedFonts.has(entry.id)) return;
  loadedFonts.add(entry.id);

  if (entry.source === 'google' && entry.googleId) {
    loadGoogleFont(entry);
  } else if (entry.source === 'noonnu' && entry.noonnu) {
    loadNoonnuFont(entry);
  }
  // 'local' (Pretendard) — 이미 index.html에서 로드됨
}

/** 폰트가 이미 로드되었는지 확인 */
export function isFontLoaded(fontId: string): boolean {
  return loadedFonts.has(fontId);
}

/** 여러 폰트 한번에 로드 */
export function loadFonts(entries: FontEntry[]): void {
  entries.forEach(loadFont);
}

/** 내보내기용: FontEntry → HTML 태그 문자열 (DOM 주입 없이 문자열 반환) */
export function generateFontCssTag(entry: FontEntry): string {
  if (entry.source === 'google' && entry.googleId) {
    const weights = entry.weights.join(';');
    return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${entry.googleId}:wght@${weights}&display=swap">`;
  }
  if (entry.source === 'noonnu' && entry.noonnu) {
    const rules = entry.noonnu.urls.map(({ weight, url }) => {
      const fmt = url.endsWith('.woff2') ? 'woff2' : 'woff';
      return `@font-face{font-family:'${entry.fontFamily}';src:url('${url}')format('${fmt}');font-weight:${weight};font-display:swap;}`;
    }).join('\n');
    return `<style>${rules}</style>`;
  }
  return ''; // local(Pretendard) — 이미 export HTML에 포함
}

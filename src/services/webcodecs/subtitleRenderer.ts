/**
 * Subtitle Renderer — Canvas 텍스트 렌더링 (미리보기 + MP4 내보내기 공용)
 * 미리보기와 내보내기 모두 이 함수를 사용하여 100% 동일한 자막 출력 보장
 *
 * 핵심 매칭 포인트:
 * 1. textShadowCSS 파싱 → 다중 Canvas shadow pass로 렌더
 * 2. outline = CSS text-shadow 4방향 (strokeText 대신)
 * 3. backgroundColor = inline element 스타일 (padding: 4px 12px, borderRadius: 0)
 */

import type { SubtitleTemplate } from '../../types';

/** Canvas 2D 컨텍스트 — OffscreenCanvas / 일반 Canvas 모두 지원 */
type CanvasCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * 캔버스에 자막 텍스트 렌더링 (미리보기 + MP4 내보내기 100% 동일)
 */
export function drawSubtitle(
  ctx: CanvasCtx,
  text: string,
  template: SubtitleTemplate,
  canvasW: number,
  canvasH: number,
): void {
  if (!text.trim()) return;

  const resScale = canvasH / 1080; // 해상도 스케일
  const fontSize = Math.round(template.fontSize * resScale);
  const fontStyle = template.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontWeight = template.fontWeight || 700;
  const fontFamily = template.fontFamily || 'sans-serif';

  ctx.save();

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px '${fontFamily}', Pretendard, sans-serif`;
  ctx.textAlign = template.textAlign || 'center';
  ctx.textBaseline = 'bottom';

  // 위치: 하단에서 positionY% 만큼 위 (CSS bottom: positionY%)
  const posY = canvasH - (template.positionY / 100) * canvasH;
  const posX = template.textAlign === 'left'
    ? canvasW * 0.05
    : template.textAlign === 'right'
      ? canvasW * 0.95
      : canvasW / 2;

  // 자간
  if (template.letterSpacing) {
    ctx.letterSpacing = `${template.letterSpacing}px`;
  }

  // 줄바꿈 처리 — 캔버스 너비 90% 이내
  const maxWidth = canvasW * 0.9;
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeightPx = fontSize * (template.lineHeight || 1.4);

  // ─── 배경 렌더링 (CSS inline element 매칭) ───
  if (template.backgroundColor && template.backgroundColor !== 'transparent') {
    const hPad = Math.round(12 * resScale); // CSS padding: 4px 12px
    const vPad = Math.round(4 * resScale);
    const totalTextH = lines.length * lineHeightPx;
    const bgH = totalTextH + vPad * 2;
    const bgY = posY - totalTextH - vPad;
    const bgW = Math.min(
      maxWidth,
      Math.max(...lines.map(l => ctx.measureText(l).width)) + hPad * 2,
    );
    const bgX = template.textAlign === 'left'
      ? posX - hPad
      : template.textAlign === 'right'
        ? posX - bgW + hPad
        : posX - bgW / 2;

    ctx.fillStyle = template.backgroundColor;
    // CSS borderRadius: 0px (프리뷰와 동일)
    ctx.fillRect(bgX, bgY, bgW, bgH);
  }

  // ─── 텍스트 shadow 파싱 (CSS textShadowCSS + outline) ───
  const shadows = buildShadowList(template);

  // 각 줄 그리기
  for (let i = 0; i < lines.length; i++) {
    const lineY = posY - (lines.length - 1 - i) * lineHeightPx;

    // 1단계: 모든 shadow를 순서대로 렌더 (CSS와 동일한 순서)
    for (const shadow of shadows) {
      ctx.save();
      ctx.shadowColor = shadow.color;
      ctx.shadowBlur = shadow.blur * resScale;
      ctx.shadowOffsetX = shadow.offsetX * resScale;
      ctx.shadowOffsetY = shadow.offsetY * resScale;
      // shadow만 보이고 텍스트 자체는 보이지 않게 → 화면 밖에서 그리기
      // Canvas는 CSS처럼 shadow-only 렌더를 지원하지 않으므로,
      // 같은 위치에 같은 색으로 중첩 그리는 방식 사용 (시각적 차이 미미)
      ctx.fillStyle = template.color || '#FFFFFF';
      ctx.fillText(lines[i], posX, lineY);
      ctx.restore();
    }

    // 2단계: 최종 텍스트 (shadow 없이, 위에 덮어쓰기)
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = template.color || '#FFFFFF';
    ctx.fillText(lines[i], posX, lineY);
    ctx.restore();
  }

  ctx.restore();
}

// ─── Shadow 빌드 ───

interface ParsedShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

/**
 * SubtitleTemplate에서 CSS와 동일한 순서의 shadow 리스트 생성
 * CSS shadow 변환 로직:
 *   1. textShadowCSS가 있으면 그것을 파싱
 *   2. 없으면 shadowColor + shadowBlur + offsets
 *   3. outlineColor + outlineWidth → 4방향 shadow로 변환
 */
function buildShadowList(template: SubtitleTemplate): ParsedShadow[] {
  const result: ParsedShadow[] = [];

  // 1. textShadowCSS 파싱 (있으면 개별 shadow 필드보다 우선)
  if (template.textShadowCSS) {
    result.push(...parseTextShadowCSS(template.textShadowCSS));
  } else if (template.shadowColor && template.shadowBlur > 0) {
    result.push({
      offsetX: template.shadowOffsetX || 0,
      offsetY: template.shadowOffsetY || 0,
      blur: template.shadowBlur || 0,
      color: template.shadowColor,
    });
  }

  // 2. outline → 4방향 shadow (CSS text-shadow 방식)
  if (template.outlineColor && template.outlineWidth > 0) {
    const ow = template.outlineWidth;
    const oc = template.outlineColor;
    result.push(
      { offsetX: ow, offsetY: 0, blur: 0, color: oc },
      { offsetX: -ow, offsetY: 0, blur: 0, color: oc },
      { offsetX: 0, offsetY: ow, blur: 0, color: oc },
      { offsetX: 0, offsetY: -ow, blur: 0, color: oc },
    );
  }

  return result;
}

/**
 * CSS text-shadow 문자열 파싱
 * 형식: "offsetX offsetY [blur] color, ..."
 * 예: "0 2px 4px rgba(0,0,0,0.5), 1px 1px 0 #fff"
 */
function parseTextShadowCSS(css: string): ParsedShadow[] {
  if (!css.trim()) return [];

  // 콤마로 분리 (괄호 안의 콤마는 무시)
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of css) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map(parseSingleShadow).filter(s => s != null) as ParsedShadow[];
}

/**
 * 단일 shadow 값 파싱
 * "0 2px 4px rgba(0,0,0,0.5)" → { offsetX:0, offsetY:2, blur:4, color:"rgba(0,0,0,0.5)" }
 */
function parseSingleShadow(s: string): ParsedShadow | null {
  s = s.trim();
  if (!s) return null;

  // 앞에서부터 숫자(+px) 토큰을 추출, 나머지는 색상
  const nums: number[] = [];
  let remaining = s;

  while (remaining.length > 0) {
    remaining = remaining.replace(/^\s+/, '');
    if (!remaining) break;

    // 숫자+px 패턴 매칭
    const numMatch = remaining.match(/^(-?[\d.]+)(px)?/);
    if (numMatch) {
      nums.push(parseFloat(numMatch[1]));
      remaining = remaining.slice(numMatch[0].length);
    } else {
      break; // 숫자가 아닌 부분 = 색상
    }
  }

  const color = remaining.trim() || 'rgba(0,0,0,1)';

  // 최소 2개 숫자 (offsetX, offsetY) 필요
  if (nums.length < 2) return null;

  return {
    offsetX: nums[0],
    offsetY: nums[1],
    blur: nums[2] ?? 0,
    color,
  };
}

// ─── 텍스트 줄바꿈 ──────────────────────────────

function wrapText(
  ctx: CanvasCtx,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split('\n');
  const result: string[] = [];

  for (const para of paragraphs) {
    // [FIX #404] 띄어쓰기 있으면 단어 단위로 줄바꿈 (한국어 단어 중간 끊김 방지)
    if (para.includes(' ')) {
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const testLine = line ? line + ' ' + word : word;
        if (line && ctx.measureText(testLine).width > maxWidth) {
          result.push(line);
          // 단어 하나가 maxWidth 초과 시 글자 단위 분할
          if (ctx.measureText(word).width > maxWidth) {
            let sub = '';
            for (const ch of word) {
              if (sub && ctx.measureText(sub + ch).width > maxWidth) { result.push(sub); sub = ch; }
              else sub += ch;
            }
            line = sub;
          } else {
            line = word;
          }
        } else {
          line = testLine;
        }
      }
      if (line) result.push(line);
    } else {
      // 공백 없는 텍스트 (중국어/일본어) → 글자 단위 분할
      const chars = para.split('');
      let line = '';
      for (const char of chars) {
        const testLine = line + char;
        if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
          result.push(line);
          line = char;
        } else {
          line = testLine;
        }
      }
      if (line) result.push(line);
    }
  }

  return result.length > 0 ? result : [''];
}

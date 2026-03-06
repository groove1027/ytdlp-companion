/**
 * Transition Engine — 30개 장면 전환 효과 (Canvas 2D)
 * FFmpeg xfade 필터를 Canvas 블렌딩으로 1:1 변환
 */

import type { SceneTransitionPreset } from '../../types';

/**
 * 두 프레임을 전환 효과와 함께 합성
 * @param ctx - 출력 캔버스 컨텍스트
 * @param fromFrame - 이전 장면 프레임 (ImageBitmap or OffscreenCanvas)
 * @param toFrame - 다음 장면 프레임
 * @param progress - 전환 진행도 0..1
 * @param preset - 전환 프리셋 이름
 */
export function renderTransition(
  ctx: OffscreenCanvasRenderingContext2D,
  fromFrame: ImageBitmap | OffscreenCanvas,
  toFrame: ImageBitmap | OffscreenCanvas,
  progress: number,
  preset: SceneTransitionPreset,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const p = Math.max(0, Math.min(1, progress));

  switch (preset) {
    case 'none':
      // 직접 컷: progress < 0.5이면 from, 아니면 to
      ctx.drawImage(p < 0.5 ? fromFrame : toFrame, 0, 0, w, h);
      return;

    case 'fade':
    case 'dissolve':
      // 크로스 페이드
      ctx.globalAlpha = 1;
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.globalAlpha = p;
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.globalAlpha = 1;
      return;

    case 'fadeWhite':
      ctx.globalAlpha = 1;
      if (p < 0.5) {
        ctx.drawImage(fromFrame, 0, 0, w, h);
        ctx.fillStyle = 'white';
        ctx.globalAlpha = p * 2;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.drawImage(toFrame, 0, 0, w, h);
        ctx.fillStyle = 'white';
        ctx.globalAlpha = (1 - p) * 2;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalAlpha = 1;
      return;

    case 'flash':
      ctx.globalAlpha = 1;
      if (p < 0.3) {
        ctx.drawImage(fromFrame, 0, 0, w, h);
        ctx.fillStyle = 'white';
        ctx.globalAlpha = p / 0.3;
        ctx.fillRect(0, 0, w, h);
      } else if (p < 0.5) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.drawImage(toFrame, 0, 0, w, h);
        ctx.fillStyle = 'white';
        ctx.globalAlpha = Math.max(0, (0.7 - p) / 0.2);
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalAlpha = 1;
      return;

    // 와이프 계열
    case 'wipeLeft':
      drawWipe(ctx, fromFrame, toFrame, p, w, h, 'left');
      return;
    case 'wipeRight':
      drawWipe(ctx, fromFrame, toFrame, p, w, h, 'right');
      return;
    case 'wipeUp':
      drawWipe(ctx, fromFrame, toFrame, p, w, h, 'up');
      return;
    case 'wipeDown':
      drawWipe(ctx, fromFrame, toFrame, p, w, h, 'down');
      return;

    // 슬라이드 계열
    case 'slideLeft':
      drawSlide(ctx, fromFrame, toFrame, p, w, h, 'left');
      return;
    case 'slideRight':
      drawSlide(ctx, fromFrame, toFrame, p, w, h, 'right');
      return;
    case 'slideUp':
      drawSlide(ctx, fromFrame, toFrame, p, w, h, 'up');
      return;
    case 'slideDown':
      drawSlide(ctx, fromFrame, toFrame, p, w, h, 'down');
      return;

    // 커버 계열
    case 'coverLeft':
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.drawImage(toFrame, w - w * p, 0, w, h);
      return;
    case 'coverRight':
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.drawImage(toFrame, -w + w * p, 0, w, h);
      return;

    // 원형
    case 'circleOpen': {
      const maxR = Math.sqrt(w * w + h * h) / 2;
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, maxR * p, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.restore();
      return;
    }
    case 'circleClose': {
      const maxR2 = Math.sqrt(w * w + h * h) / 2;
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, maxR2 * (1 - p), 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.restore();
      return;
    }

    // 방사형
    case 'radial': {
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * p;
      ctx.arc(w / 2, h / 2, Math.max(w, h), startAngle, endAngle);
      ctx.lineTo(w / 2, h / 2);
      ctx.clip();
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.restore();
      return;
    }

    // 대각선
    case 'diagBR': {
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.save();
      const diagP = p * 2; // 확장 범위
      ctx.beginPath();
      ctx.moveTo(-w * 0.2, -h * 0.2);
      ctx.lineTo(w * diagP, -h * 0.2);
      ctx.lineTo(-w * 0.2, h * diagP);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.restore();
      return;
    }
    case 'diagTL': {
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.save();
      const diagP2 = p * 2;
      ctx.beginPath();
      ctx.moveTo(w * 1.2, h * 1.2);
      ctx.lineTo(w - w * diagP2, h * 1.2);
      ctx.lineTo(w * 1.2, h - h * diagP2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.restore();
      return;
    }

    // 줌 인/아웃
    case 'zoomIn': {
      ctx.globalAlpha = 1 - p;
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.globalAlpha = p;
      const s = 0.5 + 0.5 * p;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(s, s);
      ctx.drawImage(toFrame, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    case 'zoomOut': {
      ctx.globalAlpha = p;
      const s2 = 1 + 0.5 * (1 - p);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(s2, s2);
      ctx.drawImage(fromFrame, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.globalAlpha = 1 - p + 0.001;
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.drawImage(toFrame, 0, 0, w, h);
      // 실제: from이 줌아웃되면서 to가 등장
      ctx.globalAlpha = 1;
      return;
    }

    // 플립
    case 'flipX': {
      ctx.save();
      if (p < 0.5) {
        const scaleX = 1 - p * 2;
        ctx.translate(w / 2, 0);
        ctx.scale(scaleX, 1);
        ctx.drawImage(fromFrame, -w / 2, 0, w, h);
      } else {
        const scaleX = (p - 0.5) * 2;
        ctx.translate(w / 2, 0);
        ctx.scale(scaleX, 1);
        ctx.drawImage(toFrame, -w / 2, 0, w, h);
      }
      ctx.restore();
      return;
    }
    case 'flipY': {
      ctx.save();
      if (p < 0.5) {
        const scaleY = 1 - p * 2;
        ctx.translate(0, h / 2);
        ctx.scale(1, scaleY);
        ctx.drawImage(fromFrame, 0, -h / 2, w, h);
      } else {
        const scaleY = (p - 0.5) * 2;
        ctx.translate(0, h / 2);
        ctx.scale(1, scaleY);
        ctx.drawImage(toFrame, 0, -h / 2, w, h);
      }
      ctx.restore();
      return;
    }

    // 스무스 와이프 (가속 커브)
    case 'smoothLeft': {
      const ep = easeInOutCubic(p);
      drawWipe(ctx, fromFrame, toFrame, ep, w, h, 'left');
      return;
    }
    case 'smoothRight': {
      const ep = easeInOutCubic(p);
      drawWipe(ctx, fromFrame, toFrame, ep, w, h, 'right');
      return;
    }

    // 블러
    case 'blur': {
      const blurAmount = Math.sin(p * Math.PI) * 20; // 중간이 최대 블러
      ctx.filter = `blur(${blurAmount}px)`;
      if (p < 0.5) {
        ctx.drawImage(fromFrame, 0, 0, w, h);
      } else {
        ctx.drawImage(toFrame, 0, 0, w, h);
      }
      ctx.filter = 'none';
      return;
    }

    // 픽셀화
    case 'pixelate': {
      const pixelSize = Math.max(1, Math.floor(Math.sin(p * Math.PI) * 40));
      const smallW = Math.max(1, Math.floor(w / pixelSize));
      const smallH = Math.max(1, Math.floor(h / pixelSize));
      const source = p < 0.5 ? fromFrame : toFrame;
      // 작게 그린 후 확대
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, 0, 0, smallW, smallH);
      ctx.drawImage(ctx.canvas, 0, 0, smallW, smallH, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      return;
    }

    // 수평 스퀴즈
    case 'squeezH': {
      const squeeze = 1 - p;
      ctx.save();
      ctx.translate(w / 2, 0);
      ctx.scale(squeeze, 1);
      ctx.drawImage(fromFrame, -w / 2, 0, w, h);
      ctx.restore();
      // 뒤에 to 프레임
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.restore();
      return;
    }

    // 글리치
    case 'glitch': {
      const source = p < 0.5 ? fromFrame : toFrame;
      ctx.drawImage(source, 0, 0, w, h);
      // 수평 슬라이스 오프셋
      const sliceCount = 10 + Math.floor(Math.sin(p * Math.PI) * 15);
      const intensity = Math.sin(p * Math.PI) * 30;
      for (let i = 0; i < sliceCount; i++) {
        const sy = Math.floor(Math.random() * h);
        const sh = Math.floor(Math.random() * 30) + 5;
        const offset = (Math.random() - 0.5) * intensity;
        ctx.drawImage(ctx.canvas, 0, sy, w, sh, offset, sy, w, sh);
      }
      // 중간 지점에서 색수차 효과
      if (p > 0.3 && p < 0.7) {
        ctx.globalAlpha = 0.15;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(3, 0, w, h);
        ctx.fillStyle = '#0000ff';
        ctx.fillRect(-3, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      return;
    }

    default:
      // 알 수 없는 프리셋 → 크로스페이드 폴백
      ctx.globalAlpha = 1;
      ctx.drawImage(fromFrame, 0, 0, w, h);
      ctx.globalAlpha = p;
      ctx.drawImage(toFrame, 0, 0, w, h);
      ctx.globalAlpha = 1;
      return;
  }
}

// ─── 내부 헬퍼 ─────────────────────────────────────

function drawWipe(
  ctx: OffscreenCanvasRenderingContext2D,
  from: ImageBitmap | OffscreenCanvas,
  to: ImageBitmap | OffscreenCanvas,
  p: number,
  w: number,
  h: number,
  dir: 'left' | 'right' | 'up' | 'down',
): void {
  ctx.drawImage(from, 0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  switch (dir) {
    case 'left':
      ctx.rect(0, 0, w * p, h);
      break;
    case 'right':
      ctx.rect(w - w * p, 0, w * p, h);
      break;
    case 'up':
      ctx.rect(0, 0, w, h * p);
      break;
    case 'down':
      ctx.rect(0, h - h * p, w, h * p);
      break;
  }
  ctx.clip();
  ctx.drawImage(to, 0, 0, w, h);
  ctx.restore();
}

function drawSlide(
  ctx: OffscreenCanvasRenderingContext2D,
  from: ImageBitmap | OffscreenCanvas,
  to: ImageBitmap | OffscreenCanvas,
  p: number,
  w: number,
  h: number,
  dir: 'left' | 'right' | 'up' | 'down',
): void {
  let fX = 0, fY = 0, tX = 0, tY = 0;
  switch (dir) {
    case 'left':
      fX = -w * p; tX = w - w * p;
      break;
    case 'right':
      fX = w * p; tX = -w + w * p;
      break;
    case 'up':
      fY = -h * p; tY = h - h * p;
      break;
    case 'down':
      fY = h * p; tY = -h + h * p;
      break;
  }
  ctx.drawImage(from, fX, fY, w, h);
  ctx.drawImage(to, tX, tY, w, h);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

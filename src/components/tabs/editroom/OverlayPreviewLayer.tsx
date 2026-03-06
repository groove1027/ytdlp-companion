import React, { useMemo } from 'react';
import type { SceneOverlayConfig, OverlayBlendMode } from '../../../types';

const CSS_BLEND: Record<OverlayBlendMode, string> = {
  normal: 'normal', screen: 'screen', overlay: 'overlay',
  'soft-light': 'soft-light', 'hard-light': 'hard-light',
  multiply: 'multiply', lighten: 'lighten',
};

// ═══ 파티클 생성 (실제 DOM 요소로 움직임) ═══

interface Particle {
  id: number;
  left: string;        // CSS left %
  size: number;         // px
  duration: string;     // animation duration
  delay: string;        // animation delay
  opacity: number;
  color: string;
  shape: 'circle' | 'line' | 'ellipse' | 'rect';
  extra?: React.CSSProperties;
}

function makeParticles(
  count: number,
  intensity: number,
  opts: {
    color: string;
    shape: Particle['shape'];
    sizeRange: [number, number];
    durationRange: [number, number];
  }
): Particle[] {
  const i = intensity / 100;
  const particles: Particle[] = [];
  for (let j = 0; j < count; j++) {
    const left = `${((j * 37 + 13) % 100)}%`;
    const size = opts.sizeRange[0] + (j % 5) / 5 * (opts.sizeRange[1] - opts.sizeRange[0]);
    const dur = opts.durationRange[0] + (j % 7) / 7 * (opts.durationRange[1] - opts.durationRange[0]);
    const delay = -(j * 0.7 + (j % 3) * 1.1);
    particles.push({
      id: j,
      left,
      size,
      duration: `${dur.toFixed(1)}s`,
      delay: `${delay.toFixed(1)}s`,
      opacity: (0.5 + 0.5 * i) * (0.6 + (j % 3) * 0.15),
      color: opts.color,
      shape: opts.shape,
    });
  }
  return particles;
}

// 파티클 오버레이 ID → 설정
type ParticleDir = 'down' | 'up' | 'down-sway';

interface ParticleConfig {
  dir: ParticleDir;
  count: number;
  color: string;
  shape: Particle['shape'];
  sizeRange: [number, number];
  durationRange: [number, number];
}

const PARTICLE_CONFIGS: Record<string, (i: number) => ParticleConfig> = {
  snow: (i) => ({ dir: 'down', count: 15 + Math.floor(15 * i), color: 'white', shape: 'circle', sizeRange: [2, 5], durationRange: [4, 8] }),
  rain: (i) => ({ dir: 'down', count: 25 + Math.floor(20 * i), color: 'rgba(180,200,255,0.6)', shape: 'line', sizeRange: [10, 25], durationRange: [1, 2.5] }),
  sparkle: (i) => ({ dir: 'down-sway', count: 10 + Math.floor(10 * i), color: 'rgba(255,255,200,0.9)', shape: 'circle', sizeRange: [1, 4], durationRange: [2, 5] }),
  dust: (i) => ({ dir: 'down-sway', count: 8 + Math.floor(8 * i), color: 'rgba(200,180,140,0.5)', shape: 'circle', sizeRange: [2, 4], durationRange: [6, 12] }),
  fireflies: (i) => ({ dir: 'down-sway', count: 8 + Math.floor(8 * i), color: 'rgba(200,255,100,0.8)', shape: 'circle', sizeRange: [2, 5], durationRange: [4, 8] }),
  bubbles: (i) => ({ dir: 'up', count: 8 + Math.floor(8 * i), color: 'rgba(150,200,255,0.4)', shape: 'circle', sizeRange: [4, 10], durationRange: [4, 8] }),
  confetti: (i) => ({ dir: 'down-sway', count: 15 + Math.floor(12 * i), color: '', shape: 'rect', sizeRange: [4, 8], durationRange: [3, 6] }),
  'cherry-blossom': (i) => ({ dir: 'down-sway', count: 10 + Math.floor(8 * i), color: 'rgba(255,180,200,0.6)', shape: 'ellipse', sizeRange: [4, 8], durationRange: [5, 10] }),
  embers: (i) => ({ dir: 'up', count: 10 + Math.floor(10 * i), color: 'rgba(255,120,0,0.8)', shape: 'circle', sizeRange: [2, 4], durationRange: [3, 6] }),
  stars: (i) => ({ dir: 'down-sway', count: 15 + Math.floor(15 * i), color: 'white', shape: 'circle', sizeRange: [1, 3], durationRange: [3, 7] }),
};

const CONFETTI_COLORS = ['#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#cc5de8', '#22b8cf'];

function renderParticleOverlay(presetId: string, intensity: number, speed: number, opacity: number): React.ReactNode {
  const configFn = PARTICLE_CONFIGS[presetId];
  if (!configFn) return null;

  const i = Math.min(1, (intensity / 100) * 2.5); // 2.5배 강화
  const cfg = configFn(i);
  const particles = makeParticles(cfg.count, intensity, cfg);
  const animBase = cfg.dir === 'up' ? 'particle-rise' : cfg.dir === 'down-sway' ? 'particle-fall-sway' : 'particle-fall';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: opacity / 100 }}>
      {particles.map((p) => {
        const color = presetId === 'confetti' ? CONFETTI_COLORS[p.id % CONFETTI_COLORS.length] : p.color;
        const animDur = `${(parseFloat(p.duration) / speed).toFixed(1)}s`;

        const baseStyle: React.CSSProperties = {
          position: 'absolute',
          left: p.left,
          top: cfg.dir === 'up' ? 'auto' : '-5%',
          bottom: cfg.dir === 'up' ? '-5%' : 'auto',
          opacity: p.opacity,
          animation: `${animBase} ${animDur} ${p.delay} linear infinite`,
          willChange: 'transform',
        };

        if (p.shape === 'line') {
          return (
            <div key={p.id} style={{ ...baseStyle, width: '1px', height: `${p.size}px`, background: color }} />
          );
        }
        if (p.shape === 'ellipse') {
          return (
            <div key={p.id} style={{ ...baseStyle, width: `${p.size}px`, height: `${p.size * 0.6}px`, borderRadius: '50%', background: color, transform: `rotate(${(p.id * 37) % 360}deg)` }} />
          );
        }
        if (p.shape === 'rect') {
          return (
            <div key={p.id} style={{ ...baseStyle, width: `${p.size}px`, height: `${p.size * 0.5}px`, background: color, transform: `rotate(${(p.id * 53) % 360}deg)` }} />
          );
        }
        // circle (default)
        return (
          <div key={p.id} style={{ ...baseStyle, width: `${p.size}px`, height: `${p.size}px`, borderRadius: '50%', background: presetId === 'bubbles' ? 'transparent' : color, border: presetId === 'bubbles' ? `1px solid ${color}` : 'none' }} />
        );
      })}
    </div>
  );
}

// ═══ 정적/반정적 오버레이 (CSS 기반) ═══

function getStaticStyle(presetId: string, intensity: number): React.CSSProperties {
  const i = Math.min(1, (intensity / 100) * 2.5); // 2.5배 강화 (max 1.0)

  switch (presetId) {
    case 'film-frame':
      return { boxShadow: `inset 0 0 ${12*i}px ${6*i}px rgba(0,0,0,0.7), inset 0 0 ${40*i}px rgba(0,0,0,0.3)` };
    case 'film-damage':
      return { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${0.6+i*0.4}' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='${0.3*i}'/%3E%3C/svg%3E")`, backgroundSize: '100% 100%', animation: 'ov-flicker 0.4s steps(4) infinite' };
    case 'prism-retro':
      return { background: `linear-gradient(${120*i}deg, rgba(255,0,0,${0.3*i}), rgba(0,255,0,${0.25*i}), rgba(0,0,255,${0.3*i}))`, animation: 'ov-hue 6s linear infinite' };
    case 'grunge-crack':
      return { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='turbulence' baseFrequency='${0.02+i*0.03}' numOctaves='5'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23g)' opacity='${0.25*i}'/%3E%3C/svg%3E")`, backgroundSize: '100% 100%' };
    case 'retro-film':
      return { background: `radial-gradient(ellipse at center, rgba(180,140,80,${0.1*i}), rgba(80,50,20,${0.2*i}))`, filter: `sepia(${0.3*i})` };
    case 'noise-grain':
      return { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${0.65+i*0.35}' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23f)' opacity='${0.2*i}'/%3E%3C/svg%3E")`, backgroundSize: '200px 200px', animation: 'ov-jitter 0.3s steps(5) infinite' };
    case 'halftone':
      return { backgroundImage: `radial-gradient(circle, rgba(0,0,0,${0.3*i}) ${1+i}px, transparent ${1+i}px)`, backgroundSize: `${4+i*3}px ${4+i*3}px` };
    case 'scanlines':
      return { backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent ${1+i}px, rgba(0,0,0,${0.15*i}) ${1+i}px, rgba(0,0,0,${0.15*i}) ${2+i}px)`, animation: 'ov-flicker 0.5s steps(3) infinite' };
    case 'crosshatch':
      return { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent ${3+2*i}px, rgba(0,0,0,${0.1*i}) ${3+2*i}px, rgba(0,0,0,${0.1*i}) ${4+2*i}px), repeating-linear-gradient(-45deg, transparent, transparent ${3+2*i}px, rgba(0,0,0,${0.1*i}) ${3+2*i}px, rgba(0,0,0,${0.1*i}) ${4+2*i}px)` };
    case 'paper-texture':
      return { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${0.8+i*0.2}' numOctaves='6' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='150' height='150' filter='url(%23p)' opacity='${0.15*i}'/%3E%3C/svg%3E")`, backgroundSize: '100% 100%' };
    // 대기
    case 'fog':
      return { background: `radial-gradient(ellipse at 30% 50%, rgba(200,210,220,${0.45*i}), transparent 70%), radial-gradient(ellipse at 70% 60%, rgba(180,190,200,${0.35*i}), transparent 60%)`, animation: 'ov-fog 8s ease-in-out infinite alternate' };
    case 'light-leak':
      return { background: `linear-gradient(${135+30*i}deg, rgba(255,140,50,${0.4*i}) 0%, rgba(255,80,120,${0.3*i}) 50%, transparent 80%)`, animation: 'ov-glow 4s ease-in-out infinite alternate' };
    case 'bokeh': {
      const c: string[] = [];
      for (let j = 0; j < Math.floor(4+5*i); j++) { const x=(j*37+10)%100; const y=(j*53+15)%100; const r=10+j*5*i; c.push(`radial-gradient(${r}px circle at ${x}% ${y}%, rgba(255,200,100,${(0.25*i).toFixed(3)}), transparent)`); }
      return { background: c.join(', '), animation: 'ov-glow 4s ease-in-out infinite alternate' };
    }
    case 'vignette':
      return { background: `radial-gradient(ellipse at center, transparent ${60-30*i}%, rgba(0,0,0,${0.5*i}) 100%)` };
    case 'lens-flare':
      return { background: `radial-gradient(${12*i}px circle at 70% 30%, rgba(255,255,200,${0.4*i}), transparent), linear-gradient(${45+20*i}deg, transparent 40%, rgba(255,240,180,${0.1*i}) 50%, transparent 60%)`, animation: 'ov-drift 6s ease-in-out infinite alternate' };
    case 'smoke':
      return { background: `radial-gradient(ellipse at 40% 80%, rgba(150,150,150,${0.4*i}), transparent 60%), radial-gradient(ellipse at 60% 70%, rgba(130,130,130,${0.3*i}), transparent 50%)`, animation: 'ov-smoke 6s ease-in-out infinite' };
    case 'aurora':
      return { background: `linear-gradient(170deg, rgba(0,255,150,${0.2*i}) 0%, rgba(0,150,255,${0.25*i}) 30%, rgba(150,0,255,${0.2*i}) 60%, transparent 80%)`, animation: 'ov-aurora 8s ease-in-out infinite alternate' };
    case 'underwater':
      return { background: `linear-gradient(180deg, rgba(0,80,150,${0.3*i}), rgba(0,120,180,${0.2*i}) 50%, rgba(0,60,120,${0.35*i}))`, animation: 'ov-water 4s ease-in-out infinite alternate' };
    case 'god-rays': {
      const rays: string[] = []; for (let j=0;j<5;j++) rays.push(`linear-gradient(${250+j*8}deg, rgba(255,240,180,${(0.06*i).toFixed(3)}) 0%, transparent 60%)`);
      return { background: rays.join(', '), animation: 'ov-glow 4s ease-in-out infinite alternate' };
    }
    case 'heat-haze':
      return { backdropFilter: `blur(${0.3*i}px)`, animation: 'ov-heat 3s ease-in-out infinite' };
    case 'chromatic-aberration':
      return { boxShadow: `inset ${5*i}px 0 ${4*i}px rgba(255,0,0,${0.35*i}), inset ${-5*i}px 0 ${4*i}px rgba(0,0,255,${0.35*i})` };
    case 'speed-lines': {
      // 방사형 라인: 고정 패턴 (회전하지 않음) + 펄스 확대 수축
      const ls: string[] = [];
      for (let a = 0; a < 360; a += 8) {
        ls.push(`rgba(255,255,255,${(0.3 * i).toFixed(3)}) ${a}deg ${a + 2}deg`);
        ls.push(`transparent ${a + 2}deg ${a + 8}deg`);
      }
      return {
        background: `radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.4) 100%), conic-gradient(from 0deg at 50% 50%, ${ls.join(', ')})`,
        animation: 'ov-speed-pulse 2s ease-in-out infinite',
        transform: 'scale(1.5)',
        transformOrigin: '50% 50%',
      };
    }
    // 색보정 (alpha 2~3x 강화)
    case 'warm-tone': return { background: `linear-gradient(135deg, rgba(255,140,50,${0.4*i}), rgba(255,80,20,${0.3*i}))` };
    case 'cool-tone': return { background: `linear-gradient(135deg, rgba(50,100,200,${0.4*i}), rgba(30,60,150,${0.3*i}))` };
    case 'sunset-glow': return { background: `linear-gradient(180deg, rgba(255,150,50,${0.35*i}) 0%, rgba(255,80,100,${0.35*i}) 50%, rgba(150,50,150,${0.25*i}) 100%)`, animation: 'ov-glow 4s ease-in-out infinite alternate' };
    case 'midnight-blue': return { background: `radial-gradient(ellipse at center, rgba(10,20,60,${0.4*i}), rgba(5,10,40,${0.5*i}))` };
    case 'neon-glow': return { background: `linear-gradient(${120+60*i}deg, rgba(255,0,150,${0.25*i}), rgba(0,255,255,${0.2*i}), rgba(150,0,255,${0.25*i}))`, animation: 'ov-hue 6s linear infinite' };
    case 'golden-hour': return { background: `radial-gradient(ellipse at 60% 30%, rgba(255,200,80,${0.4*i}), rgba(255,150,50,${0.25*i}) 50%, transparent 80%)` };
    case 'cyberpunk': return { background: `linear-gradient(135deg, rgba(0,255,200,${0.25*i}) 0%, transparent 50%, rgba(255,0,150,${0.25*i}) 100%)`, animation: 'ov-hue 8s linear infinite' };
    case 'vintage-warm': return { background: `radial-gradient(ellipse at center, rgba(180,120,60,${0.3*i}), rgba(100,60,20,${0.35*i}))`, filter: `sepia(${0.3*i})` };
    default: return {};
  }
}

// 파티클 애니메이션 키프레임 (개별 DOM 요소용)
const KEYFRAMES = `
@keyframes particle-fall {
  0% { transform: translateY(0); }
  100% { transform: translateY(calc(100vh + 20px)); }
}
@keyframes particle-fall-sway {
  0% { transform: translateY(0) translateX(0); }
  25% { transform: translateY(25vh) translateX(15px); }
  50% { transform: translateY(50vh) translateX(-10px); }
  75% { transform: translateY(75vh) translateX(12px); }
  100% { transform: translateY(calc(100vh + 20px)) translateX(0); }
}
@keyframes particle-rise {
  0% { transform: translateY(0); }
  100% { transform: translateY(calc(-100vh - 20px)); }
}
@keyframes ov-flicker {
  0%,100% { opacity:1 } 25% { opacity:0.6 } 50% { opacity:0.9 } 75% { opacity:0.5 }
}
@keyframes ov-hue {
  from { filter: hue-rotate(0deg) } to { filter: hue-rotate(360deg) }
}
@keyframes ov-jitter {
  0% { transform:translate(0,0) } 20% { transform:translate(-8px,-4px) } 40% { transform:translate(6px,-6px) } 60% { transform:translate(-4px,8px) } 80% { transform:translate(10px,2px) } 100% { transform:translate(0,0) }
}
@keyframes ov-fog {
  0% { transform:translateX(-5%) scale(1) } 100% { transform:translateX(5%) scale(1.05) }
}
@keyframes ov-glow {
  0% { opacity:0.5; transform:scale(1) } 100% { opacity:1; transform:scale(1.03) }
}
@keyframes ov-drift {
  0% { transform:translate(-3%,-2%) } 100% { transform:translate(3%,2%) }
}
@keyframes ov-smoke {
  0% { transform:translateY(0) scale(1); opacity:0.7 } 50% { transform:translateY(-10%) scale(1.15); opacity:1 } 100% { transform:translateY(0) scale(1); opacity:0.7 }
}
@keyframes ov-aurora {
  0% { transform:translateX(-8%) skewX(0deg); opacity:0.7 } 100% { transform:translateX(8%) skewX(5deg); opacity:1 }
}
@keyframes ov-water {
  0% { transform:scale(1) translateY(0) } 50% { transform:scale(1.02) translateY(1%) } 100% { transform:scale(1) translateY(0) }
}
@keyframes ov-spin {
  from { transform:rotate(0deg) } to { transform:rotate(360deg) }
}
@keyframes ov-speed-pulse {
  0% { transform:scale(1.5) } 50% { transform:scale(2.0) } 100% { transform:scale(1.5) }
}
@keyframes ov-heat {
  0%,100% { transform:scaleY(1) } 50% { transform:scaleY(1.004) }
}
`;

interface OverlayPreviewLayerProps {
  overlays: SceneOverlayConfig[];
}

const OverlayPreviewLayer: React.FC<OverlayPreviewLayerProps> = ({ overlays }) => {
  const layers = useMemo(() => overlays.map((o) => {
    const isParticle = o.presetId in PARTICLE_CONFIGS;
    return { ...o, isParticle };
  }), [overlays]);

  if (overlays.length === 0) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>
      {layers.map((o, idx) => {
        if (o.isParticle) {
          return (
            <React.Fragment key={`${o.presetId}-${idx}`}>
              {renderParticleOverlay(o.presetId, o.intensity, o.speed, o.opacity)}
            </React.Fragment>
          );
        }
        // 정적/CSS 오버레이
        const css = getStaticStyle(o.presetId, o.intensity);
        return (
          <div
            key={`${o.presetId}-${idx}`}
            className="absolute inset-0 pointer-events-none"
            style={{
              ...css,
              mixBlendMode: CSS_BLEND[o.blendMode] as React.CSSProperties['mixBlendMode'],
              opacity: o.opacity / 100,
            }}
          />
        );
      })}
    </>
  );
};

export default OverlayPreviewLayer;

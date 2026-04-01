import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // NOTE: COOP/COEP 헤더는 Tailwind CDN + 외부 폰트를 차단하므로 사용하지 않음.
        // FFmpeg WASM은 single-threaded 모드(SharedArrayBuffer 불필요)로 동작.

        // ⚠️ 로컬 dev 서버 전용 프록시 — vite build(배포)에는 절대 영향 없음
        // /api/* 요청을 프로덕션 서버로 프록시 → 로컬에서 로그인 가능
        ...(mode === 'development' ? {
          proxy: {
            '/api': {
              target: 'https://all-in-one-production.pages.dev',
              changeOrigin: true,
              secure: true,
            },
          },
        } : {}),
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        exclude: ['onnxruntime-web', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
      },
      build: {
        target: 'es2020',
        chunkSizeWarningLimit: 400,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-zustand': ['zustand'],
            }
          }
        }
      }
    };
});
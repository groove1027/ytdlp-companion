/**
 * Vitest 설정 — 단위 테스트 실행 환경
 *
 * 실행:
 *   npm test           — watch 모드
 *   npm run test:run   — 1회 실행 (CI용)
 *   npm run test:ui    — UI 모드
 *   npm run test:coverage — 커버리지 리포트
 */
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    // 순수 로직 함수 위주이므로 node 환경 (브라우저 API 필요한 테스트는 jsdom으로 개별 지정)
    environment: 'node',
    globals: false, // import { describe, it, expect } 명시적 사용 권장
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**', '../test-e2e/**'],
    // E2E와 충돌 방지: Playwright 테스트 폴더 제외
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['services/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/types.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});

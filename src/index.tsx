import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { testV2V } from './services/VideoGenService';
import { handleOAuthCallback } from './services/youtubeUploadService';
import { handleTikTokOAuthCallback } from './services/tiktokUploadService';
import { handleInstagramOAuthCallback } from './services/instagramUploadService';
import { handleThreadsOAuthCallback } from './services/threadsUploadService';
import { logger } from './services/LoggerService';

// 글로벌 에러 핸들러 설치 (uncaught error, unhandled rejection, 탭 비활성화, 네트워크 변경)
logger.installGlobalHandlers();

// OAuth 팝업 콜백 감지 — 앱 렌더링 전에 처리
// ?code= 파라미터가 있고 opener(부모 창)가 있으면 코드를 전달하고 팝업을 닫음
if (handleOAuthCallback() || handleTikTokOAuthCallback() || handleInstagramOAuthCallback() || handleThreadsOAuthCallback()) {
  // 팝업이 닫히므로 더 이상 렌더링 불필요
  document.body.innerHTML = '<p style="color:#888;text-align:center;margin-top:40vh">인증 완료. 이 창은 자동으로 닫힙니다.</p>';
} else {
  // V2V 테스트용 글로벌 노출 (브라우저 콘솔에서 window.testV2V 호출)
  (window as unknown as Record<string, unknown>).testV2V = testV2V;

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary fallbackMessage="앱 전체에서 오류가 발생했습니다. 페이지를 새로고침해 주세요.">
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
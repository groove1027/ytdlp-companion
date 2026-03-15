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

// [FIX #152] React + 서드파티 스크립트 DOM 충돌 방지 패치
// 브라우저 확장이나 광고 스크립트가 React 관리 DOM 노드를 임의로 삽입/제거하면
// "Failed to execute 'removeChild' on 'Node'" 오류 발생 → ErrorBoundary에 잡혀 탭 로딩 오류로 표시됨
// 이 패치는 해당 오류를 조용히 무시하여 React가 정상적으로 재조정(reconciliation)을 진행하게 함
if (typeof Node !== 'undefined') {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn('[DOM Patch] removeChild: child not found in parent, skipping');
      return child;
    }
    return origRemoveChild.call(this, child) as T;
  };

  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) {
      console.warn('[DOM Patch] insertBefore: refNode not found in parent, appending instead');
      return origInsertBefore.call(this, newNode, null) as T;
    }
    return origInsertBefore.call(this, newNode, refNode) as T;
  };
}

// OAuth 팝업 콜백 감지 — 앱 렌더링 전에 처리
// ?code= 파라미터가 있고 opener(부모 창)가 있으면 코드를 전달하고 팝업을 닫음
if (handleOAuthCallback() || handleTikTokOAuthCallback() || handleInstagramOAuthCallback() || handleThreadsOAuthCallback()) {
  // 팝업이 닫히므로 더 이상 렌더링 불필요
  document.body.innerHTML = '<p style="color:#888;text-align:center;margin-top:40vh">인증 완료. 이 창은 자동으로 닫힙니다.</p>';
} else {
  // V2V 테스트용 글로벌 노출 (브라우저 콘솔에서 window.testV2V 호출)
  (window as unknown as Record<string, unknown>).testV2V = testV2V;

  // [FIX] 영상 복구 도구 글로벌 노출 — 브라우저 콘솔에서 window.recoverVideos(['taskId1', 'taskId2', ...]) 호출
  (window as unknown as Record<string, unknown>).recoverVideos = async (taskIds: string[]) => {
    const { useProjectStore } = await import('./stores/projectStore');
    return useProjectStore.getState().recoverVideosByTaskIds(taskIds);
  };

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
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

  // [FIX] 영상 복구 도구 글로벌 노출
  (window as unknown as Record<string, unknown>).recoverVideos = async (taskIds: string[]) => {
    const { useProjectStore } = await import('./stores/projectStore');
    return useProjectStore.getState().recoverVideosByTaskIds(taskIds);
  };
  // [임시] window.recoverAll() — 소실된 영상 일괄 복구
  (window as unknown as Record<string, unknown>).recoverAll = async () => {
    const ids = ['1009aeadbc1beffc95055eba134b768b','cb0bbb9c94bc32d7a2d73867bfe6804c','2c5f8a0a4ba0c6d9e6bc78fbad7a6aea','7d759d77531354a75e2a2127a1748b83','6a1701077e4280e73c2439047a89004b','6a95a86d516f33b28ae63885d168c723','84b5f23e50cc4a08f457a7a72bc9fde7','2344f5e4ee3c3fcb79d8554bba39267e','e894f3fde5a3908c93c92f837884ef15','d7fa7be675d708001107de0f0b46d56f','4dc104cce507b92d9ce882c4f96c933a','f031a97b42d9213f080fc8219cc2dce6','8625256e4d816ffcfc572e7e510e3f00','8053a83aa1c500627965bfede1d0bf9e','47d41b368825062a23945fc5c2c989fb','5bfb90b71386d637e717412b2edde952','96b090d8dea3245b465aff4a8ac6c1f4','8467ae1d850deeaaa22c70778ed42336','b7762726de2fb9ea26e0d18e03b48374','330cd09e38f1c95a0bda4f9a548e4666','2c8825e0341d051468077d366ba14548','4bdd3a121ca0af7653993414bea9483c','b89dec69a431ee7fa0568e329cfa8146','f3175c21c19e3f4f7f3d1377456d970e','a67a286b9409dbbaab2ae7f9a9c72160','3250ea3a3f81070d3794001cbe24e334','8a0ba388b905c3bf227ef3b275a208cf','cf466b89062f97c0bf188608527412ac','65656e1e41d7211c90697dfcf71b754f','878fbe5c6f7816284159336ca98cb155','e9f412ef3f214791fdb911addb5251e7','671abf76694f76fdef024cc5015c2661','d189b215db803d8a7e44f5cd8299a52f','ab9cfa1899d33ae060d6854f740893f8','18fea288e7648d896d95483cc3dbde19','26f72b400abb78d01e6ea231bda877c3','a0542ed23e34e2338088f6c47d38f906','0ad394b101b1fc116217a490bea8ca44','9334c797c09577acc7ce93300b95f102','c5049400bbbdf0955cdf28d01afd4341','2a470edb3b859295ddca39d2149967e4','e00a1f9c29821a9d66d4e817bc8c717c','c8cd99cfafef6413e7665d9bfea626ca','4a60058f83f40cf2a2a211b090f2287a','7c8fbf17f96f0228ec7e7a5c2a750055','ffa8ab7124b8df12be9e60f42f166a7e','ce90f952d6e0961c88b76e0895b53030','c901f14361ced084d5a675c1136a6f42','79c8066ed197d03a82625636361de578','a321cc57b505653a33730d1cdf27b359','73fb5ba31a2dabf57366fbe542a4461f','fbf1980199c5d037428a07ff38b4ba9b','37cbe405787b33460c09c84d9fb232b1','a2679547ae8e57c93e5496109bd504f4','2c880c0938a8b3581b2f476849cf9640','8a23590d2a406da8653c5c1c8c2ec87d','f10d62a255f4d26c7a34aad4a5d3d0dd','b42401d8431dcbe4e61e74f5c3093058','e4f1dd31533f29467e157b4338fa9be2','1a8bfa28cf3d8d22ec209067285dc551','c941c972c20b8c0824d00d9ba0beea35','05db9aeb17712f599def2365f35c59a1','46ffc46c7d23de354c806b9caaf6c2da','4b38bdc833fd72439e6b7f7e0ea78b7f','60dd7710e11cbcc6d88dc6b014aa3328','7349ca0bebd6afc922c88acbf9d2e5d7','b2f8df6feb83bd6efa5568eb2acaccec','3c9fbb6253974cd3a679a059c2a8ba56','f883d581d10fa994dcc93737058062fb','96e320830fea07833448164237540534','b45ba9aa55d8b3440c1aced471cf8697','c37552deae2500fa80614b895041f7bd','2bca739d65c93dd1febeb3ca82235155','3f3ac1c3d98809bb231dc7c9c2d04a6e','5b4d4e125427009166c1c7567904456f','f8b681be51865aa250b9e52e9960e64a','c6280a7f02f8e26a44bbac59126983a7','25677995512cdd0fae356c66aaac27e2','d1eb691caef95ebb022dd770dde3238b','d147489aafaf8c6056a993d98781c89d','9bf3bb585db93b2a097e2ca4e55b0a66','66b3fa129a7f0749d9efd928c0b26427','f530d424fad4e6af4c2b46635a06341e','208974945c3af337e3e4ebeaccb4490e','5fbb46e6407a89e332009443bd79036f','b66124034c18c94df546712b84bbd396','413d467c0dd7712a356cd56d53595103','6dc288696739261ffad9cb815b7a7b2c','c6ea8a68fee38bf59d707fe60a54a1a7','586339f478932f3ba21576e8060abd15','74f2f6b409547748d19f10c10b964e80','56c338e2526e323eaf150ae2f8be92a7','4d6276febdbe95e65f2357a807fa370b','9a25cf074e98ec7bb744b6ce474d5ee2','1bb885c2330f27acabc5bd0ce2056729','775f08bfea7384f89abbe49f870840a0','6d36d4b37d6a8091f186beb2ee6a6f24','cec77963a4a630081bcfe75eab697926','04f2e8363be9ab5a64921bc001f911a2','c67a0651559ca98ea3bdea727a92ce73','3a67812ee5af64afac7afd8af05795d5','c219c6aa7cd0e79e3175aefd05e5650c','e4bca070acfd84e19d1ce07186429bd0','584d0d72cfe5c3d9f42819a9cc2dc82a','7a682ae68c933aafad35d86010aefca9'];
    const { useProjectStore } = await import('./stores/projectStore');
    return useProjectStore.getState().recoverVideosByTaskIds(ids);
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
/**
 * CSInterface.js — Adobe CEP Communication Library (Stub)
 *
 * 실제 Premiere Pro 환경에서는 Adobe가 제공하는 CSInterface.js를 사용한다.
 * 이 파일은 개발/테스트용 스텁이며, 실제 배포 시 Adobe의 공식 라이브러리로 교체한다.
 *
 * 공식 라이브러리:
 * https://github.com/nicolerenee/CSInterface/blob/master/CSInterface.js
 * https://github.com/nicolerenee/CSInterface/releases
 *
 * ⚠️ 이 스텁은 Premiere 외부(브라우저)에서 패널 UI를 테스트할 때만 사용된다.
 *    실제 ExtendScript 통신은 불가능하며, evalScript()는 빈 문자열을 반환한다.
 */

function CSInterface() {
  // Adobe 환경 감지
  this._isAdobe = (typeof __adobe_cep__ !== 'undefined');
}

CSInterface.prototype.evalScript = function(script, callback) {
  if (this._isAdobe && typeof __adobe_cep__ !== 'undefined') {
    // 실제 Adobe CEP 환경
    __adobe_cep__.evalScript(script, callback);
  } else {
    // 브라우저 테스트 모드 — 목 응답
    console.log('[CSInterface Mock] evalScript:', script.substring(0, 80) + '...');
    if (callback) {
      setTimeout(function() {
        callback('{"error":"Not connected to Premiere Pro"}');
      }, 100);
    }
  }
};

CSInterface.prototype.getSystemPath = function(pathType) {
  return '/mock/path/' + pathType;
};

CSInterface.prototype.addEventListener = function(type, listener) {
  console.log('[CSInterface Mock] addEventListener:', type);
};

CSInterface.prototype.requestOpenExtension = function(extensionId) {
  console.log('[CSInterface Mock] requestOpenExtension:', extensionId);
};

CSInterface.prototype.getHostEnvironment = function() {
  return {
    appName: 'PPRO',
    appVersion: '25.0',
    appLocale: 'ko_KR',
  };
};

// SystemPath 상수
CSInterface.prototype.SYSTEM_PATH_USER_EXTENSION = 'userExtension';
CSInterface.prototype.SYSTEM_PATH_COMMON_FILES = 'commonFiles';
CSInterface.prototype.SYSTEM_PATH_HOST_APPLICATION = 'hostApplication';

// CSEvent
function CSEvent(type, scope) {
  this.type = type || '';
  this.scope = scope || 'APPLICATION';
  this.data = '';
}

// 글로벌 노출
if (typeof window !== 'undefined') {
  window.CSInterface = CSInterface;
  window.CSEvent = CSEvent;
}

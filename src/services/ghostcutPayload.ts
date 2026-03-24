export interface GhostCutSubmitPayload {
  urls: string[];
  callback: string;
  needChineseOcclude: 1;
  resolution: '1080p';
  needCrop: 0;
  needMask: 0;
  needMirror: 0;
  needRescale: 0;
  needShift: 0;
  needTransition: 0;
  needTrim: 0;
  music: 0;
  musicRegion: '';
  randomBorder: 0;
}

/**
 * Smart Text Removal은 공개 예시와 실호출 비교 기준으로 자동 언어 감지 경로를 사용한다.
 * `videoInpaintLang`를 강제로 넣은 결과는 기존 실패 산출물과 매우 유사했고,
 * 같은 샘플에서 해당 필드를 제거했을 때 하단 자막 영역 변화가 가장 크게 확인됐다.
 */
export const buildGhostCutSubmitPayload = (
  videoUrl: string,
  callbackUrl: string,
): GhostCutSubmitPayload => ({
  urls: [videoUrl],
  callback: callbackUrl,
  needChineseOcclude: 1,
  resolution: '1080p',
  needCrop: 0,
  needMask: 0,
  needMirror: 0,
  needRescale: 0,
  needShift: 0,
  needTransition: 0,
  needTrim: 0,
  music: 0,
  musicRegion: '',
  randomBorder: 0,
});

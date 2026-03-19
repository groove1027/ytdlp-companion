export type GhostCutLang = 'ko' | 'zh' | 'en' | 'all' | 'ja' | 'ar';

export interface GhostCutSubmitPayload {
  urls: string[];
  callback: string;
  needChineseOcclude: 1;
  videoInpaintLang: GhostCutLang;
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
 * Smart Text Removal 공식 요청 예시는 needChineseOcclude=1 + needMask=0 조합이다.
 * needMask=1은 수동 마스킹 성격이 강해 자동 OCR 텍스트 제거 경로와 섞지 않는다.
 */
export const buildGhostCutSubmitPayload = (
  videoUrl: string,
  callbackUrl: string,
  lang: GhostCutLang = 'ko',
): GhostCutSubmitPayload => ({
  urls: [videoUrl],
  callback: callbackUrl,
  needChineseOcclude: 1,
  videoInpaintLang: lang,
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

/**
 * GhostCut Service — AI 자막/텍스트 자동 제거
 *
 * API: https://api.zhaoli.com/v-w-c/gateway/ve/work/fast
 * 인증: AppKey + AppSign (이중 MD5: MD5(MD5(body) + appSecret))
 * Flow: 영상 URL 전송 → callback URL로 결과 수신 → KV 경유 폴링 → 결과 영상 다운로드
 *
 * GhostCut은 polling 엔드포인트가 없고 callback 방식만 지원.
 * Cloudflare KV(GHOSTCUT_TASKS)를 경유하여 callback → poll 구조로 작동.
 */

import { getGhostCutKeys, monitoredFetch } from './apiService';
import { uploadMediaToHosting } from './uploadService';
import { logger } from './LoggerService';

// Cloudflare Pages Function 프록시 경유 (CORS 우회)
const GHOSTCUT_SUBMIT_URL = '/api/ghostcut/submit';
const GHOSTCUT_POLL_URL = '/api/ghostcut/poll';

/** 이중 MD5 서명 생성: MD5(MD5(body) + appSecret) */
const generateSign = async (body: string, appSecret: string): Promise<string> => {
  const encoder = new TextEncoder();

  // 1차 MD5: body
  const bodyHash = await crypto.subtle.digest('MD5', encoder.encode(body))
    .catch(() => null);

  // Web Crypto에서 MD5 미지원 시 수동 구현 (대부분의 브라우저에서 미지원)
  if (!bodyHash) {
    return md5Fallback(md5Fallback(body) + appSecret);
  }

  const bodyMd5 = Array.from(new Uint8Array(bodyHash))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // 2차 MD5: bodyMd5 + appSecret
  const signHash = await crypto.subtle.digest('MD5', encoder.encode(bodyMd5 + appSecret));
  return Array.from(new Uint8Array(signHash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
};

/** MD5 폴백 (Web Crypto 미지원 환경) */
const md5Fallback = (input: string): string => {
  // 간소화된 MD5 구현 (RFC 1321)
  const md5cycle = (x: number[], k: number[]) => {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    const ff = (a: number, b: number, c: number, d: number, s: number, t: number, k: number) => {
      const n = a + ((b & c) | (~b & d)) + k + t;
      return ((n << s) | (n >>> (32 - s))) + b;
    };
    const gg = (a: number, b: number, c: number, d: number, s: number, t: number, k: number) => {
      const n = a + ((b & d) | (c & ~d)) + k + t;
      return ((n << s) | (n >>> (32 - s))) + b;
    };
    const hh = (a: number, b: number, c: number, d: number, s: number, t: number, k: number) => {
      const n = a + (b ^ c ^ d) + k + t;
      return ((n << s) | (n >>> (32 - s))) + b;
    };
    const ii = (a: number, b: number, c: number, d: number, s: number, t: number, k: number) => {
      const n = a + (c ^ (b | ~d)) + k + t;
      return ((n << s) | (n >>> (32 - s))) + b;
    };

    a=ff(a,b,c,d,7,-680876936,k[0]);d=ff(d,a,b,c,12,-389564586,k[1]);c=ff(c,d,a,b,17,606105819,k[2]);b=ff(b,c,d,a,22,-1044525330,k[3]);
    a=ff(a,b,c,d,7,-176418897,k[4]);d=ff(d,a,b,c,12,1200080426,k[5]);c=ff(c,d,a,b,17,-1473231341,k[6]);b=ff(b,c,d,a,22,-45705983,k[7]);
    a=ff(a,b,c,d,7,1770035416,k[8]);d=ff(d,a,b,c,12,-1958414417,k[9]);c=ff(c,d,a,b,17,-42063,k[10]);b=ff(b,c,d,a,22,-1990404162,k[11]);
    a=ff(a,b,c,d,7,1804603682,k[12]);d=ff(d,a,b,c,12,-40341101,k[13]);c=ff(c,d,a,b,17,-1502002290,k[14]);b=ff(b,c,d,a,22,1236535329,k[15]);

    a=gg(a,b,c,d,5,-165796510,k[1]);d=gg(d,a,b,c,9,-1069501632,k[6]);c=gg(c,d,a,b,14,643717713,k[11]);b=gg(b,c,d,a,20,-373897302,k[0]);
    a=gg(a,b,c,d,5,-701558691,k[5]);d=gg(d,a,b,c,9,38016083,k[10]);c=gg(c,d,a,b,14,-660478335,k[15]);b=gg(b,c,d,a,20,-405537848,k[4]);
    a=gg(a,b,c,d,5,568446438,k[9]);d=gg(d,a,b,c,9,-1019803690,k[14]);c=gg(c,d,a,b,14,-187363961,k[3]);b=gg(b,c,d,a,20,1163531501,k[8]);
    a=gg(a,b,c,d,5,-1444681467,k[13]);d=gg(d,a,b,c,9,-51403784,k[2]);c=gg(c,d,a,b,14,1735328473,k[7]);b=gg(b,c,d,a,20,-1926607734,k[12]);

    a=hh(a,b,c,d,4,-378558,k[5]);d=hh(d,a,b,c,11,-2022574463,k[8]);c=hh(c,d,a,b,16,1839030562,k[11]);b=hh(b,c,d,a,23,-35309556,k[14]);
    a=hh(a,b,c,d,4,-1530992060,k[1]);d=hh(d,a,b,c,11,1272893353,k[4]);c=hh(c,d,a,b,16,-155497632,k[7]);b=hh(b,c,d,a,23,-1094730640,k[10]);
    a=hh(a,b,c,d,4,681279174,k[13]);d=hh(d,a,b,c,11,-358537222,k[0]);c=hh(c,d,a,b,16,-722521979,k[3]);b=hh(b,c,d,a,23,76029189,k[6]);
    a=hh(a,b,c,d,4,-640364487,k[9]);d=hh(d,a,b,c,11,-421815835,k[12]);c=hh(c,d,a,b,16,530742520,k[15]);b=hh(b,c,d,a,23,-995338651,k[2]);

    a=ii(a,b,c,d,6,-198630844,k[0]);d=ii(d,a,b,c,10,1126891415,k[7]);c=ii(c,d,a,b,15,-1416354905,k[14]);b=ii(b,c,d,a,21,-57434055,k[5]);
    a=ii(a,b,c,d,6,1700485571,k[12]);d=ii(d,a,b,c,10,-1894986606,k[3]);c=ii(c,d,a,b,15,-1051523,k[10]);b=ii(b,c,d,a,21,-2054922799,k[1]);
    a=ii(a,b,c,d,6,1873313359,k[8]);d=ii(d,a,b,c,10,-30611744,k[15]);c=ii(c,d,a,b,15,-1560198380,k[6]);b=ii(b,c,d,a,21,1309151649,k[13]);
    a=ii(a,b,c,d,6,-145523070,k[4]);d=ii(d,a,b,c,10,-1120210379,k[11]);c=ii(c,d,a,b,15,718787259,k[2]);b=ii(b,c,d,a,21,-343485551,k[9]);

    x[0] = (a + x[0]) | 0; x[1] = (b + x[1]) | 0; x[2] = (c + x[2]) | 0; x[3] = (d + x[3]) | 0;
  };

  const cmn = (str: string): number[] => {
    const n = str.length;
    const state = [1732584193, -271733879, -1732584194, 271733878];
    let i: number;
    const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 64; i <= n; i += 64) {
      const blk: number[] = [];
      for (let j = 0; j < 64; j += 4) {
        blk.push(str.charCodeAt(i - 64 + j) | (str.charCodeAt(i - 64 + j + 1) << 8) | (str.charCodeAt(i - 64 + j + 2) << 16) | (str.charCodeAt(i - 64 + j + 3) << 24));
      }
      md5cycle(state, blk);
    }
    for (let j = 0; j < 16; j++) tail[j] = 0;
    for (let j = i - 64; j < n; j++) {
      tail[(j - (i - 64)) >> 2] |= str.charCodeAt(j) << (((j - (i - 64)) % 4) << 3);
    }
    tail[(n - (i - 64)) >> 2] |= 0x80 << (((n - (i - 64)) % 4) << 3);
    if ((n - (i - 64)) > 55) {
      md5cycle(state, tail);
      for (let j = 0; j < 16; j++) tail[j] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  };

  const hex = (x: number[]): string => {
    const h = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        s += h.charAt((x[i] >> (j * 8 + 4)) & 0xF) + h.charAt((x[i] >> (j * 8)) & 0xF);
      }
    }
    return s;
  };

  // UTF-8 인코딩
  const utf8 = unescape(encodeURIComponent(input));
  return hex(cmn(utf8));
};

interface GhostCutResponse {
  msg: string;
  code: number;
  trace: string;
  body: {
    idProject: number;
    dataList: { url: string; id: number }[];
  };
}

interface PollResult {
  status: 'processing' | 'done' | 'failed' | 'error';
  videoUrl?: string;
  errorDetail?: string;
  message?: string;
}

/** 작업 제출 (callback URL 포함) */
const submitTask = async (videoUrl: string): Promise<{ projectId: number; taskId: number }> => {
  const { appKey, appSecret } = getGhostCutKeys();
  if (!appKey || !appSecret) {
    throw new Error('GhostCut API 키가 설정되지 않았습니다. API 설정에서 AppKey와 AppSecret을 입력해주세요.');
  }

  // callback URL: 현재 도메인의 /api/ghostcut/callback
  const callbackUrl = `${window.location.origin}/api/ghostcut/callback`;

  const body = JSON.stringify({
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
    music: 2,
    musicRegion: '',
    randomBorder: 0,
  });

  const sign = await generateSign(body, appSecret);

  const response = await monitoredFetch(GHOSTCUT_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'AppKey': appKey,
      'AppSign': sign,
    },
    body,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`GhostCut API 오류 (${response.status}): ${errText}`);
  }

  const data: GhostCutResponse = await response.json();
  if (data.code !== 1000) {
    throw new Error(`GhostCut 작업 제출 실패: ${data.msg} (code: ${data.code})`);
  }

  return {
    projectId: data.body.idProject,
    taskId: data.body.dataList[0]?.id,
  };
};

/** 작업 결과 폴링 (KV 경유, 최대 15분, 8초 간격) */
const pollResult = async (
  projectId: number,
  onProgress?: (message: string) => void,
): Promise<string> => {
  const MAX_POLLS = 112; // 15분 / 8초
  const POLL_INTERVAL = 8000;

  for (let i = 0; i < MAX_POLLS; i++) {
    const response = await monitoredFetch(GHOSTCUT_POLL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });

    if (!response.ok) {
      throw new Error(`폴링 오류: ${response.statusText}`);
    }

    const data: PollResult = await response.json();

    if (data.status === 'done' && data.videoUrl) {
      return data.videoUrl;
    }

    if (data.status === 'failed') {
      throw new Error(`GhostCut 처리 실패: ${data.errorDetail || '영상을 처리할 수 없습니다.'}`);
    }

    if (data.status === 'error') {
      throw new Error(data.message || 'GhostCut 서버 오류');
    }

    // 아직 처리 중
    const elapsed = (i + 1) * (POLL_INTERVAL / 1000);
    if (elapsed < 30) {
      onProgress?.('GhostCut 대기열 진입 중...');
    } else if (elapsed < 90) {
      onProgress?.('AI 자막 감지 & 제거 중...');
    } else {
      onProgress?.(`AI 처리 중... (${Math.round(elapsed)}초 경과)`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error('GhostCut 처리 시간 초과 (15분)');
};

/**
 * GhostCut 자막 제거 전체 파이프라인
 * 1. 영상 Cloudinary 업로드 (URL 필요)
 * 2. GhostCut API 작업 제출 (callback URL 포함)
 * 3. KV 경유 폴링으로 완료 대기
 * 4. 결과 영상 다운로드
 */
export const removeSubtitlesWithGhostCut = async (
  videoBlob: Blob,
  _width: number,
  _height: number,
  onProgress?: (message: string) => void,
): Promise<Blob> => {
  logger.info('[GhostCut] 자막 제거 파이프라인 시작');

  // 1. 영상 업로드 (GhostCut은 URL을 받음)
  onProgress?.('영상을 업로드 중...');
  const videoFile = new File([videoBlob], 'source.mp4', { type: 'video/mp4' });
  const videoUrl = await uploadMediaToHosting(videoFile);
  logger.info('[GhostCut] 영상 업로드 완료', { videoUrl });

  // 2. 작업 제출 (callback URL 자동 포함)
  onProgress?.('GhostCut AI 자막 제거 시작...');
  const { projectId } = await submitTask(videoUrl);
  logger.info('[GhostCut] 작업 제출', { projectId });

  // 3. KV 경유 폴링
  const resultUrl = await pollResult(projectId, onProgress);
  logger.info('[GhostCut] 처리 완료', { resultUrl });

  // 4. 결과 다운로드
  onProgress?.('정제된 영상 다운로드 중...');
  const resultResponse = await fetch(resultUrl);
  if (!resultResponse.ok) {
    throw new Error('GhostCut 결과 다운로드 실패');
  }

  const resultBlob = await resultResponse.blob();
  logger.success('[GhostCut] 자막 제거 완료', { size: resultBlob.size });
  return resultBlob;
};

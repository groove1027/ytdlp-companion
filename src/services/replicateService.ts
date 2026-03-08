/**
 * Replicate Service — ProPainter 기반 자막 제거
 *
 * Flow: 영상 Blob → Cloudinary 업로드 → 마스크 생성/업로드 → ProPainter API → 폴링 → 정제된 영상 Blob 반환
 */

import { getReplicateKey, monitoredFetch } from './apiService';
import { uploadMediaToHosting } from './uploadService';
import { logger } from './LoggerService';

const REPLICATE_API_BASE = 'https://api.replicate.com/v1';
const PROPAINTER_MODEL = 'jd7h/propainter';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: string | null;
  error: string | null;
  urls: { get: string; cancel: string };
}

/** Replicate 예측 생성 */
const createPrediction = async (
  videoUrl: string,
  maskUrl: string,
): Promise<ReplicatePrediction> => {
  const apiKey = getReplicateKey();
  if (!apiKey) {
    throw new Error('Replicate API 키가 설정되지 않았습니다. API 설정에서 입력해주세요.');
  }

  const response = await monitoredFetch(
    `${REPLICATE_API_BASE}/models/${PROPAINTER_MODEL}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { video: videoUrl, mask: maskUrl },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(`Replicate 예측 생성 실패: ${err.detail || err.title || response.statusText}`);
  }

  return response.json();
};

/** 완료될 때까지 폴링 (최대 10분, 5초 간격) */
const pollPrediction = async (
  predictionId: string,
  onProgress?: (message: string) => void,
): Promise<ReplicatePrediction> => {
  const apiKey = getReplicateKey();
  const pollUrl = `${REPLICATE_API_BASE}/predictions/${predictionId}`;
  const MAX_POLLS = 120;

  for (let i = 0; i < MAX_POLLS; i++) {
    const response = await monitoredFetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Replicate 상태 조회 실패: ${response.statusText}`);
    }

    const prediction: ReplicatePrediction = await response.json();

    if (prediction.status === 'succeeded') return prediction;

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`ProPainter 처리 실패: ${prediction.error || '알 수 없는 오류'}`);
    }

    onProgress?.(prediction.status === 'starting' ? '모델 로딩 중...' : '영상 처리 중...');
    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error('ProPainter 처리 시간 초과 (10분)');
};

/** 자막 영역 마스크 생성 — 하단 20% 흰색, 나머지 검정 */
const generateSubtitleMask = (width: number, height: number): Blob => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const maskTop = Math.floor(height * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, maskTop, width, height - maskTop);

  const dataUrl = canvas.toDataURL('image/png');
  const binary = atob(dataUrl.split(',')[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: 'image/png' });
};

/**
 * ProPainter 자막 제거 전체 파이프라인
 * 1. 영상 Cloudinary 업로드
 * 2. 마스크 생성 + 업로드
 * 3. Replicate 예측 생성 + 폴링
 * 4. 결과 다운로드
 */
export const removeSubtitlesWithProPainter = async (
  videoBlob: Blob,
  width: number,
  height: number,
  onProgress?: (message: string) => void,
): Promise<Blob> => {
  logger.info('[ProPainter] 자막 제거 파이프라인 시작');

  // 1. 영상 업로드
  onProgress?.('영상을 Cloudinary에 업로드 중...');
  const videoFile = new File([videoBlob], 'source.mp4', { type: 'video/mp4' });
  const videoUrl = await uploadMediaToHosting(videoFile);
  logger.info('[ProPainter] 영상 업로드 완료', { videoUrl });

  // 2. 마스크 생성 + 업로드
  onProgress?.('자막 마스크 생성 중...');
  const maskBlob = generateSubtitleMask(width, height);
  const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });
  const maskUrl = await uploadMediaToHosting(maskFile);
  logger.info('[ProPainter] 마스크 업로드 완료', { maskUrl });

  // 3. 예측 생성 + 폴링
  onProgress?.('ProPainter AI 처리 시작...');
  const prediction = await createPrediction(videoUrl, maskUrl);
  logger.info('[ProPainter] 예측 생성', { id: prediction.id });

  const result = await pollPrediction(prediction.id, onProgress);

  if (!result.output) {
    throw new Error('ProPainter 결과 URL이 없습니다.');
  }

  // 4. 결과 다운로드
  onProgress?.('정제된 영상 다운로드 중...');
  const resultResponse = await fetch(result.output);
  if (!resultResponse.ok) {
    throw new Error('ProPainter 결과 다운로드 실패');
  }

  const resultBlob = await resultResponse.blob();
  logger.success('[ProPainter] 자막 제거 완료', { size: resultBlob.size });
  return resultBlob;
};

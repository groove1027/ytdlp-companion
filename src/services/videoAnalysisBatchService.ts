import type {
  VideoAnalysisFailedVersion,
  VideoVersionItem,
} from '../types';

export interface VideoAnalysisBatchRequest {
  versionOffset: number;
  versionCount: number;
  versionIds: number[];
  maxTokens: number;
}

export interface VideoAnalysisBatchSuccessPayload {
  text: string;
  versions: VideoVersionItem[];
  missingReason?: string;
}

export interface VideoAnalysisBatchSuccess extends VideoAnalysisBatchSuccessPayload {
  batch: VideoAnalysisBatchRequest;
}

export interface RunVideoAnalysisBatchesOptions {
  batches: VideoAnalysisBatchRequest[];
  executeBatch: (batch: VideoAnalysisBatchRequest, attempt: number) => Promise<VideoAnalysisBatchSuccessPayload>;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryableError?: (error: unknown) => boolean;
}

export interface RunVideoAnalysisBatchesResult {
  successfulBatches: VideoAnalysisBatchSuccess[];
  failedVersions: VideoAnalysisFailedVersion[];
  firstError: Error | null;
}

const DEFAULT_PARTIAL_FAILURE_REASON = 'AI 응답이 중간에 끊기거나 비어 있어 이 버전이 누락되었습니다.';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return '분석 배치 실행에 실패했습니다.';
};

export const isRetryableVideoAnalysisBatchError = (error: unknown): boolean => {
  const message = toErrorMessage(error).toLowerCase();
  return message.includes('429')
    || message.includes('rate limit')
    || message.includes('resource exhausted')
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('타임아웃')
    || message.includes('시간 초과');
};

export const createFailedVideoAnalysisVersions = (
  versionIds: number[],
  reason: string,
): VideoAnalysisFailedVersion[] => {
  const normalizedIds = Array.from(
    new Set(versionIds.filter((id) => Number.isInteger(id) && id > 0)),
  ).sort((left, right) => left - right);

  return normalizedIds.map((id) => ({ id, reason }));
};

export const chunkVideoAnalysisVersionIds = (
  versionIds: number[],
  maxBatchSize: number,
): Array<Pick<VideoAnalysisBatchRequest, 'versionOffset' | 'versionCount' | 'versionIds'>> => {
  const normalizedIds = Array.from(
    new Set(versionIds.filter((id) => Number.isInteger(id) && id > 0)),
  ).sort((left, right) => left - right);
  const safeBatchSize = Math.max(1, maxBatchSize);
  const batches: Array<Pick<VideoAnalysisBatchRequest, 'versionOffset' | 'versionCount' | 'versionIds'>> = [];

  let currentGroup: number[] = [];
  for (const versionId of normalizedIds) {
    const lastId = currentGroup[currentGroup.length - 1];
    const isNextContiguous = currentGroup.length === 0 || versionId === lastId + 1;
    if (!isNextContiguous || currentGroup.length >= safeBatchSize) {
      if (currentGroup.length > 0) {
        batches.push({
          versionOffset: currentGroup[0] - 1,
          versionCount: currentGroup.length,
          versionIds: [...currentGroup],
        });
      }
      currentGroup = [];
    }
    currentGroup.push(versionId);
  }

  if (currentGroup.length > 0) {
    batches.push({
      versionOffset: currentGroup[0] - 1,
      versionCount: currentGroup.length,
      versionIds: [...currentGroup],
    });
  }

  return batches;
};

export const mergeVideoAnalysisVersions = (
  existing: VideoVersionItem[],
  incoming: VideoVersionItem[],
): VideoVersionItem[] => {
  const merged = new Map<number, VideoVersionItem>();
  existing.forEach((version) => {
    merged.set(version.id, version);
  });
  incoming.forEach((version) => {
    merged.set(version.id, version);
  });
  return Array.from(merged.values()).sort((left, right) => left.id - right.id);
};

export async function runVideoAnalysisBatches(
  options: RunVideoAnalysisBatchesOptions,
): Promise<RunVideoAnalysisBatchesResult> {
  const {
    batches,
    executeBatch,
    maxAttempts = 2,
    retryDelayMs = 350,
    retryableError = isRetryableVideoAnalysisBatchError,
  } = options;

  const successfulBatches: VideoAnalysisBatchSuccess[] = [];
  const failedVersions: VideoAnalysisFailedVersion[] = [];
  let firstError: Error | null = null;

  for (const batch of batches) {
    let attempt = 1;
    while (attempt <= Math.max(1, maxAttempts)) {
      try {
        const payload = await executeBatch(batch, attempt);
        successfulBatches.push({ ...payload, batch });

        const returnedIds = new Set(payload.versions.map((version) => version.id));
        const missingVersionIds = batch.versionIds.filter((id) => !returnedIds.has(id));
        if (missingVersionIds.length > 0) {
          failedVersions.push(
            ...createFailedVideoAnalysisVersions(
              missingVersionIds,
              payload.missingReason || DEFAULT_PARTIAL_FAILURE_REASON,
            ),
          );
        }
        break;
      } catch (error) {
        const normalizedError = error instanceof Error
          ? error
          : new Error(toErrorMessage(error));
        if (!firstError) firstError = normalizedError;

        const shouldRetry = attempt < Math.max(1, maxAttempts) && retryableError(error);
        if (!shouldRetry) {
          failedVersions.push(
            ...createFailedVideoAnalysisVersions(batch.versionIds, normalizedError.message),
          );
          break;
        }

        await sleep(retryDelayMs);
        attempt += 1;
      }
    }

    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  return { successfulBatches, failedVersions, firstError };
}

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

export const getVideoAnalysisBatchVersionIdCandidates = (
  id: number,
  versionOffset: number,
  batchVersionCount: number,
): number[] => {
  const startId = versionOffset + 1;
  const endId = versionOffset + batchVersionCount;
  return [
    id >= startId && id <= endId ? id : undefined,
    id >= 1 && id <= batchVersionCount ? versionOffset + id : undefined,
  ].filter((value): value is number => typeof value === 'number');
};

export const normalizeVideoAnalysisBatchVersions = (
  items: VideoVersionItem[],
  versionOffset: number,
  batchVersionCount: number,
): VideoVersionItem[] => {
  if (items.length === 0 || batchVersionCount <= 0) return [];

  const startId = versionOffset + 1;
  const endId = versionOffset + batchVersionCount;
  const usedIds = new Set<number>();
  const nextAvailableId = () => {
    for (let id = startId; id <= endId; id += 1) {
      if (!usedIds.has(id)) return id;
    }
    return null;
  };

  const prioritized = items
    .map((item, index) => {
      const candidates = getVideoAnalysisBatchVersionIdCandidates(item.id, versionOffset, batchVersionCount);
      const directId = candidates.find((candidate) => candidate === item.id);
      const relativeId = candidates.find((candidate) => candidate !== item.id);
      const priority = directId ? 0 : relativeId ? 1 : 2;
      return {
        item,
        index,
        preferredId: directId ?? relativeId ?? null,
        priority,
      };
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.preferredId !== right.preferredId) {
        if (left.preferredId == null) return 1;
        if (right.preferredId == null) return -1;
        return left.preferredId - right.preferredId;
      }
      return left.index - right.index;
    });

  const normalized: VideoVersionItem[] = [];
  for (const candidate of prioritized) {
    if (normalized.length >= batchVersionCount) break;

    const resolvedId = (candidate.preferredId != null && !usedIds.has(candidate.preferredId))
      ? candidate.preferredId
      : nextAvailableId();
    if (resolvedId == null) break;

    usedIds.add(resolvedId);
    normalized.push(
      resolvedId === candidate.item.id
        ? candidate.item
        : { ...candidate.item, id: resolvedId },
    );
  }

  return normalized.sort((left, right) => left.id - right.id);
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

import { describe, expect, it, vi } from 'vitest';

import type { VideoVersionItem } from '../../types';
import {
  chunkVideoAnalysisVersionIds,
  mergeVideoAnalysisVersions,
  runVideoAnalysisBatches,
  type VideoAnalysisBatchRequest,
} from '../videoAnalysisBatchService';

function makeVersion(id: number): VideoVersionItem {
  return {
    id,
    title: `VERSION ${id}`,
    concept: '',
    scenes: [],
  };
}

describe('videoAnalysisBatchService', () => {
  it('splits contiguous version ids by the requested batch size', () => {
    expect(chunkVideoAnalysisVersionIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([
      { versionOffset: 0, versionCount: 4, versionIds: [1, 2, 3, 4] },
      { versionOffset: 4, versionCount: 4, versionIds: [5, 6, 7, 8] },
      { versionOffset: 8, versionCount: 2, versionIds: [9, 10] },
    ]);
  });

  it('keeps the other 9 versions when one requested version is missing', async () => {
    const batches: VideoAnalysisBatchRequest[] = [
      { versionOffset: 0, versionCount: 5, versionIds: [1, 2, 3, 4, 5], maxTokens: 1000 },
      { versionOffset: 5, versionCount: 5, versionIds: [6, 7, 8, 9, 10], maxTokens: 1000 },
    ];
    const executeBatch = vi.fn(async (batch: VideoAnalysisBatchRequest) => {
      if (batch.versionOffset === 0) {
        return {
          text: 'batch-1',
          versions: [1, 2, 3, 4, 5].map(makeVersion),
        };
      }
      return {
        text: 'batch-2',
        versions: [6, 7, 8, 9].map(makeVersion),
        missingReason: 'VERSION 10 only failed',
      };
    });

    const result = await runVideoAnalysisBatches({
      batches,
      executeBatch,
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    const mergedVersions = mergeVideoAnalysisVersions(
      [],
      result.successfulBatches.flatMap((batch) => batch.versions),
    );

    expect(mergedVersions.map((version) => version.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.failedVersions).toEqual([{ id: 10, reason: 'VERSION 10 only failed' }]);
    expect(executeBatch).toHaveBeenCalledTimes(2);
  });

  it('retries retryable batch errors once before succeeding', async () => {
    let attempts = 0;
    const executeBatch = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('429 Rate Limit');
      }
      return {
        text: 'ok',
        versions: [makeVersion(1)],
      };
    });

    const result = await runVideoAnalysisBatches({
      batches: [{ versionOffset: 0, versionCount: 1, versionIds: [1], maxTokens: 1000 }],
      executeBatch,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(result.failedVersions).toEqual([]);
    expect(result.successfulBatches).toHaveLength(1);
    expect(result.successfulBatches[0].versions[0].id).toBe(1);
    expect(executeBatch).toHaveBeenCalledTimes(2);
  });
});

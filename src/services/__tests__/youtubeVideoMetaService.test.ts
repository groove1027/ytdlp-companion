import { describe, expect, it } from 'vitest';

import {
  classifyYouTubeVideoMetaError,
  getYouTubeVideoMetaErrorMessage,
} from '../youtubeVideoMetaService';

describe('youtubeVideoMetaService', () => {
  it('classifies quota failures distinctly from generic forbidden responses', () => {
    expect(
      classifyYouTubeVideoMetaError(403, '{"error":{"errors":[{"reason":"quotaExceeded"}]}}'),
    ).toBe('quota_exceeded');
    expect(
      classifyYouTubeVideoMetaError(403, '{"error":{"errors":[{"reason":"forbidden"}]}}'),
    ).toBe('forbidden');
  });

  it('returns user-facing messages for invalid URLs and unavailable videos', () => {
    expect(getYouTubeVideoMetaErrorMessage('invalid_video_id')).toContain('URL 형식');
    expect(getYouTubeVideoMetaErrorMessage('private_or_unavailable')).toContain('비공개');
  });
});

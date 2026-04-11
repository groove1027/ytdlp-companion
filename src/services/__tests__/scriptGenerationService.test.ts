import { describe, expect, it, vi } from 'vitest';

import { ScriptAiModel } from '../../types';
import {
  buildContinuationTokenBudget,
  buildInitialScriptTokenBudget,
  generateScriptWithContinuations,
  type ScriptGenerationStreamFn,
} from '../scriptGenerationService';

describe('scriptGenerationService', () => {
  it('continues generating when the first response is far below the target length', async () => {
    const chunks = ['a'.repeat(3000), 'b'.repeat(2200)];
    let callCount = 0;
    const stream = vi.fn<ScriptGenerationStreamFn>(async (
      _systemPrompt,
      _userPrompt,
      onChunk,
      options,
    ) => {
      const text = chunks[callCount] || '';
      callCount += 1;
      onChunk(text, text);
      options.onFinish?.('STOP');
      return text;
    });

    const result = await generateScriptWithContinuations({
      systemPrompt: 'system',
      userPrompt: 'user',
      targetCharCount: 5000,
      model: ScriptAiModel.GEMINI_PRO,
      enableWebSearch: true,
      signal: new AbortController().signal,
      stream,
      onProgress: () => {},
    });

    expect(stream).toHaveBeenCalledTimes(2);
    expect(result.text.length).toBe(5200);
    expect(result.severeShortfall).toBe(false);
  });

  it('preserves streamed continuation text when a follow-up request fails', async () => {
    const continuationError = vi.fn();
    const stream = vi
      .fn<ScriptGenerationStreamFn>()
      .mockImplementationOnce(async (_systemPrompt, _userPrompt, onChunk, options) => {
        const text = 'a'.repeat(3000);
        onChunk(text, text);
        options.onFinish?.('STOP');
        return text;
      })
      .mockImplementationOnce(async (_systemPrompt, _userPrompt, onChunk) => {
        const partial = 'b'.repeat(450);
        onChunk(partial, partial);
        throw new Error('network failed');
      });

    const result = await generateScriptWithContinuations({
      systemPrompt: 'system',
      userPrompt: 'user',
      targetCharCount: 5000,
      model: ScriptAiModel.GEMINI_PRO,
      enableWebSearch: true,
      signal: new AbortController().signal,
      stream,
      onProgress: () => {},
      onContinuationError: continuationError,
    });

    expect(result.text.length).toBe(3450);
    expect(continuationError).toHaveBeenCalledTimes(1);
  });

  it('scales token budgets for long-form scripts', () => {
    expect(buildInitialScriptTokenBudget(5000)).toBeGreaterThan(20000);
    expect(buildContinuationTokenBudget(1200)).toBeGreaterThan(5000);
  });
});

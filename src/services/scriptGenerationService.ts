import type { ScriptAiModel } from '../types';

export interface ScriptGenerationStreamOptions {
  model: ScriptAiModel;
  temperature?: number;
  maxOutputTokens?: number;
  enableWebSearch?: boolean;
  signal?: AbortSignal;
  onFinish?: (reason: string) => void;
}

export type ScriptGenerationStreamFn = (
  systemPrompt: string,
  userPrompt: string,
  onChunk: (chunk: string, accumulated: string) => void,
  options: ScriptGenerationStreamOptions,
) => Promise<string>;

export interface GenerateScriptWithContinuationParams {
  systemPrompt: string;
  userPrompt: string;
  targetCharCount: number;
  model: ScriptAiModel;
  enableWebSearch: boolean;
  signal: AbortSignal;
  stream: ScriptGenerationStreamFn;
  onProgress: (accumulated: string) => void;
  onContinuationError?: (context: {
    attempt: number;
    maxAttempts: number;
    currentText: string;
    error: unknown;
  }) => void;
  minCompletionRatio?: number;
  maxContinuations?: number;
}

export interface GenerateScriptWithContinuationResult {
  text: string;
  finishReason: string;
  continuationCount: number;
  severeShortfall: boolean;
}

const INITIAL_MIN_TOKEN_BUDGET = 12000;
const CONTINUATION_MIN_TOKEN_BUDGET = 3000;
const CONTINUATION_CONTEXT_CHARS = 1000;
const TRUNCATED_SENTENCE_CONTEXT_CHARS = 500;
const DEFAULT_MIN_COMPLETION_RATIO = 0.92;
const DEFAULT_MAX_CONTINUATIONS = 5;
const HARD_MIN_COMPLETION_RATIO = 0.8;

export const looksLikeNaturallyFinishedScript = (text: string): boolean => {
  const trimmed = text.trimEnd();
  if (!trimmed) return false;
  return /[.!?。\n]$/.test(trimmed)
    && /(끝|감사합니다|였습니다|됩니다|봅시다|보겠습니다|주세요|드립니다|했다\.|입니다\.)/.test(trimmed.slice(-40));
};

export const buildInitialScriptTokenBudget = (targetCharCount: number): number =>
  Math.min(65536, Math.max(INITIAL_MIN_TOKEN_BUDGET, Math.ceil(targetCharCount * 5)));

export const buildContinuationTokenBudget = (remainingCharCount: number): number =>
  Math.min(40000, Math.max(CONTINUATION_MIN_TOKEN_BUDGET, Math.ceil(Math.max(remainingCharCount, 600) * 5)));

export const buildScriptContinuationPrompt = (currentText: string, remainingCharCount: number): string => {
  if (remainingCharCount > 0) {
    return `다음은 이전에 작성하던 대본의 마지막 부분입니다:\n\n"...${currentText.slice(-CONTINUATION_CONTEXT_CHARS)}"\n\n이 대본을 끊긴 부분부터 자연스럽게 이어서 계속 작성하세요.\n남은 분량: 약 ${remainingCharCount}자\n\n중요: 이미 쓴 내용을 반복하지 마세요. 끊긴 지점부터 바로 이어서 쓰세요. 대본 본문만 출력하세요.`;
  }

  return `다음 대본의 마지막 문장이 중간에서 끊겼습니다:\n\n"...${currentText.slice(-TRUNCATED_SENTENCE_CONTEXT_CHARS)}"\n\n끊긴 마지막 문장만 자연스럽게 완성하세요. 새로운 내용을 추가하지 마세요. 대본 본문만 출력하세요.`;
};

export async function generateScriptWithContinuations(
  params: GenerateScriptWithContinuationParams,
): Promise<GenerateScriptWithContinuationResult> {
  const {
    systemPrompt,
    userPrompt,
    targetCharCount,
    model,
    enableWebSearch,
    signal,
    stream,
    onProgress,
    onContinuationError,
    minCompletionRatio = DEFAULT_MIN_COMPLETION_RATIO,
    maxContinuations = DEFAULT_MAX_CONTINUATIONS,
  } = params;

  let finishReason = '';
  let text = await stream(
    systemPrompt,
    userPrompt,
    (_chunk, accumulated) => onProgress(accumulated),
    {
      model,
      temperature: 0.7,
      maxOutputTokens: buildInitialScriptTokenBudget(targetCharCount),
      enableWebSearch,
      signal,
      onFinish: (reason) => { finishReason = reason; },
    },
  );

  let continuationCount = 0;
  for (let attempt = 0; attempt < maxContinuations; attempt += 1) {
    const isTruncated = finishReason === 'MAX_TOKENS' || finishReason === 'length';
    const isTooShort = text.length < targetCharCount * minCompletionRatio;
    if (!isTruncated && !isTooShort) break;
    if (text.length >= targetCharCount * 0.97 && looksLikeNaturallyFinishedScript(text)) break;

    const remainingCharCount = targetCharCount - text.length;
    const continuationPrompt = buildScriptContinuationPrompt(text, remainingCharCount);
    let continuationAccumulated = '';
    finishReason = '';

    try {
      const continuationText = await stream(
        systemPrompt,
        continuationPrompt,
        (_chunk, accumulated) => {
          continuationAccumulated = accumulated;
          onProgress(text + accumulated);
        },
        {
          model,
          temperature: 0.7,
          maxOutputTokens: buildContinuationTokenBudget(remainingCharCount),
          enableWebSearch,
          signal,
          onFinish: (reason) => { finishReason = reason; },
        },
      );
      text += continuationText;
      continuationCount += 1;
    } catch (error) {
      if (signal.aborted) throw error;
      if (continuationAccumulated) {
        text += continuationAccumulated;
      }
      onContinuationError?.({
        attempt: attempt + 1,
        maxAttempts: maxContinuations,
        currentText: text,
        error,
      });
      break;
    }
  }

  return {
    text,
    finishReason,
    continuationCount,
    severeShortfall: text.length < targetCharCount * HARD_MIN_COMPLETION_RATIO,
  };
}

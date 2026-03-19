import { splitScenesLocally } from '../services/gemini/scriptAnalysis';
import { VideoFormat } from '../types';
import type { ProjectConfig, Scene, ScriptLine, WhisperSegment } from '../types';

const TIMING_TOLERANCE_SEC = 0.25;

function normalizeTextForMatch(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

function getNormalizedLength(text: string): number {
  return Math.max(1, normalizeTextForMatch(text).length);
}

function getSegmentDuration(segment: WhisperSegment): number {
  const diff = segment.endTime - segment.startTime;
  return diff > 0 ? diff : 0;
}

function applyTargetSceneCount(sceneTexts: string[], targetSceneCount?: number | null): string[] {
  if (!targetSceneCount || targetSceneCount <= 0 || sceneTexts.length <= targetSceneCount) {
    return sceneTexts;
  }

  const merged: string[] = [];
  const groupSize = sceneTexts.length / targetSceneCount;

  for (let i = 0; i < targetSceneCount; i++) {
    const start = Math.floor(i * groupSize);
    const end = Math.floor((i + 1) * groupSize);
    const chunk = sceneTexts.slice(start, end > start ? end : start + 1).join(' ').trim();
    if (chunk) merged.push(chunk);
  }

  return merged.length > 0 ? merged : sceneTexts;
}

export function isUploadedTranscriptConfig(
  config: ProjectConfig | null,
): config is ProjectConfig & { rawUploadedTranscriptSegments: WhisperSegment[] } {
  return !!config
    && config.narrationSource === 'uploaded-audio'
    && Array.isArray(config.rawUploadedTranscriptSegments)
    && config.rawUploadedTranscriptSegments.length > 0;
}

export function getUploadedTranscriptScriptFromSegments(segments: WhisperSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join('\n');
}

function isConfigScriptCompatible(config: ProjectConfig & { rawUploadedTranscriptSegments: WhisperSegment[] }): boolean {
  const rawScript = normalizeTextForMatch(getUploadedTranscriptScriptFromSegments(config.rawUploadedTranscriptSegments));
  const currentScript = normalizeTextForMatch(config.script || '');
  return !rawScript || !currentScript || rawScript === currentScript;
}

export function getUploadedTranscriptDurationSec(segments: WhisperSegment[]): number {
  return segments.reduce((max, segment) => Math.max(max, segment.endTime || 0), 0);
}

export function buildUploadedTranscriptLines(
  config: ProjectConfig | null,
  speakerId = '',
): ScriptLine[] | null {
  if (!isUploadedTranscriptConfig(config)) return null;

  const uploadedAudioId = config.uploadedAudioId || 'uploaded-restored';
  const ts = Date.now();

  return config.rawUploadedTranscriptSegments.map((segment, index) => ({
    id: `line-uploaded-${ts}-${index}`,
    speakerId,
    text: segment.text,
    index,
    startTime: segment.startTime,
    endTime: segment.endTime,
    duration: Math.max(0, segment.endTime - segment.startTime),
    audioSource: 'uploaded',
    uploadedAudioId,
    ttsStatus: 'idle',
  }));
}

export function buildUploadedTranscriptScenes(
  config: ProjectConfig | null,
  targetSceneCount?: number | null,
): Scene[] | null {
  if (!isUploadedTranscriptConfig(config) || !isConfigScriptCompatible(config)) return null;

  const rawSegments = config.rawUploadedTranscriptSegments
    .filter((segment) => segment.text.trim())
    .sort((a, b) => a.startTime - b.startTime);

  if (rawSegments.length === 0) return null;

  const transcriptScript = getUploadedTranscriptScriptFromSegments(rawSegments);
  const format = config.videoFormat || VideoFormat.SHORT;
  const smartSplit = config.smartSplit ?? true;
  const longFormSplitType = format === VideoFormat.LONG ? config.longFormSplitType : undefined;
  const initialSceneTexts = splitScenesLocally(transcriptScript, format, smartSplit, longFormSplitType);
  const sceneTexts = applyTargetSceneCount(initialSceneTexts, targetSceneCount ?? config.targetSceneCount ?? null);
  if (sceneTexts.length === 0) return null;

  const prepared = rawSegments.map((segment) => ({
    ...segment,
    normalizedLength: getNormalizedLength(segment.text),
    duration: getSegmentDuration(segment),
  }));

  const lastEndTime = prepared[prepared.length - 1]?.endTime || 0;
  let segmentIndex = 0;
  let segmentConsumed = 0;

  return sceneTexts.map((sceneText, index) => {
    const targetLength = getNormalizedLength(sceneText);
    let remaining = targetLength;
    let sceneStart: number | undefined;
    let sceneEnd: number | undefined;

    while (remaining > 0 && segmentIndex < prepared.length) {
      const segment = prepared[segmentIndex];
      const remainingInSegment = Math.max(0, segment.normalizedLength - segmentConsumed);
      if (remainingInSegment <= 0) {
        segmentIndex += 1;
        segmentConsumed = 0;
        continue;
      }

      const consumeLength = Math.min(remainingInSegment, remaining);
      const startRatio = segmentConsumed / segment.normalizedLength;
      const endRatio = (segmentConsumed + consumeLength) / segment.normalizedLength;
      const partStart = segment.duration > 0 ? segment.startTime + (segment.duration * startRatio) : segment.startTime;
      const partEnd = segment.duration > 0 ? segment.startTime + (segment.duration * endRatio) : segment.endTime;

      if (sceneStart === undefined) sceneStart = partStart;
      sceneEnd = partEnd;

      remaining -= consumeLength;
      segmentConsumed += consumeLength;

      if (segmentConsumed >= segment.normalizedLength) {
        segmentIndex += 1;
        segmentConsumed = 0;
      }
    }

    const startTime = sceneStart ?? (index === 0 ? 0 : lastEndTime);
    const endTime = sceneEnd ?? startTime;

    return {
      id: `uploaded-scene-${index}`,
      scriptText: sceneText.trim(),
      audioScript: sceneText.trim(),
      visualPrompt: '',
      visualDescriptionKO: '',
      characterPresent: false,
      startTime,
      endTime,
      audioDuration: Math.max(0, endTime - startTime),
      isGeneratingImage: false,
      isGeneratingVideo: false,
      isNativeHQ: false,
      seedanceDuration: '8',
    };
  });
}

export function areUploadedTranscriptScenesSynced(existingScenes: Scene[], plannedScenes: Scene[]): boolean {
  if (existingScenes.length !== plannedScenes.length) return false;

  return plannedScenes.every((planned, index) => {
    const current = existingScenes[index];
    if (!current) return false;

    const currentText = normalizeTextForMatch(current.scriptText || current.audioScript || '');
    const plannedText = normalizeTextForMatch(planned.scriptText || planned.audioScript || '');
    const currentStart = current.startTime ?? 0;
    const currentEnd = current.endTime ?? (currentStart + (current.audioDuration || 0));
    const plannedStart = planned.startTime ?? 0;
    const plannedEnd = planned.endTime ?? (plannedStart + (planned.audioDuration || 0));

    return currentText === plannedText
      && Math.abs(currentStart - plannedStart) <= TIMING_TOLERANCE_SEC
      && Math.abs(currentEnd - plannedEnd) <= TIMING_TOLERANCE_SEC;
  });
}

import type { Scene } from '../types';

type SceneTextLike = Partial<Pick<Scene, 'scriptText' | 'audioScript' | 'visualDescriptionKO' | 'visualPrompt'>> & {
  narration?: string;
  script?: string;
};

const toTrimmedText = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

export function getSceneNarrationText(scene?: SceneTextLike | null): string {
  if (!scene) return '';
  const candidates = [
    scene.scriptText,
    scene.audioScript,
    scene.narration,
    scene.script,
  ];
  return candidates.map(toTrimmedText).find(Boolean) || '';
}

export function getScenePrimaryText(scene?: SceneTextLike | null): string {
  if (!scene) return '';
  const candidates = [
    getSceneNarrationText(scene),
    scene.visualDescriptionKO,
    scene.visualPrompt,
  ];
  return candidates.map(toTrimmedText).find(Boolean) || '';
}

export function hasSceneNarrationText(scene?: SceneTextLike | null): boolean {
  return getSceneNarrationText(scene).length > 0;
}

export function buildSceneSearchQuery(scene?: SceneTextLike | null, tokenCount = 3): string {
  return getSceneNarrationText(scene)
    .split(/[,.\s]+/)
    .filter(Boolean)
    .slice(0, tokenCount)
    .join(' ');
}

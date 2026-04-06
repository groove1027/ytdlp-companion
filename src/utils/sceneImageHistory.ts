import type { Scene } from '../types';

type SceneImageHistoryTarget = Pick<Scene, 'imageUrl' | 'previousSceneImageUrl'> | null | undefined;

export const getPreviousSceneImageUrlForReplace = (
  scene: SceneImageHistoryTarget,
  nextImageUrl?: string | null,
): string | undefined => {
  if (!scene) return undefined;
  if (!nextImageUrl || !scene.imageUrl || scene.imageUrl === nextImageUrl) {
    return scene.previousSceneImageUrl;
  }
  return scene.imageUrl;
};

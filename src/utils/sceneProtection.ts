import type { Scene } from '../types';

export function hasProtectedSceneMedia(scene: Scene): boolean {
  const hasProtectedAudioTiming = (
    typeof scene.audioDuration === 'number'
    && Number.isFinite(scene.audioDuration)
    && scene.audioDuration > 0
  ) || (
    typeof scene.startTime === 'number'
    && Number.isFinite(scene.startTime)
    && typeof scene.endTime === 'number'
    && Number.isFinite(scene.endTime)
    && scene.endTime > scene.startTime
  );

  return !!(
    scene.isGeneratingImage
    || scene.isGeneratingVideo
    || scene.isUpscaling
    || hasProtectedAudioTiming
    || scene.imageUrl
    || scene.previousSceneImageUrl
    || scene.videoUrl
    || scene.previousVideoUrl
    || scene.audioUrl
    || scene.referenceImage
    || scene.sourceVideoUrl
    || scene.sourceFrameUrl
    || scene.startFrameUrl
    || scene.endFrameUrl
    || scene.editedStartFrameUrl
    || scene.editedEndFrameUrl
    || scene.communityMediaItem
    || (scene.videoReferences && scene.videoReferences.length > 0)
  );
}

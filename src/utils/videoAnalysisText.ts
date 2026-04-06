import type {
  VideoAnalysisPreset,
  VideoSceneRow,
  VideoVersionItem,
} from '../types';

const DIALOGUE_PRIORITY_PRESETS = new Set<VideoAnalysisPreset>(['snack', 's2s', 'l2s']);

export function getVideoAnalysisPrimaryText(
  scene: Pick<VideoSceneRow, 'audioContent' | 'dialogue' | 'sceneDesc'>,
  preset?: VideoAnalysisPreset | null,
): string {
  const text = preset && DIALOGUE_PRIORITY_PRESETS.has(preset)
    ? (scene.dialogue || scene.audioContent || scene.sceneDesc || '')
    : (scene.audioContent || scene.dialogue || scene.sceneDesc || '');
  return text.trim();
}

export function buildVideoAnalysisEditTableText(
  version: Pick<VideoVersionItem, 'title' | 'concept' | 'scenes'>,
  preset?: VideoAnalysisPreset | null,
): string {
  return `제목: ${version.title}\n컨셉: ${version.concept}\n\n| 순서 | 모드 | 오디오 내용 | 예상 시간 | 비디오 화면 지시 | 타임코드 소스 |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`
    + version.scenes.map(scene =>
      `| ${scene.cutNum} | ${scene.mode} | ${getVideoAnalysisPrimaryText(scene, preset)} | ${scene.duration} | ${scene.videoDirection} | ${scene.timecodeSource} |`
    ).join('\n');
}

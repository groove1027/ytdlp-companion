/**
 * 영상분석 버전에서 대본 스타일 프리셋 생성 (#158)
 * VideoVersionItem → VideoAnalysisStylePreset 변환 유틸
 */
import type { VideoVersionItem, VideoAnalysisPreset, VideoAnalysisStylePreset } from '../types';

const PRESET_META: Record<VideoAnalysisPreset, { icon: string; label: string }> = {
  tikitaka: { icon: '🔀', label: '티키타카' },
  snack: { icon: '🍿', label: '스낵편집' },
  condensed: { icon: '📦', label: '요약압축' },
  deep: { icon: '🔬', label: '딥분석' },
  shopping: { icon: '🛒', label: '쇼핑' },
  alltts: { icon: '🎙️', label: 'ALL-TTS' },
  dubbing: { icon: '🗣️', label: '더빙번역' },
  s2s: { icon: '⚡', label: '숏투숏' },
  l2s: { icon: '🥪', label: '롱투숏' },
};

const MAX_NARRATION_CHARS = 2000;

function getPresetSampleText(
  scene: VideoVersionItem['scenes'][number],
  preset: VideoAnalysisPreset,
): string {
  return preset === 'snack' || preset === 's2s' || preset === 'l2s'
    ? (scene.dialogue || scene.audioContent || scene.sceneDesc || '')
    : (scene.audioContent || scene.dialogue || scene.sceneDesc || '');
}

/** 버전의 scenes에서 대사/나레이션 텍스트 추출 */
function extractNarration(version: VideoVersionItem, preset: VideoAnalysisPreset): string {
  if (!version.scenes?.length) return '';
  const lines = version.scenes
    .map((scene) => getPresetSampleText(scene, preset))
    .filter(Boolean);
  const joined = lines.join('\n');
  return joined.length > MAX_NARRATION_CHARS
    ? joined.slice(0, MAX_NARRATION_CHARS) + '…'
    : joined;
}

/** VideoVersionItem → VideoAnalysisStylePreset */
export function buildVideoAnalysisStylePreset(
  version: VideoVersionItem,
  preset: VideoAnalysisPreset,
  slotName: string,
): VideoAnalysisStylePreset {
  const meta = PRESET_META[preset] || { icon: '📹', label: preset };
  const narration = extractNarration(version, preset);

  const systemPrompt = `당신은 대본 스타일 변환 전문가입니다.
아래 [참고 대본]의 스타일(말투, 어미, 문장 구조, 호흡, 톤, 감정 표현 방식)을 정밀하게 분석하고,
사용자가 제공하는 대본을 동일한 스타일로 재작성하십시오.

[참고 대본 정보]
- 편집 프리셋: ${meta.label}
- 컨셉: ${version.concept || '없음'}
- 제목: ${version.title}

[참고 대본 샘플]
${narration}

[스타일 변환 규칙]
1. 참고 대본의 어미 패턴(~음, ~함, ~입니다, ~죠 등)을 분석하여 동일하게 적용
2. 문장 길이와 호흡을 참고 대본과 유사하게 유지
3. 참고 대본의 톤(유머, 진지, 냉소, 감성 등)을 정확히 복제
4. 핵심 내용과 주제는 유지하되, 문체만 변환
5. 참고 대본에서 사용된 효과자막/연출 기법이 있으면 동일하게 활용
6. 순수 대본 텍스트만 출력 (마크다운 서식 금지)`;

  return {
    id: `va-${preset}-${Date.now()}`,
    name: `${meta.icon} ${meta.label} V${version.id}`,
    icon: meta.icon,
    description: `영상분석 "${slotName}" — ${meta.label} 스타일`,
    systemPrompt,
    sourcePreset: preset,
    sourceVersionId: version.id,
    sourceTitle: slotName,
  };
}

import {
  ppro,
  type Action,
  type Component,
  type ComponentParam,
  type CompoundAction,
  type PointF,
  type Project,
  type Sequence,
  type TickTime,
  type VideoClipTrackItem
} from "./ppro";
import { PRESET_DEFS, type PresetId } from "./presets";
import { calcFrameCoverageScale } from "./overscale";

export type SelectedClip = {
  id: string;
  name: string;
  trackIdx: number;
  clipIdx: number;
  start: number;
  end: number;
  dur: number;
  mediaPath: string;
};

export type MotionAssignment = {
  trackIdx: number;
  clipIdx: number;
  presetId: PresetId;
  anchorX: number;
  anchorY: number;
  intensity: number;
};

export type MotionBatchResult = {
  idx: number;
  clip: number;
  presetId: PresetId;
  result: string;
};

type MotionBaseline = {
  scale: number;
  position: {
    x: number;
    y: number;
  };
  rotation: number;
};

const MOTION_COMPONENT_NAMES = [
  "Motion",
  "运动",
  "모션",
  "Mouvement",
  "Bewegung",
  "Movimiento",
  "Movimento",
  "Beweging"
];

const SCALE_PARAM_NAMES = [
  "Scale",
  "비율",
  "Échelle",
  "Skalierung",
  "Scala",
  "Escala",
  "Schaal",
  "缩放"
];

const POSITION_PARAM_NAMES = [
  "Position",
  "位置",
  "위치",
  "Posición",
  "Posição",
  "Posizione",
  "Positie"
];

const ROTATION_PARAM_NAMES = [
  "Rotation",
  "旋转",
  "회전",
  "Drehung",
  "Rotación",
  "Rotação",
  "Rotazione",
  "Rotatie"
];

const UNIFORM_SCALE_NAMES = [
  "Uniform Scale",
  "균등 비율",
  "Mise à l'échelle uniforme"
];

const motionBaselines = new Map<string, MotionBaseline>();

function clampPercent(value: number, fallback = 50): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, value));
}

function clampIntensity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return value;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function isPointF(value: unknown): value is PointF {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "x" in value && "y" in value;
}

function clonePointF(point: PointF): PointF {
  const clone = Object.assign(
    Object.create(Object.getPrototypeOf(point) ?? Object.prototype),
    point
  ) as PointF;
  return clone;
}

function createFallbackPoint(x: number, y: number): PointF {
  return {
    x,
    y,
    distanceTo(point: PointF): number {
      return Math.hypot(this.x - point.x, this.y - point.y);
    }
  };
}

function executeActions(project: Project, label: string, actions: Action[]): boolean {
  if (actions.length === 0) {
    return true;
  }

  return project.executeTransaction((compoundAction: CompoundAction) => {
    for (const action of actions) {
      compoundAction.addAction(action);
    }
  }, label);
}

async function getProjectAndSequence(): Promise<{ project: Project; sequence: Sequence }> {
  const project = await ppro.Project.getActiveProject();
  if (!project) {
    throw new Error("No active project");
  }

  const sequence = await project.getActiveSequence();
  if (!sequence) {
    throw new Error("No active sequence");
  }

  return { project, sequence };
}

async function getClipMediaPath(clip: VideoClipTrackItem): Promise<string> {
  try {
    const projectItem = await clip.getProjectItem();
    const clipProjectItem = ppro.ClipProjectItem.cast(projectItem);
    return await clipProjectItem.getMediaFilePath();
  } catch {
    return "";
  }
}

async function buildClipIdentity(
  sequence: Sequence,
  clip: VideoClipTrackItem,
  trackIdx: number
): Promise<string> {
  const projectItem = await clip.getProjectItem();
  const startTime = await clip.getStartTime();
  const endTime = await clip.getEndTime();

  return [
    sequence.guid,
    trackIdx,
    projectItem.getId(),
    startTime.ticks,
    endTime.ticks
  ].join(":");
}

async function buildSelectedClip(
  sequence: Sequence,
  clip: VideoClipTrackItem,
  trackIdx: number,
  clipIdx: number
): Promise<SelectedClip> {
  const [name, startTime, endTime, duration, mediaPath, id] = await Promise.all([
    clip.getName(),
    clip.getStartTime(),
    clip.getEndTime(),
    clip.getDuration(),
    getClipMediaPath(clip),
    buildClipIdentity(sequence, clip, trackIdx)
  ]);

  return {
    id,
    name,
    trackIdx,
    clipIdx,
    start: startTime.seconds,
    end: endTime.seconds,
    dur: duration.seconds,
    mediaPath
  };
}

export async function getSelectedClips(): Promise<SelectedClip[]> {
  const { sequence } = await getProjectAndSequence();
  const trackCount = await sequence.getVideoTrackCount();
  const selected: SelectedClip[] = [];

  for (let trackIdx = 0; trackIdx < trackCount; trackIdx += 1) {
    const track = await sequence.getVideoTrack(trackIdx);
    const trackItems = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);

    for (let clipIdx = 0; clipIdx < trackItems.length; clipIdx += 1) {
      const clip = trackItems[clipIdx];
      const isSelected = await clip.getIsSelected();
      if (!isSelected) {
        continue;
      }

      selected.push(await buildSelectedClip(sequence, clip, trackIdx, clipIdx));
    }
  }

  return selected;
}

async function getTrackItem(
  sequence: Sequence,
  trackIdx: number,
  clipIdx: number
): Promise<VideoClipTrackItem> {
  const track = await sequence.getVideoTrack(trackIdx);
  const trackItems = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  const clip = trackItems[clipIdx];

  if (!clip) {
    throw new Error(`Clip ${clipIdx} not found on track ${trackIdx}`);
  }

  return clip;
}

async function findMotionComponent(clip: VideoClipTrackItem): Promise<Component | null> {
  const componentChain = await clip.getComponentChain();
  const componentCount = componentChain.getComponentCount();
  const fallback = componentCount > 1 ? componentChain.getComponentAtIndex(1) : null;

  for (let index = 0; index < componentCount; index += 1) {
    const component = componentChain.getComponentAtIndex(index);
    const displayName = await component.getDisplayName();
    if (MOTION_COMPONENT_NAMES.includes(displayName)) {
      return component;
    }
  }

  return fallback;
}

async function findParam(
  component: Component,
  names: string[],
  fallbackIndex?: number
): Promise<ComponentParam | null> {
  const paramCount = component.getParamCount();

  for (let index = 0; index < paramCount; index += 1) {
    const param = component.getParam(index);
    if (names.includes(param.displayName)) {
      return param;
    }
  }

  if (typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < paramCount) {
    return component.getParam(fallbackIndex);
  }

  return null;
}

async function motionComponentHasAnyKeyframes(component: Component): Promise<boolean> {
  const paramCount = component.getParamCount();

  for (let index = 0; index < paramCount; index += 1) {
    const param = component.getParam(index);
    try {
      if (param.isTimeVarying()) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

async function readScalarValue(
  param: ComponentParam | null,
  fallback: number
): Promise<number> {
  if (!param) {
    return fallback;
  }

  try {
    const keyframe = await param.getStartValue();
    const value = keyframe.value.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function readPointValue(
  param: ComponentParam | null,
  referenceTime: TickTime,
  fallback: { x: number; y: number }
): Promise<{ x: number; y: number }> {
  if (!param) {
    return fallback;
  }

  try {
    const point = await param.getValueAtTime(referenceTime);
    if (isPointF(point)) {
      return { x: point.x, y: point.y };
    }
  } catch {
    // Fall through to start value.
  }

  try {
    const keyframe = await param.getStartValue();
    const point = keyframe.value.value;
    if (isPointF(point)) {
      return { x: point.x, y: point.y };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function createPointValue(
  param: ComponentParam,
  referenceTime: TickTime,
  x: number,
  y: number
): Promise<PointF> {
  try {
    const currentValue = await param.getValueAtTime(referenceTime);
    if (isPointF(currentValue)) {
      const point = clonePointF(currentValue);
      point.x = x;
      point.y = y;
      return point;
    }
  } catch {
    // Fall through to start value.
  }

  try {
    const keyframe = await param.getStartValue();
    const pointValue = keyframe.value.value;
    if (isPointF(pointValue)) {
      const point = clonePointF(pointValue);
      point.x = x;
      point.y = y;
      return point;
    }
  } catch {
    return createFallbackPoint(x, y);
  }

  return createFallbackPoint(x, y);
}

async function enableKeyframing(project: Project, param: ComponentParam): Promise<void> {
  const actions = [param.createSetTimeVaryingAction(false)];
  const supportsKeyframes = await param.areKeyframesSupported();
  if (supportsKeyframes) {
    actions.push(param.createSetTimeVaryingAction(true));
  }

  const success = executeActions(project, `enable-${param.displayName}-keyframes`, actions);
  if (!success) {
    throw new Error(`Failed to enable keyframes for ${param.displayName}`);
  }
}

async function resetScalarParam(
  project: Project,
  param: ComponentParam | null,
  value: number
): Promise<void> {
  if (!param) {
    return;
  }

  const keyframe = param.createKeyframe(value);
  const actions = [
    param.createSetTimeVaryingAction(false),
    param.createSetValueAction(keyframe, true)
  ];
  executeActions(project, `reset-${param.displayName}`, actions);
}

async function resetPointParam(
  project: Project,
  param: ComponentParam | null,
  referenceTime: TickTime,
  value: { x: number; y: number }
): Promise<void> {
  if (!param) {
    return;
  }

  const point = await createPointValue(param, referenceTime, value.x, value.y);
  const keyframe = param.createKeyframe(point);
  const actions = [
    param.createSetTimeVaryingAction(false),
    param.createSetValueAction(keyframe, true)
  ];
  executeActions(project, `reset-${param.displayName}`, actions);
}

function getInterpolationMode(presetId: PresetId): number {
  const preset = PRESET_DEFS[presetId];
  return preset.ease === "linear"
    ? ppro.Constants.InterpolationMode.LINEAR
    : ppro.Constants.InterpolationMode.BEZIER;
}

async function addScalarKeyframe(
  project: Project,
  param: ComponentParam,
  value: number,
  timeSeconds: number,
  interpolationMode: number,
  label: string
): Promise<void> {
  const keyframe = param.createKeyframe(value);
  keyframe.position = ppro.TickTime.createWithSeconds(timeSeconds);
  const success = executeActions(project, label, [
    param.createAddKeyframeAction(keyframe),
    param.createSetInterpolationAtKeyframeAction(keyframe.position, interpolationMode)
  ]);

  if (!success) {
    throw new Error(`Failed to add ${param.displayName} keyframe`);
  }
}

async function addPointKeyframe(
  project: Project,
  param: ComponentParam,
  referenceTime: TickTime,
  value: { x: number; y: number },
  timeSeconds: number,
  interpolationMode: number,
  label: string
): Promise<void> {
  const point = await createPointValue(param, referenceTime, value.x, value.y);
  const keyframe = param.createKeyframe(point);
  keyframe.position = ppro.TickTime.createWithSeconds(timeSeconds);
  const success = executeActions(project, label, [
    param.createAddKeyframeAction(keyframe),
    param.createSetInterpolationAtKeyframeAction(keyframe.position, interpolationMode)
  ]);

  if (!success) {
    throw new Error(`Failed to add ${param.displayName} keyframe`);
  }
}

async function applyMotionToClipLocked(
  project: Project,
  sequence: Sequence,
  assignment: MotionAssignment
): Promise<string> {
  const preset = PRESET_DEFS[assignment.presetId];
  if (!preset) {
    return `Error: Preset "${assignment.presetId}" not found`;
  }

  const intensity = clampIntensity(assignment.intensity);
  const anchorX = clampPercent(assignment.anchorX);
  const anchorY = clampPercent(assignment.anchorY);
  const clip = await getTrackItem(sequence, assignment.trackIdx, assignment.clipIdx);
  const motion = await findMotionComponent(clip);

  if (!motion) {
    return "Error: Motion component not found";
  }

  const [scaleParam, uniformScaleParam, positionParam, rotationParam, startTime, endTime, clipId] =
    await Promise.all([
      findParam(motion, SCALE_PARAM_NAMES, 4),
      findParam(motion, UNIFORM_SCALE_NAMES),
      findParam(motion, POSITION_PARAM_NAMES, 1),
      findParam(motion, ROTATION_PARAM_NAMES, 5),
      clip.getStartTime(),
      clip.getEndTime(),
      buildClipIdentity(sequence, clip, assignment.trackIdx)
    ]);

  if (!scaleParam) {
    return "Error: Scale property not found";
  }

  if (uniformScaleParam) {
    try {
      const uniformValue = await uniformScaleParam.getValueAtTime(startTime);
      if (uniformValue === false || uniformValue === 0) {
        return "Skip: Clip uses non-uniform scale — enable Uniform Scale first";
      }
    } catch {
      // Ignore and continue.
    }
  }

  const clipDuration = endTime.seconds - startTime.seconds;
  if (clipDuration <= 0) {
    return "Error: Clip duration is 0";
  }

  const frameSize = await sequence.getFrameSize();
  const seqW = frameSize.width || 1920;
  const seqH = frameSize.height || 1080;
  let baseline = motionBaselines.get(clipId);

  if (!baseline && (await motionComponentHasAnyKeyframes(motion))) {
    return "Skip: Clip has existing Motion keyframes — not touched by Motion Master";
  }

  if (!baseline) {
    baseline = {
      scale: await readScalarValue(scaleParam, 100),
      position: await readPointValue(positionParam, startTime, {
        x: seqW / 2,
        y: seqH / 2
      }),
      rotation: await readScalarValue(rotationParam, 0)
    };
    motionBaselines.set(clipId, baseline);
  }

  let hasPositionMotion = anchorX !== 50 || anchorY !== 50;
  let hasRotationMotion = false;

  for (const frame of preset.frames) {
    if (!hasPositionMotion && (Math.abs(frame.tx) > 0.001 || Math.abs(frame.ty) > 0.001)) {
      hasPositionMotion = true;
    }
    if (!hasRotationMotion && Math.abs(frame.r) > 0.01) {
      hasRotationMotion = true;
    }
  }

  await enableKeyframing(project, scaleParam);
  if (hasRotationMotion) {
    if (rotationParam) {
      await enableKeyframing(project, rotationParam);
    }
  } else {
    await resetScalarParam(project, rotationParam, baseline.rotation);
  }

  if (hasPositionMotion) {
    if (positionParam) {
      await enableKeyframing(project, positionParam);
    }
  } else {
    await resetPointParam(project, positionParam, startTime, baseline.position);
  }

  const presetDuration = preset.dur > 0 ? preset.dur : clipDuration;
  const effectiveDuration = Math.min(clipDuration, presetDuration);
  const interpolationMode = getInterpolationMode(assignment.presetId);
  let maxAppliedScale = 0;
  let appliedCount = 0;
  const warnings: string[] = [];

  for (let frameIndex = 0; frameIndex < preset.frames.length; frameIndex += 1) {
    const frame = preset.frames[frameIndex];
    const ratio = preset.frames.length > 1 ? frameIndex / (preset.frames.length - 1) : 0;
    const timeSeconds = startTime.seconds + (effectiveDuration * ratio);
    const scaleDelta = (frame.s - 1) * intensity;
    const presetScale = 1 + scaleDelta;
    const coverageScale = calcFrameCoverageScale(frame, anchorX, anchorY, intensity, seqW, seqH);
    const finalScale = baseline.scale * Math.max(presetScale, coverageScale);

    if (finalScale > maxAppliedScale) {
      maxAppliedScale = finalScale;
    }

    try {
      await addScalarKeyframe(
        project,
        scaleParam,
        finalScale,
        timeSeconds,
        interpolationMode,
        "add-motion-scale-keyframe"
      );
      appliedCount += 1;
    } catch (error) {
      warnings.push(`scale@${timeSeconds.toFixed(2)}:${toErrorMessage(error)}`);
    }

    if (positionParam && hasPositionMotion) {
      try {
        const anchorOffsetX = ((50 - anchorX) / 100) * seqW;
        const anchorOffsetY = ((50 - anchorY) / 100) * seqH;
        const panX = baseline.position.x + ((frame.tx * intensity) / 100 * seqW) + anchorOffsetX;
        const panY = baseline.position.y + ((frame.ty * intensity) / 100 * seqH) + anchorOffsetY;

        await addPointKeyframe(
          project,
          positionParam,
          startTime,
          { x: panX, y: panY },
          timeSeconds,
          interpolationMode,
          "add-motion-position-keyframe"
        );
      } catch (error) {
        warnings.push(`pos@${timeSeconds.toFixed(2)}:${toErrorMessage(error)}`);
      }
    }

    if (rotationParam && hasRotationMotion) {
      try {
        await addScalarKeyframe(
          project,
          rotationParam,
          baseline.rotation + (frame.r * intensity),
          timeSeconds,
          interpolationMode,
          "add-motion-rotation-keyframe"
        );
      } catch (error) {
        warnings.push(`rot@${timeSeconds.toFixed(2)}:${toErrorMessage(error)}`);
      }
    }
  }

  let result = `OK:${assignment.presetId}:${Math.round(maxAppliedScale)}%:kf=${appliedCount}`;
  if (warnings.length > 0) {
    result += `:warn=${warnings.join(";")}`;
  }

  return result;
}

export async function applyMotionBatch(
  assignments: MotionAssignment[]
): Promise<MotionBatchResult[]> {
  const { project, sequence } = await getProjectAndSequence();
  const results: MotionBatchResult[] = [];

  await project.lockedAccess(async () => {
    for (let index = 0; index < assignments.length; index += 1) {
      const assignment = assignments[index];
      const result = await applyMotionToClipLocked(project, sequence, assignment);
      results.push({
        idx: index,
        clip: assignment.clipIdx,
        presetId: assignment.presetId,
        result
      });
    }
  });

  return results;
}

export async function removeMotionFromSelected(): Promise<string> {
  const { project, sequence } = await getProjectAndSequence();
  const selected = await getSelectedClips();

  if (selected.length === 0) {
    return "Error: No clips selected";
  }

  let count = 0;
  let skipped = 0;

  await project.lockedAccess(async () => {
    for (const selectedClip of selected) {
      const clip = await getTrackItem(sequence, selectedClip.trackIdx, selectedClip.clipIdx);
      const clipId = await buildClipIdentity(sequence, clip, selectedClip.trackIdx);
      const baseline = motionBaselines.get(clipId);

      if (!baseline) {
        skipped += 1;
        continue;
      }

      const motion = await findMotionComponent(clip);
      if (!motion) {
        skipped += 1;
        continue;
      }

      const [scaleParam, positionParam, rotationParam, startTime] = await Promise.all([
        findParam(motion, SCALE_PARAM_NAMES, 4),
        findParam(motion, POSITION_PARAM_NAMES, 1),
        findParam(motion, ROTATION_PARAM_NAMES, 5),
        clip.getStartTime()
      ]);

      await resetScalarParam(project, scaleParam, baseline.scale);
      await resetScalarParam(project, rotationParam, baseline.rotation);
      await resetPointParam(project, positionParam, startTime, baseline.position);

      motionBaselines.delete(clipId);
      count += 1;
    }
  });

  if (skipped > 0) {
    return `Warn: Removed motion from ${count} clip(s); skipped ${skipped} (no baseline — use Premiere Undo)`;
  }

  return `Removed motion from ${count} clip(s)`;
}

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { BottomBar } from "./components/BottomBar";
import { ClipList } from "./components/ClipList";
import { EffectTags } from "./components/EffectTags";
import { AnchorPad } from "./components/AnchorPad";
import { IntensitySlider } from "./components/IntensitySlider";
import { PresetGrid } from "./components/PresetGrid";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { useMotionEngine } from "./hooks/useMotionEngine";
import { useSelectedClips } from "./hooks/useSelectedClips";
import { detectFocalBatch } from "./lib/focalDetector";
import type { MotionAssignment } from "./lib/motionEngine";
import { calcOverscale } from "./lib/overscale";
import {
  MOTION_EFFECTS,
  PANZOOM_PRESETS,
  getPresetMeta,
  type PresetId
} from "./lib/presets";
import {
  smartRandomAssign,
  type SmartRandomAssignment
} from "./lib/smartRandom";

const DEFAULT_PRESET: PresetId = "cinematic";

function buildClipSignature(clips: { id: string }[]): string {
  return clips.map((clip) => clip.id).join("|");
}

export function App() {
  const { clips, error, isLoading, refresh } = useSelectedClips();
  const { busy, status, setStatus, applyBatch, removeSelected } = useMotionEngine();
  const [currentPreset, setCurrentPreset] = useState<PresetId>(DEFAULT_PRESET);
  const [currentMotion, setCurrentMotion] = useState<PresetId | null>(null);
  const [anchorX, setAnchorX] = useState(50);
  const [anchorY, setAnchorY] = useState(50);
  const [intensity, setIntensity] = useState(1);
  const [allowMotionEffects, setAllowMotionEffects] = useState(false);
  const [assignments, setAssignments] = useState<SmartRandomAssignment[]>([]);
  const deferredClips = useDeferredValue(clips);
  const activePresetId = currentMotion ?? currentPreset;
  const activeMeta = getPresetMeta(activePresetId);
  const overscale = Math.round(
    calcOverscale(activePresetId, 1920, 1080, anchorX, anchorY, intensity) * 100
  );

  useEffect(() => {
    if (!error) {
      return;
    }

    setStatus({
      tone: "warning",
      message: error
    });
  }, [error, setStatus]);

  useEffect(() => {
    startTransition(() => {
      setAssignments([]);
    });
  }, [buildClipSignature(deferredClips)]);

  function buildAssignmentsFromPreview(preview: SmartRandomAssignment[]): MotionAssignment[] {
    return deferredClips.map((clip, index) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId: preview[index].presetId,
      anchorX: preview[index].anchorX,
      anchorY: preview[index].anchorY,
      intensity: preview[index].intensity
    }));
  }

  function buildManualAssignments(): MotionAssignment[] {
    return deferredClips.map((clip) => ({
      trackIdx: clip.trackIdx,
      clipIdx: clip.clipIdx,
      presetId: activePresetId,
      anchorX,
      anchorY,
      intensity
    }));
  }

  async function handleRefresh(): Promise<void> {
    const nextClips = await refresh(false);
    setStatus({
      tone: nextClips.length > 0 ? "success" : "warning",
      message: nextClips.length > 0
        ? `${nextClips.length} clip(s) synced from the timeline`
        : "Select clips in Premiere to begin."
    });
  }

  async function handleApply(): Promise<void> {
    startTransition(() => {
      setAssignments([]);
    });
    await applyBatch(buildManualAssignments());
  }

  async function handleRandom(): Promise<void> {
    if (deferredClips.length === 0) {
      setStatus({
        tone: "warning",
        message: "Select clips in Premiere to randomize them."
      });
      return;
    }

    const generated = smartRandomAssign(deferredClips.length, {
      allowMotionEffects,
      intensityVariance: 0.1
    });

    startTransition(() => {
      setAssignments(generated);
    });

    await applyBatch(buildAssignmentsFromPreview(generated));
  }

  async function handleSmart(): Promise<void> {
    if (deferredClips.length === 0) {
      setStatus({
        tone: "warning",
        message: "Select clips in Premiere to analyze focal points."
      });
      return;
    }

    setStatus({
      tone: "info",
      message: "Analyzing focal points from source media..."
    });

    const generated = smartRandomAssign(deferredClips.length, {
      allowMotionEffects,
      intensityVariance: 0.1
    });
    const focalPoints = await detectFocalBatch(deferredClips.map((clip) => clip.mediaPath));
    const resolved = generated.map((assignment, index) => {
      const focal = focalPoints[index];
      if (focal && focal.confidence > 0.3) {
        return {
          ...assignment,
          anchorX: focal.x,
          anchorY: focal.y
        };
      }
      return assignment;
    });

    startTransition(() => {
      setAssignments(resolved);
    });

    await applyBatch(buildAssignmentsFromPreview(resolved));
  }

  async function handleRemove(): Promise<void> {
    startTransition(() => {
      setAssignments([]);
    });
    await removeSelected();
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        <Toolbar
          busy={busy}
          clipCount={deferredClips.length}
          onRefresh={handleRefresh}
          onApply={handleApply}
          onRandom={handleRandom}
          onSmart={handleSmart}
          onUndo={handleRemove}
        />

        <StatusBar busy={busy} status={status} />

        <ClipList
          clips={deferredClips}
          assignments={assignments}
          loading={isLoading}
        />

        <PresetGrid
          presets={PANZOOM_PRESETS}
          currentPresetId={currentPreset}
          anchorX={anchorX}
          anchorY={anchorY}
          intensity={intensity}
          onSelectPreset={(presetId) => {
            setCurrentPreset(presetId);
            setCurrentMotion(null);
          }}
        />

        <EffectTags
          effects={MOTION_EFFECTS}
          activeMotionId={currentMotion}
          allowMotionEffects={allowMotionEffects}
          onSelectMotion={(presetId) => {
            setCurrentMotion((previous) => previous === presetId ? null : presetId);
          }}
          onToggleAllowMotionEffects={setAllowMotionEffects}
        />

        <AnchorPad
          anchorX={anchorX}
          anchorY={anchorY}
          onChange={(nextX, nextY) => {
            setAnchorX(nextX);
            setAnchorY(nextY);
          }}
        />

        <IntensitySlider intensity={intensity} onChange={setIntensity} />
      </div>

      <BottomBar
        activeLabel={activeMeta?.label ?? activePresetId}
        busy={busy}
        overscale={overscale}
        selectedCount={deferredClips.length}
        onApply={handleApply}
      />
    </div>
  );
}

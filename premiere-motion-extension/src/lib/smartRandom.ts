import { calcOverscale } from "./overscale";
import { PANZOOM_PRESETS, type PresetId } from "./presets";

export type SmartRandomAssignment = {
  presetId: PresetId;
  anchorX: number;
  anchorY: number;
  intensity: number;
  motionEffect: PresetId | "none";
  overscale: number;
};

export type SmartRandomOptions = {
  allowMotionEffects?: boolean;
  intensityVariance?: number;
};

export type FocalPoint = {
  x: number;
  y: number;
  confidence: number;
};

const ANCHOR_RULES: Record<string, { x: [number, number]; y: [number, number] }> = {
  fast: { x: [35, 65], y: [35, 55] },
  smooth: { x: [35, 65], y: [35, 55] },
  cinematic: { x: [40, 60], y: [30, 50] },
  dynamic: { x: [30, 70], y: [30, 60] },
  dreamy: { x: [40, 60], y: [40, 60] },
  dramatic: { x: [35, 65], y: [35, 60] },
  zoom: { x: [35, 65], y: [35, 55] },
  reveal: { x: [35, 65], y: [30, 55] },
  vintage: { x: [35, 65], y: [40, 60] },
  documentary: { x: [10, 30], y: [40, 60] },
  timelapse: { x: [70, 90], y: [40, 60] },
  vlog: { x: [40, 60], y: [40, 55] },
  "diagonal-drift": { x: [25, 45], y: [25, 45] },
  orbit: { x: [40, 60], y: [40, 60] },
  parallax: { x: [30, 50], y: [35, 55] },
  "tilt-shift": { x: [40, 60], y: [30, 45] },
  "spiral-in": { x: [40, 60], y: [35, 55] },
  "push-pull": { x: [30, 70], y: [30, 70] },
  "dolly-zoom": { x: [35, 65], y: [35, 60] },
  "crane-up": { x: [40, 60], y: [60, 80] },
  noir: { x: [35, 65], y: [35, 55] }
};

const RULE_OF_THIRDS = [
  { x: 33, y: 33 },
  { x: 66, y: 33 },
  { x: 50, y: 50 },
  { x: 33, y: 66 },
  { x: 66, y: 66 }
];

const ZOOM_IN_PRESETS = new Set<PresetId>([
  "fast",
  "smooth",
  "zoom",
  "vintage",
  "noir",
  "sepia",
  "spiral-in",
  "slow"
]);

const ZOOM_OUT_PRESETS = new Set<PresetId>(["cinematic", "reveal"]);
const PAN_LEFT_PRESETS = new Set<PresetId>(["documentary", "parallax"]);
const PAN_RIGHT_PRESETS = new Set<PresetId>(["timelapse"]);
const RANDOM_MOTION_EFFECT_PRESETS: PresetId[] = ["slow", "micro", "rotate", "film"];
const RANDOM_MOTION_EFFECT_PRESET_SET = new Set<PresetId>(RANDOM_MOTION_EFFECT_PRESETS);

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function getAnchorForPreset(presetId: PresetId): { x: number; y: number } {
  const rule = ANCHOR_RULES[presetId];
  if (rule) {
    return {
      x: randInt(rule.x[0], rule.x[1]),
      y: randInt(rule.y[0], rule.y[1])
    };
  }

  return pickRandom(RULE_OF_THIRDS);
}

export function smartRandomAssign(
  clipCount: number,
  options: SmartRandomOptions = {}
): SmartRandomAssignment[] {
  const {
    allowMotionEffects = false,
    intensityVariance = 0.1
  } = options;

  const availablePresets = PANZOOM_PRESETS.map((preset) => preset.id);
  const assignments: SmartRandomAssignment[] = [];
  let prevPreset: PresetId | null = null;
  let lastZoomDir: "in" | "out" | null = null;
  let lastPanDir: "left" | "right" | null = null;

  for (let index = 0; index < clipCount; index += 1) {
    let preset: PresetId = availablePresets[0];
    let attempts = 0;
    const candidatePool =
      allowMotionEffects && Math.random() > 0.5
        ? RANDOM_MOTION_EFFECT_PRESETS
        : availablePresets;

    do {
      preset = pickRandom(candidatePool);
      attempts += 1;

      if (preset === prevPreset && attempts < 20) {
        continue;
      }
      if (lastZoomDir === "in" && ZOOM_IN_PRESETS.has(preset) && attempts < 15) {
        continue;
      }
      if (lastZoomDir === "out" && ZOOM_OUT_PRESETS.has(preset) && attempts < 15) {
        continue;
      }
      if (lastPanDir === "left" && PAN_LEFT_PRESETS.has(preset) && attempts < 15) {
        continue;
      }
      if (lastPanDir === "right" && PAN_RIGHT_PRESETS.has(preset) && attempts < 15) {
        continue;
      }

      break;
    } while (attempts < 30);

    if (ZOOM_IN_PRESETS.has(preset)) {
      lastZoomDir = "in";
    } else if (ZOOM_OUT_PRESETS.has(preset)) {
      lastZoomDir = "out";
    }

    if (PAN_LEFT_PRESETS.has(preset)) {
      lastPanDir = "left";
    } else if (PAN_RIGHT_PRESETS.has(preset)) {
      lastPanDir = "right";
    }

    prevPreset = preset;

    const anchor = getAnchorForPreset(preset);
    const intensity = 1 + randFloat(-intensityVariance, intensityVariance);
    const motionEffect = RANDOM_MOTION_EFFECT_PRESET_SET.has(preset) ? preset : "none";

    assignments.push({
      presetId: preset,
      anchorX: anchor.x,
      anchorY: anchor.y,
      intensity: Number.parseFloat(intensity.toFixed(2)),
      motionEffect,
      overscale: Math.round(calcOverscale(preset) * 100)
    });
  }

  return assignments;
}

export function applyFocalPoints(
  assignments: SmartRandomAssignment[],
  focalPoints: FocalPoint[]
): SmartRandomAssignment[] {
  return assignments.map((assignment, index) => {
    const focal = focalPoints[index];
    if (focal && focal.confidence > 0.5) {
      return {
        ...assignment,
        anchorX: Math.round(focal.x),
        anchorY: Math.round(focal.y)
      };
    }

    return assignment;
  });
}

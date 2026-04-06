export type MotionFrame = {
  s: number;
  tx: number;
  ty: number;
  r: number;
};

export type MotionPresetDefinition = {
  frames: MotionFrame[];
  dur: number;
  ease: "bezier" | "linear";
  alt: boolean;
};

export type PresetCategory = "basic" | "cinematic";

export const PRESET_DEFS = {
  fast: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 2, ease: "bezier", alt: true },
  smooth: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 4, ease: "bezier", alt: true },
  cinematic: { frames: [{ s: 1.15, tx: 0, ty: 0, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 5, ease: "bezier", alt: true },
  dynamic: { frames: [{ s: 1, tx: -3, ty: -2, r: 0 }, { s: 1.1, tx: 3, ty: 2, r: 0 }, { s: 1, tx: -3, ty: -2, r: 0 }], dur: 4, ease: "bezier", alt: false },
  dreamy: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.08, tx: 0, ty: 0, r: 0.8 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 6, ease: "bezier", alt: false },
  dramatic: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.18, tx: 0, ty: 0, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 4, ease: "bezier", alt: false },
  zoom: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 3, ease: "bezier", alt: true },
  reveal: { frames: [{ s: 1.18, tx: 0, ty: 0, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 4, ease: "bezier", alt: true },
  vintage: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 6, ease: "bezier", alt: true },
  documentary: { frames: [{ s: 1, tx: 5, ty: 0, r: 0 }, { s: 1, tx: -5, ty: 0, r: 0 }], dur: 6, ease: "linear", alt: true },
  timelapse: { frames: [{ s: 1, tx: -5, ty: 0, r: 0 }, { s: 1, tx: 5, ty: 0, r: 0 }], dur: 2, ease: "linear", alt: true },
  vlog: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.03, tx: 0.08, ty: 0.08, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 3, ease: "bezier", alt: false },
  "diagonal-drift": { frames: [{ s: 1, tx: 4, ty: -4, r: 0 }, { s: 1.06, tx: -4, ty: 4, r: 0 }], dur: 5, ease: "bezier", alt: true },
  orbit: { frames: [{ s: 1.05, tx: 0, ty: -3, r: 0 }, { s: 1.05, tx: 3, ty: 0, r: 0 }, { s: 1.05, tx: 0, ty: 3, r: 0 }, { s: 1.05, tx: -3, ty: 0, r: 0 }, { s: 1.05, tx: 0, ty: -3, r: 0 }], dur: 6, ease: "bezier", alt: false },
  parallax: { frames: [{ s: 1, tx: 3, ty: 0, r: 0 }, { s: 1.1, tx: -3, ty: 0, r: 0 }], dur: 5, ease: "bezier", alt: true },
  "tilt-shift": { frames: [{ s: 1.05, tx: 0, ty: -5, r: 0 }, { s: 1.05, tx: 0, ty: 5, r: 0 }], dur: 5, ease: "bezier", alt: true },
  "spiral-in": { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 3 }], dur: 4, ease: "bezier", alt: true },
  "push-pull": { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.12, tx: 0, ty: 0, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 3, ease: "bezier", alt: false },
  "dolly-zoom": { frames: [{ s: 1.15, tx: 0, ty: 0, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 4, ease: "bezier", alt: false },
  "crane-up": { frames: [{ s: 1, tx: 0, ty: -5, r: 0 }, { s: 1.05, tx: 0, ty: 4, r: 0 }], dur: 5, ease: "bezier", alt: true },
  noir: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 5, ease: "bezier", alt: true },
  slow: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.06, tx: 0, ty: 0, r: 0 }], dur: 6, ease: "bezier", alt: true },
  rotate: { frames: [{ s: 1.05, tx: 0, ty: 0, r: 0 }, { s: 1.05, tx: 0, ty: 0, r: 3 }], dur: 4, ease: "bezier", alt: true },
  "rotate-plus": { frames: [{ s: 1.08, tx: 0, ty: 0, r: 0 }, { s: 1.08, tx: 0, ty: 0, r: 8 }], dur: 3, ease: "bezier", alt: true },
  pan: { frames: [{ s: 1, tx: 5, ty: 0, r: 0 }, { s: 1, tx: -5, ty: 0, r: 0 }], dur: 4, ease: "linear", alt: true },
  micro: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.03, tx: 0.08, ty: 0.08, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 3, ease: "bezier", alt: false },
  sepia: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.15, tx: 0, ty: 0, r: 0 }], dur: 8, ease: "bezier", alt: true },
  film: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1.03, tx: 0.08, ty: 0.08, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 6, ease: "bezier", alt: false },
  shake: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1, tx: -0.3, ty: 0.2, r: 0 }, { s: 1, tx: 0.3, ty: -0.2, r: 0 }, { s: 1, tx: -0.2, ty: 0.3, r: 0 }, { s: 1, tx: 0.2, ty: -0.3, r: 0 }, { s: 1, tx: -0.3, ty: -0.2, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 0.6, ease: "bezier", alt: false },
  glitch: { frames: [{ s: 1, tx: 0, ty: 0, r: 0 }, { s: 1, tx: -0.5, ty: 0.2, r: 0 }, { s: 1, tx: 0.5, ty: -0.2, r: 0 }, { s: 1, tx: -0.3, ty: -0.3, r: 0 }, { s: 1, tx: 0.4, ty: 0.1, r: 0 }, { s: 1, tx: -0.2, ty: 0.4, r: 0 }, { s: 1, tx: 0, ty: 0, r: 0 }], dur: 0.3, ease: "linear", alt: false }
} as const satisfies Record<string, MotionPresetDefinition>;

export type PresetId = keyof typeof PRESET_DEFS;

export type PresetMeta = {
  id: PresetId;
  label: string;
  category: PresetCategory;
  badge: string;
};

export type MotionEffectMeta = {
  id: Extract<PresetId, "slow" | "rotate" | "rotate-plus" | "pan" | "micro" | "sepia" | "film" | "shake" | "glitch">;
  label: string;
  badge: string;
};

export const PANZOOM_PRESETS: PresetMeta[] = [
  { id: "fast", label: "Fast Zoom", category: "basic", badge: "F2" },
  { id: "smooth", label: "Smooth Zoom", category: "basic", badge: "S4" },
  { id: "cinematic", label: "Cinematic", category: "basic", badge: "C5" },
  { id: "zoom", label: "Zoom In", category: "basic", badge: "Z3" },
  { id: "reveal", label: "Reveal", category: "basic", badge: "R4" },
  { id: "vintage", label: "Vintage", category: "basic", badge: "V6" },
  { id: "documentary", label: "Documentary", category: "basic", badge: "D6" },
  { id: "timelapse", label: "Timelapse", category: "basic", badge: "T2" },
  { id: "vlog", label: "Vlog", category: "basic", badge: "V3" },
  { id: "dynamic", label: "Dynamic", category: "cinematic", badge: "D4" },
  { id: "dreamy", label: "Dreamy", category: "cinematic", badge: "DR" },
  { id: "dramatic", label: "Dramatic", category: "cinematic", badge: "DM" },
  { id: "noir", label: "Noir", category: "cinematic", badge: "N5" },
  { id: "diagonal-drift", label: "Diagonal Drift", category: "cinematic", badge: "DD" },
  { id: "orbit", label: "Orbit", category: "cinematic", badge: "O6" },
  { id: "parallax", label: "Parallax", category: "cinematic", badge: "PX" },
  { id: "tilt-shift", label: "Tilt Shift", category: "cinematic", badge: "TS" },
  { id: "spiral-in", label: "Spiral In", category: "cinematic", badge: "SI" },
  { id: "push-pull", label: "Push Pull", category: "cinematic", badge: "PP" },
  { id: "dolly-zoom", label: "Dolly Zoom", category: "cinematic", badge: "DZ" },
  { id: "crane-up", label: "Crane Up", category: "cinematic", badge: "CU" }
];

export const MOTION_EFFECTS: MotionEffectMeta[] = [
  { id: "slow", label: "Slow", badge: "06" },
  { id: "rotate", label: "Rotate", badge: "R3" },
  { id: "rotate-plus", label: "Rotate+", badge: "R8" },
  { id: "pan", label: "Pan", badge: "P4" },
  { id: "micro", label: "Micro", badge: "M3" },
  { id: "sepia", label: "Sepia", badge: "S8" },
  { id: "film", label: "Film", badge: "F6" },
  { id: "shake", label: "Shake", badge: "SK" },
  { id: "glitch", label: "Glitch", badge: "GL" }
];

export function getPresetMeta(presetId: PresetId): PresetMeta | MotionEffectMeta | undefined {
  return [...PANZOOM_PRESETS, ...MOTION_EFFECTS].find((preset) => preset.id === presetId);
}

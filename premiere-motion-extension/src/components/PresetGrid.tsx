import {
  ChevronDown,
  ChevronUp,
  Eye,
  Film,
  Image,
  Layers,
  Maximize2,
  Move,
  Play,
  RotateCw,
  Sparkles
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { PresetId, PresetMeta } from "../lib/presets";
import { calcOverscale } from "../lib/overscale";
import { cn } from "../lib/cn";

type PresetGridProps = {
  presets: PresetMeta[];
  currentPresetId: PresetId;
  anchorX: number;
  anchorY: number;
  intensity: number;
  onSelectPreset: (presetId: PresetId) => void;
};

function getPresetIcon(presetId: PresetId) {
  switch (presetId) {
    case "fast":
    case "zoom":
      return Maximize2;
    case "smooth":
    case "dreamy":
      return Sparkles;
    case "cinematic":
    case "noir":
      return Film;
    case "reveal":
      return Play;
    case "vintage":
      return Image;
    case "documentary":
    case "parallax":
      return Eye;
    case "timelapse":
      return ChevronUp;
    case "vlog":
      return ChevronDown;
    case "dynamic":
    case "diagonal-drift":
    case "crane-up":
      return Move;
    case "dramatic":
    case "push-pull":
    case "dolly-zoom":
      return Layers;
    case "orbit":
    case "tilt-shift":
    case "spiral-in":
      return RotateCw;
    default:
      return Sparkles;
  }
}

function PresetSection({
  title,
  presets,
  currentPresetId,
  anchorX,
  anchorY,
  intensity,
  onSelectPreset
}: PresetGridProps & { title: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="preset-section">
      <div className="subhead">
        <span>{title}</span>
      </div>
      <div className="preset-grid">
        {presets.map((preset, index) => {
          const Icon = getPresetIcon(preset.id);
          const overscale = Math.round(
            calcOverscale(preset.id, 1920, 1080, anchorX, anchorY, intensity) * 100
          );

          return (
            <motion.button
              key={preset.id}
              type="button"
              className={cn("preset-card", currentPresetId === preset.id && "active")}
              onClick={() => onSelectPreset(preset.id)}
              initial={reduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
              animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
              transition={{
                duration: reduceMotion ? 0 : 0.24,
                ease: [0.16, 1, 0.3, 1],
                delay: reduceMotion ? 0 : index * 0.04
              }}
            >
              <div className="preset-badge">{preset.badge}</div>
              <Icon size={16} strokeWidth={1.8} />
              <span className="preset-label">{preset.label}</span>
              <span className="preset-meta">{overscale}% overscale</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function PresetGrid(props: PresetGridProps) {
  const basicPresets = props.presets.filter((preset) => preset.category === "basic");
  const cinematicPresets = props.presets.filter((preset) => preset.category === "cinematic");

  return (
    <section className="glass-card section-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Pan / Zoom</p>
          <h2>Preset Grid</h2>
        </div>
      </div>
      <PresetSection {...props} title="Basic Nine" presets={basicPresets} />
      <PresetSection {...props} title="Cinematic Twelve" presets={cinematicPresets} />
    </section>
  );
}

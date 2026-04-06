import {
  Film,
  Move,
  RotateCw,
  Sparkles,
  Wand2
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { MotionEffectMeta, PresetId } from "../lib/presets";
import { cn } from "../lib/cn";

type EffectTagsProps = {
  effects: MotionEffectMeta[];
  activeMotionId: PresetId | null;
  allowMotionEffects: boolean;
  onSelectMotion: (presetId: PresetId) => void;
  onToggleAllowMotionEffects: (enabled: boolean) => void;
};

function getEffectIcon(presetId: PresetId) {
  switch (presetId) {
    case "slow":
    case "micro":
      return Sparkles;
    case "rotate":
    case "rotate-plus":
      return RotateCw;
    case "pan":
    case "shake":
    case "glitch":
      return Move;
    case "film":
    case "sepia":
      return Film;
    default:
      return Wand2;
  }
}

export function EffectTags({
  effects,
  activeMotionId,
  allowMotionEffects,
  onSelectMotion,
  onToggleAllowMotionEffects
}: EffectTagsProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="glass-card section-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Motion FX</p>
          <h2>Effect Tags</h2>
        </div>
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={allowMotionEffects}
            onChange={(event) => onToggleAllowMotionEffects(event.target.checked)}
          />
          <span>Include in random</span>
        </label>
      </div>
      <div className="effect-row">
        {effects.map((effect, index) => {
          const Icon = getEffectIcon(effect.id);
          const active = activeMotionId === effect.id;

          return (
            <motion.button
              key={effect.id}
              type="button"
              className={cn("effect-tag", active && "active")}
              onClick={() => onSelectMotion(effect.id)}
              initial={reduceMotion ? undefined : { opacity: 0, x: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.2,
                ease: [0.16, 1, 0.3, 1],
                delay: reduceMotion ? 0 : index * 0.03
              }}
            >
              <Icon size={14} strokeWidth={1.9} />
              <span>{effect.label}</span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

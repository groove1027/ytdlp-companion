import { Layers } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type IntensitySliderProps = {
  intensity: number;
  onChange: (value: number) => void;
};

export function IntensitySlider({ intensity, onChange }: IntensitySliderProps) {
  const reduceMotion = useReducedMotion();
  const percentage = Math.round(intensity * 100);

  return (
    <section className="glass-card section-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Intensity</p>
          <h2>Motion Depth</h2>
        </div>
        <div className="section-metric">{percentage}%</div>
      </div>
      <motion.div
        className="intensity-meter"
        initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="meter-head">
          <span className="meter-chip">
            <Layers size={14} strokeWidth={1.9} />
            Scale + Position + Rotation
          </span>
          <span>{percentage}%</span>
        </div>
        <input
          className="intensity-range"
          type="range"
          min="0.5"
          max="1.5"
          step="0.01"
          value={intensity}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className="meter-scale">
          <span>50%</span>
          <span>100%</span>
          <span>150%</span>
        </div>
      </motion.div>
    </section>
  );
}

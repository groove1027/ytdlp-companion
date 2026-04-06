import { Wand2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type BottomBarProps = {
  activeLabel: string;
  busy: boolean;
  overscale: number;
  selectedCount: number;
  onApply: () => Promise<void> | void;
};

export function BottomBar({
  activeLabel,
  busy,
  overscale,
  selectedCount,
  onApply
}: BottomBarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="bottom-bar"
      initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="bottom-copy">
        <span className="eyebrow">Active Mode</span>
        <strong>{activeLabel}</strong>
        <span>{selectedCount} clips · {overscale}% overscale</span>
      </div>
      <button
        type="button"
        className="cta-btn"
        onClick={() => {
          void onApply();
        }}
        disabled={busy}
      >
        <Wand2 size={16} strokeWidth={2} />
        <span>Apply to Selected</span>
      </button>
    </motion.div>
  );
}

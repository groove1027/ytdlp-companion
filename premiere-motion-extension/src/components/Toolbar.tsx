import { Brain, RotateCw, Shuffle, Undo2, Wand2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type ToolbarProps = {
  busy: boolean;
  clipCount: number;
  onRefresh: () => Promise<void> | void;
  onApply: () => Promise<void> | void;
  onRandom: () => Promise<void> | void;
  onSmart: () => Promise<void> | void;
  onUndo: () => Promise<void> | void;
};

export function Toolbar({
  busy,
  clipCount,
  onRefresh,
  onApply,
  onRandom,
  onSmart,
  onUndo
}: ToolbarProps) {
  const reduceMotion = useReducedMotion();
  const actions = [
    { id: "refresh", label: "Refresh", icon: RotateCw, onClick: onRefresh, tone: "ghost" },
    { id: "apply", label: "Apply", icon: Wand2, onClick: onApply, tone: "accent" },
    { id: "random", label: "Random", icon: Shuffle, onClick: onRandom, tone: "ghost" },
    { id: "smart", label: "Smart", icon: Brain, onClick: onSmart, tone: "ghost" },
    { id: "undo", label: "Undo", icon: Undo2, onClick: onUndo, tone: "ghost" }
  ] as const;

  return (
    <section className="glass-card toolbar-card">
      <div className="toolbar-head">
        <div>
          <p className="eyebrow">Premiere Pro UXP</p>
          <h1>Motion Master</h1>
        </div>
        <div className="count-pill">{clipCount} selected</div>
      </div>
      <div className="toolbar-grid">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              type="button"
              className={`action-btn ${action.tone}`}
              onClick={() => {
                void action.onClick();
              }}
              disabled={busy}
              initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.28,
                ease: [0.16, 1, 0.3, 1],
                delay: reduceMotion ? 0 : index * 0.04
              }}
            >
              <Icon size={15} strokeWidth={2} />
              <span>{action.label}</span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

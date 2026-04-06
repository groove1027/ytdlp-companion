import { Check, Loader2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { StatusState } from "../hooks/useMotionEngine";
import { cn } from "../lib/cn";

type StatusBarProps = {
  busy: boolean;
  status: StatusState;
};

export function StatusBar({ busy, status }: StatusBarProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("status-bar", `tone-${status.tone}`)}
      initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="status-icon" aria-hidden="true">
        {busy ? (
          <Loader2 className="spin" size={14} />
        ) : status.tone === "success" ? (
          <Check size={14} />
        ) : status.tone === "error" ? (
          <X size={14} />
        ) : (
          <span className="status-dot" />
        )}
      </span>
      <span className="status-copy">{status.message}</span>
    </motion.div>
  );
}

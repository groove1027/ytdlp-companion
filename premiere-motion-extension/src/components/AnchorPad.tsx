import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/cn";

type AnchorPadProps = {
  anchorX: number;
  anchorY: number;
  onChange: (nextX: number, nextY: number) => void;
};

const PRESET_POINTS = [
  { x: 20, y: 20, label: "TL" },
  { x: 50, y: 20, label: "TC" },
  { x: 80, y: 20, label: "TR" },
  { x: 20, y: 50, label: "CL" },
  { x: 50, y: 50, label: "CC" },
  { x: 80, y: 50, label: "CR" },
  { x: 20, y: 80, label: "BL" },
  { x: 50, y: 80, label: "BC" },
  { x: 80, y: 80, label: "BR" }
] as const;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function AnchorPad({ anchorX, anchorY, onChange }: AnchorPadProps) {
  const reduceMotion = useReducedMotion();
  const padRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function updateFromPointer(clientX: number, clientY: number): void {
    const element = padRef.current;
    if (!element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const nextX = clamp(((clientX - bounds.left) / bounds.width) * 100);
    const nextY = clamp(((clientY - bounds.top) / bounds.height) * 100);
    onChange(Math.round(nextX), Math.round(nextY));
  }

  return (
    <section className="glass-card section-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Anchor</p>
          <h2>Focus Pad</h2>
        </div>
        <div className="section-metric">
          {anchorX}% / {anchorY}%
        </div>
      </div>
      <motion.div
        ref={padRef}
        className="anchor-pad"
        onPointerDown={(event) => {
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!dragging) {
            return;
          }
          updateFromPointer(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          setDragging(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerLeave={() => {
          setDragging(false);
        }}
        initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="anchor-grid">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div
          className={cn("anchor-dot", dragging && "dragging")}
          style={{ left: `${anchorX}%`, top: `${anchorY}%` }}
        />
        <div className="anchor-presets">
          {PRESET_POINTS.map((point) => (
            <button
              key={point.label}
              type="button"
              className="anchor-preset"
              onClick={() => onChange(point.x, point.y)}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-label={`Set anchor ${point.label}`}
            />
          ))}
        </div>
      </motion.div>
      <div className="slider-pair">
        <label className="slider-block">
          <span>X</span>
          <input
            type="range"
            min="0"
            max="100"
            value={anchorX}
            onChange={(event) => onChange(Number(event.target.value), anchorY)}
          />
        </label>
        <label className="slider-block">
          <span>Y</span>
          <input
            type="range"
            min="0"
            max="100"
            value={anchorY}
            onChange={(event) => onChange(anchorX, Number(event.target.value))}
          />
        </label>
      </div>
    </section>
  );
}

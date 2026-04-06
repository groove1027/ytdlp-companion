import { Film, Image } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SmartRandomAssignment } from "../lib/smartRandom";
import type { SelectedClip } from "../lib/motionEngine";

type ClipListProps = {
  clips: SelectedClip[];
  assignments: SmartRandomAssignment[];
  loading: boolean;
};

function isVideoClip(mediaPath: string): boolean {
  return /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(mediaPath);
}

export function ClipList({ clips, assignments, loading }: ClipListProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="glass-card section-card">
      <div className="section-head">
        <div>
          <p className="eyebrow">Timeline</p>
          <h2>Selected Clips</h2>
        </div>
        <div className="section-metric">{clips.length}</div>
      </div>
      <div className="clip-list">
        <AnimatePresence initial={false}>
          {clips.length === 0 ? (
            <motion.div
              key="empty"
              className="empty-state"
              initial={reduceMotion ? undefined : { opacity: 0 }}
              animate={reduceMotion ? undefined : { opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
            >
              {loading ? "Syncing selection..." : "Select clips in the Premiere timeline."}
            </motion.div>
          ) : (
            clips.map((clip, index) => {
              const Icon = isVideoClip(clip.mediaPath) ? Film : Image;
              const assignment = assignments[index];

              return (
                <motion.div
                  key={clip.id}
                  className="clip-row"
                  initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.24,
                    ease: [0.16, 1, 0.3, 1],
                    delay: reduceMotion ? 0 : index * 0.04
                  }}
                >
                  <div className="clip-thumb">
                    <Icon size={16} strokeWidth={1.8} />
                  </div>
                  <div className="clip-copy">
                    <div className="clip-name-row">
                      <span className="clip-name">{clip.name}</span>
                      <span className="clip-duration">{clip.dur.toFixed(1)}s</span>
                    </div>
                    <div className="clip-meta-row">
                      <span>T{clip.trackIdx + 1}</span>
                      <span>C{clip.clipIdx + 1}</span>
                      {assignment ? (
                        <span className="clip-assignment">{assignment.presetId}</span>
                      ) : (
                        <span className="clip-assignment muted">Live selection</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

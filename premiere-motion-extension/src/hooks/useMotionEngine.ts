import { useState } from "react";
import {
  applyMotionBatch,
  removeMotionFromSelected,
  type MotionAssignment,
  type MotionBatchResult
} from "../lib/motionEngine";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error";

export type StatusState = {
  tone: StatusTone;
  message: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function summarizeBatchResults(results: MotionBatchResult[]): StatusState {
  const okCount = results.filter((item) => item.result.startsWith("OK:")).length;
  const skipCount = results.filter((item) => item.result.startsWith("Skip:")).length;
  const errorCount = results.length - okCount - skipCount;
  const warningCount = results.filter((item) => item.result.includes(":warn=")).length;

  if (errorCount > 0) {
    return {
      tone: "warning",
      message: `${okCount} applied, ${errorCount} failed, ${skipCount} skipped`
    };
  }

  if (skipCount > 0 || warningCount > 0) {
    return {
      tone: "warning",
      message: `${okCount} applied, ${skipCount} skipped, ${warningCount} warned`
    };
  }

  return {
    tone: "success",
    message: `${okCount} clip(s) updated successfully`
  };
}

export function useMotionEngine() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StatusState>({
    tone: "info",
    message: "Premiere Pro UXP connection ready."
  });

  async function applyBatch(assignments: MotionAssignment[]): Promise<MotionBatchResult[]> {
    if (assignments.length === 0) {
      setStatus({
        tone: "warning",
        message: "Select clips in the timeline first."
      });
      return [];
    }

    setBusy(true);
    setStatus({
      tone: "info",
      message: "Applying Motion keyframes..."
    });

    try {
      const results = await applyMotionBatch(assignments);
      setStatus(summarizeBatchResults(results));
      return results;
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Batch apply failed: ${toErrorMessage(error)}`
      });
      return [];
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected(): Promise<void> {
    setBusy(true);
    setStatus({
      tone: "info",
      message: "Restoring original Motion values..."
    });

    try {
      const result = await removeMotionFromSelected();
      if (result.startsWith("Error:")) {
        setStatus({
          tone: "error",
          message: result
        });
        return;
      }

      if (result.startsWith("Warn:")) {
        setStatus({
          tone: "warning",
          message: result.slice("Warn: ".length)
        });
        return;
      }

      setStatus({
        tone: "success",
        message: result
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: `Restore failed: ${toErrorMessage(error)}`
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    status,
    setStatus,
    applyBatch,
    removeSelected
  };
}

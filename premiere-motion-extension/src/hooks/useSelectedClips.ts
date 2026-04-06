import { startTransition, useEffect, useRef, useState } from "react";
import { getSelectedClips, type SelectedClip } from "../lib/motionEngine";
import { ppro } from "../lib/ppro";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function useSelectedClips() {
  const [clips, setClips] = useState<SelectedClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const refreshRef = useRef<(silent?: boolean) => Promise<SelectedClip[]>>(async () => []);

  refreshRef.current = async (silent = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const nextClips = await getSelectedClips();
      if (requestId !== requestIdRef.current) {
        return nextClips;
      }

      startTransition(() => {
        setClips(nextClips);
      });
      setError(null);
      return nextClips;
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return [];
      }

      startTransition(() => {
        setClips([]);
      });
      if (!silent) {
        setError(toErrorMessage(loadError));
      }
      return [];
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  function refresh(silent = false): Promise<SelectedClip[]> {
    return refreshRef.current(silent);
  }

  useEffect(() => {
    let refreshTimer = 0;
    let pollTimer = 0;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void refreshRef.current(true);
      }, 60);
    };

    const onSelectionChange = () => {
      scheduleRefresh();
    };

    const onSequenceActivated = () => {
      scheduleRefresh();
    };

    const onProjectActivated = () => {
      scheduleRefresh();
    };

    void refreshRef.current(true);

    ppro.EventManager.addGlobalEventListener(
      ppro.Constants.SequenceEvent.SELECTION_CHANGED,
      onSelectionChange
    );
    ppro.EventManager.addGlobalEventListener(
      ppro.Constants.SequenceEvent.ACTIVATED,
      onSequenceActivated
    );
    ppro.EventManager.addGlobalEventListener(
      ppro.Constants.ProjectEvent.ACTIVATED,
      onProjectActivated,
      true
    );

    pollTimer = window.setInterval(() => {
      scheduleRefresh();
    }, 1600);

    return () => {
      window.clearTimeout(refreshTimer);
      window.clearInterval(pollTimer);
      ppro.EventManager.removeGlobalEventListener(
        ppro.Constants.SequenceEvent.SELECTION_CHANGED,
        onSelectionChange
      );
      ppro.EventManager.removeGlobalEventListener(
        ppro.Constants.SequenceEvent.ACTIVATED,
        onSequenceActivated
      );
      ppro.EventManager.removeGlobalEventListener(
        ppro.Constants.ProjectEvent.ACTIVATED,
        onProjectActivated
      );
    };
  }, []);

  return {
    clips,
    isLoading,
    error,
    refresh
  };
}

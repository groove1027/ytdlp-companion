import { useState, useEffect, useRef } from 'react';

/**
 * Returns elapsed seconds while `isActive` is true.
 * Resets to 0 when `isActive` becomes false.
 */
export function useElapsedTimer(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!isActive) { setElapsed(0); return; }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isActive]);

  return elapsed;
}

/** Format seconds as "3초", "1:05", "2:30" */
export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

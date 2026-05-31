"use client";

import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tween a number to its target value. Returns the in-flight value.
 * Skips animation on first render (snaps to value) and when the delta is tiny.
 */
export function useAnimatedNumber(target: number | null | undefined, durationMs = 600): number {
  const valid = target != null && Number.isFinite(target);
  const safeTarget = valid ? (target as number) : 0;

  const [current, setCurrent] = useState<number>(safeTarget);
  const fromRef = useRef<number>(safeTarget);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const firstRunRef = useRef<boolean>(true);

  useEffect(() => {
    if (!valid) return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      fromRef.current = safeTarget;
      setCurrent(safeTarget);
      return;
    }

    if (Math.abs(safeTarget - fromRef.current) < 1e-9) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = safeTarget;
      setCurrent(safeTarget);
      return;
    }

    const from = current;
    fromRef.current = from;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = easeOutCubic(t);
      const next = from + (safeTarget - from) * eased;
      setCurrent(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = safeTarget;
        rafRef.current = null;
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, valid, durationMs]);

  return valid ? current : 0;
}

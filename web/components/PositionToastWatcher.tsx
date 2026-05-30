"use client";

import { useEffect, useRef } from "react";
import { usePositions } from "../lib/api-client";
import { groupByOpportunity, spreadLabel, type KeeperPosition } from "../lib/positions";
import { toastPositionClosed, toastPositionOpened } from "../lib/toast";

/**
 * Polls keeper positions and fires short toasts when spreads open or close.
 * Skips the first snapshot so initial page load stays quiet.
 */
export function PositionToastWatcher() {
  const { data } = usePositions();
  const prevIdsRef = useRef<Set<string> | null>(null);
  const labelsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!data) return;

    const positions = data as KeeperPosition[];
    const grouped = groupByOpportunity(positions);
    const currentIds = new Set(grouped.keys());

    if (prevIdsRef.current === null) {
      prevIdsRef.current = currentIds;
      for (const [id, legs] of Array.from(grouped.entries())) {
        labelsRef.current.set(id, spreadLabel(legs));
      }
      return;
    }

    const prev = prevIdsRef.current;

    for (const id of Array.from(currentIds)) {
      if (!prev.has(id)) {
        const label = spreadLabel(grouped.get(id)!);
        labelsRef.current.set(id, label);
        toastPositionOpened(label);
      } else {
        labelsRef.current.set(id, spreadLabel(grouped.get(id)!));
      }
    }

    for (const id of Array.from(prev)) {
      if (!currentIds.has(id)) {
        toastPositionClosed(labelsRef.current.get(id) ?? "Spread");
        labelsRef.current.delete(id);
      }
    }

    prevIdsRef.current = currentIds;
  }, [data]);

  return null;
}

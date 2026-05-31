"use client";

import { useHealth } from "../lib/api-client";

export function KeeperOfflineBanner() {
  const { data: health, error, mutate } = useHealth();

  // Render only when we know the keeper is unreachable. Hide while loading.
  const offline = error != null || (health != null && health.ok === false);
  if (!offline) return null;

  return (
    <div className="keeper-banner mb-4" role="status">
      <span className="keeper-banner-dot" />
      <span className="text-[12px] text-text-secondary">
        Keeper unreachable — live data paused. On the Render free tier this is usually a 50s cold start.
      </span>
      <button
        type="button"
        onClick={() => mutate()}
        className="ml-auto text-[12px] text-accent hover:text-accent-hover font-medium"
      >
        Retry
      </button>
    </div>
  );
}

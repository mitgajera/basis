import type { ReactNode } from "react";

/** Inline toast status icons (x402-style: white disc + dark glyph) */

function Disc({ children }: { children: ReactNode }) {
  return (
    <span className="basis-toast-disc" aria-hidden>
      {children}
    </span>
  );
}

export function ToastIconSuccess() {
  return (
    <Disc>
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path
          d="M1 4.2L3.6 6.8L9 1.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Disc>
  );
}

export function ToastIconError() {
  return (
    <Disc>
      <svg width="4" height="12" viewBox="0 0 4 12" fill="currentColor">
        <rect x="0" y="0" width="4" height="7" rx="0.5" />
        <rect x="0" y="9" width="4" height="3" rx="1" />
      </svg>
    </Disc>
  );
}

export function ToastIconInfo() {
  return (
    <Disc>
      <svg width="4" height="12" viewBox="0 0 4 12" fill="currentColor">
        <rect x="0" y="0" width="4" height="4" rx="2" />
        <rect x="0" y="6" width="4" height="6" rx="0.5" />
      </svg>
    </Disc>
  );
}

export function ToastIconLoading() {
  return (
    <span className="basis-toast-disc basis-toast-spinner-wrap" aria-hidden>
      <span className="basis-toast-spinner" />
    </span>
  );
}

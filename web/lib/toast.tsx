import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";

export const toast = sonnerToast;

function solscanLink(signature: string) {
  return (
    <a
      href={`https://solscan.io/tx/${signature}?cluster=${CLUSTER}`}
      target="_blank"
      rel="noopener noreferrer"
      className="basis-toast-link"
    >
      View on Solscan
    </a>
  );
}

/** Success toast with Solscan link (x402-style). */
export function toastTx(
  signature: string,
  title = "Transaction confirmed!",
  opts?: { id?: string | number; extra?: ReactNode }
) {
  toast.success(title, {
    id: opts?.id,
    description: (
      <span className="flex flex-col gap-1">
        {opts?.extra}
        {solscanLink(signature)}
      </span>
    ),
  });
}

export function toastLoading(message: string, description?: string) {
  return toast.loading(message, description ? { description } : undefined);
}

const SHORT_TOAST_MS = 3200;

/** Keeper opened a new spread (simulated). */
export function toastPositionOpened(label: string) {
  toast.success("Position opened", {
    description: label,
    duration: SHORT_TOAST_MS,
  });
}

/** Keeper closed a spread. */
export function toastPositionClosed(label: string) {
  toast("Position closed", {
    description: label,
    duration: SHORT_TOAST_MS,
  });
}

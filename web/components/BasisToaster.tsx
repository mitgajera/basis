"use client";

import { Toaster } from "sonner";
import { ToastIconError, ToastIconInfo, ToastIconLoading, ToastIconSuccess } from "./ToastIcons";

export function BasisToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      closeButton
      offset={20}
      gap={14}
      visibleToasts={4}
      expand={false}
      icons={{
        success: <ToastIconSuccess />,
        error: <ToastIconError />,
        info: <ToastIconInfo />,
        warning: <ToastIconError />,
        loading: <ToastIconLoading />,
      }}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: "basis-toast",
          title: "basis-toast-title",
          description: "basis-toast-desc",
          closeButton: "basis-toast-close",
          icon: "basis-toast-icon",
          actionButton: "basis-toast-action",
        },
      }}
    />
  );
}

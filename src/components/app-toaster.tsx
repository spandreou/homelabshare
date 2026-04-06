"use client";

import { Toaster } from "react-hot-toast";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: "#18181b",
          color: "#fafafa",
          border: "1px solid #3f3f46",
        },
        success: {
          iconTheme: {
            primary: "#22c55e",
            secondary: "#09090b",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "#09090b",
          },
        },
      }}
    />
  );
}

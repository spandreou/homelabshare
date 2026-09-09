"use client";

import { useEffect, useRef } from "react";
import toast from "react-hot-toast";

export function LoginErrorToast({ message }: { message: string | null }) {
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (message && message !== lastMessageRef.current) {
      toast.error(message);
      lastMessageRef.current = message;
    }
  }, [message]);

  return null;
}

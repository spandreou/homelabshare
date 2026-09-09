"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import type { ComponentProps } from "react";

type LightfallComponent = (typeof import("./Lightfall"))["default"];
type ResponsiveLightfallProps = ComponentProps<LightfallComponent>;

const Lightfall = dynamic(() => import("./Lightfall"), { ssr: false });

const animationQuery = "(min-width: 768px) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)";

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia(animationQuery);
  mediaQuery.addEventListener("change", callback);

  return () => {
    mediaQuery.removeEventListener("change", callback);
  };
}

function getSnapshot() {
  return window.matchMedia(animationQuery).matches;
}

function getServerSnapshot() {
  return false;
}

export function ResponsiveLightfall(props: ResponsiveLightfallProps) {
  const shouldAnimate = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!shouldAnimate) {
    return null;
  }

  return <Lightfall {...props} />;
}

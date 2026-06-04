import type { ReactNode } from "react";
import { ResponsiveLightfall } from "./ResponsiveLightfall";

type AuthenticatedPageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AuthenticatedPageShell({
  children,
  className = "px-6 py-10",
  contentClassName = "mx-auto max-w-6xl space-y-8",
}: AuthenticatedPageShellProps) {
  return (
    <main className={`relative isolate min-h-screen overflow-hidden bg-[#061066] text-zinc-100 ${className}`}>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(82,39,255,0.55),rgba(10,41,255,0.18)_34%,rgba(2,4,24,0.92)_82%)]"
      >
        <ResponsiveLightfall
          colors={["#A6C8FF", "#5227FF", "#FF9FFC"]}
          backgroundColor="#0A29FF"
          speed={0.5}
          streakCount={3}
          streakWidth={1}
          streakLength={1}
          glow={0.8}
          density={0.7}
          twinkle={1}
          zoom={2.3}
          backgroundGlow={0.3}
          opacity={1}
          mouseInteraction={false}
          mouseStrength={0.5}
          mouseRadius={0.65}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(7,10,48,0.18)_36%,rgba(2,4,24,0.58)_82%)]"
      />
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </main>
  );
}

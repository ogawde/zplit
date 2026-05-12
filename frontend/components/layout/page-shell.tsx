import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SiteHeader } from "@/components/layout/site-header";

type Props = {
  children: ReactNode;
  contentClassName?: string;
};

export function PageShell({ children, contentClassName }: Props) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-32 -z-10 h-[360px] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_60%)]" />
      <SiteHeader />
      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10",
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}

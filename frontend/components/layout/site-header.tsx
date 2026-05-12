"use client";

import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { ArrowUpRight, Sparkles } from "lucide-react";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (module) => module.WalletMultiButton
    ),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground opacity-70 shadow-sm"
      >
        Select Wallet
      </button>
    ),
  }
);

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-3 transition-transform duration-200 hover:translate-x-[1px]"
        >
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold tracking-tight text-foreground">
              Zplit
            </span>
            <span className="block text-xs text-muted-foreground transition-colors group-hover:text-foreground/80">
              One payment. Instant team payouts.
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs text-muted-foreground md:inline-flex">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
            Solana invoice flow
          </div>
          <WalletMultiButton className="!h-11 !rounded-xl !bg-primary !px-4 !font-medium !text-primary-foreground !shadow-sm transition-transform duration-200 hover:!translate-y-[-1px] hover:!bg-primary/90" />
          <a
            href="https://phantom.app/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "hidden h-11 items-center rounded-xl px-3 sm:inline-flex"
            )}
          >
            Get Phantom
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

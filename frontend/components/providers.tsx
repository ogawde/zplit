"use client";

import { SolanaWalletProvider } from "@/components/solana/solana-wallet-provider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      {children}
      <Toaster richColors position="top-center" />
    </SolanaWalletProvider>
  );
}

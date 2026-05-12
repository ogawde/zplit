"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Props = {
  invoiceId: string;
  signature: string;
  recipients: string[];
  solscanClusterQuery: string;
};

function getSolscanUrl(path: string, clusterQuery: string) {
  return `https://solscan.io/${path}${clusterQuery}`;
}

export function PaymentReceiptClient({
  invoiceId,
  signature,
  recipients,
  solscanClusterQuery,
}: Props) {
  useEffect(() => {
    void confetti({
      particleCount: 180,
      spread: 110,
      origin: { y: 0.6 },
    });
  }, []);

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.1] via-card to-background">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3">
            <Badge variant="success" className="w-fit">
              Payment successful
            </Badge>
            <div className="space-y-2">
              <CardTitle className="text-2xl sm:text-3xl">
                Zplit receipt
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Invoice{" "}
                <span className="font-medium text-foreground">
                  {truncateAddress(invoiceId)}
                </span>{" "}
                was paid and split instantly.
              </p>
            </div>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ReceiptStat
            label="Recipients"
            value={String(recipients.length)}
            hint="Wallets included in the split"
          />
          <ReceiptStat
            label="Network status"
            value="Confirmed"
            hint="Transaction reached the selected cluster"
          />
          <ReceiptStat
            label="Receipt"
            value="Ready"
            hint="Share or verify the transaction below"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-2xl border border-border/70 bg-card/70 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Transaction signature
              </p>
              <p className="break-all text-sm">{signature}</p>
            </div>
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-300" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={() => void handleCopy(signature, "Signature")}
            >
              Copy signature
              <Copy className="size-4" />
            </button>
            <a
              href={getSolscanUrl(`tx/${signature}`, solscanClusterQuery)}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              View on Solscan
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Recipient wallets</p>
          {recipients.length ? (
            <div className="space-y-2">
              {recipients.map((wallet, index) => (
                <div
                  key={`${wallet}-${index}`}
                  className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 transition-all duration-200 hover:border-primary/25 hover:bg-card/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Recipient {index + 1}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {truncateAddress(wallet)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      onClick={() => void handleCopy(wallet, "Wallet address")}
                    >
                      Copy
                      <Copy className="size-4" />
                    </button>
                    <a
                      href={getSolscanUrl(`account/${wallet}`, solscanClusterQuery)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Open
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recipient wallets were included in this receipt.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/?tab=invoices" className={buttonVariants()}>
            Go to dashboard
          </Link>
          <Link
            href="/?tab=create"
            className={buttonVariants({ variant: "outline" })}
          >
            Create another invoice
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ReceiptStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function truncateAddress(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.08] to-background">
      <CardHeader className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">Payment successful</p>
        <CardTitle className="text-2xl sm:text-3xl">Zplit receipt</CardTitle>
        <p className="text-sm text-muted-foreground">
          Invoice <span className="font-medium text-foreground">{invoiceId}</span> was paid and split instantly.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-card/60 p-3 sm:p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Transaction signature</p>
          <p className="break-all text-sm">{signature}</p>
          <a
            href={getSolscanUrl(`tx/${signature}`, solscanClusterQuery)}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
          >
            View transaction on Solscan
          </a>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Recipient links</p>
          {recipients.length ? (
            <div className="space-y-2">
              {recipients.map((wallet, index) => (
                <a
                  key={`${wallet}-${index}`}
                  href={getSolscanUrl(`account/${wallet}`, solscanClusterQuery)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border bg-card/60 px-3 py-2 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {wallet}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recipient wallets found for this receipt.</p>
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

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/layout/page-shell";
import { PaymentReceiptClient } from "@/components/pay/payment-receipt-client";

type Props = {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ signature?: string; recipients?: string }>;
};

function getSolscanClusterQuery() {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "";
  if (rpc.includes("devnet")) return "?cluster=devnet";
  if (rpc.includes("testnet")) return "?cluster=testnet";
  return "";
}

export default async function ReceiptPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const signature = resolvedSearchParams.signature ?? "";
  const recipients = (resolvedSearchParams.recipients ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return (
    <PageShell contentClassName="max-w-4xl">
      <div className="space-y-6">
        {signature ? (
          <PaymentReceiptClient
            invoiceId={resolvedParams.invoiceId}
            signature={signature}
            recipients={recipients}
            solscanClusterQuery={getSolscanClusterQuery()}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Receipt unavailable</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This receipt link is missing the confirmed transaction details.
              </p>
              <Link href="/?tab=invoices" className={buttonVariants()}>
                Go to dashboard
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

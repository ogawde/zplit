import { SiteHeader } from "@/components/layout/site-header";
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
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <PaymentReceiptClient
          invoiceId={resolvedParams.invoiceId}
          signature={signature}
          recipients={recipients}
          solscanClusterQuery={getSolscanClusterQuery()}
        />
      </main>
    </div>
  );
}

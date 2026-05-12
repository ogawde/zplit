import { PageShell } from "@/components/layout/page-shell";
import { PayInvoiceClient } from "@/components/pay/pay-invoice-client";

type Props = {
  params: Promise<{ invoiceId: string }>;
};

export default async function PayInvoicePage({ params }: Props) {
  const { invoiceId } = await params;

  return (
    <PageShell contentClassName="max-w-4xl">
      <div className="space-y-6">
        <div className="mb-6 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Invoice
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Pay Zplit invoice
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review the invoice, confirm the wallet receiving split payouts, and
            pay in one USDC transaction.
          </p>
          <p className="break-all text-xs text-muted-foreground/80">
            {invoiceId}
          </p>
        </div>
        <PayInvoiceClient invoiceId={invoiceId} />
      </div>
    </PageShell>
  );
}


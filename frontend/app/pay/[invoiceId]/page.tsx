import { SiteHeader } from "@/components/layout/site-header";
import { PayInvoiceClient } from "@/components/pay/pay-invoice-client";

type Props = {
  params: { invoiceId: string };
};

export default function PayInvoicePage({ params }: Props) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-6 space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Invoice
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Pay Zplit invoice
          </h1>
          <p className="break-all text-xs text-muted-foreground">
            {params.invoiceId}
          </p>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Review invoice details and execute one-click payment with your
          connected wallet.
        </p>
        <PayInvoiceClient invoiceId={params.invoiceId} />
      </main>
    </div>
  );
}


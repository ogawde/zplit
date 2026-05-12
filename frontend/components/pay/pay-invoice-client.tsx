"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  ExternalLink,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  decodeInvoiceAccount,
  decodeTeamProfileAccount,
  type DecodedInvoice,
  type DecodedTeamProfile,
  formatUsdcAmount,
  getDistributableAmount,
  getInvoiceDueDateUnix,
  getInvoicePlatformFeeBps,
  getInvoiceStatusLabel,
  getInvoiceTeamProfilePubkey,
  getTeamProfileSplitKind,
  isInvoicePaid,
} from "@/lib/solana/zplit-program";
import { getUsdcMintAddress } from "@/lib/solana/rpc";

type Props = { invoiceId: string };
type InvoiceRecord = DecodedInvoice & {
  team_profile_pubkey?: PublicKey;
  due_date?: bigint;
  platform_fee_bps?: number;
};
type SplitRow = { wallet: string; amountRaw: bigint };

function getSplitRows(invoice: InvoiceRecord, teamProfile: DecodedTeamProfile): SplitRow[] {
  const distributable = getDistributableAmount(invoice);
  const members = teamProfile.members ?? [];
  if (!members.length) return [];

  if (getTeamProfileSplitKind(teamProfile) === "percentage") {
    const rows = members.map((member) => ({
      wallet: member.wallet.toBase58(),
      amountRaw: (distributable * BigInt(member.value)) / BigInt(10_000),
    }));
    const sum = rows.reduce((acc, row) => acc + row.amountRaw, BigInt(0));
    const remainder = distributable - sum;
    if (remainder > BigInt(0) && rows[0]) rows[0].amountRaw += remainder;
    return rows;
  }

  return members.map((member) => ({
    wallet: member.wallet.toBase58(),
    amountRaw: BigInt(member.value),
  }));
}

export function PayInvoiceClient({ invoiceId }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [teamProfile, setTeamProfile] = useState<DecodedTeamProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const configuredUsdcMint = useMemo(() => {
    try {
      return getUsdcMintAddress();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const invoicePubkey = new PublicKey(invoiceId);
        const invoiceAccount = await connection.getAccountInfo(invoicePubkey, "confirmed");
        if (!invoiceAccount) throw new Error("Invoice account not found on this cluster");
        const decodedInvoice = decodeInvoiceAccount(invoiceAccount.data) as InvoiceRecord;
        const teamProfilePubkey = getInvoiceTeamProfilePubkey(decodedInvoice);
        const teamProfileAccount = await connection.getAccountInfo(teamProfilePubkey, "confirmed");
        if (!teamProfileAccount) throw new Error("Team profile not found for this invoice");
        if (!cancelled) {
          setInvoice(decodedInvoice);
          setTeamProfile(decodeTeamProfileAccount(teamProfileAccount.data));
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load invoice");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [connection, invoiceId]);

  const splitRows = useMemo(() => {
    if (!invoice || !teamProfile) return [];
    return getSplitRows(invoice, teamProfile);
  }, [invoice, teamProfile]);
  const invoiceStatusLabel = invoice ? getInvoiceStatusLabel(invoice) : "Unpaid";
  const hasBeenPaid = invoice ? isInvoicePaid(invoice) : false;
  const dueDateLabel = invoice
    ? new Date(getInvoiceDueDateUnix(invoice) * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "-";
  const amountLabel = invoice
    ? `${formatUsdcAmount(BigInt(invoice.amount))} USDC`
    : "0.000000 USDC";
  const paidByLabel = hasBeenPaid && invoice ? invoice.payer.toBase58() : null;

  async function handlePay() {
    if (!connected || !publicKey) return toast.error("Connect your wallet first");
    if (invoice && isInvoicePaid(invoice)) {
      return toast.error("This invoice has already been paid.");
    }
    if (!configuredUsdcMint) {
      return toast.error("USDC mint is not configured for this environment.");
    }
    setIsPaying(true);
    try {
      const response = await fetch(`/api/actions/pay-invoice/${invoiceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      if (!response.ok) throw new Error(await response.text());
      const body = (await response.json()) as { transaction?: string };
      if (!body.transaction) throw new Error("Missing transaction from Action response");
      const tx = Transaction.from(Buffer.from(body.transaction, "base64"));
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");
      toast.success("Invoice paid successfully");
      const recipients = splitRows.map((row) => row.wallet).join(",");
      router.push(
        `/pay/${invoiceId}/receipt?signature=${encodeURIComponent(signature)}&recipients=${encodeURIComponent(recipients)}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/80">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <Badge
                variant={hasBeenPaid ? "success" : "warning"}
                className="w-fit"
              >
                {invoiceStatusLabel}
              </Badge>
              <div className="space-y-1">
                <CardTitle className="text-2xl sm:text-3xl">
                  {invoice?.description || "Invoice payment"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Pay once and Zplit routes the USDC split automatically.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Amount due
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {amountLabel}
              </p>
            </div>
          </div>

          {isLoading ? (
            <PayInvoiceSummarySkeleton />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <InvoiceSummaryItem label="Due date" value={dueDateLabel} />
              <InvoiceSummaryItem
                label="Platform fee"
                value={`${invoice ? (getInvoicePlatformFeeBps(invoice) / 100).toFixed(2) : "0.00"}%`}
              />
              <InvoiceSummaryItem
                label="Payment token"
                value={configuredUsdcMint ? "USDC" : "Not configured"}
              />
            </div>
          )}
        </CardHeader>
      </Card>

      {isLoading ? (
        <Card className="border-border/80">
          <CardContent className="space-y-4 pt-6">
            <PayInvoiceDetailsSkeleton />
          </CardContent>
        </Card>
      ) : !invoice || !teamProfile ? (
        <Card className="border-border/80">
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-semibold">Invoice unavailable</p>
            <p className="text-sm text-muted-foreground">
              We could not load the invoice details on this cluster.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Split breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {splitRows.length ? (
                splitRows.map((row, index) => (
                  <div
                    key={`${row.wallet}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/55 px-4 py-3 text-sm transition-colors hover:border-primary/25"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        Recipient {index + 1}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {truncateAddress(row.wallet)}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatUsdcAmount(row.amountRaw)} USDC
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No members were found in the linked team profile.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasBeenPaid ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="mt-0.5 size-5 text-emerald-300" />
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-100">
                        This invoice has already been paid
                      </p>
                      <p className="text-sm text-emerald-50/80">
                        Payments are locked after the invoice reaches a paid
                        state.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 size-5 text-primary" />
                    <div className="space-y-1">
                      <p className="font-semibold">USDC payment</p>
                      <p className="text-sm text-muted-foreground">
                        The invoice is configured to pay in USDC automatically.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 rounded-2xl border border-border/70 bg-background/55 p-4">
                <InvoiceSummaryItem label="Status" value={invoiceStatusLabel} />
                {paidByLabel ? (
                  <InvoiceSummaryItem
                    label="Paid by"
                    value={truncateAddress(paidByLabel)}
                  />
                ) : null}
                <InvoiceSummaryItem
                  label="Wallet"
                  value={
                    connected && publicKey
                      ? truncateAddress(publicKey.toBase58())
                      : "Connect Phantom to continue"
                  }
                />
              </div>

              {!hasBeenPaid ? (
                <Button
                  onClick={handlePay}
                  disabled={isPaying || isLoading || !configuredUsdcMint}
                  size="lg"
                >
                  {isPaying ? "Preparing transaction..." : "Pay with Phantom"}
                  {!isPaying ? <ArrowRight className="size-4" /> : null}
                </Button>
              ) : null}

              {!connected ? (
                <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <Wallet className="mt-0.5 size-5 text-muted-foreground" />
                    <p>Connect your wallet in the header before paying.</p>
                  </div>
                </div>
              ) : null}

              {!configuredUsdcMint ? (
                <p className="text-sm text-destructive">
                  USDC mint is not configured for this environment.
                </p>
              ) : null}

              <a
                href={`/api/actions/pay-invoice/${invoiceId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
              >
                View action endpoint
                <ExternalLink className="size-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function InvoiceSummaryItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function PayInvoiceSummarySkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  );
}

function PayInvoiceDetailsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}

function truncateAddress(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

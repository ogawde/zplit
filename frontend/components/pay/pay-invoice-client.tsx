"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Invoice details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading invoice details...</p>
        ) : (
          <>
            <div className="grid gap-2 text-sm">
              <p><span className="text-muted-foreground">Description:</span> {invoice?.description || "-"}</p>
              <p><span className="text-muted-foreground">Amount:</span> {invoice ? formatUsdcAmount(BigInt(invoice.amount)) : "0.000000"} USDC</p>
              <p><span className="text-muted-foreground">Due date:</span> {invoice ? new Date(getInvoiceDueDateUnix(invoice) * 1000).toLocaleString("en-US") : "-"}</p>
              <p><span className="text-muted-foreground">Platform fee:</span> {invoice ? (getInvoicePlatformFeeBps(invoice) / 100).toFixed(2) : "0.00"}%</p>
              <p><span className="text-muted-foreground">Status:</span> {invoiceStatusLabel}</p>
              {hasBeenPaid ? (
                <p><span className="text-muted-foreground">Paid by:</span> {invoice?.payer.toBase58()}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Split breakdown</p>
              {splitRows.length ? splitRows.map((row, index) => (
                <div key={`${row.wallet}-${index}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                  <span className="max-w-[70%] truncate text-muted-foreground">{row.wallet}</span>
                  <span>{formatUsdcAmount(row.amountRaw)} USDC</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">No members found in team profile.</p>}
            </div>
            {hasBeenPaid ? (
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                <p className="font-medium text-primary">This invoice has already been paid.</p>
                <p className="mt-1 text-muted-foreground">
                  Payments are disabled after the invoice reaches a paid state.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Payment token</p>
                  <div className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                    USDC
                  </div>
                  <p className="text-muted-foreground text-xs">
                    This environment is configured to pay invoices in USDC automatically.
                  </p>
                </div>
                <Button
                  onClick={handlePay}
                  disabled={isPaying || isLoading || !configuredUsdcMint}
                >
                  {isPaying ? "Preparing transaction..." : "Pay with Phantom"}
                </Button>
                {!configuredUsdcMint ? (
                  <p className="text-sm text-destructive">
                    USDC mint is not configured for this environment.
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

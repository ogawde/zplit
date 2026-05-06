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
} from "@/lib/solana/zplit-program";

type Props = { invoiceId: string };
type SplitType = Record<"percentage", object> | Record<"Percentage", object> | Record<string, never>;
type InvoiceRecord = DecodedInvoice & {
  team_profile_pubkey?: PublicKey;
  due_date?: bigint;
  platform_fee_bps?: number;
};
type SplitRow = { wallet: string; amountRaw: bigint };

function getFeeBps(invoice: InvoiceRecord) {
  return Number(invoice.platformFeeBps ?? invoice.platform_fee_bps ?? 0);
}

function isPercentageSplit(splitType: SplitType) {
  return "percentage" in splitType || "Percentage" in splitType;
}

function getTeamProfilePubkey(invoice: InvoiceRecord) {
  const pubkey = invoice.teamProfilePubkey ?? invoice.team_profile_pubkey;
  if (!pubkey) throw new Error("Invoice has no team profile pubkey");
  return pubkey;
}

function getDueDateUnix(invoice: InvoiceRecord) {
  return Number(invoice.dueDate ?? invoice.due_date ?? BigInt(0));
}

function asUsdc(value: bigint) {
  return (Number(value) / 1_000_000).toFixed(6);
}

function getSplitRows(invoice: InvoiceRecord, teamProfile: DecodedTeamProfile): SplitRow[] {
  const total = BigInt(invoice.amount);
  const feeBps = BigInt(getFeeBps(invoice));
  const platformFee = (total * feeBps) / BigInt(10_000);
  const distributable = total - platformFee;
  const members = teamProfile.members ?? [];
  if (!members.length) return [];

  if (isPercentageSplit(teamProfile.splitType as SplitType)) {
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
  const [usdcMint, setUsdcMint] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const invoicePubkey = new PublicKey(invoiceId);
        const invoiceAccount = await connection.getAccountInfo(invoicePubkey, "confirmed");
        if (!invoiceAccount) throw new Error("Invoice account not found on this cluster");
        const decodedInvoice = decodeInvoiceAccount(invoiceAccount.data) as InvoiceRecord;
        const teamProfilePubkey = getTeamProfilePubkey(decodedInvoice);
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

  async function handlePay() {
    if (!connected || !publicKey) return toast.error("Connect your wallet first");
    if (!usdcMint.trim()) return toast.error("Enter a USDC mint address first");
    setIsPaying(true);
    try {
      const response = await fetch(`/api/actions/pay-invoice/${invoiceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58(), payload: { usdcMint: usdcMint.trim() } }),
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
              <p><span className="text-muted-foreground">Amount:</span> {invoice ? asUsdc(BigInt(invoice.amount)) : "0.000000"} USDC</p>
              <p><span className="text-muted-foreground">Due date:</span> {invoice ? new Date(getDueDateUnix(invoice) * 1000).toLocaleString("en-US") : "-"}</p>
              <p><span className="text-muted-foreground">Platform fee:</span> {invoice ? (getFeeBps(invoice) / 100).toFixed(2) : "0.00"}%</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Split breakdown</p>
              {splitRows.length ? splitRows.map((row) => (
                <div key={row.wallet} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                  <span className="max-w-[70%] truncate text-muted-foreground">{row.wallet}</span>
                  <span>{asUsdc(row.amountRaw)} USDC</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">No members found in team profile.</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="usdc-mint" className="text-sm font-medium">USDC mint for this cluster</label>
              <input
                id="usdc-mint"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Enter USDC mint address"
                value={usdcMint}
                onChange={(event) => setUsdcMint(event.target.value)}
              />
            </div>
            <Button onClick={handlePay} disabled={isPaying || isLoading}>
              {isPaying ? "Preparing transaction..." : "Pay with Phantom"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

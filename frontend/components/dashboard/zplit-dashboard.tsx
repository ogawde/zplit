"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getZplitProgramId, zplitProgramIdl } from "@/lib/solana/zplit-program";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SavedTeamProfile = {
  label: string;
  pubkey: string;
};

type CreateInvoiceMethods = {
  createInvoice: (
    invoiceSeed: BN,
    amount: BN,
    description: string,
    dueDate: BN
  ) => {
    accounts: (accounts: {
      invoice: PublicKey;
      teamProfile: PublicKey;
      authority: PublicKey;
      systemProgram: PublicKey;
    }) => {
      rpc: () => Promise<string>;
    };
  };
};

const SAVED_TEAM_PROFILES_KEY = "zplit-team-profiles";

export function ZplitDashboard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = wallet;

  const [description, setDescription] = useState("");
  const [amountUsdc, setAmountUsdc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [teamProfilePubkey, setTeamProfilePubkey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blinkLink, setBlinkLink] = useState<string | null>(null);

  const savedTeamProfiles = useMemo<SavedTeamProfile[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(SAVED_TEAM_PROFILES_KEY) ?? "[]"
      ) as SavedTeamProfile[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const canSubmit =
    connected &&
    !!publicKey &&
    !!teamProfilePubkey &&
    !!description.trim() &&
    !!amountUsdc &&
    !!dueDate;

  async function handleCreateInvoice() {
    if (!publicKey) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!wallet.signTransaction || !anchorWallet) {
      toast.error("Wallet does not support transaction signing.");
      return;
    }

    const parsedAmount = Number(amountUsdc);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be greater than 0.");
      return;
    }

    const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
    if (!Number.isFinite(dueTimestamp) || dueTimestamp <= 0) {
      toast.error("Select a valid due date.");
      return;
    }

    let teamProfileKey: PublicKey;
    try {
      teamProfileKey = new PublicKey(teamProfilePubkey.trim());
    } catch {
      toast.error("Team profile public key is invalid.");
      return;
    }

    try {
      setIsSubmitting(true);
      setBlinkLink(null);
      const provider = new AnchorProvider(connection, anchorWallet, {
        commitment: "confirmed",
      });
      const program = new Program(zplitProgramIdl, provider);
      const methods = program.methods as unknown as CreateInvoiceMethods;

      const invoiceSeed = new BN(Date.now());
      const [invoicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("invoice"),
          teamProfileKey.toBuffer(),
          invoiceSeed.toArrayLike(Buffer, "le", 8),
        ],
        getZplitProgramId()
      );

      const amountInBaseUnits = new BN(Math.round(parsedAmount * 1_000_000));

      const signature = await methods
        .createInvoice(
          invoiceSeed,
          amountInBaseUnits,
          description.trim(),
          new BN(dueTimestamp)
        )
        .accounts({
          invoice: invoicePda,
          teamProfile: teamProfileKey,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const link = `${window.location.origin}/pay/${invoicePda.toBase58()}`;
      setBlinkLink(link);
      toast.success("Invoice created on-chain.", {
        description: `${signature.slice(0, 8)}...`,
      });
    } catch (error) {
      toast.error("Failed to create invoice.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {connected && publicKey
            ? `Connected: ${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
            : "Connect your Phantom wallet to manage teams and invoices."}
        </p>
      </div>

      <Tabs defaultValue="teams" className="w-full gap-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="teams">My Team Profiles</TabsTrigger>
          <TabsTrigger value="invoices">My Invoices</TabsTrigger>
          <TabsTrigger value="create">Create New</TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="mt-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Team profiles</CardTitle>
              <CardDescription>
                Saved split configurations will appear here in Phase 4.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                No teams yet — you&apos;ll create reusable profiles next phase.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                USDC invoices linked to a team will show here after Phase 5.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Nothing to show yet. Invoice creation and Blink links come in
                later phases.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="mt-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Create invoice</CardTitle>
              <CardDescription>
                Fill the form and call `create_invoice` on-chain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="team-profile">
                  Saved team profile
                </label>
                <select
                  id="team-profile"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={teamProfilePubkey}
                  onChange={(event) => setTeamProfilePubkey(event.target.value)}
                >
                  <option value="">Select a team profile</option>
                  {savedTeamProfiles.map((profile) => (
                    <option key={profile.pubkey} value={profile.pubkey}>
                      {profile.label}
                    </option>
                  ))}
                </select>
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="Or paste team profile pubkey"
                  value={teamProfilePubkey}
                  onChange={(event) => setTeamProfilePubkey(event.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="description">
                    Description
                  </label>
                  <input
                    id="description"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Website development milestone"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="amount">
                    Amount (USDC)
                  </label>
                  <input
                    id="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="100"
                    value={amountUsdc}
                    onChange={(event) => setAmountUsdc(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="due-date">
                  Due date
                </label>
                <input
                  id="due-date"
                  type="date"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <Button
                type="button"
                onClick={handleCreateInvoice}
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Invoice"}
              </Button>

              {blinkLink ? (
                <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
                  <p className="mb-1 font-medium text-primary">
                    Invoice created successfully
                  </p>
                  <a
                    className="break-all underline"
                    href={blinkLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {blinkLink}
                  </a>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

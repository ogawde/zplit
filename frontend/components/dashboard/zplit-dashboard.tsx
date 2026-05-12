"use client";

import Link from "next/link";
import {
  ArrowRight,
  Copy,
  FolderKanban,
  Link2,
  ReceiptText,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BPS_SCALE,
  PLATFORM_FEE_BPS,
  decodeInvoiceAccount,
  decodeTeamProfileAccount,
  formatUsdcAmount,
  getInvoiceAmountBaseUnits,
  getInvoiceDueDateUnix,
  getInvoicePlatformFeeBps,
  getInvoiceSeed,
  getInvoiceStatusLabel,
  getInvoiceTeamProfilePubkey,
  getTeamProfileName,
  getTeamProfileSplitKind,
  getZplitProgramId,
  isInvoiceAccountData,
  isTeamProfileAccountData,
  zplitProgramIdl,
} from "@/lib/solana/zplit-program";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DashboardTab = "teams" | "invoices" | "create";
type SavedTeamProfile = {
  label: string;
  pubkey: string;
};
type MemberInput = {
  id: string;
  wallet: string;
  value: string;
};
type SplitKind = "percentage" | "fixed";
type SplitTypeArg =
  | { percentage: Record<string, never> }
  | { fixed: Record<string, never> };
type MemberShareArg = {
  wallet: PublicKey;
  value: BN;
};
type LoadedTeamProfile = {
  publicKey: PublicKey;
  authority: PublicKey;
  teamName: string;
  splitKind: SplitKind;
  members: {
    wallet: PublicKey;
    value: bigint;
  }[];
  bump: number;
};
type LoadedInvoice = {
  publicKey: PublicKey;
  invoiceSeed: bigint;
  description: string;
  amount: bigint;
  dueDateUnix: number;
  teamProfilePubkey: PublicKey;
  payer: PublicKey;
  statusLabel: "Paid" | "Unpaid";
  platformFeeBps: number;
};

type DashboardMethods = {
  createTeamProfile: (
    teamName: string,
    splitType: SplitTypeArg,
    members: MemberShareArg[],
  ) => {
    accounts: (accounts: {
      teamProfile: PublicKey;
      authority: PublicKey;
      systemProgram: PublicKey;
    }) => {
      rpc: () => Promise<string>;
    };
  };
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

type Props = {
  initialTab?: string;
};

export function ZplitDashboard({ initialTab }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = wallet;

  const [activeTab, setActiveTab] = useState<DashboardTab>(() =>
    getInitialTab(initialTab ?? null),
  );
  const [savedTeamProfiles, setSavedTeamProfiles] = useState<SavedTeamProfile[]>([]);
  const [ownedTeamProfiles, setOwnedTeamProfiles] = useState<LoadedTeamProfile[]>(
    [],
  );
  const [ownedInvoices, setOwnedInvoices] = useState<LoadedInvoice[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [splitKind, setSplitKind] = useState<SplitKind>("percentage");
  const [memberInputs, setMemberInputs] = useState<MemberInput[]>([
    createMemberInput(),
    createMemberInput(),
  ]);
  const [isCreatingTeamProfile, setIsCreatingTeamProfile] = useState(false);

  const [description, setDescription] = useState("");
  const [amountUsdc, setAmountUsdc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [teamProfilePubkey, setTeamProfilePubkey] = useState("");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [blinkLink, setBlinkLink] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextProfiles = readSavedTeamProfiles();
    const frame = window.requestAnimationFrame(() => {
      setSavedTeamProfiles(nextProfiles);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const fetchDashboardData = useCallback(
    async (owner: PublicKey) => {
      const programAccounts = await connection.getProgramAccounts(
        getZplitProgramId(),
        {
          commitment: "confirmed",
        },
      );

      const teamProfiles = programAccounts
        .filter(({ account }) => isTeamProfileAccountData(account.data))
        .map(({ pubkey, account }) => {
          const decoded = decodeTeamProfileAccount(account.data);
          return {
            publicKey: pubkey,
            authority: decoded.authority,
            teamName: getTeamProfileName(decoded),
            splitKind: getTeamProfileSplitKind(decoded) ?? "percentage",
            members: decoded.members ?? [],
            bump: decoded.bump,
          } satisfies LoadedTeamProfile;
        })
        .filter((profile) => profile.authority.equals(owner))
        .sort((left, right) => left.teamName.localeCompare(right.teamName));

      const teamProfileKeys = new Set(
        teamProfiles.map((profile) => profile.publicKey.toBase58()),
      );

      const invoices = programAccounts
        .filter(({ account }) => isInvoiceAccountData(account.data))
        .map(({ pubkey, account }) => {
          const decoded = decodeInvoiceAccount(account.data);
          return {
            publicKey: pubkey,
            invoiceSeed: getInvoiceSeed(decoded),
            description: decoded.description ?? "",
            amount: getInvoiceAmountBaseUnits(decoded),
            dueDateUnix: getInvoiceDueDateUnix(decoded),
            teamProfilePubkey: getInvoiceTeamProfilePubkey(decoded),
            payer: decoded.payer,
            statusLabel: getInvoiceStatusLabel(decoded),
            platformFeeBps: getInvoicePlatformFeeBps(decoded),
          } satisfies LoadedInvoice;
        })
        .filter((invoice) =>
          teamProfileKeys.has(invoice.teamProfilePubkey.toBase58()),
        )
        .sort((left, right) => compareBigInts(right.invoiceSeed, left.invoiceSeed));

      return { teamProfiles, invoices };
    },
    [connection],
  );

  useEffect(() => {
    if (!connected || !publicKey) return;

    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setIsLoadingDashboard(true);
      }
    });

    void fetchDashboardData(publicKey)
      .then((data) => {
        if (cancelled) return;
        setOwnedTeamProfiles(data.teamProfiles);
        setOwnedInvoices(data.invoices);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error("Failed to load dashboard data.", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDashboard(false);
        }
      });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [connected, publicKey, fetchDashboardData]);

  const teamProfileOptions = useMemo(() => {
    const optionMap = new Map<string, SavedTeamProfile>();

    for (const profile of savedTeamProfiles) {
      optionMap.set(profile.pubkey, profile);
    }

    for (const profile of ownedTeamProfiles) {
      optionMap.set(profile.publicKey.toBase58(), {
        pubkey: profile.publicKey.toBase58(),
        label: `${profile.teamName} · ${profile.splitKind}`,
      });
    }

    return [...optionMap.values()];
  }, [ownedTeamProfiles, savedTeamProfiles]);

  const teamProfileByPubkey = useMemo(
    () =>
      new Map(
        ownedTeamProfiles.map((profile) => [profile.publicKey.toBase58(), profile]),
      ),
    [ownedTeamProfiles],
  );
  const displayedTeamProfiles = connected ? ownedTeamProfiles : [];
  const displayedInvoices = connected ? ownedInvoices : [];

  const selectedTeamProfile = useMemo(
    () => teamProfileByPubkey.get(teamProfilePubkey.trim()) ?? null,
    [teamProfileByPubkey, teamProfilePubkey],
  );

  const canCreateInvoice =
    connected &&
    !!publicKey &&
    !!teamProfilePubkey &&
    !!description.trim() &&
    !!amountUsdc &&
    !!dueDate;

  const canCreateTeamProfile =
    connected &&
    !!publicKey &&
    !!teamName.trim() &&
    memberInputs.some(
      (member) => member.wallet.trim() && member.value.trim(),
    );
  const draftMemberCount = memberInputs.filter(
    (member) => member.wallet.trim() || member.value.trim(),
  ).length;
  const draftShareTotal = memberInputs.reduce((sum, member) => {
    const parsedValue = Number(member.value);
    return Number.isFinite(parsedValue) ? sum + parsedValue : sum;
  }, 0);
  const paidInvoicesCount = displayedInvoices.filter(
    (invoice) => invoice.statusLabel === "Paid",
  ).length;
  const unpaidInvoicesCount = displayedInvoices.length - paidInvoicesCount;
  const outstandingInvoiceTotal = displayedInvoices.reduce((sum, invoice) => {
    if (invoice.statusLabel === "Paid") return sum;
    return sum + invoice.amount;
  }, BigInt(0));

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  }

  function createPayLink(invoicePubkey: string) {
    if (typeof window === "undefined") return `/pay/${invoicePubkey}`;
    return `${window.location.origin}/pay/${invoicePubkey}`;
  }

  async function handleCreateTeamProfile() {
    if (!publicKey) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!wallet.signTransaction || !anchorWallet) {
      toast.error("Wallet does not support transaction signing.");
      return;
    }

    const preparedMembers = prepareMemberInputs(memberInputs, splitKind);
    if (!preparedMembers.ok) {
      toast.error(preparedMembers.message);
      return;
    }

    try {
      setIsCreatingTeamProfile(true);

      const provider = new AnchorProvider(connection, anchorWallet, {
        commitment: "confirmed",
      });
      const program = new Program(zplitProgramIdl, provider);
      const methods = program.methods as unknown as DashboardMethods;

      const trimmedTeamName = teamName.trim();
      const [teamProfilePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("team-profile"),
          publicKey.toBuffer(),
          Buffer.from(trimmedTeamName),
        ],
        getZplitProgramId(),
      );

      const signature = await methods
        .createTeamProfile(
          trimmedTeamName,
          splitKind === "percentage" ? { percentage: {} } : { fixed: {} },
          preparedMembers.members,
        )
        .accounts({
          teamProfile: teamProfilePda,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await connection.confirmTransaction(signature, "confirmed");

      const nextSavedProfiles = upsertSavedTeamProfile(savedTeamProfiles, {
        pubkey: teamProfilePda.toBase58(),
        label: `${trimmedTeamName} · ${splitKind}`,
      });
      setSavedTeamProfiles(nextSavedProfiles);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          SAVED_TEAM_PROFILES_KEY,
          JSON.stringify(nextSavedProfiles),
        );
      }

      const refreshedData = await fetchDashboardData(publicKey);
      setOwnedTeamProfiles(refreshedData.teamProfiles);
      setOwnedInvoices(refreshedData.invoices);

      setTeamName("");
      setSplitKind("percentage");
      setMemberInputs([createMemberInput(), createMemberInput()]);
      setTeamProfilePubkey(teamProfilePda.toBase58());

      toast.success("Team profile created on-chain.", {
        description: `${signature.slice(0, 8)}...`,
      });
    } catch (error) {
      toast.error("Failed to create team profile.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsCreatingTeamProfile(false);
    }
  }

  async function handleCreateInvoice() {
    if (!publicKey) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!wallet.signTransaction || !anchorWallet) {
      toast.error("Wallet does not support transaction signing.");
      return;
    }

    let teamProfileKey: PublicKey;
    try {
      teamProfileKey = new PublicKey(teamProfilePubkey.trim());
    } catch {
      toast.error("Team profile public key is invalid.");
      return;
    }

    const parsedAmount = Number(amountUsdc);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Amount must be greater than 0.");
      return;
    }

    const amountInBaseUnits = BigInt(Math.round(parsedAmount * 1_000_000));
    if (selectedTeamProfile?.splitKind === "fixed") {
      const fixedTotal = selectedTeamProfile.members.reduce(
        (sum, member) => sum + member.value,
        BigInt(0),
      );
      const distributable =
        amountInBaseUnits -
        (amountInBaseUnits * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS_SCALE);

      if (distributable !== fixedTotal) {
        toast.error("Fixed split team profile does not match this invoice.", {
          description: `After the 0.30% fee, this invoice leaves ${formatUsdcAmount(distributable)} USDC but the team profile expects ${formatUsdcAmount(fixedTotal)} USDC.`,
        });
        return;
      }
    }

    const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
    if (!Number.isFinite(dueTimestamp) || dueTimestamp <= 0) {
      toast.error("Select a valid due date.");
      return;
    }

    try {
      setIsCreatingInvoice(true);
      setBlinkLink(null);
      const provider = new AnchorProvider(connection, anchorWallet, {
        commitment: "confirmed",
      });
      const program = new Program(zplitProgramIdl, provider);
      const methods = program.methods as unknown as DashboardMethods;

      const invoiceSeed = new BN(Date.now());
      const [invoicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("invoice"),
          teamProfileKey.toBuffer(),
          invoiceSeed.toArrayLike(Buffer, "le", 8),
        ],
        getZplitProgramId()
      );

      const signature = await methods
        .createInvoice(
          invoiceSeed,
          new BN(amountInBaseUnits.toString()),
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

      await connection.confirmTransaction(signature, "confirmed");

      const link = `${window.location.origin}/pay/${invoicePda.toBase58()}`;
      setBlinkLink(link);

      const refreshedData = await fetchDashboardData(publicKey);
      setOwnedTeamProfiles(refreshedData.teamProfiles);
      setOwnedInvoices(refreshedData.invoices);

      toast.success("Invoice created on-chain.", {
        description: `${signature.slice(0, 8)}...`,
      });
    } catch (error) {
      toast.error("Failed to create invoice.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsCreatingInvoice(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-sm backdrop-blur-sm sm:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_70%)]" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <Badge variant="outline" className="border-primary/20 bg-primary/8 text-primary">
              USDC team payouts
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Create invoices once. Split payouts automatically.
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                Build reusable team profiles, issue payment links in seconds,
                and keep invoice status visible from one clean dashboard.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" size="lg" onClick={() => setActiveTab("create")}>
                Create invoice
                <ArrowRight className="size-4" />
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => setActiveTab("teams")}
              >
                Manage teams
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {connected && publicKey
                ? `Connected wallet: ${truncateAddress(publicKey.toBase58())}`
                : "Connect your Phantom wallet to create team profiles and publish payment links."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
            <OverviewCard
              icon={<Users className="size-4" />}
              label="Teams"
              value={String(displayedTeamProfiles.length)}
              description={
                connected
                  ? "Reusable payout groups"
                  : "Connect wallet to load"
              }
            />
            <OverviewCard
              icon={<ReceiptText className="size-4" />}
              label="Invoices"
              value={String(displayedInvoices.length)}
              description={
                connected
                  ? `${paidInvoicesCount} paid · ${unpaidInvoicesCount} unpaid`
                  : "Connect wallet to load"
              }
            />
            <OverviewCard
              icon={<Wallet className="size-4" />}
              label="Outstanding"
              value={`${formatUsdcAmount(outstandingInvoiceTotal)} USDC`}
              description="Open invoices still waiting for payment"
            />
          </div>
        </div>
      </section>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DashboardTab)}
        className="w-full gap-6"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3 rounded-2xl bg-muted/70 p-1">
          <TabsTrigger value="teams">My Team Profiles</TabsTrigger>
          <TabsTrigger value="invoices">My Invoices</TabsTrigger>
          <TabsTrigger value="create">Create Invoice</TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-border/80">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>Create team profile</CardTitle>
                    <CardDescription>
                      Save a payout setup once so every future invoice is faster
                      to issue.
                    </CardDescription>
                  </div>
                  <StatusBadge label={capitalize(splitKind)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/35 p-4 sm:grid-cols-3">
                  <SummaryStat
                    label="Members"
                    value={String(draftMemberCount)}
                    hint="People included right now"
                  />
                  <SummaryStat
                    label={splitKind === "percentage" ? "Allocated" : "Draft total"}
                    value={
                      splitKind === "percentage"
                        ? `${draftShareTotal.toFixed(2)}%`
                        : `${draftShareTotal.toFixed(2)} USDC`
                    }
                    hint={
                      splitKind === "percentage"
                        ? draftShareTotal === 100
                          ? "Ready to publish"
                          : "Needs to total 100%"
                        : "Matches fixed invoice payouts"
                    }
                  />
                  <SummaryStat
                    label="Profile type"
                    value={capitalize(splitKind)}
                    hint="Choose per-team payout logic"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="team-name">
                    Team name
                  </label>
                  <Input
                    id="team-name"
                    placeholder="Design team"
                    value={teamName}
                    onChange={(event) => setTeamName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="split-kind">
                    Split type
                  </label>
                  <Select
                    id="split-kind"
                    value={splitKind}
                    onChange={(event) =>
                      setSplitKind(event.target.value as SplitKind)
                    }
                  >
                    <option value="percentage">Percentage split</option>
                    <option value="fixed">Fixed payouts</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {splitKind === "percentage"
                      ? "Use percentages when each invoice amount can change but the member ratios stay the same."
                      : "Use fixed payouts when every member should receive a fixed USDC amount from each invoice."}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Members</p>
                      <p className="text-xs text-muted-foreground">
                        Add each payout wallet and its share.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setMemberInputs((current) => [
                          ...current,
                          createMemberInput(),
                        ])
                      }
                    >
                      Add member
                    </Button>
                  </div>

                  {memberInputs.map((member, index) => (
                    <div
                      key={member.id}
                      className="rounded-2xl border border-border/70 bg-background/50 p-4 transition-all duration-200 hover:border-primary/25 hover:bg-background/70"
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">
                            Member {index + 1}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {splitKind === "percentage"
                              ? "Wallet plus percentage share"
                              : "Wallet plus fixed USDC payout"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={memberInputs.length === 1}
                          onClick={() =>
                            setMemberInputs((current) =>
                              current.filter(
                                (currentMember) =>
                                  currentMember.id !== member.id,
                              ),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label
                            className="text-sm font-medium"
                            htmlFor={`member-wallet-${member.id}`}
                          >
                            Wallet address
                          </label>
                          <Input
                            id={`member-wallet-${member.id}`}
                            placeholder="Paste Solana wallet address"
                            value={member.wallet}
                            onChange={(event) =>
                              setMemberInputs((current) =>
                                current.map((currentMember) =>
                                  currentMember.id === member.id
                                    ? {
                                        ...currentMember,
                                        wallet: event.target.value,
                                      }
                                    : currentMember,
                                ),
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <label
                            className="text-sm font-medium"
                            htmlFor={`member-value-${member.id}`}
                          >
                            {splitKind === "percentage"
                              ? "Share (%)"
                              : "Amount (USDC)"}
                          </label>
                          <Input
                            id={`member-value-${member.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={splitKind === "percentage" ? "50" : "250"}
                            value={member.value}
                            onChange={(event) =>
                              setMemberInputs((current) =>
                                current.map((currentMember) =>
                                  currentMember.id === member.id
                                    ? {
                                        ...currentMember,
                                        value: event.target.value,
                                      }
                                    : currentMember,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  size="lg"
                  onClick={handleCreateTeamProfile}
                  disabled={!canCreateTeamProfile || isCreatingTeamProfile}
                >
                  {isCreatingTeamProfile
                    ? "Creating team..."
                    : "Save team profile"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle>Your team profiles</CardTitle>
                <CardDescription>
                  Profiles saved on-chain for the connected wallet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingDashboard ? (
                  <DashboardListSkeleton />
                ) : displayedTeamProfiles.length ? (
                  displayedTeamProfiles.map((profile) => (
                    <div
                      key={profile.publicKey.toBase58()}
                      className="rounded-2xl border border-border/70 bg-background/50 p-4 transition-all duration-200 hover:border-primary/25 hover:bg-background/70 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold">{profile.teamName}</p>
                          <p className="text-xs text-muted-foreground">
                            {truncateAddress(profile.publicKey.toBase58())}
                          </p>
                        </div>
                        <StatusBadge label={capitalize(profile.splitKind)} />
                      </div>

                      <div className="mt-4 space-y-2">
                        {profile.members.map((member, index) => (
                          <div
                            key={`${member.wallet.toBase58()}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                          >
                            <span className="max-w-[70%] truncate text-muted-foreground">
                              {truncateAddress(member.wallet.toBase58())}
                            </span>
                            <span className="font-medium">
                              {profile.splitKind === "percentage"
                                ? `${(Number(member.value) / 100).toFixed(2)}%`
                                : `${formatUsdcAmount(member.value)} USDC`}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setTeamProfilePubkey(profile.publicKey.toBase58());
                            setActiveTab("create");
                          }}
                        >
                          Create invoice
                          <ArrowRight className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void handleCopy(
                              profile.publicKey.toBase58(),
                              "Team profile address",
                            )
                          }
                        >
                          Copy address
                          <Copy className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    icon={<Users className="size-5" />}
                    title="No team profiles yet"
                    description="Create your first reusable payout team and it will appear here automatically."
                    action={
                      <Button type="button" onClick={() => setActiveTab("teams")}>
                        Start with a team profile
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>My invoices</CardTitle>
              <CardDescription>
                Track payment status, share pay pages, and reopen invoice links.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingDashboard ? (
                <DashboardGridSkeleton />
              ) : displayedInvoices.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {displayedInvoices.map((invoice) => {
                    const profile =
                      teamProfileByPubkey.get(invoice.teamProfilePubkey.toBase58()) ??
                      null;
                    const payLink = createPayLink(invoice.publicKey.toBase58());

                    return (
                      <div
                        key={invoice.publicKey.toBase58()}
                        className="rounded-2xl border border-border/70 bg-background/50 p-4 transition-all duration-200 hover:border-primary/25 hover:bg-background/70 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold">
                              {invoice.description || "Untitled invoice"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {truncateAddress(invoice.publicKey.toBase58())}
                            </p>
                          </div>
                          <StatusBadge label={invoice.statusLabel} />
                        </div>

                        <p className="mt-5 text-2xl font-semibold tracking-tight">
                          {formatUsdcAmount(invoice.amount)}
                          <span className="ml-1 text-sm font-medium text-muted-foreground">
                            USDC
                          </span>
                        </p>

                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                          <DetailItem
                            label="Due date"
                            value={new Date(invoice.dueDateUnix * 1000).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          />
                          <DetailItem
                            label="Team"
                            value={
                              profile?.teamName ??
                              truncateAddress(invoice.teamProfilePubkey.toBase58())
                            }
                          />
                          <DetailItem
                            label="Platform fee"
                            value={`${(invoice.platformFeeBps / 100).toFixed(2)}%`}
                          />
                          <DetailItem
                            label="Invoice seed"
                            value={invoice.invoiceSeed.toString()}
                          />
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <Link
                            href={`/pay/${invoice.publicKey.toBase58()}`}
                            className={buttonVariants({ variant: "outline" })}
                          >
                            {invoice.statusLabel === "Paid"
                              ? "View pay page"
                              : "Open pay page"}
                          </Link>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleCopy(payLink, "Pay link")}
                          >
                            Copy pay link
                            <Link2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<ReceiptText className="size-5" />}
                  title="No invoices yet"
                  description="Create an invoice from one of your team profiles and it will show up here with a paid or unpaid status."
                  action={
                    <Button type="button" onClick={() => setActiveTab("create")}>
                      Create your first invoice
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle>Create invoice</CardTitle>
                <CardDescription>
                  Choose a team profile, set the invoice details, and generate a
                  payment link ready to share.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {teamProfileOptions.length ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="team-profile">
                        Team profile
                      </label>
                      <Select
                        id="team-profile"
                        value={teamProfilePubkey}
                        onChange={(event) =>
                          setTeamProfilePubkey(event.target.value)
                        }
                      >
                        <option value="">Select a team profile</option>
                        {teamProfileOptions.map((profile) => (
                          <option key={profile.pubkey} value={profile.pubkey}>
                            {profile.label}
                          </option>
                        ))}
                      </Select>
                      {selectedTeamProfile ? (
                        <p className="text-xs text-muted-foreground">
                          Using {selectedTeamProfile.teamName} with a{" "}
                          {selectedTeamProfile.splitKind} payout setup.
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="description">
                          Description
                        </label>
                        <Input
                          id="description"
                          placeholder="Website design milestone"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="amount">
                          Amount (USDC)
                        </label>
                        <Input
                          id="amount"
                          type="number"
                          min="0"
                          step="0.01"
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
                      <Input
                        id="due-date"
                        type="date"
                        className="sm:max-w-xs"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                      />
                    </div>

                    <Button
                      type="button"
                      size="lg"
                      onClick={handleCreateInvoice}
                      disabled={!canCreateInvoice || isCreatingInvoice}
                    >
                      {isCreatingInvoice ? "Creating invoice..." : "Create invoice"}
                    </Button>
                  </>
                ) : (
                  <EmptyState
                    icon={<FolderKanban className="size-5" />}
                    title="Create a team profile first"
                    description="Invoices use a saved team profile so Zplit knows exactly how to split the payment."
                    action={
                      <Button type="button" onClick={() => setActiveTab("teams")}>
                        Go to team profiles
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle>Invoice preview</CardTitle>
                <CardDescription>
                  Review the team receiving payout splits before you share the
                  pay link.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTeamProfile ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold">
                            {selectedTeamProfile.teamName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {truncateAddress(
                              selectedTeamProfile.publicKey.toBase58(),
                            )}
                          </p>
                        </div>
                        <StatusBadge
                          label={capitalize(selectedTeamProfile.splitKind)}
                        />
                      </div>
                      <div className="mt-4 space-y-2">
                        {selectedTeamProfile.members.map((member, index) => (
                          <div
                            key={`${member.wallet.toBase58()}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"
                          >
                            <span className="max-w-[70%] truncate text-muted-foreground">
                              {truncateAddress(member.wallet.toBase58())}
                            </span>
                            <span className="font-medium">
                              {selectedTeamProfile.splitKind === "percentage"
                                ? `${(Number(member.value) / 100).toFixed(2)}%`
                                : `${formatUsdcAmount(member.value)} USDC`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedTeamProfile.splitKind === "fixed" ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                        Fixed payout teams require the invoice amount to match
                        the exact member totals after the 0.30% platform fee.
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                        Percentage teams scale automatically with any invoice
                        amount you create.
                      </div>
                    )}

                    {blinkLink ? (
                      <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="font-semibold text-primary">
                              Payment link ready
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Share this page with your client to collect the
                              payment.
                            </p>
                          </div>
                          <Sparkles className="mt-1 size-4 text-primary" />
                        </div>
                        <a
                          className="mt-4 block break-all text-sm text-primary underline underline-offset-4"
                          href={blinkLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {blinkLink}
                        </a>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <a
                            href={blinkLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({ variant: "outline" })}
                          >
                            Open pay page
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleCopy(blinkLink, "Pay link")}
                          >
                            Copy pay link
                            <Copy className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
                        <p className="text-sm font-semibold">What happens next</p>
                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                          <li>1. The invoice is created on-chain.</li>
                          <li>2. Zplit generates a public pay page instantly.</li>
                          <li>3. Your client pays once and the team split happens automatically.</li>
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    icon={<Wallet className="size-5" />}
                    title="Select a team profile"
                    description="Pick a payout team to preview how the invoice will be routed when it gets paid."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  const variant =
    label === "Paid"
      ? "success"
      : label === "Unpaid"
        ? "warning"
        : "secondary";

  return (
    <Badge variant={variant}>
      {label}
    </Badge>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-primary/20 hover:bg-background/85">
      <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="text-base font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DashboardListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-2xl border border-border/70 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-40" />
        </div>
      ))}
    </div>
  );
}

function DashboardGridSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="space-y-4 rounded-2xl border border-border/70 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-8 w-28" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
      ))}
    </div>
  );
}

function prepareMemberInputs(memberInputs: MemberInput[], splitKind: SplitKind) {
  const populatedMembers = memberInputs.filter(
    (member) => member.wallet.trim() || member.value.trim(),
  );

  if (!populatedMembers.length) {
    return {
      ok: false as const,
      message: "Add at least one member before creating a team profile.",
    };
  }

  try {
    const members = populatedMembers.map((member) => {
      const wallet = new PublicKey(member.wallet.trim());
      const parsedValue = Number(member.value);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error("Each member needs a positive value.");
      }

      const value =
        splitKind === "percentage"
          ? Math.round(parsedValue * 100)
          : Math.round(parsedValue * 1_000_000);

      return {
        wallet,
        value: new BN(value),
      };
    });

    if (splitKind === "percentage") {
      const total = members.reduce(
        (sum, member) => sum + member.value.toNumber(),
        0,
      );
      if (total !== BPS_SCALE) {
        return {
          ok: false as const,
          message: "Percentage splits must total exactly 100.",
        };
      }
    }

    return { ok: true as const, members };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Member data is invalid.",
    };
  }
}

function createMemberInput(): MemberInput {
  return {
    id: Math.random().toString(36).slice(2, 10),
    wallet: "",
    value: "",
  };
}

function getInitialTab(tab: string | null): DashboardTab {
  if (tab === "invoices" || tab === "create" || tab === "teams") {
    return tab;
  }
  return "teams";
}

function upsertSavedTeamProfile(
  currentProfiles: SavedTeamProfile[],
  nextProfile: SavedTeamProfile,
) {
  const profileMap = new Map(
    currentProfiles.map((profile) => [profile.pubkey, profile]),
  );
  profileMap.set(nextProfile.pubkey, nextProfile);
  return [...profileMap.values()];
}

function readSavedTeamProfiles() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SAVED_TEAM_PROFILES_KEY) ?? "[]",
    ) as SavedTeamProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compareBigInts(left: bigint, right: bigint) {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncateAddress(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

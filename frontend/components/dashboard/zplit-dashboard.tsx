"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useCallback, useEffect, useMemo, useState } from "react";
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

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DashboardTab)}
        className="w-full gap-6"
      >
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="teams">My Team Profiles</TabsTrigger>
          <TabsTrigger value="invoices">My Invoices</TabsTrigger>
          <TabsTrigger value="create">Create New</TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle>Create team profile</CardTitle>
                <CardDescription>
                  Add a reusable payout team for future invoices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="team-name">
                    Team name
                  </label>
                  <input
                    id="team-name"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder="Core contributors"
                    value={teamName}
                    onChange={(event) => setTeamName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="split-kind">
                    Split type
                  </label>
                  <select
                    id="split-kind"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={splitKind}
                    onChange={(event) =>
                      setSplitKind(event.target.value as SplitKind)
                    }
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  <p className="text-muted-foreground text-xs">
                    {splitKind === "percentage"
                      ? "Enter member shares as percentages. Totals must equal 100."
                      : "Enter exact member payout amounts in USDC. Fixed profiles require matching invoice amounts later."}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Members</p>
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
                      className="rounded-md border border-border/80 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium">Member {index + 1}</p>
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
                            Wallet
                          </label>
                          <input
                            id={`member-wallet-${member.id}`}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            placeholder="Recipient wallet pubkey"
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
                          <input
                            id={`member-value-${member.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  onClick={handleCreateTeamProfile}
                  disabled={!canCreateTeamProfile || isCreatingTeamProfile}
                >
                  {isCreatingTeamProfile
                    ? "Creating team..."
                    : "Create Team Profile"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader>
                <CardTitle>Your team profiles</CardTitle>
                <CardDescription>
                  On-chain payout teams owned by this wallet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingDashboard ? (
                  <p className="text-muted-foreground text-sm">
                    Loading team profiles...
                  </p>
                ) : displayedTeamProfiles.length ? (
                  displayedTeamProfiles.map((profile) => (
                    <div
                      key={profile.publicKey.toBase58()}
                      className="space-y-3 rounded-md border border-border/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{profile.teamName}</p>
                          <p className="text-muted-foreground break-all text-xs">
                            {profile.publicKey.toBase58()}
                          </p>
                        </div>
                        <StatusBadge label={capitalize(profile.splitKind)} />
                      </div>

                      <div className="space-y-2">
                        {profile.members.map((member, index) => (
                          <div
                            key={`${member.wallet.toBase58()}-${index}`}
                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"
                          >
                            <span className="text-muted-foreground max-w-[70%] truncate">
                              {member.wallet.toBase58()}
                            </span>
                            <span>
                              {profile.splitKind === "percentage"
                                ? `${(Number(member.value) / 100).toFixed(2)}%`
                                : `${formatUsdcAmount(member.value)} USDC`}
                            </span>
                          </div>
                        ))}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setTeamProfilePubkey(profile.publicKey.toBase58());
                          setActiveTab("create");
                        }}
                      >
                        Use in Create New
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No team profiles yet. Create one to reuse split setups.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                USDC invoices linked to your selected team profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingDashboard ? (
                <p className="text-muted-foreground text-sm">
                  Loading invoices...
                </p>
              ) : displayedInvoices.length ? (
                displayedInvoices.map((invoice) => {
                  const profile =
                    teamProfileByPubkey.get(invoice.teamProfilePubkey.toBase58()) ??
                    null;

                  return (
                    <div
                      key={invoice.publicKey.toBase58()}
                      className="space-y-3 rounded-md border border-border/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">
                            {invoice.description || "Untitled invoice"}
                          </p>
                          <p className="text-muted-foreground break-all text-xs">
                            {invoice.publicKey.toBase58()}
                          </p>
                        </div>
                        <StatusBadge label={invoice.statusLabel} />
                      </div>

                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <p>
                          <span className="text-muted-foreground">Amount:</span>{" "}
                          {formatUsdcAmount(invoice.amount)} USDC
                        </p>
                        <p>
                          <span className="text-muted-foreground">Due date:</span>{" "}
                          {new Date(invoice.dueDateUnix * 1000).toLocaleString(
                            "en-US",
                          )}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Team:</span>{" "}
                          {profile?.teamName ?? invoice.teamProfilePubkey.toBase58()}
                        </p>
                        <p>
                          <span className="text-muted-foreground">
                            Platform fee:
                          </span>{" "}
                          {(invoice.platformFeeBps / 100).toFixed(2)}%
                        </p>
                      </div>

                      <Link
                        href={`/pay/${invoice.publicKey.toBase58()}`}
                        className={buttonVariants({ variant: "outline" })}
                      >
                        {invoice.statusLabel === "Paid"
                          ? "View invoice"
                          : "Open pay page"}
                      </Link>
                    </div>
                  );
                })
              ) : (
                <p className="text-muted-foreground text-sm">
                  No invoices yet. Invoices tied to team profiles owned by this
                  wallet will appear here.
                </p>
              )}
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
              <p className="text-muted-foreground text-xs">
                Only invoices linked to team profiles owned by this wallet will
                appear in `My Invoices`.
              </p>

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
                  {teamProfileOptions.map((profile) => (
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
                {selectedTeamProfile ? (
                  <p className="text-muted-foreground text-xs">
                    Using {selectedTeamProfile.teamName} with a{" "}
                    {selectedTeamProfile.splitKind} split.
                  </p>
                ) : null}
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
                disabled={!canCreateInvoice || isCreatingInvoice}
              >
                {isCreatingInvoice ? "Creating..." : "Create Invoice"}
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

function StatusBadge({ label }: { label: string }) {
  const isPositive = label === "Paid" || label === "Percentage";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isPositive
          ? "bg-primary/15 text-primary"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      {label}
    </span>
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

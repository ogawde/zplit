import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export const DEFAULT_ZPLIT_PROGRAM_ID =
  "rMgTnbVPZKkY5xFcvQhCctohTpS3GagWQEwciLMFUSV";
export const PLATFORM_FEE_BPS = 30;
export const BPS_SCALE = 10_000;
export const USDC_DECIMALS = BigInt(1_000_000);

const TEAM_PROFILE_DISCRIMINATOR = [77, 170, 207, 206, 63, 142, 104, 25];
const INVOICE_DISCRIMINATOR = [51, 194, 250, 114, 6, 104, 18, 164];

export const zplitProgramIdl: Idl = {
  address: DEFAULT_ZPLIT_PROGRAM_ID,
  metadata: {
    name: "zplit_program",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "create_invoice",
      discriminator: [154, 170, 31, 135, 134, 100, 156, 146],
      accounts: [
        { name: "invoice", writable: true, signer: false },
        { name: "team_profile", writable: false, signer: false },
        { name: "authority", writable: true, signer: true },
        { name: "system_program", writable: false, signer: false },
      ],
      args: [
        { name: "invoice_seed", type: "u64" },
        { name: "amount", type: "u64" },
        { name: "description", type: "string" },
        { name: "due_date", type: "i64" },
      ],
    },
    {
      name: "create_team_profile",
      discriminator: [235, 160, 30, 171, 34, 15, 217, 77],
      accounts: [
        { name: "team_profile", writable: true, signer: false },
        { name: "authority", writable: true, signer: true },
        { name: "system_program", writable: false, signer: false },
      ],
      args: [
        { name: "team_name", type: "string" },
        { name: "split_type", type: { defined: { name: "SplitType" } } },
        {
          name: "members",
          type: { vec: { defined: { name: "MemberShareInput" } } },
        },
      ],
    },
    {
      name: "pay_invoice",
      discriminator: [104, 6, 62, 239, 197, 206, 208, 220],
      accounts: [
        { name: "invoice", writable: true, signer: false },
        { name: "team_profile", writable: false, signer: false },
        { name: "payer", writable: true, signer: true },
        { name: "payer_usdc_ata", writable: true, signer: false },
        { name: "usdc_mint", writable: false, signer: false },
        { name: "token_program", writable: false, signer: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "TeamProfile",
      discriminator: [77, 170, 207, 206, 63, 142, 104, 25],
    },
    {
      name: "Invoice",
      discriminator: [51, 194, 250, 114, 6, 104, 18, 164],
    },
  ],
  types: [
    {
      name: "SplitType",
      type: {
        kind: "enum",
        variants: [{ name: "Percentage" }, { name: "Fixed" }],
      },
    },
    {
      name: "InvoiceStatus",
      type: {
        kind: "enum",
        variants: [{ name: "Unpaid" }, { name: "Paid" }],
      },
    },
    {
      name: "MemberShare",
      type: {
        kind: "struct",
        fields: [
          { name: "wallet", type: "pubkey" },
          { name: "value", type: "u64" },
        ],
      },
    },
    {
      name: "MemberShareInput",
      type: {
        kind: "struct",
        fields: [
          { name: "wallet", type: "pubkey" },
          { name: "value", type: "u64" },
        ],
      },
    },
    {
      name: "TeamProfile",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "team_name", type: "string" },
          { name: "split_type", type: { defined: { name: "SplitType" } } },
          {
            name: "members",
            type: { vec: { defined: { name: "MemberShare" } } },
          },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Invoice",
      type: {
        kind: "struct",
        fields: [
          { name: "invoice_seed", type: "u64" },
          { name: "amount", type: "u64" },
          { name: "description", type: "string" },
          { name: "due_date", type: "i64" },
          { name: "team_profile_pubkey", type: "pubkey" },
          { name: "payer", type: "pubkey" },
          {
            name: "status",
            type: { defined: { name: "InvoiceStatus" } },
          },
          { name: "platform_fee_bps", type: "u16" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
};

export function getZplitProgramId(): PublicKey {
  const value =
    process.env.NEXT_PUBLIC_ZPLIT_PROGRAM_ID ?? DEFAULT_ZPLIT_PROGRAM_ID;
  return new PublicKey(value);
}

export type DecodedMemberShare = {
  wallet: PublicKey;
  value: bigint;
};

export type SplitVariant =
  | {
      percentage?: Record<string, never>;
      Percentage?: Record<string, never>;
      fixed?: Record<string, never>;
      Fixed?: Record<string, never>;
    }
  | undefined;

export type DecodedTeamProfile = {
  authority: PublicKey;
  teamName?: string;
  team_name?: string;
  splitType?: SplitVariant;
  split_type?: SplitVariant;
  members: DecodedMemberShare[];
  bump: number;
};

export type DecodedInvoice = {
  invoiceSeed?: bigint;
  invoice_seed?: bigint;
  amount: bigint;
  description: string;
  dueDate?: bigint;
  teamProfilePubkey?: PublicKey;
  team_profile_pubkey?: PublicKey;
  payer: PublicKey;
  status: {
    unpaid?: Record<string, never>;
    paid?: Record<string, never>;
    Unpaid?: Record<string, never>;
    Paid?: Record<string, never>;
  };
  platformFeeBps: number;
  platform_fee_bps?: number;
  bump: number;
  due_date?: bigint;
};

const accountsCoder = new BorshAccountsCoder(zplitProgramIdl as unknown as Idl);

export function decodeInvoiceAccount(data: Buffer): DecodedInvoice {
  return accountsCoder.decode("Invoice", data) as DecodedInvoice;
}

export function decodeTeamProfileAccount(data: Buffer): DecodedTeamProfile {
  return accountsCoder.decode("TeamProfile", data) as DecodedTeamProfile;
}

export function isTeamProfileAccountData(data: Buffer) {
  return hasDiscriminator(data, TEAM_PROFILE_DISCRIMINATOR);
}

export function isInvoiceAccountData(data: Buffer) {
  return hasDiscriminator(data, INVOICE_DISCRIMINATOR);
}

export function getTeamProfileName(teamProfile: DecodedTeamProfile) {
  return teamProfile.teamName ?? teamProfile.team_name ?? "Untitled team";
}

export function getTeamProfileSplitKind(teamProfile: DecodedTeamProfile) {
  const splitType = teamProfile.splitType ?? teamProfile.split_type;
  if (!splitType || typeof splitType !== "object") return null;
  if ("percentage" in splitType || "Percentage" in splitType) {
    return "percentage" as const;
  }
  if ("fixed" in splitType || "Fixed" in splitType) {
    return "fixed" as const;
  }
  return null;
}

export function getInvoiceAmountBaseUnits(invoice: DecodedInvoice) {
  return toBigIntValue(invoice.amount);
}

export function getInvoiceSeed(invoice: DecodedInvoice) {
  return toBigIntValue(invoice.invoiceSeed ?? invoice.invoice_seed);
}

export function getInvoiceDueDateUnix(invoice: DecodedInvoice) {
  return Number(toBigIntValue(invoice.dueDate ?? invoice.due_date));
}

export function getInvoicePlatformFeeBps(invoice: DecodedInvoice) {
  return Number(invoice.platformFeeBps ?? invoice.platform_fee_bps ?? 0);
}

export function getInvoiceTeamProfilePubkey(invoice: DecodedInvoice) {
  const candidate = invoice.teamProfilePubkey ?? invoice.team_profile_pubkey;
  if (!candidate) {
    throw new Error("Invoice missing team profile pubkey");
  }
  return candidate;
}

export function getInvoiceStatusLabel(invoice: DecodedInvoice) {
  if ("paid" in invoice.status || "Paid" in invoice.status) {
    return "Paid" as const;
  }
  return "Unpaid" as const;
}

export function isInvoicePaid(invoice: DecodedInvoice) {
  return getInvoiceStatusLabel(invoice) === "Paid";
}

export function formatUsdcAmount(value: bigint) {
  return (Number(value) / Number(USDC_DECIMALS)).toFixed(6);
}

export function getDistributableAmount(invoice: DecodedInvoice) {
  const amount = getInvoiceAmountBaseUnits(invoice);
  const platformFee =
    (amount * BigInt(getInvoicePlatformFeeBps(invoice))) / BigInt(BPS_SCALE);
  return amount - platformFee;
}

function hasDiscriminator(data: Buffer, discriminator: number[]) {
  if (data.length < discriminator.length) return false;
  return discriminator.every((value, index) => data[index] === value);
}

function toBigIntValue(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return BigInt(0);
}


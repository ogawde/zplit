import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export const DEFAULT_ZPLIT_PROGRAM_ID =
  "rMgTnbVPZKkY5xFcvQhCctohTpS3GagWQEwciLMFUSV";

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

export type DecodedTeamProfile = {
  authority: PublicKey;
  teamName: string;
  splitType: {
    percentage?: Record<string, never>;
    fixed?: Record<string, never>;
    Percentage?: Record<string, never>;
    Fixed?: Record<string, never>;
  };
  members: DecodedMemberShare[];
  bump: number;
};

export type DecodedInvoice = {
  invoiceSeed: bigint;
  amount: bigint;
  description: string;
  dueDate: bigint;
  teamProfilePubkey: PublicKey;
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


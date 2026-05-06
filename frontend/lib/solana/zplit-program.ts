import type { Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export const DEFAULT_ZPLIT_PROGRAM_ID =
  "5f19UuCzbvSCnZQtdHMv1fqghr9UjC7DvrwZ1QyhgdUH";

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
      discriminator: [0, 0, 0, 0, 0, 0, 0, 0],
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
  ],
};

export function getZplitProgramId(): PublicKey {
  const value =
    process.env.NEXT_PUBLIC_ZPLIT_PROGRAM_ID ?? DEFAULT_ZPLIT_PROGRAM_ID;
  return new PublicKey(value);
}


import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ZplitProgram } from "../target/types/zplit_program";

describe("zplit-program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.zplitProgram as Program<ZplitProgram>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const authority = provider.wallet.publicKey;

  it("creates team profile and invoice", async () => {
    const teamName = "core-team";
    const [teamProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("team-profile"), authority.toBuffer(), Buffer.from(teamName)],
      program.programId
    );

    await program.methods
      .createTeamProfile(teamName, { percentage: {} }, [
        { wallet: authority, value: new anchor.BN(6000) },
        { wallet: authority, value: new anchor.BN(4000) },
      ])
      .accounts({
        teamProfile: teamProfilePda,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const invoiceSeed = new anchor.BN(1);
    const [invoicePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("invoice"),
        teamProfilePda.toBuffer(),
        invoiceSeed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createInvoice(
        invoiceSeed,
        new anchor.BN(100_000_000), // 100 USDC with 6 decimals
        "Website development milestone",
        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
      )
      .accounts({
        invoice: invoicePda,
        teamProfile: teamProfilePda,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const invoice = await program.account.invoice.fetch(invoicePda);
    if (invoice.amount.toNumber() !== 100_000_000) {
      throw new Error("invoice amount mismatch");
    }
  });
});

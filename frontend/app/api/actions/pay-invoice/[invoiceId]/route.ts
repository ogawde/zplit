import { createPostResponse } from "@solana/actions";
import type { ActionGetResponse, ActionPostRequest } from "@solana/actions-spec";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  type DecodedInvoice,
  decodeInvoiceAccount,
  decodeTeamProfileAccount,
  zplitProgramIdl,
} from "@/lib/solana/zplit-program";

function getRpcEndpoint() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
}

function getProgramId() {
  const value = process.env.NEXT_PUBLIC_ZPLIT_PROGRAM_ID;
  if (!value) throw new Error("NEXT_PUBLIC_ZPLIT_PROGRAM_ID is not set");
  return new PublicKey(value);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

const PLATFORM_WALLET = new PublicKey("HhHkh5p3cMPrVibPdT8xPocA6ZXWzrv2jN6xj2krfqqe");

function toBigInt(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return BigInt(0);
}

function parseTeamProfilePubkey(value: DecodedInvoice): PublicKey {
  const candidate = value?.teamProfilePubkey ?? value?.team_profile_pubkey;
  if (!candidate) throw new Error("Invoice missing team profile pubkey");
  return candidate;
}

function parseInvoiceDescription(value: DecodedInvoice): string {
  return value?.description ?? "";
}

function parseInvoiceAmount(value: DecodedInvoice): bigint {
  return toBigInt(value?.amount);
}

function parseInvoiceDueDate(value: DecodedInvoice): bigint {
  return toBigInt(value?.dueDate ?? value?.due_date);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  const params = await context.params;
  const href = `${base}/api/actions/pay-invoice/${params.invoiceId}`;
  const connection = new Connection(getRpcEndpoint(), "confirmed");
  let title = "Pay Zplit invoice";
  let description = "One payment. Automatic splits. Instant team payouts.";

  try {
    const invoiceAccount = await connection.getAccountInfo(
      new PublicKey(params.invoiceId),
      "confirmed",
    );
    if (invoiceAccount) {
      const invoice = decodeInvoiceAccount(invoiceAccount.data);
      const amount = Number(parseInvoiceAmount(invoice)) / 1_000_000;
      const dueDateUnix = Number(parseInvoiceDueDate(invoice));
      const dueDateLabel = Number.isFinite(dueDateUnix)
        ? new Date(dueDateUnix * 1000).toLocaleDateString("en-US")
        : "Unknown";
      title = parseInvoiceDescription(invoice) || title;
      description = `Amount: ${amount.toFixed(2)} USDC · Due: ${dueDateLabel}`;
    }
  } catch {}

  const payload: ActionGetResponse = {
    title,
    description,
    label: "Pay invoice",
    icon: `${base}/favicon.ico`,
    links: {
      actions: [
        {
          type: "transaction",
          label: "Pay invoice",
          href,
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

type PayInvoicePayload = {
  usdcMint: string;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const body = (await req.json()) as ActionPostRequest & {
    payload?: PayInvoicePayload;
  };
  const params = await context.params;

  const account = body.account;
  if (!account) {
    return new NextResponse("Missing account", {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const payload = body.payload;
  if (!payload?.usdcMint) {
    return new NextResponse("Missing payload.usdcMint", {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const connection = new Connection(getRpcEndpoint(), "confirmed");
  const programId = getProgramId();
  const instructionCoder = new BorshInstructionCoder(zplitProgramIdl as unknown as Idl);

  const payer = new PublicKey(account);
  const invoice = new PublicKey(params.invoiceId);
  const usdcMint = new PublicKey(payload.usdcMint);
  const invoiceAccount = await connection.getAccountInfo(invoice, "confirmed");
  if (!invoiceAccount) {
    return new NextResponse("Invoice not found", {
      status: 404,
      headers: corsHeaders(),
    });
  }
  const decodedInvoice = decodeInvoiceAccount(invoiceAccount.data);
  const teamProfile = parseTeamProfilePubkey(decodedInvoice);
  const teamProfileAccount = await connection.getAccountInfo(teamProfile, "confirmed");
  if (!teamProfileAccount) {
    return new NextResponse("Team profile not found", {
      status: 404,
      headers: corsHeaders(),
    });
  }
  const decodedTeamProfile = decodeTeamProfileAccount(teamProfileAccount.data);
  const members = decodedTeamProfile.members ?? [];
  const payerUsdcAta = getAssociatedTokenAddressSync(usdcMint, payer, false, TOKEN_PROGRAM_ID);
  const memberAtas = members.map((member) =>
    getAssociatedTokenAddressSync(
      usdcMint,
      member.wallet,
      false,
      TOKEN_PROGRAM_ID,
    ),
  );
  const platformAta = getAssociatedTokenAddressSync(
    usdcMint,
    PLATFORM_WALLET,
    false,
    TOKEN_PROGRAM_ID,
  );
  const data = Buffer.from(instructionCoder.encode("pay_invoice", {}));

  const keys = [
    { pubkey: invoice, isSigner: false, isWritable: true },
    { pubkey: teamProfile, isSigner: false, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: payerUsdcAta, isSigner: false, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ...memberAtas.map((k) => ({
      pubkey: k,
      isSigner: false,
      isWritable: true,
    })),
    { pubkey: platformAta, isSigner: false, isWritable: true },
  ];

  const ix = new TransactionInstruction({
    programId,
    keys,
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = payer;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  const response = await createPostResponse({
    fields: {
      type: "transaction",
      transaction: tx,
      message: "Pay Zplit invoice",
    },
  });

  return new NextResponse(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}


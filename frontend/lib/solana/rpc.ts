import { PublicKey } from "@solana/web3.js";

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function getSolanaRpcEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (url?.trim()) return url.trim();
  return "http://127.0.0.1:8899";
}

export function getUsdcMintAddress(): string {
  const configured = process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS?.trim();
  if (configured) return configured;

  const rpc = getSolanaRpcEndpoint();
  if (rpc.includes("127.0.0.1") || rpc.includes("localhost")) {
    throw new Error(
      "NEXT_PUBLIC_USDC_MINT_ADDRESS is required for localnet payments.",
    );
  }

  if (rpc.includes("devnet")) {
    throw new Error(
      "NEXT_PUBLIC_USDC_MINT_ADDRESS is required for devnet payments.",
    );
  }

  return MAINNET_USDC_MINT;
}

export function getUsdcMintPublicKey(): PublicKey {
  return new PublicKey(getUsdcMintAddress());
}

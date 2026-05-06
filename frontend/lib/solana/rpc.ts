export function getSolanaRpcEndpoint(): string {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (url?.trim()) return url.trim();
  return "http://127.0.0.1:8899";
}

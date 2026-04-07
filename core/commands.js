import { getBalance, wallet, signMessage } from "./wallet.js";

export async function handleCommand(body) {
  const lower = body.toLowerCase().trim();

  if (lower.includes("!balance") || lower.match(/what.*(your|ur).*balance/)) {
    const bal = await getBalance();
    return `My wallet (${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}) holds ${bal ?? "?"} ETH`;
  }

  if (lower.includes("!address") || lower.includes("!wallet") || lower.match(/what.*(your|ur).*wallet/)) {
    return `My address: ${wallet.address}`;
  }

  const signMatch = body.match(/!sign\s+(.+)/i);
  if (signMatch) {
    const msg = signMatch[1].trim();
    const sig = await signMessage(msg);
    return `Signed "${msg}" → ${sig.slice(0,20)}...${sig.slice(-8)}`;
  }

  return null;
}

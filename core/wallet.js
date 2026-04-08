import { ethers } from "ethers";
import "dotenv/config";

// Derive wallet address offline — no provider needed
const privateKey = process.env.BOT_WALLET_PRIVATE_KEY;
export const wallet = privateKey ? new ethers.Wallet(privateKey) : null;

export async function getBalance() {
  if (!wallet) return null;
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [wallet.address, "latest"],
        id: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.result) {
      const wei = BigInt(data.result);
      return parseFloat(ethers.formatEther(wei)).toFixed(4);
    }
    return null;
  } catch {
    return null;
  }
}

export async function signMessage(message) {
  if (!wallet) throw new Error("No wallet configured");
  return wallet.signMessage(message);
}

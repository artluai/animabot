import { ethers } from "ethers";
import "dotenv/config";

export const wallet = new ethers.Wallet(process.env.BOT_WALLET_PRIVATE_KEY);

export async function getBalance() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(process.env.RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [wallet.address, "latest"],
        id: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    if (data.error || typeof data.result !== "string") return null;

    const bal = BigInt(data.result);
    return parseFloat(ethers.formatEther(bal)).toFixed(4);
  } catch {
    return null;
  }
}

export async function signMessage(message) {
  return wallet.signMessage(message);
}

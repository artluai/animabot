import { ethers } from "ethers";
import "dotenv/config";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
export const wallet = new ethers.Wallet(process.env.BOT_WALLET_PRIVATE_KEY, provider);

export async function getBalance() {
  const bal = await provider.getBalance(wallet.address);
  return parseFloat(ethers.formatEther(bal)).toFixed(4);
}

export async function signMessage(message) {
  return wallet.signMessage(message);
}

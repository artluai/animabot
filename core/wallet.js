import { ethers } from "ethers";
import "dotenv/config";

const MAINNET = ethers.Network.from("mainnet");
let provider = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL, MAINNET, {
      staticNetwork: MAINNET,
    });
  }

  return provider;
}

export const wallet = new ethers.Wallet(process.env.BOT_WALLET_PRIVATE_KEY);

export async function getBalance() {
  try {
    const bal = await getProvider().getBalance(wallet.address);
    return parseFloat(ethers.formatEther(bal)).toFixed(4);
  } catch {
    provider = null;
    return null;
  }
}

export async function signMessage(message) {
  return wallet.signMessage(message);
}

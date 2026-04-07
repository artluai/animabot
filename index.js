import { runMigrations } from "./core/db.js";
import { botStatus, log } from "./core/status.js";
import { wallet } from "./core/wallet.js";
import { startMatrix } from "./adapters/matrix.js";
import { startReflectionCron } from "./core/reflection.js";
import "./server.js";

async function main() {
  log("INFO", "Animabot starting...");

  await runMigrations();

  botStatus.wallet.address = wallet.address;
  log("OK", `Wallet: ${wallet.address}`);

  // Start enabled adapters
  await startMatrix();

  // Daily reflection cron
  startReflectionCron();

  log("OK", "Animabot running");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

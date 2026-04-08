import { runMigrations } from "./core/db.js";
import { botStatus, log } from "./core/status.js";
import { wallet } from "./core/wallet.js";
import { startMatrix, setMatrixAvatar } from "./adapters/matrix.js";
import { startReflectionCron } from "./core/reflection.js";
import "./server.js";
import "dotenv/config";

async function main() {
  log("INFO", "Animabot starting...");

  await runMigrations();

  botStatus.wallet.address = wallet?.address;
  log("OK", `Wallet: ${wallet?.address}`);

  await startMatrix();

  // Set avatar after Matrix connects
  if (process.env.BOT_AVATAR_URL) {
    setMatrixAvatar(process.env.BOT_AVATAR_URL).catch(err =>
      log("WARN", `Avatar set failed: ${err.message}`)
    );
  }

  startReflectionCron();

  log("OK", "Animabot running");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});

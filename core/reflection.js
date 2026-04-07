import cron from "node-cron";
import { db } from "./db.js";
import { generateReflection } from "./ai.js";
import { getPersonality, updateEgoNotes } from "./memory.js";
import { botStatus, log } from "./status.js";

export function startReflectionCron() {
  // Runs at 3am every day
  cron.schedule("0 3 * * *", runReflection);
  log("INFO", "Reflection cron scheduled — runs at 3:00am daily");
}

export async function runReflection() {
  log("INFO", "Starting daily reflection...");
  try {
    const { rows: breaches } = await db.query(
      `SELECT * FROM emotional_log WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    const { rows: messages } = await db.query(
      `SELECT role, content FROM messages WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 80`
    );
    const personality = await getPersonality();
    const botName = process.env.BOT_NAME || "Zara";

    const egoNotes = await generateReflection(
      breaches, messages.reverse(),
      personality.system_prompt,
      botName,
      personality.ego_notes
    );

    await updateEgoNotes(egoNotes);
    await db.query(
      `INSERT INTO reflection_log (ego_notes, significant_count, message_count) VALUES ($1,$2,$3)`,
      [egoNotes, breaches.length, messages.length]
    );

    log("INFO", `Reflection complete: "${egoNotes.slice(0, 60)}..."`);
  } catch (err) {
    log("ERROR", `Reflection failed: ${err.message}`);
  }
}

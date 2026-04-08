import cron from "node-cron";
import { db } from "./db.js";
import { generateReflection } from "./ai.js";
import { log } from "./status.js";

export function startReflectionCron() {
  cron.schedule("0 3 * * *", runReflection);
  log("INFO", "Reflection cron scheduled — runs at 3:00am daily");
}

export async function runReflection() {
  log("INFO", "Running daily reflection...");
  try {
    const { rows: breaches } = await db.query(
      `SELECT * FROM emotional_log WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC`
    );
    const { rows: messages } = await db.query(
      `SELECT * FROM messages WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 60`
    );
    const { rows: [p] } = await db.query(`SELECT * FROM personality WHERE id = 1`);

    // Look for tone feedback in recent messages
    const toneFeedback = extractToneFeedback(messages);

    const reflection = await generateReflection(
      breaches,
      messages,
      p.system_prompt || "",
      process.env.BOT_NAME || "Zara",
      p.ego_notes,
      toneFeedback
    );

    const causedBy = buildCausedBy(breaches, toneFeedback);

    await db.query(
      `UPDATE personality SET ego_notes=$1, last_reflection=NOW() WHERE id=1`,
      [reflection]
    );

    await db.query(
      `INSERT INTO reflection_log (ego_notes, significant_count, message_count, caused_by) VALUES ($1,$2,$3,$4)`,
      [reflection, breaches.length, messages.length, causedBy]
    );

    log("OK", `Reflection complete: "${reflection.slice(0, 80)}..."`);
  } catch (err) {
    log("ERROR", `Reflection failed: ${err.message}`);
  }
}

function extractToneFeedback(messages) {
  const feedbackPatterns = [
    /too aggressive/i, /too abrasive/i, /too harsh/i, /chill out/i,
    /relax/i, /calm down/i, /tone it down/i, /soften/i,
    /rude/i, /mean/i, /hostile/i, /condescending/i,
    /more friendly/i, /be nicer/i, /less combative/i,
    /abrasive/i, /intimidating/i, /too intense/i,
  ];

  const feedback = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      for (const pattern of feedbackPatterns) {
        if (pattern.test(msg.content)) {
          feedback.push(msg.content.slice(0, 200));
          break;
        }
      }
    }
  }
  return feedback;
}

function buildCausedBy(breaches, toneFeedback) {
  const parts = [];
  if (breaches.length > 0) {
    const axes = [...new Set(breaches.flatMap(b => b.breached_axes || []))];
    parts.push(`${breaches.length} significant interaction${breaches.length === 1 ? "" : "s"} (${axes.join(", ")})`);
  }
  if (toneFeedback.length > 0) {
    parts.push(`tone feedback from community (${toneFeedback.length} instance${toneFeedback.length === 1 ? "" : "s"})`);
  }
  return parts.length ? parts.join("; ") : null;
}

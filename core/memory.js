import { db } from "./db.js";

export async function getHistory(sessionId, depth = 60) {
  const { rows } = await db.query(
    `SELECT role, content FROM messages
     WHERE session_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [sessionId, depth]
  );
  return rows.reverse();
}

export async function saveMessage(sessionId, role, content) {
  await db.query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)`,
    [sessionId, role, content]
  );
}

export async function getPersonality() {
  const { rows } = await db.query(`SELECT * FROM personality WHERE id = 1`);
  return rows[0];
}

export async function updateEgoNotes(egoNotes) {
  await db.query(
    `UPDATE personality SET ego_notes = $1, last_reflection = NOW() WHERE id = 1`,
    [egoNotes]
  );
}

export async function upsertUser(matrixId, displayName) {
  await db.query(
    `INSERT INTO known_users (matrix_id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (matrix_id) DO UPDATE SET display_name = $2`,
    [matrixId, displayName || matrixId]
  );
}

export async function logSignificantInteraction(sessionId, sender, userMessage, botReply, scores, breachedAxes, reason) {
  await db.query(
    `INSERT INTO emotional_log (session_id, sender, user_message, bot_reply, scores, breached_axes, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sessionId, sender, userMessage, botReply, JSON.stringify(scores), breachedAxes, reason]
  );
}
